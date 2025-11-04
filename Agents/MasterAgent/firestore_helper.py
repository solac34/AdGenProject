import os
from google.cloud import firestore
from google.oauth2 import service_account


def get_firestore_client():
    project_id = os.getenv('GCP_PROJECT_ID', 'eighth-upgrade-475017-u5')
    database_id = os.getenv('FIRESTORE_DB_ID', 'adgen-db')
    
    # BQ credential'ı kullan (.env'deki GOOGLE_APPLICATION_CREDENTIALS_BQ)
    bq_keyfile = os.getenv('GOOGLE_APPLICATION_CREDENTIALS_BQ')
    
    client_args = {
        'project': project_id,
        'database': database_id
    }
    
    # Firestore için gerekli scope'lar
    scopes = [
        'https://www.googleapis.com/auth/datastore',
        'https://www.googleapis.com/auth/cloud-platform',
    ]
    
    if bq_keyfile and os.path.exists(bq_keyfile):
        credentials = service_account.Credentials.from_service_account_file(
            bq_keyfile,
            scopes=scopes
        )
        client_args['credentials'] = credentials
    
    return firestore.Client(**client_args)

