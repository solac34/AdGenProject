from google.adk.agents.llm_agent import Agent
from .bq_helper import bq_to_dataframe
import os

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

GUIDES:
When asked to get last hours events: 
1.Use retrieve_event_counts tool to retrieve the all events from the bigquery table. 
2.Return the results with user_id:event_count pairs.

When asked to get last hours orders: 
1.Use retrieve_order_counts tool to retrieve the all orders from the bigquery table. 
1b.Return the results with user_id:order_count pairs.
2.Group by user_id and get the number of orders for each user.
3.Return the results with user_id:order_count pairs.

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
1.Send a request to bigquery to retrieve the events and orders data using retrieve_event_counts and retrieve_order_counts tools.
2.First return to the master agent, you will return the final dataframes of events and the orders, and your main return is user_id:event_count pairs and user_id:order_count pairs.
3.Master agent will check if there are any new users or if any users event counts is increased at least the count of C or order counts is increased at least the count of O.
4.If there are any new users or if any users event counts is increased at least the count of C or order counts is increased at least the count of O, master agent will give the user_id list to you to segmentate the users.
5.You will segmentate the users and return the segmentation results to master agent.
5b.You will return segmentation_id and the payloads to master agent.
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
        retrieve_single_user_data
    ],
)

# ADK web için root_agent export et
root_agent = data_analytic_agent

