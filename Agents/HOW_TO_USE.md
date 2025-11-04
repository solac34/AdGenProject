# AdGen Agent System - Kullanım Kılavuzu

## ADK Web UI'da Nasıl Kullanılır?

### 1. Agent'ı Başlatma

```bash
cd /Users/atacansolak/Documents/GitHub/AdGenProject/Agents
source ../AdGenVenv/bin/activate
adk web MasterAgent
```

Tarayıcınızda açılan ADK Web UI'a gidin.

---

## 2. Kullanabileceğiniz Komutlar

ADK Web UI'daki chat kutusuna aşağıdaki komutlardan birini yazın:

### ✅ Tam Analiz (Önerilen)
```
do your task
```
veya
```
run analysis
```
veya
```
analyze users
```

**Ne Yapar?**
1. BigQuery'den son event count'ları alır (top 500 aktif kullanıcı)
2. Firestore'daki geçmiş verilerle karşılaştırır
3. Yeni veya aktif kullanıcıları tespit eder
4. Bu kullanıcıları segment'e ayırır (davranış analizi)
5. Sonuçları Firestore'a kaydeder

**Beklenen Çıktı:**
```
Starting analysis...
Found 23 new/active users
Segmentation complete
Results saved to Firestore
Analysis complete. 23 users segmented and saved.
```

---

### 🔍 Sadece Event Kontrolü
```
check for new events
```

**Ne Yapar?**
- Sadece event count'ları kontrol eder
- Yeni/aktif kullanıcı listesi döner
- Segmentasyon yapmaz

**Beklenen Çıktı:**
```
Checking events...
Found 15 new/active users: user_123, user_456, ...
```

---

## 3. Sistem Akışı

```
┌─────────────────────────────────────────────────┐
│  ADK Web UI: "do your task" yazıyorsunuz       │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Master Agent: Görevi alıyor ve başlatıyor     │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Data Analytic Agent'a delege ediyor:          │
│  1. "retrieve current event counts"            │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  BigQuery → Event Count'lar alınıyor           │
│  {"user_123": 45, "user_456": 78, ...}         │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Data Analytic Agent'a:                         │
│  2. "compare with past data"                    │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Firestore'dan geçmiş count'lar alınıyor       │
│  Karşılaştırma yapılıyor                        │
│  ["user_123", "user_789"] → Yeni/Aktif         │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Data Analytic Agent'a:                         │
│  3. "write new counts to firestore"             │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Firestore güncelleniyor (user_event_counts)   │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Data Analytic Agent'a:                         │
│  4. "segmentate these users"                    │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Her kullanıcı için:                            │
│  - BigQuery'den event/order verisi              │
│  - Davranış analizi                             │
│  - Segment oluşturma (detailed + simple)       │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Data Analytic Agent'a:                         │
│  5. "write segmentation results"                │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Firestore'a kaydediliyor                       │
│  (segmentation_results collection)              │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Master Agent: Sonuçları gösteriyor             │
│  "Analysis complete. 23 users segmented."       │
└─────────────────────────────────────────────────┘
```

---

## 4. Firestore'da Kaydedilen Veriler

### Collection: `user_event_counts`
```json
{
  "user_123": {
    "count": 45
  },
  "user_456": {
    "count": 78
  }
}
```

### Collection: `segmentation_results`
```json
{
  "user_123": {
    "user_id": "user_123",
    "segmentation_result": {
      "detailed": "User from NYC, 25-35, high spender...",
      "simple": {
        "home_location": "NYC",
        "current_location": "Paris",
        "category_preference": "fashion",
        "price_tier": "premium"
      }
    }
  }
}
```

---

## 5. Token Optimizasyonları

Sistemde token limitini aşmamak için şu limitler var:

- **BigQuery Event Counts**: Top 500 aktif kullanıcı
- **BigQuery Order Counts**: Top 500 aktif kullanıcı
- **User Event Data**: Son 100 event
- **User Order Data**: Son 50 order
- **Firestore Read**: 1000 kayıt limiti

Bu limitler ~13K token kullanımı sağlıyor (limit: 1M token)

---

## 6. Sorun Giderme

### "403 Permission Denied" Hatası
```bash
# .env dosyanızda şu değişkenlerin doğru olduğundan emin olun:
GOOGLE_APPLICATION_CREDENTIALS_BQ=/path/to/bigquery-key.json
GCP_PROJECT_ID=eighth-upgrade-475017-u5
FIRESTORE_DB_ID=adgen-db
```

### "Token Limit" Hatası
- Kodda zaten optimizasyon var
- Eğer hala alıyorsanız, `retrieve_event_counts` LIMIT değerini düşürün

### Agent Yanıt Vermiyor
```bash
# Logları kontrol edin
adk web MasterAgent --verbose
```

---

## 7. Örnek Senaryo

**Siz:** `do your task`

**Master Agent:**
```
Starting analysis...
Contacting data_analytic_agent to retrieve current event counts...
Received counts for 500 users
Comparing with past data...
Found 23 new/active users
Writing new counts to Firestore...
Starting segmentation for 23 users...
Segmentation complete
Results saved to Firestore
Analysis complete. 23 users segmented and saved.
```

**Sonuç:** 
- Firestore'da 23 yeni segment kaydedildi
- Bu segmentler reklam hedefleme için hazır
- Bir sonraki "do your task" komutu sadece yeni değişiklikleri işleyecek

---

## 8. Otomasyonlu Çalıştırma

Saatte bir otomatik çalıştırmak için:

```bash
# crontab -e
0 * * * * cd /Users/atacansolak/Documents/GitHub/AdGenProject/Agents && /Users/atacansolak/Documents/GitHub/AdGenProject/AdGenVenv/bin/python -c "from MasterAgent.agent import root_agent; root_agent.run('do your task')"
```

---

## İletişim

Sorularınız için: atacansolak@example.com

