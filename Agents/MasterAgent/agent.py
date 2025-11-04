from google.adk.agents.llm_agent import Agent
from DataAnalyticAgent.agent import data_analytic_agent
from DataAnalyticAgent.bq_helper import bq_to_dataframe
from .firestore_helper import get_past_events_from_firestore


def segmentation_result_displayer(segmentation_result: dict):
    print(segmentation_result)
    return "segmentation result displayed"

def compare_event_counts(current_events_reference: dict):

    # BigQuery tablo referansını al
    data_ref = current_events_reference.get('data_reference', {})
    project = data_ref.get('project')
    dataset = data_ref.get('dataset')
    table = data_ref.get('table')
    
    if not all([project, dataset, table]):
        print("❌ Geçersiz tablo referansı!")
        return []
    
    # BigQuery'den veriyi çek
    full_table_name = f"`{project}.{dataset}.{table}`"
    query = f"SELECT user_id, count FROM {full_table_name}"
    
    print(f"📊 BigQuery'den veri çekiliyor: {full_table_name}")
    df = bq_to_dataframe(query)
    
    # DataFrame'i dictionary'ye çevir
    current_events = {str(row['user_id']): int(row['count']) for _, row in df.iterrows()}
    
    print(f"✅ {len(current_events)} kullanıcı verisi alındı")
    
    # Firestore'dan geçmiş verileri al
    past_events = get_past_events_from_firestore()
    
    # Performans odaklı karşılaştırma - List comprehension ile
    new_or_increased_users = [
        user_id 
        for user_id, current_count in current_events.items()
        if current_count > past_events.get(user_id, 0)
    ]
    
    print(f"📊 Segmentlenecek kullanıcı sayısı: {len(new_or_increased_users)} / {len(current_events)}")
        
    return new_or_increased_users

MASTER_AGENT_INSTRUCTION = """
You are the Master Agent of the AdGen project, responsible for orchestrating data operations between BigQuery and Firestore through your sub-agent (data_analytic_agent).

=== WORKFLOW A: Write New Event Counts to Firestore ===

When the user requests to write new event counts to Firestore, follow these precise steps:

STEP 1: Transfer control to data_analytic_agent
→ Execute the retrieve_event_counts tool
→ This will return a dictionary structured as:
  {
    "status": "success",
    "message": "User event counts successfully written to BigQuery for processing.",
    "data_reference": {
      "project": "eighth-upgrade-475017-u5",
      "dataset": "temp_datasets",
      "table": "user_events_abc123xyz"
    }
  }

STEP 2: Extract the BigQuery table reference
→ From the returned dictionary, extract ONLY the "data_reference" object
→ This object contains three key pieces of information:
  • project: The GCP project ID
  • dataset: The BigQuery dataset name
  • table: The temporary table name containing user event counts

STEP 3: Transfer control to data_analytic_agent again
→ Execute the write_new_events_to_firestore tool
→ Pass the extracted "data_reference" object as the parameter (NOT the entire dictionary)
→ The function will:
  • Query the BigQuery temp table using the provided reference
  • Read all user_id and count pairs
  • Create a single Firestore document in the 'user_event_counts' collection
  • Include metadata (timestamp, total users, table source)

STEP 4: Return the confirmation to the user
→ Report the number of user event counts written to Firestore
→ Include the Firestore document ID for reference

IMPORTANT: You must pass ONLY the data_reference object (the nested dictionary), not the entire result dictionary.

=== WORKFLOW B: Compare Event Counts (Identify New/Active Users) ===

When the user requests to compare event counts or identify users with increased activity:

STEP 1: Transfer control to data_analytic_agent
→ Execute the retrieve_event_counts tool
→ Receive the result dictionary with data_reference

STEP 2: Use the compare_event_counts tool
→ Pass the ENTIRE result dictionary (not just data_reference) to this tool
→ The tool will:
  • Query the BigQuery temp table
  • Fetch the most recent snapshot from Firestore
  • Compare current counts with past counts
  • Identify users who are new OR have increased event counts

STEP 3: Return the list of user IDs
→ Report how many users have new or increased activity
→ Provide the list of user IDs for further processing (e.g., segmentation)

=== KEY REMINDERS ===
• Always transfer to data_analytic_agent for BigQuery/Firestore operations
• For write_new_events_to_firestore: pass data_reference ONLY
• For compare_event_counts: pass the FULL result dictionary
• Provide clear confirmation messages to the user after each operation
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
        compare_event_counts,
    ],
    sub_agents=[
        data_analytic_agent,
    ]
)

# Projenin kök ajanı (root) master_agent'tir
root_agent = master_agent