// Carga por plantilla de Relación Código: columnas de la plantilla, cómo se reconocen los encabezados que trae un Excel y las reglas de cada fila (los nombres se convierten en los ids de
// la cascada centro de costos > almacén > sub almacén > zona > estante > nivel > espacio). La pantalla lo usa para marcar los errores antes de cargar; el servidor NO se fía de eso: cada fila
// que llega pasa por la misma revisión que una relación hecha a mano (validateCodeRelationState en server.js). Funciona igual en el navegador y en Node.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.RelTemplate = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    const MAX_ROWS = 500; // filas por petición al servidor (la ventana parte los archivos más grandes en tandas)

    // key = dato de la fila; col = hoja de permisos de esa columna en el árbol (las mismas de Relación Código).
    const COLUMNS = [
        { key: 'sku', es: 'Código SKU', en: 'SKU Code', col: 'colRelSku', required: true, aliases: ['sku', 'codigo', 'codigo sku', 'registro unico', 'upc', 'codigo de barras'] },
        { key: 'center', es: 'Centro de Costos', en: 'Cost Center', col: 'colRelCentroCostos', aliases: ['centro costos', 'centro', 'cost center', 'sitio'] },
        { key: 'warehouse', es: 'Almacén', en: 'Warehouse', col: 'colRelAlmacen', required: true, aliases: ['almacen', 'warehouse'] },
        { key: 'sub', es: 'Sub almacén', en: 'Sub-warehouse', col: 'colRelSubAlmacen', aliases: ['sub almacen', 'subalmacen', 'sub warehouse'] },
        { key: 'zone', es: 'Zona', en: 'Zone', col: 'colRelZona', aliases: ['zone'] },
        { key: 'rack', es: 'Estante', en: 'Rack', col: 'colRelEstante', aliases: ['anaquel', 'estanteria', 'rack'] },
        { key: 'level', es: 'Nivel', en: 'Level', col: 'colRelNivel', aliases: ['level'] },
        { key: 'slot', es: 'Espacio', en: 'Slot', col: 'colRelEspacio', aliases: ['slot'] },
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
    // Con encabezados hacen falta al menos el SKU y el Almacén (las dos obligatorias); sin encabezados se toma el orden de la plantilla.
    function rowsFromMatrix(matrix) {
        const first = matrix.findIndex((r) => (r || []).some((c) => String(c == null ? '' : c).trim() !== ''));
        if (first < 0) return { error: 'empty', rows: [] };
        const head = mapHeaders(matrix[first]);
        let keys;
        let start;
        if (head.matched >= 1) {
            if (!head.used.has('sku')) return { error: 'sku', rows: [], ignored: head.ignored };
            if (!head.used.has('warehouse')) return { error: 'warehouse', rows: [], ignored: head.ignored };
            keys = head.keys;
            start = first + 1;
        } else if (/^\d/.test(String(matrix[first][0] == null ? '' : matrix[first][0]).trim()) && (matrix[first] || []).length >= 3) {
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

    // ctx = {
    //   itemBySku(n) / itemByUpc(upc) -> { id, sku, ... } | null,
    //   centers: [{ id, code, name }] (completos), selectedIds: null (todos) | [ids] (los marcados arriba),
    //   warehouses: [{ id, name, parentId, status }], subWarehouses: [{ id, name, parentId, status, kind, locations: [{ zoneId, spaceIds }] }],
    //   zonesByCenter: { centro: [{ id, name, spaces: [{ id, code, levels, slots }] }] },
    //   occupiedBy(spaceId, level, slot) -> SKU que lo ocupa ('' = libre), existingKey(key) -> ya existe esa misma relación,
    //   priorRowWithKey(key, row) -> número de otra fila anterior del archivo con lo mismo (0 = ninguna)
    // }
    // Regresa { error: { field, code, params } } o { action: 'create' | 'same', values, keys, located }.
    function planRow(row, ctx) {
        const v = row.v;
        const err = (field, code, params) => ({ error: { field, code, params: params || {} } });
        const text = (k) => String(v[k] == null ? '' : v[k]).trim();

        const skuRaw = text('sku');
        if (!skuRaw) return err('sku', 'skuMissing');
        let item = /^\d{1,9}$/.test(skuRaw) ? ctx.itemBySku(Number(skuRaw)) : null;
        if (!item && /^\d{8,14}$/.test(skuRaw)) item = ctx.itemByUpc(skuRaw);
        if (!item) return err('sku', 'skuNotFound', { sku: skuRaw });

        // centro de costos: el de la fila, o el único marcado arriba si la fila no lo trae
        const centerRaw = text('center');
        let center = null;
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

        // almacén (obligatorio): uno activo de ese centro
        const whRaw = text('warehouse');
        if (!whRaw) return err('warehouse', 'warehouseMissing');
        const wk = norm(whRaw);
        const whAny = ctx.warehouses.find((w) => w.parentId === center.id && norm(w.name) === wk);
        if (!whAny) return err('warehouse', 'warehouseNotFound', { value: whRaw, center: center.name });
        if (whAny.status !== 'active') return err('warehouse', 'warehouseInactive', { value: whRaw });
        const wh = whAny;

        const subRaw = text('sub');
        const zoneRaw = text('zone');
        const rackRaw = text('rack');
        const levelRaw = text('level');
        const slotRaw = text('slot');
        let sub = null;
        let zone = null;
        let rack = null;
        let level = null;
        let slot = null;
        if (!subRaw) {
            if (zoneRaw || rackRaw || levelRaw || slotRaw) return err('sub', 'subMissing');
        } else {
            const sk = norm(subRaw);
            const subAny = ctx.subWarehouses.find((s) => s.parentId === wh.id && norm(s.name) === sk);
            if (!subAny) return err('sub', 'subNotFound', { value: subRaw, warehouse: wh.name });
            if (subAny.status !== 'active') return err('sub', 'subInactive', { value: subRaw });
            sub = subAny;
            if (zoneRaw || rackRaw || levelRaw || slotRaw) {
                if (sub.kind !== 'physical') return err('zone', 'subNotPhysical', { sub: sub.name });
                if (!zoneRaw) return err('zone', 'zoneMissing');
                const entries = sub.locations || [];
                const zk = norm(zoneRaw);
                zone = (ctx.zonesByCenter[center.id] || []).filter((z) => entries.some((e) => e.zoneId === z.id)).find((z) => norm(z.name) === zk) || null;
                if (!zone) return err('zone', 'zoneNotFound', { value: zoneRaw, sub: sub.name });
                const entry = entries.find((e) => e.zoneId === zone.id);
                if (!rackRaw && (levelRaw || slotRaw)) return err('rack', 'rackMissing');
                if (rackRaw) {
                    const rk = norm(rackRaw);
                    rack = zone.spaces.filter((s) => !entry.spaceIds.length || entry.spaceIds.includes(s.id)).find((s) => norm(s.code) === rk) || null;
                    if (!rack) return err('rack', 'rackNotFound', { value: rackRaw, zone: zone.name });
                    if (!levelRaw && slotRaw) return err('level', 'levelMissing');
                    if (levelRaw) {
                        level = intOf(levelRaw);
                        if (!Number.isInteger(level) || level < 1 || level > (rack.levels || 1)) return err('level', 'levelRange', { value: levelRaw, max: rack.levels || 1, rack: rack.code });
                        if (slotRaw) {
                            slot = intOf(slotRaw);
                            if (!Number.isInteger(slot) || slot < 1 || slot > (rack.slots || 1)) return err('slot', 'slotRange', { value: slotRaw, max: rack.slots || 1, rack: rack.code });
                        }
                    }
                }
            }
        }

        const key = [item.id, center.id, wh.id, sub ? sub.id : 0, zone ? zone.id : '', rack ? rack.id : '', level || 0, slot || 0].join('|');
        const located = !!sub && (sub.kind === 'virtual' || !!(rack && level && slot));
        const values = {
            skuItemId: item.id, costCenterId: center.id, warehouseId: wh.id, subWarehouseId: sub ? sub.id : null,
            zoneId: zone ? zone.id : '', spaceId: rack ? rack.id : '', level, slot,
        };
        const route = [center.name, wh.name, sub ? sub.name : '', zone ? zone.name : '', rack ? rack.code : ''].filter(Boolean);
        const base = { values, route, keys: { place: `rel|${key}`, slot: rack && level && slot ? `slot|${rack.id}|${level}|${slot}` : '' }, located, item };
        if (base.keys.slot) {
            const occupant = ctx.occupiedBy(rack.id, level, slot);
            if (occupant && !ctx.existingKey(key)) return err('slot', 'occupied', { sku: occupant });
        }
        if (ctx.existingKey(key)) return { action: 'same', ...base };
        const dup = ctx.priorRowWithKey(base.keys.place, row);
        if (dup) return err('sku', 'duplicateInFile', { row: dup });
        if (base.keys.slot) {
            const prior = ctx.priorRowWithKey(base.keys.slot, row);
            if (prior) return err('slot', 'occupiedInFile', { row: prior });
        }
        return { action: 'create', ...base };
    }

    return { MAX_ROWS, COLUMNS, BY_KEY, norm, rowsFromMatrix, planRow };
}));
