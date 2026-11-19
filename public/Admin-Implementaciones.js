// ---------------------------------------------------------------------------
// Servicio a Cliente › Implementaciones (lado SaaS): el implementador lleva la implementación de cada compañía. Una fila por compañía (que no esté inactiva) con quién la implementa, de cuándo a cuándo va su cronograma, el nivel que sigue y su
// avance. Pestañas: Sin iniciar, En curso, Terminadas y Todas. «Iniciar implementación» crea los 10 niveles en orden y elige al implementador; «Cronograma» abre los niveles para fijar las fechas de cada uno y marcar lo terminado (el siguiente
// nivel se abre al completar el anterior; los opcionales, como la API, pueden quedar «No aplica» sin bloquear). Cada botón se da en el árbol de accesos de la cuenta (Equipo SaaS); «implementador» = cualquier cuenta con esta pantalla.
// La compañía lo consulta en TI › Implementación Inicial › Cronograma. Las filas salen del servidor (GET /api/admin/implementations). Trae las columnas de Control Interno.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'implementaciones-saas';
const API = '/api/admin/implementations';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const SEARCH_COLUMNS = ['client', 'status', 'implementer', 'level'];
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
const stampDay = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }); };
const dayOf = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d); };
const shortDate = (ymd) => (ymd ? dayOf(ymd).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const levelName = (key) => { const name = t(`main.implLevelName_${key}`); return name.startsWith('main.') ? key : name; };
const state = { rows: [], counts: { none: 0, active: 0, closed: 0, all: 0 }, can: {}, implementers: [], tab: null };

const statusChip = (status) => `<span class="exp-chip exp-chip-${{ none: 'cancelled', active: 'negotiating', closed: 'approved' }[status] || 'cancelled'}">${esc(t(`main.implRowStatus_${status}`))}</span>`;
const levelText = (r) => (r.currentKey ? levelName(r.currentKey) : (r.started ? t('main.implState_done') : ''));

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-implementaciones-saas' });
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
        setInterval(() => { if (!document.hidden && !document.querySelector('.exp-overlay')) load().catch(() => {}); }, 60000);
    } catch (err) {
        console.error('Implementaciones (SaaS) failed to initialize:', err);
    }
})();

async function load() {
    const res = await fetch(API, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    const errEl = document.getElementById('ss-error');
    if (!res.ok) { errEl.textContent = body.message || Dashboard.t('admin.saveError'); errEl.hidden = false; return; }
    errEl.hidden = true;
    state.rows = body.rows; state.counts = body.counts; state.can = body.can || {}; state.implementers = body.implementers || [];
    // la primera vez se abre donde hay trabajo: las que van en curso, o las que faltan por iniciar
    if (!state.tab) state.tab = state.counts.active ? 'active' : (state.counts.none ? 'none' : 'all');
    renderTabs();
    renderRows();
}
function renderTabs() {
    document.querySelectorAll('[data-ss-tab]').forEach((btn) => {
        const on = btn.dataset.ssTab === state.tab;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-selected', String(on));
    });
    ['none', 'active', 'closed', 'all'].forEach((k) => { document.getElementById(`ss-count-${k}`).textContent = String(state.counts[k] || 0); });
}
const visible = () => state.rows.filter((r) => state.tab === 'all' || r.status === state.tab);

function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
// Las 13 columnas de Control Interno: la empresa de la compañía, el área, el módulo, la pantalla y el momento en que se inició la implementación (o se dio de alta la compañía).
function systemCells(r) {
    const d = new Date(`${String(r.createdAt).replace(' ', 'T')}Z`);
    const pad = (n) => String(n).padStart(2, '0');
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const start = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((Math.floor((d - start) / 86400000) + start.getDay() + 1) / 7);
    const values = {
        colSysEmpresa: r.client, colSysArea: 'Implementación Inicial', colSysModulo: 'Tecnologías de la Información', colSysPantalla: t('menu.saasImplementations'), colSysCentroCostos: '',
        colSysFecha: `${pad(d.getDate())}/${months[d.getMonth()]}/${d.getFullYear()}`, colSysDiaNum: pad(d.getDate()), colSysDiaTexto: days[d.getDay()], colSysMesNum: pad(d.getMonth() + 1), colSysMesTexto: months[d.getMonth()],
        colSysAnio: String(d.getFullYear()), colSysSemana: `Sem${week}_${d.getFullYear()}`, colSysHora: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    };
    return SYSTEM_COLUMN_KEYS.map((key) => cell(key, values[key], 'col-system'));
}
function actionsCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const add = (label, kind) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary sc-mini';
        btn.dataset.implAct = kind;
        btn.dataset.implClient = String(r.clientId);
        btn.textContent = label;
        td.appendChild(btn);
    };
    if (r.actions.start) add(t('admin.saasImplStart'), 'start');
    if (r.actions.open) add(t('admin.saasImplOpen'), 'open');
    const history = document.createElement('button');
    history.type = 'button';
    history.className = 'admin-icon-btn';
    history.setAttribute('data-help-key', 'changeHistory');
    history.setAttribute('aria-label', t('main.solHistory'));
    history.title = t('main.solHistory');
    history.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    history.addEventListener('click', () => Dashboard.openChangeHistoryWithRows(t('main.changeHistoryTitleRecord'), Dashboard.saasTableChangesLoader(TABLE_KEY, r.clientId)));
    td.appendChild(history);
    return td;
}
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.clientId);
    const status = document.createElement('td');
    status.dataset.col = 'status';
    const finishKey = r.finishStatus === 'ready' ? 'main.implRowFinish_ready' : (r.finishStatus === 'awaiting' ? (r.finishMissing.includes('client') ? 'main.implRowFinish_awaiting_client' : 'main.implRowFinish_awaiting_saas') : '');
    status.innerHTML = `${statusChip(r.status)}${r.late ? ` <span class="exp-chip exp-chip-pending">${esc(t('main.implState_late'))}</span>` : ''}${finishKey ? ` <span class="exp-chip exp-chip-negotiating">${esc(t(finishKey))}</span>` : ''}`;
    tr.append(
        ...systemCells(r),
        cell('client', r.client), status, cell('implementer', r.implementer), cell('start', shortDate(r.startDate)), cell('end', shortDate(r.endDate)), cell('level', levelText(r)),
        cell('progress', r.started ? `${r.progress}% · ${t('main.implProgressOf', { done: r.done, total: r.total })}` : ''), actionsCell(r),
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
    overlay.innerHTML = `<div class="modal-panel exp-panel impl-panel" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    return { overlay, close, $: (sel) => overlay.querySelector(sel) };
}
async function call(method, path, body) {
    const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
    return out;
}
function explain(err) {
    const code = err.body && err.body.code;
    const key = `admin.saasImplErr_${code}`;
    const text = Dashboard.t(key);
    return text !== key ? text : t('admin.saasImplErr_default');
}
const implementerOptions = (selectedId) => `<option value="">${esc(t('admin.saasImplUnassigned'))}</option>${state.implementers.map((u) => `<option value="${u.id}"${u.id === selectedId ? ' selected' : ''}>${esc(u.name || u.username)}</option>`).join('')}`;

// «Iniciar implementación»: se crean los 10 niveles en orden y se elige quién implementa.
function openStart(row) {
    const modal = makeModal(`<h3>${esc(t('admin.saasImplStartTitle', { client: row.client }))}</h3>
        <div class="admin-field" data-help-key="saasImplStart"><label for="impl-implementer">${esc(t('admin.saasImplField'))}</label><select id="impl-implementer">${implementerOptions(null)}</select></div>
        <p class="admin-error" id="impl-error" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" id="impl-ok">${esc(t('admin.saasImplConfirmStart'))}</button><button type="button" class="btn btn-secondary" id="impl-x">${esc(t('admin.saasImplClose'))}</button></div>`);
    modal.$('#impl-x').addEventListener('click', modal.close);
    modal.$('#impl-ok').addEventListener('click', async () => {
        const errorEl = modal.$('#impl-error');
        modal.$('#impl-ok').disabled = true;
        try {
            await call('POST', `${API}/${row.clientId}/start`, { implementerUserId: Number(modal.$('#impl-implementer').value) || null });
            modal.close();
            Dashboard.showToast(t('admin.saasImplDone'), 'success');
            await load();
        } catch (err) {
            errorEl.textContent = explain(err);
            errorEl.hidden = false;
            modal.$('#impl-ok').disabled = false;
            if (err.body && err.body.code === 'EXISTS') load().catch(() => {});
        }
    });
}

// El motivo de un rechazo de la finalización (obligatorio): se pide en una ventana aparte y se manda con onSend(nota).
function openFinishReject(row, onSend) {
    const modal = makeModal(`<h3>${esc(t('admin.saasImplFinishReject'))} · ${esc(row.client)}</h3>
        <div class="admin-field"><label for="impl-reject-note">${esc(t('main.implFinishRejectReason'))}</label><textarea id="impl-reject-note" rows="3" maxlength="600"></textarea></div>
        <p class="admin-error" id="impl-reject-error" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" id="impl-reject-ok">${esc(t('main.implFinishSend'))}</button><button type="button" class="btn btn-secondary" id="impl-reject-x">${esc(t('admin.saasImplClose'))}</button></div>`);
    modal.$('#impl-reject-x').addEventListener('click', modal.close);
    modal.$('#impl-reject-ok').addEventListener('click', async () => {
        const note = modal.$('#impl-reject-note').value.trim();
        const errorEl = modal.$('#impl-reject-error');
        if (!note) { errorEl.textContent = t('admin.saasImplErr_NOTE'); errorEl.hidden = false; return; }
        modal.$('#impl-reject-ok').disabled = true;
        try { await onSend(note); modal.close(); } catch (err) { errorEl.textContent = explain(err); errorEl.hidden = false; modal.$('#impl-reject-ok').disabled = false; }
    });
}
// «Cronograma»: los 10 niveles con sus fechas (se editan aquí) y lo que se puede hacer con cada uno según el orden.
async function openDetail(row) {
    const modal = makeModal(`<h3>${esc(t('admin.saasImplDetailTitle', { client: row.client }))}</h3><div id="impl-body"><p class="exp-note">…</p></div>`);
    let detail = null;
    const draft = {}; // fechas escritas que todavía no se guardan: sobreviven a volver a dibujar
    const expanded = new Set(); // los niveles con sus renglones abiertos (al principio, el que está en curso)
    let seeded = false;
    const body = () => modal.$('#impl-body');
    const showError = (text) => { const el = modal.$('#impl-error'); if (el) { el.textContent = text; el.hidden = !text; } };
    const draw = () => {
        const impl = detail.implementation;
        if (!seeded) { if (impl.currentKey) expanded.add(impl.currentKey); seeded = true; }
        const open = impl.status === 'active';
        const canDates = open && detail.can.edit;
        const taskName = (l, task) => { if (task.labelKey) return t(task.labelKey); const name = t(`main.implTask_${l.key}_${task.key}`); return name.startsWith('main.') ? task.key : name; };
        const taskRows = (l) => `<tr class="impl-task-row"><td colspan="5"><div class="impl-subtasks" data-help-key="saasImplTasks">${l.tasks.map((task) => {
            const acts = [
                task.actions.done ? `<button type="button" class="btn btn-secondary sc-mini" data-lv="${l.key}" data-task="${task.key}" data-do="done">${esc(t(l.key === 'training' ? 'admin.saasImplTrainDone' : 'admin.saasImplTaskDone'))}</button>` : '',
                task.actions.na ? `<button type="button" class="btn btn-secondary sc-mini" data-lv="${l.key}" data-task="${task.key}" data-do="na">${esc(t('admin.saasImplTaskNa'))}</button>` : '',
                task.actions.reopen ? `<button type="button" class="btn btn-secondary sc-mini" data-lv="${l.key}" data-task="${task.key}" data-do="reopen">${esc(t('admin.saasImplTaskReopen'))}</button>` : '',
            ].join('');
            // Capacitación: el módulo está «En curso» si ya tiene sesiones realizadas; se muestra cómo va (personas, sesiones y capacitadas)
            const training = l.key === 'training';
            const trainState = task.status === 'done' ? 'done' : (task.status === 'na' ? 'na' : (task.stats && task.stats.sessionsDone > 0 ? 'in_progress' : 'pending'));
            const tone = training ? { done: 'approved', in_progress: 'negotiating', pending: 'pending', na: 'cancelled' }[trainState] : { pending: 'pending', done: 'approved', na: 'cancelled' }[task.status];
            const chipText = training ? t(`main.implTrainState_${trainState}`) : t(`main.implTaskState_${task.status}`);
            const stats = training && task.stats ? `<small class="impl-subtask-stats">${esc(t('admin.saasImplTrainStats', { users: task.stats.users, sessions: task.stats.sessionsDone, trained: task.stats.trained }))}</small>` : '';
            return `<div class="impl-subtask"><span class="exp-chip exp-chip-${tone}">${esc(chipText)}</span><span class="impl-subtask-name">${esc(taskName(l, task))}${stats}</span><span class="impl-acts">${acts}</span></div>`;
        }).join('')}</div></td></tr>`;
        // el cierre: lo confirman las dos partes con todos los niveles completos; la segunda confirmación finaliza la implementación
        const f = impl.finish;
        const sideName = (side) => t(side === 'client' ? 'main.implSideClient' : 'main.implSideSaas');
        const party = (side) => t(side === 'client' ? 'main.implPartyClient' : 'main.implPartySaas');
        const confirmation = (side) => {
            const at = side === 'client' ? f.clientConfirmedAt : f.saasConfirmedAt;
            const by = side === 'client' ? f.clientConfirmedBy : f.saasConfirmedBy;
            return at ? t('main.implFinishConfirmedBy', { who: party(side), date: stampDay(at), by: by || '—' }) : t('main.implFinishPending', { who: party(side) });
        };
        let finishStatus;
        if (f.status === 'closed') finishStatus = t('main.implFinishClosed', { date: stampDay(f.closedAt) });
        else if (f.status === 'blocked') finishStatus = t('main.implFinishBlocked');
        else if (f.missing.length === 2) finishStatus = `${t('main.implFinishReady')} · ${t('main.implFinishAwaitingBoth')}`;
        else finishStatus = t(f.missing[0] === 'client' ? 'main.implFinishAwaitingClient' : 'main.implFinishAwaitingSaas');
        const finishTone = { closed: 'approved', blocked: 'cancelled', ready: 'negotiating', awaiting: 'negotiating' }[f.status] || 'cancelled';
        const finishButtons = [
            f.canFinalize && detail.can.finish && !f.saasConfirmedAt ? `<button type="button" class="btn btn-secondary sc-mini" data-fin="confirm">${esc(t('admin.saasImplFinishConfirm'))}</button>` : '',
            f.canFinalize && detail.can.rejectFinish ? `<button type="button" class="btn btn-secondary sc-mini" data-fin="reject">${esc(t('admin.saasImplFinishReject'))}</button>` : '',
        ].join('');
        const finishRejection = f.rejection && f.status !== 'closed' ? `<span class="impl-sub impl-rejected">${esc(t('main.implFinishRejected', { who: sideName(f.rejection.side), date: stampDay(f.rejection.at), note: f.rejection.note }))}</span>` : '';
        const finishHtml = `<div class="impl-card impl-finish" data-help-key="saasImplFinish"><div class="impl-finish-head"><h4>${esc(t('admin.saasImplFinishTitle'))}</h4><span class="exp-chip exp-chip-${finishTone}">${esc(finishStatus)}</span></div>
            ${f.status === 'blocked' ? '' : `<span class="impl-sub">${esc(confirmation('client'))}</span><span class="impl-sub">${esc(confirmation('saas'))}</span>`}${finishRejection}${finishButtons ? `<div class="impl-inline">${finishButtons}</div>` : ''}</div>`;
        const rows = impl.levels.map((l) => {
            const d = draft[l.key] || { start: l.startDate, end: l.endDate };
            const actions = [
                l.actions.done ? `<button type="button" class="btn btn-secondary sc-mini" data-lv="${l.key}" data-do="done">${esc(t('admin.saasImplMarkDone'))}</button>` : '',
                l.actions.na ? `<button type="button" class="btn btn-secondary sc-mini" data-lv="${l.key}" data-do="na">${esc(t('admin.saasImplMarkNa'))}</button>` : '',
                l.actions.reopen ? `<button type="button" class="btn btn-secondary sc-mini" data-lv="${l.key}" data-do="reopen">${esc(t('admin.saasImplReopen'))}</button>` : '',
            ].join('');
            const stateChip = `<span class="exp-chip exp-chip-${{ done: 'approved', current: 'negotiating', locked: 'cancelled', na: 'cancelled' }[l.state]}">${esc(t(`main.implState_${l.state}`))}</span>${l.late ? ` <span class="exp-chip exp-chip-pending">${esc(t('main.implState_late'))}</span>` : ''}`;
            const toggle = l.tasks.length ? `<button type="button" class="impl-toggle" data-toggle="${l.key}" aria-expanded="${expanded.has(l.key)}">${expanded.has(l.key) ? '▾' : '▸'} ${esc(t('admin.saasImplTasks'))} (${l.tasksDone}/${l.tasksTotal})</button>` : '';
            return `<tr><td><b>${l.position}</b> · ${esc(levelName(l.key))}${toggle}</td>
                <td><input type="date" data-date="start" data-lv="${l.key}" value="${esc(d.start)}" aria-label="${esc(t('admin.saasImplStartDate'))}"${canDates ? '' : ' disabled'}></td>
                <td><input type="date" data-date="end" data-lv="${l.key}" value="${esc(d.end)}" aria-label="${esc(t('admin.saasImplEndDate'))}"${canDates ? '' : ' disabled'}></td>
                <td>${stateChip}</td><td class="impl-acts">${actions}</td></tr>${l.tasks.length && expanded.has(l.key) ? taskRows(l) : ''}`;
        }).join('');
        body().innerHTML = `<div class="admin-field impl-implementer" data-help-key="saasImplStart"><label for="impl-implementer">${esc(t('admin.saasImplField'))}</label>
            <div class="impl-inline"><select id="impl-implementer"${open && detail.can.edit ? '' : ' disabled'}>${implementerOptions(impl.implementerUserId)}</select>
            ${open && detail.can.edit ? `<button type="button" class="btn btn-secondary sc-mini" id="impl-save-implementer">${esc(t('admin.saasImplSaveImplementer'))}</button>` : ''}</div></div>
            ${finishHtml}
            <div class="impl-table-wrap" data-help-key="saasImplDates"><table class="impl-table"><thead><tr><th>${esc(t('admin.saasImplLevel'))}</th><th>${esc(t('admin.saasImplStartDate'))}</th><th>${esc(t('admin.saasImplEndDate'))}</th><th data-help-key="saasImplMark">${esc(t('admin.saasImplState'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
            <p class="admin-error" id="impl-error" hidden></p>
            <div class="admin-form-actions">${canDates ? `<button type="button" class="btn" id="impl-save-dates">${esc(t('admin.saasImplSaveDates'))}</button>` : ''}<button type="button" class="btn btn-secondary" id="impl-x">${esc(t('admin.saasImplClose'))}</button></div>`;
        modal.$('#impl-x').addEventListener('click', modal.close);
    };
    const reload = async () => { detail = await call('GET', `${API}/${row.clientId}`); draw(); };
    const guard = async (fn) => {
        try { await fn(); } catch (err) {
            showError(explain(err));
            if (err.body && ['ORDER', 'ORDER_LATER', 'ALREADY', 'CLOSED', 'LOCKED', 'LEVEL_CLOSED', 'TASKS_PENDING', 'NO_SESSION', 'NOT_READY', 'ALREADY_CONFIRMED'].includes(err.body.code)) { await reload().catch(() => {}); showError(explain(err)); }
        }
    };
    try { await reload(); } catch (err) { body().innerHTML = `<p class="admin-error">${esc(explain(err))}</p>`; return; }
    modal.overlay.addEventListener('input', (event) => {
        const el = event.target;
        if (!el.dataset || !el.dataset.date) return;
        const key = el.dataset.lv;
        const level = detail.implementation.levels.find((l) => l.key === key);
        draft[key] = draft[key] || { start: level.startDate, end: level.endDate };
        draft[key][el.dataset.date] = el.value;
    });
    modal.overlay.addEventListener('click', (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;
        if (btn.dataset.fin === 'confirm') {
            guard(async () => {
                detail = await call('POST', `${API}/${row.clientId}/finish/confirm`, {});
                draw();
                Dashboard.showToast(t('admin.saasImplDone'), 'success');
                await load();
            });
        } else if (btn.dataset.fin === 'reject') {
            openFinishReject(row, async (note) => {
                detail = await call('POST', `${API}/${row.clientId}/finish/reject`, { note });
                draw();
                Dashboard.showToast(t('admin.saasImplDone'), 'success');
                await load();
            });
        } else if (btn.dataset.toggle) {
            if (expanded.has(btn.dataset.toggle)) expanded.delete(btn.dataset.toggle); else expanded.add(btn.dataset.toggle);
            draw();
        } else if (btn.dataset.task) {
            guard(async () => {
                detail = await call('POST', `${API}/${row.clientId}/levels/${btn.dataset.lv}/tasks/${btn.dataset.task}/${btn.dataset.do}`, {});
                draw();
                await load();
            });
        } else if (btn.dataset.do) {
            guard(async () => {
                detail = await call('POST', `${API}/${row.clientId}/levels/${btn.dataset.lv}/${btn.dataset.do}`, {});
                draw();
                await load();
            });
        } else if (btn.id === 'impl-save-implementer') {
            guard(async () => {
                detail = await call('PUT', `${API}/${row.clientId}/implementer`, { implementerUserId: Number(modal.$('#impl-implementer').value) || null });
                draw();
                Dashboard.showToast(t('admin.saasImplDone'), 'success');
                await load();
            });
        } else if (btn.id === 'impl-save-dates') {
            guard(async () => {
                const levels = detail.implementation.levels.map((l) => { const d = draft[l.key] || { start: l.startDate, end: l.endDate }; return { key: l.key, startDate: d.start, endDate: d.end }; });
                detail = await call('PUT', `${API}/${row.clientId}/dates`, { levels });
                Object.keys(draft).forEach((k) => delete draft[k]);
                draw();
                Dashboard.showToast(t('admin.saasImplDone'), 'success');
                await load();
            });
        }
    });
}
document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-impl-act]');
    if (!btn) return;
    const row = state.rows.find((x) => x.clientId === Number(btn.dataset.implClient));
    if (!row) return;
    if (btn.dataset.implAct === 'start') openStart(row);
    else openDetail(row);
});
})();
