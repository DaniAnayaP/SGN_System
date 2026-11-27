'use strict';
// ---------------------------------------------------------------------------
// Análisis sin Diseño (Daniel, 2026-11-26, «constrúyelo todo de una vez»): las tablas de donde el Análisis toma sus datos.
// Cualquier registro (mensual, diario o de tabla libre) se ve igual: { columns: [{ key, label, kind }], rows: [[celdas en el orden de las columnas]] }.
//   · mensual / diario: las 6 columnas fijas (unidad, descripción de la unidad, código, descripción, categoría, UDM) y una columna por cada periodo cargado (p_AAAA_MM o p_AAAA_MM_DD).
//   · tabla libre: las columnas de datos y de valor de sus cargas vigentes (flexRegistries.buildColumns) y sus renglones (los que tienen llave y la última carga «tal cual»).
// Una tabla se guarda unos segundos en memoria (firma = lo que cambia cuando se carga o se anula algo) para que armar una columna y ver sus valores no relea los 140 mil renglones.
// ---------------------------------------------------------------------------
const db = require('./db');
const manual = require('./manualRegistries');
const flex = require('./flexRegistries');

const DIMS = manual.DIMS;
const MAX_TABLE_ROWS = 400000;
const CACHE_MS = 30000;
const CACHE_MAX = 8;
const cache = new Map();

const periodColKey = (period) => `p_${String(period).replace(/-/g, '_')}`;
const periodOfColKey = (key) => { const m = /^p_(\d{4})_(\d{2})(?:_(\d{2}))?$/.exec(String(key || '')); return m ? `${m[1]}-${m[2]}${m[3] ? `-${m[3]}` : ''}` : null; };
const isFlex = (registry) => registry && registry.kind === 'tabla';

// Lo que cambia cuando cambian los datos del registro (cargas vigentes y sus periodos).
function signatureOf(clientId, isTest, registry) {
    if (isFlex(registry)) return JSON.stringify(db.flexVigenteLoads(clientId, isTest, registry.key).map((l) => [l.id, l.stamp, JSON.stringify(l.config)]));
    const last = db.registryLastLoad(clientId, isTest, registry.key);
    return JSON.stringify([last ? last.id : 0, db.registryPeriods(clientId, isTest, registry.key)]);
}

// ---- columnas (barato: no lee renglones) ----------------------------------------------------------------------------------------------------------------------
function periodicColumns(clientId, isTest, registry, lang) {
    const labels = manual.exportDimHeaders(lang);
    const dims = DIMS.map((d, i) => ({ key: d, label: labels[i], kind: 'dim' }));
    const periods = db.registryPeriods(clientId, isTest, registry.key);
    return [...dims, ...periods.map((p) => ({ key: periodColKey(p), label: manual.periodLabel(p, lang), kind: 'value', period: p }))];
}
function flexColumns(clientId, isTest, registry, lang) {
    const loads = db.flexVigenteLoads(clientId, isTest, registry.key);
    const built = flex.buildColumns(loads, { tz: 0, lang });
    return { loads, built, columns: built.columns.map((c) => ({ key: c.sid, label: c.label, kind: c.kind === 'value' ? 'value' : (c.kind === 'carga' ? 'load' : 'text'), group: c.group, cls: c.cls || '' })) };
}
function describe(clientId, isTest, registry, lang = 'es') {
    return isFlex(registry) ? flexColumns(clientId, isTest, registry, lang).columns : periodicColumns(clientId, isTest, registry, lang);
}

// ---- renglones ----------------------------------------------------------------------------------------------------------------------------------------------
function loadPeriodic(clientId, isTest, registry, lang) {
    const columns = periodicColumns(clientId, isTest, registry, lang);
    const periods = columns.filter((c) => c.period).map((c) => c.period);
    const map = periods.length ? db.registrySources(clientId, isTest, registry.key, periods, {}) : new Map();
    const rows = [];
    for (const entry of map.values()) {
        if (rows.length >= MAX_TABLE_ROWS) break;
        rows.push([...DIMS.map((d) => entry.dims[d] || ''), ...periods.map((p) => (entry.values[p] === undefined ? null : entry.values[p]))]);
    }
    return { columns, rows, truncated: map.size > rows.length };
}
function loadFlex(clientId, isTest, registry, lang) {
    const { loads, built, columns } = flexColumns(clientId, isTest, registry, lang);
    const cols = built.columns;
    const rolesLoads = loads.filter((l) => l.config && l.config.mode === 'roles');
    const asisLoads = loads.filter((l) => l.config && l.config.mode === 'asis');
    const scopeAsis = asisLoads.slice(-1);
    const rows = [];
    let truncated = false;
    const loadIds = rolesLoads.map((l) => l.id);
    if (loadIds.length) {
        let afterId = 0;
        outer: for (;;) {
            const batch = db.flexListRows(clientId, isTest, registry.key, loadIds, { afterId, limit: 5000 });
            if (!batch.length) break;
            afterId = batch[batch.length - 1].id;
            const vals = db.flexValuesFor(batch.map((x) => x.id), loadIds);
            for (const r of batch) {
                if (rows.length >= MAX_TABLE_ROWS) { truncated = true; break outer; }
                const mine = vals.get(r.id);
                rows.push(cols.map((c) => {
                    if (c.kind === 'cell') { const v = r.cells[c.srcKey.slice(2)]; return v === undefined || v === '' ? null : v; }
                    if (c.kind === 'value') { const v = mine && mine.get(c.srcKey); return v === undefined ? null : v; }
                    return null;
                }));
            }
        }
    }
    const colByName = new Map();
    cols.forEach((c, i) => { if (c.kind === 'cell') colByName.set(c.srcKey.slice(2), i); });
    const cargaIdx = cols.findIndex((c) => c.kind === 'carga');
    for (const load of scopeAsis) {
        const block = db.flexBlock(load.id);
        if (!block) continue;
        const label = built.labels.get(load.id);
        const map = block.columns.map((name) => colByName.get(flex.foldName(name)));
        for (const row of block.rows) {
            if (rows.length >= MAX_TABLE_ROWS) { truncated = true; break; }
            const cells = new Array(cols.length).fill(null);
            map.forEach((ci, k) => { if (ci !== undefined) cells[ci] = row[k] === undefined ? null : row[k]; });
            if (cargaIdx >= 0) cells[cargaIdx] = label;
            rows.push(cells);
        }
    }
    return { columns, rows, truncated };
}
// La tabla completa del registro (con una pequeña memoria de unos segundos).
function loadTable(clientId, isTest, registry, lang = 'es') {
    const id = `${clientId}|${isTest ? 1 : 0}|${registry.key}|${lang}`;
    const signature = signatureOf(clientId, isTest, registry);
    const hit = cache.get(id);
    if (hit && hit.signature === signature && Date.now() - hit.at < CACHE_MS) return hit.table;
    const table = isFlex(registry) ? loadFlex(clientId, isTest, registry, lang) : loadPeriodic(clientId, isTest, registry, lang);
    cache.set(id, { signature, at: Date.now(), table });
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return table;
}
function clearCache() { cache.clear(); }

// Los valores distintos de una columna (para elegirlos en una condición): { values: [texto], complete }.
const compareText = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
function distinctValues(table, colKey, { limit = 500, query = '' } = {}) {
    const idx = table.columns.findIndex((c) => c.key === colKey);
    if (idx < 0) return null;
    const q = manual.fold(query);
    const seen = new Set();
    for (const row of table.rows) {
        const v = row[idx];
        if (v === null || v === undefined || v === '') continue;
        const text = typeof v === 'string' ? v : String(v);
        if (q && !manual.fold(text).includes(q)) continue;
        seen.add(text);
        if (seen.size > limit * 4) break;
    }
    const all = [...seen].sort(compareText);
    return { values: all.slice(0, limit), complete: all.length <= limit && seen.size <= limit * 4 };
}

// ---- Claves estables (Daniel, 2026-11-26) ----
// Las columnas de una tabla libre se llamaban c0, c1… (por su posición): una carga con una columna nueva de llave o de dato recorría las de valor y un análisis leía OTRA columna sin avisar.
// Ahora cada una tiene una clave que sale de su identidad (flexRegistries.stableColumnId). Esto convierte las claves viejas de un diseño según las posiciones de HOY (no se puede saber más); si ya están convertidas no hace nada.
const LEGACY_KEY = /^c\d+$/;
function legacyMapFor(clientId, isTest, regKey, memo) {
    if (memo.has(regKey)) return memo.get(regKey);
    let map = null;
    if (!memo.has('\u0000defs')) memo.set('\u0000defs', db.listRegistryDefs(clientId, isTest));
    if (memo.get('\u0000defs').some((d) => d.key === regKey && d.kind === 'tabla')) {
        const built = flex.buildColumns(db.flexVigenteLoads(clientId, isTest, regKey), { tz: 0, lang: 'es' });
        map = new Map(built.columns.map((c) => [c.key, c.sid]));
    }
    memo.set(regKey, map);
    return map;
}
// Cambia el diseño que recibe (si trae claves viejas) y dice si cambió.
function upgradeDesign(clientId, isTest, design, memo = new Map()) {
    if (!design || !Array.isArray(design.columns) || !design.baseRegistry) return false;
    let changed = false;
    const conv = (reg, key) => {
        if (!LEGACY_KEY.test(String(key))) return key;
        const map = legacyMapFor(clientId, isTest, reg, memo);
        const to = map && map.get(key);
        if (to && to !== key) { changed = true; return to; }
        return key;
    };
    (Array.isArray(design.base) ? design.base : []).forEach((b) => { if (b) b.col = conv(design.baseRegistry, b.col); });
    design.columns.forEach((c) => {
        if (!c) return;
        if (Array.isArray(c.valueCols)) c.valueCols = c.valueCols.map((k) => conv(c.registry, k));
        if (Array.isArray(c.keyMap)) c.keyMap.forEach((k) => { if (k) { k.base = conv(design.baseRegistry, k.base); k.file = conv(c.registry, k.file); } });
        if (Array.isArray(c.conds)) c.conds.forEach((x) => { if (x) x.col = conv(c.registry, x.col); });
    });
    return changed;
}
// Convierte (y guarda) el análisis que se acaba de leer.
function upgradeAnalysis(analysis, clientId, isTest) {
    if (analysis && upgradeDesign(clientId, isTest, analysis.design)) db.setAnalysisDesignRaw(analysis.id, analysis.design);
    return analysis;
}
// Al arrancar: convierte todos los análisis que todavía traen claves viejas.
function upgradeStoredKeys() {
    let n = 0;
    for (const row of db.listAnalysisDesigns()) {
        if (upgradeDesign(row.clientId, row.isTest, row.design)) { db.setAnalysisDesignRaw(row.id, row.design); n += 1; }
    }
    if (n) console.log(`[análisis] Claves de columna estables: se convirtieron ${n} análisis.`);
    return n;
}

module.exports = { upgradeDesign, upgradeAnalysis, upgradeStoredKeys, DIMS, periodColKey, periodOfColKey, isFlex, describe, loadTable, clearCache, distinctValues, MAX_TABLE_ROWS };
