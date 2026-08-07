// ---------------------------------------------------------------------------
// Dashboard controller.
//
// SECURITY NOTE: The check below (`sessionStorage.getItem('sgn_token')`) is a
// client-side UX guard only — it stops a signed-out user from briefly seeing
// a stale page, but it is NOT real access control. Anyone can open devtools
// and skip it. Real protection must happen server-side: every API call this
// page makes must be authenticated again by the backend (session cookie or
// Authorization header), and any page/route that renders sensitive data
// should be served by a backend that checks auth before responding.
// See server-example/server.js for the reference pattern.
// ---------------------------------------------------------------------------

const API_BASE = window.APP_CONFIG?.apiBase || '/api';
const SUPPORTED_LANGS = ['en', 'es'];
const DEFAULT_LANG = 'en';

let dict = {};
let menuData = null;
let currentLang = DEFAULT_LANG;

// Embedded fallback so the language toggle works even when i18n/*.json can't
// be fetched — this happens when the page is opened directly as a file
// (file://) instead of served over http(s), since browsers block fetch()
// of local files by default. Keep this in sync with i18n/en.json / es.json.
const EMBEDDED_TRANSLATIONS = {
    en: {
        meta: { loginTitle: "SGN by GEIPSA - Login", dashboardTitle: "SGN - Home" },
        sidebar: { brand: "SGN", searchPlaceholder: "Search", notifications: "Notifications", settings: "Settings", logout: "Log out" },
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
            deptArea: "Dept. Area {n}", option: "Option {n}"
        },
        main: { welcome: "Welcome", messages: "Messages", notifications: "Notifications", bookmarks: "Bookmarks", settings: "Settings", addUser: "Add user", language: "Language", style: "Style", others: "Others", languageEnglish: "English", languageSpanish: "Spanish", styleLight: "Light", styleDark: "Dark", styleInstitutional: "Institutional Color", inDevelopment: "Under development. We're working on a better experience." }
    },
    es: {
        meta: { loginTitle: "SGN by GEIPSA - Iniciar sesión", dashboardTitle: "SGN - Inicio" },
        sidebar: { brand: "SGN", searchPlaceholder: "Buscar", notifications: "Notificaciones", settings: "Configuración", logout: "Cerrar sesión" },
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
            deptArea: "Área Dep. {n}", option: "Opción {n}"
        },
        main: { welcome: "Bienvenido", messages: "Mensajes", notifications: "Notificaciones", bookmarks: "Marcadores", settings: "Configuración", addUser: "Agregar usuario", language: "Idioma", style: "Estilo", others: "Otros", languageEnglish: "Inglés", languageSpanish: "Español", styleLight: "Claro", styleDark: "Oscuro", styleInstitutional: "Color Institucional", inDevelopment: "En desarrollo, seguimos trabajando para una mejor experiencia" }
    }
};

// --- Auth guard -------------------------------------------------------------
// The session cookie is httpOnly (by design, to keep it out of reach of any
// injected script), so it can't be read from document.cookie. The only way
// to check auth client-side is to ask the server, which is also the only
// check that actually matters — see /api/me below.
async function authGuard() {
    try {
        const res = await fetch(`${API_BASE}/me`, { credentials: 'include' });
        if (!res.ok) throw new Error('not authenticated');
        return true;
    } catch {
        window.location.replace('Login.html');
        return false;
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
    document.querySelectorAll('.lang-option').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    if (menuData) renderMenu(menuData);
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

// --- Menu interactions (dropdowns, minimize, dark mode, mobile) ------------
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
// The Language and Style controls live inside this dropdown as the actual
// #lang-toggle / #dark-mode-btn buttons (their toggle behavior is wired
// separately below/in wireMenuInteractions) — this block only owns
// open/close of the dropdown itself.
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
            alert(t('main.inDevelopment'));
            return;
        }
        document.body.classList.toggle('dark-mode', btn.dataset.style === 'dark');
        document.querySelectorAll('.style-option[data-style="light"], .style-option[data-style="dark"]')
            .forEach((b) => b.classList.toggle('active', b === btn));
    });
});

// --- Logout: invalidate the server-side session, then navigate away --------
document.getElementById('logout-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    sessionStorage.removeItem('sgn_token');
    fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
        .catch(() => {})
        .finally(() => window.location.replace('Login.html'));
});

// --- Init --------------------------------------------------------------------
(async function init() {
    try {
        if (!(await authGuard())) return;
        await loadLanguage(getStoredLang());
        menuData = await loadMenu();
        renderMenu(menuData);
        checkWindowSize();
    } catch (err) {
        console.error('Dashboard failed to initialize:', err);
    }
})();
