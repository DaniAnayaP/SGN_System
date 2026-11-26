'use strict';
// ---------------------------------------------------------------------------
// Cargas Manuales › Registros Información: registros de TABLA LIBRE (Daniel, 2026-11-25, el reporte de existencias NOV-26: 140 mil renglones x 14 columnas).
// Un registro «libre» no tiene columnas fijas. Cada CARGA lleva su propia elección (no se recuerda de una carga a otra):
//   · «Tal cual» (mode 'asis'): se guarda el archivo con todas sus columnas, su orden y sus nombres; los renglones de cada carga se agregan aparte (cada carga es un bloque).
//   · «Elegir el papel de cada columna» (mode 'roles'): cada columna del Excel es
//       key   = LLAVE: identifica el renglón (si llega una combinación nueva se agrega un renglón abajo);
//       data  = DATO del renglón: se guarda la primera vez (nada ya cargado se modifica);
//       value = COLUMNA NUEVA: su valor llena una columna nueva (con el día y la hora de la carga en el nombre, o con el nombre fijo, p. ej. un mes);
//       skip  = no se carga.
//     Si varios renglones del Excel caen en la misma llave (porque una columna no es llave) los valores se juntan: agg 'sum' = suma, 'one' = se toma uno (avisa si traían valores distintos).
// Cada columna se puede renombrar al cargar. Lógica pura (sin base de datos: la base entra por `store`); la lectura del .xlsx es la de manualRegistries.js.
// ---------------------------------------------------------------------------
const manual = require('./manualRegistries.js');

const MAX_COLUMNS = 400;
const MAX_NAME = 60;
const MAX_ISSUES = 2000;
const BATCH = 2000;

const trim = (v) => String(v == null ? '' : v).trim();
const foldText = (v) => manual.fold(v);

// Lo que se ve de una celda, tal como viene en el archivo: texto, número (con todos sus decimales) o fecha (AAAA-MM-DD, con hora si la trae). Vacío = null.
function displayCell(v) {
    if (v === undefined || v === null) return null;
    if (v instanceof Date) {
        if (Number.isNaN(v.getTime())) return null;
        const iso = v.toISOString();
        return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ');
    }
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    const text = String(v).trim();
    return text === '' ? null : text;
}
const textOf = (v) => { const d = displayCell(v); return d === null ? '' : String(d); };
const headerText = (v) => (v instanceof Date ? (manual.periodLabel(manual.parsePeriodHeader(v) || '') || textOf(v)) : trim(textOf(v)));

// El renglón de títulos: el primero de los primeros 30 con al menos dos celdas llenas y casi todas de texto.
function findHeader(top) {
    for (const r of top.slice(0, 30)) {
        const cells = r.values.filter((v) => displayCell(v) !== null);
        if (cells.length < 2) continue;
        const texts = cells.filter((v) => typeof v === 'string' || v instanceof Date).length;
        if (texts / cells.length >= 0.7) return r;
    }
    return null;
}

// Una sugerencia de papel para cada columna (la persona la puede cambiar): los meses son columnas nuevas con su nombre fijo; los códigos, unidades, lotes y ubicaciones son llave;
// las cantidades, costos e importes son columnas nuevas en cada carga; lo demás es dato.
const KEY_WORDS = /(^| )(unidad|unit|codigo|code|sku|item|articulo|lote|lot number|locator|localizador|subinv|subinventory|subinventario)( |$)/;
const NOT_KEY_WORDS = /(type|tipo|desc|name|nombre|date|fecha|expir|period)/;
const VALUE_WORDS = /(qty|cantidad|existencia|stock|on hand|importe|costo|cost|monto|total)/;
function suggestRole(text, rawValue, sampleValues) {
    if (rawValue instanceof Date || manual.parsePeriodHeader(rawValue)) return { role: 'value', agg: 'sum', stampName: false };
    const f = foldText(text);
    const filled = sampleValues.filter((v) => v !== null && v !== undefined);
    const numeric = filled.length > 0 && filled.filter((v) => typeof v === 'number').length / filled.length >= 0.6; // casi todos números (un «n/a» suelto no la desacomoda)
    if (VALUE_WORDS.test(f) && numeric) return { role: 'value', agg: /(cost|costo|precio|price)/.test(f) ? 'one' : 'sum', stampName: true };
    if (KEY_WORDS.test(f) && !NOT_KEY_WORDS.test(f)) return { role: 'key', agg: 'sum', stampName: true };
    return { role: 'data', agg: 'sum', stampName: true };
}

// El archivo a la vista antes de cargar: sus hojas, el renglón de títulos, las columnas (con su papel sugerido) y unos renglones de ejemplo. No escribe nada.
async function inspect(buffer, { sheet } = {}) {
    const book = await manual.openWorkbook(buffer);
    if (book.error) return { error: book.error };
    const tops = new Map();
    const sheets = [];
    for (const s of book.sheets) {
        let rows = 0;
        const top = [];
        await manual.streamSheet(book, s.path, { onDimension: (ref) => { const m = /:?[A-Za-z]+(\d+)$/.exec(String(ref || '')); rows = m ? Number(m[1]) : 0; }, onRow: (number, values) => { top.push({ number, values }); return top.length < 40; } });
        const header = findHeader(top);
        tops.set(s.name, { top, header });
        sheets.push({ name: s.name, rows: rows || top.length, hasHeader: !!header });
    }
    const chosen = sheets.find((s) => s.name === sheet) || sheets.reduce((best, s) => ((s.hasHeader && !best.hasHeader) || (s.hasHeader === best.hasHeader && s.rows > best.rows) ? s : best), sheets[0]);
    const { top, header } = tops.get(chosen.name);
    if (!header) return { sheets, sheet: chosen.name, error: 'IMPORT_HEADERS', missing: [] };
    const after = top.filter((r) => r.number > header.number);
    const headers = [];
    header.values.forEach((v, index) => {
        const text = headerText(v);
        if (!text) return;
        const samples = after.slice(0, 20).map((r) => (r.values[index] === undefined ? null : r.values[index]));
        headers.push({ index, text, suggest: suggestRole(text, v, samples) });
    });
    if (headers.length > MAX_COLUMNS) return { sheets, sheet: chosen.name, error: 'IMPORT_TOO_MANY_COLUMNS' };
    const sample = after.slice(0, 5).map((r) => ({ line: r.number, values: headers.map((h) => { const d = displayCell(r.values[h.index]); return d === null ? '' : String(d); }) }));
    return { sheets, sheet: chosen.name, headerRow: header.number, headers, sample, rowsDeclared: chosen.rows };
}

// La elección que manda el navegador, revisada. Devuelve { cfg } o { error, detail }.
function parseConfig(raw, headerCount = MAX_COLUMNS) {
    let c;
    try { c = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return { error: 'FLEX_CONFIG' }; }
    if (!c || typeof c !== 'object') return { error: 'FLEX_CONFIG' };
    const mode = c.mode === 'roles' ? 'roles' : 'asis';
    if (!Array.isArray(c.columns) || !c.columns.length || c.columns.length > MAX_COLUMNS) return { error: 'FLEX_CONFIG' };
    const seenIdx = new Set();
    const seenName = new Set();
    const columns = [];
    for (const col of c.columns) {
        if (!col || !Number.isInteger(col.i) || col.i < 0 || col.i > 2000 || seenIdx.has(col.i)) return { error: 'FLEX_CONFIG' };
        seenIdx.add(col.i);
        const role = mode === 'asis' ? 'data' : (['key', 'data', 'value', 'skip'].includes(col.role) ? col.role : 'skip');
        const name = trim(col.name).replace(/\s+/g, ' ').slice(0, MAX_NAME) || `Columna ${columns.length + 1}`;
        if (role !== 'skip') {
            const f = foldText(name);
            if (seenName.has(f)) return { error: 'FLEX_DUP_NAME', detail: name };
            seenName.add(f);
        }
        columns.push({ i: col.i, name, role, agg: col.agg === 'one' ? 'one' : 'sum', stampName: col.stampName !== false });
    }
    columns.sort((a, b) => a.i - b.i);
    if (mode === 'roles' && !columns.some((x) => x.role === 'key')) return { error: 'FLEX_NO_KEY' };
    if (mode === 'asis' && columns.length === 0) return { error: 'FLEX_CONFIG' };
    return { cfg: { mode, columns } };
}

// La llave de un renglón: los nombres y valores de sus columnas llave, en orden de nombre (así dos cargas con la misma llave coinciden aunque traigan las columnas en otro orden).
const keyTextOf = (pairs) => JSON.stringify(pairs.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
const sameNumber = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

// Lee el archivo y arma lo que se va a guardar (sin tocar la base). Devuelve { error } o
//   asis : { mode, rowsInFile, blank, rows: [[celdas…]], columns: [nombres] }
//   roles: { mode, rowsInFile, blank, groups: Map(keyText → { cells: {nombre: valor}, values: [suma/uno por columna de valor], seen: [bool], line }), valueCols, cellCols, merged, errors, different, issues, issuesTotal }
async function readRows(buffer, { sheet, headerRow }, cfg) {
    const book = await manual.openWorkbook(buffer);
    if (book.error) return { error: book.error };
    const target = book.sheets.find((s) => s.name === sheet) || book.sheets[0];
    const cols = cfg.columns.filter((c) => c.role !== 'skip');
    const keyCols = cols.filter((c) => c.role === 'key');
    const dataCols = cols.filter((c) => c.role === 'data');
    const valueCols = cols.filter((c) => c.role === 'value');
    const cellCols = cols.filter((c) => c.role === 'key' || c.role === 'data');
    const out = { mode: cfg.mode, rowsInFile: 0, blank: 0, errors: 0, different: 0, merged: 0, issues: [], issuesTotal: 0 };
    const addIssue = (issue) => { out.issuesTotal += 1; if (out.issues.length < MAX_ISSUES) out.issues.push(issue); };
    let tooBig = false;
    if (cfg.mode === 'asis') {
        out.rows = [];
        out.columns = cols.map((c) => c.name);
        await manual.streamSheet(book, target.path, {
            onRow: (number, values) => {
                if (number <= headerRow) return true;
                const row = cols.map((c) => displayCell(values[c.i]));
                if (row.every((v) => v === null)) { out.blank += 1; return true; }
                if (out.rows.length >= manual.MAX_DATA_ROWS) { tooBig = true; return false; }
                out.rows.push(row);
                return true;
            },
        });
        out.rowsInFile = out.rows.length;
        if (tooBig) return { error: 'IMPORT_TOO_BIG' };
        return out;
    }
    out.groups = new Map();
    out.cellCols = cellCols;
    out.valueCols = valueCols;
    await manual.streamSheet(book, target.path, {
        onRow: (number, values) => {
            if (number <= headerRow) return true;
            const keyVals = keyCols.map((c) => textOf(values[c.i]));
            const anyCell = cols.some((c) => displayCell(values[c.i]) !== null);
            if (!anyCell) { out.blank += 1; return true; }
            if (keyVals.every((v) => v === '')) { out.blank += 1; return true; } // sin llave no hay renglón
            if (out.rowsInFile >= manual.MAX_DATA_ROWS) { tooBig = true; return false; }
            out.rowsInFile += 1;
            const keyText = keyTextOf(keyCols.map((c, k) => [c.name, keyVals[k]]));
            let g = out.groups.get(keyText);
            if (!g) {
                const cells = {};
                cellCols.forEach((c) => { const d = displayCell(values[c.i]); cells[foldText(c.name)] = d === null ? '' : String(d); }); // se guardan por nombre en minúsculas y sin acentos: dos cargas que lo escriban distinto siguen siendo la misma columna
                g = { cells, values: valueCols.map(() => null), line: number, count: 0 };
                out.groups.set(keyText, g);
            } else out.merged += 1;
            g.count += 1;
            valueCols.forEach((c, k) => {
                const raw = values[c.i];
                if (raw === undefined || raw === null) return; // celda vacía: no hay dato
                const n = manual.parseNumber(raw);
                if (n === undefined) return; // vacío: no hay dato
                if (n === null) { out.errors += 1; addIssue({ line: number, kind: 'error', problem: 'bad_number', column: c.name, file: textOf(raw) }); return; }
                if (g.values[k] === null) g.values[k] = n;
                else if (c.agg === 'sum') g.values[k] += n;
                else if (!sameNumber(g.values[k], n)) { out.different += 1; addIssue({ line: number, kind: 'warn', problem: 'diff_one', column: c.name, file: n, saved: g.values[k] }); }
            });
            return true;
        },
    });
    if (tooBig) return { error: 'IMPORT_TOO_BIG' };
    return out;
}

const periodNameKey = (name) => `n:${foldText(name)}`;

// Corre (o ensaya) una carga. `store` pone la base:
//   store.existingKeys(): Map(keyText → rowId) de los renglones del registro      store.namedValues(colKey): Map(rowId → valor) de lo vigente en una columna de nombre fijo
//   store.addRows(array de { keyText, cells }) → array de rowIds                    store.addValues(array de [rowId, colKey, valor])
//   store.saveBlock(rows, columns) (tal cual)
// loadId (de la carga que se está haciendo) sirve para el nombre de las columnas nuevas por carga: «m:<loadId>:<índice>».
async function run(buffer, options, cfg, store, loadId, { dryRun = false } = {}) {
    const read = await readRows(buffer, options, cfg);
    if (read.error) return { error: read.error };
    const summary = { mode: cfg.mode, rowsInFile: read.rowsInFile, blank: read.blank, sheet: options.sheet };
    if (cfg.mode === 'asis') {
        Object.assign(summary, { newRows: read.rows.length, valuesAdded: read.rows.length, added: read.rows.length, untouched: 0, different: 0, errors: 0, merged: 0, columns: read.columns, groups: read.rows.length, issuesTotal: 0 });
        if (!dryRun && read.rows.length) store.saveBlock(read.rows, read.columns);
        return { summary, issues: [] };
    }
    const existing = store.existingKeys();
    const named = new Map();
    read.valueCols.forEach((c) => { if (!c.stampName) named.set(c.name, store.namedValues(periodNameKey(c.name))); });
    let newRows = 0; let valuesAdded = 0; let untouched = 0; let different = read.different;
    const issues = read.issues.slice();
    let issuesTotal = read.issuesTotal;
    const colKeyOf = (c, k) => (c.stampName ? `m:${loadId}:${k}` : periodNameKey(c.name));
    const pendingRows = [];
    const valueOps = [];
    const flushRows = () => {
        if (!pendingRows.length) return;
        if (!dryRun) {
            const ids = store.addRows(pendingRows.map((p) => ({ keyText: p.keyText, cells: p.cells })));
            pendingRows.forEach((p, i) => { p.group.rowId = ids[i]; });
        }
        pendingRows.length = 0;
    };
    const groups = [...read.groups.entries()];
    for (let at = 0; at < groups.length; at += BATCH) {
        const slice = groups.slice(at, at + BATCH);
        slice.forEach(([keyText, g]) => {
            let rowId = existing.get(keyText);
            if (rowId === undefined) { newRows += 1; pendingRows.push({ keyText, cells: g.cells, group: g }); } else g.rowId = rowId;
        });
        flushRows();
        slice.forEach(([, g]) => {
            read.valueCols.forEach((c, k) => {
                const v = g.values[k];
                if (v === null) return;
                if (!c.stampName) {
                    const saved = g.rowId === undefined ? undefined : named.get(c.name).get(g.rowId);
                    if (saved !== undefined) {
                        if (sameNumber(saved, v)) untouched += 1;
                        else { different += 1; issuesTotal += 1; if (issues.length < MAX_ISSUES) issues.push({ line: g.line, kind: 'warn', problem: 'kept_other', column: c.name, file: v, saved }); }
                        return;
                    }
                }
                valuesAdded += 1;
                if (!dryRun) valueOps.push([g.rowId, colKeyOf(c, k), v]);
            });
        });
        if (!dryRun && valueOps.length) { store.addValues(valueOps.splice(0, valueOps.length)); }
    }
    Object.assign(summary, { newRows, valuesAdded, added: newRows + valuesAdded, untouched, different, errors: read.errors, merged: read.merged, groups: groups.length, columns: read.cellCols.map((c) => c.name), valueColumns: read.valueCols.map((c) => c.name), issuesTotal });
    return { summary, issues };
}

// ---- la tabla que se ve: las columnas salen de las cargas vigentes ----------------------------------------------------------------------------------------------
const MONTHS = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] };
const pad2 = (n) => String(n).padStart(2, '0');
// 'AAAA-MM-DD HH:MM:SS' (UTC) → «26/nov 06:00» en la hora de quien mira (tz = minutos que su hora va detrás de UTC, como Date.getTimezoneOffset()); con withYear lleva el año («26/nov/26 06:00»)
function stampLabel(stamp, tz = 0, lang = 'es', withYear = false) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(stamp || ''));
    if (!m) return '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - (Number(tz) || 0) * 60000);
    return `${pad2(d.getUTCDate())}/${MONTHS[lang === 'en' ? 'en' : 'es'][d.getUTCMonth()]}${withYear ? `/${pad2(d.getUTCFullYear() % 100)}` : ''} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}
// Las columnas de la tabla: las de TODAS las cargas vigentes, en el orden en que cada una apareció por primera vez (cada columna se queda en el lugar que tenía en el Excel). Una columna nueva por carga se abre en una columna por carga
// (nombre + día y hora; si dos cargas tienen la misma etiqueta, la segunda lleva «(2)»); una columna de nombre fijo (p. ej. un mes) es una sola. Si hay cargas «tal cual» se agrega al final la columna «Carga».
// loads: [{ id, stamp, config: { mode, columns } }] en orden de carga. Devuelve { columns: [{ key, label, group, kind, name, loadId?, srcKey? }], hasAsis, labels: Map(loadId → etiqueta) }.
function buildColumns(loads, { tz = 0, lang = 'es' } = {}) {
    const years = new Set(loads.map((l) => String(l.stamp || '').slice(0, 4)).filter(Boolean));
    const withYear = years.size > 1;
    const slots = [];
    const slotAt = new Map();
    const labelsSeen = new Map();
    const loadLabels = new Map();
    let hasAsis = false;
    const slot = (key, make) => { let i = slotAt.get(key); if (i === undefined) { i = slots.length; slots.push(make()); slotAt.set(key, i); } return slots[i]; };
    const uniqueLabel = (base) => { const n = (labelsSeen.get(base) || 0) + 1; labelsSeen.set(base, n); return n === 1 ? base : `${base} (${n})`; };
    loads.forEach((load) => {
        const cfg = load.config;
        if (!cfg || !Array.isArray(cfg.columns)) return;
        const loadStamp = stampLabel(load.stamp, tz, lang, withYear);
        if (cfg.mode === 'asis') { hasAsis = true; loadLabels.set(load.id, uniqueLabel(`@${loadStamp}`).replace(/^@/, '')); }
        let k = 0;
        cfg.columns.forEach((c) => {
            if (c.role === 'skip') return;
            const f = foldText(c.name);
            if (c.role === 'value') {
                const myK = k; k += 1;
                if (c.stampName) {
                    const s = slot(`f:${f}`, () => ({ type: 'family', name: c.name, cols: [] }));
                    s.cols.push({ kind: 'value', group: 'value', name: c.name, loadId: load.id, srcKey: `m:${load.id}:${myK}`, label: uniqueLabel(`${c.name} ${loadStamp}`) });
                } else {
                    slot(`n:${f}`, () => ({ type: 'single', col: { kind: 'value', group: 'value', name: c.name, srcKey: periodNameKey(c.name), label: c.name } }));
                }
            } else {
                slot(`c:${f}`, () => ({ type: 'single', col: { kind: 'cell', group: c.role === 'key' ? 'key' : 'data', name: c.name, srcKey: `c:${f}`, label: c.name } }));
            }
        });
    });
    const flat = [];
    slots.forEach((s) => { if (s.type === 'family') flat.push(...s.cols); else flat.push(s.col); });
    if (hasAsis) flat.push({ kind: 'carga', group: 'load', name: 'Carga', srcKey: 'carga', label: 'Carga' });
    flat.forEach((c, i) => { c.key = `c${i}`; });
    return { columns: flat, hasAsis, labels: loadLabels };
}

// ---- el filtro por columna de la pantalla (cf = { f: { columna: [valores] }, r: { columna: regla } }), aplicado a TODOS los renglones: la misma regla de la pantalla (SearchSyntax) sobre lo que se ve ----
const SearchSyntax = require('./public/SearchSyntax.js');
const MAX_FILTER_VALUES = 400;
const MAX_FILTER_TEXT = 200;
const MAX_FILTER_JSON = 60000;
const ruleNumber = (value) => { const s = String(value ?? '').trim().replace(/[$,\s%]/g, ''); return s === '' || !/^-?\d+(\.\d+)?$/.test(s) ? null : Number(s); };
const shownOf = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
// matches(get): get(índice de columna) da lo que trae el renglón en esa columna (texto, número o null)
function parseFilter(raw, columns) {
    if (raw === undefined || raw === null || raw === '') return { filter: null };
    if (typeof raw !== 'string' || raw.length > MAX_FILTER_JSON) return { error: 'BAD_FILTER' };
    let spec;
    try { spec = JSON.parse(raw); } catch { return { error: 'BAD_FILTER' }; }
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return { error: 'BAD_FILTER' };
    const sets = spec.f && typeof spec.f === 'object' && !Array.isArray(spec.f) ? spec.f : {};
    const rules = spec.r && typeof spec.r === 'object' && !Array.isArray(spec.r) ? spec.r : {};
    const keys = [...new Set([...Object.keys(sets), ...Object.keys(rules)])];
    if (keys.length > 80) return { error: 'BAD_FILTER' };
    const indexOf = new Map(columns.map((c, i) => [c.key, i]));
    const conds = [];
    for (const key of keys) {
        const idx = indexOf.get(key);
        if (idx === undefined) continue;
        const cond = { idx };
        if (Array.isArray(sets[key])) {
            if (sets[key].length > MAX_FILTER_VALUES) return { error: 'BAD_FILTER' };
            cond.set = new Set(sets[key].map((v) => String(v).slice(0, MAX_FILTER_TEXT)));
        }
        const rule = rules[key];
        if (rule && typeof rule === 'object') {
            if (rule.kind === 'text') {
                const text = String(rule.text || '').slice(0, MAX_FILTER_TEXT);
                if (SearchSyntax.split(text).length) cond.test = SearchSyntax.compile(['startsWith', 'equals'].includes(rule.mode) ? rule.mode : 'contains', text);
            } else if (rule.kind === 'range') {
                const lo = ruleNumber(rule.from);
                const hi = ruleNumber(rule.to);
                if (lo !== null || hi !== null) cond.range = { lo, hi };
            }
        }
        if (cond.set || cond.test || cond.range) conds.push(cond);
    }
    if (!conds.length) return { filter: null };
    const matches = (get) => {
        for (const c of conds) {
            const shown = shownOf(get(c.idx));
            if (c.set && !c.set.has(shown)) return false;
            if (c.test && !c.test(shown)) return false;
            if (c.range) {
                const n = ruleNumber(shown);
                if (n === null) return false;
                if ((c.range.lo !== null && n < c.range.lo) || (c.range.hi !== null && n > c.range.hi)) return false;
            }
        }
        return true;
    };
    return { filter: { conds, matches } };
}

const foldName = (name) => foldText(name);
module.exports = { inspect, parseConfig, run, readRows, displayCell, textOf, periodNameKey, keyTextOf, foldName, stampLabel, buildColumns, parseFilter, shownOf, MAX_COLUMNS, MAX_NAME, MAX_ISSUES };
