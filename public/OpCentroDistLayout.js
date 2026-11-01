// ---------------------------------------------------------------------------
// Layout de la nave (Operaciones, C. Distribución). UN solo Layout por cliente, que se va modificando.
// Sin Layout, la pantalla ofrece Cargar plano (sube la imagen del plano, se indica cuántos metros mide de ancho y se dibuja encima) o Crear desde cero
// (se capturan contorno, puertas, conexiones de luz, zonas y anaqueles/gabetas/tarimas). En los dos casos se llega al mismo editor: formularios a la
// izquierda, croquis a la derecha y, arriba, los KPIs en m² y m³ que se recalculan con cada cambio (cuentas en LayoutCalc.js, las mismas que valida el
// servidor). Los permisos los decide el servidor (GET /api/business/layout trae el nivel de cada sección y de cada botón, según el árbol de accesos).
// ---------------------------------------------------------------------------
// Envuelto en una función: este script comparte el ámbito global con Dashboard.js, que ya declara nombres como SECTION_LABEL_KEYS.
(function () {
const LC = window.LayoutCalc;
const SECTION_ORDER = ['contorno', 'puertas', 'luz', 'zonas', 'espacios'];
const SECTION_LABEL_KEYS = {
    contorno: 'main.layoutStepContorno', puertas: 'main.layoutStepPuertas', luz: 'main.layoutStepLuz', zonas: 'main.layoutStepZonas', espacios: 'main.layoutStepEspacios',
};
const state = {
    saved: null, draft: null, version: 0, perms: null, step: 'contorno', creating: false,
    planImage: '', planNew: false, planAspect: 1, pendingPlan: null, loaded: false,
};

const t = (key, params) => Dashboard.t(key, params);
const $ = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function fmt(n, digits = 2) {
    return (Number.isFinite(n) ? n : 0).toLocaleString(Dashboard.lang === 'es' ? 'es-MX' : 'en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
function uid(prefix) {
    return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

// ---- permisos ---------------------------------------------------------------------------------------------------------
function sectionLevel(section) { return state.perms ? state.perms.sections[section] : 'solo-ver'; }
// Igual que canEditField: "Modificar" siempre; "Ver y Operar" solo mientras esa sección no tenga datos ya guardados.
function canEdit(section) {
    const level = sectionLevel(section);
    if (level === 'editar') return true;
    if (level === 'ver-y-operar') return !state.saved || !LC.sectionHasData(state.saved, section);
    return false;
}
function isDirty() {
    if (!state.draft) return false;
    if (state.creating || state.planNew) return true;
    return JSON.stringify(state.draft) !== JSON.stringify(state.saved);
}

// ---- tipos (los identificadores son estables; los nombres salen de i18n) -------------------------------------------------
const typeLabel = (group, id) => t(`main.layoutType_${group}_${id}`);
const optionsHtml = (group, ids, selected) => ids.map((id) => `<option value="${id}"${id === selected ? ' selected' : ''}>${esc(typeLabel(group, id))}</option>`).join('');
const wallOptionsHtml = (selected) => (state.draft.vertices || []).map((_, i) => `<option value="${i + 1}"${Number(selected) === i + 1 ? ' selected' : ''}>${esc(t('main.layoutPared'))} ${i + 1}</option>`).join('');

// ---- KPIs --------------------------------------------------------------------------------------------------------------
function renderKpis() {
    const k = state.draft ? LC.computeKpis(state.draft) : null;
    const values = {
        layoutKpiTotal: k ? k.total : 0, layoutKpiOficinas: k ? k.offices : 0, layoutKpiPasillos: k ? k.aisles : 0,
        layoutKpiAndenes: k ? k.docks : 0, layoutKpiAlmacenamiento: k ? k.storage : 0, layoutKpiMuertos: k ? k.dead : 0,
        layoutKpiVolumen: k ? k.volume : 0, layoutKpiVolumenAlm: k ? k.storageVolume : 0,
    };
    document.querySelectorAll('#layout-kpis [data-kpi]').forEach((el) => {
        el.textContent = fmt(values[el.dataset.kpi]);
    });
    const pct = $('layout-kpi-dead-pct');
    if (pct) pct.textContent = k && k.total ? `${fmt((k.dead / k.total) * 100, 1)}%` : '';
    // Zonas encimadas entre sí o fuera de la nave: se suman de más en los KPIs por tipo; el espacio muerto las cuenta una sola vez.
    const warn = $('layout-kpi-warn');
    if (warn) {
        warn.hidden = !(k && k.overlap > 0.05);
        if (!warn.hidden) warn.textContent = t('main.layoutAvisoEncimadas').replace('{n}', fmt(k.overlap));
    }
}

// ---- formularios por sección ------------------------------------------------------------------------------------------
function cellNum(list, i, key, value, disabled, step = '0.1') {
    return `<td><input type="number" step="${step}" data-l="${list}" data-i="${i}" data-k="${key}" value="${value}"${disabled ? ' disabled' : ''}></td>`;
}
function cellText(list, i, key, value, disabled) {
    return `<td><input type="text" maxlength="${LC.LIMITS.text}" data-l="${list}" data-i="${i}" data-k="${key}" value="${esc(value)}"${disabled ? ' disabled' : ''}></td>`;
}
function cellSelect(list, i, key, optionsMarkup, disabled) {
    return `<td><select data-l="${list}" data-i="${i}" data-k="${key}"${disabled ? ' disabled' : ''}>${optionsMarkup}</select></td>`;
}
function table(headKeys, rows) {
    return `<div class="layout-scroll"><table class="layout-table"><thead><tr>${headKeys.map((k) => `<th>${k ? esc(t(k)) : ''}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
const removeCell = (list, i, disabled) => `<td><button type="button" class="layout-x" data-del="${list}:${i}" data-help-key="layoutRemoveRow" aria-label="${esc(t('main.layoutQuitar'))}"${disabled ? ' disabled' : ''}>✕</button></td>`;
const addButton = (list, labelKey, disabled) => `<button type="button" class="btn btn-secondary layout-add" data-add="${list}" data-help-key="layoutAddRow"${disabled ? ' disabled' : ''}>${esc(t(labelKey))}</button>`;
// Fila ya guardada de zonas o espacios: Desactivar/Reactivar (se conserva, deja de contar) y, con permiso, Eliminar.
function savedRowButtons(list, i, active, disabled) {
    const canDelete = state.perms && (list === 'zones' ? state.perms.canDeleteZones : state.perms.canDeleteSpaces);
    const toggle = `<button type="button" class="btn btn-secondary layout-toggle" data-toggle="${list}:${i}" data-help-key="layoutToggleRow"${disabled ? ' disabled' : ''}>${esc(t(active === false ? 'main.layoutReactivar' : 'main.layoutDesactivar'))}</button>`;
    const del = canDelete ? `<button type="button" class="btn btn-secondary layout-toggle layout-delete" data-delete="${list}:${i}" data-help-key="layoutDeleteRow"${disabled ? ' disabled' : ''}>${esc(t('main.layoutEliminar'))}</button>` : '';
    return `<td><div class="layout-rowbtns">${toggle}${del}</div></td>`;
}
const isSavedRow = (list, id) => !!(state.saved && (state.saved[list] || []).some((row) => row.id === id));

function stepHtml(step) {
    const d = state.draft;
    const dis = !canEdit(step);
    if (step === 'contorno') {
        const rows = d.vertices.map((p, i) => {
            const seg = LC.wallSegment(d.vertices, i + 1);
            return `<tr><td class="layout-calc">${esc(t('main.layoutEsquina'))} ${i + 1}</td>${cellNum('vertices', i, '0', p[0], dis)}${cellNum('vertices', i, '1', p[1], dis)}${cellNum('vertices', i, '2', p[2], dis)}<td class="layout-calc" data-wall-len="${i}">${esc(t('main.layoutPared'))} ${i + 1}: ${fmt(seg.length)} m</td>${d.vertices.length > 3 ? removeCell('vertices', i, dis) : '<td></td>'}</tr>`;
        });
        const obstacles = d.obstacles.map((o, i) => `<tr>${cellText('obstacles', i, 'name', o.name, dis)}${cellNum('obstacles', i, 'x', o.x, dis)}${cellNum('obstacles', i, 'y', o.y, dis)}${cellNum('obstacles', i, 'l', o.l, dis)}${cellNum('obstacles', i, 'w', o.w, dis)}${removeCell('obstacles', i, dis)}</tr>`);
        const heights = d.vertices.map((p) => p[2]);
        const sameHeight = heights.every((h) => h === heights[0]) ? heights[0] : '';
        return `<div class="layout-fl"><label>${esc(t('main.layoutAlturaTodas'))}<input type="number" step="0.1" min="0" data-l="allHeights" value="${sameHeight}" placeholder="—"${dis ? ' disabled' : ''}></label></div>
            ${table(['main.layoutEsquina', 'main.layoutX', 'main.layoutY', 'main.layoutAlturaEsquina', 'main.layoutPared', ''], rows)}${addButton('vertices', 'main.layoutAgregarEsquina', dis)}
            <h4 class="layout-sub">${esc(t('main.layoutColumnasTitulo'))}</h4>
            ${table(['main.layoutNombre', 'main.layoutX', 'main.layoutY', 'main.layoutLargo', 'main.layoutAncho', ''], obstacles)}${addButton('obstacles', 'main.layoutAgregarObstaculo', dis)}`;
    }
    if (step === 'puertas') {
        const rows = d.doors.map((x, i) => `<tr>${cellText('doors', i, 'name', x.name, dis)}${cellSelect('doors', i, 'type', optionsHtml('door', LC.DOOR_TYPES, x.type), dis)}${cellSelect('doors', i, 'wall', wallOptionsHtml(x.wall), dis)}${cellNum('doors', i, 'dist', x.dist, dis)}${cellNum('doors', i, 'width', x.width, dis)}${cellNum('doors', i, 'height', x.height, dis)}${removeCell('doors', i, dis)}</tr>`);
        return `${table(['main.layoutNombre', 'main.layoutTipo', 'main.layoutPared', 'main.layoutDistancia', 'main.layoutAncho', 'main.layoutAlto', ''], rows)}${addButton('doors', 'main.layoutAgregarPuerta', dis)}`;
    }
    if (step === 'luz') {
        const rows = d.power.map((x, i) => `<tr>${cellSelect('power', i, 'type', optionsHtml('power', LC.POWER_TYPES, x.type), dis)}${cellSelect('power', i, 'wall', wallOptionsHtml(x.wall), dis)}${cellNum('power', i, 'dist', x.dist, dis)}${cellNum('power', i, 'height', x.height, dis)}${removeCell('power', i, dis)}</tr>`);
        return `${table(['main.layoutTipo', 'main.layoutPared', 'main.layoutDistancia', 'main.layoutAlturaPiso', ''], rows)}${addButton('power', 'main.layoutAgregarConexion', dis)}`;
    }
    if (step === 'zonas') {
        const rows = d.zones.map((z, i) => {
            const saved = isSavedRow('zones', z.id);
            return `<tr class="${z.active === false ? 'layout-off' : ''}">${cellText('zones', i, 'name', z.name, dis)}${cellSelect('zones', i, 'type', optionsHtml('zone', LC.ZONE_TYPES, z.type), dis)}${cellNum('zones', i, 'x', z.x, dis)}${cellNum('zones', i, 'y', z.y, dis)}${cellNum('zones', i, 'l', z.l, dis)}${cellNum('zones', i, 'w', z.w, dis)}<td class="layout-calc" data-zone-area="${i}">${fmt(z.l * z.w)} m²</td>${saved ? savedRowButtons('zones', i, z.active, dis) : removeCell('zones', i, dis)}</tr>`;
        });
        return `${table(['main.layoutNombre', 'main.layoutTipo', 'main.layoutX', 'main.layoutY', 'main.layoutLargo', 'main.layoutAncho', 'main.layoutSuperficie', ''], rows)}${addButton('zones', 'main.layoutAgregarZona', dis)}`;
    }
    const zoneOptions = (selected) => `<option value="">—</option>${d.zones.map((z) => `<option value="${esc(z.id)}"${z.id === selected ? ' selected' : ''}>${esc(z.name)}</option>`).join('')}`;
    const rows = d.spaces.map((s, i) => {
        const saved = isSavedRow('spaces', s.id);
        return `<tr class="${s.active === false ? 'layout-off' : ''}">${cellSelect('spaces', i, 'type', optionsHtml('space', LC.SPACE_TYPES, s.type), dis)}${cellText('spaces', i, 'code', s.code, dis)}${cellSelect('spaces', i, 'zoneId', zoneOptions(s.zoneId), dis)}${cellNum('spaces', i, 'x', s.x, dis)}${cellNum('spaces', i, 'y', s.y, dis)}${cellNum('spaces', i, 'l', s.l, dis)}${cellNum('spaces', i, 'd', s.d, dis)}${cellNum('spaces', i, 'h', s.h, dis)}${cellNum('spaces', i, 'levels', s.levels, dis, '1')}${cellText('spaces', i, 'drawers', s.drawers, dis)}<td class="layout-calc" data-space-calc="${i}">${fmt(s.l * s.d)} m² · ${fmt(s.l * s.d * s.h)} m³</td>${saved ? savedRowButtons('spaces', i, s.active, dis) : removeCell('spaces', i, dis)}</tr>`;
    });
    return `${table(['main.layoutTipo', 'main.layoutCodigo', 'main.layoutZona', 'main.layoutX', 'main.layoutY', 'main.layoutLargo', 'main.layoutFondo', 'main.layoutAlto', 'main.layoutNiveles', 'main.layoutCajones', 'main.layoutHuellaVolumen', ''], rows)}${addButton('spaces', 'main.layoutAgregarEspacio', dis)}`;
}

function renderPanel() {
    const steps = SECTION_ORDER.map((s) => `<button type="button" role="tab" aria-selected="${s === state.step}" class="layout-step${s === state.step ? ' active' : ''}" data-step="${s}">${esc(t(SECTION_LABEL_KEYS[s]))}</button>`).join('');
    const level = sectionLevel(state.step);
    const locked = !canEdit(state.step);
    $('layout-panel').innerHTML = `<div class="layout-steps" role="tablist" data-help-key="layoutSteps">${steps}</div>
        <div class="layout-section" data-help-key="layoutSec_${state.step}">
            <div class="layout-section-head"><h3>${esc(t(SECTION_LABEL_KEYS[state.step]))}</h3>${locked ? `<span class="layout-lock" data-help-key="layoutLocked"><i class="bx bx-lock-alt" aria-hidden="true"></i> ${esc(t(level === 'solo-ver' ? 'main.layoutSoloVer' : 'main.layoutYaLlena'))}</span>` : ''}</div>
            ${stepHtml(state.step)}
        </div>`;
}

// ---- croquis -----------------------------------------------------------------------------------------------------------
const ZONE_CLASS = { dry: 'lz-dry', cold: 'lz-cold', chemical: 'lz-chem', finished: 'lz-fin', dock: 'lz-dock', office: 'lz-office', aisle: 'lz-aisle', aisle2: 'lz-aisle2' };
function renderSvg() {
    const d = state.draft;
    const W = 700;
    const H = 460;
    const M = 36;
    const xs = d.vertices.map((p) => p[0]);
    const ys = d.vertices.map((p) => p[1]);
    let x0 = Math.min(...xs); let x1 = Math.max(...xs); let y0 = Math.min(...ys); let y1 = Math.max(...ys);
    if (state.planImage && d.plan) {
        x0 = Math.min(x0, 0); y0 = Math.min(y0, 0); x1 = Math.max(x1, d.plan.widthM); y1 = Math.max(y1, d.plan.widthM * state.planAspect);
    }
    const spanX = Math.max(x1 - x0, 1);
    const spanY = Math.max(y1 - y0, 1);
    const sc = Math.min((W - 2 * M) / spanX, (H - 2 * M - 14) / spanY);
    const ox = M + ((W - 2 * M) - spanX * sc) / 2;
    const oy = M;
    const X = (x) => ox + (x - x0) * sc;
    const Y = (y) => oy + (y - y0) * sc;
    // Los pasillos van sombreados con rayas (principal: rayas; entre anaqueles: puntos).
    let s = '<defs><pattern id="lh-main" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="var(--color-surface)"/><line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-text-secondary)" stroke-width="2.4" opacity="0.4"/></pattern><pattern id="lh-between" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="var(--color-surface)"/><circle cx="3" cy="3" r="1.15" fill="var(--color-text-secondary)" opacity="0.5"/></pattern></defs>';
    if (state.planImage && d.plan) s += `<image href="${state.planImage}" x="${X(0)}" y="${Y(0)}" width="${d.plan.widthM * sc}" height="${d.plan.widthM * state.planAspect * sc}" opacity="0.55" preserveAspectRatio="none"/>`;
    // El nombre y los m² de cada zona se dibujan al final (encima de anaqueles y paredes) y en la esquina de la zona que no tape ningún espacio.
    let zoneLabels = '';
    d.zones.forEach((z) => {
        s += `<rect class="lz ${ZONE_CLASS[z.type] || 'lz-dock'}${z.active === false ? ' lz-off' : ''}" x="${X(z.x)}" y="${Y(z.y)}" width="${z.l * sc}" height="${z.w * sc}" rx="4"><title>${esc(z.name)} · ${esc(typeLabel('zone', z.type))}</title></rect>`;
        const spot = LC.zoneLabelSpot(z, d.spaces, sc);
        const tx = spot.right ? X(z.x + z.l) - 5 : X(z.x) + 5;
        const ty = spot.bottom ? Y(z.y + z.w) - (z.w * sc > 26 ? 17 : 5) : Y(z.y) + 12;
        const anchor = spot.right ? 'end' : 'start';
        zoneLabels += `<text class="lt" x="${tx}" y="${ty}" text-anchor="${anchor}">${esc(z.name)}</text>`;
        if (z.w * sc > 26) zoneLabels += `<text class="lt2" x="${tx}" y="${ty + 11}" text-anchor="${anchor}">${fmt(z.l * z.w)} m²</text>`;
    });
    s += `<polygon class="lw" points="${d.vertices.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}"/>`;
    d.obstacles.forEach((o) => { s += `<rect class="lo" x="${X(o.x)}" y="${Y(o.y)}" width="${Math.max(o.l * sc, 3)}" height="${Math.max(o.w * sc, 3)}"><title>${esc(o.name)}</title></rect>`; });
    d.spaces.forEach((sp) => {
        const w = Math.max(sp.l * sc, 4);
        const h = Math.max(sp.d * sc, 4);
        s += `<rect class="ls ls-${sp.type}${sp.active === false ? ' lz-off' : ''}" x="${X(sp.x)}" y="${Y(sp.y)}" width="${w}" height="${h}" rx="2"><title>${esc(sp.code)} · ${esc(typeLabel('space', sp.type))}</title></rect>`;
        if (w >= 26 && h >= 9) s += `<text class="lt3" x="${X(sp.x) + w / 2}" y="${Y(sp.y) + h / 2 + 3}" text-anchor="middle">${esc(sp.code)}</text>`;
    });
    s += zoneLabels;
    d.doors.forEach((door) => {
        const w = LC.wallSegment(d.vertices, door.wall);
        const a = { x: w.p[0] + w.ux * door.dist, y: w.p[1] + w.uy * door.dist };
        const b = { x: a.x + w.ux * door.width, y: a.y + w.uy * door.width };
        s += `<line class="ld" x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}"><title>${esc(door.name)}</title></line>`;
    });
    d.power.forEach((e) => {
        const w = LC.wallSegment(d.vertices, e.wall);
        const a = { x: w.p[0] + w.ux * e.dist, y: w.p[1] + w.uy * e.dist };
        s += `<circle class="le" cx="${X(a.x)}" cy="${Y(a.y)}" r="6"><title>${esc(typeLabel('power', e.type))}</title></circle><text class="lt" x="${X(a.x)}" y="${Y(a.y) + 3.5}" text-anchor="middle" style="fill:var(--color-report-calc-text)" pointer-events="none">⚡</text>`;
    });
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    for (let i = 1; i <= d.vertices.length; i++) {
        const w = LC.wallSegment(d.vertices, i);
        const mx = (w.p[0] + w.q[0]) / 2;
        const my = (w.p[1] + w.q[1]) / 2;
        const nx = w.uy;
        const ny = -w.ux;
        const out = ((mx - cx) * nx + (my - cy) * ny) >= 0 ? 1 : -1;
        s += `<text class="lt2" text-anchor="middle" x="${X(mx) + nx * out * 15}" y="${Y(my) + ny * out * 15 + 3}">P${i} · ${fmt(w.length)} m</text>`;
    }
    d.vertices.forEach((p, i) => { s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.5" class="lv"/><text class="lt2" x="${X(p[0]) + (p[0] <= cx ? -8 : 8)}" y="${Y(p[1]) + (p[1] <= cy ? -7 : 14)}" text-anchor="${p[0] <= cx ? 'end' : 'start'}">${i + 1} · ${fmt(p[2])} m</text>`; });
    const bar = 5 * sc;
    s += `<line x1="${M}" y1="${H - 12}" x2="${M + bar}" y2="${H - 12}" class="lscale"/><text class="lt2" x="${M + bar + 6}" y="${H - 8}">5 m</text>`;
    $('layout-svg').innerHTML = s;
}

function renderSummary() {
    const k = LC.computeKpis(state.draft);
    const rows = k.zones.map((z) => `<tr><td>${esc(z.name)} · ${esc(typeLabel('zone', z.type))}</td><td>${fmt(z.area)} m²</td><td>${z.spaces}</td><td>${fmt(z.footprint)} m²</td><td>${fmt(z.occupancy, 1)}%</td><td>${fmt(z.volume)} m³</td></tr>`);
    $('layout-summary').innerHTML = rows.length
        ? `<table class="layout-table layout-summary-table"><thead><tr><th>${esc(t('main.layoutZona'))}</th><th>${esc(t('main.layoutSuperficie'))}</th><th>${esc(t('main.layoutEspacios'))}</th><th>${esc(t('main.layoutHuella'))}</th><th>${esc(t('main.layoutOcupacion'))}</th><th>${esc(t('main.layoutVolumen'))}</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
        : `<p class="layout-muted">${esc(t('main.layoutSinZonas'))}</p>`;
}

// Cada vez que cambia el borrador: KPIs, croquis, resumen y estado del botón Guardar. El formulario NO se redibuja (así no se pierde el cursor al teclear).
function refreshLive() {
    state.draft.heightM = Math.round((state.draft.vertices.reduce((acc, p) => acc + (Number(p[2]) || 0), 0) / Math.max(state.draft.vertices.length, 1)) * 100) / 100;
    renderKpis();
    renderSvg();
    renderSummary();
    // "Misma altura en todas": muestra la altura común, o queda vacía si las esquinas ya tienen alturas distintas (sin tocarla mientras se escribe en ella).
    const sameBox = document.querySelector('[data-l="allHeights"]');
    if (sameBox && document.activeElement !== sameBox) {
        const hs = state.draft.vertices.map((p) => p[2]);
        sameBox.value = hs.every((h) => h === hs[0]) ? hs[0] : '';
    }
    const dirty = isDirty();
    $('layout-save').disabled = !dirty;
    $('layout-discard').disabled = !dirty;
    $('layout-dirty').hidden = !dirty;
    state.draft.vertices.forEach((_, i) => {
        const cell = document.querySelector(`[data-wall-len="${i}"]`);
        if (cell) cell.textContent = `${t('main.layoutPared')} ${i + 1}: ${fmt(LC.wallSegment(state.draft.vertices, i + 1).length)} m`;
    });
    state.draft.zones.forEach((z, i) => { const c = document.querySelector(`[data-zone-area="${i}"]`); if (c) c.textContent = `${fmt(z.l * z.w)} m²`; });
    state.draft.spaces.forEach((s, i) => { const c = document.querySelector(`[data-space-calc="${i}"]`); if (c) c.textContent = `${fmt(s.l * s.d)} m² · ${fmt(s.l * s.d * s.h)} m³`; });
}

function showEmpty() {
    updateQrMenu();
    $('layout-empty').hidden = false;
    $('layout-editor').hidden = true;
    $('layout-plan-width').hidden = true;
    const perms = state.perms || { canCreateFromScratch: false, canLoadPlan: false };
    $('layout-from-scratch').disabled = !perms.canCreateFromScratch;
    $('layout-load-plan').disabled = !perms.canLoadPlan;
    renderKpis();
}
function showEditor() {
    updateQrMenu();
    $('layout-empty').hidden = true;
    $('layout-plan-width').hidden = true;
    $('layout-editor').hidden = false;
    renderPanel();
    refreshLive();
}

// ---- cargar el Layout guardado -----------------------------------------------------------------------------------------
async function loadLayout() {
    const res = await fetch('/api/business/layout', { credentials: 'include' });
    if (!res.ok) throw new Error('layout load failed');
    const body = await res.json();
    state.perms = body.permissions;
    state.version = body.version;
    state.saved = body.layout;
    state.creating = false;
    state.planNew = false;
    state.planImage = '';
    state.draft = body.layout ? clone(body.layout) : null;
    if (body.layout && body.hasPlanImage) {
        try {
            const imgRes = await fetch('/api/business/layout/plan-image', { credentials: 'include' });
            if (imgRes.ok) {
                const { image } = await imgRes.json();
                state.planImage = image;
                state.planAspect = await imageAspect(image);
            }
        } catch (err) { console.error('Layout: no se pudo cargar el plano', err); }
    }
    state.loaded = true;
    if (state.draft) showEditor(); else showEmpty();
}

function imageAspect(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalHeight / Math.max(img.naturalWidth, 1));
        img.onerror = () => resolve(1);
        img.src = dataUrl;
    });
}

// ---- crear desde cero / cargar plano -----------------------------------------------------------------------------------
function newDraftFromScratch() {
    const base = LC.emptyLayout();
    state.draft = base;
    state.creating = true;
    state.planImage = '';
    state.planNew = false;
    state.step = 'contorno';
    showEditor();
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
// El plano se reduce en el navegador hasta que cabe cómodo (el servidor rechaza lo muy grande).
async function planToDataUrl(file) {
    for (const [maxDim, quality] of [[1800, 0.8], [1400, 0.7], [1000, 0.6]]) {
        const blob = await Dashboard.compressImageToBlob(file, maxDim, quality);
        const url = await blobToDataUrl(blob);
        if (url.length < 2.2 * 1024 * 1024) return url;
    }
    throw new Error('plan too large');
}

$('layout-load-plan').addEventListener('click', () => $('layout-plan-file').click());
$('layout-plan-file').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { Dashboard.showToast(t('main.layoutPlanSoloImagen'), 'warning'); return; }
    try {
        const url = await planToDataUrl(file);
        state.pendingPlan = { url, aspect: await imageAspect(url) };
        $('layout-empty').hidden = true;
        $('layout-plan-width').hidden = false;
        $('layout-plan-width-input').value = '';
        $('layout-plan-width-input').focus();
    } catch (err) {
        console.error('Layout: plano no válido', err);
        Dashboard.showToast(t('main.layoutPlanError'), 'error');
    }
});
$('layout-plan-width-cancel').addEventListener('click', () => { state.pendingPlan = null; showEmpty(); });
$('layout-plan-width-ok').addEventListener('click', () => {
    const width = parseFloat($('layout-plan-width-input').value);
    if (!(width > 0 && width <= LC.LIMITS.maxM) || !state.pendingPlan) { Dashboard.showToast(t('main.layoutPlanAnchoInvalido'), 'warning'); return; }
    const w = Math.round(width * 100) / 100;
    const h = Math.round(w * state.pendingPlan.aspect * 100) / 100;
    const base = LC.emptyLayout();
    base.mode = 'plan';
    base.vertices = [[0, 0, base.heightM], [w, 0, base.heightM], [w, h, base.heightM], [0, h, base.heightM]];
    base.plan = { widthM: w };
    state.draft = base;
    state.creating = true;
    state.planImage = state.pendingPlan.url;
    state.planAspect = state.pendingPlan.aspect;
    state.planNew = true;
    state.pendingPlan = null;
    state.step = 'contorno';
    showEditor();
});
$('layout-from-scratch').addEventListener('click', newDraftFromScratch);

// ---- edición -----------------------------------------------------------------------------------------------------------
const SPACE_PREFIX = { rack: 'R', cabinet: 'G', pallet: 'T' };
function nextCode(type) {
    const prefix = SPACE_PREFIX[type] || 'E';
    const used = new Set(state.draft.spaces.map((s) => s.code.toLowerCase()));
    for (let n = 1; n < 10000; n++) {
        const code = `${prefix}-${String(n).padStart(2, '0')}`;
        if (!used.has(code.toLowerCase())) return code;
    }
    return `${prefix}-${uid('')}`;
}
const ROW_FACTORY = {
    vertices: () => { const last = state.draft.vertices[state.draft.vertices.length - 1] || [0, 0, 9]; return [last[0], last[1], last[2]]; },
    doors: () => ({ id: uid('d'), name: t('main.layoutPuertaNueva'), type: 'dock', wall: 1, dist: 0, width: 1.2, height: 2.1 }),
    power: () => ({ id: uid('p'), type: 'outlet110', wall: 1, dist: 1, height: 1.2 }),
    obstacles: () => ({ id: uid('o'), name: t('main.layoutColumna'), x: 1, y: 1, l: 0.6, w: 0.6 }),
    zones: () => ({ id: uid('z'), name: `${t('main.layoutZona')} ${state.draft.zones.length + 1}`, type: 'dry', x: 1, y: 1, l: 5, w: 5, active: true }),
    spaces: () => ({ id: uid('s'), type: 'rack', code: nextCode('rack'), zoneId: state.draft.zones.length ? state.draft.zones[0].id : '', x: 1, y: 1, l: 3, d: 1.1, h: 4.5, levels: 4, drawers: '', active: true }),
};
const STEP_OF_LIST = { vertices: 'contorno', obstacles: 'contorno', doors: 'puertas', power: 'luz', zones: 'zonas', spaces: 'espacios' };

function onEdit(event) {
    const el = event.target;
    const list = el.getAttribute('data-l');
    if (!list || !state.draft) return;
    const isNumber = el.type === 'number';
    const value = isNumber ? (parseFloat(el.value) || 0) : el.value;
    if (list === 'allHeights') {
        // Misma altura en todas las esquinas: se escribe una vez y se copia a cada renglón (los renglones ya dibujados se actualizan sin redibujar el formulario).
        if (value > 0) {
            state.draft.vertices.forEach((p, i) => {
                p[2] = value;
                const box = document.querySelector(`[data-l="vertices"][data-i="${i}"][data-k="2"]`);
                if (box) box.value = value;
            });
        }
    } else if (list === 'vertices') state.draft.vertices[Number(el.getAttribute('data-i'))][Number(el.getAttribute('data-k'))] = value;
    else {
        const row = state.draft[list][Number(el.getAttribute('data-i'))];
        const key = el.getAttribute('data-k');
        row[key] = (key === 'wall' || key === 'levels') ? Math.max(1, Math.round(value) || 1) : value;
        if (list === 'spaces' && key === 'type' && /^[RGT]-\d+$/i.test(row.code) && !isSavedRow('spaces', row.id)) {
            // un código sin guardar y con forma automática (R-01) sigue al tipo
            row.code = nextCode(row.type);
            const codeInput = document.querySelector(`[data-l="spaces"][data-i="${el.getAttribute('data-i')}"][data-k="code"]`);
            if (codeInput) codeInput.value = row.code;
        }
    }
    // Al cambiar el nombre de una zona, el selector de zona de los espacios debe mostrar el nombre nuevo (solo al terminar de escribir).
    if (event.type === 'change' && list === 'zones' && el.getAttribute('data-k') === 'name') renderPanel();
    refreshLive();
}
$('layout-panel').addEventListener('input', onEdit);
$('layout-panel').addEventListener('change', onEdit);
$('layout-panel').addEventListener('click', (event) => {
    const stepBtn = event.target.closest('[data-step]');
    if (stepBtn) { state.step = stepBtn.dataset.step; renderPanel(); return; }
    const add = event.target.closest('[data-add]');
    if (add) {
        const list = add.dataset.add;
        state.draft[list].push(ROW_FACTORY[list]());
        renderPanel();
        refreshLive();
        return;
    }
    const del = event.target.closest('[data-del]');
    if (del) {
        const [list, index] = del.dataset.del.split(':');
        state.draft[list].splice(Number(index), 1);
        if (list === 'vertices') {
            const walls = state.draft.vertices.length;
            state.draft.doors.forEach((d) => { if (d.wall > walls) d.wall = walls; });
            state.draft.power.forEach((p) => { if (p.wall > walls) p.wall = walls; });
        }
        renderPanel();
        refreshLive();
        return;
    }
    const del2 = event.target.closest('[data-delete]');
    if (del2) {
        const [list, index] = del2.dataset.delete.split(':');
        const row = state.draft[list][Number(index)];
        const name = list === 'zones' ? row.name : row.code;
        const message = t(list === 'zones' ? 'main.layoutEliminarZonaConfirm' : 'main.layoutEliminarEspacioConfirm').replace('{name}', name);
        Dashboard.confirm(message).then((ok) => {
            if (!ok) return;
            const current = state.draft[list].findIndex((r) => r.id === row.id);
            if (current < 0) return;
            state.draft[list].splice(current, 1);
            // Los espacios de una zona eliminada quedan sin zona (así también los deja el servidor al guardar).
            if (list === 'zones') state.draft.spaces.forEach((s) => { if (s.zoneId === row.id) s.zoneId = ''; });
            renderPanel();
            refreshLive();
        });
        return;
    }
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
        const [list, index] = toggle.dataset.toggle.split(':');
        const row = state.draft[list][Number(index)];
        row.active = row.active === false;
        renderPanel();
        refreshLive();
    }
});

// ---- guardar / descartar -----------------------------------------------------------------------------------------------
$('layout-save').addEventListener('click', async () => {
    const button = $('layout-save');
    button.disabled = true;
    try {
        const body = { layout: state.draft, baseVersion: state.version };
        if (state.planNew) body.planImage = state.planImage;
        const res = await fetch('/api/business/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        const payload = await res.json().catch(() => ({}));
        if (res.status === 409) { Dashboard.showToast(t('main.layoutConflicto'), 'warning'); await loadLayout(); return; }
        if (res.status === 403) { Dashboard.showToast(t('main.layoutSinPermiso'), 'warning'); return; }
        if (res.status === 400) { Dashboard.showToast(`${t('main.layoutDatosInvalidos')} ${(payload.errors && payload.errors[0]) || ''}`.trim(), 'warning'); return; }
        if (!res.ok) throw new Error('layout save failed');
        const keepStep = state.step;
        await loadLayout();
        state.step = keepStep;
        if (state.draft) showEditor();
        Dashboard.showToast(t('main.layoutGuardado'), 'success');
    } catch (err) {
        console.error('Layout: no se pudo guardar', err);
        Dashboard.showToast(t('main.layoutErrorGuardar'), 'error');
    } finally {
        refreshButtons();
    }
});
function refreshButtons() {
    if (!state.draft) return;
    const dirty = isDirty();
    $('layout-save').disabled = !dirty;
    $('layout-discard').disabled = !dirty;
}
$('layout-discard').addEventListener('click', async () => {
    if (!(await Dashboard.confirm(t('main.layoutDescartarConfirm')))) return;
    state.creating = false;
    state.planNew = false;
    await loadLayout();
});
window.addEventListener('beforeunload', (event) => {
    if (isDirty()) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('dashboard:language-changed', () => {
    if (!state.loaded) return;
    if (state.draft) { renderPanel(); refreshLive(); } else showEmpty();
});

// ---- QR y descarga -----------------------------------------------------------------------------------------------------
// El QR del Layout es fijo (lo crea el servidor la primera vez que se guarda) y abre la versión guardada más reciente. La hoja que se descarga se arma
// aquí con lo ÚLTIMO GUARDADO que trae GET /api/business/layout/qr (lo mismo que se ve al escanear), no con lo que está a medio capturar.
function updateQrMenu() {
    const show = !!(state.perms && state.perms.canUseQr && state.saved && !state.creating);
    $('layout-qrmenu').hidden = !show;
    $('layout-qr-regen').hidden = !(state.perms && state.perms.canRegenerateQr);
    if (!show) closeQrPop();
}
function closeQrPop() {
    $('layout-qr-pop').hidden = true;
    $('layout-qr-btn').setAttribute('aria-expanded', 'false');
}
$('layout-qr-btn').addEventListener('click', (event) => {
    event.stopPropagation();
    const open = $('layout-qr-pop').hidden;
    $('layout-qr-pop').hidden = !open;
    $('layout-qr-btn').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', (event) => { if (!event.target.closest('#layout-qrmenu')) closeQrPop(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeQrPop(); });

async function fetchQrData() {
    const res = await fetch('/api/business/layout/qr', { credentials: 'include' });
    if (res.status === 403) { Dashboard.showToast(t('main.layoutQrSinPermiso'), 'warning'); return null; }
    if (res.status === 404) { Dashboard.showToast(t('main.layoutQrSinLayout'), 'warning'); return null; }
    if (!res.ok) throw new Error('layout qr failed');
    return res.json();
}
function sheetLabels() {
    return {
        area: t('main.layoutHojaArea'), title: t('main.layoutHojaTitulo'), height: t('main.layoutHojaAltura'), spaces: t('main.layoutHojaEspacios'),
        kpiTotal: t('main.layoutHojaKpiTotal'), kpiOffices: t('main.layoutHojaKpiOficinas'), kpiAisles: t('main.layoutHojaKpiPasillos'),
        kpiDocks: t('main.layoutHojaKpiAndenes'), kpiStorage: t('main.layoutHojaKpiAlmacenamiento'), kpiDead: t('main.layoutHojaKpiMuertos'), kpiVolume: t('main.layoutHojaKpiVolumen'),
        scan: t('main.layoutHojaEscanea'), fixed: t('main.layoutHojaNoCambia'), door: t('main.layoutLeyendaPuerta'), space: t('main.layoutLeyendaEspacio'),
        dry: typeLabel('zone', 'dry'), cold: typeLabel('zone', 'cold'), chemical: typeLabel('zone', 'chemical'), finished: typeLabel('zone', 'finished'),
        aisle: typeLabel('zone', 'aisle'), aisle2: typeLabel('zone', 'aisle2'),
        printed: t('main.layoutHojaImpreso'), snapshot: t('main.layoutHojaFoto'), updated: t('main.layoutHojaActualizado'), version: t('main.layoutHojaVersion'),
    };
}
const slug = (text) => String(text || 'Layout').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Layout';
async function downloadSheet(kind) {
    if (isDirty()) Dashboard.showToast(t('main.layoutDescargaGuardado'), 'info');
    else Dashboard.showToast(t('main.layoutPreparandoHoja'), 'info');
    const data = await fetchQrData();
    if (!data) return;
    const mapInner = window.LayoutMapSvg.mapSvg(data.layout).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    const svg = window.LayoutSheet.buildSheetSvg({
        companyName: data.companyName, version: data.version, updatedAt: new Date(`${String(data.updatedAt).replace(' ', 'T')}Z`), printedAt: new Date(),
        url: data.url, qrRows: data.qrRows, kpis: data.kpis, layout: data.layout, mapInner,
    }, sheetLabels(), Dashboard.lang);
    const blob = kind === 'pdf' ? await window.LayoutSheet.renderPdf(svg) : await window.LayoutSheet.renderPng(svg);
    const day = new Date().toISOString().slice(0, 10);
    window.LayoutSheet.saveBlob(blob, `Layout_${slug(data.companyName)}_v${data.version}_${day}.${kind === 'pdf' ? 'pdf' : 'png'}`);
    Dashboard.showToast(t('main.layoutDescargaLista'), 'success');
}
async function copyQrLink() {
    const data = await fetchQrData();
    if (!data) return;
    try {
        await navigator.clipboard.writeText(data.url);
    } catch {
        const box = document.createElement('textarea');
        box.value = data.url;
        document.body.appendChild(box);
        box.select();
        try { document.execCommand('copy'); } catch { /* sin portapapeles: el aviso igual muestra que se intentó */ }
        box.remove();
    }
    Dashboard.showToast(t('main.layoutEnlaceCopiado'), 'success');
}
async function regenerateQr() {
    if (!(await Dashboard.confirm(t('main.layoutRegenerarQrConfirm')))) return;
    const res = await fetch('/api/business/layout/qr/regenerate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ confirm: true }) });
    if (res.status === 403) { Dashboard.showToast(t('main.layoutQrSinPermiso'), 'warning'); return; }
    if (!res.ok) throw new Error('layout qr regenerate failed');
    Dashboard.showToast(t('main.layoutQrCambiado'), 'success');
}
$('layout-qr-pop').addEventListener('click', async (event) => {
    const item = event.target.closest('[data-qr]');
    if (!item) return;
    closeQrPop();
    try {
        const kind = item.dataset.qr;
        if (kind === 'pdf' || kind === 'png') await downloadSheet(kind);
        else if (kind === 'link') await copyQrLink();
        else if (kind === 'regen') await regenerateQr();
    } catch (err) {
        console.error('Layout: acción de QR falló', err);
        Dashboard.showToast(t('main.layoutDescargaError'), 'error');
    }
});

(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: 'cat-operaciones-centro-dist-layout' });
        await loadLayout();
    } catch (err) {
        console.error('Layout failed to initialize:', err);
    }
})();
})();
