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

function renderApps() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = apps.length > 0;
    apps.forEach((app) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="saas-app-name-cell">
                    <span class="saas-app-icon saas-app-icon-sm" style="background:linear-gradient(135deg, ${app.colorFrom}, ${app.colorTo})">
                        <i class="bx ${app.icon}" aria-hidden="true"></i>
                    </span>
                    <b>${app.name}</b>
                </div>
            </td>
            <td>${app.sector ? `<span class="sector-pill">${app.sector}</span>` : '—'}</td>
            <td>${app.screenCount > 0 ? Dashboard.t('menu.appScreenCount', { n: app.screenCount }) : Dashboard.t('menu.appNoScreens')}</td>
            <td><span class="saas-app-status ${app.status}">${Dashboard.t(STATUS_LABEL_KEY[app.status] || STATUS_LABEL_KEY.active)}</span></td>
            <td>${app.createdAt ? app.createdAt.slice(0, 10) : '—'}</td>
            <td>${app.createdBy || '—'}</td>
            <td class="col-system">${app.colSysEmpresa || '—'}</td>
            <td class="col-system">${app.colSysArea || '—'}</td>
            <td class="col-system">${app.colSysModulo || '—'}</td>
            <td class="col-system">${app.colSysPantalla || '—'}</td>
            <td class="col-system">${app.colSysCentroCostos || '—'}</td>
            <td class="col-system">${app.colSysFecha || '—'}</td>
            <td class="col-system">${app.colSysDiaNum || '—'}</td>
            <td class="col-system">${app.colSysDiaTexto || '—'}</td>
            <td class="col-system">${app.colSysMesNum || '—'}</td>
            <td class="col-system">${app.colSysMesTexto || '—'}</td>
            <td class="col-system">${app.colSysAnio || '—'}</td>
            <td class="col-system">${app.colSysSemana || '—'}</td>
            <td class="col-system">${app.colSysHora || '—'}</td>
            <td class="actions">
                <button type="button" class="admin-icon-btn" aria-label="Edit" data-action="edit">
                    <i class="bx bx-edit" aria-hidden="true"></i>
                </button>
            </td>
        `;
        row.querySelector('[data-action="edit"]').addEventListener('click', (event) => {
            event.stopPropagation();
            openEditModal(app);
        });
        row.addEventListener('click', () => openDetail(app.id));
        tableBody.appendChild(row);
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
        const row = document.createElement('div');
        row.className = 'saas-app-screen-row';
        row.innerHTML = `
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
        row.querySelector('button').addEventListener('click', () => removeScreen(screen.id));
        list.appendChild(row);
    });
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
