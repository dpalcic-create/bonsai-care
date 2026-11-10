const C = "bonsai-care-v1";
const F = [
  "./", "index.html", "style.css", "app.js", "species.js", "zones.js",
  "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(F)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const c = r.clone();
      caches.open(C).then(x => x.put(e.request, c));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
