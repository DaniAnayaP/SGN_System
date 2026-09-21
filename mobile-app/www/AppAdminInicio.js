// ---------------------------------------------------------------------------
// Panel Admin (App) — GEIPSA staff (role 'admin') shell, reached via
// access-screen.js's post-login role branch instead of AppInicio.html. Same
// lighter i18n loader as AppRoles.js/AppNuestrasUnidades.js (no Dashboard.js
// here, just window.Dashboard.t as the one shim PermissionTree.js needs).
//
// Single page, a small number of bottom tabs swap the content area in place
// (same pattern AppInicio.html's own tabs already use) instead of separate
// pages per section. Individual admin screens are NOT their own bottom tab
// -- confirmed with the user this should mirror the client App's own
// Catálogos/Administración pattern (see AppInicio.js's
// renderCategoryScreens): one tab per CATEGORY (Servicio a Cliente,
// Configuración SaaS), which shows that category's screens as a tile grid
// when tapped, same "Próximamente" placeholder tiles the client's own
// category screens already use for anything not built yet. Only Árbol de
// Permisos Maestro ('tree') and Giros de Negocio ('sectors') have a real
// screen behind them today (the rest of the App port is future work).
// ---------------------------------------------------------------------------

const SUPPORTED_LANGS = ['en', 'es'];
const DEFAULT_LANG = 'en';
let dict = {};

function t(key, params = {}) {
    const value = key.split('.').reduce((obj, part) => obj?.[part], dict);
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}
// PermissionTree.js's two Dashboard.js dependencies -- t (see AppRoles.js
// for the same shim) and, since Árbol Maestro's "aplicar Estatus a
// anidados" button needs a yes/no answer before overwriting a whole
// subtree, confirm (see simpleConfirm below -- this App's own bottom-sheet
// equivalent of Dashboard.js's confirmDialog on Web).
window.Dashboard = { t, confirm: simpleConfirm };

// Same singleton-overlay idea as Dashboard.js's ensureConfirmModal/
// confirmDialog, just built from this App's own bottom-sheet vocabulary
// (home-sheet-overlay/home-sheet, same classes admin-confirm-overlay
// already uses below) instead of a desktop modal.
function ensureSimpleConfirmSheet() {
    let overlay = document.getElementById('simple-confirm-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'simple-confirm-overlay';
    overlay.className = 'home-sheet-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
        <div class="home-sheet" role="dialog" aria-modal="true" aria-labelledby="simple-confirm-title">
            <div class="home-sheet-handle"></div>
            <h3 class="home-sheet-title" id="simple-confirm-title"></h3>
            <div class="admin-confirm-actions">
                <button type="button" class="home-carga-new-btn" id="simple-confirm-accept"></button>
                <button type="button" class="home-carga-secondary-btn" id="simple-confirm-cancel"></button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}
function simpleConfirm(message) {
    return new Promise((resolve) => {
        const overlay = ensureSimpleConfirmSheet();
        overlay.querySelector('#simple-confirm-title').textContent = message;
        const acceptBtn = overlay.querySelector('#simple-confirm-accept');
        const cancelBtn = overlay.querySelector('#simple-confirm-cancel');
        acceptBtn.innerHTML = `<i class="bx bx-check" aria-hidden="true"></i><span>${t('admin.confirmAccept')}</span>`;
        cancelBtn.innerHTML = `<span>${t('admin.cancel')}</span>`;
        const done = (result) => {
            overlay.hidden = true;
            acceptBtn.removeEventListener('click', onAccept);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onBackdrop);
            resolve(result);
        };
        const onAccept = () => done(true);
        const onCancel = () => done(false);
        const onBackdrop = (event) => { if (event.target === overlay) done(false); };
        acceptBtn.addEventListener('click', onAccept);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onBackdrop);
        overlay.hidden = false;
    });
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

// --- Style (theme) -- light/dark/futuristic only. No "institutional" here:
// that theme derives its palette from a client's own brand color, and a
// GEIPSA admin account isn't tied to one client. -----------------------
const STYLE_OPTIONS = [
    { id: 'light', labelKey: 'main.styleLight', swatch: '#ffffff' },
    { id: 'dark', labelKey: 'main.styleDark', swatch: '#0b0d14' },
    { id: 'futuristic', labelKey: 'main.styleFuturistic', swatch: 'linear-gradient(135deg,#6C7CF0,#3A4BC9)' },
];
const styleOverlay = document.getElementById('home-style-overlay');
const styleListEl = document.getElementById('home-style-list');

function getStoredStyle() {
    const stored = localStorage.getItem('style');
    return STYLE_OPTIONS.some((s) => s.id === stored) ? stored : 'light';
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
function applyStyle(style) {
    document.body.classList.remove('dark-mode', 'futuristic-mode');
    if (style === 'dark') document.body.classList.add('dark-mode');
    else if (style === 'futuristic') document.body.classList.add('futuristic-mode');
    renderStyleList(style);
}
document.getElementById('home-menu-style').addEventListener('click', () => {
    closeHamburgerMenu();
    renderStyleList(getStoredStyle());
    styleOverlay.hidden = false;
});
styleOverlay.addEventListener('click', (event) => { if (event.target === styleOverlay) styleOverlay.hidden = true; });

// --- Hamburger menu -------------------------------------------------------
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
document.addEventListener('click', (event) => {
    if (!hamburgerMenu.hidden && !hamburgerMenu.contains(event.target) && event.target !== hamburgerBtn) closeHamburgerMenu();
});
document.getElementById('home-menu-language').addEventListener('click', async () => {
    const next = (localStorage.getItem('lang') === 'en') ? 'es' : 'en';
    localStorage.setItem('lang', next);
    closeHamburgerMenu();
    await loadLanguage();
    // loadLanguage() only re-applies [data-i18n] on STATIC markup (the top
    // bar, tab labels, hamburger menu...). The tree's own row labels,
    // Estatus dropdown text and the Guardar button are built by
    // PermissionTree.js/loadMasterTree() from the dict at render time and
    // don't update on their own -- confirmed live: toggling language left
    // the whole tree (the majority of the screen) still in the old
    // language, which read as "language switch does nothing". Re-render
    // the active tab so it picks up the new dict too. This does mean any
    // unsaved tree edits are lost on a language switch, same as a page
    // refresh would -- acceptable here since Guardar already requires a
    // deliberate confirm step before anything is ever written.
    renderSection(activeSection);
});
document.getElementById('home-menu-logout').addEventListener('click', async () => {
    closeHamburgerMenu();
    try {
        await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
    } finally {
        // Same marker access-screen.js reads to decide whether Face ID can
        // resume a session -- an explicit logout must not leave it around.
        localStorage.removeItem('sgnHadSession');
        window.location.replace('Login.html');
    }
});

// --- Search bar toggle -- visual only, same as AppInicio.js's own pattern
// there (no filtering wired up on that page either; nothing to search yet
// on this one). -----------------------------------------------------------
const searchBtn = document.getElementById('home-search-btn');
const searchBar = document.getElementById('home-search-bar');
const searchInput = document.getElementById('home-search-input');
searchBtn.addEventListener('click', () => {
    searchBar.hidden = !searchBar.hidden;
    if (!searchBar.hidden) searchInput.focus();
});

// --- Connectivity indicator -- simple online/offline. No offline queue on
// this screen: master-tree edits are rare, high-stakes, GEIPSA-only changes
// with their own confirm-before-save step, not something to queue silently
// like a field-capture screen. ---------------------------------------------
const connBtn = document.getElementById('home-conn-btn');
const connIcon = document.getElementById('home-conn-icon');
function updateConnIndicator() {
    const online = navigator.onLine;
    connBtn.dataset.state = online ? 'online' : 'offline';
    connIcon.className = `bx ${online ? 'bx-wifi' : 'bx-wifi-off'}`;
}
window.addEventListener('online', updateConnIndicator);
window.addEventListener('offline', updateConnIndicator);

// --- Breadcrumb collapse -- same toggle AppInicio.js's own breadcrumb uses.
const breadcrumbTrail = document.getElementById('home-breadcrumb-trail');
const breadcrumbToggle = document.getElementById('home-breadcrumb-toggle');
const breadcrumbChevron = document.getElementById('home-breadcrumb-toggle-chevron');
breadcrumbToggle.addEventListener('click', () => {
    const collapsed = !breadcrumbTrail.hidden;
    breadcrumbTrail.hidden = collapsed;
    breadcrumbChevron.className = collapsed ? 'bx bx-chevron-down' : 'bx bx-chevron-up';
    breadcrumbToggle.setAttribute('aria-label', t(collapsed ? 'main.breadcrumbExpand' : 'main.breadcrumbCollapse'));
});

// --- Tabs / sections -------------------------------------------------------
// One bottom tab per CATEGORY (see the file's own top comment) -- tapping
// it shows that category's real screens as a tile grid (renderCategorySection
// below), same look Inicio's own tiles already use. Icon/label pairs here
// double as both the tile's own content and (via ITEM_CATEGORY) the
// breadcrumb label shown once a specific screen is open.
const CATEGORY_ITEMS = {
    customerService: [
        { id: 'tree', icon: 'bx-sitemap', breadcrumbKey: 'menu.masterPermissionsTree' },
        { id: 'sectors', icon: 'bx-briefcase-alt-2', breadcrumbKey: 'menu.businessSectorsAbbr1' },
        { id: 'plans', icon: 'bx-package', breadcrumbKey: 'menu.plansRegistered' },
        { id: 'clients', icon: 'bx-buildings', breadcrumbKey: 'menu.clientesRegistrados' },
        { id: 'apps', icon: 'bx-grid-alt', breadcrumbKey: 'menu.ourApps' },
    ],
    saasConfig: [
        { id: 'saas-tree', icon: 'bx-shield', breadcrumbKey: 'menu.saasMasterTree' },
        { id: 'saas-costs', icon: 'bx-dollar-circle', breadcrumbKey: 'menu.moduleCosts' },
        { id: 'saas-team', icon: 'bx-id-card', breadcrumbKey: 'menu.saasTeam' },
        { id: 'saas-backups', icon: 'bx-cloud-upload', breadcrumbKey: 'menu.ourBackups' },
        { id: 'saas-material', icon: 'bx-book-open', breadcrumbKey: 'menu.ourSupportMaterial' },
    ],
};
const CATEGORY_TABS = [
    { id: 'customerService', breadcrumbKey: 'menu.customerService' },
    { id: 'saasConfig', breadcrumbKey: 'menu.saasConfig' },
];
// Reverse lookup: item id -> its category id. A screen reached by tapping a
// tile inside a category no longer has a bottom tab of its own, so this is
// what keeps the RIGHT category tab highlighted while viewing it (see
// renderSection below) instead of every tab going dark.
const ITEM_CATEGORY = {};
Object.entries(CATEGORY_ITEMS).forEach(([catId, items]) => {
    items.forEach((item) => { ITEM_CATEGORY[item.id] = catId; });
});

// Inicio's own loose shortcuts -- just Tablero and Holdings, confirmed with
// the user neither belongs in either category above and Holdings doesn't
// need its own bottom tab or category either, unlike everything else that
// used to live directly in this grid.
const HOME_SHORTCUTS = [
    { id: 'board', icon: 'bx-bar-chart-alt-2', breadcrumbKey: 'home.tabBoard' },
    { id: 'holdings', icon: 'bx-collection', breadcrumbKey: 'menu.holdingsTitle' },
];

const SECTIONS = [
    { id: 'home', breadcrumbKey: 'home.tabHome' },
    ...HOME_SHORTCUTS,
    ...CATEGORY_TABS,
    ...Object.values(CATEGORY_ITEMS).flat(),
];
let activeSection = 'home';
// Bumped every renderSection() call; loadMasterTree()'s own async chain
// checks this before each contentEl write and bails out if the user has
// since switched tabs -- otherwise a slow load (menu.json + ~150 rows) that
// finishes after the user already tapped away would clobber whatever tab
// they switched to, confirmed happening in practice on a throttled
// connection.
let renderToken = 0;
const contentEl = document.getElementById('admin-content');
const breadcrumbCurrent = document.getElementById('home-breadcrumb-current');

function updateBreadcrumb() {
    const section = SECTIONS.find((s) => s.id === activeSection);
    breadcrumbCurrent.textContent = section ? t(section.breadcrumbKey) : '';
}

function renderComingSoon() {
    contentEl.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'home-empty';
    empty.innerHTML = `<i class="bx bx-time-five" aria-hidden="true"></i><p>${t('home.comingSoon')}</p>`;
    contentEl.appendChild(empty);
}

// Builds one tile that jumps straight to renderSection(item.id) -- shared
// by Inicio's own loose shortcuts and each category's own screen grid, so
// both look and behave identically (same tile markup either way).
function buildShortcutTile(item) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'home-tile';
    tile.innerHTML = `<span class="home-tile-icon"><i class="bx ${item.icon}" aria-hidden="true"></i></span><span>${t(item.breadcrumbKey)}</span>`;
    tile.addEventListener('click', () => renderSection(item.id));
    return tile;
}

// Inicio's own content -- a greeting-style shortcut grid (reuses AppInicio.
// css's .home-tiles/.home-tile as-is, same "Accesos rápidos" look the
// client App's own Inicio tab uses), no numbers yet by design -- those
// would need their own server queries, left for later.
function renderHomeHub() {
    contentEl.innerHTML = '';
    const title = document.createElement('h2');
    title.className = 'home-section-title';
    title.textContent = t('home.quickAccess');
    contentEl.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'home-tiles';
    HOME_SHORTCUTS.forEach((item) => grid.appendChild(buildShortcutTile(item)));
    contentEl.appendChild(grid);
}

// Personal reorder of a category's own tile grid -- confirmed with the
// user this must actually move the real screen they operate from (this
// grid IS that screen, there's no separate admin tree for it), not just
// some cosmetic-only order. Cached per categoryId after the first fetch so
// re-entering a tab (or toggling reorder mode) doesn't re-fetch every time
// -- cleared only by a successful save, which already has the fresh value
// in hand anyway.
const personalOrderCache = {};
async function fetchPersonalOrder(catId) {
    if (personalOrderCache[catId]) return personalOrderCache[catId];
    try {
        const res = await fetch(apiUrl(`/api/me/saas-personal-order/${catId}`), { credentials: 'include' });
        const data = res.ok ? await res.json() : { personalOrder: null, masterOrder: null };
        personalOrderCache[catId] = data;
        return data;
    } catch {
        return { personalOrder: null, masterOrder: null };
    }
}
async function savePersonalOrder(catId, orderedItems) {
    try {
        const res = await fetch(apiUrl(`/api/me/saas-personal-order/${catId}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ orderedItems }),
        });
        if (res.ok) personalOrderCache[catId] = await res.json();
    } catch { /* best-effort -- the tile grid already reflects the new order either way, just won't survive a reload if this failed */ }
}
// Cascade: this account's own order (if they ever reordered) -> Árbol
// Maestro SaaS's own order (if IT was ever reordered) -> the catalog's own
// natural array order -- same "most specific wins, else fall back one
// level" idea as getEffectiveSectorOrder (db.js) has for Master -> Sector.
function orderCategoryItems(catId, items, personalOrder, masterOrder) {
    const allIds = items.map((i) => i.id);
    const base = (masterOrder || []).filter((id) => allIds.includes(id));
    const baseRest = allIds.filter((id) => !base.includes(id));
    const baseOrder = [...base, ...baseRest];
    const personal = (personalOrder || []).filter((id) => allIds.includes(id));
    const personalRest = baseOrder.filter((id) => !personal.includes(id));
    const finalOrder = [...personal, ...personalRest];
    return finalOrder.map((id) => items.find((i) => i.id === id));
}

// Drag handle + long-press-and-drag reordering, pointer-events based (not
// HTML5 dragstart/dragover) -- confirmed live that the native drag API has
// no real touch support in this WebView, only a mouse. Reorders the DOM
// live as the dragged tile crosses a neighbor's midpoint, then saves the
// final order on release.
function enableTileReorder(grid, catId, currentOrderRef) {
    let dragEl = null;
    let startY = 0;
    let startX = 0;
    function onPointerMove(e) {
        if (!dragEl) return;
        e.preventDefault();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        dragEl.style.transform = `translate(${dx}px, ${dy}px)`;
        const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.home-tile');
        if (under && under !== dragEl && under.parentElement === grid) {
            const rect = under.getBoundingClientRect();
            const before = e.clientY < rect.top + rect.height / 2 || (Math.abs(e.clientY - (rect.top + rect.height/2)) < rect.height/2 && e.clientX < rect.left + rect.width / 2);
            grid.insertBefore(dragEl, before ? under : under.nextSibling);
        }
    }
    function onPointerUp() {
        if (!dragEl) return;
        dragEl.classList.remove('home-tile-dragging');
        dragEl.style.transform = '';
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        const newOrder = Array.from(grid.children).map((el) => el.dataset.itemId);
        dragEl = null;
        currentOrderRef.order = newOrder;
        savePersonalOrder(catId, newOrder);
    }
    Array.from(grid.children).forEach((tile) => {
        const handle = tile.querySelector('.home-tile-drag-handle');
        if (!handle) return;
        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            dragEl = tile;
            startX = e.clientX;
            startY = e.clientY;
            tile.classList.add('home-tile-dragging');
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        });
    });
}

// A category tab's own content -- same tile grid Inicio uses, just listing
// that category's screens instead (see AppInicio.js's renderCategoryScreens
// for the client-side equivalent this mirrors). Anything without a real
// screen behind it yet still gets a real tile here (not hidden) -- tapping
// it just lands on the same "Próximamente" placeholder renderComingSoon
// already shows for a directly-tapped unbuilt section.
let categoryReorderMode = false;
async function renderCategorySection(catId) {
    contentEl.innerHTML = '';
    const items = CATEGORY_ITEMS[catId] || [];

    const toolbar = document.createElement('div');
    toolbar.className = 'home-category-toolbar';
    const reorderBtn = document.createElement('button');
    reorderBtn.type = 'button';
    reorderBtn.className = 'home-reorder-toggle';
    const setReorderBtnLabel = () => {
        reorderBtn.innerHTML = categoryReorderMode
            ? `<i class="bx bx-check" aria-hidden="true"></i> ${t('home.reorderDone')}`
            : `<i class="bx bx-up-arrow-alt" aria-hidden="true"></i><i class="bx bx-down-arrow-alt" aria-hidden="true"></i> ${t('home.reorderStart')}`;
        reorderBtn.classList.toggle('active', categoryReorderMode);
    };
    setReorderBtnLabel();
    reorderBtn.addEventListener('click', () => {
        categoryReorderMode = !categoryReorderMode;
        renderCategorySection(catId);
    });
    toolbar.appendChild(reorderBtn);
    contentEl.appendChild(toolbar);

    if (categoryReorderMode) {
        const hint = document.createElement('p');
        hint.className = 'home-reorder-hint';
        hint.innerHTML = `<i class="bx bx-move" aria-hidden="true"></i> ${t('home.reorderHint')}`;
        contentEl.appendChild(hint);
    }

    const { personalOrder, masterOrder } = await fetchPersonalOrder(catId);
    if (activeSection !== catId) return; // tapped away while this was loading
    const orderedItems = orderCategoryItems(catId, items, personalOrder, masterOrder);

    const grid = document.createElement('div');
    grid.className = 'home-tiles';
    const currentOrderRef = { order: orderedItems.map((i) => i.id) };
    orderedItems.forEach((item) => {
        const tile = buildShortcutTile(item);
        tile.dataset.itemId = item.id;
        if (categoryReorderMode) {
            tile.classList.add('home-tile-reorder-mode');
            tile.disabled = true; // no accidental navigation while reordering
            const handle = document.createElement('span');
            handle.className = 'home-tile-drag-handle';
            handle.innerHTML = '<i class="bx bx-move" aria-hidden="true"></i>';
            tile.appendChild(handle);
        }
        grid.appendChild(tile);
    });
    contentEl.appendChild(grid);
    if (categoryReorderMode) enableTileReorder(grid, catId, currentOrderRef);
}

function renderSection(id) {
    activeSection = id;
    renderToken += 1;
    // A screen reached via a category tile (e.g. 'tree') has no bottom tab
    // of its own anymore -- keep ITS category highlighted instead of every
    // tab going dark (see ITEM_CATEGORY above).
    const activeTabId = ITEM_CATEGORY[id] || id;
    document.querySelectorAll('.home-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.section === activeTabId));
    updateBreadcrumb();
    if (id === 'tree') loadMasterTree(renderToken);
    else if (id === 'saas-tree') loadSaasMasterTree(renderToken);
    else if (id === 'home') renderHomeHub();
    else if (id === 'sectors') loadSectorsSection(renderToken);
    else if (id === 'saas-team') loadEquipoSaasSection(renderToken);
    else if (id === 'saas-costs') loadCostosSection(renderToken);
    else if (CATEGORY_ITEMS[id]) renderCategorySection(id);
    else renderComingSoon();
}
document.querySelectorAll('.home-tab').forEach((tab) => {
    tab.addEventListener('click', () => renderSection(tab.dataset.section));
});
// Brand logo -- same "tap to go home" convention as tapping the tab itself,
// just reachable from anywhere in the header too.
document.getElementById('admin-brand-home-btn').addEventListener('click', () => {
    document.getElementById('admin-tab-home')?.click();
});

// --- Árbol de Permisos Maestro -- same load/describe-changes/confirm/save
// flow as public/Admin-ArbolMaestro.js, ported to this App's own bottom-
// sheet confirm dialog instead of a desktop modal. --------------------------
let masterTree = null;
let originalStatuses = [];
// Same idea as public/Admin-ArbolMaestro.js's own originalDepartmentOrder/
// originalAreaOrders -- a separate table from statuses, saved together on
// the same Guardar tap (see saveMasterTree below).
let originalDepartmentOrder = [];
let originalAreaOrders = {};
let originalApartadoOrders = {};
let originalPantallaOrders = {};
let originalColumnOrders = {};
// Same idea, Árbol Maestro's own suggested/base cost per node (see
// public/Admin-ArbolMaestro.js's own originalCosts).
let originalCosts = [];
let currentCurrency = 'MXN';
let lastExchangeRate = 1;

function statusRowKey(row) {
    return `${row.sectionId}::${row.itemId || ''}::${row.submenuId || ''}`;
}
const DEFAULT_ROW = { status: 'habilitado', webEnabled: true, appEnabled: false };

function describeChanges() {
    const before = new Map(originalStatuses.map((r) => [statusRowKey(r), r]));
    const after = masterTree.getStatuses();
    const afterMap = new Map(after.map((r) => [statusRowKey(r), r]));
    const changes = [];
    new Set([...before.keys(), ...afterMap.keys()]).forEach((key) => {
        const b = before.get(key) || DEFAULT_ROW;
        const a = afterMap.get(key) || DEFAULT_ROW;
        if (b.status === a.status && b.webEnabled === a.webEnabled && b.appEnabled === a.appEnabled) return;
        const sample = afterMap.get(key) || before.get(key);
        const label = masterTree.getStatusLabel(sample.sectionId, sample.itemId, sample.submenuId) || key;
        changes.push({ label, before: b, after: a });
    });
    return changes;
}
function orderArraysDiffer(before, after) {
    return before.length !== after.length || before.some((id, i) => id !== after[i]);
}
function departmentOrderChanged() {
    if (!masterTree) return false;
    return orderArraysDiffer(originalDepartmentOrder, masterTree.getDepartmentOrder());
}
// Same idea as public/Admin-ArbolMaestro.js's own collectOrderChanges --
// one { label, line } entry per order that actually changed since the
// last load/save (Departamento, plus one per department whose Área order
// moved).
function collectOrderChanges() {
    if (!masterTree) return [];
    const items = [];
    if (departmentOrderChanged()) {
        const names = masterTree.getDepartmentOrder().map((id) => masterTree.getStatusLabel(id, null, null) || id);
        items.push({
            label: t('admin.masterTreeOrderLabel'),
            line: t('admin.masterTreeOrderChangeLine', { order: names.join(' → ') }),
        });
    }
    const afterAreaOrders = masterTree.getAreaOrders();
    Object.keys(afterAreaOrders).forEach((sectionId) => {
        const before = originalAreaOrders[sectionId] || [];
        const after = afterAreaOrders[sectionId];
        if (!orderArraysDiffer(before, after)) return;
        const deptName = masterTree.getStatusLabel(sectionId, null, null) || sectionId;
        const names = after.map((id) => masterTree.getStatusLabel(sectionId, id, null) || id);
        items.push({
            label: t('admin.masterTreeAreaOrderLabel', { department: deptName }),
            line: t('admin.masterTreeOrderChangeLine', { order: names.join(' → ') }),
        });
    });
    const afterApartadoOrders = masterTree.getApartadoOrders();
    Object.keys(afterApartadoOrders).forEach((compoundKey) => {
        const before = originalApartadoOrders[compoundKey] || [];
        const after = afterApartadoOrders[compoundKey];
        if (!orderArraysDiffer(before, after)) return;
        const [sectionId, areaId] = compoundKey.split('::');
        const areaName = masterTree.getStatusLabel(sectionId, areaId, null) || areaId;
        const names = after.map((id) => masterTree.getStatusLabel(sectionId, areaId, id) || id);
        items.push({
            label: t('admin.masterTreeApartadoOrderLabel', { area: areaName }),
            line: t('admin.masterTreeOrderChangeLine', { order: names.join(' → ') }),
        });
    });
    const afterPantallaOrders = masterTree.getPantallaOrders();
    Object.keys(afterPantallaOrders).forEach((compoundKey) => {
        const before = originalPantallaOrders[compoundKey] || [];
        const after = afterPantallaOrders[compoundKey];
        if (!orderArraysDiffer(before, after)) return;
        const [sectionId, areaId, apartadoId] = compoundKey.split('::');
        const apartadoName = masterTree.getStatusLabel(sectionId, areaId, apartadoId) || apartadoId;
        const names = after.map((id) => masterTree.getStatusLabel(sectionId, areaId, `${apartadoId}/${id}`) || id);
        items.push({
            label: t('admin.masterTreePantallaOrderLabel', { apartado: apartadoName }),
            line: t('admin.masterTreeOrderChangeLine', { order: names.join(' → ') }),
        });
    });
    const afterColumnOrders = masterTree.getColumnOrders();
    Object.keys(afterColumnOrders).forEach((compoundKey) => {
        const before = originalColumnOrders[compoundKey] || [];
        const after = afterColumnOrders[compoundKey];
        if (!orderArraysDiffer(before, after)) return;
        const [sectionId, areaId, apartadoId, pantallaId, classId] = compoundKey.split('::');
        const classBase = `${apartadoId}/${pantallaId}/${classId}`;
        const className = masterTree.getStatusLabel(sectionId, areaId, classBase) || classId;
        const names = after.map((id) => masterTree.getStatusLabel(sectionId, areaId, `${classBase}/${id}`) || id);
        items.push({
            label: t('admin.masterTreeColumnOrderLabel', { classification: className }),
            line: t('admin.masterTreeOrderChangeLine', { order: names.join(' → ') }),
        });
    });
    return items;
}
// Same idea as public/Admin-ArbolMaestro.js's own collectCostChanges.
function collectCostChanges() {
    if (!masterTree) return [];
    const before = new Map(originalCosts.map((r) => [statusRowKey(r), r]));
    const after = masterTree.getCosts();
    const afterMap = new Map(after.map((r) => [statusRowKey(r), r]));
    const items = [];
    new Set([...before.keys(), ...afterMap.keys()]).forEach((key) => {
        const b = before.get(key) || { web: 0, app: 0 };
        const a = afterMap.get(key) || { web: 0, app: 0 };
        if (b.web === a.web && b.app === a.app) return;
        const sample = afterMap.get(key) || before.get(key);
        const label = masterTree.getStatusLabel(sample.sectionId, sample.itemId, sample.submenuId) || key;
        const lines = [];
        if (b.web !== a.web) lines.push(`${t('admin.masterTreeColCostWeb')}: $${b.web.toFixed(2)} → $${a.web.toFixed(2)}`);
        if (b.app !== a.app) lines.push(`${t('admin.masterTreeColCostApp')}: $${b.app.toFixed(2)} → $${a.app.toFixed(2)}`);
        items.push({ label: t('admin.masterTreeCostChangeLabel', { node: label }), line: lines.join(' · ') });
    });
    return items;
}
// Same idea as public/Admin-ArbolMaestro.js's own buildResumenGroups/
// renderResumen -- read-only, grouped by Estatus, built entirely from
// PermissionTree.js's already-exposed getters. Ported to this App's own
// "swap what's in contentEl" pattern instead of a static #master-resumen-*
// container -- renderResumenInto(container) builds the whole view fresh
// into whatever wrapper loadMasterTree hands it.
const STATUS_GROUP_ORDER = ['construccion', 'mejoras', 'inhabilitado', 'habilitado'];

// Each status group is a small forest (one root per Departamento that has
// at least one matching node under it) instead of a flat list -- a node's
// own ancestors (which may well sit in a DIFFERENT status themselves)
// exist here purely as shared grouping structure, deduplicated by label at
// each level, so e.g. 900 Departamento/Área/Apartado/Pantalla nodes that
// are all "Habilitado" collapse into one real tree instead of 900 lines
// each repeating their own full breadcrumb (confirmed with the user after
// seeing the flat version live -- it got noisy fast).
function insertResumenPath(children, path) {
    const [head, ...rest] = path;
    let node = children.find((n) => n.label === head);
    if (!node) {
        // isMatch: whether THIS node itself is the thing that has this
        // status, as opposed to just being an ancestor another match
        // needed for structure -- a node can be both (e.g. a whole Área
        // marked this status while one of its own Pantallas is ALSO
        // independently marked it), so this can't just be "has no
        // children" -- see countResumenLeaves/buildResumenNode below.
        node = { label: head, children: [], isMatch: false };
        children.push(node);
    }
    if (rest.length) insertResumenPath(node.children, rest);
    else node.isMatch = true;
}

function buildResumenGroups() {
    const groups = { habilitado: [], inhabilitado: [], construccion: [], mejoras: [] };
    if (!masterTree) return groups;
    const statusByKey = new Map(masterTree.getStatuses().map((r) => [statusRowKey(r), r.status]));
    const areaOrders = masterTree.getAreaOrders();
    const apartadoOrders = masterTree.getApartadoOrders();
    const pantallaOrders = masterTree.getPantallaOrders();
    const push = (sectionId, itemId, submenuId, path) => {
        const status = statusByKey.get(`${sectionId}::${itemId || ''}::${submenuId || ''}`) || 'habilitado';
        insertResumenPath(groups[status] || groups.habilitado, path);
    };
    // 'main' ("General") and its own Inicio/Panel/Tablero items are
    // excluded from getDepartmentOrder (never reorderable, never a real
    // Área) -- but 'main' still has its own status like any other node, so
    // it needs its own separate push here or it never appears in ANY
    // Resumen card no matter what its actual status is (confirmed live: an
    // Inhabilitado "General" still showed 0 across every card).
    const mainLabel = masterTree.getNodeLabel('main', null, null) || 'main';
    push('main', null, null, [mainLabel]);
    masterTree.getGeneralItemIds().forEach((itemId) => {
        const itemLabel = masterTree.getNodeLabel('main', itemId, null) || itemId;
        push('main', itemId, null, [mainLabel, itemLabel]);
    });
    masterTree.getDepartmentOrder().forEach((sectionId) => {
        const deptLabel = masterTree.getNodeLabel(sectionId, null, null) || sectionId;
        push(sectionId, null, null, [deptLabel]);
        (areaOrders[sectionId] || []).forEach((areaId) => {
            const areaLabel = masterTree.getNodeLabel(sectionId, areaId, null) || areaId;
            push(sectionId, areaId, null, [deptLabel, areaLabel]);
            (apartadoOrders[`${sectionId}::${areaId}`] || []).forEach((apartadoId) => {
                const apartadoLabel = masterTree.getNodeLabel(sectionId, areaId, apartadoId) || apartadoId;
                push(sectionId, areaId, apartadoId, [deptLabel, areaLabel, apartadoLabel]);
                (pantallaOrders[`${sectionId}::${areaId}::${apartadoId}`] || []).forEach((pantallaId) => {
                    const pantallaLabel = masterTree.getNodeLabel(sectionId, areaId, `${apartadoId}/${pantallaId}`) || pantallaId;
                    push(sectionId, areaId, `${apartadoId}/${pantallaId}`, [deptLabel, areaLabel, apartadoLabel, pantallaLabel]);
                    // One level deeper still -- a Pantalla's own Columnas,
                    // each of which can carry its own status override too
                    // (confirmed live: without this, a Pantalla could
                    // never expand any further in Resumen).
                    masterTree.getColumnEntries(sectionId, areaId, apartadoId, pantallaId).forEach((col) => {
                        push(sectionId, areaId, col.submenuId, [deptLabel, areaLabel, apartadoLabel, pantallaLabel, col.label]);
                    });
                    // "Tabla X", each Clasificación (e.g. "Control
                    // Interno"), "Iconos Personalización" and each Ícono now
                    // all carry their own independent Estatus too -- same
                    // "otherwise invisible in Resumen" reasoning as the
                    // Columna push above. Kept as flat siblings of the
                    // Columnas above (not nested under each other) rather
                    // than reshaping every leaf's own path.
                    const tableEntry = masterTree.getTableEntry(sectionId, areaId, apartadoId, pantallaId);
                    if (tableEntry) push(sectionId, areaId, tableEntry.submenuId, [deptLabel, areaLabel, apartadoLabel, pantallaLabel, tableEntry.label]);
                    masterTree.getClassificationEntries(sectionId, areaId, apartadoId, pantallaId).forEach((cls) => {
                        push(sectionId, areaId, cls.submenuId, [deptLabel, areaLabel, apartadoLabel, pantallaLabel, cls.label]);
                    });
                    const iconsGroupEntry = masterTree.getIconsGroupEntry(sectionId, areaId, apartadoId, pantallaId);
                    if (iconsGroupEntry) push(sectionId, areaId, iconsGroupEntry.submenuId, [deptLabel, areaLabel, apartadoLabel, pantallaLabel, iconsGroupEntry.label]);
                    masterTree.getIconEntries(sectionId, areaId, apartadoId, pantallaId).forEach((icon) => {
                        push(sectionId, areaId, icon.submenuId, [deptLabel, areaLabel, apartadoLabel, pantallaLabel, icon.label]);
                    });
                });
            });
        });
    });
    return groups;
}

function countResumenLeaves(node) {
    const own = node.isMatch ? 1 : 0;
    return own + node.children.reduce((sum, child) => sum + countResumenLeaves(child), 0);
}

// One collapsible row per node, same all-collapsed-by-default convention
// as the Árbol itself -- nothing here remembers what was open once Resumen
// closes.
function buildResumenNode(node, depth) {
    const wrap = document.createElement('div');
    wrap.className = 'mini-node';
    const row = document.createElement('div');
    row.className = 'mini-row';
    row.dataset.depth = String(depth);
    const hasChildren = node.children.length > 0;
    if (hasChildren) {
        row.classList.add('has-children');
        const toggle = document.createElement('span');
        toggle.className = 'mini-toggle';
        toggle.textContent = '▶';
        toggle.setAttribute('aria-hidden', 'true');
        row.appendChild(toggle);
    } else {
        const spacer = document.createElement('span');
        spacer.className = 'mini-toggle-spacer';
        row.appendChild(spacer);
    }
    const label = document.createElement('span');
    label.className = 'mini-label';
    label.textContent = node.label;
    row.appendChild(label);
    if (node.isMatch && hasChildren) {
        // This node is a match in its own right, not just a path an actual
        // match sits under -- flag it, since otherwise it'd silently read
        // as pure grouping structure once it also has children.
        const selfMatch = document.createElement('span');
        selfMatch.className = 'mini-self-match';
        selfMatch.textContent = '●';
        selfMatch.setAttribute('aria-hidden', 'true');
        row.appendChild(selfMatch);
    }
    if (hasChildren) {
        // Sum of the CHILDREN's own counts only -- never node's own isMatch
        // (countResumenLeaves would include it) -- this badge promises "this
        // many rows appear once you expand", so it has to match exactly what
        // expanding actually reveals. The node's own match (if any) already
        // has its own visible signal right here on this same row (the dot
        // above), it doesn't need to also inflate the count of what's below.
        const childrenCount = node.children.reduce((sum, child) => sum + countResumenLeaves(child), 0);
        const count = document.createElement('span');
        count.className = 'mini-count';
        count.textContent = String(childrenCount);
        row.appendChild(count);
        row.addEventListener('click', () => wrap.classList.toggle('open'));
    }
    wrap.appendChild(row);
    if (hasChildren) {
        const childrenWrap = document.createElement('div');
        childrenWrap.className = 'mini-children';
        node.children.forEach((child) => childrenWrap.appendChild(buildResumenNode(child, depth + 1)));
        wrap.appendChild(childrenWrap);
    }
    return wrap;
}

function renderResumenInto(container) {
    container.innerHTML = '';
    const hint = document.createElement('p');
    hint.className = 'admin-hint';
    hint.textContent = t('admin.masterResumenHint');
    container.appendChild(hint);
    const grid = document.createElement('div');
    grid.className = 'status-grid';
    container.appendChild(grid);
    const groups = buildResumenGroups();
    STATUS_GROUP_ORDER.forEach((key) => {
        const roots = groups[key];
        const totalCount = roots.reduce((sum, root) => sum + countResumenLeaves(root), 0);
        const card = document.createElement('div');
        card.className = `status-card status-card-${key.slice(0, 3)}`;
        // Habilitado starts collapsed -- it's the default status almost
        // everything sits in (by far the longest list), rarely what
        // someone opens Resumen to check. The other 3 start expanded
        // since those are exactly what's worth auditing.
        if (key !== 'habilitado') card.classList.add('expanded');
        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'status-card-head';
        const dot = document.createElement('span');
        dot.className = 'status-dot';
        const name = document.createElement('span');
        name.className = 'status-card-name';
        name.textContent = statusLabel(key);
        const count = document.createElement('span');
        count.className = 'status-card-count';
        count.textContent = String(totalCount);
        const chev = document.createElement('span');
        chev.className = 'status-card-chev';
        chev.textContent = '▶';
        chev.setAttribute('aria-hidden', 'true');
        head.append(dot, name, count, chev);
        head.addEventListener('click', () => card.classList.toggle('expanded'));
        card.appendChild(head);
        const list = document.createElement('div');
        list.className = 'status-card-list';
        if (!roots.length) {
            const empty = document.createElement('p');
            empty.className = 'admin-hint';
            empty.textContent = t('admin.masterResumenGroupEmpty');
            list.appendChild(empty);
        } else {
            roots.forEach((root) => list.appendChild(buildResumenNode(root, 0)));
        }
        card.appendChild(list);
        grid.appendChild(card);
    });
}

function statusLabel(status) {
    return t(`admin.masterTreeStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`);
}
function boolLabel(value) {
    return t(value ? 'admin.masterTreeOn' : 'admin.masterTreeOff');
}
function describeChangeLines(change) {
    const lines = [];
    if (change.before.status !== change.after.status) {
        lines.push(`${t('admin.masterTreeChangeStatus')}: ${statusLabel(change.before.status)} → ${statusLabel(change.after.status)}`);
    }
    if (change.before.webEnabled !== change.after.webEnabled) {
        lines.push(`${t('admin.masterTreePlatformWeb')}: ${boolLabel(change.before.webEnabled)} → ${boolLabel(change.after.webEnabled)}`);
    }
    if (change.before.appEnabled !== change.after.appEnabled) {
        lines.push(`${t('admin.masterTreePlatformApp')}: ${boolLabel(change.before.appEnabled)} → ${boolLabel(change.after.appEnabled)}`);
    }
    return lines;
}

const confirmOverlay = document.getElementById('admin-confirm-overlay');
const confirmList = document.getElementById('admin-confirm-list');
const confirmSaveBtn = document.getElementById('admin-confirm-save');
const confirmCancelBtn = document.getElementById('admin-confirm-cancel');
function openConfirmSheet(changes, orderChanges, onConfirm) {
    confirmList.innerHTML = '';
    changes.forEach((change) => {
        const row = document.createElement('div');
        row.className = 'master-tree-confirm-row';
        const nameEl = document.createElement('div');
        nameEl.className = 'master-tree-confirm-name';
        // change.label comes from menu.json's own labelKeys (t()-resolved),
        // never free text someone typed -- textContent regardless.
        nameEl.textContent = change.label;
        row.appendChild(nameEl);
        describeChangeLines(change).forEach((line) => {
            const lineEl = document.createElement('div');
            lineEl.className = 'master-tree-confirm-line';
            lineEl.textContent = line;
            row.appendChild(lineEl);
        });
        confirmList.appendChild(row);
    });
    (orderChanges || []).forEach((change) => {
        const row = document.createElement('div');
        row.className = 'master-tree-confirm-row';
        const nameEl = document.createElement('div');
        nameEl.className = 'master-tree-confirm-name';
        nameEl.textContent = change.label;
        row.appendChild(nameEl);
        const lineEl = document.createElement('div');
        lineEl.className = 'master-tree-confirm-line';
        lineEl.textContent = change.line;
        row.appendChild(lineEl);
        confirmList.appendChild(row);
    });
    confirmOverlay.hidden = false;
    confirmSaveBtn.onclick = async () => {
        confirmOverlay.hidden = true;
        await onConfirm();
    };
}
confirmCancelBtn.addEventListener('click', () => { confirmOverlay.hidden = true; });
confirmOverlay.addEventListener('click', (event) => { if (event.target === confirmOverlay) confirmOverlay.hidden = true; });

// --- Currency (see master_permission_cost/master_cost_settings in db.js,
// and the identical flow in public/Admin-ArbolMaestro.js) -- switching
// currency converts every already-saved $ Web/$ App value using an
// exchange rate confirmed (or overridden) in a bottom-sheet first.
const currencySheetOverlay = document.getElementById('currency-sheet-overlay');
const currencySheetTitle = document.getElementById('currency-sheet-title');
const currencySheetRateValue = document.getElementById('currency-sheet-rate-value');
const currencySheetRateInputLabel = document.getElementById('currency-sheet-rate-input-label');
const currencySheetRateInput = document.getElementById('currency-sheet-rate-input');
const currencySheetPreviewBox = document.getElementById('currency-sheet-preview-box');
const currencySheetConfirmBtn = document.getElementById('currency-sheet-confirm-btn');
const currencySheetCancelBtn = document.getElementById('currency-sheet-cancel-btn');
let pendingCurrency = null;
let currencySelectEl = null;

function updateCurrencySheetPreview() {
    const count = masterTree ? masterTree.getCosts().length : 0;
    currencySheetPreviewBox.textContent = count
        ? t('admin.masterCostPreviewCount', { count: String(count) })
        : t('admin.masterCostPreviewEmpty');
}

// Compact pill (icon+label+select), no hint text bundled in -- meant to
// sit inside .admin-toolbar next to the Árbol/Resumen toggle (see
// loadMasterTree below), same idea as public/Admin-ArbolMaestro.html's own
// .currency-group. The long hint text is its own standalone caption below
// the toolbar instead (admin.masterCostCurrencyHint), since it's
// descriptive text, not a control -- it doesn't need to compete with
// Moneda/Árbol-Resumen for room in the same row.
function buildCurrencyGroup() {
    const group = document.createElement('div');
    group.className = 'currency-group';
    group.innerHTML = `<span class="currency-label"><i class="bx bx-coin-stack" aria-hidden="true"></i><span>${t('admin.masterCostCurrencyLabel')}</span></span>`;
    const select = document.createElement('select');
    select.className = 'currency-select';
    ['MXN', 'USD', 'EUR'].forEach((code) => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = code;
        select.appendChild(opt);
    });
    select.value = currentCurrency;
    select.addEventListener('change', () => {
        const to = select.value;
        if (!masterTree || to === currentCurrency) return;
        pendingCurrency = to;
        const foreign = to === 'MXN' ? currentCurrency : to;
        currencySheetTitle.textContent = t('admin.masterCostChangeCurrencyTitle', { from: currentCurrency, to });
        currencySheetRateValue.textContent = t('admin.masterCostRateLine', { foreign, rate: lastExchangeRate.toFixed(2) });
        currencySheetRateInputLabel.textContent = `1 ${foreign} =`;
        currencySheetRateInput.value = lastExchangeRate.toFixed(2);
        updateCurrencySheetPreview();
        currencySheetOverlay.hidden = false;
    });
    currencySelectEl = select;
    group.appendChild(select);
    return group;
}
currencySheetCancelBtn.addEventListener('click', () => {
    if (currencySelectEl) currencySelectEl.value = currentCurrency;
    currencySheetOverlay.hidden = true;
});
currencySheetOverlay.addEventListener('click', (event) => { if (event.target === currencySheetOverlay) currencySheetCancelBtn.click(); });
currencySheetConfirmBtn.addEventListener('click', async () => {
    const rate = parseFloat(currencySheetRateInput.value) || 1;
    currencySheetConfirmBtn.disabled = true;
    try {
        const res = await fetch(apiUrl('/api/admin/master-permission-costs/currency'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ currency: pendingCurrency, exchangeRate: rate }),
        });
        if (!res.ok) throw new Error('save failed');
        currencySheetOverlay.hidden = true;
        // Every $ Web/$ App value just changed server-side -- simplest to
        // reload the whole tree fresh rather than rewrite each input here.
        await loadMasterTree(renderToken);
        showToast(t('admin.masterCostCurrencySaved'));
    } catch {
        showToast(t('admin.masterCostSaveError'));
    } finally {
        currencySheetConfirmBtn.disabled = false;
    }
});

async function saveMasterTree(saveBtn) {
    saveBtn.disabled = true;
    try {
        const [statusRes, orderRes, costRes] = await Promise.all([
            fetch(apiUrl('/api/admin/master-permission-status'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ statuses: masterTree.getStatuses() }),
            }),
            fetch(apiUrl('/api/admin/master-permission-order'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    departmentOrder: masterTree.getDepartmentOrder(),
                    areaOrders: masterTree.getAreaOrders(),
                    apartadoOrders: masterTree.getApartadoOrders(),
                    pantallaOrders: masterTree.getPantallaOrders(),
                    columnOrders: masterTree.getColumnOrders(),
                }),
            }),
            fetch(apiUrl('/api/admin/master-permission-costs'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ costs: masterTree.getCosts() }),
            }),
        ]);
        if (!statusRes.ok || !orderRes.ok || !costRes.ok) throw new Error('save failed');
        const [statusData] = await Promise.all([statusRes.json(), orderRes.json(), costRes.json()]);
        originalStatuses = statusData.statuses || [];
        // Same reasoning as loadMasterTree's own baseline fix below -- what
        // was just sent IS what the server now has.
        originalDepartmentOrder = masterTree.getDepartmentOrder();
        originalAreaOrders = masterTree.getAreaOrders();
        originalApartadoOrders = masterTree.getApartadoOrders();
        originalPantallaOrders = masterTree.getPantallaOrders();
        originalColumnOrders = masterTree.getColumnOrders();
        originalCosts = masterTree.getCosts();
        // Resets the tree's own pending-added/pending-removed highlight
        // baseline to what just got saved.
        masterTree.setBaseline(originalStatuses);
        showToast(t('main.changeSaved'));
    } catch {
        showToast(t('admin.saveError'));
    } finally {
        saveBtn.disabled = false;
    }
}

async function loadMasterTree(token) {
    contentEl.innerHTML = '';
    const hint = document.createElement('p');
    // Not .home-carga-progress-label -- that one is styled white-on-header
    // for AppCargaCombustible's own colored subscreen header, invisible
    // against this page's plain content background.
    hint.className = 'home-carga-empty-note';
    hint.textContent = t('admin.loading') || '...';
    contentEl.appendChild(hint);
    try {
        const [statusRes, orderRes, costRes, classificationsRes] = await Promise.all([
            fetch(apiUrl('/api/admin/master-permission-status'), { credentials: 'include' }),
            fetch(apiUrl('/api/admin/master-permission-order'), { credentials: 'include' }),
            fetch(apiUrl('/api/admin/master-permission-costs'), { credentials: 'include' }),
            fetch(apiUrl('/api/admin/master-permission-classifications'), { credentials: 'include' }),
        ]);
        if (token !== renderToken) return; // switched tabs while this was in flight
        if (!statusRes.ok || !orderRes.ok || !costRes.ok || !classificationsRes.ok) throw new Error('load failed');
        const [statusData, orderData, costData, classificationsData] = await Promise.all([
            statusRes.json(), orderRes.json(), costRes.json(), classificationsRes.json(),
        ]);
        if (token !== renderToken) return;
        originalStatuses = statusData.statuses || [];
        currentCurrency = costData.currency || 'MXN';
        lastExchangeRate = costData.lastExchangeRate || 1;
        contentEl.innerHTML = '';

        // Moneda + Árbol/Resumen together in one flex-wrap row (confirmed
        // with the user after they saw these awkwardly stacked on two
        // separate rows on Web) -- both fit on one line when there's room,
        // wrapping onto their own line as the screen narrows. Guardar
        // deliberately stays its own full-width button below (see the end
        // of this function) rather than joining this row -- every other
        // save/submit action in the App uses that same full-width
        // .home-carga-new-btn treatment, and this screen is always a
        // narrow phone width to begin with, unlike Web's own wide-screen
        // case where Guardar sharing the row actually saves space.
        const toolbar = document.createElement('div');
        toolbar.className = 'admin-toolbar';
        toolbar.appendChild(buildCurrencyGroup());

        // Árbol/Resumen toggle -- same idea as public/Admin-ArbolMaestro.js's
        // own #master-view-tree-btn/#master-view-resumen-btn, reusing the
        // exact same .master-tree-view-toggle/.master-tree-view-btn classes
        // from Admin.css (already linked here, shared with the Web page).
        const viewToggle = document.createElement('div');
        viewToggle.className = 'master-tree-view-toggle';
        const viewTreeBtn = document.createElement('button');
        viewTreeBtn.type = 'button';
        viewTreeBtn.className = 'master-tree-view-btn active';
        viewTreeBtn.innerHTML = `<i class="bx bx-sitemap" aria-hidden="true"></i><span>${t('admin.masterTreeViewTree')}</span>`;
        const viewResumenBtn = document.createElement('button');
        viewResumenBtn.type = 'button';
        viewResumenBtn.className = 'master-tree-view-btn';
        viewResumenBtn.innerHTML = `<i class="bx bx-list-ul" aria-hidden="true"></i><span>${t('admin.masterTreeViewResumen')}</span>`;
        viewToggle.append(viewTreeBtn, viewResumenBtn);
        toolbar.appendChild(viewToggle);
        contentEl.appendChild(toolbar);

        const currencyHint = document.createElement('span');
        currencyHint.className = 'admin-toolbar-hint';
        currencyHint.textContent = t('admin.masterCostCurrencyHint');
        contentEl.appendChild(currencyHint);

        const treeViewWrap = document.createElement('div');
        const treeWrap = document.createElement('div');
        // .perm-tree is the class Admin.css's own base rules key off of
        // (max-height/scroll/border) -- Admin-ArbolMaestro.html hardcodes it
        // directly in its static markup, so PermissionTree.js never adds it
        // itself; this container needs it too. .admin-master-tree is this
        // page's own scoping hook (see AppAdminInicio.css).
        treeWrap.className = 'admin-master-tree perm-tree';
        treeViewWrap.appendChild(treeWrap);
        contentEl.appendChild(treeViewWrap);

        const resumenViewWrap = document.createElement('div');
        resumenViewWrap.hidden = true;
        contentEl.appendChild(resumenViewWrap);

        viewTreeBtn.addEventListener('click', () => {
            viewTreeBtn.classList.add('active');
            viewResumenBtn.classList.remove('active');
            treeViewWrap.hidden = false;
            resumenViewWrap.hidden = true;
        });
        viewResumenBtn.addEventListener('click', () => {
            viewResumenBtn.classList.add('active');
            viewTreeBtn.classList.remove('active');
            resumenViewWrap.hidden = false;
            treeViewWrap.hidden = true;
            // Re-built fresh every time, so it reflects whatever's
            // currently in the tree, including edits made on the Árbol
            // tab that haven't been saved yet.
            renderResumenInto(resumenViewWrap);
        });

        masterTree = window.PermissionTree.create(treeWrap, {
            statusMode: true,
            departmentOrder: orderData.departmentOrder || [],
            areaOrder: orderData.areaOrders || {},
            apartadoOrder: orderData.apartadoOrders || {},
            pantallaOrder: orderData.pantallaOrders || {},
            columnOrder: orderData.columnOrders || {},
            costCurrency: currentCurrency,
        });
        await masterTree.init(originalStatuses, costData.costs || [], classificationsData.overrides || []);
        if (token !== renderToken) return; // switched away while menu.json/tree rows were still loading
        // The baseline is what the tree actually ends up SHOWING, not the
        // raw (possibly empty) server response -- see the identical fix and
        // full explanation in public/Admin-ArbolMaestro.js's own
        // loadMasterTree.
        originalDepartmentOrder = masterTree.getDepartmentOrder();
        originalAreaOrders = masterTree.getAreaOrders();
        originalApartadoOrders = masterTree.getApartadoOrders();
        originalPantallaOrders = masterTree.getPantallaOrders();
        originalColumnOrders = masterTree.getColumnOrders();
        originalCosts = masterTree.getCosts();

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'home-carga-new-btn admin-tree-save-btn';
        saveBtn.innerHTML = `<i class="bx bx-check" aria-hidden="true"></i><span>${t('admin.save')}</span>`;
        saveBtn.addEventListener('click', () => {
            if (!masterTree) return;
            const changes = describeChanges();
            const extraChanges = [...collectOrderChanges(), ...collectCostChanges()];
            if (!changes.length && !extraChanges.length) {
                showToast(t('admin.masterTreeNoChanges'));
                return;
            }
            openConfirmSheet(changes, extraChanges, () => saveMasterTree(saveBtn));
        });
        contentEl.appendChild(saveBtn);
    } catch {
        if (token !== renderToken) return;
        contentEl.innerHTML = '';
        const error = document.createElement('p');
        error.className = 'home-carga-empty-note';
        error.textContent = t('admin.loadError');
        contentEl.appendChild(error);
    }
}

// --- Árbol Maestro SaaS -- GEIPSA-internal readiness tree (own file,
// Admin-ArbolMaestroSaaS.js, mirroring public/Admin-ArbolMaestroSaaS.js).
// Much thinner than loadMasterTree above: no Árbol/Resumen toggle, no
// currency bar, no confirm-diff sheet -- the desktop SaaS screen never had
// any of those either. window.SaasMasterTree.render(container) does
// everything else (fetch, build header/rows/Guardar, wire events) since
// that file is its own self-contained factory, not a shared instance API
// like PermissionTree.js's own create().
function loadSaasMasterTree(token) {
    contentEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'admin-master-tree';
    contentEl.appendChild(wrap);
    window.SaasMasterTree.render(wrap);
}

// --- Giros de Negocio -- ports Admin-BusinessSectors.js's own screen into
// this App shell. Sub-views (list/detail/tree/form/history/perms) all
// render straight into contentEl with their own back button, same "swap
// what's in the tab's content area" model the Inicio/Árbol tabs already
// use -- no extra sheet/overlay markup needed in the HTML for this.
let sectorsList = [];
let sectorTypesList = [];
let sectorSubView = { mode: 'list' };
// Which Giro's card is expanded in the list -- set alongside every
// navigation into/out of a sub-screen (tree/order/form/history) so coming
// back re-opens the same card instead of dropping to a flat list.
let expandedSectorId = null;

async function fetchSectorTypes() {
    try {
        const res = await fetch(apiUrl('/api/admin/business-sector-types'), { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        sectorTypesList = (await res.json()).types || [];
    } catch {
        sectorTypesList = [];
    }
}

async function loadSectorsSection(token) {
    sectorSubView = { mode: 'list' };
    expandedSectorId = null;
    contentEl.innerHTML = '';
    const hint = document.createElement('p');
    hint.className = 'home-carga-empty-note';
    hint.textContent = t('admin.loading') || '...';
    contentEl.appendChild(hint);
    try {
        const [sectorsRes] = await Promise.all([
            fetch(apiUrl('/api/admin/business-sectors'), { credentials: 'include' }),
            fetchSectorTypes(),
        ]);
        if (token !== renderToken) return;
        if (!sectorsRes.ok) throw new Error('load failed');
        sectorsList = (await sectorsRes.json()).sectors || [];
        renderSectorSubView();
    } catch {
        if (token !== renderToken) return;
        contentEl.innerHTML = '';
        const error = document.createElement('p');
        error.className = 'home-carga-empty-note';
        error.textContent = t('admin.loadError');
        contentEl.appendChild(error);
    }
}

function renderSectorSubView() {
    if (activeSection !== 'sectors') return;
    contentEl.innerHTML = '';
    if (sectorSubView.mode === 'list') renderSectorsList();
    else if (sectorSubView.mode === 'tree') renderSectorTree(sectorSubView.sector);
    else if (sectorSubView.mode === 'form') renderSectorForm(sectorSubView.sector);
    else if (sectorSubView.mode === 'history') renderSectorHistory(sectorSubView.sector);
    else if (sectorSubView.mode === 'order') renderSectorOrder(sectorSubView.sector);
}

function subViewBackHeader(title, subtitle, onBack) {
    const head = document.createElement('div');
    head.className = 'home-carga-header-top';
    head.style.padding = '0.3rem 0 0.8rem';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'home-subscreen-back';
    back.innerHTML = '<i class="bx bx-arrow-back" aria-hidden="true"></i>';
    back.addEventListener('click', onBack);
    const titleWrap = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.style.margin = '0';
    h2.style.fontSize = '0.9rem';
    h2.textContent = title;
    titleWrap.appendChild(h2);
    if (subtitle) {
        const sub = document.createElement('div');
        sub.className = 'home-carga-empty-note';
        sub.style.padding = '0';
        sub.style.margin = '0.1rem 0 0';
        sub.style.textAlign = 'left';
        sub.textContent = subtitle;
        titleWrap.appendChild(sub);
    }
    head.append(back, titleWrap);
    return head;
}

function renderSectorsList() {
    const list = document.createElement('div');
    if (!sectorsList.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('admin.noBusinessSectors');
        list.appendChild(empty);
    }
    sectorsList.forEach((sector) => {
        const isOpen = expandedSectorId === sector.id;
        const card = document.createElement('div');
        card.className = 'home-carga-active-card' + (isOpen ? ' open' : '');

        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        const s = sector.permSummary || {};
        const dots = [];
        if (s.habilitado) dots.push(`<span class="perm-dot perm-dot-good"></span>${s.habilitado}`);
        if ((s.construccion || 0) + (s.mejoras || 0) > 0) dots.push(`<span class="perm-dot perm-dot-warn"></span>${(s.construccion || 0) + (s.mejoras || 0)}`);
        if (s.inhabilitado) dots.push(`<span class="perm-dot perm-dot-bad"></span>${s.inhabilitado}`);
        const statusLabel = t(sector.status === 'inactive' ? 'admin.businessSectorStatusInactive' : 'admin.businessSectorStatusActive');
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx ${sector.icon || 'bx-briefcase'}" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label">
                <p>${sector.name}</p>
                <span>${sector.typeName || '—'} · ${statusLabel}${dots.length ? ' · ' + dots.join(' ') : ''}</span>
            </span>
            <span class="home-carga-active-row-preview" role="button" tabindex="0" aria-label="${t('admin.businessSectorPreview')}" title="${t('admin.businessSectorPreview')}"><i class="bx bx-compass" aria-hidden="true"></i></span>
            <i class="bx bx-chevron-right home-carga-active-row-caret" aria-hidden="true"></i>
        `;
        row.addEventListener('click', () => {
            expandedSectorId = isOpen ? null : sector.id;
            renderSectorSubView();
        });
        const previewBtn = row.querySelector('.home-carga-active-row-preview');
        previewBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            showToast(t('admin.underConstruction'));
        });
        previewBtn.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            showToast(t('admin.underConstruction'));
        });
        card.appendChild(row);

        // Expanded in place instead of a separate detail screen -- Vista
        // Previa and Permisos Asignados used to live here too, but both
        // turned out fully redundant (the former with the row's own preview
        // icon above, the latter with the counts already on the row plus a
        // "go to tree" button pointing at the same place Accesos Globales
        // does below), so only the 5 real actions remain.
        if (isOpen) {
            if (sector.description) {
                const desc = document.createElement('p');
                desc.className = 'home-carga-active-card-desc';
                desc.textContent = sector.description;
                card.appendChild(desc);
            }
            const grid = document.createElement('div');
            grid.className = 'home-tiles home-carga-active-card-actions';
            const actions = [
                { icon: 'bx-shield', label: t('admin.giroAccesosGlobalesTitle'), onClick: () => { expandedSectorId = sector.id; sectorSubView = { mode: 'tree', sector }; renderSectorSubView(); } },
                { icon: 'bx-sort-alt-2', label: t('admin.giroReordenPersonalizadoTitle'), onClick: () => { expandedSectorId = sector.id; sectorSubView = { mode: 'order', sector }; renderSectorSubView(); } },
                { icon: 'bx-edit', label: t('admin.edit'), onClick: () => { expandedSectorId = sector.id; sectorSubView = { mode: 'form', sector }; renderSectorSubView(); } },
                { icon: 'bx-history', label: t('admin.businessSectorChangeHistory'), onClick: () => { expandedSectorId = sector.id; sectorSubView = { mode: 'history', sector }; renderSectorSubView(); } },
                {
                    icon: sector.status === 'inactive' ? 'bx-check-circle' : 'bx-x-circle',
                    label: t(sector.status === 'inactive' ? 'admin.activate' : 'admin.deactivate'),
                    onClick: () => toggleSectorStatusApp(sector),
                    danger: sector.status !== 'inactive',
                },
            ];
            actions.forEach((a) => {
                const tile = document.createElement('button');
                tile.type = 'button';
                tile.className = 'home-tile' + (a.danger ? ' danger' : '');
                tile.innerHTML = `<span class="home-tile-icon"><i class="bx ${a.icon}" aria-hidden="true"></i></span><span>${a.label}</span>`;
                tile.addEventListener('click', a.onClick);
                grid.appendChild(tile);
            });
            card.appendChild(grid);
        }

        list.appendChild(card);
    });
    contentEl.appendChild(list);

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'home-carga-new-btn';
    newBtn.style.marginTop = '1rem';
    newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${t('menu.addBusinessSectorNew')}</span>`;
    newBtn.addEventListener('click', () => { sectorSubView = { mode: 'form', sector: null }; renderSectorSubView(); });
    contentEl.appendChild(newBtn);
}

async function toggleSectorStatusApp(sector) {
    const nextStatus = sector.status === 'inactive' ? 'active' : 'inactive';
    try {
        const res = await fetch(apiUrl(`/api/admin/business-sectors/${sector.id}/status`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: nextStatus }),
        });
        if (!res.ok) throw new Error('save failed');
        const { sector: updated } = await res.json();
        sectorsList = sectorsList.map((s) => (s.id === updated.id ? updated : s));
        expandedSectorId = updated.id;
        renderSectorSubView();
    } catch {
        showToast(t('admin.saveError'));
    }
}

function renderSectorTree(sector) {
    contentEl.appendChild(subViewBackHeader(t('admin.giroAccesosGlobalesTitle'), sector.name, () => {
        expandedSectorId = sector.id;
        sectorSubView = { mode: 'list' };
        renderSectorSubView();
    }));
    const treeWrap = document.createElement('div');
    // grantMode 'giro' -- same replica of Árbol de Permisos Maestro's own
    // tree shell as the Web version (Admin-BusinessSectors.js), gated by
    // master_permission_status instead of the old ungated showAppTab
    // checkbox tree this replaced (that one's App column never actually
    // worked here either -- GET /api/business/app-screens 404s with no
    // req.user.clientId on a GEIPSA admin session).
    treeWrap.className = 'perm-tree perm-tree-scroll-x';
    contentEl.appendChild(treeWrap);
    const hint = document.createElement('p');
    hint.className = 'home-carga-empty-note';
    hint.textContent = t('admin.loading') || '...';
    treeWrap.appendChild(hint);

    let sectorTreeInstance = null;
    (async () => {
        try {
            const [grantsRes, statusRes, costsRes] = await Promise.all([
                fetch(apiUrl(`/api/admin/business-sectors/${sector.id}/grants`), { credentials: 'include' }),
                fetch(apiUrl('/api/admin/master-permission-status'), { credentials: 'include' }),
                fetch(apiUrl('/api/admin/master-permission-costs'), { credentials: 'include' }),
            ]);
            if (!grantsRes.ok || !statusRes.ok || !costsRes.ok) throw new Error('load failed');
            const grantsData = await grantsRes.json();
            const statusData = await statusRes.json();
            const costsData = await costsRes.json();
            if (sectorSubView.mode !== 'tree' || sectorSubView.sector.id !== sector.id) return;
            treeWrap.innerHTML = '';
            sectorTreeInstance = window.PermissionTree.create(treeWrap, {
                grantMode: 'giro',
                masterGate: statusData.statuses || [],
                masterCosts: costsData.costs || [],
                costCurrency: costsData.currency || 'MXN',
            });
            await sectorTreeInstance.init(grantsData.grants || []);
        } catch {
            treeWrap.innerHTML = '';
            const error = document.createElement('p');
            error.className = 'home-carga-empty-note';
            error.textContent = t('admin.loadError');
            treeWrap.appendChild(error);
        }
    })();

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'home-carga-new-btn';
    saveBtn.style.marginTop = '0.7rem';
    saveBtn.innerHTML = `<i class="bx bx-check" aria-hidden="true"></i><span>${t('admin.save')}</span>`;
    saveBtn.addEventListener('click', async () => {
        if (!sectorTreeInstance) return;
        saveBtn.disabled = true;
        try {
            const res = await fetch(apiUrl(`/api/admin/business-sectors/${sector.id}/grants`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ grants: sectorTreeInstance.getGrants() }),
            });
            if (!res.ok) throw new Error('save failed');
            showToast(t('main.changeSaved'));
            const refreshed = await fetch(apiUrl('/api/admin/business-sectors'), { credentials: 'include' });
            if (refreshed.ok) sectorsList = (await refreshed.json()).sectors || [];
        } catch {
            showToast(t('admin.saveError'));
        } finally {
            saveBtn.disabled = false;
        }
    });
    contentEl.appendChild(saveBtn);
}

function renderSectorForm(sector) {
    const isEdit = !!sector;
    contentEl.appendChild(subViewBackHeader(isEdit ? t('admin.businessSectorEditTitle') : t('menu.addBusinessSectorNew'), null, () => {
        if (isEdit) expandedSectorId = sector.id;
        sectorSubView = { mode: 'list' };
        renderSectorSubView();
    }));

    const nameLabel = document.createElement('label');
    nameLabel.className = 'home-carga-empty-note';
    nameLabel.style.cssText = 'text-align:left; padding:0; display:block; margin-bottom:0.3rem;';
    nameLabel.textContent = t('admin.businessSectorName');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = (sector && sector.name) || '';
    nameInput.style.cssText = 'width:100%; padding:0.6rem; border-radius:0.5rem; border:1px solid var(--home-divider); margin-bottom:0.8rem; font:inherit;';
    contentEl.append(nameLabel, nameInput);

    // Tipo de Giro goes first now (was after Icono) -- picking it jumps the
    // icon picker below straight to that type's own rubro (see
    // BusinessSectorIcons.js's setCategory), same order Web's own form uses.
    const typeLabel = nameLabel.cloneNode(true);
    typeLabel.textContent = t('admin.businessSectorType');
    contentEl.appendChild(typeLabel);
    const typeSelect = document.createElement('select');
    typeSelect.style.cssText = 'width:100%; padding:0.6rem; border-radius:0.5rem; border:1px solid var(--home-divider); margin-bottom:0.4rem; font:inherit;';
    function renderTypeOptions() {
        typeSelect.innerHTML = '';
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = t('admin.businessSectorTypeNone');
        typeSelect.appendChild(blank);
        sectorTypesList.forEach((type) => {
            const opt = document.createElement('option');
            opt.value = String(type.id);
            opt.textContent = type.name;
            typeSelect.appendChild(opt);
        });
        if (sector && sector.typeId) typeSelect.value = String(sector.typeId);
    }
    renderTypeOptions();
    contentEl.appendChild(typeSelect);
    function sectorTypeById(id) { return sectorTypesList.find((type) => type.id === id) || null; }

    const typeBtnRow = document.createElement('div');
    typeBtnRow.style.cssText = 'display:flex; gap:1.2rem; margin-bottom:0.6rem;';
    const newTypeBtn = document.createElement('button');
    newTypeBtn.type = 'button';
    newTypeBtn.className = 'admin-link-btn';
    newTypeBtn.style.cssText = 'background:none; border:none; padding:0; color:var(--home-accent); font:inherit; font-weight:700; font-size:0.8rem;';
    newTypeBtn.textContent = t('admin.businessSectorNewType');
    const editTypeBtn = document.createElement('button');
    editTypeBtn.type = 'button';
    editTypeBtn.style.cssText = newTypeBtn.style.cssText;
    editTypeBtn.textContent = t('admin.businessSectorEditType');
    editTypeBtn.hidden = !typeSelect.value;
    typeBtnRow.append(newTypeBtn, editTypeBtn);
    contentEl.appendChild(typeBtnRow);

    // Inline reveal instead of Web's modal (this shell has no modal
    // infrastructure) -- collects both name and rubro now that a type
    // carries a category, replacing the old single-field window.prompt().
    const typeEditorWrap = document.createElement('div');
    typeEditorWrap.hidden = true;
    typeEditorWrap.style.cssText = 'border:1px solid var(--home-divider); border-radius:0.5rem; padding:0.7rem; margin-bottom:0.8rem; display:flex; flex-direction:column; gap:0.5rem;';
    contentEl.appendChild(typeEditorWrap);

    let editingTypeId = null;
    function openTypeEditor(type) {
        editingTypeId = type ? type.id : null;
        typeEditorWrap.innerHTML = '';
        typeEditorWrap.hidden = false;

        const typeNameInput = document.createElement('input');
        typeNameInput.type = 'text';
        typeNameInput.placeholder = t('admin.businessSectorTypeName');
        typeNameInput.value = type ? type.name : '';
        typeNameInput.style.cssText = 'width:100%; padding:0.5rem; border-radius:0.4rem; border:1px solid var(--home-divider); font:inherit;';

        const typeCategorySelect = document.createElement('select');
        typeCategorySelect.style.cssText = typeNameInput.style.cssText;
        window.BusinessSectorIcons.getCategories(t).then((categories) => {
            typeCategorySelect.innerHTML = '';
            const none = document.createElement('option');
            none.value = '';
            none.textContent = t('admin.sectorTypeCategoryNone');
            typeCategorySelect.appendChild(none);
            categories.forEach((cat) => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.label;
                typeCategorySelect.appendChild(opt);
            });
            typeCategorySelect.value = (type && type.iconCategory) || '';
        });

        const typeError = document.createElement('p');
        typeError.className = 'home-carga-empty-note';
        typeError.style.color = 'var(--home-danger)';
        typeError.hidden = true;

        const typeBtns = document.createElement('div');
        typeBtns.style.cssText = 'display:flex; gap:0.6rem;';
        const saveTypeBtn = document.createElement('button');
        saveTypeBtn.type = 'button';
        saveTypeBtn.className = 'home-carga-new-btn';
        saveTypeBtn.textContent = t('admin.save');
        const cancelTypeBtn = document.createElement('button');
        cancelTypeBtn.type = 'button';
        cancelTypeBtn.className = 'home-carga-secondary-btn';
        cancelTypeBtn.textContent = t('admin.cancel');
        typeBtns.append(saveTypeBtn, cancelTypeBtn);

        typeEditorWrap.append(typeNameInput, typeCategorySelect, typeError, typeBtns);

        saveTypeBtn.addEventListener('click', async () => {
            const name = typeNameInput.value.trim();
            if (!name) {
                typeError.textContent = t('admin.requiredFields');
                typeError.hidden = false;
                return;
            }
            try {
                const url = editingTypeId
                    ? apiUrl(`/api/admin/business-sector-types/${editingTypeId}`)
                    : apiUrl('/api/admin/business-sector-types');
                const res = await fetch(url, {
                    method: editingTypeId ? 'PATCH' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ name, iconCategory: typeCategorySelect.value || null }),
                });
                if (!res.ok) { typeError.textContent = t('admin.saveError'); typeError.hidden = false; return; }
                const { type: saved } = await res.json();
                sectorTypesList = editingTypeId
                    ? sectorTypesList.map((t2) => (t2.id === saved.id ? saved : t2))
                    : [...sectorTypesList, saved].sort((a, b) => a.name.localeCompare(b.name));
                renderTypeOptions();
                typeSelect.value = String(saved.id);
                editTypeBtn.hidden = false;
                iconPickerInstance.setCategory(saved.iconCategory);
                typeEditorWrap.hidden = true;
            } catch {
                typeError.textContent = t('admin.saveError');
                typeError.hidden = false;
            }
        });
        cancelTypeBtn.addEventListener('click', () => { typeEditorWrap.hidden = true; });
    }
    newTypeBtn.addEventListener('click', () => openTypeEditor(null));
    editTypeBtn.addEventListener('click', () => {
        const current = sectorTypeById(Number(typeSelect.value));
        if (current) openTypeEditor(current);
    });
    typeSelect.addEventListener('change', () => {
        editTypeBtn.hidden = !typeSelect.value;
        typeEditorWrap.hidden = true;
        iconPickerInstance.setCategory(sectorTypeById(Number(typeSelect.value) || null)?.iconCategory);
    });

    const iconLabel = nameLabel.cloneNode(true);
    iconLabel.textContent = t('admin.businessSectorIcon');
    contentEl.appendChild(iconLabel);
    const iconPickerContainer = document.createElement('div');
    iconPickerContainer.style.marginBottom = '0.8rem';
    contentEl.appendChild(iconPickerContainer);
    const iconPickerInstance = window.BusinessSectorIcons.create(iconPickerContainer, {
        t,
        selected: (sector && sector.icon) || null,
        category: sector && sector.typeId ? sectorTypeById(sector.typeId)?.iconCategory : null,
    });

    const descLabel = nameLabel.cloneNode(true);
    descLabel.textContent = t('admin.businessSectorDescription');
    contentEl.appendChild(descLabel);
    const descInput = document.createElement('textarea');
    descInput.rows = 3;
    descInput.value = (sector && sector.description) || '';
    descInput.style.cssText = 'width:100%; padding:0.6rem; border-radius:0.5rem; border:1px solid var(--home-divider); margin-bottom:0.8rem; font:inherit; resize:vertical;';
    contentEl.appendChild(descInput);

    const errorEl = document.createElement('p');
    errorEl.className = 'home-carga-empty-note';
    errorEl.style.color = 'var(--home-danger)';
    errorEl.hidden = true;
    contentEl.appendChild(errorEl);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'home-carga-new-btn';
    saveBtn.innerHTML = `<i class="bx bx-check" aria-hidden="true"></i><span>${t('admin.save')}</span>`;
    saveBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) {
            errorEl.textContent = t('admin.requiredFields');
            errorEl.hidden = false;
            return;
        }
        errorEl.hidden = true;
        saveBtn.disabled = true;
        const payload = {
            name, icon: iconPickerInstance.getValue(),
            typeId: typeSelect.value ? Number(typeSelect.value) : null,
            description: descInput.value.trim(),
        };
        try {
            const url = isEdit ? apiUrl(`/api/admin/business-sectors/${sector.id}`) : apiUrl('/api/admin/business-sectors');
            const res = await fetch(url, {
                method: isEdit ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                errorEl.textContent = body.message || t('admin.saveError');
                errorEl.hidden = false;
                return;
            }
            const { sector: saved } = await res.json();
            sectorsList = isEdit
                ? sectorsList.map((s) => (s.id === saved.id ? saved : s))
                : [...sectorsList, saved].sort((a, b) => a.name.localeCompare(b.name));
            showToast(t('main.recordSaved'));
            expandedSectorId = saved.id;
            sectorSubView = { mode: 'list' };
            renderSectorSubView();
        } catch {
            errorEl.textContent = t('admin.saveError');
            errorEl.hidden = false;
        } finally {
            saveBtn.disabled = false;
        }
    });
    contentEl.appendChild(saveBtn);
}

function renderSectorHistory(sector) {
    contentEl.appendChild(subViewBackHeader(t('admin.businessSectorChangeHistory'), sector.name, () => {
        expandedSectorId = sector.id;
        sectorSubView = { mode: 'list' };
        renderSectorSubView();
    }));
    const list = document.createElement('div');
    list.className = 'home-carga-empty-note';
    list.textContent = t('admin.loading') || '...';
    contentEl.appendChild(list);
    (async () => {
        try {
            const res = await fetch(apiUrl(`/api/admin/business-sectors/${sector.id}/changes`), { credentials: 'include' });
            if (!res.ok) throw new Error('load failed');
            const { changes } = await res.json();
            list.innerHTML = '';
            if (!changes || !changes.length) {
                list.textContent = t('main.changeHistoryEmpty');
                return;
            }
            changes.forEach((change) => {
                const row = document.createElement('div');
                row.className = 'item-row';
                let description;
                if (change.action === 'create') description = t('main.changeHistoryCreated');
                else description = `${t(change.field_key) || change.field_key}: "${change.old_value || '—'}" → "${change.new_value || '—'}"`;
                // Same 6-field shape Web's own change-history tables show
                // everywhere now (Fecha/Usuario/Registro/Cambio/Solicitó/
                // Autorizó) -- Registro is this same Giro's own name on
                // every row (already scoped to one sector), Solicitó/
                // Autorizó are always "—" since business_sector_changes has
                // no requested_by/authorized_by at all (no approval
                // workflow here, same as elsewhere).
                row.innerHTML = `<div class="item-main"><div class="item-title">${description}</div><div class="item-sub">${change.changed_at} · ${change.changed_by || '—'}</div><div class="item-sub">${t('main.changeHistoryRecord')}: ${sector.name} · ${t('main.changeHistoryRequestedBy')}: — · ${t('main.changeHistoryAuthorizedBy')}: —</div></div>`;
                contentEl.appendChild(row);
            });
            list.remove();
        } catch {
            list.textContent = t('admin.loadError');
        }
    })();
}

// --- Reorden Personalizado -- literal réplica of Accesos Globales's own
// tree (grantMode:'giro'), filtered down to only what this Giro already
// has granted (grantOrderMode), with drag-reorder turned back on at every
// depth Árbol Maestro itself reorders at (Departamento/Área/Apartado/
// Pantalla/Columna) -- same replacement the Web version's own
// openSectorOrderModal got, mirrored here over contentEl/subViewBackHeader
// instead of a modal to match this shell's own navigation style.
function renderSectorOrder(sector) {
    contentEl.appendChild(subViewBackHeader(t('admin.giroReordenPersonalizadoTitle'), sector.name, () => {
        expandedSectorId = sector.id;
        sectorSubView = { mode: 'list' };
        renderSectorSubView();
    }));
    const treeWrap = document.createElement('div');
    treeWrap.className = 'perm-tree perm-tree-scroll-x';
    contentEl.appendChild(treeWrap);
    const hint = document.createElement('p');
    hint.className = 'home-carga-empty-note';
    hint.textContent = t('admin.loading') || '...';
    treeWrap.appendChild(hint);

    let sectorOrderInstance = null;
    (async () => {
        try {
            const [grantsRes, statusRes, costsRes, orderRes] = await Promise.all([
                fetch(apiUrl(`/api/admin/business-sectors/${sector.id}/grants`), { credentials: 'include' }),
                fetch(apiUrl('/api/admin/master-permission-status'), { credentials: 'include' }),
                fetch(apiUrl('/api/admin/master-permission-costs'), { credentials: 'include' }),
                fetch(apiUrl(`/api/admin/business-sectors/${sector.id}/department-order`), { credentials: 'include' }),
            ]);
            if (!grantsRes.ok || !statusRes.ok || !costsRes.ok || !orderRes.ok) throw new Error('load failed');
            const grantsData = await grantsRes.json();
            const statusData = await statusRes.json();
            const costsData = await costsRes.json();
            const orderData = await orderRes.json();
            if (sectorSubView.mode !== 'order' || sectorSubView.sector.id !== sector.id) return;
            treeWrap.innerHTML = '';
            sectorOrderInstance = window.PermissionTree.create(treeWrap, {
                grantMode: 'giro',
                grantOrderMode: true,
                masterGate: statusData.statuses || [],
                masterCosts: costsData.costs || [],
                costCurrency: costsData.currency || 'MXN',
                departmentOrder: orderData.customOrder || [],
                areaOrder: orderData.customAreaOrders || {},
                apartadoOrder: orderData.customApartadoOrders || {},
                pantallaOrder: orderData.customPantallaOrders || {},
                columnOrder: orderData.customColumnOrders || {},
            });
            await sectorOrderInstance.init(grantsData.grants || []);
        } catch {
            treeWrap.innerHTML = '';
            const error = document.createElement('p');
            error.className = 'home-carga-empty-note';
            error.textContent = t('admin.loadError');
            treeWrap.appendChild(error);
        }
    })();

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'home-carga-new-btn';
    saveBtn.style.marginTop = '0.7rem';
    saveBtn.innerHTML = `<i class="bx bx-check" aria-hidden="true"></i><span>${t('admin.save')}</span>`;
    saveBtn.addEventListener('click', async () => {
        if (!sectorOrderInstance) return;
        saveBtn.disabled = true;
        try {
            const res = await fetch(apiUrl(`/api/admin/business-sectors/${sector.id}/department-order`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    customOrder: sectorOrderInstance.getDepartmentOrder(),
                    customAreaOrders: sectorOrderInstance.getAreaOrders(),
                    customApartadoOrders: sectorOrderInstance.getApartadoOrders(),
                    customPantallaOrders: sectorOrderInstance.getPantallaOrders(),
                    customColumnOrders: sectorOrderInstance.getColumnOrders(),
                }),
            });
            if (!res.ok) throw new Error('save failed');
            showToast(t('main.changeSaved'));
        } catch {
            showToast(t('admin.saveError'));
        } finally {
            saveBtn.disabled = false;
        }
    });
    contentEl.appendChild(saveBtn);
}

// --- Equipo SaaS -- ports Admin-EquipoSaaS.js's own screen into this shell:
// a list of GEIPSA staff accounts (role='admin') with a small, purpose-built
// 2-level access tree per account -- deliberately NOT PermissionTree.js,
// same "3 flat screens" reasoning Admin-EquipoSaaS.js's own header comment
// gives (a department/área/apartado/pantalla/columna component would be
// massive overkill here) -- plus a "+ Nuevo Admin SaaS" creation form. Same
// list/form/tree sub-view dispatcher shape loadSectorsSection above uses,
// just missing the history/order modes (this screen has neither on Web).
const SAAS_TEAM_PERMISSION_CATALOG = [
    {
        itemId: 'saas-clients', labelKey: 'menu.clientesRegistrados',
        actions: [
            { subItemId: null, labelKey: 'admin.saasActionView' },
            { subItemId: 'editar', labelKey: 'admin.saasActionEdit' },
            { subItemId: 'crear', labelKey: 'admin.saasActionCreate' },
            { subItemId: 'activar', labelKey: 'admin.saasActionActivate' },
            { subItemId: 'reset', labelKey: 'admin.saasActionReset' },
        ],
    },
    {
        itemId: 'saas-plans', labelKey: 'menu.plansRegistered',
        actions: [
            { subItemId: null, labelKey: 'admin.saasActionView' },
            { subItemId: 'editar', labelKey: 'admin.saasActionEdit' },
            { subItemId: 'crear', labelKey: 'admin.saasActionCreate' },
            { subItemId: 'activate', labelKey: 'admin.saasActionActivate' },
        ],
    },
    {
        itemId: 'saas-module-costs', labelKey: 'menu.moduleCosts',
        actions: [
            { subItemId: null, labelKey: 'admin.saasActionView' },
            { subItemId: 'editar', labelKey: 'admin.saasActionEdit' },
        ],
    },
    {
        itemId: 'saas-apps', labelKey: 'menu.ourApps',
        actions: [
            { subItemId: null, labelKey: 'admin.saasActionView' },
            { subItemId: 'editar', labelKey: 'admin.saasActionEdit' },
            { subItemId: 'crear', labelKey: 'admin.saasActionCreate' },
        ],
    },
    {
        itemId: 'saas-backups', labelKey: 'menu.ourBackups',
        actions: [
            { subItemId: null, labelKey: 'admin.saasActionView' },
            { subItemId: 'descargar', labelKey: 'admin.saasActionDownload' },
        ],
    },
    {
        itemId: 'saas-material-apoyo', labelKey: 'menu.ourSupportMaterial',
        actions: [
            { subItemId: null, labelKey: 'admin.saasActionView' },
            { subItemId: 'subir', labelKey: 'admin.saasActionUpload' },
        ],
    },
];

let equipoSaasUsers = [];
let equipoSaasSubView = { mode: 'list' };
let equipoSaasTreeGrants = [];
let equipoSaasExpandedScreens = new Set();
let equipoSaasTreeListEl = null;

function equipoSaasHasGrant(itemId, subItemId) {
    return equipoSaasTreeGrants.some((g) => g.itemId === itemId && (subItemId ? g.subItemId === subItemId : !g.subItemId));
}
function equipoSaasSetGrant(itemId, subItemId, checked) {
    equipoSaasTreeGrants = equipoSaasTreeGrants.filter((g) => !(g.itemId === itemId && (subItemId ? g.subItemId === subItemId : !g.subItemId)));
    if (checked) equipoSaasTreeGrants.push({ itemId, subItemId: subItemId || null });
}

async function loadEquipoSaasSection(token) {
    equipoSaasSubView = { mode: 'list' };
    contentEl.innerHTML = '';
    const hint = document.createElement('p');
    hint.className = 'home-carga-empty-note';
    hint.textContent = t('admin.loading') || '...';
    contentEl.appendChild(hint);
    try {
        const res = await fetch(apiUrl('/api/admin/saas-users'), { credentials: 'include' });
        if (token !== renderToken) return;
        if (!res.ok) throw new Error('load failed');
        equipoSaasUsers = (await res.json()).users || [];
        renderEquipoSaasSubView();
    } catch {
        if (token !== renderToken) return;
        contentEl.innerHTML = '';
        const error = document.createElement('p');
        error.className = 'home-carga-empty-note';
        error.textContent = t('admin.loadError');
        contentEl.appendChild(error);
    }
}

function renderEquipoSaasSubView() {
    if (activeSection !== 'saas-team') return;
    contentEl.innerHTML = '';
    if (equipoSaasSubView.mode === 'list') renderEquipoSaasList();
    else if (equipoSaasSubView.mode === 'form') renderEquipoSaasForm();
    else if (equipoSaasSubView.mode === 'tree') renderEquipoSaasTree(equipoSaasSubView.user);
}

function renderEquipoSaasList() {
    const list = document.createElement('div');
    if (!equipoSaasUsers.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('admin.noSaasUsers');
        list.appendChild(empty);
    }
    equipoSaasUsers.forEach((user) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx bx-shield" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label">
                <p>${user.name}</p>
                <span>${user.username} · ${user.email}</span>
            </span>
            <i class="bx bx-chevron-right home-carga-active-row-caret" aria-hidden="true"></i>
        `;
        row.addEventListener('click', () => {
            equipoSaasSubView = { mode: 'tree', user };
            renderEquipoSaasSubView();
        });
        list.appendChild(row);
    });
    contentEl.appendChild(list);

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'home-carga-new-btn';
    newBtn.style.marginTop = '1rem';
    newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${t('admin.saasUserNewTitle')}</span>`;
    newBtn.addEventListener('click', () => { equipoSaasSubView = { mode: 'form' }; renderEquipoSaasSubView(); });
    contentEl.appendChild(newBtn);
}

function renderEquipoSaasForm() {
    contentEl.appendChild(subViewBackHeader(t('admin.saasUserNewTitle'), null, () => {
        equipoSaasSubView = { mode: 'list' };
        renderEquipoSaasSubView();
    }));

    const makeField = (labelText, type) => {
        const label = document.createElement('p');
        label.className = 'home-carga-empty-note';
        label.style.cssText = 'text-align:left; padding:0; display:block; margin-bottom:0.3rem;';
        label.textContent = labelText;
        const input = document.createElement('input');
        input.type = type;
        input.style.cssText = 'width:100%; padding:0.6rem; border-radius:0.5rem; border:1px solid var(--home-divider); margin-bottom:0.8rem; font:inherit;';
        contentEl.append(label, input);
        return input;
    };
    const nameInput = makeField(t('admin.saasUserName'), 'text');
    const usernameInput = makeField(t('business.username'), 'text');
    const emailInput = makeField(t('admin.saasUserEmail'), 'email');
    const passwordInput = makeField(t('business.password'), 'password');

    const errorEl = document.createElement('p');
    errorEl.className = 'home-carga-empty-note';
    errorEl.style.color = 'var(--home-danger)';
    errorEl.hidden = true;
    contentEl.appendChild(errorEl);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'home-carga-new-btn';
    saveBtn.innerHTML = `<i class="bx bx-check" aria-hidden="true"></i><span>${t('admin.save')}</span>`;
    saveBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        if (!name || !username || !email || !password || password.length < 8) {
            errorEl.textContent = t('admin.requiredFields');
            errorEl.hidden = false;
            return;
        }
        errorEl.hidden = true;
        saveBtn.disabled = true;
        try {
            const res = await fetch(apiUrl('/api/admin/saas-users'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, username, email, password }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                errorEl.textContent = body.message || t('admin.saveError');
                errorEl.hidden = false;
                return;
            }
            const { user } = await res.json();
            equipoSaasUsers = [...equipoSaasUsers, user];
            showToast(t('main.recordSaved'));
            equipoSaasSubView = { mode: 'list' };
            renderEquipoSaasSubView();
        } catch {
            errorEl.textContent = t('admin.saveError');
            errorEl.hidden = false;
        } finally {
            saveBtn.disabled = false;
        }
    });
    contentEl.appendChild(saveBtn);
}

function equipoSaasTreeRow(labelText, depth, toggle, checked, indeterminate, onChange) {
    const row = document.createElement('div');
    row.className = `perm-tree-row perm-tree-depth-${depth}`;

    if (toggle) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'perm-tree-toggle';
        btn.setAttribute('aria-expanded', String(toggle.expanded));
        btn.innerHTML = '<i class="bx bx-chevron-down" aria-hidden="true"></i>';
        btn.addEventListener('click', () => { toggle.onToggle(); renderEquipoSaasTreeList(); });
        row.appendChild(btn);
    } else {
        const spacer = document.createElement('span');
        spacer.className = 'perm-tree-toggle-spacer';
        row.appendChild(spacer);
    }

    const label = document.createElement('label');
    label.className = 'perm-tree-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.indeterminate = !!indeterminate;
    input.addEventListener('change', () => { onChange(input.checked); renderEquipoSaasTreeList(); });
    const span = document.createElement('span');
    span.textContent = labelText;
    label.append(input, span);
    row.appendChild(label);

    return row;
}

function renderEquipoSaasTreeList() {
    equipoSaasTreeListEl.innerHTML = '';
    SAAS_TEAM_PERMISSION_CATALOG.forEach((screen) => {
        const subItemIds = screen.actions.map((a) => a.subItemId);
        const checkedCount = subItemIds.filter((subItemId) => equipoSaasHasGrant(screen.itemId, subItemId)).length;
        const expanded = equipoSaasExpandedScreens.has(screen.itemId);
        equipoSaasTreeListEl.appendChild(equipoSaasTreeRow(
            t(screen.labelKey), 0,
            { expanded, onToggle: () => (expanded ? equipoSaasExpandedScreens.delete(screen.itemId) : equipoSaasExpandedScreens.add(screen.itemId)) },
            checkedCount === subItemIds.length, checkedCount > 0 && checkedCount < subItemIds.length,
            (checked) => subItemIds.forEach((subItemId) => equipoSaasSetGrant(screen.itemId, subItemId, checked)),
        ));
        if (!expanded) return;
        screen.actions.forEach((action) => {
            equipoSaasTreeListEl.appendChild(equipoSaasTreeRow(
                t(action.labelKey), 1, null,
                equipoSaasHasGrant(screen.itemId, action.subItemId), false,
                (checked) => equipoSaasSetGrant(screen.itemId, action.subItemId, checked),
            ));
        });
    });
}

async function renderEquipoSaasTree(user) {
    contentEl.appendChild(subViewBackHeader(`${t('admin.saasTreeTitle')} — ${user.name}`, null, () => {
        equipoSaasSubView = { mode: 'list' };
        renderEquipoSaasSubView();
    }));

    const hint = document.createElement('p');
    hint.className = 'home-carga-empty-note';
    hint.textContent = t('admin.loading') || '...';
    contentEl.appendChild(hint);

    try {
        const res = await fetch(apiUrl(`/api/admin/saas-users/${user.id}/grants`), { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        equipoSaasTreeGrants = (await res.json()).grants || [];
        equipoSaasExpandedScreens = new Set();
        hint.remove();

        equipoSaasTreeListEl = document.createElement('div');
        equipoSaasTreeListEl.className = 'admin-master-tree perm-tree';
        contentEl.appendChild(equipoSaasTreeListEl);
        renderEquipoSaasTreeList();

        const errorEl = document.createElement('p');
        errorEl.className = 'home-carga-empty-note';
        errorEl.style.color = 'var(--home-danger)';
        errorEl.hidden = true;
        contentEl.appendChild(errorEl);

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'home-carga-new-btn';
        saveBtn.style.marginTop = '0.7rem';
        saveBtn.innerHTML = `<i class="bx bx-check" aria-hidden="true"></i><span>${t('admin.save')}</span>`;
        saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            errorEl.hidden = true;
            try {
                const saveRes = await fetch(apiUrl(`/api/admin/saas-users/${user.id}/grants`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ grants: equipoSaasTreeGrants }),
                });
                if (!saveRes.ok) {
                    const body = await saveRes.json().catch(() => ({}));
                    errorEl.textContent = body.message || t('admin.saveError');
                    errorEl.hidden = false;
                    return;
                }
                showToast(t('main.changeSaved'));
            } catch {
                errorEl.textContent = t('admin.saveError');
                errorEl.hidden = false;
            } finally {
                saveBtn.disabled = false;
            }
        });
        contentEl.appendChild(saveBtn);
    } catch {
        hint.textContent = t('admin.loadError');
    }
}

// --- Costo Accesos-Permisos -- ports Admin-CostosModulos.js's own screen:
// one row per plan (same /api/admin/plans as Nuestros Planes) with an
// always-editable "Costo Por Centro de Costos" number and an "Árbol de
// Costo" button opening a PermissionCostTree.js tree (mode:'costEdit' --
// every node priced independently, no checkboxes at all, since pricing
// doesn't depend on whether anything is granted in any particular plan).
// Registro de Cambios (the Cambios icon Web's own table row has) is NOT
// ported here -- out of scope for closing the mobile árbol gap specifically,
// and this shell has nothing to hang a shared change-history dialog off of
// yet (Web's own is Dashboard.js's ensurePlanHistoryModal, GEIPSA-plan-
// scoped, a bigger separate piece of shared infrastructure).
function formatMoney(amount, currency) {
    const symbol = currency === 'USD' ? 'US$' : '$';
    return `${symbol}${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

let costPlansList = [];
let costsSubView = { mode: 'list' };
let expandedCostPlanId = null;
let costTreeInstance = null;

async function loadCostosSection(token) {
    costsSubView = { mode: 'list' };
    expandedCostPlanId = null;
    contentEl.innerHTML = '';
    const hint = document.createElement('p');
    hint.className = 'home-carga-empty-note';
    hint.textContent = t('admin.loading') || '...';
    contentEl.appendChild(hint);
    try {
        const res = await fetch(apiUrl('/api/admin/plans'), { credentials: 'include' });
        if (token !== renderToken) return;
        if (!res.ok) throw new Error('load failed');
        costPlansList = (await res.json()).plans || [];
        renderCostosSubView();
    } catch {
        if (token !== renderToken) return;
        contentEl.innerHTML = '';
        const error = document.createElement('p');
        error.className = 'home-carga-empty-note';
        error.textContent = t('admin.loadError');
        contentEl.appendChild(error);
    }
}

function renderCostosSubView() {
    if (activeSection !== 'saas-costs') return;
    contentEl.innerHTML = '';
    if (costsSubView.mode === 'tree') renderCostTree(costsSubView.plan);
    else renderCostosList();
}

async function patchCostPlanField(plan, patch) {
    try {
        const res = await fetch(apiUrl(`/api/admin/plans/${plan.id}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error('save failed');
        const { plan: updated } = await res.json();
        costPlansList = costPlansList.map((p) => (p.id === updated.id ? updated : p));
    } catch {
        showToast(t('admin.saveError'));
    }
    renderCostosSubView();
}

function renderCostosList() {
    const list = document.createElement('div');
    if (!costPlansList.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('admin.noPlans');
        list.appendChild(empty);
    }
    costPlansList.forEach((plan) => {
        const isOpen = expandedCostPlanId === plan.id;
        const card = document.createElement('div');
        card.className = 'home-carga-active-card' + (isOpen ? ' open' : '');

        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        const statusLabel = t(!plan.locked ? 'admin.planStatusRevision' : (plan.status === 'inactive' ? 'admin.planStatusInactive' : 'admin.planStatusActive'));
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx bx-purchase-tag-alt" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label">
                <p>${plan.name}</p>
                <span>${formatMoney(plan.accessPermissionsCost, plan.currency)} · ${statusLabel}</span>
            </span>
            <i class="bx bx-chevron-right home-carga-active-row-caret" aria-hidden="true"></i>
        `;
        row.addEventListener('click', () => {
            expandedCostPlanId = isOpen ? null : plan.id;
            renderCostosSubView();
        });
        card.appendChild(row);

        if (isOpen) {
            const ccLabel = document.createElement('p');
            ccLabel.className = 'home-carga-empty-note';
            ccLabel.style.cssText = 'text-align:left; padding:0.6rem 0.85rem 0.2rem; margin:0;';
            ccLabel.textContent = t('admin.costPerCostCenterColumn');
            card.appendChild(ccLabel);

            const ccInput = document.createElement('input');
            ccInput.type = 'number';
            ccInput.min = '0';
            ccInput.step = '0.01';
            ccInput.value = plan.costPerCostCenter || '';
            ccInput.style.cssText = 'width:calc(100% - 1.7rem); margin:0 0.85rem 0.7rem; padding:0.6rem; border-radius:0.5rem; border:1px solid var(--home-divider); font:inherit;';
            ccInput.addEventListener('change', () => {
                patchCostPlanField(plan, { costPerCostCenter: Math.max(0, Number(ccInput.value) || 0) });
            });
            card.appendChild(ccInput);

            const grid = document.createElement('div');
            grid.className = 'home-tiles home-carga-active-card-actions';
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'home-tile';
            tile.innerHTML = `<span class="home-tile-icon"><i class="bx bx-sitemap" aria-hidden="true"></i></span><span>${t('admin.accessPermCostColumn')}</span>`;
            tile.addEventListener('click', () => { costsSubView = { mode: 'tree', plan }; renderCostosSubView(); });
            grid.appendChild(tile);
            card.appendChild(grid);
        }

        list.appendChild(card);
    });
    contentEl.appendChild(list);
}

async function renderCostTree(plan) {
    contentEl.appendChild(subViewBackHeader(`${t('admin.accessPermCostColumn')} — ${plan.name}`, null, () => {
        expandedCostPlanId = plan.id;
        costsSubView = { mode: 'list' };
        renderCostosSubView();
    }));

    const hint = document.createElement('p');
    hint.className = 'home-carga-empty-note';
    hint.textContent = t('admin.loading') || '...';
    contentEl.appendChild(hint);

    try {
        const res = await fetch(apiUrl(`/api/admin/plans/${plan.id}/permission-costs`), { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        hint.remove();

        const currencyRow = document.createElement('div');
        currencyRow.style.cssText = 'display:flex; align-items:center; gap:0.6rem; margin-bottom:0.7rem;';
        const currencyLabel = document.createElement('label');
        currencyLabel.textContent = t('admin.planCurrency');
        currencyLabel.style.cssText = 'font-size:0.75rem; color:var(--home-text-muted);';
        const currencySelect = document.createElement('select');
        currencySelect.style.cssText = 'padding:0.4rem 0.6rem; border-radius:0.5rem; border:1px solid var(--home-divider); font:inherit;';
        ['MXN', 'USD'].forEach((cur) => {
            const opt = document.createElement('option');
            opt.value = cur;
            opt.textContent = cur;
            currencySelect.appendChild(opt);
        });
        currencySelect.value = data.currency || plan.currency || 'MXN';
        currencyRow.append(currencyLabel, currencySelect);
        contentEl.appendChild(currencyRow);

        const treeWrap = document.createElement('div');
        treeWrap.className = 'admin-master-tree perm-tree';
        contentEl.appendChild(treeWrap);
        costTreeInstance = window.PermissionCostTree.create(treeWrap, { mode: 'costEdit', currency: currencySelect.value });
        await costTreeInstance.init([], data.costs || []);

        const errorEl = document.createElement('p');
        errorEl.className = 'home-carga-empty-note';
        errorEl.style.color = 'var(--home-danger)';
        errorEl.hidden = true;
        contentEl.appendChild(errorEl);

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'home-carga-new-btn';
        saveBtn.style.marginTop = '0.7rem';
        saveBtn.innerHTML = `<i class="bx bx-check" aria-hidden="true"></i><span>${t('admin.save')}</span>`;
        saveBtn.addEventListener('click', async () => {
            if (!costTreeInstance) return;
            saveBtn.disabled = true;
            errorEl.hidden = true;
            try {
                const saveRes = await fetch(apiUrl(`/api/admin/plans/${plan.id}/permission-costs`), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ costs: costTreeInstance.getCosts(), currency: currencySelect.value }),
                });
                if (!saveRes.ok) {
                    const body = await saveRes.json().catch(() => ({}));
                    errorEl.textContent = body.message || t('admin.saveError');
                    errorEl.hidden = false;
                    return;
                }
                const { plan: updated } = await saveRes.json();
                costPlansList = costPlansList.map((p) => (p.id === updated.id ? updated : p));
                showToast(t('admin.accessPermCostsSaved'));
            } catch {
                errorEl.textContent = t('admin.saveError');
                errorEl.hidden = false;
            } finally {
                saveBtn.disabled = false;
            }
        });
        contentEl.appendChild(saveBtn);
    } catch {
        hint.textContent = t('admin.loadError');
    }
}

(async function init() {
    await loadLanguage();
    updateConnIndicator();
    try {
        const meRes = await fetch(apiUrl('/api/me'), { credentials: 'include' });
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        // This shell only makes sense for GEIPSA staff -- a client account
        // that somehow lands here (stray link, stale bookmark) belongs back
        // on its own home instead.
        if (user?.role !== 'admin') { window.location.replace('AppInicio.html'); return; }
        document.getElementById('home-user-name').textContent = user?.name || '';
        applyStyle(getStoredStyle());
        renderSection('home');
    } catch (err) {
        console.error('Panel Admin failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
