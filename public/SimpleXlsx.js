// Lector y escritor mínimo de archivos .xlsx, sin librerías (el sistema no deja cargar scripts de otros sitios). Sirve para la plantilla de Alta Artículos:
//  - writeXlsx(sheets)  -> Uint8Array con un .xlsx válido (zip sin comprimir, textos en línea). sheets = [{ name, rows: [[...]], widths?: [n], headerRow?: true, textColumns?: [0] }]
//  - readXlsx(buffer)   -> Promise<string[][]> con las filas de la PRIMERA hoja (los números como texto). Entiende los .xlsx de Excel (zip comprimido con deflate, textos compartidos).
// Funciona igual en el navegador y en Node (para las pruebas). Leer pide DecompressionStream (Chrome/Edge, Firefox 113+, Safari 16.4+).
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SimpleXlsx = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    const enc = new TextEncoder();
    const dec = new TextDecoder('utf-8');

    // ---- zip ---------------------------------------------------------------------------------------------------------------------------
    const CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n += 1) {
            let c = n;
            for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c >>> 0;
        }
        return table;
    })();
    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }
    // Zip con los archivos sin comprimir (método 0): es lo más simple y Excel lo abre igual.
    function zipStore(files) {
        const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1;
        const chunks = [];
        const central = [];
        let offset = 0;
        const u16 = (v) => new Uint8Array([v & 255, (v >>> 8) & 255]);
        const u32 = (v) => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
        const push = (...parts) => parts.forEach((p) => { chunks.push(p); offset += p.length; });
        files.forEach((file) => {
            const name = enc.encode(file.name);
            const crc = crc32(file.data);
            const start = offset;
            push(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(DOS_DATE), u32(crc), u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), name, file.data);
            central.push({ name, crc, size: file.data.length, start });
        });
        const cdStart = offset;
        central.forEach((e) => push(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(DOS_DATE), u32(e.crc), u32(e.size), u32(e.size), u16(e.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.start), e.name));
        const cdSize = offset - cdStart;
        push(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(cdStart), u16(0));
        const out = new Uint8Array(offset);
        let at = 0;
        chunks.forEach((c) => { out.set(c, at); at += c.length; });
        return out;
    }

    // ---- escribir -------------------------------------------------------------------------------------------------------------------------
    const xmlEsc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    const colLetter = (i) => { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
    const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

    function sheetXml(sheet) {
        const rows = sheet.rows || [];
        const widths = sheet.widths || [];
        const textCols = new Set(sheet.textColumns || []);
        let xml = `${HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`;
        if (sheet.headerRow) xml += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
        const width = Math.max(widths.length, ...rows.map((r) => r.length), 1);
        let cols = '';
        for (let i = 0; i < width; i += 1) cols += `<col min="${i + 1}" max="${i + 1}" width="${widths[i] || 16}" customWidth="1"${textCols.has(i) ? ' style="3"' : ''}/>`;
        xml += `<cols>${cols}</cols><sheetData>`;
        rows.forEach((row, r) => {
            xml += `<row r="${r + 1}">`;
            row.forEach((value, c) => {
                if (value === null || value === undefined || value === '') return;
                const ref = `${colLetter(c)}${r + 1}`;
                const style = sheet.headerRow && r === 0 ? 1 : (textCols.has(c) ? 3 : 2);
                xml += `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
            });
            xml += '</row>';
        });
        return `${xml}</sheetData></worksheet>`;
    }

    function writeXlsx(sheets) {
        const list = sheets.map((s, i) => ({ ...s, id: i + 1, name: String(s.name || `Hoja${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) }));
        const files = [];
        const add = (name, text) => files.push({ name, data: enc.encode(text) });
        add('[Content_Types].xml', `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${list.map((s) => `<Override PartName="/xl/worksheets/sheet${s.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
        add('_rels/.rels', `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
        add('xl/workbook.xml', `${HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list.map((s) => `<sheet name="${xmlEsc(s.name)}" sheetId="${s.id}" r:id="rId${s.id}"/>`).join('')}</sheets></workbook>`);
        add('xl/_rels/workbook.xml.rels', `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((s) => `<Relationship Id="rId${s.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.id}.xml"/>`).join('')}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
        // estilos: 0 normal, 1 encabezado (negrita sobre gris), 2 texto normal, 3 texto (formato @, para que un UPC no pierda sus ceros)
        add('xl/styles.xml', `${HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3E4EC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
        list.forEach((s) => add(`xl/worksheets/sheet${s.id}.xml`, sheetXml(s)));
        return zipStore(files);
    }

    // ---- leer ---------------------------------------------------------------------------------------------------------------------------------
    async function inflateRaw(bytes) {
        if (typeof DecompressionStream === 'undefined') throw new Error('no-decompression');
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    function readZipEntries(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let end = -1;
        for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
            if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
        }
        if (end < 0) throw new Error('not-a-zip');
        const count = view.getUint16(end + 10, true);
        let at = view.getUint32(end + 16, true);
        const entries = new Map();
        for (let n = 0; n < count; n += 1) {
            if (view.getUint32(at, true) !== 0x02014b50) throw new Error('bad-zip');
            const method = view.getUint16(at + 10, true);
            const csize = view.getUint32(at + 20, true);
            const nameLen = view.getUint16(at + 28, true);
            const extraLen = view.getUint16(at + 30, true);
            const commentLen = view.getUint16(at + 32, true);
            const local = view.getUint32(at + 42, true);
            const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
            entries.set(name, { method, csize, local });
            at += 46 + nameLen + extraLen + commentLen;
        }
        return { entries, view };
    }
    async function entryText(zip, bytes, name) {
        const e = zip.entries.get(name);
        if (!e) return null;
        const nameLen = zip.view.getUint16(e.local + 26, true);
        const extraLen = zip.view.getUint16(e.local + 28, true);
        const start = e.local + 30 + nameLen + extraLen;
        const raw = bytes.subarray(start, start + e.csize);
        if (e.method === 0) return dec.decode(raw);
        if (e.method === 8) return dec.decode(await inflateRaw(raw));
        throw new Error('zip-method');
    }
    const xmlUnesc = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, g) => {
        if (g === 'amp') return '&'; if (g === 'lt') return '<'; if (g === 'gt') return '>'; if (g === 'quot') return '"'; if (g === 'apos') return "'";
        const code = g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    });
    // El texto de un <si> o <is>: la suma de sus <t> (con varios tramos si lleva formato).
    function textOf(fragment) {
        const parts = [];
        const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
        let m;
        while ((m = re.exec(fragment))) parts.push(m[1] ? xmlUnesc(m[1]) : '');
        return parts.join('');
    }
    const colIndex = (letters) => letters.toUpperCase().split('').reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    // Un número en notación científica (7.5E12) se vuelve a escribir con todos sus dígitos.
    const plainNumber = (v) => (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(v) ? Number(v).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 15 }) : v);

    async function readXlsx(input) {
        const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
        const zip = readZipEntries(bytes);
        const sharedXml = await entryText(zip, bytes, 'xl/sharedStrings.xml');
        const shared = [];
        if (sharedXml) {
            const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g;
            let m;
            while ((m = re.exec(sharedXml))) shared.push(m[1] ? textOf(m[1]) : '');
        }
        // la primera hoja según el libro; si no se puede saber, la primera que haya
        let target = null;
        const wb = await entryText(zip, bytes, 'xl/workbook.xml');
        const rels = await entryText(zip, bytes, 'xl/_rels/workbook.xml.rels');
        if (wb && rels) {
            const first = wb.match(/<sheet\s[^>]*?r:id="([^"]+)"/);
            if (first) {
                const rel = [...rels.matchAll(/<Relationship\s[^>]*>/g)].map((x) => x[0]).find((tag) => new RegExp(`Id="${first[1]}"`).test(tag));
                const t = rel && rel.match(/Target="([^"]+)"/);
                if (t) target = t[1].startsWith('/') ? t[1].slice(1) : `xl/${t[1]}`;
            }
        }
        if (!target || !zip.entries.has(target)) target = [...zip.entries.keys()].filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()[0];
        if (!target) throw new Error('no-sheet');
        const sheet = await entryText(zip, bytes, target);
        const rows = [];
        const rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
        let rm;
        while ((rm = rowRe.exec(sheet))) {
            const tag = rm[0];
            const rn = tag.match(/^<row\b[^>]*?\br="(\d+)"/);
            const rowIndex = rn ? Number(rn[1]) - 1 : rows.length;
            const cells = [];
            const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
            let cm;
            while ((cm = cellRe.exec(rm[1] || ''))) {
                const attrs = cm[1];
                const ref = attrs.match(/\br="([A-Za-z]+)\d+"/);
                const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || 'n';
                const body = cm[2] || '';
                let value = '';
                if (type === 'inlineStr') value = textOf(body);
                else {
                    const v = body.match(/<v>([\s\S]*?)<\/v>/);
                    const raw = v ? xmlUnesc(v[1]) : '';
                    if (type === 's') value = shared[Number(raw)] === undefined ? '' : shared[Number(raw)];
                    else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
                    else if (type === 'str' || type === 'e') value = raw;
                    else value = plainNumber(raw);
                }
                const idx = ref ? colIndex(ref[1]) : cells.length;
                cells[idx] = value;
            }
            for (let i = 0; i < cells.length; i += 1) if (cells[i] === undefined) cells[i] = '';
            rows[rowIndex] = cells;
        }
        for (let i = 0; i < rows.length; i += 1) if (rows[i] === undefined) rows[i] = [];
        return rows;
    }

    return { writeXlsx, readXlsx };
}));
