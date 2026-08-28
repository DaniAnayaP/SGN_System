// ---------------------------------------------------------------------------
// Tipos de Unidad (Catálogos > Transporte Volumen) — the classification the
// automakers already define (Tracto Camión, Camioneta, Sedán...), each with
// its own Tipo Combustible. "+ Nuevo Tipo de Unidad" creates a blank row
// (code auto-generated) — every other field is filled in later by clicking
// directly on the cell, same convention as Carga Combustible.
//
// Persisted via /api/business/unit-types (see server.js + db.js unit_types
// table): POST on "+ Nuevo Tipo de Unidad", PATCH per field the moment an
// inline edit commits.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-catalogos-transporte-vol-tipos-unidades' });
        if (!role) return;
        renderNewRecordButton();
        await refreshTable();
    } catch (err) {
        console.error('Tipos de Unidad failed to initialize:', err);
    }
})();

const TABLE_KEY = 'tipos-unidad';

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

// A draft row (record.id === null, never persisted -- see createNewUnitType)
// only actually gets created on the server once its FIRST field commits, so
// "+ Nuevo Tipo de Unidad" followed by leaving the row untouched never
// leaves a blank type behind. Every cell's onCommit/onChange in buildRow
// goes through this instead of calling patchUnitType directly. Subsequent
// edits on the same row hit the normal path -- once created, patchUnitType's
// own refreshTable() rebuilds the row from the real, persisted record.
async function ensureCreatedThenPatch(record, patch) {
    if (record.id) return patchUnitType(record.id, patch);
    try {
        const res = await fetch('/api/business/unit-types', { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error('create failed');
        const { unitType } = await res.json();
        record.id = unitType.id;
        await patchUnitType(unitType.id, patch);
    } catch (err) {
        console.error('Tipos de Unidad: failed to create record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

async function patchUnitType(id, patch) {
    try {
        const res = await fetch(`/api/business/unit-types/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'error');
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
        console.error('Tipos de Unidad: failed to save change', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        await refreshTable();
    }
}

// Tipo Combustible — a real <select>, always live in the cell, same pattern
// as Registro Combustible/Carga Combustible's own colFuelType, reusing the
// exact same 3 values so a suggestion built from here needs no translation.
function buildFuelTypeCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colFuelType';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    select.innerHTML = `
        <option value="" data-i18n="main.fuelTypeSelect">${Dashboard.t('main.fuelTypeSelect')}</option>
        <optgroup label="${Dashboard.t('main.fuelTypeGasolineGroup')}">
            <option value="magna" data-i18n="main.fuelTypeMagna">${Dashboard.t('main.fuelTypeMagna')}</option>
            <option value="premium" data-i18n="main.fuelTypePremium">${Dashboard.t('main.fuelTypePremium')}</option>
        </optgroup>
        <option value="diesel" data-i18n="main.fuelTypeDiesel">${Dashboard.t('main.fuelTypeDiesel')}</option>
    `;
    select.value = record.fuelType || '';
    select.disabled = isPending(record, 'fuelType') || !Dashboard.canEditField(TABLE_KEY, 'colFuelType', record.fuelType || '');
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'fuelType') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => ensureCreatedThenPatch(record, { fuelType: select.value }));
    td.appendChild(select);
    return td;
}

function buildStatusCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colUnitTypeStatus';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    select.innerHTML = `
        <option value="" data-i18n="main.fuelTypeSelect">${Dashboard.t('main.fuelTypeSelect')}</option>
        <option value="active" data-i18n="admin.statusActivo">${Dashboard.t('admin.statusActivo')}</option>
        <option value="inactive" data-i18n="admin.statusInactivo">${Dashboard.t('admin.statusInactivo')}</option>
    `;
    select.value = record.status || '';
    select.disabled = isPending(record, 'status') || !Dashboard.canEditField(TABLE_KEY, 'colUnitTypeStatus', record.status || '');
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'status') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => ensureCreatedThenPatch(record, { status: select.value }));
    td.appendChild(select);
    return td;
}

function buildActionsCell(record, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    // A draft (record.id === null) was never persisted -- no history to
    // show, and removing it is just discarding the row, no API call.
    if (record.id) {
        const historyBtn = document.createElement('button');
        historyBtn.type = 'button';
        historyBtn.className = 'admin-icon-btn';
        historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
        historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => Dashboard.openChangeHistory(TABLE_KEY, record.id));
        td.appendChild(historyBtn);
    }
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
    deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
    deleteBtn.title = Dashboard.t('admin.delete');
    deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
    deleteBtn.addEventListener('click', () => {
        if (!record.id) { tr.remove(); ensureEmptyState(); return; }
        deleteUnitType(record.id, tr);
    });
    td.appendChild(deleteBtn);
    return td;
}

async function deleteUnitType(id, tr) {
    if (!(await Dashboard.confirm(Dashboard.t('main.recordDeleteConfirm')))) return;
    try {
        const res = await fetch(`/api/business/unit-types/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        tr.remove();
        ensureEmptyState();
    } catch (err) {
        console.error('Tipos de Unidad: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

function buildRow(record) {
    const tdName = document.createElement('td');
    tdName.dataset.col = 'colUnitTypeName';
    Dashboard.attachInlineEdit(tdName, {
        value: record.name || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colUnitTypeName',
        pending: isPending(record, 'name'),
        onCommit: (val) => ensureCreatedThenPatch(record, { name: val.trim() }),
    });

    const tr = document.createElement('tr');
    tr.dataset.recordId = record.id != null ? String(record.id) : '';
    tr.append(
        ...buildSystemCells(record),
        textCell('colUnitTypeCode', record.code),
        tdName,
        buildFuelTypeCell(record),
        buildStatusCell(record),
        buildActionsCell(record, tr),
    );
    tr.classList.toggle('data-table-row-editable', !!tr.querySelector('td.editable-cell'));
    return tr;
}

function getTbody() {
    return document.querySelector('[data-table-id="tipos-unidad"] table.data-table').tBodies[0];
}

function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = 18;
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
        const res = await fetch('/api/business/unit-types', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { unitTypes } = await res.json();
        tbody.innerHTML = '';
        if (!unitTypes.length) { ensureEmptyState(); return; }
        unitTypes.forEach((record) => tbody.appendChild(buildRow(record)));
        applyUnitTypeFilters();
    } catch (err) {
        console.error('Tipos de Unidad: failed to load records', err);
    }
}

function applyUnitTypeFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        const haystack = ['colUnitTypeCode', 'colUnitTypeName']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        tr.hidden = !haystack.includes(text);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyUnitTypeFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyUnitTypeFilters);

// Only adds a local, in-memory draft row (record.id === null) -- nothing is
// persisted server-side until its first field actually commits (see
// ensureCreatedThenPatch), so clicking this and never touching the row never
// leaves a blank Tipo de Unidad behind.
function createNewUnitType() {
    const draft = { id: null, code: '', name: '', fuelType: '', status: '', pendingFields: [] };
    const tbody = getTbody();
    const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
    if (emptyRow) emptyRow.remove();
    tbody.appendChild(buildRow(draft));
}

function renderNewRecordButton() {
    const wrapper = document.querySelector('[data-table-id="tipos-unidad"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.newUnitType">${Dashboard.t('main.newUnitType')}</span>`;
    btn.addEventListener('click', createNewUnitType);
    toolbar.prepend(btn);
}
