// Offline support and faster inference.
// - The app shell is cached on install; the model and runtime are cached the first
//   time they load, so later visits work without a network.
// - Pages served through this worker get cross-origin isolation headers, which lets
//   ONNX Runtime use several CPU threads on return visits. Everything is same-origin.
const VERSION = 'skinscan-2026-10-26g';
const SHELL = [
  './', 'index.html', 'app.css', 'manifest.webmanifest',
  'js/app.js', 'js/model.js', 'js/bodymap.js', 'js/heatmap.js', 'js/store.js', 'js/ui.js',
  'js/pages.js', 'js/quality.js', 'js/chart.js', 'js/body-figures.js', 'js/explain.js',
  'vendor/ort/ort.wasm.min.mjs', 'vendor/ort/ort-wasm-simd-threaded.mjs',
  'fonts/archivo.woff2', 'fonts/archivo-ext.woff2', 'fonts/geist-mono.woff2', 'icons/icon.svg', 'favicon.ico', 'samples/samples.json', 'img/kiosk.jpg',
];
const LARGE = /\.(onnx|wasm)$/;

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

function isolate(res) {
  if (!res || res.status === 0 || res.type === 'opaque') return res;
  const headers = new Headers(res.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function cacheAndReturn(req, res) {
  if (res.ok) {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const url = new URL(req.url);

  if (LARGE.test(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => cacheAndReturn(req, res))).then(isolate));
    return;
  }

  // Serve from cache right away and refresh it in the background.
  event.respondWith(
    caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => {
      const network = fetch(req).then((res) => cacheAndReturn(req, res)).catch(() => hit || caches.match('index.html'));
      return (hit || network);
    }).then(isolate),
  );
});
