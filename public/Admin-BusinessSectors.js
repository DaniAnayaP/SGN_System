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
        statusBadge.textContent = Dashboard.t(sector.status === 'inactive' ? 'main.filterInactive' : 'main.filterActive');
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
        treeBtn.setAttribute('aria-label', Dashboard.t('admin.sectorTreeTitle'));
        treeBtn.title = Dashboard.t('admin.sectorTreeTitle');
        treeBtn.innerHTML = '<i class="bx bx-shield" aria-hidden="true"></i>';
        treeBtn.addEventListener('click', () => openSectorTreeModal(sector));

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

        tdActions.append(treeBtn, previewBtn, editBtn, historyBtn, toggleBtn);
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

// --- Default access tree per sector (mirrors Business-Roles.js's per-
// Puesto panel, opened as a modal instead of an inline panel — same
// "pantalla alterna" idea Nuestros Planes' own tree modal already uses) ---
const sectorTreeModal = document.getElementById('sector-tree-modal');
const sectorTreeModalTitle = document.getElementById('sector-tree-modal-title');
const sectorTreeContainer = document.getElementById('sector-tree-container');
const sectorTreeError = document.getElementById('sector-tree-error');
const sectorTreeSaveBtn = document.getElementById('sector-tree-save');
const sectorTreeCloseBtn = document.getElementById('sector-tree-close');
const sectorTreeEqualizeBtn = document.getElementById('sector-tree-equalize-app');
sectorTreeEqualizeBtn.addEventListener('click', () => sectorTree?.equalizeAllAppToWeb());
const sectorTreeFillMissingBtn = document.getElementById('sector-tree-fill-missing-app');
sectorTreeFillMissingBtn.addEventListener('click', () => sectorTree?.fillAllMissingAppToWeb());

let sectorTree = null;
let selectedSectorId = null;

async function openSectorTreeModal(sector) {
    selectedSectorId = sector.id;
    sectorTreeModalTitle.textContent = `${Dashboard.t('admin.sectorTreeTitle')} — ${sector.name}`;
    sectorTreeError.hidden = true;
    sectorTreeContainer.innerHTML = '';
    sectorTreeModal.hidden = false;
    try {
        const res = await fetch(`/api/admin/business-sectors/${sector.id}/grants`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        sectorTree = window.PermissionTree.create(sectorTreeContainer, { showAppTab: true });
        await sectorTree.init(data.grants || []);
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
