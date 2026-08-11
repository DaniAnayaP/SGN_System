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
            catMaterialApoyo: "Support Material", catMaterialApoyoItem1: "M. Apoy 1", catMaterialApoyoItem2: "M. Apoy 2", catIconosBotones: "Icons and Buttons", catIconosBotonesItem1: "Icon 1", catIconosBotonesItem2: "Icon 2"
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
        main: { welcome: "Welcome", messages: "Messages", notifications: "Notifications", bookmarks: "Bookmarks", settings: "Settings", addUser: "Add user", language: "Language", style: "Style", others: "Others", languageEnglish: "English", languageSpanish: "Spanish", styleLight: "Light", styleDark: "Dark", styleInstitutional: "Institutional", inDevelopment: "Under development. We're working on a better experience.", chatbot: "Chatbot", chatbotTitle: "SGN Assistant", chatbotClose: "Close chat", chatbotPlaceholder: "Type a message...", chatbotSend: "Send", chatbotGreeting: "Hi! This assistant is still under construction — soon I'll be able to really help you here.", chatbotCannedReply: "Thanks for your message! I can't have real conversations yet — we're working on connecting me to an AI.", userInfo: "User Data", personalDataTitle: "Personal Data", nickname: "Nickname", businessEmail: "Business Email", fullName: "Full Name", phone: "Phone", address: "Address", birthDate: "Date of Birth", idNumber: "ID Number", noBusinessEmail: "No institutional email", notSet: "Not set", buttonConfig: "Button Settings", exitButton: "Exit Button", exitMenu: "Exit Menu", logoutModeConfirm: "Ask before exiting", logoutModeDirect: "Exit without asking" }
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
            catMaterialApoyo: "Material Apoyo", catMaterialApoyoItem1: "M. Apoy 1", catMaterialApoyoItem2: "M. Apoy 2", catIconosBotones: "Iconos y Botones", catIconosBotonesItem1: "Icono 1", catIconosBotonesItem2: "Icono 2"
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
        main: { welcome: "Bienvenido", messages: "Mensajes", notifications: "Notificaciones", bookmarks: "Marcadores", settings: "Configuración", addUser: "Agregar usuario", language: "Idioma", style: "Estilo", others: "Otros", languageEnglish: "Inglés", languageSpanish: "Español", styleLight: "Claro", styleDark: "Oscuro", styleInstitutional: "Institucional", inDevelopment: "En desarrollo, seguimos trabajando para una mejor experiencia", chatbot: "Chatbot", chatbotTitle: "Asistente SGN", chatbotClose: "Cerrar chat", chatbotPlaceholder: "Escribe un mensaje...", chatbotSend: "Enviar", chatbotGreeting: "¡Hola! Este asistente todavía está en construcción — pronto podré ayudarte de verdad por aquí.", chatbotCannedReply: "¡Gracias por tu mensaje! Aún no puedo tener conversaciones reales — estamos trabajando en conectarme con una IA.", userInfo: "Datos de Usuario", personalDataTitle: "Datos Personales", nickname: "Apodo", businessEmail: "Correo empresarial", fullName: "Nombre completo", phone: "Teléfono", address: "Dirección", birthDate: "Fecha de nacimiento", idNumber: "Número de identificación", noBusinessEmail: "Sin correo institucional", notSet: "No registrado", buttonConfig: "Configuración botones", exitButton: "Botón Salir", exitMenu: "Menú Salir", logoutModeConfirm: "Preguntar antes de salir", logoutModeDirect: "Salir sin preguntar" }
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

function getStoredDepartment() {
    const stored = localStorage.getItem('department');
    return DEPARTMENTS.some((d) => d.key === stored) ? stored : null;
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

function updateAreaPickerVisibility() {
    const picker = document.getElementById('area-picker');
    if (!picker || currentRole === 'admin') return;
    const hasAreas = !!(selectedDepartment && AREAS_BY_DEPARTMENT[selectedDepartment]?.length);
    picker.classList.toggle('dept-picker-disabled', !hasAreas);
}

// Shows only the abbreviation once a department is picked (e.g. "FIN"),
// not the full name — same compact-pill treatment as Cost Centers, now that
// this lives in the top bar instead of the sidebar. Falls back to the
// generic placeholder word when nothing is selected yet.
function updateDeptPickerLabel() {
    const label = document.getElementById('dept-picker-label');
    if (!label) return;
    const dept = DEPARTMENTS.find((d) => d.key === selectedDepartment);
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
        li.appendChild(buildSubmenu(item.submenu));
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
        let items = section.items;
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

if (deptPickerDropdown) {
    DEPARTMENTS.forEach((dept) => {
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
        span.textContent = dept.labelKey;
        btn.appendChild(icon);
        btn.appendChild(span);
        li.appendChild(btn);
        deptPickerDropdown.appendChild(li);
    });
}

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
    ccPicker.classList.toggle('cc-picker-disabled', sidebarCostCenters.length === 0 || currentRole === 'admin');
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

async function initCostCenterPicker() {
    sidebarCostCenters = await fetchCostCenters();
    if (selectedCostCenterIds !== 'all') {
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
async function initDashboard({ activePage } = {}) {
    const role = await authGuard();
    if (!role) return null;
    currentRole = role;
    await loadLanguage(getStoredLang());
    menuData = await loadMenu();
    menuData = buildSidebarData(menuData, role, activePage);
    renderFilteredMenu();
    updateDeptPickerLabel();
    renderAreaPickerOptions();
    checkWindowSize();
    // GEIPSA staff have nothing to filter by department (their sidebar is
    // fixed to Inicio/Tablero/Administración de Clientes), so the picker
    // itself shouldn't even be offered.
    document.getElementById('dept-picker')?.classList.toggle('dept-picker-disabled', role === 'admin');
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
