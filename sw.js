// Tarsier Research: keep the last version so the app opens without a connection. Always tries the network first.
const CACHE = "tarsier-v2";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== self.location.origin) return;   // live prices, SEC and GitHub: never cached here
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request.url.split("?")[0], copy));
    return r;
  }).catch(() => caches.match(e.request.url.split("?")[0])));
});
