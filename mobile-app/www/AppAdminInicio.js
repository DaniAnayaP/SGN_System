// ---------------------------------------------------------------------------
// Panel Admin (App) — GEIPSA staff (role 'admin') shell, reached via
// access-screen.js's post-login role branch instead of AppInicio.html. Same
// lighter i18n loader as AppRoles.js/AppNuestrasUnidades.js (no Dashboard.js
// here, just window.Dashboard.t as the one shim PermissionTree.js needs).
//
// Single page, 5 bottom tabs swap the content area in place (same pattern
// AppInicio.html's own tabs already use) instead of separate pages per
// section — only the Árbol de Permisos Maestro tab has a real screen behind
// it today (ports Admin-ArbolMaestro.js's own load/save/confirm flow); the
// other 4 are honest "Próximamente" placeholders, per the agreed incremental
// rollout (Web already has these screens; the rest of the App port is
// future work).
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
// Icon/label pairs reused both by the tab bar (already static markup in
// AppAdminInicio.html) and by the Inicio tab's own shortcut tiles below --
// kept in one place so the two never drift apart.
const HOME_SHORTCUTS = [
    { id: 'board', icon: 'bx-bar-chart-alt-2', breadcrumbKey: 'home.tabBoard' },
    { id: 'tree', icon: 'bx-sitemap', breadcrumbKey: 'menu.masterPermissionsTree' },
    { id: 'sectors', icon: 'bx-briefcase-alt-2', breadcrumbKey: 'menu.businessSectorsAbbr1' },
    { id: 'plans', icon: 'bx-package', breadcrumbKey: 'menu.plansRegistered' },
    { id: 'clients', icon: 'bx-buildings', breadcrumbKey: 'menu.clientesRegistrados' },
    { id: 'holdings', icon: 'bx-collection', breadcrumbKey: 'menu.holdingsTitle' },
];
const SECTIONS = [{ id: 'home', breadcrumbKey: 'home.tabHome' }, ...HOME_SHORTCUTS];
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
    HOME_SHORTCUTS.forEach((item) => {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'home-tile';
        tile.innerHTML = `<span class="home-tile-icon"><i class="bx ${item.icon}" aria-hidden="true"></i></span><span>${t(item.breadcrumbKey)}</span>`;
        tile.addEventListener('click', () => document.getElementById(`admin-tab-${item.id}`)?.click());
        grid.appendChild(tile);
    });
    contentEl.appendChild(grid);
}

function renderSection(id) {
    activeSection = id;
    renderToken += 1;
    document.querySelectorAll('.home-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.section === id));
    updateBreadcrumb();
    if (id === 'tree') loadMasterTree(renderToken);
    else if (id === 'home') renderHomeHub();
    else if (id === 'sectors') loadSectorsSection(renderToken);
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
        const [statusRes, orderRes, costRes] = await Promise.all([
            fetch(apiUrl('/api/admin/master-permission-status'), { credentials: 'include' }),
            fetch(apiUrl('/api/admin/master-permission-order'), { credentials: 'include' }),
            fetch(apiUrl('/api/admin/master-permission-costs'), { credentials: 'include' }),
        ]);
        if (token !== renderToken) return; // switched tabs while this was in flight
        if (!statusRes.ok || !orderRes.ok || !costRes.ok) throw new Error('load failed');
        const [statusData, orderData, costData] = await Promise.all([statusRes.json(), orderRes.json(), costRes.json()]);
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
        await masterTree.init(originalStatuses, costData.costs || []);
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

// --- Giros de Negocio -- ports Admin-BusinessSectors.js's own screen into
// this App shell. Sub-views (list/detail/tree/form/history/perms) all
// render straight into contentEl with their own back button, same "swap
// what's in the tab's content area" model the Inicio/Árbol tabs already
// use -- no extra sheet/overlay markup needed in the HTML for this.
const SECTOR_ICON_OPTIONS = ['bx-buildings', 'bx-store-alt', 'bx-briefcase', 'bx-cog', 'bx-package', 'bx-car', 'bx-restaurant', 'bx-leaf'];
let sectorsList = [];
let sectorTypesList = [];
let sectorSubView = { mode: 'list' };

function sectorStatusLabelKey(status) {
    // Not "...Med" -- confirmed live that variant doesn't exist for
    // Inhabilitado/Mejoras (only Habilitado/Construcción have it), which
    // left the raw i18n key showing on screen. The base key exists for
    // all 4 statuses.
    return `admin.masterTreeStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

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
    else if (sectorSubView.mode === 'detail') renderSectorDetail(sectorSubView.sector);
    else if (sectorSubView.mode === 'tree') renderSectorTree(sectorSubView.sector);
    else if (sectorSubView.mode === 'form') renderSectorForm(sectorSubView.sector);
    else if (sectorSubView.mode === 'history') renderSectorHistory(sectorSubView.sector);
    else if (sectorSubView.mode === 'perms') renderSectorPerms(sectorSubView.sector);
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
            <i class="bx bx-chevron-right" aria-hidden="true"></i>
        `;
        row.addEventListener('click', () => { sectorSubView = { mode: 'detail', sector }; renderSectorSubView(); });
        list.appendChild(row);
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

function renderSectorDetail(sector) {
    contentEl.appendChild(subViewBackHeader(sector.name, `${sector.typeName || '—'} · ${t(sector.status === 'inactive' ? 'admin.businessSectorStatusInactive' : 'admin.businessSectorStatusActive')}`, () => {
        sectorSubView = { mode: 'list' };
        renderSectorSubView();
    }));

    const label = document.createElement('div');
    label.className = 'home-carga-empty-note';
    label.style.textAlign = 'left';
    label.style.padding = '0 0 0.8rem';
    label.textContent = sector.description || '';
    if (sector.description) contentEl.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'action-grid';
    const actions = [
        { icon: 'bx-shield', label: t('admin.giroAccesosGlobalesTitle'), onClick: () => { sectorSubView = { mode: 'tree', sector }; renderSectorSubView(); } },
        { icon: 'bx-sort-alt-2', label: t('admin.giroReordenPersonalizadoTitle'), onClick: () => { sectorSubView = { mode: 'order', sector }; renderSectorSubView(); } },
        { icon: 'bx-compass', label: t('admin.businessSectorPreview'), onClick: () => showToast(t('admin.underConstruction')) },
        { icon: 'bx-edit', label: t('admin.edit'), onClick: () => { sectorSubView = { mode: 'form', sector }; renderSectorSubView(); } },
        { icon: 'bx-history', label: t('admin.businessSectorChangeHistory'), onClick: () => { sectorSubView = { mode: 'history', sector }; renderSectorSubView(); } },
        {
            icon: sector.status === 'inactive' ? 'bx-check-circle' : 'bx-x-circle',
            label: t(sector.status === 'inactive' ? 'admin.activate' : 'admin.deactivate'),
            onClick: () => toggleSectorStatusApp(sector),
        },
    ];
    actions.forEach((a) => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'action-cell';
        cell.innerHTML = `<span class="item-icon"><i class="bx ${a.icon}" aria-hidden="true"></i></span><span class="lbl">${a.label}</span>`;
        cell.addEventListener('click', a.onClick);
        grid.appendChild(cell);
    });
    contentEl.appendChild(grid);

    const permsBtn = document.createElement('button');
    permsBtn.type = 'button';
    permsBtn.className = 'home-carga-secondary-btn';
    permsBtn.style.marginTop = '1rem';
    permsBtn.innerHTML = `<i class="bx bx-pie-chart-alt" aria-hidden="true"></i><span>${t('admin.businessSectorPermsAssigned')}</span>`;
    permsBtn.addEventListener('click', () => { sectorSubView = { mode: 'perms', sector }; renderSectorSubView(); });
    contentEl.appendChild(permsBtn);
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
        sectorSubView = { mode: 'detail', sector: updated };
        renderSectorSubView();
    } catch {
        showToast(t('admin.saveError'));
    }
}

function renderSectorTree(sector) {
    contentEl.appendChild(subViewBackHeader(t('admin.giroAccesosGlobalesTitle'), sector.name, () => {
        sectorSubView = { mode: 'detail', sector };
        renderSectorSubView();
    }));
    const treeWrap = document.createElement('div');
    // grantMode 'giro' -- same replica of Árbol de Permisos Maestro's own
    // tree shell as the Web version (Admin-BusinessSectors.js), gated by
    // master_permission_status instead of the old ungated showAppTab
    // checkbox tree this replaced (that one's App column never actually
    // worked here either -- GET /api/business/app-screens 404s with no
    // req.user.clientId on a GEIPSA admin session).
    treeWrap.className = 'perm-tree';
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
        sectorSubView = isEdit ? { mode: 'detail', sector } : { mode: 'list' };
        renderSectorSubView();
    }));

    let selectedIcon = (sector && sector.icon) || SECTOR_ICON_OPTIONS[0];

    const nameLabel = document.createElement('label');
    nameLabel.className = 'home-carga-empty-note';
    nameLabel.style.cssText = 'text-align:left; padding:0; display:block; margin-bottom:0.3rem;';
    nameLabel.textContent = t('admin.businessSectorName');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = (sector && sector.name) || '';
    nameInput.style.cssText = 'width:100%; padding:0.6rem; border-radius:0.5rem; border:1px solid var(--home-divider); margin-bottom:0.8rem; font:inherit;';
    contentEl.append(nameLabel, nameInput);

    const iconLabel = nameLabel.cloneNode(true);
    iconLabel.textContent = t('admin.businessSectorIcon');
    contentEl.appendChild(iconLabel);
    const iconPicker = document.createElement('div');
    iconPicker.style.cssText = 'display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.8rem;';
    function renderIcons() {
        iconPicker.innerHTML = '';
        SECTOR_ICON_OPTIONS.forEach((icon) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = `width:2.4rem; height:2.4rem; border-radius:0.5rem; border:1.5px solid ${icon === selectedIcon ? 'var(--home-accent)' : 'var(--home-divider)'}; background:${icon === selectedIcon ? 'var(--home-surface-2, #eef0fd)' : 'var(--home-surface)'}; color:${icon === selectedIcon ? 'var(--home-accent)' : 'var(--home-text-secondary)'}; display:flex; align-items:center; justify-content:center; font-size:1.1rem;`;
            btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
            btn.addEventListener('click', () => { selectedIcon = icon; renderIcons(); });
            iconPicker.appendChild(btn);
        });
    }
    renderIcons();
    contentEl.appendChild(iconPicker);

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

    const newTypeBtn = document.createElement('button');
    newTypeBtn.type = 'button';
    newTypeBtn.className = 'home-carga-secondary-btn';
    newTypeBtn.style.marginBottom = '0.8rem';
    newTypeBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${t('admin.businessSectorNewType')}</span>`;
    newTypeBtn.addEventListener('click', async () => {
        const name = window.prompt(t('admin.businessSectorTypeName'));
        if (!name || !name.trim()) return;
        try {
            const res = await fetch(apiUrl('/api/admin/business-sector-types'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name: name.trim() }),
            });
            if (!res.ok) { showToast(t('admin.saveError')); return; }
            const { type } = await res.json();
            sectorTypesList = [...sectorTypesList, type].sort((a, b) => a.name.localeCompare(b.name));
            renderTypeOptions();
            typeSelect.value = String(type.id);
        } catch {
            showToast(t('admin.saveError'));
        }
    });
    contentEl.appendChild(newTypeBtn);

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
            name, icon: selectedIcon,
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
            sectorSubView = { mode: 'detail', sector: saved };
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
        sectorSubView = { mode: 'detail', sector };
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
                row.innerHTML = `<div class="item-main"><div class="item-title">${description}</div><div class="item-sub">${change.changed_at} · ${change.changed_by || '—'}</div></div>`;
                contentEl.appendChild(row);
            });
            list.remove();
        } catch {
            list.textContent = t('admin.loadError');
        }
    })();
}

function renderSectorPerms(sector) {
    contentEl.appendChild(subViewBackHeader(t('admin.businessSectorPermsAssigned'), sector.name, () => {
        sectorSubView = { mode: 'detail', sector };
        renderSectorSubView();
    }));
    const s = sector.permSummary || {};
    const groups = [
        { key: 'habilitado', count: s.habilitado || 0 },
        { key: 'construccion', count: s.construccion || 0 },
        { key: 'mejoras', count: s.mejoras || 0 },
        { key: 'inhabilitado', count: s.inhabilitado || 0 },
    ].filter((g) => g.count > 0);
    if (!groups.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('admin.businessSectorPermsEmpty');
        contentEl.appendChild(empty);
    } else {
        groups.forEach((g) => {
            const row = document.createElement('div');
            row.className = 'item-row';
            row.innerHTML = `<div class="item-main"><div class="item-title">${t(sectorStatusLabelKey(g.key))}</div></div><span class="perm-status-tag perm-status-tag-on">${g.count}</span>`;
            contentEl.appendChild(row);
        });
    }
    const goToTree = document.createElement('button');
    goToTree.type = 'button';
    goToTree.className = 'home-carga-secondary-btn';
    goToTree.style.marginTop = '1rem';
    goToTree.innerHTML = `<i class="bx bx-shield" aria-hidden="true"></i><span>${t('admin.businessSectorGoToTree')}</span>`;
    goToTree.addEventListener('click', () => { sectorSubView = { mode: 'tree', sector }; renderSectorSubView(); });
    contentEl.appendChild(goToTree);
}

// --- Departamento reorder (see the Web version's identical screen in
// Admin-BusinessSectors.js -- same two ideas: "Orden Árbol Maestro" is
// read-only reference here, "Reorden Personalizado" is drag-only and local
// to this Giro). Reuses .sector-order-* classes from Admin.css, laid out
// over .item-row instead of a <table> to match this shell's own list style.
let departmentCatalogApp = null;
async function ensureDepartmentCatalogApp() {
    if (!departmentCatalogApp) departmentCatalogApp = await window.PermissionTree.getDepartmentCatalog();
    return departmentCatalogApp;
}
// Área names don't vary per Giro, only their order does -- cached across
// every renderSectorOrder call the same way departmentCatalogApp is.
let areaCatalogsApp = {};
async function ensureAreaCatalogApp(sectionId) {
    if (!areaCatalogsApp[sectionId]) areaCatalogsApp[sectionId] = await window.PermissionTree.getAreaCatalog(sectionId);
    return areaCatalogsApp[sectionId];
}
function reorderOrderListApp(list, draggedId, targetId) {
    if (draggedId === targetId) return false;
    const fromIdx = list.indexOf(draggedId);
    if (fromIdx === -1) return false;
    list.splice(fromIdx, 1);
    const toIdx = list.indexOf(targetId);
    list.splice(toIdx === -1 ? list.length : toIdx, 0, draggedId);
    return true;
}

function renderSectorOrder(sector) {
    contentEl.appendChild(subViewBackHeader(t('admin.giroReordenPersonalizadoTitle'), sector.name, () => {
        sectorSubView = { mode: 'detail', sector };
        renderSectorSubView();
    }));
    const hintEl = document.createElement('p');
    hintEl.className = 'home-carga-empty-note';
    hintEl.style.textAlign = 'left';
    hintEl.style.padding = '0 0 0.8rem';
    hintEl.textContent = t('admin.sectorOrderHint');
    contentEl.appendChild(hintEl);

    const listEl = document.createElement('div');
    listEl.className = 'home-carga-empty-note';
    listEl.textContent = t('admin.loading') || '...';
    contentEl.appendChild(listEl);

    let masterOrder = [];
    let customOrder = [];
    let labelById = new Map();
    // Same lazy-per-department idea as the Web version's own
    // sectorOrderCustomAreaOrders -- only departments actually expanded
    // this session get an entry, which is also exactly what Guardar sends.
    let masterAreaOrders = {};
    let areaOrdersFromServer = {};
    let customAreaOrders = {};
    const expandedDepts = new Set();
    // One shared dragged-node reference -- kind+sectionId guard against a
    // Departamento drag being dropped as if it were an Área, or an Área
    // from one department landing under another (same as the Web version).
    let draggedNode = null;
    const rowsWrap = document.createElement('div');

    function buildRow({ kind, id, sectionId, label, depth, index, masterRank, hasChildren, expanded, onToggle, onDrop }) {
        const row = document.createElement('div');
        row.className = `item-row sector-order-row sector-order-row-depth-${depth}`;
        row.draggable = true;
        row.addEventListener('dragstart', (e) => {
            draggedNode = { kind, id, sectionId };
            row.classList.add('sector-order-row-dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => {
            draggedNode = null;
            row.classList.remove('sector-order-row-dragging');
        });
        row.addEventListener('dragover', (e) => {
            if (!draggedNode || draggedNode.kind !== kind || draggedNode.sectionId !== sectionId || draggedNode.id === id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            row.classList.add('sector-order-row-drop-target');
        });
        row.addEventListener('dragleave', () => row.classList.remove('sector-order-row-drop-target'));
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            row.classList.remove('sector-order-row-drop-target');
            const dragged = draggedNode;
            draggedNode = null;
            if (!dragged || dragged.kind !== kind || dragged.sectionId !== sectionId || dragged.id === id) return;
            if (onDrop(dragged.id, id)) renderRows();
        });

        const main = document.createElement('div');
        main.className = 'item-main';
        const titleWrap = document.createElement('div');
        titleWrap.className = 'sector-order-name-cell';
        if (hasChildren) {
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'sector-order-toggle';
            toggleBtn.setAttribute('aria-expanded', String(!!expanded));
            toggleBtn.innerHTML = '<i class="bx bx-chevron-down" aria-hidden="true"></i>';
            toggleBtn.addEventListener('click', onToggle);
            titleWrap.appendChild(toggleBtn);
        }
        const titleEl = document.createElement('span');
        titleEl.className = 'item-title';
        titleEl.textContent = label;
        titleWrap.appendChild(titleEl);
        main.appendChild(titleWrap);
        const subEl = document.createElement('div');
        subEl.className = 'item-sub';
        subEl.innerHTML = `${t('admin.sectorOrderColMaster')}: <span class="sector-order-badge">${masterRank || '—'}</span>`;
        main.appendChild(subEl);
        row.appendChild(main);

        const customCell = document.createElement('div');
        customCell.className = 'sector-order-custom-cell';
        customCell.innerHTML = '<span class="sector-order-grip"><i class="bx bx-dots-vertical-rounded"></i><i class="bx bx-dots-vertical-rounded"></i></span>'
            + `<span class="sector-order-badge sector-order-badge-custom">${index + 1}</span>`;
        row.appendChild(customCell);

        if ((masterRank || 0) !== index + 1) {
            const tag = document.createElement('span');
            tag.className = 'sector-order-custom-tag';
            tag.textContent = t('admin.sectorOrderCustomTag');
            row.appendChild(tag);
        }
        return row;
    }

    function renderRows() {
        rowsWrap.innerHTML = '';
        const masterRank = new Map(masterOrder.map((id, i) => [id, i + 1]));
        customOrder.forEach((id, index) => {
            const expanded = expandedDepts.has(id);
            rowsWrap.appendChild(buildRow({
                kind: 'department',
                id,
                sectionId: null,
                label: labelById.get(id) || id,
                depth: 0,
                index,
                masterRank: masterRank.get(id),
                hasChildren: true,
                expanded,
                onToggle: () => {
                    if (expanded) expandedDepts.delete(id);
                    else expandedDepts.add(id);
                    renderRows();
                },
                onDrop: (draggedId, targetId) => reorderOrderListApp(customOrder, draggedId, targetId),
            }));
            if (!expanded) return;

            if (!areaCatalogsApp[id]) {
                const loadingRow = document.createElement('div');
                loadingRow.className = 'sector-order-area-loading';
                loadingRow.textContent = t('admin.loading') || '...';
                rowsWrap.appendChild(loadingRow);
                ensureAreaCatalogApp(id).then(() => { if (expandedDepts.has(id)) renderRows(); });
                return;
            }
            const areaCatalog = areaCatalogsApp[id];
            const areaLabelById = new Map(areaCatalog.map((a) => [a.id, a.label]));
            const areaMasterOrder = masterAreaOrders[id] || areaCatalog.map((a) => a.id);
            const areaMasterRank = new Map(areaMasterOrder.map((areaId, i) => [areaId, i + 1]));
            if (!customAreaOrders[id]) {
                const fromServer = areaOrdersFromServer[id];
                customAreaOrders[id] = (fromServer && fromServer.length) ? [...fromServer] : [...areaMasterOrder];
                areaCatalog.forEach((a) => { if (!customAreaOrders[id].includes(a.id)) customAreaOrders[id].push(a.id); });
            }
            customAreaOrders[id].forEach((areaId, areaIndex) => {
                rowsWrap.appendChild(buildRow({
                    kind: 'area',
                    id: areaId,
                    sectionId: id,
                    label: areaLabelById.get(areaId) || areaId,
                    depth: 1,
                    index: areaIndex,
                    masterRank: areaMasterRank.get(areaId),
                    hasChildren: false,
                    onDrop: (draggedId, targetId) => reorderOrderListApp(customAreaOrders[id], draggedId, targetId),
                }));
            });
        });
    }

    (async () => {
        try {
            const [catalog, res] = await Promise.all([
                ensureDepartmentCatalogApp(),
                fetch(apiUrl(`/api/admin/business-sectors/${sector.id}/department-order`), { credentials: 'include' }),
            ]);
            if (!res.ok) throw new Error('load failed');
            const data = await res.json();
            if (sectorSubView.mode !== 'order' || sectorSubView.sector.id !== sector.id) return;
            labelById = new Map(catalog.map((d) => [d.id, d.label]));
            masterOrder = data.masterOrder || [];
            customOrder = (data.customOrder && data.customOrder.length) ? [...data.customOrder] : [...masterOrder];
            catalog.forEach((d) => { if (!customOrder.includes(d.id)) customOrder.push(d.id); });
            masterAreaOrders = data.masterAreaOrders || {};
            areaOrdersFromServer = data.customAreaOrders || {};
            listEl.remove();
            contentEl.appendChild(rowsWrap);
            renderRows();
        } catch {
            listEl.textContent = t('admin.loadError');
        }
    })();

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'home-carga-new-btn';
    saveBtn.style.marginTop = '1rem';
    saveBtn.innerHTML = `<i class="bx bx-check" aria-hidden="true"></i><span>${t('admin.save')}</span>`;
    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        try {
            const res = await fetch(apiUrl(`/api/admin/business-sectors/${sector.id}/department-order`), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ customOrder, customAreaOrders }),
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
