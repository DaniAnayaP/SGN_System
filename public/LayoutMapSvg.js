// ---------------------------------------------------------------------------
// Croquis del Layout como un SVG autónomo (colores en línea, sin hojas de estilo): lo usan la vista pública del QR (LayoutPublico.html) y la hoja que se
// descarga (LayoutSheet.js), que se convierte a imagen y por eso no puede depender del CSS de la página. Solo dibuja lo que es público: paredes, zonas,
// anaqueles/gabetas/tarimas con su código y puertas (no las conexiones de luz ni las columnas).
// ---------------------------------------------------------------------------
(function () {
    const LC = window.LayoutCalc;
    const ZONE_COLORS = {
        dry: ['#E3ECF9', '#7C9CD6', ''], cold: ['#E3F6E8', '#4C9B64', ''], chemical: ['#FBF0DE', '#D9A441', ''], finished: ['#ECECF1', '#B7BAC9', ''],
        dock: ['#F5F6FA', '#B7BAC9', ''], office: ['#D2E1F6', '#7C9CD6', '3 2'], aisle: ['url(#lh-main)', '#6B7089', '4 3'], aisle2: ['url(#lh-between)', '#8E94AB', ''],
        // zona todavía sin tipo asignado
        none: ['#ECECF1', '#8E94AB', '3 3'],
    };
    // Tema de color. Sin color de cliente es el de siempre (neutro, con el negro de la hoja); con color del cliente, los marcos, el título, las tarjetas, la nave y los pasillos van en
    // una escala de ese color (10 tonos, del más claro al más oscuro) y cada tipo de zona conserva su propio color para distinguirse a simple vista aunque se imprima; la zona seca
    // toma el tono claro del color del cliente.
    const DEFAULT_THEME = {
        custom: false, scale: [],
        chrome: { badge: '#14161F', ink: '#14161F', rule: '#14161F', cardBg: '#FFFFFF', cardBorder: '#C9CCDA', cardInk: '#14161F', frame: '#C9CCDA', nave: '#3F435D', line: '#6B7089' },
        types: ZONE_COLORS,
    };
    const LIGHTNESS = [97, 92, 84, 74, 63, 52, 42, 33, 24, 15];
    function hexToHsl(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255; const g = parseInt(hex.slice(3, 5), 16) / 255; const b = parseInt(hex.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2; const d = max - min;
        if (!d) return [0, 0, l * 100];
        const s = d / (1 - Math.abs(2 * l - 1));
        let h;
        if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
        return [(h * 60 + 360) % 360, s * 100, l * 100];
    }
    function hslToHex(h, s, l) {
        const sat = s / 100; const lig = l / 100;
        const c = (1 - Math.abs(2 * lig - 1)) * sat; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = lig - c / 2;
        const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
        const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
        return `#${to(r)}${to(g)}${to(b)}`;
    }
    function theme(seedColor) {
        if (!/^#[0-9a-fA-F]{6}$/.test(seedColor || '')) return DEFAULT_THEME;
        const [h, s0] = hexToHsl(seedColor);
        // un color casi gris (blanco, negro, gris) da una escala gris; cualquier otro conserva su tono con una saturación entre 30 y 65
        const sat = s0 < 8 ? 0 : Math.max(30, Math.min(65, s0));
        const sc = LIGHTNESS.map((l) => hslToHex(h, sat, l));
        return {
            custom: true, scale: sc,
            chrome: { badge: sc[7], ink: sc[9], rule: sc[7], cardBg: sc[0], cardBorder: sc[2], cardInk: sc[8], frame: sc[2], nave: sc[8], line: sc[6] },
            types: {
                dry: [sc[1], sc[5], ''], cold: ['#D5EFEC', '#2E8F85', ''], chemical: ['#FBE8C8', '#C58A1B', ''], finished: ['#F8DCE6', '#C0507A', ''],
                dock: ['#E3E6F6', '#5A64B4', ''], office: ['#DCE8F8', '#4A7BC2', '3 2'], aisle: ['url(#lh-main)', sc[6], '4 3'], aisle2: ['url(#lh-between)', sc[6], ''], none: ['#ECECF1', '#8E94AB', '3 3'],
            },
        };
    }
    // ---- formato propio de una zona (como Formato de celdas de Excel) -----------------------------------------------------------------
    // fmt = { fill, pattern, pcolor, line, bcolor }: color de fondo, rayas o patrón (y su color) y estilo y color del borde.
    const LINE_STYLES = { none: { w: 0 }, thin: { w: 1.2 }, mid: { w: 2.4 }, thick: { w: 4 }, dash: { w: 2, d: '8 5' }, dot: { w: 2.4, d: '1.5 4', round: true }, dashdot: { w: 2, d: '9 4 2 4' }, double: { w: 4, double: true } };
    function patternDef(id, fill, pattern, color) {
        let inner = `<rect width="8" height="8" fill="${fill}"/>`;
        let transform = '';
        if (pattern === 'diag1') { transform = ' patternTransform="rotate(45)"'; inner += `<line x1="0" y1="0" x2="0" y2="8" stroke="${color}" stroke-width="2.2"/>`; }
        if (pattern === 'diag2') { transform = ' patternTransform="rotate(-45)"'; inner += `<line x1="0" y1="0" x2="0" y2="8" stroke="${color}" stroke-width="2.2"/>`; }
        if (pattern === 'horiz') inner += `<line x1="0" y1="4" x2="8" y2="4" stroke="${color}" stroke-width="2"/>`;
        if (pattern === 'vert') inner += `<line x1="4" y1="0" x2="4" y2="8" stroke="${color}" stroke-width="2"/>`;
        if (pattern === 'grid') inner += `<line x1="0" y1="4" x2="8" y2="4" stroke="${color}" stroke-width="1.4"/><line x1="4" y1="0" x2="4" y2="8" stroke="${color}" stroke-width="1.4"/>`;
        if (pattern === 'dots') inner += `<circle cx="4" cy="4" r="1.5" fill="${color}"/>`;
        if (pattern === 'cross') { transform = ' patternTransform="rotate(45)"'; inner += `<line x1="0" y1="0" x2="0" y2="8" stroke="${color}" stroke-width="1.6"/><line x1="0" y1="4" x2="8" y2="4" stroke="${color}" stroke-width="1.6"/>`; }
        return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"${transform}>${inner}</pattern>`;
    }
    // Pinta una figura (puntos "x,y x,y ...") con ese formato: relleno (o patrón) y borde. id = identificador único del patrón dentro del SVG.
    function zonePaint(id, fmt) {
        let defs = '';
        let fill;
        if (fmt.pattern === 'none') fill = 'none';
        else if (fmt.pattern === 'solid') fill = fmt.fill;
        else { defs = patternDef(id, fmt.fill, fmt.pattern, fmt.pcolor); fill = `url(#${id})`; }
        const L = LINE_STYLES[fmt.line] || LINE_STYLES.thin;
        function border(points) {
            if (!L.w) return '';
            if (L.double) return `<polygon points="${points}" fill="none" stroke="${fmt.bcolor}" stroke-width="${L.w}" stroke-linejoin="round"/><polygon points="${points}" fill="none" stroke="#FFFFFF" stroke-width="1.4" stroke-linejoin="round"/>`;
            return `<polygon points="${points}" fill="none" stroke="${fmt.bcolor}" stroke-width="${L.w}"${L.d ? ` stroke-dasharray="${L.d}"` : ''} stroke-linecap="${L.round ? 'round' : 'butt'}" stroke-linejoin="round"/>`;
        }
        function markup(points) {
            return `${defs ? `<defs>${defs}</defs>` : ''}<polygon points="${points}" fill="${fill}"${fill === 'none' ? ' stroke="none"' : ''}/>${border(points)}`;
        }
        return { fill, defs, border, markup };
    }
    // El formato con el que se ve hoy una zona de ese tipo (para empezar a editarlo desde ahí).
    function defaultFmt(type, T = DEFAULT_THEME) {
        const c = (type && T.types[type]) || T.types.none;
        const pattern = type === 'aisle' ? 'diag1' : type === 'aisle2' ? 'dots' : 'solid';
        const fill = String(c[0]).indexOf('url(') === 0 ? '#ffffff' : String(c[0]).toLowerCase();
        return { fill, pattern, pcolor: String(c[1]).toLowerCase(), line: c[2] ? 'dash' : 'thin', bcolor: String(c[1]).toLowerCase() };
    }
    const CATEGORY_ICON_PATHS = {
        shield: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z M9 12l2 2 4-4',
        pill: 'M8.5 15.5l7-7a3.5 3.5 0 0 0-5-5l-7 7a3.5 3.5 0 0 0 5 5z M9 9l6 6',
        flask: 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3 M8 14h8',
        drop: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
        alert: 'M12 4l9 16H3z M12 10v4 M12 17h.01',
        box: 'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10',
        paper: 'M7 3h7l4 4v14H7z M14 3v4h4 M9 12h6 M9 16h6',
        bottle: 'M10 3h4v3l2 3v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3z M8 13h8',
        cross: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
        tag: 'M3 12l9-9h7v7l-9 9z M15 7h.01',
    };
    // El icono como trazos listos para poner dentro de un <g> o un <svg viewBox="0 0 24 24">.
    const categoryGlyph = (name, stroke = 'currentColor', width = 1.9) => `<g fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${(CATEGORY_ICON_PATHS[name] || CATEGORY_ICON_PATHS.tag).split(' M').map((d, i) => `<path d="${i ? 'M' : ''}${d}"/>`).join('')}</g>`;
    const FONT = 'Poppins, Arial, Helvetica, sans-serif';
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmt = (n) => (Number.isFinite(n) ? n : 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });

    function mapSvg(layout, options = {}) {
        const T = options.theme || DEFAULT_THEME;
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
        // Pasillos sombreados con rayas (principal: rayas; entre anaqueles: puntos).
        s += `<defs><pattern id="lh-main" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#FFFFFF"/><line x1="0" y1="0" x2="0" y2="8" stroke="${T.chrome.line}" stroke-width="2.4" opacity="0.45"/></pattern><pattern id="lh-between" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#F5F6FA"/><circle cx="3" cy="3" r="1.15" fill="${T.chrome.line}" opacity="0.55"/></pattern></defs>`;
        // El nombre y los m² de cada zona van al final (encima de anaqueles y paredes), con un contorno blanco, y en la esquina que no tape ningún espacio.
        const halo = 'stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round" paint-order="stroke"';
        let zoneLabels = '';
        (layout.zones || []).forEach((z) => {
            const c = z.type ? (T.types[z.type] || T.types.dock) : T.types.none;
            const style = `fill="${c[0]}" stroke="${c[1]}" stroke-width="1.2"${c[2] ? ` stroke-dasharray="${c[2]}"` : ''}`;
            if (LC.hasPoints(z)) {
                // Zona de cualquier forma: se dibuja con sus esquinas y el nombre va en el punto más holgado de adentro.
                s += z.fmt ? zonePaint(`zf-${z.id}`, z.fmt).markup(z.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')) : `<polygon points="${z.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" stroke-linejoin="round" ${style}/>`;
                const a = LC.zoneLabelAnchor(z);
                zoneLabels += `<text x="${X(a.x)}" y="${Y(a.y) - 1}" font-size="10" font-weight="600" fill="#14161F" text-anchor="middle" ${halo}>${esc(z.name)}</text>`;
                zoneLabels += `<text x="${X(a.x)}" y="${Y(a.y) + 10}" font-size="8.5" fill="#6B7089" text-anchor="middle" ${halo}>${fmt(LC.zoneArea(z))} m²</text>`;
            } else {
                s += z.fmt ? zonePaint(`zf-${z.id}`, z.fmt).markup(LC.zonePoints(z).map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')) : `<rect x="${X(z.x)}" y="${Y(z.y)}" width="${z.l * sc}" height="${z.w * sc}" rx="4" ${style}/>`;
                const spot = LC.zoneLabelSpot(z, layout.spaces || [], sc);
                const tx = spot.right ? X(z.x + z.l) - 5 : X(z.x) + 5;
                const ty = spot.bottom ? Y(z.y + z.w) - (z.w * sc > 26 ? 17 : 5) : Y(z.y) + 12;
                const anchor = spot.right ? 'end' : 'start';
                zoneLabels += `<text x="${tx}" y="${ty}" font-size="10" font-weight="600" fill="#14161F" text-anchor="${anchor}" ${halo}>${esc(z.name)}</text>`;
                if (z.w * sc > 26) zoneLabels += `<text x="${tx}" y="${ty + 11}" font-size="8.5" fill="#6B7089" text-anchor="${anchor}" ${halo}>${fmt(z.l * z.w)} m²</text>`;
            }
        });
        // La medida real de cada lado va escrita: afuera en las paredes de la nave y adentro en cada zona (solo si el lado se ve de largo suficiente).
        let measureLabels = '';
        const measure = (pts, outward, minPx) => {
            LC.sideMeasures(pts, outward).forEach((m) => {
                if (m.len * sc < minPx) return;
                if (!outward && LC.onPolygonEdge(m.mx, m.my, layout.vertices)) return;
                const off = outward ? 11 : 8;
                measureLabels += `<text x="${(X(m.mx) + m.nx * off).toFixed(1)}" y="${(Y(m.my) + m.ny * off + 2.5).toFixed(1)}" font-size="7.5" font-weight="600" fill="#C0392B" text-anchor="middle" ${halo}>${fmt(m.len)}</text>`;
            });
        };
        if (options.measures !== false) {
            measure(layout.vertices, true, 24);
            (layout.zones || []).forEach((z) => { if (Math.min(z.l, z.w) * sc >= 44) measure(LC.zonePoints(z), false, 30); });
        }
        s += `<polygon points="${layout.vertices.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="none" stroke="${T.chrome.nave}" stroke-width="3" stroke-linejoin="round"/>`;
        (layout.spaces || []).forEach((sp) => {
            const w = Math.max(sp.l * sc, 4);
            const h = Math.max(sp.d * sc, 4);
            s += `<rect x="${X(sp.x)}" y="${Y(sp.y)}" width="${w}" height="${h}" rx="2" fill="#FFFFFF" stroke="${T.chrome.line}" stroke-width="1"/>`;
            if (w >= 26 && h >= 9) s += `<text x="${X(sp.x) + w / 2}" y="${Y(sp.y) + h / 2 + 3}" font-size="7.5" font-weight="600" fill="${T.chrome.cardInk}" text-anchor="middle">${esc(sp.code)}</text>`;
        });
        s += zoneLabels + measureLabels;
        (layout.doors || []).forEach((d) => {
            const w = LC.wallSegment(layout.vertices, d.wall);
            const ax = w.p[0] + w.ux * d.dist;
            const ay = w.p[1] + w.uy * d.dist;
            s += `<line x1="${X(ax)}" y1="${Y(ay)}" x2="${X(ax + w.ux * d.width)}" y2="${Y(ay + w.uy * d.width)}" stroke="#1E7E34" stroke-width="7"/>`;
        });
        const bar = 5 * sc;
        s += `<line x1="${M}" y1="${H - 12}" x2="${M + bar}" y2="${H - 12}" stroke="${T.chrome.nave}" stroke-width="2"/><text x="${M + bar + 6}" y="${H - 8}" font-size="8.5" fill="#6B7089">5 m</text>`;
        return `${s}</svg>`;
    }

    window.LayoutMapSvg = { mapSvg, theme, DEFAULT_THEME, zonePaint, defaultFmt, CATEGORY_ICON_PATHS, categoryGlyph };
}());
