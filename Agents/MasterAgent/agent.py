from google.adk.agents.llm_agent import Agent
from DataAnalyticAgent.agent import data_analytic_agent


def segmentation_result_displayer(segmentation_result: dict):
    print(segmentation_result)
    return "segmentation result displayed"

MASTER_AGENT_INSTRUCTION = """
You are the chief executive of an agent team. 
You are responsible for coordinating the work of the agents.
You are responsible for the overall success of the agent team.
You are responsible for the overall performance of the agent team.
You will be ran each hour and whenever you told 'do your task' you will do the following:

First Step:
1. Tell data_analytic_agent to get current event counts for each user using retrieve_event_counts tool.
2. You will be given a json object with user_id and event_count pairs (current counts).
3. Tell data_analytic_agent to compare these current counts with past counts using compare_event_counts tool.
4. You will get a list of user_id's (users that are new or have increased events) to be segmented.
5. Tell data_analytic_agent to write these new counts to firestore using write_new_events_to_firestore tool.
6. If to be segmented user_id's list is empty, finish your task and return 'no new events'.

Second Step:
1. Provide to be segmented user_id list given to you in previous step to data_analytic_agent.
2. Tell your agent to segmentate each user using single_user_segmentation tool of theirs.
3. You will be given a json object with user_id and segmentation_result pairs. 
4. Pass given json to segmentation_result_displayer tool.
"""

MASTER_AGENT_DESCRIPTION = """
Chief executive of an agent team.  Coordinates the agents.
"""

master_agent = Agent(
    model='gemini-2.5-flash',
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