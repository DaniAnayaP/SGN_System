// ---------------------------------------------------------------------------
// Carga Combustible (App) — a practical, one-field-at-a-time form instead of
// Sistema Web's table (see OpTransVolCargaCombustible.js for the desktop
// version of this same data, same /api/business/fuel-loading-records
// backend). Two screens: the list of active (not-yet-complete) cargas + "+
// Nueva Carga", and the field-by-field form for whichever carga is open.
//
// "+ Nueva Carga" creates a real, blank record immediately (a real id from
// the very first tap) — every one of its 12 fields, identifying ones
// included, is then filled in one at a time via PATCH, each going through
// the exact same column-level permission/pending-approval workflow as every
// other table in this app (checkAndLogFieldChanges): confirming a field you
// have ver-y-operar/editar on saves it right away and locks it; touching an
// already-saved field again only works with editar, and goes to whoever
// holds Autorizar on that column instead of applying immediately. Nothing
// is ever held only in memory — leaving mid-way keeps everything already
// confirmed, exactly as-is, ready to resume from "Cargas activas". Each
// field also locks until its own Regla de Orden de Llenado gate (if any) is
// filled — same enforcement model as the desktop table's own 🔗 icon
// (applyFieldFillRules), just read directly here instead of through a
// <table> cell. With no rules configured (the default), every field starts
// open — filling in any subset of them is always valid progress, never
// all-or-nothing.
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

// Same shape as AppInicio.js's own showToast (icon, message, close X, timed
// progress bar) — duplicated rather than shared, same convention every
// other App page this session follows (plain <script> tags, no modules).
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

// --- Estilo (theme) — same mechanism as AppInicio.js, applied here too so
// switching styles there is reflected consistently across every App page. --
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
        const res = await fetch('/api/business/branding', { credentials: 'include' });
        if (!res.ok) return;
        const { branding } = await res.json();
        clientColorPalette = branding.colorPalette || null;
        clientPrimaryColor = branding.primaryColor || null;
        if (getStoredStyle() === 'institutional') applyInstitutionalTheme();
    } catch {
        // Falls back to the static per-theme CSS already applied.
    }
}

// --- Field catalog -----------------------------------------------------
// Every field's apiKey matches a real FUEL_LOADING_PATCHABLE_FIELDS key in
// db.js — including the identifying ones and centroCostos, all uniformly
// PATCHable now (see the file header note above).
const FIELDS = [
    { id: 'date', group: 'ident', apiKey: 'date', labelKey: 'main.colCargaFechaRegistro', hintKey: 'home.cargaHintFecha', type: 'date', icon: 'bx-calendar', colId: 'colCargaFechaRegistro' },
    { id: 'loadSite', group: 'ident', apiKey: 'loadSite', labelKey: 'main.colCargaSitio', hintKey: 'home.cargaHintSitio', type: 'text', icon: 'bx-pin', colId: 'colCargaSitio' },
    { id: 'operator', group: 'ident', apiKey: 'operator', labelKey: 'main.colCargaOperador', hintKey: 'home.cargaHintOperador', type: 'text', icon: 'bx-user', colId: 'colCargaOperador', autoFill: true },
    { id: 'coordinator', group: 'ident', apiKey: 'coordinator', labelKey: 'main.colCargaCoordinador', hintKey: 'home.cargaHintCoordinador', type: 'text', icon: 'bx-user-check', colId: 'colCargaCoordinador' },
    { id: 'ecoUnit', group: 'ident', apiKey: 'ecoUnit', labelKey: 'main.colCargaEcoUnidad', hintKey: 'home.cargaHintEcoUnidad', type: 'text', icon: 'bx-id-card', colId: 'colCargaEcoUnidad' },
    {
        id: 'fuelType', group: 'ident', apiKey: 'fuelType', labelKey: 'main.colFuelType', hintKey: 'home.cargaHintTipoCombustible', type: 'select', icon: 'bx-gas-pump', colId: 'colFuelType',
        optionGroups: [
            { labelKey: 'main.fuelTypeGasolineGroup', options: [{ value: 'magna', labelKey: 'main.fuelTypeMagna' }, { value: 'premium', labelKey: 'main.fuelTypePremium' }] },
            { options: [{ value: 'diesel', labelKey: 'main.fuelTypeDiesel' }] },
        ],
    },
    { id: 'centroCostos', group: 'ident', apiKey: 'centroCostos', labelKey: 'main.colSysCentroCostos', hintKey: 'home.cargaHintCentroCostos', type: 'costCenter', icon: 'bx-purchase-tag-alt', colId: 'colSysCentroCostos' },
    { id: 'tripBefore', group: 'op', apiKey: 'tripBefore', labelKey: 'main.colCargaTripAntes', hintKey: 'home.cargaHintTripAntes', type: 'number', icon: 'bx-tachometer', colId: 'colCargaTripAntes' },
    { id: 'tripBeforeEvidence', group: 'op', apiKey: 'tripBeforeEvidence', labelKey: 'main.colCargaTripAntesEvidencia', hintKey: 'home.cargaHintFoto', type: 'photo', icon: 'bx-camera', colId: 'colCargaTripAntesEvidencia' },
    { id: 'tripAfter', group: 'op', apiKey: 'tripAfter', labelKey: 'main.colCargaTripDespues', hintKey: 'home.cargaHintTripDespues', type: 'number', icon: 'bx-tachometer', colId: 'colCargaTripDespues' },
    { id: 'tripAfterEvidence', group: 'op', apiKey: 'tripAfterEvidence', labelKey: 'main.colCargaTripDespuesEvidencia', hintKey: 'home.cargaHintFoto', type: 'photo', icon: 'bx-camera', colId: 'colCargaTripDespuesEvidencia' },
    { id: 'totalCost', group: 'op', apiKey: 'totalCost', labelKey: 'main.colCargaCostoTotal', hintKey: 'home.cargaHintCosto', type: 'number', icon: 'bx-dollar-circle', colId: 'colCargaCostoTotal' },
    { id: 'totalCostEvidence', group: 'op', apiKey: 'totalCostEvidence', labelKey: 'main.colCargaCostoTotalEvidencia', hintKey: 'home.cargaHintTicket', type: 'photo', icon: 'bx-receipt', colId: 'colCargaCostoTotalEvidencia' },
];
const IDENT_FIELDS = FIELDS.filter((f) => f.group === 'ident');
const OP_FIELDS = FIELDS.filter((f) => f.group === 'op');
const GROUPS = [
    { key: 'ident', icon: 'bx-id-card', labelKey: 'home.cargaGroupIdent', fields: IDENT_FIELDS },
    { key: 'op', icon: 'bx-gas-pump', labelKey: 'home.cargaGroupOp', fields: OP_FIELDS },
];

// --- App state -----------------------------------------------------------
let currentUser = null;
let currentNickname = '';
let costCenters = []; // this user's own accessible cost centers
let gateMap = {}; // dependentColId -> gateColId, authorized rules only
let records = []; // real, persisted fuel-loading-records from the server
let openRecordId = null; // id of the record currently open, or null
let view = 'list'; // 'list' | 'record'

function isFieldFilled(value) {
    return value !== null && value !== undefined && value !== '' && value !== 0;
}
// Centro de Costos has no column of its own in the API response — the
// server flattens it into colSysCentroCostos (Control Interno), same as
// every other table on this system.
function fieldValueFromRecord(field, record) {
    if (!record) return '';
    if (field.id === 'centroCostos') return record.colSysCentroCostos || '';
    return record[field.apiKey];
}

// --- Permission plumbing (mirrors AppInicio.js's own, duplicated since this
// is a separate page/script with no shared module scope) ------------------
let effectiveGrants = [];
let isClientAdmin = false;
function isUnrestrictedClientAdmin() {
    return isClientAdmin && effectiveGrants.length === 0;
}
function hasCostCenterPermission(ccId) {
    if (isUnrestrictedClientAdmin()) return true;
    return effectiveGrants.some((g) => g.sectionId === 'main' && g.itemId === 'cc-list' && g.submenuId === `cc-${ccId}`);
}

async function loadGateMap() {
    try {
        const res = await fetch('/api/business/field-fill-rules?tableKey=carga-combustible', { credentials: 'include' });
        if (!res.ok) return;
        const { rules } = await res.json();
        const map = {};
        (rules || []).filter((r) => r.authorized).forEach((r) => { map[r.dependentCol] = r.gateCol; });
        gateMap = map;
    } catch {
        gateMap = {};
    }
}

function fieldValueForGateCheck(colId, record) {
    const field = FIELDS.find((f) => f.colId === colId);
    if (!field) return true; // an unknown gate column can never block anything
    return isFieldFilled(fieldValueFromRecord(field, record));
}
function isFieldUnlocked(field, record) {
    const gateColId = gateMap[field.colId];
    if (!gateColId) return true;
    return fieldValueForGateCheck(gateColId, record);
}

// A record is "complete" (drops off Cargas activas) once every field —
// identifying ones included — has a value. With no rules configured that's
// entirely up to whoever's filling it in; nothing forces an order.
function isRecordComplete(record) {
    return FIELDS.every((f) => isFieldFilled(fieldValueFromRecord(f, record)));
}
function activeRecords() {
    return records.filter((r) => !isRecordComplete(r));
}
function recordLabel(record) {
    if (record.loadSite && record.ecoUnit) return `${record.loadSite} · ${record.ecoUnit}`;
    if (record.loadSite) return record.loadSite;
    return `${t('home.cargaFallbackLabel')} #${record.recordNumber}`;
}
function recordDoneCount(record) {
    return FIELDS.filter((f) => isFieldFilled(fieldValueFromRecord(f, record))).length;
}

// --- Data loading ----------------------------------------------------------
async function loadRecords() {
    try {
        const res = await fetch('/api/business/fuel-loading-records', { credentials: 'include' });
        if (!res.ok) return;
        const { records: rows } = await res.json();
        records = rows || [];
    } catch {
        records = [];
    }
}
async function loadCostCenters() {
    try {
        const res = await fetch('/api/business/cost-centers', { credentials: 'include' });
        if (!res.ok) return;
        const { costCenters: rows } = await res.json();
        costCenters = (rows || []).filter((cc) => hasCostCenterPermission(cc.id));
    } catch {
        costCenters = [];
    }
}

// --- Create + patch ---------------------------------------------------------
// "+ Nueva Carga" creates the real record right away (see db.js's own note
// on createFuelLoadingRecord) — Operador (and Centro de Costos, when this
// user only has one) are then auto-patched immediately after, same
// "por default debe aparecer" convenience as before, just genuinely
// persisted now instead of held locally until some later batch save.
async function createNewCarga() {
    if (!costCenters.length) {
        showToast(t('home.cargaNoCostCenter'));
        return;
    }
    try {
        const res = await fetch('/api/business/fuel-loading-records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error('create failed');
        const { record } = await res.json();
        records.push(record);
        openRecordId = record.id;
        view = 'record';
        render();
        const autoPatch = {
            operator: currentNickname ? `${currentUser.name} (${currentNickname})` : (currentUser?.name || ''),
        };
        if (costCenters.length === 1) {
            const cc = costCenters[0];
            autoPatch.centroCostos = `${cc.code} - ${cc.name}`;
        }
        await patchRecord(record.id, autoPatch);
    } catch {
        showToast(t('admin.saveError'));
    }
}

async function patchRecord(id, patch) {
    try {
        const res = await fetch(`/api/business/fuel-loading-records/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
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
        if (idx !== -1) records[idx] = body.record;
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
    titleEl.textContent = t('menu.opTransVolCargaCombustible');
    progressTrack.hidden = true;
    progressLabel.hidden = true;

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'home-carga-new-btn';
    newBtn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${t('home.cargaNewButton')}</span>`;
    newBtn.addEventListener('click', createNewCarga);
    bodyEl.appendChild(newBtn);

    const label = document.createElement('div');
    label.className = 'home-picker-section-label';
    label.textContent = t('home.cargaActiveSection');
    bodyEl.appendChild(label);

    const active = activeRecords();
    if (!active.length) {
        const empty = document.createElement('p');
        empty.className = 'home-carga-empty-note';
        empty.textContent = t('home.cargaActiveEmpty');
        bodyEl.appendChild(empty);
        return;
    }
    active.forEach((record) => {
        const done = recordDoneCount(record);
        const total = FIELDS.length;
        const pct = Math.round((done / total) * 100);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'home-carga-active-row';
        row.innerHTML = `
            <span class="home-carga-active-row-icon"><i class="bx bx-gas-pump" aria-hidden="true"></i></span>
            <span class="home-carga-active-row-label"><p>${recordLabel(record)}</p><span>${t('home.cargaFieldsCount', { done, total })}</span></span>
            <span class="home-carga-active-row-progress" style="--pct:${pct}"><span>${pct}%</span></span>
        `;
        row.addEventListener('click', () => { openRecordId = record.id; view = 'record'; render(); });
        bodyEl.appendChild(row);
    });
}

function currentRecord() {
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
    if (field.type === 'photo') return t('home.cargaPhotoAttached');
    if (field.type === 'select') {
        for (const grp of field.optionGroups) {
            const opt = grp.options.find((o) => o.value === value);
            if (opt) return t(opt.labelKey);
        }
    }
    if (field.type === 'date' && value) {
        const d = new Date(`${value}T00:00:00`);
        return d.toLocaleDateString(document.documentElement.lang === 'es' ? 'es-MX' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return String(value);
}

const expandedFieldIds = new Set();

function buildFieldEl(field, record) {
    const done = isFieldFilled(fieldValueFromRecord(field, record));
    const unlocked = isFieldUnlocked(field, record);
    const expanded = expandedFieldIds.has(field.id);

    const wrap = document.createElement('div');
    wrap.className = `home-carga-field${!unlocked ? ' home-carga-field-locked' : ''}${done ? ' home-carga-field-done' : ''}`;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'home-carga-field-row';
    const autoTag = field.autoFill && done ? `<span class="home-carga-field-auto-tag">${t('home.cargaAutoTag')}</span>` : '';
    const subtitle = done ? fieldPreviewText(field, record) : (unlocked ? t(field.hintKey) : t('home.cargaLocked'));
    let trailing = '<i class="bx bx-chevron-down home-carga-field-trailing"></i>';
    if (!unlocked) trailing = '<i class="bx bx-lock-alt home-carga-field-trailing"></i>';
    else if (done) trailing = '<i class="bx bx-edit home-carga-field-trailing"></i>';
    else if (expanded) trailing = '<i class="bx bx-chevron-down home-carga-field-trailing icon-up"></i>';
    row.innerHTML = `
        <span class="home-carga-field-icon"><i class="bx ${field.icon}" aria-hidden="true"></i></span>
        <span class="home-carga-field-label"><p>${t(field.labelKey)}${autoTag}</p><span>${subtitle}</span></span>
        ${trailing}
    `;
    if (unlocked) {
        row.addEventListener('click', () => {
            if (expandedFieldIds.has(field.id)) expandedFieldIds.delete(field.id);
            else expandedFieldIds.add(field.id);
            render();
        });
    } else {
        row.disabled = true;
    }
    wrap.appendChild(row);

    if (unlocked && expanded) {
        wrap.appendChild(buildFieldBody(field, record));
    }
    return wrap;
}

// ecoUnit -> fuelType lookup (Nuestras Unidades), built once at init — open/
// never blocking (confirmed product decision): an Económico with no match
// just yields no suggestion, the field stays a normal manual pick.
let fleetFuelSuggestions = {};
async function loadFleetFuelSuggestions() {
    try {
        const res = await fetch('/api/business/fleet-units', { credentials: 'include' });
        if (!res.ok) return;
        const { fleetUnits } = await res.json();
        const map = {};
        (fleetUnits || []).forEach((u) => {
            if (u.ecoId && u.fuelType) map[u.ecoId.trim().toLowerCase()] = u.fuelType;
        });
        fleetFuelSuggestions = map;
    } catch {
        fleetFuelSuggestions = {};
    }
}

// Every confirm — identifying field or Operación field alike — is a real
// PATCH the moment it happens. Whether it actually applies, goes pending,
// or gets rejected is entirely the server's call (checkAndLogFieldChanges),
// same as it's always been for Trip antes/después/Costo Total. Confirming
// Económico also bundles a Tipo Combustible SUGGESTION in the same PATCH
// when Nuestras Unidades has a match and the field is still empty — still
// goes through the normal empty->filled permission check, just like any
// other confirm; never overwrites a value already set.
function commitFieldValue(field, value) {
    expandedFieldIds.delete(field.id);
    const patch = { [field.apiKey]: value };
    if (field.id === 'ecoUnit') {
        const suggestion = fleetFuelSuggestions[String(value).trim().toLowerCase()];
        const record = currentRecord();
        if (suggestion && !fieldValueFromRecord(FIELDS.find((f) => f.id === 'fuelType'), record)) {
            patch.fuelType = suggestion;
        }
    }
    patchRecord(openRecordId, patch);
}

// Positions a .home-select-options panel (position:fixed, see AppInicio.css)
// right below its own trigger, flipping above it when there isn't enough
// room below (a field near the bottom of a long form) -- and closes it on
// scroll, since a fixed-position panel doesn't move with the page and would
// otherwise visually detach from the trigger it belongs to.
function openFloatingOptions(trigger, options) {
    const rect = trigger.getBoundingClientRect();
    options.style.left = `${rect.left}px`;
    options.style.width = `${rect.width}px`;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 200 && rect.top > spaceBelow) {
        options.style.bottom = `${window.innerHeight - rect.top + 4}px`;
        options.style.top = '';
    } else {
        options.style.top = `${rect.bottom + 4}px`;
        options.style.bottom = '';
    }
    options.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    window.addEventListener('scroll', () => closeFloatingOptions(trigger, options), { capture: true, once: true });
}
function closeFloatingOptions(trigger, options) {
    options.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
}

function buildFieldBody(field, record) {
    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'home-carga-field-body';

    if (field.type === 'photo') {
        const row = document.createElement('div');
        row.className = 'home-carga-photo-row';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'home-carga-photo-btn';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.hidden = true;
        const hasPhoto = isFieldFilled(fieldValueFromRecord(field, record));
        btn.innerHTML = `<i class="bx bx-camera" aria-hidden="true"></i><span>${hasPhoto ? t('home.cargaChangePhoto') : t('home.cargaTakePhoto')}</span>`;
        btn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => commitFieldValue(field, reader.result);
            reader.readAsDataURL(file);
        });
        row.append(btn, fileInput);
        bodyWrap.appendChild(row);
        return bodyWrap;
    }

    if (field.type === 'select') {
        const currentValue = fieldValueFromRecord(field, record) || '';
        const selectedOpt = field.optionGroups.flatMap((g) => g.options).find((o) => o.value === currentValue);

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'home-select-trigger';
        trigger.setAttribute('aria-expanded', 'false');
        const valueSpan = document.createElement('span');
        valueSpan.className = `home-select-trigger-value${selectedOpt ? '' : ' placeholder'}`;
        valueSpan.textContent = selectedOpt ? t(selectedOpt.labelKey) : t('main.fuelTypeSelect');
        trigger.innerHTML = `
            <span class="home-select-trigger-text">
                <span class="home-select-trigger-label">${t(field.labelKey)}</span>
            </span>
            <i class="bx bx-chevron-down" aria-hidden="true"></i>
        `;
        trigger.querySelector('.home-select-trigger-text').appendChild(valueSpan);

        const options = document.createElement('div');
        options.className = 'home-select-options';
        options.hidden = true;
        field.optionGroups.forEach((grp, i) => {
            if (i > 0) options.appendChild(Object.assign(document.createElement('div'), { className: 'home-select-divider' }));
            if (grp.labelKey) {
                const label = document.createElement('div');
                label.className = 'home-select-group-label';
                label.textContent = t(grp.labelKey);
                options.appendChild(label);
            }
            grp.options.forEach((opt) => {
                const isActive = opt.value === currentValue;
                const optBtn = document.createElement('button');
                optBtn.type = 'button';
                optBtn.className = `home-select-option${grp.labelKey ? ' indent' : ''}${isActive ? ' active' : ''}`;
                optBtn.innerHTML = `<span>${t(opt.labelKey)}</span>${isActive ? '<i class="bx bx-check" aria-hidden="true"></i>' : ''}`;
                optBtn.addEventListener('click', () => {
                    closeFloatingOptions(trigger, options);
                    commitFieldValue(field, opt.value);
                });
                options.appendChild(optBtn);
            });
        });
        trigger.addEventListener('click', () => {
            if (!options.hidden) closeFloatingOptions(trigger, options);
            else openFloatingOptions(trigger, options);
        });
        const fieldWrap = document.createElement('div');
        fieldWrap.className = 'home-select-field';
        fieldWrap.append(trigger, options);
        bodyWrap.appendChild(fieldWrap);
        return bodyWrap;
    }

    if (field.type === 'costCenter') {
        if (!costCenters.length) {
            const err = document.createElement('p');
            err.className = 'home-carga-field-error show';
            err.textContent = t('admin.costCenterRequiredForRecord');
            bodyWrap.appendChild(err);
            return bodyWrap;
        }
        const select = document.createElement('select');
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = t('main.newRecordCostCenterPlaceholder');
        select.appendChild(placeholder);
        const currentValue = fieldValueFromRecord(field, record);
        costCenters.forEach((cc) => {
            const opt = document.createElement('option');
            const label = `${cc.code} - ${cc.name}`;
            opt.value = label;
            opt.textContent = label;
            select.appendChild(opt);
        });
        select.value = currentValue || '';
        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.className = 'home-carga-field-confirm';
        confirmBtn.textContent = t('home.cargaConfirm');
        confirmBtn.addEventListener('click', () => {
            if (!select.value) return;
            commitFieldValue(field, select.value);
        });
        bodyWrap.append(select, confirmBtn);
        return bodyWrap;
    }

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
        commitFieldValue(field, field.type === 'number' ? parseFloat(input.value) || 0 : input.value.trim());
    });
    bodyWrap.append(input, error, confirmBtn);
    return bodyWrap;
}

document.getElementById('carga-back').addEventListener('click', () => {
    if (view === 'list') {
        window.location.href = 'AppInicio.html';
        return;
    }
    // Nothing is ever held only in memory anymore — every confirmed field
    // is already saved, so leaving mid-way loses nothing and needs no
    // discard prompt.
    view = 'list';
    render();
});

(async function init() {
    await loadLanguage();
    try {
        const [meRes, profileRes, businessProfileRes] = await Promise.all([
            fetch('/api/me', { credentials: 'include' }),
            fetch('/api/me/profile', { credentials: 'include' }),
            fetch('/api/me/business-profile', { credentials: 'include' }),
        ]);
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        currentUser = user;
        isClientAdmin = !!user?.isClientAdmin;
        if (profileRes.ok) {
            const { profile } = await profileRes.json();
            currentNickname = profile?.nickname || '';
        }
        if (businessProfileRes.ok) {
            const { profile } = await businessProfileRes.json();
            effectiveGrants = profile?.effectiveGrants || [];
        }
        await Promise.all([loadCostCenters(), loadGateMap(), loadRecords(), loadFleetFuelSuggestions(), loadBrandingForTheme()]);
        applyStyle(getStoredStyle());
        render();
    } catch (err) {
        console.error('Carga Combustible (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
