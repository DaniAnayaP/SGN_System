// ---------------------------------------------------------------------------
// Planes de trabajo › «Descargar reporte» (Daniel, 2026-11-19): arma, a partir de un plan ya abierto, las hojas del archivo que se baja: «Resumen» (el plan y cuántas actividades lleva cada responsable), «Por actividad» (una fila por renglón
// de CUALQUIER nivel, con su ruta) y, si se pide, «Comentarios». Aquí solo hay lógica (nada de pantalla): PlanesTrabajo.js la llama y le manda el resultado a la ruta de exportar de siempre (/api/business/export/xlsx|pdf). Los totales y el
// avance cuentan las ACTIVIDADES FINALES (los renglones que ya no tienen nada adentro, que son los que se marcan), igual que el avance de la pantalla; así un renglón de arriba no cuenta dos veces. Se prueba en Node.
// ---------------------------------------------------------------------------
(function (root) {
'use strict';
const COLUMNS = ['path', 'level', 'responsible', 'executor', 'start', 'end', 'days', 'status', 'progress', 'inside', 'comments', 'note'];
const DEFAULT_COLUMNS = COLUMNS.filter((key) => key !== 'note');
const WHICH = ['all', 'open', 'done', 'mine'];
// el ancho relativo de cada columna en el PDF
const PDF_WIDTHS = { path: 4, level: 1.4, responsible: 1.7, executor: 1.7, start: 1.2, end: 1.2, days: 0.7, status: 1.2, progress: 1, inside: 0.9, comments: 1.1, note: 3 };
const MONTHS = {
    es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
};
const pad2 = (n) => String(n).padStart(2, '0');
const statusOf = (item) => item.effectiveStatus || item.status || 'pending';
// «2026-11-19» → «19/nov/2026» (fecha de calendario: no se corre por zonas horarias)
function dateText(ymd, lang) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
    if (!m) return '';
    return `${m[3]}/${(MONTHS[lang] || MONTHS.es)[Number(m[2]) - 1]}/${m[1]}`;
}
const dayNumber = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000) : null; };
// «2026-11-19 16:05:00» (UTC, como lo guarda el servidor) → «19/nov/2026 10:05» en la hora de quien lo baja
function dateTimeText(utcSql, lang) {
    const d = new Date(`${String(utcSql || '').replace(' ', 'T')}Z`);
    if (Number.isNaN(d.getTime())) return '';
    return `${pad2(d.getDate())}/${(MONTHS[lang] || MONTHS.es)[d.getMonth()]}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
// el nombre del archivo a partir del nombre del plan (sin acentos ni símbolos)
const slug = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'Plan';

// Por renglón: su ruta (los títulos desde el primer nivel, con él mismo), cuántas actividades finales lleva debajo y cuántas están hechas, y cuántos renglones lleva adentro.
function analyse(items) {
    const byId = new Map(items.map((item) => [item.id, item]));
    const kids = new Map();
    const roots = [];
    items.forEach((item) => {
        if (item.parentId == null || !byId.has(item.parentId)) { roots.push(item); return; }
        if (!kids.has(item.parentId)) kids.set(item.parentId, []);
        kids.get(item.parentId).push(item);
    });
    const info = new Map();
    const visit = (item, trail) => {
        const path = [...trail, item.title];
        const children = kids.get(item.id) || [];
        let leaves = 0;
        let done = 0;
        let inside = 0;
        children.forEach((child) => { const r = visit(child, path); leaves += r.leaves; done += r.done; inside += 1 + r.inside; });
        if (!children.length) { leaves = 1; done = item.status === 'done' ? 1 : 0; }
        info.set(item.id, { path: path.join(' › '), leaves, done, inside, isLeaf: !children.length });
        return { leaves, done, inside };
    };
    roots.forEach((item) => visit(item, []));
    return info;
}
const matchesWhich = (item, which, meId) => {
    if (which === 'open') return statusOf(item) !== 'done';
    if (which === 'done') return statusOf(item) === 'done';
    if (which === 'mine') return meId != null && (item.responsibleUserId === meId || item.executorUserId === meId);
    return true;
};
// Cuántos renglones entran con cada elección de «Qué actividades» (para mostrarlo en la ventana).
function countByWhich(items, meId) {
    const out = {};
    WHICH.forEach((which) => { out[which] = items.filter((item) => matchesWhich(item, which, meId)).length; });
    return out;
}
// plan, items = lo que trae el plan abierto; options = { which, columns: [claves], comments: true|false }; meId = quién descarga; comments = [{ itemId|null, authorName, body, createdAt }]; t(clave, { n }) = los textos del idioma;
// weekLabel = «Semana 1 de 3»; today = AAAA-MM-DD. Devuelve { filename, header: [[etiqueta, valor]], sections: [{ title, columns: [{ label }], rows, widths }], counts }.
function buildReport({ plan, items, options, meId, comments, t, lang, today, weekLabel }) {
    const language = lang === 'en' ? 'en' : 'es';
    const opts = options || {};
    const which = WHICH.includes(opts.which) ? opts.which : 'all';
    const columns = COLUMNS.filter((key) => (Array.isArray(opts.columns) ? opts.columns : DEFAULT_COLUMNS).includes(key));
    const info = analyse(items);
    const levelName = (depth) => (plan.levelNames && plan.levelNames[depth - 1]) || t('main.wpLevelDefault', { n: depth });
    const finals = items.filter((item) => (info.get(item.id) || {}).isLeaf);
    const stat = { pending: 0, in_progress: 0, done: 0 };
    finals.forEach((item) => { stat[item.status] = (stat[item.status] || 0) + 1; });
    const totalComments = Number.isInteger(plan.commentCount) ? plan.commentCount : items.reduce((n, item) => n + (item.commentCount || 0), 0);
    const header = [
        [t('main.wpRepH_plan'), plan.title],
        [t('main.wpRepH_period'), plan.startDate && plan.endDate ? `${dateText(plan.startDate, language)} – ${dateText(plan.endDate, language)}` : t('main.wpNoDates')],
        [t('main.wpRepH_week'), weekLabel || t('main.wpNoDates')],
        [t('main.wpRepH_progress'), t('main.wpRepProgressOf', { pct: plan.progress || 0, done: stat.done, total: finals.length })],
        [t('main.wpRepH_states'), t('main.wpRepStates', { p: stat.pending, r: stat.in_progress, d: stat.done })],
        [t('main.wpRepH_comments'), String(totalComments)],
        [t('main.wpRepH_downloaded'), dateText(today, language)],
    ];

    // Resumen: cuántas actividades finales lleva cada responsable (sin responsable, al final) y el total
    const byWho = new Map();
    finals.forEach((item) => {
        const name = String(item.responsibleName || '').trim();
        if (!byWho.has(name)) byWho.set(name, { pending: 0, in_progress: 0, done: 0 });
        byWho.get(name)[item.status] += 1;
    });
    const names = [...byWho.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, language)));
    const summaryRows = names.map((name) => { const c = byWho.get(name); return [name || t('main.wpRepNoResp'), String(c.pending + c.in_progress + c.done), String(c.pending), String(c.in_progress), String(c.done)]; });
    summaryRows.push([t('main.wpRepS_total'), String(finals.length), String(stat.pending), String(stat.in_progress), String(stat.done)]);
    const summary = {
        title: t('main.wpRepSheetSummary'),
        columns: ['responsible', 'assigned', 'pending', 'running', 'done'].map((key) => ({ label: t(`main.wpRepS_${key}`) })),
        rows: summaryRows, widths: [3, 1, 1, 1, 1],
    };

    // Por actividad: una fila por renglón de cualquier nivel que cumpla la elección, en el orden del plan
    const shown = items.filter((item) => matchesWhich(item, which, meId));
    const valueOf = (item, key) => {
        const i = info.get(item.id) || { path: item.title, leaves: 1, done: 0, inside: 0, isLeaf: true };
        const start = item.rangeStart || item.startDate || '';
        const end = item.rangeEnd || item.endDate || '';
        if (key === 'path') return i.path;
        if (key === 'level') return levelName(item.depth);
        if (key === 'responsible') return item.responsibleName || '';
        if (key === 'executor') return item.executorName || '';
        if (key === 'start') return dateText(start, language);
        if (key === 'end') return dateText(end, language);
        if (key === 'days') { const a = dayNumber(start); const b = dayNumber(end); return a != null && b != null && b >= a ? String(b - a + 1) : ''; }
        if (key === 'status') return t(`main.wpStatus_${statusOf(item)}`);
        if (key === 'progress') return i.isLeaf ? '' : t('main.wpRepOf', { done: i.done, total: i.leaves });
        if (key === 'inside') return i.isLeaf ? '' : String(i.inside);
        if (key === 'comments') return String(item.commentCount || 0);
        return item.note || '';
    };
    const activity = {
        title: t('main.wpRepSheetActivities'),
        columns: columns.map((key) => ({ label: t(`main.wpRepCol_${key}`) })),
        rows: shown.map((item) => columns.map((key) => valueOf(item, key))),
        widths: columns.map((key) => PDF_WIDTHS[key]),
    };
    const sections = [summary, activity];

    // Comentarios (solo si se pide): los de los renglones que entraron y los del plan completo
    let commentRows = 0;
    if (opts.comments) {
        const ids = new Set(shown.map((item) => item.id));
        const rows = (comments || []).filter((c) => c.itemId == null || ids.has(c.itemId)).map((c) => [
            c.itemId == null ? `${t('main.wpRepPlanLevel')}: ${plan.title}` : ((info.get(c.itemId) || {}).path || ''),
            c.authorName || '', dateTimeText(c.createdAt, language), c.body || '',
        ]);
        commentRows = rows.length;
        sections.push({
            title: t('main.wpRepSheetComments'),
            columns: [t('main.wpRepCol_path'), t('main.wpRepC_who'), t('main.wpRepC_when'), t('main.wpRepC_text')].map((label) => ({ label })),
            rows, widths: [3, 1.5, 1.5, 5],
        });
    }
    return { filename: `${slug(plan.title)}_${today}`, header, sections, counts: { activities: shown.length, comments: commentRows } };
}
const api = { COLUMNS, DEFAULT_COLUMNS, WHICH, buildReport, countByWhich, dateText, dateTimeText, slug };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (root) root.PlanReport = api;
})(typeof window !== 'undefined' ? window : null);
