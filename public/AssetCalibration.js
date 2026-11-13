// ---------------------------------------------------------------------------
// Calibración de activos: lo que comparten Operaciones > Calibraciones y Gestión > Activos.
// El estado de un certificado se calcula aquí con el DÍA DE QUIEN MIRA (no el del servidor): Vigente, Por vencer (30 días o menos), Vencida, Fuera de tolerancia (el resultado del certificado) y Sin calibración.
// Las fechas son de calendario (AAAA-MM-DD, sin hora). El servidor usa las mismas reglas (calibrationStatus en server.js) para los avisos de la campana y manda el estado ya calculado en la pantalla Calibraciones.
// ---------------------------------------------------------------------------
(function () {
const SOON_DAYS = 30;
const pad = (n) => String(n).padStart(2, '0');
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayNumber = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const t = (key, params) => {
    let text = window.Dashboard ? Dashboard.t(key) : key;
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const localeOf = () => ((window.Dashboard && Dashboard.getLanguage ? Dashboard.getLanguage() : (localStorage.getItem('lang') || 'es')) === 'en' ? 'en-US' : 'es-MX');
// «2028-06-01» -> «01 jun 2028»
function dateText(iso) {
    if (!DAY_RE.test(iso || '')) return '';
    const d = new Date(`${iso}T00:00:00Z`);
    const mon = new Intl.DateTimeFormat(localeOf(), { timeZone: 'UTC', month: 'short' }).format(d).replace('.', '');
    return `${pad(d.getUTCDate())} ${mon} ${d.getUTCFullYear()}`;
}
// cal = { id, dueOn, result } (lo que manda el servidor), o null / { id: null } si el activo todavía no tiene certificado.
function status(cal) {
    if (!cal || cal.id === null || cal.id === undefined || !DAY_RE.test(cal.dueOn || '')) return { key: 'none', daysLeft: null };
    const daysLeft = dayNumber(cal.dueOn) - dayNumber(today());
    if (cal.result === 'out') return { key: 'failed', daysLeft };
    if (daysLeft < 0) return { key: 'expired', daysLeft };
    if (daysLeft <= SOON_DAYS) return { key: 'soon', daysLeft };
    return { key: 'valid', daysLeft };
}
// El texto del chip: mode 'date' (Gestión: «Vigente · 01 jun 2028») o 'days' (Calibraciones: «Vigente · 566 días»).
function chipText(st, cal, mode) {
    const n = st.daysLeft === null ? 0 : Math.abs(st.daysLeft);
    const plural = n === 1 ? '1' : '';
    if (st.key === 'none') return t('main.calChip_none');
    if (st.key === 'failed') return t('main.calChip_failed');
    if (st.key === 'history') return t('main.calChip_history');
    if (mode === 'days') {
        if (st.key === 'soon' && st.daysLeft === 0) return t('main.calChipDays_today');
        return t(`main.calChipDays_${st.key}${plural}`, { n });
    }
    return t(`main.calChipDate_${st.key}`, { date: dateText(cal.dueOn) });
}
// El chip (un <span>). st puede venir ya calculado por el servidor ({ key, daysLeft }); sin st se calcula aquí con el día de quien mira.
function chip(cal, { mode = 'date', st } = {}) {
    const state = st || status(cal);
    const span = document.createElement('span');
    span.className = `cal-chip cal-chip-${state.key}`;
    span.textContent = chipText(state, cal || {}, mode);
    if (cal && cal.dueOn && state.key !== 'none' && state.key !== 'history') span.title = t('main.calChipTip', { date: dateText(cal.dueOn) });
    return span;
}
window.AssetCalibration = { SOON_DAYS, today, status, dateText, chip, chipText };
})();
