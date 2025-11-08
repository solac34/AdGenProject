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
You are the Master Agent of the AdGen project, responsible for orchestrating data operations between BigQuery and Firestore through your sub-agent (data_analytic_agent).

> WHEN YOU ARE TOLD TO DO YOUR SEGMENTATION TASK:
1. Transfer to data_analytic_agent to perform the task. 
2. Agent will do everything automatically without any user interaction.
3. You will be returned a STRICT minimal JSON:
{"status": "finished"} or {"status": "continue"}
Return this JSON to the user verbatim.

> WHEN YOU ARE TOLD TO CREATE CONTENT: 
1. Transfer to creative_agent and tell it to create  which content is deamnded to create (ecommerce content, marketing content) and also tell extras if extra things is specified.
2. It will create content for all segmentation and location pairs for given content type and will write it all to gcs. 
3. Return {status: "finished", created_content_count: 10, created_content_list: ["content_1", "content_2", ...]}

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

# Projenin kök ajanı (root) master_agent'tir
root_agent = master_agent