// ---------------------------------------------------------------------------
// Lecturas — Operaciones > Cadena de Suministro > C. Distribución (2026-11-13).
// Donde se captura lo que NO tiene pantalla propia: la lectura de un criterio de «Qué se mide» que el modelo del activo mide (peso, presión… o temperatura y humedad sin QR) o una actividad de un aviso que creó la empresa
// («Revisión de extintor»). Una lectura no se edita ni se elimina: se corrige con otra más nueva (la última cuenta). Al guardar se vuelven a calcular las alertas del activo (si pasó su límite, sale en Gestión > Activos y en la campana).
// ---------------------------------------------------------------------------
const TABLE_KEY = 'lecturas';
const ACTIVE_PAGE = 'cat-operaciones-centro-dist-lecturas';
const COLUMN_COUNT = 22;

let readings = [];
let pickAssets = [];
let canCreate = false;
let loadToken = 0;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: ACTIVE_PAGE });
        if (!role) return;
        await refreshTable();
        renderNewRecordButton();
        if (Dashboard.ensureColumnMinWidth) [['colLecActivo', 150], ['colLecQue', 190], ['colLecValor', 130], ['colLecResultado', 150], ['colLecNota', 220], ['colLecQuien', 160], ['colLecFecha', 160]].forEach(([c, w]) => Dashboard.ensureColumnMinWidth(c, w));
    } catch (err) {
        console.error('Lecturas failed to initialize:', err);
    }
})();

const tx = (key, params) => Dashboard.t(key, params); // OJO: no declarar «t» (choca con la función global de Dashboard.js)
const getTbody = () => document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0];
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
const fmtWhen = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

function resultCell(record) {
    const td = document.createElement('td');
    td.dataset.col = 'colLecResultado';
    td.setAttribute('data-help-key', 'readingResult');
    if (!record.result) { td.textContent = '—'; return td; }
    const chip = document.createElement('span');
    chip.className = `asset-sev asset-sev-${record.result === 'out' ? 'high' : 'ok'}`;
    chip.textContent = tx(record.result === 'out' ? 'main.readingOut' : 'main.readingOk');
    td.appendChild(chip);
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
    historyBtn.setAttribute('aria-label', tx('main.changeHistoryTitleRecord'));
    historyBtn.title = tx('main.changeHistoryTitleRecord');
    historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    historyBtn.addEventListener('click', () => Dashboard.openChangeHistory(TABLE_KEY, record.id));
    td.appendChild(historyBtn);
    return td;
}
function buildRow(record) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(record.id);
    const registro = textCell('colLecRegistroUnico', record.registroUnico);
    registro.classList.add('col-system');
    const what = record.kind === 'activity' ? record.avisoName : record.criterionName;
    const value = record.kind === 'activity' ? '' : (record.limitKind === 'every' ? tx('main.readingDone') : `${record.value} ${record.unit}`.trim());
    const asset = textCell('colLecActivo', record.assetCode, 'readingAsset');
    asset.title = [record.assetName, record.typeName].filter(Boolean).join(' · ');
    asset.style.fontWeight = '600';
    tr.append(
        ...buildSystemCells(record), registro, asset,
        textCell('colLecQue', what, 'readingWhat'), textCell('colLecValor', value, 'readingValue'), resultCell(record), textCell('colLecNota', record.note, 'readingNote'),
        textCell('colLecQuien', record.personName, 'readingWho'), textCell('colLecFecha', fmtWhen(record.readAt), 'readingWhen'), buildActionsCell(record),
    );
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
    inner.textContent = tx('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}
const searchText = () => (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
function visibleRows() {
    const selected = Dashboard.getSelectedCostCenterIds ? Dashboard.getSelectedCostCenterIds() : null;
    const text = searchText();
    return readings.filter((r) => {
        if (selected && r.costCenterId && !selected.includes(r.costCenterId)) return false;
        if (!text) return true;
        const hay = [r.assetCode, r.assetName, r.criterionName, r.avisoName, r.note, r.personName, r.typeName].join(' ').toLowerCase();
        return window.SearchSyntax ? SearchSyntax.matches('contains', text, hay) : hay.includes(text);
    });
}
function drawRows() {
    const tbody = getTbody();
    tbody.innerHTML = '';
    visibleRows().forEach((r) => tbody.appendChild(buildRow(r)));
    ensureEmptyState();
}
async function refreshTable() {
    const token = ++loadToken;
    try {
        const res = await fetch('/api/business/readings', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (token !== loadToken) return;
        readings = data.readings || [];
        pickAssets = data.assets || [];
        canCreate = !!data.canCreate;
        drawRows();
    } catch (err) {
        console.error('Lecturas: failed to load records', err);
    }
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', drawRows);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', drawRows);
document.addEventListener('sgn:cost-centers-changed', drawRows);

// --- «+ Nueva lectura» -----------------------------------------------------------------------------------------------------------------------------------------
function renderNewRecordButton() {
    const wrapper = document.querySelector(`[data-table-id="${TABLE_KEY}"]`);
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (!canCreate || toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.setAttribute('data-help-key', 'readingNew');
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="main.newReading">${tx('main.newReading')}</span>`;
    btn.addEventListener('click', openCreateModal);
    toolbar.prepend(btn);
}
function openCreateModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const panel = document.createElement('div');
    panel.className = 'modal-panel sku-edit-win';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const h3 = document.createElement('h3');
    h3.textContent = tx('main.newReading');
    panel.appendChild(h3);
    const form = document.createElement('div');
    form.className = 'asset-limit-form';
    const field = (labelKey, control) => {
        const wrap = document.createElement('label');
        wrap.className = 'asset-limit-field';
        const span = document.createElement('span');
        span.textContent = tx(labelKey);
        wrap.append(span, control);
        form.appendChild(wrap);
        return wrap;
    };
    const assetSel = document.createElement('select');
    pickAssets.forEach((a) => { const o = document.createElement('option'); o.value = String(a.id); o.textContent = `${a.code}${a.name ? ` · ${a.name}` : ''}`; assetSel.appendChild(o); });
    const whatSel = document.createElement('select');
    const value = document.createElement('input');
    value.type = 'number';
    value.step = 'any';
    const note = document.createElement('input');
    note.type = 'text';
    note.maxLength = 300;
    const when = document.createElement('input');
    when.type = 'datetime-local';
    field('main.colLecActivo', assetSel);
    field('main.colLecQue', whatSel);
    const valueWrap = field('main.colLecValor', value);
    const unitEl = document.createElement('small');
    valueWrap.appendChild(unitEl);
    const noteWrap = field('main.colLecNota', note);
    field('main.colLecFecha', when);
    panel.appendChild(form);
    const hint = document.createElement('p');
    hint.className = 'asset-crit-hint';
    hint.textContent = tx('main.readingHint');
    panel.appendChild(hint);
    const selected = () => pickAssets.find((a) => String(a.id) === assetSel.value);
    const fillWhat = () => {
        whatSel.innerHTML = '';
        const a = selected();
        if (!a) return;
        a.criteria.forEach((c) => { const o = document.createElement('option'); o.value = `c:${c.id}`; o.textContent = c.name; whatSel.appendChild(o); });
        a.avisos.forEach((x) => { const o = document.createElement('option'); o.value = `a:${x.id}`; o.textContent = x.name; whatSel.appendChild(o); });
        syncKind();
    };
    const syncKind = () => {
        const a = selected();
        const [k, id] = String(whatSel.value || ':').split(':');
        const crit = a && k === 'c' ? a.criteria.find((c) => String(c.id) === id) : null;
        valueWrap.hidden = !crit || crit.kind === 'every';
        unitEl.textContent = crit ? crit.unit : '';
        noteWrap.querySelector('span').textContent = tx(k === 'a' ? 'main.readingNoteRequired' : 'main.colLecNota');
    };
    assetSel.addEventListener('change', fillWhat);
    whatSel.addEventListener('change', syncKind);
    fillWhat();
    const actions = document.createElement('div');
    actions.className = 'admin-form-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = tx('admin.cancel');
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn';
    save.textContent = tx('main.readingSave');
    actions.append(cancel, save);
    panel.appendChild(actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    cancel.addEventListener('click', close);
    save.addEventListener('click', async () => {
        const [k, id] = String(whatSel.value || ':').split(':');
        const body = { assetId: Number(assetSel.value), kind: k === 'a' ? 'activity' : 'value', note: note.value.trim() };
        if (k === 'a') body.avisoId = Number(id); else { body.criterionId = Number(id); body.value = value.value; }
        if (when.value) body.readAt = new Date(when.value).toISOString();
        save.disabled = true;
        try {
            const res = await fetch('/api/business/readings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { Dashboard.showToast(data.message || tx('admin.saveError'), res.status === 403 ? 'warning' : 'error'); save.disabled = false; return; }
            close();
            Dashboard.showToast(tx('main.readingSaved'), 'success');
            await refreshTable();
        } catch (err) {
            console.error('Lecturas: failed to save', err);
            Dashboard.showToast(tx('admin.saveError'), 'error');
            save.disabled = false;
        }
    });
    assetSel.focus();
}
