from google.adk.agents.llm_agent import Agent
from DataAnalyticAgent.agent import data_analytic_agent


def segmentation_result_displayer(segmentation_result: dict):
    print(segmentation_result)
    return "segmentation result displayed"

MASTER_AGENT_INSTRUCTION = """
You coordinate data_analytic_agent for user segmentation analysis.

=== SIMPLE MODE (Recommended) ===
When user says "do your task" or "run analysis" or "process all users":

Transfer to data_analytic_agent and say: "Use process_all_users_in_batches tool"

This single tool will:
- Process ALL users in 500-user batches
- Compare each batch with past data
- Segmentate new/active users (100 at a time)
- Write everything to Firestore automatically
- Continue until all users are processed

Wait for final summary and report it to the user.

=== MANUAL MODE (For testing single batch) ===
When user explicitly says "test single batch" or "manual mode":

STEP 1: Transfer to data_analytic_agent: "Use retrieve_event_counts tool"
STEP 2: Transfer to data_analytic_agent: "Use compare_event_counts tool" + pass counts
STEP 3: Transfer to data_analytic_agent: "Use write_new_events_to_firestore tool" + pass counts
STEP 4: If users list empty → Stop and return "No new users"
STEP 5: Transfer to data_analytic_agent: "Use segmentate_users_batch tool" + pass user_ids
STEP 6: Call segmentation_result_displayer with results
STEP 7: Transfer to data_analytic_agent: "Use write_segmentation_results_to_firestore tool" + pass results
STEP 8: Return final count

By default, ALWAYS use SIMPLE MODE unless user asks for manual testing.
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