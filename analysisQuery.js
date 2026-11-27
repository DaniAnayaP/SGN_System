'use strict';
// Filtrar, ordenar y sacar los valores distintos de una columna sobre TODOS los renglones de un análisis (Daniel, 2026-11-27: «pasa el filtro del Análisis al servidor»).
// Hasta hoy la pantalla solo traía los primeros 5,000 renglones de En vivo (2,000 de una versión) y filtraba y ordenaba esos: el filtro por columna, el orden y los totales del pie no veían el resto.
// Aquí vive la parte que no necesita la base de datos (la reciben los renglones ya armados); server.js junta esto con la presentación de las columnas agregadas.
// El filtro es el mismo de la pantalla de Registros (cf = { f: { columna: [valores] }, r: { columna: regla } }, ver flexRegistries.parseFilter) y trabaja con lo que trae cada celda (texto o número tal cual).
const flex = require('./flexRegistries');

const MAX_VALUES = 400; // como en Registros: una columna con más valores distintos no ofrece la lista de casillas, solo se escribe lo buscado

// columns = las columnas con su llave (en el orden de los renglones). q = { cf, sort, dir }. Devuelve { filter, sortIdx, dir } o { error }.
function parse(columns, q) {
    const parsed = flex.parseFilter(q && q.cf, columns);
    if (parsed.error) return { error: parsed.error };
    let sortIdx = -1;
    if (q && q.sort) { sortIdx = columns.findIndex((c) => c.key === String(q.sort)); if (sortIdx < 0) return { error: 'BAD_COLUMN' }; }
    return { filter: parsed.filter, sortIdx, dir: q && q.dir === 'desc' ? -1 : 1 };
}
// Las columnas que el filtro o el orden necesitan leer (para saber si hay que armar primero las columnas agregadas).
function touched(parsed) {
    const out = new Set();
    if (parsed.filter) parsed.filter.conds.forEach((c) => out.add(c.idx));
    if (parsed.sortIdx >= 0) out.add(parsed.sortIdx);
    return out;
}
const isEmpty = (v) => v === null || v === undefined || v === '';
// Los renglones que pasan el filtro, en su orden: una lista de posiciones, o null si pasan todos y en su orden (sin filtro ni orden).
// El orden: los números por su valor, el texto como lo ordena la pantalla (sin importar mayúsculas ni acentos, con los números dentro del texto por su valor) y los vacíos al final.
function select(rows, parsed, lang) {
    let idx = null;
    if (parsed.filter) {
        idx = [];
        for (let i = 0; i < rows.length; i += 1) { const row = rows[i]; if (parsed.filter.matches((c) => row[c])) idx.push(i); }
    }
    if (parsed.sortIdx >= 0) {
        if (!idx) { idx = new Array(rows.length); for (let i = 0; i < rows.length; i += 1) idx[i] = i; }
        const at = parsed.sortIdx; const dir = parsed.dir;
        const collator = new Intl.Collator(lang === 'en' ? 'en' : 'es', { sensitivity: 'base', numeric: true });
        const keys = new Map();
        idx.forEach((i) => { const v = rows[i][at]; keys.set(i, isEmpty(v) ? null : v); });
        idx.sort((a, b) => {
            const x = keys.get(a); const y = keys.get(b);
            if (x === null || y === null) return x === y ? 0 : (x === null ? 1 : -1);
            return (typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y))) * dir;
        });
    }
    return idx;
}
// Los valores distintos de una columna (como los muestra el filtro: el texto, o el número tal cual) para la lista de casillas; con más de MAX_VALUES no se manda la lista.
function distinct(rows, at, lang) {
    const seen = new Set();
    for (let i = 0; i < rows.length; i += 1) { seen.add(flex.shownOf(rows[i][at])); if (seen.size > MAX_VALUES) return { values: [], complete: false }; }
    const collator = new Intl.Collator(lang === 'en' ? 'en' : 'es', { sensitivity: 'base', numeric: true });
    return { values: [...seen].sort((a, b) => collator.compare(a, b)), complete: true };
}
module.exports = { parse, touched, select, distinct, MAX_VALUES };
