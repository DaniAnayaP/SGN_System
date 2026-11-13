// ---------------------------------------------------------------------------
// Alta Activos — Operaciones > Cadena de Suministro > C. Distribución.
// El registro de TODO lo que está dentro de un sitio (centro de costos) y se tiene para usar: racks, mobiliario, sensores, teléfonos, impresoras, escritorios, sillas…
// (los artículos de Alta Artículos son lo que se distribuye; los activos son lo que se usa). Un renglón = un activo.
//   - El código es automático: la letra de su Tipo de activo (catálogo Activos Fijos) + un consecutivo por centro de costos (R001, A001, L001…). El tipo se elige al dar de alta y ya no se cambia.
//   - Nombre de compra (obligatorio) y nombre personalizado (opcional), modelo, S/N, forma (rectangular, cilíndrica o irregular), alto, largo, profundidad (cm), peso (kg), volumen (m³, calculado con
//     la forma; en la irregular se escribe) y las fotos de las 6 caras.
//   - «Aparece en el Layout» (Sí/No): el paso Activos del Layout solo coloca los que dicen Sí.
//   - Los activos NUNCA se eliminan: se desactivan (y se vuelven a activar). Persistido en /api/business/fixed-assets.
// «+ Nuevo Activo» abre un formulario con lo principal; nada llega al servidor hasta «Guardar». Ya creado, cada celda se edita con un clic, como en las demás tablas.
// ---------------------------------------------------------------------------
const TABLE_KEY = 'alta-activos';
const ACTIVE_PAGE = 'cat-operaciones-centro-dist-alta-activos';
const COLUMN_COUNT = 38;
const SHAPES = ['rectangular', 'cilindrica', 'irregular'];

let assets = []; // todo lo que mandó el servidor
let assetTypes = [];
let assetClasses = [];
let assetModels = []; // los modelos del catálogo Activos Fijos (cada activo elige uno del tipo que tiene)
let costCenters = [];
let canCreate = false;
let canDelete = false;
let drawToken = 0;
let loadToken = 0;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: ACTIVE_PAGE });
        if (!role) return;
        await refreshTable();
        renderNewRecordButton();
        // las columnas con desplegable llevan un ancho mínimo para que se lea la opción completa («Rectangular», «Activo para almacenar») y se vea la flecha
        if (Dashboard.ensureColumnMinWidth) [['colActElegirModelo', 300], ['colActForma', 150], ['colActClasificacion', 230], ['colActEnLayout', 130], ['colActCodigo', 100]].forEach(([col, px]) => Dashboard.ensureColumnMinWidth(TABLE_KEY, col, px));
    } catch (err) {
        console.error('Alta Activos failed to initialize:', err);
    }
})();

const fillText = (key, params) => Object.entries(params || {}).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), Dashboard.t(key));
const isPending = (record, key) => (record.pendingFields || []).includes(key);
const getTbody = () => document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0];

// --- Celdas ----------------------------------------------------------------------------------------------------------------------------------------------------
function textCell(key, value, helpKey) {
    const td = document.createElement('td');
    td.dataset.col = key;
    td.textContent = value === 0 || value ? String(value) : '—';
    if (helpKey) td.setAttribute('data-help-key', helpKey);
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
const buildSystemCells = (record) => SYSTEM_COLUMN_KEYS.map((key) => textCellSystem(key, record[key]));

function inlineCell(record, colId, key, { inputType = 'text', unit = '', step, formatDisplay, helpKey, toValue }) {
    const td = document.createElement('td');
    td.dataset.col = colId;
    if (helpKey) td.setAttribute('data-help-key', helpKey);
    Dashboard.attachInlineEdit(td, {
        value: record[key] === 0 || record[key] ? String(record[key]) : '',
        inputType, unit, step, formatDisplay,
        tableKey: TABLE_KEY, colKey: colId, pending: isPending(record, key),
        onCommit: (val) => patchAsset(record, { [key]: toValue ? toValue(val) : val.trim() }),
    });
    return td;
}
function selectCell(record, colId, key, { items, current, currentLabel, helpKey, blankKey, toPatch }) {
    const td = document.createElement('td');
    td.dataset.col = colId;
    const select = document.createElement('select');
    select.className = 'editable-cell-select asset-select'; // desplegable con el mismo aspecto que el resto de la pantalla (ver .asset-select en Admin.css)
    if (helpKey) select.setAttribute('data-help-key', helpKey);
    const list = items.slice();
    if (current !== null && current !== undefined && current !== '' && !list.some((i) => String(i.value) === String(current))) list.unshift({ value: current, label: currentLabel || String(current) });
    if (blankKey) {
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = Dashboard.t(blankKey);
        select.appendChild(blank);
    }
    list.forEach((i) => {
        const opt = document.createElement('option');
        opt.value = String(i.value);
        opt.textContent = i.label;
        select.appendChild(opt);
    });
    select.value = current === null || current === undefined ? '' : String(current);
    select.disabled = isPending(record, key) || !Dashboard.canEditField(TABLE_KEY, colId, currentLabel || (current === null || current === undefined ? '' : String(current)));
    if (select.disabled) select.title = Dashboard.t(isPending(record, key) ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => {
        const patch = toPatch(select.value);
        if (patch) patchAsset(record, patch);
        else select.value = current === null || current === undefined ? '' : String(current);
    });
    td.appendChild(select);
    return td;
}
// Un dato que viene del modelo del activo: se lee, no se escribe aquí.
function boundCell(colId, value, { unit = '', helpKey } = {}) {
    const td = textCell(colId, '', helpKey);
    const has = !(value === '' || value === null || value === undefined || value === 0);
    if (has) {
        td.textContent = '';
        const span = document.createElement('span');
        span.className = 'editable-cell-value';
        if (unit) span.dataset.unit = unit;
        span.textContent = String(value);
        td.appendChild(span);
    } else td.textContent = '—';
    td.classList.add('editable-cell-disabled');
    td.title = Dashboard.t('main.assetFromModel');
    return td;
}
// El número de serie se escribe aquí; si el tipo del activo no lleva número de serie (sillas, mesas) no aplica.
function serialCell(record) {
    if (record.typeNeedsSerial === false) {
        const td = textCell('colActSerie', Dashboard.t('main.assetNoSerial'), 'assetSerial');
        td.classList.add('editable-cell-disabled');
        td.title = Dashboard.t('main.assetNoSerialTip');
        return td;
    }
    return inlineCell(record, 'colActSerie', 'serialNumber', { helpKey: 'assetSerial' });
}
// El modelo: se elige de los modelos activos y completos del tipo del activo (y se conserva el que ya tiene aunque ya no se ofrezca). Sin modelo, el activo es de antes: conserva lo que tenía hasta que se elija.
function modelPickerCell(record) {
    const items = assetModels.filter((m) => m.typeId === record.typeId && m.active && m.complete).map((m) => ({ value: m.id, label: m.label }));
    const td = selectCell(record, 'colActElegirModelo', 'modelId', {
        items, current: record.modelId, currentLabel: record.modelLabel, helpKey: 'assetModelPicker',
        blankKey: items.length || record.modelId ? 'main.assetModelChoose' : 'main.assetModelNoModels',
        toPatch: (v) => (v === '' ? null : { modelId: Number(v) }),
    });
    td.classList.toggle('asset-model-missing', !record.modelId);
    return td;
}

// --- Fotos de las 6 caras (el mismo control de Alta Artículos; las fotos van directo al almacenamiento y el renglón guarda la llave corta) ------------------
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
const closeEvidencePreview = () => { evidencePreviewModal.hidden = true; document.getElementById('evidence-preview-img').src = ''; };
document.getElementById('evidence-preview-close').addEventListener('click', closeEvidencePreview);
evidencePreviewModal.addEventListener('click', (event) => { if (event.target === evidencePreviewModal) closeEvidencePreview(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !evidencePreviewModal.hidden) closeEvidencePreview(); });
function openEvidencePreview(url) {
    document.getElementById('evidence-preview-img').src = url;
    evidencePreviewModal.hidden = false;
}
function attachEvidenceControl(td, { value, pending, labelKey, recordId, fieldKey, onCommit }) {
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
        const icon = busy ? 'bx-loader-alt bx-spin' : (pending ? 'bx-time-five' : (stored ? 'bxs-check-circle' : 'bx-camera'));
        btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
        btn.classList.toggle('evidence-done', !busy && !pending && !!stored); // cargada = verde intenso
        btn.classList.toggle('evidence-empty', !busy && !pending && !stored); // sin cargar = rojo
        const label = pending ? 'main.changePending' : labelKey;
        btn.setAttribute('aria-label', Dashboard.t(label));
        btn.title = Dashboard.t(label);
        btn.setAttribute('data-help-key', 'assetPhotos');
        td.dataset.dtEmpty = stored ? '' : '1';
    }
    btn.addEventListener('click', async () => {
        if (pending || busy) return;
        if (stored) {
            try {
                const url = stored.startsWith('data:') ? stored : await Dashboard.getEvidenceDownloadUrl({ tableKey: TABLE_KEY, recordId, fieldKey });
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
            const key = await Dashboard.uploadEvidenceFile(file, { tableKey: TABLE_KEY, recordId, fieldKey });
            stored = key;
            const saved = await onCommit(key); // el renglón se guarda con la llave de la foto; solo si quedó guardado se avisa que cargó
            if (saved === true) Dashboard.showToast(Dashboard.t('main.evidenceUploaded'), 'success');
        } catch (err) {
            console.error('evidence upload failed', err);
            // el aviso dice en qué paso falló: sin permiso, el almacenamiento no recibió el archivo, el almacenamiento no está disponible, o (otro caso) un error al guardar
            const textKey = err.status === 403 ? 'main.fieldLocked' : (err.step === 'put' || err.step === 'server' ? 'main.assetPhotoPutError' : (err.status === 503 ? 'main.assetPhotoStorageError' : 'admin.saveError'));
            // si el almacenamiento (R2) rechazó al servidor, se agrega el código que dio R2 (AccessDenied, NoSuchBucket…): dice qué corregir
            Dashboard.showToast(`${Dashboard.t(textKey)}${err.r2Error ? ` (${err.r2Error})` : ''}`, err.status === 403 ? 'warning' : 'error');
        } finally {
            busy = false;
            render();
        }
    });
    render();
    td.append(btn, fileInput);
}
function evidenceCell(record, fieldKey, colId) {
    const td = document.createElement('td');
    td.dataset.col = colId;
    attachEvidenceControl(td, { value: record[fieldKey] || null, pending: isPending(record, fieldKey), labelKey: `main.${colId}`, recordId: record.id, fieldKey, onCommit: (val) => patchAsset(record, { [fieldKey]: val }) });
    return td;
}

// --- Acciones: historial y desactivar / activar -----------------------------------------------------------------------------------------------------------
function buildActionsCell(record) {
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
    // Los activos NUNCA se eliminan: se desactivan (y se vuelven a activar). Pide la hoja «Autorización para Desactivar».
    if (Dashboard.hasColumnDeleteGrant(TABLE_KEY, 'colActDeleteAuth')) {
        const inactive = record.status === 'inactive';
        const statusBtn = document.createElement('button');
        statusBtn.type = 'button';
        statusBtn.className = inactive ? 'admin-icon-btn' : 'admin-icon-btn admin-icon-btn-danger';
        statusBtn.setAttribute('data-help-key', inactive ? 'assetActivate' : 'assetDeactivate');
        const label = Dashboard.t(inactive ? 'main.assetActivarBtn' : 'main.assetDesactivarBtn');
        statusBtn.setAttribute('aria-label', label);
        statusBtn.title = label;
        statusBtn.innerHTML = `<i class="bx ${inactive ? 'bx-play-circle' : 'bx-power-off'}" aria-hidden="true"></i>`;
        statusBtn.addEventListener('click', () => changeStatus(record, inactive ? 'active' : 'inactive'));
        td.appendChild(statusBtn);
    }
    return td;
}
async function changeStatus(record, status) {
    if (status === 'inactive' && !(await Dashboard.confirm(fillText('main.assetDesactivarConfirm', { code: record.code }), { items: [Dashboard.t('main.assetDesactivarItem1'), Dashboard.t('main.assetDesactivarItem2')], accept: Dashboard.t('main.assetDesactivarAceptar') }))) return;
    try {
        const res = await fetch(`/api/business/fixed-assets/${record.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status }) });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(res.status === 403 ? Dashboard.t('main.fieldLocked') : (body.message || Dashboard.t('admin.saveError')), res.status === 403 ? 'warning' : 'error');
            return;
        }
        const body = await res.json();
        applySaved(body.asset, record);
        Dashboard.showToast(fillText(status === 'inactive' ? 'main.assetDesactivado' : 'main.assetActivado', { code: record.code }), 'success');
    } catch (err) {
        console.error('Alta Activos: failed to change the status', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// --- Guardar un cambio de celda ----------------------------------------------------------------------------------------------------------------------------
async function patchAsset(record, patch) {
    try {
        const res = await fetch(`/api/business/fixed-assets/${record.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(patch) });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), res.status === 403 ? 'warning' : 'error');
            await refreshTable();
            return;
        }
        const body = await res.json().catch(() => ({}));
        if (body.rejectedFields?.length) Dashboard.showToast(`${Dashboard.t('main.fieldLocked')}: ${body.rejectedFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'warning');
        else if (body.pendingFields?.length) Dashboard.showToast(`${Dashboard.t('main.changePending')}: ${body.pendingFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'info');
        const clean = body.asset && !body.rejectedFields?.length && !body.pendingFields?.length && !body.conflictFields?.length;
        if (clean) applySaved(body.asset, record);
        else await refreshTable();
        return !!clean; // true = se guardó tal cual (las fotos lo usan para avisar «cargada correctamente»)
    } catch (err) {
        console.error('Alta Activos: failed to save change', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        await refreshTable();
    }
}
// Lo que respondió el servidor al guardar: solo esa fila se vuelve a dibujar.
function applySaved(updated, previous) {
    const merged = { ...updated, placement: updated.placement !== undefined ? updated.placement : ((previous && previous.placement) || ''), pendingFields: (previous && previous.pendingFields) || [] };
    const at = assets.findIndex((r) => r.id === merged.id);
    if (at >= 0) assets[at] = merged;
    const tr = getTbody().querySelector(`tr[data-record-id="${merged.id}"]`);
    if (tr) tr.replaceWith(buildRow(merged));
}

// --- La fila ------------------------------------------------------------------------------------------------------------------------------------------------------------
function buildRow(record) {
    const classItems = assetClasses.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }));
    const statusTd = textCell('colActEstatus', Dashboard.t(record.status === 'inactive' ? 'main.skuStatusInactive' : 'main.skuStatusActive'));
    statusTd.classList.toggle('sku-status-inactive', record.status === 'inactive');
    const codeTd = textCell('colActCodigo', record.code, 'assetCode');
    codeTd.style.fontWeight = '600';
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(record.id);
    if (record.status === 'inactive') tr.classList.add('sku-row-inactive');
    tr.append(
        ...buildSystemCells(record),
        textCellSystem('colActRegistroUnico', record.registroUnico),
        codeTd,
        statusTd,
        textCell('colActTipo', record.typeName, 'assetType'),
        selectCell(record, 'colActClasificacion', 'classId', {
            items: classItems, current: record.classId, currentLabel: record.className, helpKey: 'assetClass', blankKey: 'main.articleTypeSelect',
            toPatch: (v) => ({ classId: v === '' ? null : Number(v) }),
        }),
        modelPickerCell(record),
        // El nombre de compra, el personalizado, el modelo, la forma, las medidas y el peso vienen del MODELO elegido (Catálogos > Activos Fijos): aquí solo se leen; lo que se escribe es el número de serie.
        boundCell('colActNombreCompra', record.purchaseName, { helpKey: 'assetPurchaseName' }),
        boundCell('colActNombrePersonalizado', record.customName, { helpKey: 'assetCustomName' }),
        boundCell('colActModelo', record.model, { helpKey: 'assetModel' }),
        serialCell(record),
        boundCell('colActForma', record.shape ? Dashboard.t(`main.assetShape_${record.shape}`) : '', { helpKey: 'assetShape' }),
        boundCell('colActAlto', record.height, { unit: 'cm', helpKey: 'assetSize' }),
        boundCell('colActLargo', record.length, { unit: 'cm', helpKey: 'assetSize' }),
        boundCell('colActProfundidad', record.depth, { unit: 'cm', helpKey: 'assetSize' }),
        boundCell('colActPeso', record.weight, { unit: 'kg', helpKey: 'assetWeight' }),
        boundCell('colActVolumen', record.volume > 0 ? Number(record.volume).toFixed(3) : '', { unit: 'm³', helpKey: 'assetVolume' }),
        evidenceCell(record, 'evidenceFront', 'colActFotoFrente'),
        evidenceCell(record, 'evidenceBack', 'colActFotoAtras'),
        evidenceCell(record, 'evidenceLeft', 'colActFotoIzq'),
        evidenceCell(record, 'evidenceRight', 'colActFotoDer'),
        evidenceCell(record, 'evidenceTop', 'colActFotoArriba'),
        evidenceCell(record, 'evidenceBottom', 'colActFotoAbajo'),
        selectCell(record, 'colActEnLayout', 'showInLayout', {
            items: [{ value: '0', label: Dashboard.t('main.assetNo') }, { value: '1', label: Dashboard.t('main.assetYes') }], current: record.showInLayout ? '1' : '0', currentLabel: record.showInLayout ? Dashboard.t('main.assetYes') : '',
            helpKey: 'assetInLayout', toPatch: (v) => ({ showInLayout: v === '1' }),
        }),
        textCell('colActDondeEsta', record.placement, 'assetWhere'), // dónde está dibujado en el Layout (zona › huella); se llena solo, desde el Layout
        buildActionsCell(record),
    );
    tr.classList.toggle('data-table-row-editable', !!tr.querySelector('td.editable-cell'));
    return tr;
}

function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = COLUMN_COUNT;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = Dashboard.t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}

// --- Qué se ve: los activos de los centros de costos elegidos arriba + la búsqueda de texto -------------------------------------------------------
const searchText = () => (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
function visibleAssets() {
    const selected = Dashboard.getSelectedCostCenterIds();
    const text = searchText();
    return assets.filter((a) => {
        if (selected && !selected.includes(a.costCenterId)) return false;
        if (!text) return true;
        const haystack = [a.code, a.purchaseName, a.customName, a.model, a.modelLabel, a.serialNumber, a.typeName, a.className].map((v) => String(v || '')).join(' ').toLowerCase();
        return SearchSyntax.matches('contains', text, haystack);
    });
}
async function drawRows() {
    const token = ++drawToken;
    const tbody = getTbody();
    tbody.innerHTML = '';
    const records = visibleAssets();
    if (!records.length) { ensureEmptyState(); return; }
    const finished = await Dashboard.renderTableRowsInChunks({ tableKey: TABLE_KEY, tbody, records, buildRow, isStale: () => token !== drawToken });
    if (finished && token === drawToken && Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY);
}
async function refreshTable() {
    const tbody = getTbody();
    if (tbody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const token = ++loadToken;
    try {
        const res = await fetch('/api/business/fixed-assets', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (token !== loadToken) return; // llegó otra recarga después de esta
        assets = data.assets || [];
        assetTypes = data.types || [];
        assetClasses = data.classes || [];
        assetModels = data.models || [];
        costCenters = data.costCenters || [];
        canCreate = !!data.canCreate;
        canDelete = !!data.canDelete;
        await drawRows();
    } catch (err) {
        console.error('Alta Activos: failed to load records', err);
    }
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', drawRows);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', drawRows);
document.addEventListener('sgn:cost-centers-changed', drawRows);

// --- «+ Nuevo Activo» --------------------------------------------------------------------------------------------------------------------------------------------
function renderNewRecordButton() {
    const wrapper = document.querySelector(`[data-table-id="${TABLE_KEY}"]`);
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (!canCreate || toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.setAttribute('data-help-key', 'assetNew');
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.newAsset">${Dashboard.t('main.newAsset')}</span>`;
    btn.addEventListener('click', openCreateModal);
    toolbar.prepend(btn);
}

const createModal = document.getElementById('new-asset-modal');
const createForm = document.getElementById('new-asset-form');
const createFormError = document.getElementById('new-asset-form-error');
const createEvidenceGrid = document.getElementById('new-asset-evidence-grid');
const createEvidenceFiles = new Map(); // fieldKey -> File, se vacía al abrir y al cerrar
const EVIDENCE_FIELDS = [
    ['colActFotoFrente', 'evidenceFront'], ['colActFotoAtras', 'evidenceBack'], ['colActFotoIzq', 'evidenceLeft'],
    ['colActFotoDer', 'evidenceRight'], ['colActFotoArriba', 'evidenceTop'], ['colActFotoAbajo', 'evidenceBottom'],
];
// [columna del árbol, nombre del campo en el formulario, clave en la API] — lo que se elige o se escribe al dar de alta
const FORM_FIELDS = [
    ['colActClasificacion', 'classId', 'classId'], ['colActElegirModelo', 'modelId', 'modelId'], ['colActSerie', 'serialNumber', 'serialNumber'], ['colActEnLayout', 'showInLayout', 'showInLayout'],
];
// Lo que viene del modelo (solo se lee en el formulario; se llena al elegir el modelo)
const MODEL_FORM_FIELDS = ['purchaseName', 'customName', 'model', 'shape', 'height', 'length', 'depth', 'weight', 'volume'];
const formEl = (name) => createForm.elements.namedItem(name);
let layoutTouched = false; // si quien da de alta ya cambió «Aparece en el Layout», ya no se propone según el tipo

function fillSelect(select, items, { blankKey, blankValue = '' } = {}) {
    select.innerHTML = '';
    if (blankKey) {
        const blank = document.createElement('option');
        blank.value = blankValue;
        blank.textContent = Dashboard.t(blankKey);
        select.appendChild(blank);
    }
    items.forEach((i) => {
        const opt = document.createElement('option');
        opt.value = String(i.value);
        opt.textContent = i.label;
        if (i.disabled) opt.disabled = true;
        select.appendChild(opt);
    });
}
// Los modelos que se ofrecen para el tipo elegido (activos y completos) y lo que cambia al elegir tipo o modelo.
function chosenType() { return assetTypes.find((t) => String(t.id) === formEl('typeId').value) || null; }
function chosenModel() { const id = Number(formEl('modelId').value) || 0; return assetModels.find((m) => m.id === id) || null; }
function fillModelChoices() {
    const type = chosenType();
    const items = type ? assetModels.filter((m) => m.typeId === type.id && m.active && m.complete).map((m) => ({ value: m.id, label: m.label })) : [];
    fillSelect(formEl('modelId'), items, { blankKey: !type ? 'main.assetPickTypeFirst' : (items.length ? 'main.assetModelChoose' : 'main.assetModelNoModels') });
}
// Al elegir el modelo se llenan, y quedan cerrados, el nombre de compra, el personalizado, el modelo, la forma, las medidas y el peso; el volumen se muestra calculado.
function fillFromModel() {
    const m = chosenModel();
    const set = (name, value) => { formEl(name).value = value === 0 || value ? String(value) : ''; };
    set('purchaseName', m && m.purchaseName); set('customName', m && m.customName); set('model', m && m.model);
    formEl('shape').value = m ? m.shape : 'rectangular';
    ['height', 'length', 'depth', 'weight'].forEach((key) => set(key, m && m[key] > 0 ? m[key] : ''));
    set('volume', m && m.volume > 0 ? m.volume : '');
    formEl('volume').closest('.admin-field').hidden = !m;
}
// Un tipo que no lleva número de serie (sillas, mesas) no lo pide.
function syncSerialField() {
    const type = chosenType();
    formEl('serialNumber').closest('.admin-field').hidden = !!(type && type.needsSerial === false);
}
function syncTypeDependents() {
    fillModelChoices();
    fillFromModel();
    syncSerialField();
    syncLayoutFromType();
}
function syncLayoutFromType() {
    if (layoutTouched) return;
    const type = assetTypes.find((t) => String(t.id) === formEl('typeId').value);
    formEl('showInLayout').value = type && type.kind ? '1' : '0';
}
function applyCreatePermissions() {
    FORM_FIELDS.forEach(([colId, name]) => { const el = formEl(name); if (el) el.disabled = !Dashboard.canEditField(TABLE_KEY, colId, ''); });
    MODEL_FORM_FIELDS.forEach((name) => { formEl(name).disabled = true; }); // vienen del modelo
    formEl('typeId').disabled = !Dashboard.canEditField(TABLE_KEY, 'colActTipo', '');
}
function buildEvidencePickerFields() {
    createEvidenceGrid.innerHTML = '';
    EVIDENCE_FIELDS.forEach(([colId, key]) => {
        const field = document.createElement('div');
        field.className = 'admin-field';
        const editable = Dashboard.canEditField(TABLE_KEY, colId, '');
        field.innerHTML = `
            <label>${Dashboard.t(`main.${colId}`)}</label>
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
async function openCreateModal() {
    await refreshTable();
    createForm.reset();
    createFormError.hidden = true;
    createEvidenceFiles.clear();
    layoutTouched = false;
    const single = Dashboard.getSingleSelectedCostCenterId ? Dashboard.getSingleSelectedCostCenterId() : null;
    const selected = Dashboard.getSelectedCostCenterIds();
    fillSelect(formEl('costCenterId'), costCenters.map((c) => ({ value: c.id, label: c.code ? `${c.code} · ${c.name}` : c.name })), { blankKey: 'main.assetCostCenter' });
    formEl('costCenterId').value = String(single || (selected && selected[0]) || (costCenters.length === 1 ? costCenters[0].id : ''));
    fillSelect(formEl('typeId'), assetTypes.filter((t) => t.active).map((t) => ({ value: t.id, label: t.letter ? `${t.letter} · ${t.name}` : `${t.name} ${Dashboard.t('main.assetNoLetter')}`, disabled: !t.letter })), { blankKey: 'main.assetPickType' });
    fillSelect(formEl('classId'), assetClasses.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name })), { blankKey: 'main.articleTypeSelect' });
    fillSelect(formEl('shape'), SHAPES.map((s) => ({ value: s, label: Dashboard.t(`main.assetShape_${s}`) })));
    formEl('showInLayout').value = '0';
    syncTypeDependents();
    applyCreatePermissions();
    buildEvidencePickerFields();
    createModal.hidden = false;
}
const closeCreateModal = () => { createModal.hidden = true; };
document.getElementById('new-asset-cancel')?.addEventListener('click', closeCreateModal);
createModal?.addEventListener('click', (event) => { if (event.target === createModal) closeCreateModal(); });
formEl('typeId')?.addEventListener('change', syncTypeDependents);
formEl('modelId')?.addEventListener('change', fillFromModel);
formEl('showInLayout')?.addEventListener('change', () => { layoutTouched = true; });

createForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    createFormError.hidden = true;
    const saveBtn = document.getElementById('new-asset-save');
    saveBtn.disabled = true;
    try {
        const body = { costCenterId: Number(formEl('costCenterId').value) || 0, typeId: Number(formEl('typeId').value) || 0 };
        if (!body.costCenterId) throw new Error(Dashboard.t('main.assetElegirCentro'));
        FORM_FIELDS.forEach(([, name, key]) => {
            const el = formEl(name);
            if (!el || el.disabled || el.closest('.admin-field').hidden) return;
            const value = el.value.trim();
            if (key === 'classId' || key === 'modelId') { if (value) body[key] = Number(value); return; }
            if (key === 'showInLayout') { body.showInLayout = value === '1'; return; }
            body[key] = value;
        });
        // el nombre, la forma, las medidas y el peso los pone el servidor con el modelo elegido
        if (!body.modelId) throw new Error(Dashboard.t('main.assetModelRequired'));
        const res = await fetch('/api/business/fixed-assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.message || Dashboard.t('admin.saveError'));
        }
        const { asset } = await res.json();
        const failedPhotos = []; // las fotos que no se pudieron subir (el activo ya quedó guardado): se avisan al final, no se quedan calladas
        let uploadedPhotos = 0;
        for (const [labelKey, key] of EVIDENCE_FIELDS) {
            const file = createEvidenceFiles.get(key);
            if (!file) continue;
            try {
                const evidenceKey = await Dashboard.uploadEvidenceFile(file, { tableKey: TABLE_KEY, recordId: asset.id, fieldKey: key });
                const patched = await fetch(`/api/business/fixed-assets/${asset.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ [key]: evidenceKey }) });
                if (!patched.ok) throw new Error(`PATCH ${patched.status}`);
                uploadedPhotos += 1;
            } catch (err) {
                console.error(`Alta Activos: evidence upload failed for ${key}`, err);
                failedPhotos.push(Dashboard.t(`main.${labelKey}`));
            }
        }
        closeCreateModal();
        await refreshTable();
        if (failedPhotos.length) Dashboard.showToast(Dashboard.t('main.assetPhotosFailed').replace('{list}', failedPhotos.join(', ')), 'error');
        else if (uploadedPhotos) Dashboard.showToast(Dashboard.t(uploadedPhotos === 1 ? 'main.evidenceUploaded' : 'main.evidencesUploaded'), 'success');
    } catch (err) {
        console.error('Alta Activos: failed to save new record', err);
        createFormError.textContent = err.message;
        createFormError.hidden = false;
    } finally {
        saveBtn.disabled = false;
    }
});
