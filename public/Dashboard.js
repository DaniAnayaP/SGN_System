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
            tablePrefix: "Table", permSoloVer: "View Only", permVerYOperar: "View & Operate", permEditar: "Edit", permAutorizar: "Authorize",
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
            tablePrefix: "Tabla", permSoloVer: "Solo Ver", permVerYOperar: "Ver y Operar", permEditar: "Editar", permAutorizar: "Autorizar",
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
async function loadSaasGrants() {
    try {
        const res = await fetch(`${API_BASE}/me/saas-grants`, { credentials: 'include' });
        if (!res.ok) { cachedSaasGrants = []; return; }
        const data = await res.json();
        cachedSaasGrants = data.grants || [];
    } catch {
        cachedSaasGrants = [];
    }
}
function hasSaasScreenGrant(itemId, subItemId = null) {
    const grants = cachedSaasGrants || [];
    if (!grants.length) return true;
    return grants.some((g) => g.itemId === itemId && (subItemId ? g.subItemId === subItemId : true));
}
// Equipo SaaS itself isn't gated by this tree — restricting who can see it
// would need to be granted BY someone who can already see it, a
// bootstrapping problem this small a team doesn't need. Kept as its own
// map (not folded into SCREEN_GRANT_PATHS) since it's a completely
// separate namespace (flat itemId, no {sectionId,itemId,submenuId} triple).
const SAAS_SCREEN_GRANT_PATHS = {
    'admin-saas': 'saas-clients',
    'admin-planes': 'saas-plans',
    'admin-costos-modulos': 'saas-module-costs',
};
function hasSaasScreenAccess(activePage) {
    const itemId = SAAS_SCREEN_GRANT_PATHS[activePage];
    if (!itemId) return true;
    return hasSaasScreenGrant(itemId);
}

function buildSidebarData(data, role, activePage) {
    const adminSubmenu = [
        // "+ Agregar Cliente Nuevo" y "+ Agregar Plan Nuevo" no tienen
        // entrada propia aquí — Nuestros Clientes y Nuestros Planes tienen
        // su propio botón "+ Agregar ... Nuevo" en el toolbar de su tabla
        // (ver renderNewClientButton en Admin-SaaS.js / renderNewPlanButton
        // en Admin-Planes.js), que abre el mismo modal de Editar en modo
        // creación ("pantalla alterna") — nunca existieron como páginas
        // propias en el sidebar, un ítem aquí sería redundante.
        { id: 'admin-clientes-registrados', labelKey: 'menu.clientesRegistrados', href: 'Admin-SaaS.html', saasItemId: 'saas-clients' },
        { id: 'admin-planes-registrados', labelKey: 'menu.plansRegistered', href: 'Admin-Planes.html', saasItemId: 'saas-plans' },
        { id: 'admin-costos-modulos', labelKey: 'menu.moduleCosts', href: 'Admin-CostosModulos.html', saasItemId: 'saas-module-costs' },
        { id: 'admin-equipo-saas', labelKey: 'menu.saasTeam', href: 'Admin-EquipoSaaS.html' },
    ].filter((item) => !item.saasItemId || hasSaasScreenGrant(item.saasItemId));
    const adminItem = { id: 'admin-saas', labelKey: 'menu.clientAdmin', icon: 'bx-buildings', submenu: adminSubmenu };
    if (role !== 'admin') return data;

    const mainSection = data.sections.find((s) => s.id === 'main');
    const home = mainSection?.items.find((i) => i.id === 'home');
    const dashboard = mainSection?.items.find((i) => i.id === 'dashboard');
    return { ...data, sections: [{ id: 'main', items: [home, dashboard, adminItem].filter(Boolean) }] };
}

// --- Department picker --------------------------------------------------------
// Matches the section ids in public/data/menu.json (and the module catalog
// used by "Contrataciones") so picking a department shows exactly that
// section's items below, instead of every department stacked at once.
const DEPARTMENTS = [
    { key: 'finance', labelKey: 'menu.finance', abbrKey: 'sidebar.deptAbbr.finance', icon: 'bx-dollar-circle' },
    { key: 'accounting', labelKey: 'menu.accounting', abbrKey: 'sidebar.deptAbbr.accounting', icon: 'bx-calculator' },
    { key: 'human-resources', labelKey: 'menu.humanResources', abbrKey: 'sidebar.deptAbbr.humanResources', icon: 'bx-id-card' },
    { key: 'marketing', labelKey: 'menu.marketing', abbrKey: 'sidebar.deptAbbr.marketing', icon: 'bx-megaphone' },
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
}

// Most areas' full names are already short enough to show as-is; a few
// (e.g. "ISO 9001:2015 Sistema de Gestión de Calidad") are long enough to
// need a dedicated abbreviation instead of just truncating with ellipsis —
// abbrKey is optional and falls back to the full name when not set.
function updateAreaPickerLabel() {
    const label = document.getElementById('area-picker-label');
    if (!label) return;
    const areas = AREAS_BY_DEPARTMENT[selectedDepartment] || [];
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
    const areas = AREAS_BY_DEPARTMENT[selectedDepartment] || [];
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
    const areas = (selectedDepartment && AREAS_BY_DEPARTMENT[selectedDepartment]) || [];
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
        span.textContent = item.label || t(item.labelKey, item.labelParams || {});
        a.appendChild(span);
        li.appendChild(a);
        ul.appendChild(li);
    });
    return ul;
}

function buildMenuItem(item) {
    const li = document.createElement('li');
    li.className = 'menu-item' + (item.submenu ? ' menu-item-dropdown' : ' menu-item-static');
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
    span.textContent = item.label || t(item.labelKey, item.labelParams || {});
    a.appendChild(span);

    if (item.submenu) {
        const chevron = document.createElement('i');
        chevron.className = 'bx bx-chevron-down';
        chevron.setAttribute('aria-hidden', 'true');
        a.appendChild(chevron);
    }

    li.appendChild(a);
    if (item.submenu) {
        li.appendChild(buildSubmenu(item.submenu.filter((sm) => !sm.permissionOnly)));
    }
    return li;
}

// Mirrors "Administración del Negocio" (sidebar) into its own accordion
// group in the top-bar Settings dropdown, right below Style, so its items
// (Servicio Contratado, Roles, Datos de Cliente, etc.) are reachable from
// there too. Hidden whenever there's no admin-business item to show (GEIPSA
// admin's reduced sidebar has none).
function renderBusinessAdminSettingsMenu(items) {
    const group = document.getElementById('business-admin-group');
    const submenu = document.getElementById('business-admin-submenu');
    if (!group || !submenu) return;
    submenu.innerHTML = '';
    if (!items || !items.length) {
        group.hidden = true;
        return;
    }
    items.forEach((item) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'none');
        const a = document.createElement('a');
        a.href = item.href || '#';
        a.setAttribute('role', 'menuitem');
        if (item.icon) {
            const icon = document.createElement('i');
            icon.className = `bx ${item.icon}`;
            icon.setAttribute('aria-hidden', 'true');
            a.appendChild(icon);
        }
        const span = document.createElement('span');
        span.textContent = t(item.labelKey, item.labelParams || {});
        a.appendChild(span);
        li.appendChild(a);
        submenu.appendChild(li);
    });
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
}

// --- Menu interactions (dropdowns, minimize, mobile) ------------------------
function wireMenuInteractions() {
    const Sidebar = document.getElementById('Sidebar');
    const menuBtn = document.getElementById('menu-btn');
    const sidebarsBtn = document.getElementById('sidebars-btn');
    const menuItemsDropdown = document.querySelectorAll('.menu-item-dropdown');
    const menuItemsStatic = document.querySelectorAll('.menu-item-static');

    sidebarsBtn?.addEventListener('click', () => {
        const isHidden = document.body.classList.toggle('sidebars-hidden');
        sidebarsBtn.setAttribute('aria-expanded', String(isHidden));
    });

    menuBtn?.addEventListener('click', () => {
        const isMinimized = Sidebar.classList.toggle('minimize');
        menuBtn.setAttribute('aria-expanded', String(!isMinimized));
        hideSidebarTooltip();
    });

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

function hideSidebarTooltip() {
    document.getElementById('sidebar-tooltip')?.classList.remove('visible');
}

function checkWindowSize() {
    document.getElementById('Sidebar')?.classList.remove('minimize');
}
window.addEventListener('resize', checkWindowSize);

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
function registerTopBarDropdown(closeFn) {
    topBarDropdownClosers.push(closeFn);
}
function closeAllTopBarDropdowns() {
    topBarDropdownClosers.forEach((closeFn) => closeFn());
}

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
registerTopBarDropdown(closeTopBarActions);

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

settingsBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = settingsMenu.classList.contains('open');
    closeAllTopBarDropdowns();
    if (!wasOpen) {
        settingsMenu.classList.add('open');
        settingsBtn.setAttribute('aria-expanded', 'true');
    }
});

document.addEventListener('click', (event) => {
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

userInfoBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = userInfoMenu.classList.contains('open');
    closeAllTopBarDropdowns();
    if (!wasOpen) {
        userInfoMenu.classList.add('open');
        userInfoBtn.setAttribute('aria-expanded', 'true');
        loadUserProfile();
    }
});

document.addEventListener('click', (event) => {
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

businessProfileBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const wasOpen = businessProfileMenu.classList.contains('open');
    closeAllTopBarDropdowns();
    if (!wasOpen) {
        businessProfileMenu.classList.add('open');
        businessProfileBtn.setAttribute('aria-expanded', 'true');
        loadBusinessProfile();
    }
});

document.addEventListener('click', (event) => {
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
        zoom.querySelector('[data-zoom="out"]').disabled = clamped <= DATA_TABLE_FONT_MIN;
        zoom.querySelector('[data-zoom="in"]').disabled = clamped >= DATA_TABLE_FONT_MAX;
    });
    sizeDataTableWrappers();
    return clamped;
}

// Inserted right before each .data-table-wrapper found on the page — same
// generic, no-HTML-editing-required approach as the wrapper's own sizing.
function renderDataTableZoomControls() {
    document.querySelectorAll('.data-table-wrapper').forEach((wrapper) => {
        if (wrapper.previousElementSibling?.classList?.contains('data-table-zoom')) return;
        const zoom = document.createElement('div');
        zoom.className = 'data-table-zoom';
        zoom.innerHTML = `
            <button type="button" class="data-table-zoom-btn" data-zoom="out" aria-label="${t('main.decreaseFontSize')}"><i class="bx bx-minus" aria-hidden="true"></i></button>
            <button type="button" class="data-table-zoom-btn" data-zoom="in" aria-label="${t('main.increaseFontSize')}"><i class="bx bx-plus" aria-hidden="true"></i></button>
        `;
        zoom.querySelector('[data-zoom="out"]').addEventListener('click', () => setDataTableFontSize(getDataTableFontSize() - DATA_TABLE_FONT_STEP));
        zoom.querySelector('[data-zoom="in"]').addEventListener('click', () => setDataTableFontSize(getDataTableFontSize() + DATA_TABLE_FONT_STEP));
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

// Reconciles stored config against the table's LIVE columns, so a future
// change to which columns a table has (added/removed/renamed in the HTML)
// never leaves a user with a broken or silently-lossy customization: unknown
// stored keys are dropped, live keys missing from the stored order are
// appended (never hidden by surprise).
function loadDataTableConfig(tableId, columnKeys) {
    let stored = null;
    try {
        stored = JSON.parse(localStorage.getItem(dataTableConfigStorageKey(tableId)) || 'null');
    } catch {
        stored = null;
    }
    const keySet = new Set(columnKeys);
    const order = Array.isArray(stored?.order) ? stored.order.filter((k) => keySet.has(k)) : [];
    columnKeys.forEach((k) => { if (!order.includes(k)) order.push(k); });
    const hidden = Array.isArray(stored?.hidden) ? stored.hidden.filter((k) => keySet.has(k)) : [];
    const widths = (stored?.widths && typeof stored.widths === 'object') ? { ...stored.widths } : {};
    Object.keys(widths).forEach((k) => { if (!keySet.has(k)) delete widths[k]; });
    let pinned = Array.isArray(stored?.pinned) ? stored.pinned.filter((k) => keySet.has(k)) : null;
    // Default: pin just the first column, reproducing the old hardcoded
    // :first-child behavior until the user customizes it via the picker.
    if (!pinned) pinned = columnKeys[0] ? [columnKeys[0]] : [];
    pinned = pinned.slice(0, DATA_TABLE_PIN_MAX);
    return { order, hidden, widths, pinned };
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

    const totalWidth = visualOrder.filter((k) => !hiddenSet.has(k))
        .reduce((sum, k) => sum + (config.widths[k] || DATA_TABLE_COL_MIN_WIDTH), 0);
    table.style.tableLayout = 'fixed';
    table.style.width = `${totalWidth}px`;
    table.style.minWidth = `${totalWidth}px`;

    Array.from(table.tBodies[0]?.rows || []).forEach((tr) => {
        if (!tr.querySelector('td.data-table-empty-cell')) applyRowColumnState(tr, tableId);
    });

    renderColumnGroupBand(tableId);
}

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
    };
    saveDataTableConfig(tableId, state.config);
    applyDataTableColumnLayout(tableId);
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
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.tagName === 'TR' && !node.querySelector('td.data-table-empty-cell')) {
                    applyRowColumnState(node, tableId);
                }
            });
        });
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
        const startWidth = state.config.widths[key] || DATA_TABLE_COL_MIN_WIDTH;
        handle.classList.add('data-table-col-resizing');
        let pendingWidth = startWidth;
        let rafId = null;
        const applyPending = () => {
            rafId = null;
            liveResizeColumn(tableId, key, pendingWidth);
        };
        const onMove = (moveEvent) => {
            pendingWidth = Math.max(DATA_TABLE_COL_MIN_WIDTH, startWidth + (moveEvent.clientX - startX));
            if (rafId == null) rafId = requestAnimationFrame(applyPending);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            handle.classList.remove('data-table-col-resizing');
            if (rafId != null) cancelAnimationFrame(rafId);
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

// Rows hide via a CSS class (see .data-table-row-col-filtered), never the
// `hidden` attribute each page's own applyXFilters() already owns — the two
// mechanisms stay independent this way (a row shows only if BOTH leave it
// visible), so this file never has to know anything about any specific
// page's filter fields, and no page has to know this feature exists.
function applyColumnValueFilters(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    const rows = Array.from(state.table.tBodies[0]?.rows || []).filter((tr) => !tr.querySelector('td.data-table-empty-cell'));
    if (!state.columnFilters.size) {
        rows.forEach((tr) => tr.classList.remove('data-table-row-col-filtered'));
        return;
    }
    rows.forEach((tr) => {
        let visible = true;
        state.columnFilters.forEach((selectedSet, key) => {
            const td = tr.querySelector(`[data-col="${key}"]`);
            if (!selectedSet.has(td ? td.textContent.trim() : '')) visible = false;
        });
        tr.classList.toggle('data-table-row-col-filtered', !visible);
    });
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
    const selected = state.columnFilters.get(key) || new Set(distinctValues);

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
            return searchMode === 'startsWith' ? value.startsWith(query)
                : searchMode === 'equals' ? value === query
                    : value.includes(query);
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
        const current = state.columnFilters.get(key) || new Set(distinctValues);
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
            const current = new Set(state.columnFilters.get(key) || new Set(distinctValues));
            if (cb.checked) current.add(value); else current.delete(value);
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
    const wantsClassificationBand = groupKeys.size > 0 || wrapper.dataset.forceClassificationBand === '1';
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
    const config = loadDataTableConfig(tableId, columnKeys);
    const naturalWidths = measureNaturalColumnWidths(table);
    columnKeys.forEach((key) => {
        if (config.widths[key] == null) config.widths[key] = naturalWidths[key] || DATA_TABLE_COL_MIN_WIDTH;
    });
    dataTableColumnState.set(tableId, {
        table, wrapper, colgroup, columnKeys, labels, config, groupKeys, groupTableKeys, naturalWidths,
        sortKey: null, sortDir: null, originalRowOrder: null,
        columnFilters: new Map(),
    });
    applyDataTableColumnLayout(tableId);
    enableHeaderDragReorder(table, tableId);
    Array.from(getHeaderRow(table).cells).forEach((th) => {
        attachResizeHandle(th, tableId);
        attachSortHandler(th, tableId);
        attachColumnFilterTrigger(th, tableId);
    });
    observeTableBody(table, tableId);
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
function fillBandRow(bandRow, visualOrder, keyMap, emptyLabelKey) {
    bandRow.innerHTML = '';
    const segments = [];
    let i = 0;
    while (i < visualOrder.length) {
        const groupKey = keyMap.get(visualOrder[i]) || null;
        let span = 1;
        while (i + span < visualOrder.length && (keyMap.get(visualOrder[i + span]) || null) === groupKey) span += 1;
        segments.push({ groupKey, span });
        i += span;
    }
    const allUngrouped = segments.every((s) => !s.groupKey);
    segments.forEach((s) => {
        const th = document.createElement('th');
        th.colSpan = s.span;
        if (s.groupKey) {
            th.textContent = t(s.groupKey);
            th.className = 'data-table-group-band-cell';
            th.dataset.groupKey = s.groupKey;
        } else if (allUngrouped && emptyLabelKey) {
            th.textContent = t(emptyLabelKey);
            th.className = 'data-table-group-band-cell-empty';
        } else {
            th.className = 'data-table-group-band-cell-empty';
        }
        bandRow.appendChild(th);
    });
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
    const hiddenSet = new Set(state.config.hidden);
    const visualOrder = getVisualColumnOrder(state.config).filter((k) => !hiddenSet.has(k));
    const tableBandRow = state.table.tHead.querySelector('tr.data-table-group-band-table');
    if (tableBandRow) fillBandRow(tableBandRow, visualOrder, state.groupTableKeys || new Map());
    const classBandRow = state.table.tHead.querySelector('tr.data-table-group-band-classification');
    if (classBandRow) fillBandRow(classBandRow, visualOrder, state.groupKeys || new Map(), 'main.columnClassPending');
}

function wireModalDismiss(overlay, onClose) {
    overlay.addEventListener('click', (event) => { if (event.target === overlay) onClose(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !overlay.hidden) onClose(); });
}

let pinPickerModal = null;
let pinPickerPinnedList = null;
let pinPickerOtherList = null;
let pinPickerLimitMsg = null;
let pinPickerState = null; // { tableId, pinnedOrder: [key,...] }

function buildColumnPickerRow(key, label, { pinned = null } = {}) {
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
    name.textContent = label;
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
let visibilityPickerState = null; // { tableId, hiddenSet: Set<key> }

function ensureVisibilityPickerModal() {
    if (visibilityPickerModal) return;
    visibilityPickerModal = document.createElement('div');
    visibilityPickerModal.className = 'modal-overlay';
    visibilityPickerModal.hidden = true;
    visibilityPickerModal.innerHTML = `
        <div class="modal-panel" style="max-width: 24rem;" role="dialog" aria-modal="true" aria-labelledby="data-table-vis-title">
            <h3 id="data-table-vis-title">${t('main.columnVisibilityTitle')}</h3>
            <p class="admin-hint">${t('main.columnVisibilityHint')}</p>
            <div class="admin-module-list" data-role="list"></div>
            <div class="admin-form-actions" style="margin-top: 1.25rem;">
                <button type="button" class="btn" data-role="save">${t('admin.save')}</button>
                <button type="button" class="btn btn-secondary" data-role="cancel">${t('admin.cancel')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(visibilityPickerModal);
    visibilityPickerList = visibilityPickerModal.querySelector('[data-role="list"]');
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
    wireModalDismiss(visibilityPickerModal, close);
}

function renderVisibilityPickerList() {
    const state = dataTableColumnState.get(visibilityPickerState.tableId);
    if (!state) return;
    visibilityPickerList.innerHTML = '';
    state.columnKeys.forEach((key) => {
        const { row, input } = buildColumnPickerRow(key, state.labels[key] || key);
        input.checked = !visibilityPickerState.hiddenSet.has(key);
        input.addEventListener('change', () => {
            // Never allow hiding the last remaining visible column.
            const visibleCount = state.columnKeys.length - visibilityPickerState.hiddenSet.size;
            if (!input.checked && visibleCount <= 1) {
                input.checked = true;
                return;
            }
            // Hiding a PINNED column is easy to do by accident (it's still
            // sitting right there, sticky-left) and leaves it fixed-but-
            // invisible until someone remembers to check the pin picker too
            // — confirm before letting that happen.
            if (!input.checked && state.config.pinned.includes(key)) {
                if (!confirm(t('main.columnHidePinnedConfirm'))) {
                    input.checked = true;
                    return;
                }
            }
            if (input.checked) visibilityPickerState.hiddenSet.delete(key);
            else visibilityPickerState.hiddenSet.add(key);
        });
        visibilityPickerList.appendChild(row);
    });
}

function openVisibilityPicker(tableId) {
    const state = dataTableColumnState.get(tableId);
    if (!state) return;
    ensureVisibilityPickerModal();
    visibilityPickerState = { tableId, hiddenSet: new Set(state.config.hidden) };
    renderVisibilityPickerList();
    visibilityPickerModal.hidden = false;
}

// Historial de cambios ("control de cambios") — read-only modal listing
// every create/update/delete logged server-side for a given table (see
// GET /api/business/table-changes/:tableKey). Same singleton-modal pattern
// as the pin/visibility pickers, but built with .admin-table-wrap/.admin-table
// (NOT .data-table-wrapper) so it never picks up its own history button.
let changeHistoryModal = null;
let changeHistoryList = null;

function ensureChangeHistoryModal() {
    if (changeHistoryModal) return;
    changeHistoryModal = document.createElement('div');
    changeHistoryModal.className = 'modal-overlay';
    changeHistoryModal.hidden = true;
    changeHistoryModal.innerHTML = `
        <div class="modal-panel" style="max-width: 40rem;" role="dialog" aria-modal="true" aria-labelledby="data-table-history-title">
            <h3 id="data-table-history-title">${t('main.changeHistoryTitle')}</h3>
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
    document.body.appendChild(changeHistoryModal);
    changeHistoryList = changeHistoryModal.querySelector('[data-role="list"]');
    const close = () => { changeHistoryModal.hidden = true; };
    changeHistoryModal.querySelector('[data-role="close"]').addEventListener('click', close);
    wireModalDismiss(changeHistoryModal, close);
}

function renderChangeHistoryRow(cells) {
    const tr = document.createElement('tr');
    cells.forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
    });
    return tr;
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
    changeHistoryList.innerHTML = '';
    changeHistoryList.appendChild(renderChangeHistoryRow([t('main.changeHistoryEmpty'), '', '', '', '', '']));
    try {
        const url = `/api/business/table-changes/${encodeURIComponent(tableId)}${recordId ? `?recordId=${encodeURIComponent(recordId)}` : ''}`;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return;
        const { changes } = await res.json();
        if (!changes || !changes.length) return;
        changeHistoryList.innerHTML = '';
        changes.forEach((change) => {
            let description;
            if (change.action === 'create') description = t('main.changeHistoryCreated');
            else if (change.action === 'delete') description = t('main.changeHistoryDeleted');
            else description = `${t(change.field_key)}: "${change.old_value || '—'}" → "${change.new_value || '—'}"`;
            changeHistoryList.appendChild(renderChangeHistoryRow([
                change.changed_at, change.changed_by || '—', change.record_label || '—', description,
                change.requested_by || '—', change.authorized_by || '—',
            ]));
        });
    } catch {
        // Leave the empty-state row in place — no network/parse errors surfaced here.
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
    (state?.groupKeys ? Array.from(state.groupKeys.values()) : []).forEach((groupLabelKey) => {
        if (seenGroups.has(groupLabelKey)) return;
        seenGroups.add(groupLabelKey);
        const meta = COLUMN_GROUP_META[groupLabelKey];
        if (!meta) return;
        columnLegendList.appendChild(buildLegendRow(meta.swatch, t(groupLabelKey), t(meta.descKey)));
    });
}

// Adds the 3 new toolbar buttons into the SAME .data-table-zoom bar that
// renderDataTableZoomControls() already inserts (must run after it), then
// lazily boots column management for each table the first time it reports
// a nonzero width — see initDataTableColumns for why that's deferred.
function renderDataTableColumnControls() {
    document.querySelectorAll('.data-table-wrapper').forEach((wrapper, index) => {
        const zoom = wrapper.previousElementSibling;
        if (zoom?.classList?.contains('data-table-zoom') && !zoom.querySelector('[data-col-action]')) {
            const pinBtn = document.createElement('button');
            pinBtn.type = 'button';
            pinBtn.className = 'data-table-zoom-btn';
            pinBtn.dataset.colAction = 'pin';
            pinBtn.setAttribute('aria-label', t('main.pinColumns'));
            pinBtn.title = t('main.pinColumns');
            pinBtn.innerHTML = '<i class="bx bx-pin" aria-hidden="true"></i>';
            pinBtn.addEventListener('click', () => openPinPicker(getTableId(wrapper, index)));

            const visBtn = document.createElement('button');
            visBtn.type = 'button';
            visBtn.className = 'data-table-zoom-btn';
            visBtn.dataset.colAction = 'visibility';
            visBtn.setAttribute('aria-label', t('main.columnVisibility'));
            visBtn.title = t('main.columnVisibility');
            visBtn.innerHTML = '<i class="bx bx-show" aria-hidden="true"></i>';
            visBtn.addEventListener('click', () => openVisibilityPicker(getTableId(wrapper, index)));

            const historyBtn = document.createElement('button');
            historyBtn.type = 'button';
            historyBtn.className = 'data-table-zoom-btn';
            historyBtn.dataset.colAction = 'history';
            historyBtn.setAttribute('aria-label', t('main.changeHistory'));
            historyBtn.title = t('main.changeHistory');
            historyBtn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
            historyBtn.addEventListener('click', () => openChangeHistory(getTableId(wrapper, index)));

            const legendBtn = document.createElement('button');
            legendBtn.type = 'button';
            legendBtn.className = 'data-table-zoom-btn';
            legendBtn.dataset.colAction = 'legend';
            legendBtn.setAttribute('aria-label', t('main.columnLegendBtn'));
            legendBtn.title = t('main.columnLegendBtn');
            legendBtn.innerHTML = '<span class="data-table-legend-icon" aria-hidden="true"><span></span><span></span><span></span></span>';
            legendBtn.addEventListener('click', () => openColumnLegend(getTableId(wrapper, index)));

            zoom.append(pinBtn, visBtn, historyBtn, legendBtn);

            // Filtrar/Limpiar — only for tables that actually have a
            // .filter-bar (see the wiring block below this function for
            // filterBarExpand/filterBarClear/data-table:filter-apply/
            // data-table:filter-clear). The bar sits right before the
            // auto-inserted zoom toolbar in the HTML, so it's always
            // zoom's previous sibling at this point.
            const filterBar = zoom.previousElementSibling;
            if (filterBar?.classList?.contains('filter-bar')) {
                const filterBtn = document.createElement('button');
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
                    sizeDataTableWrappers();
                });

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
                    filterBtn.setAttribute('aria-expanded', 'false');
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
                        applyColumnValueFilters(colTableId);
                        getHeaderRow(colState.table).querySelectorAll('th.data-table-col-filter-active')
                            .forEach((th) => th.classList.remove('data-table-col-filter-active'));
                        resetDataTableColumnLayout(colTableId);
                    }
                    closeColumnFilterMenu();
                    sizeDataTableWrappers();
                });

                zoom.append(filterBtn, clearBtn);
            }
        }

        if (wrapper.dataset.colObserverAttached) return;
        wrapper.dataset.colObserverAttached = '1';
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

// Filtro panel (see renderDataTableColumnControls above for the Filtrar/
// Limpiar toggle buttons that live in the table's OWN toolbar now — this
// bar no longer has its own open/close header). "Buscar" applies whatever
// each page's own JS implements (data-table:filter-apply — the fields
// differ per table, this file has no business knowing their meaning) and
// collapses the panel; "Limpiar" is fully handled by the toolbar button.
document.querySelectorAll('.filter-bar').forEach((bar) => {
    const searchBtn = bar.querySelector('.filter-bar-search-btn');
    searchBtn?.addEventListener('click', () => {
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
    return ['light', 'dark', 'institutional'].includes(stored) ? stored : 'light';
}

function applyStyle(style) {
    if (style === 'institutional' && clientBranding) {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('institutional-mode');
    } else if (style === 'dark') {
        document.body.classList.remove('institutional-mode');
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('institutional-mode', 'dark-mode');
    }
    document.querySelectorAll('.style-option').forEach((b) => b.classList.toggle('active', b.dataset.style === style));
}

document.querySelectorAll('.style-option').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (btn.dataset.style === 'institutional' && !clientBranding) {
            alert(t('main.inDevelopment'));
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
        closeAllTopBarDropdowns();
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
        closeAllTopBarDropdowns();
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

// --- Notifications dropdown (Autorizar approval alerts) ---------------------
// Converts the existing static #notifications-btn (already present, plain,
// in every page's top bar) into a proper dropdown — same JS-built pattern
// as #ui-scale-menu above, reusing .user-info-menu/.user-info-dropdown for
// the toggle+panel mechanics. Badge + list come from
// GET /api/business/pending-changes, already filtered server-side to
// whatever THIS user can actually authorize (admin: everything at the
// client; else: only columns they hold Autorizar on) — an empty badge here
// just means "nothing for you to approve", not "nothing pending anywhere".
const PENDING_CHANGE_TABLE_LABELS = {
    'registro-combustible': 'menu.opTransVolCombustible',
    'mi-recurso-humano': 'menu.opRrhhMiRecursoHumano',
};
let notificationsListEl = null;

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

function renderNotificationRow(change) {
    const row = document.createElement('div');
    row.className = 'notifications-item';
    const tableLabel = t(PENDING_CHANGE_TABLE_LABELS[change.table_key] || change.table_key);
    row.innerHTML = `
        <div class="notifications-item-meta">${tableLabel} · ${change.record_label || '—'}</div>
        <div class="notifications-item-desc">${t(change.field_key)}: "${change.old_value || '—'}" → "${change.new_value || '—'}"</div>
        <div class="notifications-item-meta">${t('main.changeHistoryRequestedBy')}: ${change.requested_by || '—'}</div>
        <div class="notifications-item-actions">
            <button type="button" class="btn btn-secondary" data-action="reject">${t('main.notificationReject')}</button>
            <button type="button" class="btn" data-action="approve">${t('main.notificationApprove')}</button>
        </div>
    `;
    row.querySelector('[data-action="approve"]').addEventListener('click', () => resolvePendingNotification(change.id, 'approve', row));
    row.querySelector('[data-action="reject"]').addEventListener('click', () => resolvePendingNotification(change.id, 'reject', row));
    return row;
}

async function resolvePendingNotification(id, action, row) {
    try {
        const res = await fetch(`/api/business/pending-changes/${id}/${action}`, { method: 'POST', credentials: 'include' });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            alert(body.message || t('admin.saveError'));
            return;
        }
        row.remove();
        alert(action === 'approve' ? t('main.notificationApproved') : t('main.notificationRejected'));
        loadPendingChanges();
    } catch {
        alert(t('admin.saveError'));
    }
}

async function loadPendingChanges() {
    if (!notificationsListEl) return;
    try {
        const res = await fetch('/api/business/pending-changes', { credentials: 'include' });
        if (!res.ok) return;
        const { changes } = await res.json();
        setNotificationsBadge(changes.length);
        notificationsListEl.innerHTML = '';
        if (!changes.length) {
            const empty = document.createElement('div');
            empty.className = 'notifications-empty';
            empty.textContent = t('main.notificationsEmpty');
            notificationsListEl.appendChild(empty);
            return;
        }
        changes.forEach((change) => notificationsListEl.appendChild(renderNotificationRow(change)));
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
        <div class="user-info-group">
            <h4>${t('main.notificationsTitle')}</h4>
            <div class="notifications-list" data-role="list"></div>
        </div>
    `;
    wrapper.appendChild(dropdown);
    notificationsListEl = dropdown.querySelector('[data-role="list"]');
    btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const wasOpen = wrapper.classList.contains('open');
        closeAllTopBarDropdowns();
        if (!wasOpen) {
            wrapper.classList.add('open');
            btn.setAttribute('aria-expanded', 'true');
            loadPendingChanges();
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
    loadPendingChanges();
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

// "Pantalla habilitada" — whether this specific {sectionId, itemId,
// submenuId} leaf is covered by the user's grants, using the SAME 3-tier
// fallback as PermissionTree.js's own isGranted() (exact leaf, OR a
// broader item-level grant, OR a broader section-level grant) — so a
// profile configured with a broad "select all" at Área or Departamento
// level already covers every pantalla under it, no different from how
// that same grant already works inside the permission tree editor itself.
function hasScreenGrant(sectionId, itemId, submenuId) {
    if (isUnrestrictedClientAdmin()) return true;
    const grants = cachedBusinessProfile?.effectiveGrants || [];
    return grants.some((g) => (
        (g.sectionId === sectionId && g.itemId === itemId && g.submenuId === submenuId)
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
const SETTINGS_SUBITEM_IDS = ['btn-idioma', 'btn-estilo', 'btn-admin-negocio', 'btn-config-botones', 'btn-base-datos', 'btn-negocio-inteligente', 'btn-otros'];
function hasSettingsAccess() {
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
    const areas = (selectedDepartment && AREAS_BY_DEPARTMENT[selectedDepartment]) || [];
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

        const greeting = cachedUserProfile?.nickname || currentUser?.name || currentUser?.username || '';
        const message = greeting
            ? t('sidebar.logoutConfirmGreeting', { name: greeting })
            : t('sidebar.logoutConfirm');
        if (!window.confirm(message)) return;
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
    const brandLabel = document.querySelector('.brand span');
    if (brandLabel && branding.companyName) brandLabel.textContent = branding.companyName;
    // Tab title: prefix whatever this page's own title already says (already
    // re-translated by applyStaticTranslations before this runs) with the
    // client's name, so e.g. "Roles" becomes "Acme Corp — Roles".
    if (branding.companyName) {
        const titleEl = document.querySelector('title[data-i18n]');
        const pageTitle = titleEl ? t(titleEl.dataset.i18n) : document.title;
        document.title = `${branding.companyName} — ${pageTitle}`;
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
            label: `${clientBranding?.companyName || ''} - ${report.name}`,
            href: `NegocioInteligente-ReporteResultados.html?id=${report.id}`,
        }));
        renderFilteredMenu();
    } catch {
        // No sidebar entries for this session's reports — not fatal, the
        // rest of the app still works, same as any other best-effort
        // sidebar enrichment (branding, cost centers) failing silently.
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
    const areaDef = (AREAS_BY_DEPARTMENT[selectedDepartment] || []).find((a) => a.key === selectedArea);
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
        availableDepartments = DEPARTMENTS.filter((d) => contractedModuleKeys.includes(d.key));
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
        await loadSaasGrants();
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
    syncSettingsSubmenuVisibility();
    // Restore the saved style now that clientBranding (needed for
    // Institutional's real colors) has loaded — every other page load was
    // resetting back to Light since nothing re-applied the choice.
    applyStyle(getStoredStyle());
    renderBreadcrumbBar();
    renderTopBarCollapseToggle();
    renderDataTableZoomControls();
    renderDataTableColumnControls();
    sizeDataTableWrappers();
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
    'centros-costo': { sectionId: 'main', itemId: 'btn-configuracion', submenuPrefix: 'btn-admin-negocio/ab-contracted-service' },
    'registro-combustible': { sectionId: 'supply-chain', itemId: 'sc-area-transport-1', submenuPrefix: 'cat-operaciones/cat-operaciones-transporte-vol-combustible' },
    'mi-recurso-humano': { sectionId: 'human-resources', itemId: 'hr-area-personnel-admin', submenuPrefix: 'cat-operaciones/cat-operaciones-rrhh-mi-recurso-humano' },
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
};

function hasScreenAccess(activePage) {
    const path = SCREEN_GRANT_PATHS[activePage];
    if (!path) return true; // not one of the mapped pages — unaffected, same as today
    return hasScreenGrant(path.sectionId, path.itemId, path.submenuPrefix);
}

// No grant at all on a column behaves as 'solo-ver' — mirrors
// getColumnGrantLevel in db.js exactly (kept in sync by hand, same as
// TABLE_GRANT_PATHS itself).
function getColumnGrantLevel(tableKey, colKey) {
    if (!!currentUser?.isClientAdmin) return 'editar';
    const path = TABLE_GRANT_PATHS[tableKey];
    if (!path) return 'solo-ver';
    const base = `${path.submenuPrefix}/${colKey}`;
    const grants = cachedBusinessProfile?.effectiveGrants || [];
    const has = (level) => grants.some((g) => g.sectionId === path.sectionId && g.itemId === path.itemId && g.submenuId === `${base}/${level}`);
    if (has('editar')) return 'editar';
    if (has('ver-y-operar')) return 'ver-y-operar';
    return 'solo-ver';
}
function hasColumnEditGrant(tableKey, colKey) {
    return getColumnGrantLevel(tableKey, colKey) === 'editar';
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
// — shared by Admin-Planes.js and Admin-CostosModulos.js, both of which
// show a Cambios icon per plan row against the exact same
// GET /api/admin/plans/:id/changes data.
let planHistoryModal = null;
let planHistoryList = null;

function ensurePlanHistoryModal() {
    if (planHistoryModal) return;
    planHistoryModal = document.createElement('div');
    planHistoryModal.className = 'modal-overlay';
    planHistoryModal.hidden = true;
    planHistoryModal.innerHTML = `
        <div class="modal-panel" style="max-width: 40rem;" role="dialog" aria-modal="true" aria-labelledby="plan-history-title">
            <h3 id="plan-history-title">${t('admin.planChangeHistory')}</h3>
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>${t('main.changeHistoryDate')}</th>
                            <th>${t('main.changeHistoryUser')}</th>
                            <th>${t('main.changeHistoryChange')}</th>
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
    planHistoryList.appendChild(planHistoryRow([t('main.changeHistoryEmpty'), '', '']));
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
            planHistoryList.appendChild(planHistoryRow([change.changed_at, change.changed_by || '—', description]));
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
    hasColumnEditGrant,
    canEditField,
    openChangeHistory,
    hasSaasScreenGrant,
    formatCurrency,
    openPlanChangeHistory,
    get lang() { return currentLang; },
    get role() { return currentRole; },
    get isClientAdmin() { return !!currentUser?.isClientAdmin; },
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
    // For pages whose table columns aren't known until an async fetch
    // resolves (e.g. a report's results, one column per report column) --
    // the automatic ResizeObserver-based lazy-init (renderDataTableColumnControls)
    // disconnects itself the first time the wrapper reports a nonzero width,
    // which can happen before such a page has appended any real <th> cells,
    // permanently missing its one chance to wire up reorder/pin/hide/sort/
    // filter. Call this directly once the real columns are in the DOM.
    initDataTableColumns,
};
