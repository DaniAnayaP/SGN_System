// Las LÍNEAS (bordes) de una descarga (Daniel, 2026-11-28, «Mi personalización de Descarga», pieza 3): la misma cuenta la hacen el servidor (Excel y PDF) y el cuadro de descarga («Así queda»), por eso vive aquí, sin dependencias.
// Una personalización trae capas de líneas EN ORDEN (las de después mandan sobre las de antes). Cada capa dice dónde aplica (toda la descarga, una columna por su nombre o un grupo de celdas), el patrón del menú de Bordes de
// Excel (inferior, superior, izq, der, sin, todos, externos, exterior grueso, doble inferior, inferior grueso, superior e inferior, …grueso, …doble, o «Más bordes…» con sus lados), el estilo y el color.
// La descarga se ve como una cuadrícula: el renglón 0 es el encabezado y los renglones 1 a N son los datos; las columnas, en el orden en que se bajan. Los bordes se calculan por ARISTA (la línea entre dos celdas): h(r, c) es la
// que queda arriba del renglón r en la columna c, v(r, c) la que queda a la izquierda de la columna c en el renglón r; así dos celdas vecinas nunca se contradicen.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.DownloadLines = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    // lo que hace cada patrón: t/b/l/r = arriba, abajo, izquierda, derecha del grupo; ih/iv = líneas interiores horizontales / verticales; force = estilo que el patrón impone; clear = quita los bordes
    const PATTERNS = {
        inferior: { b: 1 }, superior: { t: 1 }, izq: { l: 1 }, der: { r: 1 }, sin: { clear: 1 },
        todos: { t: 1, b: 1, l: 1, r: 1, ih: 1, iv: 1 }, externos: { t: 1, b: 1, l: 1, r: 1 },
        ext_grueso: { t: 1, b: 1, l: 1, r: 1, force: 'gruesa' }, doble_inf: { b: 1, force: 'doble' }, inf_grueso: { b: 1, force: 'gruesa' },
        sup_inf: { t: 1, b: 1 }, sup_inf_grueso: { t: 1, b: 1, force: 'gruesa' }, sup_inf_doble: { t: 1, b: 1, force: 'doble' },
    };
    // los nombres de estilo de la personalización → los de Excel (ExcelJS)
    const EXCEL_STYLE = { fina: 'thin', media: 'medium', gruesa: 'thick', punteada: 'dotted', doble: 'double' };
    const fold = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    // layers: las capas ya revisadas (downloadPresets.cleanLine). opts: { rows (renglones de datos), cols (columnas), colIndex(nombre) → posición o -1 }
    // Devuelve { any, h(r, c), v(r, c), cell(r, c) } con cell → { top, bottom, left, right } (cada lado: undefined = sin línea, o { st, co }).
    function createGrid(layers, opts) {
        const R = Math.max(0, opts.rows | 0);
        const C = Math.max(0, opts.cols | 0);
        const colIndex = opts.colIndex || (() => -1);
        const rs = [];
        (Array.isArray(layers) ? layers : []).forEach((l) => {
            if (!l || !l.where) return;
            let r1; let r2; let c1; let c2;
            if (l.where.scope === 'all') { r1 = 0; r2 = R; c1 = 0; c2 = C - 1; }
            else if (l.where.scope === 'col') { const i = colIndex(l.where.col); if (!(i >= 0 && i < C)) return; r1 = 0; r2 = R; c1 = i; c2 = i; }
            else if (l.where.scope === 'cells') {
                r1 = l.where.r1; r2 = l.where.r2 === null || l.where.r2 === undefined ? R : Math.min(l.where.r2, R); c1 = l.where.c1; c2 = Math.min(l.where.c2, C - 1);
                if (r1 > R || c1 > C - 1 || r2 < r1 || c2 < c1) return;
            } else return;
            const flags = l.pat === 'custom' ? Object.assign({}, l.mt || {}, { t: l.mt && l.mt.t, b: l.mt && l.mt.b, l: l.mt && l.mt.l, r: l.mt && l.mt.r }) : (PATTERNS[l.pat] || null);
            if (!flags) return;
            const style = flags.force || l.st || 'fina';
            rs.push({ r1, r2, c1, c2, f: flags, spec: flags.clear ? null : { st: style, co: l.co || '#111111' } });
        });
        const inside = (x, r, c) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2;
        // la línea que queda ARRIBA del renglón r en la columna c (entre r-1 y r)
        const h = (r, c) => {
            let out;
            for (let i = 0; i < rs.length; i += 1) {
                const x = rs[i];
                const a = inside(x, r, c); const b = inside(x, r - 1, c);
                if (!a && !b) continue;
                if (x.f.clear) { out = null; continue; }
                if ((a && r === x.r1 && x.f.t) || (b && r - 1 === x.r2 && x.f.b) || (a && b && x.f.ih)) out = x.spec;
            }
            return out === null ? undefined : out;
        };
        // la línea que queda A LA IZQUIERDA de la columna c en el renglón r (entre c-1 y c)
        const v = (r, c) => {
            let out;
            for (let i = 0; i < rs.length; i += 1) {
                const x = rs[i];
                const a = inside(x, r, c); const b = inside(x, r, c - 1);
                if (!a && !b) continue;
                if (x.f.clear) { out = null; continue; }
                if ((a && c === x.c1 && x.f.l) || (b && c - 1 === x.c2 && x.f.r) || (a && b && x.f.iv)) out = x.spec;
            }
            return out === null ? undefined : out;
        };
        const cell = (r, c) => ({ top: h(r, c), bottom: h(r + 1, c), left: v(r, c), right: v(r, c + 1) });
        return { any: rs.length > 0, h, v, cell };
    }
    // Los bordes de una celda como los quiere ExcelJS ({ top: { style, color: { argb } }, … }); undefined si la celda no lleva ninguno.
    function excelBorder(edges) {
        const out = {};
        let any = false;
        ['top', 'bottom', 'left', 'right'].forEach((side) => {
            const e = edges[side];
            if (!e) return;
            out[side] = { style: EXCEL_STYLE[e.st] || 'thin', color: { argb: `FF${String(e.co).slice(1).toUpperCase()}` } };
            any = true;
        });
        return any ? out : undefined;
    }
    return { PATTERNS, EXCEL_STYLE, createGrid, excelBorder, fold };
}));
