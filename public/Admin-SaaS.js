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
const rfcField = document.getElementById('client-rfc');
const nicknameField = document.getElementById('client-nickname');
const abbreviationField = document.getElementById('client-abbreviation');
const ownerField = document.getElementById('client-owner');
const billingEmailField = document.getElementById('client-billing-email');
const contractStartField = document.getElementById('client-contract-start');
const contractRegisteredField = document.getElementById('client-contract-registered');
const contractEndField = document.getElementById('client-contract-end');
const contractedCostField = document.getElementById('client-contracted-cost');
const monthlyPaymentField = document.getElementById('client-monthly-payment');
const contractInput = document.getElementById('client-contract');
const contractDataField = document.getElementById('client-contract-data');
const contractFilenameField = document.getElementById('client-contract-filename');
const contractNameLabel = document.getElementById('client-contract-name');
const contractClearBtn = document.getElementById('client-contract-clear');
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

// Contrato: same data-URL-in-the-record pattern as the logo above, just a
// bigger size cap (real PDFs) and no image preview — a filename label
// instead (see admin.contractFile in Admin-SaaS.html).
function setContractPreview(dataUrl, filename) {
    contractDataField.value = dataUrl || '';
    contractFilenameField.value = filename || '';
    if (dataUrl) {
        contractNameLabel.textContent = filename || '';
        contractNameLabel.hidden = false;
        contractClearBtn.hidden = false;
    } else {
        contractNameLabel.hidden = true;
        contractClearBtn.hidden = true;
    }
}

contractInput.addEventListener('change', () => {
    const file = contractInput.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        showError(Dashboard.t('admin.saveError'));
        contractInput.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = () => setContractPreview(reader.result, file.name);
    reader.readAsDataURL(file);
});

contractClearBtn.addEventListener('click', () => {
    contractInput.value = '';
    setContractPreview('', '');
});

// This form is edit-only here (creating a client lives on its own page, +
// Agregar Cliente Nuevo) — it only ever appears via startEdit, and hides
// again once you're done with it.
function resetForm() {
    form.reset();
    form.hidden = true;
    idField.value = '';
    setLogoPreview('');
    setContractPreview('', '');
    paletteWidget.setPalette(null);
    clearError();
}

function formatMoney(value) {
    const n = Number(value) || 0;
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function textCell(value) {
    const td = document.createElement('td');
    td.textContent = value || '—';
    return td;
}

// Matches, in order, the <th data-col> values in the "Nuestros Clientes"
// table (Admin-SaaS.html) and the tr.append(...) call in renderClients().
const DATA_TABLE_CLIENT_COLUMNS = [
    'bigDateNumber', 'rfc', 'companyNickname', 'companyAbbreviation', 'logo', 'institutionalColor',
    'ownerName', 'contactName', 'billingEmail', 'contractStartDate', 'contractFile', 'plan',
    'contractedCost', 'monthlyPayment', 'costCenters', 'addenda', 'anexoChanges',
    'contractRegisteredDate', 'contractEndDate', 'activeTree', 'username', 'status', 'actions',
];

function iconButton(iconClass, label, onClick, { disabled = false, title = '', danger = false } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = danger ? 'admin-icon-btn admin-icon-btn-danger' : 'admin-icon-btn';
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `<i class="bx ${iconClass}" aria-hidden="true"></i>`;
    btn.disabled = disabled;
    if (title) btn.title = title;
    btn.addEventListener('click', onClick);
    return btn;
}

function renderClients() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = clients.length > 0;
    clients.forEach((client) => {
        const tr = document.createElement('tr');
        tr.dataset.status = client.status;
        // Every row on this screen is editable by whoever can see it — this
        // table has no per-column permission model like the operational
        // tables, only the "puede ver esta pantalla" gate already enforced
        // by Dashboard.js before this page even loads.
        tr.classList.add('data-table-row-editable');

        const tdStatus = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `admin-badge admin-badge-${client.status}`;
        statusBadge.textContent = statusLabel(client.status);
        tdStatus.appendChild(statusBadge);

        const tdContract = document.createElement('td');
        tdContract.appendChild(iconButton('bx-file-blank', Dashboard.t('admin.viewContract'), () => {
            window.open(client.contract_file_data_url, '_blank');
        }, { disabled: !client.contract_file_data_url, title: client.contract_file_data_url ? '' : Dashboard.t('admin.noContractFile') }));

        const tdLogo = document.createElement('td');
        if (client.logo_data_url) {
            const img = document.createElement('img');
            img.className = 'admin-table-logo';
            img.src = client.logo_data_url;
            img.alt = '';
            tdLogo.appendChild(img);
        } else {
            const placeholder = document.createElement('span');
            placeholder.className = 'admin-table-logo-empty';
            placeholder.title = Dashboard.t('admin.noLogo');
            placeholder.innerHTML = '<i class="bx bx-image" aria-hidden="true"></i>';
            tdLogo.appendChild(placeholder);
        }

        const tdColor = document.createElement('td');
        const colorSwatch = document.createElement('button');
        colorSwatch.type = 'button';
        colorSwatch.className = client.seed_color ? 'admin-color-swatch' : 'admin-color-swatch admin-color-swatch-empty';
        if (client.seed_color) colorSwatch.style.backgroundColor = client.seed_color;
        colorSwatch.setAttribute('aria-label', Dashboard.t('admin.editColor'));
        colorSwatch.title = client.seed_color || Dashboard.t('admin.noColorSet');
        colorSwatch.addEventListener('click', () => openColorModal(client));
        tdColor.appendChild(colorSwatch);

        const tdAddenda = document.createElement('td');
        tdAddenda.appendChild(iconButton('bx-paperclip', Dashboard.t('admin.addenda'), () => openAddendaModal(client)));

        const tdAnexoChanges = document.createElement('td');
        tdAnexoChanges.appendChild(iconButton('bx-history', Dashboard.t('admin.anexoChanges'), () => openAnexoChangesModal(client)));

        const tdActiveTree = document.createElement('td');
        tdActiveTree.appendChild(iconButton('bx-sitemap', Dashboard.t('admin.activeTree'), () => openActiveTreeModal(client)));

        const tdActions = document.createElement('td');
        tdActions.className = 'admin-table-actions';
        tdActions.append(
            iconButton('bx-key', Dashboard.t('admin.adminAccessTitle'), () => openAdminAccessModal(client), {
                disabled: !client.adminUsername,
                title: client.adminUsername ? '' : Dashboard.t('admin.adminAccessNoAdminYet'),
            }),
            iconButton('bx-edit', Dashboard.t('admin.edit'), () => startEdit(client)),
            iconButton(
                client.status === 'inactivo' ? 'bx-check-circle' : 'bx-x-circle',
                Dashboard.t(client.status === 'inactivo' ? 'admin.activate' : 'admin.deactivate'),
                () => toggleClientStatus(client),
            ),
        );

        tr.append(
            textCell(client.big_date_number),
            textCell(client.rfc),
            textCell(client.company_nickname),
            textCell(client.company_abbreviation),
            tdLogo,
            tdColor,
            textCell(client.owner_name),
            textCell(client.contact_name),
            textCell(client.billing_email),
            textCell(client.contract_start_date),
            tdContract,
            textCell(client.plan),
            textCell(formatMoney(client.contracted_cost)),
            textCell(formatMoney(client.monthly_payment)),
            textCell(`${client.costCentersUsed ?? 0} / ${client.cost_centers_limit ?? 0}`),
            tdAddenda,
            tdAnexoChanges,
            textCell(client.contract_registered_date),
            textCell(client.contract_end_date),
            tdActiveTree,
            textCell(client.adminUsername),
            tdStatus,
            tdActions,
        );
        // Tags each cell with which logical column it is, in the same order
        // as tr.append(...) above (which itself matches the <th data-col>
        // order in Admin-SaaS.html) — this is what lets Dashboard.js's
        // generic column reorder/pin/hide/resize feature find and move the
        // right cell in a freshly-rebuilt row without renderClients() itself
        // knowing anything about column customization.
        DATA_TABLE_CLIENT_COLUMNS.forEach((key, i) => {
            tr.children[i].dataset.col = key;
        });
        tableBody.appendChild(tr);
    });
    applyClientFilters();
}

// Filtro panel (see Dashboard.js for the Filtrar/Limpiar toolbar buttons and
// the generic open/close wiring — this page only owns what the fields mean).
// Client-side row hiding, re-applied after every renderClients() so a filter
// stays active across edits instead of silently resetting.
function applyClientFilters() {
    const text = (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
    const status = document.getElementById('filter-status')?.value || '';
    tableBody.querySelectorAll('tr').forEach((tr) => {
        let visible = true;
        if (text) {
            const haystack = ['rfc', 'companyNickname', 'companyAbbreviation', 'ownerName', 'contactName']
                .map((col) => tr.querySelector(`[data-col="${col}"]`)?.textContent?.toLowerCase() || '')
                .join(' ');
            if (!haystack.includes(text)) visible = false;
        }
        if (status && tr.dataset.status !== status) visible = false;
        tr.hidden = !visible;
    });
}
document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', applyClientFilters);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', applyClientFilters);

// Turns a client record (as returned by GET /api/admin/clients, snake_case
// column names) back into the camelCase shape PATCH /api/admin/clients/:id
// expects — every row-level action below (status toggle, color-only edit)
// needs to resend the fields it ISN'T changing, since PATCH replaces the
// whole record rather than merging partial updates server-side.
function clientToPayload(client) {
    return {
        companyName: client.company_name, contactName: client.contact_name, email: client.email,
        phone: client.phone, plan: client.plan, status: client.status,
        logoDataUrl: client.logo_data_url, seedColor: client.seed_color,
        colorPalette: client.color_palette ? JSON.parse(client.color_palette) : null,
        mission: client.mission, vision: client.vision, coreValues: client.core_values, history: client.history,
        rfc: client.rfc, companyNickname: client.company_nickname, companyAbbreviation: client.company_abbreviation,
        ownerName: client.owner_name, billingEmail: client.billing_email,
        contractStartDate: client.contract_start_date, contractRegisteredDate: client.contract_registered_date,
        contractEndDate: client.contract_end_date, contractFileDataUrl: client.contract_file_data_url, contractFileName: client.contract_file_name,
        contractedCost: client.contracted_cost, monthlyPayment: client.monthly_payment,
    };
}

async function patchClient(client, overrides) {
    const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...clientToPayload(client), ...overrides }),
    });
    if (!res.ok) throw new Error('save failed');
    const { client: updated } = await res.json();
    clients = clients.map((c) => (c.id === updated.id ? updated : c));
    renderClients();
    populateClientSelect();
    return updated;
}

// Activar/Desactivar is the day-to-day lifecycle toggle — clients can no
// longer be deleted (see server.js), only edited or (de)activated.
async function toggleClientStatus(client) {
    const nextStatus = client.status === 'inactivo' ? 'activo' : 'inactivo';
    try {
        await patchClient(client, { status: nextStatus });
    } catch {
        alert(Dashboard.t('admin.saveError'));
    }
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
    rfcField.value = client.rfc || '';
    nicknameField.value = client.company_nickname || '';
    abbreviationField.value = client.company_abbreviation || '';
    ownerField.value = client.owner_name || '';
    billingEmailField.value = client.billing_email || '';
    contractStartField.value = client.contract_start_date || '';
    contractRegisteredField.value = client.contract_registered_date || '';
    contractEndField.value = client.contract_end_date || '';
    contractedCostField.value = client.contracted_cost || '';
    monthlyPaymentField.value = client.monthly_payment || '';
    setContractPreview(client.contract_file_data_url || '', client.contract_file_name || '');
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
        rfc: rfcField.value.trim(),
        companyNickname: nicknameField.value.trim(),
        companyAbbreviation: abbreviationField.value.trim(),
        ownerName: ownerField.value.trim(),
        billingEmail: billingEmailField.value.trim(),
        contractStartDate: contractStartField.value || null,
        contractRegisteredDate: contractRegisteredField.value || null,
        contractEndDate: contractEndField.value || null,
        contractFileDataUrl: contractDataField.value || null,
        contractFileName: contractFilenameField.value || null,
        contractedCost: contractedCostField.value ? Number(contractedCostField.value) : 0,
        monthlyPayment: monthlyPaymentField.value ? Number(monthlyPaymentField.value) : 0,
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
const addendaRequestedByField = document.getElementById('addenda-requested-by');
const addendaRequestedAtField = document.getElementById('addenda-requested-at');
const addendaDurationField = document.getElementById('addenda-duration');
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

// Shows the FULL catalog now, not just what's left to add — a module
// already covered by the plan renders with a ★ and a checked, disabled
// switch (toggling it here would be a no-op anyway; the plan is what to
// edit for that). Only the un-starred, editable switches ever feed into
// extraModules on save (see the :not([data-plan]) selector below).
function renderAddendaModules(checkedKeys) {
    addendaModulesList.innerHTML = '';
    moduleCatalog.forEach((mod) => {
        const isPlanModule = addendaPlanModules.includes(mod.key);
        const row = document.createElement('div');
        row.className = 'admin-module-row';
        const name = document.createElement('span');
        name.className = 'admin-module-name';
        name.textContent = (isPlanModule ? '★ ' : '') + Dashboard.t(mod.labelKey);
        const label = document.createElement('label');
        label.className = 'admin-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = isPlanModule || checkedKeys.includes(mod.key);
        input.disabled = isPlanModule;
        input.dataset.moduleKey = mod.key;
        if (isPlanModule) input.dataset.plan = 'true';
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
    addendaRequestedByField.value = '';
    addendaRequestedAtField.value = '';
    addendaDurationField.value = '';
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
    // Only the editable (non-plan) switches count as anexos — the starred,
    // disabled ones just show what the plan already covers.
    const extraModules = Array.from(addendaModulesList.querySelectorAll('input[type="checkbox"]:not([data-plan]):checked'))
        .map((i) => i.dataset.moduleKey);

    addendaSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/admin/clients/${addendaClientId}/addenda`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                extraCostCenters, extraModules,
                requestedBy: addendaRequestedByField.value.trim(),
                requestedAt: addendaRequestedAtField.value || null,
                contractedDuration: addendaDurationField.value.trim(),
            }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            addendaError.textContent = body.message || Dashboard.t('admin.saveError');
            addendaError.hidden = false;
            return;
        }
        await loadClients();
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

// --- Cambios de Anexos: read-only history of every módulo that entered or
// left extra_modules, and who/when requested it (written manually by GEIPSA
// inside the Anexos modal above — see server.js's addenda PUT route). -------
const anexoChangesModal = document.getElementById('anexo-changes-modal');
const anexoChangesSubtitle = document.getElementById('anexo-changes-subtitle');
const anexoChangesTableBody = document.getElementById('anexo-changes-table-body');
const anexoChangesCloseBtn = document.getElementById('anexo-changes-close');

function closeAnexoChangesModal() {
    anexoChangesModal.hidden = true;
}

async function openAnexoChangesModal(client) {
    anexoChangesSubtitle.textContent = client.company_name;
    anexoChangesTableBody.innerHTML = '';
    try {
        const res = await fetch(`/api/admin/clients/${client.id}/anexo-changes`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const { changes } = await res.json();
        if (!changes.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 6;
            td.className = 'admin-empty';
            td.textContent = Dashboard.t('admin.anexoChangesEmpty');
            tr.appendChild(td);
            anexoChangesTableBody.appendChild(tr);
        } else {
            changes.forEach((change) => {
                const moduleDef = moduleCatalog.find((m) => m.key === change.module_key);
                const tr = document.createElement('tr');
                [
                    ['colModule', moduleDef ? Dashboard.t(moduleDef.labelKey) : change.module_key],
                    ['colAction', Dashboard.t(change.action === 'added' ? 'admin.anexoChangeAdded' : 'admin.anexoChangeRemoved')],
                    ['colRequestedBy', change.requested_by || '—'],
                    ['colRequestedAt', change.requested_at || '—'],
                    ['colChangedAt', change.changed_at],
                    ['colDuration', change.contracted_duration || '—'],
                ].forEach(([key, value]) => {
                    const td = document.createElement('td');
                    td.dataset.col = key;
                    td.textContent = value;
                    tr.appendChild(td);
                });
                anexoChangesTableBody.appendChild(tr);
            });
        }
        anexoChangesModal.hidden = false;
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

anexoChangesCloseBtn.addEventListener('click', closeAnexoChangesModal);
anexoChangesModal.addEventListener('click', (event) => {
    if (event.target === anexoChangesModal) closeAnexoChangesModal();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !anexoChangesModal.hidden) closeAnexoChangesModal();
});

// --- Árbol de permisos activo: read-only view of everything this client has
// enabled right now (contratado ∪ anexos, same union server.js already
// computes for Contrataciones) — ★ marks what the plan itself contracts, no
// star means it's there because of an anexo. -------------------------------
const activeTreeModal = document.getElementById('active-tree-modal');
const activeTreeSubtitle = document.getElementById('active-tree-subtitle');
const activeTreeList = document.getElementById('active-tree-list');
const activeTreeCloseBtn = document.getElementById('active-tree-close');

function closeActiveTreeModal() {
    activeTreeModal.hidden = true;
}

async function openActiveTreeModal(client) {
    activeTreeSubtitle.textContent = client.company_name;
    activeTreeList.innerHTML = '';
    try {
        const [modulesRes, addendaRes] = await Promise.all([
            fetch(`/api/admin/clients/${client.id}/modules`, { credentials: 'include' }),
            fetch(`/api/admin/clients/${client.id}/addenda`, { credentials: 'include' }),
        ]);
        if (!modulesRes.ok || !addendaRes.ok) throw new Error('load failed');
        const modulesData = await modulesRes.json();
        const { planBase } = await addendaRes.json();
        const enabled = (modulesData.modules || []).filter((m) => m.enabled);
        enabled.forEach((mod) => {
            const isPlanModule = planBase.modules.includes(mod.key);
            const row = document.createElement('div');
            row.className = 'admin-module-row';
            const name = document.createElement('span');
            name.className = 'admin-module-name';
            name.textContent = (isPlanModule ? '★ ' : '') + Dashboard.t(mod.labelKey);
            row.appendChild(name);
            activeTreeList.appendChild(row);
        });
        activeTreeModal.hidden = false;
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

activeTreeCloseBtn.addEventListener('click', closeActiveTreeModal);
activeTreeModal.addEventListener('click', (event) => {
    if (event.target === activeTreeModal) closeActiveTreeModal();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !activeTreeModal.hidden) closeActiveTreeModal();
});

// --- Color Institucional: quick edit straight from the table, without
// opening the full Editar form — its own ColorPalette instance (separate
// from the one in #client-color-palette used by startEdit) so editing one
// doesn't clobber the other's in-progress state. Still the exact same
// widget, "Sugerir paleta" and all, just in a smaller dialog. ------------
const colorModal = document.getElementById('color-modal');
const colorModalSubtitle = document.getElementById('color-modal-subtitle');
const colorModalPaletteContainer = document.getElementById('color-modal-palette');
const colorModalError = document.getElementById('color-modal-error');
const colorModalSaveBtn = document.getElementById('color-modal-save');
const colorModalCancelBtn = document.getElementById('color-modal-cancel');

let colorModalPaletteWidget = null;
let colorModalClient = null;

function closeColorModal() {
    colorModal.hidden = true;
    colorModalClient = null;
}

function openColorModal(client) {
    colorModalClient = client;
    colorModalError.hidden = true;
    colorModalSubtitle.textContent = client.company_name;
    if (!colorModalPaletteWidget) {
        colorModalPaletteWidget = window.ColorPalette.create(colorModalPaletteContainer);
    }
    let existingPalette = null;
    if (client.color_palette) {
        try { existingPalette = JSON.parse(client.color_palette); } catch { existingPalette = null; }
    }
    if (existingPalette) existingPalette.seed = client.seed_color || existingPalette.seed;
    else if (client.seed_color) existingPalette = window.ColorPalette.suggestPalette(client.seed_color);
    colorModalPaletteWidget.setPalette(existingPalette);
    colorModal.hidden = false;
}

colorModalSaveBtn.addEventListener('click', async () => {
    if (!colorModalClient || !colorModalPaletteWidget) return;
    const { seed, ...currentPalette } = colorModalPaletteWidget.getPalette();
    colorModalSaveBtn.disabled = true;
    try {
        await patchClient(colorModalClient, { seedColor: seed, colorPalette: currentPalette });
        closeColorModal();
    } catch {
        colorModalError.textContent = Dashboard.t('admin.saveError');
        colorModalError.hidden = false;
    } finally {
        colorModalSaveBtn.disabled = false;
    }
});

colorModalCancelBtn.addEventListener('click', closeColorModal);
colorModal.addEventListener('click', (event) => {
    if (event.target === colorModal) closeColorModal();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !colorModal.hidden) closeColorModal();
});

// --- Accesos del Administrador: read-only viewer of what the auto-
// provisioned client admin sees — always everything the client has
// contracted, automatically (see hasButtonPermission/hasMainButtonPermission's
// unrestricted-client-admin bypass in Dashboard.js). Used to be an editable
// override (check items to restrict the admin below "everything contracted"),
// but that Save path was the actual bug: opening the tree and hitting Save —
// even without meaning to restrict anything — froze the admin into whatever
// happened to be checked at that moment, and future anexos never got added
// to that frozen snapshot automatically. Read-only removes that risk
// entirely: nothing here is selectable, so nothing can ever be saved by
// accident. Reuses the shared PermissionTree component in its readOnly mode
// (see PermissionTree.js create()), showing the FULL tree (not just the
// contracted slice) with each row marked habilitado/bloqueado, so GEIPSA can
// see both what the client has and what they're missing.
const adminAccessModal = document.getElementById('admin-access-modal');
const adminAccessSubtitle = document.getElementById('admin-access-subtitle');
const adminAccessTreeContainer = document.getElementById('admin-access-tree-container');
const adminAccessError = document.getElementById('admin-access-error');
const adminAccessCancelBtn = document.getElementById('admin-access-cancel');

function closeAdminAccessModal() {
    adminAccessModal.hidden = true;
}

async function openAdminAccessModal(client) {
    if (!client.adminUsername) return;
    adminAccessSubtitle.textContent = `${client.company_name} — ${client.adminUsername}`;
    adminAccessError.hidden = true;
    try {
        const [modulesRes, costCentersRes] = await Promise.all([
            fetch(`/api/admin/clients/${client.id}/modules`, { credentials: 'include' }),
            fetch(`/api/admin/clients/${client.id}/cost-centers`, { credentials: 'include' }),
        ]);
        if (!modulesRes.ok || !costCentersRes.ok) throw new Error('load failed');
        const modulesData = await modulesRes.json();
        const costCentersData = await costCentersRes.json();
        const enabledModuleKeys = (modulesData.modules || []).filter((m) => m.enabled).map((m) => m.key);
        const tree = window.PermissionTree.create(adminAccessTreeContainer, {
            readOnly: true,
            enabledModuleKeys,
            costCenters: costCentersData.costCenters || [],
        });
        await tree.init([]);
        adminAccessModal.hidden = false;
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

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
    if (!colorModal.hidden) colorModalPaletteWidget?.refreshLabels();
});

// "+ Nuevo Cliente" — same toolbar-button placement/style as Mis Planes'
// "+ Agregar Plan Nuevo" (Inicio-en.css .data-table-new-record-btn,
// prepended into the .data-table-zoom bar Dashboard.js already renders for
// every .data-table-wrapper), navigating to the existing dedicated
// creation page (Admin-ClienteNuevo.html) — Nuestros Clientes never had an
// inline create flow, no reason to build one now just for this button.
function renderNewClientButton() {
    const wrapper = document.querySelector('[data-table-id="nuestros-clientes"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="menu.addClientNew">${Dashboard.t('menu.addClientNew')}</span>`;
    btn.addEventListener('click', () => { window.location.href = 'Admin-ClienteNuevo.html'; });
    toolbar.prepend(btn);
}

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
        renderNewClientButton();
        await Promise.all([loadClients(), loadPlans(), loadModuleCatalog()]);
    } catch (err) {
        console.error('Admin (SaaS) failed to initialize:', err);
    }
})();
