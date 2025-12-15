const CACHE = "ies-monitor-v1";

self.addEventListener("install", (evt) => {
  evt.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll([
        "./",
        "./index.html",
        "./styles.css",
        "./app.js",
        "./curriculum.json"
      ]).catch(() => {})
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (evt) => {
  evt.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (evt) => {
  evt.respondWith(
    caches.match(evt.request).then((cached) => cached || fetch(evt.request))
  );
});
