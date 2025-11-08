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

    print(f"🔍 write_user_activity_to_firestore çağrıldı")
    print(f"📥 Gelen data_reference: {data_reference}")
    
    # BigQuery tablo bilgilerini al
    project = data_reference.get('project')
    dataset = data_reference.get('dataset')
    table = data_reference.get('table')
    location = data_reference.get('location')
    
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
    df = bq_to_dataframe(query, location=location)
    
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



def write_users_to_segmentate(user_ids: list):
    """
    'users_to_segmentate' collection'ına users'ı tek tek (state=pending) yazar.
    """
    print(f"🔍 write_users_to_segmentate çağrıldı")
    print(f"📥 {len(user_ids)} kullanıcı yazılacak")
    
    if not user_ids:
        return "No users to write"
    
    db = get_firestore_client()
    collection_ref = db.collection('users_to_segmentate')
    
    batch = db.batch()
    count = 0
    
    for user_id in user_ids:
        user_id_str = str(user_id)
        doc_ref = collection_ref.document(user_id_str)
        user_data = {
            'user_id': user_id_str,
            'state': 'pending',
            'created_at': firestore.SERVER_TIMESTAMP
        }
        batch.set(doc_ref, user_data)
        count += 1
        if count % 500 == 0:
            batch.commit()
            batch = db.batch()
            print(f"   ✅ {count} kullanıcı yazıldı...")
    
    if count % 500 != 0:
        batch.commit()
    
    print(f"✅ Toplam {count} kullanıcı 'users_to_segmentate' collection'ına yazıldı (state: pending)")
    return f"{count} users written to Firestore collection 'users_to_segmentate' with state: pending"


def compare_event_counts(data_reference: dict):
    """
    BigQuery temp tablosundan mevcut activity count'ları okur ve 
    Firestore'daki geçmiş verilerle karşılaştırır. Yeni/artan kullanıcıları
    'users_to_segmentate' collection'ına yazar.
    
    Args:
        data_reference (dict): {project, dataset, table, location?}
    Returns:
        dict: {status, data_reference, users_to_segment_count, written_to_firestore}
    """
    project = data_reference.get('project')
    dataset = data_reference.get('dataset')
    table = data_reference.get('table')
    location = data_reference.get('location')
    
    print(f"🔍 compare_event_counts çağrıldı. data_reference={data_reference}")
    
    if not all([project, dataset, table]):
        print("❌ Geçersiz tablo referansı!")
        return {
            "status": "error",
            "message": "Invalid table reference"
        }
    
    full_table_name = f"`{project}.{dataset}.{table}`"
    query = f"SELECT user_id, event_count, order_count FROM {full_table_name}"
    print(f"📊 BigQuery'den veri çekiliyor: {full_table_name}")
    df = bq_to_dataframe(query, location=location)
    
    current_activity = {
        str(row['user_id']): {
            'event_count': int(row['event_count']),
            'order_count': int(row['order_count'])
        }
        for _, row in df.iterrows()
    }
    print(f"✅ {len(current_activity)} kullanıcı verisi alındı")
    
    past_activity = get_past_events_from_firestore()
    
    new_or_increased_users = [
        user_id
        for user_id, current_data in current_activity.items()
        if (
            user_id not in past_activity or 
            current_data['event_count'] > past_activity.get(user_id, {}).get('event_count', 0) or
            current_data['order_count'] > past_activity.get(user_id, {}).get('order_count', 0)
        )
    ]
    
    print(f"📊 Segmentlenecek kullanıcı sayısı: {len(new_or_increased_users)} / {len(current_activity)}")
    
    if new_or_increased_users:
        write_result = write_users_to_segmentate(new_or_increased_users)
        print(f"✅ {write_result}")
    else:
        print("ℹ️ Segmentlenecek yeni kullanıcı bulunamadı")
    
    return {
        "status": "success",
        "data_reference": data_reference,
        "users_to_segment_count": len(new_or_increased_users),
        "written_to_firestore": len(new_or_increased_users) > 0
    }


def read_users_to_segmentate():
    """
    Firestore'dan state=pending olan 10 kullanıcıyı alır ve 
    BigQuery'den bu kullanıcıların tüm event ve orderlarını çeker.
    
    Returns:
        dict: {
            "status": "success" | "no_pending_users",
            "pending_total": int,
            "users": [
                {
                    "user_id": "...",
                    "events": [...],
                    "orders": [...]
                },
                ...
            ]
        }
    """
    print(f"🔍 read_users_to_segmentate çağrıldı")
    
    # Firestore'dan pending kullanıcıları al
    db = get_firestore_client()
    
    # Pending toplam sayısını ölç (karar için kullanılacak)
    try:
        pending_total = sum(
            1
            for _ in db.collection('users_to_segmentate')
            .where('state', '==', 'pending')
            .stream()
        )
    except Exception:
        pending_total = 0
    
    pending_users_query = (
        db.collection('users_to_segmentate')
        .where('state', '==', 'pending')
        .limit(10)
        .stream()
    )
    
    pending_users = [doc.to_dict()['user_id'] for doc in pending_users_query]
    
    if not pending_users:
        print("⚠️ Pending durumunda kullanıcı bulunamadı")
        return {
            "status": "no_pending_users",
            "users": [],
            "pending_total": pending_total
        }
    
    print(f"✅ {len(pending_users)} pending kullanıcı bulundu")
    
    # BigQuery'den bu kullanıcıların eventlerini ve orderlarını çek
    user_ids_str = "', '".join(pending_users)
    
    # Events query
    events_query = f"""
    SELECT session_id, user_id, event_name, event_time, path_name, payload, event_location
    FROM `adgen_bq.user_events`
    WHERE user_id IN ('{user_ids_str}')
    ORDER BY user_id, event_time
    """
    
    # Orders query
    orders_query = f"""
    SELECT order_id, user_id, session_id, products_payload, paid_amount, order_date, session_location
    FROM `adgen_bq.user_orders`
    WHERE user_id IN ('{user_ids_str}')
    ORDER BY user_id, order_date
    """
    
    print(f"📊 BigQuery'den eventler çekiliyor...")
    events_df = bq_to_dataframe(events_query)
    
    print(f"📊 BigQuery'den orderlar çekiliyor...")
    orders_df = bq_to_dataframe(orders_query)
    
    # Her kullanıcı için verileri organize et
    users_data = []
    for user_id in pending_users:
        user_events = events_df[events_df['user_id'] == user_id].to_dict('records')
        user_orders = orders_df[orders_df['user_id'] == user_id].to_dict('records')
        
        users_data.append({
            'user_id': user_id,
            'events': user_events,
            'orders': user_orders
        })
    
    print(f"✅ {len(users_data)} kullanıcının verileri hazırlandı")
    
    return {
        "status": "success",
        "users": users_data,
        "pending_total": pending_total
    }


def write_user_segmentation_result(user_id: str, segmentation_result: str):
    """
    Bir kullanıcının segmentasyon sonucunu 'user_segmentations' collection'ına yazar
    ve 'users_to_segmentate' tablosunda state'ini 'success' olarak günceller.
    
    Args:
        user_id (str): Kullanıcı ID'si
        segmentation_result (str): Segmentasyon sonucu
        
    Returns:
        str: Confirmation message
    """
    print(f"🔍 write_user_segmentation_result çağrıldı: {user_id}")
    
    db = get_firestore_client()
    
    # 1. user_segmentations collection'ına yaz
    segmentation_doc_ref = db.collection('user_segmentations').document(user_id)
    segmentation_doc_ref.set({
        'user_id': user_id,
        'segmentation_result': segmentation_result,
        'updated_at': firestore.SERVER_TIMESTAMP
    })
    
    # 2. users_to_segmentate'te state'i success yap
    pending_doc_ref = db.collection('users_to_segmentate').document(user_id)
    pending_doc_ref.delete()
    
    print(f"✅ Kullanıcı {user_id} segmentasyonu tamamlandı (state: success)")
    
    return f"User {user_id} segmentation result written and marked as success"


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


def write_segmentation_location_pairs_to_firestore():
    """
    For each user in user_segmentations, fetches their segmentation_result and user_location (city, country) from users collection.
    Creates/updates a document in 'segmentations' collection for each unique
    (segmentation_result, city, country) triple.

    - Document ID format: segmentation_city_country (all normalized with underscores)
    - Fields written:
        segmentation_name, city, country
        imageUrl: "" (ONLY when creating a new document)
        updated_at: server timestamp
    """
    db = get_firestore_client()

    # 1. Read user_segmentations collection (get all docs)
    segmentations_ref = db.collection('user_segmentations')
    segmentation_docs = segmentations_ref.stream()

    def normalize(s: str) -> str:
        return str(s or "").strip().replace("/", "_").replace("\\", "_").replace(",", "").replace(" ", "_")

    written = 0
    for doc in segmentation_docs:
        user_id = doc.id
        segmentation_result = doc.to_dict().get('segmentation_result', None)
        if not segmentation_result:
            continue

        # 2. Read user doc from 'users' collection
        user_doc = db.collection('users').document(user_id).get()
        if not user_doc.exists:
            continue
        user_data = user_doc.to_dict()
        # Try to get city and country
        city = user_data.get('city') or user_data.get('user_location') or user_data.get('main_location')
        # Try to extract country if possible
        country = user_data.get('country')
        # Optionally, parse user_location if possible
        if not country and isinstance(city, str) and ',' in city:
            split_loc = city.split(',')
            city = split_loc[0].strip()
            if len(split_loc) > 1:
                country = split_loc[1].strip()
        # Fallbacks if missing
        city = city if city else ''
        country = country if country else ''
        # Build doc_id as segmentation_city_country with underscores
        doc_id = f"{normalize(segmentation_result)}_{normalize(city)}_{normalize(country)}"
        seg_doc_ref = db.collection('segmentations').document(doc_id)
        existing = seg_doc_ref.get()
        base_payload = {
            "segmentation_name": segmentation_result,
            "city": city,
            "country": country,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }
        if existing.exists:
            # Preserve existing imageUrl if any; just upsert core fields
            seg_doc_ref.set(base_payload, merge=True)
        else:
            # Create with empty imageUrl so CreativeAgent can pick it up
            base_payload["imageUrl"] = ""
            seg_doc_ref.set(base_payload, merge=True)
        written += 1

    return f"{written} segmentation documents upserted into 'segmentations' with underscore IDs"


DATA_ANALYTIC_AGENT_INSTRUCTION = """
You are the Data Analytic Agent for the AdGen project. You handle ALL BigQuery and Firestore operations.
The Master Agent coordinates you, but YOU execute the actual data operations.
You will always return the result to the master agent without interrupting the execution.
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

📊 Tool 3: read_users_to_segmentate()
→ Purpose: Get 10 pending users and their events/orders from BigQuery
→ Parameters: NONE
→ Returns: dict with status and users array
→ What it does internally:
  • Queries Firestore for state=pending users (limit: 20)
  • For each user, queries BigQuery for:
    - All events from user_events table
    - All orders from user_orders table
  • Returns structured data: {user_id, events: [...], orders: [...]}

💾 Tool 4: write_user_segmentation_result(user_id: str, segmentation_result: str)
→ Purpose: Save segmentation result and mark user as complete
→ Parameters:
  • user_id (str): User ID
  • segmentation_result (str): Segmentation category/result
→ Returns: Confirmation message
→ What it does internally:
  • Writes to 'user_segmentations' collection: {user_id, segmentation_result, updated_at}
  • Updates 'users_to_segmentate' document: state = 'success', completed_at = <timestamp>

💾 Tool 5: write_segmentation_results_to_firestore(segmentation_results: dict)
→ Purpose: Write user segmentation analysis results to Firestore
→ Parameters:
  • segmentation_results (dict): User segmentation data
→ Returns: Confirmation message
→ What it does internally:
  • Writes results to 'segmentation_results' collection
  • Document ID: 'latest_batch'

=== YOUR MAIN WORKFLOW ===

A. Master agent will transfer to you to perform your task end-to-end without user interaction.

STEP 1:
Use your retrieve_user_activity_counts tool to retrieve the user activity counts and then pass its data_reference to compare_event_counts tool.
  You return in given format(note that values are examples):
  {
    "status": "success",
    "message": "User activity counts (events + orders) successfully written to BigQuery.",
    "data_reference": {
      "project": "eighth-upgrade-475017-u5",
      "dataset": "_52d6b668_19a5_13ca_3c8",
      "table": "anonc4ca20ccc0ea49af9846718f5a1779f8e38f03b418fa376084b877282982585d"
    }
  }

STEP 2:
Compare the events with compare_event_counts(data_reference). This function will write the users to segmentate to Firestore (state='pending').
Immediately AFTER comparing, you MUST call write_user_activity_to_firestore with the SAME data_reference from STEP 1 to persist the latest snapshot to the 'user_activity_counts' collection.

STEP 3:
Run read_users_to_segmentate tool to get the users to segmentate.
If there are no users to segmentate, return to the master agent and report that no users were segmented.
Important: Do NOT early-return based on pending length. Process up to 20 users now.
After finishing all writes (STEP 5), decide final status using 'pending_total' returned from STEP 3:
  let remaining = pending_total - 20
  If remaining > 0 => return {"status": "continue"}
  Else => return {"status": "finished"}

STEP 4: Perform segmentation on each user (AI analysis)
STEP 4.1. Give 6 segmentations each based on 6 different criteria.
Step 4.1.1. Based on unique_session_count / total_events_count. 0-10 low 10-20 medium 20+ high
Step 4.1.2. Based on unique_session_count / total_orders_count. 0-2 low 2-5 medium 6+ high
Step 4.1.3. Based on user's total spent. 0-250 low 250-1000 medium 1000+ high
Step 4.1.4. Based on gift wrap in last session. Yes or No
Step 4.1.5. Based on shopping cart abandonment in last session. Yes or No
Step 4.1.6. Based on different location in last session. Yes or No 
Step 4.2. Expected result schema is session2EventCountLow-session2OrderCountLow-totalSpentLow-giftWrapYes-shoppingCartAbandonmentYes-differentLocationNo




STEP 5: For each user, call write_user_segmentation_result(user_id, result)
  You:
  1. Write result to 'user_segmentations' collection
  2. Mark user as 'success' in 'users_to_segmentate'
  3. Return confirmation


STEP 6 (FINAL RETURN FORMAT - STRICT):
Return ONLY a minimal JSON object. No prose, no lists, no logs:
  {"status": "finished"}   or   {"status": "continue"}

SIDE TASK. Populate 'segmentations' collection (doc_id = segmentation_city_country):
1. Run write_segmentation_location_pairs_to_firestore tool to upsert docs into 'segmentations'.
2. Behavior: For each user segmentation, create/update a doc with fields {segmentation_name, city, country}. When creating a new doc, set imageUrl="".
3. Return confirmation like: "N segmentation documents upserted into 'segmentations' with underscore IDs"

SIDE TASK. When Master Agent says: "Write user activity counts to firestore"

STEP 1: Master calls retrieve_user_activity_counts()
  You return below to the master agent finish your task.:
  {
    "status": "success",
    "data_reference": {
      "project": "eighth-upgrade-475017-u5",
      "dataset": "_52d6b668_19a5_13ca_3c8",
      "table": "anonc4ca20ccc0ea49af9846718f5a1779f8e38f03b418fa376084b877282982585d"
    }
  }
After returning it to master agent, master agent will give you another task for step 2.
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

"""


DATA_ANALYTIC_AGENT_DESCRIPTION = """
Senior data analyst. Has full control over the bigquery and firestore of the adgen project. 
"""

data_analytic_agent = Agent(
    model='gemini-2.5-pro', 
    name='data_analytic_agent',
    description="Retrieves events from the bigquery table 'user_events' and tidies them up based on the request",
    instruction=DATA_ANALYTIC_AGENT_INSTRUCTION,
    tools=[
        retrieve_user_activity_counts,
        write_user_activity_to_firestore,
        write_users_to_segmentate,
        compare_event_counts,
        read_users_to_segmentate,
        write_user_segmentation_result,
        write_segmentation_results_to_firestore,
        write_segmentation_location_pairs_to_firestore,
    ],
)

# Bu modülde yalnızca alt ajan tanımlanır; root ajan MasterAgent tarafında belirlenir.

