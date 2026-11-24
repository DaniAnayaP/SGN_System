// ---------------------------------------------------------------------------
// "Centros de Costo" — Administración del Negocio: the client's own admin
// manages their cost center catalog, capped by clients.cost_centers_limit —
// set by GEIPSA from Contrataciones (Admin-SaaS). Shell comes from
// Dashboard.js. Un centro de costos cuelga de UN solo sitio (Sitios Contratados:
// un sitio tiene varios centros): aquí solo se elige el sitio (su ubicación y su
// sucursal vienen de él) y se pone lo del centro — nombre, abreviatura de 3 letras
// (arma su código: código del sitio + abreviatura), responsable y descripción.
// ---------------------------------------------------------------------------

const tableBody = document.getElementById('cc-table-body');
const emptyMsg = document.getElementById('cc-empty');

let costCenters = [];
let limit = 0;
let sites = []; // los sitios del cliente (activos e inactivos), con su ubicación
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
    newBtn.addEventListener('click', () => { if (!newBtn.disabled) openNewModal(); });
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
const activeSites = () => sites.filter((s) => s.status === 'active');
const siteByCode = (code) => sites.find((s) => s.code === code) || null;
const siteLocation = (site) => (site ? [site.state, site.municipality, site.locality, site.street].filter(Boolean).join(' · ') : '');

// No standing on-screen line for this (matches Registro Combustible's own
// fully compact panel) -- the count/limit lives as the "+ Nuevo Centro
// Costos" button's tooltip instead, still there on hover but not taking
// permanent vertical space. Sin ningún sitio activo no se puede dar de alta un centro (primero se da de alta el sitio).
function refreshLimitStatus() {
    if (!newBtn) return;
    const noSites = activeSites().length === 0;
    newBtn.title = isAtLimit()
        ? Dashboard.t('business.ccLimitReached', { count: costCenters.length, limit })
        : (noSites ? Dashboard.t('business.ccNoSites') : Dashboard.t('business.ccLimitStatus', { count: costCenters.length, limit }));
    newBtn.disabled = isAtLimit() || noSites;
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
        // Código is generated and frozen (código del sitio + abreviatura) --
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
        const tdSiteCode = document.createElement('td');
        tdSiteCode.dataset.col = 'ccSiteCode';
        tdSiteCode.textContent = cc.siteCode || '—';
        const tdAbbreviation = document.createElement('td');
        tdAbbreviation.dataset.col = 'ccAbbreviation';
        tdAbbreviation.textContent = cc.abbreviation || '—';
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
        historyBtn.setAttribute('data-help-key', 'changeHistory');
        historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
        historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => Dashboard.openChangeHistory('centros-costo', cc.id));
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('data-help-key', 'edit');
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => openEditModal(cc));
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'admin-icon-btn';
        toggleBtn.innerHTML = `<i class="bx ${cc.status === 'inactive' ? 'bx-check-circle' : 'bx-x-circle'}" aria-hidden="true"></i>`;
        toggleBtn.setAttribute('data-help-key', cc.status === 'inactive' ? 'activate' : 'deactivate');
        toggleBtn.setAttribute('aria-label', Dashboard.t(cc.status === 'inactive' ? 'admin.activate' : 'admin.deactivate'));
        toggleBtn.title = Dashboard.t(cc.status === 'inactive' ? 'admin.activate' : 'admin.deactivate');
        toggleBtn.addEventListener('click', () => toggleCostCenterStatus(cc));
        tdActions.append(historyBtn, editBtn, toggleBtn);

        tr.append(tdCode, tdSiteCode, tdAbbreviation, tdNickname, tdSucursal, tdName, tdResponsible, tdDescription, tdAccountNumber, tdRecordCode, tdStatus, tdActions);
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
        const haystack = ['ccCode', 'ccSiteCode', 'ccAbbreviation', 'ccNickname', 'ccSucursal', 'ccName', 'ccResponsible', 'ccDescription']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        tr.hidden = !SearchSyntax.matches('contains', text, haystack);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyCcFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyCcFilters);

// Lo que dicen los errores del servidor (traen un `code`, no un texto en español).
function errorText(body) {
    const keys = {
        SITE_REQUIRED: 'business.ccSiteRequired',
        SITE_NOT_FOUND: 'business.ccSiteNotFound',
        SITE_INACTIVE: 'business.ccSiteInactive',
        ABBREVIATION_INVALID: 'business.ccAbbreviationInvalid',
        ABBREVIATION_TAKEN: 'business.ccAbbreviationTaken',
        CC_CODE_EXISTS: 'business.ccCodeExists',
    };
    if (body && body.code === 'CC_LIMIT') return Dashboard.t('business.ccLimitReached', { count: costCenters.length, limit });
    if (body && body.code === 'CC_NAME_REQUIRED') return Dashboard.t('business.ccMissingFields', { fields: Dashboard.t('business.ccName') });
    return Dashboard.t(keys[body && body.code] || 'admin.saveError');
}

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
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(errorText(body), 'error');
            return;
        }
        const { costCenter } = await res.json();
        costCenters = costCenters.map((c) => (c.id === costCenter.id ? costCenter : c));
        renderCostCenters();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// Own tiny endpoint (not the full updateCostCenter/PUT-the-whole-modal
// route) since Apodo never touches código -- committing it shouldn't
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

async function loadSites() {
    try {
        const res = await fetch('/api/business/sites', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        sites = (await res.json()).sites || [];
    } catch {
        sites = [];
    }
}
async function loadCostCenters() {
    try {
        await loadSites();
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
const ccModal = document.getElementById('cc-modal');
const ccModalTitle = document.getElementById('cc-modal-title');
const idField = document.getElementById('cc-id');
const companyDisplay = document.getElementById('cc-company-display');
const siteField = document.getElementById('cc-site');
const siteLocationField = document.getElementById('cc-site-location');
const nameField = document.getElementById('cc-name');
const abbreviationField = document.getElementById('cc-abbreviation');
const responsibleField = document.getElementById('cc-responsible');
const descriptionField = document.getElementById('cc-description');
const modalError = document.getElementById('cc-modal-error');
const modalSaveBtn = document.getElementById('cc-modal-save');
const modalCancelBtn = document.getElementById('cc-modal-cancel');
const codePreviewValue = document.getElementById('cc-code-preview-value');

// Los códigos cortos son solo letras A–Z sin acentos y en mayúsculas.
function cleanShortCode(value, length) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, length);
}
abbreviationField.addEventListener('input', () => {
    const clean = cleanShortCode(abbreviationField.value, 3);
    if (abbreviationField.value !== clean) abbreviationField.value = clean;
    updateCodePreview();
});

// El código nuevo es el código del sitio + la abreviatura; un centro ya guardado conserva el suyo (el de antes, o el que se armó al crearlo).
function updateCodePreview() {
    const editing = idField.value ? costCenters.find((c) => String(c.id) === String(idField.value)) : null;
    if (editing) { // el código de un centro ya guardado no cambia (aunque ahora se le ponga su abreviatura)
        codePreviewValue.textContent = editing.code;
        return;
    }
    const abbreviation = cleanShortCode(abbreviationField.value, 3);
    codePreviewValue.textContent = `${siteField.value || '_____'}-${abbreviation || '___'}`;
}
function updateSiteLocation() {
    siteLocationField.textContent = siteLocation(siteByCode(siteField.value)) || '—';
}
siteField.addEventListener('change', () => { updateSiteLocation(); updateCodePreview(); });

// La lista trae los sitios activos (código · sucursal); un centro que ya tiene sitio lo muestra aunque ese sitio esté inactivo.
function fillSiteList(selectedCode) {
    const options = activeSites().slice();
    const current = selectedCode ? siteByCode(selectedCode) : null;
    if (current && !options.some((s) => s.code === current.code)) options.push(current);
    siteField.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = options.length ? Dashboard.t('business.ccSelectPlaceholder') : Dashboard.t('business.ccNoSites');
    siteField.appendChild(placeholder);
    options.sort((a, b) => a.code.localeCompare(b.code)).forEach((site) => {
        const option = document.createElement('option');
        option.value = site.code;
        option.textContent = site.sucursal ? `${site.code} · ${site.sucursal}` : site.code;
        siteField.appendChild(option);
    });
    siteField.value = selectedCode || '';
}

function openNewModal() {
    idField.value = '';
    ccModalTitle.textContent = Dashboard.t('business.ccModalTitleNew');
    companyDisplay.textContent = clientBranding?.companyName || '—';
    fillSiteList('');
    siteField.disabled = false;
    nameField.value = '';
    abbreviationField.value = '';
    abbreviationField.disabled = false;
    responsibleField.value = '';
    descriptionField.value = '';
    modalError.hidden = true;
    updateSiteLocation();
    updateCodePreview();
    ccModal.hidden = false;
    siteField.focus();
}

// El sitio y la abreviatura (que arma el código) no cambian una vez guardados; un centro de antes que todavía no los tiene los pone ahora, una vez.
function openEditModal(cc) {
    idField.value = cc.id;
    ccModalTitle.textContent = Dashboard.t('business.ccModalTitleEdit');
    companyDisplay.textContent = clientBranding?.companyName || '—';
    fillSiteList(cc.siteCode || '');
    siteField.disabled = !!cc.siteCode;
    nameField.value = cc.name;
    abbreviationField.value = cc.abbreviation || '';
    abbreviationField.disabled = !!cc.abbreviation;
    responsibleField.value = cc.responsible || '';
    descriptionField.value = cc.description || '';
    modalError.hidden = true;
    updateSiteLocation();
    updateCodePreview();
    ccModal.hidden = false;
}

function closeCcModal() {
    ccModal.hidden = true;
}

async function saveCcModal() {
    modalError.hidden = true;
    const siteCode = siteField.value;
    const name = nameField.value.trim();
    const abbreviation = cleanShortCode(abbreviationField.value, 3);
    // Dice QUÉ falta.
    const missing = [];
    if (!siteCode) missing.push(Dashboard.t('business.ccSite'));
    if (!name) missing.push(Dashboard.t('business.ccName'));
    if (missing.length) {
        modalError.textContent = Dashboard.t('business.ccMissingFields', { fields: missing.join(', ') });
        modalError.hidden = false;
        return;
    }
    if (abbreviation.length !== 3) {
        modalError.textContent = Dashboard.t('business.ccAbbreviationInvalid');
        modalError.hidden = false;
        abbreviationField.focus();
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
            body: JSON.stringify({ siteCode, abbreviation, name, responsible, description }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            modalError.textContent = errorText(body);
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
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'business-centros-costo' });
        if (!role) return;
        renderNewCcButton();
        await loadCostCenters();
    } catch (err) {
        console.error('Business (Centros de Costo) failed to initialize:', err);
    }
})();
