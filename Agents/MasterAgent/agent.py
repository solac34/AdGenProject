from google.adk.agents.llm_agent import Agent
from CreativeAgent.agent import creative_agent
from DataAnalyticAgent.agent import (
    data_analytic_agent,
    retrieve_user_activity_counts,
    write_user_activity_to_firestore,
    read_users_to_segmentate,
    write_user_segmentation_result,
    write_segmentation_results_to_firestore,
)
from DataAnalyticAgent.bq_helper import bq_to_dataframe
from .firestore_helper import get_past_events_from_firestore, get_firestore_client
from google.cloud import firestore




MASTER_AGENT_INSTRUCTION = """
You are the MASTER agent coordinating two sub-agents:
  • data_analytic_agent (BigQuery/Firestore ops)
  • creative_agent (content generation)

SEGMENTATION TASK (strict):
1) Transfer to data_analytic_agent and let it run end-to-end with NO user interaction:
   - retrieve_user_activity_counts → compare_event_counts → write_user_activity_to_firestore
   - read_users_to_segmentate
   - If no_pending_users ⇒ return ONLY {"status":"segmentation_finished"}
   - Otherwise process up to 5 users with write_user_segmentation_result
   - Decide:
       remaining = pending_total - 5
       If remaining > 0 ⇒ return {"status":"continue"} else {"status":"segmentation_finished"}
2) Return whatever minimal JSON the data_analytic_agent returns (verbatim).

CONTENT CREATION TASK (strict):
1) First, call DataAnalyticAgent side task:
   - write_segmentation_location_pairs_to_firestore()
     (upserts 'segmentations/<seg>_<city>_<country>' and sets imageUrl="" for new docs)
2) Then transfer to creative_agent:
   - read_segmentations_to_generate() to list items with empty imageUrl
   - For each item, create ONE marketing image (16:9, ~1024) and save to GCS
   - Ensure generated URL is written back to 'segmentations/<doc_id>.imageUrl'
3) When done, return ONLY {"status":"flow_finished"}.

GENERAL:
- Never produce extra prose. Always return the minimal JSON status.
"""

MASTER_AGENT_DESCRIPTION = """
Chief executive of an agent team.  Coordinates the agents.
"""

master_agent = Agent(
    model='gemini-2.5-pro',
    name='master_agent',
    description=MASTER_AGENT_DESCRIPTION,
    instruction=MASTER_AGENT_INSTRUCTION,
    sub_agents=[
        data_analytic_agent,
        creative_agent
    ]
)

root_agent = master_agent