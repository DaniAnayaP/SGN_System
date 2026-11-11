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

// Esta misma pantalla sirve a tres páginas, las tres sobre la misma tabla de artículos:
//   - Alta Nuestros Artículos: los códigos a los que todavía les falta algún dato. Aquí se dan de alta (formulario o plantilla) y se terminan de llenar; en cuanto queda lleno el último
//     dato el código sale de Alta y pasa a Catálogos > Códigos.
//   - Catálogos > Códigos (CatCentroDistCodigos.html): los códigos ya completos, SOLO LECTURA. Para corregir uno se elige Editar.
//   - Operaciones > Edición Código (OpCentroDistEdicionCodigo.html): los códigos que se mandaron a corregir con Editar. Se editan como en Alta y, con los 24 datos llenos, se elige
//     Terminar edición y regresan a Códigos.
const PAGE = document.body.dataset.activePage;
const CODES_MODE = PAGE === 'cat-catalogos-centro-dist-codigos';
const EDIT_MODE = PAGE === 'cat-operaciones-centro-dist-edicion-codigo';
const ACTIVE_PAGE = CODES_MODE || EDIT_MODE ? PAGE : 'cat-operaciones-centro-dist-alta-articulos';
const SKU_SCOPE = CODES_MODE ? 'complete' : (EDIT_MODE ? 'editing' : 'pending');

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: ACTIVE_PAGE });
        if (!role) return;
        await loadCategoryOptions();
        if (!CODES_MODE && !EDIT_MODE) renderNewRecordButton();
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
    ['colArticuloCategoriaTipoCodigo', 'categoryTipoCodigo', 'tipocodigo'],
];
let categoryOptions = {};
// Clasificación del código: por cada Categoría Inventario (su nombre), las clasificaciones activas que tiene ({ id, name }); el campo Clasificación solo ofrece esas.
let classificationsByInventory = {};
async function loadCategoryOptions() {
    try {
        const res = await fetch('/api/business/article-categories-active', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { options, classificationsByInventory: byInventory } = await res.json();
        categoryOptions = options || {};
        classificationsByInventory = byInventory || {};
    } catch (err) {
        console.error('Alta Nuestros Artículos: failed to load category options', err);
        categoryOptions = {};
        classificationsByInventory = {};
    }
}

// Clasificación (opcional, no cuenta para completar el código): la lista depende de la Categoría Inventario del código. Siempre se ve la que ya tiene aunque ya no se ofrezca.
function classificationChoices(categoryName, currentId, currentName) {
    const list = (classificationsByInventory[categoryName] || []).map((c) => ({ id: c.id, name: c.name }));
    if (currentId != null && currentName && !list.some((c) => c.id === currentId)) list.unshift({ id: currentId, name: currentName });
    return list;
}
function buildClassificationCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colArticuloClasificacion';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    select.setAttribute('data-help-key', 'colArticuloClasificacion');
    const choices = classificationChoices(record.categoryInventario, record.classificationId, record.classificationName);
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = !record.categoryInventario ? Dashboard.t('main.clasifElegirCategoria') : (choices.length ? Dashboard.t('main.articleTypeSelect') : Dashboard.t('main.clasifSinOpciones'));
    select.appendChild(blank);
    choices.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = String(c.id);
        opt.textContent = c.name;
        select.appendChild(opt);
    });
    select.value = record.classificationId == null ? '' : String(record.classificationId);
    const currentName = record.classificationName || '';
    select.disabled = isPending(record, 'classificationId') || !record.categoryInventario || !choices.length || !Dashboard.canEditField(TABLE_KEY, 'colArticuloClasificacion', currentName);
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'classificationId') ? 'main.changePending' : (!record.categoryInventario ? 'main.clasifElegirCategoria' : (!choices.length ? 'main.clasifSinOpciones' : 'main.fieldLocked')));
    select.addEventListener('change', () => ensureCreatedThenPatch(record, { classificationId: select.value === '' ? null : Number(select.value) }));
    td.appendChild(select);
    return td;
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

// --- Código QR / Ficha pública -----------------------------------------------
// Every apiKey SKU_ITEM_PATCHABLE_FIELDS covers server-side (db.js) --
// mirrored here just to show "X de 24" before the QR exists; the server is
// the one that actually decides completeness and issues publicToken (see
// maybeIssueSkuPublicToken in server.js), never this client-side count.
const SKU_REQUIRED_FIELDS = [
    'upc', 'uniqueDescription', 'knownDescription', 'customDescription', 'mainUom', 'articleType',
    'height', 'length', 'width', 'articleWeight', 'packageWeight',
    'evidenceFront', 'evidenceBack', 'evidenceLeft', 'evidenceRight', 'evidenceTop', 'evidenceBottom',
    'categoryInventario', 'categoryCompra', 'categoryAlmacenamiento', 'categoryRotacion', 'categoryManejo', 'categoryRiesgo', 'categoryVidautil',
];
function isSkuFieldFilled(value) {
    return value !== null && value !== undefined && value !== '' && value !== 0;
}
function skuDoneCount(record) {
    return SKU_REQUIRED_FIELDS.filter((key) => isSkuFieldFilled(record[key])).length;
}

// QRCode.toDataURL (loaded via CDN, see OpCentroDistAltaArticulos.html) is
// async, so the swatch starts blank and fills in a moment later -- never
// blocks building the rest of the row/table.
function buildQrCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colArticuloQr';
    if (!record.publicToken) {
        const chip = document.createElement('span');
        chip.className = 'admin-badge admin-badge-suspendido';
        chip.textContent = `${Dashboard.t('main.qrPending')} · ${skuDoneCount(record)}/${SKU_REQUIRED_FIELDS.length}`;
        td.appendChild(chip);
        return td;
    }
    const fichaUrl = `${window.location.origin}/Ficha.html?token=${encodeURIComponent(record.publicToken)}`;
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';
    const img = document.createElement('img');
    img.width = 34;
    img.height = 34;
    img.alt = Dashboard.t('main.colArticuloQr');
    img.style.borderRadius = '4px';
    if (window.QRCode?.toDataURL) {
        window.QRCode.toDataURL(fichaUrl, { width: 68, margin: 1 })
            .then((dataUrl) => { img.src = dataUrl; })
            .catch((err) => console.error('QR generation failed', err));
    }
    const link = document.createElement('a');
    link.href = fichaUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = Dashboard.t('main.qrViewFicha');
    wrap.append(img, link);
    td.appendChild(wrap);
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

// Avisa cuando un código cambió de pantalla con lo que se acaba de guardar: en Alta, el que quedó completo pasa a Catálogos > Códigos.
function announceMoved(skuItem) {
    if (!skuItem) return;
    if (!CODES_MODE && !EDIT_MODE && skuItem.complete) Dashboard.showToast(Dashboard.t('main.codigoPasoACatalogo').replace('{sku}', skuItem.sku), 'success');
}

// Editar (en Códigos): manda el código a Edición Código. Terminar edición (en Edición Código): lo regresa a Códigos; solo si ya tiene los 24 datos.
async function moveSkuItem(record, action) {
    try {
        const res = await fetch(`/api/business/sku-items/${record.id}/${action}`, { method: 'POST', credentials: 'include' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            Dashboard.showToast(body.code === 'incomplete' ? Dashboard.t('main.skuFaltanDatos') : (body.message || Dashboard.t('admin.saveError')), body.code === 'incomplete' ? 'warning' : 'error');
            await refreshTable();
            return;
        }
        Dashboard.showToast(Dashboard.t(action === 'edit' ? 'main.skuPasoAEdicion' : 'main.skuTerminoEdicion').replace('{sku}', record.sku), 'success');
        removeSkuRecord(record.id);
    } catch (err) {
        console.error('Códigos: failed to move the record', err);
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
        announceMoved(body.skuItem);
        const clean = body.skuItem && !body.rejectedFields?.length && !body.pendingFields?.length && !body.conflictFields?.length;
        if (clean && skuRecords.some((r) => r.id === body.skuItem.id)) applySavedSkuRecord(body.skuItem, skuRecords.find((r) => r.id === body.skuItem.id));
        else await refreshTable();
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
        btn.setAttribute('data-help-key', 'evidencePhoto');
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

// «Ver presentaciones de distribución»: abre, en una ventana, la secuencia de presentaciones del código (material principal > empaques) como se ve en Presentaciones de Distribución, solo para verla.
let udmViewEl = null;
function buildUdmDistCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colArticuloUdmDist';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-secondary';
    btn.dataset.helpKey = 'udmVerDist';
    btn.textContent = Dashboard.t('main.udmVerDist');
    btn.disabled = record.id == null;
    btn.addEventListener('click', () => openUdmDistView(record));
    td.appendChild(btn);
    return td;
}
async function openUdmDistView(record) {
    if (!udmViewEl) {
        udmViewEl = document.createElement('div');
        udmViewEl.className = 'modal-overlay';
        udmViewEl.hidden = true;
        udmViewEl.innerHTML = '<div class="modal-panel udm-view-win" role="dialog" aria-modal="true"><div id="udm-view-body" class="udm-chain"></div><div class="rel-foot"><a class="btn btn-secondary" id="udm-view-go" href="OpCentroDistUdmDistribucion.html" hidden></a><button type="button" class="btn btn-secondary" id="udm-view-close"></button></div></div>';
        document.body.appendChild(udmViewEl);
        udmViewEl.addEventListener('click', (event) => { if (event.target === udmViewEl || event.target.closest('#udm-view-close')) udmViewEl.hidden = true; });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && udmViewEl && !udmViewEl.hidden) udmViewEl.hidden = true; });
    }
    const body = udmViewEl.querySelector('#udm-view-body');
    body.innerHTML = `<p class="rel-muted">${Dashboard.t('main.qrsCargando')}</p>`;
    udmViewEl.querySelector('#udm-view-close').textContent = Dashboard.t('main.qrsCerrar');
    const go = udmViewEl.querySelector('#udm-view-go');
    go.textContent = Dashboard.t('main.udmVerIr');
    go.hidden = !Dashboard.hasScreenGrant('supply-chain', 'sc-area-distribution-center', 'cat-operaciones/cat-operaciones-centro-dist-udm-distribucion');
    udmViewEl.hidden = false;
    try {
        const res = await fetch(`/api/business/sku-distribution?skuItemId=${encodeURIComponent(record.id)}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { rows } = await res.json();
        const safe = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        body.innerHTML = rows.length ? Dashboard.udmChainHtml(rows) : `<div class="udm-chain-title">${safe(Dashboard.t('main.udmChainTitle').replace('{sku}', `${record.uniqueDescription || record.knownDescription || record.customDescription || ''}`))}</div><p class="rel-muted">${safe(Dashboard.t('main.udmVerVacio'))}</p>`;
    } catch (err) {
        console.error('Alta Artículos: no se pudieron cargar las presentaciones de distribución', err);
        body.innerHTML = `<p class="rel-muted">${Dashboard.t('admin.saveError')}</p>`;
    }
}
// Tipo de almacenamiento: a qué UDM corresponden las medidas del código y su capacidad (lista fija; opcional).
const STORAGE_TYPE_KEYS = ['original', 'almacenamiento', 'compra', 'empaque', 'pallet'];
function buildStorageTypeCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colArticuloTipoAlmacenamiento';
    const select = document.createElement('select');
    select.className = 'editable-cell-select';
    select.innerHTML = `<option value="">${Dashboard.t('main.articleTypeSelect')}</option>${STORAGE_TYPE_KEYS.map((k) => `<option value="${k}">${Dashboard.t(`main.storageType_${k}`)}</option>`).join('')}`;
    select.value = record.storageType || '';
    select.disabled = isPending(record, 'storageType') || !Dashboard.canEditField(TABLE_KEY, 'colArticuloTipoAlmacenamiento', record.storageType || '');
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'storageType') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => ensureCreatedThenPatch(record, { storageType: select.value }));
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
    historyBtn.setAttribute('data-help-key', 'changeHistory');
    historyBtn.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
    historyBtn.title = Dashboard.t('main.changeHistoryTitleRecord');
    historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    historyBtn.addEventListener('click', () => Dashboard.openChangeHistory(TABLE_KEY, record.id));
    td.appendChild(historyBtn);
    // Códigos: solo lectura, con Editar (lo manda a Edición Código). Edición Código: Terminar edición (lo regresa a Códigos). Los dos piden la hoja de Edición Código.
    if ((CODES_MODE || EDIT_MODE) && Dashboard.hasScreenGrant('supply-chain', 'sc-area-distribution-center', 'cat-operaciones/cat-operaciones-centro-dist-edicion-codigo')) {
        const moveBtn = document.createElement('button');
        moveBtn.type = 'button';
        moveBtn.className = 'admin-icon-btn';
        moveBtn.setAttribute('data-help-key', CODES_MODE ? 'skuEditar' : 'skuTerminarEdicion');
        const label = Dashboard.t(CODES_MODE ? 'main.skuEditarBtn' : 'main.skuTerminarEdicionBtn');
        moveBtn.setAttribute('aria-label', label);
        moveBtn.title = label;
        moveBtn.innerHTML = `<i class="bx ${CODES_MODE ? 'bx-edit' : 'bx-check-circle'}" aria-hidden="true"></i>`;
        moveBtn.addEventListener('click', () => moveSkuItem(record, CODES_MODE ? 'edit' : 'finish-edit'));
        td.appendChild(moveBtn);
    }
    if (!CODES_MODE && Dashboard.hasColumnDeleteGrant(TABLE_KEY, 'colArticuloDeleteAuth')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('data-help-key', 'delete');
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
        removeSkuRecord(id);
    } catch (err) {
        console.error('Alta Nuestros Artículos: failed to delete record', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// Catálogos > Códigos es de solo lectura: las celdas no se abren y los selectores y fotos no se pueden cambiar (las fotos sí se pueden ver). Para corregir se usa Editar.
function makeRowReadOnly(tr) {
    tr.querySelectorAll('td.editable-cell, td.editable-cell-locked').forEach((td) => {
        td.onclick = null;
        td.classList.remove('editable-cell');
        td.removeAttribute('title');
    });
    tr.querySelectorAll('select').forEach((select) => { select.disabled = true; select.title = Dashboard.t('main.skuSoloLectura'); });
    tr.querySelectorAll('input[type="file"]').forEach((input) => { input.disabled = true; });
    // el botón de la cámara (foto que falta) no sube archivos aquí
    tr.querySelectorAll('td button.admin-icon-btn i.bx-camera').forEach((icon) => { const btn = icon.closest('button'); btn.disabled = true; btn.title = Dashboard.t('main.skuSoloLectura'); });
}

function buildRow(record) {
    const cells = {};
    [
        ['colArticuloUpc', 'upc'],
        ['colArticuloDescUnica', 'uniqueDescription'],
        ['colArticuloDescConocida', 'knownDescription'],
        ['colArticuloDescPersonalizada', 'customDescription'],
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

    // medidas en centímetros y pesos en kilogramos: la unidad se ve siempre después del número
    [
        ['colArticuloAlto', 'height', 'cm'],
        ['colArticuloLargo', 'length', 'cm'],
        ['colArticuloAncho', 'width', 'cm'],
        ['colArticuloPesoArticulo', 'articleWeight', 'kg'],
        ['colArticuloPesoEmpaque', 'packageWeight', 'kg'],
    ].forEach(([colId, key, unit]) => {
        const td = document.createElement('td');
        td.dataset.col = colId;
        Dashboard.attachInlineEdit(td, {
            value: record[key] || '',
            inputType: 'number',
            unit,
            tableKey: TABLE_KEY,
            colKey: colId,
            pending: isPending(record, key),
            onCommit: (val) => ensureCreatedThenPatch(record, { [key]: parseFloat(val) || 0 }),
        });
        cells[colId] = td;
    });

    // Datos de estiba (enteros; 0 = sin capturar)
    [
        ['colArticuloCantidadCama', 'unitsPerLayer'],
        ['colArticuloCamasPallet', 'layersPerPallet'],
        ['colArticuloMaxEstiba', 'maxStack'],
    ].forEach(([colId, key]) => {
        const td = document.createElement('td');
        td.dataset.col = colId;
        Dashboard.attachInlineEdit(td, {
            value: record[key] || '',
            inputType: 'number',
            step: '1',
            tableKey: TABLE_KEY,
            colKey: colId,
            pending: isPending(record, key),
            onCommit: (val) => ensureCreatedThenPatch(record, { [key]: Math.max(0, Math.round(Number(val)) || 0) }),
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
        buildCategorySelectCell(record, 'colArticuloUdm', 'mainUom', 'udm'),
        buildArticleTypeCell(record),
        ...(!CODES_MODE && !EDIT_MODE ? [buildUdmDistCell(record)] : []), // Alta: «Ver presentaciones de distribución» (la secuencia de presentaciones del código)
        cells.colArticuloAlto,
        cells.colArticuloLargo,
        cells.colArticuloAncho,
        cells.colArticuloPesoArticulo,
        cells.colArticuloPesoEmpaque,
        // «Almacenamiento Artículo» (tipo de almacenamiento, cantidad por cama, camas por pallet, máxima estiba) ya no se captura en Alta: pasa a Presentaciones de Distribución (en Alta solo se configura la UDM original del
        // producto). Mientras tanto Catálogos > Códigos y Edición Código lo siguen mostrando para no perder lo ya capturado.
        ...(CODES_MODE || EDIT_MODE ? [buildStorageTypeCell(record), cells.colArticuloCantidadCama, cells.colArticuloCamasPallet, cells.colArticuloMaxEstiba] : []),
        buildEvidenceCell(record, 'evidenceFront', 'colArticuloEvidenceFront'),
        buildEvidenceCell(record, 'evidenceBack', 'colArticuloEvidenceBack'),
        buildEvidenceCell(record, 'evidenceLeft', 'colArticuloEvidenceLeft'),
        buildEvidenceCell(record, 'evidenceRight', 'colArticuloEvidenceRight'),
        buildEvidenceCell(record, 'evidenceTop', 'colArticuloEvidenceTop'),
        buildEvidenceCell(record, 'evidenceBottom', 'colArticuloEvidenceBottom'),
        ...CATEGORY_SELECT_FIELDS.flatMap(([colId, apiKey, categoryType]) => [
            buildCategorySelectCell(record, colId, apiKey, categoryType),
            // la Clasificación va justo después de la Categoría Inventario
            ...(apiKey === 'categoryInventario' ? [buildClassificationCell(record)] : []),
        ]),
        buildQrCell(record),
        buildActionsCell(record, tr),
    );
    if (CODES_MODE) makeRowReadOnly(tr);
    tr.classList.toggle('data-table-row-editable', !!tr.querySelector('td.editable-cell'));
    if (skuSelectMode) decorateRowSelection(tr);
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
    td.colSpan = 47;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = Dashboard.t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}

// Con miles de códigos esta pantalla tardaba minutos en abrirse: cada fila trae más de cien piezas (listas, fotos, botones) y dibujarlas todas, y recalcular la tabla en cada tanda, congelaba la página. Ahora solo se dibujan
// las primeras filas al entrar; el resto sale al bajar (o con «Mostrar más» / «Mostrar todos»). Todo lo que llegó del servidor se guarda en skuRecords: la búsqueda de texto trabaja sobre esos datos (no sobre las filas
// dibujadas), y lo que lee todas las filas del DOM (ordenar o filtrar por columna) pide primero dibujar el resto (Dashboard.registerPartialTable). Al guardar una celda solo se cambia esa fila, ya no se vuelve a leer y
// dibujar toda la tabla.
const SKU_FIRST_ROWS = 100; // las que se dibujan al entrar
const SKU_NEXT_ROWS = 200; // las que se agregan al bajar o con «Mostrar más»
let skuRecords = []; // todo lo que mandó el servidor
let skuView = []; // lo que cumple la búsqueda de texto (todo, si no hay búsqueda)
let skuDrawn = 0; // cuántos de skuView ya están dibujados
let skuDrawing = null; // la tanda que se está dibujando (promesa)
let skuLoadToken = 0; // una recarga o una búsqueda nueva cancela la tanda anterior
let skuFetchToken = 0;

const skuSearchText = () => (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
function skuMatchesText(record, text) {
    const haystack = [record.sku, record.upc, record.uniqueDescription, record.knownDescription].map((v) => String(v || '')).join(' ').toLowerCase();
    return SearchSyntax.matches('contains', text, haystack);
}
function computeSkuView() {
    const text = skuSearchText();
    skuView = text ? skuRecords.filter((r) => skuMatchesText(r, text)) : skuRecords.slice();
}
// ¿Este código es de esta pantalla? (Alta: los que aún les falta algún dato; Códigos: los completos; Edición Código: los que se mandaron a corregir)
function skuInScope(record) {
    if (EDIT_MODE) return !!record.editing;
    return !record.editing && !!record.complete === CODES_MODE;
}

function drawSkuRows(count) {
    if (skuDrawing) return skuDrawing;
    if (skuDrawn >= skuView.length) return Promise.resolve(true);
    const token = skuLoadToken;
    const from = skuDrawn;
    const slice = skuView.slice(from, from + count);
    const run = (async () => {
        const finished = await Dashboard.renderTableRowsInChunks({ tableKey: TABLE_KEY, tbody: getTbody(), records: slice, buildRow, isStale: () => token !== skuLoadToken });
        if (token === skuLoadToken) {
            if (finished) skuDrawn = from + slice.length;
            skuDrawing = null;
            updateSkuMoreBar();
        }
        return finished;
    })();
    skuDrawing = run;
    return run;
}
// Dibuja todo lo que falta (para ordenar o filtrar por columna, o con «Mostrar todos»).
async function drawAllSkuRows() {
    while (skuDrawn < skuView.length) {
        const ok = await drawSkuRows(skuView.length - skuDrawn);
        if (!ok) return false;
    }
    return true;
}
function resetSkuRows() {
    skuLoadToken += 1;
    skuDrawing = null;
    skuDrawn = 0;
    getTbody().innerHTML = '';
    if (!skuView.length) { ensureEmptyState(); updateSkuMoreBar(); return Promise.resolve(true); }
    return drawSkuRows(SKU_FIRST_ROWS);
}
function skuToolbar() { return document.querySelector('[data-table-id="nuestros-articulos"]')?.previousElementSibling || null; }
// «Mostrando X de Y» con los botones para dibujar más; solo sale cuando falta algo por dibujar.
function updateSkuMoreBar() {
    const toolbar = skuToolbar();
    if (!toolbar) return;
    let bar = toolbar.querySelector('.sku-more-bar');
    if (skuDrawn >= skuView.length) { if (bar) bar.remove(); return; }
    if (!bar) {
        bar = document.createElement('span');
        bar.className = 'sku-more-bar tpl-muted';
        bar.innerHTML = '<span class="sku-more-text" aria-live="polite"></span><button type="button" class="btn btn-secondary sku-more-btn" data-sku-more></button><button type="button" class="btn btn-secondary sku-more-btn" data-sku-all></button>';
        bar.querySelector('[data-sku-more]').addEventListener('click', () => drawSkuRows(SKU_NEXT_ROWS));
        bar.querySelector('[data-sku-all]').addEventListener('click', () => drawAllSkuRows());
        toolbar.prepend(bar);
    }
    bar.querySelector('.sku-more-text').textContent = Dashboard.t('main.skuMostrando').replace('{shown}', String(skuDrawn)).replace('{total}', String(skuView.length));
    bar.querySelector('[data-sku-more]').textContent = Dashboard.t('main.skuMostrarMas');
    bar.querySelector('[data-sku-all]').textContent = Dashboard.t('main.skuMostrarTodos');
}
// Al bajar casi hasta el final de lo dibujado, se dibujan más filas.
function watchSkuScroll() {
    const wrapper = document.querySelector('[data-table-id="nuestros-articulos"]');
    if (!wrapper || wrapper.dataset.skuScrollBound) return;
    wrapper.dataset.skuScrollBound = '1';
    wrapper.addEventListener('scroll', () => {
        if (skuDrawing || skuDrawn >= skuView.length) return;
        if (wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 800) drawSkuRows(SKU_NEXT_ROWS);
    }, { passive: true });
}

async function refreshTable() {
    const tbody = getTbody();
    if (tbody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const token = ++skuFetchToken;
    try {
        const res = await fetch(`/api/business/sku-items?scope=${SKU_SCOPE}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { skuItems } = await res.json();
        if (token !== skuFetchToken) return; // llegó otra recarga después de esta
        skuRecords = skuItems;
        computeSkuView();
        watchSkuScroll();
        const finished = await resetSkuRows();
        if (finished && token === skuFetchToken && window.Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY);
    } catch (err) {
        console.error('Alta Nuestros Artículos: failed to load records', err);
    }
}

// La búsqueda de texto trabaja sobre todos los códigos que llegaron (no solo sobre las filas dibujadas) y dibuja las primeras de lo que coincide.
function applySkuItemFilters() {
    computeSkuView();
    resetSkuRows().then((finished) => { if (finished && window.Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY); });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applySkuItemFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applySkuItemFilters);
if (window.Dashboard && Dashboard.registerPartialTable) Dashboard.registerPartialTable(TABLE_KEY, { isComplete: () => skuDrawn >= skuView.length, loadAll: drawAllSkuRows });

// ---- Seleccionar y eliminar varios (Alta y Edición Código; Códigos es de solo lectura) -------------------------------------------------------------------------
// «Seleccionar» marca TODO lo que quede filtrado (la búsqueda de texto y los filtros de columna), también lo que todavía no está dibujado; cada vez que cambian los filtros se puede volver a marcar lo filtrado. Solo cuenta lo marcado
// que sigue a la vista: lo que un filtro esconde nunca se elimina por accidente. «Eliminar» pide confirmar (dos veces si son muchos), manda los códigos por tandas y los que ya tienen ubicaciones en Relación Código se saltan.
// Pide la misma hoja del árbol que el botón de eliminar de cada renglón (Autorización para Eliminar).
let skuSelectMode = false;
const skuSelected = new Set(); // ids marcados
let skuSelectObserver = null;
let skuDeleting = false;
const SKU_BULK_CHUNK = 200;
const SKU_BULK_FINAL_CONFIRM_FROM = 20; // desde cuántos códigos se pide una segunda confirmación
const canBulkDelete = () => !CODES_MODE && Dashboard.hasColumnDeleteGrant(TABLE_KEY, 'colArticuloDeleteAuth');
const fillText = (key, params) => Object.entries(params || {}).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), Dashboard.t(key));
// Lo filtrado: lo que cumple la búsqueda de texto (skuView) y no lo esconde un filtro de columna (esos filtros obligan a tener todas las filas dibujadas, así que se leen del DOM).
function filteredSkuIds() {
    const hidden = new Set(Array.from(getTbody().querySelectorAll('tr.data-table-row-col-filtered')).map((tr) => Number(tr.dataset.recordId)));
    return skuView.filter((r) => !hidden.has(r.id)).map((r) => r.id);
}
const selectedFilteredIds = () => filteredSkuIds().filter((id) => skuSelected.has(id));
function decorateRowSelection(tr) {
    const td = tr.querySelector('td.admin-table-actions');
    if (!td) return;
    const id = Number(tr.dataset.recordId);
    let box = td.querySelector('input.sku-row-check');
    if (!skuSelectMode) { if (box) box.remove(); tr.classList.remove('sku-row-selected'); return; }
    if (!box) {
        box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'sku-row-check';
        box.setAttribute('aria-label', Dashboard.t('main.skuSelRow'));
        box.addEventListener('change', () => {
            if (box.checked) skuSelected.add(id); else skuSelected.delete(id);
            tr.classList.toggle('sku-row-selected', box.checked);
            updateSelectBar();
        });
        td.prepend(box);
    }
    box.checked = skuSelected.has(id);
    tr.classList.toggle('sku-row-selected', box.checked);
}
function decorateAllRowSelection() {
    getTbody().querySelectorAll('tr[data-record-id]').forEach(decorateRowSelection);
}
function selectBar() { return skuToolbar()?.querySelector('.sku-select-bar') || null; }
function updateSelectBar() {
    const bar = selectBar();
    if (!bar) return;
    const filtered = filteredSkuIds();
    const selected = filtered.filter((id) => skuSelected.has(id)).length;
    bar.querySelector('.sku-select-text').textContent = fillText('main.skuSelTexto', { n: selected, m: filtered.length });
    bar.querySelector('[data-sku-select-filtered]').textContent = fillText('main.skuSelFiltrado', { m: filtered.length });
    const del = bar.querySelector('[data-sku-delete]');
    del.textContent = fillText('main.skuEliminarSel', { n: selected });
    del.disabled = !selected || skuDeleting;
    bar.querySelector('[data-sku-select-none]').disabled = !selected || skuDeleting;
}
function selectFiltered() {
    filteredSkuIds().forEach((id) => skuSelected.add(id));
    decorateAllRowSelection();
    updateSelectBar();
}
function enterSelectMode() {
    if (skuSelectMode) return;
    skuSelectMode = true;
    const toolbar = skuToolbar();
    const bar = document.createElement('span');
    bar.className = 'sku-select-bar tpl-muted';
    bar.innerHTML = `<span class="sku-select-text" aria-live="polite"></span>
        <button type="button" class="btn btn-secondary sku-more-btn" data-sku-select-filtered data-help-key="skuSeleccionar"></button>
        <button type="button" class="btn btn-secondary sku-more-btn" data-sku-select-none>${Dashboard.t('main.skuSelQuitar')}</button>
        <button type="button" class="btn btn-danger sku-more-btn sku-delete-btn" data-sku-delete data-help-key="skuEliminarVarios"></button>
        <button type="button" class="btn btn-secondary sku-more-btn" data-sku-select-exit>${Dashboard.t('main.skuSelCerrar')}</button>`;
    bar.querySelector('[data-sku-select-filtered]').addEventListener('click', selectFiltered);
    bar.querySelector('[data-sku-select-none]').addEventListener('click', () => { skuSelected.clear(); decorateAllRowSelection(); updateSelectBar(); });
    bar.querySelector('[data-sku-delete]').addEventListener('click', bulkDeleteSelected);
    bar.querySelector('[data-sku-select-exit]').addEventListener('click', exitSelectMode);
    toolbar.querySelector('.sku-select-btn')?.after(bar);
    // los filtros de columna esconden o muestran filas sin avisar: la barra se actualiza sola
    let timer = null;
    skuSelectObserver = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(updateSelectBar, 150); });
    skuSelectObserver.observe(getTbody(), { attributes: true, subtree: true, attributeFilter: ['class'], childList: true });
    selectFiltered();
}
function exitSelectMode() {
    if (!skuSelectMode || skuDeleting) return;
    skuSelectMode = false;
    skuSelected.clear();
    if (skuSelectObserver) { skuSelectObserver.disconnect(); skuSelectObserver = null; }
    selectBar()?.remove();
    decorateAllRowSelection();
}
// El botón «Seleccionar» de la barra de la tabla (solo con la hoja de eliminar).
function mountSelectButton(toolbar) {
    if (!canBulkDelete() || toolbar.querySelector('.sku-select-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-template-btn sku-select-btn';
    btn.setAttribute('data-help-key', 'skuSeleccionar');
    btn.innerHTML = `<i class="bx bx-select-multiple" aria-hidden="true"></i><span>${Dashboard.t('main.skuSeleccionar')}</span>`;
    btn.addEventListener('click', () => { if (skuSelectMode) selectFiltered(); else enterSelectMode(); });
    const anchor = toolbar.querySelector('.data-table-template-btn:not(.sku-select-btn)') || toolbar.querySelector('.data-table-new-record-btn');
    if (anchor) anchor.after(btn); else toolbar.prepend(btn);
}
async function bulkDeleteSelected() {
    if (skuDeleting) return;
    const ids = selectedFilteredIds();
    if (!ids.length) return;
    const n = ids.length;
    const ok = await Dashboard.confirm(fillText('main.skuBorrarConfirm', { n }), { items: [Dashboard.t('main.skuBorrarItem1'), Dashboard.t('main.skuBorrarItem2')], accept: fillText('main.skuBorrarAceptar', { n }) });
    if (!ok) return;
    if (n >= SKU_BULK_FINAL_CONFIRM_FROM && !(await Dashboard.confirm(fillText('main.skuBorrarFinal', { n }), { accept: fillText('main.skuBorrarAceptar', { n }) }))) return;
    skuDeleting = true;
    updateSelectBar();
    let done = 0;
    const deleted = new Set();
    let blocked = 0;
    let failed = false;
    try {
        for (let from = 0; from < ids.length; from += SKU_BULK_CHUNK) {
            const chunk = ids.slice(from, from + SKU_BULK_CHUNK);
            const res = await fetch('/api/business/sku-items/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ids: chunk }) });
            if (!res.ok) {
                if (res.status === 403) Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning');
                else Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
                failed = true;
                break;
            }
            const body = await res.json();
            (body.deleted || []).forEach((id) => deleted.add(id));
            blocked += (body.blocked || []).length;
            done += chunk.length;
            removeSkuRecords(new Set(body.deleted || []));
            (body.deleted || []).forEach((id) => skuSelected.delete(id));
            const text = selectBar()?.querySelector('.sku-select-text');
            if (text) text.textContent = fillText('main.skuBorrando', { done, total: n });
            await new Promise((resolve) => setTimeout(resolve, 0)); // deja respirar a la pantalla entre tandas
        }
    } catch (err) {
        console.error('Alta Nuestros Artículos: bulk delete failed', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        failed = true;
    }
    skuDeleting = false;
    if (deleted.size) Dashboard.showToast(fillText('main.skuBorrarHecho', { n: deleted.size }) + (blocked ? ` ${fillText('main.skuBorrarBloqueados', { n: blocked })}` : ''), blocked || failed ? 'warning' : 'success');
    else if (blocked && !failed) Dashboard.showToast(fillText('main.skuBorrarBloqueados', { n: blocked }), 'warning');
    // los que se saltaron (con ubicaciones) dejan de estar marcados
    skuSelected.clear();
    decorateAllRowSelection();
    updateSelectBar();
}

// Varios códigos dejaron de ser de esta pantalla (se eliminaron): salen de la lista y de la tabla de una vez.
function removeSkuRecords(idSet) {
    if (!idSet.size) return;
    skuRecords = skuRecords.filter((r) => !idSet.has(r.id));
    skuView = skuView.filter((r) => !idSet.has(r.id));
    let removedDrawn = 0;
    getTbody().querySelectorAll('tr[data-record-id]').forEach((tr) => { if (idSet.has(Number(tr.dataset.recordId))) { tr.remove(); removedDrawn += 1; } });
    skuDrawn = Math.max(0, Math.min(skuView.length, skuDrawn - removedDrawn));
    if (!getTbody().querySelector('tr[data-record-id]')) {
        if (skuDrawn < skuView.length) drawSkuRows(SKU_FIRST_ROWS); else ensureEmptyState();
    }
    updateSkuMoreBar();
}

// Un código dejó de ser de esta pantalla (quedó completo, se mandó a Edición, o se borró): sale de la lista y de la tabla sin volver a leerla.
function removeSkuRecord(id) {
    skuRecords = skuRecords.filter((r) => r.id !== id);
    const before = skuView.length;
    skuView = skuView.filter((r) => r.id !== id);
    const tr = getTbody().querySelector(`tr[data-record-id="${id}"]`);
    if (tr) { tr.remove(); skuDrawn = Math.max(0, skuDrawn - 1); }
    else if (skuView.length < before) skuDrawn = Math.min(skuDrawn, skuView.length);
    if (!getTbody().querySelector('tr')) {
        if (skuDrawn < skuView.length) drawSkuRows(SKU_FIRST_ROWS); else ensureEmptyState();
    }
    updateSkuMoreBar();
}
// Lo que respondió el servidor al guardar una celda: solo esa fila se vuelve a dibujar (si sigue siendo de esta pantalla).
function applySavedSkuRecord(updated, previous) {
    if (!skuInScope(updated)) { removeSkuRecord(updated.id); return; }
    const merged = { ...updated, pendingFields: (previous && previous.pendingFields) || [] };
    const at = skuRecords.findIndex((r) => r.id === merged.id);
    if (at >= 0) skuRecords[at] = merged;
    const viewAt = skuView.findIndex((r) => r.id === merged.id);
    if (viewAt >= 0) skuView[viewAt] = merged;
    const tr = getTbody().querySelector(`tr[data-record-id="${merged.id}"]`);
    if (tr) tr.replaceWith(buildRow(merged));
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
    btn.addEventListener('click', openCreateModal);
    toolbar.prepend(btn);
    // "Cargar por plantilla" va junto a este botón (si tiene su hoja en el árbol); al terminar la tabla se vuelve a leer.
    if (window.SkuTemplateUi) window.SkuTemplateUi.mount(toolbar, btn, refreshTable);
    mountSelectButton(toolbar); // «Seleccionar»: marcar todo lo filtrado y eliminarlo
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
        if (apiKey === 'categoryInventario') createCategoryGrid.appendChild(buildClassificationPickerField(select));
    });
}

// Clasificación en el formulario: se llena según la Categoría Inventario que se elija arriba y se vuelve a llenar cada vez que esa categoría cambia.
function buildClassificationPickerField(categorySelect) {
    const field = document.createElement('div');
    field.className = 'admin-field';
    const label = document.createElement('label');
    label.setAttribute('for', 'new-sku-classificationId');
    label.textContent = Dashboard.t('main.colArticuloClasificacion');
    const select = document.createElement('select');
    select.id = 'new-sku-classificationId';
    select.name = 'classificationId';
    select.setAttribute('data-help-key', 'colArticuloClasificacion');
    const fill = () => {
        const choices = classificationChoices(categorySelect.value, null, '');
        select.innerHTML = '';
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = !categorySelect.value ? Dashboard.t('main.clasifElegirCategoria') : (choices.length ? Dashboard.t('main.articleTypeSelect') : Dashboard.t('main.clasifSinOpciones'));
        select.appendChild(blank);
        choices.forEach((c) => {
            const opt = document.createElement('option');
            opt.value = String(c.id);
            opt.textContent = c.name;
            select.appendChild(opt);
        });
        select.disabled = !categorySelect.value || !Dashboard.canEditField(TABLE_KEY, 'colArticuloClasificacion', '');
    };
    categorySelect.addEventListener('change', fill);
    fill();
    field.append(label, select);
    return field;
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

// UDM Principal -- same catalog-driven select as the 7 Categorías (sourced
// from categoryOptions.udm), but kept out of CATEGORY_SELECT_FIELDS since it
// lives in the Datos Generales section, not the Categorías Artículo one.
function populateMainUomSelect() {
    const select = createForm.elements.namedItem('mainUom');
    if (!select) return;
    select.innerHTML = '';
    select.disabled = !Dashboard.canEditField(TABLE_KEY, 'colArticuloUdm', '');
    const blankOption = document.createElement('option');
    blankOption.value = '';
    blankOption.textContent = Dashboard.t('main.articleTypeSelect');
    select.appendChild(blankOption);
    (categoryOptions.udm || []).forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
}

async function openCreateModal() {
    createForm.reset();
    createFormError.hidden = true;
    createEvidenceFiles.clear();
    await loadCategoryOptions();
    applyCreateFormFieldPermissions();
    populateMainUomSelect();
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
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.message || 'create failed');
        }
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
        const udmInput = createForm.elements.namedItem('mainUom');
        if (udmInput && !udmInput.disabled) patch.mainUom = udmInput.value;
        CATEGORY_SELECT_FIELDS.forEach(([, apiKey]) => {
            const input = createForm.elements.namedItem(apiKey);
            if (input && !input.disabled) patch[apiKey] = input.value;
        });
        const classificationInput = createForm.elements.namedItem('classificationId');
        if (classificationInput && !classificationInput.disabled && classificationInput.value) patch.classificationId = Number(classificationInput.value);
        // La respuesta de cada guardado dice si el código ya quedó completo (entonces ya no se ve aquí: pasa a Catálogos > Códigos).
        let lastSaved = null;
        const patchNew = async (body) => {
            const patched = await fetch(`/api/business/sku-items/${skuItem.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body),
            });
            if (patched.ok) lastSaved = (await patched.json().catch(() => null))?.skuItem || lastSaved;
        };
        await patchNew(patch);

        for (const [, key] of EVIDENCE_FIELDS) {
            const file = createEvidenceFiles.get(key);
            if (!file) continue;
            try {
                const evidenceKey = await Dashboard.uploadEvidenceFile(file, { tableKey: TABLE_KEY, recordId: skuItem.id, fieldKey: key });
                await patchNew({ [key]: evidenceKey });
            } catch (err) {
                console.error(`Alta Nuestros Artículos: evidence upload failed for ${key}`, err);
            }
        }

        closeCreateModal();
        announceMoved(lastSaved);
        await refreshTable();
    } catch (err) {
        console.error('Alta Nuestros Artículos: failed to save new record', err);
        createFormError.textContent = err.message === 'create failed' ? Dashboard.t('admin.saveError') : err.message;
        createFormError.hidden = false;
    } finally {
        saveBtn.disabled = false;
    }
});
