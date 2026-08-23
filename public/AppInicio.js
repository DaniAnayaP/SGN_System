// ---------------------------------------------------------------------------
// Native-app home screen (captura 4 of the Acceder flow) — greeting, and
// "Accesos rápidos" tiles built from this client's assigned App screens
// (see GET /api/business/app-screens, same data the "Aplicación Móvil"
// permission tab uses). If the client has no App assigned, or its App has
// no screens yet, the tiles stay empty — nothing invented.
// ---------------------------------------------------------------------------

const SUPPORTED_LANGS = ['en', 'es'];
const DEFAULT_LANG = 'en';
let dict = {};

function t(key, params = {}) {
    const value = key.split('.').reduce((obj, part) => obj?.[part], dict);
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}

async function loadLanguage() {
    const stored = localStorage.getItem('lang');
    const lang = SUPPORTED_LANGS.includes(stored) ? stored : DEFAULT_LANG;
    try {
        const res = await fetch(`i18n/${lang}.json`);
        if (res.ok) dict = await res.json();
    } catch {
        dict = {};
    }
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    const titleEl = document.querySelector('title[data-i18n]');
    if (titleEl) document.title = t(titleEl.dataset.i18n);
}

function showToast(message) {
    const container = document.getElementById('home-toast-container');
    const toast = document.createElement('div');
    toast.className = 'home-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
}

// webScreenKey -> the real Web page it fills (same keys WEB_SCREEN_CATALOG
// in db.js defines) plus a tile icon/color. Kept here (not fetched) since
// it's about THIS page's own navigation, not app-screen data itself —
// mirrors how every other screen's own column list in this codebase is a
// small hand-kept catalog rather than a server round trip.
const WEB_SCREEN_PAGES = {
    'centros-costo': { href: 'Business-CentrosCosto.html', icon: 'bx-purchase-tag-alt', color: '#3A4BC9' },
    'registro-combustible': { href: 'OpTransVolCombustible.html', icon: 'bx-gas-pump', color: '#c9503f' },
    'mi-recurso-humano': { href: 'OpRRHHMiRecursoHumano.html', icon: 'bx-id-card', color: '#1E7B3C' },
    'transacciones-inteligentes': { href: 'NegocioInteligente-Transacciones.html', icon: 'bx-line-chart', color: '#6C7CF0' },
    'reglas-orden-llenado': { href: 'Business-ReglasOrden.html', icon: 'bx-link', color: '#B8860B' },
};

function renderTiles(screens) {
    const tilesEl = document.getElementById('home-tiles');
    const emptyEl = document.getElementById('home-empty');
    tilesEl.innerHTML = '';
    if (!screens.length) {
        tilesEl.hidden = true;
        emptyEl.hidden = false;
        return;
    }
    tilesEl.hidden = false;
    emptyEl.hidden = true;
    screens.forEach((screen) => {
        const page = WEB_SCREEN_PAGES[screen.webScreenKey];
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'home-tile';
        tile.innerHTML = `
            <span class="home-tile-icon"${page ? ` style="background:${page.color}"` : ''}>
                <i class="bx ${page ? page.icon : 'bx-mobile-alt'}" aria-hidden="true"></i>
            </span>
            <span>${screen.name}</span>
        `;
        tile.addEventListener('click', () => {
            if (page) {
                window.location.href = page.href;
            } else {
                showToast(t('home.screenUnavailable'));
            }
        });
        tilesEl.appendChild(tile);
    });
}

document.getElementById('home-tab-registrar').addEventListener('click', () => showToast(t('home.comingSoon')));
document.getElementById('home-tab-reportes').addEventListener('click', () => showToast(t('home.comingSoon')));
document.getElementById('home-tab-perfil').addEventListener('click', () => showToast(t('home.comingSoon')));

(async function init() {
    await loadLanguage();
    try {
        const [meRes, screensRes] = await Promise.all([
            fetch('/api/me', { credentials: 'include' }),
            fetch('/api/business/app-screens', { credentials: 'include' }),
        ]);
        if (!meRes.ok) {
            window.location.replace('Login.html');
            return;
        }
        const { user } = await meRes.json();
        document.getElementById('home-user-name').textContent = user?.name || '';

        const screensData = screensRes.ok ? await screensRes.json() : { app: null, screens: [] };
        renderTiles(screensData.screens || []);
    } catch (err) {
        console.error('AppInicio failed to load:', err);
        renderTiles([]);
    }
})();
