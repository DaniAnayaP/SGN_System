// ---------------------------------------------------------------------------
// Planes de trabajo (pieza 1): cada persona arma sus propios planes con el estilo del Cronograma de Implementación. El plan es un árbol de renglones cuyos NIVELES nombra quien lo arma (hasta 4, por ejemplo Fase › Actividad ›
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
let tabs = { open: [], active: 'list' };
let listFilter = 'active';      // 'active' | 'closed'
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
const STALE_CODES = ['WORK_PLAN_NOT_FOUND', 'WORK_PLAN_ITEM_NOT_FOUND', 'WORK_PLAN_CLOSED', 'WORK_PLAN_FORBIDDEN'];
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
async function loadPlan(id) {
    const out = await api('GET', `/${id}`);
    cache.set(id, out);
    const at = plans.findIndex((p) => p.id === id);
    if (at >= 0) plans[at] = out.plan; else plans.push(out.plan);
    return out;
}
// Vuelve a leer la lista y, si hay uno abierto, ese plan (un plan que ya no existe se quita de las pestañas).
async function refreshAll(planId, quiet) {
    await loadList();
    tabs.open = tabs.open.filter((id) => plans.some((p) => p.id === id));
    if (tabs.active !== 'list' && !tabs.open.includes(tabs.active)) tabs.active = 'list';
    saveTabs();
    cache.forEach((_, id) => { if (!plans.some((p) => p.id === id)) cache.delete(id); });
    const target = planId && tabs.open.includes(planId) ? planId : (tabs.active !== 'list' ? tabs.active : null);
    if (target) { try { await loadPlan(target); } catch (err) { /* se quita abajo */ } }
    if (!quiet) render();
}
// Al volver a la pestaña del navegador: se vuelve a leer y solo se redibuja si algo cambió (así no se pierde el foco ni lo que se estaba escribiendo).
async function refreshQuietly() {
    const target = currentPlanId();
    const signature = () => JSON.stringify([plans, target ? cache.get(target) : null, tabs]);
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
    let html = `<div class="wp-tab wp-tab-list${listActive ? ' active' : ''}" role="tab" tabindex="0" aria-selected="${listActive}" data-wp-tab="list" data-help-key="wpTabs"><i class="bx bx-list-ul" aria-hidden="true"></i><span class="wp-tab-nm">${esc(t('main.wpTabAll'))}</span><span class="wp-count">${plans.filter((p) => p.status !== 'closed').length}</span></div>`;
    tabs.open.forEach((id) => {
        const p = plans.find((x) => x.id === id);
        if (!p) return;
        const active = tabs.active === id;
        html += `<div class="wp-tab${active ? ' active' : ''}${p.status === 'closed' ? ' wp-tab-closed' : ''}" role="tab" tabindex="0" aria-selected="${active}" data-wp-tab="${id}" title="${esc(planName(p))}"><span class="wp-dot wp-dot-${p.status === 'closed' ? 'closed' : 'own'}" aria-hidden="true"></span><span class="wp-tab-nm">${esc(planName(p))}</span><button type="button" class="wp-tab-x" data-wp-close="${id}" aria-label="${esc(t('main.wpTabClose', { name: planName(p) }))}" title="${esc(t('main.wpTabClose', { name: planName(p) }))}"><i class="bx bx-x" aria-hidden="true"></i></button></div>`;
    });
    if (canCreate) html += `<button type="button" class="wp-tab wp-tab-add" data-wp-new="1" data-help-key="wpNew"><i class="bx bx-plus" aria-hidden="true"></i><span class="wp-tab-nm">${esc(t('main.wpNew'))}</span></button>`;
    el.innerHTML = html;
}
function activate(id) {
    form = null;
    tabs.active = id;
    if (id !== 'list' && !tabs.open.includes(id)) tabs.open.push(id);
    saveTabs();
    render();
    if (id !== 'list' && !cache.has(id)) {
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
    if (tabs.active !== 'list' && !cache.has(tabs.active)) activate(tabs.active);
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
function card(p, today) {
    const due = dueText(p, today);
    const closed = p.status === 'closed';
    const chips = [`<span class="wp-chip wp-chip-own">${esc(t('main.wpOriginOwn'))}</span>`, `<span class="wp-chip">${esc(t('main.wpPrivate'))}</span>`];
    if (closed) chips.push(`<span class="wp-chip wp-chip-closed">${esc(t('main.wpClosedChip'))}</span>`);
    return `<div class="wp-card${closed ? ' wp-card-closed' : ''}" data-wp-card="${p.id}" role="group" aria-label="${esc(planName(p))}" data-help-key="wpCard">
        <div class="wp-card-top"><span class="wp-avatar" aria-hidden="true">${esc(initials(p.title))}</span><div class="wp-card-title"><b>${esc(planName(p))}</b><small>${esc(weekText(p.startDate, p.endDate))}</small></div>
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
    const active = plans.filter((p) => p.status !== 'closed');
    const closed = plans.filter((p) => p.status === 'closed');
    const shown = (listFilter === 'closed' ? closed : active).filter((p) => planMatches(p, listQuery));
    const filters = `<div class="wp-filters" role="group" data-help-key="wpFilter"><button type="button" class="wp-pill${listFilter === 'active' ? ' active' : ''}" data-wp-filter="active" aria-pressed="${listFilter === 'active'}">${esc(t('main.wpFilterActive'))} · ${active.length}</button><button type="button" class="wp-pill${listFilter === 'closed' ? ' active' : ''}" data-wp-filter="closed" aria-pressed="${listFilter === 'closed'}">${esc(t('main.wpFilterClosed'))} · ${closed.length}</button></div>`;
    const search = `<div class="wp-search" data-help-key="wpSearch"><i class="bx bx-search" aria-hidden="true"></i><input id="wp-search" type="search" value="${esc(listQuery)}" placeholder="${esc(t('main.wpSearchPlaceholder'))}" aria-label="${esc(t('main.wpSearchPlaceholder'))}" autocomplete="off"></div>`;
    const create = canCreate ? `<button type="button" class="btn" data-wp-new="1" data-help-key="wpNew"><i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.wpNew'))}</button>` : '';
    let body = '';
    if (!plans.length) {
        body = `<div class="wp-empty"><i class="bx bx-calendar-check" aria-hidden="true"></i><h3>${esc(t('main.wpEmptyTitle'))}</h3><p>${esc(t('main.wpEmptyText'))}</p>${create ? `<p>${create}</p>` : ''}</div>`;
    } else if (!shown.length) {
        body = `<p class="wp-none">${esc(t(listQuery.trim() ? 'main.wpNoMatches' : (listFilter === 'closed' ? 'main.wpNoClosed' : 'main.wpNoActive')))}</p>`;
    } else {
        const pinned = shown.filter((p) => p.pinned);
        const rest = shown.filter((p) => !p.pinned);
        const group = (labelKey, list) => (list.length ? `<h4 class="wp-group">${esc(t(labelKey))}</h4><div class="wp-cards">${list.map((p) => card(p, today)).join('')}</div>` : '');
        body = group('main.wpGroupPinned', pinned) + (pinned.length ? group('main.wpGroupOwn', rest) : `<div class="wp-cards">${rest.map((p) => card(p, today)).join('')}</div>`);
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
    const chips = names.map((name, i) => `<span class="wp-lvl-chip wp-lvl-chip-${Math.min(i + 1, 4)}"><i>${i + 1}</i>${esc(name)}</span>`).join('<span class="wp-lvl-arrow" aria-hidden="true">›</span>');
    return `<div class="wp-levels" role="group" aria-label="${esc(t('main.wpLevelsOfPlan'))}" data-help-key="wpLevels"><b>${esc(t('main.wpLevelsOfPlan'))}</b>${chips}${canEdit ? `<button type="button" class="btn btn-secondary wp-small" data-wp-act="edit-plan">${esc(t('main.wpChangeNames'))}</button>` : ''}</div>`;
}
function planActions(plan, canEdit) {
    const closed = plan.status === 'closed';
    const btn = (op, icon, labelKey, extra) => `<button type="button" class="btn btn-secondary wp-small${extra ? ` ${extra}` : ''}" data-wp-act="${op}" data-help-key="${{ pin: 'wpPin', history: 'wpHistory', close: 'wpClose', reopen: 'wpClose', delete: 'wpDelete', 'edit-plan': 'wpEditPlan' }[op] || 'wpPlanActions'}"><i class="bx ${icon}" aria-hidden="true"></i> ${esc(t(labelKey))}</button>`;
    const out = [];
    if (canEdit) {
        out.push(btn('pin', plan.pinned ? 'bxs-star' : 'bx-star', plan.pinned ? 'main.wpUnpin' : 'main.wpPin'));
        if (!closed) out.push(btn('edit-plan', 'bx-edit-alt', 'main.wpEditPlan'));
        out.push(btn(closed ? 'reopen' : 'close', closed ? 'bx-lock-open-alt' : 'bx-lock-alt', closed ? 'main.wpReopen' : 'main.wpClosePlan'));
    }
    out.push(btn('history', 'bx-history', 'main.wpHistory'));
    if (canEdit) out.push(btn('delete', 'bx-trash', 'main.wpDeletePlan', 'wp-danger'));
    return `<div class="wp-actions">${out.join('')}</div>`;
}
// Los iconos de lo que se puede hacer con un renglón (según el plan esté abierto para escribir).
function rowButtons(plan, item) {
    const levels = (plan.levelNames || []).length;
    const btn = (op, icon, labelKey, extra) => `<button type="button" class="admin-icon-btn impl-act-btn${op === 'remove' ? ' admin-icon-btn-danger' : ''}" data-wp-row="${op}" data-id="${item.id}"${extra || ''} aria-label="${esc(t(labelKey))}" title="${esc(t(labelKey))}"><i class="bx ${icon}" aria-hidden="true"></i></button>`;
    const out = [];
    if (!item.childCount) {
        if (item.status === 'pending') out.push(btn('status', 'bx-play', 'main.wpMarkRunning', ' data-status="in_progress"'));
        if (item.status !== 'done') out.push(btn('status', 'bx-check', 'main.wpMarkDone', ' data-status="done"'));
        if (item.status !== 'pending') out.push(btn('status', 'bx-undo', 'main.wpMarkPending', ' data-status="pending"'));
    }
    if (item.depth < levels) out.push(btn('add-child', 'bx-subdirectory-right', 'main.wpAddChild', ` data-child-label="${esc(levelLabel(plan, item.depth + 1))}"`));
    out.push(btn('edit', 'bx-edit-alt', 'main.wpEditItem'));
    out.push(btn('up', 'bx-up-arrow-alt', 'main.wpMoveUp'));
    out.push(btn('down', 'bx-down-arrow-alt', 'main.wpMoveDown'));
    out.push(btn('remove', 'bx-trash', 'main.wpRemoveItem'));
    return `<span class="impl-act-btns" role="group" aria-label="${esc(t('main.wpNameActions'))}" data-help-key="wpItemActions">${out.join('')}</span>`;
}
const statusText = (status) => t(`main.wpStatus_${status}`);
const dot = (status) => `<span class="impl-dot impl-dot-${status === 'in_progress' ? 'running' : status}" role="img" aria-label="${esc(statusText(status))}" title="${esc(statusText(status))}"></span>`;
const TONE = { pending: 'cancelled', in_progress: 'negotiating', done: 'approved' };
function nameCell(plan, item, canEdit, collapsed) {
    const status = statusOf(item);
    const pad = 0.5 + (item.depth - 1) * 1.25;
    const toggle = item.childCount
        ? `<button type="button" class="impl-chev" data-wp-toggle="${item.id}" aria-expanded="${!collapsed}" aria-label="${esc(t(collapsed ? 'main.wpExpand' : 'main.wpCollapse'))}" title="${esc(t(collapsed ? 'main.wpExpand' : 'main.wpCollapse'))}"><i class="bx bx-chevron-right" aria-hidden="true"></i></button>`
        : '<span class="impl-chev impl-chev-none" aria-hidden="true"></span>';
    const note = item.note ? `<i class="bx bx-note wp-note-ico" role="img" aria-label="${esc(t('main.wpHasNote'))}" title="${esc(item.note)}"></i>` : '';
    const count = item.childCount ? `<span class="impl-cnt">${esc(t('main.wpChildCount', { n: item.childCount }))}</span>` : '';
    return `<div class="impl-nm impl-act-nm wp-nm${item.childCount ? ' wp-node' : ''}" style="padding-left:${pad}rem" role="group" aria-label="${esc(item.title)}" data-help-key="wpItemRow"><span class="impl-act-line"><span class="impl-act-t">${toggle}${dot(status)}<span class="impl-act-name"><b>${esc(item.title)}</b> <span class="wp-lvl-tag">${esc(levelLabel(plan, item.depth))}</span> ${count}${note}</span></span></span>
        <span class="impl-act-line impl-act-sub"><span class="impl-act-who">${esc(item.responsibleName || t('main.wpNoResponsible'))}</span>${canEdit ? rowButtons(plan, item) : ''}</span></div>`;
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
            <div class="admin-field"><label for="wp-f-from">${esc(t('main.wpFieldFrom'))}</label><input id="wp-f-from" name="startDate" type="date" value="${esc(v.startDate)}"></div>
            <div class="admin-field"><label for="wp-f-to">${esc(t('main.wpFieldTo'))}</label><input id="wp-f-to" name="endDate" type="date" value="${esc(v.endDate)}"></div>
            <div class="admin-field impl-f-wide"><label for="wp-f-note">${esc(t('main.wpFieldNote'))}</label><textarea id="wp-f-note" name="note" rows="2" maxlength="1000">${esc(v.note)}</textarea></div>
        </div>
        <p class="admin-error wp-form-error" role="alert"${f.error ? '' : ' hidden'}>${esc(f.error)}</p>
        <div class="admin-form-actions"><button type="submit" class="btn"${f.busy ? ' disabled' : ''}>${esc(t('main.wpSave'))}</button><button type="button" class="btn btn-secondary" data-wp-act="cancel-form">${esc(t('main.wpCancel'))}</button></div>
    </form>`;
}
function gantt(plan, items, canEdit, data) {
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
        html += nameCell(plan, item, canEdit, collapsed) + barCells(item, axis, today) + stateCell(item, today);
        if (index === formAfter) html += formRow();
    });
    const rootForm = formHere && form.mode === 'add' && !form.parentId;
    if (!items.length && !rootForm) html += `<div class="impl-detail-row wp-gantt-empty"><p>${esc(t('main.wpNoItems'))}</p></div>`;
    if (rootForm) html += formRow();
    else if (canEdit) html += `<div class="impl-detail-row"><div class="impl-add-wrap"><button type="button" class="impl-add" data-wp-act="add-root" data-help-key="wpAddItem"><span class="impl-plus" aria-hidden="true">+</span>${esc(t('main.wpAddRoot', { level: levelLabel(plan, 1) }))}</button></div></div>`;
    return `${html}</div>`;
}
function renderPlan(id) {
    const root = $('wp-root');
    root.dataset.view = 'plan';
    const data = cache.get(id);
    if (!data) { root.innerHTML = `<p class="wp-none">${esc(t('main.wpLoading'))}</p>`; return; }
    const { plan, items } = data;
    const canEdit = !!data.canEdit && plan.status !== 'closed';
    const frame = root.querySelector('.impl-frame');
    const scrolled = frame ? frame.scrollLeft : 0; // al abrir o cerrar una rama el cronograma no se corre de lugar
    const today = todayYmd();
    const range = plan.startDate ? t('main.wpRange', { from: longDate(plan.startDate), to: longDate(plan.endDate) }) : t('main.wpNoDates');
    root.innerHTML = `<div class="impl-head wp-head"><div><h3>${esc(planName(plan))}${plan.status === 'closed' ? ` <span class="exp-chip exp-chip-cancelled">${esc(t('main.wpClosedChip'))}</span>` : ''}</h3>${plan.description ? `<span class="impl-sub">${esc(plan.description)}</span>` : ''}<span class="impl-sub">${esc(range)}</span></div>${kpis(plan, items, today)}</div>
        ${planActions(plan, plan.isOwner !== false)}
        ${levelStrip(plan, canEdit)}
        <div class="impl-frame" role="region" aria-label="${esc(t('main.wpNameGantt'))}" data-help-key="wpGantt">${gantt(plan, items, canEdit, data)}</div>`;
    const framed = root.querySelector('.impl-frame');
    if (framed && scrolled) framed.scrollLeft = scrolled;
    if (form && form.planId === plan.id) setTimeout(() => { const el = $('wp-f-title'); if (el && document.activeElement !== el && !form.focused) { el.focus(); form.focused = true; } }, 0);
}
function render() {
    renderTabs();
    if (tabs.active === 'list') renderList(); else renderPlan(tabs.active);
}

// ---- acciones del plan --------------------------------------------------------------------------------------------------------------------------------
const currentPlanId = () => (tabs.active !== 'list' ? tabs.active : null);
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
async function setStatus(id, status) {
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;
    const key = status === 'closed' ? 'main.wpCloseConfirm' : 'main.wpReopenConfirm';
    if (!(await Dashboard.confirm(t(key, { title: plan.title })))) return;
    if (await planWrite(id, () => api('PATCH', `/${id}`, { status }))) Dashboard.showToast(t(status === 'closed' ? 'main.wpClosedToast' : 'main.wpReopenedToast'), 'success');
}
async function deletePlan(id) {
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
// ---- renglones ---------------------------------------------------------------------------------------------------------------------------------------
function openForm(mode, planId, options) {
    const data = cache.get(planId);
    if (!data) return;
    const item = options.id ? data.items.find((i) => i.id === options.id) : null;
    const depth = mode === 'edit' ? item.depth : (options.parentId ? data.items.find((i) => i.id === options.parentId).depth + 1 : 1);
    if (options.parentId) setCollapsed(planId, options.parentId, false);
    form = {
        mode, planId, parentId: mode === 'edit' ? item.parentId : (options.parentId || null), id: item ? item.id : null, depth,
        values: { title: item ? item.title : '', responsible: item ? item.responsibleName : '', startDate: item ? (item.startDate || '') : '', endDate: item ? (item.endDate || '') : '', note: item ? (item.note || '') : '' },
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
    const f = { title: formEl.elements.title.value, responsible: formEl.elements.responsible.value, startDate: formEl.elements.startDate.value, endDate: formEl.elements.endDate.value, note: formEl.elements.note.value };
    form.values = { ...f };
    const problem = localProblem(f);
    if (problem) { showFormError(t(`main.wpFormErr_${problem}`)); return; }
    // un nombre de la lista de la compañía queda ligado a esa persona; cualquier otro texto queda como responsable libre
    const person = (data.people || []).find((p) => fold(p.name) === fold(f.responsible));
    const body = { title: f.title.trim(), responsibleUserId: person ? person.id : null, responsibleName: person ? '' : f.responsible.trim(), startDate: f.startDate || null, endDate: f.endDate || null, note: f.note.trim() };
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
const DEFAULT_LEVELS = () => [t('main.wpLevelDefaultName_1'), t('main.wpLevelDefaultName_2'), t('main.wpLevelDefaultName_3')];
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
        overlay.querySelector('[data-wp-m="add-level"]').disabled = names.length >= 4;
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

// ---- eventos ------------------------------------------------------------------------------------------------------------------------------------------
document.addEventListener('click', (event) => {
    const el = event.target;
    const closeBtn = el.closest('[data-wp-close]');
    if (closeBtn) { closeTab(Number(closeBtn.dataset.wpClose)); return; }
    const tab = el.closest('[data-wp-tab]');
    if (tab && $('wp-tabs').contains(tab)) { const id = tab.dataset.wpTab; activate(id === 'list' ? 'list' : Number(id)); return; }
    if (el.closest('[data-wp-new]')) { openPlanModal(null); return; }
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
    else if (op === 'delete') deletePlan(planId);
    else if (op === 'history') Dashboard.openChangeHistory('work_plans', planId);
});
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const tab = event.target.closest && event.target.closest('.wp-tab[data-wp-tab]');
    if (tab && event.target === tab) { event.preventDefault(); const id = tab.dataset.wpTab; activate(id === 'list' ? 'list' : Number(id)); }
});
document.addEventListener('input', (event) => {
    const input = event.target;
    if (input.id === 'wp-search') { listQuery = input.value; renderList(true); return; }
    if (form && input.name && input.closest('[data-wp-form]')) form.values[input.name] = input.value;
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
        try { await loadList(); } catch (err) { $('wp-error').textContent = t('main.wpLoadError'); $('wp-error').hidden = false; console.error('Planes de trabajo: failed to load', err); return; }
        tabs.open = tabs.open.filter((id) => plans.some((p) => p.id === id));
        if (tabs.active !== 'list' && !tabs.open.includes(tabs.active)) tabs.active = 'list';
        saveTabs();
        if (tabs.active !== 'list') { try { await loadPlan(tabs.active); } catch (err) { tabs.active = 'list'; } }
        render();
        // si un nombre no cabe en su pestaña se abrevia (y al sobreponer sale completo): ver Dashboard.watchLabelFit
        Dashboard.watchLabelFit($('wp-tabs'), '.wp-tab-nm');
    } catch (err) {
        console.error('Planes de trabajo failed to initialize:', err);
    }
})();
})();
