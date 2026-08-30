// Fills in window.APP_CONFIG.apiBase, which login.js/Dashboard.js already
// read as `window.APP_CONFIG?.apiBase || '/api'` -- until now nothing ever
// set it, so every page always fell back to the same-origin '/api'. That's
// correct for the desktop site and the installed PWA (both are SERVED by
// this same backend), but the native Android app (mobile-app/) bundles this
// exact HTML/CSS/JS locally inside the .apk instead of loading it from the
// server -- see mobile-app/capacitor.config.json. Loaded from there, a
// relative '/api/...' call would hit the WebView's own local origin, not
// the real backend, so that one case needs the real server's absolute URL
// instead.
//
// Both apiBase and apiUrl() re-check window.Capacitor on every read rather
// than caching one answer up front: it's injected by the native bridge
// asynchronously and isn't guaranteed to exist yet the instant a deferred
// script's top-level code runs (see access-screen.js's waitForCapacitor for
// the exact same race, confirmed live there before that fix existed) --
// caching the answer this early risked baking in the wrong one. An actual
// fetch always happens later, well after the bridge has had time to attach,
// so checking again at call time is what makes this reliable.
const SGN_NATIVE_API_ORIGIN = 'https://sgnsystem-production.up.railway.app';

function sgnIsNativeApp() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

window.APP_CONFIG = {
    get apiBase() {
        return sgnIsNativeApp() ? `${SGN_NATIVE_API_ORIGIN}/api` : '/api';
    },
};

// For call sites that already spell out the full '/api/...' path as a
// literal -- wraps it with the real origin only when running natively,
// otherwise returns it unchanged.
window.apiUrl = function apiUrl(path) {
    return sgnIsNativeApp() ? SGN_NATIVE_API_ORIGIN + path : path;
};
