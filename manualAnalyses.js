'use strict';
// ---------------------------------------------------------------------------
// Cargas Manuales › Análisis Registros Manuales (Daniel, 2026-11-25, «Sí, empieza el Análisis»): lógica pura, sin base de datos (la base entra por `sources`).
// Un ANÁLISIS junta uno o dos registros (manualRegistries.js) por unidad + código y se arma con TRES grupos de columnas, en este orden:
//   1) REFERENCIA (al inicio): qué es el renglón (unidad, código, descripción…); 2) CONSULTADAS de registros: lo que se trae de cada registro (el valor de un mes o día, o su promedio, suma, mínimo o máximo de varios);
//   3) FORMULADAS (las que se agregan al final con fórmula: llegan en la siguiente pieza).
// «Extraer» saca todo a un ARCHIVO propio (una versión con su fecha): es una copia, no cambia aunque después cambie un registro. Esta lógica calcula ese archivo.
// ---------------------------------------------------------------------------
const REFERENCE_DIMS = ['unidad', 'unidadNombre', 'codigo', 'descripcion', 'categoria', 'udm'];
const KEY_DIMS = ['unidad', 'codigo'];
const AGGS = ['value', 'avg', 'sum', 'min', 'max'];
const MAX_ROWS = 300000;
const analysisAdded = require('./analysisAdded');
const MAX_CONSULTED = 40;
const MAX_PERIODS = 120;
const MAX_FILTER_ITEMS = 500;

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const cleanText = (value, max) => String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// El diseño que manda la pantalla, revisado y limpio. registryKeys = los registros que existen (REGISTRIES). Devuelve { design } o { error, field }.
function normalizeDesign(raw, registryKeys) {
    const src = raw && typeof raw === 'object' ? raw : {};
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
        consulted.push({ id, label: cleanText(c.label, 80) || periods.join(', '), registry: String(c.registry), agg, periods: agg === 'value' ? periods.slice(0, 1) : periods });
    }
    // las columnas agregadas en el Archivo (se calculan al leer cada versión; ver analysisAdded.js)
    const addedChecked = analysisAdded.normalizeAdded(src.added);
    if (addedChecked.error) return { error: addedChecked.error, field: 'added' };
    const list = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => cleanText(x, 80)).filter(Boolean))].slice(0, MAX_FILTER_ITEMS);
    const filters = { unidades: list(src.filters && src.filters.unidades), categorias: list(src.filters && src.filters.categorias), codigos: list(src.filters && src.filters.codigos) };
    return { design: { registries, reference, consulted, added: addedChecked.added, filters } };
}
// Los periodos que necesita cada registro para armar el archivo (para pedir a la base solo esos).
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
// Devuelve { columns: [{ key, group, dim?|id?, label?, registry?, agg?, periods? }], rows: [[...]], truncated }.
function buildExtraction(design, sources) {
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
    const truncated = ordered.length > MAX_ROWS;
    const rows = ordered.slice(0, MAX_ROWS).map(([key, dims]) => [
        ...design.reference.map((dim) => dims[dim] || ''),
        ...design.consulted.map((c) => { const entry = (sources[c.registry] || new Map()).get(key); return entry ? aggregate(c.agg, c.periods, entry.values) : null; }),
    ]);
    return { columns, rows, truncated };
}
module.exports = { REFERENCE_DIMS, KEY_DIMS, AGGS, MAX_ROWS, MAX_CONSULTED, normalizeDesign, periodsNeeded, buildExtraction, aggregate, keyOf, cleanText };
