// ---------------------------------------------------------------------------
// "Reglas de Orden de Llenado" (Gestión) — concentrates every fill-order
// rule from every table into one screen. A rule is also creatable from each
// table's own 🔗 toolbar icon (see Dashboard.js's openFieldRulesModal) —
// both places read/write the same field_fill_rules records, so a rule
// created either way shows up in both. Only an AUTHORIZED rule actually
// locks anything on its table (see Dashboard.js's applyFieldFillRules);
// authorizing only happens here.
// ---------------------------------------------------------------------------

const newBtn = document.getElementById('fr-new-btn');
const tableBody = document.getElementById('fr-table-body');
const emptyMsg = document.getElementById('fr-empty');

let rules = [];

// Which page backs which table key — low-churn (pages rarely move), unlike
// each page's own column list, which is fetched live from that page's own
// HTML (see fetchTableColumns below) so it can never drift out of sync the
// way a hand-maintained column list would.
const DATA_TABLE_PAGES = [
    { tableKey: 'registro-combustible', labelKey: 'menu.opTransVolCombustible', page: 'OpTransVolCombustible.html' },
    { tableKey: 'carga-combustible', labelKey: 'menu.opTransVolCargaCombustible', page: 'OpTransVolCargaCombustible.html' },
    { tableKey: 'tipos-unidad', labelKey: 'menu.catTransVolTiposUnidades', page: 'CatTransVolTiposUnidades.html' },
    { tableKey: 'nuestras-unidades', labelKey: 'menu.opTransVolNuestrasUnidades', page: 'OpTransVolNuestrasUnidades.html' },
    { tableKey: 'centros-costo', labelKey: 'business.costCentersTitle', page: 'Business-CentrosCosto.html' },
];

function tableDisplayName(tableKey) {
    const entry = DATA_TABLE_PAGES.find((p) => p.tableKey === tableKey);
    return entry ? Dashboard.t(entry.labelKey) : tableKey;
}

// Fetches a table's OWN page and reads its real <th data-col> cells — same
// source of truth the live table itself uses, so this can never go stale
// the way a hand-maintained column registry would. Excludes Control Interno
// columns and the trailing actions column, same rule Dashboard.js's own
// fieldRulesEligibleColumns uses for the per-table 🔗 modal.
async function fetchTableColumns(page) {
    const res = await fetch(page, { credentials: 'include' });
    if (!res.ok) throw new Error('fetch failed');
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(doc.querySelectorAll('.data-table thead th[data-col]'))
        .map((th) => ({ key: th.dataset.col, i18nKey: th.dataset.i18n }))
        .filter((c) => c.key && !c.key.startsWith('colSys') && c.key !== 'actions')
        .map((c) => ({ key: c.key, label: c.i18nKey ? Dashboard.t(c.i18nKey) : c.key }));
}

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(Dashboard.lang === 'es' ? 'es-MX' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

// The 13 "Control Interno" columns — see OpTransVolCombustible.js for the
// original pattern this mirrors.
const SYSTEM_COLUMN_KEYS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];
function buildSystemCells(record) {
    return SYSTEM_COLUMN_KEYS.map((key) => {
        const td = document.createElement('td');
        td.dataset.col = key;
        td.className = 'col-system';
        td.textContent = record[key] || '—';
        return td;
    });
}

function renderRules() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = rules.length > 0;
    rules.forEach((rule) => {
        const tr = document.createElement('tr');
        const systemCells = buildSystemCells(rule);

        const tdScreen = document.createElement('td');
        tdScreen.dataset.col = 'frScreen';
        tdScreen.textContent = tableDisplayName(rule.tableKey);

        const tdRule = document.createElement('td');
        tdRule.dataset.col = 'frRule';
        tdRule.textContent = `${rule.gateLabel} → ${rule.dependentLabel}`;

        const tdCreatedBy = document.createElement('td');
        tdCreatedBy.dataset.col = 'frCreatedBy';
        tdCreatedBy.textContent = rule.createdBy || '—';

        const tdCreatedAt = document.createElement('td');
        tdCreatedAt.dataset.col = 'frCreatedAt';
        tdCreatedAt.textContent = formatDate(rule.createdAt);

        const tdAuthorizedBy = document.createElement('td');
        tdAuthorizedBy.dataset.col = 'frAuthorizedBy';
        tdAuthorizedBy.textContent = rule.authorizedBy || Dashboard.t('main.fieldRuleNotAuthorizedYet');

        const tdStatus = document.createElement('td');
        tdStatus.dataset.col = 'frStatus';
        const badge = document.createElement('span');
        badge.className = `admin-badge admin-badge-${rule.authorized ? 'activo' : 'prospecto'}`;
        badge.textContent = Dashboard.t(rule.authorized ? 'main.fieldRuleStatusActive' : 'main.fieldRuleStatusPending');
        tdStatus.appendChild(badge);

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';
        if (!rule.authorized) {
            const authorizeBtn = document.createElement('button');
            authorizeBtn.type = 'button';
            authorizeBtn.className = 'admin-icon-btn';
            authorizeBtn.setAttribute('aria-label', Dashboard.t('main.fieldRuleAuthorizeAction'));
            authorizeBtn.title = Dashboard.t('main.fieldRuleAuthorizeAction');
            authorizeBtn.innerHTML = '<i class="bx bx-check-shield" aria-hidden="true"></i>';
            authorizeBtn.addEventListener('click', () => authorizeRule(rule));
            tdActions.appendChild(authorizeBtn);
        }
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => openRuleModal(rule));
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => removeRule(rule));
        tdActions.append(editBtn, deleteBtn);

        tr.append(...systemCells, tdScreen, tdRule, tdCreatedBy, tdCreatedAt, tdAuthorizedBy, tdStatus, tdActions);
        tableBody.appendChild(tr);
    });
}

async function loadRules() {
    try {
        const res = await fetch('/api/business/field-fill-rules/all', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        rules = data.rules || [];
        renderRules();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.loadError'), 'error');
    }
}

async function authorizeRule(rule) {
    try {
        const res = await fetch(`/api/business/field-fill-rules/${rule.id}/authorize`, { method: 'POST', credentials: 'include' });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            Dashboard.showToast(body.message || Dashboard.t('admin.saveError'), 'error');
            return;
        }
        await loadRules();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

async function removeRule(rule) {
    if (!(await Dashboard.confirm(Dashboard.t('main.fieldRuleDeleteConfirmGlobal')))) return;
    try {
        const res = await fetch(`/api/business/field-fill-rules/${rule.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        rules = rules.filter((r) => r.id !== rule.id);
        renderRules();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// --- Create/Edit modal -------------------------------------------------
const modal = document.getElementById('fr-modal');
const modalTitle = document.getElementById('fr-modal-title');
const idField = document.getElementById('fr-id');
const tableSelect = document.getElementById('fr-table');
const gateSelect = document.getElementById('fr-gate');
const dependentSelect = document.getElementById('fr-dependent');
const modalError = document.getElementById('fr-modal-error');
const modalSaveBtn = document.getElementById('fr-modal-save');
const modalCancelBtn = document.getElementById('fr-modal-cancel');

let currentColumns = [];

function populateTableSelect() {
    tableSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = Dashboard.t('main.fieldRuleTableSelectPlaceholder');
    tableSelect.appendChild(placeholder);
    DATA_TABLE_PAGES.forEach((entry) => {
        const opt = document.createElement('option');
        opt.value = entry.tableKey;
        opt.textContent = Dashboard.t(entry.labelKey);
        tableSelect.appendChild(opt);
    });
}

function populateFieldSelect(select, columns) {
    select.innerHTML = '';
    columns.forEach((col) => {
        const opt = document.createElement('option');
        opt.value = col.key;
        opt.textContent = col.label;
        select.appendChild(opt);
    });
}

async function loadColumnsForTable(tableKey) {
    const entry = DATA_TABLE_PAGES.find((p) => p.tableKey === tableKey);
    gateSelect.disabled = true;
    dependentSelect.disabled = true;
    gateSelect.innerHTML = '';
    dependentSelect.innerHTML = '';
    if (!entry) return;
    try {
        currentColumns = await fetchTableColumns(entry.page);
        populateFieldSelect(gateSelect, currentColumns);
        populateFieldSelect(dependentSelect, currentColumns);
        if (currentColumns.length > 1) dependentSelect.selectedIndex = 1;
        gateSelect.disabled = false;
        dependentSelect.disabled = false;
    } catch {
        modalError.textContent = Dashboard.t('main.fieldRuleLoadColumnsError');
        modalError.hidden = false;
    }
}

tableSelect.addEventListener('change', () => {
    modalError.hidden = true;
    loadColumnsForTable(tableSelect.value);
});

function openRuleModal(rule) {
    idField.value = rule ? rule.id : '';
    modalTitle.textContent = Dashboard.t(rule ? 'main.fieldRuleModalTitleEdit' : 'main.fieldRuleModalTitleNew');
    modalError.hidden = true;
    populateTableSelect();
    if (rule) {
        tableSelect.value = rule.tableKey;
        tableSelect.disabled = true;
        loadColumnsForTable(rule.tableKey).then(() => {
            gateSelect.value = rule.gateCol;
            dependentSelect.value = rule.dependentCol;
        });
    } else {
        tableSelect.disabled = false;
        gateSelect.innerHTML = '';
        dependentSelect.innerHTML = '';
        gateSelect.disabled = true;
        dependentSelect.disabled = true;
    }
    modal.hidden = false;
}

function closeRuleModal() {
    modal.hidden = true;
}

async function saveRuleModal() {
    modalError.hidden = true;
    const tableKey = tableSelect.value;
    const gateCol = gateSelect.value;
    const dependentCol = dependentSelect.value;
    if (!tableKey || !gateCol || !dependentCol || gateCol === dependentCol) {
        modalError.textContent = gateCol === dependentCol && gateCol
            ? Dashboard.t('main.fieldRulesSameColumnError')
            : Dashboard.t('admin.requiredFields');
        modalError.hidden = false;
        return;
    }
    const gateLabel = currentColumns.find((c) => c.key === gateCol)?.label || gateCol;
    const dependentLabel = currentColumns.find((c) => c.key === dependentCol)?.label || dependentCol;
    const editingId = idField.value;
    const url = editingId ? `/api/business/field-fill-rules/${editingId}` : '/api/business/field-fill-rules';
    const method = editingId ? 'PATCH' : 'POST';

    modalSaveBtn.disabled = true;
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ tableKey, gateCol, gateLabel, dependentCol, dependentLabel }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            modalError.textContent = body.message || Dashboard.t('admin.saveError');
            modalError.hidden = false;
            return;
        }
        await loadRules();
        closeRuleModal();
        Dashboard.showToast(Dashboard.t(editingId ? 'main.changeSaved' : 'main.fieldRuleCreatedPending'), 'success');
    } catch {
        modalError.textContent = Dashboard.t('admin.saveError');
        modalError.hidden = false;
    } finally {
        modalSaveBtn.disabled = false;
    }
}

newBtn.addEventListener('click', () => openRuleModal(null));
modalSaveBtn.addEventListener('click', saveRuleModal);
modalCancelBtn.addEventListener('click', closeRuleModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeRuleModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeRuleModal(); });

document.addEventListener('dashboard:language-changed', renderRules);

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-gestion-reglas-orden' });
        if (!role) return;
        await loadRules();
    } catch (err) {
        console.error('Reglas de Orden de Llenado failed to initialize:', err);
    }
})();
