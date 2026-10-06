// ---------------------------------------------------------------------------
// Roles (App) — list of this client's Puestos de Trabajo (job_positions),
// tap one to open the SAME PermissionTree.js checkbox tree Business-Roles.js
// uses on the desktop, full edit (not read-only) as requested. Reusing the
// shared component instead of rebuilding a mobile-only tree keeps this in
// lockstep with every future change to that component, at the cost of one
// small shim below: PermissionTree.js calls window.Dashboard.t(key, params)
// for every single label it renders (it has no other Dashboard.js
// dependency — checked), and this App shell has its own lighter i18n loader
// instead of loading the full desktop Dashboard.js. Admin.css (loaded in
// AppRoles.html) supplies every .perm-tree-* rule the tree needs to render
// correctly; none of its selectors are bare tags, so it doesn't bleed into
// this page's own AppInicio.css-styled header/list.
// ---------------------------------------------------------------------------

const SUPPORTED_LANGS = ['en', 'es'];
const DEFAULT_LANG = 'en';
let dict = {};

function t(key, params = {}) {
    const value = key.split('.').reduce((obj, part) => obj?.[part], dict);
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}
// PermissionTree.js's only Dashboard.js dependency -- see header note above.
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

// --- Estilo (theme) — same mechanism as every other App page. --------------
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
function getStoredStyle() {
    const stored = localStorage.getItem('style');
    return ['light', 'dark', 'institutional', 'futuristic'].includes(stored) ? stored : 'light';
}
function applyStyle(style) {
    document.body.classList.remove('institutional-mode', 'dark-mode', 'futuristic-mode');
    INSTITUTIONAL_THEME_PROPS.forEach((prop) => document.body.style.removeProperty(prop));
    if (style === 'institutional') { document.body.classList.add('institutional-mode'); applyInstitutionalTheme(); }
    else if (style === 'dark') document.body.classList.add('dark-mode');
    else if (style === 'futuristic') document.body.classList.add('futuristic-mode');
}
async function loadBrandingForTheme() {
    try {
        const res = await fetch(apiUrl('/api/business/branding'), { credentials: 'include' });
        if (!res.ok) return;
        const { branding } = await res.json();
        clientColorPalette = branding.colorPalette || null;
        clientPrimaryColor = branding.primaryColor || null;
        if (getStoredStyle() === 'institutional') applyInstitutionalTheme();
    } catch {
        // Falls back to the static per-theme CSS already applied.
    }
}

// --- App state -----------------------------------------------------------
let jobPositions = [];
let allowedSectionIds = null;
let costCenters = [];
let selectedJobPositionId = null;
let tree = null;
let view = 'list'; // 'list' | 'tree'

async function loadJobPositions() {
    try {
        const res = await fetch(apiUrl('/api/business/job-positions'), { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        jobPositions = data.jobPositions || [];
    } catch {
        jobPositions = [];
    }
}
async function loadAllowedSectionIds() {
    try {
        const res = await fetch(apiUrl('/api/business/contracted-modules'), { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        allowedSectionIds = data.moduleKeys || [];
    } catch {
        allowedSectionIds = [];
    }
}
async function loadCostCentersForTree() {
    try {
        const res = await fetch(apiUrl('/api/business/cost-centers'), { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        costCenters = data.costCenters || [];
    } catch {
        costCenters = [];
    }
}

// --- Límites al dar permisos ---------------------------------------------------
// Lo que no se puede dar (fuera del plan y los adicionales de la empresa, o en un Estatus que quien edita no ve) sale con candado en el árbol, igual que en
// Roles de escritorio. Es la MISMA regla que Dashboard.buildGrantLimits y que clampNewGrantsToLimits (db.js) aplica al guardar: si cambia una, cambian las
// tres. Esta página no carga Dashboard.js, así que el Estatus se resuelve aquí con el perfil del negocio. Sin conexión (o si algo falla) no hay candados en
// pantalla; el servidor igual quita lo que no cabe y avisa.
const GRANT_COLUMN_LEVEL_SUFFIX = /\/(solo-ver|ver-y-operar|editar|autorizar|eliminar)$/;
function buildAppGrantLimits(contractGrants, visibleStatuses, statusOverrides) {
    const keyOf = (s, i, sub) => `${s}::${i || ''}::${sub || ''}`;
    const contract = Array.isArray(contractGrants) ? contractGrants : null;
    const rawSet = contract ? new Set(contract.map((g) => keyOf(g.sectionId, g.itemId, g.submenuId))) : null;
    const covered = (s, i, sub) => rawSet.has(keyOf(s, i, sub)) || (!!i && rawSet.has(keyOf(s, i, null))) || rawSet.has(keyOf(s, null, null));
    const visible = new Set(visibleStatuses && visibleStatuses.length ? visibleStatuses : ['habilitado']);
    const overrides = new Map((statusOverrides || []).map((r) => [keyOf(r.sectionId, r.itemId, r.submenuId), r.status]));
    function nodeStatus(sectionId, itemId, submenuId) {
        if (!overrides.size) return 'habilitado';
        const dept = overrides.get(keyOf(sectionId, null, null));
        if (dept) return dept;
        if (itemId) {
            const item = overrides.get(keyOf(sectionId, itemId, null));
            if (item) return item;
        }
        if (submenuId) {
            const parts = String(submenuId).split('/');
            for (let i = 1; i <= parts.length; i += 1) {
                const partial = overrides.get(keyOf(sectionId, itemId, parts.slice(0, i).join('/')));
                if (partial) return partial;
            }
        }
        return 'habilitado';
    }
    return {
        reason(sectionId, itemId, submenuId) {
            if (!visible.has(nodeStatus(sectionId, itemId, submenuId))) return 'status';
            if (!rawSet || sectionId === 'main' || !submenuId) return null;
            if (itemId === 'cc-list' || String(submenuId).startsWith('cc-')) return null;
            const base = String(submenuId).replace(/#app$/, '');
            const contractKey = GRANT_COLUMN_LEVEL_SUFFIX.test(base) ? base.replace(GRANT_COLUMN_LEVEL_SUFFIX, '/solo-ver') : base;
            return covered(sectionId, itemId, contractKey) ? null : 'contract';
        },
    };
}
let grantLimits = null;
async function loadGrantLimits() {
    try {
        const [profileRes, contractRes] = await Promise.all([
            fetch(apiUrl('/api/me/business-profile'), { credentials: 'include' }),
            fetch(apiUrl('/api/business/contract-grants'), { credentials: 'include' }),
        ]);
        if (!profileRes.ok) throw new Error('no profile');
        const { profile } = await profileRes.json();
        const contract = contractRes.ok ? (await contractRes.json()).contractGrants : null;
        grantLimits = buildAppGrantLimits(contract, profile.visibleStatuses, profile.masterStatusOverrides);
    } catch {
        grantLimits = null;
    }
}

// --- Rendering -------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');

function render() {
    bodyEl.innerHTML = '';
    if (view === 'list') renderListView();
    else renderTreeView();
}

function renderListView() {
    titleEl.textContent = t('menu.roles');

    if (!jobPositions.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('business.noJobPositionsForRoles');
        bodyEl.appendChild(empty);
        return;
    }
    jobPositions.forEach((jp) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        const statusLabel = t(jp.status === 'inactive' ? 'main.filterInactive' : 'main.filterActive');
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx bx-shield" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label"><p>${jp.name}</p><span>${jp.abbreviation || ''}${jp.abbreviation ? ' · ' : ''}${statusLabel}</span></span>
            <i class="bx bx-chevron-right" aria-hidden="true"></i>
        `;
        row.addEventListener('click', () => openJobPositionTree(jp));
        bodyEl.appendChild(row);
    });
}

async function openJobPositionTree(jp) {
    selectedJobPositionId = jp.id;
    view = 'tree';
    titleEl.textContent = jp.name;
    bodyEl.innerHTML = '';

    const hint = document.createElement('p');
    hint.className = 'home-carga-progress-label';
    hint.hidden = false;
    hint.style.margin = '0 0 0.6rem';
    hint.textContent = t('admin.loading') || '...';
    bodyEl.appendChild(hint);

    try {
        const res = await fetch(apiUrl(`/api/business/job-positions/${jp.id}/grants`), { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        bodyEl.innerHTML = '';

        const treeContainer = document.createElement('div');
        bodyEl.appendChild(treeContainer);
        const order = await fetch(apiUrl(`/api/business/permission-order?level=perfil&entityId=${jp.id}`), { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const classOverrides = await fetch(apiUrl(`/api/business/permission-classifications?level=perfil&entityId=${jp.id}`), { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => (d && d.overrides) || null).catch(() => null);
        tree = window.PermissionTree.create(treeContainer, { allowedSectionIds, costCenters, showAppTab: true, order, classOverrides, grantLimits });
        await tree.init(data.grants || []);

        const equalizeBtn = document.createElement('button');
        equalizeBtn.type = 'button';
        equalizeBtn.className = 'home-carga-secondary-btn';
        equalizeBtn.style.marginTop = '1rem';
        equalizeBtn.setAttribute('data-help-key', 'roleEqualizeAllAppWeb');
        equalizeBtn.innerHTML = `<i class="bx bx-copy" aria-hidden="true"></i><span>${t('main.appEqualizeAll')}</span>`;
        equalizeBtn.addEventListener('click', () => tree?.equalizeAllAppToWeb());
        bodyEl.appendChild(equalizeBtn);

        const fillMissingBtn = document.createElement('button');
        fillMissingBtn.type = 'button';
        fillMissingBtn.className = 'home-carga-secondary-btn';
        fillMissingBtn.style.marginTop = '1rem';
        fillMissingBtn.setAttribute('data-help-key', 'roleFillMissingAppWeb');
        fillMissingBtn.innerHTML = `<i class="bx bx-list-plus" aria-hidden="true"></i><span>${t('main.appFillMissingAll')}</span>`;
        fillMissingBtn.addEventListener('click', () => tree?.fillAllMissingAppToWeb());
        bodyEl.appendChild(fillMissingBtn);

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'home-carga-new-btn';
        saveBtn.innerHTML = `<i class="bx bx-check" aria-hidden="true"></i><span>${t('admin.save')}</span>`;
        saveBtn.addEventListener('click', () => saveJobPositionGrants(saveBtn));
        bodyEl.appendChild(saveBtn);
    } catch {
        bodyEl.innerHTML = '';
        const error = document.createElement('p');
        error.className = 'home-carga-empty-note';
        error.textContent = t('admin.loadError');
        bodyEl.appendChild(error);
    }
}

// See AppCargaCombustible.js's own patchRecord for the reference write-up
// of the offline-queue pattern (AppOfflineSync.js). No per-field records to
// optimistically merge here -- the tree widget already holds its own
// edited state independent of server confirmation, so a queued save just
// needs to say so instead of erroring out.
async function saveJobPositionGrants(saveBtn) {
    if (!selectedJobPositionId || !tree) return;
    saveBtn.disabled = true;
    const jp = jobPositions.find((p) => p.id === selectedJobPositionId);
    try {
        const result = await window.SgnOfflineSync.offlineAwareFetch(
            `/api/business/job-positions/${selectedJobPositionId}/grants`,
            { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ grants: tree.getGrants() }) },
            `${t('menu.roles')} · ${jp?.name || ''}`, `roles:${selectedJobPositionId}`,
        );
        if (result.queued) {
            showToast(t('home.cargaSavedOffline'));
        } else if (!result.ok) {
            const body = result.body || {};
            showToast(body.code === 'module-not-contracted' ? t('admin.limitModuleNotContracted', { department: body.labelKey ? t(body.labelKey) : body.sectionId }) : t('admin.saveError'));
        } else {
            const dropped = (result.body && result.body.dropped) || null;
            showToast(dropped && dropped.count ? `${t('main.changeSaved')} · ${t('admin.limitDroppedNotice', { count: dropped.count })}` : t('main.changeSaved'));
        }
    } catch {
        showToast(t('admin.saveError'));
    } finally {
        saveBtn.disabled = false;
    }
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') {
        window.location.href = 'AppInicio.html';
        return;
    }
    selectedJobPositionId = null;
    tree = null;
    view = 'list';
    render();
});

(async function init() {
    await loadLanguage();
    window.HelpMode?.init(t);
    try {
        const meRes = await fetch(apiUrl('/api/me'), { credentials: 'include' });
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        await Promise.all([loadJobPositions(), loadAllowedSectionIds(), loadCostCentersForTree(), loadBrandingForTheme(), loadGrantLimits()]);
        applyStyle(getStoredStyle());
        render();
    } catch (err) {
        console.error('Roles (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
