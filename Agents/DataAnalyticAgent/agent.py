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




def retrieve_order_counts(): 

    sql_query = f"""
    SELECT user_id, COUNT(*) as count FROM `adgen_bq.user_orders`
    GROUP BY user_id
    ORDER BY count DESC
    """
    
    print(f"🔍 retrieve_order_counts çağrıldı")
    
    # Query'yi çalıştır - BigQuery otomatik temp table oluşturacak
    result = query_to_temp_table(sql_query)
    result["message"] = "User order counts successfully written to BigQuery for processing."
    
    print(f"✅ retrieve_order_counts RESULT:")
    print(f"   Data Reference: {result.get('data_reference')}")
    
    return result


def retrieve_event_counts(): 

    sql_query = f"""
    SELECT user_id, COUNT(*) as count FROM `adgen_bq.user_events`
    WHERE user_id != 'anonymous'
    GROUP BY user_id
    ORDER BY user_id ASC
    """
    
    print(f"🔍 retrieve_event_counts çağrıldı")
    print(f"📝 SQL Query: {sql_query[:100]}...")
    
    # Query'yi çalıştır - BigQuery otomatik temp table oluşturacak
    result = query_to_temp_table(sql_query)
    result["message"] = "User event counts successfully written to BigQuery for processing."
    
    print(f"✅ retrieve_event_counts RESULT:")
    print(f"   Status: {result.get('status')}")
    print(f"   Data Reference: {result.get('data_reference')}")
    
    return result



def write_new_events_to_firestore(data_reference: dict):
    """
    BigQuery temp tablosundan event count'ları okur ve Firestore'a tek bir döküman olarak yazar.
    
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
    print(f"🔍 write_new_events_to_firestore çağrıldı")
    print(f"📥 Gelen data_reference: {data_reference}")
    print(f"📥 data_reference type: {type(data_reference)}")
    
    # BigQuery tablo bilgilerini al
    project = data_reference.get('project')
    dataset = data_reference.get('dataset')
    table = data_reference.get('table')
    
    print(f"   project: {project}")
    print(f"   dataset: {dataset}")
    print(f"   table: {table}")
    
    if not all([project, dataset, table]):
        print("❌ Geçersiz tablo referansı!")
        print(f"   Missing: project={bool(project)}, dataset={bool(dataset)}, table={bool(table)}")
        return "Error: Invalid table reference"
    
    # BigQuery'den veriyi çek
    full_table_name = f"`{project}.{dataset}.{table}`"
    query = f"SELECT user_id, count FROM {full_table_name}"
    
    print(f"📊 BigQuery'den veri çekiliyor: {full_table_name}")
    df = bq_to_dataframe(query)
    
    # DataFrame'i dictionary'ye çevir
    event_counts = {str(row['user_id']): int(row['count']) for _, row in df.iterrows()}
    
    print(f"✅ {len(event_counts)} kullanıcı verisi alındı")
    
    # Firestore'a tek döküman olarak yaz
    db = get_firestore_client()
    
    # Benzersiz döküman ID oluştur (timestamp bazlı)
    doc_id = f"snapshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    doc_ref = db.collection('user_event_counts').document(doc_id)
    
    doc_ref.set({
        'event_counts': event_counts,
        'total_users': len(event_counts),
        'createdAt': firestore.SERVER_TIMESTAMP,
        'table_source': f"{project}.{dataset}.{table}"
    })
    
    print(f"✅ Firestore'a yazıldı: user_event_counts/{doc_id}")

    return f"{len(event_counts)} user event counts written to firestore as document: {doc_id}"



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

📊 Tool 1: retrieve_event_counts()
→ Purpose: Query BigQuery for user event counts and create a temporary table
→ Parameters: NONE
→ Returns: A dictionary with this EXACT structure:
  {
    "status": "success",
    "message": "User event counts successfully written to BigQuery for processing.",
    "data_reference": {
      "project": "eighth-upgrade-475017-u5",
      "dataset": "temp_datasets",
      "table": "user_events_<uuid>"
    }
  }
→ What it does internally:
  • Queries `adgen_bq.user_events` table
  • Groups by user_id, counts events
  • Writes results to a temp BigQuery table
  • Returns the temp table reference

📊 Tool 2: retrieve_order_counts()
→ Purpose: Query BigQuery for user order counts and create a temporary table
→ Parameters: NONE
→ Returns: Same structure as retrieve_event_counts() but for orders
→ What it does internally:
  • Queries `adgen_bq.user_orders` table
  • Groups by user_id, counts orders
  • Writes results to a temp BigQuery table
  • Returns the temp table reference

💾 Tool 3: write_new_events_to_firestore(data_reference: dict)
→ Purpose: Read from BigQuery temp table and write a snapshot to Firestore
→ Parameters: 
  • data_reference (dict): The BigQuery table reference with keys:
    - "project": GCP project ID
    - "dataset": BigQuery dataset name
    - "table": Temp table name
→ Returns: Confirmation message string (e.g., "1234 user event counts written to firestore as document: snapshot_20251105_120000")
→ What it does internally:
  • Queries the BigQuery temp table using the provided reference
  • Reads all user_id and count pairs
  • Creates a SINGLE Firestore document in 'user_event_counts' collection
  • Document structure:
    {
      'event_counts': {user_id: count, ...},
      'total_users': 1234,
      'createdAt': <timestamp>,
      'table_source': 'project.dataset.table'
    }

💾 Tool 4: write_segmentation_results_to_firestore(segmentation_results: dict)
→ Purpose: Write user segmentation analysis results to Firestore
→ Parameters:
  • segmentation_results (dict): User segmentation data
→ Returns: Confirmation message
→ What it does internally:
  • Writes results to 'segmentation_results' collection
  • Document ID: 'latest_batch'

=== IMPORTANT WORKFLOW NOTES ===

When Master Agent asks you to:

A. "Run retrieve_event_counts":
   → Execute retrieve_event_counts() with NO parameters
   → Return the ENTIRE result dictionary to Master Agent
   
B. "Run write_new_events_to_firestore with <data>":
   → The Master Agent will pass you ONLY the data_reference object
   → NOT the full result dictionary
   → The data_reference contains: {project, dataset, table}
   → Execute write_new_events_to_firestore(data_reference)
   → Return the confirmation message

=== DATA FLOW EXAMPLE ===

Step 1: Master calls retrieve_event_counts()
  You return:
  {
    "status": "success",
    "data_reference": {
      "project": "eighth-upgrade-475017-u5",
      "dataset": "temp_datasets",
      "table": "user_events_abc123"
    }
  }

Step 2: Master extracts data_reference and calls write_new_events_to_firestore()
  Master passes you ONLY:
  {
    "project": "eighth-upgrade-475017-u5",
    "dataset": "temp_datasets",
    "table": "user_events_abc123"
  }
  
  You query BigQuery, write to Firestore, return confirmation.

=== KEY RULES ===
✅ Always return complete, well-structured responses
✅ Include clear confirmation messages with counts and document IDs
✅ Log progress with print statements (they help debugging)
✅ Handle errors gracefully and return descriptive error messages
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
        retrieve_order_counts, 
        retrieve_event_counts,
        write_new_events_to_firestore,
        write_segmentation_results_to_firestore,
    ],
)

# Bu modülde yalnızca alt ajan tanımlanır; root ajan MasterAgent tarafında belirlenir.

