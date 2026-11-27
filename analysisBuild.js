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

const ASCII_ONLY = /^[\x00-\x7f]*$/;
// La forma en que se comparan llaves y valores de condiciones: sin acentos, mayúsculas ni espacios de los lados (100013 y «100013 » son lo mismo).
const norm = (v) => {
    if (v === null || v === undefined) return '';
    const t = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
    if (ASCII_ONLY.test(t)) return t.trim().toLowerCase(); // sin acentos que quitar: el mismo resultado, mucho más rápido
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

// «La más reciente» (Daniel, 2026-11-26): una columna de valor puede pedir, en vez de una columna concreta, la más nueva de la tabla de HOY.
//   · tabla libre: liveId «v:<nombre>» = la columna de ese nombre de la carga más reciente (por su día y hora; si empatan, la última que se cargó);
//   · registro mensual o diario: «last» = el último periodo.
function resolveLiveIdx(columns, liveId) {
    let best = -1;
    if (liveId === 'last') {
        columns.forEach((c, i) => { if (c.kind === 'value' && c.period && (best < 0 || c.period > columns[best].period)) best = i; });
        return best;
    }
    columns.forEach((c, i) => {
        if (c.liveId !== liveId) return;
        if (best < 0) { best = i; return; }
        const a = c.at || ''; const b = columns[best].at || '';
        if (a > b || (a === b && (c.loadId || 0) > (columns[best].loadId || 0))) best = i;
    });
    return best;
}
// Las posiciones de las columnas de valor de una columna del análisis: las que eligió (por clave) y las «más recientes» de hoy.
function valueIndexes(col, table, idx) {
    const out = (col.valueCols || []).map((k) => idx.get(k)).filter((i) => i !== undefined);
    (col.live || []).forEach((id) => { const i = resolveLiveIdx(table.columns, id); if (i >= 0 && !out.includes(i)) out.push(i); });
    return out;
}
// Para armar muchas columnas sobre un registro grande sin repetir el mismo trabajo (un análisis de 36 columnas sobre 140 mil renglones tardaba 16 s y dejaba la página «pasmada»):
// lo que depende solo de la TABLA se calcula una vez y lo comparten todas las columnas: a qué grupo de llave pertenece cada renglón y qué renglones cumplen unas condiciones.
const tableMemo = new WeakMap(); // table.rows → { len, groups, masks } (se va con la tabla cuando ya no se usa)
function memoOf(table) {
    let m = tableMemo.get(table.rows);
    if (!m || m.len !== table.rows.length) { m = { len: table.rows.length, groups: new Map(), masks: new Map() }; tableMemo.set(table.rows, m); }
    return m;
}
// Cada renglón de la tabla → el número de su grupo de llave (los renglones con la misma llave comparten número).
function groupsOf(table, keyIdx) {
    const m = memoOf(table);
    const sig = keyIdx.join(',');
    let g = m.groups.get(sig);
    if (g) return g;
    if (m.groups.size >= 8) m.groups.clear();
    const rows = table.rows;
    const gid = new Int32Array(rows.length);
    const map = new Map();
    for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i];
        let tk = norm(r[keyIdx[0]]);
        for (let k = 1; k < keyIdx.length; k += 1) tk += '\u0001' + norm(r[keyIdx[k]]);
        let id = map.get(tk);
        if (id === undefined) { id = map.size; map.set(tk, id); }
        gid[i] = id;
    }
    g = { gid, map, count: map.size };
    m.groups.set(sig, g);
    return g;
}
// Qué renglones de la tabla cumplen las condiciones (1 = cumple). conds = [{ i: posición de la columna, set: opciones ya normalizadas, or: se une a la anterior con «o» }].
function maskOf(table, conds) {
    const m = memoOf(table);
    const sig = JSON.stringify(conds.map((c) => [c.i, c.or, [...c.set].sort()]));
    let mask = m.masks.get(sig);
    if (mask) return mask;
    if (m.masks.size >= 40) m.masks.clear();
    const rows = table.rows;
    mask = new Uint8Array(rows.length);
    const seen = conds.map(() => new Map()); // valor de la celda → ¿está en las opciones? (una vez por valor distinto)
    for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i];
        let ok = true;
        for (let n = 0; n < conds.length; n += 1) {
            const c = conds[n];
            const raw = r[c.i];
            let hit = seen[n].get(raw);
            if (hit === undefined) { hit = c.set.has(norm(raw)); seen[n].set(raw, hit); }
            ok = n === 0 ? hit : (c.or ? ok || hit : ok && hit);
        }
        mask[i] = ok ? 1 : 0;
    }
    m.masks.set(sig, mask);
    return mask;
}

// Los valores de UNA columna nueva, uno por renglón del análisis. rows = [{ tuple }] con la llave de cada renglón (ya normalizada); keyBase = las columnas base llave, en orden.
// ctx (opcional) = { base: new Map() }: lo que se reutiliza entre las columnas de una misma versión. Devuelve { values } o { error, field }.
function columnValues(col, tables, baseRegistry, keyBase, rows, ctx) {
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
    const valueIdx = valueIndexes(col, table, idx);
    if (!valueIdx.length && col.agg !== 'count') return { error: 'COL_VALUE', field: col.id };
    const conds = [];
    for (const c of col.conds || []) {
        if (!idx.has(c.col)) return { error: 'COL_COND', field: col.id };
        conds.push({ i: idx.get(c.col), set: new Set((c.values || []).map(norm)), or: c.join === 'or' });
    }
    const agg = AGGS2.includes(col.agg) ? col.agg : 'sum';
    const g = groupsOf(table, keyIdx);
    const mask = conds.length ? maskOf(table, conds) : null;
    const src = table.rows;
    const gid = g.gid;
    const cnt = new Int32Array(g.count); // renglones del archivo que cumplen, por grupo
    const n = agg === 'count' || agg === 'first' ? null : new Int32Array(g.count); // valores numéricos, por grupo
    const sum = n ? new Float64Array(g.count) : null;
    const min = agg === 'min' ? new Float64Array(g.count).fill(Infinity) : null;
    const max = agg === 'max' ? new Float64Array(g.count).fill(-Infinity) : null;
    const first = agg === 'first' ? new Array(g.count) : null;
    for (let i = 0; i < src.length; i += 1) {
        if (mask !== null && mask[i] === 0) continue;
        const id = gid[i];
        cnt[id] += 1;
        if (agg === 'count') continue;
        const r = src[i];
        for (let k = 0; k < valueIdx.length; k += 1) {
            const raw = r[valueIdx[k]];
            if (first) { if (first[id] === undefined && raw !== null && raw !== undefined && raw !== '') first[id] = raw; continue; }
            const x = parseNum(raw);
            if (x === null) continue;
            n[id] += 1; sum[id] += x;
            if (min && x < min[id]) min[id] = x;
            if (max && x > max[id]) max[id] = x;
        }
    }
    // a qué grupo de la tabla corresponde cada renglón del análisis (una vez por tabla y llave, no por columna)
    let at = ctx ? ctx.base.get(g) : null;
    if (!at) {
        at = new Int32Array(rows.length);
        for (let i = 0; i < rows.length; i += 1) { const id = g.map.get(rows[i].tuple); at[i] = id === undefined ? -1 : id; }
        if (ctx) ctx.base.set(g, at);
    }
    const values = new Array(rows.length);
    for (let i = 0; i < rows.length; i += 1) {
        const id = at[i];
        if (id < 0 || cnt[id] === 0) { values[i] = null; continue; }
        if (agg === 'count') values[i] = cnt[id];
        else if (agg === 'first') values[i] = first[id] === undefined ? null : first[id];
        else if (!n[id]) values[i] = null;
        else if (agg === 'sum') values[i] = round6(sum[id]);
        else if (agg === 'avg') values[i] = round6(sum[id] / n[id]);
        else values[i] = agg === 'min' ? min[id] : max[id];
    }
    return { values };
}

// Arma la versión: { columns, rows, truncated } (el mismo formato que usan la pantalla y las columnas agregadas) o { error, field }.
// maxRows: cuántos renglones se arman como máximo (por omisión MAX_ROWS, que es lo que cabe en una versión guardada); En vivo y la descarga piden Infinity.
function buildExtractionV2(design, tables, { maxRows = MAX_ROWS } = {}) {
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
        if (rows.length >= maxRows) { truncated = true; break; }
        rows.push({ vals: base.map((b) => cellOf(r[idx.get(b.col)])), tuple: tk });
    }
    const columns = base.map((b) => ({ key: `ref_${b.col}`, group: 'reference', ...(DIM_KEYS.includes(b.col) ? { dim: b.col } : {}), label: baseTable.columns[idx.get(b.col)].label, isKey: true === b.key, srcCol: b.col }));
    const extra = [];
    const ctx = { base: new Map() }; // lo que comparten las columnas de esta versión
    for (const col of design.columns || []) {
        const out = columnValues(col, tables, design.baseRegistry, keyBase, rows, ctx);
        if (out.error) return out;
        const table = tables[col.registry];
        const vIdx = valueIndexes(col, table, indexOf(table));
        const def = { key: `c_${col.id}`, group: 'consulted', id: col.id, label: col.label, registry: col.registry, agg: col.agg, valueCols: vIdx.map((i) => table.columns[i].key) };
        // la columna que hoy es «la más reciente» (se ve al pasar el cursor por el encabezado; el encabezado en sí no cambia)
        if ((col.live || []).length) { def.live = col.live; def.liveTitle = (col.live || []).map((id) => resolveLiveIdx(table.columns, id)).filter((i) => i >= 0).map((i) => table.columns[i].label).join(' · '); }
        columns.push(def);
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

module.exports = { MAX_ROWS, AGGS2, norm, parseNum, buildExtractionV2, baseCounts, columnValues, resolveLiveIdx };
