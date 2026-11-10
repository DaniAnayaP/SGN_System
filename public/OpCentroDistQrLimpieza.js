// ---------------------------------------------------------------------------
// Operaciones > QR's > Limpieza: la app de Limpieza que se hace escaneando el QR de cada activo, pero desde la computadora (para quien no tiene celular a la mano). Se elige el sitio arriba, se busca el activo y
// «Abrir» muestra, en una ventana sobre esta página, la MISMA pantalla que abre el QR (la dirección fija /l/<código del Layout>/<activo>): lo que se registra queda en Operaciones > Limpieza igual que desde el celular.
// La foto la toma la cámara de la computadora (la pantalla pública exige cámara en vivo).
// Envuelto en una función: Dashboard.js ya declara globales como t.
// ---------------------------------------------------------------------------
(function () {
    const API = '/api/business/qr-apps/limpieza';
    const t = (key, params) => {
        let text = Dashboard.t(key);
        Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
        return text;
    };
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const $ = (id) => document.getElementById(id);
    const typeName = (type) => Dashboard.t(`main.layoutType_space_${type}`);
    let data = { zones: [], spaces: [] };
    let zone = '';
    let q = '';
    let winEl = null;

    (async function init() {
        try {
            const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-centro-dist-qr-limpieza' });
            if (!role) return;
            await load();
        } catch (err) {
            console.error('QR\'s > Limpieza failed to initialize:', err);
        }
    })();
    document.addEventListener('sgn:cost-centers-changed', () => { zone = ''; q = ''; load(); });

    const page = () => document.querySelector('.page-content');
    function message(icon, text, title) {
        page().innerHTML = `<div class="empty-state" data-help-key="qrsLimpieza"><i class="bx ${icon}" aria-hidden="true"></i>${title ? `<h3>${esc(title)}</h3>` : ''}<p>${esc(text)}</p></div>`;
    }
    async function load() {
        const centerId = Dashboard.getSingleSelectedCostCenterId();
        if (!centerId) { message('bx-buildings', t('main.layoutElegirCentroTexto'), t('main.layoutElegirCentroTitulo')); return; }
        try {
            const res = await fetch(`${API}?costCenterId=${centerId}`, { credentials: 'include' });
            if (res.status === 404) { message('bx-map-alt', t('main.qrsSinLayout')); return; }
            if (res.status === 403) { message('bx-lock-alt', t('main.qrsSinPermiso')); return; }
            if (!res.ok) throw new Error('load failed');
            data = await res.json();
            render();
        } catch (err) {
            console.error('QR\'s > Limpieza: failed to load', err);
            message('bx-error-circle', Dashboard.t('admin.saveError'));
        }
    }

    function shown() {
        return data.spaces.filter((s) => (!zone || s.zoneId === zone)
            && (!q || SearchSyntax.matches('contains', q.toLowerCase(), `${s.code} ${typeName(s.type)} ${s.zoneName} ${s.locator}`.toLowerCase())));
    }
    function render() {
        page().innerHTML = `<div class="qrs" data-help-key="qrsLimpieza">
            <div class="qrs-bar">
                <select id="qrs-zone" aria-label="${esc(Dashboard.t('main.colLimZona'))}"><option value="">${esc(t('main.qrsTodasZonas'))}</option>${data.zones.map((z) => `<option value="${esc(z.id)}"${z.id === zone ? ' selected' : ''}>${esc(z.name)}</option>`).join('')}</select>
                <input type="search" id="qrs-q" autocomplete="off" placeholder="${esc(t('main.qrsBuscar'))}" aria-label="${esc(t('main.qrsBuscar'))}" value="${esc(q)}">
                <span class="qrs-count" id="qrs-count"></span>
            </div>
            <div id="qrs-list"></div>
        </div>`;
        $('qrs-zone').addEventListener('change', (event) => { zone = event.target.value; renderList(); });
        $('qrs-q').addEventListener('input', (event) => { q = event.target.value.trim(); renderList(); });
        $('qrs-list').addEventListener('click', (event) => {
            const btn = event.target.closest('[data-open]');
            if (btn) openWindow(btn.dataset.open);
        });
        renderList();
    }
    function renderList() {
        const list = shown();
        $('qrs-count').textContent = t('main.qrsCuantos', { n: list.length });
        if (!list.length) { $('qrs-list').innerHTML = `<div class="empty-state"><i class="bx bx-qr" aria-hidden="true"></i><p>${esc(t('main.qrsVacio'))}</p></div>`; return; }
        $('qrs-list').innerHTML = `<table class="qrs-table"><thead><tr><th>${esc(Dashboard.t('main.colLimActivo'))}</th><th>${esc(Dashboard.t('main.colLimZona'))}</th><th>${esc(Dashboard.t('main.colLimLocalizador'))}</th><th></th></tr></thead><tbody>${list.map((s) => `<tr><td><b>${esc(s.code)}</b> · ${esc(typeName(s.type))}</td><td>${esc(s.zoneName || '—')}</td><td>${esc(s.locator || '—')}</td><td><button type="button" class="btn btn-secondary" data-open="${esc(s.id)}" data-help-key="qrsAbrir">${esc(t('main.qrsAbrir'))}</button></td></tr>`).join('')}</tbody></table>`;
    }

    // La misma pantalla que abre el QR, en una ventana sobre esta página (sin salir de aquí).
    function openWindow(spaceId) {
        const s = data.spaces.find((x) => x.id === spaceId);
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
        $('qrs-win-title').textContent = t('main.qrsVentana', { code: s.code });
        $('qrs-win-close').textContent = t('main.qrsCerrar');
        $('qrs-frame').title = t('main.qrsVentana', { code: s.code });
        $('qrs-frame').src = s.path;
        winEl.hidden = false;
    }
    function closeWindow() {
        if (!winEl) return;
        winEl.hidden = true;
        $('qrs-frame').src = 'about:blank'; // se corta la cámara y lo que se estaba haciendo
    }
})();
