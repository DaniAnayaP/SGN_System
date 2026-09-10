// ---------------------------------------------------------------------------
// "Árbol de Permisos Maestro" — the GEIPSA-wide readiness status of every
// node in the ENTIRE system (every Departamento/Área/Apartado/Pantalla/
// Columna that could ever exist), independent of any one Giro de Negocio,
// Plan or client (see master_permission_status in db.js). Unlike Nuestros
// Sectores de Negocio / Nuestros Planes, there's exactly ONE of these trees
// -- no table of records, no per-row modal -- so the page body is just the
// tree itself, rendered directly, plus a Save button. Shell (sidebar, i18n,
// settings, logout) comes from Dashboard.js.
//
// A change here affects every Giro/Plan/client downstream at once, so
// "Guardar" never writes directly -- it opens a "pantalla alterna" summarizing
// exactly what's about to change (confirmed with the user), and only the
// PUT itself, once confirmed, shows the usual success/error toast.
// ---------------------------------------------------------------------------

const masterTreeContainer = document.getElementById('master-tree-container');
const masterTreeError = document.getElementById('master-tree-error');
const masterTreeSaveBtn = document.getElementById('master-tree-save');

let masterTree = null;
// Snapshot from the last successful load/save -- the baseline
// describeChanges() diffs the tree's current in-memory state against.
let originalStatuses = [];
// Same idea, Departamento order (see getDepartmentOrder in
// PermissionTree.js / master_permission_order in db.js) -- a separate
// table from statuses, saved together on the same Guardar click.
let originalDepartmentOrder = [];
// Same idea one level down -- each department's own Área order, keyed by
// sectionId (see getAreaOrders in PermissionTree.js).
let originalAreaOrders = {};
// One level deeper still -- each área's own Apartado order, keyed by
// "sectionId::areaId" (see getApartadoOrders in PermissionTree.js).
let originalApartadoOrders = {};

function statusRowKey(row) {
    return `${row.sectionId}::${row.itemId || ''}::${row.submenuId || ''}`;
}
const DEFAULT_ROW = { status: 'habilitado', webEnabled: true, appEnabled: false };

// Every node the tree currently reports as non-default, compared against
// the snapshot from the last load/save -- a node missing from one side is
// treated as fully default there, same convention the tree/server already
// use to keep the override table small.
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

// One { label, line } entry per order that actually changed since the last
// load/save -- Departamento (if it moved) plus one entry per department
// whose OWN Área order moved. getStatusLabel resolves any node key back to
// its i18n-translated label (see statusRow's statusLabelMap); a depth-0
// key (sectionId, null, null) names a Departamento, a depth-1 key
// (sectionId, areaId, null) names one of its Áreas -- no separate lookup
// needed for either.
function collectOrderChanges() {
    if (!masterTree) return [];
    const items = [];
    if (departmentOrderChanged()) {
        const names = masterTree.getDepartmentOrder().map((id) => masterTree.getStatusLabel(id, null, null) || id);
        items.push({
            label: Dashboard.t('admin.masterTreeOrderLabel'),
            line: Dashboard.t('admin.masterTreeOrderChangeLine', { order: names.join(' → ') }),
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
            label: Dashboard.t('admin.masterTreeAreaOrderLabel', { department: deptName }),
            line: Dashboard.t('admin.masterTreeOrderChangeLine', { order: names.join(' → ') }),
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
            label: Dashboard.t('admin.masterTreeApartadoOrderLabel', { area: areaName }),
            line: Dashboard.t('admin.masterTreeOrderChangeLine', { order: names.join(' → ') }),
        });
    });
    return items;
}

function statusLabel(status) {
    return Dashboard.t(`admin.masterTreeStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`);
}
function boolLabel(value) {
    return Dashboard.t(value ? 'admin.masterTreeOn' : 'admin.masterTreeOff');
}

// One line per changed field, skipping whichever of the 3 didn't move --
// most edits only touch one of them, and showing all 3 every time would
// bury the actual change in noise.
function describeChangeLines(change) {
    const lines = [];
    if (change.before.status !== change.after.status) {
        lines.push(`${Dashboard.t('admin.masterTreeChangeStatus')}: ${statusLabel(change.before.status)} → ${statusLabel(change.after.status)}`);
    }
    if (change.before.webEnabled !== change.after.webEnabled) {
        lines.push(`${Dashboard.t('admin.masterTreePlatformWeb')}: ${boolLabel(change.before.webEnabled)} → ${boolLabel(change.after.webEnabled)}`);
    }
    if (change.before.appEnabled !== change.after.appEnabled) {
        lines.push(`${Dashboard.t('admin.masterTreePlatformApp')}: ${boolLabel(change.before.appEnabled)} → ${boolLabel(change.after.appEnabled)}`);
    }
    return lines;
}

// "Pantalla alterna" -- confirmed with the user: a change here affects
// every Giro/Plan/client downstream, so it never saves directly from the
// tree's own Guardar button. Built fresh each time (not static markup)
// since its content is entirely the diff computed above.
function openConfirmModal(changes, orderChanges, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.style.maxWidth = '38rem';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.innerHTML = `
        <h3>${Dashboard.t('admin.masterTreeConfirmTitle')}</h3>
        <p class="admin-hint">${Dashboard.t('admin.masterTreeConfirmHint')}</p>
        <div class="master-tree-confirm-list"></div>
        <div class="admin-form-actions">
            <button type="button" class="btn" id="master-tree-confirm-save">${Dashboard.t('admin.save')}</button>
            <button type="button" class="btn btn-secondary" id="master-tree-confirm-cancel">${Dashboard.t('admin.cancel')}</button>
        </div>
    `;
    const list = panel.querySelector('.master-tree-confirm-list');
    changes.forEach((change) => {
        const row = document.createElement('div');
        row.className = 'master-tree-confirm-row';
        const nameEl = document.createElement('div');
        nameEl.className = 'master-tree-confirm-name';
        // change.label comes from menu.json's own labelKeys (t()-resolved),
        // never free text someone typed -- textContent is just the
        // established convention here regardless.
        nameEl.textContent = change.label;
        row.appendChild(nameEl);
        describeChangeLines(change).forEach((line) => {
            const lineEl = document.createElement('div');
            lineEl.className = 'master-tree-confirm-line';
            lineEl.textContent = line;
            row.appendChild(lineEl);
        });
        list.appendChild(row);
    });
    orderChanges.forEach((change) => {
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
        list.appendChild(row);
    });
    document.body.appendChild(overlay);
    overlay.appendChild(panel);
    function close() { overlay.remove(); }
    panel.querySelector('#master-tree-confirm-cancel').addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    panel.querySelector('#master-tree-confirm-save').addEventListener('click', async () => {
        close();
        await onConfirm();
    });
}

async function loadMasterTree() {
    masterTreeError.hidden = true;
    masterTreeContainer.innerHTML = '';
    try {
        const [statusRes, orderRes] = await Promise.all([
            fetch('/api/admin/master-permission-status', { credentials: 'include' }),
            fetch('/api/admin/master-permission-order', { credentials: 'include' }),
        ]);
        if (!statusRes.ok || !orderRes.ok) throw new Error('load failed');
        const [statusData, orderData] = await Promise.all([statusRes.json(), orderRes.json()]);
        originalStatuses = statusData.statuses || [];
        masterTree = window.PermissionTree.create(masterTreeContainer, {
            statusMode: true,
            departmentOrder: orderData.departmentOrder || [],
            areaOrder: orderData.areaOrders || {},
            apartadoOrder: orderData.apartadoOrders || {},
        });
        await masterTree.init(originalStatuses);
        // The baseline is what the tree actually ends up SHOWING, not the
        // raw (possibly empty) server response -- when nothing has ever
        // been saved, the tree still renders menu.json's own natural order,
        // and that's what "unchanged" has to mean. Comparing against the
        // raw empty response instead would falsely flag every department/
        // área/apartado as "reordered" the very first time anyone hits
        // Guardar, purely because the snapshot started empty while the
        // tree was never empty -- confirmed live before this fix.
        originalDepartmentOrder = masterTree.getDepartmentOrder();
        originalAreaOrders = masterTree.getAreaOrders();
        originalApartadoOrders = masterTree.getApartadoOrders();
    } catch {
        masterTreeError.textContent = Dashboard.t('admin.loadError');
        masterTreeError.hidden = false;
    }
}

async function saveMasterTree() {
    masterTreeSaveBtn.disabled = true;
    try {
        const [statusRes, orderRes] = await Promise.all([
            fetch('/api/admin/master-permission-status', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ statuses: masterTree.getStatuses() }),
            }),
            fetch('/api/admin/master-permission-order', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    departmentOrder: masterTree.getDepartmentOrder(),
                    areaOrders: masterTree.getAreaOrders(),
                    apartadoOrders: masterTree.getApartadoOrders(),
                }),
            }),
        ]);
        if (!statusRes.ok || !orderRes.ok) throw new Error('save failed');
        const [statusData] = await Promise.all([statusRes.json(), orderRes.json()]);
        originalStatuses = statusData.statuses || [];
        // Same reasoning as loadMasterTree's own baseline fix -- what was
        // just sent IS what the server now has, no need to round-trip
        // through its response to know that.
        originalDepartmentOrder = masterTree.getDepartmentOrder();
        originalAreaOrders = masterTree.getAreaOrders();
        originalApartadoOrders = masterTree.getApartadoOrders();
        // Resets the tree's own pending-added/pending-removed highlight
        // baseline to what just got saved -- otherwise a checkbox you
        // changed and saved would keep showing yellow/gray forever,
        // compared against the now-stale pre-save snapshot.
        masterTree.setBaseline(originalStatuses);
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    } finally {
        masterTreeSaveBtn.disabled = false;
    }
}

masterTreeSaveBtn.addEventListener('click', () => {
    if (!masterTree) return;
    const changes = describeChanges();
    const orderChanges = collectOrderChanges();
    if (!changes.length && !orderChanges.length) {
        Dashboard.showToast(Dashboard.t('admin.masterTreeNoChanges'), 'info');
        return;
    }
    openConfirmModal(changes, orderChanges, saveMasterTree);
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-master-permissions' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        await loadMasterTree();
    } catch (err) {
        console.error('Admin (Árbol de Permisos Maestro) failed to initialize:', err);
    }
})();
