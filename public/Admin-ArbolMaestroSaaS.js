// ---------------------------------------------------------------------------
// "Árbol Maestro SaaS" -- GEIPSA-wide readiness status (Habilitado/
// Inhabilitado/Construcción/Mejoras + Web/App) for the SaaS team's OWN
// internal screens (Equipo SaaS, Nuestros Respaldos, Material de Apoyo),
// same idea as Árbol de Permisos Maestro but backed by its own tables
// (saas_master_status/saas_master_order) -- never touches
// master_permission_status/master_permission_order, per explicit
// instruction. Visually matches Árbol de Permisos Maestro's own row
// (drag handle, count badge, rollup, Navegar) even though the underlying
// renderer is its own small purpose-built one, not PermissionTree.js --
// same reasoning Admin-EquipoSaaS.js's own checkbox list gives for that:
// only 3 fixed rows, no real menu.json-driven depth to justify reusing
// the much bigger client-side tree's machinery.
//
// One deliberate departure from the client tree: its own "Navegar" opens
// a Vista Previa modal (still a placeholder everywhere else in this app).
// These 3 SaaS screens already exist and work, so Navegar here does a
// real navigation to the actual page instead of a fake preview.
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
    { value: 'habilitado', labelKey: 'admin.masterTreeStatusHabilitado' },
    { value: 'inhabilitado', labelKey: 'admin.masterTreeStatusInhabilitado' },
    { value: 'construccion', labelKey: 'admin.masterTreeStatusConstruccion' },
    { value: 'mejoras', labelKey: 'admin.masterTreeStatusMejoras' },
];

// Kept in sync by hand with SAAS_MASTER_STATUS_ITEMS in db.js and
// SAAS_SCREEN_GRANT_PATHS in Dashboard.js -- the same flat itemId
// namespace every SaaS-scoped screen in this app already shares. href is
// this new tree's own addition (Navegar) -- not part of that shared
// namespace, just where each row actually lives.
const ROWS = [
    { itemId: 'saas-team', labelKey: 'menu.saasTeam', href: 'Admin-EquipoSaaS.html' },
    { itemId: 'saas-backups', labelKey: 'menu.ourBackups', href: 'Admin-NuestrosRespaldos.html' },
    { itemId: 'saas-material-apoyo', labelKey: 'menu.ourSupportMaterial', href: 'Admin-MaterialApoyo.html' },
];

const DEVICE_PATHS = {
    web: '<rect x="2" y="4" width="20" height="13" rx="1.5"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="17" x2="12" y2="20"/>',
    app: '<rect x="6" y="2" width="12" height="20" rx="2.5"/>',
};
const DEVICE_MARKS = {
    full: { web: '<path d="M6 10l3 3 6-6"/>', app: '<path d="M9 12.5l2 2 4-5"/>' },
    partial: { web: '<line x1="7" y1="10.5" x2="15" y2="10.5"/>', app: '<line x1="8" y1="12" x2="16" y2="12"/>' },
    empty: { web: '', app: '' },
};
function deviceIconSvg(platform, mark) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DEVICE_PATHS[platform]}${mark || ''}</svg>`;
}

const listEl = document.getElementById('saas-master-status-list');
const saveBtn = document.getElementById('saas-master-status-save');
const errorEl = document.getElementById('saas-master-status-error');

let statuses = [];
let order = ROWS.map((r) => r.itemId);
let draggedId = null;

function getState(itemId) {
    return statuses.find((s) => s.itemId === itemId) || { itemId, status: 'habilitado', webEnabled: true, appEnabled: false };
}
function setState(itemId, next) {
    statuses = statuses.filter((s) => s.itemId !== itemId);
    statuses.push({ itemId, ...next });
}
function orderedRows() {
    return order.map((id) => ROWS.find((r) => r.itemId === id)).filter(Boolean);
}

// "General" -- the tree's own root/summary row, same relationship to the
// 3 real rows that Árbol Maestro's own "General" row has to every
// Departamento under it: a read-only rollup, never individually settable.
function buildGeneralRow() {
    const row = document.createElement('div');
    row.className = 'perm-tree-row saas-master-status-row saas-master-status-row-general';

    const label = document.createElement('span');
    label.className = 'perm-tree-mstatus-label';
    label.textContent = Dashboard.t('admin.saasMasterTreeGeneral');
    row.appendChild(label);

    const countBadge = document.createElement('span');
    countBadge.className = 'perm-tree-mstatus-count-badge';
    countBadge.textContent = String(ROWS.length);
    row.appendChild(countBadge);

    const controls = document.createElement('div');
    controls.className = 'perm-tree-mstatus-controls';
    ['web', 'app'].forEach((platform) => {
        const onCount = ROWS.filter((r) => {
            const s = getState(r.itemId);
            return platform === 'web' ? s.webEnabled : s.appEnabled;
        }).length;
        const state = onCount === 0 ? 'empty' : (onCount === ROWS.length ? 'full' : 'partial');
        const icon = document.createElement('span');
        icon.className = `perm-tree-mstatus-rollup-icon perm-tree-mstatus-rollup-${state}`;
        icon.title = Dashboard.t(platform === 'web' ? 'admin.masterTreePlatformWeb' : 'admin.masterTreePlatformApp');
        icon.innerHTML = deviceIconSvg(platform, DEVICE_MARKS[state][platform]);
        controls.appendChild(icon);
    });
    row.appendChild(controls);
    return row;
}

function buildRow(row) {
    const state = getState(row.itemId);
    const wrap = document.createElement('div');
    wrap.className = 'perm-tree-row saas-master-status-row perm-tree-row-draggable';
    wrap.draggable = true;

    const grip = document.createElement('span');
    grip.className = 'perm-tree-drag-handle';
    grip.setAttribute('aria-hidden', 'true');
    grip.innerHTML = '<i class="bx bx-dots-vertical-rounded"></i><i class="bx bx-dots-vertical-rounded"></i>';
    wrap.appendChild(grip);

    wrap.addEventListener('dragstart', () => {
        draggedId = row.itemId;
        wrap.classList.add('perm-tree-row-dragging');
    });
    wrap.addEventListener('dragend', () => {
        draggedId = null;
        wrap.classList.remove('perm-tree-row-dragging');
    });
    wrap.addEventListener('dragover', (e) => {
        if (!draggedId || draggedId === row.itemId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        wrap.classList.add('perm-tree-row-drop-target');
    });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('perm-tree-row-drop-target'));
    wrap.addEventListener('drop', (e) => {
        e.preventDefault();
        wrap.classList.remove('perm-tree-row-drop-target');
        const fromId = draggedId;
        draggedId = null;
        if (!fromId || fromId === row.itemId) return;
        const next = order.filter((id) => id !== fromId);
        next.splice(next.indexOf(row.itemId), 0, fromId);
        order = next;
        renderList();
    });

    const label = document.createElement('span');
    label.className = 'perm-tree-mstatus-label';
    label.textContent = Dashboard.t(row.labelKey);
    wrap.appendChild(label);

    // Floors at 1 (this row itself) -- same convention Árbol Maestro's own
    // count badge uses for a true leaf with nothing nested under it.
    const countBadge = document.createElement('span');
    countBadge.className = 'perm-tree-mstatus-count-badge';
    countBadge.textContent = '1';
    wrap.appendChild(countBadge);

    const controls = document.createElement('div');
    controls.className = 'perm-tree-mstatus-controls';

    const select = document.createElement('select');
    select.className = `perm-tree-mstatus-select perm-tree-mstatus-select-${state.status}`;
    STATUS_OPTIONS.forEach((opt) => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.value;
        optionEl.textContent = Dashboard.t(opt.labelKey);
        select.appendChild(optionEl);
    });
    select.value = state.status;
    select.addEventListener('change', () => {
        setState(row.itemId, { ...getState(row.itemId), status: select.value });
        select.className = `perm-tree-mstatus-select perm-tree-mstatus-select-${select.value}`;
    });
    controls.appendChild(select);

    ['web', 'app'].forEach((platform) => {
        const badge = document.createElement('label');
        badge.className = `perm-tree-mstatus-badge perm-tree-mstatus-badge-${platform}`;
        const tag = document.createElement('span');
        tag.className = 'perm-tree-mstatus-platform';
        tag.textContent = Dashboard.t(platform === 'web' ? 'admin.masterTreePlatformWeb' : 'admin.masterTreePlatformApp');
        const device = document.createElement('span');
        device.className = 'perm-tree-mstatus-device';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = platform === 'web' ? state.webEnabled : state.appEnabled;
        // App can't be on unless Web is -- same default (webEnabled true,
        // appEnabled false) master_permission_status's own DDL comment
        // documents for the client-facing tree.
        input.disabled = platform === 'app' && !getState(row.itemId).webEnabled;
        input.addEventListener('change', () => {
            const current = getState(row.itemId);
            const next = { ...current };
            if (platform === 'web') {
                next.webEnabled = input.checked;
                if (!input.checked) next.appEnabled = false;
            } else {
                next.appEnabled = input.checked;
            }
            setState(row.itemId, next);
            renderList();
        });
        const box = document.createElement('span');
        box.className = 'perm-tree-mstatus-device-box';
        box.innerHTML = deviceIconSvg(platform, '');
        device.append(input, box);
        badge.append(tag, device);
        controls.appendChild(badge);
    });

    const navigateCell = document.createElement('div');
    navigateCell.className = 'perm-tree-mstatus-navigate-cell';
    const navigateBtn = document.createElement('button');
    navigateBtn.type = 'button';
    navigateBtn.className = 'perm-tree-mstatus-nest-btn';
    navigateBtn.title = Dashboard.t('admin.masterTreeColNavigate');
    navigateBtn.setAttribute('aria-label', Dashboard.t('admin.masterTreeColNavigate'));
    navigateBtn.innerHTML = '<i class="bx bx-compass" aria-hidden="true"></i>';
    navigateBtn.addEventListener('click', () => { window.location.href = row.href; });
    navigateCell.appendChild(navigateBtn);
    controls.appendChild(navigateCell);

    wrap.appendChild(controls);
    return wrap;
}

function renderList() {
    listEl.innerHTML = '';
    listEl.appendChild(buildGeneralRow());
    orderedRows().forEach((row) => listEl.appendChild(buildRow(row)));
}

async function load() {
    try {
        const [statusRes, orderRes] = await Promise.all([
            fetch('/api/admin/saas-master-status', { credentials: 'include' }),
            fetch('/api/admin/saas-master-order', { credentials: 'include' }),
        ]);
        if (!statusRes.ok || !orderRes.ok) throw new Error('load failed');
        const statusData = await statusRes.json();
        const orderData = await orderRes.json();
        statuses = statusData.statuses || [];
        const saved = (orderData.order || []).filter((id) => ROWS.some((r) => r.itemId === id));
        const rest = ROWS.map((r) => r.itemId).filter((id) => !saved.includes(id));
        order = [...saved, ...rest];
        renderList();
    } catch {
        errorEl.textContent = Dashboard.t('admin.loadError');
        errorEl.hidden = false;
    }
}

saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    errorEl.hidden = true;
    try {
        const [statusRes, orderRes] = await Promise.all([
            fetch('/api/admin/saas-master-status', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ statuses }),
            }),
            fetch('/api/admin/saas-master-order', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ order }),
            }),
        ]);
        if (!statusRes.ok || !orderRes.ok) throw new Error('save failed');
        const statusData = await statusRes.json();
        statuses = statusData.statuses || [];
        renderList();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        errorEl.textContent = Dashboard.t('admin.saveError');
        errorEl.hidden = false;
    } finally {
        saveBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', renderList);

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-saas-master-status' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        await load();
    } catch (err) {
        console.error('Admin (Árbol Maestro SaaS) failed to initialize:', err);
    }
})();
