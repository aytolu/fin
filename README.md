# Jev Groove

Bir sahneyi yaz ("Gece yarısı İstanbul'da yağmur…"), Jev tek geçişte 11 tipli soruyu cevaplasın, tarayıcı o kararlardan anında müzik üretsin.

[Jev](https://typesafe.ai), Typesafe AI'ın "System One" modeli: metin yazmaz, sorularına tipli ve olasılıklı cevap verir. Bu uygulama o fikri müziğe uyguluyor:

| Soru | Tip | Ne belirliyor |
|---|---|---|
| `genre` | `choice` | ambient / lofi / house / synthwave / trap / cinematic |
| `mode`, `key`, `progression` | `choice` | dizi, ton, akor yürüyüşü |
| `palette` | `choice` | görselleştiricinin renkleri |
| `tempo`, `energy`, `brightness`, `space` | `score` (5 seviye) | BPM, yoğunluk, filtre, yankı |
| `swing`, `melody` | `noul` | shuffle hissi, solo melodi |

Hepsi **tek istekte** sorulur. Cevaplar parse edilmez, doğrudan sentezleyici parametresine dönüşür (`if (answers.swing.noul > .5)`).

**Jev şef:** Çalarken her 8 barda bir Jev'e o anki müzikal durum gönderilir; bir sonraki bölümü (giriş / yükseliş / drop / nefes / kapanış) ve davul fill'ini seçer. Döngünün içinde karar veren bir model, tam Jev'in yapıldığı iş.

Ses tamamen Web Audio ile üretiliyor (örnek dosya yok): sentezlenmiş davullar, detune'lu saw ped, bas, arpej, seed'li melodi (aynı sahne aynı melodi), üretilmiş yankı. Kayıt butonu parçayı ses dosyası olarak verir.

## Çalıştırma

**Demo (anahtarsız):** `index.html`'i herhangi bir tarayıcıda aç. Jev'in cevap şeklini taklit eden yerel bir anahtar kelime modeli devreye girer; üstte `DEMO` yazar.

**Canlı Jev (önerilen):**

```bash
TYPESAFE_API_KEY=ts_... npm start
# → http://localhost:8787
```

Telefondan denemek için aynı ağda `http://<bilgisayar-ip>:8787` adresini aç. Sayfa proxy'yi kendisi bulur, üstte `CANLI · PROXY` yazar. Anahtar sunucuda kalır.

Proxy olmadan: ⚙ → API anahtarını gir. Typesafe tarayıcıdan doğrudan isteklere izin vermezse (CORS) sayfa bunu söyler ve demoya düşer. Anahtar sadece o tarayıcının `localStorage`'ında durur.

## Dosyalar

- `index.html`: uygulamanın tamamı (tek dosya, derleme yok)
- `server.mjs`: bağımlılıksız Node proxy + statik sunucu (Node 18+)
