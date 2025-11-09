import os
import time
from typing import Any, Dict, Optional

import requests


def report_progress(
    *,
    run_id: str,
    agent: str,
    status: str,
    message: str = "",
    step: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
    timeout: float = 5.0,
) -> bool:
    """
    Send a progress event to the WebApp webhook. 
    Non-blocking best-effort; failures are swallowed.
    """
    # Read env vars dynamically so they can be updated at runtime
    webhook_url = os.getenv("WEBHOOK_URL")
    webhook_secret = os.getenv("WEBHOOK_SECRET")
    
    # Default to AdGen-WebApp if not configured
    if not webhook_url:
        # Try to determine the webapp URL dynamically
        webapp_base = os.getenv("WEBAPP_URL", "https://adgen-webapp-710876076445.us-central1.run.app")
        webhook_url = f"{webapp_base}/api/agent-events"
    
    if not webhook_secret:
        webhook_secret = os.getenv("WEBHOOK_SECRET", "your-webhook-secret-here")
        print(f"⚠️ Using default webhook secret. Set WEBHOOK_SECRET env var for security.")
    
    payload = {
        "runId": run_id,
        "agent": agent,
        "status": status,
        "message": message,
        "step": step,
        "meta": meta or None,
        "timestamp": int(time.time() * 1000),
    }
    headers = {
        "Content-Type": "application/json",
        "x-webhook-secret": webhook_secret,
        "User-Agent": "AdGen-Agents/1.0"
    }
    
    try:
        response = requests.post(webhook_url, json=payload, headers=headers, timeout=timeout)
        
        if response.status_code == 200:
            print(f"✅ WEBHOOK SUCCESS: {run_id} {agent} {status} {message}")
            return True
        else:
            print(f"⚠️ WEBHOOK ERROR {response.status_code}: {run_id} {agent} {status}")
            return False
            
    except requests.exceptions.Timeout:
        print(f"⏰ WEBHOOK TIMEOUT: {run_id} {agent} {status}")
        return False
    except requests.exceptions.ConnectionError:
        print(f"🔌 WEBHOOK CONNECTION ERROR: {run_id} {agent} {status}")
        return False
    except Exception as e:
        print(f"❌ WEBHOOK UNKNOWN ERROR: {run_id} {agent} {status} - {str(e)}")
        return False


