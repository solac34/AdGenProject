import os
import time
from typing import Any, Dict, Optional

import requests

WEBHOOK_URL = os.getenv("WEBHOOK_URL")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")


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
    if not WEBHOOK_URL or not WEBHOOK_SECRET:
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
        "x-webhook-secret": WEBHOOK_SECRET,
    }
    try:
        requests.post(WEBHOOK_URL, json=payload, headers=headers, timeout=timeout)
        print(f"🛑🛑🛑 WEBHOOK REPORTED: {run_id} {agent} {status} {message} {step}")

        return True
    except Exception:
        return False


