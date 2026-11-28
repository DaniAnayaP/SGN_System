'use strict';
// ---------------------------------------------------------------------------
// «Mi personalización de Descarga» (Daniel, 2026-11-28, «Sí a las recomendadas en todo»; maqueta mi-personalizacion-descarga-v2): cómo sale lo que se baja (Excel, CSV, PDF) y que cada persona
// guarde sus personalizaciones con nombre. Esta es la LÓGICA PURA (sin base de datos ni rutas): el esquema de una personalización, su revisión (cleanPreset), la de fábrica «Como siempre» (lo que hoy
// baja el sistema, sin cambiar nada) y cómo se vuelve el formato del Excel de un registro de tabla libre.
//
// Una personalización vale para CUALQUIER tabla (lo que una tabla no tiene, por ejemplo la fila de apoyo, no se usa). Es plana:
//   título y portada · title, date, general (datos generales), kpis (indicadores), brand (el logo y el nombre de la compañía arriba: Excel y PDF genéricos; `logo` ya no se usa)
//   encabezado ·········· fill (#hex o null = sin relleno), ink, bold, filter (filtro automático)
//   columnas y paneles ·· keyFill (la llave con relleno lila), freeze (fijar hasta la llave), frozenHeader
//   números ············· dec ('screen' = como los veo, o 0 a 6), miles (null = como siempre, true = con coma, false = sin coma), neg ('normal' | 'rojo' | 'par')
//   archivo CSV ········· sep (, ; tab |), enc ('bom' | 'plain'), csvTitle (título arriba)
//   hoja PDF ············ orient ('v' | 'h'), paper ('carta' | 'a4' | 'legal'), foot (fecha y número de página)
//   líneas (bordes) ····· lines: capas en orden; cada una { where, pat, mt, st, co, label } (ver cleanLine); se aplican en el Excel y el PDF (pieza 3)
// ---------------------------------------------------------------------------
const manual = require('./manualRegistries.js');
const flexExcel = require('./flexExcel.js');

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_NAME = 60;
const MAX_PRESETS = 40;
const MAX_LINES = 40;
const MAX_TITLE = 120;
// los rellenos y colores de línea con nombre de la maqueta
const FILL_NAMES = { morado: '#9a3cc2', azul: '#2f6fb0', verde: '#2b8456', gris: '#6b7280' };
const LINE_COLORS = { gris: '#6b7280', negro: '#111111', morado: '#9a3cc2', azul: '#2f6fb0', rojo: '#c00000' };
// los patrones del menú de «Bordes» de Excel
const PATTERNS = ['inferior', 'superior', 'izq', 'der', 'sin', 'todos', 'externos', 'ext_grueso', 'doble_inf', 'inf_grueso', 'sup_inf', 'sup_inf_grueso', 'sup_inf_doble', 'custom'];
const LINE_STYLES = ['fina', 'media', 'gruesa', 'punteada', 'doble'];
const NEG_MODES = ['normal', 'rojo', 'par'];
const SEPARATORS = [',', ';', '\t', '|'];
const PAPERS = ['carta', 'a4', 'legal'];

// La de fábrica «Como siempre»: lo que hoy baja el sistema. Con esta, nada cambia.
const FACTORY = Object.freeze({
    v: 1,
    title: '', date: true, logo: true, brand: false, general: true, kpis: true,
    fill: '#9a3cc2', ink: '#ffffff', bold: true, filter: true,
    keyFill: true, freeze: true, frozenHeader: true,
    dec: 'screen', miles: null, neg: 'normal', // miles: null = como siempre (cada tabla con lo suyo: unas ya traen coma de miles y otras no), true = con coma, false = sin coma
    sep: ',', enc: 'bom', csvTitle: false,
    orient: 'v', paper: 'carta', foot: false,
    lines: [],
});

const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const bool = (v, dflt) => (v === true ? true : v === false ? false : dflt);
const pickHex = (v) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null);
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
const int = (v, min, max) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return Number.isInteger(n) && n >= min && n <= max ? n : null; };
const text = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Una capa de líneas. where: { scope: 'all' } toda la descarga, { scope: 'col', col } una columna (por su nombre) o { scope: 'cells', r1, c1, r2, c2 } celdas (renglón 0 = encabezado; r2 null = hasta el último
// renglón; las columnas por posición). pat: uno de los patrones de Excel o 'custom' («Más bordes…», con mt: t/b/l/r = arriba, abajo, izquierda, derecha; ih/iv = interiores horizontal y vertical).
function cleanLine(raw) {
    if (!isObj(raw)) return null;
    const w = isObj(raw.where) ? raw.where : {};
    let where = null;
    if (w.scope === 'all') where = { scope: 'all' };
    else if (w.scope === 'col') { const col = text(w.col, 80); if (col) where = { scope: 'col', col }; }
    else if (w.scope === 'cells') {
        const r1 = int(w.r1, 0, 1048576); const c1 = int(w.c1, 0, 16384); const c2 = int(w.c2 === undefined ? w.c1 : w.c2, 0, 16384);
        const r2 = w.r2 === null ? null : int(w.r2 === undefined ? w.r1 : w.r2, 0, 1048576);
        if (r1 !== null && c1 !== null && c2 !== null && (r2 === null || r2 !== null)) where = { scope: 'cells', r1, c1, r2, c2 };
        if (where && where.r2 !== null && where.r2 < where.r1) where = { ...where, r1: where.r2, r2: where.r1 };
        if (where && where.c2 < where.c1) where = { ...where, c1: where.c2, c2: where.c1 };
    }
    if (!where) return null;
    const pat = oneOf(raw.pat, PATTERNS, null);
    if (!pat) return null;
    let mt = null;
    if (pat === 'custom') {
        const m = isObj(raw.mt) ? raw.mt : {};
        mt = { t: m.t === true, b: m.b === true, l: m.l === true, r: m.r === true, ih: m.ih === true, iv: m.iv === true };
    }
    const co = LINE_COLORS[raw.co] || pickHex(raw.co) || LINE_COLORS.negro;
    return { where, pat, mt, st: oneOf(raw.st, LINE_STYLES, 'fina'), co, label: text(raw.label, 80) };
}

// La personalización completa tal como la manda el navegador, revisada. Lo que falte toma lo de fábrica.
function cleanPreset(raw) {
    const r = isObj(raw) ? raw : {};
    const out = clone(FACTORY);
    out.title = text(r.title, MAX_TITLE);
    ['date', 'logo', 'brand', 'general', 'kpis', 'bold', 'filter', 'keyFill', 'freeze', 'frozenHeader', 'csvTitle', 'foot'].forEach((k) => { out[k] = bool(r[k], FACTORY[k]); });
    out.miles = r.miles === true ? true : r.miles === false ? false : null;
    if (r.fill === null || r.fill === 'sin') out.fill = null;
    else out.fill = FILL_NAMES[r.fill] || pickHex(r.fill) || FACTORY.fill;
    out.ink = pickHex(r.ink) || FACTORY.ink;
    out.dec = r.dec === 'screen' || r.dec === undefined || r.dec === null || r.dec === '' ? 'screen' : (int(r.dec, 0, 6) === null ? 'screen' : int(r.dec, 0, 6));
    out.neg = oneOf(r.neg, NEG_MODES, 'normal');
    out.sep = oneOf(r.sep, SEPARATORS, ',');
    out.enc = oneOf(r.enc, ['bom', 'plain'], 'bom');
    out.orient = oneOf(r.orient, ['v', 'h'], 'v');
    out.paper = oneOf(r.paper, PAPERS, 'carta');
    out.lines = (Array.isArray(r.lines) ? r.lines : []).map(cleanLine).filter(Boolean).slice(0, MAX_LINES);
    return out;
}
// ¿es la de fábrica tal cual? (nada que aplicar)
const isFactory = (preset) => JSON.stringify(cleanPreset(preset)) === JSON.stringify(FACTORY);

// El nombre de una personalización: sin saltos ni espacios de más, hasta 60 letras. nameKey: el mismo sin mayúsculas ni acentos, para no repetir nombres.
const cleanName = (raw) => text(raw, MAX_NAME);
const nameKey = (name) => manual.fold(name).slice(0, MAX_NAME);

// ---- lo que sale en cada formato -------------------------------------------------------------------------------------------------------------------------------------
// Los números: dec null = los de cada columna; miles y neg valen para las columnas con número.
const numbersOf = (preset) => {
    const p = cleanPreset(preset);
    return { dec: p.dec === 'screen' ? null : p.dec, miles: p.miles, neg: p.neg };
};
// El CSV: separador, codificación y si lleva el título arriba.
const csvOptions = (preset) => { const p = cleanPreset(preset); return { sep: p.sep, bom: p.enc === 'bom', title: p.csvTitle, titleText: p.title }; };
// La hoja del PDF (pdfkit: 'portrait' | 'landscape', tamaño de papel) y el pie.
const PDF_PAPERS = { carta: 'LETTER', a4: 'A4', legal: 'LEGAL' };
const pdfOptions = (preset) => { const p = cleanPreset(preset); return { layout: p.orient === 'h' ? 'landscape' : 'portrait', size: PDF_PAPERS[p.paper], footer: p.foot, title: p.title, lines: p.lines }; };

// El formato del Excel de un registro de tabla libre: lo guardado del registro (el formato de cada columna y la fila de apoyo siguen igual) y, encima, lo que dice la personalización.
// Sin personalización (preset null) sale el del registro, como siempre.
function flexFormatFor(preset, savedFormat) {
    const base = flexExcel.mergeFormat(savedFormat);
    if (!preset) return base;
    const p = cleanPreset(preset);
    const out = clone(base);
    out.header = { fill: p.fill, ink: p.ink, bold: p.bold, filter: p.filter };
    out.keyFill = p.keyFill ? (base.keyFill || flexExcel.DEFAULTS.keyFill) : null;
    out.freeze = { cols: p.freeze ? 'auto' : 0, header: p.frozenHeader };
    out.cover = { on: !!p.title || p.date || p.general || p.kpis, kpis: p.kpis ? (base.cover.kpis.length ? base.cover.kpis : flexExcel.DEFAULTS.cover.kpis.slice()) : [], general: p.general, date: p.date, title: p.title };
    out.numbers = numbersOf(p);
    out.lines = p.lines;
    return out;
}

// Lo que usa el Excel del Análisis (analysisExcel.writeWorkbook): el encabezado, los números y si el encabezado queda fijo. Sin personalización, null (sale como siempre).
function analysisOptionsFor(preset) {
    if (!preset) return null;
    const p = cleanPreset(preset);
    return { header: { fill: p.fill, ink: p.ink, bold: p.bold, filter: p.filter }, numbers: numbersOf(p), freezeHeader: p.frozenHeader, title: p.title, lines: p.lines };
}

module.exports = { analysisOptionsFor, FACTORY, MAX_NAME, MAX_PRESETS, PATTERNS, LINE_STYLES, LINE_COLORS, FILL_NAMES, cleanPreset, cleanLine, isFactory, cleanName, nameKey, numbersOf, csvOptions, pdfOptions, flexFormatFor };
