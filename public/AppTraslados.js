// ---------------------------------------------------------------------------
// Nuestros Traslados (App) — same one-field-at-a-time shell as Alta Nuestros
// Artículos (see AppNuestrosArticulos.js for the original of this pattern;
// OpTransVolNuestrosTraslados.js is the Web/table version of this same data,
// same /api/business/transfers backend). Two screens: the list of active
// (not-yet-complete) traslados + "+ Nuevo Traslado", and the field-by-field
// form for whichever traslado is open, grouped into the same 4
// classifications as the Web table (Solicitud/Requisitos/Origen/Destino).
//
// "+ Nuevo Traslado" creates a real, blank record immediately — every one of
// its 23 fields is then filled in one at a time via PATCH, same
// column-level permission/pending-approval workflow as every other table. A
// record is "complete" (drops off "Traslados en captura") once every field
// has a value, same convention as Alta Nuestros Artículos/Carga Combustible.
// ---------------------------------------------------------------------------

const SUPPORTED_LANGS = ['en', 'es'];
const DEFAULT_LANG = 'en';
let dict = {};

function t(key, params = {}) {
    const value = key.split('.').reduce((obj, part) => obj?.[part], dict);
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}

async function loadLanguage() {
    const stored = localStorage.getItem('lang');
    const lang = SUPPORTED_LANGS.includes(stored) ? stored : DEFAULT_LANG;
    try {
        const res = await fetch(`i18n/${lang}.json`);
        if (res.ok) dict = await res.json();
    } catch {
        dict = {};
    }
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    const titleEl = document.querySelector('title[data-i18n]');
    if (titleEl) document.title = t(titleEl.dataset.i18n);
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

// --- Estilo (theme) — same mechanism as every other App page. --------------
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
        // Falls back to the static per-theme CSS already applied.
    }
}

const TABLE_KEY = 'nuestros-traslados';

// --- Field catalog -----------------------------------------------------
// Every field's apiKey matches a real TRANSFER_PATCHABLE_FIELDS key in
// db.js. requestedUnitType/quoteFolio are 'select' fields whose optionGroups
// are filled in at load (see loadUnitTypeOptions/loadQuoteOptions below) --
// both plain TEXT values on the record, not foreign keys, same "conserva su
// valor" convention as every other screen's own catalog selects.
const FIELDS = [
    { id: 'requestDate', group: 'solicitud', apiKey: 'requestDate', labelKey: 'main.colTrasladoFechaSolicitud', hintKey: 'home.trasladoHintFechaSolicitud', type: 'datetime-local', icon: 'bx-calendar' },
    { id: 'requestedBy', group: 'solicitud', apiKey: 'requestedBy', labelKey: 'main.colTrasladoQuienSolicita', hintKey: 'home.trasladoHintQuienSolicita', type: 'text', icon: 'bx-user' },
    { id: 'clientType', group: 'solicitud', apiKey: 'clientType', labelKey: 'main.colTrasladoTipoCliente', hintKey: 'home.trasladoHintTipoCliente', type: 'select', icon: 'bx-id-card', optionGroups: [{ options: [] }] },
    { id: 'requestContact', group: 'solicitud', apiKey: 'requestContact', labelKey: 'main.colTrasladoContactoSolicita', hintKey: 'home.trasladoHintContactoSolicita', type: 'text', icon: 'bx-phone' },
    { id: 'neededDate', group: 'solicitud', apiKey: 'neededDate', labelKey: 'main.colTrasladoFechaRequerida', hintKey: 'home.trasladoHintFechaRequerida', type: 'datetime-local', icon: 'bx-calendar-check' },
    { id: 'neededTime', group: 'solicitud', apiKey: 'neededTime', labelKey: 'main.colTrasladoHoraRequerida', hintKey: 'home.trasladoHintHoraRequerida', type: 'text', icon: 'bx-time' },
    { id: 'serviceClient', group: 'solicitud', apiKey: 'serviceClient', labelKey: 'main.colTrasladoClienteServicio', hintKey: 'home.trasladoHintClienteServicio', type: 'text', icon: 'bx-buildings' },
    { id: 'serviceType', group: 'solicitud', apiKey: 'serviceType', labelKey: 'main.colTrasladoTipoServicio', hintKey: 'home.trasladoHintTipoServicio', type: 'text', icon: 'bx-category' },
    { id: 'requestedUnitType', group: 'solicitud', apiKey: 'requestedUnitType', labelKey: 'main.colTrasladoTipoUnidadSolicitada', hintKey: 'home.trasladoHintTipoUnidadSolicitada', type: 'select', icon: 'bx-car', optionGroups: [{ options: [] }] },
    { id: 'quoteFolio', group: 'solicitud', apiKey: 'quoteFolio', labelKey: 'main.colTrasladoCotizacion', hintKey: 'home.trasladoHintCotizacion', type: 'select', icon: 'bx-receipt', optionGroups: [{ options: [] }] },
    { id: 'serviceRequirements', group: 'requisitos', apiKey: 'serviceRequirements', labelKey: 'main.colTrasladoReqServicio', hintKey: 'home.trasladoHintReqServicio', type: 'text', icon: 'bx-list-check' },
    { id: 'securityRequirements', group: 'requisitos', apiKey: 'securityRequirements', labelKey: 'main.colTrasladoReqSeguridad', hintKey: 'home.trasladoHintReqSeguridad', type: 'text', icon: 'bx-shield' },
    { id: 'billingRequirements', group: 'requisitos', apiKey: 'billingRequirements', labelKey: 'main.colTrasladoReqCobro', hintKey: 'home.trasladoHintReqCobro', type: 'text', icon: 'bx-credit-card' },
    { id: 'originClient', group: 'origen', apiKey: 'originClient', labelKey: 'main.colTrasladoClienteOrigen', hintKey: 'home.trasladoHintClienteOrigen', type: 'text', icon: 'bx-buildings' },
    { id: 'originContact', group: 'origen', apiKey: 'originContact', labelKey: 'main.colTrasladoContactoOrigen', hintKey: 'home.trasladoHintContactoOrigen', type: 'text', icon: 'bx-phone' },
    { id: 'originSite', group: 'origen', apiKey: 'originSite', labelKey: 'main.colTrasladoSitioOrigen', hintKey: 'home.trasladoHintSitioOrigen', type: 'text', icon: 'bx-map' },
    { id: 'originUrl', group: 'origen', apiKey: 'originUrl', labelKey: 'main.colTrasladoUrlOrigen', hintKey: 'home.trasladoHintUrlOrigen', type: 'text', icon: 'bx-link' },
    { id: 'originNickname', group: 'origen', apiKey: 'originNickname', labelKey: 'main.colTrasladoApodoOrigen', hintKey: 'home.trasladoHintApodoOrigen', type: 'text', icon: 'bx-tag' },
    { id: 'destClient', group: 'destino', apiKey: 'destClient', labelKey: 'main.colTrasladoClienteDestino', hintKey: 'home.trasladoHintClienteDestino', type: 'text', icon: 'bx-buildings' },
    { id: 'destContact', group: 'destino', apiKey: 'destContact', labelKey: 'main.colTrasladoContactoDestino', hintKey: 'home.trasladoHintContactoDestino', type: 'text', icon: 'bx-phone' },
    { id: 'destSite', group: 'destino', apiKey: 'destSite', labelKey: 'main.colTrasladoSitioDestino', hintKey: 'home.trasladoHintSitioDestino', type: 'text', icon: 'bx-map-pin' },
    { id: 'destUrl', group: 'destino', apiKey: 'destUrl', labelKey: 'main.colTrasladoUrlDestino', hintKey: 'home.trasladoHintUrlDestino', type: 'text', icon: 'bx-link' },
    { id: 'destNickname', group: 'destino', apiKey: 'destNickname', labelKey: 'main.colTrasladoApodoDestino', hintKey: 'home.trasladoHintApodoDestino', type: 'text', icon: 'bx-tag' },
];
const SOLICITUD_FIELDS = FIELDS.filter((f) => f.group === 'solicitud');
const REQUISITOS_FIELDS = FIELDS.filter((f) => f.group === 'requisitos');
const ORIGEN_FIELDS = FIELDS.filter((f) => f.group === 'origen');
const DESTINO_FIELDS = FIELDS.filter((f) => f.group === 'destino');
const GROUPS = [
    { key: 'solicitud', icon: 'bx-clipboard', labelKey: 'home.trasladoGroupSolicitud', fields: SOLICITUD_FIELDS },
    { key: 'requisitos', icon: 'bx-list-check', labelKey: 'home.trasladoGroupRequisitos', fields: REQUISITOS_FIELDS },
    { key: 'origen', icon: 'bx-map', labelKey: 'home.trasladoGroupOrigen', fields: ORIGEN_FIELDS },
    { key: 'destino', icon: 'bx-map-pin', labelKey: 'home.trasladoGroupDestino', fields: DESTINO_FIELDS },
];

async function loadUnitTypeOptions() {
    try {
        const res = await fetch(apiUrl('/api/business/unit-types'), { credentials: 'include' });
        if (!res.ok) return;
        const { unitTypes } = await res.json();
        const active = (unitTypes || []).filter((u) => u.status === 'active' && u.name).map((u) => u.name);
        const field = FIELDS.find((f) => f.id === 'requestedUnitType');
        field.optionGroups = [{ options: active.map((name) => ({ value: name, label: name })) }];
    } catch (err) {
        console.error('Nuestros Traslados: failed to load unit type options', err);
    }
}
async function loadQuoteOptions() {
    try {
        const res = await fetch(apiUrl('/api/business/freight-quotes-active'), { credentials: 'include' });
        if (!res.ok) return;
        const { options } = await res.json();
        const field = FIELDS.find((f) => f.id === 'quoteFolio');
        field.optionGroups = [{ options: (options || []).map((q) => ({ value: q.folio, label: q.label })) }];
    } catch (err) {
        console.error('Nuestros Traslados: failed to load quote options', err);
    }
}

// Tipo Cliente -- "Nuestros Tipos Cliente" catalog (Directo/Terceros/
// Adicional...), same active-only reuse as Tipo Unidad above, plus a
// "+ Solicitar nuevo" option (own group, no label, so it reads as a
// separate action below the real values) that opens openCatalogRequestSheet
// instead of committing a value -- see REQUEST_NEW_CLIENT_TYPE's own check
// in commitFieldValue.
const REQUEST_NEW_CLIENT_TYPE = '__request_new_tipo_cliente__';
async function loadTiposClienteOptions() {
    try {
        const res = await fetch(apiUrl('/api/business/article-categories-active'), { credentials: 'include' });
        if (!res.ok) return;
        const { options } = await res.json();
        const active = options['tipos-cliente'] || [];
        const field = FIELDS.find((f) => f.id === 'clientType');
        field.optionGroups = [
            { options: active.map((name) => ({ value: name, label: name })) },
            { options: [{ value: REQUEST_NEW_CLIENT_TYPE, label: t('main.requestCatalogAdd', { label: t('menu.catTransVolTiposCliente') }) }] },
        ];
    } catch (err) {
        console.error('Nuestros Traslados: failed to load Tipos Cliente options', err);
    }
}

// --- App state -----------------------------------------------------------
let currentUser = null;
let records = []; // real, persisted transfers from the server
let openRecordId = null;
let view = 'list'; // 'list' | 'record'
// "+ Nuevo Traslado" only opens this in-memory draft (no id yet) -- the
// record is only actually created on the server once its FIRST field is
// confirmed (see commitFieldValue), same as Tipos de Unidad/Nuestras
// Cotizaciones' own draft pattern. Tapping "+ Nuevo Traslado" and backing
// out without typing anything never leaves a blank traslado behind.
let draftRecord = null;
function blankDraftRecord() {
    const blank = { id: null, pendingFields: [] };
    FIELDS.forEach((f) => { blank[f.apiKey] = ''; });
    return blank;
}

function isFieldFilled(value) {
    return value !== null && value !== undefined && value !== '';
}
function fieldValueFromRecord(field, record) {
    if (!record) return '';
    return record[field.apiKey];
}

// A record is "complete" (drops off "Traslados en captura") once every one
// of the 23 fields has a value.
function isRecordComplete(record) {
    return FIELDS.every((f) => isFieldFilled(fieldValueFromRecord(f, record)));
}
function activeRecords() {
    return records.filter((r) => !isRecordComplete(r));
}
function recordLabel(record) {
    if (record.serviceClient) return record.serviceClient;
    if (!record.id) return t('home.trasladoNewButton');
    return `${t('home.trasladoFallbackLabel')} #${record.id}`;
}
function recordDoneCount(record) {
    return FIELDS.filter((f) => isFieldFilled(fieldValueFromRecord(f, record))).length;
}

// --- Data loading ------------------------------------------------------
async function loadRecords() {
    try {
        const res = await fetch(apiUrl('/api/business/transfers'), { credentials: 'include' });
        if (!res.ok) return;
        const { transfers } = await res.json();
        records = transfers || [];
    } catch {
        records = [];
    }
}

// --- Create + patch ---------------------------------------------------------
function createNewTransfer() {
    draftRecord = blankDraftRecord();
    openRecordId = null;
    view = 'record';
    render();
}

const offlinePendingRecordIds = new Set();
async function refreshOfflinePendingIds() {
    const items = await window.SgnOfflineSync.listOfflineQueue();
    offlinePendingRecordIds.clear();
    items.forEach((item) => { if (item.recordKey) offlinePendingRecordIds.add(item.recordKey); });
    render();
}
document.addEventListener('sgn:offline-queue-changed', refreshOfflinePendingIds);

async function patchRecord(id, patch) {
    const recordKey = `${TABLE_KEY}:${id}`;
    const before = currentRecord() || {};
    const description = `${t('menu.opTransVolNuestrosTraslados')} · ${recordLabel(before)}`;
    const baseline = {};
    Object.keys(patch).forEach((key) => { baseline[key] = before[key]; });
    try {
        const result = await window.SgnOfflineSync.offlineAwareFetch(
            `/api/business/transfers/${id}`,
            { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(patch) },
            description, recordKey, baseline,
        );
        if (result.queued) {
            const idx = records.findIndex((r) => r.id === id);
            if (idx !== -1) records[idx] = { ...records[idx], ...patch };
            offlinePendingRecordIds.add(recordKey);
            showToast(t('home.cargaSavedOffline'));
            render();
            return;
        }
        const body = result.body;
        if (!result.ok) {
            showToast(body.message || t('admin.saveError'));
            await loadRecords();
            render();
            return;
        }
        if (body.rejectedFields?.length) {
            showToast(`${t('main.fieldLocked')}: ${body.rejectedFields.map((fk) => t(fk)).join(', ')}`);
        } else if (body.pendingFields?.length) {
            showToast(`${t('main.changePending')}: ${body.pendingFields.map((fk) => t(fk)).join(', ')}`);
        }
        const idx = records.findIndex((r) => r.id === id);
        if (idx !== -1) records[idx] = body.transfer;
        render();
    } catch {
        showToast(t('admin.saveError'));
    }
}

// --- Rendering -------------------------------------------------------------
const progressTrack = document.getElementById('carga-progress-track');
const progressFill = document.getElementById('carga-progress-fill');
const progressLabel = document.getElementById('carga-progress-label');
const titleEl = document.getElementById('carga-title');
const bodyEl = document.getElementById('carga-body');

function render() {
    bodyEl.innerHTML = '';
    if (view === 'list') renderListView();
    else renderFormView();
}

function renderListView() {
    titleEl.textContent = t('menu.opTransVolNuestrosTraslados');
    progressTrack.hidden = true;
    progressLabel.hidden = true;

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'home-carga-new-btn';
    newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${t('home.trasladoNewButton')}</span>`;
    newBtn.addEventListener('click', createNewTransfer);
    bodyEl.appendChild(newBtn);

    const label = document.createElement('div');
    label.className = 'home-picker-section-label';
    label.textContent = t('home.trasladoActiveSection');
    bodyEl.appendChild(label);

    const active = activeRecords();
    if (!active.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('home.trasladoActiveEmpty');
        bodyEl.appendChild(empty);
        return;
    }
    active.forEach((record) => {
        const done = recordDoneCount(record);
        const total = FIELDS.length;
        const pct = Math.round((done / total) * 100);
        const offlineBadge = offlinePendingRecordIds.has(`${TABLE_KEY}:${record.id}`)
            ? `<span class="home-carga-offline-badge" title="${t('home.cargaSavedOffline')}"><i class="bx bx-cloud-upload" aria-hidden="true"></i></span>`
            : '';
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx bx-transfer-alt" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label"><p>${recordLabel(record)}</p><span>${t('home.cargaFieldsCount', { done, total })}</span></span>
            ${offlineBadge}
            <span class="home-carga-active-row-progress" style="--pct:${pct}"><span>${pct}%</span></span>
        `;
        row.addEventListener('click', () => { openRecordId = record.id; view = 'record'; render(); });
        bodyEl.appendChild(row);
    });
}

function currentRecord() {
    if (draftRecord) return draftRecord;
    return records.find((r) => r.id === openRecordId);
}

function renderFormView() {
    const record = currentRecord();
    const done = recordDoneCount(record);
    const total = FIELDS.length;
    titleEl.textContent = recordLabel(record);
    progressTrack.hidden = false;
    progressLabel.hidden = false;
    progressFill.style.width = `${Math.round((done / total) * 100)}%`;
    progressLabel.textContent = t('home.cargaFieldsCount', { done, total });

    GROUPS.forEach((group) => {
        const groupDone = group.fields.filter((f) => isFieldFilled(fieldValueFromRecord(f, record))).length;
        const header = document.createElement('div');
        header.className = 'home-carga-group-header';
        header.innerHTML = `<i class="bx ${group.icon}" aria-hidden="true"></i><span class="home-carga-group-label">${t(group.labelKey)}</span><span class="home-carga-group-tag">${groupDone}/${group.fields.length}</span>`;
        bodyEl.appendChild(header);
        group.fields.forEach((field) => bodyEl.appendChild(buildFieldEl(field, record)));
    });

    const allDone = done === total;
    const doneCard = document.createElement('div');
    doneCard.className = `home-carga-done-card${allDone ? ' show' : ''}`;
    doneCard.innerHTML = `<i class="bx bx-check-circle" aria-hidden="true"></i><p>${t('home.cargaAllDone')}</p><button type="button" id="carga-save-btn">${t('home.cargaSaveBtn')}</button>`;
    bodyEl.appendChild(doneCard);
    if (allDone) {
        doneCard.querySelector('#carga-save-btn').addEventListener('click', () => {
            view = 'list';
            render();
        });
    }
}

function fieldPreviewText(field, record) {
    const value = fieldValueFromRecord(field, record);
    if (field.type === 'select') {
        for (const grp of field.optionGroups) {
            const opt = grp.options.find((o) => o.value === value);
            if (opt) return opt.labelKey ? t(opt.labelKey) : opt.label;
        }
    }
    return String(value);
}

const expandedFieldIds = new Set();

function openSheetForField(field, record) {
    const currentValue = fieldValueFromRecord(field, record) || '';
    openSelectSheet(t(field.labelKey), field.optionGroups, currentValue, (value) => commitFieldValue(field, value));
}

function buildFieldEl(field, record) {
    const done = isFieldFilled(fieldValueFromRecord(field, record));
    const expanded = expandedFieldIds.has(field.id);

    const wrap = document.createElement('div');
    wrap.className = `home-carga-field${done ? ' home-carga-field-done' : ''}`;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'home-carga-field-row';
    const subtitle = done ? fieldPreviewText(field, record) : t(field.hintKey);
    let trailing = '<i class="bx bx-chevron-down home-carga-field-trailing"></i>';
    if (done) trailing = '<i class="bx bx-edit home-carga-field-trailing"></i>';
    else if (expanded) trailing = '<i class="bx bx-chevron-down home-carga-field-trailing icon-up"></i>';
    row.innerHTML = `
        <span class="home-carga-field-icon"><i class="bx ${field.icon}" aria-hidden="true"></i></span>
        <span class="home-carga-field-label"><p>${t(field.labelKey)}</p><span>${subtitle}</span></span>
        ${trailing}
    `;
    row.addEventListener('click', () => {
        if (field.type === 'select') { openSheetForField(field, record); return; }
        if (expandedFieldIds.has(field.id)) expandedFieldIds.delete(field.id);
        else expandedFieldIds.add(field.id);
        render();
    });
    wrap.appendChild(row);

    if (expanded && field.type !== 'select') wrap.appendChild(buildFieldBody(field, record));
    return wrap;
}

// The FIRST confirm on a draft is what actually creates the record on the
// server, then immediately applies this same field -- every confirm after
// that is a normal patch.
async function commitFieldValue(field, value) {
    expandedFieldIds.delete(field.id);
    const isRequestNew = field.id === 'clientType' && value === REQUEST_NEW_CLIENT_TYPE;
    if (draftRecord) {
        try {
            const res = await fetch(apiUrl('/api/business/transfers'), { method: 'POST', credentials: 'include' });
            if (!res.ok) throw new Error('create failed');
            const { transfer } = await res.json();
            records.push(transfer);
            openRecordId = transfer.id;
            draftRecord = null;
            // A brand new draft's very first tap could be "+ Solicitar nuevo
            // Tipo Cliente" -- the record above still had to be created for
            // real first (same as any other first field), so the request
            // has a real sourceRecordId to attach to.
            if (isRequestNew) { openCatalogRequestSheet(transfer); render(); return; }
            await patchRecord(transfer.id, { [field.apiKey]: value });
        } catch {
            showToast(t('admin.saveError'));
            draftRecord = null;
            view = 'list';
            render();
        }
        return;
    }
    if (isRequestNew) { openCatalogRequestSheet(currentRecord()); return; }
    patchRecord(openRecordId, { [field.apiKey]: value });
}

// "+ Solicitar nuevo Tipo Cliente" -- a small sheet (same visual language as
// openSelectSheet) asking just for the new value's name; POSTs to the same
// generic /api/business/catalog-requests every "+ Solicitar nuevo X" button
// uses (see Dashboard.js's own openCatalogRequestModal for the Web
// equivalent), routed to the requester's own Jefe Directo server-side.
function openCatalogRequestSheet(record) {
    const scrim = document.createElement('div');
    scrim.className = 'home-select-scrim';
    const sheet = document.createElement('div');
    sheet.className = 'home-select-sheet';
    sheet.appendChild(Object.assign(document.createElement('div'), { className: 'home-select-sheet-handle' }));
    const title = document.createElement('div');
    title.className = 'home-select-sheet-title';
    title.textContent = t('main.requestCatalogAdd', { label: t('menu.catTransVolTiposCliente') });
    sheet.appendChild(title);

    const body = document.createElement('div');
    body.className = 'home-carga-field-body';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = t('main.requestCatalogNameLabel');
    const error = document.createElement('p');
    error.className = 'home-carga-field-error';
    error.textContent = t('login.fieldRequired');
    const hint = document.createElement('p');
    hint.className = 'home-carga-field-error'; // reused purely for its small/muted styling, never toggled .show
    hint.style.color = 'var(--home-text-muted)';
    hint.textContent = t('main.requestCatalogHint');
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'home-carga-field-confirm';
    confirmBtn.textContent = t('main.requestCatalogSubmit');
    confirmBtn.addEventListener('click', async () => {
        const requestedName = input.value.trim();
        if (!requestedName) { error.classList.add('show'); return; }
        confirmBtn.disabled = true;
        try {
            const res = await fetch(apiUrl('/api/business/catalog-requests'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    categoryType: 'tipos-cliente', requestedName,
                    sourceTableKey: TABLE_KEY, sourceRecordId: record.id, sourceFieldKey: 'clientType',
                }),
            });
            if (!res.ok) throw new Error('request failed');
            scrim.remove();
            showToast(t('main.requestCatalogSent'));
        } catch {
            showToast(t('admin.saveError'));
        } finally {
            confirmBtn.disabled = false;
        }
    });
    body.append(input, error, hint, confirmBtn);
    sheet.appendChild(body);

    scrim.addEventListener('click', (event) => { if (event.target === scrim) scrim.remove(); });
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
}

function openSelectSheet(titleText, optionGroups, currentValue, onPick) {
    const scrim = document.createElement('div');
    scrim.className = 'home-select-scrim';
    const sheet = document.createElement('div');
    sheet.className = 'home-select-sheet';
    sheet.appendChild(Object.assign(document.createElement('div'), { className: 'home-select-sheet-handle' }));
    const title = document.createElement('div');
    title.className = 'home-select-sheet-title';
    title.textContent = titleText;
    sheet.appendChild(title);
    optionGroups.forEach((grp, i) => {
        if (i > 0) sheet.appendChild(Object.assign(document.createElement('div'), { className: 'home-select-divider' }));
        if (grp.labelKey) {
            const label = document.createElement('div');
            label.className = 'home-select-group-label';
            label.textContent = t(grp.labelKey);
            sheet.appendChild(label);
        }
        grp.options.forEach((opt) => {
            const isActive = opt.value === currentValue;
            const text = opt.labelKey ? t(opt.labelKey) : (opt.label || '');
            const optBtn = document.createElement('button');
            optBtn.type = 'button';
            optBtn.className = `home-select-option${grp.labelKey ? ' indent' : ''}${isActive ? ' active' : ''}`;
            optBtn.innerHTML = `<span>${text}</span>${isActive ? '<i class="bx bx-check" aria-hidden="true"></i>' : ''}`;
            optBtn.addEventListener('click', () => {
                scrim.remove();
                onPick(opt.value);
            });
            sheet.appendChild(optBtn);
        });
    });
    scrim.addEventListener('click', (event) => { if (event.target === scrim) scrim.remove(); });
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
}

function buildFieldBody(field, record) {
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'home-carga-field-body';

    const input = document.createElement('input');
    input.type = field.type;
    input.value = fieldValueFromRecord(field, record) || '';
    input.placeholder = t(field.hintKey);
    const error = document.createElement('p');
    error.className = 'home-carga-field-error';
    error.textContent = t('login.fieldRequired');
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'home-carga-field-confirm';
    confirmBtn.textContent = t('home.cargaConfirm');
    confirmBtn.addEventListener('click', () => {
        if (!String(input.value).trim()) {
            error.classList.add('show');
            return;
        }
        commitFieldValue(field, input.value.trim());
    });
    bodyWrap.append(input, error, confirmBtn);
    return bodyWrap;
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') {
        window.location.href = 'AppInicio.html';
        return;
    }
    // Backing out of a still-blank draft discards it -- nothing was ever
    // persisted, so there's nothing to keep.
    draftRecord = null;
    view = 'list';
    render();
});

(async function init() {
    await loadLanguage();
    try {
        const meRes = await fetch(apiUrl('/api/me'), { credentials: 'include' });
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        currentUser = user;
        await Promise.all([loadRecords(), loadBrandingForTheme(), loadUnitTypeOptions(), loadQuoteOptions(), loadTiposClienteOptions()]);
        applyStyle(getStoredStyle());
        await refreshOfflinePendingIds();
    } catch (err) {
        console.error('Nuestros Traslados (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
