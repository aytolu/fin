import test from "node:test";
import assert from "node:assert/strict";
import { demoLibrary } from "../lib/demo.mjs";
import { mine, digest, localPlans, median } from "../lib/mine.mjs";
import { extractJSON, normalizePlan, trackKey, analyze } from "../lib/ai.mjs";
import { Spotify } from "../lib/spotify.mjs";

const lib = demoLibrary();
const m = mine(lib, { tz: 180 });

test("mine: temel istatistikler ve beklenen örüntüler", () => {
  assert.equal(m.stats.tracks, lib.tracks.length);
  const ids = m.patterns.map((p) => p.id);
  for (const id of ["bursts", "lag", "bridges", "clusters", "decades"]) assert.ok(ids.includes(id), id);
});

test("mine: demo'daki gömülü patlama günleri bulunur", () => {
  const b = m.patterns.find((p) => p.id === "bursts");
  assert.match(b.detail, /6 Mart 2022/);
  assert.match(b.detail, /Daft Punk ×3/);
});

test("mine: kümeler tüm şarkıları kapsar ve mantıklı ayrışır", () => {
  assert.ok(m.clusters.length >= 4);
  const hip = m.clusters.find((c) => c.artists.includes("Kendrick Lamar"));
  assert.ok(hip.artists.includes("Eminem"));
  const goth = m.clusters.find((c) => c.artists.includes("Joy Division"));
  assert.ok(!goth.artists.includes("Eminem"));
  assert.equal(Object.keys(m.clusterOf).length, lib.tracks.length);
});

test("mine: deterministik", () => {
  const a = JSON.stringify(mine(lib, { tz: 180 }).clusters.map((c) => c.artists));
  const b = JSON.stringify(mine(lib, { tz: 180 }).clusters.map((c) => c.artists));
  assert.equal(a, b);
});

test("mine: türsüz ve çok küçük kütüphanede çökmez", () => {
  const bare = { ...lib, artists: {} };
  assert.doesNotThrow(() => mine(bare));
  const tiny = { playlists: lib.playlists, tracks: lib.tracks.slice(0, 3), artists: {} };
  const r = mine(tiny);
  assert.deepEqual(r.clusters, []);
});

test("digest: kod haritası tutarlı, köprüler önce seçilir", () => {
  const d = digest(lib, m, { maxTracks: 30 });
  assert.equal(d.lines.length, 30);
  assert.ok(d.truncated);
  const picked = [...d.refs.values()];
  assert.ok(picked.filter((t) => t.playlists.length >= 2).length >= 13);
});

test("localPlans: üç yerel liste, yalnızca kütüphane şarkıları", () => {
  const p = localPlans(lib, m, { length: 10 });
  assert.equal(p.length, 3);
  for (const pl of p) { assert.ok(pl.tracks.length <= 10); assert.ok(pl.tracks.every((t) => t.inLibrary && t.uri)); }
});

test("extractJSON: çevreleyen metni ve kod bloğunu tolere eder", () => {
  assert.deepEqual(extractJSON('Tamam:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => extractJSON("json yok"), /JSON/);
  assert.throws(() => extractJSON("{bozuk"), /JSON/);
});

test("normalizePlan: geçersiz ref atılır, kütüphanedeki 'yeni' şarkı anchor olur, sanatçı sınırı uygulanır", () => {
  const d = digest(lib, m, { maxTracks: 300 });
  const t = [...d.refs.entries()][0];
  const raw = {
    dna: { headline: "h", summary: "s" },
    axes: [{ name: "a", low: "l", high: "h", position: 5 }],
    patterns: [{ name: "p", claim: "c", evidence: [t[0], "uydurma"], confidence: 3, surprise: -1 }],
    blindspots: ["x"],
    playlists: [{
      title: "T", arc: [{ label: "giriş" }],
      tracks: [
        { ref: t[0], segment: 0 },
        { ref: "t9999" },
        { title: t[1].name, artist: t[1].artists[0].name },
        { title: "Yeni 1", artist: "X", role: "wildcard" }, { title: "Yeni 2", artist: "X" }, { title: "Yeni 3", artist: "X" },
        { title: "Yeni 4", artist: "Y", role: "bogus" },
        { title: "Yeni 1", artist: "X" },
      ],
    }, { title: "boş", tracks: [{ ref: "t9999" }] }],
  };
  const { ai, plans } = normalizePlan(raw, lib, d);
  assert.equal(ai.axes[0].position, 1);
  assert.equal(ai.patterns[0].confidence, 1);
  assert.equal(ai.patterns[0].surprise, 0);
  assert.equal(ai.patterns[0].evidence.length, 2);
  assert.equal(plans.length, 1);
  const tr = plans[0].tracks;
  assert.equal(tr.filter((x) => x.artist === "X").length, 2);
  assert.equal(tr.find((x) => x.title === "Yeni 4").role, "stretch");
  assert.ok(tr.filter((x) => x.inLibrary).length >= 1);
  assert.equal(new Set(tr.map((x) => trackKey(x.title, x.artist))).size, tr.length);
});

test("analyze: sahte Anthropic yanıtıyla uçtan uca ve istek biçimi", async () => {
  const d = digest(lib, m, { maxTracks: 80 });
  let sent;
  const fetchImpl = async (url, init) => {
    sent = { url, init };
    const ref = [...d.refs.keys()][0];
    const out = { dna: { headline: "h", summary: "s" }, axes: [], patterns: [], blindspots: [], playlists: [{ title: "A", tracks: [{ ref }, { ref: [...d.refs.keys()][1] }, { ref: [...d.refs.keys()][2] }] }] };
    return { ok: true, status: 200, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(out) }] }) };
  };
  const r = await analyze({ lib, mined: m, dig: d, options: { familiarity: 40, length: 25, mood: "yağmur" }, apiKey: "k", model: "claude-sonnet-5-5", fetchImpl });
  assert.equal(r.plans.length, 1);
  const body = JSON.parse(sent.init.body);
  assert.equal(sent.url, "https://api.anthropic.com/v1/messages");
  assert.equal(sent.init.headers["x-api-key"], "k");
  assert.match(body.messages[0].content, /Tanıdıklık: %40/);
  assert.match(body.messages[0].content, /yağmur/);
  assert.equal(body.model, "claude-sonnet-5-5");
});

test("analyze: token sınırında kesilen yanıt anlaşılır hata verir", async () => {
  const d = digest(lib, m, { maxTracks: 20 });
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] }) });
  await assert.rejects(analyze({ lib, mined: m, dig: d, options: { familiarity: 50, length: 25 }, apiKey: "k", model: "m", fetchImpl }), /token sınırında/);
});

// ---- Spotify istemcisi (sahte fetch)
function fakeSpotify(handler) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = new URL(url);
    calls.push(`${init.method || "GET"} ${u.pathname}${u.search}`);
    const r = await handler(u, init);
    return { ok: r.status < 400, status: r.status, headers: { get: (k) => r.headers?.[k] }, json: async () => r.body };
  };
  const s = new Spotify({ clientId: "cid", redirectUri: "http://127.0.0.1:1/cb", fetchImpl: f });
  s.tokens = { access: "a", refresh: "r", exp: Date.now() + 1e6 };
  s.me = { id: "me1" };
  return { s, calls };
}
const item = (id, at, extra = {}) => ({ added_at: at, track: { id, uri: "spotify:track:" + id, name: id, type: "track", artists: [{ id: "ar" + id, name: "A" + id }], album: { name: "x", release_date: "1999-01-01" }, popularity: 50, duration_ms: 1000, ...extra } });

test("spotify: /items 404'te /tracks'e düşer, tekilleştirir, yerel/bölüm öğelerini atlar, en erken tarihi tutar", async () => {
  const { s, calls } = fakeSpotify((u) => {
    if (u.pathname.endsWith("/items")) return { status: 404, body: { error: { message: "nf" } } };
    if (u.pathname === "/v1/playlists/p1/tracks") return { status: 200, body: { items: [item("a", "2020-05-01T00:00:00Z"), item("b", "2020-06-01T00:00:00Z"), { added_at: "x", track: null }, item("loc", "2020-01-01T00:00:00Z", { is_local: true }), item("ep", "2020-01-01T00:00:00Z", { type: "episode" })], next: null } };
    if (u.pathname === "/v1/playlists/p2/tracks") return { status: 200, body: { items: [item("a", "2019-01-01T00:00:00Z")], next: null } };
    if (u.pathname === "/v1/artists") return { status: 200, body: { artists: [{ id: "ara", name: "Aa", genres: ["g1"], popularity: 5 }, null] } };
  });
  const lib2 = await s.library(["p1", "p2"], { p1: "Bir", p2: "İki" });
  assert.equal(lib2.tracks.length, 2);
  const a = lib2.tracks.find((t) => t.id === "a");
  assert.deepEqual(a.playlists, ["p1", "p2"]);
  assert.equal(a.addedAt, "2019-01-01T00:00:00Z");
  assert.equal(a.year, 1999);
  assert.deepEqual(lib2.artists.ara.genres, ["g1"]);
  assert.ok(calls.some((c) => c.includes("/tracks")));
  assert.equal(s.paths.items, "tracks");
});

test("spotify: sayfalama next bağlantısını izler; 429'da bekleyip yeniden dener", async () => {
  let n = 0;
  const { s } = fakeSpotify((u) => {
    if (u.pathname === "/v1/me/playlists" && !u.searchParams.get("offset")) {
      if (n++ === 0) return { status: 429, headers: { "retry-after": "0" }, body: {} };
      return { status: 200, body: { items: [{ id: "1", name: "A", tracks: { total: 3 } }], next: "https://api.spotify.com/v1/me/playlists?offset=50&limit=50" } };
    }
    return { status: 200, body: { items: [{ id: "2", name: "B", items: { total: 4 } }], next: null } };
  });
  const pls = await s.playlists();
  assert.deepEqual(pls.map((p) => [p.id, p.count]), [[1, 3], [2, 4]].map(([a, b]) => [String(a), b]));
});

test("spotify: createPlaylist /me/playlists 404'te eski uca düşer, 100'lük gruplar halinde ekler", async () => {
  const { s, calls } = fakeSpotify((u, init) => {
    if (u.pathname === "/v1/me/playlists") return { status: 404, body: {} };
    if (u.pathname === "/v1/users/me1/playlists") return { status: 201, body: { id: "np", external_urls: { spotify: "https://open.spotify.com/playlist/np" } } };
    if (u.pathname.endsWith("/items")) return { status: 404, body: {} };
    return { status: 201, body: {} };
  });
  const uris = Array.from({ length: 230 }, (_, i) => "spotify:track:" + i);
  const r = await s.createPlaylist({ name: "N", description: "d", isPublic: false, uris });
  assert.equal(r.url, "https://open.spotify.com/playlist/np");
  assert.equal(calls.filter((c) => c.startsWith("POST /v1/playlists/np/tracks")).length, 3);
});

test("spotify: findTrack tam eşleşmeyi seçer, bulamazsa null", async () => {
  const { s } = fakeSpotify((u) => ({ status: 200, body: { tracks: { items: [
    { uri: "u1", id: "1", name: "Teardrop (Live)", artists: [{ name: "Other" }] },
    { uri: "u2", id: "2", name: "Teardrop - Remastered", artists: [{ name: "Massive Attack" }] },
  ] } } }));
  assert.equal((await s.findTrack("Teardrop", "Massive Attack")).uri, "u2");
  assert.equal(await s.findTrack("Yok", "Kimse"), null);
});

test("spotify: loginUrl PKCE parametrelerini içerir, finishLogin geçersiz state'i reddeder", async () => {
  const { s } = fakeSpotify(() => ({ status: 200, body: {} }));
  const u = new URL(s.loginUrl());
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("client_id"), "cid");
  assert.ok(u.searchParams.get("state"));
  await assert.rejects(s.finishLogin("c", "bogus"), /state/);
});

test("median", () => { assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.ok(Number.isNaN(median([]))); });
