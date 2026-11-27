'use strict';
// ---------------------------------------------------------------------------
// El Excel del Análisis (Daniel, 2026-11-26: «que la descarga del Análisis salga con el mismo formato» y «que baje todos los renglones»): lo que se ve en pantalla (las columnas visibles en su orden y los renglones
// que pasan los filtros, en su orden) o, cuando el análisis trae más renglones de los que caben en pantalla, TODOS los renglones del análisis, con el MISMO formato de cada columna: el que la persona le dio con el menú ⋮
// del encabezado (el mismo modelo de Registros Información: número, estilo de las celdas, encabezado) y, debajo de ese, el aspecto y el formato que se pudieron poner dentro de «Agregar columna» (los formatos de número
// se vuelven formatos reales de Excel: el valor sigue siendo un número). Se escribe por partes (en flujo), así un análisis de cientos de miles de renglones no se arma entero en memoria.
// ---------------------------------------------------------------------------
const ExcelJS = require('exceljs');
const flexExcel = require('./flexExcel');

const PALETTE = ['#3f78ad', '#b23fb8', '#2b8456', '#b57a05', '#4f58c2', '#c4473a']; // la misma de AnalysisKit.js
const HEX = /^#[0-9a-fA-F]{6}$/;
const HEADER = { fill: '#9a3cc2', ink: '#ffffff' }; // el encabezado de siempre de los Excel del sistema (Registros Información)
const colorOf = (c) => (Number.isInteger(c) && c >= 1 && c <= PALETTE.length ? PALETTE[c - 1] : (typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : null));
// el sombreado de datos de la pantalla es el color al 22 % sobre el fondo: sobre blanco queda así
const soft = (hex) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.22 + 255 * 0.78).toString(16).padStart(2, '0')).join('')}`;
const argb = (hex) => `FF${hex.slice(1).toUpperCase()}`;
// los formatos de número de «Agregar columna» → los de Excel (el personalizado «pers» no tiene equivalente y sale como número general)
const LEGACY_NF = {
    int: { nf: 'numero', dec: 0 }, dec1: { nf: 'numero', dec: 1 }, d1: { nf: 'numero', dec: 1 }, dec2: { nf: 'numero', dec: 2 }, d2: { nf: 'numero', dec: 2 }, miles: { nf: 'numero', dec: 2 }, d4: { nf: 'numero', dec: 4 },
    money: { nf: 'moneda', dec: 2 }, pct: { nf: 'porcentaje', dec: 0 }, cient: { nf: 'cientifica', dec: 1 }, fecha: { nf: 'fcorta' }, fechahora: { nf: 'fcorta' }, hora: { nf: 'hora' },
};
// El aspecto y el formato de «Agregar columna» (fmt, style) y los decimales de una columna agregada con una fórmula, como formato de columna.
function legacyFormat(col) {
    const f = {};
    const nf = LEGACY_NF[String(col.fmt || '')];
    if (nf) { Object.assign(f, nf); if (f.nf === 'numero') f.miles = true; }
    else if (Number.isInteger(col.decimals) && col.decimals >= 0 && col.decimals <= 6) { f.nf = 'numero'; f.dec = col.decimals; f.miles = true; } // una columna agregada con decimales fijos (como se ve en pantalla)
    const s = col.style && typeof col.style === 'object' ? col.style : {};
    if (s.b === true) { f.b = true; f.hb = true; }
    if (s.i === true) f.i = true;
    if (s.u === true) f.u = true;
    const dc = colorOf(s.dc);
    if (dc) f.fill = soft(dc);
    const hc = colorOf(s.hc);
    if (hc) { f.hfill = hc; f.hink = '#ffffff'; }
    if (Array.isArray(s.bd) && s.bd.length) f.bd = true;
    return f;
}
// El formato que de verdad lleva una columna: lo de «Agregar columna» y, encima, lo del menú ⋮ del encabezado.
const formatOf = (col) => flexExcel.cleanColumnFormat({ ...legacyFormat(col), ...(col.ff && typeof col.ff === 'object' ? col.ff : {}) });
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/;
const toDate = (text) => { const m = ISO.exec(String(text)); return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0))) : null; };
const isDateFormat = (f) => f.nf === 'fcorta' || f.nf === 'flarga' || f.nf === 'hora';
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

// Escribe el libro en `stream` (la respuesta). columns: [{ label, ff?, fmt?, style?, decimals? }]; rows: [[valor]] (números como números, textos, null).
async function writeWorkbook(stream, { columns, rows, title }) {
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true, useSharedStrings: false });
    wb.creator = 'SGN';
    const name = String(title || 'Análisis').replace(/[\\/*?:[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Análisis';
    const sheet = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    const fmts = columns.map(formatOf);
    sheet.columns = columns.map((c, i) => {
        let max = String(c.label).length + 3;
        for (let r = 0; r < rows.length && r < 60; r += 1) { const v = rows[r][i]; if (v !== null && v !== undefined) max = Math.max(max, String(typeof v === 'number' ? v.toFixed(2) : v).length + 1); }
        return { key: `c${i}`, width: Math.min(60, Math.max(10, Math.round(max * 1.1 + 2))), style: flexExcel.styleOf(fmts[i]) };
    });
    // el encabezado de cada columna: el de siempre del sistema y, encima, el que la persona le puso a esa columna
    const head = sheet.addRow(columns.map((c) => String(c.label)));
    columns.forEach((c, i) => {
        const f = fmts[i];
        head.getCell(i + 1).style = {
            font: { bold: f.hb !== false, color: { argb: argb(f.hink || HEADER.ink) } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(f.hfill || HEADER.fill) } },
            alignment: { vertical: 'middle' },
        };
    });
    head.commit();
    if (columns.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    const dateAt = fmts.map(isDateFormat);
    for (let n = 0; n < rows.length; n += 1) {
        sheet.addRow(rows[n].map((v, i) => (dateAt[i] && typeof v === 'string' ? toDate(v) || v : v))).commit();
        if (n % 1000 === 999) await nextTurn(); // cada tanda deja atender a los demás usuarios (un análisis grande son muchos renglones)
    }
    sheet.commit();
    await wb.commit();
}

const MAX_ROWS = 20000; // lo que puede mandar la pantalla (hoy ≤ 5,000); la descarga completa la arma el servidor
const MAX_COLUMNS = 200;
const MAX_TEXT = 2000;
const cleanColumn = (c) => {
    const x = c && typeof c === 'object' ? c : {};
    return { label: String(x.label == null ? '' : x.label).slice(0, 120), ff: x.ff && typeof x.ff === 'object' ? x.ff : null, fmt: typeof x.fmt === 'string' ? x.fmt.slice(0, 12) : '', style: x.style && typeof x.style === 'object' ? x.style : null, decimals: Number.isInteger(x.decimals) ? x.decimals : null };
};
// Lo que manda la pantalla, revisado: { columns, rows, title } o { error }.
function cleanPayload(body) {
    const b = body && typeof body === 'object' ? body : {};
    if (!Array.isArray(b.columns) || !b.columns.length || !Array.isArray(b.rows)) return { error: 'columns and rows are required.' };
    if (b.columns.length > MAX_COLUMNS || b.rows.length > MAX_ROWS) return { error: 'Too many rows or columns to export.' };
    const columns = b.columns.map(cleanColumn);
    const clean = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? v : null) : (typeof v === 'string' ? v.slice(0, MAX_TEXT) : (typeof v === 'boolean' ? v : null)));
    const rows = b.rows.map((r) => (Array.isArray(r) ? columns.map((_, i) => clean(r[i])) : columns.map(() => null)));
    return { columns, rows, title: String(b.title || '').slice(0, 100) };
}

module.exports = { writeWorkbook, cleanPayload, cleanColumn, formatOf, legacyFormat, MAX_ROWS, MAX_COLUMNS };
