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
    saved: null, draft: null, version: 0, perms: null, showMeasures: true, showArea: true, steps: ['contorno'], focus: 'contorno', focusStack: ['contorno'], catsOpen: null, catEdit: null, creating: false,
    planImage: '', planNew: false, planAspect: 1, pendingPlan: null, loaded: false,
    // figuras que se están armando lado por lado y todavía no cierran (no se pueden guardar así), cómo se captura el contorno y la zona cuyos lados están a la vista
    open: { contorno: false, zones: {} }, contornoMode: 'sides', zoneOpen: null,
};
let view = null;
let drag = null;

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
// filterId: la tabla lleva en cada encabezado el embudo de filtros (el mismo menú de todas las tablas, ver bindLayoutFilters) para quien tiene el icono Filtros en el árbol.
function table(headKeys, rows, filterId) {
    const filterable = !!(filterId && state.perms && state.perms.canFilterTables);
    const head = headKeys.map((k) => `<th${filterable && k ? ` data-col="${esc(k)}" class="layout-th-filter"` : ''}>${k ? esc(t(k)) : ''}</th>`).join('');
    const note = filterable ? `<div class="layout-filter-note" data-filter-note="${filterId}" hidden><span></span><button type="button" class="btn btn-secondary layout-toggle" data-filter-clear="${filterId}" data-help-key="layoutFilterClear">${esc(t('main.layoutFiltroQuitar'))}</button></div>` : '';
    return `${note}<div class="layout-scroll"><table class="layout-table"${filterable ? ` data-filter-table="${filterId}"` : ''}><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
// Embudo de filtros de los encabezados: el menú vive en Dashboard.js y filtra por lo que muestra cada celda (el campo, no su texto). Se vuelve a enganchar cada vez que el
// panel se dibuja de nuevo; los filtros puestos se conservan y se aplican otra vez. Los renglones se esconden, nunca se quitan, así que su número (data-i) no cambia.
const FILTER_TABLE_IDS = ['layout-zonas'];
function bindLayoutFilters() {
    if (!window.Dashboard || !Dashboard.bindExternalColumnFilters) return;
    document.querySelectorAll('#layout-panel table[data-filter-table]').forEach((tbl) => {
        const id = tbl.dataset.filterTable;
        const keys = Array.from(tbl.tHead.rows[0].cells).map((th) => th.dataset.col || '');
        Array.from(tbl.tBodies[0].rows).forEach((tr) => {
            Array.from(tr.cells).forEach((td, i) => {
                if (!keys[i]) return;
                td.dataset.col = keys[i];
                if (td.querySelector('input, select')) td.dataset.filterFrom = 'control';
                else if (td.querySelector('[data-zone-area]')) td.dataset.filterFrom = '[data-zone-area]';
            });
        });
        Dashboard.bindExternalColumnFilters(id, tbl);
        const note = tbl.closest('.layout-section')?.querySelector(`[data-filter-note="${id}"]`);
        if (!note) return;
        const refresh = () => {
            const rows = Array.from(tbl.tBodies[0].rows);
            const hidden = rows.filter((tr) => tr.classList.contains('data-table-row-col-filtered')).length;
            note.hidden = !tbl.querySelector('th.data-table-col-filter-active');
            note.firstElementChild.textContent = t('main.layoutFiltroNota').replace('{shown}', String(rows.length - hidden)).replace('{total}', String(rows.length));
        };
        refresh();
        new MutationObserver(refresh).observe(tbl, { attributes: true, attributeFilter: ['class'], subtree: true });
    });
}
// Una fila nueva siempre se ve: al agregarla se quitan los filtros de la tabla.
function clearLayoutFilters() {
    if (window.Dashboard && Dashboard.clearExternalColumnFilters) FILTER_TABLE_IDS.forEach((id) => Dashboard.clearExternalColumnFilters(id));
}
const removeCell = (list, i, disabled, extra = '') => {
    const button = `<button type="button" class="layout-x" data-del="${list}:${i}" data-help-key="layoutRemoveRow" aria-label="${esc(t('main.layoutQuitar'))}"${disabled ? ' disabled' : ''}>✕</button>`;
    return extra ? `<td><div class="layout-rowbtns">${extra}${button}</div></td>` : `<td>${button}</td>`;
};
const addButton = (list, labelKey, disabled) => `<button type="button" class="btn btn-secondary layout-add" data-add="${list}" data-help-key="layoutAddRow"${disabled ? ' disabled' : ''}>${esc(t(labelKey))}</button>`;
// Fila ya guardada de zonas o espacios: Desactivar/Reactivar (se conserva, deja de contar) y, con permiso, Eliminar.
function savedRowButtons(list, i, active, disabled, extra = '') {
    const canDelete = state.perms && (list === 'zones' ? state.perms.canDeleteZones : state.perms.canDeleteSpaces);
    const toggle = `<button type="button" class="btn btn-secondary layout-toggle" data-toggle="${list}:${i}" data-help-key="layoutToggleRow"${disabled ? ' disabled' : ''}>${esc(t(active === false ? 'main.layoutReactivar' : 'main.layoutDesactivar'))}</button>`;
    const del = canDelete ? `<button type="button" class="btn btn-secondary layout-toggle layout-delete" data-delete="${list}:${i}" data-help-key="layoutDeleteRow"${disabled ? ' disabled' : ''}>${esc(t('main.layoutEliminar'))}</button>` : '';
    return `<td><div class="layout-rowbtns">${extra}${toggle}${del}</div></td>`;
}
const isSavedRow = (list, id) => !!(state.saved && (state.saved[list] || []).some((row) => row.id === id));

// ---- figuras escritas lado por lado (contorno de la nave y zonas de cualquier forma) --------------------------------------------------
// Se escriben como las trae el plano: desde una esquina, cada lado es hacia dónde va (derecha, abajo, izquierda, arriba) y cuánto mide. Se guardan como esquinas
// (vertices / pts); aquí solo se pasa de lados a esquinas y de vuelta. "Abierta" = se está armando y la última esquina todavía no regresa al origen: no se puede guardar así.
// "Hacia dónde" tiene las 4 direcciones derechas y 4 flechas en diagonal; al elegir una diagonal aparece su inclinación en grados (medida desde la horizontal, 0.1 a 89.9).
const DIR_KEYS = { R: 'main.layoutDirR', RD: 'main.layoutDirRD', D: 'main.layoutDirD', LD: 'main.layoutDirLD', L: 'main.layoutDirL', LU: 'main.layoutDirLU', U: 'main.layoutDirU', RU: 'main.layoutDirRU' };
const DIR_ORDER = ['R', 'RD', 'D', 'LD', 'L', 'LU', 'U', 'RU'];
const NEXT_DIR = { R: 'D', D: 'L', L: 'U', U: 'R' };
const dirOptions = (selected) => DIR_ORDER.map((k) => `<option value="${k}"${k === selected ? ' selected' : ''}>${esc(t(DIR_KEYS[k]))}</option>`).join('');
// Un lado se guarda como [R/D/L/U o ángulo en grados girando como las manecillas desde la derecha, medida]; en pantalla se ve como flecha + inclinación.
const wrapAngle = (a) => ((a % 360) + 360) % 360;
function sideDirKey(side) {
    if (typeof side[0] === 'string') return side[0];
    const a = wrapAngle(side[0]);
    return a < 90 ? 'RD' : a < 180 ? 'LD' : a < 270 ? 'LU' : 'RU';
}
function sideTilt(side) {
    const a = wrapAngle(side[0]);
    return a < 90 ? a : a < 180 ? 180 - a : a < 270 ? a - 180 : 360 - a;
}
function angleFromTilt(key, tilt) {
    const i = Math.min(89.9, Math.max(0.1, Number.isFinite(tilt) ? tilt : 45));
    const a = key === 'RD' ? i : key === 'LD' ? 180 - i : key === 'LU' ? 180 + i : 360 - i;
    return Math.round(a * 1000) / 1000;
}
const round2 = (n) => Math.round(n * 100) / 100;
const vertexPoints = () => state.draft.vertices.map((p) => [p[0], p[1]]);
const contornoSides = () => LC.sidesFromPoints(vertexPoints(), state.open.contorno);

function clampWalls() {
    const walls = state.draft.vertices.length;
    state.draft.doors.forEach((d) => { if (d.wall > walls) d.wall = walls; });
    state.draft.power.forEach((p) => { if (p.wall > walls) p.wall = walls; });
}
// x, y, largo y ancho de una zona de cualquier forma son siempre el recuadro que la envuelve.
function syncZoneBox(z) {
    if (!z.pts.length) return;
    const xs = z.pts.map((p) => p[0]);
    const ys = z.pts.map((p) => p[1]);
    z.x = round2(Math.min(...xs));
    z.y = round2(Math.min(...ys));
    z.l = round2(Math.max(...xs) - z.x);
    z.w = round2(Math.max(...ys) - z.y);
}
function setContornoFromSides(origin, sides, heights) {
    const { pts, closed } = LC.pointsFromSides(origin, sides);
    state.open.contorno = !closed;
    const last = heights.length ? heights[heights.length - 1] : 9;
    state.draft.vertices = pts.map((p, i) => [p[0], p[1], heights[i] != null ? heights[i] : last]);
    clampWalls();
}
function setZoneFromSides(z, origin, sides) {
    const { pts, closed } = LC.pointsFromSides(origin, sides);
    z.pts = pts;
    if (closed) delete state.open.zones[z.id]; else state.open.zones[z.id] = true;
    syncZoneBox(z);
}
// Lo que se está armando: el contorno ('contorno') o una zona ('zone:ID'), con sus lados, su origen y las alturas de las esquinas (solo el contorno las lleva).
function shapeOf(key) {
    if (key === 'contorno') {
        const v = state.draft.vertices;
        return { sides: contornoSides().sides, origin: [v[0][0], v[0][1]], heights: v.map((p) => p[2]), pts: vertexPoints(), apply: (origin, sides, heights) => setContornoFromSides(origin, sides, heights) };
    }
    const z = state.draft.zones.find((r) => r.id === key.slice(5));
    if (!z || !Array.isArray(z.pts)) return null;
    return { sides: LC.sidesFromPoints(z.pts, !!state.open.zones[z.id]).sides, origin: z.pts[0] ? [z.pts[0][0], z.pts[0][1]] : [z.x, z.y], heights: [], pts: z.pts, apply: (origin, sides) => setZoneFromSides(z, origin, sides) };
}
const isOpenShape = (key) => (key === 'contorno' ? state.open.contorno : !!state.open.zones[key.slice(5)]);
function gapText(pts) {
    return LC.closingSides(pts).map(([dir, len]) => t(`main.layoutGap${dir}`).replace('{n}', fmt(len))).join(t('main.layoutGapY'));
}
function sidesStatusHtml(key, dis) {
    const sh = shapeOf(key);
    if (!sh || sh.pts.length < 2) return '';
    if (!isOpenShape(key)) return `<span class="layout-chip ok">${esc(t('main.layoutCierraBien'))}</span>`;
    // Con falta en horizontal y en vertical también se puede cerrar con una sola línea recta (queda inclinada si no va a 90°).
    const line = LC.closingSides(sh.pts).length === 2 ? `<button type="button" class="btn btn-secondary layout-add" data-sline="${esc(key)}" data-help-key="layoutSideCloseLine"${dis ? ' disabled' : ''}>${esc(t('main.layoutCerrarRecta'))}</button>` : '';
    return `<span class="layout-chip warn">${esc(t('main.layoutNoCierraFalta').replace('{gap}', gapText(sh.pts)))}</span><button type="button" class="btn btn-secondary layout-add" data-sclose="${esc(key)}" data-help-key="layoutSideClose"${dis ? ' disabled' : ''}>${esc(t('main.layoutAgregarFalta'))}</button>${line}`;
}
function sidesBlockHtml(key, dis) {
    const sh = shapeOf(key);
    if (!sh) return '';
    const isC = key === 'contorno';
    const attr = isC ? 'data-cs' : 'data-zs';
    const sfx = isC ? '' : `:${key.slice(5)}`;
    const idx = (i) => (isC ? `${i}` : `${key.slice(5)}:${i}`);
    const tiltCell = (s, i) => (typeof s[0] === 'string'
        ? '<td class="layout-calc">—</td>'
        : `<td><input type="number" step="0.1" min="0.1" max="89.9" ${attr}="tilt:${idx(i)}" data-help-key="layoutSideTilt" value="${Math.round(sideTilt(s) * 100) / 100}"${dis ? ' disabled' : ''}></td>`);
    const rows = sh.sides.map((s, i) => `<tr><td class="layout-calc">${esc(t('main.layoutLado'))} ${i + 1}</td><td><select ${attr}="dir:${idx(i)}" data-help-key="layoutSideDir"${dis ? ' disabled' : ''}>${dirOptions(sideDirKey(s))}</select></td>${tiltCell(s, i)}<td><input type="number" step="0.01" min="0" ${attr}="len:${idx(i)}" data-help-key="layoutSideLen" value="${s[1]}"${dis ? ' disabled' : ''}></td>${isC ? `<td><input type="number" step="0.1" min="0" ${attr}="h:${idx(i)}" value="${sh.heights[i] != null ? sh.heights[i] : ''}"${dis ? ' disabled' : ''}></td>` : ''}<td><div class="layout-rowbtns"><button type="button" class="layout-x" data-sins="${esc(key)}:${i}" data-help-key="layoutSideInsert" aria-label="${esc(t('main.layoutInsertarLado'))}"${dis ? ' disabled' : ''}>+</button><button type="button" class="layout-x" data-sdel="${esc(key)}:${i}" data-help-key="layoutRemoveRow" aria-label="${esc(t('main.layoutQuitar'))}"${dis ? ' disabled' : ''}>✕</button></div></td></tr>`);
    const head = isC ? ['main.layoutLado', 'main.layoutHaciaDonde', 'main.layoutInclinacion', 'main.layoutMide', 'main.layoutAlturaEsquina', ''] : ['main.layoutLado', 'main.layoutHaciaDonde', 'main.layoutInclinacion', 'main.layoutMide', ''];
    return `<div class="layout-fl"><label>${esc(t('main.layoutEmpiezaX'))}<input type="number" step="0.05" ${attr}="ox${sfx}" data-help-key="layoutOrigin" value="${sh.origin[0]}"${dis ? ' disabled' : ''}></label><label>${esc(t('main.layoutEmpiezaY'))}<input type="number" step="0.05" ${attr}="oy${sfx}" data-help-key="layoutOrigin" value="${sh.origin[1]}"${dis ? ' disabled' : ''}></label></div>${table(head, rows)}<div class="layout-sidesbar"><button type="button" class="btn btn-secondary layout-add" data-sadd="${esc(key)}" data-help-key="layoutSideAdd"${dis ? ' disabled' : ''}>${esc(t('main.layoutAgregarLado'))}</button><span data-sides-status="${esc(key)}">${sidesStatusHtml(key, dis)}</span></div>`;
}
function zoneSidesPanelHtml(dis) {
    const z = state.draft.zones.find((r) => r.id === state.zoneOpen);
    if (!z || !Array.isArray(z.pts)) return '';
    return `<div class="layout-zone-sides"><h4 class="layout-sub">${esc(t('main.layoutLadosDe').replace('{name}', z.name))}</h4>${sidesBlockHtml(`zone:${z.id}`, dis)}</div>`;
}
// Avisos de una zona: se sale de la nave, o cuánto difiere su superficie de los m² que dice el plano (±3 % se considera que coincide).
const PLAN_TOLERANCE = 3;
function zoneChipsHtml(z) {
    if (Array.isArray(z.pts) && z.pts.length < 3) return `<span class="layout-chip warn">${esc(t('main.layoutPorDibujar'))}</span>`;
    const chips = [];
    if (LC.zoneOutsideNave(state.draft.vertices, z)) chips.push(`<span class="layout-chip warn">${esc(t('main.layoutSaleDeNave'))}</span>`);
    if (z.planM2 > 0) {
        const d = ((LC.zoneArea(z) - z.planM2) / z.planM2) * 100;
        const v = Math.round(d * 10) / 10;
        const n = `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), 1)}%`;
        chips.push(Math.abs(d) <= PLAN_TOLERANCE
            ? `<span class="layout-chip ok">${esc(t('main.layoutCoincide').replace('{n}', n))}</span>`
            : `<span class="layout-chip warn">${esc(t('main.layoutDifiere').replace('{n}', n))}</span>`);
    }
    return chips.join('');
}
function addSide(key) {
    const sh = shapeOf(key);
    if (!sh) return;
    const sides = sh.sides.map((s) => s.slice());
    const heights = sh.heights.slice();
    const last = sides.length ? sides[sides.length - 1][0] : 'U';
    sides.push([NEXT_DIR[last] || 'R', 1]);
    if (heights.length) heights.push(heights[heights.length - 1]);
    sh.apply(sh.origin, sides, heights);
}
function removeSide(key, i) {
    const sh = shapeOf(key);
    if (!sh) return;
    const sides = sh.sides.map((s) => s.slice());
    const heights = sh.heights.slice();
    sides.splice(i, 1);
    heights.splice(i, 1);
    sh.apply(sh.origin, sides, heights);
}
// Agrega un lado después del lado i: ese lado se divide en dos partes iguales, la primera se queda con su renglón y la segunda es la nueva. La figura no cambia (sigue
// cerrando); la esquina nueva toma la altura intermedia entre las dos que la rodean.
function insertSide(key, i) {
    const sh = shapeOf(key);
    if (!sh || !sh.sides[i]) return;
    const sides = sh.sides.map((s) => s.slice());
    const heights = sh.heights.slice();
    const side = sides[i];
    const k = typeof side[0] === 'number' ? 1000 : 100;
    const first = Math.round((side[1] / 2) * k) / k;
    const second = Math.round((side[1] - first) * k) / k;
    sides[i] = [side[0], first];
    sides.splice(i + 1, 0, [side[0], second]);
    if (heights.length) {
        const next = heights[(i + 1) % heights.length];
        heights.splice(i + 1, 0, round2(((Number(heights[i]) || 0) + (Number(next) || 0)) / 2));
    }
    sh.apply(sh.origin, sides, heights);
}
function closeSides(key) {
    const sh = shapeOf(key);
    if (!sh) return;
    const sides = sh.sides.map((s) => s.slice());
    const heights = sh.heights.slice();
    LC.closingSides(sh.pts).forEach((s) => { sides.push(s); if (heights.length) heights.push(heights[heights.length - 1]); });
    sh.apply(sh.origin, sides, heights);
}
function closeLine(key) {
    const sh = shapeOf(key);
    if (!sh) return;
    const line = LC.closingLine(sh.pts);
    if (!line) return;
    const sides = sh.sides.map((s) => s.slice());
    const heights = sh.heights.slice();
    sides.push(line);
    if (heights.length) heights.push(heights[heights.length - 1]);
    sh.apply(sh.origin, sides, heights);
}
// Una edición de un renglón de lados (hacia dónde, cuánto mide, altura de la esquina) o del origen: se vuelve a armar la figura completa desde sus lados.
function onSidesEdit(el) {
    const isC = el.getAttribute('data-cs') !== null;
    const parts = (isC ? el.getAttribute('data-cs') : el.getAttribute('data-zs')).split(':');
    const kind = parts[0];
    const key = isC ? 'contorno' : `zone:${parts[1]}`;
    const at = Number(isC ? parts[1] : parts[2]);
    const sh = shapeOf(key);
    if (!sh) return;
    const sides = sh.sides.map((s) => s.slice());
    const heights = sh.heights.slice();
    const origin = sh.origin.slice();
    const num = parseFloat(el.value);
    const n = Number.isFinite(num) ? num : 0;
    if (kind === 'ox') origin[0] = n;
    else if (kind === 'oy') origin[1] = n;
    else if (kind === 'dir') {
        // Una flecha en diagonal conserva la inclinación que ya traía el lado (o 45° si venía derecho); una derecha deja el lado derecho.
        sides[at][0] = el.value.length === 2 ? angleFromTilt(el.value, typeof sides[at][0] === 'number' ? sideTilt(sides[at]) : 45) : el.value;
    } else if (kind === 'tilt') sides[at][0] = angleFromTilt(sideDirKey(sides[at]), n);
    else if (kind === 'len') sides[at][1] = Math.max(0, n);
    else if (kind === 'h') heights[at] = n;
    sh.apply(origin, sides, heights);
    refreshLive();
}
// Al empezar a editar: nada está abierto y el contorno se captura por lados (también se puede por esquinas con X, Y).
function initEditState() {
    state.open = { contorno: false, zones: {} };
    state.zoneOpen = null;
    state.contornoMode = 'sides';
}
// La primera figura que se dejó sin cerrar (no se puede guardar así).
function firstOpenShape() {
    if (state.open.contorno) return { kind: 'contorno' };
    const z = state.draft.zones.find((r) => state.open.zones[r.id]);
    return z ? { kind: 'zone', zone: z } : null;
}

// ---- categorías dentro de cada zona -----------------------------------------------------------------------------------------------------
// La zona es el título y adentro lleva sus categorías (se escriben a mano, varias por zona): nombre, descripción corta, icono y color. Cada una tiene su QR en la tarjeta que se imprime.
// Panel debajo de la tabla de zonas: se abre con el botón de etiqueta de cada zona.
const CAT_COLORS = ['#1f3a6b', '#3f6b2f', '#d08a1e', '#2f4fc9', '#c77fa3', '#7a1f1a', '#2f8a9b', '#4c5fb0', '#6b3e98', '#5b6272'];
function catGlyph(icon, stroke = '#FFFFFF') {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${window.LayoutMapSvg.categoryGlyph(icon, stroke, 2)}</svg>`;
}
function catEditorHtml(c, dis) {
    const icons = LC.CATEGORY_ICONS.map((k) => `<button type="button" class="layout-cat-ig" data-cat-icon="${esc(c.id)}:${k}" aria-pressed="${c.icon === k}" aria-label="${esc(t(`main.layoutCatIcon_${k}`))}" title="${esc(t(`main.layoutCatIcon_${k}`))}"${dis ? ' disabled' : ''}>${catGlyph(k, 'currentColor')}</button>`).join('');
    const colors = CAT_COLORS.map((k) => `<button type="button" class="layout-cat-cg" data-cat-color="${esc(c.id)}:${k}" aria-pressed="${c.color.toLowerCase() === k}" style="background:${k}" aria-label="${esc(k)}"${dis ? ' disabled' : ''}></button>`).join('');
    return `<div class="layout-cat-editor"><h4>${esc(t('main.layoutCatIcono'))}</h4><div class="layout-cat-igrid">${icons}</div><h4>${esc(t('main.layoutCatColor'))}</h4><div class="layout-cat-cgrid">${colors}<button type="button" class="btn btn-secondary layout-toggle" data-cat-more="${esc(c.id)}" data-help-key="layoutFmtColor"${dis ? ' disabled' : ''}>${esc(t('main.layoutElegirColor'))}</button></div></div>`;
}
function zoneCatsPanelHtml(dis) {
    const z = state.draft.zones.find((r) => r.id === state.catsOpen);
    if (!z) return '';
    const cats = z.categories || [];
    const rows = cats.map((c) => `<div class="layout-cat${state.catEdit === c.id ? ' open' : ''}"><button type="button" class="layout-cat-icon" data-cat-edit="${esc(c.id)}" style="background:${esc(c.color)}" data-help-key="layoutCatLook" aria-label="${esc(t('main.layoutCatIconoColor'))}"${dis ? ' disabled' : ''}>${catGlyph(c.icon)}</button>
        <div class="layout-cat-fields"><input type="text" maxlength="${LC.LIMITS.text}" data-cat="${esc(c.id)}:name" data-help-key="layoutCatName" value="${esc(c.name)}" placeholder="${esc(t('main.layoutCatNombre'))}"${dis ? ' disabled' : ''}><input type="text" maxlength="${LC.LIMITS.categoryText}" data-cat="${esc(c.id)}:desc" data-help-key="layoutCatDesc" value="${esc(c.desc)}" placeholder="${esc(t('main.layoutCatDescripcion'))}"${dis ? ' disabled' : ''}></div>
        <button type="button" class="layout-x" data-cat-del="${esc(c.id)}" data-help-key="layoutRemoveRow" aria-label="${esc(t('main.layoutQuitar'))}"${dis ? ' disabled' : ''}>✕</button></div>${state.catEdit === c.id ? catEditorHtml(c, dis) : ''}`).join('');
    const cardBtn = state.perms && state.perms.canUseCard
        ? `<button type="button" class="btn btn-secondary layout-add" data-card-open="${esc(z.id)}" data-help-key="layoutCardBtn">${esc(t('main.layoutTarjetaAbrir'))}</button>`
        : '';
    return `<div class="layout-zone-sides layout-cats-panel"><h4 class="layout-sub">${esc(t('main.layoutCatDe').replace('{name}', z.name))}</h4>${rows || `<p class="layout-muted">${esc(t('main.layoutCatVacia'))}</p>`}<div class="layout-sidesbar"><button type="button" class="btn btn-secondary layout-add" data-cat-add="${esc(z.id)}" data-help-key="layoutCatAdd"${dis || cats.length >= LC.LIMITS.categories ? ' disabled' : ''}>${esc(t('main.layoutCatAgregar'))}</button>${cardBtn}</div></div>`;
}
function addCategory(zone) {
    zone.categories = zone.categories || [];
    const n = zone.categories.length;
    const cat = { id: uid('c'), name: `${t('main.layoutCategoria')} ${n + 1}`, desc: '', icon: LC.CATEGORY_ICONS[n % LC.CATEGORY_ICONS.length], color: CAT_COLORS[n % CAT_COLORS.length] };
    zone.categories.push(cat);
    state.catEdit = cat.id;
}
function onCategoryEdit(el) {
    const [id, field] = el.getAttribute('data-cat').split(':');
    const zone = state.draft.zones.find((r) => (r.categories || []).some((c) => c.id === id));
    const cat = zone && zone.categories.find((c) => c.id === id);
    if (!cat) return;
    cat[field === 'desc' ? 'desc' : 'name'] = el.value;
    refreshLive();
}

function stepHtml(step) {
    const d = state.draft;
    const dis = !canEdit(step);
    if (step === 'contorno') {
        const mode = state.contornoMode;
        const modeBar = `<div class="layout-seg" role="group" data-help-key="layoutContornoMode"><button type="button" class="layout-seg-btn${mode === 'sides' ? ' active' : ''}" data-cmode="sides">${esc(t('main.layoutPorLados'))}</button><button type="button" class="layout-seg-btn${mode === 'corners' ? ' active' : ''}" data-cmode="corners">${esc(t('main.layoutPorEsquinas'))}</button></div>`;
        const rows = d.vertices.map((p, i) => {
            const seg = LC.wallSegment(d.vertices, i + 1);
            return `<tr><td class="layout-calc">${esc(t('main.layoutEsquina'))} ${i + 1}</td>${cellNum('vertices', i, '0', p[0], dis)}${cellNum('vertices', i, '1', p[1], dis)}${cellNum('vertices', i, '2', p[2], dis)}<td class="layout-calc" data-wall-len="${i}">${esc(t('main.layoutPared'))} ${i + 1}: ${fmt(seg.length)} m</td>${d.vertices.length > 3 ? removeCell('vertices', i, dis) : '<td></td>'}</tr>`;
        });
        const obstacles = d.obstacles.map((o, i) => `<tr>${cellText('obstacles', i, 'name', o.name, dis)}${cellNum('obstacles', i, 'x', o.x, dis)}${cellNum('obstacles', i, 'y', o.y, dis)}${cellNum('obstacles', i, 'l', o.l, dis)}${cellNum('obstacles', i, 'w', o.w, dis)}${removeCell('obstacles', i, dis)}</tr>`);
        const heights = d.vertices.map((p) => p[2]);
        const sameHeight = heights.every((h) => h === heights[0]) ? heights[0] : '';
        const shape = mode === 'sides'
            ? sidesBlockHtml('contorno', dis)
            : `${table(['main.layoutEsquina', 'main.layoutX', 'main.layoutY', 'main.layoutAlturaEsquina', 'main.layoutPared', ''], rows)}${addButton('vertices', 'main.layoutAgregarEsquina', dis)}`;
        return `${modeBar}<div class="layout-fl"><label>${esc(t('main.layoutAlturaTodas'))}<input type="number" step="0.1" min="0" data-l="allHeights" value="${sameHeight}" placeholder="—"${dis ? ' disabled' : ''}></label><label data-help-key="layoutSite">${esc(t('main.layoutSitio'))}<input type="text" maxlength="${LC.LIMITS.text}" data-l="siteName" value="${esc(d.siteName || '')}" placeholder="${esc(t('main.layoutSitioEjemplo'))}"${dis ? ' disabled' : ''}></label></div>
            ${shape}
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
            const free = Array.isArray(z.pts);
            const typeOptions = `<option value=""${z.type ? '' : ' selected'}>${esc(t('main.layoutSinZona'))}</option>${optionsHtml('zone', LC.ZONE_TYPES, z.type)}`;
            const o = free && z.pts[0] ? z.pts[0] : [z.x, z.y];
            const position = free
                ? `${cellNum('zones', i, 'ox', o[0], dis, '0.05')}${cellNum('zones', i, 'oy', o[1], dis, '0.05')}<td class="layout-calc">—</td><td class="layout-calc">—</td>`
                : `${cellNum('zones', i, 'x', z.x, dis)}${cellNum('zones', i, 'y', z.y, dis)}${cellNum('zones', i, 'l', z.l, dis)}${cellNum('zones', i, 'w', z.w, dis)}`;
            const shapeButton = free
                ? `<button type="button" class="btn btn-secondary layout-toggle" data-sidesopen="${esc(z.id)}" data-help-key="layoutSidesOpen"${dis ? ' disabled' : ''}>${esc(t('main.layoutLados'))}</button>`
                : `<button type="button" class="btn btn-secondary layout-toggle" data-freeshape="${i}" data-help-key="layoutFreeShape"${dis ? ' disabled' : ''}>${esc(t('main.layoutFormaLibre'))}</button>`;
            const fmtButton = state.perms && state.perms.canFormatZones
                ? `<button type="button" class="btn btn-secondary layout-toggle layout-fmt${z.fmt ? ' on' : ''}" data-fmtzone="${i}" data-help-key="layoutZoneFmt" aria-label="${esc(t('main.layoutFormatoZona'))}"${dis ? ' disabled' : ''}><i class="bx bx-palette" aria-hidden="true"></i>${z.fmt ? `<span class="layout-fmt-dot" style="background:${esc(z.fmt.fill)};border-color:${esc(z.fmt.bcolor)}"></span>` : ''}</button>`
                : '';
            const catCount = (z.categories || []).length;
            const catButton = state.perms && state.perms.canEditCategories
                ? `<button type="button" class="btn btn-secondary layout-toggle layout-cats${state.catsOpen === z.id ? ' on' : ''}" data-catszone="${esc(z.id)}" data-help-key="layoutZoneCats" aria-label="${esc(t('main.layoutCatDe').replace('{name}', z.name))}"><i class="bx bx-purchase-tag-alt" aria-hidden="true"></i>${catCount ? `<span class="layout-cats-n">${catCount}</span>` : ''}</button>`
                : '';
            const planBox = `<td><input type="number" step="0.01" min="0" data-l="zones" data-i="${i}" data-k="planM2" data-help-key="layoutZonePlanM2" value="${z.planM2 > 0 ? z.planM2 : ''}"${dis ? ' disabled' : ''}></td>`;
            // Uso de la zona (aparte del tipo): almacenamiento, operaciones o instalaciones. Se puede dejar sin definir.
            const useOptions = `<option value=""${z.use ? '' : ' selected'}>${esc(t('main.layoutUsoSinDefinir'))}</option>${optionsHtml('use', LC.ZONE_USES, z.use)}`;
            const useBox = `<td><select data-l="zones" data-i="${i}" data-k="use" data-help-key="layoutZoneUse"${dis ? ' disabled' : ''}>${useOptions}</select></td>`;
            return `<tr class="${z.active === false ? 'layout-off' : ''}">${cellText('zones', i, 'name', z.name, dis)}${cellSelect('zones', i, 'type', typeOptions, dis)}${useBox}${position}<td class="layout-calc"><span data-zone-area="${i}">${fmt(LC.zoneArea(z))} m²</span><div data-zone-chips="${i}">${zoneChipsHtml(z)}</div></td>${planBox}${saved ? savedRowButtons('zones', i, z.active, dis, fmtButton + catButton + shapeButton) : removeCell('zones', i, dis, fmtButton + catButton + shapeButton)}</tr>`;
        });
        return `${table(['main.layoutNombre', 'main.layoutTipo', 'main.layoutUsoZona', 'main.layoutX', 'main.layoutY', 'main.layoutLargo', 'main.layoutAncho', 'main.layoutSuperficie', 'main.layoutPlanM2', ''], rows, 'layout-zonas')}<div class="layout-sidesbar">${addButton('zones', 'main.layoutAgregarZona', dis)}${addButton('zonesFree', 'main.layoutAgregarZonaLibre', dis)}</div>${zoneSidesPanelHtml(dis)}${zoneCatsPanelHtml(dis)}`;
    }
    const zoneOptions = (selected) => `<option value="">—</option>${d.zones.map((z) => `<option value="${esc(z.id)}"${z.id === selected ? ' selected' : ''}>${esc(z.name)}</option>`).join('')}`;
    const rows = d.spaces.map((s, i) => {
        const saved = isSavedRow('spaces', s.id);
        return `<tr class="${s.active === false ? 'layout-off' : ''}">${cellSelect('spaces', i, 'type', optionsHtml('space', LC.SPACE_TYPES, s.type), dis)}${cellText('spaces', i, 'code', s.code, dis)}${cellSelect('spaces', i, 'zoneId', zoneOptions(s.zoneId), dis)}${cellNum('spaces', i, 'x', s.x, dis)}${cellNum('spaces', i, 'y', s.y, dis)}${cellNum('spaces', i, 'l', s.l, dis)}${cellNum('spaces', i, 'd', s.d, dis)}${cellNum('spaces', i, 'h', s.h, dis)}${cellNum('spaces', i, 'levels', s.levels, dis, '1')}${cellNum('spaces', i, 'slots', s.slots || 1, dis, '1')}${cellText('spaces', i, 'drawers', s.drawers, dis)}<td class="layout-calc" data-space-calc="${i}">${fmt(s.l * s.d)} m² · ${fmt(s.l * s.d * s.h)} m³</td>${saved ? savedRowButtons('spaces', i, s.active, dis) : removeCell('spaces', i, dis)}</tr>`;
    });
    return `${table(['main.layoutTipo', 'main.layoutCodigo', 'main.layoutZona', 'main.layoutX', 'main.layoutY', 'main.layoutLargo', 'main.layoutFondo', 'main.layoutAlto', 'main.layoutNiveles', 'main.layoutEspaciosNivel', 'main.layoutCajones', 'main.layoutHuellaVolumen', ''], rows)}${addButton('spaces', 'main.layoutAgregarEspacio', dis)}`;
}

// Los pasos son capas del croquis: se pueden tener activos varios a la vez y el croquis muestra siempre la nave más lo de los pasos activos. Abajo solo sale el formulario del
// paso enfocado (el último que se tocó): al tocar Puertas, abajo solo se edita Puertas.
const stepOn = (step) => state.steps.includes(step);
function focusStep(step) {
    state.focus = step;
    state.focusStack = [...state.focusStack.filter((x) => x !== step), step];
}
function showStep(step) { if (!stepOn(step)) state.steps = [...state.steps, step]; focusStep(step); }
function pressStep(step) {
    if (!stepOn(step)) { showStep(step); return; }
    if (state.focus !== step) { focusStep(step); return; }
    if (state.steps.length < 2) return; // siempre queda al menos un paso
    state.steps = state.steps.filter((x) => x !== step);
    state.focusStack = state.focusStack.filter((x) => x !== step);
    const next = [...state.focusStack].reverse().find(stepOn) || state.steps[0];
    focusStep(next);
}
function renderPanel() {
    const tabs = SECTION_ORDER.map((s) => `<button type="button" role="button" aria-pressed="${stepOn(s)}" aria-current="${s === state.focus}" class="layout-step${stepOn(s) ? ' active' : ''}${s === state.focus ? ' focus' : ''}" data-step="${s}">${esc(t(SECTION_LABEL_KEYS[s]))}</button>`).join('');
    const s = state.focus;
    const level = sectionLevel(s);
    const locked = !canEdit(s);
    const section = `<div class="layout-section" data-help-key="layoutSec_${s}">
        <div class="layout-section-head"><h3>${esc(t(SECTION_LABEL_KEYS[s]))}</h3>${locked ? `<span class="layout-lock" data-help-key="layoutLocked"><i class="bx bx-lock-alt" aria-hidden="true"></i> ${esc(t(level === 'solo-ver' ? 'main.layoutSoloVer' : 'main.layoutYaLlena'))}</span>` : ''}</div>
        ${stepHtml(s)}
    </div>`;
    $('layout-panel').innerHTML = `<div class="layout-steps" role="group" data-help-key="layoutSteps">${tabs}</div>${section}`;
    bindLayoutFilters();
}

// ---- croquis -----------------------------------------------------------------------------------------------------------
const ZONE_CLASS = { dry: 'lz-dry', cold: 'lz-cold', chemical: 'lz-chem', finished: 'lz-fin', dock: 'lz-dock', office: 'lz-office', aisle: 'lz-aisle', aisle2: 'lz-aisle2' };
function renderSvg() {
    const d = state.draft;
    const on = stepOn;
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
    view = { sc, W };
    // Los pasillos van sombreados con rayas (principal: rayas; entre anaqueles: puntos).
    let s = '<defs><pattern id="lh-main" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="var(--color-surface)"/><line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-text-secondary)" stroke-width="2.4" opacity="0.4"/></pattern><pattern id="lh-between" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="var(--color-surface)"/><circle cx="3" cy="3" r="1.15" fill="var(--color-text-secondary)" opacity="0.5"/></pattern></defs>';
    if (state.planImage && d.plan) s += `<image href="${state.planImage}" x="${X(0)}" y="${Y(0)}" width="${d.plan.widthM * sc}" height="${d.plan.widthM * state.planAspect * sc}" opacity="0.55" preserveAspectRatio="none"/>`;
    // El nombre y los m² de cada zona se dibujan al final (encima de anaqueles y paredes) y en la esquina de la zona que no tape ningún espacio; las zonas que no son
    // rectángulos llevan el nombre en el punto más holgado de adentro. La medida real de cada lado se escribe adentro de la zona.
    let zoneLabels = '';
    let measureLabels = '';
    const draggable = canEdit('zonas');
    const measureText = (pts, minPx) => LC.sideMeasures(pts, false).filter((m) => m.len * sc >= minPx && !LC.onPolygonEdge(m.mx, m.my, d.vertices)).map((m) => `<text class="lm" x="${(X(m.mx) + m.nx * 9).toFixed(1)}" y="${(Y(m.my) + m.ny * 9 + 3).toFixed(1)}" text-anchor="middle">${fmt(m.len)}</text>`).join('');
    (on('zonas') ? d.zones : []).forEach((z) => {
        const typeText = z.type ? typeLabel('zone', z.type) : t('main.layoutSinZona');
        const cls = `lz ${z.type ? (ZONE_CLASS[z.type] || 'lz-dock') : 'lz-none'}${z.active === false ? ' lz-off' : ''}${state.open.zones[z.id] ? ' lz-warn' : ''}${draggable ? ' lz-drag' : ''}`;
        const title = `<title>${esc(z.name)} · ${esc(typeText)}</title>`;
        if (Array.isArray(z.pts)) {
            if (z.pts.length >= 3) {
                s += z.fmt
                    ? `<g class="lzf${z.active === false ? ' lz-off' : ''}${draggable ? ' lz-drag' : ''}" data-zid="${esc(z.id)}">${window.LayoutMapSvg.zonePaint(`ef-${z.id}`, z.fmt).markup(z.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' '))}${title}</g>`
                    : `<polygon class="${cls}" data-zid="${esc(z.id)}" points="${z.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}">${title}</polygon>`;
                const a = LC.zoneLabelAnchor(z);
                zoneLabels += `<text class="lt" x="${X(a.x)}" y="${Y(a.y) - 1}" text-anchor="middle">${esc(z.name)}</text>${state.showArea ? `<text class="lt2" x="${X(a.x)}" y="${Y(a.y) + 10}" text-anchor="middle">${fmt(LC.zoneArea(z))} m²</text>` : ''}`;
                if (z.active !== false && Math.min(z.l, z.w) * sc >= 44) measureLabels += measureText(z.pts, 30);
            } else if (z.pts.length) {
                if (z.pts.length > 1) s += `<polyline class="lz-open" points="${z.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}"/>`;
                s += `<circle class="lv" cx="${X(z.pts[0][0])}" cy="${Y(z.pts[0][1])}" r="4"/>`;
            }
            return;
        }
        s += z.fmt
            ? `<g class="lzf${z.active === false ? ' lz-off' : ''}${draggable ? ' lz-drag' : ''}" data-zid="${esc(z.id)}">${window.LayoutMapSvg.zonePaint(`ef-${z.id}`, z.fmt).markup(LC.zonePoints(z).map((p) => `${X(p[0])},${Y(p[1])}`).join(' '))}${title}</g>`
            : `<rect class="${cls}" data-zid="${esc(z.id)}" x="${X(z.x)}" y="${Y(z.y)}" width="${z.l * sc}" height="${z.w * sc}" rx="4">${title}</rect>`;
        const spot = LC.zoneLabelSpot(z, d.spaces, sc);
        const tx = spot.right ? X(z.x + z.l) - 5 : X(z.x) + 5;
        const ty = spot.bottom ? Y(z.y + z.w) - (z.w * sc > 26 ? 17 : 5) : Y(z.y) + 12;
        const anchor = spot.right ? 'end' : 'start';
        zoneLabels += `<text class="lt" x="${tx}" y="${ty}" text-anchor="${anchor}">${esc(z.name)}</text>`;
        if (state.showArea && z.w * sc > 26) zoneLabels += `<text class="lt2" x="${tx}" y="${ty + 11}" text-anchor="${anchor}">${fmt(z.l * z.w)} m²</text>`;
        if (z.active !== false && Math.min(z.l, z.w) * sc >= 44) measureLabels += measureText(LC.zonePoints(z), 30);
    });
    s += `<polygon class="lw" points="${d.vertices.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}"/>`;
    (on('contorno') ? d.obstacles : []).forEach((o) => { s += `<rect class="lo" x="${X(o.x)}" y="${Y(o.y)}" width="${Math.max(o.l * sc, 3)}" height="${Math.max(o.w * sc, 3)}"><title>${esc(o.name)}</title></rect>`; });
    (on('espacios') ? d.spaces : []).forEach((sp) => {
        const w = Math.max(sp.l * sc, 4);
        const h = Math.max(sp.d * sc, 4);
        s += `<rect class="ls ls-${sp.type}${sp.active === false ? ' lz-off' : ''}" x="${X(sp.x)}" y="${Y(sp.y)}" width="${w}" height="${h}" rx="2"><title>${esc(sp.code)} · ${esc(typeLabel('space', sp.type))}</title></rect>`;
        if (w >= 26 && h >= 9) s += `<text class="lt3" x="${X(sp.x) + w / 2}" y="${Y(sp.y) + h / 2 + 3}" text-anchor="middle">${esc(sp.code)}</text>`;
    });
    s += zoneLabels + (state.showMeasures ? measureLabels : '');
    (on('puertas') ? d.doors : []).forEach((door) => {
        const w = LC.wallSegment(d.vertices, door.wall);
        const a = { x: w.p[0] + w.ux * door.dist, y: w.p[1] + w.uy * door.dist };
        const b = { x: a.x + w.ux * door.width, y: a.y + w.uy * door.width };
        s += `<line class="ld" x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}"><title>${esc(door.name)}</title></line>`;
    });
    (on('luz') ? d.power : []).forEach((e) => {
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
        if (state.showMeasures) s += `<text class="lt2" text-anchor="middle" x="${X(mx) + nx * out * 15}" y="${Y(my) + ny * out * 15 + 3}">P${i} · ${fmt(w.length)} m</text>`;
    }
    d.vertices.forEach((p, i) => { s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.5" class="lv"/>${state.showMeasures ? `<text class="lt2" x="${X(p[0]) + (p[0] <= cx ? -8 : 8)}" y="${Y(p[1]) + (p[1] <= cy ? -7 : 14)}" text-anchor="${p[0] <= cx ? 'end' : 'start'}">${i + 1} · ${fmt(p[2])} m</text>` : ''}`; });
    const bar = 5 * sc;
    s += `<line x1="${M}" y1="${H - 12}" x2="${M + bar}" y2="${H - 12}" class="lscale"/><text class="lt2" x="${M + bar + 6}" y="${H - 8}">5 m</text>`;
    $('layout-svg').innerHTML = s;
}

function renderSummary() {
    const k = LC.computeKpis(state.draft);
    const rows = k.zones.map((z) => `<tr><td>${esc(z.name)}</td><td>${esc(z.type ? typeLabel('zone', z.type) : t('main.layoutSinZona'))}</td><td>${esc(z.use ? typeLabel('use', z.use) : '—')}</td><td>${fmt(z.area)} m²</td><td>${z.spaces}</td><td>${fmt(z.footprint)} m²</td><td>${fmt(z.occupancy, 1)}%</td><td>${fmt(z.volume)} m³</td></tr>`);
    $('layout-summary').innerHTML = rows.length
        ? `<table class="layout-table layout-summary-table"><thead><tr><th>${esc(t('main.layoutZona'))}</th><th>${esc(t('main.layoutTipoZona'))}</th><th>${esc(t('main.layoutUsoZona'))}</th><th>${esc(t('main.layoutSuperficie'))}</th><th>${esc(t('main.layoutEspacios'))}</th><th>${esc(t('main.layoutHuella'))}</th><th>${esc(t('main.layoutOcupacion'))}</th><th>${esc(t('main.layoutVolumen'))}</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
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
    state.draft.zones.forEach((z, i) => {
        const c = document.querySelector(`[data-zone-area="${i}"]`);
        if (c) c.textContent = `${fmt(LC.zoneArea(z))} m²`;
        const chips = document.querySelector(`[data-zone-chips="${i}"]`);
        if (chips) chips.innerHTML = zoneChipsHtml(z);
    });
    document.querySelectorAll('[data-sides-status]').forEach((box) => {
        const key = box.getAttribute('data-sides-status');
        box.innerHTML = sidesStatusHtml(key, !canEdit(key === 'contorno' ? 'contorno' : 'zonas'));
    });
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
// Icono Ver / ocultar medidas: se recuerda en este navegador y solo lo ve quien lo tiene en el árbol.
const MEASURES_KEY = 'sgn_layout_measures';
function updateMeasuresBtn() {
    const btn = $('layout-measures-btn');
    btn.hidden = !(state.perms && state.perms.canToggleMeasures);
    btn.setAttribute('aria-pressed', String(state.showMeasures));
    btn.classList.toggle('off', !state.showMeasures);
    btn.setAttribute('aria-label', t(state.showMeasures ? 'main.layoutMedidasOcultar' : 'main.layoutMedidasVer'));
}
try { state.showMeasures = localStorage.getItem(MEASURES_KEY) !== '0'; } catch (err) { /* sin almacenamiento: se ven */ }
$('layout-measures-btn').addEventListener('click', () => {
    state.showMeasures = !state.showMeasures;
    try { localStorage.setItem(MEASURES_KEY, state.showMeasures ? '1' : '0'); } catch (err) { /* no se recuerda */ }
    updateMeasuresBtn();
    if (state.draft) renderSvg();
});
// Icono Ver / ocultar los m² de cada zona: igual que el de medidas (se recuerda en este navegador, solo lo ve quien lo tiene en el árbol y la hoja que se descarga sale como se ve).
const AREA_KEY = 'sgn_layout_area';
function updateAreaBtn() {
    const btn = $('layout-area-btn');
    btn.hidden = !(state.perms && state.perms.canToggleArea);
    btn.setAttribute('aria-pressed', String(state.showArea));
    btn.classList.toggle('off', !state.showArea);
    btn.setAttribute('aria-label', t(state.showArea ? 'main.layoutAreaOcultar' : 'main.layoutAreaVer'));
}
try { state.showArea = localStorage.getItem(AREA_KEY) !== '0'; } catch (err) { /* sin almacenamiento: se ven */ }
$('layout-area-btn').addEventListener('click', () => {
    state.showArea = !state.showArea;
    try { localStorage.setItem(AREA_KEY, state.showArea ? '1' : '0'); } catch (err) { /* no se recuerda */ }
    updateAreaBtn();
    if (state.draft) renderSvg();
});
function showEditor() {
    updateQrMenu();
    updateMeasuresBtn();
    updateAreaBtn();
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
    initEditState();
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
    initEditState();
    state.creating = true;
    state.planImage = '';
    state.planNew = false;
    state.steps = ['contorno'];
    state.focus = 'contorno';
    state.focusStack = ['contorno'];
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
    initEditState();
    state.creating = true;
    state.planImage = state.pendingPlan.url;
    state.planAspect = state.pendingPlan.aspect;
    state.planNew = true;
    state.pendingPlan = null;
    state.steps = ['contorno'];
    state.focus = 'contorno';
    state.focusStack = ['contorno'];
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
    if (state.draft && (el.getAttribute('data-cs') !== null || el.getAttribute('data-zs') !== null)) {
        onSidesEdit(el);
        // elegir o quitar una flecha en diagonal agrega o quita el campo de inclinación de ese renglón
        if (event.type === 'change' && /^dir:/.test(el.getAttribute('data-cs') || el.getAttribute('data-zs'))) renderPanel();
        return;
    }
    if (state.draft && el.getAttribute('data-cat') !== null) { onCategoryEdit(el); return; }
    const list = el.getAttribute('data-l');
    if (!list || !state.draft) return;
    const isNumber = el.type === 'number';
    const value = isNumber ? (parseFloat(el.value) || 0) : el.value;
    if (list === 'siteName') {
        // El Sitio (arriba del nombre de la empresa en el reporte y la tarjeta): sin texto se guarda sin ese campo.
        const site = String(value).trim();
        if (site) state.draft.siteName = site; else delete state.draft.siteName;
    } else if (list === 'allHeights') {
        // Misma altura en todas las esquinas: se escribe una vez y se copia a cada renglón (los renglones ya dibujados se actualizan sin redibujar el formulario).
        if (value > 0) {
            state.draft.vertices.forEach((p, i) => {
                p[2] = value;
                const box = document.querySelector(`[data-l="vertices"][data-i="${i}"][data-k="2"]`);
                if (box) box.value = value;
            });
        }
    } else if (list === 'vertices') {
        state.draft.vertices[Number(el.getAttribute('data-i'))][Number(el.getAttribute('data-k'))] = value;
        state.open.contorno = false;
    } else {
        const row = state.draft[list][Number(el.getAttribute('data-i'))];
        const key = el.getAttribute('data-k');
        if (list === 'zones' && (key === 'ox' || key === 'oy')) {
            // una zona de forma libre se mueve completa desde su primera esquina
            const o = row.pts[0] || [row.x, row.y];
            const dx = key === 'ox' ? value - o[0] : 0;
            const dy = key === 'oy' ? value - o[1] : 0;
            row.pts = row.pts.map((p) => [round2(p[0] + dx), round2(p[1] + dy)]);
            syncZoneBox(row);
        } else if (key === 'planM2') {
            if (value > 0) row.planM2 = value; else delete row.planM2;
        } else if (key === 'use') {
            if (value) row.use = value; else delete row.use; // sin definir = la zona se guarda sin ese campo
        } else if (key === 'slots') {
            const n = Math.max(1, Math.round(value) || 1);
            if (n > 1) row.slots = Math.min(n, LC.LIMITS.slots); else delete row.slots;
        } else row[key] = (key === 'wall' || key === 'levels') ? Math.max(1, Math.round(value) || 1) : value;
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
    if (stepBtn) {
        pressStep(stepBtn.dataset.step);
        renderPanel();
        refreshLive();
        return;
    }
    const cmode = event.target.closest('[data-cmode]');
    if (cmode) { state.contornoMode = cmode.dataset.cmode; renderPanel(); return; }
    const sadd = event.target.closest('[data-sadd]');
    if (sadd) { addSide(sadd.dataset.sadd); renderPanel(); refreshLive(); return; }
    const sdel = event.target.closest('[data-sdel]');
    if (sdel) {
        const v = sdel.dataset.sdel;
        const at = v.lastIndexOf(':');
        removeSide(v.slice(0, at), Number(v.slice(at + 1)));
        renderPanel();
        refreshLive();
        return;
    }
    const sins = event.target.closest('[data-sins]');
    if (sins) {
        const v = sins.dataset.sins;
        const at = v.lastIndexOf(':');
        insertSide(v.slice(0, at), Number(v.slice(at + 1)));
        renderPanel();
        refreshLive();
        return;
    }
    const sclose = event.target.closest('[data-sclose]');
    if (sclose) { closeSides(sclose.dataset.sclose); renderPanel(); refreshLive(); return; }
    const sline = event.target.closest('[data-sline]');
    if (sline) { closeLine(sline.dataset.sline); renderPanel(); refreshLive(); return; }
    const catsZone = event.target.closest('[data-catszone]');
    if (catsZone) { const id = catsZone.dataset.catszone; state.catsOpen = state.catsOpen === id ? null : id; state.catEdit = null; renderPanel(); return; }
    const catAdd = event.target.closest('[data-cat-add]');
    if (catAdd) { const z = state.draft.zones.find((r) => r.id === catAdd.dataset.catAdd); if (z) { addCategory(z); renderPanel(); refreshLive(); } return; }
    const catDel = event.target.closest('[data-cat-del]');
    if (catDel) {
        const z = state.draft.zones.find((r) => (r.categories || []).some((c) => c.id === catDel.dataset.catDel));
        if (z) { z.categories = z.categories.filter((c) => c.id !== catDel.dataset.catDel); if (!z.categories.length) delete z.categories; if (state.catEdit === catDel.dataset.catDel) state.catEdit = null; renderPanel(); refreshLive(); }
        return;
    }
    const catEdit = event.target.closest('[data-cat-edit]');
    if (catEdit) { state.catEdit = state.catEdit === catEdit.dataset.catEdit ? null : catEdit.dataset.catEdit; renderPanel(); return; }
    const catIcon = event.target.closest('[data-cat-icon]');
    const catColor = event.target.closest('[data-cat-color]');
    const catMore = event.target.closest('[data-cat-more]');
    if (catIcon || catColor || catMore) {
        const raw = (catIcon && catIcon.dataset.catIcon) || (catColor && catColor.dataset.catColor) || catMore.dataset.catMore;
        const sep = raw.indexOf(':');
        const id = sep < 0 ? raw : raw.slice(0, sep);
        const value = sep < 0 ? '' : raw.slice(sep + 1);
        const zone = state.draft.zones.find((r) => (r.categories || []).some((c) => c.id === id));
        const cat = zone && zone.categories.find((c) => c.id === id);
        if (!cat) return;
        if (catIcon) { cat.icon = value; renderPanel(); refreshLive(); return; }
        if (catColor) { cat.color = value; renderPanel(); refreshLive(); return; }
        if (window.ColorDialog) window.ColorDialog.open({ title: t('main.layoutCatColor'), currentHex: cat.color, onAccept: (hex) => { cat.color = String(hex).toLowerCase(); renderPanel(); refreshLive(); } });
        return;
    }
    const cardOpen = event.target.closest('[data-card-open]');
    if (cardOpen) { openCardDialog(cardOpen.dataset.cardOpen); return; }
    const fmtZone = event.target.closest('[data-fmtzone]');
    if (fmtZone) { openFmtDialog(Number(fmtZone.dataset.fmtzone)); return; }
    const freeShape = event.target.closest('[data-freeshape]');
    if (freeShape) {
        // Un rectángulo pasa a forma libre con sus 4 esquinas; de ahí se cambian sus lados.
        const z = state.draft.zones[Number(freeShape.dataset.freeshape)];
        z.pts = [[z.x, z.y], [round2(z.x + z.l), z.y], [round2(z.x + z.l), round2(z.y + z.w)], [z.x, round2(z.y + z.w)]];
        delete state.open.zones[z.id];
        state.zoneOpen = z.id;
        renderPanel();
        refreshLive();
        return;
    }
    const sidesOpen = event.target.closest('[data-sidesopen]');
    if (sidesOpen) { state.zoneOpen = state.zoneOpen === sidesOpen.dataset.sidesopen ? null : sidesOpen.dataset.sidesopen; renderPanel(); return; }
    const filterClear = event.target.closest('[data-filter-clear]');
    if (filterClear) { Dashboard.clearExternalColumnFilters(filterClear.dataset.filterClear); return; }
    if (event.target.closest('[data-add="zonesFree"]')) {
        clearLayoutFilters();
        // Zona nueva de forma libre: solo su primera esquina; sus lados se escriben después. Empieza sin zona asignada.
        const xs = state.draft.vertices.map((p) => p[0]);
        const ys = state.draft.vertices.map((p) => p[1]);
        const x = round2(Math.min(...xs) + 1);
        const y = round2(Math.min(...ys) + 1);
        const z = { id: uid('z'), name: `${t('main.layoutZona')} ${state.draft.zones.length + 1}`, type: '', x, y, l: 0, w: 0, pts: [[x, y]], active: true };
        state.draft.zones.push(z);
        state.open.zones[z.id] = true;
        state.zoneOpen = z.id;
        renderPanel();
        refreshLive();
        return;
    }
    const add = event.target.closest('[data-add]');
    if (add) {
        const list = add.dataset.add;
        if (list === 'zones') clearLayoutFilters();
        state.draft[list].push(ROW_FACTORY[list]());
        if (list === 'vertices') state.open.contorno = false;
        renderPanel();
        refreshLive();
        return;
    }
    const del = event.target.closest('[data-del]');
    if (del) {
        const [list, index] = del.dataset.del.split(':');
        const removed = state.draft[list].splice(Number(index), 1)[0];
        if (list === 'zones' && removed) { delete state.open.zones[removed.id]; if (state.zoneOpen === removed.id) state.zoneOpen = null; if (state.catsOpen === removed.id) state.catsOpen = null; }
        if (list === 'vertices') {
            state.open.contorno = false;
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
            if (list === 'zones') { delete state.open.zones[row.id]; if (state.zoneOpen === row.id) state.zoneOpen = null; if (state.catsOpen === row.id) state.catsOpen = null; }
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

// ---- formato de la zona (color, rayas y borde, como Formato de celdas de Excel) -------------------------------------------------------
// El icono de paleta de cada zona abre esta ventana: pestaña Relleno (color de fondo, rayas o patrón y su color) y pestaña Borde (estilo de línea y color), con vista previa.
// Los colores se eligen con la misma ventana "Colores" de los árboles (ColorDialog.js). Nada cambia en la zona hasta pulsar Aceptar. Sin formato propio, la zona usa el
// color de su tipo; "Quitar formato" la regresa ahí.
const FMT_PATTERNS = ['none', 'solid', 'diag1', 'diag2', 'horiz', 'vert', 'grid', 'dots', 'cross'];
const FMT_LINES = ['none', 'thin', 'mid', 'thick', 'dash', 'dot', 'dashdot', 'double'];
const FMT_LINE_SAMPLE = { none: [0, ''], thin: [1.2, ''], mid: [2.4, ''], thick: [4, ''], dash: [2, '8 5'], dot: [2.4, '1.5 4'], dashdot: [2, '9 4 2 4'] };
let fmtDialog = null; // { zoneId, draft, start, tab, hadFmt }
let fmtModalEl = null;
const pickFmt = (o) => ({ fill: o.fill, pattern: o.pattern, pcolor: o.pcolor, line: o.line, bcolor: o.bcolor });

function fmtThumb(pattern, d) {
    const paint = window.LayoutMapSvg.zonePaint(`fth-${pattern}`, { fill: d.fill, pattern, pcolor: d.pcolor, line: 'thin', bcolor: '#8e94ab' });
    return `<svg width="46" height="30" viewBox="0 0 46 30" aria-hidden="true">${paint.markup('1,1 45,1 45,29 1,29')}</svg>`;
}
function fmtLineSample(id) {
    if (id === 'none') return '<svg viewBox="0 0 96 12" aria-hidden="true"><text x="0" y="10" font-size="9" fill="currentColor">—</text></svg>';
    if (id === 'double') return '<svg viewBox="0 0 96 12" aria-hidden="true"><line x1="2" y1="3.5" x2="94" y2="3.5" stroke="currentColor" stroke-width="1.3"/><line x1="2" y1="8.5" x2="94" y2="8.5" stroke="currentColor" stroke-width="1.3"/></svg>';
    const [w, dash] = FMT_LINE_SAMPLE[id];
    return `<svg viewBox="0 0 96 12" aria-hidden="true"><line x1="2" y1="6" x2="94" y2="6" stroke="currentColor" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linecap="${id === 'dot' ? 'round' : 'butt'}"/></svg>`;
}
function fmtColorButton(key, hex, disabled) {
    return `<button type="button" class="layout-fmt-color" data-fcolor="${key}" data-help-key="layoutFmtColor"${disabled ? ' disabled' : ''}><span class="layout-fmt-swatch" style="background:${esc(hex)}"></span>${esc(t('main.layoutElegirColor'))}</button><span class="layout-muted">${esc(hex.toUpperCase())}</span>`;
}
function renderFmtBody() {
    const d = fmtDialog.draft;
    let left;
    if (fmtDialog.tab === 'fill') {
        const none = d.pattern === 'none';
        const plain = none || d.pattern === 'solid';
        left = `<div><h4>${esc(t('main.layoutColorFondo'))}</h4><div class="layout-fmt-row">${fmtColorButton('fill', d.fill, none)}</div>
            <h4>${esc(t('main.layoutRayasPatrones'))}</h4>
            <div class="layout-fmt-patterns" data-help-key="layoutFmtPattern">${FMT_PATTERNS.map((p) => `<button type="button" class="layout-fmt-pat" data-fpat="${p}" aria-pressed="${d.pattern === p}">${fmtThumb(p, d)}<span>${esc(t(`main.layoutPat_${p}`))}</span></button>`).join('')}</div>
            <h4>${esc(t('main.layoutColorRayas'))}</h4><div class="layout-fmt-row">${fmtColorButton('pcolor', d.pcolor, plain)}${plain ? `<span class="layout-muted">${esc(t('main.layoutElegirPatron'))}</span>` : ''}</div></div>`;
    } else {
        left = `<div><h4>${esc(t('main.layoutEstiloLinea'))}</h4>
            <div class="layout-fmt-lines" data-help-key="layoutFmtLine">${FMT_LINES.map((l) => `<button type="button" class="layout-fmt-line" data-fline="${l}" aria-pressed="${d.line === l}">${fmtLineSample(l)}<span>${esc(t(`main.layoutLine_${l}`))}</span></button>`).join('')}</div>
            <h4>${esc(t('main.layoutColorBorde'))}</h4><div class="layout-fmt-row">${fmtColorButton('bcolor', d.bcolor, d.line === 'none')}</div></div>`;
    }
    const paint = window.LayoutMapSvg.zonePaint('fpv', d);
    const shape = '30,20 200,20 200,70 130,70 130,130 30,130';
    const zone = state.draft.zones.find((z) => z.id === fmtDialog.zoneId);
    const preview = `<div class="layout-fmt-preview"><h4>${esc(t('main.layoutVistaPrevia'))}</h4><svg viewBox="0 0 230 150" role="img" aria-label="${esc(t('main.layoutVistaPrevia'))}">${paint.markup(shape)}<text class="lt" x="80" y="92" text-anchor="middle">${esc(fmtDialog.name || (zone && zone.name) || '')}</text></svg></div>`;
    $('layout-fmt-body').innerHTML = `${left}${preview}`;
    document.querySelectorAll('[data-ftab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ftab === fmtDialog.tab)));
}
function ensureFmtModal() {
    if (fmtModalEl) return;
    fmtModalEl = document.createElement('div');
    fmtModalEl.className = 'modal-overlay';
    fmtModalEl.hidden = true;
    fmtModalEl.innerHTML = `<div class="modal-panel layout-fmt-dialog" role="dialog" aria-modal="true" aria-labelledby="layout-fmt-title">
        <h3 id="layout-fmt-title">${esc(t('main.layoutFormatoZona'))}</h3>
        <div class="layout-fl"><label>${esc(t('main.layoutNombre'))}<input type="text" id="layout-fmt-name" maxlength="${LC.LIMITS.text}"></label></div>
        <div class="layout-fmt-tabs" role="tablist"><button type="button" role="tab" data-ftab="fill" aria-selected="true">${esc(t('main.layoutFormatoRelleno'))}</button><button type="button" role="tab" data-ftab="border" aria-selected="false">${esc(t('main.layoutFormatoBorde'))}</button></div>
        <div class="layout-fmt-body" id="layout-fmt-body"></div>
        <div class="layout-fmt-footer"><button type="button" class="btn btn-secondary" id="layout-fmt-reset" data-help-key="layoutFmtReset">${esc(t('main.layoutQuitarFormato'))}</button><span class="layout-fmt-spacer"></span><button type="button" class="btn btn-secondary" id="layout-fmt-cancel">${esc(t('main.layoutFormatoCancelar'))}</button><button type="button" class="btn" id="layout-fmt-ok">${esc(t('main.layoutFormatoAceptar'))}</button></div>
    </div>`;
    document.body.appendChild(fmtModalEl);
    fmtModalEl.addEventListener('click', (event) => {
        if (event.target === fmtModalEl) { closeFmtDialog(); return; }
        const tabBtn = event.target.closest('[data-ftab]');
        if (tabBtn) { fmtDialog.tab = tabBtn.dataset.ftab; renderFmtBody(); return; }
        const pat = event.target.closest('[data-fpat]');
        if (pat) { fmtDialog.draft.pattern = pat.dataset.fpat; renderFmtBody(); return; }
        const line = event.target.closest('[data-fline]');
        if (line) { fmtDialog.draft.line = line.dataset.fline; renderFmtBody(); return; }
        const color = event.target.closest('[data-fcolor]');
        if (color && !color.disabled) {
            const key = color.dataset.fcolor;
            const title = t(key === 'fill' ? 'main.layoutColorFondo' : key === 'pcolor' ? 'main.layoutColorRayas' : 'main.layoutColorBorde');
            if (window.ColorDialog) window.ColorDialog.open({ title, currentHex: fmtDialog.draft[key], onAccept: (hex) => { fmtDialog.draft[key] = String(hex).toLowerCase(); renderFmtBody(); } });
            return;
        }
        if (event.target.closest('#layout-fmt-cancel')) { closeFmtDialog(); return; }
        if (event.target.closest('#layout-fmt-reset')) {
            const z = state.draft.zones.find((r) => r.id === fmtDialog.zoneId);
            if (z) { delete z.fmt; const nm = ($('layout-fmt-name').value || '').trim(); if (nm) z.name = nm; }
            closeFmtDialog();
            renderPanel();
            refreshLive();
            return;
        }
        if (event.target.closest('#layout-fmt-ok')) {
            const z = state.draft.zones.find((r) => r.id === fmtDialog.zoneId);
            if (z) {
                const nm = ($('layout-fmt-name').value || '').trim();
                if (nm) z.name = nm;
                // si no cambió nada de lo que traía (o de lo que ya se veía por su tipo), la zona no recibe formato propio
                if (z.fmt || JSON.stringify(fmtDialog.draft) !== JSON.stringify(fmtDialog.start)) z.fmt = { ...fmtDialog.draft };
            }
            closeFmtDialog();
            renderPanel();
            refreshLive();
        }
    });
    fmtModalEl.addEventListener('input', (event) => {
        if (event.target.id === 'layout-fmt-name' && fmtDialog) { fmtDialog.name = event.target.value; renderFmtBody(); }
    });
}
function openFmtDialog(zoneIndex) {
    const z = state.draft.zones[zoneIndex];
    if (!z) return;
    ensureFmtModal();
    const base = z.fmt ? pickFmt(z.fmt) : window.LayoutMapSvg.defaultFmt(z.type);
    fmtDialog = { zoneId: z.id, draft: { ...base }, start: { ...base }, tab: 'fill', name: z.name };
    $('layout-fmt-name').value = z.name;
    fmtModalEl.hidden = false;
    renderFmtBody();
}
function closeFmtDialog() {
    if (fmtModalEl) fmtModalEl.hidden = true;
    fmtDialog = null;
}
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && fmtDialog && !document.querySelector('.modal-overlay:not([hidden]) .perm-tree-color-dialog')) closeFmtDialog(); });

// ---- tarjeta de categorías de una zona (para imprimir, con el QR de cada categoría) ---------------------------------------------------------
// Se arma con lo ÚLTIMO GUARDADO (GET /api/business/layout/categories-qr). Tiene la misma medida libre (ancho y largo en cm) y línea punteada para recortar que la hoja del Layout;
// por omisión mide 10.5 × 14.8 cm. Los QR llevan la dirección fija del Layout con la zona y la categoría: no cambian nunca y ahí aparecerán los códigos cuando se agreguen.
const CARD_SIZE_KEY = 'sgn_layout_card_size';
const cardSize = { w: 10.5, h: 14.8, cut: true };
try {
    const raw = JSON.parse(localStorage.getItem(CARD_SIZE_KEY) || 'null');
    if (raw && raw.w >= 6 && raw.w <= 120 && raw.h >= 6 && raw.h <= 120) { cardSize.w = raw.w; cardSize.h = raw.h; cardSize.cut = raw.cut !== false; }
} catch (err) { /* sin almacenamiento */ }
let cardState = null; // { zoneId, zoneName, data }
let cardModalEl = null;
function cardLabels() {
    return { cardArea: t('main.layoutTarjetaArea'), cardCategory: t('main.layoutTarjetaCategoria'), cardReview: t('main.layoutTarjetaRevisame'), cardFooter: t('main.layoutTarjetaPie'), cardEmpty: t('main.layoutCatVacia'), cutCaption: t('main.layoutHojaRecorte') };
}
function cardSvg() {
    const data = cardState.data;
    const zone = (data.zones || []).find((z) => z.id === cardState.zoneId);
    return window.LayoutSheet.buildCardSvg({
        companyName: data.companyName, siteName: data.siteName || '', logoDataUrl: data.logoDataUrl, logoRatio: cardState.logoRatio, theme: window.LayoutMapSvg.theme(data.companyColor), zoneName: cardState.zoneName, categories: zone ? zone.categories : [],
    }, cardLabels(), { widthCm: cardSize.w, heightCm: cardSize.h, cut: cardSize.cut });
}
function renderCardPreview() {
    if (!cardState) return;
    $('layout-card-preview').innerHTML = cardSvg();
    const page = window.LayoutSheet.pageFor(cardSize.w, cardSize.h, cardSize.cut);
    const archivo = page.small ? `${t(`main.layoutHojaPag_${page.name}`)} (${fmt(page.w, 1)} × ${fmt(page.h, 1)} cm)` : t('main.layoutHojaMismo').replace('{w}', fmt(cardSize.w, 1)).replace('{h}', fmt(cardSize.h, 1));
    $('layout-card-info').innerHTML = `<span>${esc(t('main.layoutHojaEspacio'))}: <b>${fmt(cardSize.w, 1)} × ${fmt(cardSize.h, 1)} cm</b></span><span>${esc(t('main.layoutHojaArchivo'))}: <b>${esc(archivo)}</b></span>`;
    document.querySelectorAll('#layout-card-modal [data-cpre]').forEach((b) => {
        const p = window.LayoutSheet.PRESETS.find((x) => x[0] === b.dataset.cpre);
        b.setAttribute('aria-pressed', String(!!p && Math.abs(p[1] - cardSize.w) < 0.05 && Math.abs(p[2] - cardSize.h) < 0.05));
    });
}
function saveCardSize() {
    try { localStorage.setItem(CARD_SIZE_KEY, JSON.stringify({ w: cardSize.w, h: cardSize.h, cut: cardSize.cut })); } catch (err) { /* no se recuerda */ }
}
function ensureCardModal() {
    if (cardModalEl) return;
    cardModalEl = document.createElement('div');
    cardModalEl.className = 'modal-overlay';
    cardModalEl.id = 'layout-card-modal';
    cardModalEl.hidden = true;
    const presets = window.LayoutSheet.PRESETS.map(([id]) => `<button type="button" class="layout-pre" data-cpre="${id}" aria-pressed="false">${esc(t(`main.layoutHojaPre_${id}`))}</button>`).join('');
    cardModalEl.innerHTML = `<div class="modal-panel layout-card-dialog" role="dialog" aria-modal="true" aria-labelledby="layout-card-title">
        <h3 id="layout-card-title"></h3>
        <div class="layout-sizebar layout-card-bar" data-help-key="layoutSheetSize"><div class="layout-sizebar-row"><span class="layout-sizebar-title">${esc(t('main.layoutHojaTamano'))}</span><div class="layout-presets" role="group">${presets}</div></div>
            <div class="layout-sizebar-row"><label>${esc(t('main.layoutHojaAncho'))}<input type="number" id="layout-card-w" min="6" max="120" step="0.1" value="${cardSize.w}"></label><label>${esc(t('main.layoutHojaLargo'))}<input type="number" id="layout-card-h" min="6" max="120" step="0.1" value="${cardSize.h}"></label><button type="button" class="btn btn-secondary" id="layout-card-swap">${esc(t('main.layoutHojaGirar'))}</button><label class="layout-check"><input type="checkbox" id="layout-card-cut"${cardSize.cut ? ' checked' : ''}> ${esc(t('main.layoutHojaLinea'))}</label></div>
            <div class="layout-sizebar-info" id="layout-card-info"></div></div>
        <div class="layout-sheet-preview layout-card-preview" id="layout-card-preview"></div>
        <div class="layout-fmt-footer"><button type="button" class="btn" id="layout-card-pdf" data-help-key="layoutQrPdf">${esc(t('main.layoutDescargarPdf'))}</button><button type="button" class="btn btn-secondary" id="layout-card-png" data-help-key="layoutQrPng">${esc(t('main.layoutDescargarPng'))}</button><span class="layout-fmt-spacer"></span><button type="button" class="btn btn-secondary" id="layout-card-close">${esc(t('main.layoutFormatoCerrar'))}</button></div>
    </div>`;
    document.body.appendChild(cardModalEl);
    cardModalEl.addEventListener('click', async (event) => {
        if (event.target === cardModalEl || event.target.closest('#layout-card-close')) { closeCardDialog(); return; }
        const pre = event.target.closest('[data-cpre]');
        if (pre) {
            const p = window.LayoutSheet.PRESETS.find((x) => x[0] === pre.dataset.cpre);
            cardSize.w = p[1]; cardSize.h = p[2];
        } else if (event.target.closest('#layout-card-swap')) {
            [cardSize.w, cardSize.h] = [cardSize.h, cardSize.w];
        } else if (event.target.closest('#layout-card-pdf') || event.target.closest('#layout-card-png')) {
            const pdf = !!event.target.closest('#layout-card-pdf');
            try {
                const svg = cardSvg();
                const blob = pdf ? await window.LayoutSheet.renderPdf(svg) : await window.LayoutSheet.renderPng(svg);
                window.LayoutSheet.saveBlob(blob, `Categorias_${slug(cardState.zoneName)}_${new Date().toISOString().slice(0, 10)}.${pdf ? 'pdf' : 'png'}`);
                Dashboard.showToast(t('main.layoutDescargaLista'), 'success');
            } catch (err) {
                console.error('Layout: la tarjeta no se pudo descargar', err);
                Dashboard.showToast(t('main.layoutDescargaError'), 'error');
            }
            return;
        } else return;
        $('layout-card-w').value = cardSize.w;
        $('layout-card-h').value = cardSize.h;
        saveCardSize();
        renderCardPreview();
    });
    cardModalEl.addEventListener('input', (event) => {
        if (event.target.id === 'layout-card-w' || event.target.id === 'layout-card-h') {
            const v = parseFloat(event.target.value);
            if (!(v >= 6 && v <= 120)) return;
            if (event.target.id === 'layout-card-w') cardSize.w = v; else cardSize.h = v;
        } else if (event.target.id === 'layout-card-cut') cardSize.cut = event.target.checked;
        else return;
        saveCardSize();
        renderCardPreview();
    });
}
async function openCardDialog(zoneId) {
    const zone = state.draft.zones.find((z) => z.id === zoneId);
    if (!zone) return;
    if (isDirty() || !isSavedRow('zones', zone.id)) { Dashboard.showToast(t('main.layoutTarjetaGuardar'), 'warning'); return; }
    const res = await fetch('/api/business/layout/categories-qr', { credentials: 'include' });
    if (res.status === 403) { Dashboard.showToast(t('main.layoutQrSinPermiso'), 'warning'); return; }
    if (!res.ok) { Dashboard.showToast(t('main.layoutDescargaError'), 'error'); return; }
    ensureCardModal();
    const cardData = await res.json();
    cardState = { zoneId, zoneName: zone.name, data: cardData, logoRatio: await logoRatioOf(cardData.logoDataUrl) };
    $('layout-card-title').textContent = t('main.layoutTarjetaDe').replace('{name}', zone.name);
    cardModalEl.hidden = false;
    renderCardPreview();
}
function closeCardDialog() {
    if (cardModalEl) cardModalEl.hidden = true;
    cardState = null;
}
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && cardState) closeCardDialog(); });

// ---- acomodar una zona arrastrándola sobre el croquis ------------------------------------------------------------------------------
// Se arrastra cualquier zona (rectángulo o de forma libre) con el dedo o el mouse; al soltarla cerca de una zona vecina o del contorno se pega a su lado (a menos de 0.3 m).
const SNAP_M = 0.3;
function translateFrom(start, z, dx, dy) {
    if (Array.isArray(start.pts)) { z.pts = start.pts.map((p) => [round2(p[0] + dx), round2(p[1] + dy)]); syncZoneBox(z); } else { z.x = round2(start.x + dx); z.y = round2(start.y + dy); }
}
$('layout-svg').addEventListener('pointerdown', (event) => {
    const el = event.target.closest('[data-zid]');
    if (!el || !state.draft || !canEdit('zonas')) return;
    const z = state.draft.zones.find((r) => r.id === el.getAttribute('data-zid'));
    if (!z) return;
    drag = { id: z.id, px: event.clientX, py: event.clientY, start: clone(z), moved: false };
    event.preventDefault();
});
window.addEventListener('pointermove', (event) => {
    if (!drag || !view || !state.draft) return;
    const z = state.draft.zones.find((r) => r.id === drag.id);
    if (!z) { drag = null; return; }
    const rect = $('layout-svg').getBoundingClientRect();
    const k = view.W / rect.width / view.sc;
    let dx = (event.clientX - drag.px) * k;
    let dy = (event.clientY - drag.py) * k;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 0.2) return;
    drag.moved = true;
    const xs = [];
    const ys = [];
    state.draft.zones.forEach((o) => { if (o.id !== z.id && o.active !== false) { xs.push(o.x, o.x + o.l); ys.push(o.y, o.y + o.w); } });
    state.draft.vertices.forEach((p) => { xs.push(p[0]); ys.push(p[1]); });
    const snap = (lo, hi, list) => {
        let best = null;
        list.forEach((v) => [lo, hi].forEach((c) => { const d = v - c; if (Math.abs(d) < SNAP_M && (best === null || Math.abs(d) < Math.abs(best))) best = d; }));
        return best === null ? 0 : best;
    };
    const s = drag.start;
    dx += snap(s.x + dx, s.x + s.l + dx, xs);
    dy += snap(s.y + dy, s.y + s.w + dy, ys);
    translateFrom(s, z, round2(dx), round2(dy));
    const i = state.draft.zones.indexOf(z);
    const put = (key, value) => { const box = document.querySelector(`[data-l="zones"][data-i="${i}"][data-k="${key}"]`); if (box) box.value = value; };
    if (Array.isArray(z.pts)) { put('ox', z.pts[0][0]); put('oy', z.pts[0][1]); } else { put('x', z.x); put('y', z.y); }
    refreshLive();
});
window.addEventListener('pointerup', () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved && state.draft) { renderPanel(); refreshLive(); }
});

// ---- guardar / descartar -----------------------------------------------------------------------------------------------
$('layout-save').addEventListener('click', async () => {
    const button = $('layout-save');
    const openShape = firstOpenShape();
    if (openShape) {
        if (openShape.kind === 'contorno') { showStep('contorno'); Dashboard.showToast(t('main.layoutNoCierraContorno'), 'warning'); } else { showStep('zonas'); state.zoneOpen = openShape.zone.id; Dashboard.showToast(t('main.layoutNoCierraZona').replace('{name}', openShape.zone.name), 'warning'); }
        renderPanel();
        return;
    }
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
        const keepSteps = state.steps;
        const keepFocus = state.focus;
        const keepStack = state.focusStack;
        await loadLayout();
        state.steps = keepSteps;
        state.focus = keepFocus;
        state.focusStack = keepStack;
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
    const canLayout = !!(state.perms && state.perms.canUseQr);
    const canZone = !!(state.perms && state.perms.canPrintZone);
    const show = !!((canLayout || canZone) && state.saved && !state.creating);
    $('layout-qrmenu').hidden = !show;
    $('layout-qr-regen').hidden = !(state.perms && state.perms.canRegenerateQr);
    // "Por: Layout | Zona" solo sale si se puede usar de las dos formas; con una sola, el menú abre directo en esa.
    $('layout-qr-by').hidden = !(canLayout && canZone);
    if (!qrBy || (qrBy === 'layout' && !canLayout)) qrBy = canLayout ? 'layout' : 'zone';
    if (qrBy === 'zone' && !canZone) qrBy = 'layout';
    renderQrBy();
    if (!show) closeQrPop();
}

// ---- QR y descarga por Zona ---------------------------------------------------------------------------------------------
// "Por Zona" baja una hoja con las categorías de los códigos que Relación Código tiene en esa zona (de la categoría que se elija: Inventario, Compra…), cada una con cuántos códigos
// hay y su QR. Los QR no cambian nunca (llevan la zona y la categoría por su número); lo que se ve al escanear es lo de ese momento. La hoja es la misma tarjeta de categorías (tamaño
// libre, PDF o imagen). Se arma con lo guardado: la lista sale de la base, no del borrador.
let qrBy = '';
let qrZoneData = null; // lo último que respondió el servidor para la zona y la categoría elegidas
let qrZoneSeq = 0;
const ZONE_CATEGORY_TYPES = [['inventario', 'colArticuloCategoriaInventario'], ['compra', 'colArticuloCategoriaCompra'], ['almacenamiento', 'colArticuloCategoriaAlmacenamiento'], ['rotacion', 'colArticuloCategoriaRotacion'], ['manejo', 'colArticuloCategoriaManejo'], ['riesgo', 'colArticuloCategoriaRiesgo'], ['vidautil', 'colArticuloCategoriaVidautil']];
function renderQrBy() {
    const zone = qrBy === 'zone';
    $('layout-qr-by-layout').classList.toggle('active', !zone);
    $('layout-qr-by-layout').setAttribute('aria-pressed', String(!zone));
    $('layout-qr-by-zone').classList.toggle('active', zone);
    $('layout-qr-by-zone').setAttribute('aria-pressed', String(zone));
    $('layout-qr-pane-layout').hidden = zone;
    $('layout-qr-pane-zone').hidden = !zone;
    if (zone && !$('layout-qr-pop').hidden) loadQrZone(); // con el menú cerrado no se pide nada; se lee al abrirlo
}
function qrZoneOptions() {
    const zones = ((state.saved && state.saved.zones) || []).filter((z) => z.active !== false);
    const select = $('layout-qr-zone');
    const current = select.value;
    select.innerHTML = zones.map((z) => `<option value="${esc(z.id)}">${esc(z.name)}${z.type ? ` · ${esc(typeLabel('zone', z.type))}` : ''}</option>`).join('');
    if (zones.some((z) => z.id === current)) select.value = current;
    const typeSelect = $('layout-qr-type');
    if (!typeSelect.options.length) typeSelect.innerHTML = ZONE_CATEGORY_TYPES.map(([key, label]) => `<option value="${key}">${esc(t(`main.${label}`))}</option>`).join('');
    return zones;
}
function codesText(n) {
    return t(n === 1 ? 'main.layoutZonaCodigosUno' : 'main.layoutZonaCodigos').replace('{n}', fmt(n));
}
async function loadQrZone() {
    const zones = qrZoneOptions();
    const chips = $('layout-qr-chips');
    const fine = $('layout-qr-fine');
    const buttons = ['layout-qr-zone-pdf', 'layout-qr-zone-png'].map($);
    qrZoneData = null;
    buttons.forEach((b) => { b.disabled = true; });
    if (!zones.length) { chips.innerHTML = ''; fine.textContent = t('main.layoutQrZonaSinZonas'); return; }
    const seq = ++qrZoneSeq;
    chips.innerHTML = '';
    fine.textContent = t('main.layoutQrZonaCargando');
    try {
        const res = await fetch(`/api/business/layout/zone-categories?zone=${encodeURIComponent($('layout-qr-zone').value)}&type=${encodeURIComponent($('layout-qr-type').value)}`, { credentials: 'include' });
        if (seq !== qrZoneSeq) return; // se cambió la zona mientras llegaba: vale la última
        if (res.status === 403) { fine.textContent = t('main.layoutQrSinPermiso'); return; }
        if (!res.ok) throw new Error('zone categories failed');
        const data = await res.json();
        qrZoneData = data;
        chips.innerHTML = data.categories.map((c) => `<div class="layout-qr-chip"><i style="background:${esc(LC.categoryLook(c.seed).color)}"></i><span>${esc(c.name)}</span><small>${esc(codesText(c.codes))}</small></div>`).join('');
        const sin = data.without;
        fine.textContent = !data.total ? t('main.layoutQrZonaSinCodigos')
            : !data.categories.length ? t('main.layoutQrZonaNingunaCategoria').replace('{n}', fmt(sin))
                : sin ? t(sin === 1 ? 'main.layoutQrZonaSinCategoriaUno' : 'main.layoutQrZonaSinCategoria').replace('{n}', fmt(sin)) : t('main.layoutQrZonaTodasTienen');
        buttons.forEach((b) => { b.disabled = !data.categories.length; });
    } catch (err) {
        if (seq !== qrZoneSeq) return;
        console.error('Layout: no se pudo leer la lista de la zona', err);
        fine.textContent = t('main.layoutDescargaError');
    }
}
// La hoja de la zona: la misma tarjeta de categorías, con las categorías que salen de los códigos (nombre, cuántos códigos hay, su icono y color de siempre y su QR).
async function openZoneSheetDialog() {
    if (!qrZoneData || !qrZoneData.categories.length) return;
    const data = qrZoneData;
    ensureCardModal();
    const categories = data.categories.map((c) => ({ name: c.name, desc: codesText(c.codes), ...LC.categoryLook(c.seed), qrRows: c.qrRows }));
    cardState = { zoneId: data.zone.id, zoneName: data.zone.name, logoRatio: await logoRatioOf(data.logoDataUrl), data: { companyName: data.companyName, siteName: data.siteName, companyColor: data.companyColor, logoDataUrl: data.logoDataUrl, zones: [{ id: data.zone.id, categories }] } };
    $('layout-card-title').textContent = t('main.layoutTarjetaDe').replace('{name}', data.zone.name);
    cardModalEl.hidden = false;
    renderCardPreview();
}

// ---- el reporte que se descarga: ventana con el tamaño de la hoja ---------------------------------------------------------------------
// "Descargar PDF" (o imagen) abre una ventana donde se elige el tamaño (A3, A4, Carta, Media carta, Tarjeta o el ancho y largo en cm que se quiera), si lleva línea punteada para recortar y
// se ve cómo va a quedar la hoja, ya con lo ÚLTIMO GUARDADO; ahí mismo se baja en PDF o en imagen. Se recuerda la última medida en este navegador. Va con el acceso de Códigos QR.
const SIZE_KEY = 'sgn_layout_sheet_size';
const sheetSize = { w: 42, h: 29.7, cut: true };
try {
    const raw = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null');
    if (raw && raw.w >= 6 && raw.w <= 120 && raw.h >= 6 && raw.h <= 120) { sheetSize.w = raw.w; sheetSize.h = raw.h; sheetSize.cut = raw.cut !== false; }
} catch (err) { /* sin almacenamiento: queda A3 */ }
function saveSheetSize() {
    try { localStorage.setItem(SIZE_KEY, JSON.stringify({ w: sheetSize.w, h: sheetSize.h, cut: sheetSize.cut })); } catch (err) { /* no se recuerda */ }
}
const sheetOptions = () => ({ widthCm: sheetSize.w, heightCm: sheetSize.h, cut: sheetSize.cut });
let sheetModalEl = null;
let sheetDialog = null; // { kind: 'pdf' | 'png', loaded: { data, logoRatio } }

function updateSizeInfo() {
    const info = $('layout-size-info');
    if (!info) return;
    const page = window.LayoutSheet.pageFor(sheetSize.w, sheetSize.h, sheetSize.cut);
    const archivo = page.small
        ? `${t(`main.layoutHojaPag_${page.name}`)} (${fmt(page.w, 1)} × ${fmt(page.h, 1)} cm)`
        : t('main.layoutHojaMismo').replace('{w}', fmt(sheetSize.w, 1)).replace('{h}', fmt(sheetSize.h, 1));
    const orient = sheetSize.w / sheetSize.h >= 1.12 ? t('main.layoutHojaHorizontal') : t('main.layoutHojaVertical');
    const chica = Math.min(sheetSize.w, sheetSize.h) < 13 ? ` · ${t('main.layoutHojaChica')}` : '';
    info.innerHTML = `<span>${esc(t('main.layoutHojaEspacio'))}: <b>${fmt(sheetSize.w, 1)} × ${fmt(sheetSize.h, 1)} cm</b></span><span>${esc(t('main.layoutHojaArchivo'))}: <b>${esc(archivo)}</b></span><span>${esc(orient + chica)}</span>`;
    document.querySelectorAll('#layout-sheet-modal [data-pre]').forEach((b) => {
        const p = window.LayoutSheet.PRESETS.find((x) => x[0] === b.dataset.pre);
        b.setAttribute('aria-pressed', String(!!p && Math.abs(p[1] - sheetSize.w) < 0.05 && Math.abs(p[2] - sheetSize.h) < 0.05));
    });
}

// Lo guardado que trae GET /api/business/layout/qr y la forma del logo (ancho / alto) para darle su lugar en el encabezado sin deformarlo.
const logoRatioOf = (dataUrl) => (dataUrl ? new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1);
    img.onerror = () => resolve(1);
    img.src = dataUrl;
}) : Promise.resolve(1));
async function loadSheetData() {
    const data = await fetchQrData();
    if (!data) return null;
    return { data, logoRatio: await logoRatioOf(data.logoDataUrl) };
}
function buildSheetSvgFrom(loaded) {
    const { data, logoRatio } = loaded;
    return window.LayoutSheet.buildSheetSvg({
        // Sitio: el que se escribe a mano en el Layout (Contorno > Sitio); sin él sale el texto de siempre. Después se llenará de la configuración (aquí es donde se conecta).
        companyName: data.companyName, siteName: data.siteName || t('main.layoutHojaArea'), logoDataUrl: data.logoDataUrl || '', logoRatio, version: data.version, updatedAt: new Date(`${String(data.updatedAt).replace(' ', 'T')}Z`), printedAt: new Date(),
        url: data.url, qrRows: data.qrRows, kpis: data.kpis, theme: window.LayoutMapSvg.theme(data.companyColor),
        // el reporte sale como se ve el croquis ahorita: sus capas activas y las medidas visibles u ocultas
        layout: { ...data.layout, obstacles: (data.extras && data.extras.obstacles) || [], power: (data.extras && data.extras.power) || [] },
        view: { layers: state.steps.slice(), measures: state.showMeasures, area: state.showArea },
    }, sheetLabels(), Dashboard.lang, sheetOptions());
}
function renderSheetPreview() {
    if (!sheetDialog) return;
    $('layout-sheet-preview').innerHTML = buildSheetSvgFrom(sheetDialog.loaded);
}
function ensureSheetModal() {
    if (sheetModalEl) return;
    sheetModalEl = document.createElement('div');
    sheetModalEl.className = 'modal-overlay';
    sheetModalEl.id = 'layout-sheet-modal';
    sheetModalEl.hidden = true;
    const presets = window.LayoutSheet.PRESETS.map(([id]) => `<button type="button" class="layout-pre" data-pre="${id}" aria-pressed="false">${esc(t(`main.layoutHojaPre_${id}`))}</button>`).join('');
    sheetModalEl.innerHTML = `<div class="modal-panel layout-card-dialog" role="dialog" aria-modal="true" aria-labelledby="layout-sheet-title">
        <h3 id="layout-sheet-title">${esc(t('main.layoutDescargarTitulo'))}</h3>
        <div class="layout-sizebar layout-card-bar" data-help-key="layoutSheetSize"><div class="layout-sizebar-row"><span class="layout-sizebar-title">${esc(t('main.layoutHojaTamano'))}</span><div class="layout-presets" role="group" aria-label="${esc(t('main.layoutHojaTamano'))}">${presets}</div></div>
            <div class="layout-sizebar-row"><label>${esc(t('main.layoutHojaAncho'))}<input type="number" id="layout-size-w" min="6" max="120" step="0.1"></label><label>${esc(t('main.layoutHojaLargo'))}<input type="number" id="layout-size-h" min="6" max="120" step="0.1"></label><button type="button" class="btn btn-secondary" id="layout-size-swap">${esc(t('main.layoutHojaGirar'))}</button><label class="layout-check"><input type="checkbox" id="layout-size-cut"> ${esc(t('main.layoutHojaLinea'))}</label></div>
            <div class="layout-sizebar-info" id="layout-size-info"></div></div>
        <div class="layout-sheet-preview layout-card-preview" id="layout-sheet-preview"></div>
        <div class="layout-fmt-footer"><button type="button" class="btn" id="layout-sheet-pdf" data-help-key="layoutQrPdf">${esc(t('main.layoutDescargarPdf'))}</button><button type="button" class="btn btn-secondary" id="layout-sheet-png" data-help-key="layoutQrPng">${esc(t('main.layoutDescargarPng'))}</button><span class="layout-fmt-spacer"></span><button type="button" class="btn btn-secondary" id="layout-sheet-close">${esc(t('main.layoutFormatoCerrar'))}</button></div>
    </div>`;
    document.body.appendChild(sheetModalEl);
    sheetModalEl.addEventListener('click', async (event) => {
        if (event.target === sheetModalEl || event.target.closest('#layout-sheet-close')) { closeSheetDialog(); return; }
        const pre = event.target.closest('[data-pre]');
        if (pre) {
            const p = window.LayoutSheet.PRESETS.find((x) => x[0] === pre.dataset.pre);
            sheetSize.w = p[1]; sheetSize.h = p[2];
        } else if (event.target.closest('#layout-size-swap')) {
            [sheetSize.w, sheetSize.h] = [sheetSize.h, sheetSize.w];
        } else if (event.target.closest('#layout-sheet-pdf') || event.target.closest('#layout-sheet-png')) {
            await downloadSheet(event.target.closest('#layout-sheet-pdf') ? 'pdf' : 'png');
            return;
        } else return;
        $('layout-size-w').value = sheetSize.w;
        $('layout-size-h').value = sheetSize.h;
        saveSheetSize();
        updateSizeInfo();
        renderSheetPreview();
    });
    sheetModalEl.addEventListener('input', (event) => {
        if (event.target.id === 'layout-size-w' || event.target.id === 'layout-size-h') {
            const v = parseFloat(event.target.value);
            if (!(v >= 6 && v <= 120)) return;
            if (event.target.id === 'layout-size-w') sheetSize.w = v; else sheetSize.h = v;
        } else if (event.target.id === 'layout-size-cut') sheetSize.cut = event.target.checked;
        else return;
        saveSheetSize();
        updateSizeInfo();
        renderSheetPreview();
    });
}
async function openSheetDialog(kind) {
    if (isDirty()) Dashboard.showToast(t('main.layoutDescargaGuardado'), 'info');
    const loaded = await loadSheetData();
    if (!loaded) return;
    ensureSheetModal();
    sheetDialog = { kind, loaded };
    $('layout-size-w').value = sheetSize.w;
    $('layout-size-h').value = sheetSize.h;
    $('layout-size-cut').checked = sheetSize.cut;
    // el botón del formato que se pidió va resaltado
    $('layout-sheet-pdf').className = kind === 'pdf' ? 'btn' : 'btn btn-secondary';
    $('layout-sheet-png').className = kind === 'png' ? 'btn' : 'btn btn-secondary';
    updateSizeInfo();
    renderSheetPreview();
    sheetModalEl.hidden = false;
}
function closeSheetDialog() {
    if (sheetModalEl) sheetModalEl.hidden = true;
    sheetDialog = null;
}
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && sheetDialog) closeSheetDialog(); });
function closeQrPop() {
    $('layout-qr-pop').hidden = true;
    $('layout-qr-btn').setAttribute('aria-expanded', 'false');
}
$('layout-qr-btn').addEventListener('click', (event) => {
    event.stopPropagation();
    const open = $('layout-qr-pop').hidden;
    $('layout-qr-pop').hidden = !open;
    $('layout-qr-btn').setAttribute('aria-expanded', String(open));
    if (open && qrBy === 'zone') loadQrZone(); // la lista de la zona se lee otra vez cada vez que se abre: refleja lo último guardado
});
$('layout-qr-zone').addEventListener('change', loadQrZone);
$('layout-qr-type').addEventListener('change', loadQrZone);
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
        power: t('main.layoutLeyendaLuz'), column: t('main.layoutLeyendaColumna'),
        kpiTotal: t('main.layoutHojaKpiTotal'), kpiOffices: t('main.layoutHojaKpiOficinas'), kpiAisles: t('main.layoutHojaKpiPasillos'),
        kpiDocks: t('main.layoutHojaKpiAndenes'), kpiStorage: t('main.layoutHojaKpiAlmacenamiento'), kpiDead: t('main.layoutHojaKpiMuertos'), kpiVolume: t('main.layoutHojaKpiVolumen'),
        scan: t('main.layoutHojaEscanea'), fixed: t('main.layoutHojaNoCambia'), door: t('main.layoutLeyendaPuerta'), space: t('main.layoutLeyendaEspacio'),
        dry: typeLabel('zone', 'dry'), cold: typeLabel('zone', 'cold'), chemical: typeLabel('zone', 'chemical'), finished: typeLabel('zone', 'finished'),
        aisle: typeLabel('zone', 'aisle'), aisle2: typeLabel('zone', 'aisle2'), dock: typeLabel('zone', 'dock'), office: typeLabel('zone', 'office'), none: t('main.layoutSinZona'),
        cutCaption: t('main.layoutHojaRecorte'), printed: t('main.layoutHojaImpreso'), snapshot: t('main.layoutHojaFoto'), updated: t('main.layoutHojaActualizado'), version: t('main.layoutHojaVersion'),
    };
}
const slug = (text) => String(text || 'Layout').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Layout';
async function downloadSheet(kind) {
    if (!sheetDialog) return;
    try {
        Dashboard.showToast(t('main.layoutPreparandoHoja'), 'info');
        const { loaded } = sheetDialog;
        const svg = buildSheetSvgFrom(loaded);
        const blob = kind === 'pdf' ? await window.LayoutSheet.renderPdf(svg) : await window.LayoutSheet.renderPng(svg);
        const day = new Date().toISOString().slice(0, 10);
        window.LayoutSheet.saveBlob(blob, `Layout_${slug(loaded.data.companyName)}_v${loaded.data.version}_${day}.${kind === 'pdf' ? 'pdf' : 'png'}`);
        Dashboard.showToast(t('main.layoutDescargaLista'), 'success');
    } catch (err) {
        console.error('Layout: la hoja no se pudo descargar', err);
        Dashboard.showToast(t('main.layoutDescargaError'), 'error');
    }
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
    const by = event.target.closest('[data-qrby]');
    if (by) { qrBy = by.dataset.qrby; renderQrBy(); return; }
    const item = event.target.closest('[data-qr]');
    if (!item) return;
    closeQrPop();
    try {
        const kind = item.dataset.qr;
        if (kind === 'zone-pdf' || kind === 'zone-png') await openZoneSheetDialog();
        else if (kind === 'pdf' || kind === 'png') await openSheetDialog(kind);
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
