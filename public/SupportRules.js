// ---------------------------------------------------------------------------
// Reglas de Soporte por niveles que usan los dos lados (el servidor las aplica y la pantalla las muestra en vivo): la prioridad que sale de lo que el usuario marca, el nivel donde entra un caso y el plazo
// de su primera respuesta. Funciones puras, sin acceso a la base. Se carga en el navegador (window.SupportRules) y en el servidor (require).
//
//   Prioridad (matriz urgencia × importancia):
//     · Importante = algún impacto en Alto, o dos o más en Medio.   · Urgente = le afecta «ya» u «hoy».
//     1 = Urgente (urgente e importante) · 2 = Urgente, poco importante · 3 = No urgente pero importante · 4 = No importante y no urgente.
//   Nivel de entrada: el de la categoría (N1 a N3); una categoría de Nivel 0 o sin nivel entra por el Nivel 1 (si la persona pidió soporte, ya no es autoservicio). Un nivel apagado en el Mapa de soporte se salta
//   (el 1 nunca se apaga; si el 2 y el 3 están apagados, pasa directo al 4, el proveedor).
//   Primera respuesta: el plazo MÁS CORTO entre el de la prioridad (Mapa de soporte) y el de la categoría; 0 = sin plazo.
// ---------------------------------------------------------------------------
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SupportRules = factory();
}(typeof self !== 'undefined' ? self : this, () => {
    const IMPACT_LEVELS = ['none', 'low', 'medium', 'high']; // 0, 1, 2, 3
    const WHEN_AFFECTS = ['now', 'today', 'week', 'none'];
    const LEVELS = ['n0', 'n1', 'n2', 'n3', 'n4'];

    // impacts: [{ name, level }] con level 0 a 3.
    function isImportant(impacts) {
        const levels = (impacts || []).map((i) => Number(i && i.level) || 0);
        return levels.some((l) => l >= 3) || levels.filter((l) => l === 2).length >= 2;
    }
    const isUrgent = (when) => when === 'now' || when === 'today';
    function priorityOf(impacts, when) {
        const urgent = isUrgent(when);
        const important = isImportant(impacts);
        if (urgent) return important ? 1 : 2;
        return important ? 3 : 4;
    }
    // kind: 'n0' a 'n3' o '' (la categoría); map: los ajustes del Mapa de soporte ({ n2Enabled, n3Enabled }).
    function entryLevel(kind, map) {
        const m = map || {};
        let level = LEVELS.includes(kind) && kind !== 'n0' ? kind : 'n1';
        if (level === 'n2' && m.n2Enabled === false) level = 'n3';
        if (level === 'n3' && m.n3Enabled === false) level = 'n4';
        return level;
    }
    // Los niveles que usa la empresa de n1 a n4 (el 2 y el 3 se pueden apagar en el Mapa de soporte; el 1 y el 4 siempre).
    const ORDER = { n0: 0, n1: 1, n2: 2, n3: 3, n4: 4 };
    function enabledLevels(map) {
        const m = map || {};
        return ['n1', ...(m.n2Enabled === false ? [] : ['n2']), ...(m.n3Enabled === false ? [] : ['n3']), 'n4'];
    }
    // A qué niveles puede SUBIR un caso que está en `level` (los que usa la empresa y están por encima), del más cercano al más lejano.
    function upLevels(level, map) {
        return enabledLevels(map).filter((l) => ORDER[l] > (ORDER[level] || 0));
    }
    // A qué niveles puede DEVOLVERSE (los que usa la empresa y están por debajo), del más cercano al más lejano.
    function downLevels(level, map) {
        return enabledLevels(map).filter((l) => ORDER[l] < (ORDER[level] || 0)).reverse();
    }
    // Minutos para la primera respuesta: el más corto de los dos que haya (el de la prioridad y el de la categoría); 0 = sin plazo.
    function firstResponseMinutes(priority, categoryMinutes, map) {
        const byPriority = Number((map || {})[`p${priority}FirstMin`]) || 0;
        const byCategory = Number(categoryMinutes) || 0;
        const list = [byPriority, byCategory].filter((n) => n > 0);
        return list.length ? Math.min(...list) : 0;
    }
    return { IMPACT_LEVELS, WHEN_AFFECTS, LEVELS, isImportant, isUrgent, priorityOf, entryLevel, firstResponseMinutes, enabledLevels, upLevels, downLevels };
}));
