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
['home-menu-notifications', 'home-menu-bookmarks', 'home-menu-others'].forEach((id) => {
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

function getAdminBusinessItem() {
    const mainSection = menuData?.sections?.find((s) => s.id === 'main');
    return mainSection?.items?.find((i) => i.id === 'admin-business') || null;
}

function syncSettingsMenuVisibility() {
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
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
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
        const res = await fetch('/api/me/ui-scale', { credentials: 'include' });
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
        await fetch('/api/me/ui-scale', {
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
        await fetch('/api/me/defaults', {
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
    const area = ((selectedDepartment && AREAS_BY_DEPARTMENT[selectedDepartment]) || []).find((a) => a.key === selectedArea);
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
    const areas = (selectedDepartment && AREAS_BY_DEPARTMENT[selectedDepartment]) || [];
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
        const res = await fetch('/api/me/profile', { credentials: 'include' });
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
        const res = await fetch('/api/me/business-profile', { credentials: 'include' });
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
    { key: 'marketing', labelKey: 'menu.marketing', abbrKey: 'sidebar.deptAbbr.marketing', icon: 'bx-megaphone' },
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
let availableDepartments = DEPARTMENTS;
let selectedDepartment = localStorage.getItem('department') || null;
let selectedArea = localStorage.getItem('area') || null;
let sidebarCostCenters = [];

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
    const area = ((selectedDepartment && AREAS_BY_DEPARTMENT[selectedDepartment]) || []).find((a) => a.key === selectedArea);
    const parts = [
        dept ? t(dept.abbrKey || dept.labelKey) : null,
        area ? t(area.labelKey, area.labelParams || {}) : null,
    ].filter(Boolean);
    deptAreaBtn.setAttribute('aria-label', parts.length ? parts.join(' · ') : t('home.deptAreaButton'));
}

function renderDeptAreaDropdown() {
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

    const areas = (selectedDepartment && AREAS_BY_DEPARTMENT[selectedDepartment]) || [];
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
function updateTabBarVisibility() {
    const categories = effectiveAreaCategories();
    Object.entries(HOME_TAB_CATEGORY_IDS).forEach(([tabId, catId]) => {
        const tab = document.getElementById(tabId);
        if (!tab) return;
        const cat = categories.find((c) => c.id === catId);
        tab.hidden = !(selectedDepartment && selectedArea && cat && categoryHasGrantedScreen(cat));
    });
    // The active tab may have just been hidden by this same narrowing —
    // fall back to Inicio rather than leaving a hidden tab "active".
    const activeTab = document.querySelector('.home-tab.active');
    if (activeTab && activeTab.hidden) document.getElementById('home-tab-inicio').click();
}

async function initDeptAreaCc() {
    try {
        const [menuRes, modulesRes, profileRes, ccRes] = await Promise.all([
            fetch('data/menu.json'),
            fetch('/api/business/contracted-modules', { credentials: 'include' }),
            fetch('/api/me/business-profile', { credentials: 'include' }),
            fetch('/api/business/cost-centers', { credentials: 'include' }),
        ]);
        menuData = menuRes.ok ? await menuRes.json() : null;
        const modules = modulesRes.ok ? await modulesRes.json() : { moduleKeys: [] };
        availableDepartments = DEPARTMENTS.filter((d) => (modules.moduleKeys || []).includes(d.key));
        const profileData = profileRes.ok ? await profileRes.json() : {};
        effectiveGrants = profileData.profile?.effectiveGrants || [];
        const ccData = ccRes.ok ? await ccRes.json() : { costCenters: [] };
        sidebarCostCenters = (ccData.costCenters || []).filter((cc) => hasCostCenterPermission(cc.id));

        // Drop a stored selection that no longer applies (department/área
        // removed from this client's contract, or this user's own grants
        // narrowed since the last visit).
        if (selectedDepartment && !availableDepartments.some((d) => d.key === selectedDepartment)) {
            selectedDepartment = null;
            selectedArea = null;
        }
        if (selectedArea && !((AREAS_BY_DEPARTMENT[selectedDepartment] || []).some((a) => a.key === selectedArea))) {
            selectedArea = null;
        }
        // Nothing to actually choose between — auto-pick, same as the
        // desktop pickers do.
        if (availableDepartments.length === 1 && !selectedDepartment) {
            selectedDepartment = availableDepartments[0].key;
            localStorage.setItem('department', selectedDepartment);
        }
        const areasForDept = (selectedDepartment && AREAS_BY_DEPARTMENT[selectedDepartment]) || [];
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
    } catch (err) {
        console.error('AppInicio: failed to load department/area/cost-center data:', err);
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
        if (tab.id !== 'home-tab-inicio') showToast(t('home.comingSoon'));
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
        clientColorPalette = branding.colorPalette || null;
        clientPrimaryColor = branding.primaryColor || null;
        if (getStoredStyle() === 'institutional') applyInstitutionalTheme();
        clientCompanyAbbreviation = branding.companyAbbreviation || null;
        updateDatabaseCompanyLabel();
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
        isClientAdmin = !!user?.isClientAdmin;

        const screensData = screensRes.ok ? await screensRes.json() : { app: null, screens: [] };
        renderTiles(screensData.screens || []);
        loadClientBranding();
        initDeptAreaCc();
        applyUiScaleLevel(await fetchUiScaleLevel());
        applyStyle(getStoredStyle());
    } catch (err) {
        console.error('AppInicio failed to load:', err);
        renderTiles([]);
    }
})();
