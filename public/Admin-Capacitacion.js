// ---------------------------------------------------------------------------
// Servicio a Cliente › Sesiones de capacitación (lado SaaS): el implementador registra las sesiones de capacitación de TODAS las compañías. Cada una es de un módulo (un departamento que la compañía tiene habilitado, o general), con su tema,
// fecha y hora (se guarda en UTC y se ve en tu hora), duración, modalidad y quién capacita. Pestañas: Programadas, Realizadas, Canceladas y Todas. El implementador programa, edita mientras no ocurre, cancela con su motivo y, ya empezada,
// marca de la lista de usuarios de la compañía quiénes asistieron (queda con fecha y quién la marcó). Cada botón se da en el árbol de accesos de la cuenta (Equipo SaaS). Las filas salen del servidor (GET /api/admin/training-sessions).
// La compañía las consulta en TI › Configuración Compañía › Sesiones de capacitación. Trae las columnas de Control Interno.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'capacitacion-saas';
const API = '/api/admin/training-sessions';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const SEARCH_COLUMNS = ['folio', 'client', 'module', 'topic', 'when', 'trainer', 'status', 'attendees', 'notes'];
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
const whenText = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }); };
const stamp = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }); };
// De un instante (UTC) al valor de un <input type="datetime-local"> en la hora de quien lo ve.
const toLocalInput = (iso) => { const d = new Date(iso); const pad = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const state = { sessions: [], counts: { scheduled: 0, done: 0, cancelled: 0, all: 0 }, can: {}, clients: [], tab: 'scheduled' };

const moduleText = (s) => (s.department ? s.departmentName : t('main.capGeneral'));
const statusChip = (status) => `<span class="exp-chip exp-chip-${esc(status)}">${esc(t(`main.capStatus_${status}`))}</span>`;
const attendeesText = (s) => {
    if (s.status === 'cancelled') return '';
    if (s.status === 'scheduled') return t('main.capNoAttendees');
    return s.attendees.length ? s.attendees.map((a) => a.name || a.username).join(', ') : t('main.capNoneYet');
};
const notesText = (s) => [s.notes, s.cancelNote ? `${t('main.capCancelReason')}: ${s.cancelNote}` : ''].filter(Boolean).join(' · ');

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-capacitacion-saas' });
        if (!role) return;
        await load();
        mountNewButton();
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
        console.error('Sesiones de capacitación (SaaS) failed to initialize:', err);
    }
})();

async function load() {
    const res = await fetch(API, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    const errEl = document.getElementById('ss-error');
    if (!res.ok) { errEl.textContent = body.message || Dashboard.t('admin.saveError'); errEl.hidden = false; return; }
    errEl.hidden = true;
    state.sessions = body.sessions; state.counts = body.counts; state.can = body.can || {}; state.clients = body.clients || [];
    renderTabs();
    renderRows();
}
function renderTabs() {
    document.querySelectorAll('[data-ss-tab]').forEach((btn) => {
        const on = btn.dataset.ssTab === state.tab;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-selected', String(on));
    });
    ['scheduled', 'done', 'cancelled', 'all'].forEach((k) => { document.getElementById(`ss-count-${k}`).textContent = String(state.counts[k] || 0); });
}
const visible = () => state.sessions.filter((s) => state.tab === 'all' || s.status === state.tab);

function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
// Las 13 columnas de Control Interno: la empresa de la compañía, el área, el módulo, la pantalla y el momento en que se registró la sesión.
function systemCells(s) {
    const d = new Date(`${String(s.createdAt).replace(' ', 'T')}Z`);
    const pad = (n) => String(n).padStart(2, '0');
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const start = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((Math.floor((d - start) / 86400000) + start.getDay() + 1) / 7);
    const values = {
        colSysEmpresa: s.client, colSysArea: 'Configuración Compañía', colSysModulo: 'Tecnologías de la Información', colSysPantalla: t('menu.saasTraining'), colSysCentroCostos: '',
        colSysFecha: `${pad(d.getDate())}/${months[d.getMonth()]}/${d.getFullYear()}`, colSysDiaNum: pad(d.getDate()), colSysDiaTexto: days[d.getDay()], colSysMesNum: pad(d.getMonth() + 1), colSysMesTexto: months[d.getMonth()],
        colSysAnio: String(d.getFullYear()), colSysSemana: `Sem${week}_${d.getFullYear()}`, colSysHora: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    };
    return SYSTEM_COLUMN_KEYS.map((key) => cell(key, values[key], 'col-system'));
}
function actionsCell(s) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const add = (label, kind) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary sc-mini';
        btn.dataset.capAct = kind;
        btn.dataset.capId = String(s.id);
        btn.textContent = label;
        td.appendChild(btn);
    };
    add(t('main.capView'), 'view');
    if (s.actions.edit) add(t('admin.saasCapEdit'), 'edit');
    if (s.actions.attendance) add(t('admin.saasCapAttend'), 'attend');
    if (s.actions.cancel) add(t('admin.saasCapCancel'), 'cancel');
    const history = document.createElement('button');
    history.type = 'button';
    history.className = 'admin-icon-btn';
    history.setAttribute('data-help-key', 'changeHistory');
    history.setAttribute('aria-label', t('main.solHistory'));
    history.title = t('main.solHistory');
    history.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    history.addEventListener('click', () => Dashboard.openChangeHistoryWithRows(t('main.changeHistoryTitleRecord'), Dashboard.saasTableChangesLoader(TABLE_KEY, s.id)));
    td.appendChild(history);
    return td;
}
function buildRow(s) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(s.id);
    const status = document.createElement('td');
    status.dataset.col = 'status';
    status.innerHTML = statusChip(s.status);
    tr.append(
        ...systemCells(s),
        cell('folio', s.label), cell('client', s.client), cell('module', moduleText(s)), cell('topic', s.topic), cell('when', whenText(s.startsAt)), cell('duration', t('main.capMinutes', { n: s.durationMin })),
        cell('modality', t(`main.capModality_${s.modality}`)), cell('trainer', s.trainer), status, cell('attendees', attendeesText(s)), cell('notes', notesText(s)), actionsCell(s),
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
    list.forEach((s) => fragment.appendChild(buildRow(s)));
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

// «+ Programar sesión»: solo quien tiene ese botón en su árbol de accesos.
function mountNewButton() {
    const toolbar = document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling;
    if (!toolbar || toolbar.querySelector('.data-table-new-record-btn') || !state.can.create) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.setAttribute('data-help-key', 'saasCapNew');
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${esc(t('admin.saasCapNew'))}</span>`;
    btn.addEventListener('click', () => openForm(null));
    toolbar.prepend(btn);
}

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
async function call(method, path, body) {
    const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
    return out;
}
function explain(err) {
    const code = err.body && err.body.code;
    const key = `admin.saasCapErr_${code}`;
    const text = Dashboard.t(key);
    return text !== key ? text : t('admin.saasCapErr_default');
}
function openDetail(s) {
    const row = (label, value) => `<div class="exp-have-row"><span>${esc(label)}</span><b>${esc(value || '—')}</b></div>`;
    const attendees = s.attendees.map((a) => `<li class="exp-step"><b>${esc(a.name || a.username)}</b><span class="exp-step-meta">${esc(t('main.capMarkedBy', { by: a.markedBy || '—', date: stamp(a.markedAt) }))}</span></li>`).join('');
    const modal = makeModal(`<div class="exp-detail-head"><h3>${esc(s.label)} · ${esc(s.client)}</h3>${statusChip(s.status)}</div>
        <div class="exp-have">${[
        row(t('main.colCapTema'), s.topic), row(t('main.colCapModulo'), moduleText(s)), row(t('main.colCapCuando'), whenText(s.startsAt)), row(t('main.colCapDuracion'), t('main.capMinutes', { n: s.durationMin })),
        row(t('main.colCapModalidad'), t(`main.capModality_${s.modality}`)), row(t('main.colCapCapacita'), s.trainer),
    ].join('')}</div>
        ${s.notes ? `<p class="exp-note"><b>${esc(t('main.colCapNotas'))}:</b> ${esc(s.notes)}</p>` : ''}
        ${s.cancelNote ? `<p class="exp-note"><b>${esc(t('main.capCancelReason'))}:</b> ${esc(s.cancelNote)}</p>` : ''}
        ${s.status === 'cancelled' ? '' : `<h4 class="exp-sub">${esc(t('main.capDetailAttendees'))}</h4>${attendees ? `<ol class="exp-timeline">${attendees}</ol>` : `<p class="exp-note">${esc(attendeesText(s))}</p>`}`}
        <div class="admin-form-actions"><button type="button" class="btn btn-secondary" id="cap-x">${esc(t('admin.saasCapClose'))}</button></div>`);
    modal.$('#cap-x').addEventListener('click', modal.close);
}

// Programar (s = null) o editar una sesión. La compañía solo se elige al programar; el módulo sale de los departamentos que esa compañía tiene habilitados.
function openForm(s) {
    const editing = !!s;
    const clientOptions = state.clients.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    const modal = makeModal(`<h3>${esc(t(editing ? 'admin.saasCapEdit' : 'admin.saasCapNew'))}${editing ? ` · ${esc(s.label)}` : ''}</h3>
        ${editing ? `<p class="sub">${esc(s.client)}</p>` : `<div class="admin-field"><label for="cap-client">${esc(t('admin.saasCapFieldClient'))}</label><select id="cap-client"><option value="">${esc(t('admin.saasCapPickClient'))}</option>${clientOptions}</select></div>`}
        <div class="admin-field"><label for="cap-module">${esc(t('admin.saasCapFieldModule'))}</label><select id="cap-module"></select></div>
        <div class="admin-field"><label for="cap-topic">${esc(t('admin.saasCapFieldTopic'))}</label><input id="cap-topic" type="text" maxlength="160" value="${editing ? esc(s.topic) : ''}"></div>
        <div class="admin-field" data-help-key="capWhen"><label for="cap-when">${esc(t('admin.saasCapFieldWhen'))}</label><input id="cap-when" type="datetime-local" value="${editing ? esc(toLocalInput(s.startsAt)) : ''}"></div>
        <div class="admin-field"><label for="cap-duration">${esc(t('admin.saasCapFieldDuration'))}</label><input id="cap-duration" type="number" min="15" max="480" step="5" value="${editing ? esc(s.durationMin) : '60'}"></div>
        <div class="admin-field"><label for="cap-modality">${esc(t('admin.saasCapFieldModality'))}</label><select id="cap-modality"><option value="virtual">${esc(t('main.capModality_virtual'))}</option><option value="presencial">${esc(t('main.capModality_presencial'))}</option></select></div>
        <div class="admin-field"><label for="cap-trainer">${esc(t('admin.saasCapFieldTrainer'))}</label><input id="cap-trainer" type="text" maxlength="120" value="${editing ? esc(s.trainer) : ''}"></div>
        <div class="admin-field"><label for="cap-notes">${esc(t('admin.saasCapFieldNotes'))}</label><textarea id="cap-notes" rows="3" maxlength="600">${editing ? esc(s.notes) : ''}</textarea></div>
        <p class="admin-error" id="cap-error" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" id="cap-ok">${esc(t('admin.saasCapSave'))}</button><button type="button" class="btn btn-secondary" id="cap-x">${esc(t('admin.saasCapClose'))}</button></div>`);
    const errorEl = modal.$('#cap-error');
    const moduleSel = modal.$('#cap-module');
    modal.$('#cap-modality').value = editing ? s.modality : 'virtual';
    // los módulos que la compañía elegida tiene habilitados (más «General»)
    const fillModules = (clientId, selected) => {
        const client = state.clients.find((c) => c.id === Number(clientId));
        const options = [`<option value="">${esc(t('admin.saasCapGeneral'))}</option>`, ...(client ? client.departments.map((d) => `<option value="${esc(d.key)}">${esc(d.name)}</option>`) : [])];
        moduleSel.innerHTML = options.join('');
        moduleSel.value = selected || '';
    };
    if (editing) fillModules(s.clientId, s.department); else fillModules('', '');
    modal.$('#cap-client')?.addEventListener('change', (event) => fillModules(event.target.value, ''));
    modal.$('#cap-x').addEventListener('click', modal.close);
    modal.$('#cap-ok').addEventListener('click', async () => {
        const whenValue = modal.$('#cap-when').value;
        const body = {
            department: moduleSel.value, topic: modal.$('#cap-topic').value.trim(), startsAt: whenValue ? new Date(whenValue).toISOString() : '', durationMin: modal.$('#cap-duration').value,
            modality: modal.$('#cap-modality').value, trainer: modal.$('#cap-trainer').value.trim(), notes: modal.$('#cap-notes').value.trim(),
        };
        if (!editing) body.clientId = Number(modal.$('#cap-client').value) || 0;
        modal.$('#cap-ok').disabled = true;
        try {
            await call(editing ? 'PUT' : 'POST', editing ? `${API}/${s.id}` : API, body);
            modal.close();
            Dashboard.showToast(t('admin.saasCapDone'), 'success');
            await load();
        } catch (err) {
            errorEl.textContent = explain(err);
            errorEl.hidden = false;
            modal.$('#cap-ok').disabled = false;
            if (err.body && err.body.code === 'STATE') load().catch(() => {});
        }
    });
}

// Registrar la asistencia: la lista de usuarios de la compañía, con casillas.
async function openAttendance(s) {
    const modal = makeModal(`<h3>${esc(t('admin.saasCapAttendTitle'))} · ${esc(s.label)}</h3>
        <p class="sub">${esc(s.client)} · ${esc(s.topic)} · ${esc(whenText(s.startsAt))}</p>
        <div id="cap-users" data-help-key="saasCapAttend"><p class="sub">…</p></div>
        <p class="sub" id="cap-count"></p>
        <p class="admin-error" id="cap-error" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" id="cap-ok" disabled>${esc(t('admin.saasCapSave'))}</button><button type="button" class="btn btn-secondary" id="cap-x">${esc(t('admin.saasCapClose'))}</button></div>`);
    modal.$('#cap-x').addEventListener('click', modal.close);
    const errorEl = modal.$('#cap-error');
    const showError = (text) => { errorEl.textContent = text; errorEl.hidden = !text; };
    let data;
    try { data = await call('GET', `${API}/${s.id}/users`); } catch (err) { showError(explain(err)); return; }
    const box = modal.$('#cap-users');
    if (!data.users.length) { box.innerHTML = `<p class="sub">${esc(t('admin.saasCapAttendNoUsers'))}</p>`; return; }
    const marked = new Set(data.attendees);
    box.innerHTML = `<p class="sub">${esc(t('admin.saasCapAttendPick'))}</p>
        <div class="admin-form-actions"><button type="button" class="btn btn-secondary sc-mini" id="cap-all">${esc(t('admin.saasCapAttendAll'))}</button><button type="button" class="btn btn-secondary sc-mini" id="cap-none">${esc(t('admin.saasCapAttendNone'))}</button></div>
        <div class="exp-checks">${data.users.map((u) => `<label><input type="checkbox" data-user="${u.id}"${marked.has(u.id) ? ' checked' : ''}><span>${esc(u.name || u.username)}</span></label>`).join('')}</div>`;
    const boxes = () => [...box.querySelectorAll('[data-user]')];
    const refresh = () => { modal.$('#cap-count').textContent = t('admin.saasCapAttendCount', { n: boxes().filter((b) => b.checked).length }); };
    const future = new Date(s.startsAt).getTime() > Date.now();
    if (future) showError(t('admin.saasCapErr_FUTURE')); else modal.$('#cap-ok').disabled = false;
    refresh();
    box.addEventListener('change', refresh);
    modal.$('#cap-all').addEventListener('click', () => { boxes().forEach((b) => { b.checked = true; }); refresh(); });
    modal.$('#cap-none').addEventListener('click', () => { boxes().forEach((b) => { b.checked = false; }); refresh(); });
    modal.$('#cap-ok').addEventListener('click', async () => {
        modal.$('#cap-ok').disabled = true;
        try {
            await call('PUT', `${API}/${s.id}/attendance`, { userIds: boxes().filter((b) => b.checked).map((b) => Number(b.dataset.user)) });
            modal.close();
            Dashboard.showToast(t('admin.saasCapDone'), 'success');
            await load();
        } catch (err) {
            showError(explain(err));
            modal.$('#cap-ok').disabled = false;
            if (err.body && err.body.code === 'STATE') load().catch(() => {});
        }
    });
}

// Cancelar: con su motivo, que la compañía ve.
function openCancel(s) {
    const modal = makeModal(`<h3>${esc(t('admin.saasCapCancel'))} · ${esc(s.label)}</h3>
        <p class="sub">${esc(s.client)} · ${esc(s.topic)} · ${esc(whenText(s.startsAt))}</p>
        <div class="admin-field"><label for="cap-note">${esc(t('admin.saasCapCancelReason'))}</label><textarea id="cap-note" rows="3" maxlength="600"></textarea></div>
        <p class="admin-error" id="cap-error" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" id="cap-ok">${esc(t('admin.saasCapConfirm'))}</button><button type="button" class="btn btn-secondary" id="cap-x">${esc(t('admin.saasCapClose'))}</button></div>`);
    modal.$('#cap-x').addEventListener('click', modal.close);
    modal.$('#cap-ok').addEventListener('click', async () => {
        const note = modal.$('#cap-note').value.trim();
        const errorEl = modal.$('#cap-error');
        if (!note) { errorEl.textContent = t('admin.saasCapErr_NOTE'); errorEl.hidden = false; return; }
        modal.$('#cap-ok').disabled = true;
        try {
            await call('POST', `${API}/${s.id}/cancel`, { note });
            modal.close();
            Dashboard.showToast(t('admin.saasCapDone'), 'success');
            await load();
        } catch (err) {
            errorEl.textContent = explain(err);
            errorEl.hidden = false;
            modal.$('#cap-ok').disabled = false;
            if (err.body && err.body.code === 'STATE') load().catch(() => {});
        }
    });
}
document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-cap-act]');
    if (!btn) return;
    const s = state.sessions.find((x) => x.id === Number(btn.dataset.capId));
    if (!s) return;
    if (btn.dataset.capAct === 'view') openDetail(s);
    else if (btn.dataset.capAct === 'edit') openForm(s);
    else if (btn.dataset.capAct === 'attend') openAttendance(s);
    else openCancel(s);
});
})();
