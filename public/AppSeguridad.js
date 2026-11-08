// ---------------------------------------------------------------------------
// Seguridad (App) — la misma pantalla de la Web (Operaciones > Seguridad) hecha para el celular:
//   · Elementos: los extintores, hidrantes, puertas de emergencia… que se dibujaron en el paso «Seguridad» del Layout de cada centro de costos, cada uno con su última revisión (Bien / Con falla / Nunca);
//   · Revisiones: la lista de revisiones hechas (las de este celular que todavía no se envían salen primero, como «En tu celular»);
//   · Nueva revisión (un toque en el elemento): quién revisa, Bien o Con falla, una nota opcional y la foto (obligatoria, una sola; se reduce en el celular). Los elementos se guardan en el celular,
//     así que la revisión se hace SIN señal: queda en la cola de AppOfflineSync.js ("En tu celular") y se envía sola al reconectar con la hora a la que se hizo (el servidor guarda aparte la hora en que la recibió).
// Es la misma revisión que se hace al escanear el QR del elemento (en la Web aparece con origen «App»). Eliminar una revisión se sigue haciendo en la Web.
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
const API = '/api/business/seguridad';
const CHECKS_API = '/api/business/safety-checks';
const RECORD_PREFIX = 'seguridad';
const PHOTO_MAX_BYTES = 420 * 1024;           // el servidor acepta hasta ~450 KB por foto
const RESULTS = ['ok', 'fail'];
let currentUser = null;
let isClientAdmin = false;
let effectiveGrants = [];
let costCenters = [];
let checks = [];              // revisiones del servidor (la más nueva primero)
let queuedChecks = [];        // revisiones que se mandaron sin señal y siguen en la cola de este celular
let options = { elementsByCenter: {}, lastByCenter: {}, noteMax: 300 };
let optionsState = 'loading'; // 'loading' | 'online' | 'cached' | 'none'
let view = 'list';            // 'list' | 'detail' | 'new' | 'done'
let tab = 'elements';         // 'elements' | 'checks'
let search = '';
let openKey = null;           // la revisión abierta: 'c:<id>' o 'q:<clientRef>'
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
// El tipo de un elemento (Extintor, Hidrante…); un tipo que la pantalla no conoce se muestra tal cual.
function typeLabel(type) {
    const key = `main.layoutType_safety_${type}`;
    const label = t(key);
    return label && label !== key ? label : (type || '');
}
const elementText = (code, type) => `${code || ''}${code ? ' · ' : ''}${typeLabel(type)}`;
const centerOf = (ccId) => costCenters.find((c) => c.id === Number(ccId));
const centerText = (cc) => (cc ? `${cc.code ? `${cc.code} · ` : ''}${cc.name}` : '');
const resultLabel = (r) => (r === 'fail' ? t('main.sgResultadoFalla') : t('main.sgResultadoBien'));
const resultPill = (r) => `<span class="pm-app-pill ${r === 'fail' ? 'seg-app-res-fail' : 'seg-app-res-ok'}">${esc(resultLabel(r))}</span>`;
const elementsOf = (ccId) => (options.elementsByCenter && options.elementsByCenter[ccId]) || [];

// --- Opciones (los elementos de Seguridad del Layout de cada centro y la última revisión de cada uno): se bajan al abrir y se guardan en el celular para revisar sin señal ---------------
function cacheDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('sgn-seg-cache', 1);
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
            options = { elementsByCenter: body.elementsByCenter || {}, lastByCenter: body.lastByCenter || {}, noteMax: body.noteMax || 300 };
            optionsState = 'online';
            cacheSave({ clientId, options, at: body.at }).catch(() => { /* sin almacenamiento: se bajan otra vez la próxima */ });
            return;
        }
    } catch { /* sin señal: se usan las guardadas */ }
    try {
        const saved = await cacheRead();
        // lo guardado solo sirve si es de la misma empresa (otra cuenta en el mismo celular no ve elementos ajenos)
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
async function loadChecks() {
    try {
        const res = await fetch(apiUrl(`${CHECKS_API}?lite=1`), { credentials: 'include' });
        if (!res.ok) return;
        const body = await res.json();
        checks = body.checks || [];
    } catch { /* sin señal: se queda con lo que ya se veía */ }
}
function checkVisible(r) {
    if (r.queued) return true;
    if (!hasCostCenterPermission(r.cc) && r.cc) return false;
    const sel = selectedCostCenterIds();
    return !sel || !r.cc || sel.has(Number(r.cc));
}
// Los centros que se ven: los que la cuenta puede usar y los marcados en la App.
function visibleCenters() {
    const sel = selectedCostCenterIds();
    return costCenters.filter((c) => !sel || sel.has(c.id));
}

// --- Lo que se mandó sin señal y sigue en la cola: las revisiones nuevas se ven como "En tu celular" ---------------------------------------------------------
const CREATE_URL = /\/api\/business\/seguridad\/checks$/;
async function readQueue() {
    try { return await sync().listOfflineQueue(); } catch { return []; }
}
const parseBody = (item) => { try { return JSON.parse(item.body || '{}'); } catch { return null; } };
let queueMineCount = 0;
async function refreshQueued() {
    const queue = await readQueue();
    queuedChecks = [];
    queueMineCount = queue.filter((item) => item.method === 'POST' && item.url && CREATE_URL.test(item.url)).length;
    queue.forEach((item) => {
        if (item.method !== 'POST' || !item.url || !CREATE_URL.test(item.url)) return;
        const body = parseBody(item);
        if (!body) return;
        const el = elementsOf(body.costCenterId).find((e) => e.id === body.elementId) || {};
        const cc = centerOf(body.costCenterId);
        queuedChecks.push({
            key: `q:${body.clientRef || item.id}`, queued: true, ref: body.clientRef, cc: body.costCenterId, centroCostos: cc ? cc.name : '', elementId: body.elementId, elementCode: el.code || '', elementType: el.type || '', elementName: el.name || '',
            zoneName: el.zoneName || '', name: body.name || userLabel(), result: body.result, note: body.note || '', checkedAt: body.clientAt || item.queuedAt, source: 'app', photo: body.photo, thumb: body.thumb || body.photo,
        });
    });
    queuedChecks.reverse();
}
// AppOfflineSync avisa cada 30 s aunque nada haya cambiado: solo se vuelve a dibujar si cambió lo que esta pantalla tenía en la cola, y nunca en "Nueva revisión" (se perdería lo que se está escribiendo).
document.addEventListener('sgn:offline-queue-changed', async () => {
    const before = queueMineCount;
    await refreshQueued();
    if (before === queueMineCount) return;
    // al reconectar la cola se vacía: se vuelve a pedir la lista y los elementos para ver las revisiones ya con su número
    if (queueMineCount === 0 && navigator.onLine) await Promise.all([loadChecks(), loadOptions()]);
    if (view === 'list' || view === 'detail') render();
});
document.addEventListener('sgn:offline-rejected', () => { if (view === 'list') render(); });

const allChecks = () => [...queuedChecks, ...checks].filter(checkVisible);
// La última revisión de un elemento: la que sigue en la cola de este celular, la más nueva de la lista del servidor o, si no está ahí, la que bajaron las opciones.
function lastOf(ccId, elementId) {
    const queued = queuedChecks.find((q) => Number(q.cc) === Number(ccId) && q.elementId === elementId);
    if (queued) return { result: queued.result, at: queued.checkedAt, queued: true };
    const rec = checks.find((r) => Number(r.cc) === Number(ccId) && r.elementId === elementId);
    if (rec) return { result: rec.result, at: rec.checkedAt };
    const last = options.lastByCenter && options.lastByCenter[ccId] && options.lastByCenter[ccId][elementId];
    return last ? { result: last.result, at: last.at } : null;
}

// --- Fotos: se piden con la sesión y se muestran como imagen local (en la App instalada la dirección del servidor es de otro origen). Se entregan como data: (la política de seguridad del servidor solo deja
// cargar imágenes propias y data:, no blob:); las miniaturas se guardan mientras la pantalla está abierta y las fotos completas no.
const photoCache = new Map();
const blobToDataUrl = (blob) => new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob); });
async function photoUrl(checkId, thumb) {
    const url = `${CHECKS_API}/${checkId}/photo${thumb ? '?thumb=1' : ''}`;
    if (photoCache.has(url)) return photoCache.get(url);
    const res = await fetch(apiUrl(url), { credentials: 'include' });
    if (!res.ok) throw new Error('photo');
    const dataUrl = await blobToDataUrl(await res.blob());
    if (thumb) photoCache.set(url, dataUrl);
    return dataUrl;
}
function fillImage(img, checkId, thumb) {
    photoUrl(checkId, thumb).then((src) => { img.src = src; }).catch(() => { img.alt = '—'; });
}

// --- Pantalla --------------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
document.getElementById('carga-progress-track').hidden = true;
document.getElementById('carga-progress-label').hidden = true;

function render() {
    bodyEl.innerHTML = '';
    if (siteBlocked) { window.AppSiteGate.show(bodyEl, t); titleEl.textContent = t('menu.opCentroDistSeguridad'); return; }
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

function renderList() {
    titleEl.textContent = t('menu.opCentroDistSeguridad');
    renderRejectedBanner();
    const tabs = document.createElement('div');
    tabs.className = 'seg-app-tabs';
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('data-help-key', 'appSegTabs');
    [['elements', t('home.segTabElements')], ['checks', t('home.segTabChecks')]].forEach(([key, label]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'seg-app-tab';
        btn.setAttribute('aria-pressed', String(tab === key));
        btn.textContent = label;
        btn.addEventListener('click', () => { tab = key; render(); });
        tabs.appendChild(btn);
    });
    bodyEl.appendChild(tabs);
    if (tab === 'checks') renderChecks(); else renderElements();
}

// Los elementos de Seguridad de los centros que se ven, con su última revisión; un toque abre «Nueva revisión» de ese elemento.
function renderElements() {
    if (optionsState === 'none') { const p = document.createElement('p'); p.className = 'home-carga-empty-note'; p.textContent = t('home.segOptionsNone'); bodyEl.appendChild(p); return; }
    if (optionsState === 'cached') { const p = document.createElement('p'); p.className = 'pm-app-note'; p.textContent = t('home.segOptionsCached'); bodyEl.appendChild(p); }
    const centers = visibleCenters();
    if (!centers.length) { const p = document.createElement('p'); p.className = 'home-carga-empty-note'; p.textContent = t('home.segNoCenters'); bodyEl.appendChild(p); return; }
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'pm-app-input seg-app-search';
    input.placeholder = t('home.segSearchPlaceholder');
    input.setAttribute('aria-label', t('home.segSearchPlaceholder'));
    input.value = search;
    bodyEl.appendChild(input);
    const listEl = document.createElement('div');
    bodyEl.appendChild(listEl);
    const draw = () => {
        listEl.innerHTML = '';
        const needle = search.trim().toLowerCase();
        const rows = [];
        centers.forEach((cc) => elementsOf(cc.id).forEach((el) => {
            const hay = `${el.code} ${typeLabel(el.type)} ${el.name} ${el.zoneName} ${el.locator} ${centerText(cc)}`.toLowerCase();
            if (!needle || hay.includes(needle)) rows.push({ cc, el });
        }));
        if (!rows.length) { const p = document.createElement('p'); p.className = 'home-carga-empty-note'; p.textContent = t(needle ? 'home.segNoMatch' : 'home.segElementsEmpty'); listEl.appendChild(p); return; }
        rows.forEach(({ cc, el }) => {
            const last = lastOf(cc.id, el.id);
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'home-carga-active-row';
            const sub = [el.name, el.zoneName, centers.length > 1 ? cc.name : ''].filter(Boolean).join(' · ');
            row.innerHTML = `
                <span class="home-carga-active-row-icon"><i class="bx bx-shield-quarter" aria-hidden="true"></i></span>
                <span class="home-carga-active-row-label"><p>${esc(elementText(el.code, el.type))}</p><span>${esc(sub || el.locator || '')}</span></span>
                <span class="seg-app-last">${last ? resultPill(last.result) : `<span class="pm-app-pill pm-app-pill-queued">${esc(t('home.segNever'))}</span>`}${last ? `<small>${esc(last.queued ? t('home.incOnPhone') : formatTime(last.at))}</small>` : ''}</span>`;
            row.addEventListener('click', () => startCheck(cc.id, el));
            listEl.appendChild(row);
        });
    };
    input.addEventListener('input', () => { search = input.value; draw(); });
    draw();
}

// Las revisiones (las de este celular que siguen en la cola, primero, y después las del servidor).
function renderChecks() {
    const list = allChecks();
    if (!list.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('home.segChecksEmpty');
        bodyEl.appendChild(empty);
        return;
    }
    list.forEach((r) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        const key = r.queued ? `q:${r.ref}` : `c:${r.id}`;
        const sub = [r.name, formatTime(r.checkedAt)].filter(Boolean).join(' · ');
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx ${r.queued ? 'bx-cloud-upload' : 'bx-shield-quarter'}" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label"><p>${esc(elementText(r.elementCode, r.elementType))}${r.elementName ? ` · ${esc(r.elementName)}` : ''}</p><span>${esc(sub)}</span></span>
            <span class="inc-app-pills">${resultPill(r.result)}${r.queued ? `<span class="pm-app-pill pm-app-pill-queued">${esc(t('home.incOnPhone'))}</span>` : ''}</span>`;
        row.addEventListener('click', () => { openKey = key; view = 'detail'; render(); });
        bodyEl.appendChild(row);
    });
}

// --- Detalle de una revisión ---------------------------------------------------------------------------------------------------------------
function renderDetail() {
    const r = allChecks().find((x) => (x.queued ? `q:${x.ref}` : `c:${x.id}`) === openKey);
    if (!r) { view = 'list'; render(); return; }
    titleEl.textContent = r.queued ? t('home.incOnPhone') : `SEG-${r.id}`;
    const meta = document.createElement('div');
    meta.className = 'pm-app-meta';
    const rows = [
        [t('main.colSgElemento'), elementText(r.elementCode, r.elementType) + (r.elementName ? ` · ${r.elementName}` : '')],
        [t('main.colSgZona'), r.zoneName || '—'],
        [t('home.incCenter'), r.centroCostos || '—'],
        [t('main.colSgQuien'), r.name || '—'],
        [t('main.colSgMomento'), formatTime(r.checkedAt)],
        r.receivedAt ? [t('main.pmRecibido'), formatTime(r.receivedAt)] : null,
        [t('main.colSgOrigen'), r.source === 'app' ? t('main.sgOrigenApp') : t('main.sgOrigenQr')],
    ].filter(Boolean);
    meta.innerHTML = rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    bodyEl.appendChild(meta);

    const resultRow = document.createElement('div');
    resultRow.className = 'pm-app-line';
    resultRow.innerHTML = `<div class="pm-app-line-main"><p>${esc(t('main.colSgResultado'))}</p></div>${r.queued ? `<span class="pm-app-pill pm-app-pill-queued">${esc(t('home.incOnPhone'))}</span> ` : ''}${resultPill(r.result)}`;
    bodyEl.appendChild(resultRow);

    const note = document.createElement('div');
    note.className = 'pm-app-card';
    note.innerHTML = `<h4 class="pm-app-title">${esc(t('main.colSgNota'))}</h4><p class="inc-app-desc">${esc(r.note || '—')}</p>`;
    bodyEl.appendChild(note);

    const hasPhoto = r.queued ? !!r.photo : r.hasPhoto;
    const ev = document.createElement('div');
    ev.className = 'pm-app-card';
    ev.innerHTML = `<h4 class="pm-app-title">${esc(t('main.colSgFoto'))}</h4>`;
    if (hasPhoto) {
        const grid = document.createElement('div');
        grid.className = 'inc-app-shots';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inc-app-shot';
        btn.setAttribute('aria-label', t('main.sgFotoVer'));
        const img = document.createElement('img');
        img.alt = '';
        if (r.queued) img.src = r.thumb; else fillImage(img, r.id, true);
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
    scrim.innerHTML = `<div class="inc-app-viewer-bar"><span>${esc(`${r.elementCode || ''} · ${resultLabel(r.result)}`)}</span><button type="button" id="seg-app-vclose" aria-label="${esc(t('main.incFotoCerrar'))}"><i class="bx bx-x" aria-hidden="true"></i></button></div>
        <div class="inc-app-viewer-stage"><img id="seg-app-vimg" alt=""></div>`;
    document.body.appendChild(scrim);
    const img = scrim.querySelector('#seg-app-vimg');
    scrim.querySelector('#seg-app-vclose').addEventListener('click', () => scrim.remove());
    if (r.queued) img.src = r.photo; else fillImage(img, r.id, false);
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

// --- Foto de la revisión: se reduce en el celular (máx. 1280 px de lado, JPEG) para que suba rápido aunque la cámara sea de 12 megapíxeles --------------------------
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

// --- Nueva revisión ----------------------------------------------------------------------------------------------------------------------
// draft: { costCenterId, element, name, result, note, photo: { photo, thumb, bytes } | null, preparing, clientRef }
let draft = null;
const NAME_KEY = 'sgn_seg_name';
function newRef() {
    const bytes = new Uint8Array(12);
    (window.crypto || {}).getRandomValues?.(bytes);
    const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') || Math.random().toString(16).slice(2).padEnd(24, '0');
    return `app-${Date.now().toString(36)}-${rand}`;
}
function startCheck(costCenterId, element) {
    // «Quién revisa» siempre se pide: viene escrito con el último nombre usado (o el de la cuenta) y se puede cambiar
    let name = '';
    try { name = localStorage.getItem(NAME_KEY) || ''; } catch { /* sin almacenamiento */ }
    draft = { costCenterId, element, name: name || userLabel(), result: '', note: '', photo: null, preparing: 0, clientRef: newRef() };
    view = 'new';
    render();
}

function renderNew() {
    titleEl.textContent = t('home.segCheckTitle');
    const el = draft.element;
    const cc = centerOf(draft.costCenterId);
    // el elemento que se revisa
    const head = document.createElement('div');
    head.className = 'pm-app-card seg-app-head';
    head.setAttribute('data-help-key', 'appSegElemento');
    head.innerHTML = `<h4 class="pm-app-title">${esc(elementText(el.code, el.type))}</h4><p class="pm-app-note">${esc([el.name, el.zoneName, cc ? centerText(cc) : ''].filter(Boolean).join(' · '))}</p>`;
    bodyEl.appendChild(head);
    if (optionsState === 'cached') { const p = document.createElement('p'); p.className = 'pm-app-note'; p.textContent = t('home.segOptionsCached'); bodyEl.appendChild(p); }

    // quién revisa (siempre se pide el nombre)
    const whoBox = document.createElement('div');
    whoBox.className = 'pm-app-card';
    whoBox.innerHTML = `<label class="pm-app-qty-label pm-app-who-label" for="seg-app-who">${esc(t('home.segWho'))} <span class="pm-app-req" aria-hidden="true">*</span></label><input id="seg-app-who" class="pm-app-input" type="text" maxlength="60" autocomplete="name" required placeholder="${esc(t('home.segWhoPlaceholder'))}" value="${esc(draft.name)}">`;
    bodyEl.appendChild(whoBox);
    whoBox.querySelector('#seg-app-who').addEventListener('input', (event) => { draft.name = event.target.value; });

    // el resultado: Bien o Con falla
    const resBox = document.createElement('div');
    resBox.className = 'pm-app-card';
    resBox.setAttribute('data-help-key', 'appSegResultado');
    resBox.innerHTML = `<h4 class="pm-app-title">${esc(t('main.colSgResultado'))} <span class="pm-app-req" aria-hidden="true">*</span></h4>`;
    const resRow = document.createElement('div');
    resRow.className = 'seg-app-result';
    const resDraw = () => {
        resRow.innerHTML = '';
        RESULTS.forEach((r) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `seg-app-resbtn ${r}`;
            btn.setAttribute('aria-pressed', String(draft.result === r));
            btn.innerHTML = `<i class="bx ${r === 'ok' ? 'bx-check-circle' : 'bx-error'}" aria-hidden="true"></i><span>${esc(resultLabel(r))}</span>`;
            btn.addEventListener('click', () => { draft.result = r; resDraw(); });
            resRow.appendChild(btn);
        });
    };
    resDraw();
    resBox.appendChild(resRow);
    bodyEl.appendChild(resBox);

    // la nota (opcional)
    const noteBox = document.createElement('div');
    noteBox.className = 'pm-app-card';
    noteBox.innerHTML = `<label class="pm-app-qty-label pm-app-who-label" for="seg-app-note">${esc(t('home.segNote'))}</label><textarea id="seg-app-note" class="pm-app-input inc-app-textarea seg-app-note-area" rows="3" maxlength="${esc(options.noteMax || 300)}" placeholder="${esc(t('home.segNotePlaceholder'))}">${esc(draft.note)}</textarea>`;
    bodyEl.appendChild(noteBox);
    noteBox.querySelector('textarea').addEventListener('input', (event) => { draft.note = event.target.value; });

    // la foto (obligatoria, una sola)
    const photoBox = document.createElement('div');
    photoBox.className = 'pm-app-card';
    photoBox.setAttribute('data-help-key', 'appSegFoto');
    bodyEl.appendChild(photoBox);
    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.className = 'home-carga-new-btn pm-app-send';
    sendBtn.innerHTML = `<i class="bx bx-send" aria-hidden="true"></i><span>${esc(t('home.segSend'))}</span>`;
    const photoDraw = () => {
        photoBox.innerHTML = `<h4 class="pm-app-title">${esc(t('home.segPhoto'))} <span class="pm-app-req" aria-hidden="true">*</span></h4><p class="pm-app-note">${esc(t('home.segPhotoHint'))}</p>`;
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
        if (draft.preparing) { const w = document.createElement('p'); w.className = 'pm-app-note'; w.textContent = t('home.segPreparing'); photoBox.appendChild(w); }
        const add = document.createElement('label');
        add.className = 'home-carga-secondary-btn inc-app-add';
        add.innerHTML = `<i class="bx bx-camera" aria-hidden="true"></i> <span>${esc(draft.photo ? t('home.segChangePhoto') : t('home.segAddPhoto'))}</span><input type="file" accept="image/*" capture="environment">`;
        add.querySelector('input').addEventListener('change', async (event) => {
            const file = (event.target.files || [])[0];
            event.target.value = ''; // así se puede volver a elegir la misma foto
            if (!file) return;
            draft.preparing += 1;
            photoDraw();
            try { draft.photo = await preparePhoto(file); } catch { showToast(t('home.segErrPhoto')); }
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
// Lo que falta para poder enviar (el mismo orden de la pantalla).
function draftProblem() {
    if (!draft.name.replace(/\s+/g, ' ').trim()) return { text: t('home.segNeedName'), focus: '#seg-app-who' };
    if (!draft.result) return { text: t('home.segNeedResult') };
    if (!draft.photo) return { text: t('home.segNeedPhoto') };
    return null;
}
const SERVER_ERRORS = { NAME: 'home.segNeedName', RESULT: 'home.segNeedResult', PHOTO: 'home.segErrPhoto', ELEMENT: 'home.segElementGone', CENTER: 'home.segNoCenters' };

async function sendDraft(sendBtn) {
    if (!draft) return;
    const name = draft.name.replace(/\s+/g, ' ').trim().slice(0, 60);
    const ref = draft.clientRef;
    const el = draft.element;
    const body = { costCenterId: draft.costCenterId, elementId: el.id, name, result: draft.result, note: draft.note.trim(), photo: draft.photo.photo, thumb: draft.photo.thumb, clientAt: new Date().toISOString(), clientRef: ref };
    const cc = centerOf(draft.costCenterId);
    const description = `${t('menu.opCentroDistSeguridad')} · ${cc ? cc.name : ''} · ${el.code || ''}`;
    if (sendBtn) sendBtn.disabled = true;
    try {
        // rejectable: si ya con señal el servidor la rechaza (el elemento dejó de existir) se anota en "No se aplicó" en vez de trabar la cola
        const result = await sync().offlineAwareFetch(
            `${API}/checks`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) },
            description, `${RECORD_PREFIX}-new:${ref}`, null, { rejectable: true },
        );
        if (!result.queued && !result.ok) {
            showToast(SERVER_ERRORS[result.body.code] ? t(SERVER_ERRORS[result.body.code]) : (result.body.message || t('home.segErrSend')));
            if (sendBtn) sendBtn.disabled = false;
            return;
        }
        try { localStorage.setItem(NAME_KEY, name); } catch { /* sin almacenamiento */ }
        doneInfo = { queued: !!result.queued, id: result.queued ? null : (result.body.record && result.body.record.id), name, at: result.queued ? body.clientAt : ((result.body.record && result.body.record.checkedAt) || body.clientAt), result: draft.result, element: elementText(el.code, el.type), zone: el.zoneName, centroCostos: cc ? cc.name : '' };
        if (!result.queued) await Promise.all([loadChecks(), loadOptions()]);
        draft = null;
        await refreshQueued();
        view = 'done';
        render();
    } catch {
        showToast(t('home.segErrSend'));
        if (sendBtn) sendBtn.disabled = false;
    }
}

// Lo que se mandó: el número de la revisión (o «en tu celular» si no hubo señal).
let doneInfo = null;
function renderDone() {
    const d = doneInfo;
    if (!d) { view = 'list'; render(); return; }
    titleEl.textContent = t(d.queued ? 'home.segSavedTitle' : 'home.segSentTitle');
    const box = document.createElement('div');
    box.className = 'pm-app-card pm-app-done';
    box.innerHTML = `<div class="pm-app-tick" aria-hidden="true"><i class="bx ${d.queued ? 'bx-cloud-upload' : 'bx-check'}"></i></div>
        <span class="pm-app-lbl">${esc(t('home.segNumber'))}</span>
        <div class="pm-app-folio">${esc(d.id ? `SEG-${d.id}` : t('home.segNoNumberYet'))}</div>
        ${d.queued ? `<p class="pm-app-note">${esc(t('home.segNumberOnSync'))}</p>` : ''}
        <div class="inc-app-done-kind">${resultPill(d.result)}</div>
        <div class="pm-app-meta pm-app-meta-flat">${[[t('main.colSgElemento'), d.element], [t('main.colSgQuien'), d.name], [t('main.colSgMomento'), formatTime(d.at)], [t('main.colSgZona'), d.zone], [t('home.incCenter'), d.centroCostos]].filter(([, v]) => v).map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
    bodyEl.appendChild(box);
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'home-carga-new-btn';
    again.innerHTML = `<i class="bx bx-shield-quarter" aria-hidden="true"></i><span>${esc(t('home.segAnother'))}</span>`;
    again.addEventListener('click', () => { doneInfo = null; tab = 'elements'; view = 'list'; render(); });
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'home-carga-secondary-btn';
    back.textContent = t('home.segBackToList');
    back.addEventListener('click', () => { doneInfo = null; tab = 'checks'; view = 'list'; render(); });
    bodyEl.append(again, back);
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') { window.location.href = 'AppInicio.html'; return; }
    if (view === 'new' && draft && (draft.photo || draft.note.trim()) && !window.confirm(t('home.segDiscard'))) return;
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
        await loadChecks();
        await refreshQueued();
        render();
    } catch (err) {
        console.error('Seguridad (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
