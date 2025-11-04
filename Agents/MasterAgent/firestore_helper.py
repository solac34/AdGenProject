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


def get_past_events_from_firestore():
    """
    Firestore'dan en son kaydedilen event count verilerini çeker.
    
    Returns:
        dict: {user_id: event_count, ...} formatında geçmiş veriler
              Veri bulunamazsa boş dict döner
    """
    db = get_firestore_client()
    
    # Firestore koleksiyon yolu (düzeltilmiş)
    COLLECTION_PATH = "user_event_counts"
    
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
            past_event_counts = data.get('event_counts', {})
            print(f"✅ En son geçmiş veri ({latest_doc.id}) yüklendi. Kullanıcı sayısı: {len(past_event_counts)}")
            return past_event_counts
        else:
            print(f"⚠️ {COLLECTION_PATH} koleksiyonunda herhangi bir doküman bulunamadı.")
            return {}
            
    except Exception as e:
        print(f"❌ Firestore'dan veri çekerken hata: {e}")
        return {}

