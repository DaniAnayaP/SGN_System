'use strict';
// ---------------------------------------------------------------------------
// Pasar los análisis que leen un registro Mensual o Diaria a la tabla única que lo reemplaza (Daniel, 2026-11-27: «tú pasa los datos y pégalos como deben de estar»).
// Un análisis guarda las columnas por clave: de un registro mensual o diario son «unidad», «codigo»… y «p_2025_01» (un periodo); de una tabla libre son claves propias de cada columna. Aquí se convierte el diseño de cada análisis
// (el de siempre «anterior» o el «sin Diseño») y, ANTES de guardarlo, se arma el análisis de las dos formas (con el registro anterior y con la tabla nueva) y se comparan: solo se pasa el que sale IDÉNTICO.
// Lo que no se puede pasar (filtros del diseño anterior, una columna agregada que usa una columna de referencia, un periodo sin columna…) se queda leyendo el registro anterior y se avisa por qué.
// Lógica sin base de datos: las tablas llegan armadas (analysisSources.loadTable) y el armado es analysisBuild.buildExtractionV2.
// ---------------------------------------------------------------------------
const manual = require('./manualRegistries');
const manualAnalyses = require('./manualAnalyses');
const analysisBuild = require('./analysisBuild');

// Los nombres con que la copia dejó las seis columnas de referencia (registryMigrate.DIMS) → la clave que tenían en el registro anterior.
const DIM_BY_NAME = new Map([['unidad', 'unidad'], ['descripcion unidad', 'unidadNombre'], ['codigo', 'codigo'], ['descripcion', 'descripcion'], ['categoria', 'categoria'], ['udm', 'udm']]);
const periodOfColKey = (key) => { const m = /^p_(\d{4})_(\d{2})(?:_(\d{2}))?$/.exec(String(key || '')); return m ? `${m[1]}-${m[2]}${m[3] ? `-${m[3]}` : ''}` : null; };

// Las claves de la tabla nueva que equivalen a las del registro anterior: las seis de referencia (por su nombre) y cada periodo (por lo que dice el nombre de su columna).
// columns = las columnas de la tabla nueva (analysisSources.describe): { key, name, label, kind, period? }.
function keyMaps(columns) {
    const dims = {};
    const periods = new Map();
    columns.forEach((c) => {
        const fold = manual.fold(c.name || c.label || '');
        if (c.kind === 'text' && DIM_BY_NAME.has(fold) && dims[DIM_BY_NAME.get(fold)] === undefined) dims[DIM_BY_NAME.get(fold)] = c.key;
        if (c.kind === 'value' && c.period && !periods.has(c.period)) periods.set(c.period, c.key);
    });
    return { dims, periods };
}

const clone = (x) => JSON.parse(JSON.stringify(x));
// Cambia las claves de las columnas de referencia (ref_<viejo> → ref_<nuevo>) en lo que se guarda por clave: el aspecto y el acomodo de las columnas.
function renameRefKeys(design, renames) {
    const names = Object.keys(renames);
    if (!names.length) return;
    if (design.looks && typeof design.looks === 'object') {
        const out = {};
        Object.entries(design.looks).forEach(([k, v]) => { out[renames[k] || k] = v; });
        design.looks = out;
    }
    if (design.layout && typeof design.layout === 'object') {
        const ren = (k) => (renames[String(k).replace(/^an_/, '')] ? `an_${renames[String(k).replace(/^an_/, '')]}` : k);
        const list = (v) => (Array.isArray(v) ? v.map(ren) : v);
        const widths = {};
        Object.entries(design.layout.widths || {}).forEach(([k, w]) => { widths[ren(k)] = w; });
        design.layout = { ...design.layout, order: list(design.layout.order), hidden: list(design.layout.hidden), pinned: list(design.layout.pinned), widths };
    }
}

// Convierte UN diseño. raw = el diseño guardado; maps = keyMaps de la tabla nueva; registryKeys = los registros que existen. Devuelve:
//   { none: true }               el análisis no lee el registro anterior
//   { skip: 'CÓDIGO', detail? }  no se puede pasar (y por qué)
//   { design }                   el diseño nuevo, ya revisado (sin Diseño)
function repointDesign(raw, oldKey, newKey, maps, registryKeys) {
    const checked = manualAnalyses.normalizeDesign(raw, registryKeys);
    if (checked.error) return { skip: 'DESIGN' };
    const src = checked.design;
    if (!(src.registries || []).includes(oldKey)) return { none: true };
    if (src.legacy) {
        const f = src.filters || {};
        if ((f.unidades || []).length || (f.categorias || []).length || (f.codigos || []).length) return { skip: 'FILTERS' };
    }
    if (JSON.stringify(src.added || []).includes('"ref_')) return { skip: 'ADDED_REF' };
    const d = clone({ baseRegistry: src.baseRegistry, base: src.base, dedupe: src.dedupe, columns: src.columns, added: src.added, looks: src.looks || {}, layout: src.layout });
    const dim = (k) => (maps.dims[k] !== undefined ? maps.dims[k] : null);
    const renames = {};
    const baseWasOld = d.baseRegistry === oldKey;
    if (baseWasOld) {
        d.baseRegistry = newKey;
        for (const b of d.base) { const to = dim(b.col); if (!to) return { skip: 'COLUMN', detail: b.col }; renames[`ref_${b.col}`] = `ref_${to}`; b.col = to; }
    }
    for (const c of d.columns) {
        if (baseWasOld) c.keyMap.forEach((k) => { const to = dim(k.base); if (to) k.base = to; });
        if (c.registry !== oldKey) continue;
        c.registry = newKey;
        const valueCols = [];
        for (const v of c.valueCols) {
            const period = periodOfColKey(v);
            const to = period && maps.periods.get(period);
            if (!to) return { skip: 'PERIOD', detail: period || v };
            valueCols.push(to);
        }
        c.valueCols = valueCols;
        for (const k of c.keyMap) { const to = dim(k.file); if (!to) return { skip: 'COLUMN', detail: k.file }; k.file = to; }
        for (const x of c.conds) { const to = dim(x.col); if (!to) return { skip: 'COLUMN', detail: x.col }; x.col = to; }
        if ((c.live || []).length) {
            if (c.live.some((id) => id !== 'last') || !maps.periods.size) return { skip: 'LIVE' };
        }
    }
    renameRefKeys(d, renames);
    const next = manualAnalyses.normalizeDesign({ ...d, legacy: false }, registryKeys);
    if (next.error) return { skip: 'DESIGN', detail: next.error };
    return { design: next.design };
}

// Las llaves de la tabla nueva que pide el diseño existen de verdad (las claves de columnas que no están no se encuentran al armar).
function missingColumns(design, tables) {
    const has = (registry) => new Set(((tables[registry] || {}).columns || []).map((c) => c.key));
    const baseCols = has(design.baseRegistry);
    if (design.base.some((b) => !baseCols.has(b.col))) return 'base';
    for (const c of design.columns) {
        const cols = has(c.registry);
        if (c.valueCols.some((v) => !cols.has(v)) || c.conds.some((x) => !cols.has(x.col))) return c.id;
    }
    return null;
}

const round6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
// ¿Dos análisis armados salieron iguales? Mismas columnas (nombre y tipo), mismos renglones (sin importar el orden) y mismas cifras (a 6 decimales).
function sameBuilt(a, b) {
    if (!a || !b || a.error || b.error) return { ok: false, why: 'ERROR' };
    if (a.columns.length !== b.columns.length) return { ok: false, why: 'COLUMNS' };
    // el nombre de las columnas de referencia lo pone cada tabla (en inglés el registro anterior las llamaba «Unit», «Code»…): de esas solo importa que haya las mismas
    for (let i = 0; i < a.columns.length; i += 1) {
        const x = a.columns[i]; const y = b.columns[i];
        if (x.group !== y.group || (x.group !== 'reference' && String(x.label) !== String(y.label))) return { ok: false, why: 'COLUMNS', detail: String(x.label) };
    }
    if (a.rows.length !== b.rows.length) return { ok: false, why: 'ROWS', detail: `${a.rows.length} → ${b.rows.length}` };
    const sig = (rows) => rows.map((r) => r.map((v) => (v === null || v === undefined ? '' : round6(v))).join('\u0001')).sort();
    const x = sig(a.rows);
    const y = sig(b.rows);
    for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return { ok: false, why: 'VALUES' };
    return { ok: true };
}

// Arma el análisis con el diseño y las tablas dadas (sin las columnas agregadas: esas se calculan al presentar y no dependen del registro).
const build = (design, tables) => analysisBuild.buildExtractionV2(design, tables, { maxRows: Infinity });

module.exports = { keyMaps, repointDesign, missingColumns, sameBuilt, build, periodOfColKey, DIM_BY_NAME };
