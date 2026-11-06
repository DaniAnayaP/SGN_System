// ---------------------------------------------------------------------------
// Vista 3D del Layout (Operaciones, C. Distribución, y la página pública del QR). Levanta en 3D lo MISMO que se ve en el croquis: el contorno con la altura de cada esquina, las puertas y las
// conexiones de luz en sus paredes, las columnas, las zonas (con el color que se les puso) y los espacios (anaqueles, anaqueles con tarimas, gabinetes y tarimas) con sus medidas y niveles.
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
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a93a8, 0.62));
        const sun = new THREE.DirectionalLight(0xffffff, 0.5);
        scene.add(sun);
        // Un grupo por capa: así cada una se muestra u oculta sola.
        const group = {};
        ['floor', 'contour', 'walls', 'doors', 'power', 'sensors', 'columns', 'zones', 'footprints', 'assets', 'objects', 'transit', 'safety', 'zoneLabels', 'spaceLabels', 'sensorLabels'].forEach((name) => { group[name] = new THREE.Group(); scene.add(group[name]); });
        const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xff7a1a }));
        outline.visible = false;
        scene.add(outline);
        // Lo elegido en las tablas del editor (highlight): el mismo contorno naranja, siempre a la vista aunque otro activo lo tape; el fuerte lleva un segundo contorno más ancho.
        const hlLines = [0, 1].map(() => {
            const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xff7a1a, depthTest: false, transparent: true }));
            l.visible = false;
            l.renderOrder = 10;
            scene.add(l);
            return l;
        });

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
        let hl = null; // lo resaltado: { kind: 'zone' | 'footprint' | 'space' | 'bay', id, strong }
        const textureCache = new Map();

        const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
        const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
        // Un color (0xRRGGBB) mezclado con otro: k = cuánto del otro (0 = el mismo, 1 = el otro). Sirve para ver «tenue» lo que no se enfocó.
        const mixHex = (c, to, k) => { const r = (c >> 16) & 255; const g = (c >> 8) & 255; const b = c & 255; const R = (to >> 16) & 255; const G = (to >> 8) & 255; const B = to & 255; return (Math.round(r + (R - r) * k) << 16) | (Math.round(g + (G - g) * k) << 8) | Math.round(b + (B - b) * k); };

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
                const hh = hit.o.kind === 'step' ? Math.max(Math.abs(Number(hit.o.dz) || 0), 0.12) : Math.max(bounds.maxH, 1);
                return { x: PX((x0 + x1) / 2), y: hh / 2, z: PZ((y0 + y1) / 2), sx: Math.max(x1 - x0, 0.1), sy: hh, sz: Math.max(y1 - y0, 0.1) };
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
                return { x: PX((dg.a.x + dg.b.x) / 2), y: isDoor ? h / 2 : Math.max(0.2, Number(e.height) || 0.4), z: PZ((dg.a.y + dg.b.y) / 2), sx: Math.abs(dg.ux) * w + Math.abs(dg.uy) * thick, sy: h, sz: Math.abs(dg.uy) * w + Math.abs(dg.ux) * thick };
            }
            // un sensor elegido en la tabla de Sensores: un cubo alrededor del disco, pegado a su pared
            if (hl.kind === 'sensor') {
                const e = (lastLayout.sensors || []).find((x) => x.id === hl.id);
                if (!e || !layerOn.sensors) return null;
                const sg = root.LayoutCalc && root.LayoutCalc.doorGeometry ? root.LayoutCalc.doorGeometry(lastLayout, { ...e, width: 0 }) : null;
                if (!sg) return null;
                return { x: PX(sg.a.x), y: Math.max(0.2, Number(e.height) || 1.5), z: PZ(sg.a.y), sx: 0.6, sy: 0.6, sz: 0.6 };
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
            const box = hlBox();
            hlLines.forEach((l, i) => {
                const grow = i === 0 ? 0.06 : 0.2;
                l.visible = !!box && (i === 0 || hl.strong);
                if (box) { l.position.set(box.x, box.y, box.z); l.scale.set(box.sx + grow, box.sy + grow, box.sz + grow); }
            });
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

        // ---- arma la escena con el Layout (metros; el centro de la nave queda en el origen)
        function update(layout, opts) {
            if (opts && typeof opts.labels === 'boolean') labelsOn = opts.labels;
            if (opts && opts.layers) LAYER_NAMES.forEach((n) => { if (typeof opts.layers[n] === 'boolean') layerOn[n] = opts.layers[n]; });
            if (opts && 'contourPick' in opts) contourPickMode = opts.contourPick === 'sides' || opts.contourPick === 'corners' ? opts.contourPick : null;
            if (opts && 'focus' in opts) focusSet = opts.focus || null;
            if (opts && 'openings' in opts) openingsOn = !!opts.openings;
            if (opts && 'levels' in opts) levelsOn = !!opts.levels;
            if (opts && 'clashDoors' in opts) clashSet = new Set(opts.clashDoors || []);
            lastLayout = layout;
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
            const xs = V.map((p) => p[0]);
            const ys = V.map((p) => p[1]);
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
            bounds = { diag: Math.max(10, Math.hypot(maxX - minX, maxY - minY)), maxH, sx: maxX - minX, sy: maxY - minY };

            // piso (siempre se ve: es la forma de la nave)
            try {
                const shape = new THREE.Shape(V.map((p) => new THREE.Vector2(p[0], p[1])));
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
                    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
                };
                return [mk(0, half, sides.a, 0x6f84b3), mk(-half, 0, sides.b, 0x566a98)];
            };
            shapes3.filter(({ o }) => o.kind === 'wall').forEach(({ o, g }) => {
                // la pared sube de la altura de su inicio a la de su final (de fábrica, la del contorno en cada extremo); con 4 esquinas se arma con la parte de arriba inclinada
                const ax = root.LayoutCalc && root.LayoutCalc.wallAxis ? root.LayoutCalc.wallAxis(layout, o) : null;
                const wsides = ax && root.LayoutCalc.wallSides ? root.LayoutCalc.wallSides(layout, o, ax) : null;
                if (ax && wsides && wsides.stepped) {
                    const meshes = halfWalls(ax, wsides);
                    if (meshes.length) { meshes.forEach((m) => group.walls.add(m)); return; }
                }
                const wallH = ax ? ax.height : (o.mode === 'contour' ? (cornerH[(Math.max(1, Number(o.wall)) - 1) % V.length] + cornerH[Math.max(1, Number(o.wall)) % V.length]) / 2 : avgH);
                const geo = ax && ax.length > 0 && g.pts.length === 4 && Math.abs(ax.hStart - ax.hEnd) > 0.005 ? slopedPrism(g.pts, ax) : prism(g.pts, wallH, 0);
                if (geo) group.walls.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x6f84b3, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })));
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
                const dg = root.LayoutCalc && root.LayoutCalc.doorGeometry ? root.LayoutCalc.doorGeometry(layout, d) : null;
                if (!dg) return;
                const w = Math.max(0.3, Number(d.width) || 1);
                const h = Math.max(0.5, Number(d.height) || 2.1);
                const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, Math.max(0.2, dg.thick + 0.04)), lam(DOOR_COLOR[d.type] || DOOR_COLOR.staff));
                m.position.set(PX((dg.a.x + dg.b.x) / 2), h / 2, PZ((dg.a.y + dg.b.y) / 2));
                m.rotation.y = -Math.atan2(dg.uy, dg.ux);
                group.doors.add(m);
                // el espacio que necesita al abrir: sobre el piso (cuarto de círculo del giro o franja del recorrido), con su contorno, y la hoja ya abierta, transparente
                const op = openingsOn && root.LayoutCalc && root.LayoutCalc.doorOpening ? root.LayoutCalc.doorOpening(layout, d) : null;
                if (op) {
                    const col = clashSet.has(d.id) ? 0xc0392b : (op.type === 'swing' ? 0xa63fb5 : 0x2f7fc7);
                    const shape = new THREE.Shape(op.pts.map((p) => new THREE.Vector2(PX(p[0]), -PZ(p[1]))));
                    const flat = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
                    flat.rotation.x = -Math.PI / 2;
                    flat.position.y = 0.03;
                    group.doors.add(flat);
                    group.doors.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(op.pts.map((p) => new THREE.Vector3(PX(p[0]), 0.05, PZ(p[1])))), new THREE.LineBasicMaterial({ color: col })));
                    const a = op.type === 'swing' ? op.leaf : op.travel;
                    const dx = a[1][0] - a[0][0];
                    const dz = a[1][1] - a[0][1];
                    const len = Math.hypot(dx, dz);
                    const side = op.type === 'swing' ? 0.06 : root.LayoutCalc.SLIDE_DEPTH * 0.8;
                    const cx = op.type === 'swing' ? (a[0][0] + a[1][0]) / 2 : op.pts.reduce((acc, p) => acc + p[0], 0) / op.pts.length;
                    const cz = op.type === 'swing' ? (a[0][1] + a[1][1]) / 2 : op.pts.reduce((acc, p) => acc + p[1], 0) / op.pts.length;
                    if (len > 0.05) {
                        const leaf = new THREE.Mesh(new THREE.BoxGeometry(len, h, side), new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: 0.45, depthWrite: false }));
                        leaf.position.set(PX(cx), h / 2, PZ(cz));
                        leaf.rotation.y = -Math.atan2(dz, dx);
                        group.doors.add(leaf);
                    }
                }
            });
            // una conexión de luz va sobre su pared: por el centro de la pared y un poco más gruesa que ella
            (layout.power || []).forEach((e) => {
                const pg = root.LayoutCalc && root.LayoutCalc.doorGeometry ? root.LayoutCalc.doorGeometry(layout, { ...e, width: 0 }) : null;
                if (!pg) return;
                const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, Math.max(0.16, pg.thick + 0.04)), lam(POWER_COLOR[e.type] || POWER_COLOR.outlet110));
                m.position.set(PX(pg.a.x), Math.max(0.2, Number(e.height) || 0.4), PZ(pg.a.y));
                m.rotation.y = -Math.atan2(pg.uy, pg.ux);
                group.power.add(m);
            });
            // un sensor (de temperatura y/o humedad) va sobre su pared, a su altura del piso: un disco turquesa pegado a la pared (como el del croquis) con su código arriba
            (layout.sensors || []).forEach((e) => {
                const sg = root.LayoutCalc && root.LayoutCalc.doorGeometry ? root.LayoutCalc.doorGeometry(layout, { ...e, width: 0 }) : null;
                if (!sg) return;
                const y = Math.max(0.2, Number(e.height) || 1.5);
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
                if (o.kind === 'step') {
                    // desnivel: una losa sobre el piso con su altura (si es más baja que el piso, una placa delgada de otro color)
                    const dz = Number(o.dz) || 0;
                    const geo = prism(g.pts, dz > 0 ? dz : 0.03, 0);
                    if (geo) group.columns.add(new THREE.Mesh(geo, lam(dz > 0 ? 0xcdb4e4 : 0x9a74bd)));
                    return;
                }
                const geo = prism(g.pts, avgH, 0);
                if (geo) group.columns.add(new THREE.Mesh(geo, lam(o.kind === 'other' ? 0x7b8196 : 0x3a3f4d)));
            });

            // zonas: losas de color (el que se les puso en Formato de zona, o el de su tipo)
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
                    for (let k = 1; k < p.length - 1; k++) {
                        [p[0], p[k], p[k + 1]].forEach((v) => pos.push(PX(v[0]), lift + (pc.floor ? LCalc.zoneLevelAt(pc.floor, v[0], v[1]) : 0), PZ(v[1])));
                    }
                });
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                geo.computeVertexNormals();
                return geo;
            };
            // Cada piso: sus cuatro lados bajan hasta el piso de la nave (en una rampa, el lado alto es más alto que el bajo).
            if (anyLevel) {
                floors.forEach((f, i) => {
                    const corners = [[f.x, f.y], [f.x + f.l, f.y], [f.x + f.l, f.y + f.w], [f.x, f.y + f.w]];
                    const arr = [];
                    for (let k = 0; k < 4; k++) {
                        const p = corners[k]; const q = corners[(k + 1) % 4];
                        const tp = 0.05 + 0.004 * i + LCalc.zoneLevelAt(f, p[0], p[1]); const tq = 0.05 + 0.004 * i + LCalc.zoneLevelAt(f, q[0], q[1]);
                        arr.push(PX(p[0]), 0, PZ(p[1]), PX(q[0]), 0, PZ(q[1]), PX(q[0]), tq, PZ(q[1]), PX(p[0]), 0, PZ(p[1]), PX(q[0]), tq, PZ(q[1]), PX(p[0]), tp, PZ(p[1]));
                    }
                    const sides = new THREE.BufferGeometry();
                    sides.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
                    sides.computeVertexNormals();
                    group.zones.add(new THREE.Mesh(sides, new THREE.MeshLambertMaterial({ color: 0xb9a9bf, side: THREE.DoubleSide })));
                });
            }
            (layout.zones || []).forEach((z, i) => {
                const pts = Array.isArray(z.pts) && z.pts.length >= 3 ? z.pts : [[z.x, z.y], [z.x + z.l, z.y], [z.x + z.l, z.y + z.w], [z.x, z.y + z.w]];
                if (!(z.l > 0 || (z.pts && z.pts.length >= 3))) return;
                const color = (z.fmt && z.fmt.fill) || DEFAULT_ZONE_FILL[z.type || 'none'] || DEFAULT_ZONE_FILL.none;
                const inactive = z.active === false;
                const dimZone = !!focusSet && !focusSet.zones.has(z.id);
                const zoneMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), transparent: inactive || dimZone, opacity: inactive ? 0.35 : (dimZone ? 0.22 : 1) });
                let geo = null;
                if (anyLevel && LCalc.floorsOfZone(layout, z).some((f) => floors.some((g) => g.id === f.id))) {
                    try {
                        const pieces = zonePieces(pts);
                        if (pieces && pieces.length) { geo = piecesGeometry(pieces, i); zoneMat.side = THREE.DoubleSide; }
                    } catch (err) { geo = null; }
                }
                if (!geo) {
                    try {
                        geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1]))), { depth: 0.05, bevelEnabled: false });
                    } catch (err) { return; }
                    geo.rotateX(Math.PI / 2);
                    geo.translate(-CX, 0.05 + 0.004 * i, -CY);
                }
                const mesh = new THREE.Mesh(geo, zoneMat);
                mesh.userData = { kind: 'zone', zone: z };
                group.zones.add(mesh);
                zoneMeshes.push(mesh);
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
                if (!(p.l > 0) || !(p.w > 0)) return;
                const slab = new THREE.Mesh(new THREE.BoxGeometry(p.l, 0.02, p.w), new THREE.MeshLambertMaterial({ color: p.type === 'between' ? 0xe3e6ef : 0xc4c9db }));
                slab.position.set(PX(p.x + p.l / 2), transitY + 0.002 * i + FL(p.x + p.l / 2, p.y + p.w / 2), PZ(p.y + p.w / 2));
                group.transit.add(slab);
            });
            // objetos (paso Objetos): personas y montacargas a escala, girados hacia donde miran (foto fija del plano)
            (layout.objects || []).forEach((o) => {
                const l = Math.max(Number(o.l) || 0.3, 0.1);
                const w = Math.max(Number(o.w) || 0.3, 0.1);
                const h = Math.max(Number(o.h) || 1, 0.2);
                const g = new THREE.Group();
                if (o.type === 'forklift') {
                    const body = new THREE.Mesh(new THREE.BoxGeometry(l * 0.72, h * 0.42, w), lam(0xf2c230));
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
                    const crate = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), lam(0x9aa0b5));
                    crate.position.set(0, h / 2, 0);
                    g.add(crate);
                } else {
                    const bodyH = Math.max(h - 0.3, 0.3);
                    const body = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, bodyH, 12), lam(0xe08a2e));
                    body.position.set(0, bodyH / 2, 0);
                    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), lam(0xf7c98b));
                    head.position.set(0, bodyH + 0.14, 0);
                    g.add(body, head);
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
                if (e.type === 'hydrant') {
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
            const upr = []; const dck = []; const blk = [];
            const edges = [];
            const edgeBox = (x, y, z, sx, sy, sz) => {
                const x0 = x - sx / 2; const x1 = x + sx / 2; const y0 = y - sy / 2; const y1 = y + sy / 2; const z0 = z - sz / 2; const z1 = z + sz / 2;
                [[x0, y0, z0, x1, y0, z0], [x1, y0, z0, x1, y0, z1], [x1, y0, z1, x0, y0, z1], [x0, y0, z1, x0, y0, z0], [x0, y1, z0, x1, y1, z0], [x1, y1, z0, x1, y1, z1], [x1, y1, z1, x0, y1, z1], [x0, y1, z1, x0, y1, z0],
                    [x0, y0, z0, x0, y1, z0], [x1, y0, z0, x1, y1, z0], [x1, y0, z1, x1, y1, z1], [x0, y0, z1, x0, y1, z1]].forEach((e) => edges.push(...e));
            };
            (layout.spaces || []).forEach((s) => {
                if (s.active === false || !(s.l > 0) || !(s.d > 0) || !(s.h > 0) || hiddenAssets.has(s.id)) return;
                const cx = PX(s.x + s.l / 2); const cz = PZ(s.y + s.d / 2);
                const fl = FL(s.x + s.l / 2, s.y + s.d / 2); // el piso donde está parado
                const dimS = !!focusSet && !focusSet.spaces.has(s.id);
                const mute = (c) => (dimS ? mixHex(c, 0xe4e7f0, 0.8) : c);
                const lv = Math.max(1, s.levels || 1);
                // el color que se le puso en Formato de activo (sin relleno o sin color propio se queda con el de su tipo)
                const own = s.fmt && s.fmt.pattern !== 'none' && /^#[0-9a-fA-F]{6}$/.test(s.fmt.fill || '') ? parseInt(s.fmt.fill.slice(1), 16) : null;
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
                    const pitch = (s.h - 0.3) / lv;
                    for (let k = 0; k < lv; k++) dck.push({ x: cx, y: 0.15 + k * pitch + fl, z: cz, sx: s.l, sy: 0.06, sz: s.d, c: deckC });
                }
                spaceList.push({ s, x: cx, z: cz, fl });
            });
            const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
            instanced(group.assets, upr, mat);
            instanced(group.assets, dck, mat);
            instanced(group.assets, blk, mat);
            if (edges.length) {
                const eg = new THREE.BufferGeometry();
                eg.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
                group.assets.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x8a5a34 })));
            }
            if (spaceList.length) {
                hitSpaces = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }), spaceList.length);
                const dummy = new THREE.Object3D();
                spaceList.forEach((e, i) => { dummy.position.set(e.x, e.s.h / 2 + e.fl, e.z); dummy.scale.set(e.s.l, e.s.h, e.s.d); dummy.updateMatrix(); hitSpaces.setMatrixAt(i, dummy.matrix); });
                hitSpaces.instanceMatrix.needsUpdate = true;
                group.assets.add(hitSpaces);
            }
            if (spaceList.length <= MAX_SPACE_LABELS) spaceList.forEach((e) => { if (!focusSet || focusSet.spaces.has(e.s.id)) addLabel(group.spaceLabels, e.s.code, e.x, e.s.h + 0.4 + e.fl, e.z, 0.38, false); });

            applyVisibility();
            if (!placed) { placed = true; go(viewTarget('general'), false); }
        }

        function setLabels(on) { labelsOn = !!on; applyVisibility(); }
        function setLayer(name, on) { if (LAYER_NAMES.includes(name)) { layerOn[name] = !!on; applyVisibility(); } }
        // Elegir qué activos se ven: ids = los que se ocultan. rebuild = false cuando enseguida se llama a update (así no se arma dos veces).
        function setHiddenAssets(ids, rebuild) {
            hiddenAssets = new Set(ids || []);
            if (rebuild !== false && lastLayout) update(lastLayout);
        }
        // Marcar lo que se eligió en una tabla del editor (sel = { kind, id, strong }) o quitar la marca (null).
        function highlight(sel) { hl = sel && sel.id ? { kind: sel.kind, id: sel.id, strong: !!sel.strong } : null; applyHl(); }
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
                box = { x: e2.x, y: e2.s.h / 2, z: e2.z, sx: e2.s.l, sy: e2.s.h, sz: e2.s.d };
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
            renderer.dispose();
            canvas.remove();
        }
        return { update, setLabels, setLayer, setHiddenAssets, highlight, setView, zoom, resize, destroy, canvas, layers: LAYER_NAMES.slice(), measuredCount: () => measuredGroup.children.length / 2 };
    }

    root.LayoutScene3D = { create, LAYERS: LAYER_NAMES.slice() };
})(typeof window !== 'undefined' ? window : globalThis);
