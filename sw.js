const CACHE_NAME = 'acaroom-cache-v57';


const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/data.js',
  './js/player.js',
  './js/pitch.js',
  './js/archive.js',
  './js/mediaStorage.js',
  './js/router.js',
  './js/search.js',
  './js/storage.js',
  './js/ui.js',
  './data/songs.json',
  './data/performances.json',
  './data/rehearsals.json',
  './data/scores.json',
  './data/memories.json',
  './data/education.json',
  './data/practice_videos.json',
  './data/appreciation.json',
  './assets/icons/logo.svg',
  './assets/icons/logo.png',
  './assets/images/fallback.svg',
  './assets/images/acaraca-seal.png',
  './assets/icons/nav/home.png',
  './assets/icons/nav/songs.png',
  './assets/icons/nav/appreciation.png',
  './assets/icons/nav/stage.png',
  './assets/icons/nav/scores.png',
  './assets/icons/nav/memories.png',
  './assets/icons/nav/rehearsal.png',
  './assets/icons/nav/practiceVideos.png',
  './assets/icons/nav/education.png',
  './assets/icons/nav/favorites.png',
  './assets/icons/nav/recent.png',
  './assets/icons/nav/settings.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(CORE_ASSETS.map(url => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // External requests (YouTube, QR Server, etc.) bypass service worker cache
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-First for all local assets to ensure latest updates appear immediately
  // Falls back to cache when offline or network drops
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});

