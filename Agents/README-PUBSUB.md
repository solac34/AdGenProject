# AdGen Agents Pub/Sub Integration

Bu dokümantasyon, AdGen Agents servisinin Google Cloud Pub/Sub ile entegrasyonunu açıklar.

## 🔔 Özellikler

- **Push Subscription**: Pub/Sub mesajları otomatik olarak Cloud Run servisine iletilir
- **Hybrid Mode**: Hem ADK UI hem de Pub/Sub tetikleyicileri aynı anda çalışır
- **Otomatik Message Parsing**: JSON ve text mesajları otomatik olarak parse edilir
- **Error Handling**: Robust hata yönetimi ve logging
- **Health Checks**: Servis durumu kontrolü için endpoint

## 🚀 Kurulum

### 1. Servisi Deploy Et

```bash
./deploy-adk.sh
```

### 2. Pub/Sub Topic ve Subscription Oluştur

```bash
./setup-pubsub.sh
```

Bu script:
- `adgen-trigger` topic'ini oluşturur
- `adgen-trigger-sub` push subscription'ını oluşturur
- Gerekli IAM izinlerini ayarlar
- Test mesajı gönderir

## 📡 Endpoints

| Endpoint | Açıklama |
|----------|----------|
| `/` | Servis bilgileri |
| `/ui` | ADK UI (mevcut) |
| `/pubsub/push` | Pub/Sub push endpoint |
| `/health` | Health check |

## 📤 Mesaj Gönderme

### Basit Text Mesajı

```bash
echo "Do your task" | gcloud pubsub topics publish adgen-trigger --message=-
```

### JSON Mesajı (Önerilen)

```bash
echo '{"task": "segmentation", "message": "Run user segmentation"}' | \
  gcloud pubsub topics publish adgen-trigger --message=-
```

### Attributes ile Mesaj

```bash
gcloud pubsub topics publish adgen-trigger \
  --message="Process analytics data" \
  --attribute="task=analytics,priority=high"
```

## 🤖 Agent Tetikleme

Pub/Sub mesajları aşağıdaki şekilde MasterAgent'a iletilir:

### Message Types

1. **Segmentation Task**
   ```json
   {"task": "segmentation", "message": "Run user segmentation"}
   ```
   → Agent prompt: "Please perform user segmentation analysis. Do your task."

2. **Analytics Task**
   ```json
   {"task": "analytics", "message": "Analyze user data"}
   ```
   → Agent prompt: "Please perform data analytics. Do your task."

3. **General Task**
   ```json
   {"message": "Custom instruction"}
   ```
   → Agent prompt: "Process this request: Custom instruction. Do your task."

4. **Text Message**
   ```
   "Any text message"
   ```
   → Agent prompt: "Process this request: Any text message. Do your task."

## 🔧 Konfigürasyon

### Environment Variables

| Variable | Default | Açıklama |
|----------|---------|----------|
| `PORT` | 8080 | ADK server portu |
| `PUBSUB_PORT` | 8081 | Pub/Sub server portu |
| `PUBSUB_ONLY` | false | Sadece Pub/Sub mode |
| `GOOGLE_CLOUD_PROJECT` | - | GCP Project ID |

### Pub/Sub Only Mode

Sadece Pub/Sub tetikleyicilerini kullanmak için:

```bash
export PUBSUB_ONLY=true
```

## 📊 Monitoring

### Logs Görüntüleme

```bash
gcloud logs tail --service=adgen-agents --region=us-central1
```

### Subscription Durumu

```bash
gcloud pubsub subscriptions describe adgen-trigger-sub
```

### Message Metrics

```bash
gcloud pubsub topics describe adgen-trigger
```

## 🔍 Troubleshooting

### Common Issues

1. **403 Forbidden Error**
   - IAM izinlerini kontrol edin
   - `setup-pubsub.sh` scriptini yeniden çalıştırın

2. **Message Not Processed**
   - Cloud Run logs'ları kontrol edin
   - Health endpoint'ini test edin: `curl https://your-service-url/health`

3. **Subscription Not Working**
   - Push endpoint URL'ini doğrulayın
   - Service account izinlerini kontrol edin

### Debug Commands

```bash
# Service durumu
gcloud run services describe adgen-agents --region=us-central1

# Subscription durumu
gcloud pubsub subscriptions describe adgen-trigger-sub

# Test mesajı gönder
echo "test" | gcloud pubsub topics publish adgen-trigger --message=-

# Logs takip et
gcloud logs tail --service=adgen-agents --region=us-central1 --follow
```

## 🏗️ Architecture

```
Pub/Sub Topic (adgen-trigger)
    ↓
Push Subscription (adgen-trigger-sub)
    ↓
Cloud Run Service (/pubsub/push)
    ↓
PubSubHandler.process_message()
    ↓
MasterAgent.run()
    ↓
DataAnalyticAgent (sub-agent)
```

## 🔐 Security

- **Authentication**: Cloud Run service account kullanır
- **Authorization**: Pub/Sub service account'a sadece gerekli izinler verilir
- **Network**: HTTPS üzerinden güvenli iletişim
- **Validation**: Gelen mesajlar validate edilir

## 📈 Best Practices

1. **Message Format**: JSON formatını tercih edin
2. **Error Handling**: Mesaj işleme hatalarını loglamayı unutmayın
3. **Monitoring**: Düzenli olarak logs ve metrics'leri kontrol edin
4. **Testing**: Production'a geçmeden önce test mesajları gönderin
5. **Scaling**: Cloud Run otomatik scaling özelliğini kullanın

## 🔄 Updates

Servisi güncellemek için:

1. Kodu güncelleyin
2. `./deploy-adk.sh` çalıştırın
3. Pub/Sub subscription otomatik olarak yeni endpoint'i kullanır

## 📞 Support

Sorunlar için:
1. Cloud Run logs'ları kontrol edin
2. Pub/Sub metrics'leri inceleyin
3. Health endpoint'ini test edin
4. IAM izinlerini doğrulayın
