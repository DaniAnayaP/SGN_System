// ---------------------------------------------------------------------------
// "Nuestras APPs" — GEIPSA's catalog of end-user mobile app "kinds", one per
// business vertical (3PL, Restaurante, Control de Acceso...). Each app gets
// filled in over time with its own operational screens (saas_app_screens in
// db.js) — this is where the guided-screen app EXPERIENCE gets designed,
// separate from the underlying data screens (Registro Combustible, Control
// Interno, etc.) that already exist. A plan then picks one of these apps
// (Admin-Planes.js's app-select field) to decide what its clients' phones
// show. Two views on one page ("pantalla alterna" style, same idea as Nuestros
// Planes' access-tree modal): the catalog grid, and a per-app detail panel —
// toggled client-side, no separate URL/reload needed. Shell (sidebar, i18n,
// settings, logout) comes from Dashboard.js.
// ---------------------------------------------------------------------------

const catalogView = document.getElementById('apps-catalog-view');
const detailView = document.getElementById('app-detail-view');
const tableBody = document.getElementById('saas-app-table-body');
const emptyMsg = document.getElementById('apps-empty');

const editModal = document.getElementById('app-edit-modal');
const editModalTitle = document.getElementById('app-edit-modal-title');
const form = document.getElementById('app-form');
const idField = document.getElementById('app-id');
const nameField = document.getElementById('app-name');
const sectorField = document.getElementById('app-sector');
const statusField = document.getElementById('app-status');
const iconField = document.getElementById('app-icon');
const colorFromField = document.getElementById('app-color-from');
const colorToField = document.getElementById('app-color-to');
const formError = document.getElementById('app-form-error');
const submitBtn = document.getElementById('app-form-submit');
const cancelBtn = document.getElementById('app-form-cancel');

const screenModal = document.getElementById('app-screen-modal');
const screenForm = document.getElementById('app-screen-form');
const screenNameField = document.getElementById('app-screen-name');
const screenWebKeyField = document.getElementById('app-screen-web-key');
const screenTypeField = document.getElementById('app-screen-type');
const screenFormError = document.getElementById('app-screen-form-error');
const screenCancelBtn = document.getElementById('app-screen-form-cancel');

let apps = [];
let currentApp = null; // full detail (with screens) of the app open in detail view
let webScreenCatalog = []; // [{key, labelKey}], loaded once — see populateWebScreenSelect

const STATUS_LABEL_KEY = { active: 'admin.planStatusActive', inactive: 'admin.planStatusInactive', development: 'menu.appStatusDevelopment' };

function showError(el, message) {
    el.textContent = message;
    el.hidden = false;
}
function clearError(el) {
    el.hidden = true;
    el.textContent = '';
}

function webScreenLabel(key) {
    const entry = webScreenCatalog.find((s) => s.key === key);
    return entry ? Dashboard.t(entry.labelKey) : key;
}

async function populateSectorSelect() {
    try {
        const res = await fetch('/api/admin/business-sectors', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        sectorField.innerHTML = '';
        (data.sectors || []).forEach((sector) => {
            const option = document.createElement('option');
            option.value = sector.name;
            option.textContent = sector.name;
            sectorField.appendChild(option);
        });
    } catch {
        // Leave the select empty — a failed load here shouldn't block the
        // rest of the page; the app modal just won't have sector options.
    }
}

async function populateWebScreenSelect() {
    try {
        const res = await fetch('/api/admin/web-screens-catalog', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        webScreenCatalog = data.screens || [];
        screenWebKeyField.innerHTML = '';
        webScreenCatalog.forEach((screen) => {
            const option = document.createElement('option');
            option.value = screen.key;
            option.textContent = Dashboard.t(screen.labelKey);
            screenWebKeyField.appendChild(option);
        });
    } catch {
        // Leave the select empty — a failed load here shouldn't block the
        // rest of the page; the add-screen modal just won't have options.
    }
}

// Same 13 columns, same order, as every other Control Interno-bearing table
// (see Business-CentrosCosto.js's identical CONTROL_INTERNO_COLS) — kept as
// its own copy rather than a shared export since each screen's row object
// key names line up with these one-for-one already.
const CONTROL_INTERNO_COLS = [
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
];

function renderApps() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = apps.length > 0;
    apps.forEach((app) => {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.dataset.col = 'name';
        tdName.innerHTML = `
            <div class="saas-app-name-cell">
                <span class="saas-app-icon saas-app-icon-sm" style="background:linear-gradient(135deg, ${app.colorFrom}, ${app.colorTo})">
                    <i class="bx ${app.icon}" aria-hidden="true"></i>
                </span>
                <b>${app.name}</b>
            </div>
        `;

        const tdSector = document.createElement('td');
        tdSector.dataset.col = 'sector';
        tdSector.innerHTML = app.sector ? `<span class="sector-pill">${app.sector}</span>` : '—';

        const tdScreens = document.createElement('td');
        tdScreens.dataset.col = 'screens';
        tdScreens.textContent = app.screenCount > 0 ? Dashboard.t('menu.appScreenCount', { n: app.screenCount }) : Dashboard.t('menu.appNoScreens');

        const tdStatus = document.createElement('td');
        tdStatus.dataset.col = 'status';
        tdStatus.innerHTML = `<span class="saas-app-status ${app.status}">${Dashboard.t(STATUS_LABEL_KEY[app.status] || STATUS_LABEL_KEY.active)}</span>`;

        const tdCreatedAt = document.createElement('td');
        tdCreatedAt.dataset.col = 'createdAt';
        tdCreatedAt.textContent = app.createdAt ? app.createdAt.slice(0, 10) : '—';

        const tdCreatedBy = document.createElement('td');
        tdCreatedBy.dataset.col = 'createdBy';
        tdCreatedBy.textContent = app.createdBy || '—';

        tr.append(tdName, tdSector, tdScreens, tdStatus, tdCreatedAt, tdCreatedBy);

        CONTROL_INTERNO_COLS.forEach((col) => {
            const td = document.createElement('td');
            td.dataset.col = col;
            td.className = 'col-system';
            td.textContent = app[col] || '—';
            tr.appendChild(td);
        });

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'actions';
        tdActions.innerHTML = `
            <button type="button" class="admin-icon-btn" aria-label="Edit" data-action="edit">
                <i class="bx bx-edit" aria-hidden="true"></i>
            </button>
        `;
        tdActions.querySelector('[data-action="edit"]').addEventListener('click', (event) => {
            event.stopPropagation();
            openEditModal(app);
        });
        tr.appendChild(tdActions);

        tr.addEventListener('click', () => openDetail(app.id));
        tableBody.appendChild(tr);
    });
}

async function loadApps() {
    try {
        const res = await fetch('/api/admin/saas-apps', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        apps = data.apps || [];
        renderApps();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.loadError'), 'error');
    }
}

// --- Detail view -------------------------------------------------------------
// Which screens' field checklists are open (by screen id) and the fetched
// column/icon catalog per webScreenKey (several screens can point at the
// same Web screen, so this is cached by key, not by screen). Both reset
// naturally on a full page reload; nothing here needs to survive that.
const expandedScreenIds = new Set();
const fieldCatalogCache = new Map();

function renderDetail() {
    if (!currentApp) return;
    document.getElementById('app-detail-icon').style.background = `linear-gradient(135deg, ${currentApp.colorFrom}, ${currentApp.colorTo})`;
    document.getElementById('app-detail-icon').innerHTML = `<i class="bx ${currentApp.icon}" aria-hidden="true"></i>`;
    document.getElementById('app-detail-name').textContent = currentApp.name;
    document.getElementById('app-detail-clients').textContent =
        `${currentApp.sector || '—'} · ${Dashboard.t(STATUS_LABEL_KEY[currentApp.status] || STATUS_LABEL_KEY.active)}`;

    const list = document.getElementById('app-screen-list');
    list.innerHTML = '';
    (currentApp.screens || []).forEach((screen, i) => {
        const expanded = expandedScreenIds.has(screen.id);
        const wrap = document.createElement('div');
        wrap.className = 'saas-app-screen-wrap';

        const row = document.createElement('div');
        row.className = 'saas-app-screen-row';
        row.innerHTML = `
            <button type="button" class="perm-tree-toggle" aria-expanded="${expanded}" aria-label="${Dashboard.t('menu.appScreenFieldsToggle')}">
                <i class="bx bx-chevron-down" aria-hidden="true"></i>
            </button>
            <div class="saas-app-screen-num">${i + 1}</div>
            <div class="saas-app-screen-name">
                ${screen.name}
                <span class="saas-app-screen-link">${Dashboard.t('menu.appScreenWebLink')}: ${webScreenLabel(screen.webScreenKey)}</span>
            </div>
            <div class="saas-app-screen-tag">${Dashboard.t(screen.screenType === 'readonly' ? 'menu.appScreenTypeReadonly' : 'menu.appScreenTypeGuided')}</div>
            <button type="button" class="admin-icon-btn admin-icon-btn-danger" aria-label="Delete" data-screen-id="${screen.id}">
                <i class="bx bx-trash" aria-hidden="true"></i>
            </button>
        `;
        row.querySelector('.perm-tree-toggle').addEventListener('click', () => {
            if (expandedScreenIds.has(screen.id)) expandedScreenIds.delete(screen.id);
            else expandedScreenIds.add(screen.id);
            renderDetail();
        });
        row.querySelector('.admin-icon-btn-danger').addEventListener('click', () => removeScreen(screen.id));
        wrap.appendChild(row);

        if (expanded) {
            const panel = document.createElement('div');
            panel.className = 'saas-app-screen-fields-panel';
            panel.innerHTML = `<p class="admin-hint">${Dashboard.t('menu.appScreenFieldsHint')}</p>`;
            wrap.appendChild(panel);
            renderScreenFieldsPanel(panel, screen);
        }

        list.appendChild(wrap);
    });
}

// Which columns/icons of this screen's underlying Web table this sector's
// App exposes — see saas_app_screen_fields in db.js. An empty saved list
// means "not curated yet, everything eligible", so the checklist starts
// with nothing checked in that case rather than pretending GEIPSA already
// made a (nonexistent) all-or-nothing choice.
async function renderScreenFieldsPanel(panel, screen) {
    panel.innerHTML = `<p class="admin-hint">${Dashboard.t('admin.loading')}</p>`;
    let catalog = fieldCatalogCache.get(screen.webScreenKey);
    if (!catalog) {
        try {
            const res = await fetch(`/api/admin/web-screens-catalog/${screen.webScreenKey}/fields`, { credentials: 'include' });
            if (!res.ok) throw new Error('load failed');
            catalog = await res.json();
            fieldCatalogCache.set(screen.webScreenKey, catalog);
        } catch {
            panel.innerHTML = `<p class="admin-hint">${Dashboard.t('menu.appScreenFieldsLoadError')}</p>`;
            return;
        }
    }
    panel.innerHTML = '';
    const selected = new Set(screen.fields || []);

    const groups = new Map(); // classificationKey (or null) -> columns[]
    catalog.columns.forEach((col) => {
        const key = col.classificationKey || null;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(col);
    });
    if (groups.has(null)) {
        const tier1 = document.createElement('div');
        tier1.className = 'picker-tier1';
        tier1.textContent = Dashboard.t('menu.appScreenFieldsOwnColumns');
        panel.appendChild(tier1);
        groups.get(null).forEach((col) => panel.appendChild(buildFieldCheckboxRow(col.id, col.labelKey, selected)));
    }
    groups.forEach((cols, classificationKey) => {
        if (!classificationKey) return;
        const tier1 = document.createElement('div');
        tier1.className = 'picker-tier1';
        tier1.textContent = Dashboard.t(classificationKey);
        panel.appendChild(tier1);
        cols.forEach((col) => panel.appendChild(buildFieldCheckboxRow(col.id, col.labelKey, selected)));
    });

    if (catalog.icons.length) {
        const tier1 = document.createElement('div');
        tier1.className = 'picker-tier1';
        tier1.textContent = Dashboard.t('menu.iconsPersonalization');
        panel.appendChild(tier1);
        catalog.icons.forEach((icon) => panel.appendChild(buildFieldCheckboxRow(icon.id, icon.labelKey, selected)));
    }

    if (!catalog.columns.length && !catalog.icons.length) {
        panel.appendChild(Object.assign(document.createElement('p'), {
            className: 'admin-hint', textContent: Dashboard.t('menu.appScreenFieldsEmpty'),
        }));
        return;
    }

    const actions = document.createElement('div');
    actions.className = 'admin-form-actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn';
    saveBtn.textContent = Dashboard.t('admin.save');
    saveBtn.addEventListener('click', () => {
        const fieldKeys = Array.from(panel.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.dataset.fieldKey);
        saveScreenFields(screen, fieldKeys);
    });
    actions.appendChild(saveBtn);
    panel.appendChild(actions);
}

function buildFieldCheckboxRow(fieldKey, labelKey, selected) {
    const label = document.createElement('label');
    label.className = 'picker-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.fieldKey = fieldKey;
    checkbox.checked = selected.has(fieldKey);
    const span = document.createElement('span');
    span.textContent = Dashboard.t(labelKey);
    label.append(checkbox, span);
    return label;
}

async function saveScreenFields(screen, fieldKeys) {
    try {
        const res = await fetch(`/api/admin/saas-apps/${currentApp.id}/screens/${screen.id}/fields`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ fieldKeys }),
        });
        if (!res.ok) throw new Error('save failed');
        screen.fields = fieldKeys;
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

async function openDetail(appId) {
    try {
        const res = await fetch(`/api/admin/saas-apps/${appId}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        currentApp = data.app;
        renderDetail();
        catalogView.hidden = true;
        detailView.hidden = false;
    } catch {
        Dashboard.showToast(Dashboard.t('admin.loadError'), 'error');
    }
}

function closeDetail() {
    currentApp = null;
    detailView.hidden = true;
    catalogView.hidden = false;
    loadApps();
}
document.getElementById('app-detail-back-btn').addEventListener('click', closeDetail);

document.getElementById('app-detail-edit-btn').addEventListener('click', () => {
    if (currentApp) openEditModal(currentApp);
});

document.getElementById('app-detail-delete-btn').addEventListener('click', async () => {
    if (!currentApp) return;
    if (!(await Dashboard.confirm(Dashboard.t('admin.confirmDeletePlan')))) return;
    try {
        const res = await fetch(`/api/admin/saas-apps/${currentApp.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        closeDetail();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
});

async function removeScreen(screenId) {
    if (!currentApp) return;
    if (!(await Dashboard.confirm(Dashboard.t('admin.confirmDeletePlan')))) return;
    try {
        const res = await fetch(`/api/admin/saas-apps/${currentApp.id}/screens/${screenId}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        const data = await res.json();
        currentApp = data.app;
        renderDetail();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// --- Create / edit app modal --------------------------------------------------
function openCreateModal() {
    form.reset();
    idField.value = '';
    statusField.value = 'active';
    editModalTitle.textContent = Dashboard.t('menu.addAppNew');
    submitBtn.textContent = Dashboard.t('admin.save');
    clearError(formError);
    editModal.hidden = false;
}

// "+ Crear Nueva App" — same toolbar-button placement/style as "+ Nuevo
// Plan" (Admin-Planes.js's renderNewPlanButton): prepended into the
// .data-table-zoom bar Dashboard.js already renders for every
// .data-table-wrapper, instead of a bespoke .admin-toolbar button — keeps
// placement and per-theme styling consistent with every other table's
// "add" button.
function renderNewAppButton() {
    const wrapper = document.querySelector('[data-table-id="nuestras-apps"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="menu.addAppNew">${Dashboard.t('menu.addAppNew')}</span>`;
    btn.addEventListener('click', openCreateModal);
    toolbar.prepend(btn);
}

function openEditModal(app) {
    idField.value = app.id;
    nameField.value = app.name;
    sectorField.value = app.sector || '';
    statusField.value = app.status || 'active';
    iconField.value = app.icon;
    colorFromField.value = app.colorFrom;
    colorToField.value = app.colorTo;
    editModalTitle.textContent = app.name;
    submitBtn.textContent = Dashboard.t('admin.save');
    clearError(formError);
    editModal.hidden = false;
}

function closeEditModal() {
    editModal.hidden = true;
}
cancelBtn.addEventListener('click', closeEditModal);
editModal.addEventListener('click', (event) => { if (event.target === editModal) closeEditModal(); });

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(formError);
    const name = nameField.value.trim();
    const sector = sectorField.value.trim();
    if (!name || !sector) {
        showError(formError, Dashboard.t('admin.requiredFields'));
        return;
    }
    const editingId = idField.value;
    const isCreate = !editingId;
    submitBtn.disabled = true;
    try {
        const res = await fetch(isCreate ? '/api/admin/saas-apps' : `/api/admin/saas-apps/${editingId}`, {
            method: isCreate ? 'POST' : 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                name, sector, status: statusField.value,
                icon: iconField.value, colorFrom: colorFromField.value, colorTo: colorToField.value,
            }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(formError, body.message || Dashboard.t('admin.saveError'));
            return;
        }
        closeEditModal();
        Dashboard.showToast(Dashboard.t(isCreate ? 'main.recordSaved' : 'main.changeSaved'), 'success');
        const reopenId = currentApp ? currentApp.id : null;
        await loadApps();
        if (reopenId) await openDetail(reopenId);
    } catch {
        showError(formError, Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

// --- Add screen modal ---------------------------------------------------------
document.getElementById('app-add-screen-btn').addEventListener('click', () => {
    screenForm.reset();
    clearError(screenFormError);
    screenModal.hidden = false;
});
screenCancelBtn.addEventListener('click', () => { screenModal.hidden = true; });
screenModal.addEventListener('click', (event) => { if (event.target === screenModal) screenModal.hidden = true; });

screenForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError(screenFormError);
    const name = screenNameField.value.trim();
    const webScreenKey = screenWebKeyField.value;
    if (!name || !webScreenKey) {
        showError(screenFormError, Dashboard.t('admin.requiredFields'));
        return;
    }
    if (!currentApp) return;
    try {
        const res = await fetch(`/api/admin/saas-apps/${currentApp.id}/screens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, screenType: screenTypeField.value, webScreenKey }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(screenFormError, body.message || Dashboard.t('admin.saveError'));
            return;
        }
        const data = await res.json();
        currentApp = data.app;
        renderDetail();
        screenModal.hidden = true;
        Dashboard.showToast(Dashboard.t('main.recordSaved'), 'success');
    } catch {
        showError(screenFormError, Dashboard.t('admin.saveError'));
    }
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-nuestras-apps' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        renderNewAppButton();
        await Promise.all([loadApps(), populateWebScreenSelect(), populateSectorSelect()]);
    } catch (err) {
        console.error('Admin (Nuestras APPs) failed to initialize:', err);
    }
})();
