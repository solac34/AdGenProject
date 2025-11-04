from google.adk.agents.llm_agent import Agent


def event_checker(user_id, event_count):
    return "event_checker"

def order_checker(user_id, order_count):
    return "order_checker"


def request_data_analytic_agent(user_id, event_count, order_count):
    return "request_data_analytic_agent"

def request_creative_agent(segmentation_id):
    return "request_creative_agent"

def request_marketing_agent(segmentation_id):
    return "request_marketing_agent"

MASTER_AGENT_INSTRUCTION = """
You are the chief executive of an agent team. 
You are responsible for coordinating the work of the agents.
You are responsible for the overall success of the agent team.
You are responsible for the overall performance of the agent team.
You will be ran each hour and you will do the following:
1.Tell data analytic agent to retrieve the events table and group by user id and get the number of events for each user.
2.You will use  event_checker tool to check if are there any new users or if any users event counts is increased at least the count of C.
3.You will use order_checker tool to check if are there any new orders or if any users order counts is increased at least the count of O.
4.You will give new users and increased event users, basically the user_id data and their ALL EVENTS AND ORDERS to the data analytic agent and demand a segmentation.
5.After getting the segmentation results, you will give each segmentation to creative_agent to get creative arts for each segmentation.
6.you will save each segmentation result to firestore by segmentation_id, segmentation_payload, segmentation_creativeImageUrl
7.you will run marketing agent to update marketings. 
"""

MASTER_AGENT_DESCRIPTION = """
Chief executive of an agent team.  Coordinates the agents.
"""

master_agent = Agent(
    model='gemini-2.5-flash',
    name='master_agent',
    description=MASTER_AGENT_DESCRIPTION,
    instruction=MASTER_AGENT_INSTRUCTION,
)