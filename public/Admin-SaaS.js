// ---------------------------------------------------------------------------
// "Nuestros Clientes" — SaaS admin screen: full client roster with everything
// sold to each one (plan, contract, cost centers, permission adicionales).
// The edit modal (#client-edit-modal) does double duty as the create modal
// too — see startEdit() vs openCreateClientModal(), both just populate/
// clear the same form and open it; the submit handler branches POST vs
// PATCH on whether an id is set. Shell (sidebar, i18n, settings, logout)
// comes from Dashboard.js.
//
// Access note: the sidebar only shows this page's link to admins, and the
// redirect below covers anyone who lands here directly without the role —
// but the actual enforcement is server-side (requireAdmin on every
// /api/admin/* route in server.js). This redirect is UX only.
// ---------------------------------------------------------------------------

// --- Client edit modal ---------------------------------------------------------
const clientEditModal = document.getElementById('client-edit-modal');
const clientEditModalTitle = document.getElementById('client-edit-modal-title');
const form = document.getElementById('client-form');
const idField = document.getElementById('client-id');
const companyField = document.getElementById('client-company');
const razonSocialField = document.getElementById('client-razon-social');
const contactField = document.getElementById('client-contact');
const emailField = document.getElementById('client-email');
const phoneField = document.getElementById('client-phone');
const planField = document.getElementById('client-plan');
const sectorField = document.getElementById('client-sector');
const statusField = document.getElementById('client-status');
const isTestField = document.getElementById('client-is-test');
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
const contractedCostDisplay = document.getElementById('client-contracted-cost-display');
const initialPaymentField = document.getElementById('client-initial-payment');
const monthlyPaymentField = document.getElementById('client-monthly-payment');
const extraCostCentersField = document.getElementById('client-extra-cost-centers');
const contractInput = document.getElementById('client-contract');
const contractDataField = document.getElementById('client-contract-data');
const contractFilenameField = document.getElementById('client-contract-filename');
const contractNameLabel = document.getElementById('client-contract-name');
const contractClearBtn = document.getElementById('client-contract-clear');
const contractWordInput = document.getElementById('client-contract-word');
const contractWordDataField = document.getElementById('client-contract-word-data');
const contractWordFilenameField = document.getElementById('client-contract-word-filename');
const contractWordNameLabel = document.getElementById('client-contract-word-name');
const contractWordClearBtn = document.getElementById('client-contract-word-clear');
const paletteContainer = document.getElementById('client-color-palette');
let paletteWidget; // created after Dashboard.initDashboard() so i18n labels are ready — see init() below
const errorBanner = document.getElementById('client-form-error');
const submitBtn = document.getElementById('client-form-submit');
const cancelBtn = document.getElementById('client-form-cancel');
const tableBody = document.getElementById('clients-table-body');
const emptyMsg = document.getElementById('clients-empty');

let clients = [];
let plans = [];
let sectors = []; // Nuestros Sectores de Negocio catalog — [{id, name, ...}]

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
}

// validateClientBody (server.js) returns plain English text meant for
// developers, never run through i18n -- this maps the ones a real admin can
// actually trigger via this form back to a translated message, same pattern
// already used elsewhere for "Cost center limit reached"/"A cost center
// with that code already exists". Falls back to the raw string for
// anything not covered here (no worse than before this map existed).
const CLIENT_FORM_ERROR_MAP = [
    ['companyName, contactName and email are required.', 'admin.requiredFields'],
    ['billingEmail must be a valid email address.', 'admin.errBillingEmailInvalid'],
    ['La cantidad de caracteres no corresponden a un RFC', 'admin.rfcLengthError'],
    ['companyAbbreviation must be at most 6 characters.', 'admin.errCompanyAbbreviationLength'],
    ['logoDataUrl must be an image data URL.', 'admin.errLogoFormat'],
    ['Logo image is too large (max ~350KB).', 'admin.errLogoTooLarge'],
    ['contractFileDataUrl must be a PDF data URL.', 'admin.errContractFormat'],
    ['Contract file is too large (max ~5MB).', 'admin.errContractTooLarge'],
    ['contractWordDataUrl must be a Word document data URL.', 'admin.errContractWordFormat'],
    ['Contract Word file is too large (max ~5MB).', 'admin.errContractWordTooLarge'],
    ['contractStartDate must be a date in YYYY-MM-DD format.', 'admin.errContractStartDateFormat'],
    ['contractRegisteredDate must be a date in YYYY-MM-DD format.', 'admin.errContractRegisteredDateFormat'],
    ['contractEndDate must be a date in YYYY-MM-DD format.', 'admin.errContractEndDateFormat'],
    ['monthlyPayment must be a number >= 0.', 'admin.errMonthlyPaymentInvalid'],
    ['initialPayment must be a number >= 0.', 'admin.errInitialPaymentInvalid'],
    ['primaryColor must be a hex color like #1a73e8.', 'admin.errPrimaryColorInvalid'],
    ['secondaryColor must be a hex color like #1a73e8.', 'admin.errSecondaryColorInvalid'],
];
function translateClientFormError(message) {
    if (!message) return Dashboard.t('admin.saveError');
    const entry = CLIENT_FORM_ERROR_MAP.find(([raw]) => raw === message);
    return entry ? Dashboard.t(entry[1]) : message;
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

// Contrato PDF: a data: URL in the same row, bigger size cap (real PDFs, not
// small branding images) and a different accepted MIME.
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

// Segundo documento de contrato (Word, editable) — same data-URL-in-the-
// record pattern as the PDF above.
function setContractWordPreview(dataUrl, filename) {
    contractWordDataField.value = dataUrl || '';
    contractWordFilenameField.value = filename || '';
    if (dataUrl) {
        contractWordNameLabel.textContent = filename || '';
        contractWordNameLabel.hidden = false;
        contractWordClearBtn.hidden = false;
    } else {
        contractWordNameLabel.hidden = true;
        contractWordClearBtn.hidden = true;
    }
}

contractWordInput.addEventListener('change', () => {
    const file = contractWordInput.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        showError(Dashboard.t('admin.saveError'));
        contractWordInput.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = () => setContractWordPreview(reader.result, file.name);
    reader.readAsDataURL(file);
});

contractWordClearBtn.addEventListener('click', () => {
    contractWordInput.value = '';
    setContractWordPreview('', '');
});

// COSTO $ CONTRATADO is read-only now, computed live from whichever plan is
// selected in the form (accessPermissionsCost + costCentersLimit *
// costPerCostCenter) — same formula the server sends back as
// contractedCostComputed, recomputed here so switching the Plan dropdown
// updates the preview before the client is even saved.
function updateContractedCostPreview() {
    const plan = plans.find((p) => p.name === planField.value);
    if (!plan) {
        contractedCostDisplay.textContent = '—';
        return;
    }
    const total = (plan.accessPermissionsCost || 0) + (plan.costCentersLimit || 0) * (plan.costPerCostCenter || 0);
    contractedCostDisplay.textContent = Dashboard.formatCurrency(total, plan.currency || 'MXN');
}
planField.addEventListener('change', updateContractedCostPreview);

function openClientEditModal() {
    clientEditModal.hidden = false;
}

// This modal is edit-only here (creating a client lives on its own page, +
// Agregar Cliente Nuevo) — it only ever appears via startEdit, and hides
// again once you're done with it.
function resetForm() {
    form.reset();
    clientEditModal.hidden = true;
    idField.value = '';
    setLogoPreview('');
    setContractPreview('', '');
    setContractWordPreview('', '');
    paletteWidget.setPalette(null);
    clearError();
}

function formatMoney(value) {
    const n = Number(value) || 0;
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Mirrors db.js's own padAccountNumber -- the raw account_number column is
// just an integer, padded to 6 digits only for display here.
function padAccountNumber(n) {
    return String(n).padStart(6, '0');
}

function textCell(value) {
    const td = document.createElement('td');
    td.textContent = value || '—';
    return td;
}

// Meses de calendario completos entre dos fechas (no días/30) — ej.
// 2024-01-15 a 2026-01-15 = 24 exactos. null si falta alguna fecha.
function contractTermMonths(startDate, endDate) {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (end.getDate() < start.getDate()) months -= 1;
    return Math.max(0, months);
}

// Matches, in order, the <th data-col> values in the "Nuestros Clientes"
// table (Admin-SaaS.html) and the tr.append(...) call in renderClients().
const DATA_TABLE_CLIENT_COLUMNS = [
    'bigDateNumber', 'accountNumber', 'rfc', 'razonSocial', 'companyNickname', 'companyAbbreviation',
    'logo', 'institutionalColor', 'ownerName', 'contactName', 'billingEmail',
    'contractStartDate', 'contractFile', 'contractWordFile', 'plan', 'sectorNegocio',
    'contractedCost', 'initialPayment', 'monthlyPayment',
    'costCenters', 'costCentersContracted', 'anexoChanges',
    'contractRegisteredDate', 'contractEndDate', 'contractTerm',
    'permisosContratados', 'pagoPorAdicionales',
    'username', 'status',
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
    'actions',
];
// The 13 "Control Interno" system columns (see getSystemColumnsForRecord in
// db.js), in the same order as their entries above.
const SYSTEM_COLUMN_KEYS = DATA_TABLE_CLIENT_COLUMNS.filter((k) => k.startsWith('colSys'));
function systemCell(value) {
    const td = textCell(value);
    td.className = 'col-system';
    return td;
}

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
    // No per-column permission model like the operational tables — just 2
    // whole-row actions (Editar, Activar/Desactivar), each its own Equipo
    // SaaS leaf (see Admin-EquipoSaaS.js's tree). Computed once per render,
    // not per row: it's the same grant for every row on this screen.
    const canEditClients = Dashboard.hasSaasScreenGrant('saas-clients', 'editar');
    const canActivateClients = Dashboard.hasSaasScreenGrant('saas-clients', 'activar');
    const canResetClients = Dashboard.hasSaasScreenGrant('saas-clients', 'reset');
    clients.forEach((client) => {
        const tr = document.createElement('tr');
        tr.dataset.status = client.status;
        tr.classList.add('data-table-row-editable');

        const tdStatus = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `admin-badge admin-badge-${client.status}`;
        statusBadge.textContent = statusLabel(client.status);
        tdStatus.appendChild(statusBadge);
        if (client.is_test) {
            const testBadge = document.createElement('span');
            testBadge.className = 'client-test-badge';
            testBadge.textContent = Dashboard.t('admin.clientIsTestBadge');
            tdStatus.appendChild(testBadge);
        }

        const tdContract = document.createElement('td');
        tdContract.appendChild(iconButton('bx-file-blank', Dashboard.t('admin.viewContract'), () => {
            window.open(client.contract_file_data_url, '_blank');
        }, { disabled: !client.contract_file_data_url, title: client.contract_file_data_url ? '' : Dashboard.t('admin.noContractFile') }));

        const tdContractWord = document.createElement('td');
        tdContractWord.appendChild(iconButton('bx-file-blank', Dashboard.t('admin.contractWordFile'), () => {
            window.open(client.contract_word_data_url, '_blank');
        }, { disabled: !client.contract_word_data_url, title: client.contract_word_data_url ? '' : Dashboard.t('admin.noContractFile') }));

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

        const tdAnexoChanges = document.createElement('td');
        tdAnexoChanges.appendChild(iconButton('bx-history', Dashboard.t('admin.anexoChanges'), () => openAnexoChangesModal(client)));

        const planLimit = client.planCostCentersLimit ?? 0;
        const extraCC = client.extra_cost_centers || 0;
        const tdCostCentersContracted = textCell(
            extraCC > 0 ? Dashboard.t('admin.costCentersContractedWithExtra', { planLimit, extra: extraCC }) : String(planLimit),
        );

        const months = contractTermMonths(client.contract_start_date, client.contract_end_date);
        const tdContractTerm = textCell(months != null ? Dashboard.t('admin.contractTermMonths', { n: months }) : '');

        const tdPermisosContratados = document.createElement('td');
        tdPermisosContratados.appendChild(iconButton('bx-sitemap', Dashboard.t('admin.permisosContratadosTitle'), () => openPermisosContratadosModal(client)));

        const tdPagoPorAdicionales = textCell(
            `(${formatMoney(client.additionalCostCentersPayment || 0)} ${Dashboard.t('admin.additionalsCostCentersLabel')} + ${formatMoney(client.additionalPermissionsPayment || 0)} ${Dashboard.t('admin.additionalsPermissionsLabel')})`,
        );

        const appToggleBtn = iconButton(
            client.app_enabled ? 'bx-toggle-right' : 'bx-toggle-left',
            Dashboard.t(client.app_enabled ? 'menu.appToggleOn' : 'menu.appToggleOff'),
            () => toggleClientAppEnabled(client),
            {
                disabled: !canEditClients,
                title: canEditClients ? Dashboard.t(client.app_enabled ? 'menu.appToggleOn' : 'menu.appToggleOff') : Dashboard.t('admin.clientEditNoPermission'),
            },
        );
        appToggleBtn.classList.add(client.app_enabled ? 'admin-icon-btn-toggle-on' : 'admin-icon-btn-toggle-off');

        const tdActions = document.createElement('td');
        tdActions.className = 'admin-table-actions';
        tdActions.append(
            iconButton('bx-key', Dashboard.t('admin.adminAccessTitle'), () => openAdminAccessModal(client), {
                disabled: !client.adminUsername,
                title: client.adminUsername ? '' : Dashboard.t('admin.adminAccessNoAdminYet'),
            }),
            iconButton('bx-plus', Dashboard.t('admin.permisosAdicionalesTitle'), () => openPermisosAdicionalesModal(client)),
            iconButton('bx-edit', Dashboard.t('admin.edit'), () => startEdit(client), {
                disabled: !canEditClients,
                title: canEditClients ? '' : Dashboard.t('admin.clientEditNoPermission'),
            }),
            iconButton(
                client.status === 'inactivo' ? 'bx-check-circle' : 'bx-x-circle',
                Dashboard.t(client.status === 'inactivo' ? 'admin.activate' : 'admin.deactivate'),
                () => toggleClientStatus(client),
                {
                    disabled: !canActivateClients,
                    title: canActivateClients ? '' : Dashboard.t('admin.clientActivateNoPermission'),
                },
            ),
            appToggleBtn,
            iconButton('bx-trash-alt', Dashboard.t('admin.clientResetTooltip'), () => openResetClientModal(client), {
                disabled: !canResetClients,
                title: canResetClients ? Dashboard.t('admin.clientResetTooltip') : Dashboard.t('admin.clientResetNoPermission'),
                danger: true,
            }),
        );

        tr.append(
            textCell(client.big_date_number),
            textCell(client.account_number != null ? padAccountNumber(client.account_number) : ''),
            textCell(client.rfc),
            textCell(client.razon_social),
            textCell(client.company_nickname),
            textCell(client.company_abbreviation),
            tdLogo,
            tdColor,
            textCell(client.owner_name),
            textCell(client.contact_name),
            textCell(client.billing_email),
            textCell(client.contract_start_date),
            tdContract,
            tdContractWord,
            textCell(client.plan),
            textCell(client.sector_negocio),
            textCell(formatMoney(client.contractedCostComputed)),
            textCell(formatMoney(client.initial_payment)),
            textCell(formatMoney(client.monthly_payment)),
            textCell(`${client.costCentersUsed ?? 0} / ${client.cost_centers_limit ?? 0}`),
            tdCostCentersContracted,
            tdAnexoChanges,
            textCell(client.contract_registered_date),
            textCell(client.contract_end_date),
            tdContractTerm,
            tdPermisosContratados,
            tdPagoPorAdicionales,
            textCell(client.adminUsername),
            tdStatus,
            ...SYSTEM_COLUMN_KEYS.map((k) => systemCell(client[k])),
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
            const haystack = ['rfc', 'razonSocial', 'companyNickname', 'companyAbbreviation', 'ownerName', 'contactName']
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
// contractedCost is intentionally NOT included — the field is vestigial now
// (see db.js updateClient's COALESCE), the server just ignores it.
function clientToPayload(client) {
    return {
        companyName: client.company_name, contactName: client.contact_name, email: client.email,
        phone: client.phone, plan: client.plan, status: client.status,
        logoDataUrl: client.logo_data_url, seedColor: client.seed_color,
        colorPalette: client.color_palette ? JSON.parse(client.color_palette) : null,
        mission: client.mission, vision: client.vision, coreValues: client.core_values, history: client.history,
        rfc: client.rfc, companyNickname: client.company_nickname, companyAbbreviation: client.company_abbreviation,
        ownerName: client.owner_name, billingEmail: client.billing_email, razonSocial: client.razon_social,
        sectorNegocio: client.sector_negocio,
        contractStartDate: client.contract_start_date, contractRegisteredDate: client.contract_registered_date,
        contractEndDate: client.contract_end_date, contractFileDataUrl: client.contract_file_data_url, contractFileName: client.contract_file_name,
        contractWordDataUrl: client.contract_word_data_url, contractWordFileName: client.contract_word_file_name,
        monthlyPayment: client.monthly_payment, initialPayment: client.initial_payment,
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
    // Same gap as the form's own submit handler — this response is missing
    // the computed fields GET /api/admin/clients fills in, so reload
    // instead of splicing in an incomplete row.
    await loadClients();
    return updated;
}

// Activar/Desactivar is the day-to-day lifecycle toggle — clients can no
// longer be deleted (see server.js), only edited or (de)activated.
async function toggleClientStatus(client) {
    const nextStatus = client.status === 'inactivo' ? 'activo' : 'inactivo';
    try {
        await patchClient(client, { status: nextStatus });
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

// Independent from the rest of the record — its own dedicated route (see
// PATCH /api/admin/clients/:id/app-enabled), same idea as toggleClientStatus
// but never touches Estatus or anything else on the client.
async function toggleClientAppEnabled(client) {
    try {
        const res = await fetch(`/api/admin/clients/${client.id}/app-enabled`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ enabled: !client.app_enabled }),
        });
        if (!res.ok) throw new Error('save failed');
        await loadClients();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

function startEdit(client) {
    idField.value = client.id;
    companyField.value = client.company_name;
    razonSocialField.value = client.razon_social || '';
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
    if (client.sector_negocio && !sectorField.querySelector(`option[value="${CSS.escape(client.sector_negocio)}"]`)) {
        const option = document.createElement('option');
        option.value = client.sector_negocio;
        option.textContent = client.sector_negocio;
        sectorField.appendChild(option);
    }
    sectorField.value = client.sector_negocio || '';
    statusField.value = client.status;
    isTestField.checked = !!client.is_test;
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
    initialPaymentField.value = client.initial_payment || '';
    monthlyPaymentField.value = client.monthly_payment || '';
    extraCostCentersField.value = client.extra_cost_centers || 0;
    setContractPreview(client.contract_file_data_url || '', client.contract_file_name || '');
    setContractWordPreview(client.contract_word_data_url || '', client.contract_word_file_name || '');
    contractedCostDisplay.textContent = client.contractedCostComputed != null ? formatMoney(client.contractedCostComputed) : '—';
    let existingPalette = null;
    if (client.color_palette) {
        try { existingPalette = JSON.parse(client.color_palette); } catch { existingPalette = null; }
    }
    if (existingPalette) existingPalette.seed = client.seed_color || existingPalette.seed;
    paletteWidget.setPalette(existingPalette);
    clientEditModalTitle.textContent = Dashboard.t('admin.editClient');
    submitBtn.textContent = Dashboard.t('admin.save');
    clearError();
    openClientEditModal();
}

// "+ Nuevo Cliente" — same modal as Editar, "pantalla alterna" style, in
// create mode (empty id, POST instead of PATCH — see the form submit
// handler below) instead of navigating to a separate page
// (Admin-ClienteNuevo.html/.js, now removed).
function openCreateClientModal() {
    form.reset();
    idField.value = '';
    setLogoPreview('');
    setContractPreview('', '');
    setContractWordPreview('', '');
    paletteWidget.setPalette(null);
    contractedCostDisplay.textContent = '—';
    extraCostCentersField.value = 0;
    clientEditModalTitle.textContent = Dashboard.t('admin.addClient');
    submitBtn.textContent = Dashboard.t('admin.addClient');
    clearError();
    openClientEditModal();
}

async function loadClients() {
    try {
        const res = await fetch('/api/admin/clients', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        clients = data.clients || [];
        renderClients();
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

// --- Sector de Negocio: options come from Nuestros Sectores de Negocio ---
// (same /api/admin/business-sectors catalog Nuestras APPs' own Sector field
// uses) — independent of whether an App already exists for that sector;
// getClientAppScreens simply shows nothing in the permission tree until
// GEIPSA builds one.
function populateSectorSelect() {
    const previousValue = sectorField.value;
    sectorField.querySelectorAll('option:not([value=""])').forEach((opt) => opt.remove());
    sectorField.querySelector('option[value=""]').textContent =
        sectors.length ? Dashboard.t('menu.appSectorChoosePlaceholder') : Dashboard.t('menu.appSectorNoneAvailable');
    sectors.forEach((s) => {
        const option = document.createElement('option');
        option.value = s.name;
        option.textContent = s.name;
        sectorField.appendChild(option);
    });
    // Same "don't silently erase a stale value" rule as populatePlanSelect.
    if (previousValue && !sectors.some((s) => s.name === previousValue)) {
        const option = document.createElement('option');
        option.value = previousValue;
        option.textContent = previousValue;
        sectorField.appendChild(option);
    }
    sectorField.value = previousValue;
}

async function loadSectors() {
    try {
        const res = await fetch('/api/admin/business-sectors', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        sectors = data.sectors || [];
        populateSectorSelect();
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

    const rfc = rfcField.value.trim();
    if (rfc && rfc.length !== 13) {
        Dashboard.showToast(Dashboard.t('admin.rfcLengthError'), 'warning');
        return;
    }

    // Razón Social is legally significant — always confirm before saving,
    // even on an otherwise-unrelated edit, per the explicit request that
    // led to this field existing at all.
    if (!(await Dashboard.confirm(Dashboard.t('admin.razonSocialConfirm')))) return;

    const { seed, ...currentPalette } = paletteWidget.getPalette();
    const payload = {
        companyName,
        razonSocial: razonSocialField.value.trim(),
        contactName,
        email,
        phone: phoneField.value.trim(),
        plan: planField.value.trim(),
        sectorNegocio: sectorField.value.trim(),
        status: statusField.value,
        isTest: isTestField.checked,
        logoDataUrl: logoDataField.value || null,
        seedColor: seed,
        colorPalette: currentPalette,
        mission: missionField.value.trim(),
        vision: visionField.value.trim(),
        coreValues: valuesField.value.trim(),
        history: historyField.value.trim(),
        rfc,
        companyNickname: nicknameField.value.trim(),
        companyAbbreviation: abbreviationField.value.trim().slice(0, 6),
        ownerName: ownerField.value.trim(),
        billingEmail: billingEmailField.value.trim(),
        contractStartDate: contractStartField.value || null,
        contractRegisteredDate: contractRegisteredField.value || null,
        contractEndDate: contractEndField.value || null,
        contractFileDataUrl: contractDataField.value || null,
        contractFileName: contractFilenameField.value || null,
        contractWordDataUrl: contractWordDataField.value || null,
        contractWordFileName: contractWordFilenameField.value || null,
        initialPayment: initialPaymentField.value ? Number(initialPaymentField.value) : 0,
        monthlyPayment: monthlyPaymentField.value ? Number(monthlyPaymentField.value) : 0,
        extraCostCenters: Math.max(0, parseInt(extraCostCentersField.value, 10) || 0),
    };

    const editingId = idField.value;
    const isCreate = !editingId;

    submitBtn.disabled = true;
    try {
        const res = await fetch(isCreate ? '/api/admin/clients' : `/api/admin/clients/${editingId}`, {
            method: isCreate ? 'POST' : 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(translateClientFormError(body.message));
            return;
        }
        const { generatedAdmin, generatedTrainingAccount } = await res.json();
        // The saved client in this response is missing the computed fields
        // (contractedCostComputed, additionalPermissionsPayment, etc.) only
        // GET /api/admin/clients fills in — reload instead of splicing in
        // an incomplete row, or Costo Contratado/Pago por Adicionales would
        // silently show $0.00 for this row until the next full reload.
        await loadClients();
        resetForm();
        if (generatedAdmin) showGeneratedAdmin(generatedAdmin);
        if (generatedTrainingAccount) showGeneratedTraining(generatedTrainingAccount);
        Dashboard.showToast(Dashboard.t(isCreate ? 'main.recordSaved' : 'main.changeSaved'), 'success');
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

cancelBtn.addEventListener('click', resetForm);
clientEditModal.addEventListener('click', (event) => {
    if (event.target === clientEditModal) resetForm();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !clientEditModal.hidden) resetForm();
});

// --- One-time generated admin credentials (shown when a client is activated) -
// The password only ever exists in this box's own memory (never stored
// anywhere recoverable server-side — see applyClientLifecycle's comment in
// server.js), so "Mostrar"/"Reenviar correo" both work purely off the
// `current` closure below; neither survives a dismiss or page reload.
const generatedAdminBox = document.getElementById('generated-admin-box');
const generatedAdminUsername = document.getElementById('generated-admin-username');
const generatedAdminPassword = document.getElementById('generated-admin-password');
const generatedAdminReveal = document.getElementById('generated-admin-reveal');
const generatedAdminEmailSent = document.getElementById('generated-admin-email-sent');
const generatedAdminEmailTo = document.getElementById('generated-admin-email-to');
const generatedAdminEmailFailed = document.getElementById('generated-admin-email-failed');
const generatedAdminResend = document.getElementById('generated-admin-resend');
const generatedAdminDismiss = document.getElementById('generated-admin-dismiss');
let currentGeneratedAdmin = null;

function renderGeneratedAdminPassword(revealed) {
    generatedAdminPassword.textContent = revealed ? currentGeneratedAdmin.password : '••••••••••••';
    generatedAdminReveal.textContent = Dashboard.t(revealed ? 'admin.hidePassword' : 'admin.showPassword');
}

function showGeneratedAdmin(generatedAdmin) {
    currentGeneratedAdmin = generatedAdmin;
    generatedAdminUsername.textContent = generatedAdmin.username;
    const emailKnown = !!generatedAdmin.emailTo;
    generatedAdminEmailSent.hidden = !(emailKnown && generatedAdmin.emailSent);
    generatedAdminEmailFailed.hidden = !generatedAdmin.emailSent;
    generatedAdminEmailTo.textContent = generatedAdmin.emailTo || '';
    // Only worth hiding behind "Mostrar" when it actually reached the
    // client's inbox — if it didn't, this screen is the only remaining
    // copy, so show it plainly instead of adding a click before someone
    // can even read it.
    generatedAdminReveal.hidden = !generatedAdmin.emailSent;
    renderGeneratedAdminPassword(!generatedAdmin.emailSent);
    generatedAdminBox.hidden = false;
    generatedAdminBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let generatedAdminRevealed = false;
generatedAdminReveal.addEventListener('click', () => {
    generatedAdminRevealed = !generatedAdminRevealed;
    renderGeneratedAdminPassword(generatedAdminRevealed);
});

generatedAdminResend.addEventListener('click', async () => {
    if (!currentGeneratedAdmin) return;
    generatedAdminResend.disabled = true;
    try {
        const res = await fetch(`/api/admin/clients/${currentGeneratedAdmin.clientId}/resend-admin-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username: currentGeneratedAdmin.username, password: currentGeneratedAdmin.password }),
        });
        if (!res.ok) throw new Error('resend failed');
        const { emailSent, emailTo } = await res.json();
        currentGeneratedAdmin = { ...currentGeneratedAdmin, emailSent, emailTo };
        Dashboard.showToast(Dashboard.t(emailSent ? 'main.changeSaved' : 'admin.saveError'), emailSent ? 'success' : 'error');
        if (emailSent) showGeneratedAdmin(currentGeneratedAdmin);
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    } finally {
        generatedAdminResend.disabled = false;
    }
});

generatedAdminDismiss.addEventListener('click', () => {
    generatedAdminBox.hidden = true;
    currentGeneratedAdmin = null;
    generatedAdminRevealed = false;
});

// --- One-time generated Pruebas<Apodo> credentials (same idea as the admin
// box above, shown alongside it the first time a client is activated) ------
const generatedTrainingBox = document.getElementById('generated-training-box');
const generatedTrainingUsername = document.getElementById('generated-training-username');
const generatedTrainingPassword = document.getElementById('generated-training-password');
const generatedTrainingDismiss = document.getElementById('generated-training-dismiss');

function showGeneratedTraining({ username, password }) {
    generatedTrainingUsername.textContent = username;
    generatedTrainingPassword.textContent = password;
    generatedTrainingBox.hidden = false;
    generatedTrainingBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

generatedTrainingDismiss.addEventListener('click', () => {
    generatedTrainingBox.hidden = true;
});

// --- Cambios de Anexos: read-only history of every módulo that entered or
// left extra_modules the old (flat, whole-module) way — kept for the
// historical record; nothing writes to it anymore (see server.js's
// permission-grants route). -------------------------------------------------
const anexoChangesModal = document.getElementById('anexo-changes-modal');
const anexoChangesSubtitle = document.getElementById('anexo-changes-subtitle');
const anexoChangesTableBody = document.getElementById('anexo-changes-table-body');
const anexoChangesCloseBtn = document.getElementById('anexo-changes-close');

let moduleCatalog = []; // { key, labelKey } — used to label módulo names in the history table

async function loadModuleCatalog() {
    const res = await fetch('/api/admin/modules', { credentials: 'include' });
    if (!res.ok) throw new Error('load failed');
    const data = await res.json();
    moduleCatalog = data.modules || [];
}

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

// --- Permisos Contratados: read-only tricolor tree (verde = incluido en el
// plan, amarillo = vendido como adicional, rojo = no contratado) — replaces
// the old ★-based Active Tree modal now that coverage is tracked down to
// Columna instead of just 21 flat módulos. -----------------------------------
const permisosContratadosModal = document.getElementById('permisos-contratados-modal');
const permisosContratadosSubtitle = document.getElementById('permisos-contratados-subtitle');
const permisosContratadosContainer = document.getElementById('permisos-contratados-container');
const permisosContratadosError = document.getElementById('permisos-contratados-error');
const permisosContratadosCloseBtn = document.getElementById('permisos-contratados-close');

async function loadClientPlanCosts(client) {
    if (!client.plan) return [];
    const plan = plans.find((p) => p.name === client.plan);
    if (!plan) return [];
    const res = await fetch(`/api/admin/plans/${plan.id}/permission-costs`, { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.costs || [];
}

function closePermisosContratadosModal() {
    permisosContratadosModal.hidden = true;
}

async function openPermisosContratadosModal(client) {
    permisosContratadosSubtitle.textContent = client.company_name;
    permisosContratadosError.hidden = true;
    permisosContratadosContainer.innerHTML = '';
    try {
        const [grantsRes, costs] = await Promise.all([
            fetch(`/api/admin/clients/${client.id}/permission-grants`, { credentials: 'include' }),
            loadClientPlanCosts(client),
        ]);
        if (!grantsRes.ok) throw new Error('load failed');
        const { grants, planGrants } = await grantsRes.json();
        const plan = client.plan ? plans.find((p) => p.name === client.plan) : null;
        const tree = window.PermissionCostTree.create(permisosContratadosContainer, {
            mode: 'clientTricolor', interactive: false, currency: plan?.currency || 'MXN',
        });
        await tree.init(planGrants || [], costs, grants || []);
        permisosContratadosModal.hidden = false;
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

permisosContratadosCloseBtn.addEventListener('click', closePermisosContratadosModal);
permisosContratadosModal.addEventListener('click', (event) => {
    if (event.target === permisosContratadosModal) closePermisosContratadosModal();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !permisosContratadosModal.hidden) closePermisosContratadosModal();
});

// --- + Adicionales: same tricolor tree, but interactive — only red (not
// contracted by the plan) nodes are selectable, and selecting one prices it
// against the plan's own Costo Accesos-Permisos sheet (a client never has
// its own separate price list). Saving here is what can also turn on REAL
// access for the client (see syncClientModulesFromPermissionGrants in
// db.js) — only when a whole módulo ends up 100% covered, never partially,
// never for free (its cost is always summed the same way it's billed). ------
const permisosAdicionalesModal = document.getElementById('permisos-adicionales-modal');
const permisosAdicionalesSubtitle = document.getElementById('permisos-adicionales-subtitle');
const permisosAdicionalesContainer = document.getElementById('permisos-adicionales-container');
const permisosAdicionalesError = document.getElementById('permisos-adicionales-error');
const permisosAdicionalesTotal = document.getElementById('permisos-adicionales-total');
const permisosAdicionalesSaveBtn = document.getElementById('permisos-adicionales-save');
const permisosAdicionalesCloseBtn = document.getElementById('permisos-adicionales-close');

let adicionalesTree = null;
let adicionalesClientId = null;
let adicionalesCurrency = 'MXN';

function updateAdicionalesTotal() {
    if (!adicionalesTree) return;
    // The tree rebuilds its own DOM synchronously inside the very click that
    // triggers this listener (see PermissionCostTree.js's checkbox change
    // handler) — a microtask tick keeps this read after that rebuild lands.
    setTimeout(() => {
        if (!adicionalesTree) return;
        const total = adicionalesTree.getAdditionalCostTotal();
        permisosAdicionalesTotal.textContent = Dashboard.t('admin.additionalsPermissionsPreview', {
            amount: Dashboard.formatCurrency(total, adicionalesCurrency),
        });
    }, 0);
}

function closePermisosAdicionalesModal() {
    permisosAdicionalesModal.hidden = true;
    permisosAdicionalesContainer.removeEventListener('click', updateAdicionalesTotal);
    adicionalesTree = null;
    adicionalesClientId = null;
}

async function openPermisosAdicionalesModal(client) {
    adicionalesClientId = client.id;
    permisosAdicionalesSubtitle.textContent = client.company_name;
    permisosAdicionalesError.hidden = true;
    permisosAdicionalesTotal.textContent = '';
    permisosAdicionalesContainer.innerHTML = '';
    try {
        const [grantsRes, costs] = await Promise.all([
            fetch(`/api/admin/clients/${client.id}/permission-grants`, { credentials: 'include' }),
            loadClientPlanCosts(client),
        ]);
        if (!grantsRes.ok) throw new Error('load failed');
        const { grants, planGrants } = await grantsRes.json();
        const plan = client.plan ? plans.find((p) => p.name === client.plan) : null;
        adicionalesCurrency = plan?.currency || 'MXN';
        adicionalesTree = window.PermissionCostTree.create(permisosAdicionalesContainer, {
            mode: 'clientTricolor', interactive: true, currency: adicionalesCurrency,
        });
        await adicionalesTree.init(planGrants || [], costs, grants || []);
        updateAdicionalesTotal();
        permisosAdicionalesContainer.addEventListener('click', updateAdicionalesTotal);
        permisosAdicionalesModal.hidden = false;
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

permisosAdicionalesSaveBtn.addEventListener('click', async () => {
    if (!adicionalesClientId || !adicionalesTree) return;
    const total = adicionalesTree.getAdditionalCostTotal();
    const confirmed = await Dashboard.confirm(Dashboard.t('admin.additionalsConfirmMessage', {
        amount: Dashboard.formatCurrency(total, adicionalesCurrency),
    }));
    if (!confirmed) return;
    permisosAdicionalesSaveBtn.disabled = true;
    permisosAdicionalesError.hidden = true;
    try {
        const res = await fetch(`/api/admin/clients/${adicionalesClientId}/permission-grants`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ grants: adicionalesTree.getClientGrants() }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            permisosAdicionalesError.textContent = body.message || Dashboard.t('admin.saveError');
            permisosAdicionalesError.hidden = false;
            return;
        }
        await loadClients();
        closePermisosAdicionalesModal();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        permisosAdicionalesError.textContent = Dashboard.t('admin.saveError');
        permisosAdicionalesError.hidden = false;
    } finally {
        permisosAdicionalesSaveBtn.disabled = false;
    }
});
permisosAdicionalesCloseBtn.addEventListener('click', closePermisosAdicionalesModal);
permisosAdicionalesModal.addEventListener('click', (event) => {
    if (event.target === permisosAdicionalesModal) closePermisosAdicionalesModal();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !permisosAdicionalesModal.hidden) closePermisosAdicionalesModal();
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

// Reiniciar (borrar todo) — the ONE hard-delete this screen exposes, and
// only for a TEST client (see server.js's own comment on why every OTHER
// client action stops at Activar/Desactivar). Gated behind its own narrow
// 'reset' Equipo SaaS grant, PLUS this type-the-company-name confirm so a
// stray click can never trigger it — the confirm button stays disabled
// until what's typed matches exactly.
const resetClientModal = document.getElementById('reset-client-modal');
const resetClientWarning = document.getElementById('reset-client-warning');
const resetClientInput = document.getElementById('reset-client-confirm-input');
const resetClientError = document.getElementById('reset-client-error');
const resetClientConfirmBtn = document.getElementById('reset-client-confirm-btn');
const resetClientCancelBtn = document.getElementById('reset-client-cancel');
let resetClientTarget = null;

function closeResetClientModal() {
    resetClientModal.hidden = true;
    resetClientTarget = null;
    resetClientInput.value = '';
}

function openResetClientModal(client) {
    resetClientTarget = client;
    resetClientWarning.textContent = Dashboard.t('admin.clientResetWarning', { company: client.company_name });
    resetClientInput.value = '';
    resetClientConfirmBtn.disabled = true;
    resetClientError.hidden = true;
    resetClientModal.hidden = false;
    resetClientInput.focus();
}

resetClientInput.addEventListener('input', () => {
    resetClientConfirmBtn.disabled = !resetClientTarget || resetClientInput.value !== resetClientTarget.company_name;
});

resetClientConfirmBtn.addEventListener('click', async () => {
    if (!resetClientTarget || resetClientInput.value !== resetClientTarget.company_name) return;
    resetClientConfirmBtn.disabled = true;
    try {
        const res = await fetch(`/api/admin/clients/${resetClientTarget.id}/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ companyName: resetClientTarget.company_name }),
        });
        if (!res.ok) throw new Error('reset failed');
        const company = resetClientTarget.company_name;
        closeResetClientModal();
        await loadClients();
        Dashboard.showToast(Dashboard.t('admin.clientResetSuccess', { company }), 'success');
    } catch {
        resetClientError.textContent = Dashboard.t('admin.saveError');
        resetClientError.hidden = false;
        resetClientConfirmBtn.disabled = false;
    }
});

resetClientCancelBtn.addEventListener('click', closeResetClientModal);
resetClientModal.addEventListener('click', (event) => {
    if (event.target === resetClientModal) closeResetClientModal();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !resetClientModal.hidden) closeResetClientModal();
});

document.addEventListener('dashboard:language-changed', () => {
    renderClients();
    if (!colorModal.hidden) colorModalPaletteWidget?.refreshLabels();
    if (!clientEditModal.hidden) {
        const isCreate = !idField.value;
        clientEditModalTitle.textContent = Dashboard.t(isCreate ? 'admin.addClient' : 'admin.editClient');
        submitBtn.textContent = Dashboard.t(isCreate ? 'admin.addClient' : 'admin.save');
    }
});

// "+ Nuevo Cliente" — same toolbar-button placement/style as Mis Planes'
// "+ Agregar Plan Nuevo" (Inicio-en.css .data-table-new-record-btn,
// prepended into the .data-table-zoom bar Dashboard.js already renders for
// every .data-table-wrapper) — opens the same edit modal in create mode
// ("pantalla alterna"), same pattern as Editar, instead of navigating to a
// separate page (Admin-ClienteNuevo.html/.js, now removed).
function renderNewClientButton() {
    if (!Dashboard.hasSaasScreenGrant('saas-clients', 'crear')) return;
    const wrapper = document.querySelector('[data-table-id="nuestros-clientes"]');
    const toolbar = wrapper?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom')) return;
    if (toolbar.querySelector('.data-table-new-record-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-new-record-btn';
    btn.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span data-i18n="menu.addClientNew">${Dashboard.t('menu.addClientNew')}</span>`;
    btn.addEventListener('click', openCreateClientModal);
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
        await Promise.all([loadClients(), loadPlans(), loadSectors(), loadModuleCatalog()]);
    } catch (err) {
        console.error('Admin (SaaS) failed to initialize:', err);
    }
})();
