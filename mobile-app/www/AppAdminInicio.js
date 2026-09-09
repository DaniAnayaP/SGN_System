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
// PermissionTree.js's only Dashboard.js dependency -- see AppRoles.js for
// the same shim.
window.Dashboard = { t };

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
    updateBreadcrumb();
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
const SECTIONS = [
    { id: 'tree', breadcrumbKey: 'menu.masterPermissionsTree' },
    { id: 'sectors', breadcrumbKey: 'menu.businessSectorsAbbr1' },
    { id: 'plans', breadcrumbKey: 'menu.plansRegistered' },
    { id: 'clients', breadcrumbKey: 'menu.clientesRegistrados' },
    { id: 'holdings', breadcrumbKey: 'menu.holdingsTitle' },
];
let activeSection = 'tree';
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

function renderSection(id) {
    activeSection = id;
    renderToken += 1;
    document.querySelectorAll('.home-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.section === id));
    updateBreadcrumb();
    if (id === 'tree') loadMasterTree(renderToken);
    else renderComingSoon();
}
document.querySelectorAll('.home-tab').forEach((tab) => {
    tab.addEventListener('click', () => renderSection(tab.dataset.section));
});

// --- Árbol de Permisos Maestro -- same load/describe-changes/confirm/save
// flow as public/Admin-ArbolMaestro.js, ported to this App's own bottom-
// sheet confirm dialog instead of a desktop modal. --------------------------
let masterTree = null;
let originalStatuses = [];

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
function openConfirmSheet(changes, onConfirm) {
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
    confirmOverlay.hidden = false;
    confirmSaveBtn.onclick = async () => {
        confirmOverlay.hidden = true;
        await onConfirm();
    };
}
confirmCancelBtn.addEventListener('click', () => { confirmOverlay.hidden = true; });
confirmOverlay.addEventListener('click', (event) => { if (event.target === confirmOverlay) confirmOverlay.hidden = true; });

async function saveMasterTree(saveBtn) {
    saveBtn.disabled = true;
    try {
        const res = await fetch(apiUrl('/api/admin/master-permission-status'), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ statuses: masterTree.getStatuses() }),
        });
        if (!res.ok) throw new Error('save failed');
        const data = await res.json();
        originalStatuses = data.statuses || [];
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
        const res = await fetch(apiUrl('/api/admin/master-permission-status'), { credentials: 'include' });
        if (token !== renderToken) return; // switched tabs while this was in flight
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (token !== renderToken) return;
        originalStatuses = data.statuses || [];
        contentEl.innerHTML = '';

        const treeWrap = document.createElement('div');
        // .perm-tree is the class Admin.css's own base rules key off of
        // (max-height/scroll/border) -- Admin-ArbolMaestro.html hardcodes it
        // directly in its static markup, so PermissionTree.js never adds it
        // itself; this container needs it too. .admin-master-tree is this
        // page's own scoping hook (see AppAdminInicio.css).
        treeWrap.className = 'admin-master-tree perm-tree';
        contentEl.appendChild(treeWrap);
        masterTree = window.PermissionTree.create(treeWrap, { statusMode: true });
        await masterTree.init(originalStatuses);
        if (token !== renderToken) return; // switched away while menu.json/tree rows were still loading

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'home-carga-new-btn admin-tree-save-btn';
        saveBtn.innerHTML = `<i class="bx bx-check" aria-hidden="true"></i><span>${t('admin.save')}</span>`;
        saveBtn.addEventListener('click', () => {
            if (!masterTree) return;
            const changes = describeChanges();
            if (!changes.length) {
                showToast(t('admin.masterTreeNoChanges'));
                return;
            }
            openConfirmSheet(changes, () => saveMasterTree(saveBtn));
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
        renderSection('tree');
    } catch (err) {
        console.error('Panel Admin failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
