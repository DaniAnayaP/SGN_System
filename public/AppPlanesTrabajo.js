// ---------------------------------------------------------------------------
// Planes de trabajo (App) — la misma pantalla de la Web (el icono «Planes de trabajo» de la barra de arriba) hecha para el celular, por ahora con sus dos pestañas de trabajo diario:
//   · «Mis actividades»: lo que me toca (responsable o quien ejecuta) de todos mis planes activos, junto: agrupado por cuándo vence (Vencidas, Esta semana, Más adelante, Sin fecha) y lo hecho aparte, con los mismos
//     filtros (Por hacer / Vencidas / Hechas / Todas, mi papel) y el buscador de siempre. Las hojas se marcan en curso, hechas o pendientes desde aquí (si mi rol en ese plan lo permite: lo decide el servidor).
//   · «Mi equipo» (solo si tengo gente a mi cargo por el organigrama): lo que les toca a ellos, SOLO en los planes que ya puedo ver; es de solo lectura.
//   · Tocar una actividad abre su detalle (plan y ruta, papel, estado, fechas, responsable, quien ejecuta, nota). Armar planes, compartirlos, plantillas y los comentarios se quedan en la Web.
// Sin señal funciona: lo último que se bajó se guarda en el celular y los cambios de estado esperan en la cola (AppOfflineSync.js, recordKey «planes-trabajo:<plan>:<renglón>») marcados «En tu celular»; si al reconectar el
// servidor rechaza alguno (el plan se finalizó, ya no eres responsable…) se avisa en «No se aplicó». El servidor es el mismo de la Web (GET /api/business/work-plans/mine y /team, PATCH .../items/:id).
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
const API = '/api/business/work-plans';
const RECORD_PREFIX = 'planes-trabajo';
const PATCH_URL = /\/api\/business\/work-plans\/(\d+)\/items\/(\d+)$/;
const MAX_ROWS = 120;                          // las actividades que se dibujan a la vez; el buscador y los filtros traen el resto
let currentUser = null;
let mine = { activities: [], counts: { open: 0, done: 0 }, truncated: false };
let team = { members: [], activities: [], truncated: false };
let dataState = 'loading';                     // 'loading' | 'online' | 'cached' | 'none' | 'forbidden'
let tab = 'mine';                              // 'mine' | 'team'
let screen = 'list';                           // 'list' | 'detail'
let openRef = null;                            // { planId, itemId, from: 'mine' | 'team', person }
let mineFilter = 'open';                       // 'open' | 'late' | 'done' | 'all'
let mineRole = 'all';                          // 'all' | 'responsible' | 'executor'
let mineQuery = '';
let teamFilter = 'open';
let teamPerson = 'all';
let teamQuery = '';
let pending = new Map();                       // 'planId:itemId' -> estado guardado sin señal y todavía en la cola
let listScroll = 0;

// --- Fechas (de calendario, sin hora) --------------------------------------------------------------------------------------------------
const localeOf = () => (currentLang() === 'es' ? 'es-MX' : 'en-US');
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return new Date(y, m - 1, d); };
const ymdOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayYmd = () => ymdOf(new Date());
const shortDate = (ymd) => (ymd ? dayOf(ymd).toLocaleDateString(localeOf(), { day: 'numeric', month: 'short' }).replace(/\./g, '') : '');
const longDate = (ymd) => (ymd ? dayOf(ymd).toLocaleDateString(localeOf(), { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const mondayOf = (date) => { const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const daysBetween = (fromYmd, toYmd) => Math.round((dayOf(toYmd) - dayOf(fromYmd)) / 86400000);
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase() || '?';
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };
const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* sin almacenamiento */ } },
};
const sync = () => window.SgnOfflineSync;

// cuándo vence (group: late | week | later | nodate | done) y el texto con su tono: lo mismo que la Web (PlanesTrabajo.js › dueInfo)
function dueInfo(a, today) {
    if (a.status === 'done') return { group: 'done', text: '', tone: '' };
    if (!a.endDate) return { group: 'nodate', text: t('main.wpNoDates'), tone: '' };
    const n = daysBetween(today, a.endDate);
    if (n < 0) return { group: 'late', text: t(n === -1 ? 'main.wpMineDueAgoOne' : 'main.wpMineDueAgo', { n: -n }), tone: 'late' };
    const sunday = ymdOf(new Date(mondayOf(dayOf(today)).getTime() + 6 * 86400000 + 3600000));
    const text = n === 0 ? t('main.wpMineDueToday') : (n === 1 ? t('main.wpMineDueTomorrow') : t('main.wpMineDueIn', { n }));
    return { group: a.endDate <= sunday ? 'week' : 'later', text, tone: n <= 1 ? 'warn' : '' };
}
const statusText = (status) => t(`main.wpStatus_${status}`);
const ICON = { pending: 'bx-circle', in_progress: 'bx-time-five', done: 'bx-check-circle' };

// --- Lo que se mandó sin señal y sigue en la cola: el estado ya se ve cambiado, marcado «En tu celular» -------------------------------------
const keyOf = (a) => `${a.planId}:${a.itemId}`;
const parseBody = (item) => { try { return JSON.parse(item.body || '{}'); } catch { return null; } };
async function refreshQueued() {
    let queue = [];
    try { queue = await sync().listOfflineQueue(); } catch { queue = []; }
    const next = new Map();
    queue.forEach((item) => {
        if (item.method !== 'PATCH' || !item.url || !PATCH_URL.test(item.url)) return;
        const body = parseBody(item);
        if (!body || !body.status) return;
        const m = PATCH_URL.exec(item.url);
        next.set(`${m[1]}:${m[2]}`, body.status);
    });
    const changed = next.size !== pending.size || [...next].some(([k, v]) => pending.get(k) !== v);
    pending = next;
    return changed;
}
function effective(a) {
    const p = pending.get(keyOf(a));
    return p && a.isLeaf ? { ...a, status: p, queued: true } : a;
}
const mineList = () => mine.activities.map(effective);

// --- Carga: lo último que se bajó se guarda en el celular para verlo también sin señal ---------------------------------------------------
function cacheDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('sgn-wp-cache', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function cacheSave() {
    try {
        const db = await cacheDb();
        const value = { clientId: currentUser ? (currentUser.clientId ?? null) : null, userId: currentUser ? (currentUser.sub ?? currentUser.id ?? null) : null, mine, team, at: Date.now() };
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
    if (!res.ok) throw new Error('load failed');
    return res.json();
}
async function loadData() {
    const clientId = currentUser ? (currentUser.clientId ?? null) : null;
    try {
        const m = await getJson(`${API}/mine`);
        mine = { activities: m.activities || [], counts: m.counts || { open: 0, done: 0 }, truncated: !!m.truncated };
        try {
            const tm = await getJson(`${API}/team?today=${todayYmd()}`);
            team = { members: tm.members || [], activities: tm.activities || [], truncated: !!tm.truncated };
        } catch { team = { members: [], activities: [], truncated: false }; }
        dataState = 'online';
        cacheSave();
        return;
    } catch (err) {
        if (err && err.forbidden) { dataState = 'forbidden'; return; }
    }
    try {
        const saved = await cacheRead();
        // lo guardado solo sirve si es de la misma empresa y la misma persona (otra cuenta en el mismo celular no ve actividades ajenas)
        const userId = currentUser ? (currentUser.sub ?? currentUser.id ?? null) : null;
        if (saved && (saved.clientId ?? null) === clientId && (saved.userId ?? null) === userId) {
            mine = saved.mine || mine;
            team = saved.team || team;
            dataState = 'cached';
            return;
        }
    } catch { /* sin datos guardados */ }
    dataState = 'none';
}

// --- Cambiar el estado de una hoja (con la cola sin señal) -------------------------------------------------------------------------------
function errorText(result) {
    const code = result && result.body && result.body.code;
    if (code) { const key = `main.wpErr_${code}`; const text = t(key); if (text !== key) return text; }
    return t('main.wpErr_default');
}
function applyLocal(a, status) {
    const row = mine.activities.find((x) => x.planId === a.planId && x.itemId === a.itemId);
    if (!row) return;
    row.status = status;
    row.progress = status === 'done' ? 100 : 0;
    const open = mine.activities.filter((x) => x.status !== 'done').length;
    mine.counts = { open, done: mine.activities.length - open };
}
async function changeStatus(a, status) {
    const description = `${t('menu.workPlans')} · ${a.title}`;
    try {
        const result = await sync().offlineAwareFetch(
            `${API}/${a.planId}/items/${a.itemId}`,
            { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status }) },
            description, `${RECORD_PREFIX}:${a.planId}:${a.itemId}`, undefined, { rejectable: true },
        );
        if (result.queued) {
            // sin señal: el cambio queda en el celular (se ve aplicado, marcado «En tu celular») y se envía solo al volver la conexión
            await refreshQueued();
            showToast(t('home.wpappSavedOffline'));
            render();
            return;
        }
        if (!result.ok) {
            showToast(errorText(result));
            if ([403, 404, 409].includes(result.status)) { await loadData(); await refreshQueued(); render(); }
            return;
        }
        applyLocal(a, status);
        render();
        cacheSave();
        loadData().then(() => render()).catch(() => {});
    } catch {
        showToast(t('admin.saveError'));
    }
}
// AppOfflineSync avisa cada 30 s aunque nada haya cambiado: solo se vuelve a dibujar si cambió lo que esta pantalla tenía en la cola
document.addEventListener('sgn:offline-queue-changed', async () => {
    const before = pending.size;
    const changed = await refreshQueued();
    if (!changed) return;
    // al reconectar la cola se vacía: se vuelve a pedir la lista para ver lo enviado ya aplicado
    if (pending.size < before && navigator.onLine) await loadData();
    render();
});
document.addEventListener('sgn:offline-rejected', () => { if (screen === 'list') render(); });

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
    const prefix = `${t('menu.workPlans')} ·`;
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
// las acciones de una hoja: marcar en curso / hecha / pendiente (solo si el servidor dice que se puede: canStatus)
function actionsNode(a) {
    if (!a.canStatus || !a.isLeaf) return null;
    const box = el('span', 'wpapp-acts');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', t('main.wpNameActions'));
    box.setAttribute('data-help-key', 'appWpActions');
    const btn = (icon, labelKey, status) => {
        const b = el('button', 'wpapp-act');
        b.type = 'button';
        b.setAttribute('aria-label', t(labelKey)); b.setAttribute('data-help-key', 'appWpActions');
        b.title = t(labelKey);
        b.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
        b.addEventListener('click', (event) => { event.stopPropagation(); b.disabled = true; changeStatus(a, status); });
        return b;
    };
    if (a.status === 'pending') box.appendChild(btn('bx-play', 'main.wpMarkRunning', 'in_progress'));
    if (a.status !== 'done') box.appendChild(btn('bx-check', 'main.wpMarkDone', 'done'));
    if (a.status !== 'pending') box.appendChild(btn('bx-undo', 'main.wpMarkPending', 'pending'));
    return box;
}
const roleKeyOf = (role) => (role === 'both' ? 'main.wpMineChipBoth' : (role === 'responsible' ? 'main.wpMineChipResp' : 'main.wpMineChipExec'));
function chipsOf(a, today) {
    const info = dueInfo(a, today);
    const range = a.startDate && a.endDate ? (a.startDate === a.endDate ? shortDate(a.endDate) : `${shortDate(a.startDate)} – ${shortDate(a.endDate)}`) : '';
    const stateLabel = !a.isLeaf && a.status === 'in_progress' ? t('main.wpStatusProgress', { pct: a.progress || 0 }) : statusText(a.status);
    const chips = el('span', 'wpapp-chips');
    chips.append(el('span', 'wpapp-chip', t(roleKeyOf(a.role))), el('span', `wpapp-chip wpapp-chip-${a.status}`, stateLabel));
    if (info.text) chips.appendChild(el('span', `wpapp-chip${info.tone ? ` wpapp-chip-${info.tone}` : ''}`, info.text));
    if (range) chips.appendChild(el('span', 'wpapp-chip', range));
    if (a.unreadCount) chips.appendChild(el('span', 'wpapp-chip wpapp-chip-warn', `💬 ${a.unreadCount}`));
    else if (a.commentCount) chips.appendChild(el('span', 'wpapp-chip', `💬 ${a.commentCount}`));
    if (a.queued) chips.appendChild(el('span', 'pm-app-pill pm-app-pill-queued', t('home.incOnPhone')));
    return { chips, info };
}
function rowNode(a, today, from) {
    const { chips, info } = chipsOf(a, today);
    const row = el('div', `wpapp-row${info.tone === 'late' ? ' late' : ''}${a.status === 'done' ? ' done' : ''}`);
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', a.title);
    row.setAttribute('data-help-key', from === 'team' ? 'appWpTeamRow' : 'appWpRow');
    row.appendChild(el('i', `bx ${ICON[a.status] || ICON.pending} wpapp-dot wpapp-dot-${a.status}`));
    const main = el('button', 'wpapp-main');
    main.type = 'button';
    main.setAttribute('aria-label', a.title); main.setAttribute('data-help-key', from === 'team' ? 'appWpTeamRow' : 'appWpRow'); // el botón trae su propio nombre: sin su llave el Modo ayuda no llega a la ayuda de la fila
    const title = el('span', 'wpapp-title');
    title.append(el('b', '', a.title), ' ', el('small', '', a.levelName || ''));
    main.append(title, el('span', 'wpapp-crumbs', [a.planTitle, ...(a.path || [])].join(' › ')), chips);
    main.addEventListener('click', () => { listScroll = bodyEl.scrollTop; openRef = { planId: a.planId, itemId: a.itemId, from, person: a.person ? a.person.userId : null }; screen = 'detail'; render(); });
    row.appendChild(main);
    const acts = from === 'mine' ? actionsNode(a) : null;
    if (acts) row.appendChild(acts);
    return row;
}
const GROUPS = [['late', 'main.wpMineGroupLate'], ['week', 'main.wpMineGroupWeek'], ['later', 'main.wpMineGroupLater'], ['nodate', 'main.wpMineGroupNoDate'], ['done', 'main.wpMineGroupDone']];
function matchesQuery(query, text) { return !query.trim() || window.SearchSyntax.matches('contains', query, text); }

function tabsNode() {
    if (!team.members.length) return null;
    const teamOpen = team.members.reduce((n, m) => n + m.open, 0);
    const box = el('div', 'wpapp-tabs');
    box.setAttribute('role', 'tablist');
    box.setAttribute('data-help-key', 'appWpTabs');
    box.setAttribute('aria-label', t('menu.workPlans'));
    const mineOpen = mineList().filter((a) => a.status !== 'done').length;
    [['mine', t('main.wpTabMine'), mineOpen], ['team', t('main.wpTabTeam'), teamOpen]].forEach(([key, label, n]) => {
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
function filtersNode(current, counts, setFilter) {
    const box = el('div', 'wpapp-filters');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', t('main.wpMineFilterName'));
    box.setAttribute('data-help-key', 'appWpFilter');
    [['open', 'main.wpMineFilterOpen'], ['late', 'main.wpMineFilterLate'], ['done', 'main.wpMineFilterDone'], ['all', 'main.wpMineFilterAll']].forEach(([k, l]) => box.appendChild(pill(`${t(l)} · ${counts[k]}`, current === k, () => setFilter(k))));
    return box;
}
function searchNode(value, placeholderKey, onInput) {
    const input = el('input', 'pm-app-input wpapp-search');
    input.type = 'search';
    input.placeholder = t(placeholderKey);
    input.setAttribute('aria-label', t(placeholderKey));
    input.value = value;
    let timer = 0;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => onInput(input.value), 150); });
    return input;
}

function renderList() {
    titleEl.textContent = t('menu.workPlans');
    renderRejectedBanner();
    if (dataState === 'forbidden') { bodyEl.appendChild(el('p', 'home-carga-empty-note', t('main.wpErr_WORK_PLAN_FORBIDDEN'))); return; }
    if (dataState === 'cached') bodyEl.appendChild(el('p', 'pm-app-note', t('home.wpappCached')));
    if (dataState === 'none') { bodyEl.appendChild(el('p', 'home-carga-empty-note', t('home.wpappNoData'))); return; }
    const tabs = tabsNode();
    if (tabs) bodyEl.appendChild(tabs);
    else tab = 'mine';
    if (tab === 'team') renderTeam(); else renderMine();
    if (listScroll) { const y = listScroll; listScroll = 0; setTimeout(() => { bodyEl.scrollTop = y; }, 0); }
}

function renderMine() {
    const today = todayYmd();
    const all = mineList();
    const counts = { open: all.filter((a) => a.status !== 'done').length, late: all.filter((a) => dueInfo(a, today).group === 'late').length, done: all.filter((a) => a.status === 'done').length, all: all.length };
    const host = el('div');
    const draw = () => {
        host.innerHTML = '';
        const shown = all.filter((a) => {
            if (mineRole === 'responsible' && a.role === 'executor') return false;
            if (mineRole === 'executor' && a.role === 'responsible') return false;
            if (!matchesQuery(mineQuery, `${a.title} ${a.planTitle} ${(a.path || []).join(' ')}`)) return false;
            if (mineFilter === 'open') return a.status !== 'done';
            if (mineFilter === 'late') return dueInfo(a, today).group === 'late';
            if (mineFilter === 'done') return a.status === 'done';
            return true;
        });
        if (!all.length) { host.appendChild(el('p', 'home-carga-empty-note', t('main.wpMineEmptyTitle'))); return; }
        if (!shown.length) { host.appendChild(el('p', 'home-carga-empty-note', t(mineQuery.trim() ? 'main.wpNoMatches' : 'main.wpMineNone'))); return; }
        let drawn = 0;
        GROUPS.forEach(([key, label]) => {
            let list = shown.filter((a) => dueInfo(a, today).group === key);
            if (key === 'done') list = list.slice().sort((a, b) => (a.endDate && b.endDate ? (a.endDate < b.endDate ? 1 : a.endDate > b.endDate ? -1 : 0) : 0));
            if (!list.length || drawn >= MAX_ROWS) return;
            if (mineFilter !== 'done') host.appendChild(el('h4', 'wpapp-group', `${t(label)} · ${list.length}`));
            list.slice(0, MAX_ROWS - drawn).forEach((a) => host.appendChild(rowNode(a, today, 'mine')));
            drawn += list.length;
        });
        if (shown.length > MAX_ROWS) host.appendChild(el('p', 'pm-app-note', t('home.wpappShowing', { n: MAX_ROWS, total: shown.length })));
        if (mine.truncated) host.appendChild(el('p', 'pm-app-note', t('main.wpMineTruncated', { n: all.length })));
    };
    const filters = filtersNode(mineFilter, counts, (k) => { mineFilter = k; render(); });
    bodyEl.appendChild(filters);
    const roles = el('div', 'wpapp-filters');
    roles.setAttribute('role', 'group');
    roles.setAttribute('aria-label', t('main.wpMineRoleName'));
    roles.setAttribute('data-help-key', 'appWpRole');
    [['all', 'main.wpMineRoleAll'], ['responsible', 'main.wpMineRoleResp'], ['executor', 'main.wpMineRoleExec']].forEach(([k, l]) => roles.appendChild(pill(t(l), mineRole === k, () => { mineRole = k; render(); })));
    bodyEl.appendChild(roles);
    bodyEl.appendChild(searchNode(mineQuery, 'main.wpMineSearchPlaceholder', (v) => { mineQuery = v; draw(); }));
    bodyEl.appendChild(host);
    draw();
}

function renderTeam() {
    const today = todayYmd();
    const all = team.activities;
    const counts = { open: all.filter((a) => a.status !== 'done').length, late: all.filter((a) => dueInfo(a, today).group === 'late').length, done: all.filter((a) => a.status === 'done').length, all: all.length };
    const host = el('div');
    const draw = () => {
        host.innerHTML = '';
        const shown = all.filter((a) => {
            if (teamPerson !== 'all' && String(a.person.userId) !== String(teamPerson)) return false;
            if (!matchesQuery(teamQuery, `${a.title} ${a.planTitle} ${a.person.name} ${(a.path || []).join(' ')}`)) return false;
            if (teamFilter === 'open') return a.status !== 'done';
            if (teamFilter === 'late') return dueInfo(a, today).group === 'late';
            if (teamFilter === 'done') return a.status === 'done';
            return true;
        });
        if (!all.length) { host.appendChild(el('p', 'home-carga-empty-note', t('main.wpTeamEmptyTitle'))); return; }
        if (!shown.length) { host.appendChild(el('p', 'home-carga-empty-note', t(teamQuery.trim() ? 'main.wpNoMatches' : 'main.wpMineNone'))); return; }
        let drawn = 0;
        team.members.forEach((m) => {
            const list = shown.filter((a) => a.person.userId === m.userId);
            if (!list.length || drawn >= MAX_ROWS) return;
            const head = el('h4', 'wpapp-group wpapp-team-head');
            head.append(el('span', 'wpapp-avatar', initials(m.name)), el('span', '', m.name), el('small', m.late ? 'late' : '', t('main.wpTeamCounts', { open: m.open, late: m.late, done: m.done })));
            host.appendChild(head);
            list.slice(0, MAX_ROWS - drawn).forEach((a) => host.appendChild(rowNode(a, today, 'team')));
            drawn += list.length;
        });
        if (shown.length > MAX_ROWS) host.appendChild(el('p', 'pm-app-note', t('home.wpappShowing', { n: MAX_ROWS, total: shown.length })));
        if (team.truncated) host.appendChild(el('p', 'pm-app-note', t('main.wpMineTruncated', { n: all.length })));
    };
    bodyEl.appendChild(filtersNode(teamFilter, counts, (k) => { teamFilter = k; render(); }));
    const select = el('select', 'pm-app-input wpapp-person');
    select.setAttribute('aria-label', t('main.wpTeamPersonName'));
    select.setAttribute('data-help-key', 'appWpPerson');
    select.innerHTML = `<option value="all">${esc(t('main.wpTeamPersonAll'))}</option>${team.members.map((m) => `<option value="${m.userId}"${String(teamPerson) === String(m.userId) ? ' selected' : ''}>${esc(m.name)}${m.open ? ` · ${m.open}` : ''}</option>`).join('')}`;
    select.addEventListener('change', () => { teamPerson = select.value; draw(); });
    bodyEl.appendChild(select);
    bodyEl.appendChild(searchNode(teamQuery, 'main.wpTeamSearchPlaceholder', (v) => { teamQuery = v; draw(); }));
    bodyEl.appendChild(host);
    draw();
}

// --- El detalle de una actividad ------------------------------------------------------------------------------------------------------------------
function findOpen() {
    if (!openRef) return null;
    if (openRef.from === 'team') return team.activities.find((a) => a.planId === openRef.planId && a.itemId === openRef.itemId && (openRef.person == null || a.person.userId === openRef.person)) || null;
    const found = mine.activities.find((a) => a.planId === openRef.planId && a.itemId === openRef.itemId);
    return found ? effective(found) : null;
}
function renderDetail() {
    const a = findOpen();
    if (!a) { screen = 'list'; render(); return; }
    titleEl.textContent = a.title;
    const today = todayYmd();
    const { chips } = chipsOf(a, today);
    const head = el('div', 'pm-app-card wpapp-detail');
    head.append(el('b', 'pm-app-title', a.title), el('span', 'wpapp-crumbs', [a.planTitle, ...(a.path || [])].join(' › ')), chips);
    const acts = openRef.from === 'mine' ? actionsNode(a) : null;
    if (acts) head.appendChild(acts);
    bodyEl.appendChild(head);
    const rows = [
        a.person ? [t('main.wpTeamPersonName'), a.person.name] : null,
        [t('main.wpFieldResponsible'), a.responsibleName || t('main.wpNoResponsible')],
        [t('main.wpFieldExecutor'), a.executorName || '—'],
        [t('main.wpFieldFrom'), a.startDate ? longDate(a.startDate) : t('main.wpNoDates')],
        [t('main.wpFieldTo'), a.endDate ? longDate(a.endDate) : t('main.wpNoDates')],
    ].filter(Boolean);
    const meta = el('div', 'pm-app-meta');
    meta.innerHTML = rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    bodyEl.appendChild(meta);
    if (a.note) { const note = el('div', 'pm-app-card'); note.append(el('b', 'pm-app-title', t('main.wpFieldNote').replace(/s*(.*)s*$/, '')), el('p', 'wpapp-note', a.note)); bodyEl.appendChild(note); }
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (screen === 'detail') { screen = 'list'; openRef = null; render(); return; }
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
        if (!user || !user.clientId) { window.location.replace('AppInicio.html'); return; } // las cuentas de SaaS no tienen planes
        await loadBrandingForTheme();
        applyStyle(getStoredStyle());
        await refreshQueued();
        await loadData();
        render();
    } catch (err) {
        console.error('Planes de trabajo (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
