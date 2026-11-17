// El HORARIO de un criterio de «Qué se mide» (2026-11-17): cuándo toca registrar algo de un activo (una lectura, una limpieza…) y cuántas veces. Lo usan el servidor (validar, escribir el texto del límite, calcular las alertas) y las
// pantallas (el editor de Alta Activos y el contador «3 de 3» de Actividades Activos): un solo archivo para que todos entiendan el horario igual.
//
// La regla (rule), ya normalizada:
//   when  : 'week' | 'month' | 'year'  — cuándo toca
//   days  : week  = días 1 (lunes) a 7 (domingo); month = días 1 a 31 y 32 = «último día del mes» (si el mes no tiene ese día toca el último); year = [{ m, d, y|null }] (con año = una sola vez)
//   mode  : 'hours' | 'open' | 'every' — cuántas veces
//     hours : horas específicas (hours = ['08:00', '14:00']) con tolerancia (tol, minutos): cada una se cumple con un registro entre hora − tol y hora + tol
//     open  : abierto: al menos «min» registros en el día, que se revisan a la hora de cierre (close)
//     every : cada «everyH» horas (la forma de antes, «Cada N horas»); no usa días (toca todos los días)
// El texto que se guarda y se ve es UNO solo («Lun a Vie · 3 veces: 08:00, 14:00, 20:00 (±30 min)»): es el valor del límite en el historial, en las autorizaciones y en la campana. parse() lo lee de vuelta, también el texto
// viejo «cada 4 h». Las horas son de la zona horaria de la empresa.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.AssetSchedule = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const LAST = 32;
    const ALL_WEEK = [1, 2, 3, 4, 5, 6, 7];
    const DEFAULT_TOL = 30;
    const DEFAULT_CLOSE = '20:00';
    const pad = (n) => String(n).padStart(2, '0');
    const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
    const daysInMonth = (m, y) => new Date(Date.UTC(y == null ? 2000 : y, m, 0)).getUTCDate(); // m = 1..12; sin año se cuenta un año bisiesto (29 feb existe)
    const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const sortNum = (list) => [...new Set(list)].sort((a, z) => a - z);
    const numText = (n) => String(Math.round(Number(n) * 1000) / 1000);

    // ---- validar y dejar la regla en su forma única ------------------------------------------------------------------------------------------------
    // Devuelve { rule } o { error: 'mensaje' }. null / '' / {} = sin horario ({ rule: null }). Un número = «cada N horas» (la forma de antes).
    function normalize(input) {
        const bad = (error) => ({ error });
        if (input === null || input === undefined || input === '') return { rule: null };
        if (typeof input === 'number') return normalize({ mode: 'every', everyH: input });
        if (typeof input === 'string') { const parsed = parse(input); return parsed ? { rule: parsed } : bad('El horario no se entiende.'); }
        if (typeof input !== 'object' || Array.isArray(input)) return bad('El horario no es válido.');
        if (!Object.keys(input).length) return { rule: null };
        const mode = input.mode;
        if (!['hours', 'open', 'every'].includes(mode)) return bad('Elige cuántas veces: horas específicas, abierto o cada N horas.');
        const out = { when: 'week', days: ALL_WEEK.slice(), mode };
        if (mode === 'every') {
            const h = Number(input.everyH);
            if (!Number.isFinite(h) || !(h > 0 && h <= 8760)) return bad('Las horas deben ser un número mayor que 0 y hasta 8760.');
            out.everyH = Math.round(h * 1000) / 1000;
            return { rule: out };
        }
        const when = input.when;
        if (!['week', 'month', 'year'].includes(when)) return bad('Elige cuándo toca: cada semana, cada mes o en el año.');
        out.when = when;
        if (when === 'week') {
            const days = Array.isArray(input.days) ? input.days.map(Number) : [];
            if (!days.length || days.some((n) => !Number.isInteger(n) || n < 1 || n > 7)) return bad('Marca al menos un día de la semana.');
            out.days = sortNum(days);
        } else if (when === 'month') {
            const days = Array.isArray(input.days) ? input.days.map(Number) : [];
            if (!days.length || days.some((n) => !Number.isInteger(n) || n < 1 || n > LAST)) return bad('Marca al menos un día del mes.');
            out.days = sortNum(days);
        } else {
            const list = Array.isArray(input.days) ? input.days : [];
            if (!list.length || list.length > 366) return bad('Agrega al menos una fecha del año.');
            const seen = new Set();
            const dates = [];
            for (const item of list) {
                const m = Number(item && item.m);
                const d = Number(item && item.d);
                const y = item && item.y !== null && item.y !== undefined && item.y !== '' ? Number(item.y) : null;
                if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(d) || d < 1 || d > daysInMonth(m, y)) return bad('Una de las fechas no existe.');
                if (y !== null && (!Number.isInteger(y) || y < 2000 || y > 2100)) return bad('El año de una fecha no es válido.');
                const key = `${y === null ? '' : y}-${m}-${d}`;
                if (!seen.has(key)) { seen.add(key); dates.push({ m, d, y }); }
            }
            out.days = dates.sort((a, z) => (a.y === null ? 0 : a.y) - (z.y === null ? 0 : z.y) || a.m - z.m || a.d - z.d);
        }
        if (mode === 'hours') {
            const hours = Array.isArray(input.hours) ? input.hours : [];
            if (!hours.length || hours.length > 24 || hours.some((h) => !isTime(h))) return bad('Escribe al menos una hora (HH:MM), hasta 24.');
            const tol = input.tol === undefined || input.tol === null || input.tol === '' ? DEFAULT_TOL : Number(input.tol);
            if (!Number.isInteger(tol) || tol < 0 || tol > 720) return bad('La tolerancia debe ser de 0 a 720 minutos.');
            out.hours = [...new Set(hours)].sort();
            out.tol = tol;
        } else {
            const min = input.min === undefined || input.min === null || input.min === '' ? 1 : Number(input.min);
            if (!Number.isInteger(min) || min < 1 || min > 999) return bad('El mínimo de veces por día debe ser un entero de 1 a 999.');
            const close = input.close === undefined || input.close === null || input.close === '' ? DEFAULT_CLOSE : input.close;
            if (!isTime(close)) return bad('La hora de cierre debe ser HH:MM.');
            out.min = min;
            out.close = close;
        }
        return { rule: out };
    }

    // ---- el texto ---------------------------------------------------------------------------------------------------------------------------------------
    function weekText(days) {
        if (days.length === 7) return 'Todos los días';
        const parts = [];
        let i = 0;
        while (i < days.length) {
            let j = i;
            while (j + 1 < days.length && days[j + 1] === days[j] + 1) j += 1;
            if (j - i >= 2) parts.push(`${DAYS[days[i] - 1]} a ${DAYS[days[j] - 1]}`);
            else for (let k = i; k <= j; k += 1) parts.push(DAYS[days[k] - 1]);
            i = j + 1;
        }
        return parts.join(', ');
    }
    function format(rule) {
        if (!rule) return '';
        if (rule.mode === 'every') return `cada ${numText(rule.everyH)} h`;
        let when;
        if (rule.when === 'week') when = weekText(rule.days);
        else if (rule.when === 'month') when = `Mes: ${rule.days.map((n) => (n === LAST ? 'último' : String(n))).join(', ')}`;
        else when = `Año: ${rule.days.map((x) => `${x.d} ${MONTHS[x.m - 1]}${x.y ? ` ${x.y}` : ''}`).join(', ')}`;
        if (rule.mode === 'hours') return `${when} · ${rule.hours.length} ${rule.hours.length === 1 ? 'vez' : 'veces'}: ${rule.hours.join(', ')} (±${rule.tol} min)`;
        return `${when} · mín. ${rule.min} ${rule.min === 1 ? 'vez' : 'veces'} · cierre ${rule.close}`;
    }
    // El texto de vuelta a la regla (null si no se entiende). Lee lo que escribe format() y el «cada 4 h» de antes.
    function parse(text) {
        const raw = String(text == null ? '' : text).trim();
        if (!raw) return null;
        const every = raw.match(/^cada\s+(\d+(?:[.,]\d+)?)\s*h$/i);
        if (every) { const r = normalize({ mode: 'every', everyH: Number(every[1].replace(',', '.')) }); return r.rule || null; }
        const parts = raw.split(' · ');
        const whenText = parts[0].trim();
        const timesText = parts.slice(1).join(' · ').trim();
        let when;
        let days;
        let m;
        if (/^Todos los días$/i.test(whenText)) { when = 'week'; days = ALL_WEEK.slice(); } else if ((m = whenText.match(/^Mes:\s*(.+)$/i))) {
            when = 'month';
            days = m[1].split(',').map((s) => s.trim().toLowerCase()).map((s) => (s === 'último' || s === 'ultimo' ? LAST : (/^\d+$/.test(s) ? Number(s) : NaN)));
        } else if ((m = whenText.match(/^Año:\s*(.+)$/i))) {
            when = 'year';
            days = m[1].split(',').map((s) => {
                const x = s.trim().toLowerCase().match(/^(\d{1,2})\s+([a-záéíóú]{3})(?:\s+(\d{4}))?$/);
                const mi = x ? MONTHS.indexOf(x[2]) : -1;
                return x && mi >= 0 ? { m: mi + 1, d: Number(x[1]), y: x[3] ? Number(x[3]) : null } : null;
            });
            if (days.some((d) => d === null)) return null;
        } else {
            when = 'week';
            days = [];
            for (const tok of whenText.split(',').map((s) => s.trim()).filter(Boolean)) {
                const range = tok.match(/^(\S+)\s+a\s+(\S+)$/i);
                const idx = (name) => DAYS.findIndex((d) => d.toLowerCase() === String(name).toLowerCase()) + 1;
                if (range) { const a = idx(range[1]); const z = idx(range[2]); if (!a || !z || z < a) return null; for (let n = a; n <= z; n += 1) days.push(n); } else { const n = idx(tok); if (!n) return null; days.push(n); }
            }
        }
        if (days.some((d) => d !== null && typeof d === 'number' && Number.isNaN(d))) return null;
        const hoursM = timesText.match(/^(\d+)\s+(?:vez|veces):\s*(.+?)\s*\(±(\d+)\s*min\)$/i);
        if (hoursM) {
            const hours = hoursM[2].split(',').map((s) => s.trim());
            const r = normalize({ when, days, mode: 'hours', hours, tol: Number(hoursM[3]) });
            return r.rule || null;
        }
        const openM = timesText.match(/^mín\.\s*(\d+)\s+(?:vez|veces)\s*·\s*cierre\s+(\d{2}:\d{2})$/i);
        if (openM) { const r = normalize({ when, days, mode: 'open', min: Number(openM[1]), close: openM[2] }); return r.rule || null; }
        return null;
    }

    // ---- cuándo toca ------------------------------------------------------------------------------------------------------------------------------------
    // ¿Toca el día y/m/d (m = 1..12)?
    function appliesOn(rule, y, m, d) {
        if (!rule) return false;
        if (rule.mode === 'every' || rule.when === 'week') {
            if (rule.mode === 'every') return true;
            const dow = ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1; // 1 = lunes … 7 = domingo
            return rule.days.includes(dow);
        }
        if (rule.when === 'month') {
            const last = lastDayOf(y, m);
            return rule.days.some((n) => (n === LAST ? d === last : d === Math.min(n, last)));
        }
        return rule.days.some((x) => x.m === m && x.d === d && (x.y === null || x.y === undefined || x.y === y));
    }
    // Cuántos registros se esperan en un día que toca: las horas (modo horas), el mínimo (modo abierto) o null (cada N horas: no se cuenta por día).
    function expectedCount(rule) {
        if (!rule) return null;
        if (rule.mode === 'hours') return rule.hours.length;
        if (rule.mode === 'open') return rule.min;
        return null;
    }

    // ---- la zona horaria de la empresa -------------------------------------------------------------------------------------------------------------------
    const formatters = new Map();
    function formatter(zone) {
        if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
        return formatters.get(zone);
    }
    // La hora de pared de un instante en esa zona: { y, m, d, hh, mm, dow }.
    function wallParts(ms, zone) {
        const p = {};
        formatter(zone).formatToParts(new Date(ms)).forEach((part) => { if (part.type !== 'literal') p[part.type] = Number(part.value); });
        const dow = ((new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7) + 1;
        return { y: p.year, m: p.month, d: p.day, hh: p.hour % 24, mm: p.minute, dow };
    }
    // El instante (ms UTC) en que el reloj de esa zona marca y-m-d hh:mm (los días y minutos que se pasan de rango se acomodan solos).
    function zonedToUtcMs(y, m, d, hh, mm, zone) {
        const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
        let ms = guess;
        for (let i = 0; i < 3; i += 1) {
            const w = wallParts(ms, zone);
            const wall = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, 0);
            const diff = guess - wall;
            if (diff === 0) break;
            ms += diff;
        }
        return ms;
    }
    const hhmmOf = (ms, zone) => { const w = wallParts(ms, zone); return `${pad(w.hh)}:${pad(w.mm)}`; };

    // ---- las alertas de hoy -----------------------------------------------------------------------------------------------------------------------------
    // rule en modo horas o abierto; nowMs = ahora; zone = zona de la empresa; regMs = cuándo se registró algo (cualquier día, en ms UTC); sinceMs = desde cuándo existe el horario (lo anterior no cuenta).
    // Devuelve [{ key, code, params, startedAtMs }]: 'slot:HH:MM' («la lectura de las 14:00 no se hizo») o 'day' («faltaron X de N registros de hoy»), cada una desde que se pasó su tiempo.
    function evaluate(rule, { nowMs, zone, regMs = [], sinceMs = 0 }) {
        const out = [];
        if (!rule || rule.mode === 'every') return out;
        const w = wallParts(nowMs, zone);
        if (!appliesOn(rule, w.y, w.m, w.d)) return out;
        const dayStart = zonedToUtcMs(w.y, w.m, w.d, 0, 0, zone);
        const dayEnd = zonedToUtcMs(w.y, w.m, w.d + 1, 0, 0, zone);
        const regs = regMs.filter((ms) => ms >= dayStart && ms < dayEnd).sort((a, z) => a - z);
        if (rule.mode === 'open') {
            const [ch, cm] = rule.close.split(':').map(Number);
            const closeMs = zonedToUtcMs(w.y, w.m, w.d, ch, cm, zone);
            if (nowMs > closeMs && closeMs >= sinceMs && regs.length < rule.min) {
                out.push({ key: 'day', code: 'sched-day', params: { need: rule.min, got: regs.length, missing: rule.min - regs.length, close: rule.close }, startedAtMs: closeMs });
            }
            return out;
        }
        const used = new Set();
        rule.hours.forEach((h) => {
            const [hh, mm] = h.split(':').map(Number);
            const center = zonedToUtcMs(w.y, w.m, w.d, hh, mm, zone);
            const from = center - rule.tol * 60000;
            const to = center + rule.tol * 60000;
            const at = regs.findIndex((ms, i) => !used.has(i) && ms >= from && ms <= to);
            if (at >= 0) { used.add(at); return; }
            if (nowMs > to && to >= sinceMs) out.push({ key: `slot:${h}`, code: 'sched-slot', params: { time: h, from: hhmmOf(from, zone), to: hhmmOf(to, zone) }, startedAtMs: to });
        });
        return out;
    }

    return { normalize, format, parse, appliesOn, expectedCount, wallParts, zonedToUtcMs, evaluate, DAYS, MONTHS, LAST, ALL_WEEK, DEFAULT_TOL, DEFAULT_CLOSE };
}));
