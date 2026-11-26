'use strict';
// ---------------------------------------------------------------------------
// Análisis sin Diseño (Daniel, 2026-11-26): el motor puro (sin base de datos) que arma la versión de un análisis.
// Un análisis tiene un ARCHIVO BASE (un registro) y COLUMNAS BASE (columnas de ese archivo; las marcadas «llave» identifican cada renglón). Con «sin duplicados» cada combinación de llaves sale una sola vez; con «con duplicados» sale cada renglón.
// Cada COLUMNA que se trae de un archivo dice: de qué archivo, qué columna(s) de valor, con qué llave se liga (cada columna base llave ← una columna del archivo), qué condiciones deben cumplir los renglones del archivo
// (ninguna, una o más; cada una dice «columna es alguna de estas opciones» y se une a la anterior con «y» o con «o», de izquierda a derecha) y cómo juntar los valores si la llave se repite (suma, promedio, mínimo, máximo, conteo o el primero).
// tables = { claveDelRegistro: { columns: [{ key, label }], rows: [[celdas]] } } (ver analysisSources.js).
// ---------------------------------------------------------------------------
const MAX_ROWS = 300000;
const AGGS2 = ['sum', 'avg', 'min', 'max', 'count', 'first'];
const DIM_KEYS = ['unidad', 'unidadNombre', 'codigo', 'descripcion', 'categoria', 'udm'];
const round6 = (n) => Math.round(n * 1e6) / 1e6;

// La forma en que se comparan llaves y valores de condiciones: sin acentos, mayúsculas ni espacios de los lados (100013 y «100013 » son lo mismo).
const norm = (v) => {
    if (v === null || v === undefined) return '';
    const t = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
    return t.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
};
const parseNum = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).trim().replace(/[$,\s%]/g, '');
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};
const cellOf = (v) => (v === null || v === undefined ? '' : v);

// Las columnas del archivo, por clave → posición.
const indexOf = (table) => new Map(table.columns.map((c, i) => [c.key, i]));

// Los valores de UNA columna nueva, uno por renglón del análisis. rows = [{ tuple }] con la llave de cada renglón (ya normalizada); keyBase = las columnas base llave, en orden.
// Devuelve { values } o { error, field }.
function columnValues(col, tables, baseRegistry, keyBase, rows) {
    const table = tables[col.registry];
    if (!table) return { error: 'COL_REGISTRY', field: col.id };
    const idx = indexOf(table);
    const keyIdx = [];
    for (const b of keyBase) {
        const mapped = (col.keyMap || []).find((k) => k.base === b.col);
        const fileCol = mapped ? mapped.file : (col.registry === baseRegistry ? b.col : null);
        if (!fileCol || !idx.has(fileCol)) return { error: 'COL_KEY', field: col.id };
        keyIdx.push(idx.get(fileCol));
    }
    const valueIdx = (col.valueCols || []).map((k) => idx.get(k)).filter((i) => i !== undefined);
    if (!valueIdx.length && col.agg !== 'count') return { error: 'COL_VALUE', field: col.id };
    const conds = [];
    for (const c of col.conds || []) {
        if (!idx.has(c.col)) return { error: 'COL_COND', field: col.id };
        conds.push({ i: idx.get(c.col), set: new Set((c.values || []).map(norm)), or: c.join === 'or' });
    }
    const hits = (r) => {
        let ok = true;
        conds.forEach((c, n) => {
            const hit = c.set.has(norm(r[c.i]));
            ok = n === 0 ? hit : (c.or ? ok || hit : ok && hit);
        });
        return ok;
    };
    const accum = new Map();
    for (const r of table.rows) {
        if (conds.length && !hits(r)) continue;
        const tk = keyIdx.map((i) => norm(r[i])).join('\u0001');
        let a = accum.get(tk);
        if (!a) { a = { rows: 0, n: 0, sum: 0, min: Infinity, max: -Infinity, first: undefined }; accum.set(tk, a); }
        a.rows += 1;
        for (const vi of valueIdx) {
            const raw = r[vi];
            if (a.first === undefined && raw !== null && raw !== undefined && raw !== '') a.first = raw;
            const x = parseNum(raw);
            if (x === null) continue;
            a.n += 1; a.sum += x;
            if (x < a.min) a.min = x;
            if (x > a.max) a.max = x;
        }
    }
    const agg = AGGS2.includes(col.agg) ? col.agg : 'sum';
    const values = rows.map((row) => {
        const a = accum.get(row.tuple);
        if (!a) return null;
        if (agg === 'count') return a.rows;
        if (agg === 'first') return a.first === undefined ? null : a.first;
        if (!a.n) return null;
        if (agg === 'sum') return round6(a.sum);
        if (agg === 'avg') return round6(a.sum / a.n);
        return agg === 'min' ? a.min : a.max;
    });
    return { values };
}

// Arma la versión: { columns, rows, truncated } (el mismo formato que usan la pantalla y las columnas agregadas) o { error, field }.
function buildExtractionV2(design, tables) {
    const baseTable = tables[design.baseRegistry];
    if (!baseTable) return { error: 'BASE_MISSING', field: 'baseRegistry' };
    const idx = indexOf(baseTable);
    const base = (design.base || []).filter((b) => idx.has(b.col));
    const keyBase = base.filter((b) => b.key);
    if (!keyBase.length) return { error: 'BASE_KEY', field: 'base' };
    const rows = [];
    const seen = new Set();
    let truncated = false;
    for (const r of baseTable.rows) {
        const tuple = keyBase.map((b) => norm(r[idx.get(b.col)]));
        if (tuple.every((t) => t === '')) continue;
        const tk = tuple.join('\u0001');
        if (design.dedupe !== 'con') { if (seen.has(tk)) continue; seen.add(tk); }
        if (rows.length >= MAX_ROWS) { truncated = true; break; }
        rows.push({ vals: base.map((b) => cellOf(r[idx.get(b.col)])), tuple: tk });
    }
    const columns = base.map((b) => ({ key: `ref_${b.col}`, group: 'reference', ...(DIM_KEYS.includes(b.col) ? { dim: b.col } : {}), label: baseTable.columns[idx.get(b.col)].label, isKey: true === b.key, srcCol: b.col }));
    const extra = [];
    for (const col of design.columns || []) {
        const out = columnValues(col, tables, design.baseRegistry, keyBase, rows);
        if (out.error) return out;
        columns.push({ key: `c_${col.id}`, group: 'consulted', id: col.id, label: col.label, registry: col.registry, agg: col.agg, valueCols: col.valueCols });
        extra.push(out.values);
    }
    const data = rows.map((row, i) => [...row.vals, ...extra.map((vals) => vals[i])]);
    return { columns, rows: data, truncated };
}

// Una vista previa de la llave de la base: cuántos renglones salen sin duplicados y cuántos con duplicados.
function baseCounts(baseTable, base) {
    const idx = indexOf(baseTable);
    const keyBase = (base || []).filter((b) => b.key && idx.has(b.col));
    if (!keyBase.length) return { distinct: 0, total: 0 };
    const seen = new Set();
    let total = 0;
    for (const r of baseTable.rows) {
        const tuple = keyBase.map((b) => norm(r[idx.get(b.col)]));
        if (tuple.every((t) => t === '')) continue;
        total += 1;
        seen.add(tuple.join('\u0001'));
    }
    return { distinct: seen.size, total };
}

module.exports = { MAX_ROWS, AGGS2, norm, parseNum, buildExtractionV2, baseCounts, columnValues };
