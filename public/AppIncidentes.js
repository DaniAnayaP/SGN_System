// ---------------------------------------------------------------------------
// Incidentes (App) — la misma pantalla de la Web (Operaciones > Incidentes) hecha para el celular:
//   · la lista de reportes (folio, criterio, lugar, hora) con su categoría y su estatus: Abierto, En atención o Cerrado;
//   · Nuevo reporte: quién reporta, dónde pasó (la zona del Layout del centro de costos y un detalle opcional), la categoría y el criterio de esa categoría, lo que pasó con sus palabras y las evidencias (fotos de la
//     cámara o de la galería, mínimo una y sin máximo; se reducen en el celular). Los criterios y las zonas se guardan en el celular, así que el reporte se arma SIN señal: queda en la cola de AppOfflineSync.js
//     ("En tu celular") y se envía solo al reconectar con la hora a la que se hizo (el servidor guarda aparte la hora en que lo recibió). Las evidencias viajan en tandas por esa misma cola;
//   · con permiso (Ver y Operar en la columna Estatus del árbol), cada reporte se pasa a Abierto / En atención / Cerrado; sin señal el cambio también queda en la cola.
// El nombre de quien reporta sale de la cuenta (se puede cambiar). Corregir un reporte, eliminarlo y el QR se siguen haciendo en la Web.
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
const API = '/api/business/incidentes';
const RECORD_PREFIX = 'incidentes';
const KINDS = ['mayor', 'menor', 'recomendacion'];
const STATUSES = ['open', 'in_progress', 'closed'];
const PHOTO_MAX_BYTES = 420 * 1024;           // el servidor acepta hasta ~450 KB por foto
const BATCH_MAX_BYTES = 5 * 1024 * 1024;      // lo que viaja en una sola petición (el servidor acepta 10 MB)
const THUMBS_SHOWN = 4;
let currentUser = null;
let isClientAdmin = false;
let effectiveGrants = [];
let costCenters = [];
let incidents = [];           // reportes del servidor (el más nuevo primero)
let queuedReports = [];       // reportes que se mandaron sin señal y siguen en la cola de este celular
let canStatus = false;
let canPhotos = false;
let options = { criteria: [], zonesByCenter: {}, batch: 10, maxChars: 2000 };
let optionsState = 'loading'; // 'loading' | 'online' | 'cached' | 'none'
let view = 'list';            // 'list' | 'detail' | 'new' | 'done'
let openKey = null;           // el reporte abierto: 'i:<id>' o 'q:<clientRef>'
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
const userLabel = () => (currentUser && (currentUser.name || currentUser.username)) || '';
const evidenceText = (n) => (n === 1 ? t('home.incEvidence1') : t('home.incEvidenceN', { n }));
const kindLabel = (k) => t(`main.incKind_${k}`);
const statusLabel = (s) => t(`main.incEstatus_${s}`);
const zoneText = (z) => `${z.code ? `${z.code} · ` : ''}${z.name}`;
const zonesOf = (ccId) => (options.zonesByCenter && options.zonesByCenter[ccId]) || [];

// --- Opciones (criterios y zonas de cada centro): se bajan al abrir y se guardan en el celular para armar el reporte sin señal -----------------------
function cacheDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('sgn-inc-cache', 1);
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
            options = { criteria: body.criteria || [], zonesByCenter: body.zonesByCenter || {}, batch: body.batch || 10, maxChars: body.maxChars || 2000 };
            optionsState = 'online';
            cacheSave({ clientId, options, at: body.at }).catch(() => { /* sin almacenamiento: se bajan otra vez la próxima */ });
            return;
        }
    } catch { /* sin señal: se usan las guardadas */ }
    try {
        const saved = await cacheRead();
        // lo guardado solo sirve si es de la misma empresa (otra cuenta en el mismo celular no ve criterios ajenos)
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
async function loadIncidents() {
    try {
        const res = await fetch(apiUrl(`${API}?lite=1`), { credentials: 'include' });
        if (!res.ok) return;
        const body = await res.json();
        canStatus = !!body.canStatus;
        canPhotos = !!body.canPhotos;
        incidents = body.incidents || [];
        await applyQueuedStatuses();
    } catch { /* sin señal: se queda con lo que ya se veía */ }
}
function incidentVisible(r) {
    if (r.queued) return true;
    if (!hasCostCenterPermission(r.cc) && r.cc) return false;
    const sel = selectedCostCenterIds();
    return !sel || !r.cc || sel.has(Number(r.cc));
}

// --- Lo que se mandó sin señal y sigue en la cola: los reportes nuevos se ven en la lista como "En tu celular" y los cambios de estatus ya se ven aplicados ---------------
const CREATE_URL = /\/api\/business\/incidentes\/reports$/;
const PHOTOS_URL = /\/api\/business\/incidentes\/reports\/([A-Za-z0-9_-]+)\/photos$/;
const STATUS_URL = /\/api\/business\/incidentes\/(\d+)\/status$/;
async function readQueue() {
    try { return await sync().listOfflineQueue(); } catch { return []; }
}
const parseBody = (item) => { try { return JSON.parse(item.body || '{}'); } catch { return null; } };
// Cuántas evidencias de ese reporte siguen en la cola (las de su primera petición, si ella también sigue ahí, y las de sus tandas).
function pendingPhotos(queue, ref) {
    let n = 0;
    queue.forEach((item) => {
        if (item.method !== 'POST' || !item.url) return;
        const body = parseBody(item);
        if (!body) return;
        if (CREATE_URL.test(item.url) && body.clientRef === ref) n += (body.photos || []).length;
        const m = PHOTOS_URL.exec(item.url);
        if (m && m[1] === ref) n += (body.photos || []).length;
    });
    return n;
}
let queueMineCount = 0;
async function refreshQueued() {
    const queue = await readQueue();
    queuedReports = [];
    queueMineCount = queue.filter((item) => item.method === 'POST' && item.url && (CREATE_URL.test(item.url) || PHOTOS_URL.test(item.url) || STATUS_URL.test(item.url))).length;
    queue.forEach((item) => {
        if (item.method !== 'POST' || !item.url || !CREATE_URL.test(item.url)) return;
        const body = parseBody(item);
        if (!body) return;
        const crit = (options.criteria || []).find((c) => c.id === body.criterionId) || {};
        const cc = costCenters.find((c) => c.id === body.costCenterId);
        const zone = zonesOf(body.costCenterId).find((z) => z.id === body.zoneId);
        queuedReports.push({
            key: `q:${body.clientRef || item.id}`, queued: true, ref: body.clientRef, folio: '', name: body.name || userLabel(), reportedAt: body.clientAt || item.queuedAt, cc: body.costCenterId, centroCostos: cc ? cc.name : '',
            zoneName: zone ? zoneText(zone) : '', placeDetail: body.placeDetail || '', category: crit.kind || '', criterion: crit.name || '', description: body.description || '', status: 'open', source: 'app',
            photos: (body.photos || []).map((p) => ({ thumb: p.thumb || p.photo, photo: p.photo })), photoCount: pendingPhotos(queue, body.clientRef),
        });
    });
    queuedReports.reverse();
}
async function applyQueuedStatuses() {
    const queue = await readQueue();
    queue.forEach((item) => {
        const m = item.method === 'POST' && item.url ? STATUS_URL.exec(item.url) : null;
        if (!m) return;
        const body = parseBody(item);
        if (!body || !STATUSES.includes(body.status)) return;
        incidents.forEach((r) => { if (String(r.id) === m[1]) r.status = body.status; });
    });
}
// AppOfflineSync avisa cada 30 s aunque nada haya cambiado: solo se vuelve a dibujar si cambió lo que esta pantalla tenía en la cola, y nunca en "Nuevo reporte" (se perdería lo que se está escribiendo).
document.addEventListener('sgn:offline-queue-changed', async () => {
    const before = queueMineCount;
    await refreshQueued();
    if (view === 'done') { drawDoneProgress(await readQueue()); }
    if (before === queueMineCount) return;
    // al reconectar la cola se vacía: se vuelve a pedir la lista para ver los reportes ya con su folio
    if (queueMineCount === 0 && navigator.onLine) await loadIncidents();
    if (view === 'list' || view === 'detail') render();
});
document.addEventListener('sgn:offline-rejected', () => { if (view === 'list') render(); });

const allReports = () => [...queuedReports, ...incidents].filter(incidentVisible);

// --- Cambiar el estatus de un reporte ------------------------------------------------------------------------------------------------------
async function changeStatus(report, status) {
    if (report.status === status) return;
    const description = `${t('menu.opCentroDistIncidentes')} · ${report.folio}`;
    const before = report.status;
    try {
        const result = await sync().offlineAwareFetch(
            `${API}/${report.id}/status`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status }) },
            description, `${RECORD_PREFIX}:${report.id}`, null, { rejectable: true },
        );
        if (result.queued) {
            report.status = status;
            showToast(t('home.incStatusSavedOffline'));
        } else if (!result.ok) {
            showToast(result.body.message || t('admin.saveError'));
        } else {
            report.status = status;
            showToast(t('home.incStatusSaved'));
        }
    } catch {
        report.status = before;
        showToast(t('admin.saveError'));
    }
    render();
}

// --- Fotos: se piden con la sesión y se muestran como imagen local (en la App instalada la dirección del servidor es de otro origen) -----------------------------
const photoCache = new Map();
async function photoUrl(incidentId, photoId, thumb) {
    const url = `${API}/${incidentId}/photo/${photoId}${thumb ? '?thumb=1' : ''}`;
    if (photoCache.has(url)) return photoCache.get(url);
    const res = await fetch(apiUrl(url), { credentials: 'include' });
    if (!res.ok) throw new Error('photo');
    const objectUrl = URL.createObjectURL(await res.blob());
    photoCache.set(url, objectUrl);
    return objectUrl;
}
function fillImage(img, incidentId, photoId, thumb) {
    photoUrl(incidentId, photoId, thumb).then((src) => { img.src = src; }).catch(() => { img.alt = '—'; });
}

// --- Pantalla --------------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
document.getElementById('carga-progress-track').hidden = true;
document.getElementById('carga-progress-label').hidden = true;

function render() {
    bodyEl.innerHTML = '';
    if (siteBlocked) { window.AppSiteGate.show(bodyEl, t); titleEl.textContent = t('menu.opCentroDistIncidentes'); return; }
    if (view === 'new') { renderNew(); return; }
    if (view === 'done') { renderDone(); return; }
    if (view === 'detail') { renderDetail(); return; }
    renderList();
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
const kindPill = (k) => (k ? `<span class="pm-app-pill inc-app-kind-${esc(k)}">${esc(kindLabel(k))}</span>` : '');

function renderList() {
    titleEl.textContent = t('menu.opCentroDistIncidentes');
    renderRejectedBanner();
    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'home-carga-new-btn';
    newBtn.setAttribute('data-help-key', 'mobileNewRecord');
    newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${esc(t('home.incNewButton'))}</span>`;
    newBtn.addEventListener('click', startNewReport);
    bodyEl.appendChild(newBtn);

    const list = allReports();
    if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('home.incListEmpty');
        bodyEl.appendChild(empty);
        return;
    }
    list.forEach((r) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        const key = r.queued ? `q:${r.ref}` : `i:${r.id}`;
        const label = r.queued ? t('home.incOnPhone') : r.folio;
        const sub = [r.queued ? r.zoneName : [r.zoneCode, r.zoneName].filter(Boolean).join(' · '), formatTime(r.reportedAt)].filter(Boolean).join(' · ');
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx ${r.queued ? 'bx-cloud-upload' : 'bx-error-circle'}" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label"><p>${esc(label)}${r.criterion ? ` · ${esc(r.criterion)}` : ''}</p><span>${esc(sub)}</span></span>
            <span class="inc-app-pills">${kindPill(r.category)}<span class="pm-app-pill ${r.queued ? 'pm-app-pill-queued' : `inc-app-status-${esc(r.status)}`}">${esc(r.queued ? t('home.incOnPhone') : statusLabel(r.status))}</span></span>`;
        row.addEventListener('click', () => { openKey = key; view = 'detail'; render(); });
        bodyEl.appendChild(row);
    });
}

// --- Detalle de un reporte -----------------------------------------------------------------------------------------------------------------
function renderDetail() {
    const r = allReports().find((x) => (x.queued ? `q:${x.ref}` : `i:${x.id}`) === openKey);
    if (!r) { view = 'list'; render(); return; }
    titleEl.textContent = r.queued ? t('home.incOnPhone') : r.folio;
    const place = [r.queued ? r.zoneName : [r.zoneCode, r.zoneName].filter(Boolean).join(' · '), r.placeDetail].filter(Boolean).join(' · ');
    const meta = document.createElement('div');
    meta.className = 'pm-app-meta';
    const rows = [
        [t('home.incReportedBy'), r.name || '—'],
        [t('home.incWhen'), formatTime(r.reportedAt)],
        r.receivedAt ? [t('main.pmRecibido'), formatTime(r.receivedAt)] : null,
        [t('home.incPlaceLabel'), place || '—'],
        [t('home.incCenter'), r.centroCostos || '—'],
        [t('home.incCategory'), r.category ? kindLabel(r.category) : '—'],
        [t('home.incCriterion'), r.criterion || '—'],
        [t('main.colIncOrigen'), r.source === 'qr' ? t('main.incOrigenQr') : (r.source === 'app' ? t('main.incOrigenApp') : t('main.incOrigenUsuario'))],
    ].filter(Boolean);
    meta.innerHTML = rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    bodyEl.appendChild(meta);

    // el estatus: con permiso se cambia con un toque
    const statusRow = document.createElement('div');
    statusRow.className = 'pm-app-line';
    const pill = document.createElement(canStatus && !r.queued ? 'button' : 'span');
    const editable = canStatus && !r.queued;
    if (editable) { pill.type = 'button'; pill.setAttribute('data-help-key', 'incEstatus'); pill.setAttribute('aria-label', t('main.colIncEstatus')); }
    pill.className = `pm-app-pill ${r.queued ? 'pm-app-pill-queued' : `inc-app-status-${r.status}`}${editable ? ' pm-app-pill-btn' : ''}`;
    pill.innerHTML = editable ? `${esc(statusLabel(r.status))} <i class="bx bx-chevron-down" aria-hidden="true"></i>` : esc(r.queued ? t('home.incOnPhone') : statusLabel(r.status));
    if (editable) pill.addEventListener('click', () => openSheet(t('main.colIncEstatus'), STATUSES.map((s) => ({ value: s, label: statusLabel(s) })), r.status, (value) => changeStatus(r, value)));
    statusRow.innerHTML = `<div class="pm-app-line-main"><p>${esc(t('main.colIncEstatus'))}</p></div>`;
    statusRow.appendChild(pill);
    bodyEl.appendChild(statusRow);

    const desc = document.createElement('div');
    desc.className = 'pm-app-card';
    desc.innerHTML = `<h4 class="pm-app-title">${esc(t('main.colIncDescripcion'))}</h4><p class="inc-app-desc">${esc(r.description || '—')}</p>`;
    bodyEl.appendChild(desc);

    // las evidencias: miniaturas (con la columna Evidencias en el árbol); un toque las abre grandes
    const photos = r.queued ? r.photos : (canPhotos ? (r.photoIds || []) : []);
    const ev = document.createElement('div');
    ev.className = 'pm-app-card';
    ev.setAttribute('data-help-key', 'incEvidencias');
    ev.innerHTML = `<h4 class="pm-app-title">${esc(t('home.incEvidence'))} · ${esc(r.photoCount ? evidenceText(r.photoCount) : t('home.incNoEvidence'))}</h4>`;
    if (photos.length) {
        const grid = document.createElement('div');
        grid.className = 'inc-app-shots';
        photos.forEach((p, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'inc-app-shot';
            btn.setAttribute('aria-label', t('main.incFotoVer'));
            const img = document.createElement('img');
            img.alt = '';
            if (r.queued) img.src = p.thumb; else fillImage(img, r.id, p, true);
            btn.appendChild(img);
            btn.addEventListener('click', () => openViewer(r, photos, i));
            grid.appendChild(btn);
        });
        ev.appendChild(grid);
    }
    bodyEl.appendChild(ev);
}

// El visor de evidencias (pantalla completa, con anterior y siguiente).
function openViewer(report, photos, start) {
    let index = start;
    const scrim = document.createElement('div');
    scrim.className = 'inc-app-viewer';
    scrim.innerHTML = `<div class="inc-app-viewer-bar"><span id="inc-app-vcount"></span><button type="button" id="inc-app-vclose" aria-label="${esc(t('main.incFotoCerrar'))}"><i class="bx bx-x" aria-hidden="true"></i></button></div>
        <div class="inc-app-viewer-stage"><img id="inc-app-vimg" alt=""></div>
        <div class="inc-app-viewer-nav"><button type="button" class="home-carga-secondary-btn" id="inc-app-vprev">${esc(t('main.incFotoAnterior'))}</button><button type="button" class="home-carga-secondary-btn" id="inc-app-vnext">${esc(t('main.incFotoSiguiente'))}</button></div>`;
    document.body.appendChild(scrim);
    const img = scrim.querySelector('#inc-app-vimg');
    const draw = () => {
        scrim.querySelector('#inc-app-vcount').textContent = t('main.incFotoDe', { n: index + 1, total: photos.length });
        scrim.querySelector('#inc-app-vprev').disabled = index <= 0;
        scrim.querySelector('#inc-app-vnext').disabled = index >= photos.length - 1;
        img.removeAttribute('src');
        if (report.queued) img.src = photos[index].photo; else fillImage(img, report.id, photos[index], false);
    };
    scrim.querySelector('#inc-app-vclose').addEventListener('click', () => scrim.remove());
    scrim.querySelector('#inc-app-vprev').addEventListener('click', () => { if (index > 0) { index -= 1; draw(); } });
    scrim.querySelector('#inc-app-vnext').addEventListener('click', () => { if (index < photos.length - 1) { index += 1; draw(); } });
    draw();
}

// --- Hoja de opciones (la misma de las demás pantallas de la App) -------------------------------------------------------------------------
function openSheet(titleText, items, currentValue, onPick) {
    const scrim = document.createElement('div');
    scrim.className = 'home-select-scrim';
    const sheet = document.createElement('div');
    sheet.className = 'home-select-sheet';
    sheet.appendChild(Object.assign(document.createElement('div'), { className: 'home-select-sheet-handle' }));
    sheet.appendChild(Object.assign(document.createElement('div'), { className: 'home-select-sheet-title', textContent: titleText }));
    items.forEach((opt) => {
        const active = opt.value === currentValue;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `home-select-option${active ? ' active' : ''}`;
        btn.innerHTML = `<span>${esc(opt.label)}</span>${active ? '<i class="bx bx-check" aria-hidden="true"></i>' : ''}`;
        btn.addEventListener('click', () => { scrim.remove(); onPick(opt.value); });
        sheet.appendChild(btn);
    });
    scrim.addEventListener('click', (event) => { if (event.target === scrim) scrim.remove(); });
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
}

// --- Fotos del reporte nuevo: se reducen en el celular (máx. 1280 px de lado, JPEG) para que suban rápido aunque la cámara sea de 12 megapíxeles ------------------
function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => loadImageElement(file));
    return loadImageElement(file);
}
function loadImageElement(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
        img.src = url;
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

// --- Nuevo reporte -----------------------------------------------------------------------------------------------------------------------
// draft: { costCenterId, name, zoneId, detail, category, criterionId, description, photos: [{ key, photo, thumb, bytes }], preparing, clientRef }
let draft = null;
const NAME_KEY = 'sgn_inc_name';
function newRef() {
    const bytes = new Uint8Array(12);
    (window.crypto || {}).getRandomValues?.(bytes);
    const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') || Math.random().toString(16).slice(2).padEnd(24, '0');
    return `app-${Date.now().toString(36)}-${rand}`;
}
let photoSeq = 0;
const newPhotoKey = () => `${Date.now().toString(36)}${(++photoSeq).toString(36)}${Math.random().toString(36).slice(2, 7)}`.slice(0, 40);
function startNewReport() {
    if (!costCenters.length) { showToast(t('home.incNoCenters')); return; }
    const sel = selectedCostCenterIds();
    let costCenterId = null;
    if (sel && sel.size === 1) { const only = Array.from(sel)[0]; if (costCenters.some((c) => c.id === only)) costCenterId = only; }
    if (costCenterId === null && costCenters.length === 1) costCenterId = costCenters[0].id;
    // «Quién reporta» siempre se pide: viene escrito con el último nombre usado (o el de la cuenta) y se puede cambiar
    let name = '';
    try { name = localStorage.getItem(NAME_KEY) || ''; } catch { /* sin almacenamiento */ }
    draft = { costCenterId, name: name || userLabel(), zoneId: '', detail: '', category: '', criterionId: 0, description: '', photos: [], preparing: 0, clientRef: newRef() };
    view = 'new';
    render();
}

function renderNew() {
    titleEl.textContent = t('home.incNewButton');
    if (optionsState === 'none') { const p = document.createElement('p'); p.className = 'home-carga-empty-note'; p.textContent = t('home.incOptionsNone'); bodyEl.appendChild(p); return; }
    if (!(options.criteria || []).length) { const p = document.createElement('p'); p.className = 'home-carga-empty-note'; p.textContent = t('home.incNoCriteriaAll'); bodyEl.appendChild(p); return; }
    if (optionsState === 'cached') { const p = document.createElement('p'); p.className = 'pm-app-note'; p.textContent = t('home.incOptionsCached'); bodyEl.appendChild(p); }

    // el centro de costos
    const ccRow = document.createElement('button');
    ccRow.type = 'button';
    ccRow.className = 'home-carga-field-row pm-app-cc';
    const ccDraw = () => {
        const cc = costCenters.find((c) => c.id === draft.costCenterId);
        ccRow.innerHTML = `<span class="home-carga-field-icon"><i class="bx bx-buildings" aria-hidden="true"></i></span><span class="home-carga-field-label"><p>${esc(t('home.incCenter'))}</p><span>${esc(cc ? `${cc.code ? `${cc.code} · ` : ''}${cc.name}` : t('home.incCenterPick'))}</span></span><i class="bx ${cc ? 'bx-edit' : 'bx-chevron-down'} home-carga-field-trailing"></i>`;
    };
    ccDraw();
    ccRow.addEventListener('click', () => openSheet(t('home.incCenter'), costCenters.map((c) => ({ value: c.id, label: `${c.code ? `${c.code} · ` : ''}${c.name}` })), draft.costCenterId, (value) => {
        draft.costCenterId = value;
        draft.zoneId = ''; // las zonas son las del Layout de cada centro
        ccDraw();
        placeDraw();
    }));
    const ccWrap = document.createElement('div');
    ccWrap.className = 'home-carga-field';
    ccWrap.appendChild(ccRow);
    bodyEl.appendChild(ccWrap);

    // quién reporta (siempre se pide el nombre)
    const whoBox = document.createElement('div');
    whoBox.className = 'pm-app-card';
    whoBox.innerHTML = `<label class="pm-app-qty-label pm-app-who-label" for="inc-app-who">${esc(t('home.incWho'))} <span class="pm-app-req" aria-hidden="true">*</span></label><input id="inc-app-who" class="pm-app-input" type="text" maxlength="60" autocomplete="name" required placeholder="${esc(t('home.incWhoPlaceholder'))}" value="${esc(draft.name)}">`;
    bodyEl.appendChild(whoBox);
    const whoInput = whoBox.querySelector('#inc-app-who');
    whoInput.addEventListener('input', () => { draft.name = whoInput.value; });

    // dónde pasó: la zona del Layout del centro y un detalle (sin zonas en el Layout, el detalle es obligatorio)
    const placeBox = document.createElement('div');
    placeBox.className = 'pm-app-card';
    bodyEl.appendChild(placeBox);
    const placeDraw = () => {
        const zones = zonesOf(draft.costCenterId);
        const zone = zones.find((z) => z.id === draft.zoneId);
        placeBox.innerHTML = '';
        if (zones.length) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'home-carga-field-row pm-app-cc';
            row.innerHTML = `<span class="home-carga-field-icon"><i class="bx bx-map-pin" aria-hidden="true"></i></span><span class="home-carga-field-label"><p>${esc(t('home.incZone'))} <span class="pm-app-req" aria-hidden="true">*</span></p><span>${esc(zone ? zoneText(zone) : t('home.incZonePick'))}</span></span><i class="bx ${zone ? 'bx-edit' : 'bx-chevron-down'} home-carga-field-trailing"></i>`;
            row.addEventListener('click', () => openSheet(t('home.incZone'), zones.map((z) => ({ value: z.id, label: zoneText(z) })), draft.zoneId, (value) => { draft.zoneId = value; placeDraw(); }));
            placeBox.appendChild(row);
        } else if (draft.costCenterId !== null) {
            const note = document.createElement('p');
            note.className = 'pm-app-note';
            note.textContent = t('home.incNoZones');
            placeBox.appendChild(note);
        }
        const detail = document.createElement('div');
        detail.innerHTML = `<label class="pm-app-qty-label pm-app-who-label" for="inc-app-detail">${esc(zones.length ? t('home.incDetail') : t('home.incPlace'))}${zones.length ? '' : ' <span class="pm-app-req" aria-hidden="true">*</span>'}</label><input id="inc-app-detail" class="pm-app-input" type="text" maxlength="200" autocomplete="off" placeholder="${esc(t('home.incDetailPlaceholder'))}" value="${esc(draft.detail)}">`;
        detail.querySelector('input').addEventListener('input', (event) => { draft.detail = event.target.value; });
        placeBox.appendChild(detail);
    };
    placeDraw();

    // la categoría y el criterio de esa categoría
    const critBox = document.createElement('div');
    critBox.className = 'pm-app-card';
    bodyEl.appendChild(critBox);
    const critDraw = () => {
        critBox.innerHTML = `<h4 class="pm-app-title">${esc(t('home.incCategory'))} <span class="pm-app-req" aria-hidden="true">*</span></h4>`;
        const chips = document.createElement('div');
        chips.className = 'pm-app-chips';
        KINDS.forEach((k) => {
            const n = options.criteria.filter((c) => c.kind === k).length;
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = `pm-app-chip inc-app-chip inc-app-kind-${k}`;
            chip.setAttribute('aria-pressed', String(draft.category === k));
            chip.disabled = !n;
            chip.innerHTML = `${esc(kindLabel(k))} <small>${esc(n === 1 ? t('home.incCriteria1') : t('home.incCriteriaN', { n }))}</small>`;
            chip.addEventListener('click', () => { if (draft.category !== k) { draft.category = k; draft.criterionId = 0; } critDraw(); });
            chips.appendChild(chip);
        });
        critBox.appendChild(chips);
        const title = document.createElement('h4');
        title.className = 'pm-app-title';
        title.innerHTML = `${esc(t('home.incCriterion'))} <span class="pm-app-req" aria-hidden="true">*</span>`;
        critBox.appendChild(title);
        const list = document.createElement('div');
        list.className = 'inc-app-crits';
        if (!draft.category) { const n = document.createElement('p'); n.className = 'pm-app-note'; n.textContent = t('home.incPickCategory'); list.appendChild(n); }
        else {
            const crits = options.criteria.filter((c) => c.kind === draft.category);
            if (!crits.length) { const n = document.createElement('p'); n.className = 'pm-app-note'; n.textContent = t('home.incNoCriteria'); list.appendChild(n); }
            crits.forEach((c) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'inc-app-crit';
                btn.setAttribute('aria-pressed', String(draft.criterionId === c.id));
                btn.textContent = c.name;
                btn.addEventListener('click', () => { draft.criterionId = c.id; critDraw(); });
                list.appendChild(btn);
            });
        }
        critBox.appendChild(list);
    };
    critDraw();

    // lo que pasó, con sus palabras
    const storyBox = document.createElement('div');
    storyBox.className = 'pm-app-card';
    storyBox.innerHTML = `<label class="pm-app-qty-label pm-app-who-label" for="inc-app-story">${esc(t('home.incStory'))} <span class="pm-app-req" aria-hidden="true">*</span></label><textarea id="inc-app-story" class="pm-app-input inc-app-textarea" rows="5" maxlength="${esc(options.maxChars || 2000)}" placeholder="${esc(t('home.incStoryPlaceholder'))}">${esc(draft.description)}</textarea>`;
    bodyEl.appendChild(storyBox);
    storyBox.querySelector('textarea').addEventListener('input', (event) => { draft.description = event.target.value; });

    // las evidencias: mínimo una, sin máximo
    const evBox = document.createElement('div');
    evBox.className = 'pm-app-card';
    bodyEl.appendChild(evBox);
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'home-carga-new-btn pm-app-send';
    sendBtn.innerHTML = `<i class="bx bx-send" aria-hidden="true"></i><span>${esc(t('home.incSend'))}</span>`;
    const sendDraw = () => { sendBtn.disabled = draft.preparing > 0; };
    const evDraw = () => {
        evBox.innerHTML = `<h4 class="pm-app-title">${esc(t('home.incEvidence'))} <span class="pm-app-req" aria-hidden="true">*</span>${draft.photos.length ? ` · ${esc(evidenceText(draft.photos.length))}` : ''}</h4><p class="pm-app-note">${esc(t('home.incEvidenceHint'))}</p>`;
        if (draft.photos.length) {
            const grid = document.createElement('div');
            grid.className = 'inc-app-shots';
            draft.photos.forEach((p) => {
                const cell = document.createElement('div');
                cell.className = 'inc-app-shot';
                cell.innerHTML = `<img alt="" src="${esc(p.thumb)}">`;
                const rm = document.createElement('button');
                rm.type = 'button';
                rm.className = 'inc-app-shot-rm';
                rm.setAttribute('aria-label', t('home.incRemove'));
                rm.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
                rm.addEventListener('click', () => { draft.photos = draft.photos.filter((x) => x.key !== p.key); evDraw(); });
                cell.appendChild(rm);
                grid.appendChild(cell);
            });
            evBox.appendChild(grid);
        }
        if (draft.preparing) { const w = document.createElement('p'); w.className = 'pm-app-note'; w.textContent = t('home.incPreparing'); evBox.appendChild(w); }
        const add = document.createElement('label');
        add.className = 'home-carga-secondary-btn inc-app-add';
        add.innerHTML = `<i class="bx bx-camera" aria-hidden="true"></i> <span>${esc(draft.photos.length ? t('home.incAddMore') : t('home.incAddPhoto'))}</span><input type="file" accept="image/*" multiple>`;
        add.querySelector('input').addEventListener('change', async (event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = ''; // así se puede volver a elegir la misma foto
            if (!files.length) return;
            draft.preparing += files.length;
            evDraw();
            for (const file of files) {
                try { draft.photos.push({ key: newPhotoKey(), ...(await preparePhoto(file)) }); } catch { showToast(t('home.incErrPhoto')); }
                draft.preparing -= 1;
                evDraw();
            }
        });
        evBox.appendChild(add);
        sendDraw();
    };
    evDraw();

    sendBtn.addEventListener('click', () => {
        const problem = draftProblem();
        if (problem) { showToast(problem.text); if (problem.focus) bodyEl.querySelector(problem.focus)?.focus(); return; }
        sendDraft(sendBtn);
    });
    bodyEl.appendChild(sendBtn);
}
// Lo que falta para poder enviar (el mismo orden de la pantalla).
function draftProblem() {
    if (draft.costCenterId === null) return { text: t('home.incCenterPick') };
    if (!draft.name.replace(/\s+/g, ' ').trim()) return { text: t('home.incNeedName'), focus: '#inc-app-who' };
    const zones = zonesOf(draft.costCenterId);
    if (zones.length && !draft.zoneId) return { text: t('home.incNeedZone') };
    if (!zones.length && !draft.detail.trim()) return { text: t('home.incNeedPlace'), focus: '#inc-app-detail' };
    if (!draft.category) return { text: t('home.incNeedCategory') };
    if (!draft.criterionId) return { text: t('home.incNeedCriterion') };
    if (!draft.description.trim()) return { text: t('home.incNeedStory'), focus: '#inc-app-story' };
    if (!draft.photos.length) return { text: t('home.incNeedPhoto') };
    return null;
}
// Las fotos se reparten en tandas (por cantidad y por peso) para que cada petición quepa; la primera crea el reporte y las demás se mandan por la cola, a la clave del reporte.
function makeBatches(list) {
    const limit = options.batch || 10;
    const out = [];
    let cur = [];
    let bytes = 0;
    list.forEach((p) => {
        const size = p.bytes * 1.37 + 14000; // base64 + miniatura
        if (cur.length && (cur.length >= limit || bytes + size > BATCH_MAX_BYTES)) { out.push(cur); cur = []; bytes = 0; }
        cur.push(p); bytes += size;
    });
    if (cur.length) out.push(cur);
    return out;
}
const payloadOf = (list) => list.map((p) => ({ key: p.key, photo: p.photo, thumb: p.thumb }));
const SERVER_ERRORS = { NAME: 'home.incNeedName', ZONE: 'home.incNeedZone', PLACE: 'home.incNeedPlace', CRITERION: 'home.incNeedCriterion', DESC: 'home.incNeedStory', PHOTO: 'home.incErrPhoto', CENTER: 'home.incCenterPick' };

async function sendDraft(sendBtn) {
    if (!draft) return;
    const name = draft.name.replace(/\s+/g, ' ').trim().slice(0, 60);
    const batches = makeBatches(draft.photos);
    const first = batches.shift();
    const ref = draft.clientRef;
    const body = { costCenterId: draft.costCenterId, name, zoneId: draft.zoneId, placeDetail: draft.detail.trim(), criterionId: draft.criterionId, description: draft.description.trim(), photos: payloadOf(first), clientAt: new Date().toISOString(), clientRef: ref };
    const cc = costCenters.find((c) => c.id === draft.costCenterId);
    const description = `${t('menu.opCentroDistIncidentes')} · ${cc ? cc.name : ''} · ${(options.criteria.find((c) => c.id === draft.criterionId) || {}).name || ''}`;
    if (sendBtn) sendBtn.disabled = true;
    try {
        // rejectable: si ya con señal el servidor lo rechaza (un criterio dejó de existir) se anota en "No se aplicó" en vez de trabar la cola
        const result = await sync().offlineAwareFetch(
            `${API}/reports`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) },
            description, `${RECORD_PREFIX}-new:${ref}`, null, { rejectable: true },
        );
        if (!result.queued && !result.ok) {
            showToast(SERVER_ERRORS[result.body.code] ? t(SERVER_ERRORS[result.body.code]) : (result.body.message || t('home.incErrSend')));
            if (sendBtn) sendBtn.disabled = false;
            return;
        }
        try { localStorage.setItem(NAME_KEY, name); } catch { /* sin almacenamiento */ }
        // las demás evidencias SIEMPRE por la cola (en orden, después del reporte): así llegan aunque se cierre la pantalla o se corte la señal
        for (const batch of batches) {
            await sync().queueRequest({ url: `${API}/reports/${ref}/photos`, method: 'POST', body: JSON.stringify({ photos: payloadOf(batch) }), description: `${description} · ${t('home.incEvidence')}`, recordKey: `${RECORD_PREFIX}-photos:${ref}`, rejectable: true });
        }
        const crit = options.criteria.find((c) => c.id === draft.criterionId) || {};
        const zone = zonesOf(draft.costCenterId).find((z) => z.id === draft.zoneId);
        doneInfo = {
            ref, queued: !!result.queued, folio: result.queued ? '' : (result.body.folio || ''), name, at: result.queued ? body.clientAt : (result.body.createdAt || body.clientAt), centroCostos: cc ? cc.name : '',
            category: crit.kind || '', criterion: crit.name || '', zone: zone ? zoneText(zone) : '', total: draft.photos.length,
        };
        if (!result.queued) await loadIncidents();
        draft = null;
        await refreshQueued();
        view = 'done';
        render();
        if (batches.length) sync().flushOfflineQueue();
    } catch {
        showToast(t('home.incErrSend'));
        if (sendBtn) sendBtn.disabled = false;
    }
}

// El número de reporte y lo que se mandó; las evidencias que siguen en la cola se cuentan hasta que se vacía.
let doneInfo = null;
function drawDoneProgress(queue) {
    const line = document.getElementById('inc-app-done-progress');
    if (!line || !doneInfo) return;
    const pending = pendingPhotos(queue, doneInfo.ref);
    if (doneInfo.queued) line.textContent = t('home.incEvidenceOnPhone');
    else if (pending > 0) line.textContent = t('home.incUploading', { n: pending });
    else line.textContent = t('home.incUploaded', { n: doneInfo.total });
}
async function renderDone() {
    const d = doneInfo;
    if (!d) { view = 'list'; render(); return; }
    titleEl.textContent = t(d.queued ? 'home.incSavedTitle' : 'home.incSentTitle');
    const box = document.createElement('div');
    box.className = 'pm-app-card pm-app-done';
    box.innerHTML = `<div class="pm-app-tick" aria-hidden="true"><i class="bx ${d.queued ? 'bx-cloud-upload' : 'bx-check'}"></i></div>
        <span class="pm-app-lbl">${esc(t('home.incNumber'))}</span>
        <div class="pm-app-folio">${esc(d.folio || t('home.incNoNumberYet'))}</div>
        ${d.queued ? `<p class="pm-app-note">${esc(t('home.incNumberOnSync'))}</p>` : ''}
        <div class="inc-app-done-kind">${kindPill(d.category)}</div>
        <div class="pm-app-meta pm-app-meta-flat">${[[t('home.incReportedBy'), d.name], [t('home.incWhen'), formatTime(d.at)], [t('home.incPlaceLabel'), d.zone], [t('home.incCriterion'), d.criterion], [t('home.incCenter'), d.centroCostos]].filter(([, v]) => v).map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
        <p class="pm-app-note" id="inc-app-done-progress" role="status"></p>`;
    bodyEl.appendChild(box);
    drawDoneProgress(await readQueue());
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'home-carga-new-btn';
    again.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${esc(t('home.incAnother'))}</span>`;
    again.addEventListener('click', startNewReport);
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'home-carga-secondary-btn';
    back.textContent = t('home.incBackToList');
    back.addEventListener('click', () => { doneInfo = null; view = 'list'; render(); });
    bodyEl.append(again, back);
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') { window.location.href = 'AppInicio.html'; return; }
    if (view === 'new' && draft && (draft.photos.length || draft.description.trim()) && !window.confirm(t('home.incDiscard'))) return;
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
        await loadIncidents();
        await refreshQueued();
        render();
    } catch (err) {
        console.error('Incidentes (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
