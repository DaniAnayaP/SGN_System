// ---------------------------------------------------------------------------
// Layout de la nave (Operaciones, C. Distribución): cálculos y validación.
// Lo cargan el navegador (pantalla Layout) y el servidor (server.js), así que el KPI que ve la persona y el que se
// valida al guardar salen de la misma cuenta. Todo en metros. Los tipos son identificadores estables (no textos): la
// pantalla los traduce a es/en.
// ---------------------------------------------------------------------------
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.LayoutCalc = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    const ZONE_TYPES = ['dry', 'cold', 'chemical', 'finished', 'dock', 'office', 'aisle', 'aisle2'];
    // Zonas donde se almacena producto (las demás son andenes, oficinas o pasillos).
    const STORAGE_ZONE_TYPES = ['dry', 'cold', 'chemical', 'finished'];
    // Para qué se usa una zona (es aparte del tipo: una zona Seca puede ser de almacenamiento o de operaciones): almacenamiento, operaciones o instalaciones (baño, bombas, etc.).
    // Es opcional: una zona sin uso definido se guarda exactamente igual que antes.
    const ZONE_USES = ['storage', 'operations', 'facilities'];
    const SPACE_TYPES = ['rack', 'cabinet', 'pallet'];
    // Formato propio de una zona (como Formato de celdas de Excel): color de fondo, rayas o patrón y su color, y estilo y color del borde.
    const FMT_PATTERNS = ['none', 'solid', 'diag1', 'diag2', 'horiz', 'vert', 'grid', 'dots', 'cross'];
    const FMT_LINES = ['none', 'thin', 'mid', 'thick', 'dash', 'dot', 'dashdot', 'double'];
    // Categorías dentro de una zona (se capturan a mano): nombre, descripción corta, icono y color; cada una tiene su QR.
    const CATEGORY_ICONS = ['shield', 'pill', 'flask', 'drop', 'alert', 'box', 'paper', 'bottle', 'cross', 'tag'];
    // Los 10 colores de las categorías (los mismos que ofrece el editor). Las categorías que salen solas de los códigos de una zona toman su icono y su color de aquí, por el
    // número de la categoría en su catálogo, así cada una se ve siempre igual en la hoja y en la página del QR.
    const CATEGORY_COLORS = ['#1f3a6b', '#3f6b2f', '#d08a1e', '#2f4fc9', '#c77fa3', '#7a1f1a', '#2f8a9b', '#4c5fb0', '#6b3e98', '#5b6272'];
    const categoryLook = (seed) => {
        const n = Math.max(0, Math.floor(Number(seed)) || 0);
        return { icon: CATEGORY_ICONS[n % CATEGORY_ICONS.length], color: CATEGORY_COLORS[n % CATEGORY_COLORS.length] };
    };
    const DOOR_TYPES = ['dock', 'staff', 'emergency'];
    const POWER_TYPES = ['panel', 'outlet110', 'outlet220', 'three-phase'];
    // Cada sección del Layout cuelga de una columna del árbol de accesos (ver menu.json, colLayout*).
    const SECTIONS = {
        contorno: 'colLayoutContorno',
        puertas: 'colLayoutPuertas',
        luz: 'colLayoutLuz',
        zonas: 'colLayoutZonas',
        espacios: 'colLayoutEspacios',
    };
    const LIMITS = { vertices: 60, doors: 100, power: 300, obstacles: 300, zones: 150, zonePoints: 60, categories: 20, categoryText: 120, slots: 100, spaces: 5000, text: 80, maxM: 5000, maxHeight: 100 };

    function round2(n) { return Math.round(n * 100) / 100; }

    function polygonArea(vertices) {
        let sum = 0;
        for (let i = 0; i < vertices.length; i++) {
            const p = vertices[i];
            const q = vertices[(i + 1) % vertices.length];
            sum += p[0] * q[1] - q[0] * p[1];
        }
        return Math.abs(sum) / 2;
    }

    // Pared n (1 = de la esquina 1 a la 2): extremos, largo y vector unitario.
    function wallSegment(vertices, wall) {
        const count = vertices.length;
        if (!count) return { p: [0, 0], q: [0, 0], length: 0, ux: 0, uy: 0 };
        const p = vertices[(wall - 1) % count];
        const q = vertices[wall % count];
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        return { p, q, length, ux: length ? dx / length : 0, uy: length ? dy / length : 0 };
    }

    function perimeter(vertices) {
        let sum = 0;
        for (let i = 1; i <= vertices.length; i++) sum += wallSegment(vertices, i).length;
        return sum;
    }

    // ---- altura por esquina ------------------------------------------------------------------------------------------
    // Cada esquina es [x, y, altura]. heightM (la altura promedio de las esquinas) se conserva solo como resumen y para leer lo guardado antes de que
    // existiera la altura por esquina (esquinas [x, y] y una sola altura para toda la nave).
    const meanHeight = (vertices) => (vertices.length ? vertices.reduce((acc, p) => acc + (Number(p[2]) || 0), 0) / vertices.length : 0);
    function heightRange(vertices) {
        const hs = vertices.map((p) => Number(p[2])).filter((h) => Number.isFinite(h));
        return hs.length ? { min: Math.min(...hs), max: Math.max(...hs) } : { min: 0, max: 0 };
    }
    function normalize(layout) {
        if (!layout || !Array.isArray(layout.vertices)) return layout;
        const legacy = Number(layout.heightM) || 0;
        const vertices = layout.vertices.map((p) => {
            const h = Number(p[2]);
            return [p[0], p[1], Number.isFinite(h) && h > 0 ? h : legacy];
        });
        return { ...layout, vertices, heightM: round2(meanHeight(vertices)) };
    }
    // Triangulación por "orejas": sirve para contornos con esquinas hacia adentro (en L, en U). null si el contorno se cruza a sí mismo.
    function triangulate(pts) {
        const n = pts.length;
        if (n < 3) return [];
        const idx = pts.map((_, i) => i);
        let s = 0;
        for (let i = 0; i < n; i++) { const p = pts[i]; const q = pts[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; }
        if (s < 0) idx.reverse();
        const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const inTri = (p, a, b, c) => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
        const tris = [];
        while (idx.length > 3) {
            let clipped = false;
            for (let i = 0; i < idx.length; i++) {
                const a = idx[(i + idx.length - 1) % idx.length];
                const b = idx[i];
                const c = idx[(i + 1) % idx.length];
                if (cross(pts[a], pts[b], pts[c]) <= 1e-9) continue;
                if (idx.some((k) => k !== a && k !== b && k !== c && inTri(pts[k], pts[a], pts[b], pts[c]))) continue;
                tris.push([a, b, c]);
                idx.splice(i, 1);
                clipped = true;
                break;
            }
            if (!clipped) return null;
        }
        tris.push([idx[0], idx[1], idx[2]]);
        return tris;
    }
    // Volumen bajo el techo que forman las alturas de las esquinas: en cada triángulo del contorno, su área por el promedio de las alturas de sus 3 esquinas
    // (exacto para un techo plano o inclinado). Con la misma altura en todas las esquinas es simplemente área x altura.
    function volumeOf(vertices) {
        if (vertices.length < 3) return 0;
        const tris = triangulate(vertices);
        if (!tris) return polygonArea(vertices) * meanHeight(vertices);
        return tris.reduce((acc, [a, b, c]) => {
            const area = polygonArea([vertices[a], vertices[b], vertices[c]]);
            return acc + area * ((Number(vertices[a][2]) || 0) + (Number(vertices[b][2]) || 0) + (Number(vertices[c][2]) || 0)) / 3;
        }, 0);
    }

    // ---- zonas de cualquier forma ------------------------------------------------------------------------------------
    // Una zona es un rectángulo (x, y, largo, ancho) o, si trae pts, un polígono de esquinas [x, y] (cuartos en L, con muescas, etc.). En los dos casos x, y, l y w
    // son el rectángulo que la envuelve, así que lo que solo necesita ese recuadro sigue funcionando. type '' = zona todavía sin asignar (no cuenta como zona).
    const rectPoints = (z) => [[z.x, z.y], [z.x + z.l, z.y], [z.x + z.l, z.y + z.w], [z.x, z.y + z.w]];
    const hasPoints = (z) => !!z && Array.isArray(z.pts) && z.pts.length >= 3;
    const zonePoints = (z) => (hasPoints(z) ? z.pts : rectPoints(z));
    const zoneArea = (z) => (hasPoints(z) ? polygonArea(z.pts) : (z.l || 0) * (z.w || 0));
    function pointInPolygon(x, y, pts) {
        let r = false;
        for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
            const xa = pts[a][0]; const ya = pts[a][1]; const xb = pts[b][0]; const yb = pts[b][1];
            if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) r = !r;
        }
        return r;
    }
    function onPolygonEdge(x, y, pts) {
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i]; const b = pts[(i + 1) % pts.length];
            const cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
            if (Math.abs(cross) < 1e-6 && x >= Math.min(a[0], b[0]) - 1e-6 && x <= Math.max(a[0], b[0]) + 1e-6 && y >= Math.min(a[1], b[1]) - 1e-6 && y <= Math.max(a[1], b[1]) + 1e-6) return true;
        }
        return false;
    }
    // ¿Alguna esquina de la zona queda fuera del contorno de la nave? (aviso en la pantalla; lo que sale del contorno no cuenta como piso de la nave)
    function zoneOutsideNave(vertices, z) {
        if (!vertices || vertices.length < 3) return false;
        return zonePoints(z).some((p) => !pointInPolygon(p[0], p[1], vertices) && !onPolygonEdge(p[0], p[1], vertices));
    }
    // Un punto dentro de la zona, lo más alejado de sus lados (ahí cabe el nombre), para las zonas que no son rectángulos.
    function zoneLabelAnchor(z) {
        const pts = zonePoints(z);
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
        const edgeDist = (x, y) => {
            let m = Infinity;
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i]; const b = pts[(i + 1) % pts.length];
                const dx = b[0] - a[0]; const dy = b[1] - a[1];
                const len2 = dx * dx + dy * dy;
                const t = len2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2)) : 0;
                m = Math.min(m, Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)));
            }
            return m;
        };
        let best = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, d: -1 };
        const N = 18;
        for (let j = 0; j < N; j++) {
            for (let i = 0; i < N; i++) {
                const x = minX + ((i + 0.5) / N) * (maxX - minX);
                const y = minY + ((j + 0.5) / N) * (maxY - minY);
                if (!pointInPolygon(x, y, pts)) continue;
                const d = edgeDist(x, y);
                if (d > best.d) best = { x, y, d };
            }
        }
        return { x: best.x, y: best.y };
    }

    // ---- figuras escritas lado por lado -------------------------------------------------------------------------------
    // Un cuarto o el contorno de la nave se puede escribir como el plano lo trae: desde una esquina, cada lado es hacia dónde va y su medida en metros. Hacia dónde puede ser
    // R derecha, D abajo, L izquierda, U arriba, o un ángulo en grados (sin límite de 90°) medido girando como las manecillas del reloj desde la derecha: 0° derecha, 90° abajo,
    // 180° izquierda, 270° arriba. Estas ayudas pasan de lados a esquinas y de esquinas a lados.
    const DIRS = { R: [1, 0], D: [0, 1], L: [-1, 0], U: [0, -1] };
    const DIR_ANGLE = { R: 0, D: 90, L: 180, U: 270 };
    const SIDE_EPS = 0.005;
    // La figura cierra cuando la última esquina cae a menos de 1.5 cm del origen (las medidas y los ángulos se redondean).
    const CLOSE_EPS = 0.015;
    // El recorrido redondea cada esquina a centímetros, igual que se guardan: así leer los lados de unas esquinas y volver a armarlas da las mismas esquinas.
    function walkSides(origin, sides) {
        let x = round2(origin[0]); let y = round2(origin[1]);
        const pts = [[x, y]];
        sides.forEach((s) => {
            const len = Number(s[1]) || 0;
            let dx; let dy;
            if (typeof s[0] === 'number') { const rad = (s[0] * Math.PI) / 180; dx = Math.cos(rad) * len; dy = Math.sin(rad) * len; } else { const d = DIRS[s[0]] || DIRS.R; dx = d[0] * len; dy = d[1] * len; }
            x = round2(x + dx); y = round2(y + dy);
            pts.push([x, y]);
        });
        return pts;
    }
    // Esquinas de una figura a partir de sus lados. closed = el último lado regresó al origen (se quita la esquina repetida).
    function pointsFromSides(origin, sides) {
        const pts = walkSides(origin, sides);
        const a = pts[0]; const b = pts[pts.length - 1];
        const closed = pts.length > 3 && Math.abs(a[0] - b[0]) < CLOSE_EPS && Math.abs(a[1] - b[1]) < CLOSE_EPS;
        if (closed) pts.pop();
        return { pts, closed };
    }
    // El lado que va de una esquina a otra: derecho (R/D/L/U) si va a 90°, si no con su ángulo.
    function sideOf(dx, dy) {
        if (Math.abs(dy) < SIDE_EPS) return [dx >= 0 ? 'R' : 'L', round2(Math.abs(dx))];
        if (Math.abs(dx) < SIDE_EPS) return [dy >= 0 ? 'D' : 'U', round2(Math.abs(dy))];
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle < 0) angle += 360;
        return [Math.round(angle * 1000) / 1000, Math.round(Math.hypot(dx, dy) * 1000) / 1000];
    }
    // Lados de una figura. open = se está armando y todavía no cierra: sus esquinas son el recorrido completo y no se cuenta el lado que cerraría.
    function sidesFromPoints(pts, open) {
        const n = pts.length;
        const sides = [];
        const edges = open ? n - 1 : n;
        for (let i = 0; i < edges; i++) {
            const a = pts[i]; const b = pts[(i + 1) % n];
            sides.push(sideOf(b[0] - a[0], b[1] - a[1]));
        }
        return { sides, diagonal: false };
    }
    // Lo que falta para cerrar una figura abierta con lados derechos: los (hasta dos) lados que llevan su última esquina de regreso al origen.
    function closingSides(pts) {
        const a = pts[0]; const b = pts[pts.length - 1];
        const dx = round2(a[0] - b[0]); const dy = round2(a[1] - b[1]);
        const out = [];
        if (Math.abs(dx) >= SIDE_EPS) out.push([dx > 0 ? 'R' : 'L', Math.abs(dx)]);
        if (Math.abs(dy) >= SIDE_EPS) out.push([dy > 0 ? 'D' : 'U', Math.abs(dy)]);
        return out;
    }
    // O un solo lado en línea recta de la última esquina al origen (con su ángulo si no va a 90°). null si ya cierra.
    function closingLine(pts) {
        const a = pts[0]; const b = pts[pts.length - 1];
        const dx = a[0] - b[0]; const dy = a[1] - b[1];
        return Math.hypot(dx, dy) < SIDE_EPS ? null : sideOf(dx, dy);
    }
    // Para rotular la medida de cada lado: punto medio, largo y vector unitario hacia donde conviene escribirla (outward = afuera de la figura, si no adentro).
    function sideMeasures(pts, outward) {
        const out = [];
        if (!pts || pts.length < 3) return out;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i]; const b = pts[(i + 1) % pts.length];
            const dx = b[0] - a[0]; const dy = b[1] - a[1];
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1e-6) continue;
            let nx = dy / len; let ny = -dx / len;
            const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2;
            const eps = Math.min(0.15, len / 4);
            const inside = pointInPolygon(mx + nx * eps, my + ny * eps, pts);
            if (inside === !!outward) { nx = -nx; ny = -ny; }
            out.push({ mx, my, nx, ny, len });
        }
        return out;
    }

    // Formato de una zona tal como llega: lo que no sea válido se corrige (no se rechaza). null si no trae formato (la zona usa el color de su tipo).
    function sanitizeFmt(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const hex = (v, fallback) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : fallback);
        const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
        return { fill: hex(raw.fill, '#ffffff'), pattern: oneOf(raw.pattern, FMT_PATTERNS, 'solid'), pcolor: hex(raw.pcolor, '#6b7089'), line: oneOf(raw.line, FMT_LINES, 'thin'), bcolor: hex(raw.bcolor, '#6b7089') };
    }

    function emptyLayout() {
        return {
            mode: 'scratch', heightM: 9,
            vertices: [[0, 0, 9], [30, 0, 9], [30, 20, 9], [0, 20, 9]],
            doors: [], power: [], obstacles: [], zones: [], spaces: [],
            plan: null,
        };
    }

    // Superficie de la nave cubierta por al menos una zona: cada zona cuenta una sola vez aunque se encime con otra, y lo que una zona tenga fuera del contorno no
    // cuenta. Se mide sobre una cuadrícula fina (0.05 a 0.5 m, la más fina que quepa); con medidas en múltiplos de 5 cm es exacta.
    function coveredArea(vertices, zones) {
        if (vertices.length < 3 || !zones.length) return 0;
        const xs = vertices.map((p) => p[0]);
        const ys = vertices.map((p) => p[1]);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const w = Math.max(...xs) - minX;
        const h = Math.max(...ys) - minY;
        if (!(w > 0 && h > 0)) return 0;
        const MAX_CELLS = 400000;
        let step = Math.sqrt((w * h) / MAX_CELLS);
        for (const s of [0.05, 0.1, 0.2, 0.25, 0.5]) { if ((w / s) * (h / s) <= MAX_CELLS) { step = s; break; } }
        const nx = Math.ceil(w / step);
        const ny = Math.ceil(h / step);
        const grid = new Uint8Array(nx * ny);
        zones.forEach((z) => {
            const poly = hasPoints(z) ? z.pts : null;
            const i0 = Math.max(0, Math.floor((z.x - minX) / step) - 1);
            const i1 = Math.min(nx - 1, Math.ceil((z.x + z.l - minX) / step) + 1);
            const j0 = Math.max(0, Math.floor((z.y - minY) / step) - 1);
            const j1 = Math.min(ny - 1, Math.ceil((z.y + z.w - minY) / step) + 1);
            for (let j = j0; j <= j1; j++) {
                const cy = minY + (j + 0.5) * step;
                if (cy < z.y || cy >= z.y + z.w) continue;
                for (let i = i0; i <= i1; i++) {
                    const cx = minX + (i + 0.5) * step;
                    if (poly ? pointInPolygon(cx, cy, poly) : (cx >= z.x && cx < z.x + z.l)) grid[j * nx + i] = 1;
                }
            }
        });
        const inside = (x, y) => {
            let r = false;
            for (let a = 0, b = vertices.length - 1; a < vertices.length; b = a++) {
                const xa = vertices[a][0]; const ya = vertices[a][1]; const xb = vertices[b][0]; const yb = vertices[b][1];
                if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) r = !r;
            }
            return r;
        };
        let cells = 0;
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                if (grid[j * nx + i] && inside(minX + (i + 0.5) * step, minY + (j + 0.5) * step)) cells++;
            }
        }
        return cells * step * step;
    }

    // Lo que se muestra arriba del Layout y se recalcula con cada cambio.
    //  totales = superficie de la nave; oficinas, pasillos y andenes = suma de las zonas de ese tipo; almacenamiento = huella
    //  (largo x fondo) de los anaqueles, gabetas y tarimas activos; muertos = lo que queda de la nave sin ninguno de esos usos.
    function computeKpis(layout) {
        const total = polygonArea(layout.vertices || []);
        const zones = (layout.zones || []).filter((z) => z.active !== false);
        const spaces = (layout.spaces || []).filter((s) => s.active !== false);
        const sumType = (type) => zones.filter((z) => z.type === type).reduce((acc, z) => acc + zoneArea(z), 0);
        const offices = sumType('office');
        // Los dos tipos de pasillo (principal y entre anaqueles) suman en los m² de pasillos.
        const aisles = sumType('aisle') + sumType('aisle2');
        const docks = sumType('dock');
        // Almacenamiento = las zonas de almacenamiento (seco, refrigerado, químicos, producto terminado); la huella es lo que ocupan sus anaqueles, gabetas y tarimas.
        const storageZones = zones.filter((z) => STORAGE_ZONE_TYPES.includes(z.type)).reduce((acc, z) => acc + zoneArea(z), 0);
        const footprint = spaces.reduce((acc, s) => acc + (s.l || 0) * (s.d || 0), 0);
        const storageVolume = spaces.reduce((acc, s) => acc + (s.l || 0) * (s.d || 0) * (s.h || 0), 0);
        // Espacio muerto = el piso de la nave que no tiene ninguna zona (sin color): el total menos los m² ya definidos. overlap = m² de zonas encimadas entre sí o
        // fuera de la nave (sumadas de más en los demás KPIs).
        // Una zona sin tipo asignado (type '') todavía no es una zona: no cubre piso, así que cuenta como espacio muerto hasta que se le asigne una.
        const assigned = zones.filter((z) => z.type);
        const unassigned = zones.filter((z) => !z.type).reduce((acc, z) => acc + zoneArea(z), 0);
        const assignedArea = assigned.reduce((acc, z) => acc + zoneArea(z), 0);
        let covered = coveredArea(layout.vertices || [], assigned);
        // Medido sobre una cuadrícula, cada borde que no cae en múltiplos de 5 cm se desvía unas décimas de m². Si lo que falta frente a la suma de las zonas es de ese
        // tamaño (menos de 1 % + 0.1 m²), no hay encimes ni zonas fuera de la nave: lo cubierto es la suma exacta de sus superficies.
        if (assignedArea - covered <= assignedArea * 0.01 + 0.1) covered = Math.min(assignedArea, total);
        const dead = Math.max(0, total - covered);
        const overlap = Math.max(0, assignedArea - covered);
        const perZone = zones.map((z) => {
            const mine = spaces.filter((s) => s.zoneId === z.id);
            const zFootprint = mine.reduce((acc, s) => acc + (s.l || 0) * (s.d || 0), 0);
            const area = zoneArea(z);
            return {
                id: z.id, name: z.name, type: z.type, use: z.use || '', area: round2(area), spaces: mine.length,
                footprint: round2(zFootprint), occupancy: area ? round2((zFootprint / area) * 100) : 0,
                volume: round2(mine.reduce((acc, s) => acc + (s.l || 0) * (s.d || 0) * (s.h || 0), 0)),
            };
        });
        return {
            total: round2(total), offices: round2(offices), aisles: round2(aisles), docks: round2(docks),
            storage: round2(storageZones), footprint: round2(footprint), covered: round2(covered), overlap: round2(overlap), dead: round2(dead), unassigned: round2(unassigned),
            volume: round2(volumeOf(layout.vertices || [])), storageVolume: round2(storageVolume),
            heightMin: round2(heightRange(layout.vertices || []).min), heightMax: round2(heightRange(layout.vertices || []).max),
            perimeter: round2(perimeter(layout.vertices || [])), zones: perZone,
        };
    }

    // Qué zonas forman cada cifra de "Datos métricos" (la página pública del QR del Layout): al tocar una cifra se ven solo sus zonas con sus metros.
    // key = total | offices | aisles | docks | storage | dead | volume. Cada renglón es { kind: 'zone' | 'rest' | 'overlap', id, name, type, value } y la suma es la cifra misma (kpis[key]).
    // Espacio muerto = las zonas sin tipo asignado + el piso de la nave que no tiene ninguna zona ('rest'); en total y volumen, además, lo encimado o fuera de la nave se resta
    // ('overlap'). El volumen de cada renglón son sus m² por la altura promedio de la nave (volumen / superficie).
    const METRIC_KEYS = ['total', 'offices', 'aisles', 'docks', 'storage', 'dead', 'volume'];
    function metricRows(kpis, key) {
        if (!kpis || !METRIC_KEYS.includes(key)) return { rows: [], sum: 0, unit: 'm²' };
        const zones = kpis.zones || [];
        const volume = key === 'volume';
        const factor = volume ? (kpis.total > 0 ? kpis.volume / kpis.total : 0) : 1;
        const zoneRow = (z) => ({ kind: 'zone', id: z.id, name: z.name, type: z.type || '', value: round2((z.area || 0) * factor) });
        const restArea = Math.max(0, round2((kpis.dead || 0) - (kpis.unassigned || 0)));
        const restRow = () => ({ kind: 'rest', id: '', name: '', type: '', value: round2(restArea * factor) });
        let rows;
        if (key === 'offices') rows = zones.filter((z) => z.type === 'office').map(zoneRow);
        else if (key === 'aisles') rows = zones.filter((z) => z.type === 'aisle' || z.type === 'aisle2').map(zoneRow);
        else if (key === 'docks') rows = zones.filter((z) => z.type === 'dock').map(zoneRow);
        else if (key === 'storage') rows = zones.filter((z) => STORAGE_ZONE_TYPES.includes(z.type)).map(zoneRow);
        else if (key === 'dead') {
            rows = zones.filter((z) => !z.type).map(zoneRow);
            if (restArea > 0) rows.push(restRow());
        } else {
            rows = zones.map(zoneRow);
            if (restArea > 0) rows.push(restRow());
            if ((kpis.overlap || 0) > 0.005) rows.push({ kind: 'overlap', id: '', name: '', type: '', value: -round2(kpis.overlap * factor) });
        }
        return { rows, sum: kpis[key] || 0, unit: volume ? 'm³' : 'm²' };
    }

    // ---- validación (la usa el servidor antes de guardar; la pantalla solo la usa para avisar) --------------------------
    function sanitizeLayout(input) {
        const errors = [];
        const src = input && typeof input === 'object' ? input : {};
        const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
        const meters = (v, label, min = 0) => {
            const n = Number(v);
            if (!Number.isFinite(n) || n < min || n > LIMITS.maxM) { errors.push(`${label}: medida no válida`); return 0; }
            return round2(n);
        };
        const text = (v, label, required) => {
            const s = typeof v === 'string' ? v.trim() : '';
            if (required && !s) errors.push(`${label}: falta el nombre`);
            if (s.length > LIMITS.text) { errors.push(`${label}: texto demasiado largo`); return s.slice(0, LIMITS.text); }
            return s;
        };
        const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
        const list = (v, max, label) => {
            if (v == null) return [];
            if (!Array.isArray(v)) { errors.push(`${label}: lista no válida`); return []; }
            if (v.length > max) { errors.push(`${label}: demasiados elementos (máximo ${max})`); return v.slice(0, max); }
            return v;
        };
        const idOf = (v, seen, label) => {
            const s = typeof v === 'string' ? v : '';
            if (!/^[A-Za-z0-9_-]{1,40}$/.test(s)) { errors.push(`${label}: identificador no válido`); return ''; }
            if (seen.has(s)) { errors.push(`${label}: identificador repetido`); return s; }
            seen.add(s);
            return s;
        };

        const out = { mode: src.mode === 'plan' ? 'plan' : 'scratch' };
        // Sitio: el lugar que va arriba del nombre de la empresa en el reporte y en la tarjeta (por ejemplo "CEDIS Chihuahua"). Opcional: sin él se guarda exactamente igual que antes.
        const siteName = text(src.siteName, 'Sitio', false);
        if (siteName) out.siteName = siteName;
        // Cada esquina trae su altura [x, y, altura]. Una esquina sin altura (Layout de antes) hereda heightM, la altura única de entonces.
        const legacyHeight = Number(src.heightM);
        out.vertices = list(src.vertices, LIMITS.vertices, 'Esquinas').map((p, i) => {
            if (!Array.isArray(p) || (p.length !== 2 && p.length !== 3) || !isNum(Number(p[0])) || !isNum(Number(p[1]))) { errors.push(`Esquina ${i + 1}: coordenadas no válidas`); return [0, 0, 0]; }
            const x = Number(p[0]);
            const y = Number(p[1]);
            if (Math.abs(x) > LIMITS.maxM || Math.abs(y) > LIMITS.maxM) errors.push(`Esquina ${i + 1}: fuera de rango`);
            const h = p.length === 3 ? Number(p[2]) : legacyHeight;
            if (!(Number.isFinite(h) && h > 0 && h <= LIMITS.maxHeight)) errors.push(`Esquina ${i + 1}: la altura debe ser mayor que 0 (máximo ${LIMITS.maxHeight} m)`);
            return [round2(x), round2(y), Number.isFinite(h) ? round2(h) : 0];
        });
        out.heightM = round2(meanHeight(out.vertices));
        if (out.vertices.length < 3) errors.push('Contorno: se necesitan al menos 3 esquinas');
        else if (!(polygonArea(out.vertices) > 0)) errors.push('Contorno: las esquinas no forman una superficie');
        const walls = out.vertices.length;

        const doorIds = new Set();
        out.doors = list(src.doors, LIMITS.doors, 'Puertas').map((d, i) => {
            const label = `Puerta ${i + 1}`;
            const wall = Math.round(Number(d && d.wall));
            if (!(wall >= 1 && wall <= walls)) errors.push(`${label}: pared no válida`);
            return {
                id: idOf(d && d.id, doorIds, label), name: text(d && d.name, label, true), type: oneOf(d && d.type, DOOR_TYPES, 'staff'),
                wall: wall >= 1 && wall <= walls ? wall : 1, dist: meters(d && d.dist, label), width: meters(d && d.width, label), height: meters(d && d.height, label),
            };
        });

        const powerIds = new Set();
        out.power = list(src.power, LIMITS.power, 'Conexiones de luz').map((e, i) => {
            const label = `Conexión de luz ${i + 1}`;
            const wall = Math.round(Number(e && e.wall));
            if (!(wall >= 1 && wall <= walls)) errors.push(`${label}: pared no válida`);
            return {
                id: idOf(e && e.id, powerIds, label), type: oneOf(e && e.type, POWER_TYPES, 'outlet110'),
                wall: wall >= 1 && wall <= walls ? wall : 1, dist: meters(e && e.dist, label), height: meters(e && e.height, label),
            };
        });

        const obstacleIds = new Set();
        out.obstacles = list(src.obstacles, LIMITS.obstacles, 'Columnas y obstáculos').map((o, i) => {
            const label = `Obstáculo ${i + 1}`;
            return { id: idOf(o && o.id, obstacleIds, label), name: text(o && o.name, label, false), x: meters(o && o.x, label, -LIMITS.maxM), y: meters(o && o.y, label, -LIMITS.maxM), l: meters(o && o.l, label), w: meters(o && o.w, label) };
        });

        const zoneIds = new Set();
        out.zones = list(src.zones, LIMITS.zones, 'Zonas').map((z, i) => {
            const label = `Zona ${i + 1}`;
            const id = idOf(z && z.id, zoneIds, label);
            const name = text(z && z.name, label, true);
            // type '' = zona sin asignar todavía; una zona de antes sin tipo se queda como seca, como siempre.
            const type = z && z.type === '' ? '' : oneOf(z && z.type, ZONE_TYPES, 'dry');
            const planM2 = z && z.planM2 != null && z.planM2 !== '' ? meters(z.planM2, label) : 0;
            const use = oneOf(z && z.use, ZONE_USES, '');
            const fmt = sanitizeFmt(z && z.fmt);
            // Categorías de la zona: solo se guardan si hay (una zona de antes sin categorías se guarda exactamente igual).
            const catIds = new Set();
            const categories = list(z && z.categories, LIMITS.categories, `${label}: categorías`).map((c, k) => {
                const cl = `${label}, categoría ${k + 1}`;
                const color = c && typeof c.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color.toLowerCase() : '#5b6272';
                const desc = typeof (c && c.desc) === 'string' ? c.desc.trim() : '';
                if (desc.length > LIMITS.categoryText) errors.push(`${cl}: descripción demasiado larga`);
                return { id: idOf(c && c.id, catIds, cl), name: text(c && c.name, cl, true), desc: desc.slice(0, LIMITS.categoryText), icon: oneOf(c && c.icon, CATEGORY_ICONS, 'tag'), color };
            });
            const extra = { ...(use ? { use } : {}), ...(planM2 > 0 ? { planM2 } : {}), ...(fmt ? { fmt } : {}), ...(categories.length ? { categories } : {}) };
            const active = !(z && z.active === false);
            if (z && z.pts != null) {
                // Zona de cualquier forma: sus esquinas son la verdad; x, y, largo y ancho son el recuadro que la envuelve.
                const pts = list(z.pts, LIMITS.zonePoints, label).map((p, k) => {
                    if (!Array.isArray(p) || p.length !== 2 || !isNum(Number(p[0])) || !isNum(Number(p[1])) || Math.abs(Number(p[0])) > LIMITS.maxM || Math.abs(Number(p[1])) > LIMITS.maxM) { errors.push(`${label}: esquina ${k + 1} no válida`); return [0, 0]; }
                    return [round2(Number(p[0])), round2(Number(p[1]))];
                });
                if (pts.length < 3) errors.push(`${label}: se necesitan al menos 3 esquinas`);
                else if (!(polygonArea(pts) > 0)) errors.push(`${label}: las esquinas no forman una superficie`);
                const px = pts.map((p) => p[0]);
                const py = pts.map((p) => p[1]);
                const x = pts.length ? Math.min(...px) : 0;
                const y = pts.length ? Math.min(...py) : 0;
                return { id, name, type, x: round2(x), y: round2(y), l: round2((pts.length ? Math.max(...px) : 0) - x), w: round2((pts.length ? Math.max(...py) : 0) - y), pts, ...extra, active };
            }
            return {
                id, name, type,
                x: meters(z && z.x, label, -LIMITS.maxM), y: meters(z && z.y, label, -LIMITS.maxM), l: meters(z && z.l, label), w: meters(z && z.w, label), ...extra, active,
            };
        });

        const spaceIds = new Set();
        const codes = new Set();
        out.spaces = list(src.spaces, LIMITS.spaces, 'Espacios').map((s, i) => {
            const label = `Espacio ${i + 1}`;
            const code = text(s && s.code, label, true);
            if (code) {
                const key = code.toLowerCase();
                if (codes.has(key)) errors.push(`${label}: el código "${code}" está repetido`);
                codes.add(key);
            }
            const zoneId = typeof (s && s.zoneId) === 'string' && zoneIds.has(s.zoneId) ? s.zoneId : '';
            const type = oneOf(s && s.type, SPACE_TYPES, 'rack');
            const levels = Math.round(Number(s && s.levels));
            // Espacios por nivel (el hueco dentro de un nivel): solo se guarda si hay más de uno.
            const slots = Math.round(Number(s && s.slots));
            return {
                id: idOf(s && s.id, spaceIds, label), type, code, zoneId,
                x: meters(s && s.x, label, -LIMITS.maxM), y: meters(s && s.y, label, -LIMITS.maxM), l: meters(s && s.l, label), d: meters(s && s.d, label), h: meters(s && s.h, label),
                levels: Number.isFinite(levels) && levels >= 1 && levels <= 50 ? levels : 1,
                ...(Number.isFinite(slots) && slots > 1 ? { slots: Math.min(slots, LIMITS.slots) } : {}),
                drawers: text(s && s.drawers, label, false), active: !(s && s.active === false),
            };
        });

        const plan = src.plan && typeof src.plan === 'object' ? src.plan : null;
        out.plan = plan ? { widthM: meters(plan.widthM, 'Plano', 0.1) } : null;
        return { ok: errors.length === 0, errors, layout: out };
    }

    // Dónde poner el nombre y los m² de una zona para que no lo tape un anaquel: la primera esquina (arriba-izquierda, arriba-derecha, abajo-izquierda,
    // abajo-derecha) cuyo recuadro de texto no toca ningún espacio; si todas lo tocan, la que menos. sc = píxeles por metro del dibujo.
    function zoneLabelSpot(zone, spaces, sc) {
        const w = Math.min(Math.max(((zone.name || '').length * 6.2 + 12) / sc, 54 / sc), zone.l);
        const h = Math.min(30 / sc, zone.w);
        const spots = [
            { right: false, bottom: false, x: zone.x, y: zone.y },
            { right: true, bottom: false, x: zone.x + zone.l - w, y: zone.y },
            { right: false, bottom: true, x: zone.x, y: zone.y + zone.w - h },
            { right: true, bottom: true, x: zone.x + zone.l - w, y: zone.y + zone.w - h },
        ];
        const overlap = (b) => (spaces || []).filter((s) => s.active !== false).reduce((acc, s) => {
            const ox = Math.min(s.x + s.l, b.x + w) - Math.max(s.x, b.x);
            const oy = Math.min(s.y + s.d, b.y + h) - Math.max(s.y, b.y);
            return ox > 0 && oy > 0 ? acc + ox * oy : acc;
        }, 0);
        let best = spots[0];
        let bestOverlap = overlap(best);
        for (const spot of spots.slice(1)) {
            if (bestOverlap === 0) break;
            const o = overlap(spot);
            if (o < bestOverlap) { best = spot; bestOverlap = o; }
        }
        return { right: best.right, bottom: best.bottom };
    }

    // Qué datos tiene cada sección (para saber si "Ver y Operar" todavía puede llenarla).
    // Gira el Layout (SOLO para dibujarlo; lo guardado no cambia) en cuartos de vuelta hacia la derecha: 0, 1 (90°), 2 (180°) o 3 (270°). Se giran las esquinas, las zonas (con sus
    // esquinas si son de forma libre), los espacios y las columnas; las puertas y las conexiones de luz van por número de pared, así que siguen a su pared solas. Los textos del
    // dibujo no se giran: se vuelven a poner derechos sobre la figura ya girada.
    function rotateLayout(layout, quarters) {
        const q = ((Math.round(Number(quarters)) % 4) + 4) % 4;
        if (!q || !layout) return layout;
        const pt = (x, y) => (q === 1 ? [-y, x] : (q === 2 ? [-x, -y] : [y, -x]));
        const box = (o, lKey, wKey) => {
            const a = pt(o.x, o.y);
            const b = pt(o.x + o[lKey], o.y + o[wKey]);
            return { x: round2(Math.min(a[0], b[0])), y: round2(Math.min(a[1], b[1])), [lKey]: round2(Math.abs(b[0] - a[0])), [wKey]: round2(Math.abs(b[1] - a[1])) };
        };
        const turn = (p) => { const r = pt(p[0], p[1]); return [round2(r[0]), round2(r[1])]; };
        return {
            ...layout,
            vertices: (layout.vertices || []).map((p) => [...turn(p), p[2]]),
            obstacles: (layout.obstacles || []).map((o) => ({ ...o, ...box(o, 'l', 'w') })),
            spaces: (layout.spaces || []).map((s) => ({ ...s, ...box(s, 'l', 'd') })),
            zones: (layout.zones || []).map((z) => {
                if (Array.isArray(z.pts)) {
                    const pts = z.pts.map(turn);
                    const xs = pts.map((p) => p[0]);
                    const ys = pts.map((p) => p[1]);
                    const x = Math.min(...xs);
                    const y = Math.min(...ys);
                    return { ...z, pts, x, y, l: round2(Math.max(...xs) - x), w: round2(Math.max(...ys) - y) };
                }
                return { ...z, ...box(z, 'l', 'w') };
            }),
        };
    }

    function sectionData(layout, section) {
        if (!layout) return null;
        if (section === 'contorno') return { vertices: layout.vertices, obstacles: layout.obstacles, siteName: layout.siteName || '' };
        if (section === 'puertas') return layout.doors;
        if (section === 'luz') return layout.power;
        if (section === 'zonas') return layout.zones;
        if (section === 'espacios') return layout.spaces;
        return null;
    }
    function sectionHasData(layout, section) {
        const data = sectionData(layout, section);
        if (!data) return false;
        if (section === 'contorno') return (data.vertices || []).length > 0;
        return (data || []).length > 0;
    }

    return {
        ZONE_TYPES, STORAGE_ZONE_TYPES, ZONE_USES, SPACE_TYPES, DOOR_TYPES, POWER_TYPES, SECTIONS, LIMITS,
        polygonArea, wallSegment, perimeter, emptyLayout, computeKpis, metricRows, METRIC_KEYS, sanitizeLayout, sectionData, sectionHasData, rotateLayout,
        normalize, heightRange, volumeOf, triangulate, zoneLabelSpot, coveredArea,
        FMT_PATTERNS, FMT_LINES, CATEGORY_ICONS, CATEGORY_COLORS, categoryLook, sanitizeFmt, zonePoints, zoneArea, hasPoints, pointInPolygon, onPolygonEdge, zoneOutsideNave, zoneLabelAnchor, walkSides, pointsFromSides, sidesFromPoints, closingSides, closingLine, sideOf, sideMeasures, DIR_ANGLE,
    };
}));
