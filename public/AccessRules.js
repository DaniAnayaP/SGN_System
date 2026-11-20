// ---------------------------------------------------------------------------
// Reglas de «Relación de Accesos» para los árboles de permisos (Giro, Plan y cliente): módulo puro, sin pantalla. Recibe las reglas que manda GET /api/admin/access-relations/rules
//   [{ access: llave del acceso, label: su nombre, web: [llaves de lo que entra con él en Web], app: [llaves en App (con #app)], touches: [llaves de lo que toca] }]
// y, dada la lista de llaves marcadas en un árbol («sección::área::ruta», con #app para App), dice:
//   · added: qué llaves del MÍNIMO INDISPENSABLE faltan y deben entrar solas (y la cadena: el mínimo del mínimo); addedBy: nombres de los accesos que las trajeron;
//   · required: qué llaves quedan BLOQUEADAS porque las necesita un acceso habilitado (llave → nombres de esos accesos);
//   · touched: qué accesos se RECOMIENDAN (llave del acceso que se toca → nombres de quien lo recomienda); touchedKeys: lo recomendado ya expandido a las llaves del árbol (para ponerle precio);
//   · blocked: nombres de los accesos cuyo mínimo no se pudo agregar (canAdd dijo que no).
// Las mismas reglas que db.js (expandAccessMinimums): un acceso está habilitado si cualquier cosa suya lo está (su llave, algo que lo contiene o una hoja de adentro) en esa plataforma, y no se agrega lo que otro permiso (misma
// llave, su pantalla, su área o su departamento) ya cubre. Los árboles marcan HOJAS: las llaves de las reglas ya vienen expandidas a hojas por el servidor.
// ---------------------------------------------------------------------------
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.AccessRules = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const APP_SUFFIX = '#app';

    function parse(key) {
        const text = String(key);
        const app = text.endsWith(APP_SUFFIX);
        const parts = (app ? text.slice(0, -APP_SUFFIX.length) : text).split('::');
        return { key: text, app, section: parts[0], item: parts[1] || null, sub: parts[2] || null };
    }
    // ¿La lista de permisos (de una plataforma) deja habilitado ese acceso? Lo cubre un permiso suyo o de lo que lo contiene (su área, su departamento) o una hoja de adentro.
    function enables(grants, access, isApp) {
        return grants.some((g) => {
            if (g.app !== isApp || g.section !== access.section) return false;
            if (!g.item) return true;
            if (g.item !== access.item) return false;
            if (!g.sub) return true;
            if (!access.sub) return false;
            if (g.sub === access.sub || access.sub.startsWith(`${g.sub}/`)) return true;
            return g.sub.startsWith(`${access.sub}/`);
        });
    }
    // ¿Algo de la lista ya cubre esa llave (la misma, o un permiso de su pantalla, su área o su departamento, en la misma plataforma)?
    function covers(grants, tuple) {
        return grants.some((g) => g.app === tuple.app && g.section === tuple.section && (!g.item || (g.item === tuple.item && (!g.sub || (!!tuple.sub && (g.sub === tuple.sub || tuple.sub.startsWith(`${g.sub}/`)))))));
    }

    function create(rawRules) {
        const rules = (rawRules || []).map((r) => ({
            label: r.label || r.access,
            access: parse(r.access),
            web: (r.web || []).map(parse),
            app: (r.app || []).map(parse),
            touches: r.touches || [],
            touchWeb: r.touchWeb || {},
        })).filter((r) => r.web.length || r.app.length || r.touches.length);

        // opciones: canAdd(llave) → false si no se puede agregar; coverKeys: llaves que ya da otro nivel (no se agregan). Regresa { added, required, touched, blocked }.
        // Rendimiento: con miles de permisos, buscar en toda la lista (enables y covers recorren todos los permisos, varias veces por cada clic en el árbol) tardaba cientos de milisegundos. Aquí los permisos se
        // guardan ya ordenados por plataforma y departamento (solo los de los departamentos que mencionan las reglas) y, dentro, por área y por ruta, de modo que cada pregunta se contesta mirando unas cuantas
        // llaves. Las respuestas son exactamente las de enables y covers de arriba (que siguen exportadas).
        const parseCache = new Map();
        const parseCached = (key) => { let p = parseCache.get(key); if (!p) { p = parse(key); parseCache.set(key, p); } return p; };
        const bucketKey = (app, section) => `${app ? 1 : 0}|${section}`;
        const relevantSections = new Set();
        rules.forEach((rule) => { relevantSections.add(rule.access.section); rule.web.forEach((tuple) => relevantSections.add(tuple.section)); rule.app.forEach((tuple) => relevantSections.add(tuple.section)); });
        function sectionOfKey(key) {
            const text = String(key);
            const bare = text.endsWith(APP_SUFFIX) ? text.slice(0, -APP_SUFFIX.length) : text;
            const at = bare.indexOf('::');
            return at < 0 ? bare : bare.slice(0, at);
        }
        // Los permisos de una plataforma y un departamento: whole (hay uno del departamento entero), itemWhole (áreas enteras), exact (rutas «área|ruta» exactas) y below (rutas que tienen algo más abajo).
        function addToGroup(group, g) {
            if (!g.item) { group.whole = true; return; }
            if (!g.sub) { group.itemWhole.add(g.item); return; }
            group.exact.add(`${g.item}|${g.sub}`);
            const parts = g.sub.split('/');
            for (let i = 1; i < parts.length; i += 1) group.below.add(`${g.item}|${parts.slice(0, i).join('/')}`);
        }
        function addGrant(index, g) {
            const k = bucketKey(g.app, g.section);
            let group = index.get(k);
            if (!group) { group = { whole: false, itemWhole: new Set(), exact: new Set(), below: new Set() }; index.set(k, group); }
            addToGroup(group, g);
        }
        function indexRelevant(keys) {
            const index = new Map();
            for (const key of keys) if (relevantSections.has(sectionOfKey(key))) addGrant(index, parseCached(key));
            return index;
        }
        // Que alguna ruta de arriba (o la misma) esté en exact: «c1/p1/x» pregunta por c1/p1/x, c1/p1 y c1.
        function anyAbove(group, item, sub) {
            if (group.exact.has(`${item}|${sub}`)) return true;
            const parts = sub.split('/');
            for (let i = 1; i < parts.length; i += 1) if (group.exact.has(`${item}|${parts.slice(0, i).join('/')}`)) return true;
            return false;
        }
        function groupEnables(group, access) {
            if (!group) return false;
            if (group.whole) return true;
            if (!access.item) return false;
            if (group.itemWhole.has(access.item)) return true;
            if (!access.sub) return false;
            return anyAbove(group, access.item, access.sub) || group.below.has(`${access.item}|${access.sub}`);
        }
        function groupCovers(group, tuple) {
            if (!group) return false;
            if (group.whole) return true;
            if (!tuple.item) return false;
            if (group.itemWhole.has(tuple.item)) return true;
            if (!tuple.sub) return false;
            return anyAbove(group, tuple.item, tuple.sub);
        }
        function resolve(keys, options = {}) {
            const grants = indexRelevant(keys);
            const cover = indexRelevant(options.coverKeys || []); // lo que otro nivel ya da (el plan del cliente): cubre, pero no dispara nada
            const hasCover = cover.size > 0;
            const added = [];
            const addedBy = new Set();
            const blocked = new Set();
            for (let round = 0; round < 12; round += 1) {
                let changed = false;
                rules.forEach((rule) => {
                    [['web', false], ['app', true]].forEach(([platform, isApp]) => {
                        if (!rule[platform].length || !groupEnables(grants.get(bucketKey(isApp, rule.access.section)), rule.access)) return;
                        rule[platform].forEach((tuple) => {
                            const k = bucketKey(tuple.app, tuple.section);
                            if (groupCovers(grants.get(k), tuple) || (hasCover && groupCovers(cover.get(k), tuple))) return;
                            if (options.canAdd && !options.canAdd(tuple.key)) { blocked.add(rule.label); return; }
                            addGrant(grants, tuple);
                            added.push(tuple.key);
                            addedBy.add(rule.label);
                            changed = true;
                        });
                    });
                });
                if (!changed) break;
            }
            // lo bloqueado y lo recomendado salen de lo que quedó habilitado al final (con lo que acaba de entrar)
            const required = new Map();
            const touched = new Map();
            const touchedKeys = new Set(); // lo recomendado, expandido a las llaves que marcaría el árbol
            rules.forEach((rule) => {
                [['web', false], ['app', true]].forEach(([platform, isApp]) => {
                    if (!rule[platform].length || !groupEnables(grants.get(bucketKey(isApp, rule.access.section)), rule.access)) return;
                    rule[platform].forEach((tuple) => {
                        if (!required.has(tuple.key)) required.set(tuple.key, []);
                        if (!required.get(tuple.key).includes(rule.label)) required.get(tuple.key).push(rule.label);
                    });
                });
                if (groupEnables(grants.get(bucketKey(false, rule.access.section)), rule.access) || groupEnables(grants.get(bucketKey(true, rule.access.section)), rule.access)) {
                    rule.touches.forEach((key) => {
                        if (!touched.has(key)) touched.set(key, []);
                        if (!touched.get(key).includes(rule.label)) touched.get(key).push(rule.label);
                        (rule.touchWeb[key] || []).forEach((k) => touchedKeys.add(k));
                    });
                }
            });
            return { added, addedBy: [...addedBy], required, touched, touchedKeys: [...touchedKeys], blocked: [...blocked] };
        }
        return { resolve, hasRules: rules.length > 0 };
    }
    // ── Reglas para PERSONAS (puestos y usuarios; Daniel, 2026-11-20: candado y «Recomendado» en vivo) ──────────────────────────────────────────────────────────────────────────────────────────────
    // Misma regla que aplica el servidor al guardar (expandPersonAccessMinimums en db.js), solo Web (la visibilidad en App es un interruptor por hoja del árbol, no un nivel). Recibe las reglas de GET /api/business/access-rules
    //   [{ access: llave del acceso, label, icon: ¿es un ícono?, web: [hojas que entran con él], touches: [llaves de lo que se recomienda] }]
    // · el acceso está habilitado cuando la persona OPERA algo de él (un nivel Ver y operar, Editar, Autorizar o Eliminar de lo que tiene adentro; un ícono, cuando marcó el ícono o algo suyo); lo que es el mínimo del propio acceso no cuenta;
    // · lo que entra: las hojas de web que falten; una columna o botón entra con «Ver y operar» (si ya tiene ese nivel o uno más alto no se toca; al subir se quita su «Solo ver»);
    // · lo que se bloquea (locks): llave de la columna, botón o ícono SIN el nivel → { rank (1 Solo ver, 2 Ver y operar; 0 = un ícono), names }: no puede quedar por debajo mientras el acceso esté habilitado;
    // · lo que se recomienda (touched): llave del acceso recomendado → nombres de quien lo recomienda (los accesos que sí están habilitados).
    const PERSON_RANK = { 'solo-ver': 1, 'ver-y-operar': 2, editar: 3 };
    const PERSON_OPERATING = ['ver-y-operar', 'editar', 'autorizar', 'eliminar'];
    const PERSON_LEVEL_RE = /^(.*)\/(solo-ver|ver-y-operar|editar)$/;
    function createPerson(rawRules) {
        const rules = (rawRules || []).map((r) => {
            const access = parse(r.access);
            const web = (r.web || []).map(parse);
            const own = new Set(web.map((tuple) => { const m = PERSON_LEVEL_RE.exec(tuple.sub || ''); return m ? m[1] : (tuple.sub || ''); }));
            return { label: r.label || r.access, access, icon: !!r.icon, web, touches: r.touches || [], own };
        }).filter((r) => r.access.item && r.access.sub && (r.web.length || r.touches.length));

        // opciones: canAdd(llave) → false si no se puede dar (contrato o Estatus); cumulative: los niveles se SUMAN (el árbol por usuario guarda «Solo ver» y encima «Ver y operar»): al dar «Ver y operar» también se da el «Solo ver» que falte y nunca se quita
        // (en el árbol del puesto los niveles se excluyen y el «Solo ver» sube). Regresa { added: [llaves], removed: [llaves del «Solo ver» que sube], addedBy, blocked, locks, touched }.
        function resolve(keys, options = {}) {
            const have = new Set();
            const index = new Map(); // «sección|área» → rutas que la persona tiene en Web
            const note = (key) => {
                const p = parse(key);
                if (p.app) return;
                const bucket = `${p.section}|${p.item || ''}`;
                if (!index.has(bucket)) index.set(bucket, []);
                index.get(bucket).push(p.sub || '');
            };
            for (const key of keys || []) { if (!String(key).endsWith(APP_SUFFIX)) { have.add(key); note(key); } }
            const enabled = (rule) => {
                const subs = index.get(`${rule.access.section}|${rule.access.item}`);
                if (!subs) return false;
                const path = rule.access.sub;
                return subs.some((sub) => {
                    if (rule.own.has(sub) || rule.own.has(sub.slice(0, Math.max(sub.lastIndexOf('/'), 0)))) return false;
                    if (rule.icon) return sub === path || sub.startsWith(`${path}/`);
                    return sub.startsWith(`${path}/`) && PERSON_OPERATING.includes(sub.slice(sub.lastIndexOf('/') + 1));
                });
            };
            const covered = (tuple) => {
                const lv = PERSON_LEVEL_RE.exec(tuple.key);
                if (!lv) return have.has(tuple.key);
                return Object.keys(PERSON_RANK).some((other) => PERSON_RANK[other] >= PERSON_RANK[lv[2]] && have.has(`${lv[1]}/${other}`));
            };
            const added = [];
            const removed = [];
            const addedBy = new Set();
            const blocked = new Set();
            for (let round = 0; round < 12; round += 1) {
                let changed = false;
                rules.forEach((rule) => {
                    if (!rule.web.length || !enabled(rule)) return;
                    rule.web.forEach((tuple) => {
                        if (covered(tuple)) return;
                        if (options.canAdd && !options.canAdd(tuple.key)) { blocked.add(rule.label); return; }
                        const lv = PERSON_LEVEL_RE.exec(tuple.key);
                        if (lv && lv[2] === 'ver-y-operar') {
                            const solo = `${lv[1]}/solo-ver`;
                            if (options.cumulative) {
                                // los niveles se suman: «Ver y operar» lleva su «Solo ver»
                                if (!have.has(solo) && (!options.canAdd || options.canAdd(solo))) { have.add(solo); note(solo); added.push(solo); }
                            } else if (have.has(solo)) {
                                // los niveles se excluyen: al subir a «Ver y operar» se quita el «Solo ver» de esa columna o botón
                                have.delete(solo);
                                const at = added.indexOf(solo);
                                if (at >= 0) added.splice(at, 1); else removed.push(solo);
                            }
                        }
                        have.add(tuple.key);
                        note(tuple.key);
                        added.push(tuple.key);
                        addedBy.add(rule.label);
                        changed = true;
                    });
                });
                if (!changed) break;
            }
            // lo bloqueado y lo recomendado salen de lo que quedó al final
            const locks = new Map();
            const touched = new Map();
            rules.forEach((rule) => {
                if (!enabled(rule)) return;
                rule.web.forEach((tuple) => {
                    const lv = PERSON_LEVEL_RE.exec(tuple.key);
                    if (lv ? !covered(tuple) : !have.has(tuple.key)) return; // solo se bloquea lo que de verdad está puesto
                    const lockKey = lv ? lv[1] : tuple.key;
                    const rank = lv ? PERSON_RANK[lv[2]] : 0;
                    const lock = locks.get(lockKey) || { rank, names: [] };
                    lock.rank = Math.max(lock.rank, rank);
                    if (!lock.names.includes(rule.label)) lock.names.push(rule.label);
                    locks.set(lockKey, lock);
                });
                rule.touches.forEach((key) => {
                    if (!touched.has(key)) touched.set(key, []);
                    if (!touched.get(key).includes(rule.label)) touched.get(key).push(rule.label);
                });
            });
            return { added, removed, addedBy: [...addedBy], blocked: [...blocked], locks, touched };
        }
        return { resolve, hasRules: rules.length > 0 };
    }
    return { create, createPerson, parse, enables, covers };
}));
