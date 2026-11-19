// ---------------------------------------------------------------------------
// TI › Configuración Compañía › Sesiones de capacitación (solo consulta): las sesiones que el implementador de SaaS registra para esta compañía. De cada una se ve el módulo (departamento), el tema, cuándo es (en tu hora local; se guarda
// en UTC), la modalidad, quién capacita, el estatus y quiénes asistieron (los marca el implementador de la lista de usuarios de la compañía). De aquí saldrá el cumplimiento de capacitación de cada módulo. Rutas en server.js (/api/business/training-sessions).
// ---------------------------------------------------------------------------
(function () {
const TABLE_KEY = 'sesiones-capacitacion';
const API = '/api/business/training-sessions';
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
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
let state = { sessions: [] };
let timer = null;

async function api(path) {
    const res = await fetch(path, { credentials: 'include' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(body.message || 'request failed'); err.status = res.status; err.body = body; throw err; }
    return body;
}
// La hora de la sesión se guarda en UTC (ISO con «Z»): cada persona la ve en su hora local.
const whenText = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }); };
const stamp = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }); };
const moduleText = (s) => (s.department ? s.departmentName : t('main.capGeneral'));
const statusChip = (status) => `<span class="exp-chip exp-chip-${esc(status)}">${esc(t(`main.capStatus_${status}`))}</span>`;
const attendeesText = (s) => {
    if (s.status === 'cancelled') return '';
    if (s.status === 'scheduled') return t('main.capNoAttendees');
    return s.attendees.length ? s.attendees.map((a) => a.name || a.username).join(', ') : t('main.capNoneYet');
};
const notesText = (s) => [s.notes, s.cancelNote ? `${t('main.capCancelReason')}: ${s.cancelNote}` : ''].filter(Boolean).join(' · ');

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
function buildRow(s) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(s.id);
    const status = document.createElement('td');
    status.dataset.col = 'colCapEstatus';
    status.innerHTML = statusChip(s.status);
    const actions = document.createElement('td');
    actions.dataset.col = 'actions';
    actions.className = 'admin-table-actions';
    actions.appendChild(iconButton('bx-show', t('main.capView'), null, () => openDetail(s)));
    actions.appendChild(iconButton('bx-history', t('main.solHistory'), 'changeHistory', () => Dashboard.openChangeHistory(TABLE_KEY, s.id)));
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, s[key], 'col-system')),
        cell('colCapFolio', s.label), cell('colCapModulo', moduleText(s)), cell('colCapTema', s.topic), cell('colCapCuando', whenText(s.startsAt)), cell('colCapDuracion', t('main.capMinutes', { n: s.durationMin })),
        cell('colCapModalidad', t(`main.capModality_${s.modality}`)), cell('colCapCapacita', s.trainer), status, cell('colCapAsistentes', attendeesText(s)), cell('colCapNotas', notesText(s)), actions,
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
    const haystack = (s) => [s.label, moduleText(s), s.topic, whenText(s.startsAt), s.trainer, t(`main.capStatus_${s.status}`), t(`main.capModality_${s.modality}`), s.attendees.map((a) => a.name).join(' '), notesText(s)].filter(Boolean).join(' ').toLowerCase();
    const list = text ? state.sessions.filter((s) => SearchSyntax.matches('contains', text, haystack(s))) : state.sessions;
    list.forEach((s) => tbody.appendChild(buildRow(s)));
    if (!list.length) ensureEmptyState();
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY);
}
async function refreshTable(quiet) {
    try {
        state = await api(API);
        redraw();
    } catch (err) {
        console.error('Sesiones de capacitación: failed to load records', err);
        if (!quiet) Dashboard.showToast(t('main.capLoadError'), 'error');
    }
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', redraw);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', redraw);

// ---- el detalle de una sesión -------------------------------------------------------------------------------------------------------------------------
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
function openDetail(s) {
    const row = (label, value) => `<div class="exp-have-row"><span>${esc(label)}</span><b>${esc(value || '—')}</b></div>`;
    const attendees = s.attendees.map((a) => `<li class="exp-step"><b>${esc(a.name || a.username)}</b><span class="exp-step-meta">${esc(t('main.capMarkedBy', { by: a.markedBy || '—', date: stamp(a.markedAt) }))}</span></li>`).join('');
    const modal = makeModal(`<div class="exp-detail-head"><h3>${esc(s.label)} · ${esc(s.topic)}</h3>${statusChip(s.status)}</div>
        <div class="exp-have">${[
        row(t('main.colCapModulo'), moduleText(s)),
        row(t('main.colCapCuando'), whenText(s.startsAt)),
        row(t('main.colCapDuracion'), t('main.capMinutes', { n: s.durationMin })),
        row(t('main.colCapModalidad'), t(`main.capModality_${s.modality}`)),
        row(t('main.colCapCapacita'), s.trainer),
    ].join('')}</div>
        ${s.notes ? `<p class="exp-note"><b>${esc(t('main.colCapNotas'))}:</b> ${esc(s.notes)}</p>` : ''}
        ${s.cancelNote ? `<p class="exp-note"><b>${esc(t('main.capCancelReason'))}:</b> ${esc(s.cancelNote)}</p>` : ''}
        ${s.status === 'cancelled' ? '' : `<h4 class="exp-sub">${esc(t('main.capDetailAttendees'))}</h4>${attendees ? `<ol class="exp-timeline">${attendees}</ol>` : `<p class="exp-note">${esc(attendeesText(s))}</p>`}`}
        <div class="admin-form-actions"><button type="button" class="btn btn-secondary" id="cap-detail-close">${esc(t('main.capClose'))}</button></div>`);
    modal.$('#cap-detail-close').addEventListener('click', modal.close);
}

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
        timer = setInterval(() => { if (!document.hidden && !document.querySelector('.exp-overlay')) refreshTable(true); }, 60000); // el implementador las programa y marca la asistencia: se vuelve a leer cada minuto
    } catch (err) {
        console.error('Sesiones de capacitación failed to initialize:', err);
    }
})();
})();
