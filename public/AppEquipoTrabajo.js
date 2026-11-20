// ---------------------------------------------------------------------------
// Administración de Equipo de Trabajo (App) — la misma pantalla de la Web (el icono «Equipo de Trabajo» de la barra de arriba) hecha para el celular. Tres pestañas:
//   · «Mías»: las actividades que tengo asignadas, agrupadas por en qué voy (en curso, en pausa, por confirmar, confirmadas, en validación, hechas): confirmar, empezar, pausar (con motivo), reanudar y enviar a validar.
//     Arriba, «Hoy»: dónde trabajo hoy (corporativo, en una unidad, home office o ausente), que se cambia con una hoja desde abajo.
//   · «Pendientes» (solo cuando hay algo): lo que me toca resolver como jefe o como alguien libre: por validar (validar o regresar con motivo), pases por aprobar (aprobar o rechazar) y las por asignar que puedo tomar («La tomo»).
//   · «Equipo»: todo lo que veo en el tablero (lo mío, lo de mi gente a cargo y lo que se puede tomar), con filtros por en qué va y por persona; al tocar una abre su detalle con la línea del tiempo.
//   Crear, cambiar, asignar, quitar personas, pasar, cancelar, la línea del tiempo general, el Registro, las descargas y la foto se quedan en la Web (la App refleja la Web, no inventa).
// Sin señal funciona: lo último que se bajó se guarda en el celular y cada movimiento (y el cambio de «hoy») espera en la cola de AppOfflineSync.js (recordKey «equipo-trabajo:<actividad>») marcado «En tu celular»;
// si al reconectar el servidor rechaza alguno (ya no estaba en ese paso, la cancelaron…) se avisa en «No se aplicó». El servidor es el mismo de la Web (/api/business/team-activities); lo que cada quien puede hacer
// lo decide el servidor y viaja en `can`.
// ---------------------------------------------------------------------------

const SUPPORTED_LANGS = ['en', 'es'];
const DEFAULT_LANG = 'en';
let dict = {};

function t(key, params = {}) {
    const value = key.split('.').reduce((obj, part) => obj?.[part], dict);
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const currentLang = () => (SUPPORTED_LANGS.includes(localStorage.getItem('lang')) ? localStorage.getItem('lang') : DEFAULT_LANG);

async function loadLanguage() {
    const lang = currentLang();
    try {
        const res = await fetch(`i18n/${lang}.json`);
        if (res.ok) dict = await res.json();
    } catch {
        dict = {};
    }
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    const titleTag = document.querySelector('title[data-i18n]');
    if (titleTag) document.title = t(titleTag.dataset.i18n);
}

function showToast(message, duration = 4000) {
    const container = document.getElementById('home-toast-container');
    const toast = document.createElement('div');
    toast.className = 'home-toast';
    toast.setAttribute('role', 'status');
    const icon = document.createElement('span');
    icon.className = 'home-toast-icon';
    icon.innerHTML = '<i class="bx bx-info-circle" aria-hidden="true"></i>';
    const msgEl = document.createElement('p');
    msgEl.className = 'home-toast-message';
    msgEl.textContent = message;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'home-toast-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
    const progress = document.createElement('div');
    progress.className = 'home-toast-progress';
    let dismissTimer = null;
    const close = () => {
        if (dismissTimer) clearTimeout(dismissTimer);
        toast.classList.remove('home-toast-visible');
        setTimeout(() => toast.remove(), 300);
    };
    closeBtn.addEventListener('click', close);
    toast.append(icon, msgEl, closeBtn, progress);
    container.appendChild(toast);
    void toast.offsetWidth;
    toast.classList.add('home-toast-visible');
    progress.style.transitionDuration = `${duration}ms`;
    progress.style.width = '0';
    dismissTimer = setTimeout(close, duration);
}

// --- Estilo (theme) — el mismo mecanismo de todas las páginas de la App. ----------------------------------------------------------------
let clientColorPalette = null;
let clientPrimaryColor = null;
const INSTITUTIONAL_THEME_PROPS = [
    '--home-bg', '--home-bg-grad-1', '--home-bg-grad-2', '--home-tabbar-bg',
    '--home-surface', '--home-surface-2', '--home-neutral-soft',
    '--home-border', '--home-divider',
    '--home-text-primary', '--home-text-secondary', '--home-text-tertiary', '--home-text-muted',
    '--home-accent', '--home-accent-strong-1', '--home-accent-strong-2', '--home-on-accent',
    '--home-header-grad-1', '--home-header-grad-2', '--home-on-header',
];
function applyInstitutionalTheme() {
    const palette = clientColorPalette
        || (clientPrimaryColor && window.ColorPalette ? window.ColorPalette.suggestPalette(clientPrimaryColor) : null);
    if (!palette) return;
    const root = document.body.style;
    root.setProperty('--home-bg', palette.bg || '#0e1e33');
    root.setProperty('--home-bg-grad-1', palette.bg || '#0e1e33');
    root.setProperty('--home-bg-grad-2', palette.bg || '#0e1e33');
    root.setProperty('--home-tabbar-bg', palette.bg || '#0e1e33');
    root.setProperty('--home-surface', palette.surface || '#16304d');
    root.setProperty('--home-surface-2', palette.surface || '#16304d');
    root.setProperty('--home-neutral-soft', palette.surface || '#16304d');
    root.setProperty('--home-border', palette.border || '#2a4d70');
    root.setProperty('--home-divider', palette.border || '#2a4d70');
    root.setProperty('--home-text-primary', palette.textPrimary || '#ffffff');
    root.setProperty('--home-text-secondary', palette.textSecondary || '#c9d9e8');
    root.setProperty('--home-text-tertiary', palette.textSecondary || '#c9d9e8');
    root.setProperty('--home-text-muted', palette.textSecondary || '#c9d9e8');
    root.setProperty('--home-accent', palette.accent || '#7fd1ff');
    root.setProperty('--home-accent-strong-1', palette.accent || '#2f6fae');
    root.setProperty('--home-accent-strong-2', palette.accent || '#2f6fae');
    root.setProperty('--home-on-accent', palette.accentText || '#ffffff');
    root.setProperty('--home-header-grad-1', palette.tooltipBg || '#1c3a5e');
    root.setProperty('--home-header-grad-2', palette.tooltipBg || '#1c3a5e');
    root.setProperty('--home-on-header', palette.tooltipText || '#ffffff');
}
function getStoredStyle() {
    const stored = localStorage.getItem('style');
    return ['light', 'dark', 'institutional', 'futuristic'].includes(stored) ? stored : 'light';
}
function applyStyle(style) {
    document.body.classList.remove('institutional-mode', 'dark-mode', 'futuristic-mode');
    INSTITUTIONAL_THEME_PROPS.forEach((prop) => document.body.style.removeProperty(prop));
    if (style === 'institutional') { document.body.classList.add('institutional-mode'); applyInstitutionalTheme(); }
    else if (style === 'dark') document.body.classList.add('dark-mode');
    else if (style === 'futuristic') document.body.classList.add('futuristic-mode');
}
async function loadBrandingForTheme() {
    try {
        const res = await fetch(apiUrl('/api/business/branding'), { credentials: 'include' });
        if (!res.ok) return;
        const { branding } = await res.json();
        clientColorPalette = branding.colorPalette || null;
        clientPrimaryColor = branding.primaryColor || null;
        if (getStoredStyle() === 'institutional') applyInstitutionalTheme();
    } catch {
        // Se queda con el estilo fijo de cada tema.
    }
}

// --- Estado ----------------------------------------------------------------------------------------------------------------------------
const API = '/api/business/team-activities';
const RECORD_PREFIX = 'equipo-trabajo';
const ACT_URL = /\/api\/business\/team-activities\/(\d+)\/(confirm|start|pause|resume|submit|validate|return|claim|pass-approve|pass-reject)$/;
const DAY_URL = /\/api\/business\/team-activities\/workday$/;
const MAX_ROWS = 100;                          // las tarjetas que se dibujan a la vez; el buscador y los filtros traen el resto
const LANES = ['unassigned', 'assigned', 'in_progress', 'paused', 'review', 'done'];
const MINE_ORDER = ['in_progress', 'paused', 'assigned', 'confirmed', 'review', 'done'];
const PLACES = ['corporate', 'site', 'home', 'absent'];
const ABSENCES = ['vacation', 'permit', 'sick', 'other'];
let currentUser = null;
let data = { activities: [], me: { id: null, name: '', isAdmin: false, hasTeam: false }, sites: [], today: null };
let dataState = 'loading';                     // 'loading' | 'online' | 'cached' | 'none' | 'forbidden'
let tab = 'mine';                              // 'mine' | 'todo' | 'team'
let screen = 'list';                           // 'list' | 'detail'
let openId = null;
let detailEvents = null;                       // { id, events } de la actividad abierta (solo con señal)
let mineFilter = 'open';                       // 'open' | 'done' | 'all'
let mineQuery = '';
let teamLane = 'all';                          // 'all' | cada columna del tablero
let teamPerson = 'all';
let teamQuery = '';
let pending = new Map();                       // id de actividad -> [{ action, body }] guardados sin señal y todavía en la cola
let pendingDay = null;                         // el «dónde trabajo hoy» guardado sin señal
let listScroll = 0;

// --- Fechas (de calendario, sin hora) --------------------------------------------------------------------------------------------------
const localeOf = () => (currentLang() === 'es' ? 'es-MX' : 'en-US');
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d); };
const ymdOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayYmd = () => ymdOf(new Date());
const shortDate = (ymd) => (ymd ? dayOf(ymd).toLocaleDateString(localeOf(), { day: 'numeric', month: 'short' }).replace(/\./g, '') : '');
const longDate = (ymd) => (ymd ? dayOf(ymd).toLocaleDateString(localeOf(), { day: 'numeric', month: 'long', year: 'numeric' }) : '');
// las horas se guardan en UTC («2026-11-19 16:05:00.123»): cada quien las ve en su hora
const whenText = (utc) => { const d = new Date(`${String(utc || '').replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(localeOf(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase() || '?';
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };
const sync = () => window.SgnOfflineSync;
const repeatText = (unit, every) => t(`main.twRep_${unit}_${Number(every) === 1 ? '1' : 'n'}`, { n: every });
const JSON_HEADERS = { 'Content-Type': 'application/json' };

// En qué columna del tablero está una actividad, según lo que lleva cada persona (la misma regla del servidor: db.js › teamActivityState)
function activityState(assignees) {
    if (!assignees.length) return 'unassigned';
    const basis = assignees.filter((a) => a.isPrincipal);
    const finish = basis.length ? basis : assignees;
    if (finish.every((a) => a.status === 'done')) return 'done';
    if (finish.every((a) => a.status === 'review' || a.status === 'done')) return 'review';
    const st = assignees.map((a) => a.status);
    if (st.includes('in_progress')) return 'in_progress';
    if (st.includes('paused')) return 'paused';
    if (st.includes('review') || st.includes('done')) return 'in_progress';
    return 'assigned';
}

// --- Lo que se mandó sin señal y sigue en la cola: se ve ya aplicado, marcado «En tu celular» ----------------------------------------------
const parseBody = (item) => { try { return JSON.parse(item.body || '{}'); } catch { return null; } };
async function refreshQueued() {
    let queue = [];
    try { queue = await sync().listOfflineQueue(); } catch { queue = []; }
    const next = new Map();
    let day = null;
    queue.forEach((item) => {
        if (!item.url) return;
        const body = parseBody(item);
        if (!body) return;
        if (item.method === 'POST') {
            const m = ACT_URL.exec(item.url);
            if (!m) return;
            const id = Number(m[1]);
            if (!next.has(id)) next.set(id, []);
            next.get(id).push({ action: m[2], body });
        } else if (item.method === 'PUT' && DAY_URL.test(item.url)) day = body;
    });
    const changed = JSON.stringify([...next]) !== JSON.stringify([...pending]) || JSON.stringify(day) !== JSON.stringify(pendingDay);
    pending = next;
    pendingDay = day;
    return changed;
}
// Lo que cada movimiento cambia, con la misma regla del servidor (solo lo propio): sirve para ver ya aplicado lo que está en la cola y para que, al reconectar, lo guardado no se aplique dos veces (cada paso revisa en qué va).
function recomputeCan(a) {
    const c = a.can || (a.can = {});
    const mine = a.assignees.find((x) => x.userId === data.me.id);
    a.myStatus = mine ? mine.status : '';
    c.confirm = !!mine && mine.status === 'assigned';
    c.start = !!mine && (mine.status === 'assigned' || mine.status === 'confirmed');
    c.pause = !!mine && mine.status === 'in_progress';
    c.resume = !!mine && mine.status === 'paused';
    c.submit = !!mine && mine.status === 'in_progress';
    c.reviewUserIds = (c.reviewUserIds || []).filter((id) => a.assignees.some((x) => x.userId === id && x.status === 'review'));
    c.validate = c.reviewUserIds.length > 0;
    c.returnIt = c.reviewUserIds.length > 0;
    c.claim = !!c.claim && !mine && a.seatsOpen > 0;
}
function applyAction(a, action, body) {
    const me = a.assignees.find((x) => x.userId === data.me.id);
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
    if (action === 'confirm' && me && me.status === 'assigned') { me.status = 'confirmed'; me.confirmedAt = now; }
    else if (action === 'start' && me && (me.status === 'assigned' || me.status === 'confirmed')) { me.status = 'in_progress'; me.startedAt = now; a.assignees.forEach((x) => { if (x.userId === me.userId) x.isNow = true; }); }
    else if (action === 'pause' && me && me.status === 'in_progress') { me.status = 'paused'; me.pauseReason = (body && body.reason) || ''; me.pausedAt = now; }
    else if (action === 'resume' && me && me.status === 'paused') { me.status = 'in_progress'; me.pauseReason = ''; }
    else if (action === 'submit' && me && me.status === 'in_progress') { me.status = 'review'; me.reviewAt = now; }
    else if (action === 'validate' || action === 'return') {
        const wanted = body && body.userId != null && body.userId !== '' ? [Number(body.userId)] : (a.can.reviewUserIds || []);
        a.assignees.forEach((x) => {
            if (!wanted.includes(x.userId) || x.status !== 'review') return;
            if (action === 'validate') { x.status = 'done'; x.doneAt = now; } else { x.status = 'in_progress'; x.reviewAt = null; }
        });
    } else if (action === 'claim' && !me && a.seatsOpen > 0) {
        a.assignees.push({ userId: data.me.id, name: data.me.name, status: 'confirmed', isPrincipal: false, pauseReason: '', isMe: true, isMine: false, isNow: false, confirmedAt: now });
        a.seatsOpen = Math.max(0, a.seatsOpen - 1);
    } else if (action === 'pass-approve' || action === 'pass-reject') {
        a.passes = (a.passes || []).filter((p) => p.id !== Number(body && body.passId));
    }
    a.status = activityState(a.assignees);
    recomputeCan(a);
}
function effectiveOf(a) {
    const list = pending.get(a.id);
    if (!list || !list.length) return a;
    const copy = JSON.parse(JSON.stringify(a));
    list.forEach((p) => applyAction(copy, p.action, p.body));
    copy.queued = true;
    return copy;
}
const activities = () => data.activities.map(effectiveOf);
function todayPeople() {
    const block = data.today;
    if (!block || !Array.isArray(block.people)) return [];
    if (!pendingDay || pendingDay.day !== block.day) return block.people;
    return block.people.map((p) => (p.isMe ? { ...p, place: pendingDay.place, siteId: pendingDay.siteId || null, siteName: pendingDay.place === 'site' ? ((data.sites.find((s) => s.id === Number(pendingDay.siteId)) || {}).name || '') : '', absence: pendingDay.place === 'absent' ? (pendingDay.absence || 'other') : '', queued: true } : p));
}

// --- Carga: lo último que se bajó se guarda en el celular para verlo también sin señal ---------------------------------------------------
function cacheDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('sgn-tw-cache', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
const userIdOf = () => (currentUser ? (currentUser.sub ?? currentUser.id ?? null) : null);
async function cacheSave() {
    try {
        const db = await cacheDb();
        const value = { clientId: currentUser ? (currentUser.clientId ?? null) : null, userId: userIdOf(), data, at: Date.now() };
        await new Promise((resolve, reject) => {
            const tx = db.transaction('kv', 'readwrite');
            tx.objectStore('kv').put(value, 'data');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch { /* sin almacenamiento: se bajan otra vez la próxima */ }
}
async function cacheRead() {
    const db = await cacheDb();
    return new Promise((resolve, reject) => {
        const req = db.transaction('kv', 'readonly').objectStore('kv').get('data');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}
async function getJson(path) {
    const res = await fetch(apiUrl(path), { credentials: 'include', cache: 'no-store' });
    if (res.status === 401) { window.location.replace('Login.html'); throw new Error('unauthorized'); }
    if (res.status === 403) { const err = new Error('forbidden'); err.forbidden = true; throw err; }
    if (!res.ok) throw new Error('load failed');
    return res.json();
}
async function loadData() {
    const clientId = currentUser ? (currentUser.clientId ?? null) : null;
    try {
        const out = await getJson(`${API}?day=${todayYmd()}`);
        data = { activities: out.activities || [], me: out.me || data.me, sites: out.sites || [], today: out.today || null };
        dataState = 'online';
        cacheSave();
        return;
    } catch (err) {
        if (err && err.forbidden) { dataState = 'forbidden'; return; }
    }
    try {
        const saved = await cacheRead();
        // lo guardado solo sirve si es de la misma empresa y la misma persona (otra cuenta en el mismo celular no ve actividades ajenas)
        if (saved && (saved.clientId ?? null) === clientId && (saved.userId ?? null) === userIdOf() && saved.data) {
            data = saved.data;
            dataState = 'cached';
            return;
        }
    } catch { /* sin datos guardados */ }
    dataState = 'none';
}

// --- Hacer un movimiento (con la cola sin señal) -------------------------------------------------------------------------------------------
function errorText(result) {
    const code = result && result.body && result.body.code;
    if (code) { const key = `main.twErr_${code}`; const text = t(key); if (text !== key) return text; }
    return t('main.twErr_default');
}
async function perform(a, action, body, doneKey) {
    const description = `${t('menu.teamWork')} · ${a.title}`;
    try {
        const result = await sync().offlineAwareFetch(
            `${API}/${a.id}/${action}`,
            { method: 'POST', headers: JSON_HEADERS, credentials: 'include', body: JSON.stringify(body || {}) },
            description, `${RECORD_PREFIX}:${a.id}`, undefined, { rejectable: true },
        );
        if (result.queued) {
            // sin señal: el movimiento queda en el celular (se ve aplicado, marcado «En tu celular») y se envía solo al volver la conexión
            await refreshQueued();
            showToast(t('home.twappSavedOffline'));
            render();
            return;
        }
        if (!result.ok) {
            showToast(errorText(result));
            if ([403, 404, 409].includes(result.status)) { await loadData(); await refreshQueued(); render(); }
            return;
        }
        // el servidor devuelve la actividad ya al día: se cambia en la lista y se vuelve a pedir todo sin esperar
        if (result.body && result.body.activity) {
            const i = data.activities.findIndex((x) => x.id === a.id);
            if (i >= 0) data.activities[i] = result.body.activity;
            if (detailEvents && detailEvents.id === a.id && result.body.activity.events) detailEvents = { id: a.id, events: result.body.activity.events };
        }
        if (doneKey) showToast(t(doneKey));
        render();
        cacheSave();
        loadData().then(() => render()).catch(() => {});
    } catch {
        showToast(t('admin.saveError'));
    }
}
// AppOfflineSync avisa cada 30 s aunque nada haya cambiado: solo se vuelve a dibujar si cambió lo que esta pantalla tenía en la cola
document.addEventListener('sgn:offline-queue-changed', async () => {
    const before = pending.size + (pendingDay ? 1 : 0);
    const changed = await refreshQueued();
    if (!changed) return;
    // al reconectar la cola se vacía: se vuelve a pedir la lista para ver lo enviado ya aplicado
    if (pending.size + (pendingDay ? 1 : 0) < before && navigator.onLine) await loadData();
    render();
});
document.addEventListener('sgn:offline-rejected', () => { render(); });

// --- Hojas desde abajo: motivo y «dónde trabajo hoy» -------------------------------------------------------------------------------------------
function openSheet(title, subtitle, buildBody, onSave, saveKey) {
    const overlay = el('div', 'home-sheet-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const sheet = el('div', 'home-sheet twapp-sheet');
    sheet.appendChild(el('div', 'home-sheet-handle'));
    sheet.appendChild(el('h3', 'home-sheet-title', title));
    if (subtitle) sheet.appendChild(el('p', 'home-sheet-subtitle', subtitle));
    const body = buildBody();
    sheet.appendChild(body.node);
    const error = el('p', 'twapp-error');
    error.hidden = true;
    sheet.appendChild(error);
    const row = el('div', 'twapp-sheet-actions');
    const cancel = el('button', 'home-carga-secondary-btn', t('main.wpCancel'));
    cancel.type = 'button';
    const save = el('button', 'twapp-btn go', t(saveKey || 'main.wpSave'));
    save.type = 'button';
    row.append(cancel, save);
    sheet.appendChild(row);
    overlay.appendChild(sheet);
    const close = () => overlay.remove();
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    save.addEventListener('click', async () => {
        const problem = body.validate ? body.validate() : '';
        if (problem) { error.textContent = problem; error.hidden = false; return; }
        close();
        await onSave(body.value());
    });
    document.body.appendChild(overlay);
    if (body.focus) setTimeout(body.focus, 50);
}
// una pregunta corta con su motivo (pausar, regresar, rechazar un pase)
function askReason(title, subtitle, required, onOk) {
    openSheet(title, subtitle, () => {
        const wrap = el('div', 'relapp-field');
        const label = el('label', '', t(required ? 'main.twReason' : 'main.twComment'));
        label.setAttribute('for', 'twapp-reason');
        const input = el('input', 'relapp-input');
        input.id = 'twapp-reason';
        input.type = 'text';
        input.maxLength = 300;
        input.autocomplete = 'off';
        wrap.append(label, input);
        return { node: wrap, value: () => input.value.trim(), focus: () => input.focus(), validate: () => (required && !input.value.trim() ? t('main.twErr_TEAM_REASON_REQUIRED') : '') };
    }, onOk);
}
function placeLabel(p) {
    if (!p || !p.place) return t('main.twPlaceNone');
    if (p.place === 'site') return p.siteName ? t('main.twPlaceAt', { place: t('main.twPlace_site'), site: p.siteName }) : t('main.twPlace_site');
    if (p.place === 'absent') return `${t('main.twPlace_absent')}${p.absence ? ` · ${t(`main.twAbsence_${p.absence}`)}` : ''}`;
    return t(`main.twPlace_${p.place}`);
}
function workdaySheet() {
    const mine = todayPeople().find((p) => p.isMe) || {};
    let place = mine.place || '';
    openSheet(t('main.twDayWhereSelf'), '', () => {
        const wrap = el('div', 'twapp-day');
        const pills = el('div', 'wpapp-filters twapp-wrap');
        const siteField = el('div', 'relapp-field');
        const siteLabel = el('label', '', t('main.twDayUnit'));
        siteLabel.setAttribute('for', 'twapp-site');
        const site = el('select', 'relapp-input');
        site.id = 'twapp-site';
        site.innerHTML = `<option value="">—</option>${data.sites.map((s) => `<option value="${s.id}"${Number(mine.siteId) === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}`;
        siteField.append(siteLabel, site);
        const absField = el('div', 'relapp-field');
        const absLabel = el('label', '', t('main.twDayAbsence'));
        absLabel.setAttribute('for', 'twapp-absence');
        const absence = el('select', 'relapp-input');
        absence.id = 'twapp-absence';
        absence.innerHTML = ABSENCES.map((a) => `<option value="${a}"${(mine.absence || 'other') === a ? ' selected' : ''}>${esc(t(`main.twAbsence_${a}`))}</option>`).join('');
        absField.append(absLabel, absence);
        const draw = () => {
            pills.innerHTML = '';
            PLACES.forEach((p) => {
                const b = el('button', `wpapp-pill${place === p ? ' active' : ''}`, t(`main.twPlace_${p}`));
                b.type = 'button';
                b.setAttribute('aria-pressed', String(place === p));
                b.addEventListener('click', () => { place = p; draw(); });
                pills.appendChild(b);
            });
            siteField.hidden = place !== 'site';
            absField.hidden = place !== 'absent';
        };
        draw();
        wrap.append(pills, siteField, absField);
        return {
            node: wrap,
            validate: () => (!place || (place === 'site' && !site.value) || (place === 'absent' && !absence.value) ? t('main.twErr_TEAM_WORKDAY_INVALID') : ''),
            value: () => ({ day: todayYmd(), place, ...(place === 'site' ? { siteId: Number(site.value) } : {}), ...(place === 'absent' ? { absence: absence.value } : {}) }),
        };
    }, saveWorkday);
}
async function saveWorkday(body) {
    const description = `${t('menu.teamWork')} · ${t('main.twDayTitle')}`;
    try {
        const result = await sync().offlineAwareFetch(`${API}/workday`, { method: 'PUT', headers: JSON_HEADERS, credentials: 'include', body: JSON.stringify(body) }, description, `${RECORD_PREFIX}:workday:${body.day}`, undefined, { rejectable: true });
        if (result.queued) { await refreshQueued(); showToast(t('home.twappSavedOffline')); render(); return; }
        if (!result.ok) { showToast(errorText(result)); return; }
        showToast(t('main.twDaySaved'));
        await loadData();
        render();
    } catch {
        showToast(t('admin.saveError'));
    }
}

// --- Lo que se dibuja ---------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
document.getElementById('carga-progress-track').hidden = true;
document.getElementById('carga-progress-label').hidden = true;

function render() {
    bodyEl.innerHTML = '';
    if (screen === 'detail') renderDetail(); else renderList();
}
function renderRejectedBanner() {
    const prefix = `${t('menu.teamWork')} ·`;
    const rejected = sync().listRejected().filter((r) => String(r.description || '').startsWith(prefix));
    if (!rejected.length) return;
    const box = el('div', 'relapp-rejected');
    box.innerHTML = `<b><i class="bx bx-error-circle" aria-hidden="true"></i> ${esc(t('home.relappRejectedTitle'))}</b>${rejected.map((r) => `<p>${esc(r.description)}${r.message ? ` — ${esc(r.message)}` : ''}</p>`).join('')}<button type="button" class="home-carga-secondary-btn">${esc(t('home.relappRejectedOk'))}</button>`;
    box.querySelector('button').addEventListener('click', () => { sync().clearRejected(); });
    bodyEl.appendChild(box);
}
const pill = (label, active, onClick, helpKey) => {
    const b = el('button', `wpapp-pill${active ? ' active' : ''}`, label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(active));
    if (helpKey) b.setAttribute('data-help-key', helpKey);
    b.addEventListener('click', onClick);
    return b;
};
function matchesQuery(query, text) { return !query.trim() || window.SearchSyntax.matches('contains', query, text); }
const searchText = (a) => [a.title, a.description, a.area, (a.sites || []).map((s) => s.name).join(' '), (a.assignees || []).map((x) => x.name).join(' '), t(`main.twKind_${a.kind}`), a.plan ? `${a.plan.planTitle} ${a.plan.itemTitle}` : ''].join(' ');
function searchNode(value, onInput) {
    const input = el('input', 'pm-app-input wpapp-search');
    input.type = 'search';
    input.placeholder = t('home.twappSearch');
    input.setAttribute('aria-label', t('home.twappSearch'));
    input.value = value;
    let timer = 0;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => onInput(input.value), 150); });
    return input;
}
const lateOf = (a, today) => !!a.dueDate && a.status !== 'done' && a.dueDate < today;
const DOT = { unassigned: 'bx-user-plus', assigned: 'bx-circle', confirmed: 'bx-radio-circle-marked', in_progress: 'bx-time-five', paused: 'bx-pause-circle', review: 'bx-show', done: 'bx-check-circle' };

// los botones de una actividad: lo que el servidor dice que esta persona puede hacer (can). Pasar, cambiar, asignar y cancelar se quedan en la Web.
function actionList(a) {
    const c = a.can || {};
    const out = [];
    if (c.claim) out.push(['claim', true]);
    if (c.confirm) out.push(['confirm', true]);
    if (c.start) out.push(['start', !c.confirm]);
    if (c.resume) out.push(['resume', true]);
    if (c.submit) out.push(['submit', true]);
    if (c.validate) out.push(['validate', true]);
    if (c.pause) out.push(['pause', false]);
    if (c.returnIt) out.push(['return', false]);
    return out;
}
function runAction(a, op) {
    if (op === 'pause') { askReason(t('main.twReasonPause'), a.title, true, (reason) => perform(a, 'pause', { reason })); return; }
    if (op === 'return') { askReason(t('main.twReasonReturn'), a.title, true, (reason) => perform(a, 'return', { reason })); return; }
    perform(a, op, {}, op === 'claim' ? 'main.twClaimed' : '');
}
function actionsNode(a) {
    const list = actionList(a);
    if (!list.length) return null;
    const box = el('div', 'twapp-acts');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', a.title);
    box.setAttribute('data-help-key', 'appTwActions');
    list.forEach(([op, primary]) => {
        const b = el('button', `twapp-btn${primary ? ' go' : ''}`, t(`main.twAct_${op}`));
        b.type = 'button';
        b.addEventListener('click', (event) => { event.stopPropagation(); b.disabled = true; runAction(a, op); setTimeout(() => { b.disabled = false; }, 600); });
        box.appendChild(b);
    });
    return box;
}
function chipsOf(a, today, shown) {
    const chips = el('span', 'wpapp-chips');
    chips.appendChild(el('span', 'wpapp-chip', t(`main.twKind_${a.kind}`)));
    if (a.urgent) chips.appendChild(el('span', 'wpapp-chip wpapp-chip-late', `⚡ ${t('main.twUrgentTag')}`));
    const state = shown === 'mine' ? (a.myStatus || a.status) : a.status;
    chips.appendChild(el('span', `wpapp-chip wpapp-chip-${state === 'review' || state === 'paused' ? 'in_progress' : state}`, shown === 'mine' ? t(`main.twPs_${state}`) : t(`main.twLane_${state}`)));
    if (a.dueDate) { const late = lateOf(a, today); chips.appendChild(el('span', `wpapp-chip${late ? ' wpapp-chip-late' : ''}`, t(late ? 'main.twDueLate' : 'main.twDue', { date: shortDate(a.dueDate) }))); }
    if (a.repeat) chips.appendChild(el('span', `wpapp-chip${a.repeat.waiting ? ' wpapp-chip-warn' : ''}`, `↻ ${repeatText(a.repeat.unit, a.repeat.every)}`));
    if (a.queued) chips.appendChild(el('span', 'pm-app-pill pm-app-pill-queued', t('home.incOnPhone')));
    return chips;
}
function peopleLine(a) {
    if (!a.assignees.length) return t('main.twNoPeople');
    return a.assignees.map((x) => (x.isMe ? t('home.twappYou') : x.name)).join(' + ');
}
function cardNode(a, today, shown) {
    const done = a.status === 'done';
    const card = el('div', `wpapp-row twapp-card${lateOf(a, today) ? ' late' : ''}${done ? ' done' : ''}`);
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', a.title);
    card.setAttribute('data-help-key', 'appTwRow');
    const state = shown === 'mine' ? (a.myStatus || a.status) : a.status;
    card.appendChild(el('i', `bx ${DOT[state] || DOT.assigned} wpapp-dot twapp-dot-${state}`));
    const main = el('button', 'wpapp-main');
    main.type = 'button';
    main.setAttribute('aria-label', a.title);
    const title = el('span', 'wpapp-title');
    title.appendChild(el('b', '', a.title));
    const sub = [peopleLine(a), (a.sites || []).map((s) => s.name).join(', '), a.plan ? a.plan.itemTitle : ''].filter(Boolean).join(' · ');
    main.append(title, el('span', 'wpapp-crumbs', sub), chipsOf(a, today, shown));
    main.addEventListener('click', () => openDetail(a.id));
    card.appendChild(main);
    const acts = actionsNode(a);
    if (acts) card.appendChild(acts);
    return card;
}
function sortActivities(list) {
    return list.slice().sort((x, y) => (y.urgent ? 1 : 0) - (x.urgent ? 1 : 0) || (x.dueDate && y.dueDate ? (x.dueDate < y.dueDate ? -1 : x.dueDate > y.dueDate ? 1 : 0) : (x.dueDate ? -1 : y.dueDate ? 1 : 0)) || y.id - x.id);
}

// las tres pestañas (la de Pendientes solo cuando hay algo; la de Equipo solo si hay algo que no es mío o tengo gente a cargo)
function todoCounts(all) {
    return {
        validate: all.filter((a) => a.can && a.can.validate),
        passes: all.flatMap((a) => (a.passes || []).filter((p) => p.canResolve).map((p) => ({ pass: p, activity: a }))),
        claim: all.filter((a) => a.can && a.can.claim),
    };
}
function tabsNode(all) {
    const todo = todoCounts(all);
    const todoN = todo.validate.length + todo.passes.length + todo.claim.length;
    const hasTeam = !!data.me.hasTeam || data.me.isAdmin || all.some((a) => !a.myStatus);
    const tabs = [['mine', t('home.twappTabMine'), all.filter((a) => a.myStatus && a.myStatus !== 'done').length]];
    if (todoN || tab === 'todo') tabs.push(['todo', t('home.twappTabTodo'), todoN]);
    if (hasTeam) tabs.push(['team', t('home.twappTabTeam'), all.filter((a) => a.status !== 'done').length]);
    if (!tabs.some(([k]) => k === tab)) tab = 'mine';
    if (tabs.length === 1) return null;
    const box = el('div', 'wpapp-tabs');
    box.setAttribute('role', 'tablist');
    box.setAttribute('data-help-key', 'appTwTabs');
    box.setAttribute('aria-label', t('menu.teamWork'));
    tabs.forEach(([key, label, n]) => {
        const b = el('button', `wpapp-tab${tab === key ? ' active' : ''}`);
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(tab === key));
        b.append(el('span', '', label), el('i', '', String(n)));
        b.addEventListener('click', () => { tab = key; render(); });
        box.appendChild(b);
    });
    return box;
}
function todayCard() {
    const me = todayPeople().find((p) => p.isMe);
    if (!data.today || !me) return null;
    const card = el('div', 'pm-app-card twapp-today');
    card.setAttribute('data-help-key', 'appTwToday');
    const text = el('div', 'twapp-today-text');
    text.append(el('small', '', t('home.twappToday')), el('b', '', placeLabel(me)));
    if (me.queued) text.appendChild(el('span', 'pm-app-pill pm-app-pill-queued', t('home.incOnPhone')));
    const btn = el('button', 'twapp-btn', t(me.place ? 'home.twappChange' : 'main.twDayAsk'));
    btn.type = 'button';
    btn.addEventListener('click', workdaySheet);
    card.append(text, btn);
    return card;
}

function renderList() {
    titleEl.textContent = t('menu.teamWork');
    renderRejectedBanner();
    if (dataState === 'forbidden') { bodyEl.appendChild(el('p', 'home-carga-empty-note', t('main.twErr_TEAM_FORBIDDEN'))); return; }
    if (dataState === 'cached') bodyEl.appendChild(el('p', 'pm-app-note', t('home.twappCached')));
    if (dataState === 'none') { bodyEl.appendChild(el('p', 'home-carga-empty-note', t('home.twappNoData'))); return; }
    const all = activities();
    const tabs = tabsNode(all);
    if (tabs) bodyEl.appendChild(tabs);
    else tab = 'mine';
    if (tab === 'todo') renderTodo(all); else if (tab === 'team') renderTeam(all); else renderMine(all);
    if (listScroll) { const y = listScroll; listScroll = 0; setTimeout(() => { bodyEl.scrollTop = y; }, 0); }
}

function renderMine(all) {
    const today = todayYmd();
    const mineAll = all.filter((a) => a.myStatus);
    const counts = { open: mineAll.filter((a) => a.myStatus !== 'done').length, done: mineAll.filter((a) => a.myStatus === 'done').length, all: mineAll.length };
    const card = todayCard();
    if (card) bodyEl.appendChild(card);
    const filters = el('div', 'wpapp-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('data-help-key', 'appTwFilter');
    filters.setAttribute('aria-label', t('home.twappFilterName'));
    [['open', 'home.twappFilterOpen'], ['done', 'home.twappFilterDone'], ['all', 'home.twappFilterAll']].forEach(([k, l]) => filters.appendChild(pill(`${t(l)} · ${counts[k]}`, mineFilter === k, () => { mineFilter = k; render(); })));
    bodyEl.appendChild(filters);
    const host = el('div');
    const draw = () => {
        host.innerHTML = '';
        const shown = mineAll.filter((a) => matchesQuery(mineQuery, searchText(a)) && (mineFilter === 'all' || (mineFilter === 'open' ? a.myStatus !== 'done' : a.myStatus === 'done')));
        if (!mineAll.length) { host.appendChild(el('p', 'home-carga-empty-note', t('home.twappMineEmpty'))); return; }
        if (!shown.length) { host.appendChild(el('p', 'home-carga-empty-note', t(mineQuery.trim() ? 'main.wpNoMatches' : 'home.twappNone'))); return; }
        let drawn = 0;
        MINE_ORDER.forEach((st) => {
            const list = sortActivities(shown.filter((a) => a.myStatus === st));
            if (!list.length || drawn >= MAX_ROWS) return;
            host.appendChild(el('h4', 'wpapp-group', `${t(`home.twappGroup_${st}`)} · ${list.length}`));
            list.slice(0, MAX_ROWS - drawn).forEach((a) => host.appendChild(cardNode(a, today, 'mine')));
            drawn += list.length;
        });
        if (shown.length > MAX_ROWS) host.appendChild(el('p', 'pm-app-note', t('home.wpappShowing', { n: MAX_ROWS, total: shown.length })));
    };
    bodyEl.appendChild(searchNode(mineQuery, (v) => { mineQuery = v; draw(); }));
    bodyEl.appendChild(host);
    draw();
}

function passCardNode(entry) {
    const { pass: p, activity: a } = entry;
    const card = el('div', 'pm-app-card twapp-pass');
    card.setAttribute('data-help-key', 'appTwPass');
    card.appendChild(el('b', 'pm-app-title', a.title));
    card.appendChild(el('span', 'wpapp-crumbs', `${p.fromName} → ${(p.toNames || []).join(', ')}`));
    card.appendChild(el('span', 'wpapp-crumbs', t('main.twPassBy', { name: p.requestedByName, date: whenText(p.requestedAt) })));
    card.appendChild(el('span', 'wpapp-note', t('main.twPassNote', { reason: p.reason })));
    const acts = el('div', 'twapp-acts');
    const approve = el('button', 'twapp-btn go', t('main.twAct_pass_approve'));
    approve.type = 'button';
    approve.addEventListener('click', () => { approve.disabled = true; perform(a, 'pass-approve', { passId: p.id }, 'main.twPassApproved'); });
    const reject = el('button', 'twapp-btn', t('main.twAct_pass_reject'));
    reject.type = 'button';
    reject.addEventListener('click', () => askReason(t('main.twPassRejectTitle'), a.title, false, (reason) => perform(a, 'pass-reject', { passId: p.id, reason })));
    acts.append(approve, reject);
    card.appendChild(acts);
    return card;
}
function renderTodo(all) {
    const today = todayYmd();
    const todo = todoCounts(all);
    if (!todo.validate.length && !todo.passes.length && !todo.claim.length) { bodyEl.appendChild(el('p', 'home-carga-empty-note', t('home.twappTodoEmpty'))); return; }
    const section = (key, count, nodes) => {
        if (!count) return;
        const box = el('div');
        box.setAttribute('data-help-key', 'appTwTodo');
        box.appendChild(el('h4', 'wpapp-group', `${t(key)} · ${count}`));
        nodes.forEach((n) => box.appendChild(n));
        bodyEl.appendChild(box);
    };
    section('home.twappSecValidate', todo.validate.length, sortActivities(todo.validate).slice(0, MAX_ROWS).map((a) => cardNode(a, today, 'team')));
    section('main.twPassTray', todo.passes.length, todo.passes.slice(0, MAX_ROWS).map(passCardNode));
    section('home.twappSecClaim', todo.claim.length, sortActivities(todo.claim).slice(0, MAX_ROWS).map((a) => cardNode(a, today, 'team')));
}

function renderTeam(all) {
    const today = todayYmd();
    const counts = { all: all.length };
    LANES.forEach((l) => { counts[l] = all.filter((a) => a.status === l).length; });
    const filters = el('div', 'wpapp-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('data-help-key', 'appTwFilter');
    filters.setAttribute('aria-label', t('home.twappFilterName'));
    filters.appendChild(pill(`${t('home.twappFilterAll')} · ${counts.all}`, teamLane === 'all', () => { teamLane = 'all'; render(); }));
    LANES.filter((l) => counts[l]).forEach((l) => filters.appendChild(pill(`${t(`main.twLane_${l}`)} · ${counts[l]}`, teamLane === l, () => { teamLane = l; render(); })));
    bodyEl.appendChild(filters);
    const names = new Map();
    all.forEach((a) => a.assignees.forEach((x) => names.set(x.userId, x.isMe ? t('home.twappYou') : x.name)));
    const select = el('select', 'pm-app-input wpapp-person');
    select.setAttribute('aria-label', t('main.twPerson'));
    select.setAttribute('data-help-key', 'appTwPerson');
    select.innerHTML = `<option value="all">${esc(t('main.twPersonAll'))}</option>${[...names.entries()].sort((x, y) => x[1].localeCompare(y[1], localeOf())).map(([id, name]) => `<option value="${id}"${String(teamPerson) === String(id) ? ' selected' : ''}>${esc(name)}</option>`).join('')}`;
    bodyEl.appendChild(select);
    const host = el('div');
    const draw = () => {
        host.innerHTML = '';
        const shown = all.filter((a) => (teamLane === 'all' || a.status === teamLane)
            && (teamPerson === 'all' || a.assignees.some((x) => String(x.userId) === String(teamPerson)))
            && matchesQuery(teamQuery, searchText(a)));
        if (!all.length) { host.appendChild(el('p', 'home-carga-empty-note', t('home.twappTeamEmpty'))); return; }
        if (!shown.length) { host.appendChild(el('p', 'home-carga-empty-note', t(teamQuery.trim() ? 'main.wpNoMatches' : 'home.twappNone'))); return; }
        let drawn = 0;
        LANES.forEach((lane) => {
            const list = sortActivities(shown.filter((a) => a.status === lane));
            if (!list.length || drawn >= MAX_ROWS) return;
            host.appendChild(el('h4', 'wpapp-group', `${t(`main.twLane_${lane}`)} · ${list.length}`));
            list.slice(0, MAX_ROWS - drawn).forEach((a) => host.appendChild(cardNode(a, today, 'team')));
            drawn += list.length;
        });
        if (shown.length > MAX_ROWS) host.appendChild(el('p', 'pm-app-note', t('home.wpappShowing', { n: MAX_ROWS, total: shown.length })));
    };
    select.addEventListener('change', () => { teamPerson = select.value; draw(); });
    bodyEl.appendChild(searchNode(teamQuery, (v) => { teamQuery = v; draw(); }));
    bodyEl.appendChild(host);
    draw();
}

// --- El detalle de una actividad ------------------------------------------------------------------------------------------------------------------
function eventText(e) {
    if (/^repeat_/.test(e.event) && String(e.detail || '').includes(':')) { const [unit, every] = e.detail.split(':'); return t(`main.twEv_${e.event}`, { rep: repeatText(unit, Number(every)).toLowerCase() }); }
    return t(`main.twEv_${e.event}`, { name: e.userName || '', to: e.pass ? e.pass.toNames.join(', ') : '' });
}
const NOTE_EVENTS = ['paused', 'returned', 'cancelled', 'pass_requested', 'passed', 'pass_approved', 'pass_rejected', 'pass_cancelled', 'plan_linked'];
async function loadEvents(id) {
    detailEvents = null;
    try {
        const out = await getJson(`${API}/${id}`);
        if (out && out.activity && openId === id) { detailEvents = { id, events: out.activity.events || [] }; if (screen === 'detail') render(); }
    } catch { /* sin señal: el detalle se ve sin la línea del tiempo */ }
}
function openDetail(id) {
    listScroll = bodyEl.scrollTop;
    openId = id;
    screen = 'detail';
    render();
    bodyEl.scrollTop = 0;
    loadEvents(id);
}
function renderDetail() {
    const raw = data.activities.find((x) => x.id === openId);
    const a = raw ? effectiveOf(raw) : null;
    if (!a) { screen = 'list'; openId = null; render(); return; }
    titleEl.textContent = a.title;
    const today = todayYmd();
    const head = el('div', 'pm-app-card wpapp-detail');
    head.append(el('b', 'pm-app-title', a.title), chipsOf(a, today, a.myStatus ? 'mine' : 'team'));
    const acts = actionsNode(a);
    if (acts) head.appendChild(acts);
    bodyEl.appendChild(head);
    if (a.description) { const d = el('div', 'pm-app-card'); d.appendChild(el('p', 'wpapp-note', a.description)); bodyEl.appendChild(d); }
    const rows = [
        [t('main.twRealization'), t(`main.twReal_${a.realization}`)],
        (a.sites || []).length ? [t('main.twSite'), a.sites.map((s) => s.name).join(', ')] : null,
        a.area ? [t('main.twArea'), a.area] : null,
        a.dueDate ? [t('main.twF_due'), longDate(a.dueDate)] : null,
        a.plan ? [t('main.twPlan'), `${a.plan.planTitle} › ${a.plan.itemTitle}`] : null,
        a.repeat ? [t('main.twF_repeat'), `${repeatText(a.repeat.unit, a.repeat.every)} · ${t('main.twRepNext', { date: shortDate(a.repeat.nextDue) })}`] : null,
        [t(a.autoBorn ? 'home.twappCreatedAuto' : 'home.twappCreatedBy'), `${a.createdBy.name} · ${whenText(a.createdAt)}`],
    ].filter(Boolean);
    const meta = el('div', 'pm-app-meta');
    meta.innerHTML = rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    bodyEl.appendChild(meta);
    // las personas y en qué va cada una
    bodyEl.appendChild(el('h4', 'wpapp-group', t('main.twD_assignees')));
    if (!a.assignees.length) bodyEl.appendChild(el('p', 'home-carga-empty-note', `${t('main.twNoPeople')} · ${t('main.twSeats', { n: a.seatsNeeded })}`));
    a.assignees.forEach((x) => {
        const line = el('div', 'pm-app-line');
        line.appendChild(el('span', 'wpapp-avatar', initials(x.name)));
        const main = el('div', 'pm-app-line-main');
        main.appendChild(el('p', '', `${x.isMe ? t('home.twappYou') : x.name}${x.isPrincipal ? ` · ${t('main.twPrincipal')}` : ''}`));
        main.appendChild(el('span', '', `${t(`main.twPs_${x.status}`)}${x.status === 'paused' && x.pauseReason ? ` · ${x.pauseReason}` : ''}`));
        line.appendChild(main);
        bodyEl.appendChild(line);
    });
    // los pases que espera esta actividad (si me toca resolverlos, con sus botones)
    const passes = (a.passes || []);
    if (passes.length) {
        bodyEl.appendChild(el('h4', 'wpapp-group', t('main.twPasses')));
        passes.forEach((p) => {
            if (p.canResolve) { bodyEl.appendChild(passCardNode({ pass: p, activity: a })); return; }
            const info = el('div', 'pm-app-card');
            info.appendChild(el('span', 'wpapp-crumbs', t('main.twPassPending', { to: (p.toNames || []).join(', '), name: p.approverName })));
            bodyEl.appendChild(info);
        });
    }
    // la línea del tiempo (solo con señal)
    bodyEl.appendChild(el('h4', 'wpapp-group', t('main.twD_timeline')));
    if (!detailEvents || detailEvents.id !== a.id) { bodyEl.appendChild(el('p', 'pm-app-note', t(navigator.onLine ? 'home.twappLoading' : 'home.twappNoTimeline'))); return; }
    const list = el('ol', 'twapp-events');
    list.setAttribute('data-help-key', 'appTwTimeline');
    detailEvents.events.forEach((e) => {
        const li = el('li', 'twapp-ev');
        li.appendChild(el('b', '', eventText(e)));
        li.appendChild(el('small', '', `${e.actorName || t('main.twAuto')} · ${whenText(e.createdAt)}`));
        if (e.detail && NOTE_EVENTS.includes(e.event)) li.appendChild(el('span', 'twapp-ev-note', e.detail));
        list.appendChild(li);
    });
    bodyEl.appendChild(list);
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (screen === 'detail') { screen = 'list'; openId = null; detailEvents = null; render(); return; }
    window.location.href = 'AppInicio.html';
});

(async function init() {
    await loadLanguage();
    window.HelpMode?.init(t);
    try {
        const meRes = await fetch(apiUrl('/api/me'), { credentials: 'include' });
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        currentUser = user;
        if (!user || !user.clientId) { window.location.replace('AppInicio.html'); return; } // las cuentas de SaaS no tienen equipo de trabajo
        await loadBrandingForTheme();
        applyStyle(getStoredStyle());
        await refreshQueued();
        await loadData();
        render();
        // un aviso de la campana abre la actividad (#actividad-<id>)
        const wanted = /^#actividad-(\d+)$/.exec(window.location.hash);
        if (wanted && data.activities.some((a) => a.id === Number(wanted[1]))) openDetail(Number(wanted[1]));
    } catch (err) {
        console.error('Equipo de Trabajo (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
