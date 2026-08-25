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
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)); });
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

// --- Hamburger menu: top-bar icons (same ones Sistema Web has) + logout ---
const hamburgerBtn = document.getElementById('home-hamburger-btn');
const hamburgerMenu = document.getElementById('home-hamburger-menu');
function closeHamburgerMenu() {
    hamburgerMenu.hidden = true;
    hamburgerBtn.setAttribute('aria-expanded', 'false');
}
hamburgerBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const willOpen = hamburgerMenu.hidden;
    hamburgerMenu.hidden = !willOpen;
    hamburgerBtn.setAttribute('aria-expanded', String(willOpen));
});
document.addEventListener('click', closeHamburgerMenu);
['home-menu-messages', 'home-menu-chatbot', 'home-menu-notifications', 'home-menu-bookmarks', 'home-menu-ui-scale', 'home-menu-user-info', 'home-menu-business-profile'].forEach((id) => {
    document.getElementById(id).addEventListener('click', () => {
        closeHamburgerMenu();
        showToast(t('home.comingSoon'));
    });
});
document.getElementById('home-menu-logout').addEventListener('click', async () => {
    closeHamburgerMenu();
    try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
        window.location.replace('Login.html');
    }
});

// --- Depto/Área and Centro de Costos pickers -----------------------------
// Neither is wired to real data yet — see the 2-step Depto→Área flow
// discussed for a later pass. Honest stub for now, same pattern as the
// category tabs below (comingSoon toast) rather than pretending to work.
document.getElementById('home-dept-area-btn').addEventListener('click', () => showToast(t('home.comingSoon')));
document.getElementById('home-cost-centers-btn').addEventListener('click', () => showToast(t('home.comingSoon')));

// --- Search bar toggle ------------------------------------------------------
const searchBtn = document.getElementById('home-search-btn');
const searchBar = document.getElementById('home-search-bar');
const searchInput = document.getElementById('home-search-input');
searchBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    searchBar.hidden = !searchBar.hidden;
    if (!searchBar.hidden) searchInput.focus();
});

// --- Breadcrumb collapse/expand — same idea as Dashboard.js's own
// breadcrumb-toggle (bx-map-alt + chevron), just simpler: no persisted
// localStorage preference, this page doesn't have as much vertical
// pressure as the desktop shell to justify remembering it across visits.
const breadcrumbTrail = document.getElementById('home-breadcrumb-trail');
const breadcrumbToggle = document.getElementById('home-breadcrumb-toggle');
const breadcrumbChevron = document.getElementById('home-breadcrumb-toggle-chevron');
breadcrumbToggle.addEventListener('click', () => {
    const collapsed = !breadcrumbTrail.hidden;
    breadcrumbTrail.hidden = collapsed;
    breadcrumbChevron.className = collapsed ? 'bx bx-chevron-down' : 'bx bx-chevron-up';
    breadcrumbToggle.setAttribute('aria-label', t(collapsed ? 'main.breadcrumbExpand' : 'main.breadcrumbCollapse'));
});

// --- Bottom category tabs --------------------------------------------------
// Only Inicio actually has content (the Accesos rápidos tiles below, from
// this client's assigned App screens) — every other category is a stub
// until its own mobile screen exists, same "coming soon" honesty as the
// old Registrar/Reportes/Perfil tabs it replaces.
const breadcrumbCurrent = document.getElementById('home-breadcrumb-current');
document.querySelectorAll('.home-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.home-tab').forEach((other) => other.classList.remove('active'));
        tab.classList.add('active');
        breadcrumbCurrent.textContent = t(tab.dataset.breadcrumbKey);
        if (tab.id !== 'home-tab-inicio') showToast(t('home.comingSoon'));
    });
});

async function loadClientBranding() {
    const logoImg = document.getElementById('home-client-logo');
    const logoFallback = document.getElementById('home-client-logo-fallback');
    const nameEl = document.getElementById('home-client-name');
    try {
        const res = await fetch('/api/business/branding', { credentials: 'include' });
        if (!res.ok) return;
        const { branding } = await res.json();
        nameEl.textContent = branding.companyAbbreviation || branding.companyName || '';
        if (branding.logoDataUrl) {
            logoImg.src = branding.logoDataUrl;
            logoImg.hidden = false;
            logoFallback.hidden = true;
        }
    } catch {
        // Fallback icon + blank name already in the markup — nothing to do.
    }
}

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
        loadClientBranding();
    } catch (err) {
        console.error('AppInicio failed to load:', err);
        renderTiles([]);
    }
})();
