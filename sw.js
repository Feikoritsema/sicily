const CACHE_NAME = "sicily-shell-v2";

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
  "./js/util.js",
  "./js/categories.js",
  "./js/votes.js",
  "./js/day-plan.js",
  "./js/places-data.js",
  "./js/shared-items.js",
  "./js/shopping-list.js",
  "./js/markdown.js",
  "./js/people.js",
  "./js/trip-settings.js",
  "./js/custom-places.js",
  "./js/photo-fallback.js",
  "./js/views/today.js",
  "./js/views/explore.js",
  "./js/views/explore-swipe.js",
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

// Network-first with cache fallback for same-origin requests: an online user
// always gets the latest deployed code (this app iterates a lot before the
// trip, and a stale cache-first policy would silently pin them to old code
// past a hard refresh, since Cache Storage isn't cleared by that). Offline,
// the last successfully fetched copy serves instead. Supabase's REST/Realtime
// traffic is a different origin and never touches this cache.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
