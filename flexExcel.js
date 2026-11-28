'use strict';
// ---------------------------------------------------------------------------
// Cargas Manuales › Registros Información: el EXCEL con formato de una tabla libre (Daniel, 2026-11-26, «así lo manejo en Excel»).
// Un registro lleva UN formato de descarga (se guarda con el registro) que dice cómo sale su Excel:
//   · hoja «Datos»: encabezado (relleno, letra, negritas, filtro automático), una fila de apoyo arriba del encabezado (los días de cada mes, la suma o el promedio de cada columna),
//     el formato de cada columna (letra, colores, bordes, alineación y formato de número: General, Número, Moneda, Contabilidad, Fecha corta, Fecha larga, Hora, Porcentaje, Fracción, Científica),
//     paneles fijos y anchos de columna;
//   · hoja «Resumen»: título, datos generales (registro, última carga, quién y cuándo descargó, filtros, renglones y columnas) e indicadores.
// Sin formato guardado sale el de siempre de Daniel: encabezado morado con letra blanca, fila de días del mes (si hay columnas de mes), columnas llave en lila, montos como Moneda, fechas como Fecha corta, filtro y paneles fijos.
// Lógica pura (sin base de datos): lo que se guarda lo revisa cleanFormat; el libro lo arma writeWorkbook.
// ---------------------------------------------------------------------------
const ExcelJS = require('exceljs');
const manual = require('./manualRegistries.js');

const FONTS = ['Aptos Narrow', 'Calibri', 'Arial', 'Cambria', 'Times New Roman', 'Verdana', 'Courier New', 'Consolas'];
const NUMBER_FORMATS = ['general', 'numero', 'moneda', 'contabilidad', 'fcorta', 'flarga', 'hora', 'porcentaje', 'fraccion', 'cientifica'];
const CURRENCIES = { MXN: '$', USD: 'US$', EUR: '€' };
const SUPPORT_KINDS = ['none', 'days', 'sum', 'avg'];
const KPI_KEYS = ['rows', 'distinct', 'last', 'change'];
const ALIGNS = ['left', 'center', 'right'];
const VALIGNS = ['top', 'middle', 'bottom'];
const MAX_COLUMN_FORMATS = 500;
const HEX = /^#[0-9a-fA-F]{6}$/;
const fold = (v) => manual.fold(v);

const DEFAULTS = {
    v: 1,
    header: { fill: '#9a3cc2', ink: '#ffffff', bold: true, filter: true },
    support: { kind: 'auto', fill: '#fbe3d3', ink: '#c00000', bold: true }, // auto = los días del mes si hay columnas de mes
    keyFill: '#ead0f0',
    freeze: { cols: 'auto', header: true }, // auto = hasta la última columna llave del principio
    cover: { on: true, kpis: ['rows', 'distinct', 'last', 'change'] },
    bands: false,
    widths: 'auto',
    columns: {},
};

const pickColor = (v) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null);

// El formato de UNA columna: solo lo que se permite, con su tipo.
function cleanColumnFormat(raw) {
    const f = {};
    if (!raw || typeof raw !== 'object') return f;
    if (FONTS.includes(raw.fam)) f.fam = raw.fam;
    const size = Number(raw.size);
    if (Number.isFinite(size) && size >= 6 && size <= 36) f.size = Math.round(size * 2) / 2;
    ['b', 'i', 'u', 'bd', 'miles'].forEach((k) => { if (raw[k] === true) f[k] = true; });
    if (pickColor(raw.fill)) f.fill = pickColor(raw.fill);
    if (pickColor(raw.ink)) f.ink = pickColor(raw.ink);
    // el encabezado de ESTA columna (Daniel, 2026-11-26): relleno, letra y negritas; sin esto toma el encabezado de todo el registro
    if (pickColor(raw.hfill)) f.hfill = pickColor(raw.hfill);
    if (pickColor(raw.hink)) f.hink = pickColor(raw.hink);
    if (raw.hb === true) f.hb = true;
    if (ALIGNS.includes(raw.al)) f.al = raw.al;
    // «Ajustar texto» y la alineación vertical de las celdas (va, wrap) y del encabezado (hal, hva, hwrap) de ESTA columna (Daniel, 2026-11-27): mandan sobre lo que la persona puso para toda la tabla
    if (VALIGNS.includes(raw.va)) f.va = raw.va;
    if (raw.wrap === true) f.wrap = true;
    if (ALIGNS.includes(raw.hal)) f.hal = raw.hal;
    if (VALIGNS.includes(raw.hva)) f.hva = raw.hva;
    if (raw.hwrap === true) f.hwrap = true;
    if (NUMBER_FORMATS.includes(raw.nf) && raw.nf !== 'general') f.nf = raw.nf;
    if (Number.isInteger(raw.dec) && raw.dec >= 0 && raw.dec <= 6) f.dec = raw.dec;
    if (CURRENCIES[raw.cur]) f.cur = raw.cur;
    if (raw.neg === 'rojo' || raw.neg === 'par') f.neg = raw.neg;
    return f;
}
// El formato completo de un registro tal como lo manda el navegador, revisado. Lo que falte toma lo de siempre.
function cleanFormat(raw) {
    const out = { v: 1 };
    const r = raw && typeof raw === 'object' ? raw : {};
    const h = r.header && typeof r.header === 'object' ? r.header : {};
    out.header = { fill: pickColor(h.fill) || DEFAULTS.header.fill, ink: pickColor(h.ink) || DEFAULTS.header.ink, bold: h.bold !== false, filter: h.filter !== false };
    const s = r.support && typeof r.support === 'object' ? r.support : {};
    out.support = { kind: s.kind === 'auto' || SUPPORT_KINDS.includes(s.kind) ? s.kind : 'auto', fill: pickColor(s.fill) || DEFAULTS.support.fill, ink: pickColor(s.ink) || DEFAULTS.support.ink, bold: s.bold !== false };
    out.keyFill = r.keyFill === null || r.keyFill === '' ? null : (pickColor(r.keyFill) || DEFAULTS.keyFill);
    const fz = r.freeze && typeof r.freeze === 'object' ? r.freeze : {};
    out.freeze = { cols: fz.cols === 'auto' || fz.cols === undefined ? 'auto' : (Number.isInteger(fz.cols) && fz.cols >= 0 && fz.cols <= 50 ? fz.cols : 'auto'), header: fz.header !== false };
    const cv = r.cover && typeof r.cover === 'object' ? r.cover : {};
    out.cover = { on: cv.on !== false, kpis: Array.isArray(cv.kpis) ? cv.kpis.filter((k, i, a) => KPI_KEYS.includes(k) && a.indexOf(k) === i).slice(0, 4) : DEFAULTS.cover.kpis.slice() };
    out.bands = r.bands === true;
    out.widths = 'auto';
    out.columns = {};
    const cols = r.columns && typeof r.columns === 'object' ? r.columns : {};
    Object.keys(cols).slice(0, MAX_COLUMN_FORMATS).forEach((name) => {
        const key = fold(name).slice(0, 80); // se guarda por el nombre de la columna sin mayúsculas ni acentos: así vale también para las columnas nuevas de la siguiente carga
        const f = cleanColumnFormat(cols[name]);
        if (key && Object.keys(f).length) out.columns[key] = f;
    });
    return out;
}
const mergeFormat = (saved) => cleanFormat(saved || DEFAULTS);
// El formato que se ve en la PANTALLA (Daniel, 2026-11-26, «menú en el encabezado»): solo lo que la persona dejó guardado para cada columna (las columnas se emparejan por el nombre sin mayúsculas ni acentos, como en el Excel).
// Lo automático del Excel (montos como Moneda, fechas como Fecha corta, llave en lila) no se aplica en pantalla: así la tabla no cambia sola. Devuelve un arreglo del mismo largo que `columns`, con null donde no hay formato.
const columnKey = (name) => fold(name).slice(0, 80);
function screenFormats(columns, savedFormat) {
    const fmt = mergeFormat(savedFormat);
    return columns.map((c) => { const f = fmt.columns[columnKey(c.name)]; return f && Object.keys(f).length ? { ...f } : null; });
}
// Guarda (o borra, con un formato vacío) el formato de UNA columna dentro del formato completo del registro. Devuelve { format, key, fmt } con lo que de verdad quedó.
function setColumnFormat(savedFormat, name, rawColumnFormat) {
    const full = mergeFormat(savedFormat);
    const key = columnKey(name);
    const clean = cleanColumnFormat(rawColumnFormat);
    if (Object.keys(clean).length) full.columns[key] = clean; else delete full.columns[key];
    return { format: cleanFormat(full), key, fmt: Object.keys(clean).length ? clean : null };
}

// Cuando a una columna se le cambia el nombre, su formato guardado la sigue (si el nombre nuevo no tiene ya uno). Devuelve el formato nuevo, o null si no hay nada que mover.
function renameColumnFormat(savedFormat, oldName, newName) {
    if (!savedFormat) return null;
    const full = mergeFormat(savedFormat);
    const from = columnKey(oldName);
    const to = columnKey(newName);
    if (!from || !to || from === to || !full.columns[from] || full.columns[to]) return null;
    full.columns[to] = full.columns[from];
    delete full.columns[from];
    return cleanFormat(full);
}

// ---- cómo se escribe cada cosa en Excel ---------------------------------------------------------------------------------------------------------------------
const zeros = (n) => (n > 0 ? `.${'0'.repeat(n)}` : '');
function numFmtOf(f) {
    const dec = Number.isInteger(f.dec) ? f.dec : null;
    const sym = CURRENCIES[f.cur || 'MXN'];
    switch (f.nf) {
        case 'numero': return (f.miles ? '#,##0' : '0') + zeros(dec === null ? 2 : dec);
        case 'moneda': {
            const base = `"${sym}"#,##0${zeros(dec === null ? 2 : dec)}`;
            if (f.neg === 'rojo') return `${base};[Red]-${base}`;
            if (f.neg === 'par') return `${base}_);(${base})`;
            return base;
        }
        case 'contabilidad': {
            const d = zeros(dec === null ? 2 : dec);
            return `_("${sym}"* #,##0${d}_);_("${sym}"* (#,##0${d});_("${sym}"* "-"??_);_(@_)`;
        }
        case 'fcorta': return 'dd/mm/yyyy';
        case 'flarga': return 'dddd, d "de" mmmm "de" yyyy';
        case 'hora': return 'hh:mm:ss';
        case 'porcentaje': return `0${zeros(dec === null ? 2 : dec)}%`;
        case 'fraccion': return '# ?/?';
        case 'cientifica': return `0${zeros(dec === null ? 2 : dec)}E+00`;
        default: return null;
    }
}
const argb = (hex) => `FF${hex.slice(1).toUpperCase()}`;
// La alineación del encabezado de una columna: lo que lleve en su panel (horizontal, vertical, «Ajustar texto») y, si no lleva, la de siempre (`horizontal`).
function headerAlignment(f, horizontal) {
    const a = { vertical: f.hva || 'middle' };
    const h = f.hal || horizontal;
    if (h) a.horizontal = h;
    if (f.hwrap) a.wrapText = true;
    return a;
}
function styleOf(f, extra = {}) {
    const style = {};
    const font = {};
    if (f.fam) font.name = f.fam;
    if (f.size) font.size = f.size;
    if (f.b || extra.bold) font.bold = true;
    if (f.i) font.italic = true;
    if (f.u) font.underline = true;
    if (f.ink || extra.ink) font.color = { argb: argb(f.ink || extra.ink) };
    if (Object.keys(font).length) style.font = font;
    const fill = f.fill || extra.fill;
    if (fill) style.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(fill) } };
    const al = f.al || extra.al;
    // sin pedir alineación ni «Ajustar texto» no se le pone estilo a las celdas (3 millones de celdas con estilo hacían la descarga el doble de lenta)
    if (al || f.va || f.wrap) {
        style.alignment = { vertical: f.va || 'middle' };
        if (al) style.alignment.horizontal = al;
        if (f.wrap) style.alignment.wrapText = true;
    }
    if (f.bd || extra.bd) { const side = { style: 'thin', color: { argb: 'FF000000' } }; style.border = { top: side, left: side, bottom: side, right: side }; }
    const nf = numFmtOf(f);
    if (nf) style.numFmt = nf;
    return style;
}

// ---- lo que dice cada texto del libro (es/en) --------------------------------------------------------------------------------------------------------------
const T = {
    es: { data: 'Datos', summary: 'Resumen', general: 'DATOS GENERALES', kpis: 'INDICADORES', registry: 'Registro', lastLoad: 'Última carga', file: 'Archivo cargado', loadedBy: 'Cargado por', downloadedBy: 'Descargado por', downloadedAt: 'Descargado el', filters: 'Filtros aplicados', none: 'Ninguno', search: 'Búsqueda', colFilters: 'Filtros de columna', rows: 'Renglones', columns: 'Columnas', visible: 'visibles', of: 'de', days: 'Días del mes', sum: 'Suma', avg: 'Promedio', distinct: 'distintos', total: 'Total', vs: 'Contra', up: 'sube', down: 'baja', same: 'igual', downloadedOn: 'Descargado el', at: 'a las', by: 'por' },
    en: { data: 'Data', summary: 'Summary', general: 'GENERAL DATA', kpis: 'INDICATORS', registry: 'Record', lastLoad: 'Last load', file: 'Loaded file', loadedBy: 'Loaded by', downloadedBy: 'Downloaded by', downloadedAt: 'Downloaded on', filters: 'Filters applied', none: 'None', search: 'Search', colFilters: 'Column filters', rows: 'Rows', columns: 'Columns', visible: 'visible', of: 'of', days: 'Days in month', sum: 'Sum', avg: 'Average', distinct: 'distinct', total: 'Total', vs: 'Versus', up: 'up', down: 'down', same: 'same', downloadedOn: 'Downloaded on', at: 'at', by: 'by' },
};
const MONTHS = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] };
const pad2 = (n) => String(n).padStart(2, '0');
// 'AAAA-MM-DD HH:MM:SS' (UTC) o un Date → «26/nov/2026 01:03» en la hora de quien mira (tz = minutos que va detrás de UTC)
function whenText(value, tz, lang) {
    const d = value instanceof Date ? value : new Date(`${String(value).replace(' ', 'T')}Z`);
    if (Number.isNaN(d.getTime())) return '';
    const local = new Date(d.getTime() - (Number(tz) || 0) * 60000);
    return `${pad2(local.getUTCDate())}/${MONTHS[lang][local.getUTCMonth()]}/${local.getUTCFullYear()} ${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`;
}
const daysInMonth = (period) => { const m = /^(\d{4})-(\d{2})$/.exec(period || ''); return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate() : null; };
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/;
const toDate = (text) => { const m = ISO_DATE.exec(text); return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0))) : null; };
const MONEY_NAME = /(costo|cost|precio|price|importe|monto|amount|valor total)/;

// El formato que de verdad se aplica a cada columna del libro: lo de siempre (llave en lila, montos como Moneda, fechas como Fecha corta, meses a la derecha) y, encima, lo que la persona dejó guardado.
// decOverride (0 a 6): los decimales que la persona eligió en pantalla (`Encabezados y celdas` › Celdas): valen para toda columna con números (también las que traen su formato propio); null = los de cada columna.
function effectiveColumns(columns, format, sampleRows, decOverride = null) {
    return columns.map((c, i) => {
        const base = {};
        if (format.keyFill && c.group === 'key') base.fill = format.keyFill;
        let dateLike = false;
        if (c.group !== 'value') {
            let seen = 0; let ok = 0;
            for (const r of sampleRows) { const v = r[i]; if (v === null || v === undefined || v === '') continue; seen += 1; if (typeof v === 'string' && ISO_DATE.test(v)) ok += 1; }
            dateLike = seen > 0 && ok / seen >= 0.9;
        }
        if (dateLike) base.nf = 'fcorta';
        if (c.group === 'value' && MONEY_NAME.test(fold(c.name))) { base.nf = 'moneda'; base.dec = 2; }
        const mine = format.columns[fold(c.name)] || {};
        const f = { ...base, ...mine };
        // un formato de número guardado «General» no existe (se borra); si la persona dejó la columna sin tipo se queda lo automático
        const isDate = f.nf === 'fcorta' || f.nf === 'flarga' || f.nf === 'hora';
        if (Number.isInteger(decOverride) && decOverride >= 0 && decOverride <= 6 && !(isDate && c.group !== 'value')) {
            let seen = 0; let numbers = 0;
            for (const r of sampleRows) { const v = r[i]; if (v === null || v === undefined || v === '') continue; seen += 1; if (typeof v === 'number') numbers += 1; }
            if (c.group === 'value' || (seen > 0 && numbers / seen >= 0.9)) { f.dec = decOverride; if (!f.nf) f.nf = 'numero'; }
        }
        return { f, isDate: isDate && c.group !== 'value' };
    });
}

// Arma el libro y lo escribe en `stream`. batches = lotes de renglones ya filtrados y con SOLO las columnas que se bajan, en su orden.
//   columns: [{ key, label, name, group ('key'|'data'|'value'|'load'), kind }]   meta: { lang, tz, registryName, by, lastLoad: { fileName, loadedBy, createdAt }|null, filtersText, totalColumns }
async function writeWorkbook({ stream, batches, columns, format, meta, decOverride = null }) {
    const lang = meta.lang === 'en' ? 'en' : 'es';
    const tt = T[lang];
    const fmt = format || mergeFormat(null);
    const sample = [];
    for (const b of batches) { for (const r of b) { sample.push(r); if (sample.length >= 500) break; } if (sample.length >= 500) break; }
    const eff = effectiveColumns(columns, fmt, sample, decOverride);

    // lo que sale en la portada y en la fila de apoyo, de un solo recorrido
    let rowCount = 0;
    const firstKey = columns.findIndex((c) => c.group === 'key');
    const distinct = new Set();
    const valueIdx = columns.map((c, i) => (c.group === 'value' ? i : -1)).filter((i) => i >= 0);
    const sums = new Array(columns.length).fill(0);
    const counts = new Array(columns.length).fill(0);
    for (const b of batches) {
        for (const r of b) {
            rowCount += 1;
            if (firstKey >= 0 && r[firstKey] !== null && r[firstKey] !== undefined && r[firstKey] !== '') distinct.add(r[firstKey]);
            valueIdx.forEach((i) => { const v = r[i]; if (typeof v === 'number') { sums[i] += v; counts[i] += 1; } });
        }
    }

    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true, useSharedStrings: false });
    wb.creator = 'SGN';
    const monthOf = columns.map((c) => (c.group === 'value' ? manual.parsePeriodHeader(c.name) : null));
    let supportKind = fmt.support.kind;
    if (supportKind === 'auto') supportKind = monthOf.some(Boolean) ? 'days' : 'none';
    const hasSupport = supportKind !== 'none';
    const headerRow = hasSupport ? 2 : 1;

    // ---- hoja «Datos»
    const dataName = tt.data;
    let frozenCols = fmt.freeze.cols;
    if (frozenCols === 'auto') { frozenCols = 0; while (frozenCols < columns.length && columns[frozenCols].group === 'key') frozenCols += 1; }
    const sheet = wb.addWorksheet(dataName, { views: [{ state: 'frozen', xSplit: Math.min(frozenCols, columns.length), ySplit: fmt.freeze.header ? headerRow : 0 }] });
    // anchos: lo más largo del título y de los primeros renglones
    const approxLen = (c, e, v) => {
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'number') { const dec = Number.isInteger(e.f.dec) ? e.f.dec : 0; const t = e.f.nf === 'porcentaje' ? `${(v * 100).toFixed(dec)}%` : v.toFixed(Math.max(dec, Number.isInteger(v) ? 0 : Math.min(4, String(v).split('.')[1] ? String(v).split('.')[1].length : 0))); return t.length + (e.f.nf === 'moneda' || e.f.nf === 'contabilidad' ? 3 : 0) + (e.f.miles || e.f.nf === 'moneda' || e.f.nf === 'contabilidad' ? Math.floor(t.length / 3) : 0); }
        if (e.isDate) return e.f.nf === 'flarga' ? 30 : 10;
        return String(v).length;
    };
    sheet.columns = columns.map((c, i) => {
        let max = String(c.label).length + 3;
        for (const r of sample) max = Math.max(max, approxLen(c, eff[i], r[i]));
        const style = styleOf(eff[i].f);
        // los números y las fechas ya van a la derecha en Excel: sin pedir alineación no se le pone estilo a las celdas (3 millones de celdas con estilo hacían la descarga el doble de lenta)
        return { key: `c${i}`, width: Math.min(60, Math.max(8, Math.round(max * 1.1 + 2))), style };
    });
    if (hasSupport) {
        const row = sheet.addRow(columns.map(() => null));
        const firstMonth = monthOf.findIndex(Boolean);
        columns.forEach((c, i) => {
            const cell = row.getCell(i + 1);
            cell.style = {};
            let v = null;
            if (supportKind === 'days') v = monthOf[i] ? daysInMonth(monthOf[i]) : null;
            else if (c.group === 'value' && counts[i]) v = supportKind === 'sum' ? sums[i] : sums[i] / counts[i];
            if (v !== null) { cell.value = v; cell.style = { font: { bold: fmt.support.bold, color: { argb: argb(fmt.support.ink) } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(fmt.support.fill) } }, alignment: { horizontal: 'center', vertical: 'middle' }, numFmt: supportKind === 'avg' ? '#,##0.00' : '#,##0.##' }; }
        });
        // la etiqueta de la fila, pegada a la primera columna de valor
        const labelAt = (firstMonth > 0 ? firstMonth : (valueIdx[0] > 0 ? valueIdx[0] : 1)) - 1;
        const label = row.getCell(labelAt + 1);
        label.value = supportKind === 'days' ? tt.days : supportKind === 'sum' ? tt.sum : tt.avg;
        label.style = { font: { italic: true, color: { argb: 'FF7A5F7D' } }, alignment: { horizontal: 'right' } };
        row.commit();
    }
    const head = sheet.addRow(columns.map((c) => c.label));
    columns.forEach((c, i) => {
        const mine = eff[i].f; // el encabezado de esta columna (si la persona le puso uno) manda sobre el de todo el registro
        head.getCell(i + 1).style = { font: { bold: mine.hb === true || fmt.header.bold, color: { argb: argb(mine.hink || fmt.header.ink) } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(mine.hfill || fmt.header.fill) } }, alignment: headerAlignment(mine, c.group === 'value' ? 'center' : 'left') };
    });
    head.commit();
    if (fmt.header.filter) sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: columns.length } };
    for (const b of batches) {
        for (const r of b) {
            const values = r.map((v, i) => (eff[i].isDate && typeof v === 'string' ? toDate(v) || v : v));
            sheet.addRow(values).commit();
        }
    }
    sheet.commit();

    // ---- hoja «Resumen» (portada)
    if (fmt.cover.on) {
        const cover = wb.addWorksheet(tt.summary, { views: [{ showGridLines: false }] });
        cover.columns = [{ width: 14 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 }];
        const purple = argb(fmt.header.fill);
        // las celdas se combinan ANTES de cerrar el renglón (después Excel en flujo ya no las deja tocar)
        const put = (rowNo, fn, merges = []) => { const row = cover.getRow(rowNo); fn(row); merges.forEach((m) => cover.mergeCells(m)); row.commit(); };
        const lab = { font: { bold: true, color: { argb: 'FF555555' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF6FA' } }, alignment: { vertical: 'middle' } };
        const thin = { style: 'thin', color: { argb: 'FFD4D4D4' } };
        const box = { top: thin, left: thin, bottom: thin, right: thin };
        put(1, () => {});
        put(2, (row) => { row.height = 30; row.getCell(1).value = meta.registryName; row.getCell(1).style = { font: { size: 20, bold: true, color: { argb: 'FF3A1B3D' } }, alignment: { vertical: 'middle' } }; }, ['A2:H2']);
        put(3, (row) => { row.getCell(1).value = `${tt.downloadedOn} ${whenText(new Date(), meta.tz, lang)} ${tt.by} ${meta.by}`; row.getCell(1).style = { font: { color: { argb: 'FF666666' } } }; }, ['A3:H3']);
        put(4, (row) => { for (let c = 1; c <= 8; c += 1) row.getCell(c).border = { bottom: { style: 'thick', color: { argb: purple } } }; row.height = 6; });
        put(6, (row) => { row.getCell(1).value = tt.general; row.getCell(1).style = { font: { bold: true, color: { argb: argb(fmt.header.ink) } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: purple } } }; }, ['A6:H6']);
        const ll = meta.lastLoad;
        const pairs = [
            [[tt.registry, meta.registryName], [tt.lastLoad, ll ? whenText(ll.createdAt, meta.tz, lang) : '—']],
            [[tt.file, ll && ll.fileName ? ll.fileName : '—'], [tt.loadedBy, ll && ll.loadedBy ? ll.loadedBy : '—']],
            [[tt.filters, [meta.searchText ? `${tt.search}: «${meta.searchText}»` : '', meta.hasColumnFilters ? tt.colFilters : ''].filter(Boolean).join(' · ') || tt.none], [tt.downloadedBy, meta.by]],
            [[tt.rows, rowCount], [tt.columns, `${columns.length} ${tt.of} ${meta.totalColumns} ${tt.visible}`]],
        ];
        pairs.forEach(([a, b], k) => {
            const n = 7 + k;
            put(n, (row) => {
                row.getCell(1).value = a[0]; row.getCell(1).style = { ...lab, border: box };
                row.getCell(3).value = a[1]; row.getCell(3).style = { alignment: { vertical: 'middle', horizontal: 'left' }, border: box, numFmt: typeof a[1] === 'number' ? '#,##0' : undefined };
                row.getCell(5).value = b[0]; row.getCell(5).style = { ...lab, border: box };
                row.getCell(7).value = b[1]; row.getCell(7).style = { alignment: { vertical: 'middle', horizontal: 'left' }, border: box };
            }, [`A${n}:B${n}`, `C${n}:D${n}`, `E${n}:F${n}`, `G${n}:H${n}`]);
        });
        // indicadores
        const lastTwo = valueIdx.slice(-2);
        const tiles = [];
        fmt.cover.kpis.forEach((k) => {
            if (k === 'rows') tiles.push({ label: tt.rows, value: rowCount, nf: '#,##0' });
            else if (k === 'distinct' && firstKey >= 0) tiles.push({ label: `${columns[firstKey].label} ${tt.distinct}`, value: distinct.size, nf: '#,##0' });
            else if (k === 'last' && lastTwo.length) { const i = lastTwo[lastTwo.length - 1]; tiles.push({ label: `${tt.total} ${columns[i].label}`, value: sums[i], nf: '#,##0.##' }); }
            else if (k === 'change' && lastTwo.length === 2 && sums[lastTwo[0]] !== 0) { const [a, b] = lastTwo; tiles.push({ label: `${tt.vs} ${columns[a].label}`, value: (sums[b] - sums[a]) / Math.abs(sums[a]), nf: '+0.0%;-0.0%;0.0%' }); }
        });
        if (tiles.length) {
            put(12, (row) => { row.getCell(1).value = tt.kpis; row.getCell(1).style = { font: { bold: true, color: { argb: argb(fmt.header.ink) } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: purple } } }; }, ['A12:H12']);
            const tile = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF2FA' } }, alignment: { horizontal: 'center', vertical: 'middle' }, border: box };
            put(13, (row) => { row.height = 18; tiles.slice(0, 4).forEach((t, k) => { const c = row.getCell(1 + k * 2); c.value = t.label; c.style = { ...tile, font: { size: 10, color: { argb: 'FF7A5F7D' } } }; }); }, tiles.slice(0, 4).map((t, k) => `${String.fromCharCode(65 + k * 2)}13:${String.fromCharCode(66 + k * 2)}13`));
            put(14, (row) => { row.height = 30; tiles.slice(0, 4).forEach((t, k) => { const c = row.getCell(1 + k * 2); c.value = t.value; c.style = { ...tile, font: { size: 18, bold: true, color: { argb: 'FF3A1B3D' } }, numFmt: t.nf }; }); }, tiles.slice(0, 4).map((t, k) => `${String.fromCharCode(65 + k * 2)}14:${String.fromCharCode(66 + k * 2)}14`));
        }
        cover.commit();
    }
    await wb.commit();
}

module.exports = { DEFAULTS, FONTS, NUMBER_FORMATS, CURRENCIES, cleanFormat, cleanColumnFormat, mergeFormat, columnKey, screenFormats, setColumnFormat, renameColumnFormat, numFmtOf, styleOf, headerAlignment, writeWorkbook, daysInMonth, effectiveColumns };
