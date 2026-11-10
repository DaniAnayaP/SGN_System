// ---------------------------------------------------------------------------
// Operaciones > QR's: cada app que se hace escaneando un QR, pero desde la computadora (para quien no tiene celular a la mano). Se elige el sitio arriba, se busca lo que tiene QR (un activo, un refrigerador, un sensor…) y
// «Abrir» muestra, en una ventana sobre esta página, la MISMA pantalla que abre el QR (su dirección fija): lo que se registra queda en la base de Operaciones de esa app igual que desde el celular. La foto la toma la
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
    };
    const app = APPS[document.body.dataset.qrApp];
    if (!app) return;
    let data = { zones: [], spaces: [] };
    let zone = '';
    let q = '';
    let winEl = null;

    (async function init() {
        try {
            const role = await Dashboard.initDashboard({ activePage: app.page });
            if (!role) return;
            await load();
        } catch (err) {
            console.error('QR\'s failed to initialize:', err);
        }
    })();
    document.addEventListener('sgn:cost-centers-changed', () => { zone = ''; q = ''; load(); });

    const page = () => document.querySelector('.page-content');
    function message(icon, text, title) {
        page().innerHTML = `<div class="empty-state" data-help-key="${app.help}"><i class="bx ${icon}" aria-hidden="true"></i>${title ? `<h3>${esc(title)}</h3>` : ''}<p>${esc(text)}</p></div>`;
    }
    async function load() {
        const centerId = Dashboard.getSingleSelectedCostCenterId();
        if (!centerId) { message('bx-buildings', t('main.layoutElegirCentroTexto'), t('main.layoutElegirCentroTitulo')); return; }
        try {
            const res = await fetch(`${app.api}?costCenterId=${centerId}`, { credentials: 'include' });
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

    function shown() {
        return data.spaces.filter((s) => (!zone || s.zoneId === zone)
            && (!q || SearchSyntax.matches('contains', q.toLowerCase(), app.haystack(s).toLowerCase())));
    }
    function render() {
        const bar = app.simple ? '' : `<div class="qrs-bar">
                <select id="qrs-zone" aria-label="${esc(Dashboard.t('main.colLimZona'))}"><option value="">${esc(t('main.qrsTodasZonas'))}</option>${data.zones.map((z) => `<option value="${esc(z.id)}"${z.id === zone ? ' selected' : ''}>${esc(z.name)}</option>`).join('')}</select>
                <input type="search" id="qrs-q" autocomplete="off" placeholder="${esc(t(app.search))}" aria-label="${esc(t(app.search))}" value="${esc(q)}">
                <span class="qrs-count" id="qrs-count"></span>
            </div>`;
        page().innerHTML = `<div class="qrs" data-help-key="${app.help}">${bar}<div id="qrs-list"></div></div>`;
        if (!app.simple) {
            $('qrs-zone').addEventListener('change', (event) => { zone = event.target.value; renderList(); });
            $('qrs-q').addEventListener('input', (event) => { q = event.target.value.trim(); renderList(); });
        }
        $('qrs-list').addEventListener('click', (event) => {
            const btn = event.target.closest('[data-open]');
            if (btn) openWindow(btn.dataset.open);
        });
        renderList();
    }
    function renderList() {
        const list = shown();
        if ($('qrs-count')) $('qrs-count').textContent = t(app.count, { n: list.length });
        if (!list.length) { $('qrs-list').innerHTML = `<div class="empty-state"><i class="bx bx-qr" aria-hidden="true"></i><p>${esc(t(app.empty || 'main.qrsVacio'))}</p></div>`; return; }
        const openBtn = (s) => `<button type="button" class="btn btn-secondary" data-open="${esc(s.key || s.id)}" data-help-key="qrsAbrir">${esc(t('main.qrsAbrir'))}</button>`;
        $('qrs-list').innerHTML = app.simple
            ? `<table class="qrs-table"><thead><tr><th>${esc(Dashboard.t(app.first))}</th><th></th></tr></thead><tbody>${list.map((s) => `<tr><td>${app.label(s)}</td><td>${openBtn(s)}</td></tr>`).join('')}</tbody></table>`
            : `<table class="qrs-table"><thead><tr><th>${esc(Dashboard.t(app.first))}</th><th>${esc(Dashboard.t('main.colLimZona'))}</th><th>${esc(Dashboard.t('main.colLimLocalizador'))}</th><th></th></tr></thead><tbody>${list.map((s) => `<tr><td>${app.label(s)}</td><td>${esc(s.zoneName || '—')}</td><td>${esc(s.locator || '—')}</td><td>${openBtn(s)}</td></tr>`).join('')}</tbody></table>`;
    }

    // La misma pantalla que abre el QR, en una ventana sobre esta página (sin salir de aquí).
    function openWindow(id) {
        const s = data.spaces.find((x) => (x.key || x.id) === id);
        if (!s) return;
        if (!winEl) {
            winEl = document.createElement('div');
            winEl.className = 'modal-overlay';
            winEl.hidden = true;
            winEl.innerHTML = `<div class="modal-panel qrs-win" role="dialog" aria-modal="true" aria-labelledby="qrs-win-title">
                <div class="qrs-win-head"><span id="qrs-win-title"></span><button type="button" class="btn btn-secondary" id="qrs-win-close"></button></div>
                <iframe class="qrs-frame" id="qrs-frame" title="" allow="camera"></iframe>
            </div>`;
            document.body.appendChild(winEl);
            winEl.addEventListener('click', (event) => { if (event.target === winEl || event.target.closest('#qrs-win-close')) closeWindow(); });
            document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && winEl && !winEl.hidden) closeWindow(); });
        }
        $('qrs-win-title').textContent = t(app.windowTitle, { code: s.code });
        $('qrs-win-close').textContent = t('main.qrsCerrar');
        $('qrs-frame').title = t(app.windowTitle, { code: s.code });
        $('qrs-frame').src = s.path;
        winEl.hidden = false;
    }
    function closeWindow() {
        if (!winEl) return;
        winEl.hidden = true;
        $('qrs-frame').src = 'about:blank'; // se corta la cámara y lo que se estaba haciendo
    }
})();
