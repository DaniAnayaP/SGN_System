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
    const HEADER_INDEX = (() => {
        const map = new Map();
        COLUMNS.forEach((c) => { [c.es, c.en, ...(c.aliases || [])].forEach((name) => { if (!map.has(norm(name))) map.set(norm(name), c.key); }); });
        return map;
    })();

    // Qué columna es cada celda de la primera fila. matched = cuántos encabezados se reconocieron; ignored = los que no (no se usan).
    function mapHeaders(firstRow) {
        const used = new Set();
        const keys = (firstRow || []).map((cell) => {
            const key = HEADER_INDEX.get(norm(cell));
            if (!key || used.has(key)) return null;
            used.add(key);
            return key;
        });
        return {
            keys,
            matched: keys.filter(Boolean).length,
            hasUpc: used.has('upc'),
            ignored: (firstRow || []).map((cell, i) => (keys[i] ? '' : String(cell == null ? '' : cell).trim())).filter(Boolean),
        };
    }

    // Convierte una matriz de celdas (Excel o texto pegado) en filas { n, v: { campo: texto } }. n = número de fila de Excel (1 = encabezados).
    function rowsFromMatrix(matrix) {
        const first = matrix.findIndex((r) => (r || []).some((c) => String(c == null ? '' : c).trim() !== ''));
        if (first < 0) return { error: 'empty', rows: [] };
        const head = mapHeaders(matrix[first]);
        let keys;
        let start;
        if (head.hasUpc && head.matched >= 2) { keys = head.keys; start = first + 1; }
        else if (/^\d/.test(String(matrix[first][0] == null ? '' : matrix[first][0]).trim())) { keys = COLUMNS.map((c) => c.key); start = first; } // sin encabezados: el orden de la plantilla
        else return { error: 'columns', rows: [] };
        const rows = [];
        for (let i = start; i < matrix.length; i += 1) {
            const cells = matrix[i] || [];
            const v = {};
            keys.forEach((key, c) => { if (key) v[key] = String(cells[c] == null ? '' : cells[c]).trim(); });
            if (!Object.values(v).some((x) => x !== '')) continue;
            COLUMNS.forEach((c) => { if (v[c.key] === undefined) v[c.key] = ''; });
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
    };
    const message = (err) => (err ? (MESSAGES_ES[err.code] || (() => err.code))(err.params || {}) : '');

    return { MAX_ROWS, COLUMNS, BY_KEY, TYPE_LABELS, norm, mapHeaders, rowsFromMatrix, parseDelimited, validateRow, normalizeRow, message };
}));
