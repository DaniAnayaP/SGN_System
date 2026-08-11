// ---------------------------------------------------------------------------
// Login page controller: language switching, form validation and auth call.
//
// IMPORTANT: This file talks to a backend at /api/auth/*. See
// server-example/server.js for a reference implementation (bcrypt + JWT).
// This file NEVER stores plaintext passwords and NEVER decides on its own
// whether a login is valid — that decision always comes from the server.
// ---------------------------------------------------------------------------

const API_BASE = window.APP_CONFIG?.apiBase || '/api';
const SUPPORTED_LANGS = ['en', 'es'];
const DEFAULT_LANG = 'en';

const container = document.querySelector('.container');
const registerBtn = document.querySelector('.register-btn');
const loginBtn = document.querySelector('.login-btn');
const langToggle = document.getElementById('lang-toggle');
const errorBanner = document.getElementById('form-error');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

let dict = {};
let currentLang = DEFAULT_LANG;

// Embedded fallback so the language toggle works even when i18n/*.json can't
// be fetched — this happens when the page is opened directly as a file
// (file://) instead of served over http(s), since browsers block fetch()
// of local files by default. Keep this in sync with i18n/en.json / es.json.
const EMBEDDED_TRANSLATIONS = {
    en: {
        meta: { loginTitle: "SGN by GEIPSA - Login", dashboardTitle: "SGN - Home" },
        login: {
            loginHeading: "Login", registerHeading: "Registration",
            usernamePlaceholder: "Username", usernameLabel: "Username",
            passwordPlaceholder: "Password", passwordLabel: "Password",
            emailPlaceholder: "Email", emailLabel: "Email",
            forgotPassword: "Forgot password?", loginButton: "Login", registerButton: "Register",
            orLoginWith: "or login with social platforms", orRegisterWith: "or register with social platforms",
            welcomeBack: "Welcome back!", alreadyHaveAccount: "Already have an account?",
            helloWelcome: "Hello, welcome!", noAccount: "Don't have an account?",
            showPassword: "Show password", hidePassword: "Hide password",
            invalidCredentials: "Incorrect username or password.",
            genericError: "Something went wrong. Please try again.",
            signingIn: "Signing in...", fieldRequired: "This field is required."
        }
    },
    es: {
        meta: { loginTitle: "SGN by GEIPSA - Iniciar sesión", dashboardTitle: "SGN - Inicio" },
        login: {
            loginHeading: "Iniciar sesión", registerHeading: "Registro",
            usernamePlaceholder: "Usuario", usernameLabel: "Usuario",
            passwordPlaceholder: "Contraseña", passwordLabel: "Contraseña",
            emailPlaceholder: "Correo electrónico", emailLabel: "Correo electrónico",
            forgotPassword: "¿Olvidaste tu contraseña?", loginButton: "Ingresar", registerButton: "Registrarse",
            orLoginWith: "o inicia sesión con redes sociales", orRegisterWith: "o regístrate con redes sociales",
            welcomeBack: "¡Bienvenido de nuevo!", alreadyHaveAccount: "¿Ya tienes una cuenta?",
            helloWelcome: "¡Hola, bienvenido!", noAccount: "¿No tienes una cuenta?",
            showPassword: "Mostrar contraseña", hidePassword: "Ocultar contraseña",
            invalidCredentials: "Usuario o contraseña incorrectos.",
            genericError: "Algo salió mal. Inténtalo de nuevo.",
            signingIn: "Iniciando sesión...", fieldRequired: "Este campo es obligatorio."
        }
    }
};

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
    applyTranslations();
}

function applyTranslations() {
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
langToggle?.addEventListener('click', async () => {
    if (langSwitching) return;
    langSwitching = true;
    const next = currentLang === 'en' ? 'es' : 'en';
    try {
        await loadLanguage(next);
    } catch (err) {
        console.error('Language switch failed:', err);
    } finally {
        langSwitching = false;
    }
});

// --- Panel toggle (login vs register) --------------------------------------
registerBtn?.addEventListener('click', () => container.classList.add('active'));
loginBtn?.addEventListener('click', () => container.classList.remove('active'));

// --- Password visibility toggles --------------------------------------------
function wirePasswordToggle(buttonId, inputId) {
    const btn = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.querySelector('i').className = isHidden ? 'bx bx-show' : 'bx bx-hide';
        btn.setAttribute('aria-label', t(isHidden ? 'login.hidePassword' : 'login.showPassword'));
    });
}
wirePasswordToggle('toggle-login-password', 'login-password');
wirePasswordToggle('toggle-register-password', 'register-password');

// --- Error banner -------------------------------------------------------------
function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
}
function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
}

// --- Basic client-side validation (server re-validates everything) ---------
function validateRequired(form) {
    let valid = true;
    form.querySelectorAll('input[required]').forEach((input) => {
        input.classList.remove('invalid');
        if (!input.value.trim() || (input.type === 'password' && input.value.length < 8)) {
            input.classList.add('invalid');
            valid = false;
        }
    });
    return valid;
}

// --- Login submit -------------------------------------------------------------
loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    if (!validateRequired(loginForm)) {
        showError(t('login.fieldRequired'));
        return;
    }

    const submitBtn = document.getElementById('login-submit');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = t('login.signingIn');

    const payload = {
        username: loginForm.username.value.trim(),
        password: loginForm.password.value,
    };

    try {
        const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // credentials: 'include' if the backend uses httpOnly session cookies
            // (recommended over storing the token in JS-accessible storage).
            credentials: 'include',
            body: JSON.stringify(payload),
        });

        if (res.status === 401) {
            showError(t('login.invalidCredentials'));
            return;
        }
        if (!res.ok) {
            showError(t('login.genericError'));
            return;
        }

        const data = await res.json();
        // If the backend issues a token instead of a cookie, keep it only in
        // memory/sessionStorage (never localStorage) and re-check on the server
        // for every protected action — the client-side check is UX only.
        if (data.token) {
            sessionStorage.setItem('sgn_token', data.token);
        }
        // Tells Dashboard.js's first page load after this login to apply the
        // account's saved default Departamento/Área/Centro de Costos instead
        // of whatever's left over in localStorage from a previous session.
        sessionStorage.setItem('applyLoginDefaults', '1');
        window.location.href = 'Inicio-en.html';
    } catch (err) {
        console.error(err);
        showError(t('login.genericError'));
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
});

// --- Register submit ----------------------------------------------------------
registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    if (!validateRequired(registerForm)) {
        showError(t('login.fieldRequired'));
        return;
    }

    const payload = {
        username: registerForm.username.value.trim(),
        email: registerForm.email.value.trim(),
        password: registerForm.password.value,
    };

    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(body.message || t('login.genericError'));
            return;
        }
        container.classList.remove('active');
        loginForm.username.value = payload.username;
    } catch (err) {
        console.error(err);
        showError(t('login.genericError'));
    }
});

// --- Init ------------------------------------------------------------------
loadLanguage(getStoredLang()).catch(console.error);
