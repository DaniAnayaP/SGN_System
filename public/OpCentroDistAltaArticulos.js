// ---------------------------------------------------------------------------
// Alta Nuestros Artículos (Sku) — Operaciones > Cadena de Suministro > C.
// Distribución. Operación only: data only capturable with the physical
// product in hand, plus its 7 "Categoría X" selections -- Punto de Reorden
// (Gestión) and Activar/Inactivar (Administración) are still deliberately
// NOT columns here. The 7 categories themselves are Catálogos, defined in
// their own 7 "Nuestras Categorías..." screens (see
// CatCentroDistCategoriaArticulo.js) -- this screen only SELECTS from them,
// never defines new values.
//
// "+ Nuevo Artículo" opens a form (see the "+ Nuevo Artículo" modal section
// below) that captures all 24 fields at once, unlike Nuestras Unidades/
// Carga Combustible's click-per-cell pattern -- confirmed with the client
// given how many more fields this screen has. Nothing reaches the server
// until "Guardar" is pressed, so closing the form without saving never
// leaves an orphan artículo behind. Once created, a row's fields are still
// edited the normal click-the-cell way, same as every other table. Registro
// Único and SKU are never edited: both are server-generated at creation
// (db_id / record_number, see db.js), shown read-only. Persisted via
// /api/business/sku-items.
// ---------------------------------------------------------------------------

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-centro-dist-alta-articulos' });
        if (!role) return;
        await loadCategoryOptions();
        renderNewRecordButton();
        await refreshTable();
    } catch (err) {
        console.error('Alta Nuestros Artículos failed to initialize:', err);
    }
})();

const TABLE_KEY = 'nuestros-articulos';

// --- Categorías Artículo (7 selects, sourced from the 7 "Nuestras -----------
// Categorías..." catalogs) -- categoryOptions is fetched once at load via
// the shared active-only endpoint (see server.js's own comment on why one
// request beats 7). [colId, apiKey, categoryType] triples drive both the
// table cells and the "+ Nuevo Artículo" modal's own selects below.
const CATEGORY_SELECT_FIELDS = [
    ['colArticuloCategoriaInventario', 'categoryInventario', 'inventario'],
    ['colArticuloCategoriaCompra', 'categoryCompra', 'compra'],
    ['colArticuloCategoriaAlmacenamiento', 'categoryAlmacenamiento', 'almacenamiento'],
    ['colArticuloCategoriaRotacion', 'categoryRotacion', 'rotacion'],
    ['colArticuloCategoriaManejo', 'categoryManejo', 'manejo'],
    ['colArticuloCategoriaRiesgo', 'categoryRiesgo', 'riesgo'],
    ['colArticuloCategoriaVidautil', 'categoryVidautil', 'vidautil'],
];
let categoryOptions = {};
async function loadCategoryOptions() {
    try {
        const res = await fetch('/api/business/article-categories-active', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { options } = await res.json();
        categoryOptions = options || {};
    } catch (err) {
        console.error('Alta Nuestros Artículos: failed to load category options', err);
        categoryOptions = {};
    }
}

// A category select always shows the record's CURRENT value even if it's no
// longer Active (an artículo keeps what it already has -- see
// listActiveArticleCategoryNames' own comment in db.js), plus every
// currently-Active option for picking something new.
function buildCategorySelectCell(record, colId, apiKey, categoryType) {
    const td = document.createElement('td');
    td.dataset.col = colId;
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    const currentValue = record[apiKey] || '';
    const active = categoryOptions[categoryType] || [];
    const names = currentValue && !active.includes(currentValue) ? [currentValue, ...active] : active;
    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = Dashboard.t('main.articleTypeSelect');
    select.appendChild(blankOption);
    // Category names are free text a client admin typed into a catalog --
    // built as real <option> nodes (never innerHTML) so a name containing
    // HTML-special characters can't inject markup into this page.
    names.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    select.value = currentValue;
    select.disabled = isPending(record, apiKey) || !Dashboard.canEditField(TABLE_KEY, colId, currentValue);
    if (select.disabled) select.title = Dashboard.t(isPending(record, apiKey) ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => ensureCreatedThenPatch(record, { [apiKey]: select.value }));
    td.appendChild(select);
    return td;
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

// Every row rendered by refreshTable() already exists on the server (see
// the "+ Nuevo Artículo" modal below for how a NEW artículo gets created),
// so a cell edit is always a plain patch -- kept as its own name/signature
// so buildRow's onCommit callbacks read the same as every other screen's.
function ensureCreatedThenPatch(record, patch) {
    return patchSkuItem(record.id, patch);
}

async function patchSkuItem(id, patch) {
    try {
        const res = await fetch(`/api/business/sku-items/${id}`, {
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
        console.error('Alta Nuestros Artículos: failed to save change', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        await refreshTable();
    }
}

// --- Evidencias (6 ángulos) --------------------------------------------------
// Same shared control OpTransVolCombustible.js's own attachEvidenceControl
// uses — duplicated here rather than imported, same convention every other
// screen's own copy of shared-shaped-but-not-shared-module UI follows in
// this codebase. Uploads go straight to R2 via Dashboard.uploadEvidenceFile,
// the record is PATCHed with the short storage key it returns.
const evidencePreviewModal = document.createElement('div');
evidencePreviewModal.className = 'modal-overlay';
evidencePreviewModal.hidden = true;
evidencePreviewModal.innerHTML = `
    <div class="modal-panel" role="dialog" aria-modal="true">
        <img id="evidence-preview-img" src="" alt="" style="max-width: 100%; border-radius: 0.5rem;">
        <div class="admin-form-actions" style="margin-top: 1rem;">
            <button type="button" class="btn" id="evidence-preview-close">Cerrar</button>
        </div>
    </div>
`;
document.body.appendChild(evidencePreviewModal);
document.getElementById('evidence-preview-close').addEventListener('click', closeEvidencePreview);
evidencePreviewModal.addEventListener('click', (event) => { if (event.target === evidencePreviewModal) closeEvidencePreview(); });
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !evidencePreviewModal.hidden) closeEvidencePreview();
});
function openEvidencePreview(url) {
    document.getElementById('evidence-preview-img').src = url;
    evidencePreviewModal.hidden = false;
}
function closeEvidencePreview() {
    evidencePreviewModal.hidden = true;
    document.getElementById('evidence-preview-img').src = '';
}

function attachEvidenceControl(td, { value, pending, uploadLabelKey, viewLabelKey, tableKey, recordId, fieldKey, onCommit }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-icon-btn';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;

    let stored = value || null;
    let busy = false;
    function render() {
        const icon = busy ? 'bx-loader-alt bx-spin' : (pending ? 'bx-time-five' : (stored ? 'bx-check-circle' : 'bx-camera'));
        btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
        const label = pending ? 'main.changePending' : (stored ? viewLabelKey : uploadLabelKey);
        btn.setAttribute('aria-label', Dashboard.t(label));
        btn.title = Dashboard.t(label);
        td.dataset.dtEmpty = stored ? '' : '1';
    }
    btn.addEventListener('click', async () => {
        if (pending || busy) return;
        if (stored) {
            try {
                const url = stored.startsWith('data:') ? stored : await Dashboard.getEvidenceDownloadUrl({ tableKey, recordId, fieldKey });
                openEvidencePreview(url);
            } catch (err) {
                console.error('evidence preview failed', err);
                Dashboard.showToast(Dashboard.t('main.backupDownloadError'), 'error');
            }
        } else fileInput.click();
    });
    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        busy = true;
        render();
        try {
            const key = await Dashboard.uploadEvidenceFile(file, { tableKey, recordId, fieldKey });
            stored = key;
            onCommit(key);
        } catch (err) {
            console.error('evidence upload failed', err);
            Dashboard.showToast(Dashboard.t(err.status === 403 ? 'main.fieldLocked' : 'admin.saveError'), err.status === 403 ? 'warning' : 'error');
        } finally {
            busy = false;
            render();
        }
    });
    render();
    td.append(btn, fileInput);
}

function buildEvidenceCell(record, fieldKey, colId) {
    const td = document.createElement('td');
    td.dataset.col = colId;
    attachEvidenceControl(td, {
        value: record[fieldKey] || null,
        pending: isPending(record, fieldKey),
        uploadLabelKey: `main.${colId}`,
        viewLabelKey: `main.${colId}`,
        tableKey: TABLE_KEY,
        recordId: record.id,
        fieldKey,
        onCommit: (val) => ensureCreatedThenPatch(record, { [fieldKey]: val }),
    });
    return td;
}

function buildArticleTypeCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colArticuloTipo';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    select.innerHTML = `
        <option value="" data-i18n="main.articleTypeSelect">${Dashboard.t('main.articleTypeSelect')}</option>
        <option value="articulo-terminado" data-i18n="main.articleTypeFinished">${Dashboard.t('main.articleTypeFinished')}</option>
        <option value="materia-prima" data-i18n="main.articleTypeRawMaterial">${Dashboard.t('main.articleTypeRawMaterial')}</option>
    `;
    select.value = record.articleType || '';
    select.disabled = isPending(record, 'articleType') || !Dashboard.canEditField(TABLE_KEY, 'colArticuloTipo', record.articleType || '');
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'articleType') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => ensureCreatedThenPatch(record, { articleType: select.value }));
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
    if (Dashboard.hasColumnDeleteGrant(TABLE_KEY, 'colArticuloDeleteAuth')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.title = Dashboard.t('admin.delete');
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => deleteSkuItem(record.id, tr));
        td.appendChild(deleteBtn);
    }
    return td;
}

async function deleteSkuItem(id, tr) {
    if (!(await Dashboard.confirm(Dashboard.t('main.recordDeleteConfirm')))) return;
    try {
        const res = await fetch(`/api/business/sku-items/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
            if (res.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
            throw new Error('delete failed');
        }
        tr.remove();
        ensureEmptyState();
    } catch (err) {
        console.error('Alta Nuestros Artículos: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

function buildRow(record) {
    const cells = {};
    [
        ['colArticuloUpc', 'upc'],
        ['colArticuloDescUnica', 'uniqueDescription'],
        ['colArticuloDescConocida', 'knownDescription'],
        ['colArticuloDescPersonalizada', 'customDescription'],
        ['colArticuloUdm', 'mainUom'],
    ].forEach(([colId, key]) => {
        const td = document.createElement('td');
        td.dataset.col = colId;
        Dashboard.attachInlineEdit(td, {
            value: record[key] || '',
            inputType: 'text',
            tableKey: TABLE_KEY,
            colKey: colId,
            pending: isPending(record, key),
            onCommit: (val) => ensureCreatedThenPatch(record, { [key]: val.trim() }),
        });
        cells[colId] = td;
    });

    [
        ['colArticuloAlto', 'height'],
        ['colArticuloLargo', 'length'],
        ['colArticuloAncho', 'width'],
        ['colArticuloPesoArticulo', 'articleWeight'],
        ['colArticuloPesoEmpaque', 'packageWeight'],
    ].forEach(([colId, key]) => {
        const td = document.createElement('td');
        td.dataset.col = colId;
        Dashboard.attachInlineEdit(td, {
            value: record[key] || '',
            inputType: 'number',
            tableKey: TABLE_KEY,
            colKey: colId,
            pending: isPending(record, key),
            onCommit: (val) => ensureCreatedThenPatch(record, { [key]: parseFloat(val) || 0 }),
        });
        cells[colId] = td;
    });

    const tr = document.createElement('tr');
    tr.dataset.recordId = record.id != null ? String(record.id) : '';
    tr.append(
        ...buildSystemCells(record),
        textCellSystem('colArticuloRegistroUnico', record.registroUnico),
        textCell('colArticuloSku', record.sku),
        cells.colArticuloUpc,
        cells.colArticuloDescUnica,
        cells.colArticuloDescConocida,
        cells.colArticuloDescPersonalizada,
        cells.colArticuloUdm,
        buildArticleTypeCell(record),
        cells.colArticuloAlto,
        cells.colArticuloLargo,
        cells.colArticuloAncho,
        cells.colArticuloPesoArticulo,
        cells.colArticuloPesoEmpaque,
        buildEvidenceCell(record, 'evidenceFront', 'colArticuloEvidenceFront'),
        buildEvidenceCell(record, 'evidenceBack', 'colArticuloEvidenceBack'),
        buildEvidenceCell(record, 'evidenceLeft', 'colArticuloEvidenceLeft'),
        buildEvidenceCell(record, 'evidenceRight', 'colArticuloEvidenceRight'),
        buildEvidenceCell(record, 'evidenceTop', 'colArticuloEvidenceTop'),
        buildEvidenceCell(record, 'evidenceBottom', 'colArticuloEvidenceBottom'),
        ...CATEGORY_SELECT_FIELDS.map(([colId, apiKey, categoryType]) => buildCategorySelectCell(record, colId, apiKey, categoryType)),
        buildActionsCell(record, tr),
    );
    tr.classList.toggle('data-table-row-editable', !!tr.querySelector('td.editable-cell'));
    return tr;
}

function getTbody() {
    return document.querySelector('[data-table-id="nuestros-articulos"] table.data-table').tBodies[0];
}

function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = 33;
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
        const res = await fetch('/api/business/sku-items', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { skuItems } = await res.json();
        tbody.innerHTML = '';
        if (!skuItems.length) { ensureEmptyState(); return; }
        skuItems.forEach((record) => tbody.appendChild(buildRow(record)));
        applySkuItemFilters();
    } catch (err) {
        console.error('Alta Nuestros Artículos: failed to load records', err);
    }
}

function applySkuItemFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        const haystack = ['colArticuloSku', 'colArticuloUpc', 'colArticuloDescUnica', 'colArticuloDescConocida']
            .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
            .join(' ');
        tr.hidden = !haystack.includes(text);
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applySkuItemFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applySkuItemFilters);

function renderNewRecordButton() {
    const wrapper = document.querySelector('[data-table-id="nuestros-articulos"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.newSkuItem">${Dashboard.t('main.newSkuItem')}</span>`;
    btn.addEventListener('click', openCreateModal);
    toolbar.prepend(btn);
}

// --- "+ Nuevo Artículo" modal ------------------------------------------------
// Unlike Nuestras Unidades/Carga Combustible's click-per-cell pattern, this
// screen captures all 17 fields in one form on creation (confirmed with the
// client, given how many more fields this screen has). The record is only
// ever created on the server once "Guardar" succeeds -- closing/cancelling
// the form beforehand makes zero API calls, so it never leaves an orphan
// artículo behind. Field-level permission still applies: a field the current
// user can't edit renders disabled here too, same as the table's own cells.
const TEXT_FIELDS = [
    ['colArticuloUpc', 'upc', 'main.colArticuloUpc'],
    ['colArticuloDescUnica', 'uniqueDescription', 'main.colArticuloDescUnica'],
    ['colArticuloDescConocida', 'knownDescription', 'main.colArticuloDescConocida'],
    ['colArticuloDescPersonalizada', 'customDescription', 'main.colArticuloDescPersonalizada'],
    ['colArticuloUdm', 'mainUom', 'main.colArticuloUdm'],
];
const NUMBER_FIELDS = [
    ['colArticuloAlto', 'height', 'main.colArticuloAlto'],
    ['colArticuloLargo', 'length', 'main.colArticuloLargo'],
    ['colArticuloAncho', 'width', 'main.colArticuloAncho'],
    ['colArticuloPesoArticulo', 'articleWeight', 'main.colArticuloPesoArticulo'],
    ['colArticuloPesoEmpaque', 'packageWeight', 'main.colArticuloPesoEmpaque'],
];
const EVIDENCE_FIELDS = [
    ['colArticuloEvidenceFront', 'evidenceFront', 'main.colArticuloEvidenceFront'],
    ['colArticuloEvidenceBack', 'evidenceBack', 'main.colArticuloEvidenceBack'],
    ['colArticuloEvidenceLeft', 'evidenceLeft', 'main.colArticuloEvidenceLeft'],
    ['colArticuloEvidenceRight', 'evidenceRight', 'main.colArticuloEvidenceRight'],
    ['colArticuloEvidenceTop', 'evidenceTop', 'main.colArticuloEvidenceTop'],
    ['colArticuloEvidenceBottom', 'evidenceBottom', 'main.colArticuloEvidenceBottom'],
];

const createModal = document.getElementById('new-sku-modal');
const createForm = document.getElementById('new-sku-form');
const createFormError = document.getElementById('new-sku-form-error');
const createEvidenceGrid = document.getElementById('new-sku-evidence-grid');
const createCategoryGrid = document.getElementById('new-sku-category-grid');
const createEvidenceFiles = new Map(); // fieldKey -> File, cleared on every open/close

// Selects are rebuilt (not just reset) on every open so a category someone
// just added in another tab shows up without a full page reload.
function buildCategoryPickerFields() {
    createCategoryGrid.innerHTML = '';
    CATEGORY_SELECT_FIELDS.forEach(([colId, apiKey, categoryType]) => {
        const field = document.createElement('div');
        field.className = 'admin-field';
        const label = document.createElement('label');
        label.setAttribute('for', `new-sku-${apiKey}`);
        label.textContent = Dashboard.t(`main.${colId}`);
        const select = document.createElement('select');
        select.id = `new-sku-${apiKey}`;
        select.name = apiKey;
        select.disabled = !Dashboard.canEditField(TABLE_KEY, colId, '');
        const blankOption = document.createElement('option');
        blankOption.value = '';
        blankOption.textContent = Dashboard.t('main.articleTypeSelect');
        select.appendChild(blankOption);
        (categoryOptions[categoryType] || []).forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
        field.append(label, select);
        createCategoryGrid.appendChild(field);
    });
}

function buildEvidencePickerFields() {
    createEvidenceGrid.innerHTML = '';
    EVIDENCE_FIELDS.forEach(([colId, key, labelKey]) => {
        const field = document.createElement('div');
        field.className = 'admin-field';
        const editable = Dashboard.canEditField(TABLE_KEY, colId, '');
        field.innerHTML = `
            <label>${Dashboard.t(labelKey)}</label>
            <button type="button" class="btn btn-secondary new-sku-evidence-btn" data-key="${key}" ${editable ? '' : 'disabled'}>
                <i class="bx bx-camera" aria-hidden="true"></i> <span>${Dashboard.t('home.cargaTakePhoto')}</span>
            </button>
            <input type="file" accept="image/*" data-key="${key}" hidden>
        `;
        const btn = field.querySelector('.new-sku-evidence-btn');
        const input = field.querySelector('input[type="file"]');
        btn.addEventListener('click', () => input.click());
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) return;
            createEvidenceFiles.set(key, file);
            btn.innerHTML = `<i class="bx bx-check-circle" aria-hidden="true"></i> <span>${Dashboard.t('home.cargaChangePhoto')}</span>`;
        });
        createEvidenceGrid.appendChild(field);
    });
}

function applyCreateFormFieldPermissions() {
    TEXT_FIELDS.forEach(([colId, key]) => {
        const input = createForm.elements.namedItem(key);
        if (input) input.disabled = !Dashboard.canEditField(TABLE_KEY, colId, '');
    });
    NUMBER_FIELDS.forEach(([colId, key]) => {
        const input = createForm.elements.namedItem(key);
        if (input) input.disabled = !Dashboard.canEditField(TABLE_KEY, colId, '');
    });
    const typeInput = createForm.elements.namedItem('articleType');
    if (typeInput) typeInput.disabled = !Dashboard.canEditField(TABLE_KEY, 'colArticuloTipo', '');
}

async function openCreateModal() {
    createForm.reset();
    createFormError.hidden = true;
    createEvidenceFiles.clear();
    await loadCategoryOptions();
    applyCreateFormFieldPermissions();
    buildEvidencePickerFields();
    buildCategoryPickerFields();
    createModal.hidden = false;
}

function closeCreateModal() {
    createModal.hidden = true;
}

document.getElementById('new-sku-cancel')?.addEventListener('click', closeCreateModal);
createModal?.addEventListener('click', (event) => { if (event.target === createModal) closeCreateModal(); });

createForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    createFormError.hidden = true;
    const saveBtn = document.getElementById('new-sku-save');
    saveBtn.disabled = true;
    try {
        const res = await fetch('/api/business/sku-items', { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error('create failed');
        const { skuItem } = await res.json();

        const patch = {};
        TEXT_FIELDS.forEach(([, key]) => {
            const input = createForm.elements.namedItem(key);
            if (input && !input.disabled) patch[key] = input.value.trim();
        });
        NUMBER_FIELDS.forEach(([, key]) => {
            const input = createForm.elements.namedItem(key);
            if (input && !input.disabled) patch[key] = input.value === '' ? 0 : parseFloat(input.value) || 0;
        });
        const typeInput = createForm.elements.namedItem('articleType');
        if (typeInput && !typeInput.disabled) patch.articleType = typeInput.value;
        CATEGORY_SELECT_FIELDS.forEach(([, apiKey]) => {
            const input = createForm.elements.namedItem(apiKey);
            if (input && !input.disabled) patch[apiKey] = input.value;
        });
        await fetch(`/api/business/sku-items/${skuItem.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });

        for (const [, key] of EVIDENCE_FIELDS) {
            const file = createEvidenceFiles.get(key);
            if (!file) continue;
            try {
                const evidenceKey = await Dashboard.uploadEvidenceFile(file, { tableKey: TABLE_KEY, recordId: skuItem.id, fieldKey: key });
                await fetch(`/api/business/sku-items/${skuItem.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ [key]: evidenceKey }),
                });
            } catch (err) {
                console.error(`Alta Nuestros Artículos: evidence upload failed for ${key}`, err);
            }
        }

        closeCreateModal();
        await refreshTable();
    } catch (err) {
        console.error('Alta Nuestros Artículos: failed to save new record', err);
        createFormError.textContent = Dashboard.t('admin.saveError');
        createFormError.hidden = false;
    } finally {
        saveBtn.disabled = false;
    }
});
