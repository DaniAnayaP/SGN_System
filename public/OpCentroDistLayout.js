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
const SECTION_ORDER = ['contorno', 'paredes', 'obstaculos', 'puertas', 'zonas', 'transito', 'espacios', 'luz', 'sensores', 'seguridad', 'objetos', 'activos', 'posiciones'];
const SECTION_LABEL_KEYS = {
    contorno: 'main.layoutStepContorno', paredes: 'main.layoutStepParedes', obstaculos: 'main.layoutStepObstaculos', puertas: 'main.layoutStepPuertas', luz: 'main.layoutStepLuz', sensores: 'main.layoutStepSensores', seguridad: 'main.layoutStepSeguridad', transito: 'main.layoutStepTransito', objetos: 'main.layoutStepObjetos', zonas: 'main.layoutStepZonas', espacios: 'main.layoutStepEspacios', activos: 'main.layoutStepActivos', posiciones: 'main.layoutStepPosiciones', localizadores: 'main.layoutStepLocalizadores',
};
const state = {
    saved: null, draft: null, version: 0, perms: null, showMeasures: true, showArea: true, showNames: true, rotation: 0, steps: ['contorno'], focus: 'contorno', focusStack: ['contorno'], catsOpen: null, catEdit: null, creating: false,
    planImage: '', planNew: false, planAspect: 1, pendingPlan: null, loaded: false, view3d: false, centerId: null, costCenter: null,
    // figuras que se están armando lado por lado y todavía no cierran (no se pueden guardar así), cómo se captura el contorno y la zona cuyos lados están a la vista
    open: { contorno: false, zones: {} }, contornoMode: 'sides', zoneOpen: null,
    // lo que se enfocó con la búsqueda (zona o huella) y lo que se ocultó de ello: ver «buscar una zona o una huella»
    find: null, findHide: {}, findHideIds: {}, findDim: false,
    // el usuario pidió renumerar los códigos de los activos (se ve en el borrador y se aplica al guardar)
    renumber: false,
    // lo que se eligió en la tabla y se resalta en el croquis: { kind: 'zone' | 'space' | 'bay', id, n, c, step } (por id, no por número de renglón, para que no se mueva al quitar o agregar renglones)
    hl: null,
};
let view = null;
let drag = null;
// Las dos listas del paso Activos (catálogos del cliente): clasificaciones (Mobiliario operativo…) y tipos (rack, estante…); [{ id, name, status }].
let assetLists = { classes: [], types: [] };
// Zoom del croquis (ver más abajo): s = aumento (1 = se ve todo), x/y = esquina de lo que se ve, en las medidas del dibujo (700 × 460).
const MAP_W = 700;
const MAP_H = 460;
const ZOOM_MAX = 8;
const zoom = { s: 1, x: 0, y: 0 };

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
// Un paso del que la cuenta no tiene NINGÚN permiso en el árbol ('none') no se ve; los demás (con solo Ver, Ver y Operar o Modificar) sí.
const stepVisible = (section) => sectionLevel(section) !== 'none';
function ensureVisibleSteps() {
    const visible = SECTION_ORDER.filter(stepVisible);
    if (!visible.length) return; // sin ningún paso permitido no hay nada que elegir: se deja como estaba
    const keep = (s) => s === 'localizadores' || visible.includes(s);
    state.steps = state.steps.filter(keep);
    state.focusStack = state.focusStack.filter(keep);
    if (!state.steps.length) state.steps = [visible[0]];
    if (!state.steps.includes(state.focus)) state.focus = state.steps[state.steps.length - 1];
    if (!state.focusStack.length) state.focusStack = [state.focus];
}
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
// El rango del refrigerador (temperatura °C y humedad %, mínimo y máximo): solo los activos de tipo Frío lo capturan y cada valor es opcional (vacío = sin límite). Las lecturas de Temperaturas fuera de
// ese rango se marcan como alerta.
const RANGE_KEYS = ['tempMin', 'tempMax', 'humMin', 'humMax'];
function rangeCells(s, i, disabled) {
    if (s.type !== 'cold') return RANGE_KEYS.map(() => '<td class="layout-calc">—</td>').join('');
    return RANGE_KEYS.map((key) => `<td><input type="number" step="0.1" ${key.startsWith('temp') ? 'min="-100" max="100"' : 'min="0" max="100"'} data-l="spaces" data-i="${i}" data-k="${key}" data-help-key="layoutRango" value="${s[key] === undefined || s[key] === null ? '' : s[key]}"${disabled ? ' disabled' : ''}></td>`).join('');
}
// El lugar y las medidas PROPIOS de un activo dentro de su huella (opcionales): X e Y = distancia desde la esquina de la huella; largo, fondo y alto = las medidas del activo. Vacío = se acomoda solo (uno junto al otro en el orden
// de la tabla, pegado al borde y con las medidas de la huella; ver LayoutCalc.placeGroup): lo que toma ahora se ve en gris dentro de la caja.
const OWN_KEYS = LC.OWN_SPACE_KEYS;
function ownEffective(s) {
    const f = state.draft.footprints.find((p) => p.id === s.footprintId);
    if (!f) return {};
    return { ox: round2(s.x - f.x), oy: round2(s.y - f.y), ol: s.l, od: s.d, oh: s.h };
}
function ownCells(s, i, disabled) {
    const eff = ownEffective(s);
    const bad = spIssues.get(s.id) || {};
    return OWN_KEYS.map((key) => {
        const flag = key === 'oh' ? bad.tall : (bad.sum || bad.out || bad.overlap);
        return `<td><input type="number" step="0.1" min="${key === 'ox' || key === 'oy' ? 0 : 0.01}" data-l="spaces" data-i="${i}" data-k="${key}" data-help-key="layoutActivoMedidas"${flag ? ' class="layout-missing"' : ''} value="${s[key] === undefined || s[key] === null ? '' : s[key]}" placeholder="${eff[key] === undefined ? '' : eff[key]}"${disabled ? ' disabled' : ''}></td>`;
    }).join('');
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
const FILTER_TABLE_IDS = ['layout-zonas', 'layout-espacios', 'layout-activos', 'layout-posiciones', 'layout-localizadores', 'layout-paredes', 'layout-contorno-lados', 'layout-contorno-esquinas', 'layout-obstaculos', 'layout-puertas', 'layout-luz', 'layout-sensores', 'layout-seguridad', 'layout-objetos', 'layout-transito'];
// Qué tabla con filtro corresponde a cada lista que se agrega: al agregar un renglón se quitan sus filtros para que el nuevo siempre se vea.
const FILTER_OF_LIST = { obstacles: 'layout-obstaculos', doors: 'layout-puertas', power: 'layout-luz', sensors: 'layout-sensores', safety: 'layout-seguridad', transit: 'layout-transito', objects: 'layout-objetos', vertices: 'layout-contorno-esquinas', contornoLados: 'layout-contorno-lados' };
function clearFilterOf(list) {
    if (window.Dashboard && Dashboard.clearExternalColumnFilters && FILTER_OF_LIST[list]) Dashboard.clearExternalColumnFilters(FILTER_OF_LIST[list]);
}
function bindLayoutFilters(root = document.getElementById('layout-panel')) {
    if (!window.Dashboard || !Dashboard.bindExternalColumnFilters || !root) return;
    root.querySelectorAll('table[data-filter-table]').forEach((tbl) => {
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
        const note = tbl.closest('.layout-section, .layout-summary')?.querySelector(`[data-filter-note="${id}"]`);
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
// main = el botón principal del paso: al dibujar el panel se sube a la fila del título (pegado a la derecha) y queda fijo junto con el encabezado de la tabla.
const addButton = (list, labelKey, disabled, main = false) => `<button type="button" class="btn btn-secondary layout-add" data-add="${list}"${main ? ' data-main-add="1"' : ''} data-help-key="layoutAddRow"${disabled ? ' disabled' : ''}>${esc(t(labelKey))}</button>`;
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
    (state.draft.sensors || []).forEach((p) => { if (p.wall > walls) p.wall = walls; });
    clampObstacleSides();
}
// Los obstáculos pegados a un lado que ya no existe: la pared de un lado quitado se quita con él (si no, dos paredes quedarían sobre el último lado); los demás pasan al último lado.
function clampObstacleSides() {
    const walls = state.draft.vertices.length;
    state.draft.obstacles = state.draft.obstacles.filter((o) => !(o.mode === 'contour' && o.kind === 'wall' && o.wall > walls));
    state.draft.obstacles.forEach((o) => { if (o.mode === 'contour' && o.wall > walls) o.wall = walls; });
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
    return `<div class="layout-fl"><label>${esc(t('main.layoutEmpiezaX'))}<input type="number" step="0.05" ${attr}="ox${sfx}" data-help-key="layoutOrigin" value="${sh.origin[0]}"${dis ? ' disabled' : ''}></label><label>${esc(t('main.layoutEmpiezaY'))}<input type="number" step="0.05" ${attr}="oy${sfx}" data-help-key="layoutOrigin" value="${sh.origin[1]}"${dis ? ' disabled' : ''}></label></div>${table(head, rows, isC ? 'layout-contorno-lados' : undefined)}<div class="layout-sidesbar"><button type="button" class="btn btn-secondary layout-add" data-sadd="${esc(key)}"${isC ? ' data-main-add="1"' : ''} data-help-key="layoutSideAdd"${dis ? ' disabled' : ''}>${esc(t('main.layoutAgregarLado'))}</button><span data-sides-status="${esc(key)}">${sidesStatusHtml(key, dis)}</span></div>`;
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
    state.hl = null;
    state.renumber = false;
    clearFind();
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

function footprintZoneName(f) {
    return (state.draft.zones.find((z) => z.id === f.zoneId) || {}).name || '—';
}
// Una huella siempre va dentro de una zona y debe caber completa: las que no cumplen se marcan en rojo (la zona, su altura si pasa la de la nave y un contorno punteado en el croquis). fpIssues: id de la huella ->
// { nozone | out | tall }. Se vuelve a calcular con cada cambio del borrador (renderPanel y refreshLive).
let fpIssues = new Map();
function computeFootprintIssues() {
    fpIssues = new Map();
    if (!state.draft) return;
    LC.footprintViolations(state.draft).forEach((v) => { const m = fpIssues.get(v.id) || {}; m[v.kind] = v; fpIssues.set(v.id, m); });
}
function footprintZoneView(f) {
    const issue = fpIssues.get(f.id) || {};
    if (issue.nozone) return { text: t('main.layoutHuellaSinZona'), bad: true };
    if (issue.out) return { text: `${footprintZoneName(f)} · ${t('main.layoutHuellaNoCabe')}`, bad: true };
    return { text: footprintZoneName(f), bad: false };
}
// Los activos de una huella van uno junto al otro y ninguno se sale de ella, es más alto que ella ni se encima con otro (LayoutCalc.spaceViolations): spIssues = id del activo -> { sum | out | tall | overlap }. Sus cajas de lugar
// y medidas se marcan en rojo; lo que ya estaba mal antes solo se marca, lo nuevo no se deja guardar.
let spIssues = new Map();
function computeSpaceIssues() {
    spIssues = new Map();
    if (!state.draft) return;
    LC.spaceViolations(state.draft).forEach((v) => { const m = spIssues.get(v.id) || {}; m[v.kind] = v; spIssues.set(v.id, m); });
}
// Tránsito: las faltas de cada pasillo y de lo que se mete en él (LayoutCalc.transitViolations): trIssues = id -> { nozone, out, fit: [], blocked: [], intransit: [] }. Se vuelve a calcular con cada cambio del borrador.
let trIssues = new Map();
function computeTransitIssues() {
    trIssues = new Map();
    if (!state.draft) return;
    LC.transitViolations(state.draft).forEach((v) => { const m = trIssues.get(v.id) || {}; if (v.kind === 'nozone' || v.kind === 'out') m[v.kind] = v; else (m[v.kind] = m[v.kind] || []).push(v); trIssues.set(v.id, m); });
}
// El texto de una falta de Tránsito, en el idioma de la pantalla.
function transitIssueText(v) {
    const named = (k) => whoLabel(state.draft, k);
    if (v.kind === 'nozone') return t('main.layoutVioTr_nozone', { code: v.code });
    if (v.kind === 'out') return t('main.layoutVioTr_out', { code: v.code, zone: v.zoneName || '' });
    if (v.kind === 'fit') return t('main.layoutVioTr_fit', { code: v.code, who: v.whoName || named(v.who), what: (v.problems || []).map((k) => t(`main.layoutQuienDim_${k}`)).join(' / ') });
    return t('main.layoutVioTr_blocked', { code: v.transitCode || v.code, other: v.otherCode || v.code });
}
function transitIssuesAll() {
    const out = [];
    LC.transitViolations(state.draft).forEach((v) => { if (v.kind !== 'intransit') out.push(v); });
    return out;
}
// Las cajas del pasillo y las listas de quién transita se marcan en rojo cuando algo no cumple; abajo del paso va la lista de lo que falta.
function applyTransitMarks() {
    (state.draft.transit || []).forEach((p, i) => {
        const bad = trIssues.get(p.id) || {};
        const geoBad = !!(bad.nozone || bad.out || (bad.blocked || []).length);
        const fitKeys = new Set();
        (bad.fit || []).forEach((f) => (f.problems || []).forEach((k) => fitKeys.add(k)));
        [['x', geoBad], ['y', geoBad], ['l', geoBad || fitKeys.has('l')], ['w', geoBad || fitKeys.has('w')], ['h', fitKeys.has('h')]].forEach(([key, flag]) => {
            const box = document.querySelector(`[data-l="transit"][data-i="${i}"][data-k="${key}"]`);
            if (box) box.classList.toggle('layout-missing', !!flag);
        });
        const zoneCell = document.querySelector(`[data-tr-zone="${i}"]`);
        if (zoneCell) {
            const z = state.draft.zones.find((r) => r.id === p.zoneId);
            zoneCell.textContent = bad.nozone ? t('main.layoutHuellaSinZona') : (z ? z.name : '—');
            zoneCell.classList.toggle('layout-bad', !!(bad.nozone || bad.out));
        }
        (p.who || []).forEach((k) => {
            const chip = document.querySelector(`[data-tr-who="${i}:${k}"]`);
            if (chip) chip.classList.toggle('layout-bad', (bad.fit || []).some((f) => f.who === k));
        });
    });
    const box = document.querySelector('[data-tr-issues]');
    if (box) {
        const all = transitIssuesAll();
        box.hidden = !all.length;
        box.innerHTML = all.map((v) => `<p>${esc(transitIssueText(v))}</p>`).join('');
    }
}
// «Quién transita» de un pasillo: la celda muestra solo lo elegido, en etiquetas chicas (con su ×), y un ＋ abre la lista para marcar más (con las medidas de cada uno al lado).
// Lo que transita sale del catálogo de la empresa (Catálogos > «Lo que transita»): los ids se guardan como número; las claves de antes (people, forklift…) como texto.
const whoKey = (k) => (/^\d+$/.test(String(k)) ? Number(k) : k);
const whoSort = (a, b) => (typeof a === typeof b ? (typeof a === 'number' ? a - b : LC.TRANSIT_WHO.indexOf(a) - LC.TRANSIT_WHO.indexOf(b)) : (typeof a === 'number' ? -1 : 1));
function whoLabel(layout, k) {
    const info = LC.transitWhoInfo(layout, k);
    if (info.missing) return t('main.layoutQuienBorrado');
    return info.name || (info.legacy ? t(`main.layoutQuien_${k}`) : String(k));
}
function toggleTransitWho(spec, on) {
    const at = String(spec).indexOf(':');
    const i = String(spec).slice(0, at);
    const key = whoKey(String(spec).slice(at + 1));
    const row = state.draft.transit[Number(i)];
    if (!row) return;
    const set = new Set(row.who || []);
    if (on) set.add(key); else set.delete(key);
    row.who = [...set].sort(whoSort);
    if (!row.who.includes('other')) delete row.otherName;
    const reopen = !!document.getElementById('layout-who-pop');
    renderPanel();
    refreshLive();
    if (reopen) { const btn = document.querySelector(`[data-who-open="${i}"]`); if (btn) openWhoPop(Number(i), btn); }
}
function closeWhoPop() {
    const el = document.getElementById('layout-who-pop');
    if (el) el.remove();
}
function openWhoPop(i, anchor) {
    closeWhoPop();
    const row = state.draft.transit[i];
    if (!row) return;
    // la lista sale del catálogo: lo activo (y lo que este pasillo ya trae aunque esté inactivo), con sus medidas al lado
    const picked = new Set(row.who || []);
    const choices = LC.transitCatalogOf(state.draft).filter((c) => c.status === 'active' || picked.has(c.id));
    const dims = (c) => (c.w > 0 || c.l > 0 || c.h > 0 ? `${fmt(c.w)} × ${fmt(c.l)} × ${fmt(c.h)} m` : '—');
    const pop = document.createElement('div');
    pop.id = 'layout-who-pop';
    pop.className = 'layout-who-pop';
    pop.setAttribute('role', 'group');
    pop.innerHTML = choices.length
        ? choices.map((c) => `<label class="layout-who-item"><input type="checkbox" data-who-pick="${i}:${c.id}"${picked.has(c.id) ? ' checked' : ''}><span>${esc(c.name)}</span><small>${esc(dims(c))}</small></label>`).join('')
        : `<p class="layout-muted">${esc(t('main.layoutQuienSinCatalogo'))}</p>`;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${Math.max(8, Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8))}px`;
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8))}px`;
    pop.addEventListener('change', (event) => { const el = event.target.closest('[data-who-pick]'); if (el) toggleTransitWho(el.getAttribute('data-who-pick'), el.checked); });
}
document.addEventListener('click', (event) => { if (!event.target.closest('#layout-who-pop, [data-who-open]')) closeWhoPop(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeWhoPop(); });
// Seguridad, fechas: el estado de cada elemento (Vigente / Por vencer / Vencido / Sin fecha) sale de la fecha más cercana contra HOY (la fecha de quien ve la pantalla); no bloquea nada. todayIso = hoy como AAAA-MM-DD.
function todayIso() {
    const now = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
// Las últimas revisiones por QR de cada elemento (las manda el servidor con el Layout y NO se guardan con él): { id del elemento: { ok, day, at, by, result } }. Con ellas el estado cuenta una revisión que salió con falla y la
// próxima revisión se recorre sola (la fecha de la última revisión bien hecha + «Revisar cada»).
const sfLast = (e) => ((state.safetyLast || {})[e.id]) || null;
function safetyStatusText(st) {
    if (st.state === 'fail') return t('main.layoutSgFail');
    if (st.state === 'none') return t('main.layoutSgNone');
    if (st.state === 'ok') return t('main.layoutSgOk');
    if (st.state === 'soon') return st.days === 0 ? t('main.layoutSgSoonHoy') : t(st.days === 1 ? 'main.layoutSgSoonUno' : 'main.layoutSgSoonN', { n: st.days });
    return t(st.days === -1 ? 'main.layoutSgLateUno' : 'main.layoutSgLateN', { n: Math.abs(st.days) });
}
const SAFETY_STATUS_CLASS = { ok: 'rel-tag-ok', soon: 'rel-tag-partial', overdue: 'rel-class-cuarentena', fail: 'rel-class-cuarentena', none: '' };
// La etiqueta de estado de un elemento (al pasar el cursor, la fecha que decide: caducidad o próxima revisión).
function safetyStatusTag(e) {
    const st = LC.safetyStatus(e, todayIso(), state.draft && state.draft.safetyWarnDays, sfLast(e));
    const why = st.date ? ` title="${esc(t(st.which === 'expires' ? 'main.layoutSgCaducidad' : (st.which === 'check' ? 'main.layoutSgUltima' : 'main.layoutSgProxima')))}: ${esc(st.date)}"` : '';
    return `<span class="rel-tag ${SAFETY_STATUS_CLASS[st.state]}"${why}>${esc(safetyStatusText(st))}</span>`;
}
function safetyLastHtml(e) {
    const last = sfLast(e);
    if (!last || !last.day) return '—';
    const tag = `<span class="rel-tag ${last.result === 'fail' ? 'rel-class-cuarentena' : 'rel-tag-ok'}">${esc(t(last.result === 'fail' ? 'main.sgResultadoFalla' : 'main.sgResultadoBien'))}</span>`;
    return `<span title="${esc(last.by || '')}">${esc(last.day)}</span> ${tag}`;
}
function safetyNextNote(e) {
    const eff = LC.safetyNextOf(e, sfLast(e));
    return eff && eff !== (e.next || '') ? t('main.layoutSgRecorrio', { d: eff }) : '';
}
// Las revisiones por QR pueden llegar con la pantalla abierta: se vuelven a pedir (como mucho una vez por minuto) y, si cambiaron, se repinta el estado.
let sfLastFetchedAt = 0;
async function refreshSafetyLast() {
    if (!state.draft || !state.saved || !(state.saved.safety || []).length || Date.now() - sfLastFetchedAt < 60000) return;
    sfLastFetchedAt = Date.now();
    try {
        const res = await fetch(layoutUrl('/api/business/layout/safety-last'), { credentials: 'include' });
        if (!res.ok) return;
        const next = (await res.json()).safetyLast || {};
        if (JSON.stringify(next) === JSON.stringify(state.safetyLast || {})) return;
        state.safetyLast = next;
        applySafetyMarks();
        refreshLive();
    } catch (err) { /* sin conexión: se queda lo que ya se tenía */ }
}
function safetyCountsHtml() {
    const c = LC.safetyCounts({ ...state.draft, safetyLast: state.safetyLast || {} }, todayIso());
    const chip = (cls, key, n) => `<span class="rel-tag ${cls}">${esc(t(key))} · ${n}</span>`;
    return chip('rel-tag-ok', 'main.layoutSgCntOk', c.ok) + chip('rel-tag-partial', 'main.layoutSgCntSoon', c.soon) + chip('rel-class-cuarentena', 'main.layoutSgCntLate', c.overdue) + chip('rel-class-cuarentena', 'main.layoutSgCntFail', c.fail) + chip('', 'main.layoutSgCntNone', c.none);
}
// Seguridad: las faltas de cada elemento (LayoutCalc.safetyViolations): fuera del contorno de la nave, o una ruta con los dos puntos iguales. sfIssues = id -> { outside, route }. Se vuelve a calcular con cada cambio del borrador.
let sfIssues = new Map();
function computeSafetyIssues() {
    sfIssues = new Map();
    if (!state.draft) return;
    LC.safetyViolations(state.draft).forEach((v) => { const m = sfIssues.get(v.id) || {}; m[v.kind] = v; sfIssues.set(v.id, m); });
}
const safetyIssueText = (v) => t(`main.layoutVioSg_${v.kind}`, { code: v.code, ...(v.vars || {}) });
// El código y la zona de cada elemento salen de su tipo y de su lugar; las cajas de X e Y (y de la llegada de la ruta) se marcan en rojo si algo no cumple y abajo del paso va la lista de lo que falta.
// La leyenda de los símbolos solo se ve con el paso Seguridad encendido.
// La simbología de la pantalla solo nombra lo que se ve en el croquis: cada parte aparece cuando su paso está encendido Y ya hay algo agregado (una puerta, un sensor, una columna, una pared…). El contorno sale con el
// paso Contorno. Se vuelve a sacar con cada cambio del borrador y al encender o apagar un paso.
function applyLegend() {
    const d = state.draft;
    const some = (list, fn) => !!d && (d[list] || []).some(fn || (() => true));
    const RULES = {
        contour: () => stepOn('contorno'),
        wall: () => stepOn('paredes') && some('obstacles', (o) => o.kind === 'wall'),
        door: () => stepOn('puertas') && some('doors'),
        power: () => stepOn('luz') && some('power'),
        sensor: () => stepOn('sensores') && some('sensors'),
        column: () => stepOn('obstaculos') && some('obstacles', (o) => o.kind === 'column' || o.kind === 'other'),
        step: () => stepOn('obstaculos') && some('obstacles', (o) => o.kind === 'step'),
        footprint: () => (stepOn('espacios') || stepOn('activos') || stepOn('posiciones')) && some('footprints', (f) => f.active !== false),
        asset: () => (stepOn('activos') || stepOn('posiciones')) && some('spaces', (s) => s.active !== false),
        object: (type) => stepOn('objetos') && some('objects', (o) => o.type === type),
        transit: (type) => stepOn('transito') && some('transit', (p) => (type === 'between' ? p.type === 'between' : p.type !== 'between')),
        safety: (type) => stepOn('seguridad') && some('safety', (e) => e.type === type),
    };
    document.querySelectorAll('[data-lg]').forEach((el) => {
        const rule = RULES[el.getAttribute('data-lg')];
        el.hidden = !(d && rule && rule(el.getAttribute('data-lg-type')));
    });
}
function applySafetyMarks() {
    applyLegend();
    if (!state.draft) return;
    computeSafetyIssues();
    (state.draft.safety || []).forEach((e, i) => {
        const bad = sfIssues.get(e.id) || {};
        ['x', 'y', 'x2', 'y2'].forEach((key) => {
            const box = document.querySelector(`[data-l="safety"][data-i="${i}"][data-k="${key}"]`);
            if (box) box.classList.toggle('layout-missing', !!(bad.outside || bad.route));
        });
        // pasarse de la altura de la nave pone en rojo la altura del piso y el alto
        ['elev', 'h'].forEach((key) => {
            const box = document.querySelector(`[data-l="safety"][data-i="${i}"][data-k="${key}"]`);
            if (box) box.classList.toggle('layout-missing', !!bad.tall);
        });
        const codeCell = document.querySelector(`[data-sf-code="${i}"]`);
        if (codeCell) codeCell.textContent = e.code || '';
        const zoneCell = document.querySelector(`[data-sf-zone="${i}"]`);
        if (zoneCell) zoneCell.textContent = (state.draft.zones.find((z) => z.id === e.zoneId) || {}).name || '—';
        const statusCell = document.querySelector(`[data-sf-status="${i}"]`);
        if (statusCell) statusCell.innerHTML = safetyStatusTag(e);
        const lastCell = document.querySelector(`[data-sf-last="${i}"]`);
        if (lastCell) lastCell.innerHTML = safetyLastHtml(e);
        const nextNote = document.querySelector(`[data-sf-next="${i}"]`);
        if (nextNote) nextNote.textContent = safetyNextNote(e);
    });
    // los contadores de arriba y la lista de los vencidos de abajo se vuelven a sacar con cada cambio (una fecha, los días de aviso)
    const countsBox = document.querySelector('[data-sf-counts]');
    if (countsBox) countsBox.innerHTML = safetyCountsHtml();
    const dueBox = document.querySelector('[data-sf-due]');
    if (dueBox) {
        const today = todayIso();
        const late = (state.draft.safety || []).map((e) => ({ e, st: LC.safetyStatus(e, today, state.draft.safetyWarnDays, sfLast(e)) })).filter(({ st }) => st.state === 'overdue' || st.state === 'fail');
        dueBox.hidden = !late.length;
        dueBox.innerHTML = late.length ? `<p><b>${esc(t('main.layoutSgDueTitulo'))}</b></p>${late.slice(0, 8).map(({ e, st }) => `<p>${esc(e.code || '')} · ${esc(typeLabel('safety', e.type))}${e.name ? ` · ${esc(e.name)}` : ''}: ${esc(safetyStatusText(st))}</p>`).join('')}${late.length > 8 ? `<p>${esc(t('main.layoutSgDueMas', { n: late.length - 8 }))}</p>` : ''}` : '';
    }
    refreshSafetyLast();
    const box = document.querySelector('[data-sf-issues]');
    if (box) {
        const all = LC.safetyViolations(state.draft);
        box.hidden = !all.length;
        box.innerHTML = all.map((v) => `<p>${esc(safetyIssueText(v))}</p>`).join('');
    }
}
// Las paredes que hay (las del paso Paredes) para elegir en qué pared va una puerta, una conexión de luz o un sensor; sin pared elegida sale «Elige la pared».
function wallPickHtml(selected) {
    const walls = (state.draft.obstacles || []).filter((o) => o.kind === 'wall');
    const empty = selected && walls.some((o) => o.id === selected) ? '' : `<option value="" selected>${esc(t('main.layoutPuertaElegirPared'))}</option>`;
    return empty + walls.map((o) => `<option value="${esc(o.id)}"${o.id === selected ? ' selected' : ''}>${esc(o.code ? `${o.code} · ${o.name}` : o.name)}</option>`).join('');
}
// Lo que va sobre una pared: puertas, conexiones de luz y sensores. Cada renglón elige su pared y se mide desde su inicio; la pared dice cuánto mide y qué tan alta es.
const WALL_ITEM_LISTS = ['doors', 'power', 'sensors'];
const WALL_ITEM_VIO = { doors: 'Dr', power: 'Pw', sensors: 'Sn' };
const wallItemGeom = (list, item) => LC.doorGeometry(state.draft, list === 'doors' ? item : { ...item, width: 0 });
// Lo que mide y de alto tiene la pared de un renglón (sale de la pared, no se escribe).
function wallInfoCell(list, item, which) {
    const g = wallItemGeom(list, item);
    if (!g || g.legacy) return '—';
    return which === 'len' ? fmt(g.wallLength) : fmt(g.wallHeight);
}
// Un renglón cuya pared se quitó (o se cambió a columna) se queda sin pared: la pantalla le pide una.
function syncWallItems() {
    const ids = new Set((state.draft.obstacles || []).filter((o) => o.kind === 'wall').map((o) => o.id));
    WALL_ITEM_LISTS.forEach((list) => (state.draft[list] || []).forEach((item) => { if (item.wallId && !ids.has(item.wallId)) item.wallId = ''; }));
}
// Las faltas de cada renglón (LayoutCalc.wallItemViolations): sin pared, se pasa del largo de su pared o es más alto que ella. wiIssues = 'lista:id' -> { nowall, outside, tall }.
let wiIssues = new Map();
let wiAll = { doors: [], power: [], sensors: [] };
function computeWallItemIssues() {
    wiIssues = new Map();
    wiAll = { doors: [], power: [], sensors: [] };
    if (!state.draft) return;
    WALL_ITEM_LISTS.forEach((list) => {
        wiAll[list] = LC.wallItemViolations(state.draft, list);
        wiAll[list].forEach((v) => { const key = `${list}:${v.id}`; const m = wiIssues.get(key) || {}; m[v.kind] = v; wiIssues.set(key, m); });
    });
}
const wallItemIssueText = (list, v) => t(`main.layoutVio${WALL_ITEM_VIO[list]}_${v.kind}`, v.vars || {});
function applyWallItemMarks() {
    if (!state.draft) return;
    computeWallItemIssues();
    WALL_ITEM_LISTS.forEach((list) => {
        (state.draft[list] || []).forEach((item, i) => {
            const bad = wiIssues.get(`${list}:${item.id}`) || {};
            const mark = (key, on) => { const box = document.querySelector(`[data-l="${list}"][data-i="${i}"][data-k="${key}"]`); if (box) box.classList.toggle('layout-missing', !!on); };
            mark('wallId', bad.nowall);
            mark('dist', bad.outside);
            mark('width', bad.outside);
            mark('height', bad.tall);
            const lenCell = document.querySelector(`[data-wi-len="${list}:${i}"]`);
            if (lenCell) lenCell.textContent = wallInfoCell(list, item, 'len');
            const hCell = document.querySelector(`[data-wi-h="${list}:${i}"]`);
            if (hCell) hCell.textContent = wallInfoCell(list, item, 'h');
        });
        const box = document.querySelector(`[data-wi-issues="${list}"]`);
        if (box) {
            box.hidden = !wiAll[list].length;
            box.innerHTML = wiAll[list].map((v) => `<p>${esc(wallItemIssueText(list, v))}</p>`).join('');
        }
    });
}
function applyActivoMarks() {
    (state.draft.spaces || []).forEach((s, i) => {
        const eff = ownEffective(s);
        const bad = spIssues.get(s.id) || {};
        OWN_KEYS.forEach((key) => {
            const box = document.querySelector(`[data-l="spaces"][data-i="${i}"][data-k="${key}"]`);
            if (!box) return;
            if (eff[key] !== undefined) box.placeholder = String(eff[key]);
            box.classList.toggle('layout-missing', !!(key === 'oh' ? bad.tall : (bad.sum || bad.out || bad.overlap)));
        });
    });
}
function applyFootprintMarks() {
    state.draft.footprints.forEach((f, i) => {
        const view = footprintZoneView(f);
        const zoneCell = document.querySelector(`[data-fp-zone="${i}"]`);
        if (zoneCell) { zoneCell.textContent = view.text; zoneCell.classList.toggle('layout-bad', view.bad); }
        const tall = document.querySelector(`[data-l="footprints"][data-i="${i}"][data-k="h"]`);
        if (tall) tall.classList.toggle('layout-missing', !!(fpIssues.get(f.id) || {}).tall);
    });
}
// Paso «Localizadores» (solo lectura): los localizadores que va creando este Layout con lo que se tiene capturado AHORA (también lo que todavía no se guarda): zona, huella, activo y cada posición completa. Para verlos
// todos, con su almacén y sub almacén, está la pantalla Catálogos > Localizadores (la flechita del paso).
const LOCATOR_PANEL_MAX = 400;
function locatorsStepHtml() {
    const { rows, truncated } = LC.locatorRows(state.draft, { max: LOCATOR_PANEL_MAX });
    if (!rows.length) return `<p class="layout-muted">${esc(t('main.layoutLocalizadoresVacio'))}</p>`;
    const zoneText = (r) => (r.zoneCode ? (r.zoneName ? `${r.zoneName} (${r.zoneCode})` : r.zoneCode) : '—');
    const footprintText = (r) => (r.footprintCode ? (r.footprintName ? `${r.footprintCode} · ${r.footprintName}` : r.footprintCode) : '—');
    const assetText = (r) => (r.spaceCode ? `${r.spaceCode} · ${typeLabel('space', r.spaceType || 'rack')}` : '—');
    const num = (n) => (n ? String(n) : '—');
    const body = rows.map((r) => `<tr><td class="layout-calc">${esc(zoneText(r))}</td><td class="layout-calc">${esc(footprintText(r))}</td><td class="layout-calc">${esc(assetText(r))}</td><td class="layout-calc">${num(r.level)}</td><td class="layout-calc">${num(r.slot)}</td><td class="layout-calc">${num(r.row)}</td><td class="layout-calc">${num(r.depth)}</td><td class="layout-calc"><b>${esc(r.locator || '—')}</b></td><td class="layout-calc">${esc(t(`main.locAlcance_${r.scope}`))}</td><td class="layout-calc"><span class="rel-tag ${r.complete ? 'rel-tag-ok' : 'rel-tag-partial'}">${esc(t(r.complete ? 'main.locEstadoCompleto' : 'main.locEstadoAMedias'))}</span></td></tr>`);
    const note = truncated ? `<p class="layout-muted">${esc(t('main.layoutLocalizadoresCorte', { n: LOCATOR_PANEL_MAX }))}</p>` : '';
    return `${table(['main.colLocZona', 'main.colLocHuella', 'main.colLocActivo', 'main.colLocNivel', 'main.colLocColumna', 'main.colLocFila', 'main.colLocProfundidad', 'main.colLocLocalizador', 'main.colLocAlcance', 'main.colLocEstado'], body, 'layout-localizadores')}${note}`;
}
// Un renglón de la tabla de obstáculos del contorno. Las cuatro celdas del lugar cambian con la forma de ponerlo: «Sobre el contorno» = lado, distancia, largo (vacío = todo el lado) y grosor; «Dentro de la nave» = X, Y, largo y ancho.
// La altura solo la lleva el desnivel (su altura sobre el piso; negativa si es más bajo).
// wallsOnly = el renglón es de una pared (paso Paredes): sin la columna Tipo (siempre es pared) ni la de altura del desnivel.
function obstacleRowHtml(o, i, dis, wallsOnly = false) {
    const off = dis ? ' disabled' : '';
    const sel = (key, markup, help) => `<td><select data-l="obstacles" data-i="${i}" data-k="${key}" data-help-key="${help}"${off}>${markup}</select></td>`;
    const num = (key, value, help, extra = '') => `<td><input type="number" step="0.1" ${extra} data-l="obstacles" data-i="${i}" data-k="${key}" data-help-key="${help}" value="${value}"${off}></td>`;
    const place = o.mode === 'contour'
        ? `${sel('wall', wallOptionsHtml(o.wall), 'layoutObstLado')}${num('dist', o.dist || 0, 'layoutObstDist', 'min="0"')}${num('l', o.l > 0 ? o.l : '', 'layoutObstLargo', `min="0" placeholder="${esc(t('main.layoutTodoElLado'))}"`)}${num('w', o.w || 0, 'layoutObstGrosor', 'min="0"')}`
        : `${num('x', o.x, 'layoutObstXY')}${num('y', o.y, 'layoutObstXY')}${num('l', o.l, 'layoutObstLargo', 'min="0"')}${num('w', o.w, 'layoutObstAncho', 'min="0"')}`;
    const height = o.kind === 'step' ? num('dz', o.dz === undefined ? 0 : o.dz, 'layoutObstAltura') : '<td class="layout-calc">—</td>';
    if (wallsOnly) {
        // La altura propia de la pared: vacía = la de siempre (la del lado del contorno o el promedio de la nave), que se ve en gris.
        // POR ESQUINA: la altura al inicio de la pared y la del final (una pared puede ir más alta de un lado que del otro).
        const axis = LC.wallAxis(state.draft, { ...o, h: undefined, h2: undefined });
        const endDefault = axis ? (o.h > 0 ? o.h : axis.hEnd) : '';
        const wallHeight = num('h', o.h > 0 ? o.h : '', 'layoutObstAlturaPared', `min="0" placeholder="${axis ? fmt(axis.hStart) : ''}"`)
            + num('h2', o.h2 > 0 ? o.h2 : '', 'layoutObstAlturaParedFin', `min="0" placeholder="${endDefault === '' ? '' : fmt(endDefault)}"`);
        return `<tr><td class="layout-calc"><b data-wall-code="${i}">${esc(o.code || '')}</b></td>${cellText('obstacles', i, 'name', o.name, dis)}${sel('mode', optionsHtml('obmode', LC.OBSTACLE_MODES, o.mode), 'layoutObstUbicacion')}${place}${wallHeight}${removeCell('obstacles', i, dis)}</tr>`;
    }
    // en Contorno el Tipo ya no ofrece Pared (las paredes se agregan en su propio paso)
    return `<tr>${cellText('obstacles', i, 'name', o.name, dis)}${sel('kind', optionsHtml('obstacle', LC.OBSTACLE_KINDS.filter((k) => k !== 'wall'), o.kind), 'layoutObstTipo')}${sel('mode', optionsHtml('obmode', LC.OBSTACLE_MODES, o.mode), 'layoutObstUbicacion')}${place}${height}${removeCell('obstacles', i, dis)}</tr>`;
}
// Cambiar el tipo o la forma de ponerlo de un obstáculo: el desnivel trae su altura; al pasar de una forma a otra se conserva dónde queda.
function setObstacleKindOrMode(row, key, value) {
    if (key === 'kind') {
        const prevKind = row.kind;
        row.kind = LC.OBSTACLE_KINDS.includes(value) ? value : 'column';
        // el nombre que traía de fábrica (el del tipo anterior) sigue al tipo nuevo; un nombre que escribió la persona no se toca
        if (!row.name || row.name === typeLabel('obstacle', prevKind)) row.name = typeLabel('obstacle', row.kind);
        if (row.kind === 'step') { if (row.dz === undefined) row.dz = 0.15; } else delete row.dz;
        return;
    }
    const mode = value === 'contour' ? 'contour' : 'free';
    if (mode === row.mode) return;
    const g = LC.obstacleGeometry(row, state.draft.vertices);
    if (mode === 'contour') {
        // arranca pegado al lado 1: una pared llega hasta el final del lado; lo demás conserva su medida
        const isWall = row.kind === 'wall';
        Object.assign(row, { mode, wall: 1, dist: 0, l: isWall ? 0 : (g ? g.l : 0.6), w: isWall ? LC.WALL_THICKNESS : (g ? g.w : 0.6) });
        delete row.x; delete row.y;
    } else {
        Object.assign(row, { mode, x: g ? g.x : 1, y: g ? g.y : 1, l: g ? g.l : 0.6, w: g ? g.w : 0.6 });
        delete row.wall; delete row.dist;
    }
}
// «+ Agregar pared» (paso Paredes): una pared nueva sobre el lado 1, a todo lo largo; se acomoda con su lado, su distancia, su largo y su grosor.
function addWall() {
    clearLayoutFilters();
    const d = state.draft;
    const n = d.obstacles.filter((o) => o.kind === 'wall').length;
    d.obstacles.push({ id: uid('w'), name: `${t('main.layoutParedNombre')} ${n + 1}`, kind: 'wall', mode: 'contour', wall: 1, dist: 0, l: 0, w: LC.WALL_THICKNESS });
    panelScrollEnd = true;
    renderPanel();
    refreshLive();
}
// «+ Pared en todo el contorno»: agrega una pared de todo el lado a cada lado que todavía no la tiene (no repite las que ya hay).
function addAllWalls() {
    clearLayoutFilters();
    const d = state.draft;
    const have = new Set(d.obstacles.filter((o) => o.kind === 'wall' && o.mode === 'contour' && !(Number(o.l) > 0) && !(Number(o.dist) > 0)).map((o) => Number(o.wall)));
    d.vertices.forEach((_, i) => {
        if (have.has(i + 1)) return;
        d.obstacles.push({ id: uid('w'), name: `${t('main.layoutParedNombre')} ${i + 1}`, kind: 'wall', mode: 'contour', wall: i + 1, dist: 0, l: 0, w: LC.WALL_THICKNESS });
    });
    panelScrollEnd = true;
    renderPanel();
    refreshLive();
}
// Objetos: una persona o un montacargas nuevo toma el primer renglón activo de ese tipo del catálogo «Lo que transita» (su dibujo y sus medidas) y nace en el centro de la nave (corrido un poco para que no se encimen);
// se acomoda con X, Y y Giro. Con el equipo o persona se puede elegir otro renglón del catálogo.
function addObject(kind) {
    const d = state.draft;
    const item = LC.transitCatalogOf(d).find((c) => c.status === 'active' && c.kind === kind);
    if (!item) { Dashboard.showToast(t('main.layoutObjetoSinCatalogo'), 'warning'); return; }
    d.objects = d.objects || [];
    clearFilterOf('objects');
    const xs = d.vertices.map((p) => p[0]);
    const ys = d.vertices.map((p) => p[1]);
    const n = d.objects.length;
    d.objects.push({
        id: uid('b'), name: `${item.name} ${d.objects.filter((o) => Number(o.equipId) === item.id).length + 1}`, type: LC.objectShapeOfKind(item.kind), equipId: item.id,
        x: round2((Math.min(...xs) + Math.max(...xs)) / 2 + (n % 5) * 1.5), y: round2((Math.min(...ys) + Math.max(...ys)) / 2 + Math.floor(n / 5) * 1.5), angle: 0, l: item.l, w: item.w, h: item.h,
    });
    panelScrollEnd = true;
    renderPanel();
    refreshLive();
}
// Cambiar el equipo o persona de un objeto: toma el dibujo y las medidas del nuevo renglón; el nombre de fábrica (el del renglón anterior) también lo sigue.
function setObjectEquip(row, id) {
    const catalog = LC.transitCatalogOf(state.draft);
    const prev = catalog.find((c) => Number(c.id) === Number(row.equipId));
    const next = catalog.find((c) => Number(c.id) === Number(id));
    if (!next) return;
    row.equipId = next.id;
    Object.assign(row, { type: LC.objectShapeOfKind(next.kind), l: next.l, w: next.w, h: next.h });
    if (prev && (row.name === prev.name || row.name.indexOf(`${prev.name} `) === 0)) row.name = `${next.name}${row.name.slice(prev.name.length)}`;
}
// Seguridad: cambiar el tipo de un elemento. La ruta de evacuación lleva un punto de llegada (de fábrica, a 5 m a la derecha de donde sale); los demás tipos no. El código lo vuelve a poner el sistema (letra del tipo nuevo).
// Una celda de la altura al piso o del tamaño de un elemento de Seguridad: vacía muestra la medida de fábrica de su tipo (en gris) y es la que vale.
function safetySizeCell(e, i, key, dis) {
    const def = LC.safetySizeOf(e);
    const value = e[key] !== undefined && e[key] !== null ? e[key] : '';
    return `<td><input type="number" step="0.05" min="${key === 'elev' ? 0 : 0.01}" data-l="safety" data-i="${i}" data-k="${key}" value="${value}" placeholder="${def[key]}"${dis ? ' disabled' : ''}></td>`;
}
function setSafetyType(row, value) {
    row.type = LC.SAFETY_TYPES.includes(value) ? value : 'extinguisher';
    // la altura al piso y el tamaño son del tipo: al cambiarlo vuelven a ser los de fábrica del tipo nuevo
    ['elev', 'l', 'w', 'h'].forEach((k) => { delete row[k]; });
    if (row.type === 'route') {
        if (row.x2 === undefined) row.x2 = round2((Number(row.x) || 0) + 5);
        if (row.y2 === undefined) row.y2 = round2(Number(row.y) || 0);
    } else { delete row.x2; delete row.y2; }
}
function stepHtml(step) {
    if (step === 'localizadores') return locatorsStepHtml();
    const d = state.draft;
    const dis = !canEdit(step);
    if (step === 'contorno') {
        const mode = state.contornoMode;
        const modeBar = `<div class="layout-seg" role="group" data-help-key="layoutContornoMode"><button type="button" class="layout-seg-btn${mode === 'sides' ? ' active' : ''}" data-cmode="sides">${esc(t('main.layoutPorLados'))}</button><button type="button" class="layout-seg-btn${mode === 'corners' ? ' active' : ''}" data-cmode="corners">${esc(t('main.layoutPorEsquinas'))}</button></div>`;
        const rows = d.vertices.map((p, i) => {
            const seg = LC.wallSegment(d.vertices, i + 1);
            return `<tr><td class="layout-calc">${esc(t('main.layoutEsquina'))} ${i + 1}</td>${cellNum('vertices', i, '0', p[0], dis)}${cellNum('vertices', i, '1', p[1], dis)}${cellNum('vertices', i, '2', p[2], dis)}<td class="layout-calc" data-wall-len="${i}">${esc(t('main.layoutPared'))} ${i + 1}: ${fmt(seg.length)} m</td>${d.vertices.length > 3 ? removeCell('vertices', i, dis) : '<td></td>'}</tr>`;
        });
        const heights = d.vertices.map((p) => p[2]);
        const sameHeight = heights.every((h) => h === heights[0]) ? heights[0] : '';
        const shape = mode === 'sides'
            ? sidesBlockHtml('contorno', dis)
            : `${table(['main.layoutEsquina', 'main.layoutX', 'main.layoutY', 'main.layoutAlturaEsquina', 'main.layoutPared', ''], rows, 'layout-contorno-esquinas')}${addButton('vertices', 'main.layoutAgregarEsquina', dis, true)}`;
        // El botón de agregar un lado (o una esquina) va arriba, junto al título del paso. Las paredes y los obstáculos tienen sus propios pasos.
        return `${modeBar}<div class="layout-fl"><label>${esc(t('main.layoutAlturaTodas'))}<input type="number" step="0.1" min="0" data-l="allHeights" value="${sameHeight}" placeholder="—"${dis ? ' disabled' : ''}></label><label data-help-key="layoutSite">${esc(t('main.layoutSitio'))}<input type="text" maxlength="${LC.LIMITS.text}" data-l="siteName" value="${esc(d.siteName || '')}" placeholder="${esc(t('main.layoutSitioEjemplo'))}"${dis ? ' disabled' : ''}></label></div>
            ${shape}`;
    }
    if (step === 'obstaculos') {
        // Cada renglón es un OBSTÁCULO que no es pared: una columna, un desnivel (un tramo del piso más alto o más bajo) u otra cosa que estorbe. Va sobre un lado del contorno o dentro de la nave. Las paredes tienen su propio paso.
        // Es la misma lista de obstáculos de antes (cada renglón conserva su lugar en ella).
        const rows = d.obstacles.map((o, i) => (o.kind === 'wall' ? '' : obstacleRowHtml(o, i, dis))).filter(Boolean);
        const list = rows.length ? table(['main.layoutNombre', 'main.layoutTipo', 'main.layoutUbicacion', 'main.layoutLadoOX', 'main.layoutDistOY', 'main.layoutLargo', 'main.layoutGrosorAncho', 'main.layoutAlturaDesnivel', ''], rows, 'layout-obstaculos') : `<p class="layout-muted">${esc(t('main.layoutObstaculosVacio'))}</p>`;
        return `${addButton('obstacles', 'main.layoutAgregarObstaculo', dis, true)}${list}`;
    }
    if (step === 'paredes') {
        // Cada renglón es una PARED (un obstáculo de tipo pared): sobre un lado del contorno (todo el lado o un tramo, con su grosor) o dentro de la nave. Es la misma lista de obstáculos de antes, pero las paredes se crean aquí y no en Contorno.
        const addWallBtn = `<button type="button" class="btn btn-secondary layout-add" data-add-wall="1" data-main-add="1" data-help-key="layoutParedAgregar"${dis ? ' disabled' : ''}>${esc(t('main.layoutAgregarPared'))}</button>`;
        const wallsAllBtn = `<button type="button" class="btn btn-secondary layout-add" data-walls-all="1" data-main-add="1" data-help-key="layoutParedTodo"${dis ? ' disabled' : ''}>${esc(t('main.layoutParedTodoContorno'))}</button>`;
        const walls = d.obstacles.map((o, i) => (o.kind === 'wall' ? obstacleRowHtml(o, i, dis, true) : '')).filter(Boolean);
        const list = walls.length ? table(['main.layoutCodigo', 'main.layoutNombre', 'main.layoutUbicacion', 'main.layoutLadoOX', 'main.layoutDistOY', 'main.layoutLargo', 'main.layoutGrosorAncho', 'main.layoutAlturaPared', 'main.layoutAlturaParedFin', ''], walls, 'layout-paredes') : `<p class="layout-muted">${esc(t('main.layoutParedesVacio'))}</p>`;
        return `${addWallBtn}${wallsAllBtn}${list}`;
    }
    if (step === 'puertas') {
        // Una puerta SIEMPRE va sobre una pared: se elige cuál (de las del paso Paredes) y se mide desde el inicio de esa pared; la pared dice cuánto mide y qué tan alta es, y la puerta no se puede pasar de ninguna de las dos.
        const rows = d.doors.map((x, i) => `<tr>${cellText('doors', i, 'name', x.name, dis)}${cellSelect('doors', i, 'type', optionsHtml('door', LC.DOOR_TYPES, x.type), dis)}${cellSelect('doors', i, 'wallId', wallPickHtml(x.wallId), dis)}${cellNum('doors', i, 'dist', x.dist, dis)}${cellNum('doors', i, 'width', x.width, dis)}${cellNum('doors', i, 'height', x.height, dis)}<td class="layout-calc" data-wi-len="doors:${i}">${wallInfoCell('doors', x, 'len')}</td><td class="layout-calc" data-wi-h="doors:${i}">${wallInfoCell('doors', x, 'h')}</td>${removeCell('doors', i, dis)}</tr>`);
        return `${addButton('doors', 'main.layoutAgregarPuerta', dis, true)}${rows.length ? table(['main.layoutNombre', 'main.layoutTipo', 'main.layoutParedPuerta', 'main.layoutDistanciaPared', 'main.layoutAncho', 'main.layoutAlto', 'main.layoutPuertaParedLargo', 'main.layoutPuertaParedAlto', ''], rows, 'layout-puertas') : `<p class="layout-muted">${esc(t('main.layoutPuertasVacio'))}</p>`}<div class="layout-vio" data-wi-issues="doors" hidden></div>`;
    }
    if (step === 'luz') {
        // Una conexión de luz SIEMPRE va sobre una pared (igual que una puerta): se elige cuál y se mide desde el inicio de esa pared; la pared dice cuánto mide y qué tan alta es.
        const rows = d.power.map((x, i) => `<tr>${cellSelect('power', i, 'type', optionsHtml('power', LC.POWER_TYPES, x.type), dis)}${cellSelect('power', i, 'wallId', wallPickHtml(x.wallId), dis)}${cellNum('power', i, 'dist', x.dist, dis)}${cellNum('power', i, 'height', x.height, dis)}<td class="layout-calc" data-wi-len="power:${i}">${wallInfoCell('power', x, 'len')}</td><td class="layout-calc" data-wi-h="power:${i}">${wallInfoCell('power', x, 'h')}</td>${removeCell('power', i, dis)}</tr>`);
        return `${table(['main.layoutTipo', 'main.layoutParedPuerta', 'main.layoutDistanciaPared', 'main.layoutAlturaPiso', 'main.layoutPuertaParedLargo', 'main.layoutPuertaParedAlto', ''], rows, 'layout-luz')}${addButton('power', 'main.layoutAgregarConexion', dis, true)}<div class="layout-vio" data-wi-issues="power" hidden></div>`;
    }
    if (step === 'sensores') {
        // Cada renglón es un SENSOR de temperatura y/o humedad, colocado sobre una pared como las conexiones de luz. El código (S001…) lo pone el sistema y la zona sale de dónde queda el sensor: no se capturan.
        const zoneName = (id) => (d.zones.find((z) => z.id === id) || {}).name || '—';
        const rows = (d.sensors || []).map((x, i) => `<tr><td class="layout-calc"><b data-sensor-code="${i}">${esc(x.code || '')}</b></td>${cellSelect('sensors', i, 'type', optionsHtml('sensor', LC.SENSOR_TYPES, x.type), dis)}${cellSelect('sensors', i, 'wallId', wallPickHtml(x.wallId), dis)}${cellNum('sensors', i, 'dist', x.dist, dis)}${cellNum('sensors', i, 'height', x.height, dis)}<td class="layout-calc" data-wi-len="sensors:${i}">${wallInfoCell('sensors', x, 'len')}</td><td class="layout-calc" data-wi-h="sensors:${i}">${wallInfoCell('sensors', x, 'h')}</td><td class="layout-calc" data-sensor-zone="${i}">${esc(zoneName(x.zoneId))}</td>${removeCell('sensors', i, dis)}</tr>`);
        return `${table(['main.layoutCodigo', 'main.layoutTipo', 'main.layoutParedPuerta', 'main.layoutDistanciaPared', 'main.layoutAlturaPiso', 'main.layoutPuertaParedLargo', 'main.layoutPuertaParedAlto', 'main.layoutZona', ''], rows, 'layout-sensores')}${addButton('sensors', 'main.layoutAgregarSensor', dis, true)}<div class="layout-vio" data-wi-issues="sensors" hidden></div>`;
    }
    if (step === 'seguridad') {
        // Cada renglón es un ELEMENTO de seguridad (extintor, hidrante, puerta de emergencia, botiquín, alarma o pulsador, regadera y lavaojos, punto de reunión o ruta de evacuación): un punto puesto en el plano con X e Y, en metros.
        // La ruta de evacuación lleva además el punto de llegada (X final, Y final). El código (cada tipo con su letra: E001, I001, P001…) lo pone el sistema y la zona sale de dónde queda el punto: no se capturan.
        const zoneName = (id) => (d.zones.find((z) => z.id === id) || {}).name || '—';
        const rows = (d.safety || []).map((e, i) => {
            const route = e.type === 'route';
            const end = route ? `${cellNum('safety', i, 'x2', e.x2, dis)}${cellNum('safety', i, 'y2', e.y2, dis)}` : '<td class="layout-calc">—</td><td class="layout-calc">—</td>';
            // la ruta de evacuación es una marca en el piso: no lleva altura ni tamaño
            const size = route ? '<td class="layout-calc">—</td>'.repeat(4) : ['elev', 'l', 'w', 'h'].map((k) => safetySizeCell(e, i, k, dis)).join('');
            return `<tr><td class="layout-calc"><b data-sf-code="${i}">${esc(e.code || '')}</b></td>${cellSelect('safety', i, 'type', optionsHtml('safety', LC.SAFETY_TYPES, e.type), dis)}${cellText('safety', i, 'name', e.name || '', dis)}<td class="layout-calc" data-sf-zone="${i}">${esc(zoneName(e.zoneId))}</td>${cellNum('safety', i, 'x', e.x, dis)}${cellNum('safety', i, 'y', e.y, dis)}${end}${size}<td><input type="date" data-l="safety" data-i="${i}" data-k="expires" value="${esc(e.expires || '')}"${dis ? ' disabled' : ''}></td><td><input type="number" step="1" min="1" max="3650" data-l="safety" data-i="${i}" data-k="every" value="${e.every || ''}" placeholder="—"${dis ? ' disabled' : ''}></td><td><input type="date" data-l="safety" data-i="${i}" data-k="next" value="${esc(e.next || '')}"${dis ? ' disabled' : ''}><small class="layout-sg-eff" data-sf-next="${i}">${esc(safetyNextNote(e))}</small></td><td class="layout-calc" data-sf-last="${i}">${safetyLastHtml(e)}</td><td class="layout-calc" data-sf-status="${i}">${safetyStatusTag(e)}</td>${removeCell('safety', i, dis)}</tr>`;
        });
        const list = rows.length ? table(['main.layoutCodigo', 'main.layoutTipo', 'main.layoutNombreModelo', 'main.layoutZona', 'main.layoutX', 'main.layoutY', 'main.layoutXFinal', 'main.layoutYFinal', 'main.layoutAlturaPiso', 'main.layoutLargo', 'main.layoutAncho', 'main.layoutAlto', 'main.layoutSgCaducidad', 'main.layoutSgCadaDias', 'main.layoutSgProxima', 'main.layoutSgUltima', 'main.layoutSgEstado', ''], rows, 'layout-seguridad') : `<p class="layout-muted">${esc(t('main.layoutSeguridadVacio'))}</p>`;
        // arriba: los contadores (Vigentes, Por vencer, Vencidos, Sin fecha) y con cuántos días de anticipación sale «Por vencer» (de fábrica 30); abajo, los vencidos
        const bar = `<div class="layout-sg-bar"><div class="layout-sg-counts" data-sf-counts data-help-key="layoutSgConteo">${safetyCountsHtml()}</div><div class="layout-fl"><label data-help-key="layoutSgAvisar">${esc(t('main.layoutSgAvisarCon'))}<input type="number" min="1" max="365" step="1" data-l="safetyWarn" value="${d.safetyWarnDays || LC.SAFETY_WARN_DAYS}"${dis ? ' disabled' : ''}></label></div></div>`;
        return `${addButton('safety', 'main.layoutAgregarSeguridad', dis, true)}${bar}${list}<div class="layout-vio" data-sf-issues hidden></div><div class="layout-due" data-sf-due hidden></div>`;
    }
    if (step === 'objetos') {
        // Cada renglón es una PERSONA o un MONTACARGAS dibujado en el plano, a escala. Es una foto fija (como el plano de Excel), no sigue a nadie en vivo. X e Y son su centro, en metros; el giro dice hacia dónde mira
        // (0° = hacia la derecha, 90° = hacia abajo). Las medidas de partida salen de «Cuánto mide lo que transita» (paso Tránsito) y se pueden cambiar en cada uno.
        const catalog = LC.transitCatalogOf(d);
        const equipOptions = (o) => `${o.equipId ? '' : '<option value="" selected>—</option>'}${catalog.filter((c) => c.status === 'active' || Number(c.id) === Number(o.equipId)).map((c) => `<option value="${c.id}"${Number(c.id) === Number(o.equipId) ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}`;
        const rows = (d.objects || []).map((o, i) => `<tr>${cellText('objects', i, 'name', o.name, dis)}${cellSelect('objects', i, 'equipId', equipOptions(o), dis)}${cellNum('objects', i, 'x', o.x, dis)}${cellNum('objects', i, 'y', o.y, dis)}${cellNum('objects', i, 'angle', o.angle || 0, dis, '5')}<td class="layout-calc">${fmt(o.l)}</td><td class="layout-calc">${fmt(o.w)}</td><td class="layout-calc">${fmt(o.h || 0)}</td>${removeCell('objects', i, dis)}</tr>`);
        const addBtn = (type, key) => `<button type="button" class="btn btn-secondary layout-add" data-add-object="${type}" data-main-add="1" data-help-key="layoutObjetoAgregar"${dis ? ' disabled' : ''}>${esc(t(key))}</button>`;
        const list = rows.length ? table(['main.layoutNombre', 'main.layoutEquipoPersona', 'main.layoutX', 'main.layoutY', 'main.layoutGiro', 'main.layoutLargo', 'main.layoutAncho', 'main.layoutAlto', ''], rows, 'layout-objetos') : `<p class="layout-muted">${esc(t('main.layoutObjetosVacio'))}</p>`;
        return `${addBtn('person', 'main.layoutAgregarPersona')}${addBtn('forklift', 'main.layoutAgregarMontacargas')}${list}`;
    }
    if (step === 'transito') {
        // Cada renglón es un PASILLO: por donde pasan personas, montacargas, carritos y plataformas. Va dentro de una zona (la zona sale de su lugar, como la de las huellas), se conecta con otro que lo toque y nada puede ir adentro.
        // Lo que transita por él tiene que caber (ancho, largo y alto, con las medidas de la tabla de abajo). El código (T001…) lo pone el sistema.
        const zoneName = (id) => (d.zones.find((z) => z.id === id) || {}).name || '—';
        const rows = (d.transit || []).map((p, i) => {
            const chips = (p.who || []).map((k) => `<span class="layout-chip" data-tr-who="${i}:${k}" data-help-key="layoutTransitoQuien">${esc(whoLabel(d, k))}${dis ? '' : `<button type="button" class="layout-chip-x" data-who-del="${i}:${k}" aria-label="${esc(t('main.layoutQuitar'))}">×</button>`}</span>`).join('') + (dis ? '' : `<button type="button" class="layout-chip-add" data-who-open="${i}" data-help-key="layoutTransitoQuien" aria-label="${esc(t('main.layoutQuienAgregar'))}" title="${esc(t('main.layoutQuienAgregar'))}">＋</button>`);
            const other = (p.who || []).includes('other') ? `<input type="text" class="layout-who-other" maxlength="${LC.LIMITS.text}" data-l="transit" data-i="${i}" data-k="otherName" data-help-key="layoutTransitoQuien" value="${esc(p.otherName || '')}" placeholder="${esc(t('main.layoutQuienOtroCual'))}"${dis ? ' disabled' : ''}>` : '';
            const alto = `<td><input type="number" step="0.1" min="0" data-l="transit" data-i="${i}" data-k="h" data-help-key="layoutTransitoAltoLibre" value="${p.h > 0 ? p.h : ''}" placeholder="—"${dis ? ' disabled' : ''}></td>`;
            return `<tr>${cellText('transit', i, 'name', p.name, dis)}<td class="layout-calc"><b data-tr-code="${i}">${esc(p.code || '')}</b></td>${cellSelect('transit', i, 'type', optionsHtml('transit', LC.TRANSIT_TYPES, p.type), dis)}<td><div class="layout-chips">${chips}${other}</div></td><td class="layout-calc" data-tr-zone="${i}">${esc(zoneName(p.zoneId))}</td>${cellNum('transit', i, 'x', p.x, dis)}${cellNum('transit', i, 'y', p.y, dis)}${cellNum('transit', i, 'l', p.l, dis)}${cellNum('transit', i, 'w', p.w, dis)}${alto}<td class="layout-calc"><span data-tr-area="${i}">${fmt((Number(p.l) || 0) * (Number(p.w) || 0))} m²</span></td>${removeCell('transit', i, dis)}</tr>`;
        });

        const issues = `<div class="layout-vio" data-tr-issues hidden></div>`;
        const list = rows.length ? table(['main.layoutNombre', 'main.layoutCodigo', 'main.layoutTipo', 'main.layoutQuienTransita', 'main.layoutZona', 'main.layoutX', 'main.layoutY', 'main.layoutLargo', 'main.layoutAncho', 'main.layoutAltoLibre', 'main.layoutSuperficie', ''], rows, 'layout-transito') : `<p class="layout-muted">${esc(t('main.layoutTransitoVacio'))}</p>`;
        return `${addButton('transit', 'main.layoutAgregarPasillo', dis, true)}${list}${issues}`;
    }
    if (step === 'zonas') {
        const rows = d.zones.map((z, i) => {
            const saved = isSavedRow('zones', z.id);
            const free = Array.isArray(z.pts);
            // Los pasillos ya no son un tipo de zona (van en Tránsito); una zona de pasillo de forma libre que quedó de antes sigue mostrando el suyo.
            const zoneTypeIds = LC.ZONE_TYPES_CHOOSABLE.includes(z.type) || !z.type ? LC.ZONE_TYPES_CHOOSABLE : [...LC.ZONE_TYPES_CHOOSABLE, z.type];
            const typeOptions = `<option value=""${z.type ? '' : ' selected'}>${esc(t('main.layoutSinZona'))}</option>${optionsHtml('zone', zoneTypeIds, z.type)}`;
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
            return `<tr class="${z.active === false ? 'layout-off' : ''}">${cellText('zones', i, 'name', z.name, dis)}<td class="layout-calc"><b data-zone-code="${i}">${esc(z.code || '')}</b></td>${cellSelect('zones', i, 'type', typeOptions, dis)}${useBox}${position}<td class="layout-calc"><span data-zone-area="${i}">${fmt(LC.zoneArea(z))} m²</span><div data-zone-chips="${i}">${zoneChipsHtml(z)}</div></td>${planBox}${saved ? savedRowButtons('zones', i, z.active, dis, fmtButton + catButton + shapeButton) : removeCell('zones', i, dis, fmtButton + catButton + shapeButton)}</tr>`;
        });
        return `${table(['main.layoutNombre', 'main.layoutCodigoZona', 'main.layoutTipo', 'main.layoutUsoZona', 'main.layoutX', 'main.layoutY', 'main.layoutLargo', 'main.layoutAncho', 'main.layoutSuperficie', 'main.layoutPlanM2', ''], rows, 'layout-zonas')}<div class="layout-sidesbar">${addButton('zones', 'main.layoutAgregarZona', dis, true)}${addButton('zonesFree', 'main.layoutAgregarZonaLibre', dis, true)}</div>${zoneSidesPanelHtml(dis)}${zoneCatsPanelHtml(dis)}`;
    }
    if (step === 'posiciones') {
        // Cada renglón es un HUECO (un nivel × una columna) de un activo de Huella-Espacio: salen solos con los niveles y las columnas de Activos. Dentro de cada hueco se anota cuántas filas y cuántas profundidades
        // tiene, su altura desde el piso y sus medidas (largo, ancho y alto, en metros). Lo que no se cambia queda como lo de por defecto (las medidas salen calculadas con las del activo) y no se guarda aparte.
        const zoneName = (id) => (d.zones.find((z) => z.id === id) || {}).name || '—';
        const shown = (v) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '');
        const bayNum = (i, n, c, key, value, edited, step) => `<td><input type="number" min="0" step="${step}" data-l="bay" data-i="${i}" data-n="${n}" data-c="${c}" data-k="${key}" value="${value}"${edited ? ' class="layout-edited"' : ''}${dis ? ' disabled' : ''}></td>`;
        const POSITION_ROWS_MAX = 1500;
        let count = 0;
        const rows = [];
        d.spaces.forEach((s, i) => {
            if (s.active === false) return;
            const levels = s.levels || 1;
            const slots = s.slots || 1;
            for (let n = 1; n <= levels; n += 1) {
                for (let c = 1; c <= slots; c += 1) {
                    if (count >= POSITION_ROWS_MAX) return;
                    count += 1;
                    const bay = LC.bayOf(s, n, c);
                    const m = LC.bayMeasures(s, n, c);
                    const st = bay.stored;
                    rows.push(`<tr><td class="layout-calc"><b>${esc(s.code)}</b></td><td class="layout-calc">${esc(zoneName(s.zoneId))}</td><td class="layout-calc">${n}</td><td class="layout-calc">${c}</td>${bayNum(i, n, c, 'rows', bay.rows, st.rows !== undefined, '1')}${bayNum(i, n, c, 'depth', bay.depth, st.depth !== undefined, '1')}${bayNum(i, n, c, 'floorH', shown(m.floorH), st.floorH !== undefined, '0.01')}${bayNum(i, n, c, 'l', shown(m.l), st.l !== undefined, '0.01')}${bayNum(i, n, c, 'w', shown(m.w), st.w !== undefined, '0.01')}${bayNum(i, n, c, 'h', shown(m.h), st.h !== undefined, '0.01')}<td class="layout-calc"><span data-bay-cap="${i}|${n}|${c}">${bay.rows * bay.depth}</span></td></tr>`);
                }
            }
        });
        if (!rows.length) return `<p class="layout-muted">${esc(t('main.layoutPosSinActivos'))}</p>`;
        const heads = ['main.layoutCodigo', 'main.layoutZona', 'main.layoutPosNivel', 'main.layoutPosColumna', 'main.layoutPosFilas', 'main.layoutPosProfundidad', 'main.layoutPosAltura', 'main.layoutPosLargo', 'main.layoutPosAncho', 'main.layoutPosAlto', 'main.layoutPosCapacidad'];
        return `${table(heads, rows, 'layout-posiciones')}${count >= POSITION_ROWS_MAX ? `<p class="layout-muted">${esc(t('main.layoutPosMuchos').replace('{n}', POSITION_ROWS_MAX))}</p>` : ''}`;
    }
    if (step === 'activos') {
        // Cada renglón es un ACTIVO: lo que hay encima de una huella (una huella puede tener varios). Tiene su propio código (de ahí sale el número del activo en el Localizador) y se elige en qué huella está; la zona
        // sale de esa huella y aquí no se captura. Del activo se eligen la clasificación y el tipo (dos listas independientes) y cuántos niveles tiene, cuántas columnas hay por nivel y los cajones (filas × columnas).
        const choices = (list, selected) => list.filter((r) => r.status === 'active' || r.id === selected);
        const assetOptions = (list, selected) => `<option value="">${esc(t('main.layoutActivoElegir'))}</option>${choices(list, selected).map((r) => `<option value="${r.id}"${r.id === selected ? ' selected' : ''}>${esc(r.name || t('main.whNoName'))}${r.status === 'active' ? '' : ` (${esc(t('admin.statusInactivo'))})`}</option>`).join('')}`;
        const pick = (i, key, help, list, selected) => `<td><select data-l="spaces" data-i="${i}" data-k="${key}" data-help-key="${help}"${dis ? ' disabled' : ''}>${assetOptions(list, selected || 0)}</select></td>`;
        const zoneName = (id) => (d.zones.find((z) => z.id === id) || {}).name || '—';
        const footprintOptions = (selected) => `${selected ? '' : `<option value="" selected>${esc(t('main.layoutActivoElegirHuella'))}</option>`}${d.footprints.map((f) => `<option value="${esc(f.id)}"${f.id === selected ? ' selected' : ''}>${esc(f.code)} · ${esc(footprintZoneName(f))}</option>`).join('')}`;
        const letterOptions = (selected) => LC.SPACE_TYPES.map((id) => `<option value="${id}"${id === (selected || 'rack') ? ' selected' : ''}>${esc(LC.ASSET_LETTER[id])} · ${esc(typeLabel('space', id))}</option>`).join('');
        const rows = d.spaces.map((s, i) => {
            const saved = isSavedRow('spaces', s.id);
            return `<tr class="${s.active === false ? 'layout-off' : ''}"><td class="layout-calc"><b data-sp-code="${i}">${esc(s.code || '')}</b></td><td><select data-l="spaces" data-i="${i}" data-k="type" data-help-key="layoutSpaceLetter"${dis ? ' disabled' : ''}>${letterOptions(s.type)}</select></td><td><select data-l="spaces" data-i="${i}" data-k="footprintId"${s.footprintId ? '' : ' class="layout-missing"'}${dis ? ' disabled' : ''}>${footprintOptions(s.footprintId)}</select></td><td class="layout-calc">${esc(zoneName(s.zoneId))}</td>${pick(i, 'assetClassId', 'layoutAssetClass', assetLists.classes, s.assetClassId)}${pick(i, 'assetId', 'layoutAssetType', assetLists.types, s.assetId)}${cellNum('spaces', i, 'levels', s.levels || 1, dis, '1')}${cellNum('spaces', i, 'slots', s.slots || 1, dis, '1')}${cellText('spaces', i, 'drawers', s.drawers || '', dis)}${ownCells(s, i, dis)}${rangeCells(s, i, dis)}${saved ? savedRowButtons('spaces', i, s.off !== true, dis, assetFmtButton(s, i, dis)) : removeCell('spaces', i, dis, assetFmtButton(s, i, dis))}</tr>`;
        });
        return d.footprints.length ? `${table(['main.layoutCodigo', 'main.layoutActivoLetra', 'main.layoutHuellaCol', 'main.layoutZona', 'main.layoutActivoClase', 'main.layoutActivoTipo', 'main.layoutNiveles', 'main.layoutEspaciosNivel', 'main.layoutCajones', 'main.layoutActivoPosX', 'main.layoutActivoPosY', 'main.layoutLargo', 'main.layoutFondo', 'main.layoutAlto', 'main.layoutRangoTempMin', 'main.layoutRangoTempMax', 'main.layoutRangoHumMin', 'main.layoutRangoHumMax', ''], rows, 'layout-activos')}${state.perms && state.perms.canRenumber && !dis ? `<button type="button" class="btn btn-secondary layout-add" data-renumber-codes="1" data-main-add="1" data-help-key="layoutRenumerar">${esc(t('main.layoutRenumerarBtn'))}</button>` : ''}${addButton('spaces', 'main.layoutAgregarActivo', dis, true)}` : `<p class="layout-muted">${esc(t('main.layoutActivosSinEspacios'))}</p>`;
    }
    const zoneOptions = (selected) => `<option value="">—</option>${d.zones.map((z) => `<option value="${esc(z.id)}"${z.id === selected ? ' selected' : ''}>${esc(z.name)}</option>`).join('')}`;
    // Cada renglón es una HUELLA: el lugar en el piso. Al agregar una se crea solo la huella (sin activos); los activos que se pongan encima se dan de alta después, en el paso Activos.
    const rows = d.footprints.map((s, i) => {
        const saved = isSavedRow('footprints', s.id);
        const view = footprintZoneView(s);
        return `<tr class="${s.active === false ? 'layout-off' : ''}">${cellText('footprints', i, 'name', s.name || '', dis)}<td class="layout-calc"><b data-fp-code="${i}">${esc(s.code)}</b></td><td class="layout-calc${view.bad ? ' layout-bad' : ''}" data-fp-zone="${i}" data-help-key="layoutHuellaZona">${esc(view.text)}</td>${cellNum('footprints', i, 'x', s.x, dis)}${cellNum('footprints', i, 'y', s.y, dis)}${cellNum('footprints', i, 'l', s.l, dis)}${cellNum('footprints', i, 'd', s.d, dis)}${cellNum('footprints', i, 'h', s.h, dis)}<td class="layout-calc" data-space-calc="${i}">${fmt(s.l * s.d)} m² · ${fmt(s.l * s.d * s.h)} m³</td>${saved ? savedRowButtons('footprints', i, s.active, dis, spaceFmtButton(s, i, dis)) : removeCell('footprints', i, dis, spaceFmtButton(s, i, dis))}</tr>`;
    });
    return `${table(['main.layoutNombre', 'main.layoutCodigoHuella', 'main.layoutZona', 'main.layoutX', 'main.layoutY', 'main.layoutLargo', 'main.layoutFondo', 'main.layoutAlto', 'main.layoutHuellaVolumen', ''], rows, 'layout-espacios')}${addButton('footprints', 'main.layoutAgregarEspacio', dis, true)}`;
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
// El panel se dibuja completo en cada cambio: se recuerda cuánto se había deslizado el paso y cada tabla (para volver ahí), o se baja hasta el final cuando se acaba de agregar un renglón (para verlo).
let panelScrollStep = '';
let panelScrollEnd = false;
const panelScrollers = () => Array.from(document.querySelectorAll('#layout-panel .layout-section-body, #layout-panel .layout-scroll'));
function renderPanel() {
    closeWhoPop();
    // el panel también se dibuja con lo que sale de la huella (zona de cada activo, si está activo): se saca antes de dibujarlo, no solo en refreshLive
    if (state.draft) { syncWallItems(); syncHuellas(); state.draft.spaces = LC.deriveSpaces(state.draft).spaces; computeFootprintIssues(); computeSpaceIssues(); computeTransitIssues(); }
    const keepTops = panelScrollStep === state.focus ? panelScrollers().map((el) => el.scrollTop) : [];
    ensureVisibleSteps();
    const tabs = SECTION_ORDER.filter(stepVisible).map((s) => `<button type="button" role="button" aria-pressed="${stepOn(s)}" aria-current="${s === state.focus}" class="layout-step${stepOn(s) ? ' active' : ''}${s === state.focus ? ' focus' : ''}" data-step="${s}">${esc(t(SECTION_LABEL_KEYS[s]))}</button>`).join('');
    const s = state.focus;
    const isLocators = s === 'localizadores'; // este paso no edita nada: no lleva candado
    const level = isLocators ? '' : sectionLevel(s);
    const locked = !isLocators && !canEdit(s);
    const section = `<div class="layout-section" data-help-key="layoutSec_${s}">
        <div class="layout-section-head"><h3>${esc(t(SECTION_LABEL_KEYS[s]))}</h3>${locked ? `<span class="layout-lock" data-help-key="layoutLocked"><i class="bx bx-lock-alt" aria-hidden="true"></i> ${esc(t(level === 'solo-ver' ? 'main.layoutSoloVer' : 'main.layoutYaLlena'))}</span>` : ''}<div class="layout-head-actions"></div></div>
        <div class="layout-section-body">${stepHtml(s)}</div>
    </div>`;
    // «Localizadores»: el último paso de la barra no edita nada. Al tocarlo se ve la lista de los localizadores de este Layout aquí abajo, como los demás pasos; la flechita de su lado abre la pantalla Catálogos >
    // Localizadores (solo lectura, con todos los centros). Solo sale a quien tiene esa pantalla en el árbol.
    const locatorsLink = Dashboard.hasScreenGrant('supply-chain', 'sc-area-distribution-center', 'cat-catalogos/cat-catalogos-centro-dist-localizadores')
        ? `<span class="layout-step layout-step-split${stepOn('localizadores') ? ' active' : ''}${state.focus === 'localizadores' ? ' focus' : ''}"><button type="button" class="layout-step-main" aria-pressed="${stepOn('localizadores')}" aria-current="${state.focus === 'localizadores'}" data-step="localizadores" data-help-key="layoutLocalizadores">${esc(t('main.layoutStepLocalizadores'))}</button><a class="layout-step-arrow" href="CatCentroDistLocalizadores.html" data-help-key="layoutLocalizadoresLink" aria-label="${esc(t('main.layoutLocalizadoresIr'))}" title="${esc(t('main.layoutLocalizadoresIr'))}"><i class="bx bx-link-external" aria-hidden="true"></i></a></span>`
        : '';
    $('layout-panel').innerHTML = `<div class="layout-steps" role="group" data-help-key="layoutSteps">${tabs}${locatorsLink}</div>${section}`;
    // Los botones de agregar del paso suben a la fila del título, pegados a la derecha (siguen siendo los mismos botones: el clic se atiende igual).
    const headActions = document.querySelector('#layout-panel .layout-head-actions');
    if (headActions) document.querySelectorAll('#layout-panel [data-main-add]').forEach((btn) => headActions.appendChild(btn));
    panelScrollers().forEach((el, i) => { el.scrollTop = panelScrollEnd ? el.scrollHeight : (keepTops[i] || 0); });
    panelScrollEnd = false;
    panelScrollStep = state.focus;
    bindLayoutFilters();
    markSelectedRow();
    if (state.draft) { applyFootprintMarks(); applyActivoMarks(); applyTransitMarks(); applySafetyMarks(); applyWallItemMarks(); }
    applyFindToTables();
}

// ---- resaltado de lo elegido ------------------------------------------------------------------------------------------
// Al tocar un renglón de las tablas de Zonas, Huella-Espacio, Activos o Posiciones, lo que ese renglón es se marca en el croquis (contorno naranja y lo demás atenuado) y el renglón queda marcado en la
// tabla: así, al editar, no se confunde de cuál zona, activo, huella o hueco se trata. Una posición es un hueco dentro de un anaquel y el croquis lo ve desde arriba: se marca el anaquel y se escribe el
// nivel y la columna. Es solo de pantalla (no cambia lo guardado ni la hoja que se descarga) y no hace falta redibujar el croquis: se pone y se quita sobre el dibujo que ya está.
const HL_ROW_SELECTOR = '#layout-panel .layout-table tbody tr';
function rowEntity(tr) {
    // Contorno por lados: los campos del renglón «Lado N» llevan data-cs="dir:N-1" (o tilt, len, h); el lado es el que va de la esquina N a la N+1
    const cs = tr.querySelector('[data-cs]');
    if (cs && state.draft) {
        const m = /^(?:dir|tilt|len|h):(\d+)$/.exec(cs.getAttribute('data-cs') || '');
        return m && state.draft.vertices[Number(m[1])] ? { kind: 'side', id: m[1] } : null;
    }
    const ctl = tr.querySelector('[data-l][data-i]');
    if (!ctl || !state.draft) return null;
    // Contorno por esquinas: el renglón «Esquina N»
    if (ctl.getAttribute('data-l') === 'vertices') return state.draft.vertices[Number(ctl.getAttribute('data-i'))] ? { kind: 'corner', id: ctl.getAttribute('data-i') } : null;
    const list = ctl.getAttribute('data-l');
    const i = Number(ctl.getAttribute('data-i'));
    if (list === 'zones' && state.draft.zones[i]) return { kind: 'zone', id: state.draft.zones[i].id };
    if (list === 'footprints' && state.draft.footprints[i]) return { kind: 'footprint', id: state.draft.footprints[i].id };
    if (list === 'spaces' && state.draft.spaces[i]) return { kind: 'space', id: state.draft.spaces[i].id };
    // las paredes (paso Paredes) y las columnas, desniveles y otros obstáculos (paso Contorno) también se marcan en el croquis al elegir su renglón
    if (list === 'obstacles' && state.draft.obstacles[i]) return { kind: 'obstacle', id: state.draft.obstacles[i].id };
    if (list === 'doors' && (state.draft.doors || [])[i]) return { kind: 'door', id: state.draft.doors[i].id };
    if (list === 'power' && (state.draft.power || [])[i]) return { kind: 'power', id: state.draft.power[i].id };
    if (list === 'sensors' && (state.draft.sensors || [])[i]) return { kind: 'sensor', id: state.draft.sensors[i].id };
    if (list === 'safety' && (state.draft.safety || [])[i]) return { kind: 'safety', id: state.draft.safety[i].id };
    if (list === 'transit' && (state.draft.transit || [])[i]) return { kind: 'transit', id: state.draft.transit[i].id };
    if (list === 'objects' && (state.draft.objects || [])[i]) return { kind: 'object', id: state.draft.objects[i].id };
    if (list === 'bay' && state.draft.spaces[i]) return { kind: 'bay', id: state.draft.spaces[i].id, n: Number(ctl.getAttribute('data-n')), c: Number(ctl.getAttribute('data-c')) };
    return null;
}
const sameHighlight = (a, b) => !!a && !!b && a.kind === b.kind && a.id === b.id && a.n === b.n && a.c === b.c && a.step === b.step;
// El renglón de la tabla que corresponde a lo resaltado (por id: el número de renglón cambia al quitar o agregar).
function highlightedRow() {
    const h = state.hl;
    if (!h || h.step !== state.focus || !state.draft) return null;
    return Array.from(document.querySelectorAll(HL_ROW_SELECTOR)).find((tr) => sameHighlight(rowEntity(tr) && { ...rowEntity(tr), step: state.focus }, h)) || null;
}
function markSelectedRow() {
    document.querySelectorAll('#layout-panel tr.layout-row-sel').forEach((tr) => tr.classList.remove('layout-row-sel'));
    const tr = highlightedRow();
    if (tr) tr.classList.add('layout-row-sel');
}
// reveal = true cuando se acaba de elegir el renglón: si el croquis está acercado y lo elegido queda fuera de lo que se ve, se recorre para mostrarlo.
function applyHighlight(reveal) {
    applyHighlight3d();
    const svg = $('layout-svg');
    svg.querySelectorAll('.hl-shape, .hl-tag').forEach((n) => n.remove());
    svg.querySelectorAll('.hl-on').forEach((n) => n.classList.remove('hl-on'));
    svg.classList.remove('has-hl', 'hl-soft-mode');
    const h = state.hl;
    if (!h || h.step !== state.focus || !state.draft) return;
    // una huella se ve como todos sus activos juntos (uno solo es la huella entera); un activo o un hueco, como su propio dibujo
    const HL_ATTR = { zone: 'data-zid', footprint: 'data-fid', obstacle: 'data-obid', safety: 'data-sfid', transit: 'data-tid', object: 'data-oid', door: 'data-did', power: 'data-pid', sensor: 'data-nid', side: 'data-sin-figura', corner: 'data-sin-figura' };
    const els = Array.from(svg.querySelectorAll(`[${HL_ATTR[h.kind] || 'data-sid'}="${CSS.escape(h.id)}"]`));
    // un elemento de seguridad, un objeto, una puerta, una conexión de luz o un sensor son figuras sueltas (línea, símbolo, giro, etiqueta): su contorno sale de un cuadro invisible que se dibuja junto a ellos
    const shapes = ['safety', 'object', 'door', 'power', 'sensor', 'side', 'corner'].includes(h.kind)
        ? Array.from(svg.querySelectorAll(`[data-hlbox="${h.kind}:${CSS.escape(h.id)}"]`))
        : els.map((el) => (el.matches('rect, polygon') ? el : el.querySelector('polygon, rect'))).filter(Boolean);
    if (!shapes.length) return;
    els.forEach((el) => el.classList.add('hl-on'));
    svg.classList.add('has-hl');
    svg.classList.toggle('hl-soft-mode', !h.strong);
    const boxes = shapes.map((s) => s.getBBox());
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.width));
    const y1 = Math.max(...boxes.map((b) => b.y + b.height));
    const box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    // Al tocar un renglón: un contorno delgado, punteado y girando (con el grosor de las líneas del dibujo), así se siguen viendo las medidas y qué tan pegada está la figura a las otras. Al tocar la figura en el
    // croquis (strong): dos contornos encimados (uno ancho del color de la hoja y otro naranja) para que se vea sobre cualquier color de zona, en claro y en oscuro.
    (h.strong ? ['hl-under', 'hl-ring'] : ['hl-soft']).forEach((cls) => {
        let ring;
        if (h.kind === 'footprint') {
            ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            ring.setAttribute('x', box.x); ring.setAttribute('y', box.y); ring.setAttribute('width', box.width); ring.setAttribute('height', box.height);
        } else {
            ring = shapes[0].cloneNode(false);
            ['class', 'style', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'mask', 'filter', 'data-zid', 'data-sid', 'data-fid', 'data-obid', 'data-tid', 'data-hlbox', 'data-did', 'data-pid', 'data-nid', 'id'].forEach((a) => ring.removeAttribute(a));
        }
        // una pared, una columna o un lado del contorno es delgado: su contorno de resaltado es más grueso para que se vea
        ring.setAttribute('class', `hl-shape ${cls}${h.kind === 'obstacle' || h.kind === 'side' ? ' hl-obs' : ''}`);
        svg.appendChild(ring);
    });
    if (h.kind === 'bay') {
        const tag = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tag.setAttribute('class', 'hl-tag');
        tag.setAttribute('text-anchor', 'middle');
        tag.setAttribute('x', (box.x + box.width / 2).toFixed(1));
        const above = box.y >= 14;
        tag.setAttribute('y', (above ? box.y - 5 : box.y + box.height + 12).toFixed(1));
        tag.textContent = `${t('main.layoutPosNivel')} ${h.n} · ${t('main.layoutPosColumna')} ${h.c}`;
        svg.appendChild(tag);
    }
    if (reveal && zoom.s > 1.001) {
        const vw = MAP_W / zoom.s;
        const vh = MAP_H / zoom.s;
        const inside = box.x >= zoom.x && box.y >= zoom.y && box.x + box.width <= zoom.x + vw && box.y + box.height <= zoom.y + vh;
        if (!inside) { zoom.x = box.x + box.width / 2 - vw / 2; zoom.y = box.y + box.height / 2 - vh / 2; applyZoom(); }
    }
}
// Elegir un renglón: al entrar a cualquiera de sus campos (tecla o toque) o al tocar cualquier parte del renglón.
function selectRowFrom(target) {
    const tr = target && target.closest ? target.closest(HL_ROW_SELECTOR) : null;
    if (!tr) return;
    const entity = rowEntity(tr);
    if (!entity) return;
    const next = { ...entity, step: state.focus };
    if (sameHighlight(state.hl, next)) return;
    state.hl = next;
    markSelectedRow();
    applyHighlight(true);
}
// Tocar una figura del croquis (sin arrastrarla) la elige: se marca su renglón en la tabla y la figura se resalta con el contorno grueso de siempre; volver a tocarla la regresa al contorno punteado. Solo cuenta
// el paso que se está editando: en Zonas las zonas, en Huella-Espacio las huellas y en Activos los activos.
function selectFromMap(target) {
    const el = target && target.closest ? target.closest('[data-zid], [data-sid], [data-fid], [data-obid], [data-sfid], [data-tid], [data-oid], [data-did], [data-pid], [data-nid], [data-sideid], [data-cornerid]') : null;
    if (!el || !state.draft) return;
    let next = null;
    // en Contorno se eligen los lados (o las esquinas): se marca su renglón en la tabla y su línea en el croquis y en el 3D
    if (el.getAttribute('data-sideid') !== null || el.getAttribute('data-cornerid') !== null) {
        if (state.focus !== 'contorno') return;
        const isSide = el.getAttribute('data-sideid') !== null;
        selectEntity({ kind: isSide ? 'side' : 'corner', id: el.getAttribute(isSide ? 'data-sideid' : 'data-cornerid') });
        return;
    }
    // en Paredes se eligen las paredes y en Contorno las columnas, desniveles y otros obstáculos
    if (el.getAttribute('data-obid')) {
        const ob = (state.draft.obstacles || []).find((o) => o.id === el.getAttribute('data-obid'));
        if (ob && ((state.focus === 'paredes' && ob.kind === 'wall') || (state.focus === 'obstaculos' && ob.kind !== 'wall'))) selectEntity({ kind: 'obstacle', id: ob.id });
        return;
    }
    if (state.focus === 'zonas' && el.getAttribute('data-zid')) next = { kind: 'zone', id: el.getAttribute('data-zid') };
    else if (state.focus === 'espacios' && el.getAttribute('data-fid')) next = { kind: 'footprint', id: el.getAttribute('data-fid') };
    else if (state.focus === 'activos' && el.getAttribute('data-sid')) next = { kind: 'space', id: el.getAttribute('data-sid') };
    else if (state.focus === 'seguridad' && el.getAttribute('data-sfid')) next = { kind: 'safety', id: el.getAttribute('data-sfid') };
    else if (state.focus === 'transito' && el.getAttribute('data-tid')) next = { kind: 'transit', id: el.getAttribute('data-tid') };
    else if (state.focus === 'objetos' && el.getAttribute('data-oid')) next = { kind: 'object', id: el.getAttribute('data-oid') };
    else if (state.focus === 'puertas' && el.getAttribute('data-did')) next = { kind: 'door', id: el.getAttribute('data-did') };
    else if (state.focus === 'luz' && el.getAttribute('data-pid')) next = { kind: 'power', id: el.getAttribute('data-pid') };
    else if (state.focus === 'sensores' && el.getAttribute('data-nid')) next = { kind: 'sensor', id: el.getAttribute('data-nid') };
    if (next) selectEntity(next);
}
// Elegir una zona, huella o activo: se marca su renglón en la tabla (y se baja hasta él) y su figura se resalta en el croquis y en el 3D; volver a elegirla pasa del contorno grueso al punteado.
function selectEntity(next) {
    next.step = state.focus;
    next.strong = !(sameHighlight(state.hl, next) && state.hl.strong);
    state.hl = next;
    markSelectedRow();
    const row = highlightedRow();
    if (row) row.scrollIntoView({ block: 'nearest' });
    applyHighlight(true);
}
// Tocar una figura en el 3D hace lo mismo que en el croquis: solo cuenta lo del paso que se está editando (en Zonas la zona, en Huella-Espacio la huella y en Activos el activo). Como en el 3D los activos tapan
// el piso, tocar un activo en el paso Zonas elige la zona donde está y en Huella-Espacio la huella que lo lleva.
function selectFrom3d(sel) {
    if (!sel || !state.draft) return;
    let next = null;
    if (state.focus === 'zonas') {
        const zoneId = sel.kind === 'zone' ? sel.zone.id : (sel.kind === 'space' ? sel.space.zoneId : (sel.kind === 'footprint' ? sel.footprint.zoneId : ''));
        if (zoneId) next = { kind: 'zone', id: zoneId };
    } else if (state.focus === 'espacios') {
        const footprintId = sel.kind === 'footprint' ? sel.footprint.id : (sel.kind === 'space' ? sel.space.footprintId : '');
        if (footprintId) next = { kind: 'footprint', id: footprintId };
    } else if (state.focus === 'activos' && sel.kind === 'space') next = { kind: 'space', id: sel.space.id };
    else if (state.focus === 'contorno' && (sel.kind === 'side' || sel.kind === 'corner') && (sel.kind === 'side') === (state.contornoMode === 'sides')) next = { kind: sel.kind, id: String(sel.index) };
    if (next) selectEntity(next);
}
let mapTap = null;
$('layout-svg').addEventListener('pointerdown', (event) => { mapTap = { x: event.clientX, y: event.clientY, target: event.target }; });
window.addEventListener('pointerup', (event) => {
    const tap = mapTap;
    mapTap = null;
    if (!tap || !state.draft) return;
    if (Math.abs(event.clientX - tap.x) + Math.abs(event.clientY - tap.y) > 6) return; // arrastró una zona o recorrió el croquis: no es un toque
    selectFromMap(tap.target);
});

// ---- croquis -----------------------------------------------------------------------------------------------------------
// Renumerar los códigos de los activos: en cada zona y tipo quedan consecutivos desde 001 (por ejemplo F020 y F021 pasan a F001 y F002). Los códigos guardados no se mueven solos: lo pide una persona (icono
// Renumerar del árbol), se ve en el borrador y se aplica al guardar. Los QR, los localizadores y las relaciones de códigos usan el activo (su identificador), no su código, así que siguen funcionando.
async function renumberCodes() {
    if (!state.draft || !(state.perms && state.perms.canRenumber)) return;
    if (LC.renumberSpaceCodes(state.draft) === state.draft) { Dashboard.showToast(t('main.layoutRenumerarNada'), 'success'); return; }
    if (!(await Dashboard.confirm(t('main.layoutRenumerarConfirm')))) return;
    state.renumber = true;
    renderPanel();
    refreshLive();
    Dashboard.showToast(t('main.layoutRenumerarListo'), 'success');
}
$('layout-panel').addEventListener('click', (event) => { if (event.target.closest('[data-renumber-codes]')) renumberCodes(); });

// ---- buscar una zona o una huella (enfoque) ----------------------------------------------------------------------------------------
// La barra de búsqueda de Visualizaciones enfoca el croquis (2D y 3D), las tablas y el resumen en UNA zona o UNA huella: solo se ve lo que hay adentro (el resto de la nave se oculta por completo) y unos botones quitan
// lo que no se quiere ver (Huellas, Activos, Textos, Medidas). Es solo de pantalla: no cambia lo guardado ni los reportes ni los QR. state.find = { kind: 'zone' | 'footprint', id }; state.findHide = { huellas, activos, textos,
// medidas } (true = oculto). Las tablas no pierden renglones: los que no son de lo enfocado solo se esconden (clase layout-find-out), por eso sus números de renglón no cambian.
const canFind = () => !!(state.perms && state.perms.canFind);
function clearFind() { state.find = null; state.findHide = {}; state.findHideIds = {}; }
// Resto de la nave al enfocar: oculto por completo (por omisión) o «tenue» de fondo; se recuerda en este navegador.
const FIND_DIM_KEY = 'sgn_layout_find_dim';
try { state.findDim = localStorage.getItem(FIND_DIM_KEY) === '1'; } catch (err) { /* sin almacenamiento: oculto */ }
// Los ids de lo enfocado (la zona o la huella, con sus huellas y activos).
function findIds() {
    const f = state.find;
    const d = state.draft;
    const ids = { zones: new Set(), footprints: new Set(), spaces: new Set() };
    if (!f || !d) return ids;
    if (f.kind === 'zone') {
        ids.zones.add(f.id);
        d.footprints.forEach((p) => { if (p.zoneId === f.id) ids.footprints.add(p.id); });
        d.spaces.forEach((s) => { if (s.zoneId === f.id) ids.spaces.add(s.id); });
    } else {
        ids.footprints.add(f.id);
        d.spaces.forEach((s) => { if (s.footprintId === f.id) ids.spaces.add(s.id); });
    }
    return ids;
}
// El Layout sin lo que se ocultó con el ojito (una huella oculta se lleva sus activos).
function withoutHidden(d) {
    const hid = state.findHideIds || {};
    if (!d || !Object.keys(hid).length) return d;
    return { ...d, footprints: d.footprints.filter((p) => !hid[p.id]), spaces: d.spaces.filter((s) => !hid[s.id] && !hid[s.footprintId]) };
}
// Cómo se ve el Layout con el enfoque: solo lo enfocado (zona con sus huellas y activos o huella con sus activos) o, con el resto «tenue», todo el Layout con lo enfocado resaltado.
function findView(full) {
    if (!state.find) return { d: full, finding: false, dimmed: false };
    if (!findEntity()) { clearFind(); return { d: full, finding: false, dimmed: false }; }
    if (state.findDim) return { d: withoutHidden(full), finding: true, dimmed: true };
    const d = findLayout(full);
    return { d, finding: d !== full, dimmed: false };
}
function findView3d() {
    if (!state.find) return { shown: state.draft, focus: null };
    if (!findEntity()) { clearFind(); return { shown: state.draft, focus: null }; }
    if (state.findDim) return { shown: withoutHidden(state.draft), focus: findIds() };
    return { shown: findLayout(state.draft), focus: null };
}
// Con el resto «tenue»: lo que no es de lo enfocado se ve apagado (las figuras y los textos de lo enfocado llevan la clase find-on).
function applyFindDim(dimmed) {
    const svg = $('layout-svg');
    svg.classList.remove('find-dimmed');
    if (!dimmed || !state.find) return;
    const f = state.find;
    const sel = [];
    if (f.kind === 'zone') sel.push(`[data-zid="${CSS.escape(f.id)}"]`, `[data-lz="${CSS.escape(f.id)}"]`);
    findIds().footprints.forEach((id) => sel.push(`[data-fid="${CSS.escape(id)}"]`, `[data-lf="${CSS.escape(id)}"]`));
    if (sel.length) svg.querySelectorAll(sel.join(',')).forEach((n) => n.classList.add('find-on'));
    svg.classList.add('find-dimmed');
}
// Lo enfocado, con lo que hace falta para escribirlo; null si ya no existe (se borró).
function findEntity() {
    const f = state.find;
    const d = state.draft;
    if (!f || !d) return null;
    if (f.kind === 'zone') { const z = d.zones.find((x) => x.id === f.id); return z ? { kind: 'zone', id: z.id, code: z.code || '', name: z.name || '' } : null; }
    const p = d.footprints.find((x) => x.id === f.id);
    return p ? { kind: 'footprint', id: p.id, code: p.code || '', name: p.code || '', zoneId: p.zoneId || '' } : null;
}
// La zona de lo enfocado (la zona misma o la de la huella): es la fila que deja el resumen de abajo.
function findZoneId() {
    const e = findEntity();
    return e ? (e.kind === 'zone' ? e.id : e.zoneId) : '';
}
// El Layout que se dibuja con el enfoque: solo la zona (con sus huellas y activos) o solo la huella (con sus activos), sin paredes, puertas, luz ni columnas, y con un contorno rectangular
// justo alrededor para que el croquis y el 3D se acerquen a lo enfocado. Sin enfoque (o si lo enfocado ya no existe) devuelve el mismo Layout.
function findLayout(d) {
    const f = state.find;
    if (!f || !d) return d;
    if (!findEntity()) { clearFind(); return d; }
    let zones = [];
    let footprints;
    let spaces;
    if (f.kind === 'zone') {
        zones = d.zones.filter((z) => z.id === f.id);
        footprints = d.footprints.filter((p) => p.zoneId === f.id);
        spaces = d.spaces.filter((s) => s.zoneId === f.id);
    } else {
        footprints = d.footprints.filter((p) => p.id === f.id);
        spaces = d.spaces.filter((s) => s.footprintId === f.id);
    }
    const pts = [];
    zones.forEach((z) => LC.zonePoints(z).forEach((p) => pts.push(p)));
    footprints.forEach((p) => { pts.push([p.x, p.y], [p.x + p.l, p.y + p.d]); });
    spaces.forEach((s) => { pts.push([s.x, s.y], [s.x + s.l, s.y + s.d]); });
    const ok = pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!ok.length) return d;
    const x0 = Math.min(...ok.map((p) => p[0]));
    const x1 = Math.max(...ok.map((p) => p[0]));
    const y0 = Math.min(...ok.map((p) => p[1]));
    const y1 = Math.max(...ok.map((p) => p[1]));
    const pad = Math.max(0.5, Math.max(x1 - x0, y1 - y0) * 0.06);
    const h = Number(d.heightM) > 0 ? d.heightM : 4;
    const hid = state.findHideIds || {};
    return { ...d, vertices: [[x0 - pad, y0 - pad, h], [x1 + pad, y0 - pad, h], [x1 + pad, y1 + pad, h], [x0 - pad, y1 + pad, h]], zones, footprints: footprints.filter((p) => !hid[p.id]), spaces: spaces.filter((s) => !hid[s.id] && !hid[s.footprintId]), obstacles: [], objects: [], doors: [], power: [], plan: null };
}
// ¿Este renglón de una tabla es de lo enfocado? Los activos todavía sin huella y las huellas sin zona (recién agregados) siempre se ven, para no perderlos.
function inFind(entity) {
    const f = state.find;
    const d = state.draft;
    if (!f || !d || !entity) return true;
    if (entity.kind === 'zone') return f.kind === 'zone' && entity.id === f.id;
    if (entity.kind === 'footprint') {
        const p = d.footprints.find((x) => x.id === entity.id);
        if (!p) return true;
        return f.kind === 'zone' ? (!p.zoneId || p.zoneId === f.id) : p.id === f.id;
    }
    const s = d.spaces.find((x) => x.id === entity.id);
    if (!s) return true;
    if (!s.footprintId) return true;
    return f.kind === 'zone' ? s.zoneId === f.id : s.footprintId === f.id;
}
function applyFindToTables() {
    const d = state.draft;
    document.querySelectorAll(HL_ROW_SELECTOR).forEach((tr) => {
        const e = state.find && d ? rowEntity(tr) : null;
        tr.classList.toggle('layout-find-out', !!e && !inFind(e));
    });
}
// La lista que sale al escribir: zonas y huellas que coinciden (con el mismo motor de búsqueda de todo el sistema: coma, $ y @).
function findCandidates(query) {
    const d = state.draft;
    if (!d) return [];
    const zoneName = (id) => { const z = d.zones.find((x) => x.id === id); return z ? z.name : ''; };
    const items = [
        ...d.zones.map((z) => ({ kind: 'zone', id: z.id, title: z.name || z.code, sub: `${t('main.layoutFindZona')} · ${z.code || ''}`, hay: `${z.code || ''} ${z.name || ''}` })),
        ...d.footprints.map((p) => ({ kind: 'footprint', id: p.id, title: p.code, sub: `${t('main.layoutFindHuella')} · ${zoneName(p.zoneId)}`, hay: `${p.code || ''} ${zoneName(p.zoneId)}` })),
    ];
    const text = String(query || '').trim();
    const match = text ? SearchSyntax.compile('contains', text) : null;
    return items.filter((i) => !match || match(i.hay)).slice(0, 40);
}
let findItems = [];
let findActive = -1;
function renderFindList() {
    const list = $('layout-find-list');
    findItems = findCandidates($('layout-find-input').value);
    findActive = findItems.length ? 0 : -1;
    list.innerHTML = findItems.length
        ? findItems.map((i, n) => `<button type="button" class="layout-find-item" role="option" id="layout-find-opt-${n}" data-find-pick="${n}" aria-selected="${n === findActive}"><b>${esc(i.title)}</b><span>${esc(i.sub)}</span></button>`).join('')
        : `<div class="layout-find-empty">${esc(t('main.layoutFindSin'))}</div>`;
    list.hidden = false;
    $('layout-find-input').setAttribute('aria-expanded', 'true');
}
function closeFindList() {
    $('layout-find-list').hidden = true;
    $('layout-find-input').setAttribute('aria-expanded', 'false');
}
function moveFindActive(step) {
    if (!findItems.length) return;
    findActive = (findActive + step + findItems.length) % findItems.length;
    document.querySelectorAll('#layout-find-list [data-find-pick]').forEach((b, n) => b.setAttribute('aria-selected', String(n === findActive)));
    const cur = $(`layout-find-opt-${findActive}`);
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
}
// El chip de lo enfocado (con su ✕) y los botones para ocultar; solo sale con un enfoque puesto y con el icono Buscar en el árbol.
function renderFindBox() {
    const box = $('layout-find');
    box.hidden = !(canFind() && state.draft);
    $('layout-find-input').setAttribute('aria-label', t('main.layoutBuscarBtn'));
    const target = $('layout-find-state');
    const e = box.hidden ? null : findEntity();
    if (!e) { target.innerHTML = ''; return; }
    const keepTop = (target.querySelector('.layout-find-items') || {}).scrollTop || 0;
    const d = state.draft;
    const hide = state.findHide || {};
    const hid = state.findHideIds || {};
    const fps = d.footprints.filter((p) => p.active !== false && (e.kind === 'zone' ? p.zoneId === e.id : p.id === e.id));
    const sps = d.spaces.filter((s) => s.active !== false && (e.kind === 'zone' ? s.zoneId === e.id : s.footprintId === e.id));
    const toggles = [];
    if (e.kind === 'zone') toggles.push(['huellas', 'main.layoutFindHuellas', fps.length]);
    toggles.push(['activos', 'main.layoutFindActivos', sps.length], ['textos', 'main.layoutFindTextos', null]);
    if (e.kind === 'zone') toggles.push(['medidas', 'main.layoutFindMedidas', null]);
    // un ojito por renglón: una huella oculta se lleva sus activos; el activo se oculta solo
    const eye = (id, name) => {
        const off = !!hid[id];
        const title = t(off ? 'main.layoutFindVerX' : 'main.layoutFindOcultarX', { name });
        return `<button type="button" class="layout-find-eye" data-find-eye="${esc(id)}" data-help-key="layoutFindItems" aria-pressed="${!off}" aria-label="${esc(title)}" title="${esc(title)}"><span class="bx ${off ? 'bx-hide' : 'bx-show'}" aria-hidden="true"></span></button>`;
    };
    const row = (id, code, kind, sub, parentId) => `<div class="layout-find-row${hid[id] || (parentId && hid[parentId]) ? ' off' : ''}${sub ? ' sub' : ''}" role="listitem"><b>${esc(code)}</b><span>${esc(kind)}</span>${eye(id, code)}</div>`;
    const items = [];
    if (e.kind === 'zone') fps.forEach((p) => { items.push(row(p.id, p.code, t('main.layoutFindHuella'), false)); sps.filter((s) => s.footprintId === p.id).forEach((s) => items.push(row(s.id, s.code, typeLabel('space', s.type), true, p.id))); });
    else sps.forEach((s) => items.push(row(s.id, s.code, typeLabel('space', s.type), false)));
    const rest = (v, key) => `<button type="button" class="layout-find-segbtn" data-find-dim="${v}" data-help-key="layoutFindResto" aria-pressed="${!!state.findDim === (v === 1)}">${esc(t(key))}</button>`;
    target.innerHTML = `<button type="button" class="layout-find-chip" data-find-clear data-help-key="layoutFindChip" aria-label="${esc(t('main.layoutFindQuitar'))}" title="${esc(t('main.layoutFindQuitar'))}">${esc(t('main.layoutFindEnfocado', { name: e.name }))}<span class="bx bx-x layout-find-x" aria-hidden="true"></span></button>
        <div class="layout-find-hide-title">${esc(t('main.layoutFindResto'))}</div>
        <div class="layout-find-seg" role="group" data-help-key="layoutFindResto">${rest(0, 'main.layoutFindRestoOculto')}${rest(1, 'main.layoutFindRestoTenue')}</div>
        <div class="layout-find-hide-title">${esc(t('main.layoutFindOcultar'))}</div>
        <div class="layout-find-hide" role="group" data-help-key="layoutFindHide">${toggles.map(([key, label, n]) => {
        const name = t(label);
        const title = t(hide[key] ? 'main.layoutFindVerX' : 'main.layoutFindOcultarX', { name });
        return `<button type="button" class="layout-find-toggle" data-find-hide="${key}" data-help-key="layoutFindHide" aria-pressed="${!hide[key]}" aria-label="${esc(title)}" title="${esc(title)}">${esc(name)}${n === null ? '' : ` <span class="layout-find-n">${n}</span>`}</button>`;
    }).join('')}</div>
        ${items.length ? `<div class="layout-find-hide-title">${esc(t('main.layoutFindAdentro'))}</div><div class="layout-find-items" role="list" data-help-key="layoutFindItems">${items.slice(0, 300).join('')}</div>` : ''}`;
    const list = target.querySelector('.layout-find-items');
    if (list) list.scrollTop = keepTop;
}
// Poner o quitar el enfoque (reset = true cuando cambió lo enfocado: el croquis y el 3D se acomodan a lo nuevo).
let find3dReframe = false;
function applyFind(reset) {
    if (!state.draft) return;
    if (reset) { resetZoom(); find3dReframe = true; }
    renderFindBox();
    renderSvg();
    renderSummary();
    applyFindToTables();
    updateViewBtns();
}
function pickFind(n) {
    const item = findItems[n];
    if (!item) return;
    state.find = { kind: item.kind, id: item.id };
    state.findHide = {};
    state.findHideIds = {};
    $('layout-find-input').value = '';
    closeFindList();
    applyFind(true);
}
$('layout-find-input').addEventListener('input', renderFindList);
$('layout-find-input').addEventListener('focus', renderFindList);
$('layout-find-input').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); if ($('layout-find-list').hidden) renderFindList(); else moveFindActive(1); } else if (event.key === 'ArrowUp') { event.preventDefault(); moveFindActive(-1); } else if (event.key === 'Enter') { event.preventDefault(); if (!$('layout-find-list').hidden && findActive >= 0) pickFind(findActive); } else if (event.key === 'Escape') closeFindList();
});
$('layout-find').addEventListener('click', (event) => {
    const pick = event.target.closest('[data-find-pick]');
    if (pick) { pickFind(Number(pick.getAttribute('data-find-pick'))); return; }
    if (event.target.closest('[data-find-clear]')) { clearFind(); applyFind(true); return; }
    const eyeBtn = event.target.closest('[data-find-eye]');
    if (eyeBtn) {
        const id = eyeBtn.getAttribute('data-find-eye');
        const next = { ...state.findHideIds };
        if (next[id]) delete next[id]; else next[id] = true;
        state.findHideIds = next;
        applyFind(false);
        return;
    }
    const dimBtn = event.target.closest('[data-find-dim]');
    if (dimBtn) {
        const v = dimBtn.getAttribute('data-find-dim') === '1';
        if (state.findDim !== v) {
            state.findDim = v;
            try { localStorage.setItem(FIND_DIM_KEY, v ? '1' : '0'); } catch (err) { /* no se recuerda */ }
            applyFind(true);
        }
        return;
    }
    const tg = event.target.closest('[data-find-hide]');
    if (tg) {
        const key = tg.getAttribute('data-find-hide');
        state.findHide = { ...state.findHide, [key]: !state.findHide[key] };
        applyFind(false);
    }
});
document.addEventListener('click', (event) => { if (!event.target.closest('.layout-find-field, .layout-find-list')) closeFindList(); });

const ZONE_CLASS = { dry: 'lz-dry', cold: 'lz-cold', chemical: 'lz-chem', finished: 'lz-fin', dock: 'lz-dock', office: 'lz-office', aisle: 'lz-aisle', aisle2: 'lz-aisle2' };
function renderSvg() {
    // El croquis puede estar girado (icono Girar): todo se dibuja desde una copia girada del borrador; lo guardado y las tablas no se tocan.
    const rot = state.rotation || 0;
    const full = rot ? LC.rotateLayout(state.draft, rot) : state.draft;
    // Con un enfoque (buscar una zona o una huella) solo se dibuja lo que hay adentro: sin paredes, puertas, luz ni columnas, y con los botones de ocultar de la búsqueda (ver findLayout).
    const fv = findView(full);
    const d = fv.d;
    const finding = fv.finding;
    const dimmed = fv.dimmed; // el resto de la nave se ve «tenue» (se dibuja todo y lo que no es de lo enfocado se apaga)
    const hide = state.findHide || {};
    const sN = state.showNames && !(finding && hide.textos);
    const sA = state.showArea && !(finding && hide.textos);
    const sM = state.showMeasures && !(finding && hide.medidas);
    const on = stepOn;
    const showFp = finding ? (!hide.huellas && (on('espacios') || state.find.kind === 'footprint')) : on('espacios');
    const showSp = finding ? (!hide.activos && (on('activos') || on('posiciones'))) : (on('activos') || on('posiciones'));
    const W = 700;
    const H = 460;
    const M = 36;
    const xs = d.vertices.map((p) => p[0]);
    const ys = d.vertices.map((p) => p[1]);
    let x0 = Math.min(...xs); let x1 = Math.max(...xs); let y0 = Math.min(...ys); let y1 = Math.max(...ys);
    if (state.planImage && d.plan && !rot) {
        x0 = Math.min(x0, 0); y0 = Math.min(y0, 0); x1 = Math.max(x1, d.plan.widthM); y1 = Math.max(y1, d.plan.widthM * state.planAspect);
    }
    const spanX = Math.max(x1 - x0, 1);
    const spanY = Math.max(y1 - y0, 1);
    const sc = Math.min((W - 2 * M) / spanX, (H - 2 * M - 14) / spanY);
    const ox = M + ((W - 2 * M) - spanX * sc) / 2;
    const oy = M;
    const X = (x) => ox + (x - x0) * sc;
    const Y = (y) => oy + (y - y0) * sc;
    view = { sc, W, rot };
    // Los pasillos van sombreados con rayas (principal: rayas; entre anaqueles: puntos).
    let s = '<defs><pattern id="lh-main" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="var(--color-surface)"/><line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-text-secondary)" stroke-width="2.4" opacity="0.4"/></pattern><pattern id="lh-between" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="var(--color-surface)"/><circle cx="3" cy="3" r="1.15" fill="var(--color-text-secondary)" opacity="0.5"/></pattern></defs>';
    if (state.planImage && d.plan && !rot) s += `<image href="${state.planImage}" x="${X(0)}" y="${Y(0)}" width="${d.plan.widthM * sc}" height="${d.plan.widthM * state.planAspect * sc}" opacity="0.55" preserveAspectRatio="none"/>`;
    // El nombre y los m² de cada zona se dibujan al final (encima de anaqueles y paredes) y en la esquina de la zona que no tape ningún espacio; las zonas que no son
    // rectángulos llevan el nombre en el punto más holgado de adentro. La medida real de cada lado se escribe adentro de la zona.
    let zoneLabels = '';
    let measureLabels = '';
    // Contorno blanco de los textos (igual que en la página del QR y el reporte, ver LayoutCalc.HALO_STEPS): cada texto lleva 8 copias en blanco corridas hacia los lados, y TODOS los contornos se
    // dibujan antes que TODOS los textos, así ningún contorno borra el nombre de otra zona y no se depende de paint-order, que algunos celulares aplican mal.
    let zoneHalos = '';
    let measureHalos = '';
    let outerHalos = '';
    let outerLabels = '';
    const textWithHalo = (cls, x, y, anchor, text, attrs = '') => ({
        halo: LC.HALO_STEPS.map(([dx, dy]) => `<text class="${cls} lh"${attrs} x="${(Number(x) + dx).toFixed(1)}" y="${(Number(y) + dy).toFixed(1)}" text-anchor="${anchor}">${text}</text>`).join(''),
        main: `<text class="${cls} lx"${attrs} x="${x}" y="${y}" text-anchor="${anchor}">${text}</text>`,
    });
    let zoneAttr = ''; // los textos de cada zona llevan su id (data-lz) para poder apagarlos si no es la enfocada
    const putZone = (cls, x, y, anchor, text) => { const l = textWithHalo(cls, x, y, anchor, text, zoneAttr); zoneHalos += l.halo; zoneLabels += l.main; };
    const putOuter = (cls, x, y, anchor, text) => { const l = textWithHalo(cls, x, y, anchor, text); outerHalos += l.halo; outerLabels += l.main; };
    const draggable = canEdit('zonas') && !finding;
    // Recuadros (aprox.) que ocupan los nombres y los m² de las zonas: una medida de lado que caería encima se omite (su contorno blanco borraba el nombre de la zona).
    const labelBoxes = [];
    const addBox = (x, baseline, text, size, anchor) => { labelBoxes.push(LC.labelBox(x, baseline, text, size, anchor)); };
    const measureJobs = [];
    const measureText = (pts, minPx, zid) => LC.sideMeasures(pts, false).filter((m) => m.len * sc >= minPx && !LC.onPolygonEdge(m.mx, m.my, d.vertices)).filter((m) => {
        const cxm = X(m.mx) + m.nx * 9;
        const cym = Y(m.my) + m.ny * 9 + 3;
        const w = String(fmt(m.len)).length * 4.9 + 2;
        return !labelBoxes.some(([bx0, by0, bx1, by1]) => cxm - w / 2 < bx1 && cxm + w / 2 > bx0 && cym - 10 < by1 && cym + 3 > by0);
    }).map((m) => { const l = textWithHalo('lm', (X(m.mx) + m.nx * 9).toFixed(1), (Y(m.my) + m.ny * 9 + 3).toFixed(1), 'middle', fmt(m.len), zid ? ` data-lz="${esc(zid)}"` : ''); measureHalos += l.halo; return l.main; }).join('');
    (on('zonas') ? d.zones : (finding ? d.zones.filter((z) => !dimmed || (state.find.kind === 'zone' && z.id === state.find.id)) : [])).forEach((z) => {
        zoneAttr = ` data-lz="${esc(z.id)}"`;
        const typeText = z.type ? typeLabel('zone', z.type) : t('main.layoutSinZona');
        const cls = `lz ${z.type ? (ZONE_CLASS[z.type] || 'lz-dock') : 'lz-none'}${z.active === false ? ' lz-off' : ''}${state.open.zones[z.id] ? ' lz-warn' : ''}${draggable ? ' lz-drag' : ''}`;
        const title = `<title>${esc(z.name)} · ${esc(typeText)}</title>`;
        if (Array.isArray(z.pts)) {
            if (z.pts.length >= 3) {
                s += z.fmt
                    ? `<g class="lzf${z.active === false ? ' lz-off' : ''}${draggable ? ' lz-drag' : ''}" data-zid="${esc(z.id)}">${window.LayoutMapSvg.zonePaint(`ef-${z.id}`, z.fmt).markup(z.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' '))}${title}</g>`
                    : `<polygon class="${cls}" data-zid="${esc(z.id)}" points="${z.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}">${title}</polygon>`;
                const a = LC.zoneLabelAnchor(z);
                const areaY = sN ? Y(a.y) + 10 : Y(a.y) - 1;
                if (sN) { putZone('lt', X(a.x), Y(a.y) - 1, 'middle', esc(z.name)); addBox(X(a.x), Y(a.y) - 1, z.name, 10, 'middle'); }
                if (sA) { putZone('lt2', X(a.x), areaY, 'middle', `${fmt(LC.zoneArea(z))} m²`); addBox(X(a.x), areaY, `${fmt(LC.zoneArea(z))} m²`, 8.5, 'middle'); }
                if (z.active !== false && Math.min(z.l, z.w) * sc >= 44) measureJobs.push([z.pts, 30, z.id]);
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
        // si el nombre cae encima del de otra zona (zonas chicas o croquis chico) se corre a otra esquina, más abajo o afuera de la zona
        const place = LC.placeZoneLabel(z, spot, X, Y, sc, labelBoxes, sA ? `${fmt(z.l * z.w)} m²` : '', !sN);
        const { tx, ty, anchor } = place;
        if (sN) putZone('lt', tx, ty, anchor, esc(z.name));
        if (place.withArea) putZone('lt2', tx, ty + 11, anchor, `${fmt(z.l * z.w)} m²`);
        if (place.areaOnly) putZone('lt2', tx, ty, anchor, `${fmt(z.l * z.w)} m²`);
        place.boxes.forEach((b) => labelBoxes.push(b));
        if (z.active !== false && Math.min(z.l, z.w) * sc >= 44) measureJobs.push([LC.zonePoints(z), 30, z.id]);
    });
    // las medidas de adentro se calculan al final, cuando ya se conocen los nombres de TODAS las zonas
    measureJobs.forEach(([pts, minPx, zid]) => { measureLabels += measureText(pts, minPx, zid); });
    // Los pasillos (paso Tránsito): sombreados con rayas (principal) o puntos (entre pasillos), debajo de las huellas. Con falta (fuera de zona, no cabe, algo adentro o lo que transita no cabe) llevan un contorno rojo punteado.
    (on('transito') ? (d.transit || []) : []).forEach((p) => {
        const w = Math.max((Number(p.l) || 0) * sc, 3);
        const h = Math.max((Number(p.w) || 0) * sc, 3);
        const bad = trIssues.get(p.id) || {};
        // al pasar el cursor por el pasillo dice qué falta, si algo falta (fuera de toda zona, no cabe en su zona, lo que transita no cabe o algo adentro)
        const why = [bad.nozone, bad.out, ...(bad.fit || []), ...(bad.blocked || [])].filter(Boolean).map(transitIssueText).join(' · ');
        const title = `<title>${esc(p.code || '')} · ${esc(p.name || '')} · ${esc(typeLabel('transit', p.type))}${why ? `\n${esc(why)}` : ''}</title>`;
        s += `<rect class="lz ${p.type === 'between' ? 'lz-aisle2' : 'lz-aisle'}" data-tid="${esc(p.id)}" x="${X(p.x)}" y="${Y(p.y)}" width="${w}" height="${h}">${title}</rect>`;
        if (w >= 26 && h >= 9) s += `<text class="lt3" x="${X(p.x) + w / 2}" y="${Y(p.y) + h / 2 + 3}" text-anchor="middle">${esc(p.code || '')}</text>`;
        if (why) s += `<rect class="lbad" x="${X(p.x) - 2}" y="${Y(p.y) - 2}" width="${w + 4}" height="${h + 4}" rx="3"/>`;
    });
    // El contorno de arriba es solo el marco del terreno (línea punteada) y sale con el paso Contorno; las PAREDES son obstáculos puestos encima y salen con el paso Paredes: son capas independientes (las columnas,
    // desniveles y otros salen con el paso Obstáculos).
    // Un resplandor azul claro del contorno debajo de las paredes: así, donde la pared está sobre el contorno, se ven sus orillas azules y la pared (oscura) se distingue del marco.
    if (on('contorno') && (!finding || dimmed)) s += `<polygon class="lw-halo" points="${d.vertices.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}"/>`;
    const obstacleShapes = LC.obstacleShapes(d);
    const obstaclePoly = (g) => g.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ');
    if (on('paredes') && (!finding || dimmed)) obstacleShapes.filter(({ o }) => o.kind === 'wall').forEach(({ o, g }) => { s += `<polygon class="lo lo-wall" data-obid="${esc(o.id)}" style="stroke-width:${Math.max(0.01, 3 - Math.min(g.l, g.w) * sc).toFixed(2)}px" points="${obstaclePoly(g)}"><title>${esc(o.name)}</title></polygon>`; });
    // El contorno (línea azul punteada y fina) va ENCIMA de las paredes: así se distingue de ellas aunque estén sobre el mismo lado, y donde no hay pared se ve solo.
    if (on('contorno') && (!finding || dimmed)) s += `<polygon class="lw" points="${d.vertices.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}"/>`;
    (on('obstaculos') ? obstacleShapes.filter(({ o }) => o.kind !== 'wall') : []).forEach(({ o, g }) => {
        const height = o.kind === 'step' ? ` · ${(o.dz || 0) > 0 ? '+' : ''}${fmt(o.dz || 0)} m` : '';
        s += `<polygon class="lo lo-${o.kind}" data-obid="${esc(o.id)}" points="${obstaclePoly(g)}"><title>${esc(o.name)}${height}</title></polygon>`;
        if ((trIssues.get(o.id) || {}).intransit) s += `<polygon class="lbad" points="${obstaclePoly(g)}"><title>${esc(o.name)} · ${esc(t('main.layoutEnTransitoTitulo'))}</title></polygon>`;
    });
    // Huella-Espacio y Activos son capas aparte: la HUELLA (el lugar en el piso) se dibuja con su paso y va primero, blanca con borde gris o con su color; el ACTIVO va encima con el suyo, un poco más chico, con su propio color (arena si no le han puesto uno): así se distinguen aunque midan lo mismo.
    if (showFp || showSp) {
        const rectPts = (px, py, w, h) => `${px},${py} ${px + w},${py} ${px + w},${py + h} ${px},${py + h}`;
        (showFp ? d.footprints : []).forEach((f) => {
            const w = Math.max(f.l * sc, 4);
            const h = Math.max(f.d * sc, 4);
            const off = f.active === false ? ' lz-off' : '';
            if (f.fmt) s += `<g class="lhbf${off}" data-fid="${esc(f.id)}">${window.LayoutMapSvg.zonePaint(`hf-${f.id}`, f.fmt).markup(rectPts(X(f.x), Y(f.y), w, h))}</g>`;
            else s += `<rect class="lhb${off}" data-fid="${esc(f.id)}" x="${X(f.x)}" y="${Y(f.y)}" width="${w}" height="${h}" rx="2"/>`;
        });
        (showSp ? d.spaces : []).forEach((sp) => {
            const w = Math.max(sp.l * sc, 4);
            const h = Math.max(sp.d * sc, 4);
            const inset = Math.max(1.5, Math.min(4, Math.min(w, h) * 0.16));
            const ax = X(sp.x) + inset;
            const ay = Y(sp.y) + inset;
            const aw = Math.max(w - 2 * inset, 2);
            const ah = Math.max(h - 2 * inset, 2);
            const spaceTitle = `<title>${esc(sp.code)} · ${esc(typeLabel('space', sp.type))}</title>`;
            const spaceOff = sp.active === false ? ' lz-off' : '';
            if (sp.fmt) {
                // con formato propio (color, rayas o borde del activo) se pinta con él; el contorno del resaltado sigue funcionando porque el grupo lleva el mismo data-sid
                s += `<g class="lsf ls-${sp.type}${spaceOff}" data-sid="${esc(sp.id)}" data-fid="${esc(sp.footprintId)}">${window.LayoutMapSvg.zonePaint(`sf-${sp.id}`, sp.fmt).markup(rectPts(ax, ay, aw, ah))}${spaceTitle}</g>`;
            } else {
                s += `<rect class="ls ls-${sp.type}${spaceOff}" data-sid="${esc(sp.id)}" data-fid="${esc(sp.footprintId)}" x="${ax}" y="${ay}" width="${aw}" height="${ah}" rx="2">${spaceTitle}</rect>`;
            }
            const spaceInk = window.LayoutMapSvg.inkFor(sp.fmt || LC.FMT_ASSET_DEFAULT);
            if (w >= 26 && h >= 9 && !(finding && hide.textos)) s += `<text class="lt3" data-lf="${esc(sp.footprintId)}"${spaceInk ? ` style="fill:${spaceInk}"` : ''} x="${X(sp.x) + w / 2}" y="${Y(sp.y) + h / 2 + 3}" text-anchor="middle">${esc(sp.code)}</text>`;
        });
    }
    if (showFp || showSp) {
        d.footprints.forEach((f) => { if ((trIssues.get(f.id) || {}).intransit && !fpIssues.has(f.id)) s += `<rect class="lbad" data-lf="${esc(f.id)}" x="${X(f.x) - 2}" y="${Y(f.y) - 2}" width="${Math.max(f.l * sc, 4) + 4}" height="${Math.max(f.d * sc, 4) + 4}" rx="3"><title>${esc(f.code)} · ${esc(t('main.layoutEnTransitoTitulo'))}</title></rect>`; if (fpIssues.has(f.id)) s += `<rect class="lbad" data-lf="${esc(f.id)}" x="${X(f.x) - 2}" y="${Y(f.y) - 2}" width="${Math.max(f.l * sc, 4) + 4}" height="${Math.max(f.d * sc, 4) + 4}" rx="3"><title>${esc(f.code)} · ${esc(t('main.layoutHuellaFueraTitulo'))}</title></rect>`; });
    }
    const halosAt = s.length; // aquí entran después los contornos de las etiquetas de las paredes: debajo de TODOS los textos
    s += zoneHalos + (sM ? measureHalos : '') + zoneLabels + (sM ? measureLabels : '');
    // Contorno (paso Contorno): el cuadro (invisible) de cada lado y de cada esquina que usa el resaltado al elegir su renglón; el lado i es el que va de la esquina i a la i+1 (en un contorno abierto no hay lado de regreso).
    if (on('contorno')) {
        const verts = d.vertices;
        const sideCount = state.open.contorno ? verts.length - 1 : verts.length;
        for (let n = 1; n <= sideCount; n++) {
            const seg = LC.wallSegment(verts, n);
            s += `<line class="hl-box" data-hlbox="side:${n - 1}" x1="${X(seg.p[0]).toFixed(1)}" y1="${Y(seg.p[1]).toFixed(1)}" x2="${X(seg.q[0]).toFixed(1)}" y2="${Y(seg.q[1]).toFixed(1)}"/>`;
        }
        verts.forEach((p, i) => { s += `<circle class="hl-box" data-hlbox="corner:${i}" cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="9"/>`; });
        // Tocar el contorno en el croquis elige su renglón (como tocar una zona o una pared): una zona de toque invisible y ancha sobre cada lado (en «Por lados») o sobre cada esquina (en «Por esquinas»), solo con el paso Contorno en edición.
        if (state.focus === 'contorno') {
            if (state.contornoMode === 'sides') {
                for (let n = 1; n <= sideCount; n++) {
                    const seg = LC.wallSegment(verts, n);
                    s += `<line class="side-hit" data-sideid="${n - 1}" x1="${X(seg.p[0]).toFixed(1)}" y1="${Y(seg.p[1]).toFixed(1)}" x2="${X(seg.q[0]).toFixed(1)}" y2="${Y(seg.q[1]).toFixed(1)}"/>`;
                }
            } else {
                verts.forEach((p, i) => { s += `<circle class="corner-hit" data-cornerid="${i}" cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="10"/>`; });
            }
        }
    }
    (on('puertas') ? d.doors : []).forEach((door) => {
        const g = LC.doorGeometry(d, door);
        if (!g) return;
        const a = g.a;
        const b = g.b;
        if (wiIssues.has('doors:' + door.id)) s += `<rect class="lbad" x="${(Math.min(X(a.x), X(b.x)) - 5).toFixed(1)}" y="${(Math.min(Y(a.y), Y(b.y)) - 5).toFixed(1)}" width="${(Math.abs(X(b.x) - X(a.x)) + 10).toFixed(1)}" height="${(Math.abs(Y(b.y) - Y(a.y)) + 10).toFixed(1)}" rx="3"/>`;
        s += `<line class="ld" data-did="${esc(door.id)}" x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}"><title>${esc(door.name)}</title></line>`;
        s += `<rect class="hl-box" data-hlbox="door:${esc(door.id)}" x="${(Math.min(X(a.x), X(b.x)) - 7).toFixed(1)}" y="${(Math.min(Y(a.y), Y(b.y)) - 7).toFixed(1)}" width="${(Math.abs(X(b.x) - X(a.x)) + 14).toFixed(1)}" height="${(Math.abs(Y(b.y) - Y(a.y)) + 14).toFixed(1)}" rx="3"/>`;
    });
    (on('luz') ? d.power : []).forEach((e) => {
        const pg = LC.doorGeometry(d, { ...e, width: 0 });
        if (!pg) return;
        const a = pg.a;
        if (wiIssues.has('power:' + e.id)) s += `<circle class="lbad" cx="${X(a.x)}" cy="${Y(a.y)}" r="10"/>`;
        s += `<rect class="hl-box" data-hlbox="power:${esc(e.id)}" x="${(X(a.x) - 10).toFixed(1)}" y="${(Y(a.y) - 10).toFixed(1)}" width="20" height="20" rx="3"/>`;
        s += `<circle class="le" data-pid="${esc(e.id)}" cx="${X(a.x)}" cy="${Y(a.y)}" r="6"><title>${esc(typeLabel('power', e.type))}</title></circle><text class="lt lx" x="${X(a.x)}" y="${Y(a.y) + 3.5}" text-anchor="middle" style="fill:var(--color-report-calc-text)" pointer-events="none">⚡</text>`;
    });
    (on('sensores') ? (d.sensors || []) : []).forEach((e) => {
        const sg = LC.doorGeometry(d, { ...e, width: 0 });
        if (!sg) return;
        const a = sg.a;
        if (wiIssues.has('sensors:' + e.id)) s += `<circle class="lbad" cx="${X(a.x)}" cy="${Y(a.y)}" r="11"/>`;
        s += `<rect class="hl-box" data-hlbox="sensor:${esc(e.id)}" x="${(X(a.x) - 11).toFixed(1)}" y="${(Y(a.y) - 19).toFixed(1)}" width="22" height="30" rx="3"/>`;
        s += `<circle class="lsn" data-nid="${esc(e.id)}" cx="${X(a.x)}" cy="${Y(a.y)}" r="6.5"><title>${esc(e.code)} · ${esc(typeLabel('sensor', e.type))}</title></circle><text class="lt lx" x="${X(a.x)}" y="${Y(a.y) + 3.5}" text-anchor="middle" style="fill:var(--color-report-calc-text)" pointer-events="none">°</text><text class="lt lx" x="${X(a.x)}" y="${Y(a.y) - 10}" text-anchor="middle" style="fill:var(--color-report-calc-text)" pointer-events="none">${esc(e.code || '')}</text>`;
    });
    // Objetos (paso Objetos): personas y montacargas dibujados a escala y girados hacia donde miran (foto fija del plano).
    (on('objetos') ? (d.objects || []) : []).forEach((o) => {
        const along = Math.max((Number(o.l) || 0) * sc, 6);
        const across = Math.max((Number(o.w) || 0) * sc, 5);
        const title = `<title>${esc(o.name || typeLabel('object', o.type))} · ${esc(typeLabel('object', o.type))}</title>`;
        const shape = o.type === 'forklift'
            ? `<rect class="lob lob-forklift" x="${-along / 2}" y="${-across / 2}" width="${along}" height="${across}" rx="2"/><rect class="lob-cab" x="${-along * 0.36}" y="${-across * 0.3}" width="${along * 0.4}" height="${across * 0.6}" rx="1.5"/><line class="lob-fork" x1="${along / 2}" y1="${-across * 0.28}" x2="${along / 2 + along * 0.35}" y2="${-across * 0.28}"/><line class="lob-fork" x1="${along / 2}" y1="${across * 0.28}" x2="${along / 2 + along * 0.35}" y2="${across * 0.28}"/>`
            : (o.type === 'box'
                ? `<rect class="lob lob-box" x="${-along / 2}" y="${-across / 2}" width="${along}" height="${across}" rx="2"/>`
                : `<ellipse class="lob lob-person" cx="0" cy="0" rx="${along / 2}" ry="${across / 2}"/><circle class="lob-head" cx="0" cy="0" r="${Math.min(along, across) * 0.3}"/>`);
        s += `<g class="lobj" data-oid="${esc(o.id)}" transform="translate(${X(o.x)} ${Y(o.y)}) rotate(${Number(o.angle) || 0})">${shape}${title}</g>`;
        // el cuadro (invisible) que usa el resaltado al elegir su renglón: lo que ocupa el objeto ya girado (el montacargas, con sus horquillas)
        const ang = ((Number(o.angle) || 0) * Math.PI) / 180;
        const ext = o.type === 'forklift' ? along * 1.35 : along;
        const bw = Math.abs(Math.cos(ang)) * ext + Math.abs(Math.sin(ang)) * across + 6;
        const bh = Math.abs(Math.sin(ang)) * ext + Math.abs(Math.cos(ang)) * across + 6;
        s += `<rect class="hl-box" data-hlbox="object:${esc(o.id)}" x="${(X(o.x) - bw / 2).toFixed(1)}" y="${(Y(o.y) - bh / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3"/>`;
    });
    // Seguridad (paso Seguridad): extintores, hidrantes, puertas de emergencia… como símbolos de su color con su código; la ruta de evacuación, una línea punteada con flecha. Lo que queda fuera del contorno lleva un aro rojo punteado.
    if (on('seguridad')) {
        const SG = window.LayoutMapSvg;
        const rs = Math.max(5, Math.min(8, sc * 0.45));
        const today = todayIso();
        (d.safety || []).filter((e) => e.type === 'route').forEach((e) => { s += SG.safetyRoute(X(e.x), Y(e.y), X(e.x2), Y(e.y2), 2.4); });
        (d.safety || []).forEach((e) => {
            const bad = sfIssues.get(e.id);
            const px = X(e.x);
            const py = Y(e.y);
            const zone = (d.zones.find((z) => z.id === e.zoneId) || {}).name;
            const why = bad ? Object.values(bad).map(safetyIssueText).join(' · ') : '';
            const due = LC.safetyStatus(e, today, d.safetyWarnDays, sfLast(e));
            const title = `<title>${esc(e.code || '')} · ${esc(typeLabel('safety', e.type))}${e.name ? ` · ${esc(e.name)}` : ''}${zone ? ` · ${esc(zone)}` : ''}${why ? `\n${esc(why)}` : ''}${due.state !== 'none' ? `\n${esc(safetyStatusText(due))}` : ''}</title>`;
            // el cuadro (invisible) que usa el resaltado al elegir su renglón: el símbolo, o los dos extremos de la ruta
            const hb = e.type === 'route' ? [Math.min(px, X(e.x2)) - 8, Math.min(py, Y(e.y2)) - 8, Math.abs(X(e.x2) - px) + 16, Math.abs(Y(e.y2) - py) + 16] : [px - rs - 4, py - rs - 4, 2 * rs + 8, 2 * rs + 8];
            s += `<rect class="hl-box" data-hlbox="safety:${esc(e.id)}" x="${hb[0].toFixed(1)}" y="${hb[1].toFixed(1)}" width="${hb[2].toFixed(1)}" height="${hb[3].toFixed(1)}" rx="3"/>`;
            if (e.type === 'route') {
                s += `<g class="lsafe" data-sfid="${esc(e.id)}"><circle cx="${px}" cy="${py}" r="3.4" fill="${LC.SAFETY_COLORS.route}" stroke="#14602F" stroke-width="0.9"/>${title}</g>${SG.safetyLabel(px, py - 7, e.code || '')}`;
                if (bad) s += `<circle class="lbad" cx="${px}" cy="${py}" r="9"/>`;
            } else {
                s += `<g class="lsafe" data-sfid="${esc(e.id)}">${SG.safetyGlyph(e.type, px, py, rs)}${title}</g>${SG.safetyLabel(px, py - rs - 3, e.code || '')}`;
                if (bad) s += `<circle class="lbad" cx="${px}" cy="${py}" r="${rs + 4}"/>`;
            }
            // por vencer = aro ámbar y vencido = aro rojo (con su palabra debajo), para verlos de lejos
            if (due.state === 'soon' || due.state === 'overdue' || due.state === 'fail') {
                const col = due.state === 'soon' ? '#E8892B' : '#C0392B';
                const rr = (e.type === 'route' ? 3.4 : rs) + 5;
                s += `<circle cx="${px}" cy="${py}" r="${rr}" fill="none" stroke="${col}" stroke-width="2.6" pointer-events="none"/>${SG.safetyLabel(px, py + rr + 8, t({ soon: 'main.layoutSgMapSoon', overdue: 'main.layoutSgMapLate', fail: 'main.layoutSgMapFail' }[due.state]), 'middle', col)}`;
            }
        });
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    // las esquinas (puntos), la medida de cada lado y la altura de cada esquina son del contorno: salen solo con el paso Contorno
    for (let i = 1; i <= ((finding && !dimmed) || !on('contorno') ? 0 : d.vertices.length); i++) {
        const w = LC.wallSegment(d.vertices, i);
        const mx = (w.p[0] + w.q[0]) / 2;
        const my = (w.p[1] + w.q[1]) / 2;
        const nx = w.uy;
        const ny = -w.ux;
        const out = ((mx - cx) * nx + (my - cy) * ny) >= 0 ? 1 : -1;
        if (sM) putOuter('lt2', X(mx) + nx * out * 15, Y(my) + ny * out * 15 + 3, 'middle', `P${i} · ${fmt(w.length)} m`);
    }
    ((finding && !dimmed) || !on('contorno') ? [] : d.vertices).forEach((p, i) => {
        s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.5" class="lv"/>`;
        if (sM) putOuter('lt2', X(p[0]) + (p[0] <= cx ? -8 : 8), Y(p[1]) + (p[1] <= cy ? -7 : 14), p[0] <= cx ? 'end' : 'start', `${i + 1} · ${fmt(p[2])} m`);
    });
    const bar = 5 * sc;
    s += `<line x1="${M}" y1="${H - 12}" x2="${M + bar}" y2="${H - 12}" class="lscale"/>`;
    putOuter('lt2', M + bar + 6, H - 8, 'start', '5 m');
    s = `${s.slice(0, halosAt)}${outerHalos}${s.slice(halosAt)}${outerLabels}`;
    $('layout-svg').innerHTML = s;
    applyFindDim(dimmed);
    applyHighlight(false);
    applyZoom(); // cada redibujo conserva el aumento y el lugar donde se estaba viendo
    scheduleScene3d(); // si se está viendo en 3D, la escena se vuelve a armar con el borrador
}

function renderSummary() {
    const k = LC.computeKpis(state.draft);
    const rows = k.zones.filter((z) => !state.find || z.id === findZoneId()).map((z) => `<tr><td>${esc(z.name)}</td><td>${esc(z.type ? typeLabel('zone', z.type) : t('main.layoutSinZona'))}</td><td>${esc(z.use ? typeLabel('use', z.use) : '—')}</td><td>${fmt(z.area)} m²</td><td>${z.spaces}</td><td>${fmt(z.footprint)} m²</td><td>${fmt(z.occupancy, 1)}%</td><td>${fmt(z.volume)} m³</td></tr>`);
    // Tabla del sistema: encabezado sombreado y, para quien tiene el icono Filtros en el árbol, el embudo de filtros de todas las tablas en cada encabezado (se vuelve a enganchar en cada dibujo y conserva los filtros).
    const filterable = !!(state.perms && state.perms.canFilterTables);
    const heads = ['main.layoutZona', 'main.layoutTipoZona', 'main.layoutUsoZona', 'main.layoutSuperficie', 'main.layoutEspacios', 'main.layoutHuella', 'main.layoutOcupacion', 'main.layoutVolumen'];
    const head = heads.map((k) => `<th${filterable ? ` data-col="${k}" class="layout-th-filter"` : ''}>${esc(t(k))}</th>`).join('');
    const note = filterable ? `<div class="layout-filter-note" data-filter-note="layout-resumen" hidden><span></span><button type="button" class="btn btn-secondary layout-toggle" data-filter-clear="layout-resumen" data-help-key="layoutFilterClear">${esc(t('main.layoutFiltroQuitar'))}</button></div>` : '';
    $('layout-summary').innerHTML = rows.length
        ? `${note}<div class="layout-scroll"><table class="layout-table layout-summary-table"${filterable ? ' data-filter-table="layout-resumen"' : ''}><thead><tr>${head}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
        : `<p class="layout-muted">${esc(t('main.layoutSinZonas'))}</p>`;
    bindLayoutFilters($('layout-summary'));
}

// Cada vez que cambia el borrador: KPIs, croquis, resumen y estado del botón Guardar. El formulario NO se redibuja (así no se pierde el cursor al teclear).
function refreshLive() {
    // una puerta cuya pared ya no existe se queda sin pared; el lugar en el piso, la zona, el alto y el formato de cada activo salen de su huella (LayoutCalc.deriveSpaces): se vuelven a sacar con cada cambio
    syncWallItems();
    syncHuellas();
    state.draft.spaces = LC.deriveSpaces(state.draft).spaces;
    computeFootprintIssues();
    computeSpaceIssues();
    state.draft.footprints.forEach((f, i) => {
        const codeCell = document.querySelector(`[data-fp-code="${i}"]`);
        if (codeCell) codeCell.textContent = f.code;
    });
    applyFootprintMarks();
    applyActivoMarks();
    state.draft.zones.forEach((z, i) => { const cell = document.querySelector(`[data-zone-code="${i}"]`); if (cell) cell.textContent = z.code; });
    // el código, la zona y los m² de cada pasillo salen de su lugar: se vuelven a sacar con cada cambio
    applyWallItemMarks();
    // el código de cada pared lo pone el sistema: se vuelve a sacar con cada cambio
    (state.draft.obstacles || []).forEach((o, i) => { const cell = document.querySelector(`[data-wall-code="${i}"]`); if (cell) cell.textContent = o.code || ''; });
    computeTransitIssues();
    (state.draft.transit || []).forEach((p, i) => {
        const codeCell = document.querySelector(`[data-tr-code="${i}"]`);
        if (codeCell) codeCell.textContent = p.code || '';
        const areaCell = document.querySelector(`[data-tr-area="${i}"]`);
        if (areaCell) areaCell.textContent = `${fmt((Number(p.l) || 0) * (Number(p.w) || 0))} m²`;
    });
    applyTransitMarks();
    // el código (según su tipo) y la zona de cada elemento de seguridad salen de su tipo y de su lugar: se vuelven a sacar con cada cambio
    applySafetyMarks();
    // el código y la zona de cada sensor salen de la pared donde se puso: se vuelven a sacar con cada cambio
    (state.draft.sensors || []).forEach((s, i) => {
        const codeCell = document.querySelector(`[data-sensor-code="${i}"]`);
        if (codeCell) codeCell.textContent = s.code || '';
        const zoneCell = document.querySelector(`[data-sensor-zone="${i}"]`);
        if (zoneCell) zoneCell.textContent = (state.draft.zones.find((z) => z.id === s.zoneId) || {}).name || '—';
    });
    state.draft.spaces.forEach((s, i) => { const cell = document.querySelector(`[data-sp-code="${i}"]`); if (cell) cell.textContent = s.code; });
    state.draft.heightM = Math.round((state.draft.vertices.reduce((acc, p) => acc + (Number(p[2]) || 0), 0) / Math.max(state.draft.vertices.length, 1)) * 100) / 100;
    renderKpis();
    renderSvg();
    renderSummary();
    renderFindBox();
    applyFindToTables();
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
    state.draft.footprints.forEach((s, i) => { const c = document.querySelector(`[data-space-calc="${i}"]`); if (c) c.textContent = `${fmt(s.l * s.d)} m² · ${fmt(s.l * s.d * s.h)} m³`; });
}

function showEmpty() {
    updateQrMenu();
    $('layout-choose-center').hidden = true;
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
// Icono Ver / ocultar los nombres de las zonas: igual que los de medidas y m² (se recuerda en este navegador, solo lo ve quien lo tiene en el árbol y la hoja que se descarga sale como se ve).
// Sin nombres, los m² (si se ven) ocupan el lugar del nombre.
const NAMES_KEY = 'sgn_layout_names';
function updateNamesBtn() {
    const btn = $('layout-names-btn');
    btn.hidden = !(state.perms && state.perms.canToggleNames);
    btn.setAttribute('aria-pressed', String(state.showNames));
    btn.classList.toggle('off', !state.showNames);
    btn.setAttribute('aria-label', t(state.showNames ? 'main.layoutNombresOcultar' : 'main.layoutNombresVer'));
}
try { state.showNames = localStorage.getItem(NAMES_KEY) !== '0'; } catch (err) { /* sin almacenamiento: se ven */ }
$('layout-names-btn').addEventListener('click', () => {
    state.showNames = !state.showNames;
    try { localStorage.setItem(NAMES_KEY, state.showNames ? '1' : '0'); } catch (err) { /* no se recuerda */ }
    updateNamesBtn();
    if (state.draft) renderSvg();
});
// Icono Girar el croquis: da un cuarto de vuelta a la derecha cada vez (0°, 90°, 180°, 270°); se recuerda en este navegador y la hoja que se descarga sale con ese giro.
const ROTATION_KEY = 'sgn_layout_rotation';
function updateRotateBtn() {
    const btn = $('layout-rotate-btn');
    btn.hidden = !(state.perms && state.perms.canRotate);
    btn.classList.toggle('off', !state.rotation);
    btn.setAttribute('aria-pressed', String(!!state.rotation));
    btn.setAttribute('aria-label', `${t('main.layoutGirarBtn')} (${state.rotation * 90}°)`);
    btn.title = `${t('main.layoutGirarBtn')} (${state.rotation * 90}°)`;
}
try { state.rotation = Math.max(0, Math.min(3, parseInt(localStorage.getItem(ROTATION_KEY), 10) || 0)); } catch (err) { /* sin almacenamiento: sin giro */ }
$('layout-rotate-btn').addEventListener('click', () => {
    state.rotation = ((state.rotation || 0) + 1) % 4;
    try { localStorage.setItem(ROTATION_KEY, String(state.rotation)); } catch (err) { /* no se recuerda */ }
    resetZoom(); // el croquis girado cambia de forma: se vuelve a ver completo
    updateRotateBtn();
    if (state.draft) renderSvg();
});
$('layout-area-btn').addEventListener('click', () => {
    state.showArea = !state.showArea;
    try { localStorage.setItem(AREA_KEY, state.showArea ? '1' : '0'); } catch (err) { /* no se recuerda */ }
    updateAreaBtn();
    if (state.draft) renderSvg();
});
function showEditor() {
    updateQrMenu();
    updateViewBtns();
    updateMeasuresBtn();
    updateAreaBtn();
    updateNamesBtn();
    updateRotateBtn();
    updateTextsMenu();
    updateZoomUi();
    $('layout-empty').hidden = true;
    $('layout-choose-center').hidden = true;
    $('layout-plan-width').hidden = true;
    $('layout-editor').hidden = false;
    renderPanel();
    refreshLive();
}

// ---- cargar el Layout guardado -----------------------------------------------------------------------------------------
// Las clasificaciones y los tipos de activo del cliente (catálogos Nuestras Clasificaciones de Activos y Nuestros Activos Fijos). Si no se pueden leer, el paso Activos sale sin opciones.
async function loadAssetLists() {
    const read = async (type) => {
        try {
            const r = await fetch(`/api/business/article-categories/${type}`, { credentials: 'include' });
            if (!r.ok) return [];
            return ((await r.json()).categories || []).map((c) => ({ id: c.id, name: c.name, status: c.status })).filter((c) => c.name || c.status === 'active');
        } catch (err) { console.error('Layout: no se pudo leer la lista de activos', err); return []; }
    };
    const [classes, types] = await Promise.all([read('activos-clasificacion'), read('activos-fijos')]);
    assetLists = { classes, types };
}

// El Layout es de UN centro de costos: el que está elegido en el selector de arriba. Todas las llamadas al servidor llevan ese centro (el que se cargó, aunque el selector cambie mientras tanto).
function layoutUrl(url) {
    return state.centerId ? `${url}${url.includes('?') ? '&' : '?'}costCenterId=${state.centerId}` : url;
}
function updateCenterChip() {
    const chip = $('layout-center-chip');
    chip.hidden = !state.costCenter;
    if (state.costCenter) chip.textContent = t('main.layoutCentroChip', { name: state.costCenter.name });
}
// Sin un solo centro elegido (varios marcados o ninguno) no hay Layout que mostrar: se pide elegir uno.
function showChooseCenter() {
    state.draft = null;
    state.saved = null;
    state.costCenter = null;
    state.loaded = true;
    updateCenterChip();
    $('layout-empty').hidden = true;
    $('layout-editor').hidden = true;
    $('layout-plan-width').hidden = true;
    $('layout-choose-center').hidden = false;
    renderKpis();
}
async function loadLayout() {
    await loadAssetLists();
    state.centerId = Dashboard.getSingleSelectedCostCenterId();
    if (!state.centerId) { showChooseCenter(); return; }
    const res = await fetch(layoutUrl('/api/business/layout'), { credentials: 'include' });
    if (!res.ok) throw new Error('layout load failed');
    const body = await res.json();
    state.costCenter = body.costCenter;
    updateCenterChip();
    $('layout-choose-center').hidden = true;
    state.perms = body.permissions;
    state.version = body.version;
    state.saved = body.layout;
    state.safetyLast = body.safetyLast || {};
    sfLastFetchedAt = Date.now();
    state.creating = false;
    state.planNew = false;
    state.planImage = '';
    state.draft = body.layout ? clone(body.layout) : null;
    initEditState();
    if (body.layout && body.hasPlanImage) {
        try {
            const imgRes = await fetch(layoutUrl('/api/business/layout/plan-image'), { credentials: 'include' });
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
const ROW_FACTORY = {
    vertices: () => { const last = state.draft.vertices[state.draft.vertices.length - 1] || [0, 0, 9]; return [last[0], last[1], last[2]]; },
    doors: () => { const wall = (state.draft.obstacles || []).find((o) => o.kind === 'wall'); return { id: uid('d'), name: t('main.layoutPuertaNueva'), type: 'dock', wallId: wall ? wall.id : '', dist: 0, width: 1.2, height: 2.1 }; },
    // una conexión de luz o un sensor nuevo nace sobre la primera pared (sin paredes no se puede agregar)
    power: () => { const wall = (state.draft.obstacles || []).find((o) => o.kind === 'wall'); return { id: uid('p'), type: 'outlet110', wallId: wall ? wall.id : '', dist: 1, height: 1.2 }; },
    sensors: () => { const wall = (state.draft.obstacles || []).find((o) => o.kind === 'wall'); return { id: uid('n'), code: '', type: 'both', zoneId: '', wallId: wall ? wall.id : '', dist: 1, height: 2.5 }; },
    // un elemento de seguridad nuevo nace como extintor en el centro de la nave (corrido un poco para que no se encimen); se acomoda con X e Y y se le cambia el tipo en la lista
    safety: () => {
        const d = state.draft;
        const xs = d.vertices.map((p) => p[0]);
        const ys = d.vertices.map((p) => p[1]);
        const n = (d.safety || []).length;
        return { id: uid('g'), code: '', type: 'extinguisher', name: '', zoneId: '', x: round2((Math.min(...xs) + Math.max(...xs)) / 2 + (n % 5) * 1.5), y: round2((Math.min(...ys) + Math.max(...ys)) / 2 + Math.floor(n / 5) * 1.5) };
    },
    // un pasillo nuevo nace dentro de la primera zona con tipo (para que no empiece fuera de toda zona); sin zonas, cerca de la esquina
    transit: () => {
        const z = state.draft.zones.find((r) => r.type && !Array.isArray(r.pts) && r.l > 2 && r.w > 2);
        const l = z ? Math.min(10, round2(z.l - 2)) : 10;
        const w = z ? Math.min(3, round2(z.w - 2)) : 3;
        // lo que transita de entrada: el primer renglón activo de personas del catálogo «Lo que transita» (si no hay catálogo, la clave de antes)
        const person = LC.transitCatalogOf(state.draft).find((c) => c.kind === 'person' && c.status === 'active');
        return { id: uid('t'), code: '', name: `${t('main.layoutPasillo')} ${(state.draft.transit || []).length + 1}`, type: 'main', who: [person ? person.id : 'people'], zoneId: '', x: z ? round2(z.x + 1) : 1, y: z ? round2(z.y + 1) : 1, l, w };
    },
    obstacles: () => ({ id: uid('o'), name: t('main.layoutColumna'), kind: 'column', mode: 'free', x: 1, y: 1, l: 0.6, w: 0.6 }),
    zones: () => ({ id: uid('z'), name: `${t('main.layoutZona')} ${state.draft.zones.length + 1}`, code: '', type: 'dry', x: 1, y: 1, l: 5, w: 5, active: true }),
    // una huella nueva no puede ser más alta que la nave: mide 4.5 m de alto o, si la nave es más baja, lo que mide la nave
    footprints: () => ({ id: uid('f'), code: '', zoneId: '', x: 1, y: 1, l: 3, d: 1.1, h: Math.min(4.5, Math.max(...state.draft.vertices.map((p) => Number(p[2]) || 0)) || 4.5), active: true }),
    // un activo siempre va dentro de una huella: nace sin huella y hay que elegirla (no se puede guardar hasta entonces)
    spaces: () => ({ id: uid('s'), footprintId: '', type: 'rack', code: '', levels: 1, drawers: '' }),
};
const STEP_OF_LIST = { vertices: 'contorno', obstacles: 'contorno', doors: 'puertas', power: 'luz', sensors: 'sensores', safety: 'seguridad', transit: 'transito', objects: 'objetos', zones: 'zonas', footprints: 'espacios', spaces: 'activos', bay: 'posiciones' };
// Los códigos los pone el sistema y no se editan: el de la zona (Z001…, consecutivo), el de la huella (H001… por zona, y su zona sale de dónde está en el croquis) y el del activo (letra de su tipo + número
// consecutivo por zona y tipo: A001, G001…). Lo que ya estaba guardado y sigue igual conserva su código; lo nuevo (todavía sin guardar) y lo que cambió de zona o de tipo lo recibe cada vez que se acomoda,
// así siempre es el que le toca, el mismo que le pondrá el servidor al guardar.
function syncHuellas() {
    const d = state.draft;
    const next = LC.lockCodes(LC.deriveSafetyZones(LC.deriveTransitZones(LC.deriveSensorZones(LC.deriveSpaces(LC.deriveFootprintZones(d))))), state.saved);
    d.transit = next.transit || d.transit || [];
    // los objetos toman del catálogo su dibujo y sus medidas (y las claves de antes pasan a los ids)
    const withCatalog = LC.applyTransitCatalog(d);
    d.objects = withCatalog.objects || d.objects;
    d.transit = withCatalog.transit || d.transit;
    d.zones = next.zones;
    d.footprints = next.footprints;
    d.sensors = next.sensors;
    // las paredes: su código (M001…) y el contador de los números ya dados viajan con el Layout (sin él no se guarda ese campo)
    d.obstacles = next.obstacles || d.obstacles;
    if (next.wallNext) d.wallNext = next.wallNext; else delete d.wallNext;
    // los elementos de seguridad: su zona y su código (cada tipo con su letra); el contador de los números ya dados viaja con el Layout (sin él no se guarda ese campo)
    d.safety = next.safety || d.safety || [];
    if (next.safetyNext && Object.keys(next.safetyNext).length) d.safetyNext = next.safetyNext; else delete d.safetyNext;
    d.spaces = state.renumber ? LC.renumberSpaceCodes(next).spaces : next.spaces; // Renumerar: consecutivos desde 001 por zona y tipo
}

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
    } else if (list === 'safetyWarn') {
        // los días de aviso de «Por vencer»: de fábrica 30 (solo se guarda si es otro número, de 1 a 365)
        const n = Math.round(value);
        if (n >= 1 && n <= 365 && n !== LC.SAFETY_WARN_DAYS) state.draft.safetyWarnDays = n; else delete state.draft.safetyWarnDays;
    } else if (list === 'allHeights') {
        // Misma altura en todas las esquinas: se escribe una vez y se copia a cada renglón (los renglones ya dibujados se actualizan sin redibujar el formulario).
        if (value > 0) {
            state.draft.vertices.forEach((p, i) => {
                p[2] = value;
                const box = document.querySelector(`[data-l="vertices"][data-i="${i}"][data-k="2"]`);
                if (box) box.value = value;
            });
        }
    } else if (list === 'bay') {
        // Un hueco (nivel × columna) de un activo: solo se guarda lo que se cambió; lo que vuelve a ser como lo de por defecto (1 fila, 1 profundidad) se quita.
        const space = state.draft.spaces[Number(el.getAttribute('data-i'))];
        const n = Number(el.getAttribute('data-n'));
        const c = Number(el.getAttribute('data-c'));
        const bayKey = el.getAttribute('data-k');
        if (!space.bays) space.bays = [];
        let bay = space.bays.find((b) => b.n === n && b.c === c);
        if (!bay) { bay = { n, c }; space.bays.push(bay); }
        if (bayKey === 'rows' || bayKey === 'depth') {
            const v = Math.max(1, Math.round(value) || 1);
            if (v > 1) bay[bayKey] = Math.min(v, bayKey === 'rows' ? LC.LIMITS.slots : LC.LIMITS.depth); else delete bay[bayKey];
        } else if (value > 0) bay[bayKey] = value; else delete bay[bayKey];
        if (Object.keys(bay).length <= 2) space.bays = space.bays.filter((b) => b !== bay);
        if (!space.bays.length) delete space.bays;
        const shownBay = LC.bayOf(space, n, c);
        const cap = document.querySelector(`[data-bay-cap="${el.getAttribute('data-i')}|${n}|${c}"]`);
        if (cap) cap.textContent = String(shownBay.rows * shownBay.depth);
    } else if (list === 'transitSizes') {
        // las medidas de lo que transita (ancho, largo y alto, en metros): vacío = sin medida (no se revisa)
        const [who, dim] = String(el.getAttribute('data-k')).split(':');
        state.draft.transitSizes = state.draft.transitSizes || LC.transitSizesOf(state.draft);
        state.draft.transitSizes[who] = { ...(state.draft.transitSizes[who] || { w: 0, l: 0, h: 0 }), [dim]: value > 0 ? value : 0 };
    } else if (list === 'vertices') {
        state.draft.vertices[Number(el.getAttribute('data-i'))][Number(el.getAttribute('data-k'))] = value;
        state.open.contorno = false;
    } else {
        const row = state.draft[list][Number(el.getAttribute('data-i'))];
        const key = el.getAttribute('data-k');
        if (list === 'objects' && key === 'equipId') {
            setObjectEquip(row, el.value);
        } else if (list === 'safety' && (key === 'expires' || key === 'next')) {
            // las fechas son opcionales: vacío = el elemento se guarda sin ella
            const raw = String(el.value).trim();
            if (raw) row[key] = raw; else delete row[key];
        } else if (list === 'safety' && key === 'every') {
            const n = Math.round(parseFloat(el.value));
            if (n >= 1) row.every = Math.min(n, 3650); else delete row.every;
        } else if (list === 'safety' && ['elev', 'l', 'w', 'h'].includes(key)) {
            // la altura al piso y el tamaño son opcionales: vacío = la medida de fábrica de su tipo
            const raw = String(el.value).trim();
            const n = parseFloat(raw);
            if (raw !== '' && Number.isFinite(n) && n >= (key === 'elev' ? 0 : 0.01)) row[key] = Math.min(n, key === 'l' || key === 'w' ? LC.LIMITS.maxM : LC.LIMITS.maxHeight); else delete row[key];
        } else if (list === 'safety' && key === 'type') {
            setSafetyType(row, el.value);
        } else if (list === 'transit' && key === 'h') {
            // el alto libre es opcional: vacío = no se revisa el alto
            const raw = String(el.value).trim();
            const n = parseFloat(raw);
            if (raw !== '' && Number.isFinite(n) && n > 0) row.h = n; else delete row.h;
        } else if (list === 'obstacles' && (key === 'h' || key === 'h2')) {
            // la altura de una pared es opcional y por esquina (h al inicio, h2 al final): vacío = la de siempre (la del contorno en ese extremo o el promedio de la nave)
            const raw = String(el.value).trim();
            const n = parseFloat(raw);
            if (raw !== '' && Number.isFinite(n) && n >= 0.01) row[key] = Math.min(n, LC.LIMITS.maxHeight); else delete row[key];
        } else if (list === 'obstacles' && (key === 'kind' || key === 'mode')) {
            setObstacleKindOrMode(row, key, el.value);
        } else if (list === 'zones' && (key === 'ox' || key === 'oy')) {
            // una zona de forma libre se mueve completa desde su primera esquina
            const o = row.pts[0] || [row.x, row.y];
            const dx = key === 'ox' ? value - o[0] : 0;
            const dy = key === 'oy' ? value - o[1] : 0;
            row.pts = row.pts.map((p) => [round2(p[0] + dx), round2(p[1] + dy)]);
            syncZoneBox(row);
        } else if (key === 'assetClassId' || key === 'assetId') {
            const n = parseInt(el.value, 10);
            if (n > 0) row[key] = n; else delete row[key]; // sin elegir = el espacio se guarda sin ese campo
        } else if (OWN_KEYS.includes(key)) {
            // el lugar y las medidas propias del activo dentro de su huella: vacío = se acomoda solo
            const raw = String(el.value).trim();
            const n = parseFloat(raw);
            if (raw !== '' && Number.isFinite(n) && n >= (key === 'ox' || key === 'oy' ? 0 : 0.01)) row[key] = n; else delete row[key];
        } else if (RANGE_KEYS.includes(key)) {
            // el rango del refrigerador: vacío = sin ese límite
            const raw = String(el.value).trim();
            const n = parseFloat(raw);
            if (raw !== '' && Number.isFinite(n)) row[key] = n; else delete row[key];
        } else if (key === 'planM2') {
            if (value > 0) row.planM2 = value; else delete row.planM2;
        } else if (list === 'footprints' && key === 'name') {
            if (String(value).trim()) row.name = String(value); else delete row.name; // sin nombre = la huella se guarda sin ese campo
        } else if (key === 'use') {
            if (value) row.use = value; else delete row.use; // sin definir = la zona se guarda sin ese campo
        } else if (key === 'slots') {
            const n = Math.max(1, Math.round(value) || 1);
            if (n > 1) row.slots = Math.min(n, LC.LIMITS.slots); else delete row.slots;

        } else row[key] = (key === 'wall' || key === 'levels') ? Math.max(1, Math.round(value) || 1) : value;
    }
    // Al cambiar el nombre de una zona, el selector de zona de los espacios debe mostrar el nombre nuevo (solo al terminar de escribir).
    if (event.type === 'change' && list === 'zones' && el.getAttribute('data-k') === 'name') renderPanel();
    // Al cambiar el tipo o la forma de ponerlo de un obstáculo cambian las celdas del renglón (altura del desnivel, lado o X).
    if (event.type === 'change' && list === 'obstacles' && ['kind', 'mode'].includes(el.getAttribute('data-k'))) renderPanel();
    // Al cambiar de persona a montacargas cambian sus medidas (si eran las de partida) y su nombre.
    if (event.type === 'change' && list === 'objects' && el.getAttribute('data-k') === 'equipId') renderPanel();
    // Al cambiar el tipo de un elemento de seguridad cambian sus celdas (la ruta lleva punto de llegada) y su código.
    if (event.type === 'change' && list === 'safety' && el.getAttribute('data-k') === 'type') renderPanel();
    // Al pasar un activo a otra huella cambia su zona (que se ve en el renglón).
    if (event.type === 'change' && list === 'spaces' && el.getAttribute('data-k') === 'footprintId') renderPanel();
    refreshLive();
}
$('layout-panel').addEventListener('focusin', (event) => selectRowFrom(event.target));
$('layout-panel').addEventListener('click', (event) => selectRowFrom(event.target));
$('layout-panel').addEventListener('input', onEdit);
$('layout-panel').addEventListener('change', onEdit);
$('layout-panel').addEventListener('click', (event) => {
    const stepBtn = event.target.closest('[data-step]');
    if (stepBtn) {
        pressStep(stepBtn.dataset.step);
        renderPanel();
        refreshLive();
        if (stepBtn.dataset.step === 'activos') loadAssetLists().then(() => { if (state.focus === 'activos') renderPanel(); });
        return;
    }
    const cmode = event.target.closest('[data-cmode]');
    if (cmode) { state.contornoMode = cmode.dataset.cmode; renderPanel(); renderSvg(); scheduleScene3d(); return; } // el dibujo (y el 3D) se vuelve a armar: sus zonas de toque (lados o esquinas) dependen del modo
    const sadd = event.target.closest('[data-sadd]');
    if (sadd) { if (sadd.dataset.sadd === 'contorno') clearFilterOf('contornoLados'); addSide(sadd.dataset.sadd); panelScrollEnd = true; renderPanel(); refreshLive(); return; }
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
        if (v.slice(0, at) === 'contorno') clearFilterOf('contornoLados');
        insertSide(v.slice(0, at), Number(v.slice(at + 1)));
        renderPanel();
        refreshLive();
        return;
    }
    const sclose = event.target.closest('[data-sclose]');
    if (sclose) { if (sclose.dataset.sclose === 'contorno') clearFilterOf('contornoLados'); closeSides(sclose.dataset.sclose); renderPanel(); refreshLive(); return; }
    const sline = event.target.closest('[data-sline]');
    if (sline) { if (sline.dataset.sline === 'contorno') clearFilterOf('contornoLados'); closeLine(sline.dataset.sline); renderPanel(); refreshLive(); return; }
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
    const fmtAsset = event.target.closest('[data-fmtasset]');
    if (fmtAsset) { openAssetFmtDialog(Number(fmtAsset.dataset.fmtasset)); return; }
    const fmtSpace = event.target.closest('[data-fmtspace]');
    if (fmtSpace) { openSpaceFmtDialog(Number(fmtSpace.dataset.fmtspace)); return; }
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
        panelScrollEnd = true;
        renderPanel();
        refreshLive();
        return;
    }
    if (event.target.closest('[data-walls-all]')) { addAllWalls(); return; }
    if (event.target.closest('[data-add-wall]')) { addWall(); return; }
    const whoOpen = event.target.closest('[data-who-open]');
    if (whoOpen) { openWhoPop(Number(whoOpen.dataset.whoOpen), whoOpen); return; }
    const whoDel = event.target.closest('[data-who-del]');
    if (whoDel) { toggleTransitWho(whoDel.dataset.whoDel, false); return; }
    const addObj = event.target.closest('[data-add-object]');
    if (addObj) { addObject(addObj.dataset.addObject); return; }
    const add = event.target.closest('[data-add]');
    if (add) {
        const list = add.dataset.add;
        const noWallMsg = { doors: 'main.layoutPuertaSinPared', power: 'main.layoutLuzSinPared', sensors: 'main.layoutSensorSinPared' }[list];
        if (noWallMsg && !(state.draft.obstacles || []).some((o) => o.kind === 'wall')) { Dashboard.showToast(t(noWallMsg), 'warning'); return; }
        if (list === 'zones') clearLayoutFilters();
        clearFilterOf(list);
        // una huella nueva es SOLO la huella (el lugar en el piso): los activos que se pongan encima se dan de alta después, en el paso Activos
        (state.draft[list] = state.draft[list] || []).push(ROW_FACTORY[list]());
        if (list === 'vertices') state.open.contorno = false;
        panelScrollEnd = true;
        renderPanel();
        refreshLive();
        return;
    }
    const del = event.target.closest('[data-del]');
    if (del) {
        const [list, index] = del.dataset.del.split(':');
        const removed = state.draft[list].splice(Number(index), 1)[0];
        if (list === 'obstacles' && removed && removed.kind === 'wall') {
            const orphan = WALL_ITEM_LISTS.reduce((n, wl) => n + (state.draft[wl] || []).filter((item) => item.wallId === removed.id).length, 0);
            if (orphan) Dashboard.showToast(t('main.layoutPuertasSinPared', { n: orphan }), 'warning');
        }
        // quitar una huella quita también sus activos
        if (list === 'footprints' && removed) state.draft.spaces = state.draft.spaces.filter((s) => s.footprintId !== removed.id);
        if (list === 'zones' && removed) { delete state.open.zones[removed.id]; if (state.zoneOpen === removed.id) state.zoneOpen = null; if (state.catsOpen === removed.id) state.catsOpen = null; }
        if (list === 'vertices') {
            state.open.contorno = false;
            const walls = state.draft.vertices.length;
            state.draft.doors.forEach((d) => { if (d.wall > walls) d.wall = walls; });
            state.draft.power.forEach((p) => { if (p.wall > walls) p.wall = walls; });
            (state.draft.sensors || []).forEach((p) => { if (p.wall > walls) p.wall = walls; });
            clampObstacleSides();
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
            if (list === 'footprints') state.draft.spaces = state.draft.spaces.filter((s) => s.footprintId !== row.id);
            if (list === 'zones') { delete state.open.zones[row.id]; if (state.zoneOpen === row.id) state.zoneOpen = null; if (state.catsOpen === row.id) state.catsOpen = null; }
            // Los espacios de una zona eliminada quedan sin zona (así también los deja el servidor al guardar).
            if (list === 'zones') state.draft.footprints.forEach((f) => { if (f.zoneId === row.id) f.zoneId = ''; });
            renderPanel();
            refreshLive();
        });
        return;
    }
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
        const [list, index] = toggle.dataset.toggle.split(':');
        const row = state.draft[list][Number(index)];
        // un activo se apaga solo a él (off); una huella, con sus activos (active)
        if (list === 'spaces') { if (row.off) delete row.off; else row.off = true; } else row.active = row.active === false;
        renderPanel();
        refreshLive();
    }
});

// ---- formato de la zona y de la huella (color, rayas y borde, como Formato de celdas de Excel) -----------------------------------------------
// El icono de paleta de cada zona (paso Zonas) y de cada huella (paso Huella-Espacio) abre esta ventana: pestaña Relleno (color de fondo, rayas o patrón y su color) y pestaña Borde (estilo de línea y color), con
// vista previa. Los colores se eligen con la misma ventana "Colores" de los árboles (ColorDialog.js). Nada cambia hasta pulsar Aceptar. Sin formato propio, la zona usa el color de su tipo y la huella
// queda blanca; "Quitar formato" la regresa ahí. En una huella hay además "Aplicar a": solo esa, las demás de su zona o las del mismo tipo de activo (así pintar 40 racks no es hacerlo 40 veces).
const FMT_PATTERNS = ['none', 'solid', 'diag1', 'diag2', 'horiz', 'vert', 'grid', 'dots', 'cross'];
const FMT_LINES = ['none', 'thin', 'mid', 'thick', 'dash', 'dot', 'dashdot', 'double'];
const FMT_LINE_SAMPLE = { none: [0, ''], thin: [1.2, ''], mid: [2.4, ''], thick: [4, ''], dash: [2, '8 5'], dot: [2.4, '1.5 4'], dashdot: [2, '9 4 2 4'] };
let fmtDialog = null; // { kind: 'zone' | 'space', targetId, draft, start, tab, name, scope: 'one' | 'zone' | 'type' (solo huellas) }
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
// El icono de paleta de cada renglón de Huella-Espacio (solo con la hoja del icono en el árbol); el cuadrito de color aparece cuando la huella ya tiene el suyo.
function spaceFmtButton(s, i, dis) {
    if (!(state.perms && state.perms.canFormatSpaces)) return '';
    return `<button type="button" class="btn btn-secondary layout-toggle layout-fmt${s.fmt ? ' on' : ''}" data-fmtspace="${i}" data-help-key="layoutSpaceFmt" aria-label="${esc(t('main.layoutFormatoHuella'))} ${esc(s.code)}"${dis ? ' disabled' : ''}><i class="bx bx-palette" aria-hidden="true"></i>${s.fmt ? `<span class="layout-fmt-dot" style="background:${esc(s.fmt.fill)};border-color:${esc(s.fmt.bcolor)}"></span>` : ''}</button>`;
}
// El icono de paleta de cada renglón de Activos (solo con la hoja del icono en el árbol): el color propio del activo, aparte del de su huella.
function assetFmtButton(s, i, dis) {
    if (!(state.perms && state.perms.canFormatAssets)) return '';
    return `<button type="button" class="btn btn-secondary layout-toggle layout-fmt${s.fmt ? ' on' : ''}" data-fmtasset="${i}" data-help-key="layoutAssetFmt" aria-label="${esc(t('main.layoutFormatoActivo'))} ${esc(s.code)}"${dis ? ' disabled' : ''}><i class="bx bx-palette" aria-hidden="true"></i>${s.fmt ? `<span class="layout-fmt-dot" style="background:${esc(s.fmt.fill)};border-color:${esc(s.fmt.bcolor)}"></span>` : ''}</button>`;
}
// A qué activos se aplica lo que se elige en la ventana: solo a ese, a los de su zona o a los del mismo tipo (anaquel, rack, gabeta o tarima).
function assetTargets(a, scope) {
    const all = state.draft.spaces;
    if (scope === 'zone' && a.zoneId) return all.filter((x) => x.zoneId === a.zoneId);
    if (scope === 'type') return all.filter((x) => (x.type || 'rack') === (a.type || 'rack'));
    return [a];
}
// Aplica un cambio de formato y, si deja algo adentro con el color de lo que lo contiene (huella con el de su zona, activo con el de su huella), lo deshace y avisa en la ventana. Lo que ya estaba así antes no cuenta.
function tryFmtChange(change) {
    const all = [...state.draft.zones, ...state.draft.footprints, ...state.draft.spaces];
    const before = new Map(all.map((o) => [o, JSON.stringify(o.fmt || null)]));
    change();
    const fresh = LC.newColorClashes(state.draft, state.saved);
    if (!fresh.length) return true;
    before.forEach((json, o) => { if (json === 'null') delete o.fmt; else o.fmt = JSON.parse(json); });
    const c = fresh[0];
    const box = $('layout-fmt-error');
    box.textContent = t(`main.layoutColorChoque_${c.kind}`, { code: c.code, parent: c.parentName });
    box.hidden = false;
    return false;
}
// El tipo de activo de una huella para agrupar: el del primer activo que tiene uno elegido (0 = ninguno).
function firstAssetId(fp) {
    const a = state.draft.spaces.find((s) => s.footprintId === fp.id && s.assetId);
    return a ? a.assetId : 0;
}
// A qué huellas se aplica lo que se elige en la ventana: solo a esa, a las de su zona o a las que tienen un activo del mismo tipo (una huella sin zona o sin tipo no tiene ese grupo y se queda sola).
function spaceTargets(sp, scope) {
    const all = state.draft.footprints;
    if (scope === 'zone' && sp.zoneId) return all.filter((x) => x.zoneId === sp.zoneId);
    const type = firstAssetId(sp);
    if (scope === 'type' && type) return all.filter((x) => state.draft.spaces.some((s) => s.footprintId === x.id && s.assetId === type));
    return [sp];
}
function renderFmtScope() {
    const box = $('layout-fmt-scope');
    if (fmtDialog && fmtDialog.kind === 'asset') {
        const a = state.draft.spaces.find((s) => s.id === fmtDialog.targetId);
        box.hidden = !a;
        if (!a) return;
        const zoneName = (state.draft.zones.find((z) => z.id === a.zoneId) || {}).name || '';
        const options = [
            ['one', t('main.layoutAplicarUnaActivo'), a.code, false],
            ['zone', t('main.layoutAplicarZonaActivo'), a.zoneId ? t('main.layoutAplicarZonaSubActivo').replace('{zone}', zoneName).replace('{n}', String(assetTargets(a, 'zone').length)) : t('main.layoutAplicarSinZona'), !a.zoneId],
            ['type', t('main.layoutAplicarTipoActivo'), t('main.layoutAplicarTipoSubActivo').replace('{type}', typeLabel('space', a.type || 'rack')).replace('{n}', String(assetTargets(a, 'type').length)), false],
        ];
        box.innerHTML = `<legend>${esc(t('main.layoutAplicarA'))}</legend>${options.map(([value, title, sub, disabled]) => `<label class="layout-fmt-opt${disabled ? ' off' : ''}" data-help-key="layoutFmtScope"><input type="radio" name="layout-fmt-scope" value="${value}"${fmtDialog.scope === value ? ' checked' : ''}${disabled ? ' disabled' : ''}><b>${esc(title)}</b><span>${esc(sub)}</span></label>`).join('')}`;
        return;
    }
    const sp = fmtDialog && fmtDialog.kind === 'space' ? state.draft.footprints.find((s) => s.id === fmtDialog.targetId) : null;
    box.hidden = !sp;
    if (!sp) return;
    const zoneName = (state.draft.zones.find((z) => z.id === sp.zoneId) || {}).name || '';
    const type = firstAssetId(sp);
    const typeRow = assetLists.types.find((r) => r.id === type);
    const typeName = typeRow ? (typeRow.name || t('main.whNoName')) : `#${type}`;
    const options = [
        ['one', t('main.layoutAplicarUna'), sp.code, false],
        ['zone', t('main.layoutAplicarZona'), sp.zoneId ? t('main.layoutAplicarZonaSub').replace('{zone}', zoneName).replace('{n}', String(spaceTargets(sp, 'zone').length)) : t('main.layoutAplicarSinZona'), !sp.zoneId],
        ['type', t('main.layoutAplicarTipo'), type ? t('main.layoutAplicarTipoSub').replace('{type}', typeName).replace('{n}', String(spaceTargets(sp, 'type').length)) : t('main.layoutAplicarSinTipo'), !type],
    ];
    box.innerHTML = `<legend>${esc(t('main.layoutAplicarA'))}</legend>${options.map(([value, title, sub, disabled]) => `<label class="layout-fmt-opt${disabled ? ' off' : ''}" data-help-key="layoutFmtScope"><input type="radio" name="layout-fmt-scope" value="${value}"${fmtDialog.scope === value ? ' checked' : ''}${disabled ? ' disabled' : ''}><b>${esc(title)}</b><span>${esc(sub)}</span></label>`).join('')}`;
}
function renderFmtBody() {
    const d = fmtDialog.draft;
    const clashBox = $('layout-fmt-error');
    if (clashBox) clashBox.hidden = true;
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
    const isSpace = fmtDialog.kind !== 'zone';
    const shape = isSpace ? '60,45 170,45 170,105 60,105' : '30,20 200,20 200,70 130,70 130,130 30,130';
    const zone = isSpace ? null : state.draft.zones.find((z) => z.id === fmtDialog.targetId);
    const space = fmtDialog.kind === 'space' ? state.draft.footprints.find((s) => s.id === fmtDialog.targetId) : (fmtDialog.kind === 'asset' ? state.draft.spaces.find((s) => s.id === fmtDialog.targetId) : null);
    const ink = isSpace ? window.LayoutMapSvg.inkFor(d) : '';
    const label = isSpace
        ? `<text class="lt3" x="115" y="78" text-anchor="middle"${ink ? ` style="fill:${ink}"` : ''}>${esc(space ? space.code : '')}</text>`
        : `<text class="lt" x="80" y="92" text-anchor="middle">${esc(fmtDialog.name || (zone && zone.name) || '')}</text>`;
    const preview = `<div class="layout-fmt-preview"><h4>${esc(t('main.layoutVistaPrevia'))}</h4><svg viewBox="0 0 230 150" role="img" aria-label="${esc(t('main.layoutVistaPrevia'))}">${paint.markup(shape)}${label}</svg></div>`;
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
        <div class="layout-fl" id="layout-fmt-namefield"><label>${esc(t('main.layoutNombre'))}<input type="text" id="layout-fmt-name" maxlength="${LC.LIMITS.text}"></label></div>
        <div class="layout-fmt-tabs" role="tablist"><button type="button" role="tab" data-ftab="fill" aria-selected="true">${esc(t('main.layoutFormatoRelleno'))}</button><button type="button" role="tab" data-ftab="border" aria-selected="false">${esc(t('main.layoutFormatoBorde'))}</button></div>
        <div class="layout-fmt-body" id="layout-fmt-body"></div>
        <fieldset class="layout-fmt-scope" id="layout-fmt-scope" hidden></fieldset>
        <p class="layout-fmt-error" id="layout-fmt-error" role="alert" hidden></p>
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
            if (fmtDialog.kind === 'asset') {
                const a = state.draft.spaces.find((r) => r.id === fmtDialog.targetId);
                if (a) assetTargets(a, fmtDialog.scope).forEach((x) => { delete x.fmt; });
            } else if (fmtDialog.kind === 'space') {
                const sp = state.draft.footprints.find((r) => r.id === fmtDialog.targetId);
                if (sp) spaceTargets(sp, fmtDialog.scope).forEach((x) => { delete x.fmt; });
            } else {
                const z = state.draft.zones.find((r) => r.id === fmtDialog.targetId);
                if (z) { delete z.fmt; const nm = ($('layout-fmt-name').value || '').trim(); if (nm) z.name = nm; }
            }
            closeFmtDialog();
            renderPanel();
            refreshLive();
            return;
        }
        if (event.target.closest('#layout-fmt-ok')) {
            // Se aplica y, si deja algo adentro con el color de lo que lo contiene (huella con el de su zona, activo con el de su huella), se deshace y avisa en esta misma ventana (la ventana se queda abierta).
            const applied = tryFmtChange(() => {
                if (fmtDialog.kind === 'asset') {
                    const a = state.draft.spaces.find((r) => r.id === fmtDialog.targetId);
                    // Con formato propio (aunque no se haya cambiado nada) se puede copiar a los demás del grupo; sin formato y sin cambios no hay nada que aplicar.
                    if (a && (a.fmt || JSON.stringify(fmtDialog.draft) !== JSON.stringify(fmtDialog.start))) assetTargets(a, fmtDialog.scope).forEach((x) => { x.fmt = { ...fmtDialog.draft }; });
                } else if (fmtDialog.kind === 'space') {
                    const sp = state.draft.footprints.find((r) => r.id === fmtDialog.targetId);
                    // Con formato propio (aunque no se haya cambiado nada) se puede copiar a las demás del grupo; sin formato y sin cambios no hay nada que aplicar.
                    if (sp && (sp.fmt || JSON.stringify(fmtDialog.draft) !== JSON.stringify(fmtDialog.start))) spaceTargets(sp, fmtDialog.scope).forEach((x) => { x.fmt = { ...fmtDialog.draft }; });
                } else {
                    const z = state.draft.zones.find((r) => r.id === fmtDialog.targetId);
                    if (z) {
                        const nm = ($('layout-fmt-name').value || '').trim();
                        if (nm) z.name = nm;
                        // si no cambió nada de lo que traía (o de lo que ya se veía por su tipo), la zona no recibe formato propio
                        if (z.fmt || JSON.stringify(fmtDialog.draft) !== JSON.stringify(fmtDialog.start)) z.fmt = { ...fmtDialog.draft };
                    }
                }
            });
            if (!applied) return;
            closeFmtDialog();
            renderPanel();
            refreshLive();
        }
    });
    fmtModalEl.addEventListener('change', (event) => {
        if (event.target.name === 'layout-fmt-scope' && fmtDialog) fmtDialog.scope = event.target.value;
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
    fmtDialog = { kind: 'zone', targetId: z.id, draft: { ...base }, start: { ...base }, tab: 'fill', name: z.name };
    $('layout-fmt-title').textContent = t('main.layoutFormatoZona');
    $('layout-fmt-namefield').hidden = false;
    $('layout-fmt-name').value = z.name;
    fmtModalEl.hidden = false;
    renderFmtScope();
    renderFmtBody();
}
function openSpaceFmtDialog(spaceIndex) {
    const sp = state.draft.footprints[spaceIndex];
    if (!sp) return;
    ensureFmtModal();
    const base = sp.fmt ? pickFmt(sp.fmt) : window.LayoutMapSvg.defaultSpaceFmt();
    fmtDialog = { kind: 'space', targetId: sp.id, draft: { ...base }, start: { ...base }, tab: 'fill', scope: 'one' };
    $('layout-fmt-title').textContent = `${t('main.layoutFormatoHuella')} ${sp.code}`;
    $('layout-fmt-namefield').hidden = true;
    fmtModalEl.hidden = false;
    renderFmtScope();
    renderFmtBody();
}
function openAssetFmtDialog(index) {
    const a = state.draft.spaces[index];
    if (!a) return;
    ensureFmtModal();
    const base = a.fmt ? pickFmt(a.fmt) : window.LayoutMapSvg.defaultAssetFmt();
    fmtDialog = { kind: 'asset', targetId: a.id, draft: { ...base }, start: { ...base }, tab: 'fill', scope: 'one' };
    $('layout-fmt-title').textContent = `${t('main.layoutFormatoActivo')} ${a.code}`;
    $('layout-fmt-namefield').hidden = true;
    fmtModalEl.hidden = false;
    renderFmtScope();
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
let cardState = null; // { zoneId, zoneName, data, cls (true en la hoja de clasificaciones) }
let cardModalEl = null;
function cardLabels() {
    const base = { cardArea: t('main.layoutTarjetaArea'), cardCategory: t('main.layoutTarjetaCategoria'), cardReview: t('main.layoutTarjetaRevisame'), cardFooter: t('main.layoutTarjetaPie'), cardEmpty: t('main.layoutCatVacia'), cutCaption: t('main.layoutHojaRecorte') };
    // La hoja de clasificaciones (cardState.cls) lleva su propio encabezado de columnas.
    return cardState && cardState.cls ? { ...base, cardReview: t('main.layoutClsRevisame'), cardIcon: t('main.layoutClsIcono') } : base;
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
                window.LayoutSheet.saveBlob(blob, `${cardState.cls ? 'Clasificaciones' : 'Categorias'}_${slug(cardState.zoneName)}_${new Date().toISOString().slice(0, 10)}.${pdf ? 'pdf' : 'png'}`);
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
    const res = await fetch(layoutUrl('/api/business/layout/categories-qr'), { credentials: 'include' });
    if (res.status === 403) { Dashboard.showToast(t('main.layoutQrSinPermiso'), 'warning'); return; }
    if (!res.ok) { Dashboard.showToast(t('main.layoutDescargaError'), 'error'); return; }
    ensureCardModal();
    const cardData = await res.json();
    cardState = { zoneId, zoneName: zone.name, data: cardData, logoRatio: await logoRatioOf(cardData.logoDataUrl) };
    $('layout-card-title').textContent = t('main.layoutTarjetaDe').replace('{name}', zone.name);
    cardModalEl.hidden = false;
    renderCardPreview();
}
// La hoja de clasificaciones: las clasificaciones de una categoría de Inventario con su icono, color y QR (el QR lleva el Layout + la zona + la categoría + la clasificación, por número). Usa la misma
// ventana de la tarjeta (tamaño libre, línea de recorte, PDF o imagen). El título es «Categorías de {categoría}».
async function openClassificationSheetDialog() {
    const zoneId = $('layout-qr-zone').value;
    const categoryId = $('layout-qr-cls-cat').value;
    if (!zoneId || !categoryId) return;
    const res = await fetch(layoutUrl(`/api/business/layout/zone-classifications?zone=${encodeURIComponent(zoneId)}&category=${encodeURIComponent(categoryId)}`), { credentials: 'include' });
    if (res.status === 403) { Dashboard.showToast(t('main.layoutQrSinPermiso'), 'warning'); return; }
    if (!res.ok) { Dashboard.showToast(t('main.layoutDescargaError'), 'error'); return; }
    const data = await res.json();
    ensureCardModal();
    const categories = data.items.map((c) => ({ name: c.name, desc: c.desc, ...LC.categoryLook(c.seed), qrRows: c.qrRows, qrCaption: t('main.layoutClsVerCatalogo') }));
    const title = t('main.layoutClsTitulo').replace('{name}', data.category.name);
    cardState = { zoneId: data.zone.id, zoneName: title, cls: true, logoRatio: await logoRatioOf(data.logoDataUrl), data: { companyName: data.companyName, siteName: data.siteName, companyColor: data.companyColor, logoDataUrl: data.logoDataUrl, zones: [{ id: data.zone.id, categories }] } };
    $('layout-card-title').textContent = t('main.layoutClsHojaDe').replace('{name}', data.category.name).replace('{zone}', data.zone.name);
    cardModalEl.hidden = false;
    renderCardPreview();
}
// Las categorías de Inventario que ya tienen clasificaciones (no dependen de los códigos de la zona): se llena la lista de la hoja de clasificaciones y se muestra solo si hay alguna.
let qrClsSeq = 0;
async function loadQrCls() {
    const box = $('layout-qr-cls');
    const select = $('layout-qr-cls-cat');
    const zone = $('layout-qr-zone').value;
    const seq = ++qrClsSeq;
    if (!zone) { box.hidden = true; return; }
    try {
        const res = await fetch(layoutUrl(`/api/business/layout/zone-classifications?zone=${encodeURIComponent(zone)}`), { credentials: 'include' });
        if (seq !== qrClsSeq || !res.ok) { if (seq === qrClsSeq) box.hidden = true; return; }
        const data = await res.json();
        const current = select.value;
        select.innerHTML = data.categories.map((c) => `<option value="${c.id}">${esc(c.name)} (${c.count})</option>`).join('');
        if (data.categories.some((c) => String(c.id) === current)) select.value = current;
        box.hidden = !data.categories.length;
    } catch (err) {
        if (seq === qrClsSeq) box.hidden = true;
    }
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
    if (!el || !state.draft || !canEdit('zonas') || state.find) return; // con un enfoque no se arrastran zonas (el croquis se acomoda a lo enfocado)
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
    const k = (view.W / zoom.s) / rect.width / view.sc;
    let dx = (event.clientX - drag.px) * k;
    let dy = (event.clientY - drag.py) * k;
    // Con el croquis girado, el movimiento que se ve en pantalla se regresa a los ejes del Layout (giro inverso).
    if (view.rot === 1) [dx, dy] = [dy, -dx];
    else if (view.rot === 2) [dx, dy] = [-dx, -dy];
    else if (view.rot === 3) [dx, dy] = [-dy, dx];
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

// ---- Cambiar de centro de costos en el selector de arriba ---------------------------------------------------------------------------
document.addEventListener('sgn:cost-centers-changed', async () => {
    if (!state.loaded) return;
    const next = Dashboard.getSingleSelectedCostCenterId();
    if (next === state.centerId) return;
    if (isDirty() && !(await Dashboard.confirm(t('main.layoutCambiarCentroConfirm')))) {
        if (state.centerId) Dashboard.selectOnlyCostCenter(state.centerId);
        return;
    }
    try {
        resetZoom();
        await loadLayout();
    } catch (err) {
        console.error('Layout: no se pudo cambiar de centro de costos', err);
        Dashboard.showToast(t('admin.loadError'), 'error');
    }
});

// ---- Vista 3D (iconos Ver 2D y Ver 3D, hoja iconLayoutVista3D del árbol) ---------------------------------------------------------------
// El 3D ocupa el lugar del croquis y se arma con el borrador que se está editando (LayoutScene3D.js), así lo que se cambia en el panel se ve al momento. three.js (unos 600 KB) se carga solo
// la primera vez que se pide el 3D. Los iconos del croquis que solo sirven en 2D (medidas, m², nombres, girar y zoom) se esconden mientras se ve el 3D, que trae sus propios controles.
let scene3d = null;
let scene3dLoading = null;
let picker3d = null; // el selector de activos del 3D (LayoutAssetPicker.js)
let scene3dTimer = 0;
let scene3dLabels = true;
// El 3D sigue los PASOS igual que el croquis: cada paso encendido muestra su capa y apagarlo la oculta (Contorno = el contorno, Paredes = las paredes, Obstáculos = columnas y desniveles, Puertas, Zonas, Huella-Espacio = huellas,
// Energía Eléctrica = luz, Activos y Posiciones = activos); cada uno es independiente de los demás. Ya no hay un botón de Capas aparte: lo que se ve en el 3D sale de los pasos encendidos.
function effective3dLayers() {
    // con un enfoque: solo lo enfocado (sin paredes, columnas, puertas ni luz) o, con el resto «tenue», todo lo de siempre; los botones de ocultar de la búsqueda valen en los dos
    const f = state.find;
    const hide = state.findHide || {};
    if (f && !state.findDim) {
        return { contour: false, walls: false, columns: false, doors: false, power: false, sensors: false, objects: false, transit: false, safety: false, zones: stepOn('zonas') || f.kind === 'zone', footprints: !hide.huellas && (stepOn('espacios') || f.kind === 'footprint'), assets: !hide.activos && (stepOn('activos') || stepOn('posiciones')) };
    }
    const layers = {
        contour: stepOn('contorno'), walls: stepOn('paredes'), columns: stepOn('obstaculos'), doors: stepOn('puertas'), objects: stepOn('objetos'), transit: stepOn('transito'), safety: stepOn('seguridad'), zones: stepOn('zonas') || !!(f && f.kind === 'zone'),
        footprints: stepOn('espacios'), power: stepOn('luz'), sensors: stepOn('sensores'), assets: stepOn('activos') || stepOn('posiciones'),
    };
    if (f) { layers.footprints = layers.footprints && !hide.huellas; layers.assets = layers.assets && !hide.activos; }
    return layers;
}
const lazyScripts = {};
const can3d = () => !!(state.perms && state.perms.canView3D);
function loadScriptOnce(src) {
    if (!lazyScripts[src]) {
        lazyScripts[src] = new Promise((resolve, reject) => {
            const el = document.createElement('script');
            el.src = src;
            el.onload = resolve;
            el.onerror = () => { delete lazyScripts[src]; reject(new Error(src)); };
            document.head.appendChild(el);
        });
    }
    return lazyScripts[src];
}
function ensureScene3d() {
    if (scene3d) return Promise.resolve(scene3d);
    if (!scene3dLoading) {
        scene3dLoading = (async () => {
            await loadScriptOnce('vendor/three/three.min.js');
            await loadScriptOnce('LayoutScene3D.js');
            await loadScriptOnce('LayoutAssetPicker.js');
            scene3d = window.LayoutScene3D.create($('layout-3d-stage'), { labels: scene3dLabels, onSelect: (sel) => { show3dInfo(sel); selectFrom3d(sel); } });
            picker3d = window.LayoutAssetPicker.create($('layout-3d-picker'), {
                texts: { title: t('main.layout3dActivosTitulo'), count: t('main.layout3dActivosConteo'), all: t('main.layout3dTodos'), none: t('main.layout3dNinguno'), close: t('main.layout3dCerrar'), search: t('main.layout3dActivosBuscar'), noResults: t('main.layout3dSinResultados'), noZone: t('main.layoutSinZona') },
                typeLabel: (type) => typeLabel('space', type),
                onChange: (hidden) => { scene3d.setHiddenAssets(hidden); updateViewBtns(); },
                onToggle: () => updateViewBtns(),
            });
            return scene3d;
        })().catch((err) => { scene3dLoading = null; throw err; });
    }
    return scene3dLoading;
}
function show3dInfo(sel) {
    const box = $('layout-3d-info');
    if (!sel || !state.draft || sel.kind === 'side' || sel.kind === 'corner') { box.hidden = true; return; }
    box.hidden = false;
    if (sel.kind === 'footprint') {
        const p = sel.footprint;
        const zone = state.draft.zones.find((z) => z.id === p.zoneId);
        box.innerHTML = `<b>${esc(p.code)}</b> · ${esc(t('main.layoutFindHuella'))}${zone ? ` · ${esc(zone.name)}` : ''} · ${fmt(p.l)} × ${fmt(p.d)} × ${fmt(p.h)} m`;
        return;
    }
    if (sel.kind === 'space') {
        const s = sel.space;
        const zone = state.draft.zones.find((z) => z.id === s.zoneId);
        const levels = (s.levels || 1) === 1 ? t('main.layout3dNivel1') : t('main.layout3dNivelesN', { n: s.levels });
        box.innerHTML = `<b>${esc(s.code)}</b> · ${esc(typeLabel('space', s.type))}${zone ? ` · ${esc(zone.name)}` : ''} · ${fmt(s.l)} × ${fmt(s.d)} × ${fmt(s.h)} m · ${esc(levels)}`;
    } else {
        const z = sel.zone;
        const spaces = state.draft.spaces.filter((s) => s.zoneId === z.id).length;
        box.innerHTML = `<b>${esc(z.name)}</b> · ${esc(z.type ? typeLabel('zone', z.type) : t('main.layoutSinZona'))}${z.use ? ` · ${esc(typeLabel('use', z.use))}` : ''} · ${fmt(LC.zoneArea(z))} m² · ${esc(t('main.layout3dEspaciosN', { n: spaces }))}`;
    }
}
function refreshScene3d() {
    if (!(scene3d && state.view3d && state.draft)) return;
    // el selector se actualiza con el borrador (lo que se ocultó y ya no existe se olvida) y la escena se arma una sola vez
    const fv3 = findView3d(); // con un enfoque, el 3D solo trae lo enfocado (o todo, con lo enfocado resaltado)
    const shown = fv3.shown;
    if (picker3d) {
        picker3d.setData({ spaces: shown.spaces.filter((s) => s.active !== false), zones: shown.zones.filter((z) => z.active !== false).map((z) => ({ id: z.id, name: z.name })) });
        scene3d.setHiddenAssets(picker3d.getHidden(), false);
    }
    scene3d.update({ ...shown, safetyLast: state.safetyLast || {} }, { labels: scene3dLabels && !(state.find && state.findHide.textos), layers: effective3dLayers(), focus: fv3.focus, contourPick: state.focus === 'contorno' ? state.contornoMode : null });
    if (find3dReframe) {
        find3dReframe = false;
        scene3d.setView('general');
        document.querySelectorAll('.layout-3d-view').forEach((b) => b.classList.toggle('on', b.getAttribute('data-view') === 'general'));
    }
    applyHighlight3d();
    updateViewBtns();
}
// Lo que se elige en una tabla también se marca en el 3D (contorno naranja, doble al tocar la figura); solo cuenta en el paso que se está editando, igual que en el croquis.
function applyHighlight3d() {
    if (!scene3d || !scene3d.highlight) return; // el 3D viejo que quedó en la memoria del navegador aún no la trae
    const h = state.hl;
    scene3d.highlight(h && h.step === state.focus && state.draft ? { kind: h.kind, id: h.id, strong: !!h.strong } : null);
}
function scheduleScene3d() {
    if (!state.view3d) return;
    clearTimeout(scene3dTimer);
    scene3dTimer = setTimeout(refreshScene3d, 150);
}
function updateViewBtns() {
    const allowed = can3d();
    if (!allowed) state.view3d = false; // sin permiso (o sin el icono) siempre se ve el croquis de siempre
    [['layout-view2d-btn', 'main.layoutVer2D', !state.view3d], ['layout-view3d-btn', 'main.layoutVer3D', state.view3d]].forEach(([id, key, on]) => {
        const btn = $(id);
        btn.hidden = !allowed;
        btn.setAttribute('aria-pressed', String(on));
        btn.setAttribute('aria-label', t(key));
        btn.title = t(key);
    });
    $('layout-svg').toggleAttribute('hidden', state.view3d); // un <svg> no tiene la propiedad hidden: va el atributo (el CSS ya lo esconde)
    $('layout-map3d').hidden = !state.view3d;
    $('layout-views').classList.toggle('is-3d', state.view3d);
    $('layout-mode').hidden = !allowed; // sin 3D no hay nada que elegir: el interruptor 2D | 3D no sale
    updateTextsMenu();
    [['layout-3d-zoom-in', 'main.layout3dAcercar'], ['layout-3d-zoom-out', 'main.layout3dAlejar']].forEach(([id, key]) => { $(id).setAttribute('aria-label', t(key)); $(id).title = t(key); });
    // Elegir los activos del 3D: un grupo con su propia hoja del árbol (iconLayout3dCapas); solo se ve quien la tiene.
    $('layout-3d-layers').hidden = !(state.perms && state.perms.canToggle3dLayers);
    [['layout-texts-btn', 'main.layoutTextos']].forEach(([id, key]) => { $(id).setAttribute('aria-label', t(key)); $(id).title = t(key); });
    // Elegir qué activos se ven: se marca cuando hay alguno oculto y no sirve con la capa de activos apagada
    const pickBtn = $('layout-3d-assets-pick');
    const hiddenCount = picker3d ? picker3d.getHidden().size : 0;
    const pickTotal = picker3d ? picker3d.total() : 0;
    pickBtn.disabled = effective3dLayers().assets === false;
    pickBtn.setAttribute('aria-pressed', String(hiddenCount > 0));
    pickBtn.setAttribute('aria-expanded', String(!!(picker3d && picker3d.isOpen())));
    pickBtn.setAttribute('aria-label', t('main.layout3dActivosElegir') + (hiddenCount ? ` (${pickTotal - hiddenCount}/${pickTotal})` : ''));
    pickBtn.title = pickBtn.getAttribute('aria-label');
    if (picker3d && (!state.view3d || effective3dLayers().assets === false) && picker3d.isOpen()) picker3d.hide();
    const labelsBtn = $('layout-3d-labels');
    labelsBtn.setAttribute('aria-pressed', String(scene3dLabels));
    labelsBtn.classList.toggle('off', !scene3dLabels);
    labelsBtn.setAttribute('aria-label', t(scene3dLabels ? 'main.layout3dRotulosOcultar' : 'main.layout3dRotulosVer'));
    labelsBtn.title = labelsBtn.getAttribute('aria-label');
}
async function setView3d(on) {
    if (on && !can3d()) return;
    state.view3d = on;
    updateViewBtns();
    if (!on) return;
    const msg = $('layout-3d-msg');
    msg.textContent = t('main.layout3dCargando');
    msg.hidden = false;
    try {
        const sc = await ensureScene3d();
        msg.hidden = true;
        if (!state.view3d) return;
        sc.resize();
        refreshScene3d();
    } catch (err) {
        console.error('La vista 3D no se pudo abrir:', err);
        msg.textContent = t('main.layout3dError');
        msg.hidden = false;
    }
}
// Textos: UN solo botón con una lista en vez de un icono por cada texto que se puede ocultar. En 2D la lista trae los nombres, los m² y las medidas de las zonas; en 3D, los rótulos. Cada renglón sigue siendo el
// mismo interruptor de siempre (con su permiso del árbol: solo lo ve quien lo tiene) y, si en la vista elegida no hay ninguno que se vea, el botón no sale.
function updateTextsMenu() {
    const ids = state.view3d ? ['layout-3d-labels'] : ['layout-names-btn', 'layout-area-btn', 'layout-measures-btn'];
    const any = ids.some((id) => !$(id).hidden);
    $('layout-texts').hidden = !any;
    if (!any) closeOptMenus();
}
// Las listas desplegables de Visualizaciones (Textos y Capas): el botón abre su lista, otro clic o Escape la cierran y tocar afuera también; solo hay una abierta a la vez.
function closeOptMenus(except) {
    document.querySelectorAll('[data-opt-menu]').forEach((btn) => {
        if (btn === except) return;
        btn.setAttribute('aria-expanded', 'false');
        const list = $(btn.getAttribute('data-opt-menu'));
        if (list) list.hidden = true;
    });
}
document.querySelectorAll('[data-opt-menu]').forEach((btn) => btn.addEventListener('click', () => {
    const list = $(btn.getAttribute('data-opt-menu'));
    const open = list.hidden;
    closeOptMenus(btn);
    list.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
}));
document.addEventListener('click', (event) => { if (!event.target.closest('.layout-opt')) closeOptMenus(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeOptMenus(); });
$('layout-view2d-btn').addEventListener('click', () => setView3d(false));
$('layout-view3d-btn').addEventListener('click', () => setView3d(true));
document.querySelectorAll('.layout-3d-view').forEach((btn) => btn.addEventListener('click', () => {
    if (!scene3d) return;
    document.querySelectorAll('.layout-3d-view').forEach((b) => b.classList.toggle('on', b === btn));
    scene3d.setView(btn.getAttribute('data-view'));
}));
$('layout-3d-assets-pick').addEventListener('click', () => { if (picker3d) picker3d.toggle(); });
$('layout-3d-labels').addEventListener('click', () => {
    scene3dLabels = !scene3dLabels;
    updateViewBtns();
    if (scene3d) scene3d.setLabels(scene3dLabels);
});
$('layout-3d-zoom-in').addEventListener('click', () => { if (scene3d) scene3d.zoom(1.3); });
$('layout-3d-zoom-out').addEventListener('click', () => { if (scene3d) scene3d.zoom(1 / 1.3); });

// ---- zoom del croquis ---------------------------------------------------------------------------------------------------------
// Acercar y alejar el croquis con los botones (+, − y ver todo), Ctrl + rueda, doble clic o toque, dos dedos y, ya acercado, arrastrando el fondo (las zonas se siguen moviendo con su arrastre de
// siempre). Se cambia el viewBox del SVG (no un transform), así el dibujo y sus letras se ven nítidos al acercar. Solo es de pantalla: no cambia lo guardado ni la hoja que se descarga.
const canZoomMap = () => !!(state.perms && state.perms.canZoom);
function applyZoom() {
    const svg = $('layout-svg');
    if (!canZoomMap()) { zoom.s = 1; zoom.x = 0; zoom.y = 0; }
    const w = MAP_W / zoom.s;
    const h = MAP_H / zoom.s;
    zoom.x = Math.min(Math.max(zoom.x, 0), MAP_W - w);
    zoom.y = Math.min(Math.max(zoom.y, 0), MAP_H - h);
    svg.setAttribute('viewBox', `${zoom.x.toFixed(2)} ${zoom.y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    const zoomed = zoom.s > 1.001;
    svg.classList.toggle('zoomed', zoomed);
    $('layout-zoom-reset').hidden = !zoomed;
}
function updateZoomUi() {
    const allowed = canZoomMap();
    $('layout-zoom-tools').hidden = !allowed;
    [['layout-zoom-in', 'main.layoutZoomAcercar'], ['layout-zoom-out', 'main.layoutZoomAlejar'], ['layout-zoom-reset', 'main.layoutZoomTodo']].forEach(([id, key]) => { $(id).setAttribute('aria-label', t(key)); $(id).title = t(key); });
    $('layout-svg').classList.toggle('can-zoom', allowed);
    applyZoom();
}
function resetZoom() { zoom.s = 1; zoom.x = 0; zoom.y = 0; applyZoom(); }
// El punto de pantalla (cx, cy) se queda quieto mientras cambia el aumento.
function zoomTo(next, cx, cy) {
    const rect = $('layout-svg').getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const fx = (cx - rect.left) / rect.width;
    const fy = (cy - rect.top) / rect.height;
    const px = zoom.x + fx * (MAP_W / zoom.s);
    const py = zoom.y + fy * (MAP_H / zoom.s);
    zoom.s = Math.min(Math.max(next, 1), ZOOM_MAX);
    zoom.x = px - fx * (MAP_W / zoom.s);
    zoom.y = py - fy * (MAP_H / zoom.s);
    applyZoom();
}
const mapCenter = () => { const r = $('layout-svg').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
$('layout-zoom-in').addEventListener('click', () => zoomTo(zoom.s * 1.6, ...mapCenter()));
$('layout-zoom-out').addEventListener('click', () => zoomTo(zoom.s / 1.6, ...mapCenter()));
$('layout-zoom-reset').addEventListener('click', resetZoom);
document.querySelector('.layout-map').addEventListener('wheel', (event) => {
    if (!canZoomMap() || (!event.ctrlKey && !event.metaKey)) return; // sin Ctrl la rueda sigue moviendo la página
    event.preventDefault();
    zoomTo(zoom.s * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event.clientX, event.clientY);
}, { passive: false });
$('layout-svg').addEventListener('dblclick', (event) => { if (canZoomMap()) zoomTo(zoom.s > 1.001 ? 1 : 2.5, event.clientX, event.clientY); });
const zoomPts = new Map();
let pinch = null;
let panId = null;
// Con dos dedos la zona que se estaba arrastrando vuelve a donde estaba: el gesto es de zoom, no de mover la zona.
function cancelZoneDrag() {
    if (!drag) return;
    const z = state.draft && state.draft.zones.find((r) => r.id === drag.id);
    const { start, moved } = drag;
    drag = null;
    if (z && moved) { translateFrom(start, z, 0, 0); renderPanel(); refreshLive(); }
}
$('layout-svg').addEventListener('pointerdown', (event) => {
    if (!canZoomMap()) return;
    zoomPts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (zoomPts.size === 2) {
        cancelZoneDrag();
        const [a, b] = [...zoomPts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: zoom.s };
        panId = null;
    } else if (!drag && zoom.s > 1.001) {
        panId = event.pointerId; // acercado, arrastrar el fondo (o una zona que no se puede mover) recorre el croquis
    }
});
window.addEventListener('pointermove', (event) => {
    const prev = zoomPts.get(event.pointerId);
    if (!prev) return;
    const cur = { x: event.clientX, y: event.clientY };
    zoomPts.set(event.pointerId, cur);
    if (zoomPts.size === 2 && pinch) {
        const [a, b] = [...zoomPts.values()];
        zoomTo(pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (panId === event.pointerId) {
        const rect = $('layout-svg').getBoundingClientRect();
        zoom.x -= ((cur.x - prev.x) * (MAP_W / zoom.s)) / rect.width;
        zoom.y -= ((cur.y - prev.y) * (MAP_H / zoom.s)) / rect.height;
        applyZoom();
    }
});
const releaseZoomPointer = (event) => {
    zoomPts.delete(event.pointerId);
    if (zoomPts.size < 2) pinch = null;
    if (panId === event.pointerId) panId = null;
};
window.addEventListener('pointerup', releaseZoomPointer);
window.addEventListener('pointercancel', releaseZoomPointer);

// ---- guardar / descartar -----------------------------------------------------------------------------------------------
$('layout-save').addEventListener('click', async () => {
    const button = $('layout-save');
    const openShape = firstOpenShape();
    if (openShape) {
        if (openShape.kind === 'contorno') { showStep('contorno'); Dashboard.showToast(t('main.layoutNoCierraContorno'), 'warning'); } else { showStep('zonas'); state.zoneOpen = openShape.zone.id; Dashboard.showToast(t('main.layoutNoCierraZona').replace('{name}', openShape.zone.name), 'warning'); }
        renderPanel();
        return;
    }
    const loose = state.draft.spaces.findIndex((s) => !s.footprintId);
    if (loose >= 0) {
        showStep('activos');
        renderPanel();
        Dashboard.showToast(t('main.layoutActivoSinHuella').replace('{n}', String(loose + 1)), 'warning');
        const pick = document.querySelector(`[data-l="spaces"][data-i="${loose}"][data-k="footprintId"]`);
        if (pick) { pick.scrollIntoView({ block: 'center' }); pick.focus(); }
        return;
    }
    const fresh = LC.newFootprintViolations(state.draft, state.saved);
    if (fresh.length) {
        const v = fresh[0];
        showStep('espacios');
        renderPanel();
        Dashboard.showToast(t(`main.layoutVio_${v.kind}`, { code: v.code, zone: v.zoneName || '', h: v.h, maxH: v.maxH }), 'warning');
        const at = state.draft.footprints.findIndex((f) => f.id === v.id);
        const box = document.querySelector(`[data-l="footprints"][data-i="${at}"][data-k="${v.kind === 'tall' ? 'h' : 'x'}"]`);
        if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
        return;
    }
    const freshSpaces = LC.newSpaceViolations(state.draft, state.saved);
    if (freshSpaces.length) {
        const v = freshSpaces[0];
        showStep('activos');
        renderPanel();
        Dashboard.showToast(t(`main.layoutVioAct_${v.kind}`, v.vars), 'warning');
        const at = state.draft.spaces.findIndex((s) => s.id === v.id);
        const box = document.querySelector(`[data-l="spaces"][data-i="${at}"][data-k="${v.kind === 'tall' ? 'oh' : 'ol'}"]`);
        if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
        return;
    }
    // Tránsito: lo nuevo o lo que cambió y no cumple (fuera de zona, no cabe en su zona, lo que transita no cabe, o algo adentro del pasillo) no se guarda.
    const freshTransit = LC.newTransitViolations(state.draft, state.saved);
    if (freshTransit.length) {
        showStep('transito');
        renderPanel();
        refreshLive();
        Dashboard.showToast(`${t('main.layoutVioTrAviso')} ${transitIssueText(freshTransit[0])}`, 'warning');
        return;
    }
    // Seguridad: cada elemento (y los dos extremos de la ruta) va dentro del contorno de la nave; lo nuevo o lo que cambió y no cumple no se guarda.
    const freshSafety = LC.newSafetyViolations(state.draft, state.saved);
    if (freshSafety.length) {
        showStep('seguridad');
        renderPanel();
        refreshLive();
        Dashboard.showToast(`${t('main.layoutVioTrAviso')} ${safetyIssueText(freshSafety[0])}`, 'warning');
        return;
    }
    const clashed = LC.newColorClashes(state.draft, state.saved);
    if (clashed.length) {
        const c = clashed[0];
        showStep(c.kind === 'asset' ? 'activos' : 'espacios');
        renderPanel();
        Dashboard.showToast(t(`main.layoutColorChoque_${c.kind}`, { code: c.code, parent: c.parentName }), 'warning');
        return;
    }
    // Aviso antes de guardar: las huellas que ya existían y cambian de zona (y por eso de Localizador). Nada cambia sin que la persona lo vea y lo acepte.
    const moved = LC.footprintZoneChanges(state.draft, state.saved);
    if (moved.length) {
        const nobody = t('main.layoutZonaCambiaSinZona');
        const items = moved.map((m) => t('main.layoutZonaCambiaItem', { from: m.from || '—', to: m.to || '—', fromZone: m.fromZone || nobody, toZone: m.toZone || nobody }) + (m.assets ? t('main.layoutZonaCambiaActivos', { n: String(m.assets) }) : ''));
        const keep = await Dashboard.confirm(t(moved.length === 1 ? 'main.layoutZonaCambiaUna' : 'main.layoutZonaCambiaVarias', { n: String(moved.length) }), { items, accept: t('main.layoutZonaCambiaGuardar'), cancel: t('main.layoutZonaCambiaRegresar') });
        if (!keep) return;
    }
    button.disabled = true;
    try {
        const body = { layout: state.draft, baseVersion: state.version, costCenterId: state.centerId };
        if (state.planNew) body.planImage = state.planImage;
        if (state.renumber) body.renumberCodes = true;
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
    const canClean = !!(state.perms && state.perms.canUseCleaningQr);
    const canTemp = !!(state.perms && state.perms.canUseTemperatureQr);
    // la pestaña Ficha solo tiene los candados de la Ficha de un código (vale para toda la empresa): sale con el permiso de candados
    const canFicha = !!(state.perms && state.perms.canLockQr);
    const canSensor = !!(state.perms && state.perms.canUseSensorQr);
    const canSafety = !!(state.perms && state.perms.canUseSafetyQr);
    const show = !!((canLayout || canZone || canClean || canTemp || canSensor || canSafety || canFicha) && state.saved && !state.creating);
    $('layout-qrmenu').hidden = !show;
    $('layout-qr-regen').hidden = !(state.perms && state.perms.canRegenerateQr);
    // "Por: Layout | Zona | Limpieza | Temperaturas" solo sale si se puede usar de más de una forma; con una sola, el menú abre directo en esa.
    $('layout-qr-by-layout').hidden = !canLayout;
    $('layout-qr-by-zone').hidden = !canZone;
    $('layout-qr-by-clean').hidden = !canClean;
    $('layout-qr-by-temp').hidden = !canTemp;
    $('layout-qr-by-sensor').hidden = !canSensor;
    $('layout-qr-by-safety').hidden = !canSafety;
    $('layout-qr-by-ficha').hidden = !canFicha;
    $('layout-qr-by').hidden = [canLayout, canZone, canClean, canTemp, canSensor, canSafety, canFicha].filter(Boolean).length < 2;
    const first = canLayout ? 'layout' : (canZone ? 'zone' : (canClean ? 'clean' : (canTemp ? 'temp' : (canSensor ? 'sensor' : (canSafety ? 'safety' : 'ficha')))));
    if (!qrBy || (qrBy === 'layout' && !canLayout) || (qrBy === 'zone' && !canZone) || (qrBy === 'clean' && !canClean) || (qrBy === 'temp' && !canTemp) || (qrBy === 'sensor' && !canSensor) || (qrBy === 'safety' && !canSafety) || (qrBy === 'ficha' && !canFicha)) qrBy = first;
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
const ZONE_CATEGORY_TYPES = [['inventario', 'colArticuloCategoriaInventario'], ['compra', 'colArticuloCategoriaCompra'], ['almacenamiento', 'colArticuloCategoriaAlmacenamiento'], ['rotacion', 'colArticuloCategoriaRotacion'], ['manejo', 'colArticuloCategoriaManejo'], ['riesgo', 'colArticuloCategoriaRiesgo'], ['vidautil', 'colArticuloCategoriaVidautil'], ['tipocodigo', 'colArticuloCategoriaTipoCodigo']];
function renderQrBy() {
    ['layout', 'zone', 'clean', 'temp', 'sensor', 'safety', 'ficha'].forEach((k) => {
        const on = qrBy === k;
        $(`layout-qr-by-${k}`).classList.toggle('active', on);
        $(`layout-qr-by-${k}`).setAttribute('aria-pressed', String(on));
        $(`layout-qr-pane-${k}`).hidden = !on;
    });
    if (qrBy === 'zone' && !$('layout-qr-pop').hidden) loadQrZone(); // con el menú cerrado no se pide nada; se lee al abrirlo
    if (qrBy === 'clean') cleanZoneOptions();
    if (qrBy === 'temp') tempZoneOptions();
    if (qrBy === 'sensor') sensorZoneOptions();
    if (qrBy === 'safety') safetyZoneOptions();
    if (QR_LOCK_KINDS[qrBy]) renderQrLocks(qrBy);
}
// ---- QR de limpieza (uno por activo) ---------------------------------------------------------------------------------------------
// Cada ACTIVO tiene su QR (la dirección fija /l/<código del Layout>/<id del activo>: no cambia nunca aunque el activo cambie de nombre, de zona o de código). Se imprime una hoja con un QR por activo de la zona
// elegida (o de todas) y se pega en el anaquel, la tarima o el refrigerador. Se arma con lo guardado (GET /api/business/layout/cleaning-qr). Quien lo escanea no necesita sesión: ver la pantalla Limpieza.
function cleanZoneOptions() {
    const zones = ((state.saved && state.saved.zones) || []).filter((z) => z.active !== false);
    const select = $('layout-qr-clean-zone');
    const current = select.value;
    select.innerHTML = `<option value="">${esc(t('main.layoutQrLimpiezaTodas'))}</option>${zones.map((z) => `<option value="${esc(z.id)}">${esc(z.name)}</option>`).join('')}`;
    if (current && zones.some((z) => z.id === current)) select.value = current;
    const n = ((state.saved && state.saved.spaces) || []).filter((s) => s.active !== false && (!select.value || s.zoneId === select.value)).length;
    $('layout-qr-clean-fine').textContent = n ? t('main.layoutQrLimpiezaCuantos', { n: fmt(n) }) : t('main.layoutQrLimpiezaVacio');
    $('layout-qr-clean-print').disabled = !n;
    $('layout-qr-clean-download').disabled = !n;
}
// ---- QR de temperaturas (uno por refrigerador) -------------------------------------------------------------------------------------
// Cada REFRIGERADOR (activo de tipo Frío) tiene su QR (la dirección fija /t/<código del Layout>/<id del activo>: no cambia nunca). Se imprime una hoja con un QR por refrigerador de la zona elegida (o de todas)
// y se pega en el refrigerador. Se arma con lo guardado (GET /api/business/layout/temperature-qr). Quien lo escanea no necesita sesión: ver la pantalla Temperaturas.
const isColdSpace = (s) => s.active !== false && s.type === 'cold';
function tempZoneOptions() {
    const zones = ((state.saved && state.saved.zones) || []).filter((z) => z.active !== false);
    const select = $('layout-qr-temp-zone');
    const current = select.value;
    select.innerHTML = `<option value="">${esc(t('main.layoutQrLimpiezaTodas'))}</option>${zones.map((z) => `<option value="${esc(z.id)}">${esc(z.name)}</option>`).join('')}`;
    if (current && zones.some((z) => z.id === current)) select.value = current;
    const n = ((state.saved && state.saved.spaces) || []).filter((s) => isColdSpace(s) && (!select.value || s.zoneId === select.value)).length;
    $('layout-qr-temp-fine').textContent = n ? t('main.layoutQrTemperaturasCuantos', { n: fmt(n) }) : t('main.layoutQrTemperaturasVacio');
    $('layout-qr-temp-print').disabled = !n;
    $('layout-qr-temp-download').disabled = !n;
}
// ---- QR de sensores (uno por sensor del Layout) ------------------------------------------------------------------------------------------------
// Cada SENSOR (paso Sensores del Layout) tiene su QR (la dirección fija /s/<código del Layout>/<id del sensor>: no cambia nunca). Se imprime una hoja con un QR por sensor de la zona elegida (o de todas) y se pega junto
// al sensor. Se arma con lo guardado (GET /api/business/layout/sensor-qr). Quien lo escanea no necesita sesión: captura lo que marca el sensor y sus lecturas alimentan el mapa de calor.
function sensorZoneOptions() {
    const zones = ((state.saved && state.saved.zones) || []).filter((z) => z.active !== false);
    const select = $('layout-qr-sensor-zone');
    const current = select.value;
    select.innerHTML = `<option value="">${esc(t('main.layoutQrLimpiezaTodas'))}</option>${zones.map((z) => `<option value="${esc(z.id)}">${esc(z.name)}</option>`).join('')}`;
    if (current && zones.some((z) => z.id === current)) select.value = current;
    const n = ((state.saved && state.saved.sensors) || []).filter((s) => !select.value || s.zoneId === select.value).length;
    $('layout-qr-sensor-fine').textContent = n ? t('main.layoutQrSensoresCuantos', { n: fmt(n) }) : t('main.layoutQrSensoresVacio');
    $('layout-qr-sensor-print').disabled = !n;
    $('layout-qr-sensor-download').disabled = !n;
}
// ---- QR de seguridad (uno por elemento de Seguridad del Layout) -------------------------------------------------------------------------------
// Cada ELEMENTO de Seguridad (extintor, hidrante, puerta de emergencia…) tiene su QR (la dirección fija /g/<código del Layout>/<id del elemento>: no cambia nunca). Se imprime una hoja con un QR por elemento de la zona
// elegida (o de todas) y se pega junto al elemento. Se arma con lo guardado (GET /api/business/layout/safety-qr). Quien lo escanea no necesita sesión: marca si está bien o con falla, deja una nota y toma la foto;
// las revisiones se ven en Operaciones > Seguridad y mueven solas la próxima revisión del elemento.
function safetyZoneOptions() {
    const zones = ((state.saved && state.saved.zones) || []).filter((z) => z.active !== false);
    const select = $('layout-qr-safety-zone');
    const current = select.value;
    select.innerHTML = `<option value="">${esc(t('main.layoutQrLimpiezaTodas'))}</option>${zones.map((z) => `<option value="${esc(z.id)}">${esc(z.name)}</option>`).join('')}`;
    if (current && zones.some((z) => z.id === current)) select.value = current;
    const n = ((state.saved && state.saved.safety) || []).filter((e) => !select.value || e.zoneId === select.value).length;
    $('layout-qr-safety-fine').textContent = n ? t('main.layoutQrSeguridadCuantos', { n: fmt(n) }) : t('main.layoutQrSeguridadVacio');
    $('layout-qr-safety-print').disabled = !n;
    $('layout-qr-safety-download').disabled = !n;
}
// ---- Candados de los QR (lo que ve y puede hacer quien escanea sin sesión) ---------------------------------------------------------------------
// En las pestañas Layout, Zona, Limpieza y Temperaturas del menú «QR y descarga», con el icono Candados de los QR del árbol. Hay una configuración por tipo de QR y por centro de costos y vale para todos los QR de ese tipo (los
// ya impresos también: el QR no cambia, cambia lo que muestra). Cada cambio se guarda al momento; el servidor es el que los hace cumplir (GET /api/business/layout/qr-locks).
// Las pestañas Layout y Zona muestran el MISMO juego (tipo «layout»): el QR del Layout, el de una Zona y el de una Categoría abren la misma página, y con candados distintos bastaría cambiar el final de la dirección para saltárselos.
const QR_LOCK_KINDS = { layout: 'layout', zone: 'layout', clean: 'cleaning', temp: 'temperature', sensor: 'sensor', safety: 'safety', ficha: 'ficha' };
const qrLocksNow = {};
// Los candados del QR del Layout, en dos grupos: [clave, texto, ayuda] y el título de cada grupo.
const LAYOUT_LOCK_GROUPS = [
    ['main.layoutLockGrupoCodigos', [['codes', 'main.layoutLockBuscarCodigos'], ['classifications', 'main.layoutLockClasificaciones'], ['photos', 'main.layoutLockFotosArticulos'], ['where', 'main.layoutLockDondeEsta']]],
    ['main.layoutLockGrupoPlano', [['metrics', 'main.layoutLockMetricos'], ['doors', 'main.layoutLockPuertasLuz'], ['counts', 'main.layoutLockConteos']]],
];
// La Ficha de un código es de la empresa (no de un centro de costos): una sola pestaña con sus tres candados.
const FICHA_LOCK_GROUPS = [['main.layoutLockGrupoFicha', [['photos', 'main.layoutLockFichaFotos'], ['measures', 'main.layoutLockFichaMedidas'], ['where', 'main.layoutLockFichaDonde']]]];
const QR_LOCK_GROUPS = { layout: LAYOUT_LOCK_GROUPS, ficha: FICHA_LOCK_GROUPS };
const QR_LOCK_NOTES = { layout: 'main.layoutLockNotaLayout', ficha: 'main.layoutLockNotaFicha' };
function qrLockItems(kind) {
    const items = [['records', 'main.layoutLockRegistros', 'main.layoutLockRegistrosSub'], ['photos', 'main.layoutLockFotos', ''], ['names', 'main.layoutLockNombres', '']];
    if (kind === 'temp') items.push(['range', 'main.layoutLockRango', 'main.layoutLockRangoSub']);
    if (kind === 'safety') items.push(['notes', 'main.layoutLockNotas', '']);
    items.push(['register', 'main.layoutLockRegistrar', 'main.layoutLockRegistrarSub']);
    if (kind === 'safety') items.push(['dates', 'main.layoutLockFechas', 'main.layoutLockFechasSub']);
    return items;
}
async function renderQrLocks(kind) {
    const box = $(`layout-qr-locks-${kind}`);
    box.hidden = !(state.perms && state.perms.canLockQr);
    if (box.hidden) return;
    let data;
    try {
        const res = await fetch(layoutUrl(`/api/business/layout/qr-locks?type=${QR_LOCK_KINDS[kind]}`), { credentials: 'include' });
        if (!res.ok) throw new Error('qr locks failed');
        data = await res.json();
    } catch (err) { box.hidden = true; return; }
    qrLocksNow[kind] = data.locks;
    const lk = data.locks;
    const lockType = QR_LOCK_KINDS[kind];
    const helpFor = (key) => (lockType === 'layout' ? `layoutLock_${key}` : (lockType === 'ficha' ? `layoutLockFicha_${key}` : 'layoutQrLocks'));
    const sw = ([key, label, sub]) => `<button type="button" role="switch" class="layout-lock-sw" data-lock="${key}" data-help-key="${helpFor(key)}" aria-checked="${!!lk[key]}"><span class="layout-lock-knob" aria-hidden="true"></span><span class="layout-lock-txt">${esc(t(label))}${sub ? `<small>${esc(t(sub))}</small>` : ''}</span></button>`;
    if (QR_LOCK_GROUPS[lockType]) {
        box.innerHTML = `<h3 class="layout-lock-title">${esc(t('main.layoutLockTitulo'))}</h3>${QR_LOCK_GROUPS[lockType].map(([title, rows]) => `<h4 class="layout-lock-group">${esc(t(title))}</h4>${rows.map(sw).join('')}`).join('')}<p class="layout-qr-fine">${esc(t(QR_LOCK_NOTES[lockType]))}</p>`;
        return;
    }
    const limit = `<label class="layout-lock-limit" data-help-key="layoutQrLocks"><span>${esc(t('main.layoutLockLimite'))}</span><select data-lock="limit">${data.limits.map((n) => `<option value="${n}"${lk.limit === n ? ' selected' : ''}>${esc(t('main.layoutLockUltimos', { n }))}</option>`).join('')}</select></label>`;
    const items = qrLockItems(kind).map(sw);
    items.splice(kind === 'safety' ? 4 : 3, 0, limit); // después de ver los registros, las fotos, los nombres (y en Seguridad las notas)
    box.innerHTML = `<h3 class="layout-lock-title">${esc(t('main.layoutLockTitulo'))}</h3>${items.join('')}<p class="layout-qr-fine">${esc(t(kind === 'clean' ? 'main.layoutLockNotaLimpieza' : (kind === 'sensor' ? 'main.layoutLockNotaSensor' : (kind === 'safety' ? 'main.layoutLockNotaSeguridad' : 'main.layoutLockNotaTemp'))))}</p>`;
}
async function saveQrLock(kind, key, value, control) {
    const next = { ...qrLocksNow[kind], [key]: value };
    control.disabled = true;
    try {
        const res = await fetch('/api/business/layout/qr-locks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ type: QR_LOCK_KINDS[kind], locks: next, costCenterId: state.centerId }) });
        if (!res.ok) throw new Error('qr locks save failed');
        qrLocksNow[kind] = (await res.json()).locks;
        Dashboard.showToast(t('main.layoutLockGuardado'), 'success');
    } catch (err) {
        console.error('Layout: no se pudo guardar el candado', err);
        Dashboard.showToast(t('main.layoutDescargaError'), 'error');
        renderQrLocks(kind);
        return;
    } finally { control.disabled = false; }
    if (control.getAttribute('role') === 'switch') control.setAttribute('aria-checked', String(!!qrLocksNow[kind][key]));
}
Object.keys(QR_LOCK_KINDS).forEach((kind) => {
    $(`layout-qr-locks-${kind}`).addEventListener('click', (event) => {
        const sw = event.target.closest('button[data-lock]');
        if (sw && !sw.disabled) saveQrLock(kind, sw.getAttribute('data-lock'), sw.getAttribute('aria-checked') !== 'true', sw);
    });
    $(`layout-qr-locks-${kind}`).addEventListener('change', (event) => {
        const sel = event.target.closest('select[data-lock]');
        if (sel) saveQrLock(kind, sel.getAttribute('data-lock'), Number(sel.value), sel);
    });
});

// Tarjetas de QR por activo (Limpieza y Temperaturas): cada QR va en la MISMA tarjeta del Layout (LayoutSheet.buildCardSvg): encabezado con el logo (o las iniciales), el Sitio y la empresa, el título, un marco con el
// nombre del activo sobre un fondo suave, el QR grande con su llamada arriba y el localizador al pie, todo con el color de la empresa. Salen igual que en el Layout: una ventana donde se elige el tamaño de la tarjeta (las
// mismas medidas rápidas, ancho y largo libres y la línea para recortar) y se baja en PDF (una tarjeta por página, de todos los activos) o en imagen (la de la vista previa); o se imprimen cuatro por hoja carta.
const ASSET_QR_KINDS = {
    clean: { path: '/api/business/layout/cleaning-qr', title: 'main.layoutQrLimpiezaTitulo', scan: 'main.layoutQrLimpiezaEscanea', empty: 'main.layoutQrLimpiezaVacio', icon: 'sparkle', color: '#2A9D8F', zone: 'layout-qr-clean-zone', name: 'menu.opCentroDistLimpieza', file: 'QR-Limpieza' },
    temp: { path: '/api/business/layout/temperature-qr', title: 'main.layoutQrTemperaturasTitulo', scan: 'main.layoutQrTemperaturasEscanea', empty: 'main.layoutQrTemperaturasVacio', icon: 'thermometer', color: '#2F8FD1', zone: 'layout-qr-temp-zone', name: 'menu.opCentroDistTemperaturas', file: 'QR-Temperaturas' },
    safety: { path: '/api/business/layout/safety-qr', title: 'main.layoutQrSeguridadTitulo', scan: 'main.layoutQrSeguridadEscanea', empty: 'main.layoutQrSeguridadVacio', icon: 'shield', color: '#C0392B', zone: 'layout-qr-safety-zone', name: 'menu.opCentroDistSeguridad', file: 'QR-Seguridad', category: 'main.layoutQrSeguridadCategoria', safety: true },
    sensor: { path: '/api/business/layout/sensor-qr', title: 'main.layoutQrSensoresTitulo', scan: 'main.layoutQrSensoresEscanea', empty: 'main.layoutQrSensoresVacio', icon: 'thermometer', color: '#2B8CA3', zone: 'layout-qr-sensor-zone', name: 'main.colLayoutSensores', file: 'QR-Sensores', category: 'main.layoutQrSensoresCategoria', sensor: true },
};
// Lo guardado que manda el servidor (los activos de la zona elegida con su QR, el color y el logo del cliente) y lo que hace falta para dibujar sus tarjetas.
async function loadAssetQr(kind) {
    const k = ASSET_QR_KINDS[kind];
    const zone = $(k.zone).value;
    const base = layoutUrl(k.path);
    const res = await fetch(zone ? `${base}${base.includes('?') ? '&' : '?'}zone=${encodeURIComponent(zone)}` : base, { credentials: 'include' });
    if (res.status === 403) { Dashboard.showToast(t('main.layoutQrSinPermiso'), 'warning'); return null; }
    if (!res.ok) throw new Error('asset qr failed');
    const data = await res.json();
    if (!data.spaces.length) { Dashboard.showToast(t(k.empty), 'warning'); return null; }
    return {
        k, data, logoRatio: await logoRatioOf(data.logoDataUrl), theme: window.LayoutMapSvg.theme(data.companyColor),
        labels: { cardArea: t('main.layoutTarjetaArea'), cardCategory: t(k.category || 'main.colLimActivo').toUpperCase(), cardReview: t(k.scan), cardEmpty: '', cutCaption: t('main.layoutHojaRecorte') },
    };
}
function assetCardSvg(ctx, s, options) {
    const { k, data } = ctx;
    return window.LayoutSheet.buildCardSvg({
        companyName: data.companyName, siteName: data.siteName || '', logoDataUrl: data.logoDataUrl, logoRatio: ctx.logoRatio, theme: ctx.theme, zoneName: t(k.title),
        categories: [{ name: s.code, desc: [k.safety ? typeLabel('safety', s.type) : (k.sensor ? typeLabel('sensor', s.type) : typeLabel('space', s.type)), k.safety ? s.name : '', s.zoneName].filter(Boolean).join(' · '), icon: k.icon, color: k.color, qrRows: s.qrRows }],
    }, { ...ctx.labels, cardFooter: s.locator }, options);
}
// Imprimir: cuatro tarjetas por hoja carta, cada una con su línea punteada para recortar.
async function printAssetQrCards(kind) {
    const ctx = await loadAssetQr(kind);
    if (!ctx) return;
    const cards = ctx.data.spaces.map((s) => `<div class="c">${assetCardSvg(ctx, s, { widthCm: 10.5, heightCm: 14.8, cut: false })}</div>`).join('');
    const doc = `<!doctype html><html lang="${esc(Dashboard.getLanguage ? Dashboard.getLanguage() : 'es')}"><head><meta charset="utf-8"><title>${esc(t(ctx.k.title))}</title><style>
        @page{ size: letter; margin: 8mm; } *{ box-sizing: border-box; } body{ margin: 0; }
        .g{ display: grid; grid-template-columns: repeat(2, 9.2cm); gap: 3mm; justify-content: center; }
        .c{ width: 9.2cm; height: 12.97cm; border: 0.3mm dashed #777; break-inside: avoid; } .c svg{ display: block; width: 100%; height: 100%; }
        </style></head><body><div class="g">${cards}</div></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { Dashboard.showToast(t('main.layoutQrLimpiezaBloqueado'), 'warning'); return; }
    w.document.open();
    w.document.write(doc);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (err) { /* el usuario puede imprimir desde la ventana */ } }, 400);
}
// La ventana de tamaño (la misma de la tarjeta de categorías del Layout: se recuerda la última medida en este navegador).
let assetQr = null; // { ctx, index }
let assetQrModalEl = null;
const assetQrOptions = () => ({ widthCm: cardSize.w, heightCm: cardSize.h, cut: cardSize.cut });
function renderAssetQrPreview() {
    if (!assetQr) return;
    const { ctx, index } = assetQr;
    $('layout-aq-preview').innerHTML = assetCardSvg(ctx, ctx.data.spaces[index], assetQrOptions());
    const page = window.LayoutSheet.pageFor(cardSize.w, cardSize.h, cardSize.cut);
    const archivo = page.small ? `${t(`main.layoutHojaPag_${page.name}`)} (${fmt(page.w, 1)} × ${fmt(page.h, 1)} cm)` : t('main.layoutHojaMismo').replace('{w}', fmt(cardSize.w, 1)).replace('{h}', fmt(cardSize.h, 1));
    $('layout-aq-info').innerHTML = `<span>${esc(t('main.layoutHojaEspacio'))}: <b>${fmt(cardSize.w, 1)} × ${fmt(cardSize.h, 1)} cm</b></span><span>${esc(t('main.layoutHojaArchivo'))}: <b>${esc(archivo)}</b></span><span>${esc(t(ctx.data.spaces.length === 1 ? 'main.layoutQrAssetNotaUno' : 'main.layoutQrAssetNota', { n: fmt(ctx.data.spaces.length) }))}</span>`;
    document.querySelectorAll('#layout-aq-modal [data-cpre]').forEach((b) => {
        const p = window.LayoutSheet.PRESETS.find((x) => x[0] === b.dataset.cpre);
        b.setAttribute('aria-pressed', String(!!p && Math.abs(p[1] - cardSize.w) < 0.05 && Math.abs(p[2] - cardSize.h) < 0.05));
    });
}
function closeAssetQrDialog() {
    if (assetQrModalEl) assetQrModalEl.hidden = true;
    assetQr = null;
}
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && assetQr) closeAssetQrDialog(); });
function ensureAssetQrModal() {
    if (assetQrModalEl) return;
    assetQrModalEl = document.createElement('div');
    assetQrModalEl.className = 'modal-overlay';
    assetQrModalEl.id = 'layout-aq-modal';
    assetQrModalEl.hidden = true;
    const presets = window.LayoutSheet.PRESETS.map(([id]) => `<button type="button" class="layout-pre" data-cpre="${id}" aria-pressed="false">${esc(t(`main.layoutHojaPre_${id}`))}</button>`).join('');
    assetQrModalEl.innerHTML = `<div class="modal-panel layout-card-dialog" role="dialog" aria-modal="true" aria-labelledby="layout-aq-title">
        <h3 id="layout-aq-title"></h3>
        <div class="layout-sizebar layout-card-bar" data-help-key="layoutSheetSize"><div class="layout-sizebar-row"><span class="layout-sizebar-title">${esc(t('main.layoutHojaTamano'))}</span><div class="layout-presets" role="group">${presets}</div></div>
            <div class="layout-sizebar-row"><label>${esc(t('main.layoutHojaAncho'))}<input type="number" id="layout-aq-w" min="6" max="120" step="0.1" value="${cardSize.w}"></label><label>${esc(t('main.layoutHojaLargo'))}<input type="number" id="layout-aq-h" min="6" max="120" step="0.1" value="${cardSize.h}"></label><button type="button" class="btn btn-secondary" id="layout-aq-swap">${esc(t('main.layoutHojaGirar'))}</button><label class="layout-check"><input type="checkbox" id="layout-aq-cut"${cardSize.cut ? ' checked' : ''}> ${esc(t('main.layoutHojaLinea'))}</label></div>
            <div class="layout-sizebar-row"><label>${esc(t('main.layoutQrAssetActivo'))}<select id="layout-aq-asset"></select></label></div>
            <div class="layout-sizebar-info" id="layout-aq-info"></div></div>
        <div class="layout-sheet-preview layout-card-preview" id="layout-aq-preview"></div>
        <div class="layout-fmt-footer"><button type="button" class="btn" id="layout-aq-pdf" data-help-key="layoutQrPdf">${esc(t('main.layoutDescargarPdf'))}</button><button type="button" class="btn btn-secondary" id="layout-aq-png" data-help-key="layoutQrPng">${esc(t('main.layoutDescargarPng'))}</button><span class="layout-fmt-spacer"></span><button type="button" class="btn btn-secondary" id="layout-aq-close">${esc(t('main.layoutFormatoCerrar'))}</button></div>
    </div>`;
    document.body.appendChild(assetQrModalEl);
    assetQrModalEl.addEventListener('click', async (event) => {
        if (event.target === assetQrModalEl || event.target.closest('#layout-aq-close')) { closeAssetQrDialog(); return; }
        const pre = event.target.closest('[data-cpre]');
        if (pre) {
            const p = window.LayoutSheet.PRESETS.find((x) => x[0] === pre.dataset.cpre);
            cardSize.w = p[1]; cardSize.h = p[2];
        } else if (event.target.closest('#layout-aq-swap')) {
            [cardSize.w, cardSize.h] = [cardSize.h, cardSize.w];
        } else if (event.target.closest('#layout-aq-pdf') || event.target.closest('#layout-aq-png')) {
            const pdf = !!event.target.closest('#layout-aq-pdf');
            const btn = pdf ? $('layout-aq-pdf') : $('layout-aq-png');
            const label = btn.textContent;
            const { ctx, index } = assetQr;
            const day = new Date().toISOString().slice(0, 10);
            btn.disabled = true;
            btn.textContent = t('main.layoutQrAssetPreparando');
            try {
                if (pdf) {
                    const blob = await window.LayoutSheet.renderPdfPages(ctx.data.spaces.map((s) => assetCardSvg(ctx, s, assetQrOptions())));
                    window.LayoutSheet.saveBlob(blob, `${ctx.k.file}_${slug(ctx.data.siteName || ctx.data.companyName)}_${day}.pdf`);
                } else {
                    const s = ctx.data.spaces[index];
                    window.LayoutSheet.saveBlob(await window.LayoutSheet.renderPng(assetCardSvg(ctx, s, assetQrOptions())), `${ctx.k.file}_${slug(s.code)}_${day}.png`);
                }
                Dashboard.showToast(t('main.layoutDescargaLista'), 'success');
            } catch (err) {
                console.error('Layout: las tarjetas de QR no se pudieron descargar', err);
                Dashboard.showToast(t('main.layoutDescargaError'), 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = label;
            }
            return;
        } else return;
        $('layout-aq-w').value = cardSize.w;
        $('layout-aq-h').value = cardSize.h;
        saveCardSize();
        renderAssetQrPreview();
    });
    assetQrModalEl.addEventListener('input', (event) => {
        if (event.target.id === 'layout-aq-w' || event.target.id === 'layout-aq-h') {
            const v = parseFloat(event.target.value);
            if (!(v >= 6 && v <= 120)) return;
            if (event.target.id === 'layout-aq-w') cardSize.w = v; else cardSize.h = v;
        } else if (event.target.id === 'layout-aq-cut') cardSize.cut = event.target.checked;
        else return;
        saveCardSize();
        renderAssetQrPreview();
    });
    assetQrModalEl.addEventListener('change', (event) => {
        if (event.target.id !== 'layout-aq-asset' || !assetQr) return;
        assetQr.index = Math.max(0, Number(event.target.value) || 0);
        renderAssetQrPreview();
    });
}
async function openAssetQrDialog(kind) {
    const ctx = await loadAssetQr(kind);
    if (!ctx) return;
    ensureAssetQrModal();
    assetQr = { ctx, index: 0 };
    $('layout-aq-title').textContent = t('main.layoutQrAssetTitulo', { name: t(ctx.k.name) });
    $('layout-aq-asset').innerHTML = ctx.data.spaces.map((s, i) => `<option value="${i}">${esc(s.code)}${s.zoneName ? ` · ${esc(s.zoneName)}` : ''}</option>`).join('');
    assetQrModalEl.hidden = false;
    renderAssetQrPreview();
}
function qrZoneOptions() {
    const zones = ((state.saved && state.saved.zones) || []).filter((z) => z.active !== false);
    const select = $('layout-qr-zone');
    const current = select.value;
    // La lista solo lleva el nombre de la zona; su tipo sale aparte, en su propio campo (Tipo de zona), como en las tablas.
    select.innerHTML = zones.map((z) => `<option value="${esc(z.id)}">${esc(z.name)}</option>`).join('');
    if (zones.some((z) => z.id === current)) select.value = current;
    const picked = zones.find((z) => z.id === select.value);
    $('layout-qr-zone-kind').value = picked ? (picked.type ? typeLabel('zone', picked.type) : t('main.layoutSinZona')) : '';
    const typeSelect = $('layout-qr-type');
    if (!typeSelect.options.length) typeSelect.innerHTML = ZONE_CATEGORY_TYPES.map(([key, label]) => `<option value="${key}">${esc(t(`main.${label}`))}</option>`).join('');
    return zones;
}
function codesText(n) {
    return t(n === 1 ? 'main.layoutZonaCodigosUno' : 'main.layoutZonaCodigos').replace('{n}', fmt(n));
}
async function loadQrZone() {
    const zones = qrZoneOptions();
    loadQrCls();
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
        const res = await fetch(layoutUrl(`/api/business/layout/zone-categories?zone=${encodeURIComponent($('layout-qr-zone').value)}&type=${encodeURIComponent($('layout-qr-type').value)}`), { credentials: 'include' });
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
// Con o sin medidas y m² para lo que se imprime: lo que se eligió en la ventana de descarga (si está abierta) o, si no, lo que se ve en el croquis.
const sheetView = () => (sheetDialog && sheetDialog.view) || { measures: state.showMeasures, area: state.showArea, names: state.showNames, totals: true, legend: true, rotation: state.rotation || 0 };
function buildSheetSvgFrom(loaded) {
    const { data, logoRatio } = loaded;
    return window.LayoutSheet.buildSheetSvg({
        // Sitio: el que se escribe a mano en el Layout (Contorno > Sitio); sin él sale el texto de siempre. Después se llenará de la configuración (aquí es donde se conecta).
        companyName: data.companyName, siteName: data.siteName || t('main.layoutHojaArea'), logoDataUrl: data.logoDataUrl || '', logoRatio, version: data.version, updatedAt: new Date(`${String(data.updatedAt).replace(' ', 'T')}Z`), printedAt: new Date(),
        url: data.url, qrRows: data.qrRows, kpis: data.kpis, theme: window.LayoutMapSvg.theme(data.companyColor),
        // el reporte sale como se ve el croquis ahorita: sus capas activas y las medidas visibles u ocultas
        layout: { ...data.layout, obstacles: (data.extras && data.extras.obstacles) || [], power: (data.extras && data.extras.power) || [] },
        view: { layers: [...new Set(state.steps.map((s) => (s === 'espacios' ? 'huellas' : (s === 'posiciones' ? 'activos' : s))))], measures: sheetView().measures, area: sheetView().area, names: sheetView().names, totals: sheetView().totals, legend: sheetView().legend, rotation: sheetView().rotation },
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
            <div class="layout-sizebar-row layout-sheet-content" data-help-key="layoutSheetContent"><span class="layout-sizebar-title">${esc(t('main.layoutHojaContenido'))}</span>
                <button type="button" class="layout-sheet-tgl" id="layout-sheet-tgl-measures" data-sheet-tgl="measures" aria-pressed="true"><i class="bx bx-ruler" aria-hidden="true"></i><span>${esc(t('main.layoutHojaConMedidas'))}</span></button>
                <button type="button" class="layout-sheet-tgl" id="layout-sheet-tgl-area" data-sheet-tgl="area" aria-pressed="true"><i class="bx bx-area" aria-hidden="true"></i><span>${esc(t('main.layoutHojaConM2'))}</span></button>
                <button type="button" class="layout-sheet-tgl" id="layout-sheet-tgl-names" data-sheet-tgl="names" aria-pressed="true"><i class="bx bx-rename" aria-hidden="true"></i><span>${esc(t('main.layoutHojaConNombres'))}</span></button>
                <button type="button" class="layout-sheet-tgl" id="layout-sheet-tgl-totals" data-sheet-tgl="totals" aria-pressed="true"><i class="bx bx-bar-chart-alt-2" aria-hidden="true"></i><span>${esc(t('main.layoutHojaConTotales'))}</span></button>
                <button type="button" class="layout-sheet-tgl" id="layout-sheet-tgl-legend" data-sheet-tgl="legend" aria-pressed="true"><i class="bx bx-list-ul" aria-hidden="true"></i><span>${esc(t('main.layoutHojaConSimbologia'))}</span></button>
                <button type="button" class="layout-sheet-tgl layout-sheet-rot" id="layout-sheet-rot" data-sheet-rot="1" aria-pressed="false"><i class="bx bx-rotate-right" aria-hidden="true"></i><span>${esc(t('main.layoutGirarBtn'))}</span></button></div>
            <div class="layout-sizebar-info" id="layout-size-info"></div></div>
        <div class="layout-sheet-preview layout-card-preview" id="layout-sheet-preview"></div>
        <div class="layout-fmt-footer"><button type="button" class="btn" id="layout-sheet-pdf" data-help-key="layoutQrPdf">${esc(t('main.layoutDescargarPdf'))}</button><button type="button" class="btn btn-secondary" id="layout-sheet-png" data-help-key="layoutQrPng">${esc(t('main.layoutDescargarPng'))}</button><span class="layout-fmt-spacer"></span><button type="button" class="btn btn-secondary" id="layout-sheet-close">${esc(t('main.layoutFormatoCerrar'))}</button></div>
    </div>`;
    document.body.appendChild(sheetModalEl);
    sheetModalEl.addEventListener('click', async (event) => {
        if (event.target === sheetModalEl || event.target.closest('#layout-sheet-close')) { closeSheetDialog(); return; }
        // Con o sin medidas / m²: solo cambia lo que se imprime (la pantalla no se toca) y la vista previa se actualiza al momento.
        if (event.target.closest('[data-sheet-rot]') && sheetDialog) {
            sheetDialog.view.rotation = ((sheetDialog.view.rotation || 0) + 1) % 4;
            syncSheetToggles();
            renderSheetPreview();
            return;
        }
        const tgl = event.target.closest('[data-sheet-tgl]');
        if (tgl && sheetDialog) {
            sheetDialog.view[tgl.dataset.sheetTgl] = !sheetDialog.view[tgl.dataset.sheetTgl];
            // Con o sin los totales se recuerda en este navegador (como el tamaño de la hoja); medidas y m² siguen lo que se ve en el croquis.
            const rememberKey = { totals: SHEET_TOTALS_KEY, legend: SHEET_LEGEND_KEY }[tgl.dataset.sheetTgl];
            if (rememberKey) { try { localStorage.setItem(rememberKey, sheetDialog.view[tgl.dataset.sheetTgl] ? '1' : '0'); } catch (err) { /* no se recuerda */ } }
            syncSheetToggles();
            renderSheetPreview();
            return;
        }
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
// Los iconos de la ventana (medidas, m² y nombres): solo salen si se tiene el icono correspondiente del árbol, igual que en el croquis.
const SHEET_TOTALS_KEY = 'sgn_layout_sheet_totals';
const SHEET_LEGEND_KEY = 'sgn_layout_sheet_legend';
function syncSheetToggles() {
    if (!sheetDialog || !sheetModalEl) return;
    // Los totales (las cifras de m² y m³ de abajo) no tienen icono propio en el croquis: quien puede descargar la hoja (Códigos QR) puede elegir si los lleva.
    [['measures', 'canToggleMeasures', 'main.layoutMedidasOcultar', 'main.layoutMedidasVer'], ['area', 'canToggleArea', 'main.layoutAreaOcultar', 'main.layoutAreaVer'], ['names', 'canToggleNames', 'main.layoutNombresOcultar', 'main.layoutNombresVer'], ['totals', 'canUseQr', 'main.layoutTotalesOcultar', 'main.layoutTotalesVer'], ['legend', 'canUseQr', 'main.layoutSimbologiaOcultar', 'main.layoutSimbologiaVer']].forEach(([key, perm, hideKey, showKey]) => {
        const btn = sheetModalEl.querySelector(`[data-sheet-tgl="${key}"]`);
        const allowed = !!(state.perms && state.perms[perm]);
        btn.hidden = !allowed;
        const on = sheetDialog.view[key];
        btn.setAttribute('aria-pressed', String(on));
        btn.classList.toggle('off', !on);
        btn.setAttribute('aria-label', t(on ? hideKey : showKey));
        btn.title = t(on ? hideKey : showKey);
    });
    // El giro (solo para esta descarga) lo puede elegir quien puede girar el croquis.
    const rotBtn = sheetModalEl.querySelector('[data-sheet-rot]');
    rotBtn.hidden = !(state.perms && state.perms.canRotate);
    const turns = sheetDialog.view.rotation || 0;
    rotBtn.classList.toggle('off', !turns);
    rotBtn.setAttribute('aria-pressed', String(!!turns));
    rotBtn.title = `${t('main.layoutGirarBtn')} (${turns * 90}°)`;
    rotBtn.setAttribute('aria-label', rotBtn.title);
    // sin ningún icono permitido no hay nada que elegir: la fila no se muestra
    sheetModalEl.querySelector('.layout-sheet-content').hidden = ![...sheetModalEl.querySelectorAll('[data-sheet-tgl], [data-sheet-rot]')].some((b) => !b.hidden);
}
async function openSheetDialog(kind) {
    if (isDirty()) Dashboard.showToast(t('main.layoutDescargaGuardado'), 'info');
    const loaded = await loadSheetData();
    if (!loaded) return;
    ensureSheetModal();
    // Al abrir, la hoja sale como se ve el croquis (con o sin medidas y m²); aquí mismo se puede cambiar solo para esta descarga.
    let totals = true;
    let legend = true;
    try { totals = localStorage.getItem(SHEET_TOTALS_KEY) !== '0'; legend = localStorage.getItem(SHEET_LEGEND_KEY) !== '0'; } catch (err) { /* sin almacenamiento: se incluyen */ }
    sheetDialog = { kind, loaded, view: { measures: state.showMeasures, area: state.showArea, names: state.showNames, totals, legend, rotation: state.rotation || 0 } };
    syncSheetToggles();
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
$('layout-qr-clean-zone').addEventListener('change', cleanZoneOptions);
$('layout-qr-temp-zone').addEventListener('change', tempZoneOptions);
$('layout-qr-sensor-zone').addEventListener('change', sensorZoneOptions);
$('layout-qr-safety-zone').addEventListener('change', safetyZoneOptions);
$('layout-qr-type').addEventListener('change', loadQrZone);
document.addEventListener('click', (event) => { if (!event.target.closest('#layout-qrmenu')) closeQrPop(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeQrPop(); });

async function fetchQrData() {
    const res = await fetch(layoutUrl('/api/business/layout/qr'), { credentials: 'include' });
    if (res.status === 403) { Dashboard.showToast(t('main.layoutQrSinPermiso'), 'warning'); return null; }
    if (res.status === 404) { Dashboard.showToast(t('main.layoutQrSinLayout'), 'warning'); return null; }
    if (!res.ok) throw new Error('layout qr failed');
    return res.json();
}
function sheetLabels() {
    return {
        area: t('main.layoutHojaArea'), title: t('main.layoutHojaTitulo'), height: t('main.layoutHojaAltura'), spaces: t('main.layoutHojaEspacios'),
        power: t('main.layoutLeyendaLuz'), column: t('main.layoutLeyendaColumna'), wall: t('main.layoutLeyendaPared'), step: t('main.layoutLeyendaDesnivel'),
        kpiTotal: t('main.layoutHojaKpiTotal'), kpiOffices: t('main.layoutHojaKpiOficinas'), kpiAisles: t('main.layoutHojaKpiPasillos'),
        kpiDocks: t('main.layoutHojaKpiAndenes'), kpiStorage: t('main.layoutHojaKpiAlmacenamiento'), kpiDead: t('main.layoutHojaKpiMuertos'), kpiVolume: t('main.layoutHojaKpiVolumen'),
        scan: t('main.layoutHojaEscanea'), fixed: t('main.layoutHojaNoCambia'), door: t('main.layoutLeyendaPuerta'), space: t('main.layoutLeyendaEspacio'), footprint: t('main.layoutLeyendaHuella'),
        dry: typeLabel('zone', 'dry'), cold: typeLabel('zone', 'cold'), chemical: typeLabel('zone', 'chemical'), finished: typeLabel('zone', 'finished'),
        aisle: typeLabel('zone', 'aisle'), aisle2: typeLabel('zone', 'aisle2'), dock: typeLabel('zone', 'dock'), office: typeLabel('zone', 'office'), none: t('main.layoutSinZona'),
        ...Object.fromEntries(LC.SAFETY_TYPES.map((tp) => [`safety_${tp}`, typeLabel('safety', tp)])),
        contour: t('main.colLayoutContorno'),
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
    const res = await fetch('/api/business/layout/qr/regenerate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ confirm: true, costCenterId: state.centerId }) });
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
        else if (kind === 'zone-cls') await openClassificationSheetDialog();
        else if (kind === 'pdf' || kind === 'png') await openSheetDialog(kind);
        else if (kind === 'link') await copyQrLink();
        else if (kind === 'clean-print') await printAssetQrCards('clean');
        else if (kind === 'clean-download') await openAssetQrDialog('clean');
        else if (kind === 'temp-download') await openAssetQrDialog('temp');
        else if (kind === 'temp-print') await printAssetQrCards('temp');
        else if (kind === 'sensor-download') await openAssetQrDialog('sensor');
        else if (kind === 'sensor-print') await printAssetQrCards('sensor');
        else if (kind === 'safety-download') await openAssetQrDialog('safety');
        else if (kind === 'safety-print') await printAssetQrCards('safety');
        else if (kind === 'regen') await regenerateQr();
    } catch (err) {
        console.error('Layout: acción de QR falló', err);
        Dashboard.showToast(t('main.layoutDescargaError'), 'error');
    }
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-centro-dist-layout' });
        if (!role) return;
        await loadLayout();
    } catch (err) {
        console.error('Layout failed to initialize:', err);
    }
})();
})();
