from google.adk.agents.llm_agent import Agent
from .bq_helper import bq_to_dataframe
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from MasterAgent.firestore_helper import get_firestore_client

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

def retrieve_single_user_data(user_id: str): 
    """
    Tek bir kullanıcının event ve order verilerini alır.
    Token limitini aşmamak için son 100 event ve 50 order ile sınırlandırılmış.
    """
    events_df = bq_to_dataframe(f"""
    SELECT * FROM `adgen_bq.user_events`
    WHERE user_id = '{user_id}'
    ORDER BY event_time DESC
    LIMIT 100
    """)

    orders_df = bq_to_dataframe(f"""
    SELECT * FROM `adgen_bq.user_orders`
    WHERE user_id = '{user_id}'
    ORDER BY order_date DESC
    LIMIT 50
    """)

    if 'event_id' in events_df.columns:
        events_df = events_df.drop(columns=['event_id'])
    if 'order_id' in orders_df.columns:
        orders_df = orders_df.drop(columns=['order_id'])

    # Native Python tipine dönüştür
    events_records = events_df.to_dict(orient='records')
    orders_records = orders_df.to_dict(orient='records')
    
    # Timestamp ve numpy tiplerini standart Python tiplerine dönüştür
    for event in events_records:
        for key, value in event.items():
            if hasattr(value, 'item'):  # numpy tipi
                event[key] = value.item()
            elif hasattr(value, 'isoformat'):  # datetime
                event[key] = value.isoformat()
                
    for order in orders_records:
        for key, value in order.items():
            if hasattr(value, 'item'):  # numpy tipi
                order[key] = value.item()
            elif hasattr(value, 'isoformat'):  # datetime
                order[key] = value.isoformat()

    return {
        'events': events_records,
        'orders': orders_records,
        'summary': f"{len(events_records)} events, {len(orders_records)} orders"
    }

def retrieve_events(user_id: list = [], event_name: str = "", event_time: str = "", path_name: str = "", payload: dict = {}, event_location: str = ""): 
    """
    Filtrelere göre event'leri getirir.
    Token limitini aşmamak için 200 kayıtla sınırlandırılmış.
    """
    conditions = []

    if len(user_id) > 0:
        user_ids_formatted = "', '".join(user_id)
        conditions.append(f"user_id IN ('{user_ids_formatted}')")
    if event_name != "":
        conditions.append(f"event_name = '{event_name}'")
    if event_time != "":
        conditions.append(f"event_time = '{event_time}'")
    if path_name != "":
        conditions.append(f"path_name = '{path_name}'")
    if len(payload) > 0:
        conditions.append(f"payload = '{payload}'")
    if event_location != "":
        conditions.append(f"event_location = '{event_location}'")

    where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""

    df = bq_to_dataframe(f"""
    SELECT * FROM `adgen_bq.user_events`
    {where_clause}
    ORDER BY event_time DESC
    LIMIT 200
    """)
    
    records = df.to_dict(orient='records')
    # Native Python tipine dönüştür
    for record in records:
        for key, value in record.items():
            if hasattr(value, 'item'):
                record[key] = value.item()
            elif hasattr(value, 'isoformat'):
                record[key] = value.isoformat()
    
    return records

def retrieve_orders(user_id: list = [], order_date: str = "", order_amount: float = -999999.0): 
    """
    Filtrelere göre order'ları getirir.
    Token limitini aşmamak için 100 kayıtla sınırlandırılmış.
    """
    conditions = []

    if len(user_id) > 0:
        user_ids_formatted = "', '".join(user_id)
        conditions.append(f"user_id IN ('{user_ids_formatted}')")
    if order_date != "":
        conditions.append(f"order_date = '{order_date}'")
    if order_amount > -999999.0:
        conditions.append(f"order_amount = {order_amount}")

    where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""

    df = bq_to_dataframe(f"""
    SELECT * FROM `adgen_bq.user_orders`
    {where_clause}
    ORDER BY order_date DESC
    LIMIT 100
    """)
    
    records = df.to_dict(orient='records')
    # Native Python tipine dönüştür
    for record in records:
        for key, value in record.items():
            if hasattr(value, 'item'):
                record[key] = value.item()
            elif hasattr(value, 'isoformat'):
                record[key] = value.isoformat()
    
    return records

def retrieve_order_counts(): 
    """
    BigQuery'den order count'ları alır.
    Token limitini aşmamak için son 500 aktif kullanıcıyla sınırlandırılmış.
    """
    df = bq_to_dataframe(f"""
    SELECT user_id, COUNT(*) as count FROM `adgen_bq.user_orders`
    GROUP BY user_id
    ORDER BY count DESC
    LIMIT 500
    """)
    records = df.to_dict(orient='records')
    # Native Python tipine dönüştür - JSON serialize ve token optimizasyonu için
    return {str(r.get('user_id')): int(r.get('count')) for r in records}

def retrieve_event_counts(): 
    """
    BigQuery'den event count'ları alır.
    Token limitini aşmamak için son 500 aktif kullanıcıyla sınırlandırılmış.
    """
    df = bq_to_dataframe(f"""
    SELECT user_id, COUNT(*) as count FROM `adgen_bq.user_events`
    GROUP BY user_id
    ORDER BY count DESC
    LIMIT 500
    """)
    records = df.to_dict(orient='records')
    # Native Python tipine dönüştür - JSON serialize ve token optimizasyonu için
    return {str(r.get('user_id')): int(r.get('count')) for r in records}


def retrieve_users(): 
    return "users"

def get_an_hour_ago_event_counts():
    """
    Firestore'dan bir saat önceki 'user_event_counts' koleksiyonunu okur ve 
    user_id:event_count dictionary olarak döner.
    Token limitini aşmamak için son 1000 kayıtla sınırlandırılmış.
    """
    db = get_firestore_client()
    collection_ref = db.collection('user_event_counts')
    # Token limitini aşmamak için limit koy
    docs = collection_ref.limit(1000).stream()
    
    result = {}
    for doc in docs:
        data = doc.to_dict()
        # Native Python tipine dönüştür - JSON serialize için
        result[str(doc.id)] = int(data.get('count', data.get('event_count', 0)))
    
    return result

def write_new_events_to_firestore(user2event_count: dict):
    """
    Yeni event count'larını Firestore'a yazar.
    """
    db = get_firestore_client()
    collection_ref = db.collection('user_event_counts')
    
    written_count = 0
    for user_id, event_count in user2event_count.items():
        collection_ref.document(str(user_id)).set({
            'count': int(event_count)
        })
        written_count += 1

    return f"{written_count} user event counts written to firestore"

def write_segmentation_results_to_firestore(segmentation_results: dict):
    db = get_firestore_client()
    collection_ref = db.collection('segmentation_results')
    for user_id, segmentation_result in segmentation_results.items():
        collection_ref.document(str(user_id)).set({
            'user_id': user_id,
            'segmentation_result': segmentation_result
        })
    return f"{len(segmentation_results)} segmentation results written to firestore"

def compare_event_counts(current_user2event_count: dict):
    """
    Mevcut event count'ları Firestore'daki geçmiş verilerle karşılaştırır.
    Yeni veya event sayısı artan kullanıcıların listesini döner.
    """
    past_events = get_an_hour_ago_event_counts()
    new_or_increased_users = []
    
    for user_id, event_count in current_user2event_count.items():
        user_id_str = str(user_id)
        event_count_int = int(event_count)
        # Yeni user veya event sayısı artmış user
        if user_id_str not in past_events or event_count_int > past_events[user_id_str]:
            new_or_increased_users.append(user_id_str)
    
    return new_or_increased_users


DATA_ANALYTIC_AGENT_INSTRUCTION = """
You are a Senior Data Scientist for the AdGen project.
Your role: Analyze user behavior from BigQuery and Firestore, create personalized user segments for targeted advertising.

=== YOUR TOOLS ===

📊 Data Retrieval Tools:
1. retrieve_event_counts() → Get current event counts from BigQuery (top 500 active users)
2. retrieve_order_counts() → Get order counts from BigQuery (top 500 active users)
3. retrieve_events(user_id[], event_name, event_time, path_name, payload, event_location) → Filter specific events
4. retrieve_orders(user_id[], order_date, order_amount) → Filter specific orders
5. retrieve_single_user_data(user_id) → Get detailed events & orders for ONE user (last 100 events, 50 orders)
6. retrieve_users() → Get user list

🔍 Analysis Tools:
7. get_an_hour_ago_event_counts() → Fetch past event counts from Firestore (for comparison)
8. compare_event_counts(current_counts_dict) → Compare current vs past, return new/active user_ids
   - Input: {"user_123": 45, "user_456": 78}
   - Output: ["user_123", "user_789"] (new or increased activity)

💾 Storage Tools:
9. write_new_events_to_firestore(user2event_count_dict) → Save current counts to Firestore
10. write_segmentation_results_to_firestore(segmentation_results_dict) → Save segments

=== WORKFLOW RESPONSES ===

When Master Agent asks you to:

📌 "retrieve current event counts"
→ Use retrieve_event_counts()
→ Return: {"user_id": count, ...}

📌 "compare counts with past data" + passes counts
→ Use compare_event_counts(counts)
→ Return: ["user_id1", "user_id2", ...] (list of new/active users)

📌 "write counts to firestore" + passes counts
→ Use write_new_events_to_firestore(counts)
→ Return: confirmation message

📌 "segmentate these users" + passes user_id list
→ For EACH user_id:
  1. Call retrieve_single_user_data(user_id)
  2. Analyze their behavior:
     - Events: page_view, cart_add, cart_remove, checkout, purchase
     - Orders: what they bought, spending patterns
     - Location: home vs current location
     - Product preferences: categories, price range, seasonality
  
  3. Create TWO-LEVEL segmentation:
     
     a) DETAILED (segmentation_userLevel_payload):
        "User from NYC, 25-35 age group, high spender ($500+/month). Currently in Paris. 
        Recent purchases: winter jackets, romantic gifts. Pattern suggests holiday with partner.
        Interests: fashion, premium brands, travel accessories."
     
     b) SIMPLE (segmentation_segmLevel_payload):
        {"home_location": "NYC", "current_location": "Paris", "category_preference": "fashion",
         "price_tier": "premium", "shopping_pattern": "gift_buyer", "avg_basket": 150}

→ Return: {"user_id1": segmentation_data, "user_id2": segmentation_data, ...}

📌 "write segmentation results" + passes results
→ Use write_segmentation_results_to_firestore(results)
→ Return: confirmation

=== KEY RULES ===
✅ Always convert data to native Python types (int, str, float) - NO numpy types
✅ Keep responses concise and structured
✅ If data is empty, clearly state "no data found"
✅ Use LIMIT in queries - data is already optimized for token limits
✅ Segmentation must be actionable for ad targeting
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
        retrieve_events, 
        retrieve_orders, 
        retrieve_order_counts, 
        retrieve_users, 
        retrieve_event_counts,
        retrieve_single_user_data,
        get_an_hour_ago_event_counts,
        write_new_events_to_firestore,
        compare_event_counts
    ],
)

# Bu modülde yalnızca alt ajan tanımlanır; root ajan MasterAgent tarafında belirlenir.

