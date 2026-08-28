// ---------------------------------------------------------------------------
// "Centros de Costo" — Administración del Negocio: the client's own admin
// manages their cost center catalog, capped by clients.cost_centers_limit —
// set by GEIPSA from Contrataciones (Admin-SaaS). Shell comes from
// Dashboard.js. Código is no longer free-typed: it's built server-side from
// a cascading País > Estado > Localidad > Calle pick (each first letter)
// plus Empresa and Sucursal — see db.js's buildCostCenterCodeBase.
// ---------------------------------------------------------------------------

const tableBody = document.getElementById('cc-table-body');
const emptyMsg = document.getElementById('cc-empty');

let costCenters = [];
let limit = 0;
let newBtn = null;

// Same spot/style as Registro Combustible's own "+ Nuevo Registro" (see
// OpTransVolCombustible.js's renderNewRecordButton) -- prepended into this
// table's own zoom/pin/visibility toolbar instead of sitting in its own
// subtitled block above the filter bar, so the panel stays as compact as
// every other operational table's.
function renderNewCcButton() {
    const wrapper = document.querySelector('[data-table-id="centros-costo"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'data-table-new-record-btn';
    newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="business.ccNew">${Dashboard.t('business.ccNew')}</span>`;
    newBtn.addEventListener('click', openNewModal);
    toolbar.prepend(newBtn);
}

// Mirrors db.js's own padAccountNumber -- the raw accountNumber field is
// just an integer, padded to 6 digits only for display here.
function padAccountNumber(n) {
    return String(n).padStart(6, '0');
}

function isAtLimit() {
    return costCenters.length >= limit;
}

// No standing on-screen line for this (matches Registro Combustible's own
// fully compact panel) -- the count/limit lives as the "+ Nuevo Centro
// Costos" button's tooltip instead, still there on hover but not taking
// permanent vertical space.
function refreshLimitStatus() {
    if (!newBtn) return;
    newBtn.title = isAtLimit()
        ? Dashboard.t('business.ccLimitReached', { count: costCenters.length, limit })
        : Dashboard.t('business.ccLimitStatus', { count: costCenters.length, limit });
    newBtn.disabled = isAtLimit();
}

const CONTROL_INTERNO_COLS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];

function renderCostCenters() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = costCenters.length > 0;
    costCenters.forEach((cc) => {
        const tr = document.createElement('tr');
        // This whole screen is admin-only (see Dashboard.js's "pantalla
        // habilitada" gate) and every row here is editable via the modal
        // (openEditModal) — no per-column permission model like the
        // operational tables, so every row qualifies for the legend.
        tr.classList.add('data-table-row-editable');

        CONTROL_INTERNO_COLS.forEach((col) => {
            const td = document.createElement('td');
            td.dataset.col = col;
            td.className = 'col-system';
            td.textContent = cc[col] || '—';
            tr.appendChild(td);
        });

        const tdCode = document.createElement('td');
        tdCode.dataset.col = 'ccCode';
        tdCode.textContent = cc.code;
        // Código is generated and frozen (see buildCostCenterCodeBase) --
        // Apodo is the client's own free-text, always-editable stand-in for
        // it, click-to-edit same as every other inline cell in this app (no
        // per-column grant here: this whole screen is already
        // requireClientAdmin-gated, see the row-editable comment above).
        const tdNickname = document.createElement('td');
        tdNickname.dataset.col = 'ccNickname';
        Dashboard.attachInlineEdit(tdNickname, {
            value: cc.nickname || '',
            inputType: 'text',
            onCommit: (value) => saveCostCenterNickname(cc, value),
        });
        const tdSucursal = document.createElement('td');
        tdSucursal.dataset.col = 'ccSucursal';
        tdSucursal.textContent = cc.sucursal || '—';
        const tdName = document.createElement('td');
        tdName.dataset.col = 'ccName';
        tdName.textContent = cc.name;
        const tdResponsible = document.createElement('td');
        tdResponsible.dataset.col = 'ccResponsible';
        tdResponsible.textContent = cc.responsible || '—';
        const tdDescription = document.createElement('td');
        tdDescription.dataset.col = 'ccDescription';
        tdDescription.textContent = cc.description || '—';
        const tdAccountNumber = document.createElement('td');
        tdAccountNumber.dataset.col = 'ccAccountNumber';
        tdAccountNumber.textContent = padAccountNumber(cc.accountNumber);
        const tdRecordCode = document.createElement('td');
        tdRecordCode.dataset.col = 'ccRecordCode';
        tdRecordCode.textContent = cc.recordCode;
        const tdStatus = document.createElement('td');
        tdStatus.dataset.col = 'ccStatus';
        const statusBadge = document.createElement('span');
        statusBadge.className = `admin-badge admin-badge-${cc.status === 'inactive' ? 'inactivo' : 'activo'}`;
        statusBadge.textContent = Dashboard.t(cc.status === 'inactive' ? 'main.filterInactive' : 'main.filterActive');
        tdStatus.appendChild(statusBadge);

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';
        const historyBtn = document.createElement('button');
        historyBtn.type = 'button';
        historyBtn.className = 'admin-icon-btn';
        historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
        historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => Dashboard.openChangeHistory('centros-costo', cc.id));
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => openEditModal(cc));
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'admin-icon-btn';
        toggleBtn.innerHTML = `<i class="bx ${cc.status === 'inactive' ? 'bx-check-circle' : 'bx-x-circle'}" aria-hidden="true"></i>`;
        toggleBtn.setAttribute('aria-label', Dashboard.t(cc.status === 'inactive' ? 'admin.activate' : 'admin.deactivate'));
        toggleBtn.title = Dashboard.t(cc.status === 'inactive' ? 'admin.activate' : 'admin.deactivate');
        toggleBtn.addEventListener('click', () => toggleCostCenterStatus(cc));
        tdActions.append(historyBtn, editBtn, toggleBtn);

        tr.append(tdCode, tdNickname, tdSucursal, tdName, tdResponsible, tdDescription, tdAccountNumber, tdRecordCode, tdStatus, tdActions);
        tableBody.appendChild(tr);
    });
    refreshLimitStatus();
    applyCcFilters();
}

// Filtro panel (see Dashboard.js for the Filtrar/Limpiar toolbar buttons and
// the generic open/close wiring — this page only owns what the field means).
// Client-side row hiding, re-applied after every renderCostCenters() so a
// filter stays active across edits instead of silently resetting.
function applyCcFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    tableBody.querySelectorAll('tr').forEach((tr) => {
        if (!text) { tr.hidden = false; return; }
        const haystack = ['ccCode', 'ccNickname', 'ccSucursal', 'ccName', 'ccResponsible', 'ccDescription']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        tr.hidden = !haystack.includes(text);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyCcFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyCcFilters);

// No delete -- account_number/record_code are a permanent accounting
// sequence (see db.js's own migration comment), only Activar/Desactivar.
async function toggleCostCenterStatus(cc) {
    const nextStatus = cc.status === 'inactive' ? 'active' : 'inactive';
    try {
        const res = await fetch(`/api/business/cost-centers/${cc.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: nextStatus }),
        });
        if (!res.ok) throw new Error('save failed');
        const { costCenter } = await res.json();
        costCenters = costCenters.map((c) => (c.id === costCenter.id ? costCenter : c));
        renderCostCenters();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// Own tiny endpoint (not the full updateCostCenter/PUT-the-whole-modal
// route) since Apodo never touches código/geo -- committing it shouldn't
// need every other field resubmitted. Doesn't re-render the table (unlike
// toggleCostCenterStatus): attachInlineEdit already updates its own cell,
// and a full renderCostCenters() here would blow away the input mid-edit.
async function saveCostCenterNickname(cc, nickname) {
    try {
        const res = await fetch(`/api/business/cost-centers/${cc.id}/nickname`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ nickname }),
        });
        if (!res.ok) throw new Error('save failed');
        const { costCenter } = await res.json();
        costCenters = costCenters.map((c) => (c.id === costCenter.id ? costCenter : c));
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

async function loadCostCenters() {
    try {
        const res = await fetch('/api/business/cost-centers', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        costCenters = data.costCenters || [];
        limit = data.limit || 0;
        renderCostCenters();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.loadError'), 'error');
    }
}

// --- "+ Nuevo Centro Costos" modal ------------------------------------------
// País/Estado/Localidad/Calle cascade: each level depends on the one before
// it, and each has its own "+" to grow the (SaaS-wide shared) catalog on the
// spot. See db.js's geo_countries/geo_states/geo_localities/geo_streets.
const ccModal = document.getElementById('cc-modal');
const ccModalTitle = document.getElementById('cc-modal-title');
const idField = document.getElementById('cc-id');
const companyDisplay = document.getElementById('cc-company-display');
const sucursalField = document.getElementById('cc-sucursal');
const nameField = document.getElementById('cc-name');
const responsibleField = document.getElementById('cc-responsible');
const descriptionField = document.getElementById('cc-description');
const modalError = document.getElementById('cc-modal-error');
const modalSaveBtn = document.getElementById('cc-modal-save');
const modalCancelBtn = document.getElementById('cc-modal-cancel');
const codePreviewValue = document.getElementById('cc-code-preview-value');

// Municipio sits alongside Localidad -- both are children of Estado (see
// db.js's geo_municipalities comment) rather than Localidad nesting inside
// it, so a cost center created before Municipio existed keeps reloading its
// already-picked Localidad exactly as before (still keyed off state_id) the
// first time someone opens it for edit.
const LEVEL_ORDER = ['country', 'state', 'municipality', 'locality', 'street'];
const cascadeLevels = {
    country: {
        select: document.getElementById('cc-country'), addToggle: document.getElementById('cc-country-add-toggle'),
        addRow: document.getElementById('cc-country-add-row'), addInput: document.getElementById('cc-country-add-input'),
        addConfirm: document.getElementById('cc-country-add-confirm'), items: [], parent: null,
        listUrl: () => '/api/business/geo/countries',
        createUrl: () => '/api/business/geo/countries',
        createBody: (name) => ({ name }),
        titleKey: 'business.ccAddNewCountry',
    },
    state: {
        select: document.getElementById('cc-state'), addToggle: document.getElementById('cc-state-add-toggle'),
        addRow: document.getElementById('cc-state-add-row'), addInput: document.getElementById('cc-state-add-input'),
        addConfirm: document.getElementById('cc-state-add-confirm'), items: [], parent: 'country',
        listUrl: (parentId) => `/api/business/geo/states?countryId=${parentId}`,
        createUrl: () => '/api/business/geo/states',
        createBody: (name, parentId) => ({ countryId: parentId, name }),
        titleKey: 'business.ccAddNewState',
    },
    municipality: {
        select: document.getElementById('cc-municipality'), addToggle: document.getElementById('cc-municipality-add-toggle'),
        addRow: document.getElementById('cc-municipality-add-row'), addInput: document.getElementById('cc-municipality-add-input'),
        addConfirm: document.getElementById('cc-municipality-add-confirm'), items: [], parent: 'state',
        listUrl: (parentId) => `/api/business/geo/municipalities?stateId=${parentId}`,
        createUrl: () => '/api/business/geo/municipalities',
        createBody: (name, parentId) => ({ stateId: parentId, name }),
        titleKey: 'business.ccAddNewMunicipality',
    },
    locality: {
        select: document.getElementById('cc-locality'), addToggle: document.getElementById('cc-locality-add-toggle'),
        addRow: document.getElementById('cc-locality-add-row'), addInput: document.getElementById('cc-locality-add-input'),
        addConfirm: document.getElementById('cc-locality-add-confirm'), items: [], parent: 'state',
        listUrl: (parentId) => `/api/business/geo/localities?stateId=${parentId}`,
        createUrl: () => '/api/business/geo/localities',
        createBody: (name, parentId) => ({ stateId: parentId, name }),
        titleKey: 'business.ccAddNewLocality',
    },
    street: {
        select: document.getElementById('cc-street'), addToggle: document.getElementById('cc-street-add-toggle'),
        addRow: document.getElementById('cc-street-add-row'), addInput: document.getElementById('cc-street-add-input'),
        addConfirm: document.getElementById('cc-street-add-confirm'), items: [], parent: 'locality',
        listUrl: (parentId) => `/api/business/geo/streets?localityId=${parentId}`,
        createUrl: () => '/api/business/geo/streets',
        createBody: (name, parentId) => ({ localityId: parentId, name }),
        titleKey: 'business.ccAddNewStreet',
    },
};

function firstLetter(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().charAt(0).toUpperCase() || '_';
}

function updateCodePreview() {
    const companyLetter = firstLetter(clientBranding?.companyAbbreviation || clientBranding?.companyName);
    const levelLetters = LEVEL_ORDER.map((key) => {
        const level = cascadeLevels[key];
        const item = level.items.find((i) => String(i.id) === String(level.select.value));
        return firstLetter(item?.name);
    });
    const sucursalLetter = firstLetter(sucursalField.value);
    codePreviewValue.textContent = `${companyLetter}${levelLetters.join('')}${sucursalLetter}`;
}

function populateSelect(selectEl, items) {
    selectEl.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = items.length ? Dashboard.t('business.ccSelectPlaceholder') : Dashboard.t('business.ccNoOptionsYet');
    selectEl.appendChild(placeholder);
    items.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        selectEl.appendChild(opt);
    });
}

// parentId === null means "this level's own prerequisite isn't chosen yet"
// (only meaningful for state/locality/street) -- country has no parent, so
// it always loads its full list regardless of what's passed here.
async function loadLevel(levelKey, parentId) {
    const level = cascadeLevels[levelKey];
    if (level.parent && !parentId) {
        level.items = [];
        populateSelect(level.select, []);
        level.select.querySelector('option').textContent = Dashboard.t('business.ccSelectParentFirst');
        level.select.disabled = true;
        level.addToggle.disabled = true;
        level.addRow.hidden = true;
        return;
    }
    try {
        const res = await fetch(level.listUrl(parentId), { credentials: 'include' });
        level.items = res.ok ? (await res.json()).items || [] : [];
    } catch {
        level.items = [];
    }
    populateSelect(level.select, level.items);
    level.select.disabled = false;
    level.addToggle.disabled = false;
}

LEVEL_ORDER.forEach((levelKey, idx) => {
    const level = cascadeLevels[levelKey];
    level.select.addEventListener('change', async () => {
        // Reloads only levels that actually DESCEND from this one (tracked
        // via `affected`, keyed off each level's own declared .parent) --
        // not just "everything after it in display order". Municipio and
        // Localidad are siblings that both read Estado directly: changing
        // Municipio must NOT wipe out an already-picked Localidad/Calle,
        // since neither one depends on Municipio at all.
        const affected = new Set([levelKey]);
        for (let i = idx + 1; i < LEVEL_ORDER.length; i++) {
            const childKey = LEVEL_ORDER[i];
            const child = cascadeLevels[childKey];
            if (!child.parent || !affected.has(child.parent)) continue;
            await loadLevel(childKey, cascadeLevels[child.parent].select.value || null);
            affected.add(childKey);
        }
        updateCodePreview();
    });
    level.addToggle.addEventListener('click', () => {
        level.addRow.hidden = !level.addRow.hidden;
        if (!level.addRow.hidden) level.addInput.focus();
    });
    level.addConfirm.addEventListener('click', async () => {
        const name = level.addInput.value.trim();
        if (!name) return;
        const parentId = level.parent ? cascadeLevels[level.parent].select.value : null;
        level.addConfirm.disabled = true;
        try {
            const res = await fetch(level.createUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(level.createBody(name, parentId)),
            });
            if (!res.ok) throw new Error('create failed');
            const { item } = await res.json();
            await loadLevel(levelKey, parentId);
            level.select.value = item.id;
            level.addInput.value = '';
            level.addRow.hidden = true;
            level.select.dispatchEvent(new Event('change'));
        } catch {
            Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        } finally {
            level.addConfirm.disabled = false;
        }
    });
});
sucursalField.addEventListener('input', updateCodePreview);

function resetCascadeAddRows() {
    LEVEL_ORDER.forEach((key) => {
        const level = cascadeLevels[key];
        level.addRow.hidden = true;
        level.addInput.value = '';
    });
}

async function openNewModal() {
    idField.value = '';
    ccModalTitle.textContent = Dashboard.t('business.ccModalTitleNew');
    companyDisplay.textContent = clientBranding?.companyName || '—';
    sucursalField.value = '';
    nameField.value = '';
    responsibleField.value = '';
    descriptionField.value = '';
    modalError.hidden = true;
    resetCascadeAddRows();

    await loadLevel('country', null);
    await loadLevel('state', null);
    await loadLevel('municipality', null);
    await loadLevel('locality', null);
    await loadLevel('street', null);
    updateCodePreview();
    ccModal.hidden = false;
}

async function openEditModal(cc) {
    idField.value = cc.id;
    ccModalTitle.textContent = Dashboard.t('business.ccModalTitleEdit');
    companyDisplay.textContent = clientBranding?.companyName || '—';
    sucursalField.value = cc.sucursal || '';
    nameField.value = cc.name;
    responsibleField.value = cc.responsible || '';
    descriptionField.value = cc.description || '';
    modalError.hidden = true;
    resetCascadeAddRows();

    await loadLevel('country', null);
    cascadeLevels.country.select.value = cc.countryId || '';
    await loadLevel('state', cc.countryId || null);
    cascadeLevels.state.select.value = cc.stateId || '';
    // Municipio and Localidad are independent siblings under Estado (see
    // the LEVEL_ORDER comment above) -- a cost center from before Municipio
    // existed just has municipalityId blank here, which reloadLevel already
    // renders as its own normal "nothing selected" state.
    await loadLevel('municipality', cc.stateId || null);
    cascadeLevels.municipality.select.value = cc.municipalityId || '';
    await loadLevel('locality', cc.stateId || null);
    cascadeLevels.locality.select.value = cc.localityId || '';
    await loadLevel('street', cc.localityId || null);
    cascadeLevels.street.select.value = cc.streetId || '';

    updateCodePreview();
    ccModal.hidden = false;
}

function closeCcModal() {
    ccModal.hidden = true;
}

async function saveCcModal() {
    modalError.hidden = true;
    const countryId = Number(cascadeLevels.country.select.value) || null;
    const stateId = Number(cascadeLevels.state.select.value) || null;
    const municipalityId = Number(cascadeLevels.municipality.select.value) || null;
    const localityId = Number(cascadeLevels.locality.select.value) || null;
    const streetId = Number(cascadeLevels.street.select.value) || null;
    const sucursal = sucursalField.value.trim();
    const name = nameField.value.trim();
    if (!countryId || !stateId || !municipalityId || !localityId || !streetId || !sucursal || !name) {
        modalError.textContent = Dashboard.t('admin.requiredFields');
        modalError.hidden = false;
        return;
    }
    const responsible = responsibleField.value.trim();
    const description = descriptionField.value.trim();
    const editingId = idField.value;
    const url = editingId ? `/api/business/cost-centers/${editingId}` : '/api/business/cost-centers';
    const method = editingId ? 'PATCH' : 'POST';

    modalSaveBtn.disabled = true;
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ countryId, stateId, municipalityId, localityId, streetId, sucursal, name, responsible, description }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            modalError.textContent = body.message === 'Cost center limit reached for this client.'
                ? Dashboard.t('business.ccLimitReached', { count: costCenters.length, limit })
                : (body.message || Dashboard.t('admin.saveError'));
            modalError.hidden = false;
            return;
        }
        const { costCenter } = await res.json();
        if (editingId) {
            costCenters = costCenters.map((c) => (c.id === costCenter.id ? costCenter : c));
        } else {
            costCenters = [...costCenters, costCenter].sort((a, b) => a.code.localeCompare(b.code));
        }
        renderCostCenters();
        closeCcModal();
        Dashboard.showToast(Dashboard.t(editingId ? 'main.changeSaved' : 'main.recordSaved'), 'success');
    } catch {
        modalError.textContent = Dashboard.t('admin.saveError');
        modalError.hidden = false;
    } finally {
        modalSaveBtn.disabled = false;
    }
}

modalSaveBtn.addEventListener('click', saveCcModal);
modalCancelBtn.addEventListener('click', closeCcModal);
ccModal.addEventListener('click', (event) => {
    if (event.target === ccModal) closeCcModal();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !ccModal.hidden) closeCcModal();
});

document.addEventListener('dashboard:language-changed', () => {
    renderCostCenters();
    LEVEL_ORDER.forEach((key) => {
        const level = cascadeLevels[key];
        level.addToggle.title = Dashboard.t(level.titleKey);
        if (!level.select.disabled) {
            const placeholder = level.select.querySelector('option[value=""]');
            if (placeholder) placeholder.textContent = level.items.length ? Dashboard.t('business.ccSelectPlaceholder') : Dashboard.t('business.ccNoOptionsYet');
        }
    });
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'business-centros-costo' });
        if (!role) return;
        renderNewCcButton();
        LEVEL_ORDER.forEach((key) => {
            cascadeLevels[key].addToggle.title = Dashboard.t(cascadeLevels[key].titleKey);
        });
        await loadCostCenters();
    } catch (err) {
        console.error('Business (Centros de Costo) failed to initialize:', err);
    }
})();
