// ---------------------------------------------------------------------------
// TI › Configuración Compañía › Expansiones: el cliente pide ampliar su contrato. Ve lo que tiene contratado y lo que le falta, arma su solicitud (más sitios, más centros de costo, departamentos nuevos, la App móvil, un giro adicional
// u otra cosa), ve el costo ESTIMADO de la lista de precios antes de enviarla y sigue sus solicitudes con su estatus. El costo final lo negocia SaaS (con descuentos, etc.) y SaaS aplica el cambio al contrato a mano.
// Pide el administrador del cliente o quien tenga el botón «Pedir ampliación» en su árbol. Rutas en server.js (/api/business/expansions).
// ---------------------------------------------------------------------------
(function () {
const TABLE_KEY = 'expansiones';
const HISTORY_KEY = 'expansiones';
const API = '/api/business/expansions';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let state = { summary: null, requests: [], canRequest: false };
let timer = null;

async function api(path, options = {}) {
    const res = await fetch(path, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(body.message || 'request failed'); err.status = res.status; err.body = body; throw err; }
    return body;
}
const money = (amount, currency) => Dashboard.formatCurrency(amount, currency);
const deptName = (key) => { const d = (Dashboard.DEPARTMENTS || []).find((x) => x.key === key); return d ? t(d.labelKey) : key; };
const dateTime = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX', { dateStyle: 'medium', timeStyle: 'short' }); };

// Cómo se escribe un renglón de la solicitud.
function itemText(i) {
    if (i.type === 'sites') return t(i.qty === 1 ? 'main.expItemSite' : 'main.expItemSites', { n: i.qty });
    if (i.type === 'cost_centers') return t(i.qty === 1 ? 'main.expItemCenter' : 'main.expItemCenters', { n: i.qty });
    if (i.type === 'departments') return t('main.expItemDepartments', { names: i.keys.map(deptName).join(', ') });
    if (i.type === 'app') return t('main.expItemApp');
    if (i.type === 'giro') return t('main.expItemGiro', { name: i.name });
    return t('main.expItemOther', { text: i.text });
}
const estimateText = (r) => {
    if (r.estCost > 0) return `${money(r.estCost, r.currency)}${r.estPending ? ` + ${t('main.expPendingCount', { n: r.estPending })}` : ''}`;
    return r.estPending ? t('main.expToQuote') : '—';
};
const statusChip = (status) => `<span class="exp-chip exp-chip-${esc(status)}">${esc(t(`main.expStatus_${status}`))}</span>`;

// ---- la tabla -----------------------------------------------------------------------------------------------------------------------------------------
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function iconButton(icon, title, helpKey, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'admin-icon-btn';
    if (helpKey) btn.setAttribute('data-help-key', helpKey);
    btn.setAttribute('aria-label', title);
    btn.title = title;
    btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
    btn.addEventListener('click', onClick);
    return btn;
}
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id);
    const status = document.createElement('td');
    status.dataset.col = 'colExpEstatus';
    status.innerHTML = statusChip(r.status);
    const actions = document.createElement('td');
    actions.dataset.col = 'actions';
    actions.className = 'admin-table-actions';
    actions.appendChild(iconButton('bx-show', t('main.expView'), null, () => openDetail(r)));
    actions.appendChild(iconButton('bx-history', t('main.solHistory'), 'changeHistory', () => Dashboard.openChangeHistory(HISTORY_KEY, r.id)));
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, r[key], 'col-system')),
        cell('colExpFolio', r.label), cell('colExpQue', r.items.map(itemText).join(' · ')), status, cell('colExpEstimado', estimateText(r)),
        cell('colExpFinal', r.finalCost === null || r.finalCost === undefined ? '' : money(r.finalCost, r.currency)), cell('colExpNota', r.saasNote), actions,
    );
    return tr;
}
function getTbody() { return document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0]; }
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
const searchText = () => (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
function redraw() {
    const tbody = getTbody();
    tbody.innerHTML = '';
    const text = searchText();
    const list = text ? state.requests.filter((r) => SearchSyntax.matches('contains', text, [r.label, r.items.map(itemText).join(' '), r.saasNote, t(`main.expStatus_${r.status}`)].filter(Boolean).join(' ').toLowerCase())) : state.requests;
    list.forEach((r) => tbody.appendChild(buildRow(r)));
    if (!list.length) ensureEmptyState();
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY);
}
async function refreshTable(quiet) {
    try {
        state = await api(API);
        redraw();
    } catch (err) {
        console.error('Expansiones: failed to load records', err);
        if (!quiet) Dashboard.showToast(t('main.expLoadError'), 'error');
    }
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', redraw);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', redraw);

// ---- ventanas ----------------------------------------------------------------------------------------------------------------------------------------
function makeModal(html) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    overlay.innerHTML = `<div class="modal-panel exp-panel" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    return { overlay, close, $: (sel) => overlay.querySelector(sel) };
}
function haveHtml(s) {
    const row = (label, value) => `<div class="exp-have-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
    return `<div class="exp-have">${[
        row(t('main.expPlan'), s.plan || '—'),
        row(t('main.expSites'), t('main.expUsed', { used: s.sites.used, total: s.sites.contracted })),
        row(t('main.expCenters'), t('main.expUsed', { used: s.costCenters.used, total: s.costCenters.contracted })),
        row(t('main.expDepartments'), s.departments.length ? s.departments.map(deptName).join(', ') : '—'),
        row(t('main.expApp'), t(s.app.enabled ? 'main.expYes' : 'main.expNo')),
        row(t('main.expGiro'), s.giro.current || '—'),
    ].join('')}</div>`;
}

// «+ Pedir ampliación»: lo que tienes, lo que quieres pedir (con el estimado al momento) y un comentario.
function openForm() {
    const s = state.summary;
    const type = (key, label, control, help) => `<div class="exp-type" data-type="${key}"${help ? ` data-help-key="${help}"` : ''}><label class="exp-type-head"><input type="checkbox" data-pick="${key}"><span>${esc(label)}</span></label><div class="exp-type-body" hidden>${control}</div></div>`;
    const blocks = [
        type('sites', t('main.expTypeSites'), `<label>${esc(t('main.expQty'))} <input type="number" min="1" max="999" step="1" value="1" data-qty="sites"></label>`),
        type('cost_centers', t('main.expTypeCenters'), `<label>${esc(t('main.expQty'))} <input type="number" min="1" max="999" step="1" value="1" data-qty="cost_centers"></label>`),
        s.missingDepartments.length ? type('departments', t('main.expTypeDepartments'), `<div class="exp-checks">${s.missingDepartments.map((k) => `<label><input type="checkbox" data-dept="${esc(k)}"><span>${esc(deptName(k))}</span></label>`).join('')}</div>`) : '',
        s.app.enabled ? '' : type('app', t('main.expTypeApp'), ''),
        s.giro.available.length ? type('giro', t('main.expTypeGiro'), `<select data-giro><option value="">${esc(t('main.expPickGiro'))}</option>${s.giro.available.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select>`) : '',
        type('other', t('main.expTypeOther'), `<textarea rows="3" maxlength="600" data-other placeholder="${esc(t('main.expOtherPlaceholder'))}"></textarea>`),
    ].join('');
    const modal = makeModal(`<h3>${esc(t('main.expNew'))}</h3>
        <h4 class="exp-sub">${esc(t('main.expHave'))}</h4>${haveHtml(s)}
        <h4 class="exp-sub">${esc(t('main.expAsk'))}</h4><div class="exp-types">${blocks}</div>
        <div class="admin-field"><label for="exp-note">${esc(t('main.expNote'))}</label><textarea id="exp-note" rows="2" maxlength="600"></textarea></div>
        <div class="exp-estimate" id="exp-estimate" data-help-key="expEstimado" hidden></div>
        <p class="admin-error" id="exp-error" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" id="exp-send">${esc(t('main.expSend'))}</button><button type="button" class="btn btn-secondary" id="exp-close">${esc(t('main.solClose'))}</button></div>`);
    const errorEl = modal.$('#exp-error');
    const showError = (text) => { errorEl.textContent = text; errorEl.hidden = !text; };
    // lo marcado → renglones para el servidor
    const read = () => {
        const items = [];
        modal.overlay.querySelectorAll('[data-pick]:checked').forEach((cb) => {
            const key = cb.dataset.pick;
            const box = modal.overlay.querySelector(`[data-type="${key}"]`);
            if (key === 'sites' || key === 'cost_centers') items.push({ type: key, qty: Number(box.querySelector('[data-qty]').value) });
            else if (key === 'departments') items.push({ type: key, keys: [...box.querySelectorAll('[data-dept]:checked')].map((el) => el.dataset.dept) });
            else if (key === 'app') items.push({ type: key });
            else if (key === 'giro') items.push({ type: key, sectorId: Number(box.querySelector('[data-giro]').value) || 0 });
            else items.push({ type: key, text: box.querySelector('[data-other]').value.trim() });
        });
        return items;
    };
    let estimateSeq = 0;
    let estimateTimer = null;
    const drawEstimate = (data) => {
        const box = modal.$('#exp-estimate');
        if (!data) { box.hidden = true; return; }
        const rows = data.items.map((i) => `<div class="exp-est-row"><span>${esc(itemText(i))}</span><b>${i.est === null ? esc(t('main.expToQuote')) : esc(money(i.est, data.currency))}</b></div>`).join('');
        box.innerHTML = `${rows}<div class="exp-est-total"><span>${esc(t('main.colExpEstimado'))}</span><b>${esc(data.estCost > 0 ? `${money(data.estCost, data.currency)}${data.estPending ? ` + ${t('main.expPendingCount', { n: data.estPending })}` : ''}` : t('main.expToQuote'))}</b></div>`;
        box.hidden = false;
    };
    const refreshEstimate = () => {
        showError('');
        clearTimeout(estimateTimer);
        estimateTimer = setTimeout(async () => {
            const items = read();
            const seq = ++estimateSeq;
            if (!items.length) { drawEstimate(null); return; }
            try { const data = await api(`${API}/estimate`, { method: 'POST', body: JSON.stringify({ items }) }); if (seq === estimateSeq) drawEstimate(data); } catch (err) { if (seq === estimateSeq) drawEstimate(null); }
        }, 250);
    };
    modal.overlay.addEventListener('change', (event) => {
        const pick = event.target.dataset && event.target.dataset.pick;
        if (pick) modal.overlay.querySelector(`[data-type="${pick}"] .exp-type-body`).hidden = !event.target.checked;
        refreshEstimate();
    });
    modal.overlay.addEventListener('input', refreshEstimate);
    modal.$('#exp-close').addEventListener('click', modal.close);
    const ERRORS = { EMPTY: 'main.expErrEmpty', QTY: 'main.expErrQty', DEPARTMENTS: 'main.expErrDepartments', APP: 'main.expErrApp', GIRO: 'main.expErrGiro', TEXT: 'main.expErrText', FORBIDDEN: 'main.expErrForbidden' };
    modal.$('#exp-send').addEventListener('click', async () => {
        const items = read();
        if (!items.length) { showError(t('main.expErrEmpty')); return; }
        const btn = modal.$('#exp-send');
        btn.disabled = true;
        try {
            await api(API, { method: 'POST', body: JSON.stringify({ items, note: modal.$('#exp-note').value.trim() }) });
            Dashboard.showToast(t('main.expSent'), 'success');
            modal.close();
            refreshTable();
        } catch (err) {
            const code = err.body && err.body.code;
            showError(ERRORS[code] ? t(ERRORS[code]) : (err.status === 403 ? t('main.expErrForbidden') : t('main.expSaveError')));
            btn.disabled = false;
        }
    });
}

// El detalle de una solicitud: lo que se pidió con su estimado, el comentario, el costo final y la nota de SaaS, y el seguimiento.
function openDetail(r) {
    const items = r.items.map((i) => `<div class="exp-est-row"><span>${esc(itemText(i))}</span><b>${i.est === null || i.est === undefined ? esc(t('main.expToQuote')) : esc(money(i.est, r.currency))}</b></div>`).join('');
    const events = (r.events || []).map((e) => `<li class="exp-step">${statusChip(e.status)}<span class="exp-step-meta">${esc(dateTime(e.at))}${e.by ? ` · ${esc(t('main.solStepBy', { by: e.by }))}` : ''}</span>${e.note ? `<div class="exp-step-note">${esc(e.note)}</div>` : ''}</li>`).join('');
    const modal = makeModal(`<div class="exp-detail-head"><h3>${esc(r.label)}</h3>${statusChip(r.status)}</div>
        <div class="exp-est-box">${items}<div class="exp-est-total"><span>${esc(t('main.colExpEstimado'))}</span><b>${esc(estimateText(r))}</b></div>
        ${r.finalCost === null || r.finalCost === undefined ? '' : `<div class="exp-est-total exp-final"><span>${esc(t('main.colExpFinal'))}</span><b>${esc(money(r.finalCost, r.currency))}</b></div>`}</div>
        ${r.note ? `<p class="exp-note"><b>${esc(t('main.expYourNote'))}:</b> ${esc(r.note)}</p>` : ''}
        ${r.saasNote ? `<p class="exp-note"><b>${esc(t('main.colExpNota'))}:</b> ${esc(r.saasNote)}</p>` : ''}
        <h4 class="exp-sub">${esc(t('main.expTimeline'))}</h4><ol class="exp-timeline">${events}</ol>
        <div class="admin-form-actions"><button type="button" class="btn btn-secondary" id="exp-detail-close">${esc(t('main.solClose'))}</button></div>`);
    modal.$('#exp-detail-close').addEventListener('click', modal.close);
}

// «+ Pedir ampliación»: solo si puede pedir (administrador o con el botón en su árbol).
function mountNewButton() {
    const toolbar = document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling;
    if (!toolbar || toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.setAttribute('data-help-key', 'expPedir');
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${esc(t('main.expNew'))}</span>`;
    btn.addEventListener('click', () => { if (!state.canRequest) { Dashboard.showToast(t('main.expErrForbidden'), 'warning'); return; } openForm(); });
    toolbar.prepend(btn);
}

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
        mountNewButton();
        timer = setInterval(() => { if (!document.querySelector('.exp-overlay')) refreshTable(true); }, 60000); // el estatus cambia cuando SaaS responde: se vuelve a leer cada minuto
    } catch (err) {
        console.error('Expansiones failed to initialize:', err);
    }
})();
})();
