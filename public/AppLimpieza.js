// ---------------------------------------------------------------------------
// Limpieza (App) — la misma pantalla de la Web (Operaciones > Limpieza) hecha para el celular:
//   · Activos: los activos del Layout de cada centro de costos (anaqueles, racks, gabetas…) con el estado de su última limpieza (En curso, Terminada, Sin terminar o Sin limpiar), con buscador;
//   · Limpiezas: la lista (las que están en curso, primero; las de este celular que todavía no se envían salen como «En tu celular») y el detalle con el cronómetro y las fotos;
//   · Empezar (un toque en el activo): quién limpia (siempre se pide) y la foto de ANTES (obligatoria); queda en marcha con su cronómetro. Terminar (desde la limpieza en curso): la foto de DESPUÉS (obligatoria) y se
//     guarda cuánto duró. Los activos se guardan en el celular y las dos mitades van en la cola de AppOfflineSync.js ("En tu celular"), así que se limpia SIN señal: el fin se refiere al inicio por la clave que le pone el
//     celular y los dos se aplican en orden al reconectar, con las horas a las que se hicieron (el servidor guarda aparte la hora en que los recibió).
// Es la misma limpieza que se hace al escanear el QR del activo (en la Web aparece con origen «App»). Solo quien la empezó la puede terminar. Corregir el nombre y eliminar se siguen haciendo en la Web.
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
const API = '/api/business/limpieza';
const LIST_API = '/api/business/cleanings';
const RECORD_PREFIX = 'limpieza';
const PHOTO_MAX_BYTES = 420 * 1024;           // el servidor acepta hasta ~450 KB por foto
const MAX_ROWS = 60;                          // los activos que se dibujan a la vez (un almacén grande tiene miles): el buscador trae el resto
let currentUser = null;
let isClientAdmin = false;
let effectiveGrants = [];
let costCenters = [];
let records = [];             // limpiezas del servidor (la más nueva primero)
let qStarts = [];             // limpiezas empezadas sin señal que siguen en la cola de este celular
let qFinishes = [];           // limpiezas terminadas sin señal que siguen en la cola
let options = { spacesByCenter: {}, lastByCenter: {} };
let optionsState = 'loading'; // 'loading' | 'online' | 'cached' | 'none'
let view = 'list';            // 'list' | 'detail' | 'start' | 'finish' | 'done'
let tab = 'spaces';           // 'spaces' | 'cleanings'
let search = '';
let openKey = null;           // la limpieza abierta
let siteBlocked = false;

function isUnrestrictedClientAdmin() { return isClientAdmin && effectiveGrants.length === 0; }
function hasCostCenterPermission(ccId) {
    if (isUnrestrictedClientAdmin()) return true;
    return effectiveGrants.some((g) => g.sectionId === 'main' && g.itemId === 'cc-list' && g.submenuId === `cc-${ccId}`);
}
function selectedCostCenterIds() {
    try {
        const parsed = JSON.parse(localStorage.getItem('costCenterSelection') || 'null');
        if (Array.isArray(parsed)) return new Set(parsed.map(Number));
    } catch { /* se toma como "todos" */ }
    return null;
}
const sync = () => window.SgnOfflineSync;

function formatTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(currentLang() === 'es' ? 'es-MX' : 'en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
// 1 h 05 min 03 s · 12 min 30 s · 45 s (el mismo texto de la pantalla Web)
function durationText(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
    if (h) return `${h} h ${m} min ${r} s`;
    if (m) return `${m} min ${r} s`;
    return `${r} s`;
}
const secondsBetween = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));
const userLabel = () => (currentUser && (currentUser.name || currentUser.username)) || '';
// El tipo de un activo (Anaquel, Rack, Gabeta…); un tipo que la pantalla no conoce se muestra tal cual.
function typeLabel(type) {
    const key = `main.layoutType_space_${type || 'rack'}`;
    const label = t(key);
    return label && label !== key ? label : (type || '');
}
const spaceText = (code, type) => `${code || ''}${code ? ' · ' : ''}${typeLabel(type)}`;
const centerOf = (ccId) => costCenters.find((c) => c.id === Number(ccId));
const centerText = (cc) => (cc ? `${cc.code ? `${cc.code} · ` : ''}${cc.name}` : '');
const spacesOf = (ccId) => (options.spacesByCenter && options.spacesByCenter[ccId]) || [];

// --- Opciones (los activos del Layout de cada centro y la última limpieza de cada uno): se bajan al abrir y se guardan en el celular para limpiar sin señal ----------------------------
function cacheDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('sgn-lim-cache', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function cacheSave(value) {
    const db = await cacheDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, 'options');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
async function cacheRead() {
    const db = await cacheDb();
    return new Promise((resolve, reject) => {
        const req = db.transaction('kv', 'readonly').objectStore('kv').get('options');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}
async function loadOptions() {
    optionsState = 'loading';
    const clientId = currentUser ? (currentUser.clientId ?? null) : null;
    try {
        const res = await fetch(apiUrl(`${API}/options`), { credentials: 'include' });
        if (res.ok) {
            const body = await res.json();
            options = { spacesByCenter: body.spacesByCenter || {}, lastByCenter: body.lastByCenter || {} };
            optionsState = 'online';
            cacheSave({ clientId, options, at: body.at }).catch(() => { /* sin almacenamiento: se bajan otra vez la próxima */ });
            return;
        }
    } catch { /* sin señal: se usan las guardadas */ }
    try {
        const saved = await cacheRead();
        // lo guardado solo sirve si es de la misma empresa (otra cuenta en el mismo celular no ve activos ajenos)
        if (saved && saved.options && (saved.clientId ?? null) === clientId) { options = saved.options; optionsState = 'cached'; return; }
    } catch { /* sin datos guardados */ }
    optionsState = 'none';
}
async function loadCostCenters() {
    try {
        const res = await fetch(apiUrl('/api/business/cost-centers'), { credentials: 'include' });
        if (!res.ok) return;
        const body = await res.json();
        costCenters = (body.costCenters || []).filter((cc) => hasCostCenterPermission(cc.id));
    } catch {
        costCenters = [];
    }
}
async function loadRecords() {
    try {
        const res = await fetch(apiUrl(`${LIST_API}?lite=1`), { credentials: 'include' });
        if (!res.ok) return;
        const body = await res.json();
        records = body.cleanings || [];
    } catch { /* sin señal: se queda con lo que ya se veía */ }
}
// Los centros que se ven: los que la cuenta puede usar y los marcados en la App.
function visibleCenters() {
    const sel = selectedCostCenterIds();
    return costCenters.filter((c) => !sel || sel.has(c.id));
}

// --- Lo que se mandó sin señal y sigue en la cola: el inicio (con su foto de antes) y el fin (con su foto de después) de cada limpieza ------------------------------------------------------------------
const START_URL = /\/api\/business\/limpieza\/start$/;
const FINISH_URL = /\/api\/business\/limpieza\/finish$/;
async function readQueue() {
    try { return await sync().listOfflineQueue(); } catch { return []; }
}
const parseBody = (item) => { try { return JSON.parse(item.body || '{}'); } catch { return null; } };
let queueMineCount = 0;
async function refreshQueued() {
    const queue = await readQueue();
    qStarts = [];
    qFinishes = [];
    queueMineCount = 0;
    queue.forEach((item) => {
        if (item.method !== 'POST' || !item.url) return;
        const isStart = START_URL.test(item.url);
        if (!isStart && !FINISH_URL.test(item.url)) return;
        const body = parseBody(item);
        if (!body) return;
        queueMineCount += 1;
        if (isStart) qStarts.push({ ...body, queuedAt: item.queuedAt });
        else qFinishes.push({ ...body, queuedAt: item.queuedAt });
    });
}
// AppOfflineSync avisa cada 30 s aunque nada haya cambiado: solo se vuelve a dibujar si cambió lo que esta pantalla tenía en la cola, y nunca mientras se escribe en «Empezar» o «Terminar» (se perdería lo que se está haciendo).
document.addEventListener('sgn:offline-queue-changed', async () => {
    const before = queueMineCount;
    await refreshQueued();
    if (before === queueMineCount) return;
    // al reconectar la cola se vacía: se vuelve a pedir la lista y los activos para ver las limpiezas ya con su número
    if (queueMineCount === 0 && navigator.onLine) await Promise.all([loadRecords(), loadOptions()]);
    if (view === 'list' || view === 'detail') render();
});
document.addEventListener('sgn:offline-rejected', () => { if (view === 'list') render(); });

// Las limpiezas que se muestran: las que siguen en la cola de este celular (con su fin, si ya se terminaron) y las del servidor. Cada una:
// { key, queued, id, ref, cc, centroCostos, spaceId, spaceCode, spaceType, zoneName, locator, name, startedAt, finishedAt, seconds, mine, pendingFinish, hasBefore, hasAfter, beforeSrc, afterSrc, receivedAt }
// pendingFinish = ya se terminó pero el fin sigue en la cola (todavía no llega al servidor). En curso = empezada por esta cuenta y sin terminar.
function buildItems() {
    const out = [];
    const startedRefs = new Set(qStarts.map((s) => s.clientRef));
    const finishOf = (rec) => qFinishes.find((f) => (rec.ref && f.clientRef === rec.ref) || (rec.id && Number(f.id) === rec.id));
    qStarts.forEach((s) => {
        const sp = spacesOf(s.costCenterId).find((x) => x.id === s.spaceId) || {};
        const cc = centerOf(s.costCenterId);
        const item = {
            key: `q:${s.clientRef}`, queued: true, id: null, ref: s.clientRef, cc: Number(s.costCenterId), centroCostos: cc ? cc.name : '', spaceId: s.spaceId, spaceCode: sp.code || '', spaceType: sp.type || '', zoneName: sp.zoneName || '',
            locator: sp.locator || '', name: s.name || userLabel(), startedAt: s.clientAt || s.queuedAt, finishedAt: null, seconds: null, mine: true, pendingFinish: false, hasBefore: !!s.photo, hasAfter: false, beforeSrc: s.thumb || s.photo, beforeFull: s.photo, afterSrc: '', afterFull: '', receivedAt: null,
        };
        const f = finishOf(item);
        if (f) { item.finishedAt = f.clientAt || f.queuedAt; item.seconds = secondsBetween(item.startedAt, item.finishedAt); item.pendingFinish = true; item.hasAfter = !!f.photo; item.afterSrc = f.thumb || f.photo; item.afterFull = f.photo; }
        out.push(item);
    });
    records.forEach((r) => {
        if (r.clientRef && startedRefs.has(r.clientRef)) return; // la misma limpieza ya llegó al servidor y su copia en la cola está por salir
        const cc = centerOf(r.cc);
        const item = {
            key: `c:${r.id}`, queued: false, id: r.id, ref: r.clientRef || '', cc: r.cc, centroCostos: r.centroCostos || (cc ? cc.name : ''), spaceId: r.spaceId, spaceCode: r.spaceCode, spaceType: r.spaceType, zoneName: r.zoneName, locator: r.locator,
            name: r.name, startedAt: r.startedAt, finishedAt: r.finishedAt, seconds: r.seconds, mine: !!r.mine, pendingFinish: false, hasBefore: r.hasBefore, hasAfter: r.hasAfter, beforeSrc: '', beforeFull: '', afterSrc: '', afterFull: '', receivedAt: r.receivedAt || null, source: r.source,
        };
        if (!r.finishedAt && r.mine) {
            const f = finishOf(item);
            if (f) { item.finishedAt = f.clientAt || f.queuedAt; item.seconds = secondsBetween(item.startedAt, item.finishedAt); item.pendingFinish = true; item.hasAfter = !!f.photo; item.afterSrc = f.thumb || f.photo; item.afterFull = f.photo; }
        }
        out.push(item);
    });
    return out.filter((i) => i.queued || !i.cc || (hasCostCenterPermission(i.cc) && (!selectedCostCenterIds() || selectedCostCenterIds().has(Number(i.cc)))))
        .sort((a, b) => (Number(isRunning(b)) - Number(isRunning(a))) || (Date.parse(b.startedAt) - Date.parse(a.startedAt)));
}
const isRunning = (i) => !i.finishedAt && i.mine;
// El estado de un activo: la limpieza en curso (de esta cuenta), la más nueva que se conoce o, si no está entre las de la lista, la que bajaron las opciones.
function stateOf(items, ccId, spaceId) {
    const mine = items.filter((i) => Number(i.cc) === Number(ccId) && i.spaceId === spaceId);
    const running = mine.find(isRunning);
    if (running) return { kind: 'running', item: running };
    const newest = mine[0];
    if (newest) return { kind: newest.finishedAt ? 'done' : 'open', at: newest.finishedAt || newest.startedAt, seconds: newest.seconds, item: newest };
    const last = options.lastByCenter && options.lastByCenter[ccId] && options.lastByCenter[ccId][spaceId];
    if (last) return { kind: last.finished ? 'done' : 'open', at: last.at };
    return { kind: 'never' };
}

// --- Fotos: se piden con la sesión y se muestran como imagen local (en la App instalada la dirección del servidor es de otro origen). Se entregan como data: (la política de seguridad del servidor solo deja
// cargar imágenes propias y data:, no blob:); las miniaturas se guardan mientras la pantalla está abierta y las fotos completas no.
const photoCache = new Map();
const blobToDataUrl = (blob) => new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob); });
async function photoUrl(id, kind, thumb) {
    const url = `${LIST_API}/${id}/photo/${kind}${thumb ? '?thumb=1' : ''}`;
    if (photoCache.has(url)) return photoCache.get(url);
    const res = await fetch(apiUrl(url), { credentials: 'include' });
    if (!res.ok) throw new Error('photo');
    const dataUrl = await blobToDataUrl(await res.blob());
    if (thumb) photoCache.set(url, dataUrl);
    return dataUrl;
}
function fillImage(img, id, kind, thumb) {
    photoUrl(id, kind, thumb).then((src) => { img.src = src; }).catch(() => { img.alt = '—'; });
}

// --- Pantalla --------------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
document.getElementById('carga-progress-track').hidden = true;
document.getElementById('carga-progress-label').hidden = true;

function render() {
    bodyEl.innerHTML = '';
    if (siteBlocked) { window.AppSiteGate.show(bodyEl, t); titleEl.textContent = t('menu.opCentroDistLimpieza'); return; }
    if (view === 'start') renderStart();
    else if (view === 'finish') renderFinish();
    else if (view === 'done') renderDone();
    else if (view === 'detail') renderDetail();
    else renderList();
    tickTimers();
}
// Los cronómetros de las limpiezas en curso: cada elemento con data-since cuenta desde su hora de inicio.
function tickTimers() {
    document.querySelectorAll('[data-since]').forEach((el) => { el.textContent = durationText((Date.now() - Date.parse(el.dataset.since)) / 1000); });
}
setInterval(tickTimers, 1000);

function renderRejectedBanner() {
    const rejected = sync().listRejected();
    if (!rejected.length) return;
    const box = document.createElement('div');
    box.className = 'relapp-rejected';
    box.innerHTML = `<b><i class="bx bx-error-circle" aria-hidden="true"></i> ${esc(t('home.relappRejectedTitle'))}</b>${rejected.map((r) => `<p>${esc(r.description)}${r.message ? ` — ${esc(r.message)}` : ''}</p>`).join('')}<button type="button" class="home-carga-secondary-btn">${esc(t('home.relappRejectedOk'))}</button>`;
    box.querySelector('button').addEventListener('click', () => { sync().clearRejected(); });
    bodyEl.appendChild(box);
}

const statePill = (st) => {
    if (st.kind === 'running') return `<span class="pm-app-pill pm-app-pill-pending">${esc(t('home.limRunning'))}</span>`;
    if (st.kind === 'done') return `<span class="pm-app-pill pm-app-pill-supplied">${esc(t('home.limDone'))}</span>`;
    if (st.kind === 'open') return `<span class="pm-app-pill pm-app-pill-mixed">${esc(t('home.limOpen'))}</span>`;
    return `<span class="pm-app-pill pm-app-pill-queued">${esc(t('home.limNever'))}</span>`;
};

function renderList() {
    titleEl.textContent = t('menu.opCentroDistLimpieza');
    renderRejectedBanner();
    const tabs = document.createElement('div');
    tabs.className = 'seg-app-tabs';
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('data-help-key', 'appLimTabs');
    [['spaces', t('home.limTabSpaces')], ['cleanings', t('home.limTabCleanings')]].forEach(([key, label]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'seg-app-tab';
        btn.setAttribute('aria-pressed', String(tab === key));
        btn.textContent = label;
        btn.addEventListener('click', () => { tab = key; render(); });
        tabs.appendChild(btn);
    });
    bodyEl.appendChild(tabs);
    if (tab === 'cleanings') renderCleanings(); else renderSpaces();
}

// Los activos de los centros que se ven, con el estado de su limpieza; un toque empieza una limpieza (o abre la que está en curso para terminarla).
function renderSpaces() {
    if (optionsState === 'none') { const p = document.createElement('p'); p.className = 'home-carga-empty-note'; p.textContent = t('home.limOptionsNone'); bodyEl.appendChild(p); return; }
    if (optionsState === 'cached') { const p = document.createElement('p'); p.className = 'pm-app-note'; p.textContent = t('home.limOptionsCached'); bodyEl.appendChild(p); }
    const centers = visibleCenters();
    if (!centers.length) { const p = document.createElement('p'); p.className = 'home-carga-empty-note'; p.textContent = t('home.limNoCenters'); bodyEl.appendChild(p); return; }
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'pm-app-input seg-app-search';
    input.placeholder = t('home.limSearchPlaceholder');
    input.setAttribute('aria-label', t('home.limSearchPlaceholder'));
    input.value = search;
    bodyEl.appendChild(input);
    const listEl = document.createElement('div');
    bodyEl.appendChild(listEl);
    const items = buildItems();
    const draw = () => {
        listEl.innerHTML = '';
        const needle = search.trim().toLowerCase();
        const rows = [];
        centers.forEach((cc) => spacesOf(cc.id).forEach((sp) => {
            const hay = `${sp.code} ${typeLabel(sp.type)} ${sp.locator} ${sp.zoneName} ${sp.footprintCode} ${centerText(cc)}`.toLowerCase();
            if (needle && !hay.includes(needle)) return;
            rows.push({ cc, sp, st: stateOf(items, cc.id, sp.id) });
        }));
        if (!rows.length) { const p = document.createElement('p'); p.className = 'home-carga-empty-note'; p.textContent = t(needle ? 'home.limNoMatch' : 'home.limSpacesEmpty'); listEl.appendChild(p); return; }
        rows.sort((a, b) => Number(b.st.kind === 'running') - Number(a.st.kind === 'running')); // las que están en curso, primero
        rows.slice(0, MAX_ROWS).forEach(({ cc, sp, st }) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'home-carga-active-row';
            const sub = [sp.locator || sp.zoneName, centers.length > 1 ? cc.name : ''].filter(Boolean).join(' · ');
            const when = st.kind === 'running' ? `<small><b data-since="${esc(st.item.startedAt)}"></b></small>` : (st.at ? `<small>${esc(st.item && st.item.queued ? t('home.incOnPhone') : formatTime(st.at))}</small>` : '');
            row.innerHTML = `
                <span class="home-carga-active-row-icon"><i class="bx bx-brush-alt" aria-hidden="true"></i></span>
                <span class="home-carga-active-row-label"><p>${esc(spaceText(sp.code, sp.type))}</p><span>${esc(sub)}</span></span>
                <span class="seg-app-last">${statePill(st)}${when}</span>`;
            row.addEventListener('click', () => {
                if (st.kind === 'running') { openKey = st.item.key; view = 'detail'; render(); return; }
                startClean(cc.id, sp);
            });
            listEl.appendChild(row);
        });
        if (rows.length > MAX_ROWS) { const p = document.createElement('p'); p.className = 'pm-app-note'; p.textContent = t('home.limShowing', { n: MAX_ROWS, total: rows.length }); listEl.appendChild(p); }
        tickTimers();
    };
    input.addEventListener('input', () => { search = input.value; draw(); });
    draw();
}

// Las limpiezas (las que están en curso, primero; las de este celular que todavía no se envían salen como «En tu celular»).
function renderCleanings() {
    const list = buildItems();
    if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('home.limCleaningsEmpty');
        bodyEl.appendChild(empty);
        return;
    }
    list.forEach((r) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        const running = isRunning(r);
        const sub = [r.name, formatTime(r.startedAt)].filter(Boolean).join(' · ');
        const status = running ? `<span class="pm-app-pill pm-app-pill-pending">${esc(t('home.limRunning'))}</span>`
            : (r.finishedAt ? `<span class="pm-app-pill pm-app-pill-supplied">${esc(durationText(r.seconds))}</span>` : `<span class="pm-app-pill pm-app-pill-mixed">${esc(t('home.limOpen'))}</span>`);
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx ${r.queued || r.pendingFinish ? 'bx-cloud-upload' : 'bx-brush-alt'}" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label"><p>${esc(spaceText(r.spaceCode, r.spaceType))}</p><span>${esc(sub)}</span></span>
            <span class="inc-app-pills">${status}${running ? `<small><b data-since="${esc(r.startedAt)}"></b></small>` : ''}${r.queued || r.pendingFinish ? `<span class="pm-app-pill pm-app-pill-queued">${esc(t('home.incOnPhone'))}</span>` : ''}</span>`;
        row.addEventListener('click', () => { openKey = r.key; view = 'detail'; render(); });
        bodyEl.appendChild(row);
    });
}

// --- Detalle de una limpieza ---------------------------------------------------------------------------------------------------------------
function renderDetail() {
    const r = buildItems().find((x) => x.key === openKey);
    if (!r) { view = 'list'; render(); return; }
    titleEl.textContent = r.queued ? t('home.incOnPhone') : `LIM-${r.id}`;
    const running = isRunning(r);
    if (running) {
        const timer = document.createElement('div');
        timer.className = 'pm-app-card lim-app-timer-card';
        timer.setAttribute('data-help-key', 'appLimCronometro');
        timer.innerHTML = `<span class="pm-app-lbl">${esc(t('home.limElapsed'))}</span><div class="lim-app-timer" data-since="${esc(r.startedAt)}"></div>`;
        bodyEl.appendChild(timer);
    }
    const meta = document.createElement('div');
    meta.className = 'pm-app-meta';
    const rows = [
        [t('main.colLimActivo'), spaceText(r.spaceCode, r.spaceType)],
        [t('main.colLimZona'), r.zoneName || '—'],
        [t('home.incCenter'), r.centroCostos || '—'],
        [t('main.colLimQuien'), r.name || '—'],
        [t('main.colLimInicio'), formatTime(r.startedAt)],
        [t('main.colLimFin'), r.finishedAt ? formatTime(r.finishedAt) : '—'],
        r.finishedAt ? [t('main.colLimDuracion'), durationText(r.seconds)] : null,
        r.receivedAt ? [t('main.pmRecibido'), formatTime(r.receivedAt)] : null,
        [t('main.colLimOrigen'), t('main.limOrigenApp')],
    ].filter(Boolean);
    meta.innerHTML = rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    bodyEl.appendChild(meta);

    const photos = document.createElement('div');
    photos.className = 'pm-app-card';
    photos.innerHTML = `<h4 class="pm-app-title">${esc(t('home.limPhotos'))}</h4>`;
    const grid = document.createElement('div');
    grid.className = 'inc-app-shots lim-app-shots';
    [['before', r.hasBefore, r.beforeSrc, r.beforeFull, t('main.limFotoAntes')], ['after', r.hasAfter, r.afterSrc, r.afterFull, t('main.limFotoDespues')]].forEach(([kind, has, src, full, label]) => {
        const cell = document.createElement('div');
        cell.className = 'lim-app-shotcell';
        if (has) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'inc-app-shot';
            btn.setAttribute('aria-label', t(kind === 'before' ? 'main.limFotoAntesVer' : 'main.limFotoDespuesVer'));
            const img = document.createElement('img');
            img.alt = '';
            if (src) img.src = src; else if (r.id) fillImage(img, r.id, kind, true);
            btn.appendChild(img);
            btn.addEventListener('click', () => openViewer(r, kind, label, full));
            cell.appendChild(btn);
        } else {
            const none = document.createElement('div');
            none.className = 'inc-app-shot lim-app-shot-none';
            none.textContent = '—';
            cell.appendChild(none);
        }
        const cap = document.createElement('small');
        cap.textContent = label;
        cell.appendChild(cap);
        grid.appendChild(cell);
    });
    photos.appendChild(grid);
    bodyEl.appendChild(photos);

    if (running) {
        const finish = document.createElement('button');
        finish.type = 'button';
        finish.className = 'home-carga-new-btn';
        finish.setAttribute('data-help-key', 'appLimTerminar');
        finish.innerHTML = `<i class="bx bx-check-circle" aria-hidden="true"></i><span>${esc(t('home.limFinish'))}</span>`;
        finish.addEventListener('click', () => startFinish(r));
        bodyEl.appendChild(finish);
    } else if (r.pendingFinish) {
        const note = document.createElement('p');
        note.className = 'pm-app-note';
        note.textContent = t('home.limFinishOnSync');
        bodyEl.appendChild(note);
    }
}
// El visor de la foto (pantalla completa).
function openViewer(r, kind, label, full) {
    const scrim = document.createElement('div');
    scrim.className = 'inc-app-viewer';
    scrim.innerHTML = `<div class="inc-app-viewer-bar"><span>${esc(`${r.spaceCode || ''} · ${label}`)}</span><button type="button" id="lim-app-vclose" aria-label="${esc(t('main.incFotoCerrar'))}"><i class="bx bx-x" aria-hidden="true"></i></button></div>
        <div class="inc-app-viewer-stage"><img id="lim-app-vimg" alt=""></div>`;
    document.body.appendChild(scrim);
    const img = scrim.querySelector('#lim-app-vimg');
    scrim.querySelector('#lim-app-vclose').addEventListener('click', () => scrim.remove());
    if (full) img.src = full; else if (r.id) fillImage(img, r.id, kind, false);
}

// --- Foto de la limpieza: se reduce en el celular (máx. 1280 px de lado, JPEG) para que suba rápido aunque la cámara sea de 12 megapíxeles --------------------------
function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => loadImageElement(file));
    return loadImageElement(file);
}
function loadImageElement(file) {
    // la política de seguridad del servidor solo deja cargar imágenes propias y data: (no blob:): la foto se lee como data:
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onerror = () => reject(new Error('image'));
        fr.onload = () => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('image'));
            img.src = fr.result;
        };
        fr.readAsDataURL(file);
    });
}
function thumbOf(canvas) {
    const k = Math.min(1, 160 / Math.max(canvas.width, canvas.height));
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(canvas.width * k));
    small.height = Math.max(1, Math.round(canvas.height * k));
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    return small.toDataURL('image/jpeg', 0.6);
}
async function preparePhoto(file) {
    const bmp = await loadBitmap(file);
    const w = bmp.width || bmp.naturalWidth;
    const h = bmp.height || bmp.naturalHeight;
    if (!w || !h) throw new Error('size');
    let scale = Math.min(1, 1280 / Math.max(w, h));
    for (let pass = 0; pass < 4; pass++) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
        for (const q of [0.78, 0.68, 0.58, 0.48, 0.38]) {
            const url = canvas.toDataURL('image/jpeg', q);
            if (url.length * 0.75 < PHOTO_MAX_BYTES) { if (bmp.close) bmp.close(); return { photo: url, thumb: thumbOf(canvas), bytes: Math.round(url.length * 0.75) }; }
        }
        scale *= 0.75;
    }
    throw new Error('too big');
}

// --- Empezar y terminar -----------------------------------------------------------------------------------------------------------------
// draft = { mode: 'start' | 'finish', costCenterId, space, item, name, photo: { photo, thumb, bytes } | null, preparing, clientRef }
let draft = null;
const NAME_KEY = 'sgn_lim_name';
function newRef() {
    const bytes = new Uint8Array(12);
    (window.crypto || {}).getRandomValues?.(bytes);
    const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') || Math.random().toString(16).slice(2).padEnd(24, '0');
    return `app-${Date.now().toString(36)}-${rand}`;
}
function startClean(costCenterId, space) {
    // «Quién limpia» siempre se pide: viene escrito con el último nombre usado (o el de la cuenta) y se puede cambiar
    let name = '';
    try { name = localStorage.getItem(NAME_KEY) || ''; } catch { /* sin almacenamiento */ }
    draft = { mode: 'start', costCenterId, space, item: null, name: name || userLabel(), photo: null, preparing: 0, clientRef: newRef() };
    view = 'start';
    render();
}
function startFinish(item) {
    draft = { mode: 'finish', costCenterId: item.cc, space: null, item, name: item.name, photo: null, preparing: 0, clientRef: '' };
    view = 'finish';
    render();
}

// La caja de la foto (de antes o de después): una sola, obligatoria; se reduce en el celular.
function photoBox(sendBtn, hintKey, titleKey, helpKey) {
    const box = document.createElement('div');
    box.className = 'pm-app-card';
    box.setAttribute('data-help-key', helpKey);
    const draw = () => {
        box.innerHTML = `<h4 class="pm-app-title">${esc(t(titleKey))} <span class="pm-app-req" aria-hidden="true">*</span></h4><p class="pm-app-note">${esc(t(hintKey))}</p>`;
        if (draft.photo) {
            const cell = document.createElement('div');
            cell.className = 'inc-app-shots';
            cell.innerHTML = `<div class="inc-app-shot"><img alt="" src="${esc(draft.photo.thumb)}"></div>`;
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'inc-app-shot-rm';
            rm.setAttribute('aria-label', t('home.incRemove'));
            rm.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
            rm.addEventListener('click', () => { draft.photo = null; draw(); });
            cell.firstElementChild.appendChild(rm);
            box.appendChild(cell);
        }
        if (draft.preparing) { const w = document.createElement('p'); w.className = 'pm-app-note'; w.textContent = t('home.limPreparing'); box.appendChild(w); }
        const add = document.createElement('label');
        add.className = 'home-carga-secondary-btn inc-app-add';
        add.innerHTML = `<i class="bx bx-camera" aria-hidden="true"></i> <span>${esc(draft.photo ? t('home.limChangePhoto') : t('home.limAddPhoto'))}</span><input type="file" accept="image/*" capture="environment">`;
        add.querySelector('input').addEventListener('change', async (event) => {
            const file = (event.target.files || [])[0];
            event.target.value = ''; // así se puede volver a elegir la misma foto
            if (!file) return;
            draft.preparing += 1;
            draw();
            try { draft.photo = await preparePhoto(file); } catch { showToast(t('home.limErrPhoto')); }
            draft.preparing -= 1;
            draw();
        });
        box.appendChild(add);
        sendBtn.disabled = draft.preparing > 0;
    };
    draw();
    return box;
}
function activoCard(spaceLike, centerName) {
    const head = document.createElement('div');
    head.className = 'pm-app-card seg-app-head';
    head.setAttribute('data-help-key', 'appLimActivo');
    head.innerHTML = `<h4 class="pm-app-title">${esc(spaceText(spaceLike.code, spaceLike.type))}</h4><p class="pm-app-note">${esc([spaceLike.locator || spaceLike.zoneName, centerName].filter(Boolean).join(' · '))}</p>`;
    return head;
}

function renderStart() {
    titleEl.textContent = t('home.limStartTitle');
    const sp = draft.space;
    const cc = centerOf(draft.costCenterId);
    bodyEl.appendChild(activoCard(sp, cc ? centerText(cc) : ''));
    if (optionsState === 'cached') { const p = document.createElement('p'); p.className = 'pm-app-note'; p.textContent = t('home.limOptionsCached'); bodyEl.appendChild(p); }
    // quién limpia (siempre se pide el nombre)
    const whoBox = document.createElement('div');
    whoBox.className = 'pm-app-card';
    whoBox.innerHTML = `<label class="pm-app-qty-label pm-app-who-label" for="lim-app-who">${esc(t('home.limWho'))} <span class="pm-app-req" aria-hidden="true">*</span></label><input id="lim-app-who" class="pm-app-input" type="text" maxlength="60" autocomplete="name" required placeholder="${esc(t('home.limWhoPlaceholder'))}" value="${esc(draft.name)}">`;
    bodyEl.appendChild(whoBox);
    whoBox.querySelector('#lim-app-who').addEventListener('input', (event) => { draft.name = event.target.value; });
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'home-carga-new-btn pm-app-send';
    sendBtn.innerHTML = `<i class="bx bx-play-circle" aria-hidden="true"></i><span>${esc(t('home.limStart'))}</span>`;
    bodyEl.appendChild(photoBox(sendBtn, 'home.limPhotoBeforeHint', 'home.limPhotoBefore', 'appLimFotoAntes'));
    sendBtn.addEventListener('click', () => {
        if (!draft.name.replace(/\s+/g, ' ').trim()) { showToast(t('home.limNeedName')); bodyEl.querySelector('#lim-app-who')?.focus(); return; }
        if (!draft.photo) { showToast(t('home.limNeedPhoto')); return; }
        sendStart(sendBtn);
    });
    bodyEl.appendChild(sendBtn);
}
function renderFinish() {
    titleEl.textContent = t('home.limFinishTitle');
    const it = draft.item;
    bodyEl.appendChild(activoCard({ code: it.spaceCode, type: it.spaceType, locator: it.locator, zoneName: it.zoneName }, it.centroCostos));
    const timer = document.createElement('div');
    timer.className = 'pm-app-card lim-app-timer-card';
    timer.innerHTML = `<span class="pm-app-lbl">${esc(t('home.limElapsed'))}</span><div class="lim-app-timer" data-since="${esc(it.startedAt)}"></div>`;
    bodyEl.appendChild(timer);
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'home-carga-new-btn pm-app-send';
    sendBtn.innerHTML = `<i class="bx bx-check-circle" aria-hidden="true"></i><span>${esc(t('home.limFinish'))}</span>`;
    bodyEl.appendChild(photoBox(sendBtn, 'home.limPhotoAfterHint', 'home.limPhotoAfter', 'appLimFotoDespues'));
    sendBtn.addEventListener('click', () => {
        if (!draft.photo) { showToast(t('home.limNeedPhoto')); return; }
        sendFinish(sendBtn);
    });
    bodyEl.appendChild(sendBtn);
}
const SERVER_ERRORS = { NAME: 'home.limNeedName', PHOTO: 'home.limErrPhoto', SPACE: 'home.limSpaceGone', CENTER: 'home.limNoCenters', NOTFOUND: 'home.limNotFound' };
const sendError = (result) => showToast(SERVER_ERRORS[result.body.code] ? t(SERVER_ERRORS[result.body.code]) : (result.body.message || t('home.limErrSend')));

async function sendStart(sendBtn) {
    if (!draft) return;
    const name = draft.name.replace(/\s+/g, ' ').trim().slice(0, 60);
    const ref = draft.clientRef;
    const sp = draft.space;
    const body = { costCenterId: draft.costCenterId, spaceId: sp.id, name, photo: draft.photo.photo, thumb: draft.photo.thumb, clientAt: new Date().toISOString(), clientRef: ref };
    const cc = centerOf(draft.costCenterId);
    const description = `${t('menu.opCentroDistLimpieza')} · ${cc ? cc.name : ''} · ${sp.code || ''}`;
    if (sendBtn) sendBtn.disabled = true;
    try {
        // rejectable: si ya con señal el servidor lo rechaza (el activo dejó de existir) se anota en "No se aplicó" en vez de trabar la cola
        const result = await sync().offlineAwareFetch(
            `${API}/start`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) },
            description, `${RECORD_PREFIX}-start:${ref}`, null, { rejectable: true },
        );
        if (!result.queued && !result.ok) { sendError(result); if (sendBtn) sendBtn.disabled = false; return; }
        try { localStorage.setItem(NAME_KEY, name); } catch { /* sin almacenamiento */ }
        const rec = result.queued ? null : result.body.record;
        doneInfo = { kind: 'start', queued: !!result.queued, id: rec ? rec.id : null, key: rec ? `c:${rec.id}` : `q:${ref}`, name, at: rec ? rec.startedAt : body.clientAt, space: spaceText(sp.code, sp.type), zone: sp.zoneName, centroCostos: cc ? cc.name : '' };
        if (!result.queued) await Promise.all([loadRecords(), loadOptions()]);
        draft = null;
        await refreshQueued();
        view = 'done';
        render();
    } catch {
        showToast(t('home.limErrSend'));
        if (sendBtn) sendBtn.disabled = false;
    }
}
async function sendFinish(sendBtn) {
    if (!draft) return;
    const it = draft.item;
    const body = { photo: draft.photo.photo, thumb: draft.photo.thumb, clientAt: new Date().toISOString() };
    if (it.ref) body.clientRef = it.ref;
    if (it.id) body.id = it.id;
    const description = `${t('menu.opCentroDistLimpieza')} · ${it.centroCostos || ''} · ${it.spaceCode || ''} · ${t('home.limFinish')}`;
    if (sendBtn) sendBtn.disabled = true;
    try {
        const result = await sync().offlineAwareFetch(
            `${API}/finish`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) },
            description, `${RECORD_PREFIX}-finish:${it.key}`, null, { rejectable: true },
        );
        if (!result.queued && !result.ok) { sendError(result); if (sendBtn) sendBtn.disabled = false; return; }
        const rec = result.queued ? null : result.body.record;
        doneInfo = { kind: 'finish', queued: !!result.queued, id: rec ? rec.id : it.id, key: rec ? `c:${rec.id}` : it.key, name: it.name, at: rec ? rec.finishedAt : body.clientAt, seconds: rec ? rec.seconds : secondsBetween(it.startedAt, body.clientAt), space: spaceText(it.spaceCode, it.spaceType), zone: it.zoneName, centroCostos: it.centroCostos };
        if (!result.queued) await Promise.all([loadRecords(), loadOptions()]);
        draft = null;
        await refreshQueued();
        view = 'done';
        render();
    } catch {
        showToast(t('home.limErrSend'));
        if (sendBtn) sendBtn.disabled = false;
    }
}

// Lo que se mandó: el inicio (con su número, o «en tu celular» si no hubo señal) o el fin (con lo que duró).
let doneInfo = null;
function renderDone() {
    const d = doneInfo;
    if (!d) { view = 'list'; render(); return; }
    const isStart = d.kind === 'start';
    titleEl.textContent = t(d.queued ? 'home.limSavedTitle' : (isStart ? 'home.limStartedTitle' : 'home.limFinishedTitle'));
    const box = document.createElement('div');
    box.className = 'pm-app-card pm-app-done';
    const big = isStart ? (d.id ? `LIM-${d.id}` : t('home.limNoNumberYet')) : durationText(d.seconds);
    const lbl = isStart ? t('home.limNumber') : t('main.colLimDuracion');
    const note = d.queued ? t(isStart ? 'home.limNumberOnSync' : 'home.limFinishOnSync') : (isStart ? t('home.limStartedNote') : '');
    box.innerHTML = `<div class="pm-app-tick" aria-hidden="true"><i class="bx ${d.queued ? 'bx-cloud-upload' : (isStart ? 'bx-play' : 'bx-check')}"></i></div>
        <span class="pm-app-lbl">${esc(lbl)}</span>
        <div class="pm-app-folio">${esc(big)}</div>
        ${note ? `<p class="pm-app-note">${esc(note)}</p>` : ''}
        <div class="pm-app-meta pm-app-meta-flat">${[[t('main.colLimActivo'), d.space], [t('main.colLimQuien'), d.name], [t(isStart ? 'main.colLimInicio' : 'main.colLimFin'), formatTime(d.at)], [t('main.colLimZona'), d.zone], [t('home.incCenter'), d.centroCostos]].filter(([, v]) => v).map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
    bodyEl.appendChild(box);
    if (isStart) {
        const now = document.createElement('button');
        now.type = 'button';
        now.className = 'home-carga-new-btn';
        now.innerHTML = `<i class="bx bx-check-circle" aria-hidden="true"></i><span>${esc(t('home.limFinishNow'))}</span>`;
        now.addEventListener('click', () => {
            const it = buildItems().find((x) => x.key === d.key);
            doneInfo = null;
            if (it && isRunning(it)) startFinish(it); else { tab = 'cleanings'; view = 'list'; render(); }
        });
        bodyEl.appendChild(now);
    } else {
        const again = document.createElement('button');
        again.type = 'button';
        again.className = 'home-carga-new-btn';
        again.innerHTML = `<i class="bx bx-brush-alt" aria-hidden="true"></i><span>${esc(t('home.limAnother'))}</span>`;
        again.addEventListener('click', () => { doneInfo = null; tab = 'spaces'; view = 'list'; render(); });
        bodyEl.appendChild(again);
    }
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'home-carga-secondary-btn';
    back.textContent = t('home.limBackToList');
    back.addEventListener('click', () => { doneInfo = null; tab = 'cleanings'; view = 'list'; render(); });
    bodyEl.appendChild(back);
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') { window.location.href = 'AppInicio.html'; return; }
    if ((view === 'start' || view === 'finish') && draft && draft.photo && !window.confirm(t('home.limDiscard'))) return;
    const fromDetail = view === 'finish' && draft && draft.item;
    draft = null;
    doneInfo = null;
    view = fromDetail ? 'detail' : 'list';
    render();
});

(async function init() {
    await loadLanguage();
    window.HelpMode?.init(t);
    try {
        const [meRes, businessProfileRes] = await Promise.all([
            fetch(apiUrl('/api/me'), { credentials: 'include' }),
            fetch(apiUrl('/api/me/business-profile'), { credentials: 'include' }),
        ]);
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        currentUser = user;
        isClientAdmin = !!user?.isClientAdmin;
        if (businessProfileRes.ok) {
            const { profile } = await businessProfileRes.json();
            effectiveGrants = profile?.effectiveGrants || [];
        }
        // Toda operación va ligada a un centro de costos completo (AppSiteGate); sin señal no se bloquea.
        siteBlocked = await window.AppSiteGate.blocked();
        await Promise.all([loadCostCenters(), loadBrandingForTheme(), loadOptions()]);
        applyStyle(getStoredStyle());
        await loadRecords();
        await refreshQueued();
        render();
    } catch (err) {
        console.error('Limpieza (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
