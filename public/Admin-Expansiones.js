// ---------------------------------------------------------------------------
// Servicio a Cliente › Expansiones (lado SaaS): la bandeja con las solicitudes de ampliar el contrato de TODOS los clientes (las que piden en TI › Configuración Compañía › Expansiones). Pestañas: «Por atender» (pedidas, en negociación
// o aprobadas), «Cerradas» (aplicadas o rechazadas) y «Todas». SaaS las mueve a mano: pasar a negociación, fijar el costo final (con descuentos), aprobar, marcar aplicada al contrato o rechazar con su motivo; cada botón se da en el árbol de
// accesos de la cuenta (Equipo SaaS). El cliente ve el estatus, el costo final y la nota; el cambio en el contrato se hace aparte, en Nuestros Clientes. Las filas salen del servidor (GET /api/admin/expansions). Trae las columnas de Control Interno.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'expansiones-saas';
const API = '/api/admin/expansions';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const SEARCH_COLUMNS = ['folio', 'client', 'what', 'status', 'note'];
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
const money = (amount, currency) => Dashboard.formatCurrency(amount, currency || 'MXN');
const dateTime = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }); };
const deptName = (key) => { const d = (Dashboard.DEPARTMENTS || []).find((x) => x.key === key); return d ? t(d.labelKey) : key; };
const state = { requests: [], counts: { open: 0, closed: 0, all: 0 }, can: {}, tab: 'open' };

// Cómo se escribe un renglón de la solicitud (los mismos textos que ve el cliente).
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

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-expansiones-saas' });
        if (!role) return;
        await load();
        document.querySelector('.ss-tabs').addEventListener('click', (event) => {
            const btn = event.target.closest('[data-ss-tab]');
            if (!btn) return;
            state.tab = btn.dataset.ssTab;
            renderTabs();
            renderRows();
        });
        document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFilters);
        document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFilters);
        setInterval(() => { if (!document.hidden && !document.querySelector('.exp-overlay')) load().catch(() => {}); }, 30000);
    } catch (err) {
        console.error('Expansiones (SaaS) failed to initialize:', err);
    }
})();

async function load() {
    const res = await fetch(API, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    const errEl = document.getElementById('ss-error');
    if (!res.ok) { errEl.textContent = body.message || Dashboard.t('admin.saveError'); errEl.hidden = false; return; }
    errEl.hidden = true;
    state.requests = body.requests; state.counts = body.counts; state.can = body.can || {};
    renderTabs();
    renderRows();
}
function renderTabs() {
    document.querySelectorAll('[data-ss-tab]').forEach((btn) => {
        const on = btn.dataset.ssTab === state.tab;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-selected', String(on));
    });
    ['open', 'closed', 'all'].forEach((k) => { document.getElementById(`ss-count-${k}`).textContent = String(state.counts[k] || 0); });
}
const OPEN = ['pending', 'negotiating', 'approved'];
const visible = () => state.requests.filter((r) => (state.tab === 'open' ? OPEN.includes(r.status) : (state.tab === 'closed' ? !OPEN.includes(r.status) : true)));

function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
// Las 13 columnas de Control Interno: la empresa del cliente, el área, el módulo, la pantalla y el momento en que se pidió.
function systemCells(r) {
    const d = new Date(`${String(r.createdAt).replace(' ', 'T')}Z`);
    const pad = (n) => String(n).padStart(2, '0');
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const start = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((Math.floor((d - start) / 86400000) + start.getDay() + 1) / 7);
    const values = {
        colSysEmpresa: r.client, colSysArea: 'Configuración Compañía', colSysModulo: 'Tecnologías de la Información', colSysPantalla: t('menu.saasExpansions'), colSysCentroCostos: '',
        colSysFecha: `${pad(d.getDate())}/${months[d.getMonth()]}/${d.getFullYear()}`, colSysDiaNum: pad(d.getDate()), colSysDiaTexto: days[d.getDay()], colSysMesNum: pad(d.getMonth() + 1), colSysMesTexto: months[d.getMonth()],
        colSysAnio: String(d.getFullYear()), colSysSemana: `Sem${week}_${d.getFullYear()}`, colSysHora: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    };
    return SYSTEM_COLUMN_KEYS.map((key) => cell(key, values[key], 'col-system'));
}
const ACTIONS = { negotiating: ['negotiate', 'admin.saasExpNegotiate'], approved: ['approve', 'admin.saasExpApprove'], applied: ['apply', 'admin.saasExpApply'], rejected: ['reject', 'admin.saasExpReject'] };
function actionsCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const add = (label, kind, extra) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary sc-mini';
        btn.dataset.expAct = kind;
        btn.dataset.expId = String(r.id);
        if (extra) btn.dataset.expTo = extra;
        btn.textContent = label;
        td.appendChild(btn);
    };
    add(t('main.expView'), 'view');
    if (r.canCost) add(t('admin.saasExpCost'), 'cost');
    (r.next || []).forEach((to) => add(t(ACTIONS[to][1]), 'move', to));
    const history = document.createElement('button');
    history.type = 'button';
    history.className = 'admin-icon-btn';
    history.setAttribute('data-help-key', 'changeHistory');
    history.setAttribute('aria-label', t('main.solHistory'));
    history.title = t('main.solHistory');
    history.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    history.addEventListener('click', () => Dashboard.openChangeHistoryWithRows(t('main.changeHistoryTitleRecord'), Dashboard.saasTableChangesLoader(TABLE_KEY, r.id)));
    td.appendChild(history);
    return td;
}
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id);
    const folio = cell('folio', r.label);
    if (r.isTest) folio.insertAdjacentHTML('beforeend', ` <span class="exp-chip">${esc(t('admin.saasExpTest'))}</span>`);
    const status = document.createElement('td');
    status.dataset.col = 'status';
    status.innerHTML = statusChip(r.status);
    tr.append(
        ...systemCells(r),
        folio, cell('client', r.client), cell('what', r.items.map(itemText).join(' · ')), status, cell('estimated', estimateText(r)),
        cell('final', r.finalCost === null || r.finalCost === undefined ? '' : money(r.finalCost, r.currency)), cell('note', r.saasNote), actionsCell(r),
    );
    return tr;
}
function getTbody() { return document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0]; }
function ensureEmptyState(tbody) {
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
function renderRows() {
    const tbody = getTbody();
    tbody.innerHTML = '';
    const list = visible();
    if (!list.length) { ensureEmptyState(tbody); return; }
    const fragment = document.createDocumentFragment();
    list.forEach((r) => fragment.appendChild(buildRow(r)));
    tbody.appendChild(fragment);
    applyFilters();
}
function applyFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    getTbody().querySelectorAll('tr').forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        if (!text) { tr.hidden = false; return; }
        const haystack = SEARCH_COLUMNS.map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '').join(' ');
        tr.hidden = !SearchSyntax.matches('contains', text, haystack);
    });
}
Dashboard.registerSaasTableHistory(TABLE_KEY, 'main.changeHistoryTitle', Dashboard.saasTableChangesLoader(TABLE_KEY));

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
function itemsHtml(r) {
    const rows = r.items.map((i) => `<div class="exp-est-row"><span>${esc(itemText(i))}</span><b>${i.est === null || i.est === undefined ? esc(t('main.expToQuote')) : esc(money(i.est, r.currency))}</b></div>`).join('');
    return `<div class="exp-est-box">${rows}<div class="exp-est-total"><span>${esc(t('admin.saasExpEstimated'))}</span><b>${esc(estimateText(r))}</b></div>${r.finalCost === null || r.finalCost === undefined ? '' : `<div class="exp-est-total exp-final"><span>${esc(t('main.colExpFinal'))}</span><b>${esc(money(r.finalCost, r.currency))}</b></div>`}</div>`;
}
function openDetail(r) {
    const events = (r.events || []).map((e) => `<li class="exp-step">${statusChip(e.status)}<span class="exp-step-meta">${esc(dateTime(e.at))}${e.by ? ` · ${esc(t('main.solStepBy', { by: e.by }))}` : ''}</span>${e.note ? `<div class="exp-step-note">${esc(e.note)}</div>` : ''}</li>`).join('');
    const modal = makeModal(`<div class="exp-detail-head"><h3>${esc(r.label)} · ${esc(r.client)}</h3>${statusChip(r.status)}</div>
        ${itemsHtml(r)}
        ${r.note ? `<p class="exp-note"><b>${esc(t('main.expYourNote'))}:</b> ${esc(r.note)}</p>` : ''}
        <h4 class="exp-sub">${esc(t('main.expTimeline'))}</h4><ol class="exp-timeline">${events}</ol>
        <div class="admin-form-actions"><button type="button" class="btn btn-secondary" id="exp-x">${esc(t('admin.saasExpClose'))}</button></div>`);
    modal.$('#exp-x').addEventListener('click', modal.close);
}
async function call(method, path, body) {
    const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
    return out;
}
function explain(err) {
    const code = err.body && err.body.code;
    const key = `admin.saasExpErr_${code}`;
    const text = Dashboard.t(key);
    return text !== key ? text : t('admin.saasExpErr_default');
}
// Pasar a otro estatus: con una nota para el cliente (obligatoria al rechazar) y, al marcarla aplicada, el recordatorio de hacer el cambio en Nuestros Clientes.
function openMove(r, to) {
    const reject = to === 'rejected';
    const modal = makeModal(`<h3>${esc(t(ACTIONS[to][1]))} · ${esc(r.label)}</h3>
        <p class="sub">${esc(r.client)} · ${esc(r.items.map(itemText).join(' · '))}</p>
        ${to === 'approved' ? `<div class="exp-est-total exp-final"><span>${esc(t('main.colExpFinal'))}</span><b>${esc(r.finalCost == null ? '—' : money(r.finalCost, r.currency))}</b></div>` : ''}
        ${to === 'applied' ? `<p class="exp-note">${esc(t('admin.saasExpApplyHint'))} <a href="Admin-SaaS.html">${esc(t('admin.saasExpOpenClients'))}</a></p>` : ''}
        <div class="admin-field"><label for="exp-move-note">${esc(t(reject ? 'admin.saasExpRejectReason' : 'admin.saasExpNote'))}</label><textarea id="exp-move-note" rows="3" maxlength="600"></textarea></div>
        <p class="admin-error" id="exp-move-error" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" id="exp-ok">${esc(t('admin.saasExpConfirm'))}</button><button type="button" class="btn btn-secondary" id="exp-x">${esc(t('admin.saasExpClose'))}</button></div>`);
    modal.$('#exp-x').addEventListener('click', modal.close);
    modal.$('#exp-ok').addEventListener('click', async () => {
        const note = modal.$('#exp-move-note').value.trim();
        const errorEl = modal.$('#exp-move-error');
        if (reject && !note) { errorEl.textContent = t('admin.saasExpErr_NOTE'); errorEl.hidden = false; return; }
        modal.$('#exp-ok').disabled = true;
        try {
            await call('POST', `${API}/${r.id}/move`, { to, note });
            modal.close();
            Dashboard.showToast(t('admin.saasExpDone'), 'success');
            await load();
        } catch (err) {
            errorEl.textContent = explain(err);
            errorEl.hidden = false;
            modal.$('#exp-ok').disabled = false;
            if (err.body && err.body.code === 'STATE') load().catch(() => {});
        }
    });
}
// El costo final con los descuentos que se acordaron al negociar.
function openCost(r) {
    const modal = makeModal(`<h3>${esc(t('admin.saasExpCost'))} · ${esc(r.label)}</h3>
        <p class="sub">${esc(r.client)} · ${esc(t('admin.saasExpEstimated'))}: ${esc(estimateText(r))}</p>
        <div class="admin-field" data-help-key="saasExpCost"><label for="exp-cost">${esc(t('admin.saasExpFinalCost'))} (${esc(r.currency || 'MXN')})</label><input id="exp-cost" type="number" min="0" step="0.01" value="${r.finalCost == null ? '' : esc(r.finalCost)}"></div>
        <div class="admin-field"><label for="exp-cost-note">${esc(t('admin.saasExpNote'))}</label><textarea id="exp-cost-note" rows="3" maxlength="600"></textarea></div>
        <p class="admin-error" id="exp-cost-error" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" id="exp-ok">${esc(t('admin.saasExpConfirm'))}</button><button type="button" class="btn btn-secondary" id="exp-x">${esc(t('admin.saasExpClose'))}</button></div>`);
    modal.$('#exp-x').addEventListener('click', modal.close);
    modal.$('#exp-ok').addEventListener('click', async () => {
        const errorEl = modal.$('#exp-cost-error');
        modal.$('#exp-ok').disabled = true;
        try {
            await call('PUT', `${API}/${r.id}/cost`, { finalCost: modal.$('#exp-cost').value, note: modal.$('#exp-cost-note').value.trim() });
            modal.close();
            Dashboard.showToast(t('admin.saasExpDone'), 'success');
            await load();
        } catch (err) {
            errorEl.textContent = explain(err);
            errorEl.hidden = false;
            modal.$('#exp-ok').disabled = false;
            if (err.body && err.body.code === 'STATE') load().catch(() => {});
        }
    });
}
document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-exp-act]');
    if (!btn) return;
    const r = state.requests.find((x) => x.id === Number(btn.dataset.expId));
    if (!r) return;
    if (btn.dataset.expAct === 'view') openDetail(r);
    else if (btn.dataset.expAct === 'cost') openCost(r);
    else openMove(r, btn.dataset.expTo);
});
})();
