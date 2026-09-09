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
function openConfirmModal(changes, onConfirm) {
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
        const res = await fetch('/api/admin/master-permission-status', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        originalStatuses = data.statuses || [];
        masterTree = window.PermissionTree.create(masterTreeContainer, { statusMode: true });
        await masterTree.init(originalStatuses);
    } catch {
        masterTreeError.textContent = Dashboard.t('admin.loadError');
        masterTreeError.hidden = false;
    }
}

async function saveMasterTree() {
    masterTreeSaveBtn.disabled = true;
    try {
        const res = await fetch('/api/admin/master-permission-status', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ statuses: masterTree.getStatuses() }),
        });
        if (!res.ok) throw new Error('save failed');
        const data = await res.json();
        originalStatuses = data.statuses || [];
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
    if (!changes.length) {
        Dashboard.showToast(Dashboard.t('admin.masterTreeNoChanges'), 'info');
        return;
    }
    openConfirmModal(changes, saveMasterTree);
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
