// Tarsier Research: keep the last version so the app opens without a connection. Always tries the network first.
const CACHE = "tarsier-v1";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request.url.split("?")[0], copy));
    return r;
  }).catch(() => caches.match(e.request.url.split("?")[0])));
});
