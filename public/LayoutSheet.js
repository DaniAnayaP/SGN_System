// ---------------------------------------------------------------------------
// La hoja que se descarga del Layout: nombre del cliente, mapa, KPIs, QR, versión y fecha. Se arma como un SVG con el ancho y el largo (en cm) que se elijan (A3 horizontal
// si no se dice otra cosa), y de ahí salen el PNG (se pinta en un canvas) y el PDF (la misma imagen dentro de una página, sin librerías: un PDF de una sola imagen se escribe a mano).
// La hoja se acomoda sola al espacio: horizontal (las tarjetas de m² a la derecha del mapa), vertical (las tarjetas abajo) o chica (solo lo principal). Si el espacio es más chico
// que una hoja estándar, el archivo sale en la hoja más chica donde quepa (Carta, A4, A3 o Tabloide) con el espacio marcado con una línea punteada para recortar. Todo ocurre en el
// navegador con lo ÚLTIMO GUARDADO que trae GET /api/business/layout/qr, así que la hoja trae lo mismo que se ve al escanear el QR.
// ---------------------------------------------------------------------------
(function () {
    const PX_CM = 1600 / 42; // la hoja A3 de siempre: 42 cm = 1600 px
    const FONT = 'Poppins, Arial, Helvetica, sans-serif';
    const LIMITS = { min: 6, max: 120 };
    // Hojas estándar (ancho × largo en cm, en horizontal) y medidas rápidas.
    const PAGES = [['Carta', 27.94, 21.59], ['A4', 29.7, 21], ['A3', 42, 29.7], ['Tabloide', 43.18, 27.94]];
    const PRESETS = [['a3h', 42, 29.7], ['a4h', 29.7, 21], ['cartah', 27.94, 21.59], ['a4v', 21, 29.7], ['mediacarta', 21.59, 13.97], ['tarjeta', 10.5, 14.8]];
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmt = (n, lang) => (Number.isFinite(n) ? n : 0).toLocaleString(lang === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 2 });
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const dim = (n) => String(Math.round(n * 10) / 10);

    // La hoja del archivo para un espacio de wCm × hCm: del mismo tamaño, o (si el espacio es más chico que una hoja estándar y se quiere la línea de recorte) la más chica donde quepa.
    function pageFor(wCm, hCm, cut) {
        if (cut !== false) {
            for (const [name, pw, ph] of PAGES) {
                const fits = (a, b) => (wCm <= a + 0.05 && hCm <= b + 0.05 ? { name, w: a, h: b } : null);
                const hit = fits(pw, ph) || fits(ph, pw);
                if (hit) return hit.w - wCm > 1.6 || hit.h - hCm > 1.6 ? { name: hit.name, w: hit.w, h: hit.h, small: true } : { name: '', w: wCm, h: hCm, small: false };
            }
        }
        return { name: '', w: wCm, h: hCm, small: false };
    }

    // Módulos del QR (rows = filas de '0'/'1') como un solo trazo, con su zona blanca alrededor.
    function qrPath(rows, x, y, size, ink = '#14161F', sw = 3) {
        const n = rows.length;
        const unit = size / (n + 8);
        let d = '';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
            if (rows[r][c] === '1') d += `M${(x + (c + 4) * unit).toFixed(2)} ${(y + (r + 4) * unit).toFixed(2)}h${unit.toFixed(2)}v${unit.toFixed(2)}h-${unit.toFixed(2)}z`;
        }
        return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#FFFFFF" stroke="${ink}" stroke-width="${sw}" rx="8"/><path d="${d}" fill="#14161F"/>`;
    }

    // El contenido de la hoja dentro de un espacio de W × H px (el que se imprime). Con 1600 × 1131 queda como la hoja A3 de siempre.
    function sheetContent(data, labels, lang, W, H) {
        const k = data.kpis;
        const th = data.theme || window.LayoutMapSvg.DEFAULT_THEME;
        const C = th.chrome;
        const f = clamp(Math.min(W, H) / 1131, 0.34, 1.8);
        const m = 48 * f;
        const land = W / H >= 1.12;
        const tiny = Math.min(W, H) / PX_CM < 13;
        const dateFmt = (d) => d.toLocaleString(lang === 'en' ? 'en-US' : 'es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const utc = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
        const initials = (data.companyName || '').trim().slice(0, 2).toUpperCase() || '··';
        const xs = data.layout.vertices.map((p) => p[0]);
        const ys = data.layout.vertices.map((p) => p[1]);
        const dims = `${fmt(Math.max(...xs) - Math.min(...xs), lang)} × ${fmt(Math.max(...ys) - Math.min(...ys), lang)} m`;
        const hs = data.layout.vertices.map((p) => Number(p[2])).filter((h) => Number.isFinite(h));
        const hMin = Math.min(...hs);
        const hMax = Math.max(...hs);
        const heightText = hMin === hMax ? `${fmt(hMin, lang)} m` : `${fmt(hMin, lang)} – ${fmt(hMax, lang)} m`;
        const meta = `${dims} · ${labels.height} ${heightText} · ${data.layout.spaces.length} ${labels.spaces}`;
        const allCards = [
            [`${fmt(k.total, lang)} m²`, labels.kpiTotal], [`${fmt(k.offices, lang)} m²`, labels.kpiOffices], [`${fmt(k.aisles, lang)} m²`, labels.kpiAisles],
            [`${fmt(k.docks, lang)} m²`, labels.kpiDocks], [`${fmt(k.storage, lang)} m²`, labels.kpiStorage], [`${fmt(k.dead, lang)} m²`, labels.kpiDead], [`${fmt(k.volume, lang)} m³`, labels.kpiVolume],
        ];
        const cards = tiny ? [allCards[0], allCards[4], allCards[5], allCards[6]] : allCards;
        let s = `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
        // encabezado
        const bs = 84 * f;
        const nameSize = (tiny ? 27 : 36) * f;
        s += `<rect x="${m}" y="${m}" width="${bs}" height="${bs}" rx="${18 * f}" fill="${C.badge}"/><text x="${m + bs / 2}" y="${m + bs * 0.667}" font-size="${36 * f}" font-weight="700" fill="#FFFFFF" text-anchor="middle">${esc(initials)}</text>`;
        s += `<text x="${m + bs + 20 * f}" y="${m + 38 * f}" font-size="${nameSize}" font-weight="700" fill="${C.ink}">${esc(data.companyName)}</text><text x="${m + bs + 20 * f}" y="${m + 70 * f}" font-size="${21 * f}" fill="#3F435D">${esc(labels.area)}</text>`;
        s += `<text x="${m}" y="${m + 157 * f}" font-size="${(tiny ? 42 : 58) * f}" font-weight="700" fill="${C.ink}">${esc(labels.title)}</text><text x="${m}" y="${m + 195 * f}" font-size="${(tiny ? 19 : 23) * f}" fill="#3F435D">${esc(meta)}</text>`;
        const qs = clamp(230 * f, 70, Math.min(H * 0.22, W * 0.26));
        const qy = 40 * f;
        s += qrPath(data.qrRows, W - m - qs, qy, qs, C.ink, 3 * f);
        // El aviso del QR va abajo, junto al código: arriba se encimaba con los nombres largos de empresa.
        if (qs >= 110) {
            s += `<text x="${W - m - qs - 20 * f}" y="${qy + qs - 84 * f}" font-size="${23 * f}" font-weight="700" fill="${C.ink}" text-anchor="end">${esc(labels.scan)}</text>`;
            s += `<text x="${W - m - qs - 20 * f}" y="${qy + qs - 52 * f}" font-size="${19 * f}" fill="#3F435D" text-anchor="end">${esc(labels.fixed)}</text>`;
        }
        const urlY = qy + qs + 22 * f;
        s += `<text x="${W - m}" y="${urlY}" font-size="${14 * f}" font-family="Consolas, Menlo, monospace" fill="#6B7089" text-anchor="end">${esc(data.url)}</text>`;
        const ruleY = Math.max(urlY + 14 * f, m + 195 * f + 42 * f);
        s += `<line x1="${m}" y1="${ruleY}" x2="${W - m}" y2="${ruleY}" stroke="${C.rule}" stroke-width="${3 * f}"/>`;
        const top = ruleY + 20 * f;
        // pie
        const lineY = H - 91 * f;
        // leyenda: los tipos de zona (con los mismos colores del mapa) y, después, cada zona con formato propio con su nombre y su muestra; se acomoda en los renglones que haga falta
        const leg = [['door', labels.door], ['space', labels.space], ['dry', labels.dry], ['cold', labels.cold], ['chemical', labels.chemical], ['finished', labels.finished],
            ['dock', labels.dock], ['office', labels.office], ['aisle', labels.aisle], ['aisle2', labels.aisle2], ['none', labels.none]];
        (data.layout.zones || []).filter((z) => z.fmt).slice(0, 12).forEach((z) => leg.push([`zone:${z.id}`, z.name, z]));
        const legPos = [];
        let legX = m;
        let legRow = 0;
        leg.forEach((item) => {
            const textW = item[1].length * 8.6 * f;
            if (legX > m && legX + 30 * f + textW > W - m) { legX = m; legRow += 1; }
            legPos.push({ item, x: legX, row: legRow });
            legX += 30 * f + textW + 26 * f;
        });
        const legendH = tiny ? 0 : 28 * f * (legRow + 1) + 12 * f;
        const frameBottom = lineY - legendH;
        // mapa y tarjetas
        let frameX = m;
        let frameW;
        let frameH;
        if (land) {
            const cw = clamp(394 * f, 120, W * 0.27);
            const gap = 28 * f;
            frameW = W - 2 * m - cw - gap;
            frameH = frameBottom - top;
            const pitch = (frameH - 82 * f) / Math.max(cards.length - 1, 1);
            const cardH = Math.min(82 * f, pitch - 8 * f);
            const kk = cardH / (82 * f);
            cards.forEach((c, i) => {
                const y = top + i * pitch;
                s += `<rect x="${W - m - cw}" y="${y}" width="${cw}" height="${cardH}" rx="${10 * f}" fill="${C.cardBg}" stroke="${C.cardBorder}" stroke-width="${2 * f}"/>`;
                s += `<text x="${W - m - cw + 22 * f}" y="${y + 41 * f * kk}" font-size="${32 * f}" font-weight="700" fill="${C.cardInk}">${esc(c[0])}</text><text x="${W - m - cw + 22 * f}" y="${y + 68 * f * kk}" font-size="${17 * f}" fill="#3F435D">${esc(c[1])}</text>`;
            });
        } else {
            const rows = Math.ceil(cards.length / 2);
            const gp = 12 * f;
            const cardH = Math.min(82 * f, Math.max((frameBottom - top) * 0.1, 40 * f));
            const cardsH = rows * cardH + (rows - 1) * gp;
            frameW = W - 2 * m;
            frameH = frameBottom - top - cardsH - 20 * f;
            const cw = (frameW - gp) / 2;
            const kk = cardH / (82 * f);
            cards.forEach((c, i) => {
                const x = m + (i % 2) * (cw + gp);
                const y = frameBottom - cardsH + Math.floor(i / 2) * (cardH + gp);
                s += `<rect x="${x}" y="${y}" width="${cw}" height="${cardH}" rx="${10 * f}" fill="${C.cardBg}" stroke="${C.cardBorder}" stroke-width="${2 * f}"/>`;
                s += `<text x="${x + 22 * f}" y="${y + 41 * f * kk}" font-size="${32 * f}" font-weight="700" fill="${C.cardInk}">${esc(c[0])}</text><text x="${x + 22 * f}" y="${y + 68 * f * kk}" font-size="${17 * f}" fill="#3F435D">${esc(c[1])}</text>`;
            });
        }
        s += `<rect x="${frameX}" y="${top}" width="${frameW}" height="${frameH}" rx="${10 * f}" fill="#FFFFFF" stroke="${C.frame}" stroke-width="${2 * f}"/>`;
        // el mapa se dibuja en un lienzo de 700 px de ancho con la forma del marco, para aprovecharlo entero
        const innerW = frameW - 20 * f;
        const innerH = frameH - 20 * f;
        const h700 = Math.max(120, Math.round((700 * innerH) / Math.max(innerW, 1)));
        const mapInner = window.LayoutMapSvg.mapSvg(data.layout, { theme: th, width: 700, height: h700 }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
        s += `<svg x="${frameX + 10 * f}" y="${top + 10 * f}" width="${innerW}" height="${innerH}" viewBox="0 0 700 ${h700}" preserveAspectRatio="xMidYMid meet">${mapInner}</svg>`;
        legPos.forEach(({ item: [key, text, zone], x, row }) => {
            if (tiny) return;
            const ly = frameBottom + 4 * f + row * 28 * f;
            const sw = 20 * f;
            if (zone) {
                s += window.LayoutMapSvg.zonePaint(`lg-${zone.id}`, zone.fmt).markup(`${x},${ly} ${x + sw},${ly} ${x + sw},${ly + sw} ${x},${ly + sw}`);
            } else {
                let paint;
                if (key === 'door') paint = 'fill="#1E7E34" stroke="#1E7E34"';
                else if (key === 'space') paint = `fill="#FFFFFF" stroke="${C.line}"`;
                else { const c = th.types[key]; paint = `fill="${c[0]}" stroke="${c[1]}"${c[2] ? ` stroke-dasharray="${c[2]}"` : ''}`; }
                s += `<rect x="${x}" y="${ly}" width="${sw}" height="${sw}" rx="${4 * f}" ${paint} stroke-width="${1.5 * f}"/>`;
            }
            s += `<text x="${x + 30 * f}" y="${ly + 16 * f}" font-size="${16 * f}" fill="#3F435D">${esc(text)}</text>`;
        });
        s += `<line x1="${m}" y1="${lineY}" x2="${W - m}" y2="${lineY}" stroke="${C.cardBorder}" stroke-width="${2 * f}"/>`;
        s += `<text x="${m}" y="${H - 57 * f}" font-size="${19 * f}" fill="#3F435D">${esc(labels.printed)} <tspan font-weight="700" fill="${C.ink}">${esc(dateFmt(data.printedAt))}</tspan>${tiny ? '' : `. ${esc(labels.snapshot)}`}</text>`;
        s += `<text x="${m}" y="${H - 27 * f}" font-size="${17 * f}" fill="#6B7089">${esc(labels.updated)} ${esc(dateFmt(data.updatedAt))} (UTC ${utc(data.updatedAt)})</text>`;
        s += `<text x="${W - m}" y="${H - 41 * f}" font-size="${34 * f}" font-weight="700" fill="${C.ink}" text-anchor="end">${esc(labels.version)} ${data.version}</text>`;
        return s;
    }

    // data: { companyName, version, updatedAt (Date), printedAt (Date), url, qrRows, kpis, layout, theme }, labels: textos ya traducidos, lang: 'es' | 'en',
    // options: { widthCm, heightCm, cut } (el espacio que se imprime y si se dibuja la línea punteada para recortar).
    function buildSheetSvg(data, labels, lang, options = {}) {
        const wCm = clamp(Number(options.widthCm) || 42, LIMITS.min, LIMITS.max);
        const hCm = clamp(Number(options.heightCm) || 29.7, LIMITS.min, LIMITS.max);
        const cut = options.cut !== false;
        const page = pageFor(wCm, hCm, cut);
        const AW = wCm * PX_CM;
        const AH = hCm * PX_CM;
        const PW = page.w * PX_CM;
        const PH = page.h * PX_CM;
        const ox = page.small ? PX_CM : 0;
        const oy = page.small ? 1.4 * PX_CM : 0;
        let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PW.toFixed(2)} ${PH.toFixed(2)}" width="${PW.toFixed(2)}" height="${PH.toFixed(2)}" font-family="${FONT}" data-page-cm="${page.w} ${page.h}">`;
        s += `<rect width="${PW}" height="${PH}" fill="#FFFFFF"/>`;
        if (page.small) s += `<text x="${PX_CM}" y="${0.95 * PX_CM}" font-size="13" fill="#6B7089">${esc(String(labels.cutCaption || '').replace('{w}', dim(wCm)).replace('{h}', dim(hCm)))}</text>`;
        s += `<g transform="translate(${ox.toFixed(2)},${oy.toFixed(2)})">${sheetContent(data, labels, lang, AW, AH)}`;
        if (cut) s += `<rect x="1" y="1" width="${(AW - 2).toFixed(2)}" height="${(AH - 2).toFixed(2)}" fill="none" stroke="#8E94AB" stroke-width="2" stroke-dasharray="9 7"/>`;
        return `${s}</g></svg>`;
    }

    const pageCm = (svg) => { const mt = /data-page-cm="([\d.]+) ([\d.]+)"/.exec(svg); return mt ? [Number(mt[1]), Number(mt[2])] : [42, 29.7]; };

    function svgToCanvas(svg, widthPx) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
                const ratio = vb ? Number(vb[2]) / Number(vb[1]) : 1131 / 1600;
                const canvas = document.createElement('canvas');
                canvas.width = widthPx;
                canvas.height = Math.round(widthPx * ratio);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas);
            };
            img.onerror = () => reject(new Error('svg render failed'));
            // data: (no blob:) porque la política de seguridad del sistema solo deja cargar imágenes propias y data:
            img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        });
    }
    const canvasToBlob = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality));
    // píxeles del archivo según lo ancha que sea la hoja (unos 210 puntos por pulgada, sin pasar de lo que un navegador pinta con comodidad)
    const pxFor = (svg) => clamp(Math.round(pageCm(svg)[0] * 83.5), 900, 6500);

    // Un PDF de una sola página (del tamaño de la hoja) con la imagen JPEG ocupando toda la hoja.
    function jpegToPdf(jpeg, pxW, pxH, pageWpt = 1190.55, pageHpt = 841.89) {
        const pageW = Math.round(pageWpt * 100) / 100;
        const pageH = Math.round(pageHpt * 100) / 100;
        const enc = new TextEncoder();
        const parts = [];
        const offsets = [];
        let pos = 0;
        const push = (data) => { const b = typeof data === 'string' ? enc.encode(data) : data; parts.push(b); pos += b.length; };
        push('%PDF-1.4\n');
        offsets[1] = pos; push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
        offsets[2] = pos; push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
        offsets[3] = pos; push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
        offsets[4] = pos; push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
        push(jpeg); push('\nendstream\nendobj\n');
        const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
        offsets[5] = pos; push(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
        const xrefPos = pos;
        let xref = 'xref\n0 6\n0000000000 65535 f \n';
        for (let i = 1; i <= 5; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
        push(`${xref}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
        return new Blob(parts, { type: 'application/pdf' });
    }

    async function renderPng(svg) {
        const canvas = await svgToCanvas(svg, pxFor(svg));
        return canvasToBlob(canvas, 'image/png');
    }
    async function renderPdf(svg) {
        const canvas = await svgToCanvas(svg, pxFor(svg));
        const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.93)).arrayBuffer());
        const [wCm, hCm] = pageCm(svg);
        return jpegToPdf(jpeg, canvas.width, canvas.height, (wCm / 2.54) * 72, (hCm / 2.54) * 72);
    }
    function saveBlob(blob, filename) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    }

    window.LayoutSheet = { buildSheetSvg, renderPng, renderPdf, saveBlob, jpegToPdf, pageFor, PRESETS, PAGES, LIMITS, PX_CM, qrPath, svgToCanvas, canvasToBlob, pageCm, clamp };
}());
