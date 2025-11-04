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
    events_df = bq_to_dataframe(f"""
    SELECT * FROM `adgen_bq.user_events`
    WHERE user_id = '{user_id}'
    """)

    orders_df = bq_to_dataframe(f"""
    SELECT * FROM `adgen_bq.user_orders`
    WHERE user_id = '{user_id}'
    """)

    print(events_df.columns)
    print(orders_df.columns)

    events_df.drop(columns=['event_id'], inplace=True)
    orders_df.drop(columns=['order_id'], inplace=True)

    return {
        'events': events_df.to_dict(orient='records'),
        'orders': orders_df.to_dict(orient='records')
    }

def retrieve_events(user_id: list = [], event_name: str = "", event_time: str = "", path_name: str = "", payload: dict = {}, event_location: str = ""): 
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
    """)
    # ADK tool sonuçları JSON-serialize edilebilir olmalı
    return df.to_dict(orient='records')

def retrieve_orders(user_id: list = [], order_date: str = "", order_amount: float = -999999.0): 
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
    """)
    # ADK tool sonuçları JSON-serialize edilebilir olmalı
    return df.to_dict(orient='records')

def retrieve_order_counts(): 
    
    df = bq_to_dataframe(f"""
    SELECT user_id, COUNT(*) as count FROM `adgen_bq.user_orders`
    GROUP BY user_id
    """)
    records = df.to_dict(orient='records')
    return {r.get('user_id'): r.get('count') for r in records}

def retrieve_event_counts(): 
    
    df = bq_to_dataframe(f"""
    SELECT user_id, COUNT(*) as count FROM `adgen_bq.user_events`
    GROUP BY user_id
    """)
    records = df.to_dict(orient='records')
    return {r.get('user_id'): r.get('count') for r in records}


def retrieve_users(): 
    return "users"

def get_an_hour_ago_event_counts():
    """
    Firestore'dan bir saat önceki 'user_event_counts' koleksiyonunu okur ve 
    user_id:event_count dictionary olarak döner.
    """
    db = get_firestore_client()
    collection_ref = db.collection('user_event_counts')
    docs = collection_ref.stream()
    
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
You are senior data scientist. You are in this role for the adgen project. Adgen project is designed to tailor ads for different segmentated users and  show those ads in a webapp, currently adg-ecommerce.
You will be given a request by master agent to retrieve the events or orders, segmentate it based on users, retrieve the users data from bigtable, and return the results to master agent.
You have these tools that will cover you up for everything that will be asked and help you:
1.'retrieve_events' tool to retrieve the events from the bigquery table with given user_id list and different parameters. 
1a.event_id is the unique identifier of the event.
1b.session_id parameter is a string with session_id to retrieve the events for a specific session.
1c.user_id parameter is a list where you will pass the user_id list to retrieve the events for each user.
1d.event_name parameter is a string with event names such as cart_clicked or page_view. 
1e. event_time is when the event happened. yyyy-mm-dd hh:mm:ss format.
1f. path_name is the path of the page where the event happened.
1g. payload is the payload of the event.
1h. event_location is the location of the event.

2.'retrieve_orders' tool to retrieve the orders from the bigquery table with given user_id list and different parameters.
2a.order_id is the unique identifier of the order.
2b.user_id parameter is a list where you will pass the user_id list to retrieve the orders for each user. user_id is string in the table but the tool takes input as a list of strings.
2c.order_date is when the order happened. yyyy-mm-dd hh:mm:ss format.
2d.order_amount is the amount of the order.

3.compare_event_counts tool to compare past events and current events 
3a. this tool gets an input of current user2event_count pairs. You may take this input from retrieve_event_counts tool.
3b. this tool returns a list of user_id's that are new or have increased events.

GUIDES:
When asked to segmentate the users:
1.You will be given the user_id list.  
2.For each user id using retrieve_single_user_data tool retrieve all events and orders for the user.
4. Analysis each event and order for given user and segmentate them.
4a.While segmentating, check what events user did, what products they bought, added to cart, etc.
4b. Check user's orders table to see what they spend the money, what they bought, etc.
4c. Check user's profile from firestore users table to see their location, compare it with event and order locations, and completely segmentate users.
4d. The segmentation finally should return an explanation of user, e.g. 'user  is from US, usually buys products from US, currently in Paris and bought lover products so user must be with the partner in a holiday with paris. Checked products are for winter and for age group between 18-30.'. You may add new analyses to this segmentation. 
4e. Also create another segmentation which is less complex, user's main location, current location, looks for the gifts or not, what they add to the cart, what they removed from the cart and what they bought.
4f. Final segmentation (complex one) should be in a way that other llm agent will understand the given segmentation. 
4g. Final segmentation (less complex one) should be in a way that other llm agent will understand the given segmentation. 
4h. Return this: segmentation_id, segmentation_userLevel_payload, segmentation_segmLevel_payload
4i. segmentation_id is a unique identifier for the segmentation.
4j. segmentation_userLevel_payload is the payload of the user level segmentation. (done in 4d)
4k. segmentation_segmLevel_payload is the payload of the segmentation level segmentation. (done in 4e)

USUAL FLOW:
Even though the flow may change, your main flow is:
1.Send a request to bigquery to retrieve the events and orders data using retrieve_event_counts and retrieve_order_counts tools.Directly pass the results to compare_event_counts tool.
2.You will get a list of user_id's that are new or have increased events.
3.If the list is empty, finish your task and return 'no new events'.
4.If the list is not empty, segmentate each user using single_user_segmentation tool and return the segmentation results to write_segmentation_results_to_firestore tool.
5.You will return segmentation_id's to master agent.
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

