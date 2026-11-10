// Carga por plantilla de Relación Código: columnas de la plantilla, cómo se reconocen los encabezados que trae un Excel y las reglas de cada fila (los nombres y el Localizador se convierten en los
// ids de la cascada centro de costos > almacén > sub almacén > zona > estante > nivel > espacio). La pantalla lo usa para marcar los errores antes de cargar; el servidor NO se fía de eso:
// cada fila que llega pasa por la misma revisión que una relación hecha a mano (validateCodeRelationState en server.js). Funciona igual en el navegador y en Node.
//
// Una fila crea una relación nueva, o COMPLETA la relación «A medias» que el código ya tiene (la que se llenó con centro, almacén y sub almacén pero sin lugar): así cargar primero los
// códigos y después sus lugares no deja filas repetidas.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.RelTemplate = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    const MAX_ROWS = 500; // filas por petición al servidor (la ventana parte los archivos más grandes en tandas)

    // key = dato de la fila; col = hoja de permisos de esa columna en el árbol (las mismas de Relación Código). El Localizador (siempre con las 6 piezas) reúne zona, huella, activo, nivel, espacio y posición (los de 7 de antes también se entienden); antes: zona, huella, activo, nivel, columna, fila y profundidad en una sola celda.
    const COLUMNS = [
        { key: 'sku', es: 'Código SKU', en: 'SKU Code', col: 'colRelSku', required: true, aliases: ['sku', 'articulo', 'codigo', 'codigo sku', 'registro unico', 'upc', 'codigo de barras'] },
        { key: 'locator', es: 'Localizador', en: 'Locator', col: 'colRelEstante', aliases: ['localizador', 'localizacion', 'ubicacion', 'locator'] },
        { key: 'classification', es: 'Clasificación', en: 'Classification', col: 'colRelClasificacion', aliases: ['clasificacion del producto', 'tipo de producto', 'classification'] },
        { key: 'center', es: 'Centro de Costos', en: 'Cost Center', col: 'colRelCentroCostos', aliases: ['centro costos', 'centro', 'cost center', 'sitio'] },
        { key: 'warehouse', es: 'Almacén', en: 'Warehouse', col: 'colRelAlmacen', aliases: ['almacen', 'warehouse'] },
        { key: 'sub', es: 'Sub almacén', en: 'Sub-warehouse', col: 'colRelSubAlmacen', aliases: ['sub almacen', 'subalmacen', 'sub warehouse'] },
        { key: 'zone', es: 'Zona', en: 'Zone', col: 'colRelZona', aliases: ['zone'] },
        { key: 'footprint', es: 'Huella', en: 'Footprint', col: 'colRelHuella', aliases: ['footprint', 'huella espacio'] },
        { key: 'rack', es: 'Activo', en: 'Asset', col: 'colRelEstante', aliases: ['estante', 'anaquel', 'estanteria', 'rack', 'asset'] },
        { key: 'level', es: 'Nivel', en: 'Level', col: 'colRelNivel', aliases: ['level'] },
        { key: 'slot', es: 'Espacio', en: 'Space', col: 'colRelEspacio', aliases: ['columna', 'slot', 'column', 'col', 'space'] },
        { key: 'position', es: 'Posición', en: 'Position', col: 'colRelProfundidad', aliases: ['posicion', 'pos', 'position'] },
        // Fila y Profundidad son de la forma de antes: ya no están en la plantilla, pero un archivo viejo que las traiga se sigue entendiendo (la celda fila × profundidad pasó a ser una posición).
        { key: 'row', es: 'Fila', en: 'Row', col: 'colRelProfundidad', legacy: true, aliases: ['row'] },
        { key: 'depth', es: 'Profundidad', en: 'Depth', col: 'colRelProfundidad', legacy: true, aliases: ['prof', 'fondo', 'depth'] },
    ];
    const BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));
    // Clasificación del producto en ese lugar (se guarda la clave); se reconoce el nombre completo, el corto y la sigla.
    const CLASS_NAMES = {
        activo: ['producto activo', 'activo', 'act'], cuarentena: ['producto cuarentena', 'cuarentena', 'cua'],
        aclaracion: ['producto aclaracion', 'aclaracion', 'acl'], consigna: ['producto en consigna', 'producto consigna', 'consigna', 'con'],
    };

    // sin mayúsculas, acentos, paréntesis ni signos: "Sub almacén", "sub-almacen" y "SUB ALMACEN" son lo mismo
    const norm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const CLASS_INDEX = new Map();
    Object.entries(CLASS_NAMES).forEach(([key, names]) => names.forEach((n) => CLASS_INDEX.set(norm(n), key)));
    const HEADER_INDEX = new Map();
    COLUMNS.forEach((c) => { [c.es, c.en, ...c.aliases].forEach((name) => { if (!HEADER_INDEX.has(norm(name))) HEADER_INDEX.set(norm(name), c.key); }); });

    // Qué columna es cada celda de la primera fila. ignored = los encabezados que no se reconocieron (no se usan).
    function mapHeaders(firstRow) {
        const used = new Set();
        const keys = (firstRow || []).map((cell) => {
            const key = HEADER_INDEX.get(norm(cell));
            if (!key || used.has(key)) return null;
            used.add(key);
            return key;
        });
        return { keys, matched: keys.filter(Boolean).length, used, ignored: (firstRow || []).map((cell, i) => (keys[i] ? '' : String(cell == null ? '' : cell).trim())).filter(Boolean) };
    }

    // Convierte una matriz de celdas (Excel o texto pegado) en filas { n, v: { dato: texto } }. n = número de fila de Excel (1 = encabezados).
    // Con encabezados hace falta el SKU y, para saber a dónde va, el Almacén o el Localizador (que completa la relación «A medias» del código); sin encabezados se toma el orden de la plantilla.
    function rowsFromMatrix(matrix) {
        const first = matrix.findIndex((r) => (r || []).some((c) => String(c == null ? '' : c).trim() !== ''));
        if (first < 0) return { error: 'empty', rows: [] };
        const head = mapHeaders(matrix[first]);
        let keys;
        let start;
        if (head.matched >= 1) {
            if (!head.used.has('sku')) return { error: 'sku', rows: [], ignored: head.ignored };
            if (!head.used.has('warehouse') && !head.used.has('locator')) return { error: 'warehouse', rows: [], ignored: head.ignored };
            keys = head.keys;
            start = first + 1;
        } else if (/^\d/.test(String(matrix[first][0] == null ? '' : matrix[first][0]).trim()) && (matrix[first] || []).length >= 2) {
            keys = COLUMNS.filter((c) => !c.legacy).map((c) => c.key);
            start = first;
        } else return { error: 'columns', rows: [] };
        const rows = [];
        for (let i = start; i < matrix.length; i += 1) {
            const cells = matrix[i] || [];
            const v = {};
            keys.forEach((key, c) => { if (key) v[key] = String(cells[c] == null ? '' : cells[c]).trim(); });
            if (!Object.values(v).some((x) => x !== '')) continue;
            COLUMNS.forEach((c) => { if (v[c.key] === undefined) v[c.key] = ''; });
            rows.push({ n: i + 1, v });
        }
        return { rows, ignored: head.ignored || [], usedKeys: keys.filter(Boolean) };
    }

    // "3", "Nivel 3", "N3" -> 3 (solo enteros)
    const intOf = (raw) => {
        const m = String(raw).trim().match(/^(?:[a-zA-ZñÑáéíóúÁÉÍÓÚ.]*\s*)?(\d+)$/);
        return m ? Number(m[1]) : NaN;
    };
    // el número que cierra un nombre o un código: "Zona 6" -> 6, "R-05" -> 5 (NaN si no trae)
    // El número de la zona en el Localizador: el de su código (Z006 -> 6); una zona sin código (opciones viejas guardadas en el celular) usa el número con que termina su nombre.
    const zoneNo = (z) => trailingNumber(z && z.code ? z.code : (z && z.name));
    const trailingNumber = (text) => { const m = String(text == null ? '' : text).match(/(\d+)\s*$/); return m ? Number(m[1]) : NaN; };

    // El Localizador va SIEMPRE completo, con las 6 piezas: Z006.H005.A005.N003.E001.P001 = Zona 6 · Huella 5 · Activo A5 · Nivel 3 · Espacio 1 · Posición 1. El espacio es el lugar de izquierda a derecha de un nivel y la posición es lo que
    // hay dentro de él (Layout > Posiciones). Z = el número con que termina el nombre de la zona; H = el del código de la huella (R-05 -> H005); la letra del activo dice qué tipo de espacio del Layout es
    // (A anaquel, R rack, G gabeta, T tarima en piso, F frío) y su número es el del código del activo (A-05 -> A005). La forma de antes, con 7 piezas (…C001.F001.P001: columna, fila y profundidad), también se entiende: la columna es el
    // espacio y la celda fila × profundidad es la posición que le tocó (legacy: true).
    const ASSET_TYPES = { A: 'rack', R: 'rackpal', G: 'cabinet', T: 'pallet', F: 'cold' };
    const LETTER_OF_TYPE = Object.fromEntries(Object.entries(ASSET_TYPES).map(([letter, type]) => [type, letter]));
    const pad3 = (n) => String(n).padStart(3, '0');
    function parseLocator(raw) {
        const parts = String(raw).split('.').map((s) => s.trim()).filter(Boolean);
        const out = { zone: null, footprint: null, asset: null, level: null, column: null, position: null, row: null, depth: null, legacy: false };
        if (!parts.length || parts.length > 7) return { error: 'locatorFormat' };
        // con alguna C (columna) o F (fila) es la forma de antes: ahí la P es la profundidad
        out.legacy = parts.some((part) => /^[CcFf]\s*\d+$/.test(part));
        for (const part of parts) {
            const m = part.match(/^([A-Za-z])\s*(\d+)$/);
            if (!m) return { error: 'locatorFormat' };
            const letter = m[1].toUpperCase();
            const n = Number(m[2]);
            if (!(n >= 1)) return { error: 'locatorFormat' };
            if (letter === 'Z') { if (out.zone !== null) return { error: 'locatorFormat' }; out.zone = n; }
            else if (letter === 'H') { if (out.footprint !== null) return { error: 'locatorFormat' }; out.footprint = n; }
            else if (letter === 'N') { if (out.level !== null) return { error: 'locatorFormat' }; out.level = n; }
            else if (letter === 'E' && !out.legacy) { if (out.column !== null) return { error: 'locatorFormat' }; out.column = n; }
            else if (letter === 'C' && out.legacy) { if (out.column !== null) return { error: 'locatorFormat' }; out.column = n; }
            else if (letter === 'F' && out.legacy) { if (out.row !== null) return { error: 'locatorFormat' }; out.row = n; }
            else if (letter === 'P') { if (out.legacy) { if (out.depth !== null) return { error: 'locatorFormat' }; out.depth = n; } else { if (out.position !== null) return { error: 'locatorFormat' }; out.position = n; } }
            else { if (out.asset) return { error: 'locatorFormat' }; out.asset = { letter, num: n }; }
        }
        // todas las piezas son obligatorias: si falta alguna se dice cuáles
        const pieces = out.legacy
            ? [['Z', out.zone], ['H', out.footprint], ['A', out.asset], ['N', out.level], ['C', out.column], ['F', out.row], ['P', out.depth]]
            : [['Z', out.zone], ['H', out.footprint], ['A', out.asset], ['N', out.level], ['E', out.column], ['P', out.position]];
        const missing = pieces.filter(([, value]) => value === null).map(([name]) => name);
        if (missing.length) return { error: 'locatorIncomplete', missing: missing.join(', ') };
        return out;
    }
    // El Localizador completo de un lugar de una relación; vacío si todavía no se puede armar (sin lugar completo, o una zona, huella o activo cuyo nombre o código no termina en número).
    function formatLocator(p) {
        const z = trailingNumber(p.zoneCode ? p.zoneCode : p.zoneName);
        const h = trailingNumber(p.footprintCode);
        const a = trailingNumber(p.spaceCode);
        const letter = LETTER_OF_TYPE[p.spaceType];
        if (!(z >= 1) || !(h >= 1) || !(a >= 1) || !letter || !(p.level >= 1) || !(p.slot >= 1)) return '';
        return `Z${pad3(z)}.H${pad3(h)}.${letter}${pad3(a)}.N${pad3(p.level)}.E${pad3(p.slot)}.P${pad3(p.position || 1)}`;
    }
    // Las posiciones de un espacio (un nivel × un espacio de un activo): [1, 2…]. rack.positions = [{ n, c, nums }] (lo manda el servidor); sin eso (opciones viejas guardadas en el celular) se supone una sola.
    const positionsOfBay = (rack, n, c) => {
        const hit = ((rack && rack.positions) || []).find((x) => x.n === n && x.c === c);
        return hit ? hit.nums : [1];
    };
    // La celda (fila, profundidad) de la forma de antes -> la posición que le tocó: (fila − 1) × profundidades + profundidad, con las filas y profundidades que el espacio todavía trae guardadas.
    const legacyNum = (rack, n, c, row, depth) => {
        const b = ((rack && rack.bays) || []).find((x) => x.n === n && x.c === c) || {};
        return (Math.max(1, row || 1) - 1) * Math.max(1, b.depth || 1) + Math.max(1, depth || 1);
    };

    // ctx = {
    //   itemBySku(n) / itemByUpc(upc) -> { id, sku, ... } | null,
    //   centers: [{ id, code, name }] (completos), selectedIds: null (todos) | [ids] (los marcados arriba),
    //   warehouses: [{ id, name, parentId, status }], subWarehouses: [{ id, name, parentId, status, kind, locations: [{ zoneId, spaceIds }] }],
    //   zonesByCenter: { centro: [{ id, name, footprints: [{ id, code }], spaces: [{ id, code, type, footprintId, levels, slots, bays: [{ n, c, rows?, depth? }], positions: [{ n, c, nums }] }] }] }  (spaces = los activos),
    //   relationsOf(itemId) -> las relaciones que ese código ya tiene [{ id, costCenterId, warehouseId, subWarehouseId, zoneId, spaceId, level, slot }],
    //   occupiedBy(spaceId, nivel, espacio, posición) -> SKU que lo ocupa ('' = libre), existingKey(key) -> ya existe esa misma relación,
    //   priorRowWithKey(key, row) -> número de otra fila anterior del archivo con lo mismo (0 = ninguna)
    // }
    // Regresa { error: { field, code, params } } o { action: 'create' | 'complete' | 'reclass' | 'same', values, relationId?, keys, located, route }. existingRelation(key) -> { id, classification } | null.
    function planRow(row, ctx) {
        const v = row.v;
        const err = (field, code, params) => ({ error: { field, code, params: params || {} } });
        const text = (k) => String(v[k] == null ? '' : v[k]).trim();

        const skuRaw = text('sku');
        if (!skuRaw) return err('sku', 'skuMissing');
        let item = /^\d{1,9}$/.test(skuRaw) ? ctx.itemBySku(Number(skuRaw)) : null;
        if (!item && /^\d{8,14}$/.test(skuRaw)) item = ctx.itemByUpc(skuRaw);
        if (!item) return err('sku', 'skuNotFound', { sku: skuRaw });
        const clsRaw = text('classification');
        let cls = null;
        if (clsRaw) {
            cls = CLASS_INDEX.get(norm(clsRaw)) || null;
            if (!cls) return err('classification', 'classNotFound', { value: clsRaw });
        }

        const locRaw = text('locator');
        const zoneRaw = text('zone');
        const footprintRaw = text('footprint');
        const rackRaw = text('rack');
        const levelRaw = text('level');
        const slotRaw = text('slot');
        const positionRaw = text('position');
        const rowRaw = text('row'); // (de la forma de antes)
        const depthRaw = text('depth'); // (de la forma de antes)
        let loc = null;
        if (locRaw) {
            if (zoneRaw || footprintRaw || rackRaw || levelRaw || slotRaw || positionRaw || rowRaw || depthRaw) return err('locator', 'locatorAndColumns');
            loc = parseLocator(locRaw);
            if (loc.error) return err('locator', loc.error, { value: locRaw, missing: loc.missing || '' });
        }
        const hasPlace = !!(locRaw || zoneRaw || footprintRaw || rackRaw || levelRaw || slotRaw || positionRaw || rowRaw || depthRaw);
        const claimed = (rel) => ctx.priorRowWithKey(`upd|${rel.id}`, row) > 0;
        const partialOf = (rel) => !rel.zoneId && !rel.spaceId && !rel.level && !rel.slot && !!rel.subWarehouseId;

        // ---- a dónde va: centro > almacén > sub almacén (los de la fila, o los de la relación «A medias» que el código ya tiene)
        let center = null;
        let wh = null;
        let sub = null;
        let target = null; // la relación «A medias» que esta fila completa
        const whRaw = text('warehouse');
        if (whRaw) {
            const centerRaw = text('center');
            if (centerRaw) {
                const k = norm(centerRaw);
                center = ctx.centers.find((c) => norm(c.code) === k || norm(c.name) === k) || null;
                if (!center) return err('center', 'centerNotFound', { value: centerRaw });
            } else {
                const only = ctx.selectedIds && ctx.selectedIds.length === 1 ? ctx.selectedIds[0] : (ctx.centers.length === 1 ? ctx.centers[0].id : null);
                center = ctx.centers.find((c) => c.id === only) || null;
                if (!center) return err('center', 'centerMissing');
            }
            if (ctx.selectedIds && !ctx.selectedIds.includes(center.id)) return err('center', 'centerNotSelected', { center: center.name });
            const wk = norm(whRaw);
            const whAny = ctx.warehouses.find((w) => w.parentId === center.id && norm(w.name) === wk);
            if (!whAny) return err('warehouse', 'warehouseNotFound', { value: whRaw, center: center.name });
            if (whAny.status !== 'active') return err('warehouse', 'warehouseInactive', { value: whRaw });
            wh = whAny;
            const subRaw = text('sub');
            if (!subRaw) {
                if (hasPlace) return err('sub', 'subMissing');
            } else {
                const sk = norm(subRaw);
                const subAny = ctx.subWarehouses.find((s) => s.parentId === wh.id && norm(s.name) === sk);
                if (!subAny) return err('sub', 'subNotFound', { value: subRaw, warehouse: wh.name });
                if (subAny.status !== 'active') return err('sub', 'subInactive', { value: subRaw });
                sub = subAny;
                if (hasPlace) target = (ctx.relationsOf(item.id) || []).find((r) => r.costCenterId === center.id && r.warehouseId === wh.id && r.subWarehouseId === sub.id && partialOf(r) && !claimed(r)) || null;
            }
        } else if (hasPlace) {
            const cands = (ctx.relationsOf(item.id) || []).filter((r) => partialOf(r) && (!ctx.selectedIds || ctx.selectedIds.includes(r.costCenterId)) && !claimed(r));
            if (!cands.length) return err('warehouse', 'noPartial');
            if (cands.length > 1) return err('warehouse', 'severalPartial', { n: cands.length });
            target = cands[0];
            center = ctx.centers.find((c) => c.id === target.costCenterId) || null;
            wh = ctx.warehouses.find((w) => w.id === target.warehouseId) || null;
            sub = ctx.subWarehouses.find((s) => s.id === target.subWarehouseId) || null;
            if (!center || !wh || !sub) return err('warehouse', 'noPartial');
            if (sub.status !== 'active') return err('sub', 'subInactive', { value: sub.name });
        } else return err('warehouse', 'warehouseMissing');

        // ---- el lugar: zona > estante > nivel > espacio > posición (por columnas o por Localizador). El espacio es un nivel × un lugar de izquierda a derecha; dentro de él están sus posiciones (Layout > Posiciones).
        let zone = null;
        let footprint = null;
        let rack = null;
        let level = null;
        let slot = null;
        let position = null;
        let positionCount = 1;
        if (hasPlace) {
            if (sub.kind !== 'physical') return err(loc ? 'locator' : 'zone', 'subNotPhysical', { sub: sub.name });
            const entries = sub.locations || [];
            const assigned = (ctx.zonesByCenter[center.id] || []).filter((z) => entries.some((e) => e.zoneId === z.id));
            const F = (field) => (loc ? 'locator' : field); // en qué dato se marca el error
            let levelGiven = null;
            let columnGiven = null;
            let positionGiven = null;
            let legacyCell = null; // { row, depth } de la forma de antes: se convierte en posición cuando ya se sabe el espacio
            if (loc) {
                const zones = assigned.filter((z) => zoneNo(z) === loc.zone);
                if (!zones.length) return err('locator', 'locatorZone', { value: locRaw, zone: loc.zone, sub: sub.name });
                if (zones.length > 1) return err('locator', 'locatorAmbiguous', { value: locRaw });
                zone = zones[0];
                const entry = entries.find((e) => e.zoneId === zone.id);
                // la huella (H) y el activo (A) se buscan juntos: el activo tiene que estar encima de esa huella
                const footprints = (zone.footprints || []).filter((f) => trailingNumber(f.code) === loc.footprint);
                if (!footprints.length) return err('locator', 'locatorFootprint', { value: locRaw, zone: zone.name, footprint: `H${pad3(loc.footprint)}` });
                const type = ASSET_TYPES[loc.asset.letter];
                if (!type) return err('locator', 'locatorAsset', { value: locRaw, letter: loc.asset.letter });
                const found = zone.spaces.filter((sp) => !entry.spaceIds.length || entry.spaceIds.includes(sp.id)).filter((sp) => footprints.some((f) => f.id === sp.footprintId) && sp.type === type && trailingNumber(sp.code) === loc.asset.num);
                if (!found.length) return err('locator', 'locatorRack', { value: locRaw, zone: zone.name });
                if (found.length > 1) return err('locator', 'locatorAmbiguous', { value: locRaw });
                rack = found[0];
                levelGiven = loc.level;
                columnGiven = loc.column;
                if (loc.legacy) legacyCell = { row: loc.row, depth: loc.depth }; else positionGiven = loc.position;
            } else {
                if (!zoneRaw) return err('zone', 'zoneMissing');
                zone = assigned.find((z) => norm(z.name) === norm(zoneRaw) || (z.code && norm(z.code) === norm(zoneRaw))) || null;
                if (!zone) return err('zone', 'zoneNotFound', { value: zoneRaw, sub: sub.name });
                const entry = entries.find((e) => e.zoneId === zone.id);
                // la huella es opcional en las columnas (el activo ya dice en cuál está); si se pone, el activo tiene que estar encima de ella
                let fp = null;
                if (footprintRaw) {
                    fp = (zone.footprints || []).find((f) => norm(f.code) === norm(footprintRaw)) || null;
                    if (!fp) return err('footprint', 'footprintNotFound', { value: footprintRaw, zone: zone.name });
                }
                if (rackRaw) {
                    const rk = norm(rackRaw);
                    rack = zone.spaces.filter((sp) => !entry.spaceIds.length || entry.spaceIds.includes(sp.id)).find((sp) => norm(sp.code) === rk && (!fp || sp.footprintId === fp.id)) || null;
                    if (!rack) return err('rack', fp ? 'rackNotInFootprint' : 'rackNotFound', { value: rackRaw, zone: zone.name, footprint: fp ? fp.code : '' });
                }
                const asNum = (raw) => (raw === '' ? null : intOf(raw));
                levelGiven = asNum(levelRaw);
                columnGiven = asNum(slotRaw);
                positionGiven = asNum(positionRaw);
                if (rowRaw || depthRaw) legacyCell = { row: asNum(rowRaw), depth: asNum(depthRaw) };
            }
            footprint = rack && zone ? ((zone.footprints || []).find((f) => f.id === rack.footprintId) || null) : null;
            const given = (n) => n !== null; // NaN también cuenta como «dicho» (texto que no es un número): falla el rango
            const hasCell = given(positionGiven) || !!legacyCell;
            if (!rack) {
                if (given(levelGiven) || given(columnGiven) || hasCell) return err(F('rack'), 'rackMissing');
            } else if (!given(levelGiven)) {
                if (given(columnGiven) || hasCell) return err(F('level'), 'levelMissing');
            } else {
                const levels = rack.levels || 1;
                let slots = rack.slots || 1;
                if (!(levelGiven >= 1 && levelGiven <= levels)) return err(F('level'), 'levelRange', { value: loc ? `N${String(levelGiven).padStart(3, '0')}` : levelRaw, max: levels, rack: rack.code });
                level = levelGiven;
                slots = (Array.isArray(rack.slotsByLevel) && rack.slotsByLevel[levelGiven - 1]) || slots; // los espacios de ESE nivel
                if (given(columnGiven)) {
                    if (!(columnGiven >= 1 && columnGiven <= slots)) return err(F('slot'), 'slotRange', { value: loc ? `E${String(columnGiven).padStart(3, '0')}` : slotRaw, max: slots, rack: rack.code });
                    slot = columnGiven;
                } else if (slots <= 1) slot = 1; // un estante de un solo espacio no necesita que se diga
                else if (loc || hasCell) return err(F('slot'), loc ? 'columnNeeded' : 'slotMissing', { rack: rack.code, max: slots });
                if (slot !== null) {
                    const nums = positionsOfBay(rack, level, slot);
                    positionCount = nums.length;
                    if (legacyCell && !given(positionGiven)) positionGiven = legacyNum(rack, level, slot, legacyCell.row, legacyCell.depth);
                    if (given(positionGiven)) {
                        if (!nums.includes(positionGiven)) return err(F('position'), 'positionRange', { value: loc ? `P${String(positionGiven).padStart(3, '0')}` : (positionRaw || String(positionGiven)), max: nums.length, rack: rack.code });
                        position = positionGiven;
                    }
                }
            }
        }

        // La posición de un espacio de una sola posición está implícita y no se guarda; si tiene más de una hay que decir cuál (si no, la relación queda A medias).
        if (position !== null && positionCount <= 1) position = null;
        const key = [item.id, center.id, wh.id, sub ? sub.id : 0, zone ? zone.id : '', rack ? rack.id : '', level || 0, slot || 0, position || 0].join('|');
        const located = !!sub && (sub.kind === 'virtual' || !!(rack && level && slot && (position || positionCount <= 1)));
        const values = {
            skuItemId: item.id, costCenterId: center.id, warehouseId: wh.id, subWarehouseId: sub ? sub.id : null,
            zoneId: zone ? zone.id : '', spaceId: rack ? rack.id : '', level, slot, position,
            classification: cls || (target ? undefined : 'activo'), // al completar una relación sin decir la clasificación, conserva la que tenía
        };
        const route = [center.name, wh.name, sub ? sub.name : '', zone ? zone.name : '', footprint ? footprint.code : '', rack ? rack.code : ''].filter(Boolean);
        const base = { values, route, keys: { place: `rel|${key}`, slot: rack && level && slot ? `slot|${rack.id}|${level}|${slot}|${position || 1}` : '', claim: target ? `upd|${target.id}` : '' }, located, item };
        // ¿ese lugar ya es de este código? (existingRelation = su relación, con su clasificación; existingKey = solo que existe)
        const existingRel = ctx.existingRelation ? ctx.existingRelation(key) : (ctx.existingKey && ctx.existingKey(key) ? {} : null);
        if (base.keys.slot) {
            const occupant = ctx.occupiedBy(rack.id, level, slot, position || 1);
            if (occupant && !existingRel) return err(loc ? 'locator' : 'slot', 'occupied', { sku: occupant });
        }
        if (existingRel) {
            // Si la fila trae otra clasificación, solo se cambia esa; si no, no hay nada que cargar.
            const was = existingRel.classification || 'activo';
            if (cls && existingRel.id && was !== cls) return { action: 'reclass', relationId: existingRel.id, from: was, to: cls, ...base, values: { ...values, classification: cls } };
            return { action: 'same', ...base };
        }
        const dup = ctx.priorRowWithKey(base.keys.place, row);
        if (dup) return err('sku', 'duplicateInFile', { row: dup });
        if (base.keys.slot) {
            const prior = ctx.priorRowWithKey(base.keys.slot, row);
            if (prior) return err(loc ? 'locator' : 'slot', 'occupiedInFile', { row: prior });
        }
        return target ? { action: 'complete', relationId: target.id, ...base } : { action: 'create', ...base };
    }

    return { MAX_ROWS, COLUMNS, BY_KEY, ASSET_TYPES, CLASS_NAMES, norm, parseLocator, formatLocator, rowsFromMatrix, planRow };
}));
