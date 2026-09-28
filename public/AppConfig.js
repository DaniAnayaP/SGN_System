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

// --- CSRF token on every mutating fetch (security review, 2026-09-28,
// finding #04) -------------------------------------------------------------
// Same patch as Dashboard.js's own (see the long comment there for the full
// reasoning), loaded here instead so it covers every App*/Admin mobile+PWA
// screen -- AppConfig.js is the one script every one of those pages loads
// first, before AppOfflineSync.js, PermissionTree.js, or any page's own
// AppXxx.js ever gets a chance to call fetch. The one difference from
// Dashboard.js: "our own API" here also means the native app's ABSOLUTE
// cross-origin URL (SGN_NATIVE_API_ORIGIN), not just same-origin -- every
// native fetch is cross-origin by design (see sgnIsNativeApp above), so
// same-origin alone would never match and no request would ever get a
// token. A third-party request (R2's presigned upload URL, boxicons, fonts)
// still correctly gets skipped either way.
(function installCsrfFetchPatch() {
    const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    const originalFetch = window.fetch.bind(window);
    function getToken() {
        try { return localStorage.getItem('sgn_csrf_token'); } catch { return null; }
    }
    function setToken(token) {
        try { localStorage.setItem('sgn_csrf_token', token); } catch { /* ignore */ }
    }
    function isOwnApi(url) {
        try {
            const origin = new URL(url, window.location.href).origin;
            if (origin === window.location.origin) return true;
            return origin === new URL(SGN_NATIVE_API_ORIGIN).origin;
        } catch { return false; }
    }
    window.fetch = async function (input, init = {}) {
        const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
        const url = input instanceof Request ? input.url : input;
        if (!MUTATING.has(method) || !isOwnApi(url)) return originalFetch(input, init);

        const attempt = (token) => originalFetch(input, { ...init, headers: { ...(init.headers || {}), 'X-CSRF-Token': token || '' } });
        let res = await attempt(getToken());
        if (res.status === 403 && !getToken()) {
            // Same rollout-gap recovery as Dashboard.js: a session opened
            // before this feature shipped (or via a login path that doesn't
            // capture the token) mints one here instead of failing outright.
            try {
                const tokenRes = await originalFetch(window.apiUrl('/api/auth/csrf-token'), { credentials: 'include' });
                if (tokenRes.ok) {
                    const { csrfToken } = await tokenRes.json();
                    if (csrfToken) { setToken(csrfToken); res = await attempt(csrfToken); }
                }
            } catch { /* leave the original 403 response as-is */ }
        }
        return res;
    };
})();
