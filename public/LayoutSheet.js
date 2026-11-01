// ---------------------------------------------------------------------------
// La hoja que se descarga del Layout: nombre del cliente, mapa, KPIs, QR, versión y fecha. Se arma como un SVG (A3 horizontal), y de ahí salen el PNG
// (se pinta en un canvas) y el PDF (la misma imagen dentro de una página A3, sin librerías: un PDF de una sola imagen se escribe a mano). Todo ocurre
// en el navegador con lo ÚLTIMO GUARDADO que trae GET /api/business/layout/qr, así que la hoja trae lo mismo que se ve al escanear el QR.
// ---------------------------------------------------------------------------
(function () {
    const W = 1600;
    const H = 1131; // proporción A3 (1.414)
    const FONT = 'Poppins, Arial, Helvetica, sans-serif';
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmt = (n, lang) => (Number.isFinite(n) ? n : 0).toLocaleString(lang === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 2 });

    // Módulos del QR (rows = filas de '0'/'1') como un solo trazo, con su zona blanca alrededor.
    function qrPath(rows, x, y, size, ink = '#14161F') {
        const n = rows.length;
        const unit = size / (n + 8);
        let d = '';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
            if (rows[r][c] === '1') d += `M${(x + (c + 4) * unit).toFixed(2)} ${(y + (r + 4) * unit).toFixed(2)}h${unit.toFixed(2)}v${unit.toFixed(2)}h-${unit.toFixed(2)}z`;
        }
        return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#FFFFFF" stroke="${ink}" stroke-width="3" rx="8"/><path d="${d}" fill="#14161F"/>`;
    }

    // data: { companyName, version, updatedAt (Date), printedAt (Date), url, qrRows, kpis, layout }, labels: textos ya traducidos, lang: 'es' | 'en'
    function buildSheetSvg(data, labels, lang) {
        const k = data.kpis;
        // tema de color: el del cliente si trae color; si no, el neutro de siempre
        const th = data.theme || window.LayoutMapSvg.DEFAULT_THEME;
        const C = th.chrome;
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
        const cards = [
            [`${fmt(k.total, lang)} m²`, labels.kpiTotal], [`${fmt(k.offices, lang)} m²`, labels.kpiOffices], [`${fmt(k.aisles, lang)} m²`, labels.kpiAisles],
            [`${fmt(k.docks, lang)} m²`, labels.kpiDocks], [`${fmt(k.storage, lang)} m²`, labels.kpiStorage], [`${fmt(k.dead, lang)} m²`, labels.kpiDead], [`${fmt(k.volume, lang)} m³`, labels.kpiVolume],
        ];
        let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">`;
        s += `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
        s += `<rect x="48" y="48" width="84" height="84" rx="18" fill="${C.badge}"/><text x="90" y="104" font-size="36" font-weight="700" fill="#FFFFFF" text-anchor="middle">${esc(initials)}</text>`;
        s += `<text x="152" y="86" font-size="36" font-weight="700" fill="${C.ink}">${esc(data.companyName)}</text><text x="152" y="118" font-size="21" fill="#3F435D">${esc(labels.area)}</text>`;
        s += `<text x="48" y="205" font-size="58" font-weight="700" fill="${C.ink}">${esc(labels.title)}</text><text x="48" y="243" font-size="23" fill="#3F435D">${esc(meta)}</text>`;
        s += qrPath(data.qrRows, W - 48 - 230, 40, 230, C.ink);
        // El aviso del QR va abajo, junto al código: arriba se encimaba con los nombres largos de empresa.
        s += `<text x="${W - 48 - 250}" y="186" font-size="23" font-weight="700" fill="${C.ink}" text-anchor="end">${esc(labels.scan)}</text>`;
        s += `<text x="${W - 48 - 250}" y="218" font-size="19" fill="#3F435D" text-anchor="end">${esc(labels.fixed)}</text>`;
        s += `<text x="${W - 48}" y="292" font-size="14" font-family="Consolas, Menlo, monospace" fill="#6B7089" text-anchor="end">${esc(data.url)}</text>`;
        s += `<line x1="48" y1="306" x2="${W - 48}" y2="306" stroke="${C.rule}" stroke-width="3"/>`;
        // mapa
        s += `<rect x="48" y="326" width="1082" height="646" rx="10" fill="#FFFFFF" stroke="${C.frame}" stroke-width="2"/>`;
        s += `<svg x="58" y="336" width="1062" height="626" viewBox="0 0 700 460" preserveAspectRatio="xMidYMid meet">${data.mapInner}</svg>`;
        // KPIs
        cards.forEach((c, i) => {
            const y = 326 + i * 94;
            s += `<rect x="1158" y="${y}" width="394" height="82" rx="10" fill="${C.cardBg}" stroke="${C.cardBorder}" stroke-width="2"/>`;
            s += `<text x="1180" y="${y + 41}" font-size="32" font-weight="700" fill="${C.cardInk}">${esc(c[0])}</text><text x="1180" y="${y + 68}" font-size="17" fill="#3F435D">${esc(c[1])}</text>`;
        });
        // leyenda
        // leyenda: todos los tipos de zona, en dos renglones, con los mismos colores del mapa
        const leg = [['door', labels.door], ['space', labels.space], ['dry', labels.dry], ['cold', labels.cold], ['chemical', labels.chemical], ['finished', labels.finished],
            ['dock', labels.dock], ['office', labels.office], ['aisle', labels.aisle], ['aisle2', labels.aisle2], ['none', labels.none]];
        let lx = 48;
        let ly = 976;
        leg.forEach(([key, text], i) => {
            if (i === 6) { lx = 48; ly = 1004; }
            let paint;
            if (key === 'door') paint = 'fill="#1E7E34" stroke="#1E7E34"';
            else if (key === 'space') paint = `fill="#FFFFFF" stroke="${C.line}"`;
            else { const c = th.types[key]; paint = `fill="${c[0]}" stroke="${c[1]}"${c[2] ? ` stroke-dasharray="${c[2]}"` : ''}`; }
            s += `<rect x="${lx}" y="${ly}" width="20" height="20" rx="4" ${paint} stroke-width="1.5"/><text x="${lx + 30}" y="${ly + 16}" font-size="16" fill="#3F435D">${esc(text)}</text>`;
            lx += 30 + text.length * 8.6 + 26;
        });
        s += `<line x1="48" y1="1040" x2="${W - 48}" y2="1040" stroke="${C.cardBorder}" stroke-width="2"/>`;
        s += `<text x="48" y="1074" font-size="19" fill="#3F435D">${esc(labels.printed)} <tspan font-weight="700" fill="${C.ink}">${esc(dateFmt(data.printedAt))}</tspan>. ${esc(labels.snapshot)}</text>`;
        s += `<text x="48" y="1104" font-size="17" fill="#6B7089">${esc(labels.updated)} ${esc(dateFmt(data.updatedAt))} (UTC ${utc(data.updatedAt)})</text>`;
        s += `<text x="${W - 48}" y="1090" font-size="34" font-weight="700" fill="${C.ink}" text-anchor="end">${esc(labels.version)} ${data.version}</text>`;
        return `${s}</svg>`;
    }

    function svgToCanvas(svg, widthPx) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = widthPx;
                canvas.height = Math.round((widthPx * H) / W);
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

    // Un PDF de una sola página (A3 horizontal) con la imagen JPEG ocupando toda la hoja.
    function jpegToPdf(jpeg, pxW, pxH) {
        const pageW = 1190.55;
        const pageH = 841.89;
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
        const canvas = await svgToCanvas(svg, 3508);
        return canvasToBlob(canvas, 'image/png');
    }
    async function renderPdf(svg) {
        const canvas = await svgToCanvas(svg, 3508);
        const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.93)).arrayBuffer());
        return jpegToPdf(jpeg, canvas.width, canvas.height);
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

    window.LayoutSheet = { buildSheetSvg, renderPng, renderPdf, saveBlob, jpegToPdf };
}());
