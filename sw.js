const CACHE_NAME = 'entangled-chat-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  'https://unpkg.com/@zxing/library@0.20.0/umd/index.min.js',
  'https://cdn.jsdelivr.net/npm/simple-peer@9.11.1/simplepeer.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});