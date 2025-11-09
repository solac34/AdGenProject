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
        run_url = _build_run_url("https://adgen-agents-710876076445.us-central1.run.app") # url is agents url

        prompt = "Do your segmentation task.",
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

        with httpx.Client(timeout=600.0) as client:
            response = client.post(run_url, headers=headers, json=payload)
            text = response.text
            status_code = response.status_code

        # Try to parse response; include raw body if not JSON
        try:
            body = response.json()
        except Exception:
            body = {"raw_body": text}

        result = {
            "ok": 200 <= status_code < 300,
            "status_code": status_code,
            "run_id": run_id,
            "target": run_url,
            "response": body,
        }
        return (json.dumps(result), status_code, {"Content-Type": "application/json"})

    except Exception as e:
        error_body = {
            "ok": False,
            "error": str(e),
        }
        return (json.dumps(error_body), 500, {"Content-Type": "application/json"})


