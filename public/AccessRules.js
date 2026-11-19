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
    return { create, parse, enables, covers };
}));
