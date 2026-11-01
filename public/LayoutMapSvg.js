// ---------------------------------------------------------------------------
// Croquis del Layout como un SVG autónomo (colores en línea, sin hojas de estilo): lo usan la vista pública del QR (LayoutPublico.html) y la hoja que se
// descarga (LayoutSheet.js), que se convierte a imagen y por eso no puede depender del CSS de la página. Solo dibuja lo que es público: paredes, zonas,
// anaqueles/gabetas/tarimas con su código y puertas (no las conexiones de luz ni las columnas).
// ---------------------------------------------------------------------------
(function () {
    const LC = window.LayoutCalc;
    const ZONE_COLORS = {
        dry: ['#E3ECF9', '#7C9CD6', ''], cold: ['#E3F6E8', '#4C9B64', ''], chemical: ['#FBF0DE', '#D9A441', ''], finished: ['#ECECF1', '#B7BAC9', ''],
        dock: ['#F5F6FA', '#B7BAC9', ''], office: ['#D2E1F6', '#7C9CD6', '3 2'], aisle: ['#FFFFFF', '#C9CCDA', '4 3'],
    };
    const FONT = 'Poppins, Arial, Helvetica, sans-serif';
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmt = (n) => (Number.isFinite(n) ? n : 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });

    function mapSvg(layout, options = {}) {
        const W = options.width || 700;
        const H = options.height || 460;
        const M = 34;
        const xs = layout.vertices.map((p) => p[0]);
        const ys = layout.vertices.map((p) => p[1]);
        const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
        const spanX = Math.max(x1 - x0, 1);
        const spanY = Math.max(y1 - y0, 1);
        const sc = Math.min((W - 2 * M) / spanX, (H - 2 * M - 14) / spanY);
        const ox = M + ((W - 2 * M) - spanX * sc) / 2;
        const X = (x) => ox + (x - x0) * sc;
        const Y = (y) => M + (y - y0) * sc;
        let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Layout">`;
        (layout.zones || []).forEach((z) => {
            const c = ZONE_COLORS[z.type] || ZONE_COLORS.dock;
            s += `<rect x="${X(z.x)}" y="${Y(z.y)}" width="${z.l * sc}" height="${z.w * sc}" rx="4" fill="${c[0]}" stroke="${c[1]}" stroke-width="1.2"${c[2] ? ` stroke-dasharray="${c[2]}"` : ''}/>`;
            s += `<text x="${X(z.x) + 5}" y="${Y(z.y) + 12}" font-size="10" font-weight="600" fill="#14161F">${esc(z.name)}</text>`;
            if (z.w * sc > 26) s += `<text x="${X(z.x) + 5}" y="${Y(z.y) + 23}" font-size="8.5" fill="#6B7089">${fmt(z.l * z.w)} m²</text>`;
        });
        s += `<polygon points="${layout.vertices.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="none" stroke="#3F435D" stroke-width="3" stroke-linejoin="round"/>`;
        (layout.spaces || []).forEach((sp) => {
            const w = Math.max(sp.l * sc, 4);
            const h = Math.max(sp.d * sc, 4);
            s += `<rect x="${X(sp.x)}" y="${Y(sp.y)}" width="${w}" height="${h}" rx="2" fill="#FFFFFF" stroke="#6B7089" stroke-width="1"/>`;
            if (w >= 26 && h >= 9) s += `<text x="${X(sp.x) + w / 2}" y="${Y(sp.y) + h / 2 + 3}" font-size="7.5" font-weight="600" fill="#3F435D" text-anchor="middle">${esc(sp.code)}</text>`;
        });
        (layout.doors || []).forEach((d) => {
            const w = LC.wallSegment(layout.vertices, d.wall);
            const ax = w.p[0] + w.ux * d.dist;
            const ay = w.p[1] + w.uy * d.dist;
            s += `<line x1="${X(ax)}" y1="${Y(ay)}" x2="${X(ax + w.ux * d.width)}" y2="${Y(ay + w.uy * d.width)}" stroke="#1E7E34" stroke-width="7"/>`;
        });
        const bar = 5 * sc;
        s += `<line x1="${M}" y1="${H - 12}" x2="${M + bar}" y2="${H - 12}" stroke="#3F435D" stroke-width="2"/><text x="${M + bar + 6}" y="${H - 8}" font-size="8.5" fill="#6B7089">5 m</text>`;
        return `${s}</svg>`;
    }

    window.LayoutMapSvg = { mapSvg };
}());
