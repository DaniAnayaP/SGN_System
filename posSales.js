'use strict';
// ---------------------------------------------------------------------------
// Punto Venta › Operaciones › Ventas: la carga de ventas por plantilla (Excel o celdas pegadas). Lógica pura, sin base de datos (la base entra por `ctx`): leer el archivo, revisar cada renglón,
// juntar los renglones de un mismo folio en un ticket y calcular su subtotal, IVA y total. Se prueba sola (test-pos-ventas-lib.js) y la usa server.js.
//
// Decisiones de Daniel (2026-11-24, «Sí a las propuestas»): un renglón por artículo y el folio junta el ticket; el centro de costos manda (obligatorio, existente y activo: de él salen el sitio, la sucursal y el domicilio);
// precios con IVA incluido y el sistema calcula subtotal, IVA y total (la plantilla no trae totales); un folio que ya existe se salta y nunca se modifica; un ticket se carga entero o no se carga.
// Al construirlo se afinó una cosa: el folio no se repite DENTRO DE UN SITIO (dos cajas de sitios distintos pueden tener el mismo número), así que un ticket es sitio + folio.
// ---------------------------------------------------------------------------
const ExcelJS = require('exceljs');

const MAX_ROWS = 5000;
const MAX_LINES_PER_TICKET = 200;
const FUTURE_SLACK_MS = 36 * 3600 * 1000; // la hora de una venta no puede estar en el futuro (un poco de margen por las zonas horarias)
const MAX_TEXT = { folio: 40, center: 40, servedBy: 80, place: 40, concept: 120, payment: 40 };

const fold = (value) => String(value == null ? '' : value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[*()]/g, '').replace(/\s+/g, ' ').trim();
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;

// Las columnas se encuentran por su título (en español o en inglés). Las obligatorias son 6; las otras 5 pueden faltar.
const HEADERS = {
    folio: ['folio', 'ticket', 'no ticket', 'numero de ticket', 'ticket number', 'receipt no.', 'receipt no', 'receipt number', 'receipt'],
    soldAt: ['fecha y hora', 'fecha hora', 'fecha', 'date and time', 'date time', 'datetime', 'date'],
    center: ['centro de costos', 'centro de costo', 'centro', 'cost center', 'cost centre'],
    servedBy: ['atendio', 'atendido por', 'mesero', 'cajero', 'served by', 'attended by', 'waiter', 'cashier'],
    place: ['mesa o caja', 'mesa', 'caja', 'table or register', 'table', 'register'],
    concept: ['concepto', 'articulo', 'descripcion', 'concept', 'item', 'description'],
    quantity: ['cantidad', 'cant', 'quantity', 'qty'],
    price: ['precio unitario', 'precio', 'unit price', 'price'],
    taxRate: ['iva %', 'iva', 'iva%', 'tax %', 'tax', 'vat %', 'vat'],
    payment: ['forma de pago', 'pago', 'payment method', 'payment'],
    received: ['recibido', 'efectivo recibido', 'received', 'amount received'],
};
const COLUMN_KEYS = ['folio', 'soldAt', 'center', 'servedBy', 'place', 'concept', 'quantity', 'price', 'taxRate', 'payment', 'received'];
const REQUIRED_KEYS = ['folio', 'soldAt', 'center', 'concept', 'quantity', 'price'];
const TEMPLATE_TEXT = {
    es: {
        sheets: ['Plantilla', 'Instrucciones', 'Ejemplo', 'Centros de costos'],
        headers: { folio: 'Folio', soldAt: 'Fecha y hora', center: 'Centro de costos', servedBy: 'Atendió', place: 'Mesa o caja', concept: 'Concepto', quantity: 'Cantidad', price: 'Precio unitario', taxRate: 'IVA %', payment: 'Forma de pago', received: 'Recibido' },
        payments: ['Efectivo', 'Tarjeta', 'Transferencia'],
        centersHead: ['Código (el que va en «Centro de costos»)', 'Nombre', 'Sitio', 'Sucursal'],
        how: 'Cómo se llena',
        steps: [
            'Cada fila es un artículo vendido. Los renglones con el mismo Folio (dentro del mismo sitio) forman un ticket.',
            'Obligatorias: Folio, Fecha y hora, Centro de costos, Concepto, Cantidad y Precio unitario. Opcionales: Atendió, Mesa o caja, IVA %, Forma de pago y Recibido.',
            'Folio: escríbelo como texto para no perder los ceros de la izquierda (la columna ya viene como texto).',
            'Fecha y hora: por ejemplo 23/11/2026 14:32 o 2026-11-23 14:32. La hora es la del lugar de la venta; no puede ser futura.',
            'Centro de costos: el código del centro donde se vendió (hoja «Centros de costos»); debe existir y estar activo. De él salen el sitio, la sucursal y el domicilio del ticket.',
            'Precio unitario: el precio de una pieza CON IVA incluido. El sistema calcula el subtotal, el IVA y el total; no los escribas.',
            'IVA %: vacío = 16. Para otra tasa (0, por ejemplo) escribe el número.',
            'Recibido: lo que entregó el cliente en efectivo; el sistema calcula el cambio.',
            'Los renglones de un mismo folio deben traer la misma fecha y hora, el mismo centro, y el mismo Atendió, Mesa o caja y Forma de pago (si los llenas).',
            'Un folio que ya se cargó en ese sitio se salta: un ticket ya emitido no se modifica. Un ticket con un renglón con error no se carga (se carga entero o no se carga).',
            'No cambies la fila de títulos ni quites columnas obligatorias.',
        ],
    },
    en: {
        sheets: ['Template', 'Instructions', 'Example', 'Cost centers'],
        headers: { folio: 'Receipt no.', soldAt: 'Date and time', center: 'Cost center', servedBy: 'Served by', place: 'Table or register', concept: 'Item', quantity: 'Quantity', price: 'Unit price', taxRate: 'VAT %', payment: 'Payment method', received: 'Received' },
        payments: ['Cash', 'Card', 'Transfer'],
        centersHead: ['Code (the one that goes in «Cost center»)', 'Name', 'Site', 'Branch'],
        how: 'How to fill it in',
        steps: [
            'Each row is one item sold. Rows with the same Receipt no. (inside the same site) make up one receipt.',
            'Required: Receipt no., Date and time, Cost center, Item, Quantity and Unit price. Optional: Served by, Table or register, VAT %, Payment method and Received.',
            'Receipt no.: type it as text so the leading zeros are not lost (the column already comes as text).',
            'Date and time: for example 23/11/2026 14:32 or 2026-11-23 14:32. The time is the local time of the place of sale; it cannot be in the future.',
            'Cost center: the code of the center where it was sold (sheet «Cost centers»); it must exist and be active. The site, branch and address of the receipt come from it.',
            'Unit price: the price of one piece WITH VAT included. The system calculates the subtotal, the VAT and the total; do not type them.',
            'VAT %: empty = 16. For another rate (0, for example) type the number.',
            'Received: what the customer handed over in cash; the system calculates the change.',
            'Rows of one receipt must carry the same date and time, the same center, and the same Served by, Table or register and Payment method (if you fill them in).',
            'A receipt number already loaded in that site is skipped: an issued receipt is not changed. A receipt with an error row is not loaded (it loads whole or not at all).',
            'Do not change the titles row or remove required columns.',
        ],
    },
};

// ---- lectura del archivo ---------------------------------------------------------------------------------------------------------------------------
function cellRaw(cell) {
    const v = cell.value;
    if (v == null) return '';
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
        if (Array.isArray(v.richText)) return v.richText.map((part) => part.text).join('');
        if (v.result !== undefined) return v.result instanceof Date ? v.result : (v.result == null ? '' : v.result);
        if (v.text !== undefined) return String(v.text);
        return '';
    }
    return v;
}
// El .xlsx tal cual → { rows: [{ line, values: [...] }] } o { error }. Se lee SOLO la primera hoja (la plantilla trae la suya primero; el ejemplo y las listas van en otras hojas para que no se carguen sin querer).
async function readWorkbookRows(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) return { error: 'IMPORT_FILE' };
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(buffer); } catch { return { error: 'IMPORT_FILE' }; }
    const sheet = workbook.worksheets[0];
    if (!sheet) return { error: 'IMPORT_FILE' };
    if (sheet.rowCount > MAX_ROWS + 60) return { error: 'IMPORT_TOO_BIG' };
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row, line) => {
        const values = [];
        row.eachCell({ includeEmpty: true }, (cell, col) => { values[col - 1] = cellRaw(cell); });
        rows.push({ line, values });
    });
    return parseMatrix(rows);
}
const cellText = (v) => (v instanceof Date ? '' : String(v == null ? '' : v).replace(/\s+/g, ' ').trim());
// Los renglones leídos (de Excel o pegados) → { rows: [{ line, cells: { folio, soldAt, ... } }] } o { error, missing }.
// La fila de títulos es la primera (de las 10 de arriba) que trae los títulos obligatorios.
function parseMatrix(matrixRows) {
    if (!Array.isArray(matrixRows) || !matrixRows.length) return { error: 'IMPORT_EMPTY' };
    let headerAt = -1;
    let colOf = {};
    let bestMissing = null;
    for (let i = 0; i < Math.min(10, matrixRows.length) && headerAt < 0; i += 1) {
        const values = matrixRows[i].values || [];
        const folded = values.map((v) => fold(cellText(v)));
        const mapped = {};
        Object.entries(HEADERS).forEach(([key, names]) => {
            const at = folded.findIndex((h) => names.includes(h));
            if (at >= 0) mapped[key] = at;
        });
        const missing = REQUIRED_KEYS.filter((k) => mapped[k] === undefined);
        if (!missing.length) { headerAt = i; colOf = mapped; } else if (Object.keys(mapped).length >= 3 && (!bestMissing || missing.length < bestMissing.length)) bestMissing = missing;
    }
    if (headerAt < 0) return { error: 'IMPORT_HEADERS', missing: bestMissing || REQUIRED_KEYS };
    const rows = [];
    for (let i = headerAt + 1; i < matrixRows.length; i += 1) {
        const values = matrixRows[i].values || [];
        const cells = {};
        COLUMN_KEYS.forEach((key) => { cells[key] = colOf[key] === undefined ? '' : (values[colOf[key]] === undefined || values[colOf[key]] === null ? '' : values[colOf[key]]); });
        if (COLUMN_KEYS.every((key) => cells[key] === '' || (typeof cells[key] === 'string' && !cells[key].trim()))) continue;
        rows.push({ line: matrixRows[i].line, cells });
        if (rows.length > MAX_ROWS) return { error: 'IMPORT_TOO_BIG' };
    }
    if (!rows.length) return { error: 'IMPORT_EMPTY' };
    return { rows };
}

// ---- valores -------------------------------------------------------------------------------------------------------------------------------------
const MONTHS = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
function validParts(y, mo, d, h, mi, s) {
    if (!(y >= 2000 && y <= 2100) || !(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31) || !(h >= 0 && h <= 23) || !(mi >= 0 && mi <= 59) || !(s >= 0 && s <= 59)) return null;
    const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? { y, m: mo, d, h, mi, s } : null;
}
const pad2 = (n) => String(n).padStart(2, '0');
const partsText = (p) => `${pad2(p.d)}/${pad2(p.m)}/${p.y} ${pad2(p.h)}:${pad2(p.mi)}`;
// «Fecha y hora» del archivo: una celda de fecha de Excel, un número de serie o un texto. { empty } | { ok: true, parts } | { ok: false, text }. Sin hora = 00:00.
function parseDateTime(raw) {
    if (raw instanceof Date) {
        if (Number.isNaN(raw.getTime())) return { ok: false, text: '' };
        const p = validParts(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate(), raw.getUTCHours(), raw.getUTCMinutes(), raw.getUTCSeconds());
        return p ? { ok: true, parts: p } : { ok: false, text: '' };
    }
    if (typeof raw === 'number') {
        if (!(raw > 0)) return { ok: false, text: String(raw) };
        const d = new Date(Date.UTC(1899, 11, 30) + Math.round(raw * 86400) * 1000);
        const p = validParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
        return p ? { ok: true, parts: p } : { ok: false, text: String(raw) };
    }
    const text = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    if (!text) return { empty: true };
    const lower = text.toLowerCase();
    const time = (h, mi, s, ampm) => {
        let hh = h === undefined ? 0 : Number(h);
        if (ampm) { const pm = /^p/.test(ampm); if (hh < 1 || hh > 12) return null; hh = (hh % 12) + (pm ? 12 : 0); }
        return [hh, mi === undefined ? 0 : Number(mi), s === undefined ? 0 : Number(s)];
    };
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ t]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(lower);
    let y; let mo; let d; let t;
    if (m) { y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]); t = time(m[4], m[5], m[6]); }
    else if ((m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:[ ,t]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)?$/.exec(lower))) { d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]); t = time(m[4], m[5], m[6], m[7]); }
    else if ((m = /^(\d{1,2})[/\- ]([a-z]{3,4})\.?[/\- ](\d{4})(?:[ ,t]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)?$/.exec(lower)) && MONTHS[m[2]]) { d = Number(m[1]); mo = MONTHS[m[2]]; y = Number(m[3]); t = time(m[4], m[5], m[6], m[7]); }
    else return { ok: false, text };
    if (!t) return { ok: false, text };
    const p = validParts(y, mo, d, t[0], t[1], t[2]);
    return p ? { ok: true, parts: p } : { ok: false, text };
}
// Un número del archivo (una celda numérica o un texto: $1,234.50 / 12,5 / 149). { empty } | { ok: true, value } | { ok: false, text }.
function parseNumber(raw) {
    if (raw instanceof Date) return { ok: false, text: '' };
    if (typeof raw === 'number') return Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false, text: String(raw) };
    let text = String(raw == null ? '' : raw).replace(/\s+/g, '').trim();
    if (!text) return { empty: true };
    const original = text;
    text = text.replace(/^\$/, '').replace(/%$/, '');
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, '');
    else if (/^-?\d+,\d+$/.test(text)) text = text.replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(text)) return { ok: false, text: original };
    return { ok: true, value: Number(text), percent: /%$/.test(original) };
}
// El IVA % del archivo: 16, «16%» o 0.16 (una celda en formato porcentaje llega como 0.16).
function parseTaxRate(raw) {
    const n = parseNumber(raw);
    if (n.empty) return { ok: true, value: 16 };
    if (!n.ok) return n;
    let value = n.value;
    if (typeof raw === 'number' && value > 0 && value < 1) value *= 100;
    value = r2(value);
    return value >= 0 && value <= 100 ? { ok: true, value } : { ok: false, text: String(raw) };
}

// Hora de reloj → ISO UTC, con la zona que pase quien llama (ctx.toUtc recibe { y, m, d, h, mi, s } y devuelve un Date).
const utcStamp = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

// ---- la revisión ---------------------------------------------------------------------------------------------------------------------------------
// rawRows = [{ line, cells }]. ctx = { centerByCode(upperCode) → { id, code, name, site_code, status } | null, centersOfSite(siteCode) → [codes] (para sugerir), existingTicket(siteCode, folio) → { created_at } | null, toUtc(parts) → Date, now: ms }.
// Devuelve { tickets: [...], summary } (los tickets traen sus renglones, en el orden en que aparecen en el archivo).
function planImport(rawRows, ctx) {
    const msg = (code, params) => ({ code, params: params || {} });
    const rows = rawRows.map((raw) => {
        const c = raw.cells;
        const errors = [];
        const row = { line: raw.line, errors, messages: errors, status: 'ready', raw: {} };
        // lo escrito tal cual, para mostrarlo y para el Excel de «filas con problema»
        const showDate = (v) => { if (v instanceof Date) { const p = parseDateTime(v); return p.ok ? partsText(p.parts) : ''; } return cellText(v); };
        row.raw = { folio: cellText(c.folio), soldAt: showDate(c.soldAt), center: cellText(c.center), servedBy: cellText(c.servedBy), place: cellText(c.place), concept: cellText(c.concept), quantity: cellText(c.quantity), price: cellText(c.price), taxRate: cellText(c.taxRate), payment: cellText(c.payment), received: cellText(c.received) };
        row.folio = row.raw.folio;
        if (!row.folio) errors.push(msg('FOLIO_REQUIRED'));
        else if (row.folio.length > MAX_TEXT.folio) errors.push(msg('TEXT_TOO_LONG', { field: 'folio', max: MAX_TEXT.folio }));
        // centro de costos
        row.centerText = row.raw.center;
        row.center = null;
        if (!row.centerText) errors.push(msg('CENTER_REQUIRED'));
        else {
            const found = ctx.centerByCode(row.centerText.toUpperCase());
            if (!found) {
                const prefix = row.centerText.toUpperCase().split('-')[0];
                const suggest = (ctx.centersOfSite ? ctx.centersOfSite(prefix) : []).slice(0, 3);
                errors.push(msg('CENTER_NOT_FOUND', { code: row.centerText, suggest: suggest.join(', ') }));
            } else if (found.status !== 'active' || !found.site_code) errors.push(msg('CENTER_INACTIVE', { code: found.code }));
            else row.center = found;
        }
        // fecha y hora
        const when = parseDateTime(c.soldAt);
        row.soldAtParts = null;
        if (when.empty) errors.push(msg('DATE_REQUIRED'));
        else if (!when.ok) errors.push(msg('DATE_INVALID', { text: when.text }));
        else {
            const utc = ctx.toUtc(when.parts);
            if (utc.getTime() > ctx.now + FUTURE_SLACK_MS) errors.push(msg('DATE_FUTURE'));
            else { row.soldAtParts = when.parts; row.soldAtUtc = utc; }
        }
        // concepto, cantidad, precio, IVA
        row.concept = row.raw.concept;
        if (!row.concept) errors.push(msg('CONCEPT_REQUIRED'));
        else if (row.concept.length > MAX_TEXT.concept) errors.push(msg('TEXT_TOO_LONG', { field: 'concept', max: MAX_TEXT.concept }));
        const qty = parseNumber(c.quantity);
        if (qty.empty) errors.push(msg('QUANTITY_REQUIRED'));
        else if (!qty.ok || !(qty.value > 0) || qty.value > 100000) errors.push(msg('QUANTITY_INVALID', { text: row.raw.quantity }));
        else row.quantity = r3(qty.value);
        const price = parseNumber(c.price);
        if (price.empty) errors.push(msg('PRICE_REQUIRED'));
        else if (!price.ok || price.value < 0 || price.value > 10000000) errors.push(msg('PRICE_INVALID', { text: row.raw.price }));
        else row.price = r2(price.value);
        const tax = parseTaxRate(c.taxRate);
        if (!tax.ok) errors.push(msg('TAX_INVALID', { text: row.raw.taxRate }));
        else row.taxRate = tax.value;
        // lo opcional
        row.servedBy = row.raw.servedBy; row.place = row.raw.place; row.payment = row.raw.payment;
        [['servedBy', row.servedBy], ['place', row.place], ['payment', row.payment]].forEach(([field, value]) => { if (value.length > MAX_TEXT[field]) errors.push(msg('TEXT_TOO_LONG', { field, max: MAX_TEXT[field] })); });
        const received = parseNumber(c.received);
        row.received = null;
        if (!received.empty) { if (!received.ok || received.value < 0 || received.value > 10000000) errors.push(msg('RECEIVED_INVALID', { text: row.raw.received })); else row.received = r2(received.value); }
        if (row.quantity !== undefined && row.price !== undefined) row.lineTotal = r2(row.quantity * row.price);
        return row;
    });

    // ---- juntar por ticket: sitio + folio. Un renglón con centro que no se pudo resolver se pega al ticket de ese folio si el folio tiene un solo sitio; si no, queda aparte.
    const sitesOfFolio = new Map();
    rows.forEach((row) => { if (row.center) { if (!sitesOfFolio.has(row.folio)) sitesOfFolio.set(row.folio, new Set()); sitesOfFolio.get(row.folio).add(row.center.site_code); } });
    const tickets = new Map();
    rows.forEach((row) => {
        let site = row.center ? row.center.site_code : '';
        if (!site) { const sites = sitesOfFolio.get(row.folio); site = sites && sites.size === 1 ? [...sites][0] : '?'; }
        row.siteCode = site;
        const key = `${site}|${row.folio}`;
        if (!tickets.has(key)) tickets.set(key, { key, folio: row.folio, siteCode: site, rows: [], errors: [] });
        tickets.get(key).rows.push(row);
    });
    const out = [];
    tickets.forEach((tk) => {
        const first = tk.rows[0];
        // los renglones de un mismo folio deben coincidir en fecha y hora, centro y (si se llenan) atendió, mesa o caja y forma de pago
        const ref = { soldAt: null, center: null, servedBy: null, place: null, payment: null, received: null };
        tk.rows.forEach((row) => {
            const values = { soldAt: row.soldAtParts ? partsText(row.soldAtParts) : '', center: row.center ? row.center.code : '', servedBy: fold(row.servedBy), place: fold(row.place), payment: fold(row.payment), received: row.received === null ? '' : String(row.received) };
            Object.keys(ref).forEach((field) => {
                const value = values[field];
                if (!value) return;
                if (ref[field] === null) ref[field] = { value, line: row.line };
                else if (ref[field].value !== value) row.errors.push(msg('MISMATCH', { field, other: ref[field].line }));
            });
        });
        if (tk.rows.length > MAX_LINES_PER_TICKET) tk.errors.push(msg('TICKET_TOO_BIG', { max: MAX_LINES_PER_TICKET }));
        const base = tk.rows.find((r) => r.center) || first;
        tk.centerId = base.center ? base.center.id : null;
        tk.centerCode = base.center ? base.center.code : base.centerText;
        tk.centerName = base.center ? base.center.name : '';
        tk.soldAtParts = (tk.rows.find((r) => r.soldAtParts) || {}).soldAtParts || null;
        tk.soldAtUtc = (tk.rows.find((r) => r.soldAtUtc) || {}).soldAtUtc || null;
        tk.soldAtText = tk.soldAtParts ? partsText(tk.soldAtParts) : first.raw.soldAt;
        tk.servedBy = ref.servedBy ? tk.rows.find((r) => r.servedBy).servedBy : '';
        tk.place = ref.place ? tk.rows.find((r) => r.place).place : '';
        tk.payment = ref.payment ? tk.rows.find((r) => r.payment).payment : '';
        tk.received = ref.received ? Number(ref.received.value) : null;
        // subtotal, IVA y total: precios con IVA incluido; el desglose se saca por tasa de IVA (como el ticket de referencia)
        const byRate = new Map();
        let items = 0;
        tk.rows.forEach((row) => { if (row.lineTotal !== undefined) { byRate.set(row.taxRate, r2((byRate.get(row.taxRate) || 0) + row.lineTotal)); items += row.quantity; } });
        let total = 0; let subtotal = 0;
        byRate.forEach((sum, rate) => { const base0 = r2(sum / (1 + (rate || 0) / 100)); subtotal = r2(subtotal + base0); total = r2(total + sum); });
        tk.total = total; tk.subtotal = subtotal; tk.tax = r2(total - subtotal); tk.items = r3(items);
        const rowErrors = tk.rows.some((r) => r.errors.length);
        if (!rowErrors && !tk.errors.length && !(tk.total > 0)) tk.errors.push(msg('TOTAL_ZERO'));
        const hasErrors = rowErrors || tk.errors.length > 0;
        const existing = !hasErrors && tk.siteCode !== '?' ? ctx.existingTicket(tk.siteCode, tk.folio) : null;
        if (hasErrors) {
            tk.status = 'error';
            const firstBad = tk.rows.find((r) => r.errors.length);
            if (firstBad) {
                tk.rows.forEach((row) => {
                    if (row.errors.length) row.status = 'error';
                    else { row.status = 'blocked'; row.errors.push(msg('TICKET_BLOCKED', { other: firstBad.line })); }
                });
            } else {
                // solo errores del ticket entero (demasiados renglones, importe en cero): el primer renglón los dice y los demás quedan bloqueados
                tk.rows.forEach((row, i) => {
                    row.status = i === 0 ? 'error' : 'blocked';
                    if (i === 0) tk.errors.forEach((e) => row.errors.push(e)); else row.errors.push(msg('TICKET_BLOCKED', { other: first.line }));
                });
            }
        } else if (existing) {
            tk.status = 'skip';
            tk.existingAt = existing.created_at;
            tk.rows.forEach((row) => { row.status = 'skip'; row.errors.push(msg('FOLIO_EXISTS', { date: existing.created_at })); });
        } else {
            tk.status = 'ready';
            tk.rows.forEach((row) => { row.status = 'ready'; });
        }
        tk.lines = tk.rows.map((row, i) => ({ lineNo: i + 1, line: row.line, concept: row.concept, quantity: row.quantity, price: row.price, taxRate: row.taxRate, total: row.lineTotal }));
        out.push(tk);
    });
    const summary = { rows: rows.length, tickets: out.length, ready: 0, skipped: 0, errors: 0, readyRows: 0 };
    out.forEach((tk) => {
        if (tk.status === 'ready') { summary.ready += 1; summary.readyRows += tk.rows.length; } else if (tk.status === 'skip') summary.skipped += 1; else summary.errors += 1;
    });
    return { tickets: out, summary };
}

// Lo que la pantalla necesita ver de un ticket revisado (sin objetos internos).
function publicTicket(tk) {
    return {
        key: tk.key, folio: tk.folio, siteCode: tk.siteCode === '?' ? '' : tk.siteCode, centerCode: tk.centerCode || '', centerName: tk.centerName || '', soldAt: tk.soldAtText || '', servedBy: tk.servedBy, place: tk.place, payment: tk.payment, received: tk.received,
        subtotal: tk.subtotal, tax: tk.tax, total: tk.total, items: tk.items, status: tk.status, existingAt: tk.existingAt || '',
        rows: tk.rows.map((row) => ({ line: row.line, status: row.status, soldAt: row.raw.soldAt, center: row.raw.center, concept: row.raw.concept, quantity: row.raw.quantity, price: row.raw.price, messages: row.errors, raw: row.raw })),
    };
}

// ---- la plantilla (Excel) --------------------------------------------------------------------------------------------------------------------------
async function buildTemplate(lang, centers) {
    const L = TEMPLATE_TEXT[lang === 'en' ? 'en' : 'es'];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(L.sheets[0]);
    const howSheet = workbook.addWorksheet(L.sheets[1]);
    const exSheet = workbook.addWorksheet(L.sheets[2]);
    const centersSheet = workbook.addWorksheet(L.sheets[3]);
    const head = COLUMN_KEYS.map((key) => L.headers[key]);
    const fillHead = (row) => {
        row.font = { bold: true };
        row.eachCell((cell, col) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REQUIRED_KEYS.includes(COLUMN_KEYS[col - 1]) ? 'FFD4E8D6' : 'FFE7EBF3' } }; cell.border = { bottom: { style: 'thin' } }; });
    };
    fillHead(sheet.addRow(head));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const widths = { folio: 14, soldAt: 20, center: 22, servedBy: 24, place: 14, concept: 34, quantity: 10, price: 16, taxRate: 9, payment: 16, received: 12 };
    COLUMN_KEYS.forEach((key, i) => { sheet.getColumn(i + 1).width = widths[key]; });
    // el folio como texto (no se pierden los ceros de la izquierda), la fecha con su formato y los números como números
    sheet.getColumn(1).numFmt = '@';
    sheet.getColumn(2).numFmt = 'dd/mm/yyyy hh:mm';
    [7, 8, 9, 11].forEach((col) => { sheet.getColumn(col).numFmt = col === 7 ? '0.###' : '#,##0.00'; });
    const centerCol = COLUMN_KEYS.indexOf('center') + 1;
    const payCol = COLUMN_KEYS.indexOf('payment') + 1;
    const centersRange = `'${L.sheets[3]}'!$A$2:$A$${Math.max(2, centers.length + 1)}`;
    for (let r = 2; r <= 1001; r += 1) {
        if (centers.length) sheet.getCell(r, centerCol).dataValidation = { type: 'list', allowBlank: true, formulae: [centersRange], showErrorMessage: true, errorStyle: 'stop', error: L.sheets[3] };
        sheet.getCell(r, payCol).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${L.payments.join(',')}"`], showErrorMessage: false };
    }
    howSheet.getColumn(1).width = 120;
    howSheet.addRow([L.how]).font = { bold: true, size: 13 };
    L.steps.forEach((step, i) => { const row = howSheet.addRow([`${i + 1}. ${step}`]); row.alignment = { wrapText: true, vertical: 'top' }; });
    // un ejemplo con las mismas columnas, en su propia hoja (así no se carga sin querer)
    fillHead(exSheet.addRow(head));
    COLUMN_KEYS.forEach((key, i) => { exSheet.getColumn(i + 1).width = widths[key]; });
    const c1 = (centers[0] && centers[0].code) || 'PARQU-ALM';
    const when = '23/11/2026 14:32';
    [['000482', when, c1, 'Ramírez López Ana', 'Mesa 12', 'Ensalada de pollo', 2, 149, '', L.payments[1], ''],
        ['000482', when, c1, 'Ramírez López Ana', 'Mesa 12', 'Dedos de queso', 1, 139, '', L.payments[1], ''],
        ['000483', '23/11/2026 15:05', c1, 'Gómez Ruiz Luis', 'Caja 03', 'Detergente 1 kg', 1, 62, 16, L.payments[0], 200]].forEach((r) => exSheet.addRow(r));
    centersSheet.addRow(L.centersHead).font = { bold: true };
    centers.forEach((c) => centersSheet.addRow([c.code, c.name, c.site_code || '', c.sucursal || '']));
    [34, 36, 12, 30].forEach((w, i) => { centersSheet.getColumn(i + 1).width = w; });
    return workbook;
}

module.exports = {
    MAX_ROWS, MAX_LINES_PER_TICKET, COLUMN_KEYS, REQUIRED_KEYS, TEMPLATE_TEXT, HEADERS,
    readWorkbookRows, parseMatrix, parseDateTime, parseNumber, parseTaxRate, planImport, publicTicket, buildTemplate, utcStamp, partsText, fold, r2,
};
