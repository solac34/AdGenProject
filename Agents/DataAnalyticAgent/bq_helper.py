from google.cloud import bigquery
from google.oauth2 import service_account
import os
import json
import base64

def bq_to_dataframe(query: str, project_id: str = None, credentials=None):
    import pandas as pd

    # .env'den project_id'yi al
    if project_id is None:
        project_id = os.getenv('GCP_PROJECT_ID', 'eighth-upgrade-475017-u5')
    
    # Eğer özel BigQuery credential sağlandıysa onu yükle (adg-ecommerce ile aynı mantık)
    client_args = {'project': project_id}
    bq_key_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS_BQ') or os.getenv('BQ_KEYFILE')
    sa_json = os.getenv('GCP_SERVICE_ACCOUNT_JSON') or os.getenv('GCP_SERVICE_ACCOUNT_JSON_BQ')

    if credentials is not None:
        client_args['credentials'] = credentials
    elif sa_json:
        try:
            info = json.loads(sa_json) if sa_json.strip().startswith('{') else json.loads(base64.b64decode(sa_json).decode('utf-8'))
            client_args['credentials'] = service_account.Credentials.from_service_account_info(
                info,
                scopes=[
                    'https://www.googleapis.com/auth/bigquery',
                    'https://www.googleapis.com/auth/cloud-platform',
                ],
            )
        except Exception:
            pass
    elif bq_key_path and os.path.exists(bq_key_path):
        client_args['credentials'] = service_account.Credentials.from_service_account_file(
            bq_key_path,
            scopes=[
                'https://www.googleapis.com/auth/bigquery',
                'https://www.googleapis.com/auth/cloud-platform',
            ],
        )

    client = bigquery.Client(**client_args)
    query_job = client.query(query)
    results = query_job.result()
    df = results.to_dataframe()
    return df
