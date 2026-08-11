// ---------------------------------------------------------------------------
// "Administración de Clientes" — combined SaaS admin screen: client list
// (Clientes Registrados tab — view/edit/Anexos/delete) and per-client module
// entitlements (Contrataciones tab). Creating a brand new client lives on
// its own page instead (+ Agregar Cliente Nuevo, Admin-ClienteNuevo.js) —
// the edit form here only ever appears via startEdit(). Shell (sidebar,
// i18n, settings, logout) comes from Dashboard.js.
//
// Access note: the sidebar only shows this page's link to admins, and the
// redirect below covers anyone who lands here directly without the role —
// but the actual enforcement is server-side (requireAdmin on every
// /api/admin/* route in server.js). This redirect is UX only.
// ---------------------------------------------------------------------------

// --- Tabs ---------------------------------------------------------------------
const tabClients = document.getElementById('tab-clients');
const tabContrataciones = document.getElementById('tab-contrataciones');
const panelClients = document.getElementById('panel-clients');
const panelContrataciones = document.getElementById('panel-contrataciones');

function activateTab(tab) {
    const isClients = tab === 'clients';
    tabClients.classList.toggle('active', isClients);
    tabClients.setAttribute('aria-selected', String(isClients));
    tabContrataciones.classList.toggle('active', !isClients);
    tabContrataciones.setAttribute('aria-selected', String(!isClients));
    panelClients.hidden = !isClients;
    panelContrataciones.hidden = isClients;
}

tabClients.addEventListener('click', () => activateTab('clients'));
tabContrataciones.addEventListener('click', () => activateTab('contrataciones'));

// --- Clientes Registrados: view/edit/delete existing clients ------------------
const form = document.getElementById('client-form');
const idField = document.getElementById('client-id');
const companyField = document.getElementById('client-company');
const contactField = document.getElementById('client-contact');
const emailField = document.getElementById('client-email');
const phoneField = document.getElementById('client-phone');
const planField = document.getElementById('client-plan');
const statusField = document.getElementById('client-status');
const missionField = document.getElementById('client-mission');
const visionField = document.getElementById('client-vision');
const valuesField = document.getElementById('client-values');
const historyField = document.getElementById('client-history');
const logoInput = document.getElementById('client-logo');
const logoDataField = document.getElementById('client-logo-data');
const logoPreview = document.getElementById('client-logo-preview');
const logoClearBtn = document.getElementById('client-logo-clear');
const paletteContainer = document.getElementById('client-color-palette');
let paletteWidget; // created after Dashboard.initDashboard() so i18n labels are ready — see init() below
const errorBanner = document.getElementById('client-form-error');
const submitBtn = document.getElementById('client-form-submit');
const cancelBtn = document.getElementById('client-form-cancel');
const tableBody = document.getElementById('clients-table-body');
const emptyMsg = document.getElementById('clients-empty');

let clients = [];
let plans = [];

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
}
function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
}

function statusLabel(status) {
    const key = 'admin.status' + status.charAt(0).toUpperCase() + status.slice(1);
    return Dashboard.t(key);
}

function setLogoPreview(dataUrl) {
    logoDataField.value = dataUrl || '';
    if (dataUrl) {
        logoPreview.src = dataUrl;
        logoPreview.hidden = false;
        logoClearBtn.hidden = false;
    } else {
        logoPreview.hidden = true;
        logoClearBtn.hidden = true;
    }
}

logoInput.addEventListener('change', () => {
    const file = logoInput.files?.[0];
    if (!file) return;
    if (file.size > 350 * 1024) {
        showError(Dashboard.t('admin.saveError'));
        logoInput.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(Dashboard.svgifyLogo(reader.result));
    reader.readAsDataURL(file);
});

logoClearBtn.addEventListener('click', () => {
    logoInput.value = '';
    setLogoPreview('');
});

// This form is edit-only here (creating a client lives on its own page, +
// Agregar Cliente Nuevo) — it only ever appears via startEdit, and hides
// again once you're done with it.
function resetForm() {
    form.reset();
    form.hidden = true;
    idField.value = '';
    setLogoPreview('');
    paletteWidget.setPalette(null);
    clearError();
}

function renderClients() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = clients.length > 0;
    clients.forEach((client) => {
        const tr = document.createElement('tr');

        const tdCompany = document.createElement('td');
        tdCompany.textContent = client.company_name;
        const tdContact = document.createElement('td');
        tdContact.textContent = client.contact_name;
        const tdEmail = document.createElement('td');
        tdEmail.textContent = client.email;
        const tdPlan = document.createElement('td');
        tdPlan.textContent = client.plan || '—';
        const tdUsername = document.createElement('td');
        tdUsername.textContent = client.adminUsername || '—';
        const tdStatus = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `admin-badge admin-badge-${client.status}`;
        statusBadge.textContent = statusLabel(client.status);
        tdStatus.appendChild(statusBadge);

        const tdActions = document.createElement('td');
        tdActions.className = 'admin-table-actions';
        const addendaBtn = document.createElement('button');
        addendaBtn.type = 'button';
        addendaBtn.className = 'admin-icon-btn';
        addendaBtn.setAttribute('aria-label', Dashboard.t('admin.addenda'));
        addendaBtn.innerHTML = '<i class="bx bx-file-plus" aria-hidden="true"></i>';
        addendaBtn.addEventListener('click', () => openAddendaModal(client));
        const adminAccessBtn = document.createElement('button');
        adminAccessBtn.type = 'button';
        adminAccessBtn.className = 'admin-icon-btn';
        adminAccessBtn.setAttribute('aria-label', Dashboard.t('admin.adminAccessTitle'));
        adminAccessBtn.innerHTML = '<i class="bx bx-key" aria-hidden="true"></i>';
        adminAccessBtn.disabled = !client.adminUsername;
        adminAccessBtn.title = client.adminUsername ? '' : Dashboard.t('admin.adminAccessNoAdminYet');
        adminAccessBtn.addEventListener('click', () => openAdminAccessModal(client));
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => startEdit(client));
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => removeClient(client));
        tdActions.append(addendaBtn, adminAccessBtn, editBtn, deleteBtn);

        tr.append(tdCompany, tdContact, tdEmail, tdPlan, tdUsername, tdStatus, tdActions);
        tableBody.appendChild(tr);
    });
}

function startEdit(client) {
    idField.value = client.id;
    companyField.value = client.company_name;
    contactField.value = client.contact_name;
    emailField.value = client.email;
    phoneField.value = client.phone || '';
    if (client.plan && !planField.querySelector(`option[value="${CSS.escape(client.plan)}"]`)) {
        const option = document.createElement('option');
        option.value = client.plan;
        option.textContent = client.plan;
        planField.appendChild(option);
    }
    planField.value = client.plan || '';
    statusField.value = client.status;
    missionField.value = client.mission || '';
    visionField.value = client.vision || '';
    valuesField.value = client.core_values || '';
    historyField.value = client.history || '';
    setLogoPreview(client.logo_data_url || '');
    let existingPalette = null;
    if (client.color_palette) {
        try { existingPalette = JSON.parse(client.color_palette); } catch { existingPalette = null; }
    }
    if (existingPalette) existingPalette.seed = client.seed_color || existingPalette.seed;
    paletteWidget.setPalette(existingPalette);
    form.hidden = false;
    clearError();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function removeClient(client) {
    if (!confirm(Dashboard.t('admin.confirmDelete'))) return;
    try {
        const res = await fetch(`/api/admin/clients/${client.id}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        if (!res.ok) throw new Error('delete failed');
        clients = clients.filter((c) => c.id !== client.id);
        renderClients();
        populateClientSelect();
    } catch {
        alert(Dashboard.t('admin.saveError'));
    }
}

async function loadClients() {
    try {
        const res = await fetch('/api/admin/clients', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        clients = data.clients || [];
        renderClients();
        populateClientSelect();
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

// --- Plan / paquete: options come from the Planes y Paquetes catalog --------
// (Admin-Planes.html), not typed in free-form here anymore.
function populatePlanSelect() {
    const previousValue = planField.value;
    planField.querySelectorAll('option:not([value=""])').forEach((opt) => opt.remove());
    plans.forEach((plan) => {
        const option = document.createElement('option');
        option.value = plan.name;
        option.textContent = plan.name;
        planField.appendChild(option);
    });
    // A client already assigned a plan that was since renamed/deleted from
    // the catalog would otherwise silently blank out on edit — keep it
    // selectable so saving the form doesn't accidentally erase it.
    if (previousValue && !plans.some((p) => p.name === previousValue)) {
        const option = document.createElement('option');
        option.value = previousValue;
        option.textContent = previousValue;
        planField.appendChild(option);
    }
    planField.value = previousValue;
}

async function loadPlans() {
    try {
        const res = await fetch('/api/admin/plans', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        plans = data.plans || [];
        populatePlanSelect();
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const companyName = companyField.value.trim();
    const contactName = contactField.value.trim();
    const email = emailField.value.trim();
    if (!companyName || !contactName || !email) {
        showError(Dashboard.t('admin.requiredFields'));
        return;
    }

    const { seed, ...currentPalette } = paletteWidget.getPalette();
    const payload = {
        companyName,
        contactName,
        email,
        phone: phoneField.value.trim(),
        plan: planField.value.trim(),
        status: statusField.value,
        logoDataUrl: logoDataField.value || null,
        seedColor: seed,
        colorPalette: currentPalette,
        mission: missionField.value.trim(),
        vision: visionField.value.trim(),
        coreValues: valuesField.value.trim(),
        history: historyField.value.trim(),
    };

    const editingId = idField.value;

    submitBtn.disabled = true;
    try {
        const res = await fetch(`/api/admin/clients/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(body.message || Dashboard.t('admin.saveError'));
            return;
        }
        const { client, generatedAdmin } = await res.json();
        clients = clients.map((c) => (c.id === client.id ? client : c));
        renderClients();
        populateClientSelect();
        resetForm();
        if (generatedAdmin) showGeneratedAdmin(generatedAdmin);
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

cancelBtn.addEventListener('click', resetForm);

// --- One-time generated admin credentials (shown when a client is activated) -
const generatedAdminBox = document.getElementById('generated-admin-box');
const generatedAdminUsername = document.getElementById('generated-admin-username');
const generatedAdminPassword = document.getElementById('generated-admin-password');
const generatedAdminDismiss = document.getElementById('generated-admin-dismiss');

function showGeneratedAdmin({ username, password }) {
    generatedAdminUsername.textContent = username;
    generatedAdminPassword.textContent = password;
    generatedAdminBox.hidden = false;
    generatedAdminBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

generatedAdminDismiss.addEventListener('click', () => {
    generatedAdminBox.hidden = true;
});

// --- Anexos: per-client extras on top of their plan ---------------------------
// e.g. the plan gives 5 centros de costo, this client specifically gets 2
// more — without touching the plan itself or any other client on it. Only
// modules the plan doesn't already include are offered here (granting one
// it already has would be a no-op). See applyEffectiveEntitlements in
// server.js for how plan + addenda get merged into the client's actual
// Contrataciones state.
const addendaModal = document.getElementById('addenda-modal');
const addendaPlanBase = document.getElementById('addenda-plan-base');
const addendaExtraCcField = document.getElementById('addenda-extra-cc');
const addendaModulesList = document.getElementById('addenda-modules-list');
const addendaError = document.getElementById('addenda-error');
const addendaSaveBtn = document.getElementById('addenda-save');
const addendaCancelBtn = document.getElementById('addenda-cancel');

let moduleCatalog = []; // { key, labelKey } — full catalog, same as Contrataciones/Planes
let addendaClientId = null;
let addendaPlanModules = [];

async function loadModuleCatalog() {
    const res = await fetch('/api/admin/modules', { credentials: 'include' });
    if (!res.ok) throw new Error('load failed');
    const data = await res.json();
    moduleCatalog = data.modules || [];
}

function renderAddendaModules(checkedKeys) {
    addendaModulesList.innerHTML = '';
    const candidates = moduleCatalog.filter((m) => !addendaPlanModules.includes(m.key));
    if (!candidates.length) {
        const note = document.createElement('p');
        note.className = 'admin-hint';
        note.textContent = Dashboard.t('admin.noExtraModulesAvailable');
        addendaModulesList.appendChild(note);
        return;
    }
    candidates.forEach((mod) => {
        const row = document.createElement('div');
        row.className = 'admin-module-row';
        const name = document.createElement('span');
        name.className = 'admin-module-name';
        name.textContent = Dashboard.t(mod.labelKey);
        const label = document.createElement('label');
        label.className = 'admin-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checkedKeys.includes(mod.key);
        input.dataset.moduleKey = mod.key;
        const track = document.createElement('span');
        track.className = 'admin-switch-track';
        label.append(input, track);
        row.append(name, label);
        addendaModulesList.appendChild(row);
    });
}

function closeAddendaModal() {
    addendaModal.hidden = true;
    addendaClientId = null;
}

async function openAddendaModal(client) {
    addendaClientId = client.id;
    addendaError.hidden = true;
    try {
        const res = await fetch(`/api/admin/clients/${client.id}/addenda`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { addenda, planBase } = await res.json();
        addendaPlanModules = planBase.modules;
        addendaPlanBase.textContent = client.plan
            ? Dashboard.t('admin.addendaPlanBase', { plan: client.plan, limit: planBase.costCentersLimit })
            : Dashboard.t('admin.addendaNoPlan');
        addendaExtraCcField.value = addenda.extraCostCenters || 0;
        renderAddendaModules(addenda.extraModules || []);
        addendaModal.hidden = false;
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

addendaSaveBtn.addEventListener('click', async () => {
    if (!addendaClientId) return;
    const extraCostCenters = Math.max(0, parseInt(addendaExtraCcField.value, 10) || 0);
    const extraModules = Array.from(addendaModulesList.querySelectorAll('input[type="checkbox"]:checked'))
        .map((i) => i.dataset.moduleKey);

    addendaSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/admin/clients/${addendaClientId}/addenda`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ extraCostCenters, extraModules }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            addendaError.textContent = body.message || Dashboard.t('admin.saveError');
            addendaError.hidden = false;
            return;
        }
        closeAddendaModal();
    } catch {
        addendaError.textContent = Dashboard.t('admin.saveError');
        addendaError.hidden = false;
    } finally {
        addendaSaveBtn.disabled = false;
    }
});

addendaCancelBtn.addEventListener('click', closeAddendaModal);
addendaModal.addEventListener('click', (event) => {
    if (event.target === addendaModal) closeAddendaModal();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !addendaModal.hidden) closeAddendaModal();
});

// --- Accesos del Administrador: GEIPSA-only override for the auto-
// provisioned client admin, who otherwise sees everything the client has
// contracted by default (see hasButtonPermission/hasMainButtonPermission's
// unrestricted-client-admin bypass in Dashboard.js). Reuses the shared
// PermissionTree component, scoped to that client's own contracted
// departments so GEIPSA can't grant something the client never bought. An
// empty grants array (the default, or after "Clear overrides") means "no
// override" client-side, not "nothing" — that's what gives the admin full
// access by default. ------------------------------------------------------
const adminAccessModal = document.getElementById('admin-access-modal');
const adminAccessSubtitle = document.getElementById('admin-access-subtitle');
const adminAccessTreeContainer = document.getElementById('admin-access-tree-container');
const adminAccessError = document.getElementById('admin-access-error');
const adminAccessSaveBtn = document.getElementById('admin-access-save');
const adminAccessClearBtn = document.getElementById('admin-access-clear');
const adminAccessCancelBtn = document.getElementById('admin-access-cancel');

let adminAccessClientId = null;
let adminAccessTree = null;

function closeAdminAccessModal() {
    adminAccessModal.hidden = true;
    adminAccessClientId = null;
    adminAccessTree = null;
}

async function openAdminAccessModal(client) {
    if (!client.adminUsername) return;
    adminAccessClientId = client.id;
    adminAccessSubtitle.textContent = `${client.company_name} — ${client.adminUsername}`;
    adminAccessError.hidden = true;
    try {
        const [modulesRes, accessRes] = await Promise.all([
            fetch(`/api/admin/clients/${client.id}/modules`, { credentials: 'include' }),
            fetch(`/api/admin/clients/${client.id}/admin-access`, { credentials: 'include' }),
        ]);
        if (!modulesRes.ok || !accessRes.ok) throw new Error('load failed');
        const modulesData = await modulesRes.json();
        const accessData = await accessRes.json();
        const allowedSectionIds = (modulesData.modules || []).filter((m) => m.enabled).map((m) => m.key);
        adminAccessTree = window.PermissionTree.create(adminAccessTreeContainer, { allowedSectionIds });
        await adminAccessTree.init(accessData.grants || []);
        adminAccessModal.hidden = false;
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

async function saveAdminAccess(grants) {
    if (!adminAccessClientId) return;
    adminAccessSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/admin/clients/${adminAccessClientId}/admin-access`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ grants }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            adminAccessError.textContent = body.message || Dashboard.t('admin.saveError');
            adminAccessError.hidden = false;
            return;
        }
        closeAdminAccessModal();
    } catch {
        adminAccessError.textContent = Dashboard.t('admin.saveError');
        adminAccessError.hidden = false;
    } finally {
        adminAccessSaveBtn.disabled = false;
    }
}

adminAccessSaveBtn.addEventListener('click', () => {
    if (!adminAccessTree) return;
    saveAdminAccess(adminAccessTree.getGrants());
});

adminAccessClearBtn.addEventListener('click', () => saveAdminAccess([]));

adminAccessCancelBtn.addEventListener('click', closeAdminAccessModal);
adminAccessModal.addEventListener('click', (event) => {
    if (event.target === adminAccessModal) closeAdminAccessModal();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !adminAccessModal.hidden) closeAdminAccessModal();
});

// --- Contrataciones: per-client module toggles --------------------------------
const clientSelect = document.getElementById('contrataciones-client');
const hint = document.getElementById('contrataciones-hint');
const modulesPanel = document.getElementById('modules-panel');
const modulesList = document.getElementById('modules-list');
const costCentersLimitInput = document.getElementById('cost-centers-limit');
const saveBtn = document.getElementById('modules-save');
const saveStatus = document.getElementById('modules-save-status');

let currentModules = [];

function populateClientSelect() {
    const previousValue = clientSelect.value;
    clientSelect.querySelectorAll('option:not([value=""])').forEach((opt) => opt.remove());
    clients.forEach((client) => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.company_name;
        clientSelect.appendChild(option);
    });
    if (clients.some((c) => String(c.id) === previousValue)) {
        clientSelect.value = previousValue;
    } else {
        clientSelect.value = '';
        modulesPanel.hidden = true;
        hint.textContent = Dashboard.t('admin.noClientSelected');
        hint.hidden = false;
    }
}

function renderModules(modules) {
    modulesList.innerHTML = '';
    modules.forEach((mod) => {
        const row = document.createElement('div');
        row.className = 'admin-module-row';

        const name = document.createElement('span');
        name.className = 'admin-module-name';
        name.textContent = Dashboard.t(mod.labelKey);

        const label = document.createElement('label');
        label.className = 'admin-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = mod.enabled;
        input.dataset.moduleKey = mod.key;
        const track = document.createElement('span');
        track.className = 'admin-switch-track';
        label.append(input, track);

        row.append(name, label);
        modulesList.appendChild(row);
    });
}

async function loadModulesForClient(clientId) {
    saveStatus.textContent = '';
    try {
        const res = await fetch(`/api/admin/clients/${clientId}/modules`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        currentModules = data.modules || [];
        renderModules(currentModules);
        costCentersLimitInput.value = data.costCentersLimit ?? 0;
        modulesPanel.hidden = false;
        hint.hidden = true;
    } catch {
        modulesPanel.hidden = true;
        hint.textContent = Dashboard.t('admin.loadError');
        hint.hidden = false;
    }
}

clientSelect.addEventListener('change', () => {
    const clientId = clientSelect.value;
    if (!clientId) {
        modulesPanel.hidden = true;
        hint.textContent = Dashboard.t('admin.noClientSelected');
        hint.hidden = false;
        return;
    }
    loadModulesForClient(clientId);
});

saveBtn.addEventListener('click', async () => {
    const clientId = clientSelect.value;
    if (!clientId) return;
    const states = Array.from(modulesList.querySelectorAll('input[type="checkbox"]')).map((input) => ({
        key: input.dataset.moduleKey,
        enabled: input.checked,
    }));
    const costCentersLimit = Math.max(0, parseInt(costCentersLimitInput.value, 10) || 0);

    saveBtn.disabled = true;
    try {
        const res = await fetch(`/api/admin/clients/${clientId}/modules`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ modules: states, costCentersLimit }),
        });
        if (!res.ok) throw new Error('save failed');
        const data = await res.json();
        currentModules = data.modules || [];
        costCentersLimitInput.value = data.costCentersLimit ?? costCentersLimit;
        saveStatus.textContent = Dashboard.t('admin.modulesSaved');
    } catch {
        saveStatus.textContent = Dashboard.t('admin.saveError');
    } finally {
        saveBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', () => {
    renderClients();
    if (currentModules.length) renderModules(currentModules);
    if (modulesPanel.hidden) hint.textContent = Dashboard.t('admin.noClientSelected');
    if (!addendaModal.hidden) {
        const checked = Array.from(addendaModulesList.querySelectorAll('input[type="checkbox"]:checked')).map((i) => i.dataset.moduleKey);
        renderAddendaModules(checked);
    }
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-saas' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        paletteWidget = window.ColorPalette.create(paletteContainer);
        document.addEventListener('dashboard:language-changed', () => paletteWidget.refreshLabels());
        await Promise.all([loadClients(), loadPlans(), loadModuleCatalog()]);
    } catch (err) {
        console.error('Admin (SaaS) failed to initialize:', err);
    }
})();
