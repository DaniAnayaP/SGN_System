// Carga por plantilla de Relación Código Envío: columnas de la plantilla, cómo se reconocen los encabezados que trae un Excel y las reglas de cada fila (el código y el lugar de envío se convierten en sus ids). La pantalla
// lo usa para marcar los errores antes de cargar; el servidor NO se fía de eso: cada fila que llega vuelve a pasar por la misma revisión que una relación hecha a mano (tryCreateShipRelation en server.js). Funciona igual
// en el navegador y en Node.
//
// Una fila = un código enviado a un lugar (un código que se envía a varios lugares lleva varias filas). El código se reconoce por su Código SKU o por su Descripción Única: con UNA de las dos basta (si vienen las dos tienen que ser
// del mismo código); el Lugar de envío es obligatorio; el Centro de Costos es opcional si hay un solo centro marcado arriba (o la empresa tiene uno solo): las filas sin centro se cargan en él.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.EnvTemplate = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    const MAX_ROWS = 500; // filas por petición al servidor (la ventana parte los archivos más grandes en tandas)

    // key = dato de la fila; col = hoja de permisos de esa columna en el árbol.
    const COLUMNS = [
        { key: 'sku', es: 'Código SKU', en: 'SKU Code', col: 'colEnvSku', anyOf: true, aliases: ['sku', 'codigo', 'articulo', 'codigo sku', 'registro unico', 'upc', 'codigo de barras'] },
        { key: 'description', es: 'Descripción Única', en: 'Unique Description', col: 'colEnvDescripcion', anyOf: true, aliases: ['descripcion unica', 'descripcion', 'descripcion del codigo', 'unique description', 'description'] },
        { key: 'place', es: 'Lugar de envío', en: 'Shipping place', col: 'colEnvLugar', required: true, aliases: ['lugar', 'lugar envio', 'lugar de envio', 'lugares de envio', 'envio a', 'envios a', 'destino', 'hospital', 'place', 'ship to', 'shipping place'] },
        { key: 'center', es: 'Centro de Costos', en: 'Cost Center', col: 'colEnvCentroCostos', aliases: ['centro costos', 'centro de costos', 'centro', 'cost center', 'sitio'] },
    ];
    const BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));

    // sin mayúsculas, acentos, paréntesis ni signos: "Lugar de envío", "lugar-de-envio" y "LUGAR DE ENVIO" son lo mismo
    const norm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    // la Descripción Única se compara sin mayúsculas, sin acentos y sin espacios de más (los signos y los números sí cuentan), igual que en Alta Artículos
    const descKey = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
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

    // Convierte una matriz de celdas (Excel o texto pegado) en filas { n, v: { dato: texto } }. n = número de fila de Excel (1 = encabezados). Con encabezados hacen falta el Código SKU o la Descripción Única (con una basta) y el
    // lugar de envío; sin encabezados se toma el orden de siempre (SKU, lugar, centro).
    function rowsFromMatrix(matrix) {
        const first = matrix.findIndex((r) => (r || []).some((c) => String(c == null ? '' : c).trim() !== ''));
        if (first < 0) return { error: 'empty', rows: [] };
        const head = mapHeaders(matrix[first]);
        let keys;
        let start;
        if (head.matched >= 1) {
            if (!head.used.has('sku') && !head.used.has('description')) return { error: 'code', rows: [], ignored: head.ignored };
            if (!head.used.has('place')) return { error: 'place', rows: [], ignored: head.ignored };
            keys = head.keys;
            start = first + 1;
        } else if (/^\d/.test(String(matrix[first][0] == null ? '' : matrix[first][0]).trim()) && (matrix[first] || []).length >= 2) {
            keys = ['sku', 'place', 'center'];
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

    // Revisa UNA fila con los catálogos que da ctx:
    //   itemBySku(n) / itemByUpc(texto) / itemByDescription(clave descKey) -> { id, … } | null        placeByName(nombre normalizado) -> { id, name, active } | null
    //   centers: [{ id, name, code }]   selectedIds: los centros marcados arriba (null = todos)
    //   existingRelation(clave) -> algo | null      priorRowWithKey(clave, fila) -> número de la fila anterior del archivo con lo mismo (o 0)
    // Devuelve { error } con { field, code, params } o { action: 'create' | 'same', values: { skuItemId, placeId, costCenterId }, key }.
    function planRow(row, ctx) {
        const v = row.v;
        const bad = (field, code, params) => ({ error: { field, code, params: params || {} } });
        const rawSku = String(v.sku || '').trim();
        const rawDesc = String(v.description || '').trim();
        if (!rawSku && !rawDesc) return bad('sku', 'codeRequired'); // con el SKU o con la Descripción Única basta
        const byDescription = rawDesc && ctx.itemByDescription ? ctx.itemByDescription(descKey(rawDesc)) : null;
        let item = null;
        if (rawSku) {
            if (/^\d+$/.test(rawSku)) item = ctx.itemBySku(Number(rawSku)) || ctx.itemByUpc(rawSku);
            else if (/^[A-Za-z]{6}\d{6,9}$/.test(rawSku)) item = ctx.itemBySku(rawSku.toUpperCase()) || ctx.itemByUpc(rawSku); // el SKU completo (CMCSCD000123)
            else item = ctx.itemByUpc(rawSku);
            if (!item) return bad('sku', 'skuUnknown', { value: rawSku });
            // si vienen las dos tienen que ser del mismo código
            if (rawDesc && (!byDescription || byDescription.id !== item.id)) return bad('description', 'descMismatch', { sku: item.sku });
        } else {
            item = byDescription;
            if (!item) return bad('description', 'descUnknown', { value: rawDesc });
        }
        const rawPlace = String(v.place || '').trim();
        if (!rawPlace) return bad('place', 'placeRequired');
        const place = ctx.placeByName(norm(rawPlace));
        if (!place) return bad('place', 'placeUnknown', { value: rawPlace });
        if (!place.active) return bad('place', 'placeInactive', { value: place.name });
        let center = null;
        const rawCenter = String(v.center || '').trim();
        if (rawCenter) {
            const wanted = norm(rawCenter);
            center = (ctx.centers || []).find((c) => norm(c.name) === wanted || (c.code && norm(c.code) === wanted)) || null;
            if (!center) return bad('center', 'centerUnknown', { value: rawCenter });
        } else if (ctx.selectedIds && ctx.selectedIds.length === 1) center = (ctx.centers || []).find((c) => c.id === ctx.selectedIds[0]) || null;
        else if ((ctx.centers || []).length === 1) center = ctx.centers[0];
        if (!center) return bad('center', 'centerNeeded');
        const key = `${center.id}|${item.id}|${place.id}`;
        const values = { skuItemId: item.id, placeId: place.id, costCenterId: center.id };
        if (ctx.existingRelation(key)) return { action: 'same', values, key, item, place, center };
        const prior = ctx.priorRowWithKey(key, row);
        if (prior) return bad('place', 'duplicateInFile', { n: prior });
        return { action: 'create', values, key, item, place, center };
    }

    return { MAX_ROWS, COLUMNS, BY_KEY, norm, descKey, rowsFromMatrix, planRow };
}));
