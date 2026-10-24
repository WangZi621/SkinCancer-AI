// Offline support: the app shell is cached on install; the model and runtime
// are cached the first time they load, so later visits work without a network.
const VERSION = 'skinscan-2026-10-24a';
const SHELL = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/app.js', 'js/model.js', 'js/bodymap.js', 'js/heatmap.js', 'js/history.js',
  'vendor/litert.bundle.mjs',
  'fonts/ahn-400.woff2', 'fonts/ahn-600.woff2', 'fonts/ahn-700.woff2', 'fonts/ahn-800.woff2',
  'icons/icon.svg', 'samples/samples.json', 'img/kiosk.jpg',
];
const LARGE = /\.(tflite|wasm)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const url = new URL(req.url);

  // Model and runtime: cache first (they are large and versioned with the app).
  if (LARGE.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
    return;
  }

  // Everything else: serve from cache right away, refresh it in the background.
  event.respondWith(
    caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => {
      const network = fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit || caches.match('index.html'));
      return hit || network;
    }),
  );
});
