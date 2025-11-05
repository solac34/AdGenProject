from google.adk.agents.llm_agent import Agent
from DataAnalyticAgent.agent import data_analytic_agent
from DataAnalyticAgent.bq_helper import bq_to_dataframe
from .firestore_helper import get_past_events_from_firestore


def segmentation_result_displayer(segmentation_result: dict):
    print(segmentation_result)
    return "segmentation result displayed"

def compare_event_counts(current_events_reference: dict):
    """
    BigQuery temp tablosundan mevcut activity count'ları okur ve 
    Firestore'daki geçmiş verilerle karşılaştırır.
    
    Args:
        current_events_reference: retrieve_user_activity_counts'dan dönen dict
    
    Returns:
        list: Yeni veya activity artan kullanıcı ID'leri
    """
    # BigQuery tablo referansını al
    data_ref = current_events_reference.get('data_reference', {})
    project = data_ref.get('project')
    dataset = data_ref.get('dataset')
    table = data_ref.get('table')
    
    if not all([project, dataset, table]):
        print("❌ Geçersiz tablo referansı!")
        return []
    
    # BigQuery'den veriyi çek (artık event_count ve order_count var)
    full_table_name = f"`{project}.{dataset}.{table}`"
    query = f"SELECT user_id, event_count, order_count FROM {full_table_name}"
    
    print(f"📊 BigQuery'den veri çekiliyor: {full_table_name}")
    df = bq_to_dataframe(query)
    
    # DataFrame'i dictionary'ye çevir
    current_activity = {
        str(row['user_id']): {
            'event_count': int(row['event_count']),
            'order_count': int(row['order_count'])
        }
        for _, row in df.iterrows()
    }
    
    print(f"✅ {len(current_activity)} kullanıcı verisi alındı")
    
    # Firestore'dan geçmiş verileri al
    past_activity = get_past_events_from_firestore()
    
    # Performans odaklı karşılaştırma - List comprehension ile
    # event_count VEYA order_count artmış kullanıcıları bul
    new_or_increased_users = [
        user_id 
        for user_id, current_data in current_activity.items()
        if (
            # Yeni kullanıcı
            user_id not in past_activity or 
            # Event count artmış
            current_data['event_count'] > past_activity.get(user_id, {}).get('event_count', 0) or
            # Order count artmış
            current_data['order_count'] > past_activity.get(user_id, {}).get('order_count', 0)
        )
    ]
    
    print(f"📊 Segmentlenecek kullanıcı sayısı: {len(new_or_increased_users)} / {len(current_activity)}")
        
    return new_or_increased_users

MASTER_AGENT_INSTRUCTION = """
You are the Master Agent of the AdGen project, responsible for orchestrating data operations between BigQuery and Firestore through your sub-agent (data_analytic_agent).

=== PRIMARY WORKFLOW: Write User Activity Counts to Firestore ===

When the user requests to write user activity data (events + orders) to Firestore, follow these precise steps:

STEP 1: Transfer control to data_analytic_agent
→ Execute the retrieve_user_activity_counts tool
→ This single tool retrieves BOTH event counts AND order counts for all users
→ It will return a dictionary structured as:
  {
    "status": "success",
    "message": "User activity counts (events + orders) successfully written to BigQuery.",
    "data_reference": {
      "project": "eighth-upgrade-475017-u5",
      "dataset": "_52d6b668_19a5_13ca_3c8",
      "table": "anonc4ca20ccc0ea49af9846718f5a1779f8e38f03b418fa376084b877282982585d"
    }
  }
→ The table contains columns: user_id, event_count, order_count, created_at
→ BigQuery automatically created this temporary table

STEP 2: Extract the BigQuery table reference
→ From the returned dictionary, extract ONLY the "data_reference" object
→ This object contains three key pieces of information:
  • project: The GCP project ID
  • dataset: BigQuery's auto-generated dataset (starts with underscore)
  • table: BigQuery's auto-generated temp table name (long alphanumeric string)

STEP 3: Transfer control to data_analytic_agent again
→ Execute the write_user_activity_to_firestore tool
→ Pass the extracted "data_reference" object as the parameter (NOT the entire dictionary)
→ The function will:
  • Query the BigQuery temp table
  • Read user_id, event_count, order_count, created_at for each user
  • Transform into nested dictionary format:
    {
      "user_123": {
        "event_count": 45,
        "order_count": 3,
        "created_at": "2025-11-05T02:38:40"
      }
    }
  • Create a SINGLE Firestore document in 'user_activity_counts' collection
  • Include metadata (total_users, createdAt, table_source)

STEP 4: Return the confirmation to the user
→ Report the number of users processed
→ Include the Firestore document ID for reference
→ Mention that both event and order counts were saved

IMPORTANT: You must pass ONLY the data_reference object (the nested dictionary), not the entire result dictionary.

=== SECONDARY WORKFLOW: Compare Activity Counts (Identify New/Active Users) ===

When the user requests to compare activity counts or identify users with increased activity:

STEP 1: Transfer control to data_analytic_agent
→ Execute the retrieve_user_activity_counts tool
→ Receive the result dictionary with data_reference

STEP 2: Use the compare_event_counts tool
→ Pass the ENTIRE result dictionary (not just data_reference) to this tool
→ The tool will:
  • Query the BigQuery temp table
  • Fetch the most recent snapshot from Firestore
  • Compare current counts with past counts
  • Identify users who are new OR have increased activity

STEP 3: Return the list of user IDs
→ Report how many users have new or increased activity
→ Provide the list of user IDs for further processing (e.g., segmentation)

=== KEY ADVANTAGES OF COMBINED WORKFLOW ===
✅ Single query retrieves both events AND orders (more efficient)
✅ Comprehensive user activity profile in one place
✅ Handles users with only events, only orders, or both
✅ Timestamp tracking for when data was retrieved
✅ Uses BigQuery's automatic temporary table creation

=== KEY REMINDERS ===
• Always transfer to data_analytic_agent for BigQuery/Firestore operations
• For write_user_activity_to_firestore: pass data_reference ONLY
• For compare_event_counts: pass the FULL result dictionary
• The data_reference will have BigQuery's auto-generated table names (long alphanumeric)
• Provide clear confirmation messages to the user after each operation
• Collection name is now 'user_activity_counts' (not 'user_event_counts')
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