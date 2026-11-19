// ---------------------------------------------------------------------------
// Calibraciones (App) — la misma pantalla de la Web (Operaciones > C. Distribución > Calibraciones) hecha para el celular:
//   · Lista: un certificado de calibración por tarjeta (el activo con su código, número de serie y modelo; el estado —Vigente, Por vencer, Vencida, Fuera de tolerancia o Historial—, el certificado, el laboratorio,
//     las fechas de calibración y de vencimiento y el resultado), con buscador (la sintaxis de siempre: $ antes, @ después, la coma separa) y el vínculo «N certificados» que deja ver solo los de ese activo;
//   · Detalle de un certificado: todos sus datos, el archivo (foto o PDF) y, si la cuenta puede, corregir los datos (se manda solo lo que cambió; los avisos «pendiente de autorización» y «sin permiso» son los de la Web);
//   · «+ Nueva calibración»: el activo (de los que llevan calibración), el certificado, el laboratorio, las fechas (el vencimiento se propone con la vigencia del modelo), el resultado, las observaciones y el archivo.
// Trabaja SIN señal: la última lista se guarda en el celular (por empresa) y lo que se guarde sin señal —un certificado nuevo o un cambio— queda en la cola de AppOfflineSync.js («En tu celular») y se envía solo al
// volver la conexión. Subir o cambiar el archivo del certificado es lo único que necesita señal (un archivo no se puede dejar en la cola). El estado de cada certificado se calcula aquí con el día de quien mira.
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
const API = '/api/business/calibrations';
const RECORD_PREFIX = 'calibraciones';
// La ruta de esta pantalla en el árbol de permisos (la misma de TABLE_GRANT_PATHS['calibraciones'] en db.js; se mantiene a mano igual que en Dashboard.js).
const GRANT_PATH = { sectionId: 'supply-chain', itemId: 'sc-area-distribution-center', submenuPrefix: 'cat-operaciones/cat-operaciones-centro-dist-calibraciones' };
// Cada dato que se corrige con un PATCH y la columna del árbol que lo gobierna (las mismas de la pantalla Web).
const FIELD_COLUMNS = { certificateNumber: 'colCalCertificado', laboratory: 'colCalLaboratorio', calibratedOn: 'colCalCalibrado', dueOn: 'colCalVence', result: 'colCalResultado', notes: 'colCalObservaciones' };
const SYSTEM_KEYS = ['colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos', 'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto', 'colSysAnio', 'colSysSemana', 'colSysHora'];
const MAX_FILE_BYTES = 3 * 1024 * 1024;       // el servidor acepta hasta 3 MB por certificado
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const FILE_ACCEPT = 'application/pdf,image/jpeg,image/png';
const MAX_ROWS = 60;                          // los certificados que se dibujan a la vez: el buscador trae el resto
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
let currentUser = null;
let isClientAdmin = false;
let effectiveGrants = [];
let costCenters = [];
let records = [];             // certificados del servidor (el más reciente primero)
let pickAssets = [];          // los activos que llevan calibración (para elegir al crear)
let laboratories = [];        // los laboratorios que ya se usaron
let resultOptions = ['ok', 'adjusted', 'out'];
let canCreate = false;
let canReplaceFile = false;
let soonDays = 30;
let dataState = 'loading';    // 'loading' | 'online' | 'cached' | 'none'
let view = 'list';            // 'list' | 'detail' | 'new'
let search = '';
let assetFilterId = 0;        // un solo activo: sus certificados (el vigente y su historial)
let openKey = null;           // el certificado abierto
let editing = false;          // el detalle se está corrigiendo
let editDraft = null;
let listScroll = 0;
let siteBlocked = false;
let fileBusy = false;         // se está subiendo un archivo desde el detalle

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
// Un certificado o activo se ve si su centro de costos se puede usar y está marcado en la App.
function centerAllowed(ccId) {
    if (!ccId) return true;
    if (!hasCostCenterPermission(ccId)) return false;
    const sel = selectedCostCenterIds();
    return !sel || sel.has(Number(ccId));
}
const sync = () => window.SgnOfflineSync;
// Lo que se desplaza es la página o el cuerpo de la pantalla según el celular: se guarda y se restaura el que se haya movido.
const getScroll = () => Math.max(window.scrollY || 0, bodyEl.scrollTop || 0);
const setScroll = (y) => { bodyEl.scrollTop = y; window.scrollTo(0, y); };
const isNative = () => typeof sgnIsNativeApp === 'function' && sgnIsNativeApp();
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };

// --- Qué se puede corregir (el mismo criterio de la pantalla Web: el nivel de la columna en el árbol; el servidor lo vuelve a revisar al guardar) ---------------------------------------------
function columnLevel(colKey) {
    if (isClientAdmin) return 'editar';
    const base = `${GRANT_PATH.submenuPrefix}/${colKey}`;
    const has = (level) => effectiveGrants.some((g) => g.sectionId === GRANT_PATH.sectionId && g.itemId === GRANT_PATH.itemId && g.submenuId === `${base}/${level}`);
    if (has('editar')) return 'editar';
    if (has('ver-y-operar')) return 'ver-y-operar';
    return 'solo-ver';
}
const isPending = (rec, key) => (rec.pendingFields || []).includes(key);
// Un dato vacío lo llena quien tiene «Ver y operar»; uno ya escrito lo cambia quien tiene «Modificar». Uno que espera autorización no se toca.
function canEditField(key, rec) {
    if (isPending(rec, key)) return false;
    if (isClientAdmin) return true;
    const value = rec[key];
    const hasValue = value !== '' && value !== null && value !== undefined && value !== 0;
    const level = columnLevel(FIELD_COLUMNS[key]);
    if (!hasValue) return level === 'ver-y-operar' || level === 'editar';
    return level === 'editar';
}

// --- Fechas (de calendario, AAAA-MM-DD, sin hora) y estado del certificado ----------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
const localeOf = () => (currentLang() === 'es' ? 'es-MX' : 'en-US');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayNumber = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
// «2028-06-01» -> «01 jun 2028»
function dateText(iso) {
    if (!DAY_RE.test(iso || '')) return '';
    const d = new Date(`${iso}T00:00:00Z`);
    const mon = new Intl.DateTimeFormat(localeOf(), { timeZone: 'UTC', month: 'short' }).format(d).replace('.', '');
    return `${pad(d.getUTCDate())} ${mon} ${d.getUTCFullYear()}`;
}
// iso + meses, con el día ajustado al último del mes cuando el mes no lo tiene (31 ene + 1 mes = 28 feb): igual que en la Web y en el servidor.
function addMonths(iso, months) {
    const [y, m, d] = iso.split('-').map(Number);
    const total = y * 12 + (m - 1) + months;
    const ny = Math.floor(total / 12);
    const nm = total % 12;
    const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
// El estado se calcula aquí con el día de quien mira, con las mismas reglas del servidor (Vigente, Por vencer a {soonDays} días o menos, Vencida, Fuera de tolerancia): así el chip sigue
// bien aunque la lista guardada en el celular sea de otro día o se haya corregido una fecha sin señal. Solo el certificado vigente de un activo lleva estado; los demás son «Historial».
function statusOf(c) {
    if (!c.current) return { key: 'history', daysLeft: null };
    if (!DAY_RE.test(c.dueOn || '')) return { key: 'none', daysLeft: null };
    const daysLeft = dayNumber(c.dueOn) - dayNumber(todayIso());
    if (c.result === 'out') return { key: 'failed', daysLeft };
    if (daysLeft < 0) return { key: 'expired', daysLeft };
    if (daysLeft <= soonDays) return { key: 'soon', daysLeft };
    return { key: 'valid', daysLeft };
}
function chipText(st) {
    if (st.key === 'none' || st.key === 'failed' || st.key === 'history') return t(`main.calChip_${st.key}`);
    const n = Math.abs(st.daysLeft);
    if (st.key === 'soon' && st.daysLeft === 0) return t('main.calChipDays_today');
    return t(`main.calChipDays_${st.key}${n === 1 ? '1' : ''}`, { n });
}
function chipNode(c) {
    const st = statusOf(c);
    const span = el('span', `cal-chip cal-chip-${st.key}`, chipText(st));
    span.setAttribute('aria-label', t('main.colCalEstado'));
    span.setAttribute('data-help-key', 'calStatus');
    if (c.dueOn && st.key !== 'none' && st.key !== 'history') span.title = t('main.calChipTip', { date: dateText(c.dueOn) });
    return span;
}
const resultLabel = (r) => t(`main.calResult_${r}`);
const isoDateOk = (v) => {
    if (!DAY_RE.test(String(v || ''))) return false;
    const [y, m, d] = v.split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1, d));
    return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d && y >= 1990 && y <= 2100;
};

// --- Carga: lo último que se bajó se guarda en el celular (por empresa) para verlo también sin señal ----------------------------------------------------------------------
function cacheDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('sgn-cal-cache', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function cacheSave() {
    try {
        const db = await cacheDb();
        const value = {
            clientId: currentUser ? (currentUser.clientId ?? null) : null, userId: currentUser ? (currentUser.sub ?? null) : null,
            records, pickAssets, laboratories, resultOptions, canCreate, canReplaceFile, soonDays, costCenters, at: Date.now(),
        };
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
// La lista del servidor (con el estado de hoy de quien mira); sin señal se usa la última guardada en este celular.
async function loadData() {
    const clientId = currentUser ? (currentUser.clientId ?? null) : null;
    try {
        const res = await fetch(apiUrl(`${API}?today=${todayIso()}`), { credentials: 'include' });
        if (res.status === 401) { window.location.replace('Login.html'); return; }
        if (res.ok) {
            const body = await res.json();
            records = body.calibrations || [];
            pickAssets = body.assets || [];
            laboratories = body.laboratories || [];
            resultOptions = body.resultOptions || resultOptions;
            canCreate = !!body.canCreate;
            canReplaceFile = !!body.canReplaceFile;
            soonDays = body.soonDays || soonDays;
            dataState = 'online';
            if (assetFilterId && !records.some((c) => c.assetId === assetFilterId)) assetFilterId = 0;
            cacheSave();
            return;
        }
    } catch { /* sin señal: se usa lo guardado */ }
    try {
        const saved = await cacheRead();
        // lo guardado solo sirve si es de la misma empresa (otra cuenta en el mismo celular no ve certificados ajenos)
        if (saved && (saved.clientId ?? null) === clientId) {
            records = saved.records || [];
            pickAssets = saved.pickAssets || [];
            laboratories = saved.laboratories || [];
            resultOptions = saved.resultOptions || resultOptions;
            soonDays = saved.soonDays || soonDays;
            // lo que cada persona puede hacer lo decide su cuenta: lo guardado por otra persona de la misma empresa solo se ve
            const sameUser = (saved.userId ?? null) === (currentUser ? (currentUser.sub ?? null) : null);
            canCreate = sameUser && !!saved.canCreate;
            canReplaceFile = sameUser && !!saved.canReplaceFile;
            if (!costCenters.length && Array.isArray(saved.costCenters)) costCenters = saved.costCenters.filter((cc) => hasCostCenterPermission(cc.id));
            dataState = 'cached';
            return;
        }
    } catch { /* sin datos guardados */ }
    records = [];
    pickAssets = [];
    dataState = 'none';
}

// --- Lo que se mandó sin señal y sigue en la cola: los certificados nuevos se ven como «En tu celular» y los cambios se ven ya aplicados ----------------------------------------------------------
const CREATE_URL = /\/api\/business\/calibrations$/;
const PATCH_URL = /\/api\/business\/calibrations\/(\d+)$/;
let qCreates = [];            // certificados nuevos guardados sin señal: { ref, body, queuedAt }
let qPatches = new Map();     // id del certificado -> sus cambios guardados sin señal (en orden): [{ body, queuedAt }]
let queueMineCount = 0;
async function readQueue() {
    try { return await sync().listOfflineQueue(); } catch { return []; }
}
const parseBody = (item) => { try { return JSON.parse(item.body || '{}'); } catch { return null; } };
async function refreshQueued() {
    const queue = await readQueue();
    qCreates = [];
    qPatches = new Map();
    queue.forEach((item) => {
        if (!item.url || !item.method) return;
        const body = parseBody(item);
        if (!body) return;
        if (item.method === 'POST' && CREATE_URL.test(item.url) && typeof item.recordKey === 'string' && item.recordKey.startsWith(`${RECORD_PREFIX}-new:`)) {
            qCreates.push({ ref: item.recordKey.slice(`${RECORD_PREFIX}-new:`.length), body, queuedAt: item.queuedAt });
        } else if (item.method === 'PATCH' && PATCH_URL.test(item.url)) {
            const id = Number(PATCH_URL.exec(item.url)[1]);
            if (!qPatches.has(id)) qPatches.set(id, []);
            qPatches.get(id).push({ body, queuedAt: item.queuedAt });
        }
    });
    queueMineCount = qCreates.length + [...qPatches.values()].reduce((n, list) => n + list.length, 0);
}
// AppOfflineSync avisa cada 30 s aunque nada haya cambiado: solo se vuelve a dibujar si cambió lo que esta pantalla tenía en la cola, y nunca mientras se escribe (se perdería lo escrito).
document.addEventListener('sgn:offline-queue-changed', async () => {
    const before = queueMineCount;
    await refreshQueued();
    if (before === queueMineCount) return;
    // al reconectar la cola se vacía: se vuelve a pedir la lista para ver lo enviado ya con su número
    if (queueMineCount < before && navigator.onLine) await loadData();
    if (view === 'list' || (view === 'detail' && !editing && !fileBusy)) render();
});
document.addEventListener('sgn:offline-rejected', () => { if (view === 'list') render(); });

const PATCH_KEYS = Object.keys(FIELD_COLUMNS);
const pickFields = (body) => { const out = {}; PATCH_KEYS.forEach((k) => { if (Object.prototype.hasOwnProperty.call(body, k)) out[k] = body[k]; }); return out; };
// Los certificados que se muestran: los de este celular que siguen en la cola (primero) y los del servidor con sus cambios sin enviar ya aplicados. Cada uno trae, además de lo del servidor:
// { key, queued, ref, localEdits, queuedFields, certificates, current }
function buildItems() {
    const out = [];
    // el certificado más reciente de cada activo entre los guardados sin señal (un certificado nuevo quita el lugar de «vigente» al anterior)
    const newestQueued = new Map();
    qCreates.forEach((q) => { const prev = newestQueued.get(q.body.assetId); if (!prev || q.body.calibratedOn > prev) newestQueued.set(q.body.assetId, q.body.calibratedOn); });
    const queuedPerAsset = new Map();
    qCreates.forEach((q) => queuedPerAsset.set(q.body.assetId, (queuedPerAsset.get(q.body.assetId) || 0) + 1));
    qCreates.slice().reverse().forEach((q) => {
        const a = pickAssets.find((x) => x.id === q.body.assetId) || {};
        const cc = costCenters.find((c) => c.id === a.costCenterId);
        const serverNewest = records.filter((r) => r.assetId === q.body.assetId).reduce((m, r) => (r.calibratedOn > m ? r.calibratedOn : m), '');
        out.push({
            key: `q:${q.ref}`, queued: true, ref: q.ref, id: null, assetId: q.body.assetId, assetCode: a.code || '', assetSerial: a.serialNumber || '', assetModel: a.modelLabel || '', assetName: '', typeName: a.typeName || '',
            certificateNumber: q.body.certificateNumber || '', laboratory: q.body.laboratory || '', calibratedOn: q.body.calibratedOn || '', dueOn: q.body.dueOn || '', result: q.body.result || 'ok', notes: q.body.notes || '',
            hasFile: false, fileName: '', fileSize: 0, fileMime: '', current: (q.body.calibratedOn || '') >= serverNewest && q.body.calibratedOn >= (newestQueued.get(q.body.assetId) || ''),
            certificates: records.filter((r) => r.assetId === q.body.assetId).length + (queuedPerAsset.get(q.body.assetId) || 0), costCenterId: a.costCenterId || 0, colSysCentroCostos: cc ? cc.name : '', pendingFields: [],
            localEdits: false, queuedFields: [],
        });
    });
    records.forEach((r) => {
        const patches = qPatches.get(r.id) || [];
        let rec = r;
        const queuedFields = [];
        patches.forEach((p) => { const f = pickFields(p.body); rec = { ...rec, ...f }; queuedFields.push(...Object.keys(f)); });
        const newer = newestQueued.get(r.assetId);
        out.push({
            ...rec, key: `c:${r.id}`, queued: false, ref: '', localEdits: patches.length > 0, queuedFields,
            current: r.current && !(newer && newer >= (rec.calibratedOn || '')), certificates: (r.certificates || 1) + (queuedPerAsset.get(r.assetId) || 0),
        });
    });
    return out.filter((i) => i.queued || centerAllowed(i.costCenterId));
}
function visibleItems() {
    const text = search.trim();
    return buildItems().filter((c) => {
        if (assetFilterId && c.assetId !== assetFilterId) return false;
        if (!text) return true;
        const haystack = [c.assetCode, c.assetSerial, c.assetModel, c.assetName, c.certificateNumber, c.laboratory, c.notes, c.dueOn, c.calibratedOn].map((v) => String(v || '')).join(' ');
        return window.SearchSyntax ? window.SearchSyntax.matches('contains', text, haystack) : haystack.toLowerCase().includes(text.toLowerCase());
    });
}
// Los activos que se pueden elegir al crear (los de los centros que se ven).
const pickableAssets = () => pickAssets.filter((a) => centerAllowed(a.costCenterId));
// Lo que el servidor contesta mal, en el idioma de la pantalla.
const SERVER_ERRORS = {
    ASSET: 'main.calPickAsset', NO_CAL: 'home.calErrNoCal', CERT: 'main.calNeedCertificate', DATE: 'home.calErrDate', FUTURE: 'home.calErrFuture', DUE: 'main.calNeedDue', DUE_ORDER: 'home.calErrDueOrder',
    RESULT: 'home.calErrResult', DUP: 'home.calErrDup', COST_CENTER_REQUIRED: 'home.siteRequiredBody', FILE: 'main.calFileBadType', SIZE: 'main.calFileTooBig',
};
function errorText(result, params) {
    const body = (result && result.body) || {};
    if (SERVER_ERRORS[body.code]) return t(SERVER_ERRORS[body.code], params || {});
    if (result && result.status === 403) return t('main.fieldLocked');
    return t('admin.saveError');
}

// --- Pantalla --------------------------------------------------------------------------------------------------------------------------
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');
document.getElementById('carga-progress-track').hidden = true;
document.getElementById('carga-progress-label').hidden = true;

function render() {
    bodyEl.innerHTML = '';
    if (siteBlocked) { window.AppSiteGate.show(bodyEl, t); titleEl.textContent = t('menu.opCentroDistCalibraciones'); return; }
    if (view === 'new') renderNew();
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
const queuedPill = () => el('span', 'pm-app-pill pm-app-pill-queued', t('home.incOnPhone'));

// Un dato del certificado dentro de la tarjeta de la lista: su nombre chico y su valor.
function gridItem(labelKey, helpKey, value, wide) {
    const box = el('span', wide ? 'cal-app-cell cal-app-wide' : 'cal-app-cell');
    box.setAttribute('data-help-key', helpKey);
    box.setAttribute('aria-label', t(labelKey));
    box.append(el('i', '', t(labelKey)), el('b', '', value || '—'));
    return box;
}

// --- La lista ------------------------------------------------------------------------------------------------------------------------------
function renderList() {
    titleEl.textContent = t('menu.opCentroDistCalibraciones');
    renderRejectedBanner();
    if (dataState === 'cached') bodyEl.appendChild(el('p', 'pm-app-note', t('home.calCached')));
    if (dataState === 'none') { bodyEl.appendChild(el('p', 'home-carga-empty-note', t('home.calNoData'))); }
    if (canCreate && (dataState === 'online' || dataState === 'cached')) {
        const newBtn = el('button', 'home-carga-new-btn');
        newBtn.type = 'button';
        newBtn.setAttribute('data-help-key', 'appCalNuevo');
        newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${esc(t('main.newCalibration'))}</span>`;
        newBtn.addEventListener('click', startNew);
        bodyEl.appendChild(newBtn);
    }
    if (dataState === 'none' && !qCreates.length) return;
    // buscador (la sintaxis de siempre: $ antes, @ después, la coma separa)
    const input = el('input', 'pm-app-input seg-app-search');
    input.type = 'search';
    input.placeholder = t('main.aaBuscarHint');
    input.setAttribute('aria-label', t('main.aaBuscar'));
    input.setAttribute('data-help-key', 'appCalBuscar');
    input.value = search;
    bodyEl.appendChild(input);
    const noteHost = el('div');
    bodyEl.appendChild(noteHost);
    const listEl = el('div', 'cal-app-list');
    listEl.setAttribute('data-help-key', 'appCalLista');
    listEl.setAttribute('aria-label', t('menu.opCentroDistCalibraciones'));
    bodyEl.appendChild(listEl);
    let timer = 0;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { search = input.value; drawList(noteHost, listEl); }, 150); });
    drawList(noteHost, listEl);
    if (listScroll) { const y = listScroll; listScroll = 0; setTimeout(() => setScroll(y), 0); }
}
function drawList(noteHost, listEl) {
    noteHost.innerHTML = '';
    listEl.innerHTML = '';
    // «Solo los certificados de H001. Quitar el filtro»
    const filtered = assetFilterId ? buildItems().find((c) => c.assetId === assetFilterId) : null;
    if (filtered) {
        const note = el('p', 'pm-app-note cal-app-filter');
        note.append(`${t('main.calFilteringAsset', { code: filtered.assetCode })} `);
        const clear = el('button', 'cal-assets-link', t('main.calFilteringClear'));
        clear.type = 'button';
        clear.addEventListener('click', () => { assetFilterId = 0; drawList(noteHost, listEl); });
        note.appendChild(clear);
        noteHost.appendChild(note);
    }
    const items = visibleItems();
    if (!items.length) {
        listEl.appendChild(el('p', 'home-carga-empty-note', t(search.trim() || assetFilterId ? 'home.calNoMatch' : 'main.emptyStateText')));
        return;
    }
    items.slice(0, MAX_ROWS).forEach((c) => listEl.appendChild(cardNode(c, noteHost, listEl)));
    if (items.length > MAX_ROWS) listEl.appendChild(el('p', 'pm-app-note', t('home.calShowing', { n: MAX_ROWS, total: items.length })));
}
// Un certificado en la lista: el activo con su estado, el modelo y los datos del certificado; un toque abre el detalle.
function cardNode(c, noteHost, listEl) {
    const card = el('div', `pm-app-card cal-app-card${c.current ? '' : ' cal-app-card-history'}`);
    const main = el('button', 'cal-app-main');
    main.type = 'button';
    main.addEventListener('click', () => openDetail(c.key));
    const top = el('span', 'cal-app-top');
    const asset = el('span', 'cal-app-asset');
    asset.setAttribute('data-help-key', 'calAsset');
    asset.setAttribute('aria-label', t('main.colCalActivo'));
    asset.appendChild(el('b', '', c.assetCode || '—'));
    if (c.assetSerial) asset.appendChild(el('small', '', `S/N ${c.assetSerial}`));
    top.append(asset, chipNode(c));
    main.appendChild(top);
    if (c.assetModel) {
        const model = el('span', 'cal-app-model', c.assetModel);
        model.setAttribute('data-help-key', 'calModel');
        model.setAttribute('aria-label', t('main.colCalModelo'));
        main.appendChild(model);
    }
    const grid = el('span', 'cal-app-grid');
    grid.append(
        gridItem('main.colCalCertificado', 'calCertificate', c.certificateNumber),
        gridItem('main.colCalLaboratorio', 'calLaboratory', c.laboratory),
        gridItem('main.colCalCalibrado', 'calCalibratedOn', dateText(c.calibratedOn)),
        gridItem('main.colCalVence', 'calDue', dateText(c.dueOn)),
        gridItem('main.colCalResultado', 'calResult', resultLabel(c.result), true),
    );
    main.appendChild(grid);
    card.appendChild(main);
    const foot = el('div', 'cal-app-foot');
    if (c.certificates > 1 && c.assetId) {
        const link = el('button', 'cal-assets-link', t('main.calCertificatesOf', { n: c.certificates }));
        link.type = 'button';
        link.setAttribute('data-help-key', 'appCalCertificados');
        link.addEventListener('click', () => { assetFilterId = c.assetId; drawList(noteHost, listEl); });
        foot.appendChild(link);
    }
    const pills = el('span', 'cal-app-pills');
    if (c.queued || c.localEdits) pills.appendChild(queuedPill());
    if (c.hasFile) {
        const fileIcon = el('span', 'cal-app-fileicon');
        fileIcon.setAttribute('aria-label', t('main.colCalArchivo'));
        fileIcon.setAttribute('data-help-key', 'appCalFile');
        fileIcon.innerHTML = `<i class="bx ${c.fileMime === 'application/pdf' ? 'bxs-file-pdf' : 'bx-image'}" aria-hidden="true"></i>`;
        pills.appendChild(fileIcon);
    }
    if (pills.childNodes.length) foot.appendChild(pills);
    if (foot.childNodes.length) card.appendChild(foot);
    return card;
}

// --- El detalle de un certificado ----------------------------------------------------------------------------------------------------------------------
function openDetail(key) {
    listScroll = getScroll();
    openKey = key;
    editing = false;
    editDraft = null;
    view = 'detail';
    render();
    setScroll(0);
}
const currentItem = () => buildItems().find((x) => x.key === openKey);
function metaRow(labelKey, helpKey, valueNode, extra) {
    const row = el('div');
    if (helpKey) { row.setAttribute('data-help-key', helpKey); row.setAttribute('aria-label', t(labelKey)); }
    const label = el('span', '', t(labelKey));
    const value = el('b');
    if (typeof valueNode === 'string') value.textContent = valueNode || '—'; else value.appendChild(valueNode);
    row.append(label, value);
    if (extra) value.appendChild(extra);
    return row;
}
function renderDetail() {
    const c = currentItem();
    if (!c) { view = 'list'; editing = false; render(); return; }
    titleEl.textContent = c.assetCode || t('menu.opCentroDistCalibraciones');
    const server = c.queued ? null : records.find((r) => r.id === c.id);
    // lo que se puede corregir: solo un certificado que ya está en el servidor, sin cambios esperando señal
    const editable = server && !c.localEdits ? PATCH_KEYS.filter((k) => canEditField(k, c)) : [];

    if (c.queued || c.localEdits) {
        const top = el('div', 'cal-app-detail-top');
        top.appendChild(queuedPill());
        bodyEl.appendChild(top);
    }
    if (c.queued) bodyEl.appendChild(el('p', 'pm-app-note', t('home.calQueuedNote')));
    else if (c.localEdits) bodyEl.appendChild(el('p', 'pm-app-note', t('home.calQueuedEdits')));

    const assetText = [c.assetCode, c.assetSerial ? `S/N ${c.assetSerial}` : ''].filter(Boolean).join(' · ');
    const meta = el('div', 'pm-app-meta');
    meta.appendChild(metaRow('main.colCalActivo', 'calAsset', assetText));
    meta.appendChild(metaRow('main.colCalModelo', 'calModel', c.assetModel));
    meta.appendChild(metaRow('home.incCenter', '', c.colSysCentroCostos));
    const valueOf = (k) => (k === 'calibratedOn' || k === 'dueOn' ? dateText(c[k]) : (k === 'result' ? resultLabel(c.result) : c[k]));
    // el mismo orden de las columnas de la Web; «status» es el chip (no se corrige: sale de la fecha de vencimiento y del resultado)
    const FIELD_ROWS = [['certificateNumber', 'main.colCalCertificado', 'calCertificate'], ['calibratedOn', 'main.colCalCalibrado', 'calCalibratedOn'], ['dueOn', 'main.colCalVence', 'calDue'], ['status'],
        ['laboratory', 'main.colCalLaboratorio', 'calLaboratory'], ['result', 'main.colCalResultado', 'calResult'], ['notes', 'main.colCalObservaciones', 'calNotes']];
    FIELD_ROWS.forEach(([k, labelKey, help]) => {
        if (k === 'status') { meta.appendChild(metaRow('main.colCalEstado', 'calStatus', chipNode(c))); return; }
        // en modo corrección los datos que sí se pueden cambiar salen como campos (abajo); los demás quedan solo para leer
        if (editing && editable.includes(k)) return;
        const tag = isPending(c, k) ? el('small', 'cal-app-tag', t('main.changePending')) : (c.queuedFields.includes(k) ? el('small', 'cal-app-tag', t('home.incOnPhone')) : null);
        meta.appendChild(metaRow(labelKey, help, valueOf(k), tag));
    });
    bodyEl.appendChild(meta);

    if (editing) bodyEl.appendChild(editForm(c, editable));
    else if (editable.length) {
        const editBtn = el('button', 'home-carga-secondary-btn');
        editBtn.type = 'button';
        editBtn.setAttribute('data-help-key', 'appCalEditar');
        editBtn.innerHTML = `<i class="bx bx-edit-alt" aria-hidden="true"></i> <span>${esc(t('home.calEdit'))}</span>`;
        editBtn.addEventListener('click', () => {
            editDraft = {};
            editable.forEach((k) => { editDraft[k] = c[k] === null || c[k] === undefined ? '' : String(c[k]); });
            editing = true;
            render();
        });
        bodyEl.appendChild(editBtn);
    }
    if (server) bodyEl.appendChild(fileCard(c));
    if (server) {
        // Control Interno (lo que el servidor guarda de cada registro)
        const control = el('details', 'aa-app-control');
        control.appendChild(el('summary', '', t('menu.classControlInterno')));
        const list = el('div', 'pm-app-meta');
        const rows = [[t('main.colCatRegistroUnico'), c.registroUnico], ...SYSTEM_KEYS.map((key) => [t(`main.${key}`), c[key]])];
        list.innerHTML = rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v === undefined || v === null || v === '' ? '—' : String(v))}</b></div>`).join('');
        control.appendChild(list);
        bodyEl.appendChild(control);
    }
}

// --- Corregir los datos de un certificado: se manda por PATCH solo lo que cambió ----------------------------------------------------------------------------------------
function fieldBlock(labelKey, helpKey, control, hintNode) {
    const wrap = el('label', 'aa-app-field');
    wrap.setAttribute('data-help-key', helpKey);
    wrap.setAttribute('aria-label', t(labelKey));
    wrap.append(el('span', '', t(labelKey)), control);
    if (hintNode) wrap.appendChild(hintNode);
    return wrap;
}
function editForm(c, editable) {
    const form = el('div', 'pm-app-card');
    const textInput = (key, max) => {
        const input = el('input', 'pm-app-input');
        input.type = 'text';
        input.maxLength = max;
        input.autocomplete = 'off';
        input.value = editDraft[key];
        input.addEventListener('input', () => { editDraft[key] = input.value; });
        return input;
    };
    if (editable.includes('certificateNumber')) form.appendChild(fieldBlock('main.colCalCertificado', 'calCertificate', textInput('certificateNumber', 80)));
    if (editable.includes('laboratory')) {
        const lab = textInput('laboratory', 120);
        const list = el('datalist');
        list.id = 'cal-app-labs';
        laboratories.forEach((l) => { const o = el('option'); o.value = l; list.appendChild(o); });
        lab.setAttribute('list', 'cal-app-labs');
        form.append(fieldBlock('main.colCalLaboratorio', 'calLaboratory', lab), list);
    }
    const dateInput = (key) => {
        const input = el('input', 'pm-app-input');
        input.type = 'date';
        input.value = editDraft[key];
        input.addEventListener('input', () => { editDraft[key] = input.value; });
        input.addEventListener('change', () => { editDraft[key] = input.value; });
        return input;
    };
    if (editable.includes('calibratedOn')) { const d = dateInput('calibratedOn'); d.max = todayIso(); form.appendChild(fieldBlock('main.colCalCalibrado', 'calCalibratedOn', d)); }
    if (editable.includes('dueOn')) form.appendChild(fieldBlock('main.colCalVence', 'calDue', dateInput('dueOn')));
    if (editable.includes('result')) {
        const select = el('select', 'pm-app-input');
        resultOptions.forEach((r) => { const o = el('option', '', resultLabel(r)); o.value = r; select.appendChild(o); });
        select.value = editDraft.result;
        select.addEventListener('change', () => { editDraft.result = select.value; });
        form.appendChild(fieldBlock('main.colCalResultado', 'calResult', select));
    }
    if (editable.includes('notes')) {
        const area = el('textarea', 'pm-app-input seg-app-note-area');
        area.maxLength = 500;
        area.value = editDraft.notes;
        area.addEventListener('input', () => { editDraft.notes = area.value; });
        form.appendChild(fieldBlock('main.colCalObservaciones', 'calNotes', area));
    }
    const save = el('button', 'home-carga-new-btn pm-app-send');
    save.type = 'button';
    save.innerHTML = `<i class="bx bx-save" aria-hidden="true"></i><span>${esc(t('home.calSaveChanges'))}</span>`;
    save.addEventListener('click', () => saveEdit(c, editable, save));
    const cancel = el('button', 'home-carga-secondary-btn', t('admin.cancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', () => { editing = false; editDraft = null; render(); });
    form.append(save, cancel);
    return form;
}
// Lo que falta o está mal antes de guardar un cambio (las mismas revisiones de la Web y del servidor); devuelve el texto del problema o ''.
function validateValues(v, base) {
    if (v.certificateNumber !== undefined && !v.certificateNumber) return t('main.calNeedCertificate');
    if (v.calibratedOn !== undefined) {
        if (!isoDateOk(v.calibratedOn)) return t('home.calErrDate');
        if (dayNumber(v.calibratedOn) > dayNumber(todayIso()) + 1) return t('home.calErrFuture');
    }
    if (v.dueOn !== undefined && !isoDateOk(v.dueOn)) return t('main.calNeedDue');
    const cal = v.calibratedOn !== undefined ? v.calibratedOn : base.calibratedOn;
    const due = v.dueOn !== undefined ? v.dueOn : base.dueOn;
    if (DAY_RE.test(cal || '') && DAY_RE.test(due || '') && dayNumber(due) <= dayNumber(cal)) return t('home.calErrDueOrder');
    return '';
}
async function saveEdit(c, editable, saveBtn) {
    const patch = {};
    editable.forEach((k) => {
        const v = String(editDraft[k] === undefined ? '' : editDraft[k]).trim();
        if (v !== String(c[k] === null || c[k] === undefined ? '' : c[k])) patch[k] = v;
    });
    if (!Object.keys(patch).length) { editing = false; editDraft = null; render(); return; }
    const problem = validateValues(patch, c);
    if (problem) { showToast(problem); return; }
    const server = records.find((r) => r.id === c.id) || {};
    // lo que se veía de cada dato al corregirlo: si al reconectar el servidor ya trae otro valor es un cambio de otra persona y se pregunta antes de pisarlo
    const baseline = {};
    Object.keys(patch).forEach((k) => { baseline[k] = server[k]; });
    const description = `${t('menu.opCentroDistCalibraciones')} · ${c.assetCode} · ${c.certificateNumber}`;
    saveBtn.disabled = true;
    try {
        const result = await sync().offlineAwareFetch(
            `${API}/${c.id}`,
            { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(patch) },
            description, `${RECORD_PREFIX}:${c.id}`, baseline, { rejectable: true },
        );
        if (result.queued) {
            // sin señal: el cambio queda en el celular (se ve aplicado, marcado «En tu celular») y se envía solo al volver la conexión
            await refreshQueued();
            editing = false;
            editDraft = null;
            showToast(t('home.calSavedOffline'));
            render();
            return;
        }
        if (!result.ok) {
            showToast(errorText(result, { cert: patch.certificateNumber || c.certificateNumber }));
            if (result.status === 404) { editing = false; editDraft = null; view = 'list'; await loadData(); render(); return; }
            saveBtn.disabled = false;
            return;
        }
        const body = result.body || {};
        if (body.rejectedFields && body.rejectedFields.length) showToast(`${t('main.fieldLocked')}: ${body.rejectedFields.map((fk) => t(fk)).join(', ')}`);
        else if (body.pendingFields && body.pendingFields.length) showToast(`${t('main.changePending')}: ${body.pendingFields.map((fk) => t(fk)).join(', ')}`);
        // un vencimiento corregido cambia el estado y quién es el certificado vigente: se vuelve a leer todo
        editing = false;
        editDraft = null;
        await loadData();
        render();
    } catch {
        showToast(t('admin.saveError'));
        saveBtn.disabled = false;
    }
}

// --- El archivo del certificado (PDF, JPG o PNG, hasta 3 MB) ----------------------------------------------------------------------------------------------------------------
const kbText = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;
function mimeOf(file) {
    if (FILE_TYPES.includes(file.type)) return file.type;
    const ext = (String(file.name || '').split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    return file.type || '';
}
const readAsDataUrl = (blob) => new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob); });
function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => loadImageElement(file));
    return loadImageElement(file);
}
function loadImageElement(file) {
    // la política de seguridad del servidor solo deja cargar imágenes propias y data: (no blob:): la foto se lee como data:
    return readAsDataUrl(file).then((src) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image'));
        img.src = src;
    }));
}
// Revisa el archivo elegido. Una foto de más de 3 MB (la cámara del celular suele pasarse) se reduce a JPG hasta que quepa; un PDF de más de 3 MB no se puede reducir.
// Devuelve { blob, type, name, size, preview } (preview = la foto como data:, o '' si es PDF) o lanza 'type' / 'size'.
async function prepareFile(file) {
    const type = mimeOf(file);
    if (!FILE_TYPES.includes(type)) throw new Error('type');
    let blob = file;
    let outType = type;
    let name = file.name || '';
    if (file.size > MAX_FILE_BYTES) {
        if (type === 'application/pdf') throw new Error('size');
        const bmp = await loadBitmap(file);
        const w = bmp.width || bmp.naturalWidth;
        const h = bmp.height || bmp.naturalHeight;
        if (!w || !h) throw new Error('size');
        let scale = Math.min(1, 2400 / Math.max(w, h));
        let shrunk = null;
        for (let pass = 0; pass < 5 && !shrunk; pass++) {
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
            for (const q of [0.85, 0.75, 0.65, 0.5]) {
                const candidate = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q));
                if (candidate && candidate.size <= MAX_FILE_BYTES) { shrunk = candidate; break; }
            }
            scale *= 0.75;
        }
        if (bmp.close) bmp.close();
        if (!shrunk) throw new Error('size');
        blob = shrunk;
        outType = 'image/jpeg';
        name = `${(name || 'certificado').replace(/\.[^.]+$/, '')}.jpg`;
    }
    return { blob, type: outType, name, size: blob.size, preview: outType === 'application/pdf' ? '' : await readAsDataUrl(blob) };
}
const fileProblemText = (err) => t(err && err.message === 'size' ? 'main.calFileTooBig' : 'main.calFileBadType');

// Sube el archivo de un certificado que ya está en el servidor. Necesita señal (un archivo no se puede dejar en la cola). Devuelve true si quedó subido.
async function uploadFile(id, prepared) {
    let res;
    try {
        res = await fetch(apiUrl(`${API}/${id}/file?name=${encodeURIComponent(prepared.name || '')}`), { method: 'PUT', headers: { 'Content-Type': prepared.type }, credentials: 'include', body: prepared.blob });
    } catch {
        showToast(t('home.calFileNeedsSignal'));
        return false;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(errorText({ status: res.status, body })); return false; }
    showToast(t('main.calFileSaved'));
    return true;
}
// La tarjeta del archivo en el detalle: ver el certificado y (si la cuenta puede) subirlo o cambiarlo.
function fileCard(c) {
    const card = el('div', 'pm-app-card');
    card.setAttribute('data-help-key', 'appCalFile');
    card.setAttribute('aria-label', t('main.colCalArchivo'));
    card.appendChild(el('h4', 'pm-app-title', t('main.colCalArchivo')));
    if (c.hasFile) {
        const viewBtn = el('button', 'home-carga-secondary-btn');
        viewBtn.type = 'button';
        viewBtn.setAttribute('aria-label', t('main.calViewFile'));
        viewBtn.innerHTML = `<i class="bx ${c.fileMime === 'application/pdf' ? 'bxs-file-pdf' : 'bx-image'}" aria-hidden="true"></i> <span>${esc(t('main.calViewFile'))}</span>`;
        viewBtn.addEventListener('click', () => openFile(c));
        card.appendChild(viewBtn);
        card.appendChild(el('p', 'pm-app-note', `${c.fileName || ''}${c.fileSize ? ` · ${kbText(c.fileSize)}` : ''}`));
    } else {
        card.appendChild(el('p', 'pm-app-note', t('home.calNoFile')));
    }
    if (c.hasFile ? canReplaceFile : canCreate) {
        const add = el('label', 'home-carga-secondary-btn inc-app-add');
        add.innerHTML = `<i class="bx ${c.hasFile ? 'bx-refresh' : 'bx-upload'}" aria-hidden="true"></i> <span>${esc(fileBusy ? t('home.calFilePreparing') : t(c.hasFile ? 'main.calReplaceFile' : 'main.calUploadFile'))}</span><input type="file" accept="${FILE_ACCEPT}"${fileBusy ? ' disabled' : ''}>`;
        add.querySelector('input').addEventListener('change', async (event) => {
            const file = (event.target.files || [])[0];
            event.target.value = ''; // así se puede volver a elegir el mismo archivo
            if (!file || fileBusy) return;
            if (navigator.onLine === false) { showToast(t('home.calFileNeedsSignal')); return; }
            fileBusy = true;
            render();
            try {
                const prepared = await prepareFile(file);
                if (await uploadFile(c.id, prepared)) await loadData();
            } catch (err) {
                showToast(fileProblemText(err));
            }
            fileBusy = false;
            render();
        });
        card.appendChild(add);
    }
    return card;
}
// Ver el certificado: una foto se abre a pantalla completa; un PDF se abre en el visor del sistema (en el navegador, en otra pestaña; en la App instalada se comparte o se baja, porque el
// visor del sistema no trae la sesión).
async function openFile(c) {
    if (navigator.onLine === false) { showToast(t('home.calFileNeedsSignal')); return; }
    const path = `${API}/${c.id}/file`;
    const isPdf = c.fileMime === 'application/pdf';
    if (isPdf && !isNative()) { window.open(apiUrl(path), '_blank', 'noopener'); return; }
    let blob;
    try {
        const res = await fetch(apiUrl(path), { credentials: 'include' });
        if (!res.ok) { showToast(t('home.calFileOpenError')); return; }
        blob = await res.blob();
    } catch {
        showToast(t('home.calFileNeedsSignal'));
        return;
    }
    if (!isPdf) { openViewer(c, await readAsDataUrl(blob)); return; }
    const name = c.fileName || 'certificado.pdf';
    const file = new File([blob], name, { type: 'application/pdf' });
    try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (err) {
        if (err && err.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
}
// El visor de la foto del certificado (pantalla completa).
function openViewer(c, src) {
    const scrim = el('div', 'inc-app-viewer');
    scrim.innerHTML = `<div class="inc-app-viewer-bar"><span>${esc([c.assetCode, c.certificateNumber].filter(Boolean).join(' · '))}</span><button type="button" id="cal-app-vclose" aria-label="${esc(t('main.incFotoCerrar'))}"><i class="bx bx-x" aria-hidden="true"></i></button></div>
        <div class="inc-app-viewer-stage"><img id="cal-app-vimg" alt=""></div>`;
    document.body.appendChild(scrim);
    scrim.querySelector('#cal-app-vimg').src = src;
    scrim.querySelector('#cal-app-vclose').addEventListener('click', () => scrim.remove());
}

// --- «+ Nueva calibración» -----------------------------------------------------------------------------------------------------------------------------------
// draft: { assetId, certificateNumber, laboratory, calibratedOn, dueOn, dueTouched, result, notes, file: { blob, type, name, size, preview } | null, preparing, saving, ref }
let draft = null;
function newRef() {
    const bytes = new Uint8Array(12);
    (window.crypto || {}).getRandomValues?.(bytes);
    const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') || Math.random().toString(16).slice(2).padEnd(24, '0');
    return `app-${Date.now().toString(36)}-${rand}`;
}
function startNew() {
    if (!pickableAssets().length) { showToast(t('main.calNoAssets')); return; }
    draft = { assetId: 0, certificateNumber: '', laboratory: '', calibratedOn: '', dueOn: '', dueTouched: false, result: 'ok', notes: '', file: null, preparing: 0, saving: false, ref: newRef() };
    listScroll = getScroll();
    view = 'new';
    render();
    setScroll(0);
}
const draftDirty = () => !!(draft && (draft.assetId || draft.certificateNumber.trim() || draft.laboratory.trim() || draft.calibratedOn || draft.dueOn || draft.notes.trim() || draft.file));
function renderNew() {
    titleEl.textContent = t('main.newCalibration');
    if (dataState === 'cached') bodyEl.appendChild(el('p', 'pm-app-note', t('home.calCached')));
    const form = el('div', 'pm-app-card');
    // el activo (de los que llevan calibración, en los centros que se ven)
    const assetSel = el('select', 'pm-app-input');
    assetSel.id = 'cal-app-asset';
    const blank = el('option', '', t('main.calPickAsset'));
    blank.value = '';
    assetSel.appendChild(blank);
    pickableAssets().forEach((a) => {
        const o = el('option', '', [a.code, a.serialNumber ? `S/N ${a.serialNumber}` : '', a.modelLabel].filter(Boolean).join(' · '));
        o.value = String(a.id);
        assetSel.appendChild(o);
    });
    assetSel.value = draft.assetId ? String(draft.assetId) : '';
    const req = () => { const s = el('span', 'pm-app-req', ' *'); s.setAttribute('aria-hidden', 'true'); return s; };
    const block = (labelKey, helpKey, control, required, hintNode) => {
        const wrap = fieldBlock(labelKey, helpKey, control, hintNode);
        if (required) wrap.firstChild.appendChild(req());
        return wrap;
    };
    form.appendChild(block('main.colCalActivo', 'calAsset', assetSel, true));

    const cert = el('input', 'pm-app-input');
    cert.id = 'cal-app-cert';
    cert.type = 'text';
    cert.maxLength = 80;
    cert.autocomplete = 'off';
    cert.value = draft.certificateNumber;
    cert.addEventListener('input', () => { draft.certificateNumber = cert.value; });
    form.appendChild(block('main.colCalCertificado', 'calCertificate', cert, true));

    const lab = el('input', 'pm-app-input');
    lab.id = 'cal-app-lab';
    lab.type = 'text';
    lab.maxLength = 120;
    lab.autocomplete = 'off';
    lab.setAttribute('list', 'cal-app-labs');
    lab.value = draft.laboratory;
    lab.addEventListener('input', () => { draft.laboratory = lab.value; });
    const labList = el('datalist');
    labList.id = 'cal-app-labs';
    laboratories.forEach((l) => { const o = el('option'); o.value = l; labList.appendChild(o); });
    form.append(block('main.colCalLaboratorio', 'calLaboratory', lab, false), labList);

    const on = el('input', 'pm-app-input');
    on.id = 'cal-app-on';
    on.type = 'date';
    on.max = todayIso();
    on.value = draft.calibratedOn;
    const due = el('input', 'pm-app-input');
    due.id = 'cal-app-due';
    due.type = 'date';
    due.value = draft.dueOn;
    const dueHint = el('small', 'cal-app-hint');
    // Propone el vencimiento con la vigencia del modelo (si quien captura no lo escribió) y dice de dónde salió.
    const syncDue = () => {
        const asset = pickAssets.find((a) => a.id === draft.assetId);
        dueHint.textContent = '';
        if (!asset) return;
        if (!asset.months) { dueHint.textContent = t('main.calNoMonths'); return; }
        if (!draft.dueTouched && DAY_RE.test(draft.calibratedOn)) { draft.dueOn = addMonths(draft.calibratedOn, asset.months); due.value = draft.dueOn; }
        dueHint.textContent = t('main.calProposed', { n: asset.months });
    };
    assetSel.addEventListener('change', () => { draft.assetId = Number(assetSel.value) || 0; draft.dueTouched = false; draft.dueOn = ''; due.value = ''; syncDue(); });
    const onDate = () => { draft.calibratedOn = on.value; syncDue(); };
    on.addEventListener('change', onDate);
    on.addEventListener('input', onDate);
    const onDue = () => { draft.dueOn = due.value; draft.dueTouched = true; };
    due.addEventListener('input', onDue);
    due.addEventListener('change', onDue);
    form.append(block('main.colCalCalibrado', 'calCalibratedOn', on, true), block('main.colCalVence', 'calDue', due, true, dueHint));
    syncDue();

    const resultSel = el('select', 'pm-app-input');
    resultOptions.forEach((r) => { const o = el('option', '', resultLabel(r)); o.value = r; resultSel.appendChild(o); });
    resultSel.value = draft.result;
    resultSel.addEventListener('change', () => { draft.result = resultSel.value; });
    form.appendChild(block('main.colCalResultado', 'calResult', resultSel, false));

    const notes = el('textarea', 'pm-app-input seg-app-note-area');
    notes.maxLength = 500;
    notes.value = draft.notes;
    notes.addEventListener('input', () => { draft.notes = notes.value; });
    form.appendChild(block('main.colCalObservaciones', 'calNotes', notes, false));
    bodyEl.appendChild(form);

    // el archivo del certificado (opcional): se reduce si es una foto muy pesada y se ve antes de guardar
    const fileBox = el('div', 'pm-app-card');
    fileBox.setAttribute('data-help-key', 'appCalFile');
    fileBox.setAttribute('aria-label', t('main.colCalArchivo'));
    bodyEl.appendChild(fileBox);
    const saveBtn = el('button', 'home-carga-new-btn pm-app-send');
    saveBtn.type = 'button';
    saveBtn.innerHTML = `<i class="bx bx-save" aria-hidden="true"></i><span>${esc(t('main.calSaveBtn'))}</span>`;
    const fileDraw = () => {
        fileBox.innerHTML = '';
        fileBox.appendChild(el('h4', 'pm-app-title', t('main.calFileLabel')));
        if (draft.file) {
            const shot = el('div', 'cal-app-filepreview');
            if (draft.file.preview) { const img = el('img'); img.alt = draft.file.name; img.src = draft.file.preview; shot.appendChild(img); } else shot.innerHTML = '<i class="bx bxs-file-pdf" aria-hidden="true"></i>';
            shot.appendChild(el('span', '', `${draft.file.name} · ${kbText(draft.file.size)}`));
            const rm = el('button', 'pm-app-remove');
            rm.type = 'button';
            rm.setAttribute('aria-label', t('home.incRemove'));
            rm.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
            rm.addEventListener('click', () => { draft.file = null; fileDraw(); });
            shot.appendChild(rm);
            fileBox.appendChild(shot);
        }
        if (draft.preparing) fileBox.appendChild(el('p', 'pm-app-note', t('home.calFilePreparing')));
        const add = el('label', 'home-carga-secondary-btn inc-app-add');
        add.innerHTML = `<i class="bx bx-paperclip" aria-hidden="true"></i> <span>${esc(t(draft.file ? 'home.calChangeFile' : 'home.calAddFile'))}</span><input type="file" accept="${FILE_ACCEPT}">`;
        add.querySelector('input').addEventListener('change', async (event) => {
            const file = (event.target.files || [])[0];
            event.target.value = ''; // así se puede volver a elegir el mismo archivo
            if (!file) return;
            draft.preparing += 1;
            fileDraw();
            try { draft.file = await prepareFile(file); } catch (err) { showToast(fileProblemText(err)); }
            draft.preparing -= 1;
            fileDraw();
        });
        fileBox.appendChild(add);
        saveBtn.disabled = draft.preparing > 0 || draft.saving;
    };
    fileDraw();
    saveBtn.addEventListener('click', () => submitNew(saveBtn));
    bodyEl.appendChild(saveBtn);
}
async function submitNew(saveBtn) {
    if (!draft || draft.saving) return;
    const body = {
        assetId: draft.assetId || 0, certificateNumber: draft.certificateNumber.trim(), laboratory: draft.laboratory.trim(),
        calibratedOn: draft.calibratedOn, dueOn: draft.dueOn, result: draft.result, notes: draft.notes.trim(),
    };
    const problem = (!body.assetId && ['#cal-app-asset', t('main.calPickAsset')]) || (!body.certificateNumber && ['#cal-app-cert', t('main.calNeedCertificate')]) || (!body.calibratedOn && ['#cal-app-on', t('main.calNeedDate')])
        || (!body.dueOn && ['#cal-app-due', t('main.calNeedDue')]);
    if (problem) { showToast(problem[1]); bodyEl.querySelector(problem[0])?.focus(); return; }
    const invalid = validateValues({ calibratedOn: body.calibratedOn, dueOn: body.dueOn }, {});
    if (invalid) { showToast(invalid); return; }
    const asset = pickAssets.find((a) => a.id === body.assetId) || {};
    const description = `${t('menu.opCentroDistCalibraciones')} · ${asset.code || ''} · ${body.certificateNumber}`;
    draft.saving = true;
    saveBtn.disabled = true;
    try {
        // rejectable: si ya con señal el servidor lo rechaza (ya existe ese certificado, el activo dejó de llevar calibración) se anota en «No se aplicó» en vez de trabar la cola
        const result = await sync().offlineAwareFetch(
            API,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) },
            description, `${RECORD_PREFIX}-new:${draft.ref}`, null, { rejectable: true },
        );
        if (!result.queued && !result.ok) {
            showToast(errorText(result, { cert: body.certificateNumber }));
            draft.saving = false;
            saveBtn.disabled = false;
            return;
        }
        const file = draft.file;
        let note = '';
        if (result.queued) {
            // un archivo no se puede dejar en la cola: el certificado queda en el celular y el archivo se sube después, con señal
            if (file) note = ` ${t('home.calFileAfterSignal')}`;
            await refreshQueued();
        } else {
            let fileFailed = false;
            const created = (result.body || {}).calibration;
            if (file && created) fileFailed = !(await uploadFile(created.id, file));
            if (fileFailed) note = ` ${t('home.calFileFailed')}`;
            await loadData();
        }
        showToast(`${t(result.queued ? 'home.calSavedNewOffline' : 'main.calSaved', { code: asset.code || '' })}${note}`, note ? 6500 : 4000);
        draft = null;
        listScroll = 0;
        view = 'list';
        render();
    } catch {
        showToast(t('admin.saveError'));
        if (draft) draft.saving = false;
        saveBtn.disabled = false;
    }
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') { window.location.href = 'AppInicio.html'; return; }
    if (view === 'new' && draftDirty() && !window.confirm(t('home.calDiscard'))) return;
    if (view === 'detail' && editing && !window.confirm(t('home.calDiscardEdit'))) return;
    draft = null;
    editing = false;
    editDraft = null;
    fileBusy = false;
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
        await Promise.all([loadCostCenters(), loadBrandingForTheme()]);
        applyStyle(getStoredStyle());
        await loadData();
        await refreshQueued();
        render();
    } catch (err) {
        console.error('Calibraciones (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
