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
    // El formato con el que se ve hoy una huella (blanca con borde gris), para empezar a editarlo desde ahí.
    function defaultSpaceFmt() { return { fill: '#ffffff', pattern: 'solid', pcolor: '#6b7089', line: 'thin', bcolor: '#6b7089' }; }
    // El formato con el que se ve hoy un activo sin color propio (arena, distinto del blanco de su huella).
    function defaultAssetFmt() { return { fill: '#f4e1b8', pattern: 'solid', pcolor: '#9a7b3c', line: 'thin', bcolor: '#9a7b3c' }; }
    // Color de la letra que se lee sobre ese relleno: blanca si es oscuro, casi negra si es claro; vacío si el relleno es transparente (se queda con el color de siempre).
    function inkFor(fmt) {
        if (!fmt || fmt.pattern === 'none' || !/^#[0-9a-fA-F]{6}$/.test(fmt.fill || '')) return '';
        const lin = (i) => { const c = parseInt(fmt.fill.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5) < 0.4 ? '#FFFFFF' : '#1F2433';
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
        // solo para las tarjetas de QR de Temperaturas y Limpieza (no están en la lista de iconos de las categorías)
        thermometer: 'M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z M11.5 9v8',
        cart: 'M3 4h2l2.4 11h10.2l2-8H6.2 M9.5 20h.01 M17 20h.01',
        sparkle: 'M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z M18 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
    };
    // El icono como trazos listos para poner dentro de un <g> o un <svg viewBox="0 0 24 24">.
    const categoryGlyph = (name, stroke = 'currentColor', width = 1.9) => `<g fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${(CATEGORY_ICON_PATHS[name] || CATEGORY_ICON_PATHS.tag).split(' M').map((d, i) => `<path d="${i ? 'M' : ''}${d}"/>`).join('')}</g>`;
    // El azul del contorno de la nave (distinto del tono de las paredes en cualquier tema de color).
    const CONTOUR_COLOR = '#4B7BE5';
    const FONT = 'Poppins, Arial, Helvetica, sans-serif';
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmt = (n) => (Number.isFinite(n) ? n : 0).toLocaleString('es-MX', { maximumFractionDigits: 2 });

    // ---- Seguridad (paso Seguridad) ------------------------------------------------------------------------------------------------------------
    // Un símbolo chico por tipo (extintor, hidrante, puerta de emergencia, botiquín, alarma o pulsador, regadera y lavaojos, punto de reunión), cada uno con su color, y la ruta de evacuación como una línea punteada con flecha.
    // Todo va con atributos (sin CSS) para que se vea igual en el editor, en la vista pública y en la hoja que se descarga. (x, y) = el centro del símbolo en píxeles del dibujo; r = su tamaño (la mitad del lado).
    const SAFETY_OUTLINE = { extinguisher: '#7a1f17', hydrant: '#7a1f17', emergency_door: '#14602f', firstaid: '#14602f', alarm: '#8a4a0c', eyewash: '#134a80', assembly: '#14602f', route: '#14602f' };
    function safetyGlyph(type, x, y, r, model) {
        const color = (LC.SAFETY_COLORS || {})[type] || '#d9443a';
        const line = SAFETY_OUTLINE[type] || '#7a1f17';
        const k = (v) => Math.round(v * 100) / 100;
        const P = (dx, dy) => `${k(x + dx * r)} ${k(y + dy * r)}`;
        const letter = (txt, dy, size) => `<text x="${k(x)}" y="${k(y + dy * r)}" font-size="${k(size * r)}" font-weight="700" fill="#FFFFFF" text-anchor="middle">${txt}</text>`;
        const square = `<rect x="${k(x - r)}" y="${k(y - r)}" width="${k(2 * r)}" height="${k(2 * r)}" rx="${k(r * 0.3)}" fill="${color}" stroke="${line}" stroke-width="0.9"/>`;
        const disc = `<circle cx="${k(x)}" cy="${k(y)}" r="${k(r)}" fill="${color}" stroke="${line}" stroke-width="0.9"/>`;
        const stroke = `fill="none" stroke="#FFFFFF" stroke-width="${k(Math.max(1.2, r * 0.24))}" stroke-linecap="round" stroke-linejoin="round"`;
        if (type === 'hydrant') {
            // un símbolo por modelo: columna = H, poste doble = una T, toma siamesa = una Y, gabinete = cuadro rojo con su ventana y la manguera enrollada
            if (model === 'double_post') return `${disc}<path d="M${P(-0.62, -0.4)} H${P(0.62, -0.4).split(' ')[0]} M${P(0, -0.4)} V${P(0, 0.68).split(' ')[1]}" ${stroke}/>`;
            if (model === 'siamese') return `${disc}<path d="M${P(-0.55, -0.58)} L${P(0, 0.02)} L${P(0.55, -0.58)} M${P(0, 0.02)} V${P(0, 0.7).split(' ')[1]}" ${stroke}/>`;
            if (model === 'cabinet') return `${square}<rect x="${k(x - r * 0.58)}" y="${k(y - r * 0.64)}" width="${k(r * 1.16)}" height="${k(r * 1.28)}" rx="${k(r * 0.12)}" fill="none" stroke="#FFFFFF" stroke-width="${k(Math.max(1, r * 0.2))}"/><circle cx="${k(x)}" cy="${k(y + r * 0.08)}" r="${k(r * 0.27)}" fill="#FFFFFF"/>`;
            return `${disc}${letter('H', 0.4, 1.15)}`;
        }
        if (type === 'emergency_door') return `${square}<path d="M${P(-0.55, 0)} H${P(0.5, 0).split(' ')[0]} M${P(0.05, -0.45)} L${P(0.5, 0)} L${P(0.05, 0.45)}" ${stroke}/>`;
        if (type === 'firstaid') return `${square}<path d="M${P(0, -0.6)} V${P(0, 0.6).split(' ')[1]} M${P(-0.6, 0)} H${P(0.6, 0).split(' ')[0]}" ${stroke}/>`;
        if (type === 'alarm') return `<path d="M${P(0, -1.15)} L${P(1.15, 0.9)} L${P(-1.15, 0.9)} Z" fill="${color}" stroke="${line}" stroke-width="0.9" stroke-linejoin="round"/>${letter('!', 0.74, 1.0)}`;
        if (type === 'eyewash') return `${disc}<path d="M${P(0, -0.6)} C${P(0.55, 0.05)} ${P(0.55, 0.55)} ${P(0, 0.55)} C${P(-0.55, 0.55)} ${P(-0.55, 0.05)} ${P(0, -0.6)} Z" fill="#FFFFFF"/>`;
        if (type === 'assembly') return `${disc}<circle cx="${k(x)}" cy="${k(y)}" r="${k(r * 0.55)}" fill="none" stroke="#FFFFFF" stroke-width="${k(Math.max(1, r * 0.2))}" stroke-dasharray="${k(r * 0.5)} ${k(r * 0.35)}"/>`;
        return `${square}${letter('E', 0.4, 1.2)}`; // extintor
    }
    // La ruta de evacuación: una línea punteada con la punta de flecha en el punto de llegada. w = grosor de la línea, en píxeles.
    function safetyRoute(x1, y1, x2, y2, w) {
        const color = (LC.SAFETY_COLORS || {}).route || '#2e9e5b';
        const k = (v) => Math.round(v * 100) / 100;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const head = Math.min(Math.max(5, w * 3.2), len);
        const bx = x2 - ux * head;
        const by = y2 - uy * head;
        const hw = head * 0.5;
        return `<line x1="${k(x1)}" y1="${k(y1)}" x2="${k(bx)}" y2="${k(by)}" stroke="${color}" stroke-width="${k(w)}" stroke-dasharray="${k(w * 3.2)} ${k(w * 1.8)}" stroke-linecap="round"/><polygon points="${k(x2)},${k(y2)} ${k(bx - uy * hw)},${k(by + ux * hw)} ${k(bx + uy * hw)},${k(by - ux * hw)}" fill="${color}"/>`;
    }
    // El código de un elemento, en letra chica con un contorno blanco para que se lea encima de zonas y huellas.
    function safetyLabel(x, y, txt, anchor, color) {
        const a = `x="${Math.round(x * 100) / 100}" y="${Math.round(y * 100) / 100}" font-size="7.5" font-weight="700" text-anchor="${anchor || 'middle'}"`;
        return `<text class="lt-safety" ${a} fill="#FFFFFF" stroke="#FFFFFF" stroke-width="3" stroke-linejoin="round">${esc(txt)}</text><text class="lt-safety" ${a} fill="${color || '#2A1B30'}">${esc(txt)}</text>`;
    }

    function mapSvg(layout, options = {}) {
        // options.rotation = cuartos de vuelta a la derecha (0 a 3): el croquis sale girado; los textos siguen derechos.
        const layoutNoTurn = layout; // la marca de una pared con dos alturas se calcula sobre el Layout sin girar (wallMark) y se gira después
        if (options.rotation) layout = LC.rotateLayout(layout, options.rotation);
        const T = options.theme || DEFAULT_THEME;
        const W = options.width || 700;
        const H = options.height || 460;
        const M = 34;
        // options.layers = los pasos activos del croquis (contorno, puertas, luz, zonas, espacios); sin él se dibuja todo. options.measures = false quita las medidas y options.area = false los m² de cada zona y options.names = false los nombres de las zonas (los m², si se ven, quedan en su lugar).
        const on = (key) => !Array.isArray(options.layers) || options.layers.includes(key);
        // options.focus = lo que se está buscando (al escanear una categoría, una clasificación o un código): { zones: { idDeZona: color }, spaces: { idDeEspacio: color } }.
        // Esas zonas salen sombreadas con su color y esos anaqueles rellenos; todo lo demás se ve tenue. Sin focus el croquis se dibuja como siempre.
        const focus = options.focus && typeof options.focus === 'object' ? options.focus : null;
        const focusZones = (focus && focus.zones) || {};
        const focusSpaces = (focus && focus.spaces) || {};
        const hasFocusSpaces = Object.keys(focusSpaces).length > 0;
        const xs = layout.vertices.map((p) => p[0]);
        const ys = layout.vertices.map((p) => p[1]);
        const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
        const spanX = Math.max(x1 - x0, 1);
        const spanY = Math.max(y1 - y0, 1);
        const sc = Math.min((W - 2 * M) / spanX, (H - 2 * M - 14) / spanY);
        const ox = M + ((W - 2 * M) - spanX * sc) / 2;
        const X = (x) => ox + (x - x0) * sc;
        const Y = (y) => M + (y - y0) * sc;
        let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" text-rendering="geometricPrecision" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Layout">`;
        // Pasillos sombreados con rayas (principal: rayas; entre anaqueles: puntos).
        s += `<defs><pattern id="lh-main" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#FFFFFF"/><line x1="0" y1="0" x2="0" y2="8" stroke="${T.chrome.line}" stroke-width="2.4" opacity="0.45"/></pattern><pattern id="lh-between" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#F5F6FA"/><circle cx="3" cy="3" r="1.15" fill="${T.chrome.line}" opacity="0.55"/></pattern></defs>`;
        // El nombre y los m² de cada zona van al final (encima de anaqueles y paredes), con un contorno blanco, y en la esquina que no tape ningún espacio.
        // El contorno blanco va en una capa APARTE (un texto duplicado solo con trazo) y TODOS los contornos se dibujan antes que TODOS los textos: así ningún contorno puede borrar el
        // nombre de otra zona y no se depende de paint-order, que algunos navegadores de celular aplican mal a textos chicos.
        // El contorno son 8 copias del texto en blanco (LayoutCalc.HALO_STEPS, las mismas del editor): solo usan el relleno, que se pinta igual en todos los navegadores.
        const HALO_STEPS = LC.HALO_STEPS;
        const labelText = (x, y, size, weight, fill, anchor, text) => {
            const attrs = (dx, dy) => `x="${(Number(x) + dx).toFixed(1)}" y="${(Number(y) + dy).toFixed(1)}" font-size="${size}"${weight ? ` font-weight="${weight}"` : ''} text-anchor="${anchor}"`;
            return { halo: HALO_STEPS.map(([dx, dy]) => `<text ${attrs(dx, dy)} fill="#FFFFFF">${text}</text>`).join(''), main: `<text ${attrs(0, 0)} fill="${fill}">${text}</text>` };
        };
        let zoneLabels = '';
        let zoneHalos = '';
        // Recuadros (aprox.) que ocupan los nombres y los m² de las zonas: una medida de lado que caería encima se omite para que no tape el nombre (tenía un contorno blanco que lo borraba).
        const labelBoxes = [];
        const addBox = (x, baseline, text, size, anchor) => { labelBoxes.push(LC.labelBox(x, baseline, text, size, anchor)); };
        // las medidas de afuera de la nave también cuentan: un nombre que sobresale de la nave no debe quedar debajo de una
        if (options.measures !== false && on('contorno')) {
            LC.sideMeasures(layout.vertices, true).forEach((m) => {
                if (m.len * sc < 24) return;
                const w = String(fmt(m.len)).length * 4.4 + 2;
                const cx = X(m.mx) + m.nx * 11;
                const cy = Y(m.my) + m.ny * 11 + 2.5;
                labelBoxes.push([cx - w / 2, cy - 9, cx + w / 2, cy + 3]);
            });
        }
        const zonesAt = s.length; // desde aquí se dibujan las zonas; los pisos y las rampas se meten debajo (el orden de los pasos es el empalme)
        (on('zonas') ? (layout.zones || []) : []).forEach((z) => {
            const c = z.type ? (T.types[z.type] || T.types.dock) : T.types.none;
            const style = `fill="${c[0]}" stroke="${c[1]}" stroke-width="1.2"${c[2] ? ` stroke-dasharray="${c[2]}"` : ''}`;
            const shapeFrom = s.length;
            const labelsFrom = zoneLabels.length;
            const halosFrom = zoneHalos.length;
            const put = (x, y, size, weight, fill, anchor, text) => { const t = labelText(x, y, size, weight, fill, anchor, text); zoneHalos += t.halo; zoneLabels += t.main; };
            if (LC.hasPoints(z)) {
                // Zona de cualquier forma: se dibuja con sus esquinas y el nombre va en el punto más holgado de adentro.
                s += z.fmt ? zonePaint(`zf-${z.id}`, z.fmt).markup(z.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')) : `<polygon points="${z.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" stroke-linejoin="round" ${style}/>`;
                const a = LC.zoneLabelAnchor(z);
                const areaY = options.names === false ? Y(a.y) - 1 : Y(a.y) + 10;
                if (options.names !== false) { put(X(a.x), Y(a.y) - 1, 10, 600, '#14161F', 'middle', esc(z.name)); addBox(X(a.x), Y(a.y) - 1, z.name, 10, 'middle'); }
                if (options.area !== false) { put(X(a.x), areaY, 8.5, 0, '#6B7089', 'middle', `${fmt(LC.zoneArea(z))} m²`); addBox(X(a.x), areaY, `${fmt(LC.zoneArea(z))} m²`, 8.5, 'middle'); }
            } else {
                s += z.fmt ? zonePaint(`zf-${z.id}`, z.fmt).markup(LC.zonePoints(z).map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')) : `<rect x="${X(z.x)}" y="${Y(z.y)}" width="${z.l * sc}" height="${z.w * sc}" rx="4" ${style}/>`;
                const spot = LC.zoneLabelSpot(z, layout.spaces || [], sc);
                // si el nombre cae encima del de otra zona (zonas chicas o croquis chico) se corre a otra esquina, más abajo o afuera de la zona
                const place = LC.placeZoneLabel(z, spot, X, Y, sc, labelBoxes, options.area !== false ? `${fmt(z.l * z.w)} m²` : '', options.names === false);
                const { tx, ty, anchor } = place;
                if (options.names !== false) put(tx, ty, 10, 600, '#14161F', anchor, esc(z.name));
                if (place.withArea) put(tx, ty + 11, 8.5, 0, '#6B7089', anchor, `${fmt(z.l * z.w)} m²`);
                if (place.areaOnly) put(tx, ty, 8.5, 0, '#6B7089', anchor, `${fmt(z.l * z.w)} m²`);
                place.boxes.forEach((b) => labelBoxes.push(b));
            }
            if (focus) {
                if (focusZones[z.id]) {
                    // la zona buscada: se sombrea con su color encima de su relleno
                    const pts = (LC.hasPoints(z) ? z.pts : LC.zonePoints(z)).map((p) => `${X(p[0])},${Y(p[1])}`).join(' ');
                    s += `<polygon points="${pts}" fill="${esc(focusZones[z.id])}" fill-opacity="0.5" stroke="${esc(focusZones[z.id])}" stroke-width="3" stroke-linejoin="round"/>`;
                } else {
                    s = `${s.slice(0, shapeFrom)}<g opacity="0.28">${s.slice(shapeFrom)}</g>`;
                    zoneLabels = `${zoneLabels.slice(0, labelsFrom)}<g opacity="0.4">${zoneLabels.slice(labelsFrom)}</g>`;
                    zoneHalos = `${zoneHalos.slice(0, halosFrom)}<g opacity="0.4">${zoneHalos.slice(halosFrom)}</g>`;
                }
            }
        });
        // La medida real de cada lado va escrita: afuera en las paredes de la nave y adentro en cada zona (solo si el lado se ve de largo suficiente).
        let measureLabels = '';
        let measureHalos = '';
        const measure = (pts, outward, minPx) => {
            LC.sideMeasures(pts, outward).forEach((m) => {
                if (m.len * sc < minPx) return;
                if (!outward && LC.onPolygonEdge(m.mx, m.my, layout.vertices)) return;
                const off = outward ? 11 : 8;
                const cx = X(m.mx) + m.nx * off;
                const cy = Y(m.my) + m.ny * off + 2.5;
                // una medida de adentro que caería sobre el nombre o los m² de una zona se omite (el nombre manda)
                if (!outward) {
                    const w = String(fmt(m.len)).length * 4.4 + 2;
                    if (labelBoxes.some(([bx0, by0, bx1, by1]) => cx - w / 2 < bx1 && cx + w / 2 > bx0 && cy - 9 < by1 && cy + 3 > by0)) return;
                }
                const t = labelText(cx.toFixed(1), cy.toFixed(1), 7.5, 600, '#C0392B', 'middle', fmt(m.len));
                measureHalos += t.halo;
                measureLabels += t.main;
            });
        };
        if (options.measures !== false) {
            if (on('contorno')) measure(layout.vertices, true, 24);
            (on('zonas') ? (layout.zones || []) : []).forEach((z) => { if (Math.min(z.l, z.w) * sc >= 44) measure(LC.zonePoints(z), false, 30); });
        }
        // Niveles de piso (pasos Pisos y Rampas; en la vista pública, la capa «niveles»): cada piso más alto o más bajo que la nave lleva el color de su nivel (o su formato propio) con rayas y su nivel; una rampa, un degradado hacia su lado más alto
        // con una flecha y de qué nivel a cuál va. Los mismos del editor. Sin pisos ni rampas no se dibuja nada.
        const showFloors = on('pisos') || on('niveles');
        const showRamps = on('rampas') || on('niveles');
        if ((showFloors || showRamps) && LC.floorsAll) {
            const lvlCols = LC.floorLevelColors(layout);
            const colOf = (v) => lvlCols[Math.round(v * 100) / 100] || '#E9E9EE';
            const signed = (v) => `${v > 0 ? '+' : ''}${fmt(v)} m`;
            let lvlLayer = '';
            LC.floorsAll(layout).filter((f) => (f.isRamp ? showRamps : showFloors)).forEach((f) => {
                if (!LC.zoneHasLevel(f) || !(f.l > 0 && f.w > 0)) return;
                const bx0 = X(f.x); const bx1 = X(f.x + f.l); const by0 = Y(f.y); const by1 = Y(f.y + f.w);
                const quadPts = `${bx0.toFixed(1)},${by0.toFixed(1)} ${bx1.toFixed(1)},${by0.toFixed(1)} ${bx1.toFixed(1)},${by1.toFixed(1)} ${bx0.toFixed(1)},${by1.toFixed(1)}`;
                const lo = Number(f.lvl) || 0;
                const ramp = f.lvl2 !== undefined && LC.ZONE_RISES.includes(f.rise);
                const hi = ramp ? Number(f.lvl2) : lo;
                const endCols = (ramp && LC.rampEndColors && LC.rampEndColors(layout, f)) || { lo: colOf(lo), hi: colOf(hi) };
                const safeId = String(f.id).replace(/[^A-Za-z0-9_-]/g, '');
                let note = signed(lo);
                if (ramp) {
                    if (f.fmt) lvlLayer += zonePaint(`lf-${safeId}`, LC.floorFmtOf(layout, f)).markup(quadPts);
                    else {
                        const dir = { right: [0, 0, 1, 0], left: [1, 0, 0, 0], down: [0, 0, 0, 1], up: [0, 1, 0, 0] }[f.rise];
                        lvlLayer += `<linearGradient id="lvg-${safeId}" x1="${dir[0]}" y1="${dir[1]}" x2="${dir[2]}" y2="${dir[3]}"><stop offset="0" stop-color="${endCols.lo}"/><stop offset="1" stop-color="${endCols.hi}"/></linearGradient><rect x="${bx0.toFixed(1)}" y="${by0.toFixed(1)}" width="${(bx1 - bx0).toFixed(1)}" height="${(by1 - by0).toFixed(1)}" fill="url(#lvg-${safeId})" stroke="${LC.mixHex(colOf(hi), '#000000', 0.4)}" stroke-width="1.5" stroke-dasharray="5 3"/>`;
                    }
                    const cx = (bx0 + bx1) / 2; const cy = (by0 + by1) / 2;
                    const half = f.rise === 'left' || f.rise === 'right' ? (bx1 - bx0) / 3 : (by1 - by0) / 3;
                    const v = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] }[f.rise];
                    lvlLayer += `<defs><marker id="lvl-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#A63FB5"/></marker></defs><line x1="${(cx - v[0] * half).toFixed(1)}" y1="${(cy - v[1] * half).toFixed(1)}" x2="${(cx + v[0] * half).toFixed(1)}" y2="${(cy + v[1] * half).toFixed(1)}" stroke="#A63FB5" stroke-width="2.2" fill="none" marker-end="url(#lvl-arr)"/>`;
                    note = `${signed(lo)} → ${signed(hi)}`;
                } else lvlLayer += zonePaint(`lf-${safeId}`, LC.floorFmtOf(layout, f)).markup(quadPts);
                if (options.names !== false) {
                    const t = labelText(((bx0 + bx1) / 2).toFixed(1), (((by0 + by1) / 2) + (ramp ? 16 : 4)).toFixed(1), 9.5, 700, '#A63FB5', 'middle', esc(`${f.code || ''} ${note}`.trim()));
                    zoneHalos += t.halo;
                    zoneLabels += t.main;
                }
            });
            s = s.slice(0, zonesAt) + lvlLayer + s.slice(zonesAt);
        }
        // Los pasillos son su propia capa (paso Tránsito): rayas (principal) o puntos (entre pasillos), debajo de las huellas y los activos.
        (on('transito') ? (layout.transit || []) : []).forEach((p) => {
            const ty = (T.types && T.types[p.type === 'between' ? 'aisle2' : 'aisle']) || ['#D5D8E2', '#8E93A8', ''];
            // con formato propio (color, trama y borde) el pasillo se pinta con él
            if (p.fmt) {
                const tx = X(p.x); const ty0 = Y(p.y); const tw = Math.max((Number(p.l) || 0) * sc, 2); const th = Math.max((Number(p.w) || 0) * sc, 2);
                s += zonePaint(`tf-${String(p.id).replace(/[^A-Za-z0-9_-]/g, '')}`, p.fmt).markup(`${tx},${ty0} ${tx + tw},${ty0} ${tx + tw},${ty0 + th} ${tx},${ty0 + th}`);
                return;
            }
            s += `<rect x="${X(p.x)}" y="${Y(p.y)}" width="${Math.max((Number(p.l) || 0) * sc, 2)}" height="${Math.max((Number(p.w) || 0) * sc, 2)}" fill="${ty[0]}" stroke="${ty[1]}" stroke-width="1"${ty[2] ? ` stroke-dasharray="${ty[2]}"` : ''}/>`;
        });
        // El contorno es solo el marco del terreno (línea punteada) y sale con la capa «contorno»; las PAREDES son obstáculos puestos encima y salen con la capa «paredes»: son capas independientes (columnas, desniveles y otros,
        // más abajo, con «obstaculos»). Sin capas elegidas (la vista pública) todo se dibuja.
        // Un resplandor azul claro del contorno debajo de las paredes: donde la pared está sobre el contorno se ven sus orillas azules y la pared se distingue del marco.
        if (on('contorno')) s += `<polygon points="${layout.vertices.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="none" stroke="${CONTOUR_COLOR}" stroke-opacity="0.28" stroke-width="7" stroke-linejoin="round"/>`;
        const obstacleShapes = LC.obstacleShapes(layout);
        const obstaclePoly = (g) => g.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ');
        // una pared muy delgada para la escala del croquis se refuerza con un trazo para que siempre se vea (como mínimo unos 3 px de grueso)
        (on('paredes') ? obstacleShapes.filter(({ o }) => o.kind === 'wall') : []).forEach(({ o, g }) => {
            const mk = LC.wallMark ? LC.wallMark(layoutNoTurn, (layoutNoTurn.obstacles || []).find((x) => x.id === o.id), options.rotation || 0) : null;
            // con formato propio (color, trama y borde) la pared se pinta con él; la tira del lado más bajo, más clara
            const wallSafe = String(o.id).replace(/[^A-Za-z0-9_-]/g, '');
            const wallLighter = o.fmt ? { ...o.fmt, fill: LC.mixHex(o.fmt.fill, '#FFFFFF', 0.55), bcolor: LC.mixHex(o.fmt.bcolor, '#FFFFFF', 0.55) } : null;
            if (mk) {
                // dos tiras: la del lado más alto con el color de la pared y la del más bajo, clara; la etiqueta (con las medidas) va junto a su punto medio
                const dark = T.chrome.nave;
                const light = LC.mixHex(dark, '#FFFFFF', 0.55);
                const pts = (poly) => poly.map((v) => `${X(v[0])},${Y(v[1])}`).join(' ');
                const sw = Math.max(0.01, 3 - Math.min(g.l, g.w) * sc).toFixed(2);
                if (o.fmt) s += zonePaint(`wf-${wallSafe}a`, mk.dark === 'a' ? o.fmt : wallLighter).markup(pts(mk.a)) + zonePaint(`wf-${wallSafe}b`, mk.dark === 'b' ? o.fmt : wallLighter).markup(pts(mk.b));
                else s += `<polygon points="${pts(mk.a)}" fill="${mk.dark === 'a' ? dark : light}" stroke="${mk.dark === 'a' ? dark : light}" stroke-width="${sw}"/><polygon points="${pts(mk.b)}" fill="${mk.dark === 'b' ? dark : light}" stroke="${mk.dark === 'b' ? dark : light}" stroke-width="${sw}"/>`;
                if (options.measures !== false && mk.length * sc >= 36) {
                    const off = (mk.thick * sc) / 2 + 8;
                    const lx = X(mk.mid[0]) - mk.nx * off;
                    const ly = Y(mk.mid[1]) - mk.ny * off + 2.5;
                    const anchor = Math.abs(mk.nx) > 0.5 ? (-mk.nx > 0 ? 'start' : 'end') : 'middle';
                    const lab = labelText(lx.toFixed(1), ly.toFixed(1), 7.5, 700, '#14161F', anchor, esc(mk.label));
                    zoneHalos += lab.halo;
                    zoneLabels += lab.main;
                }
                return;
            }
            if (o.fmt) s += zonePaint(`wf-${wallSafe}`, o.fmt).markup(obstaclePoly(g));
            else s += `<polygon points="${obstaclePoly(g)}" fill="${T.chrome.nave}" stroke="${T.chrome.nave}" stroke-width="${Math.max(0.01, 3 - Math.min(g.l, g.w) * sc).toFixed(2)}" stroke-linejoin="miter"/>`; });
        // El contorno (línea azul punteada y fina) va ENCIMA de las paredes: se distingue de ellas aunque estén sobre el mismo lado.
        if (on('contorno')) s += `<polygon points="${layout.vertices.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="none" stroke="${CONTOUR_COLOR}" stroke-width="1.6" stroke-dasharray="7 5" stroke-linejoin="round"/>`;
        // La HUELLA (el lugar en el piso) va primero, blanca o con su color; el ACTIVO encima, un poco más chico, con su propio color (arena si no tiene): así se distinguen aunque midan lo mismo. Un Layout que todavía
        // no trae huellas (copias viejas) dibuja los activos enteros como siempre.
        // Capas: «huellas» solo las huellas, «activos» solo los activos y «espacios» (la vista pública, que no los separa) las dos.
        const fps = (on('huellas') || on('espacios')) ? (layout.footprints || []) : [];
        const showAssets = on('activos') || on('espacios');
        const legacy = showAssets && !(layout.footprints || []).length;
        const hitFootprints = new Set((layout.spaces || []).filter((sp) => focusSpaces[sp.id]).map((sp) => sp.footprintId));
        const quad = (px, py, w, h) => `${px},${py} ${px + w},${py} ${px + w},${py + h} ${px},${py + h}`;
        fps.forEach((f) => {
            const w = Math.max(f.l * sc, 4);
            const h = Math.max(f.d * sc, 4);
            const dim = hasFocusSpaces && !hitFootprints.has(f.id);
            if (f.fmt) s += `<g${dim ? ' opacity="0.3"' : ''}>${zonePaint(`hf-${f.id}`, f.fmt).markup(quad(X(f.x), Y(f.y), w, h))}</g>`;
            else s += `<rect x="${X(f.x)}" y="${Y(f.y)}" width="${w}" height="${h}" rx="2" fill="#FFFFFF" stroke="${T.chrome.line}" stroke-width="1"${dim ? ' opacity="0.3"' : ''}/>`;
        });
        (showAssets ? (layout.spaces || []) : []).forEach((sp) => {
            const w = Math.max(sp.l * sc, 4);
            const h = Math.max(sp.d * sc, 4);
            const hit = focusSpaces[sp.id];
            const dim = hasFocusSpaces && !hit;
            const inset = legacy ? 0 : Math.max(1.5, Math.min(4, Math.min(w, h) * 0.16));
            const ax = X(sp.x) + inset;
            const ay = Y(sp.y) + inset;
            const aw = Math.max(w - 2 * inset, 2);
            const ah = Math.max(h - 2 * inset, 2);
            const own = sp.fmt || (legacy ? null : LC.FMT_ASSET_DEFAULT);
            // Con formato propio (color, rayas o borde del activo) se pinta con él; un activo que se está buscando (focus) sigue con el color de la búsqueda.
            if (own && !hit) {
                s += `<g${dim ? ' opacity="0.3"' : ''}>${zonePaint(`sf-${sp.id}`, own).markup(quad(ax, ay, aw, ah))}</g>`;
            } else {
                s += `<rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" rx="2" fill="${hit ? esc(hit) : '#FFFFFF'}" stroke="${hit ? esc(hit) : T.chrome.line}" stroke-width="${hit ? 2.2 : 1}"${dim ? ' opacity="0.3"' : ''}/>`;
            }
            if (w >= 26 && h >= 9) s += `<text x="${X(sp.x) + w / 2}" y="${Y(sp.y) + h / 2 + 3}" font-size="7.5" font-weight="${hit ? 800 : 600}" fill="${hit ? '#FFFFFF' : (own && inkFor(own)) || T.chrome.cardInk}" text-anchor="middle"${dim ? ' opacity="0.4"' : ''}>${esc(sp.code)}</text>`;
        });
        s += zoneHalos + measureHalos + zoneLabels + measureLabels;
        // Una puerta va sobre su pared: se dibuja por el centro de la pared, a lo largo de ella.
        (on('puertas') ? (layout.doors || []) : []).forEach((d) => {
            const g = LC.doorGeometry(layout, d);
            if (!g) return;
            // cómo abre (options.openings = false la quita): el giro de la hoja (cuarto de círculo con la hoja abierta) o el recorrido de una corrediza
            const op = options.openings !== false && LC.doorOpening ? LC.doorOpening(layout, d) : null;
            if (op) {
                const col = op.type === 'swing' ? '#A63FB5' : '#2F7FC7';
                s += `<polygon points="${op.pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}" fill="${col}" fill-opacity="${op.type === 'swing' ? 0.32 : 0.38}" stroke="${col}" stroke-width="1.5" stroke-dasharray="5 3"/>`;
                if (op.type === 'swing') s += `<line x1="${X(op.leaf[0][0]).toFixed(1)}" y1="${Y(op.leaf[0][1]).toFixed(1)}" x2="${X(op.leaf[1][0]).toFixed(1)}" y2="${Y(op.leaf[1][1]).toFixed(1)}" stroke="${col}" stroke-width="4" stroke-linecap="butt" opacity="0.85"/>`;
                else s += `<line x1="${X(op.travel[0][0]).toFixed(1)}" y1="${Y(op.travel[0][1]).toFixed(1)}" x2="${X(op.travel[1][0]).toFixed(1)}" y2="${Y(op.travel[1][1]).toFixed(1)}" stroke="${col}" stroke-width="1.5" stroke-dasharray="5 3"/>`;
            }
            s += `<line x1="${X(g.a.x)}" y1="${Y(g.a.y)}" x2="${X(g.b.x)}" y2="${Y(g.b.y)}" stroke="#1E7E34" stroke-width="7"/>`;
        });
        // Columnas (con el contorno) y conexiones de luz (con su paso): solo las trae el reporte con sesión; la vista pública nunca las lleva.
        (on('obstaculos') ? obstacleShapes.filter(({ o }) => o.kind !== 'wall') : []).forEach(({ o, g }) => {
            if (o.kind === 'step') s += `<polygon points="${obstaclePoly(g)}" fill="#E8D9F2" stroke="#8A5EA8" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.9"/>`;
            else s += `<polygon points="${obstaclePoly(g)}" fill="${o.kind === 'other' ? '#9AA0B5' : '#6B7089'}" stroke="${o.kind === 'other' ? '#9AA0B5' : '#6B7089'}" stroke-width="1.5" opacity="0.8"/>`;
        });
        // una conexión de luz va sobre su pared (por el centro de la pared)
        (on('luz') ? (layout.power || []) : []).forEach((e) => {
            const g = LC.doorGeometry(layout, { ...e, width: 0 });
            if (!g) return;
            s += `<circle cx="${X(g.a.x)}" cy="${Y(g.a.y)}" r="5.5" fill="#FBF0DE" stroke="#D9A441" stroke-width="1.6"/>`;
        });
        // Seguridad (paso Seguridad): primero las rutas de evacuación (debajo) y encima los símbolos con su código.
        if (on('seguridad') && (layout.safety || []).length) {
            const rs = Math.max(5, Math.min(8, sc * 0.45));
            (layout.safety || []).filter((e) => e.type === 'route').forEach((e) => { s += safetyRoute(X(e.x), Y(e.y), X(e.x2), Y(e.y2), 2.4); });
            (layout.safety || []).forEach((e) => {
                const cx = X(e.x);
                const cy = Y(e.y);
                if (e.type === 'route') s += `<circle cx="${cx}" cy="${cy}" r="3.2" fill="${(LC.SAFETY_COLORS || {}).route}" stroke="#14602F" stroke-width="0.9"/>${safetyLabel(cx, cy - 6, e.code || '')}`;
                else s += `${safetyGlyph(e.type, cx, cy, rs, e.model)}${safetyLabel(cx, cy - rs - 3, e.code || '')}`;
            });
        }
        const bar = 5 * sc;
        s += `<line x1="${M}" y1="${H - 12}" x2="${M + bar}" y2="${H - 12}" stroke="${T.chrome.nave}" stroke-width="2"/><text x="${M + bar + 6}" y="${H - 8}" font-size="8.5" fill="#6B7089">5 m</text>`;
        return `${s}</svg>`;
    }

    window.LayoutMapSvg = { safetyGlyph, safetyRoute, safetyLabel, mapSvg, theme, DEFAULT_THEME, zonePaint, defaultFmt, defaultSpaceFmt, defaultAssetFmt, inkFor, CATEGORY_ICON_PATHS, categoryGlyph };
}());
