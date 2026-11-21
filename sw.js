// Tarsier Research: keep the last version so the app opens without a connection. Always tries the network first.
const CACHE = "tarsier-v3";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (new URL(e.request.url).origin !== self.location.origin) return;   // live prices, SEC and GitHub: never cached here
  const key = e.request.url.split("?")[0];
  if (/\/py\/(pyodide|wheels)\//.test(key))          // the Python runtime never changes for a version: keep it on the phone
    return e.respondWith(caches.match(key).then(hit => hit || fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      return r;
    })));
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(CACHE).then(c => c.put(e.request.url.split("?")[0], copy));
    return r;
  }).catch(() => caches.match(e.request.url.split("?")[0])));
});
