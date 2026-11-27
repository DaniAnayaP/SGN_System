'use strict';
// ---------------------------------------------------------------------------
// Cargas Manuales › Análisis Registros Manuales (Daniel, 2026-11-25, «Sí, empieza el Análisis»): lógica pura, sin base de datos (la base entra por `sources`).
// Hay dos formas de diseño:
//   · ANTERIOR (legacy): junta uno o dos registros mensuales/diarios por unidad + código (registries, reference, consulted). Sigue funcionando igual (buildExtraction) hasta que alguien la edita con la pantalla nueva.
//   · SIN DISEÑO (Daniel, 2026-11-26, «constrúyelo todo de una vez»): archivo base + columnas base (con llave) + «sin / con duplicados» + columnas traídas de cualquier archivo, cada una con su llave, condiciones y forma de juntar (ver analysisBuild.js).
// normalizeDesign acepta las dos y siempre devuelve la vista nueva (baseRegistry, base, dedupe, columns): para un diseño anterior la deriva y lo marca `legacy: true`.
// «Extraer» saca todo a un ARCHIVO propio (una versión con su fecha): es una copia, no cambia aunque después cambie un registro.
// ---------------------------------------------------------------------------
const REFERENCE_DIMS = ['unidad', 'unidadNombre', 'codigo', 'descripcion', 'categoria', 'udm'];
const KEY_DIMS = ['unidad', 'codigo'];
const AGGS = ['value', 'avg', 'sum', 'min', 'max'];
const MAX_ROWS = 300000;
const analysisAdded = require('./analysisAdded');
const { AGGS2 } = require('./analysisBuild');
const MAX_CONSULTED = 40;
const MAX_PERIODS = 120;
const MAX_FILTER_ITEMS = 500;
// Cómo se ve el valor de una columna en el Análisis (Daniel, 2026-11-26): general = como viene; los demás son solo de presentación (el dato no cambia). dec1/dec2 son los nombres de la primera versión (siguen valiendo).
const FORMATS = ['general', 'int', 'dec1', 'dec2', 'd1', 'd2', 'd4', 'miles', 'money', 'pct', 'cient', 'fecha', 'fechahora', 'hora', 'texto', 'pers'];
const CLASS_COLOR_COUNT = 6;
const MAX_COLUMNS = 80;
const MAX_BASE = 20;
const MAX_CONDS = 8;
const MAX_COND_VALUES = 1000;
const MAX_VALUE_COLS = 130;
const COL_KEY_RE = /^[A-Za-z0-9_]{1,40}$/;
const flexExcel = require('./flexExcel');
const LOOK_KEY_RE = /^(ref_[A-Za-z0-9_]{1,60}|c_[A-Za-z0-9_]{1,40}|a_[A-Za-z0-9_]{1,40})$/; // la clave de una columna del análisis: de referencia (ref_…), de un archivo (c_…) o agregada (a_…)
const MAX_LOOKS = 200;
// El formato que la persona le dio a cada columna (número, estilo de celdas, encabezado: el mismo de Registros Información), revisado.
function cleanLooks(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.entries(raw).slice(0, MAX_LOOKS).forEach(([key, value]) => {
        if (!LOOK_KEY_RE.test(key)) return;
        const f = flexExcel.cleanColumnFormat(value);
        if (Object.keys(f).length) out[key] = f;
    });
    return out;
}
// El acomodo original de las columnas de la tabla del Archivo (el mismo { order, hidden, pinned, widths } del acomodo de columnas de la pantalla; las claves son las de los encabezados: an_ref_…, an_c_…, an_a_…), revisado. undefined = no hay.
const LAYOUT_KEY_RE = /^an_(ref_[A-Za-z0-9_]{1,60}|c_[A-Za-z0-9_]{1,40}|a_[A-Za-z0-9_]{1,40})$/;
const MAX_LAYOUT_COLS = 400;
function cleanLayout(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const keys = (v) => (Array.isArray(v) ? [...new Set(v.filter((k) => typeof k === 'string' && LAYOUT_KEY_RE.test(k)))].slice(0, MAX_LAYOUT_COLS) : []);
    const order = keys(raw.order);
    if (!order.length) return undefined;
    const widths = {};
    if (raw.widths && typeof raw.widths === 'object' && !Array.isArray(raw.widths)) {
        Object.entries(raw.widths).slice(0, MAX_LAYOUT_COLS).forEach(([k, w]) => { const n = Number(w); if (LAYOUT_KEY_RE.test(k) && Number.isFinite(n) && n >= 40 && n <= 2000) widths[k] = Math.round(n); });
    }
    return { order, hidden: keys(raw.hidden), pinned: keys(raw.pinned).slice(0, 4), widths };
}
const LIVE_RE = /^(last|v:[a-z0-9 _.\-]{1,80})$/; // «la más reciente»: el último periodo o la familia de columnas de una tabla libre (su nombre sin mayúsculas ni acentos)
const LINES = ['solid', 'dotted', 'dashed', 'double', 'thick'];

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const cleanText = (value, max) => String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const periodColKey = (period) => `p_${String(period).replace(/-/g, '_')}`;

// El aspecto de una columna (como en Excel): negrita, cursiva, subrayado, rayado, color del encabezado, sombreado de los datos, bordes, línea y color de línea.
// Los colores son un número de la paleta del estilo (1 a 4) o un color #rrggbb; lo que no se toca no se guarda.
function normalizeStyle(raw) {
    const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = {};
    ['b', 'i', 'u', 's'].forEach((k) => { if (s[k] === true) out[k] = true; });
    const color = (v) => (Number.isInteger(v) && v >= 1 && v <= 4 ? v : (/^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v).toLowerCase() : null));
    ['hc', 'dc', 'lc'].forEach((k) => { const c = color(s[k]); if (c !== null) out[k] = c; });
    const sides = [...new Set((Array.isArray(s.bd) ? s.bd : []).map(String).filter((x) => ['all', 't', 'b', 'l', 'r'].includes(x)))];
    if (sides.length) out.bd = sides;
    if (LINES.includes(s.line) && s.line !== 'solid') out.line = s.line;
    return out;
}
// La clasificación (el nombre que quiera la persona, con su color), el formato y el aspecto: se guardan igual en las columnas de las dos formas de diseño.
function applyLook(entry, c) {
    const cls = cleanText(c.cls, 40);
    if (cls) { entry.cls = cls; const color = analysisAdded.normalizeClassColor(c.color); if (color !== null) entry.color = color; } // un número de la paleta (0 a 5) o un color #rrggbb
    if (FORMATS.includes(c.fmt) && c.fmt !== 'general') { entry.fmt = c.fmt; if (c.fmt === 'pers') { const pat = cleanText(c.pat, 40); if (pat) entry.pat = pat; } }
    const style = normalizeStyle(c.style);
    if (Object.keys(style).length) entry.style = style;
}

// El diseño anterior (registries, reference, consulted).
function normalizeLegacy(src, registryKeys) {
    const registries = [...new Set((Array.isArray(src.registries) ? src.registries : []).map(String).filter((k) => registryKeys.includes(k)))].slice(0, 2);
    if (!registries.length) return { error: 'DESIGN_REGISTRIES', field: 'registries' };
    // las dos llaves (unidad y código) siempre van: con ellas se juntan los registros
    const wanted = new Set((Array.isArray(src.reference) ? src.reference : REFERENCE_DIMS).map(String));
    const reference = REFERENCE_DIMS.filter((d) => KEY_DIMS.includes(d) || wanted.has(d));
    const consulted = [];
    const ids = new Set();
    for (const c of (Array.isArray(src.consulted) ? src.consulted : []).slice(0, MAX_CONSULTED)) {
        if (!c || typeof c !== 'object') continue;
        if (!registries.includes(String(c.registry))) return { error: 'DESIGN_COLUMN_REGISTRY', field: 'consulted' };
        const agg = AGGS.includes(c.agg) ? c.agg : 'value';
        const periods = [...new Set((Array.isArray(c.periods) ? c.periods : []).map(String).filter((p) => PERIOD_RE.test(p)))].sort().slice(0, MAX_PERIODS);
        if (!periods.length) return { error: 'DESIGN_COLUMN_PERIODS', field: 'consulted' };
        let id = cleanText(c.id, 20).replace(/[^a-zA-Z0-9_]/g, '');
        if (!id || ids.has(id)) id = `c${consulted.length + 1}`;
        while (ids.has(id)) id += '_';
        ids.add(id);
        const entry = { id, label: cleanText(c.label, 80) || periods.join(', '), registry: String(c.registry), agg, periods: agg === 'value' ? periods.slice(0, 1) : periods };
        applyLook(entry, c);
        consulted.push(entry);
    }
    // las columnas agregadas en el Archivo (se calculan al leer cada versión; ver analysisAdded.js)
    const addedChecked = analysisAdded.normalizeAdded(src.added);
    if (addedChecked.error) return { error: addedChecked.error, field: 'added' };
    const list = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => cleanText(x, 80)).filter(Boolean))].slice(0, MAX_FILTER_ITEMS);
    const filters = { unidades: list(src.filters && src.filters.unidades), categorias: list(src.filters && src.filters.categorias), codigos: list(src.filters && src.filters.codigos) };
    return { design: { registries, reference, consulted, added: addedChecked.added, filters } };
}
// La vista nueva de un diseño anterior: archivo base = el primer registro; columnas base = las de referencia (unidad y código son llave); cada columna consultada = sus periodos como columnas de valor.
function legacyAsV2(d) {
    return {
        baseRegistry: d.registries[0],
        base: d.reference.map((dim) => ({ col: dim, key: KEY_DIMS.includes(dim) })),
        dedupe: 'sin',
        columns: d.consulted.map((c) => {
            const entry = { id: c.id, label: c.label, registry: c.registry, valueCols: c.periods.map(periodColKey), agg: c.agg === 'value' ? 'sum' : c.agg, keyMap: KEY_DIMS.map((k) => ({ base: k, file: k })), conds: [] };
            ['cls', 'color', 'fmt', 'pat', 'style'].forEach((k) => { if (c[k] !== undefined) entry[k] = c[k]; });
            return entry;
        }),
    };
}

// El diseño sin Diseño: archivo base, columnas base, duplicados y columnas de archivos.
function normalizeV2(src, registryKeys) {
    const baseRegistry = String(src.baseRegistry || '');
    if (!registryKeys.includes(baseRegistry)) return { error: 'DESIGN_REGISTRIES', field: 'baseRegistry' };
    const base = [];
    const seenBase = new Set();
    for (const b of (Array.isArray(src.base) ? src.base : []).slice(0, MAX_BASE)) {
        const col = cleanText(b && b.col, 40);
        if (!COL_KEY_RE.test(col) || seenBase.has(col)) continue;
        seenBase.add(col);
        base.push({ col, key: !!b && b.key === true });
    }
    if (!base.some((b) => b.key)) return { error: 'BASE_KEY', field: 'base' };
    const dedupe = src.dedupe === 'con' ? 'con' : 'sin';
    const columns = [];
    const ids = new Set();
    for (const c of (Array.isArray(src.columns) ? src.columns : []).slice(0, MAX_COLUMNS)) {
        if (!c || typeof c !== 'object') continue;
        const registry = String(c.registry || '');
        if (!registryKeys.includes(registry)) return { error: 'DESIGN_COLUMN_REGISTRY', field: 'columns' };
        const valueCols = [...new Set((Array.isArray(c.valueCols) ? c.valueCols : []).map((v) => cleanText(v, 40)).filter((v) => COL_KEY_RE.test(v)))].slice(0, MAX_VALUE_COLS);
        const agg = AGGS2.includes(c.agg) ? c.agg : 'sum';
        const live = [...new Set((Array.isArray(c.live) ? c.live : []).map((v) => cleanText(v, 90)).filter((v) => LIVE_RE.test(v)))].slice(0, MAX_VALUE_COLS);
        if (!valueCols.length && !live.length && agg !== 'count') return { error: 'COL_VALUE', field: 'columns' };
        const keyMap = (Array.isArray(c.keyMap) ? c.keyMap : []).slice(0, MAX_BASE).map((k) => ({ base: cleanText(k && k.base, 40), file: cleanText(k && k.file, 40) })).filter((k) => COL_KEY_RE.test(k.base) && COL_KEY_RE.test(k.file));
        const conds = [];
        for (const cond of (Array.isArray(c.conds) ? c.conds : []).slice(0, MAX_CONDS)) {
            const col = cleanText(cond && cond.col, 40);
            const values = [...new Set((Array.isArray(cond && cond.values) ? cond.values : []).map((v) => cleanText(v, 120)).filter((v) => v !== ''))].slice(0, MAX_COND_VALUES);
            if (!COL_KEY_RE.test(col) || !values.length) continue;
            conds.push({ col, values, join: conds.length && cond.join === 'or' ? 'or' : 'and' });
        }
        let id = cleanText(c.id, 20).replace(/[^a-zA-Z0-9_]/g, '');
        if (!id || ids.has(id)) id = `c${columns.length + 1}`;
        while (ids.has(id)) id += '_';
        ids.add(id);
        const entry = { id, label: cleanText(c.label, 80) || id, registry, valueCols, agg, keyMap, conds, ...(live.length ? { live } : {}) };
        applyLook(entry, c);
        columns.push(entry);
    }
    const addedChecked = analysisAdded.normalizeAdded(src.added);
    if (addedChecked.error) return { error: addedChecked.error, field: 'added' };
    const registries = [...new Set([baseRegistry, ...columns.map((c) => c.registry)])];
    return { design: { legacy: false, baseRegistry, base, dedupe, columns, registries, reference: [], consulted: [], added: addedChecked.added, looks: cleanLooks(src.looks), layout: cleanLayout(src.layout), filters: { unidades: [], categorias: [], codigos: [] } } };
}
// El diseño que manda la pantalla, revisado y limpio. registryKeys = los registros que se pueden usar. Devuelve { design } o { error, field }.
function normalizeDesign(raw, registryKeys) {
    const src = raw && typeof raw === 'object' ? raw : {};
    // un diseño anterior ya guardado trae también la vista nueva (legacy: true): sigue siendo anterior hasta que se guarde con legacy: false
    if (src.baseRegistry && src.legacy !== true) return normalizeV2(src, registryKeys);
    const legacy = normalizeLegacy(src, registryKeys);
    if (legacy.error) return legacy;
    return { design: { ...legacy.design, ...legacyAsV2(legacy.design), looks: cleanLooks(src.looks), layout: cleanLayout(src.layout), legacy: true } };
}
const isV2 = (design) => !!(design && design.baseRegistry && design.legacy !== true);

// Los periodos que necesita cada registro para armar el archivo (para pedir a la base solo esos). Solo del diseño anterior.
function periodsNeeded(design) {
    const need = {};
    design.registries.forEach((k) => { need[k] = new Set(); });
    design.consulted.forEach((c) => c.periods.forEach((p) => need[c.registry].add(p)));
    return Object.fromEntries(Object.entries(need).map(([k, set]) => [k, [...set].sort()]));
}
const keyOf = (unidad, codigo) => `${unidad}\u0001${codigo}`;
function aggregate(agg, periods, values) {
    const present = periods.map((p) => values[p]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (!present.length) return null;
    if (agg === 'value') return present[0];
    if (agg === 'sum') return round6(present.reduce((a, b) => a + b, 0));
    if (agg === 'min') return Math.min(...present);
    if (agg === 'max') return Math.max(...present);
    return round6(present.reduce((a, b) => a + b, 0) / present.length);
}
// sources: { [registryKey]: Map(unidad\u0001codigo → { dims: {unidad, unidadNombre, codigo, descripcion, categoria, udm}, values: {periodo: valor} }) }
// Devuelve { columns: [{ key, group, dim?|id?, label?, registry?, agg?, periods? }], rows: [[...]], truncated }. Solo del diseño anterior.
function buildExtraction(design, sources, { maxRows = MAX_ROWS } = {}) {
    const columns = [
        ...design.reference.map((dim) => ({ key: `ref_${dim}`, group: 'reference', dim })),
        ...design.consulted.map((c) => ({ key: `c_${c.id}`, group: 'consulted', id: c.id, label: c.label, registry: c.registry, agg: c.agg, periods: c.periods })),
    ];
    // los renglones: la unión de los de los registros que se consultan (un código con consumo y sin existencia sale con la celda vacía, y al revés)
    const used = [...new Set(design.consulted.map((c) => c.registry))];
    const registries = used.length ? used : design.registries;
    const keys = new Map(); // llave → dims (del primer registro del diseño que la trae)
    design.registries.filter((k) => registries.includes(k)).forEach((k) => {
        (sources[k] || new Map()).forEach((entry, key) => { if (!keys.has(key)) keys.set(key, entry.dims); });
    });
    const ordered = [...keys.entries()].sort((a, b) => (a[1].unidad < b[1].unidad ? -1 : a[1].unidad > b[1].unidad ? 1 : (a[1].codigo < b[1].codigo ? -1 : a[1].codigo > b[1].codigo ? 1 : 0)));
    const truncated = ordered.length > maxRows;
    const rows = (Number.isFinite(maxRows) ? ordered.slice(0, maxRows) : ordered).map(([key, dims]) => [
        ...design.reference.map((dim) => dims[dim] || ''),
        ...design.consulted.map((c) => { const entry = (sources[c.registry] || new Map()).get(key); return entry ? aggregate(c.agg, c.periods, entry.values) : null; }),
    ]);
    return { columns, rows, truncated };
}
module.exports = { cleanLayout, FORMATS, CLASS_COLOR_COUNT, REFERENCE_DIMS, KEY_DIMS, AGGS, AGGS2, MAX_ROWS, MAX_CONSULTED, MAX_COLUMNS, normalizeDesign, normalizeStyle, isV2, periodsNeeded, buildExtraction, aggregate, keyOf, cleanText, periodColKey, cleanLooks, LOOK_KEY_RE };
