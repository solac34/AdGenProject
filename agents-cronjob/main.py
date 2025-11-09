import os
import json
import logging
import asyncio
from datetime import datetime, timezone

import functions_framework
import httpx

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _build_run_url(base_url: str) -> str:
    """
    Normalize target URL to the /run endpoint.
    Accepts either the base service URL or a full /run URL.
    """
    base = (base_url or "").rstrip("/")
    if not base:
        raise ValueError("AGENTS_SERVICE_URL is not set")
    if base.endswith("/run"):
        return base
    return f"{base}/run"


@functions_framework.http
def cronjob(request):
    """
    HTTP-triggered job that calls the Agents service /run endpoint.

    Env vars:
      - AGENTS_SERVICE_URL: Base URL for the Agents service
      - AGENTS_API_TOKEN: Optional API token for Authorization: Bearer
      - AGENTS_PROMPT: Prompt sent to the /run endpoint (default segmentation task)
      - AGENTS_MAX_ROUNDS: Max rounds to request (default 8)
      - REQUEST_TIMEOUT_SECONDS: HTTP timeout in seconds (default 60)
    """
    
    # Health check endpoint
    if request.path == '/health' or request.method == 'GET':
        return (json.dumps({"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}), 
                200, {"Content-Type": "application/json"})
    
    logger.info("🎬 Cronjob started")
    
    # Run the async main logic
    return asyncio.run(cronjob_async(request))


async def cronjob_async(request):
    """
    Async implementation of the cronjob logic
    """
    try:
        logger.info("⚙️ Initializing cronjob configuration...")
        agents_service_url = os.getenv("AGENTS_SERVICE_URL", "https://adgen-agents-710876076445.us-central1.run.app")
        run_url = _build_run_url(agents_service_url)
        logger.info(f"🎯 Target URL: {run_url}")

        # NOTE: Avoid trailing comma (tuple); ensure prompt is a string
        prompt = "Do your segmentation task."
        max_rounds = 8
        token = (os.getenv("AGENTS_API_TOKEN") or "").strip()
        logger.info(f"🔑 API Token configured: {'Yes' if token else 'No'}")

        # Build headers
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        # Generate a deterministic run id for traceability
        run_id = f"cron-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        headers["X-Run-Id"] = run_id
        logger.info(f"🆔 Generated run ID: {run_id}")

        # Prepare webhook configuration for agents service
        webhook_url = os.getenv("WEBHOOK_URL", "")
        webhook_secret = os.getenv("WEBHOOK_SECRET", "")
        logger.info(f"🔔 Webhook URL: {webhook_url or 'Not configured'}")
        
        payload = {
            "prompt": prompt, 
            "max_rounds": max_rounds,
            "run_id": run_id,
        }
        
        # Add webhook info if available
        if webhook_url:
            payload["webhook_url"] = webhook_url
        if webhook_secret:
            payload["webhook_secret"] = webhook_secret
            
        logger.info(f"📝 Initial prompt: '{prompt}' (max_rounds: {max_rounds})")

        # Helper: call Agents /run with given prompt, using same headers/run_id and webhook config
        async def call_agent(run_prompt: str):
            logger.info(f"🚀 Starting API call to {run_url} with prompt: '{run_prompt[:50]}...'")
            body_text = ""
            status_code_inner = 0
            start_time = datetime.now(timezone.utc)
            
            # Build request payload with webhook info
            request_payload = {
                "prompt": run_prompt, 
                "max_rounds": max_rounds,
                "run_id": run_id,
            }
            if webhook_url:
                request_payload["webhook_url"] = webhook_url
            if webhook_secret:
                request_payload["webhook_secret"] = webhook_secret
            
            try:
                async with httpx.AsyncClient(timeout=600.0) as client:
                    logger.info(f"⏳ Sending POST request to agents service...")
                    resp_inner = await client.post(run_url, headers=headers, json=request_payload)
                    body_text = resp_inner.text
                    status_code_inner = resp_inner.status_code
                    
                    duration = (datetime.now(timezone.utc) - start_time).total_seconds()
                    logger.info(f"✅ API call completed in {duration:.2f}s with status code: {status_code_inner}")
                    
                try:
                    parsed = json.loads(body_text)
                    logger.info(f"📄 Response parsed successfully, body size: {len(body_text)} chars")
                except Exception as parse_error:
                    logger.warning(f"⚠️ Failed to parse JSON response: {str(parse_error)}")
                    parsed = {"raw_body": body_text}
                    
                return status_code_inner, parsed
                
            except httpx.TimeoutException:
                duration = (datetime.now(timezone.utc) - start_time).total_seconds()
                logger.error(f"⏰ Request timeout after {duration:.2f}s")
                return 408, {"error": "Request timeout", "raw_body": ""}
            except httpx.RequestError as e:
                duration = (datetime.now(timezone.utc) - start_time).total_seconds()
                logger.error(f"🔌 Request error after {duration:.2f}s: {str(e)}")
                return 500, {"error": f"Request error: {str(e)}", "raw_body": ""}
            except Exception as e:
                duration = (datetime.now(timezone.utc) - start_time).total_seconds()
                logger.error(f"💥 Unexpected error after {duration:.2f}s: {str(e)}")
                return 500, {"error": f"Unexpected error: {str(e)}", "raw_body": ""}

        def extract_status_from_body(resp_body):
            logger.info("🔍 Extracting status from response body...")
            res_obj = {}
            status_val = ""
            
            if isinstance(resp_body, dict):
                logger.info(f"📋 Response is dict with keys: {list(resp_body.keys())}")
                res_obj = resp_body.get("result") or {}
                
                if isinstance(res_obj, dict):
                    status_val = str(res_obj.get("status") or "")
                    logger.info(f"📊 Extracted status from dict result: '{status_val}'")
                elif isinstance(res_obj, str):
                    logger.info("📝 Result is string, attempting to parse as JSON...")
                    try:
                        parsed_res = json.loads(res_obj)
                        status_val = str(parsed_res.get("status") or "")
                        res_obj = parsed_res
                        logger.info(f"📊 Extracted status from parsed string: '{status_val}'")
                    except Exception as e:
                        logger.warning(f"⚠️ Failed to parse result string as JSON: {str(e)}")
                        status_val = ""
                else:
                    logger.warning(f"⚠️ Unexpected result type: {type(res_obj)}")
            else:
                logger.warning(f"⚠️ Response body is not dict, type: {type(resp_body)}")
                
            logger.info(f"🎯 Final extracted status: '{status_val}'")
            return status_val, res_obj

        # Recursively resolve statuses (handles many 'continue' steps safely)
        async def resolve_status_chain(current_status_lower: str, followups_acc: list, depth: int = 0, max_depth: int = 32):
            logger.info(f"🔄 Resolving status chain - Depth: {depth}, Status: '{current_status_lower}'")
            
            if depth >= max_depth:
                logger.warning(f"⚠️ Max follow-up depth ({max_depth}) reached!")
                return {
                    "final_status": current_status_lower,
                    "final_message": "Max follow-up depth reached.",
                    "action": "max_depth_reached",
                }
                
            if current_status_lower == "continue":
                logger.info("🔄 Status is 'continue' - sending continue prompt...")
                continue_prompt = "Continue your segmentation task starting from reading_users_to_segmentate step"
                fu_code, fu_body = await call_agent(continue_prompt)
                fu_status, _ = extract_status_from_body(fu_body)
                fu_status_lower = (fu_status or "").lower().strip()
                
                followups_acc.append({
                    "status_code": fu_code,
                    "request": {"prompt": continue_prompt},
                    "response": fu_body,
                    "extracted_status": fu_status or None,
                })
                logger.info(f"➡️ Continue response received, new status: '{fu_status_lower}'")
                return await resolve_status_chain(fu_status_lower, followups_acc, depth + 1, max_depth)
                
            if current_status_lower == "segmentation_finished":
                logger.info("✅ Segmentation finished - starting content creation task...")
                seg_prompt = "Write location segmentation pairs to firestore and do your content creation task for ecommerce"
                fu_code, fu_body = await call_agent(seg_prompt)
                fu_status, _ = extract_status_from_body(fu_body)
                fu_status_lower = (fu_status or "").lower().strip()
                
                followups_acc.append({
                    "status_code": fu_code,
                    "request": {"prompt": seg_prompt},
                    "response": fu_body,
                    "extracted_status": fu_status or None,
                })
                logger.info(f"➡️ Content creation response received, new status: '{fu_status_lower}'")
                # After segmentation finished, continue resolving until terminal
                return await resolve_status_chain(fu_status_lower, followups_acc, depth + 1, max_depth)
                
            if current_status_lower in ("flow_finished", "finished"):
                logger.info("🎉 Flow completed successfully - both segmentation and marketing images done!")
                return {
                    "final_status": current_status_lower,
                    "final_message": "Current flow completed: both segmentations and marketing images are done.",
                    "action": "final_flow_finished",
                }
                
            if current_status_lower in ("not_pending", "no_pending_users", "no_pending", "no_users_pending", "not pending"):
                logger.info("ℹ️ No pending users to process - flow ended normally")
                return {
                    "final_status": current_status_lower,
                    "final_message": "Flow ended: no new users to process.",
                    "action": "final_no_new_users",
                }
                
            logger.warning(f"❓ Unrecognized status: '{current_status_lower}' - no action taken")
            return {
                "final_status": current_status_lower,
                "final_message": None,
                "action": "no_action_unrecognized_status",
            }

        # First call
        logger.info(f"🎯 Starting initial segmentation task with run_id: {run_id}")
        status_code, body = await call_agent(prompt)

        # Extract status safely
        status_value, result_obj = extract_status_from_body(body)
        status_lower = status_value.lower().strip()
        logger.info(f"🔍 Initial call completed with status: '{status_value}' (normalized: '{status_lower}')")

        followups = []
        logger.info("🔄 Starting status chain resolution...")
        resolution = await resolve_status_chain(status_lower, followups, 0, 32)
        logger.info(f"✅ Status chain resolved with final action: '{resolution.get('action')}'")
        logger.info(f"🏁 Final status: '{resolution.get('final_status')}' - {resolution.get('final_message')}")

        # Build status chain for visibility
        status_chain = []
        if status_value:
            status_chain.append(status_value)
        for step in followups:
            if step.get("extracted_status"):
                status_chain.append(step["extracted_status"])

        logger.info(f"📊 Building final result - Status chain: {status_chain}")
        logger.info(f"📈 Total followup calls made: {len(followups)}")
        
        result = {
            "ok": 200 <= status_code < 300,
            "status_code": status_code,
            "run_id": run_id,
            "target": run_url,
            "response": body,
            "status": status_value or None,
            "action": resolution.get("action"),
            "final_status": resolution.get("final_status"),
            "final_message": resolution.get("final_message"),
            "followups": followups,
            "status_chain": status_chain or None,
        }
        
        logger.info(f"🎉 Cronjob completed successfully! Final result: OK={result['ok']}, Action={result['action']}")
        return (json.dumps(result), status_code, {"Content-Type": "application/json"})

    except Exception as e:
        logger.error(f"Cronjob failed with error: {str(e)}", exc_info=True)
        error_body = {
            "ok": False,
            "error": str(e),
        }
        return (json.dumps(error_body), 500, {"Content-Type": "application/json"})


