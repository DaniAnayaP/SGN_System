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
    // Los pasillos ya no son un tipo de zona: viven en el paso Tránsito. Los dos tipos viejos se siguen leyendo (una zona de pasillo con forma libre se queda como estaba) pero ya no se ofrecen al elegir el tipo de una zona.
    const ZONE_TYPES_CHOOSABLE = ['dry', 'cold', 'chemical', 'finished', 'dock', 'office'];
    // Zonas donde se almacena producto (las demás son andenes, oficinas o pasillos).
    const STORAGE_ZONE_TYPES = ['dry', 'cold', 'chemical', 'finished'];
    // Para qué se usa una zona (es aparte del tipo: una zona Seca puede ser de almacenamiento o de operaciones): almacenamiento, operaciones o instalaciones (baño, bombas, etc.).
    // Es opcional: una zona sin uso definido se guarda exactamente igual que antes.
    const ZONE_USES = ['storage', 'operations', 'facilities'];
    const SPACE_TYPES = ['rack', 'rackpal', 'cabinet', 'pallet', 'cold'];
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
    // Cómo abre una puerta: batiente (gira sobre su bisagra), corrediza (corre pegada a la pared) o fija (no abre). hinge = de qué extremo de la puerta está la bisagra o hacia dónde corre (inicio o final de la pared); dir = hacia qué
    // lado de la pared abre o corre (adentro o afuera). Una puerta sin estos datos (las de antes) cuenta como fija: no dibuja ni ocupa espacio al abrir.
    const DOOR_OPENS = ['swing', 'slide', 'fixed'];
    // Pisos (desniveles): un PISO es un rectángulo del croquis (x, y, largo, ancho) que está más alto o más bajo que el piso de la nave (lvl, en metros; 0 = a nivel). Una rampa lleva además el nivel de su parte alta (lvl2) y hacia
    // qué lado del croquis sube (rise): lvl es el nivel del lado bajo y lvl2 el del lado alto. Los pisos son independientes de las zonas (una zona puede tocar varios pisos sin partirse): lo que está sobre un piso (huellas,
    // activos, pasillos…) queda a su nivel, el que tiene el piso en el punto donde está. Antes el nivel vivía dentro de cada zona (lvl, lvl2, rise): migrateFloors lo pasa a un piso con el recuadro de esa zona.
    const ZONE_RISES = ['up', 'down', 'left', 'right'];
    const DOOR_ENDS = ['start', 'end'];
    const DOOR_SIDES = ['in', 'out'];
    const SLIDE_DEPTH = 0.12;
    const POWER_TYPES = ['panel', 'outlet110', 'outlet220', 'three-phase'];
    // Sensores de temperatura y humedad: de las dos (both), solo temperatura (temp) o solo humedad (hum).
    const SENSOR_TYPES = ['both', 'temp', 'hum'];
    // Lo que un activo puede traer de su propio lugar y medidas dentro de su huella (todo opcional): ox, oy = distancia desde la esquina de la huella (m); ol, od, oh = largo (lo que ocupa a lo ancho del dibujo, eje x), fondo (eje y) y alto (m).
    const OWN_SPACE_KEYS = ['ox', 'oy', 'ol', 'od', 'oh'];
    // Cada sección del Layout cuelga de una columna del árbol de accesos (ver menu.json, colLayout*).
    const SECTIONS = {
        contorno: 'colLayoutContorno',
        paredes: 'colLayoutParedes',
        obstaculos: 'colLayoutObstaculos',
        puertas: 'colLayoutPuertas',
        zonas: 'colLayoutZonas',
        pisos: 'colLayoutPisos',
        rampas: 'colLayoutRampas',
        espacios: 'colLayoutEspacios',
        luz: 'colLayoutLuz',
        sensores: 'colLayoutSensores',
        transito: 'colLayoutTransito',
        objetos: 'colLayoutObjetos',
        seguridad: 'colLayoutSeguridad',
        activos: 'colLayoutActivos',
        posiciones: 'colLayoutPosiciones',
        niveles: 'colLayoutNiveles',
        ubicaciones: 'colLayoutUbicaciones', // el paso «Posiciones» (lugares libres dentro de cada espacio); `posiciones` es el paso «Espacios»
    };
    const LIMITS = { vertices: 60, doors: 100, power: 300, sensors: 300, obstacles: 300, transit: 300, objects: 500, safety: 500, zones: 150, floors: 100, ramps: 100, zonePoints: 60, categories: 20, categoryText: 120, positions: 5000, slots: 100, depth: 100, spaces: 5000, text: 80, maxM: 5000, maxHeight: 100 };

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
        const normalized = applyTransitCatalog(assignTransitCodes(deriveTransitZones(assignSensorCodes(deriveSensorZones(assignSpaceCodes(deriveSpaces(assignHuellaCodes(deriveFootprintZones(assignZoneCodes(migrateFootprints(migrateTransit(migrateDoors(migrateWalls(migrateFloors({ ...layout, sensors: Array.isArray(layout.sensors) ? layout.sensors : [], objects: Array.isArray(layout.objects) ? layout.objects : [], safety: Array.isArray(layout.safety) ? layout.safety : [], vertices, heightM: round2(meanHeight(vertices)) })))))))))))))));
        // Seguridad: la zona de cada elemento sale de su lugar y su código (E001…) lo pone el sistema.
        // Todo espacio tiene al menos una posición: las que no están guardadas (los Layouts de antes, con sus filas y profundidades) se generan aquí, siempre iguales (ensurePositions)
        return dropBayHeights(ensurePositions(assignItemCodes(assignRampCodes(assignFloorCodes(assignWallCodes(assignSafetyCodes(deriveSafetyZones(normalized))))))));
    }
    // Los Layouts de antes guardaban en algunos huecos (espacios) su propia altura del piso y su propia ceja, de cuando se capturaban por espacio: el 3D y las hojas dibujaban ese espacio más arriba que los demás de su nivel.
    // La altura del piso y la ceja son del NIVEL (paso Niveles), así que al leer el Layout se quitan de los huecos (lo demás del hueco, como su largo, ancho, alto y caras, se queda).
    function dropBayHeights(layout) {
        const stale = (b) => b && (b.floorH !== undefined || b.beam !== undefined);
        if (!layout || !Array.isArray(layout.spaces) || !layout.spaces.some((s) => s && Array.isArray(s.bays) && s.bays.some(stale))) return layout;
        return { ...layout, spaces: layout.spaces.map((s) => {
            if (!s || !Array.isArray(s.bays) || !s.bays.some(stale)) return s;
            const bays = s.bays.map((b) => { if (!stale(b)) return b; const { floorH, beam, ...rest } = b; return rest; }).filter((b) => Object.keys(b).length > 2);
            if (bays.length) return { ...s, bays };
            const { bays: dropped, ...others } = s;
            return others;
        }) };
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

    // ---- obstáculos del contorno: paredes, columnas, desniveles y otros --------------------------------------------------
    // El contorno por sí solo NUNCA es pared: es el marco del terreno. Toda pared (también la de un lado del contorno) es un obstáculo de tipo «pared» puesto encima, igual que el activo sobre su huella.
    // Cada obstáculo tiene un TIPO (kind) y se pone de una de dos formas (mode): «Sobre el contorno» (contour), pegado a un lado de la nave (wall = número del lado, dist = a cuántos metros de la esquina de inicio,
    // l = largo a lo largo del lado, 0 = hasta el final del lado, y w = grosor hacia adentro), o «Dentro de la nave» (free), con x, y, l y w. El desnivel (step) lleva además dz: su altura sobre el piso, en metros (negativa si es más bajo).
    const OBSTACLE_KINDS = ['wall', 'column', 'step', 'other'];
    const OBSTACLE_MODES = ['contour', 'free'];
    const WALL_THICKNESS = 0.2; // grosor de una pared nueva, en metros
    const signedArea = (verts) => {
        let s = 0;
        for (let i = 0; i < verts.length; i++) { const p = verts[i]; const q = verts[(i + 1) % verts.length]; s += p[0] * q[1] - q[0] * p[1]; }
        return s;
    };
    // Dónde queda un obstáculo, en metros: sus 4 esquinas y el recuadro que lo envuelve ({ pts, x, y, l, w }); null si no se puede ubicar (lado que no existe).
    function obstacleGeometry(o, vertices) {
        if (!o) return null;
        let pts;
        if (o.mode === 'contour') {
            const verts = Array.isArray(vertices) ? vertices : [];
            if (verts.length < 3) return null;
            const seg = wallSegment(verts, Math.max(1, Math.round(Number(o.wall)) || 1));
            if (!(seg.length > 0)) return null;
            const dist = Math.min(Math.max(Number(o.dist) || 0, 0), seg.length);
            const rest = seg.length - dist;
            const len = Number(o.l) > 0 ? Math.min(Number(o.l), rest) : rest;
            const thick = Math.max(Number(o.w) || 0, 0);
            // hacia adentro de la nave: a la izquierda del sentido del lado si el contorno va contra las manecillas, a la derecha si va a favor
            const sign = signedArea(verts) >= 0 ? 1 : -1;
            const nx = -seg.uy * sign;
            const ny = seg.ux * sign;
            const ax = seg.p[0] + seg.ux * dist;
            const ay = seg.p[1] + seg.uy * dist;
            const bx = ax + seg.ux * len;
            const by = ay + seg.uy * len;
            pts = [[ax, ay], [bx, by], [bx + nx * thick, by + ny * thick], [ax + nx * thick, ay + ny * thick]];
        } else {
            const x = Number(o.x) || 0;
            const y = Number(o.y) || 0;
            const l = Math.max(Number(o.l) || 0, 0);
            const w = Math.max(Number(o.w) || 0, 0);
            pts = [[x, y], [x + l, y], [x + l, y + w], [x, y + w]];
        }
        pts = pts.map((p) => [round2(p[0]), round2(p[1])]);
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        return { pts, x, y, l: round2(Math.max(...xs) - x), w: round2(Math.max(...ys) - y) };
    }
    // Los obstáculos del Layout con su lugar ya calculado: [{ o, g }] (los que no se pueden ubicar se omiten).
    function obstacleShapes(layout) {
        return ((layout && layout.obstacles) || []).map((o) => ({ o, g: obstacleGeometry(o, layout.vertices) })).filter((r) => r.g);
    }
    // ---- Obstáculos con altura propia ---------------------------------------------------------------------------------------------------------------
    // Una columna u otro obstáculo puede traer su altura del piso (elev: qué tan despegado está del piso que tiene abajo) y su alto (h). Sin ellas va del piso al techo; solo con la altura del piso va de ahí al techo; con el alto
    // llega hasta altura del piso + alto, que no puede pasar del techo (el más bajo debajo de su recuadro). Lo que ya estaba mal antes solo se marca; lo NUEVO o lo que cambió no se deja guardar (ver newObstacleViolations).
    function obstacleViolations(layout) {
        const out = [];
        if (!layout || !Array.isArray(layout.obstacles)) return out;
        obstacleShapes(layout).forEach(({ o, g }) => {
            if ((o.kind !== 'column' && o.kind !== 'other') || !g || !Array.isArray(g.pts) || g.pts.length < 3) return;
            const elev = Number(o.elev) > 0 ? Number(o.elev) : 0;
            const h = Number(o.h) > 0 ? Number(o.h) : 0;
            if (!elev && !h) return;
            const xs = g.pts.map((p) => p[0]); const ys = g.pts.map((p) => p[1]);
            const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
            const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
            const limits = [[cx, cy], [x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => naveHeightAt(layout, x, y)).filter((v) => v > 0);
            if (!limits.length) return;
            const limit = round2(Math.min(...limits));
            const lvl = round2(floorLevelAt(layout, cx, cy));
            const base = round2(lvl + elev);
            const name = String(o.name || 'Obstáculo');
            const sig = JSON.stringify([o.mode, o.x, o.y, o.wall, o.dist, o.l, o.w, elev, h, lvl, limit]);
            if (h && round2(base + h) > limit + 0.005) {
                out.push({ id: o.id, name, kind: 'tall', sig, vars: { name, top: round2(base + h), height: limit }, message: `El obstáculo «${name}» llega a ${round2(base + h)} m (altura del piso + alto) y la nave ahí solo mide ${limit} m de alto: bájalo o hazlo más bajo.` });
            } else if (!h && base >= limit - 0.005) {
                out.push({ id: o.id, name, kind: 'high', sig, vars: { name, top: base, height: limit }, message: `El obstáculo «${name}» queda a ${base} m del piso y la nave ahí solo mide ${limit} m de alto: bájalo.` });
            }
        });
        return out;
    }
    const obstacleKey = (v) => `${v.id}|${v.kind}|${v.sig}`;
    function newObstacleViolations(next, previous) {
        const before = new Set((previous ? obstacleViolations(previous) : []).map(obstacleKey));
        return obstacleViolations(next).filter((v) => !before.has(obstacleKey(v)));
    }
    // ---- Zonas que no se enciman --------------------------------------------------------------------------------------------------------------------
    // Cada metro de la nave es de UNA zona: dos zonas (rectángulos o formas libres) no pueden encimarse; que se toquen en la orilla sí. Mira las zonas activas con tipo y ya dibujadas (las demás no cubren piso, igual que en los KPIs).
    // Lo que ya estaba encimado antes de esta regla solo se marca; lo NUEVO o lo que cambió (una de las dos zonas) no se deja guardar (ver newZoneOverlapViolations).
    const ZONE_OVERLAP_MIN = 0.01; // m² que se tolera (por redondeos al capturar)
    // Recorta un polígono con un polígono CONVEXO (Sutherland–Hodgman): el pedazo que queda adentro de clip. Los dos con las esquinas en el mismo sentido.
    function convexClip(subject, clip) {
        let output = subject;
        for (let i = 0; i < clip.length && output.length; i++) {
            const a = clip[i]; const b2 = clip[(i + 1) % clip.length];
            const side = (p) => (b2[0] - a[0]) * (p[1] - a[1]) - (b2[1] - a[1]) * (p[0] - a[0]);
            const input = output;
            output = [];
            for (let j = 0; j < input.length; j++) {
                const p = input[j]; const q = input[(j + 1) % input.length];
                const sp = side(p); const sq = side(q);
                if (sp >= 0) output.push(p);
                if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
            }
        }
        return output;
    }
    // Los m² que dos polígonos (cualquier forma sin cruzarse a sí misma) tienen en común: cada uno se parte en triángulos y se suman los pedazos de cada par.
    function polygonOverlapArea(a, b2) {
        const bb = (pts) => ({ x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) });
        const A = bb(a); const B = bb(b2);
        if (A.x1 <= B.x0 || B.x1 <= A.x0 || A.y1 <= B.y0 || B.y1 <= A.y0) return 0;
        const triangles = (pts) => { const t = triangulate(pts); return t ? t.map(([i, j, k]) => [pts[i], pts[j], pts[k]]) : [pts]; };
        const ccw = (poly) => (signedArea(poly) < 0 ? poly.slice().reverse() : poly);
        const ta = triangles(a).map(ccw); const tb = triangles(b2).map(ccw);
        let area = 0;
        ta.forEach((x) => tb.forEach((y) => { const c = convexClip(x, y); if (c.length >= 3) area += polygonArea(c); }));
        return area;
    }
    function zoneOverlapViolations(layout) {
        const out = [];
        const zs = ((layout && layout.zones) || []).filter((z) => z && z.active !== false && z.type && zonePoints(z).length >= 3);
        for (let i = 0; i < zs.length; i++) {
            for (let j = i + 1; j < zs.length; j++) {
                const a = zs[i]; const b2 = zs[j];
                const area = !hasPoints(a) && !hasPoints(b2) ? rectShared(a, b2) : polygonOverlapArea(zonePoints(a), zonePoints(b2));
                if (!(area > ZONE_OVERLAP_MIN)) continue;
                const la = `${a.code ? `${a.code} ` : ''}${a.name || ''}`.trim() || 'Zona';
                const lb = `${b2.code ? `${b2.code} ` : ''}${b2.name || ''}`.trim() || 'Zona';
                out.push({ id: a.id, otherId: b2.id, kind: 'overlap', section: 'zonas', area: round2(area), a: la, b: lb, codeA: a.code || a.name || '', codeB: b2.code || b2.name || '',
                    sig: JSON.stringify([zonePoints(a), zonePoints(b2)]),
                    message: `Las zonas ${la} y ${lb} se enciman (${round2(area)} m²): no es posible, acomoda una de las dos o cambia sus medidas para que quede cada una aparte.` });
            }
        }
        return out;
    }
    const zoneOverlapKey = (v) => `${v.id}|${v.otherId}|${v.sig}`;
    // Las faltas que hay en next y que antes no estaban igual: una zona nueva, o que se movió o cambió de medidas y se enciman. Esas no se dejan guardar.
    function newZoneOverlapViolations(next, previous) {
        const before = new Set((previous ? zoneOverlapViolations(previous) : []).map(zoneOverlapKey));
        return zoneOverlapViolations(next).filter((v) => !before.has(zoneOverlapKey(v)));
    }
    // ---- Obstáculos y objetos dentro del contorno ---------------------------------------------------------------------------------------------------
    // Nada sale de la nave: una columna, un desnivel, otro obstáculo (en cualquier forma de ponerlos) y una pared libre (la que se pone «Dentro de la nave», no las que van sobre el contorno) tienen que caber ENTEROS adentro; pegados a la
    // pared de la nave cuentan como adentro. Lo que ya estaba afuera antes de esta regla solo se marca; lo NUEVO o lo que cambió (el obstáculo o el contorno) no se deja guardar (ver newObstacleInsideViolations). section = el paso donde se arregla.
    const OBSTACLE_WORDS = { wall: ['La pared', 'Pared', 'acomódala'], column: ['La columna', 'Columna', 'acomódala'], step: ['El desnivel', 'Desnivel', 'acomódalo'], other: ['El obstáculo', 'Obstáculo', 'acomódalo'] };
    function obstacleInsideViolations(layout) {
        const out = [];
        const nave = Array.isArray(layout && layout.vertices) ? layout.vertices.map((p) => [Number(p[0]), Number(p[1])]) : [];
        if (nave.length < 3 || !Array.isArray(layout.obstacles)) return out;
        layout.obstacles.forEach((o) => {
            if (!o) return;
            const isWall = o.kind === 'wall';
            if (isWall && o.mode === 'contour') return; // las paredes sobre el contorno SON el marco
            const g = obstacleGeometry(o, layout.vertices);
            if (!g || !(g.l > 0 && g.w > 0) || !Array.isArray(g.pts) || g.pts.length < 3) return;
            if (!zoneOutsideNave(nave, { pts: g.pts })) return;
            const what = OBSTACLE_WORDS[o.kind] ? o.kind : 'other';
            const [article, fallback, fix] = OBSTACLE_WORDS[what];
            const name = String(o.name || fallback);
            out.push({ id: o.id, name, kind: 'outside', what, section: isWall ? 'paredes' : 'obstaculos', sig: JSON.stringify([o.mode, g.pts, nave]),
                message: `${article} «${name}» sale del contorno de la nave: no es posible, ${fix} o cambia sus medidas para que quede adentro.` });
        });
        return out;
    }
    const obstacleInsideKey = (v) => `${v.id}|${v.kind}|${v.sig}`;
    // Las faltas que hay en next y que antes no estaban igual: un obstáculo nuevo, que se movió o cambió de medidas, o con el contorno cambiado. Esas no se dejan guardar.
    function newObstacleInsideViolations(next, previous) {
        const before = new Set((previous ? obstacleInsideViolations(previous) : []).map(obstacleInsideKey));
        return obstacleInsideViolations(next).filter((v) => !before.has(obstacleInsideKey(v)));
    }
    // Los objetos (personas, montacargas, cajas) también van dentro de la nave: lo que ocupa cada uno es su largo × su ancho, girado su ángulo alrededor de su centro (como se dibuja en el croquis). Lo que ya estaba afuera solo se marca;
    // lo NUEVO o lo que cambió no se deja guardar (ver newObjectInsideViolations).
    function objectInsideViolations(layout) {
        const out = [];
        const nave = Array.isArray(layout && layout.vertices) ? layout.vertices.map((p) => [Number(p[0]), Number(p[1])]) : [];
        if (nave.length < 3 || !Array.isArray(layout.objects)) return out;
        layout.objects.forEach((o) => {
            const l = Number(o && o.l) || 0; const w = Number(o && o.w) || 0;
            if (!(l > 0 && w > 0)) return;
            const a = ((Number(o.angle) || 0) * Math.PI) / 180;
            const cos = Math.cos(a); const sin = Math.sin(a);
            const cx = Number(o.x) || 0; const cy = Number(o.y) || 0;
            const pts = [[-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2]].map(([px, py]) => [round2(cx + px * cos - py * sin), round2(cy + px * sin + py * cos)]);
            if (!zoneOutsideNave(nave, { pts })) return;
            const name = String(o.name || 'Objeto');
            out.push({ id: o.id, name, kind: 'outside', section: 'objetos', sig: JSON.stringify([o.x, o.y, o.angle, l, w, nave]),
                message: `El objeto «${name}» sale del contorno de la nave: no es posible, acomódalo o cambia su lugar para que quede adentro.` });
        });
        return out;
    }
    const objectInsideKey = (v) => `${v.id}|${v.kind}|${v.sig}`;
    function newObjectInsideViolations(next, previous) {
        const before = new Set((previous ? objectInsideViolations(previous) : []).map(objectInsideKey));
        return objectInsideViolations(next).filter((v) => !before.has(objectInsideKey(v)));
    }
    // Una pared por cada lado del contorno, de todo el lado (l 0): así un Layout de antes se ve igual y la pared se quita en los lados que solo son marco.
    function defaultWalls(vertices) {
        return (vertices || []).map((_, i) => ({ id: `wl${i + 1}`, name: `Pared ${i + 1}`, kind: 'wall', mode: 'contour', wall: i + 1, dist: 0, l: 0, w: WALL_THICKNESS }));
    }
    // Los Layouts de antes dibujaban todo el contorno como pared y sus obstáculos eran columnas sueltas: al leerlos, cada lado se vuelve un obstáculo pared (una sola vez, wallsMigrated) y cada obstáculo viejo queda
    // como columna dentro de la nave.
    function migrateWalls(layout) {
        // lo que no es una lista (entrada dañada) se deja como llegó: la validación lo reporta
        if (!layout || (layout.obstacles != null && !Array.isArray(layout.obstacles))) return layout;
        const obstacles = (layout.obstacles || []).map((raw) => {
            const o = raw && typeof raw === 'object' ? raw : {};
            return { ...o, kind: OBSTACLE_KINDS.includes(o.kind) ? o.kind : 'column', mode: o.mode === 'contour' ? 'contour' : 'free' };
        });
        if (layout.wallsMigrated) return { ...layout, obstacles };
        const taken = new Set(obstacles.map((o) => o.id));
        return { ...layout, obstacles: [...defaultWalls(Array.isArray(layout.vertices) ? layout.vertices : []).filter((w) => !taken.has(w.id)), ...obstacles], wallsMigrated: true };
    }
    // ---- Puertas sobre paredes ---------------------------------------------------------------------------------------------------------------
    // Una puerta SIEMPRE va sobre una pared: se elige cuál (wallId = el id de un obstáculo de tipo pared) y se mide desde el INICIO de esa pared: dist = a cuántos metros del inicio empieza, width = ancho y height = alto. La
    // pared dice cuánto mide (su largo) y qué tan alta es, y la puerta no puede pasarse de ninguna de las dos. En una pared sobre el contorno el inicio es donde empieza (la esquina de su lado más su distancia); en una de
    // dentro de la nave es su extremo de arriba o de la izquierda. Una puerta de antes (sin wallId, con el número de lado) pasa sola a la pared que la cubre (migrateDoors).
    const cornerHeightAt = (layout, i) => { const v = ((layout && layout.vertices) || [])[i]; const h = Number(v && v[2]); return h > 0 ? h : (Number(layout && layout.heightM) > 0 ? Number(layout.heightM) : 0); };
    // El eje de una pared (por el centro de su grosor): dónde empieza, hacia dónde va, cuánto mide, qué tan gruesa y qué tan alta es; null si no se puede ubicar.
    // Las alturas de una pared: la del inicio (hStart) y la del final (hEnd); height es su promedio y heightAt(d) la que tiene a d metros del inicio. La pared puede traer las suyas (h = al inicio, h2 = al final):
    // con solo la del inicio, toda la pared va igual de alta; sin ninguna, valen las de fábrica que se le pasan (defStart, defEnd).
    function wallHeights(o, length, defStart, defEnd) {
        const own1 = Number(o && o.h);
        const own2 = Number(o && o.h2);
        const hStart = own1 > 0 ? own1 : defStart;
        const hEnd = own2 > 0 ? own2 : (own1 > 0 ? own1 : defEnd);
        const heightAt = (d) => hStart + (hEnd - hStart) * (length > 0 ? Math.min(Math.max(d / length, 0), 1) : 0);
        return { height: (hStart + hEnd) / 2, hStart, hEnd, heightAt };
    }
    function wallAxis(layout, o) {
        if (!o) return null;
        const verts = (layout && layout.vertices) || [];
        if (o.mode === 'contour') {
            if (verts.length < 3) return null;
            const side = Math.max(1, Math.round(Number(o.wall)) || 1);
            const seg = wallSegment(verts, side);
            if (!(seg.length > 0)) return null;
            const dist = Math.min(Math.max(Number(o.dist) || 0, 0), seg.length);
            const rest = seg.length - dist;
            const len = Number(o.l) > 0 ? Math.min(Number(o.l), rest) : rest;
            const thick = Math.max(Number(o.w) || 0, 0);
            const sign = signedArea(verts) >= 0 ? 1 : -1;
            const nx = -seg.uy * sign;
            const ny = seg.ux * sign;
            const n = verts.length;
            // de fábrica la pared sigue la altura del contorno: en cada extremo, la que tiene el lado en ese punto (de una esquina a la otra del lado)
            const ha = cornerHeightAt(layout, (side - 1) % n);
            const hb = cornerHeightAt(layout, side % n);
            const along = (m) => ha + (hb - ha) * (seg.length > 0 ? Math.min(Math.max(m / seg.length, 0), 1) : 0);
            return { x: seg.p[0] + seg.ux * dist + nx * thick / 2, y: seg.p[1] + seg.uy * dist + ny * thick / 2, ux: seg.ux, uy: seg.uy, nx, ny, length: len, thick, ...wallHeights(o, len, along(dist), along(dist + len)) };
        }
        const x = Number(o.x) || 0;
        const y = Number(o.y) || 0;
        const l = Math.max(Number(o.l) || 0, 0);
        const w = Math.max(Number(o.w) || 0, 0);
        const avg = verts.length ? verts.reduce((acc, _, i) => acc + cornerHeightAt(layout, i), 0) / verts.length : 0;
        // en una pared de adentro de la nave, «adentro» es el lado de abajo del croquis (o el de la izquierda si la pared es vertical): a la izquierda de su sentido, igual que en las del contorno
        return l >= w ? { x, y: y + w / 2, ux: 1, uy: 0, nx: 0, ny: 1, length: l, thick: w, ...wallHeights(o, l, avg, avg) } : { x: x + l / 2, y, ux: 0, uy: 1, nx: -1, ny: 0, length: w, thick: l, ...wallHeights(o, w, avg, avg) };
    }
    // Dónde queda una puerta: sus dos extremos (a y b, en metros, por el centro de la pared), hacia dónde va la pared, su grosor y lo que mide y de alto la pared; wall = la pared (o null si es una puerta de antes que todavía
    // no está en una, que se ubica sobre el lado del contorno como se hacía: legacy). null si no se puede ubicar. Un Layout girado (rotateLayout) trae la puerta ya girada en door._seg.
    function doorGeometry(layout, door) {
        if (!door) return null;
        if (door._seg) return door._seg;
        const dist = Math.max(Number(door.dist) || 0, 0);
        const width = Math.max(Number(door.width) || 0, 0);
        const wall = door.wallId ? ((layout && layout.obstacles) || []).find((o) => o && o.id === door.wallId && o.kind === 'wall') : null;
        if (wall) {
            const ax = wallAxis(layout, wall);
            if (!ax) return null;
            const a = { x: ax.x + ax.ux * dist, y: ax.y + ax.uy * dist };
            return { a, b: { x: a.x + ax.ux * width, y: a.y + ax.uy * width }, ux: ax.ux, uy: ax.uy, nx: ax.nx, ny: ax.ny, thick: ax.thick, wallLength: ax.length, ...fittingOnWall(layout, wall, ax, dist, width), wallHeightStart: ax.hStart, wallHeightEnd: ax.hEnd, wall, legacy: false };
        }
        const verts = (layout && layout.vertices) || [];
        const side = Math.round(Number(door.wall));
        if (!(side >= 1) || verts.length < 3) return null;
        const seg = wallSegment(verts, side);
        if (!(seg.length > 0)) return null;
        const a = { x: seg.p[0] + seg.ux * dist, y: seg.p[1] + seg.uy * dist };
        const n = verts.length;
        return { a, b: { x: a.x + seg.ux * width, y: a.y + seg.uy * width }, ux: seg.ux, uy: seg.uy, nx: 0, ny: 0, thick: 0, wallLength: seg.length, wallHeight: (cornerHeightAt(layout, (side - 1) % n) + cornerHeightAt(layout, side % n)) / 2, base: 0, wall: null, legacy: true };
    }
    // ---- Pared compartida: una altura por lado -----------------------------------------------------------------------------------------------------------------
    // Una pared tiene dos lados: el A (hacia adentro de la nave en una pared del contorno; hacia abajo del croquis, o a la izquierda si es vertical, en una pared de adentro) y el B (el opuesto). Cada lado puede traer su altura:
    // A con h al inicio y h2 al final, B con hb y hb2, y cada una se mide DESDE EL PISO DE SU LADO (si el piso de ese lado está más alto, el remate sube con él: la altura se pide de piso a techo y un desnivel nunca la recorta).
    // Sin altura propia, el lado A mide lo que mide el techo en ese punto (del piso de su lado hacia arriba) y, si el lado B no trae la suya, mide lo mismo que el A desde SU piso.
    const wallProbe = (ax, d, side) => {
        const off = (ax.thick || 0) / 2 + 0.15;
        return [ax.x + ax.ux * d + side * (ax.nx || 0) * off, ax.y + ax.uy * d + side * (ax.ny || 0) * off];
    };
    function wallSides(layout, o, axis) {
        const ax = axis || wallAxis(layout, o);
        if (!ax) return null;
        const leveled = floorsOf(layout).length > 0;
        const floorAt = (d, side) => (leveled ? floorLevelAt(layout, ...wallProbe(ax, d, side)) : 0);
        const own = (v) => { const n = Number(v); return n > 0 ? n : 0; };
        const fA0 = floorAt(0, 1); const fA1 = floorAt(ax.length, 1); const fB0 = floorAt(0, -1); const fB1 = floorAt(ax.length, -1);
        const a1 = own(o && o.h); const a2 = own(o && o.h2); const b1 = own(o && o.hb); const b2 = own(o && o.hb2);
        // lo que mide cada lado (de su piso hacia arriba) y su remate (el piso más lo que mide)
        const cA0 = a1 || ax.hStart;
        const cA1 = a2 || (a1 || ax.hEnd);
        const cB0 = b1 || cA0;
        const cB1 = b2 || (b1 || cA1);
        const tA0 = fA0 + cA0; const tA1 = fA1 + cA1; const tB0 = fB0 + cB0; const tB1 = fB1 + cB1;
        const side = (f0, f1, t0, t1) => {
            const h0 = t0 - f0; const h1 = t1 - f1;
            return { floor0: f0, floor1: f1, top0: t0, top1: t1, h0, h1, heightAt: (d) => h0 + (h1 - h0) * (ax.length > 0 ? Math.min(Math.max(d / ax.length, 0), 1) : 0) };
        };
        return { a: side(fA0, fA1, tA0, tA1), b: side(fB0, fB1, tB0, tB1), stepped: Math.abs(tA0 - tB0) > 0.005 || Math.abs(tA1 - tB1) > 0.005 };
    }
    // Lo que va sobre una pared (puerta, conexión de luz, sensor) se mide desde el piso MÁS ALTO de los dos lados de la pared en el tramo que ocupa (con rampa, el punto más alto del tramo): ahí queda el umbral de una puerta
    // (del otro lado queda un escalón) y desde ahí cuenta la altura de una conexión o un sensor. base = ese nivel (0 si no hay pisos) y wallHeight = lo que cabe de la base hacia arriba: hasta el remate MÁS BAJO de los dos
    // lados en ese tramo. Con los dos lados sobre el mismo nivel (o sin pisos) es lo de siempre: lo que mide la pared desde su piso.
    function fittingOnWall(layout, wall, ax, dist, width) {
        const sd = wallSides(layout, wall, ax);
        const leveled = floorsOf(layout).length > 0;
        const ds = [dist, dist + width / 2, dist + width];
        const base = leveled ? round2(Math.max(...ds.flatMap((d) => [floorLevelAt(layout, ...wallProbe(ax, d, 1)), floorLevelAt(layout, ...wallProbe(ax, d, -1))]))) : 0;
        const topAt = (s, d) => s.top0 + (s.top1 - s.top0) * (ax.length > 0 ? Math.min(Math.max(d / ax.length, 0), 1) : 0);
        const minTop = Math.min(topAt(sd.a, dist), topAt(sd.a, dist + width), topAt(sd.b, dist), topAt(sd.b, dist + width));
        return { base, wallHeight: minTop - base };
    }
    // La marca de una pared con dos alturas en el croquis: solo si sus dos lados difieren (en altura o por estar sobre pisos distintos). Trae las dos tiras a lo largo (a = lado A, b = lado B, cada una de la mitad del grueso), cuál es la
    // oscura (la del remate más alto), la etiqueta («A 5.0 m · B 3.0 m»; «A 5.0→4.0 m» si cambia de inicio a final; «(+0.33)» = lo que está más alto el piso del lado B) y un punto de la etiqueta (a 3/10 del largo, para no quedar encima de las medidas de los lados de las zonas, que van a la mitad) con la normal del lado A. Se calcula sobre el Layout SIN
    // girar y se gira después (quarters), porque el lado A y el B de una pared de adentro dependen de cómo está puesta; null si no hay marca.
    function wallMark(layout, o, quarters) {
        if (!o || o.kind !== 'wall') return null;
        const ax = wallAxis(layout, o);
        if (!ax || !(ax.length > 0) || !(ax.thick > 0)) return null;
        const sd = wallSides(layout, o, ax);
        if (!sd || !sd.stepped) return null;
        const q = ((Math.round(Number(quarters) || 0) % 4) + 4) % 4;
        const turn = (x, y) => (q === 1 ? [-y, x] : (q === 2 ? [-x, -y] : (q === 3 ? [y, -x] : [x, y])));
        const half = ax.thick / 2;
        const at = (d, off) => turn(ax.x + ax.ux * d + ax.nx * off, ax.y + ax.uy * d + ax.ny * off);
        const strip = (o0, o1) => [at(0, o0), at(ax.length, o0), at(ax.length, o1), at(0, o1)];
        const num = (v) => { const r = Math.round(v * 100) / 100; return Math.abs(r * 10 - Math.round(r * 10)) < 1e-9 ? r.toFixed(1) : String(r); };
        const seg = (side) => (Math.abs(side.h0 - side.h1) < 0.005 ? num(side.h0) : `${num(side.h0)}→${num(side.h1)}`);
        const dFloor = round2(sd.b.floor0 - sd.a.floor0);
        const note = Math.abs(dFloor) > 0.004 ? ` (${dFloor > 0 ? '+' : ''}${num(dFloor)})` : '';
        const topA = (sd.a.top0 + sd.a.top1) / 2;
        const topB = (sd.b.top0 + sd.b.top1) / 2;
        const [nx, ny] = turn(ax.nx, ax.ny);
        return { a: strip(0, half), b: strip(-half, 0), dark: topB > topA + 1e-9 ? 'b' : 'a', label: `A ${seg(sd.a)} m · B ${seg(sd.b)} m${note}`, mid: at(ax.length * 0.3, 0), nx, ny, length: ax.length, thick: ax.thick };
    }
    // La zona que está de cada lado de una pared (la más chica que contiene el punto de al lado, a la mitad de la pared) y el piso que tiene ahí; outside = ese lado cae fuera de la nave.
    function wallSideInfo(layout, o) {
        const ax = wallAxis(layout, o);
        if (!ax) return null;
        const verts = (layout && layout.vertices) || [];
        const info = (side) => {
            const [px, py] = wallProbe(ax, ax.length / 2, side);
            let best = null;
            let bestArea = Infinity;
            ((layout && layout.zones) || []).forEach((z) => {
                if (!z || z.active === false || zonePoints(z).length < 3) return;
                const pts = zonePoints(z);
                if (!(pointInPolygon(px, py, pts) || onPolygonEdge(px, py, pts))) return;
                const a = zoneArea(z);
                if (a <= bestArea) { best = z; bestArea = a; }
            });
            const level = round2(floorLevelAt(layout, px, py));
            const inside = verts.length >= 3 ? (pointInPolygon(px, py, verts) || onPolygonEdge(px, py, verts)) : true;
            return { zoneId: best ? best.id : '', zoneName: best ? best.name : '', zoneCode: best ? best.code || '' : '', level, outside: !best && !inside };
        };
        return { a: info(1), b: info(-1) };
    }
    // Las puertas, conexiones de luz y sensores de antes (con el número del lado del contorno, sin pared) pasan a la pared que los cubre en ese lado (una sola vez; con wallId ya no se tocan): su distancia pasa a medirse desde el inicio
    // de esa pared. Si en ese lado no hay una pared que cubra el lugar se queda como estaba y la revisión lo marca «sin pared».
    function migrateDoors(layout) {
        if (!layout) return layout;
        const verts = Array.isArray(layout.vertices) ? layout.vertices : [];
        const walls = (Array.isArray(layout.obstacles) ? layout.obstacles : []).filter((o) => o && o.kind === 'wall' && o.mode === 'contour');
        let out = layout;
        ['doors', 'power', 'sensors'].forEach((key) => {
            if (!Array.isArray(layout[key]) || !layout[key].length) return;
            let changed = false;
            const items = layout[key].map((d) => {
                if (!d || typeof d !== 'object' || d.wallId) return d;
                const side = Math.round(Number(d.wall));
                if (!(side >= 1) || verts.length < 3) return d;
                const seg = wallSegment(verts, side);
                if (!(seg.length > 0)) return d;
                const start = Math.max(Number(d.dist) || 0, 0);
                let from = 0;
                const hit = walls.find((o) => {
                    if (Math.round(Number(o.wall)) !== side) return false;
                    const ws = Math.min(Math.max(Number(o.dist) || 0, 0), seg.length);
                    const len = Number(o.l) > 0 ? Math.min(Number(o.l), seg.length - ws) : seg.length - ws;
                    if (start < ws - 1e-6 || start > ws + len + 1e-6) return false;
                    from = ws;
                    return true;
                });
                if (!hit) return d;
                changed = true;
                const { wall, ...rest } = d;
                return { ...rest, wallId: hit.id, dist: round2(start - from) };
            });
            if (changed) out = { ...out, [key]: items };
        });
        return out;
    }
    // Lo que está mal en lo que va sobre una pared (puertas, conexiones de luz y sensores): «nowall» (no está sobre una pared), «outside» (empieza antes de la pared o se pasa de su largo) y «tall» (más alta que la pared: la puerta,
    // o la altura del piso de una conexión o un sensor). sig identifica el estado del renglón y de su pared: lo que ya estaba mal y no cambió solo se marca; lo NUEVO o lo que cambió (el renglón o su pared) no se deja guardar
    // (ver newWallItemViolations). list = 'doors' | 'power' | 'sensors'; section = la sección que lo guarda.
    const WALL_ITEM_SECTION = { doors: 'puertas', power: 'luz', sensors: 'sensores' };
    function wallItemViolations(layout, list) {
        const out = [];
        if (!layout || !Array.isArray(layout[list])) return out;
        const isDoor = list === 'doors';
        layout[list].forEach((d, i) => {
            const name = isDoor ? String((d && d.name) || 'Puerta') : (list === 'sensors' ? String((d && d.code) || `Sensor ${i + 1}`) : `#${i + 1}`);
            const noun = isDoor ? `La puerta «${name}»` : (list === 'sensors' ? `El sensor ${name}` : `La conexión de luz ${name}`);
            const g = doorGeometry(layout, isDoor ? d : { ...d, width: 0 });
            const base = { id: d.id, list, section: WALL_ITEM_SECTION[list] };
            if (!g || g.legacy) { out.push({ ...base, kind: 'nowall', sig: JSON.stringify([d.wallId || '', d.wall || 0, d.dist, d.width || 0]), message: `${noun} no está sobre una pared: elige la pared donde va.`, vars: { name } }); return; }
            const dist = Number(d.dist) || 0;
            const width = isDoor ? Number(d.width) || 0 : 0;
            const height = Number(d.height) || 0;
            const wname = g.wall ? `${g.wall.code ? `${g.wall.code} · ` : ''}${g.wall.name || 'Pared'}` : 'Pared';
            if (dist < -0.005 || dist + width > g.wallLength + 0.005) {
                out.push({ ...base, kind: 'outside', sig: JSON.stringify([d.wallId, dist, width, round2(g.wallLength)]), vars: { name, wall: wname, len: round2(g.wallLength), dist: round2(dist), width: round2(width) },
                    message: isDoor ? `${noun} no cabe en la pared «${wname}» (mide ${round2(g.wallLength)} m): empieza a ${round2(dist)} m y mide ${round2(width)} m.` : `${noun} no está dentro de la pared «${wname}» (mide ${round2(g.wallLength)} m): está a ${round2(dist)} m de su inicio.` });
            }
            if (g.wallHeight > 0 && height > g.wallHeight + 0.005) {
                // con pisos a distinto nivel se mide desde el piso más alto de los dos lados (g.base): el aviso lo dice
                const lifted = Math.abs(g.base || 0) > 0.005;
                out.push({ ...base, kind: 'tall', sig: JSON.stringify([d.wallId, height, round2(g.wallHeight), round2(g.base || 0)]), vars: { name, wall: wname, height: round2(height), wallHeight: round2(g.wallHeight), ...(lifted ? { base: round2(g.base) } : {}) },
                    message: lifted
                        ? (isDoor ? `${noun} (${round2(height)} m de alto) no cabe en la pared «${wname}»: se mide desde el piso más alto de sus dos lados (${round2(g.base)} m) y ahí la pared solo deja ${round2(g.wallHeight)} m.` : `${noun} está a ${round2(height)} m del piso más alto de la pared «${wname}» (${round2(g.base)} m) y ahí la pared solo deja ${round2(g.wallHeight)} m.`)
                        : (isDoor ? `${noun} (${round2(height)} m de alto) es más alta que la pared «${wname}» (${round2(g.wallHeight)} m).` : `${noun} está a ${round2(height)} m del piso y la pared «${wname}» solo mide ${round2(g.wallHeight)} m de alto.`) });
            }
        });
        return out;
    }
    const doorOpenOf = (door) => (door && DOOR_OPENS.includes(door.open) ? door.open : 'fixed');
    // El espacio que necesita una puerta al abrir, en metros: { type, pts } (un polígono convexo). Batiente: el cuarto de círculo que barre la hoja (radio = ancho de la puerta) desde su bisagra, hacia el lado elegido de la pared;
    // leaf = la hoja ya abierta a 90°. Corrediza: la franja pegada a la pared por donde corre la hoja (del tamaño de la puerta, a partir del extremo hacia donde corre); travel = su recorrido. Fija, o una puerta sin pared elegida: null.
    function doorOpening(layout, door) {
        const open = doorOpenOf(door);
        if (open === 'fixed') return null;
        const g = doorGeometry(layout, door);
        if (!g || g.legacy || !g.wall) return null;
        const width = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
        if (!(width > 0.01) || !(Math.hypot(g.nx || 0, g.ny || 0) > 0.5)) return null;
        const side = door.dir === 'out' ? -1 : 1;
        const sx = g.nx * side;
        const sy = g.ny * side;
        const off = (g.thick || 0) / 2;
        const atEnd = door.hinge === 'end';
        if (open === 'swing') {
            const p = atEnd ? g.b : g.a;
            const hx = p.x + sx * off;
            const hy = p.y + sy * off;
            const cx = atEnd ? -g.ux : g.ux;
            const cy = atEnd ? -g.uy : g.uy;
            const pts = [[hx, hy]];
            for (let k = 0; k <= 6; k += 1) {
                const th = (k * Math.PI) / 12;
                const c = Math.cos(th);
                const sn = Math.sin(th);
                pts.push([hx + width * (cx * c + sx * sn), hy + width * (cy * c + sy * sn)]);
            }
            return { type: 'swing', pts, hinge: { x: hx, y: hy }, leaf: [[hx, hy], [hx + sx * width, hy + sy * width]], radius: width };
        }
        const p = atEnd ? g.b : g.a;
        const dx = atEnd ? g.ux : -g.ux;
        const dy = atEnd ? g.uy : -g.uy;
        const f0 = [p.x + sx * off, p.y + sy * off];
        const f1 = [f0[0] + dx * width, f0[1] + dy * width];
        return { type: 'slide', pts: [f0, f1, [f1[0] + sx * SLIDE_DEPTH, f1[1] + sy * SLIDE_DEPTH], [f0[0] + sx * SLIDE_DEPTH, f0[1] + sy * SLIDE_DEPTH]], travel: [f0, f1] };
    }
    // ¿Dos polígonos convexos se encimen más de eps metros? (separación por ejes)
    function convexOverlap(A, B, eps) {
        const test = (P) => {
            for (let i = 0; i < P.length; i += 1) {
                const p = P[i];
                const q = P[(i + 1) % P.length];
                const ex = q[0] - p[0];
                const ey = q[1] - p[1];
                const len = Math.hypot(ex, ey);
                if (!(len > 1e-9)) continue;
                const nx = -ey / len;
                const ny = ex / len;
                let a0 = Infinity; let a1 = -Infinity; let b0 = Infinity; let b1 = -Infinity;
                A.forEach((v) => { const d = v[0] * nx + v[1] * ny; if (d < a0) a0 = d; if (d > a1) a1 = d; });
                B.forEach((v) => { const d = v[0] * nx + v[1] * ny; if (d < b0) b0 = d; if (d > b1) b1 = d; });
                if (Math.min(a1, b1) - Math.max(a0, b0) <= eps) return false;
            }
            return true;
        };
        return test(A) && test(B);
    }
    // Choques del espacio de apertura: el giro o el recorrido de una puerta choca con un activo, una columna u otro obstáculo (no su propia pared), o con el espacio de apertura de otra puerta. Un aviso por puerta con todo lo que
    // estorba (others) y otro por cada pareja de puertas que se encimen. Se cuentan como las demás faltas de las puertas (newWallItemViolations): lo nuevo que choca no se guarda; lo que ya estaba así y no cambió solo se marca.
    function doorOpeningClashes(layout) {
        const out = [];
        if (!layout || !Array.isArray(layout.doors) || !layout.doors.length) return out;
        const items = layout.doors.map((d) => ({ d, o: doorOpening(layout, d) })).filter((x) => x.o);
        if (!items.length) return out;
        const targets = [];
        const boxOf = (pts) => { const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
        const boxesTouch = (a, b) => a[0] <= b[2] + 0.02 && b[0] <= a[2] + 0.02 && a[1] <= b[3] + 0.02 && b[1] <= a[3] + 0.02;
        const spaces = Array.isArray(layout.spaces) ? (layout.spaces.every((sp) => Number.isFinite(sp.x)) ? layout.spaces : deriveSpaces(layout).spaces) : [];
        spaces.forEach((sp) => { if (sp.active !== false && sp.l > 0 && sp.d > 0) targets.push({ kind: 'space', id: sp.id, label: sp.code || 'Activo', pts: [[sp.x, sp.y], [sp.x + sp.l, sp.y], [sp.x + sp.l, sp.y + sp.d], [sp.x, sp.y + sp.d]] }); });
        obstacleShapes(layout).forEach(({ o, g }) => { if (o.kind !== 'step') targets.push({ kind: 'obstacle', id: o.id, label: o.code || o.name || 'Obstáculo', pts: g.pts }); });
        targets.forEach((t) => { t.box = boxOf(t.pts); });
        const eps = 0.02;
        items.forEach(({ d, o }, i) => {
            const base = { id: d.id, list: 'doors', section: 'puertas', kind: 'clash' };
            const name = String(d.name || 'Puerta');
            const kindText = o.type === 'swing' ? 'giro' : 'recorrido';
            const box = boxOf(o.pts);
            const hits = targets.filter((t) => !(t.kind === 'obstacle' && t.id === d.wallId) && boxesTouch(box, t.box) && convexOverlap(o.pts, t.pts, eps));
            if (hits.length) {
                const names = hits.map((t) => t.label);
                const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` y ${names.length - 3} más` : '');
                out.push({ ...base, sig: JSON.stringify([d.id, o.type, o.pts.map((p) => [round2(p[0]), round2(p[1])]), hits.map((t) => t.id)]), vars: { name, what: o.type, others: names, count: names.length }, message: `El ${kindText} de la puerta «${name}» choca con ${shown}.` });
            }
            items.forEach((other, j) => {
                if (j <= i) return;
                if (!boxesTouch(box, boxOf(other.o.pts)) || !convexOverlap(o.pts, other.o.pts, eps)) return;
                const otherName = String(other.d.name || 'Puerta');
                out.push({ ...base, kind: 'clashDoor', sig: JSON.stringify([d.id, other.d.id, o.type, other.o.type]), vars: { name, other: otherName, otherId: other.d.id, what: o.type }, message: `El ${kindText} de la puerta «${name}» choca con el de la puerta «${otherName}».` });
            });
        });
        return out;
    }
    const doorViolations = (layout) => wallItemViolations(layout, 'doors');
    const doorKey = (v) => `${v.list}|${v.kind}|${v.id}|${v.sig}`;
    // Las faltas nuevas de las tres listas (lo que ya estaba mal antes y no cambió no cuenta).
    function newWallItemViolations(next, previous) {
        const out = [];
        ['doors', 'power', 'sensors'].forEach((list) => {
            const before = new Set((previous ? wallItemViolations(previous, list) : []).map(doorKey));
            wallItemViolations(next, list).forEach((v) => { if (!before.has(doorKey(v))) out.push(v); });
        });
        // El espacio que necesita una puerta al abrir también cuenta: si choca con algo NUEVO (o lo que choca cambió) no se guarda.
        const beforeClash = new Set((previous ? doorOpeningClashes(previous) : []).map(doorKey));
        doorOpeningClashes(next).forEach((v) => { if (!beforeClash.has(doorKey(v))) out.push(v); });
        return out;
    }
    function newDoorViolations(next, previous) { return newWallItemViolations(next, previous).filter((v) => v.list === 'doors'); }
    // ---- Zonas a desnivel -------------------------------------------------------------------------------------------------------------------------------------
    const zoneHasLevel = (z) => !!z && ((Number(z.lvl) || 0) !== 0 || (z.lvl2 != null && Number(z.lvl2) !== (Number(z.lvl) || 0) && Number.isFinite(Number(z.lvl2))));
    // El nivel del piso de una zona en un punto (x, y): el de la zona si es plana o, en una rampa, el que le toca por lo que lleva recorrido del lado bajo al lado alto (el piso inclinado es un plano que va de un
    // borde del recuadro de la zona al opuesto).
    function zoneLevelAt(z, x, y) {
        const base = Number(z && z.lvl) || 0;
        const top = z && z.lvl2 != null ? Number(z.lvl2) : null;
        if (top === null || !Number.isFinite(top) || top === base || !ZONE_RISES.includes(z.rise)) return base;
        const pts = zonePoints(z);
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
        const along = (v, a, b, flip) => (b > a ? (flip ? (b - v) / (b - a) : (v - a) / (b - a)) : 0);
        const t = z.rise === 'right' ? along(x, x0, x1, false) : (z.rise === 'left' ? along(x, x0, x1, true) : (z.rise === 'down' ? along(y, y0, y1, false) : along(y, y0, y1, true)));
        return base + (top - base) * Math.min(Math.max(t, 0), 1);
    }
    // ---- Rampas ------------------------------------------------------------------------------------------------------------------------------------------------
    // Una rampa une dos pisos (o un piso y la nave, a nivel 0): from y to son el id de un piso o 'nave'. Su nivel de abajo y de arriba son los de esos dos pisos y su lado más alto es el que mira al piso más alto (o, si el más alto es la
    // nave, el contrario al foso); nada se escribe dos veces. Una rampa de antes que no se pudo ligar a sus pisos conserva sus propios niveles (lvl, lvl2, rise).
    const RAMP_CODE_RE = /^R\d{3,4}$/;
    const rampCodeOf = (n) => `R${String(n).padStart(3, '0')}`;
    const rampLabel = (r) => `${(r && r.code) || ''} ${(r && r.name) || ''}`.trim();
    // Hay contacto si los dos recuadros se enciman o comparten un tramo de orilla (a 5 cm).
    function rectContact(a, b) {
        const ox = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.w, b.y + b.w) - Math.max(a.y, b.y);
        return (ox >= -0.05 && oy > 0.05) || (oy >= -0.05 && ox > 0.05);
    }
    // El nivel de un extremo de la rampa: 'nave' = 0; el id de un piso (activo) = su nivel; null si ya no existe.
    function rampEndLevel(layout, ref) {
        if (ref === 'nave') return 0;
        const f = ((layout && layout.floors) || []).find((x) => x && x.id === ref && x.active !== false);
        return f ? round2(Number(f.lvl) || 0) : null;
    }
    const rampEndRect = (layout, ref) => (ref === 'nave' ? null : ((layout && layout.floors) || []).find((x) => x && x.id === ref) || null);
    // Lo que se sabe de una rampa: si está ligada a sus dos pisos, sus dos niveles (lo = abajo, hi = arriba) y el lado más alto; { ok: false } si no se puede calcular (falta un piso, o los dos niveles son iguales).
    function rampInfo(layout, r) {
        if (!r) return { ok: false };
        const linked = !!(r.from && r.to);
        if (!linked) {
            const lo = round2(Number(r.lvl) || 0);
            const hi = r.lvl2 != null && Number.isFinite(Number(r.lvl2)) ? round2(Number(r.lvl2)) : lo;
            return { ok: hi !== lo, linked: false, lo, hi, rise: ZONE_RISES.includes(r.rise) ? r.rise : 'right' };
        }
        const a = rampEndLevel(layout, r.from);
        const b = rampEndLevel(layout, r.to);
        if (a === null || b === null || a === b || r.from === r.to) return { ok: false, linked: true, lo: a, hi: b };
        const hiRef = a > b ? r.from : r.to;
        const loRef = a > b ? r.to : r.from;
        const cx = Number(r.x) + Number(r.l) / 2;
        const cy = Number(r.y) + Number(r.w) / 2;
        const center = (ref) => { const f = rampEndRect(layout, ref); return f ? [Number(f.x) + Number(f.l) / 2, Number(f.y) + Number(f.w) / 2] : null; };
        let vec = [1, 0];
        const hc = center(hiRef);
        const lc = center(loRef);
        if (hc) vec = [hc[0] - cx, hc[1] - cy];
        else if (lc) vec = [cx - lc[0], cy - lc[1]];
        const rise = Math.abs(vec[0]) >= Math.abs(vec[1]) ? (vec[0] >= 0 ? 'right' : 'left') : (vec[1] >= 0 ? 'down' : 'up');
        return { ok: true, linked: true, lo: Math.min(a, b), hi: Math.max(a, b), rise, loRef, hiRef };
    }
    // Los colores de los dos extremos de una rampa (ya sea la rampa o su versión como piso, f.id): el de abajo (lo) y el de arriba (hi). Son los colores de los DOS PISOS que toca (el formato propio de cada uno, o el de su
    // nivel; la nave es gris), así que si se cambia el color de uno de esos pisos la rampa lo sigue. Una rampa de antes que no se ligó a pisos usa los colores de sus dos niveles. null si no es una rampa.
    function rampEndColors(layout, f) {
        const r = f && ((layout && layout.ramps) || []).find((x) => x && x.id === f.id);
        if (!r) return null;
        const cols = floorLevelColors(layout);
        const info = rampInfo(layout, r);
        if (!info.ok) return null;
        const ofRef = (ref, level) => {
            if (ref === 'nave') return FLOOR_NAVE_COLOR;
            const fl = ref ? ((layout && layout.floors) || []).find((x) => x && x.id === ref) : null;
            return fl ? floorFmtOf(layout, fl).fill : (cols[round2(level)] || FLOOR_NAVE_COLOR);
        };
        return { lo: ofRef(info.loRef, info.lo), hi: ofRef(info.hiRef, info.hi) };
    }
    // La rampa como un piso más (con su nivel de abajo en lvl, el de arriba en lvl2 y su lado más alto en rise): así el croquis, el 3D, los m³ y los colores la tratan igual que a un piso en rampa.
    function rampAsFloor(layout, r) {
        const info = rampInfo(layout, r);
        if (!info.ok) return null;
        return { id: r.id, name: r.name, code: r.code, x: r.x, y: r.y, l: r.l, w: r.w, lvl: info.lo, lvl2: info.hi, rise: info.rise, active: r.active !== false, isRamp: true, ...(r.fmt ? { fmt: r.fmt } : {}) };
    }
    const rampsAsFloors = (layout) => ((layout && layout.ramps) || []).filter((r) => r && r.active !== false).map((r) => rampAsFloor(layout, r)).filter(Boolean);
    // Todos los pisos activos, planos y rampas (una rampa que no se puede calcular no entra).
    const floorsAll = (layout) => [...((layout && layout.floors) || []).filter((f) => f && f.active !== false), ...rampsAsFloors(layout)];
    // Los pisos que cuentan: activos, con tamaño y con algún nivel (un piso a 0 y sin rampa no cambia nada); las rampas cuentan como pisos.
    const floorsOf = (layout) => floorsAll(layout).filter((f) => Number(f.l) > 0 && Number(f.w) > 0 && zoneHasLevel(f));
    // ---- Color de los pisos ----------------------------------------------------------------------------------------------------------------
    // Cada piso lleva SU color (no el de la zona que toca) según su nivel: los que suben van de ámbar claro a rojo oscuro (más alto, más oscuro) y los fosos de azul claro a azul fuerte (más hondo, más fuerte). Mismo nivel,
    // mismo color; el color sale del orden de los niveles que hay en el Layout (con un solo nivel, el color del medio) y una rampa se pinta con el degradado entre los colores de sus dos niveles. A nivel de la nave (0), gris.
    // El formato propio del piso (fmt: color, trama y borde, como el de las zonas) manda sobre esto.
    const FLOOR_UP_STOPS = ['#f7d774', '#f0a04b', '#d9553f', '#8f2d3a'];
    const FLOOR_DOWN_STOPS = ['#c4def2', '#6aa6d6', '#2b5f9e'];
    const FLOOR_NAVE_COLOR = '#e9e9ee';
    function mixHex(a, b, k) {
        const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
        const A = rgb(a); const B = rgb(b);
        return `#${A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
    }
    function colorAlong(stops, t) {
        const x = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
        const i = Math.min(Math.floor(x), stops.length - 2);
        return mixHex(stops[i], stops[i + 1], x - i);
    }
    // { nivel (m, con 2 decimales): '#rrggbb' } de los niveles que hay en los pisos activos (los dos extremos de una rampa también).
    function floorLevelColors(layout) {
        const levels = new Set([0]);
        floorsAll(layout).forEach((f) => {
            if (!f || f.active === false) return;
            levels.add(round2(Number(f.lvl) || 0));
            if (f.lvl2 !== undefined && f.lvl2 !== null) levels.add(round2(Number(f.lvl2) || 0));
        });
        const ups = [...levels].filter((v) => v > 0).sort((a, b) => a - b);
        const downs = [...levels].filter((v) => v < 0).sort((a, b) => b - a);
        const out = { 0: FLOOR_NAVE_COLOR };
        ups.forEach((v, i) => { out[v] = colorAlong(FLOOR_UP_STOPS, ups.length === 1 ? 0.5 : i / (ups.length - 1)); });
        downs.forEach((v, i) => { out[v] = colorAlong(FLOOR_DOWN_STOPS, downs.length === 1 ? 0.5 : i / (downs.length - 1)); });
        return out;
    }
    // El formato con el que se ve un piso: el propio o, si no tiene, el de su nivel (un piso plano, con rayas; una rampa, de un solo color, el del medio de sus dos niveles).
    function floorFmtOf(layout, f) {
        const own = f && f.fmt ? sanitizeFmt(f.fmt) : null;
        if (own) return own;
        const cols = floorLevelColors(layout);
        const lo = round2(Number(f && f.lvl) || 0);
        const ramp = !!f && f.lvl2 !== undefined && f.lvl2 !== null && round2(Number(f.lvl2) || 0) !== lo;
        const ends = ramp && f.isRamp ? rampEndColors(layout, f) : null;
        const fill = ends ? mixHex(ends.lo, ends.hi, 0.5) : (ramp ? mixHex(cols[lo] || FLOOR_NAVE_COLOR, cols[round2(Number(f.lvl2) || 0)] || FLOOR_NAVE_COLOR, 0.5) : (cols[lo] || FLOOR_NAVE_COLOR));
        return { fill, pattern: ramp ? 'solid' : 'diag1', pcolor: mixHex(fill, '#000000', 0.28), line: 'thin', bcolor: mixHex(fill, '#000000', 0.4) };
    }
    // ---- Color de los espacios (el E001, el E002…) ---------------------------------------------------------------------------------------------------
    // Todos los espacios con el MISMO número (el E001 de cada nivel de cada activo) llevan el mismo color, y cada número el suyo, para distinguirlos de un vistazo. De fábrica una paleta de 7 colores que se repite; cada número puede
    // llevar su formato propio (color, trama y borde, como el de piso) en layout.bayFmt = { '1': { fill, pattern, pcolor, line, bcolor }, … }. Sin formato propio queda el de fábrica. El color de un espacio es del VOLUMEN del espacio
    // (largo × fondo × alto) y tiene que verse distinto del de los niveles (las repisas: naranja del anaquel con tarimas, gris del anaquel, azul de los postes, madera de la tarima), por eso la paleta evita el naranja, el azul y el gris.
    const BAY_COLORS = ['#2fa36b', '#8e5bd6', '#d6409f', '#14a7b8', '#e6d200', '#d64545', '#7bb33a'];
    function bayFmtOf(layout, c) {
        const n = Math.max(1, Math.round(Number(c)) || 1);
        const own = layout && layout.bayFmt && typeof layout.bayFmt === 'object' ? sanitizeFmt(layout.bayFmt[String(n)]) : null;
        if (own) return own;
        const fill = BAY_COLORS[(n - 1) % BAY_COLORS.length];
        return { fill, pattern: 'solid', pcolor: mixHex(fill, '#000000', 0.28), line: 'thin', bcolor: mixHex(fill, '#000000', 0.4) };
    }
    // Superficie que comparten dos rectángulos (m²).
    const rectShared = (a, b) => Math.max(0, Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.w, b.y + b.w) - Math.max(a.y, b.y));
    // El nivel del piso del Layout en un punto: el del piso que lo contiene (el más chico si hay varios); 0 si ninguno (a nivel con la nave).
    function floorLevelAt(layout, x, y) {
        let best = null;
        let bestArea = Infinity;
        floorsOf(layout).forEach((f) => {
            const pts = rectPoints(f);
            if (!(pointInPolygon(x, y, pts) || onPolygonEdge(x, y, pts))) return;
            const a = f.l * f.w;
            if (a <= bestArea) { best = f; bestArea = a; }
        });
        return best ? zoneLevelAt(best, x, y) : 0;
    }
    // Pares de pisos que se enciman (no se permiten; que se toquen en la orilla sí): [{ a, b, area }].
    function floorOverlaps(layout) {
        const fs = floorsOf(layout);
        const out = [];
        for (let i = 0; i < fs.length; i++) {
            for (let j = i + 1; j < fs.length; j++) {
                const area = rectShared(fs[i], fs[j]);
                if (area > 1e-4) out.push({ a: fs[i], b: fs[j], area: round2(area) });
            }
        }
        return out;
    }
    // ---- Pisos y rampas dentro del contorno --------------------------------------------------------------------------------------------------------
    // Nada sale del contorno de la nave: un piso (o una rampa) tiene que caber ENTERO adentro (pegado a la pared cuenta como adentro). Mira todos los pisos y rampas activos con tamaño, tengan nivel o no. Lo que ya estaba
    // afuera antes de esta regla solo se marca; lo NUEVO o lo que cambió (el rectángulo o el contorno) no se deja guardar (ver newFloorViolations). list = 'floors' | 'ramps' (de qué paso es).
    function floorViolations(layout) {
        const out = [];
        const poly = Array.isArray(layout && layout.vertices) ? layout.vertices.map((p) => [Number(p[0]), Number(p[1])]) : [];
        if (poly.length < 3) return out;
        const check = (list, items) => items.forEach((f) => {
            if (!f || f.active === false) return;
            const x = Number(f.x) || 0; const y = Number(f.y) || 0; const l = Number(f.l) || 0; const w = Number(f.w) || 0;
            if (!(l > 0 && w > 0) || rectInsidePolygon(poly, x, y, l, w)) return;
            const label = `${f.code ? `${f.code} ` : ''}${f.name || ''}`.trim() || (list === 'ramps' ? 'Rampa' : 'Piso');
            out.push({ id: f.id, list, section: list === 'ramps' ? 'rampas' : 'pisos', code: f.code || '', name: f.name || '', kind: 'outside', sig: JSON.stringify([x, y, l, w, poly]),
                message: `${list === 'ramps' ? 'La rampa' : 'El piso'} ${label} sale del contorno de la nave: no es posible, acomódalo o cambia sus medidas para que quede adentro.` });
        });
        check('floors', (layout && layout.floors) || []);
        check('ramps', (layout && layout.ramps) || []);
        return out;
    }
    const floorKey = (v) => `${v.list}|${v.id}|${v.kind}|${v.sig}`;
    // Las faltas que hay en next y que antes no estaban igual: un piso o una rampa nuevos, que se movieron o cambiaron de medidas, o con el contorno cambiado. Esas no se dejan guardar.
    function newFloorViolations(next, previous) {
        const before = new Set((previous ? floorViolations(previous) : []).map(floorKey));
        return floorViolations(next).filter((v) => !before.has(floorKey(v)));
    }
    // ---- Zonas dentro del contorno ------------------------------------------------------------------------------------------------------------------
    // Una zona (rectángulo o forma libre) tiene que caber ENTERA en la nave (pegada a la pared cuenta como adentro). Mira las zonas activas ya dibujadas (con 3 puntos o más). Lo que ya estaba afuera antes de esta regla solo se
    // marca; lo NUEVO o lo que cambió (la zona o el contorno) no se deja guardar (ver newZoneViolations).
    function zoneViolations(layout) {
        const out = [];
        const nave = Array.isArray(layout && layout.vertices) ? layout.vertices.map((p) => [Number(p[0]), Number(p[1])]) : [];
        if (nave.length < 3) return out;
        ((layout && layout.zones) || []).forEach((z) => {
            if (!z || z.active === false) return;
            const pts = zonePoints(z);
            if (!pts || pts.length < 3 || !zoneOutsideNave(nave, z)) return;
            const label = `${z.code ? `${z.code} ` : ''}${z.name || ''}`.trim() || 'Zona';
            out.push({ id: z.id, code: z.code || '', name: z.name || '', kind: 'outside', section: 'zonas', sig: JSON.stringify([pts, nave]),
                message: `La zona ${label} sale del contorno de la nave: no es posible, acomódala o cambia sus medidas para que quede adentro.` });
        });
        return out;
    }
    const zoneKey = (v) => `${v.id}|${v.kind}|${v.sig}`;
    // Las faltas que hay en next y que antes no estaban igual: una zona nueva, que se movió o cambió de medidas, o con el contorno cambiado. Esas no se dejan guardar.
    function newZoneViolations(next, previous) {
        const before = new Set((previous ? zoneViolations(previous) : []).map(zoneKey));
        return zoneViolations(next).filter((v) => !before.has(zoneKey(v)));
    }
    // Recorta un polígono (lista de [x, y]) a un lado de una recta vertical (axis 0, x = value) u horizontal (axis 1, y = value): keepGreater conserva el lado de los valores mayores.
    function clipHalf(poly, axis, value, keepGreater) {
        const out = [];
        const inside = (p) => (keepGreater ? p[axis] >= value - 1e-9 : p[axis] <= value + 1e-9);
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            const ina = inside(a);
            const inb = inside(b);
            if (ina) out.push(a);
            if (ina !== inb && b[axis] !== a[axis]) {
                const k = (value - a[axis]) / (b[axis] - a[axis]);
                out.push(axis === 0 ? [value, a[1] + (b[1] - a[1]) * k] : [a[0] + (b[0] - a[0]) * k, value]);
            }
        }
        return out;
    }
    // La parte de un polígono que cae dentro de un rectángulo (x0, y0, x1, y1) y las que caen fuera: { inside: polígono | null, outside: [polígonos] }. Sirve para pintar una zona por pedazos según el piso que tiene debajo.
    function splitByRect(poly, x0, y0, x1, y1) {
        const keep = (p) => (p.length >= 3 && polygonArea(p) > 1e-9 ? p : null);
        const out = [];
        const left = clipHalf(poly, 0, x0, false); let rest = clipHalf(poly, 0, x0, true);
        const right = clipHalf(rest, 0, x1, true); rest = clipHalf(rest, 0, x1, false);
        const top = clipHalf(rest, 1, y0, false); rest = clipHalf(rest, 1, y0, true);
        const bottom = clipHalf(rest, 1, y1, true); rest = clipHalf(rest, 1, y1, false);
        [left, right, top, bottom].forEach((p) => { const k = keep(p); if (k) out.push(k); });
        return { inside: keep(rest), outside: out };
    }
    const clipPolygonToRect = (poly, x0, y0, x1, y1) => splitByRect(poly, x0, y0, x1, y1).inside || [];
    // Superficie (m²) que una zona comparte con un piso.
    const zoneFloorShared = (z, f) => { const p = clipPolygonToRect(zonePoints(z), f.x, f.y, f.x + f.l, f.y + f.w); return p.length >= 3 ? polygonArea(p) : 0; };
    // Los pisos que toca una zona y las zonas que toca un piso (más de 5 dm² en común; solo para mostrarlo, no se guarda).
    const floorsOfZone = (layout, z) => floorsAll(layout).filter((f) => Number(f.l) > 0 && Number(f.w) > 0 && zoneFloorShared(z, f) > 0.05);
    const zonesOfFloor = (layout, f) => ((layout && layout.zones) || []).filter((z) => z && z.active !== false && zonePoints(z).length >= 3 && Number(f.l) > 0 && Number(f.w) > 0 && zoneFloorShared(z, f) > 0.05);
    // El nivel promedio del piso dentro de una zona (m): lo que sube el piso ahí, ponderado por la superficie que toca de cada piso. Zona rectangular: exacto (rectángulo común de cada piso, y en una rampa el nivel de su centro);
    // zona de forma libre: se mide en una cuadrícula.
    function zoneAvgLevel(layout, z) {
        const fs = floorsOf(layout);
        const area = zoneArea(z);
        if (!fs.length || !(area > 0)) return 0;
        if (!hasPoints(z)) {
            let sum = 0;
            fs.forEach((f) => {
                const x0 = Math.max(z.x, f.x); const x1 = Math.min(z.x + z.l, f.x + f.l);
                const y0 = Math.max(z.y, f.y); const y1 = Math.min(z.y + z.w, f.y + f.w);
                if (x1 > x0 && y1 > y0) sum += (x1 - x0) * (y1 - y0) * zoneLevelAt(f, (x0 + x1) / 2, (y0 + y1) / 2);
            });
            return sum / area;
        }
        const pts = z.pts;
        const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
        const bx0 = Math.min(...xs); const bx1 = Math.max(...xs); const by0 = Math.min(...ys); const by1 = Math.max(...ys);
        const step = Math.min(0.5, Math.max(0.05, Math.sqrt(((bx1 - bx0) * (by1 - by0)) / 40000)));
        let sum = 0; let n = 0;
        for (let x = bx0 + step / 2; x < bx1; x += step) {
            for (let y = by0 + step / 2; y < by1; y += step) { if (pointInPolygon(x, y, pts)) { sum += floorLevelAt(layout, x, y); n += 1; } }
        }
        return n ? sum / n : 0;
    }
    // Los pisos de antes vivían dentro de las zonas (lvl, lvl2, rise): al leer un Layout (una sola vez, floorsMigrated) cada zona con nivel pasa a ser un piso con el recuadro de esa zona y la zona se queda sin esos campos.
    function migrateFloorsToPisos(layout) {
        if (!layout || layout.floorsMigrated) return layout;
        const zones = Array.isArray(layout.zones) ? layout.zones : [];
        const floors = Array.isArray(layout.floors) ? layout.floors.slice() : [];
        const ids = new Set(floors.map((f) => f && f.id));
        zones.forEach((z) => {
            if (!z || !zoneHasLevel(z)) return;
            let id = `pz-${z.id}`.slice(0, 38);
            while (ids.has(id)) id += 'x';
            ids.add(id);
            const lvl = Number(z.lvl) || 0;
            const ramp = z.lvl2 != null && Number.isFinite(Number(z.lvl2)) && Number(z.lvl2) !== lvl;
            floors.push({ id, name: `Piso ${z.name || z.code || ''}`.trim().slice(0, LIMITS.text), code: '', x: z.x, y: z.y, l: z.l, w: z.w, ...(lvl !== 0 ? { lvl } : {}), ...(ramp ? { lvl2: Number(z.lvl2), rise: ZONE_RISES.includes(z.rise) ? z.rise : 'right' } : {}), active: z.active !== false });
        });
        const stripped = zones.map((z) => { if (!z || (z.lvl === undefined && z.lvl2 === undefined && z.rise === undefined)) return z; const { lvl, lvl2, rise, ...rest } = z; return rest; });
        return { ...layout, zones: stripped, floors, floorsMigrated: true };
    }
    // Los pisos de antes que eran rampas (con «Nivel de la parte alta») pasan, una sola vez (rampsMigrated), al paso Rampas con sus niveles actuales; si tocan pisos con esos mismos niveles (o la nave, a 0), quedan ligadas a ellos
    // (y sus niveles ya salen de los pisos); si no, conservan los suyos.
    function migrateRamps(layout) {
        if (!layout || layout.rampsMigrated) return layout;
        const floors = Array.isArray(layout.floors) ? layout.floors : [];
        const isRampFloor = (f) => f && f.lvl2 != null && Number.isFinite(Number(f.lvl2)) && Number(f.lvl2) !== (Number(f.lvl) || 0);
        const flats = floors.filter((f) => f && !isRampFloor(f) && f.active !== false);
        const ramps = Array.isArray(layout.ramps) ? layout.ramps.slice() : [];
        const ids = new Set(ramps.map((r) => r && r.id));
        floors.filter(isRampFloor).forEach((f) => {
            let id = `rp-${f.id}`.slice(0, 38);
            while (ids.has(id)) id += 'x';
            ids.add(id);
            const lvl = round2(Number(f.lvl) || 0);
            const lvl2 = round2(Number(f.lvl2));
            const lo = Math.min(lvl, lvl2);
            const hi = Math.max(lvl, lvl2);
            const refFor = (level) => {
                if (level === 0) return 'nave';
                const hit = flats.find((x) => round2(Number(x.lvl) || 0) === level && rectContact({ x: f.x, y: f.y, l: f.l, w: f.w }, x));
                return hit ? hit.id : '';
            };
            const from = refFor(lo);
            const to = refFor(hi);
            const base = { id, name: String(f.name || '').replace(/^Piso\b/, 'Rampa').slice(0, LIMITS.text) || 'Rampa', code: '', x: f.x, y: f.y, l: f.l, w: f.w, active: f.active !== false, ...(f.fmt ? { fmt: f.fmt } : {}) };
            ramps.push(from && to && from !== to ? { ...base, from, to } : { ...base, lvl, lvl2, rise: ZONE_RISES.includes(f.rise) ? f.rise : 'right' });
        });
        return { ...layout, floors: floors.filter((f) => !isRampFloor(f)), ramps, rampsMigrated: true };
    }
    function migrateFloors(layout) { return migrateRamps(migrateFloorsToPisos(layout)); }
    // El código de cada rampa (R001…) lo pone el sistema: el que ya trae se conserva (si no se repite) y las demás reciben el siguiente número.
    function assignRampCodes(layout) {
        if (!layout || !Array.isArray(layout.ramps) || !layout.ramps.length) return layout;
        const used = new Set();
        const out = layout.ramps.map((r) => {
            const code = r && typeof r.code === 'string' ? r.code.trim() : '';
            if (RAMP_CODE_RE.test(code) && !used.has(code)) { used.add(code); return r.code === code ? r : { ...r, code }; }
            return { ...r, code: '' };
        });
        let next = Math.max(0, ...Array.from(used).map((c) => Number(c.slice(1)))) + 1;
        let changed = out.some((r, i) => r !== layout.ramps[i]);
        out.forEach((r, i) => { if (r.code) return; while (used.has(rampCodeOf(next))) next += 1; const code = rampCodeOf(next); used.add(code); out[i] = { ...r, code }; changed = true; });
        return changed ? { ...layout, ramps: out } : layout;
    }
    // Lo que le falta a cada rampa (solo las que se ligan a pisos): [{ id, key, vars, text }]. key: choose (falta De o A), same_ref (De y A son el mismo), missing (un piso ya no existe), same_level (los dos pisos están al mismo
    // nivel) o touch (no toca uno de sus pisos; vars.floor dice cuál). text es el aviso completo en español (el servidor lo manda al no guardar); la pantalla lo traduce con key y vars.
    function rampIssues(layout) {
        const out = [];
        const nave = Array.isArray(layout && layout.vertices) ? layout.vertices.map((p) => [p[0], p[1]]) : [];
        const onNave = (x, y) => nave.length >= 3 && (pointInPolygon(x, y, nave) || onPolygonEdge(x, y, nave));
        ((layout && layout.ramps) || []).forEach((r) => {
            if (!r || r.active === false) return;
            const label = rampLabel(r);
            const push = (key, vars, text) => out.push({ id: r.id, key, vars: { ramp: label, ...vars }, text });
            if (!r.from && !r.to && r.lvl2 != null) return; // una rampa de antes con sus propios niveles: sin avisos
            if (!r.from || !r.to) { push('choose', {}, `La rampa ${label}: elige de qué piso a qué piso (o desde la nave) para poder guardar.`); return; }
            if (r.from === r.to) { push('same_ref', {}, `La rampa ${label}: «De» y «A» son el mismo: elige dos distintos para poder guardar.`); return; }
            const a = rampEndLevel(layout, r.from);
            const b = rampEndLevel(layout, r.to);
            if (a === null || b === null) { push('missing', {}, `La rampa ${label}: uno de sus pisos ya no existe: elígelo otra vez para poder guardar.`); return; }
            if (a === b) { push('same_level', { level: a }, `La rampa ${label} une dos pisos al mismo nivel (${a > 0 ? '+' : ''}${a} m): una rampa necesita dos niveles distintos para poder guardar.`); return; }
            [r.from, r.to].forEach((ref) => {
                if (ref === 'nave') {
                    const box = { x: Number(r.x) || 0, y: Number(r.y) || 0, l: Number(r.l) || 0, w: Number(r.w) || 0 };
                    if (![[box.x + box.l / 2, box.y + box.w / 2], [box.x, box.y], [box.x + box.l, box.y], [box.x + box.l, box.y + box.w], [box.x, box.y + box.w]].some((p) => onNave(p[0], p[1]))) push('touch', { floor: 'Nave' }, `La rampa ${label} no toca el piso de la nave: acércala a su orilla o elige otro piso para poder guardar.`);
                    return;
                }
                const f = rampEndRect(layout, ref);
                if (f && !rectContact({ x: Number(r.x) || 0, y: Number(r.y) || 0, l: Number(r.l) || 0, w: Number(r.w) || 0 }, f)) push('touch', { floor: rampLabel(f) }, `La rampa ${label} no toca el piso ${rampLabel(f)}: acércala a su orilla o elige otro piso para poder guardar.`);
            });
        });
        return out;
    }
    const FLOOR_CODE_RE = /^P\d{3,4}$/;
    const floorCodeOf = (n) => `P${String(n).padStart(3, '0')}`;
    // El código de cada piso (P001…) lo pone el sistema: el que ya trae se conserva (si no se repite) y los demás reciben el siguiente número.
    function assignFloorCodes(layout) {
        if (!layout || !Array.isArray(layout.floors) || !layout.floors.length) return layout;
        const used = new Set();
        const out = layout.floors.map((f) => {
            const code = f && typeof f.code === 'string' ? f.code.trim() : '';
            if (FLOOR_CODE_RE.test(code) && !used.has(code)) { used.add(code); return f.code === code ? f : { ...f, code }; }
            return { ...f, code: '' };
        });
        let next = Math.max(0, ...Array.from(used).map((c) => Number(c.slice(1)))) + 1;
        let changed = out.some((f, i) => f !== layout.floors[i]);
        out.forEach((f, i) => { if (f.code) return; while (used.has(floorCodeOf(next))) next += 1; const code = floorCodeOf(next); used.add(code); out[i] = { ...f, code }; changed = true; });
        return changed ? { ...layout, floors: out } : layout;
    }
    // El centro de gravedad de un polígono (el promedio de un plano inclinado sobre él es lo que vale ahí).
    function polygonCentroid(pts) {
        let a = 0; let cx = 0; let cy = 0;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i]; const q = pts[(i + 1) % pts.length];
            const cr = p[0] * q[1] - q[0] * p[1];
            a += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr;
        }
        if (Math.abs(a) < 1e-9) return [pts.reduce((acc, p) => acc + p[0], 0) / pts.length, pts.reduce((acc, p) => acc + p[1], 0) / pts.length];
        return [cx / (3 * a), cy / (3 * a)];
    }
    // Lo que sube el piso por los pisos, en m³: superficie de cada piso por su nivel promedio (en una rampa, el del centro); un foso (nivel negativo) resta. Los pisos no se pueden encimar al guardar, pero si en pantalla se enciman
    // cada punto cuenta una sola vez, con el nivel del piso más chico que lo contiene: se mide en una cuadrícula.
    function raisedVolume(layout) {
        const fs = floorsOf(layout);
        if (!fs.length) return 0;
        if (!floorOverlaps(layout).length) return fs.reduce((acc, f) => acc + f.l * f.w * zoneLevelAt(f, f.x + f.l / 2, f.y + f.w / 2), 0);
        const x0 = Math.min(...fs.map((f) => f.x)); const y0 = Math.min(...fs.map((f) => f.y));
        const x1 = Math.max(...fs.map((f) => f.x + f.l)); const y1 = Math.max(...fs.map((f) => f.y + f.w));
        const step = Math.min(0.5, Math.max(0.05, Math.sqrt(((x1 - x0) * (y1 - y0)) / 50000)));
        let sum = 0;
        for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) sum += floorLevelAt(layout, x, y);
        return sum * step * step;
    }
    // Volumen de la nave: lo que cabe bajo el techo menos lo que sube el piso en cada desnivel (superficie por su altura sobre el piso; si es más bajo, la altura es negativa y suma) y por las zonas a desnivel.
    function netVolume(layout) {
        const gross = volumeOf((layout && layout.vertices) || []);
        const raised = obstacleShapes(layout).filter(({ o }) => o.kind === 'step').reduce((acc, { o, g }) => acc + polygonArea(g.pts) * (Number(o.dz) || 0), 0);
        return Math.max(0, gross - raised - raisedVolume(layout));
    }
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
    // La zona sale de la nave si alguna esquina suya queda afuera, si un lado suyo cruza un lado de la nave o si una esquina de la nave (un rincón) queda metida dentro de la zona: en una nave con rincones puede tener todas
    // las esquinas adentro y aun así taparlos. Pegada a la pared cuenta como adentro.
    function zoneOutsideNave(vertices, z) {
        if (!vertices || vertices.length < 3) return false;
        const pts = zonePoints(z);
        if (!pts || pts.length < 3) return false;
        if (pts.some((p) => !pointInPolygon(p[0], p[1], vertices) && !onPolygonEdge(p[0], p[1], vertices))) return true;
        const nave = vertices.map((p) => [p[0], p[1]]);
        for (let i = 0; i < pts.length; i++) {
            for (let j = 0; j < nave.length; j++) {
                if (crossesProperly(pts[i], pts[(i + 1) % pts.length], nave[j], nave[(j + 1) % nave.length])) return true;
            }
        }
        return nave.some((p) => pointInPolygon(p[0], p[1], pts) && !onPolygonEdge(p[0], p[1], pts));
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

    // ---- Huella y Activo ---------------------------------------------------------------------------------------------------------------------
    // Una HUELLA es el lugar en el piso (código, zona, x, y, largo, fondo, alto, formato) y puede tener uno o varios ACTIVOS encima (el rack, el estante…). Las huellas viven en layout.footprints; los
    // activos siguen en layout.spaces (con footprintId) porque todo lo demás (relaciones de códigos, QR, 3D, Verificador) ya los conoce por ahí. De la huella se DERIVAN en cada activo su zona, su
    // lugar en el piso, su alto, su nombre y su formato: con un solo activo es la huella entera; con varios, la huella se reparte en partes iguales a lo largo de su lado más largo.
    // El Layout de antes guardaba cada huella y su activo como UN espacio: aquí cada espacio viejo pasa a ser una huella (id h-<id del espacio>) con un activo (el mismo id y código que tenía el
    // espacio, así las relaciones de códigos siguen apuntando al mismo lugar). Una huella que estaba desactivada sigue desactivada.
    function migrateFootprints(layout) {
        if (!layout || !Array.isArray(layout.spaces)) return layout;
        const hasList = Array.isArray(layout.footprints);
        const footprints = hasList ? layout.footprints.slice() : [];
        let changed = !hasList;
        // También se aceptan activos sueltos (sin huella) que traen su lugar en el piso, como los mandaría una pantalla vieja o una integración: cada uno pasa a ser su propia huella.
        const spaces = layout.spaces.map((s) => {
            if (!s || typeof s !== 'object' || s.footprintId) return s;
            if (hasList && !('l' in s) && !('d' in s)) return s; // sin lugar en el piso no hay de dónde sacar la huella: la validación lo avisa
            changed = true;
            const id = `h-${s.id}`.slice(0, 40);
            // mismo orden de campos que deja sanitizeLayout: así comparar una huella migrada con la que se guarda no la ve distinta
            const fp = { id, code: s.code, zoneId: s.zoneId || '', ...(s.name ? { name: s.name } : {}), x: s.x, y: s.y, l: s.l, d: s.d, h: s.h, ...(s.fmt ? { fmt: s.fmt } : {}), active: s.active !== false };
            // si esa huella ya estaba (el mismo espacio de antes), lo que trae el activo suelto manda, como mandaba el espacio
            const at = footprints.findIndex((f) => f.id === id);
            if (at >= 0) footprints[at] = fp; else footprints.push(fp);
            const { name, zoneId, x, y, l, d, h, fmt, active, ...rest } = s;
            return { ...rest, footprintId: id };
        });
        return changed ? { ...layout, footprints, spaces } : layout;
    }
    // La ZONA de una huella no se elige: sale de dónde está en el croquis. Es la zona más chica que contiene el centro de la huella (si el centro cae en varias, la más específica); si cae fuera de todas, la
    // huella queda sin zona. Se recalcula siempre (al leer el Layout, al guardarlo y al mover una huella o una zona), así que la zona nunca contradice el dibujo; de ahí sale también la de cada activo.
    // Una zona desactivada también cuenta (la huella sigue estando adentro): si no, desactivar una zona le cambiaría la zona y el código a todas sus huellas.
    function zoneOfPoint(zones, x, y) {
        let best = null;
        let bestArea = Infinity;
        (zones || []).forEach((z) => {
            const pts = zonePoints(z);
            if (!pts || pts.length < 3 || !pointInPolygon(x, y, pts)) return;
            const area = zoneArea(z);
            if (area < bestArea) { best = z; bestArea = area; }
        });
        return best ? best.id : '';
    }
    // ---- Sensores de temperatura y humedad ---------------------------------------------------------------------------------------------------
    // Un sensor se coloca sobre una pared, igual que una conexión de luz: pared, distancia desde su esquina y altura del piso. Su ZONA no se elige: es la zona que toca el punto del sensor, tomado un poco hacia adentro
    // de la nave (la más específica si cae en varias; sin zona si cae fuera de todas). Su código (S001, S002…) lo pone el sistema, consecutivo en todo el Layout, y no se edita.
    function sensorPoint(layout, s) {
        // el sensor va sobre su pared (por el centro de la pared); un sensor de antes sin pared se ubica sobre su lado del contorno como siempre
        const g = doorGeometry(layout, { ...s, width: 0 });
        if (!g) return null;
        const verts = layout.vertices || [];
        const x = g.a.x;
        const y = g.a.y;
        const pts = verts.map((p) => [p[0], p[1]]);
        // hacia qué lado queda el interior de la nave: se mira a 30 cm de la pared (una pared sobre el contorno tiene su grosor y a 5 cm todavía podría caer del lado del contorno); la zona se toma a 5 cm de su centro, de ese lado
        const at = (k) => [x + g.uy * k, y - g.ux * k];
        const inFar = pointInPolygon(at(0.3)[0], at(0.3)[1], pts);
        const inFarB = pointInPolygon(at(-0.3)[0], at(-0.3)[1], pts);
        const sign = inFar && !inFarB ? 1 : (inFarB && !inFar ? -1 : (pointInPolygon(at(0.05)[0], at(0.05)[1], pts) ? 1 : (pointInPolygon(at(-0.05)[0], at(-0.05)[1], pts) ? -1 : 0)));
        const inside = sign ? at(0.05 * sign) : [x, y];
        return { x, y, inx: inside[0], iny: inside[1] };
    }
    function deriveSensorZones(layout) {
        if (!layout || !Array.isArray(layout.sensors)) return layout;
        let changed = false;
        const sensors = layout.sensors.map((s) => {
            const p = sensorPoint(layout, s);
            const id = p ? zoneOfPoint(layout.zones, p.inx, p.iny) : '';
            if ((s.zoneId || '') === id) return s;
            changed = true;
            return { ...s, zoneId: id };
        });
        return changed ? { ...layout, sensors } : layout;
    }
    // Las zonas que mide un sensor: las que se eligieron en su renglón (paso Sensores) o, sin elegir ninguna, la zona donde está colocado.
    function sensorZoneIds(s) {
        if (s && Array.isArray(s.zones) && s.zones.length) return s.zones;
        return s && s.zoneId ? [s.zoneId] : [];
    }
    const sensorCode = (n) => `S${String(n).padStart(3, '0')}`;
    const isSensorCode = (c) => /^S\d{3,4}$/.test(String(c == null ? '' : c).trim());
    // Cada sensor que ya trae un código S### que no se repite lo conserva; el que no, recibe el siguiente después del más alto del Layout.
    function assignSensorCodes(layout) {
        if (!layout || !Array.isArray(layout.sensors)) return layout;
        const used = new Set();
        const keep = layout.sensors.map((s) => { const c = String(s.code == null ? '' : s.code).trim().toUpperCase(); if (isSensorCode(c) && !used.has(c)) { used.add(c); return c; } return ''; });
        let next = Math.max(0, ...Array.from(used).map((c) => Number(c.slice(1)))) + 1;
        let changed = false;
        const sensors = layout.sensors.map((s, i) => {
            let code = keep[i];
            if (!code) { while (used.has(sensorCode(next))) next += 1; code = sensorCode(next); used.add(code); next += 1; }
            if (code === s.code) return s;
            changed = true;
            return { ...s, code };
        });
        return changed ? { ...layout, sensors } : layout;
    }
    // Al guardar: los códigos de los sensores no se editan. Uno que ya existía conserva el suyo; uno nuevo recibe el siguiente.
    function lockSensorCodes(next, previous) {
        if (!next || !Array.isArray(next.sensors)) return next;
        const before = new Map(((previous && previous.sensors) || []).map((s) => [s.id, s.code]));
        const sensors = next.sensors.map((s) => { const code = before.has(s.id) ? before.get(s.id) : ''; return code === s.code ? s : { ...s, code }; });
        return assignSensorCodes({ ...next, sensors });
    }
    // El código de una PARED es M001, M002… (M de muro: la P ya es de la puerta de emergencia) y lo pone el sistema: uno por pared (las columnas, los desniveles y los otros obstáculos no llevan), consecutivo, sin repetirse y SIN volver a
    // usarse aunque se borre una pared (wallNext guarda el último número que se dio). El nombre se puede cambiar y hasta repetirse; el código no cambia nunca: es con el que se elige la pared al poner una puerta, una conexión de luz o un sensor.
    const WALL_LETTER = 'M';
    const wallCode = (n) => `${WALL_LETTER}${String(n).padStart(3, '0')}`;
    const isWallCode = (c) => new RegExp(`^${WALL_LETTER}\\d{3,4}$`).test(String(c == null ? '' : c).trim());
    const cleanWallNext = (raw) => Math.min(99999, Math.max(0, Math.round(Number(raw)) || 0));
    // Cada pared que ya trae un código M### que no se repite lo conserva; la que no, recibe el siguiente después del último que se dio (wallNext) o, si es mayor, del más alto que hay. Un obstáculo que no es pared no lleva código.
    function assignWallCodes(layout) {
        if (!layout || !Array.isArray(layout.obstacles)) return layout;
        const isWall = (o) => !!o && o.kind === 'wall';
        const floor = cleanWallNext(layout.wallNext);
        if (!layout.obstacles.some(isWall) && !floor && !layout.obstacles.some((o) => o && o.code !== undefined)) return layout;
        const used = new Set();
        const keep = layout.obstacles.map((o) => {
            if (!isWall(o)) return '';
            const c = String(o.code == null ? '' : o.code).trim().toUpperCase();
            if (isWallCode(c) && !used.has(c)) { used.add(c); return c; }
            return '';
        });
        let given = Math.max(floor, 0, ...Array.from(used).map((c) => Number(c.slice(1))));
        let changed = false;
        const obstacles = layout.obstacles.map((o, i) => {
            if (!isWall(o)) return o; // el código de un obstáculo que no es pared (K001…) lo cuida assignItemCodes
            let code = keep[i];
            if (!code) {
                let n = given + 1;
                while (used.has(wallCode(n))) n += 1;
                code = wallCode(n);
                used.add(code);
                given = n;
            }
            if (code === o.code) return o;
            changed = true;
            return { ...o, code };
        });
        if (!changed && given === floor) return layout;
        const out = { ...layout, obstacles };
        if (given) out.wallNext = given; else delete out.wallNext;
        return out;
    }
    // Al guardar: los códigos de las paredes no se editan. Una pared que ya existía conserva el suyo; una nueva recibe el siguiente (lo que ya se dio antes no se vuelve a dar, aunque esa pared se haya borrado).
    function lockWallCodes(next, previous) {
        if (!next || !Array.isArray(next.obstacles)) return next;
        const before = new Map(((previous && previous.obstacles) || []).filter((o) => o && o.kind === 'wall').map((o) => [o.id, o.code]));
        // el piso es SOLO lo ya guardado (el contador guardado y los códigos que ya tenían las paredes): si contara también el del borrador, cada vez que la pantalla recalcula una pared nueva tomaría un número más
        let floor = cleanWallNext(previous && previous.wallNext);
        before.forEach((c) => { if (isWallCode(c)) floor = Math.max(floor, Number(String(c).trim().slice(1))); });
        const obstacles = next.obstacles.map((o) => {
            if (!o || o.kind !== 'wall') return o;
            const code = before.has(o.id) ? before.get(o.id) : '';
            return code === o.code ? o : { ...o, code };
        });
        return assignWallCodes({ ...next, obstacles, wallNext: floor });
    }
    // ---- Códigos de puertas, conexiones de luz, obstáculos y objetos ---------------------------------------------------------------------------------------
    // Cada puerta (D001…), conexión de luz (C001…), obstáculo que no es pared (K001…) y objeto (J001…) lleva su código ÚNICO: lo pone el sistema, consecutivo en su lista, no se edita y NO se vuelve a usar aunque se borre
    // (el contador de lo ya dado viaja con el Layout: doorNext, powerNext, obstacleNext, objectNext). Las letras están aquí: una línea para cambiarlas. Un Layout de antes sin códigos los recibe al leerlo.
    const ITEM_CODES = [
        { list: 'doors', letter: 'D', next: 'doorNext', pick: null },
        { list: 'power', letter: 'C', next: 'powerNext', pick: null },
        { list: 'obstacles', letter: 'K', next: 'obstacleNext', pick: (o) => o.kind !== 'wall' },
        { list: 'objects', letter: 'J', next: 'objectNext', pick: null },
    ];
    function assignItemCodes(layout) {
        let out = layout;
        ITEM_CODES.forEach(({ list, letter, next, pick }) => {
            const items = out && out[list];
            if (!Array.isArray(items)) return;
            const mine = (o) => !!o && (!pick || pick(o));
            const floor = cleanWallNext(out[next]);
            if (!items.some(mine) && !floor) return;
            const re = new RegExp(`^${letter}\\d{3,4}$`);
            const codeOf = (n) => `${letter}${String(n).padStart(3, '0')}`;
            const used = new Set();
            const keep = items.map((o) => { if (!mine(o)) return ''; const c = String(o.code == null ? '' : o.code).trim().toUpperCase(); if (re.test(c) && !used.has(c)) { used.add(c); return c; } return ''; });
            let given = Math.max(floor, 0, ...Array.from(used).map((c) => Number(c.slice(1))));
            let changed = false;
            const coded = items.map((o, i) => {
                if (!mine(o)) return o;
                let c = keep[i];
                if (!c) { let n = given + 1; while (used.has(codeOf(n))) n += 1; c = codeOf(n); used.add(c); given = n; }
                if (c === o.code) return o;
                changed = true;
                return { ...o, code: c };
            });
            if (!changed && given === floor) return;
            out = { ...out, [list]: coded };
            if (given) out[next] = given; else delete out[next];
        });
        return out;
    }
    // Al guardar manda lo ya guardado: cada renglón que ya existía conserva su código y el contador solo sube (lo nuevo recibe el siguiente).
    function lockItemCodes(next, previous) {
        let out = next;
        ITEM_CODES.forEach(({ list, letter, next: nk, pick }) => {
            if (!out || !Array.isArray(out[list])) return;
            const mine = (o) => !!o && (!pick || pick(o));
            const re = new RegExp(`^${letter}\\d{3,4}$`);
            const before = new Map(((previous && previous[list]) || []).filter(mine).map((o) => [o.id, o.code]));
            let floor = cleanWallNext(previous && previous[nk]);
            before.forEach((c) => { if (re.test(String(c == null ? '' : c).trim())) floor = Math.max(floor, Number(String(c).trim().slice(1))); });
            const items = out[list].map((o) => { if (!mine(o)) return o; const c = before.has(o.id) ? before.get(o.id) : ''; return c === o.code ? o : { ...o, code: c }; });
            out = { ...out, [list]: items, [nk]: floor };
            if (!floor) delete out[nk];
        });
        return assignItemCodes(out);
    }
    function deriveFootprintZones(layout) {
        if (!layout || !Array.isArray(layout.footprints)) return layout;
        let changed = false;
        const footprints = layout.footprints.map((f) => {
            const id = zoneOfPoint(layout.zones, (Number(f.x) || 0) + (Number(f.l) || 0) / 2, (Number(f.y) || 0) + (Number(f.d) || 0) / 2);
            if ((f.zoneId || '') === id) return f;
            changed = true;
            return { ...f, zoneId: id };
        });
        return changed ? { ...layout, footprints } : layout;
    }
    // El código de una HUELLA es H001, H002… y lo pone el sistema: consecutivo POR ZONA (cada zona tiene su H001, su H002…) y sin repetirse dentro de su zona; ahí está la H del Localizador, que va siempre
    // detrás de la zona (Z006.H001…). Una huella que ya tiene su H### y no se repite en su zona lo conserva (se escribe con tres cifras: h5 -> H005); una que todavía no lo tiene (las de antes, que llevaban el
    // código de su espacio, R-05; o una nueva) reclama el número de su código de antes (R-05 -> H005) si está libre en su zona y, si no, recibe el siguiente después del más alto de su zona, en el orden de la lista.
    // Hace falta que las zonas de las huellas ya estén calculadas (deriveFootprintZones). Es idempotente.
    const huellaCode = (n) => `H${String(n).padStart(3, '0')}`;
    const isHuellaCode = (c) => /^H\d{1,4}$/i.test(String(c == null ? '' : c).trim()) && Number(String(c).trim().slice(1)) >= 1;
    function assignHuellaCodes(layout) {
        if (!layout || !Array.isArray(layout.footprints)) return layout;
        let changed = false;
        const out = layout.footprints.slice();
        const groups = new Map();
        out.forEach((f, i) => { const key = f.zoneId || ''; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(i); });
        groups.forEach((indexes) => {
            const used = new Set();
            const kept = new Set();
            // 1) los que ya son H### y no se repiten en su zona (el primero de la lista manda)
            indexes.forEach((i) => {
                if (!isHuellaCode(out[i].code)) return;
                const code = huellaCode(Number(String(out[i].code).trim().slice(1)));
                if (used.has(code)) return;
                used.add(code);
                kept.add(i);
                if (code !== out[i].code) { out[i] = { ...out[i], code }; changed = true; }
            });
            // 2) los demás reclaman el número de su código de antes si está libre en la zona
            const pending = [];
            indexes.forEach((i) => {
                if (kept.has(i)) return;
                const m = String(out[i].code == null ? '' : out[i].code).match(/(\d+)\s*$/);
                const n = m ? Number(m[1]) : 0;
                const code = n >= 1 && n <= 9999 ? huellaCode(n) : '';
                if (code && !used.has(code)) { used.add(code); out[i] = { ...out[i], code }; changed = true; } else pending.push(i);
            });
            // 3) los que chocan o no traen número: los siguientes después del más alto de la zona
            let next = Math.max(0, ...Array.from(used).map((c) => Number(c.slice(1)))) + 1;
            pending.forEach((i) => { while (used.has(huellaCode(next))) next += 1; const code = huellaCode(next); used.add(code); out[i] = { ...out[i], code }; changed = true; });
        });
        return changed ? { ...layout, footprints: out } : layout;
    }
    // El objeto con su código justo detrás del nombre (el mismo orden en el que lo deja la validación, para que comparar una zona migrada con la que se guarda no la vea distinta).
    function withCodeAfterName(obj, code) {
        if ('code' in obj) return { ...obj, code };
        const { id, name, ...rest } = obj;
        return { id, name, code, ...rest };
    }
    // El código de una ZONA es Z001, Z002… y lo pone el sistema: consecutivo en el orden en que se crean, sin repetirse (de ahí sale la Z del Localizador). Una zona que ya tiene su Z### lo conserva; las de antes
    // reclaman el número con que termina su nombre (Zona 6 -> Z006) si está libre y, si no (Recepción, Oficinas…), reciben el siguiente después del más alto, en el orden de la lista. Es idempotente.
    const zoneCodeOf = (n) => `Z${String(n).padStart(3, '0')}`;
    const isZoneCode = (c) => /^Z\d{1,4}$/i.test(String(c == null ? '' : c).trim()) && Number(String(c).trim().slice(1)) >= 1;
    function assignZoneCodes(layout, { byName = true } = {}) {
        if (!layout || !Array.isArray(layout.zones)) return layout;
        let changed = false;
        const out = layout.zones.slice();
        const used = new Set();
        const kept = new Set();
        out.forEach((z, i) => {
            if (!isZoneCode(z.code)) return;
            const code = zoneCodeOf(Number(String(z.code).trim().slice(1)));
            if (used.has(code)) return;
            used.add(code);
            kept.add(i);
            if (code !== z.code) { out[i] = withCodeAfterName(z, code); changed = true; }
        });
        const pending = [];
        out.forEach((z, i) => {
            if (kept.has(i)) return;
            const m = byName ? String(z.name == null ? '' : z.name).match(/(\d+)\s*$/) : null;
            const n = m ? Number(m[1]) : 0;
            const code = n >= 1 && n <= 9999 ? zoneCodeOf(n) : '';
            if (code && !used.has(code)) { used.add(code); out[i] = withCodeAfterName(out[i], code); changed = true; } else pending.push(i);
        });
        let next = Math.max(0, ...Array.from(used).map((c) => Number(c.slice(1)))) + 1;
        pending.forEach((i) => { while (used.has(zoneCodeOf(next))) next += 1; const code = zoneCodeOf(next); used.add(code); out[i] = withCodeAfterName(out[i], code); changed = true; });
        return changed ? { ...layout, zones: out } : layout;
    }
    // El código de un ACTIVO es su letra y un número: A anaquel, R rack, G gabeta, T tarima en piso, F frío (la letra la da su tipo) y el consecutivo es POR ZONA Y POR TIPO (A001, A002… de cada zona; ese mismo código
    // es la pieza del activo en el Localizador). Lo pone el sistema. Los de antes (R-05) conservan su número con la letra de su tipo (A005) si está libre en su zona y tipo; los que chocan reciben el siguiente
    // después del más alto. Hace falta que los activos ya traigan la zona de su huella (deriveSpaces). Es idempotente.
    const ASSET_LETTER = { rack: 'A', rackpal: 'R', cabinet: 'G', pallet: 'T', cold: 'F' };
    const spaceCodeOf = (type, n) => `${ASSET_LETTER[type] || 'A'}${String(n).padStart(3, '0')}`;
    const isSpaceCode = (c, type) => { const m = /^([A-Za-z])(\d{1,4})$/.exec(String(c == null ? '' : c).trim()); return !!m && m[1].toUpperCase() === (ASSET_LETTER[type] || 'A') && Number(m[2]) >= 1; };
    function assignSpaceCodes(layout) {
        if (!layout || !Array.isArray(layout.spaces)) return layout;
        let changed = false;
        const out = layout.spaces.slice();
        const groups = new Map();
        out.forEach((s, i) => { const key = `${s.zoneId || ''}|${s.type || 'rack'}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(i); });
        groups.forEach((indexes) => {
            const type = out[indexes[0]].type || 'rack';
            const used = new Set();
            const kept = new Set();
            indexes.forEach((i) => {
                if (!isSpaceCode(out[i].code, type)) return;
                const code = spaceCodeOf(type, Number(String(out[i].code).trim().slice(1)));
                if (used.has(code)) return;
                used.add(code);
                kept.add(i);
                if (code !== out[i].code) { out[i] = { ...out[i], code }; changed = true; }
            });
            const pending = [];
            indexes.forEach((i) => {
                if (kept.has(i)) return;
                const m = String(out[i].code == null ? '' : out[i].code).match(/(\d+)\s*$/);
                const n = m ? Number(m[1]) : 0;
                const code = n >= 1 && n <= 9999 ? spaceCodeOf(type, n) : '';
                if (code && !used.has(code)) { used.add(code); out[i] = { ...out[i], code }; changed = true; } else pending.push(i);
            });
            let next = Math.max(0, ...Array.from(used).map((c) => Number(c.slice(1)))) + 1;
            pending.forEach((i) => { while (used.has(spaceCodeOf(type, next))) next += 1; const code = spaceCodeOf(type, next); used.add(code); out[i] = { ...out[i], code }; changed = true; });
        });
        return changed ? { ...layout, spaces: out } : layout;
    }
    // Renumera los códigos de los ACTIVOS: en cada zona y tipo quedan consecutivos desde 001, en el orden de su número de ahora (los que empatan, en el orden de la tabla). Lo pide una persona (icono Renumerar,
    // que se aplica al guardar): los códigos guardados no se mueven solos. Devuelve el mismo Layout si ya estaban consecutivos.
    function renumberSpaceCodes(layout) {
        if (!layout || !Array.isArray(layout.spaces)) return layout;
        const groups = new Map();
        layout.spaces.forEach((s, i) => { const key = `${s.zoneId || ''}|${s.type || 'rack'}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(i); });
        const spaces = layout.spaces.slice();
        let changed = false;
        groups.forEach((indexes, key) => {
            const type = key.split('|')[1];
            const num = (i) => { const m = /(\d+)\s*$/.exec(String(spaces[i].code == null ? '' : spaces[i].code)); return m ? Number(m[1]) : Infinity; };
            indexes.slice().sort((a, b) => num(a) - num(b) || a - b).forEach((i, n) => {
                const code = spaceCodeOf(type, n + 1);
                if (spaces[i].code !== code) { spaces[i] = { ...spaces[i], code }; changed = true; }
            });
        });
        return changed ? { ...layout, spaces } : layout;
    }
    // Al guardar: los códigos de las zonas, las huellas y los activos no se editan. Lo que ya existía conserva el suyo; lo nuevo, o lo que se movió a otra zona (llega como si fuera nuevo), lo recibe del sistema.
    // Un activo al que se le cambió el tipo recibe el siguiente consecutivo de su tipo nuevo en su zona (un anaquel A020 que pasa a Frío es F001, no F020); si regresa a su tipo guardado, recupera su código.
    function lockCodes(next, previous) {
        if (!next) return next;
        let out = next;
        if (Array.isArray(out.zones)) {
            const before = new Map(((previous && previous.zones) || []).map((z) => [z.id, z.code]));
            // una zona nueva NO toma el número de su nombre (Zona 9 no es Z009): recibe el siguiente consecutivo; eso solo lo hacen las de antes, al leerlas
            out = assignZoneCodes({ ...out, zones: out.zones.map((z) => { const code = before.has(z.id) ? before.get(z.id) : ''; return code === z.code ? z : withCodeAfterName(z, code); }) }, { byName: false });
        }
        out = lockHuellaCodes(out, previous);
        out = lockSensorCodes(out, previous);
        out = lockTransitCodes(out, previous);
        out = lockSafetyCodes(out, previous);
        out = lockWallCodes(out, previous);
        out = lockItemCodes(out, previous);
        if (Array.isArray(out.spaces)) {
            const before = new Map(((previous && previous.spaces) || []).map((s) => [s.id, s]));
            const spaces = out.spaces.map((s) => {
                const was = before.get(s.id);
                let code = '';
                if (was && (was.zoneId || '') === (s.zoneId || '') && (was.type || 'rack') === (s.type || 'rack')) code = was.code;
                return code === s.code ? s : { ...s, code };
            });
            out = assignSpaceCodes({ ...out, spaces });
        }
        return out;
    }
    // Al guardar: los códigos no se editan. Una huella que ya existía y sigue en su zona conserva el suyo; una nueva, o una que se movió a otra zona (llega como si fuera nueva), recibe el siguiente de su zona.
    function lockHuellaCodes(next, previous) {
        if (!next || !Array.isArray(next.footprints)) return next;
        const before = new Map(((previous && previous.footprints) || []).map((f) => [f.id, f]));
        const footprints = next.footprints.map((f) => { const was = before.get(f.id); const code = was && (was.zoneId || '') === (f.zoneId || '') ? was.code : ''; return code === f.code ? f : { ...f, code }; });
        return assignHuellaCodes({ ...next, footprints });
    }
    // Pone en cada activo lo que viene de su huella (ver arriba). Es idempotente: se puede llamar cuantas veces haga falta. active del activo = no está apagado él (off) ni su huella.
    function deriveSpaces(layout) {
        if (!layout || !Array.isArray(layout.footprints) || !Array.isArray(layout.spaces)) return layout;
        const byId = new Map(layout.footprints.map((f) => [f.id, f]));
        const mates = new Map();
        layout.spaces.forEach((s) => { if (!mates.has(s.footprintId)) mates.set(s.footprintId, []); mates.get(s.footprintId).push(s); });
        const placed = new Map();
        const spaces = layout.spaces.map((s) => {
            const f = byId.get(s.footprintId);
            // un activo recién agregado todavía sin huella (hay que elegirla): sin lugar en el piso ni medidas, así no suma ni se dibuja hasta que lo ligan a su huella
            if (!f && !s.footprintId) return { ...s, zoneId: '', x: 0, y: 0, l: 0, d: 0, h: 0, active: false };
            if (!f) return s;
            const group = mates.get(f.id);
            if (!placed.has(f.id)) placed.set(f.id, placeGroup(f, group));
            const { x, y, l, d, h } = placed.get(f.id)[group.indexOf(s)];
            const out = { ...s, zoneId: f.zoneId || '', x, y, l, d, h, active: s.off !== true && f.active !== false };
            // el nombre que el usuario le puso al activo (ownName) manda; sin él se ve el de su huella
            if (s.ownName) out.name = s.ownName; else if (f.name) out.name = f.name; else delete out.name;
            // El color del activo es PROPIO (Formato de activo): ya no hereda el de su huella, que se dibuja aparte, debajo. En un Layout guardado de antes (sin la marca ownAssetFmt) un formato igual al de su huella viene de cuando lo heredaba y no cuenta como propio.
            if (!layout.ownAssetFmt && s.fmt && f.fmt && sameFmt(s.fmt, f.fmt)) delete out.fmt;
            return out;
        });
        return { ...layout, spaces };
    }

    // Acomoda los activos de UNA huella uno junto al otro, a lo largo de su lado más largo y en el orden de la tabla. Cada activo puede traer su lugar (ox, oy: distancia desde la esquina de la huella) y sus medidas (ol largo, od fondo,
    // oh alto); lo que no trae se acomoda solo: el largo del lado se reparte en partes iguales entre los que no lo traen (lo que sobra después de los que sí), empieza justo donde termina el anterior, el fondo es el de la huella y va
    // pegado al borde (0), y el alto es el de la huella. Sin nada propio queda exactamente como antes (partes iguales). Devuelve, en el mismo orden, { x, y, l, d, h } de cada activo en el piso de la nave.
    function placeGroup(f, group) {
        const alongX = (f.l || 0) >= (f.d || 0);
        const A = alongX ? f.l : f.d; // lo que mide el lado más largo
        const B = alongX ? f.d : f.l; // lo que hay a lo ancho
        const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
        const sizeA = (s) => num(alongX ? s.ol : s.od);
        const sizeB = (s) => num(alongX ? s.od : s.ol);
        const posA = (s) => num(alongX ? s.ox : s.oy);
        const posB = (s) => num(alongX ? s.oy : s.ox);
        const fixed = group.reduce((acc, s) => acc + (sizeA(s) || 0), 0);
        const freeCount = group.filter((s) => sizeA(s) === null).length;
        const share = freeCount ? Math.max(0, round2((A - fixed) / freeCount)) : 0;
        let freeSeen = 0;
        let cursor = 0;
        return group.map((s) => {
            let a = sizeA(s);
            if (a === null) {
                freeSeen += 1;
                // el último sin largo toma exactamente lo que queda (así los redondeos no dejan un pedacito)
                a = freeSeen === freeCount ? Math.max(0, round2(A - fixed - share * (freeCount - 1))) : share;
            }
            const startA = posA(s) !== null ? posA(s) : cursor;
            cursor = round2(startA + a);
            const b = sizeB(s) !== null ? sizeB(s) : B;
            const startB = posB(s) !== null ? posB(s) : 0;
            return { x: round2(f.x + (alongX ? startA : startB)), y: round2(f.y + (alongX ? startB : startA)), l: alongX ? a : b, d: alongX ? b : a, h: num(s.oh) !== null ? num(s.oh) : f.h };
        });
    }

    // ---- La huella dentro de su zona ---------------------------------------------------------------------------------------------------------
    // Una huella siempre va DENTRO de una zona y debe caber completa (su rectángulo entero adentro de la zona, de cualquier forma) y no ser más alta que la nave. Se mira sobre un Layout ya normalizado: la zona de
    // cada huella es la que sale de dónde está (deriveFootprintZones). Tres faltas: nozone (el centro cae fuera de toda zona), out (se sale de los límites de su zona) y tall (más alta que la nave).
    // Lo que ya estaba mal antes de esta regla solo se marca; lo NUEVO o lo que cambió (la huella o su zona) no se deja guardar (ver newFootprintViolations).
    const crossesProperly = (p, q, r, s) => {
        const o = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        const d1 = o(p, q, r); const d2 = o(p, q, s); const d3 = o(r, s, p); const d4 = o(r, s, q);
        return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
    };
    // El rectángulo (x, y, l, d) cabe entero en el polígono: sus cuatro esquinas adentro, ninguna esquina del polígono metida dentro del rectángulo y ningún lado del uno cruza un lado del otro. Pegado a la pared cuenta como adentro.
    function rectInsidePolygon(pts, x, y, l, d) {
        const e = 0.001;
        const x0 = x + e; const y0 = y + e; const x1 = x + l - e; const y1 = y + d - e;
        if (!(x1 > x0 && y1 > y0)) return pointInPolygon(x + l / 2, y + d / 2, pts);
        const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        if (!corners.every((c) => pointInPolygon(c[0], c[1], pts))) return false;
        if (pts.some((p) => p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1)) return false;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i]; const b = pts[(i + 1) % pts.length];
            for (let k = 0; k < 4; k++) if (crossesProperly(a, b, corners[k], corners[(k + 1) % 4])) return false;
        }
        return true;
    }
    function footprintViolations(layout) {
        const out = [];
        if (!layout || !Array.isArray(layout.footprints)) return out;
        const byId = new Map((layout.zones || []).map((z) => [z.id, z]));
        const heights = (layout.vertices || []).map((p) => Number(p[2]) || 0);
        const maxH = heights.length ? Math.max(...heights) : 0;
        layout.footprints.forEach((f) => {
            const z = f.zoneId ? byId.get(f.zoneId) : null;
            const base = { id: f.id, code: f.code };
            const geo = JSON.stringify([f.x, f.y, f.l, f.d, f.h]);
            if (!z) {
                out.push({ ...base, kind: 'nozone', sig: geo, message: `La huella ${f.code} queda fuera de toda zona: acomódala dentro de una zona.` });
            } else {
                const pts = zonePoints(z);
                if (!(pts && pts.length >= 3 && rectInsidePolygon(pts, f.x, f.y, f.l, f.d))) {
                    out.push({ ...base, kind: 'out', zoneId: z.id, zoneName: z.name, sig: geo + JSON.stringify([z.id, pts]), message: `La huella ${f.code} no cabe dentro de su zona ${z.name}: cambia su lugar o sus medidas, o agranda la zona.` });
                }
            }
            // el piso de su zona cuenta: una huella de 3 m sobre un piso a +1.2 m llega a 4.2 m
            const lvl = round2(floorLevelAt(layout, f.x + f.l / 2, f.y + f.d / 2));
            const top = round2(f.h + lvl);
            if (maxH > 0 && top > maxH + 0.001) {
                out.push(lvl !== 0
                    ? { ...base, kind: 'tall', h: f.h, maxH, level: lvl, top, sig: geo + JSON.stringify([maxH, lvl]), message: `La huella ${f.code} mide ${f.h} m de alto sobre un piso a ${lvl > 0 ? '+' : ''}${lvl} m (llega a ${top} m) y la nave solo ${maxH} m.` }
                    : { ...base, kind: 'tall', h: f.h, maxH, sig: geo + JSON.stringify(maxH), message: `La huella ${f.code} mide ${f.h} m de alto y la nave solo ${maxH} m.` });
            }
        });
        return out;
    }
    // Las faltas que hay en next y que antes no estaban igual: huella nueva, que se movió o cambió de medidas, o cuya zona cambió. Esas no se dejan guardar; lo que ya estaba mal y no se tocó solo se marca.
    function newFootprintViolations(next, previous) {
        const before = previous ? footprintViolations(previous) : [];
        return footprintViolations(next).filter((v) => !before.some((p) => p.id === v.id && p.kind === v.kind && p.sig === v.sig));
    }
    // Las huellas que ya existían y ahora caen en OTRA zona, ya sea porque se movió la huella o porque se movió o agrandó una zona (la zona de una huella sale siempre de dónde está en el croquis). Su Localizador
    // cambia (otra zona y el siguiente código de esa zona) y el texto ya impreso queda viejo, así que el editor le avisa a la persona ANTES de guardar. next es el borrador ya con las zonas y los códigos que
    // pondrá el servidor. Cada una trae el Localizador de antes y el de ahora (zona.huella), el nombre de las dos zonas y cuántos de sus activos cambian también de código.
    function footprintZoneChanges(next, previous) {
        if (!next || !previous || !Array.isArray(next.footprints) || !Array.isArray(previous.footprints)) return [];
        const was = new Map(previous.footprints.map((f) => [f.id, f]));
        const oldSpaces = new Map((previous.spaces || []).map((s) => [s.id, s]));
        const zoneOf = (layout, id) => (layout.zones || []).find((z) => z.id === id) || null;
        const locator = (zone, f) => [zone && zone.code, f.code].filter(Boolean).join('.');
        return next.footprints.map((f) => {
            const before = was.get(f.id);
            if (!before || (before.zoneId || '') === (f.zoneId || '')) return null;
            const from = zoneOf(previous, before.zoneId);
            const to = zoneOf(next, f.zoneId);
            const assets = (next.spaces || []).filter((s) => s.footprintId === f.id && oldSpaces.has(s.id) && oldSpaces.get(s.id).code !== s.code).length;
            return { id: f.id, from: locator(from, before), to: locator(to, f), fromZone: from ? from.name : '', toZone: to ? to.name : '', assets };
        }).filter(Boolean);
    }

    // ---- Tránsito: los pasillos -------------------------------------------------------------------------------------------------------------
    // Un pasillo es por donde pasan personas, montacargas, carritos y plataformas: vive DENTRO de una zona (la zona sale de su posición, como la de las huellas), se conecta con otro pasillo que lo toque, y nada puede ir adentro
    // (ni huellas, ni columnas, ni paredes, ni desniveles). Lo que transita por él tiene que caber (ancho en el lado angosto, largo en el lado largo y alto en su «alto libre», si lo tiene). Rectángulo x, y, l (largo, en X) y w (ancho, en Y).
    const TRANSIT_TYPES = ['main', 'between'];
    const TRANSIT_WHO = ['people', 'forklift', 'cart', 'platform', 'other'];
    // Medidas de partida de lo que transita (metros): ancho, largo y alto. «Otro» arranca sin medidas (no se revisa hasta que se capturen).
    const TRANSIT_SIZE_DEFAULTS = { people: { w: 0.6, l: 0.5, h: 1.8 }, forklift: { w: 1.2, l: 2.8, h: 2.2 }, cart: { w: 0.7, l: 1.3, h: 1.2 }, platform: { w: 0.9, l: 1.6, h: 1.5 }, other: { w: 0, l: 0, h: 0 } };
    function transitSizesOf(layout) {
        const stored = (layout && layout.transitSizes) || {};
        const out = {};
        TRANSIT_WHO.forEach((k) => {
            const d = TRANSIT_SIZE_DEFAULTS[k];
            const s = stored[k] || {};
            out[k] = { w: Number.isFinite(Number(s.w)) && s.w !== undefined ? Number(s.w) : d.w, l: Number.isFinite(Number(s.l)) && s.l !== undefined ? Number(s.l) : d.l, h: Number.isFinite(Number(s.h)) && s.h !== undefined ? Number(s.h) : d.h };
        });
        return out;
    }
    // Los pasillos del Layout ya viejos eran zonas de tipo pasillo: al leerlos (una sola vez, transitMigrated) cada zona rectangular de pasillo pasa a Tránsito con el mismo lugar y medidas y deja de estar en Zonas.
    function migrateTransit(layout) {
        if (!layout || typeof layout !== 'object') return layout;
        if (layout.transit != null && !Array.isArray(layout.transit)) return layout; // entrada dañada: la validación lo reporta
        const transit = Array.isArray(layout.transit) ? layout.transit : [];
        const base = { ...layout, transit, transitSizes: layout.transitSizes && typeof layout.transitSizes === 'object' ? layout.transitSizes : transitSizesOf(null) };
        if (layout.transitMigrated || !Array.isArray(layout.zones)) return base;
        const legacy = layout.zones.filter((z) => z && (z.type === 'aisle' || z.type === 'aisle2') && !hasPoints(z) && z.active !== false);
        if (!legacy.length) return { ...base, transitMigrated: true };
        const taken = new Set(transit.map((p) => p.id));
        const made = legacy.map((z) => {
            let id = `t${String(z.id)}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'tz';
            let n = 1;
            while (taken.has(id)) { id = `${id.slice(0, 36)}${n}`; n += 1; }
            taken.add(id);
            return { id, name: z.name, type: z.type === 'aisle' ? 'main' : 'between', who: [], x: z.x, y: z.y, l: z.l, w: z.w };
        });
        return { ...base, zones: layout.zones.filter((z) => !legacy.includes(z)), transit: [...transit, ...made], transitMigrated: true };
    }
    // La zona del pasillo sale de su posición: la zona más chica que contiene su centro (sin zona si cae fuera de todas).
    function deriveTransitZones(layout) {
        if (!layout || !Array.isArray(layout.transit)) return layout;
        let changed = false;
        const transit = layout.transit.map((p) => {
            const id = zoneOfPoint(layout.zones, (Number(p.x) || 0) + (Number(p.l) || 0) / 2, (Number(p.y) || 0) + (Number(p.w) || 0) / 2);
            if ((p.zoneId || '') === id) return p;
            changed = true;
            return { ...p, zoneId: id };
        });
        return changed ? { ...layout, transit } : layout;
    }
    const transitCode = (n) => `T${String(n).padStart(3, '0')}`;
    const isTransitCode = (c) => /^T\d{3,4}$/.test(String(c == null ? '' : c).trim());
    // Cada pasillo que ya trae un código T### que no se repite lo conserva; el que no, recibe el siguiente después del más alto del Layout.
    function assignTransitCodes(layout) {
        if (!layout || !Array.isArray(layout.transit)) return layout;
        const used = new Set();
        const keep = layout.transit.map((p) => { const c = String(p.code == null ? '' : p.code).trim().toUpperCase(); if (isTransitCode(c) && !used.has(c)) { used.add(c); return c; } return ''; });
        let next = Math.max(0, ...Array.from(used).map((c) => Number(c.slice(1)))) + 1;
        let changed = false;
        const transit = layout.transit.map((p, i) => {
            let code = keep[i];
            if (!code) { while (used.has(transitCode(next))) next += 1; code = transitCode(next); used.add(code); next += 1; }
            if (code === p.code) return p;
            changed = true;
            return { ...p, code };
        });
        return changed ? { ...layout, transit } : layout;
    }
    // Al guardar: los códigos de los pasillos no se editan. Uno que ya existía conserva el suyo; uno nuevo recibe el siguiente.
    function lockTransitCodes(next, previous) {
        if (!next || !Array.isArray(next.transit)) return next;
        const before = new Map(((previous && previous.transit) || []).map((p) => [p.id, p.code]));
        const transit = next.transit.map((p) => { const code = before.has(p.id) ? before.get(p.id) : ''; return code === p.code ? p : { ...p, code }; });
        return assignTransitCodes({ ...next, transit });
    }
    // ¿Se encima (con superficie, no solo se tocan) un rectángulo con un polígono convexo? Prueba de ejes separadores.
    function rectOverlapsConvex(rect, poly) {
        const rp = [[rect.x, rect.y], [rect.x + rect.l, rect.y], [rect.x + rect.l, rect.y + rect.w], [rect.x, rect.y + rect.w]];
        const polys = [rp, poly];
        const EPS = 1e-6;
        for (const pts of polys) {
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i]; const b = pts[(i + 1) % pts.length];
                const ax = -(b[1] - a[1]); const ay = b[0] - a[0];
                const len = Math.hypot(ax, ay);
                if (!(len > 1e-9)) continue;
                const proj = (set) => { const v = set.map((p) => (p[0] * ax + p[1] * ay) / len); return [Math.min(...v), Math.max(...v)]; };
                const r1 = proj(rp); const r2 = proj(poly);
                if (r1[1] <= r2[0] + EPS || r2[1] <= r1[0] + EPS) return false;
            }
        }
        return true;
    }
    // ---- Lo que transita sale del CATÁLOGO de la empresa (Catálogos > «Lo que transita») -----------------------------------------------------------
    // El servidor (y la pantalla, al leer el Layout) ponen la lista en layout.transitCatalog ([{ id, name, kind, w, l, h, status }]); NO se guarda con el Layout. Un pasillo guarda los ids de lo que transita (who).
    // Los Layouts de antes guardaban claves (people, forklift…): se siguen leyendo con las medidas de partida y, en cuanto hay catálogo, pasan solos a los ids (applyTransitCatalog).
    const TRANSIT_KINDS = ['person', 'forklift', 'cart', 'platform', 'other'];
    const LEGACY_WHO_KIND = { people: 'person', forklift: 'forklift', cart: 'cart', platform: 'platform', other: 'other' };
    const transitCatalogOf = (layout) => (Array.isArray(layout && layout.transitCatalog) ? layout.transitCatalog : []);
    // El renglón del catálogo de lo que transita (un id) o, para lo de antes, su clave con las medidas de partida: { id, key, name, kind, w, l, h, legacy?, missing? }.
    function transitWhoInfo(layout, who) {
        if (typeof who === 'number' || /^\d+$/.test(String(who))) {
            const id = Number(who);
            const it = transitCatalogOf(layout).find((c) => Number(c.id) === id);
            return it
                ? { id, key: String(id), name: it.name || '', kind: it.kind || 'other', w: Number(it.w) || 0, l: Number(it.l) || 0, h: Number(it.h) || 0, status: it.status }
                : { id, key: String(id), name: '', kind: 'other', w: 0, l: 0, h: 0, missing: true };
        }
        const d = transitSizesOf(layout)[who] || { w: 0, l: 0, h: 0 };
        return { id: null, key: String(who), name: '', kind: LEGACY_WHO_KIND[who] || 'other', w: d.w, l: d.l, h: d.h, legacy: true };
    }
    const objectShapeOfKind = (kind) => (kind === 'person' ? 'person' : kind === 'forklift' ? 'forklift' : 'box');
    // Con el catálogo a la mano: lo de antes (claves) pasa a los ids del catálogo y cada objeto toma del catálogo su dibujo y sus medidas (así, si cambian en el catálogo, cambian en todos). Sin catálogo no toca nada.
    function applyTransitCatalog(layout) {
        const catalog = transitCatalogOf(layout);
        if (!layout || !catalog.length) return layout;
        const firstOfKind = (kind) => catalog.find((c) => c.kind === kind && c.status !== 'inactive') || catalog.find((c) => c.kind === kind) || null;
        let changed = false;
        const transit = (layout.transit || []).map((p) => {
            if (!Array.isArray(p.who) || !p.who.some((w) => typeof w === 'string' && !/^\d+$/.test(w))) return p;
            const who = [];
            p.who.forEach((w) => {
                if (typeof w === 'string' && !/^\d+$/.test(w)) { const it = firstOfKind(LEGACY_WHO_KIND[w]); if (it) { if (!who.includes(it.id)) who.push(it.id); return; } }
                const v = typeof w === 'string' ? (/^\d+$/.test(w) ? Number(w) : w) : w;
                if (!who.includes(v)) who.push(v);
            });
            changed = true;
            return { ...p, who };
        });
        const objects = (layout.objects || []).map((o) => {
            let it = o.equipId ? catalog.find((c) => Number(c.id) === Number(o.equipId)) : null;
            if (!it && !o.equipId) it = firstOfKind(o.type === 'forklift' ? 'forklift' : 'person');
            if (!it) return o;
            const next = { ...o, equipId: Number(it.id), type: objectShapeOfKind(it.kind), l: Number(it.l) || o.l, w: Number(it.w) || o.w, h: Number(it.h) || o.h || 0 };
            if (next.equipId === o.equipId && next.type === o.type && next.l === o.l && next.w === o.w && next.h === o.h) return o;
            changed = true;
            return next;
        });
        return changed ? { ...layout, transit, objects } : layout;
    }
    function transitProblemsOf(p, layout) {
        const narrow = Math.min(Number(p.l) || 0, Number(p.w) || 0);
        const long = Math.max(Number(p.l) || 0, Number(p.w) || 0);
        const out = [];
        (p.who || []).forEach((k) => {
            const d = transitWhoInfo(layout, k);
            if (!(d.w > 0 || d.l > 0 || d.h > 0)) return;
            const problems = [];
            if (d.w > narrow + 1e-6) problems.push('w');
            if (d.l > long + 1e-6) problems.push('l');
            if (Number(p.h) > 0 && d.h > Number(p.h) + 1e-6) problems.push('h');
            if (problems.length) out.push({ who: k, name: d.name, problems, size: { w: d.w, l: d.l, h: d.h } });
        });
        return out;
    }
    // Las faltas de los pasillos de un Layout normalizado. kind: nozone (queda fuera de toda zona), out (no cabe entera en su zona), fit (lo que transita no cabe; who dice quién y problems qué medida), blocked (hay algo adentro: otherId) y,
    // del lado de lo que estorba, intransit (una huella o un obstáculo metido en el pasillo transitId). sig cambia cuando algo de lo que importa cambia: lo que ya estaba mal y no se tocó solo se marca; lo nuevo no se deja guardar.
    function transitViolations(layout) {
        const out = [];
        if (!layout || !Array.isArray(layout.transit) || !layout.transit.length) return out;
        const byZone = new Map((layout.zones || []).map((z) => [z.id, z]));

        const prints = (layout.footprints || []).filter((f) => f.active !== false);
        const obstacles = obstacleShapes(layout);
        layout.transit.forEach((p) => {
            const base = { id: p.id, code: p.code };
            const geo = JSON.stringify([p.x, p.y, p.l, p.w, p.h || 0]);
            const z = p.zoneId ? byZone.get(p.zoneId) : null;
            if (!z) out.push({ ...base, kind: 'nozone', sig: geo, message: `El pasillo ${p.code} queda fuera de toda zona: acomódalo dentro de una zona.` });
            else {
                const pts = zonePoints(z);
                if (!(pts && pts.length >= 3 && rectInsidePolygon(pts, p.x, p.y, p.l, p.w))) out.push({ ...base, kind: 'out', zoneId: z.id, zoneName: z.name, sig: geo + JSON.stringify([z.id, pts]), message: `El pasillo ${p.code} no cabe dentro de su zona ${z.name}: si cruza el límite de dos zonas, se divide en dos pasillos que se tocan.` });
            }
            transitProblemsOf(p, layout).forEach((f) => out.push({ ...base, kind: 'fit', who: f.who, whoName: f.name, problems: f.problems, size: f.size, sig: geo + JSON.stringify([f.who, f.size]), message: `En el pasillo ${p.code} no cabe lo que transita (${f.name || f.who}): revisa sus medidas o las del pasillo.` }));
            const rect = { x: Number(p.x) || 0, y: Number(p.y) || 0, l: Number(p.l) || 0, w: Number(p.w) || 0 };
            prints.forEach((f) => {
                if (!rectOverlapsConvex(rect, [[f.x, f.y], [f.x + f.l, f.y], [f.x + f.l, f.y + f.d], [f.x, f.y + f.d]])) return;
                const g2 = JSON.stringify([f.x, f.y, f.l, f.d]);
                out.push({ ...base, kind: 'blocked', by: 'footprint', otherId: f.id, otherCode: f.code, sig: geo + g2, message: `La huella ${f.code} se mete en el pasillo ${p.code}: nada puede ir dentro de un pasillo.` });
                out.push({ id: f.id, code: f.code, kind: 'intransit', by: 'footprint', transitId: p.id, transitCode: p.code, sig: geo + g2, message: `La huella ${f.code} se mete en el pasillo ${p.code}: nada puede ir dentro de un pasillo.` });
            });
            obstacles.forEach(({ o, g }) => {
                if (!rectOverlapsConvex(rect, g.pts)) return;
                const g2 = JSON.stringify(g.pts);
                out.push({ ...base, kind: 'blocked', by: 'obstacle', otherId: o.id, otherCode: o.name, sig: geo + g2, message: `${o.name || 'Un obstáculo'} se mete en el pasillo ${p.code}: nada puede ir dentro de un pasillo.` });
                out.push({ id: o.id, code: o.name, kind: 'intransit', by: 'obstacle', transitId: p.id, transitCode: p.code, sig: geo + g2, message: `${o.name || 'Un obstáculo'} se mete en el pasillo ${p.code}: nada puede ir dentro de un pasillo.` });
            });
        });
        return out;
    }
    const transitKey = (v) => `${v.id}|${v.kind}|${v.who || ''}|${v.otherId || v.transitId || ''}|${v.sig}`;
    // Las faltas que hay en next y que antes no estaban igual (pasillo nuevo o cambiado, o algo nuevo que se metió).
    function newTransitViolations(next, previous) {
        const before = new Set((previous ? transitViolations(previous) : []).map(transitKey));
        return transitViolations(next).filter((v) => !before.has(transitKey(v)));
    }
    // Superficie de los pasillos: cada metro cuenta una sola vez aunque dos pasillos se encimen en un cruce. Sin encimes es la suma exacta.
    function transitArea(layout) {
        const list = (layout && layout.transit) || [];
        if (!list.length) return { sum: 0, union: 0, overlap: 0 };
        const sum = list.reduce((acc, p) => acc + (Number(p.l) || 0) * (Number(p.w) || 0), 0);
        if (list.length < 2) return { sum, union: sum, overlap: 0 };
        const grid = coveredArea(layout.vertices || [], list.map((p) => ({ x: p.x, y: p.y, l: p.l, w: p.w })));
        const union = sum - grid <= sum * 0.01 + 0.1 ? sum : grid;
        return { sum, union, overlap: Math.max(0, sum - union) };
    }

    // ---- Objetos: personas y montacargas dibujados en el plano ---------------------------------------------------------------------------------
    // Es una foto fija del plano (como el que se hacía en Excel), no un seguimiento en vivo: cada objeto es una persona o un montacargas en un lugar del plano, girado hacia donde mira. x, y = su centro (en metros);
    // angle = hacia dónde mira, en grados (0 = hacia la derecha, 90 = hacia abajo en el plano); l = largo (en el sentido en que mira), w = ancho y h = alto, en metros, a escala. Las medidas de partida salen de la tabla
    // «Cuánto mide lo que transita» del paso Tránsito, así el dibujo y la revisión de los pasillos usan las mismas.
    const OBJECT_TYPES = ['person', 'forklift', 'box'];
    const OBJECT_SIZE_KEY = { person: 'people', forklift: 'forklift' };
    // Los colores del operario (la persona): chaleco y casco. De fábrica, chaleco naranja y casco blanco; solo se guarda el que la persona cambia (vest, helmet).
    const PERSON_COLORS = { vest: '#e08a2e', helmet: '#f4f4f1' };
    const personColorsOf = (o) => {
        const ok = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());
        return { vest: ok(o && o.vest) ? o.vest.trim().toLowerCase() : PERSON_COLORS.vest, helmet: ok(o && o.helmet) ? o.helmet.trim().toLowerCase() : PERSON_COLORS.helmet };
    };
    // El color del cuerpo del montacargas y de los demás equipos del catálogo (carrito, plataforma, otro): de fábrica amarillo el montacargas y gris los demás; solo se guarda el que se cambia (color).
    const EQUIP_COLORS = { forklift: '#f2c230', box: '#9aa0b5' };
    const equipColorOf = (o) => {
        const def = EQUIP_COLORS[o && o.type] || EQUIP_COLORS.box;
        return o && typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color.trim()) ? o.color.trim().toLowerCase() : def;
    };
    // La zona «crecida» m metros: la zona misma, una franja de m a cada lado de cada uno de sus lados y un cuadrito en cada esquina (su unión). Sirve para recortar lo largo (paredes) al tramo que toca la zona.
    function growPolygonShapes(pts, m) {
        if (!Array.isArray(pts) || pts.length < 3) return [];
        const out = [pts];
        pts.forEach((p, i) => {
            const q = pts[(i + 1) % pts.length];
            const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
            if (len > 0) {
                const nx = ((q[1] - p[1]) / len) * m;
                const ny = (-(q[0] - p[0]) / len) * m;
                out.push([[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny]]);
            }
            out.push([[p[0] - m, p[1] - m], [p[0] + m, p[1] - m], [p[0] + m, p[1] + m], [p[0] - m, p[1] + m]]);
        });
        return out;
    }
    function objectDefaultSize(layout, type) {
        const s = transitSizesOf(layout)[OBJECT_SIZE_KEY[type] || 'people'];
        return { l: s.l > 0 ? s.l : 0.5, w: s.w > 0 ? s.w : 0.5, h: s.h > 0 ? s.h : 1.5 };
    }
    // Las cuatro esquinas del objeto ya giradas, en metros.
    function objectPolygon(o) {
        const a = ((Number(o.angle) || 0) * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const hl = (Number(o.l) || 0) / 2;
        const hw = (Number(o.w) || 0) / 2;
        return [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw]].map(([px, py]) => [round2((Number(o.x) || 0) + px * c - py * s), round2((Number(o.y) || 0) + px * s + py * c)]);
    }

    // ---- Seguridad: extintores, hidrantes, puertas de emergencia… ----------------------------------------------------------------------------------
    // Son PUNTOS pequeños puestos sobre el plano (no ocupan m² ni se bloquean con pasillos, huellas ni columnas: un extintor va pegado a una pared o a una columna). Cada uno lleva su tipo, su nombre o modelo y su lugar (x, y en
    // metros). La ruta de evacuación es la única que lleva dos puntos (de dónde a dónde: x, y y x2, y2). La ZONA no se captura: es la zona que contiene el punto (en la ruta, el de salida). El código (E001, E002…) lo pone el
    // sistema, con una serie por tipo (cada tipo con su letra), y NO se vuelve a usar aunque se borre un elemento: safetyNext guarda el último número que se dio de cada letra. Todo debe quedar dentro del contorno de la nave.
    const SAFETY_TYPES = ['extinguisher', 'hydrant', 'emergency_door', 'firstaid', 'alarm', 'eyewash', 'assembly', 'route'];
    // El color de cada tipo (rojo del fuego, verde de emergencia, naranja de alarma, azul del agua): el mismo en el croquis, el 3D y la leyenda.
    // Altura al piso (elev: de dónde arranca el elemento) y tamaño (largo l, ancho w y alto h), en metros, de cada elemento de Seguridad en el 3D. De fábrica cada tipo trae la medida con la que ya se dibujaba; lo que se
    // captura en su renglón la cambia (vacío = la de fábrica). La ruta de evacuación es una marca en el piso y no lleva.
    const SAFETY_SIZE_DEFAULTS = {
        extinguisher: { elev: 0.7, l: 0.2, w: 0.2, h: 0.6 },
        hydrant: { elev: 0, l: 0.3, w: 0.3, h: 0.95 },
        emergency_door: { elev: 0, l: 1, w: 0.12, h: 2.1 },
        firstaid: { elev: 1.36, l: 0.34, w: 0.12, h: 0.28 },
        alarm: { elev: 1.32, l: 0.16, w: 0.08, h: 0.16 },
        eyewash: { elev: 0, l: 0.44, w: 0.44, h: 1.1 },
        assembly: { elev: 0, l: 1.6, w: 1.6, h: 2.5 },
    };
    // Los hidrantes son de cuatro modelos (model; sin elegir = columna, el de siempre): hidrante de columna, de poste doble, toma siamesa (va a la pared) y gabinete contra incendio con manguera (va a la pared).
    // Cada modelo trae su propia altura al piso y tamaño de fábrica; el código sigue siendo de la serie del hidrante (I001…).
    const HYDRANT_MODELS = ['column', 'double_post', 'siamese', 'cabinet'];
    const HYDRANT_SIZE_DEFAULTS = {
        column: { elev: 0, l: 0.3, w: 0.3, h: 0.95 },
        double_post: { elev: 0, l: 0.6, w: 0.2, h: 1.1 },
        siamese: { elev: 0.8, l: 0.35, w: 0.3, h: 0.4 },
        cabinet: { elev: 0.9, l: 0.7, w: 0.25, h: 0.9 },
    };
    const hydrantModelOf = (e) => (e && HYDRANT_MODELS.includes(e.model) ? e.model : 'column');
    function safetySizeOf(e) {
        const d = e && (e.type === 'hydrant' ? HYDRANT_SIZE_DEFAULTS[hydrantModelOf(e)] : SAFETY_SIZE_DEFAULTS[e.type]);
        if (!d) return null;
        const pick = (k) => {
            const raw = e[k];
            if (raw === undefined || raw === null || raw === '') return d[k];
            const v = Number(raw);
            return Number.isFinite(v) && (k === 'elev' ? v >= 0 : v > 0) ? v : d[k];
        };
        return { elev: pick('elev'), l: pick('l'), w: pick('w'), h: pick('h') };
    }
    const SAFETY_COLORS = { extinguisher: '#d9443a', hydrant: '#d9443a', emergency_door: '#2e9e5b', firstaid: '#2e9e5b', alarm: '#e8892b', eyewash: '#2f7fc7', assembly: '#2e9e5b', route: '#2e9e5b' };
    function deriveSafetyZones(layout) {
        if (!layout || !Array.isArray(layout.safety)) return layout;
        let changed = false;
        const safety = layout.safety.map((e) => {
            const id = zoneOfPoint(layout.zones, Number(e.x) || 0, Number(e.y) || 0);
            if ((e.zoneId || '') === id) return e;
            changed = true;
            return { ...e, zoneId: id };
        });
        return changed ? { ...layout, safety } : layout;
    }
    // Cada tipo tiene su propia serie y su letra (Extintor E001, Hidrante I001, Puerta de emergencia P001, Botiquín B001, Alarma L001, Regadera y lavaojos O001, Punto de reunión U001, Ruta de evacuación V001): cada serie cuenta por su
    // lado y el número de un elemento borrado no se vuelve a usar. Si a un elemento le cambian el tipo, recibe el siguiente de su tipo nuevo (y si regresa a su tipo guardado, recupera su código).
    const SAFETY_LETTER = { extinguisher: 'E', hydrant: 'I', emergency_door: 'P', firstaid: 'B', alarm: 'L', eyewash: 'O', assembly: 'U', route: 'V' };
    const safetyLetter = (type) => SAFETY_LETTER[type] || 'E';
    const safetyCode = (type, n) => `${safetyLetter(type)}${String(n).padStart(3, '0')}`;
    const isSafetyCode = (type, c) => new RegExp(`^${safetyLetter(type)}\\d{3,4}$`).test(String(c == null ? '' : c).trim());
    const safetyNum = (c) => Number(String(c).trim().slice(1));
    // safetyNext = el último número que se dio de cada letra, { E: 3, I: 1 } (sin ceros y con las letras en orden).
    const cleanSafetyNext = (raw) => {
        const out = {};
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            Object.keys(raw).filter((k) => /^[A-Z]$/.test(k)).sort().forEach((k) => { const n = Math.min(99999, Math.max(0, Math.round(Number(raw[k])) || 0)); if (n) out[k] = n; });
        }
        return out;
    };
    // Cada elemento que ya trae un código de la letra de su tipo que no se repite lo conserva; el que no, recibe el siguiente de su letra después del último que se dio (safetyNext) o, si es mayor, del más alto que hay.
    function assignSafetyCodes(layout) {
        if (!layout || !Array.isArray(layout.safety)) return layout;
        const floors = cleanSafetyNext(layout.safetyNext);
        if (!layout.safety.length && !Object.keys(floors).length) return layout;
        const used = new Map();
        const usedOf = (letter) => { if (!used.has(letter)) used.set(letter, new Set()); return used.get(letter); };
        const keep = layout.safety.map((e) => {
            const c = String(e.code == null ? '' : e.code).trim().toUpperCase();
            const set = usedOf(safetyLetter(e.type));
            if (isSafetyCode(e.type, c) && !set.has(c)) { set.add(c); return c; }
            return '';
        });
        const given = { ...floors };
        used.forEach((set, letter) => { const hi = Math.max(0, ...Array.from(set).map(safetyNum)); if (hi) given[letter] = Math.max(given[letter] || 0, hi); });
        let changed = false;
        const safety = layout.safety.map((e, i) => {
            let code = keep[i];
            if (!code) {
                const letter = safetyLetter(e.type);
                const set = usedOf(letter);
                let n = (given[letter] || 0) + 1;
                while (set.has(safetyCode(e.type, n))) n += 1;
                code = safetyCode(e.type, n);
                set.add(code);
                given[letter] = n;
            }
            if (code === e.code) return e;
            changed = true;
            return { ...e, code };
        });
        const nextMap = cleanSafetyNext(given);
        if (!changed && JSON.stringify(nextMap) === JSON.stringify(floors)) return layout;
        const out = { ...layout, safety };
        if (Object.keys(nextMap).length) out.safetyNext = nextMap; else delete out.safetyNext;
        return out;
    }
    // Al guardar: los códigos no se editan. Uno que ya existía (con el mismo tipo) conserva el suyo; uno nuevo, o de un tipo que cambió, recibe el siguiente de su letra después del último que se dio (lo guardado manda: quien
    // manda el Layout no puede bajar esos números).
    function lockSafetyCodes(next, previous) {
        if (!next || !Array.isArray(next.safety)) return next;
        const was = (previous && previous.safety) || [];
        const before = new Map(was.map((e) => [e.id, e]));
        const floors = cleanSafetyNext(previous && previous.safetyNext);
        was.forEach((e) => { if (isSafetyCode(e.type, e.code)) { const letter = safetyLetter(e.type); floors[letter] = Math.max(floors[letter] || 0, safetyNum(e.code)); } });
        const safety = next.safety.map((e) => { const w = before.get(e.id); const code = w && w.type === e.type ? w.code : ''; return code === e.code ? e : { ...e, code }; });
        const base = { ...next, safety };
        if (Object.keys(floors).length) base.safetyNext = cleanSafetyNext(floors); else delete base.safetyNext;
        return assignSafetyCodes(base);
    }
    // La altura de la nave en un punto: la del contorno en su punto más cercano (entre las dos esquinas de ese lado se reparte de una a otra).
    function naveHeightAt(layout, x, y) {
        const v = (layout && layout.vertices) || [];
        const n = v.length;
        if (n < 2) return 0;
        let best = Infinity;
        let h = 0;
        for (let i = 0; i < n; i++) {
            const a = v[i];
            const b = v[(i + 1) % n];
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const len2 = dx * dx + dy * dy;
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / len2)) : 0;
            const d = Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
            if (d < best - 1e-9) { best = d; h = cornerHeightAt(layout, i) * (1 - t) + cornerHeightAt(layout, (i + 1) % n) * t; }
        }
        return h;
    }
    // Las faltas de los elementos de un Layout normalizado: outside (un punto, o un extremo de la ruta, queda fuera del contorno de la nave), route (la ruta necesita dos puntos distintos) y tall (el elemento se pasa de la altura de la nave:
    // altura del piso + alto, contra lo que mide la nave en ese punto). sig cambia cuando cambia algo
    // de lo que importa (el lugar o el contorno): lo que ya estaba mal y no se tocó solo se marca; lo nuevo no se deja guardar.
    function safetyViolations(layout) {
        const out = [];
        if (!layout || !Array.isArray(layout.safety) || !layout.safety.length) return out;
        const poly = (layout.vertices || []).map((p) => [p[0], p[1]]);
        if (poly.length < 3) return out;
        const inside = (x, y) => pointInPolygon(x, y, poly) || onPolygonEdge(x, y, poly);
        layout.safety.forEach((e) => {
            const isRoute = e.type === 'route';
            const pts = isRoute ? [[e.x, e.y], [e.x2, e.y2]] : [[e.x, e.y]];
            const geo = JSON.stringify([e.x, e.y, isRoute ? e.x2 : 0, isRoute ? e.y2 : 0, poly]);
            if (pts.some(([x, y]) => !inside(Number(x) || 0, Number(y) || 0))) out.push({ id: e.id, code: e.code, kind: 'outside', sig: geo, message: `El elemento de seguridad ${e.code} queda fuera del contorno de la nave: acomódalo dentro.` });
            if (isRoute && Number(e.x) === Number(e.x2) && Number(e.y) === Number(e.y2)) out.push({ id: e.id, code: e.code, kind: 'route', sig: geo, message: `La ruta de evacuación ${e.code} necesita dos puntos distintos.` });
            // la ruta es una marca en el piso (no lleva altura); lo demás llega hasta su altura del piso + su alto, que no puede pasar de lo que mide la nave ahí
            const sz = isRoute ? null : safetySizeOf(e);
            if (sz) {
                const lvlS = round2(floorLevelAt(layout, Number(e.x) || 0, Number(e.y) || 0));
                const top = round2(lvlS + sz.elev + sz.h);
                const limit = round2(naveHeightAt(layout, Number(e.x) || 0, Number(e.y) || 0));
                if (limit > 0 && top > limit + 0.005) out.push({ id: e.id, code: e.code, kind: 'tall', sig: JSON.stringify(lvlS !== 0 ? [top, limit, lvlS] : [top, limit]), vars: lvlS !== 0 ? { top, height: limit, level: lvlS } : { top, height: limit }, message: `El elemento de seguridad ${e.code} llega a ${top} m (altura del piso + alto) y la nave ahí solo mide ${limit} m de alto: bájalo o hazlo más bajo.` });
            }
        });
        return out;
    }
    // ---- Fechas de Seguridad: estado de cada elemento -----------------------------------------------------------------------------------------------
    // Cada elemento puede traer su caducidad (expires), cada cuántos días se revisa (every) y su próxima revisión (next), todo opcional. El ESTADO sale de la fecha más cercana contra HOY: vencida si ya pasó, «por vencer» si
    // faltan safetyWarnDays días o menos (de fábrica 30; hoy cuenta como por vencer) y vigente si falta más. Sin fechas no hay estado. No bloquea nada: un extintor vencido es un aviso para atenderlo, no un error del plano.
    const SAFETY_WARN_DAYS = 30;
    const isIsoDate = (v) => {
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
        const [y, m, d] = v.split('-').map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    };
    const isoDayNumber = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
    const addDaysIso = (iso, n) => new Date((isoDayNumber(iso) + n) * 86400000).toISOString().slice(0, 10);
    // Las revisiones que se hacen con el QR del elemento (el servidor las manda en layout.safetyLast, NO se guardan con el Layout): last = { ok: fecha de la última revisión BIEN, day: fecha de la última revisión (bien o con falla),
    // at: su hora en UTC, by: quién, result: 'ok' | 'fail' }. La PRÓXIMA REVISIÓN que vale: con «Revisar cada» y una revisión bien hecha es la fecha de esa revisión más los días (se recorre sola); sin eso, la que se escribió, y una
    // escrita que ya se cumplió (revisión bien hecha ese día o después) no queda pendiente.
    function safetyNextOf(e, last) {
        const ok = last && isIsoDate(last.ok) ? last.ok : '';
        const every = Math.round(Number(e && e.every));
        if (ok && every >= 1) return addDaysIso(ok, every);
        if (isIsoDate(e && e.next)) return ok && ok >= e.next ? '' : e.next;
        return '';
    }
    // today = la fecha de HOY como AAAA-MM-DD (quien llama la saca de su reloj: en pantalla, la del lugar de quien ve; en el servidor, la de la zona horaria del cliente). Devuelve { state: 'ok' | 'soon' | 'overdue' | 'fail' | 'none',
    // days (los que faltan; negativo si ya pasó), date, which }. «fail»: la última revisión con el QR salió con falla (hasta que otra salga bien); manda sobre las fechas.
    function safetyStatus(e, today, warnDays, last) {
        if (last && last.result === 'fail') return { state: 'fail', days: null, date: isIsoDate(last.day) ? last.day : '', which: 'check' };
        const next = safetyNextOf(e, last);
        const dates = [e && e.expires, next].filter(isIsoDate);
        if (!dates.length || !isIsoDate(today)) return { state: 'none', days: null, date: '', which: '' };
        const nearest = dates.slice().sort()[0];
        const days = isoDayNumber(nearest) - isoDayNumber(today);
        const warn = Math.max(1, Math.round(Number(warnDays)) || SAFETY_WARN_DAYS);
        return { state: days < 0 ? 'overdue' : (days <= warn ? 'soon' : 'ok'), days, date: nearest, which: nearest === (e && e.expires) ? 'expires' : 'next' };
    }
    function safetyCounts(layout, today) {
        const out = { ok: 0, soon: 0, overdue: 0, fail: 0, none: 0 };
        ((layout && layout.safety) || []).forEach((e) => { out[safetyStatus(e, today, layout.safetyWarnDays, layout.safetyLast && layout.safetyLast[e.id]).state] += 1; });
        return out;
    }
    const safetyKey = (v) => `${v.id}|${v.kind}|${v.sig}`;
    // Las faltas que hay en next y que antes no estaban igual (elemento nuevo o cambiado).
    function newSafetyViolations(next, previous) {
        const before = new Set((previous ? safetyViolations(previous) : []).map(safetyKey));
        return safetyViolations(next).filter((v) => !before.has(safetyKey(v)));
    }

    // ---- El activo dentro de su huella -------------------------------------------------------------------------------------------------------
    // Los activos de una huella van uno junto al otro: ninguno puede salirse de ella ni ser más alto que ella, ni encimarse con otro de la misma huella. Se mira sobre un Layout normalizado (deriveSpaces). Un activo apagado (off) no
    // cuenta. Igual que con las huellas: lo que ya estaba mal antes y no cambió solo se marca; lo NUEVO o lo que cambió (el activo o su huella) no se deja guardar (ver newSpaceViolations). Cuatro faltas: sum (los activos suman más
    // que el lado de la huella), out (uno se sale de ella), tall (más alto que ella), overlap (dos encimados), levels (sus niveles suben más que el activo: paso Niveles), bayl, bayw y bayh (el largo, el ancho o el alto de una posición pasa del largo o el fondo del activo, o del espacio de su nivel)
    // y baysum (las columnas de un nivel suman más que el largo del activo).
    function spaceViolations(layout) {
        const out = [];
        if (!layout || !Array.isArray(layout.footprints) || !Array.isArray(layout.spaces)) return out;
        const L = deriveSpaces(layout);
        const byId = new Map(L.footprints.map((f) => [f.id, f]));
        const groups = new Map();
        L.spaces.forEach((s) => { if (s.off === true || !byId.has(s.footprintId)) return; if (!groups.has(s.footprintId)) groups.set(s.footprintId, []); groups.get(s.footprintId).push(s); });
        const eps = 0.005;
        const m = (n) => String(round2(n));
        groups.forEach((list, fid) => {
            const f = byId.get(fid);
            const fsig = JSON.stringify([f.x, f.y, f.l, f.d, f.h]);
            const len = (f.l || 0) >= (f.d || 0) ? f.l : f.d;
            const sum = round2(list.reduce((acc, s) => acc + ((f.l || 0) >= (f.d || 0) ? s.l : s.d), 0));
            list.forEach((s, i) => {
                const base = { id: s.id, code: s.code, fcode: f.code };
                const geo = JSON.stringify([s.x, s.y, s.l, s.d, s.h]) + fsig;
                if (s.x < f.x - eps || s.y < f.y - eps || s.x + s.l > f.x + f.l + eps || s.y + s.d > f.y + f.d + eps) {
                    out.push(sum > len + eps
                        ? { ...base, kind: 'sum', sig: geo, vars: { fcode: f.code, sum: m(sum), len: m(len) }, message: `Los activos de ${f.code} suman ${m(sum)} m y la huella mide ${m(len)} m.` }
                        : { ...base, kind: 'out', sig: geo, vars: { code: s.code, fcode: f.code }, message: `El activo ${s.code} se sale de su huella ${f.code}: cambia sus medidas o su posición, o agranda la huella.` });
                }
                // el largo y el ancho de un hueco (Posiciones) no pueden ser mayores que el largo y el fondo del activo (solo cuentan los que el hueco trae propios)
                (s.bays || []).forEach((b) => {
                    if (b.l !== undefined && s.l > 0 && b.l > s.l + eps) out.push({ ...base, kind: 'bayl', sig: JSON.stringify([b.n, b.c, 'l', b.l, s.l]), vars: { code: s.code, n: b.n, c: b.c, value: m(b.l), max: m(s.l) }, message: `El espacio ${b.c} del nivel ${b.n} del activo ${s.code} mide ${m(b.l)} m de largo y el activo solo ${m(s.l)} m: baja su largo.` });
                    // el alto propio de una posición no pasa del alto del espacio de su nivel (paso Niveles)
                    if (b.h !== undefined) {
                        const lvH = levelMeasures(s, b.n).h;
                        if (lvH > 0 && b.h > lvH + eps) out.push({ ...base, kind: 'bayh', sig: JSON.stringify([b.n, b.c, 'h', b.h, lvH]), vars: { code: s.code, n: b.n, c: b.c, value: m(b.h), max: m(lvH) }, message: `El espacio ${b.c} del nivel ${b.n} del activo ${s.code} mide ${m(b.h)} m de alto y el nivel solo ${m(lvH)} m: baja su alto.` });
                    }
                    if (b.w !== undefined && s.d > 0 && b.w > s.d + eps) out.push({ ...base, kind: 'bayw', sig: JSON.stringify([b.n, b.c, 'w', b.w, s.d]), vars: { code: s.code, n: b.n, c: b.c, value: m(b.w), max: m(s.d) }, message: `El espacio ${b.c} del nivel ${b.n} del activo ${s.code} mide ${m(b.w)} m de ancho y el activo solo ${m(s.d)} m de fondo: baja su ancho.` });
                });
                // las caras de consumo de un nivel o de un espacio solo pueden ser caras que lo que los contiene tiene
                const upSpace = facesOfSpace(s);
                for (let n = 1; n <= (s.levels || 1); n += 1) {
                    const st = sanitizeFaces(levelOf(s, n).faces);
                    const extra = st ? st.filter((f) => !upSpace.includes(f)) : [];
                    if (extra.length) out.push({ ...base, kind: 'facesLevel', sig: JSON.stringify([n, st, upSpace]), vars: { code: s.code, n, faces: facePhrase(extra), has: facePhrase(upSpace), extra, up: upSpace }, message: `El nivel ${n} del activo ${s.code} se consume por ${facePhrase(extra)} y el activo se consume por ${facePhrase(upSpace)}: quita esa cara del nivel o agrégala al activo.` });
                }
                (s.bays || []).forEach((b) => {
                    const st = sanitizeFaces(b.faces);
                    const upLevel = facesOfLevel(s, b.n);
                    const extra = st ? st.filter((f) => !upLevel.includes(f)) : [];
                    if (extra.length) out.push({ ...base, kind: 'facesBay', sig: JSON.stringify([b.n, b.c, st, upLevel]), vars: { code: s.code, n: b.n, c: b.c, faces: facePhrase(extra), has: facePhrase(upLevel), extra, up: upLevel }, message: `El espacio ${b.c} del nivel ${b.n} del activo ${s.code} se consume por ${facePhrase(extra)} y su nivel se consume por ${facePhrase(upLevel)}: quita esa cara del espacio o agrégala al nivel.` });
                });
                // las columnas de un nivel no pueden sumar más que el largo del activo (se suma lo que muestra Posiciones: el largo propio de cada hueco o, sin él, el largo del activo entre sus columnas)
                for (let n = 1; n <= (s.levels || 1); n += 1) {
                    const ls = levelLengthSum(s, n);
                    if (!ls.over) continue;
                    const lens = Array.from({ length: levelSlots(s, n) }, (_, k) => { const st = bayOf(s, n, k + 1).stored; return st.l !== undefined ? st.l : null; });
                    out.push({ ...base, kind: 'baysum', sig: JSON.stringify([n, lens, s.l]), vars: { code: s.code, n, sum: m(ls.sum), max: m(s.l) }, message: `Los espacios del nivel ${n} del activo ${s.code} suman ${m(ls.sum)} m de largo y el activo mide ${m(s.l)} m: baja el largo de algún espacio para poder guardar.` });
                }
                // los niveles no pueden subir más que el activo (solo si el activo trae medidas de niveles o huecos propias: sin ellas los niveles se reparten justo en su alto)
                const ownBays = (s.bays || []).filter((b) => b.h !== undefined);
                if (s.h > 0 && ((s.lvls || []).length || ownBays.length)) {
                    const top = levelsTop(s);
                    if (top > s.h + eps) out.push({ ...base, kind: 'levels', sig: JSON.stringify([s.h, s.levels || 1, s.lvls || null, ownBays]), vars: { code: s.code, top: m(top), h: m(s.h) }, message: `Los niveles del activo ${s.code} llegan a ${m(top)} m y el activo mide ${m(s.h)} m: baja el alto de algún nivel o sube el alto del activo.` });
                }
                if (s.h > f.h + eps) out.push({ ...base, kind: 'tall', sig: geo, vars: { code: s.code, fcode: f.code, h: m(s.h), fh: m(f.h) }, message: `El activo ${s.code} mide ${m(s.h)} m de alto y su huella ${f.code} solo ${m(f.h)} m.` });
                for (let j = 0; j < i; j++) {
                    const o = list[j];
                    if (s.x < o.x + o.l - eps && o.x < s.x + s.l - eps && s.y < o.y + o.d - eps && o.y < s.y + s.d - eps) {
                        out.push({ ...base, kind: 'overlap', sig: geo + JSON.stringify([o.id, o.x, o.y, o.l, o.d]), vars: { code: s.code, other: o.code, fcode: f.code }, message: `Los activos ${o.code} y ${s.code} están encimados dentro de ${f.code}.` });
                    }
                }
            });
        });
        return out;
    }
    function newSpaceViolations(next, previous) {
        const before = previous ? spaceViolations(previous) : [];
        return spaceViolations(next).filter((v) => !before.some((p) => p.id === v.id && p.kind === v.kind && p.sig === v.sig));
    }

    // ---- Lo que se sale de su contenedor -------------------------------------------------------------------------------------------------------------
    // La lista de TODO lo que hoy no cabe en lo que lo contiene, de arriba hacia abajo: la zona en la nave, la huella en su zona (o en la altura de la nave), el activo en su huella, los niveles en su activo, un espacio en su activo (o en su
    // nivel) y una posición en su espacio. Junta las faltas que ya calculan footprintViolations, spaceViolations y positionViolations (lo que ya estaba mal solo se marca; lo nuevo no se deja guardar) y las zonas que salen de la nave.
    // Cada renglón: { level, step (el paso donde se arregla), kind, id, target (lo que se señala en el croquis), vars (para el texto) }. Los activos que suman más que su huella salen UNA vez por huella.
    const OUT_LEVELS = ['zone', 'obstacle', 'object', 'fp', 'space', 'level', 'bay', 'pos'];
    function outOfContainer(layout) {
        const out = [];
        if (!layout) return out;
        (layout.zones || []).forEach((z) => {
            if (z.active === false || (Array.isArray(z.pts) && z.pts.length < 3)) return; // una zona apagada o por dibujar todavía no cuenta
            if (zoneOutsideNave(layout.vertices, z)) out.push({ level: 'zone', step: 'zonas', kind: 'nave', id: z.id, target: { kind: 'zone', id: z.id }, vars: { code: z.code || z.name || '' } });
        });
        obstacleInsideViolations(layout).forEach((v) => out.push({ level: 'obstacle', step: v.section, kind: v.what, id: v.id, target: { kind: 'obstacle', id: v.id }, vars: { name: v.name } }));
        objectInsideViolations(layout).forEach((v) => out.push({ level: 'object', step: 'objetos', kind: 'outside', id: v.id, target: { kind: 'object', id: v.id }, vars: { name: v.name } }));
        footprintViolations(layout).forEach((v) => {
            const target = { kind: 'footprint', id: v.id };
            if (v.kind === 'nozone') out.push({ level: 'fp', step: 'espacios', kind: 'nozone', id: v.id, target, vars: { code: v.code } });
            else if (v.kind === 'out') out.push({ level: 'fp', step: 'espacios', kind: 'out', id: v.id, target, vars: { code: v.code, zone: v.zoneName || '' } });
            else if (v.kind === 'tall') {
                const lvl = v.level !== undefined;
                out.push({ level: 'fp', step: 'espacios', kind: lvl ? 'tall_lvl' : 'tall', id: v.id, target, vars: { code: v.code, h: String(round2(v.h)), maxH: String(round2(v.maxH)), ...(lvl ? { level: `${v.level > 0 ? '+' : ''}${round2(v.level)}`, top: String(round2(v.top)) } : {}) } });
            }
        });
        const seenSum = new Set();
        spaceViolations(layout).forEach((v) => {
            if (v.kind === 'sum') {
                if (seenSum.has(v.vars.fcode)) return;
                seenSum.add(v.vars.fcode);
                out.push({ level: 'space', step: 'activos', kind: 'sum', id: v.id, target: { kind: 'space', id: v.id }, vars: v.vars });
            } else if (v.kind === 'out' || v.kind === 'tall') {
                out.push({ level: 'space', step: 'activos', kind: v.kind, id: v.id, target: { kind: 'space', id: v.id }, vars: v.vars });
            } else if (v.kind === 'levels') {
                out.push({ level: 'level', step: 'niveles', kind: 'levels', id: v.id, target: { kind: 'space', id: v.id }, vars: v.vars });
            } else if (v.kind === 'bayl' || v.kind === 'bayw' || v.kind === 'bayh') {
                out.push({ level: 'bay', step: 'posiciones', kind: v.kind, id: v.id, target: { kind: 'bay', id: v.id, n: v.vars.n, c: v.vars.c }, vars: v.vars });
            } else if (v.kind === 'baysum') {
                out.push({ level: 'bay', step: 'posiciones', kind: 'baysum', id: v.id, target: { kind: 'space', id: v.id, n: v.vars.n }, vars: v.vars });
            }
        });
        const byPos = new Map((layout.positions || []).map((p) => [p.id, p]));
        positionViolations(layout).forEach((v) => {
            if (v.kind !== 'out' && v.kind !== 'tall') return;
            const p = byPos.get(v.id);
            out.push({ level: 'pos', step: 'ubicaciones', kind: v.kind, id: v.id, target: { kind: 'bay', id: v.spaceId, n: v.n, c: v.c, p: p ? p.num : undefined }, vars: v.vars });
        });
        return out.map((r, i) => ({ r, i })).sort((a, z) => OUT_LEVELS.indexOf(a.r.level) - OUT_LEVELS.indexOf(z.r.level) || a.i - z.i).map((x) => x.r);
    }

    // ---- Colores: lo que va ADENTRO de algo no lleva el color de lo que lo contiene ------------------------------------------------------------------------
    // Criterio de Daniel para todo: la huella no puede llevar el color de su zona ni el activo el de su huella (se confunden); el mismo color sí se puede usar en otro lado (otra zona, otra huella…). Solo se compara el
    // color de relleno (sin relleno no hay color) y se toman como el mismo los que casi no se distinguen (distancia menor a 24 en la escala 0-255). Si ninguno de los dos tiene color propio no hay choque: los de fábrica
    // ya son distintos entre sí (zona por tipo, huella blanca y activo arena).
    const FILL_ZONE_DEFAULT = { dry: '#d9c7ef', cold: '#bfe0f5', chemical: '#f5d0cf', finished: '#d4efd0', dock: '#9cc3ea', office: '#a3ebcb', aisle: '#d5d8e2', aisle2: '#e6e8ef', none: '#e9e9ee' };
    const FMT_HUELLA_DEFAULT = { fill: '#ffffff', pattern: 'solid', pcolor: '#6b7089', line: 'thin', bcolor: '#6b7089' };
    const FMT_ASSET_DEFAULT = { fill: '#f4e1b8', pattern: 'solid', pcolor: '#9a7b3c', line: 'thin', bcolor: '#9a7b3c' };
    const fillOf = (fmt) => (fmt && fmt.pattern !== 'none' && /^#[0-9a-fA-F]{6}$/.test(fmt.fill || '') ? String(fmt.fill).toLowerCase() : '');
    const sameFmt = (a, b) => ['fill', 'pattern', 'pcolor', 'line', 'bcolor'].every((k) => String((a || {})[k]).toLowerCase() === String((b || {})[k]).toLowerCase());
    function sameColor(a, b) {
        const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        const x = rgb(a); const y = rgb(b);
        return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 24;
    }
    function colorClashes(layout) {
        const out = [];
        if (!layout) return out;
        const zoneById = new Map((layout.zones || []).map((z) => [z.id, z]));
        const fpById = new Map((layout.footprints || []).map((f) => [f.id, f]));
        (layout.footprints || []).forEach((f) => {
            const z = f.zoneId ? zoneById.get(f.zoneId) : null;
            if (!z || !(z.fmt || f.fmt)) return;
            const parent = z.fmt ? fillOf(z.fmt) : FILL_ZONE_DEFAULT[z.type || 'none'];
            const child = fillOf(f.fmt || FMT_HUELLA_DEFAULT);
            if (parent && child && sameColor(parent, child)) out.push({ kind: 'footprint', id: f.id, code: f.code, parentId: z.id, parentName: z.name, sig: `${child}|${parent}|${z.id}`, message: `La huella ${f.code} lleva el mismo color que su zona ${z.name}: cambia el color de una de las dos para que no se confundan.` });
        });
        (layout.spaces || []).forEach((s) => {
            const f = s.footprintId ? fpById.get(s.footprintId) : null;
            if (!f || !(f.fmt || s.fmt)) return;
            const parent = fillOf(f.fmt || FMT_HUELLA_DEFAULT);
            const child = fillOf(s.fmt || FMT_ASSET_DEFAULT);
            if (parent && child && sameColor(parent, child)) out.push({ kind: 'asset', id: s.id, code: s.code, parentId: f.id, parentName: f.code, sig: `${child}|${parent}|${f.id}`, message: `El activo ${s.code} lleva el mismo color que su huella ${f.code}: cambia el color de uno de los dos para que no se confundan.` });
        });
        return out;
    }
    // Los choques que hay en next y que antes no estaban igual: solo esos no se dejan guardar (lo que ya estaba así antes solo se deja como está).
    function newColorClashes(next, previous) {
        const before = previous ? colorClashes(previous) : [];
        return colorClashes(next).filter((c) => !before.some((p) => p.id === c.id && p.kind === c.kind && p.sig === c.sig));
    }

    // ---- Lista de localizadores --------------------------------------------------------------------------------------------------------------
    // Todos los localizadores que el Layout va creando, completos o a medias: una fila por zona (Z006), por huella (Z006.H003), por activo (Z006.H003.A003) y por cada POSICIÓN completa (Z006.H003.A003.N004.E001.P001,
    // las 6 piezas: zona, huella, activo, nivel, espacio y posición). Solo cuenta lo activo. Los códigos de la zona, la huella y el activo ya son las piezas del Localizador, así que se arma uniéndolos; una huella que no está en ninguna zona (de antes de la regla) no
    // tiene localizador. Salen en orden de lectura (la zona, sus huellas, los activos de cada una y sus posiciones). max = tope de filas (las posiciones pueden ser muchísimas): con el tope, truncated = true.
    function locatorRows(layout, { max = 60000 } = {}) {
        const rows = [];
        let truncated = false;
        if (!layout) return { rows, truncated };
        const pad = (n) => String(n).padStart(3, '0');
        const zones = (layout.zones || []).filter((z) => z.active !== false);
        const footprints = (layout.footprints || []).filter((f) => f.active !== false);
        const spaces = (layout.spaces || []).filter((s) => s.active !== false);
        const zoneIds = new Set(zones.map((z) => z.id));
        // lo que está en una zona apagada no sale (como la zona); una huella sin zona (o con una que ya no existe) va al final, sin localizador
        const offZoneIds = new Set((layout.zones || []).filter((z) => z.active === false).map((z) => z.id));
        const fpByZone = new Map();
        footprints.forEach((f) => { if (offZoneIds.has(f.zoneId)) return; const key = zoneIds.has(f.zoneId) ? f.zoneId : ''; if (!fpByZone.has(key)) fpByZone.set(key, []); fpByZone.get(key).push(f); });
        const spByFp = new Map();
        spaces.forEach((s) => { if (!spByFp.has(s.footprintId)) spByFp.set(s.footprintId, []); spByFp.get(s.footprintId).push(s); });
        const push = (row) => { if (rows.length >= max) { truncated = true; return false; } rows.push(row); return true; };
        const posByKey = new Map();
        (ensurePositions(layout).positions || []).forEach((p) => { const key = `${p.spaceId}|${p.n}|${p.c}`; if (!posByKey.has(key)) posByKey.set(key, []); posByKey.get(key).push(p); });
        posByKey.forEach((list) => list.sort((a, b) => a.num - b.num));
        const groups = [...zones.map((z) => ({ zone: z, fps: fpByZone.get(z.id) || [] })), { zone: null, fps: fpByZone.get('') || [] }];
        for (const { zone, fps } of groups) {
            const z = zone ? { zoneId: zone.id, zoneCode: zone.code || '', zoneName: zone.name || '' } : { zoneId: '', zoneCode: '', zoneName: '' };
            if (zone && !push({ scope: 'zone', complete: false, locator: z.zoneCode, ...z })) return { rows, truncated };
            for (const f of fps) {
                const fp = { footprintId: f.id, footprintCode: f.code || '', footprintName: f.name || '' };
                const upTo = (...parts) => (zone && z.zoneCode ? [z.zoneCode, ...parts].join('.') : '');
                if (!push({ scope: 'footprint', complete: false, locator: upTo(fp.footprintCode), ...z, ...fp })) return { rows, truncated };
                for (const s of (spByFp.get(f.id) || [])) {
                    const sp = { spaceId: s.id, spaceCode: s.code || '', spaceType: s.type || 'rack' };
                    if (!push({ scope: 'asset', complete: false, locator: upTo(fp.footprintCode, sp.spaceCode), ...z, ...fp, ...sp })) return { rows, truncated };
                    if (!zone) continue; // sin zona no hay localizador completo: no se listan sus posiciones
                    for (let n = 1; n <= (s.levels || 1); n++) {
                        for (let c = 1; c <= levelSlots(s, n); c++) {
                            for (const pos of (posByKey.get(`${s.id}|${n}|${c}`) || [])) {
                                const locator = upTo(fp.footprintCode, sp.spaceCode, `N${pad(n)}`, `E${pad(c)}`, `P${pad(pos.num)}`);
                                if (!push({ scope: 'position', complete: true, locator, ...z, ...fp, ...sp, level: n, slot: c, position: pos.num, positionId: pos.id })) return { rows, truncated };
                            }
                        }
                    }
                }
            }
        }
        return { rows, truncated };
    }

    // ---- Capacidad Almacenamiento ------------------------------------------------------------------------------------------------------------
    // Los lugares donde se puede guardar inventario: un renglón por HUECO (nivel × columna) de cada activo activo que guarda inventario (sin clasificación, o con una que NO se mide en m²: el mobiliario operativo no guarda).
    // classKinds = Map(id de la clasificación → 'm2' | 'm3'). Un activo con un solo hueco sale como un renglón; uno con varios (un rack con niveles y columnas) sale con un renglón por hueco. Solo cuenta lo que está en una zona
    // activa (así tiene localizador). Las medidas son las del hueco (bayMeasures), en metros: largo, fondo, alto útil (sin la ceja) y los m² de su base. key = id del activo|nivel|columna (no cambia mientras el activo exista).
    function storageLocations(layout, { classKinds = new Map(), max = 60000 } = {}) {
        const rows = [];
        let truncated = false;
        if (!layout) return { rows, truncated };
        const pad = (n) => String(n).padStart(3, '0');
        const zones = (layout.zones || []).filter((z) => z.active !== false);
        const footprints = (layout.footprints || []).filter((f) => f.active !== false);
        const spaces = (layout.spaces || []).filter((s) => s.active !== false);
        const spByFp = new Map();
        spaces.forEach((sp) => { if (!spByFp.has(sp.footprintId)) spByFp.set(sp.footprintId, []); spByFp.get(sp.footprintId).push(sp); });
        for (const z of zones) {
            for (const f of footprints.filter((fp) => fp.zoneId === z.id)) {
                for (const sp of (spByFp.get(f.id) || [])) {
                    if (sp.assetClassId && classKinds.get(sp.assetClassId) === 'm2') continue;
                    const levels = sp.levels || 1;
                    const multi = levels > 1 || maxSlots(sp) > 1;
                    for (let n = 1; n <= levels; n++) {
                        for (let c = 1; c <= levelSlots(sp, n); c++) {
                            if (rows.length >= max) { truncated = true; return { rows, truncated }; }
                            const m = bayMeasures(sp, n, c);
                            const base = [z.code, f.code, sp.code].filter(Boolean).join('.');
                            rows.push({
                                key: `${sp.id}|${n}|${c}`, spaceId: sp.id, level: n, slot: c, multi,
                                zoneId: z.id, zoneCode: z.code || '', zoneName: z.name || '', footprintCode: f.code || '', spaceCode: sp.code || '',
                                assetClassId: sp.assetClassId || 0, assetId: sp.assetId || 0,
                                locator: multi ? `${base}.N${pad(n)}.E${pad(c)}` : base,
                                l: m.l, w: m.w, h: m.useful || m.h, m2: round2(m.l * m.w),
                            });
                        }
                    }
                }
            }
        }
        return { rows, truncated };
    }
    // Cuántas tarimas (la base del código, en cm) caben en la base del lugar (en metros): lo que cabe DE VERDAD por cada lado (un espacio de 2.5 × 2.5 m con una base de 1 × 1 m caben 4, no 6) y se toma el acomodo (de frente o
    // girada) que más acomoda.
    const fitCount = (a, b, x, y) => (a > 0 && b > 0 && x > 0 && y > 0 ? Math.floor(a / x + 1e-9) * Math.floor(b / y + 1e-9) : 0);
    function huellasThatFit(l, w, codeL, codeW) {
        const a = l * 100;
        const b = w * 100;
        return Math.max(fitCount(a, b, codeL, codeW), fitCount(a, b, codeW, codeL));
    }
    // La capacidad de un lugar con un código (como en el Excel «Capacidades Crane»): por pallet = cantidad por cama (TI) × camas por pallet (HI); por huella = máxima estiba × por pallet; máxima = huellas × por huella. El
    // Largo × Ancho del código son los de la tarima completa (cm). Lo que no se puede calcular por falta de un dato queda en null y 'missing' dice cuál falta (size, ti, hi, stack).
    function capacityOf(loc, code) {
        const out = { huellas: null, perPallet: null, perHuella: null, max: null, missing: [] };
        if (!loc || !code) return out;
        const L = Number(code.length) || 0;
        const W = Number(code.width) || 0;
        const ti = Math.round(Number(code.unitsPerLayer)) || 0;
        const hi = Math.round(Number(code.layersPerPallet)) || 0;
        const stack = Math.round(Number(code.maxStack)) || 0;
        if (L > 0 && W > 0) out.huellas = huellasThatFit(loc.l, loc.w, L, W); else out.missing.push('size');
        if (!(ti > 0)) out.missing.push('ti');
        if (!(hi > 0)) out.missing.push('hi');
        if (!(stack > 0)) out.missing.push('stack');
        if (ti > 0 && hi > 0) out.perPallet = ti * hi;
        if (out.perPallet !== null && stack > 0) out.perHuella = stack * out.perPallet;
        if (out.huellas !== null && out.perHuella !== null) out.max = out.huellas * out.perHuella;
        return out;
    }

    function emptyLayout() {
        return {
            mode: 'scratch', heightM: 9,
            vertices: [[0, 0, 9], [30, 0, 9], [30, 20, 9], [0, 20, 9]],
            doors: [], power: [], sensors: [], objects: [], safety: [], obstacles: defaultWalls([[0, 0], [30, 0], [30, 20], [0, 20]]), wallsMigrated: true, floorsMigrated: true, rampsMigrated: true, floors: [], ramps: [], zones: [], footprints: [], spaces: [],
            plan: null, ownAssetFmt: true,
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
        // Los pasillos son los del paso Tránsito (más las zonas de pasillo de forma libre que se hayan quedado de antes).
        const transitM2 = transitArea(layout);
        const aisles = sumType('aisle') + sumType('aisle2') + transitM2.union;
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
        // Un pasillo que quedó fuera de toda zona también cubre piso (no es espacio muerto): lo que suma sobre las zonas, medido en la misma cuadrícula.
        const transitPseudo = (layout.transit || []).map((p) => ({ x: p.x, y: p.y, l: p.l, w: p.w }));
        const transitExtra = transitPseudo.length ? Math.max(0, coveredArea(layout.vertices || [], [...assigned, ...transitPseudo]) - covered) : 0;
        // Medido sobre una cuadrícula, cada borde que no cae en múltiplos de 5 cm se desvía unas décimas de m². Si lo que falta frente a la suma de las zonas es de ese
        // tamaño (menos de 1 % + 0.1 m²), no hay encimes ni zonas fuera de la nave: lo cubierto es la suma exacta de sus superficies.
        if (assignedArea - covered <= assignedArea * 0.01 + 0.1) covered = Math.min(assignedArea, total);
        const overlap = Math.max(0, assignedArea - covered);
        const transitOutside = transitExtra > 0.05 ? transitExtra : 0;
        covered += transitOutside;
        const dead = Math.max(0, total - covered);
        const perZone = zones.map((z) => {
            const mine = spaces.filter((s) => s.zoneId === z.id);
            const zFootprint = mine.reduce((acc, s) => acc + (s.l || 0) * (s.d || 0), 0);
            const area = zoneArea(z);
            return {
                id: z.id, name: z.name, type: z.type, use: z.use || '', area: round2(area), spaces: mine.length,
                level: zonePoints(z).length >= 3 ? Math.round(zoneAvgLevel(layout, z) * 1e6) / 1e6 : 0,
                footprint: round2(zFootprint), occupancy: area ? round2((zFootprint / area) * 100) : 0,
                volume: round2(mine.reduce((acc, s) => acc + (s.l || 0) * (s.d || 0) * (s.h || 0), 0)),
            };
        });
        const raisedAll = raisedVolume(layout);
        // lo que suben los pisos y no cae en ninguna zona (se suma al renglón «el resto» del desglose de volumen, para que las cifras sigan sumando la cifra misma)
        const raisedRest = raisedAll - perZone.reduce((acc, z) => acc + z.area * z.level, 0);
        return {
            total: round2(total), offices: round2(offices), aisles: round2(aisles), docks: round2(docks), raisedRest: round2(raisedRest),
            storage: round2(storageZones), footprint: round2(footprint), covered: round2(covered), overlap: round2(overlap), dead: round2(dead), unassigned: round2(unassigned),
            // para el desglose de «Datos métricos»: los pasillos con sus metros, lo que se encima entre ellos y lo que cubren fuera de toda zona
            transit: (layout.transit || []).map((p) => ({ id: p.id, name: p.name || p.code || '', type: p.type === 'between' ? 'aisle2' : 'aisle', area: round2((Number(p.l) || 0) * (Number(p.w) || 0)) })),
            transitOverlap: round2(transitM2.overlap), transitOutside: round2(transitOutside),
            volume: round2(netVolume(layout)), raised: round2(raisedAll), storageVolume: round2(storageVolume),
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
        // La altura promedio sin lo que suben las zonas a desnivel (esto se resta zona por zona): así la suma sigue siendo la cifra misma.
        const factor = volume ? (kpis.total > 0 ? (kpis.volume + (kpis.raised || 0)) / kpis.total : 0) : 1;
        const zoneRow = (z) => ({ kind: 'zone', id: z.id, name: z.name, type: z.type || '', value: round2((z.area || 0) * (volume ? factor - (z.level || 0) : factor)) });
        const restArea = Math.max(0, round2((kpis.dead || 0) - (kpis.unassigned || 0)));
        // en el volumen, el resto lleva también lo que suben los pisos fuera de toda zona
        const restRaised = volume ? (kpis.raisedRest || 0) : 0;
        const restRow = () => ({ kind: 'rest', id: '', name: '', type: '', value: round2(restArea * factor - restRaised) });
        const hasRest = restArea > 0 || Math.abs(restRaised) > 0.005;
        let rows;
        if (key === 'offices') rows = zones.filter((z) => z.type === 'office').map(zoneRow);
        else if (key === 'aisles') {
            rows = zones.filter((z) => z.type === 'aisle' || z.type === 'aisle2').map(zoneRow);
            (kpis.transit || []).forEach((p) => rows.push({ kind: 'zone', id: p.id, name: p.name, type: p.type, value: round2(p.area) }));
            if ((kpis.transitOverlap || 0) > 0.005) rows.push({ kind: 'overlap', id: '', name: '', type: '', value: -round2(kpis.transitOverlap) });
        }
        else if (key === 'docks') rows = zones.filter((z) => z.type === 'dock').map(zoneRow);
        else if (key === 'storage') rows = zones.filter((z) => STORAGE_ZONE_TYPES.includes(z.type)).map(zoneRow);
        else if (key === 'dead') {
            rows = zones.filter((z) => !z.type).map(zoneRow);
            if (restArea > 0) rows.push(restRow());
        } else {
            rows = zones.map(zoneRow);
            if (hasRest) rows.push(restRow());
            if ((kpis.transitOutside || 0) > 0.005) rows.push({ kind: 'transit', id: '', name: '', type: '', value: round2(kpis.transitOutside * factor) });
            if ((kpis.overlap || 0) > 0.005) rows.push({ kind: 'overlap', id: '', name: '', type: '', value: -round2(kpis.overlap * factor) });
        }
        return { rows, sum: kpis[key] || 0, unit: volume ? 'm³' : 'm²' };
    }

    // ---- validación (la usa el servidor antes de guardar; la pantalla solo la usa para avisar) --------------------------
    function sanitizeLayout(input) {
        const errors = [];
        // Una pantalla vieja (sin paredes como obstáculos) manda el Layout como lo conocía: se lee igual que al abrirlo, con una pared por lado, para que no cuente como un cambio del contorno.
        const src = migrateTransit(migrateDoors(migrateWalls(migrateFloors(migrateFootprints(input && typeof input === 'object' ? input : {})))));
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
        if (src.wallsMigrated) out.wallsMigrated = true;
        out.floorsMigrated = true;
        out.rampsMigrated = true;
        if (src.transitMigrated) out.transitMigrated = true;
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
            // Una puerta va sobre una pared (wallId); la de antes trae el número del lado (wall) hasta que pasa a una (migrateDoors). Sin ninguna de las dos queda «sin pared» (la revisión la marca).
            const wallId = d && typeof d.wallId === 'string' ? d.wallId.trim().slice(0, 64) : '';
            if (!wallId && d && d.wall !== undefined && d.wall !== null && !(wall >= 1 && wall <= walls)) errors.push(`${label}: pared no válida`);
            const item = { id: idOf(d && d.id, doorIds, label), name: text(d && d.name, label, true), type: oneOf(d && d.type, DOOR_TYPES, 'staff'), dist: meters(d && d.dist, label), width: meters(d && d.width, label), height: meters(d && d.height, label), open: oneOf(d && d.open, DOOR_OPENS, 'fixed'), hinge: oneOf(d && d.hinge, DOOR_ENDS, 'start'), dir: oneOf(d && d.dir, DOOR_SIDES, 'in') };
            if (wallId) return { ...item, wallId };
            return wall >= 1 && wall <= walls ? { ...item, wall } : { ...item, wallId: '' };
        });

        const powerIds = new Set();
        out.power = list(src.power, LIMITS.power, 'Conexiones de luz').map((e, i) => {
            const label = `Conexión de luz ${i + 1}`;
            const wall = Math.round(Number(e && e.wall));
            // va sobre una pared (wallId); la de antes trae el número del lado (wall) hasta que pasa a una (migrateDoors)
            const wallId = e && typeof e.wallId === 'string' ? e.wallId.trim().slice(0, 64) : '';
            if (!wallId && e && e.wall !== undefined && e.wall !== null && !(wall >= 1 && wall <= walls)) errors.push(`${label}: pared no válida`);
            const item = { id: idOf(e && e.id, powerIds, label), type: oneOf(e && e.type, POWER_TYPES, 'outlet110'), dist: meters(e && e.dist, label), height: meters(e && e.height, label) };
            if (wallId) return { ...item, wallId };
            return wall >= 1 && wall <= walls ? { ...item, wall } : { ...item, wallId: '' };
        });

        // Sensores de temperatura y humedad (paso Sensores): sobre una pared, como las conexiones de luz. El código (S001…) lo pone el sistema y la zona sale de dónde queda el sensor (más abajo).
        const sensorIds = new Set();
        out.sensors = list(src.sensors, LIMITS.sensors, 'Sensores').map((e, i) => {
            const label = `Sensor ${i + 1}`;
            const wall = Math.round(Number(e && e.wall));
            const wallId = e && typeof e.wallId === 'string' ? e.wallId.trim().slice(0, 64) : '';
            if (!wallId && e && e.wall !== undefined && e.wall !== null && !(wall >= 1 && wall <= walls)) errors.push(`${label}: pared no válida`);
            const item = { id: idOf(e && e.id, sensorIds, label), code: text(e && e.code, label, false), type: oneOf(e && e.type, SENSOR_TYPES, 'both'), zoneId: '', dist: meters(e && e.dist, label), height: meters(e && e.height, label) };
            // Las zonas que mide (una o varias; sin elegir mide la zona donde está colocado): solo se guarda si se eligió alguna. Las que ya no existen se quitan más abajo, cuando las zonas ya están limpias.
            const measured = Array.isArray(e && e.zones) ? [...new Set(e.zones.filter((zid) => typeof zid === 'string' && zid).map((zid) => zid.slice(0, 64)))].slice(0, LIMITS.zones) : [];
            const withZones = (obj) => (measured.length ? { ...obj, zones: measured } : obj);
            if (wallId) return withZones({ ...item, wallId });
            return wall >= 1 && wall <= walls ? withZones({ ...item, wall }) : withZones({ ...item, wallId: '' });
        });

        const obstacleIds = new Set();
        out.obstacles = list(src.obstacles, LIMITS.obstacles, 'Obstáculos del contorno').map((o, i) => {
            const label = `Obstáculo ${i + 1}`;
            const kind = oneOf(o && o.kind, OBSTACLE_KINDS, 'column');
            const mode = oneOf(o && o.mode, OBSTACLE_MODES, 'free');
            const base = { id: idOf(o && o.id, obstacleIds, label), name: text(o && o.name, label, false), kind, mode };
            if (kind === 'wall') {
                const wc = text(o && o.code, label, false); if (wc) base.code = wc.toUpperCase();
                // La altura propia de la pared es opcional y POR ESQUINA: h al inicio y h2 al final (sin ellas valen las de siempre: las del contorno en cada extremo o el promedio de la nave); es distinta de la de las huellas.
                // El lado B (hb al inicio, hb2 al final) es la altura de la pared del OTRO lado, medida desde el piso de ese lado; vacío = la pared llega a la misma altura de los dos lados.
                ['h', 'h2', 'hb', 'hb2'].forEach((hk) => {
                    if (!o || o[hk] === undefined || o[hk] === null || o[hk] === '') return;
                    const wh = Number(o[hk]);
                    if (Number.isFinite(wh) && wh >= 0.01 && wh <= LIMITS.maxHeight) base[hk] = round2(wh); else errors.push(`${label}: la altura de la pared no es válida`);
                });
                // Formato propio (color, trama y borde, como los pisos y las zonas): opcional; sin él la pared se ve oscura como siempre.
                const wallFmt = sanitizeFmt(o && o.fmt);
                if (wallFmt) base.fmt = wallFmt;
            }
            if (kind === 'column' || kind === 'other') {
                // Un obstáculo que no llega al piso ni al techo: su altura del piso (elev) y su alto (h), opcionales (vacío = va del piso al techo, como una columna). Una altura del piso de 0 es el piso: no se guarda.
                [['elev', 0], ['h', 0.01]].forEach(([hk, min]) => {
                    if (!o || o[hk] === undefined || o[hk] === null || o[hk] === '') return;
                    const hv = Number(o[hk]);
                    if (Number.isFinite(hv) && hv >= min && hv <= LIMITS.maxHeight) { if (hv > 0) base[hk] = round2(hv); } else errors.push(`${label}: ${hk === 'elev' ? 'la altura del piso' : 'el alto'} del obstáculo no es válido`);
                });
            }
            if (mode === 'contour') {
                const wall = Math.round(Number(o && o.wall));
                if (!(wall >= 1 && wall <= walls)) errors.push(`${label}: lado no válido`);
                Object.assign(base, { wall: wall >= 1 && wall <= walls ? wall : 1, dist: meters(o && o.dist, label), l: meters(o && o.l, label), w: meters(o && o.w, label) });
            } else {
                Object.assign(base, { x: meters(o && o.x, label, -LIMITS.maxM), y: meters(o && o.y, label, -LIMITS.maxM), l: meters(o && o.l, label), w: meters(o && o.w, label) });
            }
            if (kind === 'step') base.dz = meters(o && o.dz != null && o.dz !== '' ? o.dz : 0, label, -LIMITS.maxHeight);
            return base;
        });

        { const wn = cleanWallNext(src.wallNext); if (wn) out.wallNext = wn; }
        // La pared de cada puerta tiene que existir (una pared quitada deja a sus puertas «sin pared» en la pantalla; aquí solo se rechaza una referencia a una que no está).
        out.doors.forEach((d) => { if (d.wallId && !out.obstacles.some((o) => o.id === d.wallId && o.kind === 'wall')) errors.push(`Puerta «${d.name}»: la pared que se eligió no existe`); });
        out.power.forEach((e, i) => { if (e.wallId && !out.obstacles.some((o) => o.id === e.wallId && o.kind === 'wall')) errors.push(`Conexión de luz ${i + 1}: la pared que se eligió no existe`); });
        out.sensors.forEach((e, i) => { if (e.wallId && !out.obstacles.some((o) => o.id === e.wallId && o.kind === 'wall')) errors.push(`Sensor ${i + 1}: la pared que se eligió no existe`); });

        // Objetos: personas y montacargas dibujados en el plano (foto fija).
        const objectIds = new Set();
        out.objects = list(src.objects, LIMITS.objects, 'Objetos').map((p, i) => {
            const label = `Objeto ${i + 1}`;
            const ang = Number(p && p.angle);
            const item = {
                id: idOf(p && p.id, objectIds, label), name: text(p && p.name, label, false), type: oneOf(p && p.type, OBJECT_TYPES, 'person'), ...(Number(p && p.equipId) > 0 ? { equipId: Math.round(Number(p.equipId)) } : {}),
                x: meters(p && p.x, label, -LIMITS.maxM), y: meters(p && p.y, label, -LIMITS.maxM),
                angle: Number.isFinite(ang) ? round2(((ang % 360) + 360) % 360) : 0,
                l: meters(p && p.l, label), w: meters(p && p.w, label), h: p && p.h != null && p.h !== '' ? meters(p.h, label) : 0,
            };
            if (!(item.l > 0 && item.w > 0)) errors.push(`${label}: el largo y el ancho deben ser mayores que 0`);
            // el color del chaleco y del casco del operario (solo la persona; solo se guarda el que no es de fábrica)
            if (item.type === 'person') {
                const pc = personColorsOf(p);
                if (pc.vest !== PERSON_COLORS.vest) item.vest = pc.vest;
                if (pc.helmet !== PERSON_COLORS.helmet) item.helmet = pc.helmet;
            } else {
                const ec = equipColorOf({ type: item.type, color: p && p.color });
                if (ec !== (EQUIP_COLORS[item.type] || EQUIP_COLORS.box)) item.color = ec;
            }
            return item;
        });
        // Seguridad: extintores, hidrantes, puertas de emergencia… (puntos sobre el plano; la ruta de evacuación lleva dos). El código (E001…) lo pone el sistema y la zona sale de dónde queda el punto (más abajo).
        const safetyIds = new Set();
        out.safety = list(src.safety, LIMITS.safety, 'Seguridad').map((e, i) => {
            const label = `Elemento de seguridad ${i + 1}`;
            const type = oneOf(e && e.type, SAFETY_TYPES, 'extinguisher');
            const item = {
                id: idOf(e && e.id, safetyIds, label), code: text(e && e.code, label, false), type, name: text(e && e.name, label, false), zoneId: '',
                x: meters(e && e.x, label, -LIMITS.maxM), y: meters(e && e.y, label, -LIMITS.maxM),
            };
            if (type === 'route') { item.x2 = meters(e && e.x2, label, -LIMITS.maxM); item.y2 = meters(e && e.y2, label, -LIMITS.maxM); }
            // el modelo del hidrante (solo se guarda si no es el de columna, el de siempre)
            if (type === 'hydrant' && e && HYDRANT_MODELS.includes(e.model) && e.model !== 'column') item.model = e.model;
            // Altura al piso y tamaño (todo opcional: vacío = la medida de fábrica de su tipo; la ruta de evacuación no lleva).
            if (type !== 'route') {
                [['elev', 0, LIMITS.maxHeight, 'la altura del piso'], ['l', 0.01, LIMITS.maxM, 'el largo'], ['w', 0.01, LIMITS.maxM, 'el ancho'], ['h', 0.01, LIMITS.maxHeight, 'el alto']].forEach(([k, min, max, what]) => {
                    const v = e && e[k];
                    if (v === undefined || v === null || v === '') return;
                    const n = Number(v);
                    if (Number.isFinite(n) && n >= min && n <= max) item[k] = round2(n); else errors.push(`${label}: ${what} no es válido (de ${min} a ${max} m)`);
                });
            }
            // Fechas (todas opcionales): caducidad (cuándo deja de servir), cada cuántos días se revisa y próxima revisión. Una fecha es AAAA-MM-DD; lo vacío no se guarda.
            ['expires', 'next'].forEach((k) => {
                const v = e && e[k];
                if (v === undefined || v === null || v === '') return;
                if (isIsoDate(v)) item[k] = v; else errors.push(`${label}: fecha no válida`);
            });
            const every = e && e.every;
            if (every !== undefined && every !== null && every !== '') {
                const days = Math.round(Number(every));
                if (Number.isFinite(days) && days >= 1 && days <= 3650) item.every = days; else errors.push(`${label}: «Revisar cada» debe ser de 1 a 3650 días`);
            }
            return item;
        });
        // el último número de código que se dio (para no volver a usar uno borrado); lo que manda el servidor es lo guardado, esto solo lo conserva
        out.safetyNext = cleanSafetyNext(src.safetyNext);
        // con cuántos días de anticipación un elemento sale «Por vencer» (de fábrica 30; solo se guarda si es otro número)
        const warnDays = Math.round(Number(src.safetyWarnDays));
        if (Number.isFinite(warnDays) && warnDays >= 1 && warnDays <= 365 && warnDays !== SAFETY_WARN_DAYS) out.safetyWarnDays = warnDays;
        // Tránsito: los pasillos y las medidas de lo que transita por ellos.
        const transitIds = new Set();
        out.transit = list(src.transit, LIMITS.transit, 'Pasillos').map((p, i) => {
            const label = `Pasillo ${i + 1}`;
            // quién transita: ids del catálogo de la empresa (y, para lo de antes, las claves people, forklift…); primero los ids
            const who = [];
            (Array.isArray(p && p.who) ? p.who : []).forEach((w) => {
                const v = /^\d+$/.test(String(w)) && Number(w) > 0 ? Number(w) : (TRANSIT_WHO.includes(w) ? w : null);
                if (v !== null && !who.includes(v)) who.push(v);
            });
            who.sort((a, b) => (typeof a === typeof b ? (typeof a === 'number' ? a - b : TRANSIT_WHO.indexOf(a) - TRANSIT_WHO.indexOf(b)) : (typeof a === 'number' ? -1 : 1)));
            const item = {
                id: idOf(p && p.id, transitIds, label), code: text(p && p.code, label, false), name: text(p && p.name, label, false), type: oneOf(p && p.type, TRANSIT_TYPES, 'main'), who, zoneId: '',
                x: meters(p && p.x, label, -LIMITS.maxM), y: meters(p && p.y, label, -LIMITS.maxM), l: meters(p && p.l, label), w: meters(p && p.w, label),
            };
            if (!(item.l > 0 && item.w > 0)) errors.push(`${label}: el largo y el ancho deben ser mayores que 0`);
            if (who.includes('other')) { const otherName = text(p && p.otherName, label, false); if (otherName) item.otherName = otherName; }
            const h = p && p.h != null && p.h !== '' ? meters(p.h, label) : 0;
            if (h > 0) item.h = h;
            // Formato propio (color, trama y borde, como los pisos y las zonas): opcional; sin él el pasillo se ve como siempre (rayas el principal, puntos el de entre pasillos).
            const transitFmt = sanitizeFmt(p && p.fmt);
            if (transitFmt) item.fmt = transitFmt;
            return item;
        });
        out.transitSizes = {};
        TRANSIT_WHO.forEach((k) => {
            const s = (src.transitSizes && src.transitSizes[k]) || {};
            const d = TRANSIT_SIZE_DEFAULTS[k];
            const pick = (key) => (s[key] === undefined || s[key] === null || s[key] === '' ? d[key] : meters(s[key], `Medidas de lo que transita (${k})`));
            out.transitSizes[k] = { w: pick('w'), l: pick('l'), h: pick('h') };
        });

        const zoneIds = new Set();
        out.zones = list(src.zones, LIMITS.zones, 'Zonas').map((z, i) => {
            const label = `Zona ${i + 1}`;
            const id = idOf(z && z.id, zoneIds, label);
            const name = text(z && z.name, label, true);
            // El código (Z001…) lo pone el sistema (assignZoneCodes, justo después de armar las zonas): lo que mande el cliente solo se usa de punto de partida.
            const code = text(z && z.code, label, false);
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
            // El nivel del piso ya no se guarda en la zona: vive en el paso Pisos (los de antes pasaron solos a un piso, ver migrateFloors).
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
                return { id, name, code, type, x: round2(x), y: round2(y), l: round2((pts.length ? Math.max(...px) : 0) - x), w: round2((pts.length ? Math.max(...py) : 0) - y), pts, ...extra, active };
            }
            return {
                id, name, code, type,
                x: meters(z && z.x, label, -LIMITS.maxM), y: meters(z && z.y, label, -LIMITS.maxM), l: meters(z && z.l, label), w: meters(z && z.w, label), ...extra, active,
            };
        });

        out.zones = assignZoneCodes(out).zones;

        // Pisos (paso Pisos): rectángulos con su nivel (puede ser negativo: un foso) y, si es una rampa, el nivel de su parte alta y hacia qué lado sube; un piso a nivel (0) y sin rampa no guarda nivel. El código (P001…) lo pone el sistema.
        const floorIds = new Set();
        out.floors = list(src.floors, LIMITS.floors, 'Pisos').map((f, i) => {
            const label = `Piso ${i + 1}`;
            const id = idOf(f && f.id, floorIds, label);
            const name = text(f && f.name, label, true);
            const code = text(f && f.code, label, false);
            const lvlRaw = f && f.lvl != null && f.lvl !== '' ? Number(f.lvl) : 0;
            const lvl2Raw = f && f.lvl2 != null && f.lvl2 !== '' ? Number(f.lvl2) : null;
            if (!Number.isFinite(lvlRaw) || Math.abs(lvlRaw) > LIMITS.maxHeight) errors.push(`${label}: el nivel del piso no es válido`);
            if (lvl2Raw !== null && (!Number.isFinite(lvl2Raw) || Math.abs(lvl2Raw) > LIMITS.maxHeight)) errors.push(`${label}: el nivel de la parte alta no es válido`);
            const lvl = Number.isFinite(lvlRaw) && Math.abs(lvlRaw) <= LIMITS.maxHeight ? round2(lvlRaw) : 0;
            const lvl2 = lvl2Raw !== null && Number.isFinite(lvl2Raw) && Math.abs(lvl2Raw) <= LIMITS.maxHeight ? round2(lvl2Raw) : null;
            const ramp = lvl2 !== null && lvl2 !== lvl;
            const item = {
                id, name, code, x: meters(f && f.x, label, -LIMITS.maxM), y: meters(f && f.y, label, -LIMITS.maxM), l: meters(f && f.l, label), w: meters(f && f.w, label),
                ...(lvl !== 0 ? { lvl } : {}), ...(ramp ? { lvl2, rise: oneOf(f && f.rise, ZONE_RISES, 'right') } : {}), active: !(f && f.active === false), ...(sanitizeFmt(f && f.fmt) ? { fmt: sanitizeFmt(f && f.fmt) } : {}),
            };
            if (!(item.l > 0 && item.w > 0)) errors.push(`${label}: el largo y el ancho deben ser mayores que 0`);
            return item;
        });
        out.floors = assignFloorCodes(out).floors;
        // Rampas (paso Rampas): un recuadro del croquis que une dos pisos (o un piso y la nave); sus niveles y su lado más alto salen de los pisos. Una rampa de antes que no se pudo ligar conserva sus niveles. El código (R001…) lo pone el sistema.
        const rampIds = new Set();
        out.ramps = list(src.ramps, LIMITS.ramps, 'Rampas').map((r, i) => {
            const label = `Rampa ${i + 1}`;
            const id = idOf(r && r.id, rampIds, label);
            const name = text(r && r.name, label, true);
            const code = text(r && r.code, label, false);
            const refOf = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : '');
            const from = refOf(r && r.from);
            const to = refOf(r && r.to);
            const lvlRaw = r && r.lvl != null && r.lvl !== '' ? Number(r.lvl) : 0;
            const lvl2Raw = r && r.lvl2 != null && r.lvl2 !== '' ? Number(r.lvl2) : null;
            const legacy = !from && !to && lvl2Raw !== null && Number.isFinite(lvl2Raw) && Math.abs(lvl2Raw) <= LIMITS.maxHeight && Number.isFinite(lvlRaw) && Math.abs(lvlRaw) <= LIMITS.maxHeight && round2(lvl2Raw) !== round2(lvlRaw);
            const item = {
                id, name, code, x: meters(r && r.x, label, -LIMITS.maxM), y: meters(r && r.y, label, -LIMITS.maxM), l: meters(r && r.l, label), w: meters(r && r.w, label),
                ...(from ? { from } : {}), ...(to ? { to } : {}),
                ...(legacy ? { lvl: round2(lvlRaw), lvl2: round2(lvl2Raw), rise: oneOf(r && r.rise, ZONE_RISES, 'right') } : {}),
                active: !(r && r.active === false), ...(sanitizeFmt(r && r.fmt) ? { fmt: sanitizeFmt(r && r.fmt) } : {}),
            };
            if (!(item.l > 0 && item.w > 0)) errors.push(`${label}: el largo y el ancho deben ser mayores que 0`);
            return item;
        });
        out.ramps = assignRampCodes(out).ramps;
        rampIssues(out).forEach((v) => errors.push(v.text));
        // El piso tiene que quedar abajo del techo de la nave (en su centro): si no, no queda espacio para nada.
        floorsAll(out).forEach((ff) => {
            if (ff.active === false || !(ff.l > 0 && ff.w > 0) || !zoneHasLevel(ff)) return;
            const top = Math.max(Number(ff.lvl) || 0, ff.lvl2 != null ? Number(ff.lvl2) : 0);
            const lim = naveHeightAt(out, ff.x + ff.l / 2, ff.y + ff.w / 2);
            if (lim > 0 && top >= lim - 1e-9) errors.push(`${ff.code} ${ff.name}: su nivel (a ${top > 0 ? '+' : ''}${top} m) queda tan arriba como el techo de la nave (${round2(lim)} m): bájalo`);
        });
        // Dos pisos no se pueden encimar (que se toquen en la orilla sí): así cada punto de la nave tiene un solo nivel.
        floorOverlaps(out).forEach(({ a, b, area }) => errors.push(`Los pisos ${a.code} ${a.name} y ${b.code} ${b.name} se enciman (${area} m²): cada uno tiene que quedar aparte`));

        // Huellas (paso Huella-Espacio): el lugar en el piso. Cada una puede tener uno o varios activos (ver migrateFootprints).
        const footprintIds = new Set();
        out.footprints = list(src.footprints, LIMITS.spaces, 'Huellas').map((f, i) => {
            const label = `Huella ${i + 1}`;
            // El código lo pone el sistema (consecutivo por zona, assignHuellaCodes más abajo) y la zona sale de dónde está la huella (deriveFootprintZones): lo que mande el cliente solo se usa de punto de partida.
            const code = text(f && f.code, label, false);
            const zoneId = '';
            // El nombre de la Huella-Espacio: opcional; sin él se guarda sin ese campo.
            const name = text(f && f.name, label, false);
            // Formato propio de la huella (color, rayas y borde, como el de las zonas): sin él la huella se ve blanca.
            const fmt = sanitizeFmt(f && f.fmt);
            return {
                id: idOf(f && f.id, footprintIds, label), code, zoneId,
                ...(name ? { name } : {}),
                x: meters(f && f.x, label, -LIMITS.maxM), y: meters(f && f.y, label, -LIMITS.maxM), l: meters(f && f.l, label), d: meters(f && f.d, label), h: meters(f && f.h, label),
                ...(fmt ? { fmt } : {}),
                active: !(f && f.active === false),
            };
        });

        // Activos (paso Activos): lo que hay encima de una huella. Su lugar en el piso, su zona, su alto, su nombre y su formato salen de la huella (deriveSpaces).
        const spaceIds = new Set();
        // Rango del refrigerador (solo activos de tipo Frío): temperatura (°C) y humedad (%), mínima y máxima, cada una opcional. Las lecturas de Temperaturas que salen de ese rango se marcan como alerta.
        const rangeVal = (v, lo, hi) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null; };
        out.spaces = list(src.spaces, LIMITS.spaces, 'Activos').map((s, i) => {
            const label = `Activo ${i + 1}`;
            // El código (A001…) lo pone el sistema según el tipo del activo, consecutivo por zona y tipo (assignSpaceCodes, justo después): lo que mande el cliente solo se usa de punto de partida.
            const code = text(s && s.code, label, false);
            // el nombre propio del activo (opcional, para personalizar): sin él se ve el de su huella
            const ownName = text(s && s.ownName, label, false);
            const footprintId = typeof (s && s.footprintId) === 'string' && footprintIds.has(s.footprintId) ? s.footprintId : '';
            if (!footprintId) errors.push(`${label}: elige la huella donde va (un activo siempre va dentro de una huella)`);
            const type = oneOf(s && s.type, SPACE_TYPES, 'rack');
            const levels = Math.round(Number(s && s.levels));
            // Columnas por nivel (antes «espacios por nivel»: las columnas de almacenamiento, de izquierda a derecha): solo se guarda si hay más de una.
            const slots = Math.round(Number(s && s.slots));
            // Huecos (paso Posiciones): cada hueco = un nivel × una columna de este activo; lleva cuántas filas y cuántas profundidades tiene y sus medidas. Solo se guarda lo que se cambió.
            // Niveles (paso Niveles): la altura desde el piso, el alto y la ceja de cada nivel, su nombre y cuántas posiciones tiene, para todas sus posiciones. Solo se guarda lo que se cambió.
            const lvls = sanitizeLevels(s && s.lvls, Number.isFinite(levels) && levels >= 1 && levels <= 50 ? levels : 1);
            const baseSlots = Number.isFinite(slots) && slots > 1 ? Math.min(slots, LIMITS.slots) : 1;
            const slotsOfLevel = (n) => { const lv = lvls.find((x) => x.n === n); return lv && lv.slots ? lv.slots : baseSlots; };
            const maxSlotsHere = Math.max(baseSlots, ...lvls.map((x) => x.slots || 0));
            const bays = sanitizeBays(s && s.bays, Number.isFinite(levels) && levels >= 1 && levels <= 50 ? levels : 1, maxSlotsHere).filter((b) => b.c <= slotsOfLevel(b.n));
            // Paso Activos: la clasificación (Mobiliario operativo, Mobiliario almacenamiento…) y el tipo (rack, estante, escritorio…) del activo de este espacio; son ids de los catálogos del cliente.
            // Sin elegir, el espacio se guarda sin esos campos.
            const assetClassId = Math.round(Number(s && s.assetClassId));
            const assetId = Math.round(Number(s && s.assetId));
            const assetFmt = sanitizeFmt(s && s.fmt);
            const tempMin = type === 'cold' ? rangeVal(s && s.tempMin, -100, 100) : null;
            const tempMax = type === 'cold' ? rangeVal(s && s.tempMax, -100, 100) : null;
            const humMin = type === 'cold' ? rangeVal(s && s.humMin, 0, 100) : null;
            const humMax = type === 'cold' ? rangeVal(s && s.humMax, 0, 100) : null;
            if (tempMin !== null && tempMax !== null && tempMin > tempMax) errors.push(`${label}: la temperatura mínima no puede ser mayor que la máxima`);
            if (humMin !== null && humMax !== null && humMin > humMax) errors.push(`${label}: la humedad mínima no puede ser mayor que la máxima`);
            // Lugar y medidas propios dentro de la huella (opcionales; vacío = se acomoda solo, ver placeGroup): la distancia desde la esquina puede ser 0; el largo, el fondo y el alto deben ser mayores que 0.
            const own = {};
            [['ox', 0, 'la posición X'], ['oy', 0, 'la posición Y'], ['ol', 0.01, 'el largo'], ['od', 0.01, 'el fondo'], ['oh', 0.01, 'el alto']].forEach(([key, min, what]) => {
                const raw = s && s[key];
                if (raw === null || raw === undefined || raw === '') return;
                const n = Number(raw);
                if (!Number.isFinite(n) || n < min || n > LIMITS.maxM) { errors.push(`${label}: ${what} debe ser ${min === 0 ? 'cero o más' : 'mayor que 0'} (máximo ${LIMITS.maxM} m)`); return; }
                own[key] = round2(n);
            });
            const spaceFaces = sanitizeFaces(s && s.faces); // sus caras de consumo (sin guardar: el frente)
            const spaceFront = s && ['N', 'S', 'E', 'W'].includes(s.front) ? s.front : ''; // el frente puesto a mano (sin él sale del pasillo principal)
            return {
                id: idOf(s && s.id, spaceIds, label), footprintId, type, code,
                ...(ownName ? { ownName } : {}),
                ...(spaceFaces ? { faces: spaceFaces } : {}),
                ...(spaceFront ? { front: spaceFront } : {}),
                levels: Number.isFinite(levels) && levels >= 1 && levels <= 50 ? levels : 1,
                ...(Number.isFinite(slots) && slots > 1 ? { slots: Math.min(slots, LIMITS.slots) } : {}),
                ...(bays.length ? { bays } : {}),
                ...(lvls.length ? { lvls } : {}),
                ...(Number.isFinite(assetClassId) && assetClassId > 0 ? { assetClassId } : {}),
                ...(Number.isFinite(assetId) && assetId > 0 ? { assetId } : {}),
                drawers: text(s && s.drawers, label, false),
                ...(s && s.off === true ? { off: true } : {}),
                ...(assetFmt ? { fmt: assetFmt } : {}),
                ...own,
                ...(tempMin !== null ? { tempMin } : {}), ...(tempMax !== null ? { tempMax } : {}), ...(humMin !== null ? { humMin } : {}), ...(humMax !== null ? { humMax } : {}),
            };
        });
        out.footprints = assignHuellaCodes(deriveFootprintZones(out)).footprints;
        out.sensors = assignSensorCodes(deriveSensorZones(out)).sensors;
        // una zona que ya no existe se quita de las que mide el sensor (borrar una zona no bloquea el guardado)
        { const known = new Set((out.zones || []).map((zz) => zz.id)); out.sensors = out.sensors.map((sn) => { if (!sn.zones) return sn; const kept = sn.zones.filter((zid) => known.has(zid)); if (kept.length === sn.zones.length) return sn; const { zones: dropped, ...rest } = sn; return kept.length ? { ...rest, zones: kept } : rest; }); }
        out.transit = assignTransitCodes(deriveTransitZones(out)).transit;
        { const walled = assignWallCodes(out); out.obstacles = walled.obstacles; if (walled.wallNext) out.wallNext = walled.wallNext; else delete out.wallNext; }
        // códigos de puertas, luz, obstáculos y objetos: el que ya traen se conserva (si es válido y no se repite) y los demás los pone el sistema
        ITEM_CODES.forEach(({ list, next }) => {
            out[list] = (out[list] || []).map((o, i) => {
                const raw = Array.isArray(src[list]) ? src[list][i] : null;
                const c = raw && typeof raw.code === 'string' ? raw.code.trim().toUpperCase().slice(0, 12) : '';
                return c && o.kind !== 'wall' ? { ...o, code: c } : o;
            });
            const n = cleanWallNext(src[next]);
            if (n) out[next] = n;
        });
        { const coded = assignItemCodes(out); ITEM_CODES.forEach(({ list, next }) => { out[list] = coded[list]; if (coded[next]) out[next] = coded[next]; else delete out[next]; }); }
        { const safe = assignSafetyCodes(deriveSafetyZones(out)); out.safety = safe.safety; if (safe.safetyNext && Object.keys(safe.safetyNext).length) out.safetyNext = safe.safetyNext; else delete out.safetyNext; }
        out.spaces = assignSpaceCodes({ ...out, spaces: deriveSpaces({ ...out, ownAssetFmt: !!(src && src.ownAssetFmt === true) }).spaces }).spaces;
        // Posiciones (paso Posiciones): lugares libres dentro de un espacio (un nivel × una columna de un activo). Cada una lleva su lugar (x, y desde la esquina de arriba a la izquierda del espacio), su largo, su fondo y su alto, su número (P001…, el
        // consecutivo dentro del espacio, que no se reusa: posNext) y, solo si las cambió, sus caras de consumo. Una posición de un espacio que ya no existe (se quitó el activo, el nivel o la columna) se descarta sin avisar.
        {
            const spaceById = new Map(out.spaces.map((sp) => [sp.id, sp]));
            const seenIds = new Set();
            const nums = new Map();
            const given = src.posNext && typeof src.posNext === 'object' ? src.posNext : {};
            const kept = [];
            list(src.positions, LIMITS.positions, 'Posiciones').forEach((p, i) => {
                const label = `Posición ${i + 1}`;
                const sp = spaceById.get(p && p.spaceId);
                const n = Math.round(Number(p && p.n));
                const c = Math.round(Number(p && p.c));
                if (!sp || !(n >= 1 && n <= (sp.levels || 1)) || !(c >= 1 && c <= levelSlots(sp, n))) return;
                const key = `${sp.id}|${n}|${c}`;
                const item = { id: idOf(p && p.id, seenIds, label), spaceId: sp.id, n, c, x: meters(p && p.x, label), y: meters(p && p.y, label), l: meters(p && p.l, label), w: meters(p && p.w, label), h: meters(p && p.h, label) };
                if (!(item.l > 0 && item.w > 0 && item.h > 0)) errors.push(`${label}: el largo, el fondo y el alto deben ser mayores que 0`);
                const posFaces = sanitizeFaces(p && p.faces);
                if (posFaces) item.faces = posFaces;
                if (p && p.auto === true) item.auto = true; // la generó el sistema (de las filas y profundidades de antes o la de fábrica) y nadie la ha tocado: sigue el tamaño de su espacio
                const num = Math.round(Number(p && p.num));
                const used = nums.get(key) || new Set();
                if (Number.isFinite(num) && num >= 1 && num <= 9999 && !used.has(num)) { item.num = num; used.add(num); nums.set(key, used); }
                kept.push({ item, key });
            });
            // las que no traen número (o lo repiten) reciben el siguiente después del más alto y del último que ya se dio
            kept.forEach(({ item, key }) => {
                if (item.num) return;
                const used = nums.get(key) || new Set();
                item.num = Math.max(Number(given[key]) || 0, ...used, 0) + 1;
                used.add(item.num);
                nums.set(key, used);
            });
            out.positions = kept.map((x) => canonPos(x.item));
            const counters = {};
            nums.forEach((used, key) => { counters[key] = Math.max(Number(given[key]) || 0, ...used); });
            Object.keys(given).forEach((key) => { if (counters[key] === undefined && spaceById.has(key.split('|')[0]) && Number(given[key]) > 0) counters[key] = Math.round(Number(given[key])); });
            if (Object.keys(counters).length) out.posNext = counters;
            // todo espacio tiene al menos una posición (la de fábrica cubre todo el espacio; las celdas fila × profundidad de antes pasan a ser posiciones)
            const ensured = ensurePositions(out);
            out.positions = ensured.positions;
            if (ensured.posNext && Object.keys(ensured.posNext).length) out.posNext = ensured.posNext; else delete out.posNext;
            if (!out.positions.length) delete out.positions;
        }
        const plan = src.plan && typeof src.plan === 'object' ? src.plan : null;
        out.plan = plan ? { widthM: meters(plan.widthM, 'Plano', 0.1) } : null;
        // marca: desde aquí el color de cada activo es suyo aunque se parezca al de su huella (los Layouts de antes, sin marca, todavía traen los heredados)
        out.ownAssetFmt = true;
        // el formato de cada número de espacio (solo los que traen uno propio y válido, en orden de número)
        if (src.bayFmt && typeof src.bayFmt === 'object' && !Array.isArray(src.bayFmt)) {
            const bf = {};
            Object.keys(src.bayFmt).map((k) => Math.round(Number(k))).filter((n) => n >= 1 && n <= LIMITS.slots).sort((a, z) => a - z).forEach((n) => {
                const f = sanitizeFmt(src.bayFmt[String(n)]);
                if (f) bf[String(n)] = f;
            });
            if (Object.keys(bf).length) out.bayFmt = bf;
        }
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

    // Contorno blanco de los textos del croquis (nombres, m², medidas): 8 copias del texto en blanco, corridas 1.5 hacia cada lado y dibujadas debajo del texto de color. Solo usan el relleno,
    // que se pinta igual en todos los navegadores (el trazo con paint-order se veía distinto, o no se veía, en algunos celulares). La página del QR, el reporte y el editor usan estos mismos pasos.
    const HALO_STEPS = [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5], [-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]];

    // Recuadro aproximado [x0, y0, x1, y1] que ocupa un texto del croquis (para que nombres, m² y medidas no se encimen).
    function labelBox(x, baseline, text, size, anchor) {
        const w = String(text).length * size * 0.58 + 3;
        const x0 = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
        return [x0, baseline - size, x0 + w, baseline + 3];
    }

    // Dónde poner el nombre (y los m²) de una zona de rectángulo sin taparle el nombre a otra: primero la esquina que eligió zoneLabelSpot; si ahí cae encima de un nombre ya
    // puesto (taken = recuadros de labelBox), prueba las otras esquinas, luego más abajo dentro de la zona y al final afuera (debajo y arriba). Si nada queda libre se queda con la primera.
    // hideName = el nombre no se dibuja (icono Ocultar nombres): los m² (si se ven) ocupan su lugar (areaOnly) y solo ellos cuentan para no encimarse.
    function placeZoneLabel(z, spot, X, Y, sc, taken, areaText, hideName) {
        const x0 = X(z.x); const x1 = X(z.x + z.l); const y0 = Y(z.y); const y1 = Y(z.y + z.w);
        const bottomTy = y1 - (z.w * sc > 26 ? 17 : 5);
        const topTy = y0 + 12;
        const makeAt = (tx, anchor, ty) => {
            if (hideName) return { tx, ty, anchor, withArea: false, areaOnly: Boolean(areaText), boxes: areaText ? [labelBox(tx, ty, areaText, 8.5, anchor)] : [] };
            const withArea = Boolean(areaText) && z.w * sc > 26;
            const boxes = [labelBox(tx, ty, z.name, 10, anchor)];
            if (withArea) boxes.push(labelBox(tx, ty + 11, areaText, 8.5, anchor));
            return { tx, ty, anchor, withArea, boxes };
        };
        const make = (right, ty) => makeAt(right ? x1 - 5 : x0 + 5, right ? 'end' : 'start', ty);
        const overlapArea = (c) => c.boxes.reduce((acc, b) => acc + (taken || []).reduce((a2, o) => {
            const ox = Math.min(b[2], o[2]) - Math.max(b[0], o[0]);
            const oy = Math.min(b[3], o[3]) - Math.max(b[1], o[1]);
            return ox > 0 && oy > 0 ? a2 + ox * oy : a2;
        }, 0), 0);
        const firstTy = spot.bottom ? bottomTy : topTy;
        const otherTy = spot.bottom ? topTy : bottomTy;
        const tries = [make(spot.right, firstTy), make(!spot.right, firstTy), make(spot.right, otherTy), make(!spot.right, otherTy)];
        for (let ty = topTy + 12; ty < y1 - 4; ty += 12) tries.push(make(spot.right, ty), make(!spot.right, ty));
        // zonas muy chicas: el nombre sale afuera, pegado a la derecha o a la izquierda de la zona y debajo o arriba de ella
        [y0 + 12, (y0 + y1) / 2 + 3, y1 - 4, y1 + 12, y0 - 4, y1 + 24, y0 - 16].forEach((ty) => { tries.push(makeAt(x1 + 4, 'start', ty), makeAt(x0 - 4, 'end', ty)); });
        const free = tries.find((c) => overlapArea(c) === 0);
        if (free) return free;
        // nada quedó libre: la opción que menos se encima
        return tries.reduce((best, c) => (overlapArea(c) < overlapArea(best) ? c : best), tries[0]);
    }

    // Qué datos tiene cada sección (para saber si "Ver y Operar" todavía puede llenarla).
    // Gira el Layout (SOLO para dibujarlo; lo guardado no cambia) en cuartos de vuelta hacia la derecha: 0, 1 (90°), 2 (180°) o 3 (270°). Se giran las esquinas, las zonas (con sus
    // esquinas si son de forma libre), los espacios y las columnas; las puertas y las conexiones de luz van por número de pared, así que siguen a su pared solas. Los textos del
    // dibujo no se giran: se vuelven a poner derechos sobre la figura ya girada.
    // Lo que va sobre una pared (puerta, conexión de luz, sensor) se ubica en el Layout sin girar y de ahí se giran sus extremos y hacia dónde va la pared.
    function rotateOnWall(layout, item, asDoor, pt, turn) {
        const g = doorGeometry(layout, asDoor);
        if (!g) return item;
        const dir = pt(g.ux, g.uy);
        const nor = pt(g.nx || 0, g.ny || 0);
        const a = turn([g.a.x, g.a.y]);
        const b = turn([g.b.x, g.b.y]);
        return { ...item, _seg: { ...g, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, ux: dir[0], uy: dir[1], nx: nor[0], ny: nor[1] } };
    }
    // Hacia qué lado del croquis sube una rampa, con el croquis girado q cuartos de vuelta a la derecha.
    const rotateRise = (rise, q) => { const order = ['up', 'right', 'down', 'left']; const i = order.indexOf(rise); return i < 0 ? rise : order[(i + q) % 4]; };
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
            // una puerta se ubica sobre su pared en el Layout sin girar y de ahí se giran sus dos extremos y hacia dónde va
            doors: (layout.doors || []).map((door) => rotateOnWall(layout, door, door, pt, turn)),
            power: (layout.power || []).map((e) => rotateOnWall(layout, e, { ...e, width: 0 }, pt, turn)),
            sensors: (layout.sensors || []).map((e) => rotateOnWall(layout, e, { ...e, width: 0 }, pt, turn)),
            // los obstáculos pegados a un lado del contorno siguen a su lado (que ya viene girado); los de dentro de la nave se giran como cualquier recuadro
            obstacles: (layout.obstacles || []).map((o) => (o.mode === 'contour' ? o : { ...o, ...box(o, 'l', 'w') })),
            transit: (layout.transit || []).map((p) => ({ ...p, ...box(p, 'l', 'w') })),
            // un objeto gira con el croquis: su centro se mueve y hacia donde mira suma el cuarto de vuelta
            objects: (layout.objects || []).map((o) => { const r = pt(o.x, o.y); return { ...o, x: round2(r[0]), y: round2(r[1]), angle: ((((Number(o.angle) || 0) + 90 * q) % 360) + 360) % 360 }; }),
            // un elemento de seguridad (y los dos extremos de la ruta) se mueve con el croquis
            safety: (layout.safety || []).map((e) => { const a = pt(e.x, e.y); const moved = { ...e, x: round2(a[0]), y: round2(a[1]) }; if (e.type === 'route') { const b = pt(e.x2, e.y2); moved.x2 = round2(b[0]); moved.y2 = round2(b[1]); } return moved; }),
            spaces: (layout.spaces || []).map((s) => ({ ...s, ...box(s, 'l', 'd') })),
            footprints: (layout.footprints || []).map((f) => ({ ...f, ...box(f, 'l', 'd') })),
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
            // un piso gira como un recuadro y, si es una rampa, el lado hacia donde sube
            floors: (layout.floors || []).map((f) => ({ ...f, ...box(f, 'l', 'w'), ...(f.rise ? { rise: rotateRise(f.rise, q) } : {}) })),
            // una rampa gira igual (una ligada a sus pisos saca su lado más alto de cómo queda puesta; una de antes, del suyo)
            ramps: (layout.ramps || []).map((r) => ({ ...r, ...box(r, 'l', 'w'), ...(r.rise ? { rise: rotateRise(r.rise, q) } : {}) })),
        };
    }

    // ---- Caras de consumo ---------------------------------------------------------------------------------------------------------------------
    // Por qué cara o caras se consume (se toma) un activo, un nivel o un espacio: una o más de las 4 (frente, atrás, izquierda, derecha; izquierda y derecha como las ve quien mira el activo de frente). Regla de Daniel: lo de adentro solo puede
    // usar caras que lo que lo contiene tiene (si el activo solo tiene el frente, un espacio no puede declarar la trasera; puede reducir, nunca ampliar). Se guarda solo lo que cambia: sin lo guardado vale lo de lo que lo contiene
    // y el activo, sin nada, se consume por el frente.
    const FACES = ['front', 'back', 'left', 'right'];
    const FACE_NAMES_ES = { front: 'frontal', back: 'trasera', left: 'izquierda', right: 'derecha' };
    function sanitizeFaces(raw) {
        if (!Array.isArray(raw)) return null;
        const out = FACES.filter((f) => raw.includes(f));
        return out.length ? out : null;
    }
    const facePhrase = (arr) => `${arr.length === 1 ? 'la cara' : 'las caras'} ${arr.map((f) => FACE_NAMES_ES[f]).join(', ')}`;
    function facesOfSpace(space) { return sanitizeFaces(space && space.faces) || ['front']; }
    function facesOfLevel(space, level) { return sanitizeFaces(levelOf(space, level).faces) || facesOfSpace(space); }
    function facesOfBay(space, level, column) { return sanitizeFaces(bayOf(space, level, column).stored.faces) || facesOfLevel(space, level); }
    // El FRENTE de un activo es la cara que mira al pasillo principal (los pasillos de Tránsito de tipo «Principal»). Con dos pasillos principales en esquina, el frente es la cara de la IZQUIERDA al mirar la esquina del activo desde el cruce de
    // los pasillos (esquina abajo-derecha: la de abajo; abajo-izquierda: la izquierda; arriba-izquierda: la de arriba; arriba-derecha: la derecha). Si ningún pasillo principal lo toca mira al más cercano y, sin pasillos principales, hacia abajo
    // del croquis. Se puede cambiar a mano (space.front). Lados del croquis sin girar: N arriba, S abajo, W izquierda, E derecha. Devuelve { side, source: manual | aisle | corner | nearest | default }.
    function activoFront(layout, space) {
        if (space && ['N', 'S', 'E', 'W'].includes(space.front)) return { side: space.front, source: 'manual' };
        const mains = ((layout && layout.transit) || []).filter((p) => p && p.active !== false && p.type !== 'between' && Number(p.l) > 0 && Number(p.w) > 0);
        if (!space || !(Number(space.l) > 0) || !(Number(space.d) > 0) || !mains.length) return { side: 'S', source: 'default' };
        const TOL = 0.5; const eps = 0.01;
        const sx0 = space.x; const sx1 = space.x + space.l; const sy0 = space.y; const sy1 = space.y + space.d;
        const found = {};
        const put = (side, gap) => { if (found[side] === undefined || gap < found[side]) found[side] = gap; };
        mains.forEach((a) => {
            const ax1 = a.x + a.l; const ay1 = a.y + a.w;
            const ox = Math.min(sx1, ax1) - Math.max(sx0, a.x);
            const oy = Math.min(sy1, ay1) - Math.max(sy0, a.y);
            if (ox > eps) {
                const gs = a.y - sy1; if (gs >= -0.05 && gs <= TOL) put('S', Math.max(gs, 0));
                const gn = sy0 - ay1; if (gn >= -0.05 && gn <= TOL) put('N', Math.max(gn, 0));
            }
            if (oy > eps) {
                const ge = a.x - sx1; if (ge >= -0.05 && ge <= TOL) put('E', Math.max(ge, 0));
                const gw = sx0 - ax1; if (gw >= -0.05 && gw <= TOL) put('W', Math.max(gw, 0));
            }
        });
        const sides = Object.keys(found);
        if (sides.length === 1) return { side: sides[0], source: 'aisle' };
        if (sides.length >= 2) {
            const has = (p, q) => sides.includes(p) && sides.includes(q);
            if (sides.length === 2) {
                if (has('S', 'E')) return { side: 'S', source: 'corner' };
                if (has('S', 'W')) return { side: 'W', source: 'corner' };
                if (has('N', 'W')) return { side: 'N', source: 'corner' };
                if (has('N', 'E')) return { side: 'E', source: 'corner' };
            }
            const order = ['S', 'W', 'N', 'E']; // pasillos de lados opuestos o tres lados: el más pegado; igual de pegados, abajo, izquierda, arriba, derecha
            sides.sort((p, q) => found[p] - found[q] || order.indexOf(p) - order.indexOf(q));
            return { side: sides[0], source: 'aisle' };
        }
        // ningún pasillo principal lo toca: mira al más cercano (hacia donde más lo separa)
        let best = null;
        mains.forEach((a) => {
            const gx = a.x >= sx1 ? a.x - sx1 : (sx0 >= a.x + a.l ? sx0 - (a.x + a.l) : 0);
            const gy = a.y >= sy1 ? a.y - sy1 : (sy0 >= a.y + a.w ? sy0 - (a.y + a.w) : 0);
            const dist = Math.hypot(gx, gy);
            if (!best || dist < best.dist) best = { dist, a, gx, gy };
        });
        const cx = space.x + space.l / 2; const cy = space.y + space.d / 2;
        const side = best.gy >= best.gx ? (best.a.y + best.a.w / 2 >= cy ? 'S' : 'N') : (best.a.x + best.a.l / 2 >= cx ? 'E' : 'W');
        return { side, source: 'nearest' };
    }
    // A qué lado del croquis cae una cara (frente, atrás, izquierda o derecha) de un activo cuyo frente mira al lado `front`. La izquierda y la derecha son las de quien mira el activo de frente.
    function faceSide(front, face) {
        const table = {
            S: { front: 'S', back: 'N', left: 'W', right: 'E' },
            N: { front: 'N', back: 'S', left: 'E', right: 'W' },
            E: { front: 'E', back: 'W', left: 'S', right: 'N' },
            W: { front: 'W', back: 'E', left: 'N', right: 'S' },
        };
        return (table[front] || table.S)[face];
    }

    // ---- Posiciones: lugares libres dentro de un espacio --------------------------------------------------------------------------------------
    // Una posición se acomoda dentro de su espacio como un activo dentro de su huella: x, y desde la esquina de arriba a la izquierda del espacio (croquis sin girar), largo, fondo y alto. Pueden medir distinto, pero no pueden salirse del espacio,
    // pasar de su alto, encimarse con otra del mismo espacio ni usar una cara de consumo que su espacio no tiene. Su código sale del espacio (R001.N001.E001) y su número: R001.N001.E001.P001.
    const pad3 = (n) => String(n).padStart(3, '0');
    const positionCode = (space, p) => `${(space && space.code) || ''}.N${pad3(p.n)}.E${pad3(p.c)}.P${pad3(p.num || 1)}`;
    // Hacia dónde mira cada cara de consumo en el croquis sin girar (vector [x, y], con la y hacia abajo), según el lado del frente del activo (N, S, E o W): el frente mira hacia ese lado, la cara de atrás al contrario y la
    // izquierda y la derecha son las de quien mira el activo de frente.
    function faceVectors(side) {
        const d = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[side] || [0, 1];
        const v = [-d[0], -d[1]];
        return { front: d, back: v, left: [v[1], -v[0]], right: [-v[1], v[0]] };
    }
    function facesOfPosition(space, p) { return sanitizeFaces(p && p.faces) || facesOfBay(space, p.n, p.c); }
    function positionViolations(layout) {
        const out = [];
        if (!layout || !Array.isArray(layout.positions) || !layout.positions.length || !Array.isArray(layout.spaces)) return out;
        const L = deriveSpaces(layout);
        const byId = new Map(L.spaces.map((s) => [s.id, s]));
        const eps = 0.005;
        const m2 = (v) => String(round2(v));
        const groups = new Map();
        layout.positions.forEach((p) => { const key = `${p.spaceId}|${p.n}|${p.c}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p); });
        groups.forEach((items, key) => {
            const s = byId.get(key.split('|')[0]);
            if (!s || s.off === true) return;
            const m = bayMeasures(s, items[0].n, items[0].c);
            items.forEach((p, i) => {
                const code = positionCode(s, p);
                const base = { id: p.id, spaceId: s.id, code, n: p.n, c: p.c };
                const geo = JSON.stringify([p.x, p.y, p.l, p.w, p.h, m.l, m.w, m.h]);
                if (p.x < -eps || p.y < -eps || p.x + p.l > m.l + eps || p.y + p.w > m.w + eps) out.push({ ...base, kind: 'out', sig: geo, vars: { code, l: m2(m.l), w: m2(m.w) }, message: `La posición ${code} se sale de su espacio (mide ${m2(m.l)} × ${m2(m.w)} m): acomódala o cambia sus medidas.` });
                if (p.h > m.h + eps) out.push({ ...base, kind: 'tall', sig: geo, vars: { code, h: m2(p.h), max: m2(m.h) }, message: `La posición ${code} mide ${m2(p.h)} m de alto y su espacio solo ${m2(m.h)} m: baja su alto.` });
                for (let j = 0; j < i; j++) {
                    const o = items[j];
                    if (p.x < o.x + o.l - eps && o.x < p.x + p.l - eps && p.y < o.y + o.w - eps && o.y < p.y + p.w - eps) {
                        const other = positionCode(s, o);
                        out.push({ ...base, kind: 'overlap', sig: geo + JSON.stringify([o.id, o.x, o.y, o.l, o.w]), vars: { code, other, otherId: o.id }, message: `Las posiciones ${other} y ${code} están encimadas: acomódalas o cambia sus medidas.` });
                    }
                }
                const st = sanitizeFaces(p.faces);
                const up = facesOfBay(s, p.n, p.c);
                const extra = st ? st.filter((f) => !up.includes(f)) : [];
                if (extra.length) out.push({ ...base, kind: 'faces', sig: JSON.stringify([p.n, p.c, st, up]), vars: { code, faces: facePhrase(extra), has: facePhrase(up), extra, up }, message: `La posición ${code} se consume por ${facePhrase(extra)} y su espacio se consume por ${facePhrase(up)}: quita esa cara de la posición o agrégala al espacio.` });
            });
        });
        return out;
    }
    // ---- Posiciones por defecto ---------------------------------------------------------------------------------------------------------------
    // Todo espacio tiene al menos una posición. Sin ninguna, el sistema genera las suyas: una que cubre todo el espacio o, si el espacio traía filas y profundidades (la forma de antes), una por cada celda fila × profundidad, con el mismo tamaño
    // que tenía (las filas de izquierda a derecha y la profundidad 1 al frente). Número = (fila − 1) × profundidades + profundidad. Llevan `auto: true` mientras nadie las toca (siguen el tamaño de su espacio) y un id que sale del
    // espacio (id_nivel_columna_número), así que no cambia entre cargas ni entre migraciones.
    // Las posiciones se guardan siempre con las llaves en el mismo orden (así lo guardado y lo generado se comparan igual).
    const canonPos = (p) => ({ id: p.id, spaceId: p.spaceId, n: p.n, c: p.c, num: p.num, x: p.x, y: p.y, l: p.l, w: p.w, h: p.h, ...(p.faces ? { faces: p.faces } : {}), ...(p.auto ? { auto: true } : {}) });
    const splitLen = (total, k) => {
        const out = [];
        let acc = 0;
        for (let i = 0; i < k; i += 1) {
            const v = i < k - 1 ? round2(total / k) : round2(total - acc);
            out.push(Math.max(v, 0.01));
            acc += out[i];
        }
        return out;
    };
    function defaultPositions(space, n, c) {
        const m = bayMeasures(space, n, c);
        const bay = bayOf(space, n, c);
        const rows = Math.max(1, bay.rows);
        const depth = Math.max(1, bay.depth);
        const widths = splitLen(m.l, rows);
        const deeps = splitLen(m.w, depth);
        const h = m.h > 0 ? round2(m.h) : 0.1;
        const out = [];
        let x = 0;
        for (let r = 0; r < rows; r += 1) {
            let y = m.w;
            for (let p = 0; p < depth; p += 1) {
                y = round2(y - deeps[p]);
                const num = r * depth + p + 1;
                out.push(canonPos({ id: `${space.id}_${n}_${c}_${num}`, spaceId: space.id, n, c, num, x: round2(x), y: Math.max(0, y), l: widths[r], w: deeps[p], h, auto: true }));
            }
            x += widths[r];
        }
        return out;
    }
    // El Layout con las posiciones de fábrica de los espacios que no tienen ninguna (y, en los espacios donde todas son de fábrica, con el tamaño al día). Devuelve el mismo Layout si no hay nada que agregar.
    function ensurePositions(layout) {
        if (!layout || !Array.isArray(layout.spaces) || !layout.spaces.length) return layout;
        const derived = deriveSpaces(layout).spaces;
        const byKey = new Map();
        (layout.positions || []).forEach((p) => { const key = `${p.spaceId}|${p.n}|${p.c}`; if (!byKey.has(key)) byKey.set(key, []); byKey.get(key).push(p); });
        const fresh = new Map(); // espacio -> sus posiciones de fábrica (nuevas o al día)
        derived.forEach((s) => {
            if (s.off === true) return;
            for (let n = 1; n <= (s.levels || 1); n += 1) {
                for (let c = 1; c <= levelSlots(s, n); c += 1) {
                    const key = `${s.id}|${n}|${c}`;
                    const stored = byKey.get(key) || [];
                    if (!stored.length) { fresh.set(key, defaultPositions(s, n, c)); continue; }
                    if (stored.every((p) => p.auto === true)) {
                        const gen = defaultPositions(s, n, c);
                        const same = gen.length === stored.length && gen.every((g) => { const o = stored.find((p) => p.num === g.num); return o && o.x === g.x && o.y === g.y && o.l === g.l && o.w === g.w && o.h === g.h; });
                        if (gen.length === stored.length && !same) fresh.set(key, gen.map((g) => { const o = stored.find((p) => p.num === g.num); return canonPos({ ...g, ...(o && o.faces ? { faces: o.faces } : {}) }); }));
                    }
                }
            }
        });
        if (!fresh.size) return layout;
        const positions = (layout.positions || []).filter((p) => !fresh.has(`${p.spaceId}|${p.n}|${p.c}`));
        const counters = { ...(layout.posNext || {}) };
        fresh.forEach((list, key) => { positions.push(...list); counters[key] = Math.max(Number(counters[key]) || 0, ...list.map((p) => p.num)); });
        return { ...layout, positions, posNext: counters };
    }
    // Las posiciones de un espacio, por número; con ensurePositions, aunque el Layout todavía no las traiga guardadas.
    function positionsOfBay(layout, spaceId, n, c) {
        return (ensurePositions(layout).positions || []).filter((p) => p.spaceId === spaceId && p.n === Number(n) && p.c === Number(c)).sort((a, b) => a.num - b.num);
    }
    // Las posiciones de todos los espacios de un Layout que YA NO CAMBIA (los que lee el servidor), por «activo|nivel|columna» y ordenadas por número; se calcula una sola vez por Layout.
    const posIndexMemo = new WeakMap();
    function positionIndex(layout) {
        if (!layout || typeof layout !== 'object') return new Map();
        if (posIndexMemo.has(layout)) return posIndexMemo.get(layout);
        const index = new Map();
        (ensurePositions(layout).positions || []).forEach((p) => { const key = `${p.spaceId}|${p.n}|${p.c}`; if (!index.has(key)) index.set(key, []); index.get(key).push(p); });
        index.forEach((list) => list.sort((a, b) => a.num - b.num));
        posIndexMemo.set(layout, index);
        return index;
    }
    // La posición de hoy que era la celda (fila, profundidad) de un espacio en la forma de antes (las filas y profundidades que quedan guardadas en el hueco).
    function legacyPositionNum(space, level, column, row, depth) {
        const bay = bayOf(space, level, column);
        return (Math.max(1, Number(row) || 1) - 1) * Math.max(1, bay.depth) + Math.max(1, Number(depth) || 1);
    }

    // Las faltas de posiciones que hay en next y que antes no estaban igual: solo esas no se dejan guardar (lo que ya estaba así antes solo se marca).
    function newPositionViolations(next, previous) {
        const before = previous ? positionViolations(previous) : [];
        return positionViolations(next).filter((v) => !before.some((p) => p.id === v.id && p.kind === v.kind && p.sig === v.sig));
    }

    // Huecos guardados de un activo: [{ n: nivel, c: columna, rows?, depth?, l?, w?, h? }] (solo lo cambiado; lo demás es lo de por defecto). Se descartan los que ya no caben en sus niveles y columnas. La altura del piso y la ceja
    // son del NIVEL (paso Niveles): todos los espacios de un nivel salen a la misma altura, así que un hueco ya no las guarda (las que traían los Layouts de antes, de cuando se capturaban por espacio, se quitan al leerlos).
    function sanitizeBays(raw, levels, slots) {
        const out = new Map();
        (Array.isArray(raw) ? raw : []).forEach((b) => {
            const n = Math.round(Number(b && b.n));
            const c = Math.round(Number(b && b.c));
            if (!(n >= 1 && n <= levels && c >= 1 && c <= slots)) return;
            const bay = { n, c };
            const rows = Math.round(Number(b.rows));
            if (rows > 1) bay.rows = Math.min(rows, LIMITS.slots);
            const depth = Math.round(Number(b.depth));
            if (depth > 1) bay.depth = Math.min(depth, LIMITS.depth);
            ['l', 'w', 'h'].forEach((k) => {
                const v = Number(b[k]);
                if (Number.isFinite(v) && v > 0 && v <= LIMITS.maxM) bay[k] = Math.round(v * 1000) / 1000;
            });
            const bayFaces = sanitizeFaces(b.faces); // sus caras de consumo (solo si las cambió)
            if (bayFaces) bay.faces = bayFaces;
            if (Object.keys(bay).length > 2) out.set(`${n}|${c}`, bay);
        });
        return [...out.values()].sort((a, b) => a.n - b.n || a.c - b.c);
    }
    // Niveles guardados de un activo (paso Niveles): [{ n: nivel, floorH?, h?, beam?, name?, slots? }] (altura del piso, alto del espacio y ceja = grueso de la reja, el nombre que el usuario le puso al nivel y cuántas posiciones tiene). La altura
    // del piso solo se guarda en el nivel 1 (hasta dónde empieza la primera reja): la de los demás niveles se calcula sola. Solo se guarda lo que se cambió y vale para TODAS las posiciones de ese nivel; un hueco de Posiciones con medida propia
    // manda sobre el nivel. Se descartan los niveles que el activo ya no tiene.
    function sanitizeLevels(raw, levels) {
        const out = new Map();
        (Array.isArray(raw) ? raw : []).forEach((b) => {
            const n = Math.round(Number(b && b.n));
            if (!(n >= 1 && n <= levels)) return;
            const lv = { n };
            (n === 1 ? ['floorH', 'h', 'beam'] : ['h', 'beam']).forEach((k) => {
                const v = Number(b[k]);
                if (Number.isFinite(v) && v > 0 && v <= LIMITS.maxM) lv[k] = Math.round(v * 1000) / 1000;
            });
            // el nombre del nivel (opcional, para personalizar) y cuántas posiciones tiene (sin él vale la cantidad del activo)
            const name = typeof (b && b.name) === 'string' ? b.name.trim().slice(0, LIMITS.text) : '';
            if (name) lv.name = name;
            const slots = Math.round(Number(b && b.slots));
            if (Number.isFinite(slots) && slots >= 1) lv.slots = Math.min(slots, LIMITS.slots);
            const lvFaces = sanitizeFaces(b && b.faces); // sus caras de consumo (solo si las cambió)
            if (lvFaces) lv.faces = lvFaces;
            if (Object.keys(lv).length > 1) out.set(n, lv);
        });
        return [...out.values()].sort((a, b) => a.n - b.n);
    }
    // Lo guardado de un nivel del activo (paso Niveles) o {}.
    function levelOf(space, level) {
        return ((space && space.lvls) || []).find((l) => l.n === Number(level)) || {};
    }
    // Cuántas posiciones (columnas, de izquierda a derecha) tiene un nivel: las que se le pusieron en el paso Niveles o, si no trae las suyas, las del activo (slots).
    function levelSlots(space, level) {
        const own = Math.round(Number(levelOf(space, level).slots));
        if (Number.isFinite(own) && own >= 1) return Math.min(own, LIMITS.slots);
        const base = Math.round(Number(space && space.slots));
        return Number.isFinite(base) && base >= 1 ? Math.min(base, LIMITS.slots) : 1;
    }
    // La cantidad de posiciones de cada nivel del activo, de abajo hacia arriba: [n1, n2…].
    function slotsByLevelOf(space) {
        const levels = Math.max(1, Math.round(Number(space && space.levels)) || 1);
        return Array.from({ length: levels }, (_, i) => levelSlots(space, i + 1));
    }
    // El nivel con más posiciones del activo (hasta qué columna puede haber huecos).
    function maxSlots(space) { return Math.max(1, ...slotsByLevelOf(space)); }
    // Lo que muestra Niveles de un nivel (sin mirar los huecos). La altura del piso del nivel 1 es la que se escribe (0 si no); la de los demás es AUTOMÁTICA: la del nivel de abajo + su reja (ceja) + su alto (el espacio libre).
    // Lo que no se escribe sale del activo: cada nivel mide lo mismo (el alto del activo, sin lo que sube el nivel 1, entre sus niveles) con su reja adentro, así que el alto por omisión es eso menos la reja. useful = el Alto (la reja va
    // aparte: el alto de almacenamiento es el mismo alto). Todo en metros.
    function levelMeasures(space, level) {
        const n = Number(level);
        const levels = (space && space.levels) || 1;
        const round = (v) => Math.round(v * 1000) / 1000;
        const start = levelOf(space, 1).floorH !== undefined ? levelOf(space, 1).floorH : 0;
        const pitch = space && space.h > start ? (space.h - start) / levels : 0;
        const beamOf = (k) => { const q = levelOf(space, k); return q.beam !== undefined ? q.beam : 0; };
        const heightOf = (k) => { const q = levelOf(space, k); return q.h !== undefined ? q.h : Math.max(pitch - beamOf(k), 0); };
        let floorH = start;
        for (let k = 1; k < n; k += 1) floorH += beamOf(k) + heightOf(k);
        const h = round(heightOf(n));
        return { floorH: round(floorH), h, beam: beamOf(n), useful: h, stored: levelOf(space, n) };
    }
    // Cuántas filas y cuántas profundidades tiene el hueco (nivel × columna) de un activo: lo guardado o 1.
    function bayOf(space, level, column) {
        const stored = ((space && space.bays) || []).find((b) => b.n === Number(level) && b.c === Number(column)) || {};
        return { rows: stored.rows || 1, depth: stored.depth || 1, stored };
    }
    // Hasta dónde suben los niveles de un activo (m): lo más alto que llega un nivel (su altura del piso + su reja + su alto); también cuentan los huecos con altura del piso o alto propios. Si pasa del alto del activo, hay un aviso.
    function levelsTop(space) {
        const levels = (space && space.levels) || 1;
        let top = 0;
        for (let n = 1; n <= levels; n += 1) { const m = levelMeasures(space, n); top = Math.max(top, m.floorH + m.beam + m.h); }
        ((space && space.bays) || []).forEach((b) => {
            if (b.h === undefined) return;
            const m = bayMeasures(space, b.n, b.c);
            top = Math.max(top, m.floorH + m.beam + m.h);
        });
        return Math.round(top * 1000) / 1000;
    }
    // Aplicar a todos (paso Niveles): los niveles guardados del activo con el alto y la ceja del nivel dado repetidos en todos los demás niveles. Lo que queda igual a lo de por defecto (el alto repartido, que depende de la reja, o sin reja) no
    // se guarda aparte; la altura del piso del nivel 1 no se toca (los demás niveles la calculan sola) y los huecos con medida propia (Posiciones) siguen mandando.
    function levelsWithSame(space, level) {
        const n = Number(level);
        const levels = (space && space.levels) || 1;
        const src = levelMeasures(space, n);
        const start = levelOf(space, 1).floorH !== undefined ? levelOf(space, 1).floorH : 0;
        const pitch = space && space.h > start ? (space.h - start) / levels : 0;
        const defaultH = Math.round(Math.max(pitch - (src.beam > 0 ? src.beam : 0), 0) * 1000) / 1000;
        const out = [];
        for (let k = 1; k <= levels; k += 1) {
            const lv = { ...levelOf(space, k), n: k };
            if (k !== n) {
                if (Math.abs(src.h - defaultH) < 0.0005) delete lv.h; else lv.h = src.h;
                if (src.beam > 0) lv.beam = src.beam; else delete lv.beam;
            }
            if (Object.keys(lv).length > 1) out.push(lv);
        }
        return out;
    }
    // Lo que suman las columnas de un nivel (m): el largo propio de cada hueco o, si no lo trae, el largo del activo entre sus columnas. over = suman más que el largo del activo (solo con 2 o más columnas y cuando alguna trae su largo
    // propio: con 1 columna, su largo ya lo revisa el hueco solo, y sin largos propios la suma da justo el largo del activo).
    function levelLengthSum(space, level) {
        const slots = levelSlots(space, level);
        const len = Number(space && space.l) || 0;
        let sum = 0;
        let own = 0;
        for (let c = 1; c <= slots; c += 1) {
            const b = bayOf(space, level, c).stored;
            if (b.l !== undefined) { sum += b.l; own += 1; } else sum += len / slots;
        }
        return { sum: round2(sum), own, over: slots > 1 && own > 0 && len > 0 && sum > len + 0.005 };
    }
    // Lo que muestra Posiciones de un hueco: lo guardado en el hueco o, si no se cambió, lo de su nivel (paso Niveles: altura desde el piso, alto y ceja) y, si el nivel tampoco lo trae, lo que sale del activo (alto = alto del activo
    // entre sus niveles; altura desde el piso = los niveles de abajo; largo = su largo entre sus columnas; ancho = su fondo). Todo en metros.
    function bayMeasures(space, level, column) {
        const stored = bayOf(space, level, column).stored;
        const slots = levelSlots(space, level);
        const round = (v) => Math.round(v * 1000) / 1000;
        const lv = levelMeasures(space, level);
        const h = stored.h !== undefined ? stored.h : lv.h;
        // beam = la ceja: el grueso de la reja (el travesaño) del nivel, en metros; va aparte del alto (el espacio libre), así que el alto de almacenamiento (useful) es el mismo alto del hueco.
        // La altura del piso y la ceja son SIEMPRE las del nivel (todos los espacios de un nivel quedan a la misma altura, la ceja termina donde empieza el espacio): lo que un hueco guardó de antes se ignora.
        const beam = lv.beam;
        return {
            floorH: lv.floorH,
            l: stored.l !== undefined ? stored.l : round(((space && space.l) || 0) / slots),
            w: stored.w !== undefined ? stored.w : round((space && space.d) || 0),
            h,
            beam,
            useful: round(Math.max(h, 0)),
        };
    }

    function sectionData(layout, section) {
        if (!layout) return null;
        // Las paredes y los demás obstáculos (columnas, desniveles y otros) viven en la misma lista (layout.obstacles) pero cada uno tiene su propio paso: Contorno lleva solo el marco, Paredes las paredes y Obstáculos lo demás.
        if (section === 'contorno') return { vertices: layout.vertices, siteName: layout.siteName || '' };
        if (section === 'paredes') return (layout.obstacles || []).filter((o) => o.kind === 'wall');
        if (section === 'obstaculos') return (layout.obstacles || []).filter((o) => o.kind !== 'wall');
        if (section === 'puertas') return layout.doors;
        if (section === 'luz') return layout.power;
        // Siempre una lista (un Layout de antes sin sensores cuenta igual que uno sin ninguno); la zona sale de la pared y del croquis, no se captura.
        if (section === 'sensores') return (layout.sensors || []).map(({ zoneId, ...rest }) => rest);
        if (section === 'objetos') return layout.objects || [];
        // La zona de cada elemento sale de su lugar en el croquis, no se captura.
        // Los elementos (sin la zona, que sale del croquis) y los días de aviso de «Por vencer».
        if (section === 'seguridad') return { safety: (layout.safety || []).map(({ zoneId, ...rest }) => rest), warnDays: layout.safetyWarnDays || SAFETY_WARN_DAYS };
        // La zona de cada pasillo sale del croquis, no se captura; las medidas de lo que transita van con el paso.
        if (section === 'transito') return { transit: (layout.transit || []).map(({ zoneId, ...rest }) => rest) };
        if (section === 'zonas') return layout.zones;
        if (section === 'pisos') return layout.floors || [];
        if (section === 'rampas') return layout.ramps || [];
        // Los espacios sin lo del paso Activos (la clasificación y el tipo de activo, y sus niveles, espacios por nivel y cajones; todo eso tiene su propio permiso). En Activos, solo los espacios que ya tienen
        // algo de eso: así agregar un espacio nuevo en Huella-Espacio (con 1 nivel) no cuenta como cambio de Activos.
        if (section === 'espacios') return (layout.footprints || []).map(({ zoneId, ...rest }) => rest);
        // Un activo "de fábrica" (el primero de su huella y sin nada más: ni clasificación, tipo, niveles, columnas ni cajones) no cuenta como Activos: agregar una huella nueva en Huella-Espacio crea el suyo solo.
        if (section === 'activos') {
            const byId = new Map((layout.footprints || []).map((f) => [f.id, f]));
            const seen = new Set();
            return (layout.spaces || []).filter((s) => {
                const first = !seen.has(s.footprintId);
                seen.add(s.footprintId);
                const f = byId.get(s.footprintId);
                const plain = first && f && (s.type || 'rack') === 'rack' && !s.ownName && !s.faces && !s.front && !s.fmt && !s.assetClassId && !s.assetId && (s.levels || 1) === 1 && (s.slots || 1) === 1 && !s.drawers && !s.off && !OWN_SPACE_KEYS.some((k) => s[k] !== undefined);
                return !plain;
            }).map((s) => ({ id: s.id, footprintId: s.footprintId, code: s.code, ...(s.ownName ? { ownName: s.ownName } : {}), ...(s.faces ? { faces: s.faces } : {}), ...(s.front ? { front: s.front } : {}), type: s.type || 'rack', assetClassId: s.assetClassId || 0, assetId: s.assetId || 0, levels: s.levels || 1, slots: s.slots || 1, drawers: s.drawers || '', off: !!s.off, ...(s.fmt ? { fmt: s.fmt } : {}), ...['tempMin', 'tempMax', 'humMin', 'humMax', ...OWN_SPACE_KEYS].reduce((acc, k) => (s[k] !== undefined ? { ...acc, [k]: s[k] } : acc), {}) }));
        }
        if (section === 'ubicaciones') return layout.positions || [];
        // Posiciones: solo los activos que ya tienen algún hueco con datos propios (filas, profundidades o medidas distintas de las de por defecto).
        if (section === 'posiciones') return [...(layout.spaces || []).filter((s) => (s.bays || []).length).map((s) => ({ id: s.id, bays: s.bays })), ...(layout.bayFmt && Object.keys(layout.bayFmt).length ? [{ id: '_bayFmt', bayFmt: layout.bayFmt }] : [])];
        // Niveles: solo los activos que ya tienen algún nivel con medidas propias (altura desde el piso, alto o ceja distintos de los de por defecto).
        if (section === 'niveles') return (layout.spaces || []).filter((s) => (s.lvls || []).length).map((s) => ({ id: s.id, lvls: s.lvls }));
        return null;
    }
    function sectionHasData(layout, section) {
        // Activos cuenta como llenado cuando algún espacio ya tiene su clasificación o su tipo de activo (los niveles de antes no cuentan).
        if (section === 'activos') return (layout && layout.spaces || []).some((s) => s.assetClassId || s.assetId);
        const data = sectionData(layout, section);
        if (!data) return false;
        if (section === 'contorno') return (data.vertices || []).length > 0;
        if (section === 'transito') return (data.transit || []).length > 0;
        if (section === 'seguridad') return (data.safety || []).length > 0;
        return (data || []).length > 0;
    }

    return {
        sensorZoneIds,
        storageLocations, huellasThatFit, capacityOf,
        ZONE_TYPES, STORAGE_ZONE_TYPES, ZONE_USES, SPACE_TYPES, DOOR_TYPES, POWER_TYPES, SENSOR_TYPES, deriveSensorZones, assignSensorCodes, assignWallCodes, lockWallCodes, assignItemCodes, lockItemCodes, ITEM_CODES, sensorPoint, SECTIONS, LIMITS, wallSides, wallSideInfo, wallMark, ZONE_RISES, zoneHasLevel, zoneLevelAt, floorLevelAt, raisedVolume, polygonCentroid, floorsOf, floorsAll, rampsAsFloors, rampInfo, rampIssues, assignRampCodes, migrateRamps, floorLevelColors, floorFmtOf, mixHex, rampEndColors, floorOverlaps, floorViolations, newFloorViolations, floorsOfZone, zonesOfFloor, zoneAvgLevel, migrateFloors, assignFloorCodes, splitByRect, clipPolygonToRect, DOOR_OPENS, DOOR_ENDS, DOOR_SIDES, SLIDE_DEPTH, doorOpenOf, doorOpening, doorOpeningClashes, convexOverlap, sanitizeBays, bayOf, bayMeasures, levelLengthSum, sanitizeLevels, levelOf, levelMeasures, levelsTop, levelsWithSame,
        OBSTACLE_KINDS, OBSTACLE_MODES, WALL_THICKNESS, obstacleGeometry, obstacleShapes, obstacleViolations, newObstacleViolations, defaultWalls, netVolume, wallAxis, doorGeometry, migrateDoors, doorViolations, newDoorViolations, wallItemViolations, newWallItemViolations,
        levelSlots, slotsByLevelOf, maxSlots, FACES, FACE_NAMES_ES, sanitizeFaces, facesOfSpace, facesOfLevel, facesOfBay, facesOfPosition, faceVectors, positionCode, positionViolations, newPositionViolations, defaultPositions, ensurePositions, positionsOfBay, positionIndex, legacyPositionNum, activoFront, faceSide, TRANSIT_TYPES, TRANSIT_WHO, TRANSIT_SIZE_DEFAULTS, ZONE_TYPES_CHOOSABLE, transitSizesOf, deriveTransitZones, assignTransitCodes, lockTransitCodes, transitViolations, newTransitViolations, transitArea, transitProblemsOf, rectOverlapsConvex, OBJECT_TYPES, objectDefaultSize, objectPolygon, SAFETY_TYPES, SAFETY_COLORS, SAFETY_LETTER, SAFETY_SIZE_DEFAULTS, HYDRANT_MODELS, HYDRANT_SIZE_DEFAULTS, hydrantModelOf, safetySizeOf, naveHeightAt, deriveSafetyZones, assignSafetyCodes, lockSafetyCodes, safetyViolations, newSafetyViolations, SAFETY_WARN_DAYS, isIsoDate, addDaysIso, safetyNextOf, safetyStatus, safetyCounts, TRANSIT_KINDS, transitWhoInfo, transitCatalogOf, applyTransitCatalog, objectShapeOfKind, PERSON_COLORS, personColorsOf, EQUIP_COLORS, equipColorOf, growPolygonShapes,
        polygonArea, wallSegment, perimeter, emptyLayout, computeKpis, metricRows, METRIC_KEYS, sanitizeLayout, sectionData, sectionHasData, rotateLayout, migrateFootprints, assignHuellaCodes, assignZoneCodes, assignSpaceCodes, renumberSpaceCodes, lockHuellaCodes, lockCodes, ASSET_LETTER, rectInsidePolygon, footprintViolations, newFootprintViolations, footprintZoneChanges, spaceViolations, newSpaceViolations, obstacleInsideViolations, newObstacleInsideViolations, zoneOverlapViolations, newZoneOverlapViolations, polygonOverlapArea, objectInsideViolations, newObjectInsideViolations, outOfContainer, OUT_LEVELS, placeGroup, OWN_SPACE_KEYS, locatorRows, sameFmt, colorClashes, newColorClashes, FMT_HUELLA_DEFAULT, FMT_ASSET_DEFAULT, FILL_ZONE_DEFAULT, zoneOfPoint, deriveFootprintZones, deriveSpaces,
        normalize, heightRange, volumeOf, triangulate, zoneLabelSpot, HALO_STEPS, labelBox, placeZoneLabel, coveredArea,
        FMT_PATTERNS, FMT_LINES, CATEGORY_ICONS, CATEGORY_COLORS, categoryLook, sanitizeFmt, zonePoints, zoneArea, hasPoints, pointInPolygon, onPolygonEdge, BAY_COLORS, bayFmtOf, zoneOutsideNave, zoneViolations, newZoneViolations, zoneLabelAnchor, walkSides, pointsFromSides, sidesFromPoints, closingSides, closingLine, sideOf, sideMeasures, DIR_ANGLE,
    };
}));
