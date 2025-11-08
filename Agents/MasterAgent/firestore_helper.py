import os
import json
import base64
from google.cloud import firestore
from google.oauth2 import service_account


def get_firestore_client():
    project_id = os.getenv('GCP_PROJECT_ID', 'eighth-upgrade-475017-u5')
    database_id = os.getenv('FIRESTORE_DB_ID', 'adgen-db')
    
    client_args = {
        'project': project_id,
        'database': database_id
    }
    
    # Firestore için gerekli scope'lar
    scopes = [
        'https://www.googleapis.com/auth/datastore',
        'https://www.googleapis.com/auth/cloud-platform',
    ]
    
    # Try environment-based service account JSON first (Cloud Run compatible)
    sa_json = os.getenv('GCP_SERVICE_ACCOUNT_JSON') or os.getenv('GCP_SERVICE_ACCOUNT_JSON_BQ')
    if sa_json:
        try:
            info = json.loads(sa_json) if sa_json.strip().startswith('{') else json.loads(base64.b64decode(sa_json).decode('utf-8'))
            credentials = service_account.Credentials.from_service_account_info(info, scopes=scopes)
            client_args['credentials'] = credentials
        except Exception:
            pass
    else:
        # Fallback to file-based credentials (local development only)
        bq_keyfile = os.getenv('GOOGLE_APPLICATION_CREDENTIALS_BQ')
        if bq_keyfile and os.path.exists(bq_keyfile):
            credentials = service_account.Credentials.from_service_account_file(bq_keyfile, scopes=scopes)
            client_args['credentials'] = credentials
    
    # If no explicit credentials found, use default Cloud Run service account (ADC)
    return firestore.Client(**client_args)


def get_past_events_from_firestore():
    """
    Firestore'dan en son kaydedilen user activity verilerini çeker.
    
    Returns:
        dict: {user_id: {event_count, order_count, created_at}, ...} formatında geçmiş veriler
              Veri bulunamazsa boş dict döner
    """
    db = get_firestore_client()
    
    # Firestore koleksiyon yolu (güncellenmiş)
    COLLECTION_PATH = "user_activity_counts"
    
    try:
        # En son dokümanı al (createdAt'e göre azalan sıralama, sadece 1 adet)
        docs = (
            db.collection(COLLECTION_PATH)
            .order_by('createdAt', direction=firestore.Query.DESCENDING)
            .limit(1)
            .stream()
        )
        
        # İlk dokümanı çek
        latest_doc = next(docs, None)
        
        if latest_doc:
            data = latest_doc.to_dict()
            past_user_activity = data.get('user_activity', {})
            print(f"✅ En son geçmiş veri ({latest_doc.id}) yüklendi. Kullanıcı sayısı: {len(past_user_activity)}")
            return past_user_activity
        else:
            print(f"⚠️ {COLLECTION_PATH} koleksiyonunda herhangi bir doküman bulunamadı.")
            return {}
            
    except Exception as e:
        print(f"❌ Firestore'dan veri çekerken hata: {e}")
        return {}

