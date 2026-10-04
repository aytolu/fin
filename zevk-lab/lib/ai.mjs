// Claude ile zevk analizi + liste kurgusu.
// Fikir: modele "bunlara benzer şarkı öner" demiyoruz. Önce yerelde çıkarılan istatistik örüntüleri
// ve şarkı örneklerini verip gizli eksenler / sınanabilir hipotezler çıkarmasını, sonra bu
// hipotezlerden türeyen, kurgusu olan (giriş-gelişme-kapanış) listeler yazmasını istiyoruz.

const SYSTEM = `Sen bir müzik zevki analisti ve küratörsün. Görevin öneri algoritması gibi "bunu dinleyen şunu da dinledi" demek DEĞİL; kişinin kütüphanesindeki gizli yapıyı bulmak ve bunu kullanarak kurgusu olan yeni listeler yazmak.

ANALİZ KURALLARI
- "Şu türleri seviyorsun" ya da sanatçı sıralamak yasak. Tür etiketi tek başına bulgu değildir.
- Her örüntü sınanabilir bir hipotez olsun: bir iddia, en az 3 kanıt (şarkı kodları t12 gibi, ya da verilen istatistiklerden bir sayı) ve "bu yüzden şunu da sever / şunu sevmez" şeklinde bir öngörü içersin.
- Şu eksenlerde ara: müziğin işlevi (odak, ritüel, katarsis, eşlik, yalnızlık), doku (soğuk/sıcak, kuru/yankılı, organik/sentetik), anlatıcı kişilik, duygusal sıcaklık ile enerjinin uyuşmazlığı, yaşanmamış dönemlere nostalji, türler arası değişmez özellikler (aynı prodüksiyon ya da ruh hâli farklı türlerde), günün saati/mevsim, dil, listelerin ruh hâline göre ama kulağın sese göre ayrışması, çelişkiler, ve kütüphanede dikkat çekici biçimde EKSİK olanlar.
- Verilen yerel örüntülerle (patlamalar, köprüler, adalar, çelişki) çelişme; onları yorumla ve gerekirse derinleştir. Veri azsa güven puanını düşür, uydurma.
- Dil: Türkçe, kısa ve somut. Süslü pazarlama dili yok.

LİSTE KURALLARI
- Tam 3 liste kur, her biri farklı strateji: (1) en güçlü örüntünün devamı, (2) iki adayı/listeyi birbirine bağlayan köprü, (3) örüntüden türeyen ama konfor alanının dışına çıkan joker.
- Her listenin 3-5 bölümlük bir yayı olsun (ör. giriş → yükseliş → kırılma → iniş). Şarkılar bu yaya göre SIRALI olsun; rastgele karışım değil. "segment" alanı bölüm numarasıdır (0'dan başlar).
- Roller: "anchor" (kütüphanedeki şarkı, ref ile), "bridge" (kütüphaneye bağlayan yeni şarkı), "stretch" (örüntüye yakın yeni şarkı), "wildcard" (şaşırtıcı ama gerekçeli yeni şarkı).
- Kütüphane şarkılarını {"ref":"t12"} ile ver. Yeni şarkılar için {"title":"...","artist":"..."}: yalnızca varlığından ve tam adından EMİN olduğun gerçek stüdyo kayıtları; kütüphanede olanları tekrar önerme; bir sanatçıdan en fazla 2 şarkı; sanatçının en bariz hit'i yerine örüntüye uyanı seç.
- Tanıdıklık yüzdesi, listedeki anchor oranını belirler (±10 puan). Kullanıcı bir ruh hâli/tarif verdiyse üç listeyi de ona göre kıvır ama örüntülerden kopma.
- Her şarkıya tek cümlelik "reason" yaz: neden bu bölümde, neden bu şarkı.

ÇIKTI: Yalnızca geçerli JSON, başka metin yok. Şema:
{
 "dna": {"headline": "tek cümle, şaşırtıcı bir özet", "summary": "3-4 cümle"},
 "axes": [{"name":"", "low":"", "high":"", "position": -1.0..1.0, "note":""}],   // 3-5 gizli eksen
 "patterns": [{"name":"", "claim":"", "evidence":["t3","t9","..."], "prediction":"", "confidence":0..1, "surprise":0..1}],   // 5-7 adet
 "blindspots": ["..."],   // 2-4 adet: seven ama farkında olmadığın ya da hiç denemediğin yönler
 "playlists": [{"title":"", "concept":"", "why":"", "arc":[{"label":"","note":""}], "tracks":[{"ref":"t12"} | {"title":"","artist":""}, "+ role, segment, reason"]}]
}`;

export function buildUserMessage({ lib, mined, dig, options }) {
  const n = options.length;
  return [
    `Kütüphane: ${mined.stats.tracks} şarkı, ${mined.stats.artists} sanatçı, ${mined.stats.firstAdded} → ${mined.stats.lastAdded}.`,
    `Listeler (indeks: ad): ${lib.playlists.map((p, i) => `${i}: ${p.name}`).join(" | ")}`,
    "",
    "YEREL ÖRÜNTÜLER (kod ile çıkarıldı, doğru kabul et):",
    ...mined.patterns.map((p) => `- ${p.title}: ${p.headline}${p.detail ? " | " + p.detail.replace(/\n/g, "; ") : ""}`),
    "",
    "ZEVK ADALARI:",
    ...mined.clusters.map((c) => `- ${c.name} | %${Math.round(c.share * 100)} | ${c.artists.join(", ")} | ort. yıl ${c.year ?? "?"} | listeler: ${c.playlists.map((p) => p.name).join(", ")}`),
    "",
    `ŞARKI ÖRNEKLERİ${dig.truncated ? " (kütüphanenin seçilmiş bir kesiti)" : ""}  [kod|ad|sanatçı|yıl|popülerlik|liste indeksleri|eklenme ay]:`,
    ...dig.lines,
    "",
    "AYARLAR:",
    `- Tanıdıklık: %${options.familiarity} (anchor oranı)`,
    `- Her liste ${n} şarkı`,
    `- Ruh hâli / tarif: ${options.mood?.trim() ? options.mood.trim() : "(yok, örüntülerden git)"}`,
  ].join("\n");
}

export function extractJSON(text) {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("Modelden JSON gelmedi");
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch (e) {
    throw new Error("Model JSON'u bozuk döndürdü: " + e.message);
  }
}

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)|\[.*?\]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const trackKey = (title, artist) => `${norm(title)}|${norm(String(artist).split(",")[0])}`;

// Model çıktısını güvenli bir şekle sokar: geçersiz ref'leri atar, kütüphanede zaten olan "yeni"
// şarkıları anchor'a çevirir, tekrarları ve aşırı sanatçıyı ayıklar.
export function normalizePlan(raw, lib, dig, { length = 25 } = {}) {
  const inLib = new Map(lib.tracks.map((t) => [trackKey(t.name, t.artists[0]?.name), t]));
  const clamp = (x) => (Number.isFinite(+x) ? Math.max(0, Math.min(1, +x)) : 0.5);
  const arr = (x) => (Array.isArray(x) ? x : []);
  const ref = (code) => dig.refs.get(code);

  const ai = {
    dna: { headline: String(raw.dna?.headline || ""), summary: String(raw.dna?.summary || "") },
    axes: arr(raw.axes).slice(0, 6).map((a) => ({ name: String(a.name || ""), low: String(a.low || ""), high: String(a.high || ""), position: Math.max(-1, Math.min(1, +a.position || 0)), note: String(a.note || "") })),
    patterns: arr(raw.patterns).slice(0, 8).map((p) => ({
      name: String(p.name || ""), claim: String(p.claim || ""), prediction: String(p.prediction || ""),
      evidence: arr(p.evidence).map((e) => { const t = ref(String(e)); return t ? { id: t.id, label: `${t.name} — ${t.artists[0]?.name}` } : { label: String(e) }; }).slice(0, 8),
      confidence: clamp(p.confidence), surprise: clamp(p.surprise),
    })),
    blindspots: arr(raw.blindspots).slice(0, 5).map(String),
  };

  const plans = arr(raw.playlists).slice(0, 3).map((pl) => {
    const seen = new Set(), perArtist = new Map(), tracks = [];
    for (const x of arr(pl.tracks)) {
      let item;
      const lt = x.ref ? ref(String(x.ref)) : null;
      if (lt) item = { ref: lt.id, title: lt.name, artist: lt.artists.map((a) => a.name).join(", "), uri: lt.uri, inLibrary: true, role: "anchor" };
      else if (x.title && x.artist) {
        const known = inLib.get(trackKey(x.title, x.artist));
        item = known
          ? { ref: known.id, title: known.name, artist: known.artists.map((a) => a.name).join(", "), uri: known.uri, inLibrary: true, role: "anchor" }
          : { ref: null, title: String(x.title), artist: String(x.artist), uri: null, inLibrary: false, role: ["bridge", "stretch", "wildcard"].includes(x.role) ? x.role : "stretch" };
      } else continue;
      const k = trackKey(item.title, item.artist);
      const ak = norm(item.artist.split(",")[0]);
      if (seen.has(k) || (!item.inLibrary && (perArtist.get(ak) || 0) >= 2)) continue;
      seen.add(k);
      perArtist.set(ak, (perArtist.get(ak) || 0) + 1);
      tracks.push({ ...item, segment: Math.max(0, parseInt(x.segment) || 0), reason: String(x.reason || "") });
    }
    return {
      title: String(pl.title || "Yeni liste"), concept: String(pl.concept || ""), why: String(pl.why || ""), source: "ai",
      arc: arr(pl.arc).slice(0, 6).map((s) => ({ label: String(s.label || ""), note: String(s.note || "") })),
      tracks: tracks.slice(0, Math.max(length, 5)),
    };
  }).filter((p) => p.tracks.length >= 3);

  return { ai, plans };
}

export async function askClaude({ apiKey, model, system, user, maxTokens = 12000, fetchImpl = fetch, baseUrl = "https://api.anthropic.com" }) {
  const res = await fetchImpl(baseUrl + "/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${body.error?.message || "istek başarısız"}`);
  const text = (body.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  if (body.stop_reason === "max_tokens") throw new Error("Yanıt token sınırında kesildi; liste uzunluğunu azaltıp tekrar dene");
  return text;
}

export async function analyze({ lib, mined, dig, options, apiKey, model, fetchImpl, baseUrl }) {
  const text = await askClaude({ apiKey, model, system: SYSTEM, user: buildUserMessage({ lib, mined, dig, options }), fetchImpl, baseUrl });
  return normalizePlan(extractJSON(text), lib, dig, options);
}
