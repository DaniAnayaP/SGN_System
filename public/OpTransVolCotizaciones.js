// ---------------------------------------------------------------------------
// Nuestras Cotizaciones (Operaciones > Cadena de Suministro > Transporte
// Volumen) — a REUSABLE freight rate, not a one-off quote document: give it
// a Costo por KM + Distancia Estimada once, mark it Activa, and any number
// of Nuestros Traslados records can pick it afterward (by Folio). Same
// "create blank + click-per-cell + PATCH" convention as Tipos de Unidad —
// this screen only has a handful of fields, so no creation modal like Alta
// Nuestros Artículos needed one.
// ---------------------------------------------------------------------------

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-transporte-vol-cotizaciones' });
        if (!role) return;
        await loadUnitTypeOptions();
        renderNewRecordButton();
        await refreshTable();
    } catch (err) {
        console.error('Nuestras Cotizaciones failed to initialize:', err);
    }
})();

const TABLE_KEY = 'nuestras-cotizaciones';

// Tipo Unidad reuses the SAME catalog Nuestras Unidades already reads from
// (Catálogos > Transporte Volumen) -- only Active ones are offered for a
// NEW pick, but a quote's current value is always kept even if that unit
// type is later deactivated/renamed (stored as plain text here, not a
// foreign key -- see freight_quotes' own DDL comment in db.js).
let unitTypeOptions = [];
async function loadUnitTypeOptions() {
    try {
        const res = await fetch('/api/business/unit-types', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { unitTypes } = await res.json();
        unitTypeOptions = (unitTypes || []).filter((u) => u.status === 'active' && u.name).map((u) => u.name);
    } catch (err) {
        console.error('Nuestras Cotizaciones: failed to load unit type options', err);
        unitTypeOptions = [];
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

async function ensureCreatedThenPatch(record, patch) {
    if (record.id) return patchFreightQuote(record.id, patch);
    try {
        const res = await fetch('/api/business/freight-quotes', { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error('create failed');
        const { freightQuote } = await res.json();
        record.id = freightQuote.id;
        record.registroUnico = freightQuote.registroUnico;
        record.folio = freightQuote.folio;
        await patchFreightQuote(freightQuote.id, patch);
    } catch (err) {
        console.error('Nuestras Cotizaciones: failed to create record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

async function patchFreightQuote(id, patch) {
    try {
        const res = await fetch(`/api/business/freight-quotes/${id}`, {
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
        console.error('Nuestras Cotizaciones: failed to save change', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        await refreshTable();
    }
}

function buildUnitTypeCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colCotTipoUnidad';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    const current = record.unitTypeName || '';
    const names = current && !unitTypeOptions.includes(current) ? [current, ...unitTypeOptions] : unitTypeOptions;
    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = Dashboard.t('main.articleTypeSelect');
    select.appendChild(blankOption);
    names.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    select.value = current;
    select.disabled = isPending(record, 'unitTypeName') || !Dashboard.canEditField(TABLE_KEY, 'colCotTipoUnidad', current);
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'unitTypeName') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => ensureCreatedThenPatch(record, { unitTypeName: select.value }));
    td.appendChild(select);
    return td;
}

function buildStatusCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colCotEstatus';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    select.innerHTML = `
        <option value="active" data-i18n="admin.statusActivo">${Dashboard.t('admin.statusActivo')}</option>
        <option value="inactive" data-i18n="admin.statusInactivo">${Dashboard.t('admin.statusInactivo')}</option>
    `;
    select.value = record.status || 'active';
    select.disabled = isPending(record, 'status') || !Dashboard.canEditField(TABLE_KEY, 'colCotEstatus', record.status || '');
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'status') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => ensureCreatedThenPatch(record, { status: select.value }));
    td.appendChild(select);
    return td;
}

// Costo Total is never typed -- the server derives it from Costo por KM ×
// Distancia Estimada on every read (see mapFreightQuoteRecord in server.js),
// same "computed, never its own column" convention as Alta Nuestros
// Artículos' own SKU.
function buildTotalCostCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colCotCostoTotal';
    td.classList.add('computed-value-cell');
    const amount = record.totalCost || 0;
    td.textContent = `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return td;
}

function buildActionsCell(record, tr) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
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
    if (!record.id || Dashboard.hasColumnDeleteGrant(TABLE_KEY, 'colCotDeleteAuth')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.title = Dashboard.t('admin.delete');
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => {
            if (!record.id) { tr.remove(); ensureEmptyState(); return; }
            deleteFreightQuote(record.id, tr);
        });
        td.appendChild(deleteBtn);
    }
    return td;
}

async function deleteFreightQuote(id, tr) {
    if (!(await Dashboard.confirm(Dashboard.t('main.recordDeleteConfirm')))) return;
    try {
        const res = await fetch(`/api/business/freight-quotes/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
            if (res.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
            throw new Error('delete failed');
        }
        tr.remove();
        ensureEmptyState();
    } catch (err) {
        console.error('Nuestras Cotizaciones: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

function buildRow(record) {
    const tdRuta = document.createElement('td');
    tdRuta.dataset.col = 'colCotRuta';
    Dashboard.attachInlineEdit(tdRuta, {
        value: record.routeName || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colCotRuta',
        pending: isPending(record, 'routeName'),
        onCommit: (val) => ensureCreatedThenPatch(record, { routeName: val.trim() }),
    });

    const tdCostoKm = document.createElement('td');
    tdCostoKm.dataset.col = 'colCotCostoKm';
    Dashboard.attachInlineEdit(tdCostoKm, {
        value: record.costPerKm || '',
        inputType: 'number',
        tableKey: TABLE_KEY,
        colKey: 'colCotCostoKm',
        pending: isPending(record, 'costPerKm'),
        onCommit: (val) => ensureCreatedThenPatch(record, { costPerKm: parseFloat(val) || 0 }),
    });

    const tdDistancia = document.createElement('td');
    tdDistancia.dataset.col = 'colCotDistanciaKm';
    Dashboard.attachInlineEdit(tdDistancia, {
        value: record.distanceKm || '',
        inputType: 'number',
        tableKey: TABLE_KEY,
        colKey: 'colCotDistanciaKm',
        pending: isPending(record, 'distanceKm'),
        onCommit: (val) => ensureCreatedThenPatch(record, { distanceKm: parseFloat(val) || 0 }),
    });

    const tdVigencia = document.createElement('td');
    tdVigencia.dataset.col = 'colCotVigencia';
    Dashboard.attachInlineEdit(tdVigencia, {
        value: record.validityDate || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colCotVigencia',
        pending: isPending(record, 'validityDate'),
        onCommit: (val) => ensureCreatedThenPatch(record, { validityDate: val.trim() }),
    });

    const tdCliente = document.createElement('td');
    tdCliente.dataset.col = 'colCotCliente';
    Dashboard.attachInlineEdit(tdCliente, {
        value: record.customerName || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colCotCliente',
        pending: isPending(record, 'customerName'),
        onCommit: (val) => ensureCreatedThenPatch(record, { customerName: val.trim() }),
    });

    const tr = document.createElement('tr');
    tr.dataset.recordId = record.id != null ? String(record.id) : '';
    tr.append(
        ...buildSystemCells(record),
        textCellSystem('colCotRegistroUnico', record.registroUnico),
        textCell('colCotFolio', record.folio),
        tdRuta,
        buildUnitTypeCell(record),
        tdCostoKm,
        tdDistancia,
        buildTotalCostCell(record),
        tdVigencia,
        tdCliente,
        buildStatusCell(record),
        buildActionsCell(record, tr),
    );
    tr.classList.toggle('data-table-row-editable', !!tr.querySelector('td.editable-cell'));
    return tr;
}

function getTbody() {
    return document.querySelector('[data-table-id="nuestras-cotizaciones"] table.data-table').tBodies[0];
}

function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = 24;
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
        const res = await fetch('/api/business/freight-quotes', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { freightQuotes } = await res.json();
        tbody.innerHTML = '';
        if (!freightQuotes.length) { ensureEmptyState(); return; }
        freightQuotes.forEach((record) => tbody.appendChild(buildRow(record)));
        applyFreightQuoteFilters();
    } catch (err) {
        console.error('Nuestras Cotizaciones: failed to load records', err);
    }
}

function applyFreightQuoteFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        const haystack = ['colCotFolio', 'colCotRuta', 'colCotCliente']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        tr.hidden = !haystack.includes(text);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFreightQuoteFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFreightQuoteFilters);

function createNewFreightQuote() {
    const draft = {
        id: null, registroUnico: '', folio: '', routeName: '', unitTypeName: '', costPerKm: '', distanceKm: '',
        totalCost: 0, validityDate: '', customerName: '', status: '', pendingFields: [],
    };
    const tbody = getTbody();
    const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
    if (emptyRow) emptyRow.remove();
    tbody.appendChild(buildRow(draft));
}

function renderNewRecordButton() {
    const wrapper = document.querySelector('[data-table-id="nuestras-cotizaciones"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.newFreightQuote">${Dashboard.t('main.newFreightQuote')}</span>`;
    btn.addEventListener('click', createNewFreightQuote);
    toolbar.prepend(btn);
}
