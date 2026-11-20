// ---------------------------------------------------------------------------
// Administración de Equipo de Trabajo › línea del tiempo y Registro (pieza 3). Aquí solo hay cálculo (nada de pantalla): a partir de los pasos que el servidor entrega por persona (asignada, confirmada, en curso, pausa, en validación, regresada, terminada, pasada…)
// arma los tramos de la barra (en curso, en pausa, en validación), las marcas, los tiempos (cuánto tardó en confirmar, en terminar, cuánto estuvo en pausa), las tres formas de agrupar (por actividad, por usuario, por sitio) y las hojas de Excel / PDF.
// EquipoTrabajo.js la llama; se prueba en Node. Las horas llegan en ISO (UTC); lo que se muestra lo formatean las funciones que manda la pantalla (cada quien ve su hora).
// ---------------------------------------------------------------------------
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.TeamTimeline = factory();
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';
// la marca de cada paso en la barra: letra y clase
const MARKS = {
    assigned: ['A', 'a'], claimed: ['A', 'a'], confirmed: ['C', 'c'], started: ['▶', 'r'], resumed: ['▶', 'r'], paused: ['⏸', 'p'], submitted: ['V', 'v'], returned: ['↩', 'b'], validated: ['✓', 't'],
    passed: ['⇄', 'x'], pass_requested: ['⇄', 'x'], pass_approved: ['⇄', 'x'], pass_rejected: ['⇄', 'x'], pass_cancelled: ['⇄', 'x'], unassigned: ['✕', 'z'], cancelled: ['✕', 'z'],
};
const markOf = (type) => MARKS[type] || ['•', 'a'];
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const avg = (xs) => (xs.length ? sum(xs) / xs.length : null);

// Los pasos de UNA persona → tramos y tiempos. `now` (ms) cierra lo que sigue abierto. Los pases pedidos, rechazados o retirados solo dejan marca.
function analyze(steps, now) {
    const list = (steps || []).map((s) => ({ ...s, ms: Date.parse(s.at) })).filter((s) => !Number.isNaN(s.ms)).sort((a, b) => a.ms - b.ms);
    const out = { segments: [], markers: [], assignedAt: null, confirmedAt: null, startedAt: null, doneAt: null, endedAt: null, claimed: false, pauses: 0, pauseDurations: [], returns: 0, state: 'assigned', confirmMs: null, finishMs: null, openPause: false };
    let open = null;
    const close = (to) => { if (open) { out.segments.push({ kind: open.kind, from: open.from, to }); open = null; } };
    const begin = (kind, at) => { close(at); open = { kind, from: at }; };
    list.forEach((s) => {
        out.markers.push({ type: s.type, at: s.ms, by: s.by || '', note: s.note || '', via: s.via || '', fromName: s.fromName || '', toNames: s.toNames || [] });
        switch (s.type) {
            case 'assigned': case 'claimed':
                if (out.assignedAt == null) { out.assignedAt = s.ms; out.claimed = s.type === 'claimed'; }
                out.state = 'assigned'; break;
            case 'confirmed':
                if (out.confirmedAt == null) out.confirmedAt = s.ms;
                if (out.state === 'assigned') out.state = 'confirmed';
                break;
            case 'started': case 'resumed':
                if (s.type === 'started' && out.startedAt == null) out.startedAt = s.ms;
                if (open && open.kind === 'pause') out.pauseDurations.push(s.ms - open.from);
                begin('run', s.ms); out.state = 'in_progress'; break;
            case 'paused': begin('pause', s.ms); out.pauses += 1; out.state = 'paused'; break;
            case 'submitted': begin('val', s.ms); out.state = 'review'; break;
            case 'returned': out.returns += 1; begin('run', s.ms); out.state = 'in_progress'; break;
            case 'validated': close(s.ms); out.doneAt = s.ms; out.endedAt = s.ms; out.state = 'done'; break;
            case 'passed': close(s.ms); out.endedAt = s.ms; out.state = 'passed'; break;
            case 'unassigned': close(s.ms); out.endedAt = s.ms; out.state = 'removed'; break;
            case 'cancelled': close(s.ms); out.endedAt = s.ms; out.state = 'cancelled'; break;
            default: break;
        }
    });
    if (open) {
        if (open.kind === 'pause') { out.pauseDurations.push(Math.max(0, now - open.from)); out.openPause = true; }
        close(Math.max(now, open.from));
    }
    // tomarla («La tomo») no cuenta como «tardó en confirmar»: se asigna y se confirma en el mismo momento
    out.confirmMs = out.confirmedAt != null && out.assignedAt != null && !out.claimed ? Math.max(0, out.confirmedAt - out.assignedAt) : null;
    out.finishMs = out.doneAt != null && out.assignedAt != null ? Math.max(0, out.doneAt - out.assignedAt) : null;
    out.pauseMs = sum(out.pauseDurations);
    out.runMs = sum(out.segments.filter((g) => g.kind === 'run').map((g) => g.to - g.from));
    out.lastMs = list.length ? list[list.length - 1].ms : null;
    return out;
}

// Los promedios de varios análisis (las cuatro fichas de arriba).
function metrics(analyses) {
    return {
        count: analyses.length,
        confirmAvg: avg(analyses.map((a) => a.confirmMs).filter((n) => n != null)),
        finishAvg: avg(analyses.map((a) => a.finishMs).filter((n) => n != null)),
        pauseAvg: avg(analyses.flatMap((a) => a.pauseDurations)),
        returns: sum(analyses.map((a) => a.returns)),
    };
}

// «28 min», «17 h», «3.2 días». `fmt` = { min(n), h(n), d(n) } con el texto de cada idioma.
function durationText(ms, fmt) {
    if (ms == null || Number.isNaN(ms)) return '';
    const min = Math.max(0, ms) / 60000;
    if (min < 60) return fmt.min(Math.round(min));
    const h = min / 60;
    if (h < 48) return fmt.h(Math.round(h));
    return fmt.d(Math.round((h / 24) * 10) / 10);
}

// Dónde cae un instante en la barra (0 a 100 por ciento del periodo); null si queda fuera.
function place(ms, fromMs, toMs) {
    if (ms < fromMs || ms > toMs) return null;
    return ((ms - fromMs) / (toMs - fromMs)) * 100;
}
// Un tramo recortado al periodo: { left, width } en por ciento, o null si queda fuera.
function clipSegment(seg, fromMs, toMs) {
    const a = Math.max(seg.from, fromMs);
    const b = Math.min(seg.to, toMs);
    if (b < a || (seg.to < fromMs) || (seg.from > toMs)) return null;
    const left = ((a - fromMs) / (toMs - fromMs)) * 100;
    return { left, width: Math.max(0.8, ((b - a) / (toMs - fromMs)) * 100) };
}
// Las marcas dentro del periodo, separadas al menos `gap` por ciento (si dos pasos caen casi juntos, la segunda se corre; la hora exacta va en su título).
function spreadMarkers(markers, fromMs, toMs, gap) {
    const placed = markers.map((m) => ({ ...m, x: place(m.at, fromMs, toMs) })).filter((m) => m.x != null).sort((a, b) => a.at - b.at);
    for (let i = 1; i < placed.length; i += 1) if (placed[i].x < placed[i - 1].x + gap) placed[i].x = placed[i - 1].x + gap;
    // si las últimas se pasaron del borde, se corren hacia atrás
    for (let i = placed.length - 1; i >= 0; i -= 1) { const limit = 100 - (placed.length - 1 - i) * gap; if (placed[i].x > limit) placed[i].x = Math.max(0, limit); }
    return placed;
}

// Las filas de la línea del tiempo, ya agrupadas. group: 'activity' | 'user' | 'site'. `activities` ya vienen filtradas por la pantalla.
function build(activities, group, now) {
    const withTracks = activities.map((a) => ({ activity: a, tracks: a.people.map((p) => ({ person: p, activity: a, analysis: analyze(p.steps, now) })) }));
    const rows = [];
    if (group === 'user') {
        const by = new Map();
        withTracks.forEach((x) => x.tracks.forEach((t) => {
            if (!by.has(t.person.userId)) by.set(t.person.userId, { key: `u${t.person.userId}`, person: t.person, sites: new Set(), tracks: [] });
            const row = by.get(t.person.userId);
            row.tracks.push(t);
            x.activity.sites.forEach((s) => row.sites.add(s.name));
        }));
        by.forEach((row) => rows.push({ ...row, sites: [...row.sites] }));
        rows.sort((a, b) => a.person.name.localeCompare(b.person.name));
    } else if (group === 'site') {
        const by = new Map();
        withTracks.forEach((x) => {
            const sites = x.activity.sites.length ? x.activity.sites : [{ id: 0, name: '' }];
            sites.forEach((s) => {
                if (!by.has(s.id)) by.set(s.id, { key: `s${s.id}`, site: s, activityIds: new Set(), tracks: [] });
                const row = by.get(s.id);
                row.activityIds.add(x.activity.id);
                x.tracks.forEach((t) => row.tracks.push(t));
            });
        });
        by.forEach((row) => rows.push({ ...row, activities: row.activityIds.size }));
        rows.sort((a, b) => (a.site.id === 0) - (b.site.id === 0) || a.site.name.localeCompare(b.site.name));
    } else {
        withTracks.forEach((x) => rows.push({ key: `a${x.activity.id}`, activity: x.activity, tracks: x.tracks }));
        rows.sort((a, b) => Math.max(0, ...b.tracks.map((t) => t.analysis.lastMs || 0)) - Math.max(0, ...a.tracks.map((t) => t.analysis.lastMs || 0)));
    }
    rows.forEach((row) => { row.analyses = row.tracks.map((t) => t.analysis); row.metrics = metrics(row.analyses); row.byState = {}; row.analyses.forEach((a) => { row.byState[a.state] = (row.byState[a.state] || 0) + 1; }); });
    return rows;
}

// ---- archivos ----------------------------------------------------------------------------------------------------------------------------------------------------------
// fmt: { t(key, params), dateTime(ms), date(iso), duration(ms), kind(k), real(r), state(s), step(type), dept(key), lang } lo manda la pantalla.
const joinNames = (list) => (list || []).map((x) => x.name).filter(Boolean).join(', ');
const slug = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'Equipo';
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// El Registro: una fila por actividad terminada y persona.
function buildLog(rows, fmt) {
    const t = fmt.t;
    const head = ['done', 'activity', 'person', 'kind', 'realization', 'site', 'department', 'area', 'assigned', 'days', 'validator'].map((k) => t(`main.twLogCol_${k}`));
    const data = rows.map((r) => [fmt.date(r.doneAt), r.urgent ? `⚡ ${r.title}` : r.title, r.person.name, fmt.kind(r.kind), fmt.real(r.realization), joinNames(r.sites), fmt.dept(r.department), r.area || '', fmt.date(r.assignedAt), r.days, r.validatedByName || '']);
    const widths = [1.1, 3.2, 1.8, 1.1, 1.1, 1.8, 1.8, 1.5, 1.1, 0.6, 1.5];
    return { title: t('main.twTab_log'), columns: head.map((label) => ({ label })), rows: data, widths, sections: [{ title: t('main.twTab_log'), columns: head.map((label) => ({ label })), rows: data, widths }] };
}
// La línea del tiempo: «Resumen» (una fila por actividad y persona, con sus tiempos) y «Pasos» (cada paso con quién y cuándo).
function buildLine(activities, fmt, now) {
    const t = fmt.t;
    const dur = (ms) => (ms == null ? '' : fmt.duration(ms));
    const sumHead = ['activity', 'kind', 'realization', 'site', 'department', 'person', 'state', 'assigned', 'confirmed', 'started', 'done', 'toConfirm', 'toFinish', 'pauses', 'pauseTime', 'returns'].map((k) => t(`main.twLineCol_${k}`));
    const stepHead = ['activity', 'person', 'site', 'step', 'when', 'by', 'note'].map((k) => t(`main.twLineCol_${k}`));
    const sumRows = []; const stepRows = [];
    activities.forEach((a) => a.people.forEach((p) => {
        const an = analyze(p.steps, now);
        const when = (ms) => (ms == null ? '' : fmt.dateTime(ms));
        sumRows.push([a.title, fmt.kind(a.kind), fmt.real(a.realization), joinNames(a.sites), fmt.dept(a.department), p.name, fmt.state(an.state), when(an.assignedAt), when(an.confirmedAt), when(an.startedAt), when(an.doneAt), dur(an.confirmMs), dur(an.finishMs), an.pauses, an.pauseDurations.length ? dur(sum(an.pauseDurations)) : '', an.returns]);
        an.markers.forEach((m) => stepRows.push([a.title, p.name, joinNames(a.sites), fmt.step(m), fmt.dateTime(m.at), m.by, m.note]));
    }));
    const widths1 = [3, 1.1, 1.1, 1.6, 1.6, 1.6, 1.2, 1.5, 1.5, 1.5, 1.5, 1, 1, 0.7, 1, 0.7];
    const widths2 = [3, 1.6, 1.6, 2.2, 1.6, 1.6, 2.4];
    return { title: t('main.twTab_line'), columns: sumHead.map((label) => ({ label })), rows: sumRows, widths: widths1,
        sections: [{ title: t('main.twLineSheetSummary'), columns: sumHead.map((label) => ({ label })), rows: sumRows, widths: widths1 }, { title: t('main.twLineSheetSteps'), columns: stepHead.map((label) => ({ label })), rows: stepRows, widths: widths2 }] };
}

return { MARKS, markOf, analyze, metrics, durationText, place, clipSegment, spreadMarkers, build, buildLog, buildLine, slug, ymd };
}));
