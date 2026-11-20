// ---------------------------------------------------------------------------
// Administración de Equipo de Trabajo (pieza 1): un tablero tipo kanban para repartir actividades a las personas (de tu equipo o de cualquier otra parte de la compañía), ver cómo va cada una y guardar cada paso. La actividad se define al crearla (tipo
// fija, eventual o periódica; presencial, remota o mixta; sitios, departamento, área y fecha) y se asigna ahí mismo a una o más personas o queda «por asignar». Cada persona lleva SU estado (por confirmar → confirmada → en curso ⇄ en pausa → en validación → hecha);
// la columna se calcula de todas. El servidor decide quién puede qué (`can` de cada actividad); aquí solo se dibuja. Rutas en server.js (/api/business/team-activities). Se carga después de Dashboard.js.
// ---------------------------------------------------------------------------
(function () {
'use strict';
const API = '/api/business/team-activities';
const $ = (id) => document.getElementById(id);
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
const pad2 = (n) => String(n).padStart(2, '0');
const KINDS = ['fija', 'eventual', 'periodica'];
const REALS = ['presencial', 'remoto', 'mixta'];
const LANES = ['unassigned', 'assigned', 'in_progress', 'paused', 'review', 'done'];
const CLAIM_SCOPES = ['team_dept', 'team', 'company', 'chosen'];
const VIEWS = ['board', 'line', 'log'];
const GROUPS = ['activity', 'user', 'site'];
const LINE_PERIODS = ['7d', '14d', '30d', 'week', 'month', 'prev', 'custom'];
const LOG_PERIODS = ['month', 'prev', '30d', '90d', 'year', 'all', 'custom'];
const VIEW_KEY = 'sgn.teamWork.view';
const LOG_PAGE = 300;
const FILTERS_KEY = 'sgn.teamWork.filters';
const DEFAULT_FILTERS = { q: '', person: 'all', kind: 'all', real: 'all', site: 'all', dept: 'all', area: 'all', plan: 'all', urgent: false };
let data = { activities: [], people: [], sites: [], departments: [], me: { id: 0, name: '', isAdmin: false, hasTeam: false } };
let filters = { ...DEFAULT_FILTERS };
try { const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || 'null'); if (saved && typeof saved === 'object') filters = { ...DEFAULT_FILTERS, ...saved, q: '' }; } catch (err) { /* sin almacenamiento: los filtros empiezan en «todos» */ }
const saveFilters = () => { try { localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...filters, q: '' })); } catch (err) { /* se queda solo en esta visita */ } };
let detailId = null;
let view = 'board';
let lineGroup = 'activity';
let periods = { line: { kind: '14d', from: '', to: '' }, log: { kind: 'month', from: '', to: '' } };
let lineData = null;
let logData = null;
let logShown = LOG_PAGE;
try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    if (saved && typeof saved === 'object') {
        if (VIEWS.includes(saved.view)) view = saved.view;
        if (GROUPS.includes(saved.lineGroup)) lineGroup = saved.lineGroup;
        if (saved.periods && LINE_PERIODS.includes(saved.periods.line && saved.periods.line.kind)) periods.line = { kind: saved.periods.line.kind, from: String(saved.periods.line.from || ''), to: String(saved.periods.line.to || '') };
        if (saved.periods && LOG_PERIODS.includes(saved.periods.log && saved.periods.log.kind)) periods.log = { kind: saved.periods.log.kind, from: String(saved.periods.log.from || ''), to: String(saved.periods.log.to || '') };
    }
} catch (err) { /* sin almacenamiento: empieza en el tablero */ }

async function api(method, path, body) {
    const res = await fetch(`${API}${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.error || out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
    return out;
}
function errText(err) {
    const code = err && err.body && err.body.code;
    if (code) { const key = `main.twErr_${code}`; const text = Dashboard.t(key); if (text !== key) return text; }
    return t('main.twErr_default');
}
const showError = (text) => { const el = $('tw-error'); if (el) { el.textContent = text || ''; el.hidden = !text; } };
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase() || '?';
// las horas se guardan en UTC («2026-11-19 16:05:00.123»): cada quien las ve en su hora
const whenText = (utc) => { const d = new Date(`${String(utc || '').replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const dayText = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : ''; };
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const deptName = (key) => { const d = data.departments.find((x) => x.key === key); return d ? (d.labelKey ? Dashboard.t(d.labelKey) : d.key) : ''; };
const kindLabel = (k) => t(`main.twKind_${k}`);
const realLabel = (r) => t(`main.twReal_${r}`);
// Periódicas que se repiten solas: «Cada día», «Cada 2 semanas»…
const REPEAT_UNITS = ['day', 'week', 'month'];
const REPEAT_MAX = { day: 365, week: 52, month: 24 };
const repeatText = (unit, every) => t(`main.twRep_${unit}_${Number(every) === 1 ? '1' : 'n'}`, { n: every });
const fold = (text) => String(text == null ? '' : text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---- filtros (todos en el navegador: la lista ya trae lo que esta persona puede ver) --------------------------------------------------------------------------------
function matches(a) {
    if (filters.kind !== 'all' && a.kind !== filters.kind) return false;
    if (filters.real !== 'all' && a.realization !== filters.real) return false;
    if (filters.site !== 'all' && !a.sites.some((s) => String(s.id) === String(filters.site))) return false;
    if (filters.dept !== 'all' && a.department !== filters.dept) return false;
    if (filters.area !== 'all' && a.area !== filters.area) return false;
    if (filters.urgent && !a.urgent) return false;
    if (filters.plan !== 'all') { const pid = a.plan ? String(a.plan.planId) : ''; if (filters.plan === 'none' ? !!a.plan : pid !== String(filters.plan)) return false; }
    const p = filters.person;
    if (p === 'me' && !a.assignees.some((x) => x.isMe)) return false;
    if (p === 'team' && !a.assignees.some((x) => x.isMine)) return false;
    if (p === 'outside' && !a.assignees.some((x) => !x.isMine && !x.isMe)) return false;
    if (/^\d+$/.test(String(p)) && !a.assignees.some((x) => String(x.userId) === String(p))) return false;
    const q = filters.q.trim();
    // con una sola letra saldría casi todo: igual que en las tablas, la búsqueda espera a tener al menos 2
    if (q && (!window.SearchSyntax || window.SearchSyntax.ready('contains', q))) {
        const hay = [a.title, a.description, a.area, deptName(a.department), a.sites.map((s) => s.name).join(' '), a.assignees.map((x) => x.name).join(' '), kindLabel(a.kind), realLabel(a.realization)].join(' ');
        if (!(window.SearchSyntax ? window.SearchSyntax.matches('contains', q, hay) : fold(hay).includes(fold(q)))) return false;
    }
    return true;
}
const visible = () => data.activities.filter(matches);

// ---- el tablero -------------------------------------------------------------------------------------------------------------------------------------------------------------
function options(list, current, allLabel) { return [`<option value="all">${esc(allLabel)}</option>`, ...list.map(([v, label]) => `<option value="${esc(v)}"${String(current) === String(v) ? ' selected' : ''}>${esc(label)}</option>`)].join(''); }
function filterBar() {
    const people = viewPeople();
    const personOpts = [['me', t('main.twPersonMe')], ['team', t('main.twPersonTeam')], ['outside', t('main.twPersonOutside')], ...people.map((p) => [String(p.id), p.name])];
    const areas = [...new Set(viewItems().map((a) => a.area).filter(Boolean))].sort((x, y) => x.localeCompare(y, locale()));
    const planMap = new Map();
    viewItems().forEach((a) => { if (a.plan) planMap.set(String(a.plan.planId), a.plan.planTitle); });
    const planOpts = [['none', t('main.twPlanNone')], ...[...planMap.entries()].sort((x, y) => x[1].localeCompare(y[1], locale()))];
    const field = (id, label, control, help) => `<label class="tw-flt" for="${id}"${help ? ` data-help-key="${help}"` : ''}><span>${esc(label)}</span>${control}</label>`;
    return `<div class="tw-filters" role="search" aria-label="${esc(t('main.twFilters'))}" data-help-key="twFilters">
        ${field('tw-f-q', t('main.twFilterSearch'), `<input id="tw-f-q" type="search" value="${esc(filters.q)}" autocomplete="off">`)}
        ${field('tw-f-person', t('main.twPerson'), `<select id="tw-f-person">${options(personOpts, filters.person, t('main.twPersonAll'))}</select>`)}
        ${field('tw-f-kind', t('main.twKind'), `<select id="tw-f-kind">${options(KINDS.map((k) => [k, kindLabel(k)]), filters.kind, t('main.twKindAll'))}</select>`)}
        ${field('tw-f-real', t('main.twRealization'), `<select id="tw-f-real">${options(REALS.map((r) => [r, realLabel(r)]), filters.real, t('main.twRealAll'))}</select>`)}
        ${field('tw-f-site', t('main.twSite'), `<select id="tw-f-site">${options(data.sites.map((s) => [String(s.id), s.name]), filters.site, t('main.twSiteAll'))}</select>`)}
        ${field('tw-f-dept', t('main.twDept'), `<select id="tw-f-dept">${options(data.departments.map((d) => [d.key, deptName(d.key)]), filters.dept, t('main.twDeptAll'))}</select>`)}
        ${field('tw-f-area', t('main.twArea'), `<select id="tw-f-area">${options(areas.map((a) => [a, a]), filters.area, t('main.twAreaAll'))}</select>`)}
        ${field('tw-f-plan', t('main.twPlan'), `<select id="tw-f-plan">${options(planOpts, filters.plan, t('main.twPlanAll'))}</select>`)}
        <label class="tw-flt tw-flt-check" for="tw-f-urgent"><input id="tw-f-urgent" type="checkbox"${filters.urgent ? ' checked' : ''}><span>${esc(t('main.twUrgent'))}</span></label>
        <button type="button" class="btn btn-secondary tw-small" data-tw="clear">${esc(t('main.twClear'))}</button></div>`;
}
// los pases que esta persona puede aprobar o rechazar (cuentan aunque haya filtros puestos)
const passesToResolve = () => data.activities.flatMap((a) => a.passes.filter((p) => p.canResolve).map((p) => ({ ...p, activity: a })));
function counters(list) {
    const by = (s) => list.filter((a) => a.status === s).length;
    const tile = (n, label, extra) => `<div class="tw-cnt${extra ? ` ${extra}` : ''}"><b>${n}</b><small>${esc(label)}</small></div>`;
    const waiting = passesToResolve().length;
    return `<div class="tw-counters" role="list" aria-label="${esc(t('main.twCounters'))}" data-help-key="twCounters">${tile(list.length, t('main.twCnt_total'))}${LANES.map((s) => tile(by(s), t(`main.twLane_${s}`))).join('')}${waiting ? tile(waiting, t('main.twPassTray'), 'tw-cnt-warn') : ''}</div>`;
}
// un pase: quién → a quién, quién lo pidió y su motivo, con sus botones (aprobar o rechazar quien le toca; retirar quien lo pidió)
function passCard(p, a, inTray) {
    const act = (op, cls) => `<button type="button" class="btn${cls} tw-small" data-tw="act" data-act="${op}" data-id="${a.id}" data-pass="${p.id}">${esc(t(`main.twAct_${op.replace('-', '_')}`))}</button>`;
    const buttons = [p.canResolve ? act('pass-approve', '') : '', p.canResolve ? act('pass-reject', ' btn-secondary') : '', p.canCancel && !inTray ? act('pass-cancel', ' btn-secondary') : ''].join('');
    return `<div class="tw-pass-card">${inTray ? `<b>${esc(a.title)}</b>` : ''}<small>${esc(`${p.fromName} → ${p.toNames.join(', ')}`)} · ${esc(t('main.twPassBy', { name: p.requestedByName, date: whenText(p.requestedAt) }))}</small><span class="tw-pass-note">${esc(t('main.twPassNote', { reason: p.reason }))}</span>${buttons ? `<div class="tw-card-act">${buttons}</div>` : ''}</div>`;
}
function passTray() {
    const list = passesToResolve();
    if (!list.length) return '';
    return `<section class="tw-tray" aria-label="${esc(t('main.twPassTray'))}" data-help-key="twPassTray"><h3>${esc(t('main.twPassTray'))}<em>${list.length}</em></h3>${list.map((p) => passCard(p, p.activity, true)).join('')}</section>`;
}
function personStack(a) {
    if (!a.assignees.length) return `<span class="tw-av tw-av-none" aria-hidden="true">?</span>`;
    return `<span class="tw-stack">${a.assignees.slice(0, 3).map((x) => avatar(x.userId, x.name, x.photoVer, x.isMine || x.isMe ? '' : 'tw-av-out', x.name)).join('')}${a.assignees.length > 3 ? `<span class="tw-av tw-av-more">+${a.assignees.length - 3}</span>` : ''}</span>`;
}
function cardActions(a) {
    const c = a.can || {};
    const btn = (op, extra) => `<button type="button" class="btn${extra ? ` ${extra}` : ' btn-secondary'} tw-small" data-tw="act" data-act="${op}" data-id="${a.id}">${esc(t(`main.twAct_${op}`))}</button>`;
    const out = [];
    if (c.claim) out.push(btn('claim', ''));
    if (c.confirm) out.push(btn('confirm', ''));
    if (c.start) out.push(btn('start', c.confirm ? 'btn-secondary' : ''));
    if (c.pause) out.push(btn('pause'));
    if (c.resume) out.push(btn('resume', ''));
    if (c.submit) out.push(btn('submit', ''));
    if (c.validate) out.push(btn('validate', ''));
    if (c.returnIt) out.push(btn('return'));
    if (c.pass && (c.passUserIds || []).includes(data.me.id)) out.push(btn('pass'));
    return out.length ? `<div class="tw-card-act">${out.join('')}</div>` : '';
}
function card(a) {
    const today = todayYmd();
    const late = a.dueDate && a.status !== 'done' && a.dueDate < today;
    const due = a.dueDate ? `<span class="tw-due${late ? ' tw-due-late' : ''}">${esc(t(late ? 'main.twDueLate' : 'main.twDue', { date: dayText(a.dueDate) }))}</span>` : '';
    const names = a.assignees.length ? a.assignees.map((x) => x.name).join(' + ') : t('main.twNoPeople');
    const sub = [a.sites.map((s) => s.name).join(', '), realLabel(a.realization), deptName(a.department)].filter(Boolean).join(' · ');
    const per = a.assignees.length > 1 ? `<div class="tw-per">${a.assignees.map((x) => `<span class="tw-per-i tw-ps-${x.status}"><i></i>${esc(x.name.split(' ')[0])} · ${esc(t(`main.twPs_${x.status}`))}</span>`).join('')}</div>` : '';
    const seats = a.seatsOpen > 0 && (a.status === 'unassigned' || a.claimScope) ? `<div class="tw-seats">${esc(t('main.twSeatsOpen', { n: a.seatsOpen }))}</div>` : '';
    const takers = a.claim && (a.can.edit || a.can.assign) ? `<div class="tw-takers">${esc(a.claim.freeCount ? t('main.twFreeCan', { names: a.claim.freeNames.join(', ') + (a.claim.freeCount > a.claim.freeNames.length ? ` +${a.claim.freeCount - a.claim.freeNames.length}` : '') }) : t('main.twFreeNone'))}</div>` : '';
    const waiting = a.passes.map((p) => `<div class="tw-pass">${esc(t('main.twPassPending', { to: p.toNames.join(', '), name: p.approverName }))}</div>`).join('');
    const planChip = a.plan ? `<div class="tw-plan" title="${esc(a.plan.path)}"><i class="bx bx-link" aria-hidden="true"></i><span>${esc(`${a.plan.planTitle} › ${a.plan.itemTitle}`)}</span></div>` : '';
    const repChip = a.repeat ? `<div class="tw-rep${a.repeat.waiting ? ' tw-rep-wait' : ''}"><i class="bx bx-refresh" aria-hidden="true"></i><span>${esc(repeatText(a.repeat.unit, a.repeat.every))}${a.repeat.waiting ? ` · ${esc(t('main.twRepWaiting'))}` : ''}</span></div>` : '';
    const mineBadge = a.myStatus ? `<span class="tw-me">${esc(t('main.twMine'))}</span>` : '';
    return `<article class="tw-card tw-k-${a.kind}" data-tw="open" data-id="${a.id}" tabindex="0" aria-label="${esc(a.title)}">
        <div class="tw-card-top"><span class="tw-kind">${esc(kindLabel(a.kind))}</span>${a.urgent ? `<span class="tw-urg">⚡ ${esc(t('main.twUrgentTag'))}</span>` : ''}${mineBadge}${due}</div>
        <b class="tw-card-title">${esc(a.title)}</b>
        <div class="tw-card-who">${personStack(a)}<span><span class="tw-names">${esc(names)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>
        ${planChip}${repChip}${per}${seats}${takers}${waiting}${cardActions(a)}</article>`;
}
function lanes(list) {
    return `<div class="tw-lanes" data-help-key="twLanes">${LANES.map((s) => {
        const items = list.filter((a) => a.status === s);
        return `<section class="tw-lane tw-lane-${s}" aria-label="${esc(t(`main.twLane_${s}`))}"><h3>${esc(t(`main.twLane_${s}`))}<em>${items.length}</em></h3>${items.map(card).join('') || ''}</section>`;
    }).join('')}</div>`;
}
function render() {
    const root = $('tw-root');
    if (!root) return;
    const list = visible();
    const keepFocus = document.activeElement && document.activeElement.id;
    const caret = keepFocus === 'tw-f-q' ? document.activeElement.selectionStart : null;
    const body = view === 'line' ? lineView() : view === 'log' ? logView() : `${counters(list)}${passTray()}${todayStrip()}${data.activities.length ? '' : `<p class="tw-empty">${esc(t('main.twEmpty'))}</p>`}${lanes(list)}`;
    root.innerHTML = `<div class="tw-head"><h2>${esc(t('main.twBoard'))}</h2><button type="button" class="btn" data-tw="create" data-help-key="twCreate"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.twCreate'))}</button></div>
        ${viewTabs()}${filterBar()}${body}`;
    if (keepFocus === 'tw-f-q') { const el = $('tw-f-q'); if (el) { el.focus(); if (caret != null) el.setSelectionRange(caret, caret); } }
}
async function load(quiet) {
    try {
        data = await api('GET', `?day=${todayYmd()}`);
        if (!quiet) showError('');
        render();
        if (detailId) { const d = data.activities.find((a) => a.id === detailId); if (!d) closeModal(); }
    } catch (err) {
        if (!quiet) showError(errText(err));
    }
}

// ---- ventanas ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
let overlay = null;
function closeModal() { if (overlay) { overlay.remove(); overlay = null; detailId = null; document.removeEventListener('keydown', onKey); } }
function onKey(event) { if (event.key === 'Escape') closeModal(); }
function openModal(html, wide) {
    closeModal();
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    overlay.innerHTML = `<div class="modal-panel exp-panel wp-modal tw-modal${wide ? ' tw-modal-wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) closeModal(); });
    return overlay;
}
const fieldErr = (id) => `<p class="admin-error" id="${id}" role="alert" hidden></p>`;
function setErr(id, text) { const el = overlay && overlay.querySelector(`#${id}`); if (el) { el.textContent = text || ''; el.hidden = !text; } }

// una pregunta corta con su motivo (pausar, regresar, cancelar)
function askReason(titleKey, onOk, optional) {
    const prev = detailId;
    const ov = openModal(`<h3>${esc(t(titleKey))}</h3><div class="admin-field"><label for="tw-reason">${esc(t(optional ? 'main.twComment' : 'main.twReason'))}</label><input id="tw-reason" type="text" maxlength="300" autocomplete="off"></div>${fieldErr('tw-r-error')}
        <div class="admin-form-actions"><button type="button" class="btn" data-tw-m="ok">${esc(t('main.wpSave'))}</button><button type="button" class="btn btn-secondary" data-tw-m="cancel">${esc(t('main.wpCancel'))}</button></div>`);
    detailId = prev;
    const input = ov.querySelector('#tw-reason');
    setTimeout(() => input.focus(), 0);
    const go = async () => { const reason = input.value.trim(); if (!reason && !optional) { setErr('tw-r-error', t('main.twErr_TEAM_REASON_REQUIRED')); return; } try { await onOk(reason); } catch (err) { setErr('tw-r-error', errText(err)); } };
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); go(); } });
    ov.addEventListener('click', (event) => { const b = event.target.closest('[data-tw-m]'); if (!b) return; if (b.dataset.twM === 'cancel') closeModal(); else go(); });
}

// la lista de personas con buscador, en dos grupos (mi equipo y las demás)
function peopleList(selected, excluded, name) {
    const ex = new Set(excluded || []);
    const field = name || 'tw-p';
    const row = (p) => `<label class="tw-person" data-name="${esc(fold(p.name))}"><input type="checkbox" name="${field}" value="${p.id}"${selected.has(p.id) ? ' checked' : ''}>${avatar(p.id, p.name, p.photoVer)}<span class="tw-person-name">${esc(p.name)}</span>${p.absent ? `<em class="tw-absent">${esc(t('main.twAbsentTag'))}${p.absence ? ` · ${esc(t(`main.twAbsence_${p.absence}`))}` : ''}</em>` : ''}${p.free ? `<em class="tw-free">${esc(t('main.twFree'))}</em>` : ''}${p.hasScreen === false ? `<em class="tw-noscreen">${esc(t('main.twNoScreen'))}</em>` : ''}</label>`;
    const mine = data.people.filter((p) => p.mine && !ex.has(p.id));
    const others = data.people.filter((p) => !p.mine && !ex.has(p.id));
    return `<div class="tw-people"><input type="search" class="tw-people-q" placeholder="${esc(t('main.twPeopleSearch'))}" aria-label="${esc(t('main.twPeopleSearch'))}" autocomplete="off">
        ${mine.length ? `<h5>${esc(t('main.twPeopleTeam'))}</h5>${mine.map(row).join('')}` : ''}${others.length ? `<h5>${esc(t('main.twPeopleOthers'))}</h5>${others.map(row).join('')}` : ''}</div>`;
}
function bindPeople(ov, onChange) {
    ov.querySelectorAll('.tw-people-q').forEach((q) => q.addEventListener('input', () => { const text = fold(q.value); q.closest('.tw-people').querySelectorAll('.tw-person').forEach((el) => { el.hidden = !!text && !el.dataset.name.includes(text); }); }));
    ov.addEventListener('change', (event) => { if (event.target.name === 'tw-p' && onChange) onChange(); });
}
const checkedPeople = (ov, name) => [...ov.querySelectorAll(`input[name="${name || 'tw-p'}"]:checked`)].map((i) => Number(i.value));
// «¿Quién puede tomarla?» y cuántas personas se necesitan (al dejarla por asignar, o al abrir una ya repartida a que otras la tomen)
function claimFields(a, withNone) {
    const current = a.claimScope === undefined ? 'team_dept' : a.claimScope;
    const scopes = [...(withNone ? [''] : []), ...CLAIM_SCOPES];
    return `<div class="admin-field" data-help-key="twClaim"><label for="tw-claim">${esc(t('main.twClaim'))}</label><select id="tw-claim">${scopes.map((sc) => `<option value="${sc}"${current === sc ? ' selected' : ''}>${esc(t(sc ? `main.twClaim_${sc}` : 'main.twClaim_none'))}</option>`).join('')}</select></div>
        <div id="tw-claim-chosen"${current === 'chosen' ? '' : ' hidden'}>${peopleList(new Set(a.claimUserIds || []), [], 'tw-c')}</div>
        <div class="admin-field" id="tw-seats-box"${current ? '' : ' hidden'}><label for="tw-seats">${esc(t('main.twF_seats'))}</label><input id="tw-seats" type="number" min="1" max="20" value="${a.seatsNeeded || 1}"></div>`;
}

// crear o cambiar una actividad
function activityForm(existing, prefill) {
    const a = existing || { title: '', description: '', kind: 'eventual', urgent: false, realization: 'presencial', sites: [], department: '', area: '', dueDate: '', seatsNeeded: 1, ...(prefill || {}) };
    const siteIds = new Set(a.sites.map((s) => s.id));
    const radio = (name, value, label, checked) => `<label class="tw-opt"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}><span>${esc(label)}</span></label>`;
    const areas = [...new Set(data.activities.map((x) => x.area).filter(Boolean))];
    const html = `<h3 id="tw-f-title">${esc(t(existing ? 'main.twEditTitle' : 'main.twCreate'))}</h3>
        <form id="tw-form" novalidate>
        <div class="admin-field"><label for="tw-title">${esc(t('main.twF_title'))}</label><input id="tw-title" type="text" maxlength="160" value="${esc(a.title)}" autocomplete="off"></div>
        <fieldset class="tw-set"><legend>${esc(t('main.twKind'))}</legend><div class="tw-opts">${KINDS.map((k) => radio('tw-kind', k, kindLabel(k), a.kind === k)).join('')}<label class="tw-opt tw-opt-urg"><input type="checkbox" id="tw-urgent"${a.urgent ? ' checked' : ''}><span>⚡ ${esc(t('main.twUrgentTag'))}</span></label></div></fieldset>
        <fieldset class="tw-set"><legend>${esc(t('main.twRealization'))}</legend><div class="tw-opts">${REALS.map((r) => radio('tw-real', r, realLabel(r), a.realization === r)).join('')}</div></fieldset>
        <fieldset class="tw-set"><legend>${esc(t('main.twF_sites'))}</legend><div class="tw-opts">${data.sites.map((s) => `<label class="tw-opt"><input type="checkbox" name="tw-site" value="${s.id}"${siteIds.has(s.id) ? ' checked' : ''}><span>${esc(s.name)}</span></label>`).join('') || `<small>${esc(t('main.twNoSites'))}</small>`}</div></fieldset>
        <div class="tw-two"><div class="admin-field"><label for="tw-dept">${esc(t('main.twDept'))}</label><select id="tw-dept"><option value="">—</option>${data.departments.map((d) => `<option value="${esc(d.key)}"${a.department === d.key ? ' selected' : ''}>${esc(deptName(d.key))}</option>`).join('')}</select></div>
            <div class="admin-field"><label for="tw-area">${esc(t('main.twArea'))}</label><input id="tw-area" type="text" maxlength="60" list="tw-areas" value="${esc(a.area)}" autocomplete="off"><datalist id="tw-areas">${areas.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div></div>
        <div class="admin-field"><label for="tw-due">${esc(t('main.twF_due'))}</label><input id="tw-due" type="date" value="${esc(a.dueDate)}"></div>
        <div class="admin-field" data-help-key="twRepeat"><label for="tw-repeat-every">${esc(t('main.twF_repeat'))}</label><div class="tw-repeat-row"><input id="tw-repeat-every" type="number" min="1" max="${a.repeat ? REPEAT_MAX[a.repeat.unit] : 365}" value="${a.repeat ? a.repeat.every : 1}"><select id="tw-repeat-unit" aria-label="${esc(t('main.twF_repeat'))}"><option value="">${esc(t('main.twRepNone'))}</option>${REPEAT_UNITS.map((u) => `<option value="${u}"${a.repeat && a.repeat.unit === u ? ' selected' : ''}>${esc(t(`main.twRepUnit_${u}`))}</option>`).join('')}</select></div></div>
        <div class="admin-field"><label for="tw-desc">${esc(t('main.twF_description'))}</label><textarea id="tw-desc" rows="2" maxlength="1000">${esc(a.description)}</textarea></div>
        <div class="admin-field" data-help-key="twPlanLink"><label for="tw-plan">${esc(t('main.twPlanLink'))}</label><select id="tw-plan"><option value="">${esc(t('main.twPlanNone'))}</option>${a.plan ? `<option value="${a.plan.itemId}" selected>${esc(a.plan.path)}</option>` : ''}</select></div>
        ${existing ? '' : `<fieldset class="tw-set"><legend>${esc(t('main.twF_who'))}</legend><div class="tw-opts">${radio('tw-who', 'now', t('main.twWho_now'), true)}${radio('tw-who', 'later', t('main.twWho_later'), false)}</div>
            <div id="tw-who-now">${peopleList(new Set(a.userIds || []), [])}<div class="admin-field" id="tw-principal-box" hidden><label for="tw-principal">${esc(t('main.twF_principal'))}</label><select id="tw-principal"></select></div></div>
            <div id="tw-who-later" hidden>${claimFields(a, false)}</div></fieldset>`}
        ${existing ? claimFields(existing, true) : ''}
        ${fieldErr('tw-form-error')}
        <div class="admin-form-actions"><button type="submit" class="btn">${esc(t('main.wpSave'))}</button><button type="button" class="btn btn-secondary" data-tw-m="cancel">${esc(t('main.wpCancel'))}</button></div></form>`;
    const ov = openModal(html, true);
    ov.querySelector('.modal-panel').setAttribute('aria-labelledby', 'tw-f-title');
    const refreshPrincipal = () => {
        const box = ov.querySelector('#tw-principal-box');
        if (!box) return;
        const ids = checkedPeople(ov);
        box.hidden = ids.length < 2;
        const select = ov.querySelector('#tw-principal');
        const prev = select.value;
        select.innerHTML = `<option value="">${esc(t('main.twNoPrincipal'))}</option>${ids.map((id) => `<option value="${id}"${String(id) === prev ? ' selected' : ''}>${esc((data.people.find((p) => p.id === id) || {}).name || '')}</option>`).join('')}`;
    };
    bindPeople(ov, refreshPrincipal);
    if (prefill && prefill.userIds && prefill.userIds.length) refreshPrincipal();
    // los renglones que se pueden ligar (de los planes donde se puede escribir); si viene uno de Planes, ya sale elegido
    const planSelect = ov.querySelector('#tw-plan');
    const addPlanOption = (it, selected) => {
        if ([...planSelect.options].some((o) => o.value === String(it.itemId))) return;
        const o = document.createElement('option');
        o.value = String(it.itemId); o.textContent = it.label; o.dataset.title = it.title; o.dataset.end = it.endDate || ''; o.selected = !!selected;
        planSelect.appendChild(o);
    };
    if (prefill && prefill.item) addPlanOption(prefill.item, true);
    api('GET', '/plan-items').then((out) => { out.items.forEach((it) => addPlanOption(it, false)); }).catch(() => { /* sin la lista el selector queda en «Sin plan» */ });
    planSelect.addEventListener('change', () => {
        const o = planSelect.selectedOptions[0];
        if (existing || !o || !o.dataset.title) return;
        if (!ov.querySelector('#tw-title').value.trim()) ov.querySelector('#tw-title').value = o.dataset.title;
        if (!ov.querySelector('#tw-due').value && o.dataset.end) ov.querySelector('#tw-due').value = o.dataset.end;
    });
    // «Se repite cada» solo vale para una Periódica; el número solo cuando hay unidad, y su tope cambia con la unidad
    const syncRepeat = () => {
        const per = (ov.querySelector('input[name="tw-kind"]:checked') || {}).value === 'periodica';
        const unit = ov.querySelector('#tw-repeat-unit');
        const every = ov.querySelector('#tw-repeat-every');
        if (!per) unit.value = '';
        unit.disabled = !per;
        every.disabled = !per || !unit.value;
        every.max = String(REPEAT_MAX[unit.value] || 365);
        if (Number(every.value) > Number(every.max)) every.value = every.max;
    };
    syncRepeat();
    ov.addEventListener('change', (event) => {
        if (event.target.name === 'tw-kind' || event.target.id === 'tw-repeat-unit') syncRepeat();
        if (event.target.name === 'tw-who') { const now = event.target.value === 'now'; ov.querySelector('#tw-who-now').hidden = !now; ov.querySelector('#tw-who-later').hidden = now; }
        if (event.target.id === 'tw-claim') { ov.querySelector('#tw-claim-chosen').hidden = event.target.value !== 'chosen'; ov.querySelector('#tw-seats-box').hidden = !event.target.value; }
    });
    ov.addEventListener('click', (event) => { if (event.target.closest('[data-tw-m="cancel"]')) closeModal(); });
    ov.querySelector('#tw-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const val = (id) => ov.querySelector(id).value;
        const body = {
            title: val('#tw-title'), kind: (ov.querySelector('input[name="tw-kind"]:checked') || {}).value, urgent: ov.querySelector('#tw-urgent').checked, realization: (ov.querySelector('input[name="tw-real"]:checked') || {}).value,
            siteIds: [...ov.querySelectorAll('input[name="tw-site"]:checked')].map((i) => Number(i.value)), department: val('#tw-dept'), area: val('#tw-area'), dueDate: val('#tw-due'), description: val('#tw-desc'), day: todayYmd(), confirmAbsent: ov.dataset.absentOk === '1' ? true : undefined,
        };
        const seats = ov.querySelector('#tw-seats');
        if (seats) body.seatsNeeded = Number(seats.value) || 1;
        // la repetición: al crear solo se manda si se eligió; al cambiar, también para dejar de repetir; y el calendario de quien la pone (para el «hoy» de cada vuelta)
        { const unit = ov.querySelector('#tw-repeat-unit').value; if (existing ? (existing.repeat || unit) : unit) { body.repeatUnit = unit; if (unit) body.repeatEvery = Number(ov.querySelector('#tw-repeat-every').value) || 1; } body.tzOffset = new Date().getTimezoneOffset(); }
        const claim = ov.querySelector('#tw-claim');
        const wantsClaim = existing || (ov.querySelector('input[name="tw-who"]:checked') || {}).value === 'later';
        if (claim && wantsClaim) { body.claimScope = claim.value; if (claim.value === 'chosen') body.claimUserIds = checkedPeople(ov, 'tw-c'); }
        { const wanted = planSelect.value ? Number(planSelect.value) : null; const current = existing && existing.plan ? existing.plan.itemId : null; if (existing ? wanted !== current : wanted) body.planItemId = wanted; }
        const submit = ov.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            if (existing) { await api('PATCH', `/${existing.id}`, body); Dashboard.showToast(t('main.twSaved'), 'success'); }
            else {
                const later = (ov.querySelector('input[name="tw-who"]:checked') || {}).value === 'later';
                if (!later) { body.userIds = checkedPeople(ov); const principal = ov.querySelector('#tw-principal'); if (principal && principal.value) body.principalUserId = Number(principal.value); }
                const out = await api('POST', '', body);
                Dashboard.showToast(t('main.twCreated'), 'success');
                detailId = out.activity.id;
            }
            await load(true);
            closeModal();
        } catch (err) {
            if (absentCode(err)) { ov.dataset.absentOk = '1'; setErr('tw-form-error', absentText(err.body.names)); submit.textContent = t('main.twAbsentGo'); } else setErr('tw-form-error', errText(err));
            submit.disabled = false;
        }
    });
    setTimeout(() => ov.querySelector('#tw-title').focus(), 0);
}

// el detalle de una actividad con lo que lleva cada persona y su línea de pasos
function eventText(e) {
    if (/^repeat_/.test(e.event) && String(e.detail || '').includes(':')) { const [unit, every] = e.detail.split(':'); return t(`main.twEv_${e.event}`, { rep: repeatText(unit, Number(every)).toLowerCase() }); }
    const who = e.userName || '';
    return t(`main.twEv_${e.event}`, { name: who, to: e.pass ? e.pass.toNames.join(', ') : '' });
}
async function openDetail(id) {
    let out;
    try { out = await api('GET', `/${id}`); } catch (err) { showError(errText(err)); return; }
    const a = out.activity;
    detailId = id;
    const c = a.can;
    const btn = (op, cls) => `<button type="button" class="btn${cls || ' btn-secondary'} tw-small" data-tw="act" data-act="${op}" data-id="${a.id}">${esc(t(`main.twAct_${op}`))}</button>`;
    const actions = [c.claim && btn('claim', ''), c.confirm && btn('confirm', ''), c.start && btn('start', c.confirm ? ' btn-secondary' : ''), c.pause && btn('pause'), c.resume && btn('resume', ''), c.submit && btn('submit', ''), c.validate && btn('validate', ''), c.returnIt && btn('return'), c.pass && btn('pass'),
        c.edit && btn('edit'), c.assign && btn('assign'), c.cancel && btn('cancel')].filter(Boolean).join('');
    const rows = a.assignees.map((x) => `<li class="tw-asg tw-ps-${x.status}">${avatar(x.userId, x.name, x.photoVer, x.isMine || x.isMe ? '' : 'tw-av-out')}<div><b>${esc(x.name)}${x.isPrincipal ? ` <em>${esc(t('main.twPrincipal'))}</em>` : ''}</b><small>${esc(t(`main.twPs_${x.status}`))}${x.status === 'paused' && x.pauseReason ? ` · ${esc(x.pauseReason)}` : ''}</small></div>${c.unassign && ['assigned', 'confirmed'].includes(x.status) ? `<button type="button" class="admin-icon-btn" data-tw="unassign" data-id="${a.id}" data-user="${x.userId}" aria-label="${esc(t('main.twAct_unassign'))}" title="${esc(t('main.twAct_unassign'))}"><i class="bx bx-x" aria-hidden="true"></i></button>` : ''}</li>`).join('');
    const events = a.events.map((e) => `<li class="tw-ev tw-ev-${e.event}"><span class="tw-ev-dot" aria-hidden="true"></span><div><b>${esc(eventText(e))}</b><small>${esc(e.actorName || t('main.twAuto'))} · ${esc(whenText(e.createdAt))}</small>${e.detail && ['paused', 'returned', 'cancelled', 'pass_requested', 'passed', 'pass_approved', 'pass_rejected', 'pass_cancelled', 'plan_linked'].includes(e.event) ? `<span class="tw-ev-note">${esc(e.detail)}</span>` : ''}</div></li>`).join('');
    const passes = a.passes.map((p) => passCard(p, a, false)).join('');
    const claimLine = a.claimScope && a.seatsOpen > 0 && a.status !== 'done' ? [t('main.twClaimLine', { who: t(`main.twClaim_${a.claimScope}`), n: a.seatsOpen }), a.claim && (c.edit || c.assign) ? (a.claim.freeCount ? t('main.twFreeCan', { names: a.claim.freeNames.join(', ') + (a.claim.freeCount > a.claim.freeNames.length ? ` +${a.claim.freeCount - a.claim.freeNames.length}` : '') }) : t('main.twFreeNone')) : ''].filter(Boolean).join(' · ') : '';
    const planLine = a.plan ? `<p class="tw-meta tw-meta-plan"><i class="bx bx-link" aria-hidden="true"></i> ${a.plan.canOpen ? `<a href="PlanesTrabajo.html#plan=${a.plan.planId}&item=${a.plan.itemId}">${esc(a.plan.path)}</a>` : esc(a.plan.path)}</p>` : '';
    const repLine = a.repeat ? `<p class="tw-meta tw-meta-rep"><i class="bx bx-refresh" aria-hidden="true"></i> ${esc([repeatText(a.repeat.unit, a.repeat.every), t('main.twRepNext', { date: dayText(a.repeat.nextDue) }), a.repeat.waiting ? t('main.twRepWaiting') : ''].filter(Boolean).join(' · '))}</p>` : '';
    const meta = [realLabel(a.realization), a.sites.map((s) => s.name).join(', '), deptName(a.department), a.area, a.dueDate ? t('main.twDue', { date: dayText(a.dueDate) }) : ''].filter(Boolean);
    const ov = openModal(`<div class="tw-detail-head"><h3 id="tw-d-title">${esc(a.title)}</h3><button type="button" class="admin-icon-btn" data-tw-m="cancel" aria-label="${esc(t('main.twClose'))}" title="${esc(t('main.twClose'))}"><i class="bx bx-x" aria-hidden="true"></i></button></div>
        <div class="tw-chips"><span class="tw-kind tw-k-${a.kind}">${esc(kindLabel(a.kind))}</span>${a.urgent ? `<span class="tw-urg">⚡ ${esc(t('main.twUrgentTag'))}</span>` : ''}<span class="tw-state tw-state-${a.status}">${esc(t(`main.twLane_${a.status}`))}</span></div>
        <p class="tw-meta">${esc(meta.join(' · '))}</p>${planLine}${repLine}${claimLine ? `<p class="tw-meta tw-meta-claim">${esc(claimLine)}</p>` : ''}${a.description ? `<p class="tw-desc">${esc(a.description)}</p>` : ''}
        <p class="tw-created">${esc(t(a.autoBorn ? 'main.twD_recurred' : 'main.twD_created', { name: a.createdBy.name, date: whenText(a.createdAt) }))}</p>
        <h4>${esc(t('main.twD_assignees'))}</h4>${rows ? `<ul class="tw-asgs">${rows}</ul>` : `<p class="tw-none">${esc(t('main.twNoPeople'))} · ${esc(t('main.twSeats', { n: a.seatsNeeded }))}</p>`}
        ${passes ? `<h4>${esc(t('main.twPasses'))}</h4><div class="tw-pass-list">${passes}</div>` : ''}
        ${actions ? `<div class="tw-detail-act">${actions}</div>` : ''}${fieldErr('tw-d-error')}
        <h4>${esc(t('main.twD_timeline'))}</h4><ol class="tw-events" data-help-key="twTimeline">${events}</ol>`, true);
    ov.querySelector('.modal-panel').setAttribute('aria-labelledby', 'tw-d-title');
    ov.addEventListener('click', (event) => { if (event.target.closest('[data-tw-m="cancel"]')) closeModal(); });
}
function assignModal(a) {
    const have = a.assignees.map((x) => x.userId);
    const ov = openModal(`<h3>${esc(t('main.twAct_assign'))}</h3><p class="admin-hint">${esc(a.title)}</p>${peopleList(new Set(), have)}${fieldErr('tw-a-error')}
        <div class="admin-form-actions"><button type="button" class="btn" data-tw-m="ok">${esc(t('main.wpSave'))}</button><button type="button" class="btn btn-secondary" data-tw-m="cancel">${esc(t('main.wpCancel'))}</button></div>`);
    bindPeople(ov);
    ov.addEventListener('click', async (event) => {
        const b = event.target.closest('[data-tw-m]');
        if (!b) return;
        if (b.dataset.twM === 'cancel') { closeModal(); return; }
        const ids = checkedPeople(ov);
        if (!ids.length) { setErr('tw-a-error', t('main.twErr_TEAM_PERSON_INVALID')); return; }
        try { await api('POST', `/${a.id}/assign`, { userIds: ids, day: todayYmd(), confirmAbsent: ov.dataset.absentOk === '1' ? true : undefined }); await load(true); Dashboard.showToast(t('main.twAssigned'), 'success'); closeModal(); } catch (err) { if (absentCode(err)) { ov.dataset.absentOk = '1'; setErr('tw-a-error', absentText(err.body.names)); b.textContent = t('main.twAbsentGo'); } else setErr('tw-a-error', errText(err)); }
    });
}
// Pasar una actividad a otra persona: quién la pasa (si el que mira puede pasar la de varias), a quién y el motivo. Con jefe directo se pide su aprobación; si no, se hace al momento y se avisa a todos (lo decide el servidor).
function passModal(a) {
    const meId = data.me.id;
    const fromIds = a.can.passUserIds;
    const nameOfUser = (id) => (a.assignees.find((x) => x.userId === id) || {}).name || '';
    const fromBox = fromIds.length > 1 ? `<div class="admin-field"><label for="tw-p-from">${esc(t('main.twPassFrom'))}</label><select id="tw-p-from">${fromIds.map((id) => `<option value="${id}"${id === meId ? ' selected' : ''}>${esc(nameOfUser(id))}</option>`).join('')}</select></div>` : `<p class="tw-pass-from">${esc(t('main.twPassFrom'))}: <b>${esc(nameOfUser(fromIds[0]))}</b></p>`;
    const ov = openModal(`<h3 data-help-key="twPass">${esc(t('main.twPassTitle'))}</h3><p class="admin-hint">${esc(a.title)}</p>${fromBox}<h4>${esc(t('main.twPassTo'))}</h4>${peopleList(new Set(), a.assignees.map((x) => x.userId))}
        <div class="admin-field"><label for="tw-p-reason">${esc(t('main.twReason'))}</label><input id="tw-p-reason" type="text" maxlength="300" autocomplete="off"></div>
        <div class="tw-approve" id="tw-p-info" role="status"></div>${fieldErr('tw-p-error')}
        <div class="admin-form-actions"><button type="button" class="btn" id="tw-p-go" data-tw-m="ok"></button><button type="button" class="btn btn-secondary" data-tw-m="cancel">${esc(t('main.wpCancel'))}</button></div>`);
    bindPeople(ov);
    const fromNow = () => (fromIds.length > 1 ? Number(ov.querySelector('#tw-p-from').value) : fromIds[0]);
    const approverNow = () => (fromNow() === meId ? a.passApprover : null);
    const sync = () => { const approver = approverNow(); ov.querySelector('#tw-p-info').textContent = approver ? t('main.twPassApprover', { name: approver.name }) : t('main.twPassDirect'); ov.querySelector('#tw-p-go').textContent = t(approver ? 'main.twPassAsk' : 'main.twPassDo'); };
    sync();
    const select = ov.querySelector('#tw-p-from');
    if (select) select.addEventListener('change', sync);
    ov.addEventListener('click', async (event) => {
        const b = event.target.closest('[data-tw-m]');
        if (!b) return;
        if (b.dataset.twM === 'cancel') { closeModal(); return; }
        const ids = checkedPeople(ov);
        const reason = ov.querySelector('#tw-p-reason').value.trim();
        if (!ids.length) { setErr('tw-p-error', t('main.twErr_TEAM_PERSON_INVALID')); return; }
        if (!reason) { setErr('tw-p-error', t('main.twErr_TEAM_REASON_REQUIRED')); return; }
        const asked = !!approverNow();
        try { await api('POST', `/${a.id}/pass`, { fromUserId: fromNow(), userIds: ids, reason, day: todayYmd(), confirmAbsent: ov.dataset.absentOk === '1' ? true : undefined }); await load(true); Dashboard.showToast(t(asked ? 'main.twPassAsked' : 'main.twPassDone'), 'success'); closeModal(); } catch (err) { if (absentCode(err)) { ov.dataset.absentOk = '1'; setErr('tw-p-error', absentText(err.body.names)); b.textContent = t('main.twAbsentGo'); } else setErr('tw-p-error', errText(err)); }
    });
}
const find = (id) => data.activities.find((a) => a.id === Number(id));
async function doAct(id, op, passId) {
    const a = find(id);
    const run = async (path, body, done) => { try { await api('POST', `/${id}/${path}`, body || {}); await load(true); if (done) done(); if (detailId === Number(id) && overlay) await openDetail(Number(id)); } catch (err) { if (overlay && overlay.querySelector('#tw-d-error')) setErr('tw-d-error', errText(err)); else showError(errText(err)); await load(true); } };
    if (op === 'edit') { const out = await api('GET', `/${id}`).catch(() => null); if (out) activityForm(out.activity); return; }
    if (op === 'assign') { if (a) assignModal(a); return; }
    if (op === 'pass') { if (a) passModal(a); return; }
    if (op === 'pass-reject') { askReason('main.twPassRejectTitle', async (reason) => { await api('POST', `/${id}/pass-reject`, { passId: Number(passId), reason }); await load(true); closeModal(); }, true); return; }
    if (op === 'pass-approve' || op === 'pass-cancel') { await run(op, { passId: Number(passId) }, () => Dashboard.showToast(t(op === 'pass-approve' ? 'main.twPassApproved' : 'main.twPassWithdrawn'), 'success')); return; }
    if (op === 'claim') { await run(op, {}, () => Dashboard.showToast(t('main.twClaimed'), 'success')); return; }
    if (op === 'pause') { askReason('main.twReasonPause', async (reason) => { await api('POST', `/${id}/pause`, { reason }); await load(true); closeModal(); }); return; }
    if (op === 'return') { askReason('main.twReasonReturn', async (reason) => { await api('POST', `/${id}/return`, { reason }); await load(true); closeModal(); }); return; }
    if (op === 'cancel') { askReason('main.twReasonCancel', async (reason) => { await api('POST', `/${id}/cancel`, { reason }); await load(true); closeModal(); Dashboard.showToast(t('main.twCancelled'), 'success'); }); return; }
    await run(op);
}

// ---- PIEZA 3: línea del tiempo y Registro ------------------------------------------------------------------------------------------------------------------------------------
// Dos vistas más con los MISMOS filtros que el tablero. Los pasos de cada persona los entrega el servidor (GET /timeline y /log, solo lectura); el cálculo de tramos, tiempos y archivos está en TeamTimeline.js.
const dateText = (value) => { const d = value instanceof Date ? value : new Date(value); if (Number.isNaN(d.getTime())) return ''; const months = locale() === 'en-US' ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] : ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']; return `${pad2(d.getDate())}/${months[d.getMonth()]}/${d.getFullYear()}`; };
const dateTimeText = (ms) => { const d = new Date(ms); return Number.isNaN(d.getTime()) ? '' : `${dateText(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const shortDay = (d) => d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
const durText = (ms) => (ms == null ? '—' : window.TeamTimeline.durationText(ms, { min: (n) => t('main.twDur_min', { n }), h: (n) => t('main.twDur_h', { n }), d: (n) => t(n === 1 ? 'main.twDur_d1' : 'main.twDur_d', { n }) }));
const stepText = (m) => {
    if (m.type === 'assigned' && m.via === 'pass') return t('main.twStep_assigned_pass', { name: m.fromName });
    return t(`main.twStep_${m.type}`, { to: (m.toNames || []).join(', ') });
};
const stepTitle = (m) => [stepText(m), dateTimeText(m.at), m.by, m.note].filter(Boolean).join(' · ');

// el periodo de cada vista (día calendario de quien mira; el servidor recibe los instantes)
const periodRange = (which) => {
    const p = periods[which];
    const now = new Date();
    const day = (y, m, d) => new Date(y, m, d, 0, 0, 0, 0);
    const today = day(now.getFullYear(), now.getMonth(), now.getDate());
    const plus = (d, n) => day(d.getFullYear(), d.getMonth(), d.getDate() + n);
    let from; let to = plus(today, 1);
    const days = /^(\d+)d$/.exec(p.kind);
    if (days) from = plus(today, -(Number(days[1]) - 1));
    else if (p.kind === 'week') { from = plus(today, -((today.getDay() + 6) % 7)); to = plus(from, 7); }
    else if (p.kind === 'month') { from = day(now.getFullYear(), now.getMonth(), 1); to = day(now.getFullYear(), now.getMonth() + 1, 1); }
    else if (p.kind === 'prev') { from = day(now.getFullYear(), now.getMonth() - 1, 1); to = day(now.getFullYear(), now.getMonth(), 1); }
    else if (p.kind === 'year') { from = day(now.getFullYear(), 0, 1); to = day(now.getFullYear() + 1, 0, 1); }
    else if (p.kind === 'all') from = plus(today, -1820);
    else {
        const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.from); const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.to);
        from = a ? day(Number(a[1]), Number(a[2]) - 1, Number(a[3])) : plus(today, -13);
        to = b ? plus(day(Number(b[1]), Number(b[2]) - 1, Number(b[3])), 1) : plus(today, 1);
        if (to <= from) to = plus(from, 1);
    }
    return { from, to, fromMs: from.getTime(), toMs: to.getTime() };
};
const periodQuery = (r) => `?from=${encodeURIComponent(r.from.toISOString())}&to=${encodeURIComponent(r.to.toISOString())}`;
async function loadLine(quiet) {
    const range = periodRange('line');
    try { lineData = { ...(await api('GET', `/timeline${periodQuery(range)}`)), range }; if (!quiet) showError(''); } catch (err) { if (!quiet) showError(errText(err)); }
    render();
}
async function loadLog(quiet) {
    const range = periodRange('log');
    try { logData = { ...(await api('GET', `/log${periodQuery(range)}`)), range }; logShown = LOG_PAGE; if (!quiet) showError(''); } catch (err) { if (!quiet) showError(errText(err)); }
    render();
}
const loadView = (quiet) => (view === 'line' ? loadLine(quiet) : view === 'log' ? loadLog(quiet) : load(quiet));
// lo que alimenta los filtros de la vista (personas, áreas): el tablero, la línea del tiempo o el Registro
const viewItems = () => (view === 'line' ? (lineData ? lineData.activities : []) : view === 'log' ? (logData ? logData.rows : []) : data.activities);
function viewPeople() {
    const seen = new Map();
    viewItems().forEach((a) => a.assignees.forEach((x) => { if (!seen.has(x.userId)) seen.set(x.userId, { id: x.userId, name: x.name }); }));
    if (view === 'board' && data.today) data.today.people.forEach((x) => { if (!seen.has(x.userId)) seen.set(x.userId, { id: x.userId, name: x.name }); });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, locale()));
}
const savePrefs = () => { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ view, lineGroup, periods })); } catch (err) { /* solo esta visita */ } };

function viewTabs() {
    return `<div class="tw-views" role="tablist" aria-label="${esc(t('main.twViews'))}" data-help-key="twViews">${VIEWS.map((v) => `<button type="button" role="tab" aria-selected="${view === v}" class="tw-view${view === v ? ' on' : ''}" data-tw="view" data-view="${v}">${esc(t(`main.twTab_${v}`))}</button>`).join('')}<small>${esc(t('main.twViewsHint'))}</small></div>`;
}
function periodControls(which) {
    const kinds = which === 'line' ? LINE_PERIODS : LOG_PERIODS;
    const p = periods[which];
    const custom = p.kind === 'custom';
    return `<label class="tw-flt" for="tw-period" data-help-key="twPeriod"><span>${esc(t('main.twPeriod'))}</span><select id="tw-period" data-which="${which}">${kinds.map((k) => `<option value="${k}"${p.kind === k ? ' selected' : ''}>${esc(t(`main.twPeriod_${k}`))}</option>`).join('')}</select></label>${custom
        ? `<label class="tw-flt" for="tw-per-from"><span>${esc(t('main.twPeriodFrom'))}</span><input id="tw-per-from" type="date" value="${esc(p.from || todayYmd())}" data-which="${which}"></label><label class="tw-flt" for="tw-per-to"><span>${esc(t('main.twPeriodTo'))}</span><input id="tw-per-to" type="date" value="${esc(p.to || todayYmd())}" data-which="${which}"></label>` : ''}`;
}
const downloadBtn = () => `<button type="button" class="btn btn-secondary tw-small" data-tw="download" data-help-key="twDownload"><i class="bx bx-download" aria-hidden="true"></i> ${esc(t('main.twDownload'))}</button>`;

// ---- línea del tiempo ----
function axisHtml(range) {
    const span = range.toMs - range.fromMs;
    const days = Math.max(1, Math.round(span / 86400000));
    const step = Math.max(1, Math.ceil(days / 12));
    const ticks = [];
    for (let i = 0; i < days; i += step) { const d = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate() + i); ticks.push(`<span style="left:${(((d.getTime() - range.fromMs) / span) * 100).toFixed(2)}%">${esc(shortDay(d))}</span>`); }
    return `<div class="tw-trk-axis"><span class="tw-trk-lab"></span><div class="tw-ax">${ticks.join('')}</div><span class="tw-trk-meta"></span></div>`;
}
function trackHtml(track, range, now) {
    const an = track.analysis;
    const segs = an.segments.map((g) => { const c = window.TeamTimeline.clipSegment(g, range.fromMs, range.toMs); return c ? `<span class="tw-seg tw-seg-${g.kind}" style="left:${c.left.toFixed(2)}%;width:${c.width.toFixed(2)}%"></span>` : ''; }).join('');
    const marks = window.TeamTimeline.spreadMarkers(an.markers, range.fromMs, range.toMs, 3.6).map((m) => { const mk = window.TeamTimeline.markOf(m.type); return `<span class="tw-mk tw-mk-${mk[1]}" style="left:${m.x.toFixed(2)}%" title="${esc(stepTitle(m))}">${mk[0]}</span>`; }).join('');
    const today = now >= range.fromMs && now <= range.toMs ? `<span class="tw-today" style="left:${(((now - range.fromMs) / (range.toMs - range.fromMs)) * 100).toFixed(2)}%"></span>` : '';
    return `<div class="tw-trk" role="img" aria-label="${esc(`${track.person.name} · ${track.activity.title}`)}">${today}${segs}${marks}</div>`;
}
function rowMeta(row) {
    const mt = row.metrics;
    const parts = [];
    if (mt.confirmAvg != null) parts.push(t(row.tracks.length > 1 ? 'main.twMetaConfirmAvg' : 'main.twMetaConfirm', { time: durText(mt.confirmAvg) }));
    if (mt.finishAvg != null) parts.push(t('main.twMetaFinish', { time: durText(mt.finishAvg) }));
    const paused = row.analyses.reduce((n, a) => n + a.pauseDurations.reduce((x, y) => x + y, 0), 0);
    if (paused > 0) parts.push(t('main.twMetaPause', { time: durText(paused) }));
    Object.entries(row.byState).forEach(([state, n]) => parts.push(t(`main.twMetaState_${state}`, { n })));
    return parts.join(' · ');
}
function lineRow(row, group, range, now) {
    const who = (p) => `<i class="tw-who" title="${esc(p.name)}">${esc(initials(p.name))}</i>`;
    const open = (activityId) => ` data-tw="open" data-id="${activityId}" tabindex="0"`;
    let label; let body;
    if (group === 'user') {
        const p = row.person;
        label = `<b>${esc(p.name)}</b><small>${esc([row.sites.join(' · '), data.me.hasTeam && !p.isMine && !p.isMe ? t('main.twOutsideTeam') : ''].filter(Boolean).join(' · '))}</small>`;
        body = `<div class="tw-trk-stack">${row.tracks.map((tr) => `<div class="tw-trk-line"${open(tr.activity.id)}><span class="tw-cap" title="${esc(tr.activity.title)}">${esc(tr.activity.title)}</span>${trackHtml(tr, range, now)}</div>`).join('')}</div>`;
    } else if (group === 'site') {
        label = `<b>${esc(row.site.name || t('main.twNoSite'))}</b><small>${esc(t(row.activities === 1 ? 'main.twActivitiesOne' : 'main.twActivitiesN', { n: row.activities }))}</small>`;
        body = `<div class="tw-trk-stack">${row.tracks.map((tr) => `<div class="tw-trk-line"${open(tr.activity.id)}><span class="tw-cap" title="${esc(tr.activity.title)}">${who(tr.person)} ${esc(tr.activity.title)}</span>${trackHtml(tr, range, now)}</div>`).join('')}</div>`;
    } else {
        const a = row.activity;
        label = `<b>${esc(a.title)}</b><small><span class="tw-kind">${esc(kindLabel(a.kind))}</span>${a.urgent ? ' ⚡' : ''} ${esc([a.assignees.map((x) => x.name).join(' + '), a.sites.map((s) => s.name).join(', '), realLabel(a.realization)].filter(Boolean).join(' · '))}</small>`;
        body = row.tracks.length > 1
            ? `<div class="tw-trk-stack">${row.tracks.map((tr) => `<div class="tw-trk-line">${who(tr.person)}${trackHtml(tr, range, now)}</div>`).join('')}</div>`
            : (row.tracks[0] ? trackHtml(row.tracks[0], range, now) : '');
    }
    return `<div class="tw-trk-row"${group === 'activity' ? open(row.activity.id) : ''}><div class="tw-trk-lab">${label}</div><div class="tw-trk-body">${body}</div><span class="tw-trk-meta">${esc(rowMeta(row))}</span></div>`;
}
const LEGEND = [['assigned', 'a'], ['confirmed', 'c'], ['started', 'r'], ['paused', 'p'], ['submitted', 'v'], ['returned', 'b'], ['validated', 't'], ['passed', 'x']];
function lineView() {
    const controls = `<div class="tw-view-head">${periodControls('line')}<div class="tw-seg2" role="radiogroup" aria-label="${esc(t('main.twGroupBy'))}" data-help-key="twGroup">${GROUPS.map((g) => `<label><input type="radio" name="tw-group" value="${g}"${lineGroup === g ? ' checked' : ''}><span>${esc(t(`main.twGroup_${g}`))}</span></label>`).join('')}</div>${downloadBtn()}</div>`;
    if (!lineData) return controls;
    const range = lineData.range;
    const now = Date.now();
    const acts = lineData.activities.filter(matches);
    const analyses = acts.flatMap((a) => a.people.map((p) => window.TeamTimeline.analyze(p.steps, now)));
    const mt = window.TeamTimeline.metrics(analyses);
    const tile = (value, label) => `<div class="tw-cnt"><b>${esc(value)}</b><small>${esc(label)}</small></div>`;
    const rows = window.TeamTimeline.build(acts, lineGroup, now);
    const legend = `<div class="tw-legend" data-help-key="twLegend">${LEGEND.map(([type, cls]) => `<span class="tw-mk tw-mk-${cls}">${window.TeamTimeline.markOf(type)[0]}</span>${esc(t(`main.twLegend_${type}`))}`).join(' ')}</div>`;
    return `${controls}${legend}<div class="tw-counters tw-tiles" role="list" data-help-key="twTiles">${tile(durText(mt.confirmAvg), t('main.twTileConfirm'))}${tile(durText(mt.finishAvg), t('main.twTileFinish'))}${tile(durText(mt.pauseAvg), t('main.twTilePause'))}${tile(mt.returns, t('main.twTileReturns'))}</div>
        ${lineData.truncated ? `<p class="tw-empty">${esc(t('main.twTruncated'))}</p>` : ''}${rows.length ? `<div class="tw-trk-wrap">${axisHtml(range)}${rows.map((r) => lineRow(r, lineGroup, range, now)).join('')}</div>` : `<p class="tw-empty">${esc(t('main.twLineEmpty'))}</p>`}`;
}

// ---- Registro ----
function logView() {
    const controls = `<div class="tw-view-head">${periodControls('log')}${downloadBtn()}</div>`;
    if (!logData) return controls;
    const rows = logData.rows.filter(matches);
    const shown = rows.slice(0, logShown);
    const cell = (r) => `<tr class="tw-log-row" data-tw="open" data-id="${r.activityId}" tabindex="0"><td>${esc(dateText(r.doneAt))}</td><td>${r.urgent ? '⚡ ' : ''}${esc(r.title)}</td><td>${esc(r.person.name)}${data.me.hasTeam && !r.person.isMine && !r.person.isMe ? ` <small>(${esc(t('main.twOutsideTeam'))})</small>` : ''}</td><td><span class="tw-kind tw-k-${r.kind}">${esc(kindLabel(r.kind))}</span></td><td>${esc(realLabel(r.realization))}</td><td>${esc(r.sites.map((s) => s.name).join(', '))}</td><td>${esc(deptName(r.department))}</td><td>${esc(r.plan ? r.plan.planTitle : '')}</td><td class="tw-num">${r.days}</td><td>${esc(r.validatedByName)}</td></tr>`;
    const head = ['done', 'activity', 'person', 'kind', 'realization', 'site', 'department', 'plan', 'days', 'validator'];
    return `${controls}<p class="tw-log-count" role="status">${esc(t(rows.length === 1 ? 'main.twLogRowsOne' : 'main.twLogRows', { n: rows.length }))}${logData.truncated ? ` · ${esc(t('main.twTruncated'))}` : ''}</p>
        ${rows.length ? `<div class="tw-log-scroll"><table class="tw-log" aria-label="${esc(t('main.twTab_log'))}" data-help-key="twLog"><thead><tr>${head.map((k) => `<th scope="col"${k === 'days' ? ' class="tw-num"' : ''}>${esc(t(`main.twLogCol_${k}`))}</th>`).join('')}</tr></thead><tbody>${shown.map(cell).join('')}</tbody></table></div>
        ${rows.length > shown.length ? `<button type="button" class="btn btn-secondary tw-small" data-tw="more">${esc(t('main.twLogMore', { n: Math.min(LOG_PAGE, rows.length - shown.length) }))}</button>` : ''}` : `<p class="tw-empty">${esc(t('main.twLogEmpty'))}</p>`}`;
}

// ---- descargar (Excel o PDF) ----
function saveFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function downloadModal() {
    const kind = view;
    if (kind !== 'line' && kind !== 'log') return;
    const source = kind === 'log' ? (logData ? logData.rows.filter(matches) : []) : (lineData ? lineData.activities.filter(matches) : []);
    if (!source.length) { Dashboard.showToast(t('main.twDlNone'), 'error'); return; }
    const fmt = {
        t, dateTime: dateTimeText, date: (iso) => dateText(iso), duration: (ms) => durText(ms), kind: kindLabel, real: realLabel, dept: deptName,
        state: (s) => t(`main.twState_${s}`), step: stepText,
    };
    const built = kind === 'log' ? window.TeamTimeline.buildLog(source, fmt) : window.TeamTimeline.buildLine(source, fmt, Date.now());
    const range = (kind === 'log' ? logData : lineData).range;
    const baseName = `${window.TeamTimeline.slug(t(kind === 'log' ? 'main.twTab_log' : 'main.twTab_line'))}_${todayYmd()}`;
    const count = kind === 'log' ? source.length : built.sections[0].rows.length;
    const ov = openModal(`<h3 data-help-key="twDownload">${esc(t('main.twDlTitle'))}</h3><p class="admin-hint">${esc(t(kind === 'log' ? 'main.twDlLog' : 'main.twDlLine', { n: count }))} · ${esc(`${dateText(range.from)} – ${dateText(new Date(range.toMs - 1))}`)}</p>
        <fieldset class="wp-rep-set"><legend>${esc(t('main.twDlFormat'))}</legend><div class="wp-rep-seg" role="radiogroup" aria-label="${esc(t('main.twDlFormat'))}"><label><input type="radio" name="tw-dl-format" value="xlsx" checked><span>Excel (.xlsx)</span></label><label><input type="radio" name="tw-dl-format" value="pdf"><span>PDF</span></label></div></fieldset>
        <div class="admin-field"><span class="wp-rep-legend">${esc(t('main.twDlFile'))}</span><div class="wp-rep-fname" id="tw-dl-name">${esc(baseName)}.xlsx</div></div>${fieldErr('tw-dl-error')}
        <div class="admin-form-actions"><button type="button" class="btn" data-tw-m="ok"><i class="bx bx-download" aria-hidden="true"></i> ${esc(t('main.twDlGo'))}</button><button type="button" class="btn btn-secondary" data-tw-m="cancel">${esc(t('main.wpCancel'))}</button></div>`);
    ov.addEventListener('change', (event) => { if (event.target.name === 'tw-dl-format') ov.querySelector('#tw-dl-name').textContent = `${baseName}.${event.target.value}`; });
    ov.addEventListener('click', async (event) => {
        const b = event.target.closest('[data-tw-m]');
        if (!b) return;
        if (b.dataset.twM === 'cancel') { closeModal(); return; }
        const format = ov.querySelector('input[name="tw-dl-format"]:checked').value;
        b.disabled = true;
        try {
            const header = [[t('main.twDlReport'), t(kind === 'log' ? 'main.twTab_log' : 'main.twTab_line')], [t('main.twPeriod'), `${dateText(range.from)} – ${dateText(new Date(range.toMs - 1))}`], [t('main.twDlBy'), data.me.name || ''], [t('main.twDlDate'), dateText(new Date())]];
            const body = { title: built.title, filename: baseName, header, columns: built.columns, rows: built.rows, sections: built.sections, widths: built.widths, wrap: true };
            const res = await fetch(`/api/business/export/${format}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error(`export ${format} failed`);
            saveFile(await res.blob(), `${baseName}.${format}`);
            closeModal();
            Dashboard.showToast(t('main.twDlDone'), 'success');
        } catch (err) {
            console.error('Equipo de Trabajo: no se pudo preparar el archivo', err);
            setErr('tw-dl-error', t('main.twDlError'));
            b.disabled = false;
        }
    });
}

// ---- PIEZA 4: la foto, dónde trabaja cada quien hoy y en qué está ahora («El equipo hoy») ---------------------------------------------------------------------------------
// La tira sale con lo que trae GET /?day=<hoy> (el día es el del calendario de quien mira). Pulsar a una persona filtra el tablero a ella; el lápiz abre su día (ella misma, su jefe directo o el administrador lo marcan).
const photoUrl = (id, ver) => `/api/business/users/${id}/photo?v=${ver}`;
const avatar = (id, name, ver, cls, title) => `<span class="tw-av${cls ? ` ${cls}` : ''}"${title ? ` title="${esc(title)}"` : ''}>${ver ? `<img src="${esc(photoUrl(id, ver))}" alt="" loading="lazy">` : esc(initials(name))}</span>`;
const PLACE_DOT = { corporate: 'g', site: 'y', home: 'n', absent: 'r' };
const PLACES = ['corporate', 'site', 'home', 'absent'];
const ABSENCES = ['vacation', 'permit', 'sick', 'other'];
const timeText = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const placeText = (p) => {
    if (!p || !p.place) return '';
    if (p.place === 'site') return t('main.twPlaceAt', { place: t('main.twPlace_site'), site: p.siteName });
    if (p.place === 'absent') return t('main.twPlaceAt', { place: t('main.twPlace_absent'), site: t(`main.twAbsence_${p.absence || 'other'}`) });
    return t(`main.twPlace_${p.place}`);
};
// «X (Vacaciones), Y»: a quién se le va a asignar algo estando ausente hoy
const absentText = (list) => t('main.twAbsentAsk', { names: (list || []).map((n) => `${n.name}${n.absence ? ` (${t(`main.twAbsence_${n.absence}`)})` : ''}`).join(', ') });
const absentCode = (err) => !!(err && err.body && err.body.code === 'TEAM_PERSON_ABSENT');

function todayStrip() {
    const td = data.today;
    if (!td || !td.people.length) return '';
    const card = (p) => {
        const nowLine = p.absent ? `<span class="tw-now tw-now-none">${esc(t('main.twNoAssign'))}</span>`
            : p.now ? `<span class="tw-now"><small>${esc(t('main.twNow'))}</small>${esc(p.now.title)}</span>`
                : p.busyHidden ? `<span class="tw-now"><small>${esc(t('main.twNow'))}</small>${esc(t('main.twBusyHidden'))}</span>`
                    : p.inProgress > 1 ? `<span class="tw-now"><small>${esc(t('main.twNow'))}</small>${esc(t('main.twInProgressN', { n: p.inProgress }))}</span>`
                        : `<span class="tw-now tw-now-none"><span class="tw-free">${esc(t('main.twFree'))}</span> ${esc(t('main.twFreeNoAct'))}</span>`;
        const on = String(filters.person) === String(p.userId);
        const out = data.me.hasTeam && !p.isMine && !p.isMe;
        const where = p.place ? esc(placeText(p)) : (p.isMe ? `<span class="tw-ask">${esc(t('main.twDayAsk'))}</span>` : `<span class="tw-ask">${esc(t('main.twPlaceNone'))}</span>`);
        return `<div class="tw-tc tw-tc-${PLACE_DOT[p.place] || 'x'}${on ? ' on' : ''}${out ? ' out' : ''}">
            <button type="button" class="tw-tc-main" data-tw="person" data-user="${p.userId}" aria-pressed="${on}"><span class="tw-phw">${avatar(p.userId, p.name, p.photoVer, 'tw-av-lg')}<i class="tw-pd" aria-hidden="true"></i></span>
                <span class="tw-tc-t"><b>${esc(p.name)}</b><span class="tw-site">${where}</span>${out ? `<span class="tw-tag-out">${esc(t('main.twOutsideTeam'))}</span>` : ''}${nowLine}</span></button>
            ${p.canSet ? `<button type="button" class="admin-icon-btn tw-tc-edit" data-tw="day" data-user="${p.userId}" aria-label="${esc(t('main.twEditDay', { name: p.name }))}" title="${esc(t('main.twEditDay', { name: p.name }))}"><i class="bx bx-pencil" aria-hidden="true"></i></button>` : ''}</div>`;
    };
    return `<section class="tw-team-today" aria-label="${esc(t('main.twTodayTitle'))}" data-help-key="twToday"><h3>${esc(t('main.twTodayTitle'))}</h3><div class="tw-tcards">${td.people.map(card).join('')}</div>${weekGrid(td)}</section>`;
}
// «El día a día queda en el registro»: dónde trabajó cada quien los últimos 5 días
function weekGrid(td) {
    const label = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric' }) : ymd; };
    const cell = (p, ymd) => { const w = p.week[ymd]; return w ? `<td><i class="tw-pd tw-pd-${PLACE_DOT[w.place] || 'x'}" aria-hidden="true"></i> ${esc(placeText(w))}</td>` : '<td></td>'; };
    return `<details class="tw-week"><summary>${esc(t('main.twWeek'))}</summary><div class="tw-week-scroll"><table class="tw-log tw-week-table" aria-label="${esc(t('main.twWeek'))}"><thead><tr><th scope="col">${esc(t('main.twPerson'))}</th>${td.weekDays.map((d) => `<th scope="col">${esc(label(d))}</th>`).join('')}</tr></thead><tbody>${td.people.map((p) => `<tr><td>${esc(p.name)}</td>${td.weekDays.map((d) => cell(p, d)).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
// La ficha del día de una persona: dónde trabaja hoy (corporativo, una unidad, home office o ausente con su motivo) y, si es el propio día, en cuál de sus actividades en curso está ahora.
function dayModal(userId) {
    const td = data.today;
    const p = td && td.people.find((x) => x.userId === userId);
    if (!p || !p.canSet) return;
    const mineNow = p.isMe ? td.myInProgress : [];
    const currentNow = (mineNow.find((m) => m.isNow) || {}).id || '';
    const radio = (name, value, label, checked) => `<label class="tw-opt"><input type="radio" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}><span>${esc(label)}</span></label>`;
    const ov = openModal(`<h3 data-help-key="twDay">${esc(t('main.twDayTitle'))}</h3>
        <div class="tw-fich">${avatar(p.userId, p.name, p.photoVer, 'tw-av-xl')}<div><b>${esc(p.name)}</b><small>${esc(p.place ? t('main.twDaySince', { time: timeText(p.since) }) : t('main.twPlaceNone'))}${p.setBy && !p.isMe && p.setBy !== p.name ? ` · ${esc(t('main.twDaySetBy', { name: p.setBy }))}` : ''}</small></div></div>
        <form id="tw-day-form" novalidate>
        <fieldset class="tw-set"><legend>${esc(p.isMe ? t('main.twDayWhereSelf') : t('main.twDayWhere', { name: p.name.split(' ')[0] }))}</legend><div class="tw-opts">${PLACES.map((k) => radio('tw-place', k, t(`main.twPlace_${k}`), p.place === k)).join('')}</div></fieldset>
        <div class="tw-two"><div class="admin-field" id="tw-day-site-box"${p.place === 'site' ? '' : ' hidden'}><label for="tw-day-site">${esc(t('main.twDayUnit'))}</label><select id="tw-day-site">${data.sites.map((s) => `<option value="${s.id}"${p.siteId === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
            <div class="admin-field" id="tw-day-abs-box"${p.place === 'absent' ? '' : ' hidden'}><label for="tw-day-abs">${esc(t('main.twDayAbsence'))}</label><select id="tw-day-abs">${ABSENCES.map((k) => `<option value="${k}"${(p.absence || 'vacation') === k ? ' selected' : ''}>${esc(t(`main.twAbsence_${k}`))}</option>`).join('')}</select></div></div>
        ${mineNow.length ? `<fieldset class="tw-set"><legend>${esc(t('main.twDayNowLegend'))}</legend><div class="tw-opts tw-opts-col">${radio('tw-now', '', t('main.twDayNowNone'), !currentNow)}${mineNow.map((m) => radio('tw-now', String(m.id), m.title, currentNow === m.id)).join('')}</div></fieldset>` : ''}
        ${fieldErr('tw-day-error')}
        <div class="admin-form-actions"><button type="submit" class="btn">${esc(t('main.wpSave'))}</button><button type="button" class="btn btn-secondary" data-tw-m="cancel">${esc(t('main.wpCancel'))}</button></div></form>`);
    ov.addEventListener('change', (event) => {
        if (event.target.name !== 'tw-place') return;
        ov.querySelector('#tw-day-site-box').hidden = event.target.value !== 'site';
        ov.querySelector('#tw-day-abs-box').hidden = event.target.value !== 'absent';
    });
    ov.addEventListener('click', (event) => { if (event.target.closest('[data-tw-m="cancel"]')) closeModal(); });
    ov.querySelector('#tw-day-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const place = (ov.querySelector('input[name="tw-place"]:checked') || {}).value;
        if (!place) { setErr('tw-day-error', t('main.twErr_TEAM_WORKDAY_INVALID')); return; }
        const body = { userId: p.userId, day: td.day, place };
        if (place === 'site') body.siteId = Number(ov.querySelector('#tw-day-site').value);
        if (place === 'absent') body.absence = ov.querySelector('#tw-day-abs').value;
        const submit = ov.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            await api('PUT', '/workday', body);
            const chosen = ov.querySelector('input[name="tw-now"]:checked');
            if (mineNow.length && chosen && chosen.value !== String(currentNow)) await api('PUT', '/now', { activityId: chosen.value ? Number(chosen.value) : null });
            await load(true);
            closeModal();
            Dashboard.showToast(t('main.twDaySaved'), 'success');
        } catch (err) { setErr('tw-day-error', errText(err)); submit.disabled = false; }
    });
}

// ---- eventos de la pantalla ----------------------------------------------------------------------------------------------------------------------------------------------
document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-tw]');
    if (!el) return;
    const op = el.dataset.tw;
    if (op === 'create') { activityForm(null); return; }
    if (op === 'clear') { filters = { ...DEFAULT_FILTERS }; saveFilters(); render(); return; }
    if (op === 'view') { view = el.dataset.view; savePrefs(); render(); loadView(true); return; }
    if (op === 'person') { event.stopPropagation(); filters.person = String(filters.person) === el.dataset.user ? 'all' : el.dataset.user; saveFilters(); render(); return; }
    if (op === 'day') { event.stopPropagation(); dayModal(Number(el.dataset.user)); return; }
    if (op === 'download') { downloadModal(); return; }
    if (op === 'more') { logShown += LOG_PAGE; render(); return; }
    if (op === 'act') { event.stopPropagation(); doAct(el.dataset.id, el.dataset.act, el.dataset.pass); return; }
    if (op === 'unassign') { event.stopPropagation(); api('POST', `/${el.dataset.id}/unassign`, { userId: Number(el.dataset.user) }).then(() => load(true)).then(() => openDetail(Number(el.dataset.id))).catch((err) => setErr('tw-d-error', errText(err))); return; }
    if (op === 'open' && !event.target.closest('button')) openDetail(Number(el.dataset.id));
});
document.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches && event.target.matches('[data-tw="open"]') && event.target === document.activeElement) { event.preventDefault(); openDetail(Number(event.target.dataset.id)); }
});
document.addEventListener('input', (event) => { if (event.target.id === 'tw-f-q') { filters.q = event.target.value; render(); } });
document.addEventListener('change', (event) => {
    const map = { 'tw-f-person': 'person', 'tw-f-kind': 'kind', 'tw-f-real': 'real', 'tw-f-site': 'site', 'tw-f-dept': 'dept', 'tw-f-area': 'area', 'tw-f-plan': 'plan' };
    if (map[event.target.id]) { filters[map[event.target.id]] = event.target.value; saveFilters(); render(); return; }
    if (event.target.id === 'tw-f-urgent') { filters.urgent = event.target.checked; saveFilters(); render(); return; }
    if (event.target.name === 'tw-group') { lineGroup = event.target.value; savePrefs(); render(); return; }
    const which = event.target.dataset && event.target.dataset.which;
    if (event.target.id === 'tw-period' && which) {
        const before = periodRange(which);
        periods[which].kind = event.target.value;
        if (event.target.value === 'custom' && !periods[which].from) { periods[which].from = window.TeamTimeline.ymd(before.from); periods[which].to = window.TeamTimeline.ymd(new Date(before.toMs - 1)); }
        savePrefs();
        (which === 'line' ? loadLine : loadLog)(false);
        return;
    }
    if ((event.target.id === 'tw-per-from' || event.target.id === 'tw-per-to') && which) {
        periods[which][event.target.id === 'tw-per-from' ? 'from' : 'to'] = event.target.value;
        savePrefs();
        (which === 'line' ? loadLine : loadLog)(false);
    }
});
document.addEventListener('dashboard:language-changed', () => { if ($('tw-root').dataset.ready) render(); });
// al cambiar la propia foto (Datos de usuario) se vuelve a leer para que salga en la tira y en las tarjetas
document.addEventListener('user-photo-changed', () => { if ($('tw-root').dataset.ready) loadView(true); });
// un aviso de la campana abre la actividad aunque ya se esté en el tablero (solo cambia el # de la dirección)
// Enlaces: #actividad-12 abre ese detalle; #asignar-3-45 (el botón «Asignar en Equipo…» de Planes) abre el formulario ya con ese renglón: su nombre, su fecha y quien lo ejecuta.
async function openFromHash() {
    const asg = /^#asignar-(\d+)-(\d+)$/.exec(location.hash);
    const act = /^#actividad-(\d+)$/.exec(location.hash);
    if (!asg && !act) return;
    try { history.replaceState(null, '', `${location.pathname}${location.search}`); } catch (err) { /* sin historial: el enlace se queda en la barra */ }
    if (act) { await load(true); openDetail(Number(act[1])); return; }
    try {
        await load(true);
        const it = (await api('GET', `/plan-items/${asg[2]}`)).item;
        activityForm(null, { title: it.title, dueDate: it.endDate || '', userIds: it.executorUserId && data.people.some((p) => p.id === it.executorUserId) ? [it.executorUserId] : [], item: it });
    } catch (err) { showError(errText(err)); }
}
window.addEventListener('hashchange', () => { if ($('tw-root').dataset.ready) openFromHash(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !overlay && $('tw-root').dataset.ready) loadView(true); });

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await load(false);
        if (view !== 'board') await loadView(false);
        $('tw-root').dataset.ready = '1';
        openFromHash();
    } catch (err) {
        console.error('Administración de Equipo de Trabajo failed to initialize:', err);
    }
})();
})();
