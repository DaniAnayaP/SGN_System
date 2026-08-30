// SGN App service worker -- lets the App itself OPEN with zero signal, not
// just save data offline while it's already running (see AppOfflineSync.js
// for that half). Without this, a killed/reopened App tab with no signal
// had nothing to load at all -- the browser can't show a page it was never
// given bytes for.
//
// Strategy:
// - Navigations (opening an App*.html page): network-first, so an ONLINE
//   load always gets the current deploy; falls back to whatever cached
//   copy of that exact page exists when the network genuinely fails, or to
//   AppInicio.html as a last resort so offline at least lands somewhere
//   real instead of a browser error page.
// - Same-origin static assets (CSS/JS/icons): cache-first, since these
//   change rarely and a fast, always-available load matters more than
//   catching every edit instantly -- a fresh copy still gets fetched and
//   cached in the background on every hit.
// - /api/* and any cross-origin request (boxicons CDN, etc.): NEVER
//   touched here at all -- API freshness/offline-queueing is
//   AppOfflineSync.js's job, and caching a 3rd-party CDN asset isn't worth
//   the complexity for this phase (icons just don't render offline, which
//   is an acceptable gap, not a broken screen).
//
// CACHE_VERSION must be bumped by hand whenever this file's own caching
// behavior (or the precache list) changes -- the browser only re-checks
// THIS file's bytes for updates, and a stale cache under the SAME version
// name is reused forever otherwise. A version bump forces every client to
// throw away its old cache and start clean on next activate.
const CACHE_VERSION = 'sgn-app-shell-v1';
const APP_SHELL_URLS = [
    'AppInicio.html',
    'AppInicio.css',
    'AppInicio.js',
    'AppOfflineSync.js',
    'ColorPalette.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(APP_SHELL_URLS))
            .catch(() => {}) // a precache miss shouldn't block installation -- runtime caching still fills things in as pages are actually visited
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
                    return res;
                })
                .catch(() => caches.match(event.request).then((cached) => cached || caches.match('AppInicio.html')))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            const networkFetch = fetch(event.request)
                .then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
                    return res;
                })
                .catch(() => cached);
            return cached || networkFetch;
        })
    );
});
