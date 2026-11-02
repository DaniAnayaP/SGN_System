// Carga por plantilla de Alta Nuestros Artículos: columnas de la plantilla, cómo se reconocen los encabezados que trae un Excel y las reglas de cada fila. Lo usan la pantalla
// (para marcar los errores antes de cargar) y el servidor (que vuelve a revisar todo, nunca se fía de la pantalla). Funciona igual en el navegador y en Node.
//
// validateRow devuelve null (la fila está bien) o { field, code, params }; el servidor lo escribe en español con message() y la pantalla con sus textos es/en (main.tplErr_<code>).
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SkuTemplate = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    const MAX_ROWS = 500;
    const TYPES = { 'articulo terminado': 'articulo-terminado', 'materia prima': 'materia-prima' };
    const TYPE_LABELS = { 'articulo-terminado': 'Artículo Terminado', 'materia-prima': 'Materia Prima' };
    const MAX_TEXT = 200;
    const MAX_NUMBER = 100000;

    // key = campo del artículo (el mismo de SKU_ITEM_PATCHABLE_FIELDS en db.js); header = encabezado de la plantilla; col = hoja de permisos de esa columna en el árbol.
    const COLUMNS = [
        { key: 'upc', es: 'UPC', en: 'UPC', col: 'colArticuloUpc', required: true, aliases: ['codigo de barras', 'codigo barras', 'ean'] },
        { key: 'uniqueDescription', es: 'Descripción Única', en: 'Unique Description', col: 'colArticuloDescUnica', kind: 'text', aliases: ['descripcion unica'] },
        { key: 'knownDescription', es: 'Descripción Conocida', en: 'Known Description', col: 'colArticuloDescConocida', kind: 'text', aliases: ['descripcion conocida'] },
        { key: 'customDescription', es: 'Descripción Personalizada', en: 'Custom Description', col: 'colArticuloDescPersonalizada', kind: 'text', aliases: ['descripcion personalizada'] },
        { key: 'mainUom', es: 'UDM Principal', en: 'Main UOM', col: 'colArticuloUdm', kind: 'udm', aliases: ['udm', 'unidad de medida', 'unidad medida', 'uom'] },
        { key: 'articleType', es: 'Tipo de Artículo', en: 'Article Type', col: 'colArticuloTipo', kind: 'type', aliases: ['tipo', 'tipo articulo', 'type'] },
        { key: 'height', es: 'Alto (cm)', en: 'Height (cm)', col: 'colArticuloAlto', kind: 'number', unit: 'cm', aliases: ['alto', 'height'] },
        { key: 'length', es: 'Largo (cm)', en: 'Length (cm)', col: 'colArticuloLargo', kind: 'number', unit: 'cm', aliases: ['largo', 'length'] },
        { key: 'width', es: 'Ancho (cm)', en: 'Width (cm)', col: 'colArticuloAncho', kind: 'number', unit: 'cm', aliases: ['ancho', 'width'] },
        { key: 'articleWeight', es: 'Peso Artículo (kg)', en: 'Article Weight (kg)', col: 'colArticuloPesoArticulo', kind: 'number', unit: 'kg', aliases: ['peso articulo', 'peso del articulo', 'peso', 'article weight'] },
        { key: 'packageWeight', es: 'Peso Empaque Principal (kg)', en: 'Main Package Weight (kg)', col: 'colArticuloPesoEmpaque', kind: 'number', unit: 'kg', aliases: ['peso empaque', 'peso empaque principal', 'peso del empaque', 'package weight'] },
        { key: 'categoryInventario', es: 'Categoría Inventario', en: 'Inventory Category', col: 'colArticuloCategoriaInventario', kind: 'category', type: 'inventario', aliases: ['categoria inventarios'] },
        { key: 'categoryCompra', es: 'Categoría Compra', en: 'Purchasing Category', col: 'colArticuloCategoriaCompra', kind: 'category', type: 'compra', aliases: ['categoria compras'] },
        { key: 'categoryAlmacenamiento', es: 'Categoría Almacenamiento', en: 'Storage Category', col: 'colArticuloCategoriaAlmacenamiento', kind: 'category', type: 'almacenamiento', aliases: [] },
        { key: 'categoryRotacion', es: 'Categoría Rotación', en: 'Rotation Category', col: 'colArticuloCategoriaRotacion', kind: 'category', type: 'rotacion', aliases: [] },
        { key: 'categoryManejo', es: 'Categoría Manejo', en: 'Handling Category', col: 'colArticuloCategoriaManejo', kind: 'category', type: 'manejo', aliases: ['categoria manejo especial'] },
        { key: 'categoryRiesgo', es: 'Categoría Riesgo', en: 'Risk Category', col: 'colArticuloCategoriaRiesgo', kind: 'category', type: 'riesgo', aliases: [] },
        { key: 'categoryVidautil', es: 'Categoría Vida útil', en: 'Shelf Life Category', col: 'colArticuloCategoriaVidautil', kind: 'category', type: 'vidautil', aliases: ['categoria vida util'] },
    ];
    const BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));

    // sin mayúsculas, acentos, paréntesis (las unidades) ni signos: "Alto (cm)" y "alto" son la misma columna
    const norm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    // Columnas nuevas de la carga con actualización (Web): SKU = el registro único de cada código (lo asigna el sistema) y Clasificación (se guarda su id, aquí va el nombre). La App sigue con
    // COLUMNS (las 18 de siempre) y las mismas funciones de siempre; lo nuevo es ALL_COLUMNS, planRow y rowsFromMatrix(matrix, { full: true }).
    const SKU_COLUMN = { key: 'sku', es: 'SKU', en: 'SKU', kind: 'sku', aliases: ['registro unico', 'sku del sistema', 'codigo sku'] };
    const CLASSIFICATION_COLUMN = { key: 'classificationId', es: 'Clasificación', en: 'Classification', col: 'colArticuloClasificacion', kind: 'classification', aliases: ['clasificacion del articulo'] };
    const ALL_COLUMNS = [SKU_COLUMN, ...COLUMNS, CLASSIFICATION_COLUMN];
    const BY_KEY_ALL = Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c]));
    const indexFor = (cols) => {
        const map = new Map();
        cols.forEach((c) => { [c.es, c.en, ...(c.aliases || [])].forEach((name) => { if (!map.has(norm(name))) map.set(norm(name), c.key); }); });
        return map;
    };
    const HEADER_INDEX = indexFor(COLUMNS);
    const HEADER_INDEX_ALL = indexFor(ALL_COLUMNS);

    // Qué columna es cada celda de la primera fila. matched = cuántos encabezados se reconocieron; ignored = los que no (no se usan).
    function mapHeaders(firstRow, full) {
        const used = new Set();
        const index = full ? HEADER_INDEX_ALL : HEADER_INDEX;
        const keys = (firstRow || []).map((cell) => {
            const key = index.get(norm(cell));
            if (!key || used.has(key)) return null;
            used.add(key);
            return key;
        });
        return {
            keys,
            matched: keys.filter(Boolean).length,
            hasUpc: used.has('upc'),
            hasKey: used.has('upc') || used.has('sku'),
            ignored: (firstRow || []).map((cell, i) => (keys[i] ? '' : String(cell == null ? '' : cell).trim())).filter(Boolean),
        };
    }

    // Convierte una matriz de celdas (Excel o texto pegado) en filas { n, v: { campo: texto } }. n = número de fila de Excel (1 = encabezados).
    // opts.full = lee también las columnas SKU y Clasificación y basta con que traiga UPC o SKU (se puede cargar un archivo con una sola columna).
    function rowsFromMatrix(matrix, opts = {}) {
        const full = !!opts.full;
        const cols = full ? ALL_COLUMNS : COLUMNS;
        const first = matrix.findIndex((r) => (r || []).some((c) => String(c == null ? '' : c).trim() !== ''));
        if (first < 0) return { error: 'empty', rows: [] };
        const head = mapHeaders(matrix[first], full);
        let keys;
        let start;
        if (full ? (head.hasKey && head.matched >= 1) : (head.hasUpc && head.matched >= 2)) { keys = head.keys; start = first + 1; }
        else if (/^\d/.test(String(matrix[first][0] == null ? '' : matrix[first][0]).trim())) { keys = COLUMNS.map((c) => c.key); start = first; } // sin encabezados: el orden de la plantilla
        else return { error: 'columns', rows: [] };
        const rows = [];
        for (let i = start; i < matrix.length; i += 1) {
            const cells = matrix[i] || [];
            const v = {};
            keys.forEach((key, c) => { if (key) v[key] = String(cells[c] == null ? '' : cells[c]).trim(); });
            if (!Object.values(v).some((x) => x !== '')) continue;
            cols.forEach((c) => { if (v[c.key] === undefined) v[c.key] = ''; });
            rows.push({ n: i + 1, v });
        }
        return { rows, ignored: head.ignored, usedKeys: keys.filter(Boolean) };
    }

    // Texto pegado desde Excel: columnas separadas por tabulador (o ; / , si no hay tabuladores) y renglones por salto de línea. Respeta comillas.
    function parseDelimited(text) {
        const t = String(text || '').replace(/\r\n?/g, '\n');
        const firstLine = t.split('\n').find((l) => l.trim() !== '') || '';
        const delim = firstLine.includes('\t') ? '\t' : (firstLine.includes(';') ? ';' : ',');
        const rows = [];
        let row = [];
        let cell = '';
        let quoted = false;
        for (let i = 0; i < t.length; i += 1) {
            const ch = t[i];
            if (quoted) {
                if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false; } else cell += ch;
            } else if (ch === '"' && cell === '') quoted = true;
            else if (ch === delim) { row.push(cell); cell = ''; }
            else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
            else cell += ch;
        }
        row.push(cell);
        if (row.length > 1 || row[0] !== '') rows.push(row);
        return rows;
    }

    const stripKey = (v) => norm(String(v == null ? '' : v).replace(/-/g, ' '));
    const parseNumber = (raw) => {
        const s = String(raw).trim().replace(',', '.');
        if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
        return Number(s);
    };
    const matchName = (value, names) => {
        const k = norm(value);
        return (names || []).find((n) => norm(n) === k) || null;
    };

    // ctx = {
    //   udm: [nombres activos del catálogo Unidad de Medida],
    //   categories: { inventario: [...], compra: [...], ... },
    //   existingUpc: (upc) => SKU con ceros o '',        // artículos que ya existen en el sistema
    //   priorRowWithUpc: (upc, row) => número de fila o 0 // otra fila anterior del archivo con el mismo UPC (que no esté quitada)
    // }
    function validateRow(row, ctx) {
        const v = row.v || {};
        const upc = String(v.upc == null ? '' : v.upc).trim();
        if (!upc) return { field: 'upc', code: 'upcRequired', params: {} };
        if (!/^\d{8,14}$/.test(upc)) return { field: 'upc', code: 'upcFormat', params: {} };
        const prior = ctx.priorRowWithUpc ? ctx.priorRowWithUpc(upc, row) : 0;
        if (prior) return { field: 'upc', code: 'upcDuplicateFile', params: { row: prior } };
        const sku = ctx.existingUpc ? ctx.existingUpc(upc) : '';
        if (sku) return { field: 'upc', code: 'upcExists', params: { sku } };
        for (const c of COLUMNS) {
            const value = String(v[c.key] == null ? '' : v[c.key]).trim();
            if (!value) continue;
            if (c.kind === 'text' && value.length > MAX_TEXT) return { field: c.key, code: 'tooLong', params: { label: c.es, labelEn: c.en, max: MAX_TEXT } };
            if (c.kind === 'udm' && !matchName(value, ctx.udm)) return { field: c.key, code: 'udmUnknown', params: { value, options: (ctx.udm || []).slice(0, 8).join(', ') } };
            if (c.kind === 'type' && !TYPES[stripKey(value)]) return { field: c.key, code: 'typeUnknown', params: {} };
            if (c.kind === 'number') {
                const n = parseNumber(value);
                if (!Number.isFinite(n) || n <= 0 || n > MAX_NUMBER) return { field: c.key, code: 'number', params: { label: c.es, labelEn: c.en, unit: c.unit } };
            }
            if (c.kind === 'category' && !matchName(value, (ctx.categories || {})[c.type])) return { field: c.key, code: 'categoryUnknown', params: { label: c.es, labelEn: c.en, value } };
        }
        return null;
    }

    // Lo que se guarda en el artículo (solo las columnas con dato), ya con el nombre exacto del catálogo, el tipo en su clave y los números como número.
    function normalizeRow(row, ctx) {
        const v = row.v || {};
        const out = {};
        COLUMNS.forEach((c) => {
            const value = String(v[c.key] == null ? '' : v[c.key]).trim();
            if (!value) return;
            if (c.kind === 'udm') out[c.key] = matchName(value, ctx.udm);
            else if (c.kind === 'type') out[c.key] = TYPES[stripKey(value)];
            else if (c.kind === 'number') out[c.key] = parseNumber(value);
            else if (c.kind === 'category') out[c.key] = matchName(value, (ctx.categories || {})[c.type]);
            else out[c.key] = value;
        });
        return out;
    }

    // ---- Carga con actualización (Web): qué pasa con cada fila ------------------------------------------------------------------------------
    // planRow decide el destino de UNA fila y es la misma regla en la ventana (que la muestra) y en el servidor (que la aplica y nunca se fía de la ventana):
    //   create = código nuevo · update = el código ya existe y cambia algo · same = ya tiene exactamente esos datos · complete = ya está completo (se corrige en Edición Código, aquí no se toca)
    //   error  = { field, code, params }.
    // ctx = {
    //   allowUpdate,                              // false = como siempre: un UPC que ya existe es error (la App)
    //   selected,                                 // Set con las columnas que se cargan (null = todas); el SKU y el UPC siempre son llaves
    //   udm, categories,                          // catálogos activos
    //   classifications: { all: [nombres], byCategory: { [categoría Inventario]: [nombres] } },
    //   itemBySku(n), itemByUpc(upc),             // artículo existente: { sku, upc, complete, v: { campo: valor actual } } o null
    //   priorRowWithKey(key, row),                // fila anterior del archivo que ya usa ese mismo código (0 = ninguna)
    // }
    const sameValue = (a, b) => (typeof b === 'number' ? Number(a) === b : String(a == null ? '' : a) === String(b));
    const isEmptyValue = (v) => v === '' || v == null || v === 0;
    function planRow(row, ctx) {
        const v = row.v || {};
        const chosen = (key) => !ctx.selected || ctx.selected.has(key);
        const val = (key) => String(v[key] == null ? '' : v[key]).trim();
        const skuRaw = val('sku');
        const upc = val('upc');
        const fail = (field, code, params) => ({ error: { field, code, params: params || {} } });
        let item = null;
        if (skuRaw) {
            if (!/^\d{1,9}$/.test(skuRaw)) return fail('sku', 'skuFormat');
            item = ctx.itemBySku ? ctx.itemBySku(Number(skuRaw)) : null;
            if (!item) return fail('sku', 'skuUnknown', { sku: skuRaw });
        } else if (upc) {
            if (!/^\d{8,14}$/.test(upc)) return fail('upc', 'upcFormat');
            item = ctx.itemByUpc ? ctx.itemByUpc(upc) : null;
        } else {
            return fail('upc', 'keyRequired');
        }
        if (upc && !/^\d{8,14}$/.test(upc)) return fail('upc', 'upcFormat');
        if (item && !ctx.allowUpdate) return fail('upc', 'upcExists', { sku: item.sku });
        const key = item ? `sku:${item.sku}` : `upc:${upc}`;
        const prior = ctx.priorRowWithKey ? ctx.priorRowWithKey(key, row) : 0;
        if (prior) return fail(skuRaw ? 'sku' : 'upc', 'upcDuplicateFile', { row: prior });
        if (item && item.complete) return { action: 'complete', item, key };
        if (item && upc && upc !== item.upc) {
            const other = ctx.itemByUpc ? ctx.itemByUpc(upc) : null;
            if (other && other.sku !== item.sku) return fail('upc', 'upcExists', { sku: other.sku });
        }
        // cada dato que viene (de las columnas elegidas), con las mismas reglas de siempre
        for (const c of ALL_COLUMNS) {
            if (c.kind === 'sku' || c.key === 'upc' || !chosen(c.key)) continue;
            const value = val(c.key);
            if (!value) continue;
            if (c.kind === 'text' && value.length > MAX_TEXT) return fail(c.key, 'tooLong', { label: c.es, labelEn: c.en, max: MAX_TEXT });
            if (c.kind === 'udm' && !matchName(value, ctx.udm)) return fail(c.key, 'udmUnknown', { value, options: (ctx.udm || []).slice(0, 8).join(', ') });
            if (c.kind === 'type' && !TYPES[stripKey(value)]) return fail(c.key, 'typeUnknown');
            if (c.kind === 'number') {
                const n = parseNumber(value);
                if (!Number.isFinite(n) || n <= 0 || n > MAX_NUMBER) return fail(c.key, 'number', { label: c.es, labelEn: c.en, unit: c.unit });
            }
            if (c.kind === 'category' && !matchName(value, (ctx.categories || {})[c.type])) return fail(c.key, 'categoryUnknown', { label: c.es, labelEn: c.en, value });
        }
        // lo que se escribiría, normalizado (nombre exacto del catálogo, tipo en su clave, números como número)
        const incoming = {};
        for (const c of ALL_COLUMNS) {
            if (c.kind === 'sku' || (c.key !== 'upc' && !chosen(c.key))) continue;
            const value = val(c.key);
            if (!value) continue;
            if (c.kind === 'udm') incoming[c.key] = matchName(value, ctx.udm);
            else if (c.kind === 'type') incoming[c.key] = TYPES[stripKey(value)];
            else if (c.kind === 'number') incoming[c.key] = parseNumber(value);
            else if (c.kind === 'category') incoming[c.key] = matchName(value, (ctx.categories || {})[c.type]);
            else if (c.kind === 'classification') incoming[c.key] = matchName(value, ((ctx.classifications || {}).all) || []) || value;
            else incoming[c.key] = value;
        }
        // la clasificación solo vale si es de la Categoría Inventario del código (la de esta fila o la que ya tiene)
        const categoryNow = incoming.categoryInventario || (item && item.v.categoryInventario) || '';
        const allowedFor = (category) => ((ctx.classifications || {}).byCategory || {})[category] || [];
        if (incoming.classificationId !== undefined) {
            if (!matchName(incoming.classificationId, ((ctx.classifications || {}).all) || [])) return fail('classificationId', 'classUnknown', { value: incoming.classificationId });
            if (!categoryNow) return fail('classificationId', 'classNeedsCategory');
            const allowed = allowedFor(categoryNow);
            if (!matchName(incoming.classificationId, allowed)) return fail('classificationId', 'classNotOfCategory', { value: incoming.classificationId, category: categoryNow, options: allowed.slice(0, 8).join(', ') || '—' });
        }
        if (!item) return { action: 'create', patch: incoming, key };
        const changes = [];
        Object.entries(incoming).forEach(([field, to]) => {
            const from = item.v[field] == null ? '' : item.v[field];
            if (sameValue(from, to)) return;
            changes.push({ key: field, from, to, kind: isEmptyValue(from) ? 'fill' : 'change' });
        });
        // si cambia la categoría y la clasificación que tenía ya no es de la nueva, se quita sola (igual que al cambiarla a mano en la tabla)
        const clears = [];
        if (incoming.categoryInventario && incoming.categoryInventario !== item.v.categoryInventario && item.v.classificationId && incoming.classificationId === undefined
            && !matchName(item.v.classificationId, allowedFor(incoming.categoryInventario))) clears.push('classificationId');
        if (!changes.length && !clears.length) return { action: 'same', item, key };
        return { action: 'update', item, key, changes, clears, patch: Object.fromEntries(changes.map((c) => [c.key, c.to])) };
    }

    const MESSAGES_ES = {
        upcRequired: () => 'UPC: es obligatorio.',
        upcFormat: () => 'UPC: escribe solo números, de 8 a 14 dígitos.',
        upcDuplicateFile: (p) => `Ese UPC ya está en la fila ${p.row} de tu archivo. Escribe otro UPC o quita la fila.`,
        upcExists: (p) => `Ese UPC ya existe como SKU ${p.sku} y no se vuelve a cargar. Escribe otro UPC o quita la fila.`,
        tooLong: (p) => `${p.label}: es demasiado largo (máximo ${p.max} letras).`,
        udmUnknown: (p) => `UDM Principal: «${p.value}» no está en el catálogo. Opciones: ${p.options}.`,
        typeUnknown: () => 'Tipo de Artículo: escribe «Artículo Terminado» o «Materia Prima».',
        number: (p) => `${p.label}: escribe solo el número, en ${p.unit === 'kg' ? 'kilos (por ejemplo 0.5)' : 'centímetros (por ejemplo 12)'}.`,
        categoryUnknown: (p) => `${p.label}: «${p.value}» no está en el catálogo.`,
        skuFormat: () => 'SKU: escribe solo el número del SKU (por ejemplo 000123).',
        skuUnknown: (p) => `El SKU ${p.sku} no existe. El SKU lo asigna el sistema: déjalo vacío si la fila es nueva, o corrígelo.`,
        keyRequired: () => 'Escribe el UPC (o el SKU, si el código ya existe).',
        classUnknown: (p) => `Clasificación: «${p.value}» no está en el catálogo.`,
        classNeedsCategory: () => 'Clasificación: primero necesita la Categoría Inventario del código (ponla en la misma fila o llénala antes).',
        classNotOfCategory: (p) => `Clasificación: «${p.value}» no es de la categoría «${p.category}». Opciones: ${p.options}.`,
    };
    const message = (err) => (err ? (MESSAGES_ES[err.code] || (() => err.code))(err.params || {}) : '');

    return { MAX_ROWS, COLUMNS, BY_KEY, ALL_COLUMNS, BY_KEY_ALL, TYPE_LABELS, norm, mapHeaders, rowsFromMatrix, parseDelimited, validateRow, normalizeRow, planRow, message };
}));
