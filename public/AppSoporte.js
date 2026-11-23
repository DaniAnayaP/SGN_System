// ---------------------------------------------------------------------------
// Soporte (App) — la misma pantalla «Soporte» de la Web (la pestaña Soporte de la campana, para todos los usuarios de la empresa) hecha para el celular. Esta primera pieza lleva lo de todos los días:
//   · «Mis solicitudes»: las que abrió esta persona, con su estatus, nivel y quién las atiende; tocar una abre su caso: lo que se pidió, el chat con la Mesa de ayuda (se lee y se escribe) y lo que ha pasado con el caso.
//   · «Nueva solicitud»: el mismo formulario de la Web (qué pasó, pantalla y acción, categoría, qué implica, cuándo afecta y si puede seguir trabajando; la prioridad y el nivel de entrada se calculan en vivo con las mismas
//     reglas) con las evidencias que pide la categoría: se escriben o se adjuntan con la cámara o la galería. La grabación de pantalla no va en la App.
//   · Pieza 2: calificar la atención (estrellas, etiquetas y comentario) cuando el caso se resuelve, reabrir un caso cerrado (dentro de los días que da GEIPSA) y mandar y ver fotos y archivos dentro del chat.
//   La ayuda rápida, la campana de la App, Mi cola y Soportes cerrados se quedan en la Web por ahora (siguientes piezas).
// Sin señal funciona: lo último que se bajó se guarda en el celular; una solicitud nueva o un mensaje escritos sin señal esperan en la cola (AppOfflineSync.js, recordKey «soporte:new:<hora>», «soporte:msg:<caso>», «soporte:rate:<caso>» y «soporte:reopen:<caso>») marcados
// «En tu celular»; las fotos y archivos (al pedir soporte y dentro del chat) solo se pueden mandar con señal (el caso todavía no existe para el servidor). Si al reconectar el servidor rechaza alguno se avisa en «No se aplicó». El servidor es el mismo de la Web
// (/api/business/my-support*, /api/business/support-cases/:id y /messages). Quien no tiene la pestaña Soporte en el árbol (Notificaciones › Soporte) no ve la pantalla.
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
const API = '/api/business/my-support';
const CASES = '/api/business/support-cases';
const RECORD_PREFIX = 'soporte';
const NEW_URL = /\/api\/business\/my-support$/;                       // una solicitud nueva que espera sin señal
const MSG_URL = /\/api\/business\/support-cases\/(\d+)\/messages$/;   // un mensaje del chat que espera sin señal
const RATE_URL = /\/api\/business\/support-cases\/(\d+)\/ratings$/;   // una calificación que espera sin señal
const REOPEN_URL = /\/api\/business\/support-cases\/(\d+)\/reopen$/;   // un «reabrir» que espera sin señal
const WHEN_KEYS = ['now', 'today', 'week', 'none'];
const SHOWN_EVENTS = ['created', 'first_response', 'file', 'taken', 'assigned', 'moved', 'status_changed', 'resolved', 'closed', 'reopened', 'rated', 'paused', 'resumed'];
let currentUser = null;
let mineData = { cases: [], helpDesk: [], provider: false };
let formOptions = null;                        // lo que pide el formulario (categorías, impactos, pantallas): se guarda también en el celular
let dataState = 'loading';                     // 'loading' | 'online' | 'cached' | 'none' | 'forbidden'
let screen = 'list';                           // 'list' | 'case' | 'form'
let openId = null;
let detail = null;                             // el caso abierto (GET /support-cases/:id)
let messages = [];
let form = null;
let pendingNew = [];                           // solicitudes nuevas guardadas sin señal que siguen en la cola
let pendingMsgs = new Map();                   // caseId -> mensajes guardados sin señal que siguen en la cola
let pollTimer = null;
let listScroll = 0;
let ratings = null;                            // lo de calificar del caso abierto (GET /support-cases/:id/ratings)
let pendingRates = new Set();                  // casos con una calificación guardada sin señal
let pendingReopens = new Set();                // casos con un «reabrir» guardado sin señal
let attach = null;                             // el archivo que se va a mandar en el chat: { blob, name }
let reopenText = '';
let rateForm = { stars: 0, tags: new Set(), comment: '' };

const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };
const sync = () => window.SgnOfflineSync;
const localeOf = () => (currentLang() === 'es' ? 'es-MX' : 'en-US');
const fmtTime = (iso) => new Date(iso).toLocaleString(localeOf(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
function friendlyMinutes(m) {
    const n = Number(m);
    if (!n) return t('main.msNoLimit');
    if (n % 1440 === 0) return `${n / 1440} d`;
    if (n % 60 === 0) return `${n / 60} h`;
    return `${n} min`;
}

// --- Lo que se mandó sin señal y sigue en la cola ----------------------------------------------------------------------------------------
const parseBody = (item) => { try { return JSON.parse(item.body || '{}'); } catch { return null; } };
async function refreshQueued() {
    let queue = [];
    try { queue = await sync().listOfflineQueue(); } catch { queue = []; }
    const nextNew = []; const nextMsgs = new Map(); const nextRates = new Set(); const nextReopens = new Set();
    queue.forEach((item) => {
        if (item.method !== 'POST' || !item.url) return;
        const body = parseBody(item);
        if (!body) return;
        if (NEW_URL.test(item.url) && body.summary) nextNew.push({ id: item.id, summary: body.summary, at: item.createdAt || item.queuedAt || null });
        const m = MSG_URL.exec(item.url);
        if (m && (body.body || body.fileId)) { const list = nextMsgs.get(Number(m[1])) || []; list.push({ id: item.id, body: body.body || '📎' }); nextMsgs.set(Number(m[1]), list); }
        const r = RATE_URL.exec(item.url); if (r && body.stars) nextRates.add(Number(r[1]));
        const ro = REOPEN_URL.exec(item.url); if (ro) nextReopens.add(Number(ro[1]));
    });
    const sig = (n, m, ra, re) => JSON.stringify([n.map((x) => x.id), [...m].map(([k, v]) => [k, v.map((x) => x.id)]), [...ra].sort(), [...re].sort()]);
    const changed = sig(nextNew, nextMsgs, nextRates, nextReopens) !== sig(pendingNew, pendingMsgs, pendingRates, pendingReopens);
    pendingNew = nextNew; pendingMsgs = nextMsgs; pendingRates = nextRates; pendingReopens = nextReopens;
    return changed;
}

// --- Carga: lo último que se bajó se guarda en el celular para verlo también sin señal ---------------------------------------------------
function cacheDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('sgn-sp-cache', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function cacheSave() {
    try {
        const db = await cacheDb();
        const value = { clientId: currentUser ? (currentUser.clientId ?? null) : null, userId: currentUser ? (currentUser.sub ?? currentUser.id ?? null) : null, mine: mineData, form: formOptions, at: Date.now() };
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
    const res = await fetch(apiUrl(path), { credentials: 'include' });
    if (res.status === 401) { window.location.replace('Login.html'); throw new Error('unauthorized'); }
    if (res.status === 403) { const err = new Error('forbidden'); err.forbidden = true; throw err; }
    if (!res.ok) { const err = new Error('load failed'); err.status = res.status; throw err; }
    return res.json();
}
// el formulario: categorías, impactos, topes y la lista de pantallas del sistema (las mismas de la Web)
async function loadFormOptions() {
    const o = await getJson(`${API}/form`);
    let screens = [];
    try {
        const list = (await getJson(`${API}/screens`)).screens || [];
        const base = list.map((s) => `${t(s.labelKey)}${s.categoryLabelKey ? ` · ${t(s.categoryLabelKey)}` : ''}`);
        const count = new Map();
        base.forEach((b) => count.set(b, (count.get(b) || 0) + 1));
        screens = list.map((s, i) => ({ ...s, label: count.get(base[i]) > 1 ? `${base[i]} (${String(s.nodeId).replace(/^cat-[a-z]+-/, '')})` : base[i] }));
    } catch { /* sin lista: se escribe con palabras */ }
    formOptions = { ...o, screens };
}
async function loadData() {
    const clientId = currentUser ? (currentUser.clientId ?? null) : null;
    try {
        mineData = await getJson(API);
        dataState = 'online';
        try { await loadFormOptions(); } catch { /* el formulario se pide otra vez al abrirlo */ }
        cacheSave();
        return;
    } catch (err) {
        if (err && err.forbidden) { dataState = 'forbidden'; return; }
    }
    try {
        const saved = await cacheRead();
        // lo guardado solo sirve si es de la misma empresa y la misma persona (otra cuenta en el mismo celular no ve solicitudes ajenas)
        const userId = currentUser ? (currentUser.sub ?? currentUser.id ?? null) : null;
        if (saved && (saved.clientId ?? null) === clientId && (saved.userId ?? null) === userId) {
            mineData = saved.mine || mineData;
            formOptions = saved.form || formOptions;
            dataState = 'cached';
            return;
        }
    } catch { /* sin datos guardados */ }
    dataState = 'none';
}
document.addEventListener('sgn:offline-queue-changed', async () => {
    const hadNew = pendingNew.length; const hadMsgs = pendingMsgs.size; const hadOther = pendingRates.size + pendingReopens.size;
    const changed = await refreshQueued();
    if (!changed) return;
    // al reconectar la cola se vacía: se vuelve a pedir lo que se mandó para verlo ya aplicado
    if ((pendingNew.length < hadNew || pendingMsgs.size < hadMsgs || pendingRates.size + pendingReopens.size < hadOther) && navigator.onLine) {
        await loadData();
        if (screen === 'case' && openId) await loadCase(openId, { quiet: true });
    }
    if (screen !== 'form') render();
});
document.addEventListener('sgn:offline-rejected', () => { if (screen !== 'form') render(); });

// --- Lo que se dibuja ---------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
document.getElementById('carga-progress-track').hidden = true;
document.getElementById('carga-progress-label').hidden = true;

function render() {
    stopPolling();
    bodyEl.innerHTML = '';
    if (screen === 'form') renderForm();
    else if (screen === 'case') renderCase();
    else renderList();
}
function renderRejectedBanner() {
    const prefix = `${t('menu.support')} ·`;
    const rejected = sync().listRejected().filter((r) => String(r.description || '').startsWith(prefix));
    if (!rejected.length) return;
    const box = el('div', 'relapp-rejected');
    box.innerHTML = `<b><i class="bx bx-error-circle" aria-hidden="true"></i> ${esc(t('home.relappRejectedTitle'))}</b>${rejected.map((r) => `<p>${esc(r.description)}${r.message ? ` — ${esc(r.message)}` : ''}</p>`).join('')}<button type="button" class="home-carga-secondary-btn">${esc(t('home.relappRejectedOk'))}</button>`;
    box.querySelector('button').addEventListener('click', () => { sync().clearRejected(); });
    bodyEl.appendChild(box);
}
const chip = (text, cls) => el('span', `wpapp-chip${cls ? ` ${cls}` : ''}`, text);

// ---- La lista: mis solicitudes ------------------------------------------------------------------------------------------------------------
function renderList() {
    titleEl.textContent = t('menu.support');
    renderRejectedBanner();
    if (dataState === 'loading') { bodyEl.appendChild(el('p', 'home-empty', t('admin.loading'))); return; }
    if (dataState === 'forbidden') { bodyEl.appendChild(el('p', 'home-empty', t('home.spappForbidden'))); return; }
    if (dataState === 'none') { bodyEl.appendChild(el('p', 'home-empty', t('home.spappNoData'))); return; }
    if (dataState === 'cached') bodyEl.appendChild(el('p', 'spapp-note', t('home.spappCached')));
    const top = el('div', 'spapp-top');
    const newBtn = el('button', 'home-carga-new-btn spapp-new');
    newBtn.type = 'button';
    newBtn.setAttribute('data-help-key', 'appSpNew');
    newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i> ${esc(t('main.spNew'))}`;
    newBtn.addEventListener('click', () => { if (!formOptions) { showToast(t('home.spappNoForm')); return; } openForm(); });
    top.appendChild(newBtn);
    const desk = mineData.helpDesk && mineData.helpDesk.length ? el('p', 'spapp-desk', t('main.soHelpDesk', { names: mineData.helpDesk.join(', ') })) : (mineData.provider ? el('p', 'spapp-desk', t('main.soProvider')) : null);
    if (desk) top.appendChild(desk);
    bodyEl.appendChild(top);
    // lo que se pidió sin señal y todavía no llega
    pendingNew.forEach((p) => {
        const card = el('div', 'wpapp-row spapp-card');
        const main = el('div', 'wpapp-main');
        main.append(el('div', 'wpapp-title', p.summary));
        const chips = el('div', 'wpapp-chips');
        chips.appendChild(chip(t('home.incOnPhone'), 'wpapp-chip-warn'));
        main.appendChild(chips);
        card.appendChild(main);
        bodyEl.appendChild(card);
    });
    const host = el('div', 'spapp-list');
    host.setAttribute('data-help-key', 'appSpList');
    const cases = mineData.cases || [];
    if (!cases.length && !pendingNew.length) host.appendChild(el('p', 'home-empty', t('home.spappEmpty')));
    cases.forEach((c) => {
        const card = el('button', 'wpapp-row spapp-card');
        card.type = 'button';
        const main = el('div', 'wpapp-main');
        const title = el('div', 'wpapp-title');
        title.innerHTML = `<b>${esc(c.folio)}</b> · ${esc(c.summary)}`;
        main.appendChild(title);
        main.appendChild(el('span', 'wpapp-crumbs', `${fmtTime(c.createdAt)}${c.assigneeName ? ` · ${t('main.soAssignee', { name: c.assigneeName })}` : ''}`));
        const chips = el('div', 'wpapp-chips');
        chips.append(chip(t(`main.spStatus_${c.status}`), c.status === 'done' ? 'wpapp-chip-done' : (c.status === 'open' ? '' : 'wpapp-chip-in_progress')), chip(t(`main.sopLevel_${c.level}`)));
        if (c.rateCan) chips.appendChild(chip(t('main.soRateNow'), 'wpapp-chip-warn'));
        main.appendChild(chips);
        if (!c.rateCan && c.reopenCan && c.reopenUntil) main.appendChild(el('span', 'wpapp-crumbs', t('main.soReopenUntil', { when: fmtTime(c.reopenUntil) })));
        card.appendChild(main);
        card.appendChild(el('i', 'bx bx-chevron-right spapp-go'));
        card.addEventListener('click', () => { listScroll = bodyEl.scrollTop; openCase(c.id); });
        host.appendChild(card);
    });
    bodyEl.appendChild(host);
    bodyEl.scrollTop = listScroll;
}

// ---- Un caso: lo que se ve y el chat ------------------------------------------------------------------------------------------------------
async function openCase(id) {
    screen = 'case'; openId = id; detail = null; messages = []; ratings = null; attach = null; reopenText = ''; rateForm = { stars: 0, tags: new Set(), comment: '' };
    render();
    await loadCase(id, {});
}
async function loadCase(id, { quiet }) {
    try {
        const [d, m, rt] = await Promise.all([getJson(`${CASES}/${id}`), getJson(`${CASES}/${id}/messages`), getJson(`${CASES}/${id}/ratings`).catch(() => null)]);
        if (openId !== id) return;
        detail = d; messages = m.messages || []; ratings = rt;
        if (!quiet || screen === 'case') render();
    } catch (err) {
        if (openId !== id) return;
        if (err && err.forbidden) { showToast(t('home.spappCaseForbidden')); goList(); return; }
        if (!detail) showToast(t('home.spappCaseOffline'));
    }
}
function eventText(m) {
    const d = m.eventData || {};
    const author = m.author || '—';
    const lv = (k) => t(`main.sopLevel_${k}`);
    switch (m.eventKey) {
    case 'created': return t('main.spEv_created', { level: lv(d.level || 'n1') });
    case 'first_response': return t('main.spEv_first_response', { author, min: friendlyMinutes(d.minutes) }) + (d.onTime === true ? t('main.spEv_ontime') : (d.onTime === false ? t('main.spEv_late') : ''));
    case 'file': return t('main.spEv_file', { author, name: d.name || '' });
    case 'taken': return t('main.spEv_taken', { author });
    case 'assigned': return t('main.spEv_assigned', { author, to: d.to || '' });
    case 'moved': return (d.solved || d.reason === 'solved') ? t('main.spEv_moved_solved', { author, from: lv(d.from), to: lv(d.to) }) : t(d.direction === 'up' ? 'main.spEv_moved_up' : 'main.spEv_moved_down', { author, from: lv(d.from), to: lv(d.to) });
    case 'status_changed': return t(d.auto ? 'main.spEv_status_auto' : 'main.spEv_status_changed', { author, from: t(`main.spStatus_${d.from}`), to: t(`main.spStatus_${d.to}`) });
    case 'resolved': return t('main.spEv_resolved', { author });
    case 'closed': return d.noresp ? t('main.spEv_closed_noresp', { author, n: d.attempts || 0 }) : t('main.spEv_closed_ok', { author }) + (d.cause ? t('main.spEv_closed_cause', { cause: d.cause }) : '');
    case 'reopened': return d.byTeam ? t('main.spEv_reopened_team', { to: lv(d.to), said: d.said || '' }) : t('main.spEv_reopened_user', { author, said: d.said || '' });
    case 'rated': return t('main.spEv_rated', { author, stars: `${d.stars} ★` });
    case 'paused': return t(d.urgent ? 'main.spEv_paused' : 'main.spEv_paused_plain', { author });
    case 'resumed': return t('main.spEv_resumed', { author });
    default: return '';
    }
}
function messageNode(m) {
    if (m.kind === 'event') {
        if (!SHOWN_EVENTS.includes(m.eventKey)) return null;
        const text = eventText(m);
        if (!text) return null;
        const sep = el('div', 'spapp-sep');
        sep.append(el('span', '', text), el('time', '', fmtTime(m.createdAt)));
        return sep;
    }
    if (m.kind === 'note') return null; // las notas internas no son de quien reportó
    const mine = detail && m.authorId === detail.chat.meId;
    const bub = el('div', `spapp-bub${mine ? ' me' : ''}`);
    const who = el('div', 'spapp-who');
    who.append(el('b', '', m.author || '—'), el('time', '', fmtTime(m.createdAt)));
    bub.appendChild(who);
    if (m.body) bub.appendChild(el('div', 'spapp-txt', m.body));
    if (m.file) bub.appendChild(attachmentNode(m.file));
    return bub;
}
function drawMessages(host) {
    host.innerHTML = '';
    const nodes = messages.map(messageNode).filter(Boolean);
    nodes.forEach((n) => host.appendChild(n));
    (pendingMsgs.get(openId) || []).forEach((p) => {
        const bub = el('div', 'spapp-bub me queued');
        const who = el('div', 'spapp-who');
        who.append(el('b', '', t('home.incOnPhone')));
        bub.append(who, el('div', 'spapp-txt', p.body));
        host.appendChild(bub);
    });
    if (!nodes.length && !(pendingMsgs.get(openId) || []).length) host.appendChild(el('p', 'home-empty', t('main.scNoMessages')));
    host.scrollTop = host.scrollHeight;
}
function renderCase() {
    renderRejectedBanner();
    if (!detail) {
        titleEl.textContent = t('menu.support');
        bodyEl.appendChild(el('p', 'home-empty', t('admin.loading')));
        return;
    }
    const c = detail.case;
    titleEl.textContent = c.folio;
    const head = el('div', 'pm-app-card wpapp-detail');
    head.append(el('b', 'pm-app-title', c.summary));
    const chips = el('div', 'wpapp-chips');
    chips.append(chip(t(`main.spStatus_${c.status}`), c.status === 'done' ? 'wpapp-chip-done' : (c.status === 'open' ? '' : 'wpapp-chip-in_progress')), chip(t(`main.sopLevel_${c.level}`)), chip(t(`main.msPri_${c.priority}`)));
    head.appendChild(chips);
    bodyEl.appendChild(head);
    const impacts = (c.impacts || []).filter((i) => i.level > 0).map((i) => `${i.name}: ${t(`main.spLevel_${i.level}`)}`).join(' · ') || t('main.spLevel_0');
    const rows = [
        [t('main.colSpFechaHora'), fmtTime(c.createdAt)],
        [t('main.cpAssignee'), c.assigneeName || '—'],
        [t('main.spFWhen'), t(`main.spWhen_${c.whenAffects}`)],
        [t('main.spFImpact'), impacts],
    ];
    if (c.errorText) rows.push([t('main.spFError'), c.errorText]);
    const meta = el('div', 'pm-app-meta');
    meta.innerHTML = rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    bodyEl.appendChild(meta);
    const closing = closingCard(c);
    if (closing) bodyEl.appendChild(closing);
    const rating = ratingCard();
    if (rating) bodyEl.appendChild(rating);
    const chatBox = el('div', 'spapp-chat');
    chatBox.setAttribute('data-help-key', 'appSpChat');
    const list = el('div', 'spapp-msgs');
    drawMessages(list);
    chatBox.appendChild(list);
    // un caso cerrado no recibe mensajes (salvo uno «cerrado sin respuesta» que quien reportó puede reabrir escribiendo)
    if (detail.chat && detail.chat.canSend && (!['done', 'noresp'].includes(c.status) || (c.status === 'noresp' && detail.reopenCan))) chatBox.appendChild(composerNode(list));
    bodyEl.appendChild(chatBox);
    startPolling(list);
}
function composerNode(list) {
    const wrap = el('div', 'spapp-composer-wrap');
    const box = el('div', 'spapp-composer');
    const ta = el('textarea', 'spapp-input');
    ta.rows = 2; ta.maxLength = detail.chat.max || 2000;
    ta.placeholder = t('home.spappMsgPlaceholder');
    ta.setAttribute('aria-label', t('home.spappMsgPlaceholder'));
    const btn = el('button', 'home-carga-new-btn spapp-send', t('main.scSend'));
    btn.type = 'button';
    // adjuntar una foto o un archivo (con señal: se sube antes de mandar el mensaje que lo lleva)
    const attachRow = el('div', 'spapp-slot-row');
    const drawAttach = () => {
        attachRow.innerHTML = '';
        attachRow.appendChild(filePicker('main.scAttach', 'bx-paperclip', '', async (f) => { attach = /^image\//.test(f.type) ? await pickImage(f) : { blob: f, name: f.name }; drawAttach(); }));
        if (attach) {
            const rm = el('button', 'spapp-rm'); rm.type = 'button'; rm.setAttribute('aria-label', t('main.scRemove')); rm.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
            rm.addEventListener('click', () => { attach = null; drawAttach(); });
            attachRow.append(el('span', 'spapp-ok', `✓ ${attach.name} · ${fmtSize(attach.blob.size)}`), rm);
        }
    };
    drawAttach();
    btn.addEventListener('click', async () => {
        const text = ta.value.trim();
        if (!text && !attach) { showToast(t('main.scErrEmpty')); return; }
        btn.disabled = true;
        const id = openId;
        try {
            let fileId;
            if (attach) {
                if (!navigator.onLine) { showToast(t('home.spappNoFilesOffline')); btn.disabled = false; return; }
                const up = await fetch(apiUrl(`${CASES}/${id}/files?chat=1`), { method: 'POST', headers: { 'Content-Type': attach.blob.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(attach.name) }, credentials: 'include', body: attach.blob });
                const upBody = await up.json().catch(() => ({}));
                if (!up.ok) { showToast(t('main.spFileFailed', { name: attach.name, why: upBody.message || t('admin.saveError') })); btn.disabled = false; return; }
                fileId = upBody.file.id;
            }
            const result = await sync().offlineAwareFetch(
                `${CASES}/${id}/messages`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ body: text, fileId }) },
                `${t('menu.support')} · ${detail.case.folio}`, `${RECORD_PREFIX}:msg:${id}`, undefined, { rejectable: true },
            );
            if (result.queued) {
                // sin señal: el mensaje queda en el celular (se ve marcado «En tu celular») y se envía solo al volver la conexión
                await refreshQueued();
                ta.value = ''; attach = null; drawAttach();
                showToast(t('home.spappSavedOffline'));
                drawMessages(list);
            } else if (!result.ok) {
                showToast((result.body && result.body.message) || t('admin.saveError'));
            } else {
                ta.value = ''; attach = null; drawAttach();
                await loadCase(id, { quiet: true });
            }
        } catch { showToast(t('admin.saveError')); }
        btn.disabled = false;
    });
    box.append(ta, btn);
    wrap.append(box, attachRow);
    return wrap;
}
// ---- Los archivos del chat: la imagen se baja con la sesión y se pone como dato (la política de seguridad del servidor solo deja imágenes propias o «data:», no «blob:»); el video y los demás archivos se abren con su liga al tocar ----
const imageUrls = new Map();
const fileLink = (caseId, f) => apiUrl(`${CASES}/${caseId}/files/${f.id}`);
async function fileImageUrl(caseId, f) {
    const key = `${caseId}:${f.id}`;
    if (imageUrls.has(key)) return imageUrls.get(key);
    const res = await fetch(fileLink(caseId, f), { credentials: 'include' });
    if (!res.ok) throw new Error('file failed');
    const blob = await res.blob();
    const url = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
    imageUrls.set(key, url);
    return url;
}
function attachmentNode(f) {
    const box = el('div', 'spapp-att');
    const caseId = openId;
    const failed = () => { box.innerHTML = ''; box.appendChild(el('span', 'spapp-hint', t('home.spappFileFail'))); };
    if (f.kind === 'capture') {
        const img = el('img', 'spapp-img'); img.alt = f.name || '';
        fileImageUrl(caseId, f).then((u) => { img.src = u; }).catch(failed);
        box.appendChild(img);
        return box;
    }
    const b = el('button', 'home-carga-secondary-btn spapp-attach'); b.type = 'button';
    b.innerHTML = `<i class="bx ${f.kind === 'recording' ? 'bx-play-circle' : 'bx-file'}" aria-hidden="true"></i> ${esc(f.name || '')} <small>${esc(fmtSize(f.size || 0))}</small>`;
    b.addEventListener('click', async () => {
        b.disabled = true;
        try {
            const u = fileLink(caseId, f);
            if (f.kind === 'recording') { const v = el('video', 'spapp-video'); v.controls = true; v.src = u; v.addEventListener('error', () => { showToast(t('home.spappFileFail')); }); box.replaceChildren(v); v.play().catch(() => {}); } else { window.open(u, '_blank'); b.disabled = false; }
        } catch { showToast(t('home.spappFileFail')); b.disabled = false; }
    });
    box.appendChild(b);
    return box;
}

// ---- Cierre y reapertura ------------------------------------------------------------------------------------------------------------------
function closingCard(c) {
    const closed = ['done', 'noresp'].includes(c.status);
    if (!closed && c.status !== 'confirm') return null;
    const card = el('div', 'pm-app-card spapp-close');
    card.setAttribute('data-help-key', 'appSpReopen');
    card.appendChild(el('b', 'pm-app-title', t('main.clCloseTitle')));
    if (c.status === 'confirm') { card.appendChild(el('p', 'spapp-hint', t('main.clUserConfirmWait'))); return card; }
    const rows = [[t('main.clClosedBy'), c.closedBy || '—'], [t('main.clClosedAt'), c.closedAt ? fmtTime(c.closedAt) : '—']];
    if (c.reopenedCount) rows.push([t('main.clReopened'), String(c.reopenedCount)]);
    rows.push([t(c.status === 'noresp' ? 'main.clNoReplyTitle' : 'main.clDid'), c.closeDid || '—']);
    const meta = el('div', 'pm-app-meta');
    meta.innerHTML = rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    card.appendChild(meta);
    if (pendingReopens.has(c.id)) { const chips = el('div', 'wpapp-chips'); chips.appendChild(chip(t('home.incOnPhone'), 'wpapp-chip-warn')); card.appendChild(chips); return card; }
    if (detail.reopenCan) {
        card.appendChild(el('h4', 'spapp-sub', t('main.clReopenTitle')));
        card.appendChild(el('p', 'spapp-hint', t('main.clReopenUntil', { when: fmtTime(detail.reopenUntil) })));
        const ta = el('textarea', 'spapp-input'); ta.rows = 2; ta.maxLength = 500; ta.value = reopenText; ta.placeholder = t('main.clReopenSaid'); ta.setAttribute('aria-label', t('main.clReopenSaid'));
        ta.addEventListener('input', () => { reopenText = ta.value; });
        const btn = el('button', 'home-carga-new-btn spapp-submit-inline', t('main.clReopenAction')); btn.type = 'button';
        btn.addEventListener('click', () => submitReopen(btn));
        card.append(ta, btn);
    } else if (detail.chat && detail.chat.isReporter) card.appendChild(el('p', 'spapp-hint', t('main.clReopenExpired')));
    return card;
}
async function submitReopen(btn) {
    if (reopenText.trim().length < 5) { showToast(t('main.clErrReopen')); return; }
    btn.disabled = true;
    const id = openId;
    try {
        const result = await sync().offlineAwareFetch(
            `${CASES}/${id}/reopen`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ said: reopenText.trim() }) },
            `${t('menu.support')} · ${detail.case.folio}`, `${RECORD_PREFIX}:reopen:${id}`, undefined, { rejectable: true },
        );
        if (result.queued) { await refreshQueued(); showToast(t('home.spappSavedOffline')); render(); return; }
        if (!result.ok) { showToast((result.body && result.body.message) || t('admin.saveError')); btn.disabled = false; return; }
        reopenText = '';
        showToast(t('main.clDoneReopenUser'));
        await loadCase(id, { quiet: true });
        loadData().catch(() => {});
    } catch { showToast(t('admin.saveError')); btn.disabled = false; }
}

// ---- Calificar la atención ----------------------------------------------------------------------------------------------------------------
const starsText = (n) => '★'.repeat(Math.max(0, Math.min(5, Number(n) || 0))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Number(n) || 0)));
function ratingCard() {
    const d = ratings;
    if (!d) return null;
    const card = el('div', 'pm-app-card spapp-rate');
    card.setAttribute('data-help-key', 'appSpRate');
    if (pendingRates.has(openId)) {
        card.appendChild(el('b', 'pm-app-title', t('main.rtUserTitle')));
        const chips = el('div', 'wpapp-chips'); chips.appendChild(chip(t('home.incOnPhone'), 'wpapp-chip-warn')); card.appendChild(chips);
        return card;
    }
    if (d.userCanRate) {
        card.appendChild(el('b', 'pm-app-title', t('main.rtUserTitle')));
        card.appendChild(el('p', 'spapp-hint', t('main.rtUserHint')));
        const stars = el('div', 'spapp-stars');
        stars.setAttribute('role', 'group'); stars.setAttribute('aria-label', t('main.rtStarsLabel'));
        const drawStars = () => { stars.innerHTML = ''; [1, 2, 3, 4, 5].forEach((n) => { const b = el('button', `spapp-star${rateForm.stars >= n ? ' on' : ''}`, '★'); b.type = 'button'; b.setAttribute('aria-label', String(n)); b.setAttribute('aria-pressed', String(rateForm.stars === n)); b.addEventListener('click', () => { rateForm.stars = n; drawStars(); }); stars.appendChild(b); }); };
        drawStars();
        card.appendChild(stars);
        const tg = (d.tags && d.tags.user) || { good: [], bad: [] };
        const tags = el('div', 'wpapp-filters spapp-tags');
        [...tg.good, ...tg.bad].forEach((k) => {
            const b = el('button', `wpapp-pill${rateForm.tags.has(k) ? ' active' : ''}`, t(`main.rtTag_user_${k}`)); b.type = 'button'; b.setAttribute('aria-pressed', String(rateForm.tags.has(k)));
            b.addEventListener('click', () => { if (rateForm.tags.has(k)) rateForm.tags.delete(k); else rateForm.tags.add(k); b.classList.toggle('active'); b.setAttribute('aria-pressed', String(rateForm.tags.has(k))); });
            tags.appendChild(b);
        });
        card.appendChild(tags);
        const ta = el('textarea', 'spapp-input'); ta.rows = 2; ta.maxLength = d.maxComment || 500; ta.value = rateForm.comment; ta.placeholder = t('main.rtComment'); ta.setAttribute('aria-label', t('main.rtComment'));
        ta.addEventListener('input', () => { rateForm.comment = ta.value; });
        const btn = el('button', 'home-carga-new-btn spapp-submit-inline', t('main.rtSend')); btn.type = 'button';
        btn.addEventListener('click', () => submitRating(btn));
        card.append(ta, btn);
        return card;
    }
    if (d.user) {
        card.appendChild(el('b', 'pm-app-title', t('main.rtUserDone')));
        card.appendChild(el('div', 'spapp-stars-text', starsText(d.user.stars)));
        if ((d.user.tags || []).length) { const chips = el('div', 'wpapp-chips'); d.user.tags.forEach((k) => chips.appendChild(chip(t(`main.rtTag_user_${k}`)))); card.appendChild(chips); }
        if (d.user.comment) card.appendChild(el('p', 'wpapp-note', d.user.comment));
        return card;
    }
    return null;
}
async function submitRating(btn) {
    if (!rateForm.stars) { showToast(t('main.rtStarsErr')); return; }
    btn.disabled = true;
    const id = openId;
    try {
        const result = await sync().offlineAwareFetch(
            `${CASES}/${id}/ratings`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ kind: 'user', stars: rateForm.stars, tags: [...rateForm.tags], comment: rateForm.comment }) },
            `${t('menu.support')} · ${detail.case.folio}`, `${RECORD_PREFIX}:rate:${id}`, undefined, { rejectable: true },
        );
        if (result.queued) { await refreshQueued(); showToast(t('home.spappSavedOffline')); render(); return; }
        if (!result.ok) { showToast((result.body && result.body.message) || t('admin.saveError')); btn.disabled = false; return; }
        rateForm = { stars: 0, tags: new Set(), comment: '' };
        showToast(t('main.rtThanks'));
        await loadCase(id, { quiet: true });
        loadData().catch(() => {});
    } catch { showToast(t('admin.saveError')); btn.disabled = false; }
}
// el chat se actualiza solo mientras está abierto y hay señal
function startPolling(list) {
    stopPolling();
    pollTimer = setInterval(async () => {
        if (screen !== 'case' || document.hidden || !navigator.onLine || !detail) return;
        try {
            const last = messages.length ? messages[messages.length - 1].id : 0;
            const m = await getJson(`${CASES}/${openId}/messages?after=${last}`);
            if (screen === 'case' && (m.messages || []).length) { messages = [...messages, ...m.messages]; drawMessages(list); }
        } catch { /* se vuelve a intentar */ }
    }, 12000);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
function goList() { screen = 'list'; openId = null; detail = null; messages = []; form = null; render(); }

// ---- Pedir soporte: el mismo formulario de la Web (menos la grabación de pantalla) ----------------------------------------------------------
const SR = () => window.SupportRules;
const categoryOf = () => (formOptions.categories.find((c) => c.id === form.categoryId) || null);
function newForm() {
    return { screenId: '', actionId: '', summary: '', screen: '', action: '', errorText: '', errImage: null, categoryId: null, impacts: new Map(), when: '', keep: null, answers: new Map(), slots: new Map(), extras: [], sending: false };
}
function openForm() {
    form = newForm();
    screen = 'form';
    render();
}
function priorityPreview() {
    const impacts = formOptions.impacts.map((i) => ({ name: i.name, level: form.impacts.get(i.name) || 0 }));
    const priority = SR().priorityOf(impacts, form.when);
    const cat = categoryOf();
    const level = SR().entryLevel(cat ? cat.kind : '', formOptions.map);
    const minutes = SR().firstResponseMinutes(priority, cat ? cat.firstResponseMin : 0, formOptions.map);
    return { priority, level, minutes };
}
const field = (labelText, node, wide) => { const w = el('label', `spapp-field${wide ? ' wide' : ''}`); w.appendChild(el('span', '', labelText)); w.appendChild(node); return w; };
const section = (title, helpKey) => { const s = el('section', 'spapp-sec'); if (helpKey) s.setAttribute('data-help-key', helpKey); if (title) s.appendChild(el('h4', '', title)); return s; };
function chipRow(options, selected, onPick) {
    const row = el('div', 'wpapp-filters spapp-chips');
    row.setAttribute('role', 'radiogroup');
    options.forEach(([value, label]) => {
        const b = el('button', `wpapp-pill${String(selected) === String(value) ? ' active' : ''}`, label);
        b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(String(selected) === String(value)));
        b.addEventListener('click', () => { [...row.children].forEach((c) => { c.classList.remove('active'); c.setAttribute('aria-checked', 'false'); }); b.classList.add('active'); b.setAttribute('aria-checked', 'true'); onPick(value); });
        row.appendChild(b);
    });
    return row;
}
// Pantalla y acción: de la lista del sistema (de ahí la Mesa de ayuda compara los accesos) o «otra / no sé» escrita con palabras
function screenBlock() {
    const box = el('div', 'spapp-screenpick');
    const free = () => {
        const s = el('input'); s.type = 'text'; s.maxLength = 120; s.value = form.screen; s.addEventListener('input', () => { form.screen = s.value; });
        const a = el('input'); a.type = 'text'; a.maxLength = 120; a.value = form.action; a.addEventListener('input', () => { form.action = a.value; });
        return [field(t('main.spFScreen'), s), field(t('main.spFAction'), a)];
    };
    if (!formOptions.screens.length) { free().forEach((n) => box.appendChild(n)); return box; }
    const sel = el('select');
    sel.appendChild(Object.assign(el('option', '', t('main.spFChoose')), { value: '' }));
    formOptions.screens.forEach((s) => { const o = el('option', '', `${s.has === undefined ? '' : (s.has ? '🟢 ' : '🔴 ')}${s.label}`); o.value = s.id; if (s.id === form.screenId) o.selected = true; sel.appendChild(o); });
    const other = el('option', '', t('main.spFOtherScreen')); other.value = '__other'; if (form.screenId === '__other') other.selected = true; sel.appendChild(other);
    sel.addEventListener('change', () => { form.screenId = sel.value; form.actionId = ''; const fresh = screenBlock(); box.replaceWith(fresh); });
    box.appendChild(field(t('main.spFScreen'), sel));
    const picked = formOptions.screens.find((s) => s.id === form.screenId);
    if (form.screenId === '__other') free().forEach((n) => box.appendChild(n));
    else if (picked) {
        const asel = el('select');
        asel.appendChild(Object.assign(el('option', '', t('main.spFChoose')), { value: '' }));
        [...picked.actions].sort((a, b) => ['button', 'column', 'icon'].indexOf(a.kind) - ['button', 'column', 'icon'].indexOf(b.kind)).forEach((a) => { const o = el('option', '', `${t(`main.supAcc_action_${a.kind}`)}: ${t(a.labelKey)}`); o.value = a.id; if (a.id === form.actionId) o.selected = true; asel.appendChild(o); });
        asel.addEventListener('change', () => { form.actionId = asel.value; });
        box.appendChild(field(t('main.spFAction'), asel));
    }
    return box;
}
// una imagen del celular: se achica antes de guardarla (el servidor pide menos de 2 MB por captura)
async function pickImage(file) {
    try { const blob = await sync().compressImageToBlob(file, 1600, 0.75); return { blob, name: `${String(file.name || 'foto').replace(/\.[^.]+$/, '')}.jpg` }; } catch { return { blob: file, name: file.name || 'foto' }; }
}
function filePicker(labelKey, icon, accept, onFile) {
    const lab = el('label', 'home-carga-secondary-btn spapp-attach');
    lab.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i> ${esc(t(labelKey))}`;
    const input = el('input'); input.type = 'file'; if (accept) input.accept = accept; input.hidden = true;
    input.addEventListener('change', async () => { const f = input.files && input.files[0]; input.value = ''; if (f) await onFile(f); });
    lab.appendChild(input);
    if (!navigator.onLine) { lab.classList.add('disabled'); input.disabled = true; }
    return lab;
}
function evidenceBlock() {
    const sec = section(t('main.spFEvidence'), 'appSpEvidence');
    const cat = categoryOf();
    if (!cat) { sec.appendChild(el('p', 'spapp-hint', t('main.spFPickCategoryFirst'))); return sec; }
    const missing = cat.evidences.filter((e) => (e.kind === 'data' ? !(form.answers.get(e.id) || '').trim() : !form.slots.has(e.id))).length;
    if (missing) sec.firstChild.appendChild(el('span', 'wpapp-chip wpapp-chip-late', t('main.spFMissing', { n: missing })));
    if (!cat.evidences.length) sec.appendChild(el('p', 'spapp-hint', t('main.spFNoEvidence')));
    cat.evidences.forEach((e) => {
        const box = el('div', 'spapp-slot');
        box.appendChild(el('b', '', e.name));
        if (e.kind === 'data') {
            const inp = el('input'); inp.type = 'text'; inp.maxLength = formOptions.limits.answer; inp.value = form.answers.get(e.id) || '';
            inp.addEventListener('input', () => { form.answers.set(e.id, inp.value); });
            box.appendChild(inp);
        } else {
            const have = form.slots.get(e.id);
            const row = el('div', 'spapp-slot-row');
            const accept = e.kind === 'capture' ? 'image/*' : (e.kind === 'recording' ? 'video/*' : '');
            row.appendChild(filePicker(e.kind === 'recording' ? 'main.spFPickVideo' : 'main.spFAttach', e.kind === 'recording' ? 'bx-video' : 'bx-paperclip', accept, async (f) => {
                form.slots.set(e.id, e.kind === 'capture' ? await pickImage(f) : { blob: f, name: f.name });
                sec.replaceWith(evidenceBlock());
            }));
            if (have) {
                const ok = el('span', 'spapp-ok', `✓ ${have.name} · ${fmtSize(have.blob.size)}`);
                const rm = el('button', 'spapp-rm'); rm.type = 'button'; rm.setAttribute('aria-label', t('main.msRemoveImpact')); rm.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
                rm.addEventListener('click', () => { form.slots.delete(e.id); sec.replaceWith(evidenceBlock()); });
                row.append(ok, rm);
            }
            box.appendChild(row);
        }
        sec.appendChild(box);
    });
    const extra = el('div', 'spapp-slot');
    extra.appendChild(el('b', '', t('main.spFExtra')));
    form.extras.forEach((x, i) => {
        const row = el('div', 'spapp-slot-row');
        const rm = el('button', 'spapp-rm'); rm.type = 'button'; rm.setAttribute('aria-label', t('main.msRemoveImpact')); rm.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        rm.addEventListener('click', () => { form.extras.splice(i, 1); sec.replaceWith(evidenceBlock()); });
        row.append(el('span', 'spapp-ok', `${x.name} · ${fmtSize(x.blob.size)}`), rm);
        extra.appendChild(row);
    });
    extra.appendChild(filePicker('main.spFAdd', 'bx-plus', '', async (f) => { form.extras.push(/^image\//.test(f.type) ? await pickImage(f) : { blob: f, name: f.name }); sec.replaceWith(evidenceBlock()); }));
    if (!navigator.onLine) extra.appendChild(el('p', 'spapp-hint', t('home.spappNoFilesOffline')));
    sec.appendChild(extra);
    return sec;
}
function priorityBlock() {
    const sec = section('', 'appSpPriority');
    sec.classList.add('spapp-calc');
    if (!form.when) { sec.appendChild(el('span', 'spapp-hint', t('main.spFPriorityHint'))); return sec; }
    const p = priorityPreview();
    const line = el('div');
    line.innerHTML = `<b>${esc(t('main.spFPriority'))}:</b> `;
    line.appendChild(chip(t(`main.msPri_${p.priority}`)));
    sec.append(line, el('span', 'spapp-hint', `${t('main.spFEnters')}: ${t(`main.sopLevel_${p.level}`)} · ${t('main.spFFirst')}: ${friendlyMinutes(p.minutes)}`));
    return sec;
}
function renderForm() {
    titleEl.textContent = t('main.spNewTitle');
    if (!formOptions) { bodyEl.appendChild(el('p', 'home-empty', t('home.spappNoForm'))); return; }
    const wrap = el('div', 'spapp-form');
    wrap.setAttribute('data-help-key', 'appSpForm');
    const summary = el('input'); summary.type = 'text'; summary.maxLength = formOptions.limits.summary; summary.value = form.summary; summary.addEventListener('input', () => { form.summary = summary.value; });
    wrap.appendChild(field(`${t('main.spFSummary')} *`, summary, true));
    wrap.appendChild(screenBlock());
    // el mensaje del error: escrito, o una imagen (captura del celular)
    const errBox = el('div', 'spapp-field wide');
    errBox.appendChild(el('span', '', t('main.spFError')));
    const ta = el('textarea'); ta.rows = 2; ta.maxLength = formOptions.limits.text; ta.value = form.errorText; ta.addEventListener('input', () => { form.errorText = ta.value; });
    errBox.appendChild(ta);
    const imgRow = el('div', 'spapp-slot-row');
    const drawErrImage = () => {
        imgRow.innerHTML = '';
        imgRow.appendChild(filePicker('main.spFPickImage', 'bx-image-add', 'image/*', async (f) => { form.errImage = await pickImage(f); drawErrImage(); }));
        if (form.errImage) {
            const rm = el('button', 'spapp-rm'); rm.type = 'button'; rm.setAttribute('aria-label', t('main.msRemoveImpact')); rm.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
            rm.addEventListener('click', () => { form.errImage = null; drawErrImage(); });
            imgRow.append(el('span', 'spapp-ok', `✓ ${form.errImage.name} · ${fmtSize(form.errImage.blob.size)}`), rm);
        }
    };
    drawErrImage();
    errBox.appendChild(imgRow);
    wrap.appendChild(errBox);
    const cat = el('select');
    cat.appendChild(Object.assign(el('option', '', t('main.spFChoose')), { value: '' }));
    formOptions.categories.forEach((c) => { const o = el('option', '', c.name); o.value = String(c.id); if (c.id === form.categoryId) o.selected = true; cat.appendChild(o); });
    wrap.appendChild(field(`${t('main.spFCategory')} *`, cat, true));
    // qué implica: cada impacto del Mapa de soporte con su nivel
    const impacts = section(t('main.spFImpact'), 'appSpImpact');
    formOptions.impacts.forEach((i) => {
        const row = el('div', 'spapp-impact');
        const label = el('div'); label.appendChild(el('b', '', i.name)); if (i.question) label.appendChild(el('small', '', i.question));
        row.appendChild(label);
        row.appendChild(chipRow([0, 1, 2, 3].map((l) => [l, t(`main.spLevel_${l}`)]), form.impacts.get(i.name) || 0, (v) => { form.impacts.set(i.name, Number(v)); redrawPriority(); }));
        impacts.appendChild(row);
    });
    wrap.appendChild(impacts);
    const when = section(`${t('main.spFWhen')} *`, 'appSpWhen');
    when.appendChild(chipRow(WHEN_KEYS.map((k) => [k, t(`main.spWhen_${k}`)]), form.when, (v) => { form.when = v; redrawPriority(); }));
    when.appendChild(el('h4', '', `${t('main.spFKeep')} *`));
    when.appendChild(chipRow([['yes', t('main.spYes')], ['no', t('main.spNo')]], form.keep === null ? '' : (form.keep ? 'yes' : 'no'), (v) => { form.keep = v === 'yes'; }));
    wrap.appendChild(when);
    let prio = priorityBlock();
    wrap.appendChild(prio);
    const redrawPriority = () => { const fresh = priorityBlock(); prio.replaceWith(fresh); prio = fresh; };
    let evid = evidenceBlock();
    wrap.appendChild(evid);
    cat.addEventListener('change', () => { form.categoryId = cat.value ? Number(cat.value) : null; form.slots = new Map(); form.answers = new Map(); const fresh = evidenceBlock(); evid.replaceWith(fresh); evid = fresh; redrawPriority(); });
    const send = el('button', 'home-carga-new-btn spapp-submit', t('main.spFSubmit'));
    send.type = 'button';
    send.addEventListener('click', () => submitForm(send));
    wrap.appendChild(send);
    bodyEl.appendChild(wrap);
}
async function uploadOne(caseId, item) {
    try {
        const headers = { 'Content-Type': item.blob.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(item.name) };
        if (item.evidenceId) headers['X-Evidence-Id'] = String(item.evidenceId);
        const res = await fetch(apiUrl(`${CASES}/${caseId}/files`), { method: 'POST', headers, credentials: 'include', body: item.blob });
        const body = await res.json().catch(() => ({}));
        return res.ok ? { ok: true } : { ok: false, message: body.message || t('admin.saveError') };
    } catch { return { ok: false, message: t('admin.saveError') }; }
}
async function submitForm(btn) {
    if (!form || form.sending) return;
    const cat = categoryOf();
    const need = (cond, key) => { if (!cond) { showToast(t(key)); return false; } return true; };
    if (!need(form.summary.trim(), 'main.spErrSummary') || !need(cat, 'main.spErrCategory') || !need(form.when, 'main.spErrWhen') || !need(form.keep !== null, 'main.spErrKeep')) return;
    const queue = [...[...form.slots.entries()].map(([evidenceId, x]) => ({ ...x, evidenceId })), ...form.extras.map((x) => ({ ...x, evidenceId: null })), ...(form.errImage ? [{ ...form.errImage, evidenceId: null }] : [])];
    if (queue.length && !navigator.onLine) { showToast(t('home.spappNoFilesOffline')); return; }
    form.sending = true; btn.disabled = true; btn.textContent = t('main.spFSending');
    const answers = {};
    form.answers.forEach((text, id) => { if (String(text).trim()) answers[id] = String(text).trim(); });
    const payload = {
        summary: form.summary.trim(), screen: form.screen, action: form.action, screenId: form.screenId && form.screenId !== '__other' ? form.screenId : undefined, actionId: form.screenId && form.screenId !== '__other' && form.actionId ? form.actionId : undefined,
        errorText: form.errorText, categoryId: form.categoryId, when: form.when, keepWorking: form.keep, impacts: formOptions.impacts.map((i) => ({ name: i.name, level: form.impacts.get(i.name) || 0 })), answers,
    };
    try {
        const result = await sync().offlineAwareFetch(
            API,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) },
            `${t('menu.support')} · ${payload.summary}`, `${RECORD_PREFIX}:new:${Date.now()}`, undefined, { rejectable: true },
        );
        if (result.queued) {
            // sin señal: la solicitud queda en el celular y se manda sola al volver la conexión (las fotos se agregan con señal)
            await refreshQueued();
            showToast(t('home.spappSavedOffline'));
            form = null; screen = 'list'; render();
            return;
        }
        if (!result.ok) { showToast((result.body && result.body.message) || t('admin.saveError')); form.sending = false; btn.disabled = false; btn.textContent = t('main.spFSubmit'); return; }
        const created = result.body.case;
        const failed = [];
        for (const item of queue) { const r = await uploadOne(created.id, item); if (!r.ok) failed.push(t('main.spFileFailed', { name: item.name, why: r.message })); }
        showToast(t('main.spSent', { folio: created.folio }));
        failed.forEach((m) => showToast(m));
        form = null;
        await loadData();
        openCase(created.id);
    } catch {
        showToast(t('admin.saveError'));
        if (form) { form.sending = false; btn.disabled = false; btn.textContent = t('main.spFSubmit'); }
    }
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (screen === 'form') { if (form && !form.sending) goList(); return; }
    if (screen === 'case') { goList(); return; }
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
        if (!user || !user.clientId) { window.location.replace('AppInicio.html'); return; } // las cuentas de SaaS no piden soporte aquí: tienen su Soporte en la Web
        await loadBrandingForTheme();
        applyStyle(getStoredStyle());
        await refreshQueued();
        await loadData();
        render();
        // llegar desde un aviso: AppSoporte.html?id=<caso> abre ese caso
        const wanted = Number(new URLSearchParams(location.search).get('id'));
        if (wanted && dataState !== 'forbidden') openCase(wanted);
    } catch (err) {
        console.error('Soporte (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
