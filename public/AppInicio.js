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

// Same structure/behavior as login.js's showToast (icon, message, close X,
// timed progress bar), just the dark palette this page already uses —
// "pegada a un costado" (top-right corner), not the old full-width bottom
// banner.
function showToast(message, duration = 4000) {
    const container = document.getElementById('home-toast-container');
    const toast = document.createElement('div');
    toast.className = 'home-toast';
    toast.setAttribute('role', 'status');

    const icon = document.createElement('span');
    icon.className = 'home-toast-icon';
    icon.innerHTML = '<i class="bx bx-info-circle" aria-hidden="true"></i>';

    const msgEl = document.createElement('p');
    msgEl.className = 'home-toast-message';
    msgEl.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'home-toast-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';

    const progress = document.createElement('div');
    progress.className = 'home-toast-progress';

    let dismissTimer = null;
    const close = () => {
        if (dismissTimer) clearTimeout(dismissTimer);
        toast.classList.remove('home-toast-visible');
        setTimeout(() => toast.remove(), 300);
    };
    closeBtn.addEventListener('click', close);

    toast.append(icon, msgEl, closeBtn, progress);
    container.appendChild(toast);
    void toast.offsetWidth;
    toast.classList.add('home-toast-visible');
    progress.style.transitionDuration = `${duration}ms`;
    progress.style.width = '0';
    dismissTimer = setTimeout(close, duration);
}

// webScreenKey -> the real Web page it fills (same keys WEB_SCREEN_CATALOG
// in db.js defines) plus a tile icon/color. Kept here (not fetched) since
// it's about THIS page's own navigation, not app-screen data itself —
// mirrors how every other screen's own column list in this codebase is a
// small hand-kept catalog rather than a server round trip.
// No per-screen color here on purpose — every tile icon uses the theme's
// own accent gradient (.home-tile-icon's CSS, var(--home-accent-strong-1/2))
// so it stays legible and consistent across Claro/Oscuro/Institucional/
// Futurista instead of a hardcoded hex fighting whichever theme is active.
const WEB_SCREEN_PAGES = {
    'centros-costo': { href: 'Business-CentrosCosto.html', icon: 'bx-purchase-tag-alt' },
    'registro-combustible': { href: 'OpTransVolCombustible.html', icon: 'bx-gas-pump' },
    'carga-combustible': { href: 'AppCargaCombustible.html', icon: 'bx-gas-pump' },
    'tipos-unidad': { href: 'AppTiposUnidad.html', icon: 'bx-car' },
    'nuestras-unidades': { href: 'AppNuestrasUnidades.html', icon: 'bx-car' },
    'mi-recurso-humano': { href: 'OpRRHHMiRecursoHumano.html', icon: 'bx-id-card' },
    'transacciones-inteligentes': { href: 'NegocioInteligente-Transacciones.html', icon: 'bx-line-chart' },
    'reglas-orden-llenado': { href: 'Business-ReglasOrden.html', icon: 'bx-link' },
    'roles': { href: 'AppRoles.html', icon: 'bx-shield' },
};

// menu.json pantalla id -> its WEB_SCREEN_PAGES key, for the category
// screen picker below (renderCategoryScreens) — only needed for pantallas
// that have curated tile info; anything missing here just falls back to
// its own menu.json href (the desktop page) with a generic icon.
const PANTALLA_ID_TO_WEB_SCREEN_KEY = {
    'cat-operaciones-transporte-vol-combustible': 'registro-combustible',
    'cat-operaciones-transporte-vol-carga-combustible': 'carga-combustible',
    'cat-catalogos-transporte-vol-tipos-unidades': 'tipos-unidad',
    'cat-operaciones-transporte-vol-nuestras-unidades': 'nuestras-unidades',
};

// grantedAppScreens (from GET /api/business/app-screens) is the CLIENT's
// whole App configuration -- every screen the App has, regardless of
// which of them THIS user was actually granted. Nothing here ever
// narrowed it down before, so every App user saw a tile for every screen
// the client had configured, whether or not their own Puesto/Permisos
// Adicionales actually gave them "Visión APP" on it -- same gap already
// fixed on the category-screen picker (see isPantallaAppVisible), just
// never applied to these home-screen tiles too.
function isAppScreenGrantedForTile(screen) {
    if (isUnrestrictedClientAdmin()) return true;
    if (!screen.sectionId || !screen.itemId) return false;
    if (!screen.submenuPrefix) {
        // A general-button "screen" (Mensajes, Notificaciones...) has no
        // App-vision toggle of its own -- gated the same way its
        // hamburger-menu/tab-bar counterpart already is.
        return hasMainButtonPermission(screen.itemId);
    }
    // A real catalog screen's App-vision grant may sit on the pantalla
    // itself OR on any column/classification nested under it (checking
    // "Ver y Operar" on one column and turning on Visión APP just for that
    // column is a normal, valid grant shape) -- same "any descendant
    // counts" rule as Dashboard.js's own hasScreenGrant.
    return effectiveGrants.some((g) => {
        if (g.sectionId !== screen.sectionId || g.itemId !== screen.itemId || !g.submenuId) return false;
        if (!g.submenuId.endsWith('#app')) return false;
        const base = g.submenuId.slice(0, -'#app'.length);
        return base === screen.submenuPrefix || base.startsWith(`${screen.submenuPrefix}/`);
    });
}

function renderTiles(screens) {
    const tilesEl = document.getElementById('home-tiles');
    const emptyEl = document.getElementById('home-empty');
    tilesEl.innerHTML = '';
    const visibleScreens = screens.filter(isAppScreenGrantedForTile);
    if (!visibleScreens.length) {
        tilesEl.hidden = true;
        emptyEl.hidden = false;
        return;
    }
    tilesEl.hidden = false;
    emptyEl.hidden = true;
    visibleScreens.forEach((screen) => {
        const page = WEB_SCREEN_PAGES[screen.webScreenKey];
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'home-tile';
        tile.innerHTML = `
            <span class="home-tile-icon">
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
['home-menu-bookmarks', 'home-menu-others'].forEach((id) => {
    document.getElementById(id).addEventListener('click', () => {
        closeHamburgerMenu();
        showToast(t('home.comingSoon'));
    });
});
// Database / Business Intelligence are collapsible groups here too — same
// shape as Sistema Web's own Settings dropdown (a toggle that reveals its
// real item(s) instead of navigating straight there itself). Both currently
// have exactly one child (mirrors the desktop submenu 1:1); more can be
// added later the same way "Administración del Negocio" nests many.
function wireMenuGroupToggle(toggleId, submenuId) {
    const toggle = document.getElementById(toggleId);
    const submenu = document.getElementById(submenuId);
    toggle.addEventListener('click', (event) => {
        event.stopPropagation();
        const willOpen = submenu.hidden;
        submenu.hidden = !willOpen;
        toggle.setAttribute('aria-expanded', String(willOpen));
    });
}
wireMenuGroupToggle('home-menu-database', 'home-database-submenu');
wireMenuGroupToggle('home-menu-business-intelligence', 'home-business-intelligence-submenu');

// Their own screens aren't built for the App yet (Base Datos Global /
// Transacciones Inteligentes de Negocio are desktop-only for now) — so
// unlike Administración del Negocio's leaves, these show "Próximamente"
// instead of navigating to Sistema Web's page.
['home-database-company-item', 'home-business-intelligence-item'].forEach((id) => {
    document.getElementById(id).addEventListener('click', () => {
        closeHamburgerMenu();
        showToast(t('home.comingSoon'));
    });
});

// "Administración del Negocio" / "Configuración de Botones" / "Base de
// Datos" / "Negocio Inteligente" are gated by the same hasSettingsSubPermission
// check Dashboard.js's top-bar Settings dropdown uses (mirrors
// syncSettingsSubmenuVisibility) — hidden until effectiveGrants loads (see
// syncSettingsMenuVisibility, called once initDeptAreaCc() resolves), same
// "unrestricted client admin sees everything" bypass as every other
// permission check on this page.
function hasSettingsSubPermission(submenuId) {
    if (isUnrestrictedClientAdmin()) return true;
    if (effectiveGrants.some((g) => g.sectionId === 'main' && g.itemId === 'btn-configuracion' && !g.submenuId)) return true;
    return effectiveGrants.some((g) => g.submenuId === submenuId || (g.submenuId && g.submenuId.startsWith(`${submenuId}/`)));
}

// Mirrors Dashboard.js's own hasMainButtonPermission/hasSettingsAccess/
// TOP_BAR_BUTTONS exactly — this page never had them at all, so its
// hamburger menu (Mensajes/Chatbot/Notificaciones/Marcadores/Configuración/
// Datos de Usuario/Datos de Usuario del Negocio) and bottom tab bar's
// Inicio/Panel/Tablero (the 3 tabs HOME_TAB_CATEGORY_IDS never covered,
// unlike Catálogos/Operaciones/etc.) always showed regardless of what was
// actually granted. 'home'/'panel'/'dashboard' aren't in MODULE_CATALOG, so
// they're grant-only, no contract check.
function hasMainButtonPermission(itemId) {
    if (isUnrestrictedClientAdmin()) return true;
    return effectiveGrants.some((g) => g.sectionId === 'main' && g.itemId === itemId);
}
const SETTINGS_SUBITEM_IDS = ['btn-idioma', 'btn-estilo', 'btn-tamano-sistema', 'btn-admin-negocio', 'btn-config-botones', 'btn-base-datos', 'btn-negocio-inteligente', 'btn-otros'];
function hasSettingsAccess() {
    if (isUnrestrictedClientAdmin()) return true;
    return effectiveGrants.some((g) => {
        if (g.sectionId !== 'main' || g.itemId !== 'btn-configuracion') return false;
        if (!g.submenuId) return true;
        return SETTINGS_SUBITEM_IDS.some((id) => g.submenuId === id || g.submenuId.startsWith(`${id}/`));
    });
}
const TOP_BAR_MENU_ITEMS = [
    { moduleKey: 'btn-mensajes', elementId: 'home-menu-messages', check: () => hasMainButtonPermission('btn-mensajes') },
    { moduleKey: 'btn-chatbot', elementId: 'home-menu-chatbot', check: () => hasMainButtonPermission('btn-chatbot') },
    { moduleKey: 'btn-notificaciones', elementId: 'home-menu-notifications', check: () => hasMainButtonPermission('btn-notificaciones') },
    { moduleKey: 'btn-marcadores', elementId: 'home-menu-bookmarks', check: () => hasMainButtonPermission('btn-marcadores') },
    { moduleKey: 'btn-configuracion', elementId: 'home-menu-settings', check: hasSettingsAccess },
    { moduleKey: 'btn-datos-usuario', elementId: 'home-menu-user-info', check: () => hasMainButtonPermission('btn-datos-usuario') },
    { moduleKey: 'btn-datos-usuario-negocio', elementId: 'home-menu-business-profile', check: () => hasMainButtonPermission('btn-datos-usuario-negocio') },
];
function syncTopBarMenuVisibility() {
    TOP_BAR_MENU_ITEMS.forEach(({ moduleKey, elementId, check }) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.hidden = !(contractedModuleKeys.includes(moduleKey) && check());
    });
}

function getAdminBusinessItem() {
    const mainSection = menuData?.sections?.find((s) => s.id === 'main');
    return mainSection?.items?.find((i) => i.id === 'admin-business') || null;
}

function syncSettingsMenuVisibility() {
    const languageBtn = document.getElementById('home-menu-language');
    const styleBtn = document.getElementById('home-menu-style');
    const othersBtn = document.getElementById('home-menu-others');
    // Tamaño del Sistema isn't nested inside home-settings-submenu at all --
    // same as Dashboard.js's own #ui-scale-menu, it's its own separate
    // hamburger row, sibling to "Configuración" itself, so it never went
    // through this function and showed for every user regardless of grant.
    const uiScaleBtn = document.getElementById('home-menu-ui-scale');
    if (languageBtn) languageBtn.hidden = !hasSettingsSubPermission('btn-idioma');
    if (styleBtn) styleBtn.hidden = !hasSettingsSubPermission('btn-estilo');
    if (othersBtn) othersBtn.hidden = !hasSettingsSubPermission('btn-otros');
    if (uiScaleBtn) uiScaleBtn.hidden = !hasSettingsSubPermission('btn-tamano-sistema');
    const adminBusinessBtn = document.getElementById('home-menu-admin-business');
    const buttonConfigBtn = document.getElementById('home-menu-button-config');
    const databaseBtn = document.getElementById('home-menu-database');
    const biBtn = document.getElementById('home-menu-business-intelligence');
    const navigableAdminItems = (getAdminBusinessItem()?.submenu || []).filter((i) => !i.permissionOnly);
    if (adminBusinessBtn) adminBusinessBtn.hidden = !hasSettingsSubPermission('btn-admin-negocio') || !navigableAdminItems.length;
    if (buttonConfigBtn) buttonConfigBtn.hidden = !hasSettingsSubPermission('btn-config-botones');
    if (databaseBtn) {
        databaseBtn.hidden = !hasSettingsSubPermission('btn-base-datos');
        if (databaseBtn.hidden) {
            databaseBtn.setAttribute('aria-expanded', 'false');
            document.getElementById('home-database-submenu').hidden = true;
        }
    }
    if (biBtn) {
        biBtn.hidden = !hasSettingsSubPermission('btn-negocio-inteligente');
        if (biBtn.hidden) {
            biBtn.setAttribute('aria-expanded', 'false');
            document.getElementById('home-business-intelligence-submenu').hidden = true;
        }
    }
}

// "Configuración" expands into its own sub-list (same 7 items Sistema Web's
// settings-dropdown has) instead of being one more flat action — Language
// is the one entry actually wired up (reuses the same toggleLanguage idea
// as the Acceder splash's own language button); the rest stay honest stubs.
const settingsToggle = document.getElementById('home-menu-settings');
const settingsSubmenu = document.getElementById('home-settings-submenu');
settingsToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const willOpen = settingsSubmenu.hidden;
    settingsSubmenu.hidden = !willOpen;
    settingsToggle.setAttribute('aria-expanded', String(willOpen));
});
document.getElementById('home-menu-language').addEventListener('click', async () => {
    const next = (localStorage.getItem('lang') === 'en') ? 'es' : 'en';
    localStorage.setItem('lang', next);
    await loadLanguage();
    updateDatabaseCompanyLabel();
});
document.getElementById('home-menu-logout').addEventListener('click', async () => {
    closeHamburgerMenu();
    try {
        await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
    } finally {
        // Clears the native access-screen's "trust an offline session"
        // marker (see access-screen.js) -- an explicit logout must not
        // leave that flag around to let the lock screen wave someone back
        // in the next time the app opens with no signal.
        localStorage.removeItem('sgnHadSession');
        window.location.replace('Login.html');
    }
});

// --- "Tamaño del sistema" bottom sheet -----------------------------------
// Same 8 levels/70-140%/PUT /api/me/ui-scale as Dashboard.js's own "System
// size" dropdown (per-account, so a change here also applies next time this
// same user opens Sistema Web) — only the presentation differs: a mobile
// bottom sheet with a live-scaling preview instead of a desktop dropdown.
const UI_SCALE_LEVELS = [70, 80, 90, 100, 110, 120, 130, 140];
const UI_SCALE_DEFAULT_LEVEL = 4;
let currentUiScaleLevel = UI_SCALE_DEFAULT_LEVEL;

const uiScaleOverlay = document.getElementById('home-ui-scale-overlay');
const uiScaleLabelEl = document.getElementById('home-ui-scale-label');
const uiScalePercentEl = document.getElementById('home-ui-scale-percent');
const uiScalePreviewEl = document.getElementById('home-ui-scale-preview-text');
const uiScaleDotsEl = document.getElementById('home-ui-scale-dots');
const uiScaleDecreaseBtn = document.getElementById('home-ui-scale-decrease');
const uiScaleIncreaseBtn = document.getElementById('home-ui-scale-increase');

function uiScaleLabelFor(level) {
    return level === UI_SCALE_DEFAULT_LEVEL ? t('main.uiScaleIdeal') : `${UI_SCALE_LEVELS[level - 1]}%`;
}

function renderUiScaleDots(level) {
    uiScaleDotsEl.innerHTML = '';
    UI_SCALE_LEVELS.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = `home-ui-scale-dot${i + 1 === level ? ' active' : ''}`;
        uiScaleDotsEl.appendChild(dot);
    });
}

// Base preview size (1.4rem, matches .home-ui-scale-preview-text's own
// CSS) scaled by the SAME percent :root's own font-size is about to get —
// gives the "Aa" sample a live, immediate sense of the change even though
// the sheet itself sits on the already-rescaled root and wouldn't otherwise
// look any different on its own.
function applyUiScaleLevel(level) {
    currentUiScaleLevel = level;
    document.documentElement.style.fontSize = `${UI_SCALE_LEVELS[level - 1]}%`;
    uiScaleLabelEl.textContent = uiScaleLabelFor(level);
    uiScalePercentEl.textContent = `${UI_SCALE_LEVELS[level - 1]}%`;
    uiScalePreviewEl.style.fontSize = `${1.4 * (UI_SCALE_LEVELS[level - 1] / 100)}rem`;
    uiScaleDecreaseBtn.disabled = level <= 1;
    uiScaleIncreaseBtn.disabled = level >= UI_SCALE_LEVELS.length;
    renderUiScaleDots(level);
}

async function fetchUiScaleLevel() {
    try {
        const res = await fetch(apiUrl('/api/me/ui-scale'), { credentials: 'include' });
        if (!res.ok) return UI_SCALE_DEFAULT_LEVEL;
        const { scale } = await res.json();
        return Number.isInteger(scale) && scale >= 1 && scale <= UI_SCALE_LEVELS.length ? scale : UI_SCALE_DEFAULT_LEVEL;
    } catch {
        return UI_SCALE_DEFAULT_LEVEL;
    }
}

async function saveUiScaleLevel(level) {
    applyUiScaleLevel(level);
    try {
        await fetch(apiUrl('/api/me/ui-scale'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ scale: level }),
        });
    } catch {
        // Already applied locally — a failed save just means it won't
        // stick next visit, not worth interrupting this one with an error.
    }
}

function openUiScaleSheet() {
    closeHamburgerMenu();
    uiScaleOverlay.hidden = false;
}
function closeUiScaleSheet() {
    uiScaleOverlay.hidden = true;
}
document.getElementById('home-menu-ui-scale').addEventListener('click', openUiScaleSheet);
uiScaleOverlay.addEventListener('click', (event) => { if (event.target === uiScaleOverlay) closeUiScaleSheet(); });
uiScaleDecreaseBtn.addEventListener('click', () => { if (currentUiScaleLevel > 1) saveUiScaleLevel(currentUiScaleLevel - 1); });
uiScaleIncreaseBtn.addEventListener('click', () => { if (currentUiScaleLevel < UI_SCALE_LEVELS.length) saveUiScaleLevel(currentUiScaleLevel + 1); });

// --- "Estilo" bottom sheet ------------------------------------------------
// Same 4 options and 'style' localStorage key as Dashboard.js's own desktop
// switcher — picking one here is visible next time this same user opens
// Sistema Web too, and vice versa. All 4 are real themes (see the --home-*
// token blocks at the top of AppInicio.css); Institucional additionally
// gets its colors overwritten at runtime from this client's own branding
// (see applyInstitutionalTheme below), same source Dashboard.js's desktop
// switcher already uses for its own Institutional theme.
const STYLE_OPTIONS = [
    { id: 'light', labelKey: 'main.styleLight', swatch: '#ffffff' },
    { id: 'dark', labelKey: 'main.styleDark', swatch: '#0b0d14' },
    { id: 'institutional', labelKey: 'main.styleInstitutional', swatch: 'linear-gradient(135deg,#1c3a5e,#0e1e33)' },
    { id: 'futuristic', labelKey: 'main.styleFuturistic', swatch: 'linear-gradient(135deg,#6C7CF0,#3A4BC9)' },
];
const styleOverlay = document.getElementById('home-style-overlay');
const styleListEl = document.getElementById('home-style-list');
let clientColorPalette = null;
let clientPrimaryColor = null;

const INSTITUTIONAL_THEME_PROPS = [
    '--home-bg', '--home-bg-grad-1', '--home-bg-grad-2', '--home-tabbar-bg',
    '--home-surface', '--home-surface-2', '--home-neutral-soft',
    '--home-border', '--home-divider',
    '--home-text-primary', '--home-text-secondary', '--home-text-tertiary', '--home-text-muted',
    '--home-accent', '--home-accent-strong-1', '--home-accent-strong-2', '--home-on-accent',
    '--home-header-grad-1', '--home-header-grad-2', '--home-on-header',
];

function applyInstitutionalTheme() {
    const palette = clientColorPalette
        || (clientPrimaryColor && window.ColorPalette ? window.ColorPalette.suggestPalette(clientPrimaryColor) : null);
    if (!palette) return;
    // Set on body (not documentElement) — body.institutional-mode's own CSS
    // rule redefines these same custom properties as a static fallback, and
    // a class-selector rule on body always wins over an inline value
    // inherited from an ancestor (html); setting the inline override on
    // body itself is what makes it take precedence instead.
    const root = document.body.style;
    root.setProperty('--home-bg', palette.bg || '#0e1e33');
    root.setProperty('--home-bg-grad-1', palette.bg || '#0e1e33');
    root.setProperty('--home-bg-grad-2', palette.bg || '#0e1e33');
    root.setProperty('--home-tabbar-bg', palette.bg || '#0e1e33');
    root.setProperty('--home-surface', palette.surface || '#16304d');
    root.setProperty('--home-surface-2', palette.surface || '#16304d');
    root.setProperty('--home-neutral-soft', palette.surface || '#16304d');
    root.setProperty('--home-border', palette.border || '#2a4d70');
    root.setProperty('--home-divider', palette.border || '#2a4d70');
    root.setProperty('--home-text-primary', palette.textPrimary || '#ffffff');
    root.setProperty('--home-text-secondary', palette.textSecondary || '#c9d9e8');
    root.setProperty('--home-text-tertiary', palette.textSecondary || '#c9d9e8');
    root.setProperty('--home-text-muted', palette.textSecondary || '#c9d9e8');
    root.setProperty('--home-accent', palette.accent || '#7fd1ff');
    root.setProperty('--home-accent-strong-1', palette.accent || '#2f6fae');
    root.setProperty('--home-accent-strong-2', palette.accent || '#2f6fae');
    root.setProperty('--home-on-accent', palette.accentText || '#ffffff');
    root.setProperty('--home-header-grad-1', palette.tooltipBg || '#1c3a5e');
    root.setProperty('--home-header-grad-2', palette.tooltipBg || '#1c3a5e');
    root.setProperty('--home-on-header', palette.tooltipText || '#ffffff');
}

function clearInstitutionalTheme() {
    const root = document.body.style;
    INSTITUTIONAL_THEME_PROPS.forEach((prop) => root.removeProperty(prop));
}

function getStoredStyle() {
    const stored = localStorage.getItem('style');
    return STYLE_OPTIONS.some((s) => s.id === stored) ? stored : 'light';
}

function applyStyle(style) {
    document.body.classList.remove('institutional-mode', 'dark-mode', 'futuristic-mode');
    clearInstitutionalTheme();
    if (style === 'institutional') {
        document.body.classList.add('institutional-mode');
        applyInstitutionalTheme();
    } else if (style === 'dark') document.body.classList.add('dark-mode');
    else if (style === 'futuristic') document.body.classList.add('futuristic-mode');
    renderStyleList(style);
}

function renderStyleList(activeStyle) {
    styleListEl.innerHTML = '';
    STYLE_OPTIONS.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `home-style-option${opt.id === activeStyle ? ' active' : ''}`;
        btn.innerHTML = `
            <span class="home-style-swatch" style="background:${opt.swatch}"></span>
            <span>${t(opt.labelKey)}</span>
            ${opt.id === activeStyle ? '<i class="bx bx-check home-style-check" aria-hidden="true"></i>' : ''}
        `;
        btn.addEventListener('click', () => {
            localStorage.setItem('style', opt.id);
            applyStyle(opt.id);
        });
        styleListEl.appendChild(btn);
    });
}

document.getElementById('home-menu-style').addEventListener('click', () => {
    closeHamburgerMenu();
    renderStyleList(getStoredStyle());
    styleOverlay.hidden = false;
});
styleOverlay.addEventListener('click', (event) => { if (event.target === styleOverlay) styleOverlay.hidden = true; });

// --- "Administración del Negocio" (full-screen nested list) --------------
// Same recursive shape as Dashboard.js's buildBusinessAdminSubmenuList: a
// PURE folder (no href of its own, e.g. "Servicio Contratado") becomes its
// own collapsed-by-default toggle; a leaf (real href) is always a plain
// link, straight to that existing desktop admin page.
function buildAdminBusinessList(items) {
    const wrap = document.createElement('div');
    (items || []).filter((i) => !i.permissionOnly).forEach((item) => {
        const hasRealHref = item.href && item.href !== '#';
        const navigableChildren = (item.submenu || []).filter((c) => !c.permissionOnly);
        if (!hasRealHref && navigableChildren.length) {
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'home-admin-list-toggle';
            toggle.innerHTML = `${item.icon ? `<i class="bx ${item.icon}" aria-hidden="true"></i>` : ''}<span>${t(item.labelKey, item.labelParams || {})}</span><i class="bx bx-chevron-down" aria-hidden="true"></i>`;
            const nested = buildAdminBusinessList(navigableChildren);
            nested.className = 'home-admin-list-nested';
            nested.hidden = true;
            nested.style.paddingLeft = '1rem';
            toggle.addEventListener('click', () => {
                nested.hidden = !nested.hidden;
                toggle.classList.toggle('open', !nested.hidden);
            });
            wrap.appendChild(toggle);
            wrap.appendChild(nested);
        } else {
            const a = document.createElement('a');
            a.className = 'home-admin-list-link';
            a.href = item.href || '#';
            a.innerHTML = `${item.icon ? `<i class="bx ${item.icon}" aria-hidden="true"></i>` : ''}<span>${t(item.labelKey, item.labelParams || {})}</span>`;
            wrap.appendChild(a);
        }
    });
    return wrap;
}

const adminBusinessScreen = document.getElementById('home-admin-business-screen');
document.getElementById('home-admin-business-back').addEventListener('click', () => { adminBusinessScreen.hidden = true; });
document.getElementById('home-menu-admin-business').addEventListener('click', () => {
    closeHamburgerMenu();
    const listEl = document.getElementById('home-admin-business-list');
    const emptyEl = document.getElementById('home-admin-business-empty');
    const navigable = (getAdminBusinessItem()?.submenu || []).filter((i) => !i.permissionOnly);
    listEl.innerHTML = '';
    if (navigable.length) {
        emptyEl.hidden = true;
        listEl.appendChild(buildAdminBusinessList(navigable));
    } else {
        emptyEl.hidden = false;
    }
    adminBusinessScreen.hidden = false;
});

// --- "Configuración de Botones" (bottom sheet + a shared 2nd-level picker
// sheet) — mirrors Sistema Web's own submenu: Exit Button mode (ask before
// exiting vs. exit directly, localStorage 'logoutMode' only, same key
// Dashboard.js reads) plus Departamento/Área/Centro de Costos DEFAULTS
// (persisted server-side via PUT /api/me/defaults so they follow this user
// to their next login, on top of applying immediately here). ---------------
function getLogoutMode() {
    return localStorage.getItem('logoutMode') === 'direct' ? 'direct' : 'confirm';
}

async function saveDefaults(partial) {
    try {
        await fetch(apiUrl('/api/me/defaults'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(partial),
        });
    } catch {
        // Best-effort — the pick already applied locally either way.
    }
}

function updateConfigRowValues() {
    document.getElementById('home-config-exit-value').textContent =
        getLogoutMode() === 'direct' ? t('main.logoutModeDirect') : t('main.logoutModeConfirm');
    const dept = availableDepartments.find((d) => d.key === selectedDepartment);
    document.getElementById('home-config-dept-value').textContent = dept ? t(dept.labelKey) : t('main.notSet');
    const area = availableAreasForDepartment(selectedDepartment).find((a) => a.key === selectedArea);
    document.getElementById('home-config-area-value').textContent = area ? t(area.labelKey, area.labelParams || {}) : t('main.notSet');
    if (!sidebarCostCenters.length) {
        document.getElementById('home-config-cc-value').textContent = t('main.notSet');
    } else if (selectedCostCenterIds === 'all' || sidebarCostCenters.every((cc) => isCostCenterSelected(cc.id))) {
        document.getElementById('home-config-cc-value').textContent = t('sidebar.costCentersAll');
    } else {
        document.getElementById('home-config-cc-value').textContent = String(
            sidebarCostCenters.filter((cc) => isCostCenterSelected(cc.id)).length
        );
    }
}

const buttonConfigOverlay = document.getElementById('home-button-config-overlay');
document.getElementById('home-menu-button-config').addEventListener('click', () => {
    closeHamburgerMenu();
    updateConfigRowValues();
    buttonConfigOverlay.hidden = false;
});
buttonConfigOverlay.addEventListener('click', (event) => { if (event.target === buttonConfigOverlay) buttonConfigOverlay.hidden = true; });

const configPickerOverlay = document.getElementById('home-config-picker-overlay');
const configPickerTitle = document.getElementById('home-config-picker-title');
const configPickerHint = document.getElementById('home-config-picker-hint');
const configPickerList = document.getElementById('home-config-picker-list');
const configPickerCcActions = document.getElementById('home-config-picker-cc-actions');
const configPickerCcSaveBtn = document.getElementById('home-config-picker-cc-save');

function buildConfigPickerOption(labelText, iconClass, isActive, onSelect) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `home-style-option${isActive ? ' active' : ''}`;
    btn.innerHTML = `<i class="bx ${iconClass}" aria-hidden="true"></i><span>${labelText}</span>${isActive ? '<i class="bx bx-check home-style-check" aria-hidden="true"></i>' : ''}`;
    btn.addEventListener('click', onSelect);
    return btn;
}

function openExitModePicker() {
    configPickerTitle.textContent = t('main.exitMenu');
    configPickerHint.textContent = '';
    configPickerCcActions.hidden = true;
    configPickerList.innerHTML = '';
    const current = getLogoutMode();
    [
        { id: 'confirm', labelKey: 'main.logoutModeConfirm', icon: 'bx-message-alt-question' },
        { id: 'direct', labelKey: 'main.logoutModeDirect', icon: 'bx-log-out' },
    ].forEach((opt) => {
        configPickerList.appendChild(buildConfigPickerOption(t(opt.labelKey), opt.icon, opt.id === current, () => {
            localStorage.setItem('logoutMode', opt.id);
            updateConfigRowValues();
            configPickerOverlay.hidden = true;
        }));
    });
}

function openDepartmentDefaultPicker() {
    configPickerTitle.textContent = t('sidebar.department');
    configPickerHint.textContent = t('main.defaultPickerDeptHint');
    configPickerCcActions.hidden = true;
    configPickerList.innerHTML = '';
    availableDepartments.forEach((dept) => {
        configPickerList.appendChild(buildConfigPickerOption(t(dept.labelKey), dept.icon, dept.key === selectedDepartment, () => {
            selectedDepartment = dept.key;
            localStorage.setItem('department', dept.key);
            selectedArea = null;
            localStorage.setItem('area', '');
            renderDeptAreaDropdown();
            updateDeptAreaLabel();
            updateTabBarVisibility();
            updateConfigRowValues();
            saveDefaults({ department: dept.key, area: null });
            configPickerOverlay.hidden = true;
        }));
    });
}

function openAreaDefaultPicker() {
    configPickerTitle.textContent = t('sidebar.area');
    configPickerCcActions.hidden = true;
    configPickerList.innerHTML = '';
    const areas = availableAreasForDepartment(selectedDepartment);
    if (!areas.length) {
        configPickerHint.textContent = t('main.defaultPickerAreaNoDept');
        return;
    }
    configPickerHint.textContent = t('main.defaultPickerAreaHint');
    areas.forEach((area) => {
        configPickerList.appendChild(buildConfigPickerOption(t(area.labelKey, area.labelParams || {}), area.icon, area.key === selectedArea, () => {
            selectedArea = area.key;
            localStorage.setItem('area', area.key);
            renderDeptAreaDropdown();
            updateDeptAreaLabel();
            updateTabBarVisibility();
            updateConfigRowValues();
            saveDefaults({ area: area.key });
            configPickerOverlay.hidden = true;
        }));
    });
}

function openCostCenterDefaultPicker() {
    configPickerTitle.textContent = t('sidebar.costCenters');
    configPickerHint.textContent = t('main.defaultPickerCcHint');
    configPickerList.innerHTML = '';
    if (!sidebarCostCenters.length) {
        configPickerCcActions.hidden = true;
        return;
    }
    configPickerCcActions.hidden = false;
    const allLabel = document.createElement('label');
    allLabel.className = 'home-style-option';
    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.checked = sidebarCostCenters.every((cc) => isCostCenterSelected(cc.id));
    allCheckbox.addEventListener('change', () => {
        configPickerList.querySelectorAll('input[type="checkbox"]:not(:first-child)').forEach((cb) => { cb.checked = allCheckbox.checked; });
    });
    const allSpan = document.createElement('span');
    allSpan.textContent = t('sidebar.costCentersAll');
    allLabel.append(allCheckbox, allSpan);
    configPickerList.appendChild(allLabel);
    sidebarCostCenters.forEach((cc) => {
        const label = document.createElement('label');
        label.className = 'home-style-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.ccId = cc.id;
        checkbox.checked = isCostCenterSelected(cc.id);
        checkbox.addEventListener('change', () => {
            allCheckbox.checked = Array.from(configPickerList.querySelectorAll('input[data-cc-id]')).every((cb) => cb.checked);
        });
        const span = document.createElement('span');
        span.textContent = `${cc.code} - ${cc.name}`;
        label.append(checkbox, span);
        configPickerList.appendChild(label);
    });
}

configPickerCcSaveBtn.addEventListener('click', () => {
    const boxes = Array.from(configPickerList.querySelectorAll('input[data-cc-id]'));
    const checkedIds = boxes.filter((cb) => cb.checked).map((cb) => Number(cb.dataset.ccId));
    selectedCostCenterIds = checkedIds.length === sidebarCostCenters.length ? 'all' : new Set(checkedIds);
    persistCostCenterSelection();
    renderCcDropdown();
    updateCcLabel();
    updateConfigRowValues();
    saveDefaults({ costCenters: selectedCostCenterIds === 'all' ? 'all' : checkedIds });
    configPickerOverlay.hidden = true;
});

document.getElementById('home-config-exit-btn').addEventListener('click', () => { openExitModePicker(); configPickerOverlay.hidden = false; });
document.getElementById('home-config-dept-btn').addEventListener('click', () => { openDepartmentDefaultPicker(); configPickerOverlay.hidden = false; });
document.getElementById('home-config-area-btn').addEventListener('click', () => { openAreaDefaultPicker(); configPickerOverlay.hidden = false; });
document.getElementById('home-config-cc-btn').addEventListener('click', () => { openCostCenterDefaultPicker(); configPickerOverlay.hidden = false; });
configPickerOverlay.addEventListener('click', (event) => { if (event.target === configPickerOverlay) configPickerOverlay.hidden = true; });

// --- Datos de Usuario / Datos de Usuario del Negocio (full-screen) -------
// Same /api/me/profile and /api/me/business-profile endpoints Dashboard.js's
// own desktop dropdowns already use — read fresh each time they're opened
// (no cache) since either can change from other screens/sessions.
function setSubscreenField(id, value, fallback) {
    const el = document.getElementById(id);
    if (el) el.textContent = value || fallback;
}

const userInfoScreen = document.getElementById('home-user-info-screen');
document.getElementById('home-user-info-back').addEventListener('click', () => { userInfoScreen.hidden = true; });
document.getElementById('home-menu-user-info').addEventListener('click', async () => {
    closeHamburgerMenu();
    userInfoScreen.hidden = false;
    try {
        const res = await fetch(apiUrl('/api/me/profile'), { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { profile } = await res.json();
        const notSet = t('main.notSet');
        setSubscreenField('home-user-info-nickname', profile.nickname, notSet);
        setSubscreenField('home-user-info-business-email', profile.business_email, t('main.noBusinessEmail'));
        setSubscreenField('home-user-info-name', profile.name, notSet);
        setSubscreenField('home-user-info-phone', profile.phone, notSet);
        setSubscreenField('home-user-info-address', profile.address, notSet);
        setSubscreenField('home-user-info-birth-date', profile.birth_date, notSet);
        setSubscreenField('home-user-info-id-number', profile.id_number, notSet);
    } catch {
        showToast(t('admin.loadError'));
    }
});

const businessProfileScreen = document.getElementById('home-business-profile-screen');
document.getElementById('home-business-profile-back').addEventListener('click', () => { businessProfileScreen.hidden = true; });
document.getElementById('home-menu-business-profile').addEventListener('click', async () => {
    closeHamburgerMenu();
    businessProfileScreen.hidden = false;
    try {
        const res = await fetch(apiUrl('/api/me/business-profile'), { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { profile } = await res.json();
        const notSet = t('main.notSet');
        setSubscreenField('home-business-profile-position', profile.position, notSet);
        const names = profile.profileNames || [];
        setSubscreenField('home-business-profile-role', names.length ? names.join(', ') : null, t('main.noRoleAssigned'));
        setSubscreenField('home-business-profile-business-email', profile.business_email, notSet);
        setSubscreenField('home-business-profile-phone', profile.phone, notSet);
        setSubscreenField('home-business-profile-hire-date', profile.hire_date, notSet);
        setSubscreenField('home-business-profile-reports-to', profile.reports_to, notSet);
    } catch {
        showToast(t('admin.loadError'));
    }
});

// --- Notificaciones (Alertas / Avisos / Solicitudes / Autorizar) -----------
// Same 4-tab combined payload Dashboard.js's own bell dropdown reads
// (GET /api/business/notifications) -- here it opens as a bottom sheet
// (icons-only tabs from the start, there's never room for the label on a
// phone) instead of a top-bar dropdown, appended straight to document.body
// like openSelectSheet's own sheets.
// "pendientes" (Pendiente x Subir) is App-only -- not part of the server's
// combined payload at all, it's whatever's still sitting in THIS device's
// own offline queue (see AppOfflineSync.js). Fase 1: no conflict detection
// yet, so this tab is purely informational -- "esto no ha llegado al
// servidor todavía", nothing to approve/reject here.
const NOTIFICATION_TABS = ['alertas', 'avisos', 'solicitudes', 'autorizar', 'pendientes'];
const NOTIFICATION_TAB_ICONS = {
    alertas: 'bx-error-circle',
    avisos: 'bx-info-circle',
    solicitudes: 'bx-send',
    autorizar: 'bx-check-shield',
    pendientes: 'bx-cloud-upload',
};
const PENDING_CHANGE_TABLE_LABELS = {
    'registro-combustible': 'menu.opTransVolCombustible',
    'carga-combustible': 'menu.opTransVolCargaCombustible',
    'mi-recurso-humano': 'menu.opRrhhMiRecursoHumano',
};
const notificationsBadgeEl = document.getElementById('home-menu-notifications-badge');
let notificationsData = { alertas: [], avisos: [], solicitudes: [], autorizar: [], pendientes: [] };

function formatNotificationDate(sqliteDatetime) {
    const [y, m, d] = (sqliteDatetime || '').slice(0, 10).split('-');
    return y && m && d ? `${d}-${m}-${y.slice(2)}` : '';
}

function renderNotifAlertItem(alert) {
    const el = document.createElement('div');
    el.className = 'notif-item notif-item-alert';
    el.innerHTML = `
        <div class="notif-item-meta">#${alert.seq} · ${formatNotificationDate(alert.created_at)}</div>
        <div class="notif-item-desc"><b>${alert.acting_user_label}</b>, ${t('main.notificationAttemptedChangePrefix')} <b>${t(alert.field_key)} / ${t(alert.screen_key)}</b>, ${t('main.notificationAttemptedChangeSuffix')}</div>
    `;
    return el;
}

function renderNotifRequestItem(change, showOutcome) {
    const el = document.createElement('div');
    el.className = 'notif-item';
    const tableLabel = t(PENDING_CHANGE_TABLE_LABELS[change.table_key] || change.table_key);
    const outcome = showOutcome
        ? `<div class="notif-item-meta">${t(change.status === 'approved' ? 'main.notificationApproved' : 'main.notificationRejected')} — ${change.resolved_by || '—'} · ${formatNotificationDate(change.resolved_at)}</div>`
        : '';
    el.innerHTML = `
        <div class="notif-item-meta">${tableLabel} · ${change.record_label || '—'}</div>
        <div class="notif-item-desc">${t(change.field_key)}: "${change.old_value || '—'}" → "${change.new_value || '—'}"</div>
        ${outcome}
    `;
    return el;
}

function renderNotifPendienteItem(item) {
    const el = document.createElement('div');
    el.className = 'notif-item notif-item-alert';
    el.innerHTML = `
        <div class="notif-item-meta">${formatNotificationDate(item.queuedAt)}</div>
        <div class="notif-item-desc">${item.description || '—'}</div>
        <div class="notif-item-meta">${t('home.offlineWaitingForSignal')}</div>
    `;
    return el;
}

function renderNotifTab(sheet, tabKey) {
    sheet.querySelectorAll('.notif-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabKey));
    sheet.querySelector('.notif-active-label').textContent = t(`main.notificationsTab_${tabKey}`);
    const list = sheet.querySelector('.notif-list');
    list.innerHTML = '';
    const items = notificationsData[tabKey] || [];
    if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'notif-empty';
        empty.textContent = t('main.notificationsEmpty');
        list.appendChild(empty);
    } else {
        items.forEach((item) => {
            if (tabKey === 'alertas') list.appendChild(renderNotifAlertItem(item));
            else if (tabKey === 'avisos') list.appendChild(renderNotifRequestItem(item, true));
            else if (tabKey === 'pendientes') list.appendChild(renderNotifPendienteItem(item));
            else list.appendChild(renderNotifRequestItem(item, false));
        });
    }
    if (tabKey === 'alertas' && items.some((a) => !a.seen_at)) {
        fetch(apiUrl('/api/business/notifications/alertas/mark-seen'), { method: 'POST', credentials: 'include' }).catch(() => {});
    }
    if (tabKey === 'avisos' && items.some((a) => !a.seen_at)) {
        fetch(apiUrl('/api/business/notifications/avisos/mark-seen'), { method: 'POST', credentials: 'include' }).catch(() => {});
    }
}

async function loadNotificationsBadge() {
    const pendientes = await window.SgnOfflineSync.listOfflineQueue().catch(() => []);
    try {
        const res = await fetch(apiUrl('/api/business/notifications'), { credentials: 'include' });
        if (res.ok) notificationsData = await res.json();
    } catch {
        // Server-side categories just stay at whatever they already showed.
    }
    notificationsData.pendientes = pendientes;
    const unseenAlertas = (notificationsData.alertas || []).filter((a) => !a.seen_at).length;
    const unseenAvisos = (notificationsData.avisos || []).filter((a) => !a.seen_at).length;
    const total = unseenAlertas + unseenAvisos + (notificationsData.autorizar || []).length + pendientes.length;
    notificationsBadgeEl.hidden = total <= 0;
    notificationsBadgeEl.textContent = total > 99 ? '99+' : String(total);
}
document.addEventListener('sgn:offline-queue-changed', loadNotificationsBadge);

function openNotificationsSheet() {
    const scrim = document.createElement('div');
    scrim.className = 'home-select-scrim';
    const sheet = document.createElement('div');
    sheet.className = 'notif-sheet';
    sheet.innerHTML = `
        <div class="home-select-sheet-handle"></div>
        <div class="notif-title">${t('main.notificationsTitle')}</div>
        <div class="notif-tabs">
            ${NOTIFICATION_TABS.map((tabKey) => `
                <button type="button" class="notif-tab" data-tab="${tabKey}">
                    <i class="bx ${NOTIFICATION_TAB_ICONS[tabKey]}" aria-hidden="true"></i>
                    <span class="notif-tab-count">${(notificationsData[tabKey] || []).length}</span>
                </button>
            `).join('')}
        </div>
        <div class="notif-active-label"></div>
        <div class="notif-list"></div>
    `;
    sheet.querySelectorAll('.notif-tab').forEach((btn) => {
        btn.addEventListener('click', () => renderNotifTab(sheet, btn.dataset.tab));
    });
    scrim.addEventListener('click', (event) => { if (event.target === scrim) scrim.remove(); });
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
    renderNotifTab(sheet, 'alertas');
}

document.getElementById('home-menu-notifications').addEventListener('click', async () => {
    closeHamburgerMenu();
    await loadNotificationsBadge();
    openNotificationsSheet();
});

// --- Mensajes (full-screen, honest empty state — no message backend yet) --
const messagesScreen = document.getElementById('home-messages-screen');
document.getElementById('home-messages-back').addEventListener('click', () => { messagesScreen.hidden = true; });
document.getElementById('home-menu-messages').addEventListener('click', () => {
    closeHamburgerMenu();
    messagesScreen.hidden = false;
});

// --- Chatbot (full-screen UI shell — same scope as Dashboard.js's own
// desktop panel: a greeting plus one canned reply per message, no real AI
// backend wired up yet) ----------------------------------------------------
const chatbotScreen = document.getElementById('home-chatbot-screen');
const chatbotMessagesEl = document.getElementById('home-chatbot-messages');
let chatbotGreeted = false;

function addChatMessage(text, from) {
    const bubble = document.createElement('div');
    bubble.className = `home-chatbot-message home-chatbot-message-${from}`;
    bubble.textContent = text;
    chatbotMessagesEl.appendChild(bubble);
    chatbotMessagesEl.scrollTop = chatbotMessagesEl.scrollHeight;
}

document.getElementById('home-chatbot-back').addEventListener('click', () => { chatbotScreen.hidden = true; });
document.getElementById('home-menu-chatbot').addEventListener('click', () => {
    closeHamburgerMenu();
    chatbotScreen.hidden = false;
    if (!chatbotGreeted) {
        addChatMessage(t('main.chatbotGreeting'), 'bot');
        chatbotGreeted = true;
    }
    document.getElementById('home-chatbot-input').focus();
});
document.getElementById('home-chatbot-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('home-chatbot-input');
    const text = input.value.trim();
    if (!text) return;
    addChatMessage(text, 'user');
    input.value = '';
    setTimeout(() => addChatMessage(t('main.chatbotCannedReply'), 'bot'), 400);
});

// --- Depto/Área and Centro de Costos pickers -----------------------------
// Real data now, ported from Dashboard.js's own pickers — this page has no
// shared module with Dashboard.js (separate <script>, no sidebar/topbar
// shell), so the catalogs and grant-checking helpers are duplicated here on
// purpose, same "deliberate copy" convention PermissionCostTree.js already
// established for PermissionTree.js.
const DEPARTMENTS = [
    { key: 'finance', labelKey: 'menu.finance', abbrKey: 'sidebar.deptAbbr.finance', icon: 'bx-dollar-circle' },
    { key: 'accounting', labelKey: 'menu.accounting', abbrKey: 'sidebar.deptAbbr.accounting', icon: 'bx-calculator' },
    { key: 'human-resources', labelKey: 'menu.humanResources', abbrKey: 'sidebar.deptAbbr.humanResources', icon: 'bx-id-card' },
    { key: 'marketing', labelKey: 'menu.marketing', abbrKey: 'sidebar.deptAbbr.marketing', icon: 'bx-broadcast' },
    { key: 'commercial', labelKey: 'menu.commercial', abbrKey: 'sidebar.deptAbbr.commercial', icon: 'bx-store-alt' },
    { key: 'purchasing', labelKey: 'menu.purchasing', abbrKey: 'sidebar.deptAbbr.purchasing', icon: 'bx-cart-alt' },
    { key: 'supply-chain', labelKey: 'menu.supplyChain', abbrKey: 'sidebar.deptAbbr.supplyChain', icon: 'bx-package' },
    { key: 'management-control', labelKey: 'menu.managementControl', abbrKey: 'sidebar.deptAbbr.managementControl', icon: 'bx-line-chart' },
    { key: 'general-management', labelKey: 'menu.generalManagement', abbrKey: 'sidebar.deptAbbr.generalManagement', icon: 'bx-crown' },
    { key: 'steering-committee', labelKey: 'menu.steeringCommittee', abbrKey: 'sidebar.deptAbbr.steeringCommittee', icon: 'bx-group' },
    { key: 'certifications', labelKey: 'menu.certifications', abbrKey: 'sidebar.deptAbbr.certifications', icon: 'bx-certification' },
];
const GENERIC_AREAS = [
    { key: 'area-1', labelKey: 'menu.area.generic', labelParams: { n: 1 }, icon: 'bx-folder' },
    { key: 'area-2', labelKey: 'menu.area.generic', labelParams: { n: 2 }, icon: 'bx-folder' },
    { key: 'area-3', labelKey: 'menu.area.generic', labelParams: { n: 3 }, icon: 'bx-folder' },
];
const AREAS_BY_DEPARTMENT = {
    'supply-chain': [
        { key: 'sc-area-raw-material', labelKey: 'menu.area.rawMaterial', icon: 'bx-cube' },
        { key: 'sc-area-production', labelKey: 'menu.area.production', icon: 'bx-cog' },
        { key: 'sc-area-transport-1', labelKey: 'menu.area.transportVolume', icon: 'bx-car' },
        { key: 'sc-area-distribution-center', labelKey: 'menu.area.distributionCenter', icon: 'bx-building' },
        { key: 'sc-area-transport-2', labelKey: 'menu.area.transportLastMile', icon: 'bx-car' },
        { key: 'sc-area-point-of-sale', labelKey: 'menu.area.pointOfSale', icon: 'bx-store' },
        { key: 'sc-area-delivery', labelKey: 'menu.area.delivery', icon: 'bx-send' },
        { key: 'sc-area-end-customer', labelKey: 'menu.area.endCustomer', icon: 'bx-user' },
        { key: 'sc-area-customer-complaints', labelKey: 'menu.area.customerComplaints', icon: 'bx-error-circle' },
    ],
    finance: GENERIC_AREAS,
    accounting: GENERIC_AREAS,
    'human-resources': [
        { key: 'hr-area-recruitment', labelKey: 'menu.area.recruitment', icon: 'bx-user-plus' },
        { key: 'hr-area-personnel-admin', labelKey: 'menu.area.personnelAdmin', icon: 'bx-id-card' },
        { key: 'hr-area-training-development', labelKey: 'menu.area.trainingDevelopment', icon: 'bx-book-open' },
        { key: 'hr-area-compensation-benefits', labelKey: 'menu.area.compensationBenefits', icon: 'bx-money' },
        { key: 'hr-area-organizational-development', labelKey: 'menu.area.organizationalDevelopment', icon: 'bx-sitemap' },
        { key: 'hr-area-occupational-health-safety', labelKey: 'menu.area.occupationalHealthSafety', icon: 'bx-plus-medical' },
        { key: 'hr-area-hris', labelKey: 'menu.area.hris', icon: 'bx-server' },
        { key: 'hr-area-hr-analytics', labelKey: 'menu.area.hrAnalytics', icon: 'bx-line-chart' },
    ],
    marketing: GENERIC_AREAS,
    commercial: GENERIC_AREAS,
    purchasing: GENERIC_AREAS,
    'management-control': GENERIC_AREAS,
    'general-management': GENERIC_AREAS,
    'steering-committee': GENERIC_AREAS,
    certifications: [
        { key: 'cert-area-iso-9001', labelKey: 'menu.area.iso9001', abbrKey: 'menu.area.iso9001Abbr', icon: 'bx-badge-check' },
    ],
};
// home-tab-* button ids -> the areaCategories entry (data/menu.json) each
// one represents — Inicio/Panel/Tablero aren't in this map on purpose,
// they're the always-shown "generalItems" trio, not área-scoped categories.
const HOME_TAB_CATEGORY_IDS = {
    'home-tab-catalogos': 'cat-catalogos',
    'home-tab-operaciones': 'cat-operaciones',
    'home-tab-administracion': 'cat-admin',
    'home-tab-gestion': 'cat-gestion',
    'home-tab-reportes': 'cat-reportes',
    'home-tab-material-apoyo': 'cat-material-apoyo',
};

let menuData = null;
let effectiveGrants = [];
let isClientAdmin = false;
let contractedModuleKeys = [];
let availableDepartments = DEPARTMENTS;
let selectedDepartment = localStorage.getItem('department') || null;
let selectedArea = localStorage.getItem('area') || null;
let sidebarCostCenters = [];

// Every piece of this screen's own data (grants, branding, departments,
// cost centers, tiles) comes from a handful of fetches that only ever run
// once, on page load -- with no offline fallback, losing signal mid-load
// left DIFFERENT parts of the screen in DIFFERENT wrong states: tiles and
// the department picker went empty (nothing to show), while the hamburger
// menu items -- hidden only by JS that never got a chance to run --
// stayed at their un-gated markup default and showed EVERYTHING instead.
// Neither is what a user who was already using the app normally, then
// lost signal, actually wants: they want what they had a moment ago.
// This is a plain read-modify-write cache of exactly the fields each load
// function already computes for itself; each one saves into it on success
// and reads back out of it when its own fetch fails to reach the network
// (a real, reachable error response is never treated as "restore the
// cache" -- only a genuine network failure is).
const APP_DATA_CACHE_KEY = 'sgnAppDataCache';
function saveAppDataCache(patch) {
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(APP_DATA_CACHE_KEY) || '{}') || {}; } catch { cache = {}; }
    Object.assign(cache, patch);
    try { localStorage.setItem(APP_DATA_CACHE_KEY, JSON.stringify(cache)); } catch { /* storage full/unavailable -- next online load just saves again */ }
}
function loadAppDataCache() {
    try { return JSON.parse(localStorage.getItem(APP_DATA_CACHE_KEY) || '{}') || {}; } catch { return {}; }
}
// From GET /api/business/app-screens — the client's assigned App template
// (Nuestras APPs' own screen catalog, sector-wide). Only used to build the
// "Accesos rápidos" tiles below; NOT what decides whether the category
// screen picker can open a given pantalla (see isPantallaAppVisible).
let grantedAppScreens = [];

// A pantalla only ever gets a real, tappable App experience once someone
// has actually gone in and turned on "Visión APP" for it — PermissionTree.js's
// own paired checkbox, saved as an ordinary grant whose submenuId happens to
// end in '#app' (see GRANT_APP_SUFFIX there and in db.js). Being reachable on
// Sistema Web is a completely separate thing: the category screen picker
// (renderCategoryScreens) must check THIS exact grant, never a plain Web
// grant and never the Nuestras APPs catalog (that only gates whether the
// checkbox itself can be turned on — once it has been, this is the signal
// that actually matters), or a screen nobody has designed for the App yet
// would silently open the desktop page instead of honestly saying
// "Próximamente". No broadening fallback on purpose (unlike hasScreenGrant):
// checking the App box at a higher level (item/section) writes this exact
// suffixed key onto every leaf underneath at save time (see
// PermissionTree.js's computeAppToggle), so an exact match is always enough
// — reusing hasScreenGrant's "whole item granted" fallback here would wrongly
// treat plain broad Web access as App-visibility too.
function hasAppVisionGrant(sectionId, itemId, submenuId) {
    if (isUnrestrictedClientAdmin()) return true;
    return effectiveGrants.some((g) => g.sectionId === sectionId && g.itemId === itemId && g.submenuId === `${submenuId}#app`);
}
function isPantallaAppVisible(pantalla, catId) {
    if (!selectedDepartment || !selectedArea) return false;
    return hasAppVisionGrant(selectedDepartment, selectedArea, `${catId}/${pantalla.id}`);
}

function getStoredCostCenterSelection() {
    const raw = localStorage.getItem('costCenterSelection');
    if (!raw || raw === 'all') return 'all';
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed);
    } catch { /* fall through to default */ }
    return 'all';
}
let selectedCostCenterIds = getStoredCostCenterSelection();
function persistCostCenterSelection() {
    localStorage.setItem(
        'costCenterSelection',
        selectedCostCenterIds === 'all' ? 'all' : JSON.stringify(Array.from(selectedCostCenterIds))
    );
}
function isCostCenterSelected(id) {
    return selectedCostCenterIds === 'all' || selectedCostCenterIds.has(id);
}

// Same 3-tier "pantalla habilitada" fallback as PermissionTree.js's own
// isGranted()/Dashboard.js's hasScreenGrant — exact leaf, or broadened to
// the whole item, or to the whole section.
function isUnrestrictedClientAdmin() {
    return isClientAdmin && effectiveGrants.length === 0;
}

// availableDepartments already narrows to what THIS user has any grant in
// (see initDeptAreaCc) -- the Área list under a picked department needs the
// exact same narrowing (an área is itemId under that department's own
// sectionId), which nothing here ever did. Same gap exists in Dashboard.js's
// own renderAreaPickerOptions (checked -- never filtered either), so this
// isn't "App fell behind Web" like the other navigation fixes, just a gap
// nobody had closed on either side yet.
function availableAreasForDepartment(deptKey) {
    const areas = (deptKey && AREAS_BY_DEPARTMENT[deptKey]) || [];
    if (isUnrestrictedClientAdmin()) return areas;
    return areas.filter((a) => effectiveGrants.some((g) => g.sectionId === deptKey && g.itemId === a.key));
}
function hasScreenGrant(sectionId, itemId, submenuId) {
    if (isUnrestrictedClientAdmin()) return true;
    return effectiveGrants.some((g) => (
        (g.sectionId === sectionId && g.itemId === itemId && g.submenuId === submenuId)
        || (g.sectionId === sectionId && g.itemId === itemId && !g.submenuId)
        || (g.sectionId === sectionId && !g.itemId && !g.submenuId)
    ));
}
function hasCostCenterPermission(ccId) {
    if (isUnrestrictedClientAdmin()) return true;
    return effectiveGrants.some((g) => g.sectionId === 'main' && g.itemId === 'cc-list' && g.submenuId === `cc-${ccId}`);
}

function closeAllPickerDropdowns() {
    deptAreaDropdown.hidden = true;
    deptAreaBtn.setAttribute('aria-expanded', 'false');
    ccDropdown.hidden = true;
    ccBtn.setAttribute('aria-expanded', 'false');
    closeHamburgerMenu();
}
document.addEventListener('click', closeAllPickerDropdowns);

const deptAreaBtn = document.getElementById('home-dept-area-btn');
const deptAreaDropdown = document.getElementById('home-dept-area-dropdown');

function updateDeptAreaLabel() {
    const dept = availableDepartments.find((d) => d.key === selectedDepartment);
    const area = availableAreasForDepartment(selectedDepartment).find((a) => a.key === selectedArea);
    const parts = [
        dept ? t(dept.abbrKey || dept.labelKey) : null,
        area ? t(area.labelKey, area.labelParams || {}) : null,
    ].filter(Boolean);
    deptAreaBtn.setAttribute('aria-label', parts.length ? parts.join(' · ') : t('home.deptAreaButton'));
}

// Nothing meaningful to choose (at most one department AND at most one
// área under it) -- hide the whole picker, same "single option = auto-pick,
// no picker shown at all" rule Dashboard.js's own dept-picker-disabled/
// cc-picker-disabled already apply on Web. Re-run every time this dropdown
// itself is rebuilt (department changed -> área count may have too).
function updateDeptAreaButtonVisibility() {
    const areaCount = availableAreasForDepartment(selectedDepartment).length;
    deptAreaBtn.hidden = availableDepartments.length <= 1 && areaCount <= 1;
}

function renderDeptAreaDropdown() {
    updateDeptAreaButtonVisibility();
    deptAreaDropdown.innerHTML = '';
    if (!availableDepartments.length) {
        const empty = document.createElement('div');
        empty.className = 'home-picker-empty';
        empty.textContent = t('home.deptAreaNone');
        deptAreaDropdown.appendChild(empty);
        return;
    }
    const deptLabel = document.createElement('div');
    deptLabel.className = 'home-picker-section-label';
    deptLabel.textContent = t('sidebar.department');
    deptAreaDropdown.appendChild(deptLabel);
    availableDepartments.forEach((dept) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `home-picker-option${dept.key === selectedDepartment ? ' active' : ''}`;
        btn.innerHTML = `<i class="bx ${dept.icon}" aria-hidden="true"></i><span>${t(dept.labelKey)}</span>`;
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            selectedDepartment = selectedDepartment === dept.key ? null : dept.key;
            localStorage.setItem('department', selectedDepartment || '');
            // A different department has a different área list, so
            // whatever área was picked before this switch no longer applies.
            selectedArea = null;
            localStorage.setItem('area', '');
            renderDeptAreaDropdown();
            updateDeptAreaLabel();
            updateTabBarVisibility();
        });
        deptAreaDropdown.appendChild(btn);
    });

    const areas = availableAreasForDepartment(selectedDepartment);
    if (!areas.length) return;
    deptAreaDropdown.appendChild(Object.assign(document.createElement('div'), { className: 'home-picker-divider' }));
    const areaLabel = document.createElement('div');
    areaLabel.className = 'home-picker-section-label';
    areaLabel.textContent = t('sidebar.area');
    deptAreaDropdown.appendChild(areaLabel);
    areas.forEach((area) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `home-picker-option${area.key === selectedArea ? ' active' : ''}`;
        btn.innerHTML = `<i class="bx ${area.icon}" aria-hidden="true"></i><span>${t(area.labelKey, area.labelParams || {})}</span>`;
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            selectedArea = selectedArea === area.key ? null : area.key;
            localStorage.setItem('area', selectedArea || '');
            renderDeptAreaDropdown();
            updateDeptAreaLabel();
            updateTabBarVisibility();
            closeAllPickerDropdowns();
        });
        deptAreaDropdown.appendChild(btn);
    });
}

deptAreaBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const willOpen = deptAreaDropdown.hidden;
    closeAllPickerDropdowns();
    if (willOpen) {
        deptAreaDropdown.hidden = false;
        deptAreaBtn.setAttribute('aria-expanded', 'true');
    }
});

const ccBtn = document.getElementById('home-cost-centers-btn');
const ccDropdown = document.getElementById('home-cc-dropdown');
const ccLabel = document.getElementById('home-cost-centers-label');

function updateCcLabel() {
    if (!sidebarCostCenters.length) { ccLabel.textContent = t('home.costCentersButton'); return; }
    const selected = sidebarCostCenters.filter((cc) => isCostCenterSelected(cc.id));
    if (selected.length === 0) ccLabel.textContent = t('sidebar.costCentersNone');
    else if (selected.length === sidebarCostCenters.length) ccLabel.textContent = t('sidebar.costCentersAllCount', { count: sidebarCostCenters.length });
    else if (selected.length === 1) ccLabel.textContent = selected[0].code;
    else ccLabel.textContent = t('sidebar.costCentersSelectedCount', { count: selected.length });
}

function renderCcDropdown() {
    // Same "nothing to choose, hide the picker" rule as Departamento/Área
    // above -- matches Dashboard.js's own cc-picker-disabled on Web. Unlike
    // Departamento/Área, Centro de Costos can have MORE THAN ONE selected at
    // once (or "Todos"), so the threshold is still just "more than one
    // available to pick from", same as everywhere else.
    ccBtn.hidden = sidebarCostCenters.length <= 1;
    ccDropdown.innerHTML = '';
    if (!sidebarCostCenters.length) {
        const empty = document.createElement('div');
        empty.className = 'home-picker-empty';
        empty.textContent = t('sidebar.costCentersNone');
        ccDropdown.appendChild(empty);
        return;
    }
    const allLabel = document.createElement('label');
    allLabel.className = 'home-picker-option';
    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.checked = sidebarCostCenters.every((cc) => isCostCenterSelected(cc.id));
    allCheckbox.addEventListener('change', () => {
        selectedCostCenterIds = allCheckbox.checked ? new Set(sidebarCostCenters.map((cc) => cc.id)) : new Set();
        persistCostCenterSelection();
        renderCcDropdown();
        updateCcLabel();
    });
    allLabel.append(allCheckbox, Object.assign(document.createElement('span'), { textContent: t('sidebar.costCentersAll') }));
    ccDropdown.appendChild(allLabel);
    ccDropdown.appendChild(Object.assign(document.createElement('div'), { className: 'home-picker-divider' }));
    sidebarCostCenters.forEach((cc) => {
        const label = document.createElement('label');
        label.className = 'home-picker-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isCostCenterSelected(cc.id);
        checkbox.addEventListener('change', () => {
            if (selectedCostCenterIds === 'all') selectedCostCenterIds = new Set(sidebarCostCenters.map((c) => c.id));
            if (checkbox.checked) selectedCostCenterIds.add(cc.id);
            else selectedCostCenterIds.delete(cc.id);
            persistCostCenterSelection();
            updateCcLabel();
            allCheckbox.checked = sidebarCostCenters.every((c) => isCostCenterSelected(c.id));
        });
        label.append(checkbox, Object.assign(document.createElement('span'), { textContent: `${cc.code} - ${cc.name}` }));
        ccDropdown.appendChild(label);
    });
}

ccBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const willOpen = ccDropdown.hidden;
    closeAllPickerDropdowns();
    if (willOpen) {
        ccDropdown.hidden = false;
        ccBtn.setAttribute('aria-expanded', 'true');
    }
});

// --- Bottom category tabs, filtered to what the selected área actually
// has granted (see effectiveAreaCategories/applyScreenGrantFilter in
// Dashboard.js — same "drop a category with zero grant-covered pantallas"
// rule, just producing hidden tabs here instead of a pruned sidebar tree).
function effectiveAreaCategories() {
    const base = menuData?.areaCategories || [];
    const overrides = (menuData?.areaOverrides || {})[`${selectedDepartment}/${selectedArea}`];
    if (!overrides) return base;
    return base.map((cat) => (overrides[cat.id] ? { ...cat, submenu: overrides[cat.id] } : cat));
}
function categoryHasGrantedScreen(cat) {
    if (!selectedDepartment || !selectedArea) return false;
    return (cat.submenu || []).some((pantalla) => (
        pantalla.permissionOnly || hasScreenGrant(selectedDepartment, selectedArea, `${cat.id}/${pantalla.id}`)
    ));
}
// Same grant check as categoryHasGrantedScreen, but returning the actual
// pantallas instead of a yes/no — this is what the category tab itself
// renders once tapped (see renderCategoryScreens).
function grantedScreensForCategory(cat) {
    if (!selectedDepartment || !selectedArea) return [];
    return (cat.submenu || []).filter((pantalla) => (
        pantalla.permissionOnly || hasScreenGrant(selectedDepartment, selectedArea, `${cat.id}/${pantalla.id}`)
    ));
}
// A pantalla with href "#" has no real screen yet (same "Próximamente"
// honesty as every other stub in this app). One with a real href opens the
// App-native page when one is curated (PANTALLA_ID_TO_WEB_SCREEN_KEY ->
// WEB_SCREEN_PAGES), otherwise falls back to its own desktop page directly
// (same cookie session, same pattern as Base de Datos/Negocio Inteligente).
function resolvePantallaDestination(pantalla, catId) {
    // Reachable on Sistema Web is not the same question as "designed for
    // the App yet" — only a pantalla someone has actually turned on Visión
    // APP for gets a real destination here; everything else says
    // "Próximamente" regardless of how built-out it already is on desktop.
    if (!isPantallaAppVisible(pantalla, catId)) return null;
    const webScreenKey = PANTALLA_ID_TO_WEB_SCREEN_KEY[pantalla.id];
    const page = WEB_SCREEN_PAGES[webScreenKey];
    return page?.href || null;
}
function pantallaTileInfo(pantalla) {
    const webScreenKey = PANTALLA_ID_TO_WEB_SCREEN_KEY[pantalla.id];
    return (webScreenKey && WEB_SCREEN_PAGES[webScreenKey]) || null;
}

// --- Category screen picker (Catálogos/Operaciones/Administración/...) ---
// Tapping a bottom-tab category used to just show a "Coming soon" toast —
// this renders the real pantallas menu.json grants this user for the
// selected departamento/área instead, same tile look Accesos rápidos
// already uses (or a compact list, whichever this user last picked). The
// view-mode toggle itself only shows with the btn-vista-pantallas grant.
let categoryViewMode = localStorage.getItem('categoryViewMode') === 'list' ? 'list' : 'grid';
let activeCategoryId = null;
const quickAccessSection = document.getElementById('home-quick-access-section');
const categorySection = document.getElementById('home-category-section');
const categoryTitleEl = document.getElementById('home-category-title');
const categoryTilesEl = document.getElementById('home-category-tiles');
const categoryListEl = document.getElementById('home-category-list');
const categoryEmptyEl = document.getElementById('home-category-empty');
const categoryViewToggle = document.getElementById('home-category-view-toggle');
const categoryViewGridBtn = document.getElementById('home-category-view-grid');
const categoryViewListBtn = document.getElementById('home-category-view-list');

function onCategoryScreenTap(pantalla, catId) {
    const destination = resolvePantallaDestination(pantalla, catId);
    if (destination) window.location.href = destination;
    else showToast(t('home.screenComingSoon', { label: t(pantalla.labelKey, pantalla.labelParams || {}) }));
}

function buildCategoryTile(pantalla, catId) {
    const soon = !resolvePantallaDestination(pantalla, catId);
    const info = pantallaTileInfo(pantalla);
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `home-tile${soon ? ' soon' : ''}`;
    tile.innerHTML = `
        ${soon ? `<span class="home-tile-soon-tag">${t('home.categorySoonTag')}</span>` : ''}
        <span class="home-tile-icon"><i class="bx ${(!soon && info?.icon) || pantalla.icon || 'bx-window'}" aria-hidden="true"></i></span>
        <span>${t(pantalla.labelKey, pantalla.labelParams || {})}</span>
    `;
    tile.addEventListener('click', () => onCategoryScreenTap(pantalla, catId));
    return tile;
}
function buildCategoryListRow(pantalla, catId) {
    const soon = !resolvePantallaDestination(pantalla, catId);
    const info = pantallaTileInfo(pantalla);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `home-category-list-row${soon ? ' soon' : ''}`;
    row.innerHTML = `
        <span class="home-category-list-icon"><i class="bx ${(!soon && info?.icon) || pantalla.icon || 'bx-window'}" aria-hidden="true"></i></span>
        <span class="home-category-list-label">${t(pantalla.labelKey, pantalla.labelParams || {})}</span>
        ${soon ? `<span class="home-category-list-tag">${t('home.categorySoonTag')}</span>` : `<span class="home-category-list-chevron"><i class="bx bx-chevron-right" aria-hidden="true"></i></span>`}
    `;
    row.addEventListener('click', () => onCategoryScreenTap(pantalla, catId));
    return row;
}

function setCategoryViewMode(mode) {
    categoryViewMode = mode;
    localStorage.setItem('categoryViewMode', mode);
    categoryViewGridBtn.classList.toggle('active', mode === 'grid');
    categoryViewListBtn.classList.toggle('active', mode === 'list');
    categoryTilesEl.hidden = mode !== 'grid';
    categoryListEl.hidden = mode !== 'list';
}
categoryViewGridBtn.addEventListener('click', () => setCategoryViewMode('grid'));
categoryViewListBtn.addEventListener('click', () => setCategoryViewMode('list'));

function renderCategoryScreens(catId) {
    activeCategoryId = catId;
    const categories = effectiveAreaCategories();
    const cat = categories.find((c) => c.id === catId);
    const screens = cat ? grantedScreensForCategory(cat) : [];
    categoryTitleEl.textContent = cat ? t(cat.labelKey, cat.labelParams || {}) : '';
    categoryViewToggle.hidden = !hasSettingsSubPermission('btn-vista-pantallas');
    categoryTilesEl.innerHTML = '';
    categoryListEl.innerHTML = '';
    if (!screens.length) {
        categoryEmptyEl.hidden = false;
        categoryTilesEl.hidden = true;
        categoryListEl.hidden = true;
        return;
    }
    categoryEmptyEl.hidden = true;
    screens.forEach((pantalla) => {
        categoryTilesEl.appendChild(buildCategoryTile(pantalla, catId));
        categoryListEl.appendChild(buildCategoryListRow(pantalla, catId));
    });
    setCategoryViewMode(categoryViewMode);
}

function showQuickAccessSection() {
    activeCategoryId = null;
    quickAccessSection.hidden = false;
    categorySection.hidden = true;
    document.getElementById('home-header-greeting').hidden = false;
}
function showCategorySection(catId) {
    quickAccessSection.hidden = true;
    categorySection.hidden = false;
    document.getElementById('home-header-greeting').hidden = true;
    renderCategoryScreens(catId);
}
// itemId null for home-tab-inicio: it's the App's own permanent landing tab
// (shows "Accesos rápidos", never a distinct Web page the way Panel/Tablero
// map to Panel.html/Inicio-en.html), and doubles as the fallback below when
// another tab gets hidden out from under the user -- hiding it too would
// risk leaving someone with no tab left to fall back to at all.
const HOME_TAB_ITEM_IDS = { 'home-tab-panel': 'panel', 'home-tab-tablero': 'dashboard' };
function updateTabBarVisibility() {
    const categories = effectiveAreaCategories();
    Object.entries(HOME_TAB_CATEGORY_IDS).forEach(([tabId, catId]) => {
        const tab = document.getElementById(tabId);
        if (!tab) return;
        const cat = categories.find((c) => c.id === catId);
        tab.hidden = !(selectedDepartment && selectedArea && cat && categoryHasGrantedScreen(cat));
    });
    Object.entries(HOME_TAB_ITEM_IDS).forEach(([tabId, itemId]) => {
        const tab = document.getElementById(tabId);
        if (!tab) return;
        tab.hidden = !hasMainButtonPermission(itemId);
    });
    // The active tab may have just been hidden by this same narrowing —
    // fall back to the first tab still visible (usually Inicio, but not
    // necessarily anymore now that it can be hidden too) rather than
    // leaving a hidden tab "active". If a category is still active and
    // still visible, its own content may have just changed underneath it
    // (a different área grants different pantallas) — refresh it in place.
    const activeTab = document.querySelector('.home-tab.active');
    if (activeTab && activeTab.hidden) {
        const firstVisible = Array.from(document.querySelectorAll('.home-tab')).find((tab) => !tab.hidden);
        if (firstVisible) firstVisible.click();
    } else if (activeCategoryId) renderCategoryScreens(activeCategoryId);
}

// Everything past the fetches: narrows departments/cost centers to what
// this account was actually granted, then renders every piece of UI that
// depends on it (the dept/área/cost-center pickers, the tab bar, the
// hamburger menu's own item-level gating, and a re-filter of the home
// tiles now that effectiveGrants is real). Pulled out of initDeptAreaCc so
// the offline path below can run the exact same logic against cached
// values instead of re-deriving a second, easily-drifting copy of it.
function applyDeptAreaCcData(rawMenuData, rawContractedModuleKeys, rawEffectiveGrants, rawCostCenters) {
    menuData = rawMenuData;
    contractedModuleKeys = rawContractedModuleKeys || [];
    effectiveGrants = rawEffectiveGrants || [];
    availableDepartments = DEPARTMENTS.filter((d) => contractedModuleKeys.includes(d.key));
    // Narrow further to departments THIS user actually has any grant in
    // (Puesto de Trabajo defaults + Permisos Adicionales) -- same fix
    // Dashboard.js's own department picker already got; this page had
    // its own separate copy of the logic that was never updated to
    // match, which is why it kept showing every contracted department
    // regardless of what was actually granted. Skipped for an
    // unrestricted client admin (isUnrestrictedClientAdmin -- zero
    // grant rows by design means "sees everything", not "sees nothing").
    if (!isUnrestrictedClientAdmin()) {
        const grantedSectionIds = new Set(effectiveGrants.map((g) => g.sectionId));
        availableDepartments = availableDepartments.filter((d) => grantedSectionIds.has(d.key));
    }
    sidebarCostCenters = (rawCostCenters || []).filter((cc) => hasCostCenterPermission(cc.id));

    // Drop a stored selection that no longer applies (department/área
    // removed from this client's contract, or this user's own grants
    // narrowed since the last visit).
    if (selectedDepartment && !availableDepartments.some((d) => d.key === selectedDepartment)) {
        selectedDepartment = null;
        selectedArea = null;
    }
    if (selectedArea && !availableAreasForDepartment(selectedDepartment).some((a) => a.key === selectedArea)) {
        selectedArea = null;
    }
    // Nothing to actually choose between — auto-pick, same as the
    // desktop pickers do.
    if (availableDepartments.length === 1 && !selectedDepartment) {
        selectedDepartment = availableDepartments[0].key;
        localStorage.setItem('department', selectedDepartment);
    }
    const areasForDept = availableAreasForDepartment(selectedDepartment);
    if (areasForDept.length === 1 && !selectedArea) {
        selectedArea = areasForDept[0].key;
        localStorage.setItem('area', selectedArea);
    }
    if (sidebarCostCenters.length === 1) {
        selectedCostCenterIds = new Set([sidebarCostCenters[0].id]);
        persistCostCenterSelection();
    } else if (selectedCostCenterIds !== 'all') {
        const validIds = new Set(sidebarCostCenters.map((cc) => cc.id));
        selectedCostCenterIds = new Set(Array.from(selectedCostCenterIds).filter((id) => validIds.has(id)));
    }

    renderDeptAreaDropdown();
    updateDeptAreaLabel();
    renderCcDropdown();
    updateCcLabel();
    updateTabBarVisibility();
    syncSettingsMenuVisibility();
    syncTopBarMenuVisibility();
    // effectiveGrants just became real (renderTiles's very first call,
    // back in init(), ran before this resolved and had nothing to
    // filter by yet) -- re-render the home tiles now that they can
    // actually be narrowed down to what this user was granted.
    renderTiles(grantedAppScreens);
}

async function initDeptAreaCc() {
    try {
        const [menuRes, modulesRes, profileRes, ccRes] = await Promise.all([
            fetch('data/menu.json'),
            fetch(apiUrl('/api/business/contracted-modules'), { credentials: 'include' }),
            fetch(apiUrl('/api/me/business-profile'), { credentials: 'include' }),
            fetch(apiUrl('/api/business/cost-centers'), { credentials: 'include' }),
        ]);
        const rawMenuData = menuRes.ok ? await menuRes.json() : null;
        const modules = modulesRes.ok ? await modulesRes.json() : { moduleKeys: [] };
        const profileData = profileRes.ok ? await profileRes.json() : {};
        const rawEffectiveGrants = profileData.profile?.effectiveGrants || [];
        const ccData = ccRes.ok ? await ccRes.json() : { costCenters: [] };
        applyDeptAreaCcData(rawMenuData, modules.moduleKeys, rawEffectiveGrants, ccData.costCenters);
        saveAppDataCache({
            deptAreaCc: { menuData: rawMenuData, contractedModuleKeys: modules.moduleKeys, effectiveGrants: rawEffectiveGrants, costCenters: ccData.costCenters },
        });
    } catch (err) {
        console.error('AppInicio: failed to load department/area/cost-center data:', err);
        // Network never reached the server -- without this, the tab bar,
        // hamburger menu, and dept/área/cost-center pickers all skipped
        // their own gating entirely (this function never got to run it),
        // which is what left the hamburger menu showing every item
        // instead of just the ones this account actually has, confirmed
        // live. Re-apply the last real grants/departments/cost centers
        // this account saw online instead of leaving everything at its
        // un-gated markup default.
        const cached = loadAppDataCache().deptAreaCc;
        if (cached) {
            applyDeptAreaCcData(cached.menuData, cached.contractedModuleKeys, cached.effectiveGrants, cached.costCenters);
        }
    }
}

// --- Collapsible header — same idea as Dashboard.js's collapsible top bar:
// reclaim vertical space on demand, nothing lost, persisted per browser.
const HEADER_COLLAPSED_KEY = 'homeHeaderCollapsed';
const headerEl = document.querySelector('.home-header');
const headerCollapseToggle = document.getElementById('home-header-collapse-toggle');
function setHeaderCollapsed(collapsed) {
    headerEl.classList.toggle('home-header-collapsed', collapsed);
    headerCollapseToggle.setAttribute('aria-expanded', String(!collapsed));
    headerCollapseToggle.setAttribute('aria-label', t(collapsed ? 'main.topBarExpand' : 'main.topBarCollapse'));
    headerCollapseToggle.querySelector('i').className = `bx ${collapsed ? 'bx-chevron-down' : 'bx-chevron-up'}`;
    localStorage.setItem(HEADER_COLLAPSED_KEY, String(collapsed));
}
headerCollapseToggle.addEventListener('click', () => setHeaderCollapsed(!headerEl.classList.contains('home-header-collapsed')));
setHeaderCollapsed(localStorage.getItem(HEADER_COLLAPSED_KEY) === 'true');

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
        const catId = HOME_TAB_CATEGORY_IDS[tab.id];
        if (tab.id === 'home-tab-inicio') showQuickAccessSection();
        else if (catId) showCategorySection(catId);
        else {
            // Panel/Tablero — no App-native screen for these yet.
            showQuickAccessSection();
            showToast(t('home.comingSoon'));
        }
    });
});

// Same "Base Datos {abbr}" convention as Dashboard.js's own
// updateDatabaseMenuLabel — re-run after loadLanguage() too (its blanket
// data-i18n pass would otherwise wipe the appended abbreviation back to the
// bare base label on every language switch).
let clientCompanyAbbreviation = null;
function updateDatabaseCompanyLabel() {
    const databaseLabel = document.getElementById('home-database-company-label');
    if (!databaseLabel) return;
    const base = t('menu.databaseCompany');
    databaseLabel.textContent = clientCompanyAbbreviation ? `${base} ${clientCompanyAbbreviation}` : base;
}

// Tapping the client logo reloads the App instead of doing nothing -- same
// "no tener que salir y volver a entrar" fix as the Web sidebar's own
// .brand click (see Dashboard.js), just against the App's own logo block.
(() => {
    const brand = document.querySelector('.home-client-brand');
    if (!brand) return;
    brand.style.cursor = 'pointer';
    brand.addEventListener('click', () => {
        sessionStorage.setItem('sgnShowUpdateToast', '1');
        window.location.reload();
    });
})();

function applyClientBranding(branding) {
    const logoImg = document.getElementById('home-client-logo');
    const logoFallback = document.getElementById('home-client-logo-fallback');
    const nameEl = document.getElementById('home-client-name');
    nameEl.textContent = branding.companyAbbreviation || branding.companyName || '';
    if (isClientAdmin) {
        const greetingEl = document.getElementById('home-user-name');
        greetingEl.textContent = branding.companyNickname || branding.companyAbbreviation || branding.companyName || greetingEl.textContent;
    }
    if (branding.logoDataUrl) {
        logoImg.src = branding.logoDataUrl;
        logoImg.hidden = false;
        logoFallback.hidden = true;
    }
    clientColorPalette = branding.colorPalette || null;
    clientPrimaryColor = branding.primaryColor || null;
    if (getStoredStyle() === 'institutional') applyInstitutionalTheme();
    clientCompanyAbbreviation = branding.companyAbbreviation || null;
    updateDatabaseCompanyLabel();
}

async function loadClientBranding() {
    try {
        const res = await fetch(apiUrl('/api/business/branding'), { credentials: 'include' });
        if (!res.ok) return;
        const { branding } = await res.json();
        applyClientBranding(branding);
        saveAppDataCache({ branding });
    } catch {
        // Network never reached the server (offline) -- show whatever
        // branding was last confirmed online instead of the blank
        // fallback icon/name the static markup starts with.
        const cached = loadAppDataCache();
        if (cached.branding) applyClientBranding(cached.branding);
    }
}

(async function init() {
    await loadLanguage();
    try {
        const [meRes, screensRes, profileRes] = await Promise.all([
            fetch(apiUrl('/api/me'), { credentials: 'include' }),
            fetch(apiUrl('/api/business/app-screens'), { credentials: 'include' }),
            fetch(apiUrl('/api/me/profile'), { credentials: 'include' }),
        ]);
        if (!meRes.ok) {
            window.location.replace('Login.html');
            return;
        }
        const { user } = await meRes.json();
        isClientAdmin = !!user?.isClientAdmin;
        // The auto-provisioned client-admin account's `name` is frozen as
        // "Admin <razón social completa>" (see activateClient in db.js) --
        // never meant to be read aloud, so it greets with the client's own
        // Apodo Empresa instead (filled in once loadClientBranding()
        // resolves, below; this is just what shows before that lands). A
        // person greets by their own Apodo (users.nickname, set in Datos de
        // Usuario), falling back to their real name until they set one.
        const profile = profileRes.ok ? (await profileRes.json()).profile : null;
        document.getElementById('home-user-name').textContent = isClientAdmin
            ? (user?.name || '')
            : (profile?.nickname?.trim() || user?.name || '');

        const screensData = screensRes.ok ? await screensRes.json() : { app: null, screens: [] };
        grantedAppScreens = screensData.screens || [];
        renderTiles(grantedAppScreens);
        saveAppDataCache({ user, profile, screensData });
        loadClientBranding();
        initDeptAreaCc();
        loadNotificationsBadge();
        applyUiScaleLevel(await fetchUiScaleLevel());
        applyStyle(getStoredStyle());
        if (sessionStorage.getItem('sgnShowUpdateToast')) {
            sessionStorage.removeItem('sgnShowUpdateToast');
            showToast(t('main.updateDone'));
        }
    } catch (err) {
        console.error('AppInicio failed to load:', err);
        // Network never reached the server at all -- confirmed live that
        // this used to just show an empty "no accesos" home screen even
        // for someone who was using the app normally moments ago. Restore
        // whatever this same account last saw online instead: same
        // greeting, same tiles, then the same downstream loaders (branding,
        // department/área/centros de costo, hamburger menu items) run
        // exactly as they would online -- each one now has its own offline
        // cache fallback (see loadClientBranding, initDeptAreaCc) so this
        // isn't a special case, just a normal load with cached inputs.
        const cached = loadAppDataCache();
        if (cached.user) {
            isClientAdmin = !!cached.user?.isClientAdmin;
            document.getElementById('home-user-name').textContent = isClientAdmin
                ? (cached.user?.name || '')
                : (cached.profile?.nickname?.trim() || cached.user?.name || '');
            grantedAppScreens = cached.screensData?.screens || [];
            renderTiles(grantedAppScreens);
            loadClientBranding();
            initDeptAreaCc();
            loadNotificationsBadge();
        } else {
            renderTiles([]);
        }
    }
})();
