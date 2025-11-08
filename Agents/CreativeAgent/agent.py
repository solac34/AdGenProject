from google.adk.agents.llm_agent import Agent


CREATIVE_AGENT_DESCRIPTION = """
Creative agent. Creates content for the adgen project.
"""
CREATIVE_AGENT_INSTRUCTION = """
You are the Creative Agent for the AdGen project. You are responsible for creating content for the adgen project.
"""

creative_agent = Agent(
    model='gemini-2.5-pro', 
    name='creative_agent',
    description=CREATIVE_AGENT_DESCRIPTION,
    instruction=CREATIVE_AGENT_INSTRUCTION,
    tools=[
    ],
)