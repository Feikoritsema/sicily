const CACHE_NAME = "sicily-shell-v1";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/constants.js",
  "./js/supabase-config.js",
  "./js/data-service.js",
  "./js/sync-queue.js",
  "./js/local-store.js",
  "./js/views/today.js",
  "./js/views/explore.js",
  "./js/views/dayplan.js",
  "./js/views/lists.js",
  "./js/views/info.js",
  "./js/views/profile.js",
  "./data/places.json",
  "./data/practical-info.json",
  "./data/events.json",
  "./data/packing-template.json",
  "./data/shared-items-template.json",
  "./favicon.svg",
  "./apple-touch-icon.png",
  "./icon-any-192.png",
  "./icon-maskable-192.png",
  "./icon-any-512.png",
  "./icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for the precached app shell + static JSON; network passthrough
// for everything else (Supabase's REST/Realtime traffic is never cached).
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
