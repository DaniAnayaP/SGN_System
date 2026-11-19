// ---------------------------------------------------------------------------
// Pedir alta de código (App) — la misma pantalla de la Web (Operaciones > Pedir alta de código, existe en cada área) hecha para el celular, con el mismo backend (/api/business/sku-requests) y los mismos 24 datos:
//   · Lista: «En tu celular» (lo que se llenó y todavía no termina de subir) y «Mis solicitudes» (estatus, de quién es el turno, avance «N de 24» y reloj; al tocar una se ve su detalle y su línea del tiempo);
//   · Formulario: los datos, las medidas, las 7 categorías y las 6 fotos (con la cámara del celular); lo que no se sabe se marca «Lo llena TI». Basta la Descripción Única para guardar; para enviarla a TI deben estar los 24
//     (llenos o marcados «lo llena TI»). El área es la elegida arriba (departamento › área); el sitio y el centro de costos son opcionales.
//   · Sin señal: BORRADOR EN EL CELULAR. Todo (con las fotos) queda guardado en este celular como «Esperando señal» y se sube solo al volver la señal, en orden: crear la solicitud, subir las fotos y enviarla.
//     Con señal se sube en el momento. No usa la cola de AppOfflineSync.js (esa no sabe encadenar «crear → fotos → enviar»); solo toma de ahí la compresión de las fotos.
// La bandeja de TI (Solicitudes de alta de código), la Habilitación y «Dónde está» se quedan en la Web.
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
const API = '/api/business/sku-requests';
const DB_NAME = 'sgn-pedir-alta';
const DB_STORE = 'drafts';
const MAX_PHOTO_BYTES = 7 * 1024 * 1024;      // el servidor acepta hasta 8 MB por foto
let currentUser = null;
let isClientAdmin = false;
let requests = [];            // las solicitudes mías, del servidor (la última copia buena si no hay señal)
let drafts = [];              // lo guardado en ESTE celular que todavía no se termina de subir
let ctx = null;               // el área elegida arriba: { validArea, canRequest, areaLabel, sites }
let catalog = { options: {} };
let listState = 'loading';    // 'online' | 'cached' | 'none'
let view = 'list';            // 'list' | 'form' | 'detail'
let form = null;              // lo que se está llenando
let openId = null;            // la solicitud abierta
let siteBlocked = false;
let syncing = false;
const department = () => localStorage.getItem('department') || '';
const area = () => localStorage.getItem('area') || '';
const clientIdOf = () => (currentUser ? (currentUser.clientId ?? null) : null);
const userKey = () => `${clientIdOf()}:${currentUser ? currentUser.sub : ''}`;
const sync = () => window.SgnOfflineSync;
const cacheKey = (name) => `sgn_pac_${name}_${userKey()}`;
const readCache = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const writeCache = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin espacio: se pide otra vez con señal */ } };

// Los mismos 24 datos de la Web (SolicitudesCodigo.js): lo que no se sabe se marca «lo llena TI».
const TEXT_FIELDS = [['upc', 'colArticuloUpc'], ['uniqueDescription', 'colArticuloDescUnica'], ['knownDescription', 'colArticuloDescConocida'], ['customDescription', 'colArticuloDescPersonalizada']];
const NUMBER_FIELDS = [['height', 'colArticuloAlto'], ['length', 'colArticuloLargo'], ['width', 'colArticuloAncho'], ['articleWeight', 'colArticuloPesoArticulo'], ['packageWeight', 'colArticuloPesoEmpaque']];
const PHOTO_FIELDS = [['evidenceFront', 'colArticuloEvidenceFront'], ['evidenceBack', 'colArticuloEvidenceBack'], ['evidenceLeft', 'colArticuloEvidenceLeft'], ['evidenceRight', 'colArticuloEvidenceRight'], ['evidenceTop', 'colArticuloEvidenceTop'], ['evidenceBottom', 'colArticuloEvidenceBottom']];
const CATEGORY_FIELDS = [['categoryInventario', 'colArticuloCategoriaInventario', 'inventario'], ['categoryCompra', 'colArticuloCategoriaCompra', 'compra'], ['categoryAlmacenamiento', 'colArticuloCategoriaAlmacenamiento', 'almacenamiento'],
    ['categoryRotacion', 'colArticuloCategoriaRotacion', 'rotacion'], ['categoryManejo', 'colArticuloCategoriaManejo', 'manejo'], ['categoryRiesgo', 'colArticuloCategoriaRiesgo', 'riesgo'], ['categoryVidautil', 'colArticuloCategoriaVidautil', 'vidautil']];
const OPTIONAL_CATEGORY = ['categoryTipoCodigo', 'colArticuloCategoriaTipoCodigo', 'tipocodigo'];
const REQUIRED_KEYS = [...TEXT_FIELDS.map((f) => f[0]), 'mainUom', 'articleType', ...NUMBER_FIELDS.map((f) => f[0]), ...PHOTO_FIELDS.map((f) => f[0]), ...CATEGORY_FIELDS.map((f) => f[0])];
const ALL_DATA_KEYS = [...TEXT_FIELDS.map((f) => f[0]), 'mainUom', 'articleType', 'clientCode', ...NUMBER_FIELDS.map((f) => f[0]), ...CATEGORY_FIELDS.map((f) => f[0]), OPTIONAL_CATEGORY[0]];
const NUMERIC_KEYS = new Set(NUMBER_FIELDS.map((f) => f[0]));
const label = (col) => t(`main.${col}`);
const hasValue = (v) => v !== '' && v !== 0 && v !== undefined && v !== null;

// --- Tiempos y avance (iguales a los de la Web) --------------------------------------------------------------------------------------------
function duration(ms) {
    if (!(ms >= 60000)) return t('main.solDurLessMin');
    const d = Math.floor(ms / 86400000); const h = Math.floor((ms % 86400000) / 3600000); const m = Math.floor((ms % 3600000) / 60000);
    const parts = [];
    if (d) parts.push(t('main.solDurDay', { n: d }));
    if (h) parts.push(t('main.solDurHour', { n: h }));
    if (m && !d) parts.push(t('main.solDurMin', { n: m }));
    return parts.join(' ');
}
const statusChip = (status) => `<span class="pac-chip pac-chip-${esc(status)}">${esc(t(`main.solStatus_${status}`))}</span>`;
const holderText = (holder) => t(`main.solHolder_${holder || 'none'}`);
const progressText = (p) => (p.byTi ? t('main.solProgressTi', { done: p.filled, total: p.total, ti: p.byTi }) : t('main.solProgress', { done: p.filled, total: p.total }));
function formatTime(at) {
    const d = new Date(`${String(at || '').replace(' ', 'T')}${/Z|[+-]\d\d:?\d\d$/.test(String(at || '')) ? '' : 'Z'}`);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(currentLang() === 'es' ? 'es-MX' : 'en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function progressOf(f) {
    let filled = 0; let byTi = 0;
    REQUIRED_KEYS.forEach((key) => {
        const isPhoto = PHOTO_FIELDS.some((p) => p[0] === key);
        const has = isPhoto ? !!(f.photos[key] || f.photoDone[key] || f.existing[key]) : hasValue(f.data[key]);
        if (has) filled += 1; else if (f.tiFields.includes(key)) byTi += 1;
    });
    return { total: REQUIRED_KEYS.length, filled, byTi, missing: REQUIRED_KEYS.length - filled - byTi };
}

// --- Lo guardado en este celular (IndexedDB): el borrador con sus fotos --------------------------------------------------------------------
// «Borrador en el celular»: lo que se llena (y las fotos) queda aquí hasta que se sube; con señal se manda en el acto y sin señal se manda solo al volver (crear la solicitud, subir las fotos y enviarla, en ese orden).
// No usa la cola de AppOfflineSync.js porque esa cola no sabe encadenar «crear → fotos → enviar» (la solicitud necesita su número antes de recibir las fotos).
function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE, { keyPath: 'localId' }); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function dbAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => { const r = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
async function dbPut(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => { const tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).put(record); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}
async function dbDelete(localId) {
    const db = await openDb();
    return new Promise((resolve, reject) => { const tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).delete(localId); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}
async function refreshDrafts() {
    try { drafts = (await dbAll()).filter((d) => d.userKey === userKey()).sort((a, z) => String(z.updatedAt).localeCompare(String(a.updatedAt))); } catch { drafts = []; }
}
const newLocalId = () => `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// --- Hablar con el servidor ------------------------------------------------------------------------------------------------------------------
class NetError extends Error {}
async function call(path, options = {}) {
    let res;
    try {
        res = await fetch(apiUrl(path), { credentials: 'include', ...options, headers: { ...(options.raw ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) } });
    } catch { throw new NetError('network'); }
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
}
// Un texto en el idioma de la pantalla para lo que el servidor contestó (por su código, no por su mensaje).
function errorOf(res) {
    const b = res.body || {};
    if (b.code === 'DESCRIPTION_TAKEN') return { code: b.code, owner: b.owner || '' };
    if (b.code === 'INCOMPLETE') return { code: b.code, n: (b.missing || []).length };
    if (res.status === 403) return { code: 'FORBIDDEN' };
    return { code: b.code || 'ERROR' };
}
function errorText(e) {
    if (!e) return '';
    if (e.code === 'DESCRIPTION_TAKEN') return t('main.solDescTaken', { owner: e.owner });
    if (e.code === 'INCOMPLETE') return t('main.solMissing', { n: e.n });
    if (e.code === 'LOCKED' || e.code === 'STATE') return t('home.pacLocked');
    if (e.code === 'DESCRIPTION') return t('main.solNeedDescription');
    if (e.code === 'AREA') return t('main.solChooseArea');
    if (e.code === 'FORBIDDEN') return t('main.solNoPermission');
    if (e.code === 'PLACE') return t('home.pacPlaceGone');
    return t('main.solSaveError');
}
const isHardError = (status) => [400, 403, 404, 409, 413, 422].includes(status);

// Sube UN borrador: crear la solicitud (o corregir la que ya existe), las fotos que faltan y, si se pidió, mandarla a TI. Cada paso que sale bien se anota, así que un corte de señal a la mitad se retoma donde se quedó.
async function syncOne(d) {
    let adoptedFrom = ''; // el folio de la solicitud mía que se reconoció como la misma (para el aviso si resulta que ya no se puede cambiar)
    if (!d.requestId) {
        const res = await call(API, { method: 'POST', body: JSON.stringify({ department: d.department, area: d.area, siteCode: d.siteCode, costCenterId: d.costCenterId, data: d.data, tiFields: d.tiFields }) });
        if (res.ok) {
            d.requestId = res.body.request.id; d.label = res.body.request.label; d.created = true; // nació con estos mismos datos
            await dbPut(d);
        } else if (res.status === 409 && res.body.code === 'DESCRIPTION_TAKEN') {
            // ¿la tomó mi propio intento anterior (la señal se cortó justo al contestar)? Entonces es esa solicitud mía y se sigue con ella.
            const mine = await call(API);
            const same = mine.ok ? (mine.body.requests || []).find((r) => r.label === res.body.owner && r.uniqueDescription.trim().toLowerCase() === String(d.data.uniqueDescription || '').trim().toLowerCase()) : null;
            if (!same) return { failed: errorOf(res) };
            d.requestId = same.id; d.label = same.label; adoptedFrom = same.label;
            await dbPut(d);
        } else if (isHardError(res.status)) return { failed: errorOf(res) };
        else return { retry: true };
    }
    if (d.requestId && !d.created) {
        // la solicitud ya existe en el servidor: lo escrito se pone encima (si recién se creó con estos mismos datos no pasa nada)
        const res = await call(`${API}/${d.requestId}`, { method: 'PATCH', body: JSON.stringify({ data: d.data, tiFields: d.tiFields }) });
        if (!res.ok && adoptedFrom && res.status === 409) {
            // era una solicitud mía con esa misma Descripción Única que ya no se puede cambiar (TI ya la tiene): este borrador deja de estar amarrado a ella y avisa que esa descripción ya está tomada
            d.requestId = null; d.label = ''; d.created = false;
            await dbPut(d);
            return { failed: { code: 'DESCRIPTION_TAKEN', owner: adoptedFrom } };
        }
        if (!res.ok) return isHardError(res.status) ? { failed: errorOf(res) } : { retry: true };
        d.created = true;
        await dbPut(d);
    }
    for (const [field] of PHOTO_FIELDS) {
        if (!d.photos[field] || d.photoDone[field]) continue;
        const blob = d.photos[field];
        const res = await call(`${API}/${d.requestId}/photo/${field}`, { method: 'POST', raw: true, headers: { 'Content-Type': blob.type || 'image/jpeg' }, body: blob });
        if (!res.ok) return isHardError(res.status) ? { failed: errorOf(res) } : { retry: true };
        d.photoDone[field] = true;
        await dbPut(d);
    }
    if (d.send) {
        const res = await call(`${API}/${d.requestId}/submit`, { method: 'POST', body: '{}' });
        if (!res.ok) return isHardError(res.status) ? { failed: errorOf(res) } : { retry: true };
    }
    return { done: true };
}
async function syncAll() {
    if (!navigator.onLine) return;
    // si ya hay una subida en curso se espera a que termine y se vuelve a pasar (por si el borrador recién guardado llegó tarde)
    while (syncing) await new Promise((resolve) => setTimeout(resolve, 250));
    syncing = true;
    let changed = false;
    try {
        await refreshDrafts();
        for (const d of drafts.filter((x) => x.state !== 'failed')) {
            let result;
            try { result = await syncOne(d); } catch (err) { if (err instanceof NetError) break; throw err; }
            if (result.done) { await dbDelete(d.localId); changed = true; } else if (result.failed) { d.state = 'failed'; d.error = result.failed; await dbPut(d); changed = true; } else break;
        }
    } catch (err) {
        console.error('Pedir alta de código: sync failed', err);
    } finally {
        syncing = false;
        await refreshDrafts();
        if (changed) { await loadRequests(); if (view === 'list') render(); }
        else if (view === 'list') render();
    }
}
window.addEventListener('online', syncAll);
setInterval(syncAll, 30000);

// --- Datos del servidor (con la última copia guardada si no hay señal) ------------------------------------------------------------------------
async function loadRequests() {
    try {
        const res = await call(API);
        if (!res.ok) throw new Error('load failed');
        requests = res.body.requests || [];
        writeCache(cacheKey('list'), requests);
        listState = 'online';
    } catch {
        const saved = readCache(cacheKey('list'));
        requests = saved || [];
        listState = saved ? 'cached' : 'none';
    }
}
async function loadContext() {
    const key = cacheKey(`ctx_${department()}_${area()}`);
    try {
        const res = await call(`${API}/options?department=${encodeURIComponent(department())}&area=${encodeURIComponent(area())}`);
        if (!res.ok) throw new Error('load failed');
        ctx = res.body;
        writeCache(key, ctx);
    } catch {
        // sin señal: lo último que se vio de esta área; si nunca se vio, se deja pedir y el servidor lo revisa al subir
        ctx = readCache(key) || (department() && area() ? { department: department(), area: area(), validArea: true, canRequest: true, areaLabel: '', sites: [], assumed: true } : { validArea: false, canRequest: false, sites: [] });
    }
}
async function loadCatalog() {
    const key = cacheKey('catalog');
    try {
        const res = await call('/api/business/article-categories-active');
        if (!res.ok) throw new Error('load failed');
        catalog = { options: res.body.options || {} };
        writeCache(key, catalog);
    } catch {
        catalog = readCache(key) || { options: {} };
    }
}

// --- Pantalla --------------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
function button(className, html, onClick, helpKey) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    if (helpKey) b.setAttribute('data-help-key', helpKey);
    b.innerHTML = html;
    b.addEventListener('click', onClick);
    return b;
}
function render() {
    bodyEl.innerHTML = '';
    document.getElementById('carga-progress-track').hidden = true;
    document.getElementById('carga-progress-label').hidden = true;
    if (siteBlocked) { titleEl.textContent = t('menu.opPedirAltaCodigo'); window.AppSiteGate.show(bodyEl, t); return; }
    if (view === 'form') renderForm();
    else if (view === 'detail') renderDetail();
    else renderList();
}

function renderList() {
    titleEl.textContent = t('menu.opPedirAltaCodigo');
    bodyEl.appendChild(button('home-carga-new-btn', `<i class="bx bx-plus" aria-hidden="true"></i><span>${esc(t('main.solNew'))}</span>`, () => openNew(), 'mobileNewRecord'));
    if (ctx && ctx.validArea && ctx.areaLabel) { const n = document.createElement('p'); n.className = 'pm-app-note'; n.textContent = `${t('main.solFor')}: ${ctx.areaLabel}`; bodyEl.appendChild(n); }
    if (drafts.length) {
        const head = document.createElement('p');
        head.className = 'pm-app-title';
        head.setAttribute('data-help-key', 'pacDrafts');
        head.textContent = t('home.pacPending');
        bodyEl.appendChild(head);
        drafts.forEach((d) => bodyEl.appendChild(draftCard(d)));
    }
    const mine = document.createElement('p');
    mine.className = 'pm-app-title';
    mine.textContent = t('home.pacMine');
    bodyEl.appendChild(mine);
    if (listState === 'cached') { const n = document.createElement('p'); n.className = 'pm-app-note'; n.textContent = t('home.pacCached'); bodyEl.appendChild(n); }
    if (!requests.length) {
        const n = document.createElement('p');
        n.className = 'pm-app-note';
        n.textContent = t(listState === 'none' ? 'main.solLoadError' : 'home.pacEmpty');
        bodyEl.appendChild(n);
    }
    requests.forEach((r) => bodyEl.appendChild(requestCard(r)));
}
function draftCard(d) {
    const p = progressOf({ data: d.data, tiFields: d.tiFields, photos: d.photos, photoDone: d.photoDone, existing: d.existing || {} });
    const card = document.createElement('div');
    card.className = 'pm-app-card pac-card';
    const state = d.state === 'failed' ? 'failed' : 'wait';
    card.innerHTML = `<div class="pac-card-head"><b>${esc(d.data.uniqueDescription || '—')}</b><span class="pac-chip pac-chip-${state}">${esc(t(state === 'failed' ? 'home.pacFailed' : 'home.pacWaiting'))}</span></div>
        <div class="pac-meta">${esc([d.label, d.areaLabel, progressText(p), d.send ? t('home.pacWillSend') : ''].filter(Boolean).join(' · '))}</div>
        ${d.state === 'failed' ? `<p class="pac-error">${esc(errorText(d.error))}</p>` : ''}`;
    const actions = document.createElement('div');
    actions.className = 'pac-actions';
    actions.appendChild(button('home-carga-secondary-btn', `<i class="bx bx-edit" aria-hidden="true"></i> ${esc(t('home.pacEdit'))}`, () => openDraft(d)));
    if (d.state !== 'failed') actions.appendChild(button('home-carga-secondary-btn', `<i class="bx bx-cloud-upload" aria-hidden="true"></i> ${esc(t('home.pacSendNow'))}`, async () => { if (!navigator.onLine) { showToast(t('home.pacNoSignal')); return; } await syncAll(); }));
    actions.appendChild(button('home-carga-secondary-btn', `<i class="bx bx-trash" aria-hidden="true"></i> ${esc(t('home.pacDiscard'))}`, async () => {
        if (!window.confirm(t('home.pacDiscardConfirm'))) return;
        await dbDelete(d.localId); await refreshDrafts(); render();
    }));
    card.appendChild(actions);
    return card;
}
function requestCard(r) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pm-app-card pac-card pac-card-tap';
    card.innerHTML = `<div class="pac-card-head"><b>${esc(r.uniqueDescription || '—')}</b>${statusChip(r.status)}</div>
        <div class="pac-meta">${esc([r.label, r.areaLabel, progressText(r.progress)].filter(Boolean).join(' · '))}</div>
        <div class="pac-meta">${esc(t('main.colSolEnManos'))}: <b>${esc(holderText(r.holder))}</b> · ${esc(t('main.colSolTotal'))}: ${esc(duration(r.times.totalMs))}</div>
        ${r.tiNote ? `<p class="pac-note"><b>${esc(t('main.solNote'))}:</b> ${esc(r.tiNote)}</p>` : ''}`;
    card.addEventListener('click', () => { openId = r.id; view = 'detail'; render(); });
    return card;
}

// --- Detalle de una solicitud -----------------------------------------------------------------------------------------------------------------
async function showPhoto(r, field, text) {
    try {
        const res = await call(`${API}/${r.id}/photo/${field}`);
        if (!res.ok) throw new Error('photo');
        const overlay = document.createElement('div');
        overlay.className = 'pac-viewer';
        overlay.innerHTML = `<div class="pac-viewer-bar"><span>${esc(text)}</span><button type="button" aria-label="${esc(t('main.solClose'))}"><i class="bx bx-x" aria-hidden="true"></i></button></div><img alt="${esc(text)}" src="${esc(res.body.url)}">`;
        overlay.querySelector('button').addEventListener('click', () => overlay.remove());
        document.body.appendChild(overlay);
    } catch { showToast(t('main.solPhotoError')); }
}
function renderDetail() {
    const r = requests.find((x) => x.id === openId);
    if (!r) { view = 'list'; render(); return; }
    titleEl.textContent = r.label;
    const head = document.createElement('div');
    head.className = 'pm-app-card';
    head.innerHTML = `<div class="pac-card-head"><b>${esc(r.uniqueDescription || '—')}</b>${statusChip(r.status)}</div>
        <div class="pac-meta">${esc([r.areaLabel, r.siteCode, r.costCenterName].filter(Boolean).join(' · '))}</div>
        <div class="pac-meta">${esc(t('main.colSolEnManos'))}: <b>${esc(holderText(r.holder))}</b> · ${esc(progressText(r.progress))}</div>
        <div class="pac-meta">${esc(t('main.colSolTotal'))}: ${esc(duration(r.times.totalMs))} · ${esc(t('main.solRequesterTime'))}: ${esc(duration(r.times.requesterMs))} · ${esc(t('main.solTiTime'))}: ${esc(duration(r.times.tiMs))}</div>
        ${r.sku ? `<div class="pac-meta"><b>${esc(t('main.solSkuCreated', { sku: r.sku }))}</b></div>` : ''}
        ${r.tiNote ? `<p class="pac-note"><b>${esc(t('main.solNote'))}:</b> ${esc(r.tiNote)}</p>` : ''}`;
    bodyEl.appendChild(head);
    if (r.canEdit) bodyEl.appendChild(button('home-carga-new-btn', `<i class="bx bx-edit" aria-hidden="true"></i><span>${esc(t('main.solComplete'))}</span>`, () => openRequestForm(r)));
    const local = drafts.find((d) => d.requestId === r.id);
    if (local) { const n = document.createElement('p'); n.className = 'pac-error'; n.textContent = t('home.pacHasLocal'); bodyEl.appendChild(n); }
    const rows = [...TEXT_FIELDS.map(([k, c]) => [k, c]), ['mainUom', 'colArticuloUdm'], ['articleType', 'colArticuloTipo'], ...NUMBER_FIELDS, ...CATEGORY_FIELDS.map(([k, c]) => [k, c]), [OPTIONAL_CATEGORY[0], OPTIONAL_CATEGORY[1]], ['clientCode', 'colArticuloCodigoCliente']].map(([k, col]) => {
        const v = r.data[k];
        const byTi = r.tiFields.includes(k) && !hasValue(v);
        const shown = byTi ? `<i>${esc(t('main.solByTi'))}</i>` : (hasValue(v) ? esc(k === 'articleType' ? t(v === 'materia-prima' ? 'main.articleTypeRawMaterial' : 'main.articleTypeFinished') : v) : '—');
        return `<div class="pac-row"><span>${esc(label(col))}</span><b>${shown}</b></div>`;
    });
    const data = document.createElement('div');
    data.className = 'pm-app-card';
    data.innerHTML = `<h4 class="pm-app-title">${esc(t('main.solSectionData'))}</h4>${rows.join('')}`;
    bodyEl.appendChild(data);
    const photos = document.createElement('div');
    photos.className = 'pm-app-card';
    photos.innerHTML = `<h4 class="pm-app-title">${esc(t('main.solSectionPhotos'))}</h4>`;
    PHOTO_FIELDS.forEach(([k, col]) => {
        const row = document.createElement('div');
        row.className = 'pac-row';
        row.innerHTML = `<span>${esc(label(col))}</span>`;
        if (r.photos[k]) row.appendChild(button('pm-app-chip', esc(t('main.solPhotoView')), () => showPhoto(r, k, label(col))));
        else { const b = document.createElement('b'); b.innerHTML = r.tiFields.includes(k) ? `<i>${esc(t('main.solByTi'))}</i>` : '—'; row.appendChild(b); }
        photos.appendChild(row);
    });
    bodyEl.appendChild(photos);
    const line = document.createElement('div');
    line.className = 'pm-app-card';
    line.innerHTML = `<h4 class="pm-app-title">${esc(t('main.solTimeline'))}</h4>${(r.events || []).map((e) => `<div class="pac-step"><div>${statusChip(e.status)} <span class="pac-meta">${esc(holderText(e.holder))}</span></div><div class="pac-meta">${esc(formatTime(e.at))}${e.by ? ` · ${esc(t('main.solStepBy', { by: e.by }))}` : ''}</div>${e.note ? `<p class="pac-note">${esc(e.note)}</p>` : ''}</div>`).join('')}`;
    bodyEl.appendChild(line);
}

// --- El formulario ------------------------------------------------------------------------------------------------------------------------------
function blankForm() {
    return { localId: null, requestId: null, created: false, label: '', department: department(), area: area(), areaLabel: ctx ? ctx.areaLabel : '', siteCode: '', costCenterId: 0, send: false, data: {}, tiFields: [], photos: {}, photoDone: {}, existing: {}, thumbs: {}, error: null };
}
function openNew() {
    if (!ctx || !ctx.validArea) { showToast(t('main.solChooseArea')); return; }
    if (!ctx.canRequest) { showToast(t('main.solNoPermission')); return; }
    form = blankForm();
    view = 'form';
    render();
}
function openRequestForm(r) {
    const local = drafts.find((d) => d.requestId === r.id);
    if (local) { openDraft(local); return; }
    form = { ...blankForm(), requestId: r.id, created: true, label: r.label, department: r.department, area: r.area, areaLabel: r.areaLabel, siteCode: r.siteCode, costCenterId: r.costCenterId, data: { ...r.data }, tiFields: [...r.tiFields], existing: { ...r.photos } };
    view = 'form';
    render();
}
async function openDraft(d) {
    form = { ...blankForm(), ...d, data: { ...d.data }, tiFields: [...d.tiFields], photos: { ...d.photos }, photoDone: { ...d.photoDone }, existing: { ...(d.existing || {}) }, thumbs: {}, error: d.state === 'failed' ? d.error : null };
    for (const [k, blob] of Object.entries(form.photos)) { try { form.thumbs[k] = await makeThumb(blob); } catch { form.thumbs[k] = ''; } }
    view = 'form';
    render();
}
// La miniatura de una foto, como imagen «data:» (el servidor no deja mostrar imágenes «blob:»).
async function makeThumb(blob) {
    const bmp = await createImageBitmap(blob);
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const side = Math.min(bmp.width, bmp.height);
    canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
    if (bmp.close) bmp.close();
    return canvas.toDataURL('image/jpeg', 0.7);
}

function renderForm() {
    const f = form;
    titleEl.textContent = f.requestId ? t('main.solFormTitleEdit', { label: f.label }) : t('main.solFormTitleNew');
    const field = (key, text, control, required, helpKey) => `<div class="pac-field" data-field="${key}"><label for="pac-f-${key}"${helpKey ? ` data-help-key="${helpKey}"` : ''}>${esc(text)}</label>${control}${required ? `<label class="pac-ti" data-help-key="solLoQueLlenaTi"><input type="checkbox" data-ti="${key}"${f.tiFields.includes(key) ? ' checked' : ''}><span>${esc(t('main.solByTi'))}</span></label>` : ''}</div>`;
    const select = (key, items, current) => `<select id="pac-f-${key}" data-key="${key}" class="pm-app-input"><option value="">—</option>${items.map((v) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;
    const optionsOf = (type) => (catalog.options[type] || []).slice();
    const typeItems = [['articulo-terminado', 'main.articleTypeFinished'], ['materia-prima', 'main.articleTypeRawMaterial']];
    const card = (title, rows) => `<div class="pm-app-card"><h4 class="pm-app-title">${esc(title)}</h4>${rows.join('')}</div>`;
    const placeRow = f.requestId
        ? `<p class="pm-app-note">${esc(t('main.solFor'))}: <b>${esc(f.areaLabel)}</b>${f.siteCode ? ` · ${esc(f.siteCode)}` : ''}</p>`
        : `<p class="pm-app-note">${esc(t('main.solFor'))}: <b>${esc(f.areaLabel || (ctx && ctx.areaLabel) || '')}</b></p>
           <div class="pac-field"><label for="pac-site">${esc(t('main.solSite'))}</label><select id="pac-site" class="pm-app-input"><option value="">${esc(t('main.solAllSites'))}</option>${((ctx && ctx.sites) || []).map((s) => `<option value="${esc(s.code)}"${s.code === f.siteCode ? ' selected' : ''}>${esc(s.code)}${s.sucursal ? ` - ${esc(s.sucursal)}` : ''}</option>`).join('')}</select></div>
           <div class="pac-field"><label for="pac-center">${esc(t('main.solCenter'))}</label><select id="pac-center" class="pm-app-input" disabled><option value="">${esc(t('main.solAllCenters'))}</option></select></div>`;
    bodyEl.innerHTML = `<form id="pac-form" autocomplete="off">
        <div class="pm-app-card">${placeRow}<p class="pac-error" id="pac-error"${f.error ? '' : ' hidden'}>${esc(errorText(f.error))}</p></div>
        ${card(t('main.solSectionData'), [
            ...TEXT_FIELDS.map(([k, col]) => field(k, label(col), `<input id="pac-f-${k}" data-key="${k}" class="pm-app-input" type="text" value="${esc(f.data[k] || '')}" autocomplete="off">`, k !== 'uniqueDescription', k === 'uniqueDescription' ? 'solDescripcionUnica' : '')),
            field('mainUom', label('colArticuloUdm'), select('mainUom', optionsOf('udm'), f.data.mainUom || ''), true),
            field('articleType', label('colArticuloTipo'), `<select id="pac-f-articleType" data-key="articleType" class="pm-app-input"><option value="">—</option>${typeItems.map(([v, key]) => `<option value="${v}"${f.data.articleType === v ? ' selected' : ''}>${esc(t(key))}</option>`).join('')}</select>`, true),
            `<div class="pac-field"><label for="pac-f-clientCode">${esc(label('colArticuloCodigoCliente'))}</label><input id="pac-f-clientCode" data-key="clientCode" class="pm-app-input" type="text" value="${esc(f.data.clientCode || '')}" autocomplete="off"></div>`,
        ])}
        ${card(t('main.solSectionSize'), NUMBER_FIELDS.map(([k, col]) => field(k, label(col), `<input id="pac-f-${k}" data-key="${k}" class="pm-app-input" type="number" inputmode="decimal" min="0" step="any" value="${f.data[k] ? esc(f.data[k]) : ''}">`, true)))}
        ${card(t('main.solSectionCategories'), [
            ...CATEGORY_FIELDS.map(([k, col, type]) => field(k, label(col), select(k, optionsOf(type), f.data[k] || ''), true)),
            `<div class="pac-field"><label for="pac-f-${OPTIONAL_CATEGORY[0]}">${esc(label(OPTIONAL_CATEGORY[1]))}</label>${select(OPTIONAL_CATEGORY[0], optionsOf(OPTIONAL_CATEGORY[2]), f.data[OPTIONAL_CATEGORY[0]] || '')}</div>`,
        ])}
        ${card(t('main.solSectionPhotos'), PHOTO_FIELDS.map(([k, col]) => `<div class="pac-field pac-photo" data-field="${k}" data-help-key="pacPhotos"><span class="pac-photo-name">${esc(label(col))}</span><span class="pac-photo-state" data-state="${k}"></span><label class="pm-app-chip pac-cam"><i class="bx bx-camera" aria-hidden="true"></i> <span data-cam="${k}"></span><input type="file" accept="image/*" capture="environment" data-photo="${k}"></label><label class="pac-ti" data-help-key="solLoQueLlenaTi"><input type="checkbox" data-ti="${k}"${f.tiFields.includes(k) ? ' checked' : ''}><span>${esc(t('main.solByTi'))}</span></label></div>`))}
    </form>
    <p class="pm-app-note" id="pac-progress"></p>`;
    const root = document.getElementById('pac-form');
    const errorEl = document.getElementById('pac-error');
    const readForm = () => {
        root.querySelectorAll('[data-key]').forEach((el) => {
            const v = el.value.trim();
            f.data[el.dataset.key] = NUMERIC_KEYS.has(el.dataset.key) ? (Number(v) || 0) : v;
        });
        f.tiFields = [...root.querySelectorAll('[data-ti]')].filter((el) => el.checked).map((el) => el.dataset.ti);
    };
    const refresh = () => {
        readForm();
        root.querySelectorAll('[data-ti]').forEach((el) => {
            const key = el.dataset.ti;
            const input = root.querySelector(`[data-key="${key}"], [data-photo="${key}"]`);
            if (input) { input.disabled = el.checked; if (el.checked && input.dataset.key) { input.value = ''; f.data[key] = NUMERIC_KEYS.has(key) ? 0 : ''; } }
        });
        PHOTO_FIELDS.forEach(([k]) => {
            const has = !!(f.photos[k] || f.existing[k]);
            const stateEl = root.querySelector(`[data-state="${k}"]`);
            stateEl.innerHTML = f.photos[k] ? `<img alt="" src="${esc(f.thumbs[k] || '')}">` : (f.existing[k] ? `<i class="bx bx-check" aria-hidden="true"></i>` : '');
            root.querySelector(`[data-cam="${k}"]`).textContent = t(has ? 'home.pacChangePhoto' : 'home.pacTakePhoto');
        });
        document.getElementById('pac-progress').textContent = progressText(progressOf(f));
    };
    root.addEventListener('input', refresh);
    root.addEventListener('change', async (event) => {
        const photo = event.target.dataset && event.target.dataset.photo;
        if (photo) {
            const file = (event.target.files || [])[0];
            event.target.value = '';
            if (!file) return;
            try {
                const blob = await sync().compressImageToBlob(file);
                if (blob.size > MAX_PHOTO_BYTES) { showToast(t('main.solPhotoError')); return; }
                f.photos[photo] = blob; f.photoDone[photo] = false; f.thumbs[photo] = await makeThumb(blob);
            } catch { showToast(t('main.solPhotoError')); }
        }
        refresh();
    });
    const siteSel = document.getElementById('pac-site');
    const centerSel = document.getElementById('pac-center');
    if (siteSel) {
        const fillCenters = () => {
            const site = ((ctx && ctx.sites) || []).find((s) => s.code === siteSel.value);
            centerSel.innerHTML = `<option value="">${esc(t('main.solAllCenters'))}</option>${(site ? site.centers : []).map((c) => `<option value="${c.id}"${Number(f.costCenterId) === c.id ? ' selected' : ''}>${esc(c.code)} · ${esc(c.name)}</option>`).join('')}`;
            centerSel.disabled = !site || site.centers.length < 2;
        };
        siteSel.addEventListener('change', () => { f.siteCode = siteSel.value; f.costCenterId = 0; fillCenters(); });
        centerSel.addEventListener('change', () => { f.costCenterId = centerSel.value ? Number(centerSel.value) : 0; });
        fillCenters();
    }
    refresh();
    const fail = (text) => { errorEl.textContent = text; errorEl.hidden = !text; if (text) errorEl.scrollIntoView({ block: 'center' }); };
    const save = async (send) => {
        readForm();
        fail('');
        if (!f.data.uniqueDescription) { fail(t('main.solNeedDescription')); return; }
        if (send) { const p = progressOf(f); if (p.missing) { fail(t('main.solMissing', { n: p.missing })); return; } }
        buttons.forEach((b) => { b.disabled = true; });
        const record = {
            localId: f.localId || newLocalId(), userKey: userKey(), requestId: f.requestId, created: f.created, label: f.label, department: f.department, area: f.area, areaLabel: f.areaLabel || (ctx ? ctx.areaLabel : ''),
            siteCode: f.siteCode, costCenterId: f.costCenterId, send, data: { ...f.data }, tiFields: [...f.tiFields], photos: { ...f.photos }, photoDone: { ...f.photoDone }, existing: { ...f.existing }, state: 'pending', error: null, updatedAt: new Date().toISOString(),
        };
        // lo escrito cambió: la solicitud que ya existe se vuelve a poner con estos datos
        record.created = false;
        await dbPut(record);
        await syncAll();
        await refreshDrafts();
        const left = drafts.find((d) => d.localId === record.localId);
        if (!left) { form = null; await loadRequests(); showToast(t(send ? 'main.solSent' : 'main.solSaved')); view = 'list'; render(); return; }
        if (left.state === 'failed') { f.localId = left.localId; f.requestId = left.requestId; f.label = left.label; f.error = left.error; buttons.forEach((b) => { b.disabled = false; }); fail(errorText(left.error)); return; }
        form = null; showToast(t('home.pacSavedOffline')); view = 'list'; render();
    };
    const buttons = [
        button('home-carga-secondary-btn', `<i class="bx bx-save" aria-hidden="true"></i> ${esc(t('main.solSave'))}`, () => save(false)),
        button('home-carga-new-btn', `<i class="bx bx-send" aria-hidden="true"></i><span>${esc(t('main.solSaveSend'))}</span>`, () => save(true)),
    ];
    const bar = document.createElement('div');
    bar.className = 'pac-actions pac-actions-col';
    buttons.forEach((b) => bar.appendChild(b));
    bodyEl.appendChild(bar);
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') { window.location.href = 'AppInicio.html'; return; }
    if (view === 'form') {
        if (!window.confirm(t('home.pacDiscardForm'))) return;
        // de un formulario abierto desde el detalle se regresa al detalle
        const backToDetail = !!(form && form.requestId && openId === form.requestId && requests.some((r) => r.id === openId));
        form = null;
        view = backToDetail ? 'detail' : 'list';
    } else {
        view = 'list';
    }
    render();
});

(async function init() {
    await loadLanguage();
    window.HelpMode?.init(t);
    try {
        const meRes = await fetch(apiUrl('/api/me'), { credentials: 'include' });
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        currentUser = user;
        isClientAdmin = !!user?.isClientAdmin;
        // Toda operación va ligada a un centro de costos completo (AppSiteGate); sin señal no se bloquea.
        siteBlocked = await window.AppSiteGate.blocked();
        await Promise.all([loadBrandingForTheme(), loadContext(), loadCatalog(), loadRequests(), refreshDrafts()]);
        applyStyle(getStoredStyle());
        render();
        syncAll();
    } catch (err) {
        console.error('Pedir alta de código (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
