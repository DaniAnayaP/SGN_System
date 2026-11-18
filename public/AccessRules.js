// ---------------------------------------------------------------------------
// Reglas de «Relación de Accesos» para los árboles de permisos (Giro, Plan y cliente): módulo puro, sin pantalla. Recibe las reglas que manda GET /api/admin/access-relations/rules
//   [{ access: llave del acceso, label: su nombre, web: [llaves de lo que entra con él en Web], app: [llaves en App (con #app)], touches: [llaves de lo que toca] }]
// y, dada la lista de llaves marcadas en un árbol («sección::área::ruta», con #app para App), dice:
//   · added: qué llaves del MÍNIMO INDISPENSABLE faltan y deben entrar solas (y la cadena: el mínimo del mínimo); addedBy: nombres de los accesos que las trajeron;
//   · required: qué llaves quedan BLOQUEADAS porque las necesita un acceso habilitado (llave → nombres de esos accesos);
//   · touched: qué accesos se RECOMIENDAN (llave del acceso que se toca → nombres de quien lo recomienda);
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
        })).filter((r) => r.web.length || r.app.length || r.touches.length);

        // opciones: canAdd(llave) → false si no se puede agregar; coverKeys: llaves que ya da otro nivel (no se agregan). Regresa { added, required, touched, blocked }.
        function resolve(keys, options = {}) {
            const grants = [...keys].map(parse);
            const cover = (options.coverKeys ? [...options.coverKeys] : []).map(parse); // lo que otro nivel ya da (el plan del cliente): cubre, pero no dispara nada
            const added = [];
            const addedBy = new Set();
            const blocked = new Set();
            for (let round = 0; round < 12; round += 1) {
                let changed = false;
                rules.forEach((rule) => {
                    [['web', false], ['app', true]].forEach(([platform, isApp]) => {
                        if (!rule[platform].length || !enables(grants, rule.access, isApp)) return;
                        rule[platform].forEach((tuple) => {
                            if (covers(grants, tuple) || (cover.length && covers(cover, tuple))) return;
                            if (options.canAdd && !options.canAdd(tuple.key)) { blocked.add(rule.label); return; }
                            grants.push(tuple);
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
            rules.forEach((rule) => {
                [['web', false], ['app', true]].forEach(([platform, isApp]) => {
                    if (!rule[platform].length || !enables(grants, rule.access, isApp)) return;
                    rule[platform].forEach((tuple) => {
                        if (!required.has(tuple.key)) required.set(tuple.key, []);
                        if (!required.get(tuple.key).includes(rule.label)) required.get(tuple.key).push(rule.label);
                    });
                });
                if (enables(grants, rule.access, false) || enables(grants, rule.access, true)) {
                    rule.touches.forEach((key) => {
                        if (!touched.has(key)) touched.set(key, []);
                        if (!touched.get(key).includes(rule.label)) touched.get(key).push(rule.label);
                    });
                }
            });
            return { added, addedBy: [...addedBy], required, touched, blocked: [...blocked] };
        }
        return { resolve, hasRules: rules.length > 0 };
    }
    return { create, parse, enables, covers };
}));
