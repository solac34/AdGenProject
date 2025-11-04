from google.adk.agents.llm_agent import Agent
from .bq_helper import bq_to_dataframe
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from MasterAgent.firestore_helper import get_firestore_client
from google.cloud import firestore

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
        'orders': orders_records
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

def retrieve_event_counts(offset: int = 0, limit: int = 500): 
    """
    BigQuery'den event count'ları alır.
    
    Args:
        offset: Başlangıç pozisyonu (pagination için)
        limit: Alınacak kayıt sayısı (max 500)
    
    Returns:
        dict: {user_id: count, ...}
    """
    df = bq_to_dataframe(f"""
    SELECT user_id, COUNT(*) as count FROM `adgen_bq.user_events`
    WHERE user_id != 'anonymous'
    GROUP BY user_id
    ORDER BY user_id ASC
    LIMIT {limit}
    OFFSET {offset}
    """)
    records = df.to_dict(orient='records')
    # Native Python tipine dönüştür - JSON serialize ve token optimizasyonu için
    return {str(r.get('user_id')): int(r.get('count')) for r in records}


def retrieve_users(): 
    return "users"

def analyze_user_segmentation(user_id: str):
    """
    Kullanıcının RFM ve davranış analizi yaparak segment oluşturur.
    
    Segmentler:
    - Recency (R): Son aktivite (event_time)
    - Frequency (F): Belirli zaman dilimindeki toplam etkinlik
    - Purchase Events: checkout_success sayısı
    - Cart Abandonment: cart_clear/checkout_click var ama checkout_success yok
    - Payload Details: Ürün adları, miktarlar (quantity), tutarlar (totalCents)
    - Geographic: event_location bazlı coğrafi segment
    """
    from collections import Counter
    from datetime import datetime
    
    user_data = retrieve_single_user_data(user_id)
    events = user_data.get('events', [])
    orders = user_data.get('orders', [])
    
    # === RECENCY (R) ===
    recency_segment = "Low"
    if events:
        try:
            # En son event zamanı
            latest_event_time = events[0].get('event_time', '')
            if latest_event_time:
                latest_time = datetime.fromisoformat(latest_event_time.replace('Z', '+00:00'))
                days_since = (datetime.now(latest_time.tzinfo) - latest_time).days
                if days_since <= 7:
                    recency_segment = "High"
                elif days_since <= 30:
                    recency_segment = "Medium"
        except:
            pass
    
    # === FREQUENCY (F) ===
    frequency_segment = "Low"
    total_events = len(events)
    if total_events >= 50:
        frequency_segment = "High"
    elif total_events >= 20:
        frequency_segment = "Medium"
    
    # === PURCHASE EVENTS ===
    checkout_success_count = len([e for e in events if e.get('event_name') == 'checkout_success'])
    purchase_segment = "No Purchase"
    if checkout_success_count > 0:
        purchase_segment = "Real Buyer"
    
    # === CART ABANDONMENT ===
    cart_clear_events = [e for e in events if e.get('event_name') == 'cart_clear']
    checkout_click_events = [e for e in events if e.get('event_name') == 'checkout_click']
    cart_abandonment = False
    if (len(cart_clear_events) > 0 or len(checkout_click_events) > 0) and checkout_success_count == 0:
        cart_abandonment = True
    
    # === PAYLOAD DETAILS ===
    # Hediye tespiti, ürün kategorileri, fiyat aralıkları
    product_categories = []
    total_spent = 0
    is_gift_buyer = False
    
    for event in events:
        payload = event.get('payload', {})
        if isinstance(payload, str):
            import json
            try:
                payload = json.loads(payload)
            except:
                payload = {}
        
        if isinstance(payload, dict):
            # Ürün adları
            for key, value in payload.items():
                val_str = str(value).lower()
                if 'gift' in val_str or 'hediye' in val_str:
                    is_gift_buyer = True
                # Kategori tespiti (basit)
                if 'fashion' in val_str or 'clothing' in val_str:
                    product_categories.append('Fashion')
                elif 'electronic' in val_str or 'tech' in val_str:
                    product_categories.append('Electronics')
            
            # Tutar bilgisi
            total_cents = payload.get('totalCents', 0)
            if total_cents:
                total_spent += int(total_cents) / 100
    
    price_segment = "Low Spender"
    if total_spent > 500:
        price_segment = "High Spender"
    elif total_spent > 100:
        price_segment = "Medium Spender"
    
    # === GEOGRAPHIC ===
    locations = [e.get('event_location') for e in events if e.get('event_location')]
    geographic_segment = "Unknown"
    if locations:
        location_counts = Counter(locations)
        most_common_location = location_counts.most_common(1)[0][0]
        geographic_segment = most_common_location
    
    return {
        'user_id': str(user_id),
        'recency_segment': recency_segment,
        'frequency_segment': frequency_segment,
        'purchase_segment': purchase_segment,
        'cart_abandonment': cart_abandonment,
        'is_gift_buyer': is_gift_buyer,
        'price_segment': price_segment,
        'geographic_segment': geographic_segment,
        'product_categories': list(set(product_categories)),
        'total_events': total_events,
        'total_orders': len(orders),
        'total_spent_usd': round(total_spent, 2)
    }

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

def segmentate_users_batch(user_ids: list):
    """
    Kullanıcı listesini batch olarak segmente eder (max 100).
    Her kullanıcı için analyze_user_segmentation çağrılır.
    
    Args:
        user_ids: list of user_id strings
        
    Returns:
        dict: {user_id: segmentation_data, ...}
    """
    # Batch size kontrolü
    if len(user_ids) > 100:
        user_ids = user_ids[:100]
        print(f"Warning: User list truncated to 100 users")
    
    results = {}
    for idx, user_id in enumerate(user_ids):
        try:
            print(f"Analyzing user {idx+1}/{len(user_ids)}: {user_id}")
            segmentation = analyze_user_segmentation(user_id)
            results[user_id] = segmentation
        except Exception as e:
            print(f"Error analyzing user {user_id}: {e}")
            results[user_id] = {
                'user_id': str(user_id),
                'error': str(e),
                'recency_segment': 'Low',
                'frequency_segment': 'Low',
                'purchase_segment': 'No Purchase',
                'cart_abandonment': False,
                'is_gift_buyer': False,
                'price_segment': 'Low Spender',
                'geographic_segment': 'Unknown',
                'product_categories': [],
                'total_events': 0,
                'total_orders': 0,
                'total_spent_usd': 0.0
            }
    
    return results

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

def process_all_users_in_batches():
    """
    TÜM kullanıcıları batch batch işler.
    
    Workflow:
    1. 500'er kullanıcı grupları halinde event count al
    2. Her batch için compare yap
    3. Yeni/aktif kullanıcılar varsa segmentate et
    4. Sonuçları Firestore'a yaz
    5. Sonraki 500'lük batch'e geç
    6. Kullanıcı kalmayana kadar devam et
    
    Returns:
        dict: {
            'total_processed': int,
            'total_segmented': int,
            'batches_processed': int
        }
    """
    offset = 0
    batch_size = 500
    total_processed = 0
    total_segmented = 0
    batches_processed = 0
    
    print("🚀 Starting batch processing for ALL users...")
    
    while True:
        print(f"\n📦 Processing batch {batches_processed + 1} (offset: {offset})")
        
        # 1. 500 kullanıcı al
        current_batch_counts = retrieve_event_counts(offset=offset, limit=batch_size)
        
        if not current_batch_counts or len(current_batch_counts) == 0:
            print("✅ No more users to process. All done!")
            break
        
        print(f"   Retrieved {len(current_batch_counts)} users")
        total_processed += len(current_batch_counts)
        
        # 2. Compare et
        users_to_segment = compare_event_counts(current_batch_counts)
        print(f"   Found {len(users_to_segment)} new/active users")
        
        # 3. Firestore'a yaz (her batch için)
        write_new_events_to_firestore(current_batch_counts)
        print(f"   ✓ Wrote event counts to Firestore")
        
        # 4. Eğer yeni kullanıcı varsa segmentate et
        if users_to_segment and len(users_to_segment) > 0:
            # 100'er 100'er segmentate et
            for i in range(0, len(users_to_segment), 100):
                segment_batch = users_to_segment[i:i+100]
                print(f"   🔍 Segmenting users {i+1}-{min(i+100, len(users_to_segment))} of {len(users_to_segment)}")
                
                segmentation_results = segmentate_users_batch(segment_batch)
                write_segmentation_results_to_firestore(segmentation_results)
                
                total_segmented += len(segmentation_results)
            
            print(f"   ✓ Segmented and saved {len(users_to_segment)} users")
        else:
            print(f"   ⏭️  No new users in this batch, skipping segmentation")
        
        batches_processed += 1
        offset += batch_size
        
        # Eğer son batch tam 500 değilse, bu son batch demektir
        if len(current_batch_counts) < batch_size:
            print(f"\n✅ Reached last batch (only {len(current_batch_counts)} users)")
            break
    
    result = {
        'total_processed': total_processed,
        'total_segmented': total_segmented,
        'batches_processed': batches_processed
    }
    
    print(f"\n🎉 COMPLETE!")
    print(f"   Total users processed: {total_processed}")
    print(f"   Total users segmented: {total_segmented}")
    print(f"   Total batches: {batches_processed}")
    
    return result


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
→ Use segmentate_users_batch(user_ids)
→ This will analyze each user with RFM + behavior analysis:
  {
    "user_123": {
      "user_id": "user_123",
      "recency_segment": "High|Medium|Low",
      "frequency_segment": "High|Medium|Low",
      "purchase_segment": "Real Buyer|No Purchase",
      "cart_abandonment": true/false,
      "is_gift_buyer": true/false,
      "price_segment": "High Spender|Medium Spender|Low Spender",
      "geographic_segment": "New York|Paris|Unknown",
      "product_categories": ["Fashion", "Electronics"],
      "total_events": 45,
      "total_orders": 3,
      "total_spent_usd": 234.56
    }
  }
→ Maximum 100 users per batch
→ Return: segmentation dictionary

📌 "write segmentation results" + passes results
→ Use write_segmentation_results_to_firestore(results)
→ Return: confirmation

📌 "process all users in batches" or "run full batch processing"
→ Use process_all_users_in_batches()
→ This will automatically:
  1. Retrieve all users in 500-user batches
  2. Compare each batch with past data
  3. Segmentate new/active users (100 at a time)
  4. Write results to Firestore
  5. Continue until ALL users are processed
→ Return: summary with total_processed, total_segmented, batches_processed

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
        analyze_user_segmentation,
        segmentate_users_batch,
        get_an_hour_ago_event_counts,
        write_new_events_to_firestore,
        write_segmentation_results_to_firestore,
        compare_event_counts,
        process_all_users_in_batches
    ],
)

# Bu modülde yalnızca alt ajan tanımlanır; root ajan MasterAgent tarafında belirlenir.

