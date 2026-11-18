// ---------------------------------------------------------------------------
// TI > Operaciones TI > Operaciones > Casos de soporte: la lista de las solicitudes de soporte de la empresa (un renglón por caso, con su folio SP-0001) y el botón «Nueva solicitud».
// La solicitud pide: qué pasó, la categoría, qué implica (cada impacto del Mapa de soporte con su nivel: Ninguno, Bajo, Medio o Alto), cuándo afecta y si puede seguir trabajando; de ahí sale la PRIORIDAD (se ve en vivo, con las
// reglas de SupportRules.js, y el servidor la vuelve a calcular), el nivel donde entra y el plazo de la primera respuesta. Además pide las evidencias de su categoría: datos que se escriben, capturas, archivos y la
// GRABACIÓN DE PANTALLA con un botón (SupportRecorder.js). Primero se crea el caso y luego se suben las evidencias una por una. Las evidencias no se editan ni se borran: se ven en la pantalla de cada caso (OpTISoporteCaso.js, que también trae el chat y el
// recorrido; las evidencias solo con la columna Evidencias en el árbol, o quien abrió el caso). Trae las columnas de Control Interno. Las filas salen del servidor (GET /api/business/support-cases).
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const TABLE_KEY = 'casos-soporte';
const API = '/api/business/support-cases';
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
const SEARCH_COLUMNS = ['colSpFolio', 'colSpReporto', 'colSpPantalla', 'colSpResumen', 'colSpCategoria', 'colSpTipo', 'colSpGeneral', 'colSpPrioridad', 'colSpNivel', 'colSpEstatus'];
const SR = window.SupportRules;
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es'));
const locale = () => (lang() === 'en' ? 'en-US' : 'es-MX');
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
function friendlyMinutes(m) {
    const n = Number(m);
    if (!n) return t('main.msNoLimit');
    if (n % 1440 === 0) return `${n / 1440} d`;
    if (n % 60 === 0) return `${n / 60} h`;
    return `${n} min`;
}
let canCreate = false;
let canFiles = false;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
        queueInit();
    } catch (err) {
        console.error('Casos de soporte failed to initialize:', err);
    }
})();

// ---- tabla --------------------------------------------------------------------------------------------------------------------------
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function tagCell(col, className, dataKey, text, title) {
    const td = document.createElement('td');
    td.dataset.col = col;
    const tag = document.createElement('span');
    tag.className = className;
    if (dataKey !== null) tag.dataset.k = dataKey;
    tag.textContent = text;
    if (title) tag.title = title;
    td.appendChild(tag);
    return td;
}
function timeCell(col, iso) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (!iso) { td.textContent = '—'; return td; }
    td.textContent = new Date(iso).toLocaleString(locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    td.title = `UTC ${iso.replace('T', ' ').replace('Z', '')}`;
    return td;
}
// «Responder antes de»: la hora límite de la primera respuesta; en rojo si ya pasó y el caso sigue abierto.
function dueCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'colSpResponder';
    td.setAttribute('data-help-key', 'spResponder');
    if (r.firstResponseAt) {
        td.textContent = `✓ ${new Date(r.firstResponseAt).toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
        td.className = 'sp-ok-text';
        td.title = `${t('main.scFirstResponse')} · UTC ${r.firstResponseAt.replace('T', ' ').replace('Z', '')}`;
        return td;
    }
    if (!r.dueAt) { td.textContent = t('main.msNoLimit'); td.className = 'sp-muted'; return td; }
    td.textContent = new Date(r.dueAt).toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    td.title = `UTC ${r.dueAt.replace('T', ' ').replace('Z', '')}`;
    if (r.status === 'open' && Date.now() > new Date(r.dueAt).getTime()) {
        const tag = document.createElement('span');
        tag.className = 'sp-overdue';
        tag.textContent = t('main.spOverdue');
        td.append(' ', tag);
    }
    return td;
}
function filesCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'colSpEvidencias';
    td.setAttribute('data-help-key', 'spEvidenciasCol');
    if (!r.fileCount) { td.textContent = '0'; td.className = 'sp-muted'; return td; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sp-files-btn';
    btn.innerHTML = `<i class="bx bx-paperclip" aria-hidden="true"></i> ${r.fileCount}`;
    btn.setAttribute('aria-label', t('main.spViewFiles'));
    btn.addEventListener('click', () => openViewer(r.id));
    td.appendChild(btn);
    return td;
}
function actionsCell(r) {
    const td = document.createElement('td');
    td.dataset.col = 'actions';
    td.className = 'admin-table-actions';
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'admin-icon-btn';
    view.setAttribute('data-help-key', 'spVer');
    view.setAttribute('aria-label', t('main.spViewCase'));
    view.title = t('main.spViewCase');
    view.innerHTML = '<i class="bx bx-show" aria-hidden="true"></i>';
    view.addEventListener('click', () => openViewer(r.id));
    td.appendChild(view);
    return td;
}
function buildRow(r) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = String(r.id);
    const system = r.system || {};
    tr.append(
        ...SYSTEM_COLUMN_KEYS.map((key) => cell(key, system[key], 'col-system')),
        cell('colCatRegistroUnico', r.folio, 'col-system'),
        cell('colSpFolio', r.folio), timeCell('colSpFechaHora', r.createdAt), cell('colSpReporto', r.reporter), cell('colSpPantalla', r.screen), cell('colSpResumen', r.summary), cell('colSpCategoria', r.category),
        tagCell('colSpTipo', 'sp-tag sp-type', r.type, t(`main.spType_${r.type}`)),
        r.general ? tagCell('colSpGeneral', 'sp-tag sp-general', null, r.general.folio) : cell('colSpGeneral', '—'),
        tagCell('colSpPrioridad', 'sp-tag sp-pri', String(r.priority), t(`main.msPri_${r.priority}`)),
        tagCell('colSpNivel', 'sp-tag sp-lv', r.level, t(`main.sopLevel_${r.level}`)),
        tagCell('colSpEstatus', 'sp-tag sp-status', r.status, t(`main.spStatus_${r.status}`)),
        cell('colSpAtiende', r.assigneeName),
        cell('colSpCalificacion', r.userStars ? '★'.repeat(r.userStars) + '☆'.repeat(5 - r.userStars) : '—'),
        dueCell(r), filesCell(r),
    );
    tr.appendChild(actionsCell(r));
    return tr;
}
function getTbody() {
    return document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0];
}
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
const ROW_CHUNK = 100;
let renderToken = 0;
const nextTurn = () => (window.scheduler && window.scheduler.yield ? window.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));
async function refreshTable() {
    const tbody = getTbody();
    const token = ++renderToken;
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        if (token !== renderToken) return;
        canCreate = !!body.canCreate;
        canFiles = !!body.canFiles;
        document.getElementById('sp-new-btn').hidden = !canCreate;
        tbody.innerHTML = '';
        if (!body.cases.length) { ensureEmptyState(); return; }
        for (let from = 0; from < body.cases.length; from += ROW_CHUNK) {
            if (token !== renderToken) return;
            const fragment = document.createDocumentFragment();
            body.cases.slice(from, from + ROW_CHUNK).forEach((r) => fragment.appendChild(buildRow(r)));
            tbody.appendChild(fragment);
            if (from + ROW_CHUNK < body.cases.length) await nextTurn();
        }
        if (token !== renderToken) return;
        applyFilters();
    } catch (err) {
        console.error('Casos de soporte: failed to load cases', err);
    }
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
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyFilters);

// ---- un caso: lo abre su propia pantalla (chat, recorrido y evidencias) ------------------------------------------------------------------------------
const openViewer = (caseId) => { location.href = `OpTISoporteCaso.html?id=${caseId}`; };
// ---- Mi cola (panel arriba de la lista; hoja «Mi cola» del árbol) ----------------------------------------------------------------------------------------------------------------------
// «Mi cola»: lo que yo atiendo, ordenado por prioridad; «Mi nivel»: lo que espera en el nivel que atiendo, para tomarlo. Cuando llega un caso Urgente, se avisa arriba; si estoy con algo menos urgente digo cuánto me falta: si me falta
// menos de lo que el Urgente puede esperar (Mapa de soporte) termino primero; si no, se recomienda pausar (yo decido y queda registrado). Botones: Tomar y Pausar / Retomar (cada uno con su hoja del árbol).
const qState = { data: null, tab: 'mine', minutes: {}, deferred: {}, busy: false, timer: null, poll: null };
const Q_MINUTES = [5, 10, 15, 30, 60];
const qFmtLeft = (iso) => {
    const ms = new Date(iso).getTime() - Date.now();
    const abs = Math.abs(ms); const m = Math.floor(abs / 60000); const s = Math.floor((abs % 60000) / 1000);
    const text = m >= 120 ? `${Math.floor(m / 60)} h` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return { text, over: ms < 0 };
};
async function queueLoad() {
    const box = document.getElementById('sp-queue');
    if (!box) return;
    try {
        const res = await fetch('/api/business/support-queue', { credentials: 'include' });
        if (!res.ok) { box.hidden = true; return; }
        qState.data = await res.json();
        queueRender();
    } catch (err) { /* sin conexión: se vuelve a intentar */ }
}
function queueInit() {
    queueLoad();
    if (!qState.poll) qState.poll = setInterval(() => { if (!qState.busy && !document.hidden) queueLoad(); }, 30000);
    if (!qState.timer) qState.timer = setInterval(() => {
        document.querySelectorAll('[data-q-timer]').forEach((el) => { const left = qFmtLeft(el.dataset.qTimer); el.textContent = `${left.over ? '−' : ''}${left.text}`; el.classList.toggle('over', left.over); });
    }, 1000);
}
const qPriTag = (p) => `<span class="sp-tag sp-pri" data-k="${p}">${esc(t(`main.msPri_${p}`))}</span>`;
const qLv = (l) => `<span class="sc-lv ${esc(l)}" title="${esc(t(`main.sopLevel_${l}`))}">${esc(String(l).toUpperCase())}</span>`;
// Lo que me interrumpe: el Urgente sin tomar de mi nivel y el caso menos urgente que yo estoy atendiendo (si hay uno al que interrumpe).
function qInterruptible(u, mine) {
    const hits = (p) => (u.priority === 1 ? p > 1 : (u.priority === 2 ? p >= 3 : false));
    return mine.filter((c) => ['review', 'working', 'testing'].includes(c.status) && hits(c.priority)).sort((a, b) => b.priority - a.priority || a.id - b.id)[0] || null;
}
function qUrgentHtml(u, d) {
    const w = qInterruptible(u, d.mine);
    const left = u.dueAt && !u.firstResponseAt ? qFmtLeft(u.dueAt) : null;
    const impacts = u.impacts.map((i) => `<span class="sp-tag">${esc(i.name)} · ${esc(t(`main.spLevel_${i.level}`))}</span>`).join(' ');
    const wait = d.map.wait[u.priority] || 0;
    let decision = '';
    if (w) {
        const picked = qState.minutes[u.id];
        const chips = Q_MINUTES.map((m) => `<button type="button" class="sp-chip${picked === m ? ' on' : ''}" data-q-min="${u.id}" data-m="${m}">${m === 60 ? esc(t('main.qMin60')) : m}</button>`).join('');
        let advice = '';
        if (picked) {
            const finish = picked <= wait;
            const canPause = d.map.allowPause && w.canPause;
            const pauseBtn = canPause ? `<button type="button" class="btn${finish ? ' btn-secondary' : ''}" data-q-pause="${w.id}" data-u="${u.id}">${esc(t('main.qBtnPause', { a: w.folio, b: u.folio }))}</button>` : '';
            const finishBtn = `<button type="button" class="btn${finish ? '' : ' btn-secondary'}" data-q-finish="${w.id}" data-u="${u.id}">${esc(finish ? t('main.qBtnFinish', { a: w.folio, b: u.folio }) : t('main.qBtnFinishAnyway'))}</button>`;
            advice = `<div class="sp-q-opt ${finish ? '' : 'rec'}"><b>${esc(finish ? t('main.qRecFinish', { m: picked }) : t('main.qRecPause', { m: picked }))}</b><span>${esc(finish ? t('main.qRecFinishText', { min: wait }) : t('main.qRecPauseText'))}</span>
                <div class="sc-actions">${finish ? `${finishBtn}${pauseBtn}` : `${pauseBtn}${finishBtn}`}</div>${finish ? '' : `<span class="sp-muted">${esc(t('main.qFinishOverride'))}</span>`}</div>`;
        }
        const deferred = qState.deferred[u.id] ? `<p class="sp-muted">${esc(t('main.qDeferredNote', { time: new Date(qState.deferred[u.id]).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) }))}</p>` : '';
        decision = `<div class="sp-q-box"><b>${esc(t('main.qWorkingOn', { folio: w.folio, summary: w.summary }))}</b> ${qPriTag(w.priority)}
            <div class="sp-field"><span>${esc(t('main.qHowLong'))}</span><div class="sp-chips">${chips}</div></div><p class="sp-muted">${esc(t('main.qWaitHint', { priority: t(`main.msPri_${u.priority}`), min: wait }))}</p>${advice}${deferred}</div>`;
    }
    return `<div class="sp-q-alert"><h4>⚠ ${esc(t('main.qUrgentTitle', { priority: t(`main.msPri_${u.priority}`), level: t(`main.sopLevel_${u.level}`) }))}</h4>
        <div class="sc-card-head"><div><a href="OpTISoporteCaso.html?id=${u.id}"><b>${esc(u.folio)}</b></a> · ${esc(u.summary)}<br><span class="sp-muted">${esc(u.reporter || '—')}</span></div>
        <div class="sp-q-clock">${left ? `<span class="sp-muted">${esc(t('main.qFirstResponse'))}</span><b class="sp-q-timer${left.over ? ' over' : ''}" data-q-timer="${esc(u.dueAt)}">${left.over ? '−' : ''}${esc(left.text)}</b>` : ''}</div></div>
        <div class="sp-chips">${impacts}</div>${u.canTake ? `<div class="sc-actions"><button type="button" class="btn" data-q-take="${u.id}">${esc(t('main.qTake'))}</button></div>` : ''}${decision}</div>`;
}
function qRowHtml(r) {
    const when = r.dueAt && !r.firstResponseAt ? qFmtLeft(r.dueAt) : null;
    const sub = [t(`main.spStatus_${r.status}`), r.status === 'paused' ? t('main.qPausedSince', { when: new Date(r.pausedAt).toLocaleString(locale(), { hour: '2-digit', minute: '2-digit' }) }) : '', r.assigneeName && !r.mine ? t('main.qAssignee', { name: r.assigneeName }) : '', when ? `${t('main.qFirstResponse')} ${when.over ? '−' : ''}${when.text}` : ''].filter(Boolean).join(' · ');
    const btns = `${r.canTake ? `<button type="button" class="btn btn-secondary" data-q-take="${r.id}">${esc(t('main.qTake'))}</button>` : ''}${r.canPause ? `<button type="button" class="btn btn-secondary" data-q-pausecase="${r.id}">${esc(t('main.qPause'))}</button>` : ''}${r.canResume ? `<button type="button" class="btn btn-secondary" data-q-resume="${r.id}">${esc(t('main.qResume'))}</button>` : ''}`;
    return `<div class="sp-q-row${r.status === 'paused' ? ' paused' : ''}${r.priority <= 2 ? ' hot' : ''}">${qPriTag(r.priority)}<div class="sp-q-main"><a href="OpTISoporteCaso.html?id=${r.id}"><b>${esc(r.folio)}</b></a> · ${esc(r.summary)} ${qLv(r.level)}<div class="sp-muted">${esc(sub)}</div></div><div class="sc-actions">${btns}</div></div>`;
}
function queueRender() {
    const box = document.getElementById('sp-queue'); const d = qState.data;
    if (!box || !d) return;
    const list = qState.tab === 'mine' ? d.mine : d.level;
    box.hidden = false;
    box.innerHTML = `<div class="sc-card-head"><h3>${esc(t('main.qTitle'))}</h3><div class="sp-chips" role="tablist"><button type="button" class="sp-chip${qState.tab === 'mine' ? ' on' : ''}" data-q-tab="mine">${esc(t('main.qTabMine'))} (${d.mine.length})</button><button type="button" class="sp-chip${qState.tab === 'level' ? ' on' : ''}" data-q-tab="level">${esc(t('main.qTabLevel'))} (${d.level.length})</button></div></div>
        ${d.urgent.map((u) => qUrgentHtml(u, d)).join('')}
        <div class="sp-q-list">${list.length ? list.map(qRowHtml).join('') : `<p class="sp-muted">${esc(t(qState.tab === 'mine' ? 'main.qEmptyMine' : 'main.qEmptyLevel'))}</p>`}</div>`;
}
async function qAction(path, body, okText) {
    if (qState.busy) return null;
    qState.busy = true;
    try {
        const res = await fetch(`${API}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body || {}) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(out.message || Dashboard.t('admin.saveError'), 'warning'); return null; }
        if (okText) Dashboard.showToast(okText(out), 'success');
        return out;
    } catch (err) {
        console.error('Mi cola: failed', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        return null;
    } finally { qState.busy = false; }
}
async function qAfter() { await Promise.all([queueLoad(), refreshTable()]); }
document.addEventListener('click', async (event) => {
    const el = event.target.closest('[data-q-tab],[data-q-take],[data-q-min],[data-q-pause],[data-q-finish],[data-q-pausecase],[data-q-resume]');
    if (!el || !document.getElementById('sp-queue') || !document.getElementById('sp-queue').contains(el)) return;
    if (el.dataset.qTab) { qState.tab = el.dataset.qTab; queueRender(); return; }
    if (el.dataset.qMin) { qState.minutes[Number(el.dataset.qMin)] = Number(el.dataset.m); queueRender(); return; }
    if (el.dataset.qTake) { if (await qAction(`${el.dataset.qTake}/take`, {}, () => t('main.qDoneTake'))) await qAfter(); return; }
    if (el.dataset.qPausecase) { if (!window.confirm(t('main.qPauseConfirm'))) return; if (await qAction(`${el.dataset.qPausecase}/pause`, {}, () => t('main.qDonePauseOnly'))) await qAfter(); return; }
    if (el.dataset.qResume) { if (await qAction(`${el.dataset.qResume}/resume`, {}, () => t('main.qDoneResume'))) await qAfter(); return; }
    if (el.dataset.qPause) {
        const u = Number(el.dataset.u); const w = qState.data.mine.find((c) => c.id === Number(el.dataset.qPause)); const urgent = qState.data.urgent.find((c) => c.id === u);
        if (await qAction(`${el.dataset.qPause}/pause`, { minutes: qState.minutes[u], forCaseId: u, takeUrgent: true }, () => t('main.qDonePause', { a: w ? w.folio : '', b: urgent ? urgent.folio : '' }))) await qAfter();
        return;
    }
    if (el.dataset.qFinish) {
        const u = Number(el.dataset.u);
        const out = await qAction(`${el.dataset.qFinish}/defer`, { urgentCaseId: u, minutes: qState.minutes[u] }, (o) => t('main.qDoneFinish', { time: new Date(o.dueAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) }));
        if (out) { qState.deferred[u] = out.dueAt; await queueLoad(); }
    }
});
document.getElementById('sp-new-btn')?.addEventListener('click', () => {
    const q = new URLSearchParams(location.search);
    SupportRequestForm.open({ screen: q.get('screen') || '', action: q.get('action') || '', errorText: q.get('error') || '' }, { onCreated: () => refreshTable() });
});
})();
