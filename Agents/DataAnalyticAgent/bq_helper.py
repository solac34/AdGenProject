from google.cloud import bigquery
from google.oauth2 import service_account
import os
import json
import base64

def bq_to_dataframe(query: str, project_id: str = None, credentials=None, location: str = None):
    import pandas as pd

    # .env'den project_id'yi al
    if project_id is None:
        project_id = os.getenv('GCP_PROJECT_ID', 'eighth-upgrade-475017-u5')
    
    # BigQuery client configuration - prioritize environment-based credentials for Cloud Run
    client_args = {'project': project_id}
    
    # Check for explicit credentials parameter first
    if credentials is not None:
        client_args['credentials'] = credentials
    else:
        # Try environment-based service account JSON (Cloud Run compatible)
        sa_json = os.getenv('GCP_SERVICE_ACCOUNT_JSON') or os.getenv('GCP_SERVICE_ACCOUNT_JSON_BQ')
        if sa_json:
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
        else:
            # Fallback to file-based credentials (local development only)
            bq_key_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS_BQ') or os.getenv('BQ_KEYFILE')
            if bq_key_path and os.path.exists(bq_key_path):
                client_args['credentials'] = service_account.Credentials.from_service_account_file(
                    bq_key_path,
                    scopes=[
                        'https://www.googleapis.com/auth/bigquery',
                        'https://www.googleapis.com/auth/cloud-platform',
                    ],
                )
        # If no explicit credentials found, use default Cloud Run service account (ADC)

    client = bigquery.Client(**client_args)
    # Location zorunluysa (özellikle temp dataset farklı region'da oluşturulduysa)
    query_job = client.query(query, location=location)
    results = query_job.result()
    df = results.to_dataframe()
    return df

def query_to_temp_table(query: str, temp_table_name: str = None, project_id: str = None, dataset_id: str = None):
    """
    BigQuery query çalıştırır ve BigQuery'nin otomatik oluşturduğu temporary table referansını döner.
    
    Args:
        query: Çalıştırılacak SQL query
        temp_table_name: (Kullanılmıyor - backward compatibility için)
        project_id: GCP project ID
        dataset_id: (Kullanılmıyor - backward compatibility için)
    
    Returns:
        dict: Temporary table referansı içeren dictionary
    """
    if project_id is None:
        project_id = os.getenv('GCP_PROJECT_ID', 'eighth-upgrade-475017-u5')
    
    # Credential setup - prioritize environment-based credentials for Cloud Run
    client_args = {'project': project_id}
    
    # Try environment-based service account JSON first (Cloud Run compatible)
    sa_json = os.getenv('GCP_SERVICE_ACCOUNT_JSON') or os.getenv('GCP_SERVICE_ACCOUNT_JSON_BQ')
    if sa_json:
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
    else:
        # Fallback to file-based credentials (local development only)
        bq_key_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS_BQ') or os.getenv('BQ_KEYFILE')
        if bq_key_path and os.path.exists(bq_key_path):
            client_args['credentials'] = service_account.Credentials.from_service_account_file(
                bq_key_path,
                scopes=[
                    'https://www.googleapis.com/auth/bigquery',
                    'https://www.googleapis.com/auth/cloud-platform',
                ],
            )
    # If no explicit credentials found, use default Cloud Run service account (ADC)

    client = bigquery.Client(**client_args)
    
    print(f"📊 Query çalıştırılıyor (BigQuery otomatik temp table oluşturacak)...")
    
    # Query'yi çalıştır - BigQuery otomatik olarak temporary table oluşturur
    query_job = client.query(query)
    query_job.result()  # Wait for job to complete
    
    # BigQuery'nin oluşturduğu temporary table referansını al
    destination = query_job.destination
    
    print(f"✅ Query tamamlandı!")
    print(f"   Project: {destination.project}")
    print(f"   Dataset: {destination.dataset_id}")
    print(f"   Table: {destination.table_id}")
    print(f"   Location: {query_job.location}")
    
    return {
        "status": "success",
        "message": f"Query results in temporary BigQuery table: {destination.project}.{destination.dataset_id}.{destination.table_id}",
        "data_reference": {
            "project": destination.project,
            "dataset": destination.dataset_id,
            "table": destination.table_id,
            "location": query_job.location
        }
    }
