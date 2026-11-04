// ---------------------------------------------------------------------------
// Admin > Mapa de calor: el Layout de UN centro de costos con cada zona pintada según lo que marcaron sus SENSORES (los que se colocan en el paso Sensores del Layout) a la hora que se elija. Las lecturas salen
// de la misma base de Temperaturas (las que se capturan con el QR de cada sensor). Cada zona se pinta con el PROMEDIO de lo que marcaron sus sensores en esa hora (la última lectura de cada sensor dentro de la hora, en
// tu hora local); cada sensor muestra además su propio valor en su lugar. Una zona sin sensores, o sin lectura a esa hora, queda en gris: no se inventa ningún dato. La escala es FIJA (0 a 40 °C; humedad 0 a 100 %)
// para poder comparar un día con otro. Las horas se guardan en UTC y aquí se ven en tu hora. El servidor solo manda el Layout y las lecturas del día (GET /api/business/climate-map); lo demás se saca aquí.
// ---------------------------------------------------------------------------

// Envuelto en una función: Dashboard.js ya declara globales como t, y chocarían con los de esta pantalla.
(function () {
const LC = window.LayoutCalc;
const t = (key, params) => {
    let text = Dashboard.t(key);
    Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
    return text;
};
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const lang = () => (Dashboard.getLanguage ? Dashboard.getLanguage() : 'es');
const locale = () => (lang() === 'en' ? 'en-US' : 'es-MX');

// Escala fija de colores: temperatura de 0 a 40 °C (azul frío → rojo caliente) y humedad de 0 a 100 % (seco claro → mojado azul).
const SCALE = {
    temp: { min: 0, max: 40, unit: '°C', stops: [[0, [58, 111, 196]], [12, [90, 169, 214]], [20, [143, 209, 158]], [27, [242, 224, 92]], [33, [242, 163, 60]], [40, [214, 69, 61]]], ticks: [0, 10, 20, 30, 40] },
    hum: { min: 0, max: 100, unit: '%', stops: [[0, [245, 236, 205]], [50, [130, 196, 222]], [100, [30, 90, 170]]], ticks: [0, 25, 50, 75, 100] },
};
function colorAt(metric, value) {
    const s = SCALE[metric];
    const v = Math.max(s.min, Math.min(s.max, value));
    for (let i = 1; i < s.stops.length; i++) {
        if (v <= s.stops[i][0]) {
            const [a, ca] = s.stops[i - 1];
            const [b, cb] = s.stops[i];
            const k = (v - a) / (b - a);
            return `#${ca.map((c, j) => Math.round(c + (cb[j] - c) * k).toString(16).padStart(2, '0')).join('')}`;
        }
    }
    return `#${s.stops[s.stops.length - 1][1].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const state = { centerId: null, day: '', hour: 12, metric: 'temp', data: null, buckets: new Map(), perms: { canMetric: true, canPlay: true }, timer: null, seq: 0 };

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
function dayRange(str) {
    const [y, m, d] = str.split('-').map(Number);
    return { from: new Date(y, m - 1, d, 0, 0, 0, 0), to: new Date(y, m - 1, d + 1, 0, 0, 0, 0) };
}
const hourText = (h) => `${pad(h)}:00`;
const fmtValue = (metric, v) => `${Number(v).toFixed(1)} ${SCALE[metric].unit}`;

// ---- datos ---------------------------------------------------------------------------------------------------------------------------
// De cada sensor, la ÚLTIMA lectura de cada hora (hora local): sensorId → hora → lectura.
function buildBuckets(readings) {
    const map = new Map();
    (readings || []).forEach((r) => {
        const when = new Date(r.at);
        if (Number.isNaN(when.getTime())) return;
        const h = when.getHours();
        if (!map.has(r.sensorId)) map.set(r.sensorId, new Map());
        const byHour = map.get(r.sensorId);
        const cur = byHour.get(h);
        if (!cur || when > new Date(cur.at)) byHour.set(h, r);
    });
    return map;
}
// Lo que marcó un sensor a esa hora para la medida elegida (null si no hay lectura o su tipo no la mide).
function sensorReading(sensor, hour, metric) {
    const r = state.buckets.get(sensor.id) && state.buckets.get(sensor.id).get(hour);
    if (!r) return null;
    const v = metric === 'temp' ? r.temperature : r.humidity;
    return v === null || v === undefined ? null : { value: Number(v), at: r.at, name: r.name };
}
// El valor de una zona a esa hora: el promedio de sus sensores que tienen lectura. Sin sensores: null con why 'nosensor'; con sensores pero sin lectura: null con why 'noreading'.
function zoneValue(zone, hour, metric) {
    const sensors = state.data.layout.sensors.filter((s) => s.zoneId === zone.id);
    if (!sensors.length) return { value: null, why: 'nosensor', sensors: [] };
    const reads = sensors.map((s) => ({ sensor: s, reading: sensorReading(s, hour, metric) }));
    const got = reads.filter((r) => r.reading);
    if (!got.length) return { value: null, why: 'noreading', sensors: reads };
    return { value: got.reduce((a, r) => a + r.reading.value, 0) / got.length, why: '', sensors: reads, count: got.length };
}
// Las horas del día en que hay alguna lectura de la medida elegida (los puntos bajo la barra).
function hoursWithData(metric) {
    const hours = new Set();
    state.buckets.forEach((byHour, sensorId) => {
        const sensor = state.data.layout.sensors.find((s) => s.id === sensorId);
        if (!sensor) return;
        byHour.forEach((r, h) => { if ((metric === 'temp' ? r.temperature : r.humidity) !== null && (metric === 'temp' ? r.temperature : r.humidity) !== undefined) hours.add(h); });
    });
    return hours;
}

// ---- dibujo --------------------------------------------------------------------------------------------------------------------------
const W = 700; const H = 460; const M = 28;
function bounds(layout) {
    const xs = []; const ys = [];
    layout.vertices.forEach((p) => { xs.push(p[0]); ys.push(p[1]); });
    layout.zones.forEach((z) => { (LC.zonePoints(z) || []).forEach((p) => { xs.push(p[0]); ys.push(p[1]); }); });
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
function drawMap() {
    const layout = state.data.layout;
    const b = bounds(layout);
    const sc = Math.min((W - 2 * M) / Math.max(b.x1 - b.x0, 0.1), (H - 2 * M) / Math.max(b.y1 - b.y0, 0.1));
    const ox = (W - (b.x1 - b.x0) * sc) / 2;
    const oy = (H - (b.y1 - b.y0) * sc) / 2;
    const X = (x) => ox + (x - b.x0) * sc;
    const Y = (y) => oy + (y - b.y0) * sc;
    const metric = state.metric;
    let s = `<polygon class="heat-nave" points="${layout.vertices.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}"/>`;
    let labels = '';
    layout.zones.forEach((z) => {
        const pts = LC.zonePoints(z);
        if (!pts || pts.length < 3) return;
        const zv = zoneValue(z, state.hour, metric);
        const poly = pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
        const xs = pts.map((p) => X(p[0])); const ys = pts.map((p) => Y(p[1]));
        const bw = Math.max(...xs) - Math.min(...xs); const bh = Math.max(...ys) - Math.min(...ys);
        const cx = (Math.max(...xs) + Math.min(...xs)) / 2; const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
        const tip = zv.value === null ? `${z.name} · ${t(zv.why === 'nosensor' ? 'main.heatSinSensor' : 'main.heatSinLecturaCorto')}` : `${z.name} · ${fmtValue(metric, zv.value)}`;
        s += zv.value === null
            ? `<polygon class="heat-zone none" points="${poly}"><title>${esc(tip)}</title></polygon>`
            : `<polygon class="heat-zone" points="${poly}" fill="${colorAt(metric, zv.value)}"><title>${esc(tip)}</title></polygon>`;
        if (bw >= 44 && bh >= 24) {
            labels += `<text class="heat-zname" x="${cx.toFixed(1)}" y="${(cy - 2).toFixed(1)}" text-anchor="middle">${esc(z.name)}</text>`;
            labels += zv.value === null
                ? `<text class="heat-zval mute" x="${cx.toFixed(1)}" y="${(cy + 13).toFixed(1)}" text-anchor="middle">${esc(t(zv.why === 'nosensor' ? 'main.heatSinSensor' : 'main.heatSinLecturaCorto'))}</text>`
                : `<text class="heat-zval" x="${cx.toFixed(1)}" y="${(cy + 15).toFixed(1)}" text-anchor="middle">${esc(fmtValue(metric, zv.value))}</text>`;
        }
    });
    s += labels;
    // los sensores, sobre su pared, con lo que marcaron a esa hora
    layout.sensors.forEach((sn) => {
        const p = LC.sensorPoint(layout, sn);
        if (!p) return;
        const r = sensorReading(sn, state.hour, metric);
        const px = X(p.x); const py = Y(p.y);
        const dx = X(p.inx) - px; const dy = Y(p.iny) - py;
        const len = Math.hypot(dx, dy) || 1;
        const lx = px + (dx / len) * 17; const ly = py + (dy / len) * 17 + 3;
        const kind = t(`main.layoutType_sensor_${sn.type}`);
        const tip = `${sn.code} · ${kind}${r ? ` · ${fmtValue(metric, r.value)} · ${new Date(r.at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })} · ${r.name || ''}` : ` · ${t('main.heatSinLecturaCorto')}`}`;
        s += `<g class="heat-sensor${r ? '' : ' none'}"><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="5.5"><title>${esc(tip)}</title></circle>${r ? `<text class="heat-sval" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle">${esc(Number(r.value).toFixed(1))}${SCALE[metric].unit === '%' ? '%' : '°'}</text>` : ''}</g>`;
    });
    $('heat-svg').innerHTML = s;
}
function drawLegend() {
    const sc = SCALE[state.metric];
    const stops = sc.stops.map(([v, c]) => `<stop offset="${((v - sc.min) / (sc.max - sc.min)) * 100}%" stop-color="rgb(${c.join(',')})"/>`).join('');
    const ticks = sc.ticks.map((v) => `<text class="lt" x="${10 + ((v - sc.min) / (sc.max - sc.min)) * 240}" y="40" text-anchor="middle">${v}</text>`).join('');
    $('heat-legend').innerHTML = `<svg viewBox="0 0 260 52" width="260" role="img" aria-label="${esc(t('main.heatEscala', { min: sc.min, max: sc.max, unit: sc.unit }))}"><defs><linearGradient id="heat-grad" x1="0" x2="1">${stops}</linearGradient></defs><rect x="10" y="8" width="240" height="14" rx="4" fill="url(#heat-grad)"/>${ticks}<text class="lt" x="130" y="51" text-anchor="middle">${sc.unit}</text></svg>`;
}
function drawTicks() {
    const has = hoursWithData(state.metric);
    $('heat-ticks').innerHTML = Array.from({ length: 24 }, (_, h) => `<span class="heat-tick${has.has(h) ? ' on' : ''}" style="left:${(h / 23) * 100}%"></span>`).join('');
}
function drawZones() {
    const metric = state.metric;
    const zones = state.data.layout.zones.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), lang(), { numeric: true }));
    $('heat-side-title').textContent = t('main.heatLaHora', { hour: hourText(state.hour) });
    $('heat-zones').innerHTML = zones.map((z) => {
        const zv = zoneValue(z, state.hour, metric);
        const dot = zv.value === null ? '<i class="heat-dot none"></i>' : `<i class="heat-dot" style="background:${colorAt(metric, zv.value)}"></i>`;
        let detail;
        if (zv.value === null) detail = `<span class="mute">${esc(t(zv.why === 'nosensor' ? 'main.heatZonaSinSensor' : 'main.heatZonaSinLectura'))}</span>`;
        else {
            const used = zv.sensors.filter((r) => r.reading);
            detail = `<span>${esc(fmtValue(metric, zv.value))} · ${esc(used.length === 1 ? t('main.heatDeUno', { code: used[0].sensor.code }) : t('main.heatPromedio', { codes: used.map((r) => r.sensor.code).join(', ') }))}</span>`
                + used.map((r) => `<span class="mute">${esc(r.sensor.code)} · ${esc(fmtValue(metric, r.reading.value))} · ${esc(new Date(r.reading.at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }))} · ${esc(r.reading.name || '')}</span>`).join('');
        }
        return `<div class="heat-zrow">${dot}<b>${esc(z.name)}</b><div class="heat-zdetail">${detail}</div></div>`;
    }).join('') || `<p class="heat-note">${esc(t('main.heatSinZonas'))}</p>`;
}
function drawNote() {
    const sensors = state.data.layout.sensors.length;
    const any = (state.data.readings || []).length;
    let note = '';
    if (!sensors) note = t('main.heatNotaSinSensores');
    else if (!any) note = t('main.heatNotaSinLecturas');
    else if (state.data.truncated) note = t('main.heatNotaCortado');
    $('heat-note').textContent = note;
}
function render() {
    if (!state.data) return;
    $('heat-hour').value = String(state.hour);
    $('heat-hour-label').textContent = hourText(state.hour);
    document.querySelectorAll('#heat-metric button').forEach((b) => b.setAttribute('aria-pressed', String((b.id === 'heat-metric-temp') === (state.metric === 'temp'))));
    $('heat-metric').hidden = !state.perms.canMetric;
    $('heat-play').hidden = !state.perms.canPlay;
    $('heat-play').innerHTML = `<i class="bx ${state.timer ? 'bx-pause' : 'bx-play'}" aria-hidden="true"></i>`;
    const label = t(state.timer ? 'main.heatPausa' : 'main.heatReproducir');
    $('heat-play').setAttribute('aria-label', label);
    $('heat-play').title = label;
    $('heat-hour').setAttribute('aria-label', t('main.heatHora'));
    drawMap();
    drawLegend();
    drawTicks();
    drawZones();
    drawNote();
}

// ---- reproducir el día ---------------------------------------------------------------------------------------------------------------
function stopPlay() {
    if (state.timer) { window.clearInterval(state.timer); state.timer = null; }
    if (state.data) render();
}
function startPlay() {
    if (state.timer) { stopPlay(); return; }
    if (state.hour >= 23) state.hour = 0;
    state.timer = window.setInterval(() => {
        if (state.hour >= 23) { stopPlay(); return; }
        state.hour += 1;
        render();
    }, 900);
    render();
}

// ---- carga ---------------------------------------------------------------------------------------------------------------------------
function showOnly(which) {
    $('heat-choose-center').hidden = which !== 'choose';
    $('heat-no-layout').hidden = which !== 'nolayout';
    $('heat-screen').hidden = which !== 'screen';
}
async function load() {
    if (state.timer) { window.clearInterval(state.timer); state.timer = null; }
    // el aviso de «centro de costos cambiado» llega mientras la página arranca, antes de que se fije el día: arranca en hoy
    if (!/^\d{4}-\d{2}-\d{2}$/.test(state.day)) state.day = todayStr();
    const seq = ++state.seq;
    state.centerId = Dashboard.getSingleSelectedCostCenterId();
    if (!state.centerId) { state.data = null; showOnly('choose'); return; }
    const { from, to } = dayRange(state.day);
    const res = await fetch(`/api/business/climate-map?costCenterId=${state.centerId}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { credentials: 'include' });
    if (seq !== state.seq) return;
    if (res.status === 404) { state.data = null; showOnly('nolayout'); return; }
    if (!res.ok) throw new Error('climate map failed');
    state.data = await res.json();
    state.buckets = buildBuckets(state.data.readings);
    state.perms = state.data.permissions || state.perms;
    if (!state.perms.canMetric) state.metric = 'temp';
    $('heat-center-chip').textContent = state.data.costCenter ? t('main.heatCentro', { name: state.data.costCenter.name }) : '';
    $('heat-day').value = state.day;
    $('heat-day').max = todayStr();
    // la hora de arranque: la de ahora si el día es hoy; si no, la última hora con lectura (o el mediodía)
    if (state.day === todayStr()) state.hour = new Date().getHours();
    else { const has = Array.from(hoursWithData(state.metric)); state.hour = has.length ? Math.max(...has) : 12; }
    showOnly('screen');
    render();
}

$('heat-day').addEventListener('change', async (event) => {
    const v = event.target.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    state.day = v > todayStr() ? todayStr() : v;
    try { await load(); } catch (err) { console.error('Mapa de calor: no se pudo leer el día', err); Dashboard.showToast(Dashboard.t('admin.saveError'), 'error'); }
});
$('heat-hour').addEventListener('input', (event) => { state.hour = Number(event.target.value) || 0; if (state.timer) { window.clearInterval(state.timer); state.timer = null; } render(); });
$('heat-metric-temp').addEventListener('click', () => { state.metric = 'temp'; render(); });
$('heat-metric-hum').addEventListener('click', () => { state.metric = 'hum'; render(); });
$('heat-play').addEventListener('click', startPlay);
document.addEventListener('sgn:cost-centers-changed', () => { load().catch((err) => console.error('Mapa de calor: no se pudo cargar', err)); });
document.addEventListener('dashboard:language-changed', () => render());

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        state.day = todayStr();
        // el acceso a la base de registros de temperatura (de donde salen estas lecturas) solo sale a quien tiene esa pantalla en el árbol
        $('heat-records-link').hidden = !Dashboard.hasScreenGrant('supply-chain', 'sc-area-distribution-center', 'cat-operaciones/cat-operaciones-centro-dist-temperaturas');
        await load();
    } catch (err) {
        console.error('Mapa de calor failed to initialize:', err);
    }
})();
})();
