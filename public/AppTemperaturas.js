// ---------------------------------------------------------------------------
// Temperaturas (App) — la misma pantalla de la Web (Operaciones > Temperaturas) hecha para el celular:
//   · Equipos: los refrigeradores (activos de tipo Frío) y los sensores del Layout de cada centro de costos, cada uno con su última lectura (en verde si está en rango, en rojo si está fuera) y con buscador;
//   · Lecturas: la lista (las de este celular que todavía no se envían salen primero como «En tu celular») y el detalle con el estado, el aviso de fuera de rango y la foto a pantalla completa;
//   · Nueva lectura (un toque en el equipo): quién revisa (siempre se pide), la temperatura que marca (con el botón ± para los negativos) y/o la humedad —un refrigerador pide las dos y un sensor lo que dice su tipo—
//     y la foto de la lectura (obligatoria, una sola). El rango del equipo se muestra y, si lo escrito queda fuera, avisa antes de guardar (se guarda igual, con la alerta). Los equipos y su rango se guardan en el celular,
//     así que la lectura se toma SIN señal: queda en la cola de AppOfflineSync.js ("En tu celular") y se envía sola al reconectar con la hora a la que se hizo (el servidor guarda aparte la hora en que la recibió).
// Es la misma lectura que se toma al escanear el QR del refrigerador o del sensor (en la Web aparece con origen «App»). Corregir una lectura y eliminarla se siguen haciendo en la Web.
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
const API = '/api/business/temperaturas';
const LIST_API = '/api/business/temperatures';
const RECORD_PREFIX = 'temperaturas';
const PHOTO_MAX_BYTES = 420 * 1024;           // el servidor acepta hasta ~450 KB por foto
const MAX_ROWS = 60;                          // los equipos que se dibujan a la vez: el buscador trae el resto
let currentUser = null;
let isClientAdmin = false;
let effectiveGrants = [];
let costCenters = [];
let records = [];             // lecturas del servidor (la más nueva primero)
let qReadings = [];           // lecturas guardadas sin señal que siguen en la cola de este celular
let options = { pointsByCenter: {}, lastByCenter: {} };
let optionsState = 'loading'; // 'loading' | 'online' | 'cached' | 'none'
let view = 'list';            // 'list' | 'detail' | 'new' | 'done'
let tab = 'points';           // 'points' | 'readings'
let search = '';
let openKey = null;           // la lectura abierta
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
const fmtTemp = (v) => `${Number(v).toFixed(1)} °C`;
const fmtHum = (v) => `${Number(v).toFixed(1).replace(/\.0$/, '')} %`;
const userLabel = () => (currentUser && (currentUser.name || currentUser.username)) || '';
// El tipo de un equipo: Frío (refrigerador) o Temperatura / Humedad / Temperatura y humedad (sensor); uno que la pantalla no conoce se muestra tal cual.
function typeLabel(kind, type) {
    const key = kind === 'sensor' ? `main.layoutType_sensor_${type || 'both'}` : `main.layoutType_space_${type || 'cold'}`;
    const label = t(key);
    return label && label !== key ? label : (type || '');
}
const pointText = (kind, code, type) => `${code || ''}${code ? ' · ' : ''}${typeLabel(kind, type)}`;
const pointKeyOf = (kind, id) => `${kind === 'sensor' ? 's' : 'f'}:${id}`;
const centerOf = (ccId) => costCenters.find((c) => c.id === Number(ccId));
const centerText = (cc) => (cc ? `${cc.code ? `${cc.code} · ` : ''}${cc.name}` : '');
const pointsOf = (ccId) => (options.pointsByCenter && options.pointsByCenter[ccId]) || [];
// Lo que pide un equipo: un refrigerador, temperatura y humedad; un sensor, lo que dice su tipo.
const wantsTemp = (p) => p.kind !== 'sensor' || p.type !== 'hum';
const wantsHum = (p) => p.kind !== 'sensor' || p.type !== 'temp';
// Cada medida se juzga con el rango que traía el equipo: 'low', 'high', 'ok' o null (esa medida no tiene rango).
function judge(v, lo, hi) {
    if (v === null || v === undefined || ((lo === null || lo === undefined) && (hi === null || hi === undefined))) return null;
    if (lo !== null && lo !== undefined && v < lo) return 'low';
    if (hi !== null && hi !== undefined && v > hi) return 'high';
    return 'ok';
}
const statusOf = (temperature, humidity, lim) => ({ temp: judge(temperature, (lim || {}).tempMin, (lim || {}).tempMax), hum: judge(humidity, (lim || {}).humMin, (lim || {}).humMax) });
// Los avisos de una lectura contra su rango (los mismos de la página del QR).
function alertMessages(temperature, humidity, lim) {
    const l = lim || {};
    const msgs = [];
    if (typeof temperature === 'number') { if (l.tempMin != null && temperature < l.tempMin) msgs.push(t('home.tmpTempLow', { n: l.tempMin })); else if (l.tempMax != null && temperature > l.tempMax) msgs.push(t('home.tmpTempHigh', { n: l.tempMax })); }
    if (typeof humidity === 'number') { if (l.humMin != null && humidity < l.humMin) msgs.push(t('home.tmpHumLow', { n: l.humMin })); else if (l.humMax != null && humidity > l.humMax) msgs.push(t('home.tmpHumHigh', { n: l.humMax })); }
    return msgs;
}
const isOut = (st) => !!st && (st.temp === 'low' || st.temp === 'high' || st.hum === 'low' || st.hum === 'high');
// El rango de un equipo para leerlo: «0 a 8 °C · 30 a 70 %»; vacío si no tiene.
function rangeText(lim) {
    const l = lim || {};
    const part = (lo, hi, unit) => {
        if (lo == null && hi == null) return '';
        if (lo != null && hi != null) return `${lo} – ${hi} ${unit}`;
        return lo != null ? `≥ ${lo} ${unit}` : `≤ ${hi} ${unit}`;
    };
    return [part(l.tempMin, l.tempMax, '°C'), part(l.humMin, l.humMax, '%')].filter(Boolean).join(' · ');
}

// La temperatura se escribe con punto o con coma; el signo menos se pone con el botón ± (algunos teclados de celular no lo traen).
function parseTemp(text) {
    const clean = String(text || '').replace(',', '.').replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/°c?/i, '');
    if (!clean) return { empty: true };
    if (!/^-?\d{1,3}(\.\d{1,2})?$/.test(clean)) return { bad: true };
    const n = Number(clean);
    return n >= -100 && n <= 100 ? { value: Math.round(n * 10) / 10 } : { bad: true };
}
// La humedad se escribe con punto o con coma, de 0 a 100.
function parseHum(text) {
    const clean = String(text || '').replace(',', '.').replace(/\s+/g, '').replace(/%/g, '');
    if (!clean) return { empty: true };
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(clean)) return { bad: true };
    const n = Number(clean);
    return n >= 0 && n <= 100 ? { value: Math.round(n * 10) / 10 } : { bad: true };
}

// --- Opciones (los refrigeradores y sensores del Layout de cada centro, con su rango y su última lectura): se bajan al abrir y se guardan en el celular para trabajar sin señal ------------------------
function cacheDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('sgn-tmp-cache', 1);
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
            options = { pointsByCenter: body.pointsByCenter || {}, lastByCenter: body.lastByCenter || {} };
            optionsState = 'online';
            cacheSave({ clientId, options, at: body.at }).catch(() => { /* sin almacenamiento: se bajan otra vez la próxima */ });
            return;
        }
    } catch { /* sin señal: se usan las guardadas */ }
    try {
        const saved = await cacheRead();
        // lo guardado solo sirve si es de la misma empresa (otra cuenta en el mismo celular no ve equipos ajenos)
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
        records = body.temperatures || [];
    } catch { /* sin señal: se queda con lo que ya se veía */ }
}
// Los centros que se ven: los que la cuenta puede usar y los marcados en la App.
function visibleCenters() {
    const sel = selectedCostCenterIds();
    return costCenters.filter((c) => !sel || sel.has(c.id));
}

// --- Lo que se mandó sin señal y sigue en la cola: las lecturas nuevas se ven como "En tu celular" ----------------------------------------------------------------------------------------
const CREATE_URL = /\/api\/business\/temperaturas\/readings$/;
async function readQueue() {
    try { return await sync().listOfflineQueue(); } catch { return []; }
}
const parseBody = (item) => { try { return JSON.parse(item.body || '{}'); } catch { return null; } };
let queueMineCount = 0;
async function refreshQueued() {
    const queue = await readQueue();
    qReadings = [];
    queue.forEach((item) => {
        if (item.method !== 'POST' || !item.url || !CREATE_URL.test(item.url)) return;
        const body = parseBody(item);
        if (body) qReadings.push({ ...body, queuedAt: item.queuedAt });
    });
    queueMineCount = qReadings.length;
}
// AppOfflineSync avisa cada 30 s aunque nada haya cambiado: solo se vuelve a dibujar si cambió lo que esta pantalla tenía en la cola, y nunca en «Nueva lectura» (se perdería lo que se está escribiendo).
document.addEventListener('sgn:offline-queue-changed', async () => {
    const before = queueMineCount;
    await refreshQueued();
    if (before === queueMineCount) return;
    // al reconectar la cola se vacía: se vuelve a pedir la lista y los equipos para ver las lecturas ya con su número
    if (queueMineCount === 0 && navigator.onLine) await Promise.all([loadRecords(), loadOptions()]);
    if (view === 'list' || view === 'detail') render();
});
document.addEventListener('sgn:offline-rejected', () => { if (view === 'list') render(); });

// Las lecturas que se muestran: las de este celular que siguen en la cola y las del servidor. Cada una:
// { key, queued, id, ref, cc, centroCostos, kind, pointId, code, type, locator, zoneName, name, temperature, humidity, limits, status, checkedAt, receivedAt, hasPhoto, photoSrc, photoFull }
function buildItems() {
    const out = [];
    const queuedRefs = new Set(qReadings.map((q) => q.clientRef));
    qReadings.forEach((q) => {
        const p = pointsOf(q.costCenterId).find((x) => x.kind === (q.kind === 'sensor' ? 'sensor' : 'fridge') && x.id === q.pointId) || {};
        const cc = centerOf(q.costCenterId);
        const temperature = typeof q.temperature === 'number' ? q.temperature : null;
        const humidity = typeof q.humidity === 'number' ? q.humidity : null;
        const lim = p.limits || {};
        out.push({
            key: `q:${q.clientRef}`, queued: true, id: null, ref: q.clientRef, cc: Number(q.costCenterId), centroCostos: cc ? cc.name : '', kind: q.kind === 'sensor' ? 'sensor' : 'fridge', pointId: q.pointId, code: p.code || '', type: p.type || '',
            locator: p.locator || '', zoneName: p.zoneName || '', name: q.name || userLabel(), temperature, humidity, limits: lim, status: statusOf(temperature, humidity, lim), checkedAt: q.clientAt || q.queuedAt, receivedAt: null,
            hasPhoto: !!q.photo, photoSrc: q.thumb || q.photo, photoFull: q.photo,
        });
    });
    records.forEach((r) => {
        if (r.clientRef && queuedRefs.has(r.clientRef)) return; // la misma lectura ya llegó al servidor y su copia en la cola está por salir
        const kind = r.sensorId ? 'sensor' : 'fridge';
        const cc = centerOf(r.cc);
        out.push({
            key: `c:${r.id}`, queued: false, id: r.id, ref: r.clientRef || '', cc: r.cc, centroCostos: r.centroCostos || (cc ? cc.name : ''), kind, pointId: r.sensorId || r.spaceId, code: r.sensorCode || r.spaceCode, type: kind === 'sensor' ? r.sensorType : r.spaceType,
            locator: r.locator, zoneName: r.zoneName, name: r.name, temperature: r.temperature, humidity: r.humidity, limits: r.limits || {}, status: r.status || { temp: null, hum: null }, checkedAt: r.checkedAt, receivedAt: r.receivedAt || null,
            hasPhoto: r.hasPhoto, photoSrc: '', photoFull: '', source: r.source,
        });
    });
    const sel = selectedCostCenterIds();
    return out.filter((i) => i.queued || !i.cc || (hasCostCenterPermission(i.cc) && (!sel || sel.has(Number(i.cc)))))
        .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt));
}
// La última lectura de un equipo: la más nueva que se conoce o, si no está entre las de la lista, la que bajaron las opciones.
function lastOf(items, ccId, p) {
    const it = items.find((i) => Number(i.cc) === Number(ccId) && i.kind === p.kind && i.pointId === p.id);
    if (it) return { at: it.checkedAt, temperature: it.temperature, humidity: it.humidity, status: it.status, queued: it.queued };
    const last = options.lastByCenter && options.lastByCenter[ccId] && options.lastByCenter[ccId][pointKeyOf(p.kind, p.id)];
    return last ? { at: last.at, temperature: last.temperature, humidity: last.humidity, status: last.status } : null;
}

// --- Fotos: se piden con la sesión y se muestran como imagen local (en la App instalada la dirección del servidor es de otro origen). Se entregan como data: (la política de seguridad del servidor solo deja
// cargar imágenes propias y data:, no blob:); las miniaturas se guardan mientras la pantalla está abierta y las fotos completas no.
const photoCache = new Map();
const blobToDataUrl = (blob) => new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob); });
async function photoUrl(id, thumb) {
    const url = `${LIST_API}/${id}/photo${thumb ? '?thumb=1' : ''}`;
    if (photoCache.has(url)) return photoCache.get(url);
    const res = await fetch(apiUrl(url), { credentials: 'include' });
    if (!res.ok) throw new Error('photo');
    const dataUrl = await blobToDataUrl(await res.blob());
    if (thumb) photoCache.set(url, dataUrl);
    return dataUrl;
}
function fillImage(img, id, thumb) {
    photoUrl(id, thumb).then((src) => { img.src = src; }).catch(() => { img.alt = '—'; });
}

// --- Pantalla --------------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
document.getElementById('carga-progress-track').hidden = true;
document.getElementById('carga-progress-label').hidden = true;

function render() {
    bodyEl.innerHTML = '';
    if (siteBlocked) { window.AppSiteGate.show(bodyEl, t); titleEl.textContent = t('menu.opCentroDistTemperaturas'); return; }
    if (view === 'new') renderNew();
    else if (view === 'done') renderDone();
    else if (view === 'detail') renderDetail();
    else renderList();
}

function renderRejectedBanner() {
    const rejected = sync().listRejected();
    if (!rejected.length) return;
    const box = document.createElement('div');
    box.className = 'relapp-rejected';
    box.innerHTML = `<b><i class="bx bx-error-circle" aria-hidden="true"></i> ${esc(t('home.relappRejectedTitle'))}</b>${rejected.map((r) => `<p>${esc(r.description)}${r.message ? ` — ${esc(r.message)}` : ''}</p>`).join('')}<button type="button" class="home-carga-secondary-btn">${esc(t('home.relappRejectedOk'))}</button>`;
    box.querySelector('button').addEventListener('click', () => { sync().clearRejected(); });
    bodyEl.appendChild(box);
}

// La lectura de un equipo en una pastilla: la temperatura (y la humedad) con su color (en rango o fuera de rango).
function readingPill(temperature, humidity, st) {
    const parts = [];
    if (temperature !== null && temperature !== undefined) parts.push(fmtTemp(temperature));
    if (humidity !== null && humidity !== undefined) parts.push(fmtHum(humidity));
    if (!parts.length) return '';
    const cls = isOut(st) ? 'seg-app-res-fail' : (st && (st.temp === 'ok' || st.hum === 'ok') ? 'seg-app-res-ok' : 'pm-app-pill-queued');
    return `<span class="pm-app-pill ${cls}">${esc(parts.join(' · '))}</span>`;
}

function renderList() {
    titleEl.textContent = t('menu.opCentroDistTemperaturas');
    renderRejectedBanner();
    const tabs = document.createElement('div');
    tabs.className = 'seg-app-tabs';
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('data-help-key', 'appTmpTabs');
    [['points', t('home.tmpTabPoints')], ['readings', t('home.tmpTabReadings')]].forEach(([key, label]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'seg-app-tab';
        btn.setAttribute('aria-pressed', String(tab === key));
        btn.textContent = label;
        btn.addEventListener('click', () => { tab = key; render(); });
        tabs.appendChild(btn);
    });
    bodyEl.appendChild(tabs);
    if (tab === 'readings') renderReadings(); else renderPoints();
}

// Los refrigeradores y sensores de los centros que se ven, con su última lectura; un toque abre «Nueva lectura» de ese equipo.
function renderPoints() {
    if (optionsState === 'none') { const p = document.createElement('p'); p.className = 'home-carga-empty-note'; p.textContent = t('home.tmpOptionsNone'); bodyEl.appendChild(p); return; }
    if (optionsState === 'cached') { const p = document.createElement('p'); p.className = 'pm-app-note'; p.textContent = t('home.tmpOptionsCached'); bodyEl.appendChild(p); }
    const centers = visibleCenters();
    if (!centers.length) { const p = document.createElement('p'); p.className = 'home-carga-empty-note'; p.textContent = t('home.tmpNoCenters'); bodyEl.appendChild(p); return; }
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'pm-app-input seg-app-search';
    input.placeholder = t('home.tmpSearchPlaceholder');
    input.setAttribute('aria-label', t('home.tmpSearchPlaceholder'));
    input.value = search;
    bodyEl.appendChild(input);
    const listEl = document.createElement('div');
    bodyEl.appendChild(listEl);
    const items = buildItems();
    const draw = () => {
        listEl.innerHTML = '';
        const needle = search.trim().toLowerCase();
        const rows = [];
        centers.forEach((cc) => pointsOf(cc.id).forEach((p) => {
            const hay = `${p.code} ${typeLabel(p.kind, p.type)} ${p.locator} ${p.zoneName} ${p.footprintCode} ${centerText(cc)}`.toLowerCase();
            if (!needle || hay.includes(needle)) rows.push({ cc, p });
        }));
        if (!rows.length) { const e = document.createElement('p'); e.className = 'home-carga-empty-note'; e.textContent = t(needle ? 'home.tmpNoMatch' : 'home.tmpPointsEmpty'); listEl.appendChild(e); return; }
        rows.slice(0, MAX_ROWS).forEach(({ cc, p }) => {
            const last = lastOf(items, cc.id, p);
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'home-carga-active-row';
            const sub = [p.locator || p.zoneName, centers.length > 1 ? cc.name : ''].filter(Boolean).join(' · ');
            row.innerHTML = `
                <span class="home-carga-active-row-icon"><i class="bx ${p.kind === 'sensor' ? 'bx-broadcast' : 'bx-fridge'}" aria-hidden="true"></i></span>
                <span class="home-carga-active-row-label"><p>${esc(pointText(p.kind, p.code, p.type))}</p><span>${esc(sub)}</span></span>
                <span class="seg-app-last">${last ? readingPill(last.temperature, last.humidity, last.status) : `<span class="pm-app-pill pm-app-pill-queued">${esc(t('home.tmpNever'))}</span>`}${last ? `<small>${esc(last.queued ? t('home.incOnPhone') : formatTime(last.at))}</small>` : ''}</span>`;
            row.addEventListener('click', () => startReading(cc.id, p));
            listEl.appendChild(row);
        });
        if (rows.length > MAX_ROWS) { const n = document.createElement('p'); n.className = 'pm-app-note'; n.textContent = t('home.tmpShowing', { n: MAX_ROWS, total: rows.length }); listEl.appendChild(n); }
    };
    input.addEventListener('input', () => { search = input.value; draw(); });
    draw();
}

// Las lecturas (las de este celular que siguen en la cola, primero, y después las del servidor).
function renderReadings() {
    const list = buildItems();
    if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('home.tmpReadingsEmpty');
        bodyEl.appendChild(empty);
        return;
    }
    list.forEach((r) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        const sub = [r.name, formatTime(r.checkedAt)].filter(Boolean).join(' · ');
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx ${r.queued ? 'bx-cloud-upload' : (r.kind === 'sensor' ? 'bx-broadcast' : 'bx-fridge')}" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label"><p>${esc(pointText(r.kind, r.code, r.type))}</p><span>${esc(sub)}</span></span>
            <span class="inc-app-pills">${readingPill(r.temperature, r.humidity, r.status)}${r.queued ? `<span class="pm-app-pill pm-app-pill-queued">${esc(t('home.incOnPhone'))}</span>` : ''}</span>`;
        row.addEventListener('click', () => { openKey = r.key; view = 'detail'; render(); });
        bodyEl.appendChild(row);
    });
}

// El aviso de «fuera de rango» (el mismo de la página del QR); saved = la lectura ya se guardó.
function alertBox(msgs, saved) {
    if (!msgs.length) return null;
    const box = document.createElement('div');
    box.className = 'tmp-app-alert';
    box.setAttribute('role', 'alert');
    box.innerHTML = `<b>${esc(t('home.tmpOutTitle'))}</b>${msgs.map((m) => `<br>${esc(m)}`).join('')}${saved ? '' : `<br>${esc(t('home.tmpOutSaved'))}`}`;
    return box;
}

// --- Detalle de una lectura ----------------------------------------------------------------------------------------------------------------
function renderDetail() {
    const r = buildItems().find((x) => x.key === openKey);
    if (!r) { view = 'list'; render(); return; }
    titleEl.textContent = r.queued ? t('home.incOnPhone') : `TMP-${r.id}`;
    const stText = isOut(r.status) ? t('main.tmpEstadoFuera') : (r.status && (r.status.temp === 'ok' || r.status.hum === 'ok') ? t('main.tmpEstadoOk') : t('main.tmpEstadoSin'));
    const meta = document.createElement('div');
    meta.className = 'pm-app-meta';
    const rows = [
        [t('main.colTmpActivo'), pointText(r.kind, r.code, r.type)],
        [t('main.colTmpZona'), r.zoneName || '—'],
        [t('home.incCenter'), r.centroCostos || '—'],
        [t('main.colTmpQuien'), r.name || '—'],
        [t('main.colTmpMomento'), formatTime(r.checkedAt)],
        r.temperature !== null && r.temperature !== undefined ? [t('main.colTmpTemperatura'), fmtTemp(r.temperature)] : null,
        r.humidity !== null && r.humidity !== undefined ? [t('main.colTmpHumedad'), fmtHum(r.humidity)] : null,
        [t('main.colTmpEstado'), stText],
        r.receivedAt ? [t('main.pmRecibido'), formatTime(r.receivedAt)] : null,
        [t('main.colTmpOrigen'), t('main.tmpOrigenApp')],
    ].filter(Boolean);
    meta.innerHTML = rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    bodyEl.appendChild(meta);
    const al = alertBox(alertMessages(r.temperature, r.humidity, r.limits), true);
    if (al) bodyEl.appendChild(al);

    const ev = document.createElement('div');
    ev.className = 'pm-app-card';
    ev.innerHTML = `<h4 class="pm-app-title">${esc(t('main.colTmpFoto'))}</h4>`;
    if (r.hasPhoto) {
        const grid = document.createElement('div');
        grid.className = 'inc-app-shots';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inc-app-shot';
        btn.setAttribute('aria-label', t('main.tmpFotoVer'));
        const img = document.createElement('img');
        img.alt = '';
        if (r.photoSrc) img.src = r.photoSrc; else if (r.id) fillImage(img, r.id, true);
        btn.appendChild(img);
        btn.addEventListener('click', () => openViewer(r));
        grid.appendChild(btn);
        ev.appendChild(grid);
    } else {
        const none = document.createElement('p');
        none.className = 'pm-app-note';
        none.textContent = '—';
        ev.appendChild(none);
    }
    bodyEl.appendChild(ev);
}
// El visor de la foto (pantalla completa).
function openViewer(r) {
    const scrim = document.createElement('div');
    scrim.className = 'inc-app-viewer';
    const title = `${r.code || ''}${r.temperature !== null && r.temperature !== undefined ? ` · ${fmtTemp(r.temperature)}` : ''}${r.humidity !== null && r.humidity !== undefined ? ` · ${fmtHum(r.humidity)}` : ''}`;
    scrim.innerHTML = `<div class="inc-app-viewer-bar"><span>${esc(title)}</span><button type="button" id="tmp-app-vclose" aria-label="${esc(t('main.incFotoCerrar'))}"><i class="bx bx-x" aria-hidden="true"></i></button></div>
        <div class="inc-app-viewer-stage"><img id="tmp-app-vimg" alt=""></div>`;
    document.body.appendChild(scrim);
    const img = scrim.querySelector('#tmp-app-vimg');
    scrim.querySelector('#tmp-app-vclose').addEventListener('click', () => scrim.remove());
    if (r.photoFull) img.src = r.photoFull; else if (r.id) fillImage(img, r.id, false);
}

// --- Foto de la lectura: se reduce en el celular (máx. 1280 px de lado, JPEG) para que suba rápido aunque la cámara sea de 12 megapíxeles --------------------------
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

// --- Nueva lectura -----------------------------------------------------------------------------------------------------------------------
// draft: { costCenterId, point, name, temp, hum, photo: { photo, thumb, bytes } | null, preparing, clientRef }
let draft = null;
const NAME_KEY = 'sgn_tmp_name';
function newRef() {
    const bytes = new Uint8Array(12);
    (window.crypto || {}).getRandomValues?.(bytes);
    const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') || Math.random().toString(16).slice(2).padEnd(24, '0');
    return `app-${Date.now().toString(36)}-${rand}`;
}
function startReading(costCenterId, point) {
    // «Quién revisa» siempre se pide: viene escrito con el último nombre usado (o el de la cuenta) y se puede cambiar
    let name = '';
    try { name = localStorage.getItem(NAME_KEY) || ''; } catch { /* sin almacenamiento */ }
    draft = { costCenterId, point, name: name || userLabel(), temp: '', hum: '', photo: null, preparing: 0, clientRef: newRef() };
    view = 'new';
    render();
}

function renderNew() {
    titleEl.textContent = t('home.tmpNewTitle');
    const p = draft.point;
    const cc = centerOf(draft.costCenterId);
    // el equipo que se lee (con su rango, si lo tiene)
    const head = document.createElement('div');
    head.className = 'pm-app-card seg-app-head';
    head.setAttribute('data-help-key', 'appTmpEquipo');
    const range = rangeText(p.limits);
    head.innerHTML = `<h4 class="pm-app-title">${esc(pointText(p.kind, p.code, p.type))}</h4><p class="pm-app-note">${esc([p.locator || p.zoneName, cc ? centerText(cc) : ''].filter(Boolean).join(' · '))}</p>${range ? `<p class="pm-app-note"><b>${esc(t('home.tmpRange', { range }))}</b></p>` : ''}`;
    bodyEl.appendChild(head);
    if (optionsState === 'cached') { const n = document.createElement('p'); n.className = 'pm-app-note'; n.textContent = t('home.tmpOptionsCached'); bodyEl.appendChild(n); }

    // quién revisa (siempre se pide el nombre)
    const whoBox = document.createElement('div');
    whoBox.className = 'pm-app-card';
    whoBox.innerHTML = `<label class="pm-app-qty-label pm-app-who-label" for="tmp-app-who">${esc(t('home.tmpWho'))} <span class="pm-app-req" aria-hidden="true">*</span></label><input id="tmp-app-who" class="pm-app-input" type="text" maxlength="60" autocomplete="name" required placeholder="${esc(t('home.tmpWhoPlaceholder'))}" value="${esc(draft.name)}">`;
    bodyEl.appendChild(whoBox);
    whoBox.querySelector('#tmp-app-who').addEventListener('input', (event) => { draft.name = event.target.value; });

    // lo que marca el equipo (temperatura con el botón ± y/o humedad) y el aviso de fuera de rango mientras se escribe
    const alertHolder = document.createElement('div');
    const refreshAlert = () => {
        alertHolder.innerHTML = '';
        const tv = wantsTemp(p) ? parseTemp(draft.temp) : {};
        const hv = wantsHum(p) ? parseHum(draft.hum) : {};
        const box = alertBox(alertMessages(tv.value, hv.value, p.limits), false);
        if (box) alertHolder.appendChild(box);
    };
    if (wantsTemp(p)) {
        const box = document.createElement('div');
        box.className = 'pm-app-card';
        box.setAttribute('data-help-key', 'appTmpTemperatura');
        box.innerHTML = `<label class="pm-app-qty-label pm-app-who-label" for="tmp-app-temp">${esc(t('home.tmpTemperature'))} <span class="pm-app-req" aria-hidden="true">*</span></label>
            <div class="tmp-app-row"><button type="button" class="tmp-app-sign" id="tmp-app-sign" aria-label="${esc(t('home.tmpToggleSign'))}" title="${esc(t('home.tmpToggleSign'))}">±</button><input id="tmp-app-temp" class="pm-app-input" type="text" inputmode="decimal" autocomplete="off" maxlength="7" placeholder="0.0" value="${esc(draft.temp)}"><span class="tmp-app-unit">°C</span></div>`;
        bodyEl.appendChild(box);
        const input = box.querySelector('#tmp-app-temp');
        input.addEventListener('input', () => { draft.temp = input.value; refreshAlert(); });
        box.querySelector('#tmp-app-sign').addEventListener('click', () => {
            const v = input.value.trim();
            input.value = v.startsWith('-') ? v.slice(1) : `-${v}`;
            draft.temp = input.value;
            input.focus();
            refreshAlert();
        });
    }
    if (wantsHum(p)) {
        const box = document.createElement('div');
        box.className = 'pm-app-card';
        box.setAttribute('data-help-key', 'appTmpHumedad');
        box.innerHTML = `<label class="pm-app-qty-label pm-app-who-label" for="tmp-app-hum">${esc(t('home.tmpHumidity'))} <span class="pm-app-req" aria-hidden="true">*</span></label>
            <div class="tmp-app-row"><input id="tmp-app-hum" class="pm-app-input" type="text" inputmode="decimal" autocomplete="off" maxlength="6" placeholder="0" value="${esc(draft.hum)}"><span class="tmp-app-unit">%</span></div>`;
        bodyEl.appendChild(box);
        const input = box.querySelector('#tmp-app-hum');
        input.addEventListener('input', () => { draft.hum = input.value; refreshAlert(); });
    }
    bodyEl.appendChild(alertHolder);
    refreshAlert();

    // la foto de la lectura (obligatoria, una sola)
    const photoBox = document.createElement('div');
    photoBox.className = 'pm-app-card';
    photoBox.setAttribute('data-help-key', 'appTmpFoto');
    bodyEl.appendChild(photoBox);
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'home-carga-new-btn pm-app-send';
    sendBtn.innerHTML = `<i class="bx bx-save" aria-hidden="true"></i><span>${esc(t('home.tmpSend'))}</span>`;
    const photoDraw = () => {
        photoBox.innerHTML = `<h4 class="pm-app-title">${esc(t('home.tmpPhoto'))} <span class="pm-app-req" aria-hidden="true">*</span></h4><p class="pm-app-note">${esc(t('home.tmpPhotoHint'))}</p>`;
        if (draft.photo) {
            const cell = document.createElement('div');
            cell.className = 'inc-app-shots';
            cell.innerHTML = `<div class="inc-app-shot"><img alt="" src="${esc(draft.photo.thumb)}"></div>`;
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'inc-app-shot-rm';
            rm.setAttribute('aria-label', t('home.incRemove'));
            rm.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
            rm.addEventListener('click', () => { draft.photo = null; photoDraw(); });
            cell.firstElementChild.appendChild(rm);
            photoBox.appendChild(cell);
        }
        if (draft.preparing) { const w = document.createElement('p'); w.className = 'pm-app-note'; w.textContent = t('home.tmpPreparing'); photoBox.appendChild(w); }
        const add = document.createElement('label');
        add.className = 'home-carga-secondary-btn inc-app-add';
        add.innerHTML = `<i class="bx bx-camera" aria-hidden="true"></i> <span>${esc(draft.photo ? t('home.tmpChangePhoto') : t('home.tmpAddPhoto'))}</span><input type="file" accept="image/*" capture="environment">`;
        add.querySelector('input').addEventListener('change', async (event) => {
            const file = (event.target.files || [])[0];
            event.target.value = ''; // así se puede volver a elegir la misma foto
            if (!file) return;
            draft.preparing += 1;
            photoDraw();
            try { draft.photo = await preparePhoto(file); } catch { showToast(t('home.tmpErrPhoto')); }
            draft.preparing -= 1;
            photoDraw();
        });
        photoBox.appendChild(add);
        sendBtn.disabled = draft.preparing > 0;
    };
    photoDraw();

    sendBtn.addEventListener('click', () => {
        const problem = draftProblem();
        if (problem) { showToast(problem.text); if (problem.focus) bodyEl.querySelector(problem.focus)?.focus(); return; }
        sendDraft(sendBtn);
    });
    bodyEl.appendChild(sendBtn);
}
// Lo que falta para poder enviar (el mismo orden de la pantalla); ok = los números ya leídos.
function draftProblem() {
    const p = draft.point;
    if (!draft.name.replace(/\s+/g, ' ').trim()) return { text: t('home.tmpNeedName'), focus: '#tmp-app-who' };
    if (wantsTemp(p)) {
        const tv = parseTemp(draft.temp);
        if (tv.empty) return { text: t('home.tmpNeedTemp'), focus: '#tmp-app-temp' };
        if (tv.bad) return { text: t('home.tmpBadTemp'), focus: '#tmp-app-temp' };
    }
    if (wantsHum(p)) {
        const hv = parseHum(draft.hum);
        if (hv.empty) return { text: t('home.tmpNeedHum'), focus: '#tmp-app-hum' };
        if (hv.bad) return { text: t('home.tmpBadHum'), focus: '#tmp-app-hum' };
    }
    if (!draft.photo) return { text: t('home.tmpNeedPhoto') };
    return null;
}
const SERVER_ERRORS = { NAME: 'home.tmpNeedName', TEMP: 'home.tmpBadTemp', HUM: 'home.tmpBadHum', PHOTO: 'home.tmpErrPhoto', POINT: 'home.tmpPointGone', CENTER: 'home.tmpNoCenters' };

async function sendDraft(sendBtn) {
    if (!draft) return;
    const p = draft.point;
    const name = draft.name.replace(/\s+/g, ' ').trim().slice(0, 60);
    const ref = draft.clientRef;
    const temperature = wantsTemp(p) ? parseTemp(draft.temp).value : null;
    const humidity = wantsHum(p) ? parseHum(draft.hum).value : null;
    const body = { costCenterId: draft.costCenterId, kind: p.kind, pointId: p.id, name, temperature, humidity, photo: draft.photo.photo, thumb: draft.photo.thumb, clientAt: new Date().toISOString(), clientRef: ref };
    const cc = centerOf(draft.costCenterId);
    const description = `${t('menu.opCentroDistTemperaturas')} · ${cc ? cc.name : ''} · ${p.code || ''}`;
    if (sendBtn) sendBtn.disabled = true;
    try {
        // rejectable: si ya con señal el servidor la rechaza (el equipo dejó de existir) se anota en "No se aplicó" en vez de trabar la cola
        const result = await sync().offlineAwareFetch(
            `${API}/readings`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) },
            description, `${RECORD_PREFIX}-new:${ref}`, null, { rejectable: true },
        );
        if (!result.queued && !result.ok) {
            showToast(SERVER_ERRORS[result.body.code] ? t(SERVER_ERRORS[result.body.code]) : (result.body.message || t('home.tmpErrSend')));
            if (sendBtn) sendBtn.disabled = false;
            return;
        }
        try { localStorage.setItem(NAME_KEY, name); } catch { /* sin almacenamiento */ }
        const rec = result.queued ? null : result.body.record;
        doneInfo = {
            queued: !!result.queued, id: rec ? rec.id : null, name, at: rec ? rec.checkedAt : body.clientAt, temperature, humidity, limits: p.limits || {}, point: pointText(p.kind, p.code, p.type), zone: p.zoneName, centroCostos: cc ? cc.name : '',
        };
        if (!result.queued) await Promise.all([loadRecords(), loadOptions()]);
        draft = null;
        await refreshQueued();
        view = 'done';
        render();
    } catch {
        showToast(t('home.tmpErrSend'));
        if (sendBtn) sendBtn.disabled = false;
    }
}

// Lo que se mandó: la lectura (con su aviso si quedó fuera de rango) y su número (o «en tu celular» si no hubo señal).
let doneInfo = null;
function renderDone() {
    const d = doneInfo;
    if (!d) { view = 'list'; render(); return; }
    titleEl.textContent = t(d.queued ? 'home.tmpSavedTitle' : 'home.tmpSentTitle');
    const box = document.createElement('div');
    box.className = 'pm-app-card pm-app-done';
    const big = [d.temperature !== null && d.temperature !== undefined ? fmtTemp(d.temperature) : '', d.humidity !== null && d.humidity !== undefined ? fmtHum(d.humidity) : ''].filter(Boolean).join(' · ');
    box.innerHTML = `<div class="pm-app-tick" aria-hidden="true"><i class="bx ${d.queued ? 'bx-cloud-upload' : 'bx-check'}"></i></div>
        <span class="pm-app-lbl">${esc(t('home.tmpNumber'))}</span>
        <div class="pm-app-folio">${esc(d.id ? `TMP-${d.id}` : t('home.tmpNoNumberYet'))}</div>
        ${d.queued ? `<p class="pm-app-note">${esc(t('home.tmpNumberOnSync'))}</p>` : ''}
        <div class="tmp-app-big">${esc(big)}</div>
        <div class="pm-app-meta pm-app-meta-flat">${[[t('main.colTmpActivo'), d.point], [t('main.colTmpQuien'), d.name], [t('main.colTmpMomento'), formatTime(d.at)], [t('main.colTmpZona'), d.zone], [t('home.incCenter'), d.centroCostos]].filter(([, v]) => v).map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
    bodyEl.appendChild(box);
    const al = alertBox(alertMessages(d.temperature, d.humidity, d.limits), true);
    if (al) bodyEl.appendChild(al);
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'home-carga-new-btn';
    again.innerHTML = `<i class="bx bx-fridge" aria-hidden="true"></i><span>${esc(t('home.tmpAnother'))}</span>`;
    again.addEventListener('click', () => { doneInfo = null; tab = 'points'; view = 'list'; render(); });
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'home-carga-secondary-btn';
    back.textContent = t('home.tmpBackToList');
    back.addEventListener('click', () => { doneInfo = null; tab = 'readings'; view = 'list'; render(); });
    bodyEl.append(again, back);
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') { window.location.href = 'AppInicio.html'; return; }
    if (view === 'new' && draft && (draft.photo || draft.temp.trim() || draft.hum.trim()) && !window.confirm(t('home.tmpDiscard'))) return;
    draft = null;
    doneInfo = null;
    view = 'list';
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
        console.error('Temperaturas (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
