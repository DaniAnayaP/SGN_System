// ---------------------------------------------------------------------------
// "Nuestros Sectores de Negocio" (Giros de Negocio) — the catalog Nuestras
// APPs' own Sector de Negocio field picks from (see Admin-NuestrasApps.js's
// populateSectorSelect). Full edit now (icon/type/description), unlike the
// original name-only version: a Giro's name is still permanent (delete-and-
// recreate on a typo, same reasoning as before), but everything else can be
// corrected in place. Shell (sidebar, i18n, settings, logout) comes from
// Dashboard.js.
// ---------------------------------------------------------------------------

// The 13 "Control Interno" system columns (see getSystemColumnsForRecord
// in db.js) — same key order as the table's own <th data-col="colSys...">.
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];

// Fixed icon set (see the "Icono se elige de un set fijo" decision) — plain
// boxicons, same icon language the rest of the desktop app already uses.
const SECTOR_ICON_OPTIONS = [
    'bx-buildings', 'bx-store-alt', 'bx-briefcase', 'bx-cog',
    'bx-package', 'bx-car', 'bx-restaurant', 'bx-leaf',
];

const tableBody = document.getElementById('sectors-table-body');
const emptyMsg = document.getElementById('sectors-empty');

const addModal = document.getElementById('sector-add-modal');
const addModalTitle = document.getElementById('sector-add-modal-title');
const form = document.getElementById('sector-form');
const nameField = document.getElementById('sector-name');
const iconPicker = document.getElementById('sector-icon-picker');
const typeSelect = document.getElementById('sector-type');
const typeNewBtn = document.getElementById('sector-type-new');
const descriptionField = document.getElementById('sector-description');
const formError = document.getElementById('sector-form-error');
const submitBtn = document.getElementById('sector-form-submit');
const cancelBtn = document.getElementById('sector-form-cancel');

let sectors = [];
let sectorTypes = [];
let selectedIcon = SECTOR_ICON_OPTIONS[0];
let editingSectorId = null; // null while creating, a real id while editing

function showError(message) {
    formError.textContent = message;
    formError.hidden = false;
}
function clearError() {
    formError.hidden = true;
    formError.textContent = '';
}

// --- Icon picker -------------------------------------------------------------
function renderIconPicker() {
    iconPicker.innerHTML = '';
    SECTOR_ICON_OPTIONS.forEach((icon) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `icon-picker-option${icon === selectedIcon ? ' active' : ''}`;
        btn.setAttribute('role', 'radio');
        btn.setAttribute('aria-checked', String(icon === selectedIcon));
        btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
        btn.addEventListener('click', () => {
            selectedIcon = icon;
            renderIconPicker();
        });
        iconPicker.appendChild(btn);
    });
}

// --- Sector type (Tipo Giro) — flat admin-created catalog, no approval ------
// workflow (see the server-side comment: every account on this screen is
// already role='admin', so there's no one to escalate to).
async function loadSectorTypes() {
    try {
        const res = await fetch('/api/admin/business-sector-types', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        sectorTypes = data.types || [];
    } catch {
        sectorTypes = [];
    }
    renderTypeSelect();
}
function renderTypeSelect(selectedId) {
    const current = selectedId !== undefined ? selectedId : Number(typeSelect.value) || null;
    typeSelect.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = Dashboard.t('admin.businessSectorTypeNone');
    typeSelect.appendChild(blank);
    sectorTypes.forEach((type) => {
        const opt = document.createElement('option');
        opt.value = String(type.id);
        opt.textContent = type.name;
        typeSelect.appendChild(opt);
    });
    if (current) typeSelect.value = String(current);
}

const typeModal = document.getElementById('sector-type-modal');
const typeForm = document.getElementById('sector-type-form');
const typeNameField = document.getElementById('sector-type-name');
const typeFormError = document.getElementById('sector-type-form-error');
const typeFormSubmit = document.getElementById('sector-type-form-submit');
const typeFormCancel = document.getElementById('sector-type-form-cancel');

function openTypeModal() {
    typeForm.reset();
    typeFormError.hidden = true;
    typeModal.hidden = false;
    typeNameField.focus();
}
function closeTypeModal() {
    typeModal.hidden = true;
}
typeNewBtn.addEventListener('click', openTypeModal);
typeFormCancel.addEventListener('click', closeTypeModal);
typeModal.addEventListener('click', (event) => { if (event.target === typeModal) closeTypeModal(); });
typeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    typeFormError.hidden = true;
    const name = typeNameField.value.trim();
    if (!name) {
        typeFormError.textContent = Dashboard.t('admin.requiredFields');
        typeFormError.hidden = false;
        return;
    }
    typeFormSubmit.disabled = true;
    try {
        const res = await fetch('/api/admin/business-sector-types', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            typeFormError.textContent = body.message || Dashboard.t('admin.saveError');
            typeFormError.hidden = false;
            return;
        }
        const { type } = await res.json();
        sectorTypes = [...sectorTypes, type].sort((a, b) => a.name.localeCompare(b.name));
        renderTypeSelect(type.id);
        closeTypeModal();
    } catch {
        typeFormError.textContent = Dashboard.t('admin.saveError');
        typeFormError.hidden = false;
    } finally {
        typeFormSubmit.disabled = false;
    }
});

// --- Table ---------------------------------------------------------------
function statusLabelKey(status) {
    // Not the "...Med" variant -- confirmed live it only exists for
    // Habilitado/Construcción, not Inhabilitado/Mejoras (those two only
    // have the base key), so using it unconditionally left the raw i18n
    // key showing on screen for those two statuses. The base key exists
    // for all 4 and is fine at this size (a standalone summary row, not a
    // tight table cell that needed the shorter wording).
    return `admin.masterTreeStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function renderPermSummary(sector) {
    const wrap = document.createElement('button');
    wrap.type = 'button';
    wrap.className = 'perm-dot-summary';
    const s = sector.permSummary || {};
    const parts = [];
    if (s.habilitado) parts.push(`<span class="perm-dot perm-dot-good"></span>${s.habilitado}`);
    if ((s.construccion || 0) + (s.mejoras || 0) > 0) parts.push(`<span class="perm-dot perm-dot-warn"></span>${(s.construccion || 0) + (s.mejoras || 0)}`);
    if (s.inhabilitado) parts.push(`<span class="perm-dot perm-dot-bad"></span>${s.inhabilitado}`);
    wrap.innerHTML = parts.length ? parts.join(' ') : '—';
    wrap.addEventListener('click', () => openSectorPermsModal(sector));
    return wrap;
}

function renderSectors() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = sectors.length > 0;
    sectors.forEach((sector) => {
        const tr = document.createElement('tr');

        const tdIcon = document.createElement('td');
        tdIcon.dataset.col = 'icon';
        tdIcon.innerHTML = `<i class="bx ${sector.icon || 'bx-briefcase'}" aria-hidden="true"></i>`;

        const tdName = document.createElement('td');
        tdName.dataset.col = 'name';
        tdName.textContent = sector.name;

        const tdType = document.createElement('td');
        tdType.dataset.col = 'type';
        tdType.textContent = sector.typeName || '—';

        const tdDescription = document.createElement('td');
        tdDescription.dataset.col = 'description';
        tdDescription.textContent = sector.description || '—';

        const tdPerms = document.createElement('td');
        tdPerms.dataset.col = 'permsAssigned';
        tdPerms.appendChild(renderPermSummary(sector));

        const tdStatus = document.createElement('td');
        tdStatus.dataset.col = 'status';
        const statusBadge = document.createElement('span');
        statusBadge.className = `admin-badge admin-badge-${sector.status === 'inactive' ? 'inactivo' : 'activo'}`;
        statusBadge.textContent = Dashboard.t(sector.status === 'inactive' ? 'admin.businessSectorStatusInactive' : 'admin.businessSectorStatusActive');
        tdStatus.appendChild(statusBadge);

        const tdCreatedBy = document.createElement('td');
        tdCreatedBy.dataset.col = 'createdBy';
        tdCreatedBy.textContent = sector.createdBy || '—';

        const tdCreatedAt = document.createElement('td');
        tdCreatedAt.dataset.col = 'createdAt';
        tdCreatedAt.textContent = sector.createdAt ? sector.createdAt.slice(0, 10) : '—';

        const systemCols = SYSTEM_COLUMN_KEYS.map((k) => {
            const td = document.createElement('td');
            td.className = 'col-system';
            td.dataset.col = k;
            td.textContent = sector[k] || '—';
            return td;
        });

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';

        const treeBtn = document.createElement('button');
        treeBtn.type = 'button';
        treeBtn.className = 'admin-icon-btn';
        treeBtn.setAttribute('aria-label', Dashboard.t('admin.giroAccesosGlobalesTitle'));
        treeBtn.title = Dashboard.t('admin.giroAccesosGlobalesTitle');
        treeBtn.innerHTML = '<i class="bx bx-shield" aria-hidden="true"></i>';
        treeBtn.addEventListener('click', () => openSectorTreeModal(sector));

        const orderBtn = document.createElement('button');
        orderBtn.type = 'button';
        orderBtn.className = 'admin-icon-btn';
        orderBtn.setAttribute('aria-label', Dashboard.t('admin.giroReordenPersonalizadoTitle'));
        orderBtn.title = Dashboard.t('admin.giroReordenPersonalizadoTitle');
        orderBtn.innerHTML = '<i class="bx bx-sort-alt-2" aria-hidden="true"></i>';
        orderBtn.addEventListener('click', () => openSectorOrderModal(sector));

        const previewBtn = document.createElement('button');
        previewBtn.type = 'button';
        previewBtn.className = 'admin-icon-btn';
        previewBtn.setAttribute('aria-label', Dashboard.t('admin.businessSectorPreview'));
        previewBtn.title = Dashboard.t('admin.businessSectorPreview');
        previewBtn.innerHTML = '<i class="bx bx-compass" aria-hidden="true"></i>';
        previewBtn.addEventListener('click', () => Dashboard.showToast(Dashboard.t('admin.underConstruction'), 'info'));

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.title = Dashboard.t('admin.edit');
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => openEditModal(sector));

        const historyBtn = document.createElement('button');
        historyBtn.type = 'button';
        historyBtn.className = 'admin-icon-btn';
        historyBtn.setAttribute('aria-label', Dashboard.t('admin.businessSectorChangeHistory'));
        historyBtn.title = Dashboard.t('admin.businessSectorChangeHistory');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => openSectorHistoryModal(sector));

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'admin-icon-btn';
        toggleBtn.innerHTML = `<i class="bx ${sector.status === 'inactive' ? 'bx-check-circle' : 'bx-x-circle'}" aria-hidden="true"></i>`;
        toggleBtn.setAttribute('aria-label', Dashboard.t(sector.status === 'inactive' ? 'admin.activate' : 'admin.deactivate'));
        toggleBtn.title = Dashboard.t(sector.status === 'inactive' ? 'admin.activate' : 'admin.deactivate');
        toggleBtn.addEventListener('click', () => toggleSectorStatus(sector));

        tdActions.append(treeBtn, orderBtn, previewBtn, editBtn, historyBtn, toggleBtn);
        tr.append(tdIcon, tdName, tdType, tdDescription, tdPerms, tdStatus, tdCreatedBy, tdCreatedAt, ...systemCols, tdActions);
        tableBody.appendChild(tr);
    });
}

async function loadSectors() {
    try {
        const res = await fetch('/api/admin/business-sectors', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        sectors = data.sectors || [];
        renderSectors();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.loadError'), 'error');
    }
}

async function toggleSectorStatus(sector) {
    const nextStatus = sector.status === 'inactive' ? 'active' : 'inactive';
    try {
        const res = await fetch(`/api/admin/business-sectors/${sector.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: nextStatus }),
        });
        if (!res.ok) throw new Error('save failed');
        const { sector: updated } = await res.json();
        sectors = sectors.map((s) => (s.id === updated.id ? updated : s));
        renderSectors();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// --- Create / Edit modal (same modal doubles as both) -----------------------
function openAddModal() {
    editingSectorId = null;
    addModalTitle.textContent = Dashboard.t('menu.addBusinessSectorNew');
    form.reset();
    selectedIcon = SECTOR_ICON_OPTIONS[0];
    renderIconPicker();
    renderTypeSelect(null);
    clearError();
    addModal.hidden = false;
    nameField.focus();
}
function openEditModal(sector) {
    editingSectorId = sector.id;
    addModalTitle.textContent = Dashboard.t('admin.businessSectorEditTitle');
    nameField.value = sector.name;
    selectedIcon = sector.icon || SECTOR_ICON_OPTIONS[0];
    renderIconPicker();
    renderTypeSelect(sector.typeId);
    descriptionField.value = sector.description || '';
    clearError();
    addModal.hidden = false;
    nameField.focus();
}
function closeAddModal() {
    addModal.hidden = true;
}
cancelBtn.addEventListener('click', closeAddModal);
addModal.addEventListener('click', (event) => { if (event.target === addModal) closeAddModal(); });

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    const name = nameField.value.trim();
    if (!name) {
        showError(Dashboard.t('admin.requiredFields'));
        return;
    }
    const payload = {
        name,
        icon: selectedIcon,
        typeId: typeSelect.value ? Number(typeSelect.value) : null,
        description: descriptionField.value.trim(),
    };
    submitBtn.disabled = true;
    try {
        const url = editingSectorId ? `/api/admin/business-sectors/${editingSectorId}` : '/api/admin/business-sectors';
        const res = await fetch(url, {
            method: editingSectorId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(body.message || Dashboard.t('admin.saveError'));
            return;
        }
        const { sector } = await res.json();
        sectors = editingSectorId
            ? sectors.map((s) => (s.id === sector.id ? sector : s))
            : [...sectors, sector].sort((a, b) => a.name.localeCompare(b.name));
        renderSectors();
        closeAddModal();
        Dashboard.showToast(Dashboard.t('main.recordSaved'), 'success');
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

// "+ Crear Nuevo Giro" — same toolbar-button placement/style as "+ Nuevo
// Plan"/"+ Crear Nueva App" (see renderNewAppButton in Admin-NuestrasApps.js).
function renderNewSectorButton() {
    const wrapper = document.querySelector('[data-table-id="business-sectors"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="menu.addBusinessSectorNew">${Dashboard.t('menu.addBusinessSectorNew')}</span>`;
    btn.addEventListener('click', openAddModal);
    toolbar.prepend(btn);
}

// --- Accesos Globales -- a réplica of Árbol de Permisos Maestro's own
// full-depth tree (PermissionTree.js's grantMode:'giro'), gated by
// whatever Árbol Maestro currently allows (GET master-permission-status)
// instead of the old ungated checkbox tree this replaced. No reorder here
// on purpose (see openSectorOrderModal below for that) -- the removed
// equalize/fill-missing-APP buttons belonged to showAppTab's own
// App-eligibility pipeline, which never actually worked for a GEIPSA admin
// session anyway (GET /api/business/app-screens 404s with no clientId) --
// grantMode's own Web/App icons don't go through that pipeline at all. ---
const sectorTreeModal = document.getElementById('sector-tree-modal');
const sectorTreeModalTitle = document.getElementById('sector-tree-modal-title');
const sectorTreeContainer = document.getElementById('sector-tree-container');
const sectorTreeError = document.getElementById('sector-tree-error');
const sectorTreeSaveBtn = document.getElementById('sector-tree-save');
const sectorTreeCloseBtn = document.getElementById('sector-tree-close');

let sectorTree = null;
let selectedSectorId = null;

async function openSectorTreeModal(sector) {
    selectedSectorId = sector.id;
    sectorTreeModalTitle.textContent = `${Dashboard.t('admin.giroAccesosGlobalesTitle')} — ${sector.name}`;
    sectorTreeError.hidden = true;
    sectorTreeContainer.innerHTML = '';
    sectorTreeModal.hidden = false;
    try {
        const [grantsRes, statusRes] = await Promise.all([
            fetch(`/api/admin/business-sectors/${sector.id}/grants`, { credentials: 'include' }),
            fetch('/api/admin/master-permission-status', { credentials: 'include' }),
        ]);
        if (!grantsRes.ok || !statusRes.ok) throw new Error('load failed');
        const grantsData = await grantsRes.json();
        const statusData = await statusRes.json();
        sectorTree = window.PermissionTree.create(sectorTreeContainer, { grantMode: 'giro', masterGate: statusData.statuses || [] });
        await sectorTree.init(grantsData.grants || []);
    } catch {
        sectorTreeError.textContent = Dashboard.t('admin.loadError');
        sectorTreeError.hidden = false;
    }
}

function closeSectorTreeModal() {
    sectorTreeModal.hidden = true;
    sectorTree = null;
    selectedSectorId = null;
}
sectorTreeCloseBtn.addEventListener('click', closeSectorTreeModal);
sectorTreeModal.addEventListener('click', (event) => { if (event.target === sectorTreeModal) closeSectorTreeModal(); });

// Cross-link to the read-only "Permisos asignados" breakdown -- confirmed
// live that without this, the Resumen/Árbol toggle (which only ever lived
// on that other screen, opened from the color dots) was hard to find from
// here. Not a merge of the two screens (that would mean adding a read-only
// Estatus badge to this tree's own rows, which needs threading a status
// lookup through every buildRow() call site in PermissionTree.js -- shared
// by Business-Roles/Business-Accesos/AppRoles too, left for its own
// carefully-tested pass instead of rushing it here) -- just a direct path
// between the two.
document.getElementById('sector-tree-view-perms').addEventListener('click', () => {
    if (!selectedSectorId) return;
    const sector = sectors.find((s) => s.id === selectedSectorId);
    if (!sector) return;
    closeSectorTreeModal();
    openSectorPermsModal(sector);
});

sectorTreeSaveBtn.addEventListener('click', async () => {
    if (!selectedSectorId || !sectorTree) return;
    sectorTreeSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/admin/business-sectors/${selectedSectorId}/grants`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ grants: sectorTree.getGrants() }),
        });
        if (!res.ok) throw new Error('save failed');
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
        // The color-dot summary counts what THIS tree just changed -- refresh
        // the list so it reflects the save without needing a full reload.
        await loadSectors();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    } finally {
        sectorTreeSaveBtn.disabled = false;
    }
});

// --- Registro de Cambios ----------------------------------------------------
// business_sectors is GEIPSA-wide (no client_id), so it can't go through
// Dashboard.openChangeHistory (client-scoped only) -- same reasoning
// Nuestros Planes' own openPlanChangeHistory already established; this
// mirrors that pattern rather than duplicating it (kept local to this
// screen instead of generalizing Dashboard.js's plan-only version).
const sectorHistoryModal = document.getElementById('sector-history-modal');
const sectorHistoryList = document.getElementById('sector-history-list');
const sectorHistoryClose = document.getElementById('sector-history-close');
sectorHistoryClose.addEventListener('click', () => { sectorHistoryModal.hidden = true; });
sectorHistoryModal.addEventListener('click', (event) => { if (event.target === sectorHistoryModal) sectorHistoryModal.hidden = true; });

function historyRow(cells) {
    const tr = document.createElement('tr');
    cells.forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
    });
    return tr;
}

async function openSectorHistoryModal(sector) {
    sectorHistoryModal.hidden = false;
    sectorHistoryList.innerHTML = '';
    sectorHistoryList.appendChild(historyRow([Dashboard.t('main.changeHistoryEmpty'), '', '']));
    try {
        const res = await fetch(`/api/admin/business-sectors/${sector.id}/changes`, { credentials: 'include' });
        if (!res.ok) return;
        const { changes } = await res.json();
        if (!changes || !changes.length) return;
        sectorHistoryList.innerHTML = '';
        changes.forEach((change) => {
            let description;
            if (change.action === 'create') description = Dashboard.t('main.changeHistoryCreated');
            else description = `${Dashboard.t(change.field_key) || change.field_key}: "${change.old_value || '—'}" → "${change.new_value || '—'}"`;
            sectorHistoryList.appendChild(historyRow([change.changed_at, change.changed_by || '—', description]));
        });
    } catch {
        // Empty-state row above stays in place.
    }
}

// --- "Permisos Asignados" — read-only counts (see the color-dot summary) ---
// Grouped by the exact same Estatus values Árbol de Permisos Maestro uses.
// A full per-item labeled breakdown would need to walk data/menu.json the
// same way PermissionTree.js already does internally -- deliberately not
// duplicated here to avoid a second, easily-drifting copy of that logic;
// "Ver árbol completo" below opens the real tree instead, which already
// shows every label correctly.
const sectorPermsModal = document.getElementById('sector-perms-modal');
const sectorPermsList = document.getElementById('sector-perms-list');
const sectorPermsClose = document.getElementById('sector-perms-close');
sectorPermsClose.addEventListener('click', () => { sectorPermsModal.hidden = true; });
sectorPermsModal.addEventListener('click', (event) => { if (event.target === sectorPermsModal) sectorPermsModal.hidden = true; });

function openSectorPermsModal(sector) {
    sectorPermsList.innerHTML = '';
    const s = sector.permSummary || {};
    const groups = [
        { key: 'habilitado', count: s.habilitado || 0 },
        { key: 'construccion', count: s.construccion || 0 },
        { key: 'mejoras', count: s.mejoras || 0 },
        { key: 'inhabilitado', count: s.inhabilitado || 0 },
    ].filter((g) => g.count > 0);
    if (!groups.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-hint';
        empty.textContent = Dashboard.t('admin.businessSectorPermsEmpty');
        sectorPermsList.appendChild(empty);
    } else {
        groups.forEach((g) => {
            const row = document.createElement('div');
            row.className = 'perm-status-row';
            const label = document.createElement('span');
            label.textContent = Dashboard.t(statusLabelKey(g.key));
            const count = document.createElement('span');
            count.className = 'perm-status-tag perm-status-tag-on';
            count.textContent = String(g.count);
            row.append(label, count);
            sectorPermsList.appendChild(row);
        });
    }
    const goToTree = document.createElement('button');
    goToTree.type = 'button';
    goToTree.className = 'btn btn-secondary';
    goToTree.style.marginTop = '1rem';
    goToTree.textContent = Dashboard.t('admin.businessSectorGoToTree');
    goToTree.addEventListener('click', () => {
        sectorPermsModal.hidden = true;
        openSectorTreeModal(sector);
    });
    sectorPermsList.appendChild(goToTree);
    sectorPermsModal.hidden = false;
}

// --- Departamento reorder (see sector_permission_order/
// getEffectiveSectorDepartmentOrder in db.js) -- a brand-new, isolated
// screen rather than folding this into "Actualizar Permisos"'s own tree:
// the confirmed mockup (orden-dos-columnas.html) is a plain 2-column
// table, not a nested checkbox tree, and this way needs zero changes to
// buildRow/PermissionTree.js's grant logic. Drag-only (confirmed with the
// user) -- a row's rank is just its position in the list, so there's no
// separate numeric input to keep in sync with the drag.
const sectorOrderModal = document.getElementById('sector-order-modal');
const sectorOrderList = document.getElementById('sector-order-list');
const sectorOrderError = document.getElementById('sector-order-error');
const sectorOrderSaveBtn = document.getElementById('sector-order-save');
const sectorOrderCloseBtn = document.getElementById('sector-order-close');

// The Departamento catalog (id -> translated name) is the same for every
// Giro -- fetched once via PermissionTree.js's getDepartmentCatalog and
// reused across every openSectorOrderModal call, instead of re-resolving
// menu.json's labelKeys on every open. Same for each department's own Área
// catalog (sectorOrderAreaCatalogs, keyed by sectionId) -- área NAMES don't
// vary per Giro, only their order does.
let departmentCatalog = null;
let sectorOrderAreaCatalogs = {};
let sectorOrderSectorId = null;
let sectorOrderMasterOrder = [];
let sectorOrderCustomOrder = [];
// Área order is per-department and loaded lazily (only once a department
// row is expanded) -- sectorOrderAreaOrdersFromServer holds the raw GET
// response (server's already-cascaded effective order + Master's own, per
// sectionId), sectorOrderCustomAreaOrders is the LOCAL editable state a
// drag actually mutates, seeded from the server data the first time a
// department is expanded. Only departments the admin actually expanded
// this session end up in sectorOrderCustomAreaOrders, which is also
// exactly what gets sent back on Guardar.
let sectorOrderMasterAreaOrders = {};
let sectorOrderAreaOrdersFromServer = {};
let sectorOrderCustomAreaOrders = {};
let expandedSectorOrderDepts = new Set();
// One shared dragged-node reference (not a separate variable per level),
// same reasoning as PermissionTree.js's own draggedNode: `kind`+`sectionId`
// guard against a Departamento drag ever being dropped as if it were an
// Área (or an Área from one department landing under another).
let draggedOrderNode = null;

async function ensureDepartmentCatalog() {
    if (!departmentCatalog) departmentCatalog = await window.PermissionTree.getDepartmentCatalog();
    return departmentCatalog;
}
async function ensureAreaCatalog(sectionId) {
    if (!sectorOrderAreaCatalogs[sectionId]) {
        sectorOrderAreaCatalogs[sectionId] = await window.PermissionTree.getAreaCatalog(sectionId);
    }
    return sectorOrderAreaCatalogs[sectionId];
}

function reorderOrderList(list, draggedId, targetId) {
    if (draggedId === targetId) return false;
    const fromIdx = list.indexOf(draggedId);
    if (fromIdx === -1) return false;
    list.splice(fromIdx, 1);
    const toIdx = list.indexOf(targetId);
    list.splice(toIdx === -1 ? list.length : toIdx, 0, draggedId);
    return true;
}

// Builds one draggable <tr> -- shared by both Departamento (depth 0,
// expandable) and Área (depth 1, no children) rows so the drag/drop wiring
// and the Master-reference + custom-order-with-grip cell pair (see the
// confirmed orden-dos-columnas.html mockup) exist in exactly one place.
function buildOrderRow({ kind, id, sectionId, label, depth, index, masterRank, hasChildren, expanded, onToggle, onDrop }) {
    const tr = document.createElement('tr');
    tr.draggable = true;
    tr.className = `sector-order-row sector-order-row-depth-${depth}`;
    tr.addEventListener('dragstart', (e) => {
        draggedOrderNode = { kind, id, sectionId };
        tr.classList.add('sector-order-row-dragging');
        e.dataTransfer.effectAllowed = 'move';
    });
    tr.addEventListener('dragend', () => {
        draggedOrderNode = null;
        tr.classList.remove('sector-order-row-dragging');
    });
    tr.addEventListener('dragover', (e) => {
        if (!draggedOrderNode || draggedOrderNode.kind !== kind || draggedOrderNode.sectionId !== sectionId || draggedOrderNode.id === id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        tr.classList.add('sector-order-row-drop-target');
    });
    tr.addEventListener('dragleave', () => tr.classList.remove('sector-order-row-drop-target'));
    tr.addEventListener('drop', (e) => {
        e.preventDefault();
        tr.classList.remove('sector-order-row-drop-target');
        const dragged = draggedOrderNode;
        draggedOrderNode = null;
        if (!dragged || dragged.kind !== kind || dragged.sectionId !== sectionId || dragged.id === id) return;
        if (onDrop(dragged.id, id)) renderSectorOrderList();
    });

    const tdName = document.createElement('td');
    const nameWrap = document.createElement('div');
    nameWrap.className = 'sector-order-name-cell';
    if (hasChildren) {
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'sector-order-toggle';
        toggleBtn.setAttribute('aria-expanded', String(!!expanded));
        toggleBtn.innerHTML = '<i class="bx bx-chevron-down" aria-hidden="true"></i>';
        toggleBtn.addEventListener('click', onToggle);
        nameWrap.appendChild(toggleBtn);
    }
    const nameLabel = document.createElement('span');
    nameLabel.textContent = label;
    nameWrap.appendChild(nameLabel);
    tdName.appendChild(nameWrap);

    const tdMaster = document.createElement('td');
    const masterBadge = document.createElement('span');
    masterBadge.className = 'sector-order-badge';
    masterBadge.textContent = String(masterRank || '—');
    tdMaster.appendChild(masterBadge);

    const tdCustom = document.createElement('td');
    const customCell = document.createElement('div');
    customCell.className = 'sector-order-custom-cell';
    const grip = document.createElement('span');
    grip.className = 'sector-order-grip';
    grip.setAttribute('aria-hidden', 'true');
    grip.innerHTML = '<i class="bx bx-dots-vertical-rounded"></i><i class="bx bx-dots-vertical-rounded"></i>';
    const customBadge = document.createElement('span');
    customBadge.className = 'sector-order-badge sector-order-badge-custom';
    customBadge.textContent = String(index + 1);
    customCell.append(grip, customBadge);
    tdCustom.appendChild(customCell);
    // "Personalizado" only on rows that actually diverged from Master's own
    // position for that same node -- confirmed with the user (a Giro that
    // never reordered anything shows this tag on NO row, even though it's
    // technically "showing Master's order").
    if ((masterRank || 0) !== index + 1) {
        const tag = document.createElement('span');
        tag.className = 'sector-order-custom-tag';
        tag.textContent = Dashboard.t('admin.sectorOrderCustomTag');
        tdCustom.appendChild(tag);
    }

    tr.append(tdName, tdMaster, tdCustom);
    return tr;
}

function renderSectorOrderList() {
    sectorOrderList.innerHTML = '';
    const labelById = new Map(departmentCatalog.map((d) => [d.id, d.label]));
    // 1-based rank in Master's CURRENT order -- purely a reference number
    // shown per row, never what determines row order on THIS screen (the
    // row order below is sectorOrderCustomOrder's own order).
    const masterRank = new Map(sectorOrderMasterOrder.map((id, i) => [id, i + 1]));
    sectorOrderCustomOrder.forEach((id, index) => {
        const expanded = expandedSectorOrderDepts.has(id);
        sectorOrderList.appendChild(buildOrderRow({
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
                if (expanded) expandedSectorOrderDepts.delete(id);
                else expandedSectorOrderDepts.add(id);
                renderSectorOrderList();
            },
            onDrop: (draggedId, targetId) => reorderOrderList(sectorOrderCustomOrder, draggedId, targetId),
        }));
        if (!expanded) return;

        if (!sectorOrderAreaCatalogs[id]) {
            const loadingTr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 3;
            td.className = 'sector-order-area-loading';
            td.textContent = Dashboard.t('admin.loading') || '...';
            loadingTr.appendChild(td);
            sectorOrderList.appendChild(loadingTr);
            ensureAreaCatalog(id).then(() => {
                if (expandedSectorOrderDepts.has(id)) renderSectorOrderList();
            });
            return;
        }
        const areaCatalog = sectorOrderAreaCatalogs[id];
        const areaLabelById = new Map(areaCatalog.map((a) => [a.id, a.label]));
        const areaMasterOrder = sectorOrderMasterAreaOrders[id] || areaCatalog.map((a) => a.id);
        const areaMasterRank = new Map(areaMasterOrder.map((areaId, i) => [areaId, i + 1]));
        if (!sectorOrderCustomAreaOrders[id]) {
            const fromServer = sectorOrderAreaOrdersFromServer[id];
            sectorOrderCustomAreaOrders[id] = (fromServer && fromServer.length) ? [...fromServer] : [...areaMasterOrder];
            areaCatalog.forEach((a) => { if (!sectorOrderCustomAreaOrders[id].includes(a.id)) sectorOrderCustomAreaOrders[id].push(a.id); });
        }
        sectorOrderCustomAreaOrders[id].forEach((areaId, areaIndex) => {
            sectorOrderList.appendChild(buildOrderRow({
                kind: 'area',
                id: areaId,
                sectionId: id,
                label: areaLabelById.get(areaId) || areaId,
                depth: 1,
                index: areaIndex,
                masterRank: areaMasterRank.get(areaId),
                hasChildren: false,
                onDrop: (draggedId, targetId) => reorderOrderList(sectorOrderCustomAreaOrders[id], draggedId, targetId),
            }));
        });
    });
}

async function openSectorOrderModal(sector) {
    sectorOrderSectorId = sector.id;
    sectorOrderError.hidden = true;
    sectorOrderList.innerHTML = '';
    sectorOrderModal.hidden = false;
    expandedSectorOrderDepts = new Set();
    sectorOrderCustomAreaOrders = {};
    try {
        const [catalog, res] = await Promise.all([
            ensureDepartmentCatalog(),
            fetch(`/api/admin/business-sectors/${sector.id}/department-order`, { credentials: 'include' }),
        ]);
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        sectorOrderMasterOrder = data.masterOrder || [];
        sectorOrderCustomOrder = (data.customOrder && data.customOrder.length) ? [...data.customOrder] : [...sectorOrderMasterOrder];
        // A Departamento the catalog knows about but neither order array
        // mentions yet (added to menu.json after either order was last
        // saved) is appended at the end -- same "never silently hidden"
        // rule PermissionTree.js's own departmentOrder fallback applies.
        catalog.forEach((d) => { if (!sectorOrderCustomOrder.includes(d.id)) sectorOrderCustomOrder.push(d.id); });
        sectorOrderMasterAreaOrders = data.masterAreaOrders || {};
        sectorOrderAreaOrdersFromServer = data.customAreaOrders || {};
        renderSectorOrderList();
    } catch {
        sectorOrderError.textContent = Dashboard.t('admin.loadError');
        sectorOrderError.hidden = false;
    }
}

function closeSectorOrderModal() {
    sectorOrderModal.hidden = true;
    sectorOrderSectorId = null;
}
sectorOrderCloseBtn.addEventListener('click', closeSectorOrderModal);
sectorOrderModal.addEventListener('click', (event) => { if (event.target === sectorOrderModal) closeSectorOrderModal(); });

sectorOrderSaveBtn.addEventListener('click', async () => {
    if (!sectorOrderSectorId) return;
    sectorOrderSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/admin/business-sectors/${sectorOrderSectorId}/department-order`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            // Only departments actually expanded this session have an
            // entry in sectorOrderCustomAreaOrders -- everything else keeps
            // whatever the server already had for it, untouched.
            body: JSON.stringify({ customOrder: sectorOrderCustomOrder, customAreaOrders: sectorOrderCustomAreaOrders }),
        });
        if (!res.ok) throw new Error('save failed');
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
        closeSectorOrderModal();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    } finally {
        sectorOrderSaveBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', renderSectors);

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-business-sectors' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        renderNewSectorButton();
        await Promise.all([loadSectors(), loadSectorTypes()]);
    } catch (err) {
        console.error('Admin (Business Sectors) failed to initialize:', err);
    }
})();
