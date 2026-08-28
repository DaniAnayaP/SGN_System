// ---------------------------------------------------------------------------
// Nuestras Unidades (Operaciones > Transporte Volumen) — the client's real
// fleet: one row per physical vehicle, identified by its own Económico
// (the id the CLIENT assigns, unique per client), referencing which Tipo de
// Unidad it is (see CatTransVolTiposUnidades.js). Carga Combustible reads
// this by Económico to SUGGEST Tipo Combustible — never blocks/forces it.
//
// "+ Nueva Unidad" creates a blank row — every field is filled in later by
// clicking directly on the cell, same convention as Carga Combustible/Tipos
// de Unidad. Persisted via /api/business/fleet-units.
// ---------------------------------------------------------------------------
let unitTypesCache = [];

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-transporte-vol-nuestras-unidades' });
        if (!role) return;
        renderNewRecordButton();
        await loadUnitTypesCache();
        await refreshTable();
    } catch (err) {
        console.error('Nuestras Unidades failed to initialize:', err);
    }
})();

const TABLE_KEY = 'nuestras-unidades';

async function loadUnitTypesCache() {
    try {
        const res = await fetch('/api/business/unit-types', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { unitTypes } = await res.json();
        unitTypesCache = unitTypes;
    } catch (err) {
        console.error('Nuestras Unidades: failed to load Tipos de Unidad', err);
        unitTypesCache = [];
    }
}

function textCell(key, value) {
    const td = document.createElement('td');
    td.dataset.col = key;
    td.textContent = value || '—';
    return td;
}

function textCellSystem(key, value) {
    const td = textCell(key, value);
    td.classList.add('col-system');
    return td;
}

const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
function buildSystemCells(record) {
    return SYSTEM_COLUMN_KEYS.map((key) => textCellSystem(key, record[key]));
}

function isPending(record, key) {
    return (record.pendingFields || []).includes(key);
}

async function patchFleetUnit(id, patch) {
    try {
        const res = await fetch(`/api/business/fleet-units/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(body.message === 'That Económico is already registered to another unit.' ? Dashboard.t('main.fleetEcoDuplicate') : (body.message || Dashboard.t('admin.saveError')), 'error');
            await refreshTable();
            return;
        }
        const body = await res.json().catch(() => ({}));
        if (body.rejectedFields?.length) {
            Dashboard.showToast(`${Dashboard.t('main.fieldLocked')}: ${body.rejectedFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'warning');
        } else if (body.pendingFields?.length) {
            Dashboard.showToast(`${Dashboard.t('main.changePending')}: ${body.pendingFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'info');
        }
        await refreshTable();
    } catch (err) {
        console.error('Nuestras Unidades: failed to save change', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        await refreshTable();
    }
}

// Tipo de Unidad — a real <select> referencing the Tipos de Unidad catalog
// (unitTypesCache), same always-live pattern as Tipo Combustible elsewhere.
function buildUnitTypeCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colFleetUnitType';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = Dashboard.t('main.fleetUnitTypeSelect');
    select.appendChild(placeholder);
    unitTypesCache.forEach((ut) => {
        const opt = document.createElement('option');
        opt.value = String(ut.id);
        opt.textContent = ut.name || ut.code;
        select.appendChild(opt);
    });
    select.value = record.unitTypeId ? String(record.unitTypeId) : '';
    select.disabled = isPending(record, 'unitTypeId') || !Dashboard.canEditField(TABLE_KEY, 'colFleetUnitType', record.unitTypeId ? String(record.unitTypeId) : '');
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'unitTypeId') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => patchFleetUnit(record.id, { unitTypeId: select.value ? Number(select.value) : null }));
    td.appendChild(select);
    return td;
}

function buildStatusCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colFleetStatus';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    select.innerHTML = `
        <option value="" data-i18n="main.fuelTypeSelect">${Dashboard.t('main.fuelTypeSelect')}</option>
        <option value="active" data-i18n="admin.statusActivo">${Dashboard.t('admin.statusActivo')}</option>
        <option value="inactive" data-i18n="admin.statusInactivo">${Dashboard.t('admin.statusInactivo')}</option>
    `;
    select.value = record.status || '';
    select.disabled = isPending(record, 'status') || !Dashboard.canEditField(TABLE_KEY, 'colFleetStatus', record.status || '');
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'status') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => patchFleetUnit(record.id, { status: select.value }));
    td.appendChild(select);
    return td;
}

function buildActionsCell(record, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'admin-icon-btn';
    historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
    historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
    historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    historyBtn.addEventListener('click', () => Dashboard.openChangeHistory(TABLE_KEY, record.id));
    td.appendChild(historyBtn);
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
    deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
    deleteBtn.title = Dashboard.t('admin.delete');
    deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
    deleteBtn.addEventListener('click', () => deleteFleetUnit(record.id, tr));
    td.appendChild(deleteBtn);
    return td;
}

async function deleteFleetUnit(id, tr) {
    if (!(await Dashboard.confirm(Dashboard.t('main.recordDeleteConfirm')))) return;
    try {
        const res = await fetch(`/api/business/fleet-units/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        tr.remove();
        ensureEmptyState();
    } catch (err) {
        console.error('Nuestras Unidades: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

function buildRow(record) {
    const tdEco = document.createElement('td');
    tdEco.dataset.col = 'colFleetEco';
    Dashboard.attachInlineEdit(tdEco, {
        value: record.ecoId || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colFleetEco',
        pending: isPending(record, 'ecoId'),
        onCommit: (val) => patchFleetUnit(record.id, { ecoId: val.trim() }),
    });

    const tdPlates = document.createElement('td');
    tdPlates.dataset.col = 'colFleetPlates';
    Dashboard.attachInlineEdit(tdPlates, {
        value: record.plates || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colFleetPlates',
        pending: isPending(record, 'plates'),
        onCommit: (val) => patchFleetUnit(record.id, { plates: val.trim() }),
    });

    const tdBrandModel = document.createElement('td');
    tdBrandModel.dataset.col = 'colFleetBrandModel';
    Dashboard.attachInlineEdit(tdBrandModel, {
        value: record.brandModel || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colFleetBrandModel',
        pending: isPending(record, 'brandModel'),
        onCommit: (val) => patchFleetUnit(record.id, { brandModel: val.trim() }),
    });

    const tdYear = document.createElement('td');
    tdYear.dataset.col = 'colFleetYear';
    Dashboard.attachInlineEdit(tdYear, {
        value: record.year || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colFleetYear',
        pending: isPending(record, 'year'),
        onCommit: (val) => patchFleetUnit(record.id, { year: val.trim() }),
    });

    const tr = document.createElement('tr');
    tr.dataset.recordId = String(record.id);
    tr.append(
        ...buildSystemCells(record),
        tdEco,
        buildUnitTypeCell(record),
        tdPlates,
        tdBrandModel,
        tdYear,
        buildStatusCell(record),
        buildActionsCell(record, tr),
    );
    tr.classList.toggle('data-table-row-editable', !!tr.querySelector('td.editable-cell'));
    return tr;
}

function getTbody() {
    return document.querySelector('[data-table-id="nuestras-unidades"] table.data-table').tBodies[0];
}

function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = 20;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = Dashboard.t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}

async function refreshTable() {
    const tbody = getTbody();
    if (tbody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    try {
        const res = await fetch('/api/business/fleet-units', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { fleetUnits } = await res.json();
        tbody.innerHTML = '';
        if (!fleetUnits.length) { ensureEmptyState(); return; }
        fleetUnits.forEach((record) => tbody.appendChild(buildRow(record)));
        applyFleetFilters();
    } catch (err) {
        console.error('Nuestras Unidades: failed to load records', err);
    }
}

function applyFleetFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        const haystack = ['colFleetEco', 'colFleetPlates', 'colFleetBrandModel']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        tr.hidden = !haystack.includes(text);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFleetFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFleetFilters);

async function createNewFleetUnit() {
    try {
        const res = await fetch('/api/business/fleet-units', { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error('save failed');
        const { fleetUnit } = await res.json();
        const tbody = getTbody();
        const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
        if (emptyRow) emptyRow.remove();
        tbody.appendChild(buildRow(fleetUnit));
        Dashboard.showToast(Dashboard.t('main.recordSaved'), 'success');
    } catch (err) {
        console.error('Nuestras Unidades: failed to create record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

function renderNewRecordButton() {
    const wrapper = document.querySelector('[data-table-id="nuestras-unidades"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.newFleetUnit">${Dashboard.t('main.newFleetUnit')}</span>`;
    btn.addEventListener('click', createNewFleetUnit);
    toolbar.prepend(btn);
}
