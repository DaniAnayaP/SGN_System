// ---------------------------------------------------------------------------
// Layout (App) — la misma pantalla de la Web (Operaciones > Layout) hecha para el celular y solo para VER la nave:
//   · el 3D del Layout de un centro de costos (vista general, planta y frente), con lo que se quiere ver encendido o apagado;
//   · «Recorrer»: caminar por dentro de la nave a la altura de los ojos, como el monito de Maps. Se arrastra al monito a un lugar de la nave (o se pulsa «Entrar»), se camina con los botones de la pantalla
//     (o las flechas / W A S D en una computadora), se voltea arrastrando y se toca lo que se ve para abrir su ficha. El minimapa dice dónde se está y, tocándolo, se pasa a otro lugar.
// Aquí no se edita nada (editar sigue siendo de la Web). Es el mismo 3D y los mismos choques que la Web (LayoutScene3D.js y LayoutCalc.js).
// ---------------------------------------------------------------------------

const SUPPORTED_LANGS = ['en', 'es'];
const DEFAULT_LANG = 'en';
let dict = {};

function t(key, params = {}) {
    const value = key.split('.').reduce((obj, part) => obj?.[part], dict);
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`);
}
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const currentLang = () => (SUPPORTED_LANGS.includes(localStorage.getItem('lang')) ? localStorage.getItem('lang') : DEFAULT_LANG);
const fmt = (n, digits = 2) => (Number.isFinite(n) ? n : 0).toLocaleString(currentLang() === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: digits });

async function loadLanguage() {
    const lang = currentLang();
    try {
        const res = await fetch(`i18n/${lang}.json`);
        if (res.ok) dict = await res.json();
    } catch {
        dict = {};
    }
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    const titleTag = document.querySelector('title[data-i18n]');
    if (titleTag) document.title = t(titleTag.dataset.i18n);
}

function showToast(message, duration = 4000) {
    const container = document.getElementById('home-toast-container');
    const toast = document.createElement('div');
    toast.className = 'home-toast';
    toast.setAttribute('role', 'status');
    const icon = document.createElement('span');
    icon.className = 'home-toast-icon';
    icon.innerHTML = '<i class="bx bx-info-circle" aria-hidden="true"></i>';
    const msgEl = document.createElement('p');
    msgEl.className = 'home-toast-message';
    msgEl.textContent = message;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'home-toast-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '<i class="bx bx-x" aria-hidden="true"></i>';
    const progress = document.createElement('div');
    progress.className = 'home-toast-progress';
    let dismissTimer = null;
    const close = () => {
        if (dismissTimer) clearTimeout(dismissTimer);
        toast.classList.remove('home-toast-visible');
        setTimeout(() => toast.remove(), 300);
    };
    closeBtn.addEventListener('click', close);
    toast.append(icon, msgEl, closeBtn, progress);
    container.appendChild(toast);
    void toast.offsetWidth;
    toast.classList.add('home-toast-visible');
    progress.style.transitionDuration = `${duration}ms`;
    progress.style.width = '0';
    dismissTimer = setTimeout(close, duration);
}

// --- Estilo (theme) — el mismo mecanismo de todas las páginas de la App. ----------------------------------------------------------------
let clientColorPalette = null;
let clientPrimaryColor = null;
const INSTITUTIONAL_THEME_PROPS = [
    '--home-bg', '--home-bg-grad-1', '--home-bg-grad-2', '--home-tabbar-bg',
    '--home-surface', '--home-surface-2', '--home-neutral-soft',
    '--home-border', '--home-divider',
    '--home-text-primary', '--home-text-secondary', '--home-text-tertiary', '--home-text-muted',
    '--home-accent', '--home-accent-strong-1', '--home-accent-strong-2', '--home-on-accent',
    '--home-header-grad-1', '--home-header-grad-2', '--home-on-header',
];
function applyInstitutionalTheme() {
    const palette = clientColorPalette
        || (clientPrimaryColor && window.ColorPalette ? window.ColorPalette.suggestPalette(clientPrimaryColor) : null);
    if (!palette) return;
    const root = document.body.style;
    root.setProperty('--home-bg', palette.bg || '#0e1e33');
    root.setProperty('--home-bg-grad-1', palette.bg || '#0e1e33');
    root.setProperty('--home-bg-grad-2', palette.bg || '#0e1e33');
    root.setProperty('--home-tabbar-bg', palette.bg || '#0e1e33');
    root.setProperty('--home-surface', palette.surface || '#16304d');
    root.setProperty('--home-surface-2', palette.surface || '#16304d');
    root.setProperty('--home-neutral-soft', palette.surface || '#16304d');
    root.setProperty('--home-border', palette.border || '#2a4d70');
    root.setProperty('--home-divider', palette.border || '#2a4d70');
    root.setProperty('--home-text-primary', palette.textPrimary || '#ffffff');
    root.setProperty('--home-text-secondary', palette.textSecondary || '#c9d9e8');
    root.setProperty('--home-text-tertiary', palette.textSecondary || '#c9d9e8');
    root.setProperty('--home-text-muted', palette.textSecondary || '#c9d9e8');
    root.setProperty('--home-accent', palette.accent || '#7fd1ff');
    root.setProperty('--home-accent-strong-1', palette.accent || '#2f6fae');
    root.setProperty('--home-accent-strong-2', palette.accent || '#2f6fae');
    root.setProperty('--home-on-accent', palette.accentText || '#ffffff');
    root.setProperty('--home-header-grad-1', palette.tooltipBg || '#1c3a5e');
    root.setProperty('--home-header-grad-2', palette.tooltipBg || '#1c3a5e');
    root.setProperty('--home-on-header', palette.tooltipText || '#ffffff');
}
function getStoredStyle() {
    const stored = localStorage.getItem('style');
    return ['light', 'dark', 'institutional', 'futuristic'].includes(stored) ? stored : 'light';
}
function applyStyle(style) {
    document.body.classList.remove('institutional-mode', 'dark-mode', 'futuristic-mode');
    INSTITUTIONAL_THEME_PROPS.forEach((prop) => document.body.style.removeProperty(prop));
    if (style === 'institutional') { document.body.classList.add('institutional-mode'); applyInstitutionalTheme(); }
    else if (style === 'dark') document.body.classList.add('dark-mode');
    else if (style === 'futuristic') document.body.classList.add('futuristic-mode');
}
async function loadBrandingForTheme() {
    try {
        const res = await fetch(apiUrl('/api/business/branding'), { credentials: 'include' });
        if (!res.ok) return;
        const { branding } = await res.json();
        clientColorPalette = branding.colorPalette || null;
        clientPrimaryColor = branding.primaryColor || null;
        if (getStoredStyle() === 'institutional') applyInstitutionalTheme();
    } catch {
        // Se queda con el estilo fijo de cada tema.
    }
}

// --- Estado ----------------------------------------------------------------------------------------------------------------------------
const LC = window.LayoutCalc;
const CENTER_KEY = 'appLayoutCenter';
let currentUser = null;
let isClientAdmin = false;
let effectiveGrants = [];
let costCenters = [];
let centerId = null;
let payload = null;           // lo que trae GET /api/business/layout del centro elegido
let scene = null;
let sceneReady = false;
const bodyEl = document.getElementById('carga-body');

function isUnrestrictedClientAdmin() { return isClientAdmin && effectiveGrants.length === 0; }
function hasCostCenterPermission(ccId) {
    if (isUnrestrictedClientAdmin()) return true;
    return effectiveGrants.some((g) => g.sectionId === 'main' && g.itemId === 'cc-list' && g.submenuId === `cc-${ccId}`);
}
async function loadCostCenters() {
    try {
        const res = await fetch(apiUrl('/api/business/cost-centers'), { credentials: 'include' });
        if (!res.ok) return;
        const body = await res.json();
        costCenters = (body.costCenters || []).filter((cc) => hasCostCenterPermission(cc.id));
    } catch {
        costCenters = [];
    }
}
const todayIso = () => { const n = new Date(); const p = (v) => String(v).padStart(2, '0'); return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`; };
const typeLabel = (group, id) => t(`main.layoutType_${group}_${id}`);

// --- Capas: lo que se quiere ver (cada grupo enciende varias capas del 3D) -----------------------------------------------------------------
const LAYER_GROUPS = { walls: ['walls'], doors: ['doors'], columns: ['columns'], assets: ['assets', 'footprints'], safety: ['safety'], ceiling: ['ceiling', 'roofs'], zones: ['zones'], flow: ['transit', 'objects'] };
const layerChoice = { walls: true, doors: true, columns: true, assets: true, safety: true, ceiling: true, zones: true, flow: true };
function sceneLayers() {
    const out = { contour: true, power: true, sensors: true };
    Object.entries(LAYER_GROUPS).forEach(([k, names]) => names.forEach((n) => { out[n] = !!layerChoice[k]; }));
    return out;
}

// --- La pantalla ---------------------------------------------------------------------------------------------------------------------
const PEG = '<svg viewBox="0 0 46 58" aria-hidden="true"><circle cx="23" cy="10" r="8" fill="var(--home-accent)"/><path d="M12 24c0-4 5-6 11-6s11 2 11 6v13h-5v17h-6V42v12h-6V37h-5z" fill="var(--home-accent)" stroke="var(--home-text-primary)" stroke-width="1.6" stroke-linejoin="round"/><circle cx="23" cy="10" r="8" fill="none" stroke="var(--home-text-primary)" stroke-width="1.6"/></svg>';
function buildShell() {
    const layerChips = Object.keys(LAYER_GROUPS).map((k) => `<button type="button" class="lyw-pill" data-layer="${k}" aria-pressed="true">${esc(t(`home.lywCapa_${k}`))}</button>`).join('');
    bodyEl.innerHTML = `<div class="lyw">
        <label class="lyw-center" id="lyw-center-box" hidden><span>${esc(t('home.lywCentro'))}</span><select id="lyw-center"></select></label>
        <p class="lyw-msg" id="lyw-msg" hidden></p>
        <div class="lyw-stage" id="lyw-stage" hidden>
            <div class="lyw-over" id="lyw-over" hidden>
                <div class="lyw-tl" id="lyw-tl" hidden>
                    <span class="lyw-chip">${esc(t('main.layoutWalkDentro'))}</span>
                    <span class="lyw-chip" id="lyw-pos"></span>
                    <label class="lyw-chip lyw-eye"><span>${esc(t('main.layoutWalkOjos'))}</span> <select id="lyw-eye"><option value="1.7">${esc(t('main.layoutWalkOjosPersona'))}</option><option value="2.4">${esc(t('main.layoutWalkOjosMontacargas'))}</option></select></label>
                </div>
                <div class="lyw-tr">
                    <button type="button" class="lyw-peg" id="lyw-peg" aria-label="${esc(t('main.layoutWalkMonito'))}">${PEG}</button>
                    <button type="button" class="home-carga-new-btn lyw-enter" id="lyw-enter">${esc(t('main.layoutWalkEntrar'))}</button>
                    <button type="button" class="home-carga-secondary-btn" id="lyw-exit">${esc(t('main.layoutWalkSalir'))}</button>
                </div>
                <div class="lyw-cross" id="lyw-cross" hidden></div>
                <div class="lyw-mini" id="lyw-mini-box" hidden><canvas id="lyw-mini" width="340" height="232" aria-label="${esc(t('main.layoutWalkMini'))}"></canvas></div>
                <div class="lyw-pad" id="lyw-pad" hidden role="group" aria-label="${esc(t('main.layoutWalkBotones'))}">
                    <button type="button" data-wk="turnL" aria-label="${esc(t('main.layoutWalkGiraIzq'))}">↶</button>
                    <button type="button" data-wk="fwd" aria-label="${esc(t('main.layoutWalkAvanza'))}">▲</button>
                    <button type="button" data-wk="turnR" aria-label="${esc(t('main.layoutWalkGiraDer'))}">↷</button>
                    <button type="button" data-wk="strL" aria-label="${esc(t('main.layoutWalkPasoIzq'))}">◀</button>
                    <button type="button" data-wk="back" aria-label="${esc(t('main.layoutWalkRetrocede'))}">▼</button>
                    <button type="button" data-wk="strR" aria-label="${esc(t('main.layoutWalkPasoDer'))}">▶</button>
                </div>
            </div>
            <div class="lyw-card" id="lyw-card" hidden></div>
        </div>
        <p class="lyw-tip" id="lyw-tip" hidden>${esc(t('main.layoutWalkPonerTxt'))}</p>
        <div class="lyw-row" id="lyw-views" hidden>
            <button type="button" class="lyw-pill" data-view="general" aria-pressed="true">${esc(t('main.layout3dGeneral'))}</button>
            <button type="button" class="lyw-pill" data-view="planta" aria-pressed="false">${esc(t('main.layout3dPlanta'))}</button>
            <button type="button" class="lyw-pill" data-view="frente" aria-pressed="false">${esc(t('main.layout3dFrente'))}</button>
            <button type="button" class="lyw-pill lyw-pill-walk" id="lyw-walk-btn" aria-pressed="false" data-help-key="layoutRecorrer">${esc(t('main.layoutRecorrer'))}</button>
        </div>
        <div class="lyw-row-block" id="lyw-layers-box" hidden>
            <div class="lyw-cap">${esc(t('home.lywQueVer'))}</div>
            <div class="lyw-row" id="lyw-layers">${layerChips}</div>
        </div>
    </div>`;
    bindShell();
}
const $ = (id) => document.getElementById(id);
function showMsg(text) {
    const m = $('lyw-msg');
    m.textContent = text;
    m.hidden = !text;
    $('lyw-stage').hidden = !!text;
    $('lyw-views').hidden = !!text;
    $('lyw-layers-box').hidden = !!text;
}
function fillCenters() {
    const sel = $('lyw-center');
    sel.innerHTML = costCenters.map((cc) => `<option value="${cc.id}"${Number(cc.id) === Number(centerId) ? ' selected' : ''}>${esc([cc.code, cc.name].filter(Boolean).join(' · '))}</option>`).join('');
    $('lyw-center-box').hidden = costCenters.length < 2;
}
async function loadLayout() {
    walkExit();
    showMsg(t('home.lywCargando'));
    payload = null;
    try {
        const res = await fetch(apiUrl(`/api/business/layout?costCenterId=${encodeURIComponent(centerId)}`), { credentials: 'include' });
        if (!res.ok) throw new Error('layout');
        payload = await res.json();
    } catch {
        showMsg(t('home.lywSinSenal'));
        return;
    }
    if (!(payload.permissions && payload.permissions.canView3D)) { showMsg(t('home.lywSin3D')); return; }
    if (!payload.layout || !Array.isArray(payload.layout.vertices) || payload.layout.vertices.length < 3) { showMsg(t('home.lywSinLayout')); return; }
    showMsg('');
    drawScene();
}
function ensureScene() {
    if (scene) return scene;
    scene = window.LayoutScene3D.create($('lyw-stage'), {
        labels: true,
        itemPickTypes: () => [],
        onSelect: (sel) => showCard(sel),
        onWalkFrame: (p) => onWalkFrame(p),
        onWalkPick: (sel) => showCard(sel),
        onWalkExit: () => walkExit(),
    });
    return scene;
}
function drawScene() {
    const L = payload.layout;
    ensureScene().update({ ...L, safetyLast: payload.safetyLast || {} }, {
        labels: true, layers: sceneLayers(), openings: true, levels: true, roof: false, floorsShow: true, rampsShow: true, neutralZones: false,
        fronts: Object.fromEntries((L.spaces || []).map((s) => [s.id, (LC.activoFront(L, s) || {}).side])),
    });
    scene.setView('general');
    sceneReady = true;
    setViewPill('general');
}
function setViewPill(name) {
    document.querySelectorAll('#lyw-views [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
}
function bindShell() {
    $('lyw-center').addEventListener('change', (event) => { centerId = Number(event.target.value); try { localStorage.setItem(CENTER_KEY, String(centerId)); } catch { /* sin almacenamiento */ } loadLayout(); });
    document.querySelectorAll('#lyw-views [data-view]').forEach((b) => b.addEventListener('click', () => { if (!scene || walkUi.phase === 'walk') return; if (walkUi.phase === 'place') { walkExit(); } scene.setView(b.dataset.view); setViewPill(b.dataset.view); }));
    document.querySelectorAll('#lyw-layers [data-layer]').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.layer;
        layerChoice[k] = !layerChoice[k];
        b.setAttribute('aria-pressed', String(layerChoice[k]));
        if (scene && sceneReady) LAYER_GROUPS[k].forEach((n) => scene.setLayer(n, layerChoice[k]));
    }));
    $('lyw-walk-btn').addEventListener('click', walkBegin);
    $('lyw-exit').addEventListener('click', walkExit);
    $('lyw-enter').addEventListener('click', () => {
        const spot = walkUi.x !== null ? { x: walkUi.x, y: walkUi.y } : walkCenter();
        walkEnter(spot.x, spot.y, walkHeadingFrom(spot.x, spot.y));
    });
    $('lyw-eye').addEventListener('change', (event) => { walkUi.eye = parseFloat(event.target.value) || 1.7; if (scene) scene.walkSetEye(walkUi.eye); });
    document.querySelectorAll('#lyw-pad [data-wk]').forEach((b) => {
        const k = b.getAttribute('data-wk');
        b.addEventListener('pointerdown', (event) => { event.preventDefault(); if (scene) scene.walkKeys(k, true); try { b.setPointerCapture(event.pointerId); } catch { /* sin captura: se suelta igual al levantar */ } });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, () => { if (scene) scene.walkKeys(k, false); }));
    });
    $('lyw-mini').addEventListener('pointerdown', (event) => {
        const m = walkUi.mini;
        if (!m || !scene) return;
        const r = $('lyw-mini').getBoundingClientRect();
        scene.walkTo(m.x0 + (((event.clientX - r.left) / r.width) * m.W - m.ox) / m.sc, m.y0 + (((event.clientY - r.top) / r.height) * m.H - m.oy) / m.sc);
    });
    // arrastrar al monito (con el dedo): se suelta sobre la nave (en la vista de planta) y se entra ahí, de frente al centro
    $('lyw-peg').addEventListener('pointerdown', (event) => {
        if (walkUi.phase !== 'place' || !scene) return;
        event.preventDefault();
        const ghost = document.createElement('div');
        ghost.className = 'lyw-ghost';
        ghost.innerHTML = $('lyw-peg').innerHTML;
        document.body.appendChild(ghost);
        const move = (e) => { ghost.style.left = `${e.clientX}px`; ghost.style.top = `${e.clientY}px`; };
        const up = (e) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            ghost.remove();
            const r = scene.canvas.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
            const p = scene.walkPoint(e.clientX, e.clientY);
            if (p) walkEnter(p.x, p.y, walkHeadingFrom(p.x, p.y));
        };
        move(event);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    });
}

// --- Recorrer: caminar por dentro de la nave ----------------------------------------------------------------------------------------
const walkUi = { phase: 'off', eye: 1.7, x: null, y: null, mini: null, posText: '' };
function walkRefreshUi() {
    const place = walkUi.phase === 'place';
    const on = walkUi.phase === 'walk';
    $('lyw-over').hidden = walkUi.phase === 'off';
    $('lyw-peg').hidden = !place; // el monito y «Entrar» van arriba a la derecha, junto a «Salir»
    $('lyw-enter').hidden = !place;
    $('lyw-tip').hidden = !place;
    $('lyw-tl').hidden = !on;
    $('lyw-cross').hidden = !on;
    $('lyw-mini-box').hidden = !on;
    $('lyw-pad').hidden = !on;
    $('lyw-card').hidden = true;
    $('lyw-walk-btn').setAttribute('aria-pressed', String(walkUi.phase !== 'off'));
}
function walkCenter() {
    const v = (payload && payload.layout && payload.layout.vertices) || [];
    if (!v.length) return { x: 0, y: 0 };
    return { x: v.reduce((a, p) => a + p[0], 0) / v.length, y: v.reduce((a, p) => a + p[1], 0) / v.length };
}
function walkHeadingFrom(x, y) {
    const c = walkCenter();
    const dx = c.x - x; const dy = c.y - y;
    return Math.hypot(dx, dy) < 1 ? 0 : Math.atan2(-dx, -dy);
}
function walkBegin() {
    if (!scene || !sceneReady) return;
    if (walkUi.phase !== 'off') { walkExit(); return; } // pulsarlo otra vez sale
    walkUi.phase = 'place';
    scene.setView('planta');
    setViewPill('planta');
    walkRefreshUi();
}
function walkEnter(x, y, rot) {
    if (!scene || !payload) return;
    if (!scene.walkStart({ x, y, rot, eye: walkUi.eye })) return;
    walkUi.phase = 'walk';
    setViewPill(''); // caminando no hay vista general, planta ni frente
    walkRefreshUi();
}
function walkExit() {
    if (walkUi.phase === 'off') return;
    if (scene) scene.walkStop();
    walkUi.phase = 'off';
    walkRefreshUi();
    if (scene) { scene.setView('general'); setViewPill('general'); }
}
function drawWalkMini(p) {
    const cv = $('lyw-mini');
    const d = payload && payload.layout;
    if (!cv || !d || !Array.isArray(d.vertices) || d.vertices.length < 3) return;
    const g = cv.getContext('2d');
    const W = cv.width; const H = cv.height; const M = 10;
    const xs = d.vertices.map((v) => v[0]); const ys = d.vertices.map((v) => v[1]);
    const x0 = Math.min(...xs); const y0 = Math.min(...ys);
    const sc = Math.min((W - 2 * M) / Math.max(Math.max(...xs) - x0, 1), (H - 2 * M) / Math.max(Math.max(...ys) - y0, 1));
    const ox = (W - sc * (Math.max(...xs) - x0)) / 2; const oy = (H - sc * (Math.max(...ys) - y0)) / 2;
    walkUi.mini = { x0, y0, sc, ox, oy, W, H };
    const X = (x) => ox + (x - x0) * sc; const Y = (y) => oy + (y - y0) * sc;
    const css = getComputedStyle(document.body);
    const ink = (css.getPropertyValue('--home-text-primary') || '#222').trim() || '#222';
    const accent = (css.getPropertyValue('--home-accent') || '#c04fc9').trim() || '#c04fc9';
    g.clearRect(0, 0, W, H);
    const poly = (pts, fill, stroke, lw) => { g.beginPath(); pts.forEach((q, i) => { if (i) g.lineTo(X(q[0]), Y(q[1])); else g.moveTo(X(q[0]), Y(q[1])); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 2; g.stroke(); } };
    poly(d.vertices, 'rgba(160,110,175,.16)', ink, 3);
    LC.obstacleShapes(d).forEach(({ o, g: sh }) => { if (o.kind === 'wall' ? layerChoice.walls : (layerChoice.columns && o.kind !== 'step')) poly(sh.pts, o.kind === 'wall' ? ink : '#7b8196'); });
    if (layerChoice.assets) (d.spaces || []).filter((s) => s.active !== false).forEach((s) => poly([[s.x, s.y], [s.x + s.l, s.y], [s.x + s.l, s.y + s.d], [s.x, s.y + s.d]], '#d99a43'));
    if (layerChoice.doors) (d.doors || []).forEach((dr) => { const dg = LC.doorGeometry(d, dr); if (!dg) return; g.beginPath(); g.moveTo(X(dg.a.x), Y(dg.a.y)); g.lineTo(X(dg.b.x), Y(dg.b.y)); g.strokeStyle = '#1e7e34'; g.lineWidth = 5; g.stroke(); });
    const ax = -Math.sin(p.rot); const ay = -Math.cos(p.rot); const ang = Math.atan2(ay, ax); const px = X(p.x); const py = Y(p.y);
    g.fillStyle = 'rgba(207,95,211,.45)'; g.beginPath(); g.moveTo(px, py); g.arc(px, py, 46, ang - 0.65, ang + 0.65); g.closePath(); g.fill();
    g.fillStyle = accent; g.strokeStyle = ink; g.lineWidth = 2.5; g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.fill(); g.stroke();
}
function onWalkFrame(p) {
    walkUi.x = p.x; walkUi.y = p.y;
    const lvl = Math.round((Number(p.level) || 0) * 100) / 100;
    const text = t('main.layoutWalkPos', { x: fmt(p.x, 1), y: fmt(p.y, 1), eye: fmt(p.eye, 2) }) + (Math.abs(lvl) >= 0.01 ? ` · ${t('main.layoutWalkPiso', { n: `${lvl > 0 ? '+' : ''}${fmt(lvl)}` })}` : '');
    if (text !== walkUi.posText) { walkUi.posText = text; $('lyw-pos').textContent = text; }
    drawWalkMini(p);
}

// --- La ficha de lo que se toca ----------------------------------------------------------------------------------------------------
function safetyStatusText(st) {
    if (st.state === 'fail') return t('main.layoutSgFail');
    if (st.state === 'none') return t('main.layoutSgNone');
    if (st.state === 'ok') return t('main.layoutSgOk');
    if (st.state === 'soon') return st.days === 0 ? t('main.layoutSgSoonHoy') : t(st.days === 1 ? 'main.layoutSgSoonUno' : 'main.layoutSgSoonN', { n: st.days });
    return t(st.days === -1 ? 'main.layoutSgLateUno' : 'main.layoutSgLateN', { n: Math.abs(st.days) });
}
function cardInfo(sel) {
    const d = payload && payload.layout;
    if (!d || !sel) return null;
    const zoneName = (id) => (d.zones.find((z) => z.id === id) || {}).name || '';
    const dims = (...v) => { const l = v.filter((n) => Number(n) > 0); return l.length ? `${l.map((n) => fmt(n)).join(' × ')} m` : ''; };
    const find = (list) => (list || []).find((x) => x.id === sel.id);
    if (sel.kind === 'space') {
        const s = sel.space;
        return { title: typeLabel('space', s.type), code: s.code, lines: [zoneName(s.zoneId), dims(s.l, s.d, s.h), (s.levels || 1) === 1 ? t('main.layout3dNivel1') : t('main.layout3dNivelesN', { n: s.levels })] };
    }
    if (sel.kind === 'footprint') { const p = sel.footprint; return { title: t('main.layoutFindHuella'), code: p.code, lines: [zoneName(p.zoneId), dims(p.l, p.d, p.h)] }; }
    if (sel.kind === 'zone') { const z = sel.zone; return { title: z.name, code: '', lines: [z.type ? typeLabel('zone', z.type) : t('main.layoutSinZona'), `${fmt(LC.zoneArea(z))} m²`] }; }
    if (sel.kind !== 'item') return null;
    if (sel.type === 'door') { const x = find(d.doors); return x && { title: x.name || typeLabel('door', x.type), code: x.code, lines: [typeLabel('door', x.type), dims(x.width, x.height), typeLabel('doorOpen', LC.doorOpenOf(x))] }; }
    if (sel.type === 'obstacle') { const x = find(d.obstacles); return x && { title: x.name || typeLabel('obstacle', x.kind), code: x.code, lines: [typeLabel('obstacle', x.kind), dims(x.l, x.w, x.h)] }; }
    if (sel.type === 'safety') {
        const x = find(d.safety); if (!x) return null;
        const st = LC.safetyStatus(x, todayIso(), d.safetyWarnDays, (payload.safetyLast || {})[x.id]);
        return { title: x.name || typeLabel('safety', x.type), code: x.code, lines: [typeLabel('safety', x.type), zoneName(x.zoneId), LC.isHungSafety(x) ? `${t('main.layoutCuelgaA')} ${fmt(LC.safetyHangOf(d, x))} m` : '', st.state !== 'none' ? safetyStatusText(st) : ''] };
    }
    if (sel.type === 'ceiling') { const x = find(d.ceiling); return x && { title: x.name || typeLabel('ceiling', x.type), code: x.code, lines: [typeLabel('ceiling', x.type), zoneName(x.zoneId), `${t('main.layoutCuelgaA')} ${fmt(LC.ceilingHangOf(d, x))} m`] }; }
    if (sel.type === 'transit') { const x = find(d.transit); return x && { title: x.name || typeLabel('transit', x.type), code: x.code, lines: [typeLabel('transit', x.type), zoneName(x.zoneId), dims(x.l, x.w)] }; }
    if (sel.type === 'object') { const x = find(d.objects); return x && { title: x.name || typeLabel('object', x.type), code: x.code, lines: [dims(x.l, x.w, x.h)] }; }
    if (sel.type === 'sensor') { const x = find(d.sensors); return x && { title: typeLabel('sensor', x.type), code: x.code, lines: [zoneName(x.zoneId)] }; }
    if (sel.type === 'power') { const x = find(d.power); return x && { title: typeLabel('power', x.type), code: x.code, lines: [] }; }
    if (sel.type === 'floor') { const x = LC.floorsAll(d).find((f) => f.id === sel.id); return x && { title: x.name || x.code, code: x.code, lines: [`${Number(x.lvl) > 0 ? '+' : ''}${fmt(Number(x.lvl) || 0)} m`, dims(x.l, x.w)] }; }
    if (sel.type === 'roof') { const x = find(d.roofs); return x && { title: x.name || typeLabel('roofShape', x.shape), code: x.code, lines: [typeLabel('roofShape', x.shape)] }; }
    return null;
}
function showCard(sel) {
    const box = $('lyw-card');
    const info = cardInfo(sel);
    if (!info) { box.hidden = true; return; }
    const lines = info.lines.filter(Boolean);
    box.innerHTML = `<button type="button" class="lyw-x" aria-label="${esc(t('main.layoutWalkCerrarFicha'))}">×</button><b>${esc(info.title || '')}</b>${info.code ? `<span class="lyw-code">${esc(info.code)}</span>` : ''}${lines.length ? `<p>${esc(lines.join(' · '))}</p>` : ''}`;
    box.hidden = false;
    box.querySelector('.lyw-x').addEventListener('click', () => { box.hidden = true; });
}

document.getElementById('carga-back').addEventListener('click', () => { window.location.href = 'AppInicio.html'; });

(async function init() {
    await loadLanguage();
    window.HelpMode?.init(t);
    try {
        const [meRes, businessProfileRes] = await Promise.all([
            fetch(apiUrl('/api/me'), { credentials: 'include' }),
            fetch(apiUrl('/api/me/business-profile'), { credentials: 'include' }),
        ]);
        if (!meRes.ok) { window.location.replace('Login.html'); return; }
        const { user } = await meRes.json();
        currentUser = user;
        isClientAdmin = !!user?.isClientAdmin;
        if (businessProfileRes.ok) {
            const { profile } = await businessProfileRes.json();
            effectiveGrants = profile?.effectiveGrants || [];
        }
        await Promise.all([loadCostCenters(), loadBrandingForTheme()]);
        applyStyle(getStoredStyle());
        buildShell();
        if (!window.THREE || !window.LayoutScene3D) { showMsg(t('home.lywSin3D')); return; }
        if (!costCenters.length) { showMsg(t('home.lywSinCentros')); return; }
        let saved = null;
        try { saved = Number(localStorage.getItem(CENTER_KEY)); } catch { /* sin almacenamiento */ }
        centerId = costCenters.some((cc) => Number(cc.id) === saved) ? saved : Number(costCenters[0].id);
        fillCenters();
        await loadLayout();
    } catch (err) {
        console.error('Layout (App) failed to load:', err);
        showToast(t('admin.loadError'));
    }
})();
