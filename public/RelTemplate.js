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

    // key = dato de la fila; col = hoja de permisos de esa columna en el árbol (las mismas de Relación Código). El Localizador (siempre con las 7 piezas) reúne zona, huella, activo, nivel, columna, fila y profundidad en una sola celda.
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
        { key: 'slot', es: 'Columna', en: 'Column', col: 'colRelEspacio', aliases: ['espacio', 'slot', 'column', 'col'] },
        { key: 'row', es: 'Fila', en: 'Row', col: 'colRelFila', aliases: ['row'] },
        { key: 'depth', es: 'Profundidad', en: 'Depth', col: 'colRelProfundidad', aliases: ['prof', 'fondo', 'depth'] },
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
            keys = COLUMNS.map((c) => c.key);
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
    const trailingNumber = (text) => { const m = String(text == null ? '' : text).match(/(\d+)\s*$/); return m ? Number(m[1]) : NaN; };

    // El Localizador va SIEMPRE completo, con las 7 piezas: Z006.H005.A005.N003.C001.F001.P001 = Zona 6 · Huella 5 · Activo A5 · Nivel 3 · Columna 1 · Fila 1 · Profundidad 1. El hueco es nivel × columna;
    // dentro de él están la fila y la profundidad. Z = el número con que termina el nombre de la zona; H = el del código de la huella (R-05 -> H005); la letra del activo dice qué tipo de espacio del Layout es
    // (A anaquel, R rack, G gabeta, T tarima en piso) y su número es el del código del activo (A-05 -> A005). Ya no existe la forma corta sin la H: así el Localizador completo es el mismo en todas partes.
    const ASSET_TYPES = { A: 'rack', R: 'rackpal', G: 'cabinet', T: 'pallet' };
    const LETTER_OF_TYPE = Object.fromEntries(Object.entries(ASSET_TYPES).map(([letter, type]) => [type, letter]));
    const pad3 = (n) => String(n).padStart(3, '0');
    function parseLocator(raw) {
        const parts = String(raw).split('.').map((s) => s.trim()).filter(Boolean);
        const out = { zone: null, footprint: null, asset: null, level: null, column: null, row: null, depth: null };
        if (!parts.length || parts.length > 7) return { error: 'locatorFormat' };
        for (const part of parts) {
            const m = part.match(/^([A-Za-z])\s*(\d+)$/);
            if (!m) return { error: 'locatorFormat' };
            const letter = m[1].toUpperCase();
            const n = Number(m[2]);
            if (!(n >= 1)) return { error: 'locatorFormat' };
            if (letter === 'Z') { if (out.zone !== null) return { error: 'locatorFormat' }; out.zone = n; }
            else if (letter === 'H') { if (out.footprint !== null) return { error: 'locatorFormat' }; out.footprint = n; }
            else if (letter === 'N') { if (out.level !== null) return { error: 'locatorFormat' }; out.level = n; }
            else if (letter === 'C') { if (out.column !== null) return { error: 'locatorFormat' }; out.column = n; }
            else if (letter === 'F') { if (out.row !== null) return { error: 'locatorFormat' }; out.row = n; }
            else if (letter === 'P') { if (out.depth !== null) return { error: 'locatorFormat' }; out.depth = n; }
            else { if (out.asset) return { error: 'locatorFormat' }; out.asset = { letter, num: n }; }
        }
        // las 7 piezas son obligatorias: si falta alguna se dice cuáles
        const missing = [['Z', out.zone], ['H', out.footprint], ['A', out.asset], ['N', out.level], ['C', out.column], ['F', out.row], ['P', out.depth]].filter(([, value]) => value === null).map(([name]) => name);
        if (missing.length) return { error: 'locatorIncomplete', missing: missing.join(', ') };
        return out;
    }
    // El Localizador completo de un lugar de una relación; vacío si todavía no se puede armar (sin lugar completo, o una zona, huella o activo cuyo nombre o código no termina en número).
    function formatLocator(p) {
        const z = trailingNumber(p.zoneName);
        const h = trailingNumber(p.footprintCode);
        const a = trailingNumber(p.spaceCode);
        const letter = LETTER_OF_TYPE[p.spaceType];
        if (!(z >= 1) || !(h >= 1) || !(a >= 1) || !letter || !(p.level >= 1) || !(p.slot >= 1)) return '';
        return `Z${pad3(z)}.H${pad3(h)}.${letter}${pad3(a)}.N${pad3(p.level)}.C${pad3(p.slot)}.F${pad3(p.row || 1)}.P${pad3(p.depth || 1)}`;
    }

    // ctx = {
    //   itemBySku(n) / itemByUpc(upc) -> { id, sku, ... } | null,
    //   centers: [{ id, code, name }] (completos), selectedIds: null (todos) | [ids] (los marcados arriba),
    //   warehouses: [{ id, name, parentId, status }], subWarehouses: [{ id, name, parentId, status, kind, locations: [{ zoneId, spaceIds }] }],
    //   zonesByCenter: { centro: [{ id, name, footprints: [{ id, code }], spaces: [{ id, code, type, footprintId, levels, slots, bays: [{ n, c, rows?, depth? }] }] }] }  (spaces = los activos),
    //   relationsOf(itemId) -> las relaciones que ese código ya tiene [{ id, costCenterId, warehouseId, subWarehouseId, zoneId, spaceId, level, slot }],
    //   occupiedBy(spaceId, nivel, columna, fila, profundidad) -> SKU que lo ocupa ('' = libre), existingKey(key) -> ya existe esa misma relación,
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
        const rowRaw = text('row');
        const depthRaw = text('depth');
        let loc = null;
        if (locRaw) {
            if (zoneRaw || footprintRaw || rackRaw || levelRaw || slotRaw || rowRaw || depthRaw) return err('locator', 'locatorAndColumns');
            loc = parseLocator(locRaw);
            if (loc.error) return err('locator', loc.error, { value: locRaw, missing: loc.missing || '' });
        }
        const hasPlace = !!(locRaw || zoneRaw || footprintRaw || rackRaw || levelRaw || slotRaw || rowRaw || depthRaw);
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

        // ---- el lugar: zona > estante > nivel > columna > fila > profundidad (por columnas o por Localizador). El hueco es nivel × columna; dentro del hueco están las filas y las profundidades (Layout > Posiciones).
        let zone = null;
        let footprint = null;
        let rack = null;
        let level = null;
        let slot = null;
        let rowNo = null;
        let depth = null;
        let bay = { rows: 1, depth: 1 };
        const bayOfRack = (r, n, c) => { const b = ((r && r.bays) || []).find((x) => x.n === n && x.c === c) || {}; return { rows: b.rows || 1, depth: b.depth || 1 }; };
        if (hasPlace) {
            if (sub.kind !== 'physical') return err(loc ? 'locator' : 'zone', 'subNotPhysical', { sub: sub.name });
            const entries = sub.locations || [];
            const assigned = (ctx.zonesByCenter[center.id] || []).filter((z) => entries.some((e) => e.zoneId === z.id));
            const F = (field) => (loc ? 'locator' : field); // en qué dato se marca el error
            let levelGiven = null;
            let columnGiven = null;
            let rowGiven = null;
            let depthGiven = null;
            if (loc) {
                const zones = assigned.filter((z) => trailingNumber(z.name) === loc.zone);
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
                rowGiven = loc.row;
                depthGiven = loc.depth;
            } else {
                if (!zoneRaw) return err('zone', 'zoneMissing');
                zone = assigned.find((z) => norm(z.name) === norm(zoneRaw)) || null;
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
                rowGiven = asNum(rowRaw);
                depthGiven = asNum(depthRaw);
            }
            footprint = rack && zone ? ((zone.footprints || []).find((f) => f.id === rack.footprintId) || null) : null;
            const given = (n) => n !== null; // NaN también cuenta como «dicho» (texto que no es un número): falla el rango
            if (!rack) {
                if (given(levelGiven) || given(columnGiven) || given(rowGiven) || given(depthGiven)) return err(F('rack'), 'rackMissing');
            } else if (!given(levelGiven)) {
                if (given(columnGiven) || given(rowGiven) || given(depthGiven)) return err(F('level'), 'levelMissing');
            } else {
                const levels = rack.levels || 1;
                const slots = rack.slots || 1;
                if (!(levelGiven >= 1 && levelGiven <= levels)) return err(F('level'), 'levelRange', { value: loc ? `N${String(levelGiven).padStart(3, '0')}` : levelRaw, max: levels, rack: rack.code });
                level = levelGiven;
                if (given(columnGiven)) {
                    if (!(columnGiven >= 1 && columnGiven <= slots)) return err(F('slot'), 'slotRange', { value: loc ? `C${String(columnGiven).padStart(3, '0')}` : slotRaw, max: slots, rack: rack.code });
                    slot = columnGiven;
                } else if (slots <= 1) slot = 1; // un estante de una sola columna no necesita que se diga
                else if (loc || given(rowGiven) || given(depthGiven)) return err(F('slot'), loc ? 'columnNeeded' : 'slotMissing', { rack: rack.code, max: slots });
                if (slot !== null) {
                    bay = bayOfRack(rack, level, slot);
                    if (given(rowGiven)) {
                        if (!(rowGiven >= 1 && rowGiven <= bay.rows)) return err(F('row'), 'rowRange', { value: loc ? `F${String(rowGiven).padStart(3, '0')}` : rowRaw, max: bay.rows, rack: rack.code });
                        rowNo = rowGiven;
                    }
                    if (given(depthGiven)) {
                        if (!(depthGiven >= 1 && depthGiven <= bay.depth)) return err(F('depth'), 'depthRange', { value: loc ? `P${String(depthGiven).padStart(3, '0')}` : depthRaw, max: bay.depth, rack: rack.code });
                        depth = depthGiven;
                    }
                }
            }
        }

        // La fila y la profundidad de un hueco de una sola fila / una sola profundidad están implícitas y no se guardan; si tiene más de una hay que decir cuál (si no, la relación queda A medias).
        if (rowNo !== null && bay.rows <= 1) rowNo = null;
        if (depth !== null && bay.depth <= 1) depth = null;
        const key = [item.id, center.id, wh.id, sub ? sub.id : 0, zone ? zone.id : '', rack ? rack.id : '', level || 0, slot || 0, rowNo || 0, depth || 0].join('|');
        const located = !!sub && (sub.kind === 'virtual' || !!(rack && level && slot && (rowNo || bay.rows <= 1) && (depth || bay.depth <= 1)));
        const values = {
            skuItemId: item.id, costCenterId: center.id, warehouseId: wh.id, subWarehouseId: sub ? sub.id : null,
            zoneId: zone ? zone.id : '', spaceId: rack ? rack.id : '', level, slot, row: rowNo, depth,
            classification: cls || (target ? undefined : 'activo'), // al completar una relación sin decir la clasificación, conserva la que tenía
        };
        const route = [center.name, wh.name, sub ? sub.name : '', zone ? zone.name : '', footprint ? footprint.code : '', rack ? rack.code : ''].filter(Boolean);
        const base = { values, route, keys: { place: `rel|${key}`, slot: rack && level && slot ? `slot|${rack.id}|${level}|${slot}|${rowNo || 1}|${depth || 1}` : '', claim: target ? `upd|${target.id}` : '' }, located, item };
        // ¿ese lugar ya es de este código? (existingRelation = su relación, con su clasificación; existingKey = solo que existe)
        const existingRel = ctx.existingRelation ? ctx.existingRelation(key) : (ctx.existingKey && ctx.existingKey(key) ? {} : null);
        if (base.keys.slot) {
            const occupant = ctx.occupiedBy(rack.id, level, slot, rowNo || 1, depth || 1);
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
