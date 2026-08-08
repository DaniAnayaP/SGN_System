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
        sidebar: { brand: "SGN", searchPlaceholder: "Search", notifications: "Notifications", settings: "Settings", logout: "Log out", department: "Department" },
        menu: {
            home: "Home", dashboard: "Dashboard", adminBusiness: "Admin Business",
            contractedService: "Contracted Service", expansions: "Expansions", businessConfig: "Business Config",
            roles: "Roles", users: "Users", accessPermissions: "Access and Permissions",
            upcomingUpdates: "Upcoming Updates", trainingSessions: "Training Sessions",
            file: "File", images: "Images", audios: "Audio Files", task: "Tasks",
            steeringCommittee: "Steering Committee", generalManagement: "General Management",
            managementControl: "Management Control", supplyChain: "Supply Chain",
            inventory: "Inventory", consumption: "Consumption", overstock: "Overstock",
            purchasing: "Purchasing", commercial: "Commercial", marketing: "Marketing",
            humanResources: "Human Resources", accounting: "Accounting", finance: "Finance",
            deptArea: "Dept. Area {n}", option: "Option {n}",
            clientesNuevos: "New Clients", contrataciones: "Contracted Modules", clientAdmin: "Client Administration", mainSection: "General"
        },
        admin: {
            clientsTitle: "New Clients", clientsSubtitle: "Manage the companies using this SGN instance.",
            logo: "Logo", removeLogo: "Remove", primaryColor: "Primary color", secondaryColor: "Secondary color",
            companyName: "Company name", contactName: "Contact name", email: "Email", phone: "Phone",
            plan: "Plan / package", status: "Status",
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
            modulesSaved: "Modules updated."
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
            accessSaved: "Access updated."
        },
        main: { welcome: "Welcome", messages: "Messages", notifications: "Notifications", bookmarks: "Bookmarks", settings: "Settings", addUser: "Add user", language: "Language", style: "Style", others: "Others", languageEnglish: "English", languageSpanish: "Spanish", styleLight: "Light", styleDark: "Dark", styleInstitutional: "Institutional", inDevelopment: "Under development. We're working on a better experience." }
    },
    es: {
        meta: { loginTitle: "SGN by GEIPSA - Iniciar sesión", dashboardTitle: "SGN - Inicio" },
        sidebar: { brand: "SGN", searchPlaceholder: "Buscar", notifications: "Notificaciones", settings: "Configuración", logout: "Cerrar sesión", department: "Departamento" },
        menu: {
            home: "Inicio", dashboard: "Tablero", adminBusiness: "Administración del Negocio",
            contractedService: "Servicio Contratado", expansions: "Expansiones", businessConfig: "Configuración del Negocio",
            roles: "Roles", users: "Usuarios", accessPermissions: "Accesos y Permisos",
            upcomingUpdates: "Próximas Actualizaciones", trainingSessions: "Sesiones de Capacitación",
            file: "Archivos", images: "Imágenes", audios: "Audios", task: "Tareas",
            steeringCommittee: "Comité Directivo", generalManagement: "Dirección General",
            managementControl: "Control de Gestión", supplyChain: "Cadena de Suministro",
            inventory: "Inventario", consumption: "Consumos", overstock: "Sobre Stock",
            purchasing: "Compras", commercial: "Comercial", marketing: "Mercadotecnia",
            humanResources: "Recursos Humanos", accounting: "Contabilidad", finance: "Finanzas",
            deptArea: "Área Dep. {n}", option: "Opción {n}",
            clientesNuevos: "Clientes Nuevos", contrataciones: "Contrataciones", clientAdmin: "Administración de Clientes", mainSection: "General"
        },
        admin: {
            clientsTitle: "Clientes Nuevos", clientsSubtitle: "Administra las empresas que usan esta instancia de SGN.",
            logo: "Logo", removeLogo: "Quitar", primaryColor: "Color primario", secondaryColor: "Color secundario",
            companyName: "Nombre de la empresa", contactName: "Nombre de contacto", email: "Correo electrónico", phone: "Teléfono",
            plan: "Plan / paquete", status: "Estado",
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
            modulesSaved: "Módulos actualizados."
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
            accessSaved: "Accesos actualizados."
        },
        main: { welcome: "Bienvenido", messages: "Mensajes", notifications: "Notificaciones", bookmarks: "Marcadores", settings: "Configuración", addUser: "Agregar usuario", language: "Idioma", style: "Estilo", others: "Otros", languageEnglish: "Inglés", languageSpanish: "Español", styleLight: "Claro", styleDark: "Oscuro", styleInstitutional: "Institucional", inDevelopment: "En desarrollo, seguimos trabajando para una mejor experiencia" }
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

// renderMenu() sets #user-name/#user-email from menu.json's static demo
// data — call this right after to replace it with whoever is actually
// signed in.
function applyRealUserIdentity() {
    if (!currentUser) return;
    const nameEl = document.getElementById('user-name');
    const emailEl = document.getElementById('user-email');
    if (nameEl) nameEl.textContent = currentUser.name || currentUser.username || '';
    if (emailEl) emailEl.textContent = currentUser.email || '';
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
            { id: 'home', labelKey: 'menu.home', icon: 'bx-home-alt-2', href: '#', active: true },
            { id: 'dashboard', labelKey: 'menu.dashboard', icon: 'bx-bar-chart-alt-2', href: 'Inicio-en.html' },
            { id: 'task', labelKey: 'menu.task', icon: 'bx-task', href: '#' }
        ]
    }],
    footer: [
        { labelKey: 'sidebar.notifications', icon: 'bx-bell', href: '#' },
        { labelKey: 'sidebar.settings', icon: 'bx-cog', href: '#' }
    ],
    user: { name: 'Daniel Anaya', email: 'daniel.anaya@geipsa.com', avatar: 'Imagenes/User.jpg' }
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

// Admin-only sidebar link (SaaS control panel: client list + module
// entitlements, combined into one screen). Only ever added when the
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
        href: 'Admin-SaaS.html', active: activePage === 'admin-saas'
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
    { key: 'finance', labelKey: 'menu.finance' },
    { key: 'accounting', labelKey: 'menu.accounting' },
    { key: 'human-resources', labelKey: 'menu.humanResources' },
    { key: 'marketing', labelKey: 'menu.marketing' },
    { key: 'commercial', labelKey: 'menu.commercial' },
    { key: 'purchasing', labelKey: 'menu.purchasing' },
    { key: 'supply-chain', labelKey: 'menu.supplyChain' },
    { key: 'management-control', labelKey: 'menu.managementControl' },
    { key: 'general-management', labelKey: 'menu.generalManagement' },
    { key: 'steering-committee', labelKey: 'menu.steeringCommittee' }
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

function renderFilteredMenu() {
    if (menuData) renderMenu(applyDepartmentFilter(menuData));
    applyRealUserIdentity();
}

function updateDeptPickerLabel() {
    const label = document.getElementById('dept-picker-label');
    if (!label) return;
    const dept = DEPARTMENTS.find((d) => d.key === selectedDepartment);
    label.textContent = dept ? t(dept.labelKey) : t('sidebar.department');
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
        a.textContent = t(item.labelKey, item.labelParams || {});
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

function renderMenu(data) {
    const mount = document.getElementById('menu-mount');
    mount.innerHTML = '';
    data.sections.forEach((section) => {
        const ul = document.createElement('ul');
        ul.className = 'menu';
        ul.dataset.sectionId = section.id;
        section.items.forEach((item) => ul.appendChild(buildMenuItem(item)));
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

    document.getElementById('user-name').textContent = data.user.name;
    document.getElementById('user-email').textContent = data.user.email;
    if (data.user.avatar) {
        document.getElementById('user-avatar').src = data.user.avatar;
    }

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
}

function checkWindowSize() {
    document.getElementById('Sidebar')?.classList.remove('minimize');
}
window.addEventListener('resize', checkWindowSize);

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

// Language / Style accordions: clicking "Language" or "Style" expands its
// submenu in place without closing the whole settings dropdown.
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

document.querySelectorAll('.style-option').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (btn.dataset.style === 'institutional') {
            if (!clientBranding) {
                alert(t('main.inDevelopment'));
                return;
            }
            document.body.classList.remove('dark-mode');
            document.body.classList.add('institutional-mode');
        } else {
            document.body.classList.remove('institutional-mode');
            document.body.classList.toggle('dark-mode', btn.dataset.style === 'dark');
        }
        document.querySelectorAll('.style-option').forEach((b) => b.classList.toggle('active', b === btn));
    });
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
        btn.dataset.i18n = dept.labelKey;
        btn.textContent = dept.labelKey;
        li.appendChild(btn);
        deptPickerDropdown.appendChild(li);
    });
}

deptPickerDropdown?.addEventListener('click', (event) => {
    const btn = event.target.closest('.dept-option');
    if (!btn) return;
    selectedDepartment = selectedDepartment === btn.dataset.dept ? null : btn.dataset.dept;
    localStorage.setItem('department', selectedDepartment || '');
    updateDeptPickerLabel();
    renderFilteredMenu();
    closeDeptPicker();
});

// --- Logout: invalidate the server-side session, then navigate away --------
document.getElementById('logout-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    sessionStorage.removeItem('sgn_token');
    fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
        .catch(() => {})
        .finally(() => window.location.replace('Login.html'));
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

function applyClientBranding(branding) {
    if (!branding) return;
    if (branding.primaryColor) {
        document.documentElement.style.setProperty('--institutional-primary', branding.primaryColor);
    }
    if (branding.secondaryColor) {
        document.documentElement.style.setProperty('--institutional-secondary', branding.secondaryColor);
    }
    if (branding.logoDataUrl) {
        document.querySelectorAll('.brand-light, .brand-dark').forEach((img) => {
            img.src = branding.logoDataUrl;
        });
    }
    const brandLabel = document.querySelector('.brand span');
    if (brandLabel && branding.companyName) brandLabel.textContent = branding.companyName;
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
    checkWindowSize();
    // GEIPSA staff have nothing to filter by department (their sidebar is
    // fixed to Inicio/Tablero/Administración de Clientes), so the picker
    // itself shouldn't even be offered.
    document.getElementById('dept-picker')?.classList.toggle('dept-picker-disabled', role === 'admin');
    if (role !== 'admin') {
        clientBranding = await fetchClientBranding();
        applyClientBranding(clientBranding);
    }
    return role;
}

window.Dashboard = { initDashboard, t, get lang() { return currentLang; }, get role() { return currentRole; } };
