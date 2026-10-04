// Spotify Web API istemcisi: PKCE ile giriş (client secret gerekmez), sayfalama, 429 bekleme.
//
// Not: Spotify 2024-2026'da uç noktaları değiştirdi (audio-features kapandı, /tracks → /items,
// POST /users/{id}/playlists → POST /me/playlists). Yeni ad önce denenir, 404'te eskiye düşülür.
import crypto from "node:crypto";

const API = "https://api.spotify.com/v1";
const SCOPES = "playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public";
const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Spotify {
  constructor({ clientId, redirectUri, fetchImpl = fetch }) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.f = fetchImpl;
    this.tokens = null;
    this.pending = new Map(); // state → verifier
    this.paths = {};
  }

  get connected() { return Boolean(this.tokens); }

  loginUrl() {
    const verifier = b64url(crypto.randomBytes(48));
    const state = b64url(crypto.randomBytes(16));
    this.pending.set(state, verifier);
    const q = new URLSearchParams({
      client_id: this.clientId, response_type: "code", redirect_uri: this.redirectUri, scope: SCOPES, state,
      code_challenge_method: "S256", code_challenge: b64url(crypto.createHash("sha256").update(verifier).digest()),
    });
    return "https://accounts.spotify.com/authorize?" + q;
  }

  async finishLogin(code, state) {
    const verifier = this.pending.get(state);
    if (!verifier) throw new Error("Geçersiz state; girişi baştan başlat");
    this.pending.delete(state);
    await this.#token({ grant_type: "authorization_code", code, redirect_uri: this.redirectUri, code_verifier: verifier });
    this.me = await this.get("/me");
  }

  async #token(params) {
    const res = await this.f("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.clientId, ...params }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error("Spotify token: " + (j.error_description || j.error || res.status));
    this.tokens = { access: j.access_token, refresh: j.refresh_token || this.tokens?.refresh, exp: Date.now() + (j.expires_in - 30) * 1000 };
  }

  async req(method, path, { query, body } = {}, attempt = 0) {
    if (!this.tokens) throw Object.assign(new Error("Spotify'a bağlı değilsin"), { status: 401 });
    if (Date.now() > this.tokens.exp && this.tokens.refresh) await this.#token({ grant_type: "refresh_token", refresh_token: this.tokens.refresh });
    const url = API + path + (query ? "?" + new URLSearchParams(query) : "");
    const res = await this.f(url, {
      method,
      headers: { authorization: "Bearer " + this.tokens.access, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 4) {
      await sleep((Number(res.headers.get("retry-after")) || 1) * 1000 + 200);
      return this.req(method, path, { query, body }, attempt + 1);
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw Object.assign(new Error(`Spotify ${res.status} ${path}: ${j.error?.message || ""}`), { status: res.status });
    }
    return res.status === 204 ? null : res.json();
  }

  get(path, query) { return this.req("GET", path, { query }); }

  async #page(first, query) {
    const out = [];
    let page = await this.get(first, { ...query, limit: 50 });
    out.push(...page.items);
    while (page.next) {
      const u = new URL(page.next);
      page = await this.get(u.pathname.replace(/^\/v1/, ""), Object.fromEntries(u.searchParams));
      out.push(...page.items);
    }
    return out;
  }

  async playlists() {
    const items = await this.#page("/me/playlists");
    return items.filter(Boolean).map((p) => ({
      id: p.id, name: p.name, count: p.tracks?.total ?? p.items?.total ?? 0, image: p.images?.[0]?.url || null, owner: p.owner?.display_name || "",
    }));
  }

  async #items(id) {
    const order = this.paths.items === "tracks" ? ["tracks", "items"] : ["items", "tracks"];
    for (const [i, p] of order.entries()) {
      try {
        const out = await this.#page(`/playlists/${id}/${p}`);
        this.paths.items = p;
        return out;
      } catch (e) {
        if (i === order.length - 1 || ![400, 404].includes(e.status)) throw e;
      }
    }
  }

  // Seçilen listeleri tek bir tekilleştirilmiş kütüphaneye çevirir.
  async library(playlistIds, names = {}, onProgress = () => {}) {
    const byId = new Map();
    const playlists = [];
    for (const id of playlistIds) {
      onProgress(`Liste okunuyor: ${names[id] || id}`);
      const items = await this.#items(id);
      let n = 0;
      for (const it of items) {
        const tr = it.track || it.item;
        if (!tr || tr.type === "episode" || !tr.id || tr.is_local) continue;
        n++;
        let t = byId.get(tr.id);
        if (!t) {
          t = {
            id: tr.id, uri: tr.uri, name: tr.name, artists: (tr.artists || []).map((a) => ({ id: a.id, name: a.name })),
            album: tr.album?.name || "", year: parseInt(tr.album?.release_date) || null, popularity: tr.popularity,
            durationMs: tr.duration_ms, explicit: Boolean(tr.explicit), addedAt: it.added_at || null, playlists: [],
          };
          byId.set(tr.id, t);
        } else if (it.added_at && (!t.addedAt || it.added_at < t.addedAt)) t.addedAt = it.added_at;
        if (!t.playlists.includes(id)) t.playlists.push(id);
      }
      playlists.push({ id, name: names[id] || id, count: n });
    }
    const tracks = [...byId.values()];
    const artists = {};
    const ids = [...new Set(tracks.flatMap((t) => t.artists.map((a) => a.id)).filter(Boolean))];
    onProgress(`${ids.length} sanatçının türleri alınıyor`);
    try {
      for (let i = 0; i < ids.length; i += 50) {
        const r = await this.get("/artists", { ids: ids.slice(i, i + 50).join(",") });
        for (const a of r.artists || []) if (a) artists[a.id] = { name: a.name, genres: a.genres || [], popularity: a.popularity };
      }
    } catch (e) {
      onProgress("Tür bilgisi alınamadı, tür olmadan devam: " + e.message); // yeni API sınırlamaları olabilir
    }
    return { playlists, tracks, artists };
  }

  async findTrack(title, artist) {
    const clean = (s) => s.replace(/["']/g, " ");
    for (const q of [`track:"${clean(title)}" artist:"${clean(artist.split(",")[0])}"`, `${clean(title)} ${clean(artist.split(",")[0])}`]) {
      try {
        const r = await this.get("/search", { q, type: "track", limit: 5 });
        const items = r.tracks?.items || [];
        const want = (s) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]|- .*$/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        const hit = items.find((t) => want(t.name) === want(title) && t.artists.some((a) => want(a.name) === want(artist.split(",")[0]))) ||
          items.find((t) => t.artists.some((a) => want(a.name) === want(artist.split(",")[0])) && (want(t.name).includes(want(title)) || want(title).includes(want(t.name))));
        if (hit) return { uri: hit.uri, id: hit.id, name: hit.name, artist: hit.artists.map((a) => a.name).join(", ") };
      } catch (e) { if (e.status !== 400) throw e; }
    }
    return null;
  }

  async createPlaylist({ name, description, isPublic, uris }) {
    const body = { name, description, public: Boolean(isPublic) };
    let pl;
    try { pl = await this.req("POST", "/me/playlists", { body }); }
    catch (e) { if (![404, 405].includes(e.status)) throw e; pl = await this.req("POST", `/users/${this.me.id}/playlists`, { body }); }
    const order = this.paths.add === "tracks" ? ["tracks", "items"] : ["items", "tracks"];
    for (let i = 0; i < uris.length; i += 100) {
      const chunk = uris.slice(i, i + 100);
      for (const [k, p] of order.entries()) {
        try { await this.req("POST", `/playlists/${pl.id}/${p}`, { body: { uris: chunk } }); this.paths.add = p; break; }
        catch (e) { if (k === order.length - 1 || ![400, 404].includes(e.status)) throw e; }
      }
    }
    return { id: pl.id, url: pl.external_urls?.spotify || `https://open.spotify.com/playlist/${pl.id}` };
  }
}
