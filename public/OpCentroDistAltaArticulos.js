// ---------------------------------------------------------------------------
// Alta Nuestros Artículos (Sku) — Operaciones > Cadena de Suministro > C.
// Distribución. Operación only: data only capturable with the physical
// product in hand. Categorías/Estatus (Catálogos), Punto de Reorden
// (Gestión) and Activar/Inactivar (Administración) are deliberately NOT
// columns here — confirmed with the client.
//
// "+ Nuevo Artículo" creates a blank row — every field is filled in later
// by clicking directly on the cell, same convention as Nuestras Unidades/
// Carga Combustible. Registro Único and SKU are never edited: both are
// server-generated at creation (db_id / record_number, see db.js), shown
// read-only. Persisted via /api/business/sku-items.
// ---------------------------------------------------------------------------

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-centro-dist-alta-articulos' });
        if (!role) return;
        renderNewRecordButton();
        await refreshTable();
    } catch (err) {
        console.error('Alta Nuestros Artículos failed to initialize:', err);
    }
})();

const TABLE_KEY = 'nuestros-articulos';

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

// A draft row (record.id === null, never persisted -- see createNewSkuItem)
// only actually gets created on the server once its FIRST field commits, so
// "+ Nuevo Artículo" followed by leaving the row untouched never leaves a
// blank artículo behind.
async function ensureCreatedThenPatch(record, patch) {
    if (record.id) return patchSkuItem(record.id, patch);
    try {
        const res = await fetch('/api/business/sku-items', { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error('create failed');
        const { skuItem } = await res.json();
        record.id = skuItem.id;
        record.registroUnico = skuItem.registroUnico;
        record.sku = skuItem.sku;
        await patchSkuItem(skuItem.id, patch);
    } catch (err) {
        console.error('Alta Nuestros Artículos: failed to create record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
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
    if (!record.id || Dashboard.hasColumnDeleteGrant(TABLE_KEY, 'colArticuloDeleteAuth')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.title = Dashboard.t('admin.delete');
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => {
            if (!record.id) { tr.remove(); ensureEmptyState(); return; }
            deleteSkuItem(record.id, tr);
        });
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

// Only adds a local, in-memory draft row (record.id === null) -- nothing is
// persisted server-side until its first field actually commits (see
// ensureCreatedThenPatch), so clicking this and never touching the row never
// leaves a blank artículo behind.
function createNewSkuItem() {
    const draft = {
        id: null, registroUnico: '', sku: '', upc: '', uniqueDescription: '', knownDescription: '', customDescription: '',
        mainUom: '', articleType: '', height: '', length: '', width: '', articleWeight: '', packageWeight: '',
        evidenceFront: '', evidenceBack: '', evidenceLeft: '', evidenceRight: '', evidenceTop: '', evidenceBottom: '',
        pendingFields: [],
    };
    const tbody = getTbody();
    const emptyRow = tbody.querySelector('td.data-table-empty-cell')?.closest('tr');
    if (emptyRow) emptyRow.remove();
    tbody.appendChild(buildRow(draft));
}

function renderNewRecordButton() {
    const wrapper = document.querySelector('[data-table-id="nuestros-articulos"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.newSkuItem">${Dashboard.t('main.newSkuItem')}</span>`;
    btn.addEventListener('click', createNewSkuItem);
    toolbar.prepend(btn);
}
