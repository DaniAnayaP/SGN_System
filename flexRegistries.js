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
const MAX_CLASS = 40; // el nombre de una clasificación de columnas
const CLASS_COLORS = 6; // los colores de la paleta (0 a 5)
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

// ¿El nombre de la columna ya trae una fecha o una hora («EXIST 25-NOV 06:00», «Consumo 25/11/2026»)? Entonces no se le pega, además, el día y la hora de la carga: saldría la fecha dos veces.
const MONTH_WORD = '(?:ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t(?:iembre)?)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?|jan(?:uary)?|apr(?:il)?|aug(?:ust)?|dec(?:ember)?)';
const DATE_IN_NAME = [
    new RegExp(`\\b\\d{1,2}\\s*[-/. ]\\s*${MONTH_WORD}\\b`),   // 25-nov, 25/nov, 25 nov
    new RegExp(`\\b${MONTH_WORD}\\s*[-/. ]\\s*\\d{1,4}\\b`),   // nov-25, nov 25
    /\b\d{1,2}:\d{2}\b/,                                       // 06:00
    /\b\d{4}-\d{1,2}-\d{1,2}\b/,                               // 2026-11-25
    /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/,                      // 25/11/2026
];
const nameHasDate = (name) => { const f = String(name == null ? '' : name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return DATE_IN_NAME.some((re) => re.test(f)); };

// Una sugerencia de papel para cada columna (la persona la puede cambiar): los meses son columnas nuevas con su nombre fijo; los códigos, unidades, lotes y ubicaciones son llave;
// las cantidades, costos e importes son columnas nuevas en cada carga; lo demás es dato.
const KEY_WORDS = /(^| )(unidad|unit|codigo|code|sku|item|articulo|lote|lot number|locator|localizador|subinv|subinventory|subinventario)( |$)/;
const NOT_KEY_WORDS = /(type|tipo|desc|name|nombre|date|fecha|expir|period)/;
const VALUE_WORDS = /(qty|cantidad|existencia|stock|on hand|importe|costo|cost|monto|total)/;
function suggestRole(text, rawValue, sampleValues) {
    if (rawValue instanceof Date || manual.parsePeriodHeader(rawValue)) return { role: 'value', agg: 'sum', stampName: false };
    // «Con día y hora en el nombre» viene APAGADA (Daniel, 2026-11-27, «apágala por omisión»): la columna se llama como la persona la nombró; quien quiere una columna nueva por cada carga (existencias del día) marca la casilla,
    // y de ahí en adelante el registro la recuerda (una columna que ya tuvo carga toma lo que se eligió entonces: ver prefillHeaders).
    const stampName = false;
    const f = foldText(text);
    const filled = sampleValues.filter((v) => v !== null && v !== undefined);
    const numeric = filled.length > 0 && filled.filter((v) => typeof v === 'number').length / filled.length >= 0.6; // casi todos números (un «n/a» suelto no la desacomoda)
    if (VALUE_WORDS.test(f) && numeric) return { role: 'value', agg: /(cost|costo|precio|price)/.test(f) ? 'one' : 'sum', stampName };
    if (KEY_WORDS.test(f) && !NOT_KEY_WORDS.test(f)) return { role: 'key', agg: 'sum', stampName };
    return { role: 'data', agg: 'sum', stampName };
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
        // la clasificación (nombre y color) que la persona le pone a la columna, además de su papel
        const cls = trim(col.cls).replace(/\s+/g, ' ').slice(0, MAX_CLASS);
        const color = cls && Number.isInteger(col.color) && col.color >= 0 && col.color < CLASS_COLORS ? col.color : null;
        // el título que traía la columna en el Excel (se guarda con la carga para emparejar la siguiente por ese título, aunque la columna se haya renombrado)
        const src = trim(col.src).replace(/\s+/g, ' ').slice(0, 120);
        columns.push({ i: col.i, name, role, agg: col.agg === 'one' ? 'one' : 'sum', stampName: col.stampName !== false, cls, color, src });
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

// ---- qué columna que ya existe se parece a un título nuevo ---------------------------------------------------------------------------------------------------
// Una columna que trae otro nombre (el Excel dice «UDM DISTRIB» y el registro ya tiene «UDM») no debe crear una columna repetida: se le sugiere a la persona la que ya existe y ella decide.
// Un mes nunca se sugiere contra otro mes (jun-24 y jun-25 se parecen mucho y son columnas distintas).
function editDistance(a, b) {
    const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
        let diag = prev[0]; prev[0] = i;
        for (let j = 1; j <= b.length; j += 1) { const keep = prev[j]; prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1)); diag = keep; }
    }
    return prev[b.length];
}
// a y b ya vienen normalizados (sin acentos ni mayúsculas, palabras separadas por un espacio); ra y rb son los textos tal como se escribieron.
function nameScore(a, b, ra, rb) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (manual.parsePeriodHeader(ra) && manual.parsePeriodHeader(rb)) return 0;
    const ta = a.split(' '); const tb = b.split(' ');
    const sa = new Set(ta); const sb = new Set(tb);
    const inter = [...sa].filter((x) => sb.has(x)).length;
    const union = new Set([...ta, ...tb]).size;
    let score = inter / union;
    if (inter > 0 && inter === Math.min(sa.size, sb.size)) score = Math.max(score, 0.8); // uno trae todas las palabras del otro («udm» y «udm distrib»)
    if (!/\d/.test(a) && !/\d/.test(b)) score = Math.max(score, 0.95 * (1 - editDistance(a, b) / Math.max(a.length, b.length))); // un error de dedo
    return score;
}
// headers: los títulos del archivo (los que ya traen `prefill` ya se reconocieron y no se tocan); existing: [{ name, ... }] las columnas que ya tiene el registro.
// Pone h.link = { name, score } en cada título sin reconocer que se parece a una columna que ya existe (una a una, la mejor primero).
function suggestLinks(headers, existing) {
    const taken = new Set(headers.filter((h) => h.prefill && h.prefill.name).map((h) => foldText(h.prefill.name)));
    const cands = [];
    headers.forEach((h, hi) => {
        if (h.prefill) return;
        existing.forEach((e) => {
            const f = foldText(e.name);
            if (taken.has(f)) return;
            const sc = nameScore(foldText(h.text), f, h.text, e.name);
            if (sc >= 0.6) cands.push({ hi, name: e.name, f, sc });
        });
    });
    cands.sort((x, y) => y.sc - x.sc);
    const usedH = new Set(); const usedE = new Set();
    cands.forEach((c) => {
        if (usedH.has(c.hi) || usedE.has(c.f)) return;
        usedH.add(c.hi); usedE.add(c.f);
        headers[c.hi].link = { name: c.name, score: Math.round(c.sc * 100) / 100 };
    });
}

// ---- valores empaquetados ----------------------------------------------------------------------------------------------------------------------------------------
// Los valores de UN renglón en UNA carga van en un solo bloque (3 millones de valores como renglones sueltos de base pesaban ~175 MB; empaquetados pesan unas 6 veces menos). Formato 1:
//   [1][K: uint16 LE][mapa de presencia: ceil(K/8) bytes, el bit i dice si hay valor en la posición i][un float64 LE por cada valor presente, en orden de posición]
// La posición i es la i-ésima columna de valor de la carga (en el orden de su elección); valueSlotKeys dice qué columna de la tabla es cada posición.
function packValues(values) {
    const k = values.length;
    const mapBytes = Math.ceil(k / 8);
    let present = 0;
    for (const v of values) if (v !== null && v !== undefined) present += 1;
    const buf = Buffer.alloc(3 + mapBytes + present * 8);
    buf[0] = 1;
    buf.writeUInt16LE(k, 1);
    let at = 3 + mapBytes;
    values.forEach((v, i) => {
        if (v === null || v === undefined) return;
        buf[3 + (i >> 3)] |= 1 << (i & 7);
        buf.writeDoubleLE(v, at);
        at += 8;
    });
    return buf;
}
function unpackValues(buf) {
    if (!buf || buf[0] !== 1) return [];
    const k = buf.readUInt16LE(1);
    const out = new Array(k).fill(null);
    let at = 3 + Math.ceil(k / 8);
    for (let i = 0; i < k; i += 1) if (buf[3 + (i >> 3)] & (1 << (i & 7))) { out[i] = buf.readDoubleLE(at); at += 8; }
    return out;
}
// El valor de UNA posición sin abrir las demás (para filtrar por una columna).
function unpackSlot(buf, idx) {
    if (!buf || buf[0] !== 1) return null;
    const k = buf.readUInt16LE(1);
    if (idx < 0 || idx >= k || !(buf[3 + (idx >> 3)] & (1 << (idx & 7)))) return null;
    let before = 0;
    for (let i = 0; i < idx; i += 1) if (buf[3 + (i >> 3)] & (1 << (i & 7))) before += 1;
    return buf.readDoubleLE(3 + Math.ceil(k / 8) + before * 8);
}
// La columna de la tabla que es cada posición de una carga: «m:<carga>:<posición>» (columna nueva con día y hora) o «n:<nombre>» (de nombre fijo, p. ej. un mes). Sale de la elección guardada con la carga.
function valueSlotKeys(loadId, config) {
    const cols = (config && Array.isArray(config.columns) ? config.columns : []).filter((c) => c.role === 'value');
    return cols.map((c, k) => (c.stampName ? `m:${loadId}:${k}` : periodNameKey(c.name)));
}

// El cuadro de columnas ya llenado: cada título del Excel nuevo se empareja (sin importar mayúsculas, acentos ni el orden) con el que traía en la última carga del registro y toma lo que se eligió ahí
// (papel, sumar o tomar uno, nombre, clasificación y color). Un título que no estaba antes no lleva nada (lo sugiere el sistema y se marca «Nueva»); uno que antes era «no se carga» sigue sin cargarse.
// prev = { mode, columns: [{ src?, name, role, agg, stampName, cls, color }], skipped: [título] } (la elección guardada con la carga). Pone h.prefill en cada título que se reconoce.
function prefillHeaders(headers, prev) {
    if (!prev || !Array.isArray(prev.columns)) return;
    const byTitle = new Map();
    prev.columns.forEach((c) => { const k = foldText(c.src || c.name); if (k && !byTitle.has(k)) byTitle.set(k, c); });
    const skipped = new Set((Array.isArray(prev.skipped) ? prev.skipped : []).map((x) => foldText(x)));
    headers.forEach((h) => {
        const k = foldText(h.text);
        const c = byTitle.get(k);
        if (c) h.prefill = { role: c.role, agg: c.agg === 'one' ? 'one' : 'sum', stampName: c.stampName !== false, name: trim(c.name) || h.text, cls: trim(c.cls), color: Number.isInteger(c.color) ? c.color : null };
        else if (skipped.has(k)) h.prefill = { role: 'skip' };
    });
}

// Corre (o ensaya) una carga. `store` pone la base:
//   store.existingKeys(): Map(keyText → rowId) de los renglones del registro      store.namedValues(colKey): Map(rowId → valor) de lo vigente en una columna de nombre fijo
//   store.addRows(array de { keyText, cells }) → array de rowIds                    store.addPacked(array de [rowId, bloque]) (los valores de un renglón en una fila) o, si no la trae, store.addValues(array de [rowId, colKey, valor])
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
    // «Dato del renglón» completa los renglones que ya existían (la llave coincide) cuando su celda está vacía; nunca cambia lo ya cargado
    const dataFolds = read.cellCols.filter((c) => c.role === 'data').map((c) => foldText(c.name));
    let filledCells = 0; const filledRows = new Set();
    const issues = read.issues.slice();
    let issuesTotal = read.issuesTotal;
    const colKeyOf = (c, k) => (c.stampName ? `m:${loadId}:${k}` : periodNameKey(c.name));
    const pendingRows = [];
    const packedOps = []; // [rowId, bloque] (la base empaqueta los valores de un renglón en una sola fila)
    const valueOps = []; // solo para una base que no empaqueta
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
            if (rowId === undefined) { newRows += 1; pendingRows.push({ keyText, cells: g.cells, group: g }); } else { g.rowId = rowId; g.existed = true; }
        });
        flushRows();
        if (dataFolds.length && typeof store.cellsOf === 'function') {
            const matched = slice.filter(([, g]) => g.existed && dataFolds.some((f) => g.cells[f] !== undefined && g.cells[f] !== ''));
            if (matched.length) {
                const current = store.cellsOf(matched.map(([, g]) => g.rowId));
                const fills = [];
                matched.forEach(([, g]) => {
                    const cur = current.get(g.rowId) || {};
                    dataFolds.forEach((f) => { const v = g.cells[f]; if (v === undefined || v === '') return; if (cur[f] === undefined || cur[f] === '') { fills.push([g.rowId, f, v]); filledCells += 1; filledRows.add(g.rowId); } });
                });
                if (!dryRun && fills.length) store.addFills(fills);
            }
        }
        slice.forEach(([, g]) => {
            const mine = new Array(read.valueCols.length).fill(null); // lo que ESTA carga agrega a este renglón, por posición
            let any = false;
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
                mine[k] = v;
                any = true;
            });
            if (dryRun || !any) return;
            if (typeof store.addPacked === 'function') packedOps.push([g.rowId, packValues(mine)]);
            else mine.forEach((v, k) => { if (v !== null) valueOps.push([g.rowId, colKeyOf(read.valueCols[k], k), v]); });
        });
        if (!dryRun && packedOps.length) store.addPacked(packedOps.splice(0, packedOps.length));
        if (!dryRun && valueOps.length) store.addValues(valueOps.splice(0, valueOps.length));
    }
    Object.assign(summary, { newRows, valuesAdded, filledCells, filledRows: filledRows.size, added: newRows + valuesAdded + filledCells, untouched, different, errors: read.errors, merged: read.merged, groups: groups.length, columns: read.cellCols.map((c) => c.name), valueColumns: read.valueCols.map((c) => c.name), issuesTotal });
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
// Las columnas de la tabla: primero las de datos (llave, dato, tal cual) de TODAS las cargas vigentes, en el orden en que cada una apareció por primera vez, y luego las columnas NUEVAS de cada carga EN BLOQUE (las de una
// carga juntas, en el orden de su Excel; la siguiente carga agrega su bloque al lado): nombre + día y hora, y si dos cargas tienen la misma etiqueta, la segunda lleva «(2)»; una columna de nombre fijo (p. ej. un mes) es una sola
// y entra en el bloque de la primera carga que la trae. Si hay cargas «tal cual» se agrega al final la columna «Carga».
// Cada columna puede traer su clasificación (nombre y color que puso la persona): el color es de la CLASIFICACIÓN (el último que se eligió para ese nombre; sin elegir, uno de la paleta según el orden en que apareció).
// La clave ESTABLE de una columna (Daniel, 2026-11-26): sale de lo que la identifica (su srcKey: «c:<nombre>» llave o dato, «m:<carga>:<posición>» valor con día y hora, «n:<nombre>» valor de nombre fijo), no de su posición;
// así una carga que trae columnas nuevas no la mueve. Un hash corto de solo letras, números y guion bajo (cabe en las claves de los análisis y en los atributos de la pantalla).
function stableColumnId(srcKey) {
    let h = 0x811c9dc5;
    const text = String(srcKey);
    for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return `k_${(h >>> 0).toString(16).padStart(8, '0')}`;
}
// loads: [{ id, stamp, config: { mode, columns } }] en orden de carga. Devuelve { columns: [{ key, label, group, kind, name, cls, color, loadId?, srcKey? }], hasAsis, labels: Map(loadId → etiqueta), classes: [{ name, color }] }.
function buildColumns(loads, { tz = 0, lang = 'es' } = {}) {
    const years = new Set(loads.map((l) => String(l.stamp || '').slice(0, 4)).filter(Boolean));
    const withYear = years.size > 1;
    const cellSlots = [];
    const cellAt = new Map();
    const valueCols = [];
    const namedPlaced = new Set();
    const labelsSeen = new Map();
    const loadLabels = new Map();
    const classOrder = [];
    const classDisplay = new Map();
    const classColor = new Map();
    let hasAsis = false;
    const uniqueLabel = (base) => { const n = (labelsSeen.get(base) || 0) + 1; labelsSeen.set(base, n); return n === 1 ? base : `${base} (${n})`; };
    const noteClass = (c) => {
        const name = trim(c.cls);
        if (!name) return '';
        const f = foldText(name);
        if (!classDisplay.has(f)) { classDisplay.set(f, name); classOrder.push(f); }
        if (Number.isInteger(c.color) && c.color >= 0 && c.color < CLASS_COLORS) classColor.set(f, c.color); // el último que se eligió
        return f;
    };
    loads.forEach((load) => {
        const cfg = load.config;
        if (!cfg || !Array.isArray(cfg.columns)) return;
        const loadStamp = stampLabel(load.stamp, tz, lang, withYear);
        if (cfg.mode === 'asis') { hasAsis = true; loadLabels.set(load.id, uniqueLabel(`@${loadStamp}`).replace(/^@/, '')); }
        let k = 0;
        cfg.columns.forEach((c) => {
            if (c.role === 'skip') return;
            const f = foldText(c.name);
            const clsF = noteClass(c);
            if (c.role === 'value') {
                const myK = k; k += 1;
                if (c.stampName) valueCols.push({ kind: 'value', group: 'value', name: c.name, agg: c.agg === 'one' ? 'one' : 'sum', liveId: `v:${f}`, at: load.stamp || '', loadId: load.id, srcKey: `m:${load.id}:${myK}`, label: uniqueLabel(nameHasDate(c.name) ? c.name : `${c.name} ${loadStamp}`), clsF });
                else if (!namedPlaced.has(f)) { namedPlaced.add(f); valueCols.push({ kind: 'value', group: 'value', name: c.name, agg: c.agg === 'one' ? 'one' : 'sum', srcKey: periodNameKey(c.name), label: c.name, clsF }); }
            } else {
                const slot = cellAt.get(f);
                if (!slot) { const made = { kind: 'cell', group: c.role === 'key' ? 'key' : 'data', name: c.name, srcKey: `c:${f}`, label: c.name, clsF }; cellAt.set(f, made); cellSlots.push(made); } else if (!slot.clsF && clsF) slot.clsF = clsF;
            }
        });
    });
    const flat = [...cellSlots, ...valueCols];
    if (hasAsis) flat.push({ kind: 'carga', group: 'load', name: 'Carga', srcKey: 'carga', label: 'Carga', clsF: '' });
    flat.forEach((c, i) => { c.key = `c${i}`; }); // la clave de POSICIÓN: solo para la pantalla del registro (filtros y descarga de esa vista); los análisis usan `sid`
    const usedSid = new Set();
    flat.forEach((c) => {
        const base = c.kind === 'carga' ? 'k_carga' : stableColumnId(c.srcKey);
        let sid = base;
        for (let n = 2; usedSid.has(sid); n += 1) sid = `${base}_${n}`;
        usedSid.add(sid);
        c.sid = sid;
    });
    const classes = classOrder.map((f, n) => ({ fold: f, name: classDisplay.get(f), color: classColor.has(f) ? classColor.get(f) : n % CLASS_COLORS }));
    const byFold = new Map(classes.map((x) => [x.fold, x]));
    flat.forEach((c) => { const x = c.clsF ? byFold.get(c.clsF) : null; c.cls = x ? x.name : ''; c.color = x ? x.color : null; delete c.clsF; });
    return { columns: flat, hasAsis, labels: loadLabels, classes: classes.map(({ name, color }) => ({ name, color })) };
}

// ---- «Columnas del registro» (Daniel, 2026-11-26): cambiar el nombre y la clasificación de las columnas que YA existen, una sola vez y para todas las cargas ----
// Cada columna tiene un id: «c:<nombre>» (llave o dato: el nombre se usa para reconocer cada renglón, no se cambia), «v:<nombre>» (valor con día y hora: cada carga guarda sus valores aparte, así que el nombre sí se puede cambiar)
// y «n:<nombre>» (valor de nombre fijo, como un mes: sus valores se guardan POR el nombre, no se cambia). La clasificación se cambia en todas.
const colIdOf = (c) => `${c.role === 'value' ? (c.stampName ? 'v' : 'n') : 'c'}:${foldText(c.name)}`;
const FOLD_MONTH_DATE = new RegExp(`\\s*\\d{1,2}\\s*[-/. ]\\s*${MONTH_WORD}\\.?(?:\\s+\\d{2,4})?(?:\\s+\\d{1,2}:\\d{2})?\\s*$`, 'i');
// El nombre sin la fecha o la hora que trae escrita («EXIST 26-NOV 06:00» → «EXIST»); null si no trae o si no se puede quitar.
function stripNameDate(name) {
    const text = trim(name);
    if (!nameHasDate(text)) return null;
    let out = text.replace(FOLD_MONTH_DATE, '').replace(/\s*\b\d{4}-\d{1,2}-\d{1,2}(?:\s+\d{1,2}:\d{2})?\s*$/, '').replace(/\s*\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}(?:\s+\d{1,2}:\d{2})?\s*$/, '').replace(/\s*\b\d{1,2}:\d{2}\s*$/, '');
    out = trim(out);
    return out && out !== text && !nameHasDate(out) ? out : null;
}
// La lista de la ventana: las columnas de la tabla (lo vigente), cada una con su papel, cuántas cargas la traen, su clasificación y color, y si su nombre se puede cambiar.
function registryColumns(loads, opts) {
    const built = buildColumns(loads, opts);
    const counts = new Map();
    loads.forEach((load) => {
        const cfg = load.config;
        if (!cfg || !Array.isArray(cfg.columns)) return;
        const mine = new Set(cfg.columns.filter((c) => c.role !== 'skip').map(colIdOf));
        mine.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    });
    const order = [];
    const byId = new Map();
    built.columns.forEach((c) => {
        if (c.kind === 'carga') return;
        const id = c.kind === 'cell' ? c.srcKey : (c.srcKey.startsWith('m:') ? `v:${foldText(c.name)}` : c.srcKey);
        let g = byId.get(id);
        if (!g) { g = { id, name: c.name, role: c.group, agg: c.kind === 'value' ? c.agg : '', editName: id.startsWith('v:'), cls: '', color: null, loads: counts.get(id) || 0 }; byId.set(id, g); order.push(g); }
        g.name = c.name; g.cls = c.cls || ''; g.color = c.color; // la más reciente manda, igual que en la tabla
    });
    order.forEach((g) => { if (g.editName) { const bare = stripNameDate(g.name); if (bare) g.nameNoDate = bare; } });
    return { columns: order, classes: built.classes };
}
// Revisa los cambios y arma la elección nueva de cada carga que se toca. loads = TODAS las cargas con elección guardada (vigentes y no consideradas: así, si una vuelve a considerarse, trae lo nuevo);
// changes = [{ id, name?, cls?, color? }]; listing = lo que devolvió registryColumns. Devuelve { error, detail } o { updates: [{ id, config }], entries }.
function planColumnChanges(loads, changes, listing) {
    if (!Array.isArray(changes) || !changes.length || changes.length > 400) return { error: 'FLEX_CONFIG' };
    const current = new Map(listing.columns.map((c) => [c.id, c]));
    const classByFold = new Map(listing.classes.map((k) => [foldText(k.name), k]));
    const wanted = new Map();
    for (const ch of changes) {
        if (!ch || typeof ch !== 'object') return { error: 'FLEX_CONFIG' };
        const id = String(ch.id || '');
        const now = current.get(id);
        if (!now) return { error: 'BAD_COLUMN' };
        const entry = { id, now };
        if (ch.name !== undefined) {
            const name = trim(ch.name).replace(/\s+/g, ' ').slice(0, MAX_NAME);
            if (!name) return { error: 'FLEX_NO_NAME' };
            if (name !== now.name) { if (!now.editName) return { error: 'FLEX_NAME_LOCKED', detail: now.name }; entry.name = name; }
        }
        if (ch.cls !== undefined) { const cls = trim(ch.cls).replace(/\s+/g, ' ').slice(0, MAX_CLASS); if (cls !== now.cls) entry.cls = cls; }
        if (ch.color !== undefined) { const color = Number.isInteger(ch.color) && ch.color >= 0 && ch.color < CLASS_COLORS ? ch.color : null; if (color !== now.color || entry.cls !== undefined) entry.color = color; }
        if (entry.name === undefined && entry.cls === undefined && entry.color === undefined) continue;
        wanted.set(id, entry); // si una columna viene dos veces, manda la última
    }
    if (!wanted.size) return { updates: [], entries: [] };
    const configs = loads.filter((l) => l.config && Array.isArray(l.config.columns)).map((l) => ({ id: l.id, config: JSON.parse(JSON.stringify(l.config)), touched: false }));
    // los nombres que no se pueden usar: los de llave, dato y valor de nombre fijo de cualquier carga (cambiar a uno de esos mezclaría columnas)
    const fixed = new Set();
    configs.forEach((l) => l.config.columns.forEach((c) => { if (c.role !== 'skip' && !colIdOf(c).startsWith('v:')) fixed.add(foldText(c.name)); }));
    for (const e of wanted.values()) if (e.name !== undefined && fixed.has(foldText(e.name))) return { error: 'FLEX_DUP_NAME', detail: e.name };
    // la clasificación que queda y su color: sin clasificación no hay color; una clasificación que ya existe trae su color
    wanted.forEach((e) => {
        const cls = e.cls !== undefined ? e.cls : e.now.cls;
        if (!cls) { e.cls = ""; e.color = null; return; }
        if (e.color === undefined && e.cls !== undefined) { const known = classByFold.get(foldText(cls)); e.color = known ? known.color : null; }
    });
    const classColor = new Map();
    wanted.forEach((e) => { const cls = e.cls !== undefined ? e.cls : e.now.cls; if (cls && Number.isInteger(e.color)) classColor.set(foldText(cls), e.color); });
    configs.forEach((l) => {
        l.config.columns.forEach((c) => {
            if (c.role === 'skip') return;
            const e = wanted.get(colIdOf(c));
            if (!e) return;
            if (e.name !== undefined && c.name !== e.name) { c.name = e.name; l.touched = true; }
            if (e.cls !== undefined && trim(c.cls) !== e.cls) { c.cls = e.cls; l.touched = true; }
            if (e.color !== undefined && (Number.isInteger(c.color) ? c.color : null) !== e.color) { c.color = e.color; l.touched = true; }
        });
    });
    // el color es de la clasificación: todas las columnas que la llevan quedan con el mismo
    configs.forEach((l) => l.config.columns.forEach((c) => {
        if (c.role === "skip" || !trim(c.cls)) return;
        const color = classColor.get(foldText(c.cls));
        if (color !== undefined && c.color !== color) { c.color = color; l.touched = true; }
    }));
    // dentro de una carga no puede haber dos columnas con el mismo nombre
    for (const l of configs) {
        if (!l.touched) continue;
        const seen = new Set();
        for (const c of l.config.columns) {
            if (c.role === 'skip') continue;
            const k = foldText(c.name);
            if (seen.has(k)) return { error: 'FLEX_DUP_NAME', detail: c.name };
            seen.add(k);
        }
    }
    return { updates: configs.filter((l) => l.touched).map((l) => ({ id: l.id, config: l.config })), entries: [...wanted.values()] };
}

// ---- el filtro por columna de la pantalla (cf = { f: { columna: [valores] }, r: { columna: regla } }), aplicado a TODOS los renglones: la misma regla de la pantalla (SearchSyntax) sobre lo que se ve ----
const SearchSyntax = require('./public/SearchSyntax.js');
const MAX_FILTER_VALUES = 400;
const MAX_FILTER_TEXT = 200;
const MAX_FILTER_JSON = 60000;
const ruleNumber = (value) => { const s = String(value ?? '').trim().replace(/[$,\s%]/g, ''); return s === '' || !/^-?\d+(\.\d+)?$/.test(s) ? null : Number(s); };
const shownOf = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
// La búsqueda en la lista de valores de una columna (Daniel, 2026-11-27): de los valores distintos (como los muestra el filtro) devuelve los que cumplen lo escrito, con la misma regla del filtro (Contiene / Inicia con / Igual que, con
// las mismas reglas de escritura), ordenados, hasta `cap`. { values, more (hay más que no se mandan), total (cuántos cumplen) }.
const SEARCH_VALUES_CAP = 300;
function searchValues(shownValues, mode, text, lang = 'es', cap = SEARCH_VALUES_CAP) {
    const typed = String(text || '').slice(0, MAX_FILTER_TEXT);
    if (!SearchSyntax.split(typed).length) return { values: [], more: false, total: 0 };
    const test = SearchSyntax.compile(['startsWith', 'equals'].includes(mode) ? mode : 'contains', typed);
    const found = [];
    for (const v of shownValues) if (test(v)) found.push(v);
    const collator = new Intl.Collator(lang === 'en' ? 'en' : 'es', { sensitivity: 'base', numeric: true });
    found.sort((a, b) => collator.compare(a, b));
    return { values: found.slice(0, cap), more: found.length > cap, total: found.length };
}
// matches(get): get(índice de columna) da lo que trae el renglón en esa columna (texto, número o null)
function parseFilter(raw, columns) {
    if (raw === undefined || raw === null || raw === '') return { filter: null };
    if (typeof raw !== 'string' || raw.length > MAX_FILTER_JSON) return { error: 'BAD_FILTER' };
    let spec;
    try { spec = JSON.parse(raw); } catch { return { error: 'BAD_FILTER' }; }
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return { error: 'BAD_FILTER' };
    const sets = spec.f && typeof spec.f === 'object' && !Array.isArray(spec.f) ? spec.f : {};
    const rules = spec.r && typeof spec.r === 'object' && !Array.isArray(spec.r) ? spec.r : {};
    // x = «todos menos estos»: una selección grande (más de 400 casillas marcadas) se manda como lo que NO se quiere
    const excl = spec.x && typeof spec.x === 'object' && !Array.isArray(spec.x) ? spec.x : {};
    const keys = [...new Set([...Object.keys(sets), ...Object.keys(rules), ...Object.keys(excl)])];
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
        if (Array.isArray(excl[key])) {
            if (excl[key].length > MAX_FILTER_VALUES) return { error: 'BAD_FILTER' };
            cond.not = new Set(excl[key].map((v) => String(v).slice(0, MAX_FILTER_TEXT)));
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
        if (cond.set || cond.not || cond.test || cond.range) conds.push(cond);
    }
    if (!conds.length) return { filter: null };
    const matches = (get) => {
        for (const c of conds) {
            const shown = shownOf(get(c.idx));
            if (c.set && !c.set.has(shown)) return false;
            if (c.not && c.not.has(shown)) return false;
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
module.exports = { nameHasDate, suggestLinks, nameScore, packValues, unpackValues, unpackSlot, valueSlotKeys, prefillHeaders, MAX_CLASS, CLASS_COLORS, inspect, parseConfig, run, readRows, displayCell, textOf, periodNameKey, keyTextOf, foldName, stampLabel, buildColumns, stableColumnId, registryColumns, planColumnChanges, stripNameDate, parseFilter, shownOf, searchValues, SEARCH_VALUES_CAP, MAX_COLUMNS, MAX_NAME, MAX_ISSUES };
