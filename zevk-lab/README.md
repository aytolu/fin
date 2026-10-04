# Zevk Laboratuvarı

Spotify listelerini okur, "benzer şarkı öner" yerine **zevkindeki gizli örüntüleri** bulur ve bunlardan kurgulu (giriş → yükseliş → kırılma → iniş) yeni listeler yazar. İstersen listeyi Spotify'da oluşturur.

## Nasıl çalışıyor

İki katman var:

**1. Kodla örüntü madenciliği** (`lib/mine.mjs`, yapay zeka gerekmez)
Spotify'ın ses özellikleri (tempo, valence…) yeni uygulamalara kapalı. Elde kalan sinyallerden şunları çıkarır:

| Örüntü | Ne yakalıyor |
|---|---|
| Toplu toplayıcı | Tek günde 4+ şarkı eklediğin takıntı / keşif günleri |
| Zaman makinesi | Şarkılara çıktıktan kaç yıl sonra ulaşıyorsun, zamanla eskiye mi yeniye mi kayıyorsun |
| Köprü şarkılar | Birden fazla listede dolaşan şarkı ve sanatçılar |
| Zevk adaları | Tür + dönem + aynı gün eklenme benzerliğiyle kNN grafiği, etiket yayılımıyla kümeler. Listelerin ruh hâline göre mi, kulağın sese göre mi ayrıştığını (saflık) ölçer |
| İki ayrı evren | Birbirinden en uzak iki büyük ada |
| Atlanan on yıl, ana akıma mesafe, sadakat, başlık motifleri, gece/gündüz küratör, süre | |

**2. Claude ile yorum ve kurgu** (`lib/ai.mjs`)
Yerel örüntüler ve şarkı örnekleri modele verilir; model gizli eksenler (doku, işlev, sıcaklık…), kanıtlı ve sınanabilir hipotezler, kör noktalar ve 3 liste üretir (devam / köprü / joker). Çıktı şemaya göre doğrulanır: uydurma şarkı kodları atılır, kütüphanedeki şarkılar anchor'a çevrilir, sanatçı başına en fazla 2 yeni şarkı. Yeni şarkılar Spotify'da aranıp çözümlenir; bulunamayanlar işaretlenir.

Anthropic anahtarı yoksa yalnızca yerel örüntülerden 3 liste (Unutulanlar, Köprüler, Patlama anları) kurulur.

## Çalıştırma

```bash
cd zevk-lab
npm run demo          # Spotify'sız, örnek kütüphane → http://127.0.0.1:8888
```

Gerçek hesapla:

1. <https://developer.spotify.com/dashboard> → uygulama oluştur, Redirect URI olarak `http://127.0.0.1:8888/callback` ekle.
2. Başlat:

```bash
SPOTIFY_CLIENT_ID=... ANTHROPIC_API_KEY=... npm start
```

Ortam değişkenleri: `PORT` (8888), `SPOTIFY_REDIRECT_URI`, `ANTHROPIC_MODEL` (varsayılan `claude-sonnet-5-5`), `ANTHROPIC_BASE_URL`.

Sunucu yalnızca `127.0.0.1`'e bağlanır; jetonlar ve anahtar sürecin belleğinde kalır, diske yazılmaz. Giriş PKCE ile yapılır (client secret gerekmez). Spotify'a yalnızca sen "oluştur"a basınca yazılır.

## Test

```bash
npm test     # 17 test: madencilik, model çıktısı doğrulama, sahte fetch ile Spotify istemcisi
```

## Bilinen sınırlar

- Spotify canlı API'sine karşı **denenmedi** (ortamda Spotify hesabı yok). İstemci sahte `fetch` testleriyle doğrulandı. Spotify uç noktaları son yıllarda değişti; bu yüzden `/items` ↔ `/tracks` ve `POST /me/playlists` ↔ `POST /users/{id}/playlists` için otomatik geri dönüş var. Bir şey 403/404 verirse hata arayüzde görünür.
- Sanatçı türleri (`/artists`) alınamazsa analiz türsüz devam eder; kümeler dönem ve eklenme davranışına dayanır.
- Modele en fazla 260 şarkılık örnek gider; büyük kütüphanelerde köprüler ve patlama şarkıları öncelikli seçilir.
- Modelin önerdiği "yeni" şarkılar Spotify aramasıyla doğrulanır; bazıları yine de bulunamayabilir.
