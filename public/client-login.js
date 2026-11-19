// ---------------------------------------------------------------------------
// Inicio de sesión PERSONALIZADO de un cliente (…/c/<clave>, Apps Nuestros Clientes).
//
// server.js (GET /c/:slug) sirve Login.html con <body class="cl-mode"> y deja en window.SGN_CLIENT_LOGIN lo
// PUBLICADO del cliente: nombre, logo, textos y qué se muestra (los colores y el fondo van ya en el CSS de la
// página). Este archivo solo arma el panel de marca (logo, nombre, saludo y frase) y esconde lo que el cliente
// no quiere mostrar. El inicio de sesión en sí es el de siempre (login.js, /api/auth/login): no cambia ni se
// duplica. Solo lo carga el servidor en esa dirección; no va en la app del celular.
// ---------------------------------------------------------------------------
(function () {
    const cfg = window.SGN_CLIENT_LOGIN;
    const page = document.body;
    const container = document.querySelector('.container');
    if (!cfg || !container || !page.classList.contains('cl-mode')) return;

    const loginBox = container.querySelector('.form-box.login');
    const registerBox = container.querySelector('.form-box.register');
    const one = (selector, root) => (root || document).querySelector(selector);
    const hide = (el) => { if (el) el.classList.add('cl-off'); };

    // --- el panel de marca: logo (o el distintivo de la marca), nombre, saludo y frase de bienvenida ---
    const brand = document.createElement('div');
    brand.className = `cl-brand${cfg.diagonal ? ' cl-band' : ''}`;
    if (cfg.logoUrl) {
        const logo = new Image();
        logo.className = 'cl-logo';
        logo.alt = '';
        logo.src = cfg.logoUrl;
        brand.appendChild(logo);
    } else {
        const mark = document.createElement('span');
        mark.className = 'cl-mark';
        brand.appendChild(mark);
    }
    const name = document.createElement('div');
    name.className = 'cl-name';
    name.textContent = String(cfg.name || '').toUpperCase();
    brand.appendChild(name);
    let greet = null;
    if (cfg.texts && cfg.texts.greeting) {
        greet = document.createElement('div');
        greet.className = 'cl-greet';
        brand.appendChild(greet);
    }
    if (cfg.texts && cfg.texts.welcome) {
        const sub = document.createElement('div');
        sub.className = 'cl-sub';
        sub.textContent = cfg.texts.welcome;
        brand.appendChild(sub);
    }
    container.insertBefore(brand, container.firstChild);

    // El saludo sigue la hora del aparato y el idioma de la página (se vuelve a poner al cambiar de idioma).
    const GREETINGS = { es: ['Buenos días', 'Buenas tardes', 'Buenas noches'], en: ['Good morning', 'Good afternoon', 'Good evening'] };
    function paintGreeting() {
        if (!greet) return;
        const hour = new Date().getHours();
        const words = GREETINGS[document.documentElement.lang] || GREETINGS.es;
        greet.textContent = words[hour < 12 ? 0 : (hour < 19 ? 1 : 2)];
    }
    paintGreeting();
    new MutationObserver(paintGreeting).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

    // --- el formulario: el título y el botón dicen lo que el cliente escribió (si lo dejó vacío, el texto de siempre) ---
    const title = cfg.texts && cfg.texts.formTitle;
    if (title) {
        const heading = one('h1', loginBox);
        const button = one('#login-submit span');
        [heading, button].forEach((el) => { if (el) { el.removeAttribute('data-i18n'); el.textContent = title; } });
    }

    // --- qué se muestra ---
    const show = cfg.show || {};
    if (!show.forgot) hide(one('.forgot-link', loginBox));
    if (!show.language) hide(document.getElementById('lang-toggle'));
    if (!show.appLink) hide(document.getElementById('open-app-link'));
    if (!show.social) {
        container.querySelectorAll('.social-icons a:not(.sgn-app)').forEach(hide);
        container.querySelectorAll('p[data-i18n="login.orLoginWith"], p[data-i18n="login.orRegisterWith"]').forEach(hide);
    }
    container.querySelectorAll('.social-icons').forEach((row) => { if (!row.querySelector('a:not(.cl-off)')) hide(row); });

    // Registro de usuarios nuevos: apagado de fábrica. Si el cliente lo enciende, un enlace cambia entre los dos formularios.
    if (show.register && loginBox && registerBox) {
        const swap = (formBox, question, action, registering) => {
            const line = document.createElement('p');
            line.className = 'cl-swap';
            const text = document.createElement('span');
            text.setAttribute('data-i18n', question);
            const link = document.createElement('button');
            link.type = 'button';
            link.setAttribute('data-i18n', action);
            link.addEventListener('click', () => page.classList.toggle('cl-register', registering));
            line.append(text, document.createTextNode(' '), link);
            formBox.querySelector('form').appendChild(line);
        };
        swap(loginBox, 'login.noAccount', 'login.registerButton', true);
        swap(registerBox, 'login.alreadyHaveAccount', 'login.loginButton', false);
    } else {
        hide(registerBox);
    }

    // Lo agregado aquí pide sus textos a login.js (t): ya traducidos si el idioma está cargado y, si no, cuando se cargue (login.js los pone solo; esto cubre el cambio de idioma).
    function translateMine() {
        container.querySelectorAll('.cl-swap [data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            const text = typeof t === 'function' ? t(key) : key;
            if (text && text !== key) el.textContent = text;
        });
    }
    translateMine();
    new MutationObserver(translateMine).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    // Instalada en la pantalla de inicio (opción C: «Agregar a la pantalla de inicio» desde esta dirección): quien ya tiene sesión entra directo a su sistema en lugar de ver el inicio otra vez.
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    if (standalone) {
        fetch('/api/me', { credentials: 'include' }).then((res) => { if (res.ok) window.location.replace('/Inicio-en.html'); }).catch(() => { /* sin señal: se queda el inicio */ });
    }
    page.classList.add('cl-ready');
})();
