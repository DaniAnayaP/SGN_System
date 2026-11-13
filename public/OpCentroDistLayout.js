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
// El orden de los pasos en la barra (Localizadores, que no edita nada, siempre va al final).
const SECTION_ORDER = ['contorno', 'pisos', 'rampas', 'paredes', 'puertas', 'obstaculos', 'seguridad', 'techos', 'sensores', 'luz', 'transito', 'objetos', 'zonas', 'espacios', 'activos', 'niveles', 'posiciones', 'ubicaciones'];
// Los pasos de solo consulta (no editan nada, no llevan candado y van al final de la barra con su flechita): Localizadores y Relación Código.
const INFO_STEPS = ['localizadores', 'relacion'];
const SECTION_LABEL_KEYS = {
    relacion: 'main.layoutRelacionCodigoLink', contorno: 'main.layoutStepContorno', paredes: 'main.layoutStepParedes', obstaculos: 'main.layoutStepObstaculos', puertas: 'main.layoutStepPuertas', luz: 'main.layoutStepLuz', sensores: 'main.layoutStepSensores', seguridad: 'main.layoutStepSeguridad', techos: 'main.layoutStepTechos', transito: 'main.layoutStepTransito', objetos: 'main.layoutStepObjetos', zonas: 'main.layoutStepZonas', pisos: 'main.layoutStepPisos', rampas: 'main.layoutStepRampas', espacios: 'main.layoutStepEspacios', activos: 'main.layoutStepActivos', posiciones: 'main.layoutStepPosiciones', ubicaciones: 'main.layoutStepUbicaciones', niveles: 'main.layoutStepNiveles', localizadores: 'main.layoutStepLocalizadores',
};
const state = {
    mode: 'view', saved: null, draft: null, version: 0, perms: null, showMeasures: true, showOpening: true, showLevels: true, showArea: true, showNames: true, rotation: 0, steps: ['contorno'], focus: 'contorno', focusStack: ['contorno'], catsOpen: null, catEdit: null, creating: false,
    planImage: '', planNew: false, planAspect: 1, pendingPlan: null, loaded: false, view3d: false, centerId: null, costCenter: null,
    // figuras que se están armando lado por lado y todavía no cierran (no se pueden guardar así), cómo se captura el contorno y la zona cuyos lados están a la vista
    open: { contorno: false, zones: {} }, contornoMode: 'sides', zoneOpen: null,
    // lo que se enfocó con la búsqueda (zona o huella) y lo que se ocultó de ello: ver «buscar una zona o una huella»
    find: null, findDim: false, zoneScope: [], pick: [], // Ver: las zonas elegidas (Zona) y las cosas elegidas (Elegir) van de la mano; state.find sale de las dos
    // el usuario pidió renumerar los códigos de los activos (se ve en el borrador y se aplica al guardar)
    renumber: false,
    // lo que se eligió en la tabla y se resalta en el croquis: { kind: 'zone' | 'space' | 'bay', id, n, c, step } (por id, no por número de renglón, para que no se mueva al quitar o agregar renglones)
    hl: null,
};
let view = null;
let drag = null;
// Las dos listas del paso Activos (catálogos del cliente): clasificaciones (Mobiliario operativo…) y tipos (rack, estante…); [{ id, name, status }].
let assetLists = { classes: [], types: [] };
// Paso Activos: la zona elegida en un renglón que todavía no tiene huella (solo de pantalla; id del activo -> id de zona). Con huella, la zona es la de su huella.
const zonePick = new Map();
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
    const keep = (s) => INFO_STEPS.includes(s) || visible.includes(s);
    state.steps = state.steps.filter(keep);
    state.focusStack = state.focusStack.filter(keep);
    if (!state.steps.length) state.steps = [visible[0]];
    if (!state.steps.includes(state.focus)) state.focus = state.steps[state.steps.length - 1];
    if (!state.focusStack.length) state.focusStack = [state.focus];
}
// Igual que canEditField: "Modificar" siempre; "Ver y Operar" solo mientras esa sección no tenga datos ya guardados.
function canEdit(section) {
    if (state.mode !== 'edit') return false; // en «Ver» no se mueve ni se escribe nada
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
    renderOutList();
}
// ---- Lo que se sale de su contenedor ---------------------------------------------------------------------------------------------------------------
// Bajo los KPIs: la lista de todo lo que hoy no cabe en lo que lo contiene (LayoutCalc.outOfContainer: zona en la nave, huella en su zona, activo en su huella, niveles y espacios en su activo, posición en su espacio). Solo salen
// los pasos que la cuenta puede ver, y «Ir a verlo» abre el paso, elige el renglón y lo marca en el croquis. Se vuelve a calcular con cada cambio (con una pausa corta para no estorbar al teclear).
let outItems = [];
let outTimer = 0;
const OUT_MAX = 200;
function renderOutList() {
    clearTimeout(outTimer);
    outTimer = setTimeout(drawOutList, 150);
}
function drawOutList() {
    const box = $('layout-out');
    if (!box) return;
    outItems = state.draft ? LC.outOfContainer(state.draft).filter((it) => stepVisible(it.step)) : [];
    box.hidden = !outItems.length;
    if (!outItems.length) return;
    $('layout-out-title').textContent = t(outItems.length === 1 ? 'main.layoutSaleTitulo_uno' : 'main.layoutSaleTitulo_varias', { n: outItems.length });
    let html = '';
    let last = '';
    outItems.slice(0, OUT_MAX).forEach((it, i) => {
        if (it.level !== last) { html += `${last ? '</ul>' : ''}<h4 class="layout-out-grp">${esc(t(`main.layoutSaleGrp_${it.level}`))}</h4><ul>`; last = it.level; }
        html += `<li><span>${esc(t(`main.layoutSale_${it.level}_${it.kind}`, it.vars))}</span><button type="button" class="layout-out-go" data-out-go="${i}">${esc(t('main.layoutSaleIr'))}</button></li>`;
    });
    html += `</ul>${outItems.length > OUT_MAX ? `<p class="layout-muted">${esc(t('main.layoutSaleMas', { n: outItems.length - OUT_MAX }))}</p>` : ''}`;
    $('layout-out-list').innerHTML = html;
}
function goToOut(it) {
    if (!it || !state.draft || !stepVisible(it.step)) return;
    showStep(it.step);
    if (state.mode === 'edit') renderPanel();
    state.hlList = null;
    selectEntity({ ...it.target }, 'zoom');
    applyHighlight('zoom'); // elegir puede reencuadrar el croquis (cambió lo enfocado): se acerca otra vez a lo elegido
    const row = highlightedRow();
    if (row) revealRow(row, 'center');
    const map = $('layout-svg');
    if (map && !map.hasAttribute('hidden')) map.scrollIntoView({ block: 'nearest' });
}
document.addEventListener('click', (event) => {
    const go = event.target.closest('[data-out-go]');
    if (go) goToOut(outItems[Number(go.getAttribute('data-out-go'))]);
});

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
function ownCells(s, i, disabled, keys = OWN_KEYS) {
    const eff = ownEffective(s);
    const bad = spIssues.get(s.id) || {};
    return keys.map((key) => {
        const flag = key === 'oh' ? bad.tall : (bad.sum || bad.out || bad.overlap);
        return `<td><input type="number" step="0.1" min="${key === 'ox' || key === 'oy' ? 0 : 0.01}" data-l="spaces" data-i="${i}" data-k="${key}" data-help-key="layoutActivoMedidas"${flag ? ' class="layout-missing"' : ''} value="${s[key] === undefined || s[key] === null ? '' : s[key]}" placeholder="${eff[key] === undefined ? '' : eff[key]}"${disabled ? ' disabled' : ''}></td>`;
    }).join('');
}
function cellText(list, i, key, value, disabled) {
    return `<td><input type="text" maxlength="${LC.LIMITS.text}" data-l="${list}" data-i="${i}" data-k="${key}" value="${esc(value)}"${disabled ? ' disabled' : ''}></td>`;
}
function cellSelect(list, i, key, optionsMarkup, disabled, helpKey) {
    return `<td><select data-l="${list}" data-i="${i}" data-k="${key}"${helpKey ? ` data-help-key="${helpKey}"` : ''}${disabled ? ' disabled' : ''}>${optionsMarkup}</select></td>`;
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
const FILTER_TABLE_IDS = ['layout-ubicaciones', 'layout-zonas', 'layout-pisos', 'layout-rampas', 'layout-espacios', 'layout-activos', 'layout-posiciones', 'layout-niveles', 'layout-localizadores', 'layout-relacion', 'layout-paredes', 'layout-contorno-lados', 'layout-contorno-esquinas', 'layout-obstaculos', 'layout-puertas', 'layout-luz', 'layout-sensores', 'layout-seguridad', 'layout-techos', 'layout-cubiertas', 'layout-objetos', 'layout-transito'];
// Qué tabla con filtro corresponde a cada lista que se agrega: al agregar un renglón se quitan sus filtros para que el nuevo siempre se vea.
const FILTER_OF_LIST = { ubicaciones: 'layout-ubicaciones', obstacles: 'layout-obstaculos', doors: 'layout-puertas', power: 'layout-luz', sensors: 'layout-sensores', safety: 'layout-seguridad', ceiling: 'layout-techos', roofs: 'layout-cubiertas', transit: 'layout-transito', objects: 'layout-objetos', vertices: 'layout-contorno-esquinas', contornoLados: 'layout-contorno-lados' };
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
    const canDelete = state.perms && (list === 'zones' ? state.perms.canDeleteZones : (list === 'floors' || list === 'ramps' ? true : state.perms.canDeleteSpaces));
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
    const originRow = isC ? '' : `<div class="layout-fl"><label>${esc(t('main.layoutEmpiezaX'))}<input type="number" step="0.05" ${attr}="ox${sfx}" data-help-key="layoutOrigin" value="${sh.origin[0]}"${dis ? ' disabled' : ''}></label><label>${esc(t('main.layoutEmpiezaY'))}<input type="number" step="0.05" ${attr}="oy${sfx}" data-help-key="layoutOrigin" value="${sh.origin[1]}"${dis ? ' disabled' : ''}></label></div>`;
    return `${originRow}${table(head, rows, isC ? 'layout-contorno-lados' : undefined)}<div class="layout-sidesbar"><button type="button" class="btn btn-secondary layout-add" data-sadd="${esc(key)}"${isC ? ' data-main-add="1"' : ''} data-help-key="layoutSideAdd"${dis ? ' disabled' : ''}>${esc(t('main.layoutAgregarLado'))}</button><span data-sides-status="${esc(key)}">${sidesStatusHtml(key, dis)}</span></div>`;
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
    if (zoneClash.has(z.id)) chips.push(`<span class="layout-chip warn">${esc(t('main.layoutZonaSeEnciman', { codes: zoneClash.get(z.id).join(', ') }))}</span>`);
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
    else if (kind === 'len') {
        // Un lado sin medida (el campo vacío o en 0 mientras se escribe el número nuevo) NO se aplica: un lado de 0 m pierde su dirección (al volver a leer las esquinas queda «derecha») y la figura ya no cierra.
        // Se conserva la medida de antes hasta que haya un número mayor que 0.
        if (!(num > 0)) return;
        sides[at][1] = n;
    }
    else if (kind === 'h') heights[at] = n;
    sh.apply(origin, sides, heights);
    refreshLive();
}
// Al empezar a editar: nada está abierto y el contorno se captura por lados (también se puede por esquinas con X, Y).
// keepView = lo que se hace después de GUARDAR: la persona sigue configurando, así que se queda todo lo que tenía abierto y elegido (la zona abierta, Elegir, el Localizador, el renglón elegido, el acercamiento del croquis y del 3D);
// solo cambia lo que ya no aplica (renumerar). Sin keepView (abrir, descartar, otro centro) el estado empieza limpio.
function initEditState(keepView) {
    state.renumber = false;
    if (keepView) return;
    state.open = { contorno: false, zones: {} };
    state.zoneOpen = null;
    state.contornoMode = 'sides';
    state.hl = null;
    locReset();
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
// Las zonas que se enciman con otra: id de la zona -> los códigos (o nombres) de las que se le enciman. Se calcula junto con lo de las huellas, antes de dibujar las marcas de cada zona.
let zoneClash = new Map();
function computeFootprintIssues() {
    fpIssues = new Map();
    zoneClash = new Map();
    if (state.draft) {
        LC.zoneOverlapViolations(state.draft).forEach((v) => {
            [[v.id, v.codeB], [v.otherId, v.codeA]].forEach(([id, other]) => { const list = zoneClash.get(id) || []; list.push(other); zoneClash.set(id, list); });
        });
    }
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
// La apariencia con que se dibuja un sensor (2026-11-13): la de su modelo, que llega con el Layout (look) o, si es un sensor recién colocado, la de su activo del registro. '' / sensor-disc = el círculo de siempre.
function sensorLookOf(e) {
    const raw = e && e.look !== undefined ? e.look : ((state.fixedAssets || []).find((a) => a.id === (e && e.assetRef)) || {}).look;
    return window.AssetLooks ? window.AssetLooks.effective('sensor', raw) : '';
}
// «Zonas que mide» de un sensor: la pared solo sirve para colocarlo; aquí se eligen las zonas cuya temperatura y humedad mide (una o varias). Sin elegir ninguna mide la zona donde está colocado. La celda muestra lo elegido en
// etiquetas chicas (con su ×) y un ＋ abre la lista de zonas para marcar más, igual que «Quién transita».
function sensorZonesCell(x, i, d, dis) {
    const zoneOf = (id) => (d.zones || []).find((z) => z.id === id);
    const chips = (x.zones || []).filter((id) => zoneOf(id)).map((id) => `<span class="layout-chip" data-help-key="layoutSensorZonas">${esc(zoneOf(id).name || id)}${dis ? '' : `<button type="button" class="layout-chip-x" data-sz-del="${i}:${esc(id)}" aria-label="${esc(t('main.layoutQuitar'))}">×</button>`}</span>`).join('');
    const own = chips ? '' : `<span class="layout-muted" data-help-key="layoutSensorZonas">${esc(t('main.layoutSensorMideSuZona'))}</span>`;
    const add = dis ? '' : `<button type="button" class="layout-chip-add" data-sz-open="${i}" data-help-key="layoutSensorZonas" aria-label="${esc(t('main.layoutSensorZonasAgregar'))}" title="${esc(t('main.layoutSensorZonasAgregar'))}">＋</button>`;
    return `<td><div class="layout-chips">${chips}${own}${add}</div></td>`;
}
// «Lado de la pared» de un sensor (2026-11-13): la pared tiene dos lados y cada uno da a una zona; aquí se dice de qué lado está montado el sensor y de ahí sale «Zona donde está». Las dos opciones llevan la zona de cada lado
// (Lado A · Recepción / Lado B · Zona 7; «Afuera» si ese lado cae fuera de la nave). «Automático» = el lado de siempre (los sensores de antes).
function sensorSideCell(x, i, dis) {
    const wall = x.wallId ? (state.draft.obstacles || []).find((o) => o.id === x.wallId && o.kind === 'wall') : null;
    const info = wall ? LC.wallSideInfo(state.draft, wall) : null;
    const zoneText = (k) => { const s = info && info[k]; return s ? (s.zoneName || (s.outside ? t('main.layoutParedAfuera').replace(/^./, (c) => c.toUpperCase()) : '—')) : '—'; };
    const opt = (value, label) => `<option value="${value}"${(x.side || '') === value ? ' selected' : ''}>${esc(label)}</option>`;
    const options = opt('', t('main.layoutSensorLadoAuto')) + opt('a', t('main.layoutSensorLadoA', { zone: zoneText('a') })) + opt('b', t('main.layoutSensorLadoB', { zone: zoneText('b') }));
    return cellSelect('sensors', i, 'side', options, dis || !wall, 'layoutSensorLado');
}
function toggleSensorZone(spec, on) {
    const at = String(spec).indexOf(':');
    const i = String(spec).slice(0, at);
    const id = String(spec).slice(at + 1);
    const row = (state.draft.sensors || [])[Number(i)];
    if (!row) return;
    const order = new Map((state.draft.zones || []).map((z, k) => [z.id, k]));
    const set = new Set(row.zones || []);
    if (on) set.add(id); else set.delete(id);
    const list = [...set].sort((a, b) => (order.has(a) ? order.get(a) : 1e9) - (order.has(b) ? order.get(b) : 1e9));
    if (list.length) row.zones = list; else delete row.zones;
    const reopen = !!document.getElementById('layout-sz-pop');
    renderPanel();
    refreshLive();
    if (reopen) { const btn = document.querySelector(`[data-sz-open="${i}"]`); if (btn) openSensorZonesPop(Number(i), btn); }
}
function closeSensorZonesPop() {
    const el = document.getElementById('layout-sz-pop');
    if (el) el.remove();
}
function openSensorZonesPop(i, anchor) {
    closeSensorZonesPop();
    closeWhoPop();
    const row = (state.draft.sensors || [])[i];
    if (!row) return;
    const picked = new Set(row.zones || []);
    const zones = (state.draft.zones || []).filter((z) => z.active !== false);
    const pop = document.createElement('div');
    pop.id = 'layout-sz-pop';
    pop.className = 'layout-who-pop';
    pop.setAttribute('role', 'group');
    pop.innerHTML = zones.length
        ? zones.map((z) => `<label class="layout-who-item"><input type="checkbox" data-sz-pick="${i}:${esc(z.id)}"${picked.has(z.id) ? ' checked' : ''}><span>${esc(z.name || z.id)}</span><small>${esc(z.code || '')}</small></label>`).join('')
        : `<p class="layout-muted">${esc(t('main.heatSinZonas'))}</p>`;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = `${Math.max(8, Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8))}px`;
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8))}px`;
    pop.addEventListener('change', (event) => { const el = event.target.closest('[data-sz-pick]'); if (el) toggleSensorZone(el.getAttribute('data-sz-pick'), el.checked); });
}
document.addEventListener('click', (event) => { if (!event.target.closest('#layout-sz-pop, [data-sz-open]')) closeSensorZonesPop(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSensorZonesPop(); });
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
// Techos: las faltas de cada elemento (LayoutCalc.ceilingViolations): fuera del contorno de la nave o «Cuelga a» por encima del techo de ese punto. clIssues = id -> { outside, tall }.
let clIssues = new Map();
function computeCeilingIssues() {
    clIssues = new Map();
    if (!state.draft) return;
    LC.ceilingViolations(state.draft).forEach((v) => { const m = clIssues.get(v.id) || {}; m[v.kind] = v; clIssues.set(v.id, m); });
}
const ceilingIssueText = (v) => t(`main.layoutVioCl_${v.kind}`, { code: v.code, ...(v.vars || {}) });
// El código, la zona y el techo de cada elemento salen de su tipo y de su lugar; las cajas de X, Y y «Cuelga a» se marcan en rojo si algo no cumple y abajo del paso va la lista de lo que falta.
function applyCeilingMarks() {
    if (!state.draft) return;
    computeCeilingIssues();
    (state.draft.ceiling || []).forEach((e, i) => {
        const bad = clIssues.get(e.id) || {};
        ['x', 'y'].forEach((key) => {
            const box = document.querySelector(`[data-l="ceiling"][data-i="${i}"][data-k="${key}"]`);
            if (box) box.classList.toggle('layout-missing', !!bad.outside);
        });
        const hBox = document.querySelector(`[data-l="ceiling"][data-i="${i}"][data-k="h"]`);
        if (hBox) { hBox.classList.toggle('layout-missing', !!bad.tall); hBox.placeholder = String(LC.ceilingHangOf(state.draft, e)); }
        const codeCell = document.querySelector(`[data-cl-code="${i}"]`);
        if (codeCell) codeCell.textContent = e.code || '';
        const zoneCell = document.querySelector(`[data-cl-zone="${i}"]`);
        if (zoneCell) zoneCell.textContent = (state.draft.zones.find((z) => z.id === e.zoneId) || {}).name || '—';
        const limitCell = document.querySelector(`[data-cl-limit="${i}"]`);
        if (limitCell) { const lim = LC.ceilingLimitAt(state.draft, e); limitCell.textContent = lim ? fmt(lim) : '—'; }
    });
    const box = document.querySelector('[data-cl-issues]');
    if (box) {
        const all = LC.ceilingViolations(state.draft);
        box.hidden = !all.length;
        box.innerHTML = all.map((v) => `<p>${esc(ceilingIssueText(v))}</p>`).join('');
    }
}
// ---- Techos (cubiertas): las secciones de techo del paso Techos -------------------------------------------------------------------------------------
// Las faltas de cada techo (LayoutCalc.roofViolations): no cubre nada (empty), un área queda fuera del contorno (outside) o su parte alta es más baja que la baja (order). rfIssues = id -> { empty, outside, order }.
let rfIssues = new Map();
function computeRoofIssues() {
    rfIssues = new Map();
    if (!state.draft) return;
    LC.roofViolations(state.draft).forEach((v) => { const m = rfIssues.get(v.id) || {}; m[v.kind] = v; rfIssues.set(v.id, m); });
}
const roofIssueText = (v) => t(`main.layoutVioRf_${v.kind}`, { code: v.code, ...(v.vars || {}) });
// El código, la pendiente y el color de cada techo salen de lo escrito; las cajas del área y de las alturas se marcan en rojo si algo no cumple y abajo de la tabla va la lista de lo que falta.
function applyRoofMarks() {
    if (!state.draft) return;
    computeRoofIssues();
    (state.draft.roofs || []).forEach((r, i) => {
        const bad = rfIssues.get(r.id) || {};
        ['x', 'y', 'l', 'w'].forEach((key) => { const box = document.querySelector(`[data-l="roofs"][data-i="${i}"][data-k="${key}"]`); if (box) box.classList.toggle('layout-missing', !!(bad.outside || bad.empty)); });
        ['h', 'h2'].forEach((key) => { const box = document.querySelector(`[data-l="roofs"][data-i="${i}"][data-k="${key}"]`); if (box) box.classList.toggle('layout-missing', !!bad.order); });
        const codeCell = document.querySelector(`[data-rf-code="${i}"]`);
        if (codeCell) codeCell.textContent = r.code || '';
        const slopeCell = document.querySelector(`[data-rf-slope="${i}"]`);
        if (slopeCell) slopeCell.textContent = `${fmt(LC.roofSlopePct(state.draft, r))} %`;
        const dot = document.querySelector(`[data-rf-dot="${i}"]`);
        if (dot) dot.style.background = LC.roofColorOf(r);
    });
    const box = document.querySelector('[data-rf-issues]');
    if (box) {
        const all = LC.roofViolations(state.draft);
        box.hidden = !all.length;
        box.innerHTML = all.map((v) => `<p>${esc(roofIssueText(v))}</p>`).join('');
    }
}
// La tabla de los techos (arriba de lo que cuelga del techo): forma, qué cubre (toda la nave, zonas o un área), hacia dónde cae o cómo corre la cumbrera, alturas, pendiente (se calcula), material y color.
function roofSectionHtml(d, dis) {
    const roofs = d.roofs || [];
    const dirCell = (r, i) => {
        if (r.shape === 'shed') return cellSelect('roofs', i, 'dir', optionsHtml('roofDirShed', LC.ROOF_SHED_DIRS, r.dir || 's'), dis, 'layoutRoofCae');
        if (r.shape === 'gable') return cellSelect('roofs', i, 'dir', optionsHtml('roofDirGable', LC.ROOF_GABLE_DIRS, r.dir || 'ew'), dis, 'layoutRoofCae');
        return '<td class="layout-calc">—</td>';
    };
    const coverCell = (r, i) => {
        if (r.cover === 'zones') {
            const chosen = r.zoneIds || [];
            const chips = chosen.map((zid) => { const z = (d.zones || []).find((x) => x.id === zid); return `<span class="layout-chip" data-help-key="layoutRoofZonas">${esc(z ? z.name : '—')}${dis ? '' : `<button type="button" class="layout-chip-x" data-roof-zdel="${i}:${esc(zid)}" aria-label="${esc(t('main.layoutQuitar'))}">×</button>`}</span>`; }).join('');
            const left = (d.zones || []).filter((z) => z.active !== false && !chosen.includes(z.id));
            const add = dis || !left.length ? '' : `<select class="layout-roof-zadd" data-roof-zadd="${i}" data-help-key="layoutRoofZonas" aria-label="${esc(t('main.layoutRoofZonaAgregar'))}"><option value="">＋</option>${left.map((z) => `<option value="${esc(z.id)}">${esc(z.name)}</option>`).join('')}</select>`;
            return `<td><div class="layout-chips">${chips}${add}</div></td>`;
        }
        if (r.cover === 'area') {
            const inputs = ['x', 'y', 'l', 'w'].map((k) => `<input type="number" step="0.1" class="layout-roof-in" data-l="roofs" data-i="${i}" data-k="${k}" data-help-key="layoutRoofArea" value="${r[k] === undefined ? '' : r[k]}" placeholder="${esc(t(`main.layoutRoofArea_${k}`))}" title="${esc(t(`main.layoutRoofAreaTitulo_${k}`))}" aria-label="${esc(t(`main.layoutRoofAreaTitulo_${k}`))}"${dis ? ' disabled' : ''}>`).join('');
            return `<td><div class="layout-roof-area">${inputs}</div></td>`;
        }
        return '<td class="layout-calc">—</td>';
    };
    const rows = roofs.map((r, i) => {
        const h2 = r.shape === 'flat' ? '<td class="layout-calc">—</td>' : cellNum('roofs', i, 'h2', r.h2 > 0 ? r.h2 : '', dis, '0.05');
        const color = `<td><div class="layout-roof-color"><i class="layout-roof-dot" data-rf-dot="${i}" style="background:${LC.roofColorOf(r)}"></i><select data-l="roofs" data-i="${i}" data-k="color" data-help-key="layoutRoofColor"${dis ? ' disabled' : ''}>${optionsHtml('roofColor', Object.keys(LC.ROOF_COLORS), r.color || LC.ROOF_COLOR_BY_SHAPE[r.shape])}</select></div></td>`;
        return `<tr><td class="layout-calc"><b data-rf-code="${i}">${esc(r.code || '')}</b></td>${cellSelect('roofs', i, 'shape', optionsHtml('roofShape', LC.ROOF_SHAPES, r.shape), dis, 'layoutRoofForma')}${cellText('roofs', i, 'name', r.name || '', dis)}${cellSelect('roofs', i, 'cover', optionsHtml('roofCover', LC.ROOF_COVERS, r.cover), dis, 'layoutRoofCubre')}${coverCell(r, i)}${dirCell(r, i)}${cellNum('roofs', i, 'h', r.h > 0 ? r.h : '', dis, '0.05')}${h2}<td class="layout-calc" data-rf-slope="${i}">${fmt(LC.roofSlopePct(d, r))} %</td>${cellSelect('roofs', i, 'material', optionsHtml('roofMaterial', LC.ROOF_MATERIALS, r.material || 'sheet'), dis)}${color}${removeCell('roofs', i, dis)}</tr>`;
    });
    const list = rows.length ? table(['main.layoutCodigo', 'main.layoutRoofForma', 'main.layoutNombre', 'main.layoutRoofCubre', 'main.layoutRoofDetalle', 'main.layoutRoofCae', 'main.layoutRoofAlero', 'main.layoutRoofCumbrera', 'main.layoutRoofPendiente', 'main.layoutRoofMaterial', 'main.layoutRoofColor', ''], rows, 'layout-cubiertas') : `<p class="layout-muted">${esc(t('main.layoutCubiertasVacio'))}</p>`;
    return `${list}<div class="layout-vio" data-rf-issues hidden></div>`;
}
// Techos nuevos: al cambiar la forma se agregan (o se quitan) la altura alta y hacia dónde cae; al cambiar lo que cubre se limpian las zonas o el área.
function setRoofShape(row, shape) {
    if (!LC.ROOF_SHAPES.includes(shape)) return;
    row.shape = shape;
    if (shape === 'flat') { delete row.h2; delete row.dir; return; }
    const h = Number(row.h) > 0 ? Number(row.h) : 6;
    if (!(Number(row.h2) > 0)) row.h2 = round2(h + (shape === 'gable' ? 2 : 1));
    const dirs = shape === 'shed' ? LC.ROOF_SHED_DIRS : LC.ROOF_GABLE_DIRS;
    if (!dirs.includes(row.dir)) row.dir = shape === 'shed' ? 's' : 'ew';
}
function setRoofCover(row, cover) {
    if (!LC.ROOF_COVERS.includes(cover)) return;
    row.cover = cover;
    delete row.zoneIds; delete row.x; delete row.y; delete row.l; delete row.w;
    if (cover === 'zones') row.zoneIds = [];
    if (cover === 'area') {
        const xs = state.draft.vertices.map((p) => p[0]);
        const ys = state.draft.vertices.map((p) => p[1]);
        const x0 = Math.min(...xs); const y0 = Math.min(...ys);
        row.x = round2(x0 + 1);
        row.y = round2(y0 + 1);
        row.l = round2(Math.max(1, Math.min(10, (Math.max(...xs) - x0) / 2)));
        row.w = round2(Math.max(1, Math.min(10, (Math.max(...ys) - y0) / 2)));
    }
}
// Elegir una zona más en un techo (o quitarla): el techo toma la forma de las zonas elegidas.
function toggleRoofZone(i, zoneId, on) {
    const row = (state.draft.roofs || [])[i];
    if (!row || row.cover !== 'zones') return;
    const set = new Set(row.zoneIds || []);
    if (on) set.add(zoneId); else set.delete(zoneId);
    row.zoneIds = [...set];
}
// El dibujo de los techos en el croquis: cada sección sobre las zonas, con su rayado y su color, su caída (flechas y, en dos aguas, la cumbrera) y una etiqueta con su código, su forma y sus alturas. Es translúcido para que se vean las zonas de abajo.
function roofLayerSvg(d, X, Y, sc, pick) {
    let defs = '';
    let body = '';
    (d.roofs || []).forEach((r) => {
        const rings = LC.roofRings(d, r);
        if (!rings.length) return;
        const box = LC.roofBox(rings);
        const col = LC.roofColorOf(r);
        const safe = String(r.id).replace(/[^A-Za-z0-9_-]/g, '');
        const bad = rfIssues.get(r.id);
        const px0 = X(box.x0); const px1 = X(box.x1); const py0 = Y(box.y0); const py1 = Y(box.y1);
        const lines = r.shape === 'gable' ? `<line x1="0" y1="0" x2="0" y2="9" stroke="${col}" stroke-width="2" opacity="0.42"/>` : (r.shape === 'shed' ? `<line x1="0" y1="3" x2="9" y2="3" stroke="${col}" stroke-width="2" opacity="0.45"/>` : `<path d="M0,0L9,9M9,0L0,9" stroke="${col}" stroke-width="1.4" opacity="0.45" fill="none"/>`);
        defs += `<pattern id="rfp-${safe}" width="9" height="9" patternUnits="userSpaceOnUse"${r.shape === 'gable' ? ' patternTransform="rotate(45)"' : ''}><rect width="9" height="9" fill="${col}" opacity="0.1"/>${lines}</pattern><marker id="rfa-${safe}" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L8,4L0,8z" fill="${col}"/></marker>`;
        const shapeName = typeLabel('roofShape', r.shape);
        const slope = LC.roofSlopePct(d, r);
        const title = `<title>${esc(r.code || '')} · ${esc(shapeName)}${r.name ? ` · ${esc(r.name)}` : ''} · ${esc(roofHeightsText(r, slope))}${bad ? `\n${esc(Object.values(bad).map(roofIssueText).join(' · '))}` : ''}</title>`;
        rings.forEach((ring) => { body += `<polygon class="lroof${pick ? ' lroof-pick' : ''}${bad ? ' lroof-bad' : ''}" data-rfid="${esc(r.id)}" points="${ring.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}" style="fill:url(#rfp-${safe});stroke:${col}">${title}</polygon>`; });
        const arrow = (x1, y1, x2, y2) => `<line class="lroof-arrow" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" marker-end="url(#rfa-${safe})"/>`;
        const cx = (px0 + px1) / 2;
        const cy = (py0 + py1) / 2;
        const spanX = px1 - px0;
        const spanY = py1 - py0;
        if (r.shape === 'shed') {
            const dir = LC.ROOF_SHED_DIRS.includes(r.dir) ? r.dir : 's';
            const vertical = dir === 'n' || dir === 's';
            const along = vertical ? spanY : spanX;
            const len = Math.max(14, Math.min(56, along * 0.3));
            const sign = dir === 's' || dir === 'e' ? 1 : -1;
            [0.2, 0.5, 0.8].forEach((f) => {
                if (vertical) { const ax = px0 + spanX * f; body += arrow(ax, cy - sign * len / 2, ax, cy + sign * len / 2); } else { const ay = py0 + spanY * f; body += arrow(cx - sign * len / 2, ay, cx + sign * len / 2, ay); }
            });
        } else if (r.shape === 'gable') {
            const ridge = LC.roofRidge(d, r);
            body += `<line class="lroof-ridge" x1="${X(ridge.x1).toFixed(1)}" y1="${Y(ridge.y1).toFixed(1)}" x2="${X(ridge.x2).toFixed(1)}" y2="${Y(ridge.y2).toFixed(1)}" stroke="${col}"/>`;
            const ns = r.dir === 'ns';
            const half = (ns ? spanX : spanY) / 2;
            const len = Math.max(14, Math.min(50, half * 0.55));
            const off = half * 0.22;
            [0.2, 0.5, 0.8].forEach((f) => {
                if (ns) { const ay = py0 + spanY * f; body += arrow(cx - off, ay, cx - off - len, ay) + arrow(cx + off, ay, cx + off + len, ay); } else { const ax = px0 + spanX * f; body += arrow(ax, cy - off, ax, cy - off - len) + arrow(ax, cy + off, ax, cy + off + len); }
            });
        }
        // la etiqueta: código y forma, y debajo las alturas (si el techo es muy chico solo el código)
        if (spanX >= 40 && spanY >= 18) {
            const l1 = `${r.code || ''} · ${shapeName}`;
            const l2 = spanX >= 84 && spanY >= 36 ? roofHeightsText(r, slope) : '';
            const w = Math.max(l1.length, l2.length) * 5.6 + 16;
            const h = l2 ? 30 : 18;
            const lx = r.shape === 'gable' && r.dir === 'ns' ? px0 + spanX * 0.5 : cx;
            const ly = r.shape === 'gable' && r.dir !== 'ns' ? py0 + Math.max(h / 2 + 4, spanY * 0.2) : (r.shape === 'gable' ? py0 + Math.max(h / 2 + 4, spanY * 0.12) : cy);
            body += `<g class="lroof-lab" pointer-events="none"><rect x="${(lx - w / 2).toFixed(1)}" y="${(ly - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="6" stroke="${col}"/><text x="${lx.toFixed(1)}" y="${(ly + (l2 ? -3 : 3.5)).toFixed(1)}" text-anchor="middle" class="lroof-t1">${esc(l1)}</text>${l2 ? `<text x="${lx.toFixed(1)}" y="${(ly + 10).toFixed(1)}" text-anchor="middle" class="lroof-t2">${esc(l2)}</text>` : ''}</g>`;
        }
        body += `<rect class="hl-box" data-hlbox="roof:${esc(r.id)}" x="${px0.toFixed(1)}" y="${py0.toFixed(1)}" width="${spanX.toFixed(1)}" height="${spanY.toFixed(1)}"/>`;
    });
    return body ? `<defs>${defs}</defs>${body}` : '';
}
// Las alturas de un techo en una línea: «6 m», o «7 → 9.5 m · 25 %» y, en una agua, hacia dónde cae.
function roofHeightsText(r, slope) {
    if (r.shape === 'flat') return `${fmt(Number(r.h) || 0)} m`;
    const fall = r.shape === 'shed' ? ` · ${t('main.layoutRoofCaeLabel', { dir: typeLabel('roofDirShed', r.dir || 's').toLowerCase() })}` : '';
    return `${fmt(Number(r.h) || 0)} → ${fmt(Number(r.h2) || Number(r.h) || 0)} m · ${fmt(slope, 1)} %${fall}`;
}
const safetyIssueText = (v) => t(`main.layoutVioSg_${v.kind}${v.kind === 'tall' && v.vars && v.vars.level !== undefined ? 'Level' : ''}`, { code: v.code, ...(v.vars || {}) });
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
        wall2: () => stepOn('paredes') && some('obstacles', (o) => o.kind === 'wall' && !!LC.wallMark(d, o, 0)),
        door: () => stepOn('puertas') && some('doors'),
        open: (type) => stepOn('puertas') && state.showOpening && some('doors', (x) => LC.doorOpenOf(x) === type),
        level: (type) => !!d && state.showLevels && LC.floorsAll(d).some((f) => (f.isRamp ? stepOn('rampas') : stepOn('pisos')) && LC.zoneHasLevel(f) && ((f.lvl2 !== undefined) === (type === 'ramp'))),
        power: () => stepOn('luz') && some('power'),
        sensor: () => stepOn('sensores') && some('sensors'),
        column: () => stepOn('obstaculos') && some('obstacles', (o) => o.kind === 'column' || o.kind === 'other'),
        step: () => stepOn('obstaculos') && some('obstacles', (o) => o.kind === 'step'),
        footprint: () => (stepOn('espacios') || stepOn('activos') || stepOn('posiciones') || stepOn('niveles') || stepOn('ubicaciones')) && some('footprints', (f) => f.active !== false),
        asset: () => (stepOn('activos') || stepOn('posiciones') || stepOn('niveles') || stepOn('ubicaciones')) && some('spaces', (s) => s.active !== false),
        pieces: (type) => piecesVisible() && state.pieces.some((p) => (type === 'free' ? (p.leftD > 0.5 || p.leftH > 0.5) : (type === '2' ? p.level >= 2 : String(p.level) === type))),
        object: (type) => stepOn('objetos') && some('objects', (o) => o.type === type),
        transit: (type) => stepOn('transito') && some('transit', (p) => (type === 'between' ? p.type === 'between' : p.type !== 'between')),
        ceiling: (type) => stepOn('techos') && some('ceiling', (e) => e.type === type),
        roof: (shape) => stepOn('techos') && some('roofs', (r) => r.shape === shape),
        safety: (type) => { const [tp, model] = String(type).split(':'); return stepOn('seguridad') && some('safety', (e) => e.type === tp && (tp !== 'hydrant' || LC.hydrantModelOf(e) === (model || 'column'))); },
    };
    // Pisos: un cuadrito por cada nivel que hay (con el color de ese nivel); los pisos con formato propio llevan el suyo y no salen aquí.
    const lvBox = document.querySelector('[data-lg-levels]');
    if (lvBox) {
        const flats = d && stepOn('pisos') && state.showLevels ? (d.floors || []).filter((f) => f.active !== false && LC.zoneHasLevel(f) && f.lvl2 === undefined && !f.fmt) : [];
        const lvCols = d ? LC.floorLevelColors(d) : {};
        const levels = [...new Set(flats.map((f) => Math.round((Number(f.lvl) || 0) * 100) / 100))].sort((a, b) => b - a);
        lvBox.innerHTML = levels.map((lv) => { const c = lvCols[lv] || '#e9e9ee'; return `<span><i class="lg-level" style="background:${c};border:1.5px solid ${LC.mixHex(c, '#000000', 0.4)}"></i><span>${lv > 0 ? '+' : ''}${fmt(lv)} m</span></span>`; }).join('');
        lvBox.hidden = !levels.length;
    }
    document.querySelectorAll('[data-cl-glyph]').forEach((el) => {
        if (!el.firstChild && window.LayoutMapSvg) el.innerHTML = `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">${window.LayoutMapSvg.ceilingGlyph(el.getAttribute('data-cl-glyph'), 10, 10, 6)}</svg>`;
    });
    document.querySelectorAll('[data-sf-glyph]').forEach((el) => {
        const [tp, model] = el.getAttribute('data-sf-glyph').split(':');
        if (!el.firstChild && window.LayoutMapSvg) el.innerHTML = `<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">${window.LayoutMapSvg.safetyGlyph(tp, 10, 10, tp === 'camera' || tp === 'speaker' ? 6 : 8, model)}</svg>`;
    });
    document.querySelectorAll('[data-lg]').forEach((el) => {
        const rule = RULES[el.getAttribute('data-lg')];
        el.hidden = !(d && rule && rule(el.getAttribute('data-lg-type')));
    });
}
// Pisos: dos no pueden encimarse (que se toquen en la orilla sí): los dos se marcan en rojo con el aviso; el código, la superficie y las zonas que toca de cada piso salen de lo escrito.
function applyFloorMarks() {
    const d = state.draft;
    if (!d) return;
    const clash = new Map();
    LC.floorOverlaps(d).forEach(({ a, b }) => {
        if (!clash.has(a.id)) clash.set(a.id, []);
        if (!clash.has(b.id)) clash.set(b.id, []);
        clash.get(a.id).push(b);
        clash.get(b.id).push(a);
    });
    // Nada sale del contorno de la nave (LayoutCalc.floorViolations): un piso o una rampa afuera se marca en rojo con el aviso.
    const outside = new Set(LC.floorViolations(d).map((v) => v.id));
    (d.floors || []).forEach((f, i) => {
        const others = clash.get(f.id) || [];
        const out = outside.has(f.id);
        ['x', 'y', 'l', 'w'].forEach((key) => {
            const box = document.querySelector(`[data-l="floors"][data-i="${i}"][data-k="${key}"]`);
            if (box) box.classList.toggle('layout-missing', others.length > 0 || out);
        });
        const note = document.querySelector(`[data-floor-issues="${i}"]`);
        if (note) note.textContent = [...(out ? [t('main.layoutVioPisoFuera')] : []), ...others.map((o) => t('main.layoutVioPisoEncima', { other: `${o.code} ${o.name}` }))].join(' ');
        const code = document.querySelector(`[data-floor-code="${i}"]`);
        if (code) code.textContent = f.code || '';
        const area = document.querySelector(`[data-floor-area="${i}"]`);
        if (area) area.textContent = `${fmt((Number(f.l) || 0) * (Number(f.w) || 0))} m²`;
        const zones = document.querySelector(`[data-floor-zones="${i}"]`);
        if (zones) zones.textContent = LC.zonesOfFloor(d, f).map((z) => z.code || z.name).join(' · ') || '—';
    });
    (d.zones || []).forEach((z, i) => {
        const cell = document.querySelector(`[data-zone-floors="${i}"]`);
        if (cell) cell.textContent = LC.floorsOfZone(d, z).map((f) => f.code).join(' · ') || '—';
    });
}
// Rampas: lo que le falta a cada una (De y A sin elegir, pisos al mismo nivel, no toca uno de sus pisos, se encima con algo) se marca en rojo con el aviso; su código y sus niveles salen de lo escrito y de los pisos que une.
// Obstáculos: la altura del piso y el alto de una columna u otro obstáculo no pueden pasar del techo (LayoutCalc.obstacleViolations): las dos cajas se marcan en rojo y abajo del paso va el aviso.
function applyObstacleMarks() {
    const d = state.draft;
    if (!d) return;
    const all = LC.obstacleViolations(d);
    const bad = new Set(all.map((v) => v.id));
    (d.obstacles || []).forEach((o, i) => {
        if (o.kind === 'wall') return;
        ['elev', 'h'].forEach((key) => {
            const box = document.querySelector(`[data-l="obstacles"][data-i="${i}"][data-k="${key}"]`);
            if (box) box.classList.toggle('layout-missing', bad.has(o.id));
        });
    });
    const note = document.querySelector('[data-ob-issues]');
    if (note) {
        note.hidden = !all.length;
        note.innerHTML = all.map((v) => `<p>${esc(t(`main.layoutVioObs_${v.kind}`, v.vars))}</p>`).join('');
    }
}
function applyRampMarks() {
    const d = state.draft;
    if (!d) return;
    const issues = new Map();
    LC.rampIssues(d).forEach((v) => { if (!issues.has(v.id)) issues.set(v.id, []); issues.get(v.id).push(v); });
    const clash = new Map();
    LC.floorOverlaps(d).forEach(({ a, b }) => {
        if (!clash.has(a.id)) clash.set(a.id, []);
        if (!clash.has(b.id)) clash.set(b.id, []);
        clash.get(a.id).push(b);
        clash.get(b.id).push(a);
    });
    const signedLv = (v) => `${v > 0 ? '+' : ''}${(Math.round(v * 100) / 100).toFixed(2)}`;
    const outsideR = new Set(LC.floorViolations(d).filter((v) => v.list === 'ramps').map((v) => v.id));
    (d.ramps || []).forEach((r, i) => {
        const mine = issues.get(r.id) || [];
        const others = clash.get(r.id) || [];
        const out = outsideR.has(r.id);
        const place = mine.some((v) => v.key === 'touch') || others.length > 0 || out;
        ['x', 'y', 'l', 'w'].forEach((key) => {
            const box = document.querySelector(`[data-l="ramps"][data-i="${i}"][data-k="${key}"]`);
            if (box) box.classList.toggle('layout-missing', place);
        });
        ['from', 'to'].forEach((key) => {
            const box = document.querySelector(`[data-l="ramps"][data-i="${i}"][data-k="${key}"]`);
            if (box) box.classList.toggle('layout-missing', mine.some((v) => ['choose', 'same_ref', 'missing', 'same_level'].includes(v.key)));
        });
        const note = document.querySelector(`[data-ramp-issues="${i}"]`);
        if (note) note.textContent = [...(out ? [t('main.layoutVioRampaFuera')] : []), ...mine.map((v) => t(`main.layoutVioRampa_${v.key}`, v.vars)), ...others.map((o) => t('main.layoutVioRampaEncima', { other: `${o.code} ${o.name}` }))].join(' ');
        const info = LC.rampInfo(d, r);
        const set = (attr, value) => { const el = document.querySelector(`[${attr}="${i}"]`); if (el) el.textContent = value; };
        set('data-ramp-code', r.code || '');
        set('data-ramp-lo', info.ok ? signedLv(info.lo) : '—');
        set('data-ramp-hi', info.ok ? signedLv(info.hi) : '—');
        set('data-ramp-rise', info.ok ? typeLabel('rise', info.rise) : '—');
    });
}
function applySafetyMarks() {
    applyLegend();
    applyFloorMarks();
    applyRampMarks();
    applyObstacleMarks();
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
        // «Cuelga a» por encima del techo de ese punto pone en rojo su celda; la de fábrica (pegada al techo) se ve en gris y sigue al techo
        const hangBox = document.querySelector(`[data-l="safety"][data-i="${i}"][data-k="hang"]`);
        if (hangBox) { hangBox.classList.toggle('layout-missing', !!bad.hang); hangBox.placeholder = String(LC.safetyHangOf(state.draft, e)); }
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
        // El espacio de apertura que choca es un aviso aparte: se ve y se marca, pero no impide guardar.
        if (list === 'doors' && state.showOpening !== false) wiAll[list] = wiAll[list].concat(LC.doorOpeningClashes(state.draft));
        wiAll[list].forEach((v) => {
            const ids = v.kind === 'clashDoor' && v.vars && v.vars.otherId ? [v.id, v.vars.otherId] : [v.id];
            ids.forEach((id) => { const key = `${list}:${id}`; const m = wiIssues.get(key) || {}; m[v.kind] = v; wiIssues.set(key, m); });
        });
    });
}
const wallItemIssueText = (list, v) => t(`main.layoutVio${WALL_ITEM_VIO[list]}_${v.kind}${v.kind === 'tall' && v.vars && v.vars.base !== undefined ? 'Base' : ''}`, v.kind === 'clash' || v.kind === 'clashDoor' ? clashVars(v) : (v.vars || {}));
// El aviso de choque lleva el nombre de lo que estorba: hasta tres y «y N más».
function clashVars(v) {
    const vars = v.vars || {};
    const names = Array.isArray(vars.others) ? vars.others : [vars.other];
    const more = names.length > 3 ? ` ${t('main.layoutVioDrMas', { n: names.length - 3 })}` : '';
    return { ...vars, what: t(`main.layoutVioDrWhat_${vars.what}`), other: names.slice(0, 3).join(', ') + more };
}
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
            if (list === 'doors') mark('open', bad.clash || bad.clashDoor);
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
// Paso Niveles, «Aplicar a todos»: el alto y la ceja del nivel elegido pasan a todos los demás niveles de ese activo (LayoutCalc.levelsWithSame); la altura desde el piso de cada nivel no se toca. Se ve en el borrador y se aplica al guardar.
function applyLevelToAll(key) {
    if (!state.draft || !canEdit('niveles')) return;
    const [i, n] = String(key).split('|').map(Number);
    const space = state.draft.spaces[i];
    if (!space || (space.levels || 1) < 2) return;
    const lvls = LC.levelsWithSame(space, n);
    if (lvls.length) space.lvls = lvls; else delete space.lvls;
    renderPanel();
    refreshLive();
    Dashboard.showToast(t('main.layoutNivAplicado', { n, code: space.code || '', count: (space.levels || 1) - 1 }), 'success');
}
// Paso Posiciones: el aviso de los huecos cuyo largo o ancho pasa del largo o el fondo de su activo (los primeros 6) y su actualización al teclear.
function bayIssuesHtml() {
    const list = LC.spaceViolations(state.draft).filter((v) => v.kind === 'bayl' || v.kind === 'bayw' || v.kind === 'bayh' || v.kind === 'baysum' || v.kind === 'bayout' || v.kind === 'bayoverlap' || v.kind === 'facesBay');
    return list.slice(0, 6).map((v) => `<p>${esc(vioActText(v))}</p>`).join('') + (list.length > 6 ? '<p>…</p>' : '');
}
// Pone al día los X y Y que muestra la tabla para los espacios de un nivel (sin tocar el campo que se está escribiendo) y marca en rojo los que se salen del activo.
function syncBayXY(space, n, skip) {
    const i = state.draft.spaces.indexOf(space);
    const placed = LC.levelHasPlaced(space, n);
    const clashes = LC.levelBayClashes(space, n);
    LC.levelBayRects(space, n).forEach((r) => {
        const out = placed && (r.x < -0.005 || r.y < -0.005 || r.x + r.l > space.l + 0.005 || r.y + r.w > space.d + 0.005 || clashes.has(r.c));
        ['x', 'y'].forEach((k) => {
            const input = document.querySelector(`[data-l="bay"][data-i="${i}"][data-n="${n}"][data-c="${r.c}"][data-k="${k}"]`);
            if (!input) return;
            if (input !== skip && document.activeElement !== input) input.value = String(Math.round(r[k] * 100) / 100);
            input.classList.toggle('layout-missing', out);
        });
    });
}
function applyBayMarks() {
    const box = document.querySelector('[data-bay-issues]');
    if (!box) return;
    const html = bayIssuesHtml();
    box.hidden = !html;
    box.innerHTML = html;
}
// Paso Niveles: el aviso (uno por activo) de los niveles que suben más que su activo, y las marcas en rojo de sus renglones (se actualizan al teclear).
function levelIssuesHtml() {
    const faces = LC.spaceViolations(state.draft).filter((v) => v.kind === 'facesLevel').map((v) => `<p>${esc(vioActText(v))}</p>`).join('');
    return (state.draft.spaces || []).map((s) => (spIssues.get(s.id) || {}).levels).filter(Boolean).map((v) => `<p>${esc(t('main.layoutVioAct_levels', v.vars))}</p>`).join('') + faces;
}
function applyLevelMarks() {
    const box = document.querySelector('[data-lvl-issues]');
    if (!box) return;
    (state.draft.spaces || []).forEach((s, i) => {
        for (let n = 1; n <= (s.levels || 1); n += 1) {
            const m = LC.levelMeasures(s, n);
            const over = s.h > 0 && m.floorH + m.beam + m.h > s.h + 0.005;
            ['floorH', 'h'].forEach((k) => { const input = document.querySelector(`[data-l="lvl"][data-i="${i}"][data-n="${n}"][data-k="${k}"]`); if (input) input.classList.toggle('layout-missing', over); });
            const autoCell = document.querySelector(`[data-lvl-floor="${i}|${n}"]`);
            if (autoCell) { autoCell.textContent = String(Math.round(m.floorH * 100) / 100); autoCell.parentElement.classList.toggle('layout-bad', over); }
            const useCell = document.querySelector(`[data-lvl-use="${i}|${n}"]`);
            if (useCell) useCell.textContent = String(Math.round(m.useful * 100) / 100);
            const totalCell = document.querySelector(`[data-lvl-total="${i}|${n}"]`);
            if (totalCell) totalCell.textContent = String(Math.round((m.beam + m.h) * 100) / 100);
        }
    });
    const html = levelIssuesHtml();
    box.hidden = !html;
    box.innerHTML = html;
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
// Cómo se escriben la zona, la huella, el activo, la unidad y la capacidad de un localizador en las tablas de los pasos Localizadores y Relación Código.
const locZoneText = (r) => (r.zoneCode ? (r.zoneName ? `${r.zoneName} (${r.zoneCode})` : r.zoneCode) : '—');
const locFootprintText = (r) => (r.footprintCode ? (r.footprintName ? `${r.footprintCode} · ${r.footprintName}` : r.footprintCode) : '—');
const locAssetText = (r) => (r.spaceCode ? `${r.spaceCode} · ${typeLabel('space', r.spaceType || 'rack')}` : '—');
const locNum = (n) => (n ? String(n) : '—');
const locUnitHtml = (info) => (info.packLevel == null ? '—' : `<b>${esc(info.packLevel === 0 ? (info.mainUom || t('main.pkLevel0')) : info.packName)}</b> <span class="rel-tag rel-tag-ok">${esc(t(`main.pkLevel${info.packLevel}`))}</span>`);
const locCapacityHtml = (info) => (info.packCapacity != null ? `<b>${esc(info.packCapacity)}</b> ${esc(info.mainUom)}` : '—');
// Los pasos Localizadores y Relación Código siguen lo que enfoca la franja de arriba (Zona, Elegir y Localizador): solo salen los localizadores de lo enfocado, igual que en las demás tablas. La lista se recorta a lo
// enfocado ANTES de poner el tope de renglones, para que lo elegido salga aunque esté lejos en la lista; por eso la tabla se vuelve a armar cuando cambia el enfoque (infoRenderedKey, ver applyFindToTables).
let infoRenderedKey = '';
function infoFindKey() {
    const marked = state.hl && state.hl.loc ? highlightedList().map((e) => `${e.id}:${e.n || ''}:${e.c || ''}:${e.p || ''}`).join(',') : '';
    const f = state.find;
    return JSON.stringify([f ? [f.kind, f.id, (f.items || []).map((i) => `${i.type}:${i.id}`), f.ids || null] : null, !!state.findDim, marked]);
}
// ¿Un localizador (renglón de zona, huella, activo o posición) entra en lo enfocado? Las zonas y las huellas, con huellas o activos elegidos, solo salen si son de lo elegido (o si lo elegido está dentro de ellas); lo demás
// lo decide inFind, como en las otras tablas (con Tenue no se filtra nada).
function locatorInFind(r, inside) {
    const f = state.find;
    const d = state.draft;
    if (!f || !d) return true;
    const ent = r.scope === 'position' ? { kind: 'bay', id: r.spaceId, n: r.level, c: r.slot, p: r.position }
        : r.scope === 'asset' ? { kind: 'space', id: r.spaceId }
        : r.scope === 'footprint' ? { kind: 'footprint', id: r.footprintId }
        : { kind: 'zone', id: r.zoneId };
    if (!ent.id) return true; // sin zona, sin huella o sin activo (recién agregado): siempre se ve
    if (f.kind === 'items' && !state.findDim && (r.scope === 'zone' || r.scope === 'footprint')) {
        const fps = state.pick.filter((p) => p.type === 'footprint').map((p) => p.id);
        const sps = state.pick.filter((p) => p.type === 'space').map((p) => p.id);
        if (fps.length || sps.length) {
            const fpIds = new Set([...fps, ...sps.map((id) => ((d.spaces || []).find((s) => s.id === id) || {}).footprintId).filter(Boolean)]);
            if (r.scope === 'footprint') return fpIds.has(ent.id);
            return [...fpIds].some((id) => ((d.footprints || []).find((x) => x.id === id) || {}).zoneId === ent.id);
        }
    }
    return inFind(ent, inside);
}
const findInside = () => (state.find && state.draft && state.find.kind === 'zone' ? scopeInside(state.draft, zoneFocusIds(state.find)) : null);
function locatorsStepHtml() {
    infoRenderedKey = infoFindKey();
    const everything = LC.locatorRows(state.draft).rows;
    const inside = findInside();
    const focused = state.find ? everything.filter((r) => locatorInFind(r, inside)) : everything;
    const truncated = focused.length > LOCATOR_PANEL_MAX;
    const rows = focused.slice(0, LOCATOR_PANEL_MAX);
    if (!rows.length) return `<p class="layout-muted">${esc(t(state.find && everything.length ? 'main.layoutLocalizadoresSinEnfoque' : 'main.layoutLocalizadoresVacio'))}</p>`;
    const zoneText = locZoneText;
    const footprintText = locFootprintText;
    const assetText = locAssetText;
    const num = locNum;
    // Con la hoja Códigos en Localizadores: el código que tiene cada localizador completo, la unidad que se almacena y su capacidad máxima, y los botones para relacionarlo o cambiarlo sin salir del croquis.
    const showCodes = !!(state.perms && state.perms.canSeeLocatorCodes);
    const canRelate = !!(state.perms && state.perms.canRelateCode);
    const dirty = isDirty();
    const codeCells = (r) => {
        if (!showCodes) return '';
        if (r.scope !== 'position' || !r.complete) return `<td class="layout-calc">—</td><td class="layout-calc">—</td><td class="layout-calc">—</td><td class="layout-calc"><span class="layout-muted">${esc(t('main.locCompleta'))}</span></td>`;
        const key = `${r.spaceId}|${r.level}|${r.slot}|${r.position}`;
        const info = locCodeAt(r);
        const data = `data-loc-rel="${esc(key)}" data-loc-text="${esc(r.locator)}"`;
        if (!info) {
            const btn = canRelate ? `<button type="button" class="layout-loc-btn" ${data} data-help-key="layoutRelacionarCodigo"${dirty ? ` disabled title="${esc(t('main.locGuardaPrimero'))}"` : ''}>${esc(t('main.locRelacionar'))}</button>` : '';
            return `<td class="layout-calc">—</td><td class="layout-calc">—</td><td class="layout-calc">—</td><td class="layout-calc">${btn}</td>`;
        }
        const unit = locUnitHtml(info);
        const cap = locCapacityHtml(info);
        const change = canRelate ? `<button type="button" class="layout-loc-btn s" ${data} data-help-key="layoutRelacionarCodigo"${dirty ? ` disabled title="${esc(t('main.locGuardaPrimero'))}"` : ''}>${esc(t('main.locCambiar'))}</button>` : '';
        const go = hasRelationScreen() ? `<a class="layout-loc-go" href="${esc(relationUrl(r.locator))}" data-help-key="layoutRelacionLink" aria-label="${esc(t('main.locIrRelacion'))}" title="${esc(t('main.locIrRelacion'))}"><i class="bx bx-link-external" aria-hidden="true"></i></a>` : '';
        return `<td class="layout-calc">${esc(info.sku)} · ${esc(info.description)}</td><td class="layout-calc">${unit}</td><td class="layout-calc">${cap}</td><td class="layout-calc"><span class="layout-loc-lock" title="${esc(t('main.locCodigoNoElimina'))}"><i class="bx bx-lock-alt" aria-hidden="true"></i></span>${change}${go}</td>`;
    };
    const marked = locAny() ? locCode().replace(/\s\+\d+$/, '') : '';
    const body = rows.map((r) => `<tr data-locator="${esc(r.locator || '')}"${r.locator && r.locator === marked ? ' class="layout-row-sel"' : ''}><td class="layout-calc">${esc(zoneText(r))}</td><td class="layout-calc">${esc(footprintText(r))}</td><td class="layout-calc">${esc(assetText(r))}</td><td class="layout-calc">${num(r.level)}</td><td class="layout-calc">${num(r.slot)}</td><td class="layout-calc">${num(r.position)}</td><td class="layout-calc"><b>${esc(r.locator || '—')}</b></td><td class="layout-calc">${esc(t(`main.locAlcance_${r.scope}`))}</td><td class="layout-calc"><span class="rel-tag ${r.complete ? 'rel-tag-ok' : 'rel-tag-partial'}">${esc(t(r.complete ? 'main.locEstadoCompleto' : 'main.locEstadoAMedias'))}</span></td>${codeCells(r)}</tr>`);
    const note = truncated ? `<p class="layout-muted">${esc(t('main.layoutLocalizadoresCorte', { n: LOCATOR_PANEL_MAX }))}</p>` : '';
    const heads = ['main.colLocZona', 'main.colLocHuella', 'main.colLocActivo', 'main.colLocNivel', 'main.colLocColumna', 'main.colLocProfundidad', 'main.colLocLocalizador', 'main.colLocAlcance', 'main.colLocEstado'];
    if (showCodes) heads.push('main.colLocCodigo', 'main.colLocUnidad', 'main.colLocCapacidad', 'main.colLocAcciones');
    return `${table(heads, body, 'layout-localizadores')}${note}`;
}
// Paso «Relación Código» (solo consulta): los códigos que ya están relacionados con un localizador de este Layout (lo mismo que se ve en Relación Código, pero aquí, viendo el croquis), con la unidad que se almacena y su capacidad
// máxima. Está ordenado por código. Para relacionar o cambiar uno se usa el botón del paso Localizadores; la flechita de al lado del nombre abre la pantalla Relación Código completa (y la flecha de cada renglón, solo ese localizador).
function relationStepHtml() {
    if (!state.draft) return '';
    infoRenderedKey = infoFindKey();
    const { rows } = LC.locatorRows(state.draft);
    const inside = findInside();
    const withCode = rows.filter((r) => r.scope === 'position' && r.complete && locCodeAt(r));
    const related = withCode.filter((r) => locatorInFind(r, inside)).map((r) => ({ r, info: locCodeAt(r) }));
    if (!related.length) return `<p class="layout-muted">${esc(t(state.find && withCode.length ? 'main.layoutRelacionSinEnfoque' : 'main.layoutRelacionVacio'))}</p>`;
    related.sort((a, b) => String(a.info.sku).localeCompare(String(b.info.sku), undefined, { numeric: true }));
    const go = hasRelationScreen();
    const body = related.map(({ r, info }) => `<tr data-locator="${esc(r.locator || '')}"><td class="layout-calc">${esc(info.sku)} · ${esc(info.description)}</td><td class="layout-calc">${locUnitHtml(info)}</td><td class="layout-calc">${locCapacityHtml(info)}</td><td class="layout-calc"><b>${esc(r.locator || '—')}</b></td><td class="layout-calc">${esc(locZoneText(r))}</td><td class="layout-calc">${esc(locFootprintText(r))}</td><td class="layout-calc">${esc(locAssetText(r))}</td><td class="layout-calc">${locNum(r.level)}</td><td class="layout-calc">${locNum(r.slot)}</td><td class="layout-calc">${locNum(r.position)}</td><td class="layout-calc">${go ? `<a class="layout-loc-go" href="${esc(relationUrl(r.locator))}" data-help-key="layoutRelacionLink" aria-label="${esc(t('main.locIrRelacion'))}" title="${esc(t('main.locIrRelacion'))}"><i class="bx bx-link-external" aria-hidden="true"></i></a>` : ''}</td></tr>`);
    const heads = ['main.colLocCodigo', 'main.colLocUnidad', 'main.colLocCapacidad', 'main.colLocLocalizador', 'main.colLocZona', 'main.colLocHuella', 'main.colLocActivo', 'main.colLocNivel', 'main.colLocColumna', 'main.colLocProfundidad', go ? 'main.colLocAcciones' : ''];
    return table(heads, body, 'layout-relacion');
}
// Un renglón de la tabla de obstáculos del contorno. Las cuatro celdas del lugar cambian con la forma de ponerlo: «Sobre el contorno» = lado, distancia, largo (vacío = todo el lado) y grosor; «Dentro de la nave» = X, Y, largo y ancho.
// La altura solo la lleva el desnivel (su altura sobre el piso; negativa si es más bajo).
// wallsOnly = el renglón es de una pared (paso Paredes): sin la columna Tipo (siempre es pared) ni la de altura del desnivel.
// A qué da cada lado de una pared (la zona y su piso; «afuera» si ese lado cae fuera de la nave).
function wallSideText(o, side) {
    const info = LC.wallSideInfo(state.draft, o);
    if (!info) return '—';
    const x = info[side];
    const name = x.zoneName || (x.outside ? t('main.layoutParedAfuera') : '—');
    return x.level ? `${name} · ${t('main.layoutParedPiso', { n: `${x.level > 0 ? '+' : ''}${fmt(x.level)}` })}` : name;
}
function obstacleRowHtml(o, i, dis, wallsOnly = false) {
    const off = dis ? ' disabled' : '';
    const sel = (key, markup, help) => `<td><select data-l="obstacles" data-i="${i}" data-k="${key}" data-help-key="${help}"${off}>${markup}</select></td>`;
    const num = (key, value, help, extra = '') => `<td><input type="number" step="0.1" ${extra} data-l="obstacles" data-i="${i}" data-k="${key}" data-help-key="${help}" value="${value}"${off}></td>`;
    const place = o.mode === 'contour'
        ? `${sel('wall', wallOptionsHtml(o.wall), 'layoutObstLado')}${num('dist', o.dist || 0, 'layoutObstDist', 'min="0"')}${num('l', o.l > 0 ? o.l : '', 'layoutObstLargo', `min="0" placeholder="${esc(t('main.layoutTodoElLado'))}"`)}${num('w', o.w || 0, 'layoutObstGrosor', 'min="0"')}`
        : `${num('x', o.x, 'layoutObstXY')}${num('y', o.y, 'layoutObstXY')}${num('l', o.l, 'layoutObstLargo', 'min="0"')}${num('w', o.w, 'layoutObstAncho', 'min="0"')}`;
    const height = o.kind === 'step' ? num('dz', o.dz === undefined ? 0 : o.dz, 'layoutObstAltura') : '<td class="layout-calc">—</td>';
    // Una columna u otro obstáculo: qué tan despegado está del piso y qué tan alto es (vacíos = del piso al techo); en gris, el techo que tiene arriba. El desnivel no los lleva.
    const body = o.kind === 'column' || o.kind === 'other';
    const ceilAt = (() => { const gg = LC.obstacleGeometry(o, state.draft.vertices); return gg ? LC.naveHeightAt(state.draft, gg.x + gg.l / 2, gg.y + gg.w / 2) : 0; })();
    const bodyCells = body
        ? `${num('elev', o.elev > 0 ? o.elev : '', 'layoutObstElev', 'min="0" placeholder="0"')}${num('h', o.h > 0 ? o.h : '', 'layoutObstAlto', `min="0" placeholder="${ceilAt > 0 ? esc(fmt(ceilAt)) : ''}"`)}`
        : '<td class="layout-calc">—</td><td class="layout-calc">—</td>';
    if (wallsOnly) {
        // La altura propia de la pared: vacía = la de siempre (la del lado del contorno o el promedio de la nave), que se ve en gris.
        // POR ESQUINA: la altura al inicio de la pared y la del final (una pared puede ir más alta de un lado que del otro).
        // Pared compartida: cada lado trae su altura (A al inicio y al final, B al inicio y al final), medida desde el piso de ese lado; lo que se ve en gris es lo que vale si se deja vacío. A qué zona da cada lado sale solo.
        const sidesDef = LC.wallSides(state.draft, { ...o, h: undefined, h2: undefined, hb: undefined, hb2: undefined });
        const sidesA = LC.wallSides(state.draft, { ...o, hb: undefined, hb2: undefined });
        const endA = sidesDef ? (o.h > 0 ? o.h : sidesDef.a.h1) : '';
        const endB = sidesA ? (o.hb > 0 ? o.hb : sidesA.b.h1) : '';
        const ph = (v) => (v === '' || v === undefined || !Number.isFinite(v) ? '' : fmt(v));
        const wallHeight = num('h', o.h > 0 ? o.h : '', 'layoutObstAlturaPared', `min="0" placeholder="${sidesDef ? ph(sidesDef.a.h0) : ''}"`)
            + num('h2', o.h2 > 0 ? o.h2 : '', 'layoutObstAlturaParedFin', `min="0" placeholder="${ph(endA)}"`)
            + num('hb', o.hb > 0 ? o.hb : '', 'layoutObstAlturaParedB', `min="0" placeholder="${sidesA ? ph(sidesA.b.h0) : ''}"`)
            + num('hb2', o.hb2 > 0 ? o.hb2 : '', 'layoutObstAlturaParedBFin', `min="0" placeholder="${ph(endB)}"`);
        const sideCells = `<td class="layout-calc" data-wall-sa="${i}" data-help-key="layoutParedLados">${esc(wallSideText(o, 'a'))}</td><td class="layout-calc" data-wall-sb="${i}" data-help-key="layoutParedLados">${esc(wallSideText(o, 'b'))}</td>`;
        return `<tr><td class="layout-calc"><b data-wall-code="${i}">${esc(o.code || '')}</b></td>${cellText('obstacles', i, 'name', o.name, dis)}${sel('mode', optionsHtml('obmode', LC.OBSTACLE_MODES, o.mode), 'layoutObstUbicacion')}${place}${wallHeight}${sideCells}${removeCell('obstacles', i, dis, wallFmtButton(o, i, dis))}</tr>`;
    }
    // en Contorno el Tipo ya no ofrece Pared (las paredes se agregan en su propio paso)
    return `<tr><td class="layout-calc"><b data-ob-code="${i}">${esc(o.code || '')}</b></td>${cellText('obstacles', i, 'name', o.name, dis)}${sel('kind', optionsHtml('obstacle', LC.OBSTACLE_KINDS.filter((k) => k !== 'wall'), o.kind), 'layoutObstTipo')}${sel('mode', optionsHtml('obmode', LC.OBSTACLE_MODES, o.mode), 'layoutObstUbicacion')}${place}${height}${bodyCells}${removeCell('obstacles', i, dis)}</tr>`;
}
// Cambiar el tipo o la forma de ponerlo de un obstáculo: el desnivel trae su altura; al pasar de una forma a otra se conserva dónde queda.
function setObstacleKindOrMode(row, key, value) {
    if (key === 'kind') {
        const prevKind = row.kind;
        row.kind = LC.OBSTACLE_KINDS.includes(value) ? value : 'column';
        // el nombre que traía de fábrica (el del tipo anterior) sigue al tipo nuevo; un nombre que escribió la persona no se toca
        if (!row.name || row.name === typeLabel('obstacle', prevKind)) row.name = typeLabel('obstacle', row.kind);
        if (row.kind === 'step') { if (row.dz === undefined) row.dz = 0.15; delete row.elev; delete row.h; } else delete row.dz;
        if (row.kind === 'wall') delete row.elev;
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
// Objetos: un objeto nuevo nace como persona (el primer renglón activo de ese tipo del catálogo «Lo que transita»; si no hay, el primer renglón activo que haya) con su dibujo y sus medidas, en el centro de la nave
// (corrido un poco para que no se encimen); se acomoda con X, Y y Giro. En «Equipo o persona» se elige qué es (montacargas, carrito, plataforma…) y toma el dibujo y las medidas de ese renglón del catálogo.
function addObject() {
    const d = state.draft;
    const active = LC.transitCatalogOf(d).filter((c) => c.status === 'active');
    const item = active.find((c) => c.kind === 'person') || active[0];
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
// El color del chaleco y del casco del operario (solo la persona lleva): un botón con el color puesto que abre el selector de colores; los demás objetos llevan una raya.
function personColorCell(o, i, key, dis) {
    if (o.type !== 'person') return '<td class="layout-calc">—</td>';
    const hex = LC.personColorsOf(o)[key];
    const label = t(key === 'vest' ? 'main.layoutChaleco' : 'main.layoutCasco');
    const can = state.perms && state.perms.canFormatFloors && !dis;
    return `<td><button type="button" class="btn btn-secondary layout-toggle layout-fmt${o[key] ? ' on' : ''}" data-objcolor="${i}:${key}" data-help-key="${key === 'vest' ? 'layoutObjetoChaleco' : 'layoutObjetoCasco'}" aria-label="${esc(label)}"${can ? '' : ' disabled'}><span class="layout-fmt-dot" style="background:${esc(hex)};border-color:${esc(LC.mixHex(hex, '#000000', 0.4))}"></span><span>${esc(hex.toUpperCase())}</span></button></td>`;
}
// El color del cuerpo del montacargas y de los demás equipos (carrito, plataforma, otro): un botón igual al de la persona; en la persona va una raya (ella lleva chaleco y casco).
function equipColorCell(o, i, dis) {
    if (o.type === 'person') return '<td class="layout-calc">—</td>';
    const hex = LC.equipColorOf(o);
    const can = state.perms && state.perms.canFormatFloors && !dis;
    return `<td><button type="button" class="btn btn-secondary layout-toggle layout-fmt${o.color ? ' on' : ''}" data-objcolor="${i}:color" data-help-key="layoutObjetoColorEquipo" aria-label="${esc(t('main.layoutColorEquipo'))}"${can ? '' : ' disabled'}><span class="layout-fmt-dot" style="background:${esc(hex)};border-color:${esc(LC.mixHex(hex, '#000000', 0.4))}"></span><span>${esc(hex.toUpperCase())}</span></button></td>`;
}
function pickObjectColor(spec) {
    const [idx, key] = String(spec).split(':');
    const row = (state.draft.objects || [])[Number(idx)];
    const isPerson = !!row && row.type === 'person';
    if (!row || !(isPerson ? (key === 'vest' || key === 'helmet') : key === 'color') || !window.ColorDialog) return;
    const factory = isPerson ? LC.PERSON_COLORS[key] : (LC.EQUIP_COLORS[row.type] || LC.EQUIP_COLORS.box);
    window.ColorDialog.open({
        title: t(key === 'vest' ? 'main.layoutChaleco' : (key === 'helmet' ? 'main.layoutCasco' : 'main.layoutColorEquipo')),
        currentHex: isPerson ? LC.personColorsOf(row)[key] : LC.equipColorOf(row),
        onAccept: (hex) => {
            const h = String(hex).toLowerCase();
            if (/^#[0-9a-f]{6}$/.test(h) && h !== factory) row[key] = h; else delete row[key];
            renderPanel();
            refreshLive();
        },
    });
}
// Cambiar el equipo o persona de un objeto: toma el dibujo y las medidas del nuevo renglón; el nombre de fábrica (el del renglón anterior) también lo sigue.
function setObjectEquip(row, id) {
    const catalog = LC.transitCatalogOf(state.draft);
    const prev = catalog.find((c) => Number(c.id) === Number(row.equipId));
    const next = catalog.find((c) => Number(c.id) === Number(id));
    if (!next) return;
    row.equipId = next.id;
    const prevType = row.type;
    Object.assign(row, { type: LC.objectShapeOfKind(next.kind), l: next.l, w: next.w, h: next.h });
    if (row.type !== prevType) delete row.color; // el color de fábrica cambia con la figura (montacargas amarillo, los demás gris)
    if (row.type !== 'person') { delete row.vest; delete row.helmet; } // el color del chaleco y del casco es solo de la persona
    if (prev && (row.name === prev.name || row.name.indexOf(`${prev.name} `) === 0)) row.name = `${next.name}${row.name.slice(prev.name.length)}`;
}
// Seguridad: cambiar el tipo de un elemento. La ruta de evacuación lleva un punto de llegada (de fábrica, a 5 m a la derecha de donde sale); los demás tipos no. El código lo vuelve a poner el sistema (letra del tipo nuevo).
// Una celda de la altura al piso o del tamaño de un elemento de Seguridad: vacía muestra la medida de fábrica de su tipo (en gris) y es la que vale.
function safetySizeCell(e, i, key, dis) {
    const def = LC.safetySizeOf(e);
    const value = e[key] !== undefined && e[key] !== null ? e[key] : '';
    return `<td><input type="number" step="0.05" min="${key === 'elev' ? 0 : 0.01}" data-l="safety" data-i="${i}" data-k="${key}" value="${value}" placeholder="${def[key]}"${dis ? ' disabled' : ''}></td>`;
}
// Seguridad: el modelo del hidrante (columna, poste doble, toma siamesa o gabinete). Sin elegir (o columna) no se guarda nada; la altura al piso y el tamaño vuelven a ser los de fábrica del modelo nuevo.
function setHydrantModel(row, value) {
    if (LC.HYDRANT_MODELS.includes(value) && value !== 'column') row.model = value; else delete row.model;
    ['elev', 'l', 'w', 'h'].forEach((k) => { delete row[k]; });
}
function setSafetyType(row, value) {
    row.type = LC.SAFETY_TYPES.includes(value) ? value : 'extinguisher';
    if (row.type !== 'hydrant') delete row.model;
    // la altura al piso y el tamaño son del tipo: al cambiarlo vuelven a ser los de fábrica del tipo nuevo (y lo de la cámara y la bocina —cuelga a, hacia dónde mira, ángulo y alcance— también es del tipo)
    ['elev', 'l', 'w', 'h', 'hang', 'aim', 'fov', 'range'].forEach((k) => { delete row[k]; });
    if (row.type === 'route') {
        if (row.x2 === undefined) row.x2 = round2((Number(row.x) || 0) + 5);
        if (row.y2 === undefined) row.y2 = round2(Number(row.y) || 0);
    } else { delete row.x2; delete row.y2; }
}
// El volumen de una zona: su superficie por su alto (el suyo o, vacío, el promedio de lo que queda bajo el techo de la nave en su lugar).
function zoneVolText(z) {
    const clear = state.draft ? LC.zoneClearHeights(state.draft, z) : null;
    const h = z.h > 0 ? z.h : (clear ? clear.avg : 0);
    return h > 0 ? `${fmt(LC.zoneArea(z) * h)} m³` : '';
}
function stepHtml(step) {
    if (step === 'localizadores') return locatorsStepHtml();
    if (step === 'relacion') return relationStepHtml();
    const d = state.draft;
    const dis = !canEdit(step);
    if (step === 'contorno') {
        const shape = sidesBlockHtml('contorno', dis);
        // El botón de agregar un lado va arriba, junto al título del paso (el Contorno se captura solo por lados). Las paredes y los obstáculos tienen sus propios pasos.
        return shape;
    }
    if (step === 'obstaculos') {
        // Cada renglón es un OBSTÁCULO que no es pared: una columna, un desnivel (un tramo del piso más alto o más bajo) u otra cosa que estorbe. Va sobre un lado del contorno o dentro de la nave. Las paredes tienen su propio paso.
        // Es la misma lista de obstáculos de antes (cada renglón conserva su lugar en ella).
        const rows = d.obstacles.map((o, i) => (o.kind === 'wall' ? '' : obstacleRowHtml(o, i, dis))).filter(Boolean);
        const list = rows.length ? table(['main.layoutCodigo', 'main.layoutNombre', 'main.layoutTipo', 'main.layoutUbicacion', 'main.layoutLadoOX', 'main.layoutDistOY', 'main.layoutLargo', 'main.layoutGrosorAncho', 'main.layoutAlturaDesnivel', 'main.layoutAlturaPiso', 'main.layoutAlto', ''], rows, 'layout-obstaculos') : `<p class="layout-muted">${esc(t('main.layoutObstaculosVacio'))}</p>`;
        return `${addButton('obstacles', 'main.layoutAgregarObstaculo', dis, true)}${list}<div class="layout-vio" data-ob-issues hidden></div>`;
    }
    if (step === 'paredes') {
        // Cada renglón es una PARED (un obstáculo de tipo pared): sobre un lado del contorno (todo el lado o un tramo, con su grosor) o dentro de la nave. Es la misma lista de obstáculos de antes, pero las paredes se crean aquí y no en Contorno.
        const addWallBtn = `<button type="button" class="btn btn-secondary layout-add" data-add-wall="1" data-main-add="1" data-help-key="layoutParedAgregar"${dis ? ' disabled' : ''}>${esc(t('main.layoutAgregarPared'))}</button>`;
        const wallsAllBtn = `<button type="button" class="btn btn-secondary layout-add" data-walls-all="1" data-main-add="1" data-help-key="layoutParedTodo"${dis ? ' disabled' : ''}>${esc(t('main.layoutParedTodoContorno'))}</button>`;
        const walls = d.obstacles.map((o, i) => (o.kind === 'wall' ? obstacleRowHtml(o, i, dis, true) : '')).filter(Boolean);
        const list = walls.length ? table(['main.layoutCodigo', 'main.layoutNombre', 'main.layoutUbicacion', 'main.layoutLadoOX', 'main.layoutDistOY', 'main.layoutLargo', 'main.layoutGrosorAncho', 'main.layoutAlturaPared', 'main.layoutAlturaParedFin', 'main.layoutAlturaParedB', 'main.layoutAlturaParedBFin', 'main.layoutParedLadoA', 'main.layoutParedLadoB', ''], walls, 'layout-paredes') : `<p class="layout-muted">${esc(t('main.layoutParedesVacio'))}</p>`;
        return `${addWallBtn}${wallsAllBtn}${list}`;
    }
    if (step === 'puertas') {
        // Una puerta SIEMPRE va sobre una pared: se elige cuál (de las del paso Paredes) y se mide desde el inicio de esa pared; la pared dice cuánto mide y qué tan alta es, y la puerta no se puede pasar de ninguna de las dos.
        const rows = d.doors.map((x, i) => `<tr><td class="layout-calc"><b data-door-code="${i}">${esc(x.code || '')}</b></td>${cellText('doors', i, 'name', x.name, dis)}${cellSelect('doors', i, 'type', optionsHtml('door', LC.DOOR_TYPES, x.type), dis)}${cellSelect('doors', i, 'wallId', wallPickHtml(x.wallId), dis)}${cellNum('doors', i, 'dist', x.dist, dis)}${cellNum('doors', i, 'width', x.width, dis)}${cellNum('doors', i, 'height', x.height, dis)}${cellSelect('doors', i, 'open', optionsHtml('doorOpen', LC.DOOR_OPENS, LC.doorOpenOf(x)), dis, 'layoutPuertaAbre')}${cellSelect('doors', i, 'hinge', optionsHtml('doorEnd', LC.DOOR_ENDS, x.hinge === 'end' ? 'end' : 'start'), dis || LC.doorOpenOf(x) === 'fixed', 'layoutPuertaBisagra')}${cellSelect('doors', i, 'dir', optionsHtml('doorSide', LC.DOOR_SIDES, x.dir === 'out' ? 'out' : 'in'), dis || LC.doorOpenOf(x) === 'fixed', 'layoutPuertaLado')}<td class="layout-calc" data-wi-len="doors:${i}">${wallInfoCell('doors', x, 'len')}</td><td class="layout-calc" data-wi-h="doors:${i}">${wallInfoCell('doors', x, 'h')}</td>${removeCell('doors', i, dis)}</tr>`);
        return `${addButton('doors', 'main.layoutAgregarPuerta', dis, true)}${rows.length ? table(['main.layoutCodigo', 'main.layoutNombre', 'main.layoutTipo', 'main.layoutParedPuerta', 'main.layoutDistanciaPared', 'main.layoutAncho', 'main.layoutAlto', 'main.layoutPuertaAbre', 'main.layoutPuertaBisagra', 'main.layoutPuertaLado', 'main.layoutPuertaParedLargo', 'main.layoutPuertaParedAlto', ''], rows, 'layout-puertas') : `<p class="layout-muted">${esc(t('main.layoutPuertasVacio'))}</p>`}<div class="layout-vio" data-wi-issues="doors" hidden></div>`;
    }
    if (step === 'luz') {
        // Una conexión de luz SIEMPRE va sobre una pared (igual que una puerta): se elige cuál y se mide desde el inicio de esa pared; la pared dice cuánto mide y qué tan alta es.
        const rows = d.power.map((x, i) => `<tr><td class="layout-calc"><b data-power-code="${i}">${esc(x.code || '')}</b></td>${cellSelect('power', i, 'type', optionsHtml('power', LC.POWER_TYPES, x.type), dis)}${cellSelect('power', i, 'wallId', wallPickHtml(x.wallId), dis)}${cellNum('power', i, 'dist', x.dist, dis)}${cellNum('power', i, 'height', x.height, dis)}<td class="layout-calc" data-wi-len="power:${i}">${wallInfoCell('power', x, 'len')}</td><td class="layout-calc" data-wi-h="power:${i}">${wallInfoCell('power', x, 'h')}</td>${removeCell('power', i, dis)}</tr>`);
        return `${table(['main.layoutCodigo', 'main.layoutTipo', 'main.layoutParedPuerta', 'main.layoutDistanciaPared', 'main.layoutAlturaPiso', 'main.layoutPuertaParedLargo', 'main.layoutPuertaParedAlto', ''], rows, 'layout-luz')}${addButton('power', 'main.layoutAgregarConexion', dis, true)}<div class="layout-vio" data-wi-issues="power" hidden></div>`;
    }
    if (step === 'sensores') {
        // Cada renglón es un SENSOR de temperatura y/o humedad, colocado sobre una pared como las conexiones de luz. El código (S001…) lo pone el sistema y la zona donde queda sale de la pared (no se captura); las zonas que MIDE sí se eligen (una o varias).
        const zoneName = (id) => (d.zones.find((z) => z.id === id) || {}).name || '—';
        // el equipo del renglón de Alta Activos: en la columna sale SOLO el número de serie (lo demás hacía la columna muy larga) y, al pasar el cursor, el equipo completo (nombre · modelo · S/N); los sensores de antes, sin renglón, salen con «—»
        const assetOf = (x) => (x.assetRef ? (state.fixedAssets || []).find((r) => r.id === x.assetRef) : null);
        const equip = (x) => { const a = assetOf(x); return a && a.serialNumber ? a.serialNumber : '—'; };
        const equipFull = (x) => { const a = assetOf(x); return a ? [a.name, a.model, a.serialNumber ? `S/N ${a.serialNumber}` : ''].filter(Boolean).join(' · ') : ''; };
        const rows = (d.sensors || []).map((x, i) => `<tr><td class="layout-calc"><b data-sensor-code="${i}">${esc(x.code || '')}</b></td><td class="layout-calc" title="${esc([equipFull(x), t('main.layoutActivoDeRegistro')].filter(Boolean).join(' — '))}" data-help-key="layoutSensorEquipo">${esc(equip(x))}</td>${cellSelect('sensors', i, 'type', optionsHtml('sensor', LC.SENSOR_TYPES, x.type), dis)}${cellSelect('sensors', i, 'wallId', wallPickHtml(x.wallId), dis)}${sensorSideCell(x, i, dis)}${cellNum('sensors', i, 'dist', x.dist, dis)}${cellNum('sensors', i, 'height', x.height, dis)}<td class="layout-calc" data-wi-len="sensors:${i}">${wallInfoCell('sensors', x, 'len')}</td><td class="layout-calc" data-wi-h="sensors:${i}">${wallInfoCell('sensors', x, 'h')}</td><td class="layout-calc" data-sensor-zone="${i}">${esc(zoneName(x.zoneId))}</td>${sensorZonesCell(x, i, d, dis)}${removeCell('sensors', i, dis)}</tr>`);
        return `${table(['main.layoutCodigo', 'main.layoutSensorEquipo', 'main.layoutTipo', 'main.layoutParedPuerta', 'main.layoutSensorLado', 'main.layoutDistanciaPared', 'main.layoutAlturaPiso', 'main.layoutPuertaParedLargo', 'main.layoutPuertaParedAlto', 'main.layoutSensorZonaColocado', 'main.layoutSensorZonasMide', ''], rows, 'layout-sensores')}${canEdit('sensores') && !dis ? `<button type="button" class="btn btn-secondary layout-add" data-place-assets="sensors" data-main-add="1" data-help-key="layoutColocarSensor">${esc(t('main.layoutColocarSensor'))}</button>` : ''}<div class="layout-vio" data-wi-issues="sensors" hidden></div>`;
    }
    if (step === 'seguridad') {
        // Cada renglón es un ELEMENTO de seguridad (extintor, hidrante, puerta de emergencia, botiquín, alarma o pulsador, regadera y lavaojos, punto de reunión o ruta de evacuación): un punto puesto en el plano con X e Y, en metros.
        // La ruta de evacuación lleva además el punto de llegada (X final, Y final). El código (cada tipo con su letra: E001, I001, P001…) lo pone el sistema y la zona sale de dónde queda el punto: no se capturan.
        const zoneName = (id) => (d.zones.find((z) => z.id === id) || {}).name || '—';
        const rows = (d.safety || []).map((e, i) => {
            const route = e.type === 'route';
            const end = route ? `${cellNum('safety', i, 'x2', e.x2, dis)}${cellNum('safety', i, 'y2', e.y2, dis)}` : '<td class="layout-calc">—</td><td class="layout-calc">—</td>';
            // la ruta de evacuación es una marca en el piso: no lleva altura ni tamaño
            // la cámara y la bocina CUELGAN del techo: no llevan altura al piso (su altura es «Cuelga a»); la cámara además mira hacia un lado con un ángulo, y las dos llevan su alcance
            const dash = '<td class="layout-calc">—</td>';
            const hung = LC.isHungSafety(e);
            const size = route ? dash.repeat(4) : ['elev', 'l', 'w', 'h'].map((k) => (k === 'elev' && hung ? dash : safetySizeCell(e, i, k, dis))).join('');
            const hangCell = hung ? `<td><input type="number" step="0.05" min="0.01" data-l="safety" data-i="${i}" data-k="hang" data-help-key="layoutCuelgaA" value="${e.hang > 0 ? e.hang : ''}" placeholder="${LC.safetyHangOf(d, e)}"${dis ? ' disabled' : ''}></td>` : dash;
            const aimCell = e.type === 'camera' ? cellSelect('safety', i, 'aim', optionsHtml('aim', LC.SAFETY_AIMS, LC.safetyAimOf(e)), dis, 'layoutSgMiraHacia') : dash;
            const fovCell = e.type === 'camera' ? `<td><input type="number" step="5" min="5" max="360" data-l="safety" data-i="${i}" data-k="fov" data-help-key="layoutSgAngulo" value="${e.fov || ''}" placeholder="${LC.safetyFovOf(e)}"${dis ? ' disabled' : ''}></td>` : dash;
            const rangeCell = hung ? `<td><input type="number" step="1" min="1" max="200" data-l="safety" data-i="${i}" data-k="range" data-help-key="layoutSgAlcance" value="${e.range || ''}" placeholder="${LC.safetyRangeOf(e)}"${dis ? ' disabled' : ''}></td>` : dash;
            const hungCells = route ? dash.repeat(4) : `${hangCell}${aimCell}${fovCell}${rangeCell}`;

            // solo el hidrante tiene modelo (columna, poste doble, toma siamesa o gabinete): en los demás tipos la celda va con una raya
            const model = e.type === 'hydrant' ? cellSelect('safety', i, 'model', optionsHtml('hydrant', LC.HYDRANT_MODELS, LC.hydrantModelOf(e)), dis, 'layoutHidranteModelo') : '<td class="layout-calc">—</td>';
            return `<tr><td class="layout-calc"><b data-sf-code="${i}">${esc(e.code || '')}</b></td>${cellSelect('safety', i, 'type', optionsHtml('safety', LC.SAFETY_TYPES, e.type), dis)}${model}${cellText('safety', i, 'name', e.name || '', dis)}<td class="layout-calc" data-sf-zone="${i}">${esc(zoneName(e.zoneId))}</td>${cellNum('safety', i, 'x', e.x, dis)}${cellNum('safety', i, 'y', e.y, dis)}${end}${size}${hungCells}<td><input type="date" data-l="safety" data-i="${i}" data-k="expires" value="${esc(e.expires || '')}"${dis ? ' disabled' : ''}></td><td><input type="number" step="1" min="1" max="3650" data-l="safety" data-i="${i}" data-k="every" value="${e.every || ''}" placeholder="—"${dis ? ' disabled' : ''}></td><td><input type="date" data-l="safety" data-i="${i}" data-k="next" value="${esc(e.next || '')}"${dis ? ' disabled' : ''}><small class="layout-sg-eff" data-sf-next="${i}">${esc(safetyNextNote(e))}</small></td><td class="layout-calc" data-sf-last="${i}">${safetyLastHtml(e)}</td><td class="layout-calc" data-sf-status="${i}">${safetyStatusTag(e)}</td>${removeCell('safety', i, dis)}</tr>`;
        });
        const list = rows.length ? table(['main.layoutCodigo', 'main.layoutTipo', 'main.layoutModeloHidrante', 'main.layoutNombreModelo', 'main.layoutZona', 'main.layoutX', 'main.layoutY', 'main.layoutXFinal', 'main.layoutYFinal', 'main.layoutAlturaPiso', 'main.layoutLargo', 'main.layoutAncho', 'main.layoutAlto', 'main.layoutCuelgaA', 'main.layoutMiraHacia', 'main.layoutAnguloVision', 'main.layoutAlcance', 'main.layoutSgCaducidad', 'main.layoutSgCadaDias', 'main.layoutSgProxima', 'main.layoutSgUltima', 'main.layoutSgEstado', ''], rows, 'layout-seguridad') : `<p class="layout-muted">${esc(t('main.layoutSeguridadVacio'))}</p>`;
        // arriba: los contadores (Vigentes, Por vencer, Vencidos, Sin fecha) y con cuántos días de anticipación sale «Por vencer» (de fábrica 30); abajo, los vencidos
        const bar = `<div class="layout-sg-bar"><div class="layout-sg-counts" data-sf-counts data-help-key="layoutSgConteo">${safetyCountsHtml()}</div><div class="layout-fl"><label data-help-key="layoutSgAvisar">${esc(t('main.layoutSgAvisarCon'))}<input type="number" min="1" max="365" step="1" data-l="safetyWarn" value="${d.safetyWarnDays || LC.SAFETY_WARN_DAYS}"${dis ? ' disabled' : ''}></label></div></div>`;
        return `${addButton('safety', 'main.layoutAgregarSeguridad', dis, true)}${bar}${list}<div class="layout-vio" data-sf-issues hidden></div><div class="layout-due" data-sf-due hidden></div>`;
    }
    if (step === 'techos') {
        // Cada renglón es algo que CUELGA DEL TECHO (cámara, bocina, ventilación, extractor u otro): un punto puesto en el plano con X e Y, en metros, y «Cuelga a», la altura desde el piso a la que queda (vacío = pegado al techo).
        // El techo no es plano: «Techo ahí» dice cuánto mide la nave en ese punto y «Cuelga a» no puede pasar de ahí. El código (Q001, N001, W001, X001, Y001…) lo pone el sistema y la zona sale de dónde queda el punto: no se capturan.
        const zoneName = (id) => (d.zones.find((z) => z.id === id) || {}).name || '—';
        const rows = (d.ceiling || []).map((e, i) => {
            const lim = LC.ceilingLimitAt(d, e);
            const hang = `<td><input type="number" step="0.05" min="0.01" data-l="ceiling" data-i="${i}" data-k="h" data-help-key="layoutCuelgaA" value="${e.h > 0 ? e.h : ''}" placeholder="${LC.ceilingHangOf(d, e)}"${dis ? ' disabled' : ''}></td>`;
            return `<tr><td class="layout-calc"><b data-cl-code="${i}">${esc(e.code || '')}</b></td>${cellSelect('ceiling', i, 'type', optionsHtml('ceiling', LC.CEILING_TYPES, e.type), dis)}${cellText('ceiling', i, 'name', e.name || '', dis)}<td class="layout-calc" data-cl-zone="${i}">${esc(zoneName(e.zoneId))}</td>${cellNum('ceiling', i, 'x', e.x, dis)}${cellNum('ceiling', i, 'y', e.y, dis)}${hang}<td class="layout-calc" data-cl-limit="${i}">${lim ? fmt(lim) : '—'}</td>${removeCell('ceiling', i, dis)}</tr>`;
        });
        const list = rows.length ? table(['main.layoutCodigo', 'main.layoutTipo', 'main.layoutNombre', 'main.layoutZona', 'main.layoutX', 'main.layoutY', 'main.layoutCuelgaA', 'main.layoutTechoAhi', ''], rows, 'layout-techos') : `<p class="layout-muted">${esc(t('main.layoutTechosVacio'))}</p>`;
        // arriba, los techos (secciones dibujadas en el croquis); debajo, lo que cuelga del techo (ventilación, extractores…; las cámaras y bocinas viven en Seguridad)
        return `${addButton('roofs', 'main.layoutAgregarCubierta', dis, true)}${roofSectionHtml(d, dis)}<div class="layout-roof-sub"><h4>${esc(t('main.layoutColgadoTitulo'))}</h4>${addButton('ceiling', 'main.layoutAgregarTecho', dis, false)}</div>${list}<div class="layout-vio" data-cl-issues hidden></div>`;
    }
    if (step === 'objetos') {
        // Cada renglón es una PERSONA, un MONTACARGAS, un carrito o una plataforma dibujado en el plano, a escala (lo que es se elige en «Equipo o persona»). Es una foto fija (como el plano de Excel), no sigue a nadie en vivo. X e Y son su centro, en metros; el giro dice hacia dónde mira
        // (0° = hacia la derecha, 90° = hacia abajo). Las medidas de partida salen de «Cuánto mide lo que transita» (paso Tránsito) y se pueden cambiar en cada uno.
        const catalog = LC.transitCatalogOf(d);
        const equipOptions = (o) => `${o.equipId ? '' : '<option value="" selected>—</option>'}${catalog.filter((c) => c.status === 'active' || Number(c.id) === Number(o.equipId)).map((c) => `<option value="${c.id}"${Number(c.id) === Number(o.equipId) ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}`;
        const rows = (d.objects || []).map((o, i) => `<tr><td class="layout-calc"><b data-object-code="${i}">${esc(o.code || '')}</b></td>${cellText('objects', i, 'name', o.name, dis)}${cellSelect('objects', i, 'equipId', equipOptions(o), dis)}${personColorCell(o, i, 'vest', dis)}${personColorCell(o, i, 'helmet', dis)}${equipColorCell(o, i, dis)}${cellNum('objects', i, 'x', o.x, dis)}${cellNum('objects', i, 'y', o.y, dis)}${cellNum('objects', i, 'angle', o.angle || 0, dis, '5')}<td class="layout-calc">${fmt(o.l)}</td><td class="layout-calc">${fmt(o.w)}</td><td class="layout-calc">${fmt(o.h || 0)}</td>${removeCell('objects', i, dis)}</tr>`);
        const addBtn = `<button type="button" class="btn btn-secondary layout-add" data-add-object="1" data-main-add="1" data-help-key="layoutObjetoAgregar"${dis ? ' disabled' : ''}>${esc(t('main.layoutAgregarObjeto'))}</button>`;
        const list = rows.length ? table(['main.layoutCodigo', 'main.layoutNombre', 'main.layoutEquipoPersona', 'main.layoutChaleco', 'main.layoutCasco', 'main.layoutColorEquipo', 'main.layoutX', 'main.layoutY', 'main.layoutGiro', 'main.layoutLargo', 'main.layoutAncho', 'main.layoutAlto', ''], rows, 'layout-objetos') : `<p class="layout-muted">${esc(t('main.layoutObjetosVacio'))}</p>`;
        return `${addBtn}${list}`;
    }
    if (step === 'transito') {
        // Cada renglón es un PASILLO: por donde pasan personas, montacargas, carritos y plataformas. Va dentro de una zona (la zona sale de su lugar, como la de las huellas), se conecta con otro que lo toque y nada puede ir adentro.
        // Lo que transita por él tiene que caber (ancho, largo y alto, con las medidas de la tabla de abajo). El código (T001…) lo pone el sistema.
        const zoneName = (id) => (d.zones.find((z) => z.id === id) || {}).name || '—';
        const rows = (d.transit || []).map((p, i) => {
            const chips = (p.who || []).map((k) => `<span class="layout-chip" data-tr-who="${i}:${k}" data-help-key="layoutTransitoQuien">${esc(whoLabel(d, k))}${dis ? '' : `<button type="button" class="layout-chip-x" data-who-del="${i}:${k}" aria-label="${esc(t('main.layoutQuitar'))}">×</button>`}</span>`).join('') + (dis ? '' : `<button type="button" class="layout-chip-add" data-who-open="${i}" data-help-key="layoutTransitoQuien" aria-label="${esc(t('main.layoutQuienAgregar'))}" title="${esc(t('main.layoutQuienAgregar'))}">＋</button>`);
            const other = (p.who || []).includes('other') ? `<input type="text" class="layout-who-other" maxlength="${LC.LIMITS.text}" data-l="transit" data-i="${i}" data-k="otherName" data-help-key="layoutTransitoQuien" value="${esc(p.otherName || '')}" placeholder="${esc(t('main.layoutQuienOtroCual'))}"${dis ? ' disabled' : ''}>` : '';
            const alto = `<td><input type="number" step="0.1" min="0" data-l="transit" data-i="${i}" data-k="h" data-help-key="layoutTransitoAltoLibre" value="${p.h > 0 ? p.h : ''}" placeholder="—"${dis ? ' disabled' : ''}></td>`;
            return `<tr><td class="layout-calc"><b data-tr-code="${i}">${esc(p.code || '')}</b></td>${cellText('transit', i, 'name', p.name, dis)}${cellSelect('transit', i, 'type', optionsHtml('transit', LC.TRANSIT_TYPES, p.type), dis)}<td><div class="layout-chips">${chips}${other}</div></td><td class="layout-calc" data-tr-zone="${i}">${esc(zoneName(p.zoneId))}</td>${cellNum('transit', i, 'x', p.x, dis)}${cellNum('transit', i, 'y', p.y, dis)}${cellNum('transit', i, 'l', p.l, dis)}${cellNum('transit', i, 'w', p.w, dis)}${alto}<td class="layout-calc"><span data-tr-area="${i}">${fmt((Number(p.l) || 0) * (Number(p.w) || 0))} m²</span></td>${removeCell('transit', i, dis, transitFmtButton(p, i, dis))}</tr>`;
        });

        const issues = `<div class="layout-vio" data-tr-issues hidden></div>`;
        const list = rows.length ? table(['main.layoutCodigo', 'main.layoutNombre', 'main.layoutTipo', 'main.layoutQuienTransita', 'main.layoutZona', 'main.layoutX', 'main.layoutY', 'main.layoutLargo', 'main.layoutAncho', 'main.layoutAltoLibre', 'main.layoutSuperficie', ''], rows, 'layout-transito') : `<p class="layout-muted">${esc(t('main.layoutTransitoVacio'))}</p>`;
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
            // Alto de la zona (opcional): vacío = el techo de la nave en ese lugar (se ve de sugerencia); su volumen sale de su superficie por esa altura.
            const clearH = LC.zoneClearHeights(d, z);
            const hBox = `<td><input type="number" step="0.05" min="0" data-l="zones" data-i="${i}" data-k="h" data-help-key="layoutZoneAlto" placeholder="${clearH ? clearH.min : ''}" value="${z.h > 0 ? z.h : ''}"${dis ? ' disabled' : ''}></td>`;
            const planBox = `<td><input type="number" step="0.01" min="0" data-l="zones" data-i="${i}" data-k="planM2" data-help-key="layoutZonePlanM2" value="${z.planM2 > 0 ? z.planM2 : ''}"${dis ? ' disabled' : ''}></td>`;
            // Los pisos que toca la zona (los niveles viven en el paso Pisos; aquí solo se lee): una zona puede tocar varios sin partirse.
            const floorsCell = `<td class="layout-calc"><span data-zone-floors="${i}" data-help-key="layoutPisosQueToca">${esc(LC.floorsOfZone(d, z).map((f) => f.code).join(' · ') || '—')}</span></td>`;
            // Uso de la zona (aparte del tipo): almacenamiento, operaciones o instalaciones. Se puede dejar sin definir.
            const useOptions = `<option value=""${z.use ? '' : ' selected'}>${esc(t('main.layoutUsoSinDefinir'))}</option>${optionsHtml('use', LC.ZONE_USES, z.use)}`;
            const useBox = `<td><select data-l="zones" data-i="${i}" data-k="use" data-help-key="layoutZoneUse"${dis ? ' disabled' : ''}>${useOptions}</select></td>`;
            return `<tr class="${z.active === false ? 'layout-off' : ''}"><td class="layout-calc"><b data-zone-code="${i}">${esc(z.code || '')}</b></td>${cellText('zones', i, 'name', z.name, dis)}${cellSelect('zones', i, 'type', typeOptions, dis)}${useBox}${position}${hBox}<td class="layout-calc"><span data-zone-area="${i}">${fmt(LC.zoneArea(z))} m²</span><div class="layout-muted" data-zone-vol="${i}">${zoneVolText(z)}</div><div data-zone-chips="${i}">${zoneChipsHtml(z)}</div></td>${planBox}${floorsCell}${saved ? savedRowButtons('zones', i, z.active, dis, fmtButton + catButton + shapeButton) : removeCell('zones', i, dis, fmtButton + catButton + shapeButton)}</tr>`;
        });
        return `${table(['main.layoutCodigoZona', 'main.layoutNombre', 'main.layoutTipo', 'main.layoutUsoZona', 'main.layoutX', 'main.layoutY', 'main.layoutLargo', 'main.layoutAncho', 'main.layoutAlto', 'main.layoutSuperficie', 'main.layoutPlanM2', 'main.layoutPisosQueToca', ''], rows, 'layout-zonas')}<div class="layout-sidesbar">${addButton('zones', 'main.layoutAgregarZona', dis, true)}${addButton('zonesFree', 'main.layoutAgregarZonaLibre', dis, true)}</div>${zoneSidesPanelHtml(dis)}${zoneCatsPanelHtml(dis)}`;
    }
    if (step === 'pisos') {
        // Un piso es un rectángulo del croquis más alto o más bajo que el piso de la nave (plataforma o foso), aparte de las zonas: una zona puede tocar varios pisos. Nivel del piso (0 = a nivel; negativo = foso). Las rampas que unen
        // dos pisos van en su propio paso, Rampas. Las zonas que toca y su superficie se calculan solas.
        const rows = (d.floors || []).map((f, i) => {
            const saved = isSavedRow('floors', f.id);
            const lvlBoxes = `<td><input type="number" step="0.05" data-l="floors" data-i="${i}" data-k="lvl" data-help-key="layoutNivelPiso" value="${f.lvl !== undefined ? f.lvl : 0}"${dis ? ' disabled' : ''}></td>`;
            const touches = LC.zonesOfFloor(d, f).map((z) => z.code || z.name).join(' · ') || '—';
            const floorFmt = floorFmtButton(f, i, dis);
            return `<tr class="${f.active === false ? 'layout-off' : ''}"><td class="layout-calc"><b data-floor-code="${i}">${esc(f.code || '')}</b></td>${cellText('floors', i, 'name', f.name, dis)}${cellNum('floors', i, 'x', f.x, dis)}${cellNum('floors', i, 'y', f.y, dis)}${cellNum('floors', i, 'l', f.l, dis)}${cellNum('floors', i, 'w', f.w, dis)}<td class="layout-calc"><span data-floor-area="${i}">${fmt((Number(f.l) || 0) * (Number(f.w) || 0))} m²</span></td>${lvlBoxes}<td class="layout-calc"><span data-floor-zones="${i}" data-help-key="layoutZonasQueToca">${esc(touches)}</span><div class="layout-floor-issue" data-floor-issues="${i}"></div></td>${saved ? savedRowButtons('floors', i, f.active, dis, floorFmt) : removeCell('floors', i, dis, floorFmt)}</tr>`;
        });
        const list = rows.length ? table(['main.layoutCodigoPiso', 'main.layoutNombre', 'main.layoutX', 'main.layoutY', 'main.layoutLargo', 'main.layoutAncho', 'main.layoutSuperficie', 'main.layoutNivelPiso', 'main.layoutZonasQueToca', ''], rows, 'layout-pisos') : `<p class="layout-muted">${esc(t('main.layoutPisosVacio'))}</p>`;
        return `${addButton('floors', 'main.layoutAgregarPiso', dis, true)}${list}`;
    }
    if (step === 'rampas') {
        // Una rampa une DOS pisos (o un piso y la nave, a nivel 0): se elige De y A y se coloca entre los dos (X, Y, largo y ancho). Su nivel de abajo, el de arriba y su lado más alto salen de esos dos pisos: no se escriben. Una rampa de antes que
        // no se pudo ligar a sus pisos conserva sus niveles (De y A vacíos).
        const signedLv = (v) => `${v > 0 ? '+' : ''}${(Math.round(v * 100) / 100).toFixed(2)}`;
        const refOptions = (selected) => `<option value="">—</option><option value="nave"${selected === 'nave' ? ' selected' : ''}>${esc(t('main.layoutRampaNave'))} · 0.00</option>${(d.floors || []).filter((f) => f.active !== false).map((f) => `<option value="${esc(f.id)}"${selected === f.id ? ' selected' : ''}>${esc(f.code || '')} ${esc(f.name || '')} · ${signedLv(Number(f.lvl) || 0)}</option>`).join('')}`;
        const rows = (d.ramps || []).map((r, i) => {
            const saved = isSavedRow('ramps', r.id);
            const info = LC.rampInfo(d, r);
            const lo = info.ok ? signedLv(info.lo) : '—';
            const hi = info.ok ? signedLv(info.hi) : '—';
            const rise = info.ok ? typeLabel('rise', info.rise) : '—';
            const rampFmt = rampFmtButton(r, i, dis);
            return `<tr class="${r.active === false ? 'layout-off' : ''}"><td class="layout-calc"><b data-ramp-code="${i}">${esc(r.code || '')}</b></td>${cellText('ramps', i, 'name', r.name, dis)}${cellSelect('ramps', i, 'from', refOptions(r.from || ''), dis, 'layoutRampaDe')}${cellSelect('ramps', i, 'to', refOptions(r.to || ''), dis, 'layoutRampaA')}${cellNum('ramps', i, 'x', r.x, dis)}${cellNum('ramps', i, 'y', r.y, dis)}${cellNum('ramps', i, 'l', r.l, dis)}${cellNum('ramps', i, 'w', r.w, dis)}<td class="layout-calc"><span data-ramp-lo="${i}" data-help-key="layoutRampaNiveles">${esc(lo)}</span></td><td class="layout-calc"><span data-ramp-hi="${i}" data-help-key="layoutRampaNiveles">${esc(hi)}</span></td><td class="layout-calc"><span data-ramp-rise="${i}" data-help-key="layoutRampaNiveles">${esc(rise)}</span><div class="layout-floor-issue" data-ramp-issues="${i}"></div></td>${saved ? savedRowButtons('ramps', i, r.active, dis, rampFmt) : removeCell('ramps', i, dis, rampFmt)}</tr>`;
        });
        const list = rows.length ? table(['main.layoutCodigoRampa', 'main.layoutNombre', 'main.layoutRampaDe', 'main.layoutRampaA', 'main.layoutX', 'main.layoutY', 'main.layoutLargo', 'main.layoutAncho', 'main.layoutNivelAbajo', 'main.layoutNivelArriba', 'main.layoutLadoAlto', ''], rows, 'layout-rampas') : `<p class="layout-muted">${esc(t('main.layoutRampasVacio'))}</p>`;
        return `${addButton('ramps', 'main.layoutAgregarRampa', dis, true)}${list}`;
    }
    if (step === 'ubicaciones') return positionsStepHtml(dis);
    if (step === 'posiciones') {
        // Cada renglón es una POSICIÓN (un nivel × una columna) de un activo: salen solas con los niveles (Activos) y la cantidad de posiciones de cada nivel (Niveles). De cada una se define el largo, el fondo y el alto (en metros) y
        // cuántas filas y cuántas profundidades tiene (de ahí salen sus localizadores); los m² y los m³ salen solos. La altura del piso y la ceja son del nivel (paso Niveles). Lo que no se cambia queda como lo de por defecto y no se guarda aparte.
        const shown = (v) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '');
        const bayNum = (i, n, c, key, value, edited, step, extra = '', bad = false) => `<td><input type="number" min="0" step="${step}" data-l="bay" data-i="${i}" data-n="${n}" data-c="${c}" data-k="${key}" value="${value}"${extra}${edited || bad ? ` class="${[edited ? 'layout-edited' : '', bad ? 'layout-missing' : ''].filter(Boolean).join(' ')}"` : ''}${dis ? ' disabled' : ''}></td>`;
        const POSITION_ROWS_MAX = 1500;
        // cuántas posiciones tiene cada espacio: las que salen en el paso Posiciones
        const posCounts = new Map();
        (d.positions || []).forEach((p) => { const k = `${p.spaceId}|${p.n}|${p.c}`; posCounts.set(k, (posCounts.get(k) || 0) + 1); });
        let count = 0;
        const rows = [];
        d.spaces.forEach((s, i) => {
            if (s.active === false) return;
            const levels = s.levels || 1;
            for (let n = 1; n <= levels; n += 1) {
                const slots = LC.levelSlots(s, n); // las posiciones que se le pusieron a ESTE nivel en Niveles
                const sumOver = LC.levelLengthSum(s, n).over;
                const rcsL = LC.levelBayRects(s, n); // dónde cae cada espacio del nivel (su X y su Y dentro del activo)
                const clashL = LC.levelBayClashes(s, n); // los que se enciman con otro espacio del nivel
                for (let c = 1; c <= slots; c += 1) {
                    if (count >= POSITION_ROWS_MAX) return;
                    count += 1;
                    const rcL = rcsL[c - 1];
                    const outL = rcL.x + rcL.l > s.l + 0.005 || rcL.y + rcL.w > s.d + 0.005 || rcL.x < -0.005 || rcL.y < -0.005 || clashL.has(c);
                    const bay = LC.bayOf(s, n, c);
                    const m = LC.bayMeasures(s, n, c);
                    const st = bay.stored;
                    const lvH = LC.levelMeasures(s, n).h; // el alto del espacio de su nivel: el alto de la posición no pasa de él
                    const lvName = ((s.lvls || []).find((l) => l.n === n) || {}).name || '';
                    const nameOf = s.ownName || s.name || '';
                    const pad3 = (v) => String(v).padStart(3, '0');
                    rows.push(`<tr><td class="layout-calc"><b>${esc(s.code)}.N${pad3(n)}.E${pad3(c)}</b></td><td class="layout-calc">${esc(s.code)}${nameOf ? ` · ${esc(nameOf)}` : ''}</td><td class="layout-calc">N${pad3(n)}${lvName ? ` · ${esc(lvName)}` : ''}</td>${bayNum(i, n, c, 'l', shown(m.l), st.l !== undefined, '0.01', '', (s.l > 0 && m.l > s.l + 0.005) || sumOver)}${bayNum(i, n, c, 'w', shown(m.w), st.w !== undefined, '0.01', ' data-help-key="layoutPosFondo"', s.d > 0 && m.w > s.d + 0.005)}${bayNum(i, n, c, 'x', shown(rcL.x), st.x !== undefined, '0.01', ' data-help-key="layoutBayX"', outL && LC.levelHasPlaced(s, n))}${bayNum(i, n, c, 'y', shown(rcL.y), st.y !== undefined, '0.01', ' data-help-key="layoutBayY"', outL && LC.levelHasPlaced(s, n))}${bayNum(i, n, c, 'h', shown(m.h), st.h !== undefined, '0.01', ' data-help-key="layoutPosAlto"', st.h !== undefined && lvH > 0 && m.h > lvH + 0.005)}<td class="layout-calc" data-help-key="layoutPosDesde"><span data-bay-from="${i}|${n}|${c}">${shown(m.floorH + m.beam)}</span></td><td class="layout-calc" data-help-key="layoutPosHasta"><span data-bay-to="${i}|${n}|${c}">${shown(m.floorH + m.beam + m.h)}</span></td><td><input type="number" min="1" max="${LC.LIMITS.slots}" step="1" data-l="bay" data-i="${i}" data-n="${n}" data-c="${c}" data-k="count" data-help-key="layoutPosCantidad" value="${posCounts.get(`${s.id}|${n}|${c}`) || 1}"${dis || !canEdit('ubicaciones') ? ' disabled' : ''}></td><td class="layout-calc"><span data-bay-m2="${i}|${n}|${c}">${shown(m.l * m.w)}</span></td><td class="layout-calc"><span data-bay-m3="${i}|${n}|${c}">${shown(m.l * m.w * m.h)}</span></td>${facesCellHtml('bay', i, n, c, LC.facesOfBay(s, n, c), LC.facesOfLevel(s, n), st.faces !== undefined, dis)}<td>${bayFmtButton(c, dis)}</td></tr>`);
                }
            }
        });
        if (!rows.length) return `<p class="layout-muted">${esc(t('main.layoutPosSinActivos'))}</p>`;
        const heads = ['main.layoutPosCodigo', 'main.layoutNivActivo', 'main.layoutPosNivel', 'main.layoutLargo', 'main.layoutFondo', 'main.layoutUbicX', 'main.layoutUbicY', 'main.layoutAlto', 'main.layoutPosDesde', 'main.layoutPosHasta', 'main.layoutPosCantidad', 'main.layoutPosM2', 'main.layoutPosM3', 'main.layoutCarasConsumo', ''];
        const bayIssues = bayIssuesHtml();
        return `${table(heads, rows, 'layout-posiciones')}<div class="layout-vio" data-bay-issues${bayIssues ? '' : ' hidden'}>${bayIssues}</div>${count >= POSITION_ROWS_MAX ? `<p class="layout-muted">${esc(t('main.layoutPosMuchos').replace('{n}', POSITION_ROWS_MAX))}</p>` : ''}`;
    }
    if (step === 'niveles') {
        // Cada renglón es un NIVEL de un activo de Huella-Espacio (el rack con 3 niveles deja 3 renglones, ya listos): sus niveles salen solos de Activos. Solo se escribe la altura del piso del nivel 1 (hasta dónde empieza la primera
        // reja): la de los demás niveles se calcula sola (la del de abajo + su reja + su alto). Se anota UNA VEZ el alto (el espacio libre) y la ceja (el grueso de la reja) de cada nivel y valen para todas sus columnas; lo que no se cambia
        // queda como lo de por defecto (calculado con el alto del activo) y no se guarda aparte. Un hueco de Posiciones con medida propia manda sobre el nivel.
        const zoneName = (id) => (d.zones.find((z) => z.id === id) || {}).name || '—';
        const shown = (v) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '');
        const lvlNum = (i, n, key, value, edited, extra = '', bad = false) => `<td><input type="number" min="0" step="0.01" data-l="lvl" data-i="${i}" data-n="${n}" data-k="${key}" value="${value}"${extra}${edited || bad ? ` class="${[edited ? 'layout-edited' : '', bad ? 'layout-missing' : ''].filter(Boolean).join(' ')}"` : ''}${dis ? ' disabled' : ''}></td>`;
        const LEVEL_ROWS_MAX = 1500;
        let count = 0;
        const rows = [];
        d.spaces.forEach((s, i) => {
            if (s.active === false) return;
            const levels = s.levels || 1;
            for (let n = 1; n <= levels; n += 1) {
                if (count >= LEVEL_ROWS_MAX) return;
                count += 1;
                const m = LC.levelMeasures(s, n);
                const st = m.stored;
                const over = s.h > 0 && m.floorH + m.beam + m.h > s.h + 0.005;
                const total = m.beam + m.h;
                const nameOf = s.ownName || s.name || '';
                rows.push(`<tr><td class="layout-calc"><b>${esc(s.code)}.N${String(n).padStart(3, '0')}</b></td><td><input type="text" maxlength="${LC.LIMITS.text}" data-l="lvl" data-i="${i}" data-n="${n}" data-k="name" data-help-key="layoutNivNombre" value="${esc(st.name || '')}" placeholder="${esc(t('main.layoutNivNombrePh'))}"${dis ? ' disabled' : ''}></td><td class="layout-calc">${esc(s.code)}${nameOf ? ` · ${esc(nameOf)}` : ''}</td>${n === 1 ? lvlNum(i, n, 'floorH', shown(m.floorH), st.floorH !== undefined, ' data-help-key="layoutNivArranque"', over) : `<td class="layout-calc${over ? ' layout-bad' : ''}"><span data-lvl-floor="${i}|${n}" data-help-key="layoutNivAuto">${shown(m.floorH)}</span></td>`}${lvlNum(i, n, 'beam', shown(m.beam), st.beam !== undefined, ' data-help-key="layoutNivCeja"')}${lvlNum(i, n, 'h', shown(m.h), st.h !== undefined, '', over)}<td class="layout-calc"><span data-lvl-total="${i}|${n}">${shown(total)}</span></td><td><input type="number" min="1" max="${LC.LIMITS.slots}" step="1" data-l="lvl" data-i="${i}" data-n="${n}" data-k="slots" data-help-key="layoutNivPosiciones" value="${LC.levelSlots(s, n)}"${st.slots !== undefined ? ' class="layout-edited"' : ''}${dis ? ' disabled' : ''}></td>${facesCellHtml('lvl', i, n, 0, LC.facesOfLevel(s, n), LC.facesOfSpace(s), st.faces !== undefined, dis)}<td><button type="button" class="btn btn-secondary layout-toggle" data-lvl-apply="${i}|${n}" data-help-key="layoutNivAplicar" title="${esc(t('main.layoutNivAplicarTip'))}"${dis || levels < 2 ? ' disabled' : ''}>${esc(t('main.layoutNivAplicar'))}</button></td></tr>`);
            }
        });
        if (!rows.length) return `<p class="layout-muted">${esc(t('main.layoutNivSinActivos'))}</p>`;
        const heads = ['main.layoutNivCodigo', 'main.layoutNivNombreCol', 'main.layoutNivActivo', 'main.layoutNivBase', 'main.layoutNivCejaCol', 'main.layoutNivEspacio', 'main.layoutNivAlto', 'main.layoutNivCantPos', 'main.layoutCarasConsumo', ''];
        const issues = levelIssuesHtml();
        return `${table(heads, rows, 'layout-niveles')}<div class="layout-vio" data-lvl-issues${issues ? '' : ' hidden'}>${issues}</div>${count >= LEVEL_ROWS_MAX ? `<p class="layout-muted">${esc(t('main.layoutNivMuchos').replace('{n}', LEVEL_ROWS_MAX))}</p>` : ''}`;
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
        // La tabla sigue el orden de cómo se define un activo: 1) la zona y la huella (solo salen las huellas de esa zona), 2) la clasificación, 3) el tipo de activo (de él sale la letra del código) y 4) los niveles y las medidas.
        // Un activo para operar (clasificación en m²) siempre tiene 1 nivel y no se edita. Lo demás del activo (columnas, cajones, lugar dentro de la huella, rangos) se define en Niveles, Posiciones y Localizadores.
        const metricOf = (id) => { const r = assetLists.classes.find((x) => x.id === id); return r ? r.kind : ''; };
        const zoneOptions = (selected) => `${selected ? '' : `<option value="" selected>${esc(t('main.layoutActivoElegirZona'))}</option>`}${d.zones.filter((z) => z.active !== false || z.id === selected).map((z) => `<option value="${esc(z.id)}"${z.id === selected ? ' selected' : ''}>${esc(z.name || z.code)}</option>`).join('')}`;
        const footprintOptionsIn = (zone, selected) => {
            const list = zone ? d.footprints.filter((f) => f.zoneId === zone) : d.footprints.filter((f) => f.id === selected);
            return `${selected ? '' : `<option value="" selected>${esc(t('main.layoutActivoElegirHuella'))}</option>`}${list.map((f) => `<option value="${esc(f.id)}"${f.id === selected ? ' selected' : ''}>${esc(f.code)}${f.name ? ` · ${esc(f.name)}` : ''}</option>`).join('')}`;
        };
        const rows = d.spaces.map((s, i) => {
            const saved = isSavedRow('spaces', s.id);
            const fp = d.footprints.find((f) => f.id === s.footprintId);
            const zone = fp ? (fp.zoneId || '') : (zonePick.get(s.id) || '');
            // Un activo que viene de Alta Activos (assetRef): su código, nombre, tipo, clasificación y medidas se leen y se cambian allá; aquí solo se acomoda (huella, niveles, frente, caras).
            const ref = !!s.assetRef;
            const reg = ref ? (state.fixedAssets || []).find((a) => a.id === s.assetRef) : null; // el renglón del registro: de ahí salen los nombres si el catálogo no los trae a esta cuenta
            const letter = ref ? ((String(s.code || '').match(/^[A-Za-z]+/) || [''])[0]).toUpperCase() : (LC.ASSET_LETTER[s.type] || LC.ASSET_LETTER.rack);
            const calcText = (text) => `<td class="layout-calc" title="${esc(t('main.layoutActivoDeRegistro'))}" data-help-key="layoutActivoDeRegistro">${esc(text || '—')}</td>`;
            const nameOf = (list, id) => (list.find((r) => r.id === id) || {}).name || '';
            const nameCell = ref ? calcText(s.ownName) : `<td><input type="text" maxlength="${LC.LIMITS.text}" data-l="spaces" data-i="${i}" data-k="ownName" data-help-key="layoutActivoNombre" value="${esc(s.ownName || '')}" placeholder="${esc(fp && fp.name ? fp.name : '')}"${dis ? ' disabled' : ''}></td>`;
            const levelsCell = metricOf(s.assetClassId) === 'm2'
                ? `<td><input type="number" step="1" data-l="spaces" data-i="${i}" data-k="levels" data-help-key="layoutActivoNivelFijo" value="${s.levels || 1}" title="${esc(t('main.layoutActivoNivelFijo'))}" disabled></td>`
                : cellNum('spaces', i, 'levels', s.levels || 1, dis, '1');
            return `<tr class="${s.active === false ? 'layout-off' : ''}"><td class="layout-calc"><b data-sp-code="${i}">${esc(s.code || '')}</b></td>${nameCell}<td><select data-zone-pick="${esc(s.id)}" data-help-key="layoutActivoZona"${dis ? ' disabled' : ''}>${zoneOptions(zone)}</select></td><td><select data-l="spaces" data-i="${i}" data-k="footprintId" data-help-key="layoutActivoZona"${s.footprintId ? '' : ' class="layout-missing"'}${dis ? ' disabled' : ''}>${footprintOptionsIn(zone, s.footprintId)}</select></td>${ref ? calcText(nameOf(assetLists.classes, s.assetClassId) || (reg && reg.className)) : pick(i, 'assetClassId', 'layoutAssetClass', assetLists.classes, s.assetClassId)}${ref ? calcText(nameOf(assetLists.types, s.assetId) || (reg && reg.typeName)) : pick(i, 'assetId', 'layoutAssetType', assetLists.types, s.assetId)}<td class="layout-calc" data-help-key="layoutSpaceLetter"><b>${esc(letter)}</b></td>${levelsCell}${ownCells(s, i, dis || ref, ['ol', 'od', 'oh'])}${frontCellHtml(s, i, dis)}${facesCellHtml('space', i, 0, 0, LC.facesOfSpace(s), null, s.faces !== undefined, dis)}${saved ? savedRowButtons('spaces', i, s.off !== true, dis, assetFmtButton(s, i, dis)) : removeCell('spaces', i, dis, assetFmtButton(s, i, dis))}</tr>`;
        });
        return d.footprints.length ? `${table(['main.layoutCodigo', 'main.layoutNombre', 'main.layoutZona', 'main.layoutHuellaCol', 'main.layoutActivoClase', 'main.layoutActivoTipo', 'main.layoutActivoLetra', 'main.layoutNiveles', 'main.layoutLargo', 'main.layoutFondo', 'main.layoutAlto', 'main.layoutFrente', 'main.layoutCarasConsumo', ''], rows, 'layout-activos')}${canEdit('activos') && !dis ? `<button type="button" class="btn btn-secondary layout-add" data-place-assets="1" data-main-add="1" data-help-key="layoutColocarActivo">${esc(t('main.layoutColocarActivo'))}</button>` : ''}${state.perms && state.perms.canRenumber && !dis && d.spaces.some((x) => !x.assetRef) ? `<button type="button" class="btn btn-secondary layout-add" data-renumber-codes="1" data-main-add="1" data-help-key="layoutRenumerar">${esc(t('main.layoutRenumerarBtn'))}</button>` : ''}` : `<p class="layout-muted">${esc(t('main.layoutActivosSinEspacios'))}</p>`;
    }
    const zoneOptions = (selected) => `<option value="">—</option>${d.zones.map((z) => `<option value="${esc(z.id)}"${z.id === selected ? ' selected' : ''}>${esc(z.name)}</option>`).join('')}`;
    // Cada renglón es una HUELLA: el lugar en el piso. Al agregar una nace con 0 activos; la columna «Activos» pide cuántos lleva y los activos salen (ya ligados a esta huella) en el paso Activos, donde se les pone su tipo y medidas.
    const rows = d.footprints.map((s, i) => {
        const saved = isSavedRow('footprints', s.id);
        const view = footprintZoneView(s);
        const actCount = d.spaces.filter((x) => x.footprintId === s.id).length;
        const actCell = `<td class="layout-calc" data-help-key="layoutHuellaActivos">${actCount}</td>`;
        return `<tr class="${s.active === false ? 'layout-off' : ''}"><td class="layout-calc"><b data-fp-code="${i}">${esc(s.code)}</b></td>${cellText('footprints', i, 'name', s.name || '', dis)}<td class="layout-calc${view.bad ? ' layout-bad' : ''}" data-fp-zone="${i}" data-help-key="layoutHuellaZona">${esc(view.text)}</td>${cellNum('footprints', i, 'x', s.x, dis)}${cellNum('footprints', i, 'y', s.y, dis)}${cellNum('footprints', i, 'l', s.l, dis)}${cellNum('footprints', i, 'd', s.d, dis)}${cellNum('footprints', i, 'h', s.h, dis)}${actCell}<td class="layout-calc" data-space-calc="${i}">${fmt(s.l * s.d)} m² · ${fmt(s.l * s.d * s.h)} m³</td>${saved ? savedRowButtons('footprints', i, s.active, dis, spaceFmtButton(s, i, dis)) : removeCell('footprints', i, dis, spaceFmtButton(s, i, dis))}</tr>`;
    });
    return `${table(['main.layoutCodigoHuella', 'main.layoutNombre', 'main.layoutZona', 'main.layoutX', 'main.layoutY', 'main.layoutLargo', 'main.layoutFondo', 'main.layoutAlto', 'main.layoutHuellaActivos', 'main.layoutHuellaVolumen', ''], rows, 'layout-espacios')}${addButton('footprints', 'main.layoutAgregarEspacio', dis, true)}`;
}

// Los pasos son capas del croquis: se pueden tener activos varios a la vez y el croquis muestra siempre la nave más lo de los pasos activos. Abajo solo sale el formulario del
// paso enfocado (el último que se tocó): al tocar Puertas, abajo solo se edita Puertas.
const stepOn = (step) => state.steps.includes(step);
function focusStep(step) {
    state.focus = step;
    state.focusStack = [...state.focusStack.filter((x) => x !== step), step];
}
function showStep(step) { if (!stepOn(step)) state.steps = [...state.steps, step]; focusStep(step); }
// ---- Paso «Posiciones» --------------------------------------------------------------------------------------------
// Cada espacio (un nivel × un espacio de un activo) se divide en posiciones acomodadas a mano, como un activo dentro de una huella: X y Y desde la esquina de arriba a la izquierda del espacio, largo, fondo y alto.
// Es una TABLA, un renglón por posición (las de todos los espacios): lo que se ve se ve en el croquis (2D y 3D) al elegir el renglón, con Tenue, Oculto y Enfoque. Lo que se sale del espacio, pasa de su alto o se encima con
// otra se marca en rojo y no se guarda (LayoutCalc.positionViolations).
const ubicPad = (v) => String(v).padStart(3, '0');
function posEspacios() {
    const out = [];
    (state.draft.spaces || []).forEach((s, i) => {
        if (s.off === true || s.active === false) return;
        for (let n = 1; n <= (s.levels || 1); n += 1) {
            const slots = LC.levelSlots(s, n);
            for (let c = 1; c <= slots; c += 1) out.push({ i, s, n, c, key: `${s.id}|${n}|${c}` });
        }
    });
    return out;
}
// Todo espacio (nivel × espacio de un activo) tiene al menos una posición: las que faltan las genera el sistema (una que cubre todo el espacio) y las de fábrica siguen el tamaño de su espacio.
function syncPositions() {
    if (!state.draft) return;
    const ens = LC.ensurePositions(state.draft);
    if (ens === state.draft) return;
    state.draft.positions = ens.positions;
    if (ens.posNext) state.draft.posNext = ens.posNext;
}
const posBayItems = (spaceId, n, c) => (state.draft.positions || []).filter((p) => p.spaceId === spaceId && p.n === n && p.c === c).sort((a, b) => (a.num || 0) - (b.num || 0));
function posVioText(v) {
    if (v.kind === 'faces') return t('main.layoutVioUbic_faces', { ...v.vars, faces: facesText(v.vars.extra), has: facesText(v.vars.up) });
    return t(`main.layoutVioUbic_${v.kind}`, v.vars);
}
// Las faltas de TODAS las posiciones: id de la posición -> { out, tall, overlap, faces }
function posViolationsAll() {
    const map = new Map();
    const list = LC.positionViolations(state.draft);
    list.forEach((v) => {
        const m = map.get(v.id) || {}; m[v.kind] = true; map.set(v.id, m);
        if (v.kind === 'overlap' && v.vars.otherId) { const o = map.get(v.vars.otherId) || {}; o.overlap = true; map.set(v.vars.otherId, o); } // las dos que se encima se marcan
    });
    return { map, list };
}
const POS_ROWS_MAX = 1500;
function positionsStepHtml(dis) {
    const bays = posEspacios();
    if (!bays.length) return `<p class="layout-muted">${esc(t('main.layoutUbicSinEspacios'))}</p>`;
    const { map: bad, list: vios } = posViolationsAll();
    const num = (p, k, isBad) => `<td><input type="number" step="0.01" min="0" data-pk="${k}" data-pid="${esc(p.id)}" value="${Math.round(p[k] * 100) / 100}"${isBad ? ' class="layout-missing"' : ''}${dis ? ' disabled' : ''}></td>`;
    const rows = [];
    let count = 0;
    bays.forEach((x) => {
        const items = posBayItems(x.s.id, x.n, x.c);
        const upFaces = LC.facesOfBay(x.s, x.n, x.c);
        const nameOf = x.s.ownName || x.s.name || '';
        items.forEach((p) => {
            if (count >= POS_ROWS_MAX) return;
            count += 1;
            const b = bad.get(p.id) || {};
            rows.push(`<tr data-posid="${esc(p.id)}"><td class="layout-calc"><b>${esc(LC.positionCode(x.s, p))}</b></td><td class="layout-calc">${esc(x.s.code)}${nameOf ? ` · ${esc(nameOf)}` : ''}</td><td class="layout-calc">N${ubicPad(x.n)}</td><td class="layout-calc">E${ubicPad(x.c)}</td>`
                + `${num(p, 'x', b.out)}${num(p, 'y', b.out)}${num(p, 'l', b.out || b.overlap)}${num(p, 'w', b.out || b.overlap)}${num(p, 'h', b.tall)}`
                + `<td class="layout-calc" data-pos-m2>${fmt(p.l * p.w)}</td><td class="layout-calc" data-pos-m3>${fmt(p.l * p.w * p.h)}</td>${facesCellHtml('pos', x.i, p.n, p.c, LC.facesOfPosition(x.s, p), upFaces, p.faces !== undefined, dis, p.id)}`
                + `<td><button type="button" class="layout-x" data-pos-add="${esc(p.id)}" aria-label="${esc(t('main.layoutUbicMas'))}" title="${esc(t('main.layoutUbicMas'))}"${dis ? ' disabled' : ''}>+</button></td>`
                + `<td><button type="button" class="layout-x" data-pos-del="${esc(p.id)}" aria-label="${esc(t('main.layoutUbicQuitar'))}"${items.length <= 1 ? ` title="${esc(t('main.layoutUbicUltima'))}"` : ''}${dis || items.length <= 1 ? ' disabled' : ''}>✕</button></td></tr>`);
        });
    });
    const heads = ['main.layoutUbicCodigo', 'main.layoutNivActivo', 'main.layoutPosNivel', 'main.layoutPosColumna', 'main.layoutUbicX', 'main.layoutUbicY', 'main.layoutLargo', 'main.layoutFondo', 'main.layoutAlto', 'main.layoutPosM2', 'main.layoutPosM3', 'main.layoutCarasConsumo', '', ''];
    return `${table(heads, rows, 'layout-ubicaciones')}<div class="layout-vio" id="layout-pos-issues"${vios.length ? '' : ' hidden'}>${vios.slice(0, 6).map((v) => `<p>${esc(posVioText(v))}</p>`).join('')}</div>${count >= POS_ROWS_MAX ? `<p class="layout-muted">${esc(t('main.layoutPosMuchos').replace('{n}', POS_ROWS_MAX))}</p>` : ''}`;
}
// Al escribir una medida solo se vuelven a pintar las marcas en rojo, el aviso y los m² y m³ de ese renglón (el resto de la tabla se queda: así no se pierde el cursor).
function positionsLive(edited) {
    const box = $('layout-pos-issues');
    if (!box || !state.draft) return;
    const { map: bad, list: vios } = posViolationsAll();
    box.hidden = !vios.length;
    box.innerHTML = vios.slice(0, 6).map((v) => `<p>${esc(posVioText(v))}</p>`).join('');
    const trs = new Map();
    document.querySelectorAll('#layout-panel tr[data-posid]').forEach((tr) => trs.set(tr.getAttribute('data-posid'), tr));
    (state.draft.positions || []).forEach((p) => {
        const tr = trs.get(p.id);
        if (!tr) return;
        const b = bad.get(p.id) || {};
        const mark = (k, on) => { const input = tr.querySelector(`[data-pk="${k}"]`); if (input) input.classList.toggle('layout-missing', !!on); };
        mark('x', b.out); mark('y', b.out); mark('l', b.out || b.overlap); mark('w', b.out || b.overlap); mark('h', b.tall);
        if (edited && edited.id === p.id) {
            const m2 = tr.querySelector('[data-pos-m2]'); if (m2) m2.textContent = fmt(p.l * p.w);
            const m3 = tr.querySelector('[data-pos-m3]'); if (m3) m3.textContent = fmt(p.l * p.w * p.h);
        }
    });
}
// Otra posición en un espacio, junto a la última (a la derecha; si ya no cabe, en una segunda fila). La agrega al borrador y la regresa.
function newPositionIn(sp, n, c) {
    const m = LC.bayMeasures(sp, n, c);
    const items = posBayItems(sp.id, n, c);
    const r2 = (v) => Math.round(v * 100) / 100;
    const right = items.reduce((mx, p) => Math.max(mx, p.x + p.l), 0);
    const l = r2(Math.min(0.4, Math.max(0.1, m.l - right)));
    const fits = right + l <= m.l + 0.005;
    const key = `${sp.id}|${n}|${c}`;
    const next = Math.max((state.draft.posNext && state.draft.posNext[key]) || 0, ...items.map((p) => p.num || 0), 0) + 1;
    const pos = { id: uid('p'), spaceId: sp.id, n, c, num: next, x: fits ? r2(right) : 0, y: fits ? 0 : r2(Math.min(0.5, m.w)), l, w: r2(Math.min(0.5, m.w)), h: r2(Math.min(0.4, m.h)) };
    if (!state.draft.positions) state.draft.positions = [];
    state.draft.positions.push(pos);
    state.draft.posNext = { ...(state.draft.posNext || {}), [key]: next };
    return pos;
}
// La cantidad de posiciones de un espacio (la columna «Posiciones» del paso Espacios): son las que salen en la tabla de Posiciones. Si todas siguen siendo de fábrica, el espacio se parte en esa cantidad de posiciones
// iguales (de izquierda a derecha) que siguen su tamaño; si ya se acomodaron a mano, se agregan al final o se quitan las últimas. Regresa true si algo cambió.
function setPositionCount(space, n, c, raw) {
    if (!state.draft || !canEdit('posiciones') || !canEdit('ubicaciones')) return false; // las posiciones que salen son del paso Posiciones
    const want = Math.max(1, Math.min(LC.LIMITS.slots, Math.round(Number(raw)) || 1));
    const items = posBayItems(space.id, n, c);
    if (want === items.length) return false;
    if (items.every((p) => p.auto === true)) {
        if (!space.bays) space.bays = [];
        let bay = space.bays.find((x) => x.n === n && x.c === c);
        if (!bay) { bay = { n, c }; space.bays.push(bay); }
        if (want > 1) bay.rows = want; else delete bay.rows;
        delete bay.depth;
        if (Object.keys(bay).length <= 2) space.bays = space.bays.filter((x) => x !== bay);
        if (!space.bays.length) delete space.bays;
        // las de fábrica de este espacio se vuelven a generar con la cantidad nueva (LC.ensurePositions, en syncPositions)
        state.draft.positions = (state.draft.positions || []).filter((p) => !(p.spaceId === space.id && p.n === n && p.c === c));
        syncPositions();
        return true;
    }
    if (want > items.length) {
        for (let k = items.length; k < want; k += 1) newPositionIn(space, n, c);
    } else {
        const drop = new Set(items.slice(want).map((p) => p.id));
        state.draft.positions = (state.draft.positions || []).filter((p) => !drop.has(p.id));
    }
    return true;
}
// «+» de un renglón: otra posición en el MISMO espacio, junto a la última. Queda elegida: el croquis la marca.
function addPositionAfter(posId) {
    if (!state.draft || !canEdit('ubicaciones')) return;
    const base = (state.draft.positions || []).find((p) => p.id === posId);
    const sp = base && (state.draft.spaces || []).find((s) => s.id === base.spaceId);
    if (!sp) return;
    const pos = newPositionIn(sp, base.n, base.c);
    clearFilterOf('ubicaciones');
    state.hl = { kind: 'bay', id: sp.id, n: pos.n, c: pos.c, p: pos.num, step: state.focus };
    renderPanel();
    refreshLive();
    markSelectedRow();
    const row = highlightedRow();
    if (row) revealRow(row, 'nearest');
}
$('layout-panel').addEventListener('click', (event) => {
    const add = event.target.closest('[data-pos-add]');
    if (add && !add.disabled) { addPositionAfter(add.getAttribute('data-pos-add')); return; }
    const del = event.target.closest('[data-pos-del]');
    if (del && !del.disabled && state.draft) {
        const gone = (state.draft.positions || []).find((p) => p.id === del.getAttribute('data-pos-del'));
        if (gone && (state.draft.positions || []).filter((p) => p.spaceId === gone.spaceId && p.n === gone.n && p.c === gone.c).length <= 1) return; // un espacio siempre tiene al menos una posición
        state.draft.positions = (state.draft.positions || []).filter((p) => p.id !== del.getAttribute('data-pos-del'));
        if (!state.draft.positions.length) delete state.draft.positions;
        if (gone && state.hl && state.hl.kind === 'bay' && state.hl.id === gone.spaceId && state.hl.n === gone.n && state.hl.c === gone.c && state.hl.p === gone.num) state.hl = { ...state.hl, p: undefined }; // el espacio queda elegido
        renderPanel();
        refreshLive();
    }
});
$('layout-panel').addEventListener('change', (event) => {
    if (event.target.closest('[data-pk]')) renderPanel();
});
$('layout-panel').addEventListener('input', (event) => {
    const input = event.target.closest('[data-pk]');
    if (!input || !state.draft) return;
    const pos = (state.draft.positions || []).find((p) => p.id === input.getAttribute('data-pid'));
    if (!pos) return;
    const k = input.getAttribute('data-pk');
    const v = parseFloat(input.value);
    if (!Number.isFinite(v) || v < 0 || (k !== 'x' && k !== 'y' && v <= 0)) return;
    pos[k] = v;
    delete pos.auto; // ya no es la de fábrica: deja de seguir el tamaño de su espacio
    positionsLive(pos);
    refreshLive();
});

// Caras de consumo: las 4 caras de un activo, un nivel o un espacio como botones que se prenden y se apagan. up = las caras que tiene lo que lo contiene (las demás no se pueden prender); stored = ya cambió las suyas.
function facesCellHtml(kind, i, n, c, now, up, stored, dis, pid = '') {
    const buttons = LC.FACES.map((f) => {
        const on = now.includes(f);
        const allowed = !up || up.includes(f);
        const bad = on && !allowed;
        return `<button type="button" class="layout-face${on ? ' on' : ''}${bad ? ' bad' : ''}" data-face="${f}" data-fk="${kind}" data-i="${i}" data-n="${n || 0}" data-c="${c || 0}" data-pid="${esc(pid)}" aria-pressed="${on}" title="${esc(t(`main.layoutCara_${f}`))}"${dis || (!allowed && !on) ? ' disabled' : ''}>${esc(t(`main.layoutCaraCorta_${f}`))}</button>`;
    }).join('');
    return `<td><span class="layout-faces${stored ? ' layout-edited' : ''}" role="group" data-help-key="layoutCarasConsumo">${buttons}</span></td>`;
}
// El frente de un activo: sale solo del pasillo principal y se puede cambiar a mano. Los lados son los del croquis sin girar.
function frontCellHtml(s, i, dis) {
    const sideName = (side) => t(`main.layoutLado_${side}`);
    const auto = LC.activoFront(state.draft, { ...s, front: undefined });
    const options = ['N', 'S', 'W', 'E'].map((k) => `<option value="${k}"${s.front === k ? ' selected' : ''}>${esc(sideName(k))}</option>`).join('');
    return `<td><select data-front="${i}" data-help-key="layoutFrenteActivo"${s.front ? ' class="layout-edited"' : ''}${dis ? ' disabled' : ''}><option value=""${s.front ? '' : ' selected'}>${esc(t('main.layoutFrenteAuto', { side: sideName(auto.side).toLowerCase() }))}</option>${options}</select>${turnButtonHtml(s, i, dis)}</td>`;
}
// «Girar 90°» (2026-11-13): un activo que viene de Alta Activos trae sus medidas fijas del registro; para acomodarlo (por ejemplo de pie en una huella angosta) se gira un cuarto de vuelta a la derecha: su largo y su fondo se intercambian en el croquis y
// su frente gira con él. Ver LayoutCalc.turnAssetSpace.
function turnButtonHtml(s, i, dis) {
    if (!s.assetRef) return '';
    const turns = (Number(s.rot) || 0) * 90;
    const label = turns ? t('main.layoutGirarActivoGirado', { grados: turns }) : t('main.layoutGirarActivo');
    return `<button type="button" class="layout-turn-btn${turns ? ' on' : ''}" data-turn="${i}" data-help-key="layoutGirarActivo" aria-label="${esc(label)}" title="${esc(label)}"${dis ? ' disabled' : ''}><i class="bx bx-rotate-right" aria-hidden="true"></i></button>`;
}
function turnSpace(i) {
    if (!state.draft || !canEdit('activos')) return;
    const space = state.draft.spaces[i];
    if (!space) return;
    const check = LC.canTurnSpace(state.draft, space);
    if (!check.ok) { Dashboard.showToast(t(`main.layoutGirarNo_${check.code}`, { code: space.code, n: check.n }), 'warning'); return; }
    const asset = (state.fixedAssets || []).find((a) => a.id === space.assetRef);
    if (!asset) { Dashboard.showToast(t('main.layoutGirarNo_noreg', { code: space.code }), 'warning'); return; }
    // las posiciones acomodadas a mano giran con el activo (se calculan ANTES, con las medidas de ahora)
    const turnedPositions = LC.turnSpacePositions(state.draft, space);
    state.draft.spaces[i] = LC.turnAssetSpace(state.draft, space, asset, { typeKind: asset.typeKind, metric: asset.metric });
    if (Array.isArray(state.draft.positions) && state.draft.positions.length) state.draft.positions = turnedPositions;
    state.draft.spaces = LC.deriveSpaces(state.draft).spaces;
    renderPanel();
    refreshLive();
}
// «la cara trasera» / «las caras frontal, izquierda»
function facesText(list) {
    const names = (list || []).map((f) => t(`main.layoutCaraAdj_${f}`)).join(', ');
    return t((list || []).length === 1 ? 'main.layoutCarasTexto_una' : 'main.layoutCarasTexto_varias', { list: names });
}
// El texto de una falta de medidas o de caras de un activo, en el idioma de la pantalla.
function vioActText(v) {
    if (v.kind === 'facesLevel' || v.kind === 'facesBay') return t(`main.layoutVioAct_${v.kind}`, { ...v.vars, faces: facesText(v.vars.extra), has: facesText(v.vars.up) });
    return t(`main.layoutVioAct_${v.kind}`, v.vars);
}
// Prender o apagar una cara: siempre queda al menos una; en un nivel o un espacio solo se guarda lo que cambia respecto a lo que lo contiene (en el activo, respecto al frente).
function toggleFace(btn) {
    if (!state.draft) return;
    const kind = btn.getAttribute('data-fk');
    const i = Number(btn.getAttribute('data-i'));
    const n = Number(btn.getAttribute('data-n'));
    const c = Number(btn.getAttribute('data-c'));
    const face = btn.getAttribute('data-face');
    const space = state.draft.spaces[i];
    if (!space) return;
    if (kind === 'pos') {
        const pos = (state.draft.positions || []).find((p) => p.id === btn.getAttribute('data-pid'));
        if (!pos) return;
        const nowP = LC.facesOfPosition(space, pos);
        const baseP = LC.facesOfBay(space, pos.n, pos.c);
        const nextP = nowP.includes(face) ? nowP.filter((f) => f !== face) : LC.FACES.filter((f) => f === face || nowP.includes(f));
        if (!nextP.length) return;
        if (nextP.length === baseP.length && nextP.every((f, k) => f === baseP[k])) delete pos.faces; else pos.faces = nextP;
        renderPanel();
        refreshLive();
        return;
    }
    const now = kind === 'space' ? LC.facesOfSpace(space) : (kind === 'lvl' ? LC.facesOfLevel(space, n) : LC.facesOfBay(space, n, c));
    const base = kind === 'space' ? ['front'] : (kind === 'lvl' ? LC.facesOfSpace(space) : LC.facesOfLevel(space, n));
    const next = now.includes(face) ? now.filter((f) => f !== face) : LC.FACES.filter((f) => f === face || now.includes(f));
    if (!next.length) return;
    const store = !(next.length === base.length && next.every((f, k) => f === base[k]));
    if (kind === 'space') {
        if (store) space.faces = next; else delete space.faces;
    } else if (kind === 'lvl') {
        if (!space.lvls) space.lvls = [];
        let lv = space.lvls.find((l) => l.n === n);
        if (!lv) { lv = { n }; space.lvls.push(lv); }
        if (store) lv.faces = next; else delete lv.faces;
        if (Object.keys(lv).length <= 1) space.lvls = space.lvls.filter((l) => l !== lv);
        if (!space.lvls.length) delete space.lvls;
    } else {
        if (!space.bays) space.bays = [];
        let bay = space.bays.find((b) => b.n === n && b.c === c);
        if (!bay) { bay = { n, c }; space.bays.push(bay); }
        if (store) bay.faces = next; else delete bay.faces;
        if (Object.keys(bay).length <= 2) space.bays = space.bays.filter((b) => b !== bay);
        if (!space.bays.length) delete space.bays;
    }
    renderPanel();
    refreshLive();
}
$('layout-panel').addEventListener('click', (event) => {
    const btn = event.target.closest('button.layout-face');
    if (btn && !btn.disabled) toggleFace(btn);
    const turn = event.target.closest('button[data-turn]');
    if (turn && !turn.disabled) turnSpace(Number(turn.getAttribute('data-turn')));
});
$('layout-panel').addEventListener('change', (event) => {
    const sel = event.target.closest('select[data-front]');
    if (!sel || !state.draft) return;
    const space = state.draft.spaces[Number(sel.getAttribute('data-front'))];
    if (!space) return;
    if (sel.value) space.front = sel.value; else delete space.front;
    renderPanel();
    refreshLive();
});
function pressStep(step) {
    if (!stepOn(step)) { showStep(step); return; }
    if (state.focus !== step) { focusStep(step); return; }
    if (state.steps.length < 2) {
        // siempre queda al menos un paso: al apagar la última opción encendida se regresa a «Contorno» (el punto de partida) como la única seleccionada
        const base = stepVisible('contorno') ? 'contorno' : SECTION_ORDER.find(stepVisible);
        if (base && step !== base) { state.steps = [base]; state.focusStack = [base]; focusStep(base); }
        return;
    }
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
    if (state.draft) { syncWallItems(); syncHuellas(); state.draft.spaces = LC.deriveSpaces(state.draft).spaces; syncPositions(); computeFootprintIssues(); computeSpaceIssues(); computeTransitIssues(); }
    const keepTops = panelScrollStep === state.focus ? panelScrollers().map((el) => [el.scrollTop, el.scrollLeft]) : []; // lo que se había bajado y lo que se había corrido a la derecha
    ensureVisibleSteps();
    const tabs = SECTION_ORDER.filter(stepVisible).map((s) => `<button type="button" role="button" aria-pressed="${stepOn(s)}" aria-current="${s === state.focus}" class="layout-step${stepOn(s) ? ' active' : ''}${s === state.focus ? ' focus' : ''}" data-step="${s}">${esc(t(SECTION_LABEL_KEYS[s]))}</button>`).join('');
    const s = state.focus;
    const isLocators = INFO_STEPS.includes(s); // estos pasos no editan nada: no llevan candado
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
    // «Relación Código»: igual que Localizadores. Al tocar el nombre se ve aquí abajo la relación de códigos de este Layout (solo consulta); la flechita de su lado abre la pantalla Relación Código ya filtrada a lo que se ve
    // (un localizador, el Localizador elegido o todo). El nombre sale con la hoja Códigos en Localizadores; la flechita, además, con el acceso a la pantalla Relación Código.
    const relationArrow = hasRelationScreen()
        ? `<a class="layout-step-arrow" href="${esc(relationUrl(''))}" data-rel-shortcut data-help-key="layoutRelacionLink" aria-label="${esc(t('main.layoutRelacionIr'))}" title="${esc(t('main.layoutRelacionIr'))}"><i class="bx bx-link-external" aria-hidden="true"></i></a>`
        : '';
    const relationLink = state.perms && state.perms.canSeeLocatorCodes
        ? `<span class="layout-step layout-step-split${stepOn('relacion') ? ' active' : ''}${state.focus === 'relacion' ? ' focus' : ''}"><button type="button" class="layout-step-main" aria-pressed="${stepOn('relacion')}" aria-current="${state.focus === 'relacion'}" data-step="relacion" data-help-key="layoutRelacionPaso">${esc(t('main.layoutRelacionCodigoLink'))}</button>${relationArrow}</span>`
        : '';
    const allOn = SECTION_ORDER.filter(stepVisible).every((x) => stepOn(x));
    const allPill = `<button type="button" role="button" aria-pressed="${allOn}" class="layout-step layout-step-all${allOn ? ' active' : ''}" data-step-all data-help-key="layoutFxTodo">${esc(t('main.layoutFxTodo'))}</button>`;
    $('layout-panel').innerHTML = `<div class="layout-steps" role="group" data-help-key="layoutSteps">${allPill}${tabs}${locatorsLink}${relationLink}</div>${section}`;
    // Los botones de agregar del paso suben a la fila del título, pegados a la derecha (siguen siendo los mismos botones: el clic se atiende igual).
    const headActions = document.querySelector('#layout-panel .layout-head-actions');
    if (headActions) document.querySelectorAll('#layout-panel [data-main-add]').forEach((btn) => headActions.appendChild(btn));
    panelScrollers().forEach((el, i) => { const [top, left] = keepTops[i] || [0, 0]; el.scrollTop = panelScrollEnd ? el.scrollHeight : top; el.scrollLeft = left; });
    panelScrollEnd = false;
    panelScrollStep = state.focus;
    if (state.mode === 'edit') renderViewStrip(); // Qué ver (la franja) sigue a los pasos encendidos
    bindLayoutFilters();
    markSelectedRow();
    if (state.draft) { applyFootprintMarks(); applyActivoMarks(); applyTransitMarks(); applySafetyMarks(); applyCeilingMarks(); applyRoofMarks(); applyWallItemMarks(); }
    applyFindToTables();
}

// ---- resaltado de lo elegido ------------------------------------------------------------------------------------------
// Al tocar un renglón de las tablas de Zonas, Pisos, Huella-Espacio, Activos o Posiciones, lo que ese renglón es se marca en el croquis (contorno naranja y lo demás atenuado) y el renglón queda marcado en la
// tabla: así, al editar, no se confunde de cuál zona, activo, huella o hueco se trata. Una posición es un hueco dentro de un anaquel y el croquis lo ve desde arriba: se marca el anaquel y se escribe el
// nivel y la columna. Es solo de pantalla (no cambia lo guardado ni la hoja que se descarga) y no hace falta redibujar el croquis: se pone y se quita sobre el dibujo que ya está.
const HL_ROW_SELECTOR = '#layout-panel .layout-table tbody tr';
// Sube o baja la tabla hasta que el renglón se vea SIN correrla a los lados: scrollIntoView también la regresaba a la izquierda (el renglón es más ancho que la pantalla), y al tocar una opción de un renglón
// (Atrás, Der.…) la barra desplazadora volvía al inicio.
function revealRow(row, block) {
    const scroller = row.closest('.layout-scroll');
    const left = scroller ? scroller.scrollLeft : 0;
    row.scrollIntoView({ block });
    if (scroller) scroller.scrollLeft = left;
}
function rowEntity(tr) {
    // paso Posiciones: el renglón es una posición (de su espacio): se marca el espacio y la posición en el croquis y en el 3D
    const posId = tr.getAttribute('data-posid');
    if (posId && state.draft) {
        const p = (state.draft.positions || []).find((x) => x.id === posId);
        return p && (state.draft.spaces || []).some((s) => s.id === p.spaceId) ? { kind: 'bay', id: p.spaceId, n: p.n, c: p.c, p: p.num } : null;
    }
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
    if (list === 'floors' && (state.draft.floors || [])[i]) return { kind: 'floor', id: state.draft.floors[i].id };
    if (list === 'ramps' && (state.draft.ramps || [])[i]) return { kind: 'floor', id: state.draft.ramps[i].id };
    if (list === 'footprints' && state.draft.footprints[i]) return { kind: 'footprint', id: state.draft.footprints[i].id };
    if (list === 'spaces' && state.draft.spaces[i]) return { kind: 'space', id: state.draft.spaces[i].id };
    // las paredes (paso Paredes) y las columnas, desniveles y otros obstáculos (paso Contorno) también se marcan en el croquis al elegir su renglón
    if (list === 'obstacles' && state.draft.obstacles[i]) return { kind: 'obstacle', id: state.draft.obstacles[i].id };
    if (list === 'doors' && (state.draft.doors || [])[i]) return { kind: 'door', id: state.draft.doors[i].id };
    if (list === 'power' && (state.draft.power || [])[i]) return { kind: 'power', id: state.draft.power[i].id };
    if (list === 'sensors' && (state.draft.sensors || [])[i]) return { kind: 'sensor', id: state.draft.sensors[i].id };
    if (list === 'safety' && (state.draft.safety || [])[i]) return { kind: 'safety', id: state.draft.safety[i].id };
    if (list === 'ceiling' && (state.draft.ceiling || [])[i]) return { kind: 'ceiling', id: state.draft.ceiling[i].id };
    if (list === 'roofs' && (state.draft.roofs || [])[i]) return { kind: 'roof', id: state.draft.roofs[i].id };
    if (list === 'transit' && (state.draft.transit || [])[i]) return { kind: 'transit', id: state.draft.transit[i].id };
    if (list === 'objects' && (state.draft.objects || [])[i]) return { kind: 'object', id: state.draft.objects[i].id };
    if (list === 'lvl' && state.draft.spaces[i]) return { kind: 'space', id: state.draft.spaces[i].id, n: Number(ctl.getAttribute('data-n')) };
    if (list === 'bay' && state.draft.spaces[i]) return { kind: 'bay', id: state.draft.spaces[i].id, n: Number(ctl.getAttribute('data-n')), c: Number(ctl.getAttribute('data-c')) };
    return null;
}
// El resaltado que deja el botón «Localizador» (hl.loc) vive en el paso de su renglón (Posiciones, Niveles…), pero lo elegido es el mismo al pasar a Localizadores o Relación Código (pasos de solo consulta): ahí también
// se sigue viendo y enfocando solo lo elegido, no el activo entero.
const hlOnStep = (h) => !!h && (h.step === state.focus || (!!h.loc && INFO_STEPS.includes(state.focus)));
const sameHighlight = (a, b) => !!a && !!b && a.kind === b.kind && a.id === b.id && a.n === b.n && a.c === b.c && a.p === b.p && a.step === b.step;
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
    else if (state.focus === 'localizadores' && locAny()) {
        // en el paso Localizadores el renglón elegido es el del localizador que se lleva marcado
        const code = locCode().replace(/\s\+\d+$/, '');
        const row = Array.from(document.querySelectorAll('#layout-panel tr[data-locator]')).find((r) => r.getAttribute('data-locator') === code);
        if (row) row.classList.add('layout-row-sel');
    }
}
// Al elegir un sensor (paso Sensores) las zonas que MIDE se marcan muy tenue en el croquis (un tinte suave con el borde punteado), aunque el paso Zonas esté apagado: así se ve qué zonas quedan cubiertas, no solo dónde está
// el sensor. Se arma con la geometría del último dibujo (view) y se quita junto con el resto del resaltado (lleva la clase hl-shape).
function drawSensorZones(svg, sensorId) {
    const sensor = (state.draft.sensors || []).find((n) => n.id === sensorId);
    if (!sensor || !view || view.x0 === undefined) return;
    const L = view.rot ? LC.rotateLayout(state.draft, view.rot) : state.draft;
    const ids = new Set(LC.sensorZoneIds(sensor));
    (L.zones || []).filter((z) => ids.has(z.id) && z.active !== false).forEach((z) => {
        const pts = LC.zonePoints(z);
        if (!pts || pts.length < 3) return;
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('class', 'hl-shape hl-zone-measured');
        poly.setAttribute('points', pts.map((p) => `${(view.ox + (p[0] - view.x0) * view.sc).toFixed(1)},${(view.oy + (p[1] - view.y0) * view.sc).toFixed(1)}`).join(' '));
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${sensor.code || ''} · ${t('main.layoutSensorZonasMide')}: ${z.name || ''}`;
        poly.appendChild(title);
        svg.appendChild(poly);
    });
}
// Las posiciones en el croquis: al enfocar un nivel, un espacio o una posición (el renglón de Niveles o de Espacios, el botón Localizador o el paso Posiciones) se dibuja, encima del activo, la distribución de ESE nivel:
// cada espacio con sus posiciones (P001…) y lo elegido marcado. En planta los niveles quedan uno sobre otro, por eso solo se ve el que se enfocó. Es solo de pantalla: no cambia nada de lo guardado.
// Lo resaltado en el croquis: una cosa (el renglón elegido de una tabla) o varias (los niveles, espacios o posiciones que marcó el Localizador, en state.hlList).
function highlightedList() {
    const h = state.hl;
    if (!h) return [];
    return h.loc && Array.isArray(state.hlList) && state.hlList.length ? state.hlList : [h];
}
// Con el paso Posiciones encendido y nada elegido, el croquis plano dibuja las posiciones (nivel 1: en planta los niveles quedan uno sobre otro) de todos los anaqueles que se ven; lo macizo (tarima, gabinete, cámara) no lleva.
function ambientPositionTargets() {
    const d = state.draft;
    if (!d || !stepOn('ubicaciones')) return [];
    const fv = findView(d);
    const only = fv.dimmed ? findIds().spaces : null;
    return (fv.d.spaces || []).filter((s) => s.active !== false && s.l > 0 && s.d > 0 && s.type !== 'pallet' && s.type !== 'cabinet' && s.type !== 'cold' && (!only || only.has(s.id))).map((s) => ({ id: s.id, n: 1, c: 0, p: 0, ambient: true }));
}
function positionsOverlayTargets() {
    if (!state.draft) return [];
    const h = state.hl;
    if (!hlOnStep(h)) return ambientPositionTargets();
    return highlightedList().filter((e) => e.kind === 'bay' || e.kind === 'space').map((e) => ({ id: e.id, n: e.n || 0, c: e.kind === 'bay' ? e.c : 0, p: e.p || 0 }));
}
function drawPositionsOverlay() {
    const svg = $('layout-svg');
    if (!svg) return;
    svg.querySelectorAll('.pos-ov').forEach((n) => n.remove());
    const targets = positionsOverlayTargets();
    if (!targets.length || !view || view.x0 === undefined) return;
    const q = ((Math.round(Number(view.rot) || 0) % 4) + 4) % 4;
    // el croquis puede estar girado (cuartos de vuelta): se gira igual que LayoutCalc.rotateLayout
    const turn = (x, y) => (q === 1 ? [-y, x] : (q === 2 ? [-x, -y] : (q === 3 ? [y, -x] : [x, y])));
    const box = (x, y, w, d) => {
        const a = turn(x, y);
        const b2 = turn(x + w, y + d);
        return { x: view.ox + (Math.min(a[0], b2[0]) - view.x0) * view.sc, y: view.oy + (Math.min(a[1], b2[1]) - view.y0) * view.sc, w: Math.abs(b2[0] - a[0]) * view.sc, h: Math.abs(b2[1] - a[1]) * view.sc };
    };
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'pos-ov');
    g.setAttribute('pointer-events', 'none');
    const add = (tag, attrs, text) => {
        const el = document.createElementNS(NS, tag);
        Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
        if (text !== undefined) el.textContent = text;
        g.appendChild(el);
    };
    const f1 = (v) => v.toFixed(1);
    const spt = (px, py) => { const a = turn(px, py); return [view.ox + (a[0] - view.x0) * view.sc, view.oy + (a[1] - view.y0) * view.sc]; };
    // Las piezas de UNA capa dentro de su posición, vistas desde arriba (las celdas vienen en cm desde la esquina del fondo-izquierda de la posición), con su rótulo «27 · 324 pz» y, punteada, la franja que sobra de fondo.
    // x0, y0 = esquina de la posición en el plano (m) y pw, pd = lo que mide (m); r = su cuadro en pantalla.
    const drawPieces = (pc, x0, y0, pw, pd, r) => {
        const fx = pw / pc.box.l;
        const fy = pd / pc.box.w;
        const cls = `lv${Math.min(pc.level, 2)}`;
        const k = view.sc * fx;
        pc.cells.forEach((cell) => {
            if (cell.r) {
                const [cx, cy] = spt(x0 + cell.cx * fx, y0 + cell.cy * fy);
                add('circle', { class: `pos-ov-pc ${cls}`, cx: f1(cx), cy: f1(cy), r: f1(Math.max(cell.r * k - 0.15, 0.3)) });
            } else {
                const a = spt(x0 + cell.x * fx, y0 + cell.y * fy);
                const b2 = spt(x0 + (cell.x + cell.l) * fx, y0 + (cell.y + cell.w) * fy);
                add('rect', { class: `pos-ov-pc ${cls}`, x: f1(Math.min(a[0], b2[0]) + 0.2), y: f1(Math.min(a[1], b2[1]) + 0.2), width: f1(Math.max(Math.abs(b2[0] - a[0]) - 0.4, 0.2)), height: f1(Math.max(Math.abs(b2[1] - a[1]) - 0.4, 0.2)) });
            }
        });
        if (pc.leftD > 0.5) {
            const a = spt(x0, y0 + (pc.box.w - pc.leftD) * fy);
            const b2 = spt(x0 + pw, y0 + pd);
            const sx = Math.min(a[0], b2[0]); const sy = Math.min(a[1], b2[1]); const sw = Math.abs(b2[0] - a[0]); const sh = Math.abs(b2[1] - a[1]);
            add('rect', { class: 'pos-ov-free', x: f1(sx), y: f1(sy), width: f1(sw), height: f1(sh) });
            if (sh >= 7 && sw >= 40) add('text', { class: 'pos-ov-pt', x: f1(sx + sw / 2), y: f1(sy + sh / 2 + 1.8), 'text-anchor': 'middle' }, t('main.layoutPcSobraFondo', { d: pc.leftD }));
        }
        if (r.w >= 34 && r.h >= 16) add('text', { class: 'pos-ov-pt', x: f1(r.x + r.w / 2), y: f1(r.y + r.h - 2.5), 'text-anchor': 'middle' }, `${pc.count} · ${pc.capacity} ${t('main.relPackPz')}`);
    };
    // lo marcado se junta por activo y nivel: cada nivel se dibuja una vez, con todo lo marcado en él
    const canDragBays = state.mode === 'edit' && state.focus === 'posiciones' && canEdit('posiciones');
    const canDragPos = state.mode === 'edit' && state.focus === 'ubicaciones' && canEdit('ubicaciones'); // en el paso Posiciones cada posición se arrastra dentro de su espacio
    const bayColors = stepOn('posiciones') && !!window.LayoutMapSvg && !!LC.bayFmtOf; // con el paso Espacios encendido, cada número de espacio lleva su color y su trama
    let paintSeq = 0;
    const groups = new Map();
    targets.forEach((tg) => {
        const key = `${tg.id}|${tg.n}`;
        if (!groups.has(key)) groups.set(key, { id: tg.id, n: tg.n, items: [] });
        groups.get(key).items.push(tg);
    });
    groups.forEach((grp) => {
        const s = (state.draft.spaces || []).find((x) => x.id === grp.id);
        if (!s || s.active === false || !(s.l > 0) || !(s.d > 0)) return;
        const ambient = grp.items.every((it) => it.ambient); // las que dibuja el paso encendido (sin elegir nada): sin flechas de consumo ni arrastre
        const lv = grp.n ? Math.min(Math.max(1, Number(grp.n) || 1), s.levels || 1) : 0;
        const slots = lv ? LC.levelSlots(s, lv) : 0;
        const rcs = slots ? LC.levelBayRects(s, lv) : []; // cada espacio donde cae de verdad: su largo y su fondo propios, uno junto al otro
        const slotW = slots ? s.l / slots : s.l; // cada espacio ocupa su pedazo del largo del activo (como en el 3D); sus posiciones se acomodan dentro con las medidas del espacio
        const dirs = LC.faceVectors((LC.activoFront(state.draft, s) || {}).side);
        const specific = grp.items.some((it) => it.c);
        // por dónde se consume lo marcado: el activo o el nivel (sin espacio marcado), un espacio o una posición; con lo demás oculto no se ve el pasillo
        const faceJobs = [];
        if (!ambient && grp.items.some((it) => !it.c)) faceJobs.push({ r: { x: s.x, y: s.y, w: s.l, d: s.d }, faces: lv ? LC.facesOfLevel(s, lv) : LC.facesOfSpace(s) });
        for (let c = 1; c <= slots; c += 1) {
            const m = LC.bayMeasures(s, lv, c);
            const rc = rcs[c - 1];
            const kx = rc.l / Math.max(m.l, 0.01);
            const kz = rc.w / Math.max(m.w, 0.01);
            const sel = grp.items.some((it) => it.c === c);
            const dim = specific && !sel ? ' dim' : '';
            const fr = box(s.x + rc.x, s.y + rc.y, rc.l, rc.w);
            if (bayColors) {
                const paint = window.LayoutMapSvg.zonePaint(`pbay${paintSeq += 1}`, LC.bayFmtOf(state.draft, c));
                const pts = `${f1(fr.x)},${f1(fr.y)} ${f1(fr.x + fr.w)},${f1(fr.y)} ${f1(fr.x + fr.w)},${f1(fr.y + fr.h)} ${f1(fr.x)},${f1(fr.y + fr.h)}`;
                g.insertAdjacentHTML('beforeend', `<g opacity="${dim ? '0.25' : '0.75'}">${paint.markup(pts)}</g>`);
                if (fr.w >= 24 && fr.h >= 12) add('text', { class: `pos-ov-t${dim}`, x: f1(fr.x + 3), y: f1(fr.y + 9), 'text-anchor': 'start' }, `E${ubicPad(c)}`);
            }
            add('rect', { class: `pos-ov-bay${sel ? ' sel' : ''}${dim}`, x: f1(fr.x), y: f1(fr.y), width: f1(fr.w), height: f1(fr.h) });
            // en Editar y en el paso Espacios el espacio se arrastra con el dedo o el mouse (sin salirse del activo)
            if (canDragBays && !ambient) add('rect', { class: 'pos-ov-hit', 'data-bayhit': `${s.id}|${lv}|${c}`, x: f1(fr.x), y: f1(fr.y), width: f1(fr.w), height: f1(fr.h), fill: 'transparent', 'pointer-events': 'all', style: 'cursor:move' });
            if (grp.items.some((it) => it.c === c && !it.p)) faceJobs.push({ r: { x: s.x + rc.x, y: s.y + rc.y, w: rc.l, d: rc.w }, faces: LC.facesOfBay(s, lv, c) });
            LC.positionsOfBay(state.draft, s.id, lv, c).forEach((p) => {
                const r = box(s.x + rc.x + p.x * kx, s.y + rc.y + p.y * kz, p.l * kx, p.w * kz);
                const chosen = grp.items.some((it) => it.c === c && it.p === p.num);
                if (chosen) faceJobs.push({ r: { x: s.x + rc.x + p.x * kx, y: s.y + rc.y + p.y * kz, w: p.l * kx, d: p.w * kz }, faces: LC.facesOfPosition(s, p) });
                add('rect', { class: `pos-ov-pos${chosen ? ' chosen' : ''}${dim}`, x: f1(r.x), y: f1(r.y), width: f1(Math.max(r.w, 1)), height: f1(Math.max(r.h, 1)) });
                if (canDragPos && !ambient) add('rect', { class: 'pos-ov-hit', 'data-poshit': p.id, x: f1(r.x), y: f1(r.y), width: f1(Math.max(r.w, 1)), height: f1(Math.max(r.h, 1)), fill: 'transparent', 'pointer-events': 'all', style: 'cursor:move' });
                const piece = piecesVisible() ? pieceAt(s.id, lv, c, p.num) : null;
                if (piece && Array.isArray(piece.cells)) drawPieces(piece, s.x + rc.x + p.x * kx, s.y + rc.y + p.y * kz, p.l * kx, p.w * kz, r);
                if (r.w >= 17 && r.h >= 8) add('text', { class: `pos-ov-t${dim}`, x: f1(r.x + r.w / 2), y: f1(r.y + r.h / 2 + 2.5), 'text-anchor': 'middle' }, `P${ubicPad(p.num)}`);
            });
        }
        faceJobs.forEach((job) => {
            job.faces.forEach((face) => {
                const v = dirs[face];
                if (!v) return;
                const x0 = job.r.x; const y0 = job.r.y; const x1 = job.r.x + job.r.w; const y1 = job.r.y + job.r.d;
                const seg = v[0] > 0 ? [[x1, y0], [x1, y1]] : (v[0] < 0 ? [[x0, y0], [x0, y1]] : (v[1] > 0 ? [[x0, y1], [x1, y1]] : [[x0, y0], [x1, y0]]));
                const a = spt(seg[0][0], seg[0][1]);
                const b2 = spt(seg[1][0], seg[1][1]);
                add('line', { class: 'pos-ov-face', x1: f1(a[0]), y1: f1(a[1]), x2: f1(b2[0]), y2: f1(b2[1]) });
                const dv = turn(v[0], v[1]);
                const len = Math.hypot(dv[0], dv[1]) || 1;
                const ux = dv[0] / len; const uy = dv[1] / len;
                const cx = (a[0] + b2[0]) / 2; const cy = (a[1] + b2[1]) / 2;
                add('polygon', { class: 'pos-ov-arrow', points: `${f1(cx + ux * 9)},${f1(cy + uy * 9)} ${f1(cx - uy * 5)},${f1(cy + ux * 5)} ${f1(cx + uy * 5)},${f1(cy - ux * 5)}` });
            });
        });
    });
    svg.appendChild(g);
}
// El rótulo del resaltado (el código, en naranja) mantiene su tamaño en pantalla aunque el croquis esté acercado: es texto del dibujo y se agranda con él, así que se encoge en la misma proporción.
function scaleHlTags() {
    const k = zoom.s > 1 ? zoom.s : 1;
    document.querySelectorAll('#layout-svg .hl-tag').forEach((tag) => {
        tag.style.fontSize = `${(9.5 / k).toFixed(3)}px`;
        tag.style.strokeWidth = `${(3 / k).toFixed(3)}px`;
        const ay = Number(tag.getAttribute('data-ay'));
        if (Number.isFinite(ay)) tag.setAttribute('y', (tag.getAttribute('data-above') === '1' ? ay - 5 / k : ay + 12 / k).toFixed(2));
    });
}
let pendingZoom = false; // se eligió algo desde el buscador o el Localizador con el 3D abierto: al volver al croquis se acerca a eso
// reveal = true cuando se acaba de elegir el renglón: si el croquis está acercado y lo elegido queda fuera de lo que se ve, se recorre para mostrarlo.
function applyHighlight(reveal) {
    applyHighlight3d();
    const svg = $('layout-svg');
    svg.querySelectorAll('.hl-shape, .hl-tag').forEach((n) => n.remove());
    svg.querySelectorAll('.hl-on').forEach((n) => n.classList.remove('hl-on'));
    svg.classList.remove('has-hl', 'hl-soft-mode');
    drawPositionsOverlay();
    const h = state.hl;
    if (!hlOnStep(h) || !state.draft) return;
    if (h.kind === 'sensor') drawSensorZones(svg, h.id);
    // una huella se ve como todos sus activos juntos (uno solo es la huella entera); un activo o un hueco, como su propio dibujo
    const HL_ATTR = { zone: 'data-zid', footprint: 'data-fid', obstacle: 'data-obid', safety: 'data-sfid', ceiling: 'data-clid', roof: 'data-rfid', transit: 'data-tid', object: 'data-oid', door: 'data-did', power: 'data-pid', sensor: 'data-nid', side: 'data-sin-figura', corner: 'data-sin-figura', floor: 'data-sin-figura' };
    // un elemento de seguridad, un objeto, una puerta, una conexión de luz o un sensor son figuras sueltas (línea, símbolo, giro, etiqueta): su contorno sale de un cuadro invisible que se dibuja junto a ellos
    const BOX_KINDS = ['safety', 'ceiling', 'roof', 'object', 'door', 'power', 'sensor', 'side', 'corner', 'floor'];
    // lo resaltado es una cosa (el renglón elegido) o varias (lo que marcó el Localizador: varios activos de una huella, varios niveles, espacios o posiciones); cada una se contornea una sola vez
    const entries = [];
    highlightedList().forEach((e) => { if (!entries.some((x) => x.kind === e.kind && x.id === e.id)) entries.push(e); });
    const parts = entries.map((e) => {
        const els = Array.from(svg.querySelectorAll(`[${HL_ATTR[e.kind] || 'data-sid'}="${CSS.escape(e.id)}"]`));
        const shapes = BOX_KINDS.includes(e.kind)
            ? Array.from(svg.querySelectorAll(`[data-hlbox="${e.kind}:${CSS.escape(e.id)}"]`))
            : els.map((el) => (el.matches('rect, polygon') ? el : el.querySelector('polygon, rect'))).filter(Boolean);
        return { e, els, shapes };
    }).filter((part) => part.shapes.length);
    if (!parts.length) return;
    parts.forEach((part) => part.els.forEach((el) => el.classList.add('hl-on')));
    svg.classList.add('has-hl');
    svg.classList.toggle('hl-soft-mode', !h.strong);
    const bboxOf = (shapes) => {
        const boxes = shapes.map((s) => s.getBBox());
        const x0 = Math.min(...boxes.map((bx) => bx.x));
        const y0 = Math.min(...boxes.map((bx) => bx.y));
        const x1 = Math.max(...boxes.map((bx) => bx.x + bx.width));
        const y1 = Math.max(...boxes.map((bx) => bx.y + bx.height));
        return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    };
    const box = bboxOf(parts.flatMap((part) => part.shapes));
    // Al tocar un renglón: un contorno delgado, punteado y girando (con el grosor de las líneas del dibujo), así se siguen viendo las medidas y qué tan pegada está la figura a las otras. Al tocar la figura en el
    // croquis (strong): dos contornos encimados (uno ancho del color de la hoja y otro naranja) para que se vea sobre cualquier color de zona, en claro y en oscuro.
    parts.forEach((part) => {
        const pb = bboxOf(part.shapes);
        if (part.e.kind === 'object') addObjectDisc(svg, pb, 'hl-shape');
        (h.strong ? ['hl-under', 'hl-ring'] : ['hl-soft']).forEach((cls) => {
            let ring;
            if (part.e.kind === 'footprint') {
                ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                ring.setAttribute('x', pb.x); ring.setAttribute('y', pb.y); ring.setAttribute('width', pb.width); ring.setAttribute('height', pb.height);
            } else {
                ring = part.shapes[0].cloneNode(false);
                ['class', 'style', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'mask', 'filter', 'data-zid', 'data-sid', 'data-fid', 'data-obid', 'data-tid', 'data-hlbox', 'data-did', 'data-pid', 'data-nid', 'id'].forEach((a) => ring.removeAttribute(a));
            }
            // una pared, una columna o un lado del contorno es delgado: su contorno de resaltado es más grueso para que se vea
            ring.setAttribute('class', `hl-shape ${cls}${part.e.kind === 'obstacle' || part.e.kind === 'side' ? ' hl-obs' : ''}`);
            svg.appendChild(ring);
        });
    });
    if (h.kind === 'bay' || h.loc) {
        const tag = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tag.setAttribute('class', 'hl-tag');
        tag.setAttribute('text-anchor', 'middle');
        tag.setAttribute('x', (box.x + box.width / 2).toFixed(1));
        const above = box.y >= 14;
        tag.setAttribute('data-ay', (above ? box.y : box.y + box.height).toFixed(1));
        tag.setAttribute('data-above', above ? '1' : '0');
        tag.textContent = h.loc || `${t('main.layoutPosNivel')} ${h.n} · ${t('main.layoutPosColumna')} ${h.c}`;
        svg.appendChild(tag);
        scaleHlTags();
    }
    // Con el 3D abierto el croquis está escondido (sin medidas): no se acerca ahora, se acerca al volver al 2D (pendingZoom).
    if (!svg.getBoundingClientRect().width) {
        if (reveal === 'zoom') pendingZoom = true;
        return;
    }
    // reveal === 'zoom' (se eligió desde el buscador): el croquis se acerca para que la figura (o todo lo marcado) ocupe más o menos un tercio de lo que se ve, centrada (solo si la cuenta puede acercar)
    if (reveal === 'zoom' && canZoomMap()) {
        zoom.s = Math.min(ZOOM_MAX, Math.max(1.5, Math.min(MAP_W / (Math.max(box.width, 24) * 3), MAP_H / (Math.max(box.height, 24) * 3))));
        zoom.x = box.x + box.width / 2 - MAP_W / zoom.s / 2;
        zoom.y = box.y + box.height / 2 - MAP_H / zoom.s / 2;
        applyZoom();
    } else if (reveal && zoom.s > 1.001) {
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
    fxAfterSelect();
}
// Tocar una figura del croquis (sin arrastrarla) la elige: se marca su renglón en la tabla y la figura se resalta con el contorno grueso de siempre; volver a tocarla la regresa al contorno punteado. Solo cuenta
// el paso que se está editando: en Zonas las zonas, en Huella-Espacio las huellas y en Activos los activos.
// Qué se puede elegir tocando el croquis en cada paso: solo las figuras de lo que ese paso edita (en Paredes solo paredes, en Pisos solo pisos, en Activos solo activos…). Aunque haya otra cosa encima (la
// losa de la nave, una zona) o la figura sea una línea delgada (una pared de 20 cm mide 2 píxeles), se elige la figura del paso más cercana al toque (a menos de 7 píxeles) y, entre las que lo contienen, la más chica.
const MAP_PICK_SEL = { zonas: '[data-zid]', espacios: '[data-fid]', activos: '[data-sid]', paredes: '[data-obid]', obstaculos: '[data-obid]', puertas: '[data-did]', luz: '[data-pid]', sensores: '[data-nid]', seguridad: '[data-sfid]', techos: '[data-clid], [data-rfid]', transito: '[data-tid]', objetos: '[data-oid]', pisos: '[data-flid]', rampas: '[data-flid]' };
const MAP_PICK_PX = 7;
function stepPickable(el) {
    const d = state.draft;
    const ob = el.getAttribute('data-obid');
    if (ob) { const o = (d.obstacles || []).find((x) => x.id === ob); return !!o && (state.focus === 'paredes' ? o.kind === 'wall' : o.kind !== 'wall'); }
    const fl = el.getAttribute('data-flid');
    if (fl) { const f = LC.floorsAll(d).find((x) => x.id === fl); return !!f && (state.focus === 'rampas') === !!f.isRamp; }
    return true;
}
function pickStepElement(x, y) {
    const sel = MAP_PICK_SEL[state.focus];
    const svg = $('layout-svg');
    if (state.mode !== 'edit' || !sel || !svg || !state.draft) return null; // en Ver no se elige lo de un paso (el paso que quedó de Editar no cuenta)
    let best = null;
    svg.querySelectorAll(sel).forEach((el) => {
        if (el.closest('defs') || !stepPickable(el)) return;
        const r = el.getBoundingClientRect();
        if (!(r.width >= 0 && r.height >= 0) || (r.width === 0 && r.height === 0)) return;
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        const dist = Math.hypot(dx, dy);
        if (dist > MAP_PICK_PX) return;
        const area = r.width * r.height;
        if (!best || dist < best.dist - 0.5 || (Math.abs(dist - best.dist) <= 0.5 && area < best.area)) best = { el, dist, area };
    });
    return best ? best.el : null;
}
function selectFromMap(target, point) {
    if (state.mode !== 'edit') return; // elegir tocando el croquis es de Editar: en Ver no se marca nada (el paso que quedó de Editar no cuenta)
    // primero lo del paso que se edita más cercano al toque; si no hay, lo que está justo debajo (el contorno: sus lados y esquinas)
    const el = (point && state.draft ? pickStepElement(point.x, point.y) : null) || (target && target.closest ? target.closest('[data-zid], [data-sid], [data-fid], [data-obid], [data-sfid], [data-clid], [data-rfid], [data-tid], [data-oid], [data-did], [data-pid], [data-nid], [data-sideid], [data-cornerid]') : null);
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
    else if ((state.focus === 'pisos' || state.focus === 'rampas') && el.getAttribute('data-flid')) next = { kind: 'floor', id: el.getAttribute('data-flid') };
    else if (state.focus === 'activos' && el.getAttribute('data-sid')) next = { kind: 'space', id: el.getAttribute('data-sid') };
    else if (state.focus === 'seguridad' && el.getAttribute('data-sfid')) next = { kind: 'safety', id: el.getAttribute('data-sfid') };
    else if (state.focus === 'techos' && el.getAttribute('data-clid')) next = { kind: 'ceiling', id: el.getAttribute('data-clid') };
    else if (state.focus === 'techos' && el.getAttribute('data-rfid')) next = { kind: 'roof', id: el.getAttribute('data-rfid') };
    else if (state.focus === 'transito' && el.getAttribute('data-tid')) next = { kind: 'transit', id: el.getAttribute('data-tid') };
    else if (state.focus === 'objetos' && el.getAttribute('data-oid')) next = { kind: 'object', id: el.getAttribute('data-oid') };
    else if (state.focus === 'puertas' && el.getAttribute('data-did')) next = { kind: 'door', id: el.getAttribute('data-did') };
    else if (state.focus === 'luz' && el.getAttribute('data-pid')) next = { kind: 'power', id: el.getAttribute('data-pid') };
    else if (state.focus === 'sensores' && el.getAttribute('data-nid')) next = { kind: 'sensor', id: el.getAttribute('data-nid') };
    if (next) selectEntity(next);
}
// Elegir una zona, huella o activo: se marca su renglón en la tabla (y se baja hasta él) y su figura se resalta en el croquis y en el 3D; volver a elegirla pasa del contorno grueso al punteado.
function selectEntity(next, reveal = true) {
    next.step = state.focus;
    next.strong = !(sameHighlight(state.hl, next) && state.hl.strong);
    state.hl = next;
    markSelectedRow();
    const row = highlightedRow();
    if (row) revealRow(row, 'nearest');
    applyHighlight(reveal);
    fxAfterSelect();
}
// Tocar una figura en el 3D hace lo mismo que en el croquis: solo cuenta lo del paso que se está editando (en Zonas la zona, en Huella-Espacio la huella y en Activos el activo). Como en el 3D los activos tapan
// el piso, tocar un activo en el paso Zonas elige la zona donde está y en Huella-Espacio la huella que lo lleva.
// Lo que se puede tocar en el 3D en cada paso que edita cosas sueltas (los demás pasos ya tenían zona, huella, activo o lado): solo se elige lo de ese paso.
const STEP_PICK_3D = { paredes: ['wall'], obstaculos: ['obstacle'], puertas: ['door'], luz: ['power'], sensores: ['sensor'], seguridad: ['safety'], techos: ['ceiling', 'roof'], transito: ['transit'], objetos: ['object'], pisos: ['floor'], rampas: ['floor'] };
const KIND_OF_3D_ITEM = { wall: 'obstacle', obstacle: 'obstacle', door: 'door', power: 'power', sensor: 'sensor', safety: 'safety', ceiling: 'ceiling', roof: 'roof', transit: 'transit', object: 'object', floor: 'floor' };
function selectFrom3d(sel) {
    if (!sel || !state.draft || state.mode !== 'edit') return; // igual que en el croquis: elegir tocando es de Editar
    let next = null;
    if (state.focus === 'zonas') {
        const zoneId = sel.kind === 'zone' ? sel.zone.id : (sel.kind === 'space' ? sel.space.zoneId : (sel.kind === 'footprint' ? sel.footprint.zoneId : ''));
        if (zoneId) next = { kind: 'zone', id: zoneId };
    } else if (state.focus === 'espacios') {
        const footprintId = sel.kind === 'footprint' ? sel.footprint.id : (sel.kind === 'space' ? sel.space.footprintId : '');
        if (footprintId) next = { kind: 'footprint', id: footprintId };
    } else if (state.focus === 'activos' && sel.kind === 'space') next = { kind: 'space', id: sel.space.id };
    else if (state.focus === 'contorno' && (sel.kind === 'side' || sel.kind === 'corner') && (sel.kind === 'side') === (state.contornoMode === 'sides')) next = { kind: sel.kind, id: String(sel.index) };
    else if (sel.kind === 'item' && KIND_OF_3D_ITEM[sel.type] && (STEP_PICK_3D[state.focus] || []).includes(sel.type) && itemExists(state.draft, sel.type, sel.id) && (sel.type !== 'floor' || !!sel.ramp === (state.focus === 'rampas'))) next = { kind: KIND_OF_3D_ITEM[sel.type], id: sel.id };
    if (next) selectEntity(next);
}
let mapTap = null;
$('layout-svg').addEventListener('pointerdown', (event) => { mapTap = { x: event.clientX, y: event.clientY, target: event.target }; });
window.addEventListener('pointerup', (event) => {
    const tap = mapTap;
    mapTap = null;
    if (!tap || !state.draft) return;
    if (Math.abs(event.clientX - tap.x) + Math.abs(event.clientY - tap.y) > 6) return; // arrastró una zona o recorrió el croquis: no es un toque
    selectFromMap(tap.target, { x: event.clientX, y: event.clientY });
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
// La barra de búsqueda (debajo del croquis) enfoca el croquis (2D y 3D), las tablas y el resumen en una o varias ZONAS o en UNA huella: solo se ve lo que hay adentro (el resto de la nave se oculta por completo o queda tenue). Lo enfocado se
// lee y se quita en la franja de arriba. Es solo de pantalla: no cambia lo guardado ni los reportes ni los QR. state.find = { kind: 'zone', id, ids } | { kind: 'footprint', id }. Las tablas no pierden renglones: los que no son de lo
// enfocado solo se esconden (clase layout-find-out), por eso sus números de renglón no cambian.
const canFind = () => !!(state.perms && state.perms.canFind);
function clearFind() { state.find = null; state.findScope = 'all'; state.findNone = false; state.zoneScope = []; state.pick = []; }
// ---- franja de enfoque (arriba del panel de pasos) -------------------------------------------------------------------------------------
// «Ver»: las opciones (pasos) de abajo, con «Todo». «Enfocado»: el enfoque del buscador (zona o huella) o el activo, nivel o posición del renglón que se eligió en Activos, Niveles o Posiciones. «Resto»: qué pasa con lo
// que no es de lo enfocado, oculto o tenue (una sola elección, la misma del buscador, que se recuerda en este navegador). El enfoque de un renglón es solo del dibujo (croquis y 3D): las tablas no pierden renglones.
// El renglón elegido en Activos, Niveles, Espacios o Posiciones enfoca el croquis y el 3D igual que lo elegido arriba (Elegir, Localizador, buscador): lo demás se ve Tenue, Oculto o con Enfoque según «Lo demás» de arriba.
let fxLastKey = '';
const FX_STEPS = ['activos', 'niveles', 'posiciones', 'ubicaciones'];
// El activo (con su nivel o hueco) del renglón elegido en Activos, Niveles o Posiciones; null si no hay.
function fxCandidate() {
    const h = state.hl;
    if (!h || !state.draft || h.step !== state.focus || !FX_STEPS.includes(state.focus) || !(h.kind === 'space' || h.kind === 'bay')) return null;
    const sp = state.draft.spaces.find((x) => x.id === h.id);
    if (!sp) return null;
    const tail = h.kind === 'bay' ? ` · ${t('main.layoutPosNivel')} ${h.n} · ${t('main.layoutPosColumna')} ${h.c}${h.p ? ` · P${ubicPad(h.p)}` : ''}` : (h.n ? ` · ${t('main.layoutPosNivel')} ${h.n}` : '');
    return { id: sp.id, label: `${sp.code || ''}${tail}`, n: h.n || 0, c: h.kind === 'bay' ? h.c : 0, p: h.p || 0 };
}
// El renglón elegido en cualquier OTRO paso (zona, huella, piso o rampa, pared u obstáculo, puerta, luz, sensor, seguridad, techo, tránsito, objeto): ese elemento enfoca igual que un activo. Usa el mismo enfoque que «Elegir» (items) y
// los de zona y huella; las tablas no se filtran (el enfoque de un renglón es solo del dibujo).
const FX_ITEM_KINDS = ['floor', 'obstacle', 'door', 'power', 'sensor', 'safety', 'ceiling', 'transit', 'object'];
function fxRowTarget() {
    const h = state.hl;
    const d = state.draft;
    if (!h || !d || h.step !== state.focus) return null;
    if (h.kind === 'zone') { const z = (d.zones || []).find((x) => x.id === h.id); return z ? { kind: 'zone', id: z.id, ids: [z.id], from: 'row', label: z.code || z.name || '' } : null; }
    if (h.kind === 'footprint') { const p = (d.footprints || []).find((x) => x.id === h.id); return p ? { kind: 'footprint', id: p.id, from: 'row', label: p.code || '' } : null; }
    if (!FX_ITEM_KINDS.includes(h.kind) || !itemExists(d, h.kind, h.id)) return null;
    const lists = { obstacle: d.obstacles, door: d.doors, power: d.power, sensor: d.sensors, safety: d.safety, ceiling: d.ceiling, transit: d.transit, object: d.objects, floor: LC.floorsAll(d) };
    const item = (lists[h.kind] || []).find((x) => x.id === h.id) || {};
    // una pared es un obstáculo de tipo pared (su renglón sale como «obstacle»), pero el enfoque la distingue de una columna o un desnivel: sin ser «pared» el filtro la descartaba y Oculto/Enfoque no la mostraban
    const type = h.kind === 'obstacle' && item.kind === 'wall' ? 'wall' : h.kind;
    return { kind: 'items', items: [{ type, id: h.id }], from: 'row', label: item.code || item.name || '' };
}
// El enfoque que no viene del buscador: el activo (con su nivel, espacio y posición) del renglón elegido de la tabla o, en los demás pasos, el elemento del renglón.
function virtualFind() {
    if (state.find || !state.draft) return null;
    const c = fxCandidate();
    return c ? { kind: 'spaces', ids: [c.id], n: c.n, c: c.c, p: c.p, from: 'row' } : fxRowTarget();
}
const activeFind = () => state.find || virtualFind();
// Lo que se eligió en «Elegir activos» (solo en el 3D): cuántos de cuántos; null si se ven todos.
function pickerFocus() {
    if (!picker3d) return null;
    const hid = picker3d.getHidden().size;
    if (!hid) return null;
    const total = picker3d.total();
    return { shown: total - hid, total };
}
function fxReframe() { resetZoom(); find3dReframe = true; }
// Cambió el renglón elegido: el croquis y el 3D se vuelven a armar con lo enfocado (el activo, su nivel, su espacio y su posición); si ya no hay renglón enfocado, vuelven a verse completos.
function fxAfterSelect() {
    const v = virtualFind();
    const rl = v ? null : rowLevelFocus();
    const key = v ? (v.ids ? v.ids.join(',') : `${v.kind}:${v.id || (v.items || []).map((it) => `${it.type}${it.id}`).join(',')}`) : (rl ? `${rl.id}|${rl.n}` : '');
    if (!v && !rl && !fxLastKey) return; // sin enfoque antes ni ahora: nada que redibujar
    if (key !== fxLastKey) fxReframe();
    fxLastKey = key;
    renderSvg();
}
// «Todo»: enciende todas las opciones; si ya están todas encendidas, las apaga y regresa a «Contorno» (el punto de partida) como la única seleccionada.
function fxToggleAll() {
    const visible = SECTION_ORDER.filter(stepVisible);
    if (visible.every((x) => stepOn(x))) { const base = stepVisible('contorno') ? 'contorno' : visible[0]; state.steps = [base]; state.focusStack = [base]; state.focus = base; } else state.steps = [...new Set([...visible, ...state.steps])];
    renderPanel();
    refreshLive();
}
// Resto de la nave al enfocar: «tenue» de fondo (por omisión), oculto o con enfoque. Siempre se abre en Tenue: lo que se elija vale mientras la pantalla esté abierta y NO se recuerda para la próxima vez
// (en Oculto y en Enfoque no se ve lo que no se eligió y parecía que faltaban cosas).
const FIND_DIM_KEY = 'sgn_layout_find_dim';
// «Lo demás» tiene tres opciones: Tenue (todo el Layout apagado y lo elegido resaltado), Oculto (solo lo elegido, centrado y AL MISMO TAMAÑO que en el Layout completo: sin acercar) y Enfoque (solo lo elegido y el croquis y el 3D se acercan).
// state.findMode lo guarda; state.findDim (tenue o no) lo siguen usando el buscador y la franja de Editar, donde ocultar siempre acerca (es el Enfoque).
const FIND_MODE_KEY = 'sgn_layout_find_mode';
const FIND_MODES = ['tenue', 'oculto', 'enfoque'];
function setFindMode(mode) {
    state.findMode = FIND_MODES.includes(mode) ? mode : 'tenue';
    state.findDim = state.findMode === 'tenue';
}
setFindMode('tenue');
// lo que se recordaba de antes ya no se usa: se limpia para no dejar basura en el navegador
try { localStorage.removeItem(FIND_MODE_KEY); localStorage.removeItem(FIND_DIM_KEY); } catch (err) { /* sin almacenamiento */ }
// ---- Buscar en zonas: lo que hay dentro de las zonas elegidas -----------------------------------------------------------------------------
// El enfoque de zonas es de UNA o de VARIAS (state.find = { kind: 'zone', id, ids }; state.findScope = 'zones' cuando «Buscar en» está en Zonas). «Qué ver» (state.findTypes) dice qué tipos de cosas se listan y se dibujan dentro de ellas
// (sin elegir ninguno, todos). Una cosa es de la zona si queda dentro o sobre su borde (a 30 cm): huellas, activos, sensores, seguridad y pasillos ya traen su zona; paredes, puertas, luz, obstáculos, objetos y pisos se miden contra el dibujo.
const zoneFocusIds = (f) => (f && f.kind === 'zone' ? (Array.isArray(f.ids) && f.ids.length ? f.ids : [f.id]) : []);
// ¿Este tipo de cosa se dibuja con las zonas enfocadas? (sin tipos elegidos en «Qué ver», todos)
// ¿«Qué ver» deja ver este tipo de cosa de lo enfocado? Vale para las zonas enfocadas y para lo que se eligió en «Elegir»: con una capa apagada (o todas) eso ya no se dibuja, aunque esté enfocado.
function fxWant(type) {
    const f = activeFind();
    if (!f || (f.kind !== 'zone' && f.kind !== 'items')) return true;
    if (state.findNone) return false; // «Qué ver: Nada» (sin capas de cosas encendidas): de la zona (o de lo elegido) no se ve nada de lo de adentro
    const c = findTypesChosen();
    return !c.length || c.includes(type);
}
function segDistance(px, py, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const k = len2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2)) : 0;
    return Math.hypot(px - (a[0] + k * dx), py - (a[1] + k * dy));
}
// Los ids de lo que hay dentro de las zonas elegidas, por tipo (footprint, space, wall, obstacle, door, power, sensor, safety, transit, object, floor).
function scopeInside(d, ids) {
    const polys = (d.zones || []).filter((z) => ids.includes(z.id)).map((z) => LC.zonePoints(z)).filter((p) => p && p.length >= 3);
    const near = (x, y) => polys.some((poly) => LC.pointInPolygon(x, y, poly) || poly.some((a, i) => segDistance(x, y, a, poly[(i + 1) % poly.length]) <= 0.3));
    const anyNear = (pts) => pts.some((p) => near(p[0], p[1]));
    const along = (a, b) => {
        const n = Math.min(200, Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5)));
        const out = [];
        for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
        return out;
    };
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const inZone = (zid) => ids.includes(zid);
    const out = { footprint: new Set(), space: new Set(), wall: new Set(), obstacle: new Set(), door: new Set(), power: new Set(), sensor: new Set(), safety: new Set(), ceiling: new Set(), transit: new Set(), object: new Set(), floor: new Set() };
    (d.footprints || []).forEach((p) => { if (inZone(p.zoneId)) out.footprint.add(p.id); });
    (d.spaces || []).forEach((sp) => { if (inZone(sp.zoneId)) out.space.add(sp.id); });
    (d.obstacles || []).forEach((o) => {
        const g = LC.obstacleGeometry(o, d.vertices);
        if (!g) return;
        const p = g.pts;
        const long = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) >= Math.hypot(p[3][0] - p[0][0], p[3][1] - p[0][1]);
        const axis = long ? [mid(p[0], p[3]), mid(p[1], p[2])] : [mid(p[0], p[1]), mid(p[3], p[2])];
        if (anyNear([...along(axis[0], axis[1]), ...p])) out[o.kind === 'wall' ? 'wall' : 'obstacle'].add(o.id);
    });
    (d.doors || []).forEach((x) => { const g = LC.doorGeometry(d, x); if (g && anyNear(along([g.a.x, g.a.y], [g.b.x, g.b.y]))) out.door.add(x.id); });
    (d.power || []).forEach((x) => { const g = LC.doorGeometry(d, { ...x, width: 0 }); if (g && near(g.a.x, g.a.y)) out.power.add(x.id); });
    (d.sensors || []).forEach((x) => {
        const g = LC.doorGeometry(d, { ...x, width: 0 });
        if (LC.sensorZoneIds(x).some(inZone) || (g && near(g.a.x, g.a.y))) out.sensor.add(x.id);
    });
    (d.safety || []).forEach((x) => { if (inZone(x.zoneId) || near(Number(x.x) || 0, Number(x.y) || 0)) out.safety.add(x.id); });
    (d.ceiling || []).forEach((x) => { if (inZone(x.zoneId) || near(Number(x.x) || 0, Number(x.y) || 0)) out.ceiling.add(x.id); });
    (d.transit || []).forEach((x) => {
        const px = Number(x.x) || 0;
        const py = Number(x.y) || 0;
        const l = Number(x.l) || 0;
        const w = Number(x.w) || 0;
        if (inZone(x.zoneId) || anyNear([[px, py], [px + l, py], [px + l, py + w], [px, py + w]])) out.transit.add(x.id);
    });
    (d.objects || []).forEach((x) => { if (anyNear([...LC.objectPolygon(x), [Number(x.x) || 0, Number(x.y) || 0]])) out.object.add(x.id); });
    LC.floorsAll(d).forEach((f) => {
        if (f.active === false) return;
        const pts = LC.zonePoints(f);
        if (!pts || pts.length < 3) return;
        const c = LC.polygonCentroid(pts);
        if (anyNear(pts) || (c && near(c[0], c[1])) || polys.some((poly) => poly.some((p) => LC.pointInPolygon(p[0], p[1], pts)))) out.floor.add(f.id);
    });
    return out;
}
const FIND_ITEM_ATTR = { wall: 'obid', obstacle: 'obid', door: 'did', power: 'pid', sensor: 'nid', safety: 'sfid', ceiling: 'clid', transit: 'tid', object: 'oid' };
// «Elegir» (modo Ver): lo elegido, una o varias cosas de cualquier tipo, en la misma forma que scopeInside (ids por tipo) para dibujarlo igual que lo de una zona enfocada.
// Una huella elegida lleva sus activos y un activo elegido lleva su huella (para poder dibujarlo).
function chosenInside(d, f) {
    const out = { zone: new Set(), footprint: new Set(), space: new Set(), wall: new Set(), obstacle: new Set(), door: new Set(), power: new Set(), sensor: new Set(), safety: new Set(), ceiling: new Set(), transit: new Set(), object: new Set(), floor: new Set() };
    ((f && f.items) || []).forEach((it) => { if (out[it.type]) out[it.type].add(it.id); });
    (d.spaces || []).forEach((sp) => { if (out.footprint.has(sp.footprintId)) out.space.add(sp.id); });
    (d.spaces || []).forEach((sp) => { if (out.space.has(sp.id) && sp.footprintId) out.footprint.add(sp.footprintId); });
    return out;
}
function itemExists(d, type, id) {
    const lists = { zone: d.zones, footprint: d.footprints, space: d.spaces, wall: d.obstacles, obstacle: d.obstacles, door: d.doors, power: d.power, sensor: d.sensors, safety: d.safety, ceiling: d.ceiling, roof: d.roofs, transit: d.transit, object: d.objects, floor: LC.floorsAll(d) };
    return (lists[type] || []).some((x) => x.id === id);
}
// Los puntos de lo elegido (para encuadrar el croquis y el 3D alrededor).
function itemFramePoints(d, inside) {
    const pts = [];
    (d.obstacles || []).forEach((o) => { if (inside.wall.has(o.id) || inside.obstacle.has(o.id)) { const g = LC.obstacleGeometry(o, d.vertices); if (g) g.pts.forEach((p) => pts.push(p)); } });
    (d.doors || []).forEach((x) => { if (inside.door.has(x.id)) { const g = LC.doorGeometry(d, x); if (g) pts.push([g.a.x, g.a.y], [g.b.x, g.b.y]); } });
    [['power', d.power], ['sensor', d.sensors]].forEach(([ty, list]) => (list || []).forEach((x) => { if (inside[ty].has(x.id)) { const g = LC.doorGeometry(d, { ...x, width: 0 }); if (g) pts.push([g.a.x, g.a.y]); } }));
    (d.safety || []).forEach((x) => { if (inside.safety.has(x.id)) { pts.push([Number(x.x) || 0, Number(x.y) || 0]); if (x.type === 'route') pts.push([Number(x.x2) || 0, Number(x.y2) || 0]); } });
    (d.transit || []).forEach((x) => { if (inside.transit.has(x.id)) pts.push([Number(x.x) || 0, Number(x.y) || 0], [(Number(x.x) || 0) + (Number(x.l) || 0), (Number(x.y) || 0) + (Number(x.w) || 0)]); });
    (d.ceiling || []).forEach((x) => { if (inside.ceiling.has(x.id)) pts.push([Number(x.x) || 0, Number(x.y) || 0]); });
    (d.objects || []).forEach((x) => { if (inside.object.has(x.id)) LC.objectPolygon(x).forEach((p) => pts.push(p)); });
    LC.floorsAll(d).forEach((fl) => { if (inside.floor.has(fl.id)) { const zp = LC.zonePoints(fl); if (zp) zp.forEach((p) => pts.push(p)); } });
    return pts;
}
// Los ids de lo enfocado (la zona o las zonas, o la huella, con sus huellas y activos y, en zonas, lo demás que elige «Qué ver»).
function findIds() {
    const f = activeFind();
    const d = state.draft;
    const ids = { zones: new Set(), footprints: new Set(), spaces: new Set(), items: null };
    if (!f || !d) return ids;
    if (f.kind === 'spaces') {
        f.ids.forEach((id) => { ids.spaces.add(id); const sp = d.spaces.find((x) => x.id === id); if (sp && sp.footprintId) ids.footprints.add(sp.footprintId); });
    } else if (f.kind === 'items') {
        const inside = chosenInside(d, f);
        inside.zone.forEach((id) => ids.zones.add(id));
        inside.footprint.forEach((id) => ids.footprints.add(id));
        inside.space.forEach((id) => ids.spaces.add(id));
        ids.items = {};
        Object.keys(FIND_ITEM_ATTR).forEach((ty) => { ids.items[ty] = inside[ty]; });
    } else if (f.kind === 'zone') {
        const zids = zoneFocusIds(f);
        const inside = scopeInside(d, zids);
        zids.forEach((id) => ids.zones.add(id));
        ids.items = {};
        if (fxWant('footprint')) inside.footprint.forEach((id) => ids.footprints.add(id));
        if (fxWant('space')) inside.space.forEach((id) => ids.spaces.add(id));
        Object.keys(FIND_ITEM_ATTR).forEach((ty) => { if (fxWant(ty)) ids.items[ty] = inside[ty]; });
    } else {
        ids.footprints.add(f.id);
        d.spaces.forEach((sp) => { if (sp.footprintId === f.id) ids.spaces.add(sp.id); });
    }
    return ids;
}
// Cómo se ve el Layout con el enfoque: solo lo enfocado (zona con sus huellas y activos o huella con sus activos) o, con el resto «tenue», todo el Layout con lo enfocado resaltado.
function findView(full) {
    if (!activeFind()) return { d: full, finding: false, dimmed: false };
    if (!findEntity()) { if (state.find) clearFind(); return { d: full, finding: false, dimmed: false }; }
    if (state.findDim) return { d: full, finding: true, dimmed: true };
    const d = findLayout(full);
    return { d, finding: d !== full, dimmed: false };
}
function findView3d() {
    if (!activeFind()) return { shown: state.draft, focus: null };
    if (!findEntity()) { if (state.find) clearFind(); return { shown: state.draft, focus: null }; }
    if (state.findDim) return { shown: state.draft, focus: findIds() };
    return { shown: findLayout(state.draft), focus: null };
}
// Con el resto «tenue»: lo que no es de lo enfocado se ve apagado (las figuras y los textos de lo enfocado llevan la clase find-on).
// El «giro» de un objeto elegido en el croquis: un disco naranja con un anillo punteado que gira alrededor (box = lo que ocupa el objeto; cls = find-mark o hl-shape para que se borre con lo suyo).
function addObjectDisc(svg, box, cls) {
    const cx = box.x + box.width / 2; const cy = box.y + box.height / 2;
    const r = Math.max(Math.hypot(box.width, box.height) / 2 * 1.15, 6);
    const mk = (extra, rr) => {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', cx.toFixed(2)); c.setAttribute('cy', cy.toFixed(2)); c.setAttribute('r', rr.toFixed(2));
        c.setAttribute('class', `${cls} ${extra}`);
        svg.appendChild(c);
    };
    mk('obj-disc', r);
    mk('obj-ring', r * 1.14);
}
// Lo que se eligió de verdad: una huella elegida lleva todos sus activos, pero un activo elegido va solo (su huella se usa para dibujarlo, no se ilumina).
function findExplicit() {
    const f = activeFind();
    const out = { fps: new Set(), sps: new Set() };
    if (!f) return out;
    if (f.kind === 'items') (f.items || []).forEach((it) => { if (it.type === 'footprint') out.fps.add(it.id); else if (it.type === 'space') out.sps.add(it.id); });
    else if (f.kind === 'spaces') (f.ids || []).forEach((id) => out.sps.add(id));
    else findIds().footprints.forEach((id) => out.fps.add(id));
    return out;
}
function applyFindDim(dimmed) {
    const svg = $('layout-svg');
    svg.classList.remove('find-dimmed');
    svg.querySelectorAll('.find-mark').forEach((n) => n.remove());
    if (!dimmed || !activeFind()) return;
    const f = activeFind();
    const sel = [];
    if (f.kind === 'zone' || f.kind === 'items') (f.kind === 'zone' ? zoneFocusIds(f) : [...findIds().zones]).forEach((id) => sel.push(`[data-zid="${CSS.escape(id)}"]`, `[data-lz="${CSS.escape(id)}"]`));
    if (f.kind === 'zone' || f.kind === 'items') { const it = findIds().items || {}; Object.keys(it).forEach((ty) => it[ty].forEach((id) => sel.push(`[data-${FIND_ITEM_ATTR[ty]}="${CSS.escape(id)}"]`))); }
    // un activo (o un nivel o hueco) enfocado: su dibujo y su etiqueta; sus vecinos de la misma huella se apagan con lo demás
    const ex = findExplicit();
    ex.sps.forEach((id) => sel.push(`[data-sid="${CSS.escape(id)}"]`, `[data-ls="${CSS.escape(id)}"]`));
    ex.fps.forEach((id) => sel.push(`[data-fid="${CSS.escape(id)}"]`, `[data-lf="${CSS.escape(id)}"]`));
    if (sel.length) svg.querySelectorAll(sel.join(',')).forEach((n) => n.classList.add('find-on'));
    svg.classList.add('find-dimmed');
    // lo elegido lleva el contorno punteado naranja que gira (como el del renglón elegido): una caja por huella, activo o zona
    const groups = new Map();
    // un objeto (montacargas, persona…) elegido lleva su «giro»: un disco naranja con un anillo punteado que gira
    svg.querySelectorAll('[data-oid].find-on').forEach((el) => {
        const shape = el.matches('rect, polygon, circle, path') ? el : el.querySelector('rect, polygon, circle, path');
        if (shape) addObjectDisc(svg, shape.getBBox(), 'find-mark');
    });
    svg.querySelectorAll('[data-fid].find-on, [data-sid].find-on, [data-zid].find-on').forEach((el) => {
        // un activo de una huella elegida va en la caja de su huella; un activo elegido solo lleva su propia caja
        const key = el.hasAttribute('data-sid') && !ex.fps.has(el.getAttribute('data-fid')) ? `s:${el.getAttribute('data-sid')}` : (el.hasAttribute('data-fid') ? `f:${el.getAttribute('data-fid')}` : `z:${el.getAttribute('data-zid')}`);
        const shape = el.matches('rect, polygon') ? el : el.querySelector('polygon, rect');
        if (!shape) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(shape);
    });
    if (groups.size > 80) return; // con tantas cosas elegidas el contorno no ayuda
    groups.forEach((shapes) => {
        let ring;
        if (shapes.length === 1 && shapes[0].tagName.toLowerCase() === 'polygon') {
            ring = shapes[0].cloneNode(false);
            ['class', 'style', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'mask', 'filter', 'data-zid', 'data-sid', 'data-fid', 'data-obid', 'data-tid', 'data-hlbox', 'id'].forEach((a) => ring.removeAttribute(a));
        } else {
            const boxes = shapes.map((sh) => sh.getBBox());
            const x0 = Math.min(...boxes.map((b) => b.x)); const y0 = Math.min(...boxes.map((b) => b.y));
            const x1 = Math.max(...boxes.map((b) => b.x + b.width)); const y1 = Math.max(...boxes.map((b) => b.y + b.height));
            ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            ring.setAttribute('x', x0); ring.setAttribute('y', y0); ring.setAttribute('width', x1 - x0); ring.setAttribute('height', y1 - y0);
        }
        ring.setAttribute('class', 'find-mark');
        svg.appendChild(ring);
    });
}
// Lo enfocado, con lo que hace falta para escribirlo; null si ya no existe (se borró).
function findEntity() {
    const f = activeFind();
    const d = state.draft;
    if (!f || !d) return null;
    if (f.kind === 'spaces') { const sp = d.spaces.find((x) => x.id === f.ids[0]); return sp ? { kind: 'spaces', id: sp.id, code: sp.code || '', name: sp.code || '' } : null; }
    if (f.kind === 'items') {
        const alive = (f.items || []).filter((it) => itemExists(d, it.type, it.id));
        return alive.length ? { kind: 'items', id: alive[0].id, ids: [], code: '', name: f.from === 'row' ? (f.label || alive[0].id) : t('main.layoutFiltroNElegidos', { n: alive.length }) } : null;
    }
    if (f.kind === 'zone') {
        const zs = zoneFocusIds(f).map((id) => d.zones.find((x) => x.id === id)).filter(Boolean);
        return zs.length ? { kind: 'zone', id: zs[0].id, ids: zs.map((z) => z.id), code: zs.map((z) => z.code || '').join(' · '), name: zs.map((z) => z.name || z.code || '').join(' · ') } : null;
    }
    const p = d.footprints.find((x) => x.id === f.id);
    return p ? { kind: 'footprint', id: p.id, code: p.code || '', name: p.code || '', zoneId: p.zoneId || '' } : null;
}
// Las zonas de lo enfocado (la zona o las zonas, o la de la huella): son las filas que deja el resumen de abajo.
function findZoneIds() {
    const e = findEntity();
    return e ? (e.kind === 'zone' ? e.ids : (e.kind === 'items' ? [] : [e.zoneId])) : [];
}
// El Layout que se dibuja con el enfoque: solo la huella (con sus activos) o las zonas elegidas (con lo que elige «Qué ver» de lo que hay adentro: huellas, activos, paredes, puertas, pisos, seguridad…), con un recuadro justo alrededor
// (_frame) para que el croquis y el 3D se acerquen a lo enfocado; los dos conservan el contorno real porque de ahí salen las paredes, las puertas, la luz y los sensores.
// Sin enfoque (o si lo enfocado ya no existe) devuelve el mismo Layout.
function findLayout(d) {
    const f = activeFind();
    if (!f || !d) return d;
    if (!findEntity()) { if (state.find) clearFind(); return d; }
    let zones = [];
    let footprints;
    let spaces;
    let frameFp;
    let frameSp;
    let scoped = null;
    let itemPts = null; // con «Elegir»: los puntos de lo elegido, para encuadrarlo
    if (f.kind === 'zone' || f.kind === 'items') {
        const ids = zoneFocusIds(f);
        const inside = f.kind === 'items' ? chosenInside(d, f) : scopeInside(d, ids);
        zones = f.kind === 'items' ? d.zones.filter((z) => inside.zone.has(z.id)) : d.zones.filter((z) => ids.includes(z.id));
        if (f.kind === 'items') itemPts = itemFramePoints(d, inside);
        frameFp = d.footprints.filter((p) => inside.footprint.has(p.id));
        frameSp = d.spaces.filter((x) => inside.space.has(x.id));
        footprints = fxWant('footprint') ? frameFp : [];
        spaces = fxWant('space') ? frameSp : [];
        const keep = (list, ty) => (fxWant(ty) ? (list || []).filter((x) => inside[ty].has(x.id)) : []);
        const doors = keep(d.doors, 'door');
        const power = keep(d.power, 'power');
        const sensors = keep(d.sensors, 'sensor');
        // una puerta, una conexión de luz o un sensor se ubican sobre su pared: la pared viaja aunque no se haya pedido verla (se marca _geom y no se dibuja)
        const needWall = new Set([...doors, ...power, ...sensors].map((x) => x.wallId).filter(Boolean));
        const wallShown = (o) => fxWant('wall') && inside.wall.has(o.id);
        const obstacles = (d.obstacles || []).filter((o) => (o.kind === 'wall' ? wallShown(o) || needWall.has(o.id) : fxWant('obstacle') && inside.obstacle.has(o.id))).map((o) => (o.kind === 'wall' && !wallShown(o) ? { ...o, _geom: true } : o));
        scoped = { doors, power, sensors, obstacles, safety: keep(d.safety, 'safety'), ceiling: keep(d.ceiling, 'ceiling'), transit: keep(d.transit, 'transit'), objects: keep(d.objects, 'object'), floors: fxWant('floor') ? (d.floors || []).filter((fl) => inside.floor.has(fl.id)) : [], ramps: fxWant('floor') ? (d.ramps || []).filter((rp) => inside.floor.has(rp.id)) : [] };
    } else if (f.kind === 'spaces') {
        spaces = d.spaces.filter((x) => f.ids.includes(x.id));
        footprints = d.footprints.filter((p) => spaces.some((x) => x.footprintId === p.id));
    } else {
        footprints = d.footprints.filter((p) => p.id === f.id);
        spaces = d.spaces.filter((x) => x.footprintId === f.id);
    }
    const pts = [];
    zones.forEach((z) => LC.zonePoints(z).forEach((p) => pts.push(p)));
    (frameFp || footprints).forEach((p) => { pts.push([p.x, p.y], [p.x + p.l, p.y + p.d]); });
    (frameSp || spaces).forEach((x) => { pts.push([x.x, x.y], [x.x + x.l, x.y + x.d]); });
    if (itemPts) itemPts.forEach((p) => pts.push(p));
    const ok = pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!ok.length) return d;
    let x0 = Math.min(...ok.map((p) => p[0]));
    let x1 = Math.max(...ok.map((p) => p[0]));
    let y0 = Math.min(...ok.map((p) => p[1]));
    let y1 = Math.max(...ok.map((p) => p[1]));
    if (itemPts) {
        // una sola cosa chica no debe llenar la pantalla (sería un zoom enorme): el recuadro mide al menos la cuarta parte de la nave
        const vx = (d.vertices || []).map((p) => p[0]);
        const vy = (d.vertices || []).map((p) => p[1]);
        const nave = vx.length ? Math.max(Math.max(...vx) - Math.min(...vx), Math.max(...vy) - Math.min(...vy)) : 0;
        const minSpan = Math.max(4, nave * 0.25);
        if (x1 - x0 < minSpan) { const c = (x0 + x1) / 2; x0 = c - minSpan / 2; x1 = c + minSpan / 2; }
        if (y1 - y0 < minSpan) { const c = (y0 + y1) / 2; y0 = c - minSpan / 2; y1 = c + minSpan / 2; }
    }
    const pad = Math.max(0.5, Math.max(x1 - x0, y1 - y0) * 0.06);
    const h = Number(d.heightM) > 0 ? d.heightM : 4;
    let rect = [[x0 - pad, y0 - pad, h], [x1 + pad, y0 - pad, h], [x1 + pad, y1 + pad, h], [x0 - pad, y1 + pad, h]];
    if ((scoped || f.kind === 'spaces') && state.findMode === 'oculto') {
        // Oculto (modo Ver): solo lo elegido, centrado y al mismo tamaño que en el Layout completo (el recuadro mide lo que mide la nave, así la escala y la cámara no se acercan)
        const vx = (d.vertices || []).map((p) => p[0]);
        const vy = (d.vertices || []).map((p) => p[1]);
        if (vx.length) {
            const nw = Math.max(...vx) - Math.min(...vx);
            const nh = Math.max(...vy) - Math.min(...vy);
            const cx = (x0 + x1) / 2;
            const cy = (y0 + y1) / 2;
            rect = [[cx - nw / 2, cy - nh / 2, h], [cx + nw / 2, cy - nh / 2, h], [cx + nw / 2, cy + nh / 2, h], [cx - nw / 2, cy + nh / 2, h]];
        }
    }
    const base = { ...d, zones, footprints, spaces, plan: null };
    if (scoped) {
        const common = { safety: scoped.safety, ceiling: scoped.ceiling, transit: scoped.transit, objects: scoped.objects, floors: scoped.floors, ramps: scoped.ramps };
        // con zonas enfocadas (no con «Elegir») el 3D recorta los pisos y las rampas al dibujo de esas zonas (_clip)
        const clip = f.kind === 'zone' ? zones.map((z) => LC.zonePoints(z)).filter((p) => p && p.length >= 3) : null;
        return { ...base, ...common, _frame: rect, ...(clip && clip.length ? { _clip: clip } : {}), obstacles: scoped.obstacles, doors: scoped.doors, power: scoped.power, sensors: scoped.sensors };
    }
    // un activo o una huella enfocados (o el renglón elegido de una tabla): solo ellos; sin pisos, rampas, pasillos, seguridad ni sensores de la nave
    return { ...base, vertices: rect, obstacles: [], objects: [], doors: [], power: [], floors: [], ramps: [], transit: [], safety: [], ceiling: [], sensors: [] };
}
// ¿Este renglón de una tabla es de lo enfocado? Los activos todavía sin huella y las huellas sin zona (recién agregados) siempre se ven, para no perderlos. Con zonas enfocadas, las paredes, puertas, luz, sensores, seguridad,
// pasillos, objetos, obstáculos y pisos que no están en esas zonas también se esconden (inside = lo que hay dentro, ya calculado).
// El tipo de lo elegido (como en «Elegir») al que corresponde el renglón de una tabla; null si no es de ningún tipo que se pueda elegir.
function pickTypeOfRow(e) {
    const d = state.draft;
    if (e.kind === 'footprint') return 'footprint';
    if (e.kind === 'space' || e.kind === 'bay') return 'space';
    if (e.kind === 'obstacle') { const o = (d.obstacles || []).find((x) => x.id === e.id); return o ? (o.kind === 'wall' ? 'wall' : 'obstacle') : null; }
    return ['door', 'power', 'sensor', 'safety', 'ceiling', 'transit', 'object', 'floor'].includes(e.kind) ? e.kind : null;
}
// Con cosas elegidas: de cada tipo que tiene algo elegido solo salen esos renglones (los tipos sin nada elegido salen completos); lo que va DENTRO de lo elegido sale solo de eso (con una huella elegida, los activos, niveles,
// espacios y posiciones de esa huella; con activos elegidos, los de esos activos; con un nivel, un espacio o una posición del «Localizador», solo los de lo marcado).
function itemRowShown(e) {
    const ty = pickTypeOfRow(e);
    if (ty && state.pick.some((p) => p.type === ty) && !state.pick.some((p) => p.type === ty && p.id === e.id)) return false;
    if ((e.kind === 'space' || e.kind === 'bay') && !state.pick.some((p) => p.type === 'space')) {
        // con huellas elegidas (y ningún activo elegido): de los activos hacia abajo solo salen los de esas huellas
        const fps = state.pick.filter((p) => p.type === 'footprint');
        if (fps.length) {
            const sp = (state.draft.spaces || []).find((x) => x.id === e.id);
            if (sp && !fps.some((p) => p.id === sp.footprintId)) return false;
        }
    }
    const h = state.hl;
    if (h && h.loc && (e.kind === 'space' || e.kind === 'bay')) {
        // los renglones de un activo del que se marcó algo en el Localizador: solo los de lo marcado (varios niveles, espacios o posiciones valen todos)
        const mine = highlightedList().filter((x) => x.id === e.id);
        if (mine.length && !mine.some((x) => (e.n === undefined || !x.n || x.n === e.n) && (e.kind !== 'bay' || !x.c || x.c === e.c) && (e.p === undefined || !x.p || x.p === e.p))) return false;
    }
    return true;
}
const FIND_ROW_TYPE = { door: 'door', power: 'power', sensor: 'sensor', safety: 'safety', ceiling: 'ceiling', transit: 'transit', object: 'object', floor: 'floor' };
function inFind(entity, inside) {
    const f = state.find;
    const d = state.draft;
    if (!f || !d || !entity) return true;
    if (f.kind === 'items') return state.findDim || itemRowShown(entity); // «Elegir»: con Tenue las tablas no se filtran; con Oculto o Enfoque solo salen los renglones de lo elegido
    const zids = zoneFocusIds(f);
    if (entity.kind === 'zone') return f.kind === 'zone' && zids.includes(entity.id);
    if (entity.kind === 'footprint') {
        const p = d.footprints.find((x) => x.id === entity.id);
        if (!p) return true;
        return f.kind === 'zone' ? (!p.zoneId || zids.includes(p.zoneId)) : p.id === f.id;
    }
    const sp = d.spaces.find((x) => x.id === entity.id);
    if (sp) {
        if (!sp.footprintId) return true;
        return f.kind === 'zone' ? zids.includes(sp.zoneId) : sp.footprintId === f.id;
    }
    if (f.kind !== 'zone' || !inside) return true;
    if (entity.kind === 'obstacle') { const o = (d.obstacles || []).find((x) => x.id === entity.id); return !o || inside[o.kind === 'wall' ? 'wall' : 'obstacle'].has(o.id); }
    const ty = FIND_ROW_TYPE[entity.kind];
    return !ty || inside[ty].has(entity.id);
}
function applyFindToTables() {
    const d = state.draft;
    const inside = state.find && d && state.find.kind === 'zone' ? scopeInside(d, zoneFocusIds(state.find)) : null;
    document.querySelectorAll(HL_ROW_SELECTOR).forEach((tr) => {
        const e = state.find && d ? rowEntity(tr) : null;
        tr.classList.toggle('layout-find-out', !!e && !inFind(e, inside));
    });
    // Localizadores y Relación Código se arman ya filtrados (no con renglones escondidos): si cambió el enfoque desde que se armaron, se arman otra vez
    if (state.mode === 'edit' && d && INFO_STEPS.includes(state.focus) && infoFindKey() !== infoRenderedKey) renderPanel();
}
// La lista que sale al escribir: zonas y huellas que coinciden (con el mismo motor de búsqueda de todo el sistema: coma, $ y @).
// Los tipos en que se puede buscar (type = el de los chips, kind = como se elige la figura, step = el paso donde vive). Cada tipo solo sale si el árbol deja ver su paso. Zonas y huellas enfocan (solo se ve lo de adentro);
// los demás encienden su paso, seleccionan su renglón y acercan el croquis a la figura.
const FIND_TYPES = [
    { type: 'zone', step: 'zonas' }, { type: 'footprint', step: 'espacios' }, { type: 'space', kind: 'space', step: 'activos' }, { type: 'wall', kind: 'obstacle', step: 'paredes' }, { type: 'door', kind: 'door', step: 'puertas' }, { type: 'floor', kind: 'floor', step: 'pisos' },
    { type: 'safety', kind: 'safety', step: 'seguridad' }, { type: 'ceiling', kind: 'ceiling', step: 'techos' }, { type: 'sensor', kind: 'sensor', step: 'sensores' }, { type: 'power', kind: 'power', step: 'luz' }, { type: 'obstacle', kind: 'obstacle', step: 'obstaculos' },
    { type: 'transit', kind: 'transit', step: 'transito' }, { type: 'object', kind: 'object', step: 'objetos' },
];
const findTypesShown = () => FIND_TYPES.filter((ft) => stepVisible(ft.step) && !(ft.type === 'zone' && state.findScope === 'zones'));
const findTypesChosen = () => (state.findTypes || []).filter((id) => findTypesShown().some((ft) => ft.type === id));
function findLists(d) {
    const zoneName = (id) => { const z = d.zones.find((x) => x.id === id); return z ? z.name : ''; };
    const fpCode = (id) => { const p = d.footprints.find((x) => x.id === id); return p ? p.code : ''; };
    const low = (v) => String(v || '').toLowerCase();
    const wallName = (id) => { const o = (d.obstacles || []).find((x) => x.id === id); return o ? `${o.code ? `${o.code} ` : ''}${o.name || ''}`.trim() : ''; };
    const by = {
        zone: () => d.zones.map((z) => ({ id: z.id, title: z.name || z.code, sub: `${t('main.layoutFindZona')} · ${z.code || ''}`, hay: `${z.code || ''} ${z.name || ''}` })),
        footprint: () => d.footprints.map((p) => ({ id: p.id, title: p.code, sub: `${t('main.layoutFindHuella')} · ${zoneName(p.zoneId)}`, hay: `${p.code || ''} ${zoneName(p.zoneId)}` })),
        space: () => d.spaces.filter((x) => x.active !== false && x.footprintId).map((x) => ({ id: x.id, title: x.code, sub: `${t('main.layoutFindActivo')} · ${fpCode(x.footprintId)}`, hay: `${x.code || ''} ${typeLabel('space', x.type)} ${fpCode(x.footprintId)} ${zoneName(x.zoneId)}` })),
        wall: () => (d.obstacles || []).filter((o) => o.kind === 'wall').map((o) => ({ id: o.id, title: `${o.code ? `${o.code} · ` : ''}${o.name || t('main.layoutFindPared')}`, sub: low(t('main.layoutFindPared')), hay: `${o.code || ''} ${o.name || ''}` })),
        door: () => (d.doors || []).map((x) => ({ id: x.id, title: x.name || t('main.layoutFindPuerta'), sub: `${t('main.layoutFindPuerta')} · ${wallName(x.wallId)}`.replace(/ · $/, ''), hay: `${x.name || ''} ${typeLabel('door', x.type)} ${wallName(x.wallId)}` })),
        floor: () => LC.floorsAll(d).map((x) => ({ id: x.id, step: x.isRamp ? 'rampas' : 'pisos', title: x.name || x.code || t('main.layoutFindPiso'), sub: `${t('main.layoutFindPiso')} · ${x.code || ''}`.replace(/ · $/, ''), hay: `${x.code || ''} ${x.name || ''}` })),
        safety: () => (d.safety || []).map((x) => ({ id: x.id, title: x.name || typeLabel('safety', x.type), sub: `${low(typeLabel('safety', x.type))} · ${x.code || ''}`, hay: `${x.code || ''} ${x.name || ''} ${typeLabel('safety', x.type)}` })),
        ceiling: () => (d.ceiling || []).map((x) => ({ id: x.id, title: x.name || typeLabel('ceiling', x.type), sub: `${low(typeLabel('ceiling', x.type))} · ${x.code || ''}`, hay: `${x.code || ''} ${x.name || ''} ${typeLabel('ceiling', x.type)}` })),
        sensor: () => (d.sensors || []).map((x) => ({ id: x.id, title: x.code || t('main.layoutFindSensor'), sub: `${t('main.layoutFindSensor')} · ${low(typeLabel('sensor', x.type))}`, hay: `${x.code || ''} ${typeLabel('sensor', x.type)} ${wallName(x.wallId)}` })),
        power: () => (d.power || []).map((x) => ({ id: x.id, title: typeLabel('power', x.type), sub: `${t('main.layoutFindLuz')} · ${wallName(x.wallId)}`.replace(/ · $/, ''), hay: `${typeLabel('power', x.type)} ${wallName(x.wallId)}` })),
        obstacle: () => (d.obstacles || []).filter((o) => o.kind !== 'wall').map((o) => ({ id: o.id, title: o.name || typeLabel('obstacle', o.kind), sub: low(typeLabel('obstacle', o.kind)), hay: `${o.name || ''} ${typeLabel('obstacle', o.kind)}` })),
        transit: () => (d.transit || []).map((p) => ({ id: p.id, title: p.code || p.name || t('main.layoutFindPasillo'), sub: `${t('main.layoutFindPasillo')} · ${low(typeLabel('transit', p.type))}`, hay: `${p.code || ''} ${p.name || ''} ${typeLabel('transit', p.type)}` })),
        object: () => (d.objects || []).map((o) => ({ id: o.id, title: o.name || typeLabel('object', o.type), sub: low(typeLabel('object', o.type)), hay: `${o.name || ''} ${typeLabel('object', o.type)}` })),
    };
    return by;
}
function findSearch(query) {
    const d = state.draft;
    if (!d) return { items: [], counts: {} };
    const by = findLists(d);
    const text = String(query || '').trim();
    const match = text ? SearchSyntax.compile('contains', text) : null;
    const chosen = state.mode === 'edit' ? [] : findTypesChosen(); // en Editar los pasos encendidos son pocos: el buscador busca de todo
    const counts = {};
    const items = [];
    // con zonas elegidas solo cuenta y se lista lo que hay dentro de ellas
    const zf = state.zoneScope; // la zona sale del botón Zona (también en Editar); el buscador solo busca dentro de ella
    const inside = zf.length ? scopeInside(d, zf) : null;
    const noTypes = state.mode !== 'edit' && state.findNone; // Qué ver en «Ninguno»: no hay nada donde buscar
    findTypesShown().forEach((ft) => {
        const found = by[ft.type]().filter((i) => (!match || match(i.hay)) && (!inside || !inside[ft.type] || inside[ft.type].has(i.id)));
        counts[ft.type] = found.length;
        if (noTypes || (chosen.length && !chosen.includes(ft.type))) return;
        found.forEach((i) => items.push({ type: ft.type, kind: ft.kind || ft.type, step: ft.step, ...i }));
    });
    return { items, counts };
}
function findCandidates(query) { return findSearch(query).items.slice(0, 40); }
let findItems = [];
let findActive = -1;
function renderFindList() {
    const list = $('layout-find-list');
    const { items } = findSearch($('layout-find-input').value);
    findItems = items.slice(0, 40);
    findActive = findItems.length ? 0 : -1;
    $('layout-find-input').placeholder = t('main.layoutBuscarPlaceholder');
    const head = ''; // «Buscar en» y «Qué ver» ya están arriba (Zona y Qué ver); aquí solo la lista
    list.innerHTML = head + (findItems.length
        ? findItems.map((i, n) => `<button type="button" class="layout-find-item" role="option" id="layout-find-opt-${n}" data-find-pick="${n}" aria-selected="${n === findActive}"><b>${esc(i.title)}</b><span>${esc(i.sub)}</span></button>`).join('')
        : `<div class="layout-find-empty">${esc(t('main.layoutFindSin'))}</div>`);
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
// La barra de búsqueda solo sale con el icono Buscar en el árbol (canFind) y con un Layout cargado.
function renderFindBox() {
    const box = $('layout-find');
    box.hidden = !(canFind() && state.draft);
    $('layout-find-input').setAttribute('aria-label', t('main.layoutBuscarBtn'));
}
// Poner o quitar el enfoque (reset = true cuando cambió lo enfocado: el croquis y el 3D se acomodan a lo nuevo).
let find3dReframe = false;
let loc3dFocus = false; // «Localizador»: al armarse el 3D con lo elegido, la cámara se acerca a ese nivel, posición o localizador
function applyFind(reset) {
    if (!state.draft) return;
    if (reset) { resetZoom(); find3dReframe = true; }
    renderFindBox();
    renderSvg();
    renderSummary();
    applyFindToTables();
    updateViewBtns();
    renderViewStrip();
}
// Elegir algo que no es una zona ni una huella (activo, pared, puerta, alarma…): se quita el enfoque de zona o huella (si había), se enciende y enfoca su paso, se selecciona su renglón en la tabla y el croquis (y el 3D)
// lo resaltan; el croquis se acerca a la figura si la cuenta puede acercar.
function locateFound(item) {
    if (!stepVisible(item.step)) return;
    const keepZones = zoneFocusIds(state.find).length > 0;
    const hadFind = !!state.find && !keepZones;
    if (!keepZones) clearFind();
    showStep(item.step);
    $('layout-find-input').value = '';
    closeFindList();
    renderFindBox();
    renderPanel();
    refreshLive();
    if (hadFind) { renderSummary(); applyFindToTables(); updateViewBtns(); }
    if (item.step === 'activos') loadAssetLists().then(() => { if (state.focus === 'activos') { renderPanel(); markSelectedRow(); } });
    state.hl = null;
    selectEntity({ kind: item.kind, id: item.id }, 'zoom');
}
function pickFind(n) {
    const item = findItems[n];
    if (!item) return;
    if (item.type !== 'zone' && item.type !== 'footprint') { locateFound(item); return; }
    state.find = item.type === 'zone' ? { kind: 'zone', id: item.id, ids: [item.id] } : { kind: item.kind, id: item.id };
    state.findScope = item.type === 'zone' ? 'zones' : 'all';
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
    // Paso 1, «Buscar en»: Todo quita el enfoque (toda la nave); Zonas muestra las zonas para marcar una o varias.
    const scopeBtn = event.target.closest('[data-find-scope]');
    if (scopeBtn) {
        event.stopPropagation();
        if (scopeBtn.getAttribute('data-find-scope') === 'all') {
            const had = !!state.find;
            clearFind();
            if (had) applyFind(true);
        } else {
            state.findScope = 'zones';
            state.findTypes = (state.findTypes || []).filter((x) => x !== 'zone');
        }
        renderFindList();
        return;
    }
    // Una zona: se marca o se desmarca (una o varias); con al menos una marcada el croquis, el 3D, las tablas y el resumen se enfocan en ellas.
    const zoneBtn = event.target.closest('[data-find-zone]');
    if (zoneBtn) {
        event.stopPropagation();
        const id = zoneBtn.getAttribute('data-find-zone');
        const cur = zoneFocusIds(state.find);
        const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
        if (!next.length) clearFind();
        else {
            state.find = { kind: 'zone', id: next[0], ids: next };
        }
        state.findScope = 'zones';
        applyFind(true);
        renderFindList();
        return;
    }
    // Paso 2, «Qué ver»: Todo quita la selección; los demás se prenden y apagan (uno o varios a la vez). La lista se vuelve a dibujar y se queda abierta. Con zonas enfocadas, lo que se prende también se enciende en el croquis.
    const typeBtn = event.target.closest('[data-find-type]');
    if (typeBtn) {
        event.stopPropagation();
        const id = typeBtn.getAttribute('data-find-type');
        const cur = findTypesChosen();
        state.findTypes = id === 'all' ? [] : (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
        if (zoneFocusIds(state.find).length) {
            const ft = FIND_TYPES.find((x) => x.type === id);
            if (ft && state.findTypes.includes(id) && !stepOn(ft.step)) { state.steps = [...state.steps, ft.step]; renderPanel(); }
            applyFind(false);
        }
        renderFindList();
        return;
    }
    const pick = event.target.closest('[data-find-pick]');
    if (pick) { pickFind(Number(pick.getAttribute('data-find-pick'))); return; }
});
document.addEventListener('click', (event) => { if (!event.target.closest('.layout-find-field, .layout-find-list')) closeFindList(); });

// ---- Modo Ver y modo Editar -------------------------------------------------------------------------------------------------------------------
// El Layout abre SIEMPRE en «Ver»: el croquis grande (2D o 3D, Visualizaciones y Simbología) con los filtros desplegables Zona, Qué ver y Lo demás y el buscador. No se mueve, se escribe ni se guarda nada (canEdit() es falso).
// El icono «Editar» (iconLayoutEditar del árbol; sin él sale con candado) muestra los pasos con sus tablas, Agregar, Quitar, Guardar y Descartar; «Ver» regresa (con cambios sin guardar pregunta antes).
let vDropdown = ''; // el desplegable abierto de la franja: 'zone' | 'layers' | ''
// «Ver» enciende todo el Layout (todas las capas que el árbol deja ver)
function showAllLayers() {
    const visible = SECTION_ORDER.filter(stepVisible);
    if (!visible.length) return;
    state.steps = [...visible, ...state.steps.filter((s) => INFO_STEPS.includes(s))];
    state.focusStack = [...state.focusStack.filter((s) => state.steps.includes(s))];
    if (!state.steps.includes(state.focus)) state.focus = visible[visible.length - 1];
    if (!state.focusStack.length) state.focusStack = [state.focus];
    syncFindTypesFromSteps();
}
// Con zonas enfocadas, «Qué ver» (los tipos de adentro) sigue a las capas encendidas: todas encendidas = todos los tipos.
function syncFindTypesFromSteps() {
    const shown = findTypesShown().filter((ft) => ft.type !== 'zone'); // «Qué ver» no lleva las zonas: eso es del botón Zona
    // los pasos Espacios, Niveles y Posiciones también son capas de activos
    const onTypes = shown.filter((ft) => stepOn(ft.step) || (ft.type === 'space' && (stepOn('posiciones') || stepOn('niveles') || stepOn('ubicaciones'))));
    state.findNone = onTypes.length === 0; // ninguna capa de cosas encendida: con zonas enfocadas no se muestra nada de lo de adentro
    state.findTypes = onTypes.length === shown.length || !onTypes.length ? [] : onTypes.map((ft) => ft.type);
}
function applyMode() {
    const ed = $('layout-editor');
    if (!ed) return;
    const view = state.mode !== 'edit';
    ed.classList.toggle('is-view', view);
    const can = !!(state.perms && state.perms.canEditMode);
    const editBtn = $('layout-mode-edit');
    editBtn.hidden = !view;
    editBtn.disabled = !can; // sin el icono en el árbol sale con candado, no escondido
    editBtn.classList.toggle('is-locked', !can);
    editBtn.title = can ? '' : t('main.layoutEditarSinPermiso');
    $('layout-mode-view').hidden = view;
    $('layout-vstrip').hidden = false; // la franja de filtros sale en Ver y en Editar
    $('layout-vstrip-find').appendChild($('layout-find'));
    vDropdown = '';
    renderViewStrip();
}
function goEdit() {
    if (!state.draft || !(state.perms && state.perms.canEditMode)) return;
    state.mode = 'edit';
    ensureVisibleSteps();
    applyMode();
    renderPanel();
    refreshLive();
}
async function goView() {
    if (!state.draft) return;
    if (isDirty()) {
        // tres opciones: guardar y ver (true), descartar y ver ('extra') o seguir editando (false)
        const choice = await Dashboard.confirm(t('main.layoutVerConCambios'), { accept: t('main.layoutVerGuardar'), extra: t('main.layoutVerDescartar'), cancel: t('main.layoutVerSeguir') });
        if (!choice) return;
        if (choice === 'extra') {
            state.creating = false;
            state.planNew = false;
            state.mode = 'view';
            await loadLayout();
            return;
        }
        if (!(await saveLayout())) return; // no se pudo guardar: se queda en Editar (ya avisó por qué)
    }
    state.mode = 'view';
    // lo que se eligió en Editar (una puerta, una pared…) no se queda marcado al pasar a Ver
    state.hl = null;
    state.hlList = null;
    showAllLayers();
    applyMode();
    renderPanel();
    refreshLive();
}
// La franja de filtros de «Ver»: Zona ▾, Qué ver ▾ y Lo demás (Tenue | Oculto); el buscador va a su lado.
function ddHtml(key, helpKey, label, value, open, disabled, menu) {
    return `<div class="layout-dd${open ? ' open' : ''}"><button type="button" class="layout-dd-btn" data-dd="${key}" data-help-key="${helpKey}" aria-haspopup="true" aria-expanded="${open}"${disabled ? ' disabled' : ''}><span class="layout-dd-k">${esc(label)}</span><b>${esc(value)}</b><span class="bx bx-chevron-down" aria-hidden="true"></span></button>${open ? `<div class="layout-dd-menu" role="menu">${menu}</div>` : ''}</div>`;
}
// on: true (marcada), false (vacía) o 'mix' (a medias: unas sí y otras no)
const ddItem = (attr, on, html) => `<button type="button" class="layout-dd-item" role="menuitemcheckbox" aria-checked="${on === 'mix' ? 'mixed' : !!on}" ${attr}><span class="layout-dd-cb${on === 'mix' ? ' mix' : (on ? ' on' : '')}"></span><span>${html}</span></button>`;
// El buscador de los desplegables (Zona, Qué ver y Elegir): el MISMO del resto del sistema (SearchSyntax): el tipo de filtro (Inicia con, Contiene, Igual que), los signos ($ antes, @ después, coma = otra búsqueda) y la caja.
const vSearch = { zone: { mode: 'contains', q: '', open: '' }, layers: { mode: 'contains', q: '', open: '' }, choose: { mode: 'contains', q: '', open: '' }, loc: { mode: 'contains', q: '', open: '' } };
let ddFocus = false; // el cursor se queda en la caja mientras se escribe
let ddRendered = ''; // qué desplegable estaba abierto en el último dibujo: si sigue siendo el mismo, la lista se queda donde iba (marcar una opción no la sube)
function ddMatch(key, text) { const s = vSearch[key]; return !s.q.trim() || SearchSyntax.matches(s.mode, s.q, text); }
function searchRowHtml(key) {
    const s = vSearch[key];
    const modes = [['startsWith', 'main.filterModeStartsWith'], ['contains', 'main.filterModeContains'], ['equals', 'main.filterModeEquals']];
    const signs = [['$', 'Before'], ['@', 'After'], [',', 'Comma']];
    const off = (sign) => (sign === '$' && s.mode !== 'contains') || (sign === '@' && s.mode === 'equals');
    return `<div class="layout-dd-searchrow" data-dd-search="${key}">`
        + `<button type="button" class="layout-dd-sbtn" data-dds="mode" data-help-key="layoutFiltroBuscar" title="${esc(t('main.filterModeLabel'))}" aria-label="${esc(t('main.filterModeLabel'))}"><i class="bx bx-slider-alt" aria-hidden="true"></i></button>`
        + `<button type="button" class="layout-dd-sbtn" data-dds="signs" data-help-key="layoutFiltroBuscar" title="${esc(t('main.filterSignsLabel'))}" aria-label="${esc(t('main.filterSignsLabel'))}"><b>$@</b></button>`
        + `<input type="search" class="layout-dd-sinput" id="layout-dd-input-${key}" data-dds="input" data-help-key="layoutFiltroBuscar" autocomplete="off" placeholder="${esc(t('main.filterSearchPlaceholder'))}" value="${esc(s.q)}">`
        + `<div class="layout-dd-smenu" data-dds-menu="mode"${s.open === 'mode' ? '' : ' hidden'}>${modes.map(([id, k]) => `<button type="button" class="layout-dd-smopt${s.mode === id ? ' on' : ''}" data-dds-mode="${id}">${esc(t(k))}</button>`).join('')}</div>`
        + `<div class="layout-dd-smenu" data-dds-menu="signs"${s.open === 'signs' ? '' : ' hidden'}>${signs.map(([sg, k]) => `<button type="button" class="layout-dd-smopt" data-dds-sign="${sg}"${off(sg) ? ' disabled' : ''} title="${esc(off(sg) ? t('main.filterSignOff') : t(`main.filterSign${k}Help`))}"><b>${sg}</b> <span>${esc(t(`main.filterSign${k}`))}</span></button>`).join('')}</div>`
        + '</div>';
}
function zoneItemsHtml() {
    const zones = (state.draft.zones || []).filter((z) => z.active !== false && ddMatch('zone', `${z.name || ''} ${z.code || ''}`));
    return zones.map((z) => ddItem(`data-dd-zone="${esc(z.id)}"`, state.zoneScope.includes(z.id), `${esc(z.name || z.code || '')} <small>${esc(z.code || '')}</small>`)).join('') || `<div class="layout-find-empty">${esc(t('main.layoutFindSin'))}</div>`;
}
// «Qué ver» lista las capas del Layout menos «Zonas»: las zonas se eligen con el botón Zona (y en «Ver» siempre se dibujan).
const queVerSteps = () => SECTION_ORDER.filter(stepVisible).filter((s) => s !== 'zonas');
function layerItemsHtml() {
    const visible = queVerSteps().filter((s) => ddMatch('layers', t(SECTION_LABEL_KEYS[s])));
    return visible.map((s) => ddItem(`data-dd-layer="${s}"`, stepOn(s), esc(t(SECTION_LABEL_KEYS[s])))).join('') || `<div class="layout-find-empty">${esc(t('main.layoutFindSin'))}</div>`;
}
// Mientras se escribe solo se vuelve a dibujar la lista (la caja no se toca para no perder el cursor).
function renderDdList(key) {
    if (key === 'choose') { renderChooseBody(); return; }
    if (key === 'loc') { renderLocBody(); return; }
    const box = $(`layout-dd-list-${key}`);
    if (box) box.innerHTML = key === 'zone' ? zoneItemsHtml() : layerItemsHtml();
}
function renderViewStrip() {
    const box = $('layout-vstrip-filters');
    if (!box) return;
    if (!state.draft) { box.innerHTML = ''; ddRendered = ''; return; }
    const d = state.draft;
    // lo que enfocó otra cosa (el buscador, la franja de Editar) también se refleja aquí
    const sf = state.find;
    if (!sf) { if (state.zoneScope.length || state.pick.length) { state.zoneScope = []; state.pick = []; } }
    else if (sf.kind === 'zone') { const z = zoneFocusIds(sf); if (JSON.stringify(z) !== JSON.stringify(state.zoneScope)) { state.zoneScope = z; state.pick = []; } }
    else if (sf.kind === 'items') state.pick = sf.items || [];
    else { state.zoneScope = []; state.pick = []; }
    // Zona: una, varias o todas (el mismo enfoque del buscador; pide el icono Buscar del árbol)
    const zones = (d.zones || []).filter((z) => z.active !== false);
    const zids = state.zoneScope;
    const names = zids.map((id) => (zones.find((z) => z.id === id) || {}).name || '').filter(Boolean);
    const zoneValue = names.length ? names.join(', ') : t('main.layoutFiltroTodas');
    const zoneMenu = vDropdown !== 'zone' ? '' : searchRowHtml('zone') + ddItem('data-dd-all="zone"', !zids.length || zids.length === zones.length ? true : 'mix', `<b>${esc(t('main.layoutFiltroTodasZonas'))}</b>`) + '<div class="layout-dd-sep"></div>'
        + `<div class="layout-dd-list" id="layout-dd-list-zone">${zoneItemsHtml()}</div>`;
    const zoneDd = ddHtml('zone', 'layoutFiltroZona', t('main.layoutFiltroZona'), zoneValue, vDropdown === 'zone', !(canFind() && stepVisible('zonas') && zones.length), zoneMenu);
    // Qué ver: las capas (los pasos que el árbol deja ver); «Todo» las enciende todas
    const visible = queVerSteps();
    const onN = visible.filter(stepOn).length;
    const layersValue = onN === visible.length ? t('main.layoutFiltroTodo') : (onN === 0 ? t('main.layoutFiltroNada') : t('main.layoutFiltroNdeN', { n: onN, total: visible.length }));
    const layersMenu = vDropdown !== 'layers' ? '' : searchRowHtml('layers') + ddItem('data-dd-all="layers"', onN === visible.length ? true : (onN === 0 ? false : 'mix'), `<b>${esc(t('main.layoutFiltroTodo'))}</b>`) + '<div class="layout-dd-sep"></div>'
        + `<div class="layout-dd-list" id="layout-dd-list-layers">${layerItemsHtml()}</div>`;
    const layersDd = ddHtml('layers', 'layoutFiltroQueVer', t('main.layoutFiltroQueVer'), layersValue, vDropdown === 'layers', !visible.length, layersMenu);
    // Lo demás: lo que no se eligió se ve tenue u oculto
    const rest = `<div class="layout-dd-seg" role="group" data-help-key="layoutFiltroLoDemas"><span class="layout-dd-k">${esc(t('main.layoutFiltroLoDemas'))}</span><button type="button" data-dd-rest="tenue" aria-pressed="${state.findMode === 'tenue'}">${esc(t('main.layoutFiltroTenue'))}</button><button type="button" data-dd-rest="oculto" aria-pressed="${state.findMode === 'oculto'}">${esc(t('main.layoutFiltroOculto'))}</button><button type="button" data-dd-rest="enfoque" aria-pressed="${state.findMode === 'enfoque'}">${esc(t('main.layoutFiltroEnfoque'))}</button></div>`;
    // Elegir: cualquier cosa en específico (pared, hidrante, piso, zona, activo, puerta, sensor, objeto…), una o varias; lo elegido se enfoca (Oculto: solo eso; Tenue: todo, resaltado)
    const nChosen = chosenList().length;
    const chooseDd = ddHtml('choose', 'layoutFiltroElegir', t('main.layoutFiltroElegir'), nChosen ? t('main.layoutFiltroNElegidos', { n: nChosen }) : t('main.layoutFiltroNinguno'), vDropdown === 'choose', !canFind(), chooseMenuHtml());
    // el desplegable se vuelve a crear en cada cambio: si era el mismo que ya estaba abierto, se guarda dónde iba su lista (y la de «Elegir») y se pone igual al terminar
    const keep = vDropdown && vDropdown === ddRendered ? { menu: (box.querySelector('.layout-dd-menu') || {}).scrollTop || 0, list: (box.querySelector('#layout-ch-list') || {}).scrollTop || 0 } : null;
    // Localizador: baja por Huella › Activo › Nivel › Posición › Localizador (cada paso enfoca o resalta lo elegido); pide el icono Buscar y que se vean las huellas y los activos
    locSync();
    const locDd = ddHtml('loc', 'layoutFiltroLocalizador', t('main.layoutFiltroLocalizador'), locAny() ? locCode() : t('main.layoutFiltroNinguno'), vDropdown === 'loc', !(canFind() && stepVisible('espacios') && stepVisible('activos')), locMenuHtml());
    box.innerHTML = zoneDd + layersDd + chooseDd + locDd + rest;
    ddRendered = vDropdown;
    // el desplegable abierto se puede ampliar jalando su esquina de abajo a la derecha; el tamaño se conserva mientras siga abierto y el de partida es el de siempre
    if (ddSize.key !== vDropdown) { ddSize.key = vDropdown; ddSize.dw = 0; ddSize.dh = 0; }
    const ddMenu = box.querySelector('.layout-dd-menu');
    if (ddMenu && window.Dashboard && Dashboard.addMenuResizeGrip) Dashboard.addMenuResizeGrip(ddMenu, { lists: ['.layout-ch-list'], state: ddSize });
    // un menú que no cabe a la derecha (los botones de más a la derecha en una pantalla angosta) se abre hacia la izquierda, pegado al borde de su botón
    const menuNow = box.querySelector('.layout-dd-menu');
    if (menuNow && menuNow.getBoundingClientRect().right > document.documentElement.clientWidth - 8) { menuNow.style.left = 'auto'; menuNow.style.right = '0'; }
    if (keep) { const menuEl = box.querySelector('.layout-dd-menu'); if (menuEl) menuEl.scrollTop = keep.menu; const listEl = box.querySelector('#layout-ch-list'); if (listEl) listEl.scrollTop = keep.list; }
    if (vDropdown && vSearch[vDropdown] && ddFocus) {
        const inp = $(`layout-dd-input-${vDropdown}`);
        if (inp) { inp.focus({ preventScroll: true }); inp.setSelectionRange(inp.value.length, inp.value.length); } // preventScroll: enfocar la caja de arriba no debe subir la lista
    }
}
const ddSize = { key: '', dw: 0, dh: 0 }; // lo que se amplió el desplegable abierto de la franja (ancho y alto de más)
// ---- «Elegir» ---------------------------------------------------------------------------------------------------------------------------------------------
const chosenList = () => state.pick;
// «Elegir»: las clasificaciones (tipos) prendidas en las pastillas de abajo del buscador; vacío = todas. Se pueden prender varias a la vez.
const vChooseTypes = new Set();
// «Localizador»: en cada paso (huella, activo, nivel, espacio, posición) se marcan UNO O VARIOS; sel guarda lo marcado de cada paso (huella: id; activo: id; nivel: «activo|nivel»; espacio: «activo|nivel|espacio»;
// posición: «activo|nivel|espacio|número») y step es la lista que se está viendo («Listo» baja al paso siguiente con lo marcado).
const locEmpty = () => ({ fp: [], sp: [], n: [], c: [], pos: [], cell: [] });
const vLoc = { step: 'fp', sel: locEmpty(), scope: null }; // scope = lo que Elegir tenía escogido al empezar el recorrido (sigue acotando sus listas)
const locReset = () => { vLoc.step = 'fp'; vLoc.sel = locEmpty(); vLoc.scope = null; };
// Todo lo que se puede elegir (lo que el árbol deja ver), por tipo: las mismas listas del buscador.
function chooseCatalog() {
    const d = state.draft;
    const lists = findLists(d);
    const inside = state.zoneScope.length ? scopeInside(d, state.zoneScope) : null;
    const out = [];
    FIND_TYPES.forEach((ft) => {
        if (!stepVisible(ft.step)) return;
        if (ft.type === 'zone') return; // las zonas se eligen en el botón Zona, no aquí
        (lists[ft.type]() || []).forEach((i) => {
            if (state.mode !== 'edit' && !stepOn(i.step || ft.step)) return; // Qué ver (en Ver): solo los tipos con su capa encendida; en Editar se elige de todo y lo elegido enciende su paso
            if (inside && inside[ft.type] && !inside[ft.type].has(i.id)) return; // Zona: solo lo que hay dentro de las zonas elegidas
            out.push({ type: ft.type, id: i.id, title: i.title, sub: i.sub, hay: i.hay, step: i.step || ft.step });
        });
    });
    return out;
}
function chooseBodyHtml() {
    const cat = chooseCatalog();
    const types = FIND_TYPES.map((ft) => ft.type).filter((ty) => cat.some((i) => i.type === ty));
    const chosen = chosenList();
    const matched = cat.filter((i) => ddMatch('choose', i.hay));
    const rows = vChooseTypes.size ? matched.filter((i) => vChooseTypes.has(i.type)) : matched;
    const CAP = 150;
    let shown = 0;
    let list = '';
    types.forEach((ty) => {
        const items = rows.filter((i) => i.type === ty).slice(0, Math.max(0, CAP - shown));
        if (!items.length) return;
        shown += items.length;
        list += items.map((i) => ddItem(`data-ch-pick data-ch-kind="${esc(i.type)}" data-ch-id="${esc(i.id)}" data-ch-step="${esc(i.step || '')}"`, chosen.some((c) => c.type === i.type && c.id === i.id), `${esc(i.title)} <small>${esc(i.sub || '')}</small>`)).join('');
    });
    if (!cat.length) list = `<div class="layout-find-empty">${esc(t('main.layoutElegirNada'))}</div>`;
    else if (!rows.length) list = `<div class="layout-find-empty">${esc(t('main.layoutFindSin'))}</div>`;
    else if (rows.length > shown) list += `<div class="layout-find-empty">${esc(t('main.layoutElegirMas'))}</div>`;
    // las clasificaciones, horizontales debajo del buscador: cada número es lo que coincide con lo escrito
    const countBy = {};
    matched.forEach((i) => { countBy[i.type] = (countBy[i.type] || 0) + 1; });
    const chip = (id, label, n, on) => `<button type="button" class="layout-find-type" data-ch-type="${id}" aria-pressed="${on}">${esc(label)} <span class="layout-find-n">${n}</span></button>`;
    const chips = types.length > 1 ? `<div class="layout-find-types" role="group" data-help-key="layoutFiltroElegirTipos">${chip('all', t('main.layoutFindTipoTodo'), matched.length, !vChooseTypes.size)}${types.map((ty) => chip(ty, t(`main.layoutFindTipo_${ty}`), countBy[ty] || 0, vChooseTypes.has(ty))).join('')}</div>` : '';
    return { list, count: t('main.layoutFiltroNElegidos', { n: chosen.length }), chips };
}
function chooseMenuHtml() {
    if (vDropdown !== 'choose' || !state.draft) return '';
    const b = chooseBodyHtml();
    return `<div class="layout-ch-head">${searchRowHtml('choose')}<div id="layout-ch-chips">${b.chips}</div></div><div class="layout-ch-list" id="layout-ch-list">${b.list}</div><div class="layout-ch-foot"><span id="layout-ch-count">${esc(b.count)}</span><button type="button" data-ch-clear>${esc(t('main.layoutElegirLimpiar'))}</button></div>`;
}
// Solo la lista, las pastillas y el contador se vuelven a dibujar mientras se escribe (el buscador no se toca para no perder el cursor).
function renderChooseBody() {
    const b = chooseBodyHtml();
    const list = $('layout-ch-list'); const count = $('layout-ch-count'); const chipsBox = $('layout-ch-chips');
    if (chipsBox) chipsBox.innerHTML = b.chips;
    if (list) list.innerHTML = b.list;
    if (count) count.textContent = b.count;
}
// ---- «Localizador» ---------------------------------------------------------------------------------------------------------------------------------
// Un buscador que baja paso a paso por el Localizador: Huella › Activo › Nivel › Espacio › Posición. En cada paso se marcan uno o varios (casillas) y «Listo» baja al paso siguiente con lo marcado: la lista de cada paso junta lo
// que hay dentro de todo lo marcado antes. Lo marcado más abajo se enfoca en el croquis y en el 3D: varias huellas o activos como en Elegir; varios niveles, espacios o posiciones se resaltan dentro de sus activos (state.hlList).
// Es solo de pantalla: no cambia nada de lo guardado.
// Huella › Activo › Nivel › Espacio › Posición › Localizador. «Posición» es la pieza P de un espacio (P001); «Localizador» es el código completo de las posiciones marcadas (Z006.H001.R001.N001.E001.P001): se marcan
// las posiciones y, en el último paso, se puede dejar solo alguno de sus localizadores (sel.cell, siempre dentro de sel.pos; vacío = todas las posiciones marcadas).
const LOC_STEPS = ['fp', 'sp', 'n', 'c', 'pos', 'cell'];
const LOC_LABEL = { fp: 'main.colLocHuella', sp: 'main.colLocActivo', n: 'main.colLocNivel', c: 'main.layoutLocPosicion', pos: 'main.layoutLocPos', cell: 'main.layoutFiltroLocalizador' };
const locPad = (n) => String(n).padStart(3, '0');
const locAny = () => LOC_STEPS.some((k) => vLoc.sel[k].length);
const locDeepest = () => { for (let i = LOC_STEPS.length - 1; i >= 0; i -= 1) if (vLoc.sel[LOC_STEPS[i]].length) return LOC_STEPS[i]; return ''; };
const locSpaceOf = (id) => (state.draft.spaces || []).find((x) => x.id === id) || null;
// El código completo de lo marcado en un paso (Z006.H001.A020.N001.E001.P001 hasta donde llegue ese paso)
function locCodeOfKey(step, key) {
    const d = state.draft;
    const parts = String(key).split('|');
    if (step === 'fp') {
        const f = (d.footprints || []).find((x) => x.id === key);
        const z = f && (d.zones || []).find((x) => x.id === f.zoneId);
        return [z && z.code, f && f.code].filter(Boolean).join('.');
    }
    const s = locSpaceOf(parts[0]);
    const f = s && (d.footprints || []).find((x) => x.id === s.footprintId);
    const z = f && (d.zones || []).find((x) => x.id === f.zoneId);
    const out = [z && z.code, f && f.code, s && s.code];
    if (step === 'n' || step === 'c' || step === 'pos' || step === 'cell') out.push(`N${locPad(parts[1])}`);
    if (step === 'c' || step === 'pos' || step === 'cell') out.push(`E${locPad(parts[2])}`);
    if (step === 'pos' || step === 'cell') out.push(`P${locPad(parts[3])}`);
    return out.filter(Boolean).join('.');
}
// La pieza corta de lo marcado en un paso (H001, A004, N002, E001, P001); con varias, la primera y «+ cuántas más»
function locPart(step) {
    const list = vLoc.sel[step];
    if (!list.length) return '';
    const short = (key) => {
        const parts = String(key).split('|');
        if (step === 'fp') { const f = (state.draft.footprints || []).find((x) => x.id === key); return f ? (f.code || '') : ''; }
        if (step === 'sp') { const s = locSpaceOf(key); return s ? (s.code || '') : ''; }
        if (step === 'n') return `N${locPad(parts[1])}`;
        if (step === 'c') return `E${locPad(parts[2])}`;
        if (step === 'cell') return locCodeOfKey('cell', key); // el localizador es el código completo
        return `P${locPad(parts[3])}`;
    };
    return list.length > 1 ? `${short(list[0])} +${list.length - 1}` : short(list[0]);
}
// El localizador de lo más fino que se marcó: con varias cosas, el de la primera y «+ cuántas más»
function locCode() {
    const k = locDeepest();
    if (!k) return '';
    const list = vLoc.sel[k];
    const first = locCodeOfKey(k, list[0]);
    return list.length > 1 ? `${first} +${list.length - 1}` : first;
}
// Lo que el Localizador deja enfocado en Elegir: las huellas marcadas, los activos marcados o, con niveles, espacios o posiciones, los activos que los llevan.
function locExpectedPick() {
    const k = locDeepest();
    if (!k) return [];
    if (k === 'fp') return vLoc.sel.fp.map((id) => ({ type: 'footprint', id }));
    if (k === 'sp') return vLoc.sel.sp.map((id) => ({ type: 'space', id }));
    return [...new Set(vLoc.sel[k].map((key) => key.split('|')[0]))].map((id) => ({ type: 'space', id }));
}
// Lo que se resalta dentro de los activos (niveles, espacios o posiciones marcados): [{ kind, id, n, c, p }]
function locHlEntities() {
    const k = locDeepest();
    if (k !== 'n' && k !== 'c' && k !== 'pos' && k !== 'cell') return [];
    return vLoc.sel[k].map((key) => {
        const [id, n, c, p] = key.split('|');
        if (k === 'n') return { kind: 'space', id, n: Number(n) };
        if (k === 'c') return { kind: 'bay', id, n: Number(n), c: Number(c) };
        return { kind: 'bay', id, n: Number(n), c: Number(c), p: Number(p) };
    });
}
// Lo marcado de cada paso solo vale si lo de arriba sigue marcado (al cambiar una marca se quitan las de abajo que ya no caben).
function locPrune() {
    const sel = vLoc.sel;
    sel.sp = sel.sp.filter((id) => { const s = locSpaceOf(id); return s && sel.fp.includes(s.footprintId); });
    sel.n = sel.n.filter((k) => sel.sp.includes(k.split('|')[0]));
    sel.c = sel.c.filter((k) => sel.n.includes(k.split('|').slice(0, 2).join('|')));
    sel.pos = sel.pos.filter((k) => sel.c.includes(k.split('|').slice(0, 3).join('|')));
    sel.cell = sel.cell.filter((k) => sel.pos.includes(k));
}
// Elegir ↔ Localizador: lo que Elegir tiene escogido (huellas o activos) acota lo que lista el Localizador, y con UNA sola huella o UN solo activo elegido el Localizador arranca ahí. Lo que marcó el propio Localizador
// (que deja su elección como la de Elegir) no lo acota: así se puede cambiar de huella sin quitar nada.
function locAdopt() {
    if (locAny() || !state.draft || state.pick.length !== 1) return;
    const p = state.pick[0];
    if (p.type === 'footprint' && (state.draft.footprints || []).some((f) => f.id === p.id)) { vLoc.sel.fp = [p.id]; vLoc.step = 'sp'; }
    else if (p.type === 'space') {
        const s = locSpaceOf(p.id);
        if (s && s.footprintId) { vLoc.sel.fp = [s.footprintId]; vLoc.sel.sp = [s.id]; vLoc.step = 'n'; }
    }
}
const locSameSets = (a, z) => a.length === z.length && a.every((x) => z.some((y) => y.type === x.type && y.id === x.id));
function locLimits() {
    const own = locExpectedPick();
    const owned = own.length && locSameSets(state.pick, own);
    const picks = locAny() && vLoc.scope ? vLoc.scope : (owned ? [] : state.pick);
    const spaces = state.draft.spaces || [];
    const fp = new Set();
    const sp = new Set();
    picks.forEach((p) => {
        if (p.type === 'footprint') fp.add(p.id);
        if (p.type === 'space') { sp.add(p.id); const s = spaces.find((x) => x.id === p.id); if (s) fp.add(s.footprintId); }
    });
    // los activos elegidos solo acotan la lista de las huellas en las que hay alguno elegido
    const spOfFp = sp.size ? new Set([...sp].filter((id) => { const s = spaces.find((x) => x.id === id); return s && vLoc.sel.fp.includes(s.footprintId); })) : new Set();
    return { fp: fp.size ? fp : null, sp: spOfFp.size ? spOfFp : null };
}
// Lo que sale en la lista del paso en el que se va: { value, title, sub, hay }. Cada paso junta lo que hay dentro de TODO lo marcado en el anterior.
function locItems(step) {
    const d = state.draft;
    const zoneOf = (id) => (d.zones || []).find((z) => z.id === id) || {};
    const limits = locLimits();
    const sel = vLoc.sel;
    if (step === 'fp') {
        const inside = state.zoneScope.length ? scopeInside(d, state.zoneScope) : null; // el botón Zona acota lo que se puede bajar
        return (d.footprints || []).filter((x) => x.active !== false && (!inside || inside.footprint.has(x.id)) && (!limits.fp || limits.fp.has(x.id))).map((x) => {
            const z = zoneOf(x.zoneId);
            return { value: x.id, title: x.code || '', sub: [x.name, z.name].filter(Boolean).join(' · '), hay: `${locCodeOfKey('fp', x.id)} ${x.code || ''} ${x.name || ''} ${z.name || ''}` };
        });
    }
    if (step === 'sp') {
        return (d.spaces || []).filter((x) => x.active !== false && sel.fp.includes(x.footprintId) && (!limits.sp || limits.sp.has(x.id))).map((x) => ({
            value: x.id, title: x.code || '', sub: [x.ownName, typeLabel('space', x.type)].filter(Boolean).join(' · '), hay: `${locCodeOfKey('sp', x.id)} ${x.code || ''} ${x.ownName || ''} ${x.name || ''} ${typeLabel('space', x.type)}`,
        }));
    }
    const out = [];
    if (step === 'n') {
        sel.sp.forEach((sid) => {
            const s = locSpaceOf(sid);
            if (!s) return;
            for (let n = 1; n <= (s.levels || 1); n += 1) {
                const m = LC.levelMeasures(s, n);
                const lv = (s.lvls || []).find((l) => l.n === n) || {};
                const key = `${sid}|${n}`;
                out.push({ value: key, title: `${sel.sp.length > 1 ? `${s.code} · ` : ''}N${locPad(n)}`, sub: [lv.name, t('main.layoutLocMedidaNivel', { floor: fmt(m.floorH), h: fmt(m.h) })].filter(Boolean).join(' · '), hay: `${locCodeOfKey('n', key)} N${locPad(n)} ${lv.name || ''}` });
            }
        });
        return out;
    }
    if (step === 'c') {
        sel.n.forEach((nk) => {
            const [sid, nStr] = nk.split('|');
            const s = locSpaceOf(sid);
            if (!s) return;
            const n = Number(nStr);
            for (let c = 1; c <= LC.levelSlots(s, n); c += 1) {
                const m = LC.bayMeasures(s, n, c);
                const nPos = LC.positionsOfBay(d, s.id, n, c).length;
                const key = `${nk}|${c}`;
                out.push({ value: key, title: `${sel.n.length > 1 ? `${s.code}.N${locPad(n)} · ` : ''}E${locPad(c)}`, sub: `${fmt(m.l)} × ${fmt(m.w)} × ${fmt(m.h)} m · ${t('main.layoutLocNPosiciones', { n: nPos })}`, hay: `${locCodeOfKey('c', key)} E${locPad(c)}` });
            }
        });
        return out;
    }
    if (step === 'pos') {
        sel.c.forEach((ck) => {
            const [sid, nStr, cStr] = ck.split('|');
            const s = locSpaceOf(sid);
            if (!s) return;
            LC.positionsOfBay(d, s.id, Number(nStr), Number(cStr)).forEach((p) => {
                const key = `${ck}|${p.num}`;
                out.push({ value: key, title: `${sel.c.length > 1 ? `${s.code}.N${locPad(nStr)}.E${locPad(cStr)} · ` : ''}P${locPad(p.num)}`, sub: `${fmt(p.l)} × ${fmt(p.w)} × ${fmt(p.h)} m`, hay: `${locCodeOfKey('pos', key)} P${locPad(p.num)}` });
            });
        });
        return out;
    }
    // Localizador: el código completo de cada posición marcada (Z006.H001.R001.N001.E001.P001)
    sel.pos.forEach((pk) => {
        const [sid, nStr, cStr, pStr] = pk.split('|');
        const s = locSpaceOf(sid);
        if (!s) return;
        const p = LC.positionsOfBay(d, s.id, Number(nStr), Number(cStr)).find((x) => x.num === Number(pStr));
        if (!p) return;
        out.push({ value: pk, title: locCodeOfKey('cell', pk), sub: `${fmt(p.l)} × ${fmt(p.w)} × ${fmt(p.h)} m`, hay: locCodeOfKey('cell', pk) });
    });
    return out;
}
// La lista del paso en el que se va (el buscador del desplegable la filtra) y el código que se lleva armado
function locBodyHtml() {
    const stepKey = vLoc.step;
    const crumbs = `<div class="layout-find-types" role="group" data-help-key="layoutFiltroLocalizadorRuta">${LOC_STEPS.map((k) => {
        const val = locPart(k);
        const cur = k === stepKey;
        return `<button type="button" class="layout-find-type" data-loc-crumb="${k}" aria-pressed="${cur}"${val || cur ? '' : ' disabled'}>${esc(t(LOC_LABEL[k]))}${val ? ` <span class="layout-find-n">${esc(val)}</span>` : ''}</button>`;
    }).join('')}</div>`;
    const needLayer = { fp: 'espacios', sp: 'activos', n: 'niveles', c: 'posiciones', pos: 'posiciones', cell: 'posiciones' }[stepKey];
    const off = state.mode !== 'edit' && !stepOn(needLayer); // Qué ver: con la capa apagada no hay nada que bajar
    const rows = off ? [] : locItems(stepKey).filter((i) => ddMatch('loc', i.hay));
    const CAP = 150;
    const before = LOC_STEPS[LOC_STEPS.indexOf(stepKey) - 1];
    const head = `<div class="layout-ch-grp">${esc(t(`main.layoutLocElige_${stepKey}`, { code: before ? locPart(before) : '' }))}</div>`;
    const list = head + (off
        ? `<div class="layout-find-empty">${esc(t('main.layoutLocCapaApagada', { layer: t(SECTION_LABEL_KEYS[needLayer]) }))}</div>`
        : rows.length
        ? rows.slice(0, CAP).map((i) => ddItem(`data-loc-pick="${stepKey}" data-loc-val="${esc(i.value)}"`, vLoc.sel[stepKey].includes(i.value), `<b>${esc(i.title)}</b> <small>${esc(i.sub || '')}</small>`)).join('') + (rows.length > CAP ? `<div class="layout-find-empty">${esc(t('main.layoutElegirMas'))}</div>` : '')
        : `<div class="layout-find-empty">${esc(t('main.layoutFindSin'))}</div>`);
    return { crumbs, list, code: locCode(), canNext: vLoc.sel[stepKey].length > 0 };
}
function locMenuHtml() {
    if (vDropdown !== 'loc' || !state.draft) return '';
    const b = locBodyHtml();
    const last = vLoc.step === 'cell';
    return `<div class="layout-ch-head">${searchRowHtml('loc')}<div id="layout-loc-chips">${b.crumbs}</div></div><div class="layout-ch-list" id="layout-loc-list">${b.list}</div><div class="layout-ch-foot"><span id="layout-loc-code">${esc(b.code || '—')}</span><span class="layout-ch-acts"><button type="button" data-loc-next${b.canNext ? '' : ' disabled'}>${esc(t(last ? 'main.layoutLocListoFin' : 'main.layoutLocListo'))}</button><button type="button" data-loc-clear>${esc(t('main.layoutElegirLimpiar'))}</button></span></div>`;
}
// Mientras se escribe solo se vuelve a dibujar la lista (la caja no se toca para no perder el cursor).
function renderLocBody() {
    const b = locBodyHtml();
    const list = $('layout-loc-list');
    if (list) list.innerHTML = b.list;
}
// Si lo que se enfocó cambió por otro lado (Elegir, Zona, otro Layout), el recorrido empieza de nuevo y su resaltado se quita.
function locSync() {
    locAdopt();
    if (!locAny() || !state.draft) return;
    const d = state.draft;
    const alive = vLoc.sel.fp.every((id) => (d.footprints || []).some((x) => x.id === id)) && vLoc.sel.sp.every((id) => (d.spaces || []).some((x) => x.id === id));
    const exp = locExpectedPick();
    if (alive && locSameSets(state.pick, exp)) return;
    locReset();
    if (state.hlList || (state.hl && state.hl.loc)) { state.hl = null; state.hlList = null; applyHighlight(false); }
}
// Enfocar lo que se lleva marcado: las huellas o los activos y, con niveles, espacios o posiciones, resaltarlos dentro de sus activos (croquis y 3D).
function locApply(opts) {
    const stay = !!(opts && opts.stay); // desde la tabla de Localizadores: la tabla de abajo se queda en ese paso
    const k = locDeepest();
    if (!k) { state.pick = []; state.hl = null; state.hlList = null; applyViewFocus(); renderViewStrip(); return; }
    const inSpace = k !== 'fp';
    const step = inSpace ? 'activos' : 'espacios';
    if (!stepOn(step)) { state.steps = [...state.steps, step]; fixLayerFocus(); } // la capa de lo enfocado se enciende si estaba apagada
    // en Editar la tabla de abajo pasa al paso de lo marcado: Huella-Espacio, Activos, Niveles o Posiciones
    if (state.mode === 'edit' && !stay) {
        // con posiciones marcadas la tabla es la de Posiciones; con espacios, la de Espacios; con niveles, la de Niveles
        const isPos = k === 'pos' || k === 'cell';
        const tableStep = [isPos ? 'ubicaciones' : '', isPos || k === 'c' ? 'posiciones' : '', k === 'n' ? 'niveles' : '', step].find((s) => s && stepVisible(s));
        showStep(tableStep || step);
    }
    state.pick = locExpectedPick();
    state.hl = null;
    state.hlList = null;
    applyViewFocus();
    const ents = locHlEntities();
    if (ents.length) {
        const label = locCode();
        selectEntity({ ...ents[0], loc: label }, 'zoom');
        state.hlList = ents.map((e) => ({ ...e, loc: label, step: state.hl.step, strong: state.hl.strong }));
        applyHighlight(false);
        loc3dFocus = !!state.view3d;
        scheduleScene3d();
    }
    if (state.mode === 'edit') renderPanel();
    renderViewStrip();
}
// Paso Localizadores: tocar un renglón elige ESE localizador (lo mismo que bajarlo con el botón «Localizador» de arriba): en el croquis, el 3D y la tabla solo se ve lo suyo. Tocarlo otra vez lo suelta.
// Zona, huella, activo o posición: el renglón dice hasta dónde llega. Las zonas se eligen con el botón Zona.
function locatorRowPick(code) {
    if (!state.draft || !code) return;
    const r = LC.locatorRows(state.draft).rows.find((x) => x.locator === code);
    if (!r || r.scope === 'zone') return;
    const was = locAny() ? locCode().replace(/\s\+\d+$/, '') : '';
    if (was === code) {
        locReset();
        locApply({ stay: true });
        if (state.mode === 'edit') renderPanel();
        return;
    }
    locReset();
    vLoc.sel.fp = [r.footprintId];
    if (r.scope !== 'footprint') vLoc.sel.sp = [r.spaceId];
    if (r.scope === 'position') {
        const n = `${r.spaceId}|${r.level}`;
        const c = `${n}|${r.slot}`;
        const p = `${c}|${r.position}`;
        vLoc.sel.n = [n]; vLoc.sel.c = [c]; vLoc.sel.pos = [p]; vLoc.sel.cell = [p];
    }
    vLoc.step = r.scope === 'position' ? 'cell' : (r.scope === 'asset' ? 'n' : 'sp');
    locApply({ stay: true });
}
// Marcar o desmarcar una opción de la lista del paso (casilla); lo que ya no cabe en los pasos de abajo se quita.
function locPick(step, value) {
    if (step === 'fp' && !locAny()) vLoc.scope = state.pick.length ? state.pick.map((p) => ({ ...p })) : null; // lo que Elegir tenía escogido sigue acotando las listas de los pasos que siguen
    const list = vLoc.sel[step];
    vLoc.sel[step] = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
    if (step === 'pos') vLoc.sel.cell = []; // al cambiar las posiciones, el Localizador vuelve a ser el de todas las marcadas
    locPrune();
    ddFocus = false;
    locApply();
}
// «Listo»: baja al paso siguiente con lo marcado (en el último, cierra el desplegable para ver dónde cayó).
function locNext() {
    if (!vLoc.sel[vLoc.step].length) return;
    const at = LOC_STEPS.indexOf(vLoc.step);
    if (at >= LOC_STEPS.length - 1) { vDropdown = ''; renderViewStrip(); return; }
    vLoc.step = LOC_STEPS[at + 1];
    if (vLoc.step === 'cell' && !vLoc.sel.cell.length) vLoc.sel.cell = [...vLoc.sel.pos]; // el Localizador arranca con todas las posiciones marcadas; se pueden quitar las que no
    vSearch.loc.q = '';
    ddFocus = false;
    renderViewStrip();
}
// Regresar a un paso: se ve su lista otra vez (lo marcado sigue marcado).
function locBack(step) {
    vLoc.step = step;
    vSearch.loc.q = '';
    ddFocus = false;
    renderViewStrip();
}
function fixLayerFocus() {
    if (state.steps.length && !state.steps.includes(state.focus)) state.focus = state.steps[state.steps.length - 1];
    state.focusStack = state.focusStack.filter((x) => state.steps.includes(x));
    if (!state.focusStack.length && state.steps.length) state.focusStack = [state.focus];
}
// Zona, Qué ver y Elegir van de la mano: Zona acota el universo (solo lo que hay dentro de las zonas elegidas), Qué ver dice qué tipos cuentan (los de las capas encendidas) y Elegir señala cosas en específico dentro de eso.
// Al cambiar Zona o Qué ver, lo elegido que ya no cae en ese alcance se quita. Con cosas elegidas se enfocan ellas; sin ellas, se enfocan las zonas (con los tipos de Qué ver); sin nada, se ve todo.
function applyViewFocus() {
    const before = JSON.stringify(state.find);
    const universe = new Set(chooseCatalog().map((i) => `${i.type}:${i.id}`));
    state.pick = state.pick.filter((p) => universe.has(`${p.type}:${p.id}`));
    const zones = state.zoneScope.filter((id) => (state.draft.zones || []).some((z) => z.id === id));
    state.zoneScope = zones;
    if (state.pick.length) state.find = { kind: 'items', id: state.pick[0].id, items: state.pick };
    else if (zones.length) state.find = { kind: 'zone', id: zones[0], ids: zones };
    else state.find = null;
    state.findScope = zones.length ? 'zones' : 'all';
    syncFindTypesFromSteps();
    applyFind(before !== JSON.stringify(state.find));
}
function setRest(mode) {
    if (state.findMode === mode) return;
    setFindMode(mode);
    if (state.find) applyFind(true); else if (virtualFind()) { fxLastKey = ''; fxReframe(); renderSvg(); } else if (picker3d && pickerFocus()) scheduleScene3d();
    renderViewStrip();
}
$('layout-mode-edit').addEventListener('click', goEdit);
$('layout-mode-view').addEventListener('click', goView);
$('layout-vstrip-filters').addEventListener('click', (event) => {
    const dd = event.target.closest('[data-dd]');
    if (dd) { event.stopPropagation(); const key = dd.getAttribute('data-dd'); vDropdown = vDropdown === key ? '' : key; vChooseTypes.clear(); if (vSearch[vDropdown]) { vSearch[vDropdown].q = ''; vSearch[vDropdown].open = ''; ddFocus = true; } renderViewStrip(); return; }
    // el buscador de cada desplegable: el tipo de filtro, los signos y sus opciones
    const sbtn = event.target.closest('button[data-dds]');
    if (sbtn) {
        const row = sbtn.closest('[data-dd-search]');
        const s = vSearch[row.getAttribute('data-dd-search')];
        const which = sbtn.getAttribute('data-dds');
        s.open = s.open === which ? '' : which;
        row.querySelectorAll('[data-dds-menu]').forEach((m) => { m.hidden = m.getAttribute('data-dds-menu') !== s.open; });
        return;
    }
    const modeOpt = event.target.closest('[data-dds-mode]');
    if (modeOpt) { const s = vSearch[modeOpt.closest('[data-dd-search]').getAttribute('data-dd-search')]; s.mode = modeOpt.getAttribute('data-dds-mode'); s.open = ''; ddFocus = true; renderViewStrip(); return; }
    const signOpt = event.target.closest('[data-dds-sign]');
    if (signOpt) {
        if (signOpt.disabled) return;
        const row = signOpt.closest('[data-dd-search]');
        const key = row.getAttribute('data-dd-search');
        const input = row.querySelector('[data-dds="input"]');
        const sign = signOpt.getAttribute('data-dds-sign');
        const typed = sign === ',' ? ', ' : sign;
        const start = input.selectionStart == null ? input.value.length : input.selectionStart;
        const end = input.selectionEnd == null ? start : input.selectionEnd;
        input.value = input.value.slice(0, start) + typed + input.value.slice(end);
        vSearch[key].q = input.value;
        vSearch[key].open = '';
        row.querySelectorAll('[data-dds-menu]').forEach((m) => { m.hidden = true; });
        renderDdList(key);
        input.focus();
        try { input.setSelectionRange(start + typed.length, start + typed.length); } catch (err) { /* algunos teclados no dejan mover el cursor */ }
        return;
    }
    // «Todas las zonas» y «Todo»: un clic pone todo (o, si ya estaba todo, lo quita) y el doble clic siempre quita todo.
    const allItem = event.target.closest('[data-dd-all]');
    if (allItem) {
        const forceNone = event.detail >= 2;
        if (allItem.getAttribute('data-dd-all') === 'zone') {
            const zones = (state.draft.zones || []).filter((z) => z.active !== false);
            const allPicked = zones.length > 0 && state.zoneScope.length === zones.length;
            // sin filtro (todas las zonas a la vista) o con unas cuantas: se marcan todas; con todas marcadas, o con doble clic: se quitan (vuelve a «Todas», sin filtro)
            state.zoneScope = forceNone || allPicked ? [] : zones.map((z) => z.id);
        } else {
            const visible = queVerSteps();
            if (state.mode === 'edit') fxToggleAll(); // en Editar siempre queda al menos un paso encendido (Contorno)
            else {
                if (forceNone || visible.every(stepOn)) state.steps = state.steps.filter((x) => INFO_STEPS.includes(x) || x === 'zonas'); else showAllLayers(); // las zonas no se apagan aquí: se filtran con el botón Zona
                fixLayerFocus();
            }
        }
        applyViewFocus();
        return;
    }
    const zoneItem = event.target.closest('[data-dd-zone]');
    if (zoneItem) {
        const id = zoneItem.getAttribute('data-dd-zone');
        state.zoneScope = state.zoneScope.includes(id) ? state.zoneScope.filter((x) => x !== id) : [...state.zoneScope, id];
        applyViewFocus();
        return;
    }
    const layerItem = event.target.closest('[data-dd-layer]');
    if (layerItem) {
        const s = layerItem.getAttribute('data-dd-layer');
        if (state.mode === 'edit') {
            // en Editar es lo mismo que tocar la pastilla del paso: encender lo enfoca y apagar deja siempre uno encendido
            if (!stepOn(s)) showStep(s);
            else if (state.steps.length > 1) { state.steps = state.steps.filter((x) => x !== s); state.focusStack = state.focusStack.filter((x) => x !== s); focusStep([...state.focusStack].reverse().find(stepOn) || state.steps[0]); }
            applyViewFocus();
            renderPanel();
            refreshLive();
            return;
        }
        if (stepOn(s)) state.steps = state.steps.filter((x) => x !== s); else state.steps = [...state.steps, s];
        fixLayerFocus();
        applyViewFocus(); // en «Ver» el panel no se ve: no se vuelve a dibujar (dejaría siempre una capa encendida)
        return;
    }
    const restBtn = event.target.closest('[data-dd-rest]');
    if (restBtn) { setRest(restBtn.getAttribute('data-dd-rest')); return; }
    // «Localizador»: elegir en la lista del paso, regresar a un paso con las pastillas o quitar todo. La lista se vuelve a dibujar: sin stopPropagation el clic parecería de afuera y cerraría el desplegable.
    const locPickBtn = event.target.closest('[data-loc-pick]');
    if (locPickBtn) { event.stopPropagation(); locPick(locPickBtn.getAttribute('data-loc-pick'), locPickBtn.getAttribute('data-loc-val')); return; }
    if (event.target.closest('[data-loc-next]')) { event.stopPropagation(); locNext(); return; }
    const locCrumb = event.target.closest('[data-loc-crumb]');
    if (locCrumb) { event.stopPropagation(); if (!locCrumb.disabled) locBack(locCrumb.getAttribute('data-loc-crumb')); return; }
    if (event.target.closest('[data-loc-clear]')) { event.stopPropagation(); locReset(); vSearch.loc.q = ''; ddFocus = false; locApply(); return; }
    // «Elegir»: tocar una pastilla de clasificación la prende o la apaga (varias a la vez); «Todo» las apaga todas
    const chType = event.target.closest('[data-ch-type]');
    if (chType) {
        event.stopPropagation(); // la pastilla se vuelve a dibujar: sin esto el clic parecería de afuera y cerraría el desplegable
        const ty = chType.getAttribute('data-ch-type');
        if (ty === 'all') vChooseTypes.clear(); else if (vChooseTypes.has(ty)) vChooseTypes.delete(ty); else vChooseTypes.add(ty);
        renderChooseBody();
        return;
    }
    const pick = event.target.closest('[data-ch-pick]');
    if (pick) {
        const type = pick.getAttribute('data-ch-kind');
        const id = pick.getAttribute('data-ch-id');
        const adding = !state.pick.some((c) => c.type === type && c.id === id);
        state.pick = adding ? [...state.pick, { type, id }] : state.pick.filter((c) => !(c.type === type && c.id === id));
        ddFocus = false;
        // en Editar lo que se elige enciende su paso y la tabla de abajo pasa a él
        const pickStep = pick.getAttribute('data-ch-step');
        if (state.mode === 'edit' && adding && pickStep && stepVisible(pickStep)) showStep(pickStep);
        applyViewFocus();
        if (state.mode === 'edit') renderPanel();
        return;
    }
    if (event.target.closest('[data-ch-clear]')) { ddFocus = false; state.pick = []; applyViewFocus(); if (state.mode === 'edit') renderPanel(); }
});
$('layout-vstrip-filters').addEventListener('input', (event) => {
    const el = event.target;
    if (!el || !el.getAttribute || el.getAttribute('data-dds') !== 'input') return;
    const key = el.closest('[data-dd-search]').getAttribute('data-dd-search');
    vSearch[key].q = el.value;
    ddFocus = true;
    renderDdList(key);
});
document.addEventListener('click', (event) => { if (vDropdown && !event.target.closest('.layout-dd')) { vDropdown = ''; renderViewStrip(); } });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && vDropdown) { vDropdown = ''; renderViewStrip(); } });

const ZONE_CLASS = { dry: 'lz-dry', cold: 'lz-cold', chemical: 'lz-chem', finished: 'lz-fin', dock: 'lz-dock', office: 'lz-office', aisle: 'lz-aisle', aisle2: 'lz-aisle2' };
function renderSvg(underlay) {
    // El croquis puede estar girado (icono Girar): todo se dibuja desde una copia girada del borrador; lo guardado y las tablas no se tocan.
    const rot = state.rotation || 0;
    const full = rot ? LC.rotateLayout(state.draft, rot) : state.draft;
    // Con un enfoque (buscar una zona o una huella) solo se dibuja lo que hay adentro: sin paredes, puertas, luz ni columnas, y con los botones de ocultar de la búsqueda (ver findLayout).
    const fv = findView(full);
    const d = fv.d;
    const finding = fv.finding;
    const zoneFocus = finding && !!activeFind() && (activeFind().kind === 'zone' || activeFind().kind === 'items'); // con zonas enfocadas se dibuja lo que pidió «Qué ver» (la lista ya viene filtrada)
    const dimmed = fv.dimmed; // el resto de la nave se ve «tenue» (se dibuja todo y lo que no es de lo enfocado se apaga)
    const sN = state.showNames;
    const sA = state.showArea;
    const sM = state.showMeasures;
    // con zonas enfocadas y el resto «Oculto» manda «Qué ver» (la lista ya viene filtrada por tipo): lo de adentro se dibuja aunque su paso esté apagado en la franja
    const FOCUS_STEPS = ['paredes', 'puertas', 'obstaculos', 'seguridad', 'techos', 'sensores', 'luz', 'transito', 'objetos', 'pisos', 'rampas', 'espacios', 'activos'];
    const on = underlay ? () => true : (zoneFocus && !dimmed ? (step) => stepOn(step) || FOCUS_STEPS.includes(step) : stepOn);
    const showFp = finding ? (on('espacios') || activeFind().kind === 'footprint' || activeFind().kind === 'items') : on('espacios');
    const showSp = on('activos') || on('posiciones') || on('niveles') || on('ubicaciones');
    const W = 700;
    const H = 460;
    const M = 36;
    const frame = d._frame || d.vertices; // con zonas enfocadas el croquis se acerca al recuadro de las zonas (_frame) sin perder el contorno real
    const xs = frame.map((p) => p[0]);
    const ys = frame.map((p) => p[1]);
    let x0 = Math.min(...xs); let x1 = Math.max(...xs); let y0 = Math.min(...ys); let y1 = Math.max(...ys);
    if (state.planImage && d.plan && !rot) {
        x0 = Math.min(x0, 0); y0 = Math.min(y0, 0); x1 = Math.max(x1, d.plan.widthM); y1 = Math.max(y1, d.plan.widthM * state.planAspect);
    }
    // Una puerta que abre hacia afuera puede salirse del contorno: el croquis crece lo necesario para que su giro (o recorrido) se vea completo.
    if (stepOn('puertas') && state.showOpening) {
        (d.doors || []).forEach((door) => {
            const op = LC.doorOpening(d, door);
            if (op) op.pts.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
        });
    }
    const spanX = Math.max(x1 - x0, 1);
    const spanY = Math.max(y1 - y0, 1);
    const sc = Math.min((W - 2 * M) / spanX, (H - 2 * M - 14) / spanY);
    const ox = M + ((W - 2 * M) - spanX * sc) / 2;
    const oy = M + (d._frame ? Math.max(0, ((H - 2 * M - 14) - spanY * sc) / 2) : 0); // con un enfoque (recuadro _frame) lo enfocado queda centrado también hacia arriba y abajo
    const X = (x) => ox + (x - x0) * sc;
    const Y = (y) => oy + (y - y0) * sc;
    view = { sc, W, rot, x0, y0, ox, oy };
    // Los pasillos van sombreados con rayas (principal: rayas; entre anaqueles: puntos).
    let s = '<defs><pattern id="lvl-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" stroke="#A63FB5" stroke-opacity="0.45" stroke-width="2"/></pattern><marker id="lvl-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#A63FB5"/></marker><pattern id="lh-main" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="var(--color-surface)"/><line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-text-secondary)" stroke-width="2.4" opacity="0.4"/></pattern><pattern id="lh-between" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="var(--color-surface)"/><circle cx="3" cy="3" r="1.15" fill="var(--color-text-secondary)" opacity="0.5"/></pattern></defs>';
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
    // Los pisos van DEBAJO de las zonas (el orden de los pasos es el empalme) y las rampas ENCIMA de ellas (una rampa une dos pisos y cruza las zonas). Niveles de piso (icono «Niveles»): cada PISO más alto o más bajo que el piso de la nave lleva rayas y su nivel; una rampa, un degradado hacia su lado más alto con una flecha y de qué nivel a cuál va. Salen con el paso Pisos.
    let rampLayerOut = ''; // las rampas se dibujan después de las zonas (más abajo)
    if (state.showLevels && (on('pisos') || on('rampas'))) {
        let lvlLayer = '';
        let rampLayer = '';
        const signed = (v) => `${v > 0 ? '+' : ''}${fmt(v)} m`;
        LC.floorsAll(d).filter((f) => (f.isRamp ? on('rampas') : on('pisos'))).forEach((f) => {
            if (f.active === false || !LC.zoneHasLevel(f) || !(f.l > 0 && f.w > 0)) return;
            const bx0 = X(f.x); const bx1 = X(f.x + f.l); const by0 = Y(f.y); const by1 = Y(f.y + f.w);
            const rect = `x="${bx0.toFixed(1)}" y="${by0.toFixed(1)}" width="${(bx1 - bx0).toFixed(1)}" height="${(by1 - by0).toFixed(1)}"`;
            const lo = Number(f.lvl) || 0;
            const ramp = f.lvl2 !== undefined && LC.ZONE_RISES.includes(f.rise);
            const hi = ramp ? Number(f.lvl2) : lo;
            let note = signed(lo);
            // el color de cada piso sale de su nivel (o de su formato propio): ya no toma el de la zona que toca
            const lvlCols = LC.floorLevelColors(d);
            const colOf = (v) => lvlCols[Math.round(v * 100) / 100] || '#e9e9ee';
            // una rampa se difumina entre los colores de los dos pisos que toca (rampEndColors); sin eso, entre los de sus dos niveles
            const endCols = (ramp && LC.rampEndColors(d, f)) || { lo: colOf(lo), hi: colOf(hi) };
            const quad = `${bx0.toFixed(1)},${by0.toFixed(1)} ${bx1.toFixed(1)},${by0.toFixed(1)} ${bx1.toFixed(1)},${by1.toFixed(1)} ${bx0.toFixed(1)},${by1.toFixed(1)}`;
            const fpid = `ff-${String(f.id).replace(/[^A-Za-z0-9_-]/g, '')}`;
            if (ramp) {
                const gid = `lvg-${String(f.id).replace(/[^A-Za-z0-9_-]/g, '')}`;
                const dir = { right: [0, 0, 1, 0], left: [1, 0, 0, 0], down: [0, 0, 0, 1], up: [0, 1, 0, 0] }[f.rise];
                if (f.fmt) rampLayer += `<g class="lvl-floor">${window.LayoutMapSvg.zonePaint(fpid, LC.floorFmtOf(d, f)).markup(quad)}</g>`;
                else rampLayer += `<linearGradient id="${gid}" x1="${dir[0]}" y1="${dir[1]}" x2="${dir[2]}" y2="${dir[3]}"><stop offset="0" stop-color="${endCols.lo}"/><stop offset="1" stop-color="${endCols.hi}"/></linearGradient><rect class="lvl-ramp" style="stroke:${LC.mixHex(colOf(hi), '#000000', 0.4)}" ${rect} fill="url(#${gid})"/>`;
                const cx = (bx0 + bx1) / 2; const cy = (by0 + by1) / 2;
                const half = f.rise === 'left' || f.rise === 'right' ? (bx1 - bx0) / 3 : (by1 - by0) / 3;
                const v = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] }[f.rise];
                rampLayer += `<line class="lvl-arrow" x1="${(cx - v[0] * half).toFixed(1)}" y1="${(cy - v[1] * half).toFixed(1)}" x2="${(cx + v[0] * half).toFixed(1)}" y2="${(cy + v[1] * half).toFixed(1)}"/>`;
                note = `${signed(lo)} → ${signed(hi)}`;
            } else lvlLayer += `<g class="lvl-floor">${window.LayoutMapSvg.zonePaint(fpid, LC.floorFmtOf(d, f)).markup(quad)}</g>`;
            const label = textWithHalo('llvl', ((bx0 + bx1) / 2).toFixed(1), (((by0 + by1) / 2) + (ramp ? 16 : 4)).toFixed(1), 'middle', esc(`${f.code} ${note}`), ` data-lf="${esc(f.id)}"`);
            zoneHalos += label.halo;
            zoneLabels += label.main;
        });
        // con zonas enfocadas y el resto «Oculto» los pisos y las rampas solo se ven DENTRO de esas zonas (solo esa parte): se recortan con el dibujo de las zonas elegidas
        if (zoneFocus && !dimmed && (lvlLayer || rampLayer)) {
            const clipPoly = (d.zones || []).map((z) => `<polygon points="${LC.zonePoints(z).map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}"/>`).join('');
            s += `<defs><clipPath id="fx-zone-clip">${clipPoly}</clipPath></defs>${lvlLayer ? `<g clip-path="url(#fx-zone-clip)">${lvlLayer}</g>` : ''}`;
            rampLayerOut = rampLayer ? `<g clip-path="url(#fx-zone-clip)">${rampLayer}</g>` : '';
        } else { s += lvlLayer; rampLayerOut = rampLayer; }
    }
    (on('zonas') ? d.zones : (finding ? d.zones.filter((z) => !dimmed || zoneFocusIds(activeFind()).includes(z.id)) : [])).forEach((z) => {
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
    s += rampLayerOut; // las rampas van ENCIMA de las zonas
    // Techos (paso Techos): cada sección de techo sobre las zonas (translúcida), con su caída y su etiqueta
    if (on('techos') && !underlay) s += roofLayerSvg(d, X, Y, sc, state.focus === 'techos' && !finding);
    // El cuadro invisible de cada piso (paso Pisos): de ahí sale su contorno al elegir su renglón de la tabla, tenga o no rayas (un piso a nivel no se pinta).
    if (on('pisos') || on('rampas')) {
        LC.floorsAll(d).filter((f) => (f.isRamp ? on('rampas') : on('pisos'))).forEach((f) => {
            if (f.active === false || !(f.l > 0 && f.w > 0)) return;
            s += `<rect class="hl-box" data-flid="${esc(f.id)}" data-hlbox="floor:${esc(f.id)}" x="${X(f.x).toFixed(1)}" y="${Y(f.y).toFixed(1)}" width="${(X(f.x + f.l) - X(f.x)).toFixed(1)}" height="${(Y(f.y + f.w) - Y(f.y)).toFixed(1)}"/>`;
        });
    }
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
        if (p.fmt) {
            // con formato propio el pasillo se pinta con su color, su trama y su borde
            const tq = `${X(p.x)},${Y(p.y)} ${X(p.x) + w},${Y(p.y)} ${X(p.x) + w},${Y(p.y) + h} ${X(p.x)},${Y(p.y) + h}`;
            s += `<g class="lzf" data-tid="${esc(p.id)}">${title}${window.LayoutMapSvg.zonePaint(`tf-${String(p.id).replace(/[^A-Za-z0-9_-]/g, '')}`, p.fmt).markup(tq)}</g>`;
        } else s += `<rect class="lz ${p.type === 'between' ? 'lz-aisle2' : 'lz-aisle'}" data-tid="${esc(p.id)}" x="${X(p.x)}" y="${Y(p.y)}" width="${w}" height="${h}">${title}</rect>`;
        if (w >= 26 && h >= 9) s += `<text class="lt3" x="${X(p.x) + w / 2}" y="${Y(p.y) + h / 2 + 3}" text-anchor="middle">${esc(p.code || '')}</text>`;
        if (why) s += `<rect class="lbad" x="${X(p.x) - 2}" y="${Y(p.y) - 2}" width="${w + 4}" height="${h + 4}" rx="3"/>`;
    });
    // El contorno de arriba es solo el marco del terreno (línea punteada) y sale con el paso Contorno; las PAREDES son obstáculos puestos encima y salen con el paso Paredes: son capas independientes (las columnas,
    // desniveles y otros salen con el paso Obstáculos).
    // Un resplandor azul claro del contorno debajo de las paredes: así, donde la pared está sobre el contorno, se ven sus orillas azules y la pared (oscura) se distingue del marco.
    if (on('contorno') && (!finding || dimmed)) s += `<polygon class="lw-halo" points="${d.vertices.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}"/>`;
    const obstacleShapes = LC.obstacleShapes(d);
    const obstaclePoly = (g) => g.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ');
    const wallStart = s.length;
    if (on('paredes') && (!finding || dimmed || zoneFocus)) {
        obstacleShapes.filter(({ o }) => o.kind === 'wall' && !o._geom).forEach(({ o, g }) => {
            const strokeW = `stroke-width:${Math.max(0.01, 3 - Math.min(g.l, g.w) * sc).toFixed(2)}px`;
            // una pared con dos alturas (o sobre dos pisos distintos) se parte en dos tiras: la del lado más alto oscura y la del más bajo clara, con su etiqueta (se calcula sobre el Layout sin girar)
            const orig = (state.draft.obstacles || []).find((x) => x.id === o.id);
            const mk = orig ? LC.wallMark(state.draft, orig, rot) : null;
            // con formato propio la pared se pinta con su color y su trama (la tira del lado más bajo, más clara)
            const ownFmt = orig && orig.fmt ? pickFmt(orig.fmt) : null;
            const wallSafe = String(o.id).replace(/[^A-Za-z0-9_-]/g, '');
            const wallPaint = (fm, sfx, ptsStr) => window.LayoutMapSvg.zonePaint(`wf-${wallSafe}${sfx}`, fm).markup(ptsStr);
            const wallLighter = ownFmt ? { ...ownFmt, fill: LC.mixHex(ownFmt.fill, '#FFFFFF', 0.55), bcolor: LC.mixHex(ownFmt.bcolor, '#FFFFFF', 0.55) } : null;
            if (!mk) { if (ownFmt) { s += `<g class="lo lo-wall" data-obid="${esc(o.id)}" style="${strokeW}"><title>${esc(o.name)}</title>${wallPaint(ownFmt, '', obstaclePoly(g))}</g>`; return; } s += `<polygon class="lo lo-wall" data-obid="${esc(o.id)}" style="${strokeW}" points="${obstaclePoly(g)}"><title>${esc(o.name)}</title></polygon>`; return; }
            const pts = (poly) => poly.map((v) => `${X(v[0])},${Y(v[1])}`).join(' ');
            if (ownFmt) s += `<g class="lo lo-wall" data-obid="${esc(o.id)}" style="${strokeW}"><title>${esc(o.name)} · ${esc(mk.label)}</title>${wallPaint(mk.dark === 'a' ? ownFmt : wallLighter, 'a', pts(mk.a))}${wallPaint(mk.dark === 'b' ? ownFmt : wallLighter, 'b', pts(mk.b))}</g>`;
            else s += `<polygon class="lo lo-wall${mk.dark === 'a' ? '' : ' lo-wall-light'}" data-obid="${esc(o.id)}" style="${strokeW}" points="${pts(mk.a)}"><title>${esc(o.name)} · ${esc(mk.label)}</title></polygon><polygon class="lo lo-wall${mk.dark === 'b' ? '' : ' lo-wall-light'}" data-obid="${esc(o.id)}" style="${strokeW}" points="${pts(mk.b)}"><title>${esc(o.name)} · ${esc(mk.label)}</title></polygon>`;
            // la etiqueta va del lado B de la pared (junto a su punto medio) y sigue el botón de medidas
            if (sM && mk.length * sc >= 36) {
                const off = (mk.thick * sc) / 2 + 9;
                const lx = X(mk.mid[0]) - mk.nx * off;
                const ly = Y(mk.mid[1]) - mk.ny * off + 3;
                const anchor = Math.abs(mk.nx) > 0.5 ? (-mk.nx > 0 ? 'start' : 'end') : 'middle';
                const lab = textWithHalo('lwall', lx.toFixed(1), ly.toFixed(1), anchor, esc(mk.label), ` data-wl="${esc(o.id)}"`);
                zoneHalos += lab.halo;
                zoneLabels += lab.main;
            }
        });
    }
    // con zonas enfocadas y el resto «Oculto» o «Enfoque» cada pared se corta al tramo que toca esas zonas (una pared larga puede ser de varias zonas): se recorta con el dibujo de las zonas elegidas, crecido lo que mide el grosor de una pared
    if (zoneFocus && !dimmed && Array.isArray(d._clip) && d._clip.length && s.length > wallStart) {
        const grown = d._clip.flatMap((cp) => LC.growPolygonShapes(cp, 0.5));
        const clipPoly = grown.map((poly) => `<polygon points="${poly.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}"/>`).join('');
        s = `${s.slice(0, wallStart)}<defs><clipPath id="fx-wall-clip">${clipPoly}</clipPath></defs><g clip-path="url(#fx-wall-clip)">${s.slice(wallStart)}</g>`;
    }
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
            if (sp.look === 'photos' && sp.modelId && sp.photos && (sp.photos.top || sp.photos.front)) {
                const bigEnough = aw >= 22 && ah >= 22;
                const useTop = !!sp.photos.top && (bigEnough || !sp.photos.front);
                const faceP = useTop ? 'top' : 'front';
                const hrefP = window.AssetLooks.photoUrl(sp.modelId, faceP, sp.photos[faceP]);
                if (useTop) {
                    // la foto de arriba tiene el frente hacia abajo de la imagen: se gira para que el frente quede del lado que mira el activo (N, S, E u O)
                    const sideP = (LC.activoFront ? (LC.activoFront(d, sp) || {}).side : '') || 'S';
                    const deg = { S: 0, N: 180, E: -90, W: 90 }[sideP] || 0;
                    const mcx = ax + aw / 2; const mcy = ay + ah / 2;
                    const iw2 = deg % 180 === 0 ? aw : ah; const ih2 = deg % 180 === 0 ? ah : aw;
                    s += `<image href="${hrefP}" x="${(mcx - iw2 / 2).toFixed(1)}" y="${(mcy - ih2 / 2).toFixed(1)}" width="${iw2.toFixed(1)}" height="${ih2.toFixed(1)}" preserveAspectRatio="none"${deg ? ` transform="rotate(${deg} ${mcx.toFixed(1)} ${mcy.toFixed(1)})"` : ''} pointer-events="none"/>`;
                } else {
                    s += `<image href="${hrefP}" x="${ax.toFixed(1)}" y="${ay.toFixed(1)}" width="${aw.toFixed(1)}" height="${ah.toFixed(1)}" preserveAspectRatio="xMidYMid meet" pointer-events="none"/>`;
                }
            }
            const spaceInk = window.LayoutMapSvg.inkFor(sp.fmt || LC.FMT_ASSET_DEFAULT);
            if (w >= 26 && h >= 9) s += `<text class="lt3" data-lf="${esc(sp.footprintId)}" data-ls="${esc(sp.id)}"${spaceInk ? ` style="fill:${spaceInk}"` : ''} x="${X(sp.x) + w / 2}" y="${Y(sp.y) + h / 2 + 3}" text-anchor="middle">${esc(sp.code)}</text>`;
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
        const op = on('puertas') && state.showOpening ? LC.doorOpening(d, door) : null;
        if (op) {
            const bad = wiIssues.get('doors:' + door.id) || {};
            const clash = !!(bad.clash || bad.clashDoor);
            const pts = op.pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
            s += `<polygon class="lopen lopen-${op.type}${clash ? ' lopen-bad' : ''}" points="${pts}"/>`;
            if (op.type === 'swing') s += `<line class="lopen-leaf" x1="${X(op.leaf[0][0]).toFixed(1)}" y1="${Y(op.leaf[0][1]).toFixed(1)}" x2="${X(op.leaf[1][0]).toFixed(1)}" y2="${Y(op.leaf[1][1]).toFixed(1)}"/>`;
            else s += `<line class="lopen-travel" x1="${X(op.travel[0][0]).toFixed(1)}" y1="${Y(op.travel[0][1]).toFixed(1)}" x2="${X(op.travel[1][0]).toFixed(1)}" y2="${Y(op.travel[1][1]).toFixed(1)}"/>`;
        }
        const movable = canMoveWallItem('doors') && !g.legacy;
        s += `<line class="ld${movable ? ' ld-drag' : ''}" data-did="${esc(door.id)}" x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}"><title>${esc(door.name)}</title></line>`;
        if (movable) s += `<line class="ld-hit" data-did="${esc(door.id)}" x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}"/>`;
        s += `<rect class="hl-box" data-hlbox="door:${esc(door.id)}" x="${(Math.min(X(a.x), X(b.x)) - 7).toFixed(1)}" y="${(Math.min(Y(a.y), Y(b.y)) - 7).toFixed(1)}" width="${(Math.abs(X(b.x) - X(a.x)) + 14).toFixed(1)}" height="${(Math.abs(Y(b.y) - Y(a.y)) + 14).toFixed(1)}" rx="3"/>`;
    });
    (on('luz') ? d.power : []).forEach((e) => {
        const pg = LC.doorGeometry(d, { ...e, width: 0 });
        if (!pg) return;
        const a = pg.a;
        if (wiIssues.has('power:' + e.id)) s += `<circle class="lbad" cx="${X(a.x)}" cy="${Y(a.y)}" r="10"/>`;
        s += `<rect class="hl-box" data-hlbox="power:${esc(e.id)}" x="${(X(a.x) - 10).toFixed(1)}" y="${(Y(a.y) - 10).toFixed(1)}" width="20" height="20" rx="3"/>`;
        const moveP = canMoveWallItem('power') && !pg.legacy;
        if (moveP) s += `<circle class="le-hit" data-pid="${esc(e.id)}" cx="${X(a.x)}" cy="${Y(a.y)}" r="15"/>`;
        s += `<circle class="le${moveP ? ' ld-drag' : ''}" data-pid="${esc(e.id)}" cx="${X(a.x)}" cy="${Y(a.y)}" r="6"><title>${esc(typeLabel('power', e.type))}</title></circle><text class="lt lx" x="${X(a.x)}" y="${Y(a.y) + 3.5}" text-anchor="middle" style="fill:var(--color-report-calc-text)" pointer-events="none">⚡</text>`;
    });
    (on('sensores') ? (d.sensors || []) : []).forEach((e) => {
        const sg = LC.doorGeometry(d, { ...e, width: 0 });
        if (!sg) return;
        const a = sg.a;
        if (wiIssues.has('sensors:' + e.id)) s += `<circle class="lbad" cx="${X(a.x)}" cy="${Y(a.y)}" r="11"/>`;
        s += `<rect class="hl-box" data-hlbox="sensor:${esc(e.id)}" x="${(X(a.x) - 11).toFixed(1)}" y="${(Y(a.y) - 19).toFixed(1)}" width="22" height="30" rx="3"/>`;
        const moveS = canMoveWallItem('sensors') && !sg.legacy;
        if (moveS) s += `<circle class="le-hit" data-nid="${esc(e.id)}" cx="${X(a.x)}" cy="${Y(a.y)}" r="15"/>`;
        // La apariencia de su MODELO (Catálogos > Activos Fijos > Modelos): «Termohigrómetro de pared» o «Registrador con sonda» se dibujan como un equipo (rectángulo con el termómetro y/o la gota de lo que mide, y el cable de la sonda);
        // sin apariencia propia («La del Tipo») sigue el círculo con «°» de siempre.
        const look = sensorLookOf(e);
        const cx = Number(X(a.x)); const cy = Number(Y(a.y));
        if (look === 'photos' && e.modelId && e.photos && (e.photos.front || e.photos.top)) {
            // Fotos del modelo (2026-11-13): el equipo se ve con su foto de frente (la de arriba si no tiene frente), con la forma de sus medidas, y su código arriba.
            const photoFace = e.photos.front ? 'front' : 'top';
            const dmS = e.dim || {};
            const ratioS = Math.min(Math.max((Number(dmS.w) || 11) / Math.max(Number(dmS.h) || 11, 1), 0.4), 2.5);
            const ihS = 20; const iwS = Math.min(ihS * ratioS, 34);
            s += `<rect class="lsn lsn-dev${moveS ? ' ld-drag' : ''}" data-nid="${esc(e.id)}" x="${(cx - iwS / 2 - 1.5).toFixed(1)}" y="${(cy - ihS / 2 - 1.5).toFixed(1)}" width="${(iwS + 3).toFixed(1)}" height="${(ihS + 3).toFixed(1)}" rx="3"><title>${esc(e.code)} · ${esc(typeLabel('sensor', e.type))}</title></rect><image href="${window.AssetLooks.photoUrl(e.modelId, photoFace, e.photos[photoFace])}" x="${(cx - iwS / 2).toFixed(1)}" y="${(cy - ihS / 2).toFixed(1)}" width="${iwS.toFixed(1)}" height="${ihS.toFixed(1)}" preserveAspectRatio="xMidYMid meet" pointer-events="none"/><text class="lt lx lt-sensor" x="${cx}" y="${(cy - ihS / 2 - 5).toFixed(1)}" text-anchor="middle" style="fill:var(--color-report-calc-text)" pointer-events="none">${esc(e.code || '')}</text>`;
            return;
        }
        if (look === 'sensor-wall' || look === 'sensor-probe') {
            const measuresT = e.type !== 'hum'; const measuresH = e.type !== 'temp';
            const tx = measuresH ? cx - 3.8 : cx;
            const glyphT = measuresT ? `<path d="M${(tx).toFixed(1)} ${(cy - 4.2).toFixed(1)} V${(cy + 1.4).toFixed(1)}" stroke="#2B8CA3" stroke-width="1.7" stroke-linecap="round" fill="none"/><circle cx="${tx.toFixed(1)}" cy="${(cy + 2.8).toFixed(1)}" r="2.1" fill="#2B8CA3"/>` : '';
            const hx = measuresT ? cx + 3.8 : cx;
            const glyphH = measuresH ? `<path d="M${hx.toFixed(1)} ${(cy - 4.4).toFixed(1)} C${(hx - 3.6).toFixed(1)} ${(cy - 0.2).toFixed(1)} ${(hx - 3.6).toFixed(1)} ${(cy + 1.2).toFixed(1)} ${hx.toFixed(1)} ${(cy + 3.6).toFixed(1)} C${(hx + 3.6).toFixed(1)} ${(cy + 1.2).toFixed(1)} ${(hx + 3.6).toFixed(1)} ${(cy - 0.2).toFixed(1)} ${hx.toFixed(1)} ${(cy - 4.4).toFixed(1)}Z" fill="#2B8CA3" opacity="0.9"/>` : '';
            const cable = look === 'sensor-probe' ? `<path d="M${cx.toFixed(1)} ${(cy + 7.5).toFixed(1)} q 3 4 5 6" stroke="#6B7089" stroke-width="1.4" fill="none" pointer-events="none"/><rect x="${(cx + 3.5).toFixed(1)}" y="${(cy + 12.5).toFixed(1)}" width="3.4" height="3.4" rx="0.8" fill="#2B8CA3" pointer-events="none"/>` : '';
            s += `<rect class="lsn lsn-dev${moveS ? ' ld-drag' : ''}" data-nid="${esc(e.id)}" x="${(cx - 9).toFixed(1)}" y="${(cy - 7.5).toFixed(1)}" width="18" height="15" rx="3"><title>${esc(e.code)} · ${esc(typeLabel('sensor', e.type))}</title></rect><g pointer-events="none">${glyphT}${glyphH}${cable}</g><text class="lt lx lt-sensor" x="${cx}" y="${(cy - 11.5).toFixed(1)}" text-anchor="middle" style="fill:var(--color-report-calc-text)" pointer-events="none">${esc(e.code || '')}</text>`;
            return;
        }
        s += `<circle class="lsn${moveS ? ' ld-drag' : ''}" data-nid="${esc(e.id)}" cx="${X(a.x)}" cy="${Y(a.y)}" r="6.5"><title>${esc(e.code)} · ${esc(typeLabel('sensor', e.type))}</title></circle><text class="lt lx" x="${X(a.x)}" y="${Y(a.y) + 3.5}" text-anchor="middle" style="fill:var(--color-report-calc-text)" pointer-events="none">°</text><text class="lt lx lt-sensor" x="${X(a.x)}" y="${Y(a.y) - 10}" text-anchor="middle" style="fill:var(--color-report-calc-text)" pointer-events="none">${esc(e.code || '')}</text>`;
    });
    // Objetos (paso Objetos): personas y montacargas dibujados a escala y girados hacia donde miran (foto fija del plano).
    (on('objetos') ? (d.objects || []) : []).forEach((o) => {
        const along = Math.max((Number(o.l) || 0) * sc, 6);
        const across = Math.max((Number(o.w) || 0) * sc, 5);
        const title = `<title>${esc(o.name || typeLabel('object', o.type))} · ${esc(typeLabel('object', o.type))}</title>`;
        const shape = o.type === 'forklift'
            ? `<rect class="lob lob-forklift" x="${-along / 2}" y="${-across / 2}" width="${along}" height="${across}" rx="2" style="fill:${LC.equipColorOf(o)};stroke:${LC.mixHex(LC.equipColorOf(o), '#000000', 0.45)}"/><rect class="lob-cab" x="${-along * 0.36}" y="${-across * 0.3}" width="${along * 0.4}" height="${across * 0.6}" rx="1.5" style="fill:${LC.mixHex(LC.equipColorOf(o), '#000000', 0.2)};stroke:${LC.mixHex(LC.equipColorOf(o), '#000000', 0.45)}"/><line class="lob-fork" x1="${along / 2}" y1="${-across * 0.28}" x2="${along / 2 + along * 0.35}" y2="${-across * 0.28}"/><line class="lob-fork" x1="${along / 2}" y1="${across * 0.28}" x2="${along / 2 + along * 0.35}" y2="${across * 0.28}"/>`
            : (o.type === 'box'
                ? `<rect class="lob lob-box" x="${-along / 2}" y="${-across / 2}" width="${along}" height="${across}" rx="2" style="fill:${LC.equipColorOf(o)};stroke:${LC.mixHex(LC.equipColorOf(o), '#000000', 0.45)}"/>`
                : (() => {
                    // el operario visto de arriba (mira hacia la derecha): hombros con el color del chaleco y sus dos franjas, el casco con su color y una flecha hacia donde mira
                    const pc = LC.personColorsOf(o);
                    const vestDark = LC.mixHex(pc.vest, '#000000', 0.4);
                    const bandH = Math.max(1, across * 0.07);
                    const hr = Math.min(along, across) * 0.42;
                    const band = (cy) => `<rect x="${-along * 0.25}" y="${cy}" width="${along * 0.5}" height="${bandH}" fill="#f6f3e0" opacity="0.9"/>`;
                    return `<ellipse class="lob lob-person" cx="0" cy="0" rx="${along / 2}" ry="${across / 2}" style="fill:${pc.vest};stroke:${vestDark}"/>${band(-across * 0.3)}${band(across * 0.3 - bandH)}<circle cx="${along * 0.06}" cy="0" r="${hr}" style="fill:${pc.helmet};stroke:${LC.mixHex(pc.helmet, '#000000', 0.35)}" stroke-width="1"/><path d="M${along / 2 + 2.5} 0l-4.5 -3v6z" style="fill:${vestDark}"/>`;
                })());
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
        // el cono de cada cámara y el círculo de cada bocina, debajo de los símbolos y recortados al contorno de la nave (lo que alcanzan no se sale del edificio)
        if ((d.safety || []).some((e) => LC.isHungSafety(e)) && d.vertices.length >= 3) {
            s += `<clipPath id="lreach-clip"><polygon points="${d.vertices.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/></clipPath><g clip-path="url(#lreach-clip)">`;
            (d.safety || []).forEach((e) => { s += SG.safetyReach(e, X(e.x), Y(e.y), sc); });
            s += '</g>';
        }
        (d.safety || []).forEach((e) => {
            const bad = sfIssues.get(e.id);
            const px = X(e.x);
            const py = Y(e.y);
            const zone = (d.zones.find((z) => z.id === e.zoneId) || {}).name;
            const why = bad ? Object.values(bad).map(safetyIssueText).join(' · ') : '';
            const due = LC.safetyStatus(e, today, d.safetyWarnDays, sfLast(e));
            const title = `<title>${esc(e.code || '')} · ${esc(typeLabel('safety', e.type))}${e.name ? ` · ${esc(e.name)}` : ''}${zone ? ` · ${esc(zone)}` : ''}${why ? `\n${esc(why)}` : ''}${due.state !== 'none' ? `\n${esc(safetyStatusText(due))}` : ''}</title>`;
            const gr = LC.isHungSafety(e) ? rs * 1.55 : rs; // la cámara y la bocina llevan su símbolo dentro de un círculo punteado (más grande)
            // el cuadro (invisible) que usa el resaltado al elegir su renglón: el símbolo, o los dos extremos de la ruta
            const hb = e.type === 'route' ? [Math.min(px, X(e.x2)) - 8, Math.min(py, Y(e.y2)) - 8, Math.abs(X(e.x2) - px) + 16, Math.abs(Y(e.y2) - py) + 16] : [px - gr - 4, py - gr - 4, 2 * gr + 8, 2 * gr + 8];
            s += `<rect class="hl-box" data-hlbox="safety:${esc(e.id)}" x="${hb[0].toFixed(1)}" y="${hb[1].toFixed(1)}" width="${hb[2].toFixed(1)}" height="${hb[3].toFixed(1)}" rx="3"/>`;
            if (e.type === 'route') {
                s += `<g class="lsafe" data-sfid="${esc(e.id)}"><circle cx="${px}" cy="${py}" r="3.4" fill="${LC.SAFETY_COLORS.route}" stroke="#14602F" stroke-width="0.9"/>${title}</g>${SG.safetyLabel(px, py - 7, e.code || '')}`;
                if (bad) s += `<circle class="lbad" cx="${px}" cy="${py}" r="9"/>`;
            } else {
                s += `<g class="lsafe" data-sfid="${esc(e.id)}">${SG.safetyGlyph(e.type, px, py, rs, e.model)}${title}</g>${SG.safetyLabel(px, py - gr - 3, e.code || '')}`;
                if (bad) s += `<circle class="lbad" cx="${px}" cy="${py}" r="${(gr + 4).toFixed(1)}"/>`;
            }
            // por vencer = aro ámbar y vencido = aro rojo (con su palabra debajo), para verlos de lejos
            if (due.state === 'soon' || due.state === 'overdue' || due.state === 'fail') {
                const col = due.state === 'soon' ? '#E8892B' : '#C0392B';
                const rr = (e.type === 'route' ? 3.4 : gr) + 5;
                s += `<circle cx="${px}" cy="${py}" r="${rr}" fill="none" stroke="${col}" stroke-width="2.6" pointer-events="none"/>${SG.safetyLabel(px, py + rr + 8, t({ soon: 'main.layoutSgMapSoon', overdue: 'main.layoutSgMapLate', fail: 'main.layoutSgMapFail' }[due.state]), 'middle', col)}`;
            }
        });
    }
    // Techos (paso Techos): cámaras, bocinas, ventilación, extractores… como símbolos de su color dentro de un círculo punteado (que dice que están arriba, no en el piso), con su código. Lo que queda fuera del contorno o pasa del techo lleva un aro rojo.
    if (on('techos')) {
        const SG = window.LayoutMapSvg;
        const rs = Math.max(4.5, Math.min(7, sc * 0.4));
        (d.ceiling || []).forEach((e) => {
            const bad = clIssues.get(e.id);
            const px = X(e.x);
            const py = Y(e.y);
            const zone = (d.zones.find((z) => z.id === e.zoneId) || {}).name;
            const why = bad ? Object.values(bad).map(ceilingIssueText).join(' · ') : '';
            const title = `<title>${esc(e.code || '')} · ${esc(typeLabel('ceiling', e.type))}${e.name ? ` · ${esc(e.name)}` : ''}${zone ? ` · ${esc(zone)}` : ''} · ${esc(t('main.layoutCuelgaA'))} ${fmt(LC.ceilingHangOf(d, e))}${why ? `\n${esc(why)}` : ''}</title>`;
            const hb = [px - rs * 1.55 - 3, py - rs * 1.55 - 3, 2 * rs * 1.55 + 6, 2 * rs * 1.55 + 6];
            s += `<rect class="hl-box" data-hlbox="ceiling:${esc(e.id)}" x="${hb[0].toFixed(1)}" y="${hb[1].toFixed(1)}" width="${hb[2].toFixed(1)}" height="${hb[3].toFixed(1)}" rx="3"/>`;
            s += `<g class="lceil" data-clid="${esc(e.id)}">${SG.ceilingGlyph(e.type, px, py, rs)}${title}</g>${SG.ceilingLabel(px, py - rs * 1.55 - 3, e.code || '')}`;
            if (bad) s += `<circle class="lbad" cx="${px}" cy="${py}" r="${(rs * 1.55 + 3).toFixed(1)}"/>`;
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
    // la escala (abajo a la izquierda) mide 5 m; en una nave chica se acorta (2, 1 o 0.5 m) para no llegar hasta la barra de búsqueda que flota a su derecha
    const scaleM = [5, 2, 1, 0.5].find((m) => m * sc <= 110) || 0.5;
    const bar = scaleM * sc;
    s += `<line x1="${M}" y1="${H - 12}" x2="${M + bar}" y2="${H - 12}" class="lscale"/>`;
    putOuter('lt2', M + bar + 6, H - 8, 'start', `${scaleM} m`);
    s = `${s.slice(0, halosAt)}${outerHalos}${s.slice(halosAt)}${outerLabels}`;
    if (underlay) return s;
    // con un enfoque y el resto «tenue», las opciones apagadas también se ven (con poca opacidad) debajo de lo encendido
    if (state.findDim && activeFind() && SECTION_ORDER.filter(stepVisible).some((x) => !stepOn(x))) {
        const under = renderSvg(true);
        s = s.replace('</defs>', `</defs><g class="fx-under" opacity="0.3" pointer-events="none">${under.slice(under.indexOf('</defs>') + 7)}</g>`);
    }
    $('layout-svg').innerHTML = s;
    applyTextGroups();
    applyFindDim(dimmed);
    applyHighlight(false);
    applyZoom(); // cada redibujo conserva el aumento y el lugar donde se estaba viendo
    scheduleScene3d(); // si se está viendo en 3D, la escena se vuelve a armar con el borrador
}

function renderSummary() {
    const k = LC.computeKpis(state.draft);
    const rows = k.zones.filter((z) => !state.find || findZoneIds().includes(z.id)).map((z) => `<tr><td>${esc(z.name)}</td><td>${esc(z.type ? typeLabel('zone', z.type) : t('main.layoutSinZona'))}</td><td>${esc(z.use ? typeLabel('use', z.use) : '—')}</td><td>${fmt(z.area)} m²</td><td>${z.spaces}</td><td>${fmt(z.footprint)} m²</td><td>${fmt(z.occupancy, 1)}%</td><td>${fmt(z.volume)} m³</td></tr>`);
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
    syncPositions();
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
    // el código de cada puerta, conexión de luz, obstáculo y objeto lo pone el sistema: se vuelve a sacar con cada cambio
    (state.draft.doors || []).forEach((x, i) => { const c = document.querySelector(`[data-door-code="${i}"]`); if (c) c.textContent = x.code || ''; });
    (state.draft.power || []).forEach((x, i) => { const c = document.querySelector(`[data-power-code="${i}"]`); if (c) c.textContent = x.code || ''; });
    (state.draft.objects || []).forEach((x, i) => { const c = document.querySelector(`[data-object-code="${i}"]`); if (c) c.textContent = x.code || ''; });
    (state.draft.obstacles || []).forEach((x, i) => { const c = document.querySelector(`[data-ob-code="${i}"]`); if (c) c.textContent = x.code || ''; });
    // el código de cada pared lo pone el sistema: se vuelve a sacar con cada cambio
    (state.draft.obstacles || []).forEach((o, i) => {
        const cell = document.querySelector(`[data-wall-code="${i}"]`); if (cell) cell.textContent = o.code || '';
        if (o.kind !== 'wall') return;
        const sa = document.querySelector(`[data-wall-sa="${i}"]`); if (sa) sa.textContent = wallSideText(o, 'a');
        const sb = document.querySelector(`[data-wall-sb="${i}"]`); if (sb) sb.textContent = wallSideText(o, 'b');
    });
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
    applyCeilingMarks();
    applyRoofMarks();
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
    $('layout-save').title = dirty ? t('main.layoutSinGuardar') : '';
    state.draft.vertices.forEach((_, i) => {
        const cell = document.querySelector(`[data-wall-len="${i}"]`);
        if (cell) cell.textContent = `${t('main.layoutPared')} ${i + 1}: ${fmt(LC.wallSegment(state.draft.vertices, i + 1).length)} m`;
    });
    state.draft.zones.forEach((z, i) => {
        const c = document.querySelector(`[data-zone-area="${i}"]`);
        if (c) c.textContent = `${fmt(LC.zoneArea(z))} m²`;
        const vol = document.querySelector(`[data-zone-vol="${i}"]`);
        if (vol) vol.textContent = zoneVolText(z);
        const chips = document.querySelector(`[data-zone-chips="${i}"]`);
        if (chips) chips.innerHTML = zoneChipsHtml(z);
    });
    document.querySelectorAll('[data-sides-status]').forEach((box) => {
        const key = box.getAttribute('data-sides-status');
        box.innerHTML = sidesStatusHtml(key, !canEdit(key === 'contorno' ? 'contorno' : 'zonas'));
    });
    state.draft.footprints.forEach((s, i) => { const c = document.querySelector(`[data-space-calc="${i}"]`); if (c) c.textContent = `${fmt(s.l * s.d)} m² · ${fmt(s.l * s.d * s.h)} m³`; });
    renderViewStrip();
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
// Icono Niveles: muestra u oculta lo de los pisos a desnivel (rayas, rampa y el nivel de cada zona en el croquis; el nivel en el rótulo del 3D); se recuerda en este navegador y solo lo ve quien lo tiene en el árbol.
// Techo (solo 3D): ver u ocultar la losa del techo, que se apoya sobre la altura de pared de cada esquina (alturas distintas = techo inclinado). Empieza oculto y se recuerda en este navegador; es solo de pantalla.
const ROOF_KEY = 'sgn_layout_roof';
state.showRoof = false;
try { state.showRoof = localStorage.getItem(ROOF_KEY) === '1'; } catch (err) { /* sin almacenamiento: oculto */ }
function updateRoofBtn() {
    const btn = $('layout-roof-btn');
    btn.hidden = !(state.perms && state.perms.canToggleRoof);
    btn.setAttribute('aria-pressed', String(state.showRoof));
    btn.classList.toggle('off', !state.showRoof);
    const label = t(state.showRoof ? 'main.layoutTechoOcultar' : 'main.layoutTechoVer');
    btn.setAttribute('aria-label', label);
    btn.title = label;
}
$('layout-roof-btn').addEventListener('click', () => {
    state.showRoof = !state.showRoof;
    try { localStorage.setItem(ROOF_KEY, state.showRoof ? '1' : '0'); } catch (err) { /* no se recuerda */ }
    updateRoofBtn();
    scheduleScene3d();
});
const LEVELS_KEY = 'sgn_layout_levels';
function updateLevelsBtn() {
    const btn = $('layout-levels-btn');
    btn.hidden = !(state.perms && state.perms.canToggleLevels);
    btn.setAttribute('aria-pressed', String(state.showLevels));
    btn.classList.toggle('off', !state.showLevels);
    btn.setAttribute('aria-label', t(state.showLevels ? 'main.layoutNivelesOcultar' : 'main.layoutNivelesVer'));
    btn.title = t(state.showLevels ? 'main.layoutNivelesOcultar' : 'main.layoutNivelesVer');
}
try { state.showLevels = localStorage.getItem(LEVELS_KEY) !== '0'; } catch (err) { /* sin almacenamiento: se ven */ }
$('layout-levels-btn').addEventListener('click', () => {
    state.showLevels = !state.showLevels;
    try { localStorage.setItem(LEVELS_KEY, state.showLevels ? '1' : '0'); } catch (err) { /* no se recuerda */ }
    updateLevelsBtn();
    if (state.draft) { applyLegend(); renderSvg(); refreshScene3d(); }
});
// Icono Apertura de puertas: muestra u oculta el espacio que necesita cada puerta al abrir (el giro de la batiente y el recorrido de la corrediza); se recuerda en este navegador y solo lo ve quien lo tiene en el árbol.
const OPENING_KEY = 'sgn_layout_opening';
function updateOpeningBtn() {
    const btn = $('layout-opening-btn');
    btn.hidden = !(state.perms && state.perms.canToggleOpening);
    btn.setAttribute('aria-pressed', String(state.showOpening));
    btn.classList.toggle('off', !state.showOpening);
    btn.setAttribute('aria-label', t(state.showOpening ? 'main.layoutAperturaOcultar' : 'main.layoutAperturaVer'));
    btn.title = t(state.showOpening ? 'main.layoutAperturaOcultar' : 'main.layoutAperturaVer');
}
try { state.showOpening = localStorage.getItem(OPENING_KEY) !== '0'; } catch (err) { /* sin almacenamiento: se ve */ }
$('layout-opening-btn').addEventListener('click', () => {
    state.showOpening = !state.showOpening;
    try { localStorage.setItem(OPENING_KEY, state.showOpening ? '1' : '0'); } catch (err) { /* no se recuerda */ }
    updateOpeningBtn();
    if (state.draft) { applyWallItemMarks(); applyLegend(); renderSvg(); refreshScene3d(); }
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
// Otros textos del croquis: los códigos de huellas, activos y pasillos, el código y el nivel de cada piso, el código de cada sensor y los códigos de seguridad se pueden ocultar o ver desde el menú de textos (junto con los
// nombres, los m² y las medidas). Se recuerdan en este navegador y lo ve quien tiene el icono Nombres en el árbol; es solo de pantalla: el croquis ya dibujado se oculta con una clase (no hace falta redibujarlo).
const TEXT_GROUPS = {
    codes: { id: 'layout-txt-codes-btn', key: 'sgn_layout_txt_codes', cls: 'hide-t-codes' },
    floors: { id: 'layout-txt-floors-btn', key: 'sgn_layout_txt_floors', cls: 'hide-t-floors' },
    sensors: { id: 'layout-txt-sensors-btn', key: 'sgn_layout_txt_sensors', cls: 'hide-t-sensors' },
    safety: { id: 'layout-txt-safety-btn', key: 'sgn_layout_txt_safety', cls: 'hide-t-safety' },
    positions: { id: 'layout-txt-positions-btn', key: 'sgn_layout_txt_positions', cls: 'hide-t-positions' }, // los rótulos E001 (espacios) y P001 (posiciones) que dibuja el paso Posiciones sobre los activos
};
state.txtOff = {};
Object.entries(TEXT_GROUPS).forEach(([g, o]) => { try { state.txtOff[g] = localStorage.getItem(o.key) === '0'; } catch (err) { /* sin almacenamiento: se ven */ } });
function applyTextGroups() {
    const svg = $('layout-svg');
    if (!svg) return;
    Object.entries(TEXT_GROUPS).forEach(([g, o]) => svg.classList.toggle(o.cls, !!state.txtOff[g]));
}
function updateTextGroupBtns() {
    Object.entries(TEXT_GROUPS).forEach(([g, o]) => {
        const btn = $(o.id);
        if (!btn) return;
        btn.hidden = !(state.perms && state.perms.canToggleNames);
        btn.setAttribute('aria-pressed', String(!state.txtOff[g]));
        btn.classList.toggle('off', !!state.txtOff[g]);
    });
}
Object.entries(TEXT_GROUPS).forEach(([g, o]) => {
    const btn = $(o.id);
    if (!btn) return;
    btn.addEventListener('click', () => {
        state.txtOff[g] = !state.txtOff[g];
        try { localStorage.setItem(o.key, state.txtOff[g] ? '0' : '1'); } catch (err) { /* no se recuerda */ }
        updateTextGroupBtns();
        applyTextGroups();
    });
});
// Piezas que caben en cada posición (Relación Código > «Se acomoda»): se leen aparte (GET /layout/pieces, con la hoja iconLayoutPiezas) y se dibujan, en el croquis y en el 3D, con el paso Posiciones encendido.
// El botón «Piezas que caben» del menú Textos las apaga o las enciende (se recuerda en este navegador). Es solo de pantalla: no cambia lo guardado.
const PIECES_KEY = 'sgn_layout_pieces';
state.pieces = [];
state.piecesOff = false;
try { state.piecesOff = localStorage.getItem(PIECES_KEY) === '0'; } catch (err) { /* sin almacenamiento: se ven */ }
let pieceMap = new Map();
const piecesVisible = () => !!(state.perms && state.perms.canTogglePieces) && !state.piecesOff && stepOn('ubicaciones') && state.pieces.length > 0;
const pieceAt = (spaceId, n, c, p) => pieceMap.get(`${spaceId}|${n}|${c}|${p}`) || null;
async function loadPieces() {
    state.pieces = [];
    pieceMap = new Map();
    if (!(state.perms && state.perms.canTogglePieces) || !state.centerId) return;
    try {
        const res = await fetch(layoutUrl('/api/business/layout/pieces'), { credentials: 'include' });
        if (!res.ok) return;
        const body = await res.json();
        state.pieces = Array.isArray(body.pieces) ? body.pieces : [];
        pieceMap = new Map(state.pieces.map((p) => [`${p.spaceId}|${p.n}|${p.c}|${p.p}`, p]));
    } catch (err) { console.error('Layout: no se pudieron cargar las piezas', err); }
}
function updatePiecesBtn() {
    const btn = $('layout-pieces-btn');
    if (!btn) return;
    btn.hidden = !(state.perms && state.perms.canTogglePieces);
    btn.setAttribute('aria-pressed', String(!state.piecesOff));
    btn.classList.toggle('off', !!state.piecesOff);
}
$('layout-pieces-btn').addEventListener('click', () => {
    state.piecesOff = !state.piecesOff;
    try { localStorage.setItem(PIECES_KEY, state.piecesOff ? '0' : '1'); } catch (err) { /* no se recuerda */ }
    updatePiecesBtn();
    applyLegend();
    if (state.draft) { renderSvg(); scheduleScene3d(); }
});
// Códigos en Localizadores (paso Localizadores): qué código tiene cada localizador completo, la unidad que se almacena y su capacidad máxima (de Relación Código), y desde aquí se relaciona un código con un localizador
// completo sin salir del croquis. La relación que se crea es la misma de Relación Código (su sub almacén sale de la zona del localizador). Un localizador con código no se puede eliminar: el servidor rechaza guardar un Layout
// que lo quite. Solo un localizador COMPLETO y guardado recibe código.
state.locCodes = new Map(); // 'activo|nivel|espacio|posición' -> { relationId, sku, description, packLevel, packName, packCapacity, mainUom… }
async function loadLocatorCodes() {
    state.locCodes = new Map();
    if (!(state.perms && state.perms.canSeeLocatorCodes) || !state.centerId) return;
    try {
        const res = await fetch(layoutUrl('/api/business/layout/locator-codes'), { credentials: 'include' });
        if (!res.ok) return;
        const body = await res.json();
        (body.locators || []).forEach((l) => state.locCodes.set(`${l.spaceId}|${l.level}|${l.slot}|${l.position}`, l));
    } catch (err) { console.error('Layout: no se pudieron cargar los códigos de los localizadores', err); }
}
const locCodeAt = (r) => state.locCodes.get(`${r.spaceId}|${r.level}|${r.slot}|${r.position}`) || null;
const hasRelationScreen = () => Dashboard.hasScreenGrant('supply-chain', 'sc-area-distribution-center', 'cat-operaciones/cat-operaciones-centro-dist-relacion-codigo');
const relationUrl = (q) => `OpCentroDistRelacionCodigo.html${q ? `?q=${encodeURIComponent(q)}` : ''}`;
// A qué se filtra Relación Código desde el botón de arriba: un solo localizador a la vista, el Localizador elegido en la franja o nada.
function relationShortcutQuery() {
    // en el paso Relación Código se ve esa tabla (cada renglón ya es un localizador con código); en los demás, la de Localizadores
    const tableId = state.focus === 'relacion' ? 'layout-relacion' : 'layout-localizadores';
    const rowsShown = [...document.querySelectorAll(`#layout-panel table[data-filter-table="${tableId}"] tbody tr[data-locator]`)].filter((tr) => !tr.hidden && tr.dataset.locator);
    const full = rowsShown.filter((tr) => tr.querySelector('[data-loc-rel], .layout-loc-lock') || tableId === 'layout-relacion');
    if (full.length === 1) return full[0].dataset.locator;
    if (rowsShown.length === 1) return rowsShown[0].dataset.locator;
    const picked = typeof locCode === 'function' ? locCode() : '';
    return picked ? picked.replace(/\s\+\d+$/, '') : '';
}
document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-rel-shortcut]');
    if (link) { event.preventDefault(); window.location.href = relationUrl(relationShortcutQuery()); return; }
    const rel = event.target.closest('[data-loc-rel]');
    if (rel && !rel.disabled) openRelateDialog(rel.dataset.locRel, rel.dataset.locText);
});
let relEl = null;
let rd = null; // { spaceId, level, slot, position, locator, info, sku, packUnit (el id de la presentación; 0 = el material principal), box }
let relSearchTimer = null;
const relSkuCache = new Map();
const round1 = (v) => Math.round(v * 10) / 10;
// La posición (largo × fondo × alto, en cm) del borrador.
function relPositionBox(spaceId, level, slot, pos) {
    const s = (state.draft.spaces || []).find((x) => x.id === spaceId);
    if (!s) return null;
    const p = LC.positionsOfBay(state.draft, spaceId, level, slot).find((x) => x.num === pos);
    if (!p || !(p.l > 0) || !(p.w > 0)) return null;
    const m = LC.bayMeasures(s, level, slot);
    return { l: round1(p.l * 100), w: round1(p.w * 100), h: round1((p.h > 0 ? Math.min(p.h, m.h) : m.h) * 100) };
}
// Solo se ofrecen las presentaciones con algún tipo de almacenamiento habilitado en Presentaciones de Distribución (all = con las que no, para decir por qué no sale ninguna).
const relLevelsOf = (sku, all) => {
    const levels = window.PackCalc && sku ? window.PackCalc.levelsOf({ length: sku.length, width: sku.width, height: sku.height, packaging: sku.packaging }).filter((lv) => lv.l > 0 && lv.w > 0 && lv.h > 0) : [];
    return all ? levels : levels.filter((lv) => window.PackCalc.enabled(lv));
};
const relPackName = (lv) => `${t(`main.pkLevel${lv.level}`)}${lv.brand ? ` · ${lv.brand}` : ''}${lv.name ? ` · ${lv.name}` : ''}`;
function ensureRelateModal() {
    if (relEl) return;
    relEl = document.createElement('div');
    relEl.className = 'modal-overlay';
    relEl.id = 'layout-relate-modal';
    relEl.hidden = true;
    relEl.innerHTML = `<div class="modal-panel rel-dialog udm-dialog" role="dialog" aria-modal="true" aria-labelledby="lrel-title">
        <h3 id="lrel-title"></h3>
        <div class="rel-fld">
            <label for="lrel-code">${esc(t('main.udmCode'))}</label>
            <input type="search" id="lrel-code" autocomplete="off" placeholder="${esc(t('main.relSearchPlaceholder'))}" data-help-key="relCodeSearch">
            <div class="rel-results" id="lrel-results" hidden></div>
        </div>
        <div class="rel-muted" id="lrel-hint"></div>
        <div class="rel-pack-opts" id="lrel-opts"></div>
        <div class="rel-foot">
            <span class="rel-muted" id="lrel-msg"></span>
            <button type="button" class="btn" id="lrel-save">${esc(t('main.udmSave'))}</button>
            <button type="button" class="btn btn-secondary" id="lrel-close">${esc(t('main.whClose'))}</button>
        </div>
    </div>`;
    document.body.appendChild(relEl);
    Dashboard.attachSearchOptions($('lrel-code')); // Inicia con / Contiene / Igual que y los signos $ @ coma, como en las tablas
    relEl.addEventListener('click', (event) => {
        if (event.target === relEl || event.target.closest('#lrel-close')) { closeRelateDialog(); return; }
        if (event.target.closest('#lrel-save')) { saveRelate(); return; }
        const card = event.target.closest('[data-lrel-pack]');
        if (card && !card.disabled) { rd.packUnit = Number(card.dataset.lrelPack); renderRelate(); return; }
        const pick = event.target.closest('[data-lrel-sku]');
        if (pick) {
            rd.sku = relSkuCache.get(Number(pick.dataset.lrelSku)) || null;
            if (rd.sku) { $('lrel-code').value = `${rd.sku.sku} · ${rd.sku.description}`; $('lrel-results').hidden = true; if (!relLevelsOf(rd.sku).some((lv) => lv.id === rd.packUnit)) rd.packUnit = null; renderRelate(); }
        }
    });
    $('lrel-code').addEventListener('input', () => { rd.sku = null; rd.packUnit = null; clearTimeout(relSearchTimer); relSearchTimer = setTimeout(relSearchCodes, 220); renderRelate(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && relEl && !relEl.hidden) closeRelateDialog(); });
}
async function relSearchCodes() {
    const q = $('lrel-code').value.trim();
    const box = $('lrel-results');
    if (!q || !rd) { box.hidden = true; return; }
    try {
        const res = await fetch(`/api/business/code-relations/skus?q=${encodeURIComponent(q)}&mode=${Dashboard.searchModeOf($('lrel-code'))}`, { credentials: 'include' });
        if (!res.ok) return;
        const { skus } = await res.json();
        skus.forEach((s) => relSkuCache.set(s.id, s));
        box.innerHTML = skus.length
            ? skus.map((s) => `<button type="button" class="rel-result" data-lrel-sku="${s.id}"><b>${esc(s.sku)}</b> ${esc(s.description)} <span class="rel-muted">${esc(s.upc)}</span></button>`).join('')
            : `<span class="rel-muted">${esc(t('main.relNoMatches'))}</span>`;
        box.hidden = false;
    } catch (err) { console.error('Layout: la búsqueda de códigos falló', err); }
}
function openRelateDialog(key, locator) {
    if (!state.draft || isDirty()) { Dashboard.showToast(t('main.locGuardaPrimero'), 'warning'); return; }
    const [spaceId, level, slot, position] = key.split('|');
    const info = state.locCodes.get(key) || null;
    ensureRelateModal();
    rd = { spaceId, level: Number(level), slot: Number(slot), position: Number(position), locator, info, sku: null, packUnit: info && info.packUnitId != null ? info.packUnitId : null };
    rd.box = relPositionBox(rd.spaceId, rd.level, rd.slot, rd.position);
    $('lrel-title').textContent = t(info ? 'main.layoutCambiarTitulo' : 'main.layoutRelacionarTitulo', { loc: locator });
    $('lrel-code').value = info ? `${info.sku} · ${info.description}` : '';
    $('lrel-results').hidden = true;
    relEl.hidden = false;
    if (info) {
        // el código que ya tiene: se trae con sus medidas y empaques para ofrecer sus unidades
        fetch(`/api/business/code-relations/skus?q=${encodeURIComponent(info.sku)}`, { credentials: 'include' }).then((r) => r.json()).then(({ skus }) => {
            const hit = (skus || []).find((s) => s.id === info.skuItemId);
            if (hit && rd && rd.info === info) { relSkuCache.set(hit.id, hit); rd.sku = hit; renderRelate(); }
        }).catch(() => {});
    } else $('lrel-code').focus();
    renderRelate();
}
function closeRelateDialog() { if (relEl) relEl.hidden = true; rd = null; }
function renderRelate() {
    if (!rd) return;
    const opts = $('lrel-opts');
    const hint = $('lrel-hint');
    const save = $('lrel-save');
    opts.innerHTML = '';
    $('lrel-msg').textContent = '';
    save.disabled = true;
    if (!rd.sku) { hint.textContent = t('main.relPackNoCode'); return; }
    const levels = relLevelsOf(rd.sku);
    if (!levels.length) { hint.textContent = t(relLevelsOf(rd.sku, true).length ? 'main.relPackNoTypes' : 'main.relPackNoData'); return; }
    if (!rd.box) { hint.textContent = t('main.locGuardaPrimero'); return; }
    hint.textContent = `${t('main.relPackTitle')} ${t('main.relPackBox', { l: rd.box.l, w: rd.box.w, h: rd.box.h })}`;
    const fits = levels.map((lv) => ({ lv, f: window.PackCalc.fit(rd.box, lv) }));
    const best = fits.filter((x) => x.f.capacity > 0).sort((a, b) => b.f.capacity - a.f.capacity || b.lv.level - a.lv.level)[0];
    opts.innerHTML = fits.map(({ lv, f }) => {
        const sel = rd.packUnit === lv.id;
        const unit = t(lv.level === 0 ? 'main.relPackUnitMain' : 'main.relPackUnitPack');
        const top = f.count ? `<svg viewBox="-1 -1 ${rd.box.l + 2} ${rd.box.w + 2}" class="rel-pack-svg" role="img" aria-label="${esc(t('main.relPackTop'))}"><rect x="0" y="0" width="${rd.box.l}" height="${rd.box.w}" class="pk-pos"/>${f.cells.map((c) => (c.r ? `<circle cx="${c.cx.toFixed(2)}" cy="${c.cy.toFixed(2)}" r="${(c.r - 0.15).toFixed(2)}" class="pk-c lv${Math.min(lv.level, 2)}"/>` : `<rect x="${(c.x + 0.2).toFixed(2)}" y="${(c.y + 0.2).toFixed(2)}" width="${Math.max(c.l - 0.4, 0.1).toFixed(2)}" height="${Math.max(c.w - 0.4, 0.1).toFixed(2)}" class="pk-b lv${Math.min(lv.level, 2)}"/>`)).join('')}</svg>` : '';
        return `<button type="button" class="rel-pack-card${sel ? ' sel' : ''}" data-lrel-pack="${lv.id}"${f.count ? '' : ' disabled'}>
            <span class="rel-pack-h"><b>${esc(relPackName(lv))}</b>${best && best.lv.id === lv.id ? `<span class="rel-tag rel-tag-ok">${esc(t('main.relPackSuggested'))}</span>` : ''}</span>
            <span class="rel-pack-m">${esc(t(lv.shape === 'cilindrica' ? 'main.pkCyl' : 'main.pkRect'))} · ${esc(lv.shape === 'cilindrica' ? `Ø ${lv.l}` : `${lv.l} × ${lv.w}`)} × ${esc(lv.h)} cm</span>
            ${top}
            <span class="rel-pack-n">${f.count ? `<b>${f.capacity}</b><span class="rel-muted">${esc(t('main.relPackPieces'))}</span>` : `<span class="rel-pack-warn">${esc(t('main.relPackNoFit'))}</span>`}</span>
            ${f.count ? `<span class="rel-pack-d">${esc(t('main.relPackFitsN', { n: f.count, u: unit }))}. ${esc(t('main.relPackLayers', { k: f.layers, m: f.perLayer }))}. ${esc(t('main.relPackLeft', { h: f.leftH, d: f.leftD }))}.</span>` : ''}
        </button>`;
    }).join('');
    const chosen = fits.find((x) => x.lv.id === rd.packUnit);
    save.disabled = !(chosen && chosen.f.count);
}
async function saveRelate() {
    if (!rd || !rd.sku || rd.packUnit === null) return;
    $('lrel-save').disabled = true;
    try {
        const res = await fetch(layoutUrl('/api/business/layout/locator-code'), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ skuItemId: rd.sku.id, spaceId: rd.spaceId, level: rd.level, slot: rd.slot, position: rd.position, packUnitId: rd.packUnit, relationId: rd.info ? rd.info.relationId : undefined }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { Dashboard.showToast(json.message || Dashboard.t('admin.saveError'), res.status === 403 ? 'warning' : 'error'); $('lrel-save').disabled = false; return; }
        Dashboard.showToast(t('main.layoutRelGuardado'), 'success');
        closeRelateDialog();
        await loadLocatorCodes();
        await loadPieces();
        renderPanel();
        refreshLive();
    } catch (err) {
        console.error('Layout: no se pudo relacionar el código', err);
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
        $('lrel-save').disabled = false;
    }
}
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
    updateTextGroupBtns();
    applyTextGroups();
    updateRotateBtn();
    updateOpeningBtn();
    updateLevelsBtn();
    updateRoofBtn();
    updateTextsMenu();
    updateZoomUi();
    $('layout-empty').hidden = true;
    $('layout-choose-center').hidden = true;
    $('layout-plan-width').hidden = true;
    $('layout-editor').hidden = false;
    applyMode();
    renderPanel();
    refreshLive();
}

// ---- cargar el Layout guardado -----------------------------------------------------------------------------------------
// ---- Colocar activos y sensores de Alta Activos (pasos Activos y Sensores) ------------------------------------------------------------------------------------
// Los activos del Layout no se crean aquí: se dan de alta en Alta Activos y aquí solo se colocan. La lista trae los del centro de costos que aparecen en el Layout (Alta Activos > «Aparece en el Layout» = Sí), están activos, están COMPLETOS
// (tipo, clasificación, modelo, número de serie y las 6 fotos) y todavía no están colocados. En el paso Activos salen los que van sobre una huella (uno sin largo, profundidad y alto no se puede dibujar) y se elige la huella; en el paso Sensores, los de tipo «Sensor» (se dibujan como Sensor en el catálogo
// Activos Fijos), que van sobre una pared: el renglón nace con la primera pared y ahí se le dice cuál, a qué distancia y a qué altura. Al colocarlo toma de su renglón el código y el nombre (LayoutCalc.applyAssetToSpace).
let placeModalEl = null;
function closePlaceAssets() { if (placeModalEl) placeModalEl.hidden = true; }
function openPlaceAssets(opts = {}) {
    const sensors = !!opts.sensors;
    const d = state.draft;
    if (!d || !canEdit(sensors ? 'sensores' : 'activos')) return;
    const placed = new Set([...d.spaces, ...(d.sensors || [])].map((s) => s.assetRef).filter(Boolean));
    // Salen los activos que aparecen en el Layout, están activos y no están colocados; SOLO los completos en Alta Activos se pueden marcar: de los demás se ve, en gris, lo que les falta (así se sabe qué terminar).
    const list = (state.fixedAssets || []).filter((a) => a.status === 'active' && a.showInLayout && !placed.has(a.id) && ((a.typeKind === 'sensor') === sensors));
    const faltaText = (a) => (a.missing || []).map((k) => (k === 'photos' ? t('main.assetFaltaFotos', { n: a.photoCount || 0 }) : t(`main.assetFalta_${k}`))).join(', ');
    const dimsOk = (a) => a.complete && (sensors || (a.length > 0 && a.depth > 0 && a.height > 0));
    const pickable = list.filter(dimsOk).length;
    if (!placeModalEl) {
        placeModalEl = document.createElement('div');
        placeModalEl.className = 'modal-overlay';
        placeModalEl.hidden = true;
        document.body.appendChild(placeModalEl);
        placeModalEl.addEventListener('click', (event) => { if (event.target === placeModalEl || event.target.closest('[data-place-cancel]')) closePlaceAssets(); });
        document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && placeModalEl && !placeModalEl.hidden) closePlaceAssets(); });
    }
    const zoneOptions = `<option value="">${esc(t('main.layoutActivoElegirZona'))}</option>${d.zones.filter((z) => z.active !== false).map((z) => `<option value="${esc(z.id)}">${esc(z.name || z.code)}</option>`).join('')}`;
    // Tipo → Modelo → piezas (2026-11-13, Daniel: «primero me debe pedir el tipo, y colocando el tipo, ya solo me debe dejar seleccionar los modelos»): se elige el TIPO, luego solo salen los MODELOS de ese tipo y entonces las piezas de ese modelo
    // (su código y su número de serie) para marcarlas; los activos de antes, sin modelo, salen en «Sin modelo». En el paso Activos además se elige la huella; las medidas salen en cada pieza.
    const types = new Map();
    list.forEach((a) => { const id = a.typeId || 0; if (!types.has(id)) types.set(id, a.typeName || '—'); });
    const typeOptions = `<option value="">${esc(t('main.layoutColocarElegirTipo'))}</option>${[...types].sort((x, y) => String(x[1]).localeCompare(String(y[1]))).map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join('')}`;
    const modelLabel = (a) => (a.modelId ? [a.purchaseName || a.name, a.model].filter(Boolean).join(' · ') : t('main.layoutColocarSinModelo'));
    const rows = list.map((a) => `<label class="layout-place-row${dimsOk(a) ? '' : ' is-off'}" hidden data-place-type="${a.typeId || 0}" data-place-model="${a.modelId || 0}" data-place-text="${esc(`${a.code} ${a.name} ${a.model || ''} ${a.serialNumber || ''}`.toLowerCase())}"><input type="checkbox" data-place-asset="${a.id}"${dimsOk(a) ? '' : ' disabled'}> <span class="layout-place-name"><b>${esc(a.code)}</b>${a.serialNumber ? ` · S/N ${esc(a.serialNumber)}` : ''}</span> <small>${esc([sensors ? '' : `${a.length} × ${a.depth} × ${a.height} cm`, dimsOk(a) ? '' : (a.awaitingAuth ? t('main.layoutColocarEsperaAutorizacion') : (a.complete ? t('main.layoutColocarSinMedidas') : t('main.layoutColocarFalta', { falta: faltaText(a) })))].filter(Boolean).join(' '))}</small></label>`).join('');
    placeModalEl.innerHTML = `<div class="modal-panel" style="max-width: 40rem;" role="dialog" aria-modal="true" aria-labelledby="layout-place-title">
        <h3 id="layout-place-title" data-help-key="${sensors ? 'layoutColocarSensor' : 'layoutColocarActivo'}">${esc(t(sensors ? 'main.layoutColocarTituloSensor' : 'main.layoutColocarTitulo'))}</h3>
        ${list.length ? `<div class="admin-form-grid">
            <div class="admin-field"><label for="layout-place-type">${esc(t('main.layoutColocarTipoCol'))}</label><select id="layout-place-type" data-help-key="layoutColocarTipo">${typeOptions}</select></div>
            <div class="admin-field"><label for="layout-place-model">${esc(t('main.layoutColocarModeloCol'))}</label><select id="layout-place-model" data-help-key="layoutColocarModelo" disabled><option value="">${esc(t('main.layoutColocarElegirModelo'))}</option></select></div>
        </div>` : ''}
        ${sensors ? '' : `<div class="admin-form-grid">
            <div class="admin-field"><label for="layout-place-zone">${esc(t('main.layoutZona'))}</label><select id="layout-place-zone">${zoneOptions}</select></div>
            <div class="admin-field"><label for="layout-place-fp">${esc(t('main.layoutHuellaCol'))}</label><select id="layout-place-fp"><option value="">${esc(t('main.layoutActivoElegirHuella'))}</option></select></div>
        </div>`}
        ${list.length ? `<p class="layout-muted" id="layout-place-hint">${esc(t('main.layoutColocarPistaTipo'))}</p><input type="search" id="layout-place-search" class="layout-place-search" hidden placeholder="${esc(t('main.layoutColocarBuscar'))}"><div class="layout-place-list" hidden>${rows}</div>` : `<p class="layout-muted">${esc(t(sensors ? 'main.layoutColocarVacioSensor' : 'main.layoutColocarVacio'))}</p>`}
        <div id="layout-place-error" class="admin-error" role="alert" hidden></div>
        <div class="admin-form-actions">
            <button type="button" class="btn" id="layout-place-ok"${pickable ? '' : ' disabled'}>${esc(t('main.layoutColocarBtn'))}</button>
            <button type="button" class="btn btn-secondary" data-place-cancel>${esc(t('admin.cancel'))}</button>
        </div>
    </div>`;
    const err = (key) => { const el = placeModalEl.querySelector('#layout-place-error'); el.textContent = t(key); el.hidden = false; };
    if (!sensors) {
        placeModalEl.querySelector('#layout-place-zone').addEventListener('change', (event) => {
            const fps = d.footprints.filter((f) => f.zoneId === event.target.value);
            placeModalEl.querySelector('#layout-place-fp').innerHTML = `<option value="">${esc(t('main.layoutActivoElegirHuella'))}</option>${fps.map((f) => `<option value="${esc(f.id)}">${esc(f.code)}${f.name ? ` · ${esc(f.name)}` : ''}</option>`).join('')}`;
        });
    }
    const search = placeModalEl.querySelector('#layout-place-search');
    const typeSel = placeModalEl.querySelector('#layout-place-type');
    const modelSel = placeModalEl.querySelector('#layout-place-model');
    const hint = placeModalEl.querySelector('#layout-place-hint');
    const listEl = placeModalEl.querySelector('.layout-place-list');
    const rowEls = Array.from(placeModalEl.querySelectorAll('.layout-place-row'));
    // las piezas solo se ven con el tipo Y el modelo elegidos; el buscador filtra dentro de ese modelo
    const applyRows = () => {
        const ready = !!typeSel && typeSel.value !== '' && !!modelSel && modelSel.value !== '';
        const q = search ? search.value.trim().toLowerCase() : '';
        rowEls.forEach((row) => { row.hidden = !ready || row.dataset.placeType !== typeSel.value || row.dataset.placeModel !== modelSel.value || (!!q && !row.dataset.placeText.includes(q)); });
        if (listEl) listEl.hidden = !ready;
        if (search) search.hidden = !ready;
        if (hint) { hint.hidden = ready; hint.textContent = t(typeSel && typeSel.value !== '' ? 'main.layoutColocarPistaModelo' : 'main.layoutColocarPistaTipo'); }
    };
    // al cambiar de tipo o de modelo se desmarca lo que se había marcado (no se quedan piezas marcadas que ya no se ven)
    const clearChecks = () => { placeModalEl.querySelectorAll('[data-place-asset]:checked').forEach((cb) => { cb.checked = false; }); if (search) search.value = ''; };
    if (typeSel && modelSel) {
        typeSel.addEventListener('change', () => {
            const models = new Map();
            list.filter((a) => String(a.typeId || 0) === typeSel.value).forEach((a) => { const id = a.modelId || 0; if (!models.has(id)) models.set(id, { label: modelLabel(a), n: 0 }); models.get(id).n += 1; });
            modelSel.innerHTML = `<option value="">${esc(t('main.layoutColocarElegirModelo'))}</option>${[...models].sort((x, y) => x[1].label.localeCompare(y[1].label)).map(([id, m]) => `<option value="${id}">${esc(m.label)} (${m.n})</option>`).join('')}`;
            modelSel.disabled = typeSel.value === '';
            clearChecks();
            applyRows();
        });
        modelSel.addEventListener('change', () => { clearChecks(); applyRows(); });
    }
    if (search) search.addEventListener('input', applyRows);
    placeModalEl.querySelector('#layout-place-ok').addEventListener('click', () => {
        const footprintId = sensors ? '' : placeModalEl.querySelector('#layout-place-fp').value;
        if (!sensors && !footprintId) { err('main.layoutColocarSinHuella'); return; }
        const picked = Array.from(placeModalEl.querySelectorAll('[data-place-asset]:checked')).map((el) => Number(el.dataset.placeAsset));
        if (!picked.length) { err('main.layoutColocarSinElegir'); return; }
        const total = (sensors ? (d.sensors || []).length : d.spaces.length) + picked.length;
        if (total > (sensors ? LC.LIMITS.sensors : LC.LIMITS.spaces)) { Dashboard.showToast(t('main.layoutHuellaActivosTope', { n: sensors ? LC.LIMITS.sensors : LC.LIMITS.spaces }), 'warning'); return; }
        clearFilterOf(sensors ? 'sensors' : 'activos');
        picked.forEach((id) => {
            const a = (state.fixedAssets || []).find((x) => x.id === id);
            if (!a) return;
            if (sensors) {
                const s = ROW_FACTORY.sensors();
                s.assetRef = a.id;
                s.code = a.code;
                s.look = a.look || ''; // solo para dibujarlo (no se guarda): la apariencia de su modelo y las medidas del equipo
                if (a.look === 'photos' && a.photos) { s.modelId = a.modelId; s.photos = a.photos; }
                s.dim = { w: a.length || 0, h: a.height || 0, d: a.depth || 0 };
                (d.sensors = d.sensors || []).push(s);
                return;
            }
            const s = LC.applyAssetToSpace(ROW_FACTORY.spaces(), a, { typeKind: a.typeKind, metric: a.metric });
            s.footprintId = footprintId;
            if (a.look === 'photos' && a.photos) { s.look = 'photos'; s.modelId = a.modelId; s.photos = a.photos; } // solo para dibujarlo (no se guarda)
            d.spaces.push(s);
        });
        closePlaceAssets();
        panelScrollEnd = true;
        renderPanel();
        refreshLive();
    });
    placeModalEl.hidden = false;
}
// Las clasificaciones y los tipos de activo del cliente (catálogos Nuestras Clasificaciones de Activos y Nuestros Activos Fijos). Si no se pueden leer, el paso Activos sale sin opciones.
async function loadAssetLists() {
    const read = async (type) => {
        try {
            const r = await fetch(`/api/business/article-categories/${type}`, { credentials: 'include' });
            if (!r.ok) return [];
            return ((await r.json()).categories || []).map((c) => ({ id: c.id, name: c.name, status: c.status, kind: c.kind || '' })).filter((c) => c.name || c.status === 'active');
        } catch (err) { console.error('Layout: no se pudo leer la lista de activos', err); return []; }
    };
    const [classes, types] = await Promise.all([read('activos-clasificacion'), read('activos-fijos')]);
    assetLists = { classes, types };
}

// El Layout es de UN centro de costos: el que está elegido en el selector de arriba. Todas las llamadas al servidor llevan ese centro (el que se cargó, aunque el selector cambie mientras tanto).
function layoutUrl(url) {
    return state.centerId ? `${url}${url.includes('?') ? '&' : '?'}costCenterId=${state.centerId}` : url;
}
// El centro de costos (el sitio) del Layout va al final de la ruta de arriba: «Layout › sitio». Antes salía también en un recuadro aparte.
function updateCenterChip() {
    Dashboard.setBreadcrumbSuffix(state.costCenter ? state.costCenter.name : '');
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
// Mientras el Layout (de otro centro de costos, o el de antes de guardar) se carga, el croquis de antes se queda y arriba sale «Cargando el Layout…» (solo si tarda más de 0.25 s, para que lo rápido no parpadee).
let layoutLoadingTimer = 0;
function layoutLoading(on) {
    clearTimeout(layoutLoadingTimer);
    const el = $('layout-loading');
    if (!el) return;
    if (!on) { el.hidden = true; return; }
    layoutLoadingTimer = setTimeout(() => { el.hidden = false; }, 250);
}
async function loadLayout(opts = {}) {
    layoutLoading(true);
    try { await loadLayoutNow(opts); } finally { layoutLoading(false); }
}
async function loadLayoutNow(opts = {}) {
    walkExit(); // otro Layout (o descartar): se sale del recorrido
    state.centerId = Dashboard.getSingleSelectedCostCenterId();
    // lo que no depende de lo demás se pide a la vez: las listas de activos (de toda la empresa) van junto con el Layout
    const assetsLoading = loadAssetLists();
    if (!state.centerId) { await assetsLoading; showChooseCenter(); return; }
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
    state.fixedAssets = body.fixedAssets || []; // los activos de Alta Activos de este centro (los que se pueden colocar y los colocados)
    sfLastFetchedAt = Date.now();
    state.creating = false;
    state.planNew = false;
    state.planImage = '';
    state.draft = body.layout ? clone(body.layout) : null;
    initEditState(!!opts.keepView && !!state.draft);
    const loadPlanImage = async () => {
        if (!(body.layout && body.hasPlanImage)) return;
        try {
            const imgRes = await fetch(layoutUrl('/api/business/layout/plan-image'), { credentials: 'include' });
            if (imgRes.ok) {
                const { image } = await imgRes.json();
                state.planImage = image;
                state.planAspect = await imageAspect(image);
            }
        } catch (err) { console.error('Layout: no se pudo cargar el plano', err); }
    };
    await Promise.all([assetsLoading, loadPlanImage(), loadPieces(), loadLocatorCodes()]);
    updatePiecesBtn();
    state.loaded = true;
    if (state.mode !== 'edit') showAllLayers(); // en «Ver» se ve todo el Layout al entrar
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
    state.mode = 'edit'; // crear un Layout es editar
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
    state.mode = 'edit'; // crear un Layout es editar
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
    doors: () => { const wall = (state.draft.obstacles || []).find((o) => o.kind === 'wall'); return { id: uid('d'), name: t('main.layoutPuertaNueva'), type: 'dock', wallId: wall ? wall.id : '', dist: 0, width: 1.2, height: 2.1, open: 'swing', hinge: 'start', dir: 'in' }; },
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
    // algo nuevo del techo nace como ventilación (las cámaras y las bocinas se agregan en Seguridad) en el centro de la nave (corrido un poco para que no se encimen), pegado al techo; se acomoda con X e Y y se le cambia el tipo en la lista
    ceiling: () => {
        const d = state.draft;
        const xs = d.vertices.map((p) => p[0]);
        const ys = d.vertices.map((p) => p[1]);
        const n = (d.ceiling || []).length;
        return { id: uid('c'), code: '', type: 'ventilation', name: '', zoneId: '', x: round2((Math.min(...xs) + Math.max(...xs)) / 2 + (n % 5) * 1.5), y: round2((Math.min(...ys) + Math.max(...ys)) / 2 + Math.floor(n / 5) * 1.5) };
    },
    // un techo nuevo es plano y cubre toda la nave a la altura más alta de sus esquinas; su código (TE001…) lo pone el sistema
    roofs: () => ({ id: uid('rf'), code: '', name: '', shape: 'flat', cover: 'nave', h: round2(Math.max(...state.draft.vertices.map((p) => Number(p[2]) || 0)) || 6), material: 'sheet' }),
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
    // un piso nuevo es un rectángulo a nivel (0): hay que ponerle su nivel; su código (P001…) lo pone el sistema
    floors: () => ({ id: uid('p'), name: `${t('main.layoutPiso')} ${(state.draft.floors || []).length + 1}`, code: '', x: 1, y: 1, l: 5, w: 5, active: true }),
    // una rampa nueva no tiene De ni A: hay que elegirlos (no se puede guardar hasta entonces); su código (R001…) lo pone el sistema
    ramps: () => ({ id: uid('rp'), name: `${t('main.layoutRampa')} ${(state.draft.ramps || []).length + 1}`, code: '', x: 1, y: 1, l: 2, w: 2, from: '', to: '', active: true }),
    // una huella nueva no puede ser más alta que la nave: mide 4.5 m de alto o, si la nave es más baja, lo que mide la nave
    footprints: () => ({ id: uid('f'), code: '', zoneId: '', x: 1, y: 1, l: 3, d: 1.1, h: Math.min(4.5, Math.max(...state.draft.vertices.map((p) => Number(p[2]) || 0)) || 4.5), active: true }),
    // un activo siempre va dentro de una huella: nace sin huella y hay que elegirla (no se puede guardar hasta entonces)
    spaces: () => ({ id: uid('s'), footprintId: '', type: 'rack', code: '', levels: 1, drawers: '' }),
};
const STEP_OF_LIST = { vertices: 'contorno', obstacles: 'contorno', doors: 'puertas', power: 'luz', sensors: 'sensores', safety: 'seguridad', ceiling: 'techos', roofs: 'techos', transit: 'transito', objects: 'objetos', zones: 'zonas', floors: 'pisos', ramps: 'rampas', footprints: 'espacios', spaces: 'activos', bay: 'posiciones', lvl: 'niveles' };
// Los códigos los pone el sistema y no se editan: el de la zona (Z001…, consecutivo), el de la huella (H001… por zona, y su zona sale de dónde está en el croquis) y el del activo (letra de su tipo + número
// consecutivo por zona y tipo: A001, G001…). Lo que ya estaba guardado y sigue igual conserva su código; lo nuevo (todavía sin guardar) y lo que cambió de zona o de tipo lo recibe cada vez que se acomoda,
// así siempre es el que le toca, el mismo que le pondrá el servidor al guardar.
function syncHuellas() {
    const d = state.draft;
    const next = LC.lockCodes(LC.deriveCeilingZones(LC.deriveSafetyZones(LC.deriveTransitZones(LC.deriveSensorZones(LC.deriveSpaces(LC.deriveFootprintZones(d)))))), state.saved);
    d.transit = next.transit || d.transit || [];
    // los objetos toman del catálogo su dibujo y sus medidas (y las claves de antes pasan a los ids)
    const withCatalog = LC.applyTransitCatalog(d);
    d.objects = withCatalog.objects || d.objects;
    d.transit = withCatalog.transit || d.transit;
    d.zones = next.zones;
    // el código de cada piso (P001…) lo pone el sistema
    d.floors = LC.assignFloorCodes({ ...d, floors: d.floors || [] }).floors || [];
    // el código de cada rampa (R001…) también
    d.ramps = LC.assignRampCodes({ ...d, ramps: d.ramps || [] }).ramps || [];
    d.footprints = next.footprints;
    d.sensors = next.sensors;
    // puertas, luz y objetos: su código (D001…, C001…, J001…) lo pone el sistema; los obstáculos y sus contadores (doorNext, powerNext, obstacleNext, objectNext) viajan con el Layout
    d.doors = next.doors || d.doors;
    d.power = next.power || d.power;
    const objectCodes = new Map((next.objects || []).map((o) => [o.id, o.code]));
    d.objects = (d.objects || []).map((o) => (objectCodes.get(o.id) && objectCodes.get(o.id) !== o.code ? { ...o, code: objectCodes.get(o.id) } : o));
    ['doorNext', 'powerNext', 'obstacleNext', 'objectNext'].forEach((k) => { if (next[k]) d[k] = next[k]; else delete d[k]; });
    // las paredes: su código (M001…) y el contador de los números ya dados viajan con el Layout (sin él no se guarda ese campo)
    d.obstacles = next.obstacles || d.obstacles;
    if (next.wallNext) d.wallNext = next.wallNext; else delete d.wallNext;
    // los elementos de seguridad: su zona y su código (cada tipo con su letra); el contador de los números ya dados viaja con el Layout (sin él no se guarda ese campo)
    d.safety = next.safety || d.safety || [];
    if (next.safetyNext && Object.keys(next.safetyNext).length) d.safetyNext = next.safetyNext; else delete d.safetyNext;
    // lo que cuelga del techo: igual (su zona, su código por tipo y el contador de los números ya dados)
    d.ceiling = next.ceiling || d.ceiling || [];
    if (next.ceilingNext && Object.keys(next.ceilingNext).length) d.ceilingNext = next.ceilingNext; else delete d.ceilingNext;
    // los techos (cubiertas): su código (TE001…) y el contador de los números ya dados
    d.roofs = next.roofs || d.roofs || [];
    if (next.roofNext) d.roofNext = next.roofNext; else delete d.roofNext;
    d.spaces = state.renumber ? LC.renumberSpaceCodes(next).spaces : next.spaces; // Renumerar: consecutivos desde 001 por zona y tipo
}

// Paso Activos: la zona elegida en un renglón acota las huellas que se pueden escoger (solo de pantalla). Si la huella que ya tenía no es de esa zona, se quita para que elijan otra.
function onZonePick(el, event) {
    if (event.type !== 'change') return;
    const id = el.getAttribute('data-zone-pick');
    const row = (state.draft.spaces || []).find((x) => x.id === id);
    if (!row) return;
    zonePick.set(id, el.value);
    const fp = state.draft.footprints.find((f) => f.id === row.footprintId);
    if (fp && (fp.zoneId || '') !== el.value) row.footprintId = '';
    renderPanel();
    refreshLive();
}
function onEdit(event) {
    const el = event.target;
    if (state.draft && (el.getAttribute('data-cs') !== null || el.getAttribute('data-zs') !== null)) {
        onSidesEdit(el);
        // al salir de una medida vacía o en 0 el campo vuelve a mostrar la medida que sigue valiendo
        if (event.type === 'change' && /^len:/.test(el.getAttribute('data-cs') || el.getAttribute('data-zs')) && !(parseFloat(el.value) > 0)) renderPanel();
        // elegir o quitar una flecha en diagonal agrega o quita el campo de inclinación de ese renglón
        if (event.type === 'change' && /^dir:/.test(el.getAttribute('data-cs') || el.getAttribute('data-zs'))) renderPanel();
        return;
    }

    if (state.draft && el.getAttribute('data-cat') !== null) { onCategoryEdit(el); return; }
    if (state.draft && el.getAttribute('data-zone-pick') !== null) { onZonePick(el, event); return; }
    // Techos: elegir una zona más para lo que cubre el techo
    if (state.draft && el.getAttribute('data-roof-zadd') !== null) {
        if (event.type === 'change' && el.value) { toggleRoofZone(Number(el.getAttribute('data-roof-zadd')), el.value, true); renderPanel(); refreshLive(); }
        return;
    }
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
    } else if (list === 'ramps' && ['from', 'to'].includes(el.getAttribute('data-k'))) {
        const row = state.draft.ramps[Number(el.getAttribute('data-i'))];
        const rk = el.getAttribute('data-k');
        if (el.value) row[rk] = el.value; else delete row[rk];
        // una rampa ligada a sus pisos saca sus niveles de ellos: los propios de una rampa de antes ya no valen
        if (row.from && row.to) { delete row.lvl; delete row.lvl2; delete row.rise; }
    } else if (list === 'floors' && ['lvl', 'lvl2', 'rise'].includes(el.getAttribute('data-k'))) {
        // Nivel del piso (0 = a nivel: no se guarda), nivel de su parte alta (lo vuelve una rampa) y hacia qué lado sube. Quitar la parte alta quita el lado.
        const row = state.draft.floors[Number(el.getAttribute('data-i'))];
        const zk = el.getAttribute('data-k');
        if (zk === 'rise') { if (el.value) row.rise = el.value; else delete row.rise; } else {
            const raw = String(el.value).trim();
            const n = parseFloat(raw);
            if (raw !== '' && Number.isFinite(n)) row[zk] = n; else delete row[zk];
            if (zk === 'lvl' && row.lvl === 0) delete row.lvl;
        }
        if (row.lvl2 !== undefined && !row.rise) row.rise = 'right';
        if (row.lvl2 === undefined) delete row.rise;
        if (event.type === 'change') renderPanel();
    } else if (list === 'bay') {
        // Un espacio (nivel × espacio) de un activo: solo se guarda lo que se cambió; lo que vuelve a ser como lo de por defecto se quita.
        const space = state.draft.spaces[Number(el.getAttribute('data-i'))];
        const n = Number(el.getAttribute('data-n'));
        const c = Number(el.getAttribute('data-c'));
        const bayKey = el.getAttribute('data-k');
        if (bayKey === 'count') { // la cantidad de posiciones del espacio se aplica al terminar de escribir (no con cada tecla)
            if (event.type === 'change' && setPositionCount(space, n, c, value)) { renderPanel(); refreshLive(); }
            return;
        }
        if (!space.bays) space.bays = [];
        let bay = space.bays.find((b) => b.n === n && b.c === c);
        if (!bay) { bay = { n, c }; space.bays.push(bay); }
        if (bayKey === 'x' || bayKey === 'y') { if (el.value === '' || !(value >= 0)) delete bay[bayKey]; else bay[bayKey] = Math.round(value * 100) / 100; } else if (value > 0) bay[bayKey] = value; else delete bay[bayKey];
        if (Object.keys(bay).length <= 2) space.bays = space.bays.filter((b) => b !== bay);
        if (!space.bays.length) delete space.bays;
        // los m² (largo × fondo) y los m³ (× alto) se recalculan al momento
        const mBay = LC.bayMeasures(space, n, c);
        const setBayCell = (attr, v) => { const cell = document.querySelector(`[${attr}="${el.getAttribute('data-i')}|${n}|${c}"]`); if (cell) cell.textContent = String(Math.round(v * 100) / 100); };
        setBayCell('data-bay-m2', mBay.l * mBay.w);
        setBayCell('data-bay-m3', mBay.l * mBay.w * mBay.h);
        setBayCell('data-bay-from', mBay.floorH + mBay.beam);
        setBayCell('data-bay-to', mBay.floorH + mBay.beam + mBay.h);
        // el largo y el fondo de la posición no pasan del largo y el fondo del activo, ni su alto del espacio de su nivel: se marcan en rojo al momento
        const lvHere = LC.levelMeasures(space, n).h;
        [['l', space.l > 0 && mBay.l > space.l + 0.005], ['w', space.d > 0 && mBay.w > space.d + 0.005], ['h', bay.h !== undefined && lvHere > 0 && mBay.h > lvHere + 0.005]].forEach(([k, over]) => {
            const dimBox = document.querySelector(`[data-l="bay"][data-i="${el.getAttribute('data-i')}"][data-n="${n}"][data-c="${c}"][data-k="${k}"]`);
            if (dimBox) dimBox.classList.toggle('layout-missing', over);
        });
        // las columnas de un nivel no pueden sumar más que el largo del activo: el largo de todas las columnas del nivel se marca (o se desmarca) junto
        const sumOver = LC.levelLengthSum(space, n).over;
        for (let col = 1; col <= LC.levelSlots(space, n); col += 1) {
            const lenBox = document.querySelector(`[data-l="bay"][data-i="${el.getAttribute('data-i')}"][data-n="${n}"][data-c="${col}"][data-k="l"]`);
            if (lenBox) lenBox.classList.toggle('layout-missing', sumOver || (space.l > 0 && LC.bayMeasures(space, n, col).l > space.l + 0.005));
        }
        syncBayXY(space, n, el); // el lugar (X, Y) de los demás espacios del nivel cambia cuando uno cambia de largo, de fondo o de lugar
        computeSpaceIssues();
        applyBayMarks();
    } else if (list === 'lvl') {
        // Un nivel de un activo (paso Niveles): solo se guarda lo que se cambió; lo que vuelve a quedar vacío o en 0 es lo de por defecto y se quita. Vale para todas las columnas del nivel.
        const space = state.draft.spaces[Number(el.getAttribute('data-i'))];
        const n = Number(el.getAttribute('data-n'));
        const lvKey = el.getAttribute('data-k');
        if (!space.lvls) space.lvls = [];
        let lv = space.lvls.find((l) => l.n === n);
        if (!lv) { lv = { n }; space.lvls.push(lv); }
        if (lvKey === 'name') {
            // el nombre del nivel es opcional y de quien lo captura: vacío = sin nombre
            if (String(value).trim()) lv.name = String(value); else delete lv.name;
        } else if (lvKey === 'slots') {
            // cuántas posiciones tiene este nivel; si es la cantidad del activo no se guarda aparte. Los huecos de columnas que el nivel ya no tiene se quitan.
            const count = Math.max(1, Math.round(value) || 1);
            if (count !== Math.max(1, Math.round(Number(space.slots)) || 1)) lv.slots = Math.min(count, LC.LIMITS.slots); else delete lv.slots;
            const own = LC.levelSlots(space, n);
            if (space.bays) { space.bays = space.bays.filter((b) => b.n !== n || b.c <= own); if (!space.bays.length) delete space.bays; }
        } else if (value > 0) lv[lvKey] = value; else delete lv[lvKey];
        if (Object.keys(lv).length <= 1) space.lvls = space.lvls.filter((l) => l !== lv);
        if (!space.lvls.length) delete space.lvls;
        // las alturas del piso de los niveles de arriba (automáticas) y el alto de almacenamiento se recalculan al momento (applyLevelMarks); al soltar el campo se vuelve a dibujar la tabla
        computeSpaceIssues();
        applyLevelMarks();
        if (event.type === 'change') renderPanel();
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
        } else if (list === 'safety' && key === 'model') {
            setHydrantModel(row, el.value);
        } else if (list === 'safety' && (key === 'hang' || key === 'fov' || key === 'range')) {
            // «Cuelga a», el ángulo de visión y el alcance son opcionales: vacío = el de fábrica (pegado al techo, 90°, 12 m la cámara y 15 m la bocina)
            const raw = String(el.value).trim();
            const n = parseFloat(raw);
            const lo = key === 'hang' ? 0.01 : (key === 'fov' ? 5 : 1);
            const hi = key === 'hang' ? LC.LIMITS.maxHeight : (key === 'fov' ? 360 : 200);
            if (raw !== '' && Number.isFinite(n) && n >= lo) row[key] = Math.min(key === 'fov' ? Math.round(n) : n, hi); else delete row[key];
        } else if (list === 'safety' && key === 'aim') {
            if (LC.SAFETY_AIMS.includes(el.value) && el.value !== LC.CAMERA_DEFAULTS.aim) row.aim = el.value; else delete row.aim;
        } else if (list === 'roofs' && key === 'shape') {
            setRoofShape(row, el.value);
        } else if (list === 'roofs' && key === 'cover') {
            setRoofCover(row, el.value);
        } else if (list === 'roofs' && (key === 'h' || key === 'h2')) {
            // las alturas del techo se escriben en metros desde el piso: vacío = sin altura (no se puede guardar así)
            const raw = String(el.value).trim();
            const n = parseFloat(raw);
            if (raw !== '' && Number.isFinite(n) && n > 0) row[key] = Math.min(n, LC.LIMITS.maxHeight); else delete row[key];
        } else if (list === 'roofs' && ['x', 'y', 'l', 'w'].includes(key)) {
            // el área que cubre un techo: lugar y medidas en metros
            const raw = String(el.value).trim();
            const n = parseFloat(raw);
            if (raw !== '' && Number.isFinite(n)) row[key] = Math.min(Math.max(n, key === 'x' || key === 'y' ? -LC.LIMITS.maxM : 0), LC.LIMITS.maxM); else delete row[key];
        } else if (list === 'roofs' && key === 'dir') {
            row.dir = (row.shape === 'shed' ? LC.ROOF_SHED_DIRS : LC.ROOF_GABLE_DIRS).includes(el.value) ? el.value : row.dir;
        } else if (list === 'roofs' && key === 'material') {
            row.material = LC.ROOF_MATERIALS.includes(el.value) ? el.value : 'sheet';
        } else if (list === 'roofs' && key === 'color') {
            if (LC.ROOF_COLORS[el.value]) row.color = el.value; else delete row.color;
        } else if (list === 'sensors' && key === 'side') {
            // el lado de la pared donde está el sensor (A o B); vacío = automático (el lado de siempre)
            if (el.value === 'a' || el.value === 'b') row.side = el.value; else delete row.side;
        } else if (list === 'ceiling' && key === 'h') {
            // «Cuelga a» es opcional: vacío = pegado al techo
            const raw = String(el.value).trim();
            const n = parseFloat(raw);
            if (raw !== '' && Number.isFinite(n) && n > 0) row.h = Math.min(n, LC.LIMITS.maxHeight); else delete row.h;
        } else if (list === 'ceiling' && key === 'type') {
            row.type = LC.CEILING_TYPES.includes(el.value) ? el.value : 'camera';
        } else if (list === 'transit' && key === 'h') {
            // el alto libre es opcional: vacío = no se revisa el alto
            const raw = String(el.value).trim();
            const n = parseFloat(raw);
            if (raw !== '' && Number.isFinite(n) && n > 0) row.h = n; else delete row.h;
        } else if (list === 'obstacles' && (key === 'h' || key === 'h2' || key === 'hb' || key === 'hb2')) {
            // la altura de una pared es opcional y por esquina (h al inicio, h2 al final): vacío = la de siempre (la del contorno en ese extremo o el promedio de la nave)
            const raw = String(el.value).trim();
            const n = parseFloat(raw);
            if (raw !== '' && Number.isFinite(n) && n >= 0.01) row[key] = Math.min(n, LC.LIMITS.maxHeight); else delete row[key];
        } else if (list === 'obstacles' && key === 'elev') {
            // la altura del piso de un obstáculo es opcional: vacío (o 0) = va pegado al piso
            const raw = String(el.value).trim();
            const n = parseFloat(raw);
            if (raw !== '' && Number.isFinite(n) && n > 0) row.elev = Math.min(n, LC.LIMITS.maxHeight); else delete row.elev;
        } else if (list === 'obstacles' && (key === 'kind' || key === 'mode')) {
            setObstacleKindOrMode(row, key, el.value);
        } else if (list === 'zones' && (key === 'ox' || key === 'oy')) {
            // una zona de forma libre se mueve completa desde su primera esquina
            const o = row.pts[0] || [row.x, row.y];
            const dx = key === 'ox' ? value - o[0] : 0;
            const dy = key === 'oy' ? value - o[1] : 0;
            row.pts = row.pts.map((p) => [round2(p[0] + dx), round2(p[1] + dy)]);
            syncZoneBox(row);
        } else if (list === 'spaces' && key === 'ownName') {
            // el nombre propio del activo es opcional: vacío = se ve el nombre de su huella
            if (String(value).trim()) row.ownName = String(value); else delete row.ownName;
        } else if (key === 'assetClassId' || key === 'assetId') {
            const n = parseInt(el.value, 10);
            if (n > 0) row[key] = n; else delete row[key]; // sin elegir = el espacio se guarda sin ese campo
            // la LETRA del código sale del tipo de activo (si su catálogo la trae); un activo para operar (clasificación en m²) tiene un solo nivel y no se edita
            if (list === 'spaces' && key === 'assetId' && n > 0) { const tr = assetLists.types.find((r) => r.id === n); if (tr && LC.SPACE_TYPES.includes(tr.kind)) row.type = tr.kind; }
            if (list === 'spaces' && key === 'assetClassId' && n > 0) { const cr = assetLists.classes.find((r) => r.id === n); if (cr && cr.kind === 'm2') row.levels = 1; }
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
        } else if (list === 'zones' && key === 'h') {
            if (value > 0) row.h = value; else delete row.h; // vacío = el techo de la nave en ese lugar
        } else if (list === 'footprints' && key === 'name') {
            if (String(value).trim()) row.name = String(value); else delete row.name; // sin nombre = la huella se guarda sin ese campo
        } else if (key === 'use') {
            if (value) row.use = value; else delete row.use; // sin definir = la zona se guarda sin ese campo
        } else if (key === 'slots') {
            const n = Math.max(1, Math.round(value) || 1);
            if (n > 1) row.slots = Math.min(n, LC.LIMITS.slots); else delete row.slots;

        } else row[key] = (key === 'wall' || key === 'levels') ? Math.max(1, Math.round(value) || 1) : value;
    }
    // Al cambiar el nombre de un piso, las listas De y A de las rampas deben mostrar el nombre nuevo (solo al terminar de escribir).
    if (event.type === 'change' && list === 'floors' && el.getAttribute('data-k') === 'name') renderPanel();
    // Al cambiar el nombre de una zona, el selector de zona de los espacios debe mostrar el nombre nuevo (solo al terminar de escribir).
    if (event.type === 'change' && list === 'zones' && el.getAttribute('data-k') === 'name') renderPanel();
    // Al cambiar el tipo o la forma de ponerlo de un obstáculo cambian las celdas del renglón (altura del desnivel, lado o X).
    if (event.type === 'change' && list === 'obstacles' && ['kind', 'mode'].includes(el.getAttribute('data-k'))) renderPanel();
    // Al cambiar cómo abre una puerta, la bisagra y el lado se apagan si es fija.
    if (event.type === 'change' && list === 'doors' && el.getAttribute('data-k') === 'open') renderPanel();
    // Al cambiar la pared de un sensor, el lado vuelve a «Automático» (el lado A y el B son de la pared nueva) y las dos opciones del lado se vuelven a escribir con las zonas de esa pared.
    if (event.type === 'change' && list === 'sensors' && el.getAttribute('data-k') === 'wallId') { const sn = state.draft.sensors[Number(el.getAttribute('data-i'))]; if (sn) delete sn.side; renderPanel(); }
    // Al cambiar de persona a montacargas cambian sus medidas (si eran las de partida) y su nombre.
    if (event.type === 'change' && list === 'objects' && el.getAttribute('data-k') === 'equipId') renderPanel();
    // Al cambiar el tipo de un elemento de seguridad cambian sus celdas (la ruta lleva punto de llegada) y su código.
    if (event.type === 'change' && list === 'safety' && (el.getAttribute('data-k') === 'type' || el.getAttribute('data-k') === 'model')) renderPanel();
    // Al cambiar la forma de un techo (o lo que cubre) cambian las celdas de su renglón.
    if (event.type === 'change' && list === 'roofs' && ['shape', 'cover'].includes(el.getAttribute('data-k'))) renderPanel();
    // Al pasar un activo a otra huella cambia su zona (que se ve en el renglón).
    if (event.type === 'change' && list === 'spaces' && ['footprintId', 'assetId', 'assetClassId'].includes(el.getAttribute('data-k'))) renderPanel();
    refreshLive();
}
$('layout-panel').addEventListener('focusin', (event) => selectRowFrom(event.target));
$('layout-panel').addEventListener('click', (event) => selectRowFrom(event.target));
$('layout-panel').addEventListener('click', (event) => {
    if (state.focus !== 'localizadores' || event.target.closest('button, a, input, select, label')) return;
    const tr = event.target.closest('tr[data-locator]');
    if (tr) locatorRowPick(tr.getAttribute('data-locator'));
});
$('layout-panel').addEventListener('input', onEdit);
$('layout-panel').addEventListener('change', onEdit);
$('layout-panel').addEventListener('click', (event) => {
    if (event.target.closest('[data-step-all]')) { fxToggleAll(); return; }
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
    const fmtFloor = event.target.closest('[data-fmtfloor]');
    if (fmtFloor) { openFloorFmtDialog(Number(fmtFloor.dataset.fmtfloor)); return; }
    const fmtBay = event.target.closest('[data-fmtbay]');
    if (fmtBay) { openBayFmtDialog(Number(fmtBay.dataset.fmtbay)); return; }
    const objColor = event.target.closest('[data-objcolor]');
    if (objColor) { pickObjectColor(objColor.dataset.objcolor); return; }
    const fmtTr = event.target.closest('[data-fmttr]');
    if (fmtTr) { openTransitFmtDialog(Number(fmtTr.dataset.fmttr)); return; }
    const fmtWall = event.target.closest('[data-fmtwall]');
    if (fmtWall) { openWallFmtDialog(Number(fmtWall.dataset.fmtwall)); return; }
    const fmtRamp = event.target.closest('[data-fmtramp]');
    if (fmtRamp) { openRampFmtDialog(Number(fmtRamp.dataset.fmtramp)); return; }
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
    const roofZdel = event.target.closest('[data-roof-zdel]');
    if (roofZdel) { const v = roofZdel.dataset.roofZdel; const at = v.indexOf(':'); toggleRoofZone(Number(v.slice(0, at)), v.slice(at + 1), false); renderPanel(); refreshLive(); return; }
    const szOpen = event.target.closest('[data-sz-open]');
    if (szOpen) { openSensorZonesPop(Number(szOpen.dataset.szOpen), szOpen); return; }
    const szDel = event.target.closest('[data-sz-del]');
    if (szDel) { toggleSensorZone(szDel.dataset.szDel, false); return; }
    const placeBtn = event.target.closest('[data-place-assets]');
    if (placeBtn) { openPlaceAssets({ sensors: placeBtn.dataset.placeAssets === 'sensors' }); return; }
    const addObj = event.target.closest('[data-add-object]');
    if (addObj) { addObject(); return; }
    const lvApply = event.target.closest('[data-lvl-apply]');
    if (lvApply) { applyLevelToAll(lvApply.dataset.lvlApply); return; }
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
        const name = list === 'zones' || list === 'floors' || list === 'ramps' ? row.name : row.code;
        const message = t(list === 'zones' ? 'main.layoutEliminarZonaConfirm' : (list === 'floors' ? 'main.layoutEliminarPisoConfirm' : (list === 'ramps' ? 'main.layoutEliminarRampaConfirm' : 'main.layoutEliminarEspacioConfirm'))).replace('{name}', name);
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
// El icono de paleta de cada renglón de Pisos (solo con la hoja del icono en el árbol): el color y la trama propios del piso; el cuadrito muestra el color que lleva ahora (el de su nivel si no tiene formato propio).
function floorFmtButton(f, i, dis) {
    if (!(state.perms && state.perms.canFormatFloors)) return '';
    const cur = LC.floorFmtOf(state.draft, f);
    return `<button type="button" class="btn btn-secondary layout-toggle layout-fmt${f.fmt ? ' on' : ''}" data-fmtfloor="${i}" data-help-key="layoutFloorFmt" aria-label="${esc(t('main.layoutFormatoPiso'))} ${esc(f.code || '')}"${dis ? ' disabled' : ''}><i class="bx bx-palette" aria-hidden="true"></i><span class="layout-fmt-dot" style="background:${esc(cur.fill)};border-color:${esc(cur.bcolor)}"></span></button>`;
}
// El icono de paleta de cada renglón de Espacios (solo con la hoja del icono en el árbol): el color, la trama y el borde de ese NÚMERO de espacio (todos los E001, todos los E002…); el cuadrito muestra el color que lleva ahora.
function bayFmtButton(c, dis) {
    if (!(state.perms && state.perms.canFormatBays)) return '';
    const cur = LC.bayFmtOf(state.draft, c);
    const own = !!(state.draft.bayFmt && state.draft.bayFmt[String(c)]);
    return `<button type="button" class="btn btn-secondary layout-toggle layout-fmt${own ? ' on' : ''}" data-fmtbay="${c}" data-help-key="layoutBayFmt" aria-label="${esc(t('main.layoutFormatoEspacio'))} E${ubicPad(c)}"${dis ? ' disabled' : ''}><i class="bx bx-palette" aria-hidden="true"></i><span class="layout-fmt-dot" style="background:${esc(cur.fill)};border-color:${esc(cur.bcolor)}"></span></button>`;
}
// Cuántos espacios (de todos los activos y niveles) llevan ese número.
function bayCountOf(c) {
    let total = 0;
    (state.draft.spaces || []).forEach((s) => {
        if (s.active === false) return;
        for (let n = 1; n <= (s.levels || 1); n += 1) if (c <= LC.levelSlots(s, n)) total += 1;
    });
    return total;
}
// El icono de paleta de cada renglón de Rampas (con la misma hoja del icono en el árbol que los pisos): por defecto la rampa se difumina entre los colores de los dos pisos que toca (el cuadrito muestra ese degradado);
// con color y trama propios se ve como un piso con formato (el cuadrito muestra su color).
function rampFmtButton(r, i, dis) {
    if (!(state.perms && state.perms.canFormatFloors)) return '';
    const own = r.fmt ? pickFmt(r.fmt) : null;
    const ends = LC.rampEndColors(state.draft, r);
    const dot = own ? `background:${esc(own.fill)};border-color:${esc(own.bcolor)}` : `background:linear-gradient(90deg,${esc(ends ? ends.lo : '#e9e9ee')},${esc(ends ? ends.hi : '#e9e9ee')})`;
    return `<button type="button" class="btn btn-secondary layout-toggle layout-fmt${r.fmt ? ' on' : ''}" data-fmtramp="${i}" data-help-key="layoutRampFmt" aria-label="${esc(t('main.layoutFormatoRampa'))} ${esc(r.code || '')}"${dis ? ' disabled' : ''}><i class="bx bx-palette" aria-hidden="true"></i><span class="layout-fmt-dot" style="${dot}"></span></button>`;
}
// Los nombres de los dos extremos de una rampa para la ventana (la nave o el código del piso): { lo, hi }.
function rampEndNames(r) {
    const info = r ? LC.rampInfo(state.draft, r) : null;
    const nameOf = (ref) => (ref === 'nave' ? t('main.layoutRampaNave') : (((state.draft.floors || []).find((f) => f.id === ref) || {}).code || '—'));
    return info && info.ok && info.loRef ? { lo: nameOf(info.loRef), hi: nameOf(info.hiRef) } : { lo: '—', hi: '—' };
}
// El icono de paleta de cada renglón de Paredes (con la misma hoja del icono en el árbol que los pisos): el color, la trama y el borde propios de la pared; el cuadrito muestra el que lleva ahora (oscuro si no tiene).
const WALL_DEFAULT_FMT = { fill: '#3f435d', pattern: 'solid', pcolor: '#14161f', line: 'thin', bcolor: '#14161f' };
function wallFmtButton(o, i, dis) {
    if (!(state.perms && state.perms.canFormatFloors)) return '';
    const cur = o.fmt ? pickFmt(o.fmt) : WALL_DEFAULT_FMT;
    return `<button type="button" class="btn btn-secondary layout-toggle layout-fmt${o.fmt ? ' on' : ''}" data-fmtwall="${i}" data-help-key="layoutWallFmt" aria-label="${esc(t('main.layoutFormatoPared'))} ${esc(o.code || '')}"${dis ? ' disabled' : ''}><i class="bx bx-palette" aria-hidden="true"></i><span class="layout-fmt-dot" style="background:${esc(cur.fill)};border-color:${esc(cur.bcolor)}"></span></button>`;
}
// El icono de paleta de cada renglón de Tránsito (con la misma hoja del icono en el árbol que los pisos y las paredes): el color, la trama y el borde propios del pasillo; el cuadrito muestra el que lleva ahora.
function transitFmtButton(p, i, dis) {
    if (!(state.perms && state.perms.canFormatFloors)) return '';
    const cur = p.fmt ? pickFmt(p.fmt) : window.LayoutMapSvg.defaultFmt(p.type === 'between' ? 'aisle2' : 'aisle');
    return `<button type="button" class="btn btn-secondary layout-toggle layout-fmt${p.fmt ? ' on' : ''}" data-fmttr="${i}" data-help-key="layoutTransitFmt" aria-label="${esc(t('main.layoutFormatoPasillo'))} ${esc(p.code || '')}"${dis ? ' disabled' : ''}><i class="bx bx-palette" aria-hidden="true"></i><span class="layout-fmt-dot" style="background:${esc(cur.fill)};border-color:${esc(cur.bcolor)}"></span></button>`;
}
// A qué pasillos se aplica lo que se elige en la ventana: solo a ese o a todos los pasillos.
function transitTargets(p, scope) {
    return scope === 'all' ? (state.draft.transit || []) : [p];
}
// A qué paredes se aplica lo que se elige en la ventana: solo a esa o a todas las paredes.
function wallTargets(w, scope) {
    return scope === 'all' ? (state.draft.obstacles || []).filter((x) => x.kind === 'wall') : [w];
}
// A qué pisos se aplica lo que se elige en la ventana: solo a ese o a los que tienen su mismo nivel (y, si es una rampa, sus mismos dos niveles).
function floorTargets(f, scope) {
    if (scope !== 'level') return [f];
    const same = (x) => (Number(x.lvl) || 0) === (Number(f.lvl) || 0) && (x.lvl2 === undefined) === (f.lvl2 === undefined) && (f.lvl2 === undefined || Number(x.lvl2) === Number(f.lvl2));
    return (state.draft.floors || []).filter(same);
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
    if (fmtDialog && fmtDialog.kind === 'bay') {
        const c = Number(fmtDialog.targetId);
        const code = `E${ubicPad(c)}`;
        box.hidden = false;
        box.innerHTML = `<legend>${esc(t('main.layoutAplicarA'))}</legend><label class="layout-fmt-opt" data-help-key="layoutBayFmt"><input type="radio" name="layout-fmt-scope" value="all" checked><b>${esc(t('main.layoutAplicarTodosEspacios', { code }))}</b><span>${esc(t('main.layoutAplicarTodosEspaciosSub', { n: String(bayCountOf(c)), code }))}</span></label>`;
        return;
    }
    if (fmtDialog && fmtDialog.kind === 'transit') {
        const p = (state.draft.transit || []).find((x) => x.id === fmtDialog.targetId);
        box.hidden = !p;
        if (!p) return;
        const options = [['one', t('main.layoutAplicarUnPasillo'), p.code || ''], ['all', t('main.layoutAplicarTodosPasillos'), t('main.layoutAplicarTodosPasillosSub').replace('{n}', String(transitTargets(p, 'all').length))]];
        box.innerHTML = `<legend>${esc(t('main.layoutAplicarA'))}</legend>${options.map(([value, title, sub]) => `<label class="layout-fmt-opt" data-help-key="layoutFmtScope"><input type="radio" name="layout-fmt-scope" value="${value}"${fmtDialog.scope === value ? ' checked' : ''}><b>${esc(title)}</b><span>${esc(sub)}</span></label>`).join('')}`;
        return;
    }
    if (fmtDialog && fmtDialog.kind === 'wall') {
        const w = (state.draft.obstacles || []).find((x) => x.id === fmtDialog.targetId);
        box.hidden = !w;
        if (!w) return;
        const options = [['one', t('main.layoutAplicarUnaPared'), w.code || ''], ['all', t('main.layoutAplicarTodasParedes'), t('main.layoutAplicarTodasParedesSub').replace('{n}', String(wallTargets(w, 'all').length))]];
        box.innerHTML = `<legend>${esc(t('main.layoutAplicarA'))}</legend>${options.map(([value, title, sub]) => `<label class="layout-fmt-opt" data-help-key="layoutFmtScope"><input type="radio" name="layout-fmt-scope" value="${value}"${fmtDialog.scope === value ? ' checked' : ''}><b>${esc(title)}</b><span>${esc(sub)}</span></label>`).join('')}`;
        return;
    }
    if (fmtDialog && fmtDialog.kind === 'ramp') {
        const r = (state.draft.ramps || []).find((x) => x.id === fmtDialog.targetId);
        box.hidden = !r;
        if (!r) return;
        const names = rampEndNames(r);
        const options = [['gradient', t('main.layoutRampaDifuminar'), t('main.layoutRampaDifuminarSub', names)], ['own', t('main.layoutRampaPropio'), t('main.layoutRampaPropioSub')]];
        box.innerHTML = `<legend>${esc(t('main.layoutRampaColor'))}</legend>${options.map(([value, title, sub]) => `<label class="layout-fmt-opt" data-help-key="layoutRampFmt"><input type="radio" name="layout-fmt-mode" value="${value}"${fmtDialog.mode === value ? ' checked' : ''}><b>${esc(title)}</b><span>${esc(sub)}</span></label>`).join('')}`;
        return;
    }
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
    if (fmtDialog && fmtDialog.kind === 'floor') {
        const f = (state.draft.floors || []).find((x) => x.id === fmtDialog.targetId);
        box.hidden = !f;
        if (!f) return;
        const lvl = Number(f.lvl) || 0;
        const options = [
            ['one', t('main.layoutAplicarUnaPiso'), f.code || '', false],
            ['level', t('main.layoutAplicarNivelPiso'), t('main.layoutAplicarNivelSubPiso').replace('{level}', `${lvl > 0 ? '+' : ''}${fmt(lvl)}`).replace('{n}', String(floorTargets(f, 'level').length)), false],
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
    // Una rampa en modo «Difuminar»: no hay nada que elegir (colores, rayas ni borde); se muestra el degradado que va a llevar.
    const tabsEl = fmtModalEl && fmtModalEl.querySelector('.layout-fmt-tabs');
    const gradientRamp = fmtDialog.kind === 'ramp' && fmtDialog.mode === 'gradient';
    if (tabsEl) { tabsEl.hidden = gradientRamp; tabsEl.style.display = gradientRamp ? 'none' : ''; }
    if (gradientRamp) {
        const r = (state.draft.ramps || []).find((x) => x.id === fmtDialog.targetId);
        const ends = (r && LC.rampEndColors(state.draft, r)) || { lo: '#e9e9ee', hi: '#e9e9ee' };
        const names = rampEndNames(r);
        $('layout-fmt-body').innerHTML = `<div><p class="layout-muted">${esc(t('main.layoutRampaDifuminadoNota', names))}</p></div><div class="layout-fmt-preview"><h4>${esc(t('main.layoutVistaPrevia'))}</h4><svg viewBox="0 0 230 150" role="img" aria-label="${esc(t('main.layoutVistaPrevia'))}"><defs><linearGradient id="fpv-ramp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${esc(ends.lo)}"/><stop offset="1" stop-color="${esc(ends.hi)}"/></linearGradient></defs><rect x="40" y="35" width="150" height="80" rx="3" fill="url(#fpv-ramp)" stroke="${esc(LC.mixHex(ends.hi, '#000000', 0.4))}" stroke-width="1.2"/><text class="lt3" x="115" y="80" text-anchor="middle">${esc((r && r.code) || '')}</text></svg></div>`;
        return;
    }
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
    const space = fmtDialog.kind === 'bay' ? { code: `E${ubicPad(Number(fmtDialog.targetId))}` } : fmtDialog.kind === 'space' ? state.draft.footprints.find((s) => s.id === fmtDialog.targetId) : (fmtDialog.kind === 'asset' ? state.draft.spaces.find((s) => s.id === fmtDialog.targetId) : (fmtDialog.kind === 'floor' ? (state.draft.floors || []).find((s) => s.id === fmtDialog.targetId) : (fmtDialog.kind === 'ramp' ? (state.draft.ramps || []).find((s) => s.id === fmtDialog.targetId) : (fmtDialog.kind === 'wall' ? (state.draft.obstacles || []).find((s) => s.id === fmtDialog.targetId) : (fmtDialog.kind === 'transit' ? (state.draft.transit || []).find((s) => s.id === fmtDialog.targetId) : null)))));
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
            if (fmtDialog.kind === 'bay') {
                if (state.draft.bayFmt) { delete state.draft.bayFmt[fmtDialog.targetId]; if (!Object.keys(state.draft.bayFmt).length) delete state.draft.bayFmt; }
            } else if (fmtDialog.kind === 'floor') {
                const fl = (state.draft.floors || []).find((r) => r.id === fmtDialog.targetId);
                if (fl) floorTargets(fl, fmtDialog.scope).forEach((x) => { delete x.fmt; });
            } else if (fmtDialog.kind === 'transit') {
                const tp = (state.draft.transit || []).find((r) => r.id === fmtDialog.targetId);
                if (tp) transitTargets(tp, fmtDialog.scope).forEach((x) => { delete x.fmt; });
            } else if (fmtDialog.kind === 'wall') {
                const wl = (state.draft.obstacles || []).find((r) => r.id === fmtDialog.targetId);
                if (wl) wallTargets(wl, fmtDialog.scope).forEach((x) => { delete x.fmt; });
            } else if (fmtDialog.kind === 'ramp') {
                const rp = (state.draft.ramps || []).find((r) => r.id === fmtDialog.targetId);
                if (rp) delete rp.fmt;
            } else if (fmtDialog.kind === 'asset') {
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
                if (fmtDialog.kind === 'bay') {
                    // con formato propio (aunque no se haya cambiado nada) se vuelve a guardar; sin formato y sin cambios (se queda el color de fábrica de su número) no hay nada que aplicar
                    const own = !!(state.draft.bayFmt && state.draft.bayFmt[fmtDialog.targetId]);
                    if (own || JSON.stringify(fmtDialog.draft) !== JSON.stringify(fmtDialog.start)) {
                        const next = { ...(state.draft.bayFmt || {}), [fmtDialog.targetId]: { ...fmtDialog.draft } };
                        state.draft.bayFmt = Object.fromEntries(Object.keys(next).sort((a, z) => Number(a) - Number(z)).map((k) => [k, next[k]]));
                    }
                } else if (fmtDialog.kind === 'floor') {
                    const fl = (state.draft.floors || []).find((r) => r.id === fmtDialog.targetId);
                    // Con formato propio (aunque no se haya cambiado nada) se puede copiar a los demás del grupo; sin formato y sin cambios (se queda el color de su nivel) no hay nada que aplicar.
                    if (fl && (fl.fmt || JSON.stringify(fmtDialog.draft) !== JSON.stringify(fmtDialog.start))) floorTargets(fl, fmtDialog.scope).forEach((x) => { x.fmt = { ...fmtDialog.draft }; });
                } else if (fmtDialog.kind === 'transit') {
                    // Con formato propio (aunque no se haya cambiado nada) se puede copiar a los demás pasillos; sin formato y sin cambios no hay nada que aplicar.
                    const tp = (state.draft.transit || []).find((r) => r.id === fmtDialog.targetId);
                    if (tp && (tp.fmt || JSON.stringify(fmtDialog.draft) !== JSON.stringify(fmtDialog.start))) transitTargets(tp, fmtDialog.scope).forEach((x) => { x.fmt = { ...fmtDialog.draft }; });
                } else if (fmtDialog.kind === 'wall') {
                    // Con formato propio (aunque no se haya cambiado nada) se puede copiar a las demás paredes; sin formato y sin cambios no hay nada que aplicar.
                    const wl = (state.draft.obstacles || []).find((r) => r.id === fmtDialog.targetId);
                    if (wl && (wl.fmt || JSON.stringify(fmtDialog.draft) !== JSON.stringify(fmtDialog.start))) wallTargets(wl, fmtDialog.scope).forEach((x) => { x.fmt = { ...fmtDialog.draft }; });
                } else if (fmtDialog.kind === 'ramp') {
                    // «Difuminar» (por defecto) no lleva formato propio; «Elegir color y trama» sí
                    const rp = (state.draft.ramps || []).find((r) => r.id === fmtDialog.targetId);
                    if (rp) { if (fmtDialog.mode === 'own') rp.fmt = { ...fmtDialog.draft }; else delete rp.fmt; }
                } else if (fmtDialog.kind === 'asset') {
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
        if (event.target.name === 'layout-fmt-mode' && fmtDialog) { fmtDialog.mode = event.target.value; renderFmtBody(); }
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
// La ventana de formato de un NÚMERO de espacio: color, trama y borde como los pisos; se aplica a todos los espacios con ese número (no hay otro alcance).
function openBayFmtDialog(c) {
    if (!state.draft || !(c >= 1)) return;
    ensureFmtModal();
    const base = pickFmt(LC.bayFmtOf(state.draft, c));
    fmtDialog = { kind: 'bay', targetId: String(c), draft: { ...base }, start: { ...base }, tab: 'fill', scope: 'all' };
    $('layout-fmt-title').textContent = `${t('main.layoutFormatoEspacio')} E${ubicPad(c)}`;
    $('layout-fmt-namefield').hidden = true;
    fmtModalEl.hidden = false;
    renderFmtScope();
    renderFmtBody();
}
function openFloorFmtDialog(index) {
    const f = (state.draft.floors || [])[index];
    if (!f) return;
    ensureFmtModal();
    const base = pickFmt(LC.floorFmtOf(state.draft, f));
    fmtDialog = { kind: 'floor', targetId: f.id, draft: { ...base }, start: { ...base }, tab: 'fill', scope: 'one' };
    $('layout-fmt-title').textContent = `${t('main.layoutFormatoPiso')} ${f.code || ''}`;
    $('layout-fmt-namefield').hidden = true;
    fmtModalEl.hidden = false;
    renderFmtScope();
    renderFmtBody();
}
// La ventana de formato de un pasillo: color, trama y borde como los pisos y las paredes; se puede aplicar a ese pasillo o a todos.
function openTransitFmtDialog(index) {
    const p = (state.draft.transit || [])[index];
    if (!p) return;
    ensureFmtModal();
    const base = pickFmt(p.fmt || window.LayoutMapSvg.defaultFmt(p.type === 'between' ? 'aisle2' : 'aisle'));
    fmtDialog = { kind: 'transit', targetId: p.id, draft: { ...base }, start: { ...base }, tab: 'fill', scope: 'one' };
    $('layout-fmt-title').textContent = `${t('main.layoutFormatoPasillo')} ${p.code || ''}`;
    $('layout-fmt-namefield').hidden = true;
    fmtModalEl.hidden = false;
    renderFmtScope();
    renderFmtBody();
}
// La ventana de formato de una pared: color, trama y borde como los pisos; se puede aplicar a esa pared o a todas.
function openWallFmtDialog(index) {
    const w = (state.draft.obstacles || [])[index];
    if (!w || w.kind !== 'wall') return;
    ensureFmtModal();
    const base = pickFmt(w.fmt || WALL_DEFAULT_FMT);
    fmtDialog = { kind: 'wall', targetId: w.id, draft: { ...base }, start: { ...base }, tab: 'fill', scope: 'one' };
    $('layout-fmt-title').textContent = `${t('main.layoutFormatoPared')} ${w.code || ''}`;
    $('layout-fmt-namefield').hidden = true;
    fmtModalEl.hidden = false;
    renderFmtScope();
    renderFmtBody();
}
// La ventana de formato de una rampa: dos modos. «Difuminar» (por defecto, sin formato propio): la rampa se pinta con un degradado entre los colores de los dos pisos que toca; «Elegir color y trama»: color, rayas y borde propios,
// como los pisos y las zonas.
function openRampFmtDialog(index) {
    const r = (state.draft.ramps || [])[index];
    if (!r) return;
    ensureFmtModal();
    const asFloor = LC.floorsAll(state.draft).find((x) => x.id === r.id);
    const base = pickFmt(r.fmt || (asFloor ? LC.floorFmtOf(state.draft, asFloor) : { fill: '#e6d3f0', pattern: 'solid', pcolor: '#9b6fb0', line: 'thin', bcolor: '#7a5190' }));
    fmtDialog = { kind: 'ramp', targetId: r.id, draft: { ...base }, start: { ...base }, tab: 'fill', scope: 'one', mode: r.fmt ? 'own' : 'gradient' };
    $('layout-fmt-title').textContent = `${t('main.layoutFormatoRampa')} ${r.code || ''}`;
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

// ---- acomodar un espacio arrastrándolo sobre el croquis ------------------------------------------------------------------------------------
// En Editar y en el paso Espacios, el cuadro de un espacio del nivel elegido se arrastra con el dedo o el mouse a donde se quiera DENTRO de su activo (no se sale de él); al acercarse a menos de 5 cm del lado de otro espacio o del activo
// se pega, y su X y su Y se escriben solos en la tabla (también se pueden escribir ahí). Vacío = vuelve a su lugar de siempre (uno junto al otro, según su largo); mover uno no empuja a los demás.
const BAY_SNAP_M = 0.05;
let bayDrag = null;
$('layout-svg').addEventListener('pointerdown', (event) => {
    const el = event.target.closest('[data-bayhit]');
    if (!el || !state.draft || !canEdit('posiciones')) return;
    const [sid, n, c] = el.getAttribute('data-bayhit').split('|');
    const space = state.draft.spaces.find((x) => x.id === sid);
    const rc = space ? LC.levelBayRects(space, Number(n))[Number(c) - 1] : null;
    if (!rc) return;
    bayDrag = { sid, n: Number(n), c: Number(c), px: event.clientX, py: event.clientY, x0: rc.x, y0: rc.y, moved: false };
    event.preventDefault();
});
window.addEventListener('pointermove', (event) => {
    if (!bayDrag || !view || !state.draft) return;
    const space = state.draft.spaces.find((x) => x.id === bayDrag.sid);
    const rects = space ? LC.levelBayRects(space, bayDrag.n) : [];
    const me = rects[bayDrag.c - 1];
    if (!me) { bayDrag = null; return; }
    const box = $('layout-svg').getBoundingClientRect();
    const k = (view.W / zoom.s) / box.width / view.sc;
    let dx = (event.clientX - bayDrag.px) * k;
    let dy = (event.clientY - bayDrag.py) * k;
    // Con el croquis girado, el movimiento que se ve en pantalla se regresa a los ejes del Layout (giro inverso), igual que con las zonas.
    if (view.rot === 1) [dx, dy] = [dy, -dx];
    else if (view.rot === 2) [dx, dy] = [-dx, -dy];
    else if (view.rot === 3) [dx, dy] = [-dy, dx];
    if (!bayDrag.moved && Math.abs(dx) + Math.abs(dy) < 0.03) return;
    bayDrag.moved = true;
    const xs = [0, space.l];
    const ys = [0, space.d];
    rects.forEach((r, i) => { if (i !== bayDrag.c - 1) { xs.push(r.x, r.x + r.l); ys.push(r.y, r.y + r.w); } });
    const snap = (lo, size, list) => {
        let best = null;
        list.forEach((v) => [lo, lo + size].forEach((edge) => { const d = v - edge; if (Math.abs(d) < BAY_SNAP_M && (best === null || Math.abs(d) < Math.abs(best))) best = d; }));
        return best === null ? 0 : best;
    };
    let nx = bayDrag.x0 + dx;
    let ny = bayDrag.y0 + dy;
    nx += snap(nx, me.l, xs);
    ny += snap(ny, me.w, ys);
    nx = Math.min(Math.max(nx, 0), Math.max(space.l - me.l, 0)); // sin salirse del activo
    ny = Math.min(Math.max(ny, 0), Math.max(space.d - me.w, 0));
    if (!space.bays) space.bays = [];
    let bay = space.bays.find((x) => x.n === bayDrag.n && x.c === bayDrag.c);
    if (!bay) { bay = { n: bayDrag.n, c: bayDrag.c }; space.bays.push(bay); }
    // a 2 decimales y sin pasar del borde del activo (redondear hacia arriba lo sacaría unos milímetros)
    bay.x = Math.min(round2(nx), Math.max(Math.floor((space.l - me.l) * 100) / 100, 0));
    bay.y = Math.min(round2(ny), Math.max(Math.floor((space.d - me.w) * 100) / 100, 0));
    syncBayXY(space, bayDrag.n, null);
    computeSpaceIssues();
    applyBayMarks();
    refreshLive();
});
window.addEventListener('pointerup', () => {
    if (!bayDrag) return;
    const moved = bayDrag.moved;
    bayDrag = null;
    if (moved && state.draft) { renderPanel(); refreshLive(); }
});

// ---- acomodar una posición arrastrándola sobre el croquis -----------------------------------------------------------------------------------
// Lo mismo que con los espacios dentro del activo, ahora con las posiciones dentro de su espacio: en Editar y en el paso Posiciones cada posición del nivel elegido se arrastra con el dedo o el mouse a donde se quiera DENTRO de su
// espacio (no se sale de él); se pega a menos de 3 cm de los lados de las demás posiciones y del espacio, y su X y su Y se escriben solos en la tabla. Si se encima con otra queda en rojo y no se deja guardar.
const POS_SNAP_M = 0.03;
let posDrag = null;
$('layout-svg').addEventListener('pointerdown', (event) => {
    const el = event.target.closest('[data-poshit]');
    if (!el || !state.draft || !canEdit('ubicaciones')) return;
    const p = (state.draft.positions || []).find((x) => x.id === el.getAttribute('data-poshit'));
    if (!p) return;
    posDrag = { id: p.id, px: event.clientX, py: event.clientY, x0: p.x, y0: p.y, moved: false };
    event.preventDefault();
});
window.addEventListener('pointermove', (event) => {
    if (!posDrag || !view || !state.draft) return;
    const p = (state.draft.positions || []).find((x) => x.id === posDrag.id);
    const space = p ? state.draft.spaces.find((x) => x.id === p.spaceId) : null;
    if (!p || !space) { posDrag = null; return; }
    const m = LC.bayMeasures(space, p.n, p.c);
    const box = $('layout-svg').getBoundingClientRect();
    const k = (view.W / zoom.s) / box.width / view.sc;
    let dx = (event.clientX - posDrag.px) * k;
    let dy = (event.clientY - posDrag.py) * k;
    // Con el croquis girado, el movimiento que se ve en pantalla se regresa a los ejes del Layout (giro inverso), igual que con las zonas y los espacios.
    if (view.rot === 1) [dx, dy] = [dy, -dx];
    else if (view.rot === 2) [dx, dy] = [-dx, -dy];
    else if (view.rot === 3) [dx, dy] = [-dy, dx];
    if (!posDrag.moved && Math.abs(dx) + Math.abs(dy) < 0.02) return;
    posDrag.moved = true;
    const xs = [0, m.l];
    const ys = [0, m.w];
    posBayItems(p.spaceId, p.n, p.c).forEach((o) => { if (o.id !== p.id) { xs.push(o.x, o.x + o.l); ys.push(o.y, o.y + o.w); } });
    const snap = (lo, size, list) => {
        let best = null;
        list.forEach((v) => [lo, lo + size].forEach((edge) => { const d = v - edge; if (Math.abs(d) < POS_SNAP_M && (best === null || Math.abs(d) < Math.abs(best))) best = d; }));
        return best === null ? 0 : best;
    };
    let nx = posDrag.x0 + dx;
    let ny = posDrag.y0 + dy;
    nx += snap(nx, p.l, xs);
    ny += snap(ny, p.w, ys);
    nx = Math.min(Math.max(nx, 0), Math.max(m.l - p.l, 0)); // sin salirse del espacio
    ny = Math.min(Math.max(ny, 0), Math.max(m.w - p.w, 0));
    p.x = Math.min(round2(nx), Math.max(Math.floor((m.l - p.l) * 100) / 100, 0)); // a 2 decimales y sin pasar del borde
    p.y = Math.min(round2(ny), Math.max(Math.floor((m.w - p.w) * 100) / 100, 0));
    delete p.auto; // ya no es la de fábrica: deja de seguir el tamaño de su espacio
    ['x', 'y'].forEach((key) => { const input = document.querySelector(`#layout-panel [data-pk="${key}"][data-pid="${CSS.escape(p.id)}"]`); if (input && document.activeElement !== input) input.value = String(p[key]); });
    positionsLive(p);
    refreshLive();
});
window.addEventListener('pointerup', () => {
    if (!posDrag) return;
    const moved = posDrag.moved;
    posDrag = null;
    if (moved && state.draft) { renderPanel(); refreshLive(); }
});

// ---- Arrastrar una puerta sobre su pared ---------------------------------------------------------------------------------------------------
// Puertas, conexiones de luz y sensores: cada uno solo se arrastra en su propio paso (Puertas, Luz, Sensores) y con permiso para cambiarlo. Lo que sigue vale para los tres. La puerta sigue la pared (no se sale de ella ni de sus extremos): lo que se mueve el puntero a lo largo de la pared es lo que se mueve la puerta; `dist` (la «Distancia
// desde el inicio de la pared») se escribe sola mientras se arrastra y los avisos del renglón (cabe, altura) se vuelven a calcular. Si la pared no está elegida (puerta de antes) no se arrastra.
let doorDrag = null;
const WALL_ITEM_STEP = { doors: 'puertas', power: 'luz', sensors: 'sensores' };
function canMoveWallItem(list) { return !!state.draft && state.focus === WALL_ITEM_STEP[list] && canEdit(WALL_ITEM_STEP[list]) && !state.find; }
$('layout-svg').addEventListener('pointerdown', (event) => {
    const el = event.target.closest('[data-did], [data-pid], [data-nid]');
    if (!el) return;
    const list = el.getAttribute('data-did') !== null ? 'doors' : (el.getAttribute('data-pid') !== null ? 'power' : 'sensors');
    if (!canMoveWallItem(list)) return;
    const id = el.getAttribute(list === 'doors' ? 'data-did' : (list === 'power' ? 'data-pid' : 'data-nid'));
    const item = (state.draft[list] || []).find((x) => x.id === id);
    const g = item ? wallItemGeom(list, item) : null;
    if (!g || g.legacy || !g.wall) return;
    doorDrag = { list, id: item.id, px: event.clientX, py: event.clientY, start: Number(item.dist) || 0, ux: g.ux, uy: g.uy, room: Math.max(g.wallLength - (list === 'doors' ? Number(item.width) || 0 : 0), 0), moved: false };
    event.preventDefault();
});
window.addEventListener('pointermove', (event) => {
    if (!doorDrag || !view || !state.draft) return;
    const door = (state.draft[doorDrag.list] || []).find((x) => x.id === doorDrag.id);
    if (!door) { doorDrag = null; return; }
    const rect = $('layout-svg').getBoundingClientRect();
    const k = (view.W / zoom.s) / rect.width / view.sc;
    let dx = (event.clientX - doorDrag.px) * k;
    let dy = (event.clientY - doorDrag.py) * k;
    // Con el croquis girado, el movimiento que se ve en pantalla se regresa a los ejes del Layout (giro inverso), igual que con las zonas.
    if (view.rot === 1) [dx, dy] = [dy, -dx];
    else if (view.rot === 2) [dx, dy] = [-dx, -dy];
    else if (view.rot === 3) [dx, dy] = [-dy, dx];
    if (!doorDrag.moved && Math.abs(dx) + Math.abs(dy) < 0.2) return;
    doorDrag.moved = true;
    // lo que avanzó a lo largo de la pared; cada 5 cm, y pegada al extremo si queda a menos de 10 cm
    let dist = doorDrag.start + dx * doorDrag.ux + dy * doorDrag.uy;
    dist = Math.round(dist / 0.05) * 0.05;
    if (dist < 0.1) dist = 0;
    if (dist > doorDrag.room - 0.1) dist = doorDrag.room;
    door.dist = round2(Math.min(Math.max(dist, 0), doorDrag.room));
    const i = state.draft[doorDrag.list].indexOf(door);
    const box = document.querySelector(`[data-l="${doorDrag.list}"][data-i="${i}"][data-k="dist"]`);
    if (box) box.value = door.dist;
    refreshLive();
});
window.addEventListener('pointerup', () => {
    if (!doorDrag) return;
    const moved = doorDrag.moved;
    doorDrag = null;
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
        state.mode = 'view'; // otro sitio abre siempre en «Ver»
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
    const f = activeFind();
    if (f && !state.findDim) {
        const zf = f.kind === 'zone' || f.kind === 'items';
        return { contour: false, walls: zf && fxWant('wall'), columns: zf && fxWant('obstacle'), doors: zf && fxWant('door'), power: zf && fxWant('power'), sensors: zf && fxWant('sensor'), objects: zf && fxWant('object'), transit: zf && fxWant('transit'), safety: zf && fxWant('safety'), ceiling: zf && fxWant('ceiling'), roofs: false, zones: stepOn('zonas') || stepOn('pisos') || stepOn('rampas') || f.kind === 'zone', footprints: stepOn('espacios') || f.kind === 'footprint' || (zf && fxWant('footprint')), assets: (stepOn('activos') || stepOn('posiciones') || stepOn('niveles') || stepOn('ubicaciones') || (zf && fxWant('space'))) };
    }
    const layers = {
        contour: stepOn('contorno'), walls: stepOn('paredes'), columns: stepOn('obstaculos'), doors: stepOn('puertas'), objects: stepOn('objetos'), transit: stepOn('transito'), safety: stepOn('seguridad'), ceiling: stepOn('techos'), roofs: stepOn('techos'), zones: stepOn('zonas') || stepOn('pisos') || stepOn('rampas') || !!(f && f.kind === 'zone'),
        footprints: stepOn('espacios'), power: stepOn('luz'), sensors: stepOn('sensores'), assets: stepOn('activos') || stepOn('posiciones') || stepOn('niveles') || stepOn('ubicaciones'),
    };
    // zonas enfocadas con el resto «tenue»: las capas que «Qué ver» no pidió se apagan (y se ven tenues)
    if (f && f.kind === 'zone') {
        const c = findTypesChosen();
        if (c.length) {
            const map = { wall: 'walls', obstacle: 'columns', door: 'doors', power: 'power', sensor: 'sensors', safety: 'safety', ceiling: 'ceiling', transit: 'transit', object: 'objects', footprint: 'footprints', space: 'assets' };
            Object.keys(map).forEach((ty) => { if (!c.includes(ty)) layers[map[ty]] = false; });
        }
    }
    return layers;
}
// Con un enfoque (o con activos elegidos) y el resto «tenue», las opciones apagadas también se ven tenues en el 3D en lugar de quitarse.
function dim3dLayers() {
    if (!state.findDim || !(activeFind() || pickerFocus())) return [];
    const layers = effective3dLayers();
    return Object.keys(layers).filter((n) => !layers[n]);
}
// Qué se dibuja del activo cuyo nivel (o espacio o posición) se enfocó, según «Lo demás»: Tenue apaga los demás niveles; Oculto (en Ver) deja el ACTIVO ENTERO a la vista (se quitan los demás activos) y solo marca el nivel;
// Enfoque dibuja SOLO el nivel (en un gabinete, solo su cajón: lone). En Editar, ocultar siempre es Enfoque (ver setFindMode).
const fxLevelMode = () => (state.findDim ? { mode: 'dim' } : (state.findMode === 'oculto' && state.mode !== 'edit' ? { mode: 'keep' } : { mode: 'hide', lone: true }));
// El nivel enfocado de un activo (renglón de Niveles o Posiciones): los demás niveles de ese activo se apagan (Tenue) o se quitan (Enfoque); con Oculto el activo se ve entero.
function fxFocusLevel() {
    // «Localizador»: con Enfoque u Oculto solo se ve el nivel, la posición o el localizador elegido; con Tenue, los demás niveles se apagan
    const h = state.hl;
    if (h && h.loc && hlOnStep(h)) {
        const picked = new Set(state.pick.filter((x) => x.type === 'space').map((x) => x.id));
        // un espacio marcado (sin posición) se dibuja solo, sin los demás espacios de su nivel (only)
        const out = highlightedList().filter((e) => e.n && picked.has(e.id)).map((e) => ({ id: e.id, n: e.n, c: e.c, f: e.f, p: e.p, only: !!(e.c && !e.p), solo: !!e.p, ...fxLevelMode() }));
        if (out.length) return out;
    }
    const v = virtualFind();
    if (v && v.n) return [{ id: v.ids[0], n: v.n, c: v.c, p: v.p, solo: !!v.p, ...fxLevelMode() }];
    // con un filtro de la franja (Elegir, Localizador, Zona o la búsqueda) el renglón elegido de Niveles, Espacios o Posiciones también enfoca su nivel
    const rl = rowLevelFocus();
    return rl ? [{ id: rl.id, n: rl.n, c: rl.c, p: rl.p, solo: !!rl.p, ...fxLevelMode() }] : null;
}
// Con un filtro de la franja puesto (Elegir, Localizador, Zona o la búsqueda) virtualFind no aplica, pero el renglón que se elige en Niveles, Espacios o Posiciones sigue enfocando SU nivel en el 3D: solo se ve ese nivel con sus
// espacios (o el espacio con sus posiciones), no todos los niveles del activo. Sin filtro lo hace virtualFind.
function rowLevelFocus() {
    if (!state.find) return null;
    const c = fxCandidate();
    return c && c.n ? c : null;
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
            scene3d = window.LayoutScene3D.create($('layout-3d-stage'), { labels: scene3dLabels, modelPhotoUrl: (id, face, ver) => window.AssetLooks.photoUrl(id, face, ver), itemPickTypes: () => (state.mode === 'edit' ? STEP_PICK_3D[state.focus] || [] : []), onSelect: (sel) => { show3dInfo(sel); selectFrom3d(sel); }, onWalkFrame: (p) => onWalkFrame(p), onWalkPick: (sel) => onWalkPick(sel), onWalkExit: () => walkExit() });
            picker3d = window.LayoutAssetPicker.create($('layout-3d-picker'), {
                texts: { title: t('main.layout3dActivosTitulo'), count: t('main.layout3dActivosConteo'), all: t('main.layout3dTodos'), none: t('main.layout3dNinguno'), close: t('main.layout3dCerrar'), search: t('main.layout3dActivosBuscar'), noResults: t('main.layout3dSinResultados'), noZone: t('main.layoutSinZona') },
                typeLabel: (type) => typeLabel('space', type),
                onChange: () => { scheduleScene3d(); updateViewBtns(); },
                onToggle: () => updateViewBtns(),
            });
            return scene3d;
        })().catch((err) => { scene3dLoading = null; throw err; });
    }
    return scene3dLoading;
}
function show3dInfo(sel) {
    const box = $('layout-3d-info');
    if (!sel || !state.draft || sel.kind === 'side' || sel.kind === 'corner' || sel.kind === 'item') { box.hidden = true; return; } // una pared, puerta, piso… elegido: su renglón y su cuadro naranja ya lo dicen
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
// Las puertas cuyo espacio de apertura choca con algo (y con lo que choca otra puerta): se pintan en rojo en el 3D.
function doorClashIds() {
    const ids = new Set();
    LC.doorOpeningClashes(state.draft).forEach((v) => { ids.add(v.id); if (v.vars && v.vars.otherId) ids.add(v.vars.otherId); });
    return [...ids];
}
// Lo elegido con el resto «tenue» lleva en el 3D un contorno punteado naranja que gira (el mismo del croquis) para identificarlo rápido: huellas, activos y zonas. Con Oculto o Enfoque lo demás ya no se ve.
function find3dMarks() {
    const f = activeFind();
    if (!f || !state.draft || !state.findDim) return [];
    if (f.kind === 'zone') return zoneFocusIds(f).map((id) => ({ kind: 'zone', id }));
    if (f.kind === 'spaces') return (f.ids || []).map((id) => ({ kind: 'space', id }));
    if (f.kind === 'footprint') return [{ kind: 'footprint', id: f.id }];
    if (f.kind === 'items') return (f.items || []).filter((it) => it.type === 'footprint' || it.type === 'space' || it.type === 'zone' || it.type === 'object').map((it) => ({ kind: it.type, id: it.id }));
    return [];
}
// ---- Recorrer: caminar por dentro de la nave (como el monito de Maps) ----------------------------------------------------------------------------------
// «Recorrer» pone la vista de planta con el monito: se arrastra a un lugar de la nave (o se pulsa «Entrar») y se camina a la altura de los ojos de una persona (1.70 m, o de un operador de montacargas, 2.40 m).
// Se ve y choca solo con lo que está encendido en «Qué ver» (el 3D ya sigue esas capas). El minimapa dice dónde se está y, tocándolo, se pasa a otro lugar; tocar algo abre su ficha. Salir (o Esc) regresa a la vista general.
const walkUi = { phase: 'off', eye: 1.7, x: null, y: null, mini: null, posText: '' };
function walkRefreshUi() {
    const place = walkUi.phase === 'place';
    const on = walkUi.phase === 'walk';
    $('layout-walk').hidden = walkUi.phase === 'off';
    $('layout-zoom-float').hidden = walkUi.phase !== 'off'; // el zoom no se usa al recorrer (ni al colocar al monito: la planta ya cabe)
    $('layout-walk-peg').hidden = !place; // el monito y «Entrar» están arriba a la derecha, junto a «Salir»
    $('layout-walk-enter').hidden = !place;
    $('layout-walk-tl').hidden = !on;
    $('layout-walk-cross').hidden = !on;
    $('layout-walk-mini-box').hidden = !on;
    $('layout-walk-pad').hidden = !on;
    $('layout-walk-hint').hidden = walkUi.phase === 'off';
    $('layout-walk-hint').textContent = on ? t('main.layoutWalkHint') : (place ? t('main.layoutWalkPonerTxt') : '');
    $('layout-walk-peg').title = t('main.layoutWalkPonerTxt');
    $('layout-walk-card').hidden = true;
    const btn = $('layout-walk-btn');
    btn.setAttribute('aria-pressed', String(walkUi.phase !== 'off'));
    btn.title = btn.textContent;
}
function walkSetView(name) {
    if (!scene3d) return;
    scene3d.setView(name);
    document.querySelectorAll('.layout-3d-view').forEach((b) => b.classList.toggle('on', b.getAttribute('data-view') === name));
}
// el centro del contorno (donde se entra con «Entrar» la primera vez) y hacia dónde mirar para quedar de frente a él
function walkCenter() {
    const v = (state.draft && state.draft.vertices) || [];
    if (!v.length) return { x: 0, y: 0 };
    return { x: v.reduce((a, p) => a + p[0], 0) / v.length, y: v.reduce((a, p) => a + p[1], 0) / v.length };
}
function walkHeadingFrom(x, y) {
    const c = walkCenter();
    const dx = c.x - x; const dy = c.y - y;
    return Math.hypot(dx, dy) < 1 ? 0 : Math.atan2(-dx, -dy);
}
function walkBegin() {
    if (!state.view3d || !scene3d || !state.draft || !can3d()) return;
    if (walkUi.phase !== 'off') { walkExit(); return; } // pulsarlo otra vez sale
    walkUi.phase = 'place';
    walkSetView('planta');
    walkRefreshUi();
}
function walkEnter(x, y, rot) {
    if (!scene3d || !state.draft) return;
    if (!scene3d.walkStart({ x, y, rot, eye: walkUi.eye })) return;
    walkUi.phase = 'walk';
    walkRefreshUi();
}
function walkExit() {
    if (walkUi.phase === 'off') return;
    if (scene3d) scene3d.walkStop();
    walkUi.phase = 'off';
    walkRefreshUi();
    walkSetView('general');
}
// el minimapa: el contorno, las paredes, las columnas, los activos y las puertas (según lo encendido) con el monito y su abanico; sale de lo mismo que el 3D
function drawWalkMini(p) {
    const cv = $('layout-walk-mini');
    const d = state.draft;
    if (!cv || !d || !Array.isArray(d.vertices) || d.vertices.length < 3) return;
    const g = cv.getContext('2d');
    const W = cv.width; const H = cv.height; const M = 10;
    const xs = d.vertices.map((v) => v[0]); const ys = d.vertices.map((v) => v[1]);
    const x0 = Math.min(...xs); const y0 = Math.min(...ys);
    const sc = Math.min((W - 2 * M) / Math.max(Math.max(...xs) - x0, 1), (H - 2 * M) / Math.max(Math.max(...ys) - y0, 1));
    const ox = (W - sc * (Math.max(...xs) - x0)) / 2; const oy = (H - sc * (Math.max(...ys) - y0)) / 2;
    walkUi.mini = { x0, y0, sc, ox, oy, W, H };
    const X = (x) => ox + (x - x0) * sc; const Y = (y) => oy + (y - y0) * sc;
    const css = getComputedStyle(document.documentElement);
    const ink = (css.getPropertyValue('--color-text-primary') || '#2b1d30').trim() || '#2b1d30';
    const accent = (css.getPropertyValue('--color-accent') || '#c04fc9').trim() || '#c04fc9';
    const lay = effective3dLayers();
    g.clearRect(0, 0, W, H);
    const poly = (pts, fill, stroke, lw) => { g.beginPath(); pts.forEach((q, i) => { if (i) g.lineTo(X(q[0]), Y(q[1])); else g.moveTo(X(q[0]), Y(q[1])); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 2; g.stroke(); } };
    poly(d.vertices, 'rgba(160,110,175,.16)', ink, 3);
    LC.obstacleShapes(d).forEach(({ o, g: sh }) => { if (o.kind === 'wall' ? lay.walls : (lay.columns && o.kind !== 'step')) poly(sh.pts, o.kind === 'wall' ? ink : '#7b8196'); });
    if (lay.assets) (d.spaces || []).filter((s) => s.active !== false).forEach((s) => poly([[s.x, s.y], [s.x + s.l, s.y], [s.x + s.l, s.y + s.d], [s.x, s.y + s.d]], '#d99a43'));
    if (lay.doors) (d.doors || []).forEach((dr) => { const dg = LC.doorGeometry(d, dr); if (!dg) return; g.beginPath(); g.moveTo(X(dg.a.x), Y(dg.a.y)); g.lineTo(X(dg.b.x), Y(dg.b.y)); g.strokeStyle = '#1e7e34'; g.lineWidth = 5; g.stroke(); });
    const ax = -Math.sin(p.rot); const ay = -Math.cos(p.rot); const ang = Math.atan2(ay, ax); const px = X(p.x); const py = Y(p.y);
    g.fillStyle = 'rgba(207,95,211,.45)'; g.beginPath(); g.moveTo(px, py); g.arc(px, py, 46, ang - 0.65, ang + 0.65); g.closePath(); g.fill();
    g.fillStyle = accent; g.strokeStyle = ink; g.lineWidth = 2.5; g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.fill(); g.stroke();
}
function onWalkFrame(p) {
    walkUi.x = p.x; walkUi.y = p.y;
    // sobre un piso a desnivel o una rampa la ficha de la posición dice a qué nivel se está
    const lvl = Math.round((Number(p.level) || 0) * 100) / 100;
    const text = t('main.layoutWalkPos', { x: fmt(p.x, 1), y: fmt(p.y, 1), eye: fmt(p.eye, 2) }) + (Math.abs(lvl) >= 0.01 ? ` · ${t('main.layoutWalkPiso', { n: `${lvl > 0 ? '+' : ''}${fmt(lvl)}` })}` : '');
    if (text !== walkUi.posText) { walkUi.posText = text; $('layout-walk-pos').textContent = text; }
    drawWalkMini(p);
}
// la ficha de lo que se toca: su nombre o tipo, su código y lo que se sabe de él (zona, medidas, estado)
function walkCardInfo(sel) {
    const d = state.draft;
    if (!d || !sel) return null;
    const zoneName = (id) => (d.zones.find((z) => z.id === id) || {}).name || '';
    const dims = (...v) => { const l = v.filter((n) => Number(n) > 0); return l.length ? `${l.map((n) => fmt(n)).join(' × ')} m` : ''; };
    const find = (list) => (list || []).find((x) => x.id === sel.id);
    if (sel.kind === 'space') {
        const s = sel.space;
        return { title: typeLabel('space', s.type), code: s.code, lines: [zoneName(s.zoneId), dims(s.l, s.d, s.h), (s.levels || 1) === 1 ? t('main.layout3dNivel1') : t('main.layout3dNivelesN', { n: s.levels })] };
    }
    if (sel.kind !== 'item') return null;
    if (sel.type === 'door') { const x = find(d.doors); return x && { title: x.name || typeLabel('door', x.type), code: x.code, lines: [typeLabel('door', x.type), dims(x.width, x.height), typeLabel('doorOpen', LC.doorOpenOf(x))] }; }
    if (sel.type === 'obstacle') { const x = find(d.obstacles); return x && { title: x.name || typeLabel('obstacle', x.kind), code: x.code, lines: [typeLabel('obstacle', x.kind), dims(x.l, x.w, x.h)] }; }
    if (sel.type === 'safety') {
        const x = find(d.safety); if (!x) return null;
        const st = LC.safetyStatus(x, todayIso(), d.safetyWarnDays, sfLast(x));
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
function onWalkPick(sel) {
    const box = $('layout-walk-card');
    const info = walkCardInfo(sel);
    if (!info) { box.hidden = true; return; }
    const lines = info.lines.filter(Boolean);
    box.innerHTML = `<button type="button" class="wk-x" aria-label="${esc(t('main.layoutWalkCerrarFicha'))}">×</button><b>${esc(info.title || '')}</b>${info.code ? `<span class="wk-code">${esc(info.code)}</span>` : ''}${lines.length ? `<p>${esc(lines.join(' · '))}</p>` : ''}`;
    box.hidden = false;
    box.querySelector('.wk-x').addEventListener('click', () => { box.hidden = true; });
}
$('layout-walk-btn').addEventListener('click', walkBegin);
$('layout-walk-exit').addEventListener('click', walkExit);
$('layout-walk-enter').addEventListener('click', () => {
    const spot = walkUi.x !== null ? { x: walkUi.x, y: walkUi.y } : walkCenter();
    walkEnter(spot.x, spot.y, walkHeadingFrom(spot.x, spot.y));
});
$('layout-walk-eye').addEventListener('change', (event) => { walkUi.eye = parseFloat(event.target.value) || 1.7; if (scene3d) scene3d.walkSetEye(walkUi.eye); });
document.querySelectorAll('#layout-walk-pad [data-wk]').forEach((b) => {
    const k = b.getAttribute('data-wk');
    b.addEventListener('pointerdown', (event) => { event.preventDefault(); if (scene3d) scene3d.walkKeys(k, true); try { b.setPointerCapture(event.pointerId); } catch (err) { /* sin captura: el botón se suelta igual al levantar */ } });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => b.addEventListener(ev, () => { if (scene3d) scene3d.walkKeys(k, false); }));
});
$('layout-walk-mini').addEventListener('pointerdown', (event) => {
    const m = walkUi.mini;
    if (!m || !scene3d) return;
    const r = $('layout-walk-mini').getBoundingClientRect();
    scene3d.walkTo(m.x0 + (((event.clientX - r.left) / r.width) * m.W - m.ox) / m.sc, m.y0 + (((event.clientY - r.top) / r.height) * m.H - m.oy) / m.sc);
});
// arrastrar al monito: se suelta sobre la nave (en la vista de planta) y se entra ahí, de frente al centro
$('layout-walk-peg').addEventListener('pointerdown', (event) => {
    if (walkUi.phase !== 'place' || !scene3d) return;
    event.preventDefault();
    const ghost = document.createElement('div');
    ghost.className = 'layout-walk-ghost';
    ghost.innerHTML = $('layout-walk-peg').innerHTML;
    document.body.appendChild(ghost);
    const move = (e) => { ghost.style.left = `${e.clientX}px`; ghost.style.top = `${e.clientY}px`; };
    const up = (e) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        ghost.remove();
        const r = scene3d.canvas.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
        const p = scene3d.walkPoint(e.clientX, e.clientY);
        if (p) walkEnter(p.x, p.y, walkHeadingFrom(p.x, p.y));
    };
    move(event);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
});
function refreshScene3d() {
    if (!(scene3d && state.view3d && state.draft)) return;
    // el selector se actualiza con el borrador (lo que se ocultó y ya no existe se olvida) y la escena se arma una sola vez
    const fv3 = findView3d(); // con un enfoque, el 3D solo trae lo enfocado (o todo, con lo enfocado resaltado)
    const shown = fv3.shown;
    if (picker3d) {
        picker3d.setData({ spaces: shown.spaces.filter((s) => s.active !== false), zones: shown.zones.filter((z) => z.active !== false).map((z) => ({ id: z.id, name: z.name })) });
        picker3d.setFocus(fv3.focus ? fv3.focus.spaces : null);
        scene3d.setHiddenAssets(picker3d.getHidden(), false, !!state.findDim);
    }
    scene3d.update({ ...shown, safetyLast: state.safetyLast || {} }, { positions: stepOn('ubicaciones'), pieces: piecesVisible() ? state.pieces : [], bayFmt: stepOn('posiciones') ? (state.draft.bayFmt || {}) : null, fronts: Object.fromEntries((state.draft.spaces || []).map((s) => [s.id, (LC.activoFront(state.draft, s) || {}).side])), labels: scene3dLabels, layers: effective3dLayers(), openings: !!state.showOpening, levels: !!state.showLevels, roof: !!state.showRoof && !!(state.perms && state.perms.canToggleRoof), marks: find3dMarks(), floorsShow: stepOn('pisos') || stepOn('zonas') || !!(activeFind() && activeFind().kind === 'zone'), rampsShow: stepOn('rampas') || stepOn('zonas') || !!(activeFind() && activeFind().kind === 'zone'), neutralZones: (stepOn('pisos') || stepOn('rampas')) && !stepOn('zonas') && !(state.find && state.find.kind === 'zone'), clashDoors: state.showOpening ? doorClashIds() : [], focus: fv3.focus, dimLayers: dim3dLayers(), focusLevel: fxFocusLevel(), contourPick: state.focus === 'contorno' ? state.contornoMode : null });
    if (find3dReframe) {
        find3dReframe = false;
        scene3d.setView('general');
        document.querySelectorAll('.layout-3d-view').forEach((b) => b.classList.toggle('on', b.getAttribute('data-view') === 'general'));
    }
    applyHighlight3d();
    if (loc3dFocus) { loc3dFocus = false; if (scene3d.focusOn) scene3d.focusOn(); }
    updateViewBtns();
}
// Lo que se elige en una tabla también se marca en el 3D (contorno naranja, doble al tocar la figura); solo cuenta en el paso que se está editando, igual que en el croquis.
function applyHighlight3d() {
    if (!scene3d || !scene3d.highlight) return; // el 3D viejo que quedó en la memoria del navegador aún no la trae
    const h = state.hl;
    scene3d.highlight(hlOnStep(h) && state.draft ? highlightedList().map((e) => ({ kind: e.kind, id: e.id, strong: !!h.strong, n: e.n, c: e.c, f: e.f, p: e.p })) : null);
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
    $('layout-zoom-float').classList.toggle('is-3d', state.view3d);
    $('layout-mode').hidden = !allowed; // sin 3D no hay nada que elegir: el interruptor 2D | 3D no sale
    updateTextsMenu();
    [['layout-3d-zoom-in', 'main.layout3dAcercar'], ['layout-3d-zoom-out', 'main.layout3dAlejar']].forEach(([id, key]) => { $(id).setAttribute('aria-label', t(key)); $(id).title = t(key); });
    // (El botón «Elegir activos» del 3D se quitó: «Elegir» de la franja de arriba hace lo mismo, en 2D y en 3D.)
    [['layout-texts-btn', 'main.layoutTextos']].forEach(([id, key]) => { $(id).setAttribute('aria-label', t(key)); $(id).title = t(key); });
    if (picker3d && (!state.view3d || effective3dLayers().assets === false) && picker3d.isOpen()) picker3d.hide();
    const labelsBtn = $('layout-3d-labels');
    labelsBtn.setAttribute('aria-pressed', String(scene3dLabels));
    labelsBtn.classList.toggle('off', !scene3dLabels);
    labelsBtn.setAttribute('aria-label', t(scene3dLabels ? 'main.layout3dRotulosOcultar' : 'main.layout3dRotulosVer'));
    labelsBtn.title = labelsBtn.getAttribute('aria-label');
}
async function setView3d(on) {
    if (on && !can3d()) return;
    if (!on) walkExit(); // al volver al croquis se sale del recorrido
    state.view3d = on;
    updateViewBtns();
    if (!on) {
        if (state.hl && state.draft) { const zoomNow = pendingZoom; pendingZoom = false; applyHighlight(zoomNow ? 'zoom' : false); }
        return;
    }
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
    const ids = state.view3d ? ['layout-3d-labels', 'layout-pieces-btn'] : ['layout-names-btn', 'layout-area-btn', 'layout-measures-btn', 'layout-pieces-btn', ...Object.values(TEXT_GROUPS).map((o) => o.id)];
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
    scaleHlTags();
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
    } else if (!drag && !doorDrag && zoom.s > 1.001) {
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
// Guardar: devuelve true si se guardó (Guardar y ver espera a saberlo) y false si algo lo impidió (ya avisó por qué).
async function saveLayout() {
    const button = $('layout-save');
    const openShape = firstOpenShape();
    if (openShape) {
        if (openShape.kind === 'contorno') { showStep('contorno'); Dashboard.showToast(t('main.layoutNoCierraContorno'), 'warning'); } else { showStep('zonas'); state.zoneOpen = openShape.zone.id; Dashboard.showToast(t('main.layoutNoCierraZona').replace('{name}', openShape.zone.name), 'warning'); }
        renderPanel();
        return false;
    }
    const loose = state.draft.spaces.findIndex((s) => !s.footprintId);
    if (loose >= 0) {
        showStep('activos');
        renderPanel();
        Dashboard.showToast(t('main.layoutActivoSinHuella').replace('{n}', String(loose + 1)), 'warning');
        const pick = document.querySelector(`[data-l="spaces"][data-i="${loose}"][data-k="footprintId"]`);
        if (pick) { pick.scrollIntoView({ block: 'center' }); pick.focus(); }
        return false;
    }
    const fresh = LC.newFootprintViolations(state.draft, state.saved);
    if (fresh.length) {
        const v = fresh[0];
        showStep('espacios');
        renderPanel();
        Dashboard.showToast(t(`main.layoutVio_${v.kind}${v.kind === 'tall' ? (v.by === 'zone' ? 'Zone' : (v.level ? 'Level' : '')) : ''}`, { code: v.code, zone: v.zoneName || '', h: v.h, maxH: v.maxH, level: v.level, top: v.top }), 'warning');
        const at = state.draft.footprints.findIndex((f) => f.id === v.id);
        const box = document.querySelector(`[data-l="footprints"][data-i="${at}"][data-k="${v.kind === 'tall' ? 'h' : 'x'}"]`);
        if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
        return false;
    }
    const freshSpaces = LC.newSpaceViolations(state.draft, state.saved);
    if (freshSpaces.length) {
        const v = freshSpaces[0];
        // los niveles que suben más que el activo se arreglan en Niveles (si la cuenta lo ve; si no, en Activos con el alto del activo)
        const bayKind = v.kind === 'bayl' || v.kind === 'bayw' || v.kind === 'bayh' || v.kind === 'baysum' || v.kind === 'bayout' || v.kind === 'bayoverlap' || v.kind === 'facesBay';
        const stepName = (v.kind === 'levels' || v.kind === 'facesLevel') && stepVisible('niveles') ? 'niveles' : (bayKind && stepVisible('posiciones') ? 'posiciones' : 'activos');
        showStep(stepName);
        renderPanel();
        Dashboard.showToast(vioActText(v), 'warning');
        const at = state.draft.spaces.findIndex((s) => s.id === v.id);
        const box = v.kind === 'facesBay' && stepName === 'posiciones'
            ? (document.querySelector(`button.layout-face.bad[data-fk="bay"][data-i="${at}"][data-n="${v.vars.n}"][data-c="${v.vars.c}"]`) || document.querySelector(`button.layout-face[data-fk="bay"][data-i="${at}"][data-n="${v.vars.n}"][data-c="${v.vars.c}"]`))
            : v.kind === 'facesLevel' && stepName === 'niveles'
            ? (document.querySelector(`button.layout-face.bad[data-fk="lvl"][data-i="${at}"][data-n="${v.vars.n}"]`) || document.querySelector(`button.layout-face[data-fk="lvl"][data-i="${at}"][data-n="${v.vars.n}"]`))
            : stepName === 'posiciones'
            ? document.querySelector(v.kind === 'baysum' ? `[data-l="bay"][data-i="${at}"][data-n="${v.vars.n}"][data-k="l"]` : `[data-l="bay"][data-i="${at}"][data-n="${v.vars.n}"][data-c="${v.vars.c}"][data-k="${{ bayl: 'l', bayw: 'w', bayh: 'h', bayout: 'x', bayoverlap: 'x' }[v.kind]}"]`)
            : stepName === 'niveles'
            ? (document.querySelector(`[data-l="lvl"][data-i="${at}"][data-k="h"].layout-missing`) || document.querySelector(`[data-l="lvl"][data-i="${at}"][data-k="h"]`))
            : document.querySelector(`[data-l="spaces"][data-i="${at}"][data-k="${v.kind === 'tall' ? 'oh' : 'ol'}"]`);
        if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
        return false;
    }
    // Posiciones: lo nuevo o lo que cambió y no cumple (se sale de su espacio, pasa de su alto, se encima con otra o usa una cara que su espacio no tiene) no se guarda.
    const freshPositions = LC.newPositionViolations(state.draft, state.saved);
    if (freshPositions.length) {
        const v = freshPositions[0];
        if (stepVisible('ubicaciones')) {
            showStep('ubicaciones');
            const bp = (state.draft.positions || []).find((p) => p.id === v.id);
            state.hl = { kind: 'bay', id: v.spaceId, n: v.n, c: v.c, p: bp ? bp.num : undefined, step: 'ubicaciones' };
            renderPanel();
            markSelectedRow();
            const bRow = highlightedRow();
            if (bRow) bRow.scrollIntoView({ block: 'center' });
            applyHighlight(true);
        }
        Dashboard.showToast(posVioText(v), 'warning');
        return false;
    }
    // Tránsito: lo nuevo o lo que cambió y no cumple (fuera de zona, no cabe en su zona, lo que transita no cabe, o algo adentro del pasillo) no se guarda.
    const freshTransit = LC.newTransitViolations(state.draft, state.saved);
    if (freshTransit.length) {
        showStep('transito');
        renderPanel();
        refreshLive();
        Dashboard.showToast(`${t('main.layoutVioTrAviso')} ${transitIssueText(freshTransit[0])}`, 'warning');
        return false;
    }
    // Obstáculos con altura propia: no pueden pasar del techo; lo nuevo o lo que cambió y no cumple no se guarda.
    const freshObstacles = LC.newObstacleViolations(state.draft, state.saved);
    if (freshObstacles.length) {
        const v = freshObstacles[0];
        showStep('obstaculos');
        renderPanel();
        refreshLive();
        Dashboard.showToast(`${t('main.layoutVioTrAviso')} ${t(`main.layoutVioObs_${v.kind}`, v.vars)}`, 'warning');
        const at = state.draft.obstacles.findIndex((o) => o.id === v.id);
        const box = document.querySelector(`[data-l="obstacles"][data-i="${at}"][data-k="h"]`);
        if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
        return false;
    }
    // Columnas y paredes libres: nada sale del contorno de la nave; lo nuevo o lo que cambió y no cumple no se guarda: se lleva a la persona a esa fila.
    const freshInside = LC.newObstacleInsideViolations(state.draft, state.saved);
    if (freshInside.length) {
        const v = freshInside[0];
        showStep(v.section);
        renderPanel();
        refreshLive();
        Dashboard.showToast(`${t('main.layoutVioTrAviso')} ${t({ wall: 'main.layoutVioParedFueraToast', column: 'main.layoutVioColumnaFueraToast', step: 'main.layoutVioDesnivelFueraToast' }[v.what] || 'main.layoutVioOtroFueraToast', { name: v.name })}`, 'warning');
        const at = state.draft.obstacles.findIndex((o) => o.id === v.id);
        const box = document.querySelector(`[data-l="obstacles"][data-i="${at}"][data-k="x"]`);
        if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
        return false;
    }
    // Objetos: nada sale del contorno de la nave; lo nuevo o lo que cambió y no cumple no se guarda: se lleva a la persona a esa fila.
    const freshObjects = LC.newObjectInsideViolations(state.draft, state.saved);
    if (freshObjects.length) {
        const v = freshObjects[0];
        showStep('objetos');
        renderPanel();
        refreshLive();
        Dashboard.showToast(`${t('main.layoutVioTrAviso')} ${t('main.layoutVioObjetoFueraToast', { name: v.name })}`, 'warning');
        const at = (state.draft.objects || []).findIndex((o) => o.id === v.id);
        const box = document.querySelector(`[data-l="objects"][data-i="${at}"][data-k="x"]`);
        if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
        return false;
    }
    // Pisos y rampas: nada sale del contorno de la nave; lo nuevo o lo que cambió y no cumple no se guarda: se marca en rojo y se lleva a la persona a esa fila.
    const freshFloors = LC.newFloorViolations(state.draft, state.saved);
    if (freshFloors.length) {
        const v = freshFloors[0];
        showStep(v.section);
        renderPanel();
        refreshLive();
        Dashboard.showToast(`${t('main.layoutVioTrAviso')} ${t(v.list === 'ramps' ? 'main.layoutVioRampaFueraToast' : 'main.layoutVioPisoFueraToast', { code: v.code, name: v.name })}`, 'warning');
        const at = (state.draft[v.list] || []).findIndex((f) => f.id === v.id);
        const box = document.querySelector(`[data-l="${v.list}"][data-i="${at}"][data-k="x"]`);
        if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
        return false;
    }
    // Zonas: nada sale del contorno de la nave; lo nuevo o lo que cambió y no cumple no se guarda: se lleva a la persona a esa zona.
    const freshZones = LC.newZoneViolations(state.draft, state.saved);
    if (freshZones.length) {
        const v = freshZones[0];
        showStep('zonas');
        renderPanel();
        refreshLive();
        Dashboard.showToast(`${t('main.layoutVioTrAviso')} ${t('main.layoutVioZonaFueraToast', { code: v.code, name: v.name })}`, 'warning');
        const at = (state.draft.zones || []).findIndex((z) => z.id === v.id);
        const box = document.querySelector(`[data-l="zones"][data-i="${at}"][data-k="x"]`);
        if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
        return false;
    }
    // Zonas que no se enciman: lo nuevo o lo que cambió y no cumple no se guarda: se lleva a la persona a la primera de las dos.
    const freshOverlap = LC.newZoneOverlapViolations(state.draft, state.saved);
    if (freshOverlap.length) {
        const v = freshOverlap[0];
        showStep('zonas');
        renderPanel();
        refreshLive();
        Dashboard.showToast(`${t('main.layoutVioTrAviso')} ${t('main.layoutVioZonasEncimadasToast', { a: v.a, b: v.b, area: String(v.area) })}`, 'warning');
        const at = (state.draft.zones || []).findIndex((z) => z.id === v.id);
        const box = document.querySelector(`[data-l="zones"][data-i="${at}"][data-k="x"]`);
        if (box) { box.scrollIntoView({ block: 'center' }); box.focus(); }
        return false;
    }
    // Seguridad: cada elemento (y los dos extremos de la ruta) va dentro del contorno de la nave; lo nuevo o lo que cambió y no cumple no se guarda.
    const freshSafety = LC.newSafetyViolations(state.draft, state.saved);
    if (freshSafety.length) {
        showStep('seguridad');
        renderPanel();
        refreshLive();
        Dashboard.showToast(`${t('main.layoutVioTrAviso')} ${safetyIssueText(freshSafety[0])}`, 'warning');
        return false;
    }
    // Techos: lo que cuelga del techo va dentro del contorno y no pasa del techo de su punto; lo nuevo o lo que cambió y no cumple no se guarda.
    const freshCeiling = LC.newCeilingViolations(state.draft, state.saved);
    if (freshCeiling.length) {
        showStep('techos');
        renderPanel();
        refreshLive();
        Dashboard.showToast(`${t('main.layoutVioTrAviso')} ${ceilingIssueText(freshCeiling[0])}`, 'warning');
        return false;
    }
    // Techos (cubiertas): cada techo cubre algo, un área va dentro del contorno y la parte alta no es más baja que la baja; lo nuevo o lo que cambió y no cumple no se guarda.
    const freshRoofs = LC.newRoofViolations(state.draft, state.saved);
    if (freshRoofs.length) {
        showStep('techos');
        renderPanel();
        refreshLive();
        Dashboard.showToast(`${t('main.layoutVioTrAviso')} ${roofIssueText(freshRoofs[0])}`, 'warning');
        return false;
    }
    const clashed = LC.newColorClashes(state.draft, state.saved);
    if (clashed.length) {
        const c = clashed[0];
        showStep(c.kind === 'asset' ? 'activos' : 'espacios');
        renderPanel();
        Dashboard.showToast(t(`main.layoutColorChoque_${c.kind}`, { code: c.code, parent: c.parentName }), 'warning');
        return false;
    }
    // Aviso antes de guardar: las huellas que ya existían y cambian de zona (y por eso de Localizador). Nada cambia sin que la persona lo vea y lo acepte.
    const moved = LC.footprintZoneChanges(state.draft, state.saved);
    if (moved.length) {
        const nobody = t('main.layoutZonaCambiaSinZona');
        const items = moved.map((m) => t('main.layoutZonaCambiaItem', { from: m.from || '—', to: m.to || '—', fromZone: m.fromZone || nobody, toZone: m.toZone || nobody }) + (m.assets ? t('main.layoutZonaCambiaActivos', { n: String(m.assets) }) : ''));
        const keep = await Dashboard.confirm(t(moved.length === 1 ? 'main.layoutZonaCambiaUna' : 'main.layoutZonaCambiaVarias', { n: String(moved.length) }), { items, accept: t('main.layoutZonaCambiaGuardar'), cancel: t('main.layoutZonaCambiaRegresar') });
        if (!keep) return false;
    }
    button.disabled = true;
    try {
        const body = { layout: state.draft, baseVersion: state.version, costCenterId: state.centerId };
        if (state.planNew) body.planImage = state.planImage;
        if (state.renumber) body.renumberCodes = true;
        const res = await fetch('/api/business/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        const payload = await res.json().catch(() => ({}));
        if (res.status === 409 && payload.code === 'LOCATOR_WITH_CODE') {
            // Un localizador con código no se elimina: se dice cuál y qué código tiene, y el borrador se conserva para que la persona lo corrija.
            const gone = Array.isArray(payload.locators) ? payload.locators : [];
            const list = gone.slice(0, 3).map((x) => t('main.locConCodigoItem', { loc: x.locator, sku: x.sku })).join(', ') + (gone.length > 3 ? t('main.locConCodigoMas', { n: String(gone.length - 3) }) : '');
            Dashboard.showToast(t(gone.length === 1 ? 'main.locConCodigoUno' : 'main.locConCodigoVarios', { list }), 'warning');
            return false;
        }
        if (res.status === 409) { Dashboard.showToast(t('main.layoutConflicto'), 'warning'); await loadLayout(); return false; }
        if (res.status === 403) { Dashboard.showToast(t('main.layoutSinPermiso'), 'warning'); return false; }
        if (res.status === 400) { Dashboard.showToast(`${t('main.layoutDatosInvalidos')} ${(payload.errors && payload.errors[0]) || ''}`.trim(), 'warning'); return false; }
        if (!res.ok) throw new Error('layout save failed');
        const keepSteps = state.steps;
        const keepFocus = state.focus;
        const keepStack = state.focusStack;
        await loadLayout({ keepView: true }); // guardar no cambia de pantalla ni de enfoque: la persona sigue configurando
        state.steps = keepSteps;
        state.focus = keepFocus;
        state.focusStack = keepStack;
        if (state.draft) showEditor();
        Dashboard.showToast(t('main.layoutGuardado'), 'success');
        return true;
    } catch (err) {
        console.error('Layout: no se pudo guardar', err);
        Dashboard.showToast(t('main.layoutErrorGuardar'), 'error');
        return false;
    } finally {
        refreshButtons();
    }
}
$('layout-save').addEventListener('click', () => { saveLayout(); });
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
    ['main.layoutLockGrupoPlano', [['metrics', 'main.layoutLockMetricos'], ['doors', 'main.layoutLockPuertasLuz'], ['counts', 'main.layoutLockConteos'], ['positions', 'main.layoutLockPosiciones']]],
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
// Fotos del modelo (2026-11-13): la hoja se convierte a imagen, así que las fotos que usa el croquis (la de arriba, o la de frente en un activo chico) se bajan ANTES y entran como data: URL. Se juntan las de lo guardado y las de lo que se ve en pantalla.
async function loadSheetPhotos(data) {
    const wanted = new Map();
    const collect = (spaces) => (spaces || []).forEach((sp) => {
        if (!sp || sp.look !== 'photos' || !sp.modelId || !sp.photos) return;
        ['top', 'front'].forEach((face) => { if (sp.photos[face]) wanted.set(`${sp.modelId}|${face}|${sp.photos[face]}`, [sp.modelId, face, sp.photos[face]]); });
    });
    collect((data.layout || {}).spaces);
    collect(state.draft && state.draft.spaces);
    const photos = {};
    await Promise.all([...wanted].map(async ([key, [modelId, face, ver]]) => {
        try {
            const res = await fetch(window.AssetLooks.photoUrl(modelId, face, ver), { credentials: 'include' });
            if (!res.ok) return;
            const blob = await res.blob();
            photos[key] = await new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => resolve(''); fr.readAsDataURL(blob); });
        } catch (err) { /* sin esa foto: el activo se dibuja como siempre */ }
    }));
    return photos;
}
async function loadSheetData() {
    const data = await fetchQrData();
    if (!data) return null;
    return { data, logoRatio: await logoRatioOf(data.logoDataUrl), photos: await loadSheetPhotos(data) };
}
// Con o sin medidas y m² para lo que se imprime: lo que se eligió en la ventana de descarga (si está abierta) o, si no, lo que se ve en el croquis.
const sheetView = () => (sheetDialog && sheetDialog.view) || { measures: state.showMeasures, area: state.showArea, names: state.showNames, totals: true, legend: true, openings: true, rotation: state.rotation || 0 };
// Lo que se ve en pantalla, con los cambios que todavía no se guardan, con la misma forma que lo guardado (lo apagado no sale, las posiciones van como las lee la hoja y los totales se sacan de esto).
function liveSheetData() {
    const d = state.draft;
    const on = (list) => (list || []).filter((x) => x.active !== false);
    const spaces = on(d.spaces);
    const liveSpaces = new Set(spaces.map((s) => s.id));
    const positions = (d.positions || []).filter((p) => liveSpaces.has(p.spaceId)).map((p) => ({ s: p.spaceId, n: p.n, c: p.c, num: p.num, x: p.x, y: p.y, l: p.l, w: p.w, h: p.h, ...(Array.isArray(p.faces) && p.faces.length ? { faces: p.faces } : {}) }));
    const layout = { ...d, zones: on(d.zones), floors: on(d.floors), ramps: on(d.ramps), footprints: on(d.footprints), spaces, positions };
    return { layout, kpis: LC.computeKpis({ ...layout, obstacles: d.obstacles || [], transit: d.transit || [] }) };
}
function buildSheetSvgFrom(loaded) {
    const { data, logoRatio, photos } = loaded;
    // con cambios sin guardar la hoja sale con lo que se ve en pantalla (lo demás —el QR, la versión y el logo— sigue siendo de lo guardado)
    const liveData = isDirty() && state.draft ? liveSheetData() : null;
    return window.LayoutSheet.buildSheetSvg({
        // Sitio: el que se escribe a mano en el Layout (Contorno > Sitio); sin él sale el texto de siempre. Después se llenará de la configuración (aquí es donde se conecta).
        companyName: data.companyName, siteName: data.siteName || t('main.layoutHojaArea'), logoDataUrl: data.logoDataUrl || '', logoRatio, version: data.version, updatedAt: new Date(`${String(data.updatedAt).replace(' ', 'T')}Z`), printedAt: new Date(),
        url: data.url, qrRows: data.qrRows, kpis: liveData ? liveData.kpis : data.kpis, theme: window.LayoutMapSvg.theme(data.companyColor), photoHref: (id, face, ver) => (photos && photos[`${id}|${face}|${ver}`]) || '',
        // el reporte sale como se ve el croquis ahorita: sus capas activas y las medidas visibles u ocultas
        layout: liveData ? liveData.layout : { ...data.layout, obstacles: (data.extras && data.extras.obstacles) || [], power: (data.extras && data.extras.power) || [] },
        view: { layers: [...new Set(state.steps.map((s) => (s === 'espacios' ? 'huellas' : (s === 'posiciones' || s === 'niveles' || s === 'ubicaciones' ? 'activos' : s))))], measures: sheetView().measures, area: sheetView().area, names: sheetView().names, totals: sheetView().totals, legend: sheetView().legend, openings: sheetView().openings !== false, rotation: sheetView().rotation },
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
                <button type="button" class="layout-sheet-tgl" id="layout-sheet-tgl-openings" data-sheet-tgl="openings" aria-pressed="true"><i class="bx bx-door-open" aria-hidden="true"></i><span>${esc(t('main.layoutHojaConPuertas'))}</span></button>
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
    [['measures', 'canToggleMeasures', 'main.layoutMedidasOcultar', 'main.layoutMedidasVer'], ['area', 'canToggleArea', 'main.layoutAreaOcultar', 'main.layoutAreaVer'], ['names', 'canToggleNames', 'main.layoutNombresOcultar', 'main.layoutNombresVer'], ['totals', 'canUseQr', 'main.layoutTotalesOcultar', 'main.layoutTotalesVer'], ['legend', 'canUseQr', 'main.layoutSimbologiaOcultar', 'main.layoutSimbologiaVer'], ['openings', 'canUseQr', 'main.layoutPuertasOcultar', 'main.layoutPuertasVer']].forEach(([key, perm, hideKey, showKey]) => {
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
    sheetDialog = { kind, loaded, view: { measures: state.showMeasures, area: state.showArea, names: state.showNames, totals, legend, openings: true, rotation: state.rotation || 0 } };
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
        scan: t('main.layoutHojaEscanea'), fixed: t('main.layoutHojaNoCambia'), door: t('main.layoutLeyendaPuerta'), wall2: t('main.layoutLeyendaParedDos'), openSwing: t('main.layoutLeyendaGiroPuerta'), openSlide: t('main.layoutLeyendaRecorridoPuerta'), ramp: t('main.layoutLeyendaRampa'), space: t('main.layoutLeyendaEspacio'), footprint: t('main.layoutLeyendaHuella'),
        dry: typeLabel('zone', 'dry'), cold: typeLabel('zone', 'cold'), chemical: typeLabel('zone', 'chemical'), finished: typeLabel('zone', 'finished'),
        aisle: typeLabel('zone', 'aisle'), aisle2: typeLabel('zone', 'aisle2'), dock: typeLabel('zone', 'dock'), office: typeLabel('zone', 'office'), none: t('main.layoutSinZona'),
        ...Object.fromEntries(LC.SAFETY_TYPES.map((tp) => [`safety_${tp}`, typeLabel('safety', tp)])),
        ...Object.fromEntries(LC.HYDRANT_MODELS.map((m) => [`hydrant_${m}`, typeLabel('hydrant', m)])),
        contour: t('main.colLayoutContorno'),
        posTitle: t('main.layoutHojaPosTitulo'), posNivel1: t('main.layoutHojaPosNivel1'), posNiveles: t('main.layoutHojaPosNiveles'), posNote: t('main.layoutHojaPosNota'),
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
// La hoja de posiciones: una página por activo (A4 horizontal) con sus niveles vistos desde arriba, sus espacios (E001…) y sus posiciones (P001…). Sale de lo ÚLTIMO GUARDADO (el mismo Layout del QR) y se baja en un solo PDF.
async function downloadPositionsSheet() {
    Dashboard.showToast(t('main.layoutPreparandoHoja'), 'info');
    const loaded = await loadSheetData();
    if (!loaded) return;
    const { data, logoRatio } = loaded;
    const lay = data.layout || {};
    const spaces = (lay.spaces || []).filter((s) => (lay.positions || []).some((p) => p.s === s.id));
    if (!spaces.length) { Dashboard.showToast(t('main.layoutPosHojaSinActivos'), 'warning'); return; }
    const sheetData = {
        companyName: data.companyName, siteName: data.siteName || t('main.layoutHojaArea'), logoDataUrl: data.logoDataUrl || '', logoRatio, version: data.version,
        updatedAt: new Date(`${String(data.updatedAt).replace(' ', 'T')}Z`), printedAt: new Date(), qrRows: data.qrRows, theme: window.LayoutMapSvg.theme(data.companyColor), layout: lay,
    };
    const labels = sheetLabels();
    const svgs = spaces.map((sp) => window.LayoutSheet.buildPositionsPageSvg(sheetData, sp, labels, Dashboard.lang, { cut: false }));
    const blob = await window.LayoutSheet.renderPdfPages(svgs);
    const day = new Date().toISOString().slice(0, 10);
    window.LayoutSheet.saveBlob(blob, `Posiciones_${slug(data.companyName)}_v${data.version}_${day}.pdf`);
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
        else if (kind === 'pos-pdf') await downloadPositionsSheet();
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
