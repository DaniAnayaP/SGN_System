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
            area: { generic: "Area {n}", rawMaterial: "Raw Material", production: "Production", transport: "Transport", distributionCenter: "Distribution Center", pointOfSale: "Point of Sale", delivery: "Delivery", endCustomer: "End Customer", customerComplaints: "Customer Complaints", iso9001: "ISO 9001:2015 Quality Management System", iso9001Abbr: "QMS 9001:2015" },
            clientesRegistrados: "Registered Clients", addClientNew: "+ Add New Client", contrataciones: "Contracted Modules", clientAdmin: "Client Administration", plansRegistered: "Registered Plans", addPlanNew: "+ Add New Plan", mainSection: "General",
            catCatalogos: "Catalogs", catCatalogosItem1: "Cat 1", catCatalogosItem2: "Cat 2",
            catOperaciones: "Operations", catOperacionesItem1: "Ope 1", catOperacionesItem2: "Ope 2",
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
            paletteAccent: "Accent (buttons, active items)", paletteTooltipBg: "Tooltip background", paletteTooltipText: "Tooltip text",
            companyName: "Company name", contactName: "Contact name", email: "Email", phone: "Phone",
            plan: "Plan / package",
            mission: "Mission", vision: "Vision", coreValues: "Values", history: "History",
            status: "Status",
            statusActivo: "Active", statusInactivo: "Inactive", statusProspecto: "Prospect",
            addClient: "Add client", editClient: "Edit client", save: "Save", cancel: "Cancel",
            dismiss: "Dismiss", generatedAdminTitle: "New client admin account created",
            generatedAdminNote: "This password is shown only once — copy it now and share it with the client securely.",
            edit: "Edit", delete: "Delete", confirmDelete: "Delete this client? This cannot be undone.",
            noClients: "No clients yet. Add the first one above.",
            requiredFields: "Company name, contact name and email are required.",
            loadError: "Couldn't load data. Please try again.",
            saveError: "Couldn't save changes. Please try again.",
            clientSaved: "Client saved.", clientDeleted: "Client deleted.",
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
            adminAccessHint: "No overrides yet — this administrator sees everything the client has contracted. Check specific items below to restrict them to only those.",
            adminAccessClear: "Clear overrides",
            adminAccessNoAdminYet: "This client doesn't have an admin user yet — activate it first.",
            plansSubtitle: "Manage the plan or package types you can assign to your clients.",
            addPlanSubtitle: "Register a new plan or package type.",
            planName: "Plan name", planDescription: "Description", addPlan: "Add plan",
            noPlans: "No plans yet. Add the first one above.",
            confirmDeletePlan: "Delete this plan? This doesn't affect clients already assigned to it.",
            planNameExists: "A plan with that name already exists.",
            selectPlanPlaceholder: "Choose a plan..."
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
        main: { welcome: "Welcome", messages: "Messages", notifications: "Notifications", bookmarks: "Bookmarks", settings: "Settings", addUser: "Add user", language: "Language", style: "Style", others: "Others", languageEnglish: "English", languageSpanish: "Spanish", styleLight: "Light", styleDark: "Dark", styleInstitutional: "Institutional", inDevelopment: "Under development. We're working on a better experience.", chatbot: "Chatbot", chatbotTitle: "SGN Assistant", chatbotClose: "Close chat", chatbotPlaceholder: "Type a message...", chatbotSend: "Send", chatbotGreeting: "Hi! This assistant is still under construction — soon I'll be able to really help you here.", chatbotCannedReply: "Thanks for your message! I can't have real conversations yet — we're working on connecting me to an AI.", userInfo: "User Data", personalDataTitle: "Personal Data", nickname: "Nickname", businessEmail: "Business Email", fullName: "Full Name", phone: "Phone", address: "Address", birthDate: "Date of Birth", idNumber: "ID Number", noBusinessEmail: "No institutional email", notSet: "Not set", buttonConfig: "Button Settings", exitButton: "Exit Button", exitMenu: "Exit Menu", logoutModeConfirm: "Ask before exiting", logoutModeDirect: "Exit without asking", businessProfile: "Business User Data", position: "Position", role: "Role", hireDate: "Hire Date", reportsTo: "Reports To", permissions: "Permissions", assignedCostCenter: "Assigned Cost Center", assignedAreas: "Assigned Areas", assignedDepartments: "Assigned Departments", noRoleAssigned: "No profile assigned", noExtraPermissions: "No permissions granted", extraPermissionsCount: "{count} permissions granted", summaryDepartments: "Dept.", summaryAreas: "Areas", summaryCostCenters: "Cost Ctrs", summaryPermissions: "Permissions", noDepartmentsAssigned: "No departments assigned", noAreasAssigned: "No areas assigned", noCostCentersAssigned: "No cost centers assigned", defaultPickerDeptHint: "Pick the department that should open by default every time you log in.", defaultPickerAreaHint: "Pick the area that should open by default every time you log in.", defaultPickerAreaNoDept: "Select a department first.", defaultPickerCcHint: "Pick the cost centers that should be selected by default every time you log in." }
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
            area: { generic: "Área {n}", rawMaterial: "M. Prima", production: "Producción", transport: "Transporte", distributionCenter: "C. Distribución", pointOfSale: "Punto Venta", delivery: "Delivery", endCustomer: "Cliente Final", customerComplaints: "Quejas de Cliente", iso9001: "ISO 9001:2015 Sistema de Gestión de Calidad", iso9001Abbr: "SGC 9001:2015" },
            clientesRegistrados: "Clientes Registrados", addClientNew: "+ Agregar Cliente Nuevo", contrataciones: "Contrataciones", clientAdmin: "Administración de Clientes", plansRegistered: "Planes Registrados", addPlanNew: "+ Agregar Plan Nuevo", mainSection: "General",
            catCatalogos: "Catálogos", catCatalogosItem1: "Cat 1", catCatalogosItem2: "Cat 2",
            catOperaciones: "Operaciones", catOperacionesItem1: "Ope 1", catOperacionesItem2: "Ope 2",
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
            paletteAccent: "Acento (botones, activos)", paletteTooltipBg: "Fondo de tooltip", paletteTooltipText: "Texto de tooltip",
            companyName: "Nombre de la empresa", contactName: "Nombre de contacto", email: "Correo electrónico", phone: "Teléfono",
            plan: "Plan / paquete",
            mission: "Misión", vision: "Visión", coreValues: "Valores", history: "Historia",
            status: "Estado",
            statusActivo: "Activo", statusInactivo: "Inactivo", statusProspecto: "Prospecto",
            addClient: "Agregar cliente", editClient: "Editar cliente", save: "Guardar", cancel: "Cancelar",
            dismiss: "Descartar", generatedAdminTitle: "Se creó la cuenta admin del cliente",
            generatedAdminNote: "Esta contraseña se muestra solo una vez — cópiala ahora y compártela con el cliente de forma segura.",
            edit: "Editar", delete: "Eliminar", confirmDelete: "¿Eliminar este cliente? Esta acción no se puede deshacer.",
            noClients: "Aún no hay clientes. Agrega el primero arriba.",
            requiredFields: "Nombre de empresa, contacto y correo son obligatorios.",
            loadError: "No se pudo cargar la información. Intenta de nuevo.",
            saveError: "No se pudieron guardar los cambios. Intenta de nuevo.",
            clientSaved: "Cliente guardado.", clientDeleted: "Cliente eliminado.",
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
            adminAccessHint: "Sin restricciones todavía — este administrador ve todo lo que el cliente tiene contratado. Marca items específicos abajo para restringirlo solo a esos.",
            adminAccessClear: "Quitar restricciones",
            adminAccessNoAdminYet: "Este cliente aún no tiene un usuario administrador — actívalo primero.",
            plansSubtitle: "Administra los tipos de plan o paquete que puedes asignar a tus clientes.",
            addPlanSubtitle: "Registra un nuevo tipo de plan o paquete.",
            planName: "Nombre del plan", planDescription: "Descripción", addPlan: "Agregar plan",
            noPlans: "Aún no hay planes. Agrega el primero arriba.",
            confirmDeletePlan: "¿Eliminar este plan? Esto no afecta a los clientes que ya lo tienen asignado.",
            planNameExists: "Ya existe un plan con ese nombre.",
            selectPlanPlaceholder: "Selecciona un plan..."
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
        main: { welcome: "Bienvenido", messages: "Mensajes", notifications: "Notificaciones", bookmarks: "Marcadores", settings: "Configuración", addUser: "Agregar usuario", language: "Idioma", style: "Estilo", others: "Otros", languageEnglish: "Inglés", languageSpanish: "Español", styleLight: "Claro", styleDark: "Oscuro", styleInstitutional: "Institucional", inDevelopment: "En desarrollo, seguimos trabajando para una mejor experiencia", chatbot: "Chatbot", chatbotTitle: "Asistente SGN", chatbotClose: "Cerrar chat", chatbotPlaceholder: "Escribe un mensaje...", chatbotSend: "Enviar", chatbotGreeting: "¡Hola! Este asistente todavía está en construcción — pronto podré ayudarte de verdad por aquí.", chatbotCannedReply: "¡Gracias por tu mensaje! Aún no puedo tener conversaciones reales — estamos trabajando en conectarme con una IA.", userInfo: "Datos de Usuario", personalDataTitle: "Datos Personales", nickname: "Apodo", businessEmail: "Correo empresarial", fullName: "Nombre completo", phone: "Teléfono", address: "Dirección", birthDate: "Fecha de nacimiento", idNumber: "Número de identificación", noBusinessEmail: "Sin correo institucional", notSet: "No registrado", buttonConfig: "Configuración botones", exitButton: "Botón Salir", exitMenu: "Menú Salir", logoutModeConfirm: "Preguntar antes de salir", logoutModeDirect: "Salir sin preguntar", businessProfile: "Datos de Usuario del Negocio", position: "Puesto", role: "Rol", hireDate: "Fecha de ingreso", reportsTo: "Jefe directo", permissions: "Permisos", assignedCostCenter: "Centro de costo asignado", assignedAreas: "Áreas asignadas", assignedDepartments: "Departamentos asignados", noRoleAssigned: "Sin perfil asignado", noExtraPermissions: "Sin permisos otorgados", extraPermissionsCount: "{count} permisos otorgados", summaryDepartments: "Dep.", summaryAreas: "Áreas", summaryCostCenters: "C. Costos", summaryPermissions: "Permisos", noDepartmentsAssigned: "Sin Dep asignados", noAreasAssigned: "Sin Áreas asignados", noCostCentersAssigned: "Sin Centro de Costos asignados", defaultPickerDeptHint: "Elige el departamento que debe abrirse por defecto cada vez que inicies sesión.", defaultPickerAreaHint: "Elige el área que debe abrirse por defecto cada vez que inicies sesión.", defaultPickerAreaNoDept: "Primero selecciona un departamento.", defaultPickerCcHint: "Elige los centros de costo que deben quedar seleccionados por defecto cada vez que inicies sesión." }
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
function buildSidebarData(data, role, activePage) {
    const adminItem = {
        id: 'admin-saas', labelKey: 'menu.clientAdmin', icon: 'bx-buildings',
        submenu: [
            { id: 'admin-clientes-registrados', labelKey: 'menu.clientesRegistrados', href: 'Admin-SaaS.html' },
            { id: 'admin-cliente-nuevo', labelKey: 'menu.addClientNew', href: 'Admin-ClienteNuevo.html' },
            { id: 'admin-planes-registrados', labelKey: 'menu.plansRegistered', href: 'Admin-Planes.html' },
            { id: 'admin-plan-nuevo', labelKey: 'menu.addPlanNew', href: 'Admin-PlanNuevo.html' }
        ]
    };
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
        { key: 'sc-area-transport-1', labelKey: 'menu.area.transport', icon: 'bx-car' },
        { key: 'sc-area-distribution-center', labelKey: 'menu.area.distributionCenter', icon: 'bx-building' },
        { key: 'sc-area-transport-2', labelKey: 'menu.area.transport', icon: 'bx-car' },
        { key: 'sc-area-point-of-sale', labelKey: 'menu.area.pointOfSale', icon: 'bx-store' },
        { key: 'sc-area-delivery', labelKey: 'menu.area.delivery', icon: 'bx-send' },
        { key: 'sc-area-end-customer', labelKey: 'menu.area.endCustomer', icon: 'bx-user' },
        { key: 'sc-area-customer-complaints', labelKey: 'menu.area.customerComplaints', icon: 'bx-error-circle' }
    ],
    finance: GENERIC_AREAS,
    accounting: GENERIC_AREAS,
    'human-resources': GENERIC_AREAS,
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
function applyAreaFilter(data) {
    return {
        ...data,
        sections: data.sections.map((s) => {
            if (s.id !== selectedDepartment) return s;
            return { ...s, items: selectedArea ? (data.areaCategories || []) : [] };
        })
    };
}

function renderFilteredMenu() {
    if (menuData) renderMenu(applyAreaFilter(applyDepartmentFilter(menuData)));
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
        span.textContent = t(item.labelKey, item.labelParams || {});
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
    span.textContent = t(item.labelKey, item.labelParams || {});
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
        menuItem.addEventListener('click', () => {
            const subMenu = menuItem.querySelector('.sub-menu');
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
                if (item !== menuItem) {
                    const otherSubmenu = item.querySelector('.sub-menu');
                    if (otherSubmenu) {
                        item.classList.remove('sub-menu-toggle');
                        otherSubmenu.style.height = '0';
                        otherSubmenu.style.padding = '0';
                    }
                }
            });
        });
    });

    menuItemsStatic.forEach((menuItem) => {
        menuItem.addEventListener('mouseenter', () => {
            if (!Sidebar.classList.contains('minimize')) return;
            menuItemsDropdown.forEach((item) => {
                const otherSubmenu = item.querySelector('.sub-menu');
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

topBarActionsToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = topBarActions.classList.toggle('open');
    topBarActionsToggle.setAttribute('aria-expanded', String(isOpen));
});

document.addEventListener('click', (event) => {
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

settingsBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = settingsMenu.classList.toggle('open');
    settingsBtn.setAttribute('aria-expanded', String(isOpen));
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
    const isOpen = userInfoMenu.classList.toggle('open');
    userInfoBtn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) loadUserProfile();
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
const GENERAL_ITEM_IDS = ['home', 'panel', 'dashboard'];

function sectionGrantLabel(sectionId) {
    if (sectionId === 'main') return t('menu.mainSection');
    return t(SECTION_LABEL_KEYS[sectionId] || sectionId);
}

// Resolves one { sectionId, itemId, submenuId } grant row into a readable
// "Departamento > Categoría > Pantalla" string. Inicio/Panel/Tablero live
// under menuData.sections' main section; every other item id comes from the
// shared areaCategories template (see PermissionTree.js for the same split).
function resolveGrantLabel(grant) {
    const sectionLabel = sectionGrantLabel(grant.sectionId);
    if (!grant.itemId) return sectionLabel;

    const item = GENERAL_ITEM_IDS.includes(grant.itemId)
        ? (menuData?.sections?.find((s) => s.id === 'main')?.items || []).find((i) => i.id === grant.itemId)
        : (menuData?.areaCategories || []).find((i) => i.id === grant.itemId);
    if (!item) return sectionLabel;

    const itemLabel = t(item.labelKey, item.labelParams);
    if (!grant.submenuId) return `${sectionLabel} > ${itemLabel}`;

    const sm = (item.submenu || []).find((s) => s.id === grant.submenuId);
    return `${sectionLabel} > ${itemLabel} > ${sm ? t(sm.labelKey, sm.labelParams) : grant.submenuId}`;
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
    const isOpen = businessProfileMenu.classList.toggle('open');
    businessProfileBtn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) loadBusinessProfile();
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
        if (chatbotPanel?.classList.contains('open')) {
            closeChatbot();
        } else {
            openChatbot();
        }
    });
    if (messagesBtn) {
        messagesBtn.insertAdjacentElement('afterend', chatbotBtn);
    } else {
        container.prepend(chatbotBtn);
    }
});

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

deptPickerBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = deptPicker.classList.toggle('open');
    deptPickerBtn.setAttribute('aria-expanded', String(isOpen));
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

areaPickerBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = areaPicker.classList.toggle('open');
    areaPickerBtn.setAttribute('aria-expanded', String(isOpen));
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
    const isOpen = ccPicker.classList.toggle('open');
    ccPickerBtn.setAttribute('aria-expanded', String(isOpen));
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
    const deptShortcut = document.getElementById('button-config-dept-btn')?.closest('li');
    const areaShortcut = document.getElementById('button-config-area-btn')?.closest('li');
    const ccShortcut = document.getElementById('button-config-cc-btn')?.closest('li');
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
const SETTINGS_SUBITEM_IDS = ['btn-idioma', 'btn-estilo', 'btn-admin-negocio', 'btn-config-botones', 'btn-otros'];
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
    { moduleKey: 'btn-notificaciones', elementId: 'notifications-btn', check: () => hasMainButtonPermission('btn-notificaciones') },
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
    const languageGroup = document.getElementById('language-group');
    const styleGroup = document.getElementById('style-group');
    const businessAdminGroup = document.getElementById('business-admin-group');
    const buttonConfigGroup = document.getElementById('button-config-group');
    const othersGroup = document.getElementById('settings-others-group');
    if (languageGroup && !hasSettingsSubPermission('btn-idioma')) languageGroup.hidden = true;
    if (styleGroup && !hasSettingsSubPermission('btn-estilo')) styleGroup.hidden = true;
    if (businessAdminGroup && !hasSettingsSubPermission('btn-admin-negocio')) businessAdminGroup.hidden = true;
    if (buttonConfigGroup && !hasSettingsSubPermission('btn-config-botones')) buttonConfigGroup.hidden = true;
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
// a transparent surround. Called once at upload time in Admin-ClienteNuevo.js
// / Admin-SaaS.js / Business-Config.js so logoDataUrl is *stored* as SVG —
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
    await loadLanguage(getStoredLang());
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
        availableDepartments = DEPARTMENTS.filter((d) => contractedModuleKeys.includes(d.key));
        if (!availableDepartments.some((d) => d.key === selectedDepartment)) {
            selectedDepartment = availableDepartments.length === 1 ? availableDepartments[0].key : null;
            localStorage.setItem('department', selectedDepartment || '');
            selectedArea = null;
            localStorage.setItem('area', '');
        }
        renderDeptPickerOptions();
    }
    menuData = await loadMenu();
    menuData = buildSidebarData(menuData, role, activePage);
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
        await initCostCenterPicker();
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
    return role;
}

window.Dashboard = {
    initDashboard,
    t,
    svgifyLogo,
    get lang() { return currentLang; },
    get role() { return currentRole; },
    get isClientAdmin() { return !!currentUser?.isClientAdmin; },
};
