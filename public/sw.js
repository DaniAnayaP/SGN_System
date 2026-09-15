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
// CACHE_VERSION -- confirmed live (2026-09-15) that a hardcoded constant
// here defeats activate()'s own cleanup below: since the name never
// changed across deploys, `keys.filter((key) => key !== CACHE_VERSION)`
// always filtered out the ONE cache that ever existed, so it was never
// actually cleared -- every update kept serving whatever got cached
// under the first install, indefinitely (this is what made the App look
// permanently stuck on old content, well past normal "one extra reload"
// staleness). The native build (mobile-app/) now stamps this at CI time
// (see .github/workflows/build-apk.yml) to a value that changes on every
// build, so activate() actually has a new name to compare against and
// finally clears the old cache. This literal fallback only matters for
// the web-served copy (public/) and for local/manual testing -- bump it
// by hand there when this file's own caching behavior changes.
const CACHE_VERSION = 'sgn-app-shell-v2';
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
