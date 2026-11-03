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

    // key = dato de la fila; col = hoja de permisos de esa columna en el árbol (las mismas de Relación Código). El Localizador reúne zona, estante, nivel y espacio en una sola celda.
    const COLUMNS = [
        { key: 'sku', es: 'Código SKU', en: 'SKU Code', col: 'colRelSku', required: true, aliases: ['sku', 'articulo', 'codigo', 'codigo sku', 'registro unico', 'upc', 'codigo de barras'] },
        { key: 'locator', es: 'Localizador', en: 'Locator', col: 'colRelEstante', aliases: ['localizador', 'localizacion', 'ubicacion', 'locator'] },
        { key: 'center', es: 'Centro de Costos', en: 'Cost Center', col: 'colRelCentroCostos', aliases: ['centro costos', 'centro', 'cost center', 'sitio'] },
        { key: 'warehouse', es: 'Almacén', en: 'Warehouse', col: 'colRelAlmacen', aliases: ['almacen', 'warehouse'] },
        { key: 'sub', es: 'Sub almacén', en: 'Sub-warehouse', col: 'colRelSubAlmacen', aliases: ['sub almacen', 'subalmacen', 'sub warehouse'] },
        { key: 'zone', es: 'Zona', en: 'Zone', col: 'colRelZona', aliases: ['zone'] },
        { key: 'rack', es: 'Estante', en: 'Rack', col: 'colRelEstante', aliases: ['anaquel', 'estanteria', 'rack'] },
        { key: 'level', es: 'Nivel', en: 'Level', col: 'colRelNivel', aliases: ['level'] },
        { key: 'slot', es: 'Fila', en: 'Row', col: 'colRelEspacio', aliases: ['espacio', 'slot', 'row'] },
        { key: 'depth', es: 'Profundidad', en: 'Depth', col: 'colRelProfundidad', aliases: ['prof', 'fondo', 'depth'] },
    ];
    const BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));

    // sin mayúsculas, acentos, paréntesis ni signos: "Sub almacén", "sub-almacen" y "SUB ALMACEN" son lo mismo
    const norm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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

    // Localizador corto (dentro de un mismo sitio): Z006.A005.N003.F001.P001 = Zona 6 · Anaquel 5 · Nivel 3 · Fila 1 · Profundidad 1.
    // La letra del activo dice qué tipo de espacio del Layout es: A anaquel, R rack, G gabeta, T tarima en piso; el número es el del código del espacio (R-05 -> A005).
    const ASSET_TYPES = { A: 'rack', R: 'rackpal', G: 'cabinet', T: 'pallet' };
    function parseLocator(raw) {
        const parts = String(raw).split('.').map((s) => s.trim()).filter(Boolean);
        const out = { zone: null, asset: null, level: null, slot: null, depth: null };
        if (!parts.length || parts.length > 5) return { error: 'locatorFormat' };
        for (const part of parts) {
            const m = part.match(/^([A-Za-z])\s*(\d+)$/);
            if (!m) return { error: 'locatorFormat' };
            const letter = m[1].toUpperCase();
            const n = Number(m[2]);
            if (!(n >= 1)) return { error: 'locatorFormat' };
            if (letter === 'Z') { if (out.zone !== null) return { error: 'locatorFormat' }; out.zone = n; }
            else if (letter === 'N') { if (out.level !== null) return { error: 'locatorFormat' }; out.level = n; }
            else if (letter === 'F') { if (out.slot !== null) return { error: 'locatorFormat' }; out.slot = n; }
            else if (letter === 'P') { if (out.depth !== null) return { error: 'locatorFormat' }; out.depth = n; }
            else { if (out.asset) return { error: 'locatorFormat' }; out.asset = { letter, num: n }; }
        }
        if (out.zone === null) return { error: 'locatorFormat' };
        return out;
    }

    // ctx = {
    //   itemBySku(n) / itemByUpc(upc) -> { id, sku, ... } | null,
    //   centers: [{ id, code, name }] (completos), selectedIds: null (todos) | [ids] (los marcados arriba),
    //   warehouses: [{ id, name, parentId, status }], subWarehouses: [{ id, name, parentId, status, kind, locations: [{ zoneId, spaceIds }] }],
    //   zonesByCenter: { centro: [{ id, name, spaces: [{ id, code, type, levels, slots, depth }] }] },
    //   relationsOf(itemId) -> las relaciones que ese código ya tiene [{ id, costCenterId, warehouseId, subWarehouseId, zoneId, spaceId, level, slot }],
    //   occupiedBy(spaceId, level, fila, profundidad) -> SKU que lo ocupa ('' = libre), existingKey(key) -> ya existe esa misma relación,
    //   priorRowWithKey(key, row) -> número de otra fila anterior del archivo con lo mismo (0 = ninguna)
    // }
    // Regresa { error: { field, code, params } } o { action: 'create' | 'complete' | 'same', values, relationId?, keys, located, route }.
    function planRow(row, ctx) {
        const v = row.v;
        const err = (field, code, params) => ({ error: { field, code, params: params || {} } });
        const text = (k) => String(v[k] == null ? '' : v[k]).trim();

        const skuRaw = text('sku');
        if (!skuRaw) return err('sku', 'skuMissing');
        let item = /^\d{1,9}$/.test(skuRaw) ? ctx.itemBySku(Number(skuRaw)) : null;
        if (!item && /^\d{8,14}$/.test(skuRaw)) item = ctx.itemByUpc(skuRaw);
        if (!item) return err('sku', 'skuNotFound', { sku: skuRaw });

        const locRaw = text('locator');
        const zoneRaw = text('zone');
        const rackRaw = text('rack');
        const levelRaw = text('level');
        const slotRaw = text('slot');
        const depthRaw = text('depth');
        let loc = null;
        if (locRaw) {
            if (zoneRaw || rackRaw || levelRaw || slotRaw || depthRaw) return err('locator', 'locatorAndColumns');
            loc = parseLocator(locRaw);
            if (loc.error) return err('locator', loc.error, { value: locRaw });
        }
        const hasPlace = !!(locRaw || zoneRaw || rackRaw || levelRaw || slotRaw || depthRaw);
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

        // ---- el lugar: zona > estante > nivel > espacio (por columnas o por Localizador)
        let zone = null;
        let rack = null;
        let level = null;
        let slot = null;
        let depth = null;
        if (hasPlace) {
            if (sub.kind !== 'physical') return err(loc ? 'locator' : 'zone', 'subNotPhysical', { sub: sub.name });
            const entries = sub.locations || [];
            const assigned = (ctx.zonesByCenter[center.id] || []).filter((z) => entries.some((e) => e.zoneId === z.id));
            if (loc) {
                const zones = assigned.filter((z) => trailingNumber(z.name) === loc.zone);
                if (!zones.length) return err('locator', 'locatorZone', { value: locRaw, zone: loc.zone, sub: sub.name });
                if (zones.length > 1) return err('locator', 'locatorAmbiguous', { value: locRaw });
                zone = zones[0];
                const entry = entries.find((e) => e.zoneId === zone.id);
                const racks = zone.spaces.filter((s) => !entry.spaceIds.length || entry.spaceIds.includes(s.id));
                if (loc.asset) {
                    const type = ASSET_TYPES[loc.asset.letter];
                    if (!type) return err('locator', 'locatorAsset', { value: locRaw, letter: loc.asset.letter });
                    const found = racks.filter((s) => s.type === type && trailingNumber(s.code) === loc.asset.num);
                    if (!found.length) return err('locator', 'locatorRack', { value: locRaw, zone: zone.name });
                    if (found.length > 1) return err('locator', 'locatorAmbiguous', { value: locRaw });
                    rack = found[0];
                    if (loc.level !== null) {
                        level = loc.level;
                        if (level > (rack.levels || 1)) return err('locator', 'levelRange', { value: `N${String(level).padStart(3, '0')}`, max: rack.levels || 1, rack: rack.code });
                        if (loc.slot !== null) {
                            slot = loc.slot;
                            if (slot > (rack.slots || 1)) return err('locator', 'slotRange', { value: `F${String(slot).padStart(3, '0')}`, max: rack.slots || 1, rack: rack.code });
                            if (loc.depth !== null) {
                                depth = loc.depth;
                                if (depth > (rack.depth || 1)) return err('locator', 'depthRange', { value: `P${String(depth).padStart(3, '0')}`, max: rack.depth || 1, rack: rack.code });
                            }
                        } else if (loc.depth !== null) return err('locator', 'slotMissing');
                    } else if (loc.slot !== null || loc.depth !== null) return err('locator', 'levelMissing');
                } else if (loc.level !== null || loc.slot !== null || loc.depth !== null) return err('locator', 'rackMissing');
            } else {
                if (!zoneRaw) return err('zone', 'zoneMissing');
                zone = assigned.find((z) => norm(z.name) === norm(zoneRaw)) || null;
                if (!zone) return err('zone', 'zoneNotFound', { value: zoneRaw, sub: sub.name });
                const entry = entries.find((e) => e.zoneId === zone.id);
                if (!rackRaw && (levelRaw || slotRaw || depthRaw)) return err('rack', 'rackMissing');
                if (rackRaw) {
                    const rk = norm(rackRaw);
                    rack = zone.spaces.filter((s) => !entry.spaceIds.length || entry.spaceIds.includes(s.id)).find((s) => norm(s.code) === rk) || null;
                    if (!rack) return err('rack', 'rackNotFound', { value: rackRaw, zone: zone.name });
                    if (!levelRaw && (slotRaw || depthRaw)) return err('level', 'levelMissing');
                    if (levelRaw) {
                        level = intOf(levelRaw);
                        if (!Number.isInteger(level) || level < 1 || level > (rack.levels || 1)) return err('level', 'levelRange', { value: levelRaw, max: rack.levels || 1, rack: rack.code });
                        if (slotRaw) {
                            slot = intOf(slotRaw);
                            if (!Number.isInteger(slot) || slot < 1 || slot > (rack.slots || 1)) return err('slot', 'slotRange', { value: slotRaw, max: rack.slots || 1, rack: rack.code });
                        }
                        if (depthRaw && !slotRaw) return err('slot', 'slotMissing');
                        if (depthRaw) {
                            depth = intOf(depthRaw);
                            if (!Number.isInteger(depth) || depth < 1 || depth > (rack.depth || 1)) return err('depth', 'depthRange', { value: depthRaw, max: rack.depth || 1, rack: rack.code });
                        }
                    }
                }
            }
        }

        // En un anaquel de profundidad 1 la profundidad (P001) está implícita y no se guarda; si es más hondo hay que decir en cuál (si no, la relación queda A medias).
        const rackDepth = rack ? (rack.depth || 1) : 1;
        if (depth !== null && rackDepth <= 1) depth = null;
        const key = [item.id, center.id, wh.id, sub ? sub.id : 0, zone ? zone.id : '', rack ? rack.id : '', level || 0, slot || 0, depth || 0].join('|');
        const located = !!sub && (sub.kind === 'virtual' || !!(rack && level && slot && (depth || rackDepth <= 1)));
        const values = {
            skuItemId: item.id, costCenterId: center.id, warehouseId: wh.id, subWarehouseId: sub ? sub.id : null,
            zoneId: zone ? zone.id : '', spaceId: rack ? rack.id : '', level, slot, depth,
        };
        const route = [center.name, wh.name, sub ? sub.name : '', zone ? zone.name : '', rack ? rack.code : ''].filter(Boolean);
        const base = { values, route, keys: { place: `rel|${key}`, slot: rack && level && slot ? `slot|${rack.id}|${level}|${slot}|${depth || 1}` : '', claim: target ? `upd|${target.id}` : '' }, located, item };
        if (base.keys.slot) {
            const occupant = ctx.occupiedBy(rack.id, level, slot, depth || 1);
            if (occupant && !ctx.existingKey(key)) return err(loc ? 'locator' : 'slot', 'occupied', { sku: occupant });
        }
        if (ctx.existingKey(key)) return { action: 'same', ...base };
        const dup = ctx.priorRowWithKey(base.keys.place, row);
        if (dup) return err('sku', 'duplicateInFile', { row: dup });
        if (base.keys.slot) {
            const prior = ctx.priorRowWithKey(base.keys.slot, row);
            if (prior) return err(loc ? 'locator' : 'slot', 'occupiedInFile', { row: prior });
        }
        return target ? { action: 'complete', relationId: target.id, ...base } : { action: 'create', ...base };
    }

    return { MAX_ROWS, COLUMNS, BY_KEY, ASSET_TYPES, norm, parseLocator, rowsFromMatrix, planRow };
}));
