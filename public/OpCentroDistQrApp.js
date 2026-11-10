// ---------------------------------------------------------------------------
// Operaciones > QR's: cada app que se hace escaneando un QR, pero desde la computadora (para quien no tiene celular a la mano). Se elige el sitio arriba, se busca lo que tiene QR (un activo, un refrigerador, un sensor…) y
// «Abrir» muestra, como una pantalla normal de esta misma página (con su ruta arriba, que termina con el sitio abierto, y «Volver a la lista»), la MISMA pantalla que abre el QR (su dirección fija): lo que se registra queda en la base de Operaciones de esa app igual que desde el celular. La foto la toma la
// cámara de la computadora (las pantallas públicas exigen cámara en vivo). Una sola página sirve a todas las entradas del grupo: cuál es sale de data-qr-app del <body> (ver APPS).
// Envuelto en una función: Dashboard.js ya declara globales como t.
// ---------------------------------------------------------------------------
(function () {
    const t = (key, params) => {
        let text = Dashboard.t(key);
        Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
        return text;
    };
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const $ = (id) => document.getElementById(id);
    const typeName = (group, type) => Dashboard.t(`main.layoutType_${group}_${type}`);
    // Qué cambia de una entrada a otra: la pantalla del menú, la lista del servidor, cómo se llama lo que se elige y los textos.
    const APPS = {
        limpieza: {
            page: 'cat-operaciones-centro-dist-qr-limpieza', api: '/api/business/qr-apps/limpieza', help: 'qrsLimpieza',
            first: 'main.colLimActivo', search: 'main.qrsBuscar', empty: 'main.qrsVacio', windowTitle: 'main.qrsVentana', count: 'main.qrsCuantos',
            label: (s) => `<b>${esc(s.code)}</b> · ${esc(typeName('space', s.type))}`, haystack: (s) => `${s.code} ${typeName('space', s.type)} ${s.zoneName} ${s.locator}`,
        },
        temperaturas: {
            page: 'cat-operaciones-centro-dist-qr-temperaturas', api: '/api/business/qr-apps/temperaturas', help: 'qrsTemperaturas',
            first: 'main.qrsEquipo', search: 'main.qrsBuscarEquipo', empty: 'main.qrsVacioTemp', windowTitle: 'main.qrsVentanaTemp', count: 'main.qrsCuantosEquipos',
            label: (s) => `<b>${esc(s.code)}</b> · ${esc(s.kind === 'sensor' ? `${t('main.qrsSensor')} ${typeName('sensor', s.type).toLowerCase()}` : t('main.qrsRefrigerador'))}`,
            haystack: (s) => `${s.code} ${s.kind === 'sensor' ? `${t('main.qrsSensor')} ${typeName('sensor', s.type)}` : t('main.qrsRefrigerador')} ${s.zoneName} ${s.locator}`,
        },
        // simple: la lista es de un solo renglón (el QR es uno por centro de costos): sin filtro de zona, sin buscador y sin columnas de zona ni localizador.
        pedidoManual: {
            page: 'cat-operaciones-centro-dist-qr-pedido-manual', api: '/api/business/qr-apps/pedido-manual', help: 'qrsPedidoManual', simple: true,
            first: 'main.qrsCentro', windowTitle: 'main.qrsVentanaPm', count: 'main.qrsCuantosCentros',
            label: (s) => `<b>${esc(s.code)}</b>${s.siteName ? ` · ${esc(s.siteName)}` : ''}`,
        },
        dondeEsta: {
            page: 'cat-operaciones-centro-dist-qr-donde-esta', api: '/api/business/qr-apps/donde-esta', help: 'qrsDondeEsta', simple: true,
            first: 'main.qrsCentro', windowTitle: 'main.qrsVentanaDonde', count: 'main.qrsCuantosCentros',
            label: (s) => `<b>${esc(s.code)}</b>${s.siteName ? ` · ${esc(s.siteName)}` : ''}`,
        },
        incidentes: {
            page: 'cat-operaciones-centro-dist-qr-incidentes', api: '/api/business/qr-apps/incidentes', help: 'qrsIncidentes', simple: true,
            first: 'main.qrsCentro', windowTitle: 'main.qrsVentanaInc', count: 'main.qrsCuantosCentros',
            label: (s) => `<b>${esc(s.code)}</b>${s.siteName ? ` · ${esc(s.siteName)}` : ''}`,
        },
        seguridad: {
            page: 'cat-operaciones-centro-dist-qr-seguridad', api: '/api/business/qr-apps/seguridad', help: 'qrsSeguridad',
            first: 'main.layoutQrSeguridadCategoria', search: 'main.qrsBuscarElementoSeg', empty: 'main.qrsVacioSeg', windowTitle: 'main.qrsVentanaSeg', count: 'main.qrsCuantosElementos',
            label: (s) => `<b>${esc(s.code)}</b> · ${esc(typeName('safety', s.type))}${s.name ? ` · ${esc(s.name)}` : ''}`,
            haystack: (s) => `${s.code} ${typeName('safety', s.type)} ${s.name} ${s.zoneName} ${s.locator}`,
        },
        // remote: la lista de códigos puede ser enorme, así que el buscador pide al servidor (los primeros 100 que cumplan) y no depende de un centro de costos (la ficha es una por código).
        ficha: {
            page: 'cat-operaciones-centro-dist-qr-ficha', api: '/api/business/qr-apps/ficha', help: 'qrsFicha', remote: true,
            first: 'main.qrsCodigo', search: 'main.qrsBuscarCodigo', empty: 'main.qrsVacioFicha', windowTitle: 'main.qrsVentanaFicha', count: 'main.qrsCuantosCodigos',
            label: (s) => `<b>${esc(s.code)}</b>${s.name ? ` · ${esc(s.name)}` : ''}`,
        },
    };
    const app = APPS[document.body.dataset.qrApp];
    if (!app) return;
    let data = { zones: [], spaces: [] };
    let zone = '';
    let q = '';
    let qTimer = null;
    let openedId = null; // el sitio abierto (null = se ve la lista)
    let hashHandled = false;

    (async function init() {
        try {
            const role = await Dashboard.initDashboard({ activePage: app.page });
            if (!role) return;
            await load();
        } catch (err) {
            console.error('QR\'s failed to initialize:', err);
        }
    })();
    // Al cambiar de centro de costos se vuelve a la lista de ese centro; si el evento llega con el mismo centro (por ejemplo, al arrancar la página), lo que está abierto se queda.
    let loadedCenter = null;
    document.addEventListener('sgn:cost-centers-changed', () => {
        if (app.remote || Dashboard.getSingleSelectedCostCenterId() === loadedCenter) return;
        zone = ''; q = '';
        if (openedId) {
            openedId = null;
            Dashboard.setBreadcrumbSuffix('');
            try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* sin historial */ }
        }
        load();
    });

    const page = () => document.querySelector('.page-content');
    function message(icon, text, title) {
        page().innerHTML = `<div class="empty-state" data-help-key="${app.help}"><i class="bx ${icon}" aria-hidden="true"></i>${title ? `<h3>${esc(title)}</h3>` : ''}<p>${esc(text)}</p></div>`;
    }
    async function load() {
        const centerId = Dashboard.getSingleSelectedCostCenterId();
        loadedCenter = centerId;
        if (!app.remote && !centerId) { message('bx-buildings', t('main.layoutElegirCentroTexto'), t('main.layoutElegirCentroTitulo')); return; }
        try {
            const res = await fetch(app.remote ? `${app.api}?q=${encodeURIComponent(q)}` : `${app.api}?costCenterId=${centerId}`, { credentials: 'include' });
            if (res.status === 404) { message('bx-map-alt', t('main.qrsSinLayout')); return; }
            if (res.status === 403) { message('bx-lock-alt', t('main.qrsSinPermiso')); return; }
            if (!res.ok) throw new Error('load failed');
            data = await res.json();
            render();
        } catch (err) {
            console.error('QR\'s: failed to load', err);
            message('bx-error-circle', Dashboard.t('admin.saveError'));
        }
    }

    // Búsqueda en el servidor (ficha): se vuelve a pedir la lista al escribir, sin volver a dibujar la caja (no se pierde el cursor).
    async function refetch() {
        try {
            const res = await fetch(`${app.api}?q=${encodeURIComponent(q)}`, { credentials: 'include' });
            if (!res.ok) return;
            data = await res.json();
            renderList();
        } catch (err) {
            console.error('QR\'s: failed to search', err);
        }
    }
    function shown() {
        if (app.remote) return data.spaces;
        return data.spaces.filter((s) => (!zone || s.zoneId === zone)
            && (!q || SearchSyntax.matches('contains', q.toLowerCase(), app.haystack(s).toLowerCase())));
    }
    function render() {
        if (openedId) return; // una lectura que llega tarde (al arrancar la página llegan dos) no tapa la pantalla que ya está abierta
        const bar = app.simple ? '' : `<div class="qrs-bar">
                ${app.remote ? '' : `<select id="qrs-zone" aria-label="${esc(Dashboard.t('main.colLimZona'))}"><option value="">${esc(t('main.qrsTodasZonas'))}</option>${data.zones.map((z) => `<option value="${esc(z.id)}"${z.id === zone ? ' selected' : ''}>${esc(z.name)}</option>`).join('')}</select>`}
                <input type="search" id="qrs-q" autocomplete="off" placeholder="${esc(t(app.search))}" aria-label="${esc(t(app.search))}" value="${esc(q)}">
                <span class="qrs-count" id="qrs-count"></span>
            </div>`;
        page().innerHTML = `<div class="qrs" data-help-key="${app.help}">${bar}<div id="qrs-list"></div></div>`;
        if (!app.simple) {
            if (!app.remote) $('qrs-zone').addEventListener('change', (event) => { zone = event.target.value; renderList(); });
            $('qrs-q').addEventListener('input', (event) => {
                q = event.target.value.trim();
                if (app.remote) { clearTimeout(qTimer); qTimer = setTimeout(refetch, 250); } else renderList();
            });
        }
        $('qrs-list').addEventListener('click', (event) => {
            const btn = event.target.closest('[data-open]');
            if (btn) openApp(btn.dataset.open, true);
        });
        renderList();
        if (!hashHandled) { hashHandled = true; openFromHash(); } // la dirección trae #abrir=…: se abre directo (recargar la página o compartir el enlace)
    }
    function renderList() {
        const list = shown();
        if ($('qrs-count')) {
            const n = app.remote && Number.isFinite(data.total) ? data.total : list.length;
            $('qrs-count').textContent = app.remote && n > list.length ? t('main.qrsPrimeros', { m: list.length, n }) : t(app.count, { n });
        }
        if (!list.length) { $('qrs-list').innerHTML = `<div class="empty-state"><i class="bx bx-qr" aria-hidden="true"></i><p>${esc(t(app.empty || 'main.qrsVacio'))}</p></div>`; return; }
        const openBtn = (s) => `<button type="button" class="btn btn-secondary" data-open="${esc(s.key || s.id)}" data-help-key="qrsAbrir">${esc(t('main.qrsAbrir'))}</button>`;
        $('qrs-list').innerHTML = app.simple
            ? `<table class="qrs-table"><thead><tr><th>${esc(Dashboard.t(app.first))}</th><th></th></tr></thead><tbody>${list.map((s) => `<tr><td>${app.label(s)}</td><td>${openBtn(s)}</td></tr>`).join('')}</tbody></table>`
            : app.remote
                ? `<table class="qrs-table"><thead><tr><th>${esc(Dashboard.t(app.first))}</th><th>${esc(Dashboard.t('main.colArticuloUpc'))}</th><th></th></tr></thead><tbody>${list.map((s) => `<tr><td>${app.label(s)}</td><td>${esc(s.upc || '—')}</td><td>${openBtn(s)}</td></tr>`).join('')}</tbody></table>`
                : `<table class="qrs-table"><thead><tr><th>${esc(Dashboard.t(app.first))}</th><th>${esc(Dashboard.t('main.colLimZona'))}</th><th>${esc(Dashboard.t('main.colLimLocalizador'))}</th><th></th></tr></thead><tbody>${list.map((s) => `<tr><td>${app.label(s)}</td><td>${esc(s.zoneName || '—')}</td><td>${esc(s.locator || '—')}</td><td>${openBtn(s)}</td></tr>`).join('')}</tbody></table>`;
    }

    // La misma pantalla que abre el QR, como una pantalla normal de esta página: la ruta de arriba termina con el sitio abierto y «Volver a la lista» regresa a la lista (también el botón Atrás del navegador).
    function openApp(id, push) {
        const sp = data.spaces.find((x) => (x.key || x.id) === id);
        if (!sp) return;
        openedId = id;
        if (push) { try { history.pushState({ qrsOpen: id }, '', `#abrir=${encodeURIComponent(id)}`); } catch (e) { /* sin historial: igual se abre */ } }
        const title = t(app.windowTitle, { code: sp.code });
        page().innerHTML = `<div class="qrs-open" data-help-key="${app.help}">
            <div class="qrs-open-head"><button type="button" class="btn btn-secondary" id="qrs-back"><i class="bx bx-arrow-back" aria-hidden="true"></i> ${esc(t('main.qrsVolver'))}</button><span class="qrs-open-title">${esc(title)}</span></div>
            <iframe class="qrs-frame-page" id="qrs-frame" title="${esc(title)}" allow="camera"></iframe>
        </div>`;
        Dashboard.setBreadcrumbSuffix(sp.code);
        const frame = $('qrs-frame');
        // la página de adentro (otro documento) toma el tamaño de letra del sistema que tiene esta pantalla: las que miden en rem (Pedido Manual) crecen o se achican igual que el resto
        frame.addEventListener('load', () => { try { frame.contentDocument.documentElement.style.fontSize = getComputedStyle(document.documentElement).fontSize; } catch (e) { /* sin acceso: se queda con su tamaño */ } });
        $('qrs-back').addEventListener('click', () => { if (history.state && history.state.qrsOpen) history.back(); else backToList(); });
        frame.src = sp.path;
        fitFrame();
    }
    function backToList() {
        openedId = null;
        Dashboard.setBreadcrumbSuffix('');
        if (location.hash.indexOf('#abrir=') === 0) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* sin historial */ } }
        render(); // al salir de la pantalla se corta la cámara y lo que se estaba haciendo (el iframe desaparece)
    }
    // La pantalla de adentro ocupa lo que queda de la ventana desde donde empieza hasta abajo.
    function fitFrame() {
        const f = $('qrs-frame');
        if (!f) return;
        f.style.height = `${Math.max(360, Math.floor(window.innerHeight - f.getBoundingClientRect().top - 16))}px`;
    }
    window.addEventListener('resize', fitFrame);
    window.addEventListener('popstate', () => {
        const wanted = history.state && history.state.qrsOpen;
        if (openedId && !wanted) backToList();
        else if (!openedId && wanted) openApp(wanted, false);
    });
    function openFromHash() {
        const m = /^#abrir=(.+)$/.exec(location.hash);
        if (m) openApp(decodeURIComponent(m[1]), false);
    }
})();
