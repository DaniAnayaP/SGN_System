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
const FILTERS_KEY = 'sgn.teamWork.filters';
const DEFAULT_FILTERS = { q: '', person: 'all', kind: 'all', real: 'all', site: 'all', dept: 'all', area: 'all', urgent: false };
let data = { activities: [], people: [], sites: [], departments: [], me: { id: 0, name: '', isAdmin: false, hasTeam: false } };
let filters = { ...DEFAULT_FILTERS };
try { const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || 'null'); if (saved && typeof saved === 'object') filters = { ...DEFAULT_FILTERS, ...saved, q: '' }; } catch (err) { /* sin almacenamiento: los filtros empiezan en «todos» */ }
const saveFilters = () => { try { localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...filters, q: '' })); } catch (err) { /* se queda solo en esta visita */ } };
let detailId = null;

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
const fold = (text) => String(text == null ? '' : text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---- filtros (todos en el navegador: la lista ya trae lo que esta persona puede ver) --------------------------------------------------------------------------------
function matches(a) {
    if (filters.kind !== 'all' && a.kind !== filters.kind) return false;
    if (filters.real !== 'all' && a.realization !== filters.real) return false;
    if (filters.site !== 'all' && !a.sites.some((s) => String(s.id) === String(filters.site))) return false;
    if (filters.dept !== 'all' && a.department !== filters.dept) return false;
    if (filters.area !== 'all' && a.area !== filters.area) return false;
    if (filters.urgent && !a.urgent) return false;
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
    const people = data.people.filter((p) => data.activities.some((a) => a.assignees.some((x) => x.userId === p.id)));
    const personOpts = [['me', t('main.twPersonMe')], ['team', t('main.twPersonTeam')], ['outside', t('main.twPersonOutside')], ...people.map((p) => [String(p.id), p.name])];
    const areas = [...new Set(data.activities.map((a) => a.area).filter(Boolean))].sort((x, y) => x.localeCompare(y, locale()));
    const field = (id, label, control, help) => `<label class="tw-flt" for="${id}"${help ? ` data-help-key="${help}"` : ''}><span>${esc(label)}</span>${control}</label>`;
    return `<div class="tw-filters" role="search" aria-label="${esc(t('main.twFilters'))}" data-help-key="twFilters">
        ${field('tw-f-q', t('main.twFilterSearch'), `<input id="tw-f-q" type="search" value="${esc(filters.q)}" autocomplete="off">`)}
        ${field('tw-f-person', t('main.twPerson'), `<select id="tw-f-person">${options(personOpts, filters.person, t('main.twPersonAll'))}</select>`)}
        ${field('tw-f-kind', t('main.twKind'), `<select id="tw-f-kind">${options(KINDS.map((k) => [k, kindLabel(k)]), filters.kind, t('main.twKindAll'))}</select>`)}
        ${field('tw-f-real', t('main.twRealization'), `<select id="tw-f-real">${options(REALS.map((r) => [r, realLabel(r)]), filters.real, t('main.twRealAll'))}</select>`)}
        ${field('tw-f-site', t('main.twSite'), `<select id="tw-f-site">${options(data.sites.map((s) => [String(s.id), s.name]), filters.site, t('main.twSiteAll'))}</select>`)}
        ${field('tw-f-dept', t('main.twDept'), `<select id="tw-f-dept">${options(data.departments.map((d) => [d.key, deptName(d.key)]), filters.dept, t('main.twDeptAll'))}</select>`)}
        ${field('tw-f-area', t('main.twArea'), `<select id="tw-f-area">${options(areas.map((a) => [a, a]), filters.area, t('main.twAreaAll'))}</select>`)}
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
    return `<span class="tw-stack">${a.assignees.slice(0, 3).map((x) => `<span class="tw-av${x.isMine || x.isMe ? '' : ' tw-av-out'}" title="${esc(x.name)}">${esc(initials(x.name))}</span>`).join('')}${a.assignees.length > 3 ? `<span class="tw-av tw-av-more">+${a.assignees.length - 3}</span>` : ''}</span>`;
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
    const mineBadge = a.myStatus ? `<span class="tw-me">${esc(t('main.twMine'))}</span>` : '';
    return `<article class="tw-card tw-k-${a.kind}" data-tw="open" data-id="${a.id}" tabindex="0" aria-label="${esc(a.title)}">
        <div class="tw-card-top"><span class="tw-kind">${esc(kindLabel(a.kind))}</span>${a.urgent ? `<span class="tw-urg">⚡ ${esc(t('main.twUrgentTag'))}</span>` : ''}${mineBadge}${due}</div>
        <b class="tw-card-title">${esc(a.title)}</b>
        <div class="tw-card-who">${personStack(a)}<span><span class="tw-names">${esc(names)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span></div>
        ${per}${seats}${takers}${waiting}${cardActions(a)}</article>`;
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
    root.innerHTML = `<div class="tw-head"><h2>${esc(t('main.twBoard'))}</h2><button type="button" class="btn" data-tw="create" data-help-key="twCreate"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.twCreate'))}</button></div>
        ${filterBar()}${counters(list)}${passTray()}${data.activities.length ? '' : `<p class="tw-empty">${esc(t('main.twEmpty'))}</p>`}${lanes(list)}`;
    if (keepFocus === 'tw-f-q') { const el = $('tw-f-q'); if (el) { el.focus(); if (caret != null) el.setSelectionRange(caret, caret); } }
}
async function load(quiet) {
    try {
        data = await api('GET', '');
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
    const row = (p) => `<label class="tw-person" data-name="${esc(fold(p.name))}"><input type="checkbox" name="${field}" value="${p.id}"${selected.has(p.id) ? ' checked' : ''}><span class="tw-av">${esc(initials(p.name))}</span><span class="tw-person-name">${esc(p.name)}</span>${p.free ? `<em class="tw-free">${esc(t('main.twFree'))}</em>` : ''}${p.hasScreen === false ? `<em class="tw-noscreen">${esc(t('main.twNoScreen'))}</em>` : ''}</label>`;
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
function activityForm(existing) {
    const a = existing || { title: '', description: '', kind: 'eventual', urgent: false, realization: 'presencial', sites: [], department: '', area: '', dueDate: '', seatsNeeded: 1 };
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
        <div class="admin-field"><label for="tw-desc">${esc(t('main.twF_description'))}</label><textarea id="tw-desc" rows="2" maxlength="1000">${esc(a.description)}</textarea></div>
        ${existing ? '' : `<fieldset class="tw-set"><legend>${esc(t('main.twF_who'))}</legend><div class="tw-opts">${radio('tw-who', 'now', t('main.twWho_now'), true)}${radio('tw-who', 'later', t('main.twWho_later'), false)}</div>
            <div id="tw-who-now">${peopleList(new Set(), [])}<div class="admin-field" id="tw-principal-box" hidden><label for="tw-principal">${esc(t('main.twF_principal'))}</label><select id="tw-principal"></select></div></div>
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
    ov.addEventListener('change', (event) => {
        if (event.target.name === 'tw-who') { const now = event.target.value === 'now'; ov.querySelector('#tw-who-now').hidden = !now; ov.querySelector('#tw-who-later').hidden = now; }
        if (event.target.id === 'tw-claim') { ov.querySelector('#tw-claim-chosen').hidden = event.target.value !== 'chosen'; ov.querySelector('#tw-seats-box').hidden = !event.target.value; }
    });
    ov.addEventListener('click', (event) => { if (event.target.closest('[data-tw-m="cancel"]')) closeModal(); });
    ov.querySelector('#tw-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const val = (id) => ov.querySelector(id).value;
        const body = {
            title: val('#tw-title'), kind: (ov.querySelector('input[name="tw-kind"]:checked') || {}).value, urgent: ov.querySelector('#tw-urgent').checked, realization: (ov.querySelector('input[name="tw-real"]:checked') || {}).value,
            siteIds: [...ov.querySelectorAll('input[name="tw-site"]:checked')].map((i) => Number(i.value)), department: val('#tw-dept'), area: val('#tw-area'), dueDate: val('#tw-due'), description: val('#tw-desc'),
        };
        const seats = ov.querySelector('#tw-seats');
        if (seats) body.seatsNeeded = Number(seats.value) || 1;
        const claim = ov.querySelector('#tw-claim');
        const wantsClaim = existing || (ov.querySelector('input[name="tw-who"]:checked') || {}).value === 'later';
        if (claim && wantsClaim) { body.claimScope = claim.value; if (claim.value === 'chosen') body.claimUserIds = checkedPeople(ov, 'tw-c'); }
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
        } catch (err) { setErr('tw-form-error', errText(err)); submit.disabled = false; }
    });
    setTimeout(() => ov.querySelector('#tw-title').focus(), 0);
}

// el detalle de una actividad con lo que lleva cada persona y su línea de pasos
function eventText(e) {
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
    const rows = a.assignees.map((x) => `<li class="tw-asg tw-ps-${x.status}"><span class="tw-av${x.isMine || x.isMe ? '' : ' tw-av-out'}">${esc(initials(x.name))}</span><div><b>${esc(x.name)}${x.isPrincipal ? ` <em>${esc(t('main.twPrincipal'))}</em>` : ''}</b><small>${esc(t(`main.twPs_${x.status}`))}${x.status === 'paused' && x.pauseReason ? ` · ${esc(x.pauseReason)}` : ''}</small></div>${c.unassign && ['assigned', 'confirmed'].includes(x.status) ? `<button type="button" class="admin-icon-btn" data-tw="unassign" data-id="${a.id}" data-user="${x.userId}" aria-label="${esc(t('main.twAct_unassign'))}" title="${esc(t('main.twAct_unassign'))}"><i class="bx bx-x" aria-hidden="true"></i></button>` : ''}</li>`).join('');
    const events = a.events.map((e) => `<li class="tw-ev tw-ev-${e.event}"><span class="tw-ev-dot" aria-hidden="true"></span><div><b>${esc(eventText(e))}</b><small>${esc(e.actorName)} · ${esc(whenText(e.createdAt))}</small>${e.detail && ['paused', 'returned', 'cancelled', 'pass_requested', 'passed', 'pass_approved', 'pass_rejected', 'pass_cancelled'].includes(e.event) ? `<span class="tw-ev-note">${esc(e.detail)}</span>` : ''}</div></li>`).join('');
    const passes = a.passes.map((p) => passCard(p, a, false)).join('');
    const claimLine = a.claimScope && a.seatsOpen > 0 && a.status !== 'done' ? [t('main.twClaimLine', { who: t(`main.twClaim_${a.claimScope}`), n: a.seatsOpen }), a.claim && (c.edit || c.assign) ? (a.claim.freeCount ? t('main.twFreeCan', { names: a.claim.freeNames.join(', ') + (a.claim.freeCount > a.claim.freeNames.length ? ` +${a.claim.freeCount - a.claim.freeNames.length}` : '') }) : t('main.twFreeNone')) : ''].filter(Boolean).join(' · ') : '';
    const meta = [realLabel(a.realization), a.sites.map((s) => s.name).join(', '), deptName(a.department), a.area, a.dueDate ? t('main.twDue', { date: dayText(a.dueDate) }) : ''].filter(Boolean);
    const ov = openModal(`<div class="tw-detail-head"><h3 id="tw-d-title">${esc(a.title)}</h3><button type="button" class="admin-icon-btn" data-tw-m="cancel" aria-label="${esc(t('main.twClose'))}" title="${esc(t('main.twClose'))}"><i class="bx bx-x" aria-hidden="true"></i></button></div>
        <div class="tw-chips"><span class="tw-kind tw-k-${a.kind}">${esc(kindLabel(a.kind))}</span>${a.urgent ? `<span class="tw-urg">⚡ ${esc(t('main.twUrgentTag'))}</span>` : ''}<span class="tw-state tw-state-${a.status}">${esc(t(`main.twLane_${a.status}`))}</span></div>
        <p class="tw-meta">${esc(meta.join(' · '))}</p>${claimLine ? `<p class="tw-meta tw-meta-claim">${esc(claimLine)}</p>` : ''}${a.description ? `<p class="tw-desc">${esc(a.description)}</p>` : ''}
        <p class="tw-created">${esc(t('main.twD_created', { name: a.createdBy.name, date: whenText(a.createdAt) }))}</p>
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
        try { await api('POST', `/${a.id}/assign`, { userIds: ids }); await load(true); Dashboard.showToast(t('main.twAssigned'), 'success'); closeModal(); } catch (err) { setErr('tw-a-error', errText(err)); }
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
        try { await api('POST', `/${a.id}/pass`, { fromUserId: fromNow(), userIds: ids, reason }); await load(true); Dashboard.showToast(t(asked ? 'main.twPassAsked' : 'main.twPassDone'), 'success'); closeModal(); } catch (err) { setErr('tw-p-error', errText(err)); }
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

// ---- eventos de la pantalla ----------------------------------------------------------------------------------------------------------------------------------------------
document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-tw]');
    if (!el) return;
    const op = el.dataset.tw;
    if (op === 'create') { activityForm(null); return; }
    if (op === 'clear') { filters = { ...DEFAULT_FILTERS }; saveFilters(); render(); return; }
    if (op === 'act') { event.stopPropagation(); doAct(el.dataset.id, el.dataset.act, el.dataset.pass); return; }
    if (op === 'unassign') { event.stopPropagation(); api('POST', `/${el.dataset.id}/unassign`, { userId: Number(el.dataset.user) }).then(() => load(true)).then(() => openDetail(Number(el.dataset.id))).catch((err) => setErr('tw-d-error', errText(err))); return; }
    if (op === 'open' && !event.target.closest('button')) openDetail(Number(el.dataset.id));
});
document.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches && event.target.matches('.tw-card') && event.target === document.activeElement) { event.preventDefault(); openDetail(Number(event.target.dataset.id)); }
});
document.addEventListener('input', (event) => { if (event.target.id === 'tw-f-q') { filters.q = event.target.value; render(); } });
document.addEventListener('change', (event) => {
    const map = { 'tw-f-person': 'person', 'tw-f-kind': 'kind', 'tw-f-real': 'real', 'tw-f-site': 'site', 'tw-f-dept': 'dept', 'tw-f-area': 'area' };
    if (map[event.target.id]) { filters[map[event.target.id]] = event.target.value; saveFilters(); render(); return; }
    if (event.target.id === 'tw-f-urgent') { filters.urgent = event.target.checked; saveFilters(); render(); }
});
document.addEventListener('dashboard:language-changed', () => { if ($('tw-root').dataset.ready) render(); });
// un aviso de la campana abre la actividad aunque ya se esté en el tablero (solo cambia el # de la dirección)
window.addEventListener('hashchange', () => { const m = /^#actividad-(\d+)$/.exec(location.hash); if (m && $('tw-root').dataset.ready) load(true).then(() => openDetail(Number(m[1]))); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !overlay && $('tw-root').dataset.ready) load(true); });

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await load(false);
        $('tw-root').dataset.ready = '1';
        const hash = /^#actividad-(\d+)$/.exec(location.hash);
        if (hash) openDetail(Number(hash[1]));
    } catch (err) {
        console.error('Administración de Equipo de Trabajo failed to initialize:', err);
    }
})();
})();
