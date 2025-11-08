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
from google.genai import types

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

print(f"🤖 Root Agent loaded: {root_agent.name}")
print(f"📊 Sub-agents: {[agent.name for agent in root_agent.sub_agents]}")

# Create Flask app
app = Flask(__name__)

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


async def run_agent_with_rollover(prompt: str, max_rounds: int = 8) -> dict:
    """
    Run the master agent with session rollover.
    Uses agent cloning for fresh sessions to avoid context pollution.
    """
    rounds = 0
    agent_instance = root_agent
    current_prompt = prompt
    statuses = []
    last_result = None

    while True:
        rounds += 1
        logger.info(f"🔄 Agent round {rounds}/{max_rounds}")
        
        # Create fresh session for each round
        session_id = f"http-{uuid.uuid4().hex[:8]}"
        user_id = "http-user"
        logger.info(f"Round {rounds} session_id={session_id}")
        last_text: Optional[str] = None
        
        try:
            async with InMemoryRunner(agent=agent_instance, app_name="agents") as runner:
                new_message = types.Content(parts=[types.Part(text=current_prompt)], role="user")
                
                # Create session
                await runner.session_service.create_session(
                    app_name=runner.app_name,
                    user_id=user_id,
                    session_id=session_id
                )
                
                # Run agent
                async for event in runner.run_async(
                    user_id=user_id,
                    session_id=session_id,
                    new_message=new_message,
                ):
                    # Capture agent response
                    if event.content and event.content.parts:
                        for part in event.content.parts:
                            if getattr(part, "text", None):
                                last_text = part.text
        
        except Exception as e:
            logger.error(f"❌ Error in round {rounds}: {e}", exc_info=True)
            return {
                "error": str(e),
                "rounds": rounds,
                "statuses": statuses,
                "success": False
            }
        
        # Parse result
        try:
            last_result = json.loads(last_text) if last_text else None
        except Exception:
            last_result = last_text
        
        status = extract_status(last_result) or ""
        if status:
            statuses.append(status)
        
        logger.info(f"✅ Round {rounds} completed. Status: {status or 'n/a'}")
        
        # Check if we should continue
        if status.lower() == "continue" and rounds < max_rounds:
            # Create a fresh session by cloning the agent tree to avoid parent re-attach errors
            try:
                agent_instance = agent_instance.clone()
                logger.info(f"🔄 Agent cloned for round {rounds + 1}")
            except Exception as e:
                logger.warning(f"⚠️ Failed to clone agent; falling back to root_agent. err={e}")
                agent_instance = getattr(root_agent, "clone", lambda: root_agent)()
            
            # Keep the continuation prompt precise to avoid extra model calls
            current_prompt = (
                'Continue the user segmentation task. '
                'Start by calling read_users_to_segmentate. If it returns status="no_pending_users", '
                'IMMEDIATELY return {"status":"finished"} with no further calls. '
                'Process up to 5 pending users by calling write_user_segmentation_result for each. '
                'Then decide: let remaining = pending_total - 5. '
                'If remaining > 0 return {"status":"continue"} else return {"status":"finished"}. '
                'Return only the minimal JSON. Do not produce any extra text.'
            )
            continue
        
        break
    
    return {
        "result": last_result,
        "rounds": rounds,
        "statuses": statuses,
        "success": True
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
        
        logger.info(f"📥 Received request: prompt='{prompt[:50]}...', max_rounds={max_rounds}")
        
        # Run agent asynchronously
        result = asyncio.run(run_agent_with_rollover(prompt, max_rounds))
        
        logger.info(f"📤 Request completed: rounds={result.get('rounds')}, success={result.get('success')}")
        
        return jsonify(result), 200
        
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
