// Zevk Laboratuvarı sunucusu (bağımlılıksız).
//
//   SPOTIFY_CLIENT_ID=... ANTHROPIC_API_KEY=... npm start   → http://127.0.0.1:8888
//   npm run demo                                             → Spotify'sız, örnek kütüphane
//
// Sunucu yalnızca 127.0.0.1'e bağlanır: Spotify jetonları ve API anahtarı bu süreçte durur.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { Spotify } from "./lib/spotify.mjs";
import { mine, digest, localPlans } from "./lib/mine.mjs";
import { analyze } from "./lib/ai.mjs";
import { demoLibrary } from "./lib/demo.mjs";

const PORT = Number(process.env.PORT) || 8888;
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const REDIRECT = process.env.SPOTIFY_REDIRECT_URI || `http://127.0.0.1:${PORT}/callback`;
const AI_KEY = process.env.ANTHROPIC_API_KEY || "";
const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const AI_BASE = process.env.ANTHROPIC_BASE_URL || undefined;
const DEMO = process.env.DEMO === "1" || !CLIENT_ID;

const spotify = DEMO ? null : new Spotify({ clientId: CLIENT_ID, redirectUri: REDIRECT });
const S = { lib: null, mined: null, plans: [], progress: "", tz: 0 };
const page = new URL("./public/index.html", import.meta.url);

const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
const fail = (res, e) => json(res, e.status && e.status < 600 && e.status >= 400 ? e.status : 500, { error: String(e.message || e) });

async function body(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 256 * 1024) throw Object.assign(new Error("İstek çok büyük"), { status: 413 }); chunks.push(c); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

// Basit CSRF koruması: tarayıcıdan gelen POST'un Origin'i Host ile aynı olmalı.
function sameOrigin(req) {
  const o = req.headers.origin;
  return !o || new URL(o).host === req.headers.host;
}

const publicMined = (m) => { const { _clusters, ...rest } = m; return rest; };

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(await readFile(page));
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      return json(res, 200, { demo: DEMO, connected: DEMO || spotify.connected, user: spotify?.me?.display_name || null, ai: { enabled: Boolean(AI_KEY), model: AI_KEY ? AI_MODEL : null }, hasLibrary: Boolean(S.lib), progress: S.progress });
    }
    if (req.method === "GET" && url.pathname === "/api/progress") return json(res, 200, { progress: S.progress });

    if (!DEMO && req.method === "GET" && url.pathname === "/login") {
      res.writeHead(302, { location: spotify.loginUrl() });
      return res.end();
    }
    if (!DEMO && req.method === "GET" && url.pathname === "/callback") {
      if (url.searchParams.get("error")) { res.writeHead(302, { location: "/?error=" + encodeURIComponent(url.searchParams.get("error")) }); return res.end(); }
      await spotify.finishLogin(url.searchParams.get("code"), url.searchParams.get("state"));
      res.writeHead(302, { location: "/" });
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/api/playlists") {
      return json(res, 200, DEMO ? demoLibrary().playlists : await spotify.playlists());
    }

    if (req.method === "POST") {
      if (!sameOrigin(req)) return json(res, 403, { error: "Origin uyuşmuyor" });
      const b = await body(req);

      if (url.pathname === "/api/library") {
        const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
        if (!ids.length) return json(res, 400, { error: "En az bir liste seç" });
        S.tz = Number.isFinite(+b.tz) ? +b.tz : 0;
        S.plans = [];
        if (DEMO) {
          const d = demoLibrary();
          S.lib = { ...d, playlists: d.playlists.filter((p) => ids.includes(p.id)), tracks: d.tracks.map((t) => ({ ...t, playlists: t.playlists.filter((p) => ids.includes(p)) })).filter((t) => t.playlists.length) };
        } else {
          const names = Object.fromEntries((b.names ? Object.entries(b.names) : []));
          S.lib = await spotify.library(ids, names, (m) => { S.progress = m; });
        }
        if (S.lib.tracks.length < 10) { S.progress = ""; return json(res, 400, { error: `Yalnızca ${S.lib.tracks.length} şarkı bulundu; anlamlı örüntü için en az 10 gerekir` }); }
        S.progress = "Örüntüler çıkarılıyor";
        S.mined = mine(S.lib, { tz: S.tz });
        S.progress = "";
        return json(res, 200, { ...publicMined(S.mined), playlists: S.lib.playlists });
      }

      if (url.pathname === "/api/ai") {
        if (!S.lib) return json(res, 400, { error: "Önce listeleri analiz et" });
        const options = {
          familiarity: Number.isFinite(+b.familiarity) ? Math.max(0, Math.min(100, Math.round(+b.familiarity))) : 50,
          length: [15, 25, 40].includes(+b.length) ? +b.length : 25,
          mood: String(b.mood || "").slice(0, 400),
        };
        let ai = null, plans, note = "";
        if (AI_KEY) {
          S.progress = "Claude örüntüleri yorumluyor ve listeleri kuruyor (30-90 sn sürebilir)";
          try {
            const dig = digest(S.lib, S.mined, { maxTracks: 260 });
            ({ ai, plans } = await analyze({ lib: S.lib, mined: S.mined, dig, options, apiKey: AI_KEY, model: AI_MODEL, baseUrl: AI_BASE }));
          } catch (e) {
            note = "Yapay zeka katmanı başarısız oldu, yerel listelere düşüldü: " + e.message;
          }
        } else note = "ANTHROPIC_API_KEY tanımlı değil: yalnızca yerel örüntülerden liste kuruldu.";
        if (!plans?.length) plans = localPlans(S.lib, S.mined, options);

        if (spotify?.connected) {
          S.progress = "Yeni şarkılar Spotify'da aranıyor";
          const todo = plans.flatMap((p) => p.tracks).filter((t) => !t.uri);
          await pool(todo, 4, async (t) => {
            try { const f = await spotify.findTrack(t.title, t.artist); if (f) { t.uri = f.uri; t.title = f.name; t.artist = f.artist; } } catch { /* tek şarkı hatası listeyi bozmasın */ }
          });
        }
        S.progress = "";
        S.plans = plans;
        return json(res, 200, { ai, plans, note, demo: DEMO });
      }

      if (url.pathname === "/api/create") {
        if (DEMO) return json(res, 400, { error: "Demo modunda Spotify'a yazılamaz. SPOTIFY_CLIENT_ID ile başlat." });
        const plan = S.plans[+b.planIndex];
        if (!plan) return json(res, 400, { error: "Liste bulunamadı" });
        const uris = [...new Set(plan.tracks.map((t) => t.uri).filter(Boolean))];
        if (!uris.length) return json(res, 400, { error: "Spotify'da bulunan şarkı yok" });
        const out = await spotify.createPlaylist({
          name: String(b.name || plan.title).slice(0, 100),
          description: String(plan.concept || "").slice(0, 280) + " · Zevk Laboratuvarı",
          isPublic: Boolean(b.isPublic), uris,
        });
        return json(res, 200, { ...out, added: uris.length, skipped: plan.tracks.length - uris.length });
      }
    }
    res.writeHead(404); res.end();
  } catch (e) {
    S.progress = "";
    fail(res, e);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Zevk Laboratuvarı → http://127.0.0.1:${PORT}`);
  console.log(`  Spotify: ${DEMO ? "DEMO (örnek kütüphane)" : "gerçek, redirect " + REDIRECT}`);
  console.log(`  Yapay zeka: ${AI_KEY ? AI_MODEL : "anahtar yok → yalnızca yerel örüntüler"}`);
});
