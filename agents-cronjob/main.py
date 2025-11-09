import os
import json
from datetime import datetime, timezone

import functions_framework
import httpx


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

    try:
        agents_service_url = os.getenv("AGENTS_SERVICE_URL", "https://adgen-agents-710876076445.us-central1.run.app")
        run_url = _build_run_url(agents_service_url)

        # NOTE: Avoid trailing comma (tuple); ensure prompt is a string
        prompt = "Do your segmentation task."
        max_rounds = 8
        token = (os.getenv("AGENTS_API_TOKEN") or "").strip()

        # Build headers
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        # Generate a deterministic run id for traceability
        run_id = f"cron-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        headers["X-Run-Id"] = run_id

        payload = {"prompt": prompt, "max_rounds": max_rounds}

        # Helper: call Agents /run with given prompt, using same headers/run_id
        def call_agent(run_prompt: str):
            body_text = ""
            status_code_inner = 0
            with httpx.Client(timeout=600.0) as client:
                resp_inner = client.post(run_url, headers=headers, json={"prompt": run_prompt, "max_rounds": max_rounds})
                body_text = resp_inner.text
                status_code_inner = resp_inner.status_code
            try:
                parsed = json.loads(body_text)
            except Exception:
                parsed = {"raw_body": body_text}
            return status_code_inner, parsed

        def extract_status_from_body(resp_body):
            res_obj = {}
            status_val = ""
            if isinstance(resp_body, dict):
                res_obj = resp_body.get("result") or {}
                if isinstance(res_obj, dict):
                    status_val = str(res_obj.get("status") or "")
                elif isinstance(res_obj, str):
                    try:
                        parsed_res = json.loads(res_obj)
                        status_val = str(parsed_res.get("status") or "")
                        res_obj = parsed_res
                    except Exception:
                        status_val = ""
            return status_val, res_obj

        # Recursively resolve statuses (handles many 'continue' steps safely)
        def resolve_status_chain(current_status_lower: str, followups_acc: list, depth: int = 0, max_depth: int = 32):
            if depth >= max_depth:
                return {
                    "final_status": current_status_lower,
                    "final_message": "Max follow-up depth reached.",
                    "action": "max_depth_reached",
                }
            if current_status_lower == "continue":
                continue_prompt = "Continue your segmentation task starting from reading_users_to_segmentate step"
                fu_code, fu_body = call_agent(continue_prompt)
                fu_status, _ = extract_status_from_body(fu_body)
                fu_status_lower = (fu_status or "").lower().strip()
                followups_acc.append({
                    "status_code": fu_code,
                    "request": {"prompt": continue_prompt},
                    "response": fu_body,
                    "extracted_status": fu_status or None,
                })
                return resolve_status_chain(fu_status_lower, followups_acc, depth + 1, max_depth)
            if current_status_lower == "segmentation_finished":
                seg_prompt = "Write location segmentation pairs to firestore and do your content creation task for ecommerce"
                fu_code, fu_body = call_agent(seg_prompt)
                fu_status, _ = extract_status_from_body(fu_body)
                fu_status_lower = (fu_status or "").lower().strip()
                followups_acc.append({
                    "status_code": fu_code,
                    "request": {"prompt": seg_prompt},
                    "response": fu_body,
                    "extracted_status": fu_status or None,
                })
                # After segmentation finished, continue resolving until terminal
                return resolve_status_chain(fu_status_lower, followups_acc, depth + 1, max_depth)
            if current_status_lower in ("flow_finished", "finished"):
                return {
                    "final_status": current_status_lower,
                    "final_message": "Current flow completed: both segmentations and marketing images are done.",
                    "action": "final_flow_finished",
                }
            if current_status_lower in ("not_pending", "no_pending_users", "no_pending", "no_users_pending", "not pending"):
                return {
                    "final_status": current_status_lower,
                    "final_message": "Flow ended: no new users to process.",
                    "action": "final_no_new_users",
                }
            return {
                "final_status": current_status_lower,
                "final_message": None,
                "action": "no_action_unrecognized_status",
            }

        # First call
        status_code, body = call_agent(prompt)

        # Extract status safely
        status_value, result_obj = extract_status_from_body(body)
        status_lower = status_value.lower().strip()

        followups = []
        resolution = resolve_status_chain(status_lower, followups, 0, 32)

        # Build status chain for visibility
        status_chain = []
        if status_value:
            status_chain.append(status_value)
        for step in followups:
            if step.get("extracted_status"):
                status_chain.append(step["extracted_status"])

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
        return (json.dumps(result), status_code, {"Content-Type": "application/json"})

    except Exception as e:
        error_body = {
            "ok": False,
            "error": str(e),
        }
        return (json.dumps(error_body), 500, {"Content-Type": "application/json"})


