// Offline support: cache the app shell, network-first for everything else.
const CACHE = 'nsf-v2-2';
const SHELL = [
  './', './index.html', './app.css',
  './app.js', './util.js', './data.js', './foot3d.js', './scan.js', './video.js', './ui.js',
  './three.module.min.js', './shoe.jpg', './shoe-ar.png', './foot-iso.jpg', './foot-top.jpg', './foot-side.jpg', './foot-rear.jpg', './icon-192.png', './icon-512.png',
  './manifest.webmanifest'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    }).catch(() => caches.match('./index.html'))));
  }
});
