// ---------------------------------------------------------------------------
// Mantenimiento Preventivo — Operaciones > Mtto. de activos > Preventivo (C. Distribución).
// Un renglón por PROGRAMA: qué se le hace a un activo (tarea), cada cuánto (días o meses), quién es el responsable y cuándo toca. Cuando se hace se registra una corrida (fecha, quién, costo, observaciones y hasta 3 fotos) y la próxima
// fecha se corre sola (la propuesta es la fecha en que se hizo + la frecuencia; se corrige). Lo ya hecho queda como historial del programa («Veces»).
// Estados con tu día de hoy: Al corriente, Por vencer (7 días o menos) y Vencido. Los programas no se eliminan: se desactivan. Cada acción pide su hoja del árbol (Nuevo programa, Registrar, Desactivar). Persistido en /api/business/maintenance/programs.
// ---------------------------------------------------------------------------
const TABLE_KEY = 'mtto-preventivo';
const ACTIVE_PAGE = 'cat-operaciones-centro-dist-mtto-preventivo';
const COLUMN_COUNT = 23;
const API = '/api/business/maintenance/programs';
const MT = window.AssetMaintenance;
const EXTERNAL = '0';

let programs = [];
let assets = [];
let people = [];
let canCreate = false;
let canRegister = false;
let canDelete = false;
let maxPhotos = 3;
let drawToken = 0;
let loadToken = 0;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: ACTIVE_PAGE });
        if (!role) return;
        await refreshTable();
        renderNewRecordButton();
        if (Dashboard.ensureColumnMinWidth) [['colMpActivo', 160], ['colMpTarea', 200], ['colMpEstado', 190], ['colMpResponsable', 190], ['colMpCada', 110]].forEach(([col, px]) => Dashboard.ensureColumnMinWidth(TABLE_KEY, col, px));
    } catch (err) {
        console.error('Mantenimiento Preventivo failed to initialize:', err);
    }
})();

// t(clave, { parámetros }) es la de Dashboard.js (global); aquí no se vuelve a declarar
const isPending = (record, key) => (record.pendingFields || []).includes(key);
const getTbody = () => document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0];
const unitText = (unit, n) => t(`main.mtUnit_${unit}${n === 1 ? '1' : ''}`);
const dayDisplay = (iso) => MT.dateText(iso) || iso;
function addMonths(iso, months) {
    const [y, m, d] = iso.split('-').map(Number);
    const total = y * 12 + (m - 1) + months;
    const ny = Math.floor(total / 12);
    const nm = total % 12;
    const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
function addEvery(iso, value, unit) {
    if (unit === 'days') { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + value)).toISOString().slice(0, 10); }
    return addMonths(iso, value);
}

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
function inlineCell(record, colId, key, { inputType = 'text', formatDisplay, helpKey, toValue } = {}) {
    const td = document.createElement('td');
    td.dataset.col = colId;
    if (helpKey) td.setAttribute('data-help-key', helpKey);
    Dashboard.attachInlineEdit(td, {
        value: record[key] === 0 || record[key] ? String(record[key]) : '', inputType, formatDisplay,
        tableKey: TABLE_KEY, colKey: colId, pending: isPending(record, key),
        onCommit: (val) => patchProgram(record, { [key]: toValue ? toValue(val) : val.trim() }),
    });
    return td;
}
function assetCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colMpActivo';
    td.setAttribute('data-help-key', 'mtAsset');
    const code = document.createElement('b');
    code.textContent = record.assetCode || '—';
    td.title = [record.assetName, record.typeName].filter(Boolean).join(' · ');
    td.appendChild(code);
    if (record.assetName) { const sub = document.createElement('small'); sub.className = 'cal-serial'; sub.textContent = record.assetName; td.append(document.createElement('br'), sub); }
    return td;
}
function responsibleCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colMpResponsable';
    td.setAttribute('data-help-key', 'mtResponsible');
    const select = document.createElement('select');
    select.className = 'editable-cell-select asset-select';
    const opts = [{ value: EXTERNAL, label: t('main.mtExternal') }, ...people.map((p) => ({ value: String(p.id), label: p.name }))];
    if (record.responsibleUserId && !people.some((p) => p.id === record.responsibleUserId)) opts.push({ value: String(record.responsibleUserId), label: record.responsibleLabel });
    opts.forEach((o) => { const opt = document.createElement('option'); opt.value = o.value; opt.textContent = o.label; select.appendChild(opt); });
    select.value = String(record.responsibleUserId || 0);
    select.disabled = isPending(record, 'responsibleUserId') || !Dashboard.canEditField(TABLE_KEY, 'colMpResponsable', record.responsibleLabel);
    if (select.disabled) select.title = t(isPending(record, 'responsibleUserId') ? 'main.changePending' : 'main.fieldLocked');
    select.addEventListener('change', () => patchProgram(record, { responsibleUserId: Number(select.value) || 0 }));
    td.appendChild(select);
    return td;
}
function stateCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colMpEstado';
    td.setAttribute('data-help-key', 'mtProgramState');
    td.appendChild(MT.programChip(record));
    return td;
}
function timesCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colMpVeces';
    td.setAttribute('data-help-key', 'mtRuns');
    if (!record.runs) { td.textContent = '0'; return td; }
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'cal-assets-link'; btn.textContent = String(record.runs); btn.title = t('main.mtRunsOpen');
    btn.addEventListener('click', () => openRunsDialog(record));
    td.appendChild(btn);
    return td;
}
function buildActionsCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const mk = (cls, help, label, icon, onClick) => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = cls;
        btn.setAttribute('data-help-key', help); btn.setAttribute('aria-label', label); btn.title = label;
        btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
        btn.addEventListener('click', onClick);
        return btn;
    };
    if (canRegister && record.status !== 'inactive') {
        const reg = document.createElement('button');
        reg.type = 'button'; reg.className = 'btn mt-register'; reg.setAttribute('data-help-key', 'mtRegister'); reg.textContent = t('main.mtRegister');
        reg.addEventListener('click', () => openRegisterDialog(record));
        td.appendChild(reg);
    }
    td.appendChild(mk('admin-icon-btn', 'changeHistory', t('main.changeHistoryTitleRecord'), 'bx-history', () => Dashboard.openChangeHistory(TABLE_KEY, record.id)));
    if (canDelete) {
        const inactive = record.status === 'inactive';
        td.appendChild(mk(inactive ? 'admin-icon-btn' : 'admin-icon-btn admin-icon-btn-danger', inactive ? 'mtActivate' : 'mtDeactivate', t(inactive ? 'main.mtActivate' : 'main.mtDeactivate'), inactive ? 'bx-play-circle' : 'bx-power-off', () => changeStatus(record, inactive ? 'active' : 'inactive')));
    }
    return td;
}
function buildRow(record) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(record.id);
    if (record.status === 'inactive') tr.classList.add('sku-row-inactive');
    const registro = textCell('colMpRegistroUnico', record.registroUnico);
    registro.classList.add('col-system');
    tr.append(
        ...buildSystemCells(record), registro,
        assetCell(record),
        inlineCell(record, 'colMpTarea', 'task', { helpKey: 'mtTask' }),
        inlineCell(record, 'colMpCada', 'everyValue', { inputType: 'number', helpKey: 'mtEvery', toValue: (v) => Math.max(1, parseInt(v, 10) || 1), formatDisplay: (v) => `${v} ${unitText(record.everyUnit, Number(v))}` }),
        textCell('colMpUltima', record.lastOn ? dayDisplay(record.lastOn) : '', 'mtLast'),
        textCell('colMpProxima', dayDisplay(record.nextOn), 'mtNext'),
        stateCell(record),
        responsibleCell(record),
        timesCell(record),
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
    inner.textContent = t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}

// --- Guardar --------------------------------------------------------------------------------------------------------------------------------------------------
async function patchProgram(record, patch) {
    try {
        const body = await MT.sendJson('PATCH', `${API}/${record.id}`, patch);
        if (body.rejectedFields?.length) Dashboard.showToast(`${t('main.fieldLocked')}: ${body.rejectedFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'warning');
        else if (body.pendingFields?.length) Dashboard.showToast(`${t('main.changePending')}: ${body.pendingFields.map((fk) => Dashboard.t(fk)).join(', ')}`, 'info');
        await refreshTable();
        return !body.rejectedFields?.length && !body.pendingFields?.length;
    } catch (err) {
        Dashboard.showToast(err.message || t('admin.saveError'), err.status === 403 ? 'warning' : 'error');
        await refreshTable();
        return false;
    }
}
async function changeStatus(record, status) {
    if (status === 'inactive' && !(await Dashboard.confirm(t('main.mtDeactivateConfirm', { task: record.task, code: record.assetCode }), { accept: t('main.mtDeactivateAccept') }))) return;
    try {
        await MT.sendJson('POST', `${API}/${record.id}/status`, { status });
        Dashboard.showToast(t(status === 'inactive' ? 'main.mtDeactivated' : 'main.mtActivated'), 'success');
        await refreshTable();
    } catch (err) {
        Dashboard.showToast(err.message || t('admin.saveError'), err.status === 403 ? 'warning' : 'error');
    }
}

// --- Qué se ve -------------------------------------------------------------------------------------------------------------------------------------------------
const searchText = () => (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
function visibleRows() {
    const selected = Dashboard.getSelectedCostCenterIds();
    const text = searchText();
    return programs.filter((p) => {
        if (selected && !selected.includes(p.costCenterId)) return false;
        if (!text) return true;
        const haystack = [p.assetCode, p.assetSerial, p.assetName, p.assetModel, p.task, p.responsibleLabel, p.nextOn, p.lastOn].map((v) => String(v || '')).join(' ').toLowerCase();
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
        const res = await fetch(`${API}?today=${MT.today()}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (token !== loadToken) return;
        programs = data.programs || [];
        assets = data.assets || [];
        people = data.people || [];
        canCreate = !!data.canCreate;
        canRegister = !!data.canRegister;
        canDelete = !!data.canDelete;
        maxPhotos = data.maxPhotos || 3;
        await drawRows();
    } catch (err) {
        console.error('Mantenimiento Preventivo: failed to load records', err);
    }
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', drawRows);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', drawRows);
document.addEventListener('sgn:cost-centers-changed', drawRows);

// --- «+ Nuevo programa» ---------------------------------------------------------------------------------------------------------------------------------------
function renderNewRecordButton() {
    const wrapper = document.querySelector(`[data-table-id="${TABLE_KEY}"]`);
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (!canCreate || toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.setAttribute('data-help-key', 'mtNewProgram');
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.mtNewProgram">${t('main.mtNewProgram')}</span>`;
    btn.addEventListener('click', openNewProgramDialog);
    toolbar.prepend(btn);
}
async function openNewProgramDialog() {
    await refreshTable();
    const selected = Dashboard.getSelectedCostCenterIds();
    const pick = assets.filter((a) => !selected || selected.includes(a.costCenterId));
    MT.dialog({
        title: t('main.mtNewProgram'), subtitle: t('main.mtNewProgramHint'), saveLabel: t('main.mtSaveProgram'),
        fields: [
            { name: 'assetId', label: t('main.colMpActivo'), type: 'select', full: true, options: [{ value: '', label: t(pick.length ? 'main.mtPickAsset' : 'main.mtNoAssets') }, ...pick.map((a) => ({ value: a.id, label: [a.code, a.name || a.typeName, a.serialNumber ? `S/N ${a.serialNumber}` : ''].filter(Boolean).join(' · ') }))] },
            { name: 'task', label: t('main.colMpTarea'), type: 'text', full: true, maxLength: 160 },
            { name: 'everyValue', label: t('main.colMpCada'), type: 'number', min: 1, max: 999, value: 3 },
            { name: 'everyUnit', label: t('main.mtUnitLabel'), type: 'select', options: [{ value: 'days', label: t('main.mtUnit_days') }, { value: 'months', label: t('main.mtUnit_months') }], value: 'months' },
            { name: 'firstOn', label: t('main.mtFirstOn'), type: 'date', value: MT.today(), hint: t('main.mtFirstOnHint') },
            { name: 'responsibleUserId', label: t('main.colMpResponsable'), type: 'select', options: [{ value: EXTERNAL, label: t('main.mtExternal') }, ...people.map((p) => ({ value: p.id, label: p.name }))], value: EXTERNAL, hint: t('main.mtResponsibleHint') },
        ],
        onSubmit: async (v) => {
            if (!v.assetId) throw new Error(t('main.mtPickAsset'));
            if (!v.task) throw new Error(t('main.mtNeedTask'));
            if (!v.firstOn) throw new Error(t('main.mtNeedFirst'));
            const body = await MT.sendJson('POST', API, { assetId: Number(v.assetId), task: v.task, everyValue: Number(v.everyValue), everyUnit: v.everyUnit, firstOn: v.firstOn, responsibleUserId: Number(v.responsibleUserId) || 0 });
            Dashboard.showToast(t('main.mtProgramSaved', { code: body.program.assetCode }), 'success');
            await refreshTable();
            return true;
        },
    });
}

// --- «Registrar mantenimiento» --------------------------------------------------------------------------------------------------------------------------------
function openRegisterDialog(program) {
    let nextTouched = false;
    const names = [t('main.mtExternal'), ...people.map((p) => p.name)];
    MT.dialog({
        title: t('main.mtRegisterTitle'), subtitle: `${program.assetCode} · ${program.task}`, saveLabel: t('main.mtSaveRun'),
        fields: [
            { name: 'doneOn', label: t('main.mtDoneOn'), type: 'date', value: MT.today() },
            { name: 'doneBy', label: t('main.mtDoneBy'), type: 'text', value: program.responsibleLabel || '', list: names, maxLength: 120, hint: t('main.mtDoneByHint') },
            { name: 'nextOn', label: t('main.mtNextOn'), type: 'date', value: addEvery(MT.today(), program.everyValue, program.everyUnit), hint: t('main.mtNextOnHint', { n: program.everyValue, unit: unitText(program.everyUnit, program.everyValue) }) },
            { name: 'cost', label: t('main.mtCostOpt'), type: 'number', step: '0.01', min: 0 },
            { name: 'notes', label: t('main.mtNotes'), type: 'text', full: true, maxLength: 500, hint: t('main.mtNotesHint') },
            { name: 'photos', label: t('main.mtPhotosOpt'), type: 'photos', full: true, max: maxPhotos },
        ],
        onInput: (name, api) => {
            if (name === 'nextOn') { nextTouched = true; return; }
            if (name === 'doneOn' && !nextTouched && /^\d{4}-\d{2}-\d{2}$/.test(api.get('doneOn'))) api.set('nextOn', addEvery(api.get('doneOn'), program.everyValue, program.everyUnit));
        },
        onSubmit: async (v, api) => {
            if (!v.doneOn) throw new Error(t('main.mtNeedDoneOn'));
            if (!v.doneBy) throw new Error(t('main.mtNeedDoneBy'));
            const body = await MT.sendJson('POST', `${API}/${program.id}/runs`, { doneOn: v.doneOn, doneBy: v.doneBy, nextOn: v.nextOn, cost: v.cost === '' ? 0 : Number(v.cost), notes: v.notes });
            const files = api.photos();
            let failed = 0;
            if (files.length) failed = await MT.uploadPhotos('run', body.run.id, files);
            Dashboard.showToast(failed ? t('main.mtRunSavedPhotosFailed', { n: failed }) : t('main.mtRunSaved', { code: program.assetCode }), failed ? 'warning' : 'success');
            await refreshTable();
            return true;
        },
    });
}

// --- Historial de un programa (las corridas) ---------------------------------------------------------------------------------------------------------------------
async function openRunsDialog(program) {
    let runs = [];
    try { runs = (await MT.sendJson('GET', `${API}/${program.id}/runs`)).runs || []; } catch (err) { Dashboard.showToast(err.message || t('admin.saveError'), 'error'); return; }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.style.maxWidth = '52rem';
    const h = document.createElement('h3'); h.textContent = t('main.mtRunsTitle', { code: program.assetCode, task: program.task });
    const wrap = document.createElement('div'); wrap.className = 'mt-runs-wrap';
    const table = document.createElement('table'); table.className = 'mt-runs';
    table.innerHTML = `<thead><tr><th>${t('main.mtDoneOn')}</th><th>${t('main.mtDoneBy')}</th><th>${t('main.mtNextOn')}</th><th>${t('main.mtCost')}</th><th>${t('main.mtNotes')}</th><th>${t('main.mtPhotos')}</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    runs.forEach((r) => {
        const tr = document.createElement('tr');
        const cells = [dayDisplay(r.doneOn), r.doneBy || '—', dayDisplay(r.nextOn), r.cost > 0 ? `$ ${Number(r.cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—', r.notes || '—'];
        cells.forEach((text) => { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); });
        const ph = document.createElement('td');
        (r.photos || []).forEach((n, i) => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'mt-thumb';
            const img = document.createElement('img'); img.src = MT.photoUrl('run', r.id, n); img.alt = '';
            b.appendChild(img);
            b.addEventListener('click', () => MT.openPhotoViewer(r.photos.map((m) => MT.photoUrl('run', r.id, m)), i));
            ph.appendChild(b);
        });
        if (!(r.photos || []).length) ph.textContent = '—';
        tr.appendChild(ph);
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    const actions = document.createElement('div'); actions.className = 'admin-form-actions';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'btn'; close.textContent = t('main.mtClose');
    actions.appendChild(close);
    panel.append(h, wrap, actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    const onKey = (event) => { if (event.key === 'Escape') shut(); };
    const shut = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) shut(); });
    close.addEventListener('click', shut);
}
