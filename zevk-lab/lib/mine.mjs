// Spotify'ın "benzer şarkılar" mantığının dışında kalan, yerel örüntü madenciliği.
// Girdi: { playlists, tracks, artists } (bkz. spotify.mjs / demo.mjs). Dış bağımlılık yok.
//
// Ses özellikleri (tempo, valence...) yeni Spotify uygulamalarına kapalı olduğu için
// elimizdeki sinyaller şunlar: ne zaman eklendi, kaç liste arasında dolaşıyor,
// yılı, popülerliği, türleri, adı. Örüntüler bunlardan türetilir; "ne hissettiriyor"
// kısmını yapay zeka katmanı (ai.mjs) tamamlar.

const STOP = new Set(("the and for you your with that this from are was not but all can her his she him its our out " +
  "bir bu ve ile için gibi çok daha en da de ki mi mı ne var yok ben sen biz siz onu bana sana " +
  "feat remix remastered remaster version live edit mix radio original album single ver pt part").split(" "));

export const median = (a) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const pct = (x) => Math.round(x * 100);
const fmtDay = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const localMs = (iso, tz) => Date.parse(iso) + tz * 60000;
export const localDay = (iso, tz = 0) => new Date(localMs(iso, tz)).toISOString().slice(0, 10);
export const localHour = (iso, tz = 0) => new Date(localMs(iso, tz)).getUTCHours();

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const groupBy = (arr, fn) => {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    (m.get(k) || m.set(k, []).get(k)).push(x);
  }
  return m;
};

const artistKey = (t) => t.artists[0]?.id || t.artists[0]?.name || "?";
const artistName = (t) => t.artists[0]?.name || "?";

function tokens(s) {
  return s.toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}']+/u).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of a) { na += v * v; const w = b.get(k); if (w) dot += v * w; }
  for (const v of b.values()) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// ---------------------------------------------------------------- kümeler
// Sanatçıları ortak türlere / döneme / aynı gün eklenmeye göre bir benzerlik grafiğine koyar,
// sonra etiket yayılımıyla "zevk adaları" bulur. Adalar çoğu zaman listelerinle örtüşmez.
function clusterArtists(lib, tz) {
  const T = lib.tracks;
  const per = groupBy(T, artistKey);
  const top = [...per.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 1200);
  const n = top.length;
  if (n < 6) return { clusters: [], assign: new Map() };

  const feats = top.map(([k, ts]) => {
    const g = new Map();
    const meta = lib.artists?.[ts[0].artists[0]?.id];
    const tags = meta?.genres || [];
    for (const tag of tags) for (const w of tokens(tag)) g.set(w, (g.get(w) || 0) + 1);
    const years = ts.map((t) => t.year).filter(Boolean);
    const pls = new Set(ts.flatMap((t) => t.playlists));
    const days = new Set(ts.map((t) => localDay(t.addedAt, tz)));
    return { g, tags, year: median(years), pls, days, hasG: g.size > 0 };
  });

  const sim = (i, j) => {
    const a = feats[i], b = feats[j];
    let s = 0;
    if (a.hasG && b.hasG) s += 0.55 * cosine(a.g, b.g);
    if (Number.isFinite(a.year) && Number.isFinite(b.year)) s += 0.25 * Math.exp(-Math.abs(a.year - b.year) / 12);
    let inter = 0;
    for (const p of a.pls) if (b.pls.has(p)) inter++;
    s += 0.15 * (inter / (a.pls.size + b.pls.size - inter));
    for (const d of a.days) if (b.days.has(d)) { s += 0.35; break; }
    return s;
  };

  const K = 6;
  const adj = top.map(() => new Map());
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) if (j !== i) row.push([j, sim(i, j)]);
    row.sort((x, y) => y[1] - x[1]);
    for (const [j, w] of row.slice(0, K)) {
      if (w <= 0.05) continue;
      adj[i].set(j, Math.max(adj[i].get(j) || 0, w));
      adj[j].set(i, Math.max(adj[j].get(i) || 0, w));
    }
  }

  const r = rng(7);
  const label = top.map((_, i) => i);
  const order = [...label];
  for (let it = 0; it < 30; it++) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let changed = false;
    for (const i of order) {
      const tally = new Map();
      for (const [j, w] of adj[i]) tally.set(label[j], (tally.get(label[j]) || 0) + w);
      let best = label[i], bw = -1;
      for (const [l, w] of tally) if (w > bw + 1e-9 || (Math.abs(w - bw) < 1e-9 && l < best)) { best = l; bw = w; }
      if (best !== label[i]) { label[i] = best; changed = true; }
    }
    if (!changed) break;
  }

  // küçük adaları en güçlü komşuya kat
  const members = groupBy(label.map((l, i) => i), (i) => label[i]);
  for (const [l, idxs] of members) {
    if (idxs.length >= 3) continue;
    const tally = new Map();
    for (const i of idxs) for (const [j, w] of adj[i]) if (label[j] !== l) tally.set(label[j], (tally.get(label[j]) || 0) + w);
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) for (const i of idxs) label[i] = best[0];
  }

  const plName = new Map(lib.playlists.map((p) => [p.id, p.name]));
  const groups = [...groupBy(label.map((l, i) => i), (i) => label[i]).values()].sort(
    (a, b) => b.reduce((s, i) => s + top[i][1].length, 0) - a.reduce((s, i) => s + top[i][1].length, 0));
  const assign = new Map();
  const clusters = groups.map((idxs, ci) => {
    const tracks = idxs.flatMap((i) => top[i][1]);
    tracks.forEach((t) => assign.set(t.id, ci));
    const gw = new Map();
    for (const i of idxs) for (const [w, v] of feats[i].g) gw.set(w, (gw.get(w) || 0) + v);
    const tagCount = new Map();
    for (const i of idxs) for (const tag of feats[i].tags) tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    const topGenres = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map((e) => e[0]);
    const topArtists = idxs.map((i) => [top[i][1][0].artists[0].name, top[i][1].length]).sort((a, b) => b[1] - a[1]).slice(0, 4).map((e) => e[0]);
    const plCount = new Map();
    for (const t of tracks) for (const p of t.playlists) plCount.set(p, (plCount.get(p) || 0) + 1);
    const plTotal = [...plCount.values()].reduce((a, b) => a + b, 0);
    const purity = plTotal ? Math.max(...plCount.values()) / plTotal : 1;
    return {
      id: ci,
      name: topGenres.length ? topGenres.join(" · ") : `${topArtists.slice(0, 2).join(" & ")} evreni`,
      size: tracks.length,
      share: tracks.length / T.length,
      artists: topArtists,
      artistCount: idxs.length,
      year: Math.round(median(tracks.map((t) => t.year).filter(Boolean))) || null,
      popularity: Math.round(median(tracks.map((t) => t.popularity).filter(Number.isFinite))) || null,
      playlists: [...plCount.entries()].sort((a, b) => b[1] - a[1]).map(([p, c]) => ({ name: plName.get(p) || p, count: c })),
      purity,
      genreVec: gw,
      trackIds: tracks.map((t) => t.id),
    };
  });
  return { clusters, assign };
}

// ---------------------------------------------------------------- ana madenci
export function mine(lib, { tz = 0 } = {}) {
  const T = lib.tracks.filter((t) => t.addedAt);
  const all = lib.tracks;
  const plName = new Map(lib.playlists.map((p) => [p.id, p.name]));
  const plIndex = new Map(lib.playlists.map((p, i) => [p.id, i]));
  const patterns = [];
  const add = (p) => patterns.push(p);

  const artistsCount = new Set(all.map(artistKey)).size;
  const times = T.map((t) => Date.parse(t.addedAt)).filter(Number.isFinite);
  const stats = {
    tracks: all.length,
    artists: artistsCount,
    playlists: lib.playlists.length,
    firstAdded: times.length ? new Date(Math.min(...times)).toISOString().slice(0, 10) : null,
    lastAdded: times.length ? new Date(Math.max(...times)).toISOString().slice(0, 10) : null,
  };

  // 1) Takıntı / keşif patlamaları
  const days = groupBy(T, (t) => localDay(t.addedAt, tz));
  const big = [...days.entries()].filter(([, v]) => v.length >= 4).sort((a, b) => b[1].length - a[1].length);
  const burstDays = new Set(big.map(([d]) => d));
  const burstTracks = big.flatMap(([, v]) => v);
  if (big.length) {
    const rows = big.slice(0, 4).map(([day, v]) => {
      const byA = [...groupBy(v, artistName).entries()].sort((a, b) => b[1].length - a[1].length);
      const [dom, domTracks] = byA[0];
      const obsession = domTracks.length >= 3 && domTracks.length / v.length >= 0.4;
      return { day, n: v.length, kind: obsession ? "takıntı" : "keşif günü", dom, domCount: domTracks.length, ids: v.map((t) => t.id) };
    });
    add({
      id: "bursts",
      title: "Toplu toplayıcı",
      headline: `Şarkıların %${pct(burstTracks.length / T.length)}'i, tek günde 4+ şarkı eklediğin ${big.length} güne sığıyor`,
      detail: rows.map((r) => `${fmtDay(r.day)}: ${r.n} şarkı (${r.kind}${r.kind === "takıntı" ? ` — ${r.dom} ×${r.domCount}` : ""})`).join("\n"),
      evidence: rows.flatMap((r) => r.ids).slice(0, 12),
      metrics: { burstDays: big.length, share: burstTracks.length / T.length },
    });
  } else if (T.length >= 10) {
    add({ id: "bursts", title: "Damla damla toplayıcı", headline: "Hiçbir günde 4'ten fazla şarkı eklememişsin: zevkin yavaş ve seçerek birikmiş", detail: "", evidence: [], metrics: {} });
  }

  // 2) Nostalji gecikmesi
  const lagRows = T.filter((t) => t.year).map((t) => ({ t, lag: new Date(t.addedAt).getUTCFullYear() - t.year }));
  if (lagRows.length >= 10) {
    const med = median(lagRows.map((x) => x.lag));
    const old = lagRows.filter((x) => x.lag >= 20);
    const sorted = [...lagRows].sort((a, b) => Date.parse(a.t.addedAt) - Date.parse(b.t.addedAt));
    const h = sorted.length >> 1;
    const drift = median(sorted.slice(h).map((x) => x.lag)) - median(sorted.slice(0, h).map((x) => x.lag));
    const oldest = [...old].sort((a, b) => b.lag - a.lag).slice(0, 8);
    add({
      id: "lag",
      title: "Zaman makinesi",
      headline: med >= 8
        ? `Şarkılara çıktıktan ortalama ${Math.round(med)} yıl sonra ulaşıyorsun`
        : med <= 2 ? "Yeni çıkanı hemen yakalıyorsun" : `Şarkılar çıktıktan ~${Math.round(med)} yıl sonra listene giriyor`,
      detail: `${old.length} şarkı eklendiğinde 20 yıldan eskiydi (%${pct(old.length / lagRows.length)}). ` +
        (Math.abs(drift) >= 2 ? `Zamanla ${drift > 0 ? "daha eskiye" : "daha yeniye"} kayıyorsun (ilk yarı → ikinci yarı: ${drift > 0 ? "+" : ""}${drift.toFixed(1)} yıl).` : "Zamanla belirgin bir kayma yok."),
      evidence: oldest.map((x) => x.t.id),
      metrics: { median: med, over20: old.length / lagRows.length, drift },
    });
  }

  // 3) Obskürlük
  const pops = all.map((t) => t.popularity).filter(Number.isFinite);
  if (pops.length >= 10) {
    const low = all.filter((t) => Number.isFinite(t.popularity) && t.popularity < 35);
    const perPl = lib.playlists.map((p) => ({ name: p.name, med: median(all.filter((t) => t.playlists.includes(p.id) && Number.isFinite(t.popularity)).map((t) => t.popularity)) })).filter((x) => Number.isFinite(x.med)).sort((a, b) => a.med - b.med);
    add({
      id: "obscurity",
      title: "Ana akıma mesafe",
      headline: `Medyan popülerlik ${Math.round(median(pops))}/100; şarkıların %${pct(low.length / pops.length)}'i "yer altı" (<35)`,
      detail: perPl.length > 1 ? `En az bilinen liste: ${perPl[0].name} (${Math.round(perPl[0].med)}). En ana akım: ${perPl.at(-1).name} (${Math.round(perPl.at(-1).med)}).` : "",
      evidence: low.sort((a, b) => a.popularity - b.popularity).slice(0, 8).map((t) => t.id),
      metrics: { median: median(pops), underground: low.length / pops.length },
    });
  }

  // 4) Sadakat
  const byArtist = groupBy(all, artistKey);
  const counts = [...byArtist.values()].map((v) => v.length);
  if (all.length >= 10) {
    const H = -counts.reduce((s, c) => s + (c / all.length) * Math.log(c / all.length), 0);
    const eff = Math.exp(H);
    const top5 = counts.sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0) / all.length;
    const once = [...byArtist.values()].filter((v) => v.length === 1).length / byArtist.size;
    const favs = [...byArtist.values()].sort((a, b) => b.length - a.length).slice(0, 3);
    add({
      id: "loyalty",
      title: eff / byArtist.size < 0.7 ? "Derin kazıcı" : "Gezgin",
      headline: `${byArtist.size} sanatçı var ama etkin çeşitlilik ${Math.round(eff)}: ilk 5 sanatçı şarkıların %${pct(top5)}'i`,
      detail: `Sanatçıların %${pct(once)}'inden yalnızca tek şarkı almışsın. En çok: ${favs.map((v) => `${artistName(v[0])} (${v.length})`).join(", ")}.`,
      evidence: favs.flatMap((v) => v.slice(0, 3).map((t) => t.id)),
      metrics: { effective: eff, top5, oneOff: once },
    });
  }

  // 5) Köprüler
  if (lib.playlists.length > 1) {
    const bridgeT = all.filter((t) => t.playlists.length >= 2);
    const spanA = [...byArtist.values()].map((v) => ({ v, pls: new Set(v.flatMap((t) => t.playlists)) })).filter((x) => x.pls.size >= 2).sort((a, b) => b.pls.size - a.pls.size || b.v.length - a.v.length);
    if (bridgeT.length || spanA.length) {
      add({
        id: "bridges",
        title: "Köprü şarkılar",
        headline: `${bridgeT.length} şarkı birden fazla listede; ${spanA.length} sanatçı listeler arasında dolaşıyor`,
        detail: spanA.slice(0, 5).map((x) => `${artistName(x.v[0])} → ${[...x.pls].map((p) => plName.get(p)).join(" + ")}`).join("\n"),
        evidence: [...bridgeT, ...spanA.slice(0, 5).flatMap((x) => x.v.slice(0, 2))].map((t) => t.id).slice(0, 12),
        metrics: { bridgeTracks: bridgeT.length, bridgeArtists: spanA.length },
      });
    }
  }

  // 6) Kümeler: listelerin değil, kulağının haritası
  const { clusters, assign } = clusterArtists({ ...lib, tracks: all }, tz);
  if (clusters.length >= 2) {
    const wPurity = clusters.reduce((s, c) => s + c.purity * c.size, 0) / clusters.reduce((s, c) => s + c.size, 0);
    add({
      id: "clusters",
      title: wPurity < 0.6 ? "Listelerin ruh hâline göre, kulağın sese göre" : "Listelerin türlere göre siloya ayrılmış",
      headline: wPurity < 0.6
        ? `${clusters.length} zevk adası buldum ve çoğu birden fazla listeye yayılıyor (saflık %${pct(wPurity)})`
        : `${clusters.length} zevk adası listelerinle büyük ölçüde örtüşüyor (saflık %${pct(wPurity)})`,
      detail: clusters.slice(0, 4).map((c) => `${c.name} — ${c.artists.slice(0, 3).join(", ")} (%${pct(c.share)})`).join("\n"),
      evidence: clusters.slice(0, 3).flatMap((c) => c.trackIds.slice(0, 3)),
      metrics: { purity: wPurity, clusters: clusters.length },
    });

    // çelişki: en uzak iki büyük ada
    const decVec = (c) => {
      const m = new Map(c.genreVec);
      const tr = c.trackIds.map((id) => all.find((t) => t.id === id)).filter((t) => t?.year);
      for (const t of tr) { const k = "d" + Math.floor(t.year / 10); m.set(k, (m.get(k) || 0) + 1.5); }
      return m;
    };
    const big2 = clusters.filter((c) => c.share >= 0.1).slice(0, 6);
    let worst = null;
    for (let i = 0; i < big2.length; i++) for (let j = i + 1; j < big2.length; j++) {
      const d = 1 - cosine(decVec(big2[i]), decVec(big2[j]));
      if (!worst || d > worst.d) worst = { a: big2[i], b: big2[j], d };
    }
    if (worst && worst.d > 0.5) {
      add({
        id: "contradiction",
        title: "Aynı kişide iki ayrı evren",
        headline: `${worst.a.name} ile ${worst.b.name} neredeyse hiç ortak noktası olmayan iki ada, ama ikisi de sende büyük`,
        detail: `${worst.a.artists.slice(0, 2).join(" / ")} ↔ ${worst.b.artists.slice(0, 2).join(" / ")} (uzaklık ${worst.d.toFixed(2)}). Yeni liste için asıl ilginç yer ikisinin arası.`,
        evidence: [...worst.a.trackIds.slice(0, 3), ...worst.b.trackIds.slice(0, 3)],
        metrics: { distance: worst.d },
      });
    }
  }

  // 7) Başlık motifleri + dil
  const tok = new Map();
  for (const t of all) for (const w of new Set(tokens(t.name))) (tok.get(w) || tok.set(w, []).get(w)).push(t.id);
  const motifs = [...tok.entries()].filter(([, ids]) => ids.length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 6);
  const trChars = all.filter((t) => /[çğıöşüÇĞİÖŞÜ]/.test(t.name + t.artists.map((a) => a.name).join(" "))).length;
  if (motifs.length || trChars) {
    add({
      id: "motifs",
      title: "Başlıklardaki gizli tema",
      headline: motifs.length ? `Başlıklarda tekrar eden kelimeler: ${motifs.map(([w, ids]) => `${w} (${ids.length})`).join(", ")}` : "Başlıklarda belirgin bir kelime teması yok",
      detail: trChars ? `Şarkıların yaklaşık %${pct(trChars / all.length)}'i Türkçe karakter içeriyor.` : "",
      evidence: motifs.flatMap(([, ids]) => ids.slice(0, 2)).slice(0, 10),
      metrics: { words: motifs.map((m) => m[0]) },
    });
  }

  // 8) Ne zaman topluyorsun
  if (T.length >= 12) {
    const hrs = T.map((t) => localHour(t.addedAt, tz));
    const night = hrs.filter((h) => h >= 22 || h < 5).length / hrs.length;
    const wk = T.filter((t) => [0, 6].includes(new Date(localMs(t.addedAt, tz)).getUTCDay())).length / T.length;
    add({
      id: "rhythm",
      title: night > 0.4 ? "Gece kuşu küratör" : "Gündüz küratör",
      headline: `Eklemelerin %${pct(night)}'i 22:00–05:00 arasında, %${pct(wk)}'i hafta sonu`,
      detail: `Medyan ekleme saati ${String(Math.round(median(hrs))).padStart(2, "0")}:00.`,
      evidence: [],
      metrics: { night, weekend: wk },
    });
  }

  // 9) On yıllar ve boşluklar
  const decs = new Map();
  for (const t of all) if (t.year) decs.set(Math.floor(t.year / 10) * 10, (decs.get(Math.floor(t.year / 10) * 10) || 0) + 1);
  const decades = [...decs.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => ({ decade: d, count: c, share: c / all.length }));
  if (decades.length >= 3) {
    const present = decades.filter((d) => d.share >= 0.03);
    const gaps = [];
    if (present.length >= 2) {
      for (let d = present[0].decade + 10; d < present.at(-1).decade; d += 10) {
        if ((decs.get(d) || 0) / all.length < 0.02) gaps.push(d);
      }
    }
    const peak = [...decades].sort((a, b) => b.count - a.count)[0];
    add({
      id: "decades",
      title: gaps.length ? "Atladığın on yıl" : "Dönem dağılımı",
      headline: gaps.length
        ? `${gaps.map((g) => g + "'ler").join(", ")} neredeyse hiç yok, ama öncesi ve sonrası var`
        : `En yoğun dönem ${peak.decade}'ler (%${pct(peak.share)})`,
      detail: decades.map((d) => `${d.decade}'ler %${pct(d.share)}`).join(" · "),
      evidence: [],
      metrics: { gaps },
    });
  }

  // 10) Süre
  const durs = all.map((t) => t.durationMs).filter(Number.isFinite);
  if (durs.length >= 10) {
    const long = durs.filter((d) => d >= 6 * 60000).length / durs.length;
    const short = durs.filter((d) => d <= 165000).length / durs.length;
    add({
      id: "length",
      title: "Süre tercihi",
      headline: `Medyan şarkı ${Math.floor(median(durs) / 60000)}:${String(Math.round((median(durs) % 60000) / 1000)).padStart(2, "0")}; %${pct(long)} uzun (6 dk+), %${pct(short)} kısa (<2:45)`,
      detail: "",
      evidence: all.filter((t) => t.durationMs >= 6 * 60000).slice(0, 6).map((t) => t.id),
      metrics: { long, short },
    });
  }

  // görselleştirme verisi
  const timeline = T.map((t) => ({ id: t.id, t: Date.parse(t.addedAt), pl: plIndex.get(t.playlists[0]) ?? 0, c: assign.get(t.id) ?? -1, burst: burstDays.has(localDay(t.addedAt, tz)) }));

  return {
    stats,
    patterns,
    clusters: clusters.map(({ genreVec, trackIds, ...c }) => ({ ...c, trackCount: trackIds.length })),
    clusterOf: Object.fromEntries(assign),
    decades,
    timeline,
    burstTrackIds: burstTracks.map((t) => t.id),
    _clusters: clusters,
  };
}

// ---------------------------------------------------------------- yapay zekaya özet
// Tüm kütüphane prompta sığmayabilir: köprüleri, patlama şarkılarını ve her adadan örnekleri
// öncelikli seçip kalanı tohumlu rastgeleyle doldurur. Şarkılara kısa "t12" kodu verilir.
export function digest(lib, mined, { maxTracks = 260 } = {}) {
  const all = lib.tracks;
  const pick = new Set();
  const take = (arr) => { for (const t of arr) if (pick.size < maxTracks) pick.add(t); };
  take(all.filter((t) => t.playlists.length >= 2));
  const burst = new Set(mined.burstTrackIds);
  take(all.filter((t) => burst.has(t.id)).slice(0, Math.floor(maxTracks / 4)));
  const r = rng(42);
  const shuffled = [...all].sort(() => r() - 0.5);
  const byCluster = groupBy(shuffled, (t) => mined.clusterOf[t.id] ?? -1);
  const per = Math.max(3, Math.floor((maxTracks - pick.size) / Math.max(1, byCluster.size)));
  for (const v of byCluster.values()) take(v.slice(0, per));
  take(shuffled);
  const chosen = [...pick];
  const refs = new Map();
  const lines = chosen.map((t, i) => {
    const ref = "t" + i;
    refs.set(ref, t);
    return `${ref}|${t.name}|${t.artists.map((a) => a.name).join(", ")}|${t.year ?? ""}|${t.popularity ?? ""}|${t.playlists.map((p) => lib.playlists.findIndex((x) => x.id === p)).join("+")}|${(t.addedAt || "").slice(0, 7)}`;
  });
  return { lines, refs, truncated: chosen.length < all.length };
}

// ---------------------------------------------------------------- yapay zekasız yedek listeler
// Anahtar yoksa da tamamen yerel örüntülerden 3 liste kurar (yalnızca kütüphane şarkıları).
export function localPlans(lib, mined, { length = 25 } = {}) {
  const all = lib.tracks;
  const byId = new Map(all.map((t) => [t.id, t]));
  const mk = (title, concept, why, tracks, role) => ({
    title, concept, why, arc: [], source: "yerel",
    tracks: tracks.slice(0, length).map((t, i) => ({ ref: t.id, title: t.name, artist: t.artists.map((a) => a.name).join(", "), role, reason: "", segment: 0, uri: t.uri, inLibrary: true })),
  });
  const plans = [];

  const sorted = [...all].filter((t) => t.addedAt).sort((a, b) => Date.parse(a.addedAt) - Date.parse(b.addedAt));
  const byA = groupBy(all, artistKey);
  const forgotten = sorted.slice(0, Math.ceil(sorted.length / 3))
    .map((t) => ({ t, s: (100 - (t.popularity ?? 50)) + (byA.get(artistKey(t)).length === 1 ? 25 : 0) }))
    .sort((a, b) => b.s - a.s).slice(0, length).map((x) => x.t)
    .sort((a, b) => Date.parse(a.addedAt) - Date.parse(b.addedAt));
  if (forgotten.length >= 5) plans.push(mk("Unutulanlar", "Listenin ilk üçte birinde eklenmiş, sonra gözden kaybolmuş şarkılar", "En eski eklemelerden, az bilinen ve sanatçısından tek şarkı aldığın parçalar öne çıkarıldı.", forgotten, "anchor"));

  const bridge = all.filter((t) => t.playlists.length >= 2);
  const spanning = new Set((mined._clusters || []).filter((c) => c.playlists.length >= 2).map((c) => c.id));
  const fill = all.filter((t) => !bridge.includes(t) && spanning.has(mined.clusterOf[t.id])).sort((a, b) => (mined.clusterOf[a.id] - mined.clusterOf[b.id]) || ((a.year || 0) - (b.year || 0)));
  const bridges = [...bridge, ...fill];
  if (bridges.length >= 5) plans.push(mk("Köprüler", "Birden fazla listeyi birbirine bağlayan şarkılar ve adalar", "Hem birden fazla listede olan şarkılar hem de listeleri aşan zevk adaları tek akışa dizildi.", bridges, "bridge"));

  const bursts = mined.burstTrackIds.map((id) => byId.get(id)).filter(Boolean).sort((a, b) => Date.parse(a.addedAt) - Date.parse(b.addedAt));
  if (bursts.length >= 5) plans.push(mk("Patlama anları", "Tek günde toplu eklediğin takıntı ve keşif günlerinden şarkılar", "Takıntı günlerinin kronolojik özeti.", bursts, "anchor"));

  return plans;
}
