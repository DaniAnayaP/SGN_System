// ---------------------------------------------------------------------------
// Vista 3D del Layout (Operaciones, C. Distribución, y la página pública del QR). Levanta en 3D lo MISMO que se ve en el croquis: el contorno con la altura de cada esquina, las puertas y las
// conexiones de luz en sus paredes, las columnas, las zonas (con el color que se les puso) y los espacios (anaqueles, anaqueles con tarimas, gabinetes y tarimas) con sus medidas y niveles (la repisa de cada nivel a su altura desde el piso y con el grueso de su ceja).
// No inventa nada: no dibuja mercancía, solo la estructura capturada. En el editor se arma con el borrador que se está editando, así que lo que se cambia en el panel se ve en 3D al momento.
// Capas que se pueden mostrar u ocultar (setLayer): walls (paredes), doors (puertas), power (conexiones de luz), columns (columnas), zones (zonas) y assets (activos: anaqueles, anaqueles con
// tarimas, gabinetes y tarimas); los rótulos tienen su propio interruptor (setLabels).
// Necesita three.js (public/vendor/three/three.min.js, global THREE); las pantallas lo cargan solo la primera vez que se pide el 3D.
// Uso: const scene = LayoutScene3D.create(contenedor, { onSelect }); scene.update(layout, { labels: true, layers: { power: false } }); scene.setView('general'); scene.zoom(1.25); scene.destroy().
// ---------------------------------------------------------------------------
(function (root) {
    'use strict';

    const DEFAULT_ZONE_FILL = { dry: '#d9c7ef', cold: '#bfe0f5', chemical: '#f5d0cf', finished: '#d4efd0', dock: '#9cc3ea', office: '#a3ebcb', aisle: '#d5d8e2', aisle2: '#e6e8ef', none: '#e9e9ee' };
    const DOOR_COLOR = { dock: 0x2a6fd1, staff: 0x8a5a34, emergency: 0x2e9e5b };
    const SENSOR_COLOR = 0x2b8ca3;
    const POWER_COLOR = { panel: 0x6b6f7c, outlet110: 0xf1c232, outlet220: 0xe8892b, 'three-phase': 0xd93a2f };
    const WOOD = 0xb98a52;
    const MAX_SPACE_LABELS = 300;
    const MAX_POS_LABELS = 80; // con el paso Posiciones encendido, hasta cuántos rótulos P001… se dibujan en el 3D
    const LAYER_NAMES = ['contour', 'walls', 'doors', 'power', 'sensors', 'columns', 'zones', 'footprints', 'assets', 'objects', 'transit', 'safety'];
    // El color de cada elemento de Seguridad (los mismos del croquis: rojo del fuego, verde de emergencia, naranja de alarma, azul del agua).
    const SAFETY_COLOR = { extinguisher: 0xd9443a, hydrant: 0xd9443a, emergency_door: 0x2e9e5b, firstaid: 0x2e9e5b, alarm: 0xe8892b, eyewash: 0x2f7fc7, assembly: 0x2e9e5b, route: 0x2e9e5b };

    function wallSegment(vertices, wall) {
        const n = vertices.length;
        const p = vertices[(wall - 1) % n];
        const q = vertices[wall % n];
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const length = Math.sqrt(dx * dx + dy * dy);
        return { p, q, length, ux: length ? dx / length : 0, uy: length ? dy / length : 0 };
    }

    function create(container, options) {
        const THREE = root.THREE;
        if (!THREE) throw new Error('three.js no está cargado');
        options = options || {};
        const canvas = document.createElement('canvas');
        canvas.className = 'layout-3d-canvas';
        container.appendChild(canvas);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.localClippingEnabled = true; // lo que lleva planos de corte (las paredes con zonas enfocadas) se recorta
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a93a8, 0.62));
        const sun = new THREE.DirectionalLight(0xffffff, 0.5);
        scene.add(sun);
        // Un grupo por capa: así cada una se muestra u oculta sola.
        const group = {};
        ['floor', 'contour', 'walls', 'doors', 'power', 'sensors', 'columns', 'zones', 'footprints', 'assets', 'objects', 'transit', 'safety', 'zoneLabels', 'spaceLabels', 'sensorLabels'].forEach((name) => { group[name] = new THREE.Group(); scene.add(group[name]); });
        // Con zonas enfocadas y el resto «tenue», lo que no es de lo enfocado se apaga pieza por pieza: lo que se agrega a estas capas mientras se arma un elemento (fxItem) lleva su tipo y su id (userData.fx).
        let fxItem = null;
        ['walls', 'doors', 'power', 'sensors', 'columns', 'transit', 'safety', 'objects'].forEach((n) => {
            const g = group[n];
            const add = g.add.bind(g);
            g.add = (...objs) => { if (fxItem) objs.forEach((o) => { if (o && o.userData) o.userData.fx = fxItem; }); return add(...objs); };
        });
        const ITEM_OF_LAYER = { walls: 'wall', columns: 'obstacle', doors: 'door', power: 'power', sensors: 'sensor', transit: 'transit', safety: 'safety', objects: 'object' };
        const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xff7a1a }));
        outline.visible = false;
        scene.add(outline);
        // Lo elegido en las tablas del editor (highlight): el mismo contorno naranja, siempre a la vista aunque otro activo lo tape; el fuerte lleva un segundo contorno más ancho.
        // Un par de contornos (el fino y el fuerte) por cada cosa resaltada: la lista crece según hace falta.
        const hlPool = [];
        function hlPair(k) {
            while (hlPool.length <= k) {
                hlPool.push([0, 1].map(() => {
                    const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xff7a1a, depthTest: false, transparent: true }));
                    l.visible = false;
                    l.renderOrder = 10;
                    scene.add(l);
                    return l;
                }));
            }
            return hlPool[k];
        }

        // La cara de consumo de lo elegido (activo, nivel, espacio o posición): con lo demás oculto no se ve el pasillo, así que el lado por donde se consume se marca con un marco punteado y una flecha hacia afuera.
        let frontSides = {};
        // las posiciones de un espacio (nivel × espacio) de un activo, por número; las del editor traen spaceId y las de la página pública, s
        const posOf = (sid, n, c) => ((lastLayout && lastLayout.positions) || []).filter((p) => (p.spaceId || p.s) === sid && p.n === n && p.c === c).sort((a, z) => (a.num || 0) - (z.num || 0));
        const faceGroup = new THREE.Group();
        scene.add(faceGroup);
        function clearFaceMarks() {
            while (faceGroup.children.length) {
                const c = faceGroup.children[0];
                faceGroup.remove(c);
                if (c.geometry) c.geometry.dispose();
                if (c.material) c.material.dispose();
            }
        }
        function applyFaceMarks(box) {
            const LCf = root.LayoutCalc;
            if (!box || !hl || !lastLayout || !LCf || !LCf.faceVectors || !(hl.kind === 'space' || hl.kind === 'bay')) return;
            const sp = (lastLayout.spaces || []).find((e) => e.id === hl.id);
            if (!sp) return;
            const n = Number(hl.n) || 0;
            const c = hl.kind === 'bay' ? Number(hl.c) || 0 : 0;
            let faces = LCf.facesOfSpace(sp);
            if (n) faces = LCf.facesOfLevel(sp, n);
            if (n && c) {
                faces = LCf.facesOfBay(sp, n, c);
                const pos = Number(hl.p) > 0 ? posOf(sp.id, n, c).find((q) => q.num === Number(hl.p)) : null;
                if (pos) faces = LCf.facesOfPosition(sp, pos);
            }
            const dirs = LCf.faceVectors(frontSides[sp.id] || (LCf.activoFront(lastLayout, sp) || {}).side);
            // una cara de consumo de una caja (x, y, z = su centro; sx, sy, sz = su tamaño): un marco punteado en el lado por donde se consume y una flecha hacia afuera
            const mark = (b2, list) => {
                const hx = b2.sx / 2; const hz = b2.sz / 2;
                const y0 = b2.y - b2.sy / 2; const y1 = b2.y + b2.sy / 2;
                const span = Math.max(Math.min(b2.sx, b2.sz), 0.2);
                const dash = clamp(span * 0.06, 0.03, 0.25);
                list.forEach((f) => {
                    const v = dirs[f];
                    if (!v) return;
                    const pts = v[0] !== 0
                        ? [[b2.x + v[0] * hx, y0, b2.z - hz], [b2.x + v[0] * hx, y0, b2.z + hz], [b2.x + v[0] * hx, y1, b2.z + hz], [b2.x + v[0] * hx, y1, b2.z - hz], [b2.x + v[0] * hx, y0, b2.z - hz]]
                        : [[b2.x - hx, y0, b2.z + v[1] * hz], [b2.x + hx, y0, b2.z + v[1] * hz], [b2.x + hx, y1, b2.z + v[1] * hz], [b2.x - hx, y1, b2.z + v[1] * hz], [b2.x - hx, y0, b2.z + v[1] * hz]];
                    const geo = new THREE.BufferGeometry().setFromPoints(pts.map((q) => new THREE.Vector3(q[0], q[1], q[2])));
                    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0x0b8f6a, dashSize: dash, gapSize: dash * 0.6, depthTest: false, transparent: true }));
                    line.computeLineDistances();
                    line.renderOrder = 11;
                    faceGroup.add(line);
                    const r = clamp(span * 0.14, 0.05, 0.3);
                    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2.2, 12), new THREE.MeshBasicMaterial({ color: 0x0b8f6a, depthTest: false, transparent: true }));
                    cone.position.set(b2.x + v[0] * (hx + r * 1.2), b2.y, b2.z + v[1] * (hz + r * 1.2));
                    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(v[0], 0, v[1]));
                    cone.renderOrder = 11;
                    faceGroup.add(cone);
                });
            };
            mark(box, faces);
            // el nivel entero (página pública): los espacios y las posiciones que se consumen distinto que lo que los contiene llevan su propia marca
            if (hl.all && n && !c) {
                const same = (a, z) => JSON.stringify(a || []) === JSON.stringify(z || []);
                const slots = Math.max(1, LCf.levelSlots(sp, n));
                const slotW = sp.l / slots;
                const left = box.x - box.sx / 2;
                const lvFaces = LCf.facesOfLevel(sp, n);
                for (let k = 1; k <= slots; k += 1) {
                    const bayF = LCf.facesOfBay(sp, n, k);
                    if (!same(bayF, lvFaces)) mark({ x: left + (k - 0.5) * slotW, y: box.y, z: box.z, sx: slotW, sy: box.sy, sz: box.sz }, bayF);
                    const bm = LCf.bayMeasures(sp, n, k);
                    const kx = slotW / Math.max(bm.l, 0.01);
                    const kz = sp.d / Math.max(bm.w, 0.01);
                    posOf(sp.id, n, k).forEach((p) => {
                        if (!(Array.isArray(p.faces) && p.faces.length) || same(p.faces, bayF)) return;
                        const ph = Math.min(p.h, box.sy);
                        mark({ x: left + (k - 1) * slotW + (p.x + p.l / 2) * kx, y: box.y - box.sy / 2 + ph / 2, z: box.z - box.sz / 2 + (p.y + p.w / 2) * kz, sx: p.l * kx, sy: ph, sz: p.w * kz }, p.faces);
                    });
                }
            }
        }

        // Las zonas que mide el sensor elegido (paso Sensores): un tinte MUY tenue sobre su piso, con el borde; se arma al resaltar el sensor (ver applyMeasured).
        const measuredGroup = new THREE.Group();
        scene.add(measuredGroup);

        const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
        const st = { theta: 0.8, phi: 0.95, r: 40, tx: 0, ty: 1, tz: 0 };
        let bounds = { diag: 40, maxH: 9, sx: 30, sy: 30 };
        let dirty = true;
        let anim = 0;
        let destroyed = false;
        let placed = false;
        let labelsOn = options.labels !== false;
        const layerOn = {};
        LAYER_NAMES.forEach((n) => { layerOn[n] = !(options.layers && options.layers[n] === false); });
        let hitSpaces = null;
        let spaceList = [];
        let zoneMeshes = [];
        let fpMeshes = []; // las losas de las huellas (se pueden tocar)
        let contourHits = []; // las zonas de toque (invisibles) de los lados o las esquinas del contorno: solo las pide el editor con el paso Contorno
        let contourPickMode = null; // 'sides' | 'corners' | null
        let hiddenAssets = new Set(); // ids de los espacios que NO se dibujan (los eligió quien ve el 3D)
        let lastLayout = null;
        let center = null; // el centro de la nave en el plano (el origen del 3D), para ubicar lo resaltado
        // Con el resto de la nave «tenue» (buscar una zona o una huella): ids de lo enfocado { zones, footprints, spaces } (Set); lo demás se dibuja apagado, sin rótulo ni aristas. null = todo normal.
        let focusSet = null;
        // Apertura de puertas: si se ve (openingsOn), cada puerta que abre dibuja su espacio; las puertas cuyo espacio choca con algo (clashSet) van en rojo.
        let openingsOn = false;
        let clashSet = new Set();
        // Zonas a desnivel: con levelsOn el nivel de cada zona se escribe junto a su nombre.
        let levelsOn = true;
        // Zonas en gris neutro (paso Pisos sin el chip Zonas): no llevan su color y lo que cae sobre un piso lleva el tinte del piso.
        let neutralZones = false;
        // Qué losas de nivel se dibujan: los pisos con el paso Pisos (o Zonas) y las rampas con el paso Rampas (o Zonas), igual que el croquis; sin decir nada (la página pública) se ven los dos.
        let floorsShow = true;
        let rampsShow = true;
        // «Elegir activos» con el resto «tenue»: los activos que no se eligieron se dibujan apagados en lugar de quitarse.
        let dimHidden = false;
        // Con un enfoque y el resto «tenue», las capas apagadas (sus nombres) se ven tenues en lugar de quitarse.
        let dimLayers = new Set();
        // El nivel enfocado de un activo { id, n, mode: 'dim' | 'hide' }: los demás niveles de ese activo se apagan o se quitan.
        let bayFmtOn = null; // con el paso Espacios encendido: { 'número de espacio': formato propio } (los demás llevan el de fábrica de su número); null = los espacios no llevan color propio
        let pieceMap = new Map(); // las piezas que caben en cada posición (Relación Código): 'activo|nivel|espacio|posición' -> { level, cells (una capa, cm), layers, layerHeight, box }
        let posOn = false; // con el paso Posiciones encendido: cada posición de los anaqueles se dibuja en su lugar (caja con borde y su P001…)
        let focusLevels = []; // los niveles (o espacios o posiciones) que el Enfoque deja dibujados: [{ id, n, c, p, mode, all }]
        let focusContainer = null; // el cuadro (nivel o posición) que el Enfoque dejó dibujado: a él se acerca la cámara (con varios, el cuadro que los junta)
        // El cuadro que cubre a dos cuadros {x, y, z, sx, sy, sz} (centro y medidas); sin el primero, el segundo.
        function mergeBox(a, b2) {
            if (!a) return b2;
            const x0 = Math.min(a.x - a.sx / 2, b2.x - b2.sx / 2); const x1 = Math.max(a.x + a.sx / 2, b2.x + b2.sx / 2);
            const y0 = Math.min(a.y - a.sy / 2, b2.y - b2.sy / 2); const y1 = Math.max(a.y + a.sy / 2, b2.y + b2.sy / 2);
            const z0 = Math.min(a.z - a.sz / 2, b2.z - b2.sz / 2); const z1 = Math.max(a.z + a.sz / 2, b2.z + b2.sz / 2);
            return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0 };
        }
        function addFocusContainer(b2) { focusContainer = mergeBox(focusContainer, b2); }
        let hls = []; // todo lo resaltado (puede ser más de una cosa); hl es la primera
        let hl = null; // lo resaltado: { kind: 'zone' | 'floor' | 'footprint' | 'space' | 'bay', id, strong }
        const textureCache = new Map();

        const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
        const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
        // Un color (0xRRGGBB) mezclado con otro: k = cuánto del otro (0 = el mismo, 1 = el otro). Sirve para ver «tenue» lo que no se enfocó.
        const mixHex = (c, to, k) => { const r = (c >> 16) & 255; const g = (c >> 8) & 255; const b = c & 255; const R = (to >> 16) & 255; const G = (to >> 8) & 255; const B = to & 255; return (Math.round(r + (R - r) * k) << 16) | (Math.round(g + (G - g) * k) << 8) | Math.round(b + (B - b) * k); };

        // Opacidad de las capas tenues: cada material guarda su opacidad de origen para poder volver a ella.
        function applyLayerDim() {
            const setDim = (root3, dim) => root3.traverse((o) => {
                const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
                ms.forEach((m) => {
                    if (!m.userData) m.userData = {};
                    if (m.userData.op0 === undefined) m.userData.op0 = [m.opacity, m.transparent];
                    m.transparent = dim ? true : m.userData.op0[1];
                    m.opacity = dim ? m.userData.op0[0] * 0.25 : m.userData.op0[0];
                    m.needsUpdate = true;
                });
            });
            LAYER_NAMES.forEach((n) => {
                const g = group[n];
                if (!g) return;
                const layerDim = dimLayers.has(n) && !layerOn[n];
                const ty = ITEM_OF_LAYER[n];
                // zonas enfocadas con el resto «tenue» (focusSet.items): lo que no está dentro de las zonas se apaga, pieza por pieza
                if (ty && focusSet && focusSet.items) {
                    g.children.forEach((ch) => {
                        const fx = ch.userData && ch.userData.fx;
                        const out = !!fx && !(focusSet.items[fx.type] && focusSet.items[fx.type].has(fx.id));
                        setDim(ch, layerDim || out);
                    });
                    return;
                }
                setDim(g, layerDim);
            });
        }

        function applyVisibility() {
            group.contour.visible = layerOn.contour;
            group.walls.visible = layerOn.walls;
            group.doors.visible = layerOn.doors;
            group.power.visible = layerOn.power;
            group.sensors.visible = layerOn.sensors;
            group.sensorLabels.visible = labelsOn && layerOn.sensors;
            group.columns.visible = layerOn.columns;
            group.zones.visible = layerOn.zones;
            group.footprints.visible = layerOn.footprints;
            group.assets.visible = layerOn.assets;
            group.objects.visible = layerOn.objects;
            group.transit.visible = layerOn.transit;
            group.safety.visible = layerOn.safety;
            group.zoneLabels.visible = labelsOn && layerOn.zones;
            group.spaceLabels.visible = labelsOn && layerOn.assets;
            // las capas apagadas que van «tenues» se ven con poca opacidad (el resto de la nave cuando hay un enfoque)
            LAYER_NAMES.forEach((n) => { if (group[n] && dimLayers.has(n) && !layerOn[n]) group[n].visible = true; });
            applyLayerDim();
            if (!layerOn.assets && !layerOn.zones) outline.visible = false;
            applyHl();
            dirty = true;
        }

        // El cuadro (en el 3D) de lo que se eligió en una tabla. Una capa apagada no se marca, igual que no se puede tocar.
        function hlBox() {
            if (!hl || !center || !lastLayout) return null;
            const PX = (x) => x - center.x;
            const PZ = (y) => y - center.y;
            if (hl.kind === 'zone') {
                const z = (lastLayout.zones || []).find((e) => e.id === hl.id);
                if (!z || !layerOn.zones) return null;
                const pts = Array.isArray(z.pts) && z.pts.length >= 3 ? z.pts : [[z.x, z.y], [z.x + z.l, z.y], [z.x + z.l, z.y + z.w], [z.x, z.y + z.w]];
                const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
                const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
                const zl = root.LayoutCalc && root.LayoutCalc.floorLevelAt ? root.LayoutCalc.floorLevelAt(lastLayout, (x0 + x1) / 2, (y0 + y1) / 2) : 0;
                return { x: PX((x0 + x1) / 2), y: 0.1 + zl, z: PZ((y0 + y1) / 2), sx: x1 - x0, sy: 0.2, sz: y1 - y0 };
            }
            if (hl.kind === 'floor') {
                const f = (root.LayoutCalc && root.LayoutCalc.floorsAll ? root.LayoutCalc.floorsAll(lastLayout) : (lastLayout.floors || [])).find((e) => e.id === hl.id);
                if (!f || f.active === false || !(f.l > 0) || !(f.w > 0) || !layerOn.zones) return null;
                const lo = Number(f.lvl) || 0;
                const hi = f.lvl2 !== undefined ? Number(f.lvl2) || 0 : lo;
                const bottom = Math.min(lo, hi, 0);
                const hh = Math.max(Math.max(lo, hi, 0) - bottom, 0.2);
                return { x: PX(f.x + f.l / 2), y: bottom + hh / 2, z: PZ(f.y + f.w / 2), sx: f.l, sy: hh, sz: f.w };
            }
            if (hl.kind === 'footprint') {
                const f = (lastLayout.footprints || []).find((e) => e.id === hl.id);
                if (!f || f.active === false || !(f.l > 0) || !(f.d > 0) || !(layerOn.footprints || layerOn.assets)) return null;
                const mates = (lastLayout.spaces || []).filter((s) => s.footprintId === f.id && s.active !== false && s.h > 0 && !hiddenAssets.has(s.id));
                const h = layerOn.assets && mates.length ? Math.max(...mates.map((s) => s.h)) : 0.2;
                const fz = root.LayoutCalc && root.LayoutCalc.floorLevelAt ? root.LayoutCalc.floorLevelAt(lastLayout, f.x + f.l / 2, f.y + f.d / 2) : 0;
                return { x: PX(f.x + f.l / 2), y: h / 2 + fz, z: PZ(f.y + f.d / 2), sx: f.l, sy: h, sz: f.d };
            }
            // un lado (o una esquina) del contorno elegido en la tabla de Contorno: el tramo de pared de esa esquina a la siguiente, con la altura de sus esquinas
            if (hl.kind === 'side' || hl.kind === 'corner') {
                const vs = lastLayout.vertices || [];
                const i = Number(hl.id);
                const p = vs[i];
                if (!layerOn.contour || !p) return null;
                if (hl.kind === 'corner') {
                    const hc = Math.max(Number(p[2]) || 0, 0.5);
                    return { x: PX(p[0]), y: hc / 2, z: PZ(p[1]), sx: 0.5, sy: hc, sz: 0.5 };
                }
                const q = vs[(i + 1) % vs.length];
                const hs = Math.max(((Number(p[2]) || 0) + (Number(q[2]) || 0)) / 2, 0.5);
                return { x: PX((p[0] + q[0]) / 2), y: hs / 2, z: PZ((p[1] + q[1]) / 2), sx: Math.max(Math.abs(q[0] - p[0]), 0.3), sy: hs, sz: Math.max(Math.abs(q[1] - p[1]), 0.3) };
            }
            // una pared, columna o desnivel elegido en las tablas de Paredes o Contorno
            if (hl.kind === 'obstacle') {
                const shapes = root.LayoutCalc && root.LayoutCalc.obstacleShapes ? root.LayoutCalc.obstacleShapes(lastLayout) : [];
                const hit = shapes.find(({ o }) => o.id === hl.id);
                if (!hit || !(hit.o.kind === 'wall' ? layerOn.walls : layerOn.columns)) return null;
                const xs = hit.g.pts.map((p) => p[0]); const ys = hit.g.pts.map((p) => p[1]);
                const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
                let hh = hit.o.kind === 'step' ? Math.max(Math.abs(Number(hit.o.dz) || 0), 0.12) : Math.max(bounds.maxH, 1);
                // un obstáculo con altura propia: la caja va de su altura del piso a su alto
                let hy0 = 0;
                if (hit.o.kind !== 'step' && hit.o.kind !== 'wall' && (Number(hit.o.elev) > 0 || Number(hit.o.h) > 0)) {
                    const lvl = root.LayoutCalc.floorLevelAt ? root.LayoutCalc.floorLevelAt(lastLayout, (x0 + x1) / 2, (y0 + y1) / 2) : 0;
                    hy0 = lvl + (Number(hit.o.elev) > 0 ? Number(hit.o.elev) : 0);
                    hh = Number(hit.o.h) > 0 ? Number(hit.o.h) : Math.max(Math.max(bounds.maxH, 1) - hy0, 0.1);
                }
                return { x: PX((x0 + x1) / 2), y: hy0 + hh / 2, z: PZ((y0 + y1) / 2), sx: Math.max(x1 - x0, 0.1), sy: hh, sz: Math.max(y1 - y0, 0.1) };
            }
            // una puerta o una conexión de luz elegida en las tablas de Puertas o Luz: pegada a su pared (los sensores no se dibujan en el 3D)
            if (hl.kind === 'door' || hl.kind === 'power') {
                const isDoor = hl.kind === 'door';
                const e = ((isDoor ? lastLayout.doors : lastLayout.power) || []).find((x) => x.id === hl.id);
                if (!e || !(isDoor ? layerOn.doors : layerOn.power)) return null;
                // lo que va sobre una pared (puerta o conexión de luz): por el centro de la pared
                const dg = root.LayoutCalc && root.LayoutCalc.doorGeometry ? root.LayoutCalc.doorGeometry(lastLayout, isDoor ? e : { ...e, width: 0 }) : null;
                if (!dg) return null;
                const w = isDoor ? Math.max(0.3, Number(e.width) || 1) : 0.28;
                const h = isDoor ? Math.max(0.5, Number(e.height) || 2.1) : 0.28;
                const thick = Math.max(isDoor ? 0.2 : 0.16, dg.thick + 0.04);
                return { x: PX((dg.a.x + dg.b.x) / 2), y: (dg.base || 0) + (isDoor ? h / 2 : Math.max(0.2, Number(e.height) || 0.4)), z: PZ((dg.a.y + dg.b.y) / 2), sx: Math.abs(dg.ux) * w + Math.abs(dg.uy) * thick, sy: h, sz: Math.abs(dg.uy) * w + Math.abs(dg.ux) * thick };
            }
            // un sensor elegido en la tabla de Sensores: un cubo alrededor del disco, pegado a su pared
            if (hl.kind === 'sensor') {
                const e = (lastLayout.sensors || []).find((x) => x.id === hl.id);
                if (!e || !layerOn.sensors) return null;
                const sg = root.LayoutCalc && root.LayoutCalc.doorGeometry ? root.LayoutCalc.doorGeometry(lastLayout, { ...e, width: 0 }) : null;
                if (!sg) return null;
                return { x: PX(sg.a.x), y: (sg.base || 0) + Math.max(0.2, Number(e.height) || 1.5), z: PZ(sg.a.y), sx: 0.6, sy: 0.6, sz: 0.6 };
            }
            // un elemento de seguridad, un pasillo o un objeto elegido en las tablas de Seguridad, Tránsito u Objetos
            if (hl.kind === 'safety') {
                const e = (lastLayout.safety || []).find((x) => x.id === hl.id);
                if (!e || !layerOn.safety) return null;
                const ex = Number(e.x) || 0; const ey = Number(e.y) || 0;
                if (e.type === 'route') {
                    const x2 = Number(e.x2) || 0; const y2 = Number(e.y2) || 0;
                    return { x: PX((ex + x2) / 2), y: 0.2, z: PZ((ey + y2) / 2), sx: Math.abs(x2 - ex) + 0.8, sy: 0.4, sz: Math.abs(y2 - ey) + 0.8 };
                }
                // la altura al piso y el tamaño del elemento (los capturados o los de fábrica de su tipo); lo que va en la pared puede mirar hacia cualquier lado, así que el cuadro es cuadrado por el lado más largo
                const sz = root.LayoutCalc && root.LayoutCalc.safetySizeOf ? root.LayoutCalc.safetySizeOf(e) : null;
                if (!sz) return null;
                const W = Math.max(sz.l, sz.w, 0.2) + 0.2;
                const H = sz.h + (e.type === 'emergency_door' ? 0.35 : 0);
                return { x: PX(ex), y: 0.08 + sz.elev + H / 2, z: PZ(ey), sx: W, sy: H, sz: W };
            }
            if (hl.kind === 'transit') {
                const p = (lastLayout.transit || []).find((x) => x.id === hl.id);
                if (!p || !layerOn.transit || !(p.l > 0) || !(p.w > 0)) return null;
                return { x: PX(p.x + p.l / 2), y: 0.1, z: PZ(p.y + p.w / 2), sx: p.l, sy: 0.2, sz: p.w };
            }
            if (hl.kind === 'object') {
                const o = (lastLayout.objects || []).find((x) => x.id === hl.id);
                if (!o || !layerOn.objects) return null;
                const l = Math.max(Number(o.l) || 0.3, 0.1); const w = Math.max(Number(o.w) || 0.3, 0.1); const h = Math.max(Number(o.h) || 1, 0.2);
                const ang = ((Number(o.angle) || 0) * Math.PI) / 180;
                const ext = o.type === 'forklift' ? l * 1.2 : l;
                return { x: PX(Number(o.x) || 0), y: h / 2 + 0.08, z: PZ(Number(o.y) || 0), sx: Math.abs(Math.cos(ang)) * ext + Math.abs(Math.sin(ang)) * w, sy: h, sz: Math.abs(Math.sin(ang)) * ext + Math.abs(Math.cos(ang)) * w };
            }
            const s = (lastLayout.spaces || []).find((e) => e.id === hl.id);
            if (!s || s.active === false || !(s.l > 0) || !(s.d > 0) || !(s.h > 0) || hiddenAssets.has(s.id) || !layerOn.assets) return null;
            const LCx = root.LayoutCalc;
            if ((hl.kind === 'bay' || (hl.kind === 'space' && hl.n)) && LCx && LCx.levelMeasures && LCx.bayMeasures) {
                const n = Math.min(Math.max(1, Number(hl.n) || 1), Math.max(1, s.levels || 1));
                const slots = LCx.levelSlots ? LCx.levelSlots(s, n) : Math.max(1, Math.floor(s.slots || 1)); // las posiciones de ESE nivel
                const c = hl.kind === 'bay' ? Math.min(Math.max(1, Number(hl.c) || 1), slots) : 0;
                const m = c ? LCx.bayMeasures(s, n, c) : LCx.levelMeasures(s, n);
                const bottom = Math.max(m.floorH + m.beam, 0);
                const height = Math.max(m.h, 0.1);
                const rcb = c && LCx.levelBayRects ? LCx.levelBayRects(s, n)[c - 1] : null; // el espacio donde cae de verdad (su largo y su fondo propios)
                let len = rcb ? rcb.l : (c ? s.l / slots : s.l);
                let x0 = rcb ? s.x + rcb.x : (c ? s.x + (c - 1) * (s.l / slots) : s.x);
                let z0 = rcb ? s.y + rcb.y : s.y; let dep = rcb ? rcb.w : s.d;
                // un localizador es una posición del espacio: ocupa su lugar y sus medidas dentro del espacio (x de izquierda a derecha, y desde el fondo hacia el frente)
                let posAlto = 0;
                if (c && Number(hl.p) > 0 && lastLayout) {
                    const pp = posOf(s.id, n, c).find((q) => q.num === Number(hl.p));
                    if (pp) {
                        const sxP = len / Math.max(m.l, 0.01); const szP = dep / Math.max(m.w, 0.01);
                        x0 += pp.x * sxP; len = pp.l * sxP;
                        z0 += pp.y * szP; dep = pp.w * szP;
                        posAlto = Math.min(pp.h, m.h);
                    }
                }
                const fz = LCx.floorLevelAt ? LCx.floorLevelAt(lastLayout, s.x + s.l / 2, s.y + s.d / 2) : 0;
                const hBox = posAlto > 0 ? Math.max(posAlto, 0.1) : height;
                return { x: PX(x0 + len / 2), y: bottom + hBox / 2 + fz, z: PZ(z0 + dep / 2), sx: len, sy: hBox, sz: dep };
            }
            const sz0 = root.LayoutCalc && root.LayoutCalc.floorLevelAt ? root.LayoutCalc.floorLevelAt(lastLayout, s.x + s.l / 2, s.y + s.d / 2) : 0;
            return { x: PX(s.x + s.l / 2), y: s.h / 2 + sz0, z: PZ(s.y + s.d / 2), sx: s.l, sy: s.h, sz: s.d };
        }
        // Al elegir un sensor: sobre el piso de cada zona que mide (las que se eligieron en su renglón o, sin elegir ninguna, la zona donde está colocado) un tinte azul verdoso muy suave y su borde. Se quita al elegir otra cosa.
        function applyMeasured() {
            while (measuredGroup.children.length) {
                const c = measuredGroup.children[0];
                measuredGroup.remove(c);
                if (c.geometry) c.geometry.dispose();
                if (c.material) c.material.dispose();
            }
            if (!hl || hl.kind !== 'sensor' || !center || !lastLayout || !root.LayoutCalc || !root.LayoutCalc.sensorZoneIds) return;
            const sensor = (lastLayout.sensors || []).find((x) => x.id === hl.id);
            if (!sensor) return;
            const ids = new Set(root.LayoutCalc.sensorZoneIds(sensor));
            (lastLayout.zones || []).forEach((z, i) => {
                if (!ids.has(z.id) || z.active === false) return;
                const pts = Array.isArray(z.pts) && z.pts.length >= 3 ? z.pts : [[z.x, z.y], [z.x + z.l, z.y], [z.x + z.l, z.y + z.w], [z.x, z.y + z.w]];
                if (pts.length < 3) return;
                const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
                const level = root.LayoutCalc.floorLevelAt ? root.LayoutCalc.floorLevelAt(lastLayout, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2) : 0;
                const y = 0.075 + 0.004 * i + level;
                let flat;
                try {
                    flat = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0] - center.x, -(p[1] - center.y))))), new THREE.MeshBasicMaterial({ color: 0x2b8ca3, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
                } catch (err) { return; }
                flat.rotation.x = -Math.PI / 2;
                flat.position.y = y;
                flat.renderOrder = 2;
                measuredGroup.add(flat);
                measuredGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p[0] - center.x, y + 0.005, p[1] - center.y))), new THREE.LineBasicMaterial({ color: 0x2b8ca3, transparent: true, opacity: 0.55 })));
            });
        }
        function applyHl() {
            applyMeasured();
            clearFaceMarks();
            // cada cosa resaltada (hls) tiene su cuadro; hl es la que se está calculando (la primera para lo demás)
            const first = hls[0] || null;
            const boxes = [];
            hls.forEach((e) => {
                hl = e;
                const bx = hlBox();
                if (bx) boxes.push({ e, bx });
            });
            hl = first;
            hlPool.forEach((pair) => pair.forEach((l) => { l.visible = false; }));
            boxes.forEach(({ e, bx }, k) => {
                // El contorno de un espacio o una posición (y de un nivel) va pegado a su medida: con la holgura de siempre (6 y 20 cm) una posición chica parecía salirse de su espacio.
                const tight = e.kind === 'bay' || (e.kind === 'space' && !!e.n);
                const minDim = Math.max(Math.min(bx.sx, bx.sy, bx.sz), 0.05);
                hlPair(k).forEach((l, i) => {
                    const grow = tight ? (i === 0 ? 0 : Math.min(0.2, minDim * 0.05)) : (i === 0 ? 0.06 : 0.2);
                    l.visible = i === 0 || !!e.strong;
                    l.position.set(bx.x, bx.y, bx.z);
                    l.scale.set(bx.sx + grow, bx.sy + grow, bx.sz + grow);
                });
                hl = e;
                applyFaceMarks(bx);
            });
            hl = first;
            dirty = true;
        }

        function applyCam() {
            const sp = Math.sin(st.phi);
            cam.position.set(st.tx + st.r * sp * Math.sin(st.theta), st.ty + st.r * Math.cos(st.phi), st.tz + st.r * sp * Math.cos(st.theta));
            cam.lookAt(st.tx, st.ty, st.tz);
            sun.position.set(cam.position.x - 20, 60, cam.position.z + 20);
            dirty = true;
        }
        function viewTarget(name) {
            const d = bounds.diag;
            // la distancia se saca de lo que mide la nave y de la forma del cuadro, para que quepa completa (0.768 = 2 × tan de la mitad del ángulo de la cámara)
            const aspect = cam.aspect || 1.5;
            if (name === 'planta') return { theta: 0, phi: 0.03, r: 1.12 * Math.max(bounds.sy / 0.768, bounds.sx / (0.768 * aspect)), tx: 0, ty: 0, tz: 0 };
            if (name === 'frente') return { theta: 0, phi: 1.2, r: 1.15 * Math.max(bounds.sx / (0.768 * aspect), (bounds.maxH + bounds.sy * 0.35) / 0.768), tx: 0, ty: bounds.maxH / 3, tz: 0 };
            return { theta: 0.8, phi: 0.95, r: d * 1.0, tx: 0, ty: 1, tz: 0 };
        }
        function go(target, animate) {
            cancelAnimationFrame(anim);
            if (!animate) { Object.assign(st, target); applyCam(); return; }
            const from = Object.assign({}, st);
            const t0 = performance.now();
            const step = (now) => {
                const k = clamp((now - t0) / 600, 0, 1);
                const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
                Object.keys(target).forEach((p) => { st[p] = from[p] + (target[p] - from[p]) * e; });
                applyCam();
                if (k < 1 && !destroyed) anim = requestAnimationFrame(step);
            };
            anim = requestAnimationFrame(step);
        }

        // ---- rótulos: texto sobre una pastilla clara (se lee igual en tema claro y oscuro); las texturas se reutilizan
        function textTexture(text) {
            if (textureCache.has(text)) return textureCache.get(text);
            const fs = 54;
            const c = document.createElement('canvas');
            const g = c.getContext('2d');
            const font = `600 ${fs}px Poppins, system-ui, sans-serif`;
            g.font = font;
            c.width = Math.ceil(g.measureText(text).width) + 44;
            c.height = fs + 34;
            g.font = font;
            g.fillStyle = 'rgba(255,255,255,0.92)';
            g.beginPath();
            if (g.roundRect) g.roundRect(0, 0, c.width, c.height, 22); else g.rect(0, 0, c.width, c.height);
            g.fill();
            g.fillStyle = '#2b1630';
            g.textBaseline = 'middle';
            g.fillText(text, 22, c.height / 2 + 3);
            const tex = new THREE.CanvasTexture(c);
            tex.anisotropy = 4;
            const entry = { tex, ratio: c.width / c.height };
            textureCache.set(text, entry);
            return entry;
        }
        function addLabel(target, text, x, y, z, h, flat) {
            if (!text) return;
            const { tex, ratio } = textTexture(text);
            if (flat) {
                const m = new THREE.Mesh(new THREE.PlaneGeometry(h * ratio, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
                m.rotation.x = -Math.PI / 2;
                m.position.set(x, y, z);
                target.add(m);
                return;
            }
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
            s.scale.set(h * ratio, h, 1);
            s.position.set(x, y, z);
            s.renderOrder = 10;
            target.add(s);
        }

        function clearGroup(g) {
            while (g.children.length) {
                const o = g.children.pop();
                if (o.geometry) o.geometry.dispose();
                if (o.material && !o.material.map) o.material.dispose();
            }
        }

        function instanced(target, list, material) {
            if (!list.length) return null;
            const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, list.length);
            const dummy = new THREE.Object3D();
            const col = new THREE.Color();
            list.forEach((e, i) => {
                dummy.position.set(e.x, e.y, e.z);
                dummy.scale.set(e.sx, e.sy, e.sz);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
                mesh.setColorAt(i, col.setHex(e.c));
            });
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor.needsUpdate = true;
            target.add(mesh);
            return mesh;
        }

        // Textura de la trama de un piso (las mismas de Formato de zona: rayas, puntos, cuadrícula…): fondo del color del piso y la trama en el suyo; se arma una vez por combinación y se reutiliza.
        const patTex = new Map();
        function patternTexture(fill, pattern, pcolor) {
            const key = `${pattern}|${fill}|${pcolor}`;
            if (patTex.has(key)) return patTex.get(key);
            const cv = document.createElement('canvas');
            cv.width = 64; cv.height = 64;
            const g = cv.getContext('2d');
            g.fillStyle = fill; g.fillRect(0, 0, 64, 64);
            g.strokeStyle = pcolor; g.fillStyle = pcolor;
            const diag = (dir, w) => { g.lineWidth = w; for (let k = -64; k <= 128; k += 16) { g.beginPath(); if (dir > 0) { g.moveTo(k, 0); g.lineTo(k + 64, 64); } else { g.moveTo(k + 64, 0); g.lineTo(k, 64); } g.stroke(); } };
            const lines = (horizontal, w) => { g.lineWidth = w; for (let k = 8; k < 64; k += 16) { g.beginPath(); if (horizontal) { g.moveTo(0, k); g.lineTo(64, k); } else { g.moveTo(k, 0); g.lineTo(k, 64); } g.stroke(); } };
            if (pattern === 'diag1') diag(1, 4);
            else if (pattern === 'diag2') diag(-1, 4);
            else if (pattern === 'horiz') lines(true, 4);
            else if (pattern === 'vert') lines(false, 4);
            else if (pattern === 'grid') { lines(true, 3); lines(false, 3); }
            else if (pattern === 'cross') { diag(1, 3); diag(-1, 3); }
            else if (pattern === 'dots') { [16, 48].forEach((x) => [16, 48].forEach((y) => { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); })); }
            const tx = new THREE.CanvasTexture(cv);
            tx.wrapS = THREE.RepeatWrapping; tx.wrapT = THREE.RepeatWrapping;
            patTex.set(key, tx);
            return tx;
        }

        // ---- arma la escena con el Layout (metros; el centro de la nave queda en el origen)
        function update(layout, opts) {
            if (opts && typeof opts.labels === 'boolean') labelsOn = opts.labels;
            if (opts && opts.layers) LAYER_NAMES.forEach((n) => { if (typeof opts.layers[n] === 'boolean') layerOn[n] = opts.layers[n]; });
            if (opts && 'contourPick' in opts) contourPickMode = opts.contourPick === 'sides' || opts.contourPick === 'corners' ? opts.contourPick : null;
            if (opts && 'focus' in opts) focusSet = opts.focus || null;
            if (opts && 'openings' in opts) openingsOn = !!opts.openings;
            if (opts && 'levels' in opts) levelsOn = !!opts.levels;
            if (opts && 'neutralZones' in opts) neutralZones = !!opts.neutralZones;
            if (opts && 'floorsShow' in opts) floorsShow = !!opts.floorsShow;
            if (opts && 'rampsShow' in opts) rampsShow = !!opts.rampsShow;
            if (opts && 'dimLayers' in opts) dimLayers = new Set(opts.dimLayers || []);
            if (opts && 'positions' in opts) posOn = !!opts.positions;
            if (opts && 'pieces' in opts) pieceMap = new Map((Array.isArray(opts.pieces) ? opts.pieces : []).map((pc) => [`${pc.spaceId}|${pc.n}|${pc.c}|${pc.p}`, pc]));
            if (opts && 'bayFmt' in opts) bayFmtOn = opts.bayFmt && typeof opts.bayFmt === 'object' ? { ...opts.bayFmt } : null;
            if (opts && 'focusLevel' in opts) focusLevels = Array.isArray(opts.focusLevel) ? opts.focusLevel.filter(Boolean) : (opts.focusLevel ? [opts.focusLevel] : []);
            if (opts && 'fronts' in opts) frontSides = opts.fronts || {}; // el lado del frente de cada activo, sacado de TODO el Layout (el que se ve puede traer sin pasillos)
            if (opts && 'clashDoors' in opts) clashSet = new Set(opts.clashDoors || []);
            lastLayout = layout;
            fxItem = null;
            Object.keys(group).forEach((n) => clearGroup(group[n]));
            outline.visible = false;
            hitSpaces = null;
            spaceList = [];
            zoneMeshes = [];
            fpMeshes = [];
            contourHits = [];
            center = null;
            const V =layout && Array.isArray(layout.vertices) ? layout.vertices.filter((p) => Array.isArray(p) && p.length >= 2) : [];
            if (V.length < 3) { applyVisibility(); return; }
            // con un enfoque (zonas), el encuadre (centro, tamaño y piso) sale de _frame, un recuadro alrededor de lo enfocado; el contorno real (V) sigue dando las alturas y las paredes
            const frame = layout && Array.isArray(layout._frame) ? layout._frame.filter((p) => Array.isArray(p) && p.length >= 2) : [];
            const F = frame.length >= 3 ? frame : V;
            const xs = F.map((p) => p[0]);
            const ys = F.map((p) => p[1]);
            const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
            const CX = (minX + maxX) / 2;
            const CY = (minY + maxY) / 2;
            center = { x: CX, y: CY };
            const fallbackH = Number(layout.heightM) > 0 ? Number(layout.heightM) : 8;
            const cornerH = V.map((p) => (Number(p[2]) > 0 ? Number(p[2]) : fallbackH));
            const maxH = Math.max(...cornerH);
            const avgH = cornerH.reduce((a, b) => a + b, 0) / cornerH.length;
            const PX = (x) => x - CX;
            const PZ = (y) => y - CY;
            // con zonas enfocadas (_clip = el dibujo de esas zonas) las paredes se cortan al cuadro de esas zonas, un poco crecido (lo que mide el grosor de una pared)
            let wallClipPlanes = null;
            if (layout && Array.isArray(layout._clip) && layout._clip.length) {
                const all = layout._clip.flat();
                const grow = 0.5;
                const cx0 = Math.min(...all.map((p) => p[0])) - grow;
                const cx1 = Math.max(...all.map((p) => p[0])) + grow;
                const cy0 = Math.min(...all.map((p) => p[1])) - grow;
                const cy1 = Math.max(...all.map((p) => p[1])) + grow;
                wallClipPlanes = [
                    new THREE.Plane(new THREE.Vector3(1, 0, 0), -PX(cx0)), new THREE.Plane(new THREE.Vector3(-1, 0, 0), PX(cx1)),
                    new THREE.Plane(new THREE.Vector3(0, 0, 1), -PZ(cy0)), new THREE.Plane(new THREE.Vector3(0, 0, -1), PZ(cy1)),
                ];
            }
            bounds = { diag: Math.max(10, Math.hypot(maxX - minX, maxY - minY)), maxH, sx: maxX - minX, sy: maxY - minY };

            // piso (siempre se ve: es la forma de la nave)
            try {
                const shape = new THREE.Shape(F.map((p) => new THREE.Vector2(p[0], p[1])));
                const g = new THREE.ShapeGeometry(shape);
                g.rotateX(Math.PI / 2);
                g.translate(-CX, 0, -CY);
                group.floor.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xc3c8d8, side: THREE.DoubleSide })));
            } catch (err) { /* contorno que no se puede triangular: se dibujan solo las paredes */ }

            // paredes: translúcidas (con la altura de cada esquina) y sus aristas
            const lines = [];
            for (let i = 0; i < V.length; i++) {
                const a = V[i];
                const b = V[(i + 1) % V.length];
                const ha = cornerH[i];
                const hb = cornerH[(i + 1) % V.length];
                const ax = PX(a[0]); const az = PZ(a[1]); const bx = PX(b[0]); const bz = PZ(b[1]);
                lines.push(ax, ha, az, bx, hb, bz, ax, 0, az, ax, ha, az);
            }
            // El contorno solo es el marco (las aristas de arriba y las esquinas marcan la forma del techo) y es su propia capa («contour»). Las PAREDES son obstáculos del contorno y son otra capa («walls»): cada una sube del piso al techo de su lado (o al promedio si va dentro de la nave).
            const shapes3 = root.LayoutCalc && root.LayoutCalc.obstacleShapes ? root.LayoutCalc.obstacleShapes(layout) : [];
            const prism = (pts, h, y0) => {
                try {
                    const hh = Math.max(h, 0.02);
                    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1]))), { depth: hh, bevelEnabled: false });
                    geo.rotateX(Math.PI / 2);
                    geo.translate(-CX, y0 + hh, -CY);
                    return geo;
                } catch (err) { return null; }
            };
            // Una pared de 4 esquinas con alturas distintas en sus dos extremos: abajo plana y arriba inclinada (la altura de cada esquina sale de dónde cae sobre la pared).
            const slopedPrism = (pts, ax) => {
                try {
                    const hs = pts.map((p) => ax.heightAt(Math.min(Math.max((p[0] - ax.x) * ax.ux + (p[1] - ax.y) * ax.uy, 0), ax.length)));
                    const pos = [];
                    pts.forEach((p) => pos.push(PX(p[0]), 0, PZ(p[1])));
                    pts.forEach((p, i) => pos.push(PX(p[0]), Math.max(hs[i], 0.02), PZ(p[1])));
                    const n = pts.length;
                    const idx = [];
                    for (let i = 1; i < n - 1; i++) { idx.push(0, i, i + 1); idx.push(n, n + i, n + i + 1); }
                    for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(i, j, n + j, i, n + j, n + i); }
                    const geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                    geo.setIndex(idx);
                    geo.computeVertexNormals();
                    return geo;
                } catch (err) { return null; }
            };
            // Una pared compartida con una altura distinta de cada lado: dos mitades de su grueso, cada una sube del piso de la nave al remate de su lado (de su inicio a su final).
            // El material de una pared: el azul de siempre o, con formato propio (wallFmt3), su color y su trama (la tira del lado más bajo, un poco más oscura en el 3D); sin relleno, casi transparente.
            let wallFmt3 = null;
            const wallMat = (defaultColor, tone) => {
                const m = wallMatRaw(defaultColor, tone);
                if (wallClipPlanes) m.clippingPlanes = wallClipPlanes;
                return m;
            };
            const wallMatRaw = (defaultColor, tone) => {
                const f = wallFmt3;
                if (!f) return new THREE.MeshLambertMaterial({ color: defaultColor, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
                const textured = f.pattern !== 'solid' && f.pattern !== 'none';
                const tint = tone && root.LayoutCalc && root.LayoutCalc.mixHex ? root.LayoutCalc.mixHex(f.fill, '#000000', 0.2) : f.fill;
                return new THREE.MeshLambertMaterial({ color: textured ? 0xffffff : new THREE.Color(tint), map: textured ? patternTexture(f.fill, f.pattern, f.pcolor) : null, transparent: true, opacity: f.pattern === 'none' ? 0.1 : 0.62, side: THREE.DoubleSide, depthWrite: false });
            };
            const halfWalls = (ax, sides) => {
                const half = (ax.thick || 0) / 2;
                if (!(half > 0) || !(ax.length > 0)) return [];
                const at = (d, off) => [ax.x + ax.ux * d + ax.nx * off, ax.y + ax.uy * d + ax.ny * off];
                const mk = (o0, o1, sd, color) => {
                    const pts = [at(0, o0), at(ax.length, o0), at(ax.length, o1), at(0, o1)];
                    const hs = [sd.top0, sd.top1, sd.top1, sd.top0].map((v) => Math.max(v, 0.02));
                    const pos = [];
                    pts.forEach((p) => pos.push(PX(p[0]), 0, PZ(p[1])));
                    pts.forEach((p, i) => pos.push(PX(p[0]), hs[i], PZ(p[1])));
                    const idx = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
                    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; idx.push(i, j, 4 + j, i, 4 + j, 4 + i); }
                    const geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                    geo.setIndex(idx);
                    geo.computeVertexNormals();
                    return new THREE.Mesh(geo, wallMat(color, color === 0x566a98));
                };
                return [mk(0, half, sides.a, 0x6f84b3), mk(-half, 0, sides.b, 0x566a98)];
            };
            shapes3.filter(({ o }) => o.kind === 'wall' && !o._geom).forEach(({ o, g }) => {
                fxItem = { type: 'wall', id: o.id };
                wallFmt3 = o.fmt || null;
                // la pared sube de la altura de su inicio a la de su final (de fábrica, la del contorno en cada extremo); con 4 esquinas se arma con la parte de arriba inclinada
                const ax = root.LayoutCalc && root.LayoutCalc.wallAxis ? root.LayoutCalc.wallAxis(layout, o) : null;
                const wsides = ax && root.LayoutCalc.wallSides ? root.LayoutCalc.wallSides(layout, o, ax) : null;
                const liftedFloor = !!wsides && [wsides.a.floor0, wsides.a.floor1, wsides.b.floor0, wsides.b.floor1].some((f) => Math.abs(f) > 0.005);
                if (ax && wsides && (wsides.stepped || liftedFloor)) {
                    const meshes = halfWalls(ax, wsides);
                    if (meshes.length) { meshes.forEach((m) => group.walls.add(m)); return; }
                }
                const wallH = ax ? ax.height : (o.mode === 'contour' ? (cornerH[(Math.max(1, Number(o.wall)) - 1) % V.length] + cornerH[Math.max(1, Number(o.wall)) % V.length]) / 2 : avgH);
                const geo = ax && ax.length > 0 && g.pts.length === 4 && Math.abs(ax.hStart - ax.hEnd) > 0.005 ? slopedPrism(g.pts, ax) : prism(g.pts, wallH, 0);
                if (geo) group.walls.add(new THREE.Mesh(geo, wallMat(0x6f84b3, false)));
            });
            const lg = new THREE.BufferGeometry();
            lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
            group.contour.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x4a5f8f })));
            // Zonas de toque del contorno (solo las pide el editor, con el paso Contorno): una cortina invisible sobre cada lado («Por lados») o un poste sobre cada esquina («Por esquinas»); tocarlas elige su renglón.
            if (contourPickMode) {
                const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
                if (contourPickMode === 'sides') {
                    for (let i = 0; i < V.length; i++) {
                        const a = V[i];
                        const b = V[(i + 1) % V.length];
                        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
                        if (!(len > 0.01)) continue;
                        const hh = Math.max((cornerH[i] + cornerH[(i + 1) % V.length]) / 2, 0.5);
                        const m = new THREE.Mesh(new THREE.BoxGeometry(len, hh, 0.5), hitMat);
                        m.position.set(PX((a[0] + b[0]) / 2), hh / 2, PZ((a[1] + b[1]) / 2));
                        m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
                        m.userData = { kind: 'side', index: i };
                        group.contour.add(m);
                        contourHits.push(m);
                    }
                } else {
                    V.forEach((p, i) => {
                        const hh = Math.max(cornerH[i], 0.5);
                        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, hh, 10), hitMat);
                        m.position.set(PX(p[0]), hh / 2, PZ(p[1]));
                        m.userData = { kind: 'corner', index: i };
                        group.contour.add(m);
                        contourHits.push(m);
                    });
                }
            }

            // puertas y conexiones de luz (la pared 1 va de la esquina 1 a la 2; dist es desde la esquina de inicio)
            // una puerta va sobre su pared: por el centro de la pared, a lo largo de ella y un poco más gruesa que ella
            (layout.doors || []).forEach((d) => {
                fxItem = { type: 'door', id: d.id };
                const dg = root.LayoutCalc && root.LayoutCalc.doorGeometry ? root.LayoutCalc.doorGeometry(layout, d) : null;
                if (!dg) return;
                const w = Math.max(0.3, Number(d.width) || 1);
                const h = Math.max(0.5, Number(d.height) || 2.1);
                const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, Math.max(0.2, dg.thick + 0.04)), lam(DOOR_COLOR[d.type] || DOOR_COLOR.staff));
                // el umbral va en el piso más alto de los dos lados de la pared (dg.base); con pisos a distinto nivel el otro lado queda con un escalón
                const dBase = dg.base || 0;
                m.position.set(PX((dg.a.x + dg.b.x) / 2), dBase + h / 2, PZ((dg.a.y + dg.b.y) / 2));
                m.rotation.y = -Math.atan2(dg.uy, dg.ux);
                group.doors.add(m);
                // el espacio que necesita al abrir: sobre el piso (cuarto de círculo del giro o franja del recorrido), con su contorno, y la hoja ya abierta, transparente
                const op = openingsOn && root.LayoutCalc && root.LayoutCalc.doorOpening ? root.LayoutCalc.doorOpening(layout, d) : null;
                if (op) {
                    const col = clashSet.has(d.id) ? 0xc0392b : (op.type === 'swing' ? 0xa63fb5 : 0x2f7fc7);
                    const shape = new THREE.Shape(op.pts.map((p) => new THREE.Vector2(PX(p[0]), -PZ(p[1]))));
                    const flat = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
                    flat.rotation.x = -Math.PI / 2;
                    // el espacio de apertura va sobre el piso del lado hacia donde abre (el nivel del piso en el centro de ese espacio)
                    const opFloor = root.LayoutCalc.floorLevelAt ? root.LayoutCalc.floorLevelAt(layout, op.pts.reduce((acc, p) => acc + p[0], 0) / op.pts.length, op.pts.reduce((acc, p) => acc + p[1], 0) / op.pts.length) : 0;
                    flat.position.y = opFloor + 0.03;
                    group.doors.add(flat);
                    group.doors.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(op.pts.map((p) => new THREE.Vector3(PX(p[0]), opFloor + 0.05, PZ(p[1])))), new THREE.LineBasicMaterial({ color: col })));
                    const a = op.type === 'swing' ? op.leaf : op.travel;
                    const dx = a[1][0] - a[0][0];
                    const dz = a[1][1] - a[0][1];
                    const len = Math.hypot(dx, dz);
                    const side = op.type === 'swing' ? 0.06 : root.LayoutCalc.SLIDE_DEPTH * 0.8;
                    const cx = op.type === 'swing' ? (a[0][0] + a[1][0]) / 2 : op.pts.reduce((acc, p) => acc + p[0], 0) / op.pts.length;
                    const cz = op.type === 'swing' ? (a[0][1] + a[1][1]) / 2 : op.pts.reduce((acc, p) => acc + p[1], 0) / op.pts.length;
                    if (len > 0.05) {
                        const leaf = new THREE.Mesh(new THREE.BoxGeometry(len, h, side), new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.45, depthWrite: false }));
                        leaf.position.set(PX(cx), dBase + h / 2, PZ(cz));
                        leaf.rotation.y = -Math.atan2(dz, dx);
                        group.doors.add(leaf);
                    }
                }
            });
            // una conexión de luz va sobre su pared: por el centro de la pared y un poco más gruesa que ella
            (layout.power || []).forEach((e) => {
                fxItem = { type: 'power', id: e.id };
                const pg = root.LayoutCalc && root.LayoutCalc.doorGeometry ? root.LayoutCalc.doorGeometry(layout, { ...e, width: 0 }) : null;
                if (!pg) return;
                const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, Math.max(0.16, pg.thick + 0.04)), lam(POWER_COLOR[e.type] || POWER_COLOR.outlet110));
                m.position.set(PX(pg.a.x), (pg.base || 0) + Math.max(0.2, Number(e.height) || 0.4), PZ(pg.a.y));
                m.rotation.y = -Math.atan2(pg.uy, pg.ux);
                group.power.add(m);
            });
            // un sensor (de temperatura y/o humedad) va sobre su pared, a su altura del piso: un disco turquesa pegado a la pared (como el del croquis) con su código arriba
            (layout.sensors || []).forEach((e) => {
                fxItem = { type: 'sensor', id: e.id };
                const sg = root.LayoutCalc && root.LayoutCalc.doorGeometry ? root.LayoutCalc.doorGeometry(layout, { ...e, width: 0 }) : null;
                if (!sg) return;
                const y = (sg.base || 0) + Math.max(0.2, Number(e.height) || 1.5);
                const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, Math.max(0.16, sg.thick + 0.06), 18), lam(SENSOR_COLOR));
                disc.rotation.x = Math.PI / 2;
                const g = new THREE.Group();
                g.add(disc);
                g.position.set(PX(sg.a.x), y, PZ(sg.a.y));
                g.rotation.y = -Math.atan2(sg.uy, sg.ux);
                group.sensors.add(g);
                addLabel(group.sensorLabels, e.code, PX(sg.a.x), y + 0.45, PZ(sg.a.y), 0.3, false);
            });
            // columnas y obstáculos: del piso al techo
            shapes3.filter(({ o }) => o.kind !== 'wall').forEach(({ o, g }) => {
                fxItem = { type: 'obstacle', id: o.id };
                if (o.kind === 'step') {
                    // desnivel: una losa sobre el piso con su altura (si es más baja que el piso, una placa delgada de otro color)
                    const dz = Number(o.dz) || 0;
                    const geo = prism(g.pts, dz > 0 ? dz : 0.03, 0);
                    if (geo) group.columns.add(new THREE.Mesh(geo, lam(dz > 0 ? 0xcdb4e4 : 0x9a74bd)));
                    return;
                }
                // una columna u otro obstáculo con altura del piso (elev) y/o alto (h) propios no va del piso al techo: va de su altura del piso (sobre el piso que tiene abajo) hasta su alto, o hasta el techo si no trae alto
                const elev = Number(o.elev) > 0 ? Number(o.elev) : 0;
                const own = Number(o.h) > 0 ? Number(o.h) : 0;
                let base = 0; let height = avgH;
                if (elev || own) {
                    const bx = g.pts.map((p) => p[0]); const by = g.pts.map((p) => p[1]);
                    const lvl = root.LayoutCalc && root.LayoutCalc.floorLevelAt ? root.LayoutCalc.floorLevelAt(layout, (Math.min(...bx) + Math.max(...bx)) / 2, (Math.min(...by) + Math.max(...by)) / 2) : 0;
                    base = lvl + elev;
                    height = own || Math.max(avgH - base, 0.05);
                }
                const geo = prism(g.pts, height, base);
                if (geo) group.columns.add(new THREE.Mesh(geo, lam(o.kind === 'other' ? 0x7b8196 : 0x3a3f4d)));
            });

            // zonas: losas de color (el que se les puso en Formato de zona, o el de su tipo; en gris neutro si el paso Pisos va sin el chip Zonas)
            const LCalc = root.LayoutCalc;
            // Los pisos (desniveles): el nivel del piso en un punto es el del piso que lo contiene (0 si no hay ninguno); lo que está encima de un piso (huellas, activos, pasillos, objetos, seguridad) sube con él.
            const floors = LCalc && LCalc.floorsOf ? LCalc.floorsOf(layout) : [];
            const anyLevel = !!LCalc && !!LCalc.floorLevelAt && floors.length > 0;
            const FL = (x, y) => (anyLevel ? LCalc.floorLevelAt(layout, x, y) : 0);
            // Una zona que toca algún piso se pinta por pedazos: cada pedazo sube (o se inclina, en una rampa) con el piso que tiene debajo y lo que no cae en ningún piso queda a nivel de la nave. Así una zona puede
            // estar parte sobre una plataforma y parte sobre una rampa sin partirse en dos.
            const zonePieces = (pts) => {
                const tris = LCalc.triangulate(pts);
                if (!tris) return null;
                const out = [];
                tris.forEach(([a, b, c]) => {
                    let rest = [[pts[a], pts[b], pts[c]]];
                    floors.forEach((f) => {
                        const next = [];
                        rest.forEach((poly) => {
                            const sp = LCalc.splitByRect(poly, f.x, f.y, f.x + f.l, f.y + f.w);
                            if (sp.inside) out.push({ poly: sp.inside, floor: f });
                            sp.outside.forEach((o) => next.push(o));
                        });
                        rest = next;
                    });
                    rest.forEach((poly) => out.push({ poly, floor: null }));
                });
                return out;
            };
            const piecesGeometry = (pieces, i) => {
                const pos = [];
                const lift = 0.05 + 0.004 * i;
                pieces.forEach((pc) => {
                    const p = pc.poly;
                    // la zona va POR ENCIMA del piso (el orden de los pasos es el empalme): el pedazo que cae sobre un piso o una rampa sube con él y queda un poquito arriba de su losa
                    // pero la RAMPA va por encima de la zona: el pedazo que cae sobre una rampa queda un poquito debajo de su losa
                    const base = pc.floor ? 0.05 + 0.004 * floors.indexOf(pc.floor) + (pc.floor.isRamp ? -0.05 : 0.012) + 0.0002 * i : lift;
                    for (let k = 1; k < p.length - 1; k++) {
                        [p[0], p[k], p[k + 1]].forEach((v) => pos.push(PX(v[0]), base + (pc.floor ? LCalc.zoneLevelAt(pc.floor, v[0], v[1]) : 0), PZ(v[1])));
                    }
                });
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                geo.computeVertexNormals();
                return geo;
            };
            // Cada piso: sus cuatro lados bajan hasta el piso de la nave (en una rampa, el lado alto es más alto que el bajo) y arriba lleva SU color (el de su nivel o el de su formato propio, con su trama y su borde), no el de la zona que toca.
            // Una rampa sin formato propio se pinta con el degradado entre los colores de sus dos niveles.
            if (anyLevel) {
                const levelCols = LCalc.floorLevelColors ? LCalc.floorLevelColors(layout) : {};
                const colorOfLevel = (v) => levelCols[Math.round(v * 100) / 100] || '#e9e9ee';
                // con zonas enfocadas (_clip = el dibujo de esas zonas) cada piso solo se pinta DENTRO de ellas
                const clipPolys = layout && Array.isArray(layout._clip) && layout._clip.length ? layout._clip : null;
                floors.forEach((f, i) => {
                    // la losa de un piso solo sale con el paso Pisos y la de una rampa solo con el paso Rampas (lo que está encima sigue a la altura que le toca)
                    if (f.isRamp ? !rampsShow : !floorsShow) return;
                    const fmtF = LCalc.floorFmtOf ? LCalc.floorFmtOf(layout, f) : { fill: '#e6d3f0', pattern: 'solid', pcolor: '#9b6fb0', line: 'thin', bcolor: '#7a5190' };
                    const lift = 0.05 + 0.004 * i;
                    const corners = [[f.x, f.y], [f.x + f.l, f.y], [f.x + f.l, f.y + f.w], [f.x, f.y + f.w]];
                    // el pedazo del piso que cae dentro de las zonas enfocadas: los triángulos de cada zona cortados con el cuadro del piso (convexos)
                    let pieces = null;
                    if (clipPolys) {
                        pieces = [];
                        clipPolys.forEach((cp) => {
                            const tris = LCalc.triangulate(cp);
                            if (!tris) return;
                            tris.forEach(([a, b, c]) => {
                                const sp = LCalc.splitByRect([cp[a], cp[b], cp[c]], f.x, f.y, f.x + f.l, f.y + f.w);
                                if (sp.inside && sp.inside.length >= 3) pieces.push(sp.inside);
                            });
                        });
                        if (!pieces.length) return; // este piso no toca las zonas enfocadas
                    }
                    // los costados bajan solo por la orilla del piso (no por donde la zona lo corta ni por dentro de los pedazos)
                    const eps = 1e-6;
                    const onRim = (p, q) => (Math.abs(p[0] - f.x) < eps && Math.abs(q[0] - f.x) < eps) || (Math.abs(p[0] - (f.x + f.l)) < eps && Math.abs(q[0] - (f.x + f.l)) < eps)
                        || (Math.abs(p[1] - f.y) < eps && Math.abs(q[1] - f.y) < eps) || (Math.abs(p[1] - (f.y + f.w)) < eps && Math.abs(q[1] - (f.y + f.w)) < eps);
                    const edges = pieces ? pieces.flatMap((poly) => poly.map((p, k) => [p, poly[(k + 1) % poly.length]]).filter(([p, q]) => onRim(p, q))) : corners.map((p, k) => [p, corners[(k + 1) % 4]]);
                    const arr = [];
                    edges.forEach(([p, q]) => {
                        const tp = lift + LCalc.zoneLevelAt(f, p[0], p[1]); const tq = lift + LCalc.zoneLevelAt(f, q[0], q[1]);
                        arr.push(PX(p[0]), 0, PZ(p[1]), PX(q[0]), 0, PZ(q[1]), PX(q[0]), tq, PZ(q[1]), PX(p[0]), 0, PZ(p[1]), PX(q[0]), tq, PZ(q[1]), PX(p[0]), tp, PZ(p[1]));
                    });
                    const sides = new THREE.BufferGeometry();
                    sides.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
                    sides.computeVertexNormals();
                    group.zones.add(new THREE.Mesh(sides, new THREE.MeshLambertMaterial({ color: new THREE.Color(LCalc.mixHex ? LCalc.mixHex(fmtF.fill, '#000000', 0.25) : fmtF.fill), side: THREE.DoubleSide })));
                    // la parte de arriba: dos triángulos con la altura de cada esquina (en una rampa, inclinada)
                    const lo = Math.round((Number(f.lvl) || 0) * 100) / 100;
                    const ramp = f.lvl2 !== undefined && f.lvl2 !== null && Math.round((Number(f.lvl2) || 0) * 100) / 100 !== lo;
                    const gradient = ramp && !f.fmt;
                    const hi = ramp ? Math.round((Number(f.lvl2) || 0) * 100) / 100 : lo;
                    // el degradado de una rampa va del color del piso de abajo al del piso de arriba (los dos pisos que toca)
                    const endCols = (ramp && LCalc.rampEndColors && LCalc.rampEndColors(layout, f)) || { lo: colorOfLevel(lo), hi: colorOfLevel(hi) };
                    const pos = []; const uv = []; const cols = [];
                    const topTris = pieces ? pieces.flatMap((poly) => poly.slice(2).map((_, k) => [poly[0], poly[k + 1], poly[k + 2]])) : [[corners[0], corners[1], corners[2]], [corners[0], corners[2], corners[3]]];
                    topTris.forEach((tri) => tri.forEach((p) => {
                        const lv = LCalc.zoneLevelAt(f, p[0], p[1]);
                        pos.push(PX(p[0]), lift + lv, PZ(p[1]));
                        uv.push(p[0] * 0.8, p[1] * 0.8);
                        if (gradient) {
                            const t = hi === lo ? 0 : Math.min(Math.max((lv - lo) / (hi - lo), 0), 1);
                            const c = new THREE.Color(LCalc.mixHex ? LCalc.mixHex(endCols.lo, endCols.hi, t) : '#e6d3f0');
                            cols.push(c.r, c.g, c.b);
                        }
                    }));
                    const top = new THREE.BufferGeometry();
                    top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                    top.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
                    if (gradient) top.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
                    top.computeVertexNormals();
                    let topMat;
                    if (gradient) topMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
                    else if (fmtF.pattern === 'solid' || fmtF.pattern === 'none') topMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(fmtF.fill), side: THREE.DoubleSide });
                    else topMat = new THREE.MeshLambertMaterial({ map: patternTexture(fmtF.fill, fmtF.pattern, fmtF.pcolor), side: THREE.DoubleSide });
                    group.zones.add(new THREE.Mesh(top, topMat));
                    // el borde del piso (con el color y el estilo de su formato; sin borde, nada)
                    if (fmtF.line !== 'none' && !pieces) {
                        const edge = corners.map((p) => new THREE.Vector3(PX(p[0]), lift + LCalc.zoneLevelAt(f, p[0], p[1]) + 0.006, PZ(p[1])));
                        group.zones.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(edge), new THREE.LineBasicMaterial({ color: new THREE.Color(fmtF.bcolor) })));
                    }
                });
            }
            (layout.zones || []).forEach((z, i) => {
                const pts = Array.isArray(z.pts) && z.pts.length >= 3 ? z.pts : [[z.x, z.y], [z.x + z.l, z.y], [z.x + z.l, z.y + z.w], [z.x, z.y + z.w]];
                if (!(z.l > 0 || (z.pts && z.pts.length >= 3))) return;
                const color = neutralZones ? DEFAULT_ZONE_FILL.none : ((z.fmt && z.fmt.fill) || DEFAULT_ZONE_FILL[z.type || 'none'] || DEFAULT_ZONE_FILL.none);
                const inactive = z.active === false;
                const dimZone = !!focusSet && !focusSet.zones.has(z.id);
                const zoneMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), transparent: inactive || dimZone, opacity: inactive ? 0.35 : (dimZone ? 0.22 : 1) });
                let geo = null;
                let usedPieces = false;
                // la zona se pinta por encima del piso (con su color) también donde hay piso: el piso se ve donde la zona no lo cubre y por sus costados
                if (anyLevel && LCalc.floorsOfZone(layout, z).some((f) => floors.some((g) => g.id === f.id))) {
                    try {
                        const pieces = zonePieces(pts);
                        if (pieces && pieces.length) {
                            usedPieces = true;
                            geo = piecesGeometry(pieces, i);
                            zoneMat.side = THREE.DoubleSide;
                        }
                    } catch (err) { geo = null; usedPieces = false; }
                }
                if (!geo && !usedPieces) {
                    try {
                        geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1]))), { depth: 0.05, bevelEnabled: false });
                    } catch (err) { return; }
                    geo.rotateX(Math.PI / 2);
                    geo.translate(-CX, 0.05 + 0.004 * i, -CY);
                }
                if (geo) {
                    const mesh = new THREE.Mesh(geo, zoneMat);
                    mesh.userData = { kind: 'zone', zone: z };
                    group.zones.add(mesh);
                    zoneMeshes.push(mesh);
                }
                let ax; let ay;
                try { const a = LCalc && LCalc.zoneLabelAnchor ? LCalc.zoneLabelAnchor(z) : null; if (a) { ax = a.x; ay = a.y; } } catch (err) { /* usa el centro */ }
                if (ax === undefined) { ax = z.x + z.l / 2; ay = z.y + z.w / 2; }
                if (!inactive && !dimZone) addLabel(group.zoneLabels, z.name, PX(ax), 0.12 + 0.004 * i + FL(ax, ay), PZ(ay), Math.max(0.5, Math.min(0.9, Math.min(z.l, z.w) * 0.1)), true);
            });
            // el código y el nivel de cada piso (con el icono «Niveles»), un poco más arriba que el nombre de las zonas
            if (levelsOn && anyLevel) {
                floors.forEach((f) => {
                    const cx = f.x + f.l / 2; const cy = f.y + f.w / 2;
                    const lo = Math.round((Number(f.lvl) || 0) * 100) / 100;
                    const text = f.lvl2 !== undefined && f.rise ? `${lo} → ${Math.round(Number(f.lvl2) * 100) / 100}` : `${lo > 0 ? '+' : ''}${lo}`;
                    addLabel(group.zoneLabels, `${f.code} · ${text} m`, PX(cx), 0.7 + FL(cx, cy), PZ(cy), 0.45, true);
                });
            }

            // pasillos (paso Tránsito, su propia capa): losas delgadas sobre el piso (principal más oscuro, entre pasillos más claro)
            const transitY = 0.06 + 0.004 * (layout.zones || []).length;
            (layout.transit || []).forEach((p, i) => {
                fxItem = { type: 'transit', id: p.id };
                if (!(p.l > 0) || !(p.w > 0)) return;
                const fp = p.fmt;
                if (fp) {
                    // con formato propio: una losa plana con su color o su trama (la trama a escala real, como los pisos) y su borde
                    const geo = new THREE.PlaneGeometry(p.l, p.w);
                    geo.rotateX(-Math.PI / 2);
                    const posA = geo.attributes.position;
                    const uvA = geo.attributes.uv;
                    for (let k = 0; k < posA.count; k++) uvA.setXY(k, (p.x + p.l / 2 + posA.getX(k)) * 0.8, (p.y + p.w / 2 + posA.getZ(k)) * 0.8);
                    const textured = fp.pattern !== 'solid' && fp.pattern !== 'none';
                    const mat = textured ? new THREE.MeshLambertMaterial({ map: patternTexture(fp.fill, fp.pattern, fp.pcolor), side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ color: new THREE.Color(fp.fill), transparent: fp.pattern === 'none', opacity: fp.pattern === 'none' ? 0.1 : 1, side: THREE.DoubleSide });
                    const top = new THREE.Mesh(geo, mat);
                    const cx = p.x + p.l / 2;
                    const cy = p.y + p.w / 2;
                    const topY = transitY + 0.002 * i + FL(cx, cy) + 0.011;
                    top.position.set(PX(cx), topY, PZ(cy));
                    group.transit.add(top);
                    if (fp.line !== 'none') {
                        const edge = [[p.x, p.y], [p.x + p.l, p.y], [p.x + p.l, p.y + p.w], [p.x, p.y + p.w]].map((q) => new THREE.Vector3(PX(q[0]), topY + 0.004, PZ(q[1])));
                        group.transit.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(edge), new THREE.LineBasicMaterial({ color: new THREE.Color(fp.bcolor) })));
                    }
                    return;
                }
                const slab = new THREE.Mesh(new THREE.BoxGeometry(p.l, 0.02, p.w), new THREE.MeshLambertMaterial({ color: p.type === 'between' ? 0xe3e6ef : 0xc4c9db }));
                slab.position.set(PX(p.x + p.l / 2), transitY + 0.002 * i + FL(p.x + p.l / 2, p.y + p.w / 2), PZ(p.y + p.w / 2));
                group.transit.add(slab);
            });
            // objetos (paso Objetos): personas y montacargas a escala, girados hacia donde miran (foto fija del plano)
            (layout.objects || []).forEach((o) => {
                fxItem = { type: 'object', id: o.id };
                const l = Math.max(Number(o.l) || 0.3, 0.1);
                const w = Math.max(Number(o.w) || 0.3, 0.1);
                const h = Math.max(Number(o.h) || 1, 0.2);
                const g = new THREE.Group();
                const equipHex = LCalc && LCalc.equipColorOf ? LCalc.equipColorOf(o) : (o.type === 'forklift' ? '#f2c230' : '#9aa0b5');
                if (o.type === 'forklift') {
                    const body = new THREE.Mesh(new THREE.BoxGeometry(l * 0.72, h * 0.42, w), lam(equipHex));
                    body.position.set(-l * 0.14, h * 0.21 + 0.12, 0);
                    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.1, h * 0.95, w * 0.8), lam(0x4a4f5e));
                    mast.position.set(l * 0.22, h * 0.475, 0);
                    const roof = new THREE.Mesh(new THREE.BoxGeometry(l * 0.34, 0.06, w * 0.9), lam(0x2a2f3d));
                    roof.position.set(-l * 0.2, h * 0.95, 0);
                    g.add(body, mast, roof);
                    [-1, 1].forEach((sgn) => {
                        const fork = new THREE.Mesh(new THREE.BoxGeometry(l * 0.34, 0.05, 0.1), lam(0x3a3f4d));
                        fork.position.set(l * 0.38, 0.06, sgn * w * 0.28);
                        g.add(fork);
                    });
                } else if (o.type === 'box') {
                    const crate = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), lam(equipHex));
                    crate.position.set(0, h / 2, 0);
                    g.add(crate);
                } else {
                    // el operario (mira hacia +x): piernas, chaleco con dos franjas, brazos, cabeza y casco; el color del chaleco y del casco es el del objeto
                    const pc = LCalc && LCalc.personColorsOf ? LCalc.personColorsOf(o) : { vest: '#e08a2e', helmet: '#f4f4f1' };
                    const H = Math.max(h, 0.8);
                    const hex = (c) => new THREE.Color(c);
                    const mat = (c) => new THREE.MeshLambertMaterial({ color: hex(c) });
                    const skin = 0xf3c9a0;
                    const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
                    [-1, 1].forEach((sd) => {
                        add(new THREE.BoxGeometry(l * 0.42, H * 0.47, w * 0.26), lam(0x2d3a55), 0, H * 0.235, sd * w * 0.19);
                        add(new THREE.BoxGeometry(l * 0.62, H * 0.05, w * 0.29), lam(0x1d2433), l * 0.08, H * 0.025, sd * w * 0.19);
                        add(new THREE.CylinderGeometry(w * 0.07, w * 0.065, H * 0.33, 8), mat(LCalc && LCalc.mixHex ? LCalc.mixHex(pc.vest, '#000000', sd < 0 ? 0.12 : 0.28) : pc.vest), 0, H * 0.635, sd * w * 0.5);
                        add(new THREE.SphereGeometry(H * 0.032, 8, 6), lam(skin), 0, H * 0.455, sd * w * 0.5);
                    });
                    add(new THREE.BoxGeometry(l * 0.7, H * 0.33, w * 0.62), mat(pc.vest), 0, H * 0.635, 0);
                    [0.56, 0.67].forEach((fy) => add(new THREE.BoxGeometry(l * 0.72, H * 0.032, w * 0.64), lam(0xf6f3e0), 0, H * fy, 0));
                    add(new THREE.CylinderGeometry(H * 0.03, H * 0.03, H * 0.04, 8), lam(skin), 0, H * 0.82, 0);
                    add(new THREE.SphereGeometry(H * 0.075, 12, 10), lam(skin), 0, H * 0.885, 0);
                    add(new THREE.SphereGeometry(H * 0.086, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(pc.helmet), 0, H * 0.9, 0);
                    add(new THREE.CylinderGeometry(H * 0.099, H * 0.099, H * 0.012, 14), mat(LCalc && LCalc.mixHex ? LCalc.mixHex(pc.helmet, '#000000', 0.15) : pc.helmet), 0, H * 0.9, 0);
                }
                g.position.set(PX(Number(o.x) || 0), 0.08 + FL(Number(o.x) || 0, Number(o.y) || 0), PZ(Number(o.y) || 0));
                g.rotation.y = -((Number(o.angle) || 0) * Math.PI) / 180;
                group.objects.add(g);
            });
            // seguridad (paso Seguridad, su propia capa): extintores, hidrantes, puertas de emergencia, botiquines, alarmas, regaderas y lavaojos y puntos de reunión como figuras sencillas a su altura y con su color;
            // la ruta de evacuación, como marcas verdes sobre el piso con una flecha al llegar. Lo que va colgado de una pared se pone paralelo a la pared más cercana.
            const wallAngleAt = (px, py) => {
                let best = 0;
                let bestD = Infinity;
                for (let i = 1; i <= V.length; i++) {
                    const seg = wallSegment(V, i);
                    if (!seg.length) continue;
                    const t = Math.max(0, Math.min(seg.length, (px - seg.p[0]) * seg.ux + (py - seg.p[1]) * seg.uy));
                    const d = Math.hypot(px - (seg.p[0] + seg.ux * t), py - (seg.p[1] + seg.uy * t));
                    if (d < bestD) { bestD = d; best = Math.atan2(seg.uy, seg.ux); }
                }
                return best;
            };
            // por vencer (ámbar) o vencido (rojo): un aro plano en el piso alrededor del elemento (el estado sale de la fecha más cercana contra hoy)
            const nowDate = new Date();
            const todayIso3d = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
            const dueRing = (ex, ey, e) => {
                const st = LCalc && LCalc.safetyStatus ? LCalc.safetyStatus(e, todayIso3d, layout.safetyWarnDays, layout.safetyLast && layout.safetyLast[e.id]) : { state: 'none' };
                if (st.state !== 'soon' && st.state !== 'overdue' && st.state !== 'fail') return;
                const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.74, 28), new THREE.MeshBasicMaterial({ color: st.state === 'soon' ? 0xe8892b : 0xc0392b, side: THREE.DoubleSide }));
                ring.rotation.x = -Math.PI / 2;
                ring.position.set(PX(ex), 0.14 + FL(ex, ey), PZ(ey));
                group.safety.add(ring);
            };
            (layout.safety || []).forEach((e) => {
                fxItem = { type: 'safety', id: e.id };
                const color = SAFETY_COLOR[e.type] || 0xd9443a;
                const ex = Number(e.x) || 0;
                const ey = Number(e.y) || 0;
                const g = new THREE.Group();
                if (e.type === 'route') {
                    const dx = (Number(e.x2) || 0) - ex;
                    const dy = (Number(e.y2) || 0) - ey;
                    const len = Math.hypot(dx, dy);
                    if (!(len > 0.05)) return;
                    const ang = Math.atan2(dy, dx);
                    const head = Math.min(0.9, len);
                    for (let d = 0.25; d + 0.25 <= len - head; d += 0.9) {
                        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.2), lam(color));
                        dash.position.set(Math.cos(ang) * d + Math.cos(ang) * 0.25, 0.12, Math.sin(ang) * d + Math.sin(ang) * 0.25);
                        dash.rotation.y = -ang;
                        g.add(dash);
                    }
                    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.34, head, 3), lam(color));
                    tip.rotation.z = -Math.PI / 2;
                    tip.scale.set(0.15, 1, 1);
                    tip.position.set(Math.cos(ang) * (len - head / 2), 0.13, Math.sin(ang) * (len - head / 2));
                    tip.rotation.y = -ang;
                    g.add(tip);
                    g.position.set(PX(ex), FL(ex, ey), PZ(ey));
                    group.safety.add(g);
                    dueRing(ex, ey, e);
                    return;
                }
                // Cada figura se arma con la altura al piso (elev) y el tamaño (l largo, w ancho, h alto) del elemento: los que capturó la persona o, si no hay, los de fábrica de su tipo (LayoutCalc.safetySizeOf).
                const sz = LCalc.safetySizeOf(e);
                const y0 = sz.elev;
                const rr = Math.max(Math.min(sz.l, sz.w) / 2, 0.02);
                if (e.type === 'hydrant' && LCalc.hydrantModelOf(e) === 'double_post') {
                    // hidrante de poste doble: un tubo parado con un travesaño arriba y una válvula (volante) en cada punta
                    const pipeR = rr * 0.55;
                    const base = new THREE.Mesh(new THREE.CylinderGeometry(rr * 1.05, rr * 1.15, 0.05, 14), lam(0x8a2a22));
                    base.position.y = y0 + 0.025;
                    const post = new THREE.Mesh(new THREE.CylinderGeometry(pipeR, pipeR, sz.h, 12), lam(color));
                    post.position.y = y0 + sz.h / 2;
                    const barY = y0 + sz.h * 0.86;
                    const bar = new THREE.Mesh(new THREE.CylinderGeometry(pipeR * 0.8, pipeR * 0.8, sz.l, 12), lam(color));
                    bar.rotation.z = Math.PI / 2;
                    bar.position.y = barY;
                    g.add(base, post, bar);
                    [-1, 1].forEach((sd) => {
                        const stem = new THREE.Mesh(new THREE.CylinderGeometry(pipeR * 0.4, pipeR * 0.4, sz.h * 0.14, 8), lam(0xb83a30));
                        stem.position.set(sd * sz.l * 0.4, barY + sz.h * 0.07, 0);
                        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.9, rr * 0.9, 0.02, 14), lam(0xe9b949));
                        wheel.position.set(sd * sz.l * 0.4, barY + sz.h * 0.15, 0);
                        g.add(stem, wheel);
                    });
                    g.rotation.y = -wallAngleAt(ex, ey);
                } else if (e.type === 'hydrant' && LCalc.hydrantModelOf(e) === 'siamese') {
                    // toma siamesa: una placa en la pared, un tubo de latón y dos bocas que salen en «Y»
                    const brass = 0xc9a227;
                    const plate = new THREE.Mesh(new THREE.BoxGeometry(sz.l * 0.55, sz.h * 0.7, 0.04), lam(0x8a2a22));
                    plate.position.set(0, y0 + sz.h * 0.4, -sz.w / 2 + 0.02);
                    const stemH = sz.h * 0.4;
                    const stem = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.34, rr * 0.34, stemH, 10), lam(brass));
                    stem.position.set(0, y0 + stemH / 2 + sz.h * 0.05, 0);
                    g.add(plate, stem);
                    [-1, 1].forEach((sd) => {
                        const arm = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.3, rr * 0.3, sz.h * 0.55, 10), lam(brass));
                        arm.rotation.z = -sd * 0.75;
                        arm.position.set(sd * sz.l * 0.22, y0 + sz.h * 0.68, sz.w * 0.08);
                        const cap = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.42, rr * 0.42, 0.04, 10), lam(0xb83a30));
                        cap.rotation.z = -sd * 0.75;
                        cap.position.set(sd * sz.l * 0.43, y0 + sz.h * 0.9, sz.w * 0.08);
                        g.add(arm, cap);
                    });
                    g.rotation.y = -wallAngleAt(ex, ey);
                } else if (e.type === 'hydrant' && LCalc.hydrantModelOf(e) === 'cabinet') {
                    // gabinete contra incendio: caja roja con ventana de vidrio, la manguera enrollada y la válvula
                    const box = new THREE.Mesh(new THREE.BoxGeometry(sz.l, sz.h, sz.w), lam(color));
                    box.position.y = y0 + sz.h / 2;
                    const glass = new THREE.Mesh(new THREE.BoxGeometry(sz.l * 0.78, sz.h * 0.8, 0.02), new THREE.MeshLambertMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.5 }));
                    glass.position.set(0, y0 + sz.h / 2, sz.w / 2 + 0.03);
                    const coilR = Math.min(sz.l, sz.h) * 0.26;
                    const coil = new THREE.Mesh(new THREE.TorusGeometry(coilR, Math.min(0.04, sz.w * 0.2), 8, 22), lam(0xf4f0e6));
                    coil.position.set(sz.l * 0.08, y0 + sz.h * 0.42, sz.w / 2 + 0.005);
                    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), lam(0xc9a227));
                    valve.rotation.x = Math.PI / 2;
                    valve.position.set(-sz.l * 0.28, y0 + sz.h * 0.78, sz.w / 2 + 0.015);
                    g.add(box, glass, coil, valve);
                    g.rotation.y = -wallAngleAt(ex, ey);
                } else if (e.type === 'hydrant') {
                    const bodyH = sz.h * 0.82;
                    const body = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.87, rr, bodyH, 14), lam(color));
                    body.position.y = y0 + bodyH / 2;
                    const cap = new THREE.Mesh(new THREE.SphereGeometry(rr * 0.93, 12, 8), lam(0xb83a30));
                    cap.position.y = y0 + bodyH + rr * 0.1;
                    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.4, rr * 0.4, rr * 2.7, 10), lam(0x8a2a22));
                    nozzle.rotation.z = Math.PI / 2;
                    nozzle.position.y = y0 + sz.h * 0.53;
                    g.add(body, cap, nozzle);
                } else if (e.type === 'emergency_door') {
                    const door = new THREE.Mesh(new THREE.BoxGeometry(sz.l, sz.h, sz.w), lam(color));
                    door.position.y = y0 + sz.h / 2;
                    const sign = new THREE.Mesh(new THREE.BoxGeometry(sz.l * 0.5, 0.2, 0.06), lam(0x14602f));
                    sign.position.set(0, y0 + sz.h + 0.15, 0);
                    g.add(door, sign);
                    g.rotation.y = -wallAngleAt(ex, ey);
                } else if (e.type === 'firstaid') {
                    const box = new THREE.Mesh(new THREE.BoxGeometry(sz.l, sz.h, sz.w), lam(color));
                    box.position.y = y0 + sz.h / 2;
                    const arm = Math.min(sz.l, sz.h) * 0.64;
                    const thick = Math.min(sz.l, sz.h) * 0.18;
                    const bar1 = new THREE.Mesh(new THREE.BoxGeometry(arm, thick, 0.02), lam(0xffffff));
                    bar1.position.set(0, y0 + sz.h / 2, sz.w / 2 + 0.01);
                    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(thick, arm, 0.02), lam(0xffffff));
                    bar2.position.set(0, y0 + sz.h / 2, sz.w / 2 + 0.01);
                    g.add(box, bar1, bar2);
                    g.rotation.y = -wallAngleAt(ex, ey);
                } else if (e.type === 'alarm') {
                    const box = new THREE.Mesh(new THREE.BoxGeometry(sz.l, sz.h, sz.w), lam(color));
                    box.position.y = y0 + sz.h / 2;
                    g.add(box);
                    g.rotation.y = -wallAngleAt(ex, ey);
                } else if (e.type === 'eyewash') {
                    const postH = Math.max(sz.h - 0.1, 0.1);
                    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, postH, 10), lam(color));
                    post.position.y = y0 + postH / 2;
                    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(sz.l, sz.w) / 2, Math.max(sz.l, sz.w) * 0.386, 0.09, 14), lam(0x1f5f9e));
                    bowl.position.y = y0 + postH + 0.04;
                    g.add(post, bowl);
                } else if (e.type === 'assembly') {
                    const disc = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(sz.l, sz.w) / 2, Math.max(sz.l, sz.w) / 2, 0.03, 24), lam(color));
                    disc.position.y = y0 + 0.12;
                    const poleH = Math.max(sz.h - 0.1, 0.2);
                    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, poleH, 8), lam(0x4a4f5e));
                    pole.position.y = y0 + poleH / 2;
                    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.04), lam(color));
                    sign.position.y = y0 + Math.max(sz.h - 0.2, 0.3);
                    g.add(disc, pole, sign);
                } else {
                    // extintor: un cilindro rojo con su cabeza, colgado a la altura que se capturó (de fábrica, a la altura de la mano)
                    const tankH = sz.h * 0.83;
                    const headH = sz.h - tankH;
                    const tank = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.9, rr * 0.9, tankH, 12), lam(color));
                    tank.position.y = y0 + tankH / 2;
                    const head = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.4, rr * 0.5, headH, 10), lam(0x2a2f3d));
                    head.position.y = y0 + tankH + headH / 2;
                    g.add(tank, head);
                }
                g.position.set(PX(ex), 0.08 + FL(ex, ey), PZ(ey));
                group.safety.add(g);
                dueRing(ex, ey, e);
            });
            fxItem = null;
            // huellas (el lugar en el piso, capa «Huella-Espacio»): una losa delgada, blanca o con su color, debajo de sus activos
            (layout.footprints || []).forEach((f) => {
                if (f.active === false || !(f.l > 0) || !(f.d > 0)) return;
                const paint = f.fmt && f.fmt.pattern !== 'none' && /^#[0-9a-fA-F]{6}$/.test(f.fmt.fill || '') ? f.fmt.fill : '#ffffff';
                const dimFp = !!focusSet && !focusSet.footprints.has(f.id);
                const slab = new THREE.Mesh(new THREE.BoxGeometry(f.l, 0.02, f.d), new THREE.MeshLambertMaterial({ color: new THREE.Color(paint), transparent: dimFp, opacity: dimFp ? 0.25 : 1 }));
                slab.position.set(PX(f.x + f.l / 2), 0.085 + FL(f.x + f.l / 2, f.y + f.d / 2), PZ(f.y + f.d / 2));
                slab.userData = { kind: 'footprint', footprint: f };
                group.footprints.add(slab);
                fpMeshes.push(slab);
            });

            // activos: anaqueles (postes y repisas por nivel), anaqueles con tarimas, gabinetes y tarimas
            focusContainer = null;
            const upr = []; const dck = []; const blk = [];
            const patDecks = []; // los decks y bloques con trama: cada uno una caja con su textura (los de un solo color van instanciados)
            const bayFmtFor = (c) => (bayFmtOn && root.LayoutCalc && root.LayoutCalc.bayFmtOf ? root.LayoutCalc.bayFmtOf({ bayFmt: bayFmtOn }, c) : null);
            const hexNum = (h) => parseInt(String(h).slice(1), 16);
            // una pieza de un espacio: la repisa (deck) lleva SIEMPRE el color de su nivel; solo el bloque de lo que es macizo (tarima, gabinete, cámara) lleva el formato de su número. dimIt = apagada (Tenue).
            const volBoxes = []; // los espacios como VOLUMEN (largo × fondo × alto) con el color y la trama de su número, traslúcidos: [{ x, y, z, sx, sy, sz, fmt }]
            const bayVolume = (x, y, z, sx, sy, sz, c) => { const bf = bayFmtFor(c); if (bf) volBoxes.push({ x, y, z, sx, sy, sz, fmt: bf }); };
            const pushPiece = (list, x, y, z, sx, sy, sz, color, c, dimIt) => {
                const bf = c && list === blk ? bayFmtFor(c) : null;
                if (!bf) { list.push({ x, y, z, sx, sy, sz, c: color }); return; }
                if (bf.pattern !== 'solid' && bf.pattern !== 'none') { patDecks.push({ x, y, z, sx, sy, sz, fmt: bf, dim: !!dimIt }); return; }
                list.push({ x, y, z, sx, sy, sz, c: dimIt ? mixHex(hexNum(bf.fill), 0xe4e7f0, 0.8) : hexNum(bf.fill) });
            };
            const edges = [];
            const posEdges = []; const posFill = []; const posTags = []; // las posiciones (paso Posiciones): bordes, relleno suave y rótulos
            // Las piezas que caben en una posición: cada celda de la capa (cm) se levanta por todas sus capas; cajas instanciadas y cilindros instanciados (con un tope para no poner lenta la pantalla).
            const pcBoxes = []; const pcCyls = []; let pcCount = 0;
            const PIECE_COLORS = [0x2a9d8f, 0xa93fb8, 0xd98a1f];
            const PIECE_MAX = 30000;
            const addPieceVolumes = (pc, minX, minZ, sizeX, sizeZ, yBase) => {
                if (!pc || !Array.isArray(pc.cells) || !pc.box || !(pc.box.l > 0) || !(pc.box.w > 0) || !(pc.layers > 0) || pcCount + pc.cells.length * pc.layers > PIECE_MAX) return false;
                const fx = sizeX / pc.box.l; const fz = sizeZ / pc.box.w; const lh = (pc.layerHeight || 0) * 0.01;
                const col = PIECE_COLORS[Math.min(pc.level, 2)];
                for (let i = 0; i < pc.layers; i += 1) {
                    const y = yBase + (i + 0.5) * lh;
                    pc.cells.forEach((cell) => {
                        if (cell.r) pcCyls.push({ x: minX + cell.cx * fx, y, z: minZ + cell.cy * fz, r: cell.r * Math.min(fx, fz) * 0.96, h: lh * 0.97, c: col });
                        else pcBoxes.push({ x: minX + (cell.x + cell.l / 2) * fx, y, z: minZ + (cell.y + cell.w / 2) * fz, sx: cell.l * fx * 0.98, sy: lh * 0.97, sz: cell.w * fz * 0.98, c: col });
                    });
                }
                pcCount += pc.cells.length * pc.layers;
                return true;
            };
            const edgeBox = (x, y, z, sx, sy, sz, into) => {
                const x0 = x - sx / 2; const x1 = x + sx / 2; const y0 = y - sy / 2; const y1 = y + sy / 2; const z0 = z - sz / 2; const z1 = z + sz / 2;
                [[x0, y0, z0, x1, y0, z0], [x1, y0, z0, x1, y0, z1], [x1, y0, z1, x0, y0, z1], [x0, y0, z1, x0, y0, z0], [x0, y1, z0, x1, y1, z0], [x1, y1, z0, x1, y1, z1], [x1, y1, z1, x0, y1, z1], [x0, y1, z1, x0, y1, z0],
                    [x0, y0, z0, x0, y1, z0], [x1, y0, z0, x1, y1, z0], [x1, y0, z1, x1, y1, z1], [x0, y0, z1, x0, y1, z1]].forEach((e) => (into || edges).push(...e));
            };
            (layout.spaces || []).forEach((s) => {
                if (s.active === false || !(s.l > 0) || !(s.d > 0) || !(s.h > 0) || (hiddenAssets.has(s.id) && !dimHidden)) return;
                const cx = PX(s.x + s.l / 2); const cz = PZ(s.y + s.d / 2);
                const fl = FL(s.x + s.l / 2, s.y + s.d / 2); // el piso donde está parado
                const dimS = (!!focusSet && !focusSet.spaces.has(s.id)) || (dimHidden && hiddenAssets.has(s.id));
                const mute = (c) => (dimS ? mixHex(c, 0xe4e7f0, 0.8) : c);
                const lv = Math.max(1, s.levels || 1);
                // el color que se le puso en Formato de activo (sin relleno o sin color propio se queda con el de su tipo)
                const own = s.fmt && s.fmt.pattern !== 'none' && /^#[0-9a-fA-F]{6}$/.test(s.fmt.fill || '') ? parseInt(s.fmt.fill.slice(1), 16) : null;
                // Enfoque u Oculto con un nivel, una posición o un localizador elegido: de ESE activo solo se dibuja el nivel con la distribución de sus posiciones o, con un localizador, su posición con la distribución
                // de sus filas y profundidades, a la altura que tienen. Lo elegido se marca con el cuadro naranja de siempre (hlBox).
                // varios niveles (o espacios o posiciones) del mismo activo: cada uno se dibuja una vez (los repetidos se juntan)
                const fzsAll = focusLevels.filter((f) => f.mode === 'hide' && f.id === s.id);
                const fzKey = (f) => `${Number(f.n) || 1}|${Number(f.p) > 0 || f.only ? Number(f.c) || 0 : 0}|${Number(f.p) > 0 ? Number(f.p) : 0}`;
                const fzs = root.LayoutCalc && root.LayoutCalc.levelMeasures && root.LayoutCalc.bayMeasures ? fzsAll.filter((f, i) => fzsAll.findIndex((g2) => fzKey(g2) === fzKey(f)) === i) : [];
                if (fzs.length) {
                  let drawnBox = null; // lo que de este activo quedó dibujado: a eso se le toca y eso se marca al tocarlo (no el activo entero)
                  fzs.forEach((fzm) => {
                    const LCz = root.LayoutCalc;
                    const nz = Math.min(Math.max(1, Number(fzm.n) || 1), lv);
                    const slotsZ = LCz.levelSlots ? LCz.levelSlots(s, nz) : Math.max(1, Math.floor(s.slots || 1));
                    const cz1 = fzm.c ? Math.min(Math.max(1, Number(fzm.c) || 1), slotsZ) : 0;
                    const cont = cz1 && Number(fzm.p) > 0 && LCz.bayOf ? cz1 : 0; // con un localizador el cuadro es el espacio; si no, el nivel entero
                    const esp = !cont && cz1 && fzm.only ? cz1 : 0; // un espacio marcado en el Localizador (sin posición): solo ese espacio, no los demás del nivel
                    const one = cont || esp; // el espacio de un solo cuadro (con sus posiciones o sin ellas)
                    // cada espacio del nivel donde cae de verdad: su largo y su fondo propios, uno junto al otro de izquierda a derecha
                    const rects = LCz.levelBayRects ? LCz.levelBayRects(s, nz) : null;
                    const rc = one && rects ? rects[one - 1] : null;
                    const bx0 = rc ? s.x + rc.x : (one ? s.x + (one - 1) * (s.l / slotsZ) : s.x);
                    const blen = rc ? rc.l : (one ? s.l / slotsZ : s.l);
                    const depthZ = rc ? rc.w : s.d; // el fondo del cuadro enfocado
                    const by0 = rc ? s.y + rc.y : s.y; // y desde dónde empieza ese cuadro
                    const mAll = one ? LCz.bayMeasures(s, nz, one) : LCz.levelMeasures(s, nz);
                    // con un localizador se dibuja la distribución de las posiciones del espacio (cada una en su lugar y con sus medidas); si no, las divisiones del nivel
                    const contPos = cont && lastLayout ? posOf(s.id, nz, cont) : [];
                    const allMode = !!fzm.all && !cont; // el nivel entero con las posiciones de todos sus espacios (página pública)
                    const cols = contPos.length ? contPos.length : (esp ? 1 : slotsZ);
                    const sxP = blen / Math.max(mAll.l, 0.01); const szP = depthZ / Math.max(mAll.w, 0.01);
                    const yBot = fl + Math.max(mAll.floorH, 0.03);
                    const yTop = yBot + (mAll.beam > 0 ? mAll.beam : 0.06) + Math.max(mAll.h, 0.1);
                    const solid = s.type === 'pallet' || s.type === 'cabinet' || s.type === 'cold';
                    const postC = mute(s.type === 'rackpal' ? 0x3f6fb5 : 0x5d6b86);
                    const deckZ = mute(own !== null ? own : (s.type === 'rackpal' ? 0xe8892b : 0x93a0ba));
                    const blockC = mute(own !== null ? own : (s.type === 'pallet' ? WOOD : (s.type === 'cold' ? 0x8cc7e6 : 0x7f8c8d)));
                    const wC = blen / cols;
                    const gx = Math.min(0.02, wC * 0.1); const gz = 0.02;
                    if (allMode) {
                        for (let c2 = 1; c2 <= slotsZ; c2++) {
                            const mm = LCz.bayMeasures(s, nz, c2);
                            const r2 = rects ? rects[c2 - 1] : { x: (c2 - 1) * (s.l / slotsZ), y: 0, l: s.l / slotsZ, w: s.d };
                            const slotWz = r2.l;
                            const kxz = slotWz / Math.max(mm.l, 0.01); const kzz = r2.w / Math.max(mm.w, 0.01);
                            const beamC = mm.beam > 0 ? mm.beam : 0.06;
                            const yB = fl + Math.max(mm.floorH, 0.03);
                            const list = posOf(s.id, nz, c2);
                            (list.length ? list : [null]).forEach((pp) => {
                                const hC = Math.max(pp ? Math.min(pp.h, mm.h) : mm.h, 0.1);
                                const sxC = pp ? pp.l * kxz : slotWz; const szC = pp ? pp.w * kzz : s.d;
                                const xc = PX(pp ? s.x + r2.x + (pp.x + pp.l / 2) * kxz : s.x + r2.x + slotWz / 2);
                                const zc = PZ(pp ? s.y + r2.y + (pp.y + pp.w / 2) * kzz : s.y + s.d / 2);
                                if (solid) pushPiece(blk, xc, yB + (beamC + hC) / 2, zc, Math.max(sxC - gx, 0.02), beamC + hC, Math.max(szC - gz, 0.02), blockC, c2, false);
                                else pushPiece(dck, xc, yB + beamC / 2, zc, Math.max(sxC - gx, 0.02), beamC, Math.max(szC - gz, 0.02), deckZ, c2, false);
                            });
                        }
                    }
                    for (let ci = 0; ci < (allMode ? 0 : cols); ci++) {
                        const mm = one ? mAll : LCz.bayMeasures(s, nz, ci + 1); // cada espacio del nivel con sus propias medidas
                        const beamC = mm.beam > 0 ? mm.beam : 0.06;
                        const yB = fl + Math.max(mm.floorH, 0.03);
                        const pp = contPos[ci] || null; // la posición (en su lugar y con sus medidas) o, sin ella, todo el espacio
                        const hC = Math.max(pp ? Math.min(pp.h, mm.h) : mm.h, 0.1);
                        const rb = rects && !cont ? rects[esp ? esp - 1 : ci] : null; // el espacio del nivel con su largo y su fondo propios
                        const sxC = pp ? pp.l * sxP : (rb ? rb.l : wC); const szC = pp ? pp.w * szP : s.d;
                        const xc = PX(pp ? bx0 + (pp.x + pp.l / 2) * sxP : (rb ? s.x + rb.x + rb.l / 2 : bx0 + (ci + 0.5) * wC));
                        const zc = PZ(pp ? by0 + (pp.y + pp.w / 2) * szP : s.y + s.d / 2);
                        if (pp && cont && !solid) { const pcF = pieceMap.get(`${s.id}|${nz}|${cont}|${pp.num}`); if (pcF) addPieceVolumes(pcF, xc - sxC / 2, zc - szC / 2, sxC, szC, yB + beamC); }
                        if (solid) pushPiece(blk, xc, yB + (beamC + hC) / 2, zc, Math.max(sxC - gx, 0.02), beamC + hC, Math.max(szC - gz, 0.02), blockC, esp || ci + 1, false);
                        else pushPiece(dck, xc, yB + beamC / 2, zc, Math.max(sxC - gx, 0.02), beamC, Math.max(szC - gz, 0.02), deckZ, esp || ci + 1, false);
                        if (!solid && !contPos.length) { const dV = rb ? rb.w : s.d; bayVolume(xc, yB + beamC + hC / 2, PZ(s.y + (rb ? rb.y : 0) + dV / 2), Math.max(sxC - gx, 0.02), hC, Math.max(dV - gz, 0.02), esp || ci + 1); }
                    }
                    if (!solid) {
                        // postes: las cuatro esquinas del cuadro y uno delgado en cada división (adelante y atrás)
                        const postCols = contPos.length ? 1 : cols; // con las posiciones del espacio, solo las cuatro esquinas del cuadro
                        const edgeAt = (xi) => (rects && !one && !contPos.length ? (xi === 0 ? s.x : (xi >= postCols ? s.x + s.l : s.x + rects[xi - 1].x + rects[xi - 1].l)) : bx0 + xi * (blen / postCols)); // las divisiones, donde termina cada espacio
                        for (let xi = 0; xi <= postCols; xi++) {
                            const edge = xi === 0 || xi === postCols;
                            [by0, by0 + depthZ].forEach((zEdge, zi) => upr.push({ x: PX(edgeAt(xi)) + (xi === 0 ? 0.03 : (xi === postCols ? -0.03 : 0)), y: (yBot + yTop) / 2, z: PZ(zEdge) + (zi === 0 ? 0.03 : -0.03), sx: edge ? 0.06 : 0.04, sy: yTop - yBot, sz: edge ? 0.06 : 0.04, c: postC }));
                        }
                    }
                    const cage = { x: PX(bx0 + blen / 2), y: (yBot + yTop) / 2, z: PZ(by0 + depthZ / 2), sx: blen, sy: yTop - yBot, sz: depthZ };
                    drawnBox = mergeBox(drawnBox, cage);
                    addFocusContainer(cage);
                  });
                    spaceList.push({ s, x: cx, z: cz, fl, box: drawnBox });
                    return;
                }
                if (s.type === 'pallet') {
                    blk.push({ x: cx, y: 0.07 + fl, z: cz, sx: s.l, sy: 0.14, sz: s.d, c: mute(own !== null ? own : WOOD) });
                    const loadH = (s.h - 0.14) / lv;
                    if (!dimS) for (let k = 0; k < lv; k++) edgeBox(cx, fl + 0.14 + k * loadH + loadH / 2, cz, s.l - 0.04, loadH - 0.04, s.d - 0.04);
                } else if (s.type === 'cabinet' || s.type === 'cold') {
                    blk.push({ x: cx, y: s.h / 2 + fl, z: cz, sx: s.l, sy: s.h, sz: s.d, c: mute(own !== null ? own : (s.type === 'cold' ? 0x8cc7e6 : 0x7f8c8d)) });
                } else {
                    const upC = mute(s.type === 'rackpal' ? 0x3f6fb5 : 0x5d6b86);
                    const deckC = mute(own !== null ? own : (s.type === 'rackpal' ? 0xe8892b : 0x93a0ba));
                    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([ix, iz]) => upr.push({ x: cx + ix * Math.max(0, s.l / 2 - 0.03), y: s.h / 2 + fl, z: cz + iz * Math.max(0, s.d / 2 - 0.03), sx: 0.06, sy: s.h, sz: 0.06, c: upC }));
                    // La repisa (reja) de cada nivel va a su altura del piso (paso Niveles: la del nivel 1 se escribe y las demás se calculan) y mide de grueso lo que mide su ceja (sin ceja, 6 cm); todos los espacios del nivel van a
                    // esa misma altura (una sola repisa de todo el largo). Sin LayoutCalc se reparten parejas como siempre.
                    const LCx = root.LayoutCalc;
                    const deckAt = (xc, sx, m, color, bayNo, dimIt) => { const th = m.beam > 0 ? m.beam : 0.06; pushPiece(dck, xc, fl + Math.max(m.floorH, 0.03) + th / 2, cz, sx, th, s.d, color === undefined ? deckC : color, bayNo || 0, dimIt); };
                    for (let k = 1; k <= lv; k++) {
                        // con un nivel enfocado en este activo, los demás niveles se apagan (tenue) o se quitan (oculto)
                        const mineFx = focusLevels.filter((f) => f.id === s.id);
                        const otherLevel = mineFx.length > 0 && !mineFx.some((f) => (Number(f.n) || 1) === k);
                        if (otherLevel && mineFx[0].mode === 'hide') continue;
                        const lvColor = otherLevel ? mixHex(deckC, 0xe4e7f0, 0.8) : deckC;
                        if (!(LCx && LCx.levelMeasures && LCx.bayMeasures)) { dck.push({ x: cx, y: 0.15 + (k - 1) * ((s.h - 0.3) / lv) + fl, z: cz, sx: s.l, sy: 0.06, sz: s.d, c: deckC }); continue; }
                        // todos los espacios de un nivel van a la misma altura (la del nivel): una sola repisa de todo el largo, con el color de su nivel
                        deckAt(cx, s.l, LCx.levelMeasures(s, k), lvColor);
                        // con el paso Espacios encendido cada espacio se ve como un VOLUMEN (largo × fondo × alto, el espacio libre encima de la ceja) con el color y la trama de su número, aparte del color del nivel
                        if (bayFmtOn && LCx.levelSlots && LCx.bayMeasures && !otherLevel) {
                            const slotsK = LCx.levelSlots(s, k);
                            const rectsK = LCx.levelBayRects ? LCx.levelBayRects(s, k) : null;
                            for (let c = 1; c <= slotsK; c++) {
                                const mb = LCx.bayMeasures(s, k, c);
                                const rk = rectsK ? rectsK[c - 1] : { x: (c - 1) * (s.l / slotsK), y: 0, l: s.l / slotsK, w: s.d };
                                const thB = mb.beam > 0 ? mb.beam : 0.06;
                                const hB = Math.max(mb.h, 0.05);
                                bayVolume(cx - s.l / 2 + rk.x + rk.l / 2, fl + Math.max(mb.floorH, 0.03) + thB + hB / 2, cz - s.d / 2 + rk.y + rk.w / 2, Math.max(rk.l - 0.02, 0.02), hB, Math.max(rk.w - 0.02, 0.02), c);
                            }
                        }
                        // con el paso Posiciones encendido cada posición se ve en su lugar y con sus medidas (largo × fondo × alto, sobre la ceja de su nivel), con su rótulo P001…
                        if (posOn && LCx.levelSlots && LCx.bayMeasures && !otherLevel) {
                            const slotsP = LCx.levelSlots(s, k);
                            const rectsP = LCx.levelBayRects ? LCx.levelBayRects(s, k) : null;
                            for (let c = 1; c <= slotsP; c++) {
                                const mb = LCx.bayMeasures(s, k, c);
                                const rk = rectsP ? rectsP[c - 1] : { x: (c - 1) * (s.l / slotsP), y: 0, l: s.l / slotsP, w: s.d };
                                const kxP = rk.l / Math.max(mb.l, 0.01); const kzP = rk.w / Math.max(mb.w, 0.01);
                                const yBase = fl + Math.max(mb.floorH, 0.03) + (mb.beam > 0 ? mb.beam : 0.06);
                                posOf(s.id, k, c).forEach((p) => {
                                    const hP = Math.max(Math.min(p.h, mb.h), 0.05);
                                    const xP = cx - s.l / 2 + rk.x + (p.x + p.l / 2) * kxP; const zP = cz - s.d / 2 + rk.y + (p.y + p.w / 2) * kzP;
                                    const sxP2 = Math.max(p.l * kxP - 0.01, 0.02); const szP2 = Math.max(p.w * kzP - 0.01, 0.02);
                                    edgeBox(xP, yBase + hP / 2, zP, sxP2, hP, szP2, posEdges);
                                    const pcA = pieceMap.get(`${s.id}|${k}|${c}|${p.num}`);
                                    const withPieces = !!pcA && addPieceVolumes(pcA, cx - s.l / 2 + rk.x + p.x * kxP, cz - s.d / 2 + rk.y + p.y * kzP, p.l * kxP, p.w * kzP, yBase);
                                    if (!withPieces) posFill.push({ x: xP, y: yBase + hP / 2, z: zP, sx: sxP2, sy: hP, sz: szP2, c: 0x1fa89a });
                                    posTags.push({ text: `P${String(p.num).padStart(3, '0')}`, x: xP, y: yBase + hP + 0.09, z: zP });
                                });
                            }
                        }
                    }
                }
                spaceList.push({ s, x: cx, z: cz, fl });
            });
            const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
            instanced(group.assets, upr, mat);
            instanced(group.assets, dck, mat);
            instanced(group.assets, blk, mat);
            volBoxes.forEach((vb) => {
                const plain = vb.fmt.pattern === 'solid' || vb.fmt.pattern === 'none';
                // una barra cúbica de su color un poco desvanecido (suavizado hacia el blanco y algo traslúcido, para ver lo que tiene detrás), con las aristas de su borde bien marcadas
                const vm = plain
                    ? new THREE.MeshLambertMaterial({ color: new THREE.Color(vb.fmt.fill).lerp(new THREE.Color(0xffffff), 0.18), transparent: true, opacity: 0.68, depthWrite: false })
                    : new THREE.MeshLambertMaterial({ map: patternTexture(vb.fmt.fill, vb.fmt.pattern, vb.fmt.pcolor), transparent: true, opacity: 0.75, depthWrite: false });
                const geo = new THREE.BoxGeometry(vb.sx, vb.sy, vb.sz);
                const mesh = new THREE.Mesh(geo, vm);
                mesh.position.set(vb.x, vb.y, vb.z);
                mesh.raycast = () => {}; // el volumen no tapa los toques al activo
                group.assets.add(mesh);
                if (vb.fmt.line !== 'none') {
                    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: new THREE.Color(vb.fmt.bcolor) }));
                    edges.position.copy(mesh.position);
                    edges.raycast = () => {};
                    group.assets.add(edges);
                }
            });
            patDecks.forEach((pd) => {
                const tex = patternTexture(pd.fmt.fill, pd.fmt.pattern, pd.fmt.pcolor);
                const pm = new THREE.MeshLambertMaterial({ map: tex });
                if (pd.dim) pm.color = new THREE.Color(0xdfe2ec);
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(pd.sx, pd.sy, pd.sz), pm);
                mesh.position.set(pd.x, pd.y, pd.z);
                group.assets.add(mesh);
            });
            if (pcBoxes.length) { const pb = instanced(group.assets, pcBoxes, mat); if (pb) pb.raycast = () => {}; }
            if (pcCyls.length) {
                const cm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 14), mat, pcCyls.length);
                const dm = new THREE.Object3D();
                const colr = new THREE.Color();
                pcCyls.forEach((e, i) => { dm.position.set(e.x, e.y, e.z); dm.scale.set(e.r, e.h, e.r); dm.updateMatrix(); cm.setMatrixAt(i, dm.matrix); cm.setColorAt(i, colr.setHex(e.c)); });
                cm.instanceMatrix.needsUpdate = true;
                cm.instanceColor.needsUpdate = true;
                cm.raycast = () => {};
                group.assets.add(cm);
            }
            if (posFill.length) {
                const pf = instanced(group.assets, posFill, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
                if (pf) pf.raycast = () => {}; // las posiciones no tapan los toques al activo
                const pg = new THREE.BufferGeometry();
                pg.setAttribute('position', new THREE.Float32BufferAttribute(posEdges, 3));
                const pl = new THREE.LineSegments(pg, new THREE.LineBasicMaterial({ color: 0x0e7c70 }));
                pl.raycast = () => {};
                group.assets.add(pl);
                // los rótulos solo cuando son pocos (con muchas posiciones taparían todo; en el croquis plano se ven al acercarse)
                if (posTags.length <= MAX_POS_LABELS) posTags.forEach((tg) => addLabel(group.spaceLabels, tg.text, tg.x, tg.y, tg.z, 0.14, false));
            }
            if (edges.length) {
                const eg = new THREE.BufferGeometry();
                eg.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
                group.assets.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x8a5a34 })));
            }
            if (spaceList.length) {
                hitSpaces = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }), spaceList.length);
                const dummy = new THREE.Object3D();
                spaceList.forEach((e, i) => { if (e.box) { dummy.position.set(e.box.x, e.box.y, e.box.z); dummy.scale.set(e.box.sx, e.box.sy, e.box.sz); } else { dummy.position.set(e.x, e.s.h / 2 + e.fl, e.z); dummy.scale.set(e.s.l, e.s.h, e.s.d); } dummy.updateMatrix(); hitSpaces.setMatrixAt(i, dummy.matrix); });
                hitSpaces.instanceMatrix.needsUpdate = true;
                group.assets.add(hitSpaces);
            }
            if (spaceList.length <= MAX_SPACE_LABELS) spaceList.forEach((e) => { if ((!focusSet || focusSet.spaces.has(e.s.id)) && !hiddenAssets.has(e.s.id)) addLabel(group.spaceLabels, e.s.code, e.x, e.s.h + 0.4 + e.fl, e.z, 0.38, false); });

            applyVisibility();
            if (!placed) { placed = true; go(viewTarget('general'), false); }
        }

        function setLabels(on) { labelsOn = !!on; applyVisibility(); }
        function setLayer(name, on) { if (LAYER_NAMES.includes(name)) { layerOn[name] = !!on; applyVisibility(); } }
        // Elegir qué activos se ven: ids = los que se ocultan. rebuild = false cuando enseguida se llama a update (así no se arma dos veces).
        function setHiddenAssets(ids, rebuild, dim) {
            hiddenAssets = new Set(ids || []);
            dimHidden = !!dim;
            if (rebuild !== false && lastLayout) update(lastLayout);
        }
        // Marcar lo que se eligió en una tabla del editor (sel = { kind, id, strong }) o quitar la marca (null).
        function highlight(sel) {
            const list = Array.isArray(sel) ? sel : (sel ? [sel] : []);
            hls = list.filter((e) => e && e.id).map((e) => ({ kind: e.kind, id: e.id, strong: !!e.strong, n: e.n, c: e.c, f: e.f, p: e.p, all: !!e.all }));
            hl = hls[0] || null;
            applyHl();
        }
        // Acercar la cámara a lo que está marcado (un nivel, una posición o un localizador): la distancia sale de lo que mide.
        function focusOn() {
            const b = focusContainer || hlBox();
            if (!b) return;
            go({ tx: b.x, ty: b.y, tz: b.z, r: clamp(Math.max(b.sx, b.sy, b.sz, 0.5) * 2.4 + 1.2, 3, bounds.diag * 6) }, true);
        }
        function setView(name) { go(viewTarget(name), true); }
        function zoom(factor) { st.r = clamp(st.r / factor, 3, bounds.diag * 6); applyCam(); }

        // ---- girar, acercar, mover y tocar
        const ptrs = new Map();
        let moved = 0;
        let lastPinch = 0;
        const pinch = () => { const p = [...ptrs.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
        const onContext = (e) => e.preventDefault();
        const onDown = (e) => {
            canvas.setPointerCapture(e.pointerId);
            ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
            moved = 0;
            if (ptrs.size === 2) lastPinch = pinch() || 1;
        };
        const onMove = (e) => {
            const p = ptrs.get(e.pointerId);
            if (!p) return;
            const dx = e.clientX - p.x; const dy = e.clientY - p.y;
            p.x = e.clientX; p.y = e.clientY;
            moved += Math.abs(dx) + Math.abs(dy);
            if (ptrs.size === 2) { const d = pinch() || 1; st.r = clamp(st.r * lastPinch / d, 3, bounds.diag * 6); lastPinch = d; applyCam(); return; }
            if (e.buttons & 2 || e.shiftKey) {
                const k = st.r * 0.0016;
                st.tx -= (Math.cos(st.theta) * dx + Math.sin(st.theta) * dy) * k;
                st.tz -= (-Math.sin(st.theta) * dx + Math.cos(st.theta) * dy) * k;
            } else {
                st.theta -= dx * 0.006;
                st.phi = clamp(st.phi - dy * 0.006, 0.02, 1.55);
            }
            applyCam();
        };
        const raycaster = new THREE.Raycaster();
        function pick(e) {
            const r = canvas.getBoundingClientRect();
            raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
            // una capa oculta no se puede tocar
            let hit = hitSpaces && layerOn.assets ? raycaster.intersectObject(hitSpaces)[0] : null;
            let payload = null;
            let box = null;
            if (hit && hit.instanceId !== undefined) {
                const e2 = spaceList[hit.instanceId];
                payload = { kind: 'space', space: e2.s };
                box = e2.box ? { ...e2.box } : { x: e2.x, y: e2.s.h / 2 + e2.fl, z: e2.z, sx: e2.s.l, sy: e2.s.h, sz: e2.s.d };
            } else {
                // sin activo debajo del toque: la losa de una huella y, si no, la de una zona (una capa oculta no se puede tocar)
                const fh = layerOn.footprints && fpMeshes.length ? raycaster.intersectObjects(fpMeshes)[0] : null;
                const zh = !fh && layerOn.zones ? raycaster.intersectObjects(zoneMeshes)[0] : null;
                const found = fh || zh;
                if (found) {
                    const b = new THREE.Box3().setFromObject(found.object);
                    const c = b.getCenter(new THREE.Vector3());
                    const sz = b.getSize(new THREE.Vector3());
                    payload = fh ? { kind: 'footprint', footprint: found.object.userData.footprint } : { kind: 'zone', zone: found.object.userData.zone };
                    box = { x: c.x, y: c.y, z: c.z, sx: sz.x, sy: Math.max(sz.y, 0.1), sz: sz.z };
                } else if (contourPickMode && layerOn.contour && contourHits.length) {
                    // sin nada debajo del toque: un lado o una esquina del contorno (el editor marca su renglón y lo resalta; aquí no se dibuja el cuadro de selección)
                    const ch = raycaster.intersectObjects(contourHits)[0];
                    if (ch) payload = { kind: ch.object.userData.kind, index: ch.object.userData.index };
                }
            }
            if (box) { outline.visible = true; outline.position.set(box.x, box.y, box.z); outline.scale.set(box.sx + 0.06, box.sy + 0.06, box.sz + 0.06); } else outline.visible = false;
            dirty = true;
            if (options.onSelect) options.onSelect(payload);
        }
        const onUp = (e) => { if (ptrs.size === 1 && moved < 6) pick(e); ptrs.delete(e.pointerId); };
        const onCancel = (e) => ptrs.delete(e.pointerId);
        // Igual que el croquis en 2D: sin Ctrl la rueda sigue moviendo la página.
        const onWheel = (e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            st.r = clamp(st.r * (1 + e.deltaY * 0.0012), 3, bounds.diag * 6);
            applyCam();
        };
        canvas.addEventListener('contextmenu', onContext);
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', onUp);
        canvas.addEventListener('pointercancel', onCancel);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        function resize() {
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            cam.aspect = w / h;
            cam.updateProjectionMatrix();
            dirty = true;
        }
        const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
        if (ro) ro.observe(container);
        resize();
        applyCam();
        const loop = () => {
            if (destroyed) return;
            if (dirty) { dirty = false; renderer.render(scene, cam); }
            requestAnimationFrame(loop);
        };
        loop();

        function destroy() {
            destroyed = true;
            cancelAnimationFrame(anim);
            if (ro) ro.disconnect();
            canvas.removeEventListener('contextmenu', onContext);
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup', onUp);
            canvas.removeEventListener('pointercancel', onCancel);
            canvas.removeEventListener('wheel', onWheel);
            Object.keys(group).forEach((n) => clearGroup(group[n]));
            textureCache.forEach((e) => e.tex.dispose());
            patTex.forEach((tx) => tx.dispose());
            renderer.dispose();
            canvas.remove();
        }
        return { update, setLabels, setLayer, setHiddenAssets, highlight, focusOn, setView, zoom, resize, destroy, canvas, layers: LAYER_NAMES.slice(), measuredCount: () => measuredGroup.children.length / 2 };
    }

    root.LayoutScene3D = { create, LAYERS: LAYER_NAMES.slice() };
})(typeof window !== 'undefined' ? window : globalThis);
