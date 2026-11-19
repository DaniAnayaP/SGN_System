// ---------------------------------------------------------------------------
// Planes de trabajo (pieza 1): cada persona arma sus propios planes con el estilo del Cronograma de Implementación. El plan es un árbol de renglones cuyos NIVELES nombra quien lo arma (sin límite; por defecto Nivel › Clasificación › Proceso › Actividad ›
// Subactividad); cada renglón lleva responsable, fechas, estado y una nota. Los planes son privados de su dueño (compartir, Mensajes y comentarios llegan en las piezas siguientes). La pantalla tiene una primera pestaña con la
// lista de planes (tarjetas, filtros, buscador y estrella para fijar) y, junto a ella, una pestaña por cada plan abierto; las pestañas abiertas se recuerdan en este navegador. El servidor decide todo (server.js, rutas
// /api/business/work-plans): aquí solo se dibuja. Las fechas son de calendario (sin hora). Se carga después de Dashboard.js.
// ---------------------------------------------------------------------------
(function () {
'use strict';
const API = '/api/business/work-plans';
const MAX_WEEKS = 104; // el dibujo se limita a dos años; lo demás se recorta
const TABS_KEY = 'sgn.workPlans.tabs';
const COLLAPSED_KEY = 'sgn.workPlans.collapsed';
const $ = (id) => document.getElementById(id);
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
const pad2 = (n) => String(n).padStart(2, '0');
// «2026-03-16» → fecha de calendario sin correrla por zonas horarias.
const dayOf = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d); };
const ymdOf = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const shortDate = (ymd) => (ymd ? dayOf(ymd).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : '');
const longDate = (ymd) => (ymd ? dayOf(ymd).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const todayYmd = () => ymdOf(new Date());
const CONNECTORS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'para', 'por', 'en', 'al', 'con', 'of', 'the', 'and', 'for', 'to', 'in', 'on', 'at', 'with']);
// las iniciales del nombre (sin conectores: «Apertura de la bodega» → AB)
const initials = (title) => String(title || '?').trim().split(/\s+/).filter((w, i, all) => all.length < 2 || !CONNECTORS.has(w.toLowerCase())).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase() || '?';
// el lunes de la semana de una fecha (las semanas del cronograma empiezan en lunes)
const mondayOf = (date) => { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const weekOf = (origin, date) => Math.floor(Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - origin) / 86400000) / 7) + 1;
const fold = (text) => String(text == null ? '' : text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---- estado -------------------------------------------------------------------------------------------------------------------------------------------
let plans = [];                 // resúmenes de todos mis planes (activos y cerrados)
const cache = new Map();        // id → { plan, items, people, canEdit }
let canCreate = true;
let tabs = { open: [], active: 'list' }; // active: 'list' | 'mine' (Mis actividades) | 'team' (Mi equipo) | id de un plan abierto
const isPlanTab = (id) => typeof id === 'number';
let mine = { activities: [], counts: { open: 0, done: 0 }, truncated: false }; // lo que me toca (responsable o quien ejecuta) de todos mis planes activos
let mineFilter = 'open';        // 'open' (por hacer) | 'late' (vencidas) | 'done' | 'all'
let mineRole = 'all';           // 'all' | 'responsible' (soy responsable, también si además ejecuto) | 'executor' (ejecuto, también si además soy responsable)
let mineQuery = '';
let team = { members: [], activities: [], truncated: false }; // las personas a mi cargo y lo que les toca (solo en planes que yo puedo ver; solo lectura)
let teamFilter = 'open';        // 'open' | 'late' | 'done' | 'all'
let teamPerson = 'all';         // 'all' | id de una persona del equipo
let teamQuery = '';
let listFilter = 'all';         // 'all' (activos de cualquier origen) | 'own' | 'shared' (compartidos conmigo y del equipo) | 'closed'
let listQuery = '';
let form = null;                // el formulario en línea abierto (uno a la vez): { mode: 'add'|'edit', planId, parentId, id, depth, values, error, busy }
let planLoading = null;         // id del plan que se está leyendo
const readJson = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && typeof v === 'object' ? v : fallback; } catch (err) { return fallback; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* sin almacenamiento: se queda solo en esta visita */ } };
const saveTabs = () => writeJson(TABS_KEY, tabs);
const collapsedMap = readJson(COLLAPSED_KEY, {}); // { planId: { itemId: true } }
const isCollapsed = (planId, itemId) => !!(collapsedMap[planId] && collapsedMap[planId][itemId]);
const setCollapsed = (planId, itemId, value) => {
    if (!collapsedMap[planId]) collapsedMap[planId] = {};
    if (value) collapsedMap[planId][itemId] = true; else delete collapsedMap[planId][itemId];
    writeJson(COLLAPSED_KEY, collapsedMap);
};

// ---- llamadas -----------------------------------------------------------------------------------------------------------------------------------------
async function api(method, path, body) {
    const res = await fetch(`${API}${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.error || out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
    return out;
}
// El texto de un error del servidor en el idioma de la pantalla (por su código).
function errText(err) {
    const code = err && err.body && err.body.code;
    if (code) { const key = `main.wpErr_${code}`; const text = Dashboard.t(key); if (text !== key) return text; }
    return t('main.wpErr_default');
}
// Estos errores quieren decir que lo que se ve ya no es lo que hay: se cierra el formulario y se vuelve a leer.
const STALE_CODES = ['WORK_PLAN_NOT_FOUND', 'WORK_PLAN_ITEM_NOT_FOUND', 'WORK_PLAN_CLOSED', 'WORK_PLAN_FORBIDDEN', 'WORK_PLAN_NOT_ALLOWED'];
function failed(err, planId) {
    if (!(err && err.body)) console.error('Planes de trabajo:', err);
    if (err && err.body && STALE_CODES.includes(err.body.code)) { form = null; refreshAll(planId).catch(() => {}); }
    Dashboard.showToast(errText(err), 'error');
}
async function loadList() {
    const out = await api('GET', '?status=all');
    plans = out.plans || [];
    canCreate = out.canCreate !== false;
}
async function loadMine() {
    const out = await api('GET', '/mine');
    mine = { activities: out.activities || [], counts: out.counts || { open: 0, done: 0 }, truncated: !!out.truncated };
}
async function loadTeam() {
    const out = await api('GET', `/team?today=${todayYmd()}`);
    team = { members: out.members || [], activities: out.activities || [], truncated: !!out.truncated };
}
async function loadPlan(id) {
    const out = await api('GET', `/${id}`);
    cache.set(id, out);
    const at = plans.findIndex((p) => p.id === id);
    // abrir un plan compartido le quita el «Nuevo» (el servidor lo marca como visto al leerlo)
    const summary = { ...out.plan, isNew: false };
    if (at >= 0) plans[at] = summary; else plans.push(summary);
    return out;
}
// Vuelve a leer la lista y, si hay uno abierto, ese plan (un plan que ya no existe se quita de las pestañas).
async function refreshAll(planId, quiet) {
    await Promise.all([loadList(), loadMine().catch((err) => console.error('Mis actividades:', err)), loadTeam().catch((err) => console.error('Mi equipo:', err))]);
    if (tabs.active === 'team' && !team.members.length) tabs.active = 'list';
    tabs.open = tabs.open.filter((id) => plans.some((p) => p.id === id));
    if (isPlanTab(tabs.active) && !tabs.open.includes(tabs.active)) tabs.active = 'list';
    saveTabs();
    cache.forEach((_, id) => { if (!plans.some((p) => p.id === id)) cache.delete(id); });
    const target = planId && tabs.open.includes(planId) ? planId : (isPlanTab(tabs.active) ? tabs.active : null);
    if (target) { try { await loadPlan(target); } catch (err) { /* se quita abajo */ } }
    if (!quiet) render();
}
// Al volver a la pestaña del navegador: se vuelve a leer y solo se redibuja si algo cambió (así no se pierde el foco ni lo que se estaba escribiendo).
async function refreshQuietly() {
    const target = currentPlanId();
    const signature = () => JSON.stringify([plans, target ? cache.get(target) : null, tabs, mine, team]);
    const before = signature();
    await refreshAll(target, true);
    if (signature() !== before) render();
}

// ---- cálculos del dibujo ------------------------------------------------------------------------------------------------------------------------------
const planName = (p) => p.title || '—';
const levelLabel = (plan, depth) => (plan.levelNames && plan.levelNames[depth - 1]) || t('main.wpLevelDefault', { n: depth });
const statusOf = (item) => item.effectiveStatus || item.status || 'pending';
const isLate = (item, today) => statusOf(item) !== 'done' && !!item.rangeEnd && item.rangeEnd < today;
// el eje de semanas del plan: del lunes de la primera fecha al final de la última (sin fechas, sin semanas)
function axisFor(items) {
    let min = '';
    let max = '';
    items.forEach((i) => {
        if (i.rangeStart && (!min || i.rangeStart < min)) min = i.rangeStart;
        if (i.rangeEnd && (!max || i.rangeEnd > max)) max = i.rangeEnd;
    });
    if (!min || !max) return { weeks: 0, origin: null };
    const origin = mondayOf(dayOf(min));
    return { weeks: Math.min(MAX_WEEKS, Math.max(1, weekOf(origin, dayOf(max)))), origin };
}
const weekRangeText = (a) => (a && a.startDate && a.endDate ? `${shortDate(a.startDate)} – ${shortDate(a.endDate)}` : t('main.wpNoDates'));
// «Semana 3 de 12» de un plan (desde el lunes de su primera fecha); vacío si no tiene fechas o aún no empieza / ya terminó
function weekText(startDate, endDate) {
    if (!startDate || !endDate) return t('main.wpNoDates');
    const origin = mondayOf(dayOf(startDate));
    const total = Math.max(1, weekOf(origin, dayOf(endDate)));
    const now = weekOf(origin, new Date());
    if (now < 1) return t('main.wpBeforeStart', { total });
    if (now > total) return t('main.wpAfterEnd', { total });
    return t('main.wpWeekOf', { n: now, total });
}

// ---- pestañas -----------------------------------------------------------------------------------------------------------------------------------------
function renderTabs() {
    const el = $('wp-tabs');
    const listActive = tabs.active === 'list';
    let html = `<div class="wp-tab wp-tab-list${listActive ? ' active' : ''}" role="tab" tabindex="0" aria-selected="${listActive}" data-wp-tab="list" data-help-key="wpTabs"><i class="bx bx-list-ul" aria-hidden="true"></i><span class="wp-tab-nm">${esc(t('main.wpTabAll'))}</span><span class="wp-count">${plans.filter(isLive).length}</span></div>`;
    const mineActive = tabs.active === 'mine';
    const lateCount = mine.activities.filter((a) => a.status !== 'done' && a.endDate && a.endDate < todayYmd()).length;
    html += `<div class="wp-tab wp-tab-mine${mineActive ? ' active' : ''}" role="tab" tabindex="0" aria-selected="${mineActive}" data-wp-tab="mine" data-help-key="wpMineTab"><i class="bx bx-task" aria-hidden="true"></i><span class="wp-tab-nm">${esc(t('main.wpTabMine'))}</span><span class="wp-count${lateCount ? ' wp-count-hot' : ''}"${lateCount ? ` title="${esc(t('main.wpMineLateCount', { n: lateCount }))}"` : ''}>${mine.counts.open || 0}</span></div>`;
    if (team.members.length) {
        const teamActive = tabs.active === 'team';
        const teamOpen = team.members.reduce((n, m) => n + m.open, 0);
        const teamLate = team.members.reduce((n, m) => n + m.late, 0);
        html += `<div class="wp-tab wp-tab-team${teamActive ? ' active' : ''}" role="tab" tabindex="0" aria-selected="${teamActive}" data-wp-tab="team" data-help-key="wpTeamTab"><i class="bx bx-group" aria-hidden="true"></i><span class="wp-tab-nm">${esc(t('main.wpTabTeam'))}</span><span class="wp-count${teamLate ? ' wp-count-hot' : ''}"${teamLate ? ` title="${esc(t('main.wpMineLateCount', { n: teamLate }))}"` : ''}>${teamOpen}</span></div>`;
    }
    tabs.open.forEach((id) => {
        const p = plans.find((x) => x.id === id);
        if (!p) return;
        const active = tabs.active === id;
        html += `<div class="wp-tab${active ? ' active' : ''}${!isLive(p) ? ' wp-tab-closed' : ''}" role="tab" tabindex="0" aria-selected="${active}" data-wp-tab="${id}" title="${esc(planName(p))}"><span class="wp-dot wp-dot-${!isLive(p) ? 'closed' : (p.origin || 'own')}" aria-hidden="true"></span><span class="wp-tab-nm">${esc(planName(p))}</span>${p.unreadComments ? `<span class="wp-count wp-count-hot" title="${esc(t('main.wpUnreadComments', { n: p.unreadComments }))}">${p.unreadComments}</span>` : ''}<button type="button" class="wp-tab-x" data-wp-close="${id}" aria-label="${esc(t('main.wpTabClose', { name: planName(p) }))}" title="${esc(t('main.wpTabClose', { name: planName(p) }))}"><i class="bx bx-x" aria-hidden="true"></i></button></div>`;
    });
    if (canCreate) html += `<button type="button" class="wp-tab wp-tab-add" data-wp-new="1" data-help-key="wpNew"><i class="bx bx-plus" aria-hidden="true"></i><span class="wp-tab-nm">${esc(t('main.wpNew'))}</span></button>`;
    el.innerHTML = html;
}
function activate(id) {
    form = null;
    tabs.active = id;
    if (isPlanTab(id) && !tabs.open.includes(id)) tabs.open.push(id);
    saveTabs();
    render();
    if (id === 'mine') { loadMine().then(() => { if (tabs.active === 'mine') render(); }).catch((err) => failed(err)); return; }
    if (id === 'team') { loadTeam().then(() => { if (tabs.active === 'team') render(); }).catch((err) => failed(err)); return; }
    if (isPlanTab(id) && !cache.has(id)) {
        planLoading = id;
        loadPlan(id).then(() => { planLoading = null; if (tabs.active === id) render(); }).catch((err) => { planLoading = null; failed(err, id); });
    }
}
function closeTab(id) {
    tabs.open = tabs.open.filter((x) => x !== id);
    if (tabs.active === id) tabs.active = tabs.open.length ? tabs.open[tabs.open.length - 1] : 'list';
    form = null;
    saveTabs();
    render();
    if (isPlanTab(tabs.active) && !cache.has(tabs.active)) activate(tabs.active);
}

// ---- la lista de planes -------------------------------------------------------------------------------------------------------------------------------
function planMatches(p, query) {
    if (!query.trim()) return true;
    return SearchSyntax.matches('contains', query, `${p.title || ''} ${p.description || ''} ${p.ownerName || ''}`);
}
function dueText(p, today) {
    if (!p.nextDue || !p.nextDue.endDate) return { text: p.openLeafCount ? t('main.wpNextNone') : (p.leafCount ? t('main.wpAllDone') : t('main.wpEmptyPlan')), late: false };
    const late = p.nextDue.endDate < today;
    return { text: t(late ? 'main.wpLateItem' : 'main.wpNextItem', { title: p.nextDue.title, date: shortDate(p.nextDue.endDate) }), late };
}
// un plan está «vivo» (se puede trabajar) solo mientras está activo; finalizado, inactivo y cancelado son de solo consulta
const isLive = (p) => !p.status || p.status === 'active';
const STATE_CHIP_KEY = { closed: 'main.wpClosedChip', inactive: 'main.wpInactiveChip', cancelled: 'main.wpCancelledChip' };
const stateChip = (status) => `<span class="wp-chip wp-chip-closed wp-chip-${esc(status)}">${esc(t(STATE_CHIP_KEY[status] || 'main.wpClosedChip'))}</span>`;
const originOf = (p) => p.origin || 'own';
const roleText = (role) => t(`main.wpRole_${role}`);
// las etiquetas de una tarjeta según de dónde viene el plan: mío (privado o compartido con N), compartido conmigo (con mi rol) o del equipo (mi jefe lo enciende en su plan: solo lectura)
function cardChips(p) {
    const origin = originOf(p);
    const chips = [];
    if (origin === 'own') {
        chips.push(`<span class="wp-chip wp-chip-own">${esc(t('main.wpOriginOwn'))}</span>`);
        chips.push(`<span class="wp-chip">${esc(p.memberCount ? t('main.wpSharedWith', { n: p.memberCount }) : t('main.wpPrivate'))}</span>`);
    } else if (origin === 'shared') {
        chips.push(`<span class="wp-chip wp-chip-shared">${esc(t('main.wpOriginShared'))}</span>`);
        chips.push(`<span class="wp-chip">${esc(roleText(p.myRole || 'view'))}</span>`);
    } else {
        chips.push(`<span class="wp-chip wp-chip-team">${esc(t('main.wpOriginTeam'))}</span>`);
        chips.push(`<span class="wp-chip">${esc(t('main.wpReadOnly'))}</span>`);
    }
    if (p.isNew) chips.push(`<span class="wp-chip wp-chip-new">${esc(t('main.wpNewChip'))}</span>`);
    if (p.unreadComments) chips.push(`<span class="wp-chip wp-chip-new" title="${esc(t('main.wpUnreadComments', { n: p.unreadComments }))}"><i class="bx bx-message-rounded-dots" aria-hidden="true"></i> ${esc(t('main.wpUnreadComments', { n: p.unreadComments }))}</span>`);
    if (!isLive(p)) chips.push(stateChip(p.status));
    return chips.join('');
}
function card(p, today) {
    const due = dueText(p, today);
    const closed = !isLive(p);
    const chips = [cardChips(p)];
    const sub = originOf(p) === 'own' ? weekText(p.startDate, p.endDate) : `${t('main.wpFromOwner', { name: p.ownerName || '—' })} · ${weekText(p.startDate, p.endDate)}`;
    return `<div class="wp-card${closed ? ' wp-card-closed' : ''}${p.isNew ? ' wp-card-new' : ''}" data-wp-card="${p.id}" role="group" aria-label="${esc(planName(p))}" data-help-key="wpCard">
        <div class="wp-card-top"><span class="wp-avatar" aria-hidden="true">${esc(initials(p.title))}</span><div class="wp-card-title"><b>${esc(planName(p))}</b><small>${esc(sub)}</small></div>
            <button type="button" class="wp-star${p.pinned ? ' on' : ''}" data-wp-pin="${p.id}" aria-pressed="${!!p.pinned}" aria-label="${esc(t(p.pinned ? 'main.wpUnpin' : 'main.wpPin'))}" title="${esc(t(p.pinned ? 'main.wpUnpin' : 'main.wpPin'))}" data-help-key="wpPin"><i class="bx ${p.pinned ? 'bxs-star' : 'bx-star'}" aria-hidden="true"></i></button></div>
        ${p.description ? `<p class="wp-card-desc">${esc(p.description)}</p>` : ''}
        <div class="wp-chips">${chips.join('')}</div>
        <div class="wp-meter" role="img" aria-label="${esc(t('main.wpProgressLabel', { pct: p.progress || 0 }))}"><div class="wp-meter-top"><span>${esc(t('main.wpProgressOf', { done: p.doneCount || 0, total: p.leafCount || 0 }))}</span><b>${p.progress || 0}%</b></div><div class="wp-meter-bar"><i style="width:${Math.max(0, Math.min(100, p.progress || 0))}%"></i></div></div>
        <div class="wp-card-foot"><span class="wp-due${due.late ? ' wp-due-late' : ''}">${esc(due.text)}</span><button type="button" class="btn wp-open" data-wp-open="${p.id}" data-help-key="wpOpen">${esc(t('main.wpOpen'))}</button></div>
    </div>`;
}
// partial: al escribir en el buscador o cambiar el filtro solo se cambia lo de abajo, para no perder el cursor del buscador
function renderList(partial) {
    const root = $('wp-root');
    const today = todayYmd();
    const active = plans.filter(isLive);
    const closed = plans.filter((p) => p.status === 'closed');
    const inactive = plans.filter((p) => p.status === 'inactive');
    const cancelled = plans.filter((p) => p.status === 'cancelled');
    const own = active.filter((p) => originOf(p) === 'own');
    const sharedWithMe = active.filter((p) => originOf(p) !== 'own');
    const pool = { all: active, own, shared: sharedWithMe, closed, inactive, cancelled }[listFilter] || active;
    const shown = pool.filter((p) => planMatches(p, listQuery));
    // «Compartidos conmigo» solo sale si hay (o si se estaba mirando), para que quien no comparte nada no vea un filtro vacío
    const filterList = [['all', 'main.wpFilterAll', active.length], ['own', 'main.wpFilterOwn', own.length]];
    if (sharedWithMe.length || listFilter === 'shared') filterList.push(['shared', 'main.wpFilterShared', sharedWithMe.length]);
    filterList.push(['closed', 'main.wpFilterClosed', closed.length]);
    // Inactivos y Cancelados solo salen si hay (o si se estaba mirando), para no llenar la fila de filtros vacíos
    if (inactive.length || listFilter === 'inactive') filterList.push(['inactive', 'main.wpFilterInactive', inactive.length]);
    if (cancelled.length || listFilter === 'cancelled') filterList.push(['cancelled', 'main.wpFilterCancelled', cancelled.length]);
    const filters = `<div class="wp-filters" role="group" data-help-key="wpFilter">${filterList.map(([key, label, n]) => `<button type="button" class="wp-pill${listFilter === key ? ' active' : ''}" data-wp-filter="${key}" aria-pressed="${listFilter === key}">${esc(t(label))} · ${n}</button>`).join('')}</div>`;
    const search = `<div class="wp-search" data-help-key="wpSearch"><i class="bx bx-search" aria-hidden="true"></i><input id="wp-search" type="search" value="${esc(listQuery)}" placeholder="${esc(t('main.wpSearchPlaceholder'))}" aria-label="${esc(t('main.wpSearchPlaceholder'))}" autocomplete="off"></div>`;
    const create = canCreate ? `<button type="button" class="btn" data-wp-new="1" data-help-key="wpNew"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.wpNew'))}</button>` : '';
    let body = '';
    if (!plans.length) {
        body = `<div class="wp-empty"><i class="bx bx-calendar-check" aria-hidden="true"></i><h3>${esc(t('main.wpEmptyTitle'))}</h3><p>${esc(t('main.wpEmptyText'))}</p>${create ? `<p>${create}</p>` : ''}</div>`;
    } else if (!shown.length) {
        body = `<p class="wp-none">${esc(t(listQuery.trim() ? 'main.wpNoMatches' : ({ closed: 'main.wpNoClosed', inactive: 'main.wpNoInactive', cancelled: 'main.wpNoCancelled' }[listFilter] || 'main.wpNoActive')))}</p>`;
    } else {
        // fijados arriba; luego mis planes, los compartidos conmigo y los del equipo (cada grupo solo se nombra si hay más de uno)
        const pinned = shown.filter((p) => p.pinned);
        const rest = shown.filter((p) => !p.pinned);
        const groups = [['main.wpGroupPinned', pinned], ['main.wpGroupOwn', rest.filter((p) => originOf(p) === 'own')], ['main.wpGroupShared', rest.filter((p) => originOf(p) === 'shared')], ['main.wpGroupTeam', rest.filter((p) => originOf(p) === 'team')]].filter(([, list]) => list.length);
        const grid = (list) => `<div class="wp-cards">${list.map((p) => card(p, today)).join('')}</div>`;
        body = groups.length === 1 && groups[0][0] !== 'main.wpGroupPinned' ? grid(groups[0][1]) : groups.map(([key, list]) => `<h4 class="wp-group">${esc(t(key))}</h4>${grid(list)}`).join('');
    }
    // el buscador no se reemplaza mientras se escribe: si ya está en pantalla solo se cambia lo de abajo
    const existing = root.querySelector('#wp-list-body');
    if (partial && existing && root.dataset.view === 'list') { existing.innerHTML = body; root.querySelector('.wp-filters').outerHTML = filters; return; }
    root.dataset.view = 'list';
    root.innerHTML = `<div class="wp-toolbar">${filters}<div class="wp-toolbar-r">${search}${create}</div></div><div id="wp-list-body">${body}</div>`;
}

// ---- un plan abierto ----------------------------------------------------------------------------------------------------------------------------------
function kpis(plan, items, today) {
    const leaves = items.filter((i) => !i.childCount);
    const done = leaves.filter((i) => i.status === 'done').length;
    const late = leaves.filter((i) => i.status !== 'done' && i.endDate && i.endDate < today).length;
    const weekBox = plan.startDate && plan.endDate ? `<b>${esc(weekText(plan.startDate, plan.endDate))}</b><span>${esc(weekRangeText(plan))}</span>` : `<b>—</b><span>${esc(t('main.wpNoDates'))}</span>`;
    return `<div class="impl-kpis" role="group" aria-label="${esc(t('main.wpNameKpis'))}" data-help-key="wpKpis"><div class="impl-kpi">${weekBox}</div><div class="impl-kpi"><b>${plan.progress || 0}%</b><span>${esc(t('main.wpProgressOf', { done, total: leaves.length }))}</span></div>${late ? `<div class="impl-kpi wp-kpi-late"><b>${late}</b><span>${esc(t(late === 1 ? 'main.wpLateOne' : 'main.wpLateMany'))}</span></div>` : ''}</div>`;
}
function levelStrip(plan, canEdit) {
    const names = plan.levelNames || [];
    const chips = names.map((name, i) => `<span class="wp-lvl-chip wp-lvl-chip-${(i % 4) + 1}"><i>${i + 1}</i>${esc(name)}</span>`).join('<span class="wp-lvl-arrow" aria-hidden="true">›</span>');
    return `<div class="wp-levels" role="group" aria-label="${esc(t('main.wpLevelsOfPlan'))}" data-help-key="wpLevels"><b>${esc(t('main.wpLevelsOfPlan'))}</b>${chips}${canEdit ? `<button type="button" class="btn btn-secondary wp-small" data-wp-act="edit-plan">${esc(t('main.wpChangeNames'))}</button>` : ''}</div>`;
}
// De quién es el plan y con quién se comparte: «Privado», «Compartido con 3 personas» o «De Marco Ríos · Tu rol: Colaborar».
function accessLine(plan) {
    const origin = originOf(plan);
    if (origin === 'own') return plan.memberCount ? t('main.wpSharedWith', { n: plan.memberCount }) + (plan.bossCanView ? ` · ${t('main.wpBossSees')}` : '') : (plan.bossCanView ? `${t('main.wpPrivate')} · ${t('main.wpBossSees')}` : t('main.wpPrivate'));
    return `${t('main.wpFromOwner', { name: plan.ownerName || '—' })} · ${t('main.wpYourRole', { role: roleText(origin === 'team' ? 'team' : (plan.myRole || 'view')) })}`;
}
// Lo que cada quien puede hacer con el plan lo decide el servidor según su rol (plan.can); aquí solo se dibujan los botones que vienen permitidos.
function planActions(plan) {
    const can = plan.can || {};
    const closed = plan.status === 'closed';
    const live = isLive(plan);
    const btn = (op, icon, labelKey, extra) => `<button type="button" class="btn btn-secondary wp-small${extra ? ` ${extra}` : ''}" data-wp-act="${op}" data-help-key="${{ pin: 'wpPin', history: 'wpHistory', comments: 'wpPlanComments', close: 'wpClose', reopen: 'wpClose', inactivate: 'wpInactivate', reactivate: 'wpInactivate', cancel: 'wpCancel', delete: 'wpDelete', 'edit-plan': 'wpEditPlan', share: 'wpShare', people: 'wpShare', leave: 'wpLeave' }[op] || 'wpPlanActions'}"><i class="bx ${icon}" aria-hidden="true"></i> ${esc(t(labelKey))}</button>`;
    const out = [btn('pin', plan.pinned ? 'bxs-star' : 'bx-star', plan.pinned ? 'main.wpUnpin' : 'main.wpPin')];
    if (can.edit && live) out.push(btn('edit-plan', 'bx-edit-alt', 'main.wpEditPlan'));
    out.push(can.share && live ? btn('share', 'bx-share-alt', 'main.wpShare') : btn('people', 'bx-group', 'main.wpPeople'));
    if (can.close && (closed || live)) out.push(btn(closed ? 'reopen' : 'close', closed ? 'bx-lock-open-alt' : 'bx-lock-alt', closed ? 'main.wpReopen' : 'main.wpClosePlan'));
    if (can.inactivate) out.push(btn('inactivate', 'bx-pause-circle', 'main.wpInactivatePlan'));
    if (can.reactivate) out.push(btn('reactivate', 'bx-play-circle', 'main.wpReactivatePlan'));
    if (can.cancel) out.push(btn('cancel', 'bx-block', 'main.wpCancelPlan', 'wp-danger'));
    if (can.delete) out.push(btn('delete', 'bx-trash', 'main.wpDeletePlan', 'wp-danger'));
    out.push(btn('comments', 'bx-message-rounded-dots', 'main.wpPlanComments'));
    out.push(btn('history', 'bx-history', 'main.wpHistory'));
    if (can.leave) out.push(btn('leave', 'bx-log-out-circle', 'main.wpLeave'));
    return `<div class="wp-actions">${out.join('')}</div>`;
}
// Los iconos de lo que se puede hacer con un renglón (item.can lo manda el servidor para quien mira).
function rowButtons(plan, item) {
    const can = item.can || {};
    const btn = (op, icon, labelKey, extra) => `<button type="button" class="admin-icon-btn impl-act-btn${op === 'remove' ? ' admin-icon-btn-danger' : ''}" data-wp-row="${op}" data-id="${item.id}"${extra || ''} aria-label="${esc(t(labelKey))}" title="${esc(t(labelKey))}"><i class="bx ${icon}" aria-hidden="true"></i></button>`;
    const out = [];
    if (can.status && !item.childCount) {
        if (item.status === 'pending') out.push(btn('status', 'bx-play', 'main.wpMarkRunning', ' data-status="in_progress"'));
        if (item.status !== 'done') out.push(btn('status', 'bx-check', 'main.wpMarkDone', ' data-status="done"'));
        if (item.status !== 'pending') out.push(btn('status', 'bx-undo', 'main.wpMarkPending', ' data-status="pending"'));
    }
    if (can.addChild) out.push(btn('add-child', 'bx-subdirectory-right', 'main.wpAddChild', ` data-child-label="${esc(levelLabel(plan, item.depth + 1))}"`));
    if (can.edit) out.push(btn('edit', 'bx-edit-alt', 'main.wpEditItem'));
    if (can.move) { out.push(btn('up', 'bx-up-arrow-alt', 'main.wpMoveUp')); out.push(btn('down', 'bx-down-arrow-alt', 'main.wpMoveDown')); }
    if (can.remove) out.push(btn('remove', 'bx-trash', 'main.wpRemoveItem'));
    return out.length ? `<span class="impl-act-btns" role="group" aria-label="${esc(t('main.wpNameActions'))}" data-help-key="wpItemActions">${out.join('')}</span>` : '';
}
const statusText = (status) => t(`main.wpStatus_${status}`);
const dot = (status) => `<span class="impl-dot impl-dot-${status === 'in_progress' ? 'running' : status}" role="img" aria-label="${esc(statusText(status))}" title="${esc(statusText(status))}"></span>`;
const TONE = { pending: 'cancelled', in_progress: 'negotiating', done: 'approved' };
// Quién responde por el renglón (responsable) y quién lo hace (ejecuta): los dos se ven en cada renglón
function whoCell(item) {
    const resp = item.responsibleName ? `<span class="wp-who wp-who-resp" title="${esc(t('main.wpFieldResponsible'))}"><i class="bx bx-user-check" aria-hidden="true"></i>${esc(t('main.wpWhoResp', { name: item.responsibleName }))}</span>` : '';
    const exec = item.executorName ? `<span class="wp-who wp-who-exec" title="${esc(t('main.wpFieldExecutor'))}"><i class="bx bx-hard-hat" aria-hidden="true"></i>${esc(t('main.wpWhoExec', { name: item.executorName }))}</span>` : '';
    return `<span class="impl-act-who wp-whos">${resp}${exec}${resp || exec ? '' : `<span class="wp-who wp-who-none">${esc(t('main.wpNoResponsible'))}</span>`}</span>`;
}
// El globito de comentarios de un renglón: cuántos lleva y, si hay sin leer, se resalta. Siempre está (aunque no lleve ninguno) para poder escribir el primero.
function commentChip(item) {
    const n = item.commentCount || 0;
    const unread = item.unreadCount || 0;
    const label = unread ? t('main.wpCommentsUnread', { n: unread, title: item.title }) : t('main.wpCommentsOf', { title: item.title });
    return `<button type="button" class="wp-cmt${unread ? ' wp-cmt-hot' : ''}${n ? '' : ' wp-cmt-none'}" data-wp-row="comments" data-id="${item.id}" aria-label="${esc(label)}" title="${esc(label)}" data-help-key="wpComments"><i class="bx bx-message-rounded-dots" aria-hidden="true"></i>${n ? `<span>${n}</span>` : ''}</button>`;
}
function nameCell(plan, item, collapsed) {
    const status = statusOf(item);
    const pad = 0.5 + Math.min(item.depth - 1, 10) * 1.25; // la sangría deja de crecer pasado el nivel 11 para que el nombre siga cabiendo
    const toggle = item.childCount
        ? `<button type="button" class="impl-chev" data-wp-toggle="${item.id}" aria-expanded="${!collapsed}" aria-label="${esc(t(collapsed ? 'main.wpExpand' : 'main.wpCollapse'))}" title="${esc(t(collapsed ? 'main.wpExpand' : 'main.wpCollapse'))}"><i class="bx bx-chevron-right" aria-hidden="true"></i></button>`
        : '<span class="impl-chev impl-chev-none" aria-hidden="true"></span>';
    const note = item.note ? `<i class="bx bx-note wp-note-ico" role="img" aria-label="${esc(t('main.wpHasNote'))}" title="${esc(item.note)}"></i>` : '';
    const count = item.childCount ? `<span class="impl-cnt">${esc(t('main.wpChildCount', { n: item.childCount }))}</span>` : '';
    return `<div class="impl-nm impl-act-nm wp-nm${item.childCount ? ' wp-node' : ''}" style="padding-left:${pad}rem" role="group" aria-label="${esc(item.title)}" data-help-key="wpItemRow"><span class="impl-act-line"><span class="impl-act-t">${toggle}${dot(status)}<span class="impl-act-name"><b class="wp-title" data-wp-row="comments" data-id="${item.id}" role="button" tabindex="0" title="${esc(t('main.wpOpenItem'))}">${esc(item.title)}</b> <span class="wp-lvl-tag">${esc(levelLabel(plan, item.depth))}</span> ${count}${note} ${commentChip(item)}</span></span></span>
        <span class="impl-act-line impl-act-sub">${whoCell(item)}${rowButtons(plan, item)}</span></div>`;
}
function barCells(item, axis, today) {
    const weeks = axis.weeks;
    let from = 0;
    let to = 0;
    if (weeks && item.rangeStart && item.rangeEnd) {
        from = Math.max(1, weekOf(axis.origin, dayOf(item.rangeStart)));
        to = Math.min(weeks, weekOf(axis.origin, dayOf(item.rangeEnd)));
    }
    const nowWeek = weeks ? weekOf(axis.origin, new Date()) : 0;
    const status = statusOf(item);
    const tone = status === 'done' ? 'done' : (isLate(item, today) ? 'late' : (status === 'in_progress' ? 'running' : 'pending'));
    let cells = '';
    for (let w = 1; w <= weeks; w += 1) {
        const cls = `impl-c${w === nowWeek ? ' impl-now' : ''}${item.childCount ? ' wp-node' : ''}`;
        if (from && to && from <= to && w === from) {
            const title = esc(`${item.title} · ${shortDate(item.rangeStart)} – ${shortDate(item.rangeEnd)}`);
            const bar = item.childCount
                ? `<div class="wp-bar-node" title="${title}"><i style="width:${item.progress || 0}%"></i></div>`
                : `<div class="impl-bar impl-bar-act impl-bar-act-${tone}" title="${title}"></div>`;
            cells += `<div class="${cls}" style="grid-column: span ${to - from + 1}">${bar}</div>`;
        } else if (!(from && to && from <= to && w > from && w <= to)) cells += `<div class="${cls}"></div>`;
    }
    return cells;
}
function stateCell(item, today) {
    const status = statusOf(item);
    const label = item.childCount && status === 'in_progress' ? t('main.wpStatusProgress', { pct: item.progress || 0 }) : statusText(status);
    const dates = item.rangeStart ? `${shortDate(item.rangeStart)} – ${shortDate(item.rangeEnd)}` : t('main.wpNoDates');
    return `<div class="impl-st impl-sub-st${item.childCount ? ' wp-node' : ''}"><span class="exp-chip exp-chip-${TONE[status] || 'cancelled'}">${esc(label)}</span>${isLate(item, today) ? ` <span class="exp-chip exp-chip-pending">${esc(t('main.wpLate'))}</span>` : ''}<span class="impl-dates">${esc(dates)}</span></div>`;
}
function itemForm(plan, data) {
    const f = form;
    const levelName = levelLabel(plan, f.depth);
    const v = f.values;
    return `<form class="impl-form wp-form" data-wp-form="1" novalidate aria-label="${esc(f.mode === 'edit' ? t('main.wpFormEdit', { level: levelName }) : t('main.wpFormNew', { level: levelName }))}" data-help-key="wpForm">
        <h4>${esc(f.mode === 'edit' ? t('main.wpFormEdit', { level: levelName }) : t('main.wpFormNew', { level: levelName }))}</h4>
        <div class="impl-form-grid">
            <div class="admin-field impl-f-wide"><label for="wp-f-title">${esc(t('main.wpFieldTitle'))}</label><input id="wp-f-title" name="title" type="text" maxlength="120" required autocomplete="off" value="${esc(v.title)}"></div>
            <div class="admin-field impl-f-resp"><label for="wp-f-resp">${esc(t('main.wpFieldResponsible'))}</label><input id="wp-f-resp" name="responsible" type="text" maxlength="80" list="wp-f-people" autocomplete="off" placeholder="${esc(t('main.wpResponsibleHint'))}" value="${esc(v.responsible)}"><datalist id="wp-f-people">${(data.people || []).map((p) => `<option value="${esc(p.name)}"></option>`).join('')}</datalist></div>
            <div class="admin-field impl-f-resp"><label for="wp-f-exec">${esc(t('main.wpFieldExecutor'))}</label><input id="wp-f-exec" name="executor" type="text" maxlength="80" list="wp-f-people" autocomplete="off" placeholder="${esc(t('main.wpExecutorHint'))}" value="${esc(v.executor)}"></div>
            <div class="admin-field"><label for="wp-f-from">${esc(t('main.wpFieldFrom'))}</label><input id="wp-f-from" name="startDate" type="date" value="${esc(v.startDate)}"></div>
            <div class="admin-field"><label for="wp-f-to">${esc(t('main.wpFieldTo'))}</label><input id="wp-f-to" name="endDate" type="date" value="${esc(v.endDate)}"></div>
            <div class="admin-field impl-f-wide"><label for="wp-f-note">${esc(t('main.wpFieldNote'))}</label><textarea id="wp-f-note" name="note" rows="2" maxlength="1000">${esc(v.note)}</textarea></div>
        </div>
        <p class="admin-error wp-form-error" role="alert"${f.error ? '' : ' hidden'}>${esc(f.error)}</p>
        <div class="admin-form-actions"><button type="submit" class="btn"${f.busy ? ' disabled' : ''}>${esc(t('main.wpSave'))}</button><button type="button" class="btn btn-secondary" data-wp-act="cancel-form">${esc(t('main.wpCancel'))}</button></div>
    </form>`;
}
function gantt(plan, items, data) {
    const today = todayYmd();
    const axis = axisFor(items);
    const weeks = axis.weeks;
    const cols = `minmax(19rem, 1.7fr) ${weeks ? `repeat(${weeks}, minmax(2.1rem, 1fr))` : ''} minmax(10rem, 0.9fr)`;
    const nowWeek = weeks ? weekOf(axis.origin, new Date()) : 0;
    const nowIn = nowWeek >= 1 && nowWeek <= weeks ? nowWeek : 0;
    let html = `<div class="impl-gantt wp-gantt" style="grid-template-columns: ${cols}">`;
    html += `<div class="impl-h impl-l">${esc(t('main.wpColItem'))}</div>`;
    for (let w = 1; w <= weeks; w += 1) {
        const start = new Date(axis.origin.getFullYear(), axis.origin.getMonth(), axis.origin.getDate() + (w - 1) * 7);
        html += `<div class="impl-h${w === nowIn ? ' impl-now' : ''}" title="${esc(shortDate(ymdOf(start)))}">${esc(t('main.wpWeekShort', { n: w }))}</div>`;
    }
    html += `<div class="impl-h impl-l">${esc(t('main.wpColState'))}</div>`;
    // dónde va el formulario: después de su renglón (editar) o de la última rama del padre (agregar adentro); agregar en la raíz va al final
    const formHere = !!(form && form.planId === plan.id);
    const formRow = () => `<div class="impl-detail-row"><div class="impl-form-wrap">${itemForm(plan, data)}</div></div>`;
    let formAfter = -2;
    if (formHere && form.mode === 'edit') formAfter = items.findIndex((i) => i.id === form.id);
    else if (formHere && form.parentId) {
        const parentAt = items.findIndex((i) => i.id === form.parentId);
        formAfter = parentAt;
        for (let j = parentAt + 1; j < items.length && items[j].depth > items[parentAt].depth; j += 1) formAfter = j;
    }
    let hideBelow = 0; // profundidad desde la que se esconden las ramas de un renglón cerrado
    items.forEach((item, index) => {
        if (hideBelow && item.depth > hideBelow) return;
        hideBelow = 0;
        const collapsed = item.childCount > 0 && isCollapsed(plan.id, item.id) && !(formHere && form.parentId === item.id);
        if (collapsed) hideBelow = item.depth;
        html += nameCell(plan, item, collapsed) + barCells(item, axis, today) + stateCell(item, today);
        if (index === formAfter) html += formRow();
    });
    const rootForm = formHere && form.mode === 'add' && !form.parentId;
    if (!items.length && !rootForm) html += `<div class="impl-detail-row wp-gantt-empty"><p>${esc(t('main.wpNoItems'))}</p></div>`;
    if (rootForm) html += formRow();
    else if (plan.can && plan.can.addRoot && isLive(plan)) html += `<div class="impl-detail-row"><div class="impl-add-wrap"><button type="button" class="impl-add" data-wp-act="add-root" data-help-key="wpAddItem"><span class="impl-plus" aria-hidden="true">+</span>${esc(t('main.wpAddRoot', { level: levelLabel(plan, 1) }))}</button></div></div>`;
    return `${html}</div>`;
}
function renderPlan(id) {
    const root = $('wp-root');
    root.dataset.view = 'plan';
    const data = cache.get(id);
    if (!data) { root.innerHTML = `<p class="wp-none">${esc(t('main.wpLoading'))}</p>`; return; }
    const { plan, items } = data;
    const frame = root.querySelector('.impl-frame');
    const scrolled = frame ? frame.scrollLeft : 0; // al abrir o cerrar una rama el cronograma no se corre de lugar
    const today = todayYmd();
    const range = plan.startDate ? t('main.wpRange', { from: longDate(plan.startDate), to: longDate(plan.endDate) }) : t('main.wpNoDates');
    root.innerHTML = `<div class="impl-head wp-head"><div><h3>${esc(planName(plan))}${!isLive(plan) ? ` ${stateChip(plan.status)}` : ''}</h3>${plan.status === 'cancelled' && plan.cancelReason ? `<span class="impl-sub wp-cancel-reason">${esc(t('main.wpCancelReasonLine', { reason: plan.cancelReason }))}</span>` : ''}${plan.description ? `<span class="impl-sub">${esc(plan.description)}</span>` : ''}<span class="impl-sub">${esc(range)}</span><span class="impl-sub wp-access">${esc(accessLine(plan))}</span></div>${kpis(plan, items, today)}</div>
        ${planActions(plan)}
        ${levelStrip(plan, !!(plan.can && plan.can.edit) && isLive(plan))}
        <div class="impl-frame" role="region" aria-label="${esc(t('main.wpNameGantt'))}" data-help-key="wpGantt">${gantt(plan, items, data)}</div>`;
    const framed = root.querySelector('.impl-frame');
    if (framed && scrolled) framed.scrollLeft = scrolled;
    if (form && form.planId === plan.id) setTimeout(() => { const el = $('wp-f-title'); if (el && document.activeElement !== el && !form.focused) { el.focus(); form.focused = true; } }, 0);
}
function render() {
    renderTabs();
    if (tabs.active === 'list') renderList(); else if (tabs.active === 'mine') renderMine(); else if (tabs.active === 'team') renderTeam(); else renderPlan(tabs.active);
}

// ---- Mis actividades (pieza 3a) ------------------------------------------------------------------------------------------------------------------------
// Lo que me toca (responsable o quien ejecuta) de TODOS mis planes activos, junto. El servidor manda la lista ya ordenada (lo que falta por fecha, lo hecho al final); aquí se agrupa por cuándo vence, se filtra y se cambia el estado de las hojas.
const daysBetween = (fromYmd, toYmd) => Math.round((dayOf(toYmd) - dayOf(fromYmd)) / 86400000);
// cuándo vence (group: late | week | later | nodate | done) y el texto con el color que le toca
function dueInfo(a, today) {
    if (a.status === 'done') return { group: 'done', text: '', tone: '' };
    if (!a.endDate) return { group: 'nodate', text: t('main.wpNoDates'), tone: '' };
    const n = daysBetween(today, a.endDate);
    if (n < 0) return { group: 'late', text: t(n === -1 ? 'main.wpMineDueAgoOne' : 'main.wpMineDueAgo', { n: -n }), tone: 'late' };
    const sunday = ymdOf(new Date(mondayOf(dayOf(today)).getTime() + 6 * 86400000 + 3600000));
    const text = n === 0 ? t('main.wpMineDueToday') : (n === 1 ? t('main.wpMineDueTomorrow') : t('main.wpMineDueIn', { n }));
    return { group: a.endDate <= sunday ? 'week' : 'later', text, tone: n <= 1 ? 'warn' : '' };
}
function mineMatches(a, today) {
    if (mineRole === 'responsible' && a.role === 'executor') return false;
    if (mineRole === 'executor' && a.role === 'responsible') return false;
    if (mineQuery.trim() && !SearchSyntax.matches('contains', mineQuery, `${a.title} ${a.planTitle} ${a.path.join(' ')}`)) return false;
    if (mineFilter === 'open') return a.status !== 'done';
    if (mineFilter === 'late') return dueInfo(a, today).group === 'late';
    if (mineFilter === 'done') return a.status === 'done';
    return true;
}
function mineRow(a, today, helpKey) {
    const info = dueInfo(a, today);
    const roleKey = a.role === 'both' ? 'main.wpMineChipBoth' : (a.role === 'responsible' ? 'main.wpMineChipResp' : 'main.wpMineChipExec');
    const crumbs = [a.planTitle, ...a.path].map(esc).join(' › ');
    const data = ` data-plan="${a.planId}" data-id="${a.itemId}"`;
    const btn = (icon, labelKey, status) => `<button type="button" class="admin-icon-btn impl-act-btn" data-wp-mine="status"${data} data-status="${status}" aria-label="${esc(t(labelKey))}" title="${esc(t(labelKey))}"><i class="bx ${icon}" aria-hidden="true"></i></button>`;
    const actions = [];
    if (a.canStatus && a.isLeaf) {
        if (a.status === 'pending') actions.push(btn('bx-play', 'main.wpMarkRunning', 'in_progress'));
        if (a.status !== 'done') actions.push(btn('bx-check', 'main.wpMarkDone', 'done'));
        if (a.status !== 'pending') actions.push(btn('bx-undo', 'main.wpMarkPending', 'pending'));
    }
    const range = a.startDate && a.endDate ? (a.startDate === a.endDate ? shortDate(a.endDate) : `${shortDate(a.startDate)} – ${shortDate(a.endDate)}`) : '';
    const stateLabel = !a.isLeaf && a.status === 'in_progress' ? t('main.wpStatusProgress', { pct: a.progress || 0 }) : statusText(a.status);
    const chips = [
        `<span class="wp-chip${a.role === 'executor' ? ' wp-chip-team' : ' wp-chip-own'}">${esc(t(roleKey))}</span>`,
        `<span class="exp-chip exp-chip-${TONE[a.status] || 'cancelled'}">${esc(stateLabel)}</span>`,
        info.text ? `<span class="wp-chip${info.tone === 'late' ? ' wp-mine-late' : (info.tone === 'warn' ? ' wp-mine-warn' : '')}">${esc(info.text)}</span>` : '',
        range ? `<span class="wp-chip">${esc(range)}</span>` : '',
        a.unreadCount ? `<span class="wp-chip wp-chip-new" title="${esc(t('main.wpUnreadComments', { n: a.unreadCount }))}"><i class="bx bx-message-rounded-dots" aria-hidden="true"></i> ${a.unreadCount}</span>` : (a.commentCount ? `<span class="wp-chip"><i class="bx bx-message-rounded-dots" aria-hidden="true"></i> ${a.commentCount}</span>` : ''),
    ].filter(Boolean).join('');
    return `<div class="wp-mine-row${info.tone === 'late' ? ' is-late' : ''}${a.status === 'done' ? ' is-done' : ''}" role="group" aria-label="${esc(a.title)}" data-help-key="${helpKey || 'wpMineRow'}">
        ${dot(a.status)}
        <div class="wp-mine-main"><b class="wp-mine-title" data-wp-mine="open"${data} role="button" tabindex="0" title="${esc(t('main.wpOpenItem'))}">${esc(a.title)}</b> <span class="wp-lvl-tag">${esc(a.levelName || levelLabel({ levelNames: [] }, a.depth))}</span>
            <span class="wp-mine-crumbs">${crumbs}</span><span class="wp-mine-meta">${chips}</span></div>
        <div class="wp-mine-side">${actions.length ? `<span class="impl-act-btns" role="group" aria-label="${esc(t('main.wpNameActions'))}" data-help-key="wpMineActions">${actions.join('')}</span>` : ''}<button type="button" class="btn wp-open" data-wp-mine="open"${data}>${esc(t('main.wpMineOpenPlan'))} ›</button></div>
    </div>`;
}
const MINE_GROUPS = [['late', 'main.wpMineGroupLate'], ['week', 'main.wpMineGroupWeek'], ['later', 'main.wpMineGroupLater'], ['nodate', 'main.wpMineGroupNoDate'], ['done', 'main.wpMineGroupDone']];
// partial: al escribir en el buscador o cambiar un filtro solo se cambia lo de abajo, para no perder el cursor
function renderMine(partial) {
    const root = $('wp-root');
    const today = todayYmd();
    const all = mine.activities;
    const groupOf = (a) => dueInfo(a, today).group;
    const counts = { open: all.filter((a) => a.status !== 'done').length, late: all.filter((a) => groupOf(a) === 'late').length, done: all.filter((a) => a.status === 'done').length, all: all.length };
    const pill = (attr, key, label, n, current) => `<button type="button" class="wp-pill${current === key ? ' active' : ''}" data-wp-mine-${attr}="${key}" aria-pressed="${current === key}">${esc(t(label))}${n == null ? '' : ` · ${n}`}</button>`;
    const filters = `<div class="wp-filters wp-mine-filters" role="group" aria-label="${esc(t('main.wpMineFilterName'))}" data-help-key="wpMineFilter">${[['open', 'main.wpMineFilterOpen'], ['late', 'main.wpMineFilterLate'], ['done', 'main.wpMineFilterDone'], ['all', 'main.wpMineFilterAll']].map(([k, l]) => pill('filter', k, l, counts[k], mineFilter)).join('')}</div>`;
    const roles = `<div class="wp-filters wp-mine-roles" role="group" aria-label="${esc(t('main.wpMineRoleName'))}" data-help-key="wpMineRole">${[['all', 'main.wpMineRoleAll'], ['responsible', 'main.wpMineRoleResp'], ['executor', 'main.wpMineRoleExec']].map(([k, l]) => pill('role', k, l, null, mineRole)).join('')}</div>`;
    const search = `<div class="wp-search" data-help-key="wpSearch"><i class="bx bx-search" aria-hidden="true"></i><input id="wp-mine-search" type="search" value="${esc(mineQuery)}" placeholder="${esc(t('main.wpMineSearchPlaceholder'))}" aria-label="${esc(t('main.wpMineSearchPlaceholder'))}" autocomplete="off"></div>`;
    const shown = all.filter((a) => mineMatches(a, today));
    let body;
    if (!all.length) body = `<div class="wp-empty"><i class="bx bx-task" aria-hidden="true"></i><h3>${esc(t('main.wpMineEmptyTitle'))}</h3></div>`;
    else if (!shown.length) body = `<p class="wp-none">${esc(t(mineQuery.trim() ? 'main.wpNoMatches' : 'main.wpMineNone'))}</p>`;
    else {
        const parts = MINE_GROUPS.map(([key, label]) => {
            let list = shown.filter((a) => groupOf(a) === key);
            if (key === 'done') list = list.slice().sort((a, b) => (a.endDate && b.endDate ? (a.endDate < b.endDate ? 1 : a.endDate > b.endDate ? -1 : 0) : 0));
            if (!list.length) return '';
            const heading = mineFilter === 'done' ? '' : `<h4 class="wp-group">${esc(t(label))} · ${list.length}</h4>`;
            return `${heading}<div class="wp-mine-list">${list.map((a) => mineRow(a, today)).join('')}</div>`;
        });
        body = parts.join('') + (mine.truncated ? `<p class="wp-none">${esc(t('main.wpMineTruncated', { n: all.length }))}</p>` : '');
    }
    const existing = root.querySelector('#wp-mine-body');
    if (partial && existing && root.dataset.view === 'mine') { existing.innerHTML = body; root.querySelector('.wp-mine-filters').outerHTML = filters; root.querySelector('.wp-mine-roles').outerHTML = roles; return; }
    root.dataset.view = 'mine';
    root.innerHTML = `<div class="wp-toolbar">${filters}<div class="wp-toolbar-r">${roles}${search}</div></div><div id="wp-mine-body">${body}</div>`;
}
// ---- Mi equipo (pieza 3b) ----------------------------------------------------------------------------------------------------------------------------
// Las personas a mi cargo (por el organigrama) y lo que les toca (responsable o quien ejecuta), SOLO en los planes que yo puedo ver (los míos, los que me compartieron y los de mi equipo con el interruptor encendido); solo lectura.
// La pestaña solo sale si tengo gente a mi cargo. Cada persona con su resumen (por hacer · vencidas · hechas) y sus actividades.
function teamMatches(a) {
    if (teamPerson !== 'all' && String(a.person.userId) !== String(teamPerson)) return false;
    if (teamQuery.trim() && !SearchSyntax.matches('contains', teamQuery, `${a.title} ${a.planTitle} ${a.person.name} ${a.path.join(' ')}`)) return false;
    if (teamFilter === 'open') return a.status !== 'done';
    if (teamFilter === 'late') return dueInfo(a, todayYmd()).group === 'late';
    if (teamFilter === 'done') return a.status === 'done';
    return true;
}
function renderTeam(partial) {
    const root = $('wp-root');
    const today = todayYmd();
    const all = team.activities;
    const counts = { open: all.filter((a) => a.status !== 'done').length, late: all.filter((a) => dueInfo(a, today).group === 'late').length, done: all.filter((a) => a.status === 'done').length, all: all.length };
    const pill = (key, label) => `<button type="button" class="wp-pill${teamFilter === key ? ' active' : ''}" data-wp-team-filter="${key}" aria-pressed="${teamFilter === key}">${esc(t(label))} · ${counts[key]}</button>`;
    const filters = `<div class="wp-filters wp-team-filters" role="group" aria-label="${esc(t('main.wpMineFilterName'))}" data-help-key="wpMineFilter">${[['open', 'main.wpMineFilterOpen'], ['late', 'main.wpMineFilterLate'], ['done', 'main.wpMineFilterDone'], ['all', 'main.wpMineFilterAll']].map(([k, l]) => pill(k, l)).join('')}</div>`;
    const options = `<option value="all">${esc(t('main.wpTeamPersonAll'))}</option>${team.members.map((m) => `<option value="${m.userId}"${String(teamPerson) === String(m.userId) ? ' selected' : ''}>${esc(m.name)}${m.open ? ` · ${m.open}` : ''}</option>`).join('')}`;
    const person = `<select id="wp-team-person" class="wp-team-person" aria-label="${esc(t('main.wpTeamPersonName'))}" data-help-key="wpTeamPerson">${options}</select>`;
    const search = `<div class="wp-search" data-help-key="wpSearch"><i class="bx bx-search" aria-hidden="true"></i><input id="wp-team-search" type="search" value="${esc(teamQuery)}" placeholder="${esc(t('main.wpTeamSearchPlaceholder'))}" aria-label="${esc(t('main.wpTeamSearchPlaceholder'))}" autocomplete="off"></div>`;
    const shown = all.filter(teamMatches);
    let body;
    if (!all.length) body = `<div class="wp-empty"><i class="bx bx-group" aria-hidden="true"></i><h3>${esc(t('main.wpTeamEmptyTitle'))}</h3></div>`;
    else if (!shown.length) body = `<p class="wp-none">${esc(t(teamQuery.trim() ? 'main.wpNoMatches' : 'main.wpMineNone'))}</p>`;
    else {
        body = team.members.map((m) => {
            const list = shown.filter((a) => a.person.userId === m.userId);
            if (!list.length) return '';
            const summary = t('main.wpTeamCounts', { open: m.open, late: m.late, done: m.done });
            return `<h4 class="wp-group wp-team-head"><span class="wp-avatar wp-avatar-sm" aria-hidden="true">${esc(initials(m.name))}</span><span>${esc(m.name)}</span><small class="${m.late ? 'wp-team-late' : ''}">${esc(summary)}</small></h4><div class="wp-mine-list">${list.map((a) => mineRow(a, today, 'wpTeamRow')).join('')}</div>`;
        }).join('') + (team.truncated ? `<p class="wp-none">${esc(t('main.wpMineTruncated', { n: all.length }))}</p>` : '');
    }
    const existing = root.querySelector('#wp-team-body');
    if (partial && existing && root.dataset.view === 'team') { existing.innerHTML = body; root.querySelector('.wp-team-filters').outerHTML = filters; return; }
    root.dataset.view = 'team';
    root.innerHTML = `<div class="wp-toolbar">${filters}<div class="wp-toolbar-r">${person}${search}</div></div><div id="wp-team-body">${body}</div>`;
}

// abrir la actividad en su plan (con su conversación) o cambiar el estado de una hoja desde esta lista
async function mineAction(el) {
    const planId = Number(el.dataset.plan);
    const itemId = Number(el.dataset.id);
    if (el.dataset.wpMine === 'open') {
        try { if (!cache.has(planId)) await loadPlan(planId); } catch (err) { failed(err, planId); return; }
        activate(planId);
        const data = cache.get(planId);
        if (data && data.items.some((i) => i.id === itemId)) openItemDetail(planId, itemId);
        return;
    }
    try {
        await api('PATCH', `/${planId}/items/${itemId}`, { status: el.dataset.status });
        cache.delete(planId);
        await Promise.all([loadList(), loadMine()]);
        render();
    } catch (err) { failed(err, planId); }
}

// ---- acciones del plan --------------------------------------------------------------------------------------------------------------------------------
const currentPlanId = () => (isPlanTab(tabs.active) ? tabs.active : null);
async function planWrite(id, op) {
    try { await op(); await loadPlan(id); render(); return true; } catch (err) { failed(err, id); return false; }
}
async function togglePin(id) {
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;
    try {
        await api('PATCH', `/${id}`, { pinned: !plan.pinned });
        await loadList();
        if (cache.has(id)) await loadPlan(id);
        render();
    } catch (err) { failed(err, id); }
}
async function simpleState(id, status, confirmKey, toastKey) {
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;
    if (!(await Dashboard.confirm(t(confirmKey, { title: plan.title })))) return;
    if (await planWrite(id, () => api('PATCH', `/${id}`, { status }))) Dashboard.showToast(t(toastKey), 'success');
}
// Cancelar es definitivo y pide el motivo (queda en el historial y a la vista en el plan)
function openCancelModal(planId) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    overlay.innerHTML = `<div class="modal-panel exp-panel wp-modal" role="dialog" aria-modal="true" aria-label="${esc(t('main.wpCancelTitle', { title: plan.title }))}" data-help-key="wpCancel"><h3>${esc(t('main.wpCancelTitle', { title: plan.title }))}</h3>
        <p class="admin-hint">${esc(t('main.wpCancelHint'))}</p>
        <div class="admin-field"><label for="wp-c-reason">${esc(t('main.wpCancelReason'))}</label><textarea id="wp-c-reason" rows="3" maxlength="500"></textarea></div>
        <p class="admin-error" id="wp-c-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn wp-danger-btn" data-wp-c="ok">${esc(t('main.wpCancelConfirmBtn'))}</button><button type="button" class="btn btn-secondary" data-wp-c="back">${esc(t('main.wpCancelBack'))}</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    setTimeout(() => overlay.querySelector('#wp-c-reason').focus(), 0);
    overlay.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-wp-c]');
        if (!btn) return;
        if (btn.dataset.wpC === 'back') { close(); return; }
        const reason = overlay.querySelector('#wp-c-reason').value.trim();
        const errorEl = overlay.querySelector('#wp-c-error');
        if (!reason) { errorEl.textContent = t('main.wpErr_WORK_PLAN_REASON_REQUIRED'); errorEl.hidden = false; return; }
        btn.disabled = true;
        try {
            await api('PATCH', `/${planId}`, { status: 'cancelled', reason });
            close();
            await loadList();
            await loadPlan(planId);
            Dashboard.showToast(t('main.wpCancelledToast'), 'success');
            render();
        } catch (err) {
            errorEl.textContent = errText(err);
            errorEl.hidden = false;
            btn.disabled = false;
            if (err && err.body && STALE_CODES.includes(err.body.code)) { close(); failed(err, planId); }
        }
    });
}
// Eliminar solo existe para un plan VACÍO (sin ningún renglón); el servidor lo vuelve a revisar
async function deleteEmptyPlan(id) {
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;
    if (!(await Dashboard.confirm(t('main.wpDeleteConfirm', { title: plan.title })))) return;
    try {
        await api('DELETE', `/${id}`);
        cache.delete(id);
        Dashboard.showToast(t('main.wpDeletedToast'), 'success');
        await loadList();
        closeTab(id);
    } catch (err) { failed(err, id); }
}
async function setStatus(id, status) {
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;
    const key = status === 'closed' ? 'main.wpCloseConfirm' : 'main.wpReopenConfirm';
    if (!(await Dashboard.confirm(t(key, { title: plan.title })))) return;
    if (await planWrite(id, () => api('PATCH', `/${id}`, { status }))) Dashboard.showToast(t(status === 'closed' ? 'main.wpClosedToast' : 'main.wpReopenedToast'), 'success');
}
// ---- renglones ---------------------------------------------------------------------------------------------------------------------------------------
function openForm(mode, planId, options) {
    const data = cache.get(planId);
    if (!data) return;
    const item = options.id ? data.items.find((i) => i.id === options.id) : null;
    const depth = mode === 'edit' ? item.depth : (options.parentId ? data.items.find((i) => i.id === options.parentId).depth + 1 : 1);
    if (options.parentId) setCollapsed(planId, options.parentId, false);
    form = {
        mode, planId, parentId: mode === 'edit' ? item.parentId : (options.parentId || null), id: item ? item.id : null, depth,
        values: { title: item ? item.title : '', responsible: item ? item.responsibleName : '', executor: item ? (item.executorName || '') : '', startDate: item ? (item.startDate || '') : '', endDate: item ? (item.endDate || '') : '', note: item ? (item.note || '') : '' },
        error: '', busy: false, focused: false,
    };
    render();
}
function localProblem(f) {
    if (!f.title.trim()) return 'TITLE';
    if ((f.startDate && !f.endDate) || (!f.startDate && f.endDate)) return 'DATES';
    if (f.startDate && f.endDate < f.startDate) return 'RANGE';
    return '';
}
function showFormError(text) {
    form.error = text;
    const el = $('wp-root').querySelector('.wp-form-error');
    if (el) { el.textContent = text; el.hidden = !text; }
    const submit = $('wp-root').querySelector('[data-wp-form] button[type="submit"]');
    if (submit) submit.disabled = false;
}
async function submitForm(formEl) {
    if (!form || form.busy) return;
    const planId = form.planId;
    const data = cache.get(planId);
    const f = { title: formEl.elements.title.value, responsible: formEl.elements.responsible.value, executor: formEl.elements.executor.value, startDate: formEl.elements.startDate.value, endDate: formEl.elements.endDate.value, note: formEl.elements.note.value };
    form.values = { ...f };
    const problem = localProblem(f);
    if (problem) { showFormError(t(`main.wpFormErr_${problem}`)); return; }
    // un nombre de la lista de la compañía queda ligado a esa persona; cualquier otro texto queda como responsable libre
    const person = (data.people || []).find((p) => fold(p.name) === fold(f.responsible));
    const doer = (data.people || []).find((p) => fold(p.name) === fold(f.executor));
    const body = { title: f.title.trim(), responsibleUserId: person ? person.id : null, responsibleName: person ? '' : f.responsible.trim(), executorUserId: doer ? doer.id : null, executorName: doer ? '' : f.executor.trim(), startDate: f.startDate || null, endDate: f.endDate || null, note: f.note.trim() };
    form.busy = true;
    form.error = '';
    const submit = formEl.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
        if (form.mode === 'edit') await api('PATCH', `/${planId}/items/${form.id}`, body);
        else await api('POST', `/${planId}/items`, { ...body, parentId: form.parentId });
        form = null;
        await loadPlan(planId);
        Dashboard.showToast(t('main.wpSaved'), 'success');
        render();
    } catch (err) {
        if (form) form.busy = false;
        if (err && err.body && STALE_CODES.includes(err.body.code)) failed(err, planId);
        else if (form) showFormError(errText(err));
        else Dashboard.showToast(errText(err), 'error');
    }
}
async function rowAction(op, itemId, button) {
    const planId = currentPlanId();
    const data = planId && cache.get(planId);
    if (!data) return;
    const item = data.items.find((i) => i.id === itemId);
    if (!item) return;
    if (op === 'comments') { openItemDetail(planId, itemId); return; }
    if (op === 'edit') { openForm('edit', planId, { id: itemId }); return; }
    if (op === 'add-child') { openForm('add', planId, { parentId: itemId }); return; }
    if (op === 'status') { await planWrite(planId, () => api('PATCH', `/${planId}/items/${itemId}`, { status: button.dataset.status })); return; }
    if (op === 'up' || op === 'down') { await planWrite(planId, () => api('POST', `/${planId}/items/${itemId}/move`, { direction: op })); return; }
    if (op === 'remove') {
        const key = item.childCount ? 'main.wpRemoveConfirmBranch' : 'main.wpRemoveConfirm';
        if (!(await Dashboard.confirm(t(key, { title: item.title, n: item.childCount })))) return;
        if (form && form.id === itemId) form = null;
        if (await planWrite(planId, () => api('DELETE', `/${planId}/items/${itemId}`))) Dashboard.showToast(t('main.wpItemRemoved'), 'success');
    }
}

// ---- crear o editar un plan (nombre, descripción y niveles) -------------------------------------------------------------------------------------------
const MAX_LEVELS = 50; // tope técnico (el mismo del servidor); en la práctica no hay límite
const DEFAULT_LEVELS = () => [1, 2, 3, 4, 5].map((n) => t(`main.wpLevelDefaultName_${n}`));
function openPlanModal(planId) {
    const data = planId ? cache.get(planId) : null;
    const plan = data ? data.plan : null;
    const usedDepth = data ? data.items.reduce((m, i) => Math.max(m, i.depth), 0) : 0;
    let names = plan ? [...plan.levelNames] : DEFAULT_LEVELS();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    const levelsHtml = () => names.map((name, i) => `<div class="wp-lvl-row"><span class="wp-lvl-n">${i + 1}</span><input type="text" name="level" maxlength="30" value="${esc(name)}" aria-label="${esc(t('main.wpLevelField', { n: i + 1 }))}" autocomplete="off"></div>`).join('');
    const drawLevels = () => {
        overlay.querySelector('#wp-m-levels').innerHTML = levelsHtml();
        overlay.querySelector('[data-wp-m="add-level"]').disabled = names.length >= MAX_LEVELS;
        overlay.querySelector('[data-wp-m="del-level"]').disabled = names.length <= 1 || names.length <= usedDepth;
    };
    overlay.innerHTML = `<div class="modal-panel exp-panel wp-modal" role="dialog" aria-modal="true" aria-labelledby="wp-m-title" aria-label="${esc(t(plan ? 'main.wpModalEdit' : 'main.wpModalNew'))}" data-help-key="wpPlanForm"><h3 id="wp-m-title">${esc(t(plan ? 'main.wpModalEdit' : 'main.wpModalNew'))}</h3>
        <div class="admin-field"><label for="wp-m-name">${esc(t('main.wpFieldPlanTitle'))}</label><input id="wp-m-name" type="text" maxlength="120" autocomplete="off" value="${esc(plan ? plan.title : '')}"></div>
        <div class="admin-field"><label for="wp-m-desc">${esc(t('main.wpFieldPlanDesc'))}</label><textarea id="wp-m-desc" rows="2" maxlength="500">${esc(plan ? (plan.description || '') : '')}</textarea></div>
        <fieldset class="wp-lvl-set"><legend>${esc(t('main.wpLevelsLegend'))}</legend><p class="admin-hint">${esc(t('main.wpLevelsHint'))}</p><div id="wp-m-levels"></div>
            <div class="admin-form-actions"><button type="button" class="btn btn-secondary wp-small" data-wp-m="add-level">${esc(t('main.wpAddLevel'))}</button><button type="button" class="btn btn-secondary wp-small" data-wp-m="del-level">${esc(t('main.wpRemoveLevel'))}</button></div></fieldset>
        <p class="admin-error" id="wp-m-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-wp-m="save">${esc(t('main.wpSave'))}</button><button type="button" class="btn btn-secondary" data-wp-m="cancel">${esc(t('main.wpCancel'))}</button></div></div>`;
    document.body.appendChild(overlay);
    drawLevels();
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    setTimeout(() => overlay.querySelector('#wp-m-name').focus(), 0);
    const readNames = () => [...overlay.querySelectorAll('input[name="level"]')].map((el) => el.value.trim());
    overlay.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-wp-m]');
        if (!btn) return;
        const op = btn.dataset.wpM;
        if (op === 'cancel') { close(); return; }
        if (op === 'add-level') { names = readNames(); names.push(t('main.wpLevelDefault', { n: names.length + 1 })); drawLevels(); return; }
        if (op === 'del-level') { names = readNames(); names.pop(); drawLevels(); return; }
        if (op !== 'save') return;
        const errorEl = overlay.querySelector('#wp-m-error');
        const title = overlay.querySelector('#wp-m-name').value.trim();
        const description = overlay.querySelector('#wp-m-desc').value.trim();
        const levelNames = readNames();
        if (!title) { errorEl.textContent = t('main.wpErr_WORK_PLAN_TITLE_REQUIRED'); errorEl.hidden = false; return; }
        if (levelNames.some((n) => !n)) { errorEl.textContent = t('main.wpErr_WORK_PLAN_LEVELS_INVALID'); errorEl.hidden = false; return; }
        btn.disabled = true;
        try {
            if (plan) {
                await api('PATCH', `/${plan.id}`, { title, description, levelNames });
                await loadList();
                await loadPlan(plan.id);
                close();
                Dashboard.showToast(t('main.wpSaved'), 'success');
                render();
            } else {
                const out = await api('POST', '', { title, description, levelNames });
                await loadList();
                close();
                Dashboard.showToast(t('main.wpCreatedToast'), 'success');
                activate(out.plan.id);
            }
        } catch (err) {
            errorEl.textContent = errText(err);
            errorEl.hidden = false;
            btn.disabled = false;
        }
    });
}

// ---- detalle de un renglón y sus comentarios (hilos genéricos: Threads.js) ------------------------------------------------------------------------------
// El detalle junta lo del renglón (nivel, estado, fechas, quién responde y quién ejecuta, nota) con su conversación. Los comentarios no se editan ni se borran. Al cerrarlo se vuelven a leer los contadores del plan.
function openThreadModal(planId, { type, id, title, factsHtml, helpKey }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    overlay.innerHTML = `<div class="modal-panel exp-panel wp-modal wp-detail" role="dialog" aria-modal="true" aria-label="${esc(title)}" data-help-key="${helpKey}">
        <div class="wp-detail-head"><h3>${esc(title)}</h3><button type="button" class="admin-icon-btn" data-wp-d="close" aria-label="${esc(t('main.wpDetailClose'))}" title="${esc(t('main.wpDetailClose'))}"><i class="bx bx-x" aria-hidden="true"></i></button></div>
        ${factsHtml || ''}<h4 class="wp-group">${esc(t('main.thrTitle'))}</h4><div class="wp-detail-thread"></div></div>`;
    document.body.appendChild(overlay);
    let dirty = false;
    const controller = Threads.mount(overlay.querySelector('.wp-detail-thread'), { type, id, onChange: () => { dirty = true; } });
    const close = async () => {
        controller.destroy();
        overlay.remove();
        document.removeEventListener('keydown', onKey);
        if (!dirty) return;
        try { await loadList(); if (cache.has(planId)) await loadPlan(planId); render(); } catch (err) { /* los contadores se arreglan en la próxima lectura */ }
    };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener('click', (event) => { if (event.target.closest('[data-wp-d="close"]')) close(); });
    setTimeout(() => { const input = overlay.querySelector('textarea'); if (input) input.focus(); }, 400);
}
function openItemDetail(planId, itemId) {
    const data = cache.get(planId);
    const item = data && data.items.find((i) => i.id === itemId);
    if (!item) return;
    const status = statusOf(item);
    const dates = item.rangeStart ? `${shortDate(item.rangeStart)} – ${shortDate(item.rangeEnd)}` : t('main.wpNoDates');
    const facts = `<div class="wp-detail-facts"><span class="wp-lvl-tag">${esc(levelLabel(data.plan, item.depth))}</span><span class="exp-chip exp-chip-${TONE[status] || 'cancelled'}">${esc(statusText(status))}</span><span class="impl-dates">${esc(dates)}</span>${whoCell(item)}</div>${item.note ? `<p class="wp-detail-note"><i class="bx bx-note" aria-hidden="true"></i> ${esc(item.note)}</p>` : ''}`;
    openThreadModal(planId, { type: 'work-plan-item', id: itemId, title: item.title, factsHtml: facts, helpKey: 'wpItemDetail' });
}
function openPlanThread(planId) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    openThreadModal(planId, { type: 'work-plan', id: planId, title: t('main.wpPlanCommentsTitle', { title: plan.title }), factsHtml: '', helpKey: 'wpPlanComments' });
}

// ---- compartir un plan y quitarlo de mi lista ----------------------------------------------------------------------------------------------------------
// Quien puede compartir (el dueño y quien tiene el rol Administrar) agrega personas de la compañía con un rol (Ver, Colaborar o Administrar), cambia roles y quita personas; el dueño además enciende que su jefe directo lo vea.
// El resto ve quién lo tiene, sin poder cambiar nada. Cada cambio se guarda al momento (no hay botón de guardar) y el servidor decide quién puede qué.
const ROLES = ['view', 'collaborate', 'admin'];
function openShareModal(planId) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    document.body.appendChild(overlay);
    let busy = false;
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    const roleSelect = (name, value, label) => `<select name="${name}" aria-label="${esc(label)}">${ROLES.map((r) => `<option value="${r}"${r === value ? ' selected' : ''}>${esc(roleText(r))}</option>`).join('')}</select>`;
    const paint = () => {
        const data = cache.get(planId);
        if (!data) { close(); return; }
        const { plan } = data;
        const canShare = !!(plan.can && plan.can.share) && isLive(plan);
        const members = plan.members || [];
        const known = new Map((data.people || []).map((p) => [p.id, p]));
        const taken = new Set([plan.ownerId, ...members.map((m) => m.userId)]);
        const free = (data.people || []).filter((p) => !taken.has(p.id));
        const ownerName = plan.ownerName || (plan.owner && plan.owner.name) || '—';
        const memberRows = members.map((m) => {
            const warn = known.get(m.userId) && known.get(m.userId).hasScreen === false ? `<span class="wp-chip wp-chip-warn" title="${esc(t('main.wpShareNoScreen'))}">${esc(t('main.wpShareNoScreen'))}</span>` : '';
            return `<div class="wp-share-row"><span class="wp-avatar wp-avatar-sm" aria-hidden="true">${esc(initials(m.name))}</span><div class="wp-share-who"><b>${esc(m.name)}</b>${warn}</div>
                <div class="wp-share-ctl">${canShare ? `${roleSelect('role', m.role, t('main.wpShareRoleOf', { name: m.name }))}<button type="button" class="admin-icon-btn admin-icon-btn-danger" data-wp-s="remove" data-user="${m.userId}" aria-label="${esc(t('main.wpShareRemove', { name: m.name }))}" title="${esc(t('main.wpShareRemove', { name: m.name }))}"><i class="bx bx-x" aria-hidden="true"></i></button>` : `<span class="wp-chip">${esc(roleText(m.role))}</span>`}</div></div>`;
        }).join('');
        const add = canShare ? `<div class="wp-share-add"><div class="admin-field"><label for="wp-s-name">${esc(t('main.wpShareAddLabel'))}</label><input id="wp-s-name" type="text" list="wp-s-people" autocomplete="off" placeholder="${esc(t('main.wpShareAddHint'))}"><datalist id="wp-s-people">${free.map((p) => `<option value="${esc(p.name)}"></option>`).join('')}</datalist></div>
            <div class="admin-field"><label for="wp-s-role">${esc(t('main.wpShareRoleLabel'))}</label><select id="wp-s-role">${ROLES.map((r) => `<option value="${r}">${esc(roleText(r))}</option>`).join('')}</select></div>
            <button type="button" class="btn" data-wp-s="add">${esc(t('main.wpShareAdd'))}</button></div><p class="admin-error" id="wp-s-error" role="alert" hidden></p>` : '';
        const boss = plan.isOwner !== false && originOf(plan) === 'own' && isLive(plan)
            ? `<label class="wp-switch"><input type="checkbox" data-wp-s="boss"${plan.bossCanView ? ' checked' : ''}><span class="wp-switch-track" aria-hidden="true"></span><span class="wp-switch-text"><b>${esc(t('main.wpShareBossTitle'))}</b><small>${esc(t('main.wpShareBossHint'))}</small></span></label>` : '';
        overlay.innerHTML = `<div class="modal-panel exp-panel wp-modal wp-share" role="dialog" aria-modal="true" aria-label="${esc(t(canShare ? 'main.wpShareTitle' : 'main.wpPeopleTitle', { title: plan.title }))}" data-help-key="wpShare">
            <h3>${esc(t(canShare ? 'main.wpShareTitle' : 'main.wpPeopleTitle', { title: plan.title }))}</h3>
            ${canShare ? `<p class="admin-hint">${esc(t('main.wpShareHint'))}</p>` : ''}
            ${add}
            <h4 class="wp-group">${esc(t('main.wpShareMembers'))}</h4>
            <div class="wp-share-list"><div class="wp-share-row"><span class="wp-avatar wp-avatar-sm" aria-hidden="true">${esc(initials(ownerName))}</span><div class="wp-share-who"><b>${esc(ownerName)}</b></div><div class="wp-share-ctl"><span class="wp-chip wp-chip-own">${esc(t('main.wpShareOwnerRow'))}</span></div></div>${memberRows}</div>
            ${members.length ? '' : `<p class="wp-none">${esc(t('main.wpShareNobody'))}</p>`}
            ${boss}
            <div class="admin-form-actions"><button type="button" class="btn" data-wp-s="done">${esc(t('main.wpShareDone'))}</button></div></div>`;
    };
    const showError = (text) => { const el = overlay.querySelector('#wp-s-error'); if (el) { el.textContent = text; el.hidden = !text; } };
    // el cambio se guarda, se vuelve a leer el plan y la lista, y se dibuja de nuevo el cuadro y la pantalla de atrás
    const apply = async (operation, toast) => {
        if (busy) return;
        busy = true;
        try {
            await operation();
            await loadList();
            await loadPlan(planId);
            paint();
            render();
            if (toast) Dashboard.showToast(toast, 'success');
        } catch (err) {
            if (err && err.body && STALE_CODES.includes(err.body.code)) { close(); failed(err, planId); } else showError(errText(err));
        } finally { busy = false; }
    };
    overlay.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-wp-s]');
        if (!btn || btn.dataset.wpS === 'boss') return;
        const op = btn.dataset.wpS;
        if (op === 'done') { close(); return; }
        const data = cache.get(planId);
        if (op === 'remove') {
            const userId = Number(btn.dataset.user);
            const member = ((data.plan.members) || []).find((m) => m.userId === userId);
            apply(() => api('DELETE', `/${planId}/members/${userId}`), t('main.wpShareRemoved', { name: member ? member.name : '' }));
        } else if (op === 'add') {
            const name = overlay.querySelector('#wp-s-name').value;
            const person = (data.people || []).find((p) => fold(p.name) === fold(name));
            if (!person) { showError(t('main.wpShareNobodyPick')); return; }
            const role = overlay.querySelector('#wp-s-role').value;
            apply(() => api('POST', `/${planId}/members`, { userId: person.id, role }), t('main.wpShareAdded', { name: person.name }));
        }
    });
    overlay.addEventListener('change', (event) => {
        const el = event.target;
        if (el.matches('[data-wp-s="boss"]')) { apply(() => api('PATCH', `/${planId}`, { bossCanView: el.checked }), t(el.checked ? 'main.wpShareBossOn' : 'main.wpShareBossOff')); return; }
        const row = el.closest('.wp-share-row');
        if (el.name === 'role' && row) {
            const userId = Number(row.querySelector('[data-wp-s="remove"]').dataset.user);
            apply(() => api('PATCH', `/${planId}/members/${userId}`, { role: el.value }), t('main.wpShareRoleChanged'));
        }
    });
    paint();
    setTimeout(() => { const el = overlay.querySelector('#wp-s-name') || overlay.querySelector('[data-wp-s="done"]'); if (el) el.focus(); }, 0);
}
async function leavePlan(id) {
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;
    if (!(await Dashboard.confirm(t('main.wpLeaveConfirm', { title: plan.title })))) return;
    try {
        await api('POST', `/${id}/leave`);
        cache.delete(id);
        Dashboard.showToast(t('main.wpLeftToast'), 'success');
        await loadList();
        closeTab(id);
    } catch (err) { failed(err, id); }
}

// ---- enlace directo ---------------------------------------------------------------------------------------------------------------------------------
// PlanesTrabajo.html#plan=12&item=34 abre ese plan y, si trae item, el detalle de ese renglón con su conversación (así llega Mensajes). Si el plan ya no es visible para quien lo abre, se queda en la lista.
async function openFromHash() {
    const found = /plan=(\d+)(?:&item=(\d+))?/.exec(location.hash || '');
    if (!found) return;
    const planId = Number(found[1]);
    const itemId = found[2] ? Number(found[2]) : 0;
    try { history.replaceState(null, '', `${location.pathname}${location.search}`); } catch (err) { /* sin historial: el enlace se queda en la barra */ }
    try { await loadPlan(planId); } catch (err) { failed(err, planId); return; }
    activate(planId);
    if (itemId && cache.get(planId) && cache.get(planId).items.some((i) => i.id === itemId)) openItemDetail(planId, itemId);
}
window.addEventListener('hashchange', () => { openFromHash().catch(() => {}); });

// ---- eventos ------------------------------------------------------------------------------------------------------------------------------------------
document.addEventListener('click', (event) => {
    const el = event.target;
    const closeBtn = el.closest('[data-wp-close]');
    if (closeBtn) { closeTab(Number(closeBtn.dataset.wpClose)); return; }
    const tab = el.closest('[data-wp-tab]');
    if (tab && $('wp-tabs').contains(tab)) { const id = tab.dataset.wpTab; activate(id === 'list' || id === 'mine' || id === 'team' ? id : Number(id)); return; }
    if (el.closest('[data-wp-new]')) { openPlanModal(null); return; }
    const mineFilterBtn = el.closest('[data-wp-mine-filter]');
    if (mineFilterBtn) { mineFilter = mineFilterBtn.dataset.wpMineFilter; renderMine(true); return; }
    const mineRoleBtn = el.closest('[data-wp-mine-role]');
    if (mineRoleBtn) { mineRole = mineRoleBtn.dataset.wpMineRole; renderMine(true); return; }
    const teamFilterBtn = el.closest('[data-wp-team-filter]');
    if (teamFilterBtn) { teamFilter = teamFilterBtn.dataset.wpTeamFilter; renderTeam(true); return; }
    const mineBtn = el.closest('[data-wp-mine]');
    if (mineBtn) { mineAction(mineBtn); return; }
    const pin = el.closest('[data-wp-pin]');
    if (pin) { togglePin(Number(pin.dataset.wpPin)); return; }
    const open = el.closest('[data-wp-open]');
    if (open) { activate(Number(open.dataset.wpOpen)); return; }
    const filter = el.closest('[data-wp-filter]');
    if (filter) { listFilter = filter.dataset.wpFilter; renderList(true); return; }
    const toggle = el.closest('[data-wp-toggle]');
    if (toggle) {
        const planId = currentPlanId();
        const id = Number(toggle.dataset.wpToggle);
        if (!planId) return;
        setCollapsed(planId, id, !isCollapsed(planId, id));
        renderPlan(planId);
        const again = $('wp-root').querySelector(`[data-wp-toggle="${id}"]`);
        if (again) again.focus();
        return;
    }
    const row = el.closest('[data-wp-row]');
    if (row) { rowAction(row.dataset.wpRow, Number(row.dataset.id), row); return; }
    const act = el.closest('[data-wp-act]');
    if (!act) return;
    const planId = currentPlanId();
    const op = act.dataset.wpAct;
    if (op === 'cancel-form') { form = null; renderPlan(planId); return; }
    if (op === 'add-root' && planId) { openForm('add', planId, { parentId: null }); return; }
    if (!planId) return;
    if (op === 'pin') togglePin(planId);
    else if (op === 'edit-plan') openPlanModal(planId);
    else if (op === 'close') setStatus(planId, 'closed');
    else if (op === 'reopen') setStatus(planId, 'active');
    else if (op === 'inactivate') simpleState(planId, 'inactive', 'main.wpInactivateConfirm', 'main.wpInactivatedToast');
    else if (op === 'reactivate') simpleState(planId, 'active', 'main.wpReactivateConfirm', 'main.wpReactivatedToast');
    else if (op === 'cancel') openCancelModal(planId);
    else if (op === 'delete') deleteEmptyPlan(planId);
    else if (op === 'history') Dashboard.openChangeHistory('work_plans', planId);
    else if (op === 'comments') openPlanThread(planId);
    else if (op === 'share' || op === 'people') openShareModal(planId);
    else if (op === 'leave') leavePlan(planId);
});
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const mineTitle = event.target.closest && event.target.closest('.wp-mine-title[data-wp-mine]');
    if (mineTitle && event.target === mineTitle) { event.preventDefault(); mineAction(mineTitle); return; }
    const title = event.target.closest && event.target.closest('.wp-title[data-wp-row]');
    if (title && event.target === title) { event.preventDefault(); rowAction('comments', Number(title.dataset.id), title); return; }
    const tab = event.target.closest && event.target.closest('.wp-tab[data-wp-tab]');
    if (tab && event.target === tab) { event.preventDefault(); const id = tab.dataset.wpTab; activate(id === 'list' || id === 'mine' || id === 'team' ? id : Number(id)); }
});
document.addEventListener('input', (event) => {
    const input = event.target;
    if (input.id === 'wp-search') { listQuery = input.value; renderList(true); return; }
    if (input.id === 'wp-mine-search') { mineQuery = input.value; renderMine(true); return; }
    if (input.id === 'wp-team-search') { teamQuery = input.value; renderTeam(true); return; }
    if (form && input.name && input.closest('[data-wp-form]')) form.values[input.name] = input.value;
});
document.addEventListener('change', (event) => {
    if (event.target.id === 'wp-team-person') { teamPerson = event.target.value; renderTeam(true); }
});
document.addEventListener('submit', (event) => {
    const formEl = event.target.closest('[data-wp-form]');
    if (!formEl) return;
    event.preventDefault();
    submitForm(formEl);
});
document.addEventListener('dashboard:language-changed', () => { if (plans.length || $('wp-root').dataset.view) render(); });
// al volver a la pestaña del navegador se vuelve a leer lo que se ve (menos con un formulario abierto, para no borrarlo)
document.addEventListener('visibilitychange', () => { if (!document.hidden && !form && $('wp-root').dataset.view) refreshQuietly().catch(() => {}); });

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        const saved = readJson(TABS_KEY, { open: [], active: 'list' });
        tabs = { open: Array.isArray(saved.open) ? saved.open.filter((id) => Number.isInteger(id)) : [], active: saved.active };
        try { await loadList(); await Promise.all([loadMine().catch((err) => console.error('Mis actividades:', err)), loadTeam().catch((err) => console.error('Mi equipo:', err))]); } catch (err) { $('wp-error').textContent = t('main.wpLoadError'); $('wp-error').hidden = false; console.error('Planes de trabajo: failed to load', err); return; }
        tabs.open = tabs.open.filter((id) => plans.some((p) => p.id === id));
        if (tabs.active !== 'mine' && tabs.active !== 'team' && !isPlanTab(tabs.active)) tabs.active = 'list';
        if (tabs.active === 'team' && !team.members.length) tabs.active = 'list';
        if (isPlanTab(tabs.active) && !tabs.open.includes(tabs.active)) tabs.active = 'list';
        saveTabs();
        if (isPlanTab(tabs.active)) { try { await loadPlan(tabs.active); } catch (err) { tabs.active = 'list'; } }
        render();
        openFromHash().catch(() => {});
        // si un nombre no cabe en su pestaña se abrevia (y al sobreponer sale completo): ver Dashboard.watchLabelFit
        Dashboard.watchLabelFit($('wp-tabs'), '.wp-tab-nm');
    } catch (err) {
        console.error('Planes de trabajo failed to initialize:', err);
    }
})();
})();
