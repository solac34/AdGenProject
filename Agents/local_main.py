#!/usr/bin/env python3
"""
Local runner for MasterAgent with session rollover.

Usage examples:
  python Agents/local_main.py
  python Agents/local_main.py --prompt "Do your segmentation task."
  AGENT_SEGMENTATION_MAX_ROUNDS=5 python Agents/local_main.py
"""

from __future__ import annotations

import os
import sys
import json
import logging
from importlib import reload
from pathlib import Path
from typing import Optional
import asyncio
import inspect
import uuid
import os

from google.adk.runners import InMemoryRunner  # type: ignore
from google.genai import types  # type: ignore
from google.genai.errors import ClientError  # type: ignore

# Load .env first so all downstream imports see environment
try:
    from dotenv import load_dotenv, find_dotenv  # type: ignore
    load_dotenv(find_dotenv(), override=False)
except Exception:
    pass

# Ensure package imports work when running directly
CURRENT_DIR = Path(__file__).parent
sys.path.insert(0, str(CURRENT_DIR))

def _ensure_genai_env() -> None:
    """
    Ensure Google GenAI/Vertex AI credentials are available for local runs.
    Priority:
      1) Respect GOOGLE_API_KEY or GOOGLE_GENAI_API_KEY if set (Google AI API)
      2) If GOOGLE_GENAI_USE_VERTEXAI is truthy, ensure required Vertex vars
      3) Otherwise, auto-configure Vertex using the bundled service account JSON if present
    Additionally, prefer explicit BQ key for BigQuery operations.
    """
    # If API key provided, prefer Google AI API and don't touch ADC
    if os.getenv("GOOGLE_GENAI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
        return
    # If user opted for Vertex AI, normalize vars
    if os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("1", "true", "yes"):
        if os.getenv("GCP_PROJECT_ID") and not os.getenv("GOOGLE_CLOUD_PROJECT"):
            os.environ["GOOGLE_CLOUD_PROJECT"] = os.getenv("GCP_PROJECT_ID", "")
        if not os.getenv("GOOGLE_CLOUD_LOCATION"):
            os.environ["GOOGLE_CLOUD_LOCATION"] = "us-central1"
        # Do NOT set GOOGLE_APPLICATION_CREDENTIALS to avoid impacting BigQuery ADC
        return
    # Auto-configure Vertex AI from local service account if available
    candidate_json = CURRENT_DIR / "eighth-upgrade-475017-u5-5f7f40ad1003.json"
    if candidate_json.exists():
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"
        # Best-effort project guess based on filename; adjust if different in your env
        os.environ.setdefault("GCP_PROJECT_ID", "eighth-upgrade-475017-u5")
        os.environ.setdefault("GOOGLE_CLOUD_PROJECT", os.environ.get("GCP_PROJECT_ID", ""))
        os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "us-central1")
        os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS_AI", str(candidate_json))
        # Intentionally avoid setting GOOGLE_APPLICATION_CREDENTIALS
    # Ensure BQ key is visible if present locally and not set via .env
    bq_keyfile = CURRENT_DIR / "bigquery-serviceacc.json"
    if bq_keyfile.exists():
        os.environ.setdefault("GOOGLE_APPLICATION_CREDENTIALS_BQ", str(bq_keyfile))

_ensure_genai_env()

from MasterAgent.agent import root_agent  # type: ignore
import MasterAgent.agent as master_agent_module  # type: ignore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("local_runner")


def extract_status(obj) -> Optional[str]:
    """
    Try to extract a minimal {"status": "..."} value out of an agent result.
    Accepts dict or a JSON string; returns None if not found.
    """
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


async def run_with_session_rollover(initial_prompt: str, max_rounds: int = 8) -> dict:
    """
    Run the master agent with session rollover. If the agent returns {"status":"continue"},
    a fresh session is created by reloading the MasterAgent module and running again.
    """
    rounds = 0
    agent_instance = root_agent
    prompt = initial_prompt
    statuses = []
    last_result = None

    while True:
        rounds += 1
        logger.info("Starting agent round %d", rounds)
        # Use ADK InMemoryRunner to create a fresh session each round
        user_id = "local-user"
        session_id = f"local-{uuid.uuid4().hex[:8]}"
        last_text: Optional[str] = None

        async def _run_once() -> Optional[str]:
            nonlocal session_id
            async with InMemoryRunner(agent=agent_instance, app_name="agents") as runner:
                new_message = types.Content(parts=[types.Part(text=prompt)], role="user")
                # Ensure the session exists before running
                await runner.session_service.create_session(
                    app_name=runner.app_name, user_id=user_id, session_id=session_id
                )
                try:
                    async for event in runner.run_async(
                        user_id=user_id,
                        session_id=session_id,
                        new_message=new_message,
                    ):
                        # Capture latest text content from agent events
                        if event.content and event.content.parts:
                            for part in event.content.parts:
                                if getattr(part, "text", None):
                                    last_text_local = part.text
                                    # Track only the latest non-empty text
                                    if last_text_local:
                                        nonlocal last_text
                                        last_text = last_text_local
                finally:
                    # Best-effort cleanup of the session to avoid buildup across rounds
                    try:
                        await runner.session_service.delete_session(
                            app_name=runner.app_name, user_id=user_id, session_id=session_id
                        )
                    except Exception:
                        pass
            return last_text

        # Handle rate limits by retrying and falling back to API key if Vertex throttles
        max_attempts = 2
        attempt = 0
        while attempt < max_attempts:
            attempt += 1
            try:
                last_text = await _run_once()
                break
            except ClientError as ce:  # type: ignore
                # 429 fallback: temporarily prefer API key by removing Vertex hints, then retry once
                if getattr(ce, "status_code", None) == 429 and attempt < max_attempts:
                    logger.warning("Vertex AI rate-limited (429). Falling back to API key for this round.")
                    original_project = os.environ.pop("GOOGLE_CLOUD_PROJECT", None)
                    original_location = os.environ.pop("GOOGLE_CLOUD_LOCATION", None)
                    # Ensure API key variable name is available to client (either is fine)
                    if os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_GENAI_API_KEY"):
                        os.environ["GOOGLE_GENAI_API_KEY"] = os.environ["GOOGLE_API_KEY"]
                    try:
                        last_text = await _run_once()
                        break
                    finally:
                        # Restore env to original state for subsequent rounds
                        if original_project is not None:
                            os.environ["GOOGLE_CLOUD_PROJECT"] = original_project
                        if original_location is not None:
                            os.environ["GOOGLE_CLOUD_LOCATION"] = original_location
                else:
                    raise

        # Parse the last_text into a result object if possible
        if last_text is not None:
            try:
                last_result = json.loads(last_text)
            except Exception:
                last_result = last_text
        else:
            last_result = None
        status = extract_status(last_result) or ""
        if status:
            statuses.append(status)
        logger.info("Round %d status=%s", rounds, status or "n/a")

        if status.lower() == "continue" and rounds < max_rounds:
            # Create a fresh session by cloning the agent tree to avoid state carry-over
            try:
                agent_instance = agent_instance.clone()
            except Exception:
                agent_instance = root_agent.clone() if hasattr(root_agent, "clone") else root_agent
            # Keep the continuation prompt short to avoid growing context
            prompt = 'Continue the user segmentation task. Return only {"status":"continue"} or {"status":"finished"}.'
            continue
        break

    return {
        "result": last_result,
        "rounds": rounds,
        "statuses": statuses,
    }


def main(argv: list[str] | None = None) -> int:
    import argparse
    parser = argparse.ArgumentParser(description="Run MasterAgent locally with session rollover.")
    parser.add_argument("--prompt", type=str, default="Do your segmentation task. Start with reading pending users to segment.",
                        help="Initial prompt to send to the master agent.")
    parser.add_argument("--max-rounds", type=int, default=int(os.getenv("AGENT_SEGMENTATION_MAX_ROUNDS", "8")),
                        help="Maximum rollover rounds before stopping (default: 8).")
    parser.add_argument("--json", action="store_true", help="Print raw JSON result only.")
    args = parser.parse_args(argv)

    out = asyncio.run(run_with_session_rollover(args.prompt, max_rounds=args.max_rounds))
    if args.json:
        print(json.dumps(out, ensure_ascii=False))
    else:
        logger.info("Completed after %d rounds. Statuses=%s", out["rounds"], out["statuses"])
        try:
            print(json.dumps(out["result"], ensure_ascii=False, indent=2))
        except Exception:
            print(out["result"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


