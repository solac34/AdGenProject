from google.adk.agents.llm_agent import Agent
from .bq_helper import bq_to_dataframe, query_to_temp_table
import os
import sys
from datetime import datetime
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from MasterAgent.firestore_helper import get_firestore_client, get_past_events_from_firestore
from google.cloud import firestore
import uuid 


# Ortam değişkenlerini .env formatına uyarlama
# - ADK/genai Client Vertex AI için GOOGLE_CLOUD_PROJECT ve GOOGLE_CLOUD_LOCATION bekliyor
# - Kullanıcı .env'de GCP_PROJECT_ID ve GOOGLE_GENAI_USE_VERTEXAI kullanıyor
if os.getenv('GOOGLE_GENAI_USE_VERTEXAI', '').lower() in ['true', '1']:
    # Proje eşlemesi
    if os.getenv('GCP_PROJECT_ID') and not os.getenv('GOOGLE_CLOUD_PROJECT'):
        os.environ['GOOGLE_CLOUD_PROJECT'] = os.getenv('GCP_PROJECT_ID', '')
    # Lokasyon varsayılanı
    if not os.getenv('GOOGLE_CLOUD_LOCATION'):
        os.environ['GOOGLE_CLOUD_LOCATION'] = 'us-central1'
    # Vertex AI için ayrı credential belirtildiyse onu ADC olarak aktar
    if os.getenv('GOOGLE_APPLICATION_CREDENTIALS_AI'):
        os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = os.getenv('GOOGLE_APPLICATION_CREDENTIALS_AI', '')




def retrieve_user_activity_counts():
    """
    Hem event hem order count'larını BigQuery'den çeker ve birleştirir.
    Her user için event_count, order_count ve created_at içeren yapı oluşturur.
    
    Returns:
        dict: {
            "status": "success",
            "data_reference": {
                "project": "...",
                "dataset": "...",
                "table": "combined_user_activity_..."
            }
        }
    """
    print(f"🔍 retrieve_user_activity_counts çağrıldı")
    
    # 1. Event counts query
    events_query = """
    SELECT user_id, COUNT(*) as event_count 
    FROM `adgen_bq.user_events`
    WHERE user_id != 'anonymous'
    GROUP BY user_id
    """
    
    # 2. Order counts query
    orders_query = """
    SELECT user_id, COUNT(*) as order_count 
    FROM `adgen_bq.user_orders`
    GROUP BY user_id
    """
    
    # 3. Combined query - FULL OUTER JOIN ile her iki tarafı da al
    combined_query = f"""
    WITH events AS (
        {events_query}
    ),
    orders AS (
        {orders_query}
    )
    SELECT 
        COALESCE(events.user_id, orders.user_id) as user_id,
        COALESCE(events.event_count, 0) as event_count,
        COALESCE(orders.order_count, 0) as order_count,
        CURRENT_TIMESTAMP() as created_at
    FROM events
    FULL OUTER JOIN orders ON events.user_id = orders.user_id
    ORDER BY user_id ASC
    """
    
    print(f"📝 Combined query çalıştırılıyor...")
    
    # Query'yi çalıştır - BigQuery otomatik temp table oluşturacak
    result = query_to_temp_table(combined_query)
    result["message"] = "User activity counts (events + orders) successfully written to BigQuery."
    
    print(f"✅ retrieve_user_activity_counts RESULT:")
    print(f"   Status: {result.get('status')}")
    print(f"   Data Reference: {result.get('data_reference')}")
    
    return result



def write_user_activity_to_firestore(data_reference: dict):
    """
    BigQuery temp tablosundan user activity verilerini (event_count, order_count, created_at) 
    okur ve Firestore'a tek bir döküman olarak yazar.
    
    Args:
        data_reference: BigQuery tablo referansı
            {
                "project": "...",
                "dataset": "...",
                "table": "..."
            }
    
    Returns:
        str: Confirmation message
    """
    print(f"🔍 write_user_activity_to_firestore çağrıldı")
    print(f"📥 Gelen data_reference: {data_reference}")
    
    # BigQuery tablo bilgilerini al
    project = data_reference.get('project')
    dataset = data_reference.get('dataset')
    table = data_reference.get('table')
    
    print(f"   project: {project}")
    print(f"   dataset: {dataset}")
    print(f"   table: {table}")
    
    if not all([project, dataset, table]):
        print("❌ Geçersiz tablo referansı!")
        return "Error: Invalid table reference"
    
    # BigQuery'den veriyi çek
    full_table_name = f"`{project}.{dataset}.{table}`"
    query = f"SELECT user_id, event_count, order_count, created_at FROM {full_table_name}"
    
    print(f"📊 BigQuery'den veri çekiliyor: {full_table_name}")
    df = bq_to_dataframe(query)
    
    # DataFrame'i nested dictionary'ye çevir
    # Format: {user_id: {event_count: X, order_count: Y, created_at: Z}}
    user_activity = {}
    for _, row in df.iterrows():
        user_id = str(row['user_id'])
        user_activity[user_id] = {
            'event_count': int(row['event_count']),
            'order_count': int(row['order_count']),
            'created_at': row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else str(row['created_at'])
        }
    
    print(f"✅ {len(user_activity)} kullanıcı verisi alındı")
    
    # Firestore'a tek döküman olarak yaz
    db = get_firestore_client()
    
    # Benzersiz döküman ID oluştur (timestamp bazlı)
    doc_id = f"snapshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    doc_ref = db.collection('user_activity_counts').document(doc_id)
    
    doc_ref.set({
        'user_activity': user_activity,
        'total_users': len(user_activity),
        'createdAt': firestore.SERVER_TIMESTAMP,
        'table_source': f"{project}.{dataset}.{table}"
    })
    
    print(f"✅ Firestore'a yazıldı: user_activity_counts/{doc_id}")
    print(f"   Örnek veri: {list(user_activity.items())[:2]}")

    return f"{len(user_activity)} user activity records written to firestore as document: {doc_id}"



def write_segmentation_results_to_firestore(segmentation_results: dict):
    """
    Segmentation sonuçlarını Firestore'a batch olarak yazar.
    Tüm dict tek seferde 'segmentation_results' dokümanına kaydedilir.
    """
    db = get_firestore_client()
    # Tüm segmentation results'ı tek bir dokümana yaz
    doc_ref = db.collection('segmentation_results').document('latest_batch')
    doc_ref.set({
        'results': segmentation_results,
        'count': len(segmentation_results),
        'timestamp': firestore.SERVER_TIMESTAMP
    })
    return f"{len(segmentation_results)} segmentation results written to firestore in single batch"




DATA_ANALYTIC_AGENT_INSTRUCTION = """
You are the Data Analytic Agent for the AdGen project. You handle ALL BigQuery and Firestore operations.
The Master Agent coordinates you, but YOU execute the actual data operations.

=== YOUR TOOLS & THEIR EXACT USAGE ===

📊 Tool 1: retrieve_user_activity_counts()
→ Purpose: Retrieve BOTH event counts AND order counts for all users in a single combined query
→ Parameters: NONE
→ Returns: A dictionary with this EXACT structure:
  {
    "status": "success",
    "message": "User activity counts (events + orders) successfully written to BigQuery.",
    "data_reference": {
      "project": "eighth-upgrade-475017-u5",
      "dataset": "_abc123_...",
      "table": "anonc4ca20ccc0ea49af9846718f5a1779f8e..."
    }
  }
→ What it does internally:
  • Queries BOTH `adgen_bq.user_events` AND `adgen_bq.user_orders` tables
  • Uses FULL OUTER JOIN to combine both datasets
  • For each user_id, calculates:
    - event_count: Total number of events
    - order_count: Total number of orders
    - created_at: Current timestamp
  • BigQuery automatically creates a temporary table with results
  • Returns the temp table reference
→ Result table structure:
  | user_id | event_count | order_count | created_at |
  |---------|-------------|-------------|------------|
  | user_1  | 45          | 3           | 2025-11-05 |
  | user_2  | 120         | 8           | 2025-11-05 |

💾 Tool 2: write_user_activity_to_firestore(data_reference: dict)
→ Purpose: Read combined user activity data from BigQuery temp table and write to Firestore
→ Parameters: 
  • data_reference (dict): The BigQuery table reference with keys:
    - "project": GCP project ID
    - "dataset": BigQuery dataset name (auto-generated by BigQuery)
    - "table": Temp table name (auto-generated by BigQuery, like "anonc4ca20...")
→ Returns: Confirmation message (e.g., "1234 user activity records written to firestore as document: snapshot_20251105_023840")
→ What it does internally:
  • Queries the BigQuery temp table: SELECT user_id, event_count, order_count, created_at
  • Converts to nested dictionary format:
    {
      "user_123": {
        "event_count": 45,
        "order_count": 3,
        "created_at": "2025-11-05T02:38:40"
      },
      "user_456": {
        "event_count": 120,
        "order_count": 8,
        "created_at": "2025-11-05T02:38:40"
      }
    }
  • Creates a SINGLE Firestore document in 'user_activity_counts' collection
  • Document structure:
    {
      'user_activity': {nested dict above},
      'total_users': 1234,
      'createdAt': <firestore timestamp>,
      'table_source': 'project.dataset.table'
    }

💾 Tool 3: write_segmentation_results_to_firestore(segmentation_results: dict)
→ Purpose: Write user segmentation analysis results to Firestore
→ Parameters:
  • segmentation_results (dict): User segmentation data
→ Returns: Confirmation message
→ What it does internally:
  • Writes results to 'segmentation_results' collection
  • Document ID: 'latest_batch'

=== WORKFLOW EXAMPLE ===

When Master Agent says: "Write user activity counts to firestore"

STEP 1: Master calls retrieve_user_activity_counts()
  You return:
  {
    "status": "success",
    "data_reference": {
      "project": "eighth-upgrade-475017-u5",
      "dataset": "_52d6b668_19a5_13ca_3c8",
      "table": "anonc4ca20ccc0ea49af9846718f5a1779f8e38f03b418fa376084b877282982585d"
    }
  }

STEP 2: Master extracts data_reference and calls write_user_activity_to_firestore()
  Master passes you ONLY:
  {
    "project": "eighth-upgrade-475017-u5",
    "dataset": "_52d6b668_19a5_13ca_3c8",
    "table": "anonc4ca20ccc0ea49af9846718f5a1779f8e38f03b418fa376084b877282982585d"
  }
  
  You:
  1. Query the temp table
  2. Transform to nested dict format
  3. Write to Firestore collection: user_activity_counts
  4. Return confirmation: "1234 user activity records written..."

=== KEY ADVANTAGES ===
✅ Single query retrieves BOTH events and orders (efficient!)
✅ Combined data structure: {event_count + order_count + created_at}
✅ Handles users with only events, only orders, or both (FULL OUTER JOIN)
✅ Timestamp included for tracking when data was retrieved
✅ Automatic temporary table creation by BigQuery

=== KEY RULES ===
✅ Always return complete, well-structured responses
✅ Include clear confirmation messages with counts and document IDs
✅ Log progress with print statements (they help debugging)
✅ Handle errors gracefully and return descriptive error messages
✅ The data_reference you receive will have BigQuery's auto-generated table names
""" 

DATA_ANALYTIC_AGENT_DESCRIPTION = """
Senior data analyst. Has full control over the bigquery and firestore of the adgen project. 
"""

data_analytic_agent = Agent(
    model='gemini-2.5-flash', 
    name='data_analytic_agent',
    description="Retrieves events from the bigquery table 'user_events' and tidies them up based on the request",
    instruction=DATA_ANALYTIC_AGENT_INSTRUCTION,
    tools=[
        retrieve_user_activity_counts,
        write_user_activity_to_firestore,
        write_segmentation_results_to_firestore,
    ],
)

# Bu modülde yalnızca alt ajan tanımlanır; root ajan MasterAgent tarafında belirlenir.

