// ---------------------------------------------------------------------------
// Shared shell for every authenticated dashboard-style page: top bar,
// sidebar, i18n, language/style settings dropdown, and logout. Page-specific
// content lives in each page's own <script>, which calls
// Dashboard.initDashboard({ activePage }) once the DOM is ready.
//
// SECURITY NOTE: authGuard() below is a client-side UX guard only — it stops
// a signed-out user from briefly seeing a stale page, but it is NOT real
// access control. Every API call this page makes is authenticated again by
// the backend (session cookie), and admin-only routes are enforced there too
// (see requireAdmin in server.js) — the redirects here are just UX.
// ---------------------------------------------------------------------------

// --- CSRF token on every mutating fetch (security review, 2026-09-28,
// finding #04) -------------------------------------------------------------
// Patches window.fetch ONCE, here, before any page-specific script (loaded
// after this one in every page's <script> order) makes its first call --
// every existing `fetch(...)` call site across the whole desktop app keeps
// working unchanged, this just adds the header underneath it. Only touches
// same-origin POST/PUT/PATCH/DELETE calls -- GETs don't need it, and a
// third-party PUT (e.g. an evidence upload straight to R2's presigned URL)
// must NOT get an extra header it doesn't expect, or its own CORS policy
// rejects the preflight. See requireCsrf/issueCsrfCookie in server.js for
// why the token comes from localStorage (set at login, see login.js) rather
// than read back from the cookie -- on the desktop site that distinction
// doesn't matter (it's same-origin either way), but the exact same patch is
// mirrored in AppConfig.js for the mobile/PWA side, where it does.
(function installCsrfFetchPatch() {
    const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    const originalFetch = window.fetch.bind(window);
    function getToken() {
        try { return localStorage.getItem('sgn_csrf_token'); } catch { return null; }
    }
    function setToken(token) {
        try { localStorage.setItem('sgn_csrf_token', token); } catch { /* ignore */ }
    }
    function isSameOrigin(url) {
        try { return new URL(url, window.location.href).origin === window.location.origin; } catch { return false; }
    }
    window.fetch = async function (input, init = {}) {
        const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
        const url = input instanceof Request ? input.url : input;
        if (!MUTATING.has(method) || !isSameOrigin(url)) return originalFetch(input, init);

        const attempt = (token) => originalFetch(input, { ...init, headers: { ...(init.headers || {}), 'X-CSRF-Token': token || '' } });
        let res = await attempt(getToken());
        if (res.status === 403 && !getToken()) {
            // Rollout gap: a session that was already open before this
            // feature shipped never got a token at login -- mint one now
            // (the session cookie alone is enough to authorize this) and
            // retry once, so nobody has to log out/in for this to start
            // working.
            try {
                const tokenRes = await originalFetch('/api/auth/csrf-token', { credentials: 'include' });
                if (tokenRes.ok) {
                    const { csrfToken } = await tokenRes.json();
                    if (csrfToken) { setToken(csrfToken); res = await attempt(csrfToken); }
                }
            } catch { /* leave the original 403 response as-is */ }
        }
        return res;
    };
})();

// --- Toast notifications (Éxito/Error/Info/Advertencia) --------------------
// Dashboard.showToast(message, type, { title, duration }) -- a lightweight
// replacement for the ad-hoc alert()/inline-error-text patterns scattered
// across every page's own JS. Stacks in a fixed corner, auto-dismisses
// (duration: 0 to keep it until closed by hand), never blocks the page the
// way alert() does. Exported on window.Dashboard at the bottom of this file.
const TOAST_ICONS = { success: 'bx-check-circle', error: 'bx-x-circle', info: 'bx-info-circle', warning: 'bx-error' };
const TOAST_TITLE_KEYS = {
    success: 'main.toastSuccessTitle', error: 'main.toastErrorTitle',
    info: 'main.toastInfoTitle', warning: 'main.toastWarningTitle',
};
const TOAST_DEFAULT_DURATION = 3000;

function ensureToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }
    return container;
}

function showToast(message, type = 'info', { title, duration = TOAST_DEFAULT_DURATION } = {}) {
    const kind = TOAST_ICONS[type] ? type : 'info';
    const container = ensureToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${kind}`;
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');

    const iconBadge = document.createElement('span');
    iconBadge.className = 'toast-icon-badge';
    const icon = document.createElement('i');
    icon.className = `bx ${TOAST_ICONS[kind]}`;
    icon.setAttribute('aria-hidden', 'true');
    iconBadge.appendChild(icon);

    const msgEl = document.createElement('p');
    msgEl.className = 'toast-message';
    const titleEl = document.createElement('strong');
    titleEl.className = 'toast-title';
    titleEl.textContent = `${title || t(TOAST_TITLE_KEYS[kind])}: `;
    msgEl.append(titleEl, document.createTextNode(message));

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', t('main.close'));
    closeBtn.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';

    const progress = document.createElement('div');
    progress.className = 'toast-progress';

    let dismissTimer = null;
    const close = () => {
        if (dismissTimer) clearTimeout(dismissTimer);
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        // Fallback in case the transitionend listener above never fires
        // (e.g. prefers-reduced-motion skips the transition entirely).
        setTimeout(() => toast.remove(), 300);
    };
    closeBtn.addEventListener('click', close);

    toast.append(iconBadge, msgEl, closeBtn, progress);
    container.appendChild(toast);
    // Force layout before adding the visible class (and starting the
    // progress-bar shrink) so both transitions actually play instead of
    // snapping straight to their end state on the very first frame.
    void toast.offsetWidth;
    toast.classList.add('toast-visible');
    if (duration) {
        progress.style.transitionDuration = `${duration}ms`;
        progress.style.width = '0';
        dismissTimer = setTimeout(close, duration);
    } else {
        progress.style.display = 'none';
    }
    return { close };
}

// --- Confirm dialog (styled replacement for window.confirm) ----------------
// Dashboard.confirm(message) -- returns a Promise<boolean>. Same visual
// language as the toast system (colored icon badge, surface card) but a
// blocking modal with Aceptar/Cancelar, since every caller needs a boolean
// answer before continuing (a toast alone can't do that). One hidden
// overlay is reused across every call instead of building a new DOM tree
// each time.
function ensureConfirmModal() {
    let modal = document.getElementById('confirm-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'confirm-modal';
    modal.className = 'modal-overlay confirm-modal-overlay';
    modal.hidden = true;
    modal.innerHTML = `
        <div class="modal-panel confirm-modal-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-message">
            <span class="confirm-modal-icon-badge"><i class="bx bx-help-circle" aria-hidden="true"></i></span>
            <p class="confirm-modal-message" id="confirm-modal-message"></p>
            <div class="admin-form-actions confirm-modal-actions">
                <button type="button" class="btn btn-secondary" id="confirm-modal-cancel"></button>
                <button type="button" class="btn" id="confirm-modal-accept"></button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function confirmDialog(message) {
    return new Promise((resolve) => {
        const modal = ensureConfirmModal();
        modal.querySelector('.confirm-modal-message').textContent = message;
        const acceptBtn = modal.querySelector('#confirm-modal-accept');
        const cancelBtn = modal.querySelector('#confirm-modal-cancel');
        acceptBtn.textContent = t('admin.confirmAccept');
        cancelBtn.textContent = t('admin.cancel');

        const done = (result) => {
            modal.hidden = true;
            acceptBtn.removeEventListener('click', onAccept);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKeydown);
            resolve(result);
        };
        const onAccept = () => done(true);
        const onCancel = () => done(false);
        const onBackdrop = (event) => { if (event.target === modal) done(false); };
        const onKeydown = (event) => { if (event.key === 'Escape') done(false); };

        acceptBtn.addEventListener('click', onAccept);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKeydown);

        modal.hidden = false;
        acceptBtn.focus();
    });
}

const API_BASE = window.APP_CONFIG?.apiBase || '/api';
const SUPPORTED_LANGS = ['en', 'es'];
const DEFAULT_LANG = 'en';

let dict = {};
let menuData = null;
let currentLang = DEFAULT_LANG;
let currentRole = null;
let clientBranding = null;
let currentUser = null;

// Embedded fallback so the UI still works even when i18n/*.json can't be
// fetched (e.g. opened as a file:// page). Keep in sync with i18n/en.json /
// i18n/es.json.
const EMBEDDED_TRANSLATIONS = {
    en: {
        meta: { loginTitle: "SGN by GEIPSA - Login", dashboardTitle: "SGN - Home" },
        sidebar: { brand: "SGN", searchPlaceholder: "Search", searchNoResults: "No matches found.", notifications: "Notifications", settings: "Settings", logout: "Log out", logoutConfirm: "Are you sure you want to log out?", logoutConfirmGreeting: "{name}, are you sure you want to log out?", department: "Department", deptAbbr: { finance: "FIN", accounting: "ACC", humanResources: "HR", marketing: "MKT", commercial: "COM", purchasing: "PUR", supplyChain: "SCM", managementControl: "MC", generalManagement: "GM", steeringCommittee: "STC", certifications: "CERT" }, area: "Area", costCenters: "Cost Centers", costCentersAll: "All cost centers", costCentersAllCount: "All ({count})", costCentersNone: "None selected", costCentersSelectedCount: "Several ({count})" },
        menu: {
            home: "Home", panel: "Panel", dashboard: "Dashboard", adminBusiness: "Admin Business",
            contractedService: "Contracted Service", expansions: "Expansions", businessConfig: "Business Style",
            clientData: "Client Data",
            roles: "Roles", users: "Users", accessPermissions: "Access and Permissions",
            upcomingUpdates: "Upcoming Updates", trainingSessions: "Training Sessions",
            file: "File", images: "Images", audios: "Audio Files", task: "Tasks",
            steeringCommittee: "Steering Committee", generalManagement: "General Management",
            managementControl: "Management Control", supplyChain: "Supply Chain",
            inventory: "Inventory", consumption: "Consumption", overstock: "Overstock",
            purchasing: "Purchasing", commercial: "Commercial", marketing: "Marketing",
            humanResources: "Human Resources", accounting: "Accounting", finance: "Finance",
            certifications: "Certifications",
            deptArea: "Dept. Area {n}", option: "Option {n}",
            area: { generic: "Area {n}", rawMaterial: "Raw Material", production: "Production", transportVolume: "Volume Transport", transportLastMile: "Last-Mile Transport", distributionCenter: "Distribution Center", pointOfSale: "Point of Sale", delivery: "Delivery", endCustomer: "End Customer", customerComplaints: "Customer Complaints", iso9001: "ISO 9001:2015 Quality Management System", iso9001Abbr: "QMS 9001:2015", recruitment: "Recruitment and Selection", personnelAdmin: "Personnel Administration", trainingDevelopment: "Training and Development", compensationBenefits: "Compensation and Benefits", organizationalDevelopment: "Organizational Development", occupationalHealthSafety: "Occupational Health and Safety", hris: "HR Information System (HRIS)", hrAnalytics: "HR Analytics" },
            clientesRegistrados: "Our Clients", addClientNew: "+ Add New Client", contrataciones: "Contracted Modules", clientAdmin: "Client Administration", plansRegistered: "Our Plans", addPlanNew: "+ Add New Plan", moduleCosts: "Access & Permissions Cost", saasTeam: "SaaS Team", mainSection: "General",
            catCatalogos: "Catalogs", catCatalogosItem1: "Cat 1", catCatalogosItem2: "Cat 2",
            catOperaciones: "Operations", catOperacionesItem1: "Ope 1", catOperacionesItem2: "Ope 2",
            catTransVolClientes: "Clients", catTransVolSitiosOrigen: "Origin Sites", catTransVolSitiosDestino: "Destination Sites", catTransVolRutas: "Routes", catTransVolTiposServicio: "Service Types", catTransVolTiposTraslado: "Transfer Types", catTransVolContactos: "Contacts", catTransVolEmpresasAsociadas: "Partner Companies", catTransVolTiposUnidades: "Unit Types", catTransVolTiposAditamentos: "Attachment Types", catCentroDistCodigos: "Codes", catCentroDistCategorias: "Categories", catCentroDistUdm: "UOM",
            opTransVolTraslados: "Transfer Log", opTransVolCombustible: "Fuel Log", opTransVolIngresos: "Income", opTransVolGastos: "Expenses", opTransVolInventario: "Inventory", opRrhhMiRecursoHumano: "My Human Resource",
            catAdmin: "Admin", catAdminItem1: "Adm 1", catAdminItem2: "Adm 2",
            catGestion: "Management", catGestionItem1: "Gest 1", catGestionItem2: "Gest 2",
            catReportes: "Reports", catReportesItem1: "Report 1", catReportesItem2: "Report 2",
            catMaterialApoyo: "Support Material", catMaterialApoyoItem1: "M. Apoy 1", catMaterialApoyoItem2: "M. Apoy 2"
        },
        admin: {
            clientsTitle: "New Clients", clientsSubtitle: "Manage the companies using this SGN instance.",
            addClientSubtitle: "Register a new company as an SGN client.",
            logo: "Logo", removeLogo: "Remove", primaryColor: "Primary color", secondaryColor: "Secondary color",
            paletteSeedLabel: "Client's representative color", paletteSuggest: "Suggest palette",
            paletteHint: "Pick the client's most representative color and click \"Suggest palette\" to auto-fill a full, readable theme — then adjust any color by hand.",
            paletteBg: "Background", paletteSurface: "Surface", paletteBorder: "Border",
            paletteTextPrimary: "Primary text", paletteTextSecondary: "Secondary text",
            paletteAccent: "Accent (buttons, active items)", paletteTooltipBg: "Tooltip background", paletteTooltipText: "Tooltip text", paletteColorColumn: "Color", paletteValueColumn: "Value",
            companyName: "Company name", contactName: "Contact name", email: "Email", phone: "Phone",
            plan: "Plan / package",
            mission: "Mission", vision: "Vision", coreValues: "Values", history: "History",
            status: "Status",
            statusActivo: "Active", statusInactivo: "Inactive", statusProspecto: "Prospect",
            addClient: "Add client", editClient: "Edit client", save: "Save", cancel: "Cancel",
            dismiss: "Dismiss", generatedAdminTitle: "New client admin account created",
            generatedAdminNote: "This password is shown only once — copy it now and share it with the client securely.",
            edit: "Edit", delete: "Delete",
            noClients: "No clients yet. Add the first one above.",
            requiredFields: "Company name, contact name and email are required.",
            loadError: "Couldn't load data. Please try again.",
            saveError: "Couldn't save changes. Please try again.",
            clientSaved: "Client saved.",
            contratacionesTitle: "Contracted Modules", contratacionesSubtitle: "Turn on the modules each client has contracted.",
            selectClient: "Select a client", selectClientPlaceholder: "Choose a client...",
            noClientSelected: "Select a client above to manage their modules.",
            modulesSaved: "Modules updated.",
            costCentersLimit: "Allowed cost centers",
            addenda: "Addenda", addendaTitle: "Addenda", extraCostCenters: "Extra cost centers",
            extraModulesLabel: "Extra modules (not included in the plan)",
            noExtraModulesAvailable: "This plan already includes every module.",
            addendaNoPlan: "This client has no plan assigned yet — extras still apply on top of nothing until one is chosen.",
            addendaPlanBase: "Plan \"{plan}\": {limit} cost centers included.",
            adminAccessTitle: "Administrator Access",
            adminAccessHint: "Read-only — shows everything this client has contracted (enabled) vs. not contracted (blocked). This administrator always sees everything enabled automatically; nothing here can be selected or saved.",
            adminAccessEnabled: "Contracted / enabled",
            adminAccessBlocked: "Not contracted / blocked",
            adminAccessNoAdminYet: "This client doesn't have an admin user yet — activate it first.",
            plansSubtitle: "Manage the plan or package types you can assign to your clients.",
            addPlanSubtitle: "Register a new plan or package type.",
            planName: "Plan name", planDescription: "Description", addPlan: "Add plan",
            noPlans: "No plans yet. Add the first one above.",
            confirmDeletePlan: "Delete this plan? This doesn't affect clients already assigned to it.",
            planNameExists: "A plan with that name already exists.",
            selectPlanPlaceholder: "Choose a plan...",
            bigDateNumber: "Unique Big Date No.", rfc: "Company RFC", companyNickname: "Company Nickname", companyAbbreviation: "Company Abbreviation",
            ownerName: "Owner", billingEmail: "Billing Contact Email", contractStartDate: "Contract Start Date", contractRegisteredDate: "Contract Registration Date",
            contractEndDate: "Contract End Date", contractedCost: "Contracted Cost $", monthlyPayment: "Monthly Payment", contractFile: "Contract",
            removeContract: "Remove", viewContract: "View contract", noContractFile: "No contract uploaded", anexosPayment: "Anexos Payment",
            activate: "Activate", deactivate: "Deactivate", rfcExists: "A client with that RFC already exists.",
            anexoStarLegend: "★ included in the contracted plan — no star: added as an anexo", anexoRequestedBy: "Requested by", anexoRequestedAt: "Request date",
            anexoContractedDuration: "Contracted duration", anexoChanges: "Anexos Changes", anexoChangesTitle: "Anexos Changes", anexoChangesEmpty: "No changes recorded yet.",
            anexoChangeAdded: "Added", anexoChangeRemoved: "Removed", activeTree: "Active permission tree", activeTreeTitle: "Active permission tree",
            activeTreeHint: "Everything this client has enabled right now: what their plan contracts (★) plus what was added as an anexo.",
            colModule: "Module", colAction: "Action", colRequestedBy: "Requested by", colRequestedAt: "Request date", colChangedAt: "Change date", colDuration: "Contracted duration",
            accessPermCostsTitle: "Access & Permissions Cost", accessPermCostsSubtitle: "Set a cost for each node of every plan's access tree.",
            accessPermCostsSaved: "Costs updated.", accessPermCostColumn: "Access/Permissions Cost", costPerCostCenterColumn: "Cost Per Cost Center",
            costCenterTotalColumn: "Cost Center Total", planCurrency: "Currency",
            accessPermCostOverlapHint: "A price set on a container level (Department/Area/Category) is counted separately from — and on top of — the prices of what's underneath it.",
            accessPermTreeColumn: "Access / Permissions", accessPermTreeCostColumn: "Cost $",
            accessPermCostsNewPlanHint: "Remember that to see and edit a new plan here, you must first create it in Nuestros Planes — it will then show up here to set its costs.",
            costLabel: "Cost $",
            institutionalColor: "Institutional color", noLogo: "No logo", noColorSet: "No color set", editColor: "Edit color", costCenters: "Cost Centers",
            razonSocial: "Razón Social", razonSocialConfirm: "Are you sure your Razón Social is correct?", rfcLengthError: "The number of characters doesn't match an RFC",
            contractWordFile: "Contract (Word)", initialPayment: "Initial Payment", costCentersContracted: "Contracted Cost Centers",
            costCentersContractedWithExtra: "{planLimit} plan + {extra} additional", contractTerm: "Contract Term", contractTermMonths: "{n} months",
            permisosContratados: "Contracted Permissions", permisosContratadosTitle: "Contracted Permissions", permisosAdicionalesTitle: "+ Additional Permissions",
            pagoPorAdicionales: "Payment For Additionals", permTreeLegendPlan: "Included in the plan", permTreeLegendExtra: "Sold as an additional",
            permTreeLegendNone: "Not contracted", additionalsCostCentersLabel: "for ADDITIONAL COST CENTERS", additionalsPermissionsLabel: "ADDITIONAL PERMISSIONS",
            additionalsPermissionsPreview: "Additional permissions total: {amount}", paletteShowPreview: "Show current preview"
        },
        business: {
            usersTitle: "Users", usersSubtitle: "Manage the people who use this SGN instance.",
            username: "Username", name: "Full name", password: "Password", createUser: "Create user",
            role: "Role", createdAt: "Created", assignProfilesTitle: "Assign profiles",
            selectUser: "Select a user", selectUserPlaceholder: "Choose a user...",
            noUserSelected: "Select a user above to manage their profiles.",
            noProfilesYet: "No profiles yet — create one in Roles first.",
            usersEmpty: "No users yet. Create the first one above.",
            userCreated: "User created.", profilesSaved: "Profiles updated.", profilesLabel: "Profiles",
            rolesTitle: "Roles", rolesSubtitle: "Create reusable profiles and configure which modules, sections, and screens they grant access to.",
            profileName: "Profile name", profileDescription: "Description",
            addProfile: "Add profile", editProfile: "Edit profile",
            confirmDeleteProfile: "Delete this profile? Users assigned to it will lose this access.",
            noProfiles: "No profiles yet. Create the first one above.",
            profileSaved: "Profile saved.", profileDeleted: "Profile deleted.",
            permissionsTitle: "Access for this profile", selectProfileHint: "Create or select a profile above to configure its access.",
            accesosTitle: "Access & Permissions", accesosSubtitle: "Grant a user extra modules, sections, or screens beyond what their profile(s) already give them.",
            selectUserForAccess: "Select a user", extraAccessHint: "This is in addition to whatever their assigned profiles already grant — it never removes access.",
            accessSaved: "Access updated.",
            configSubtitle: "Adjust your company's logo and institutional colors — this is what your team sees when they pick \"Institutional\" style.",
            brandingSaved: "Branding saved.",
            clientDataSubtitle: "Your company's core identity, set up by GEIPSA when your account was created. This is read-only here.",
            clientDataNotSet: "Not set up yet — ask GEIPSA to add this from Clientes Nuevos.",
            costCentersTitle: "Cost Centers", costCentersSubtitle: "Manage your company's cost centers.",
            ccCode: "Code", ccName: "Name", ccDescription: "Description", ccResponsible: "Responsible",
            addCostCenter: "Add cost center", ccLimitStatus: "{count} of {limit} cost centers used.",
            ccLimitReached: "You've reached your plan's cost center limit ({limit}). Contact GEIPSA to increase it.",
            ccNoneYet: "No cost centers yet. Add the first one above.",
            ccCodeExists: "A cost center with that code already exists.",
            ccDeleteConfirm: "Delete this cost center?"
        },
        main: { welcome: "Welcome", messages: "Messages", notifications: "Notifications", bookmarks: "Bookmarks", settings: "Settings", addUser: "Add user", language: "Language", style: "Style", others: "Others", languageEnglish: "English", languageSpanish: "Spanish", styleLight: "Light", styleDark: "Dark", styleInstitutional: "Institutional", inDevelopment: "Under development. We're working on a better experience.", chatbot: "Chatbot", chatbotTitle: "SGN Assistant", chatbotClose: "Close chat", chatbotPlaceholder: "Type a message...", chatbotSend: "Send", chatbotGreeting: "Hi! This assistant is still under construction — soon I'll be able to really help you here.", chatbotCannedReply: "Thanks for your message! I can't have real conversations yet — we're working on connecting me to an AI.", userInfo: "User Data", personalDataTitle: "Personal Data", nickname: "Nickname", businessEmail: "Business Email", fullName: "Full Name", phone: "Phone", address: "Address", birthDate: "Date of Birth", idNumber: "ID Number", noBusinessEmail: "No institutional email", notSet: "Not set", buttonConfig: "Button Settings", exitButton: "Exit Button", exitMenu: "Exit Menu", logoutModeConfirm: "Ask before exiting", logoutModeDirect: "Exit without asking", businessProfile: "Business User Data", position: "Position", role: "Role", hireDate: "Hire Date", reportsTo: "Reports To", permissions: "Permissions", assignedCostCenter: "Assigned Cost Center", assignedAreas: "Assigned Areas", assignedDepartments: "Assigned Departments", noRoleAssigned: "No profile assigned", noExtraPermissions: "No permissions granted", extraPermissionsCount: "{count} permissions granted", summaryDepartments: "Dept.", summaryAreas: "Areas", summaryCostCenters: "Cost Ctrs", summaryPermissions: "Permissions", noDepartmentsAssigned: "No departments assigned", noAreasAssigned: "No areas assigned", noCostCentersAssigned: "No cost centers assigned", defaultPickerDeptHint: "Pick the department that should open by default every time you log in.", defaultPickerAreaHint: "Pick the area that should open by default every time you log in.", defaultPickerAreaNoDept: "Select a department first.", defaultPickerCcHint: "Pick the cost centers that should be selected by default every time you log in.", search: "Search", filterToggle: "Filter", filterSearchPlaceholder: "Search...", filterStatus: "Status", filterAll: "All", filterActive: "Active", filterInactive: "Inactive", filterSort: "Sort by", filterSortRecent: "Most recent", filterSortName: "Name", filterSearchBtn: "Search", filterClearBtn: "Clear", filterColumn: "Filter by this column", filterModeLabel: "Filter type", filterModeStartsWith: "Starts with", filterModeContains: "Contains", filterModeEquals: "Equal to", filterDateFrom: "From date", filterDateTo: "To date", filterFuelSearchHint: "Unit, plates, driver, coordinator...", filterHrSearchHint: "Name, position, email, phone...", filterCcSearchHint: "Code, name, responsible, description...", filterClientsSearchHint: "RFC, nickname, owner, contact...", filterPlansSearchHint: "Name, description, created by...", filterSaasTeamSearchHint: "Username, name, email...", rowEditableLegend: "Row with at least one field you can still edit", emptyStateText: "No data yet.", breadcrumbLabel: "Path", breadcrumbExpand: "Expand breadcrumb", breadcrumbCollapse: "Collapse breadcrumb", colUniqueBigDate: "# Unique Big Date", colRegistro: "# Record", colAnio: "Year", colMes: "Month", colDiaNum: "Day (Num)", colDiaTexto: "Day (Text)", colNoSemCobro: "Collection Week No.", colFecha: "Date", colTipoServicios: "Service Type", colEstatus: "Status",
            colCliente: "Client", colTipoUnidadSolicitada: "Requested Unit Type", colCotizacionServicio: "Service Quote $", colRequisitosServicio: "Service Requirements", colRequisitosSeguridad: "Security Requirements", colRequisitosCobro: "Billing Requirements", colOrigen: "Origin", colHoraCita: "Appointment Time", colUbicacion: "Location", colLinkUbicacion: "Location Link", colEmpresaCliente: "Client's Company", colNomContactoOrigen: "Origin Contact Name", colNoContacto: "Contact No.", colNoColaboradorDriver: "Employee No. (Driver)", colNombreDriver: "Driver Name(s)", colNoColaboradorAuxiliar: "Employee No. (Assistant)", colNombreAuxiliar: "Assistant Name(s)", colRutaAsignada: "Assigned Route", colZona: "Zone", colCantPallets: "Pallet Qty.", colCantUdm: "UOM Qty.", colCantParadas: "Stop Qty.", colParadasVisitadas: "Stops Visited", colCantUmEntregadas: "Units Delivered Qty.", colPorcentajeVisitas: "% Visits", colPorcentajeEntrega: "% Delivery", colDevolucionCantUdm: "Return (UOM Qty.)", colPorcentajeDevolucion: "% Return", colCoordinador: "Coordinator", colEcoUnidad: "Unit Fleet No.", colPlacas: "License Plates", colRutaSubtotal: "Route Subtotal $", colPenalizacion: "Penalty $", colRutaSubtotalCobro: "Route Billing Subtotal $", colIva: "VAT $", colCobroTotalRuta: "Total Route Billing $", colNoFactura: "Invoice No.", colFechaGeneraFactura: "Invoice Generation Date",
            topBarExpand: "Expand top bar", topBarCollapse: "Collapse top bar", decreaseFontSize: "Decrease font size", increaseFontSize: "Increase font size",
            pinColumns: "Pin columns", pinColumnsTitle: "Pin columns", pinColumnsHint: "Choose up to 4 columns to pin to the left. Drag to reorder them.", pinColumnsLimitReached: "You can pin up to 4 columns.", pinColumnsOther: "Other columns", columnVisibility: "Show/hide columns", columnVisibilityTitle: "Show/hide columns", columnVisibilityHint: "Choose which columns to show.", columnHidePinnedConfirm: "This column is pinned. Are you sure you want to hide it?", dragToReorder: "Drag to reorder",
            uiScale: "System size", uiScaleIdeal: "Ideal", uiScaleDecrease: "Decrease size", uiScaleIncrease: "Increase size", newRecord: "New Record",
            newRecordHint: "The rest of the fields can be filled in later, directly from the table row.", fuelAddValue: "+ Add", fuelClickToEdit: "Click to edit", fuelSelectReason: "Select...", fuelUploadTicket: "Upload ticket evidence", fuelUploadTripKmBeforeEvidence: "Upload Trip KM before evidence", fuelUploadTripKmAfterEvidence: "Upload Trip KM after evidence", evidencePreviewTitle: "Evidence", close: "Close",
            colFuelDbId: "Unique Database #", colFuelRecordId: "Unique Consumption Record #", colFuelDate: "Date", colFuelYear: "Year", colFuelMonth: "Month", colFuelWeek: "Week #", colFuelDayNum: "Day #", colFuelDayText: "Day", colFuelEcoUnit: "Fleet Unit #", colFuelPlates: "Unit Plates", colFuelDriver: "Driver", colFuelCoordinator: "Coordinator", colFuelTicketEvidence: "Ticket Evidence", colFuelSubtotal: "Subtotal", colFuelVat: "VAT", colFuelTotal: "Total", colFuelReason: "Load Reason", colFuelTransferService: "Transfer Service", colFuelInternalMovement: "Internal Movement",
            newHireRecord: "New Record", colHrDbId: "Unique Database #", colHrRecordId: "Unique Record #", colHrFullName: "Full Name", colHrPosition: "Position", colHrStartDate: "Start Date", colHrDepartment: "Assigned Department", colHrArea: "Assigned Area", colHrEmail: "Email", colHrPhone: "Phone", colHrStatus: "Status", recordDeleteConfirm: "Delete this record?",
            colFuelTripKmBefore: "Trip KM Before Load", colFuelTripKmBeforeEvidence: "Trip KM Before Evidence", colFuelTripKmAfter: "Trip KM After Load", colFuelTripKmAfterEvidence: "Trip KM After Evidence", colFuelTripKmTotal: "Total Trip KM Acquired",
            colFuelType: "Fuel Type", colFuelLiters: "Liters", colFuelCostPerLiter: "Cost per Liter", fuelTypeSelect: "Select...", fuelTypeDiesel: "Diesel", fuelTypeMagna: "Regular", fuelTypePremium: "Premium",
            changeHistory: "Change history", changeHistoryTitle: "Change history", changeHistoryTitleRecord: "Change history for this record", changeHistoryEmpty: "No changes recorded yet.", changeHistoryCreated: "Record created", changeHistoryDeleted: "Record deleted", changeHistoryDate: "Date", changeHistoryUser: "User", changeHistoryRecord: "Record", changeHistoryChange: "Change",
            fieldLocked: "Already saved — you need permission to edit it",
            tablePrefix: "Table", permSoloVer: "View Only", permVerYOperar: "Operate", permEditar: "Edit", permAutorizar: "Authorize",
            changePending: "Pending authorization", changeHistoryRequestedBy: "Requested by", changeHistoryAuthorizedBy: "Authorized by",
            notificationsTitle: "Notifications", notificationsEmpty: "No changes pending authorization.", notificationApprove: "Approve", notificationReject: "Reject", notificationApproved: "Change applied.", notificationRejected: "Change rejected." }
    },
    es: {
        meta: { loginTitle: "SGN by GEIPSA - Iniciar sesión", dashboardTitle: "SGN - Inicio" },
        sidebar: { brand: "SGN", searchPlaceholder: "Buscar", searchNoResults: "Sin resultados.", notifications: "Notificaciones", settings: "Configuración", logout: "Cerrar sesión", logoutConfirm: "¿Seguro que deseas salir?", logoutConfirmGreeting: "{name}, ¿seguro que deseas salir?", department: "Departamento", deptAbbr: { finance: "FIN", accounting: "CONT", humanResources: "RRHH", marketing: "MKT", commercial: "COM", purchasing: "COMP", supplyChain: "CDS", managementControl: "CG", generalManagement: "DG", steeringCommittee: "CD", certifications: "CERT" }, area: "Área", costCenters: "Centros de Costo", costCentersAll: "Todos los centros de costo", costCentersAllCount: "Todos ({count})", costCentersNone: "Ninguno seleccionado", costCentersSelectedCount: "Varios ({count})" },
        menu: {
            home: "Inicio", panel: "Panel", dashboard: "Tablero", adminBusiness: "Administración del Negocio",
            contractedService: "Servicio Contratado", expansions: "Expansiones", businessConfig: "Estilo del Negocio",
            clientData: "Datos de Cliente",
            roles: "Roles", users: "Usuarios", accessPermissions: "Accesos y Permisos",
            upcomingUpdates: "Próximas Actualizaciones", trainingSessions: "Sesiones de Capacitación",
            file: "Archivos", images: "Imágenes", audios: "Audios", task: "Tareas",
            steeringCommittee: "Comité Directivo", generalManagement: "Dirección General",
            managementControl: "Control de Gestión", supplyChain: "Cadena de Suministro",
            inventory: "Inventario", consumption: "Consumos", overstock: "Sobre Stock",
            purchasing: "Compras", commercial: "Comercial", marketing: "Mercadotecnia",
            humanResources: "Recursos Humanos", accounting: "Contabilidad", finance: "Finanzas",
            certifications: "Certificaciones",
            deptArea: "Área Dep. {n}", option: "Opción {n}",
            area: { generic: "Área {n}", rawMaterial: "M. Prima", production: "Producción", transportVolume: "Transporte Volumen", transportLastMile: "Transporte Última Milla", distributionCenter: "C. Distribución", pointOfSale: "Punto Venta", delivery: "Delivery", endCustomer: "Cliente Final", customerComplaints: "Quejas de Cliente", iso9001: "ISO 9001:2015 Sistema de Gestión de Calidad", iso9001Abbr: "SGC 9001:2015", recruitment: "Reclutamiento y Selección", personnelAdmin: "Administración de Personal", trainingDevelopment: "Formación y Desarrollo", compensationBenefits: "Compensaciones y Beneficios", organizationalDevelopment: "Desarrollo Organizacional", occupationalHealthSafety: "Seguridad y Salud Laboral", hris: "Sistema de Información de RRHH (SIRH)", hrAnalytics: "Analítica Recursos Humanos (RH Analytics)" },
            clientesRegistrados: "Nuestros Clientes", addClientNew: "+ Agregar Cliente Nuevo", contrataciones: "Contrataciones", clientAdmin: "Administración de Clientes", plansRegistered: "Nuestros Planes", addPlanNew: "+ Agregar Plan Nuevo", moduleCosts: "Costo Accesos-Permisos", saasTeam: "Equipo SaaS", mainSection: "General",
            catCatalogos: "Catálogos", catCatalogosItem1: "Cat 1", catCatalogosItem2: "Cat 2",
            catOperaciones: "Operaciones", catOperacionesItem1: "Ope 1", catOperacionesItem2: "Ope 2",
            catTransVolClientes: "Clientes", catTransVolSitiosOrigen: "Sitios Origen", catTransVolSitiosDestino: "Sitios Destino", catTransVolRutas: "Rutas", catTransVolTiposServicio: "Tipos Servicio", catTransVolTiposTraslado: "Tipos Traslado", catTransVolContactos: "Contactos", catTransVolEmpresasAsociadas: "Empresas Asociadas", catTransVolTiposUnidades: "Tipos Unidades", catTransVolTiposAditamentos: "Tipos Aditamentos", catCentroDistCodigos: "Códigos", catCentroDistCategorias: "Categorías", catCentroDistUdm: "UDM",
            opTransVolTraslados: "Registro de traslados", opTransVolCombustible: "Registro Combustible", opTransVolIngresos: "Ingresos", opTransVolGastos: "Gastos", opTransVolInventario: "Inventario", opRrhhMiRecursoHumano: "Mi Recurso Humano",
            catAdmin: "Admin", catAdminItem1: "Adm 1", catAdminItem2: "Adm 2",
            catGestion: "Gestión", catGestionItem1: "Gest 1", catGestionItem2: "Gest 2",
            catReportes: "Reportes", catReportesItem1: "Report 1", catReportesItem2: "Report 2",
            catMaterialApoyo: "Material Apoyo", catMaterialApoyoItem1: "M. Apoy 1", catMaterialApoyoItem2: "M. Apoy 2"
        },
        admin: {
            clientsTitle: "Clientes Nuevos", clientsSubtitle: "Administra las empresas que usan esta instancia de SGN.",
            addClientSubtitle: "Registra una nueva empresa como cliente de SGN.",
            logo: "Logo", removeLogo: "Quitar", primaryColor: "Color primario", secondaryColor: "Color secundario",
            paletteSeedLabel: "Color representativo del cliente", paletteSuggest: "Sugerir paleta",
            paletteHint: "Elige el color más representativo del cliente y haz clic en \"Sugerir paleta\" para generar un tema completo y legible — luego ajusta cualquier color a mano.",
            paletteBg: "Fondo", paletteSurface: "Superficie", paletteBorder: "Borde",
            paletteTextPrimary: "Texto principal", paletteTextSecondary: "Texto secundario",
            paletteAccent: "Acento (botones, activos)", paletteTooltipBg: "Fondo de tooltip", paletteTooltipText: "Texto de tooltip", paletteColorColumn: "Color", paletteValueColumn: "Valor",
            companyName: "Nombre de la empresa", contactName: "Nombre de contacto", email: "Correo electrónico", phone: "Teléfono",
            plan: "Plan / paquete",
            mission: "Misión", vision: "Visión", coreValues: "Valores", history: "Historia",
            status: "Estado",
            statusActivo: "Activo", statusInactivo: "Inactivo", statusProspecto: "Prospecto",
            addClient: "Agregar cliente", editClient: "Editar cliente", save: "Guardar", cancel: "Cancelar",
            dismiss: "Descartar", generatedAdminTitle: "Se creó la cuenta admin del cliente",
            generatedAdminNote: "Esta contraseña se muestra solo una vez — cópiala ahora y compártela con el cliente de forma segura.",
            edit: "Editar", delete: "Eliminar",
            noClients: "Aún no hay clientes. Agrega el primero arriba.",
            requiredFields: "Nombre de empresa, contacto y correo son obligatorios.",
            loadError: "No se pudo cargar la información. Intenta de nuevo.",
            saveError: "No se pudieron guardar los cambios. Intenta de nuevo.",
            clientSaved: "Cliente guardado.",
            contratacionesTitle: "Contrataciones", contratacionesSubtitle: "Activa los módulos que cada cliente tiene contratados.",
            selectClient: "Selecciona un cliente", selectClientPlaceholder: "Elige un cliente...",
            noClientSelected: "Selecciona un cliente arriba para administrar sus módulos.",
            modulesSaved: "Módulos actualizados.",
            costCentersLimit: "Centros de costo permitidos",
            addenda: "Anexos", addendaTitle: "Anexos", extraCostCenters: "Centros de costo extra",
            extraModulesLabel: "Módulos extra (no incluidos en el plan)",
            noExtraModulesAvailable: "Este plan ya incluye todos los módulos.",
            addendaNoPlan: "Este cliente aún no tiene un plan asignado — los extras se suman sobre cero hasta que elijas uno.",
            addendaPlanBase: "Plan \"{plan}\": {limit} centros de costo incluidos.",
            adminAccessTitle: "Accesos del Administrador",
            adminAccessHint: "Solo lectura — muestra todo lo que este cliente tiene contratado (habilitado) y lo que no (bloqueado). Este administrador siempre ve automáticamente todo lo habilitado; aquí no se puede seleccionar ni guardar nada.",
            adminAccessEnabled: "Contratado / habilitado",
            adminAccessBlocked: "No contratado / bloqueado",
            adminAccessNoAdminYet: "Este cliente aún no tiene un usuario administrador — actívalo primero.",
            plansSubtitle: "Administra los tipos de plan o paquete que puedes asignar a tus clientes.",
            addPlanSubtitle: "Registra un nuevo tipo de plan o paquete.",
            planName: "Nombre del plan", planDescription: "Descripción", addPlan: "Agregar plan",
            noPlans: "Aún no hay planes. Agrega el primero arriba.",
            confirmDeletePlan: "¿Eliminar este plan? Esto no afecta a los clientes que ya lo tienen asignado.",
            planNameExists: "Ya existe un plan con ese nombre.",
            selectPlanPlaceholder: "Selecciona un plan...",
            bigDateNumber: "No. Único de Big Date", rfc: "RFC de la empresa", companyNickname: "Apodo Empresa", companyAbbreviation: "Abrev Empresa",
            ownerName: "Dueño", billingEmail: "Correo de contacto de cobro", contractStartDate: "Fecha inicio contractual", contractRegisteredDate: "Fecha Alta contrato",
            contractEndDate: "Fecha fin contrato", contractedCost: "Costo $ Contratado", monthlyPayment: "Pago Mensual", contractFile: "Contrato",
            removeContract: "Quitar", viewContract: "Ver contrato", noContractFile: "Sin contrato cargado", anexosPayment: "Pago por Anexos",
            activate: "Activar", deactivate: "Desactivar", rfcExists: "Ya existe un cliente con ese RFC.",
            anexoStarLegend: "★ incluido en el plan contratado — sin estrella: agregado como anexo", anexoRequestedBy: "¿Quién solicitó?", anexoRequestedAt: "Fecha de solicitud",
            anexoContractedDuration: "Tiempo contratado", anexoChanges: "Cambios de Anexos", anexoChangesTitle: "Cambios de Anexos", anexoChangesEmpty: "Aún no hay cambios registrados.",
            anexoChangeAdded: "Agregado", anexoChangeRemoved: "Quitado", activeTree: "Árbol de permisos activo", activeTreeTitle: "Árbol de permisos activo",
            activeTreeHint: "Todo lo que este cliente tiene habilitado ahora mismo: lo contratado por su plan (★) más lo agregado como anexo.",
            colModule: "Módulo", colAction: "Acción", colRequestedBy: "Solicitó", colRequestedAt: "Fecha solicitud", colChangedAt: "Fecha cambio", colDuration: "Tiempo contratado",
            accessPermCostsTitle: "Costo Accesos-Permisos", accessPermCostsSubtitle: "Define un costo para cada nodo del árbol de accesos de cada plan.",
            accessPermCostsSaved: "Costos actualizados.", accessPermCostColumn: "Costo Accesos-Permisos", costPerCostCenterColumn: "Costo Por Centro de Costos",
            costCenterTotalColumn: "Costo de Centro de Costos", planCurrency: "Moneda",
            accessPermCostOverlapHint: "Un costo puesto en un nivel contenedor (Departamento/Área/Categoría) se cuenta aparte de — y además de — los costos de lo que tiene debajo.",
            accessPermTreeColumn: "Accesos / Permisos", accessPermTreeCostColumn: "$ Costo",
            accessPermCostsNewPlanHint: "Recuerda que para poder ver y editar un nuevo plan aquí, primero debes crearlo en Nuestros Planes — te aparecerá aquí para modificar sus costos.",
            costLabel: "Costo $",
            institutionalColor: "Color institucional", noLogo: "Sin logo", noColorSet: "Sin color asignado", editColor: "Editar color", costCenters: "Centro Costos",
            razonSocial: "Razón Social", razonSocialConfirm: "¿Está seguro que su Razón Social es correcta?", rfcLengthError: "La cantidad de caracteres no corresponden a un RFC",
            contractWordFile: "Contrato (Word)", initialPayment: "Pago Inicial", costCentersContracted: "Centros de Costo Contratados",
            costCentersContractedWithExtra: "{planLimit} plan + {extra} adicionales", contractTerm: "Plazo de Contrato", contractTermMonths: "{n} meses",
            permisosContratados: "Permisos Contratados", permisosContratadosTitle: "Permisos Contratados", permisosAdicionalesTitle: "+ Permisos Adicionales",
            pagoPorAdicionales: "Pago Por Adicionales", permTreeLegendPlan: "Incluido en el plan", permTreeLegendExtra: "Vendido como adicional",
            permTreeLegendNone: "No contratado", additionalsCostCentersLabel: "de CENTRO COSTOS ADICIONALES", additionalsPermissionsLabel: "PERMISOS ADICIONALES",
            additionalsPermissionsPreview: "Total de permisos adicionales: {amount}", paletteShowPreview: "Ver vista previa actual"
        },
        business: {
            usersTitle: "Usuarios", usersSubtitle: "Administra las personas que usan esta instancia de SGN.",
            username: "Usuario", name: "Nombre completo", password: "Contraseña", createUser: "Crear usuario",
            role: "Rol", createdAt: "Creado", assignProfilesTitle: "Asignar perfiles",
            selectUser: "Selecciona un usuario", selectUserPlaceholder: "Elige un usuario...",
            noUserSelected: "Selecciona un usuario arriba para administrar sus perfiles.",
            noProfilesYet: "Aún no hay perfiles — crea uno primero en Roles.",
            usersEmpty: "Aún no hay usuarios. Crea el primero arriba.",
            userCreated: "Usuario creado.", profilesSaved: "Perfiles actualizados.", profilesLabel: "Perfiles",
            rolesTitle: "Roles", rolesSubtitle: "Crea perfiles reutilizables y configura a qué módulos, apartados y pantallas dan acceso.",
            profileName: "Nombre del perfil", profileDescription: "Descripción",
            addProfile: "Agregar perfil", editProfile: "Editar perfil",
            confirmDeleteProfile: "¿Eliminar este perfil? Los usuarios que lo tengan asignado perderán ese acceso.",
            noProfiles: "Aún no hay perfiles. Crea el primero arriba.",
            profileSaved: "Perfil guardado.", profileDeleted: "Perfil eliminado.",
            permissionsTitle: "Accesos de este perfil", selectProfileHint: "Crea o selecciona un perfil arriba para configurar sus accesos.",
            accesosTitle: "Accesos y Permisos", accesosSubtitle: "Otorga a un usuario módulos, apartados o pantallas adicionales a los que ya le dan sus perfiles.",
            selectUserForAccess: "Selecciona un usuario", extraAccessHint: "Esto se suma a lo que ya otorgan sus perfiles asignados — nunca quita acceso.",
            accessSaved: "Accesos actualizados.",
            configSubtitle: "Ajusta el logo y los colores institucionales de tu empresa — esto es lo que tu equipo ve al elegir el estilo \"Institucional\".",
            brandingSaved: "Marca guardada.",
            clientDataSubtitle: "La identidad central de tu empresa, configurada por GEIPSA al crear tu cuenta. Aquí es solo de lectura.",
            clientDataNotSet: "Aún no configurado — pide a GEIPSA que lo agregue desde Clientes Nuevos.",
            costCentersTitle: "Centros de Costo", costCentersSubtitle: "Administra el catálogo de centros de costo de tu empresa.",
            ccCode: "Código", ccName: "Nombre", ccDescription: "Descripción", ccResponsible: "Responsable",
            addCostCenter: "Agregar centro de costo", ccLimitStatus: "{count} de {limit} centros de costo usados.",
            ccLimitReached: "Has alcanzado el límite de centros de costo de tu plan ({limit}). Contacta a GEIPSA para aumentarlo.",
            ccNoneYet: "Aún no hay centros de costo. Agrega el primero arriba.",
            ccCodeExists: "Ya existe un centro de costo con ese código.",
            ccDeleteConfirm: "¿Eliminar este centro de costo?"
        },
        main: { welcome: "Bienvenido", messages: "Mensajes", notifications: "Notificaciones", bookmarks: "Marcadores", settings: "Configuración", addUser: "Agregar usuario", language: "Idioma", style: "Estilo", others: "Otros", languageEnglish: "Inglés", languageSpanish: "Español", styleLight: "Claro", styleDark: "Oscuro", styleInstitutional: "Institucional", inDevelopment: "En desarrollo, seguimos trabajando para una mejor experiencia", chatbot: "Chatbot", chatbotTitle: "Asistente SGN", chatbotClose: "Cerrar chat", chatbotPlaceholder: "Escribe un mensaje...", chatbotSend: "Enviar", chatbotGreeting: "¡Hola! Este asistente todavía está en construcción — pronto podré ayudarte de verdad por aquí.", chatbotCannedReply: "¡Gracias por tu mensaje! Aún no puedo tener conversaciones reales — estamos trabajando en conectarme con una IA.", userInfo: "Datos de Usuario", personalDataTitle: "Datos Personales", nickname: "Apodo", businessEmail: "Correo empresarial", fullName: "Nombre completo", phone: "Teléfono", address: "Dirección", birthDate: "Fecha de nacimiento", idNumber: "Número de identificación", noBusinessEmail: "Sin correo institucional", notSet: "No registrado", buttonConfig: "Configuración botones", exitButton: "Botón Salir", exitMenu: "Menú Salir", logoutModeConfirm: "Preguntar antes de salir", logoutModeDirect: "Salir sin preguntar", businessProfile: "Datos de Usuario del Negocio", position: "Puesto", role: "Rol", hireDate: "Fecha de ingreso", reportsTo: "Jefe directo", permissions: "Permisos", assignedCostCenter: "Centro de costo asignado", assignedAreas: "Áreas asignadas", assignedDepartments: "Departamentos asignados", noRoleAssigned: "Sin perfil asignado", noExtraPermissions: "Sin permisos otorgados", extraPermissionsCount: "{count} permisos otorgados", summaryDepartments: "Dep.", summaryAreas: "Áreas", summaryCostCenters: "C. Costos", summaryPermissions: "Permisos", noDepartmentsAssigned: "Sin Dep asignados", noAreasAssigned: "Sin Áreas asignados", noCostCentersAssigned: "Sin Centro de Costos asignados", defaultPickerDeptHint: "Elige el departamento que debe abrirse por defecto cada vez que inicies sesión.", defaultPickerAreaHint: "Elige el área que debe abrirse por defecto cada vez que inicies sesión.", defaultPickerAreaNoDept: "Primero selecciona un departamento.", defaultPickerCcHint: "Elige los centros de costo que deben quedar seleccionados por defecto cada vez que inicies sesión.", search: "Búsqueda", filterToggle: "Filtro", filterSearchPlaceholder: "Buscar...", filterStatus: "Estado", filterAll: "Todos", filterActive: "Activo", filterInactive: "Inactivo", filterSort: "Ordenar por", filterSortRecent: "Más reciente", filterSortName: "Nombre", filterSearchBtn: "Buscar", filterClearBtn: "Limpiar", filterColumn: "Filtrar por esta columna", filterModeLabel: "Tipo de Filtro", filterModeStartsWith: "Inicia con", filterModeContains: "Contiene", filterModeEquals: "Igual que", filterDateFrom: "Fecha desde", filterDateTo: "Fecha hasta", filterFuelSearchHint: "Unidad, placas, chofer, coordinador...", filterHrSearchHint: "Nombre, puesto, correo, teléfono...", filterCcSearchHint: "Código, nombre, responsable, descripción...", filterClientsSearchHint: "RFC, apodo, dueño, contacto...", filterPlansSearchHint: "Nombre, descripción, creado por...", filterSaasTeamSearchHint: "Usuario, nombre, correo...", rowEditableLegend: "Fila con al menos un campo que aún puedes editar", emptyStateText: "Aún no hay datos.", breadcrumbLabel: "Ruta", breadcrumbExpand: "Expandir ruta de acceso", breadcrumbCollapse: "Contraer ruta de acceso", colUniqueBigDate: "# Único Big Date", colRegistro: "# Registro", colAnio: "Año", colMes: "Mes", colDiaNum: "Día (Num)", colDiaTexto: "Día (texto)", colNoSemCobro: "No. Sem Cobro", colFecha: "Fecha", colTipoServicios: "Tipo Servicios", colEstatus: "Estatus",
            colCliente: "Cliente", colTipoUnidadSolicitada: "Tipo Unidad Solicitada", colCotizacionServicio: "Cotización $ Servicio", colRequisitosServicio: "Requisitos Servicio", colRequisitosSeguridad: "Requisitos Seguridad", colRequisitosCobro: "Requisitos Cobro", colOrigen: "Origen", colHoraCita: "Hora Cita", colUbicacion: "Ubicación", colLinkUbicacion: "Link Ubicación", colEmpresaCliente: "Empresa del cliente", colNomContactoOrigen: "Nom Contacto Origen", colNoContacto: "No. Contacto", colNoColaboradorDriver: "No. Colaborador", colNombreDriver: "Nombre(s) Driver", colNoColaboradorAuxiliar: "No. Colaborador", colNombreAuxiliar: "Nombre(s) Auxiliar", colRutaAsignada: "Ruta Asignada", colZona: "Zona", colCantPallets: "Cant. Pallets", colCantUdm: "Cant. UDM", colCantParadas: "Cant. Paradas", colParadasVisitadas: "Paradas visitadas", colCantUmEntregadas: "Cant UM Entregadas", colPorcentajeVisitas: "% Visitas", colPorcentajeEntrega: "% Entrega", colDevolucionCantUdm: "Devolución (Cant UDM)", colPorcentajeDevolucion: "% Devolución", colCoordinador: "Coordinador", colEcoUnidad: "Eco Unidad", colPlacas: "Placas", colRutaSubtotal: "$ Ruta Subtotal", colPenalizacion: "Penalización $", colRutaSubtotalCobro: "$ Ruta Subtotal Cobro", colIva: "$ IVA", colCobroTotalRuta: "$ Cobro Total Ruta", colNoFactura: "No. Factura", colFechaGeneraFactura: "F. Genera Factura",
            topBarExpand: "Expandir barra superior", topBarCollapse: "Contraer barra superior", decreaseFontSize: "Reducir tamaño de letra", increaseFontSize: "Aumentar tamaño de letra",
            pinColumns: "Fijar columnas", pinColumnsTitle: "Fijar columnas", pinColumnsHint: "Elige hasta 4 columnas para fijarlas del lado izquierdo. Arrástralas para reordenarlas.", pinColumnsLimitReached: "Puedes fijar hasta 4 columnas.", pinColumnsOther: "Otras columnas", columnVisibility: "Mostrar/ocultar columnas", columnVisibilityTitle: "Mostrar/ocultar columnas", columnVisibilityHint: "Elige qué columnas mostrar.", columnHidePinnedConfirm: "Esta columna está fijada. ¿Seguro que quieres ocultarla?", dragToReorder: "Arrastrar para reordenar",
            uiScale: "Tamaño del sistema", uiScaleIdeal: "Ideal", uiScaleDecrease: "Disminuir tamaño", uiScaleIncrease: "Aumentar tamaño", newRecord: "Nuevo Registro",
            newRecordHint: "Los demás datos se pueden llenar después, directamente desde la fila en la tabla.", fuelAddValue: "+ Agregar", fuelClickToEdit: "Clic para editar", fuelSelectReason: "Seleccionar...", fuelUploadTicket: "Subir evidencia de ticket", fuelUploadTripKmBeforeEvidence: "Subir evidencia de Trip KM antes", fuelUploadTripKmAfterEvidence: "Subir evidencia de Trip KM después", evidencePreviewTitle: "Evidencia", close: "Cerrar",
            colFuelDbId: "# Único de Base de Datos", colFuelRecordId: "# Único de Registro de Consumo", colFuelDate: "Fecha", colFuelYear: "Año", colFuelMonth: "Mes", colFuelWeek: "# Semana", colFuelDayNum: "# Día", colFuelDayText: "Día", colFuelEcoUnit: "# Eco Unidad", colFuelPlates: "Placas Unidad", colFuelDriver: "Chofer", colFuelCoordinator: "Coordinador", colFuelTicketEvidence: "Evidencia Ticket", colFuelSubtotal: "Subtotal", colFuelVat: "IVA", colFuelTotal: "Total", colFuelReason: "Motivo Carga", colFuelTransferService: "Servicio Traslado", colFuelInternalMovement: "Movimiento Interno",
            newHireRecord: "Nuevo Registro", colHrDbId: "# Único de Base de Datos", colHrRecordId: "# Único de Registro", colHrFullName: "Nombre Completo", colHrPosition: "Puesto", colHrStartDate: "Fecha de Ingreso", colHrDepartment: "Departamento Asignado", colHrArea: "Área Asignada", colHrEmail: "Correo Electrónico", colHrPhone: "Teléfono", colHrStatus: "Estatus", recordDeleteConfirm: "¿Eliminar este registro?",
            colFuelTripKmBefore: "TRIP KM antes carga", colFuelTripKmBeforeEvidence: "Evidencia TRIP KM antes", colFuelTripKmAfter: "TRIP KM después carga", colFuelTripKmAfterEvidence: "Evidencia TRIP KM después", colFuelTripKmTotal: "Total TRIP KM adquiridos",
            colFuelType: "Tipo Combustible", colFuelLiters: "Cant Litros", colFuelCostPerLiter: "Costo x Litro", fuelTypeSelect: "Seleccionar...", fuelTypeDiesel: "Diésel", fuelTypeMagna: "Magna", fuelTypePremium: "Premium",
            changeHistory: "Historial de cambios", changeHistoryTitle: "Historial de cambios", changeHistoryTitleRecord: "Historial de cambios de este registro", changeHistoryEmpty: "Aún no hay cambios registrados.", changeHistoryCreated: "Registro creado", changeHistoryDeleted: "Registro eliminado", changeHistoryDate: "Fecha", changeHistoryUser: "Usuario", changeHistoryRecord: "Registro", changeHistoryChange: "Cambio",
            fieldLocked: "Ya se guardó — necesitas permiso para modificarlo",
            tablePrefix: "Tabla", permSoloVer: "Solo Ver", permVerYOperar: "Operar", permEditar: "Editar", permAutorizar: "Autorizar",
            changePending: "Pendiente de autorización", changeHistoryRequestedBy: "Solicitó", changeHistoryAuthorizedBy: "Autorizó",
            notificationsTitle: "Notificaciones", notificationsEmpty: "No hay cambios pendientes de autorización.", notificationApprove: "Aprobar", notificationReject: "Rechazar", notificationApproved: "Cambio aplicado.", notificationRejected: "Cambio rechazado." }
    }
};

// --- Auth guard -------------------------------------------------------------
// Returns the user's role ('admin' | 'user') on success, or null (after
// redirecting to Login.html) if the session is missing/expired.
async function authGuard() {
    try {
        const res = await fetch(`${API_BASE}/me`, { credentials: 'include' });
        if (!res.ok) throw new Error('not authenticated');
        const data = await res.json();
        currentUser = data.user || null;
        return data.user?.role || 'user';
    } catch {
        window.location.replace('Login.html');
        return null;
    }
}

// --- i18n --------------------------------------------------------------------
function getStoredLang() {
    const stored = localStorage.getItem('lang');
    return SUPPORTED_LANGS.includes(stored) ? stored : DEFAULT_LANG;
}

function t(key, params = {}) {
    const value = key.split('.').reduce((obj, part) => obj?.[part], dict);
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}

async function loadLanguage(lang) {
    let loaded = null;
    try {
        const res = await fetch(`i18n/${lang}.json`);
        if (res.ok) loaded = await res.json();
    } catch {
        // fetch blocked (e.g. file:// protocol) — fall through to embedded copy
    }
    dict = loaded || EMBEDDED_TRANSLATIONS[lang] || EMBEDDED_TRANSLATIONS[DEFAULT_LANG];
    currentLang = lang;
    document.documentElement.lang = lang;
    localStorage.setItem('lang', lang);
    applyStaticTranslations();
    applyClientBranding(clientBranding); // re-assert: applyStaticTranslations just reset .brand span to the generic "SGN" label
    updateDatabaseMenuLabel(clientBranding); // re-assert: applyStaticTranslations just reset the database label too
    document.querySelectorAll('.lang-option').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    renderFilteredMenu();
    updateDeptPickerLabel();
    renderAreaPickerOptions(); // rebuilds labels for the current department's areas
    renderCostCenterPicker(); // no-op until costCenters loads; re-translates the "Todos"/count label after that
    renderUserProfile(); // no-op until the profile panel has been opened at least once
    renderBusinessProfile(); // same, for the business-profile panel
    document.dispatchEvent(new CustomEvent('dashboard:language-changed', { detail: { lang } }));
}

function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
        el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    const titleEl = document.querySelector('title[data-i18n]');
    if (titleEl) document.title = t(titleEl.dataset.i18n);
}

let langSwitching = false;

// --- Dynamic sidebar menu ------------------------------------------------------
// Minimal embedded fallback (main navigation + footer + demo user) used only
// if data/menu.json can't be fetched (e.g. file:// protocol). The full menu
// with all department sections lives in data/menu.json — keep that as the
// source of truth for real edits.
const EMBEDDED_MENU_FALLBACK = {
    sections: [{
        id: 'main',
        items: [
            { id: 'home', labelKey: 'menu.home', icon: 'bx-home-alt-2', href: '#' },
            { id: 'panel', labelKey: 'menu.panel', icon: 'bx-grid-alt', href: '#' },
            { id: 'dashboard', labelKey: 'menu.dashboard', icon: 'bx-bar-chart-alt-2', href: 'Inicio-en.html' }
        ]
    }],
    footer: []
};

async function loadMenu() {
    try {
        const res = await fetch('data/menu.json');
        if (res.ok) return await res.json();
    } catch {
        // fetch blocked (e.g. file:// protocol) — fall through to embedded copy
    }
    console.warn('data/menu.json could not be loaded; using minimal embedded fallback menu.');
    return EMBEDDED_MENU_FALLBACK;
}

// Admin-only sidebar dropdown (SaaS control panel: Clientes Registrados —
// the list of existing clients, module entitlements, and Anexos, all on one
// screen — + Agregar Cliente Nuevo, a dedicated add-only form; Planes
// Registrados, GEIPSA's own plan-type catalog; and + Agregar Plan Nuevo,
// same add-only split as the client screens). Only ever added when the
// server-verified role (from /api/me) is 'admin' — the real access control
// is enforced server-side on every /api/admin/* route regardless of what the
// sidebar shows. Regular client users never see this; they manage their own
// access from "Administración del Negocio" instead. Placed right after
// "Tablero" in the main section, not as a separate section, so it doesn't
// read as part of the client-facing navigation.
// GEIPSA staff (role 'admin') aren't a client using the product — they're
// the SaaS operator. Their sidebar is deliberately minimal: search, Inicio,
// Tablero, and Administración de Clientes, nothing else. Client users (any
// non-admin, including a client's own isClientAdmin account) keep the full
// menu.json-driven sidebar untouched.
// "Pantalla habilitada" for GEIPSA's own SaaS-side screens (Equipo SaaS) —
// mirrors hasScreenGrant's client-side counterpart, but against
// cachedSaasGrants (GET /api/me/saas-grants) instead of a business
// profile's effectiveGrants. Zero grants = unrestricted (see
// saas_user_grants' own comment in db.js) — same convention as
// isUnrestrictedClientAdmin, so the very first admin/admin account (which
// starts with no rows here) isn't accidentally locked out of its own
// screens the moment this ships.
let cachedSaasGrants = null;
// Estatus visibility gate, SaaS side -- same idea as
// resolveMasterNodeStatus/isEstatusVisible above, mirrored against
// saas_master_status's own flat "::"-nested item_id keys instead of the
// client tree's {sectionId,itemId,submenuId} triple (see
// resolveSaasNodeStatus's own comment in db.js -- no empty-segment
// ambiguity here, every segment of a SaaS key is always a real id).
let cachedSaasVisibleStatuses = null;
let cachedSaasStatusOverrides = null;
async function loadSaasGrants() {
    try {
        const res = await fetch(`${API_BASE}/me/saas-grants`, { credentials: 'include' });
        if (!res.ok) { cachedSaasGrants = []; cachedSaasVisibleStatuses = ['habilitado']; cachedSaasStatusOverrides = []; return; }
        const data = await res.json();
        cachedSaasGrants = data.grants || [];
        cachedSaasVisibleStatuses = data.visibleStatuses || ['habilitado'];
        cachedSaasStatusOverrides = data.saasStatusOverrides || [];
    } catch {
        cachedSaasGrants = [];
        cachedSaasVisibleStatuses = ['habilitado'];
        cachedSaasStatusOverrides = [];
    }
}
function resolveSaasNodeStatus(itemId) {
    const overrides = cachedSaasStatusOverrides || [];
    if (!overrides.length) return 'habilitado';
    const parts = String(itemId).split('::');
    for (let i = 1; i <= parts.length; i += 1) {
        const prefix = parts.slice(0, i).join('::');
        const hit = overrides.find((r) => r.itemId === prefix);
        if (hit) return hit.status;
    }
    return 'habilitado';
}
// CORRECTED, 2026-09-28, same fix as hasSaasGrant in db.js: zero grants no
// longer means unrestricted for just anyone -- only the one designated SaaS
// super-admin (currentUser.isSaasSuperAdmin, mirrors isClientAdmin on the
// client side) bypasses this. This is the client-side UX-only mirror of the
// real server-side check (hiding a menu item this account can't actually
// use), not itself the enforcement -- server.js's own hasSaasGrant is what
// actually protects each route.
// Bypass checked FIRST, not after the visibility gate -- reordered
// 2026-09-30 after locking myself out of Admin-ArbolMaestroSaaS.html
// locally: with 'saas-master-tree' (this screen's own new self-gating
// leaf, see GENERAL_ITEMS in Admin-ArbolMaestroSaaS.js) set to a status
// outside an account's cachedSaasVisibleStatuses, the OLD order failed the
// visibility check before ever reaching isSaasSuperAdmin, so even a real
// super-admin got redirected away from the one screen that could undo it.
// Production's admin_saas happens to have every status marked visible
// today, which is why this never surfaced before, but that's a data
// fact this function shouldn't have to depend on -- a super-admin bypass
// that a status/visibility combination can still defeat isn't a real
// bypass. Now isSaasSuperAdmin always wins, for every node, not just this
// new one.
function hasSaasScreenGrant(itemId, subItemId = null) {
    if (currentUser?.isSaasSuperAdmin) return true;
    const fullKey = subItemId ? `${itemId}::${subItemId}` : itemId;
    const visible = cachedSaasVisibleStatuses || ['habilitado'];
    if (!visible.includes(resolveSaasNodeStatus(fullKey))) return false;
    const grants = cachedSaasGrants || [];
    return grants.some((g) => g.itemId === itemId && (subItemId ? g.subItemId === subItemId : true));
}
// Equipo SaaS and Árbol Maestro SaaS itself used to be a deliberate
// exception here -- restricting who can see them would need to be granted
// BY someone who can already see them, a bootstrapping problem. Removed
// 2026-09-30, confirmed live: "SOLO EL USUARIO admin_saas tiene accesos a
// todo... los usuarios de prueba tienen la misma estructura" -- the
// bootstrapping risk is solved by admin_saas's own isSaasSuperAdmin bypass
// (hasSaasScreenGrant above) instead of leaving either screen permanently
// ungated for every account. 'saas-team' already had a real catalog entry
// (SaasAdminCatalog.js, under saasConfig) that nothing pointed at yet;
// 'saas-master-tree' is a new GENERAL_ITEMS leaf (Admin-ArbolMaestroSaaS.js,
// this screen describing itself). Kept as its own map (not folded into
// SCREEN_GRANT_PATHS) since
// it's a completely separate namespace (flat itemId, no
// {sectionId,itemId,submenuId} triple). Extended 2026-09-29 (was just these
// 3) to cover every real SaaS-admin screen that also carries a saasItemId
// in buildSidebarData's own item list below -- admin-nuestras-apps/admin-
// master-permissions/admin-business-
// sectors/admin-nuestros-respaldos/admin-material-apoyo were already hidden
// from the sidebar correctly when their Estatus wasn't visible, but typing
// their URL directly still worked regardless (this map only ever gated
// direct access, not the sidebar). Confirmed live: "porque si Giro está en
// mejora, se visualiza en la barra lateral?" -- admin-business-sectors
// specifically had NO saasItemId at all yet, in either place, so it never
// respected Estatus for sidebar OR direct access.
const SAAS_SCREEN_GRANT_PATHS = {
    'admin-saas': 'saas-clients',
    'admin-planes': 'saas-plans',
    'admin-nuestras-apps': 'saas-apps',
    'admin-master-permissions': 'saas-master-permissions-tree',
    'admin-business-sectors': 'saas-business-sectors',
    'admin-equipo-saas': 'saas-team',
    'admin-saas-master-status': 'saas-master-tree',
    'admin-nuestros-respaldos': 'saas-backups',
    'admin-material-apoyo': 'saas-material-apoyo',
};
function hasSaasScreenAccess(activePage) {
    const itemId = SAAS_SCREEN_GRANT_PATHS[activePage];
    if (!itemId) return true;
    return hasSaasScreenGrant(itemId);
}

// Per-table Iconos Personalización, SaaS side -- mirrors hasIconGrant's own
// client-side check, but against the SaaS tree's Estatus instead of a
// profile grant (there's no per-account icon-level grant yet -- see
// SaasAdminCatalog.js's own comment on "el árbol de permisos POR CUENTA...
// todavía no profundiza"). Confirmed live, 2026-09-28: "todas las tablas
// deben llevar su clasificación... la cual se define desde el árbol de
// permisos" -- Árbol Maestro SaaS already gives every Iconos Personalización
// leaf its own Estatus selector (see ICON_PERSONALIZATION_ITEMS/buildLeaves
// in Admin-ArbolMaestroSaaS.js), this is what actually makes that selector
// do something at runtime; before this it was purely cosmetic. Returns null
// (not a SaaS table) so callers fall back to hasIconGrant for every other
// table -- resolveIconGrant below is that fallback dispatcher.
// Every SaaS-admin screen whose table is modeled in the SaaS tree (a
// tablaApartado in SaasAdminCatalog.js carries the Iconos Personalización
// leaves) -- extended 2026-10-02 from the first 3 to all 7, so the same
// icons (Acomodo Guardado included) work, and obey the tree, on every SaaS
// table, not just some.
const SAAS_TABLE_ICON_SCREENS = {
    'equipo-saas': { screenItemId: 'saas-team', apartadoId: 'tabla' },
    'nuestros-clientes': { screenItemId: 'saas-clients', apartadoId: 'tabla' },
    'mis-planes': { screenItemId: 'saas-plans', apartadoId: 'tabla' },
    'nuestras-apps': { screenItemId: 'saas-apps', apartadoId: 'catalogo' },
    'business-sectors': { screenItemId: 'saas-business-sectors', apartadoId: 'tabla' },
    'admin-nuestros-respaldos': { screenItemId: 'saas-backups', apartadoId: 'tabla' },
    'admin-material-apoyo': { screenItemId: 'saas-material-apoyo', apartadoId: 'tabla' },
};
function isSaasTableKey(tableId) {
    return !!SAAS_TABLE_ICON_SCREENS[tableId];
}

function hasSaasTableIconGrant(tableId, iconId) {
    const mapping = SAAS_TABLE_ICON_SCREENS[tableId];
    if (!mapping) return null;
    const key = `${mapping.screenItemId}::${mapping.apartadoId}::icon-${iconId}`;
    const visible = cachedSaasVisibleStatuses || ['habilitado'];
    return visible.includes(resolveSaasNodeStatus(key));
}

// Árbol Maestro SaaS's own reorder (saas_master_order, edited on
// Admin-ArbolMaestroSaaS.html) used to only ever change that screen's own
// tree display -- confirmed live that dragging "Giros de Negocio" above
// "Árbol de Permisos Maestro" there and saving left the REAL sidebar below
// untouched, exactly the "solo cambia el árbol, no la pantalla real" gap
// the user has been explicit this whole effort must never happen. Fetched
// once per session load, same pattern as loadSaasGrants above.
let cachedSaasMasterOrder = null;
async function loadSaasMasterOrder() {
    try {
        const res = await fetch(`${API_BASE}/admin/saas-master-order`, { credentials: 'include' });
        if (!res.ok) { cachedSaasMasterOrder = null; return; }
        const data = await res.json();
        cachedSaasMasterOrder = data.order || null;
    } catch {
        cachedSaasMasterOrder = null;
    }
}
// Maps a sidebar item's own `id` to the itemId SaasAdminCatalog.js (and so
// saas_master_order.screensByGroup) actually uses -- the two namespaces
// never lined up 1:1 (this sidebar predates that catalog). Admin-
// ArbolMaestroSaaS.html itself has no entry here on purpose: it isn't one
// of the catalog's own 9 screens (it's the tool that gates them), so it
// keeps whatever fixed position it's coded at below instead of being
// reordered.
const CUSTOMER_SERVICE_SAAS_ORDER_IDS = {
    'admin-clientes-registrados': 'saas-clients',
    'admin-planes-registrados': 'saas-plans',
    'admin-nuestras-apps': 'saas-apps',
    'admin-master-permissions': 'saas-master-permissions-tree',
    'admin-business-sectors': 'saas-business-sectors',
};
const SAAS_CONFIG_SAAS_ORDER_IDS = {
    'admin-equipo-saas': 'saas-team',
    'admin-nuestros-respaldos': 'saas-backups',
    'admin-material-apoyo': 'saas-material-apoyo',
};
// Same "most specific wins, else keep original relative position" idea
// PermissionTree.js's own applyOrder uses -- anything saas_master_order
// doesn't mention (a pinned item with no catalog id, or a screen added
// after the order was last saved) is never dropped, just left where it
// already was.
function applySaasSidebarOrder(items, groupId, idToCatalogItemId) {
    const orderIds = cachedSaasMasterOrder?.screensByGroup?.[groupId];
    if (!orderIds || !orderIds.length) return items;
    // An item with no catalog id (Árbol Maestro SaaS's own pinned slot in
    // Configuración SaaS) never takes part in the reorder -- confirmed live
    // that treating it as merely "unmatched" (appended after everything
    // else, same as applyOrder does elsewhere) silently dragged it from
    // first to last instead of leaving it put. Split it out by its exact
    // original index, reorder only the real catalog screens around it, then
    // splice it back into that same index.
    const reorderable = [];
    const fixed = [];
    items.forEach((item, index) => {
        if (idToCatalogItemId[item.id]) reorderable.push(item);
        else fixed.push({ index, item });
    });
    const byCatalogId = new Map(reorderable.map((item) => [idToCatalogItemId[item.id], item]));
    const used = new Set();
    const ordered = [];
    orderIds.forEach((catId) => {
        const item = byCatalogId.get(catId);
        if (item && !used.has(item)) { ordered.push(item); used.add(item); }
    });
    reorderable.forEach((item) => { if (!used.has(item)) ordered.push(item); });
    fixed.forEach(({ index, item }) => ordered.splice(Math.min(index, ordered.length), 0, item));
    return ordered;
}

function buildSidebarData(data, role, activePage) {
    // Split in two (was one "Administración de Clientes" dropdown) --
    // Servicio a Cliente is working a real client account; Configuración
    // SaaS is the platform/product catalog and GEIPSA's own internal
    // operation, neither of which depends on which client you're looking
    // at. Explicit product decision (2026-09-14) even though this sidebar
    // was originally built "deliberately minimal" (one dropdown only) --
    // see this function's git history for that original reasoning.
    const customerServiceSubmenu = [
        // "+ Agregar Cliente Nuevo" y "+ Agregar Plan Nuevo" no tienen
        // entrada propia aquí — Nuestros Clientes y Nuestros Planes tienen
        // su propio botón "+ Agregar ... Nuevo" en el toolbar de su tabla
        // (ver renderNewClientButton en Admin-SaaS.js / renderNewPlanButton
        // en Admin-Planes.js), que abre el mismo modal de Editar en modo
        // creación ("pantalla alterna") — nunca existieron como páginas
        // propias en el sidebar, un ítem aquí sería redundante.
        { id: 'admin-clientes-registrados', labelKey: 'menu.clientesRegistrados', href: 'Admin-SaaS.html', icon: 'bx-group', saasItemId: 'saas-clients' },
        { id: 'admin-planes-registrados', labelKey: 'menu.plansRegistered', href: 'Admin-Planes.html', icon: 'bx-package', saasItemId: 'saas-plans' },
        { id: 'admin-nuestras-apps', labelKey: 'menu.ourApps', href: 'Admin-NuestrasApps.html', icon: 'bx-grid-alt', saasItemId: 'saas-apps' },
        // Upstream of Nuestros Giros de Negocio -- a Giro's own default
        // access tree (sector_grants) will only be allowed to grant nodes
        // marked 'habilitado' here (deferred, not built yet), so it's
        // listed right before it. Under Servicio a Cliente (not Config.
        // SaaS) -- both this and Giro de Negocio directly shape what a
        // client account ends up able to see, same as Nuestros Clientes/
        // Planes above (corrected 2026-09-15, initially miscategorized).
        {
            id: 'admin-master-permissions', labelKey: 'menu.masterPermissionsTree', href: 'Admin-ArbolMaestro.html', icon: 'bx-sitemap', saasItemId: 'saas-master-permissions-tree',
            // Same ladder idea as admin-business-sectors below -- this label
            // used to ellipsize straight to "Árbol de Permisos Mae..." even
            // though "Árbol Permisos Mtro." fits the sidebar's own width on
            // its own.
            abbrKeys: ['menu.masterPermissionsTreeAbbr1', 'menu.masterPermissionsTreeAbbr2', 'menu.masterPermissionsTreeAbbr3', 'menu.masterPermissionsTreeAbbr4'],
        },
        {
            id: 'admin-business-sectors', labelKey: 'menu.businessSectors', href: 'Admin-BusinessSectors.html', icon: 'bx-briefcase', saasItemId: 'saas-business-sectors',
            // Longest label in this dropdown -- steps down this ladder (in
            // order) until one fits the sidebar's fixed expanded width
            // instead of ellipsizing straight to "..." (see
            // applySubmenuAbbreviations below).
            abbrKeys: ['menu.businessSectorsAbbr1', 'menu.businessSectorsAbbr2', 'menu.businessSectorsAbbr3', 'menu.businessSectorsAbbr4'],
        },
    ].filter((item) => !item.saasItemId || hasSaasScreenGrant(item.saasItemId));
    const customerServiceSubmenuOrdered = applySaasSidebarOrder(customerServiceSubmenu, 'customerService', CUSTOMER_SERVICE_SAAS_ORDER_IDS);
    const saasConfigSubmenu = [
        // Upstream of Equipo SaaS/Nuestros Respaldos/Material de Apoyo below
        // -- same "readiness gate before per-person grants" relationship
        // Árbol de Permisos Maestro has with Giro de Negocio, just for
        // GEIPSA's own internal screens instead of the client-facing ones.
        // Its own table (saas_master_status) -- never master_permission_status.
        {
            id: 'admin-saas-master-status', labelKey: 'menu.saasMasterTree', href: 'Admin-ArbolMaestroSaaS.html', icon: 'bx-shield', saasItemId: 'saas-master-tree',
            abbrKeys: ['menu.saasMasterTreeAbbr1', 'menu.saasMasterTreeAbbr2'],
        },
        { id: 'admin-equipo-saas', labelKey: 'menu.saasTeam', href: 'Admin-EquipoSaaS.html', icon: 'bx-id-card', saasItemId: 'saas-team' },
        { id: 'admin-nuestros-respaldos', labelKey: 'menu.ourBackups', href: 'Admin-NuestrosRespaldos.html', icon: 'bx-cloud-upload', saasItemId: 'saas-backups' },
        {
            id: 'admin-material-apoyo', labelKey: 'menu.ourSupportMaterial', href: 'Admin-MaterialApoyo.html', icon: 'bx-book-open', saasItemId: 'saas-material-apoyo',
            // Same ladder idea as the other long labels in this sidebar --
            // used to hard-ellipsize to "Nuestro Material de ..." instead of
            // stepping down to something still readable.
            abbrKeys: ['menu.ourSupportMaterialAbbr1', 'menu.ourSupportMaterialAbbr2', 'menu.ourSupportMaterialAbbr3'],
        },
    ].filter((item) => !item.saasItemId || hasSaasScreenGrant(item.saasItemId));
    const saasConfigSubmenuOrdered = applySaasSidebarOrder(saasConfigSubmenu, 'saasConfig', SAAS_CONFIG_SAAS_ORDER_IDS);
    const customerServiceItem = {
        id: 'admin-servicio-cliente', labelKey: 'menu.customerService', icon: 'bx-support', submenu: customerServiceSubmenuOrdered,
        abbrKeys: ['menu.customerServiceAbbr1', 'menu.customerServiceAbbr2'], saasGroupId: 'customerService',
    };
    const saasConfigItem = {
        id: 'admin-config-saas', labelKey: 'menu.saasConfig', icon: 'bx-cog', submenu: saasConfigSubmenuOrdered,
        abbrKeys: ['menu.saasConfigAbbr1', 'menu.saasConfigAbbr2'], saasGroupId: 'saasConfig',
    };
    if (role !== 'admin') return data;

    const mainSection = data.sections.find((s) => s.id === 'main');
    // Inicio/Tablero themselves have real Estatus rows too (saas-home/
    // saas-board, GENERAL_ITEMS in Admin-ArbolMaestroSaaS.js) -- confirmed
    // live, 2026-09-30: "porque siguen apareciendo estas 3 opciones?...
    // todo debe de habilitarse desde el árbol", against a screenshot
    // showing Inicio/Tablero still visible for a zero-grant account. Same
    // rule as every other item now: gated, not a free pass.
    const home = hasSaasScreenGrant('saas-home') ? mainSection?.items.find((i) => i.id === 'home') : null;
    const dashboard = hasSaasScreenGrant('saas-board') ? mainSection?.items.find((i) => i.id === 'dashboard') : null;
    // The 2 category dropdowns themselves are also reorderable in Árbol
    // Maestro SaaS (order.groups) -- confirmed live this was STILL missed
    // even after fixing each group's own internal screen order: dragging
    // "Configuración SaaS" above "Servicio a Cliente" and saving left these
    // two exactly where they always were. Same applySaasSidebarOrder logic,
    // keyed by the group's own saasGroupId rather than a per-screen id.
    const groupOrderIds = cachedSaasMasterOrder?.groups;
    let orderedGroupItems = [customerServiceItem, saasConfigItem];
    if (groupOrderIds && groupOrderIds.length) {
        const byGroupId = new Map(orderedGroupItems.map((item) => [item.saasGroupId, item]));
        const used = new Set();
        const ordered = [];
        groupOrderIds.forEach((groupId) => {
            const item = byGroupId.get(groupId);
            if (item && !used.has(item)) { ordered.push(item); used.add(item); }
        });
        orderedGroupItems.forEach((item) => { if (!used.has(item)) ordered.push(item); });
        orderedGroupItems = ordered;
    }
    // The group header itself (Servicio a Cliente / Config. SaaS) has its
    // own real Estatus row in Árbol Maestro SaaS (the "Apartado" line the
    // 2 groups render as there), but nothing ever checked it -- only each
    // CHILD screen's own saasItemId was gated, so a zero-grant account with
    // every child hidden still saw the parent group itself, expandable into
    // an empty dropdown. Confirmed live, 2026-09-30, against daniel.anaya:
    // "Servicio a Cliente"/"Config. SaaS" both still showed with nothing
    // inside. hasSaasScreenGrant(saasGroupId) mirrors the per-item check
    // exactly; the submenu.length guard is a second, independent reason to
    // hide the same empty-dropdown case even if that ever diverges from the
    // group's own node.
    orderedGroupItems = orderedGroupItems.filter((item) => item.submenu.length > 0 && hasSaasScreenGrant(item.saasGroupId));
    return { ...data, sections: [{ id: 'main', items: [home, dashboard, ...orderedGroupItems].filter(Boolean) }] };
}

// --- Department picker --------------------------------------------------------
// Matches the section ids in public/data/menu.json (and the module catalog
// used by "Contrataciones") so picking a department shows exactly that
// section's items below, instead of every department stacked at once.
const DEPARTMENTS = [
    { key: 'finance', labelKey: 'menu.finance', abbrKey: 'sidebar.deptAbbr.finance', icon: 'bx-dollar-circle' },
    { key: 'accounting', labelKey: 'menu.accounting', abbrKey: 'sidebar.deptAbbr.accounting', icon: 'bx-calculator' },
    { key: 'human-resources', labelKey: 'menu.humanResources', abbrKey: 'sidebar.deptAbbr.humanResources', icon: 'bx-id-card' },
    { key: 'marketing', labelKey: 'menu.marketing', abbrKey: 'sidebar.deptAbbr.marketing', icon: 'bx-broadcast' },
    { key: 'commercial', labelKey: 'menu.commercial', abbrKey: 'sidebar.deptAbbr.commercial', icon: 'bx-store-alt' },
    { key: 'purchasing', labelKey: 'menu.purchasing', abbrKey: 'sidebar.deptAbbr.purchasing', icon: 'bx-cart-alt' },
    { key: 'supply-chain', labelKey: 'menu.supplyChain', abbrKey: 'sidebar.deptAbbr.supplyChain', icon: 'bx-package' },
    { key: 'management-control', labelKey: 'menu.managementControl', abbrKey: 'sidebar.deptAbbr.managementControl', icon: 'bx-line-chart' },
    { key: 'general-management', labelKey: 'menu.generalManagement', abbrKey: 'sidebar.deptAbbr.generalManagement', icon: 'bx-crown' },
    { key: 'steering-committee', labelKey: 'menu.steeringCommittee', abbrKey: 'sidebar.deptAbbr.steeringCommittee', icon: 'bx-group' },
    { key: 'certifications', labelKey: 'menu.certifications', abbrKey: 'sidebar.deptAbbr.certifications', icon: 'bx-certification' }
];
const ALWAYS_VISIBLE_SECTIONS = ['main'];

// Narrowed to the client's contracted modules once initDashboard() loads
// them (see fetchContractedModuleKeys) — starts as the full catalog so
// nothing breaks before that fetch resolves; admin/GEIPSA never shows the
// picker at all, so it's simply never narrowed for that role.
let availableDepartments = DEPARTMENTS;
// Raw contracted-module keys (departments + top-bar buttons), kept around
// after initDashboard() loads them so syncTopBarButtonVisibility() can
// re-check it without needing its own fetch.
let contractedModuleKeys = [];

async function fetchContractedModuleKeys() {
    try {
        const res = await fetch(`${API_BASE}/business/contracted-modules`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.moduleKeys || [];
    } catch {
        return [];
    }
}

function getStoredDepartment() {
    const stored = localStorage.getItem('department');
    return availableDepartments.some((d) => d.key === stored) ? stored : null;
}

let selectedDepartment = getStoredDepartment();

// Only the always-visible sections + whichever department is selected (none
// selected = just the always-visible ones, keeping the sidebar uncluttered
// until the user picks a department).
function applyDepartmentFilter(data) {
    return {
        ...data,
        sections: data.sections.filter(
            (s) => ALWAYS_VISIBLE_SECTIONS.includes(s.id) || s.id === selectedDepartment
        )
    };
}

// --- Area picker (linked to the department picker) --------------------------
// Each department has its own list of areas; picking one further narrows
// that department's menu items down to just the ones tagged with that area
// (item.area in menu.json), the same way picking a department narrows
// sections. Supply Chain has real area names; every other department reuses
// the generic "Area 1/2/3" placeholders that already back its existing
// dept-N items, until real names are provided for those too.
const GENERIC_AREAS = [
    { key: 'area-1', labelKey: 'menu.area.generic', labelParams: { n: 1 }, icon: 'bx-folder' },
    { key: 'area-2', labelKey: 'menu.area.generic', labelParams: { n: 2 }, icon: 'bx-folder' },
    { key: 'area-3', labelKey: 'menu.area.generic', labelParams: { n: 3 }, icon: 'bx-folder' }
];
const AREAS_BY_DEPARTMENT = {
    'supply-chain': [
        { key: 'sc-area-raw-material', labelKey: 'menu.area.rawMaterial', icon: 'bx-cube' },
        { key: 'sc-area-production', labelKey: 'menu.area.production', icon: 'bx-cog' },
        { key: 'sc-area-transport-1', labelKey: 'menu.area.transportVolume', icon: 'bx-car' },
        { key: 'sc-area-distribution-center', labelKey: 'menu.area.distributionCenter', icon: 'bx-building' },
        { key: 'sc-area-transport-2', labelKey: 'menu.area.transportLastMile', icon: 'bx-car' },
        { key: 'sc-area-point-of-sale', labelKey: 'menu.area.pointOfSale', icon: 'bx-store' },
        { key: 'sc-area-delivery', labelKey: 'menu.area.delivery', icon: 'bx-send' },
        { key: 'sc-area-end-customer', labelKey: 'menu.area.endCustomer', icon: 'bx-user' },
        { key: 'sc-area-customer-complaints', labelKey: 'menu.area.customerComplaints', icon: 'bx-error-circle' }
    ],
    finance: GENERIC_AREAS,
    accounting: GENERIC_AREAS,
    'human-resources': [
        { key: 'hr-area-recruitment', labelKey: 'menu.area.recruitment', icon: 'bx-user-plus' },
        { key: 'hr-area-personnel-admin', labelKey: 'menu.area.personnelAdmin', icon: 'bx-id-card' },
        { key: 'hr-area-training-development', labelKey: 'menu.area.trainingDevelopment', icon: 'bx-book-open' },
        { key: 'hr-area-compensation-benefits', labelKey: 'menu.area.compensationBenefits', icon: 'bx-money' },
        { key: 'hr-area-organizational-development', labelKey: 'menu.area.organizationalDevelopment', icon: 'bx-sitemap' },
        { key: 'hr-area-occupational-health-safety', labelKey: 'menu.area.occupationalHealthSafety', icon: 'bx-plus-medical' },
        { key: 'hr-area-hris', labelKey: 'menu.area.hris', icon: 'bx-server' },
        { key: 'hr-area-hr-analytics', labelKey: 'menu.area.hrAnalytics', icon: 'bx-line-chart' }
    ],
    marketing: GENERIC_AREAS,
    commercial: GENERIC_AREAS,
    purchasing: GENERIC_AREAS,
    'management-control': GENERIC_AREAS,
    'general-management': GENERIC_AREAS,
    'steering-committee': GENERIC_AREAS,
    certifications: [
        { key: 'cert-area-iso-9001', labelKey: 'menu.area.iso9001', abbrKey: 'menu.area.iso9001Abbr', icon: 'bx-badge-check' }
    ]
};

function getStoredArea() {
    const stored = localStorage.getItem('area');
    const areas = AREAS_BY_DEPARTMENT[selectedDepartment] || [];
    return areas.some((a) => a.key === stored) ? stored : null;
}

let selectedArea = getStoredArea();

// Every department's section is empty in menu.json — once an area is picked
// (any area, any department), the selected department's section shows the
// same shared category template (data.areaCategories: General/Catálogos/
// Operaciones/Admin/Gestión/Reportes/Material Apoyo) instead of per-area
// content. Real screens replace today's placeholders inside that one array
// as they're built, rather than needing edits in every department section.
//
// A specific área can instead need its own real submenu for one of those
// categories (e.g. Cadena de Suministro > Transporte Volumen's own
// Operaciones items) — data.areaOverrides["dept/área"][categoryId] swaps
// that one category's submenu in, leaving every other área/categoría on
// the shared template untouched. See PermissionTree.js for the matching
// (department-wide, not área-scoped) grant side of the same data.
function effectiveAreaCategories(data) {
    const base = data.areaCategories || [];
    const overrides = (data.areaOverrides || {})[`${selectedDepartment}/${selectedArea}`];
    if (!overrides) return base;
    return base.map((cat) => (overrides[cat.id] ? { ...cat, submenu: overrides[cat.id] } : cat));
}

function applyAreaFilter(data) {
    return {
        ...data,
        sections: data.sections.map((s) => {
            if (s.id !== selectedDepartment) return s;
            return { ...s, items: selectedArea ? effectiveAreaCategories(data) : [] };
        })
    };
}

// "Pantalla habilitada" gate for the department sidebar — runs after
// applyAreaFilter, when `s.items` for the selected department is already
// the flat list of categorías (Catálogos/Operaciones/...) for the
// currently-selected área. Filters each categoría's pantallas down to the
// ones this user's grants actually cover (hasScreenGrant, same 3-tier
// match the permission tree itself uses), then drops any categoría left
// with zero pantallas so an admin restricting a profile doesn't leave a
// dangling empty heading in the sidebar. selectedDepartment/selectedArea
// are read directly (not threaded through `data`) since this only ever
// runs against the currently-selected department's own section.
function applyScreenGrantFilter(data) {
    if (!selectedDepartment || !selectedArea) return data;
    return {
        ...data,
        sections: data.sections.map((s) => {
            if (s.id !== selectedDepartment) return s;
            return {
                ...s,
                items: s.items
                    .map((cat) => ({
                        ...cat,
                        submenu: (cat.submenu || []).filter((pantalla) => (
                            pantalla.permissionOnly || hasScreenGrant(selectedDepartment, selectedArea, `${cat.id}/${pantalla.id}`)
                        )),
                    }))
                    .filter((cat) => (cat.submenu || []).length > 0),
            };
        }),
    };
}

function renderFilteredMenu() {
    if (menuData) renderMenu(applyScreenGrantFilter(applyAreaFilter(applyDepartmentFilter(menuData))));
    // Every department/área change (there are several call sites: the
    // dept/area pickers, "defaults" modal, login-defaults auto-apply...)
    // funnels through here, so this is the one place a page like Panel.html
    // needs to listen to react without a full reload — mirrors
    // dashboard:language-changed's own dispatch further up this file.
    document.dispatchEvent(new CustomEvent('dashboard:area-changed', {
        detail: { department: selectedDepartment, area: selectedArea },
    }));
}

// Panel.html's own data source: every categoría (Catálogos/Operaciones/
// Admin/Gestión/Reportes/Material Apoyo) for the CURRENTLY selected
// departamento/área, each with its submenu narrowed down to real,
// grant-covered pantallas only (permissionOnly leaves and href="#"
// placeholders dropped, same hasScreenGrant check the sidebar itself
// uses) -- unlike applyScreenGrantFilter, a categoría that ends up with
// zero pantallas is kept (not dropped) so Panel can still show it with a
// 0 count instead of silently disappearing.
function getPanelCategories() {
    if (!menuData || !selectedDepartment || !selectedArea) return [];
    return effectiveAreaCategories(menuData).map((cat) => ({
        ...cat,
        submenu: (cat.submenu || []).filter((s) => (
            !s.permissionOnly && s.href && s.href !== '#'
            && hasScreenGrant(selectedDepartment, selectedArea, `${cat.id}/${s.id}`)
        )),
    }));
}

// Most areas' full names are already short enough to show as-is; a few
// (e.g. "ISO 9001:2015 Sistema de Gestión de Calidad") are long enough to
// need a dedicated abbreviation instead of just truncating with ellipsis —
// abbrKey is optional and falls back to the full name when not set.
function updateAreaPickerLabel() {
    const label = document.getElementById('area-picker-label');
    if (!label) return;
    const areas = availableAreasForDepartment(selectedDepartment);
    const area = areas.find((a) => a.key === selectedArea);
    label.textContent = area ? t(area.abbrKey || area.labelKey, area.labelParams || {}) : t('sidebar.area');
    document.querySelectorAll('.area-option').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.area === selectedArea);
    });
}

// Rebuilt (not just relabeled) whenever the department or language changes,
// since the list of areas itself depends on which department is selected.
function renderAreaPickerOptions() {
    const dropdown = document.getElementById('area-picker-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';
    const areas = availableAreasForDepartment(selectedDepartment);
    areas.forEach((area) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'none');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'menuitem');
        btn.className = 'dept-option area-option';
        btn.dataset.area = area.key;
        const icon = document.createElement('i');
        icon.className = `bx ${area.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        const span = document.createElement('span');
        span.textContent = t(area.labelKey, area.labelParams || {});
        btn.appendChild(icon);
        btn.appendChild(span);
        li.appendChild(btn);
        dropdown.appendChild(li);
    });
    updateAreaPickerLabel();
}

// Also auto-picks the department's one area for the user when there's
// nothing to actually choose between — same idea as the department picker
// hiding itself when the client only has one contracted module.
function updateAreaPickerVisibility() {
    const picker = document.getElementById('area-picker');
    if (!picker || currentRole === 'admin') return;
    const areas = availableAreasForDepartment(selectedDepartment);
    if (areas.length === 1) {
        if (selectedArea !== areas[0].key) {
            selectedArea = areas[0].key;
            localStorage.setItem('area', selectedArea);
            renderAreaPickerOptions();
            renderFilteredMenu();
        }
        picker.classList.add('dept-picker-disabled');
        return;
    }
    picker.classList.toggle('dept-picker-disabled', areas.length === 0);
}

// Shows only the abbreviation once a department is picked (e.g. "FIN"),
// not the full name — same compact-pill treatment as Cost Centers, now that
// this lives in the top bar instead of the sidebar. Falls back to the
// generic placeholder word when nothing is selected yet.
function updateDeptPickerLabel() {
    const label = document.getElementById('dept-picker-label');
    if (!label) return;
    const dept = availableDepartments.find((d) => d.key === selectedDepartment);
    label.textContent = dept ? t(dept.abbrKey) : t('sidebar.department');
    document.querySelectorAll('.dept-option').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.dept === selectedDepartment);
    });
}

// A submenu only counts as real, clickable navigation if at least one entry
// is an actual destination -- neither a classification band (isClassification,
// e.g. "Control Interno") nor a permission-only leaf (a column/button that
// exists solely to be granted in Accesos y Permisos, see PermissionTree.js).
// A pantalla like Carga Combustible/Nuestros Traslados always HAS a submenu
// (its own column list, for permission granularity), but that submenu is
// 100% classification/permission metadata -- it must render as a plain link
// to its own href, not an expandable dropdown with nothing real inside.
function hasNavigableChildren(submenu) {
    return (submenu || []).some((s) => !s.isClassification && !s.permissionOnly);
}

function buildSubmenu(items) {
    const ul = document.createElement('ul');
    ul.className = 'sub-menu';
    items.forEach((item) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = item.href || '#';
        a.className = 'sub-menu-link';
        if (item.icon) {
            const icon = document.createElement('i');
            icon.className = `bx ${item.icon}`;
            icon.setAttribute('aria-hidden', 'true');
            a.appendChild(icon);
        }
        const span = document.createElement('span');
        // item.label (literal) wins over labelKey — same runtime-injected-
        // item convention as buildMenuItem/crumbFromItem (see their own
        // comments). Without this fallback, an injected item with no
        // labelKey at all (e.g. a saved report) would throw here (t() calls
        // .split on its key argument, which crashes on undefined) instead
        // of just rendering blank.
        const fullLabel = item.label || t(item.labelKey, item.labelParams || {});
        span.textContent = fullLabel;
        // Same Modo ayuda fix as buildMenuItem's own aria-label above -- a
        // sub-menu row had no name of its own either.
        a.setAttribute('aria-label', fullLabel);
        a.setAttribute('data-help-key', 'sidebarNavigation');
        // abbrKeys (see buildSidebarData's admin-business-sectors entry for
        // the first real user) — a ladder of progressively shorter labels,
        // longest first. Stashed as data instead of resolved once here
        // because applySubmenuAbbreviations (below) re-measures on every
        // resize, and the sidebar's language can change without a full
        // menu rebuild (see dashboard:language-changed).
        if (item.abbrKeys?.length) {
            span.dataset.abbrLadder = JSON.stringify([fullLabel, ...item.abbrKeys.map((k) => t(k))]);
        }
        a.appendChild(span);
        li.appendChild(a);
        // A sub-menu item can itself hold its own nested submenu (e.g.
        // Reportes > Personalizados > each saved report) — same
        // dropdown/chevron treatment as a top-level item (buildMenuItem),
        // just one level deeper. menu-item-dropdown reuses the existing
        // click-to-toggle wiring in wireMenuInteractions() as-is, which
        // already supports arbitrary nesting depth via :scope > .sub-menu.
        if (hasNavigableChildren(item.submenu)) {
            li.classList.add('menu-item-dropdown', 'sub-menu-item-dropdown');
            const chevron = document.createElement('i');
            chevron.className = 'bx bx-chevron-down';
            chevron.setAttribute('aria-hidden', 'true');
            a.appendChild(chevron);
            li.appendChild(buildSubmenu(item.submenu));
        }
        ul.appendChild(li);
    });
    return ul;
}

function buildMenuItem(item) {
    const li = document.createElement('li');
    const navigable = hasNavigableChildren(item.submenu);
    li.className = 'menu-item' + (navigable ? ' menu-item-dropdown' : ' menu-item-static');
    if (item.active) li.classList.add('active');

    const a = document.createElement('a');
    a.href = item.href || '#';
    a.className = 'menu-link';

    const icon = document.createElement('i');
    icon.className = `bx ${item.icon}`;
    icon.setAttribute('aria-hidden', 'true');
    a.appendChild(icon);

    const span = document.createElement('span');
    // item.label (literal) wins over labelKey when both could apply — only
    // ever set for runtime-injected items whose text is free-form client
    // data (e.g. a saved report's own name), never a translatable string.
    const fullLabel = item.label || t(item.labelKey, item.labelParams || {});
    span.textContent = fullLabel;
    // The FULL label, not whatever abbrKeys shortens the visible span to --
    // this is also this link's own name for Modo ayuda (findHelpModeContent
    // reads aria-label before ever considering a distant ancestor's own).
    // Confirmed live, 2026-09-30: without this, clicking any sidebar item
    // (Inicio, a group header like "Config. SaaS", any submenu row) walked
    // all the way up to <nav aria-label="Main navigation"> instead, since
    // .menu-link/.sub-menu-link never had a name of their own at all.
    a.setAttribute('aria-label', fullLabel);
    a.setAttribute('data-help-key', 'sidebarNavigation');
    // abbrKeys -- same progressively-shorter-label ladder as buildSubmenu's
    // own abbrLadder (see applySubmenuAbbreviations), just for a top-level
    // item instead of a nested one. A top-level item with no abbrKeys still
    // gets plain CSS ellipsis (see .menu-link span in Inicio-en.css) and the
    // hover tooltip below whenever its label actually overflows.
    if (item.abbrKeys?.length) {
        span.dataset.abbrLadder = JSON.stringify([fullLabel, ...item.abbrKeys.map((k) => t(k))]);
    }
    a.appendChild(span);

    if (navigable) {
        const chevron = document.createElement('i');
        chevron.className = 'bx bx-chevron-down';
        chevron.setAttribute('aria-hidden', 'true');
        a.appendChild(chevron);
    }

    li.appendChild(a);
    if (navigable) {
        li.appendChild(buildSubmenu(item.submenu.filter((sm) => !sm.permissionOnly)));
    }
    return li;
}

// Mirrors "Administración del Negocio" (sidebar) into its own accordion
// group in the top-bar Settings dropdown, right below Style, so its items
// (Servicio Contratado, Roles, Datos de Cliente, etc.) are reachable from
// there too. Hidden whenever there's no admin-business item to show (GEIPSA
// admin's reduced sidebar has none).
// A PURE folder (no real href of its own, e.g. Servicio Contratado) becomes
// its own 2-click accordion here — collapsed by default, opened by its own
// toggle, exactly like the main sidebar's nested dropdowns (buildSubmenu) —
// per explicit user request to match that behavior instead of the flat
// always-expanded heading this used to be.
// A leaf (real href, e.g. Nuestros Centros Costos, Roles, or Expansiones —
// href="#" there just means "not built yet", not "this is a folder") is
// always its own plain row, even if it also carries a submenu of its own
// (the permission tree's column list, ccCode/ccName/... -- not sub-nav).
function buildBusinessAdminSubmenuList(items) {
    const ul = document.createElement('ul');
    ul.className = 'settings-submenu';
    ul.setAttribute('role', 'menu');
    (items || []).filter((i) => !i.permissionOnly).forEach((item) => {
        const hasRealHref = item.href && item.href !== '#';
        const navigableChildren = (item.submenu || []).filter((c) => !c.permissionOnly);
        const li = document.createElement('li');
        li.setAttribute('role', 'none');
        if (!hasRealHref && navigableChildren.length) {
            li.className = 'settings-submenu-group';
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'settings-submenu-toggle';
            toggleBtn.setAttribute('aria-expanded', 'false');
            if (item.icon) {
                const icon = document.createElement('i');
                icon.className = `bx ${item.icon}`;
                icon.setAttribute('aria-hidden', 'true');
                toggleBtn.appendChild(icon);
            }
            const label = document.createElement('span');
            label.textContent = t(item.labelKey, item.labelParams || {});
            toggleBtn.appendChild(label);
            const chevron = document.createElement('i');
            chevron.className = 'bx bx-chevron-down';
            chevron.setAttribute('aria-hidden', 'true');
            toggleBtn.appendChild(chevron);
            li.appendChild(toggleBtn);
            li.appendChild(buildBusinessAdminSubmenuList(navigableChildren));
        } else {
            const a = document.createElement('a');
            a.href = item.href || '#';
            a.setAttribute('role', 'menuitem');
            if (item.icon) {
                const icon = document.createElement('i');
                icon.className = `bx ${item.icon}`;
                icon.setAttribute('aria-hidden', 'true');
                a.appendChild(icon);
            }
            const label = document.createElement('span');
            label.textContent = t(item.labelKey, item.labelParams || {});
            a.appendChild(label);
            li.appendChild(a);
        }
        ul.appendChild(li);
    });
    return ul;
}

// Wires each direct toggle inside `root` (not its own nested toggles —
// those get wired by the recursive call on their own list) to expand/
// collapse just its own nested <ul>, then re-measures the "Administración
// del Negocio" group's own fixed pixel height if it's currently open —
// that height was fixed at whatever this nested list's collapsed size was
// when the OUTER group was last opened, so it clips/gaps around this
// toggle otherwise (same fix as wireMenuInteractions' own ancestor
// re-measure, one level up).
function wireSettingsSubmenuToggles(root) {
    root.querySelectorAll(':scope > li > .settings-submenu-toggle').forEach((toggleBtn) => {
        const li = toggleBtn.closest('li');
        const nested = li.querySelector(':scope > ul');
        wireSettingsSubmenuToggles(nested);
        toggleBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = li.classList.toggle('open');
            toggleBtn.setAttribute('aria-expanded', String(isOpen));
            nested.style.height = isOpen ? `${nested.scrollHeight}px` : '0';
            const ancestorGroup = document.getElementById('business-admin-group');
            const ancestorSubmenu = document.getElementById('business-admin-submenu');
            if (ancestorGroup?.classList.contains('open') && ancestorSubmenu) {
                ancestorSubmenu.style.height = 'auto';
                ancestorSubmenu.style.height = `${ancestorSubmenu.scrollHeight}px`;
            }
        });
    });
}

function renderBusinessAdminSettingsMenu(items) {
    const group = document.getElementById('business-admin-group');
    const submenu = document.getElementById('business-admin-submenu');
    if (!group || !submenu) return;
    submenu.innerHTML = '';
    const navigable = (items || []).filter((i) => !i.permissionOnly);
    if (!navigable.length) {
        group.hidden = true;
        return;
    }
    const built = buildBusinessAdminSubmenuList(navigable);
    while (built.firstChild) submenu.appendChild(built.firstChild);
    wireSettingsSubmenuToggles(submenu);
    group.hidden = false;
}

function renderMenu(data) {
    const mount = document.getElementById('menu-mount');
    mount.innerHTML = '';

    data.sections.forEach((section) => {
        // Items flagged permissionOnly (e.g. the top-bar button shortcuts
        // under "Iconos y Botones" / "General") exist purely to be granted
        // in Accesos y Permisos — they're not real navigation, so they never
        // render here even though PermissionTree.js still lists them.
        let items = (section.items || []).filter((i) => !i.permissionOnly);
        // "Administración del Negocio" no longer gets its own sidebar
        // shortcut — it's reachable from the top-bar Settings dropdown
        // instead (renderBusinessAdminSettingsMenu below), so just drop it
        // from the regular item list here.
        if (section.id === 'main') {
            const adminBusinessItem = items.find((i) => i.id === 'admin-business');
            if (adminBusinessItem) {
                items = items.filter((i) => i.id !== 'admin-business');
            }
            renderBusinessAdminSettingsMenu(adminBusinessItem?.submenu);
        }
        const ul = document.createElement('ul');
        ul.className = 'menu';
        ul.dataset.sectionId = section.id;
        items.forEach((item) => ul.appendChild(buildMenuItem(item)));
        mount.appendChild(ul);
    });

    const footerMount = document.getElementById('footer-menu-mount');
    footerMount.innerHTML = '';
    data.footer.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'menu-item menu-item-static';
        const a = document.createElement('a');
        a.href = item.href || '#';
        a.className = 'menu-link';
        const icon = document.createElement('i');
        icon.className = `bx ${item.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        const span = document.createElement('span');
        span.textContent = t(item.labelKey);
        a.append(icon, span);
        li.appendChild(a);
        footerMount.appendChild(li);
    });

    wireMenuInteractions();
    applySubmenuAbbreviations();
}

// A label with its own abbrLadder (see buildSubmenu/buildMenuItem) steps
// down through progressively shorter versions of itself -- longest that
// still fits the sidebar's own fixed expanded width wins -- instead of
// jumping straight to CSS ellipsis. Covers both nested (.sub-menu-link)
// and top-level (.menu-link) items -- same rule everywhere in the
// sidebar, not just wherever abbrKeys happened to be added first. Re-run
// on resize/collapse-toggle since the sidebar's available width isn't
// otherwise re-checked once rendered; harmless to call for a menu with no
// abbreviated items (the selector just matches nothing).
function applySubmenuAbbreviations() {
    document.querySelectorAll('.sub-menu-link span[data-abbr-ladder], .menu-link span[data-abbr-ladder]').forEach((span) => {
        const ladder = JSON.parse(span.dataset.abbrLadder);
        for (const text of ladder) {
            span.textContent = text;
            if (span.scrollWidth <= span.clientWidth) return;
        }
        // Nothing in the ladder fit -- left on the shortest step, which
        // still ellipsizes via the same CSS every other sub-menu label
        // already relies on.
    });
}
window.addEventListener('resize', applySubmenuAbbreviations);

// --- Menu interactions (dropdowns, minimize, mobile) ------------------------
function wireMenuInteractions() {
    const Sidebar = document.getElementById('Sidebar');
    const menuBtn = document.getElementById('menu-btn');
    const sidebarsBtn = document.getElementById('sidebars-btn');
    const menuItemsDropdown = document.querySelectorAll('.menu-item-dropdown');
    const menuItemsStatic = document.querySelectorAll('.menu-item-static');

    // sidebarsBtn/menuBtn are static markup (never recreated), but
    // wireMenuInteractions() itself re-runs on every menu render (search
    // filter, language switch, department change...) — without this guard,
    // each re-run stacked one more click listener onto the same button. An
    // even number of stacked listeners toggles the class an even number of
    // times per click, which cancels itself out and made the button look
    // completely dead (confirmed live: aria-expanded never changed).
    if (sidebarsBtn && !sidebarsBtn.dataset.wired) {
        sidebarsBtn.dataset.wired = '1';
        sidebarsBtn.addEventListener('click', () => {
            const isHidden = document.body.classList.toggle('sidebars-hidden');
            sidebarsBtn.setAttribute('aria-expanded', String(isHidden));
        });
    }

    if (menuBtn && !menuBtn.dataset.wired) {
        menuBtn.dataset.wired = '1';
        menuBtn.addEventListener('click', () => {
            const isMinimized = Sidebar.classList.toggle('minimize');
            menuBtn.setAttribute('aria-expanded', String(!isMinimized));
            hideSidebarTooltip();
            applySubmenuAbbreviations();
            // The sidebar's own collapse/expand transition (.Sidebar's own
            // "transition: width 0.5s ease" in Inicio-en.css) changes how
            // much width every .data-table-wrapper actually has, same as a
            // window resize would -- resizeAllDataTables (below) re-stretches
            // each table to match instead of leaving it sized for the old
            // width. Waits for the transition to actually finish (not a
            // fixed timeout guessing at that 0.5s) so it reads the sidebar's
            // real final width, not a mid-animation one; the 600ms fallback
            // covers prefers-reduced-motion or any other case where the
            // transition never fires its end event at all.
            let settled = false;
            const onSettled = () => { if (settled) return; settled = true; resizeAllDataTables(); };
            Sidebar.addEventListener('transitionend', function handler(e) {
                if (e.propertyName !== 'width') return;
                Sidebar.removeEventListener('transitionend', handler);
                onSettled();
            });
            setTimeout(onSettled, 600);
        });
    }

    menuItemsDropdown.forEach((menuItem) => {
        menuItem.addEventListener('click', (event) => {
            // A dropdown can now nest inside another one (Reportes >
            // Personalizados, the first 2-level-deep case in this sidebar) —
            // without stopPropagation, clicking the inner one also bubbles
            // up and fires the outer one's own handler, immediately
            // re-collapsing it. :scope > .sub-menu (not .sub-menu) makes
            // sure each handler only ever touches ITS OWN direct submenu,
            // never a nested one belonging to a child dropdown.
            event.stopPropagation();
            const subMenu = menuItem.querySelector(':scope > .sub-menu');
            const isActive = menuItem.classList.toggle('sub-menu-toggle');
            if (subMenu) {
                if (isActive) {
                    subMenu.style.height = `${subMenu.scrollHeight + 6}px`;
                    subMenu.style.padding = '0.2rem 0';
                } else {
                    subMenu.style.height = '0';
                    subMenu.style.padding = '0';
                }
            }
            menuItemsDropdown.forEach((item) => {
                // Never collapse an ANCESTOR of the item just toggled open
                // (that would hide the very item the user just opened) —
                // only true siblings/unrelated dropdowns close, same
                // accordion behavior as before this nesting existed.
                if (item === menuItem || item.contains(menuItem)) return;
                const otherSubmenu = item.querySelector(':scope > .sub-menu');
                if (otherSubmenu) {
                    item.classList.remove('sub-menu-toggle');
                    otherSubmenu.style.height = '0';
                    otherSubmenu.style.padding = '0';
                }
            });
            // An ancestor dropdown's own .sub-menu height was fixed in
            // pixels back when IT was toggled open, based on its
            // scrollHeight at that time — before this nested one existed or
            // had this much content. Expanding/collapsing a nested dropdown
            // changes the parent's true content height, so every currently-
            // open ancestor needs its height re-measured now, or the
            // parent's stale (too-short) fixed height clips the nested
            // content that just appeared (arrow rotates, nothing visible).
            // scrollHeight on an overflow:hidden box never reports SMALLER
            // than the box's own current height (only larger, if content
            // overflows it) -- reading it while the old pixel height is
            // still applied would just hand back that same old number (plus
            // this +6, forever), growing by 6px on every click regardless
            // of what actually changed. Snapping to 'auto' first forces a
            // real natural-size measurement before computing the new target.
            let ancestor = menuItem.parentElement?.closest('.menu-item-dropdown.sub-menu-toggle');
            while (ancestor) {
                const ancestorSubMenu = ancestor.querySelector(':scope > .sub-menu');
                if (ancestorSubMenu) {
                    ancestorSubMenu.style.height = 'auto';
                    ancestorSubMenu.style.height = `${ancestorSubMenu.scrollHeight + 6}px`;
                }
                ancestor = ancestor.parentElement?.closest('.menu-item-dropdown.sub-menu-toggle');
            }
        });
    });

    menuItemsStatic.forEach((menuItem) => {
        menuItem.addEventListener('mouseenter', () => {
            if (!Sidebar.classList.contains('minimize')) return;
            menuItemsDropdown.forEach((item) => {
                const otherSubmenu = item.querySelector(':scope > .sub-menu');
                if (otherSubmenu) {
                    item.classList.remove('sub-menu-toggle');
                    otherSubmenu.style.height = '0';
                    otherSubmenu.style.padding = '0';
                }
            });
        });
    });

    // Collapsed-sidebar tooltip: shows the item's label next to its icon on
    // hover. Positioned explicitly via JS (not pure CSS :hover) — see the
    // note in Inicio-en.css on why the old CSS-only version never worked.
    document.querySelectorAll('.menu-item').forEach((menuItem) => {
        menuItem.addEventListener('mouseenter', () => showSidebarTooltip(menuItem, Sidebar));
        menuItem.addEventListener('mouseleave', hideSidebarTooltip);
    });

    // Expanded-sidebar top-level tooltip -- same "always show the real
    // full name" rule the sub-menu already had (showSubmenuTooltip is
    // generic, not actually sub-menu-specific: it just reads a link's own
    // span + optional abbrLadder), now also wired for .menu-link so a long
    // top-level item like "Administración de Cliente" behaves identically
    // instead of just hard-overflowing with nothing on hover. Skipped
    // while minimized -- the icon-only tooltip above already owns that
    // case, and the label span isn't meaningfully measurable then anyway.
    document.querySelectorAll('.menu-link').forEach((link) => {
        link.addEventListener('mouseenter', () => {
            if (Sidebar.classList.contains('minimize')) return;
            showSubmenuTooltip(link);
        });
        link.addEventListener('mouseleave', hideSidebarTooltip);
    });

    // Expanded-sidebar sub-menu tooltip: a long label (e.g. one of the 7
    // "Nuestras Categorías..." catalogs) now ellipsizes instead of
    // hard-clipping (see .sub-menu .sub-menu-link span in Inicio-en.css) --
    // this shows the FULL label on hover, same tooltip element/positioning
    // as showSidebarTooltip's minimized-sidebar case above, just gated on
    // the label actually being truncated rather than on sidebar state.
    document.querySelectorAll('.sub-menu-link').forEach((link) => {
        link.addEventListener('mouseenter', () => showSubmenuTooltip(link));
        link.addEventListener('mouseleave', hideSidebarTooltip);
    });
}

function getSidebarTooltip() {
    let tooltip = document.getElementById('sidebar-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'sidebar-tooltip';
        tooltip.className = 'sidebar-tooltip';
        document.body.appendChild(tooltip);
    }
    return tooltip;
}

function showSidebarTooltip(menuItem, Sidebar) {
    // Confirmed live, 2026-09-30: hovering an abbreviated sidebar item while
    // Modo ayuda is active showed this plain "full name" tooltip stacked
    // right on top of Modo ayuda's own richer one after the click -- same
    // name shown twice, reading as "2 mensajes". This tooltip's whole job
    // (reveal the real name) is already covered by Modo ayuda's, so it steps
    // aside while that mode is on instead of fighting for the same space.
    if (helpModeActive) return;
    if (!Sidebar.classList.contains('minimize')) return;
    const label = menuItem.querySelector('.menu-link > span')?.textContent;
    if (!label) return;
    const tooltip = getSidebarTooltip();
    tooltip.textContent = label;
    const rect = menuItem.getBoundingClientRect();
    tooltip.style.top = `${rect.top + rect.height / 2}px`;
    tooltip.style.left = `${rect.right + 8}px`;
    tooltip.classList.add('visible');
}

// For a label CSS actually ellipsized (scrollWidth > clientWidth) --
// "Ingresos"/"Gastos" and every other short sub-menu label never triggers
// this, so nothing changes for them. A label with its own abbrLadder (see
// buildSubmenu/applySubmenuAbbreviations) always shows its tooltip instead,
// even once shortened enough to fit with no overflow -- the point of the
// tooltip there isn't "this got cut off", it's "here's the real full name".
// `link` is usually an <a> with its label in a child <span> (sidebar), but
// also accepts being handed the label <span> itself directly (Árbol
// Maestro's row labels, wired from PermissionTree.js) -- same tooltip,
// reused as-is rather than duplicated for that other caller.
function showSubmenuTooltip(link) {
    // Same reasoning as showSidebarTooltip's own guard just above.
    if (helpModeActive) return;
    const span = link.querySelector('span') || (link.tagName === 'SPAN' ? link : null);
    if (!span) return;
    const ladder = span.dataset.abbrLadder ? JSON.parse(span.dataset.abbrLadder) : null;
    const fullLabel = ladder ? ladder[0] : span.textContent;
    const isAbbreviated = ladder && span.textContent !== fullLabel;
    if (!isAbbreviated && span.scrollWidth <= span.clientWidth) return;
    const tooltip = getSidebarTooltip();
    tooltip.textContent = fullLabel;
    const rect = link.getBoundingClientRect();
    tooltip.style.top = `${rect.top + rect.height / 2}px`;
    tooltip.style.left = `${rect.right + 8}px`;
    tooltip.classList.add('visible');
}

function hideSidebarTooltip() {
    document.getElementById('sidebar-tooltip')?.classList.remove('visible');
}

function checkWindowSize() {
    document.getElementById('Sidebar')?.classList.remove('minimize');
}
window.addEventListener('resize', checkWindowSize);

// --- Top-bar overflow: collapse based on real measured collision, not a
// fixed viewport width. A fixed breakpoint never held here — how many
// action icons Dashboard.js inserts varies by account (6 to 9), pill
// labels vary by department/language, and browser zoom changes the
// effective content width without changing window.innerWidth. Two-stage
// cascade, both against ACTUAL layout: first collapse the action icons
// behind "⋮" once .top-bar-title would touch them; if the title still
// collides with that now-much-narrower "⋮" button, hide the title too.
// See .top-bar-icons-collapsed / .top-bar-title-hidden in Inicio-en.css.
function checkTopBarFit() {
    const topBar = document.querySelector('.top-bar');
    const titleGroup = document.querySelector('.top-bar-title');
    const actionsGroup = document.getElementById('top-bar-actions');
    if (!topBar || !titleGroup || !actionsGroup) return;

    // Reset to the fullest state before measuring — an already-collapsed
    // state hides content, which would give a false "plenty of room" read.
    topBar.classList.remove('top-bar-icons-collapsed', 'top-bar-title-hidden');

    const GAP = 12; // px of breathing room before calling it a collision
    const titleRight = titleGroup.getBoundingClientRect().right;
    if (titleRight + GAP <= actionsGroup.getBoundingClientRect().left) return;

    topBar.classList.add('top-bar-icons-collapsed');
    // Re-measure: the icons are now tucked behind "⋮", a much narrower
    // target — only hide the title too if it's STILL colliding against that.
    if (titleRight + GAP > actionsGroup.getBoundingClientRect().left) {
        topBar.classList.add('top-bar-title-hidden');
    }
}
let topBarFitTimer = null;
function scheduleTopBarFitCheck() {
    // A plain requestAnimationFrame debounce (~16ms) fired mid-animation
    // whenever the sidebar slides in/out (.Sidebar has its own 0.3s CSS
    // transition) — each firing re-measured while the layout was still
    // moving, and since the real geometry genuinely differs frame to
    // frame during that animation, the collapsed/uncollapsed outcome
    // legitimately flip-flopped call to call, visible as the action icons
    // rapidly opening/closing in sync with the sidebar's own motion.
    // Waiting past the transition's own duration before measuring means
    // every check happens against the settled, final layout instead.
    if (topBarFitTimer) clearTimeout(topBarFitTimer);
    topBarFitTimer = setTimeout(checkTopBarFit, 350);
}
window.addEventListener('resize', scheduleTopBarFitCheck);
scheduleTopBarFitCheck();
// Catches department/area/cost-center picker labels loading in, language
// switches, and any other content change inside the title group — without
// needing to separately hook every call site that might affect its width.
const topBarTitleEl = document.querySelector('.top-bar-title');
if (topBarTitleEl) {
    new MutationObserver(scheduleTopBarFitCheck)
        .observe(topBarTitleEl, { childList: true, subtree: true, characterData: true });
}

// Every dropdown/panel below (top-bar-actions overflow, Configuración,
// Datos de Usuario, Datos de Usuario del Negocio, chatbot, Departamento/
// Área/Centro de Costos pickers, sidebar search results) has its own toggle
// button that calls event.stopPropagation() so opening it doesn't
// immediately trigger ITS OWN "click outside closes it" listener below —
// but that stopPropagation also stops the click from ever reaching
// document, so every OTHER menu's "click outside" listener never runs
// either. That's why clicking one top-bar button while another's dropdown
// is open used to leave both open at once. Each toggle now closes every
// registered dropdown first (see closeAllTopBarDropdowns) before deciding
// whether to open itself.
const topBarDropdownClosers = [];
function registerTopBarDropdown(closeFn, name) {
    topBarDropdownClosers.push({ closeFn, name });
}
// exceptName skips one registered closer — needed by every dropdown that
// physically LIVES INSIDE .top-bar-actions-list (Configuración, Datos de
// Usuario, Datos del Negocio, Chatbot, Tamaño del Sistema, Notificaciones):
// calling this with no exclusion from one of THEM also closed
// top-bar-actions itself (its own container), which set that dropdown's
// .open class as intended but left it sitting inside a now-invisible
// (opacity:0, visibility:hidden) ancestor — LOOKED exactly like "opens
// then immediately closes" with no error and no timing issue to guard
// against, because nothing was ever actually racing.
function closeAllTopBarDropdowns(exceptName) {
    // Bare calls (no exceptName) come from every OTHER picker's own click
    // handler (dept/area/cc, settings, user info, business profile,
    // notifications...) and none of them pass their own name — so
    // `name !== exceptName` was comparing undefined !== undefined for
    // every one of them and skipping ALL of them, closing only the one
    // dropdown that happens to be registered with a real name
    // ('topBarActions'). `!name` makes every unnamed closer close
    // unconditionally; a named one still only stays open when it's the
    // caller's own exceptName.
    topBarDropdownClosers.forEach(({ closeFn, name }) => { if (!name || name !== exceptName) closeFn(); });
}

// Clicking the sidebar logo/brand reloads the page instead of doing
// nothing — a plain full reload (not a client-side "refetch everything"
// call) so it always picks up a newer deploy too, not just fresher data.
// .brand is static markup shared by every page that loads this file
// (every Business-*.html client screen and Admin-SaaS.html alike), so this
// one binding covers the SaaS panel and every client, present and future,
// with nothing per-page to wire up.
document.querySelectorAll('.brand').forEach((brand) => {
    brand.style.cursor = 'pointer';
    brand.addEventListener('click', () => {
        sessionStorage.setItem('sgnShowUpdateToast', '1');
        window.location.reload();
    });
});

// --- Top-bar actions collapse (mobile only) ----------------------------------
// On phones, Messages/Chatbot/Notifications/Bookmarks/Settings/Add-user don't
// all fit next to the page title, so they collapse behind a single toggle
// button and open as a dropdown — CSS handles hiding .top-bar-actions-list
// vs. showing it inline, this just tracks the open/close state.
const topBarActions = document.getElementById('top-bar-actions');
const topBarActionsToggle = document.getElementById('top-bar-actions-toggle');

function closeTopBarActions() {
    topBarActions?.classList.remove('open');
    topBarActionsToggle?.setAttribute('aria-expanded', 'false');
}
registerTopBarDropdown(closeTopBarActions, 'topBarActions');

// openedAt guards against the exact tap that OPENS the menu also being the
// one that closes it: some mobile browsers dispatch a synthetic click for a
// touch tap that lands on `document` as a second, separate event rather
// than bubbling through the normal chain — stopPropagation() below has no
// effect on that second dispatch since it never passed through this
// listener at all. Reported on mobile as "tap the ⋮ button, it opens then
// immediately closes". Ignoring any outside-click within 300ms of opening
// is long enough to absorb that stray duplicate, short enough that a real
// deliberate tap-elsewhere-to-close still works instantly.
let topBarActionsOpenedAt = 0;
topBarActionsToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = topBarActions.classList.contains('open');
    closeAllTopBarDropdowns();
    if (!wasOpen) {
        topBarActions.classList.add('open');
        topBarActionsToggle.setAttribute('aria-expanded', 'true');
        topBarActionsOpenedAt = Date.now();
    }
});

document.addEventListener('click', (event) => {
    if (Date.now() - topBarActionsOpenedAt < 300) return;
    if (topBarActions && !topBarActions.contains(event.target)) closeTopBarActions();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeTopBarActions();
});

// --- Settings dropdown (Language / Style / Others) --------------------------
const settingsMenu = document.getElementById('settings-menu');
const settingsBtn = document.getElementById('settings-btn');
const settingsDropdown = document.getElementById('settings-dropdown');

function closeSettingsMenu() {
    settingsMenu?.classList.remove('open');
    settingsBtn?.setAttribute('aria-expanded', 'false');
    document.querySelectorAll('.settings-dropdown-group.open').forEach((group) => {
        group.classList.remove('open');
        group.querySelector('.settings-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
        const submenu = group.querySelector('.settings-submenu');
        if (submenu) submenu.style.height = '0';
    });
}
registerTopBarDropdown(closeSettingsMenu);

// Same synthetic-duplicate-click guard as topBarActionsToggle above — this
// button lives inside .top-bar-actions-list, which below 1120px is itself
// behind the "more" toggle, so a touch tap here is just as likely to fire
// that extra document-level click. Without this guard the settings dropdown
// (Idioma/Estilo/...) opened and immediately closed on any screen narrower
// than 1120px.
let settingsMenuOpenedAt = 0;
settingsBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = settingsMenu.classList.contains('open');
    closeAllTopBarDropdowns('topBarActions');
    if (!wasOpen) {
        settingsMenu.classList.add('open');
        settingsBtn.setAttribute('aria-expanded', 'true');
        settingsMenuOpenedAt = Date.now();
    }
});

document.addEventListener('click', (event) => {
    if (Date.now() - settingsMenuOpenedAt < 300) return;
    if (settingsMenu && !settingsMenu.contains(event.target)) closeSettingsMenu();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSettingsMenu();
});

settingsDropdown?.addEventListener('click', (event) => {
    if (event.target.closest('button')) closeSettingsMenu();
});

// --- "Datos de Usuario" / "Datos Personales" panel ---------------------------
// Read-only, fetched once per page load and cached — re-opening the dropdown
// just re-shows the cached copy instead of refetching every time.
const userInfoMenu = document.getElementById('user-info-menu');
const userInfoBtn = document.getElementById('user-info-btn');
let cachedUserProfile = null;

function closeUserInfoMenu() {
    userInfoMenu?.classList.remove('open');
    userInfoBtn?.setAttribute('aria-expanded', 'false');
}
registerTopBarDropdown(closeUserInfoMenu);

// Re-run on language change too (see loadLanguage) so an already-fetched
// profile's fallback text ("Sin correo institucional" / "No registrado")
// re-translates instead of staying stuck in the old language.
function renderUserProfile() {
    if (!cachedUserProfile) return;
    const setField = (id, value, fallbackKey) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value || t(fallbackKey);
    };
    setField('user-info-nickname', cachedUserProfile.nickname, 'main.notSet');
    setField('user-info-business-email', cachedUserProfile.business_email, 'main.noBusinessEmail');
    setField('user-info-name', cachedUserProfile.name, 'main.notSet');
    setField('user-info-phone', cachedUserProfile.phone, 'main.notSet');
    setField('user-info-address', cachedUserProfile.address, 'main.notSet');
    setField('user-info-birth-date', cachedUserProfile.birth_date, 'main.notSet');
    setField('user-info-id-number', cachedUserProfile.id_number, 'main.notSet');
}

async function loadUserProfile() {
    if (cachedUserProfile) {
        renderUserProfile();
        return;
    }
    try {
        const res = await fetch('/api/me/profile');
        if (!res.ok) return;
        const { profile } = await res.json();
        cachedUserProfile = profile;
        renderUserProfile();
    } catch (err) {
        console.error('Failed to load user profile:', err);
    }
}

// Same synthetic-duplicate-click guard as topBarActionsToggle/settingsBtn
// above — this button lives inside .top-bar-actions-list too, so it's just
// as exposed to the "opens then immediately closes" bug below 1120px.
let userInfoMenuOpenedAt = 0;
userInfoBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = userInfoMenu.classList.contains('open');
    closeAllTopBarDropdowns('topBarActions');
    if (!wasOpen) {
        userInfoMenu.classList.add('open');
        userInfoBtn.setAttribute('aria-expanded', 'true');
        loadUserProfile();
        userInfoMenuOpenedAt = Date.now();
    }
});

document.addEventListener('click', (event) => {
    if (Date.now() - userInfoMenuOpenedAt < 300) return;
    if (userInfoMenu && !userInfoMenu.contains(event.target)) closeUserInfoMenu();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeUserInfoMenu();
});

// --- "Datos de Usuario del Negocio" panel ------------------------------------
// Same read-once-and-cache shape as "Datos de Usuario" above. Rol/Permisos
// come from the real profiles/grants tables; Puesto/Centro de costo/Áreas/
// Departamentos have no assignment screen yet, so they just show "No
// registrado" until one exists.
const businessProfileMenu = document.getElementById('business-profile-menu');
const businessProfileBtn = document.getElementById('business-profile-btn');
let cachedBusinessProfile = null;

function closeBusinessProfileMenu() {
    businessProfileMenu?.classList.remove('open');
    businessProfileBtn?.setAttribute('aria-expanded', 'false');
}
registerTopBarDropdown(closeBusinessProfileMenu);

// Section id -> menu.* label key, same map PermissionTree.js uses — needed
// here too since that file isn't loaded on every page that shows the
// Datos de Usuario del Negocio panel.
const SECTION_LABEL_KEYS = {
    finance: 'menu.finance',
    accounting: 'menu.accounting',
    'human-resources': 'menu.humanResources',
    marketing: 'menu.marketing',
    commercial: 'menu.commercial',
    purchasing: 'menu.purchasing',
    'supply-chain': 'menu.supplyChain',
    'management-control': 'menu.managementControl',
    'general-management': 'menu.generalManagement',
    'steering-committee': 'menu.steeringCommittee',
    certifications: 'menu.certifications',
};
function sectionGrantLabel(sectionId) {
    if (sectionId === 'main') return t('menu.mainSection');
    return t(SECTION_LABEL_KEYS[sectionId] || sectionId);
}

// Walks a compound submenuId ("a/b/c") down a chain of `.submenu` arrays,
// returning the joined labels (falling back to the raw id segment wherever
// a node can't be found — same graceful-degradation as t() on an unknown
// key). Shared by both the 'main' branch (btn-configuracion > ... > column)
// and the department branch (categoría > pantalla > columna) below — same
// compound-key convention PermissionTree.js's render() produces.
function walkSubmenuChain(startNode, submenuId) {
    const labels = [];
    let node = startNode;
    for (const part of submenuId.split('/')) {
        const next = (node?.submenu || []).find((s) => s.id === part);
        labels.push(next ? t(next.labelKey, next.labelParams) : part);
        node = next;
    }
    return labels;
}

// Resolves one { sectionId, itemId, submenuId } grant row into a readable
// "Departamento > Área > Categoría > Pantalla[ > Columna]" string (or
// "Departamento > Apartado > ..." for 'main'-section grants, which have no
// área dimension). Inicio/Panel/Tablero live under menuData.sections' main
// section; every department grant's itemId is now an área id (see
// PermissionTree.js — each área carries its OWN resolved category list),
// so it's resolved against AREAS_BY_DEPARTMENT/GENERIC_AREAS (the same
// catalog the área picker already uses) rather than menuData.areaCategories.
function resolveGrantLabel(grant) {
    const sectionLabel = sectionGrantLabel(grant.sectionId);
    if (!grant.itemId) return sectionLabel;

    if (grant.sectionId === 'main') {
        const item = (menuData?.sections?.find((s) => s.id === 'main')?.items || []).find((i) => i.id === grant.itemId);
        if (!item) return sectionLabel;
        const itemLabel = t(item.labelKey, item.labelParams);
        if (!grant.submenuId) return `${sectionLabel} > ${itemLabel}`;
        return `${sectionLabel} > ${itemLabel} > ${walkSubmenuChain(item, grant.submenuId).join(' > ')}`;
    }

    const area = (AREAS_BY_DEPARTMENT[grant.sectionId] || GENERIC_AREAS).find((a) => a.key === grant.itemId);
    if (!area) return sectionLabel;
    const areaLabel = t(area.labelKey, area.labelParams);
    if (!grant.submenuId) return `${sectionLabel} > ${areaLabel}`;

    const [categoryId, ...rest] = grant.submenuId.split('/');
    const category = (menuData?.areaCategories || []).find((c) => c.id === categoryId);
    if (!category) return `${sectionLabel} > ${areaLabel} > ${categoryId}`;
    const categoryLabel = t(category.labelKey, category.labelParams);
    if (!rest.length) return `${sectionLabel} > ${areaLabel} > ${categoryLabel}`;

    // The category's pantallas are área-specific (menu.json's areaOverrides,
    // same lookup categoriesForArea does in PermissionTree.js) — fall back
    // to the shared placeholder template if this área has no override.
    const override = menuData?.areaOverrides?.[`${grant.sectionId}/${grant.itemId}`]?.[categoryId];
    const categoryForLookup = override && override.length ? { ...category, submenu: override } : category;
    return `${sectionLabel} > ${areaLabel} > ${categoryLabel} > ${walkSubmenuChain(categoryForLookup, rest.join('/')).join(' > ')}`;
}

// Departments this user actually has some access to, derived from their
// effective grants (profile + extra) rather than the free-text
// assigned_departments column, which has no assignment UI yet. 'main'
// (Inicio/Panel/Tablero) isn't a department, so it's excluded.
function computeAssignedDepartmentKeys(profile) {
    const keys = new Set();
    (profile.effectiveGrants || []).forEach((g) => {
        if (g.sectionId && g.sectionId !== 'main') keys.add(g.sectionId);
    });
    return Array.from(keys);
}

function renderBusinessProfile() {
    if (!cachedBusinessProfile) return;
    const setField = (id, value, fallbackKey) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value || t(fallbackKey);
    };
    setField('business-profile-position', cachedBusinessProfile.position, 'main.notSet');
    // Business email/phone are the same columns "Datos de Usuario" already
    // shows (business_email/phone) — reused here, not separate data.
    setField('business-profile-business-email', cachedBusinessProfile.business_email, 'main.notSet');
    setField('business-profile-phone', cachedBusinessProfile.phone, 'main.notSet');
    setField('business-profile-hire-date', cachedBusinessProfile.hire_date, 'main.notSet');
    setField('business-profile-reports-to', cachedBusinessProfile.reports_to, 'main.notSet');

    const roleEl = document.getElementById('business-profile-role');
    if (roleEl) {
        const names = cachedBusinessProfile.profileNames || [];
        roleEl.textContent = names.length ? names.join(', ') : t('main.noRoleAssigned');
    }

    // Areas aren't captured by the grants themselves (permissions stop at
    // department/category/screen) — every area of a department this user
    // has any access to counts as "enabled" for them.
    const departmentKeys = computeAssignedDepartmentKeys(cachedBusinessProfile);
    const areaEntries = departmentKeys.flatMap((deptKey) =>
        (AREAS_BY_DEPARTMENT[deptKey] || []).map((area) => ({ deptKey, area }))
    );
    // No per-user cost center assignment exists yet — same free-text column
    // as before, comma-separated once that UI exists.
    const costCenterNames = (cachedBusinessProfile.assigned_cost_center || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const grants = cachedBusinessProfile.effectiveGrants || [];

    const summaryEl = document.getElementById('business-profile-summary');
    if (summaryEl) {
        summaryEl.textContent = [
            `${departmentKeys.length} ${t('main.summaryDepartments')}`,
            `${areaEntries.length} ${t('main.summaryAreas')}`,
            `${costCenterNames.length} ${t('main.summaryCostCenters')}`,
            `${grants.length} ${t('main.summaryPermissions')}`,
        ].join(' - ');
    }

    const fillSummaryList = (id, items, emptyKey) => {
        const list = document.getElementById(id);
        if (!list) return;
        list.innerHTML = '';
        if (!items.length) {
            const li = document.createElement('li');
            li.className = 'business-summary-empty';
            li.textContent = t(emptyKey);
            list.appendChild(li);
            return;
        }
        items.forEach((label) => {
            const li = document.createElement('li');
            li.textContent = label;
            list.appendChild(li);
        });
    };

    fillSummaryList('business-summary-departments', departmentKeys.map(sectionGrantLabel), 'main.noDepartmentsAssigned');
    fillSummaryList(
        'business-summary-areas',
        areaEntries.map(({ deptKey, area }) => `${sectionGrantLabel(deptKey)}: ${t(area.labelKey, area.labelParams)}`),
        'main.noAreasAssigned'
    );
    fillSummaryList('business-summary-cost-centers', costCenterNames, 'main.noCostCentersAssigned');
    fillSummaryList(
        'business-summary-permissions',
        grants.map(resolveGrantLabel).sort((a, b) => a.localeCompare(b)),
        'main.noExtraPermissions'
    );
}

const businessSummaryModal = document.getElementById('business-summary-modal');

function closeBusinessSummaryModal() {
    if (businessSummaryModal) businessSummaryModal.hidden = true;
}

document.getElementById('business-profile-summary-btn')?.addEventListener('click', () => {
    closeBusinessProfileMenu();
    if (businessSummaryModal) businessSummaryModal.hidden = false;
});

businessSummaryModal?.addEventListener('click', (event) => {
    if (event.target === businessSummaryModal) closeBusinessSummaryModal();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && businessSummaryModal && !businessSummaryModal.hidden) closeBusinessSummaryModal();
});

async function loadBusinessProfile() {
    if (cachedBusinessProfile) {
        renderBusinessProfile();
        return;
    }
    try {
        const res = await fetch('/api/me/business-profile');
        if (!res.ok) return;
        const { profile } = await res.json();
        cachedBusinessProfile = profile;
        renderBusinessProfile();
    } catch (err) {
        console.error('Failed to load business profile:', err);
    }
}

// Same guard as userInfoBtn above.
let businessProfileMenuOpenedAt = 0;
businessProfileBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = businessProfileMenu.classList.contains('open');
    closeAllTopBarDropdowns('topBarActions');
    if (!wasOpen) {
        businessProfileMenu.classList.add('open');
        businessProfileBtn.setAttribute('aria-expanded', 'true');
        loadBusinessProfile();
        businessProfileMenuOpenedAt = Date.now();
    }
});

document.addEventListener('click', (event) => {
    if (Date.now() - businessProfileMenuOpenedAt < 300) return;
    if (businessProfileMenu && !businessProfileMenu.contains(event.target)) closeBusinessProfileMenu();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeBusinessProfileMenu();
});

// Language / Style / Configuración botones accordions: clicking a group's
// toggle expands its submenu in place, closing any other open group (all
// flat/single-level, same as Idioma and Estilo — no nesting).
document.querySelectorAll('.settings-dropdown-toggle').forEach((toggleBtn) => {
    toggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const group = toggleBtn.closest('.settings-dropdown-group');
        const submenu = group.querySelector('.settings-submenu');
        document.querySelectorAll('.settings-dropdown-group').forEach((other) => {
            if (other !== group) {
                other.classList.remove('open');
                other.querySelector('.settings-dropdown-toggle')?.setAttribute('aria-expanded', 'false');
                other.querySelector('.settings-submenu').style.height = '0';
            }
        });
        const isOpen = group.classList.toggle('open');
        toggleBtn.setAttribute('aria-expanded', String(isOpen));
        submenu.style.height = isOpen ? `${submenu.scrollHeight}px` : '0';
    });
});

// Collapsible filter/search bar (Cat 1/2, Ope 1/2, etc. placeholder
// screens, and any future page that includes the same markup) — starts
// collapsed showing just "Búsqueda"; expands on click. Clicking "Buscar" OR
// "Limpiar" both collapse it back down, the latter also resetting every
// field inside. Wired generically here (like the accordions above) so any
// page with a `.filter-bar` gets this for free without its own JS.
// Data tables (see .data-table-wrapper in Inicio-en.css) can't rely on the
// page's own scroll for their rows — only the wrapper's own content should
// scroll vertically, with the header and first column pinned via CSS
// position:sticky. That means the wrapper needs a real max-height, and a
// guessed constant would be wrong as soon as the breadcrumb bar or a filter
// bar above it is collapsed vs expanded — so it's measured against
// whatever vertical space is actually left in the viewport below it
// instead, re-measured on resize and whenever something above it changes
// height (the filter-bar toggle/search/clear handlers below call this too).
function sizeDataTableWrappers() {
    document.querySelectorAll('.data-table-wrapper').forEach((wrapper) => {
        const top = wrapper.getBoundingClientRect().top;
        const available = window.innerHeight - top - 24;
        wrapper.style.maxHeight = `${Math.max(available, 200)}px`;
    });
}
window.addEventListener('resize', sizeDataTableWrappers);

// Font-size zoom for .data-table content — one shared preference (not
// per-table) via a --data-table-font-size custom property on :root, so
// every table on every page stays in sync and remembers the choice like
// idioma/estilo already do. Steps between a floor small enough that a
// 48-column table like Registro de traslados is still legible and a
// ceiling before rows get too tall to be useful.
const DATA_TABLE_FONT_SIZE_KEY = 'dataTableFontSize';
const DATA_TABLE_FONT_MIN = 0.65;
const DATA_TABLE_FONT_MAX = 1.15;
const DATA_TABLE_FONT_STEP = 0.1;
const DATA_TABLE_FONT_DEFAULT = 0.85;

function getDataTableFontSize() {
    const stored = parseFloat(localStorage.getItem(DATA_TABLE_FONT_SIZE_KEY));
    return Number.isFinite(stored) ? stored : DATA_TABLE_FONT_DEFAULT;
}

function setDataTableFontSize(size) {
    const clamped = Math.min(DATA_TABLE_FONT_MAX, Math.max(DATA_TABLE_FONT_MIN, Math.round(size * 100) / 100));
    document.documentElement.style.setProperty('--data-table-font-size', `${clamped}rem`);
    localStorage.setItem(DATA_TABLE_FONT_SIZE_KEY, String(clamped));
    document.querySelectorAll('.data-table-zoom').forEach((zoom) => {
        // Either button can be missing now (hasIconGrant may have withheld
        // it) -- this runs for every .data-table-zoom on the page, not just
        // the one that was just clicked.
        const outBtn = zoom.querySelector('[data-zoom="out"]');
        const inBtn = zoom.querySelector('[data-zoom="in"]');
        if (outBtn) outBtn.disabled = clamped <= DATA_TABLE_FONT_MIN;
        if (inBtn) inBtn.disabled = clamped >= DATA_TABLE_FONT_MAX;
    });
    sizeDataTableWrappers();
    return clamped;
}

// Inserted right before each .data-table-wrapper found on the page — same
// generic, no-HTML-editing-required approach as the wrapper's own sizing.
function renderDataTableZoomControls() {
    document.querySelectorAll('.data-table-wrapper').forEach((wrapper) => {
        if (wrapper.previousElementSibling?.classList?.contains('data-table-zoom')) return;
        const tableKey = wrapper.dataset.tableId;
        const zoom = document.createElement('div');
        zoom.className = 'data-table-zoom';
        if (resolveIconGrant(tableKey, 'iconZoomOut')) {
            const outBtn = document.createElement('button');
            outBtn.type = 'button';
            outBtn.className = 'data-table-zoom-btn';
            outBtn.dataset.zoom = 'out';
            outBtn.setAttribute('aria-label', t('main.decreaseFontSize'));
            outBtn.innerHTML = '<i class="bx bx-minus" aria-hidden="true"></i>';
            outBtn.addEventListener('click', () => setDataTableFontSize(getDataTableFontSize() - DATA_TABLE_FONT_STEP));
            zoom.appendChild(outBtn);
        }
        if (resolveIconGrant(tableKey, 'iconZoomIn')) {
            const inBtn = document.createElement('button');
            inBtn.type = 'button';
            inBtn.className = 'data-table-zoom-btn';
            inBtn.dataset.zoom = 'in';
            inBtn.setAttribute('aria-label', t('main.increaseFontSize'));
            inBtn.innerHTML = '<i class="bx bx-plus" aria-hidden="true"></i>';
            inBtn.addEventListener('click', () => setDataTableFontSize(getDataTableFontSize() + DATA_TABLE_FONT_STEP));
            zoom.appendChild(inBtn);
        }
        wrapper.insertAdjacentElement('beforebegin', zoom);
    });
    setDataTableFontSize(getDataTableFontSize());
}

// Column reorder / pin (up to 4, sticky-left) / show-hide / resize — same
// "generic, works on every .data-table automatically" philosophy as the
// font-size zoom above, but per-table instead of one shared preference
// (different tables have different columns). Requires each <th> (and every
// dynamically-built <td>) to carry a stable data-col="<key>" attribute —
// see OpTransVolTraslados.html / Admin-SaaS.html / Admin-SaaS.js for the
// convention any future table must follow to get this for free.
const DATA_TABLE_COLUMNS_KEY_PREFIX = 'dataTableColumns:';
const DATA_TABLE_PIN_MAX = 4;
const DATA_TABLE_COL_MIN_WIDTH = 80; // px floor — narrower risks clipping icon buttons/logos/swatches
// tableId -> { table, wrapper, colgroup, columnKeys, labels, config, pinnedLeft, visiblePinned }
const dataTableColumnState = new Map();

function getTableId(wrapper, index) {
    return wrapper.dataset.tableId || `auto:${location.pathname}:${index}`;
}

// The real, interactive header row — always table.tHead.rows[0] UNLESS a
// column-group band (see renderColumnGroupBand) has been inserted above it,
// in which case the band takes rows[0]'s slot and the real header is marked
// with this class so every column-engine function below still finds it
// without needing to know band rows exist at all.
function getHeaderRow(table) {
    return table.tHead.querySelector('tr.data-table-header-row') || table.tHead.rows[0];
}

function getDataTableColumnKeys(table) {
    return Array.from(getHeaderRow(table).cells).map((th) => th.dataset.col).filter(Boolean);
}

function dataTableConfigStorageKey(tableId) {
    return `${DATA_TABLE_COLUMNS_KEY_PREFIX}${tableId}`;
}

// Order-independent fingerprint of a table's column SET (not its order) —
// used only to detect "this table's columns changed since I saved my
// layout", never to decide the actual order itself.
function dataTableColumnsSignature(columnKeys) {
    return [...columnKeys].sort().join('|');
}

// Reconciles stored config against the table's LIVE columns. Dropping/
// renaming a column here always falls back to a clean default (below) — the
// column SET changing at all invalidates the whole saved layout, rather
// than surgically patching order/pinned/hidden/widths around just the
// columns that moved. A screen picking up a brand-new column (like
// Nuestros Sectores de Negocio's own "Accesos por default") used to just
// tack it onto the END of everyone's already-saved order, landing it
// nowhere near where its <th> actually sits in the markup and making the
// whole row look shifted — this way, a real structural change instead
// resets that ONE table back to its natural, correct layout for everyone,
// same as a first-ever visit. A no-op (same signature) still behaves
// exactly as before: nothing about someone's customization changes.
// Reconciles a raw {order,hidden,pinned,widths} object against the columns
// that exist RIGHT NOW -- shared by the localStorage-backed per-device
// layout (loadDataTableConfig below) and by replaying an Acomodo Guardado
// (applyColumnLayoutConfig), which arrives with no "signature" of its own to
// pre-check (saved_layouts doesn't store one, see db.js's schema comment).
// A column dropped/renamed since the layout was captured just falls out of
// order/hidden/widths; a newly added column lands at the end of order,
// same as loadDataTableConfig's own default-from-scratch behavior.
function reconcileDataTableConfig(raw, columnKeys) {
    const keySet = new Set(columnKeys);
    const order = Array.isArray(raw?.order) ? raw.order.filter((k) => keySet.has(k)) : [];
    columnKeys.forEach((k) => { if (!order.includes(k)) order.push(k); });
    const hidden = Array.isArray(raw?.hidden) ? raw.hidden.filter((k) => keySet.has(k)) : [];
    const widths = (raw?.widths && typeof raw.widths === 'object') ? { ...raw.widths } : {};
    Object.keys(widths).forEach((k) => { if (!keySet.has(k)) delete widths[k]; });
    let pinned = Array.isArray(raw?.pinned) ? raw.pinned.filter((k) => keySet.has(k)) : null;
    // Default: pin just the first column, reproducing the old hardcoded
    // :first-child behavior until the user customizes it via the picker.
    if (!pinned) pinned = columnKeys[0] ? [columnKeys[0]] : [];
    pinned = pinned.slice(0, DATA_TABLE_PIN_MAX);
    return { order, hidden, widths, pinned, signature: dataTableColumnsSignature(columnKeys) };
}

function loadDataTableConfig(tableId, columnKeys) {
    let stored = null;
    try {
        stored = JSON.parse(localStorage.getItem(dataTableConfigStorageKey(tableId)) || 'null');
    } catch {
        stored = null;
    }
    if (stored && stored.signature !== dataTableColumnsSignature(columnKeys)) {
        stored = null;
    }
    return reconcileDataTableConfig(stored, columnKeys);
}

function saveDataTableConfig(tableId, config) {
    localStorage.setItem(dataTableConfigStorageKey(tableId), JSON.stringify(config));
}

// Pinned columns always render as a leftmost prefix, in their own order —
// decoupled from the general drag order, which is what lets the main
// header's drag-reorder and the pin picker's own drag-reorder each own a
// separate axis without stepping on each other.
function getVisualColumnOrder(config) {
    return [...config.pinned, ...config.order.filter((k) => !config.pinned.includes(k))];
}

function buildOrGetColgroup(table) {
    let colgroup = table.querySelector('colgroup');
    if (!colgroup) {
        colgroup = document.createElement('colgroup');
        table.insertBefore(colgroup, table.firstChild);
    }
    return colgroup;
}

function measureNaturalColumnWidths(table) {
    const widths = {};
    Array.from(getHeaderRow(table).cells).forEach((th) => {
        if (th.dataset.col) widths[th.dataset.col] = Math.max(DATA_TABLE_COL_MIN_WIDTH, Math.round(th.getBoundingClientRect().width));
    });
    return widths;
}

function applyPinStyle(cell, key, state) {
    const isPinned = state.visiblePinned.includes(key);
    cell.classList.toggle('data-table-col-pinned', isPinned);
    cell.classList.toggle('data-table-col-pinned-edge', isPinned && key === state.visiblePinned[state.visiblePinned.length - 1]);
    cell.style.left = isPinned ? `${state.pinnedLeft[key]}px` : '';
}

// Re-applies the current order/pin/hidden state to one row's cells, found
// via their own data-col (not DOM index) — this is the one function shared
// between the initial full-table pass below and the tbody MutationObserver,
// which is what lets page-specific renderers (renderClients(), a future
// Registro de traslados renderer, etc.) rebuild rows from scratch with zero
// awareness of column customization; they only need to tag cells with
// data-col.
function applyRowColumnState(tr, tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    const visualOrder = getVisualColumnOrder(state.config);
    const cellByKey = new Map();
    Array.from(tr.children).forEach((td) => { if (td.dataset.col) cellByKey.set(td.dataset.col, td); });
    visualOrder.forEach((key) => {
        const td = cellByKey.get(key);
        if (!td) return;
        tr.appendChild(td);
        applyPinStyle(td, key, state);
    });
}

// Ancho final de cada columna visible, para que la tabla nunca deje espacio
// en blanco a la derecha: las columnas FIJAS conservan su ancho (el que se
// les dio o que el usuario arrastró -- nunca se estiran), y las NORMALES se
// reparten lo que sobra en proporción a su ancho normal. Si las normales ya
// no caben en su ancho normal, no se encogen: empieza el scroll horizontal.
// Se vuelve a correr al cambiar el ancho de la tabla (ver el
// ResizeObserver en initDataTableColumns).
function distributeDataTableColumnWidths(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    const { table, colgroup, config, wrapper } = state;
    const hiddenSet = new Set(config.hidden);
    const visible = getVisualColumnOrder(config).filter((k) => !hiddenSet.has(k));
    const pinnedSet = new Set(state.visiblePinned);
    const baseOf = (k) => config.widths[k] || DATA_TABLE_COL_MIN_WIDTH;
    const sumOf = (keys) => keys.reduce((total, k) => total + baseOf(k), 0);
    const normals = visible.filter((k) => !pinnedSet.has(k));
    const normalSum = sumOf(normals);
    // 1px de margen: con bordes/escala fraccionarios clientWidth puede
    // redondear hacia arriba y un píxel de más basta para sacar un scroll
    // horizontal que nadie pidió.
    const room = wrapper.clientWidth - 1 - sumOf(visible.filter((k) => pinnedSet.has(k)));
    const widths = {};
    visible.forEach((k) => { widths[k] = baseOf(k); });
    // Un exceso de hasta 3px es ruido de redondeo, no "ya no caben": se
    // ajusta en vez de abrir un scroll horizontal de 1px.
    if (normals.length && wrapper.clientWidth > 0 && normalSum < room + 3) {
        let used = 0;
        normals.forEach((k, i) => {
            const w = i === normals.length - 1 ? room - used : Math.floor((baseOf(k) * room) / normalSum);
            widths[k] = Math.max(DATA_TABLE_COL_MIN_WIDTH, w);
            used += w;
        });
    }
    Array.from(colgroup.children).forEach((col) => {
        col.style.width = `${widths[col.dataset.col] ?? baseOf(col.dataset.col)}px`;
    });
    const total = visible.reduce((sum, k) => sum + widths[k], 0);
    table.style.width = `${total}px`;
    table.style.minWidth = `${total}px`;
    state.displayWidths = widths;
    state.distributedFor = wrapper.clientWidth;
}

function applyDataTableColumnLayout(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    const { table, colgroup, config } = state;
    const visualOrder = getVisualColumnOrder(config);
    const headerRow = getHeaderRow(table);
    const hiddenSet = new Set(config.hidden);
    const visiblePinned = config.pinned.filter((k) => !hiddenSet.has(k));
    state.visiblePinned = visiblePinned;

    visualOrder.forEach((key) => {
        const col = Array.from(colgroup.children).find((c) => c.dataset.col === key);
        if (col) {
            colgroup.appendChild(col);
            col.style.width = `${config.widths[key] || DATA_TABLE_COL_MIN_WIDTH}px`;
            // visibility:collapse, not display:none — <col display:none>
            // doesn't reliably collapse the column's rendered width under
            // border-collapse:separate (confirmed live: cells kept their
            // natural width). visibility:collapse is the CSS-Tables-spec
            // property made for exactly this and does collapse it to 0.
            col.style.visibility = hiddenSet.has(key) ? 'collapse' : '';
        }
        const th = Array.from(headerRow.cells).find((c) => c.dataset.col === key);
        if (th) headerRow.appendChild(th);
    });

    const pinnedLeft = {};
    let cumulative = 0;
    visiblePinned.forEach((key) => {
        pinnedLeft[key] = cumulative;
        cumulative += config.widths[key] || DATA_TABLE_COL_MIN_WIDTH;
    });
    state.pinnedLeft = pinnedLeft;
    // scroll-snap-align on tbody td (see Inicio-en.css) stops the resting
    // scroll position from ever landing mid-column, but by default it aligns
    // a column's start against the scrollport's own left edge (x=0) — which
    // is exactly where the pinned columns' opaque sticky box already sits,
    // so the column that lands there is the one currently hidden BEHIND that
    // box, not the one immediately following it. scroll-padding-left shifts
    // what "the left edge" means for snapping purposes to right after the
    // pinned zone, so the column that snaps there ends up flush against the
    // pinned box instead of half-swallowed by it.
    state.wrapper.style.scrollPaddingLeft = `${cumulative}px`;

    Array.from(headerRow.cells).forEach((th) => {
        applyPinStyle(th, th.dataset.col, state);
        th.draggable = !config.pinned.includes(th.dataset.col);
    });

    // <col display:none> already shrinks the empty-state colspan cell's
    // rendered width on its own, but keeping the attribute value itself
    // truthful (visible count, not total) avoids a misleading DOM.
    const visibleCount = visualOrder.filter((k) => !hiddenSet.has(k)).length;
    table.querySelectorAll('tbody > tr > td.data-table-empty-cell').forEach((td) => {
        td.colSpan = visibleCount;
    });

    table.style.tableLayout = 'fixed';
    // A short table (few columns, e.g. Equipo SaaS's 6, or a saved layout
    // that hides most columns) used to leave a blank strip between the
    // table's own right edge and the wrapper's. Confirmed live, 2026-09-30:
    // "Ninguna tabla se debe ver cortada... se debe ajustar el ancho de las
    // columnas al espacio de la tabla"; and again 2026-10-02: fixed columns
    // keep their width, normal ones fill the rest, scroll only starts once
    // the normal ones no longer fit. See distributeDataTableColumnWidths.
    distributeDataTableColumnWidths(tableId);

    Array.from(table.tBodies[0]?.rows || []).forEach((tr) => {
        if (!tr.querySelector('td.data-table-empty-cell')) applyRowColumnState(tr, tableId);
    });

    renderColumnGroupBand(tableId);
    refreshSavedLayoutPillForTable(tableId);
}
// Re-stretches every already-initialized table to its wrapper's current
// width on resize (window resize, or the sidebar collapsing/expanding --
// see its own call to this below, since toggling a CSS class never fires
// a window resize event on its own) -- without this, a table sized to fill
// the wrapper at load time would stay stuck at that old pixel width once
// the wrapper grew, leaving the same blank-strip bug back the moment the
// window or sidebar changed size.
function resizeAllDataTables() {
    dataTableColumnState.forEach((_, tableId) => applyDataTableColumnLayout(tableId));
}
window.addEventListener('resize', resizeAllDataTables);

// Restores order/widths/hidden/pinned to their true defaults — the order
// columns appear in the HTML (which always matches the permission tree's
// own order, since both are built from the same list), widths as measured
// the very first time the table ever rendered (naturalWidths, captured once
// in initDataTableColumns — re-measuring live would just re-save whatever
// custom widths are already on screen instead of undoing them), nothing
// hidden, and only the first column pinned. Wired into the "Limpiar" button
// (see renderDataTableColumnControls) so clearing filters also puts the
// table back the way it started, group bands included.
function resetDataTableColumnLayout(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    state.config = {
        order: state.columnKeys.slice(),
        hidden: [],
        widths: { ...state.naturalWidths },
        pinned: state.columnKeys[0] ? [state.columnKeys[0]] : [],
        signature: dataTableColumnsSignature(state.columnKeys),
    };
    saveDataTableConfig(tableId, state.config);
    applyDataTableColumnLayout(tableId);
}

// The ResizeObserver-based lazy-init (see initDataTableColumns) fires as
// soon as a table's wrapper has a nonzero width — for any page whose rows
// arrive from an async fetch (nearly every table in this app), that's
// almost always BEFORE those rows exist. A column with no header text
// (e.g. the trailing "actions" column) then measures as empty and gets
// clamped to DATA_TABLE_COL_MIN_WIDTH, which gets cached into localStorage
// via saveDataTableConfig and stays wrong forever — clipping icon buttons
// that only show up once real rows render. Re-measuring here, once real
// rows exist, and widening (never shrinking, so a deliberate manual resize
// is never overwritten) anything still sitting exactly at that floor fixes
// it. Safe to call repeatedly: once a column moves off the floor this
// becomes a no-op for it.
function refreshDataTableColumnWidths(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    let changed = false;
    state.columnKeys.forEach((key) => {
        if (state.config.widths[key] !== DATA_TABLE_COL_MIN_WIDTH) return;
        // table-layout:fixed is already applied by the time this runs, so
        // re-measuring the <th> (like the initial measureNaturalColumnWidths
        // does) would just read back the same clamped width -- look at each
        // body cell's scrollWidth instead, which still reports the true
        // content size even while the cell's own box is clipped by that
        // fixed width (overflow: hidden doesn't shrink scrollWidth).
        let needed = 0;
        state.table.querySelectorAll(`tbody > tr > td[data-col="${key}"]`).forEach((td) => {
            if (td.scrollWidth > needed) needed = td.scrollWidth;
        });
        if (needed > DATA_TABLE_COL_MIN_WIDTH) {
            state.config.widths[key] = needed + 4; // small buffer for padding/rounding
            changed = true;
        }
    });
    if (changed) {
        applyDataTableColumnLayout(tableId);
        saveDataTableConfig(tableId, state.config);
    }
}

// --- Reglas de Orden de Llenado -- a client admin can require one column
// ("gate") to have a value before another ("dependent") becomes usable, on
// any .data-table (see the "Reglas de Orden" toolbar icon below). A gate
// can unlock several dependents at once, and those dependents never block
// each other -- only their own gate does, and none of this blocks saving
// the record. tableId -> array of { id, gateCol, dependentCol }.
const fieldFillRulesCache = new Map();

async function loadFieldFillRules(tableId) {
    try {
        const res = await fetch(`${API_BASE}/business/field-fill-rules?tableKey=${encodeURIComponent(tableId)}`, { credentials: 'include' });
        const data = res.ok ? await res.json() : { rules: [] };
        fieldFillRulesCache.set(tableId, data.rules || []);
    } catch {
        fieldFillRulesCache.set(tableId, []);
    }
    applyFieldFillRules(tableId);
}

// attachInlineEdit cells (money/number/text) tag themselves with
// data-dt-empty since their own empty state renders as a "+ Agregar"
// placeholder, not "—" -- trust that marker when present. Everything else
// (plain-text cells) follows the "—" placeholder convention used
// throughout this app (see e.g. Business-CentrosCosto.js's own
// renderCostCenters) for an empty value.
function isDataTableCellEmpty(td) {
    if (td.dataset.dtEmpty !== undefined) return td.dataset.dtEmpty === '1';
    const text = td.textContent.trim();
    return !text || text === '—' || text === '-';
}

function applyFieldFillRules(tableId) {
    // Only an AUTHORIZED rule locks anything -- a newly-created one sits
    // idle until someone with the Autorizar grant approves it from the
    // Reglas de Orden de Llenado screen (Gestión).
    const rules = (fieldFillRulesCache.get(tableId) || []).filter((r) => r.authorized);
    if (!rules.length) return;
    const state = dataTableColumnState.get(tableId);
    const tbody = state?.table?.tBodies?.[0];
    if (!tbody) return;
    Array.from(tbody.rows).forEach((tr) => {
        rules.forEach((rule) => {
            const gateTd = tr.querySelector(`td[data-col="${rule.gateCol}"]`);
            const depTd = tr.querySelector(`td[data-col="${rule.dependentCol}"]`);
            if (!gateTd || !depTd) return;
            const locked = isDataTableCellEmpty(gateTd);
            depTd.classList.toggle('data-table-cell-locked', locked);
            depTd.dataset.fieldLocked = locked ? '1' : '';
            depTd.title = locked ? t('main.fieldRuleLockedHint', { field: state.labels[rule.gateCol] || rule.gateCol }) : '';
        });
    });
}

// Blocks a locked cell's click before whatever page-specific handler is
// attached to it ever runs -- registered once per wrapper, in the capture
// phase, so it works no matter how each page wires its own inline-edit /
// upload trigger for that cell.
function attachFieldLockGuard(wrapper, tableId) {
    if (wrapper.dataset.lockGuardAttached) return;
    wrapper.dataset.lockGuardAttached = '1';
    wrapper.addEventListener('click', (event) => {
        const lockedCell = event.target.closest('[data-field-locked="1"]');
        if (!lockedCell) return;
        event.stopImmediatePropagation();
        event.preventDefault();
        showToast(lockedCell.title || t('main.fieldRuleLockedGeneric'), 'warning');
    }, true);
}

function observeTableBody(table, tableId) {
    const tbody = table.tBodies[0];
    if (!tbody || tbody.dataset.colObserved) return;
    tbody.dataset.colObserved = '1';
    // renderClients()/openAnexoChangesModal() (and any future renderer)
    // fully tear down and rebuild <tbody> from scratch on every data change
    // rather than patching individual rows — watching for added rows here
    // means those renderers never need to know about column customization.
    let resortScheduled = false;
    const observer = new MutationObserver((mutations) => {
        let addedRealRow = false;
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.tagName === 'TR' && !node.querySelector('td.data-table-empty-cell')) {
                    applyRowColumnState(node, tableId);
                    addedRealRow = true;
                }
            });
        });
        if (addedRealRow) {
            refreshDataTableColumnWidths(tableId);
            applyFieldFillRules(tableId);
        }
        // A rebuild (PATCH-triggered refresh, filter re-render, etc.)
        // invalidates any remembered "before sorting" order — and if a sort
        // is active, re-apply it to the freshly-rebuilt rows so it survives
        // the refresh instead of silently reverting. Debounced to one pass
        // per burst of mutations (a tbody rebuild fires one mutation per
        // appended row, not one for the whole batch).
        const state = dataTableColumnState.get(tableId);
        if (state) state.originalRowOrder = null;
        if (state?.sortKey && !resortScheduled) {
            resortScheduled = true;
            queueMicrotask(() => {
                resortScheduled = false;
                applyTableSort(tableId);
            });
        }
        // Per-column value filters (see attachColumnFilterTrigger) use their
        // own CSS class, not the `hidden` attribute each page's own
        // Filtrar/Limpiar logic sets — the two systems stay independent
        // this way (a row hides if EITHER says so) and neither has to know
        // about the other. Still needs re-applying after every rebuild
        // though, same as sort, since a freshly-rebuilt row starts with
        // neither.
        applyColumnValueFilters(tableId);
    });
    observer.observe(tbody, { childList: true });
    // applyTableSort needs to pause/resume this same observer around its own
    // reordering (see there) — otherwise moving already-attached rows via
    // appendChild fires this observer too, and it can't tell that apart from
    // a real rebuild.
    const state = dataTableColumnState.get(tableId);
    if (state) state.tbodyObserver = observer;
}

let dataTableDropIndicatorEl = null;
function showDataTableDropIndicator(th, before) {
    if (!dataTableDropIndicatorEl) {
        dataTableDropIndicatorEl = document.createElement('div');
        dataTableDropIndicatorEl.className = 'data-table-col-drop-indicator';
    }
    dataTableDropIndicatorEl.style.left = before ? '0' : 'auto';
    dataTableDropIndicatorEl.style.right = before ? 'auto' : '0';
    th.appendChild(dataTableDropIndicatorEl);
}
function hideDataTableDropIndicator() {
    dataTableDropIndicatorEl?.remove();
}

function reorderColumn(tableId, sourceKey, targetKey, before) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    const order = state.config.order.filter((k) => k !== sourceKey);
    let idx = order.indexOf(targetKey);
    if (idx === -1) idx = order.length;
    order.splice(before ? idx : idx + 1, 0, sourceKey);
    state.config.order = order;
    saveDataTableConfig(tableId, state.config);
    applyDataTableColumnLayout(tableId);
}

// Horizontal drag-reorder across the header row. Pinned columns are
// excluded as both source AND drop target — their order only changes via
// the pin picker's own (vertical, separate) drag-reorder below, avoiding
// ambiguous cross-region drags between the fixed and scrolling zones.
function enableHeaderDragReorder(table, tableId) {
    const headerRow = getHeaderRow(table);
    if (headerRow.dataset.dragBound) return;
    headerRow.dataset.dragBound = '1';
    let draggedKey = null;
    headerRow.addEventListener('dragstart', (event) => {
        const th = event.target.closest('th');
        if (!th || th.draggable !== true) return;
        draggedKey = th.dataset.col;
        th.classList.add('data-table-col-dragging');
        event.dataTransfer.effectAllowed = 'move';
    });
    headerRow.addEventListener('dragover', (event) => {
        if (!draggedKey) return;
        const th = event.target.closest('th');
        if (!th || th.dataset.col === draggedKey) return;
        const state = dataTableColumnState.get(tableId);
        if (!state || state.config.pinned.includes(th.dataset.col)) return;
        event.preventDefault();
        const rect = th.getBoundingClientRect();
        showDataTableDropIndicator(th, (event.clientX - rect.left) < rect.width / 2);
    });
    headerRow.addEventListener('drop', (event) => {
        if (!draggedKey) return;
        event.preventDefault();
        const th = event.target.closest('th');
        hideDataTableDropIndicator();
        const key = draggedKey;
        draggedKey = null;
        if (!th || th.dataset.col === key) return;
        const state = dataTableColumnState.get(tableId);
        if (!state || state.config.pinned.includes(th.dataset.col)) return;
        const rect = th.getBoundingClientRect();
        reorderColumn(tableId, key, th.dataset.col, (event.clientX - rect.left) < rect.width / 2);
    });
    headerRow.addEventListener('dragend', () => {
        headerRow.querySelectorAll('.data-table-col-dragging').forEach((el) => el.classList.remove('data-table-col-dragging'));
        hideDataTableDropIndicator();
        draggedKey = null;
    });
}

// Small vertical-list reorder used only by the pin picker's "Pinned"
// section — different axis and DOM shape than the header's horizontal
// reorder above, not worth forcing into one shared abstraction.
function enableListDragReorder(listEl, onReorder) {
    if (listEl.dataset.dragBound) return;
    listEl.dataset.dragBound = '1';
    let draggedEl = null;
    listEl.addEventListener('dragstart', (event) => {
        const row = event.target.closest('[draggable="true"]');
        if (!row || row.parentElement !== listEl) return;
        draggedEl = row;
        row.classList.add('data-table-col-dragging');
        event.dataTransfer.effectAllowed = 'move';
    });
    listEl.addEventListener('dragover', (event) => {
        if (!draggedEl) return;
        event.preventDefault();
        const target = event.target.closest('[draggable="true"]');
        if (!target || target === draggedEl || target.parentElement !== listEl) return;
        const rect = target.getBoundingClientRect();
        const before = (event.clientY - rect.top) < rect.height / 2;
        listEl.insertBefore(draggedEl, before ? target : target.nextSibling);
    });
    listEl.addEventListener('dragend', () => {
        if (!draggedEl) return;
        draggedEl.classList.remove('data-table-col-dragging');
        const newOrder = Array.from(listEl.children).map((el) => el.dataset.col);
        draggedEl = null;
        onReorder(newOrder);
    });
}

function liveResizeColumn(tableId, key, widthPx) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    const col = Array.from(state.colgroup.children).find((c) => c.dataset.col === key);
    if (col) col.style.width = `${widthPx}px`;
    const previousWidth = state.config.widths[key] || DATA_TABLE_COL_MIN_WIDTH;
    const delta = widthPx - previousWidth;
    state.config.widths[key] = widthPx;
    const currentTotal = parseFloat(state.table.style.width) || 0;
    state.table.style.width = `${currentTotal + delta}px`;
    state.table.style.minWidth = state.table.style.width;
    // Only pinned columns need their `left` offset touched live — this is
    // the one part of a resize that's O(rows) rather than O(1), since every
    // pinned cell in every row after this column needs to shift. Throttled
    // via requestAnimationFrame in attachResizeHandle so it isn't janky on
    // a large tbody while actively dragging.
    if (state.visiblePinned.includes(key)) {
        let cumulative = 0;
        const pinnedLeft = {};
        state.visiblePinned.forEach((k) => {
            pinnedLeft[k] = cumulative;
            cumulative += state.config.widths[k] || DATA_TABLE_COL_MIN_WIDTH;
        });
        state.pinnedLeft = pinnedLeft;
        state.table.querySelectorAll('[data-col]').forEach((cell) => {
            const k = cell.dataset.col;
            if (state.visiblePinned.includes(k)) cell.style.left = `${pinnedLeft[k]}px`;
        });
    }
}

function attachResizeHandle(th, tableId) {
    if (th.querySelector('.data-table-col-resize-handle')) return;
    const handle = document.createElement('div');
    handle.className = 'data-table-col-resize-handle';
    handle.draggable = false;
    handle.addEventListener('mousedown', (event) => {
        event.stopPropagation();
        event.preventDefault();
        const key = th.dataset.col;
        const state = dataTableColumnState.get(tableId);
        if (!state) return;
        const startX = event.clientX;
        // Parte del ancho que la columna tiene EN PANTALLA (una columna
        // normal puede estar estirada para llenar la tabla), no del ancho
        // guardado.
        const startWidth = state.displayWidths?.[key] || state.config.widths[key] || DATA_TABLE_COL_MIN_WIDTH;
        handle.classList.add('data-table-col-resizing');
        let pendingWidth = startWidth;
        let moved = false;
        let rafId = null;
        const applyPending = () => {
            rafId = null;
            liveResizeColumn(tableId, key, pendingWidth);
        };
        const onMove = (moveEvent) => {
            if (!moved) {
                // Las demás columnas se quedan como se ven ahora: así soltar
                // el borde no las reacomoda.
                moved = true;
                Object.entries(state.displayWidths || {}).forEach(([k, w]) => { state.config.widths[k] = w; });
            }
            pendingWidth = Math.max(DATA_TABLE_COL_MIN_WIDTH, startWidth + (moveEvent.clientX - startX));
            if (rafId == null) rafId = requestAnimationFrame(applyPending);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            handle.classList.remove('data-table-col-resizing');
            if (rafId != null) cancelAnimationFrame(rafId);
            if (!moved) return;
            state.config.widths[key] = pendingWidth;
            saveDataTableConfig(tableId, state.config);
            applyDataTableColumnLayout(tableId);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
    th.appendChild(handle);
}

// Click-to-sort A-Z/Z-A per column, on every .data-table automatically —
// same "generic, works everywhere" approach as pin/resize/reorder above.
// Cycles asc -> desc -> back to insertion order on a 3rd click of the SAME
// column; clicking a different column always starts fresh at asc. Bound to
// the whole <th> (not a separate inner element) since a genuine drag
// (enableHeaderDragReorder) never also fires a click on its source element
// — only the resize handle needs an explicit bail-out, since its own
// mousedown/mouseup (with no movement) DOES count as a click on that child.
// The asc/desc arrow itself is a CSS ::after (see .data-table-col-sort-asc/
// -desc in Inicio-en.css), not an appended DOM node — appending would work
// today, but data-i18n's `el.textContent = ...` on language change wipes
// every child of an element it targets, and every <th> here has data-i18n.
function parseSortNumber(raw) {
    const cleaned = raw.replace(/[$,\s]/g, '');
    if (cleaned === '' || cleaned === '—') return null;
    const n = parseFloat(cleaned);
    return Number.isNaN(n) ? null : n;
}
function getCellSortValue(td) {
    if (td.dataset.sortValue != null) return td.dataset.sortValue;
    const select = td.querySelector('select');
    if (select) return select.options[select.selectedIndex]?.text ?? '';
    return td.textContent.trim();
}
function compareSortCells(a, b) {
    const na = parseSortNumber(a);
    const nb = parseSortNumber(b);
    if (na !== null && nb !== null) return na - nb;
    return a.localeCompare(b, currentLang, { sensitivity: 'base', numeric: true });
}
function applySortIndicators(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    Array.from(getHeaderRow(state.table).cells).forEach((th) => {
        th.classList.remove('data-table-col-sort-asc', 'data-table-col-sort-desc');
        if (th.dataset.col === state.sortKey) {
            th.classList.add(state.sortDir === 'asc' ? 'data-table-col-sort-asc' : 'data-table-col-sort-desc');
        }
    });
}
function applyTableSort(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    const tbody = state.table.tBodies[0];
    if (!tbody) return;
    const rows = Array.from(tbody.rows).filter((r) => !r.querySelector('td.data-table-empty-cell'));
    if (!rows.length) return;
    // Moving already-attached rows via appendChild below still fires
    // observeTableBody's own childList observer, which would otherwise read
    // that as a real rebuild and wipe originalRowOrder right back out from
    // under us — pause it for just this reorder, not for the whole function,
    // so a genuine rebuild that happens to interleave is still caught.
    state.tbodyObserver?.disconnect();
    if (!state.sortKey) {
        if (state.originalRowOrder) state.originalRowOrder.forEach((row) => { if (tbody.contains(row)) tbody.appendChild(row); });
    } else {
        if (!state.originalRowOrder) state.originalRowOrder = rows.slice();
        const dir = state.sortDir === 'asc' ? 1 : -1;
        const sorted = rows.slice().sort((rowA, rowB) => {
            const cellA = rowA.querySelector(`[data-col="${state.sortKey}"]`);
            const cellB = rowB.querySelector(`[data-col="${state.sortKey}"]`);
            return compareSortCells(cellA ? getCellSortValue(cellA) : '', cellB ? getCellSortValue(cellB) : '') * dir;
        });
        sorted.forEach((row) => tbody.appendChild(row));
    }
    state.tbodyObserver?.observe(tbody, { childList: true });
}
function sortTableByColumn(tableId, key) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    let nextDir;
    if (state.sortKey !== key) nextDir = 'asc';
    else if (state.sortDir === 'asc') nextDir = 'desc';
    else if (state.sortDir === 'desc') nextDir = null;
    else nextDir = 'asc';
    state.sortKey = nextDir ? key : null;
    state.sortDir = nextDir;
    applySortIndicators(tableId);
    applyTableSort(tableId);
}
function attachSortHandler(th, tableId) {
    if (th.dataset.sortBound) return;
    th.dataset.sortBound = '1';
    th.classList.add('data-table-col-sortable');
    th.addEventListener('click', (event) => {
        if (event.target.closest('.data-table-col-resize-handle') || event.target.closest('.data-table-col-filter-trigger')) return;
        sortTableByColumn(tableId, th.dataset.col);
    });
}

// --- Per-column value filter (Excel-style checklist) -----------------------
// Adds ON TOP of each page's own Filtro panel (free text/status/etc), not a
// replacement — a separate small dropdown per header lets you pick which
// distinct values of THAT column to keep showing. Distinct values are read
// straight from the currently-rendered rows (not from any other filter's
// hidden state), so the checklist for one column never depends on what's
// currently selected in another — simple and predictable, if not quite
// Excel's "only show values still reachable" behavior.
let dataTableFilterMenuEl = null;
let dataTableFilterMenuTableId = null;

function getColumnDistinctValues(tableId, key) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return [];
    const values = new Set();
    Array.from(state.table.tBodies[0]?.rows || []).forEach((tr) => {
        if (tr.querySelector('td.data-table-empty-cell')) return;
        const td = tr.querySelector(`[data-col="${key}"]`);
        if (td) values.add(td.textContent.trim());
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Every date column in this app renders as a plain ISO string (YYYY-MM-DD)
// with no separate formatting step (see Admin-Planes.js's own formatDate,
// which just slices to 10 chars) — auto-detecting off that shape avoids
// needing any page to opt a column into "this is a date" by hand. A column
// with zero non-empty values (nothing rendered yet) is never treated as a
// date column — nothing to detect from.
function isDateColumn(distinctValues) {
    // textCell()-style renderers (Admin-SaaS.js, Admin-Planes.js, etc.) show
    // "—" for a null/empty date, never an actual empty string — both need
    // excluding here, or a single client/plan/row with no date at all would
    // make the whole column fail detection.
    const nonEmpty = distinctValues.filter((v) => v !== '' && v !== '—');
    return nonEmpty.length > 0 && nonEmpty.every((v) => ISO_DATE_RE.test(v));
}

// Regla de una columna: la otra forma de filtrar, además de marcar valores uno
// por uno. "Contiene GRUPO" o "de 10 a 50" siguen valiendo para los registros
// que lleguen después. La crea el editor de Búsqueda Guardada; el embudo del
// encabezado la muestra como los valores que cumplen hoy y, en cuanto se toca
// una casilla, la convierte en esa selección.
// Forma: { kind: 'text', mode, text } | { kind: 'range', rtype, from, to }.
// rtype = qué se compara: 'date' (fecha completa, la de antes), 'number',
// 'dayname' (Lun…Dom), 'monthname' (Ene…Dic), 'time' (hh:mm:ss) o 'week'
// (Sem12_2026). Un rango sin rtype es una fecha.
function textRuleMatches(mode, query, value) {
    const q = String(query || '').trim().toLowerCase();
    if (q === '') return true;
    const v = String(value ?? '').toLowerCase();
    if (mode === 'equals') {
        // Igual que en el embudo: ambos lados se parten por coma.
        const queryTerms = q.split(',').map((s) => s.trim()).filter(Boolean);
        const valueTerms = v.split(',').map((s) => s.trim());
        return queryTerms.some((term) => valueTerms.includes(term));
    }
    return mode === 'startsWith' ? v.startsWith(q) : v.includes(q);
}

// Las fechas de la tabla se ven como 2026-10-01 (la mayoría) o como
// 01/oct/2026 (la columna Fecha de Control Interno); las dos se comparan como
// ISO contra el Desde/Hasta.
const RULE_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const RULE_MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const RULE_MONTH_ENGLISH = { jan: 0, apr: 3, aug: 7, dec: 11 };
// La semana va de lunes a domingo.
const RULE_DAYS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
const RULE_DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const RULE_RANGE_TYPE_BY_KEY = {
    colSysFecha: 'date', colSysDiaNum: 'number', colSysDiaTexto: 'dayname', colSysMesNum: 'number',
    colSysMesTexto: 'monthname', colSysAnio: 'number', colSysSemana: 'week', colSysHora: 'time',
};

function cellDateToIso(value) {
    const v = String(value ?? '').trim();
    if (ISO_DATE_RE.test(v)) return v;
    const m = v.match(/^(\d{1,2})\/([A-Za-zÀ-ÿ]{3,4})\.?\/(\d{4})$/);
    if (!m) return null;
    const abbr = m[2].toLowerCase().slice(0, 3);
    let month = RULE_MONTHS.indexOf(abbr);
    if (month === -1) month = RULE_MONTH_ENGLISH[abbr] ?? -1;
    if (month === -1) return null;
    return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function formatRuleDate(iso) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${RULE_MONTHS[Number(m[2]) - 1]}/${m[1]}` : String(iso);
}

// "$1,250.00" -> 1250. Solo números: nada de letras sueltas.
function parseRuleNumber(value) {
    const s = String(value ?? '').trim().replace(/[$,\s%]/g, '');
    if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
}

function foldRuleText(value) {
    return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Lo que se compara en un rango: un número según el tipo (la fecha como días,
// la hora como segundos, la semana como año*100+semana, el día/mes por su
// lugar en la lista). null = no es un valor de ese tipo.
function rangeSortKey(rtype, raw) {
    const v = String(raw ?? '').trim();
    if (v === '') return null;
    switch (rtype) {
        case 'number':
            return parseRuleNumber(v);
        case 'dayname': {
            const i = RULE_DAYS.indexOf(foldRuleText(v).slice(0, 3));
            return i === -1 ? null : i;
        }
        case 'monthname': {
            const i = RULE_MONTHS.indexOf(foldRuleText(v).slice(0, 3));
            return i === -1 ? null : i;
        }
        case 'time': {
            const m = v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
            return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0) : null;
        }
        case 'week': {
            const m = v.match(/^Sem(\d{1,2})_(\d{4})$/i);
            return m ? Number(m[2]) * 100 + Number(m[1]) : null;
        }
        default: {
            const iso = cellDateToIso(v);
            if (!iso) return null;
            const [y, mo, d] = iso.split('-').map(Number);
            return Date.UTC(y, mo - 1, d) / 86400000;
        }
    }
}

function rangeRuleMatches(rule, value) {
    const lo = rangeSortKey(rule.rtype, rule.from);
    const hi = rangeSortKey(rule.rtype, rule.to);
    if (lo === null && hi === null) return true;
    const k = rangeSortKey(rule.rtype, value);
    if (k === null) return false; // sin valor de ese tipo no entra a un rango
    return !(lo !== null && k < lo) && !(hi !== null && k > hi);
}

function isColumnRuleActive(rule) {
    if (!rule) return false;
    if (rule.kind === 'range') return rangeSortKey(rule.rtype, rule.from) !== null || rangeSortKey(rule.rtype, rule.to) !== null;
    return String(rule.text || '').trim() !== '';
}

function columnRuleMatches(rule, value) {
    if (!isColumnRuleActive(rule)) return true;
    return rule.kind === 'range' ? rangeRuleMatches(rule, value) : textRuleMatches(rule.mode, rule.text, value);
}

// Un extremo del rango como se lee: fecha como 01/oct/2026, monto con $.
function formatRuleBound(rule, raw) {
    const v = String(raw ?? '').trim();
    if (rangeSortKey(rule.rtype, v) === null) return '';
    if (rule.rtype === 'number') {
        const n = parseRuleNumber(v);
        return rule.currency
            ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : v;
    }
    if (!rule.rtype || rule.rtype === 'date') return formatRuleDate(cellDateToIso(v));
    return v;
}

function describeColumnRule(rule) {
    if (rule.kind === 'range') {
        const from = formatRuleBound(rule, rule.from);
        const to = formatRuleBound(rule, rule.to);
        if (from && to) return `${from} – ${to}`;
        return from ? t('main.savedSearchRuleFrom', { from }) : t('main.savedSearchRuleTo', { to });
    }
    const modeKey = { startsWith: 'main.filterModeStartsWith', equals: 'main.filterModeEquals' }[rule.mode] || 'main.filterModeContains';
    return `${t(modeKey)} "${String(rule.text).trim()}"`;
}

// La regla como frase: "contiene «ADMIN»", "del 01/oct/2026 al 31/oct/2026".
function describeRuleLine(rule) {
    if (rule.kind === 'range') {
        const from = formatRuleBound(rule, rule.from);
        const to = formatRuleBound(rule, rule.to);
        if (from && to) {
            const isDate = !rule.rtype || rule.rtype === 'date';
            return t(isDate ? 'main.savedSearchRuleFromTo' : 'main.savedSearchRuleFromToPlain', { from, to });
        }
        return from ? t('main.savedSearchRuleFrom', { from }) : t('main.savedSearchRuleTo', { to });
    }
    const modeKey = { startsWith: 'main.filterModeStartsWith', equals: 'main.filterModeEquals' }[rule.mode] || 'main.filterModeContains';
    return `${t(modeKey).toLowerCase()} «${String(rule.text).trim()}»`;
}

// Qué se compara en el "Desde–Hasta" de una columna, o null si no tiene (texto
// normal: ahí solo van los tres modos de siempre). Las de Control Interno se
// reconocen por su nombre aunque la tabla aún no tenga registros; las demás
// por sus valores: todas fechas, o todos números.
function detectRangeType(key, values) {
    if (RULE_RANGE_TYPE_BY_KEY[key]) return RULE_RANGE_TYPE_BY_KEY[key];
    const filled = values.filter((v) => v !== '' && v !== '—');
    if (!filled.length) return null;
    if (filled.every((v) => cellDateToIso(v))) return 'date';
    if (filled.every((v) => parseRuleNumber(v) !== null)) return 'number';
    return null;
}

// Los dos campos de "Desde–Hasta", del tipo que toca: fecha, hora, número,
// lista de días o de meses, o semana + año. Escriben en rule.from / rule.to.
function buildRangeFields(container, rule, onInput) {
    const makeLabel = (key) => {
        const span = document.createElement('span');
        span.className = 'data-table-col-filter-date-label';
        span.textContent = t(key);
        return span;
    };
    const makeBound = (which) => {
        const ariaKey = which === 'from' ? 'main.savedSearchRangeFrom' : 'main.savedSearchRangeTo';
        if (rule.rtype === 'dayname' || rule.rtype === 'monthname') {
            const select = document.createElement('select');
            select.className = 'data-table-col-filter-date';
            select.setAttribute('aria-label', t(ariaKey));
            ['', ...(rule.rtype === 'dayname' ? RULE_DAY_LABELS : RULE_MONTH_LABELS)].forEach((label) => {
                select.add(new Option(label || '—', label));
            });
            select.value = rule[which] || '';
            select.addEventListener('change', () => { rule[which] = select.value; onInput(); });
            return select;
        }
        if (rule.rtype === 'week') {
            const wrap = document.createElement('span');
            wrap.className = 'data-table-search-week';
            wrap.setAttribute('aria-label', t(ariaKey));
            const week = document.createElement('input');
            week.type = 'number';
            week.min = '1';
            week.max = '53';
            week.placeholder = t('main.savedSearchWeekPlaceholder');
            const year = document.createElement('input');
            year.type = 'number';
            year.min = '2000';
            year.max = '2100';
            year.placeholder = t('main.savedSearchYearPlaceholder');
            [week, year].forEach((el) => { el.className = 'data-table-col-filter-date'; });
            const m = String(rule[which] || '').match(/^Sem(\d{1,2})_(\d{4})$/i);
            if (m) { week.value = String(Number(m[1])); year.value = m[2]; }
            const sync = () => {
                rule[which] = week.value && year.value ? `Sem${Number(week.value)}_${year.value}` : '';
                onInput();
            };
            week.addEventListener('input', sync);
            year.addEventListener('input', sync);
            wrap.append(week, year);
            return wrap;
        }
        const input = document.createElement('input');
        input.className = 'data-table-col-filter-date';
        input.setAttribute('aria-label', t(ariaKey));
        if (rule.rtype === 'number') {
            input.type = 'text';
            input.inputMode = 'decimal';
            input.placeholder = '0';
        } else if (rule.rtype === 'time') {
            input.type = 'time';
            input.step = '1';
        } else {
            input.type = 'date';
        }
        input.value = rule[which] || '';
        input.addEventListener('input', () => {
            const v = input.value.trim();
            rule[which] = rule.rtype === 'time' && /^\d{2}:\d{2}$/.test(v) ? `${v}:00` : v;
            onInput();
        });
        return input;
    };
    container.append(makeLabel('main.savedSearchRangeFrom'), makeBound('from'), makeLabel('main.savedSearchRangeTo'), makeBound('to'));
}

// Cuántas filas de la tabla cumplen hoy la regla (y las casillas, si hay).
function countRuleRows(tableId, key, rule, selected) {
    const state = dataTableColumnState.get(tableId);
    const rows = Array.from(state?.table.tBodies[0]?.rows || []).filter((tr) => !tr.querySelector('td.data-table-empty-cell'));
    let matching = 0;
    rows.forEach((tr) => {
        const td = tr.querySelector(`[data-col="${key}"]`);
        const value = td ? td.textContent.trim() : '';
        if ((!selected.size || selected.has(value)) && columnRuleMatches(rule, value)) matching += 1;
    });
    return { matching, total: rows.length };
}

// Rows hide via a CSS class (see .data-table-row-col-filtered), never the
// `hidden` attribute each page's own applyXFilters() already owns — the two
// mechanisms stay independent this way (a row shows only if BOTH leave it
// visible), so this file never has to know anything about any specific
// page's filter fields, and no page has to know this feature exists.
function applyColumnValueFilters(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    const rows = Array.from(state.table.tBodies[0]?.rows || []).filter((tr) => !tr.querySelector('td.data-table-empty-cell'));
    if (!state.columnFilters.size && !state.columnRules.size) {
        rows.forEach((tr) => tr.classList.remove('data-table-row-col-filtered'));
        refreshSavedSearchPillForTable(tableId);
        refreshPanelColumnFilters(tableId);
        return;
    }
    rows.forEach((tr) => {
        let visible = true;
        state.columnFilters.forEach((selectedSet, key) => {
            const td = tr.querySelector(`[data-col="${key}"]`);
            if (!selectedSet.has(td ? td.textContent.trim() : '')) visible = false;
        });
        state.columnRules.forEach((rule, key) => {
            const td = tr.querySelector(`[data-col="${key}"]`);
            if (!columnRuleMatches(rule, td ? td.textContent.trim() : '')) visible = false;
        });
        tr.classList.toggle('data-table-row-col-filtered', !visible);
    });
    refreshSavedSearchPillForTable(tableId);
    refreshPanelColumnFilters(tableId);
}

function updateColumnFilterIndicator(th, active) {
    th.classList.toggle('data-table-col-filter-active', active);
}

function closeColumnFilterMenu() {
    dataTableFilterMenuEl?.remove();
    dataTableFilterMenuEl = null;
    dataTableFilterMenuTableId = null;
    document.removeEventListener('click', handleColumnFilterOutsideClick, true);
    window.removeEventListener('scroll', closeColumnFilterMenu, true);
    window.removeEventListener('resize', closeColumnFilterMenu);
}
function handleColumnFilterOutsideClick(event) {
    if (dataTableFilterMenuEl && !dataTableFilterMenuEl.contains(event.target) && !event.target.closest('.data-table-col-filter-trigger')) {
        closeColumnFilterMenu();
    }
}

function openColumnFilterMenu(th, tableId, key) {
    const reopening = dataTableFilterMenuTableId === tableId && dataTableFilterMenuEl?.dataset.col === key;
    closeColumnFilterMenu();
    if (reopening) return; // clicking the same trigger again just closes it

    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    const distinctValues = getColumnDistinctValues(tableId, key);
    // Una regla de Búsqueda Guardada ("contiene GRUPO") se ve aquí como los
    // valores que la cumplen hoy; al tocar cualquier casilla pasa a ser esa
    // selección (ver más abajo, columnRules.delete).
    const currentSelection = () => {
        const picked = state.columnFilters.get(key);
        const rule = state.columnRules.get(key);
        const base = picked ? [...picked] : distinctValues;
        return new Set(rule ? base.filter((v) => columnRuleMatches(rule, v)) : base);
    };
    const selected = currentSelection();

    const menu = document.createElement('div');
    menu.className = 'data-table-col-filter-menu';
    menu.dataset.col = key;

    // Above "Todos" — only narrows which rows are VISIBLE in the checklist
    // below, never touches selection state, so searching to find one value
    // and clearing the search again always shows the filter exactly as it
    // was left. Date columns (see isDateColumn) get a Desde:/Hasta: range
    // instead of the text box — "starts with" a date is meaningless, a
    // range is what's actually useful there. applyRowSearch (defined once
    // list/checkboxes exist, further down) does the actual hiding either
    // way.
    const dateColumn = isDateColumn(distinctValues);
    const searchRow = document.createElement('div');
    searchRow.className = 'data-table-col-filter-search-row';
    let applyRowSearch = () => {};

    if (dateColumn) {
        const fromField = document.createElement('input');
        fromField.type = 'date';
        fromField.className = 'data-table-col-filter-date';
        fromField.setAttribute('aria-label', t('main.filterDateFrom'));
        fromField.addEventListener('click', (event) => event.stopPropagation());
        const toField = document.createElement('input');
        toField.type = 'date';
        toField.className = 'data-table-col-filter-date';
        toField.setAttribute('aria-label', t('main.filterDateTo'));
        toField.addEventListener('click', (event) => event.stopPropagation());

        const fromLabel = document.createElement('span');
        fromLabel.className = 'data-table-col-filter-date-label';
        fromLabel.textContent = t('main.filterDateFrom');
        const toLabel = document.createElement('span');
        toLabel.className = 'data-table-col-filter-date-label';
        toLabel.textContent = t('main.filterDateTo');
        searchRow.append(fromLabel, fromField, toLabel, toField);

        applyRowSearch = (row) => {
            const value = row.dataset.searchValue;
            if (fromField.value && value < fromField.value) return false;
            if (toField.value && value > toField.value) return false;
            return true;
        };
        fromField.addEventListener('input', () => searchInputChanged());
        toField.addEventListener('input', () => searchInputChanged());
    } else {
        const FILTER_MODES = [
            { id: 'startsWith', labelKey: 'main.filterModeStartsWith' },
            { id: 'contains', labelKey: 'main.filterModeContains' },
            { id: 'equals', labelKey: 'main.filterModeEquals' },
        ];
        let searchMode = 'contains';

        // Shows which mode is active without having to reopen the dropdown
        // to check — updated in the option click handler below.
        const modeCurrentLabel = document.createElement('div');
        modeCurrentLabel.className = 'data-table-col-filter-mode-current';
        modeCurrentLabel.textContent = t('main.filterModeContains');
        menu.appendChild(modeCurrentLabel);

        const modeBtn = document.createElement('button');
        modeBtn.type = 'button';
        modeBtn.className = 'data-table-col-filter-mode-btn';
        modeBtn.setAttribute('aria-label', t('main.filterModeLabel'));
        modeBtn.title = t('main.filterModeLabel');
        modeBtn.innerHTML = '<i class="bx bx-slider-alt" aria-hidden="true"></i>';
        searchRow.appendChild(modeBtn);

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'data-table-col-filter-search';
        searchInput.placeholder = t('main.filterSearchPlaceholder');
        searchInput.addEventListener('click', (event) => event.stopPropagation());
        searchRow.appendChild(searchInput);

        const modeMenu = document.createElement('div');
        modeMenu.className = 'data-table-col-filter-mode-menu';
        modeMenu.hidden = true;
        const modeButtons = FILTER_MODES.map((mode) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'data-table-col-filter-mode-option';
            btn.textContent = t(mode.labelKey);
            btn.classList.toggle('data-table-col-filter-mode-option-active', mode.id === searchMode);
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                searchMode = mode.id;
                modeButtons.forEach((b) => b.classList.remove('data-table-col-filter-mode-option-active'));
                btn.classList.add('data-table-col-filter-mode-option-active');
                modeCurrentLabel.textContent = t(mode.labelKey);
                modeMenu.hidden = true;
                searchInputChanged();
            });
            modeMenu.appendChild(btn);
            return btn;
        });
        searchRow.appendChild(modeMenu);

        modeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            modeMenu.hidden = !modeMenu.hidden;
        });
        menu.addEventListener('click', (event) => {
            if (!modeMenu.hidden && event.target !== modeBtn && !modeMenu.contains(event.target)) modeMenu.hidden = true;
        });

        applyRowSearch = (row) => {
            const query = searchInput.value.trim().toLowerCase();
            if (query === '') return true;
            const value = row.dataset.searchValue;
            if (searchMode === 'equals') {
                // A cell can itself hold several comma-separated values (e.g.
                // Centro de Costos' multi-select) -- "Igual que" splits BOTH
                // sides on comma and matches if any filter term exactly
                // matches any of the cell's own terms, so typing "GEA,
                // TRAMET" matches a row tagged just "GEA" as well as one
                // tagged "GEA,TRAMET,GSN,GEIPSA". A single term with no comma
                // on either side behaves exactly like the old plain equality.
                const queryTerms = query.split(',').map((s) => s.trim()).filter(Boolean);
                const valueTerms = value.split(',').map((s) => s.trim());
                return queryTerms.some((term) => valueTerms.includes(term));
            }
            return searchMode === 'startsWith' ? value.startsWith(query) : value.includes(query);
        };
        searchInput.addEventListener('input', () => searchInputChanged());
    }
    menu.appendChild(searchRow);

    const allRow = document.createElement('label');
    allRow.className = 'data-table-col-filter-option data-table-col-filter-all';
    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.checked = selected.size === distinctValues.length;
    allCheckbox.indeterminate = selected.size > 0 && selected.size < distinctValues.length;
    const allLabel = document.createElement('span');
    allLabel.textContent = t('main.filterAll');
    allRow.append(allCheckbox, allLabel);
    menu.appendChild(allRow);

    const list = document.createElement('div');
    list.className = 'data-table-col-filter-list';
    const checkboxes = [];

    function syncAllCheckbox() {
        const current = currentSelection();
        allCheckbox.checked = current.size === distinctValues.length;
        allCheckbox.indeterminate = current.size > 0 && current.size < distinctValues.length;
    }

    distinctValues.forEach((value) => {
        const row = document.createElement('label');
        row.className = 'data-table-col-filter-option';
        row.dataset.searchValue = (value || '').toLowerCase();
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selected.has(value);
        cb.addEventListener('change', () => {
            const current = currentSelection();
            if (cb.checked) current.add(value); else current.delete(value);
            state.columnRules.delete(key);
            if (current.size === distinctValues.length) state.columnFilters.delete(key);
            else state.columnFilters.set(key, current);
            applyColumnValueFilters(tableId);
            updateColumnFilterIndicator(th, state.columnFilters.has(key));
            syncAllCheckbox();
        });
        const span = document.createElement('span');
        span.textContent = value || '—';
        row.append(cb, span);
        list.appendChild(row);
        checkboxes.push(cb);
    });
    menu.appendChild(list);

    // Hoisted (function declaration, not const) so the date/text branches
    // above can wire their own input listeners to call it even though it's
    // only defined here, once `list`'s rows actually exist.
    function searchInputChanged() {
        list.querySelectorAll('.data-table-col-filter-option').forEach((row) => {
            row.hidden = !applyRowSearch(row);
        });
    }

    allCheckbox.addEventListener('change', () => {
        checkboxes.forEach((cb) => { cb.checked = allCheckbox.checked; });
        state.columnRules.delete(key);
        if (allCheckbox.checked) state.columnFilters.delete(key);
        else state.columnFilters.set(key, new Set());
        applyColumnValueFilters(tableId);
        updateColumnFilterIndicator(th, state.columnFilters.has(key));
        allCheckbox.indeterminate = false;
    });

    document.body.appendChild(menu);
    const rect = th.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const left = Math.min(rect.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - menuWidth - 8);
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${Math.max(8, left)}px`;
    dataTableFilterMenuEl = menu;
    dataTableFilterMenuTableId = tableId;
    searchRow.querySelector('input')?.focus();
    setTimeout(() => {
        document.addEventListener('click', handleColumnFilterOutsideClick, true);
        window.addEventListener('scroll', closeColumnFilterMenu, true);
        window.addEventListener('resize', closeColumnFilterMenu);
    }, 0);
}
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dataTableFilterMenuEl) closeColumnFilterMenu();
});

// One small trigger per header, separate from the sortable header text
// itself (see attachSortHandler's own click handler, which ignores clicks
// on this trigger) — clicking the column TITLE still sorts, exactly as
// before; this is what lets a column be filterable too without the two
// interactions fighting over the same click.
// Checks live DOM presence, not a dataset flag (mirrors attachResizeHandle
// above) — every <th> here has data-i18n, and data-i18n's own
// `el.textContent = ...` on language change wipes any appended child,
// including this trigger. A dataset flag would survive that wipe and then
// permanently skip re-adding it; re-attaching from a fresh
// dashboard:language-changed pass (see below) is what keeps it alive.
function attachColumnFilterTrigger(th, tableId) {
    if (th.dataset.col === 'actions') return; // nothing meaningful to filter by in this column
    if (th.querySelector('.data-table-col-filter-trigger')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-col-filter-trigger';
    btn.setAttribute('aria-label', t('main.filterColumn'));
    btn.setAttribute('data-help-key', 'filterColumn');
    btn.innerHTML = '<i class="bx bx-filter-alt" aria-hidden="true"></i>';
    btn.addEventListener('click', (event) => {
        event.stopPropagation();
        openColumnFilterMenu(th, tableId, th.dataset.col);
    });
    th.appendChild(btn);
}
document.addEventListener('dashboard:language-changed', () => {
    dataTableColumnState.forEach((state, tableId) => {
        Array.from(getHeaderRow(state.table)?.cells || []).forEach((th) => attachColumnFilterTrigger(th, tableId));
    });
});

// One-time-per-table setup. Gated behind a ResizeObserver (rather than
// running straight from initDashboard()) because a table can be inside a
// hidden modal at page-load time (e.g. the Anexos Changes history table) —
// measuring column widths while display:none would give 0 for everything.
// ResizeObserver fires its callback once immediately upon observe() even
// for already-visible elements, so this one code path correctly covers both
// "visible at load" and "hidden until opened" tables with no per-page
// special-casing.
function initDataTableColumns(wrapper, index) {
    const table = wrapper.querySelector('table.data-table');
    if (!table || table.dataset.colInit) return;
    const columnKeys = getDataTableColumnKeys(table);
    if (!columnKeys.length) return;
    table.dataset.colInit = '1';
    const tableId = getTableId(wrapper, index);
    const labels = {};
    const groupKeys = new Map();
    const groupTableKeys = new Map();
    Array.from(getHeaderRow(table).cells).forEach((th) => {
        labels[th.dataset.col] = th.textContent.trim();
        if (th.dataset.group) groupKeys.set(th.dataset.col, th.dataset.group);
        if (th.dataset.groupTable) groupTableKeys.set(th.dataset.col, th.dataset.groupTable);
    });
    // Up to 2 column-group bands (e.g. "Control Interno" and, on Base de
    // Datos Global, which pantalla a column came from) are purely cosmetic
    // <tr>s inserted above the real header — see getHeaderRow's own comment
    // for why this can't just be extra cells in the same row. Marking the
    // real header with this class here, before anything else reads it, is
    // what lets every other column-engine function keep calling
    // getHeaderRow(table) with zero awareness that band rows exist. Order
    // matters: table band (data-group-table) renders above classification
    // band (data-group) — insertBefore(..., headerRow) twice, table band
    // second, so it ends up first.
    // Also true for any table TABLE_GRANT_PATHS knows about, even one with
    // no classified column in its own static HTML yet -- a column with no
    // classification today can still be reclassified into one later from
    // Árbol de Permisos Maestro (see refreshTableClassifications below),
    // and the band row needs to already exist for that to have somewhere
    // to render into once it does.
    const wantsClassificationBand = groupKeys.size > 0 || wrapper.dataset.forceClassificationBand === '1' || !!TABLE_GRANT_PATHS[tableId];
    const wantsTableBand = groupTableKeys.size > 0;
    if (wantsClassificationBand || wantsTableBand) {
        const headerRow = getHeaderRow(table);
        headerRow.classList.add('data-table-header-row');
        if (wantsClassificationBand) {
            const band = document.createElement('tr');
            band.className = 'data-table-group-band data-table-group-band-classification';
            table.tHead.insertBefore(band, headerRow);
        }
        if (wantsTableBand) {
            const band = document.createElement('tr');
            band.className = 'data-table-group-band data-table-group-band-table';
            table.tHead.insertBefore(band, headerRow);
        }
    }
    const colgroup = buildOrGetColgroup(table);
    columnKeys.forEach((key) => {
        if (!colgroup.querySelector(`col[data-col="${key}"]`)) {
            const col = document.createElement('col');
            col.dataset.col = key;
            colgroup.appendChild(col);
        }
    });
    // Acomodo Guardado's own "default al abrir" only ever applies on a
    // genuinely first-ever visit (nothing in localStorage for this table on
    // this device yet) -- captured BEFORE loadDataTableConfig runs, since
    // that call itself is what would populate it going forward. See
    // maybeApplyDefaultSavedLayout below.
    const hadNoStoredLayout = localStorage.getItem(dataTableConfigStorageKey(tableId)) == null;
    const config = loadDataTableConfig(tableId, columnKeys);
    const naturalWidths = measureNaturalColumnWidths(table);
    columnKeys.forEach((key) => {
        if (config.widths[key] == null) config.widths[key] = naturalWidths[key] || DATA_TABLE_COL_MIN_WIDTH;
    });
    dataTableColumnState.set(tableId, {
        table, wrapper, colgroup, columnKeys, labels, config, groupKeys, groupTableKeys, naturalWidths,
        sortKey: null, sortDir: null, originalRowOrder: null,
        columnFilters: new Map(),
        columnRules: new Map(),
    });
    applyDataTableColumnLayout(tableId);
    // Una tabla cambia de ancho por más que la ventana (el menú lateral, la
    // escala de la interfaz, una barra de scroll, un panel que se abre): cada
    // vez que cambie, se vuelve a repartir el ancho de sus columnas.
    new ResizeObserver(() => {
        const current = dataTableColumnState.get(tableId);
        if (current && wrapper.clientWidth !== current.distributedFor) distributeDataTableColumnWidths(tableId);
    }).observe(wrapper);
    if (hadNoStoredLayout) maybeApplyDefaultSavedLayout(tableId);
    enableHeaderDragReorder(table, tableId);
    Array.from(getHeaderRow(table).cells).forEach((th) => {
        attachResizeHandle(th, tableId);
        attachSortHandler(th, tableId);
        attachColumnFilterTrigger(th, tableId);
    });
    observeTableBody(table, tableId);
    attachFieldLockGuard(wrapper, tableId);
    loadFieldFillRules(tableId);
    // Fire-and-forget -- this function is synchronous (called from a
    // ResizeObserver callback, see its own comment above) and the table
    // already rendered correctly with whatever classification/color its
    // static HTML carries; this only ever ADDS an Árbol de Permisos
    // Maestro reclassification/color on top, once the round trip resolves.
    refreshTableClassifications(tableId);
}

// Shared by both band rows (see renderColumnGroupBand below): collapses
// consecutive visible columns sharing the same group value into one <th
// colspan>, keyed by an arbitrary i18n-key map. A column dragged away from
// its group simply splits the band into two segments for that group instead
// of enforcing contiguity. emptyLabelKey (classification band only, on
// tables that opt in via data-force-classification-band) shows once, across
// the whole row, ONLY when every column in this row is still ungrouped —
// once even one column gets a real classification, that placeholder goes
// away and the real segments show instead.
//
// Segments also break at a pinned/unpinned boundary (never merging the two
// into one <th colspan>) -- a single cell can't be "half sticky", so a
// segment straddling both would have to pick one behavior and get the other
// wrong. A segment that's fully pinned then gets the exact same
// position:sticky/left/data-table-col-pinned(-edge) treatment applyPinStyle
// already gives the real header cells beneath it, or scrolling would slide
// the real (now fixed-in-place) column out from under its own color while
// some OTHER band segment drifts into that same screen position instead.
// applyOwnColor -- classification band only (never the table-of-origin
// band just above it, which has its own separate per-pantalla CSS colors
// keyed by labelKey, e.g. menu.opTransVolCombustible's fuel tint --
// columnGroupColor has no entry for those and would flatten them to the
// neutral "sin clasificar" gray). Live version of the exact same
// selectWrap.style.color/backgroundColor pill PermissionTree.js's own
// classification picker already paints with (color-mix at 16%, full color
// as the text) -- an admin's custom color now actually reaches the real
// table it was chosen for, not just the tree's own preview. Classifications
// never explicitly colored keep rendering exactly as before (columnGroupColor
// itself falls back to COLUMN_GROUP_META's own static swatch, or neutral).
function fillBandRow(bandRow, visualOrder, keyMap, emptyLabelKey, state, applyOwnColor) {
    bandRow.innerHTML = '';
    const pinnedSet = new Set(state?.visiblePinned || []);
    const lastPinnedKey = pinnedSet.size ? state.visiblePinned[state.visiblePinned.length - 1] : null;
    const segments = [];
    let i = 0;
    while (i < visualOrder.length) {
        const groupKey = keyMap.get(visualOrder[i]) || null;
        const pinned = pinnedSet.has(visualOrder[i]);
        let span = 1;
        while (
            i + span < visualOrder.length
            && (keyMap.get(visualOrder[i + span]) || null) === groupKey
            && pinnedSet.has(visualOrder[i + span]) === pinned
        ) span += 1;
        segments.push({ groupKey, span, pinned, startKey: visualOrder[i], endKey: visualOrder[i + span - 1] });
        i += span;
    }
    const allUngrouped = segments.every((s) => !s.groupKey);
    segments.forEach((s) => {
        const th = document.createElement('th');
        th.colSpan = s.span;
        if (s.groupKey) {
            th.textContent = resolveGroupLabel(s.groupKey);
            th.className = 'data-table-group-band-cell';
            th.dataset.groupKey = s.groupKey;
            // Only when an admin actually picked a color for THIS
            // classification (columnGroupColor's own fallback chain returns
            // 'var(--color-border)' for one that never got its own) -- every
            // classification otherwise keeps sharing the one static CSS
            // look .data-table-group-band-classification already gives
            // every band cell, same as before this existed.
            if (applyOwnColor) {
                const ownColor = columnGroupColor(s.groupKey);
                if (ownColor && ownColor !== 'var(--color-border)' && !ownColor.startsWith('var(')) {
                    th.style.backgroundColor = `color-mix(in srgb, ${ownColor} 16%, var(--color-surface))`;
                    th.style.color = ownColor;
                }
            }
        } else if (allUngrouped && emptyLabelKey) {
            th.textContent = t(emptyLabelKey);
            th.className = 'data-table-group-band-cell-empty';
        } else {
            th.className = 'data-table-group-band-cell-empty';
        }
        if (s.pinned) {
            th.classList.add('data-table-col-pinned');
            if (s.endKey === lastPinnedKey) th.classList.add('data-table-col-pinned-edge');
            th.style.left = `${state.pinnedLeft[s.startKey]}px`;
        }
        bandRow.appendChild(th);
    });
}

// Snapshot of a .data-table exactly as it currently looks on screen --
// visible columns in their current visual order, and only the rows that
// pass every active filter -- for anything that needs to act on "what the
// user is looking at right now" (e.g. exporting a report's results). Hidden
// columns are left out here (unlike renderColumnGroupBand's own internal
// use of visualOrder, which keeps them as invisible placeholders purely to
// keep the band row's cell count aligned with the real header).
function getVisibleTableSnapshot(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return { columns: [], rows: [] };
    const hiddenSet = new Set(state.config.hidden);
    const visualOrder = getVisualColumnOrder(state.config).filter((k) => !hiddenSet.has(k));
    const columns = visualOrder.map((key) => ({ key, label: state.labels[key] || key }));
    const rows = Array.from(state.table.tBodies[0]?.rows || [])
        .filter((tr) => !tr.querySelector('td.data-table-empty-cell'))
        .filter((tr) => !tr.hidden && !tr.classList.contains('data-table-row-col-filtered'))
        .map((tr) => visualOrder.map((key) => (tr.querySelector(`[data-col="${key}"]`)?.textContent || '').trim()));
    return { columns, rows };
}

// Rebuilds both cosmetic group-band rows (table-of-origin on top,
// classification below it) to match the CURRENT visual order/visibility —
// called once at init and again every time applyDataTableColumnLayout
// runs, so reordering, hiding, or pinning a grouped column keeps both bands
// accurate. Either row is a no-op (querySelector finds nothing) on tables
// that never asked for it, e.g. Registro Combustible has no table band.
function renderColumnGroupBand(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    // Hidden columns keep their <th> in the real header row (collapsed to 0
    // width via the shared colgroup's <col visibility:collapse>, not
    // removed from the DOM) -- the band row has to keep a matching segment
    // for each one too, or it ends up with fewer cells than there are
    // column slots and the browser assigns every cell after the gap to the
    // wrong column, visibly shifting the whole band out of alignment with
    // the real header underneath it. A hidden column's own segment just
    // renders at 0 width either way, so there's no need to special-case it.
    const visualOrder = getVisualColumnOrder(state.config);
    const tableBandRow = state.table.tHead.querySelector('tr.data-table-group-band-table');
    if (tableBandRow) fillBandRow(tableBandRow, visualOrder, state.groupTableKeys || new Map(), null, state, false);
    const classBandRow = state.table.tHead.querySelector('tr.data-table-group-band-classification');
    if (classBandRow) fillBandRow(classBandRow, visualOrder, state.groupKeys || new Map(), 'main.columnClassPending', state, true);
}

function wireModalDismiss(overlay, onClose) {
    overlay.addEventListener('click', (event) => { if (event.target === overlay) onClose(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !overlay.hidden) onClose(); });
}

// Acomodo Guardado rediseñado -- SOLO el modal detrás del icono de
// Acomodo Guardado (iconSavedLayout). El selector de pines y el selector
// de visibilidad (iconPin/iconVisibility, más abajo) siguen siendo sus
// propios modales de siempre, sin tocar. Este modal nuevo trae: pestañas
// por clasificación real, un control de 3 vías por columna (x/Normal/Fija,
// sobre los mismos state.config.hidden/pinned de siempre), vista previa en
// vivo con arrastre en el encabezado, y un candado de botones (Terminar
// Acomodo -> [Terminar Asignación] -> Guardar). Las funciones de guardar/
// aplicar/listar/borrar un acomodo guardado (más abajo, alrededor de
// "Acomodo Guardado") NO cambian -- solo se re-disparan desde este modal
// en vez de desde su propio modal viejo.
const COLUMN_ARRANGE_UNCLASSIFIED = '__sin_clasificar__';
let columnArrangeModal = null;
let columnArrangeState = null; // { tableId, draftConfig, decidedKeys: Set, activeTab, scope, terminarAcomodoDone, terminarAsignacionDone }

// Cascarón de fila compartido por la lista de columnas del modal de
// Acomodo Guardado -- nombre + punto de color de su clasificación real
// (mismos colores que COLUMN_GROUP_META/columnGroupColor ya le dan a la
// "Leyenda de columnas" y a la banda de la tabla real, nunca una paleta
// aparte). El llamador agrega su propio control (buildTriStateControl)
// después de construir la fila. Nombre distinto de buildColumnPickerRow
// (de abajo) a propósito -- esa es la de los selectores de pines/
// visibilidad de siempre, que NO cambiaron.
function buildArrangeRowShell(key, label, { dotColor = undefined, dotTitle = '' } = {}) {
    const row = document.createElement('div');
    row.className = 'admin-module-row data-table-arrange-row';
    row.dataset.col = key;
    const name = document.createElement('span');
    name.className = 'admin-module-name';
    name.style.flex = '1';
    if (dotColor !== undefined) {
        const dot = document.createElement('span');
        dot.className = 'data-table-col-dot';
        dot.style.backgroundColor = dotColor;
        if (dotTitle) dot.title = dotTitle;
        name.appendChild(dot);
    }
    name.appendChild(document.createTextNode(label));
    row.appendChild(name);
    return { row };
}

// Selector de pines y selector de visibilidad -- como estaban antes de
// Acomodo Guardado unificado, SIN cambios. Solo el icono de Acomodo
// Guardado abre el modal nuevo de abajo; estos dos siguen siendo los
// suyos propios, tal cual.
let pinPickerModal = null;
let pinPickerPinnedList = null;
let pinPickerOtherList = null;
let pinPickerLimitMsg = null;
let pinPickerState = null; // { tableId, pinnedOrder: [key,...] }

function buildColumnPickerRow(key, label, { pinned = null, dotColor = undefined, dotTitle = '' } = {}) {
    const row = document.createElement('div');
    row.className = 'admin-module-row';
    row.dataset.col = key;
    const name = document.createElement('span');
    name.className = 'admin-module-name';
    name.style.flex = '1';
    if (pinned !== null) {
        row.draggable = pinned;
        if (pinned) {
            const handle = document.createElement('i');
            handle.className = 'bx bx-menu data-table-col-picker-handle';
            handle.setAttribute('aria-hidden', 'true');
            row.appendChild(handle);
        }
    }
    // Visibility picker only (pinned picker never passes this) -- a small
    // color dot naming which classification this column belongs to, same
    // colors COLUMN_GROUP_META already gives the real "Leyenda de columnas"
    // modal, so this isn't a second, inconsistent palette.
    if (dotColor !== undefined) {
        const dot = document.createElement('span');
        dot.className = 'data-table-col-dot';
        dot.style.backgroundColor = dotColor;
        if (dotTitle) dot.title = dotTitle;
        name.appendChild(dot);
    }
    name.appendChild(document.createTextNode(label));
    row.appendChild(name);
    const toggle = document.createElement('label');
    toggle.className = 'admin-switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    const track = document.createElement('span');
    track.className = 'admin-switch-track';
    toggle.append(input, track);
    row.appendChild(toggle);
    return { row, input };
}

function ensurePinPickerModal() {
    if (pinPickerModal) return;
    pinPickerModal = document.createElement('div');
    pinPickerModal.className = 'modal-overlay';
    pinPickerModal.hidden = true;
    pinPickerModal.innerHTML = `
        <div class="modal-panel" style="max-width: 26rem;" role="dialog" aria-modal="true" aria-labelledby="data-table-pin-title">
            <h3 id="data-table-pin-title">${t('main.pinColumnsTitle')}</h3>
            <p class="admin-hint">${t('main.pinColumnsHint')}</p>
            <div class="admin-module-list" data-role="pinned-list"></div>
            <p class="admin-hint" style="margin-top:1rem;">${t('main.pinColumnsOther')}</p>
            <div class="admin-module-list" data-role="other-list"></div>
            <p class="admin-hint" data-role="limit-msg" hidden>${t('main.pinColumnsLimitReached')}</p>
            <div class="admin-form-actions" style="margin-top: 1.25rem;">
                <button type="button" class="btn" data-role="save">${t('admin.save')}</button>
                <button type="button" class="btn btn-secondary" data-role="cancel">${t('admin.cancel')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(pinPickerModal);
    pinPickerPinnedList = pinPickerModal.querySelector('[data-role="pinned-list"]');
    pinPickerOtherList = pinPickerModal.querySelector('[data-role="other-list"]');
    pinPickerLimitMsg = pinPickerModal.querySelector('[data-role="limit-msg"]');
    const close = () => { pinPickerModal.hidden = true; pinPickerState = null; };
    pinPickerModal.querySelector('[data-role="cancel"]').addEventListener('click', close);
    pinPickerModal.querySelector('[data-role="save"]').addEventListener('click', () => {
        if (!pinPickerState) return;
        const state = dataTableColumnState.get(pinPickerState.tableId);
        if (state) {
            state.config.pinned = [...pinPickerState.pinnedOrder];
            saveDataTableConfig(pinPickerState.tableId, state.config);
            applyDataTableColumnLayout(pinPickerState.tableId);
        }
        close();
    });
    wireModalDismiss(pinPickerModal, close);
}

function renderPinPickerLists() {
    const state = dataTableColumnState.get(pinPickerState.tableId);
    if (!state) return;
    pinPickerPinnedList.innerHTML = '';
    pinPickerState.pinnedOrder.forEach((key) => {
        const { row, input } = buildColumnPickerRow(key, state.labels[key] || key, { pinned: true });
        input.checked = true;
        input.addEventListener('change', () => {
            pinPickerState.pinnedOrder = pinPickerState.pinnedOrder.filter((k) => k !== key);
            renderPinPickerLists();
        });
        pinPickerPinnedList.appendChild(row);
    });
    pinPickerOtherList.innerHTML = '';
    state.columnKeys.filter((k) => !pinPickerState.pinnedOrder.includes(k)).forEach((key) => {
        const { row, input } = buildColumnPickerRow(key, state.labels[key] || key, { pinned: false });
        const atMax = pinPickerState.pinnedOrder.length >= DATA_TABLE_PIN_MAX;
        input.checked = false;
        input.disabled = atMax;
        input.addEventListener('change', () => {
            if (pinPickerState.pinnedOrder.length < DATA_TABLE_PIN_MAX) {
                pinPickerState.pinnedOrder = [...pinPickerState.pinnedOrder, key];
                renderPinPickerLists();
            }
        });
        pinPickerOtherList.appendChild(row);
    });
    pinPickerLimitMsg.hidden = pinPickerState.pinnedOrder.length < DATA_TABLE_PIN_MAX;
    enableListDragReorder(pinPickerPinnedList, (newOrder) => {
        pinPickerState.pinnedOrder = newOrder;
    });
}

function openPinPicker(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    ensurePinPickerModal();
    pinPickerState = { tableId, pinnedOrder: [...state.config.pinned] };
    renderPinPickerLists();
    pinPickerModal.hidden = false;
}

let visibilityPickerModal = null;
let visibilityPickerList = null;
let visibilityPickerChips = null;
let visibilityPickerSearch = null;
let visibilityPickerCount = null;
let visibilityPickerState = null; // { tableId, hiddenSet: Set<key>, query: string, activeGroupKey: string }

// Mostrar/ocultar columnas con el mismo aspecto que el panel de columnas de
// Acomodo Guardado: panel gris con buscador, pestañas por clasificación (cada
// una con su conteo) y la lista de dos columnas con botones de solo icono. Aquí
// cada columna solo tiene dos: oculta o visible.
function ensureVisibilityPickerModal() {
    if (visibilityPickerModal) return;
    visibilityPickerModal = document.createElement('div');
    visibilityPickerModal.className = 'modal-overlay';
    visibilityPickerModal.hidden = true;
    visibilityPickerModal.innerHTML = `
        <div class="modal-panel data-table-arrange-panel" role="dialog" aria-modal="true" aria-labelledby="data-table-vis-title">
            <h3 id="data-table-vis-title">${t('main.columnVisibilityTitle')}</h3>
            <p class="admin-hint">${t('main.columnVisibilityHint')}</p>
            <div class="data-table-arrange-colpanel">
                <div class="sector-icon-picker-search">
                    <i class="bx bx-search" aria-hidden="true"></i>
                    <input type="text" class="sector-icon-picker-search-input" data-role="search" placeholder="${t('main.columnSearchPlaceholder')}">
                </div>
                <p class="data-table-arrange-section-label">${t('main.arrangeClassHint')}</p>
                <div class="sector-icon-picker-chips data-table-arrange-tabs" data-role="chips"></div>
                <div class="data-table-arrange-legend">
                    <span><i class="bx bx-x" aria-hidden="true"></i> ${t('main.visibilityModeHidden')}</span>
                    <span><i class="bx bx-check" aria-hidden="true"></i> ${t('main.visibilityModeVisible')}</span>
                </div>
                <p class="sector-icon-picker-count" data-role="count"></p>
                <div class="admin-module-list data-table-arrange-list" data-role="list"></div>
            </div>
            <div class="data-table-search-footer data-table-vis-footer">
                <button type="button" class="btn" data-role="save">${t('admin.save')}</button>
                <button type="button" class="btn btn-secondary" data-role="cancel">${t('admin.cancel')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(visibilityPickerModal);
    visibilityPickerList = visibilityPickerModal.querySelector('[data-role="list"]');
    visibilityPickerChips = visibilityPickerModal.querySelector('[data-role="chips"]');
    visibilityPickerSearch = visibilityPickerModal.querySelector('[data-role="search"]');
    visibilityPickerCount = visibilityPickerModal.querySelector('[data-role="count"]');
    const close = () => { visibilityPickerModal.hidden = true; visibilityPickerState = null; };
    visibilityPickerModal.querySelector('[data-role="cancel"]').addEventListener('click', close);
    visibilityPickerModal.querySelector('[data-role="save"]').addEventListener('click', () => {
        if (!visibilityPickerState) return;
        const state = dataTableColumnState.get(visibilityPickerState.tableId);
        if (state) {
            state.config.hidden = state.columnKeys.filter((k) => visibilityPickerState.hiddenSet.has(k));
            saveDataTableConfig(visibilityPickerState.tableId, state.config);
            applyDataTableColumnLayout(visibilityPickerState.tableId);
        }
        close();
    });
    visibilityPickerSearch.addEventListener('input', () => {
        visibilityPickerState.query = visibilityPickerSearch.value;
        renderVisibilityPickerList();
    });
    wireModalDismiss(visibilityPickerModal, close);
}

// Las pestañas son las clasificaciones que de verdad hay en ESTA tabla (más
// "Por clasificar" si alguna columna no tiene); siempre hay una activa.
function visibilityPickerTabs(state) {
    const presentGroupKeys = [...new Set(state.columnKeys.map((k) => state.groupKeys.get(k)).filter(Boolean))];
    const hasUnclassified = state.columnKeys.some((k) => !state.groupKeys.get(k));
    return hasUnclassified ? [...presentGroupKeys, COLUMN_ARRANGE_UNCLASSIFIED] : presentGroupKeys;
}

// Escribir en el buscador siempre mira TODAS las columnas, sin importar la
// pestaña que esté activa (quien busca no debe ver una lista vacía solo porque
// quedó marcada una pestaña que no tiene nada que ver).
function visiblePickerColumns(state) {
    const q = visibilityPickerState.query.trim().toLowerCase();
    if (q) return state.columnKeys.filter((k) => (state.labels[k] || k).toLowerCase().includes(q));
    return state.columnKeys.filter((k) => (state.groupKeys.get(k) || COLUMN_ARRANGE_UNCLASSIFIED) === visibilityPickerState.activeGroupKey);
}

function renderVisibilityPickerChips() {
    const state = dataTableColumnState.get(visibilityPickerState.tableId);
    if (!state) return;
    visibilityPickerChips.innerHTML = '';
    visibilityPickerTabs(state).forEach((groupKey) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'sector-icon-picker-chip' + (visibilityPickerState.activeGroupKey === groupKey ? ' active' : '');
        if (groupKey !== COLUMN_ARRANGE_UNCLASSIFIED) {
            const dot = document.createElement('span');
            dot.className = 'data-table-col-dot data-table-col-dot-chip';
            dot.style.backgroundColor = columnGroupColor(groupKey);
            chip.appendChild(dot);
        }
        chip.appendChild(document.createTextNode(groupKey === COLUMN_ARRANGE_UNCLASSIFIED ? t('menu.classNone') : resolveGroupLabel(groupKey)));
        const count = document.createElement('span');
        count.className = 'data-table-arrange-tab-count';
        count.textContent = String(state.columnKeys.filter((k) => (state.groupKeys.get(k) || COLUMN_ARRANGE_UNCLASSIFIED) === groupKey).length);
        chip.appendChild(count);
        chip.addEventListener('click', () => {
            visibilityPickerState.activeGroupKey = groupKey;
            visibilityPickerState.query = '';
            visibilityPickerSearch.value = '';
            renderVisibilityPickerChips();
            renderVisibilityPickerList();
        });
        visibilityPickerChips.appendChild(chip);
    });
}

// Oculta/visible de una columna: dos botones de icono, el activo con el tinte
// de la clasificación de esa columna (igual que Normal/Fija en Acomodo).
function buildVisibilityToggle(groupKey, hidden, onSet) {
    const wrap = document.createElement('div');
    wrap.className = 'data-table-tri-control';
    const activeColor = columnGroupColor(groupKey);
    const hasOwnColor = activeColor && activeColor !== 'var(--color-border)' && !activeColor.startsWith('var(');
    [
        { hide: true, icon: 'bx-x', title: t('main.visibilityModeHidden') },
        { hide: false, icon: 'bx-check', title: t('main.visibilityModeVisible') },
    ].forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const icon = document.createElement('i');
        icon.className = `bx ${opt.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        btn.appendChild(icon);
        btn.title = opt.title;
        btn.setAttribute('aria-label', opt.title);
        const isActive = hidden === opt.hide;
        btn.classList.toggle('active', isActive);
        if (isActive && groupKey) btn.dataset.groupKey = groupKey;
        if (isActive && hasOwnColor) {
            btn.style.backgroundColor = `color-mix(in srgb, ${activeColor} 16%, var(--color-surface))`;
            btn.style.color = activeColor;
        }
        btn.addEventListener('click', () => onSet(opt.hide));
        wrap.appendChild(btn);
    });
    return wrap;
}

async function setVisibilityPickerHidden(key, hide) {
    const state = dataTableColumnState.get(visibilityPickerState.tableId);
    if (!state) return;
    const isHidden = visibilityPickerState.hiddenSet.has(key);
    if (hide === isHidden) return;
    if (hide) {
        // Never allow hiding the last remaining visible column.
        const visibleCount = state.columnKeys.length - visibilityPickerState.hiddenSet.size;
        if (visibleCount <= 1) return;
        // Hiding a PINNED column is easy to do by accident (it's still sitting
        // right there, sticky-left) and leaves it fixed-but-invisible until
        // someone remembers to check the pin picker too -- confirm first.
        if (state.config.pinned.includes(key) && !(await confirmDialog(t('main.columnHidePinnedConfirm')))) return;
        visibilityPickerState.hiddenSet.add(key);
    } else {
        visibilityPickerState.hiddenSet.delete(key);
    }
    renderVisibilityPickerList();
}

function renderVisibilityPickerList() {
    const state = dataTableColumnState.get(visibilityPickerState.tableId);
    if (!state) return;
    visibilityPickerList.innerHTML = '';
    const keys = visiblePickerColumns(state);
    const activeKey = visibilityPickerState.activeGroupKey;
    visibilityPickerCount.textContent = t('main.columnFilterCount', {
        count: String(keys.length), total: String(state.columnKeys.length),
        scope: visibilityPickerState.query.trim()
            ? `"${visibilityPickerState.query.trim()}"`
            : (activeKey === COLUMN_ARRANGE_UNCLASSIFIED ? t('menu.classNone') : (activeKey ? resolveGroupLabel(activeKey) : t('main.columnFilterAll'))),
    });
    if (!keys.length) {
        const empty = document.createElement('p');
        empty.className = 'sector-icon-picker-empty';
        empty.textContent = t('main.columnFilterNoResults', { query: visibilityPickerState.query.trim() });
        visibilityPickerList.appendChild(empty);
        return;
    }
    keys.forEach((key) => {
        const groupKey = state.groupKeys.get(key);
        const { row } = buildArrangeRowShell(key, state.labels[key] || key, {
            dotColor: columnGroupColor(groupKey), dotTitle: groupKey ? resolveGroupLabel(groupKey) : t('menu.classNone'),
        });
        row.appendChild(buildVisibilityToggle(groupKey, visibilityPickerState.hiddenSet.has(key), (hide) => setVisibilityPickerHidden(key, hide)));
        visibilityPickerList.appendChild(row);
    });
}

function openVisibilityPicker(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    ensureVisibilityPickerModal();
    visibilityPickerState = { tableId, hiddenSet: new Set(state.config.hidden), query: '', activeGroupKey: visibilityPickerTabs(state)[0] };
    visibilityPickerSearch.value = '';
    renderVisibilityPickerChips();
    renderVisibilityPickerList();
    visibilityPickerModal.querySelector('.modal-panel').scrollTop = 0;
    visibilityPickerModal.hidden = false;
}

function closeColumnArrangeModal() {
    if (!columnArrangeModal) return;
    columnArrangeModal.hidden = true;
    columnArrangeState = null;
}

function ensureColumnArrangeModal() {
    if (columnArrangeModal) return;
    columnArrangeModal = document.createElement('div');
    columnArrangeModal.className = 'modal-overlay';
    columnArrangeModal.hidden = true;
    columnArrangeModal.innerHTML = `
        <div class="modal-panel data-table-arrange-panel" role="dialog" aria-modal="true" aria-labelledby="data-table-arrange-title">
            <h3 id="data-table-arrange-title">
                <button type="button" class="data-table-arrange-back" data-role="back" aria-label="${t('main.arrangeBack')}"><i class="bx bx-arrow-back" aria-hidden="true"></i></button>
                <span data-role="title">${t('main.arrangeNewTitle')}</span>
            </h3>

            <div>
                <label class="data-table-arrange-label" for="data-table-arrange-name" data-role="name-label">${t('main.arrangeNameLabel')}</label>
                <input type="text" id="data-table-arrange-name" data-role="name" class="saved-view-name-input data-table-arrange-name" placeholder="${t('main.savedLayoutNamePlaceholder')}">

                <div class="data-table-arrange-colpanel">
                    <span class="data-table-arrange-live" data-role="live-chip" hidden><i class="bx bx-revision" aria-hidden="true"></i> <span data-role="live-text">${t('main.arrangeStartsFromSaved')}</span></span>
                    <div class="sector-icon-picker-search">
                        <i class="bx bx-search" aria-hidden="true"></i>
                        <input type="text" class="sector-icon-picker-search-input" data-role="search" placeholder="${t('main.columnSearchPlaceholder')}">
                    </div>
                    <p class="data-table-arrange-section-label">${t('main.arrangeClassHint')}</p>
                    <div class="sector-icon-picker-chips data-table-arrange-tabs" data-role="tabs"></div>
                    <div class="data-table-arrange-legend">
                        <span><i class="bx bx-x" aria-hidden="true"></i> ${t('main.arrangeModeX')}</span>
                        <span><i class="bx bx-check" aria-hidden="true"></i> ${t('main.arrangeModeNormal')}</span>
                        <span><i class="bx bx-pin" aria-hidden="true"></i> ${t('main.arrangeModeFija')}</span>
                    </div>
                    <div class="admin-module-list data-table-arrange-list" data-role="rows"></div>
                </div>

                <p class="data-table-arrange-section-label">${t('main.arrangePreviewLabel')}</p>
                <div class="data-table-arrange-preview" data-role="preview-wrap"><table data-role="preview-table"></table><p class="data-table-arrange-preview-empty" data-role="preview-empty" hidden>${t('main.arrangePreviewEmpty')}</p></div>
                <p class="data-table-arrange-caption"><i class="bx bx-info-circle" aria-hidden="true"></i> ${t('main.arrangePreviewCaption')}</p>

                <button type="button" class="btn data-table-arrange-block-btn" data-role="terminar-acomodo">${t('main.arrangeTerminar')}</button>

                <div data-role="save-block-2">
                    <div data-role="scope-block">
                        <div data-role="admin-section" class="data-table-arrange-segmented" hidden>
                            <label><input type="radio" name="saved-layout-audience" value="self" checked> <span>${t('main.savedSearchAudienceSelf')}</span></label>
                            <label><input type="radio" name="saved-layout-audience" value="assign"> <span>${t('main.savedSearchAudienceAssign')}</span></label>
                        </div>
                        <div data-role="audience-panel" class="saved-view-audience-panel" hidden></div>
                        <button type="button" class="btn data-table-arrange-block-btn data-table-arrange-assign-btn" data-role="terminar-asignacion" hidden>${t('main.arrangeTerminarAsignacion')}</button>
                        <label class="saved-view-default-row"><input type="checkbox" data-role="default"> ${t('main.savedLayoutSetDefault')}</label>
                    </div>
                    <p data-role="error" class="admin-error" role="alert" hidden></p>
                    <button type="button" class="btn data-table-arrange-block-btn data-table-arrange-save-btn" data-role="save" disabled>${t('admin.save')}</button>
                    <p data-role="lock-note" class="data-table-arrange-lock-note"></p>
                </div>

                <div class="admin-form-actions">
                    <button type="button" class="btn btn-secondary" data-role="close">${t('admin.cancel')}</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(columnArrangeModal);
    // Re-use the exact same module-level refs/functions Acomodo Guardado's
    // save flow already had (saveSavedLayout, collectCurrentLayoutSnapshot,
    // further below) -- they only ever touch these variables +
    // dataTableColumnState, so pointing them at this modal's DOM instead of
    // their old standalone one preserves their behavior exactly.
    savedLayoutModal = columnArrangeModal;
    savedLayoutErrorEl = columnArrangeModal.querySelector('[data-role="error"]');
    savedLayoutNameInput = columnArrangeModal.querySelector('[data-role="name"]');
    savedLayoutAdminSection = columnArrangeModal.querySelector('[data-role="admin-section"]');
    savedLayoutAudiencePanel = columnArrangeModal.querySelector('[data-role="audience-panel"]');
    savedLayoutDefaultCheckbox = columnArrangeModal.querySelector('[data-role="default"]');
    savedLayoutSaveBtn = columnArrangeModal.querySelector('[data-role="save"]');

    const refs = {
        titleEl: columnArrangeModal.querySelector('[data-role="title"]'),
        nameLabel: columnArrangeModal.querySelector('[data-role="name-label"]'),
        liveChip: columnArrangeModal.querySelector('[data-role="live-chip"]'),
        previewWrap: columnArrangeModal.querySelector('[data-role="preview-wrap"]'),
        previewEmpty: columnArrangeModal.querySelector('[data-role="preview-empty"]'),
        scopeBlock: columnArrangeModal.querySelector('[data-role="scope-block"]'),
        searchInput: columnArrangeModal.querySelector('[data-role="search"]'),
        tabsEl: columnArrangeModal.querySelector('[data-role="tabs"]'),
        rowsEl: columnArrangeModal.querySelector('[data-role="rows"]'),
        previewTable: columnArrangeModal.querySelector('[data-role="preview-table"]'),
        terminarAcomodoBtn: columnArrangeModal.querySelector('[data-role="terminar-acomodo"]'),
        terminarAsignacionBtn: columnArrangeModal.querySelector('[data-role="terminar-asignacion"]'),
        lockNote: columnArrangeModal.querySelector('[data-role="lock-note"]'),
    };
    columnArrangeModal._refs = refs;

    columnArrangeModal.querySelector('[data-role="close"]').addEventListener('click', closeColumnArrangeModal);
    columnArrangeModal.querySelector('[data-role="back"]').addEventListener('click', closeColumnArrangeModal);
    wireModalDismiss(columnArrangeModal, closeColumnArrangeModal);

    refs.searchInput.addEventListener('input', () => {
        columnArrangeState.query = refs.searchInput.value;
        renderColumnArrangeRows();
    });

    columnArrangeModal.querySelectorAll('input[name="saved-layout-audience"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            columnArrangeState.scope = radio.value === 'assign' ? 'global' : 'personal';
            if (radio.value === 'assign') {
                savedLayoutAudiencePanel.hidden = false;
                if (isSaasTableKey(columnArrangeState.tableId)) buildSaasLayoutAudiencePanel(savedLayoutAudiencePanel);
                else buildSavedViewAudiencePanel(savedLayoutAudiencePanel);
                refs.terminarAsignacionBtn.hidden = false;
            } else {
                savedLayoutAudiencePanel.hidden = true;
                refs.terminarAsignacionBtn.hidden = true;
            }
            updateColumnArrangeGating();
        });
    });

    refs.terminarAcomodoBtn.addEventListener('click', () => {
        applyColumnLayoutConfig(columnArrangeState.tableId, buildColumnArrangeFinalConfig());
        columnArrangeState.terminarAcomodoDone = true;
        updateColumnArrangeGating();
    });

    refs.terminarAsignacionBtn.addEventListener('click', () => {
        if (!hasAnyAudienceTarget()) {
            savedLayoutErrorEl.textContent = t('main.savedSearchAudienceSummaryEmpty');
            savedLayoutErrorEl.hidden = false;
            return;
        }
        savedLayoutErrorEl.hidden = true;
        columnArrangeState.terminarAsignacionDone = true;
        updateColumnArrangeGating();
    });

    savedLayoutSaveBtn.addEventListener('click', saveSavedLayout);
}

// Candado de botones: "Terminar Acomodo" siempre disponible; "Terminar
// Asignación" solo aplica (y solo se exige) cuando el alcance es "Asignar
// a..." -- con "Solo yo" Guardar se habilita justo después de Terminar
// Acomodo. Nunca pinta nada de esto sobre la tabla real.
function updateColumnArrangeGating() {
    const state = columnArrangeState;
    const refs = columnArrangeModal._refs;
    if (!state) return;
    const needsAssignment = state.scope === 'global';
    const hasChosen = columnArrangeChosenKeys().length > 0;
    const ready = state.terminarAcomodoDone && (!needsAssignment || state.terminarAsignacionDone);
    refs.terminarAcomodoBtn.disabled = !hasChosen;
    savedLayoutSaveBtn.disabled = !ready;
    refs.lockNote.hidden = ready;
    if (!hasChosen) refs.lockNote.textContent = t('main.arrangePickOne');
    else if (!state.terminarAcomodoDone) refs.lockNote.textContent = t('main.arrangeGuardarLockedHint');
    else refs.lockNote.textContent = t('main.arrangeGuardarLockedHintAssign');
    // Not pre-disabled off savedViewAudienceSelection -- buildSavedViewAudiencePanel
    // (shared with Búsqueda Guardada) owns its own checkboxes and doesn't expose
    // a "selection changed" hook to react to live, so this validates on click
    // instead, same pattern saveSavedLayout's own audience check already uses.
}

// Pestañas de clasificación real (reemplaza los chips "solo filtran" del
// selector de visibilidad viejo: aquí siempre hay EXACTAMENTE una pestaña
// activa, nunca una vista "Todas"). Una columna sin clasificación cae en
// la pestaña sentinela COLUMN_ARRANGE_UNCLASSIFIED, con la misma etiqueta
// real "Por clasificar" (menu.classNone) que ya usan los árboles de
// permisos -- aquí es la primera vez que se conecta a una tabla viva.
function renderColumnArrangeTabs() {
    const state = dataTableColumnState.get(columnArrangeState.tableId);
    if (!state) return;
    const refs = columnArrangeModal._refs;
    refs.tabsEl.innerHTML = '';
    const presentGroupKeys = [...new Set(state.columnKeys.map((k) => state.groupKeys.get(k)).filter(Boolean))];
    const hasUnclassified = state.columnKeys.some((k) => !state.groupKeys.get(k));
    const tabs = hasUnclassified ? [...presentGroupKeys, COLUMN_ARRANGE_UNCLASSIFIED] : presentGroupKeys;
    tabs.forEach((groupKey) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'sector-icon-picker-chip' + (columnArrangeState.activeTab === groupKey ? ' active' : '');
        if (groupKey !== COLUMN_ARRANGE_UNCLASSIFIED) {
            const dot = document.createElement('span');
            dot.className = 'data-table-col-dot data-table-col-dot-chip';
            dot.style.backgroundColor = columnGroupColor(groupKey);
            tab.appendChild(dot);
        }
        tab.appendChild(document.createTextNode(groupKey === COLUMN_ARRANGE_UNCLASSIFIED ? t('menu.classNone') : resolveGroupLabel(groupKey)));
        const count = document.createElement('span');
        count.className = 'data-table-arrange-tab-count';
        count.textContent = String(state.columnKeys.filter((k) => (state.groupKeys.get(k) || COLUMN_ARRANGE_UNCLASSIFIED) === groupKey).length);
        tab.appendChild(count);
        tab.addEventListener('click', () => {
            columnArrangeState.activeTab = groupKey;
            columnArrangeState.query = '';
            columnArrangeModal._refs.searchInput.value = '';
            renderColumnArrangeTabs();
            renderColumnArrangeRows();
        });
        refs.tabsEl.appendChild(tab);
    });
}

function columnArrangeVisibleKeys(state) {
    const q = columnArrangeState.query.trim().toLowerCase();
    if (q) return state.columnKeys.filter((k) => (state.labels[k] || k).toLowerCase().includes(q));
    return state.columnKeys.filter((k) => (state.groupKeys.get(k) || COLUMN_ARRANGE_UNCLASSIFIED) === columnArrangeState.activeTab);
}

// Las filas SIEMPRE se listan en el orden natural de state.columnKeys,
// filtradas por pestaña/búsqueda -- nunca se reordenan por tocar x/Normal/
// Fija, solo cambia su control y su opacidad "pendiente vs ya decidido"
// (decidedKeys, de solo esta sesión, nunca se guarda ni se pinta en la
// tabla real).
function renderColumnArrangeRows() {
    const state = dataTableColumnState.get(columnArrangeState.tableId);
    if (!state) return;
    const rowsEl = columnArrangeModal._refs.rowsEl;
    rowsEl.innerHTML = '';
    columnArrangeVisibleKeys(state).forEach((key) => {
        const groupKey = state.groupKeys.get(key);
        const { row } = buildArrangeRowShell(key, state.labels[key] || key, {
            dotColor: columnGroupColor(groupKey), dotTitle: groupKey ? resolveGroupLabel(groupKey) : t('menu.classNone'),
        });
        row.classList.toggle('data-table-row-pending', !columnArrangeState.decidedKeys.has(key));
        row.appendChild(buildTriStateControl(key, groupKey));
        rowsEl.appendChild(row);
    });
}

// null = todavía sin marcar: ningún botón activo y la columna no entra a
// la vista previa ni al acomodo.
function columnArrangeMode(key) {
    const { draftConfig, decidedKeys } = columnArrangeState;
    if (!decidedKeys.has(key)) return null;
    if (draftConfig.hidden.includes(key)) return 'none';
    if (draftConfig.pinned.includes(key)) return 'fija';
    return 'normal';
}

// Las columnas que el acomodo en construcción realmente incluye: solo las
// que ya marcaste Normal o Fija.
function columnArrangeChosenKeys() {
    const { draftConfig, decidedKeys, tableId } = columnArrangeState;
    const state = dataTableColumnState.get(tableId);
    return state.columnKeys.filter((k) => decidedKeys.has(k) && !draftConfig.hidden.includes(k));
}

// Lo que "Terminar Acomodo" aplica y guarda: solo lo marcado Normal/Fija; el
// resto (x o sin marcar) queda oculto.
function buildColumnArrangeFinalConfig() {
    const { draftConfig, tableId } = columnArrangeState;
    const state = dataTableColumnState.get(tableId);
    const chosen = new Set(columnArrangeChosenKeys());
    return {
        order: [...draftConfig.order],
        hidden: state.columnKeys.filter((k) => !chosen.has(k)),
        pinned: draftConfig.pinned.filter((k) => chosen.has(k)),
        widths: { ...draftConfig.widths },
    };
}

// Control de 3 vías por columna -- x (no incluida) / Normal (incluida) /
// Fija (incluida + fijada), sobre los mismos draftConfig.hidden/pinned de
// siempre. El color de la opción activa es SIEMPRE el real de la
// clasificación de esa columna (mismo color-mix que fillBandRow ya usa
// para la banda) -- nunca un morado fijo para "Fija".
function buildTriStateControl(key, groupKey) {
    const wrap = document.createElement('div');
    wrap.className = 'data-table-tri-control';
    const mode = columnArrangeMode(key);
    const activeColor = columnGroupColor(groupKey);
    const hasOwnColor = activeColor && activeColor !== 'var(--color-border)' && !activeColor.startsWith('var(');
    // Solo íconos (la leyenda de arriba de la lista dice cuál es cuál): así
    // caben dos columnas por renglón y se ven muchas a la vez.
    const options = [
        { mode: 'none', icon: 'bx-x', title: t('main.arrangeModeX') },
        { mode: 'normal', icon: 'bx-check', title: t('main.arrangeModeNormal') },
        { mode: 'fija', icon: 'bx-pin', title: t('main.arrangeModeFija') },
    ];
    options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.mode = opt.mode;
        const icon = document.createElement('i');
        icon.className = `bx ${opt.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        btn.appendChild(icon);
        btn.title = opt.title;
        btn.setAttribute('aria-label', opt.title);
        const isActive = mode === opt.mode;
        btn.classList.toggle('active', isActive);
        if (isActive && groupKey) btn.dataset.groupKey = groupKey;
        if (isActive && hasOwnColor) {
            btn.style.backgroundColor = `color-mix(in srgb, ${activeColor} 16%, var(--color-surface))`;
            btn.style.color = activeColor;
        }
        if (opt.mode === 'fija') {
            btn.disabled = columnArrangeState.draftConfig.pinned.length >= DATA_TABLE_PIN_MAX && !columnArrangeState.draftConfig.pinned.includes(key);
        }
        btn.addEventListener('click', () => setColumnTriState(key, opt.mode));
        wrap.appendChild(btn);
    });
    return wrap;
}

async function setColumnTriState(key, mode) {
    const state = dataTableColumnState.get(columnArrangeState.tableId);
    if (!state) return;
    const { draftConfig } = columnArrangeState;
    if (mode === 'none') {
        if (draftConfig.pinned.includes(key) && !(await confirmDialog(t('main.columnHidePinnedConfirm')))) return;
        if (!draftConfig.hidden.includes(key)) draftConfig.hidden = [...draftConfig.hidden, key];
        draftConfig.pinned = draftConfig.pinned.filter((k) => k !== key);
    } else if (mode === 'normal') {
        draftConfig.hidden = draftConfig.hidden.filter((k) => k !== key);
        draftConfig.pinned = draftConfig.pinned.filter((k) => k !== key);
    } else if (mode === 'fija') {
        if (draftConfig.pinned.length >= DATA_TABLE_PIN_MAX && !draftConfig.pinned.includes(key)) return;
        draftConfig.hidden = draftConfig.hidden.filter((k) => k !== key);
        if (!draftConfig.pinned.includes(key)) draftConfig.pinned = [...draftConfig.pinned, key];
    }
    columnArrangeState.decidedKeys.add(key);
    // Lo que "Terminar Acomodo" ya aplicó dejó de ser lo que se ve aquí:
    // hay que volver a terminarlo antes de poder guardar.
    columnArrangeState.terminarAcomodoDone = false;
    renderColumnArrangeRows();
    renderColumnArrangePreview();
    updateColumnArrangeGating();
}

// Vista previa en vivo -- NO un motor de tabla paralelo: clona 1-2 filas
// REALES de la tabla real (state.table), reordenadas/filtradas según el
// borrador, con encabezado + banda de clasificación real (fillBandRow tal
// cual) y un grip de arrastre por encabezado no-fijo.
function renderColumnArrangePreview() {
    const state = dataTableColumnState.get(columnArrangeState.tableId);
    if (!state) return;
    const { draftConfig } = columnArrangeState;
    // Solo las columnas ya marcadas Normal/Fija: un acomodo nuevo empieza
    // con la vista previa vacía y se va llenando.
    const chosen = new Set(columnArrangeChosenKeys());
    const visualOrder = getVisualColumnOrder(draftConfig).filter((k) => chosen.has(k));
    const visiblePinned = draftConfig.pinned.filter((k) => chosen.has(k));
    const previewState = { visiblePinned, pinnedLeft: {} };
    let cumulative = 0;
    visiblePinned.forEach((key) => {
        previewState.pinnedLeft[key] = cumulative;
        cumulative += draftConfig.widths[key] || DATA_TABLE_COL_MIN_WIDTH;
    });

    const { previewTable: table, previewWrap, previewEmpty } = columnArrangeModal._refs;
    const hasColumns = visualOrder.length > 0;
    previewEmpty.hidden = hasColumns;
    table.hidden = !hasColumns;
    previewWrap.classList.toggle('empty', !hasColumns);
    table.innerHTML = '';
    if (!hasColumns) return;
    const thead = table.createTHead();
    const bandRow = thead.insertRow();
    // Misma clase que la banda de la tabla real (renderColumnGroupBand) --
    // sin ella, fillBandRow sigue llenando las celdas pero el CSS que les
    // da su color (.data-table-group-band-classification th.data-table-
    // group-band-cell, en Inicio-en.css) nunca llega a aplicarse.
    bandRow.className = 'data-table-group-band-classification';
    fillBandRow(bandRow, visualOrder, state.groupKeys || new Map(), 'main.columnClassPending', previewState, true);
    const headRow = thead.insertRow();
    visualOrder.forEach((key) => {
        const th = document.createElement('th');
        if (!visiblePinned.includes(key)) {
            const grip = document.createElement('i');
            grip.className = 'bx bx-menu data-table-preview-grip';
            grip.setAttribute('aria-hidden', 'true');
            th.appendChild(grip);
            th.draggable = true;
        }
        th.appendChild(document.createTextNode(state.labels[key] || key));
        th.dataset.col = key;
        applyPinStyle(th, key, previewState);
        headRow.appendChild(th);
    });
    const tbody = table.createTBody();
    Array.from(state.table.tBodies[0]?.rows || [])
        .filter((tr) => !tr.querySelector('td.data-table-empty-cell'))
        .slice(0, 2)
        .forEach((sourceTr) => {
            const tr = tbody.insertRow();
            visualOrder.forEach((key) => {
                const sourceTd = sourceTr.querySelector(`[data-col="${CSS.escape(key)}"]`);
                const td = document.createElement('td');
                td.innerHTML = sourceTd ? sourceTd.innerHTML : '';
                td.dataset.col = key;
                applyPinStyle(td, key, previewState);
                tr.appendChild(td);
            });
        });
    enablePreviewHeaderDragReorder(headRow);
}

// Mismo algoritmo que enableHeaderDragReorder, pero mutando
// columnArrangeState.draftConfig.order (nunca el state.config de la tabla
// real) y volviendo a pintar solo la vista previa -- la tabla real recién
// cambia al tocar "Terminar Acomodo".
function enablePreviewHeaderDragReorder(headRow) {
    let draggedKey = null;
    headRow.addEventListener('dragstart', (event) => {
        const th = event.target.closest('th');
        if (!th || th.draggable !== true) return;
        draggedKey = th.dataset.col;
        th.classList.add('data-table-col-dragging');
        event.dataTransfer.effectAllowed = 'move';
    });
    headRow.addEventListener('dragover', (event) => {
        if (!draggedKey) return;
        const th = event.target.closest('th');
        if (!th || th.dataset.col === draggedKey || columnArrangeState.draftConfig.pinned.includes(th.dataset.col)) return;
        event.preventDefault();
    });
    headRow.addEventListener('drop', (event) => {
        if (!draggedKey) return;
        event.preventDefault();
        const th = event.target.closest('th');
        const key = draggedKey;
        draggedKey = null;
        if (!th || th.dataset.col === key) return;
        const { draftConfig } = columnArrangeState;
        if (draftConfig.pinned.includes(th.dataset.col)) return;
        const order = draftConfig.order.filter((k) => k !== key);
        let idx = order.indexOf(th.dataset.col);
        if (idx === -1) idx = order.length;
        const rect = th.getBoundingClientRect();
        order.splice((event.clientX - rect.left) < rect.width / 2 ? idx : idx + 1, 0, key);
        draftConfig.order = order;
        columnArrangeState.terminarAcomodoDone = false;
        renderColumnArrangePreview();
        updateColumnArrangeGating();
    });
    headRow.addEventListener('dragend', () => {
        headRow.querySelectorAll('.data-table-col-dragging').forEach((el) => el.classList.remove('data-table-col-dragging'));
        draggedKey = null;
    });
}

// Solo el icono de Acomodo Guardado (iconSavedLayout) llega aquí, desde el
// menú que cuelga del icono (toggleSavedLayoutMenu, más abajo): "Agregar"
// abre este editor vacío y el lápiz de un acomodo lo abre con ese acomodo
// ya cargado. iconPin/iconVisibility siguen abriendo sus propios modales
// de siempre (openPinPicker/openVisibilityPicker, arriba), sin cambios.
function openColumnArrangeEditor(tableId, layout = null) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    ensureColumnArrangeModal();
    savedLayoutTableId = tableId;
    const refs = columnArrangeModal._refs;
    const editing = !!layout;
    const base = editing ? reconcileDataTableConfig(layout.layout, state.columnKeys) : state.config;
    columnArrangeState = {
        tableId,
        editingId: editing ? layout.id : null,
        // Un acomodo nuevo empieza en blanco: ni ocultas ni fijas, y ninguna
        // columna marcada (atenuadas, fuera de la vista previa) hasta que se
        // marque Normal o Fija; solo el orden y los anchos parten de la
        // tabla actual. Uno ya guardado trae todas sus columnas decididas.
        draftConfig: {
            order: [...base.order], hidden: editing ? [...base.hidden] : [],
            pinned: editing ? [...base.pinned] : [], widths: { ...base.widths },
        },
        decidedKeys: new Set(editing ? state.columnKeys : []),
        activeTab: null,
        query: '',
        scope: 'personal',
        terminarAcomodoDone: false,
        terminarAsignacionDone: false,
    };
    const presentGroupKeys = [...new Set(state.columnKeys.map((k) => state.groupKeys.get(k)).filter(Boolean))];
    columnArrangeState.activeTab = presentGroupKeys[0] || COLUMN_ARRANGE_UNCLASSIFIED;

    refs.titleEl.textContent = t(editing ? 'main.arrangeEditTitle' : 'main.arrangeNewTitle');
    refs.nameLabel.textContent = t(editing ? 'main.arrangeNameLabelEdit' : 'main.arrangeNameLabel');
    refs.liveChip.hidden = !editing;
    savedLayoutSaveBtn.textContent = t(editing ? 'main.arrangeSaveChanges' : 'admin.save');
    // Editar solo cambia nombre y columnas: alcance, audiencia y "default al
    // abrir" se quedan como se guardaron.
    refs.scopeBlock.hidden = editing;
    savedLayoutNameInput.value = editing ? layout.name : '';
    savedLayoutDefaultCheckbox.checked = false;
    savedLayoutErrorEl.hidden = true;
    savedViewAudienceSelection = new Map(SAVED_VIEW_AUDIENCE_GROUPS.map((g) => [g.key, new Map()]));
    savedLayoutAdminSection.hidden = isSaasTableKey(tableId) ? !currentUser?.isSaasSuperAdmin : !currentUser?.isClientAdmin;
    savedLayoutAudiencePanel.hidden = true;
    columnArrangeModal.querySelectorAll('input[name="saved-layout-audience"]').forEach((r) => { r.checked = r.value === 'self'; });
    refs.terminarAsignacionBtn.hidden = true;
    refs.searchInput.value = '';

    renderColumnArrangeTabs();
    renderColumnArrangeRows();
    renderColumnArrangePreview();
    updateColumnArrangeGating();
    columnArrangeModal.querySelector('.modal-panel').scrollTop = 0;
    columnArrangeModal.hidden = false;
}

// --- Menú de Acomodo Guardado ------------------------------------------
// El icono de la barra se abre como una píldora con un buscador a su
// derecha, y de ahí cuelga la lista de acomodos guardados (position:fixed
// en <body>, para que el overflow de la tabla no lo recorte). Clic en un
// nombre lo aplica; "Agregar" y el lápiz abren el editor de arriba; el bote
// borra.
let layoutMenuEl = null;
let layoutMenuState = null; // { tableId, pill, input, layouts, loaded, query }

// El acomodo guardado que la tabla tiene aplicado se recuerda por tabla en
// localStorage junto con una "firma" de su orden/ocultas/fijas: si después
// la tabla se cambia a mano (pines, visibilidad, arrastre...) la firma ya no
// coincide y el nombre deja de mostrarse -- nunca presume un acomodo que la
// tabla ya no tiene.
function activeLayoutStorageKey(tableId) {
    return `sgn_active_layout::${tableId}`;
}

function layoutConfigSignature(config) {
    return JSON.stringify([config.order, config.hidden, config.pinned]);
}

function getActiveSavedLayout(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return null;
    try {
        const record = JSON.parse(localStorage.getItem(activeLayoutStorageKey(tableId)) || 'null');
        if (record && record.sig === layoutConfigSignature(state.config)) return record;
    } catch {
        // Unreadable record -- same as having none.
    }
    return null;
}

function setActiveSavedLayout(tableId, layout) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    try {
        localStorage.setItem(activeLayoutStorageKey(tableId), JSON.stringify({
            id: layout.id, name: layout.name, sig: layoutConfigSignature(state.config),
        }));
    } catch {
        // No storage -- the name just isn't remembered.
    }
}

function clearActiveSavedLayout(tableId) {
    try { localStorage.removeItem(activeLayoutStorageKey(tableId)); } catch { /* ignore */ }
}

// Dibuja el estado del icono: sin acomodo aplicado es el icono de siempre;
// con uno, queda como píldora con su nombre escrito y la ✕ para limpiarlo.
// Abierto el menú, el nombre le cede su lugar al buscador.
function refreshSavedLayoutPill(pill) {
    const active = getActiveSavedLayout(pill.dataset.pillTableId);
    const nameEl = pill.querySelector('.data-table-layout-pill-name');
    nameEl.textContent = active ? active.name : '';
    nameEl.hidden = !active || pill.classList.contains('open');
    pill.querySelector('.data-table-layout-pill-clear').hidden = !active;
    pill.classList.toggle('named', !!active);
}

function refreshSavedLayoutPillForTable(tableId) {
    const pill = document.querySelector(`.data-table-layout-pill[data-pill-table-id="${CSS.escape(tableId)}"]`);
    if (pill) refreshSavedLayoutPill(pill);
}

// ✕ en la píldora: quita el acomodo y regresa al default que le toca a esta
// cuenta -- su acomodo por default asignado si lo hay (el personal gana al
// global, igual que en la primera visita), y si no, el original de la tabla.
async function clearSavedLayoutForTable(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    closeSavedLayoutMenu();
    clearActiveSavedLayout(tableId);
    try { localStorage.removeItem(dataTableConfigStorageKey(tableId)); } catch { /* ignore */ }
    state.config = reconcileDataTableConfig(null, state.columnKeys);
    state.columnKeys.forEach((key) => {
        if (state.config.widths[key] == null) state.config.widths[key] = state.naturalWidths[key] || DATA_TABLE_COL_MIN_WIDTH;
    });
    applyDataTableColumnLayout(tableId);
    await maybeApplyDefaultSavedLayout(tableId);
}

function closeSavedLayoutMenu() {
    if (!layoutMenuState) return;
    const { pill, input } = layoutMenuState;
    pill.classList.remove('open');
    input.hidden = true;
    input.value = '';
    layoutMenuEl.hidden = true;
    layoutMenuState = null;
    refreshSavedLayoutPill(pill);
}

function positionSavedLayoutMenu() {
    if (!layoutMenuState) return;
    const pillRect = layoutMenuState.pill.getBoundingClientRect();
    const iconRect = layoutMenuState.pill.querySelector('button').getBoundingClientRect();
    const margin = 8;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const width = Math.min(21 * rem, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(pillRect.left, window.innerWidth - width - margin));
    layoutMenuEl.style.width = `${width}px`;
    layoutMenuEl.style.left = `${left}px`;
    layoutMenuEl.style.top = `${pillRect.bottom + margin}px`;
    layoutMenuEl.style.setProperty('--caret-left', `${iconRect.left + iconRect.width / 2 - left - 6}px`);
}

function ensureSavedLayoutMenu() {
    if (layoutMenuEl) return;
    layoutMenuEl = document.createElement('div');
    layoutMenuEl.className = 'data-table-layout-menu';
    layoutMenuEl.setAttribute('role', 'menu');
    layoutMenuEl.setAttribute('aria-label', t('main.savedLayoutTitle'));
    layoutMenuEl.hidden = true;
    document.body.appendChild(layoutMenuEl);
    document.addEventListener('mousedown', (event) => {
        if (!layoutMenuState) return;
        if (layoutMenuEl.contains(event.target) || layoutMenuState.pill.contains(event.target)) return;
        closeSavedLayoutMenu();
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSavedLayoutMenu(); });
    window.addEventListener('resize', positionSavedLayoutMenu);
    window.addEventListener('scroll', positionSavedLayoutMenu, true);
}

function appendHighlightedText(el, text, lowerQuery) {
    const at = lowerQuery ? text.toLowerCase().indexOf(lowerQuery) : -1;
    if (at < 0) { el.textContent = text; return; }
    const mark = document.createElement('mark');
    mark.textContent = text.slice(at, at + lowerQuery.length);
    el.append(text.slice(0, at), mark, text.slice(at + lowerQuery.length));
}

function renderSavedLayoutMenu() {
    const state = layoutMenuState;
    if (!state) return;
    layoutMenuEl.innerHTML = '';

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'data-table-layout-item data-table-layout-add';
    add.setAttribute('role', 'menuitem');
    add.innerHTML = '<span class="data-table-layout-plus"><i class="bx bx-plus" aria-hidden="true"></i></span>';
    const addLabel = document.createElement('span');
    addLabel.textContent = t('main.arrangeAddNew');
    add.appendChild(addLabel);
    add.addEventListener('click', () => {
        closeSavedLayoutMenu();
        openColumnArrangeEditor(state.tableId);
    });
    layoutMenuEl.appendChild(add);
    if (!state.loaded) return;

    const sep = document.createElement('div');
    sep.className = 'data-table-layout-sep';
    layoutMenuEl.appendChild(sep);

    const query = state.query.trim();
    const lowerQuery = query.toLowerCase();
    const shown = lowerQuery ? state.layouts.filter((l) => l.name.toLowerCase().includes(lowerQuery)) : state.layouts;
    if (!shown.length) {
        const empty = document.createElement('p');
        empty.className = 'data-table-layout-empty';
        empty.textContent = state.layouts.length ? t('main.savedLayoutNoResults', { query }) : t('main.savedLayoutEmpty');
        layoutMenuEl.appendChild(empty);
        return;
    }

    const isAdminForThisTable = isSaasTableKey(state.tableId) ? !!currentUser?.isSaasSuperAdmin : !!currentUser?.isClientAdmin;
    const activeId = getActiveSavedLayout(state.tableId)?.id;
    const list = document.createElement('div');
    list.className = 'data-table-layout-list';
    shown.forEach((layout) => {
        const row = document.createElement('div');
        row.className = 'data-table-layout-item' + (layout.id === activeId ? ' on' : '');

        const check = document.createElement('span');
        check.className = 'data-table-layout-check';
        if (layout.id === activeId) check.innerHTML = '<i class="bx bx-check" aria-hidden="true"></i>';
        row.appendChild(check);

        const nameBtn = document.createElement('button');
        nameBtn.type = 'button';
        nameBtn.className = 'data-table-layout-name';
        nameBtn.setAttribute('role', 'menuitem');
        appendHighlightedText(nameBtn, layout.name, lowerQuery);
        nameBtn.addEventListener('click', () => {
            applyColumnLayoutConfig(state.tableId, layout.layout);
            setActiveSavedLayout(state.tableId, layout);
            closeSavedLayoutMenu();
        });
        row.appendChild(nameBtn);

        if (layout.isDefault) {
            const tag = document.createElement('span');
            tag.className = 'saved-view-default-tag';
            tag.textContent = '★';
            tag.title = t('main.savedLayoutDefaultTag');
            row.appendChild(tag);
        }
        const badge = document.createElement('span');
        badge.className = `saved-view-scope-badge saved-view-scope-${layout.scope}`;
        badge.textContent = t(layout.scope === 'global' ? 'main.savedSearchScopeGlobal' : 'main.savedSearchScopePersonal');
        row.appendChild(badge);

        // A 'personal' row only ever appears in the viewer's OWN list (the
        // server already scopes it to its owner), so editing/deleting is
        // allowed for those plus every row for an admin -- the server
        // enforces the same rule again on PUT/DELETE.
        if (isAdminForThisTable || layout.scope === 'personal') {
            const acts = document.createElement('span');
            acts.className = 'data-table-layout-acts';
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'data-table-layout-act data-table-layout-act-edit';
            editBtn.setAttribute('aria-label', t('main.savedLayoutEditBtn'));
            editBtn.title = t('main.savedLayoutEditBtn');
            editBtn.innerHTML = '<i class="bx bx-pencil" aria-hidden="true"></i>';
            editBtn.addEventListener('click', () => {
                closeSavedLayoutMenu();
                openColumnArrangeEditor(state.tableId, layout);
            });
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'data-table-layout-act data-table-layout-act-del';
            delBtn.setAttribute('aria-label', t('admin.delete'));
            delBtn.title = t('admin.delete');
            delBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
            delBtn.addEventListener('click', () => deleteSavedLayoutFromMenu(state, layout.id));
            acts.append(editBtn, delBtn);
            row.appendChild(acts);
        }
        list.appendChild(row);
    });
    layoutMenuEl.appendChild(list);
}

async function refreshSavedLayoutMenu(state) {
    try {
        const res = await fetch(`${savedLayoutApiBase(state.tableId)}/${encodeURIComponent(state.tableId)}`, { credentials: 'include' });
        if (res.ok) state.layouts = (await res.json()).layouts || [];
    } catch {
        // Leave the list as it was -- the next open retries the fetch anyway.
    }
    state.loaded = true;
    if (layoutMenuState === state) renderSavedLayoutMenu();
}

async function deleteSavedLayoutFromMenu(state, id) {
    try {
        const res = await fetch(`${savedLayoutApiBase(state.tableId)}/${id}`, { method: 'DELETE', credentials: 'include' });
        if (res.ok) {
            if (getActiveSavedLayout(state.tableId)?.id === id) clearActiveSavedLayout(state.tableId);
            refreshSavedLayoutPill(state.pill);
            await refreshSavedLayoutMenu(state);
        }
    } catch {
        // Leave the list as-is -- next open retries the fetch anyway.
    }
}

async function toggleSavedLayoutMenu(tableId, pill) {
    if (layoutMenuState?.pill === pill) {
        closeSavedLayoutMenu();
        return;
    }
    closeSavedLayoutMenu();
    closeSavedSearchMenu();
    ensureSavedLayoutMenu();
    const input = pill.querySelector('input');
    const state = { tableId, pill, input, layouts: [], loaded: false, query: '' };
    layoutMenuState = state;
    pill.classList.add('open');
    refreshSavedLayoutPill(pill);
    input.hidden = false;
    input.value = '';
    layoutMenuEl.hidden = false;
    renderSavedLayoutMenu();
    positionSavedLayoutMenu();
    input.focus({ preventScroll: true });
    await refreshSavedLayoutMenu(state);
}

// --- Reglas de Orden de Llenado modal ---------------------------------
let fieldRulesModal = null;
let fieldRulesList = null;
let fieldRulesGateSelect = null;
let fieldRulesDependentSelect = null;
let fieldRulesAddBtn = null;
let fieldRulesError = null;
let fieldRulesState = null; // { tableId }

// Control Interno columns and the trailing actions column are never
// user-fillable fields, so they never make sense as a gate or a dependent.
function fieldRulesEligibleColumns(state) {
    return state.columnKeys.filter((key) => !key.startsWith('colSys') && key !== 'actions');
}

function ensureFieldRulesModal() {
    if (fieldRulesModal) return;
    fieldRulesModal = document.createElement('div');
    fieldRulesModal.className = 'modal-overlay';
    fieldRulesModal.hidden = true;
    fieldRulesModal.innerHTML = `
        <div class="modal-panel field-rules-panel" role="dialog" aria-modal="true" aria-labelledby="field-rules-title">
            <h3 id="field-rules-title">${t('main.fieldRulesTitle')}</h3>
            <p class="admin-hint">${t('main.fieldRulesHint')}</p>
            <div data-role="list"></div>
            <div class="field-rules-add-row">
                <select data-role="gate"></select>
                <span class="field-rules-arrow">→</span>
                <select data-role="dependent"></select>
                <button type="button" class="btn" data-role="add">${t('main.fieldRulesAdd')}</button>
            </div>
            <div class="admin-error" data-role="error" role="alert" hidden></div>
            <div class="admin-form-actions" style="margin-top: 1.25rem;">
                <button type="button" class="btn btn-secondary" data-role="close">${t('admin.cancel')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(fieldRulesModal);
    fieldRulesList = fieldRulesModal.querySelector('[data-role="list"]');
    fieldRulesGateSelect = fieldRulesModal.querySelector('[data-role="gate"]');
    fieldRulesDependentSelect = fieldRulesModal.querySelector('[data-role="dependent"]');
    fieldRulesAddBtn = fieldRulesModal.querySelector('[data-role="add"]');
    fieldRulesError = fieldRulesModal.querySelector('[data-role="error"]');
    const close = () => { fieldRulesModal.hidden = true; fieldRulesState = null; };
    fieldRulesModal.querySelector('[data-role="close"]').addEventListener('click', close);
    fieldRulesAddBtn.addEventListener('click', addFieldRule);
    wireModalDismiss(fieldRulesModal, close);
}

function renderFieldRulesModal() {
    const state = dataTableColumnState.get(fieldRulesState.tableId);
    if (!state) return;
    const eligible = fieldRulesEligibleColumns(state);
    const rules = fieldFillRulesCache.get(fieldRulesState.tableId) || [];

    const populate = (select) => {
        select.innerHTML = '';
        eligible.forEach((key) => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = state.labels[key] || key;
            select.appendChild(opt);
        });
    };
    populate(fieldRulesGateSelect);
    populate(fieldRulesDependentSelect);
    // Default the two selects to different columns so "+ Agregar" doesn't
    // immediately fail with "must be different columns" on first open.
    if (eligible.length > 1) fieldRulesDependentSelect.selectedIndex = 1;

    fieldRulesList.innerHTML = '';
    if (!rules.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-hint';
        empty.textContent = t('main.fieldRulesNoneYet');
        fieldRulesList.appendChild(empty);
        return;
    }
    // One card per gate column, listing every dependent it unlocks -- same
    // shape as the approved mockup, so an admin can see at a glance which
    // fields share a gate without hunting through a flat list.
    const byGate = new Map();
    rules.forEach((rule) => {
        if (!byGate.has(rule.gateCol)) byGate.set(rule.gateCol, []);
        byGate.get(rule.gateCol).push(rule);
    });
    byGate.forEach((groupRules, gateCol) => {
        const card = document.createElement('div');
        card.className = 'field-rules-group';
        const gateLine = document.createElement('div');
        gateLine.className = 'field-rules-gate';
        gateLine.innerHTML = `<span class="field-rules-dot"></span> ${state.labels[gateCol] || gateCol}`;
        card.appendChild(gateLine);
        const depsRow = document.createElement('div');
        depsRow.className = 'field-rules-dependents';
        groupRules.forEach((rule) => {
            const chip = document.createElement('span');
            chip.className = 'field-rules-chip';
            chip.append(document.createTextNode(state.labels[rule.dependentCol] || rule.dependentCol));
            if (!rule.authorized) {
                const pending = document.createElement('span');
                pending.className = 'field-rules-chip-pending';
                pending.textContent = t('main.fieldRulesPendingBadge');
                pending.title = t('main.fieldRulesPendingHint');
                chip.appendChild(pending);
            }
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'field-rules-chip-remove';
            removeBtn.setAttribute('aria-label', t('admin.delete'));
            removeBtn.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
            removeBtn.addEventListener('click', () => removeFieldRule(rule.id));
            chip.appendChild(removeBtn);
            depsRow.appendChild(chip);
        });
        card.appendChild(depsRow);
        fieldRulesList.appendChild(card);
    });
}

async function openFieldRulesModal(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    ensureFieldRulesModal();
    fieldRulesState = { tableId };
    fieldRulesError.hidden = true;
    if (!fieldFillRulesCache.has(tableId)) await loadFieldFillRules(tableId);
    renderFieldRulesModal();
    fieldRulesModal.hidden = false;
}

async function addFieldRule() {
    if (!fieldRulesState) return;
    const state = dataTableColumnState.get(fieldRulesState.tableId);
    const gateCol = fieldRulesGateSelect.value;
    const dependentCol = fieldRulesDependentSelect.value;
    fieldRulesError.hidden = true;
    if (!gateCol || !dependentCol || gateCol === dependentCol) {
        fieldRulesError.textContent = t('main.fieldRulesSameColumnError');
        fieldRulesError.hidden = false;
        return;
    }
    fieldRulesAddBtn.disabled = true;
    try {
        const res = await fetch(`${API_BASE}/business/field-fill-rules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                tableKey: fieldRulesState.tableId, gateCol, dependentCol,
                gateLabel: state?.labels[gateCol] || gateCol, dependentLabel: state?.labels[dependentCol] || dependentCol,
            }),
        });
        if (!res.ok) throw new Error('save failed');
        await loadFieldFillRules(fieldRulesState.tableId);
        renderFieldRulesModal();
        // Not yet authorized -- see Reglas de Orden de Llenado (Gestión) --
        // so this toast deliberately doesn't say "changeSaved"/"recordSaved",
        // which would wrongly imply the field is already locking anything.
        showToast(t('main.fieldRuleCreatedPending'), 'success');
    } catch {
        fieldRulesError.textContent = t('admin.saveError');
        fieldRulesError.hidden = false;
    } finally {
        fieldRulesAddBtn.disabled = false;
    }
}

async function removeFieldRule(id) {
    if (!fieldRulesState) return;
    try {
        const res = await fetch(`${API_BASE}/business/field-fill-rules/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        await loadFieldFillRules(fieldRulesState.tableId);
        renderFieldRulesModal();
        showToast(t('main.changeSaved'), 'success');
    } catch {
        showToast(t('admin.saveError'), 'error');
    }
}

// classificationId -> {label, color}, populated by refreshTableClassifications
// below from GET /api/business/table-classifications -- global (not
// per-table) since a classification's own label/color is the same
// everywhere it's used, exactly like Árbol de Permisos Maestro's own
// classificationColors. A groupKey not in here yet (static, never
// reclassified/colored, or the fetch hasn't resolved yet) falls back to
// treating it as a labelKey (resolveGroupLabel) or COLUMN_GROUP_META
// (columnGroupColor) -- both preserve today's exact behavior when there is
// no Árbol de Permisos Maestro override to apply.
const classificationMetaById = new Map();
const tableClassificationsCache = new Map();
function fetchTableClassifications(tableKey) {
    if (tableClassificationsCache.has(tableKey)) return tableClassificationsCache.get(tableKey);
    const promise = fetch(`/api/business/table-classifications?tableKey=${encodeURIComponent(tableKey)}`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { columns: {} }))
        .catch(() => ({ columns: {} }));
    tableClassificationsCache.set(tableKey, promise);
    return promise;
}
// A column's group identity (state.groupKeys' own values) starts out as
// whatever labelKey its static data-group attribute carries; once this
// resolves, every column this table actually has server-side
// classification info for switches to its real classificationId instead
// (structural or Árbol de Permisos Maestro-reclassified, the server
// already resolved which) -- keeps every OTHER function here (fillBandRow,
// columnGroupColor, the visibility picker) unaware of which "namespace" a
// groupKey happens to be in, since resolveGroupLabel/columnGroupColor
// check classificationMetaById first either way.
async function refreshTableClassifications(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state || !TABLE_GRANT_PATHS[tableId]) return;
    const data = await fetchTableClassifications(tableId);
    const cols = data.columns || {};
    let changed = false;
    state.columnKeys.forEach((key) => {
        const info = cols[key];
        if (!info || !info.classificationId) return;
        const label = info.label || t(info.labelKey, info.labelParams || {});
        classificationMetaById.set(info.classificationId, { label, color: info.color || null });
        if (state.groupKeys.get(key) !== info.classificationId) changed = true;
        state.groupKeys.set(key, info.classificationId);
    });
    if (changed) renderColumnGroupBand(tableId);
}
function resolveGroupLabel(groupKey) {
    if (!groupKey) return '';
    const meta = classificationMetaById.get(groupKey);
    return meta ? meta.label : t(groupKey);
}
// A column's own dot color -- an Árbol de Permisos Maestro admin-chosen
// color first, COLUMN_GROUP_META's static swatch when it carries a
// classification never explicitly colored (state.groupKeys), var(--color-
// border) (neutral, "sin clasificar") otherwise. Defined once, shared by
// the chip row and every column row so the two always agree on which
// color means what.
function columnGroupColor(groupKey) {
    const meta = groupKey && classificationMetaById.get(groupKey);
    if (meta && meta.color) return meta.color;
    return groupKey && COLUMN_GROUP_META[groupKey] ? COLUMN_GROUP_META[groupKey].swatch : 'var(--color-border)';
}

// Historial de cambios ("control de cambios") — read-only modal listing
// every create/update/delete logged server-side for a given table (see
// GET /api/business/table-changes/:tableKey). Same singleton-modal pattern
// as the pin/visibility pickers, but built with .admin-table-wrap/.admin-table
// (NOT .data-table-wrapper) so it never picks up its own history button.
let changeHistoryModal = null;
let changeHistoryList = null;

// Column keys, in the same order renderChangeHistoryRow's cells array is
// always built — shared by ensureChangeHistoryModal (headers),
// renderChangeHistoryRow (cells) and the column-filter functions below
// (which column of a <tr> to read). 'date' is the only one treated as a
// date range; every other column gets the text mode+search filter — same
// per-column filter already built for Admin-EquipoSaaS.js's own Historial
// de cambios modal (openSaasChangesFilterMenu there), mirrored here so
// EVERY screen's generic history dialog gets it too. Confirmed live,
// 2026-09-28: "quiero el filtro también en el historial genérico" / "igual
// debe aplicar a todos los historial de cambios". Reuses the exact same
// .saas-changes-th/.saas-changes-table-wrap CSS (sticky header, spacing,
// bounded scroll) instead of new classes — the rules aren't SaaS-specific,
// just happened to be added there first.
const CHANGE_HISTORY_COLUMNS = ['date', 'user', 'record', 'change', 'requestedBy', 'authorizedBy'];

function ensureChangeHistoryModal() {
    if (changeHistoryModal) return;
    changeHistoryModal = document.createElement('div');
    changeHistoryModal.className = 'modal-overlay';
    changeHistoryModal.hidden = true;
    const headerCells = [
        ['date', 'main.changeHistoryDate'], ['user', 'main.changeHistoryUser'], ['record', 'main.changeHistoryRecord'],
        ['change', 'main.changeHistoryChange'], ['requestedBy', 'main.changeHistoryRequestedBy'], ['authorizedBy', 'main.changeHistoryAuthorizedBy'],
    ].map(([col, key]) => `<th data-col="${col}" class="saas-changes-th">${t(key)}</th>`).join('');
    changeHistoryModal.innerHTML = `
        <div class="modal-panel" style="max-width: 40rem;" role="dialog" aria-modal="true" aria-labelledby="data-table-history-title">
            <h3 id="data-table-history-title">${t('main.changeHistoryTitle')}</h3>
            <div class="admin-table-wrap saas-changes-table-wrap">
                <table class="admin-table">
                    <thead>
                        <tr>${headerCells}</tr>
                    </thead>
                    <tbody data-role="list"></tbody>
                </table>
            </div>
            <div class="admin-form-actions" style="margin-top: 1.25rem;">
                <button type="button" class="btn btn-secondary" data-role="close">${t('admin.cancel')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(changeHistoryModal);
    changeHistoryList = changeHistoryModal.querySelector('[data-role="list"]');
    changeHistoryModal.querySelectorAll('th[data-col]').forEach((th) => attachChangeHistoryFilterTrigger(th, th.dataset.col));
    const close = () => { changeHistoryModal.hidden = true; closeChangeHistoryFilterMenu(); };
    changeHistoryModal.querySelector('[data-role="close"]').addEventListener('click', close);
    wireModalDismiss(changeHistoryModal, close);
}

// stripeColor: hex string (a real classification color), '' (no
// classification resolved -- e.g. create/delete, or a field with no
// classification yet) for the neutral fallback, or undefined to skip the
// stripe entirely (the empty-state placeholder row).
function renderChangeHistoryRow(cells, stripeColor) {
    const tr = document.createElement('tr');
    if (stripeColor !== undefined) {
        tr.classList.add('change-history-row');
        tr.style.setProperty('--change-history-stripe-color', stripeColor || 'var(--color-border)');
    }
    cells.forEach((text, i) => {
        const td = document.createElement('td');
        td.dataset.col = CHANGE_HISTORY_COLUMNS[i];
        td.textContent = text;
        tr.appendChild(td);
    });
    return tr;
}

// --- Per-column filter (Fecha = rango; el resto = modo + buscador + lista
// de valores) -- same visual mechanism/CSS classes as any real .data-table
// column (see openColumnFilterMenu below), reimplemented small here because
// this modal isn't a registered .data-table in dataTableColumnState (no
// pin/reorder/width — only filtering makes sense in a fixed 6-column
// history dialog). Mirrors Admin-EquipoSaaS.js's own saasChanges* version
// exactly, just under this modal's own state so the two never collide.
let changeHistoryColumnFilters = new Map(); // colKey -> Set of selected values (ausente = todos seleccionados)
let changeHistoryFilterMenuEl = null;
let changeHistoryFilterMenuCol = null;
const CHANGE_HISTORY_DATE_COLUMNS = new Set(['date']);

function getChangeHistoryDistinctValues(colKey) {
    const values = new Set();
    changeHistoryList.querySelectorAll(`td[data-col="${colKey}"]`).forEach((td) => values.add(td.textContent.trim()));
    return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function applyChangeHistoryColumnFilters() {
    const rows = Array.from(changeHistoryList.rows);
    if (!changeHistoryColumnFilters.size) {
        rows.forEach((tr) => { tr.hidden = false; });
        return;
    }
    rows.forEach((tr) => {
        let visible = true;
        changeHistoryColumnFilters.forEach((selectedSet, key) => {
            const td = tr.querySelector(`[data-col="${key}"]`);
            if (!selectedSet.has(td ? td.textContent.trim() : '')) visible = false;
        });
        tr.hidden = !visible;
    });
}

function closeChangeHistoryFilterMenu() {
    changeHistoryFilterMenuEl?.remove();
    changeHistoryFilterMenuEl = null;
    changeHistoryFilterMenuCol = null;
    document.removeEventListener('click', handleChangeHistoryFilterOutsideClick, true);
}
function handleChangeHistoryFilterOutsideClick(event) {
    if (changeHistoryFilterMenuEl && !changeHistoryFilterMenuEl.contains(event.target) && !event.target.closest('.data-table-col-filter-trigger')) {
        closeChangeHistoryFilterMenu();
    }
}
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && changeHistoryFilterMenuEl) closeChangeHistoryFilterMenu();
});

// Adapted from Admin-EquipoSaaS.js's own openSaasChangesFilterMenu (itself
// adapted from openColumnFilterMenu below) -- same structure/CSS classes,
// trimmed to just this modal's own state.
function openChangeHistoryFilterMenu(th, colKey) {
    const reopening = changeHistoryFilterMenuCol === colKey;
    closeChangeHistoryFilterMenu();
    if (reopening) return;

    const distinctValues = getChangeHistoryDistinctValues(colKey);
    const selected = changeHistoryColumnFilters.get(colKey) || new Set(distinctValues);

    const menu = document.createElement('div');
    menu.className = 'data-table-col-filter-menu';

    const searchRow = document.createElement('div');
    searchRow.className = 'data-table-col-filter-search-row';
    let applyRowSearch = () => true;

    if (CHANGE_HISTORY_DATE_COLUMNS.has(colKey)) {
        const fromField = document.createElement('input');
        fromField.type = 'date';
        fromField.className = 'data-table-col-filter-date';
        fromField.setAttribute('aria-label', t('main.filterDateFrom'));
        fromField.addEventListener('click', (event) => event.stopPropagation());
        const toField = document.createElement('input');
        toField.type = 'date';
        toField.className = 'data-table-col-filter-date';
        toField.setAttribute('aria-label', t('main.filterDateTo'));
        toField.addEventListener('click', (event) => event.stopPropagation());

        const fromLabel = document.createElement('span');
        fromLabel.className = 'data-table-col-filter-date-label';
        fromLabel.textContent = t('main.filterDateFrom');
        const toLabel = document.createElement('span');
        toLabel.className = 'data-table-col-filter-date-label';
        toLabel.textContent = t('main.filterDateTo');
        searchRow.append(fromLabel, fromField, toLabel, toField);

        applyRowSearch = (row) => {
            const value = row.dataset.searchValue;
            if (fromField.value && value < fromField.value) return false;
            if (toField.value && value > toField.value) return false;
            return true;
        };
        fromField.addEventListener('input', () => searchInputChanged());
        toField.addEventListener('input', () => searchInputChanged());
    } else {
        const FILTER_MODES = [
            { id: 'startsWith', labelKey: 'main.filterModeStartsWith' },
            { id: 'contains', labelKey: 'main.filterModeContains' },
            { id: 'equals', labelKey: 'main.filterModeEquals' },
        ];
        let searchMode = 'contains';

        const modeCurrentLabel = document.createElement('div');
        modeCurrentLabel.className = 'data-table-col-filter-mode-current';
        modeCurrentLabel.textContent = t('main.filterModeContains');
        menu.appendChild(modeCurrentLabel);

        const modeBtn = document.createElement('button');
        modeBtn.type = 'button';
        modeBtn.className = 'data-table-col-filter-mode-btn';
        modeBtn.setAttribute('aria-label', t('main.filterModeLabel'));
        modeBtn.title = t('main.filterModeLabel');
        modeBtn.innerHTML = '<i class="bx bx-slider-alt" aria-hidden="true"></i>';
        searchRow.appendChild(modeBtn);

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'data-table-col-filter-search';
        searchInput.placeholder = t('main.filterSearchPlaceholder');
        searchInput.addEventListener('click', (event) => event.stopPropagation());
        searchRow.appendChild(searchInput);

        const modeMenu = document.createElement('div');
        modeMenu.className = 'data-table-col-filter-mode-menu';
        modeMenu.hidden = true;
        const modeButtons = FILTER_MODES.map((mode) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'data-table-col-filter-mode-option';
            btn.textContent = t(mode.labelKey);
            btn.classList.toggle('data-table-col-filter-mode-option-active', mode.id === searchMode);
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                searchMode = mode.id;
                modeButtons.forEach((b) => b.classList.remove('data-table-col-filter-mode-option-active'));
                btn.classList.add('data-table-col-filter-mode-option-active');
                modeCurrentLabel.textContent = t(mode.labelKey);
                modeMenu.hidden = true;
                searchInputChanged();
            });
            modeMenu.appendChild(btn);
            return btn;
        });
        searchRow.appendChild(modeMenu);

        modeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            modeMenu.hidden = !modeMenu.hidden;
        });
        menu.addEventListener('click', (event) => {
            if (!modeMenu.hidden && event.target !== modeBtn && !modeMenu.contains(event.target)) modeMenu.hidden = true;
        });

        applyRowSearch = (row) => {
            const query = searchInput.value.trim().toLowerCase();
            if (query === '') return true;
            const value = row.dataset.searchValue;
            if (searchMode === 'equals') return value === query;
            return searchMode === 'startsWith' ? value.startsWith(query) : value.includes(query);
        };
        searchInput.addEventListener('input', () => searchInputChanged());
    }
    menu.appendChild(searchRow);

    const allRow = document.createElement('label');
    allRow.className = 'data-table-col-filter-option data-table-col-filter-all';
    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.checked = selected.size === distinctValues.length;
    allCheckbox.indeterminate = selected.size > 0 && selected.size < distinctValues.length;
    const allLabel = document.createElement('span');
    allLabel.textContent = t('main.filterAll');
    allRow.append(allCheckbox, allLabel);
    menu.appendChild(allRow);

    const list = document.createElement('div');
    list.className = 'data-table-col-filter-list';
    const checkboxes = [];

    function syncAllCheckbox() {
        const current = changeHistoryColumnFilters.get(colKey) || new Set(distinctValues);
        allCheckbox.checked = current.size === distinctValues.length;
        allCheckbox.indeterminate = current.size > 0 && current.size < distinctValues.length;
    }

    distinctValues.forEach((value) => {
        const row = document.createElement('label');
        row.className = 'data-table-col-filter-option';
        row.dataset.searchValue = (value || '').toLowerCase();
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selected.has(value);
        cb.addEventListener('change', () => {
            const current = new Set(changeHistoryColumnFilters.get(colKey) || new Set(distinctValues));
            if (cb.checked) current.add(value); else current.delete(value);
            if (current.size === distinctValues.length) changeHistoryColumnFilters.delete(colKey);
            else changeHistoryColumnFilters.set(colKey, current);
            applyChangeHistoryColumnFilters();
            th.classList.toggle('data-table-col-filter-active', changeHistoryColumnFilters.has(colKey));
            syncAllCheckbox();
        });
        const span = document.createElement('span');
        span.textContent = value || '—';
        row.append(cb, span);
        list.appendChild(row);
        checkboxes.push(cb);
    });
    menu.appendChild(list);

    function searchInputChanged() {
        list.querySelectorAll('.data-table-col-filter-option').forEach((row) => {
            row.hidden = !applyRowSearch(row);
        });
    }

    allCheckbox.addEventListener('change', () => {
        checkboxes.forEach((cb) => { cb.checked = allCheckbox.checked; });
        if (allCheckbox.checked) changeHistoryColumnFilters.delete(colKey);
        else changeHistoryColumnFilters.set(colKey, new Set());
        applyChangeHistoryColumnFilters();
        th.classList.toggle('data-table-col-filter-active', changeHistoryColumnFilters.has(colKey));
        allCheckbox.indeterminate = false;
    });

    document.body.appendChild(menu);
    const rect = th.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const left = Math.min(rect.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - menuWidth - 8);
    menu.style.position = 'absolute';
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${Math.max(8, left)}px`;
    // Same z-index bump Admin-EquipoSaaS.js's own copy needs -- this table
    // lives inside .modal-overlay (z-index: 100), above the shared
    // .data-table-col-filter-menu's own default (50).
    menu.style.zIndex = '150';
    changeHistoryFilterMenuEl = menu;
    changeHistoryFilterMenuCol = colKey;
    searchRow.querySelector('input')?.focus();
    setTimeout(() => document.addEventListener('click', handleChangeHistoryFilterOutsideClick, true), 0);
}

function attachChangeHistoryFilterTrigger(th, colKey) {
    if (th.querySelector('.data-table-col-filter-trigger')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'data-table-col-filter-trigger';
    btn.setAttribute('aria-label', t('main.filterColumn'));
    btn.setAttribute('data-help-key', 'filterColumn');
    btn.innerHTML = '<i class="bx bx-filter-alt" aria-hidden="true"></i>';
    btn.addEventListener('click', (event) => {
        event.stopPropagation();
        openChangeHistoryFilterMenu(th, colKey);
    });
    th.appendChild(btn);
}

// `recordId`, when passed (from a per-row history icon — see
// buildHistoryButton below), scopes the same modal/endpoint to just that
// record instead of the whole table — same UI, same data source, just a
// narrower ?recordId= query param server-side.
async function openChangeHistory(tableId, recordId) {
    ensureChangeHistoryModal();
    changeHistoryModal.hidden = false;
    const titleEl = changeHistoryModal.querySelector('#data-table-history-title');
    if (titleEl) titleEl.textContent = recordId ? t('main.changeHistoryTitleRecord') : t('main.changeHistoryTitle');
    // Fresh filter state every time it opens -- avoids a stale filter
    // silently hiding rows on a later open (same convention Admin-EquipoSaaS.js's
    // own openSaasUserChanges follows).
    changeHistoryColumnFilters = new Map();
    closeChangeHistoryFilterMenu();
    changeHistoryModal.querySelectorAll('th.data-table-col-filter-active').forEach((th) => th.classList.remove('data-table-col-filter-active'));
    changeHistoryList.innerHTML = '';
    changeHistoryList.appendChild(renderChangeHistoryRow([t('main.changeHistoryEmpty'), '', '', '', '', '']));
    try {
        const url = `/api/business/table-changes/${encodeURIComponent(tableId)}${recordId ? `?recordId=${encodeURIComponent(recordId)}` : ''}`;
        // In parallel, not chained -- fetchTableClassifications already
        // caches per tableId and never throws (falls back to {columns: {}}
        // on a 404/network error), so this never blocks or breaks the
        // history fetch above; a table with no Árbol de Permisos Maestro
        // classification info just renders every row's stripe as "sin
        // clasificar" (neutral gray) instead of a real color.
        const classificationsPromise = fetchTableClassifications(tableId);
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return;
        const { changes } = await res.json();
        if (!changes || !changes.length) return;
        const classificationCols = (await classificationsPromise).columns || {};
        changeHistoryList.innerHTML = '';
        changes.forEach((change) => {
            let description;
            let stripeColor = '';
            if (change.action === 'create') description = t('main.changeHistoryCreated');
            else if (change.action === 'delete') description = t('main.changeHistoryDeleted');
            else {
                description = `${t(change.field_key)}: "${change.old_value || '—'}" → "${change.new_value || '—'}"`;
                // field_key is "<namespace>.<colId>" (see checkAndLogFieldChanges
                // in server.js) -- the bare colId is exactly what
                // getEffectiveColumnClassifications returns entries for.
                const colId = (change.field_key || '').split('.').pop();
                stripeColor = classificationCols[colId]?.color || '';
            }
            changeHistoryList.appendChild(renderChangeHistoryRow([
                change.changed_at, change.changed_by || '—', change.record_label || '—', description,
                change.requested_by || '—', change.authorized_by || '—',
            ], stripeColor));
        });
    } catch {
        // Leave the empty-state row in place — no network/parse errors surfaced here.
    }
}

// --- Búsqueda Guardada ---------------------------------------------------
// One dedicated modal, same singleton pattern as Change History above,
// works on any .data-table-wrapper automatically (8th Iconos
// Personalizados leaf, iconSavedSearch, gated the same binary way as
// iconFilter/iconHistory/etc). Captures BOTH filter mechanisms every table
// already has: the page's own .filter-bar fields (serialized by DOM id --
// this file never learns a page's own field names, same as the
// Filtrar/Limpiar buttons already do) and the generic per-column value
// filter (dataTableColumnState's own columnFilters Map). Creating a
// 'global' one (visible to a chosen audience instead of just its owner) is
// admin-only -- a non-admin only ever sees "Solo yo", same split
// "Reglas de Orden de Llenado" already uses elsewhere in this file.
// Shared by Búsqueda Guardada AND Acomodo Guardado (identical audience
// semantics for both) -- see SavedView* functions below.
const SAVED_VIEW_AUDIENCE_GROUPS = [
    { key: 'userIds', labelKey: 'main.savedSearchAudienceUsers', excludable: false },
    { key: 'jobPositions', labelKey: 'main.savedSearchAudienceJobPositions', excludable: true },
    { key: 'costCenters', labelKey: 'main.savedSearchAudienceCostCenters', excludable: true },
    // A 4th entry (Sitios) belongs here the day Holding ships a real
    // Sucursal entity -- same {key, labelKey, excludable:true} shape,
    // nothing else in this block needs to change.
];
let savedViewAudienceCatalog = null; // {userIds:[{id,label}], jobPositions:[...], costCenters:[...]} -- shared cache
// Live selection while WHICHEVER saved-view picker is open -- Map<groupKey,
// Map<optionId, Set<exceptUserId>>>. Safe as one shared global: Búsqueda
// Guardada and Acomodo Guardado modals are never open at the same time,
// and each openX() resets this fresh. userIds' own inner Set is always
// empty/unused -- excluding a user from a literal user list is just not
// picking them in the first place.
let savedViewAudienceSelection = new Map();

// Shared by Búsqueda Guardada/Acomodo Guardado's own audience validation
// AND Acomodo Guardado unificado's "Terminar Asignación" gate -- true once
// at least one concrete target (a user, a puesto, a centro de costo) has
// been picked in whichever picker is currently open.
function hasAnyAudienceTarget() {
    return [...savedViewAudienceSelection.values()].some((groupMap) => groupMap.size > 0);
}

// Búsqueda Guardada = un nombre + un conjunto de filtros por columna (la misma
// lista de valores con casillas del embudo de cada encabezado) + a quién se
// la compartes. Se usa igual que Acomodo Guardado: el icono se abre como
// píldora con buscador y una lista (renderSavedSearchMenu), el nombre de la
// búsqueda aplicada queda escrito en el icono con una ✕ que la limpia, y
// "Agregar"/el lápiz abren este editor (openSavedSearchEditor): las mismas
// pestañas por clasificación y lista de columnas que Acomodo, pero en vez de
// la vista previa en forma de tabla, abajo van los filtros -- al tocar una
// columna se agrega su filtro. Lo guardado conserva el formato de siempre
// ({fields, columnFilters}); "fields" (los campos del panel de filtros de
// arriba) ya no se arma desde aquí, pero una búsqueda vieja que los traiga
// los conserva al editarla.
function canPersistSavedSearch(tableId) {
    return !!currentUser?.clientId || isSaasTableKey(tableId);
}

function savedSearchApiBase(tableId) {
    return isSaasTableKey(tableId) ? '/api/admin/saas-saved-searches' : '/api/business/saved-searches';
}

// Misma forma para comparar "lo que está puesto ahora" con "lo que guardó una
// búsqueda": sin campos vacíos y con los valores ordenados.
function normalizeSavedFilter(filter) {
    const fields = Object.entries(filter?.fields || {})
        .filter(([, value]) => value !== '' && value != null)
        .sort(([a], [b]) => a.localeCompare(b));
    const columns = Object.entries(filter?.columnFilters || {})
        .map(([key, values]) => [key, [...values].sort()])
        .sort(([a], [b]) => a.localeCompare(b));
    const rules = Object.entries(filter?.columnRules || {})
        .filter(([, rule]) => isColumnRuleActive(rule))
        .map(([key, rule]) => [key, rule.kind === 'range'
            ? ['range', rule.from || '', rule.to || '', ...(rule.rtype && rule.rtype !== 'date' ? [rule.rtype] : [])]
            : ['text', rule.mode || 'contains', String(rule.text).trim().toLowerCase()]])
        .sort(([a], [b]) => a.localeCompare(b));
    // Sin reglas queda la misma firma de antes: lo ya aplicado no se pierde.
    return JSON.stringify(rules.length ? [fields, columns, rules] : [fields, columns]);
}

function activeSearchStorageKey(tableId) {
    return `sgn_active_search::${tableId}`;
}

// Igual que getActiveSavedLayout: la búsqueda aplicada se recuerda con una
// firma de los filtros que dejó puestos; si después se cambia un filtro a
// mano la firma ya no coincide y el nombre deja de mostrarse.
function getActiveSavedSearch(tableId) {
    try {
        const record = JSON.parse(localStorage.getItem(activeSearchStorageKey(tableId)) || 'null');
        if (record && record.sig === normalizeSavedFilter(collectCurrentFilterSnapshot(tableId))) return record;
    } catch {
        // Unreadable record -- same as having none.
    }
    return null;
}

function setActiveSavedSearch(tableId, search) {
    try {
        localStorage.setItem(activeSearchStorageKey(tableId), JSON.stringify({
            id: search.id, name: search.name, sig: normalizeSavedFilter(collectCurrentFilterSnapshot(tableId)),
        }));
    } catch {
        // No storage -- the name just isn't remembered.
    }
}

function clearActiveSavedSearch(tableId) {
    try { localStorage.removeItem(activeSearchStorageKey(tableId)); } catch { /* ignore */ }
}

function refreshSavedSearchPill(pill) {
    const active = getActiveSavedSearch(pill.dataset.pillTableId);
    const nameEl = pill.querySelector('.data-table-layout-pill-name');
    nameEl.textContent = active ? active.name : '';
    nameEl.hidden = !active || pill.classList.contains('open');
    pill.querySelector('.data-table-layout-pill-clear').hidden = !active;
    pill.classList.toggle('named', !!active);
}

function refreshSavedSearchPillForTable(tableId) {
    const pill = document.querySelector(`.data-table-search-pill[data-pill-table-id="${CSS.escape(tableId)}"]`);
    if (pill) refreshSavedSearchPill(pill);
}

// Deja la tabla sin ningún filtro (panel de arriba + por columna), igual que
// el botón Limpiar de los filtros pero SIN tocar el acomodo de columnas.
function resetTableFilters(tableId) {
    const filterBar = getSavedSearchFilterBar(tableId);
    if (filterBar) {
        filterBar.querySelectorAll('input').forEach((input) => { input.value = ''; });
        filterBar.querySelectorAll('select').forEach((select) => { select.selectedIndex = 0; });
        filterBar.classList.remove('filter-bar-expanded');
        filterBar.dispatchEvent(new CustomEvent('data-table:filter-clear'));
    }
    const state = dataTableColumnState.get(tableId);
    if (state) {
        state.columnFilters.clear();
        state.columnRules.clear();
        state.panelDrafts?.clear();
        applyColumnValueFilters(tableId);
        getHeaderRow(state.table).querySelectorAll('th.data-table-col-filter-active')
            .forEach((th) => th.classList.remove('data-table-col-filter-active'));
        state.wrapper?.previousElementSibling?.querySelector('[data-col-action="filter"]')?.setAttribute('aria-expanded', 'false');
    }
    closeColumnFilterMenu();
    sizeDataTableWrappers();
}

// ✕ en la píldora: quita la búsqueda aplicada y deja la tabla sin filtros.
function clearSavedSearchForTable(tableId) {
    closeSavedSearchMenu();
    clearActiveSavedSearch(tableId);
    resetTableFilters(tableId);
    refreshSavedSearchPillForTable(tableId);
}

// "Estatus: Activo, En pausa +1 · Fecha: 3" -- resumen corto de lo que filtra
// una búsqueda, para la lista del menú.
function summarizeSavedSearch(tableId, filter) {
    const state = dataTableColumnState.get(tableId);
    const rules = filter?.columnRules || {};
    const keys = [...new Set([...Object.keys(filter?.columnFilters || {}), ...Object.keys(rules)])]
        .filter((key) => !state || state.labels[key] !== undefined);
    const parts = keys.map((key) => {
        const label = state?.labels[key] || key;
        const values = filter?.columnFilters?.[key] || [];
        const bits = [];
        if (isColumnRuleActive(rules[key])) bits.push(describeColumnRule(rules[key]));
        if (values.length) bits.push(`${values.slice(0, 2).join(', ')}${values.length > 2 ? ` +${values.length - 2}` : ''}`);
        return `${label}: ${bits.join(', ')}`;
    });
    const panelCount = Object.values(filter?.fields || {}).filter((v) => v !== '' && v != null).length;
    if (panelCount) parts.push(t('main.savedSearchPanelFilters', { count: String(panelCount) }));
    return parts.join(' · ');
}

// --- Menú de Búsqueda Guardada (mismo diseño que el de Acomodo Guardado) ---
let searchMenuEl = null;
let searchMenuState = null; // { tableId, pill, input, searches, loaded, query }

function closeSavedSearchMenu() {
    if (!searchMenuState) return;
    const { pill, input } = searchMenuState;
    pill.classList.remove('open');
    input.hidden = true;
    input.value = '';
    searchMenuEl.hidden = true;
    searchMenuState = null;
    refreshSavedSearchPill(pill);
}

function positionSavedSearchMenu() {
    if (!searchMenuState) return;
    const pillRect = searchMenuState.pill.getBoundingClientRect();
    const iconRect = searchMenuState.pill.querySelector('button').getBoundingClientRect();
    const margin = 8;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const width = Math.min(23 * rem, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(pillRect.left, window.innerWidth - width - margin));
    searchMenuEl.style.width = `${width}px`;
    searchMenuEl.style.left = `${left}px`;
    searchMenuEl.style.top = `${pillRect.bottom + margin}px`;
    searchMenuEl.style.setProperty('--caret-left', `${iconRect.left + iconRect.width / 2 - left - 6}px`);
}

function ensureSavedSearchMenu() {
    if (searchMenuEl) return;
    searchMenuEl = document.createElement('div');
    searchMenuEl.className = 'data-table-layout-menu';
    searchMenuEl.setAttribute('role', 'menu');
    searchMenuEl.setAttribute('aria-label', t('main.savedSearchTitle'));
    searchMenuEl.hidden = true;
    document.body.appendChild(searchMenuEl);
    document.addEventListener('mousedown', (event) => {
        if (!searchMenuState) return;
        if (searchMenuEl.contains(event.target) || searchMenuState.pill.contains(event.target)) return;
        closeSavedSearchMenu();
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSavedSearchMenu(); });
    window.addEventListener('resize', positionSavedSearchMenu);
    window.addEventListener('scroll', positionSavedSearchMenu, true);
}

function renderSavedSearchMenu() {
    const state = searchMenuState;
    if (!state) return;
    searchMenuEl.innerHTML = '';

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'data-table-layout-item data-table-layout-add';
    add.setAttribute('role', 'menuitem');
    add.innerHTML = '<span class="data-table-layout-plus"><i class="bx bx-plus" aria-hidden="true"></i></span>';
    const addLabel = document.createElement('span');
    addLabel.textContent = t('main.arrangeAddNew');
    add.appendChild(addLabel);
    add.addEventListener('click', () => {
        closeSavedSearchMenu();
        openSavedSearchEditor(state.tableId);
    });
    searchMenuEl.appendChild(add);
    if (!state.loaded) return;

    const sep = document.createElement('div');
    sep.className = 'data-table-layout-sep';
    searchMenuEl.appendChild(sep);

    const query = state.query.trim();
    const lowerQuery = query.toLowerCase();
    const shown = lowerQuery ? state.searches.filter((s) => s.name.toLowerCase().includes(lowerQuery)) : state.searches;
    if (!shown.length) {
        const empty = document.createElement('p');
        empty.className = 'data-table-layout-empty';
        empty.textContent = state.searches.length ? t('main.savedLayoutNoResults', { query }) : t('main.savedSearchEmpty');
        searchMenuEl.appendChild(empty);
        return;
    }

    const isAdminForThisTable = isSaasTableKey(state.tableId) ? !!currentUser?.isSaasSuperAdmin : !!currentUser?.isClientAdmin;
    const activeId = getActiveSavedSearch(state.tableId)?.id;
    const list = document.createElement('div');
    list.className = 'data-table-layout-list';
    shown.forEach((search) => {
        const row = document.createElement('div');
        row.className = 'data-table-layout-item' + (search.id === activeId ? ' on' : '');

        const check = document.createElement('span');
        check.className = 'data-table-layout-check';
        if (search.id === activeId) check.innerHTML = '<i class="bx bx-check" aria-hidden="true"></i>';
        row.appendChild(check);

        const nameBtn = document.createElement('button');
        nameBtn.type = 'button';
        nameBtn.className = 'data-table-layout-name data-table-layout-name-two';
        nameBtn.setAttribute('role', 'menuitem');
        const nameEl = document.createElement('span');
        appendHighlightedText(nameEl, search.name, lowerQuery);
        nameBtn.appendChild(nameEl);
        const summary = summarizeSavedSearch(state.tableId, search.filter);
        if (summary) {
            const sumEl = document.createElement('span');
            sumEl.className = 'data-table-layout-sum';
            sumEl.textContent = summary;
            nameBtn.appendChild(sumEl);
        }
        nameBtn.addEventListener('click', () => {
            applySavedSearch(state.tableId, search);
            closeSavedSearchMenu();
        });
        row.appendChild(nameBtn);

        const badge = document.createElement('span');
        badge.className = `saved-view-scope-badge saved-view-scope-${search.scope}`;
        badge.textContent = t(search.scope === 'global' ? 'main.savedSearchScopeGlobal' : 'main.savedSearchScopePersonal');
        row.appendChild(badge);

        // Same rule the server enforces on PUT/DELETE: a 'personal' row only
        // ever shows in its owner's own list, so personal rows plus every
        // row for an admin can be edited/deleted.
        if (isAdminForThisTable || search.scope === 'personal') {
            const acts = document.createElement('span');
            acts.className = 'data-table-layout-acts';
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'data-table-layout-act data-table-layout-act-edit';
            editBtn.setAttribute('aria-label', t('main.savedLayoutEditBtn'));
            editBtn.title = t('main.savedLayoutEditBtn');
            editBtn.innerHTML = '<i class="bx bx-pencil" aria-hidden="true"></i>';
            editBtn.addEventListener('click', () => {
                closeSavedSearchMenu();
                openSavedSearchEditor(state.tableId, search);
            });
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'data-table-layout-act data-table-layout-act-del';
            delBtn.setAttribute('aria-label', t('admin.delete'));
            delBtn.title = t('admin.delete');
            delBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
            delBtn.addEventListener('click', () => deleteSavedSearchFromMenu(state, search.id));
            acts.append(editBtn, delBtn);
            row.appendChild(acts);
        }
        list.appendChild(row);
    });
    searchMenuEl.appendChild(list);
}

async function refreshSavedSearchMenu(state) {
    try {
        const res = await fetch(`${savedSearchApiBase(state.tableId)}/${encodeURIComponent(state.tableId)}`, { credentials: 'include' });
        if (res.ok) state.searches = (await res.json()).searches || [];
    } catch {
        // Leave the list as it was -- the next open retries the fetch anyway.
    }
    state.loaded = true;
    if (searchMenuState === state) renderSavedSearchMenu();
}

async function deleteSavedSearchFromMenu(state, id) {
    try {
        const res = await fetch(`${savedSearchApiBase(state.tableId)}/${id}`, { method: 'DELETE', credentials: 'include' });
        if (res.ok) {
            if (getActiveSavedSearch(state.tableId)?.id === id) clearActiveSavedSearch(state.tableId);
            refreshSavedSearchPill(state.pill);
            await refreshSavedSearchMenu(state);
        }
    } catch {
        // Leave the list as-is -- next open retries the fetch anyway.
    }
}

async function toggleSavedSearchMenu(tableId, pill) {
    if (searchMenuState?.pill === pill) {
        closeSavedSearchMenu();
        return;
    }
    closeSavedSearchMenu();
    closeSavedLayoutMenu();
    ensureSavedSearchMenu();
    const input = pill.querySelector('input');
    const state = { tableId, pill, input, searches: [], loaded: false, query: '' };
    searchMenuState = state;
    pill.classList.add('open');
    refreshSavedSearchPill(pill);
    input.hidden = false;
    input.value = '';
    searchMenuEl.hidden = false;
    renderSavedSearchMenu();
    positionSavedSearchMenu();
    input.focus({ preventScroll: true });
    await refreshSavedSearchMenu(state);
}

// --- Editor: nombre + pestañas/columnas + los filtros de cada columna -------
let searchEditorModal = null;
// { tableId, editingId, filters: Map<colKey, Set<value>>, expanded: Set<colKey>,
//   preservedFields, activeTab, query, scope }
let searchEditorState = null;

function closeSavedSearchEditor(saved) {
    if (!searchEditorModal) return;
    const state = searchEditorState;
    searchEditorModal.hidden = true;
    searchEditorState = null;
    // Terminar Filtrado deja los filtros puestos en la tabla de atrás; si se
    // cierra sin guardar, la tabla vuelve a como estaba.
    if (state?.previewApplied && saved !== true) {
        setTableColumnFilters(state.tableId, state.restore.columnFilters, state.restore.columnRules);
    }
}

function ensureSearchEditorModal() {
    if (searchEditorModal) return;
    searchEditorModal = document.createElement('div');
    searchEditorModal.className = 'modal-overlay';
    searchEditorModal.hidden = true;
    searchEditorModal.innerHTML = `
        <div class="modal-panel data-table-arrange-panel" role="dialog" aria-modal="true" aria-labelledby="data-table-search-title">
            <h3 id="data-table-search-title">
                <button type="button" class="data-table-arrange-back" data-role="back" aria-label="${t('main.arrangeBack')}"><i class="bx bx-arrow-back" aria-hidden="true"></i></button>
                <span data-role="title">${t('main.savedSearchEditorNewTitle')}</span>
            </h3>
            <div>
                <label class="data-table-arrange-label" for="data-table-search-name" data-role="name-label">${t('main.savedSearchEditorNameLabel')}</label>
                <input type="text" id="data-table-search-name" data-role="name" class="saved-view-name-input data-table-arrange-name" placeholder="${t('main.savedSearchNamePlaceholder')}">

                <div class="data-table-arrange-colpanel">
                    <div class="sector-icon-picker-search">
                        <i class="bx bx-search" aria-hidden="true"></i>
                        <input type="text" class="sector-icon-picker-search-input" data-role="search" placeholder="${t('main.columnSearchPlaceholder')}">
                    </div>
                    <p class="data-table-arrange-section-label">${t('main.arrangeClassHint')}</p>
                    <div class="sector-icon-picker-chips data-table-arrange-tabs" data-role="tabs"></div>
                    <div class="data-table-arrange-legend">
                        <span><i class="bx bx-filter-alt" aria-hidden="true"></i> ${t('main.savedSearchEditorLegend')}</span>
                    </div>
                    <div class="admin-module-list data-table-arrange-list" data-role="rows"></div>
                </div>

                <p class="data-table-arrange-section-label">${t('main.savedSearchFiltersLabel')}</p>
                <div class="data-table-search-filters" data-role="filters"></div>

                <div data-role="audience-panel" class="saved-view-audience-panel" hidden></div>
                <div class="data-table-search-footer">
                    <p data-role="error" class="admin-error" role="alert" hidden></p>
                    <div data-role="applied" class="data-table-search-applied" hidden></div>
                    <button type="button" class="btn data-table-arrange-block-btn" data-role="terminar" disabled>${t('main.savedSearchTerminar')}</button>
                    <div class="data-table-search-footer-row">
                        <div data-role="scope-block">
                            <div data-role="admin-section" class="data-table-arrange-segmented" hidden>
                                <label><input type="radio" name="saved-search-audience" value="self" checked> <span>${t('main.savedSearchAudienceSelf')}</span></label>
                                <label><input type="radio" name="saved-search-audience" value="assign"> <span>${t('main.savedSearchAudienceAssign')}</span></label>
                            </div>
                        </div>
                        <button type="button" class="btn btn-secondary data-table-search-cancel" data-role="close">${t('admin.cancel')}</button>
                    </div>
                    <button type="button" class="btn data-table-arrange-block-btn data-table-arrange-assign-btn" data-role="terminar-asignacion" hidden>${t('main.arrangeTerminarAsignacion')}</button>
                    <button type="button" class="btn data-table-arrange-block-btn data-table-arrange-save-btn" data-role="save" disabled>${t('main.savedSearchSaveBtn')}</button>
                    <p data-role="lock-note" class="data-table-arrange-lock-note"></p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(searchEditorModal);
    const q = (role) => searchEditorModal.querySelector(`[data-role="${role}"]`);
    searchEditorModal._refs = {
        titleEl: q('title'), nameLabel: q('name-label'), nameInput: q('name'), searchInput: q('search'),
        tabsEl: q('tabs'), rowsEl: q('rows'), filtersEl: q('filters'), scopeBlock: q('scope-block'),
        adminSection: q('admin-section'), audiencePanel: q('audience-panel'), errorEl: q('error'),
        saveBtn: q('save'), lockNote: q('lock-note'), applied: q('applied'),
        terminarBtn: q('terminar'), terminarAsignacionBtn: q('terminar-asignacion'),
    };
    const refs = searchEditorModal._refs;

    q('close').addEventListener('click', closeSavedSearchEditor);
    q('back').addEventListener('click', closeSavedSearchEditor);
    wireModalDismiss(searchEditorModal, closeSavedSearchEditor);

    refs.nameInput.addEventListener('input', updateSearchEditorGating);
    refs.searchInput.addEventListener('input', () => {
        searchEditorState.query = refs.searchInput.value;
        renderSearchEditorRows();
    });
    searchEditorModal.querySelectorAll('input[name="saved-search-audience"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            searchEditorState.scope = radio.value === 'assign' ? 'global' : 'personal';
            if (radio.value === 'assign') {
                refs.audiencePanel.hidden = false;
                if (isSaasTableKey(searchEditorState.tableId)) buildSaasLayoutAudiencePanel(refs.audiencePanel);
                else buildSavedViewAudiencePanel(refs.audiencePanel);
                refs.terminarAsignacionBtn.hidden = false;
            } else {
                refs.audiencePanel.hidden = true;
                refs.terminarAsignacionBtn.hidden = true;
            }
            searchEditorState.terminarAsignacionDone = false;
            updateSearchEditorGating();
        });
    });

    // Terminar Filtrado: pone los filtros en la tabla de atrás (aunque quede
    // vacía) para ver cómo queda, y habilita el paso siguiente.
    refs.terminarBtn.addEventListener('click', () => {
        const { tableId } = searchEditorState;
        const { columnFilters, columnRules } = collectSearchEditorFilter();
        setTableColumnFilters(tableId, columnFilters, columnRules);
        searchEditorState.previewApplied = true;
        searchEditorState.terminarFiltradoDone = true;
        const { shown, total } = countVisibleTableRows(tableId);
        refs.applied.innerHTML = '<i class="bx bx-check" aria-hidden="true"></i>';
        const title = document.createElement('b');
        title.textContent = t('main.savedSearchApplied');
        const count = document.createElement('span');
        count.textContent = '· ' + t('main.savedSearchAppliedCount', { count: String(shown), total: String(total) });
        refs.applied.append(title, count);
        refs.applied.hidden = false;
        refs.errorEl.hidden = true;
        updateSearchEditorGating();
    });

    refs.terminarAsignacionBtn.addEventListener('click', () => {
        if (!hasAnyAudienceTarget()) {
            refs.errorEl.textContent = t(isSaasTableKey(searchEditorState.tableId)
                ? 'main.savedSearchAudienceSummaryEmptySaas' : 'main.savedSearchAudienceSummaryEmpty');
            refs.errorEl.hidden = false;
            return;
        }
        refs.errorEl.hidden = true;
        searchEditorState.terminarAsignacionDone = true;
        updateSearchEditorGating();
    });
    refs.saveBtn.addEventListener('click', saveSavedSearch);
}

// Columnas que se pueden filtrar: las mismas que tienen embudo en su
// encabezado (todas menos la de acciones).
function searchEditorKeys(state) {
    return state.columnKeys.filter((k) => k !== 'actions');
}

function renderSearchEditorTabs() {
    const state = dataTableColumnState.get(searchEditorState.tableId);
    if (!state) return;
    const { tabsEl, searchInput } = searchEditorModal._refs;
    tabsEl.innerHTML = '';
    const keys = searchEditorKeys(state);
    const presentGroupKeys = [...new Set(keys.map((k) => state.groupKeys.get(k)).filter(Boolean))];
    const hasUnclassified = keys.some((k) => !state.groupKeys.get(k));
    const tabs = hasUnclassified ? [...presentGroupKeys, COLUMN_ARRANGE_UNCLASSIFIED] : presentGroupKeys;
    tabs.forEach((groupKey) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'sector-icon-picker-chip' + (searchEditorState.activeTab === groupKey ? ' active' : '');
        if (groupKey !== COLUMN_ARRANGE_UNCLASSIFIED) {
            const dot = document.createElement('span');
            dot.className = 'data-table-col-dot data-table-col-dot-chip';
            dot.style.backgroundColor = columnGroupColor(groupKey);
            tab.appendChild(dot);
        }
        tab.appendChild(document.createTextNode(groupKey === COLUMN_ARRANGE_UNCLASSIFIED ? t('menu.classNone') : resolveGroupLabel(groupKey)));
        const count = document.createElement('span');
        count.className = 'data-table-arrange-tab-count';
        count.textContent = String(keys.filter((k) => (state.groupKeys.get(k) || COLUMN_ARRANGE_UNCLASSIFIED) === groupKey).length);
        tab.appendChild(count);
        tab.addEventListener('click', () => {
            searchEditorState.activeTab = groupKey;
            searchEditorState.query = '';
            searchInput.value = '';
            renderSearchEditorTabs();
            renderSearchEditorRows();
        });
        tabsEl.appendChild(tab);
    });
}

function searchEditorVisibleKeys(state) {
    const keys = searchEditorKeys(state);
    const q = searchEditorState.query.trim().toLowerCase();
    if (q) return keys.filter((k) => (state.labels[k] || k).toLowerCase().includes(q));
    return keys.filter((k) => (state.groupKeys.get(k) || COLUMN_ARRANGE_UNCLASSIFIED) === searchEditorState.activeTab);
}

// Botón de embudo de una columna: marcado (con el mismo tinte de su
// clasificación que usa el Normal/Fija de Acomodo) cuando ya tiene filtro.
function buildSearchFilterToggle(key, groupKey, label) {
    const wrap = document.createElement('div');
    wrap.className = 'data-table-tri-control';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = '<i class="bx bx-filter-alt" aria-hidden="true"></i>';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    const active = searchEditorState.filters.has(key);
    btn.classList.toggle('active', active);
    if (active && groupKey) btn.dataset.groupKey = groupKey;
    const color = columnGroupColor(groupKey);
    if (active && color && color !== 'var(--color-border)' && !color.startsWith('var(')) {
        btn.style.backgroundColor = `color-mix(in srgb, ${color} 16%, var(--color-surface))`;
        btn.style.color = color;
    }
    wrap.appendChild(btn);
    return wrap;
}

function renderSearchEditorRows() {
    const state = dataTableColumnState.get(searchEditorState.tableId);
    if (!state) return;
    const rowsEl = searchEditorModal._refs.rowsEl;
    rowsEl.innerHTML = '';
    searchEditorVisibleKeys(state).forEach((key) => {
        const groupKey = state.groupKeys.get(key);
        const label = state.labels[key] || key;
        const { row } = buildArrangeRowShell(key, label, {
            dotColor: columnGroupColor(groupKey), dotTitle: groupKey ? resolveGroupLabel(groupKey) : t('menu.classNone'),
        });
        row.classList.toggle('has-filter', searchEditorState.filters.has(key));
        row.classList.add('data-table-search-row');
        row.appendChild(buildSearchFilterToggle(key, groupKey, label));
        row.addEventListener('click', () => toggleSearchEditorFilter(key));
        rowsEl.appendChild(row);
    });
}

// Cualquier cambio en los filtros obliga a volver a tocar Terminar Filtrado.
function onSearchEditorFilterChange() {
    if (!searchEditorState) return;
    searchEditorState.terminarFiltradoDone = false;
    searchEditorModal._refs.applied.hidden = true;
    updateSearchEditorGating();
}

function toggleSearchEditorFilter(key) {
    searchEditorState.terminarFiltradoDone = false;
    searchEditorModal._refs.applied.hidden = true;
    const { filters, expanded } = searchEditorState;
    if (filters.has(key)) {
        filters.delete(key);
        expanded.delete(key);
        searchEditorState.rules.delete(key);
    } else {
        // Un filtro nuevo empieza sin valores elegidos (hay que marcar cuáles
        // sí), y es el único abierto: los anteriores se resumen.
        filters.set(key, new Set());
        expanded.clear();
        expanded.add(key);
    }
    renderSearchEditorRows();
    renderSearchEditorFilters();
}

function summarizeFilterCard(selected, total, rule) {
    const bits = [];
    if (isColumnRuleActive(rule)) bits.push(describeColumnRule(rule));
    if (selected.size) {
        const shown = [...selected].slice(0, 3).join(', ');
        bits.push(t('main.savedSearchValuesSummary', {
            count: String(selected.size), total: String(total), list: `${shown}${selected.size > 3 ? '…' : ''}`,
        }));
    }
    return bits.length ? bits.join(' · ') : t('main.savedSearchPickValues');
}

// El mismo control del embudo de un encabezado (openColumnFilterMenu): modo +
// buscador, "Todos" y la lista de valores con casillas. Las columnas que son
// una fecha, parte de una fecha, una hora o números suman un cuarto modo,
// "Desde–Hasta", con dos campos del tipo que toca. A diferencia del embudo, lo
// que se escribe (o el rango) no es solo un recorte de la lista: queda como
// regla de la columna (`rule`), así que "Contiene GRUPO" o "de 10 a 50" valen
// sin marcar nada y también para los registros que lleguen después. Marcar
// casillas (`selected`) sigue siendo válido; si hay las dos cosas, se piden las
// dos.
function buildSearchFilterBody(tableId, key, selected, onChange, rule, opts = {}) {
    const distinctValues = [...new Set([...getColumnDistinctValues(tableId, key), ...selected])]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    const rangeType = rule.rtype || detectRangeType(key, distinctValues);
    rule.rtype = rangeType;
    if (rangeType === 'number') {
        rule.currency = distinctValues.some((v) => String(v).trim().startsWith('$'));
    }
    const MODES = [
        { id: 'startsWith', labelKey: 'main.filterModeStartsWith' },
        { id: 'contains', labelKey: 'main.filterModeContains' },
        { id: 'equals', labelKey: 'main.filterModeEquals' },
    ];
    if (rangeType) MODES.push({ id: 'range', labelKey: 'main.filterModeRange' });
    // La fecha completa abre directo en Desde–Hasta; lo demás, en Contiene.
    let mode = MODES.some((m) => m.id === rule.mode) ? rule.mode : (rangeType === 'date' ? 'range' : 'contains');
    rule.mode = mode;
    rule.kind = mode === 'range' ? 'range' : 'text';
    const rowMatches = (value) => columnRuleMatches(rule, value);
    let refreshList = () => {};

    const body = document.createElement('div');
    body.className = 'data-table-search-filter-body';
    const current = document.createElement('div');
    current.className = 'data-table-col-filter-mode-current';
    body.appendChild(current);
    const searchRow = document.createElement('div');
    searchRow.className = 'data-table-col-filter-search-row';
    const modeBtn = document.createElement('button');
    modeBtn.type = 'button';
    modeBtn.className = 'data-table-col-filter-mode-btn';
    modeBtn.setAttribute('aria-label', t('main.filterModeLabel'));
    modeBtn.title = t('main.filterModeLabel');
    modeBtn.innerHTML = '<i class="bx bx-slider-alt" aria-hidden="true"></i>';
    searchRow.appendChild(modeBtn);
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'data-table-col-filter-search';
    searchInput.placeholder = t('main.filterSearchPlaceholder');
    searchInput.value = rule.text || '';
    searchRow.appendChild(searchInput);
    const rangeBox = document.createElement('div');
    rangeBox.className = 'data-table-search-range';
    if (rangeType) buildRangeFields(rangeBox, rule, () => { refreshList(); change(); });
    searchRow.appendChild(rangeBox);
    const modeMenu = document.createElement('div');
    modeMenu.className = 'data-table-col-filter-mode-menu';
    modeMenu.hidden = true;
    const showMode = () => {
        current.textContent = t(MODES.find((m) => m.id === mode).labelKey);
        searchInput.hidden = mode === 'range';
        rangeBox.hidden = mode !== 'range';
    };
    const modeButtons = MODES.map((m) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'data-table-col-filter-mode-option';
        btn.textContent = t(m.labelKey);
        btn.classList.toggle('data-table-col-filter-mode-option-active', m.id === mode);
        btn.addEventListener('click', () => {
            mode = m.id;
            rule.mode = mode;
            rule.kind = mode === 'range' ? 'range' : 'text';
            modeButtons.forEach((b) => b.classList.remove('data-table-col-filter-mode-option-active'));
            btn.classList.add('data-table-col-filter-mode-option-active');
            modeMenu.hidden = true;
            showMode();
            refreshList();
            change();
        });
        modeMenu.appendChild(btn);
        return btn;
    });
    searchRow.appendChild(modeMenu);
    modeBtn.addEventListener('click', () => { modeMenu.hidden = !modeMenu.hidden; });
    searchInput.addEventListener('input', () => { rule.text = searchInput.value; refreshList(); change(); });
    showMode();
    body.appendChild(searchRow);

    // Lo escrito (o el rango) ES el filtro: aquí se ve la regla tal cual y
    // cuántas filas la cumplen hoy, aunque sean cero.
    const ruleLine = document.createElement('div');
    ruleLine.className = 'data-table-search-rule';
    ruleLine.innerHTML = '<i class="bx bx-check" aria-hidden="true"></i>';
    const ruleText = document.createElement('span');
    const ruleCount = document.createElement('span');
    ruleCount.className = 'data-table-search-rule-count';
    ruleLine.append(ruleText, ruleCount);
    const zeroBox = document.createElement('p');
    zeroBox.className = 'data-table-search-rule-zero';
    const zeroTitle = document.createElement('b');
    zeroTitle.textContent = t('main.savedSearchRuleZeroTitle');
    zeroBox.append(zeroTitle, document.createTextNode(' ' + t('main.savedSearchRuleZeroBody')));
    const optLabel = document.createElement('p');
    optLabel.className = 'data-table-search-optlabel';
    const optHint = document.createElement('i');
    optHint.textContent = ' ' + t('main.savedSearchOptionalHint');
    optLabel.append(document.createTextNode(t('main.savedSearchOptionalValues')), optHint);
    body.append(ruleLine, zeroBox, optLabel);
    const columnLabel = dataTableColumnState.get(tableId)?.labels[key] || key;

    const allRow = document.createElement('label');
    allRow.className = 'data-table-col-filter-option data-table-col-filter-all';
    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    const allLabel = document.createElement('span');
    allLabel.textContent = t('main.filterAll');
    allRow.append(allCheckbox, allLabel);
    body.appendChild(allRow);

    const list = document.createElement('div');
    list.className = 'data-table-col-filter-list';
    const checkboxes = [];
    const syncAll = () => {
        allCheckbox.checked = distinctValues.length > 0 && selected.size === distinctValues.length;
        allCheckbox.indeterminate = selected.size > 0 && selected.size < distinctValues.length;
    };
    distinctValues.forEach((value) => {
        const row = document.createElement('label');
        row.className = 'data-table-col-filter-option';
        row.dataset.searchValue = value;
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selected.has(value);
        cb.addEventListener('change', () => {
            if (cb.checked) selected.add(value); else selected.delete(value);
            syncAll();
            change();
        });
        const span = document.createElement('span');
        span.textContent = value || '—';
        row.append(cb, span);
        list.appendChild(row);
        checkboxes.push(cb);
    });
    body.appendChild(list);
    const emptyList = document.createElement('div');
    emptyList.className = 'data-table-search-empty-list';
    emptyList.textContent = t('main.savedSearchNoValuesYet');
    emptyList.hidden = true;
    body.appendChild(emptyList);
    function updateRuleInfo() {
        // En el panel del embudo la lista va sola: el resumen lo da el propio campo.
        if (opts.compact) {
            ruleLine.hidden = true;
            optLabel.hidden = true;
            zeroBox.hidden = true;
            emptyList.hidden = true;
            return;
        }
        const active = isColumnRuleActive(rule);
        ruleLine.hidden = !active;
        optLabel.hidden = !active;
        zeroBox.hidden = true;
        emptyList.hidden = true;
        if (!active) return;
        const line = describeRuleLine(rule);
        const isFullDate = rule.kind === 'range' && (!rule.rtype || rule.rtype === 'date');
        ruleText.textContent = t('main.savedSearchRuleLine', { rule: isFullDate ? line : `${columnLabel} ${line}` });
        const { matching, total } = countRuleRows(tableId, key, rule, selected);
        ruleCount.textContent = t('main.savedSearchRuleCount', { count: String(matching), total: String(total) });
        ruleCount.classList.toggle('zero', matching === 0);
        zeroBox.hidden = matching !== 0;
        emptyList.hidden = [...list.querySelectorAll('.data-table-col-filter-option')].some((row) => !row.hidden);
    }
    function change() {
        updateRuleInfo();
        onChange();
    }
    refreshList = () => {
        list.querySelectorAll('.data-table-col-filter-option').forEach((row) => { row.hidden = !rowMatches(row.dataset.searchValue); });
    };
    allCheckbox.addEventListener('change', () => {
        checkboxes.forEach((cb, i) => {
            cb.checked = allCheckbox.checked;
            if (allCheckbox.checked) selected.add(distinctValues[i]); else selected.delete(distinctValues[i]);
        });
        allCheckbox.indeterminate = false;
        change();
    });
    syncAll();
    refreshList();
    updateRuleInfo();
    return { body, total: distinctValues.length };
}

function renderSearchEditorFilters() {
    const state = dataTableColumnState.get(searchEditorState.tableId);
    if (!state) return;
    const { filtersEl } = searchEditorModal._refs;
    filtersEl.innerHTML = '';
    if (!searchEditorState.filters.size) {
        const empty = document.createElement('p');
        empty.className = 'data-table-search-empty';
        empty.textContent = t('main.savedSearchFiltersEmpty');
        filtersEl.appendChild(empty);
    }
    searchEditorState.filters.forEach((selected, key) => {
        const groupKey = state.groupKeys.get(key);
        const open = searchEditorState.expanded.has(key);
        const card = document.createElement('div');
        card.className = 'data-table-search-card';

        const head = document.createElement('div');
        head.className = 'data-table-search-card-head';
        const dot = document.createElement('span');
        dot.className = 'data-table-col-dot';
        dot.style.backgroundColor = columnGroupColor(groupKey);
        const title = document.createElement('span');
        title.className = 'data-table-search-card-title';
        title.textContent = state.labels[key] || key;
        const cls = document.createElement('span');
        cls.className = 'data-table-search-card-class';
        cls.textContent = groupKey ? resolveGroupLabel(groupKey) : t('menu.classNone');
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'data-table-search-card-remove';
        remove.setAttribute('aria-label', t('main.savedSearchRemoveFilter'));
        remove.title = t('main.savedSearchRemoveFilter');
        remove.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
        remove.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleSearchEditorFilter(key);
        });
        head.append(dot, title, cls, remove);
        head.addEventListener('click', () => {
            if (searchEditorState.expanded.has(key)) searchEditorState.expanded.delete(key);
            else searchEditorState.expanded.add(key);
            renderSearchEditorFilters();
        });
        card.appendChild(head);

        if (!searchEditorState.rules.has(key)) {
            searchEditorState.rules.set(key, { kind: null, mode: null, text: '', from: '', to: '', rtype: null, currency: false });
        }
        const rule = searchEditorState.rules.get(key);
        const { body, total } = buildSearchFilterBody(searchEditorState.tableId, key, selected, onSearchEditorFilterChange, rule);
        if (open) {
            card.appendChild(body);
        } else {
            const summary = document.createElement('p');
            summary.className = 'data-table-search-card-summary';
            summary.textContent = summarizeFilterCard(selected, total, rule);
            card.appendChild(summary);
        }
        filtersEl.appendChild(card);
    });
    if (Object.keys(searchEditorState.preservedFields).length) {
        const kept = document.createElement('p');
        kept.className = 'data-table-arrange-caption';
        kept.textContent = t('main.savedSearchKeepsPanel', { count: String(Object.values(searchEditorState.preservedFields).filter((v) => v !== '' && v != null).length) });
        filtersEl.appendChild(kept);
    }
    updateSearchEditorGating();
}

// Igual que Acomodo: "Terminar Filtrado" se habilita cuando hay al menos un
// filtro y cada uno tiene un texto, un rango o valores marcados; Guardar, hasta
// haberlo tocado (y, con "Asignar a…", "Terminar Asignación") y haber nombrado
// la búsqueda.
function updateSearchEditorGating() {
    if (!searchEditorState) return;
    const state = searchEditorState;
    const { nameInput, saveBtn, lockNote, terminarBtn } = searchEditorModal._refs;
    const filters = [...state.filters.entries()];
    const hasFilter = filters.length > 0;
    const allDefined = filters.every(([key, set]) => set.size > 0 || isColumnRuleActive(state.rules.get(key)));
    const hasName = nameInput.value.trim() !== '';
    const needsAssignment = state.scope === 'global';
    terminarBtn.disabled = !(hasFilter && allDefined);
    saveBtn.disabled = !(hasName && state.terminarFiltradoDone && (!needsAssignment || state.terminarAsignacionDone));
    let note = '';
    if (!hasFilter) note = t('main.savedSearchNeedFilter');
    else if (!allDefined) note = t('main.savedSearchNeedValues');
    else if (!state.terminarFiltradoDone) note = t('main.savedSearchGuardarLockedHint');
    else if (needsAssignment && !state.terminarAsignacionDone) note = t('main.arrangeGuardarLockedHintAssign');
    else if (!hasName) note = t('main.savedSearchNameRequired');
    lockNote.textContent = note;
    lockNote.hidden = !note;
}

function openSavedSearchEditor(tableId, search = null) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    ensureSearchEditorModal();
    const refs = searchEditorModal._refs;
    const editing = !!search;
    const existingKeys = new Set(searchEditorKeys(state));
    const filters = new Map();
    Object.entries(search?.filter?.columnFilters || {}).forEach(([key, values]) => {
        if (existingKeys.has(key)) filters.set(key, new Set(values));
    });
    const rules = new Map();
    Object.entries(search?.filter?.columnRules || {}).forEach(([key, rule]) => {
        if (!existingKeys.has(key) || !isColumnRuleActive(rule)) return;
        rules.set(key, {
            kind: rule.kind,
            mode: rule.kind === 'range' ? 'range' : (rule.mode || 'contains'),
            text: rule.text || '',
            from: rule.from || '',
            to: rule.to || '',
            rtype: rule.kind === 'range' ? (rule.rtype || 'date') : null,
            currency: !!rule.currency,
        });
        if (!filters.has(key)) filters.set(key, new Set());
    });
    const presentGroupKeys = [...new Set(searchEditorKeys(state).map((k) => state.groupKeys.get(k)).filter(Boolean))];
    searchEditorState = {
        tableId,
        editingId: editing ? search.id : null,
        filters,
        rules,
        terminarFiltradoDone: false,
        terminarAsignacionDone: false,
        previewApplied: false,
        restore: collectCurrentFilterSnapshot(tableId),
        expanded: new Set(),
        preservedFields: editing ? { ...(search.filter?.fields || {}) } : {},
        activeTab: presentGroupKeys[0] || COLUMN_ARRANGE_UNCLASSIFIED,
        query: '',
        scope: 'personal',
    };
    refs.titleEl.textContent = t(editing ? 'main.savedSearchEditorEditTitle' : 'main.savedSearchEditorNewTitle');
    refs.nameLabel.textContent = t(editing ? 'main.savedSearchEditorNameLabelEdit' : 'main.savedSearchEditorNameLabel');
    refs.saveBtn.textContent = t(editing ? 'main.arrangeSaveChanges' : 'main.savedSearchSaveBtn');
    refs.nameInput.value = editing ? search.name : '';
    refs.searchInput.value = '';
    refs.errorEl.hidden = true;
    // Editar solo cambia nombre y filtros: alcance y audiencia se quedan.
    refs.scopeBlock.hidden = editing;
    savedViewAudienceSelection = new Map(SAVED_VIEW_AUDIENCE_GROUPS.map((g) => [g.key, new Map()]));
    refs.adminSection.hidden = isSaasTableKey(tableId) ? !currentUser?.isSaasSuperAdmin : !currentUser?.isClientAdmin;
    refs.audiencePanel.hidden = true;
    refs.applied.hidden = true;
    refs.terminarAsignacionBtn.hidden = true;
    searchEditorModal.querySelectorAll('input[name="saved-search-audience"]').forEach((r) => { r.checked = r.value === 'self'; });

    renderSearchEditorTabs();
    renderSearchEditorRows();
    renderSearchEditorFilters();
    searchEditorModal.querySelector('.modal-panel').scrollTop = 0;
    searchEditorModal.hidden = false;
}

// Lo que el editor tiene armado, en el formato que se guarda y se aplica.
function collectSearchEditorFilter() {
    const { tableId, filters, rules } = searchEditorState;
    const columnFilters = {};
    const columnRules = {};
    filters.forEach((set, key) => {
        const { values, rule } = resolveDraftFilter(tableId, key, set, rules.get(key));
        if (rule) columnRules[key] = rule;
        if (values.length) columnFilters[key] = values;
    });
    return { columnFilters, columnRules };
}

// El filtro de una columna a partir de su borrador (casillas + regla): lo que
// se guarda y se aplica. Si ya marcó todo lo que la regla deja pasar, las
// casillas sobran y dejarían fuera a lo que llegue después.
function resolveDraftFilter(tableId, key, set, draft) {
    let values = [...set];
    let rule = null;
    if (isColumnRuleActive(draft)) {
        const keepBound = (v) => (rangeSortKey(draft.rtype, v) !== null ? String(v).trim() : '');
        rule = draft.kind === 'range'
            ? {
                kind: 'range', rtype: draft.rtype || 'date', from: keepBound(draft.from), to: keepBound(draft.to),
                ...(draft.currency ? { currency: true } : {}),
            }
            : { kind: 'text', mode: draft.mode || 'contains', text: String(draft.text).trim() };
        const matching = getColumnDistinctValues(tableId, key).filter((v) => columnRuleMatches(rule, v));
        if (values.length && matching.every((v) => set.has(v))) values = [];
    }
    return { values, rule };
}

// Un doble clic en Guardar mandaba dos veces la misma búsqueda: mientras una
// se guarda, el botón queda apagado y otro clic no hace nada.
let savedSearchSaving = false;
async function saveSavedSearch() {
    if (savedSearchSaving) return;
    savedSearchSaving = true;
    searchEditorModal._refs.saveBtn.disabled = true;
    try {
        await submitSavedSearch();
    } finally {
        savedSearchSaving = false;
        // Si falló, el editor sigue abierto y el botón vuelve a lo que le toca.
        if (searchEditorState) updateSearchEditorGating();
    }
}

async function submitSavedSearch() {
    const { nameInput, errorEl } = searchEditorModal._refs;
    const { tableId, editingId, preservedFields } = searchEditorState;
    errorEl.hidden = true;
    const name = nameInput.value.trim();
    if (!name) {
        errorEl.textContent = t('main.savedSearchNameRequired');
        errorEl.hidden = false;
        return;
    }
    const { columnFilters, columnRules } = collectSearchEditorFilter();
    const filter = { fields: preservedFields, columnFilters, columnRules };
    const showError = (message) => { errorEl.textContent = message; errorEl.hidden = false; };
    const finish = (saved) => {
        // Queda aplicada: la tabla ya se ve filtrada y el nombre se escribe en el icono.
        closeSavedSearchEditor(true);
        applySavedSearch(tableId, saved);
        showToast(t('main.changeSaved'), 'success');
    };

    if (editingId) {
        try {
            const res = await fetch(`${savedSearchApiBase(tableId)}/${editingId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ name, filter }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                showError(body?.message || t('admin.saveError'));
                return;
            }
            finish((await res.json()).search);
        } catch {
            showError(t('admin.saveError'));
        }
        return;
    }

    const isSaasTable = isSaasTableKey(tableId);
    const canAssign = isSaasTable ? !!currentUser?.isSaasSuperAdmin : !!currentUser?.isClientAdmin;
    const isAssign = searchEditorModal.querySelector('input[name="saved-search-audience"][value="assign"]')?.checked;
    const scope = (canAssign && isAssign) ? 'global' : 'personal';
    let audience;
    if (scope === 'global') {
        if (isSaasTable) {
            audience = { userIds: [...savedViewAudienceSelection.get('userIds').keys()] };
            if (!audience.userIds.length) {
                showError(t('main.savedSearchAudienceSummaryEmptySaas'));
                return;
            }
        } else {
            audience = {};
            SAVED_VIEW_AUDIENCE_GROUPS.forEach((group) => {
                const groupMap = savedViewAudienceSelection.get(group.key);
                if (!groupMap.size) return;
                if (group.key === 'userIds') audience.userIds = [...groupMap.keys()];
                else audience[group.key] = [...groupMap.entries()].map(([id, exceptSet]) => ({ id, exceptUserIds: [...exceptSet] }));
            });
            if (!audience.userIds?.length && !audience.jobPositions?.length && !audience.costCenters?.length) {
                showError(t('main.savedSearchAudienceSummaryEmpty'));
                return;
            }
        }
    }
    try {
        const res = await fetch(savedSearchApiBase(tableId), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ tableKey: tableId, name, filter, scope, audience }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            showError(body?.message || t('admin.saveError'));
            return;
        }
        finish((await res.json()).search);
    } catch {
        showError(t('admin.saveError'));
    }
}

// Zoom toolbar sits right before the wrapper (insertAdjacentElement
// 'beforebegin'), and the filter-bar (when the page has one) sits right
// before THAT -- see renderDataTableColumnControls above. Reusing
// dataTableColumnState's own stored wrapper reference instead of
// re-querying the DOM by tableId.
function getSavedSearchFilterBar(tableId) {
    const state = dataTableColumnState.get(tableId);
    const zoomBar = state?.wrapper?.previousElementSibling;
    if (!zoomBar?.classList?.contains('data-table-zoom')) return null;
    const bar = zoomBar.previousElementSibling;
    return bar?.classList?.contains('filter-bar') ? bar : null;
}

// Pone estos filtros por columna en la tabla (los que ya no existan se
// ignoran) y marca los encabezados que quedan filtrados.
function setTableColumnFilters(tableId, columnFilters, columnRules) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    const existingKeys = new Set(getDataTableColumnKeys(state.table));
    const newFilters = new Map();
    Object.entries(columnFilters || {}).forEach(([key, values]) => {
        if (existingKeys.has(key)) newFilters.set(key, new Set(values));
    });
    const newRules = new Map();
    Object.entries(columnRules || {}).forEach(([key, rule]) => {
        if (existingKeys.has(key) && isColumnRuleActive(rule)) newRules.set(key, { ...rule });
    });
    setTableColumnFilterMaps(tableId, newFilters, newRules);
}

// Lo mismo, ya con los Maps armados. Los borradores del panel del embudo se
// sueltan: lo aplicado manda y se vuelven a leer de ahí.
function setTableColumnFilterMaps(tableId, newFilters, newRules) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    state.columnFilters = newFilters;
    state.columnRules = newRules;
    state.panelDrafts?.clear();
    applyColumnValueFilters(tableId);
    getHeaderRow(state.table).querySelectorAll('th[data-col]').forEach((th) => {
        updateColumnFilterIndicator(th, newFilters.has(th.dataset.col) || newRules.has(th.dataset.col));
    });
}

// Filas de la tabla que se ven con los filtros por columna puestos.
function countVisibleTableRows(tableId) {
    const state = dataTableColumnState.get(tableId);
    const rows = Array.from(state?.table.tBodies[0]?.rows || []).filter((tr) => !tr.querySelector('td.data-table-empty-cell'));
    return { shown: rows.filter((tr) => !tr.classList.contains('data-table-row-col-filtered')).length, total: rows.length };
}

function collectCurrentFilterSnapshot(tableId) {
    const fields = {};
    getSavedSearchFilterBar(tableId)?.querySelectorAll('input[id], select[id]').forEach((el) => { fields[el.id] = el.value; });
    const columnFilters = {};
    dataTableColumnState.get(tableId)?.columnFilters.forEach((set, key) => { columnFilters[key] = [...set]; });
    const columnRules = {};
    dataTableColumnState.get(tableId)?.columnRules.forEach((rule, key) => { columnRules[key] = { ...rule }; });
    return { fields, columnFilters, columnRules };
}

// Replays a saved snapshot: sets each .filter-bar field by id (skipping
// any that no longer exist) and dispatches the same data-table:filter-apply
// event the page's own "Buscar" button fires, then rebuilds columnFilters
// for whichever columns still exist today -- a column renamed/removed since
// this was saved just drops out silently rather than erroring.
function applySavedSearch(tableId, search) {
    const filterBar = getSavedSearchFilterBar(tableId);
    const usesPanel = Object.values(search.filter?.fields || {}).some((v) => v !== '' && v != null);
    if (filterBar) {
        // Parte de cero: lo que hubiera en el panel de arriba no se mezcla con
        // lo que esta búsqueda guardó.
        filterBar.querySelectorAll('input[id], select[id]').forEach((el) => {
            if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = '';
        });
        Object.entries(search.filter?.fields || {}).forEach(([id, value]) => {
            const el = filterBar.querySelector(`#${CSS.escape(id)}`);
            if (el) el.value = value;
        });
        filterBar.dispatchEvent(new CustomEvent('data-table:filter-apply'));
        if (usesPanel) filterBar.classList.add('filter-bar-expanded');
    }
    const state = dataTableColumnState.get(tableId);
    if (state) {
        setTableColumnFilters(tableId, search.filter?.columnFilters, search.filter?.columnRules);
        if (usesPanel) state.wrapper?.previousElementSibling?.querySelector('[data-col-action="filter"]')?.setAttribute('aria-expanded', 'true');
        if (usesPanel) renderPanelColumnFilters(tableId);
    }
    sizeDataTableWrappers();
    setActiveSavedSearch(tableId, search);
    refreshSavedSearchPillForTable(tableId);
}

// Shared by Búsqueda Guardada AND Acomodo Guardado from here down -- see
// SAVED_VIEW_AUDIENCE_GROUPS/savedViewAudienceCatalog/
// savedViewAudienceSelection above.
async function fetchSavedViewAudienceCatalog() {
    if (savedViewAudienceCatalog) return savedViewAudienceCatalog;
    try {
        const [usersRes, jpRes, ccRes] = await Promise.all([
            fetch('/api/business/users', { credentials: 'include' }),
            fetch('/api/business/job-positions', { credentials: 'include' }),
            fetch('/api/business/cost-centers', { credentials: 'include' }),
        ]);
        const [usersData, jpData, ccData] = await Promise.all([usersRes.json(), jpRes.json(), ccRes.json()]);
        savedViewAudienceCatalog = {
            userIds: (usersData.users || []).map((u) => ({ id: u.id, label: u.name || u.username })),
            jobPositions: (jpData.jobPositions || []).map((jp) => ({ id: jp.id, label: jp.name })),
            costCenters: (ccData.costCenters || []).map((cc) => ({ id: cc.id, label: `${cc.code} - ${cc.name}` })),
        };
    } catch {
        savedViewAudienceCatalog = { userIds: [], jobPositions: [], costCenters: [] };
    }
    return savedViewAudienceCatalog;
}

// 3-state "seleccionar todos" rollup per group -- same indeterminate-dash
// convention the permission tree's own container checkboxes use: checked
// only if EVERY option is on, a dash the moment even one is missing.
function updateSavedViewGroupAllCheckbox(group, options, allCb) {
    const groupMap = savedViewAudienceSelection.get(group.key);
    const onCount = options.filter((opt) => groupMap.has(opt.id)).length;
    allCb.checked = onCount > 0 && onCount === options.length;
    allCb.indeterminate = onCount > 0 && onCount < options.length;
}

// One exclusion block per currently-selected chip in an excludable group --
// each keeps its own independent "excepto" list of users.
function renderSavedViewExclusions(group, options, container) {
    const groupMap = savedViewAudienceSelection.get(group.key);
    const users = savedViewAudienceCatalog?.userIds || [];
    container.innerHTML = '';
    options.filter((opt) => groupMap.has(opt.id)).forEach((opt) => {
        const exceptSet = groupMap.get(opt.id);
        const block = document.createElement('div');
        block.className = 'saved-view-exclude-block';

        const label = document.createElement('div');
        label.className = 'saved-view-exclude-label';
        const strong = document.createElement('b');
        strong.textContent = opt.label;
        label.appendChild(strong);
        label.appendChild(document.createTextNode(' ' + t('main.savedSearchAudienceExceptLabel')));
        block.appendChild(label);

        const chipsEl = document.createElement('div');
        chipsEl.className = 'saved-view-chips';
        users.forEach((u) => {
            const chip = document.createElement('label');
            chip.className = 'saved-view-chip saved-view-chip-exclude';
            chip.classList.toggle('saved-view-chip-on', exceptSet.has(u.id));
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = exceptSet.has(u.id);
            chip.appendChild(cb);
            chip.appendChild(document.createTextNode(' ' + u.label));
            chip.addEventListener('click', (event) => {
                event.preventDefault();
                if (exceptSet.has(u.id)) exceptSet.delete(u.id); else exceptSet.add(u.id);
                cb.checked = exceptSet.has(u.id);
                chip.classList.toggle('saved-view-chip-on', exceptSet.has(u.id));
            });
            chipsEl.appendChild(chip);
        });
        block.appendChild(chipsEl);
        container.appendChild(block);
    });
}

function updateSavedViewAudienceSummary(summaryEl) {
    const catalog = savedViewAudienceCatalog;
    const parts = [];
    SAVED_VIEW_AUDIENCE_GROUPS.forEach((group) => {
        const groupMap = savedViewAudienceSelection.get(group.key);
        const options = catalog?.[group.key] || [];
        groupMap.forEach((exceptSet, id) => {
            const opt = options.find((o) => o.id === id);
            if (!opt) return;
            if (exceptSet.size) {
                const exceptLabels = [...exceptSet].map((uid) => catalog.userIds.find((u) => u.id === uid)?.label).filter(Boolean);
                parts.push(`${opt.label} (${t('main.savedSearchAudienceExcept')} ${exceptLabels.join(', ')})`);
            } else {
                parts.push(opt.label);
            }
        });
    });
    summaryEl.textContent = parts.length ? `${t('main.savedSearchAudienceWillSee')} ${parts.join(', ')}` : t('main.savedSearchAudienceSummaryEmpty');
}

// Renders into `panelEl` (either feature's own audience-panel element) --
// the only thing that differs between Búsqueda Guardada and Acomodo
// Guardado's audience pickers is which DOM node they live in.
async function buildSavedViewAudiencePanel(panelEl) {
    const catalog = await fetchSavedViewAudienceCatalog();
    panelEl.innerHTML = '';
    const summaryEl = document.createElement('p');
    summaryEl.className = 'saved-view-audience-summary';

    SAVED_VIEW_AUDIENCE_GROUPS.forEach((group) => {
        const options = catalog[group.key] || [];
        const groupEl = document.createElement('div');
        groupEl.className = 'saved-view-audience-group';

        const groupLabel = document.createElement('label');
        groupLabel.className = 'saved-view-audience-group-label';
        const allCb = document.createElement('input');
        allCb.type = 'checkbox';
        groupLabel.appendChild(allCb);
        groupLabel.appendChild(document.createTextNode(' ' + t(group.labelKey)));
        groupEl.appendChild(groupLabel);

        const chipsEl = document.createElement('div');
        chipsEl.className = 'saved-view-chips';
        const exclusionsEl = group.excludable ? document.createElement('div') : null;
        if (exclusionsEl) exclusionsEl.className = 'saved-view-exclusions';

        options.forEach((opt) => {
            const chip = document.createElement('label');
            chip.className = 'saved-view-chip';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            chip.appendChild(cb);
            chip.appendChild(document.createTextNode(' ' + opt.label));
            chip.addEventListener('click', (event) => {
                event.preventDefault();
                const groupMap = savedViewAudienceSelection.get(group.key);
                if (groupMap.has(opt.id)) groupMap.delete(opt.id); else groupMap.set(opt.id, new Set());
                cb.checked = groupMap.has(opt.id);
                chip.classList.toggle('saved-view-chip-on', groupMap.has(opt.id));
                if (exclusionsEl) renderSavedViewExclusions(group, options, exclusionsEl);
                updateSavedViewGroupAllCheckbox(group, options, allCb);
                updateSavedViewAudienceSummary(summaryEl);
            });
            chipsEl.appendChild(chip);
        });
        groupEl.appendChild(chipsEl);
        if (exclusionsEl) groupEl.appendChild(exclusionsEl);

        allCb.addEventListener('click', (event) => {
            event.preventDefault();
            const groupMap = savedViewAudienceSelection.get(group.key);
            const allOn = options.every((opt) => groupMap.has(opt.id));
            chipsEl.querySelectorAll('.saved-view-chip').forEach((chip, i) => {
                const opt = options[i];
                const cb = chip.querySelector('input');
                if (allOn) { groupMap.delete(opt.id); cb.checked = false; chip.classList.remove('saved-view-chip-on'); }
                else { groupMap.set(opt.id, new Set()); cb.checked = true; chip.classList.add('saved-view-chip-on'); }
            });
            if (exclusionsEl) renderSavedViewExclusions(group, options, exclusionsEl);
            updateSavedViewGroupAllCheckbox(group, options, allCb);
            updateSavedViewAudienceSummary(summaryEl);
        });

        panelEl.appendChild(groupEl);
    });

    panelEl.appendChild(summaryEl);
    updateSavedViewAudienceSummary(summaryEl);
}

// SaaS-side audience panel -- buildSavedViewAudiencePanel's catalog comes
// from /api/business/* (users/job-positions/cost-centers), all clientId-
// scoped and therefore unreachable for a SaaS-admin account, so this is a
// deliberate, separate, much smaller sibling: one flat group (Equipo SaaS
// members), no exclusions, no puestos/centros de costo (neither concept
// exists on this side). Still writes into the SAME savedViewAudienceSelection
// 'userIds' map, so hasAnyAudienceTarget/the "Terminar Asignación" gate
// work unchanged either way.
let saasLayoutAudienceCatalog = null;
async function fetchSaasLayoutAudienceCatalog() {
    if (saasLayoutAudienceCatalog) return saasLayoutAudienceCatalog;
    try {
        const res = await fetch('/api/admin/saas-users', { credentials: 'include' });
        const data = res.ok ? await res.json() : { users: [] };
        saasLayoutAudienceCatalog = (data.users || []).map((u) => ({ id: u.id, label: u.name || u.username }));
    } catch {
        saasLayoutAudienceCatalog = [];
    }
    return saasLayoutAudienceCatalog;
}

async function buildSaasLayoutAudiencePanel(panelEl) {
    const options = await fetchSaasLayoutAudienceCatalog();
    panelEl.innerHTML = '';
    const groupMap = savedViewAudienceSelection.get('userIds');
    const summaryEl = document.createElement('p');
    summaryEl.className = 'saved-view-audience-summary';
    const updateSummary = () => {
        const labels = [...groupMap.keys()].map((id) => options.find((o) => o.id === id)?.label).filter(Boolean);
        summaryEl.textContent = labels.length ? `${t('main.savedSearchAudienceWillSee')} ${labels.join(', ')}` : t('main.savedSearchAudienceSummaryEmptySaas');
    };

    const chipsEl = document.createElement('div');
    chipsEl.className = 'saved-view-chips';
    options.forEach((opt) => {
        const chip = document.createElement('label');
        chip.className = 'saved-view-chip' + (groupMap.has(opt.id) ? ' saved-view-chip-on' : '');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = groupMap.has(opt.id);
        chip.appendChild(cb);
        chip.appendChild(document.createTextNode(' ' + opt.label));
        chip.addEventListener('click', (event) => {
            event.preventDefault();
            if (groupMap.has(opt.id)) groupMap.delete(opt.id); else groupMap.set(opt.id, new Set());
            cb.checked = groupMap.has(opt.id);
            chip.classList.toggle('saved-view-chip-on', groupMap.has(opt.id));
            updateSummary();
        });
        chipsEl.appendChild(chip);
    });
    panelEl.appendChild(chipsEl);
    panelEl.appendChild(summaryEl);
    updateSummary();
}

// --- Acomodo Guardado ------------------------------------------------------
// Búsqueda Guardada's sibling -- same modal/list/admin-audience pattern
// (SavedView* functions above are the actual shared code), saving/applying
// a table's own column order/hidden/pinned/widths (state.config) instead of
// a filter snapshot. A layout can also be marked "default al abrir" -- see
// maybeApplyDefaultSavedLayout, wired in once per table at the bottom of
// the init loop above.
let savedLayoutModal = null;
let savedLayoutErrorEl = null;
let savedLayoutNameInput = null;
let savedLayoutAdminSection = null;
let savedLayoutAudiencePanel = null;
let savedLayoutDefaultCheckbox = null;
let savedLayoutSaveBtn = null;
let savedLayoutTableId = null;

// La lista de acomodos guardados ya no vive en este modal: la dibuja el
// menú que cuelga del icono (renderSavedLayoutMenu), y este modal solo
// crea o edita uno (openColumnArrangeEditor).

// Whether this account can reach the server that actually persists a
// named Acomodo Guardado for this table -- client accounts always can
// (saved_layouts.client_id); SaaS-admin accounts can too, but only for the
// 3 internal tables saas_saved_layouts/the mirrored /api/admin/saas-saved-
// layouts routes actually cover (SAAS_TABLE_ICON_SCREENS). Without this
// gate the "Guardar como..." block would render and 404 on save, same
// production bug this session already fixed once for the old
// iconSavedLayout/iconSavedSearch toolbar buttons.
function canPersistSavedLayout(tableId) {
    return !!currentUser?.clientId || isSaasTableKey(tableId);
}

// Which backend namespace owns a table's saved layouts -- client tables
// keep using /api/business/saved-layouts (clientId-scoped); the 3 SaaS-
// internal tables use the separate, non-clientId-scoped
// /api/admin/saas-saved-layouts (see saas_saved_layouts' own schema
// comment in db.js for why this is a sibling table, not a shared one).
function savedLayoutApiBase(tableId) {
    return isSaasTableKey(tableId) ? '/api/admin/saas-saved-layouts' : '/api/business/saved-layouts';
}

// Snapshot of state.config's own order/hidden/pinned/widths -- no
// "signature" (see db.js's saved_layouts schema comment and
// reconcileDataTableConfig, which recomputes one fresh at apply time).
function collectCurrentLayoutSnapshot(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return { order: [], hidden: [], pinned: [], widths: {} };
    const { order, hidden, pinned, widths } = state.config;
    return { order: [...order], hidden: [...hidden], pinned: [...pinned], widths: { ...widths } };
}

// The actual "apply" primitive -- reconcile + saveDataTableConfig +
// applyDataTableColumnLayout, the same call "Terminar Acomodo"/drag-reorder/
// resize already make after mutating state.config, so this writes through
// to localStorage and survives a reload exactly like any manual
// rearrangement. Shared by the saved-layout menu, "Terminar Acomodo" and
// maybeApplyDefaultSavedLayout, which calls it without any modal or menu
// ever having been opened.
function applyColumnLayoutConfig(tableId, rawLayout) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    state.config = reconcileDataTableConfig(rawLayout, state.columnKeys);
    state.columnKeys.forEach((key) => {
        if (state.config.widths[key] == null) state.config.widths[key] = state.naturalWidths[key] || DATA_TABLE_COL_MIN_WIDTH;
    });
    saveDataTableConfig(tableId, state.config);
    applyDataTableColumnLayout(tableId);
}

// Mismo candado que saveSavedSearch: un doble clic no guarda dos acomodos.
let savedLayoutSaving = false;
async function saveSavedLayout() {
    if (savedLayoutSaving) return;
    savedLayoutSaving = true;
    savedLayoutSaveBtn.disabled = true;
    try {
        await submitSavedLayout();
    } finally {
        savedLayoutSaving = false;
        if (columnArrangeState) updateColumnArrangeGating();
    }
}

async function submitSavedLayout() {
    savedLayoutErrorEl.hidden = true;
    const name = savedLayoutNameInput.value.trim();
    if (!name) {
        savedLayoutErrorEl.textContent = t('main.savedLayoutNameRequired');
        savedLayoutErrorEl.hidden = false;
        return;
    }
    // Editar un acomodo existente: solo nombre + columnas (el servidor deja
    // su alcance, audiencia y default como estaban).
    if (columnArrangeState?.editingId) {
        try {
            const res = await fetch(`${savedLayoutApiBase(savedLayoutTableId)}/${columnArrangeState.editingId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ name, layout: collectCurrentLayoutSnapshot(savedLayoutTableId) }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                savedLayoutErrorEl.textContent = body?.message || t('admin.saveError');
                savedLayoutErrorEl.hidden = false;
                return;
            }
            // The table is already showing this layout (Terminar Acomodo
            // applied it), so it becomes the one written on the icon.
            const { layout: updated } = await res.json();
            setActiveSavedLayout(savedLayoutTableId, updated);
            refreshSavedLayoutPillForTable(savedLayoutTableId);
            closeColumnArrangeModal();
            showToast(t('main.changeSaved'), 'success');
        } catch {
            savedLayoutErrorEl.textContent = t('admin.saveError');
            savedLayoutErrorEl.hidden = false;
        }
        return;
    }
    const isSaasTable = isSaasTableKey(savedLayoutTableId);
    const canAssign = isSaasTable ? !!currentUser?.isSaasSuperAdmin : !!currentUser?.isClientAdmin;
    const isAssign = savedLayoutModal.querySelector('input[name="saved-layout-audience"][value="assign"]')?.checked;
    const scope = (canAssign && isAssign) ? 'global' : 'personal';
    let audience;
    if (scope === 'global') {
        if (isSaasTable) {
            // SaaS side: one flat group (Equipo SaaS members), no puestos/
            // centros de costo -- see buildSaasLayoutAudiencePanel.
            audience = { userIds: [...savedViewAudienceSelection.get('userIds').keys()] };
            if (!audience.userIds.length) {
                savedLayoutErrorEl.textContent = t('main.savedSearchAudienceSummaryEmptySaas');
                savedLayoutErrorEl.hidden = false;
                return;
            }
        } else {
            audience = {};
            SAVED_VIEW_AUDIENCE_GROUPS.forEach((group) => {
                const groupMap = savedViewAudienceSelection.get(group.key);
                if (!groupMap.size) return;
                if (group.key === 'userIds') audience.userIds = [...groupMap.keys()];
                else audience[group.key] = [...groupMap.entries()].map(([id, exceptSet]) => ({ id, exceptUserIds: [...exceptSet] }));
            });
            if (!audience.userIds?.length && !audience.jobPositions?.length && !audience.costCenters?.length) {
                savedLayoutErrorEl.textContent = t('main.savedSearchAudienceSummaryEmpty');
                savedLayoutErrorEl.hidden = false;
                return;
            }
        }
    }
    const layout = collectCurrentLayoutSnapshot(savedLayoutTableId);
    try {
        const res = await fetch(savedLayoutApiBase(savedLayoutTableId), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ tableKey: savedLayoutTableId, name, layout, scope, isDefault: savedLayoutDefaultCheckbox.checked, audience }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            savedLayoutErrorEl.textContent = body?.message || t('admin.saveError');
            savedLayoutErrorEl.hidden = false;
            return;
        }
        const { layout: created } = await res.json();
        setActiveSavedLayout(savedLayoutTableId, created);
        refreshSavedLayoutPillForTable(savedLayoutTableId);
        closeColumnArrangeModal();
        showToast(t('main.changeSaved'), 'success');
    } catch {
        savedLayoutErrorEl.textContent = t('admin.saveError');
        savedLayoutErrorEl.hidden = false;
    }
}

// Fired once per table, only on a genuine first-ever visit on this device
// (see hadNoStoredLayout in the init loop above) -- never gated by
// resolveIconGrant('iconSavedLayout'): a profile without that icon (can't
// manage layouts) should still receive whatever default the admin
// assigned -- the icon only gates being able to browse/save/delete them.
// The server's own list already filters to what THIS user can see, so a
// personal default (if the user happens to already have one) wins over a
// global one, matching the plan's stated precedence.
async function maybeApplyDefaultSavedLayout(tableId) {
    try {
        const res = await fetch(`${savedLayoutApiBase(tableId)}/${encodeURIComponent(tableId)}`, { credentials: 'include' });
        if (!res.ok) return;
        const { layouts } = await res.json();
        const personalDefault = (layouts || []).find((l) => l.scope === 'personal' && l.isDefault);
        const globalDefault = (layouts || []).find((l) => l.scope === 'global' && l.isDefault);
        const winner = personalDefault || globalDefault;
        if (winner) {
            applyColumnLayoutConfig(tableId, winner.layout);
            setActiveSavedLayout(tableId, winner);
            refreshSavedLayoutPillForTable(tableId);
        }
    } catch {
        // No default reachable -- the table keeps whatever loadDataTableConfig already rendered.
    }
}

// Color legend modal — one row for the row-editable green tint (universal,
// every table has it) plus one row per column classification actually
// present on THIS table (read from state.groupKeys, so a table with no
// classifications yet just shows the row-editable entry). Adding a future
// classification only means one more entry here, keyed by the same
// labelKey already used for its data-group attribute in the HTML.
const COLUMN_GROUP_META = {
    'menu.classControlInterno': { swatch: 'var(--color-column-system-band-bg)', descKey: 'main.classControlInternoDesc' },
    'main.reportColBase': { swatch: 'var(--color-report-base-band-bg)', descKey: 'main.reportColBaseDesc' },
    'main.reportColCalc': { swatch: 'var(--color-report-calc-band-bg)', descKey: 'main.reportColCalcDesc' },
};

let columnLegendModal = null;
let columnLegendList = null;

function ensureColumnLegendModal() {
    if (columnLegendModal) return;
    columnLegendModal = document.createElement('div');
    columnLegendModal.className = 'modal-overlay';
    columnLegendModal.hidden = true;
    columnLegendModal.innerHTML = `
        <div class="modal-panel" style="max-width: 36rem;" role="dialog" aria-modal="true" aria-labelledby="data-table-legend-title">
            <h3 id="data-table-legend-title">${t('main.columnLegendTitle')}</h3>
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>${t('main.columnLegendColor')}</th>
                            <th>${t('main.columnLegendClassification')}</th>
                            <th>${t('main.columnLegendDescription')}</th>
                        </tr>
                    </thead>
                    <tbody data-role="list"></tbody>
                </table>
            </div>
            <div class="admin-form-actions" style="margin-top: 1.25rem;">
                <button type="button" class="btn btn-secondary" data-role="close">${t('admin.cancel')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(columnLegendModal);
    columnLegendList = columnLegendModal.querySelector('[data-role="list"]');
    const close = () => { columnLegendModal.hidden = true; };
    columnLegendModal.querySelector('[data-role="close"]').addEventListener('click', close);
    wireModalDismiss(columnLegendModal, close);
}

function buildLegendRow(swatchColor, name, desc) {
    const tr = document.createElement('tr');
    const swatchTd = document.createElement('td');
    const swatch = document.createElement('span');
    swatch.className = 'data-table-legend-swatch';
    swatch.style.backgroundColor = swatchColor;
    swatchTd.appendChild(swatch);
    const nameTd = document.createElement('td');
    nameTd.textContent = name;
    const descTd = document.createElement('td');
    descTd.textContent = desc;
    tr.append(swatchTd, nameTd, descTd);
    return tr;
}

function openColumnLegend(tableId) {
    ensureColumnLegendModal();
    columnLegendModal.hidden = false;
    columnLegendList.innerHTML = '';
    columnLegendList.appendChild(buildLegendRow('#2c8f4a', t('main.rowEditableName'), t('main.rowEditableLegend')));
    const state = dataTableColumnState.get(tableId);
    const seenGroups = new Set();
    // Every classification actually present on this table, not just the 3
    // hardcoded in COLUMN_GROUP_META (Control Interno, the 2 report-column
    // bands) -- a real or custom classification with only an Árbol de
    // Permisos Maestro-chosen color/label used to be silently left out of
    // this legend entirely.
    (state?.groupKeys ? Array.from(state.groupKeys.values()) : []).forEach((groupKey) => {
        if (!groupKey || seenGroups.has(groupKey)) return;
        seenGroups.add(groupKey);
        const desc = COLUMN_GROUP_META[groupKey] ? t(COLUMN_GROUP_META[groupKey].descKey) : '';
        columnLegendList.appendChild(buildLegendRow(columnGroupColor(groupKey), resolveGroupLabel(groupKey), desc));
    });
}

// Adds the 3 new toolbar buttons into the SAME .data-table-zoom bar that
// renderDataTableZoomControls() already inserts (must run after it), then
// lazily boots column management for each table the first time it reports
// a nonzero width — see initDataTableColumns for why that's deferred.
function renderDataTableColumnControls() {
    document.querySelectorAll('.data-table-wrapper').forEach((wrapper, index) => {
        const zoom = wrapper.previousElementSibling;
        // A page may hand-place a button of its own in the bar (Equipo SaaS
        // has its own "history" -- see Admin-EquipoSaaS.html); the generic
        // icons still fill in around it, skipping only an action that's
        // already there. Buttons added here carry data-col-injected so a
        // later call doesn't add them twice.
        if (zoom?.classList?.contains('data-table-zoom') && !zoom.querySelector('[data-col-injected]')) {
            const tableKey = getTableId(wrapper, index);
            const toAppend = [];
            const existingActions = new Set(Array.from(zoom.querySelectorAll('[data-col-action]')).map((b) => b.dataset.colAction));
            const addControls = (nodes) => {
                nodes.forEach((node) => {
                    const btn = node.matches('[data-col-action]') ? node : node.querySelector('[data-col-action]');
                    const action = btn?.dataset.colAction;
                    if (action && existingActions.has(action)) return;
                    if (btn) btn.dataset.colInjected = '1';
                    zoom.append(node);
                    if (action) existingActions.add(action);
                });
            };

            if (resolveIconGrant(tableKey, 'iconPin')) {
                const pinBtn = document.createElement('button');
                pinBtn.type = 'button';
                pinBtn.className = 'data-table-zoom-btn';
                pinBtn.dataset.colAction = 'pin';
                pinBtn.setAttribute('aria-label', t('main.pinColumns'));
                pinBtn.title = t('main.pinColumns');
                pinBtn.innerHTML = '<i class="bx bx-pin" aria-hidden="true"></i>';
                pinBtn.addEventListener('click', () => openPinPicker(getTableId(wrapper, index)));
                toAppend.push(pinBtn);
            }

            if (resolveIconGrant(tableKey, 'iconVisibility')) {
                const visBtn = document.createElement('button');
                visBtn.type = 'button';
                visBtn.className = 'data-table-zoom-btn';
                visBtn.dataset.colAction = 'visibility';
                visBtn.setAttribute('aria-label', t('main.columnVisibility'));
                visBtn.title = t('main.columnVisibility');
                visBtn.innerHTML = '<i class="bx bx-show" aria-hidden="true"></i>';
                visBtn.addEventListener('click', () => openVisibilityPicker(getTableId(wrapper, index)));
                toAppend.push(visBtn);
            }

            if (resolveIconGrant(tableKey, 'iconHistory')) {
                const historyBtn = document.createElement('button');
                historyBtn.type = 'button';
                historyBtn.className = 'data-table-zoom-btn';
                historyBtn.dataset.colAction = 'history';
                historyBtn.setAttribute('aria-label', t('main.changeHistory'));
                historyBtn.title = t('main.changeHistory');
                historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
                historyBtn.addEventListener('click', () => openChangeHistory(getTableId(wrapper, index)));
                toAppend.push(historyBtn);
            }

            if (resolveIconGrant(tableKey, 'iconLegend')) {
                const legendBtn = document.createElement('button');
                legendBtn.type = 'button';
                legendBtn.className = 'data-table-zoom-btn';
                legendBtn.dataset.colAction = 'legend';
                legendBtn.setAttribute('aria-label', t('main.columnLegendBtn'));
                legendBtn.title = t('main.columnLegendBtn');
                legendBtn.innerHTML = '<span class="data-table-legend-icon" aria-hidden="true"><span></span><span></span><span></span></span>';
                legendBtn.addEventListener('click', () => openColumnLegend(getTableId(wrapper, index)));
                toAppend.push(legendBtn);
            }

            // Client accounts (saved_searches, scoped by client) and the internal
            // SaaS tables (saas_saved_searches) -- see canPersistSavedSearch. Any
            // other table would render the icon and 404 on save.
            if (canPersistSavedSearch(tableKey) && resolveIconGrant(tableKey, 'iconSavedSearch')) {
                const savedSearchBtn = document.createElement('button');
                savedSearchBtn.type = 'button';
                savedSearchBtn.className = 'data-table-zoom-btn';
                savedSearchBtn.dataset.colAction = 'saved-search';
                savedSearchBtn.setAttribute('aria-label', t('main.savedSearchBtn'));
                savedSearchBtn.title = t('main.savedSearchBtn');
                savedSearchBtn.innerHTML = '<i class="bx bx-bookmark" aria-hidden="true"></i>';
                // Mismo armado que la píldora de Acomodo Guardado: el icono +
                // un buscador escondido a su derecha, el nombre de la búsqueda
                // aplicada y la ✕ que la limpia.
                const searchPill = document.createElement('span');
                searchPill.className = 'data-table-search-pill';
                searchPill.dataset.pillTableId = tableKey; // NO data-table-id: choca con el de la tabla
                const searchName = document.createElement('span');
                searchName.className = 'data-table-layout-pill-name';
                searchName.dataset.helpKey = 'savedSearch';
                searchName.hidden = true;
                searchName.addEventListener('click', () => toggleSavedSearchMenu(tableKey, searchPill));
                const searchClear = document.createElement('button');
                searchClear.type = 'button';
                searchClear.className = 'data-table-layout-pill-clear';
                searchClear.dataset.helpKey = 'clearSearch';
                searchClear.setAttribute('aria-label', t('main.savedSearchClearBtn'));
                searchClear.title = t('main.savedSearchClearBtn');
                searchClear.hidden = true;
                searchClear.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
                searchClear.addEventListener('click', () => clearSavedSearchForTable(tableKey));
                const searchField = document.createElement('input');
                searchField.type = 'text';
                searchField.className = 'data-table-layout-pill-input';
                searchField.placeholder = t('main.savedSearchSearchPlaceholder');
                searchField.setAttribute('aria-label', t('main.savedSearchSearchPlaceholder'));
                searchField.hidden = true;
                searchField.addEventListener('input', () => {
                    if (searchMenuState?.input !== searchField) return;
                    searchMenuState.query = searchField.value;
                    renderSavedSearchMenu();
                });
                searchPill.append(savedSearchBtn, searchName, searchField, searchClear);
                savedSearchBtn.addEventListener('click', () => toggleSavedSearchMenu(tableKey, searchPill));
                refreshSavedSearchPill(searchPill);
                // The panel's own fields (Buscar/Limpiar) change what's filtered
                // without going through applyColumnValueFilters.
                const searchFilterBar = zoom.previousElementSibling?.classList?.contains('filter-bar') ? zoom.previousElementSibling : null;
                ['data-table:filter-apply', 'data-table:filter-clear', 'input', 'change'].forEach((evt) => {
                    searchFilterBar?.addEventListener(evt, () => refreshSavedSearchPill(searchPill));
                });
                toAppend.push(searchPill);
            }

            if (canPersistSavedLayout(tableKey) && resolveIconGrant(tableKey, 'iconSavedLayout')) {
                const savedLayoutBtn = document.createElement('button');
                savedLayoutBtn.type = 'button';
                savedLayoutBtn.className = 'data-table-zoom-btn';
                savedLayoutBtn.dataset.colAction = 'saved-layout';
                savedLayoutBtn.setAttribute('aria-label', t('main.savedLayoutBtn'));
                savedLayoutBtn.title = t('main.savedLayoutBtn');
                savedLayoutBtn.innerHTML = '<i class="bx bx-columns" aria-hidden="true"></i>';
                // El icono + un buscador escondido a su derecha: al abrir el
                // menú el conjunto se estira como una píldora (ver
                // toggleSavedLayoutMenu).
                const pill = document.createElement('span');
                pill.className = 'data-table-layout-pill';
                pill.dataset.pillTableId = tableKey; // NO data-table-id: choca con el de la tabla
                const layoutName = document.createElement('span');
                layoutName.className = 'data-table-layout-pill-name';
                layoutName.dataset.helpKey = 'savedLayout';
                layoutName.hidden = true;
                layoutName.addEventListener('click', () => toggleSavedLayoutMenu(tableKey, pill));
                const layoutClear = document.createElement('button');
                layoutClear.type = 'button';
                layoutClear.className = 'data-table-layout-pill-clear';
                layoutClear.dataset.helpKey = 'clearLayout';
                layoutClear.setAttribute('aria-label', t('main.savedLayoutClearBtn'));
                layoutClear.title = t('main.savedLayoutClearBtn');
                layoutClear.hidden = true;
                layoutClear.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
                layoutClear.addEventListener('click', () => clearSavedLayoutForTable(tableKey));
                const layoutSearch = document.createElement('input');
                layoutSearch.type = 'text';
                layoutSearch.className = 'data-table-layout-pill-input';
                layoutSearch.placeholder = t('main.savedLayoutSearchPlaceholder');
                layoutSearch.setAttribute('aria-label', t('main.savedLayoutSearchPlaceholder'));
                layoutSearch.hidden = true;
                layoutSearch.addEventListener('input', () => {
                    if (layoutMenuState?.input !== layoutSearch) return;
                    layoutMenuState.query = layoutSearch.value;
                    renderSavedLayoutMenu();
                });
                pill.append(savedLayoutBtn, layoutName, layoutSearch, layoutClear);
                savedLayoutBtn.addEventListener('click', () => toggleSavedLayoutMenu(tableKey, pill));
                refreshSavedLayoutPill(pill);
                toAppend.push(pill);
            }

            // Reglas de Orden de Llenado — admin-only (it's a configuration
            // decision, same gating as creating/editing a Centro de Costos),
            // not wired into Iconos Personalización like the icons above:
            // this one isn't about what a profile can SEE, it's about who
            // can change how the table behaves for everyone.
            if (currentUser?.isClientAdmin) {
                const rulesBtn = document.createElement('button');
                rulesBtn.type = 'button';
                rulesBtn.className = 'data-table-zoom-btn';
                rulesBtn.dataset.colAction = 'field-rules';
                rulesBtn.setAttribute('aria-label', t('main.fieldRulesBtn'));
                rulesBtn.title = t('main.fieldRulesBtn');
                rulesBtn.innerHTML = '<i class="bx bx-link" aria-hidden="true"></i>';
                rulesBtn.addEventListener('click', () => openFieldRulesModal(getTableId(wrapper, index)));
                toAppend.push(rulesBtn);
            }

            addControls(toAppend);

            // Filtrar/Limpiar — only for tables that actually have a
            // .filter-bar (see the wiring block below this function for
            // filterBarExpand/filterBarClear/data-table:filter-apply/
            // data-table:filter-clear). The bar sits right before the
            // auto-inserted zoom toolbar in the HTML, so it's always
            // zoom's previous sibling at this point.
            const filterBar = zoom.previousElementSibling;
            if (filterBar?.classList?.contains('filter-bar')) {
                // Atributo propio: NO data-table-id (ver el comentario en el handler de Buscar).
                filterBar.dataset.filterTableId = tableKey;
                const filterToAppend = [];
                let filterBtn = null;
                if (resolveIconGrant(tableKey, 'iconFilter')) {
                    filterBtn = document.createElement('button');
                    filterBtn.type = 'button';
                    filterBtn.className = 'data-table-zoom-btn';
                    filterBtn.dataset.colAction = 'filter';
                    filterBtn.setAttribute('aria-label', t('main.filterToggle'));
                    filterBtn.setAttribute('aria-expanded', 'false');
                    filterBtn.title = t('main.filterToggle');
                    filterBtn.innerHTML = '<i class="bx bx-filter-alt" aria-hidden="true"></i>';
                    filterBtn.addEventListener('click', () => {
                        const expanded = filterBar.classList.toggle('filter-bar-expanded');
                        filterBtn.setAttribute('aria-expanded', String(expanded));
                        // Al abrir, los campos de columna se arman con lo que hoy
                        // está aplicado; al cerrar, se cierra cualquier lista abierta.
                        if (expanded) renderPanelColumnFilters(tableKey);
                        else closePanelPopover();
                        sizeDataTableWrappers();
                    });
                    filterToAppend.push(filterBtn);
                }

                if (resolveIconGrant(tableKey, 'iconFilterClear')) {
                    const clearBtn = document.createElement('button');
                    clearBtn.type = 'button';
                    clearBtn.className = 'data-table-zoom-btn';
                    clearBtn.dataset.colAction = 'filter-clear';
                    clearBtn.setAttribute('aria-label', t('main.filterClearBtn'));
                    clearBtn.title = t('main.filterClearBtn');
                    clearBtn.innerHTML = '<i class="bx bx-x-circle" aria-hidden="true"></i>';
                    clearBtn.addEventListener('click', () => {
                        filterBar.querySelectorAll('input').forEach((input) => { input.value = ''; });
                        filterBar.querySelectorAll('select').forEach((select) => { select.selectedIndex = 0; });
                        filterBar.classList.remove('filter-bar-expanded');
                        filterBtn?.setAttribute('aria-expanded', 'false');
                        filterBar.dispatchEvent(new CustomEvent('data-table:filter-clear'));
                        // Also resets whatever per-column value filters are
                        // active (see attachColumnFilterTrigger) — one button
                        // clears both filtering systems at once, AND puts the
                        // column layout itself (order/widths/hidden/pinned, group
                        // bands included) back to default — see
                        // resetDataTableColumnLayout.
                        const colTableId = getTableId(wrapper, index);
                        const colState = dataTableColumnState.get(colTableId);
                        if (colState) {
                            colState.columnFilters.clear();
                            colState.columnRules.clear();
                            colState.panelDrafts?.clear();
                            applyColumnValueFilters(colTableId);
                            getHeaderRow(colState.table).querySelectorAll('th.data-table-col-filter-active')
                                .forEach((th) => th.classList.remove('data-table-col-filter-active'));
                            resetDataTableColumnLayout(colTableId);
                        }
                        closeColumnFilterMenu();
                        sizeDataTableWrappers();
                    });
                    filterToAppend.push(clearBtn);
                }

                addControls(filterToAppend);
            }
        }

        if (wrapper.dataset.colObserverAttached) return;
        wrapper.dataset.colObserverAttached = '1';
        // ResizeObserver's own first callback is asynchronous (queued for
        // the next frame), so a table that's already visible with its real
        // width by this point would otherwise sit uninitialized -- no pin/
        // reorder/resize/hide, no sticky columns -- until something ELSE
        // happens to resize its wrapper later (which may never happen).
        // Confirmed live: this was silently leaving "Nuestros Clientes"
        // fully uninitialized on a normal page load. Try immediately for
        // the already-visible case; keep the observer too, for a table
        // that starts hidden (0 width, e.g. an inactive tab) and only
        // gains real size once switched to.
        if (wrapper.getBoundingClientRect().width > 0) {
            initDataTableColumns(wrapper, index);
        }
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0) {
                    initDataTableColumns(wrapper, index);
                    ro.disconnect();
                    break;
                }
            }
        });
        ro.observe(wrapper);
    });
}

// ---------------------------------------------------------------------------
// Filtro por columnas dentro del panel del embudo. El panel de siempre (los
// campos propios de cada pantalla + Buscar) se queda igual; debajo de sus
// campos se suman los de las columnas: mínimo FILTER_PANEL_MIN_FIELDS en total
// y un "Filtro avanzado" para ir agregando más, hasta todas las columnas de la
// tabla. Cada campo usa el mismo filtro del encabezado (modo + buscador +
// lista, o Desde–Hasta en fechas, horas y números), pero se APLICA con
// Buscar, junto con los campos de la pantalla; es el mismo filtro de siempre
// (state.columnFilters / columnRules), así que el encabezado y Búsqueda
// Guardada lo ven igual. Detrás de su propia hoja del árbol: iconFilterAdvanced.
const FILTER_PANEL_MIN_FIELDS = 6;
let panelPopoverEl = null;
let panelPopoverAnchor = null;
// Al agregar una columna, el panel se desplaza solo para mostrar su campo nuevo;
// ese scroll no debe cerrar el selector, que sigue abierto para agregar más.
let panelPopoverScrollGuardUntil = 0;

// Las columnas que el usuario agrega con Filtro avanzado se recuerdan por
// tabla, para que el panel aparezca como lo dejó.
function panelAddedStorageKey(tableId) {
    return `sgn_filter_cols::${tableId}`;
}

function loadPanelAddedKeys(tableId) {
    try {
        const stored = JSON.parse(localStorage.getItem(panelAddedStorageKey(tableId)) || '[]');
        return Array.isArray(stored) ? stored.filter((k) => typeof k === 'string') : [];
    } catch {
        return [];
    }
}

function savePanelAddedKeys(tableId, keys) {
    try {
        localStorage.setItem(panelAddedStorageKey(tableId), JSON.stringify(keys));
    } catch {
        // Sin almacenamiento: simplemente no se recuerdan.
    }
}

// Qué columnas van en el panel: las que completan el mínimo (las primeras
// de negocio, texto y fechas antes que números y códigos; sin repetir lo que
// la pantalla ya filtra) y las que el usuario agregó.
function panelFieldKeys(tableId, filterBar) {
    const state = dataTableColumnState.get(tableId);
    if (!state.panelDefaultKeys) {
        const own = [...filterBar.querySelectorAll('.filter-bar-fields > .filter-field:not(.filter-field-col)')];
        const need = Math.max(0, FILTER_PANEL_MIN_FIELDS - own.length);
        // Sin repetir lo que la pantalla ya filtra: una columna cuyo nombre es (o
        // está dentro de) el de un campo propio -- "Fecha" frente a "Desde fecha",
        // "Unidad" frente a "Unidad, placas, chofer…" -- ya está cubierta.
        const ownLabels = own.map((f) => foldRuleText(f.querySelector('label')?.textContent || ''));
        const coveredByPage = (label) => {
            const l = foldRuleText(label);
            return ownLabels.some((own) => own === l || (l.length >= 3 && own.includes(l)));
        };
        const eligible = state.columnKeys.filter((k) => k !== 'actions' && !k.startsWith('colSys')
            && !coveredByPage(state.labels[k] || k));
        // Primero lo que se lee como dato (texto y fechas); al final los números y
        // los códigos ("Único … #", "No.", "Folio"), que casi siempre son las
        // primeras columnas de una tabla pero no las que más se filtran.
        const isCode = (k) => detectRangeType(k, getColumnDistinctValues(tableId, k)) === 'number'
            || /#|[uú]nic|unique|\bno\.|n[uú]mero|number|folio/i.test(state.labels[k] || k);
        state.panelDefaultKeys = [...eligible.filter((k) => !isCode(k)), ...eligible.filter(isCode)].slice(0, need);
    }
    const defaults = state.panelDefaultKeys;
    const exists = new Set(state.columnKeys);
    const added = loadPanelAddedKeys(tableId).filter((k) => exists.has(k) && k !== 'actions' && !defaults.includes(k));
    return { defaults, added };
}

// Lo que hoy tiene aplicado una columna, para saber si su borrador sigue al día.
function panelAppliedSig(state, key) {
    return JSON.stringify([
        state.columnFilters.has(key), [...(state.columnFilters.get(key) || [])].sort(), state.columnRules.get(key) || null,
    ]);
}

// Borrador de un campo del panel: arranca igual a lo aplicado (o "Todos"),
// se edita sin tocar la tabla y se aplica con Buscar. Solo lo que el usuario
// tocó se aplica; lo demás se deja como está.
function makePanelDraft(tableId, key) {
    const state = dataTableColumnState.get(tableId);
    const values = getColumnDistinctValues(tableId, key);
    const rangeType = detectRangeType(key, values);
    const appliedValues = state.columnFilters.get(key);
    const applied = state.columnRules.get(key);
    const isRange = applied?.kind === 'range';
    const rule = {
        kind: applied ? applied.kind : null,
        mode: applied ? (isRange ? 'range' : (applied.mode || 'contains')) : null,
        text: applied?.text || '',
        from: applied?.from || '',
        to: applied?.to || '',
        rtype: isRange ? (applied.rtype || 'date') : null,
        currency: !!applied?.currency,
    };
    if (rangeType) {
        // Fechas, partes de fecha, horas y números: Desde–Hasta directo en el campo.
        if (!isRange) { rule.from = ''; rule.to = ''; rule.rtype = rangeType; }
        rule.kind = 'range';
        rule.mode = 'range';
        if (rule.rtype === 'number') rule.currency = values.some((v) => String(v).trim().startsWith('$'));
    }
    return {
        key, inline: !!rangeType, rule, selected: new Set(appliedValues || values), touched: false,
        baseSig: panelAppliedSig(state, key),
    };
}

function syncPanelDrafts(tableId, keys) {
    const state = dataTableColumnState.get(tableId);
    if (!state.panelDrafts) state.panelDrafts = new Map();
    const keep = new Set(keys);
    [...state.panelDrafts.keys()].forEach((k) => { if (!keep.has(k)) state.panelDrafts.delete(k); });
    keys.forEach((key) => {
        const draft = state.panelDrafts.get(key);
        if (draft && (draft.touched || draft.baseSig === panelAppliedSig(state, key))) return;
        state.panelDrafts.set(key, makePanelDraft(tableId, key));
    });
}

// Lo que dice el campo cerrado: "Todos", "Contiene "GEI"", "2 seleccionados".
function panelFieldSummary(tableId, draft) {
    const bits = [];
    const ruleActive = isColumnRuleActive(draft.rule);
    if (ruleActive) bits.push(describeColumnRule(draft.rule));
    const all = getColumnDistinctValues(tableId, draft.key);
    const coversAll = all.every((v) => draft.selected.has(v));
    // Con una regla, "sin casillas marcadas" no restringe nada más.
    if (!coversAll && !(ruleActive && draft.selected.size === 0)) {
        if (draft.selected.size === 0) bits.push(t('main.filterPanelNone'));
        else if (draft.selected.size === 1) bits.push([...draft.selected][0] || '—');
        else bits.push(t('main.filterPanelSelectedCount', { count: String(draft.selected.size) }));
    }
    return bits.length ? bits.join(', ') : t('main.filterAll');
}

// --- lista flotante de un campo (la del encabezado) o del Filtro avanzado ---
function closePanelPopover() {
    panelPopoverEl?.remove();
    panelPopoverEl = null;
    panelPopoverAnchor = null;
    document.removeEventListener('click', onPanelPopoverOutside, true);
    document.removeEventListener('keydown', onPanelPopoverKey, true);
    window.removeEventListener('resize', closePanelPopover);
    window.removeEventListener('scroll', onPanelPopoverScroll, true);
}

function onPanelPopoverOutside(event) {
    if (!panelPopoverEl) return;
    if (panelPopoverEl.contains(event.target) || panelPopoverAnchor?.contains(event.target)) return;
    closePanelPopover();
}

function onPanelPopoverKey(event) {
    if (event.key === 'Escape') closePanelPopover();
}

// Mover el panel (su propio scroll) cierra la lista; mover la lista por dentro no.
function onPanelPopoverScroll(event) {
    if (Date.now() < panelPopoverScrollGuardUntil) return;
    if (panelPopoverEl && event.target instanceof Node && panelPopoverEl.contains(event.target)) return;
    closePanelPopover();
}

function openPanelPopover(menu, anchor) {
    // Se cuelga del body (no del panel, que recorta lo que se sale) y se acomoda
    // junto al campo sin salirse de la pantalla: abajo si cabe, arriba si hay más
    // lugar, y si aun así no cabe, con su propio scroll por dentro.
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const natural = menu.offsetHeight;
    const above = natural > spaceBelow && spaceAbove > spaceBelow;
    const room = Math.max(140, above ? spaceAbove : spaceBelow);
    if (natural > room) {
        menu.style.maxHeight = `${room}px`;
        menu.style.overflowY = 'auto';
    }
    const top = above ? rect.top - Math.min(natural, room) - 4 : rect.bottom + 4;
    const left = Math.min(rect.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - menuWidth - 8);
    menu.style.top = `${top + window.scrollY}px`;
    menu.style.left = `${Math.max(8, left)}px`;
    panelPopoverEl = menu;
    panelPopoverAnchor = anchor;
    setTimeout(() => {
        if (panelPopoverEl !== menu) return;
        document.addEventListener('click', onPanelPopoverOutside, true);
        document.addEventListener('keydown', onPanelPopoverKey, true);
        window.addEventListener('resize', closePanelPopover);
        window.addEventListener('scroll', onPanelPopoverScroll, true);
    }, 0);
}

function togglePanelFieldPopover(ctl, tableId, draft, onChange) {
    if (panelPopoverAnchor === ctl) { closePanelPopover(); return; }
    closePanelPopover();
    closeColumnFilterMenu();
    const state = dataTableColumnState.get(tableId);
    // Sin filtro puesto, "Todos" son los valores de HOY (pueden haber llegado nuevos).
    if (!draft.touched && !state.columnFilters.has(draft.key)) {
        draft.selected = new Set(getColumnDistinctValues(tableId, draft.key));
    }
    const { body } = buildSearchFilterBody(tableId, draft.key, draft.selected, () => {
        draft.touched = true;
        onChange();
    }, draft.rule, { compact: true });
    const menu = document.createElement('div');
    menu.className = 'data-table-col-filter-menu filter-panel-popover';
    menu.appendChild(body);
    openPanelPopover(menu, ctl);
    body.querySelector('.data-table-col-filter-search')?.focus();
}

// Un campo del panel: nombre de la columna + su control. Las fechas, horas y
// números llevan Desde–Hasta ahí mismo; el resto, la lista del encabezado.
function buildPanelField(tableId, key, removable) {
    const state = dataTableColumnState.get(tableId);
    const draft = state.panelDrafts.get(key);
    const label = state.labels[key] || key;
    const field = document.createElement('div');
    field.className = 'filter-field filter-field-col';
    // No data-col: Modo ayuda mapea ese atributo a la ayuda de la columna de la tabla.
    field.dataset.panelCol = key;
    field.dataset.helpKey = 'filterPanelField';
    field.setAttribute('aria-label', label);
    const head = document.createElement('div');
    head.className = 'filter-col-head';
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    head.appendChild(labelEl);
    if (removable) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'filter-col-remove';
        remove.setAttribute('aria-label', t('main.filterAdvancedRemove'));
        remove.title = t('main.filterAdvancedRemove');
        remove.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
        remove.addEventListener('click', () => removePanelColumn(tableId, key));
        head.appendChild(remove);
    }
    field.appendChild(head);
    if (draft.inline) {
        field.classList.add('filter-field-range');
        const box = document.createElement('div');
        box.className = 'filter-col-range';
        buildRangeFields(box, draft.rule, () => { draft.touched = true; });
        field.appendChild(box);
    } else {
        const ctl = document.createElement('button');
        ctl.type = 'button';
        ctl.className = 'filter-col-ctl';
        const refresh = () => {
            const summary = panelFieldSummary(tableId, draft);
            ctl.textContent = summary;
            ctl.classList.toggle('active', summary !== t('main.filterAll'));
        };
        refresh();
        ctl.addEventListener('click', () => togglePanelFieldPopover(ctl, tableId, draft, refresh));
        field.appendChild(ctl);
    }
    return field;
}

// --- Filtro avanzado: el selector de columnas de Acomodo, para agregar campos ---
function addPanelColumn(tableId, key) {
    const added = loadPanelAddedKeys(tableId);
    if (!added.includes(key)) added.push(key);
    savePanelAddedKeys(tableId, added);
    renderPanelColumnFilters(tableId);
    panelPopoverScrollGuardUntil = Date.now() + 600;
    getSavedSearchFilterBar(tableId)?.querySelector(`.filter-field-col[data-panel-col="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' });
}

// ✕ de un campo agregado: se va del panel y su filtro (si tenía) también.
function removePanelColumn(tableId, key) {
    const state = dataTableColumnState.get(tableId);
    savePanelAddedKeys(tableId, loadPanelAddedKeys(tableId).filter((k) => k !== key));
    state.panelDrafts?.delete(key);
    if (state.columnFilters.has(key) || state.columnRules.has(key)) {
        const filters = new Map(state.columnFilters);
        const rules = new Map(state.columnRules);
        filters.delete(key);
        rules.delete(key);
        setTableColumnFilterMaps(tableId, filters, rules);
    }
    renderPanelColumnFilters(tableId);
}

function toggleAdvancedPicker(btn, tableId) {
    if (panelPopoverAnchor === btn) { closePanelPopover(); return; }
    closePanelPopover();
    closeColumnFilterMenu();
    const state = dataTableColumnState.get(tableId);
    const filterBar = getSavedSearchFilterBar(tableId);
    const keys = state.columnKeys.filter((k) => k !== 'actions');
    const presentGroups = [...new Set(keys.map((k) => state.groupKeys.get(k)).filter(Boolean))];
    const hasUnclassified = keys.some((k) => !state.groupKeys.get(k));
    const tabs = hasUnclassified ? [...presentGroups, COLUMN_ARRANGE_UNCLASSIFIED] : presentGroups;
    // Abre en la primera clasificación que no sea Control Interno: ahí están
    // las columnas propias de la tabla.
    const picker = { tab: tabs.find((g) => g !== 'menu.classControlInterno') || tabs[0], query: '' };

    const menu = document.createElement('div');
    menu.className = 'data-table-col-filter-menu filter-panel-popover filter-advanced-picker';
    const searchWrap = document.createElement('div');
    searchWrap.className = 'sector-icon-picker-search';
    searchWrap.innerHTML = '<i class="bx bx-search" aria-hidden="true"></i>';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'sector-icon-picker-search-input';
    searchInput.placeholder = t('main.columnSearchPlaceholder');
    searchWrap.appendChild(searchInput);
    const tabsEl = document.createElement('div');
    tabsEl.className = 'sector-icon-picker-chips data-table-arrange-tabs';
    const hint = document.createElement('p');
    hint.className = 'filter-advanced-hint';
    hint.textContent = t('main.filterAdvancedHint');
    const listEl = document.createElement('div');
    listEl.className = 'admin-module-list data-table-arrange-list';
    menu.append(searchWrap, tabsEl, hint, listEl);

    const render = () => {
        const { defaults, added } = panelFieldKeys(tableId, filterBar);
        const inPanel = new Set([...defaults, ...added]);
        tabsEl.innerHTML = '';
        tabs.forEach((groupKey) => {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'sector-icon-picker-chip' + (picker.tab === groupKey ? ' active' : '');
            if (groupKey !== COLUMN_ARRANGE_UNCLASSIFIED) {
                const dot = document.createElement('span');
                dot.className = 'data-table-col-dot data-table-col-dot-chip';
                dot.style.backgroundColor = columnGroupColor(groupKey);
                tab.appendChild(dot);
            }
            tab.appendChild(document.createTextNode(groupKey === COLUMN_ARRANGE_UNCLASSIFIED ? t('menu.classNone') : resolveGroupLabel(groupKey)));
            const count = document.createElement('span');
            count.className = 'data-table-arrange-tab-count';
            count.textContent = String(keys.filter((k) => (state.groupKeys.get(k) || COLUMN_ARRANGE_UNCLASSIFIED) === groupKey).length);
            tab.appendChild(count);
            tab.addEventListener('click', () => {
                picker.tab = groupKey;
                picker.query = '';
                searchInput.value = '';
                render();
            });
            tabsEl.appendChild(tab);
        });
        const q = picker.query.trim().toLowerCase();
        const visible = q
            ? keys.filter((k) => (state.labels[k] || k).toLowerCase().includes(q))
            : keys.filter((k) => (state.groupKeys.get(k) || COLUMN_ARRANGE_UNCLASSIFIED) === picker.tab);
        listEl.innerHTML = '';
        visible.forEach((key) => {
            const groupKey = state.groupKeys.get(key);
            const { row } = buildArrangeRowShell(key, state.labels[key] || key, {
                dotColor: columnGroupColor(groupKey), dotTitle: groupKey ? resolveGroupLabel(groupKey) : t('menu.classNone'),
            });
            if (inPanel.has(key)) {
                row.classList.add('has-filter');
                const tag = document.createElement('span');
                tag.className = 'filter-advanced-tag';
                tag.textContent = t('main.filterAdvancedInPanel');
                row.appendChild(tag);
            } else {
                row.classList.add('data-table-search-row');
                const plus = document.createElement('span');
                plus.className = 'filter-advanced-plus';
                plus.innerHTML = '<i class="bx bx-plus" aria-hidden="true"></i>';
                row.appendChild(plus);
                row.addEventListener('click', () => { addPanelColumn(tableId, key); render(); });
            }
            listEl.appendChild(row);
        });
    };
    searchInput.addEventListener('input', () => { picker.query = searchInput.value; render(); });
    render();
    openPanelPopover(menu, btn);
    searchInput.focus();
}

// --- el panel: campos + botones ---
function renderPanelColumnFilters(tableId) {
    const state = dataTableColumnState.get(tableId);
    const filterBar = getSavedSearchFilterBar(tableId);
    if (!state || !filterBar || !resolveIconGrant(tableId, 'iconFilterAdvanced')) return;
    const fieldsEl = filterBar.querySelector('.filter-bar-fields');
    const actionsEl = filterBar.querySelector('.filter-bar-actions');
    if (!fieldsEl || !actionsEl) return;
    if (panelPopoverAnchor && !panelPopoverAnchor.isConnected) closePanelPopover();
    fieldsEl.querySelectorAll('.filter-field-col').forEach((el) => el.remove());
    const { defaults, added } = panelFieldKeys(tableId, filterBar);
    syncPanelDrafts(tableId, [...defaults, ...added]);
    state.panelBuilt = true;
    defaults.forEach((key) => fieldsEl.appendChild(buildPanelField(tableId, key, false)));
    added.forEach((key) => fieldsEl.appendChild(buildPanelField(tableId, key, true)));

    let advBtn = actionsEl.querySelector('.filter-advanced-btn');
    if (!advBtn) {
        advBtn = document.createElement('button');
        advBtn.type = 'button';
        advBtn.className = 'btn btn-secondary filter-advanced-btn';
        advBtn.dataset.helpKey = 'filterAdvanced';
        advBtn.innerHTML = '<i class="bx bx-plus" aria-hidden="true"></i><span class="filter-advanced-label"></span><small></small>';
        advBtn.addEventListener('click', () => toggleAdvancedPicker(advBtn, tableId));
        actionsEl.appendChild(advBtn);
    }
    advBtn.querySelector('.filter-advanced-label').textContent = t('main.filterAdvancedBtn');
    advBtn.querySelector('small').textContent = t('main.filterAdvancedCount', {
        count: String(defaults.length + added.length), total: String(state.columnKeys.filter((k) => k !== 'actions').length),
    });

    if (resolveIconGrant(tableId, 'iconFilterClear') && !actionsEl.querySelector('.filter-panel-clear')) {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'btn btn-secondary filter-panel-clear';
        clearBtn.dataset.helpKey = 'filterPanelClear';
        clearBtn.textContent = t('main.filterPanelClear');
        // Quita todo lo filtrado (los campos de la pantalla y los de columna) sin
        // tocar el acomodo de columnas; los campos agregados se quedan, vacíos.
        clearBtn.addEventListener('click', () => {
            closePanelPopover();
            dataTableColumnState.get(tableId)?.panelDrafts?.clear();
            clearSavedSearchForTable(tableId);
            renderPanelColumnFilters(tableId);
            sizeDataTableWrappers();
        });
        actionsEl.insertBefore(clearBtn, advBtn);
    }
    sizeDataTableWrappers();
}

// Si el panel ya está armado, lo pone al día con lo que hoy está aplicado
// (cambió desde el encabezado o al aplicar una Búsqueda Guardada). No toca el
// panel mientras alguien escribe en él o tiene una lista abierta.
function refreshPanelColumnFilters(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state?.panelBuilt || panelPopoverEl) return;
    const filterBar = getSavedSearchFilterBar(tableId);
    if (!filterBar || filterBar.contains(document.activeElement)) return;
    renderPanelColumnFilters(tableId);
}

// Buscar: aplica lo que se tocó en los campos de columna. Lo que no se tocó se
// deja como estaba (un filtro puesto desde el encabezado no se pierde).
function commitPanelColumnFilters(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state?.panelDrafts) return;
    const filters = new Map(state.columnFilters);
    const rules = new Map(state.columnRules);
    let changed = false;
    state.panelDrafts.forEach((draft, key) => {
        if (!draft.touched) return;
        changed = true;
        filters.delete(key);
        rules.delete(key);
        const { values, rule } = resolveDraftFilter(tableId, key, draft.selected, draft.rule);
        if (rule) {
            rules.set(key, rule);
            if (values.length) filters.set(key, new Set(values));
        } else if (!draft.inline) {
            const all = getColumnDistinctValues(tableId, key);
            if (!all.every((v) => draft.selected.has(v))) filters.set(key, new Set(values));
        }
        draft.touched = false;
    });
    if (!changed) return;
    setTableColumnFilterMaps(tableId, filters, rules);
}

// Filtro panel (see renderDataTableColumnControls above for the Filtrar/
// Limpiar toggle buttons that live in the table's OWN toolbar now — this
// bar no longer has its own open/close header). "Buscar" applies whatever
// each page's own JS implements (data-table:filter-apply — the fields
// differ per table, this file has no business knowing their meaning) and
// collapses the panel; "Limpiar" is fully handled by the toolbar button.
document.querySelectorAll('.filter-bar').forEach((bar) => {
    const searchBtn = bar.querySelector('.filter-bar-search-btn');
    searchBtn?.addEventListener('click', () => {
        closePanelPopover();
        // Los campos de columna del panel se aplican junto con los de la pantalla.
        // La barra no puede llevar data-table-id: casi todas las pantallas buscan su
        // tabla con [data-table-id="..."] y encontrarían la barra (que va antes) en
        // lugar de la tabla.
        if (bar.dataset.filterTableId) commitPanelColumnFilters(bar.dataset.filterTableId);
        bar.dispatchEvent(new CustomEvent('data-table:filter-apply'));
        bar.classList.remove('filter-bar-expanded');
        bar.nextElementSibling?.querySelector('[data-col-action="filter"]')?.setAttribute('aria-expanded', 'false');
        sizeDataTableWrappers();
    });
});

document.querySelectorAll('.lang-option').forEach((btn) => {
    btn.addEventListener('click', async () => {
        if (langSwitching) return;
        langSwitching = true;
        try {
            await loadLanguage(btn.dataset.lang);
        } catch (err) {
            console.error('Language switch failed:', err);
        } finally {
            langSwitching = false;
        }
    });
});

// Style (Light/Dark/Institutional) persists across page loads the same way
// language does — saved to localStorage on pick, re-applied in
// initDashboard() below once clientBranding is loaded (Institutional needs
// it for its actual colors).
function getStoredStyle() {
    const stored = localStorage.getItem('style');
    return ['light', 'dark', 'institutional', 'futuristic'].includes(stored) ? stored : 'light';
}

function applyStyle(style) {
    if (style === 'institutional' && clientBranding) {
        document.body.classList.remove('dark-mode', 'futuristic-mode');
        document.body.classList.add('institutional-mode');
    } else if (style === 'dark') {
        document.body.classList.remove('institutional-mode', 'futuristic-mode');
        document.body.classList.add('dark-mode');
    } else if (style === 'futuristic') {
        document.body.classList.remove('institutional-mode', 'dark-mode');
        document.body.classList.add('futuristic-mode');
    } else {
        document.body.classList.remove('institutional-mode', 'dark-mode', 'futuristic-mode');
    }
    document.querySelectorAll('.style-option').forEach((b) => b.classList.toggle('active', b.dataset.style === style));
}

document.querySelectorAll('.style-option').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (btn.dataset.style === 'institutional' && !clientBranding) {
            showToast(t('main.inDevelopment'), 'info');
            return;
        }
        localStorage.setItem('style', btn.dataset.style);
        applyStyle(btn.dataset.style);
    });
});

// --- Chatbot button + slide-in conversation panel (UI shell only for now,
// no AI backend wired up yet) -------------------------------------------------
// The button is inserted next to "Messages" on every page's top bar; the
// panel itself is built lazily on first open and reused after that.
let chatbotPanel = null;
let chatbotGreeted = false;

function buildChatbotPanel() {
    const panel = document.createElement('div');
    panel.id = 'chatbot-panel';
    panel.className = 'chatbot-panel';
    panel.setAttribute('role', 'dialog');
    panel.innerHTML = `
        <div class="chatbot-header">
            <span class="chatbot-title" data-i18n="main.chatbotTitle">Chatbot</span>
            <button type="button" class="chatbot-close" data-i18n-aria="main.chatbotClose" aria-label="Close">
                <i class="bx bx-x" aria-hidden="true"></i>
            </button>
        </div>
        <div class="chatbot-messages" id="chatbot-messages"></div>
        <form class="chatbot-input-row" id="chatbot-form">
            <input type="text" id="chatbot-input" data-i18n-placeholder="main.chatbotPlaceholder" placeholder="Message" autocomplete="off">
            <button type="submit" class="chatbot-send" data-i18n-aria="main.chatbotSend" aria-label="Send">
                <i class="bx bx-send" aria-hidden="true"></i>
            </button>
        </form>
    `;
    document.body.appendChild(panel);
    // Built lazily on first open (well after loadLanguage() has already run),
    // so translating it here — instead of waiting for the next language
    // switch — is safe and needed for its first paint.
    applyStaticTranslations();

    panel.querySelector('.chatbot-close').addEventListener('click', closeChatbot);
    panel.querySelector('#chatbot-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const input = document.getElementById('chatbot-input');
        const text = input.value.trim();
        if (!text) return;
        addChatMessage(text, 'user');
        input.value = '';
        setTimeout(() => addChatMessage(t('main.chatbotCannedReply'), 'bot', 'main.chatbotCannedReply'), 400);
    });
    return panel;
}

// i18nKey is set only for app-generated bot messages (greeting, canned
// reply) — it's what applyStaticTranslations() re-reads via [data-i18n] on
// every language switch, same mechanism as any other static label. The
// user's own typed messages never get one, so they're never rewritten.
function addChatMessage(text, from, i18nKey) {
    const messages = document.getElementById('chatbot-messages');
    if (!messages) return;
    const bubble = document.createElement('div');
    bubble.className = `chatbot-message chatbot-message-${from}`;
    bubble.textContent = text;
    if (i18nKey) bubble.dataset.i18n = i18nKey;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
}

function openChatbot() {
    if (!chatbotPanel) chatbotPanel = buildChatbotPanel();
    if (!chatbotGreeted) {
        addChatMessage(t('main.chatbotGreeting'), 'bot', 'main.chatbotGreeting');
        chatbotGreeted = true;
    }
    chatbotPanel.classList.add('open');
    document.getElementById('chatbot-input')?.focus();
}

function closeChatbot() {
    chatbotPanel?.classList.remove('open');
}
registerTopBarDropdown(closeChatbot);

document.addEventListener('click', (event) => {
    if (!chatbotPanel?.classList.contains('open')) return;
    if (chatbotPanel.contains(event.target) || event.target.closest('#chatbot-btn')) return;
    closeChatbot();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeChatbot();
});

// Inserted next to the "Messages" button in every page's static top bar —
// data-i18n-aria (not a direct t() call) so applyStaticTranslations() picks
// it up on the next loadLanguage() pass instead of racing it.
document.querySelectorAll('.top-bar-actions').forEach((container) => {
    if (container.querySelector('#chatbot-btn')) return;
    const messagesBtn = container.querySelector('[data-i18n-aria="main.messages"]');
    const chatbotBtn = document.createElement('button');
    chatbotBtn.type = 'button';
    chatbotBtn.id = 'chatbot-btn';
    chatbotBtn.setAttribute('data-i18n-aria', 'main.chatbot');
    chatbotBtn.setAttribute('aria-label', 'Chatbot');
    chatbotBtn.innerHTML = '<i class="bx bx-bot" aria-hidden="true"></i>';
    chatbotBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const wasOpen = chatbotPanel?.classList.contains('open');
        closeAllTopBarDropdowns('topBarActions');
        if (!wasOpen) openChatbot();
    });
    if (messagesBtn) {
        messagesBtn.insertAdjacentElement('afterend', chatbotBtn);
    } else {
        container.prepend(chatbotBtn);
    }
});

// --- System-wide UI scale ("aumentar/disminuir el tamaño de todo el
// sistema") — unlike lang/style/dataTableFontSize/etc., which are plain
// localStorage keys shared by whoever is using this browser, this is
// per ACCOUNT (see /api/me/ui-scale, users.ui_scale in db.js): if user A
// sets level 8, only user A sees it — logging in as user B on the same
// computer stays at whatever B has saved, never A's. Applied by setting
// the ROOT font-size, which every rem-based measurement in this app's CSS
// (paddings, gaps, icon sizes, the sidebar's own width...) scales from, so
// "the whole system" really does grow/shrink together, not just text.
const UI_SCALE_LEVELS = [70, 80, 90, 100, 110, 120, 130, 140]; // percent, index 0 = level 1
const UI_SCALE_DEFAULT_LEVEL = 4; // UI_SCALE_LEVELS[3] === 100, "Ideal"
let currentUiScaleLevel = UI_SCALE_DEFAULT_LEVEL;

function uiScaleLabelFor(level) {
    return level === UI_SCALE_DEFAULT_LEVEL ? t('main.uiScaleIdeal') : `${UI_SCALE_LEVELS[level - 1]}%`;
}

function applyUiScaleLevel(level) {
    currentUiScaleLevel = level;
    // rem-based sizes (paddings, gaps...) are supposed to recompute the
    // instant :root's font-size changes, but any element with its own CSS
    // transition on one of those properties (e.g. .top-bar's
    // `transition: padding`, there for its collapse/expand animation) can
    // end up visually stuck showing the PRE-change size — some browsers
    // don't treat a rem-cascade change as a fresh transition start the same
    // way they do a direct style/class change. Suppressing every
    // transition site-wide for one frame around the font-size change avoids
    // that whole class of bug instead of hunting down each transitioned
    // property one at a time.
    document.documentElement.classList.add('ui-scale-transitioning');
    document.documentElement.style.fontSize = `${UI_SCALE_LEVELS[level - 1]}%`;
    void document.documentElement.offsetHeight; // force layout before re-enabling transitions
    requestAnimationFrame(() => {
        document.documentElement.classList.remove('ui-scale-transitioning');
    });
    document.querySelectorAll('.ui-scale-label').forEach((el) => { el.textContent = uiScaleLabelFor(level); });
    document.querySelectorAll('#ui-scale-decrease').forEach((btn) => { btn.disabled = level <= 1; });
    document.querySelectorAll('#ui-scale-increase').forEach((btn) => { btn.disabled = level >= UI_SCALE_LEVELS.length; });
}

async function fetchUiScaleLevel() {
    try {
        const res = await fetch('/api/me/ui-scale', { credentials: 'include' });
        if (!res.ok) return UI_SCALE_DEFAULT_LEVEL;
        const { scale } = await res.json();
        return Number.isInteger(scale) && scale >= 1 && scale <= UI_SCALE_LEVELS.length ? scale : UI_SCALE_DEFAULT_LEVEL;
    } catch {
        return UI_SCALE_DEFAULT_LEVEL;
    }
}

async function saveUiScaleLevel(level) {
    applyUiScaleLevel(level); // reflect the change immediately, don't wait on the round-trip
    try {
        await fetch('/api/me/ui-scale', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ scale: level }),
        });
    } catch {
        // Worst case it doesn't persist server-side and reverts to the old
        // level on next login — not worth blocking the UI over.
    }
}

function closeUiScaleMenu() {
    document.querySelectorAll('#ui-scale-menu').forEach((menu) => menu.classList.remove('open'));
    document.querySelectorAll('#ui-scale-btn').forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
}
registerTopBarDropdown(closeUiScaleMenu);

document.querySelectorAll('.top-bar-actions').forEach((container) => {
    if (container.querySelector('#ui-scale-menu')) return;
    const settingsMenuEl = container.querySelector('#settings-menu');
    const wrapper = document.createElement('div');
    wrapper.className = 'user-info-menu';
    wrapper.id = 'ui-scale-menu';
    wrapper.innerHTML = `
        <button type="button" id="ui-scale-btn" aria-haspopup="true" aria-expanded="false" data-i18n-aria="main.uiScale" aria-label="System size">
            <i class="bx bx-text" aria-hidden="true"></i>
        </button>
        <div class="user-info-dropdown ui-scale-dropdown">
            <div class="user-info-group">
                <h4 data-i18n="main.uiScale">System size</h4>
                <div class="ui-scale-panel">
                    <button type="button" class="data-table-zoom-btn" id="ui-scale-decrease" data-i18n-aria="main.uiScaleDecrease" aria-label="Decrease size"><i class="bx bx-minus" aria-hidden="true"></i></button>
                    <span class="ui-scale-label">Ideal</span>
                    <button type="button" class="data-table-zoom-btn" id="ui-scale-increase" data-i18n-aria="main.uiScaleIncrease" aria-label="Increase size"><i class="bx bx-plus" aria-hidden="true"></i></button>
                </div>
            </div>
        </div>
    `;
    const toggleBtn = wrapper.querySelector('#ui-scale-btn');
    toggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const wasOpen = wrapper.classList.contains('open');
        closeAllTopBarDropdowns('topBarActions');
        if (!wasOpen) {
            wrapper.classList.add('open');
            toggleBtn.setAttribute('aria-expanded', 'true');
        }
    });
    wrapper.querySelector('#ui-scale-decrease').addEventListener('click', () => {
        if (currentUiScaleLevel > 1) saveUiScaleLevel(currentUiScaleLevel - 1);
    });
    wrapper.querySelector('#ui-scale-increase').addEventListener('click', () => {
        if (currentUiScaleLevel < UI_SCALE_LEVELS.length) saveUiScaleLevel(currentUiScaleLevel + 1);
    });
    if (settingsMenuEl) {
        settingsMenuEl.insertAdjacentElement('beforebegin', wrapper);
    } else {
        container.appendChild(wrapper);
    }
});

document.addEventListener('click', (event) => {
    if (!event.target.closest('#ui-scale-menu')) closeUiScaleMenu();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeUiScaleMenu();
});

// --- "Modo ayuda" (SAP-style click-for-description) ------------------------
// Requested live, 2026-09-29: "como en SAP, cuando das ctrl+shift... te da
// la descripción de qué funcionalidad es cada botón/columna/opción". Almost
// every button/icon/column in the app already carries a real title/
// aria-label (what shows today as the browser's own slow, small native
// tooltip after holding the mouse still) -- this doesn't invent new content,
// it just surfaces that same text instantly, in a bigger bubble, on demand,
// and swallows the click so asking "what does this do" never also DOES it
// (no filter opens, no save fires) while the mode is on.
//
// Extended 2026-09-30, confirmed live: a plain name ("Tamaño del sistema")
// wasn't enough -- "También me debe mostrar el Qué hace... muy explícito...
// como si le explicarás a un niño de 10 años... adicional, un ejemplo claro
// y preciso". Elements listed in HELP_CONTENT_KEYS get a data-help-key
// attribute (set once below); help.<key>.what/example (i18n/es.json,
// i18n/en.json) supply the extra 2 lines. Anything NOT yet in that map
// keeps today's name-only tooltip (findHelpModeContent falls back to it) --
// "cada botón, columna, opción, etc, TODO" is the eventual goal, but this
// is the mechanism plus the 8 top-bar icons; the rest rolls out
// screen-by-screen on top of the same data-help-key/help.* pattern.
let helpModeActive = false;
let helpModeTooltipEl = null;

function closeHelpModeTooltip() {
    helpModeTooltipEl?.remove();
    helpModeTooltipEl = null;
}

// Generic "attribute value -> help.<key>" applier, reused below for every
// way a help-worthy element can be found on the page (id, data-col,
// data-zoom, data-col-action, and whatever the next screen-by-screen batch
// needs) -- add a row to one of the maps below and a matching help.<key>
// entry in i18n/es.json + i18n/en.json to extend "Modo ayuda" to a new
// button/column, no new plumbing required.
function applyHelpKeysByAttr(attr, map) {
    Object.entries(map).forEach(([value, key]) => {
        document.querySelectorAll(`[${attr}="${value}"]`).forEach((el) => el.setAttribute('data-help-key', key));
    });
}
// Element id -- the 8 top-bar icons (not every one exists on every page, so
// this tolerates misses).
const HELP_CONTENT_KEYS = {
    'messages-btn': 'messages',
    'chatbot-btn': 'chatbot',
    'notifications-btn': 'notifications',
    'bookmarks-btn': 'bookmarks',
    'ui-scale-btn': 'uiScale',
    'settings-btn': 'settings',
    'user-info-btn': 'userInfo',
    'business-profile-btn': 'businessProfile',
    'sidebar-search': 'sidebarSearch',
};
// <th data-col="..."> -- the 13 Control Interno columns (see
// getSystemColumnsForRecord in db.js), hardcoded static markup repeated
// across ~35 different screens (search any of these ids across
// public/*.html), not something Dashboard.js builds -- this is the one
// place that covers all of them at once instead of editing every screen.
const HELP_CONTENT_COLUMN_KEYS = {
    colSysEmpresa: 'colSysEmpresa', colSysArea: 'colSysArea', colSysModulo: 'colSysModulo',
    colSysPantalla: 'colSysPantalla', colSysCentroCostos: 'colSysCentroCostos', colSysFecha: 'colSysFecha',
    colSysDiaNum: 'colSysDiaNum', colSysDiaTexto: 'colSysDiaTexto', colSysMesNum: 'colSysMesNum',
    colSysMesTexto: 'colSysMesTexto', colSysAnio: 'colSysAnio', colSysSemana: 'colSysSemana', colSysHora: 'colSysHora',
    // Generic, reused-everywhere data-col values (confirmed live, 2026-09-30:
    // "Acciones" header, and every plain Usuario/Nombre/Correo/Fecha/Estatus
    // cell, showed nothing at all in Modo ayuda -- only Control Interno's own
    // 13 columns and each screen's own custom buttons had ever been wired).
    // Applies to BOTH a <th> and every <td> sharing that data-col across
    // every table that uses it (confirmed: "actions" alone spans 63 files),
    // same one-map-covers-everything leverage as the Control Interno rows
    // above. Harmless where a row's own action buttons already carry a more
    // specific data-help-key -- that's checked at the clicked element itself
    // before ever walking up to the shared <td data-col="actions">.
    actions: 'genericActions', username: 'genericUsername', email: 'genericEmail',
    createdAt: 'genericCreatedAt', status: 'genericStatus', name: 'genericName',
};
// data-zoom="in"/"out" -- the font-size zoom buttons every .data-table gets
// (renderDataTableZoomControls).
const HELP_CONTENT_ZOOM_KEYS = { out: 'zoomOut', in: 'zoomIn' };
// data-col-action="..." -- the per-table toolbar buttons every .data-table
// can get depending on its own icon grants (renderDataTableColumnControls):
// Fijar/Mostrar-ocultar/Historial/Leyenda/Reglas de Orden.
const HELP_CONTENT_COL_ACTION_KEYS = {
    pin: 'pinColumns', visibility: 'columnVisibility', history: 'changeHistory',
    legend: 'columnLegend', 'field-rules': 'fieldRules',
    'saved-layout': 'savedLayout', 'saved-search': 'savedSearch',
    filter: 'filterToggle', 'filter-clear': 'filterClear',
};
function applyHelpContentKeys() {
    applyHelpKeysByAttr('id', HELP_CONTENT_KEYS);
    applyHelpKeysByAttr('data-col', HELP_CONTENT_COLUMN_KEYS);
    applyHelpKeysByAttr('data-zoom', HELP_CONTENT_ZOOM_KEYS);
    applyHelpKeysByAttr('data-col-action', HELP_CONTENT_COL_ACTION_KEYS);
    // .data-table-new-record-btn -- the shared "+ Nuevo X" class 15 admin/
    // catalog/operational screens already build their own create button
    // with (confirmed live, 2026-09-30: had no aria-label or data-help-key
    // at all, so clicking it in Modo ayuda did nothing). One class-based
    // pass instead of editing each screen, same leverage as the maps above.
    document.querySelectorAll('.data-table-new-record-btn').forEach((el) => el.setAttribute('data-help-key', 'createNewRecord'));
}
applyHelpContentKeys();
// Several of these (ui-scale-btn, the whole zoom/col-action toolbar) don't
// exist yet at this point in the script -- they're built later, from
// initDashboard's own render passes -- so the pass above simply finds
// nothing for them on this first run. dashboard:language-changed fires once
// after initDashboard's own loadLanguage() call, by which point every
// button here really exists, so re-running there (harmless -- setAttribute
// to the same value -- for whatever was already tagged) catches the rest;
// it's also what already re-attaches a column's filter-trigger button after
// a language switch resets its textContent, so this piggybacks on a pass
// that already has to happen anyway.
document.addEventListener('dashboard:language-changed', applyHelpContentKeys);

// Walks up from the clicked element to the nearest ancestor carrying either
// a data-help-key (see HELP_CONTENT_KEYS/HELP_CONTENT_COLUMN_KEYS above) or
// a plain name -- checked at every level together, not name-first, since a
// column header (<th data-col="colSysEmpresa">) has no aria-label/title of
// its own at all, only its own visible text (textContent), unlike a
// top-bar icon which always has an aria-label already. placeholder is the
// last resort, for an <input> like #sidebar-search which has neither an
// aria-label/title nor any visible textContent of its own.
// Live fallback for the generic id/data-col/class maps above -- a table row
// (Usuario/Correo/Estatus/Acciones cells, the "+ Nuevo X" button) is very
// often built AFTER initDashboard's own one-time 'dashboard:language-changed'
// event already fired (its own data load happens inside each screen's own
// init(), past that point), so applyHelpContentKeys never gets a second
// chance to stamp data-help-key onto it. Confirmed live, 2026-09-30: Equipo
// SaaS's own "+ Nuevo Admin SaaS" button and every plain row cell showed
// nothing at all in Modo ayuda for exactly this reason. Resolving these maps
// again HERE, at click time, is immune to that timing gap regardless of when
// the element was actually created.
// La descripción de cada pantalla ("Administra las empresas que usan esta
// instancia de SGN.") ya no se lee arriba de la tabla: se ve en Modo ayuda, al
// tocar el renglón de esa pantalla en la barra lateral. Pantalla (archivo del
// href) -> clave de su descripción, la misma que traía su párrafo
// .admin-subtitle.
const SCREEN_DESCRIPTION_KEYS = {
    'Admin-ArbolMaestro.html': 'admin.masterTreeSubtitle',
    'Admin-ArbolMaestroSaaS.html': 'admin.saasMasterTreeSubtitle',
    'Admin-BusinessSectors.html': 'admin.businessSectorsSubtitle',
    'Admin-EquipoSaaS.html': 'admin.saasTeamSubtitle',
    'Admin-MaterialApoyo.html': 'admin.materialApoyoSubtitle',
    'Admin-NuestrasApps.html': 'admin.appsSubtitle',
    'Admin-NuestrosRespaldos.html': 'admin.backupsSubtitle',
    'Admin-Planes.html': 'admin.plansSubtitle',
    'Admin-SaaS.html': 'admin.clientsSubtitle',
    'BaseDatos-NuestrosCambios.html': 'admin.changesSubtitle',
    'BaseDatos-Respaldos.html': 'admin.backupsSubtitle',
    'BaseDatos-Solicitudes.html': 'main.databaseRequestsSubtitle',
    'Business-Config.html': 'business.configSubtitle',
    'Business-DatosCliente.html': 'business.clientDataSubtitle',
    'Business-EstatusRH.html': 'business.hrStatusCatalogSubtitle',
    'Business-EstructuraOrganizacional.html': 'business.orgChartSubtitle',
    'Business-MisAccesos.html': 'business.myAccessSubtitle',
    'Business-PuestosTrabajo.html': 'business.jobPositionsSubtitle',
    'Business-ReglasOrden.html': 'main.fieldRulesSubtitle',
    'Business-Roles.html': 'business.rolesSubtitle',
    'Business-Usuarios.html': 'business.usersSubtitle',
    'TrazTransVolCombustible.html': 'main.trazSubtitle',
};
function sidebarScreenDescription(link) {
    const href = link.getAttribute?.('href');
    if (!href) return null;
    const page = href.split('#')[0].split('?')[0].split('/').pop();
    const key = SCREEN_DESCRIPTION_KEYS[page];
    return key ? t(key) : null;
}
function resolveGenericHelpKey(node) {
    return HELP_CONTENT_KEYS[node.id] || HELP_CONTENT_COLUMN_KEYS[node.getAttribute('data-col')]
        || HELP_CONTENT_ZOOM_KEYS[node.getAttribute('data-zoom')] || HELP_CONTENT_COL_ACTION_KEYS[node.getAttribute('data-col-action')]
        || (node.classList.contains('data-table-new-record-btn') ? 'createNewRecord' : null);
}
function findHelpModeContent(startEl) {
    let node = startEl;
    while (node && node.nodeType === 1 && node !== document.body) {
        const helpKey = node.getAttribute('data-help-key') || resolveGenericHelpKey(node);
        if (helpKey) {
            // A data-col cell's own column header (its <th data-col="...">
            // in the same table) beats aria-label/title -- a LOT of editable
            // cells across the app share one generic "Clic para editar"
            // title (Dashboard.attachInlineEdit's own convention), which
            // would otherwise show as the tooltip's name instead of what
            // the column actually is. Harmless for a <th> itself (e.g. a
            // Control Interno column) since it just re-finds itself.
            const col = node.getAttribute('data-col');
            const header = col && node.closest('table')?.querySelector(`th[data-col="${col}"]`);
            const name = (header && header.textContent.trim()) || node.getAttribute('aria-label')
                || node.getAttribute('title') || node.textContent.trim() || node.getAttribute('placeholder');
            if (name) {
                const screenDescription = helpKey === 'sidebarNavigation' ? sidebarScreenDescription(node) : null;
                if (screenDescription) return { name, what: screenDescription, example: null };
                return { name, what: t(`help.${helpKey}.what`), example: t(`help.${helpKey}.example`) };
            }
        }
        // Cualquier otro encabezado o celda de una tabla (la mayoría de las
        // columnas no tiene su propia entrada help.*): se explica con el
        // nombre de SU columna, así que ningún encabezado ni fila se queda
        // sin ayuda aunque nadie la haya escrito a mano todavía.
        const colKey = node.getAttribute('data-col');
        if (colKey && (node.tagName === 'TH' || node.tagName === 'TD') && node.closest('table.data-table')) {
            const header = node.tagName === 'TH' ? node : node.closest('table').querySelector(`th[data-col="${CSS.escape(colKey)}"]`);
            const label = header?.textContent.trim();
            if (label) {
                return node.tagName === 'TH'
                    ? { name: label, what: t('help.genericColumnHeader.what', { name: label }), example: t('help.genericColumnHeader.example', { name: label }) }
                    : { name: label, what: t('help.genericColumnCell.what', { name: label }), example: null };
            }
        }
        const name = node.getAttribute('aria-label') || node.getAttribute('title');
        if (name) return { name, what: null, example: null };
        node = node.parentElement;
    }
    return null;
}

function showHelpModeTooltip(content, x, y) {
    closeHelpModeTooltip();
    const tip = document.createElement('div');
    tip.className = 'help-mode-tooltip';
    const nameEl = document.createElement('div');
    nameEl.className = 'help-mode-tooltip-name';
    nameEl.textContent = content.name;
    tip.appendChild(nameEl);
    if (content.what) {
        const whatEl = document.createElement('div');
        whatEl.className = 'help-mode-tooltip-what';
        whatEl.textContent = content.what;
        tip.appendChild(whatEl);
    }
    if (content.example) {
        const exampleEl = document.createElement('div');
        exampleEl.className = 'help-mode-tooltip-example';
        const label = document.createElement('b');
        label.textContent = t('main.helpExampleLabel');
        exampleEl.appendChild(label);
        exampleEl.append(` ${content.example}`);
        tip.appendChild(exampleEl);
    }
    document.body.appendChild(tip);
    const rect = tip.getBoundingClientRect();
    const left = Math.min(x + 14, window.innerWidth - rect.width - 8);
    const top = Math.min(y + 14, window.innerHeight - rect.height - 8);
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
    helpModeTooltipEl = tip;
}

function setHelpModeActive(active) {
    helpModeActive = active;
    document.body.classList.toggle('help-mode-active', active);
    document.querySelectorAll('#help-mode-toggle').forEach((btn) => {
        btn.classList.toggle('help-mode-toggle-active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
    closeHelpModeTooltip();
}

// Capture phase, not bubble -- has to run and (when it finds a description)
// stopPropagation BEFORE the clicked control's own handler ever fires, or
// "just tell me what this does" would also do it.
document.addEventListener('click', (event) => {
    if (!helpModeActive) return;
    if (event.target.closest('#help-mode-toggle')) return;
    const content = findHelpModeContent(event.target);
    event.preventDefault();
    event.stopPropagation();
    if (content) showHelpModeTooltip(content, event.clientX, event.clientY);
    else closeHelpModeTooltip();
}, true);

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && helpModeActive) setHelpModeActive(false);
});

document.querySelectorAll('.top-bar-actions').forEach((container) => {
    if (container.querySelector('#help-mode-toggle')) return;
    const settingsMenuEl = container.querySelector('#settings-menu');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'help-mode-toggle';
    btn.setAttribute('aria-pressed', 'false');
    // data-i18n-aria (not a direct t() call) -- this runs at top-level
    // script time, before the async i18n fetch resolves, same as
    // messagesBtn/chatbotBtn just above; a direct t() call here bakes in
    // the untranslated key ("main.helpMode") forever, since
    // applyStaticTranslations only re-visits elements carrying this
    // attribute. Confirmed live, 2026-09-29: the button's own accessible
    // name showed the literal key until this.
    btn.setAttribute('data-i18n-aria', 'main.helpMode');
    btn.setAttribute('aria-label', 'Help mode');
    btn.title = 'Help mode';
    btn.innerHTML = '<i class="bx bx-help-circle" aria-hidden="true"></i>';
    btn.addEventListener('click', (event) => {
        event.stopPropagation();
        setHelpModeActive(!helpModeActive);
    });
    if (settingsMenuEl) {
        settingsMenuEl.insertAdjacentElement('beforebegin', btn);
    } else {
        container.appendChild(btn);
    }
});

// The fixed page title (.welcome-text, e.g. "SaaS Team", "Árbol Maestro
// SaaS") becomes the help-mode target for "what does this whole screen do"
// -- its own .admin-subtitle text (previously a permanently-visible
// paragraph above every table) moves onto it as a title attribute, then
// hides. Confirmed live, 2026-09-29: "quitar el texto de administra las
// cuentas, eso va cuando... me diga como funciona la pantalla" -- applies
// site-wide, to every screen using .admin-subtitle, not just one. Copy-then-
// hide (not a CSS display:none) so a page shaped differently than expected
// just keeps its subtitle visible instead of silently losing the text
// nowhere.
// DIRECT child of .admin-panel specifically -- not just any .admin-subtitle
// on the page. Admin-NuestrasApps.html's own detail view reuses the same
// class for #app-detail-clients, a per-record runtime value (which clients
// use this one app), nested inside .saas-app-detail-head, not a screen-level
// description -- querySelector('.admin-subtitle') alone would risk grabbing
// or hiding THAT instead, depending on DOM order.
// Run from dashboard:language-changed (fired once at initial load AND on
// every later language switch, see loadLanguage above), never at top-level
// script time -- confirmed live, 2026-09-30: with Español selected, the
// tooltip still read in English. Root cause: this used to be a plain IIFE
// that ran the instant the script parsed, BEFORE initDashboard's own
// loadLanguage(getStoredLang()) had fetched/applied translations, so it
// always captured .admin-subtitle's raw English HTML fallback instead of
// the real selected language, then never touched it again -- the
// "only if no title/aria-label yet" guard made that capture permanent even
// after the subtitle's own text later re-translated correctly around it.
// Removed that guard too, so switching language while the page is open
// re-syncs the tooltip instead of leaving it stuck on whatever ran first.
function migrateAdminSubtitleIntoHelpMode() {
    // También las que van dentro del panel de una pestaña (Nuestros Clientes) o
    // directo en .page-content (Base de Datos, Trazabilidad): antes esas se
    // quedaban a la vista ocupando un renglón arriba de la tabla.
    const subtitles = [...document.querySelectorAll(
        '.admin-panel > .admin-subtitle, .admin-panel > .admin-tab-panel > .admin-subtitle, .page-content > .admin-subtitle',
    )];
    const titleEl = document.querySelector('.top-bar-title .welcome-text');
    if (!subtitles.length || !titleEl) return;
    const text = subtitles[0].textContent.trim();
    if (!text) return;
    titleEl.setAttribute('aria-label', text);
    titleEl.title = text;
    subtitles.forEach((subtitle) => { subtitle.hidden = true; });
}
document.addEventListener('dashboard:language-changed', migrateAdminSubtitleIntoHelpMode);

// --- Notifications dropdown (Alertas / Avisos / Solicitudes / Autorizar) ---
// Converts the existing static #notifications-btn (already present, plain,
// in every page's top bar) into a proper dropdown — same JS-built pattern
// as #ui-scale-menu above, reusing .user-info-menu/.user-info-dropdown for
// the toggle+panel mechanics. All 4 tabs come from one combined payload
// (GET /api/business/notifications, already scoped server-side to this
// user): Autorizar = pending changes I can approve (the only tab this
// dropdown originally had); Solicitudes/Avisos = changes I MYSELF
// requested, still pending vs. already resolved; Alertas = access-denied
// notices addressed to me as someone's Jefe Directo.
const PENDING_CHANGE_TABLE_LABELS = {
    'registro-combustible': 'menu.opTransVolCombustible',
    'mi-recurso-humano': 'menu.opRrhhMiRecursoHumano',
};
const NOTIFICATION_TABS = ['alertas', 'avisos', 'solicitudes', 'autorizar'];
// Titles collapse to just these icons under the same narrow-screen
// breakpoint every other top-bar label already uses (see .dept-picker-btn
// span's own display:none rule) — same "reducción de tamaño" the user
// asked for, not a separate mobile-only thing.
const NOTIFICATION_TAB_ICONS = {
    alertas: 'bx-error-circle',
    avisos: 'bx-info-circle',
    solicitudes: 'bx-send',
    autorizar: 'bx-check-shield',
};
let notificationsListEl = null;
let notificationsData = { alertas: [], avisos: [], solicitudes: [], autorizar: [] };
let activeNotificationTab = 'alertas';

function closeNotificationsMenu() {
    document.querySelectorAll('#notifications-menu').forEach((menu) => menu.classList.remove('open'));
    document.querySelectorAll('#notifications-btn').forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
}
registerTopBarDropdown(closeNotificationsMenu);

function setNotificationsBadge(count) {
    document.querySelectorAll('.notifications-badge').forEach((badge) => {
        badge.hidden = count <= 0;
        badge.textContent = count > 99 ? '99+' : String(count);
    });
}

// dd-mm-aa, matching the format the user asked for — SQLite's
// datetime('now') gives "YYYY-MM-DD HH:MM:SS" (UTC); just re-sliced, no
// timezone conversion (same "good enough, not a legal timestamp" precedent
// as every other date shown straight from a DB column in this app).
function formatNotificationDate(sqliteDatetime) {
    const [y, m, d] = (sqliteDatetime || '').slice(0, 10).split('-');
    return y && m && d ? `${d}-${m}-${y.slice(2)}` : '';
}

function renderAlertRow(alert) {
    const row = document.createElement('div');
    row.className = `notifications-item notifications-item-alert${alert.seen_at ? '' : ' notifications-item-unseen'}`;
    row.innerHTML = `
        <div class="notifications-item-meta">#${alert.seq} · ${formatNotificationDate(alert.created_at)}</div>
        <div class="notifications-item-desc">
            <b data-role="actor"></b>, ${t('main.notificationAttemptedChangePrefix')}
            <b>${t(alert.field_key)} / ${t(alert.screen_key)}</b>, ${t('main.notificationAttemptedChangeSuffix')}
        </div>
    `;
    // alert.acting_user_label is free text (a user's own display name) --
    // set via textContent, never interpolated into innerHTML (same
    // convention as openForwardPicker's requestedName/categoryLabel above).
    // Confirmed live, 2026-09-28: this was a real stored-XSS sink -- see the
    // same fix on renderRequestRow/renderNotificationRow below.
    row.querySelector('[data-role="actor"]').textContent = alert.acting_user_label;
    return row;
}

// Solicitudes (showOutcome: false, still pending) / Avisos (showOutcome:
// true, already resolved — shows who approved/rejected it and when).
function renderRequestRow(change, { showOutcome = false } = {}) {
    const row = document.createElement('div');
    row.className = `notifications-item${showOutcome && !change.seen_at ? ' notifications-item-unseen' : ''}`;
    const tableLabel = t(PENDING_CHANGE_TABLE_LABELS[change.table_key] || change.table_key);
    const outcome = showOutcome
        ? `<div class="notifications-item-meta">${t(change.status === 'approved' ? 'main.notificationApproved' : 'main.notificationRejected')} — <span data-role="resolved-by"></span> · ${formatNotificationDate(change.resolved_at)}</div>`
        : '';
    row.innerHTML = `
        <div class="notifications-item-meta">${tableLabel} · <span data-role="record-label"></span></div>
        <div class="notifications-item-desc">${t(change.field_key)}: "<span data-role="old-value"></span>" → "<span data-role="new-value"></span>"</div>
        ${outcome}
    `;
    // record_label/old_value/new_value/resolved_by are free text a regular
    // user typed into a business field -- set via textContent, never
    // interpolated into innerHTML. Confirmed live, 2026-09-28: this was a
    // real stored-XSS-to-privilege-escalation path (a low-privilege user's
    // crafted field value would execute in the client-admin's browser when
    // they review this same queue).
    row.querySelector('[data-role="record-label"]').textContent = change.record_label || '—';
    row.querySelector('[data-role="old-value"]').textContent = change.old_value || '—';
    row.querySelector('[data-role="new-value"]').textContent = change.new_value || '—';
    if (showOutcome) row.querySelector('[data-role="resolved-by"]').textContent = change.resolved_by || '—';
    return row;
}

function renderNotificationRow(change) {
    const row = document.createElement('div');
    row.className = 'notifications-item';
    const tableLabel = t(PENDING_CHANGE_TABLE_LABELS[change.table_key] || change.table_key);
    row.innerHTML = `
        <div class="notifications-item-meta">${tableLabel} · <span data-role="record-label"></span></div>
        <div class="notifications-item-desc">${t(change.field_key)}: "<span data-role="old-value"></span>" → "<span data-role="new-value"></span>"</div>
        <div class="notifications-item-meta">${t('main.changeHistoryRequestedBy')}: <span data-role="requested-by"></span></div>
        <div class="notifications-item-actions">
            <button type="button" class="btn btn-secondary" data-action="reject">${t('main.notificationReject')}</button>
            <button type="button" class="btn" data-action="approve">${t('main.notificationApprove')}</button>
        </div>
    `;
    // record_label/old_value/new_value/requested_by are free text -- same
    // stored-XSS fix as renderRequestRow above (this is the queue a
    // client-admin actually approves/rejects from, so it's the highest-
    // value target of the three).
    row.querySelector('[data-role="record-label"]').textContent = change.record_label || '—';
    row.querySelector('[data-role="old-value"]').textContent = change.old_value || '—';
    row.querySelector('[data-role="new-value"]').textContent = change.new_value || '—';
    row.querySelector('[data-role="requested-by"]').textContent = change.requested_by || '—';
    row.querySelector('[data-action="approve"]').addEventListener('click', () => resolvePendingNotification(change.id, 'approve', row));
    row.querySelector('[data-action="reject"]').addEventListener('click', () => resolvePendingNotification(change.id, 'reject', row));
    return row;
}

async function resolvePendingNotification(id, action, row) {
    try {
        const res = await fetch(`/api/business/pending-changes/${id}/${action}`, { method: 'POST', credentials: 'include' });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showToast(body.message || t('admin.saveError'), 'error');
            return;
        }
        row.remove();
        showToast(action === 'approve' ? t('main.notificationApproved') : t('main.notificationRejected'), 'success');
        loadNotifications();
    } catch {
        showToast(t('admin.saveError'), 'error');
    }
}

// --- Catalog-value requests ("+ Solicitar nuevo X") ------------------------
// Merged into the same 4 notification buckets from the server (kind:
// 'catalog-request', see /api/business/notifications) -- rendered with
// their own row (Autorizar/Rechazar/Reenviar) instead of the plain
// field-change one every other item in these tabs gets.
function renderCatalogRequestRow(item, { showOutcome = false } = {}) {
    const row = document.createElement('div');
    row.className = 'notifications-item';
    const meta = document.createElement('div');
    meta.className = 'notifications-item-meta';
    meta.textContent = `${item.categoryLabel} · ${formatNotificationDate(item.createdAt)}`;
    const desc = document.createElement('div');
    desc.className = 'notifications-item-desc';
    desc.textContent = t('main.notificationCatalogRequestDesc', { name: item.requestedName, catalog: item.categoryLabel });
    row.append(meta, desc);
    if (showOutcome) {
        const outcome = document.createElement('div');
        outcome.className = 'notifications-item-meta';
        outcome.textContent = t(item.status === 'approved' ? 'main.notificationApproved' : 'main.notificationRejected');
        row.appendChild(outcome);
        return row;
    }
    if (item.canAuthorize === undefined) return row; // "mis solicitudes" (solicitudes tab) -- read-only, still pending
    const actions = document.createElement('div');
    actions.className = 'notifications-item-actions';
    if (item.canAuthorize) {
        const rejectBtn = document.createElement('button');
        rejectBtn.type = 'button';
        rejectBtn.className = 'btn btn-secondary';
        rejectBtn.textContent = t('main.notificationReject');
        rejectBtn.addEventListener('click', () => resolveCatalogRequestAction(item.id, 'reject', row));
        const approveBtn = document.createElement('button');
        approveBtn.type = 'button';
        approveBtn.className = 'btn';
        approveBtn.textContent = t('main.notificationApprove');
        approveBtn.addEventListener('click', () => openCatalogRequestFulfillModal(item, () => { row.remove(); loadNotifications(); }));
        actions.append(rejectBtn, approveBtn);
    } else {
        const note = document.createElement('p');
        note.className = 'admin-hint';
        note.textContent = t('main.notificationCatalogNoAuth');
        row.appendChild(note);
        const forwardBtn = document.createElement('button');
        forwardBtn.type = 'button';
        forwardBtn.className = 'btn';
        forwardBtn.textContent = t('main.notificationCatalogForward');
        forwardBtn.addEventListener('click', () => openCatalogRequestForwardModal(item, row));
        actions.appendChild(forwardBtn);
    }
    row.appendChild(actions);
    return row;
}

async function resolveCatalogRequestAction(id, action, row, payload) {
    try {
        const res = await fetch(`/api/business/catalog-requests/${id}/${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload || {}),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            showToast(body.message || t('admin.saveError'), 'error');
            return;
        }
        row.remove();
        showToast(action === 'forward' ? t('main.notificationCatalogForwarded') : t('main.notificationRejected'), 'success');
        loadNotifications();
    } catch {
        showToast(t('admin.saveError'), 'error');
    }
}

// "Reenviar" -- confirmed with the user this is a deliberate choice, not
// another automatic single hop: fetches who's eligible (own jefe directo,
// homólogos, jefes alternos -- see GET .../forward-options) and lets the
// holder pick one. An empty answer (nobody in any of the 3 groups) means
// there's nothing to choose between, so it falls straight back to the old
// one-click behavior -- the server resolves that case to the client admin
// on its own (see the POST .../forward route).
async function openCatalogRequestForwardModal(item, row) {
    let candidates = { jefeDirecto: null, homologos: [], alternos: [] };
    try {
        const res = await fetch(`/api/business/catalog-requests/${item.id}/forward-options`, { credentials: 'include' });
        if (res.ok) candidates = await res.json();
    } catch {
        // fall through with the empty default -- same "nothing to pick" path
    }
    const groups = [
        { labelKey: 'main.forwardGroupJefeDirecto', items: candidates.jefeDirecto ? [candidates.jefeDirecto] : [] },
        { labelKey: 'main.forwardGroupAlternos', items: candidates.alternos || [] },
        { labelKey: 'main.forwardGroupHomologos', items: candidates.homologos || [] },
    ].filter((group) => group.items.length);

    if (!groups.length) {
        resolveCatalogRequestAction(item.id, 'forward', row);
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.innerHTML = `
        <h3>${t('main.forwardPickerTitle')}</h3>
        <p class="admin-hint"></p>
        <form class="admin-form" novalidate>
            <div class="forward-picker-groups"></div>
            <div class="admin-error" role="alert" hidden></div>
            <div class="admin-form-actions">
                <button type="submit" class="btn" disabled>${t('main.forwardPickerSubmit')}</button>
                <button type="button" class="btn btn-secondary" data-action="cancel">${t('admin.cancel')}</button>
            </div>
        </form>
    `;
    // item.requestedName/categoryLabel are free text -- set via textContent
    // after the fact, never interpolated into the innerHTML template above.
    panel.querySelector('.admin-hint').textContent = t('main.notificationCatalogRequestDesc', { name: item.requestedName, catalog: item.categoryLabel });
    const groupsWrap = panel.querySelector('.forward-picker-groups');
    const submitBtn = panel.querySelector('button[type="submit"]');
    let selectedUserId = null;
    groups.forEach((group, groupIndex) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'forward-picker-group';
        const labelEl = document.createElement('div');
        labelEl.className = 'forward-picker-group-label';
        labelEl.textContent = t(group.labelKey);
        groupEl.appendChild(labelEl);
        group.items.forEach((candidate, itemIndex) => {
            const optionLabel = document.createElement('label');
            optionLabel.className = 'forward-picker-option';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'forward-target';
            input.value = String(candidate.userId);
            if (groupIndex === 0 && itemIndex === 0) {
                input.checked = true;
                selectedUserId = candidate.userId;
                optionLabel.classList.add('selected');
                submitBtn.disabled = false;
            }
            const textEl = document.createElement('span');
            // candidate.name/positionName are free text (a worker's own
            // name, a Puesto's own name) -- set via textContent, never
            // interpolated into innerHTML.
            textEl.textContent = candidate.positionName ? `${candidate.name} — ${candidate.positionName}` : candidate.name;
            input.addEventListener('change', () => {
                panel.querySelectorAll('.forward-picker-option').forEach((el) => el.classList.remove('selected'));
                optionLabel.classList.add('selected');
                selectedUserId = candidate.userId;
                submitBtn.disabled = false;
            });
            optionLabel.append(input, textEl);
            groupEl.appendChild(optionLabel);
        });
        groupsWrap.appendChild(groupEl);
    });
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    const form = panel.querySelector('form');
    const errorEl = panel.querySelector('.admin-error');
    function close() { overlay.remove(); }
    panel.querySelector('[data-action="cancel"]').addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!selectedUserId) return;
        errorEl.hidden = true;
        submitBtn.disabled = true;
        try {
            const res = await fetch(`/api/business/catalog-requests/${item.id}/forward`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ targetUserId: selectedUserId }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                errorEl.textContent = body.message || t('admin.saveError');
                errorEl.hidden = false;
                submitBtn.disabled = false;
                return;
            }
            close();
            row.remove();
            showToast(t('main.notificationCatalogForwarded'), 'success');
            loadNotifications();
        } catch {
            errorEl.textContent = t('admin.saveError');
            errorEl.hidden = false;
            submitBtn.disabled = false;
        }
    });
}

// "Pantalla alterna" -- opens when Autorizar is pressed on a catalog
// request. Same catálogo shape every "Nuestras Categorías..." screen
// already edits (Nombre/Descripción), prefilled from the request but still
// editable (catches typos before they become the real catalog value).
function openCatalogRequestFulfillModal(request, onResolved) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.innerHTML = `
        <h3>${t('main.catalogRequestFulfillTitle')}</h3>
        <p class="admin-hint">${t('main.catalogRequestFulfillSubtitle')}</p>
        <form class="admin-form" novalidate>
            <div class="admin-field">
                <label>${t('main.colCatName')}</label>
                <input type="text" name="name" required>
            </div>
            <div class="admin-field">
                <label>${t('main.colCatDescription')}</label>
                <textarea name="description" rows="2"></textarea>
            </div>
            <div class="admin-error" role="alert" hidden></div>
            <div class="admin-form-actions">
                <button type="submit" class="btn">${t('main.catalogRequestFulfillSubmit')}</button>
                <button type="button" class="btn btn-secondary" data-action="cancel">${t('admin.cancel')}</button>
            </div>
        </form>
    `;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    const form = panel.querySelector('form');
    // Set via the DOM property, never interpolated into the innerHTML above
    // -- request.requestedName/note are free text someone else typed.
    form.elements.name.value = request.requestedName || '';
    form.elements.description.value = request.note || '';
    const errorEl = panel.querySelector('.admin-error');
    function close() { overlay.remove(); }
    panel.querySelector('[data-action="cancel"]').addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorEl.hidden = true;
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            const res = await fetch(`/api/business/catalog-requests/${request.id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ description: form.elements.description.value.trim() }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                errorEl.textContent = body.message || t('admin.saveError');
                errorEl.hidden = false;
                return;
            }
            close();
            showToast(t('main.notificationApproved'), 'success');
            if (onResolved) onResolved(body);
        } catch {
            errorEl.textContent = t('admin.saveError');
            errorEl.hidden = false;
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// "+ Solicitar nuevo X" -- any screen with a catálogo-select field calls
// this to offer requesting a value that doesn't exist yet, instead of
// needing Editar on the catálogo itself. Builds its own modal on demand
// (not static per-page HTML, so it works from any screen without editing
// every page's own markup) and hands the created request back via
// onSubmitted so the caller can show its own "Pendiente de autorización"
// state on whatever field triggered it.
function openCatalogRequestModal({ categoryType, categoryLabel, sourceTableKey, sourceRecordId, sourceFieldKey, onSubmitted }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.innerHTML = `
        <h3>${t('main.requestCatalogModalTitle')} — ${categoryLabel}</h3>
        <form class="admin-form" novalidate>
            <div class="admin-field">
                <label>${t('main.requestCatalogNameLabel')}</label>
                <input type="text" name="requestedName" required>
            </div>
            <div class="admin-field">
                <label>${t('main.requestCatalogNoteLabel')}</label>
                <textarea name="note" rows="2"></textarea>
            </div>
            <p class="admin-hint">${t('main.requestCatalogHint')}</p>
            <div class="admin-error" role="alert" hidden></div>
            <div class="admin-form-actions">
                <button type="submit" class="btn">${t('main.requestCatalogSubmit')}</button>
                <button type="button" class="btn btn-secondary" data-action="cancel">${t('main.requestCatalogCancel')}</button>
            </div>
        </form>
    `;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    const form = panel.querySelector('form');
    const errorEl = panel.querySelector('.admin-error');
    function close() { overlay.remove(); }
    panel.querySelector('[data-action="cancel"]').addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        errorEl.hidden = true;
        const requestedName = form.elements.requestedName.value.trim();
        if (!requestedName) return;
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        try {
            const res = await fetch('/api/business/catalog-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    categoryType, requestedName, note: form.elements.note.value.trim(),
                    sourceTableKey, sourceRecordId, sourceFieldKey,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                errorEl.textContent = body.message || t('admin.saveError');
                errorEl.hidden = false;
                return;
            }
            close();
            showToast(t('main.requestCatalogSent'), 'success');
            if (onSubmitted) onSubmitted(body.request);
        } catch {
            errorEl.textContent = t('admin.saveError');
            errorEl.hidden = false;
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// Switching tabs never re-fetches — notificationsData is already the full
// combined payload from loadNotifications(); opening Alertas/Avisos marks
// that tab's unseen rows seen (fire-and-forget, badge already reflected
// what was fetched a moment ago).
function renderActiveNotificationTab() {
    document.querySelectorAll('.notifications-tab').forEach((tabBtn) => {
        tabBtn.classList.toggle('active', tabBtn.dataset.tab === activeNotificationTab);
    });
    document.querySelectorAll('.notifications-active-label').forEach((el) => {
        el.textContent = t(`main.notificationsTab_${activeNotificationTab}`);
    });
    document.querySelectorAll('.notifications-tab-count').forEach((el) => {
        el.textContent = String(notificationsData[el.dataset.tab]?.length || 0);
    });
    if (!notificationsListEl) return;
    notificationsListEl.innerHTML = '';
    const items = notificationsData[activeNotificationTab] || [];
    if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'notifications-empty';
        empty.textContent = t('main.notificationsEmpty');
        notificationsListEl.appendChild(empty);
    } else {
        items.forEach((item) => {
            let row;
            if (item.kind === 'catalog-request') row = renderCatalogRequestRow(item, { showOutcome: activeNotificationTab === 'avisos' });
            else if (activeNotificationTab === 'alertas') row = renderAlertRow(item);
            else if (activeNotificationTab === 'avisos') row = renderRequestRow(item, { showOutcome: true });
            else if (activeNotificationTab === 'solicitudes') row = renderRequestRow(item);
            else row = renderNotificationRow(item);
            notificationsListEl.appendChild(row);
        });
    }
    if (activeNotificationTab === 'alertas' && items.some((a) => !a.seen_at)) {
        fetch('/api/business/notifications/alertas/mark-seen', { method: 'POST', credentials: 'include' }).catch(() => {});
    }
    if (activeNotificationTab === 'avisos' && items.some((a) => !a.seen_at)) {
        fetch('/api/business/notifications/avisos/mark-seen', { method: 'POST', credentials: 'include' }).catch(() => {});
    }
}

async function loadNotifications() {
    if (!notificationsListEl) return;
    try {
        const res = await fetch('/api/business/notifications', { credentials: 'include' });
        if (!res.ok) return;
        notificationsData = await res.json();
        const unseenAlertas = notificationsData.alertas.filter((a) => !a.seen_at).length;
        const unseenAvisos = notificationsData.avisos.filter((a) => !a.seen_at).length;
        setNotificationsBadge(unseenAlertas + unseenAvisos + notificationsData.autorizar.length);
        renderActiveNotificationTab();
    } catch {
        // Leave whatever was already rendered — no network/parse errors surfaced here.
    }
}

document.querySelectorAll('.top-bar-actions-list').forEach((container) => {
    const btn = container.querySelector('#notifications-btn');
    if (!btn || btn.dataset.dropdownMounted) return;
    btn.dataset.dropdownMounted = '1';
    const wrapper = document.createElement('div');
    wrapper.className = 'user-info-menu';
    wrapper.id = 'notifications-menu';
    btn.replaceWith(wrapper);
    wrapper.appendChild(btn);
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    const badge = document.createElement('span');
    badge.className = 'notifications-badge';
    badge.hidden = true;
    btn.appendChild(badge);
    const dropdown = document.createElement('div');
    dropdown.className = 'user-info-dropdown notifications-dropdown';
    dropdown.innerHTML = `
        <div class="notifications-tabs" role="tablist">
            ${NOTIFICATION_TABS.map((tabKey) => `
                <button type="button" class="notifications-tab${tabKey === activeNotificationTab ? ' active' : ''}" data-tab="${tabKey}" role="tab">
                    <i class="bx ${NOTIFICATION_TAB_ICONS[tabKey]} notifications-tab-icon" aria-hidden="true"></i>
                    <span class="notifications-tab-label" data-i18n="main.notificationsTab_${tabKey}">${t(`main.notificationsTab_${tabKey}`)}</span>
                    <span class="notifications-tab-count" data-tab="${tabKey}">0</span>
                </button>
            `).join('')}
        </div>
        <div class="notifications-active-label"></div>
        <div class="notifications-list" data-role="list"></div>
    `;
    wrapper.appendChild(dropdown);
    notificationsListEl = dropdown.querySelector('[data-role="list"]');
    dropdown.querySelectorAll('.notifications-tab').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
            activeNotificationTab = tabBtn.dataset.tab;
            renderActiveNotificationTab();
        });
    });
    btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const wasOpen = wrapper.classList.contains('open');
        closeAllTopBarDropdowns('topBarActions');
        if (!wasOpen) {
            wrapper.classList.add('open');
            btn.setAttribute('aria-expanded', 'true');
            loadNotifications();
        }
    });
});

document.addEventListener('click', (event) => {
    if (!event.target.closest('#notifications-menu')) closeNotificationsMenu();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeNotificationsMenu();
});

if (document.getElementById('notifications-menu')) {
    loadNotifications();
}

// --- Sidebar search: live-filters the menu items actually rendered right
// now (respecting the current department filter, role-based sidebar, and
// language) instead of a separate hardcoded index, so results always match
// what the user can already see and click. ----------------------------------
const sidebarSearchInput = document.getElementById('sidebar-search');
let sidebarSearchResultsEl = null;

function normalizeSearchText(str) {
    return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function getSearchableLinks() {
    return Array.from(document.querySelectorAll(
        '#menu-mount .menu-link, #menu-mount .sub-menu-link, #business-admin-submenu a'
    )).filter((a) => a.textContent.trim().length > 0);
}

function getResultIcon(anchor) {
    const icon = anchor.classList.contains('sub-menu-link')
        ? anchor.closest('.menu-item')?.querySelector('.menu-link i:first-child')
        : anchor.querySelector('i:first-child');
    return icon ? icon.className : 'bx bx-link';
}

function getSidebarSearchResultsEl() {
    if (!sidebarSearchResultsEl) {
        sidebarSearchResultsEl = document.createElement('ul');
        sidebarSearchResultsEl.id = 'sidebar-search-results';
        sidebarSearchResultsEl.className = 'sidebar-search-results';
        sidebarSearchInput?.closest('.search')?.appendChild(sidebarSearchResultsEl);
    }
    return sidebarSearchResultsEl;
}

function closeSidebarSearchResults() {
    sidebarSearchResultsEl?.classList.remove('open');
}
registerTopBarDropdown(closeSidebarSearchResults);

function selectSidebarSearchResult(anchor) {
    if (sidebarSearchInput) sidebarSearchInput.value = '';
    closeSidebarSearchResults();
    document.getElementById('Sidebar')?.classList.remove('minimize');
    anchor.click();
    anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderSidebarSearchResults(query) {
    const dropdown = getSidebarSearchResultsEl();
    dropdown.innerHTML = '';
    const q = normalizeSearchText(query.trim());
    if (!q) {
        dropdown.classList.remove('open');
        return;
    }
    const matches = getSearchableLinks()
        .filter((a) => normalizeSearchText(a.textContent).includes(q))
        .slice(0, 8);
    if (!matches.length) {
        const li = document.createElement('li');
        li.className = 'sidebar-search-empty';
        li.textContent = t('sidebar.searchNoResults');
        dropdown.appendChild(li);
        dropdown.classList.add('open');
        return;
    }
    matches.forEach((anchor) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sidebar-search-result';
        const icon = document.createElement('i');
        icon.className = getResultIcon(anchor);
        icon.setAttribute('aria-hidden', 'true');
        const span = document.createElement('span');
        span.textContent = anchor.textContent.trim();
        btn.append(icon, span);
        btn.addEventListener('click', () => selectSidebarSearchResult(anchor));
        li.appendChild(btn);
        dropdown.appendChild(li);
    });
    dropdown.classList.add('open');
}

sidebarSearchInput?.addEventListener('input', () => {
    renderSidebarSearchResults(sidebarSearchInput.value);
});

sidebarSearchInput?.addEventListener('focus', () => {
    if (sidebarSearchInput.value) renderSidebarSearchResults(sidebarSearchInput.value);
});

document.addEventListener('click', (event) => {
    if (sidebarSearchResultsEl && !event.target.closest('.search')) closeSidebarSearchResults();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSidebarSearchResults();
});

// --- Department picker dropdown ----------------------------------------------
const deptPicker = document.getElementById('dept-picker');
const deptPickerBtn = document.getElementById('dept-picker-btn');
const deptPickerDropdown = document.getElementById('dept-picker-dropdown');

function closeDeptPicker() {
    deptPicker?.classList.remove('open');
    deptPickerBtn?.setAttribute('aria-expanded', 'false');
}
registerTopBarDropdown(closeDeptPicker);

deptPickerBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = deptPicker.classList.contains('open');
    closeAllTopBarDropdowns();
    if (!wasOpen) {
        deptPicker.classList.add('open');
        deptPickerBtn.setAttribute('aria-expanded', 'true');
    }
});

document.addEventListener('click', (event) => {
    if (deptPicker && !deptPicker.contains(event.target)) closeDeptPicker();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDeptPicker();
});

// Re-run once availableDepartments narrows to the client's contracted
// modules (see initDashboard) — building this eagerly with the full
// DEPARTMENTS list first means the dropdown briefly shows everything, but
// nothing breaks if a client never calls this again (admin, or before the
// fetch resolves).
function renderDeptPickerOptions() {
    if (!deptPickerDropdown) return;
    deptPickerDropdown.innerHTML = '';
    availableDepartments.forEach((dept) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'none');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'menuitem');
        btn.className = 'dept-option';
        btn.dataset.dept = dept.key;
        const icon = document.createElement('i');
        icon.className = `bx ${dept.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        const span = document.createElement('span');
        span.dataset.i18n = dept.labelKey;
        span.textContent = t(dept.labelKey);
        btn.appendChild(icon);
        btn.appendChild(span);
        li.appendChild(btn);
        deptPickerDropdown.appendChild(li);
    });
}
renderDeptPickerOptions();

deptPickerDropdown?.addEventListener('click', (event) => {
    const btn = event.target.closest('.dept-option');
    if (!btn) return;
    selectedDepartment = selectedDepartment === btn.dataset.dept ? null : btn.dataset.dept;
    localStorage.setItem('department', selectedDepartment || '');
    // A department's areas are a different list than the previous one's, so
    // any area chosen before this switch no longer applies.
    selectedArea = null;
    localStorage.setItem('area', '');
    updateDeptPickerLabel();
    renderAreaPickerOptions();
    updateAreaPickerVisibility();
    renderFilteredMenu();
    closeDeptPicker();
});

// --- Area picker dropdown (mirrors the department picker above) -------------
const areaPicker = document.getElementById('area-picker');
const areaPickerBtn = document.getElementById('area-picker-btn');
const areaPickerDropdown = document.getElementById('area-picker-dropdown');

function closeAreaPicker() {
    areaPicker?.classList.remove('open');
    areaPickerBtn?.setAttribute('aria-expanded', 'false');
}
registerTopBarDropdown(closeAreaPicker);

areaPickerBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = areaPicker.classList.contains('open');
    closeAllTopBarDropdowns();
    if (!wasOpen) {
        areaPicker.classList.add('open');
        areaPickerBtn.setAttribute('aria-expanded', 'true');
    }
});

document.addEventListener('click', (event) => {
    if (areaPicker && !areaPicker.contains(event.target)) closeAreaPicker();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAreaPicker();
});

areaPickerDropdown?.addEventListener('click', (event) => {
    const btn = event.target.closest('.area-option');
    if (!btn) return;
    selectedArea = selectedArea === btn.dataset.area ? null : btn.dataset.area;
    localStorage.setItem('area', selectedArea || '');
    updateAreaPickerLabel();
    renderFilteredMenu();
    closeAreaPicker();
});

renderAreaPickerOptions();

// --- Cost center picker: multi-select (one, several, or all) ----------------
// Selection persists in localStorage (same idea as the department picker)
// ready for whatever screen ends up filtering by it — this just captures and
// remembers the choice for now. 'all' is a sentinel meaning "every cost
// center, including ones added later"; once the user deselects anything it
// becomes an explicit id set.
const ccPicker = document.getElementById('cc-picker');
const ccPickerBtn = document.getElementById('cc-picker-btn');
const ccPickerDropdown = document.getElementById('cc-picker-dropdown');
const CC_SELECTION_KEY = 'costCenterSelection';

// Named sidebarCostCenters (not costCenters) — Dashboard.js and page scripts
// like Business-CentrosCosto.js share one global scope (plain <script> tags,
// not modules), and that page has its own top-level costCenters already.
let sidebarCostCenters = [];

function getStoredCostCenterSelection() {
    const raw = localStorage.getItem(CC_SELECTION_KEY);
    if (!raw || raw === 'all') return 'all';
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed);
    } catch { /* fall through to default */ }
    return 'all';
}

let selectedCostCenterIds = getStoredCostCenterSelection();

function isCostCenterSelected(id) {
    return selectedCostCenterIds === 'all' || selectedCostCenterIds.has(id);
}

function persistCostCenterSelection() {
    localStorage.setItem(
        CC_SELECTION_KEY,
        selectedCostCenterIds === 'all' ? 'all' : JSON.stringify(Array.from(selectedCostCenterIds))
    );
}

async function fetchCostCenters() {
    try {
        const res = await fetch(`${API_BASE}/business/cost-centers`, { credentials: 'include' });
        if (!res.ok) return [];
        const data = await res.json();
        return data.costCenters || [];
    } catch {
        return [];
    }
}

function updateCostCenterPickerLabel() {
    const label = document.getElementById('cc-picker-label');
    if (!label || !sidebarCostCenters.length) return;
    const selected = sidebarCostCenters.filter((cc) => isCostCenterSelected(cc.id));
    if (selected.length === 0) {
        label.textContent = t('sidebar.costCentersNone');
    } else if (selected.length === sidebarCostCenters.length) {
        label.textContent = t('sidebar.costCentersAllCount', { count: sidebarCostCenters.length });
    } else if (selected.length === 1) {
        label.textContent = selected[0].code;
    } else {
        label.textContent = t('sidebar.costCentersSelectedCount', { count: selected.length });
    }
}

function closeCcPicker() {
    ccPicker?.classList.remove('open');
    ccPickerBtn?.setAttribute('aria-expanded', 'false');
}
registerTopBarDropdown(closeCcPicker);

function renderCostCenterPicker() {
    if (!ccPicker || !ccPickerDropdown) return;
    ccPicker.classList.toggle('cc-picker-disabled', sidebarCostCenters.length <= 1 || currentRole === 'admin');
    if (!sidebarCostCenters.length) return;

    ccPickerDropdown.innerHTML = '';

    const allLi = document.createElement('li');
    allLi.className = 'cc-option';
    const allLabel = document.createElement('label');
    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.checked = sidebarCostCenters.every((cc) => isCostCenterSelected(cc.id));
    allCheckbox.addEventListener('change', () => {
        selectedCostCenterIds = allCheckbox.checked ? new Set(sidebarCostCenters.map((cc) => cc.id)) : new Set();
        persistCostCenterSelection();
        renderCostCenterPicker();
    });
    const allSpan = document.createElement('span');
    allSpan.textContent = t('sidebar.costCentersAll');
    allLabel.append(allCheckbox, allSpan);
    allLi.appendChild(allLabel);
    ccPickerDropdown.appendChild(allLi);
    ccPickerDropdown.appendChild(Object.assign(document.createElement('li'), { className: 'cc-picker-divider' }));

    sidebarCostCenters.forEach((cc) => {
        const li = document.createElement('li');
        li.className = 'cc-option';
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isCostCenterSelected(cc.id);
        checkbox.addEventListener('change', () => {
            if (selectedCostCenterIds === 'all') selectedCostCenterIds = new Set(sidebarCostCenters.map((c) => c.id));
            if (checkbox.checked) selectedCostCenterIds.add(cc.id);
            else selectedCostCenterIds.delete(cc.id);
            persistCostCenterSelection();
            updateCostCenterPickerLabel();
            allCheckbox.checked = sidebarCostCenters.every((c) => isCostCenterSelected(c.id));
        });
        const span = document.createElement('span');
        span.textContent = `${cc.code} - ${cc.name}`;
        label.append(checkbox, span);
        li.appendChild(label);
        ccPickerDropdown.appendChild(li);
    });

    updateCostCenterPickerLabel();
}

// Centros de Costo aren't a static catalog like departments — each one is
// its own grant under "cc-list" in Accesos y Permisos (see PermissionTree.js
// and Business-Roles/Accesos), keyed by submenuId `cc-<id>`. Same
// unrestricted-client-admin bypass as the top-bar buttons: sees every cost
// center the client has, no per-item grant needed, unless GEIPSA has set an
// explicit override for them.
function hasCostCenterPermission(ccId) {
    if (isUnrestrictedClientAdmin()) return true;
    const grants = cachedBusinessProfile?.effectiveGrants || [];
    return grants.some((g) => g.sectionId === 'main' && g.itemId === 'cc-list' && g.submenuId === `cc-${ccId}`);
}

async function initCostCenterPicker() {
    const allCostCenters = await fetchCostCenters();
    sidebarCostCenters = allCostCenters.filter((cc) => hasCostCenterPermission(cc.id));
    if (sidebarCostCenters.length === 1) {
        // Nothing to actually choose between — same idea as the department
        // and area pickers auto-picking their one option.
        selectedCostCenterIds = new Set([sidebarCostCenters[0].id]);
        persistCostCenterSelection();
    } else if (selectedCostCenterIds !== 'all') {
        const validIds = new Set(sidebarCostCenters.map((cc) => cc.id));
        selectedCostCenterIds = new Set(Array.from(selectedCostCenterIds).filter((id) => validIds.has(id)));
        persistCostCenterSelection();
    }
    renderCostCenterPicker();
}

ccPickerBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = ccPicker.classList.contains('open');
    closeAllTopBarDropdowns();
    if (!wasOpen) {
        ccPicker.classList.add('open');
        ccPickerBtn.setAttribute('aria-expanded', 'true');
    }
});

document.addEventListener('click', (event) => {
    if (ccPicker && !ccPicker.contains(event.target)) closeCcPicker();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCcPicker();
});

// --- "Configuración de Botones" shortcuts (Departamento / Áreas / Centro
// Costos) inside the Settings dropdown — each just opens the real picker
// that already lives in the top bar, instead of duplicating its logic. Each
// one is gated by its own grant under "Iconos y Botones" in Accesos y
// Permisos (btn-departamento/btn-area/btn-cc), same as any other screen —
// NOT by whether the real picker currently has anything to choose between.
// A profile/user granted the permission sees the shortcut even if, say,
// only one department is contracted and its real picker is hidden.
//
// The auto-provisioned client admin (isClientAdmin) bypasses this grant
// check entirely UNLESS GEIPSA has explicitly set an override for them from
// Admin-SaaS ("Accesos del Administrador") — an empty effectiveGrants set
// means "no override", not "nothing granted", for that one user.
function isUnrestrictedClientAdmin() {
    return !!currentUser?.isClientAdmin && (cachedBusinessProfile?.effectiveGrants || []).length === 0;
}

// --- Estatus visibility gate ------------------------------------------------
// Mirrors db.js's own resolveMasterNodeStatus (server-side, same cascade
// math) so this real-time, no-round-trip check reads a node's EFFECTIVE
// Estatus the exact same way: broadest-ancestor-wins over
// master_permission_status's own explicit rows (masterStatusOverrides,
// sent once with business-profile -- only ever the small set of nodes an
// admin has touched away from 'habilitado', see that field's own db.js
// comment), 'habilitado' for anything nobody has ever touched. Confirmed
// live, 2026-09-27: "solo si está habilitado, lo podrán ver usuarios
// reales" -- every real user's own visibleStatuses defaults to just
// ['habilitado']; only a Usuario de Pruebas gets all 4.
function masterTreeNodeKey(sectionId, itemId, submenuId) {
    return `${sectionId}::${itemId || ''}::${submenuId || ''}`;
}
// No memoization here on purpose -- a cache needs a `let` to hold it, and
// this function gets called (via availableAreasForDepartment) from other
// top-level script code that runs EARLIER in Dashboard.js's own load order
// than a `let` declared this far down the file, which threw "Cannot access
// before initialization" in production the moment this shipped (a `let`
// is hoisted but stays in its temporal dead zone until the line that
// declares it actually runs, unlike this function itself, which — being a
// function declaration — IS safely callable from anywhere the instant the
// script starts). Rebuilding the Map every call is cheap regardless:
// masterStatusOverrides only ever holds whatever's been explicitly set
// away from habilitado, a small list even on a large tree.
function getMasterStatusOverrideMap() {
    const overrides = cachedBusinessProfile?.masterStatusOverrides || [];
    return new Map(overrides.map((r) => [masterTreeNodeKey(r.sectionId, r.itemId, r.submenuId), r.status]));
}
function resolveMasterNodeStatus(sectionId, itemId, submenuId) {
    const overrides = getMasterStatusOverrideMap();
    if (!overrides.size) return 'habilitado';
    const deptStatus = overrides.get(masterTreeNodeKey(sectionId, null, null));
    if (deptStatus) return deptStatus;
    if (itemId) {
        const itemStatus = overrides.get(masterTreeNodeKey(sectionId, itemId, null));
        if (itemStatus) return itemStatus;
    }
    if (submenuId) {
        const parts = String(submenuId).split('/');
        for (let i = 1; i <= parts.length; i += 1) {
            const partial = overrides.get(masterTreeNodeKey(sectionId, itemId, parts.slice(0, i).join('/')));
            if (partial) return partial;
        }
    }
    return 'habilitado';
}
// Applies REGARDLESS of isUnrestrictedClientAdmin -- that bypass answers
// "does this user have an explicit grant", a separate question from "has
// GEIPSA even released this yet", so a node under construction stays
// invisible to the client's own unrestricted admin too, same as any other
// real user. Only that client's own Usuario de Pruebas (Cuenta de
// Capacitación) has every status in its own visibleStatuses.
function isEstatusVisible(sectionId, itemId, submenuId) {
    const status = resolveMasterNodeStatus(sectionId, itemId, submenuId);
    const visible = cachedBusinessProfile?.visibleStatuses || ['habilitado'];
    return visible.includes(status);
}

// availableDepartments (see applyLoginDefaults/wherever it's narrowed) only
// ever filtered by this user's own grants at the Departamento level -- the
// Área picker under a chosen department never got the same treatment, so it
// always listed every área the CLIENT has, regardless of which ones this
// specific user was actually granted (an área is itemId under that
// department's own sectionId).
function availableAreasForDepartment(deptKey) {
    const areas = (deptKey && AREAS_BY_DEPARTMENT[deptKey]) || [];
    const visible = areas.filter((a) => isEstatusVisible(deptKey, a.key, null));
    if (isUnrestrictedClientAdmin()) return visible;
    const grants = cachedBusinessProfile?.effectiveGrants || [];
    return visible.filter((a) => grants.some((g) => g.sectionId === deptKey && g.itemId === a.key));
}

// "Pantalla habilitada" — whether this specific {sectionId, itemId,
// submenuId} leaf is covered by the user's grants, using the SAME 3-tier
// fallback as PermissionTree.js's own isGranted() (exact leaf, OR a
// broader item-level grant, OR a broader section-level grant) — so a
// profile configured with a broad "select all" at Área or Departamento
// level already covers every pantalla under it, no different from how
// that same grant already works inside the permission tree editor itself.
// A pantalla like Carga Combustible has no leaf of its own once it has
// Control Interno columns underneath -- PermissionTree.js's getGrants()
// only ever saves one row per checked COLUMN leaf (e.g. ".../carga-
// operador/fecha-registro/solo-ver"), never a bare {sectionId, itemId,
// submenuId} row for the pantalla itself. Without the g.submenuId.startsWith
// check below, granting every column of a screen still left the screen
// itself invisible in the menu -- the columns existed but nothing could
// ever navigate to them. Any grant nested under this submenuId (a column,
// or a column inside a classification) now counts as the screen itself
// being reachable, matching how a worker actually experiences "I was given
// access to this screen's fields."
function hasScreenGrant(sectionId, itemId, submenuId) {
    if (!isEstatusVisible(sectionId, itemId, submenuId)) return false;
    if (isUnrestrictedClientAdmin()) return true;
    const grants = cachedBusinessProfile?.effectiveGrants || [];
    return grants.some((g) => (
        (g.sectionId === sectionId && g.itemId === itemId && g.submenuId === submenuId)
        || (g.sectionId === sectionId && g.itemId === itemId && g.submenuId && g.submenuId.startsWith(`${submenuId}/`))
        || (g.sectionId === sectionId && g.itemId === itemId && !g.submenuId)
        || (g.sectionId === sectionId && !g.itemId && !g.submenuId)
    ));
}

// Every plain General item (the 7 top-bar buttons, plus Departamento/Área/
// C. Costos below) lives at itemId level directly under 'main' — no submenu
// nesting — so its grant is keyed by itemId (sectionId 'main', submenuId
// null). The unrestricted client admin bypasses this entirely unless GEIPSA
// has set an explicit override for them from Admin-SaaS ("Accesos del
// Administrador") — an empty effectiveGrants set means "no override", not
// "nothing granted", for that one user.
function hasMainButtonPermission(itemId) {
    if (!isEstatusVisible('main', itemId, null)) return false;
    if (isUnrestrictedClientAdmin()) return true;
    return (cachedBusinessProfile?.effectiveGrants || []).some((g) => g.sectionId === 'main' && g.itemId === itemId);
}

// Departamento/Área/C. Costos inside "Configuración de Botones" are
// double-gated exactly like the 7 top-bar buttons: the CLIENT must have
// contracted them (MODULE_CATALOG, same as departments) AND the USER must
// have the grant — not by whether the real picker currently has anything to
// choose between. A profile/user granted the permission sees the shortcut
// even if, say, only one department is contracted and its real picker is
// hidden.
function syncButtonConfigShortcuts() {
    const exitShortcut = document.getElementById('logout-mode-menu-btn')?.closest('li');
    const deptShortcut = document.getElementById('button-config-dept-btn')?.closest('li');
    const areaShortcut = document.getElementById('button-config-area-btn')?.closest('li');
    const ccShortcut = document.getElementById('button-config-cc-btn')?.closest('li');
    // "Salir" isn't a contracted module (there's no per-client on/off switch
    // for it in Admin-SaaS) — only the user's own grant controls it.
    if (exitShortcut) exitShortcut.hidden = !hasMainButtonPermission('btn-salir');
    if (deptShortcut) deptShortcut.hidden = !(contractedModuleKeys.includes('btn-departamento') && hasMainButtonPermission('btn-departamento'));
    if (areaShortcut) areaShortcut.hidden = !(contractedModuleKeys.includes('btn-area') && hasMainButtonPermission('btn-area'));
    if (ccShortcut) ccShortcut.hidden = !(contractedModuleKeys.includes('btn-cc') && hasMainButtonPermission('btn-cc'));
}

// Double-gated: a button only shows for role !== 'admin' when the CLIENT has
// contracted it (MODULE_CATALOG, same mechanism as department modules) AND
// the current USER has been granted it in Accesos y Permisos — except the
// unrestricted client admin, who still needs the CLIENT to have contracted
// it (this bypass is "all you're entitled to", not "everything, period"),
// just not an individual grant on top. GEIPSA staff aren't a client with
// contracted modules, so this never touches that role.
// "Configuración" is the one top-bar button whose own itemId grant isn't a
// leaf anymore now that it has a submenu (Idioma/Estilo/Administración del
// Negocio/Configuración de Botones/Otros) — checking a parent item's box in
// PermissionTree.js grants its children, not the parent itself. So the gear
// icon shows whenever the user has been granted the parent OR any single
// child (a lingering itemId-only grant from before this submenu existed
// still works too).
const SETTINGS_SUBITEM_IDS = ['btn-idioma', 'btn-estilo', 'btn-tamano-sistema', 'btn-admin-negocio', 'btn-config-botones', 'btn-base-datos', 'btn-negocio-inteligente', 'btn-otros'];
function hasSettingsAccess() {
    if (!isEstatusVisible('main', 'btn-configuracion', null)) return false;
    if (isUnrestrictedClientAdmin()) return true;
    const grants = cachedBusinessProfile?.effectiveGrants || [];
    return grants.some((g) => {
        if (g.sectionId !== 'main' || g.itemId !== 'btn-configuracion') return false;
        if (!g.submenuId) return true;
        // "btn-admin-negocio/ab-roles" (a specific Administración del
        // Negocio screen) still counts as "has some access to Configuración"
        // even though it doesn't exactly equal "btn-admin-negocio".
        return SETTINGS_SUBITEM_IDS.some((id) => g.submenuId === id || g.submenuId.startsWith(`${id}/`));
    });
}

const TOP_BAR_BUTTONS = [
    { moduleKey: 'btn-mensajes', elementId: 'messages-btn', check: () => hasMainButtonPermission('btn-mensajes') },
    { moduleKey: 'btn-chatbot', elementId: 'chatbot-btn', check: () => hasMainButtonPermission('btn-chatbot') },
    { moduleKey: 'btn-notificaciones', elementId: 'notifications-menu', check: () => hasMainButtonPermission('btn-notificaciones') },
    { moduleKey: 'btn-marcadores', elementId: 'bookmarks-btn', check: () => hasMainButtonPermission('btn-marcadores') },
    { moduleKey: 'btn-configuracion', elementId: 'settings-menu', check: hasSettingsAccess },
    { moduleKey: 'btn-datos-usuario', elementId: 'user-info-menu', check: () => hasMainButtonPermission('btn-datos-usuario') },
    { moduleKey: 'btn-datos-usuario-negocio', elementId: 'business-profile-menu', check: () => hasMainButtonPermission('btn-datos-usuario-negocio') },
];

function syncTopBarButtonVisibility() {
    if (currentRole === 'admin') return;
    TOP_BAR_BUTTONS.forEach(({ moduleKey, elementId, check }) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        const visible = contractedModuleKeys.includes(moduleKey) && check();
        // A plain `hidden` attribute loses to ".top-bar-actions button"
        // (higher specificity, forces display:flex) in some browsers — a
        // dedicated !important class sidesteps that instead of relying on
        // [hidden]'s UA-stylesheet specificity.
        el.classList.toggle('top-bar-btn-hidden', !visible);
    });
}

// This function's own mirror image, for GEIPSA staff (role 'admin') instead
// of a client's contracted modules -- syncTopBarButtonVisibility above
// explicitly skips role==='admin', these icons were never gated by
// anything on that side at all despite Árbol Maestro SaaS already giving
// each one its own real Estatus row ("Iconos de Navegación", see
// NAV_ICON_ITEMS in Admin-ArbolMaestroSaaS.js) -- confirmed live,
// 2026-09-30, against a real zero-grant test account ("daniel.anaya"):
// every top-bar icon showed regardless of its own node being "En
// construcción". ui-scale-menu has no client-side equivalent row in
// TOP_BAR_BUTTONS (always visible for clients) but does have its own SaaS
// tree leaf, so it's included here even though it isn't above.
const SAAS_NAV_ICON_GATES = {
    'messages-btn': 'saas-nav-messages',
    'chatbot-btn': 'saas-nav-chatbot',
    'notifications-menu': 'saas-nav-notifications',
    'bookmarks-btn': 'saas-nav-bookmarks',
    'ui-scale-menu': 'saas-nav-ui-scale',
    'settings-menu': 'saas-nav-settings',
    'user-info-menu': 'saas-nav-user',
    'business-profile-menu': 'saas-nav-business',
};
function syncSaasNavIconVisibility() {
    if (currentUser?.role !== 'admin') return;
    Object.entries(SAAS_NAV_ICON_GATES).forEach(([elementId, itemId]) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.classList.toggle('top-bar-btn-hidden', !hasSaasScreenGrant(itemId));
    });
    // The sidebar's own search box -- same "todo debe de habilitarse desde
    // el árbol" rule, confirmed live 2026-09-30 against a screenshot still
    // showing Buscar/Inicio/Tablero for a zero-grant account. .search has no
    // id (shared markup across every page), and saas-search is a new
    // GENERAL_ITEMS leaf (Admin-ArbolMaestroSaaS.js), not a top-bar icon, so
    // it isn't in SAAS_NAV_ICON_GATES above.
    const searchWrap = document.querySelector('.search');
    if (searchWrap) searchWrap.classList.toggle('top-bar-btn-hidden', !hasSaasScreenGrant('saas-search'));
    // #help-mode-toggle is injected once per .top-bar-actions container
    // (see the injection IIFE above), so several elements share this id --
    // querySelectorAll, not getElementById, same reasoning setHelpModeActive
    // already uses for the same id.
    const helpModeGranted = hasSaasScreenGrant('saas-nav-help');
    document.querySelectorAll('#help-mode-toggle').forEach((btn) => {
        btn.classList.toggle('top-bar-btn-hidden', !helpModeGranted);
    });
}

// Once the gear icon itself is visible, each row inside its dropdown is
// independently gated too — Idioma/Estilo/Administración del Negocio/
// Configuración de Botones/Otros are submenu grants under "btn-configuracion"
// (see hasSettingsAccess above). Only ever ADDS hidden=true — never un-hides
// business-admin-group, which has its own independent "nothing to show" hide
// logic (renderBusinessAdminSettingsMenu) that must win when both say hide.
// A lingering item-level grant from before "Configuración" had a submenu
// (any profile/user that had the whole button checked back when it was
// still a single leaf) implies access to everything inside it — matches
// what was actually granted at the time instead of silently hiding every
// row now that the button expanded into 5. New grants are always saved at
// the child level going forward (checking "Configuración" in the tree now
// checks its 5 children instead), so this only ever matters for grants
// saved before this breakdown shipped.
function hasSettingsSubPermission(submenuId) {
    if (!isEstatusVisible('main', 'btn-configuracion', submenuId)) return false;
    if (isUnrestrictedClientAdmin()) return true;
    const grants = cachedBusinessProfile?.effectiveGrants || [];
    if (grants.some((g) => g.sectionId === 'main' && g.itemId === 'btn-configuracion' && !g.submenuId)) return true;
    // "Administración del Negocio" nests its own 9 pantallas inside
    // Configuración (see PermissionTree.js), so a granted screen there looks
    // like submenuId "btn-admin-negocio/ab-roles" — any one of them implies
    // the group itself should show.
    return grants.some((g) => g.submenuId === submenuId || (g.submenuId && g.submenuId.startsWith(`${submenuId}/`)));
}

function syncSettingsSubmenuVisibility() {
    // GEIPSA staff (role 'admin') aren't a client profile with grants — this
    // permission gating only applies to client-side users. Missing this
    // bypass (syncTopBarButtonVisibility already has it) hid ALL FIVE
    // groups for admin, not just one: cachedBusinessProfile is never
    // fetched for this role, so hasSettingsSubPermission's effectiveGrants
    // lookup always came back empty and every group got hidden.
    if (currentRole === 'admin') return;
    const languageGroup = document.getElementById('language-group');
    const styleGroup = document.getElementById('style-group');
    const businessAdminGroup = document.getElementById('business-admin-group');
    const buttonConfigGroup = document.getElementById('button-config-group');
    const databaseGroup = document.getElementById('database-group');
    const businessIntelligenceGroup = document.getElementById('business-intelligence-group');
    const othersGroup = document.getElementById('settings-others-group');
    if (languageGroup && !hasSettingsSubPermission('btn-idioma')) languageGroup.hidden = true;
    if (styleGroup && !hasSettingsSubPermission('btn-estilo')) styleGroup.hidden = true;
    if (businessAdminGroup && !hasSettingsSubPermission('btn-admin-negocio')) businessAdminGroup.hidden = true;
    if (buttonConfigGroup && !hasSettingsSubPermission('btn-config-botones')) buttonConfigGroup.hidden = true;
    if (databaseGroup && !hasSettingsSubPermission('btn-base-datos')) databaseGroup.hidden = true;
    if (businessIntelligenceGroup && !hasSettingsSubPermission('btn-negocio-inteligente')) businessIntelligenceGroup.hidden = true;
    if (othersGroup && !hasSettingsSubPermission('btn-otros')) othersGroup.hidden = true;
    // Tamaño del Sistema isn't a row inside this dropdown -- it's built as
    // its OWN separate top-bar icon (see the #ui-scale-menu wrapper further
    // down), so it never went through this function's per-row hiding at
    // all and showed for every user regardless of grant, unlike every
    // other Configuración sub-item above.
    document.querySelectorAll('#ui-scale-menu').forEach((menu) => {
        if (!hasSettingsSubPermission('btn-tamano-sistema')) menu.classList.add('top-bar-btn-hidden');
    });
}

// --- Default Departamento/Área/Centro de Costos picker — opened from
// "Configuración de Botones", lets the user pick which one should be active
// every time they log in (not just for the rest of this browsing session,
// like the real pickers). Selecting applies it immediately (same as the
// real picker) AND saves it to the account via PUT /api/me/defaults, so it
// follows them to the next login/device too. -------------------------------
const defaultPickerModal = document.getElementById('default-picker-modal');
const defaultPickerTitle = document.getElementById('default-picker-modal-title');
const defaultPickerHint = document.getElementById('default-picker-modal-hint');
const defaultPickerList = document.getElementById('default-picker-list');
const defaultPickerCcActions = document.getElementById('default-picker-cc-actions');
const defaultPickerCcSaveBtn = document.getElementById('default-picker-cc-save');

function closeDefaultPickerModal() {
    if (defaultPickerModal) defaultPickerModal.hidden = true;
}

async function saveDefaults(partial) {
    try {
        await fetch(`${API_BASE}/me/defaults`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(partial),
        });
    } catch {
        // Best-effort — the live pick (localStorage) already applied either
        // way, this only affects what shows up at the NEXT login.
    }
}

function buildDefaultPickerOption(labelText, iconClass, onSelect) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'logout-mode-option';
    const icon = document.createElement('i');
    icon.className = `bx ${iconClass}`;
    icon.setAttribute('aria-hidden', 'true');
    const span = document.createElement('span');
    span.textContent = labelText;
    btn.append(icon, span);
    btn.addEventListener('click', onSelect);
    li.appendChild(btn);
    return li;
}

function openDepartmentDefaultPicker() {
    defaultPickerTitle.textContent = t('sidebar.department');
    defaultPickerHint.textContent = t('main.defaultPickerDeptHint');
    defaultPickerCcActions.hidden = true;
    defaultPickerList.innerHTML = '';
    availableDepartments.forEach((dept) => {
        defaultPickerList.appendChild(buildDefaultPickerOption(t(dept.labelKey), dept.icon, () => {
            selectedDepartment = dept.key;
            localStorage.setItem('department', dept.key);
            selectedArea = null;
            localStorage.setItem('area', '');
            updateDeptPickerLabel();
            renderAreaPickerOptions();
            updateAreaPickerVisibility();
            renderFilteredMenu();
            saveDefaults({ department: dept.key, area: null });
            closeDefaultPickerModal();
        }));
    });
}

function openAreaDefaultPicker() {
    defaultPickerTitle.textContent = t('sidebar.area');
    defaultPickerCcActions.hidden = true;
    defaultPickerList.innerHTML = '';
    const areas = availableAreasForDepartment(selectedDepartment);
    if (!areas.length) {
        defaultPickerHint.textContent = t('main.defaultPickerAreaNoDept');
        return;
    }
    defaultPickerHint.textContent = t('main.defaultPickerAreaHint');
    areas.forEach((area) => {
        defaultPickerList.appendChild(buildDefaultPickerOption(t(area.labelKey, area.labelParams || {}), area.icon, () => {
            selectedArea = area.key;
            localStorage.setItem('area', area.key);
            updateAreaPickerLabel();
            renderFilteredMenu();
            saveDefaults({ area: area.key });
            closeDefaultPickerModal();
        }));
    });
}

function openCostCenterDefaultPicker() {
    defaultPickerTitle.textContent = t('sidebar.costCenters');
    defaultPickerHint.textContent = t('main.defaultPickerCcHint');
    defaultPickerList.innerHTML = '';
    if (!sidebarCostCenters.length) {
        defaultPickerCcActions.hidden = true;
        return;
    }
    defaultPickerCcActions.hidden = false;

    const allLi = document.createElement('li');
    const allLabel = document.createElement('label');
    allLabel.className = 'logout-mode-option';
    const allCheckbox = document.createElement('input');
    allCheckbox.type = 'checkbox';
    allCheckbox.id = 'default-picker-cc-all';
    allCheckbox.checked = sidebarCostCenters.every((cc) => isCostCenterSelected(cc.id));
    allCheckbox.addEventListener('change', () => {
        defaultPickerList.querySelectorAll('input[type="checkbox"]:not(#default-picker-cc-all)').forEach((cb) => {
            cb.checked = allCheckbox.checked;
        });
    });
    const allSpan = document.createElement('span');
    allSpan.textContent = t('sidebar.costCentersAll');
    allLabel.append(allCheckbox, allSpan);
    allLi.appendChild(allLabel);
    defaultPickerList.appendChild(allLi);

    sidebarCostCenters.forEach((cc) => {
        const li = document.createElement('li');
        const label = document.createElement('label');
        label.className = 'logout-mode-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.ccId = cc.id;
        checkbox.checked = isCostCenterSelected(cc.id);
        checkbox.addEventListener('change', () => {
            allCheckbox.checked = Array.from(
                defaultPickerList.querySelectorAll('input[type="checkbox"]:not(#default-picker-cc-all)')
            ).every((cb) => cb.checked);
        });
        const span = document.createElement('span');
        span.textContent = `${cc.code} - ${cc.name}`;
        label.append(checkbox, span);
        li.appendChild(label);
        defaultPickerList.appendChild(li);
    });
}

defaultPickerCcSaveBtn?.addEventListener('click', () => {
    const boxes = Array.from(defaultPickerList.querySelectorAll('input[type="checkbox"]:not(#default-picker-cc-all)'));
    const checkedIds = boxes.filter((cb) => cb.checked).map((cb) => Number(cb.dataset.ccId));
    selectedCostCenterIds = checkedIds.length === sidebarCostCenters.length ? 'all' : new Set(checkedIds);
    persistCostCenterSelection();
    renderCostCenterPicker();
    saveDefaults({ costCenters: selectedCostCenterIds === 'all' ? 'all' : checkedIds });
    closeDefaultPickerModal();
});

function openDefaultPickerModal(type) {
    if (!defaultPickerModal) return;
    if (type === 'department') openDepartmentDefaultPicker();
    else if (type === 'area') openAreaDefaultPicker();
    else if (type === 'costCenters') openCostCenterDefaultPicker();
    defaultPickerModal.hidden = false;
}

defaultPickerModal?.addEventListener('click', (event) => {
    if (event.target === defaultPickerModal) closeDefaultPickerModal();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && defaultPickerModal && !defaultPickerModal.hidden) closeDefaultPickerModal();
});

document.getElementById('button-config-dept-btn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    closeSettingsMenu();
    openDefaultPickerModal('department');
});
document.getElementById('button-config-area-btn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    closeSettingsMenu();
    openDefaultPickerModal('area');
});
document.getElementById('button-config-cc-btn')?.addEventListener('click', (event) => {
    event.stopPropagation();
    closeSettingsMenu();
    openDefaultPickerModal('costCenters');
});

// --- Logout: sidebar exit icon, gated by the "Menú Salir" preference
// (Preguntar antes de salir / Salir sin preguntar), picked from its own
// modal off the Settings dropdown rather than a nested menu. Not set until
// the user picks one — defaults to "confirm" so every account starts out
// asking, per instructions. ---------------------------------------------------
function getLogoutMode() {
    const stored = localStorage.getItem('logoutMode');
    return stored === 'direct' ? 'direct' : 'confirm';
}

const logoutModeMenuBtn = document.getElementById('logout-mode-menu-btn');
const logoutModeModal = document.getElementById('logout-mode-modal');

function closeLogoutModeModal() {
    if (logoutModeModal) logoutModeModal.hidden = true;
}

logoutModeMenuBtn?.addEventListener('click', () => {
    closeSettingsMenu();
    if (logoutModeModal) logoutModeModal.hidden = false;
});

logoutModeModal?.addEventListener('click', (event) => {
    if (event.target === logoutModeModal) closeLogoutModeModal();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && logoutModeModal && !logoutModeModal.hidden) closeLogoutModeModal();
});

document.querySelectorAll('.logout-mode-option').forEach((btn) => {
    if (btn.dataset.logoutMode === getLogoutMode()) {
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
    }
    btn.addEventListener('click', () => {
        localStorage.setItem('logoutMode', btn.dataset.logoutMode);
        document.querySelectorAll('.logout-mode-option').forEach((other) => {
            const isActive = other === btn;
            other.classList.toggle('active', isActive);
            other.setAttribute('aria-checked', String(isActive));
        });
        closeLogoutModeModal();
    });
});

async function performLogout() {
    if (getLogoutMode() === 'confirm') {
        // Reuse the profile if the "Datos de Usuario" panel was already
        // opened this session; otherwise fetch it just for the greeting —
        // logout is infrequent enough that one extra request here is fine.
        if (!cachedUserProfile) {
            try {
                const res = await fetch(`${API_BASE}/me/profile`);
                if (res.ok) cachedUserProfile = (await res.json()).profile;
            } catch {
                // No nickname to greet with — falls through to the generic prompt.
            }
        }

        // The auto-provisioned client-admin account's own `name` is frozen
        // as "Admin <razón social completa>" (see activateClient in db.js)
        // -- never meant to be read aloud, so it greets with the client's
        // own Apodo Empresa instead, same substitution the home screen/
        // change-history labels already make for this exact account.
        const greeting = currentUser?.isClientAdmin
            ? (clientBranding?.companyNickname || clientBranding?.companyName || currentUser?.name || '')
            : (cachedUserProfile?.nickname || currentUser?.name || currentUser?.username || '');
        const message = greeting
            ? t('sidebar.logoutConfirmGreeting', { name: greeting })
            : t('sidebar.logoutConfirm');
        if (!(await confirmDialog(message))) return;
    }

    sessionStorage.removeItem('sgn_token');
    fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
        .catch(() => {})
        .finally(() => window.location.replace('Login.html'));
}

document.getElementById('logout-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    performLogout();
});

// --- Client branding (logo, company name, institutional colors) -------------
// Only client users (anyone with a clientId — the client's own admin or any
// staff they created) have branding to show; GEIPSA/SGN staff get a 404 here
// and keep the generic SGN sidebar identity.
async function fetchClientBranding() {
    try {
        const res = await fetch(`${API_BASE}/business/branding`, { credentials: 'include' });
        if (!res.ok) return null;
        const data = await res.json();
        return data.branding || null;
    } catch {
        return null;
    }
}

// Wraps an uploaded logo (raster — PNG/JPG straight out of a FileReader,
// usually filling its whole square, hence the "boxed" look it had wherever
// shown small like the tab favicon) in an SVG that clips it to a circle with
// a transparent surround. Called once at upload time in Admin-SaaS.js /
// Business-Config.js so logoDataUrl is *stored* as SVG —
// every place that reads it (sidebar logo, favicon, preview) gets the same
// already-converted image for free. No-ops on input that's already SVG, so
// re-uploading a previously-converted logo doesn't double-wrap it.
function svgifyLogo(rasterDataUrl) {
    if (!rasterDataUrl || rasterDataUrl.startsWith('data:image/svg+xml')) return rasterDataUrl;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`
        + `<defs><clipPath id="c"><circle cx="32" cy="32" r="32"/></clipPath></defs>`
        + `<image href="${rasterDataUrl}" width="64" height="64" clip-path="url(#c)" preserveAspectRatio="xMidYMid slice"/>`
        + `</svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function applyClientBranding(branding) {
    if (!branding) return;
    // Institutional is a FULL theme variant, same depth as light/dark (see
    // :root / body.dark-mode in Inicio-en.css) — every role below maps to
    // one of those same variables, just sourced from the client's palette
    // instead of a hardcoded value. Older clients that only ever set
    // primary/secondaryColor (before the full palette existed) still get a
    // reasonable theme via ColorPalette.suggestPalette as a fallback.
    const palette = branding.colorPalette
        || (branding.primaryColor && window.ColorPalette ? window.ColorPalette.suggestPalette(branding.primaryColor) : null);
    if (palette) {
        const root = document.documentElement.style;
        root.setProperty('--institutional-bg', palette.bg || branding.secondaryColor || '#EBECF2');
        root.setProperty('--institutional-surface', palette.surface || '#FFFFFF');
        root.setProperty('--institutional-border', palette.border || '#9A9EB2');
        root.setProperty('--institutional-text-primary', palette.textPrimary || '#000000');
        root.setProperty('--institutional-text-secondary', palette.textSecondary || '#3F435D');
        root.setProperty('--institutional-accent', palette.accent || branding.primaryColor || '#1a73e8');
        root.setProperty('--institutional-accent-text', palette.accentText || '#FFFFFF');
        root.setProperty('--institutional-tooltip-bg', palette.tooltipBg || '#2A2E33');
        root.setProperty('--institutional-tooltip-text', palette.tooltipText || '#FFFFFF');
    }
    if (branding.logoDataUrl) {
        document.querySelectorAll('.brand-light, .brand-dark').forEach((img) => {
            img.src = branding.logoDataUrl;
        });
        // Browser tab icon — same swap as the sidebar logo, so whichever
        // client is logged in sees their own branding there too instead of
        // SGN's. logoDataUrl is already circular-SVG from upload time (see
        // svgifyLogo) for any client saved after that change; svgifyLogo
        // here is just a safety net for logos stored before it existed.
        const favicon = document.querySelector('link[rel="icon"]');
        if (favicon) {
            try {
                favicon.href = svgifyLogo(branding.logoDataUrl);
            } catch {
                favicon.href = branding.logoDataUrl;
            }
        }
    }
    // Apodo Empresa over the real razón social everywhere a client's own
    // name shows in the shell — same reasoning as the App home greeting
    // (see AppInicio.js): "GRUPO EMPRESARIAL INTEGRADOR DE PRODUCTOS Y
    // SERVICIOS ANAYA" isn't what anyone actually wants to read in a sidebar
    // or a browser tab, "GEIPSA" is. Falls back to the full name until a
    // client has an Apodo set.
    const displayName = branding.companyNickname || branding.companyName;
    const brandLabel = document.querySelector('.brand span');
    if (brandLabel && displayName) brandLabel.textContent = displayName;
    // Tab title: prefix whatever this page's own title already says (already
    // re-translated by applyStaticTranslations before this runs) with the
    // client's name, so e.g. "Roles" becomes "Acme Corp — Roles".
    if (displayName) {
        const titleEl = document.querySelector('title[data-i18n]');
        const pageTitle = titleEl ? t(titleEl.dataset.i18n) : document.title;
        document.title = `${displayName} — ${pageTitle}`;
    }
}

// "Base de Datos" (Settings dropdown) shows the client's own company
// abbreviation appended to the base label, e.g. "Base de Datos GEIPSA" — the
// same company_abbreviation already used to build record ids (see db.js).
function updateDatabaseMenuLabel(branding) {
    const label = document.getElementById('database-company-label');
    if (!label) return;
    const base = t('menu.databaseCompany');
    label.textContent = branding?.companyAbbreviation ? `${base} ${branding.companyAbbreviation}` : base;
}

// "Reportes > Personalizados" — sidebar. menuData.areaCategories is the ONE
// shared template every área's own "Reportes" reads from (see
// effectiveAreaCategories) — mutating cat-reportes here once means every
// área picks it up automatically, no per-área duplication needed. Each
// report's own name is free-form client data, not a translatable string, so
// it rides in via item.label (see buildMenuItem/crumbFromItem) rather than
// labelKey. Runs on every page (not just Transacciones Inteligentes), same
// as clientBranding/sidebarCostCenters just above.
async function loadPersonalizedReports() {
    try {
        const res = await fetch('/api/business/intelligent-reports', { credentials: 'include' });
        if (!res.ok) return;
        const { reports } = await res.json();
        const cat = (menuData?.areaCategories || []).find((c) => c.id === 'cat-reportes');
        const personalizados = cat?.submenu?.find((sm) => sm.id === 'reportes-personalizados');
        if (!personalizados) return;
        personalizados.submenu = (reports || []).map((report) => ({
            id: `report-${report.id}`,
            label: `${clientBranding?.companyNickname || clientBranding?.companyName || ''} - ${report.name}`,
            href: `NegocioInteligente-ReporteResultados.html?id=${report.id}`,
        }));
        renderFilteredMenu();
    } catch (err) {
        // No sidebar entries for this session's reports — not fatal, the
        // rest of the app still works, same as any other best-effort
        // sidebar enrichment (branding, cost centers) failing silently.
        console.error('Reportes personalizados: no se pudieron cargar', err);
    }
}

// --- Breadcrumb bar ----------------------------------------------------------
// "Ruta de acceso": below the top bar, shows the path used to reach the
// current screen. Computed by walking the same menuData tree that already
// builds the sidebar and the Settings dropdown (renderMenu,
// renderBusinessAdminSettingsMenu) — never hand-authored per page, so it
// can't drift out of sync with them, and it updates automatically on every
// navigation for free (each page is its own load, which re-runs
// initDashboard from scratch).
function normalizeHrefTarget(href) {
    if (!href || href === '#') return null;
    return href.split(/[?#]/)[0];
}

function currentPageFile() {
    const path = window.location.pathname;
    return path.substring(path.lastIndexOf('/') + 1) || 'Inicio-en.html';
}

// Recursively walks a menu.json-shaped item tree (item.submenu can nest
// arbitrarily deep) for the node whose href matches the current page,
// returning the chain of items from root to that match.
function findHrefTrail(items, targetFile, trail = []) {
    for (const item of items || []) {
        if (!item) continue;
        const nextTrail = [...trail, item];
        if (normalizeHrefTarget(item.href) === targetFile) return nextTrail;
        if (item.submenu?.length) {
            const found = findHrefTrail(item.submenu, targetFile, nextTrail);
            if (found) return found;
        }
    }
    return null;
}

// Every matched item becomes a non-clickable crumb: interior items (Admin.
// del Negocio, Configuración, a category group) never carry a real href of
// their own in menu.json, and the leaf that DOES have one is always the
// current page — which shouldn't link to itself either way.
function crumbFromItem(item) {
    return { label: item.label || t(item.labelKey, item.labelParams || {}), href: null };
}

// The areaCategories screens (Cat 1/2, Ope 1/2, etc.) are one shared array
// reused under whichever department + área the sidebar currently has
// selected (see applyAreaFilter) — that part of the path isn't in the tree
// itself, so it's read from the picker state instead.
function findAreaCategoryTrail(targetFile) {
    const catTrail = findHrefTrail(menuData?.areaCategories || [], targetFile);
    if (!catTrail) return null;
    const crumbs = [];
    const deptDef = DEPARTMENTS.find((d) => d.key === selectedDepartment);
    if (deptDef) crumbs.push({ label: t(deptDef.labelKey), href: null });
    const areaDef = availableAreasForDepartment(selectedDepartment).find((a) => a.key === selectedArea);
    if (areaDef) crumbs.push({ label: t(areaDef.labelKey, areaDef.labelParams || {}), href: null });
    catTrail.forEach((item) => crumbs.push(crumbFromItem(item)));
    return crumbs;
}

function computeBreadcrumbCrumbs() {
    const targetFile = currentPageFile();
    if (targetFile === 'Inicio-en.html') return [{ label: t('menu.home'), href: null }];
    const home = { label: t('menu.home'), href: 'Inicio-en.html' };

    const mainItems = menuData?.sections?.find((s) => s.id === 'main')?.items || [];
    const mainTrail = findHrefTrail(mainItems, targetFile);
    if (mainTrail) return [home, ...mainTrail.map(crumbFromItem)];

    const areaCrumbs = findAreaCategoryTrail(targetFile);
    if (areaCrumbs) return [home, ...areaCrumbs];

    // No match anywhere in the tree (a page not yet wired into menu.json) —
    // still show something sensible rather than an empty bar.
    return [home, { label: document.title, href: null }];
}

const BREADCRUMB_COLLAPSED_KEY = 'breadcrumbCollapsed';

function isBreadcrumbCollapsed() {
    return localStorage.getItem(BREADCRUMB_COLLAPSED_KEY) === 'true';
}

// Set by renderBreadcrumbBar() to the current screen's own name (the last
// crumb) — shown in the collapsed toggle instead of a generic "Ruta" label,
// so collapsing the trail doesn't lose track of which screen this is. Pages
// that skip the big .page-header h1 (see Registro de traslados) rely on
// this as their only on-screen title once the breadcrumb is collapsed.
let currentBreadcrumbLabel = '';

function setBreadcrumbCollapsed(collapsed) {
    const bar = document.getElementById('breadcrumb-bar');
    const toggle = document.getElementById('breadcrumb-toggle');
    if (!bar || !toggle) return;
    bar.classList.toggle('breadcrumb-bar-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', t(collapsed ? 'main.breadcrumbExpand' : 'main.breadcrumbCollapse'));
    const chevron = toggle.querySelector('.breadcrumb-toggle-chevron');
    if (chevron) chevron.className = `bx breadcrumb-toggle-chevron ${collapsed ? 'bx-chevron-down' : 'bx-chevron-up'}`;
    const label = toggle.querySelector('.breadcrumb-toggle-label');
    if (label) label.textContent = currentBreadcrumbLabel || t('main.breadcrumbLabel');
    localStorage.setItem(BREADCRUMB_COLLAPSED_KEY, String(collapsed));
    sizeDataTableWrappers();
}

// Built once per page and inserted right after .top-bar — every dashboard
// page already has that element, so no HTML file needs editing for the bar
// to show up everywhere.
function ensureBreadcrumbBar() {
    let bar = document.getElementById('breadcrumb-bar');
    if (bar) return bar;
    const topBar = document.querySelector('.top-bar');
    if (!topBar) return null;

    bar = document.createElement('div');
    bar.className = 'breadcrumb-bar';
    bar.id = 'breadcrumb-bar';

    const list = document.createElement('ol');
    list.className = 'breadcrumb-list';
    list.id = 'breadcrumb-list';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'breadcrumb-toggle';
    toggle.id = 'breadcrumb-toggle';
    toggle.innerHTML = '<i class="bx bx-map-alt" aria-hidden="true"></i>'
        + '<span class="breadcrumb-toggle-label"></span>'
        + '<i class="bx bx-chevron-up breadcrumb-toggle-chevron" aria-hidden="true"></i>';
    toggle.addEventListener('click', () => setBreadcrumbCollapsed(!bar.classList.contains('breadcrumb-bar-collapsed')));

    bar.append(list, toggle);
    topBar.insertAdjacentElement('afterend', bar);
    return bar;
}

function renderBreadcrumbBar() {
    const bar = ensureBreadcrumbBar();
    if (!bar) return;
    const list = document.getElementById('breadcrumb-list');
    list.innerHTML = '';
    const crumbList = computeBreadcrumbCrumbs();
    currentBreadcrumbLabel = crumbList[crumbList.length - 1]?.label || '';
    crumbList.forEach((crumb, index, crumbs) => {
        const li = document.createElement('li');
        li.className = 'breadcrumb-item';
        const isCurrent = index === crumbs.length - 1;
        if (crumb.href && !isCurrent) {
            const a = document.createElement('a');
            a.href = crumb.href;
            a.textContent = crumb.label;
            li.appendChild(a);
        } else {
            const span = document.createElement('span');
            span.textContent = crumb.label;
            if (isCurrent) span.setAttribute('aria-current', 'page');
            li.appendChild(span);
        }
        list.appendChild(li);
    });
    setBreadcrumbCollapsed(isBreadcrumbCollapsed());
}

// --- Collapsible top bar -------------------------------------------------
// "Optimizar la pantalla, solo cuando se requiera": the top bar (department/
// área/centro de costos pickers, welcome text, action icons) can be
// collapsed down to just a small arrow, reclaiming vertical space, without
// losing anything — clicking the arrow brings it right back. Manual only
// (no auto-collapse on scroll or anything), same collapse/persist pattern
// as the breadcrumb bar above, and injected here for the same reason: one
// shared place instead of editing every page's HTML.
const TOP_BAR_COLLAPSED_KEY = 'topBarCollapsed';

function isTopBarCollapsed() {
    return localStorage.getItem(TOP_BAR_COLLAPSED_KEY) === 'true';
}

function setTopBarCollapsed(collapsed) {
    const bar = document.querySelector('.top-bar');
    const toggle = document.getElementById('top-bar-collapse-toggle');
    if (!bar || !toggle) return;
    bar.classList.toggle('top-bar-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', t(collapsed ? 'main.topBarExpand' : 'main.topBarCollapse'));
    const icon = toggle.querySelector('i');
    if (icon) icon.className = `bx ${collapsed ? 'bx-chevron-down' : 'bx-chevron-up'}`;
    localStorage.setItem(TOP_BAR_COLLAPSED_KEY, String(collapsed));
    sizeDataTableWrappers();
}

function renderTopBarCollapseToggle() {
    const bar = document.querySelector('.top-bar');
    if (!bar) return;
    let toggle = document.getElementById('top-bar-collapse-toggle');
    if (!toggle) {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.id = 'top-bar-collapse-toggle';
        toggle.className = 'top-bar-collapse-toggle';
        toggle.innerHTML = '<i class="bx bx-chevron-up" aria-hidden="true"></i>';
        toggle.addEventListener('click', () => setTopBarCollapsed(!bar.classList.contains('top-bar-collapsed')));
        bar.appendChild(toggle);
    }
    setTopBarCollapsed(isTopBarCollapsed());
}

// --- Public entry point --------------------------------------------------------
// Call once per page: await Dashboard.initDashboard({ activePage: 'clients' }).
// Returns the user's role, or null if the user was redirected to Login.html.
// Runs once, right after a fresh login (see the 'applyLoginDefaults' flag
// set in login.js) — pulls this account's saved default Departamento/Área/
// Centro de Costos from the server and seeds localStorage + the in-memory
// selection with it, same as if the user had just picked it themselves.
// A no-op on ordinary page navigation within an already-open session, so it
// never fights a live pick made via the real pickers mid-session.
async function applyLoginDefaultsIfNeeded() {
    if (sessionStorage.getItem('applyLoginDefaults') !== '1') return;
    sessionStorage.removeItem('applyLoginDefaults');
    try {
        const res = await fetch(`${API_BASE}/me/defaults`, { credentials: 'include' });
        if (!res.ok) return;
        const { defaults } = await res.json();
        if (!defaults) return;
        if (defaults.department) {
            selectedDepartment = defaults.department;
            localStorage.setItem('department', defaults.department);
        }
        if (defaults.area) {
            selectedArea = defaults.area;
            localStorage.setItem('area', defaults.area);
        }
        if (defaults.costCenters) {
            selectedCostCenterIds = defaults.costCenters === 'all' ? 'all' : new Set(defaults.costCenters);
            persistCostCenterSelection();
        }
    } catch {
        // Keep whatever's already in localStorage — no worse than before.
    }
}

async function initDashboard({ activePage } = {}) {
    const role = await authGuard();
    if (!role) return null;
    currentRole = role;
    const [, uiScaleLevel] = await Promise.all([loadLanguage(getStoredLang()), fetchUiScaleLevel()]);
    applyUiScaleLevel(uiScaleLevel);
    if (role !== 'admin') {
        // Right after a fresh login (flag set by login.js), the account's
        // saved default Departamento/Área/Centro de Costos overrides
        // whatever's left in localStorage from a previous session — applied
        // before any of the validation below so an invalid/uncontracted
        // default still gets corrected the same way a stale localStorage
        // pick would.
        await applyLoginDefaultsIfNeeded();
        // Narrow the department picker to what this client actually
        // contracted — resolve before the first render so there's no
        // flash of an uncontracted department. If the previously-selected
        // one (or nothing) isn't in that list anymore, fall back to the
        // single contracted department when there's exactly one, or clear
        // it otherwise.
        // Also load this user's own business profile (position/role/grants)
        // now, in parallel — "Configuración de Botones" needs their granted
        // permissions ready before the first render, not just whenever they
        // happen to open the "Datos de Usuario del Negocio" panel.
        [contractedModuleKeys] = await Promise.all([fetchContractedModuleKeys(), loadBusinessProfile()]);
        // "Pantalla habilitada" — direct-URL block for the handful of real
        // pages mapped in SCREEN_GRANT_PATHS (sidebar-hiding alone doesn't
        // stop someone who already knows/bookmarked the URL). cachedBusinessProfile
        // is populated by loadBusinessProfile() above, so this check is safe here.
        if (activePage && !hasScreenAccess(activePage)) {
            window.location.replace('Inicio-en.html');
            return null;
        }
        availableDepartments = DEPARTMENTS.filter((d) => contractedModuleKeys.includes(d.key) && isEstatusVisible(d.key, null, null));
        // Narrow further to departments this SPECIFIC user actually has any
        // grant in (their Puesto de Trabajo's defaults + Permisos
        // Adicionales, already loaded into cachedBusinessProfile.effectiveGrants
        // by loadBusinessProfile() above) -- an unrestricted client admin
        // (Admin+ABBR, or the Capacitación account) skips this: they have
        // zero grant rows by design, which means "sees everything", not
        // "sees nothing" (see isUnrestrictedClientAdmin's own comment). The
        // Estatus filter just above still applies to them either way.
        if (!isUnrestrictedClientAdmin()) {
            const grantedSectionIds = new Set((cachedBusinessProfile?.effectiveGrants || []).map((g) => g.sectionId));
            availableDepartments = availableDepartments.filter((d) => grantedSectionIds.has(d.key));
        }
        if (!availableDepartments.some((d) => d.key === selectedDepartment)) {
            selectedDepartment = availableDepartments.length === 1 ? availableDepartments[0].key : null;
            localStorage.setItem('department', selectedDepartment || '');
            selectedArea = null;
            localStorage.setItem('area', '');
        }
        renderDeptPickerOptions();
    } else {
        // GEIPSA staff (role 'admin') — load this account's own SaaS
        // grants (Equipo SaaS) before the sidebar renders, same reasoning
        // as loadBusinessProfile() above for client users, then block
        // direct URL access to a SaaS screen this admin isn't granted.
        await Promise.all([loadSaasGrants(), loadSaasMasterOrder()]);
        if (activePage && !hasSaasScreenAccess(activePage)) {
            window.location.replace('Inicio-en.html');
            return null;
        }
    }
    menuData = await loadMenu();
    menuData = buildSidebarData(menuData, role, activePage);
    // loadBusinessProfile() above already rendered the "Datos de Usuario del
    // Negocio" summary once, but at that point menuData was still null —
    // any department-level grant's resolveGrantLabel() call degraded to
    // just the department name (or, before Área existed in the tree, a raw
    // id). Re-render now that menuData is actually populated. No-op for
    // admin/no-profile accounts (renderBusinessProfile() itself no-ops
    // without cachedBusinessProfile).
    renderBusinessProfile();
    renderFilteredMenu();
    updateDeptPickerLabel();
    renderAreaPickerOptions();
    checkWindowSize();
    // GEIPSA staff have nothing to filter by department (their sidebar is
    // fixed to Inicio/Tablero/Administración de Clientes), so the picker
    // itself shouldn't even be offered. Clients with 0 or 1 contracted
    // departments don't need to pick either — there's nothing to choose.
    document.getElementById('dept-picker')?.classList.toggle(
        'dept-picker-disabled', role === 'admin' || availableDepartments.length <= 1
    );
    if (role === 'admin') {
        document.getElementById('area-picker')?.classList.add('dept-picker-disabled');
    } else {
        updateAreaPickerVisibility();
    }
    if (role !== 'admin') {
        clientBranding = await fetchClientBranding();
        applyClientBranding(clientBranding);
        updateDatabaseMenuLabel(clientBranding);
        await initCostCenterPicker();
        await loadPersonalizedReports();
    } else {
        document.getElementById('cc-picker')?.classList.add('cc-picker-disabled');
    }
    syncButtonConfigShortcuts();
    syncTopBarButtonVisibility();
    syncSaasNavIconVisibility();
    syncSettingsSubmenuVisibility();
    // Restore the saved style now that clientBranding (needed for
    // Institutional's real colors) has loaded — every other page load was
    // resetting back to Light since nothing re-applied the choice.
    applyStyle(getStoredStyle());
    renderBreadcrumbBar();
    renderTopBarCollapseToggle();
    renderDataTableZoomControls();
    renderDataTableColumnControls();
    // Both build their own buttons (data-zoom/data-col-action) fresh right
    // above -- tag them with their Modo ayuda content now instead of
    // waiting for a language switch that may never happen this session.
    applyHelpContentKeys();
    sizeDataTableWrappers();
    // Confirms the .brand click actually did something -- a bare
    // location.reload() wipes all JS state before any toast could render,
    // so the click sets this flag first (see the .brand handler below) and
    // this reads it back on the page that comes up after the reload.
    if (sessionStorage.getItem('sgnShowUpdateToast')) {
        sessionStorage.removeItem('sgnShowUpdateToast');
        showToast(t('main.updateDone'), 'success');
    }
    return role;
}

// Column-level permission (Solo Ver / Ver y Operar / Editar + Autorizar) —
// a cell whose value is already saved stays locked (visible, not editable)
// unless the viewer is the client's own admin (unconditional bypass,
// confirmed product decision), holds 'ver-y-operar'/'editar' to fill an
// EMPTY cell, or holds 'editar' to request a change on an already-filled
// one (which then waits for approval — see the `pending` option on
// attachInlineEdit below, driven by the server's own pendingFields, never
// decided client-side). The actual enforcement is server-side (server.js's
// checkAndLogFieldChanges) — this is purely UI convenience so a locked cell
// never even offers to edit.
// Mirrors TABLE_GRANT_PATHS in db.js — each editable pantalla's column
// grants live as ordinary leaves of its OWN node in the menu tree (see
// public/data/menu.json, PermissionTree.js's Tabla/Columna rendering), not
// a separate namespace, so this must point at the exact same
// {sectionId, itemId, submenuPrefix} the server checks. Keep both in sync
// by hand when a table's pantalla moves in the tree or a new table is added.
const TABLE_GRANT_PATHS = {
    'centros-costo': { sectionId: 'main', itemId: 'btn-configuracion', submenuPrefix: 'btn-admin-negocio/ab-contracted-service/ab-our-cost-centers' },
    'registro-combustible': { sectionId: 'supply-chain', itemId: 'sc-area-transport-1', submenuPrefix: 'cat-operaciones/cat-operaciones-transporte-vol-combustible' },
    'carga-combustible': { sectionId: 'supply-chain', itemId: 'sc-area-transport-1', submenuPrefix: 'cat-operaciones/cat-operaciones-transporte-vol-carga-combustible' },
    'tipos-unidad': { sectionId: 'supply-chain', itemId: 'sc-area-transport-1', submenuPrefix: 'cat-catalogos/cat-catalogos-transporte-vol-tipos-unidades' },
    'nuestras-unidades': { sectionId: 'supply-chain', itemId: 'sc-area-transport-1', submenuPrefix: 'cat-operaciones/cat-operaciones-transporte-vol-nuestras-unidades' },
    'mi-recurso-humano': { sectionId: 'human-resources', itemId: 'hr-area-personnel-admin', submenuPrefix: 'cat-operaciones/cat-operaciones-rrhh-mi-recurso-humano' },
    'transacciones-inteligentes': { sectionId: 'main', itemId: 'btn-configuracion', submenuPrefix: 'btn-negocio-inteligente/nit-transacciones' },
    'reportes-programados': { sectionId: 'main', itemId: 'btn-configuracion', submenuPrefix: 'btn-negocio-inteligente/nit-reportes-programados' },
    'reglas-orden-llenado': { sectionId: 'main', itemId: 'btn-configuracion', submenuPrefix: 'btn-gestion-reglas-orden' },
    // Same 12 paths db.js's own TABLE_GRANT_PATHS already uses for these
    // tables' server-side column checks -- mirrored here too now that each
    // one gets a real iconsSubmenu in menu.json (see that commit), so
    // hasIconGrant actually enforces those grants instead of defaulting
    // to "always visible" for a tableKey it doesn't recognize.
    'nuestros-articulos': { sectionId: 'supply-chain', itemId: 'sc-area-distribution-center', submenuPrefix: 'cat-operaciones/cat-operaciones-centro-dist-alta-articulos' },
    'categorias-inventario': { sectionId: 'supply-chain', itemId: 'sc-area-distribution-center', submenuPrefix: 'cat-catalogos/cat-catalogos-centro-dist-categorias-inventario' },
    'categorias-compra': { sectionId: 'supply-chain', itemId: 'sc-area-distribution-center', submenuPrefix: 'cat-catalogos/cat-catalogos-centro-dist-categorias-compra' },
    'categorias-almacenamiento': { sectionId: 'supply-chain', itemId: 'sc-area-distribution-center', submenuPrefix: 'cat-catalogos/cat-catalogos-centro-dist-categorias-almacenamiento' },
    'categorias-rotacion': { sectionId: 'supply-chain', itemId: 'sc-area-distribution-center', submenuPrefix: 'cat-catalogos/cat-catalogos-centro-dist-categorias-rotacion' },
    'categorias-manejo': { sectionId: 'supply-chain', itemId: 'sc-area-distribution-center', submenuPrefix: 'cat-catalogos/cat-catalogos-centro-dist-categorias-manejo' },
    'categorias-riesgo': { sectionId: 'supply-chain', itemId: 'sc-area-distribution-center', submenuPrefix: 'cat-catalogos/cat-catalogos-centro-dist-categorias-riesgo' },
    'categorias-vidautil': { sectionId: 'supply-chain', itemId: 'sc-area-distribution-center', submenuPrefix: 'cat-catalogos/cat-catalogos-centro-dist-categorias-vidautil' },
    'unidad-medida': { sectionId: 'supply-chain', itemId: 'sc-area-distribution-center', submenuPrefix: 'cat-catalogos/cat-catalogos-centro-dist-unidad-medida' },
    'nuestras-cotizaciones': { sectionId: 'supply-chain', itemId: 'sc-area-transport-1', submenuPrefix: 'cat-operaciones/cat-operaciones-transporte-vol-cotizaciones' },
    'nuestros-traslados': { sectionId: 'supply-chain', itemId: 'sc-area-transport-1', submenuPrefix: 'cat-operaciones/cat-operaciones-transporte-vol-nuestros-traslados' },
    'tipos-cliente': { sectionId: 'supply-chain', itemId: 'sc-area-transport-1', submenuPrefix: 'cat-catalogos/cat-catalogos-transporte-vol-tipos-cliente' },
};

// "Pantalla habilitada" — direct-URL page-load block, on top of the
// sidebar-hiding applyScreenGrantFilter already does. Only mapped for
// pantallas with a REAL page behind them and an UNAMBIGUOUS single spot in
// the tree (an área override, not the shared areaCategories template —
// something like "cat-catalogos-1" is reused verbatim under ~40 different
// áreas, so a bare activePage id alone can't say which one a given session
// is even in; those stay sidebar-filtered only, not URL-blocked). Keyed by
// the same `activePage` id every page.js already passes to initDashboard.
const SCREEN_GRANT_PATHS = {
    'cat-operaciones-transporte-vol-combustible': TABLE_GRANT_PATHS['registro-combustible'],
    'cat-operaciones-rrhh-mi-recurso-humano': TABLE_GRANT_PATHS['mi-recurso-humano'],
    'cat-operaciones-transporte-vol-traslados': { sectionId: 'supply-chain', itemId: 'sc-area-transport-1', submenuPrefix: 'cat-admin/cat-operaciones-transporte-vol-traslados' },
    'cat-catalogos-puestos-trabajo': { sectionId: 'human-resources', itemId: 'hr-area-personnel-admin', submenuPrefix: 'cat-catalogos/cat-catalogos-puestos-trabajo' },
    'cat-gestion-reglas-orden': TABLE_GRANT_PATHS['reglas-orden-llenado'],
};

function hasScreenAccess(activePage) {
    const path = SCREEN_GRANT_PATHS[activePage];
    if (!path) return true; // not one of the mapped pages — unaffected, same as today
    return hasScreenGrant(path.sectionId, path.itemId, path.submenuPrefix);
}

// The 13 "Control Interno" columns sit one level deeper in menu.json than a
// table's own columns (nested inside a "class-control-interno" classification
// group) — mirrors SYSTEM_COLUMN_IDS/columnSubmenuBase in db.js exactly. Any
// OTHER column keeps its shallower path.
const SYSTEM_COLUMN_CLASSIFICATION = 'class-control-interno';
const SYSTEM_COLUMN_IDS = new Set([
    'colSysEmpresa', 'colSysArea', 'colSysModulo', 'colSysPantalla', 'colSysCentroCostos',
    'colSysFecha', 'colSysDiaNum', 'colSysDiaTexto', 'colSysMesNum', 'colSysMesTexto',
    'colSysAnio', 'colSysSemana', 'colSysHora',
]);
function columnSubmenuBase(path, colKey) {
    return SYSTEM_COLUMN_IDS.has(colKey) ? `${path.submenuPrefix}/${SYSTEM_COLUMN_CLASSIFICATION}/${colKey}` : `${path.submenuPrefix}/${colKey}`;
}

// No grant at all on a column behaves as 'solo-ver' — mirrors
// getColumnGrantLevel in db.js exactly (kept in sync by hand, same as
// TABLE_GRANT_PATHS itself).
function getColumnGrantLevel(tableKey, colKey) {
    if (!!currentUser?.isClientAdmin) return 'editar';
    const path = TABLE_GRANT_PATHS[tableKey];
    if (!path) return 'solo-ver';
    const base = columnSubmenuBase(path, colKey);
    const grants = cachedBusinessProfile?.effectiveGrants || [];
    const has = (level) => grants.some((g) => g.sectionId === path.sectionId && g.itemId === path.itemId && g.submenuId === `${base}/${level}`);
    if (has('editar')) return 'editar';
    if (has('ver-y-operar')) return 'ver-y-operar';
    return 'solo-ver';
}
function hasColumnEditGrant(tableKey, colKey) {
    return getColumnGrantLevel(tableKey, colKey) === 'editar';
}
// Independent 5th grant, same shape as Autorizar -- mirrors
// canDeleteColumn in db.js exactly (kept in sync by hand, same as
// TABLE_GRANT_PATHS itself). Used to hide a screen's Eliminar button
// client-side instead of just letting the click land on a 403.
function hasColumnDeleteGrant(tableKey, colKey) {
    if (!!currentUser?.isClientAdmin) return true;
    const path = TABLE_GRANT_PATHS[tableKey];
    if (!path) return false;
    const base = columnSubmenuBase(path, colKey);
    const grants = cachedBusinessProfile?.effectiveGrants || [];
    return grants.some((g) => g.sectionId === path.sectionId && g.itemId === path.itemId && g.submenuId === `${base}/eliminar`);
}

// Toolbar icons (Fijar/Visibilidad/Historial/Leyenda/Filtro/Limpiar/Zoom) —
// a simple yes/no leaf under "Iconos Personalización" in the tree (see
// PermissionTree.js: renderIconPermissions), unlike a column's 3-tier Solo
// Ver/Ver y Operar/Editar. A table with no TABLE_GRANT_PATHS entry (or no
// "Iconos Personalización" branch in menu.json at all) never gates its
// icons -- this only takes effect for a pantalla that actually opted in.
function hasIconGrant(tableKey, iconId) {
    if (!!currentUser?.isClientAdmin) return true;
    const path = TABLE_GRANT_PATHS[tableKey];
    if (!path) return true;
    const grants = cachedBusinessProfile?.effectiveGrants || [];
    return grants.some((g) => (
        g.sectionId === path.sectionId && g.itemId === path.itemId && g.submenuId === `${path.submenuPrefix}/${iconId}`
    ));
}
// Dispatcher every icon-grant check site calls instead of hasIconGrant
// directly -- hasSaasTableIconGrant returns null for a tableKey it doesn't
// recognize (any client table), so this transparently falls back to the
// original client-side check there, and only diverts to the SaaS Estatus
// check for the SaaS admin tables (SAAS_TABLE_ICON_SCREENS).
function resolveIconGrant(tableKey, iconId) {
    const saasResult = hasSaasTableIconGrant(tableKey, iconId);
    return saasResult !== null ? saasResult : hasIconGrant(tableKey, iconId);
}
// `pending` (whether the SERVER already reported this exact field as
// awaiting approval, via GET .../fuel-records|hr-workers' pendingFields)
// always wins — a field under review can't be touched again until it
// resolves, regardless of grant level.
function canEditField(tableKey, colKey, currentValue, pending = false) {
    if (pending) return false;
    if (!!currentUser?.isClientAdmin) return true;
    const hasValue = currentValue !== '' && currentValue != null && currentValue !== 0;
    const level = getColumnGrantLevel(tableKey, colKey);
    if (!hasValue) return level === 'ver-y-operar' || level === 'editar';
    // Filled + 'editar': still clickable — submitting goes through the
    // server's pending-approval flow instead of applying immediately, it
    // isn't blocked outright like 'solo-ver'/'ver-y-operar' are here.
    return level === 'editar';
}

// --- Evidence upload/download (shared by Registro Combustible and Carga ----
// --- Combustible's photo-evidence cells) — see the "Nuestros Respaldos" ----
// --- plan. Files never pass through this Node server: the browser PUTs ----
// --- straight to R2 via a short-lived presigned URL. ------------------------
// Downscales to at most `maxDim` on the longest side and re-encodes as JPEG
// at `quality` — a phone photo from these screens' <input accept="image/*">
// is routinely 3-5 MB; this keeps evidence uploads small without a visible
// quality loss at the size they're ever viewed at. Non-image files (there
// are none today, accept is always 'image/*' on these controls) pass through
// untouched rather than failing.
async function compressImageToBlob(file, maxDim = 1280, quality = 0.7) {
    if (!file.type || !file.type.startsWith('image/')) return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob || file;
}

// Compresses, asks the server for a presigned PUT URL (server checks the
// caller can actually edit this field), then PUTs directly to R2. Returns
// the short storage key to PATCH onto the record — never the file itself.
async function uploadEvidenceFile(file, { tableKey, recordId, fieldKey }) {
    const blob = await compressImageToBlob(file);
    const contentType = blob.type || file.type || 'application/octet-stream';
    const res = await fetch('/api/business/evidence-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableKey, recordId, fieldKey, contentType }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.message || 'evidence-upload-url failed');
        err.status = res.status;
        throw err;
    }
    const { uploadUrl, key } = await res.json();
    const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
    if (!putRes.ok) throw new Error('R2 upload failed');
    return key;
}

// Resolves a stored evidence value (either a migrated R2 key or a legacy
// data: URL, see db.js's own migration-safe comment) to a URL an <img> can
// load — a data: URL is already directly usable, a key needs a fresh
// presigned GET first.
async function getEvidenceDownloadUrl({ tableKey, recordId, fieldKey }) {
    const params = new URLSearchParams({ tableKey, recordId, fieldKey });
    const res = await fetch(`/api/business/evidence-download-url?${params}`, { credentials: 'include' });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'evidence-download-url failed');
    }
    const { url } = await res.json();
    return url;
}

// --- Inline cell editing (shared by Registro Combustible, Mi Recurso -------
// --- Humano, and any future .data-table with click-to-edit cells) ----------
// Click a cell to turn it into an <input>; Enter or blur commits back to
// plain text, Escape discards. `disabled`/`setDisabled` are for page-owned
// business logic (e.g. Registro Combustible's Motivo Carga <-> consecutivos
// relationship) — separate from the `tableKey`/`colKey` lock, which is
// permission-driven and applies automatically the moment a cell has a value:
// pass both to opt a cell into locking, omit them and it never locks (so
// older/simpler callers keep working unchanged).
function attachInlineEdit(td, { value = '', inputType = 'text', formatDisplay, onCommit, disabled = false, disabledText, tableKey, colKey, pending = false } = {}) {
    let current = value;
    let isDisabled = disabled;
    let isPending = pending;

    function isLocked() {
        if (!tableKey || !colKey) return false;
        return !canEditField(tableKey, colKey, current, isPending);
    }

    function renderDisplay() {
        td.innerHTML = '';
        if (isDisabled) {
            td.classList.remove('editable-cell', 'editable-cell-locked', 'editable-cell-pending');
            td.classList.add('editable-cell-disabled');
            td.textContent = disabledText ?? '—';
            td.onclick = null;
            return;
        }
        const hasValue = current !== '' && current != null;
        // An empty numeric/money cell renders as a "+ Agregar" placeholder,
        // not "—" — applyFieldFillRules (Reglas de Orden de Llenado) can't
        // tell that apart from real text by reading textContent alone, so
        // it checks this marker first instead.
        td.dataset.dtEmpty = hasValue ? '' : '1';
        const span = document.createElement('span');
        span.className = hasValue ? 'editable-cell-value' : 'editable-cell-value editable-cell-placeholder';
        span.textContent = hasValue ? (formatDisplay ? formatDisplay(current) : current) : t('main.fuelAddValue');
        if (isPending) {
            td.classList.remove('editable-cell', 'editable-cell-disabled', 'editable-cell-locked');
            td.classList.add('editable-cell-pending');
            td.appendChild(span);
            const clock = document.createElement('i');
            clock.className = 'bx bx-time-five editable-cell-lock-icon';
            clock.setAttribute('aria-hidden', 'true');
            td.appendChild(clock);
            td.title = t('main.changePending');
            td.onclick = null;
            return;
        }
        if (isLocked()) {
            td.classList.remove('editable-cell', 'editable-cell-disabled', 'editable-cell-pending');
            td.classList.add('editable-cell-locked');
            td.appendChild(span);
            const lock = document.createElement('i');
            lock.className = 'bx bx-lock-alt editable-cell-lock-icon';
            lock.setAttribute('aria-hidden', 'true');
            td.appendChild(lock);
            td.title = t('main.fieldLocked');
            td.onclick = null;
            return;
        }
        td.classList.remove('editable-cell-disabled', 'editable-cell-locked', 'editable-cell-pending');
        td.classList.add('editable-cell');
        td.appendChild(span);
        td.title = t('main.fuelClickToEdit');
        td.onclick = enterEditMode;
    }

    function enterEditMode() {
        td.onclick = null;
        td.innerHTML = '';
        const input = document.createElement('input');
        input.type = inputType;
        input.className = 'editable-cell-input';
        input.value = current;
        if (inputType === 'number') { input.step = '0.01'; input.min = '0'; }
        td.appendChild(input);
        input.focus();
        input.select();
        const commit = () => {
            current = input.value;
            if (onCommit) onCommit(current);
            renderDisplay();
            // This cell may be someone else's gate (see Reglas de Orden de
            // Llenado) -- inline-edit patches this <td> in place rather than
            // rebuilding the row, so nothing else would notice its value
            // just changed unless this re-evaluates dependents itself.
            if (tableKey) applyFieldFillRules(tableKey);
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') input.blur();
            if (event.key === 'Escape') renderDisplay();
        });
    }

    renderDisplay();
    return {
        getValue: () => current,
        setDisabled(next, text) {
            isDisabled = next;
            if (isDisabled) current = '';
            disabledText = text ?? disabledText;
            renderDisplay();
        },
        setPending(next) {
            isPending = next;
            renderDisplay();
        },
    };
}

// Costo Accesos-Permisos / Nuestros Planes — no currency concept exists
// anywhere else in the app; MXN/USD is the whole catalog for now (see
// PATCH /api/admin/plans/:id's validation, server.js).
function formatCurrency(amount, currency = 'MXN') {
    const symbol = currency === 'USD' ? 'US$' : '$';
    return `${symbol}${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// Per-plan change history (plans are GEIPSA-wide, not client-scoped, so
// they can't use openChangeHistory's client-scoped table-changes endpoint)
// — used by Admin-Planes.js's own Cambios icon per plan row, against
// GET /api/admin/plans/:id/changes.
let planHistoryModal = null;
let planHistoryList = null;

function ensurePlanHistoryModal() {
    if (planHistoryModal) return;
    planHistoryModal = document.createElement('div');
    planHistoryModal.className = 'modal-overlay';
    planHistoryModal.hidden = true;
    // Same 6-column shape openChangeHistory's own canonical table uses
    // everywhere else (Fecha/Usuario/Registro/Cambio/Solicitó/Autorizó) --
    // confirmed with the user: no screen keeps a reduced 3-column version
    // anymore. Registro is this same Plan's own name on every row (the
    // modal is already scoped to one plan); Solicitó/Autorizó always "—"
    // here since plan_changes has no requested_by/authorized_by at all
    // (Planes has no approval workflow, same as every other screen's own
    // history shows "—" for any edit that didn't go through Autorizar).
    planHistoryModal.innerHTML = `
        <div class="modal-panel" style="max-width: 56rem;" role="dialog" aria-modal="true" aria-labelledby="plan-history-title">
            <h3 id="plan-history-title">${t('admin.planChangeHistory')}</h3>
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>${t('main.changeHistoryDate')}</th>
                            <th>${t('main.changeHistoryUser')}</th>
                            <th>${t('main.changeHistoryRecord')}</th>
                            <th>${t('main.changeHistoryChange')}</th>
                            <th>${t('main.changeHistoryRequestedBy')}</th>
                            <th>${t('main.changeHistoryAuthorizedBy')}</th>
                        </tr>
                    </thead>
                    <tbody data-role="list"></tbody>
                </table>
            </div>
            <div class="admin-form-actions" style="margin-top: 1.25rem;">
                <button type="button" class="btn btn-secondary" data-role="close">${t('admin.cancel')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(planHistoryModal);
    planHistoryList = planHistoryModal.querySelector('[data-role="list"]');
    const close = () => { planHistoryModal.hidden = true; };
    planHistoryModal.querySelector('[data-role="close"]').addEventListener('click', close);
    planHistoryModal.addEventListener('click', (event) => { if (event.target === planHistoryModal) close(); });
}

function planHistoryRow(cells) {
    const tr = document.createElement('tr');
    cells.forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
    });
    return tr;
}

async function openPlanChangeHistory(plan) {
    ensurePlanHistoryModal();
    planHistoryModal.hidden = false;
    planHistoryList.innerHTML = '';
    planHistoryList.appendChild(planHistoryRow([t('main.changeHistoryEmpty'), '', '', '', '', '']));
    try {
        const res = await fetch(`/api/admin/plans/${plan.id}/changes`, { credentials: 'include' });
        if (!res.ok) return;
        const { changes } = await res.json();
        if (!changes || !changes.length) return;
        planHistoryList.innerHTML = '';
        changes.forEach((change) => {
            let description;
            if (change.action === 'create') description = t('main.changeHistoryCreated');
            else if (change.action === 'delete') description = t('main.changeHistoryDeleted');
            else if (change.field_key === 'admin.activeTree') description = `${t('admin.planTreeTitle')}: ${change.new_value} permisos`;
            else if (change.field_key === 'admin.accessPermissionsCost') description = `${t('admin.accessPermCostColumn')}: ${change.new_value} costos`;
            else description = `${t(change.field_key) || change.field_key}: "${change.old_value || '—'}" → "${change.new_value || '—'}"`;
            planHistoryList.appendChild(planHistoryRow([change.changed_at, change.changed_by || '—', plan.name, description, '—', '—']));
        });
    } catch {
        // Leave the empty-state row in place — no network/parse errors surfaced here.
    }
}

window.Dashboard = {
    initDashboard,
    t,
    svgifyLogo,
    attachInlineEdit,
    uploadEvidenceFile,
    getEvidenceDownloadUrl,
    compressImageToBlob,
    // Raw (unfiltered) department/área catalog -- Admin-MaterialApoyo.js
    // uses these directly since a GEIPSA/SaaS account has no client grants
    // to filter by (unlike availableAreasForDepartment above, which is
    // client-side-user-scoped on purpose).
    DEPARTMENTS,
    AREAS_BY_DEPARTMENT,
    hasColumnEditGrant,
    hasColumnDeleteGrant,
    canEditField,
    openChangeHistory,
    hasSaasScreenGrant,
    formatCurrency,
    openPlanChangeHistory,
    get lang() { return currentLang; },
    get role() { return currentRole; },
    get isClientAdmin() { return !!currentUser?.isClientAdmin; },
    get selectedDepartment() { return selectedDepartment; },
    get selectedArea() { return selectedArea; },
    getPanelCategories,
    // "Centro Costos" (Control Interno system column) at record-creation
    // time — only meaningful when exactly one cost center is active in the
    // top-bar picker; 'all' or several selected is ambiguous for "which one
    // does this new record belong to", so it's left blank rather than
    // guessing (the record can still be found through every other Control
    // Interno column).
    get selectedCostCenterLabel() {
        if (!(selectedCostCenterIds instanceof Set) || selectedCostCenterIds.size !== 1) return '';
        const cc = sidebarCostCenters.find((c) => c.id === Array.from(selectedCostCenterIds)[0]);
        return cc ? `${cc.code} - ${cc.name}` : '';
    },
    get companyName() { return clientBranding?.companyName || ''; },
    // "Apodo Empresa" — falls back to companyName since not every client
    // bothers setting a nickname. Same fallback order already repeated by
    // hand at the personalized-reports/logout-greeting/database-menu-label
    // call sites (loadPersonalizedReports, displayName, updateDatabaseMenuLabel)
    // -- exposed here so a new page doesn't need its own copy of it.
    get companyNickname() { return clientBranding?.companyNickname || clientBranding?.companyName || ''; },
    // Raw keys + already-translated labels for whichever Departamento/Área
    // the top-bar pickers currently have selected -- same lookup
    // findAreaCategoryTrail already does for breadcrumbs, exposed here so a
    // areaCategories-template screen (e.g. Material Apoyo) can scope its own
    // fetches without duplicating the DEPARTMENTS/AREAS_BY_DEPARTMENT lookup.
    currentDepartmentArea() {
        const deptDef = DEPARTMENTS.find((d) => d.key === selectedDepartment);
        const areaDef = availableAreasForDepartment(selectedDepartment).find((a) => a.key === selectedArea);
        return {
            department: selectedDepartment || '',
            area: selectedArea || '',
            departmentLabel: deptDef ? t(deptDef.labelKey) : '',
            areaLabel: areaDef ? t(areaDef.labelKey, areaDef.labelParams || {}) : '',
        };
    },
    // For pages whose table columns aren't known until an async fetch
    // resolves (e.g. a report's results, one column per report column) --
    // the automatic ResizeObserver-based lazy-init (renderDataTableColumnControls)
    // disconnects itself the first time the wrapper reports a nonzero width,
    // which can happen before such a page has appended any real <th> cells,
    // permanently missing its one chance to wire up reorder/pin/hide/sort/
    // filter. Call this directly once the real columns are in the DOM.
    initDataTableColumns,
    getVisibleTableSnapshot,
    showToast,
    confirm: confirmDialog,
    openCatalogRequestModal,
};
