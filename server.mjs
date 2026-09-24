// Jev Groove için bağımlılıksız mini sunucu.
// index.html'i servis eder ve /api/jev isteklerini API anahtarını ekleyerek
// Typesafe'e iletir; böylece anahtar tarayıcıya hiç inmez ve CORS sorunu olmaz.
//
//   TYPESAFE_API_KEY=ts_... node server.mjs
//   → http://localhost:8787 (telefondan: http://<bilgisayar-ip>:8787)

import http from "node:http";
import { readFile } from "node:fs/promises";

const PORT = Number(process.env.PORT) || 8787;
const KEY = process.env.TYPESAFE_API_KEY || "";
const UPSTREAM = process.env.TYPESAFE_ENDPOINT || "https://api.typesafe.ai/v1/systemone";
const page = new URL("./index.html", import.meta.url);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(await readFile(page));
    }
    if (req.method === "GET" && req.url === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ jev: true, hasKey: Boolean(KEY) }));
    }
    if (req.method === "POST" && req.url === "/api/jev") {
      if (!KEY) {
        res.writeHead(503, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "TYPESAFE_API_KEY tanımlı değil" }));
      }
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > 64 * 1024) { res.writeHead(413); return res.end(); }
        chunks.push(c);
      }
      const upstream = await fetch(UPSTREAM, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: Buffer.concat(chunks),
      });
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "application/json" });
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    }
    res.writeHead(404);
    res.end();
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Jev Groove → http://localhost:${PORT}  (${KEY ? "canlı Jev" : "anahtar yok, demo modu"})`);
});
