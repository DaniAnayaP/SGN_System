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
    const POWER_COLOR = { panel: 0x6b6f7c, outlet110: 0xf1c232, outlet220: 0xe8892b, 'three-phase': 0xd93a2f };
    const WOOD = 0xb98a52;
    const MAX_SPACE_LABELS = 300;
    const LAYER_NAMES = ['walls', 'doors', 'power', 'columns', 'zones', 'footprints', 'assets'];

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
        ['floor', 'walls', 'doors', 'power', 'columns', 'zones', 'footprints', 'assets', 'zoneLabels', 'spaceLabels'].forEach((name) => { group[name] = new THREE.Group(); scene.add(group[name]); });
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
        let hiddenAssets = new Set(); // ids de los espacios que NO se dibujan (los eligió quien ve el 3D)
        let lastLayout = null;
        let center = null; // el centro de la nave en el plano (el origen del 3D), para ubicar lo resaltado
        // Con el resto de la nave «tenue» (buscar una zona o una huella): ids de lo enfocado { zones, footprints, spaces } (Set); lo demás se dibuja apagado, sin rótulo ni aristas. null = todo normal.
        let focusSet = null;
        let hl = null; // lo resaltado: { kind: 'zone' | 'footprint' | 'space' | 'bay', id, strong }
        const textureCache = new Map();

        const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
        const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
        // Un color (0xRRGGBB) mezclado con otro: k = cuánto del otro (0 = el mismo, 1 = el otro). Sirve para ver «tenue» lo que no se enfocó.
        const mixHex = (c, to, k) => { const r = (c >> 16) & 255; const g = (c >> 8) & 255; const b = c & 255; const R = (to >> 16) & 255; const G = (to >> 8) & 255; const B = to & 255; return (Math.round(r + (R - r) * k) << 16) | (Math.round(g + (G - g) * k) << 8) | Math.round(b + (B - b) * k); };

        function applyVisibility() {
            group.walls.visible = layerOn.walls;
            group.doors.visible = layerOn.doors;
            group.power.visible = layerOn.power;
            group.columns.visible = layerOn.columns;
            group.zones.visible = layerOn.zones;
            group.footprints.visible = layerOn.footprints;
            group.assets.visible = layerOn.assets;
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
                return { x: PX((x0 + x1) / 2), y: 0.1, z: PZ((y0 + y1) / 2), sx: x1 - x0, sy: 0.2, sz: y1 - y0 };
            }
            if (hl.kind === 'footprint') {
                const f = (lastLayout.footprints || []).find((e) => e.id === hl.id);
                if (!f || f.active === false || !(f.l > 0) || !(f.d > 0) || !(layerOn.footprints || layerOn.assets)) return null;
                const mates = (lastLayout.spaces || []).filter((s) => s.footprintId === f.id && s.active !== false && s.h > 0 && !hiddenAssets.has(s.id));
                const h = layerOn.assets && mates.length ? Math.max(...mates.map((s) => s.h)) : 0.2;
                return { x: PX(f.x + f.l / 2), y: h / 2, z: PZ(f.y + f.d / 2), sx: f.l, sy: h, sz: f.d };
            }
            const s = (lastLayout.spaces || []).find((e) => e.id === hl.id);
            if (!s || s.active === false || !(s.l > 0) || !(s.d > 0) || !(s.h > 0) || hiddenAssets.has(s.id) || !layerOn.assets) return null;
            return { x: PX(s.x + s.l / 2), y: s.h / 2, z: PZ(s.y + s.d / 2), sx: s.l, sy: s.h, sz: s.d };
        }
        function applyHl() {
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
            if (opts && 'focus' in opts) focusSet = opts.focus || null;
            lastLayout = layout;
            Object.keys(group).forEach((n) => clearGroup(group[n]));
            outline.visible = false;
            hitSpaces = null;
            spaceList = [];
            zoneMeshes = [];
            fpMeshes = [];
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
            // El contorno solo es el marco (las aristas de arriba y las esquinas siguen marcando la forma del techo). Las PAREDES son obstáculos del contorno: cada una sube del piso al techo de su lado (o al promedio si va dentro de la nave).
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
            shapes3.filter(({ o }) => o.kind === 'wall').forEach(({ o, g }) => {
                const wallH = o.mode === 'contour' ? (cornerH[(Math.max(1, Number(o.wall)) - 1) % V.length] + cornerH[Math.max(1, Number(o.wall)) % V.length]) / 2 : avgH;
                const geo = prism(g.pts, wallH, 0);
                if (geo) group.walls.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x6f84b3, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })));
            });
            const lg = new THREE.BufferGeometry();
            lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
            group.walls.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x4a5f8f })));

            // puertas y conexiones de luz (la pared 1 va de la esquina 1 a la 2; dist es desde la esquina de inicio)
            (layout.doors || []).forEach((d) => {
                const seg = wallSegment(V, Number(d.wall) || 1);
                if (!seg.length) return;
                const w = Math.max(0.3, Number(d.width) || 1);
                const h = Math.max(0.5, Number(d.height) || 2.1);
                const along = (Number(d.dist) || 0) + w / 2;
                const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), lam(DOOR_COLOR[d.type] || DOOR_COLOR.staff));
                m.position.set(PX(seg.p[0] + seg.ux * along), h / 2, PZ(seg.p[1] + seg.uy * along));
                m.rotation.y = -Math.atan2(seg.uy, seg.ux);
                group.doors.add(m);
            });
            (layout.power || []).forEach((e) => {
                const seg = wallSegment(V, Number(e.wall) || 1);
                if (!seg.length) return;
                const along = Number(e.dist) || 0;
                const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.16), lam(POWER_COLOR[e.type] || POWER_COLOR.outlet110));
                m.position.set(PX(seg.p[0] + seg.ux * along), Math.max(0.2, Number(e.height) || 0.4), PZ(seg.p[1] + seg.uy * along));
                m.rotation.y = -Math.atan2(seg.uy, seg.ux);
                group.power.add(m);
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
            (layout.zones || []).forEach((z, i) => {
                const pts = Array.isArray(z.pts) && z.pts.length >= 3 ? z.pts : [[z.x, z.y], [z.x + z.l, z.y], [z.x + z.l, z.y + z.w], [z.x, z.y + z.w]];
                if (!(z.l > 0 || (z.pts && z.pts.length >= 3))) return;
                const color = (z.fmt && z.fmt.fill) || DEFAULT_ZONE_FILL[z.type || 'none'] || DEFAULT_ZONE_FILL.none;
                let geo;
                try {
                    geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1]))), { depth: 0.05, bevelEnabled: false });
                } catch (err) { return; }
                geo.rotateX(Math.PI / 2);
                geo.translate(-CX, 0.05 + 0.004 * i, -CY);
                const inactive = z.active === false;
                const dimZone = !!focusSet && !focusSet.zones.has(z.id);
                const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(color), transparent: inactive || dimZone, opacity: inactive ? 0.35 : (dimZone ? 0.22 : 1) }));
                mesh.userData = { kind: 'zone', zone: z };
                group.zones.add(mesh);
                zoneMeshes.push(mesh);
                let ax; let ay;
                try { const a = LCalc && LCalc.zoneLabelAnchor ? LCalc.zoneLabelAnchor(z) : null; if (a) { ax = a.x; ay = a.y; } } catch (err) { /* usa el centro */ }
                if (ax === undefined) { ax = z.x + z.l / 2; ay = z.y + z.w / 2; }
                if (!inactive && !dimZone) addLabel(group.zoneLabels, z.name, PX(ax), 0.12 + 0.004 * i, PZ(ay), Math.max(0.5, Math.min(0.9, Math.min(z.l, z.w) * 0.1)), true);
            });

            // huellas (el lugar en el piso, capa «Huella-Espacio»): una losa delgada, blanca o con su color, debajo de sus activos
            (layout.footprints || []).forEach((f) => {
                if (f.active === false || !(f.l > 0) || !(f.d > 0)) return;
                const paint = f.fmt && f.fmt.pattern !== 'none' && /^#[0-9a-fA-F]{6}$/.test(f.fmt.fill || '') ? f.fmt.fill : '#ffffff';
                const dimFp = !!focusSet && !focusSet.footprints.has(f.id);
                const slab = new THREE.Mesh(new THREE.BoxGeometry(f.l, 0.02, f.d), new THREE.MeshLambertMaterial({ color: new THREE.Color(paint), transparent: dimFp, opacity: dimFp ? 0.25 : 1 }));
                slab.position.set(PX(f.x + f.l / 2), 0.085, PZ(f.y + f.d / 2));
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
                const dimS = !!focusSet && !focusSet.spaces.has(s.id);
                const mute = (c) => (dimS ? mixHex(c, 0xe4e7f0, 0.8) : c);
                const lv = Math.max(1, s.levels || 1);
                // el color que se le puso en Formato de activo (sin relleno o sin color propio se queda con el de su tipo)
                const own = s.fmt && s.fmt.pattern !== 'none' && /^#[0-9a-fA-F]{6}$/.test(s.fmt.fill || '') ? parseInt(s.fmt.fill.slice(1), 16) : null;
                if (s.type === 'pallet') {
                    blk.push({ x: cx, y: 0.07, z: cz, sx: s.l, sy: 0.14, sz: s.d, c: mute(own !== null ? own : WOOD) });
                    const loadH = (s.h - 0.14) / lv;
                    if (!dimS) for (let k = 0; k < lv; k++) edgeBox(cx, 0.14 + k * loadH + loadH / 2, cz, s.l - 0.04, loadH - 0.04, s.d - 0.04);
                } else if (s.type === 'cabinet' || s.type === 'cold') {
                    blk.push({ x: cx, y: s.h / 2, z: cz, sx: s.l, sy: s.h, sz: s.d, c: mute(own !== null ? own : (s.type === 'cold' ? 0x8cc7e6 : 0x7f8c8d)) });
                } else {
                    const upC = mute(s.type === 'rackpal' ? 0x3f6fb5 : 0x5d6b86);
                    const deckC = mute(own !== null ? own : (s.type === 'rackpal' ? 0xe8892b : 0x93a0ba));
                    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([ix, iz]) => upr.push({ x: cx + ix * Math.max(0, s.l / 2 - 0.03), y: s.h / 2, z: cz + iz * Math.max(0, s.d / 2 - 0.03), sx: 0.06, sy: s.h, sz: 0.06, c: upC }));
                    const pitch = (s.h - 0.3) / lv;
                    for (let k = 0; k < lv; k++) dck.push({ x: cx, y: 0.15 + k * pitch, z: cz, sx: s.l, sy: 0.06, sz: s.d, c: deckC });
                }
                spaceList.push({ s, x: cx, z: cz });
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
                spaceList.forEach((e, i) => { dummy.position.set(e.x, e.s.h / 2, e.z); dummy.scale.set(e.s.l, e.s.h, e.s.d); dummy.updateMatrix(); hitSpaces.setMatrixAt(i, dummy.matrix); });
                hitSpaces.instanceMatrix.needsUpdate = true;
                group.assets.add(hitSpaces);
            }
            if (spaceList.length <= MAX_SPACE_LABELS) spaceList.forEach((e) => { if (!focusSet || focusSet.spaces.has(e.s.id)) addLabel(group.spaceLabels, e.s.code, e.x, e.s.h + 0.4, e.z, 0.38, false); });

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
        return { update, setLabels, setLayer, setHiddenAssets, highlight, setView, zoom, resize, destroy, canvas, layers: LAYER_NAMES.slice() };
    }

    root.LayoutScene3D = { create, LAYERS: LAYER_NAMES.slice() };
})(typeof window !== 'undefined' ? window : globalThis);
