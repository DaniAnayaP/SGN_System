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
const currencySelect = document.getElementById('master-currency-select');
const viewTreeBtn = document.getElementById('master-view-tree-btn');
const viewResumenBtn = document.getElementById('master-view-resumen-btn');
const masterTreeView = document.getElementById('master-tree-view');
const masterResumenView = document.getElementById('master-resumen-view');
const masterResumenGrid = document.getElementById('master-resumen-grid');

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
// One level deeper still -- each apartado's own Pantalla order, keyed by
// "sectionId::areaId::apartadoId" (see getPantallaOrders in
// PermissionTree.js).
let originalPantallaOrders = {};
// Árbol Maestro's own suggested/base cost per node (see getCosts in
// PermissionTree.js / master_permission_cost in db.js) -- a separate
// table from statuses/order, saved together on the same Guardar click.
let originalCosts = [];
// Currency the tree's $ Web/$ App values are CURRENTLY denominated in, and
// the last exchange rate GEIPSA used to get there (see master_cost_settings
// in db.js) -- suggested back the next time someone switches currency.
let currentCurrency = 'MXN';
let lastExchangeRate = 1;

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
    const afterPantallaOrders = masterTree.getPantallaOrders();
    Object.keys(afterPantallaOrders).forEach((compoundKey) => {
        const before = originalPantallaOrders[compoundKey] || [];
        const after = afterPantallaOrders[compoundKey];
        if (!orderArraysDiffer(before, after)) return;
        const [sectionId, areaId, apartadoId] = compoundKey.split('::');
        const apartadoName = masterTree.getStatusLabel(sectionId, areaId, apartadoId) || apartadoId;
        const names = after.map((id) => masterTree.getStatusLabel(sectionId, areaId, `${apartadoId}/${id}`) || id);
        items.push({
            label: Dashboard.t('admin.masterTreePantallaOrderLabel', { apartado: apartadoName }),
            line: Dashboard.t('admin.masterTreeOrderChangeLine', { order: names.join(' → ') }),
        });
    });
    return items;
}

// Same { label, line } shape as collectOrderChanges above, for $ Web/$ App
// (see getCosts in PermissionTree.js). getStatusLabel resolves any node key
// back to its i18n-translated label, same as every other cost-change
// summary on this screen.
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
        if (b.web !== a.web) lines.push(`${Dashboard.t('admin.masterTreeColCostWeb')}: $${b.web.toFixed(2)} → $${a.web.toFixed(2)}`);
        if (b.app !== a.app) lines.push(`${Dashboard.t('admin.masterTreeColCostApp')}: $${b.app.toFixed(2)} → $${a.app.toFixed(2)}`);
        items.push({ label: Dashboard.t('admin.masterTreeCostChangeLabel', { node: label }), line: lines.join(' · ') });
    });
    return items;
}

// --- Resumen (read-only, grouped by Estatus) -- same idea as Giro de
// Negocio's own Resumen/Árbol toggle (Admin-BusinessSectors.js), but for
// the WHOLE system's catalog instead of one Giro's accesses, and with a
// per-status breakdown instead of just a count (the full catalog is much
// bigger than any one Giro's, so a bare count alone isn't enough to audit
// it). Built entirely from PermissionTree.js's already-exposed getters --
// no new tree-side API needed: getDepartmentOrder/getAreaOrders/
// getApartadoOrders/getPantallaOrders together already walk every real
// node menu.json defines, and getStatusLabel resolves any of them back to
// its human name. ------------------------------------------------------
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
// as the Árbol itself (see renderStatusTree's own comment on that) --
// nothing here remembers what was open once Resumen closes.
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
        const count = document.createElement('span');
        count.className = 'mini-count';
        count.textContent = String(countResumenLeaves(node));
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

// Re-built fresh every time the Resumen tab is opened (not cached) -- it
// reflects whatever's currently in the tree, including edits made on the
// Árbol tab that haven't been saved yet, same live-state convention as
// describeChanges()/collectOrderChanges() above.
function renderResumen() {
    masterResumenGrid.innerHTML = '';
    const groups = buildResumenGroups();
    STATUS_GROUP_ORDER.forEach((key) => {
        const roots = groups[key];
        const totalCount = roots.reduce((sum, root) => sum + countResumenLeaves(root), 0);
        const card = document.createElement('div');
        card.className = `status-card status-card-${key.slice(0, 3)}`;
        // Habilitado is the default status almost everything sits in, so
        // it starts collapsed (its own list is the longest, by far, and
        // rarely what an admin opens Resumen to check) -- the other 3
        // start expanded since those are exactly what's worth auditing.
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
            empty.textContent = Dashboard.t('admin.masterResumenGroupEmpty');
            list.appendChild(empty);
        } else {
            roots.forEach((root) => list.appendChild(buildResumenNode(root, 0)));
        }
        card.appendChild(list);
        masterResumenGrid.appendChild(card);
    });
}

function showTreeView() {
    viewTreeBtn.classList.add('active');
    viewTreeBtn.setAttribute('aria-selected', 'true');
    viewResumenBtn.classList.remove('active');
    viewResumenBtn.setAttribute('aria-selected', 'false');
    masterTreeView.hidden = false;
    masterResumenView.hidden = true;
}
function showResumenView() {
    viewResumenBtn.classList.add('active');
    viewResumenBtn.setAttribute('aria-selected', 'true');
    viewTreeBtn.classList.remove('active');
    viewTreeBtn.setAttribute('aria-selected', 'false');
    masterResumenView.hidden = false;
    masterTreeView.hidden = true;
    renderResumen();
}
viewTreeBtn.addEventListener('click', showTreeView);
viewResumenBtn.addEventListener('click', showResumenView);

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
        const [statusRes, orderRes, costRes] = await Promise.all([
            fetch('/api/admin/master-permission-status', { credentials: 'include' }),
            fetch('/api/admin/master-permission-order', { credentials: 'include' }),
            fetch('/api/admin/master-permission-costs', { credentials: 'include' }),
        ]);
        if (!statusRes.ok || !orderRes.ok || !costRes.ok) throw new Error('load failed');
        const [statusData, orderData, costData] = await Promise.all([statusRes.json(), orderRes.json(), costRes.json()]);
        originalStatuses = statusData.statuses || [];
        currentCurrency = costData.currency || 'MXN';
        lastExchangeRate = costData.lastExchangeRate || 1;
        currencySelect.value = currentCurrency;
        masterTree = window.PermissionTree.create(masterTreeContainer, {
            statusMode: true,
            departmentOrder: orderData.departmentOrder || [],
            areaOrder: orderData.areaOrders || {},
            apartadoOrder: orderData.apartadoOrders || {},
            pantallaOrder: orderData.pantallaOrders || {},
            costCurrency: currentCurrency,
        });
        await masterTree.init(originalStatuses, costData.costs || []);
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
        originalPantallaOrders = masterTree.getPantallaOrders();
        originalCosts = masterTree.getCosts();
    } catch {
        masterTreeError.textContent = Dashboard.t('admin.loadError');
        masterTreeError.hidden = false;
    }
}

async function saveMasterTree() {
    masterTreeSaveBtn.disabled = true;
    try {
        const [statusRes, orderRes, costRes] = await Promise.all([
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
                    pantallaOrders: masterTree.getPantallaOrders(),
                }),
            }),
            fetch('/api/admin/master-permission-costs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ costs: masterTree.getCosts() }),
            }),
        ]);
        if (!statusRes.ok || !orderRes.ok || !costRes.ok) throw new Error('save failed');
        const [statusData] = await Promise.all([statusRes.json(), orderRes.json(), costRes.json()]);
        originalStatuses = statusData.statuses || [];
        // Same reasoning as loadMasterTree's own baseline fix -- what was
        // just sent IS what the server now has, no need to round-trip
        // through its response to know that.
        originalDepartmentOrder = masterTree.getDepartmentOrder();
        originalAreaOrders = masterTree.getAreaOrders();
        originalApartadoOrders = masterTree.getApartadoOrders();
        originalPantallaOrders = masterTree.getPantallaOrders();
        originalCosts = masterTree.getCosts();
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
    const extraChanges = [...collectOrderChanges(), ...collectCostChanges()];
    if (!changes.length && !extraChanges.length) {
        Dashboard.showToast(Dashboard.t('admin.masterTreeNoChanges'), 'info');
        return;
    }
    openConfirmModal(changes, extraChanges, saveMasterTree);
});

// --- Currency (see master_permission_cost/master_cost_settings in db.js)
// -- switching currency converts every already-saved $ Web/$ App value
// using an exchange rate the admin confirms (or overrides) in a dialog
// first, never silently. The rate is always "1 <the non-MXN side> = rate
// MXN", same convention shown in the dialog regardless of which direction
// the switch goes (MXN -> foreign or foreign -> MXN).
const currencyModal = document.getElementById('currency-modal');
const currencyModalTitle = document.getElementById('currency-modal-title');
const currencyRateValue = document.getElementById('currency-rate-value');
const currencyRateInputLabel = document.getElementById('currency-rate-input-label');
const currencyRateInput = document.getElementById('currency-rate-input');
const currencyPreviewBox = document.getElementById('currency-preview-box');
const currencyConfirmBtn = document.getElementById('currency-confirm-btn');
const currencyCancelBtn = document.getElementById('currency-cancel-btn');
let pendingCurrency = null;

// No per-node before/after preview here (unlike the mockup's hardcoded
// example) -- just how many already-priced nodes will move, since listing
// specific ones would mean re-deriving labels for an arbitrary subset of
// the tree for little real benefit.
function updateCurrencyPreview() {
    const count = masterTree ? masterTree.getCosts().length : 0;
    currencyPreviewBox.textContent = count
        ? Dashboard.t('admin.masterCostPreviewCount', { count: String(count) })
        : Dashboard.t('admin.masterCostPreviewEmpty');
}

currencySelect.addEventListener('change', () => {
    const to = currencySelect.value;
    if (!masterTree || to === currentCurrency) return;
    pendingCurrency = to;
    const foreign = to === 'MXN' ? currentCurrency : to;
    currencyModalTitle.textContent = Dashboard.t('admin.masterCostChangeCurrencyTitle', { from: currentCurrency, to });
    currencyRateValue.textContent = Dashboard.t('admin.masterCostRateLine', { foreign, rate: lastExchangeRate.toFixed(2) });
    currencyRateInputLabel.textContent = `1 ${foreign} =`;
    currencyRateInput.value = lastExchangeRate.toFixed(2);
    updateCurrencyPreview();
    currencyModal.hidden = false;
});
currencyCancelBtn.addEventListener('click', () => {
    currencySelect.value = currentCurrency;
    currencyModal.hidden = true;
});
currencyModal.addEventListener('click', (event) => { if (event.target === currencyModal) currencyCancelBtn.click(); });
currencyConfirmBtn.addEventListener('click', async () => {
    const rate = parseFloat(currencyRateInput.value) || 1;
    currencyConfirmBtn.disabled = true;
    try {
        const res = await fetch('/api/admin/master-permission-costs/currency', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ currency: pendingCurrency, exchangeRate: rate }),
        });
        if (!res.ok) throw new Error('save failed');
        currencyModal.hidden = true;
        // Every $ Web/$ App value just changed server-side -- simplest to
        // reload the whole tree fresh rather than try to rewrite each
        // input in place from here.
        await loadMasterTree();
        Dashboard.showToast(Dashboard.t('admin.masterCostCurrencySaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.masterCostSaveError'), 'error');
    } finally {
        currencyConfirmBtn.disabled = false;
    }
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
