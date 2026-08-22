// Minimal service worker — only exists so Chrome/Edge consider the site an
// installable PWA (that check requires a registered worker with a fetch
// handler). No offline caching yet; every request just goes to the network.
self.addEventListener('fetch', () => {});
