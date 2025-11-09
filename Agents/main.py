#!/usr/bin/env python3
"""
Cloud Run HTTP server for AdGen Agents.
Receives HTTP requests and runs the MasterAgent using InMemoryRunner.
"""

import os
import sys
import json
import logging
import uuid
import asyncio
from pathlib import Path
from typing import Optional
from flask import Flask, request, jsonify

# Add current directory to path
CURRENT_DIR = Path(__file__).parent
sys.path.insert(0, str(CURRENT_DIR))

# Load .env if present (for local testing)
try:
    from dotenv import load_dotenv, find_dotenv
    load_dotenv(find_dotenv(), override=False)
except Exception:
    pass

# Setup environment for Cloud Run
def setup_environment():
    """Configure environment for Cloud Run deployment."""
    # Set defaults
    if not os.getenv('GOOGLE_CLOUD_PROJECT'):
        print("⚠️ Warning: GOOGLE_CLOUD_PROJECT not set")
    
    os.environ.setdefault('GOOGLE_CLOUD_LOCATION', 'us-central1')
    os.environ.setdefault('GOOGLE_GENAI_USE_VERTEXAI', 'True')
    
    # Clear invalid credential paths (Cloud Run uses default service account)
    credential_vars = [
        'GOOGLE_APPLICATION_CREDENTIALS',
        'GOOGLE_APPLICATION_CREDENTIALS_AI', 
        'GOOGLE_APPLICATION_CREDENTIALS_BQ',
        'BQ_KEYFILE'
    ]
    
    for var in credential_vars:
        if var in os.environ:
            creds_path = os.environ[var]
            if not os.path.exists(creds_path):
                print(f"⚠️ Removing invalid {var} from environment")
                del os.environ[var]
    
    # Use Cloud Run's default service account
    is_cloud_run = os.getenv('K_SERVICE') is not None
    if is_cloud_run:
        print("🔐 Cloud Run detected - using default service account (ADC)")
        for var in credential_vars:
            if var in os.environ:
                del os.environ[var]
    
    # Set project variables for ADC
    project_id = os.getenv('GOOGLE_CLOUD_PROJECT')
    if project_id:
        os.environ['GCLOUD_PROJECT'] = project_id
        os.environ['GCP_PROJECT'] = project_id
        os.environ['GCP_PROJECT_ID'] = project_id
    
    print(f"🚀 AdGen Agents HTTP Server")
    print(f"📍 Project: {os.getenv('GOOGLE_CLOUD_PROJECT', 'Not set')}")
    print(f"🌍 Location: {os.getenv('GOOGLE_CLOUD_LOCATION', 'Not set')}")
    print(f"🤖 Vertex AI: {os.getenv('GOOGLE_GENAI_USE_VERTEXAI', 'False')}")

setup_environment()

# Import agent after environment setup
from MasterAgent.agent import root_agent
from google.adk.runners import InMemoryRunner
from google.adk.agents.run_config import RunConfig
from google.genai import types
from google.genai.errors import ClientError  # type: ignore
from webhook import report_progress

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

print(f"🤖 Root Agent loaded: {root_agent.name}")
print(f"📊 Sub-agents: {[agent.name for agent in root_agent.sub_agents]}")

# Create Flask app
app = Flask(__name__)

def _is_authorized(req) -> bool:
    """Simple API token check. If AGENTS_API_TOKEN is unset, allow all."""
    expected = os.getenv("AGENTS_API_TOKEN", "").strip()
    if not expected:
        return True
    # Support either Authorization: Bearer <token> or X-Api-Key header
    auth = req.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[len("Bearer "):].strip()
        if token and token == expected:
            return True
    api_key = req.headers.get("X-Api-Key") or req.headers.get("X-API-Key")
    if api_key and api_key.strip() == expected:
        return True
    return False

def extract_status(obj) -> Optional[str]:
    """Extract status from agent result."""
    try:
        if isinstance(obj, dict) and "status" in obj:
            return str(obj.get("status"))
        if isinstance(obj, str):
            parsed = json.loads(obj)
            if isinstance(parsed, dict) and "status" in parsed:
                return str(parsed.get("status"))
    except Exception:
        return None
    return None


def _wrap_segmentation_prompt(user_prompt: str) -> str:
    """
    Add strict guard-rails for the segmentation phase so the agent does only the needed calls
    and returns a minimal JSON status.
    """
    return (
        "You are the MasterAgent coordinating a segmentation workflow.\n"
        "Follow these strict rules:\n"
        "1) First, call read_users_to_segmentate. If it returns status='no_pending_users', "
        "IMMEDIATELY return {\"status\":\"segmentation_finished\"}.\n"
        "2) Otherwise, process up to 5 users by calling write_user_segmentation_result for each.\n"
        "3) Do NOT call retrieve_user_activity_counts, compare_event_counts, or write_user_activity_to_firestore in this phase.\n"
        "4) Let remaining = pending_total - processed_count. "
        "If remaining > 0 then return {\"status\":\"continue\"} else return {\"status\":\"segmentation_finished\"}.\n"
        "Output ONLY the minimal JSON object with the status. No extra words.\n\n"
        f"Task: {user_prompt}"
    )

def _wrap_creative_prompt(user_prompt: str) -> str:
    """
    Guard-rails for the creative/content phase, ensuring it writes outputs and terminates.
    """
    return (
        "You are now in the CREATIVE CONTENT phase for ecommerce marketing.\n"
        "Follow this exact plan with the listed tools and then STOP:\n"
        "STEP 1 — DATA PREP (DataAnalyticAgent):\n"
        "  • Call write_segmentation_location_pairs_to_firestore() to upsert\n"
        "    'segmentations/<segmentation>_<city>_<country>' docs (imageUrl may be empty).\n"
        "STEP 2 — CONTENT QUEUE (CreativeAgent):\n"
        "  • Call read_segmentations_to_generate() to fetch items with empty imageUrl.\n"
        "STEP 3 — GENERATION (CreativeAgent):\n"
        "  • For EACH returned item, generate ONE marketing image via create_marketing_image()\n"
        "    using a 16:9 aspect ratio and 1024 size (or defaults in the tool), passing a meaningful\n"
        "    name (e.g. '<segmentation>_<city>_<country>').\n"
        "  • If the batch variant is used, ensure doc_id/name is preserved so the image URL is written\n"
        "    back to Firestore under 'segmentations/<doc_id>.imageUrl'.\n"
        "CONSTRAINTS:\n"
        "  • Do not run extra analytics in this phase. Focus only on the steps above.\n"
        "  • Save outputs to Google Cloud Storage using provided tools.\n"
        "FINAL RETURN (STRICT):\n"
        "  • After you finish generating images for all pending items, return ONLY:\n"
        "      {\"status\":\"flow_finished\"}\n"
        "  • On fatal error, return ONLY: {\"status\":\"failed\"}\n\n"
        f"Task: {user_prompt}"
    )


async def run_agent_with_rollover(prompt: str, max_rounds: int = 8, run_id: Optional[str] = None, prefer_api: bool = False) -> dict:
    """
    Run the master agent with session rollover.
    Uses agent cloning for fresh sessions to avoid context pollution.
    """
    run_id = run_id or f"http-{uuid.uuid4().hex[:8]}"
    report_progress(run_id=run_id, agent="MasterAgent", status="started", message="Run started")
    rounds = 0
    agent_instance = root_agent
    current_prompt = prompt
    statuses = []
    last_result = None
    # Propagate run id to tools via environment so they can report progress
    os.environ["AGENTS_CURRENT_RUN_ID"] = run_id

    while True:
        rounds += 1
        logger.info(f"🔄 Agent round {rounds}/{max_rounds}")
        report_progress(run_id=run_id, agent="MasterAgent", status="progress", message=f"Round {rounds} started", step=str(rounds))
        logger.info(f"🟧🟧🟧 REPORTING PROGRESS TEST")
        
        # Create fresh session for each round (high-entropy to avoid colisions)
        session_id = f"http-{(run_id or 'rnd')[:8]}-{rounds}-{uuid.uuid4().hex[:6]}"
        user_id = "http-user"
        logger.info(f"Round {rounds} session_id={session_id}")
        last_text: Optional[str] = None
        
        # Prefer Google AI API (API key) for segmentation bursts to reduce Vertex 429s,
        # but keep Vertex for content creation (Imagen).
        original_project = None
        original_location = None
        lower_prompt = (current_prompt or "").lower()
        is_content_task = any(
            key in lower_prompt
            for key in [
                "content creation",
                "create content",
                "marketing image",
                "create_marketing_image",
                "imagen",
            ]
        )
        # Prefer Google AI API (API key) when requested or for non-content tasks
        if prefer_api or not is_content_task:
            original_project = os.environ.pop("GOOGLE_CLOUD_PROJECT", None)
            original_location = os.environ.pop("GOOGLE_CLOUD_LOCATION", None)
            if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
                os.environ["GOOGLE_GENAI_API_KEY"] = os.environ["GOOGLE_API_KEY"]

        async def _run_once() -> Optional[str]:
            nonlocal session_id
            txt: Optional[str] = None
            async with InMemoryRunner(agent=agent_instance, app_name="agents") as runner:
                # Build guarded prompt based on phase
                eff_prompt = _wrap_creative_prompt(current_prompt) if is_content_task else _wrap_segmentation_prompt(current_prompt)
                logger.info(f"🧭 Using prompt wrapper: {'creative' if is_content_task else 'segmentation'}")
                new_message = types.Content(parts=[types.Part(text=eff_prompt)], role="user")
                # Ensure session exists
                await runner.session_service.create_session(
                    app_name=runner.app_name,
                    user_id=user_id,
                    session_id=session_id
                )
                try:
                    async for event in runner.run_async(
                        user_id=user_id,
                        session_id=session_id,
                        new_message=new_message,
                        run_config=RunConfig(max_llm_calls=30),
                    ):
                        if event.content and event.content.parts:
                            for part in event.content.parts:
                                if getattr(part, "text", None):
                                    if part.text:
                                        txt = part.text
                finally:
                    # Best-effort session cleanup
                    try:
                        await runner.session_service.delete_session(
                            app_name=runner.app_name,
                            user_id=user_id,
                            session_id=session_id
                        )
                    except Exception:
                        pass
            return txt
        
        # Try once; if Vertex rate limits (429) and we weren't already preferring API, retry once via API key
        try:
            last_text = await _run_once()
        except ClientError as ce:  # type: ignore
            if getattr(ce, "status_code", None) == 429 and not (prefer_api or is_content_task):
                logger.warning("Vertex 429 Resource exhausted. Retrying this round with API key path.")
                # Temporarily drop Vertex hints and map API key
                tmp_project = os.environ.pop("GOOGLE_CLOUD_PROJECT", None)
                tmp_location = os.environ.pop("GOOGLE_CLOUD_LOCATION", None)
                if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
                    os.environ["GOOGLE_GENAI_API_KEY"] = os.getenv("GOOGLE_API_KEY", "")
                try:
                    last_text = await _run_once()
                finally:
                    # Restore original env to avoid impacting next rounds
                    if tmp_project is not None:
                        os.environ["GOOGLE_CLOUD_PROJECT"] = tmp_project
                    if tmp_location is not None:
                        os.environ["GOOGLE_CLOUD_LOCATION"] = tmp_location
            else:
                logger.error(f"❌ Error in round {rounds}: {ce}", exc_info=True)
                report_progress(run_id=run_id, agent="MasterAgent", status="error", message=str(ce), step=str(rounds))
                return {
                    "error": str(ce),
                    "rounds": rounds,
                    "statuses": statuses,
                    "success": False
                }
        except Exception as e:
            logger.error(f"❌ Error in round {rounds}: {e}", exc_info=True)
            report_progress(run_id=run_id, agent="MasterAgent", status="error", message=str(e), step=str(rounds))
            return {
                "error": str(e),
                "rounds": rounds,
                "statuses": statuses,
                "success": False
            }
        finally:
            # Restore Vertex env hints if we had temporarily removed them
            if original_project is not None:
                os.environ["GOOGLE_CLOUD_PROJECT"] = original_project
            if original_location is not None:
                os.environ["GOOGLE_CLOUD_LOCATION"] = original_location
        
        # Parse result
        try:
            last_result = json.loads(last_text) if last_text else None
        except Exception:
            last_result = last_text
        
        status = extract_status(last_result) or ""
        if status:
            statuses.append(status)
        
        logger.info(f"✅ Round {rounds} completed. Status: {status or 'n/a'}")
        report_progress(run_id=run_id, agent="MasterAgent", status=status or "progress", message=f"Round {rounds} completed", step=str(rounds))
        
        # Check if we should continue
        if status.lower() == "continue" and rounds < max_rounds:
            # Create a fresh session by cloning the agent tree to avoid parent re-attach errors
            try:
                agent_instance = agent_instance.clone()
                logger.info(f"🔄 Agent cloned for round {rounds + 1}")
            except Exception as e:
                logger.warning(f"⚠️ Failed to clone agent; falling back to root_agent. err={e}")
                agent_instance = getattr(root_agent, "clone", lambda: root_agent)()
            
            # Keep the continuation prompt concise with the same guard-rails
            current_prompt = "Continue segmentation from the last point."
            continue
        
        break
    
    return {
        "result": last_result,
        "rounds": rounds,
        "statuses": statuses,
        "success": True,
        "run_id": run_id
    }


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "adgen-agents",
        "agent": root_agent.name
    })


@app.route('/run', methods=['POST'])
def run_agent():
    """
    Main endpoint to run the agent.
    
    Request body:
    {
        "prompt": "Your prompt here",
        "max_rounds": 8  // optional, default 8
    }
    
    Response:
    {
        "result": {...},  // agent's final output
        "rounds": 3,      // number of rounds executed
        "statuses": ["continue", "continue", "finished"],
        "success": true
    }
    """
    try:
        if not _is_authorized(request):
            return jsonify({"error": "unauthorized"}), 401

        data = request.get_json()
        
        if not data or 'prompt' not in data:
            return jsonify({
                "error": "Missing 'prompt' in request body",
                "example": {
                    "prompt": "Do your segmentation task.",
                    "max_rounds": 8
                }
            }), 400
        
        prompt = data['prompt']
        max_rounds = data.get('max_rounds', 8)
        run_id = data.get('run_id') or request.headers.get('X-Run-Id') or f"http-{uuid.uuid4().hex[:8]}"
        # Prefer API flag can be passed via JSON or header
        prefer_api = False
        try:
            prefer_api = bool(data.get('prefer_api'))
        except Exception:
            prefer_api = False
        header_prefer = (request.headers.get('X-Prefer-Api') or "").strip().lower()
        if header_prefer in ("1", "true", "yes"):
            prefer_api = True
        
        # Set webhook environment variables if provided in request
        webhook_url = data.get('webhook_url')
        webhook_secret = data.get('webhook_secret')
        if webhook_url:
            os.environ['WEBHOOK_URL'] = webhook_url
            logger.info(f"🔔 Webhook URL set: {webhook_url}")
        if webhook_secret:
            os.environ['WEBHOOK_SECRET'] = webhook_secret
            logger.info(f"🔑 Webhook secret configured")
        
        logger.info(f"📥 Received request: prompt='{prompt[:50]}...', max_rounds={max_rounds}, run_id={run_id}, prefer_api={prefer_api}")
        
        # Helper to parse status safely
        def _extract_status_from_result(res_obj) -> str:
            try:
                if isinstance(res_obj, dict):
                    status_val = str(res_obj.get("status") or "")
                    return status_val
                if isinstance(res_obj, str):
                    parsed = json.loads(res_obj)
                    if isinstance(parsed, dict):
                        return str(parsed.get("status") or "")
            except Exception:
                return ""
            return ""
        
        # First run
        logger.info(f"🚀 Starting primary run (prefer_api={prefer_api})")
        result = asyncio.run(run_agent_with_rollover(prompt, max_rounds, run_id=run_id, prefer_api=prefer_api))
        logger.info(f"📤 Primary run completed: rounds={result.get('rounds')}, success={result.get('success')}")
        
        statuses = list(result.get("statuses") or [])
        last_status = _extract_status_from_result(result.get("result"))
        followups: list[dict] = []
        logger.info(f"🔎 Extracted status='{last_status or 'n/a'}' from primary run")
        
        # Resolve follow-ups similarly to cronjob: continue -> continue prompt; segmentation_finished -> creative prompt
        max_depth = 8
        depth = 0
        while depth < max_depth:
            s = (last_status or "").strip().lower()
            if not s:
                break
            if s == "continue":
                depth += 1
                cont_prompt = "Continue your segmentation task starting from reading_users_to_segmentate step"
                logger.info(f"🔄 Follow-up {depth}: sending continue prompt")
                fu = asyncio.run(run_agent_with_rollover(cont_prompt, max_rounds=4, run_id=run_id, prefer_api=True))
                followups.append({"prompt": cont_prompt, "result": fu.get("result"), "rounds": fu.get("rounds")})
                statuses.extend(fu.get("statuses") or [])
                last_status = _extract_status_from_result(fu.get("result"))
                logger.info(f"🔎 Follow-up {depth} status='{last_status or 'n/a'}'")
                continue
            if s == "segmentation_finished":
                depth += 1
                creative_prompt = "Write location segmentation pairs to firestore and do your content creation task for ecommerce"
                logger.info(f"🎨 Triggering creative content step (follow-up {depth})")
                report_progress(run_id=run_id, agent="MasterAgent", status="progress", message="Starting creative content step", step=f"creative_{depth}")
                fu = asyncio.run(run_agent_with_rollover(creative_prompt, max_rounds=4, run_id=run_id, prefer_api=False))
                followups.append({"prompt": creative_prompt, "result": fu.get("result"), "rounds": fu.get("rounds")})
                statuses.extend(fu.get("statuses") or [])
                last_status = _extract_status_from_result(fu.get("result"))
                logger.info(f"🖼️ Creative step status='{last_status or 'n/a'}'")
                # Continue resolving until terminal
                continue
            # Terminal statuses
            if s in ("flow_finished", "finished", "error", "failed", "no_pending", "no_pending_users"):
                break
            # Unrecognized -> stop
            break
        
        final = {
            **result,
            "followups": followups,
            "statuses": statuses,
            "final_status": last_status or None,
        }
        report_progress(run_id=run_id, agent="MasterAgent", status="completed", message="Run completed")
        return jsonify(final), 200
        
    except Exception as e:
        logger.error(f"❌ Error processing request: {e}", exc_info=True)
        return jsonify({
            "error": str(e),
            "success": False
        }), 500


@app.route('/pubsub/push', methods=['POST'])
def pubsub_push():
    """
    Pub/Sub push endpoint for async job triggers.
    
    Expected Pub/Sub message format:
    {
        "message": {
            "data": "<base64-encoded-json>",
            "attributes": {...}
        }
    }
    """
    try:
        envelope = request.get_json()
        if not envelope:
            return jsonify({"error": "No Pub/Sub message received"}), 400
        
        # Decode Pub/Sub message
        import base64
        message = envelope.get('message', {})
        data_bytes = message.get('data', '')
        
        if data_bytes:
            decoded = base64.b64decode(data_bytes).decode('utf-8')
            payload = json.loads(decoded)
        else:
            payload = message.get('attributes', {})
        
        prompt = payload.get('prompt', 'Do your segmentation task.')
        max_rounds = payload.get('max_rounds', 8)
        
        logger.info(f"🔔 Pub/Sub trigger received: prompt='{prompt[:50]}...'")
        
        # Run agent asynchronously
        result = asyncio.run(run_agent_with_rollover(prompt, max_rounds))
        
        logger.info(f"✅ Pub/Sub job completed: rounds={result.get('rounds')}")
        
        # For Pub/Sub, we just need to return 200 OK
        return '', 204
        
    except Exception as e:
        logger.error(f"❌ Error processing Pub/Sub message: {e}", exc_info=True)
        # Return 200 to acknowledge receipt (prevents retries for permanent failures)
        return '', 200


@app.route('/', methods=['GET'])
def index():
    """Root endpoint with API documentation."""
    return jsonify({
        "service": "AdGen Agents HTTP API",
        "agent": root_agent.name,
        "endpoints": {
            "/health": {
                "method": "GET",
                "description": "Health check"
            },
            "/run": {
                "method": "POST",
                "description": "Run agent with prompt",
                "body": {
                    "prompt": "string (required)",
                    "max_rounds": "number (optional, default 8)"
                }
            },
            "/pubsub/push": {
                "method": "POST",
                "description": "Pub/Sub push endpoint for async triggers"
            }
        },
        "example": {
            "curl": 'curl -X POST https://your-service.run.app/run -H "Content-Type: application/json" -d \'{"prompt": "Do your segmentation task."}\'',
            "postman": {
                "url": "https://your-service.run.app/run",
                "method": "POST",
                "headers": {"Content-Type": "application/json"},
                "body": {"prompt": "Do your segmentation task.", "max_rounds": 8}
            }
        }
    })


if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    print(f"🚀 Starting server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
