// ---------------------------------------------------------------------------
// Inicio PERSONALIZADO de cada cliente en la APP del celular (Apps Nuestros Clientes, pieza 3).
//
// Una sola app SGN para todos. La primera vez pide el «código de empresa» (la CLAVE del cliente: la misma de
// …/c/<clave>); también se puede pegar el enlace o escanear su QR. Con el código, la app pide a GET
// /api/public/client-login/<clave> la marca publicada para celular (logo, colores, fondo, textos, qué se muestra)
// y la GUARDA en el celular (localStorage), con el logo y la imagen de fondo dentro: así se ve igual sin señal.
// En cada apertura pinta lo guardado al instante y pregunta al servidor si cambió (version) para ponerse al día.
//
// Quien ya usaba la app (ya inició sesión alguna vez) no ve la pantalla del código: sigue con el inicio de
// siempre y puede poner un código desde el menú (≡). «Entrar sin código» también deja el inicio de siempre.
// El menú (≡) siempre ofrece «Cambiar de empresa» y, si hay una, «Usar el inicio de SGN».
//
// Face ID/huella y el inicio de sesión no cambian: esto solo cambia cómo se ven las pantallas de access-screen.js
// y qué opciones ofrecen. Cada cambio de empresa recarga la página (así solo existe UN camino que pinta la marca:
// el de la apertura). Solo actúa dentro de la app (access-screen.js lo llama); en el navegador no hace nada.
// ---------------------------------------------------------------------------
(function () {
    const BRAND_KEY = 'sgnClientBrand';
    const ASKED_KEY = 'sgnCompanyAsked';
    const HAD_SESSION_KEY = 'sgnHadSession';
    const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    // App PROPIA de un cliente (Apps Nuestros Clientes, pieza 6): el armado por cliente (.github/scripts/prepare-client-app.js) pone aquí la clave de la empresa en la COPIA que va dentro del APK; en la app de todos queda vacío.
    // Con clave puesta la app NO pide el código de empresa, no ofrece «Cambiar de empresa» ni «Usar el inicio de SGN», y siempre se queda con la marca de esa empresa (aunque el servidor no responda).
    const PRESET_COMPANY = ''; // @@SGN_PRESET_COMPANY@@ (no cambiar este renglón a mano: el armado lo busca tal cual)

    // Textos: los del idioma cargado por login.js si ya están; si no, el de respaldo (en inglés, como el resto de access-screen.js).
    const tr = (key, fallback, params) => {
        const value = typeof window.t === 'function' ? window.t(key, params) : key;
        return value && value !== key ? value : fallback;
    };
    const bound = []; // [elemento, clave, respaldo]: se vuelven a poner al cambiar de idioma
    function bindText(el, key, fallback) {
        el.textContent = tr(key, fallback);
        bound.push([el, key, fallback]);
        return el;
    }
    new MutationObserver(() => bound.forEach(([el, key, fallback]) => { el.textContent = tr(key, fallback); }))
        .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    const api = (path) => (typeof window.apiUrl === 'function' ? window.apiUrl(path) : path);

    // ---- lo guardado en el celular ----
    function readSaved() {
        try {
            const raw = localStorage.getItem(BRAND_KEY);
            if (!raw) return null;
            const saved = JSON.parse(raw);
            return saved && saved.slug && saved.config && saved.config.colors && saved.config.texts && saved.config.show ? saved : null;
        } catch { return null; }
    }
    let saved = readSaved();
    // En la app propia de un cliente solo vale lo guardado de ESA empresa (si el aparato traía otra, se olvida).
    if (PRESET_COMPANY && saved && saved.slug !== PRESET_COMPANY) { try { localStorage.removeItem(BRAND_KEY); } catch { /* nada */ } saved = null; }
    function writeSaved(slug, config) {
        const value = { slug, config, savedAt: Date.now() };
        try { localStorage.setItem(BRAND_KEY, JSON.stringify(value)); } catch {
            // no cupo con la imagen de fondo: se guarda sin ella (el fondo cae a un degradado de la marca)
            try { localStorage.setItem(BRAND_KEY, JSON.stringify({ ...value, config: { ...config, bgImage: '' } })); } catch { /* sin lugar: solo en memoria */ }
        }
        saved = readSaved() || value;
    }
    function clearSaved() {
        try { localStorage.removeItem(BRAND_KEY); } catch { /* nada */ }
        saved = null;
    }
    const markAsked = () => { try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* nada */ } };

    // «Código de empresa» o un enlace …/c/<clave> → la clave, o '' si no parece una.
    function parseCode(text) {
        const raw = String(text || '').trim().toLowerCase();
        if (!raw) return '';
        const inLink = /\/c\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])(?:[/?#]|$)/.exec(raw);
        const slug = inLink ? inLink[1] : raw;
        return slug.length >= 3 && slug.length <= 40 && SLUG_RE.test(slug) ? slug : '';
    }
    // { data } | { unchanged } | { missing } | { limited } | { failed }
    async function fetchConfig(slug, version, timeoutMs) {
        const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
        try {
            const res = await fetch(api(`/api/public/client-login/${encodeURIComponent(slug)}${version ? `?v=${encodeURIComponent(version)}` : ''}`), { credentials: 'omit', signal: ctrl ? ctrl.signal : undefined });
            if (res.status === 404) return { missing: true };
            if (res.status === 429) return { limited: true };
            if (!res.ok) return { failed: true };
            const data = await res.json();
            return data && data.unchanged ? { unchanged: true } : { data };
        } catch { return { failed: true }; } finally { if (timer) clearTimeout(timer); }
    }

    // ---- pintar la marca en las pantallas de access-screen.js ----
    const GREETINGS = { es: ['Buenos días', 'Buenas tardes', 'Buenas noches'], en: ['Good morning', 'Good afternoon', 'Good evening'] };
    let greetEl = null;
    function paintGreeting() {
        if (!greetEl) return;
        const hour = new Date().getHours();
        const words = GREETINGS[document.documentElement.lang] || GREETINGS.en;
        greetEl.textContent = words[hour < 12 ? 0 : (hour < 19 ? 1 : 2)];
    }
    new MutationObserver(paintGreeting).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    function fillMark(mark, config) {
        if (!mark) return;
        mark.innerHTML = '';
        if (config.logo) {
            const img = new Image();
            img.alt = '';
            img.src = config.logo;
            mark.classList.add('cl-mark');
            mark.appendChild(img);
        } else {
            mark.classList.add('cl-ring');
        }
    }
    // Pinta lo guardado (síncrono, sin esperar a la red). Devuelve la marca o null si no hay empresa guardada.
    function applySaved(screen) {
        if (!saved || !screen) return null;
        const c = saved.config;
        screen.classList.add('cl-app');
        if (c.diagonal) screen.classList.add('cl-band');
        screen.style.setProperty('--cl-button', c.colors.button);
        screen.style.setProperty('--cl-primary', c.colors.primary);
        if (c.bgImage) screen.style.setProperty('--cl-bg-image', `url("${c.bgImage}")`);
        screen.style.setProperty('--cl-bg', c.bgImage ? c.bgCss : (c.bgCssPlain || c.bgCss));
        fillMark(document.getElementById('access-mark'), c);
        fillMark(document.getElementById('access-pw-mark'), c);
        const name = document.getElementById('access-name');
        if (name) name.textContent = String(c.name || '').toUpperCase();
        const pwTitle = document.getElementById('access-pw-title');
        if (pwTitle) { pwTitle.removeAttribute('data-i18n'); pwTitle.textContent = String(c.name || '').toUpperCase(); }
        const submit = document.getElementById('access-pw-submit-text');
        if (submit && c.texts.formTitle) { submit.removeAttribute('data-i18n'); submit.textContent = c.texts.formTitle; }
        // saludo y frase de bienvenida, justo debajo del nombre (la frase fija «Sistema de Gestión de Negocios» se va)
        const tag = document.getElementById('access-tag');
        if (name && tag) {
            if (c.texts.greeting) {
                greetEl = document.createElement('div');
                greetEl.className = 'cl-greet';
                name.insertAdjacentElement('afterend', greetEl);
                paintGreeting();
            }
            if (c.texts.welcome) {
                const welcome = document.createElement('div');
                welcome.className = 'cl-welcome';
                welcome.textContent = c.texts.welcome;
                (greetEl || name).insertAdjacentElement('afterend', welcome);
            }
        }
        const bio = document.getElementById('access-biometric-btn');
        if (bio && !c.show.faceId) bio.classList.add('cl-off');
        return c;
    }

    // ---- quién entra y cómo: el botón de bienvenida, la hoja y la flecha de atrás ----
    let enterBtn = null;
    // Después de cargar, access-screen.js enseñaba la flecha (peek). Con empresa guardada: el botón de entrada (texto de la app del cliente) o, sin pantalla de bienvenida, directo a lo siguiente.
    // Devuelve true si ya se encargó (access-screen.js no muestra la flecha).
    function decorateEntry(ctx) {
        if (!saved) return false;
        const c = saved.config;
        const goIn = () => (c.show.faceId ? ctx.showSheet() : ctx.showPasswordScreen());
        if (!c.show.welcomeScreen) {
            if (!c.show.faceId) { const back = document.getElementById('access-pw-back'); if (back) back.classList.add('cl-off'); }
            goIn();
            return true;
        }
        enterBtn = document.createElement('button');
        enterBtn.type = 'button';
        enterBtn.id = 'access-enter';
        enterBtn.className = 'cl-enter';
        enterBtn.textContent = c.texts.appButton || tr('login.accessEnter', 'Enter');
        enterBtn.addEventListener('click', goIn);
        ctx.peek.insertAdjacentElement('beforebegin', enterBtn);
        return true;
    }
    // La flecha de atrás de la pantalla de usuario y contraseña. true = ya se encargó. Sin Face ID no hay hoja a la que volver: se vuelve a la bienvenida.
    function handleBack(ctx) {
        if (!saved || saved.config.show.faceId) return false;
        ctx.pwScreen.hidden = true;
        return true;
    }

    // ---- la pantalla del código de empresa ----
    const scanSupported = () => 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
    // dismissible: se puede cerrar sin elegir (desde el menú). Devuelve una promesa que termina cuando se cierra o se elige «sin código»; con un código válido la página se recarga.
    function showCompanyScreen(screen, dismissible) {
        return new Promise((resolve) => {
            const el = document.createElement('div');
            el.className = 'access-company-screen';
            el.id = 'access-company-screen';
            el.innerHTML = `${dismissible ? '<button type="button" class="access-pw-back" id="access-company-close"><i class="bx bx-x" aria-hidden="true"></i></button>' : ''}
                <div class="cl-company-icon"><i class="bx bx-buildings" aria-hidden="true"></i></div>
                <p class="access-pw-title" id="access-company-title"></p>
                <form class="access-pw-form" id="access-company-form" novalidate>
                    <div class="access-pw-field"><i class="bx bx-hash" aria-hidden="true"></i><input id="access-company-input" type="text" inputmode="url" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false"></div>
                    <p class="access-pw-error" id="access-company-error" role="alert" hidden></p>
                    <button type="submit" class="access-btn" id="access-company-go"><span id="access-company-go-text"></span></button>
                    ${scanSupported() ? '<button type="button" class="cl-secondary" id="access-company-scan"><i class="bx bx-qr-scan" aria-hidden="true"></i><span id="access-company-scan-text"></span></button>' : ''}
                </form>
                <button type="button" class="cl-link" id="access-company-skip"></button>`;
            screen.appendChild(el);
            const input = el.querySelector('#access-company-input');
            const errorEl = el.querySelector('#access-company-error');
            const goBtn = el.querySelector('#access-company-go');
            bindText(el.querySelector('#access-company-title'), 'login.companyTitle', 'Company code');
            bindText(el.querySelector('#access-company-go-text'), 'login.companyContinue', 'Continue');
            bindText(el.querySelector('#access-company-skip'), dismissible ? 'login.companyCancel' : 'login.companyNoCode', dismissible ? 'Cancel' : 'Continue without a code');
            const scanText = el.querySelector('#access-company-scan-text');
            if (scanText) bindText(scanText, 'login.companyScan', 'Scan QR');
            const setPlaceholder = () => { input.placeholder = tr('login.companyPlaceholder', 'Code or link'); };
            setPlaceholder();
            new MutationObserver(setPlaceholder).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
            const showError = (key, fallback) => { errorEl.textContent = tr(key, fallback); errorEl.hidden = false; };
            const close = () => { el.remove(); resolve(); };
            async function submit(rawText) {
                errorEl.hidden = true;
                const slug = parseCode(rawText);
                if (!slug) { showError('login.companyBad', 'That does not look like a company code.'); return; }
                goBtn.disabled = true;
                const result = await fetchConfig(slug, '', 10000);
                goBtn.disabled = false;
                if (result.missing) { showError('login.companyNotFound', 'We could not find that code. Check that it is written right.'); return; }
                if (result.limited) { showError('login.tooManyAttempts', 'Too many attempts. Please wait a few minutes and try again.'); return; }
                if (!result.data) { showError('login.companyNoSignal', 'The code could not be checked. Check your connection and try again.'); return; }
                writeSaved(slug, result.data);
                markAsked();
                window.location.reload();
            }
            el.querySelector('#access-company-form').addEventListener('submit', (event) => { event.preventDefault(); submit(input.value); });
            el.querySelector('#access-company-skip').addEventListener('click', () => { if (!dismissible) markAsked(); close(); });
            el.querySelector('#access-company-close')?.addEventListener('click', close);
            el.querySelector('#access-company-scan')?.addEventListener('click', () => scanQr((text) => { input.value = text; submit(text); }));
            setTimeout(() => { try { input.focus(); } catch { /* nada */ } }, 50);
        });
    }
    // El lector de QR: el mismo BarcodeDetector + cámara de las demás pantallas de la app (solo se ofrece si el aparato lo trae).
    async function scanQr(onText) {
        const overlay = document.createElement('div');
        overlay.className = 'cl-scan';
        overlay.innerHTML = '<div class="cl-scan-top"><button type="button" class="access-pw-back" id="cl-scan-close"><i class="bx bx-x" aria-hidden="true"></i></button><span id="cl-scan-title"></span></div><video playsinline muted></video>';
        document.body.appendChild(overlay);
        bindText(overlay.querySelector('#cl-scan-title'), 'login.companyScanTitle', 'Scan the QR');
        const video = overlay.querySelector('video');
        let stream = null; let stopped = false; let rafId = 0;
        const stop = () => { stopped = true; if (rafId) cancelAnimationFrame(rafId); if (stream) stream.getTracks().forEach((track) => track.stop()); overlay.remove(); };
        overlay.querySelector('#cl-scan-close').addEventListener('click', stop);
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
            video.srcObject = stream;
            await video.play();
            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            const tick = async () => {
                if (stopped) return;
                try {
                    const found = await detector.detect(video);
                    const hit = found.map((item) => item.rawValue).find((text) => parseCode(text));
                    if (hit) { stop(); onText(hit); return; }
                } catch { /* un cuadro que no se pudo leer: se sigue */ }
                rafId = requestAnimationFrame(tick);
            };
            tick();
        } catch {
            stop();
            const errorEl = document.getElementById('access-company-error');
            if (errorEl) { errorEl.textContent = tr('login.companyScanError', 'The camera could not be opened. Type the code instead.'); errorEl.hidden = false; }
        }
    }

    // ---- el menú (≡): cambiar de empresa / volver al inicio de SGN ----
    function setupMenu(screen) {
        if (PRESET_COMPANY) return; // la app propia de un cliente no cambia de empresa
        if (!screen || document.getElementById('access-menu-btn')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'access-menu-btn';
        btn.className = 'access-menu-btn';
        btn.setAttribute('aria-label', 'Menu');
        btn.innerHTML = '<i class="bx bx-menu" aria-hidden="true"></i>';
        const menu = document.createElement('div');
        menu.className = 'cl-menu';
        menu.id = 'access-menu';
        menu.hidden = true;
        const item = (id, key, fallback) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.className = 'cl-menu-item'; bindText(b, key, fallback); return b; };
        if (saved) {
            const current = document.createElement('div');
            current.className = 'cl-menu-current';
            current.textContent = String(saved.config.name || '');
            menu.appendChild(current);
        }
        const change = item('access-menu-change', 'login.companyChange', 'Change company');
        menu.appendChild(change);
        let useSgn = null;
        if (saved) { useSgn = item('access-menu-sgn', 'login.companyUseSgn', 'Use the SGN sign-in'); menu.appendChild(useSgn); }
        screen.appendChild(btn);
        screen.appendChild(menu);
        const toggle = (open) => { menu.hidden = open === undefined ? !menu.hidden : !open; };
        btn.addEventListener('click', (event) => { event.stopPropagation(); toggle(); });
        document.addEventListener('click', (event) => { if (!menu.hidden && !menu.contains(event.target)) toggle(false); });
        change.addEventListener('click', () => { toggle(false); showCompanyScreen(screen, true); });
        if (useSgn) useSgn.addEventListener('click', () => { clearSaved(); markAsked(); window.location.reload(); });
    }

    // ---- al abrir: ¿hay que pedir el código? y ponerse al día con el servidor ----
    // Solo la primera vez y solo a quien nunca ha iniciado sesión en la app y no dijo «sin código».
    const shouldAsk = () => {
        if (PRESET_COMPANY) return false;
        try { return !saved &&localStorage.getItem(ASKED_KEY) !== '1' && localStorage.getItem(HAD_SESSION_KEY) !== '1'; } catch { return false; }
    };
    // En segundo plano: si cambió lo publicado se guarda (y, si la persona aún no empezó a escribir, se recarga para verlo); si la empresa ya no existe o dejó de publicar para celular, se olvida.
    async function refresh() {
        const idle = () => { const pw = document.getElementById('access-password-screen'); const user = document.getElementById('access-pw-username'); return (!pw || pw.hidden) && (!user || !user.value); };
        // App propia: la primera vez no hay nada guardado; se trae la marca de SU empresa (sin pedir código) y se recarga para verla. Si no hay señal, queda el inicio de siempre y se reintenta en la próxima apertura.
        if (PRESET_COMPANY && !saved) {
            const first = await fetchConfig(PRESET_COMPANY, '', 10000);
            if (first.data) { writeSaved(PRESET_COMPANY, first.data); if (idle()) window.location.reload(); }
            return;
        }
        if (!saved) return;
        const result = await fetchConfig(saved.slug, saved.config.version, 8000);
        if (result.missing && PRESET_COMPANY) return; // la app propia no se vuelve la de SGN aunque la empresa deje de publicar: se queda con lo último que trajo
        if (result.missing) { clearSaved(); if (idle()) window.location.reload(); return; }
        if (result.data) { writeSaved(saved.slug, result.data); if (idle()) window.location.reload(); }
    }

    window.SgnClientBrand = { getSaved: () => saved, shouldAsk, applySaved, setupMenu, showCompanyScreen, decorateEntry, handleBack, refresh, parseCode };
})();
