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
    
    if not webhook_url or not webhook_secret:
        return False
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
    }
    try:
        requests.post(webhook_url, json=payload, headers=headers, timeout=timeout)
        print(f"🛑🛑🛑 WEBHOOK REPORTED: {run_id} {agent} {status} {message} {step}")

        return True
    except Exception:
        return False


