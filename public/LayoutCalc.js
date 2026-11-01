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
    const ZONE_TYPES = ['dry', 'cold', 'chemical', 'finished', 'dock', 'office', 'aisle'];
    // Zonas donde se almacena producto (las demás son andenes, oficinas o pasillos).
    const STORAGE_ZONE_TYPES = ['dry', 'cold', 'chemical', 'finished'];
    const SPACE_TYPES = ['rack', 'cabinet', 'pallet'];
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
    const LIMITS = { vertices: 60, doors: 100, power: 300, obstacles: 300, zones: 150, spaces: 5000, text: 80, maxM: 5000, maxHeight: 100 };

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

    function emptyLayout() {
        return {
            mode: 'scratch', heightM: 9,
            vertices: [[0, 0], [30, 0], [30, 20], [0, 20]],
            doors: [], power: [], obstacles: [], zones: [], spaces: [],
            plan: null,
        };
    }

    // Lo que se muestra arriba del Layout y se recalcula con cada cambio.
    //  totales = superficie de la nave; oficinas, pasillos y andenes = suma de las zonas de ese tipo; almacenamiento = huella
    //  (largo x fondo) de los anaqueles, gabetas y tarimas activos; muertos = lo que queda de la nave sin ninguno de esos usos.
    function computeKpis(layout) {
        const total = polygonArea(layout.vertices || []);
        const zones = (layout.zones || []).filter((z) => z.active !== false);
        const spaces = (layout.spaces || []).filter((s) => s.active !== false);
        const zoneArea = (z) => (z.l || 0) * (z.w || 0);
        const sumType = (type) => zones.filter((z) => z.type === type).reduce((acc, z) => acc + zoneArea(z), 0);
        const offices = sumType('office');
        const aisles = sumType('aisle');
        const docks = sumType('dock');
        const footprint = spaces.reduce((acc, s) => acc + (s.l || 0) * (s.d || 0), 0);
        const storageVolume = spaces.reduce((acc, s) => acc + (s.l || 0) * (s.d || 0) * (s.h || 0), 0);
        const dead = Math.max(0, total - offices - aisles - docks - footprint);
        const perZone = zones.map((z) => {
            const mine = spaces.filter((s) => s.zoneId === z.id);
            const zFootprint = mine.reduce((acc, s) => acc + (s.l || 0) * (s.d || 0), 0);
            const area = zoneArea(z);
            return {
                id: z.id, name: z.name, type: z.type, area: round2(area), spaces: mine.length,
                footprint: round2(zFootprint), occupancy: area ? round2((zFootprint / area) * 100) : 0,
                volume: round2(mine.reduce((acc, s) => acc + (s.l || 0) * (s.d || 0) * (s.h || 0), 0)),
            };
        });
        return {
            total: round2(total), offices: round2(offices), aisles: round2(aisles), docks: round2(docks),
            storage: round2(footprint), dead: round2(dead),
            volume: round2(total * (layout.heightM || 0)), storageVolume: round2(storageVolume),
            perimeter: round2(perimeter(layout.vertices || [])), zones: perZone,
        };
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
        out.heightM = meters(src.heightM, 'Altura libre', 0);
        if (!(out.heightM > 0)) errors.push('Altura libre: debe ser mayor que 0');

        out.vertices = list(src.vertices, LIMITS.vertices, 'Esquinas').map((p, i) => {
            if (!Array.isArray(p) || p.length !== 2 || !isNum(Number(p[0])) || !isNum(Number(p[1]))) { errors.push(`Esquina ${i + 1}: coordenadas no válidas`); return [0, 0]; }
            const x = Number(p[0]);
            const y = Number(p[1]);
            if (Math.abs(x) > LIMITS.maxM || Math.abs(y) > LIMITS.maxM) errors.push(`Esquina ${i + 1}: fuera de rango`);
            return [round2(x), round2(y)];
        });
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
            return {
                id: idOf(z && z.id, zoneIds, label), name: text(z && z.name, label, true), type: oneOf(z && z.type, ZONE_TYPES, 'dry'),
                x: meters(z && z.x, label, -LIMITS.maxM), y: meters(z && z.y, label, -LIMITS.maxM), l: meters(z && z.l, label), w: meters(z && z.w, label), active: !(z && z.active === false),
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
            return {
                id: idOf(s && s.id, spaceIds, label), type, code, zoneId,
                x: meters(s && s.x, label, -LIMITS.maxM), y: meters(s && s.y, label, -LIMITS.maxM), l: meters(s && s.l, label), d: meters(s && s.d, label), h: meters(s && s.h, label),
                levels: Number.isFinite(levels) && levels >= 1 && levels <= 50 ? levels : 1,
                drawers: text(s && s.drawers, label, false), active: !(s && s.active === false),
            };
        });

        const plan = src.plan && typeof src.plan === 'object' ? src.plan : null;
        out.plan = plan ? { widthM: meters(plan.widthM, 'Plano', 0.1) } : null;
        return { ok: errors.length === 0, errors, layout: out };
    }

    // Qué datos tiene cada sección (para saber si "Ver y Operar" todavía puede llenarla).
    function sectionData(layout, section) {
        if (!layout) return null;
        if (section === 'contorno') return { heightM: layout.heightM, vertices: layout.vertices, obstacles: layout.obstacles };
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
        ZONE_TYPES, STORAGE_ZONE_TYPES, SPACE_TYPES, DOOR_TYPES, POWER_TYPES, SECTIONS, LIMITS,
        polygonArea, wallSegment, perimeter, emptyLayout, computeKpis, sanitizeLayout, sectionData, sectionHasData,
    };
}));
