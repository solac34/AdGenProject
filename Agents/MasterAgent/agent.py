from google.adk.agents.llm_agent import Agent
import sys
import os
# Add the parent directory to the path to allow imports
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from DataAnalyticAgent.agent import (
    data_analytic_agent,
    retrieve_user_activity_counts,
    write_user_activity_to_firestore,
    read_users_to_segmentate,
    write_user_segmentation_result,
    write_segmentation_results_to_firestore,
    compare_event_counts,
)
from DataAnalyticAgent.bq_helper import bq_to_dataframe
from .firestore_helper import get_past_events_from_firestore, get_firestore_client
from google.cloud import firestore


def segmentation_result_displayer(segmentation_result: dict):
    print(segmentation_result)
    return "segmentation result displayed"



MASTER_AGENT_INSTRUCTION = """
You are the Master Agent of the AdGen project, responsible for orchestrating data operations between BigQuery and Firestore through your sub-agent (data_analytic_agent).

> WHEN YOU ARE TOLD TO DO YOUR TASK:
1. Transfer to data_analytic_agent to perform the task. 
2. Agent will do everything automatically without any user interaction.
3. You will be returned:
{
  "status": "finished",
  "users": {'user_id': 'user_123', 'segmentation_result': 'segmentation_result_1', ...},
}
4.If status is continue
4.1. Clear the context except instructions and tell data analytic agent to start from step 3 of its main flow.
If not:
1. the result of users dictionary(key is user_id, value is segmentation_result), if there have been more than one user user that is segmentated, you will display the result.
2. If there are no users that are segmentated, you will not display anything and tell user no users are segmentated.


"""

MASTER_AGENT_DESCRIPTION = """
Chief executive of an agent team.  Coordinates the agents.
"""

master_agent = Agent(
    model='gemini-2.5-pro',
    name='master_agent',
    description=MASTER_AGENT_DESCRIPTION,
    instruction=MASTER_AGENT_INSTRUCTION,
    tools=[
        segmentation_result_displayer,
    ],
    sub_agents=[
        data_analytic_agent,
    ]
)

# Projenin kök ajanı (root) master_agent'tir
root_agent = master_agent