// ---------------------------------------------------------------------------
// Mensajes (pieza 2c de Planes de trabajo): el panel del botón Mensajes de la barra de arriba. Cuatro pestañas: Todo (lo más nuevo de las otras tres, junto), Chats (conversaciones 1 a 1 con personas de la misma compañía),
// Planes (tus planes de trabajo con su avance y lo que traen sin leer) y Avisos (te compartieron un plan, te mencionaron, algo a tu cargo vence). Cada chat es un hilo genérico (Threads.js, tipo «chat»): los mensajes no se editan
// ni se borran. El servidor decide todo (server.js, /api/business/messages/*): aquí solo se dibuja. Dashboard.js carga este archivo la primera vez que se toca el botón, pinta el globito de «sin leer» y lo actualiza cada minuto.
// Módulo global: Messages.toggle() / open() / close().
// ---------------------------------------------------------------------------
(function () {
'use strict';
const API = '/api/business/messages';
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fold = (text) => String(text == null ? '' : text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const locale = () => (localStorage.getItem('lang') === 'en' ? 'en-US' : 'es-MX');
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase() || '?';
const pad2 = (n) => String(n).padStart(2, '0');
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
// «2026-03-18 15:04:05.123» (UTC) → «10:42» si es de hoy en la zona de quien lo ve, «18 mar» si no
function whenText(at) {
    const d = new Date(`${String(at).replace(' ', 'T')}Z`);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}
const stampMs = (at) => { const d = new Date(`${String(at).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? 0 : d.getTime(); };

async function api(method, path, body) {
    const res = await fetch(`${API}${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.error || out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
    return out;
}
async function plansApi() {
    const res = await fetch('/api/business/work-plans?status=active', { credentials: 'include' });
    if (!res.ok) return null; // sin la pantalla de planes: la pestaña no sale
    return res.json().catch(() => null);
}

let panel = null;
let state = { tab: 'all', view: 'list', chats: [], plans: null, notices: [], summary: null, people: [], peopleQuery: '', activeChat: null, loading: false, error: '' };
let controller = null; // el hilo del chat abierto
let pollTimer = 0;

const isOpen = () => !!panel && panel.classList.contains('open');
function destroyThread() { if (controller) { controller.destroy(); controller = null; } }

// ---- datos ---------------------------------------------------------------------------------------------------------------------------------------
async function loadAll() {
    state.loading = true;
    try {
        const [chats, notices, summary, plans] = await Promise.all([
            api('GET', '/chats').catch(() => ({ chats: [] })),
            api('GET', `/notices?today=${todayYmd()}`).catch(() => ({ notices: [] })),
            api('GET', '/summary').catch(() => null),
            plansApi(),
        ]);
        state.chats = chats.chats || [];
        state.notices = notices.notices || [];
        state.summary = summary;
        state.plans = plans ? (plans.plans || []) : null;
        state.error = '';
    } catch (err) {
        state.error = t('main.msgLoadError');
    }
    state.loading = false;
    if (window.Dashboard && Dashboard.setMessagesBadge && state.summary) Dashboard.setMessagesBadge(state.summary.total || 0);
    if (isOpen() && state.view === 'list') renderBody();
}

// ---- lo que se dibuja ---------------------------------------------------------------------------------------------------------------------------
const planHref = (planId, itemId) => `PlanesTrabajo.html#plan=${planId}${itemId ? `&item=${itemId}` : ''}`;
const KIND_TAG = { chat: ['main.msgTagChat', 'g'], plan: ['main.msgTagPlan', 'v'], shared: ['main.msgTagPlan', 'v'], mention: ['main.msgTagMention', ''], due: ['main.msgTagDue', 'w'] };
const tag = (kind) => { const [key, tone] = KIND_TAG[kind] || ['main.msgTagPlan', 'v']; return `<span class="msg-tag${tone ? ` msg-tag-${tone}` : ''}">${esc(t(key))}</span>`; };
function item({ av, avClass, title, time, text, tags, unread, attrs }) {
    return `<button type="button" class="msg-item${unread ? ' msg-unread' : ''}" ${attrs}><span class="msg-av${avClass ? ` ${avClass}` : ''}" aria-hidden="true">${esc(av)}</span>
        <span class="msg-main"><span class="msg-top"><b>${esc(title)}</b><time>${esc(time || '')}</time></span><span class="msg-text">${esc(text || '')}</span>${tags ? `<span class="msg-tags">${tags}</span>` : ''}</span>
        ${unread ? `<span class="msg-count">${unread === true ? '' : esc(unread)}</span>` : '<span></span>'}</button>`;
}
const chatItem = (c) => item({ av: initials(c.userName), title: c.userName, time: whenText(c.lastAt), text: `${c.lastMine ? `${t('main.msgYou')}: ` : ''}${c.lastBody}`, tags: tag('chat'), unread: c.unreadCount || 0, attrs: `data-msg-chat="${c.id}"` });
// El servidor manda el aviso en piezas (params) y aquí se arma en el idioma de quien lo ve; title y text (en español) son solo el respaldo si no vienen.
function noticeTexts(n) {
    const p = n.params;
    if (!p) return { title: n.title, text: n.text };
    if (n.kind === 'shared') return { title: p.by ? t('main.msgNoticeSharedBy', { by: p.by }) : t('main.msgNoticeShared'), text: `${p.planTitle} · ${t(`main.wpRole_${p.role}`)}`, who: p.by || p.planTitle };
    if (n.kind === 'mention') {
        const label = p.itemTitle ? `${p.levelName ? `${p.levelName} ` : ''}«${p.itemTitle}»` : `${t('main.msgPlanWord')} «${p.planTitle}»`;
        return { title: p.by ? t('main.msgNoticeMentionBy', { by: p.by }) : t('main.msgNoticeMention'), text: `${label} · ${p.snippet}`, who: p.by || p.planTitle };
    }
    if (n.kind === 'due') {
        const d = Number(p.days);
        const when = d === 0 ? t('main.msgDueToday') : (d > 0 ? t(d === 1 ? 'main.msgDueInOne' : 'main.msgDueIn', { n: d }) : t(d === -1 ? 'main.msgDueAgoOne' : 'main.msgDueAgo', { n: -d }));
        return { title: n.title, text: `${p.planTitle} · ${when}` };
    }
    return { title: n.title, text: n.text };
}
function noticeItem(n) {
    const texts = noticeTexts(n);
    return item({ av: n.kind === 'due' ? '!' : initials(texts.who || texts.title), avClass: n.kind === 'due' ? `msg-av-${n.severity === 'late' ? 'late' : 'warn'}` : '', title: texts.title, time: n.kind === 'due' ? '' : whenText(n.at), text: texts.text, tags: tag(n.kind), unread: n.unread ? true : 0, attrs: `data-msg-href="${esc(planHref(n.planId, n.itemId))}"` });
}
function planItem(p) {
    const own = (p.origin || 'own') === 'own';
    const sub = own ? (p.memberCount ? t('main.wpSharedWith', { n: p.memberCount }) : t('main.wpPrivate')) : `${t('main.wpFromOwner', { name: p.ownerName || '—' })} · ${t(`main.wpRole_${p.origin === 'team' ? 'team' : (p.myRole || 'view')}`)}`;
    const unread = (p.unreadComments || 0) + (p.isNew ? 1 : 0);
    return `<button type="button" class="msg-item msg-plan${unread ? ' msg-unread' : ''}" data-msg-href="${esc(planHref(p.id))}"><span class="msg-av msg-av-sq" aria-hidden="true">${esc(initials(p.title))}</span>
        <span class="msg-main"><span class="msg-top"><b>${esc(p.title)}</b>${p.isNew ? `<span class="msg-tag msg-tag-new">${esc(t('main.wpNewChip'))}</span>` : ''}</span>
        <span class="msg-meter" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, p.progress || 0))}%"></i></span>
        <span class="msg-text">${esc(sub)} · ${p.progress || 0}%${p.unreadComments ? ` · ${esc(t('main.wpUnreadComments', { n: p.unreadComments }))}` : ''}</span></span><span class="msg-go">${esc(t('main.wpOpen'))} ›</span></button>`;
}
function emptyNote(key) { return `<p class="msg-empty">${esc(t(key))}</p>`; }

function listHtml() {
    if (state.error) return `<p class="msg-empty msg-error">${esc(state.error)}</p>`;
    if (state.loading && !state.summary) return emptyNote('main.msgLoading');
    if (state.tab === 'chats') return state.chats.length ? state.chats.map(chatItem).join('') : emptyNote('main.msgNoChats');
    if (state.tab === 'plans') {
        if (!state.plans || !state.plans.length) return emptyNote('main.msgNoPlans');
        return state.plans.map(planItem).join('');
    }
    if (state.tab === 'notices') return state.notices.length ? state.notices.map(noticeItem).join('') : emptyNote('main.msgNoNotices');
    // Todo: lo más nuevo de las tres, junto, con lo sin leer primero
    const rows = [];
    state.chats.forEach((c) => rows.push({ at: stampMs(c.lastAt), unread: c.unreadCount > 0, html: chatItem(c) }));
    state.notices.forEach((n) => rows.push({ at: n.kind === 'due' ? Date.now() : stampMs(n.at), unread: !!n.unread, html: noticeItem(n) }));
    // un plan recién compartido ya sale como aviso («te compartió un plan»): no se repite como renglón del plan
    const sharedNoticePlans = new Set(state.notices.filter((n) => n.kind === 'shared').map((n) => n.planId));
    (state.plans || []).filter((p) => (p.isNew || p.unreadComments) && !(p.isNew && !p.unreadComments && sharedNoticePlans.has(p.id))).forEach((p) => rows.push({ at: stampMs(p.lastActivityAt), unread: true, html: planItem(p) }));
    rows.sort((a, b) => (Number(b.unread) - Number(a.unread)) || (b.at - a.at));
    return rows.length ? rows.slice(0, 60).map((r) => r.html).join('') : emptyNote('main.msgNothingNew');
}
function tabCounts() {
    const s = state.summary || {};
    const plansUnread = (state.plans || []).filter((p) => p.isNew || p.unreadComments).length;
    return { all: s.total || 0, chats: s.unreadChats || 0, plans: plansUnread, notices: state.notices.filter((n) => n.unread).length };
}
function tabsHtml() {
    const counts = tabCounts();
    const tabs = [['all', 'main.msgTabAll'], ['chats', 'main.msgTabChats']];
    if (state.plans) tabs.push(['plans', 'main.msgTabPlans']);
    tabs.push(['notices', 'main.msgTabNotices']);
    return `<div class="msg-tabs" role="tablist" data-help-key="msgTabs">${tabs.map(([key, label]) => `<button type="button" role="tab" class="msg-tab${state.tab === key ? ' active' : ''}" aria-selected="${state.tab === key}" data-msg-tab="${key}">${esc(t(label))}${counts[key] ? `<i>${counts[key]}</i>` : ''}</button>`).join('')}</div>`;
}
function footerHtml() {
    if (state.tab === 'plans' && state.plans) return `<div class="msg-foot"><a class="msg-link" href="PlanesTrabajo.html">${esc(t('main.msgAllPlans'))} ›</a></div>`;
    return '';
}
function renderBody() {
    if (!panel) return;
    const body = panel.querySelector('.msg-body');
    const keepScroll = body.scrollTop;
    panel.querySelector('.msg-tabs-wrap').innerHTML = tabsHtml();
    body.innerHTML = `<div class="msg-list">${listHtml()}</div>${footerHtml()}`;
    body.scrollTop = keepScroll;
}

// ---- vistas: lista, chat y nuevo mensaje ----------------------------------------------------------------------------------------------------------
function showList() {
    destroyThread();
    state.view = 'list';
    state.activeChat = null;
    panel.classList.remove('msg-in-chat');
    panel.querySelector('.msg-head').innerHTML = `<b class="msg-title">${esc(t('main.msgTitle'))}</b><span class="msg-head-actions"><button type="button" class="btn btn-secondary msg-new" data-msg-act="new" data-help-key="msgNew"><i class="bx bx-edit" aria-hidden="true"></i> ${esc(t('main.msgNew'))}</button><button type="button" class="msg-close" data-msg-act="close" aria-label="${esc(t('main.msgClose'))}" title="${esc(t('main.msgClose'))}"><i class="bx bx-x" aria-hidden="true"></i></button></span>`;
    panel.querySelector('.msg-tabs-wrap').hidden = false;
    renderBody();
}
function openChat(chatId, name) {
    destroyThread();
    state.view = 'chat';
    state.activeChat = { id: chatId, name };
    panel.classList.add('msg-in-chat');
    panel.querySelector('.msg-head').innerHTML = `<span class="msg-head-chat"><button type="button" class="msg-back" data-msg-act="back" aria-label="${esc(t('main.msgBack'))}" title="${esc(t('main.msgBack'))}"><i class="bx bx-chevron-left" aria-hidden="true"></i></button><b class="msg-title">${esc(name)}</b></span><button type="button" class="msg-close" data-msg-act="close" aria-label="${esc(t('main.msgClose'))}" title="${esc(t('main.msgClose'))}"><i class="bx bx-x" aria-hidden="true"></i></button>`;
    panel.querySelector('.msg-tabs-wrap').hidden = true;
    const body = panel.querySelector('.msg-body');
    body.innerHTML = '<div class="msg-chat"></div>';
    controller = Threads.mount(body.querySelector('.msg-chat'), { type: 'chat', id: chatId, mentions: false, onChange: () => { loadAll(); } });
}
async function openNew() {
    destroyThread();
    state.view = 'new';
    state.peopleQuery = '';
    panel.classList.add('msg-in-chat');
    panel.querySelector('.msg-head').innerHTML = `<span class="msg-head-chat"><button type="button" class="msg-back" data-msg-act="back" aria-label="${esc(t('main.msgBack'))}" title="${esc(t('main.msgBack'))}"><i class="bx bx-chevron-left" aria-hidden="true"></i></button><b class="msg-title">${esc(t('main.msgNew'))}</b></span><button type="button" class="msg-close" data-msg-act="close" aria-label="${esc(t('main.msgClose'))}" title="${esc(t('main.msgClose'))}"><i class="bx bx-x" aria-hidden="true"></i></button>`;
    panel.querySelector('.msg-tabs-wrap').hidden = true;
    panel.querySelector('.msg-body').innerHTML = `<div class="msg-pick"><input type="search" class="msg-search" id="msg-people-q" placeholder="${esc(t('main.msgPickPlaceholder'))}" aria-label="${esc(t('main.msgPickPlaceholder'))}" autocomplete="off" data-help-key="msgPick"><div class="msg-list" id="msg-people"><p class="msg-empty">${esc(t('main.msgLoading'))}</p></div></div>`;
    try {
        const out = await api('GET', '/people');
        state.people = out.people || [];
    } catch (err) {
        state.people = [];
    }
    drawPeople();
    const input = panel.querySelector('#msg-people-q');
    if (input) input.focus();
}
function drawPeople() {
    const list = panel && panel.querySelector('#msg-people');
    if (!list) return;
    const q = fold(state.peopleQuery);
    const found = state.people.filter((p) => !q || fold(p.name).includes(q));
    list.innerHTML = found.length ? found.map((p) => `<button type="button" class="msg-item" data-msg-person="${p.id}" data-name="${esc(p.name)}"><span class="msg-av" aria-hidden="true">${esc(initials(p.name))}</span><span class="msg-main"><span class="msg-top"><b>${esc(p.name)}</b></span></span><span></span></button>`).join('') : emptyNote('main.msgNoPeople');
}
async function startChat(userId, name) {
    try {
        const out = await api('POST', '/chats', { userId });
        openChat(out.chat.id, out.chat.userName || name);
    } catch (err) {
        const code = err && err.body && err.body.code;
        const key = `main.msgErr_${code}`;
        const text = Dashboard.t(key);
        Dashboard.showToast(text !== key ? text : t('main.msgErr_default'), 'error');
    }
}

// ---- el panel ------------------------------------------------------------------------------------------------------------------------------------
function build() {
    panel = document.createElement('div');
    panel.id = 'msg-panel';
    panel.className = 'msg-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('main.msgTitle'));
    panel.setAttribute('data-help-key', 'msgPanel');
    panel.innerHTML = '<div class="msg-head"></div><div class="msg-tabs-wrap"></div><div class="msg-body"></div>';
    document.body.appendChild(panel);
    panel.addEventListener('click', (event) => {
        const el = event.target;
        const act = el.closest('[data-msg-act]');
        if (act) {
            const op = act.dataset.msgAct;
            if (op === 'close') close();
            else if (op === 'back') { showList(); loadAll(); }
            else if (op === 'new') openNew();
            return;
        }
        const tabBtn = el.closest('[data-msg-tab]');
        if (tabBtn) { state.tab = tabBtn.dataset.msgTab; renderBody(); return; }
        const chat = el.closest('[data-msg-chat]');
        if (chat) { const found = state.chats.find((c) => c.id === Number(chat.dataset.msgChat)); openChat(Number(chat.dataset.msgChat), found ? found.userName : ''); return; }
        const person = el.closest('[data-msg-person]');
        if (person) { startChat(Number(person.dataset.msgPerson), person.dataset.name); return; }
        const href = el.closest('[data-msg-href]');
        if (href) { close(); location.href = href.dataset.msgHref; }
    });
    panel.addEventListener('input', (event) => { if (event.target.id === 'msg-people-q') { state.peopleQuery = event.target.value; drawPeople(); } });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && isOpen()) close(); });
    document.addEventListener('click', (event) => {
        if (!isOpen()) return;
        // La ruta del clic se toma de cuando ocurrió: si el panel acaba de volver a dibujar el botón tocado (Nuevo mensaje, Atrás, elegir a una persona), ese botón ya no está dentro del panel y no debe contar como «afuera».
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        if (path.includes(panel) || panel.contains(event.target) || event.target.closest('#messages-btn') || event.target.closest('.modal-overlay')) return;
        close();
    });
    document.addEventListener('dashboard:language-changed', () => { if (panel && isOpen()) { if (state.view === 'list') showList(); } });
}
function open() {
    if (!panel) build();
    panel.classList.add('open');
    showList();
    loadAll();
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (isOpen() && !document.hidden && state.view === 'list') loadAll(); }, 30000);
}
function close() {
    if (!panel) return;
    destroyThread();
    panel.classList.remove('open');
    clearInterval(pollTimer);
    loadAll();
}
function toggle() { if (isOpen()) close(); else open(); }

window.Messages = { open, close, toggle, isOpen };
})();
