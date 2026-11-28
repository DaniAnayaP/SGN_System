'use strict';
// ---------------------------------------------------------------------------
// Cargas Manuales › Registros Información: los históricos de lo que se carga a mano (Daniel, 2026-11-25, «Sí a las propuestas, con la opción B»).
// Un REGISTRO es un tipo de dato con su plantilla y su periodicidad: «Cargos por sitio mensuales» (un mes por columna, como el Excel de Consumos) y «Existencias actuales diarias» (una foto por día).
// Lógica pura, sin base de datos (la base entra por `store`): leer el .xlsx SIN cargarlo entero en memoria (el archivo real trae más de 100 mil renglones), reconocer las columnas y los meses, y
// planear/aplicar una carga que SOLO AGREGA: un mes nuevo entra como columna nueva, un código nuevo como renglón nuevo, y nada de lo ya cargado se modifica (un valor distinto al guardado se queda
// como estaba y se avisa). Se prueba sola (test-registros-lib.js) y la usa server.js.
// ---------------------------------------------------------------------------
const JSZip = require('jszip');
const { SaxesParser } = require('saxes');
const ExcelJS = require('exceljs');
const SearchSyntax = require('./public/SearchSyntax.js');

const MAX_DATA_ROWS = 400000;
const MAX_ISSUES = 2000;
const BATCH_ROWS = 2000;
const MAX_TEXT = { unidad: 60, unidadNombre: 120, codigo: 60, descripcion: 200, categoria: 80, udm: 40 };

const DIMS = ['unidad', 'unidadNombre', 'codigo', 'descripcion', 'categoria', 'udm'];
const KEY_DIMS = ['unidad', 'codigo'];

const fold = (value) => String(value == null ? '' : value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Los registros que existen hoy (los define el sistema, con su plantilla; el cliente solo carga). kind: 'month' (un mes por columna) o 'day' (una columna con el valor del día elegido al cargar).
const REGISTRIES = {
    'cargos-sitio-mensuales': { key: 'cargos-sitio-mensuales', kind: 'month', nameKey: 'main.regCargosNombre', valueNameKey: 'main.regCargosValor', fileHint: 'cargos' },
    'existencias-diarias': { key: 'existencias-diarias', kind: 'day', nameKey: 'main.regExistenciasNombre', valueNameKey: 'main.regExistenciasValor', fileHint: 'existencias' },
};
const registryOf = (key) => REGISTRIES[key] || null;

// Cómo se llama cada columna en los archivos que llegan (se compara sin acentos, mayúsculas ni signos).
const DIM_SYNONYMS = {
    unidad: ['unidad', 'unit', 'sitio', 'site', 'clave unidad', 'cve unidad', 'unidad de negocio'],
    unidadNombre: ['descripcion unidad', 'nombre unidad', 'nombre de unidad', 'descripcion de la unidad', 'unit name', 'unit description'],
    codigo: ['codigo', 'cod', 'code', 'codigo articulo', 'codigo de articulo', 'codigo del articulo', 'sku', 'item code', 'cve articulo'],
    descripcion: ['descripcion', 'descripcion articulo', 'descripcion del articulo', 'description', 'item description', 'nombre', 'articulo'],
    categoria: ['categoria', 'category', 'familia'],
    udm: ['udm', 'unidad de medida', 'u m', 'um', 'uom', 'unit of measure'],
};
const DIM_SYNONYMS_FOLDED = Object.fromEntries(Object.entries(DIM_SYNONYMS).map(([k, list]) => [k, list.map(fold)]));
const VALUE_SYNONYMS = ['existencia', 'existencias', 'existencia actual', 'stock', 'inventario', 'cantidad', 'qty', 'quantity', 'on hand'].map(fold);

const MONTH_NAMES = {
    ene: 1, enero: 1, jan: 1, january: 1, feb: 2, febrero: 2, february: 2, mar: 3, marzo: 3, march: 3, abr: 4, abril: 4, apr: 4, april: 4, may: 5, mayo: 5,
    jun: 6, junio: 6, june: 6, jul: 7, julio: 7, july: 7, ago: 8, agosto: 8, aug: 8, august: 8, sep: 9, sept: 9, septiembre: 9, setiembre: 9, september: 9,
    oct: 10, octubre: 10, october: 10, nov: 11, noviembre: 11, november: 11, dic: 12, diciembre: 12, dec: 12, december: 12,
};
const pad2 = (n) => String(n).padStart(2, '0');
const periodOfMonth = (y, m) => (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 ? `${y}-${pad2(m)}` : null);
const fullYear = (y) => (y < 100 ? 2000 + y : y);

// Un encabezado → su mes «YYYY-MM» (o null si no es un mes). Acepta «jun-24», «jun-2024», «junio 2024», «2024-06», «06/2024», 202406 y fechas de Excel.
function parsePeriodHeader(value) {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : periodOfMonth(value.getUTCFullYear(), value.getUTCMonth() + 1);
    if (typeof value === 'number') {
        const n = Math.trunc(value);
        return Number.isInteger(value) && n >= 200001 && n <= 210012 ? periodOfMonth(Math.floor(n / 100), n % 100) : null;
    }
    const text = fold(value);
    if (!text) return null;
    let m = /^(\d{4}) (\d{1,2})$/.exec(text);
    if (m) return periodOfMonth(Number(m[1]), Number(m[2]));
    m = /^(\d{1,2}) (\d{4})$/.exec(text);
    if (m) return periodOfMonth(Number(m[2]), Number(m[1]));
    m = /^(\d{4})(\d{2})$/.exec(text);
    if (m) return periodOfMonth(Number(m[1]), Number(m[2]));
    m = /^([a-z]+) (\d{4}|\d{2})$/.exec(text);
    if (m && MONTH_NAMES[m[1]]) return periodOfMonth(fullYear(Number(m[2])), MONTH_NAMES[m[1]]);
    m = /^(\d{4}) ([a-z]+)$/.exec(text);
    if (m && MONTH_NAMES[m[2]]) return periodOfMonth(Number(m[1]), MONTH_NAMES[m[2]]);
    return null;
}
function parseDayText(text) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '').trim());
    if (!m) return null;
    const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
    const date = new Date(Date.UTC(y, mo - 1, d));
    return y >= 2000 && y <= 2100 && date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
const nextMonth = (period) => {
    const m = /^(\d{4})-(\d{2})$/.exec(period || '');
    if (!m) return null;
    const y = Number(m[1]); const mo = Number(m[2]);
    return mo === 12 ? `${y + 1}-01` : `${y}-${pad2(mo + 1)}`;
};
const MONTH_ABBR = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] };
const periodLabel = (period, lang = 'es') => {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(period || '');
    if (!m) return String(period || '');
    return m[3] ? `${m[3]}/${(MONTH_ABBR[lang] || MONTH_ABBR.es)[Number(m[2]) - 1]}/${m[1]}` : `${(MONTH_ABBR[lang] || MONTH_ABBR.es)[Number(m[2]) - 1]}-${m[1].slice(2)}`;
};

// ---- lectura del .xlsx por partes (sin cargarlo entero) --------------------------------------------------------------------------------------------
const colIndexOf = (ref) => {
    let n = 0;
    for (const ch of String(ref || '')) {
        const c = ch.charCodeAt(0);
        if (c >= 65 && c <= 90) n = n * 26 + (c - 64); else if (c >= 97 && c <= 122) n = n * 26 + (c - 96); else break;
    }
    return n - 1;
};
function parseXmlText(xml, handlers) {
    const parser = new SaxesParser();
    Object.entries(handlers).forEach(([event, fn]) => parser.on(event, fn));
    parser.on('error', () => {});
    parser.write(xml).close();
}
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isDateFormatCode = (code) => /[ymdhs]/i.test(String(code || '').replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').replace(/General/gi, ''));
const serialToDate = (serial) => new Date(Math.round((serial - 25569) * 86400000));

async function openWorkbook(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) return { error: 'IMPORT_FILE' };
    let zip;
    try { zip = await JSZip.loadAsync(buffer); } catch { return { error: 'IMPORT_FILE' }; }
    const text = async (name) => { const f = zip.file(name); return f ? f.async('string') : ''; };
    const workbookXml = await text('xl/workbook.xml');
    if (!workbookXml) return { error: 'IMPORT_FILE' };
    const sheetDefs = [];
    parseXmlText(workbookXml, { opentag: (n) => { if (n.name === 'sheet') sheetDefs.push({ name: n.attributes.name, rid: n.attributes['r:id'] || n.attributes.id }); } });
    const targets = new Map();
    parseXmlText(await text('xl/_rels/workbook.xml.rels'), { opentag: (n) => { if (n.name === 'Relationship') targets.set(n.attributes.Id, String(n.attributes.Target || '')); } });
    const sheets = sheetDefs.map((s) => {
        const target = targets.get(s.rid) || '';
        const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
        return { name: s.name, path };
    }).filter((s) => zip.file(s.path));
    if (!sheets.length) return { error: 'IMPORT_FILE' };
    // textos compartidos
    const shared = [];
    {
        let cur = null; let inT = false; let skip = 0;
        parseXmlText(await text('xl/sharedStrings.xml'), {
            opentag: (n) => { if (n.name === 'si') cur = ''; else if (n.name === 'rPh') skip += 1; else if (n.name === 't' && cur !== null && !skip) inT = true; },
            text: (t) => { if (inT) cur += t; },
            closetag: (n) => { if (n.name === 't') inT = false; else if (n.name === 'rPh') skip -= 1; else if (n.name === 'si') { shared.push(cur || ''); cur = null; } },
        });
    }
    // qué estilos son de fecha (para convertir los números de fecha de Excel)
    const dateStyles = new Set();
    {
        const customFormats = new Map();
        const xfs = [];
        let inXfs = false;
        parseXmlText(await text('xl/styles.xml'), {
            opentag: (n) => {
                if (n.name === 'numFmt') customFormats.set(Number(n.attributes.numFmtId), n.attributes.formatCode);
                else if (n.name === 'cellXfs') inXfs = true;
                else if (n.name === 'xf' && inXfs) xfs.push(Number(n.attributes.numFmtId || 0));
            },
            closetag: (n) => { if (n.name === 'cellXfs') inXfs = false; },
        });
        xfs.forEach((fmt, i) => { if (BUILTIN_DATE_FORMATS.has(fmt) || (customFormats.has(fmt) && isDateFormatCode(customFormats.get(fmt)))) dateStyles.add(i); });
    }
    return { zip, sheets, shared, dateStyles };
}

// Recorre una hoja renglón por renglón. onRow(número de renglón, valores[]) puede devolver false para parar. onDimension(ref) avisa el tamaño que declara la hoja.
function streamSheet(book, sheetPath, { onRow, onDimension }) {
    return new Promise((resolve, reject) => {
        const entry = book.zip.file(sheetPath);
        if (!entry) { reject(new Error('IMPORT_FILE')); return; }
        const stream = entry.nodeStream('nodebuffer');
        stream.setEncoding('utf8');
        const parser = new SaxesParser();
        let row = null; let cell = null; let inV = false; let inT = false; let inIs = false; let autoRow = 0; let stopped = false;
        const finish = () => { if (!stopped) { stopped = true; stream.destroy(); resolve(); } };
        parser.on('opentag', (n) => {
            if (stopped) return;
            if (n.name === 'row') { autoRow = Number(n.attributes.r) || autoRow + 1; row = { number: autoRow, values: [] }; }
            else if (n.name === 'c' && row) { cell = { col: colIndexOf(n.attributes.r) >= 0 ? colIndexOf(n.attributes.r) : row.values.length, t: n.attributes.t || '', s: Number(n.attributes.s || 0), v: '', inline: '' }; }
            else if (n.name === 'v') inV = true;
            else if (n.name === 'is') inIs = true;
            else if (n.name === 't' && inIs) inT = true;
            else if (n.name === 'dimension' && onDimension) onDimension(n.attributes.ref);
        });
        parser.on('text', (t) => { if (inV && cell) cell.v += t; else if (inT && cell) cell.inline += t; });
        parser.on('closetag', (n) => {
            if (stopped) return;
            if (n.name === 'v') inV = false;
            else if (n.name === 't') inT = false;
            else if (n.name === 'is') inIs = false;
            else if (n.name === 'c' && cell && row) {
                let value;
                if (cell.t === 's') value = book.shared[Number(cell.v)];
                else if (cell.t === 'inlineStr') value = cell.inline;
                else if (cell.t === 'str') value = cell.v;
                else if (cell.t === 'b') value = cell.v === '1';
                else if (cell.t === 'e') value = undefined;
                else if (cell.t === 'd') { const d = new Date(cell.v); value = Number.isNaN(d.getTime()) ? undefined : d; }
                else if (cell.v === '') value = undefined;
                else { const num = Number(cell.v); value = Number.isNaN(num) ? undefined : (book.dateStyles.has(cell.s) ? serialToDate(num) : num); }
                if (value !== undefined) row.values[cell.col] = value;
                cell = null;
            } else if (n.name === 'row' && row) {
                const keep = onRow(row.number, row.values);
                row = null;
                if (keep === false) finish();
            }
        });
        parser.on('error', (err) => { if (!stopped) { stopped = true; stream.destroy(); reject(err); } });
        stream.on('data', (chunk) => { if (!stopped) { try { parser.write(chunk); } catch (err) { stopped = true; stream.destroy(); reject(err); } } });
        stream.on('end', () => { if (!stopped) { stopped = true; try { parser.close(); } catch { /* ya se leyó todo lo útil */ } resolve(); } });
        stream.on('error', (err) => { if (!stopped) { stopped = true; reject(err); } });
    });
}
const dimensionRows = (ref) => {
    const m = /:?[A-Za-z]+(\d+)$/.exec(String(ref || ''));
    return m ? Number(m[1]) : 0;
};
const cellText = (v) => (v instanceof Date ? '' : String(v == null ? '' : v).replace(/\s+/g, ' ').trim());

// El renglón de títulos y las columnas que se reconocen solas. Se busca en los primeros 30 renglones el que más columnas conocidas trae (meses incluidos).
function scoreHeader(values, registry) {
    let score = 0;
    const seen = new Set();
    values.forEach((v) => {
        const f = fold(cellText(v));
        const dimKey = f && Object.entries(DIM_SYNONYMS_FOLDED).find(([, list]) => list.includes(f));
        if (dimKey && !seen.has(dimKey[0])) { seen.add(dimKey[0]); score += 2; }
        else if (registry.kind === 'month' && parsePeriodHeader(v)) score += 1;
        else if (registry.kind === 'day' && f && VALUE_SYNONYMS.includes(f)) score += 2;
    });
    return score;
}
function suggestMapping(values, registry) {
    const mapping = { dims: {}, valueCols: [], valueCol: null };
    const used = new Set();
    DIMS.forEach((dim) => {
        const at = values.findIndex((v, i) => !used.has(i) && DIM_SYNONYMS_FOLDED[dim].includes(fold(cellText(v))));
        if (at >= 0) { mapping.dims[dim] = at; used.add(at); }
    });
    if (registry.kind === 'month') {
        const seenPeriods = new Set();
        values.forEach((v, i) => {
            if (used.has(i)) return;
            const period = parsePeriodHeader(v);
            if (period && !seenPeriods.has(period)) { seenPeriods.add(period); mapping.valueCols.push({ col: i, period }); }
        });
        mapping.valueCols.sort((a, b) => a.col - b.col);
    } else {
        const at = values.findIndex((v, i) => !used.has(i) && VALUE_SYNONYMS.includes(fold(cellText(v))));
        if (at >= 0) mapping.valueCol = at;
    }
    return mapping;
}
const mappingProblems = (mapping, registry) => {
    const missing = KEY_DIMS.filter((d) => mapping.dims[d] === undefined || mapping.dims[d] === null);
    if (registry.kind === 'month' ? !(mapping.valueCols || []).length : (mapping.valueCol === null || mapping.valueCol === undefined)) missing.push('value');
    return missing;
};

// El archivo, a la vista antes de cargar: sus hojas, el renglón de títulos, las columnas y su emparejamiento propuesto, y unos renglones de ejemplo.
async function inspectWorkbook(buffer, registry, { sheet } = {}) {
    const book = await openWorkbook(buffer);
    if (book.error) return { error: book.error };
    // en cada hoja se buscan los títulos en sus primeros renglones; se elige la que más columnas conocidas trae (la plantilla trae también hojas de instrucciones y de ejemplo, que no cuentan), y a igual puntaje la de más renglones
    const sheets = [];
    const tops = new Map();
    for (const s of book.sheets) {
        let rows = 0;
        const top = [];
        await streamSheet(book, s.path, { onDimension: (ref) => { rows = dimensionRows(ref); }, onRow: (number, values) => { top.push({ number, values }); return top.length < 40; } });
        let found = null;
        top.slice(0, 30).forEach((r) => { const score = scoreHeader(r.values, registry); if (score > 0 && (!found || score > found.score)) found = { score, row: r }; });
        tops.set(s.name, { top, best: found });
        sheets.push({ name: s.name, rows: rows || top.length, score: found ? found.score : 0 });
    }
    // la hoja que pide el usuario; si no, la PRIMERA que trae la llave (Unidad y Código) en sus títulos (en la plantilla es la primera; las de instrucciones y ejemplo van después); si ninguna, la de más puntaje
    const hasKey = (s) => { const t = tops.get(s.name); return !!t.best && KEY_DIMS.every((d) => suggestMapping(t.best.row.values, registry).dims[d] !== undefined); };
    const chosen = sheets.find((s) => s.name === sheet) || sheets.find(hasKey) || sheets.reduce((best, s) => (s.score > best.score || (s.score === best.score && s.rows > best.rows) ? s : best), sheets[0]);
    const { top, best } = tops.get(chosen.name);
    if (!best) return { sheets, sheet: chosen.name, error: 'IMPORT_HEADERS', missing: KEY_DIMS };
    const headerRow = best.row;
    const mapping = suggestMapping(headerRow.values, registry);
    const headers = headerRow.values.map((v, index) => ({ index, text: v instanceof Date ? periodLabel(parsePeriodHeader(v) || '') : cellText(v) })).filter((h) => h.text);
    const sample = top.filter((r) => r.number > headerRow.number).slice(0, 5).map((r) => ({ line: r.number, values: headers.map((h) => { const v = r.values[h.index]; return v instanceof Date ? v.toISOString().slice(0, 10) : cellText(v); }) }));
    return { sheets, sheet: chosen.name, headerRow: headerRow.number, headers, mapping, sample, rowsDeclared: chosen.rows, missing: mappingProblems(mapping, registry) };
}

// ---- la carga: SOLO AGREGA ---------------------------------------------------------------------------------------------------------------------
const parseNumber = (raw) => {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    if (raw instanceof Date || raw === undefined || raw === null) return null;
    const text = String(raw).trim();
    if (!text) return undefined; // vacío = no hay dato
    const cleaned = text.replace(/\s/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
    return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
};
const sameValue = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const dimText = (raw, dim) => {
    if (raw === undefined || raw === null || raw instanceof Date) return '';
    const text = typeof raw === 'number' ? (Number.isInteger(raw) ? String(raw) : String(raw)) : String(raw);
    return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT[dim]);
};

// Corre (o ensaya, con dryRun) una carga. `store` pone la base:
//   store.existingPeriods(): Set de los periodos que ya tienen datos vigentes en el registro
//   store.findRow(unidad, codigo): { id } | null          store.valuesOf(rowId): Map(periodo → valor) de lo vigente
//   store.beginBatch() / store.endBatch()                 store.addRow(dims): rowId nuevo          store.addValue(rowId, periodo, valor)
// options: { sheet, headerRow, mapping: { dims: {dim: col}, valueCols: [{col, period}], valueCol }, day, now }
// Devuelve { summary, issues } o { error }.
async function runImport(buffer, registry, options, store, { dryRun = false } = {}) {
    const mapping = options.mapping || { dims: {} };
    const missing = mappingProblems(mapping, registry);
    if (missing.length) return { error: 'IMPORT_HEADERS', missing };
    let fixedPeriod = null;
    if (registry.kind === 'day') {
        fixedPeriod = parseDayText(options.day);
        if (!fixedPeriod) return { error: 'IMPORT_DAY' };
        if (Date.parse(`${fixedPeriod}T00:00:00Z`) > (options.now || Date.now()) + 36 * 3600 * 1000) return { error: 'IMPORT_DAY_FUTURE' };
    }
    const valueCols = registry.kind === 'month' ? mapping.valueCols.map((v) => ({ col: Number(v.col), period: v.period })) : [{ col: Number(mapping.valueCol), period: fixedPeriod }];
    const nowMonth = (() => { const d = new Date(options.now || Date.now()); return periodOfMonth(d.getUTCFullYear(), d.getUTCMonth() + 1); })();
    const futurePeriods = new Set(valueCols.filter((v) => registry.kind === 'month' && v.period > nowMonth).map((v) => v.period));
    const activeCols = valueCols.filter((v) => !futurePeriods.has(v.period));
    const book = await openWorkbook(buffer);
    if (book.error) return { error: book.error };
    const sheetDef = book.sheets.find((s) => s.name === options.sheet) || book.sheets[0];
    const existing = store.existingPeriods();
    const perPeriod = new Map(activeCols.map((v) => [v.period, { period: v.period, status: existing.has(v.period) ? 'existing' : 'new', added: 0, untouched: 0, different: 0 }]));
    const summary = { sheet: sheetDef.name, rowsInFile: 0, newRows: 0, valuesAdded: 0, untouched: 0, different: 0, errors: 0, blank: 0, skippedFuture: [...futurePeriods], periods: [] };
    const issues = [];
    const addIssue = (issue) => { if (issues.length < MAX_ISSUES) issues.push(issue); };
    const seenKeys = new Set();
    let inBatch = 0;
    let tooBig = false;
    const startBatch = () => { if (!dryRun) store.beginBatch(); inBatch = 0; };
    const endBatch = () => { if (!dryRun) store.endBatch(); };
    startBatch();
    try {
        await streamSheet(book, sheetDef.path, {
            onRow: (number, values) => {
                if (number <= (options.headerRow || 0)) return true;
                const cells = {};
                DIMS.forEach((dim) => { cells[dim] = mapping.dims[dim] === undefined || mapping.dims[dim] === null ? '' : dimText(values[mapping.dims[dim]], dim); });
                const hasValues = activeCols.some((v) => values[v.col] !== undefined && cellText(values[v.col]) !== '');
                if (!cells.unidad && !cells.codigo && !hasValues && !cells.descripcion) { summary.blank += 1; return true; }
                if (summary.rowsInFile >= MAX_DATA_ROWS) { tooBig = true; return false; }
                summary.rowsInFile += 1;
                if (!cells.unidad || !cells.codigo) { summary.errors += 1; addIssue({ kind: 'error', line: number, unidad: cells.unidad, codigo: cells.codigo, problem: 'ROW_KEY_MISSING' }); return true; }
                const key = `${cells.unidad}\u0001${cells.codigo}`;
                if (seenKeys.has(key)) { summary.errors += 1; addIssue({ kind: 'error', line: number, unidad: cells.unidad, codigo: cells.codigo, problem: 'ROW_REPEATED' }); return true; }
                seenKeys.add(key);
                // los valores del renglón
                const parsed = [];
                let rowError = false;
                activeCols.forEach((v) => {
                    const raw = values[v.col];
                    const num = parseNumber(raw);
                    if (num === undefined) return; // vacío: no hay dato de ese periodo
                    if (num === null) { rowError = true; summary.errors += 1; addIssue({ kind: 'error', line: number, unidad: cells.unidad, codigo: cells.codigo, period: v.period, file: cellText(raw), problem: 'VALUE_NOT_NUMBER' }); return; }
                    parsed.push({ period: v.period, value: num });
                });
                if (rowError && !parsed.length) return true;
                const found = store.findRow(cells.unidad, cells.codigo);
                let rowId = found ? found.id : null;
                const have = found ? store.valuesOf(found.id) : new Map();
                if (!found && parsed.length) {
                    summary.newRows += 1;
                    if (!dryRun) rowId = store.addRow(cells);
                }
                parsed.forEach((p) => {
                    const stat = perPeriod.get(p.period);
                    if (have.has(p.period)) {
                        if (sameValue(have.get(p.period), p.value)) { summary.untouched += 1; stat.untouched += 1; }
                        else { summary.different += 1; stat.different += 1; addIssue({ kind: 'different', line: number, unidad: cells.unidad, codigo: cells.codigo, period: p.period, file: p.value, saved: have.get(p.period), problem: 'VALUE_DIFFERENT' }); }
                    } else {
                        summary.valuesAdded += 1; stat.added += 1;
                        if (!dryRun) store.addValue(rowId, p.period, p.value);
                    }
                });
                inBatch += 1;
                if (inBatch >= BATCH_ROWS) { endBatch(); startBatch(); }
                return true;
            },
        });
        endBatch();
    } catch (err) {
        try { endBatch(); } catch { /* el error de arriba es el que importa */ }
        return { error: 'IMPORT_FILE', detail: String(err && err.message || err) };
    }
    if (tooBig) return { error: 'IMPORT_TOO_BIG' };
    if (!summary.rowsInFile) return { error: 'IMPORT_EMPTY' };
    summary.periods = [...perPeriod.values()].sort((a, b) => (a.period < b.period ? -1 : 1));
    summary.newPeriods = summary.periods.filter((p) => p.status === 'new' && p.added > 0).map((p) => p.period);
    summary.issuesShown = issues.length;
    summary.issuesTotal = summary.errors + summary.different;
    return { summary, issues };
}

// ---- la plantilla --------------------------------------------------------------------------------------------------------------------------------
const TEMPLATE_TEXT = {
    es: {
        sheets: ['Plantilla', 'Instrucciones', 'Ejemplo'],
        headers: { unidad: 'Unidad', unidadNombre: 'Descripción Unidad', codigo: 'Código', descripcion: 'Descripción', categoria: 'Categoría', udm: 'UDM' },
        valueDay: 'Existencia',
        how: 'Cómo se llena',
        month: [
            'Cada fila es un código de una unidad. Obligatorias: Unidad y Código. Opcionales: Descripción Unidad, Descripción, Categoría y UDM.',
            'Cada mes va en su propia columna, con el mes como título (por ejemplo nov-26). Agrega una columna por cada mes que cargues; la plantilla ya trae la del mes que sigue.',
            'Lo que ya está cargado NO se modifica: si un mes que ya existe trae un valor distinto, se queda el guardado y el sistema te avisa. Los meses nuevos se agregan como columna nueva y los códigos nuevos como renglones nuevos.',
            'Escribe Unidad y Código como texto para no perder los ceros de la izquierda (las columnas ya vienen como texto).',
            'Una celda vacía significa que no hay dato de ese mes; no se guarda un cero.',
            'No cambies la fila de títulos.',
        ],
        day: [
            'Cada fila es un código de una unidad. Obligatorias: Unidad y Código. Opcionales: Descripción Unidad, Descripción, Categoría y UDM.',
            'Esta carga es una foto de UN día: el día se elige al cargar el archivo (el archivo no lleva fecha). Cada día es una carga nueva y los días anteriores no se tocan.',
            'Existencia: la cantidad que había ese día. Una celda vacía significa que no hay dato.',
            'Escribe Unidad y Código como texto para no perder los ceros de la izquierda.',
            'No cambies la fila de títulos.',
        ],
    },
    en: {
        sheets: ['Template', 'Instructions', 'Example'],
        headers: { unidad: 'Unit', unidadNombre: 'Unit description', codigo: 'Code', descripcion: 'Description', categoria: 'Category', udm: 'UoM' },
        valueDay: 'Stock',
        how: 'How to fill it in',
        month: [
            'Each row is one code of one unit. Required: Unit and Code. Optional: Unit description, Description, Category and UoM.',
            'Each month goes in its own column, with the month as the title (for example nov-26). Add one column per month you load; the template already brings the next month.',
            'What is already loaded is NOT changed: if an existing month brings a different value, the saved one stays and the system warns you. New months are added as a new column and new codes as new rows.',
            'Type Unit and Code as text so the leading zeros are not lost (the columns already come as text).',
            'An empty cell means there is no data for that month; a zero is not saved.',
            'Do not change the titles row.',
        ],
        day: [
            'Each row is one code of one unit. Required: Unit and Code. Optional: Unit description, Description, Category and UoM.',
            'This load is a snapshot of ONE day: the day is chosen when you load the file (the file has no date). Each day is a new load and earlier days are not touched.',
            'Stock: the quantity there was that day. An empty cell means there is no data.',
            'Type Unit and Code as text so the leading zeros are not lost.',
            'Do not change the titles row.',
        ],
    },
};
// Los títulos de las columnas de referencia (Unidad, Descripción Unidad, Código, …), los mismos de la plantilla, para la descarga completa de los datos.
const exportDimHeaders = (lang = 'es') => DIMS.map((d) => TEMPLATE_TEXT[lang === 'en' ? 'en' : 'es'].headers[d]);
async function buildTemplate(registry, lang = 'es', { nextPeriod } = {}) {
    const text = TEMPLATE_TEXT[lang === 'en' ? 'en' : 'es'];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(text.sheets[0]);
    const headers = DIMS.map((d) => text.headers[d]);
    const valueHeader = registry.kind === 'month' ? periodLabel(nextPeriod || nextMonth(`${new Date().getUTCFullYear()}-${pad2(new Date().getUTCMonth() + 1)}`) || '', lang) : (registry.valueName || text.valueDay);
    sheet.addRow([...headers, valueHeader]);
    DIMS.slice(0, 3).forEach((_, i) => { sheet.getColumn(i + 1).numFmt = '@'; });
    sheet.getColumn(3).numFmt = '@';
    sheet.getColumn(4).width = 36; sheet.getColumn(2).width = 24; [1, 3, 5, 6, 7].forEach((c) => { sheet.getColumn(c).width = 16; });
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const how = workbook.addWorksheet(text.sheets[1]);
    how.getColumn(1).width = 110;
    how.addRow([text.how]).font = { bold: true };
    (registry.kind === 'month' ? text.month : text.day).forEach((step, i) => how.addRow([`${i + 1}. ${step}`]));
    const example = workbook.addWorksheet(text.sheets[2]);
    example.addRow([...headers, ...(registry.kind === 'month' ? [periodLabel('2026-09', lang), periodLabel('2026-10', lang), valueHeader] : [valueHeader])]).font = { bold: true };
    example.addRow(registry.kind === 'month' ? ['GAE', 'CM Alta Especialidad', '100013', 'Guante nitrilo mediano (caja 100)', 'Insumos Clínicos', 'CAJA', 420, 380, ''] : ['GAE', 'CM Alta Especialidad', '100013', 'Guante nitrilo mediano (caja 100)', 'Insumos Clínicos', 'CAJA', 160]);
    example.columns.forEach((c) => { c.width = 18; });
    return workbook;
}

// ---- Filtros por columna que resuelve el servidor (Daniel, 2026-11-25: «al buscar tiene que buscar en todo») ----------------------------------------------------------------------
// La tabla de datos solo dibuja los primeros 2,000 de miles de renglones: un filtro por columna que leyera lo dibujado dejaba fuera casi todo. La pantalla manda el filtro como cf = { f: { columna: [valores] }, r: { columna: regla } }
// y el servidor lo aplica a TODOS los renglones con la misma regla de la pantalla (SearchSyntax: Contiene / Inicia con / Igual que, con coma, $ y @; y el rango «Desde–Hasta» de los números). Una columna es una de las de
// referencia (colRegUnidad…) o un periodo (p_2026_06); lo que se compara es lo que se ve: «—» si está vacío y el número con el formato del idioma.
const COLUMN_DB_FIELD = { colRegUnidad: 'unidad', colRegUnidadNombre: 'unidad_nombre', colRegCodigo: 'codigo', colRegDescripcion: 'descripcion', colRegCategoria: 'categoria', colRegUdm: 'udm' };
const MAX_FILTER_COLUMNS = 40;
const MAX_FILTER_VALUES = 400;
const MAX_FILTER_TEXT = 200;
const MAX_FILTER_JSON = 60000;
const periodOfColumn = (key) => { const m = /^p_(\d{4})_(\d{2})(?:_(\d{2}))?$/.exec(String(key || '')); return m ? `${m[1]}-${m[2]}${m[3] ? `-${m[3]}` : ''}` : null; };
// { column: 'unidad_nombre' } (una de referencia) o { period: '2026-06' } (un periodo); null si no es una columna de la tabla de datos
function columnInfo(key) {
    if (Object.prototype.hasOwnProperty.call(COLUMN_DB_FIELD, key)) return { key, column: COLUMN_DB_FIELD[key] };
    const period = periodOfColumn(key);
    return period ? { key, period } : null;
}
const NUMBER_FORMATS = {};
const formatNumber = (n, lang) => { const l = lang === 'en' ? 'en-US' : 'es-MX'; return (NUMBER_FORMATS[l] || (NUMBER_FORMATS[l] = new Intl.NumberFormat(l, { maximumFractionDigits: 3 }))).format(Number(n || 0)); };
const shownDim = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const shownPeriod = (v, lang) => (v === null || v === undefined ? '—' : formatNumber(v, lang));
// "$1,250.00" -> 1250 (igual que la pantalla): solo números
const ruleNumber = (value) => { const s = String(value ?? '').trim().replace(/[$,\s%]/g, ''); return s === '' || !/^-?\d+(\.\d+)?$/.test(s) ? null : Number(s); };
// Lee el cf que manda la pantalla. { filter: null } = sin filtro; { error } = no es válido; { filter } trae periods (los periodos que hay que leer) y matches(renglón de la base, valoresPorPeriodo).
function parseColumnFilter(raw, lang = 'es') {
    if (raw === undefined || raw === null || raw === '') return { filter: null };
    if (typeof raw !== 'string' || raw.length > MAX_FILTER_JSON) return { error: 'BAD_FILTER' };
    let spec;
    try { spec = JSON.parse(raw); } catch (err) { return { error: 'BAD_FILTER' }; }
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return { error: 'BAD_FILTER' };
    const sets = spec.f && typeof spec.f === 'object' && !Array.isArray(spec.f) ? spec.f : {};
    const rules = spec.r && typeof spec.r === 'object' && !Array.isArray(spec.r) ? spec.r : {};
    // x = «todos menos estos»: una selección grande (más de 400 casillas marcadas) se manda como lo que NO se quiere
    const excl = spec.x && typeof spec.x === 'object' && !Array.isArray(spec.x) ? spec.x : {};
    const keys = [...new Set([...Object.keys(sets), ...Object.keys(rules), ...Object.keys(excl)])];
    if (keys.length > MAX_FILTER_COLUMNS) return { error: 'BAD_FILTER' };
    const conditions = [];
    for (const key of keys) {
        const info = columnInfo(key);
        if (!info) continue; // una columna que no es de esta tabla no filtra nada
        const cond = { ...info };
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
            } else if (rule.kind === 'range' && info.period) {
                const lo = ruleNumber(rule.from);
                const hi = ruleNumber(rule.to);
                if (lo !== null || hi !== null) cond.range = { lo, hi };
            }
        }
        if (cond.set || cond.not || cond.test || cond.range) conditions.push(cond);
    }
    if (!conditions.length) return { filter: null };
    const periods = [...new Set(conditions.filter((c) => c.period).map((c) => c.period))];
    const matches = (row, periodValues) => {
        for (const c of conditions) {
            let shown;
            let raw;
            if (c.column) { raw = row[c.column]; shown = shownDim(raw); } else { raw = (periodValues[c.period] || new Map()).get(row.id); shown = shownPeriod(raw, lang); }
            if (c.set && !c.set.has(shown)) return false;
            if (c.not && c.not.has(shown)) return false;
            if (c.test && !c.test(shown)) return false;
            if (c.range) {
                if (raw === undefined || raw === null) return false; // sin valor en ese periodo no entra a un rango
                const k = Math.round(Number(raw) * 1000) / 1000;
                if ((c.range.lo !== null && k < c.range.lo) || (c.range.hi !== null && k > c.range.hi)) return false;
            }
        }
        return true;
    };
    return { filter: { conditions, periods, lang, matches } };
}

module.exports = {
    parseColumnFilter, columnInfo, shownDim, shownPeriod,
    REGISTRIES, registryOf, DIMS, KEY_DIMS, MAX_DATA_ROWS, MAX_ISSUES, BATCH_ROWS,
    fold, parsePeriodHeader, parseDayText, nextMonth, periodLabel,
    openWorkbook, streamSheet, inspectWorkbook, suggestMapping, mappingProblems, runImport, buildTemplate, exportDimHeaders, parseNumber, scoreHeader,
};
