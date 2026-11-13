// ---------------------------------------------------------------------------
// Calibraciones — Operaciones > Cadena de Suministro > C. Distribución.
// Un renglón por CERTIFICADO de calibración de un activo (el Tipo del activo decide con «Lleva calibración» cuáles la llevan: los sensores). Los certificados anteriores de un activo no se pierden: quedan como historial y el MÁS
// RECIENTE (por fecha de calibración) es el que vale. De cada certificado se guarda: activo, número, laboratorio, fecha de calibración, vencimiento, resultado, observaciones y el archivo (foto o PDF, máx. 3 MB).
//   - El vencimiento se propone con la «Vigencia de calibración» (meses) del modelo del activo y se puede corregir si el certificado dice otra fecha.
//   - Estados: Vigente, Por vencer (30 días o menos), Vencida, Fuera de tolerancia (el resultado del certificado) y Sin calibración. Un activo sin calibración vigente NO se bloquea: se marca en Gestión > Activos y en su QR.
//   - Avisos en la campana 30 días antes y el día que vence: a quien registró, a su jefe directo y a quien tenga «Notificar» en la columna Vence.
// «+ Nueva calibración» abre una ventana; nada llega al servidor hasta «Guardar calibración». Ya creado, cada celda se edita con un clic (con la autorización de siempre cuando ya traía un dato). Persistido en /api/business/calibrations.
// ---------------------------------------------------------------------------
const TABLE_KEY = 'calibraciones';
const ACTIVE_PAGE = 'cat-operaciones-centro-dist-calibraciones';
const COLUMN_COUNT = 25;
const MAX_FILE_BYTES = 3 * 1024 * 1024;

let calibrations = []; // todo lo que mandó el servidor
let pickAssets = []; // los activos que llevan calibración (para elegir en la ventana)
let laboratories = [];
let costCenters = [];
let resultOptions = ['ok', 'adjusted', 'out'];
let canCreate = false;
let canReplaceFile = false;
let assetFilterId = 0; // un solo activo: sus certificados (el actual y su historial)
let drawToken = 0;
let loadToken = 0;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: ACTIVE_PAGE });
        if (!role) return;
        await refreshTable();
        renderNewRecordButton();
        if (Dashboard.ensureColumnMinWidth) [['colCalActivo', 150], ['colCalModelo', 190], ['colCalEstado', 190], ['colCalResultado', 190], ['colCalLaboratorio', 170]].forEach(([col, px]) => Dashboard.ensureColumnMinWidth(TABLE_KEY, col, px));
    } catch (err) {
        console.error('Calibraciones failed to initialize:', err);
    }
})();

const fillText = (key, params) => Object.entries(params || {}).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), Dashboard.t(key));
const isPending = (record, key) => (record.pendingFields || []).includes(key);
const getTbody = () => document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0];
const resultLabel = (r) => Dashboard.t(`main.calResult_${r}`);

// --- Celdas ----------------------------------------------------------------------------------------------------------------------------------------------------
function textCell(key, value, helpKey) {
    const td = document.createElement('td');
    td.dataset.col = key;
    td.textContent = value === 0 || value ? String(value) : '—';
    if (helpKey) td.setAttribute('data-help-key', helpKey);
    return td;
}
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const buildSystemCells = (record) => SYSTEM_COLUMN_KEYS.map((key) => { const td = textCell(key, record[key]); td.classList.add('col-system'); return td; });

function inlineCell(record, colId, key, { inputType = 'text', formatDisplay, helpKey } = {}) {
    const td = document.createElement('td');
    td.dataset.col = colId;
    if (helpKey) td.setAttribute('data-help-key', helpKey);
    Dashboard.attachInlineEdit(td, {
        value: record[key] === 0 || record[key] ? String(record[key]) : '',
        inputType, formatDisplay,
        tableKey: TABLE_KEY, colKey: colId, pending: isPending(record, key),
        onCommit: (val) => patchCalibration(record, { [key]: val.trim() }),
    });
    return td;
}
function resultCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colCalResultado';
    td.setAttribute('data-help-key', 'calResult');
    const select = document.createElement('select');
    select.className = 'editable-cell-select asset-select';
    resultOptions.forEach((r) => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = resultLabel(r);
        select.appendChild(opt);
    });
    select.value = record.result;
    select.disabled = isPending(record, 'result') || !Dashboard.canEditField(TABLE_KEY, 'colCalResultado', resultLabel(record.result));
    if (select.disabled) select.title = Dashboard.t(isPending(record, 'result') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => patchCalibration(record, { result: select.value }));
    td.appendChild(select);
    return td;
}
// El activo: su código y su número de serie; si tiene más de un certificado, un vínculo que deja ver solo los de ese activo.
function assetCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colCalActivo';
    td.setAttribute('data-help-key', 'calAsset');
    const code = document.createElement('b');
    code.textContent = record.assetCode || '—';
    td.title = [record.assetName, record.typeName].filter(Boolean).join(' · ');
    td.appendChild(code);
    if (record.assetSerial) {
        const serial = document.createElement('small');
        serial.className = 'cal-serial';
        serial.textContent = `S/N ${record.assetSerial}`;
        td.append(document.createElement('br'), serial);
    }
    if (record.certificates > 1) {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'cal-assets-link';
        link.textContent = fillText('main.calCertificatesOf', { n: record.certificates });
        link.addEventListener('click', () => { assetFilterId = record.assetId; updateFilterNote(); drawRows(); });
        td.append(document.createElement('br'), link);
    }
    return td;
}
function statusCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colCalEstado';
    td.setAttribute('data-help-key', 'calStatus');
    td.appendChild(AssetCalibration.chip({ id: record.id, dueOn: record.dueOn, result: record.result }, { mode: 'days', st: { key: record.status, daysLeft: record.daysLeft } }));
    return td;
}
// El archivo del certificado: abre el PDF o la foto en otra pestaña; sin archivo, quien registra lo sube (y con «Modificar» en la columna se cambia).
function fileCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colCalArchivo';
    td.setAttribute('data-help-key', 'calFile');
    td.dataset.dtEmpty = record.hasFile ? '' : '1';
    const mk = (icon, label, onClick, extraClass = '') => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `admin-icon-btn ${extraClass}`.trim();
        btn.setAttribute('aria-label', label);
        btn.title = label;
        btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
        btn.addEventListener('click', onClick);
        return btn;
    };
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/jpeg,image/png';
    input.hidden = true;
    input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        if (await uploadFile(record, file)) await refreshTable();
    });
    if (record.hasFile) {
        td.appendChild(mk(record.fileMime === 'application/pdf' ? 'bxs-file-pdf' : 'bx-image', record.fileName || Dashboard.t('main.calViewFile'), () => window.open(`/api/business/calibrations/${record.id}/file`, '_blank', 'noopener'), 'evidence-done'));
        if (canReplaceFile) td.appendChild(mk('bx-refresh', Dashboard.t('main.calReplaceFile'), () => input.click()));
    } else if (canCreate) {
        td.appendChild(mk('bx-upload', Dashboard.t('main.calUploadFile'), () => input.click(), 'evidence-empty'));
    } else td.textContent = '—';
    td.appendChild(input);
    return td;
}
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
    return td;
}

// --- La fila ------------------------------------------------------------------------------------------------------------------------------------------------------------
const dayDisplay = (iso) => (window.AssetCalibration ? AssetCalibration.dateText(iso) || iso : iso);
function buildRow(record) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(record.id);
    if (!record.current) tr.classList.add('cal-row-history');
    const registro = textCell('colCalRegistroUnico', record.registroUnico);
    registro.classList.add('col-system');
    tr.append(
        ...buildSystemCells(record),
        registro,
        assetCell(record),
        textCell('colCalModelo', record.assetModel, 'calModel'),
        inlineCell(record, 'colCalCertificado', 'certificateNumber', { helpKey: 'calCertificate' }),
        inlineCell(record, 'colCalCalibrado', 'calibratedOn', { inputType: 'date', formatDisplay: dayDisplay, helpKey: 'calCalibratedOn' }),
        inlineCell(record, 'colCalVence', 'dueOn', { inputType: 'date', formatDisplay: dayDisplay, helpKey: 'calDue' }),
        statusCell(record),
        inlineCell(record, 'colCalLaboratorio', 'laboratory', { helpKey: 'calLaboratory' }),
        resultCell(record),
        inlineCell(record, 'colCalObservaciones', 'notes', { helpKey: 'calNotes' }),
        fileCell(record),
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

// --- Guardar un cambio de celda ----------------------------------------------------------------------------------------------------------------------------
async function patchCalibration(record, patch) {
    try {
        const res = await fetch(`/api/business/calibrations/${record.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(patch) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), res.status === 403 ? 'warning' : 'error');
            await refreshTable();
            return false;
        }
        if (body.rejectedFields?.length) Dashboard.showToast(`${Dashboard.t('main.fieldLocked')}: ${body.rejectedFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'warning');
        else if (body.pendingFields?.length) Dashboard.showToast(`${Dashboard.t('main.changePending')}: ${body.pendingFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'info');
        await refreshTable(); // un vencimiento corregido cambia el estado y quién es el certificado vigente: se vuelve a leer todo
        return !body.rejectedFields?.length && !body.pendingFields?.length;
    } catch (err) {
        console.error('Calibraciones: failed to save change', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        await refreshTable();
        return false;
    }
}
async function uploadFile(record, file) {
    if (file.size > MAX_FILE_BYTES) { Dashboard.showToast(Dashboard.t('main.calFileTooBig'), 'error'); return false; }
    const type = file.type || '';
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(type)) { Dashboard.showToast(Dashboard.t('main.calFileBadType'), 'error'); return false; }
    try {
        const res = await fetch(`/api/business/calibrations/${record.id}/file?name=${encodeURIComponent(file.name || '')}`, { method: 'PUT', headers: { 'Content-Type': type }, credentials: 'include', body: file });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), res.status === 403 ? 'warning' : 'error'); return false; }
        Dashboard.showToast(Dashboard.t('main.calFileSaved'), 'success');
        return true;
    } catch (err) {
        console.error('Calibraciones: failed to upload the certificate', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        return false;
    }
}

// --- Qué se ve: los certificados de los centros de costos elegidos arriba + la búsqueda de texto + (si se pidió) un solo activo ------------------------
const searchText = () => (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
function updateFilterNote() {
    const note = document.getElementById('cal-filter-note');
    if (!note) return;
    const asset = assetFilterId ? calibrations.find((c) => c.assetId === assetFilterId) : null;
    note.hidden = !asset;
    note.textContent = '';
    if (!asset) return;
    note.append(fillText('main.calFilteringAsset', { code: asset.assetCode }), ' ');
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'cal-assets-link';
    clear.textContent = Dashboard.t('main.calFilteringClear');
    clear.addEventListener('click', () => { assetFilterId = 0; updateFilterNote(); drawRows(); });
    note.appendChild(clear);
}
function visibleRows() {
    const selected = Dashboard.getSelectedCostCenterIds();
    const text = searchText();
    return calibrations.filter((c) => {
        if (selected && !selected.includes(c.costCenterId)) return false;
        if (assetFilterId && c.assetId !== assetFilterId) return false;
        if (!text) return true;
        const haystack = [c.assetCode, c.assetSerial, c.assetModel, c.assetName, c.certificateNumber, c.laboratory, c.notes, c.dueOn, c.calibratedOn].map((v) => String(v || '')).join(' ').toLowerCase();
        return SearchSyntax.matches('contains', text, haystack);
    });
}
async function drawRows() {
    const token = ++drawToken;
    const tbody = getTbody();
    tbody.innerHTML = '';
    const records = visibleRows();
    if (!records.length) { ensureEmptyState(); return; }
    const finished = await Dashboard.renderTableRowsInChunks({ tableKey: TABLE_KEY, tbody, records, buildRow, isStale: () => token !== drawToken });
    if (finished && token === drawToken && Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY);
}
async function refreshTable() {
    const tbody = getTbody();
    if (tbody.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const token = ++loadToken;
    try {
        // el servidor calcula el estado con el día de quien mira (lo manda el navegador)
        const res = await fetch(`/api/business/calibrations?today=${AssetCalibration.today()}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (token !== loadToken) return; // llegó otra recarga después de esta
        calibrations = data.calibrations || [];
        pickAssets = data.assets || [];
        laboratories = data.laboratories || [];
        costCenters = data.costCenters || [];
        resultOptions = data.resultOptions || resultOptions;
        canCreate = !!data.canCreate;
        canReplaceFile = !!data.canReplaceFile;
        if (assetFilterId && !calibrations.some((c) => c.assetId === assetFilterId)) assetFilterId = 0;
        updateFilterNote();
        await drawRows();
    } catch (err) {
        console.error('Calibraciones: failed to load records', err);
    }
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', drawRows);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', drawRows);
document.addEventListener('sgn:cost-centers-changed', drawRows);

// --- «+ Nueva calibración» -----------------------------------------------------------------------------------------------------------------------------------
function renderNewRecordButton() {
    const wrapper = document.querySelector(`[data-table-id="${TABLE_KEY}"]`);
    const toolbar = wrapper?.previousElementSibling?.classList.contains('cp-note') ? wrapper.previousElementSibling.previousElementSibling : wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (!canCreate || toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.setAttribute('data-help-key', 'calNew');
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.newCalibration">${Dashboard.t('main.newCalibration')}</span>`;
    btn.addEventListener('click', openCreateModal);
    toolbar.prepend(btn);
}

const createModal = document.getElementById('new-cal-modal');
const createForm = document.getElementById('new-cal-form');
const createError = document.getElementById('new-cal-form-error');
const formEl = (name) => createForm.elements.namedItem(name);
const dueHint = document.getElementById('new-cal-due-hint');
const filePreview = document.getElementById('new-cal-file-preview');
let dueTouched = false; // si quien captura ya escribió el vencimiento, ya no se propone

function addMonths(iso, months) {
    const [y, m, d] = iso.split('-').map(Number);
    const total = y * 12 + (m - 1) + months;
    const ny = Math.floor(total / 12);
    const nm = total % 12;
    const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
const chosenAsset = () => pickAssets.find((a) => String(a.id) === formEl('assetId').value) || null;
// Propone el vencimiento con la vigencia del modelo (si quien captura no lo escribió) y dice de dónde salió.
function syncDue() {
    const asset = chosenAsset();
    const on = formEl('calibratedOn').value;
    const months = asset ? asset.months : 0;
    if (!asset) { dueHint.textContent = ''; return; }
    if (!months) { dueHint.textContent = Dashboard.t('main.calNoMonths'); return; }
    if (!dueTouched && /^\d{4}-\d{2}-\d{2}$/.test(on)) formEl('dueOn').value = addMonths(on, months);
    dueHint.textContent = fillText('main.calProposed', { n: months });
}
function fillAssets() {
    const select = formEl('assetId');
    select.innerHTML = '';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = Dashboard.t(pickAssets.length ? 'main.calPickAsset' : 'main.calNoAssets');
    select.appendChild(blank);
    const selected = Dashboard.getSelectedCostCenterIds();
    pickAssets.filter((a) => !selected || selected.includes(a.costCenterId)).forEach((a) => {
        const opt = document.createElement('option');
        opt.value = String(a.id);
        opt.textContent = [a.code, a.serialNumber ? `S/N ${a.serialNumber}` : '', a.modelLabel].filter(Boolean).join(' · ');
        select.appendChild(opt);
    });
}
function clearPreview() {
    filePreview.hidden = true;
    filePreview.innerHTML = '';
}
// La vista previa del certificado que se eligió: la foto, o el nombre y peso del PDF.
function showPreview(file) {
    clearPreview();
    if (!file) return;
    filePreview.hidden = false;
    if (file.type.startsWith('image/')) {
        // el CSP solo deja imágenes del mismo sitio y data: (no blob:): la vista previa se lee como data URL
        const img = document.createElement('img');
        img.alt = file.name;
        const reader = new FileReader();
        reader.onload = () => { img.src = String(reader.result); };
        reader.readAsDataURL(file);
        filePreview.appendChild(img);
    }
    const name = document.createElement('span');
    name.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
    filePreview.appendChild(name);
}
async function openCreateModal() {
    await refreshTable();
    createForm.reset();
    createError.hidden = true;
    dueTouched = false;
    clearPreview();
    fillAssets();
    const labs = document.getElementById('new-cal-labs');
    labs.innerHTML = '';
    laboratories.forEach((l) => { const opt = document.createElement('option'); opt.value = l; labs.appendChild(opt); });
    const result = formEl('result');
    result.innerHTML = '';
    resultOptions.forEach((r) => { const opt = document.createElement('option'); opt.value = r; opt.textContent = resultLabel(r); result.appendChild(opt); });
    result.value = 'ok';
    dueHint.textContent = '';
    createModal.hidden = false;
    formEl('assetId').focus();
}
const closeCreateModal = () => { createModal.hidden = true; clearPreview(); };
document.getElementById('new-cal-cancel')?.addEventListener('click', closeCreateModal);
createModal?.addEventListener('click', (event) => { if (event.target === createModal) closeCreateModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && createModal && !createModal.hidden) closeCreateModal(); });
formEl('assetId')?.addEventListener('change', () => { dueTouched = false; formEl('dueOn').value = ''; syncDue(); });
formEl('calibratedOn')?.addEventListener('change', syncDue);
formEl('dueOn')?.addEventListener('input', () => { dueTouched = true; });
formEl('file')?.addEventListener('change', () => showPreview(formEl('file').files[0] || null));

createForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    createError.hidden = true;
    const saveBtn = document.getElementById('new-cal-save');
    saveBtn.disabled = true;
    try {
        const body = {
            assetId: Number(formEl('assetId').value) || 0, certificateNumber: formEl('certificateNumber').value.trim(), laboratory: formEl('laboratory').value.trim(),
            calibratedOn: formEl('calibratedOn').value, dueOn: formEl('dueOn').value, result: formEl('result').value, notes: formEl('notes').value.trim(),
        };
        if (!body.assetId) throw new Error(Dashboard.t('main.calPickAsset'));
        if (!body.certificateNumber) throw new Error(Dashboard.t('main.calNeedCertificate'));
        if (!body.calibratedOn) throw new Error(Dashboard.t('main.calNeedDate'));
        if (!body.dueOn) throw new Error(Dashboard.t('main.calNeedDue'));
        const file = formEl('file').files[0] || null;
        if (file && file.size > MAX_FILE_BYTES) throw new Error(Dashboard.t('main.calFileTooBig'));
        if (file && !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) throw new Error(Dashboard.t('main.calFileBadType'));
        const res = await fetch('/api/business/calibrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.message || Dashboard.t('admin.saveError'));
        }
        const { calibration } = await res.json();
        // el certificado ya quedó guardado: si el archivo no sube se avisa al final (no se queda callado) y se puede subir desde su renglón
        let fileFailed = false;
        if (file) fileFailed = !(await uploadFile(calibration, file));
        closeCreateModal();
        await refreshTable();
        Dashboard.showToast(fillText('main.calSaved', { code: calibration.assetCode }), fileFailed ? 'warning' : 'success');
    } catch (err) {
        console.error('Calibraciones: failed to save new record', err);
        createError.textContent = err.message;
        createError.hidden = false;
    } finally {
        saveBtn.disabled = false;
    }
});
