// ---------------------------------------------------------------------------
// Nuestras Categorías <Tipo> (Catálogos > Cadena de Suministro > C.
// Distribución) — 7 near-identical catalogs (Inventarios/Compras/
// Almacenamiento/Rotación/Manejo Especial/Riesgo/Vida Útil), each just a
// named, described, activatable option list Alta Nuestros Artículos' own
// "Categorías Artículo" selects read from. One shared script instead of 7
// copy-pasted ones -- these 7 screens are the exact same shape by design
// (confirmed with the client), each HTML shell only differs in which
// category it points at via <body data-category-type="...">. Same
// "create blank + click-per-cell + PATCH" convention as Tipos de Unidad
// (the closest existing catalog precedent) -- unlike Alta Nuestros
// Artículos, these only have 2 editable fields, so there's no case for a
// creation form/modal here.
// ---------------------------------------------------------------------------

const CATEGORY_TYPE_TABLE_KEYS = {
    inventario: 'categorias-inventario',
    compra: 'categorias-compra',
    almacenamiento: 'categorias-almacenamiento',
    rotacion: 'categorias-rotacion',
    manejo: 'categorias-manejo',
    riesgo: 'categorias-riesgo',
    vidautil: 'categorias-vidautil',
    tipocodigo: 'categorias-tipocodigo',
    // Misma forma que las 7 de arriba (ver ARTICLE_CATEGORY_TYPES en db.js): sin
    // estas dos claves TABLE_KEY quedaba undefined en Unidad de Medida y Tipos de
    // Cliente (el historial, los permisos de edición y la tabla misma se buscaban
    // con la clave "undefined").
    udm: 'unidad-medida',
    clasificaciones: 'clasificaciones',
    'tipos-cliente': 'tipos-cliente',
    // Catálogos con campos propios (centro de costos / almacén, tipo físico o virtual, ubicación asignada): ver buildExtraCells.
    almacenes: 'almacenes',
    'sub-almacenes': 'sub-almacenes',
    // Activos Fijos (el tipo de activo) y su Clasificación (con su métrica propia: m² o m³).
    'activos-fijos': 'activos-fijos',
    'activos-clasificacion': 'activos-clasificacion',
};

const CATEGORY_TYPE = document.body.dataset.categoryType;
const TABLE_KEY = CATEGORY_TYPE_TABLE_KEYS[CATEGORY_TYPE];
const CATEGORY_API_BASE = `/api/business/article-categories/${CATEGORY_TYPE}`;
const DELETE_AUTH_COL = 'colCatDeleteAuth';
const IS_WAREHOUSE = CATEGORY_TYPE === 'almacenes' || CATEGORY_TYPE === 'sub-almacenes';
const NEW_RECORD_KEY = CATEGORY_TYPE === 'almacenes' ? 'main.newWarehouse' : CATEGORY_TYPE === 'sub-almacenes' ? 'main.newSubWarehouse' : CATEGORY_TYPE === 'activos-fijos' ? 'main.newFixedAsset' : CATEGORY_TYPE === 'activos-clasificacion' ? 'main.newAssetClass' : CATEGORY_TYPE === 'clasificaciones' ? 'main.newClassification' : 'main.newArticleCategory';
// Centros de costos completos, almacenes y, por cada centro, las zonas / anaqueles de su Layout (GET /api/business/warehouse-options).
let warehouseOptions = { costCenters: [], warehouses: [], zonesByCenter: {} };
// Categorías de Inventario: cada una elige cuáles clasificaciones (catálogo Nuestras Clasificaciones) tiene; aquí van todas las del catálogo con su estatus.
const IS_INVENTORY = CATEGORY_TYPE === 'inventario';
let classificationOptions = [];

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        if (IS_WAREHOUSE) await loadWarehouseOptions();
        if (IS_INVENTORY) await loadClassificationOptions();
        renderNewRecordButton();
        await refreshTable();
    } catch (err) {
        console.error('Nuestras Categorías failed to initialize:', err);
    }
})();

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

// A draft row (record.id === null, never persisted -- see createNewCategory)
// only actually gets created on the server once its FIRST field commits, so
// "+ Nueva Categoría" followed by leaving the row untouched never leaves a
// blank category behind.
async function ensureCreatedThenPatch(record, patch) {
    if (record.id) return patchCategory(record.id, patch);
    try {
        const res = await fetch(CATEGORY_API_BASE, { method: 'POST', credentials: 'include' });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.message || 'create failed');
        }
        const { category } = await res.json();
        record.id = category.id;
        record.registroUnico = category.registroUnico;
        record.code = category.code;
        await patchCategory(category.id, CATEGORY_TYPE === 'almacenes' && record.parentId ? { parentId: record.parentId, ...patch } : patch);
    } catch (err) {
        console.error('Nuestras Categorías: failed to create record', err);
        Dashboard.showToast(err.message === 'create failed' ? Dashboard.t('admin.saveError') : err.message, 'error');
    }
}

async function patchCategory(id, patch) {
    try {
        const res = await fetch(`${CATEGORY_API_BASE}/${id}`, {
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
        console.error('Nuestras Categorías: failed to save change', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        await refreshTable();
    }
}

function buildStatusCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colCatStatus';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    select.innerHTML = `
        <option value="active" data-i18n="admin.statusActivo">${Dashboard.t('admin.statusActivo')}</option>
        <option value="inactive" data-i18n="admin.statusInactivo">${Dashboard.t('admin.statusInactivo')}</option>
    `;
    select.value = record.status || 'active';
    select.disabled = isPending(record, 'status') || !Dashboard.canEditField(TABLE_KEY, 'colCatStatus', record.status || '');
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'status') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => ensureCreatedThenPatch(record, { status: select.value }));
    td.appendChild(select);
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
        historyBtn.setAttribute('data-help-key', 'changeHistory');
        historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
        historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
        historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
        historyBtn.addEventListener('click', () => Dashboard.openChangeHistory(TABLE_KEY, record.id));
        td.appendChild(historyBtn);
    }
    if (!record.id || Dashboard.hasColumnDeleteGrant(TABLE_KEY, DELETE_AUTH_COL)) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('data-help-key', 'delete');
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.title = Dashboard.t('admin.delete');
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => {
            if (!record.id) { tr.remove(); ensureEmptyState(); return; }
            deleteCategory(record.id, tr);
        });
        td.appendChild(deleteBtn);
    }
    return td;
}

async function deleteCategory(id, tr) {
    if (!(await Dashboard.confirm(Dashboard.t('main.recordDeleteConfirm')))) return;
    try {
        const res = await fetch(`${CATEGORY_API_BASE}/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
            if (res.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
            // 409 = algo todavía usa este registro (una clasificación asignada a categorías, un almacén con sub almacenes…): el servidor explica qué
            if (res.status === 409) { const body = await res.json().catch(() => ({})); Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'warning'); return; }
            throw new Error('delete failed');
        }
        tr.remove();
        ensureEmptyState();
    } catch (err) {
        console.error('Nuestras Categorías: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

function buildRow(record) {
    const tdName = document.createElement('td');
    tdName.dataset.col = 'colCatName';
    Dashboard.attachInlineEdit(tdName, {
        value: record.name || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colCatName',
        pending: isPending(record, 'name'),
        onCommit: (val) => ensureCreatedThenPatch(record, { name: val.trim() }),
    });

    const tdDescription = document.createElement('td');
    tdDescription.dataset.col = 'colCatDescription';
    Dashboard.attachInlineEdit(tdDescription, {
        value: record.description || '',
        inputType: 'text',
        tableKey: TABLE_KEY,
        colKey: 'colCatDescription',
        pending: isPending(record, 'description'),
        onCommit: (val) => ensureCreatedThenPatch(record, { description: val.trim() }),
    });

    const tr = document.createElement('tr');
    tr.dataset.recordId = record.id != null ? String(record.id) : '';
    tr.append(
        ...buildSystemCells(record),
        textCellSystem('colCatRegistroUnico', record.registroUnico),
        textCell('colCatCode', record.code),
        tdName,
        tdDescription,
        ...buildExtraCells(record),
        buildStatusCell(record),
        buildActionsCell(record, tr),
    );
    tr.classList.toggle('data-table-row-editable', !!tr.querySelector('td.editable-cell'));
    return tr;
}

function getTbody() {
    return document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0];
}

function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = document.querySelectorAll('table.data-table thead th').length;
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
        const res = await fetch(CATEGORY_API_BASE, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        const categories = IS_WAREHOUSE ? body.categories.filter(isInSelectedCenters) : body.categories;
        tbody.innerHTML = '';
        if (!categories.length) { ensureEmptyState(); return; }
        categories.forEach((record) => tbody.appendChild(buildRow(record)));
        applyCategoryFilters();
    } catch (err) {
        console.error('Nuestras Categorías: failed to load records', err);
    }
}

function applyCategoryFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        const haystack = ['colCatCode', 'colCatName', 'colCatDescription', 'colCatClasificaciones', 'colAlmCentroCostos', 'colSubAlmAlmacen', 'colSubAlmTipo', 'colSubAlmUbicacion', 'colActClasMetrica']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        tr.hidden = !SearchSyntax.matches('contains', text, haystack);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyCategoryFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyCategoryFilters);

// Only adds a local, in-memory draft row (record.id === null) -- nothing is
// persisted server-side until its first field actually commits (see
// ensureCreatedThenPatch), so clicking this and never touching the row never
// leaves a blank category behind.
function createNewCategory() {
    // Un almacén nuevo nace en el centro de costos elegido arriba (si hay uno solo a elegir).
    const choices = CATEGORY_TYPE === 'almacenes' ? centerChoices() : [];
    const draft = { id: null, registroUnico: '', code: '', name: '', description: '', status: '', parentId: choices.length === 1 ? choices[0].id : null, parentName: choices.length === 1 ? choices[0].name : '', kind: '', locations: [], classificationIds: [], classifications: [], pendingFields: [] };
    const tbody = getTbody();
    const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
    if (emptyRow) emptyRow.remove();
    tbody.appendChild(buildRow(draft));
}

function renderNewRecordButton() {
    const wrapper = document.querySelector(`[data-table-id="${TABLE_KEY}"]`);
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="${NEW_RECORD_KEY}">${Dashboard.t(NEW_RECORD_KEY)}</span>`;
    btn.addEventListener('click', createNewCategory);
    toolbar.prepend(btn);
}

// ---------------------------------------------------------------------------
// Almacenes y Sub almacenes: columnas propias
//   Almacenes     -> Centro de Costos (lista de Servicio Contratado)
//   Sub almacenes -> Almacén (lista de almacenes activos), Tipo (Físico / Virtual) y Ubicación asignada (zonas completas o anaqueles del Layout; solo si es Físico)
// ---------------------------------------------------------------------------
async function loadWarehouseOptions() {
    try {
        const res = await fetch('/api/business/warehouse-options', { credentials: 'include' });
        if (!res.ok) throw new Error('options failed');
        warehouseOptions = await res.json();
    } catch (err) {
        console.error('Almacenes: failed to load options', err);
    }
}

// Almacenes y Sub almacenes siguen al selector de centros de costos de arriba: solo se ven los de los centros marcados (lo que todavía no tiene centro se ve siempre, para poder asignárselo).
// El centro de un almacén es su Centro de Costos; el de un sub almacén es el de su almacén.
function centerOfRecord(record) {
    if (CATEGORY_TYPE === 'almacenes') return record.parentId || null;
    const wh = warehouseOptions.warehouses.find((w) => w.id === record.parentId);
    return wh ? wh.parentId || null : null;
}
function isInSelectedCenters(record) {
    const selected = Dashboard.getSelectedCostCenterIds();
    const center = centerOfRecord(record);
    return !selected || !center || selected.includes(center);
}
// Los centros que se pueden elegir: los completos que están marcados arriba.
function centerChoices() {
    const selected = Dashboard.getSelectedCostCenterIds();
    return warehouseOptions.costCenters.filter((c) => !selected || selected.includes(c.id));
}
// Las zonas y anaqueles de un sub almacén son los del Layout del centro de su almacén.
function zonesOf(record) {
    return warehouseOptions.zonesByCenter[centerOfRecord(record) || 0] || [];
}
document.addEventListener('sgn:cost-centers-changed', () => { if (IS_WAREHOUSE) refreshTable(); });

// Select de un campo propio: la opción actual siempre aparece aunque ya no esté en la lista (por ejemplo un almacén que quedó inactivo).
function buildOptionCell(record, colId, apiKey, helpKey, items, currentValue, currentLabel, toPatch) {
    const td = document.createElement('td');
    td.dataset.col = colId;
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    select.setAttribute('data-help-key', helpKey);
    const list = items.slice();
    if (currentValue !== null && currentValue !== undefined && currentValue !== '' && !list.some((i) => String(i.value) === String(currentValue))) {
        list.unshift({ value: currentValue, label: currentLabel || String(currentValue) });
    }
    select.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = Dashboard.t('main.whChoose');
    select.appendChild(blank);
    list.forEach((i) => {
        const opt = document.createElement('option');
        opt.value = String(i.value);
        opt.textContent = i.label;
        select.appendChild(opt);
    });
    select.value = currentValue === null || currentValue === undefined ? '' : String(currentValue);
    select.disabled = isPending(record, apiKey) || !Dashboard.canEditField(TABLE_KEY, colId, currentValue === null || currentValue === undefined ? '' : String(currentValue));
    if (select.disabled) select.title = Dashboard.t(isPending(record, apiKey) ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => ensureCreatedThenPatch(record, toPatch(select.value)));
    td.appendChild(select);
    return td;
}

function describeLocations(locations, zones) {
    const parts = (locations || []).map((e) => {
        const zone = zones.find((z) => z.id === e.zoneId);
        if (!zone) return '';
        if (!e.spaceIds.length) return `${zone.name} (${Dashboard.t('main.whWhole')})`;
        const codes = e.spaceIds.map((sid) => (zone.spaces.find((s) => s.id === sid) || {}).code).filter(Boolean);
        return codes.length ? `${zone.name}: ${codes.join(', ')}` : '';
    }).filter(Boolean);
    return parts.join(' · ');
}

function buildLocationCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colSubAlmUbicacion';
    if (record.kind !== 'physical') {
        td.textContent = record.kind === 'virtual' ? Dashboard.t('main.whNotApplicable') : Dashboard.t('main.whChooseKindFirst');
        td.classList.add('wh-muted');
        return td;
    }
    if (!record.parentId) {
        td.textContent = Dashboard.t('main.whChooseWarehouseFirst');
        td.classList.add('wh-muted');
        return td;
    }
    const summary = describeLocations(record.locations, zonesOf(record));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary wh-location-btn';
    btn.setAttribute('data-help-key', 'whLocationBtn');
    btn.textContent = summary || Dashboard.t('main.whAssign');
    btn.title = summary || Dashboard.t('main.whAssign');
    btn.disabled = isPending(record, 'locations') || !Dashboard.canEditField(TABLE_KEY, 'colSubAlmUbicacion', summary);
    if (btn.disabled) btn.title = Dashboard.t(isPending(record, 'locations') ? 'main.changePending' : 'main.fieldLocked');
    btn.addEventListener('click', () => openLocationDialog(record));
    td.appendChild(btn);
    return td;
}

// --- Clasificaciones de una categoría de Inventario ----------------------------------------------------------------------------------
async function loadClassificationOptions() {
    try {
        const res = await fetch('/api/business/article-categories/clasificaciones', { credentials: 'include' });
        if (!res.ok) throw new Error('options failed');
        const { categories } = await res.json();
        classificationOptions = categories.map((c) => ({ id: c.id, code: c.code, name: c.name, description: c.description, status: c.status }));
    } catch (err) {
        console.error('Categorías de Inventario: failed to load classifications', err);
    }
}

function describeClassifications(record) {
    return (record.classifications || []).map((c) => c.name).filter(Boolean).join(', ');
}

function buildClassificationCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colCatClasificaciones';
    const summary = describeClassifications(record);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary wh-location-btn';
    btn.setAttribute('data-help-key', 'clsAssignBtn');
    btn.textContent = summary || Dashboard.t('main.clsAssign');
    btn.title = summary || Dashboard.t('main.clsAssign');
    btn.disabled = isPending(record, 'classificationIds') || !Dashboard.canEditField(TABLE_KEY, 'colCatClasificaciones', summary);
    if (btn.disabled) btn.title = Dashboard.t(isPending(record, 'classificationIds') ? 'main.changePending' : 'main.fieldLocked');
    btn.addEventListener('click', () => openClassificationDialog(record));
    td.appendChild(btn);
    return td;
}

let clsModalEl = null;
let clsState = null; // { record, picked: Set(id) }

function ensureClassificationModal() {
    if (clsModalEl) return;
    clsModalEl = document.createElement('div');
    clsModalEl.className = 'modal-overlay';
    clsModalEl.id = 'cls-modal';
    clsModalEl.hidden = true;
    clsModalEl.innerHTML = `<div class="modal-panel wh-location-dialog" role="dialog" aria-modal="true" aria-labelledby="cls-title">
        <h3 id="cls-title"></h3>
        <div class="wh-location-list" id="cls-list"></div>
        <div class="admin-form-actions"><button type="button" class="btn" id="cls-save">${Dashboard.t('main.whSave')}</button><button type="button" class="btn btn-secondary" id="cls-close">${Dashboard.t('main.whClose')}</button></div>
    </div>`;
    document.body.appendChild(clsModalEl);
    clsModalEl.addEventListener('click', (event) => {
        if (event.target === clsModalEl || event.target.closest('#cls-close')) { closeClassificationDialog(); return; }
        if (event.target.closest('#cls-save')) saveClassificationDialog();
    });
    clsModalEl.addEventListener('change', (event) => {
        const box = event.target;
        if (!(box instanceof HTMLInputElement) || !clsState) return;
        const id = Number(box.value);
        if (box.checked) clsState.picked.add(id); else clsState.picked.delete(id);
    });
}

function openClassificationDialog(record) {
    ensureClassificationModal();
    clsState = { record, picked: new Set(record.classificationIds || []) };
    document.getElementById('cls-title').textContent = Dashboard.t('main.clsAssignTitle').replace('{name}', record.name || record.code || '');
    const list = document.getElementById('cls-list');
    list.innerHTML = '';
    // las activas, y las inactivas solo si la categoría ya las tiene (se pueden quitar, no agregar)
    const shown = classificationOptions.filter((c) => c.status === 'active' || clsState.picked.has(c.id));
    if (!shown.length) {
        const p = document.createElement('p');
        p.className = 'wh-muted';
        p.textContent = Dashboard.t('main.clsNone');
        list.appendChild(p);
    }
    shown.forEach((c) => {
        const label = document.createElement('label');
        label.className = 'wh-zone-all';
        label.setAttribute('data-help-key', 'clsPick');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = String(c.id);
        cb.checked = clsState.picked.has(c.id);
        const title = document.createElement('b');
        title.textContent = c.name || Dashboard.t('main.whNoName');
        const hint = document.createElement('span');
        hint.className = 'wh-muted';
        hint.textContent = [c.description, c.status === 'active' ? '' : `(${Dashboard.t('admin.statusInactivo')})`].filter(Boolean).join(' · ');
        label.append(cb, title, hint);
        list.appendChild(label);
    });
    clsModalEl.hidden = false;
}

function closeClassificationDialog() {
    if (clsModalEl) clsModalEl.hidden = true;
    clsState = null;
}

function saveClassificationDialog() {
    if (!clsState) return;
    const { record, picked } = clsState;
    closeClassificationDialog();
    ensureCreatedThenPatch(record, { classificationIds: Array.from(picked) });
}
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && clsState) closeClassificationDialog(); });

function buildExtraCells(record) {
    if (IS_INVENTORY) return [buildClassificationCell(record)];
    if (CATEGORY_TYPE === 'almacenes') {
        return [buildOptionCell(record, 'colAlmCentroCostos', 'parentId', 'whCostCenter',
            centerChoices().map((c) => ({ value: c.id, label: c.name })), record.parentId, record.parentName,
            (v) => ({ parentId: v === '' ? null : Number(v) }))];
    }
    if (CATEGORY_TYPE === 'activos-clasificacion') {
        return [buildOptionCell(record, 'colActClasMetrica', 'kind', 'assetClassMetric',
            [{ value: 'm2', label: Dashboard.t('main.acMetricM2') }, { value: 'm3', label: Dashboard.t('main.acMetricM3') }], record.kind || '', '',
            (v) => ({ kind: v }))];
    }
    if (CATEGORY_TYPE === 'sub-almacenes') {
        const selected = Dashboard.getSelectedCostCenterIds();
        const active = warehouseOptions.warehouses.filter((w) => w.status === 'active' && (!selected || !w.parentId || selected.includes(w.parentId)));
        return [
            buildOptionCell(record, 'colSubAlmAlmacen', 'parentId', 'whParentWarehouse',
                active.map((w) => ({ value: w.id, label: w.name || Dashboard.t('main.whNoName') })), record.parentId, record.parentName,
                (v) => ({ parentId: v === '' ? null : Number(v) })),
            buildOptionCell(record, 'colSubAlmTipo', 'kind', 'whKind',
                [{ value: 'physical', label: Dashboard.t('main.whPhysical') }, { value: 'virtual', label: Dashboard.t('main.whVirtual') }], record.kind || '', '',
                // al pasar a Virtual (o a sin tipo) se quitan las ubicaciones en el mismo guardado
                (v) => (v !== 'physical' && record.locations && record.locations.length ? { kind: v, locations: [] } : { kind: v })),
            buildLocationCell(record),
        ];
    }
    return [];
}

// --- Selector de ubicación de un sub almacén físico: zonas completas o anaqueles sueltos del Layout --------------------------------
let locModalEl = null;
let locState = null; // { record, zones, picked: Map(zoneId -> { whole, spaces: Set }) }

function ensureLocationModal() {
    if (locModalEl) return;
    locModalEl = document.createElement('div');
    locModalEl.className = 'modal-overlay';
    locModalEl.id = 'wh-location-modal';
    locModalEl.hidden = true;
    locModalEl.innerHTML = `<div class="modal-panel wh-location-dialog" role="dialog" aria-modal="true" aria-labelledby="wh-location-title">
        <h3 id="wh-location-title"></h3>
        <div class="wh-location-list" id="wh-location-list"></div>
        <div class="admin-form-actions"><button type="button" class="btn" id="wh-location-save">${Dashboard.t('main.whSave')}</button><button type="button" class="btn btn-secondary" id="wh-location-close">${Dashboard.t('main.whClose')}</button></div>
    </div>`;
    document.body.appendChild(locModalEl);
    locModalEl.addEventListener('click', (event) => {
        if (event.target === locModalEl || event.target.closest('#wh-location-close')) { closeLocationDialog(); return; }
        if (event.target.closest('#wh-location-save')) { saveLocationDialog(); return; }
    });
    locModalEl.addEventListener('change', (event) => {
        const box = event.target;
        if (!(box instanceof HTMLInputElement) || !locState) return;
        const zoneId = box.getAttribute('data-zone') || box.getAttribute('data-zone-space');
        const cur = locState.picked.get(zoneId) || { whole: false, spaces: new Set() };
        if (box.hasAttribute('data-zone')) {
            cur.whole = box.checked;
            if (box.checked) cur.spaces.clear();
        } else if (box.checked) cur.spaces.add(box.value); else cur.spaces.delete(box.value);
        if (!cur.whole && !cur.spaces.size) locState.picked.delete(zoneId); else locState.picked.set(zoneId, cur);
        renderLocationList();
    });
}

function renderLocationList() {
    const list = document.getElementById('wh-location-list');
    list.innerHTML = '';
    if (!locState.zones.length) {
        const p = document.createElement('p');
        p.className = 'wh-muted';
        p.textContent = Dashboard.t('main.whNoZones');
        list.appendChild(p);
        return;
    }
    locState.zones.forEach((zone) => {
        const cur = locState.picked.get(zone.id) || { whole: false, spaces: new Set() };
        const box = document.createElement('div');
        box.className = 'wh-zone';
        const head = document.createElement('label');
        head.className = 'wh-zone-all';
        head.setAttribute('data-help-key', 'whZoneAll');
        const all = document.createElement('input');
        all.type = 'checkbox';
        all.setAttribute('data-zone', zone.id);
        all.checked = cur.whole;
        const title = document.createElement('b');
        title.textContent = zone.name;
        const hint = document.createElement('span');
        hint.className = 'wh-muted';
        hint.textContent = Dashboard.t('main.whWholeZone');
        head.append(all, title, hint);
        box.appendChild(head);
        const racks = document.createElement('div');
        racks.className = 'wh-racks';
        if (!zone.spaces.length) {
            const none = document.createElement('span');
            none.className = 'wh-muted';
            none.textContent = Dashboard.t('main.whNoRacks');
            racks.appendChild(none);
        }
        zone.spaces.forEach((space) => {
            const label = document.createElement('label');
            label.className = 'wh-rack';
            label.setAttribute('data-help-key', 'whRackCheck');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.setAttribute('data-zone-space', zone.id);
            cb.value = space.id;
            cb.checked = cur.whole || cur.spaces.has(space.id);
            cb.disabled = cur.whole;
            const text = document.createElement('span');
            text.textContent = `${space.code} · ${Dashboard.t(`main.layoutType_space_${space.type}`)}`;
            label.append(cb, text);
            racks.appendChild(label);
        });
        box.appendChild(racks);
        list.appendChild(box);
    });
}

function openLocationDialog(record) {
    ensureLocationModal();
    const picked = new Map();
    (record.locations || []).forEach((e) => picked.set(e.zoneId, { whole: !e.spaceIds.length, spaces: new Set(e.spaceIds) }));
    locState = { record, zones: zonesOf(record), picked };
    document.getElementById('wh-location-title').textContent = Dashboard.t('main.whAssignTitle').replace('{name}', record.name || record.code || '');
    renderLocationList();
    locModalEl.hidden = false;
}

function closeLocationDialog() {
    if (locModalEl) locModalEl.hidden = true;
    locState = null;
}

function saveLocationDialog() {
    if (!locState) return;
    const { record, picked } = locState;
    const locations = [];
    picked.forEach((cur, zoneId) => { locations.push({ zoneId, spaceIds: cur.whole ? [] : Array.from(cur.spaces) }); });
    closeLocationDialog();
    ensureCreatedThenPatch(record, { locations });
}
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && locState) closeLocationDialog(); });
