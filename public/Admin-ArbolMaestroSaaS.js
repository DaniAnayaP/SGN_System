// ---------------------------------------------------------------------------
// "Árbol Maestro SaaS" -- GEIPSA-wide readiness status (Habilitado/
// Inhabilitado/Construcción/Mejoras + Web/App) for the SaaS team's OWN
// internal screens (Equipo SaaS, Nuestros Respaldos, Material de Apoyo),
// same idea as Árbol de Permisos Maestro but backed by its own table
// (saas_master_status) -- never touches master_permission_status, per
// explicit instruction. Flat, not a real tree: same reasoning
// Admin-EquipoSaaS.js's own comment gives for its own checkbox list --
// only 3 fixed rows, so a small purpose-built renderer is simpler than
// reusing PermissionTree.js's department/área/apartado/pantalla/columna
// machinery built for the much bigger client-side tree.
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
    { value: 'habilitado', labelKey: 'admin.masterTreeStatusHabilitado' },
    { value: 'inhabilitado', labelKey: 'admin.masterTreeStatusInhabilitado' },
    { value: 'construccion', labelKey: 'admin.masterTreeStatusConstruccion' },
    { value: 'mejoras', labelKey: 'admin.masterTreeStatusMejoras' },
];

// Kept in sync by hand with SAAS_MASTER_STATUS_ITEMS in db.js and
// SAAS_SCREEN_GRANT_PATHS in Dashboard.js -- the same flat itemId
// namespace every SaaS-scoped screen in this app already shares.
const ROWS = [
    { itemId: 'saas-team', labelKey: 'menu.saasTeam' },
    { itemId: 'saas-backups', labelKey: 'menu.ourBackups' },
    { itemId: 'saas-material-apoyo', labelKey: 'menu.ourSupportMaterial' },
];

const listEl = document.getElementById('saas-master-status-list');
const saveBtn = document.getElementById('saas-master-status-save');
const saveStatusEl = document.getElementById('saas-master-status-save-status');
const errorEl = document.getElementById('saas-master-status-error');

let statuses = [];

function getState(itemId) {
    return statuses.find((s) => s.itemId === itemId) || { itemId, status: 'habilitado', webEnabled: true, appEnabled: false };
}
function setState(itemId, next) {
    statuses = statuses.filter((s) => s.itemId !== itemId);
    statuses.push({ itemId, ...next });
}

function buildRow(row) {
    const state = getState(row.itemId);
    const wrap = document.createElement('div');
    wrap.className = 'perm-tree-row saas-master-status-row';

    const label = document.createElement('span');
    label.className = 'perm-tree-mstatus-label';
    label.textContent = Dashboard.t(row.labelKey);
    wrap.appendChild(label);

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

    // Same monitor/phone silhouette markup as buildPlatformCheckbox in
    // PermissionTree.js (devicePathFor) -- kept as a literal copy rather
    // than importing that closure, which is private to PermissionTree.js's
    // own create() and not exposed for reuse.
    const DEVICE_PATHS = {
        web: '<rect x="2" y="4" width="20" height="13" rx="1.5"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="17" x2="12" y2="20"/>',
        app: '<rect x="6" y="2" width="12" height="20" rx="2.5"/>',
    };
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
        box.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DEVICE_PATHS[platform]}</svg>`;
        device.append(input, box);
        badge.append(tag, device);
        controls.appendChild(badge);
    });

    wrap.appendChild(controls);
    return wrap;
}

function renderList() {
    listEl.innerHTML = '';
    ROWS.forEach((row) => listEl.appendChild(buildRow(row)));
}

async function load() {
    try {
        const res = await fetch('/api/admin/saas-master-status', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        statuses = data.statuses || [];
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
        const res = await fetch('/api/admin/saas-master-status', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ statuses }),
        });
        if (!res.ok) throw new Error('save failed');
        const data = await res.json();
        statuses = data.statuses || [];
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
