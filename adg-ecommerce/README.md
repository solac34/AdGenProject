# ADG E-commerce

Basit ve şık, negatif boşluk tasarım yaklaşımıyla hazırlanmış bir e-ticaret örneği. Tüm kullanıcı etkileşimleri izlenir (kategori tıklamaları, ürün görüntüleme, sepete ekleme/çıkarma, paylaşma vb.).

## Geliştirme

```bash
npm install
npm run dev
```

- Uygulama: http://localhost:3000
- Event endpoint: POST `/api/events`

## Dizayn İlkeleri
- Sol üstte logo, sağ üstte Giriş / Kayıt
- Logonun altında yatay navbar (10 kategori)
- Ana sayfada öne çıkan kategoriler ve ürün ızgaraları
- Negatif boşluk ve tipografi odaklı sade görünüm

## İzleme (Tracking)
- Tüm etkileşimler `lib/track.ts` üzerinden merkezi olarak toplanır ve `/api/events` endpoint’ine gönderilir.
- İstemci tarafında `TrackerProvider` otomatik sayfa görüntüleme ve gezinme olaylarını izler.

