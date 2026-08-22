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
const grid = document.getElementById('saas-app-grid');
const emptyMsg = document.getElementById('apps-empty');
const newAppBtn = document.getElementById('app-new-btn');

const editModal = document.getElementById('app-edit-modal');
const editModalTitle = document.getElementById('app-edit-modal-title');
const form = document.getElementById('app-form');
const idField = document.getElementById('app-id');
const nameField = document.getElementById('app-name');
const iconField = document.getElementById('app-icon');
const colorFromField = document.getElementById('app-color-from');
const colorToField = document.getElementById('app-color-to');
const formError = document.getElementById('app-form-error');
const submitBtn = document.getElementById('app-form-submit');
const cancelBtn = document.getElementById('app-form-cancel');

const screenModal = document.getElementById('app-screen-modal');
const screenForm = document.getElementById('app-screen-form');
const screenNameField = document.getElementById('app-screen-name');
const screenTypeField = document.getElementById('app-screen-type');
const screenFormError = document.getElementById('app-screen-form-error');
const screenCancelBtn = document.getElementById('app-screen-form-cancel');

let apps = [];
let currentApp = null; // full detail (with screens/planNames) of the app open in detail view

function showError(el, message) {
    el.textContent = message;
    el.hidden = false;
}
function clearError(el) {
    el.hidden = true;
    el.textContent = '';
}

function renderApps() {
    grid.innerHTML = '';
    emptyMsg.hidden = apps.length > 0;
    apps.forEach((app) => {
        const card = document.createElement('div');
        card.className = 'saas-app-card';
        card.innerHTML = `
            <div class="saas-app-icon" style="background:linear-gradient(135deg, ${app.colorFrom}, ${app.colorTo})">
                <i class="bx ${app.icon}" aria-hidden="true"></i>
            </div>
            <h3>${app.name}</h3>
            <p class="saas-app-meta">${app.screenCount > 0 ? Dashboard.t('menu.appScreenCount', { n: app.screenCount }) : Dashboard.t('menu.appNoScreens')}</p>
            <span class="saas-app-status ${app.screenCount > 0 ? 'active' : 'empty'}">${app.screenCount > 0 ? Dashboard.t('admin.planStatusActive') : Dashboard.t('menu.appNoScreens')}</span>
            <p class="saas-app-clients">${Dashboard.t('menu.appUsedByPlans', { n: app.planCount })}</p>
        `;
        card.addEventListener('click', () => openDetail(app.id));
        grid.appendChild(card);
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
    document.getElementById('app-detail-clients').textContent = Dashboard.t('menu.appUsedByPlans', { n: (currentApp.planNames || []).length });

    const list = document.getElementById('app-screen-list');
    list.innerHTML = '';
    (currentApp.screens || []).forEach((screen, i) => {
        const row = document.createElement('div');
        row.className = 'saas-app-screen-row';
        row.innerHTML = `
            <div class="saas-app-screen-num">${i + 1}</div>
            <div class="saas-app-screen-name">${screen.name}</div>
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
    editModalTitle.textContent = Dashboard.t('menu.addAppNew');
    submitBtn.textContent = Dashboard.t('admin.save');
    clearError(formError);
    editModal.hidden = false;
}
newAppBtn.addEventListener('click', openCreateModal);

function openEditModal(app) {
    idField.value = app.id;
    nameField.value = app.name;
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
    if (!name) {
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
            body: JSON.stringify({ name, icon: iconField.value, colorFrom: colorFromField.value, colorTo: colorToField.value }),
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
    if (!name) {
        showError(screenFormError, Dashboard.t('admin.requiredFields'));
        return;
    }
    if (!currentApp) return;
    try {
        const res = await fetch(`/api/admin/saas-apps/${currentApp.id}/screens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, screenType: screenTypeField.value }),
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
        await loadApps();
    } catch (err) {
        console.error('Admin (Nuestras APPs) failed to initialize:', err);
    }
})();
