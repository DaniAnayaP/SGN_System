// ---------------------------------------------------------------------------
// Cadena de Suministro › Centro de Distribución › Cargas Manuales › Registros Información (Daniel, 2026-11-25, «Sí a las propuestas, con la opción B»): el histórico de lo que se carga a mano.
// Un registro es un tipo de dato con su plantilla y su periodicidad: «Cargos por sitio mensuales» (un mes por columna) y «Existencias actuales diarias» (una foto por día). Las cargas SOLO AGREGAN:
// un mes nuevo entra como columna nueva, un código nuevo como renglón nuevo y nada de lo ya cargado se modifica; una carga equivocada se anula (no se borra).
// Dos tablas estándar: «Datos» (un renglón por unidad y código, con un mes —o un día— por columna) y «Cargas» (el historial). «Cargar registro» abre la ventana de carga: con la plantilla (las columnas se reconocen solas)
// o con mi Excel (tal como sale del otro sistema; se emparejan sus columnas una vez); las dos terminan en la misma revisión. Los botones son del árbol (colRegCargarPlantillaAuth, colRegCargarExcelAuth, colRegAnularAuth).
// ---------------------------------------------------------------------------
(function () {
const API = '/api/business/manual-registries';
const DATA_TABLE = 'registros';
const LOADS_TABLE = 'registros-cargas';
const DIM_COLUMNS = [
    { col: 'colRegUnidad', field: 'unidad', dim: 'unidad' }, { col: 'colRegUnidadNombre', field: 'unidadNombre', dim: 'unidadNombre' }, { col: 'colRegCodigo', field: 'codigo', dim: 'codigo' },
    { col: 'colRegDescripcion', field: 'descripcion', dim: 'descripcion' }, { col: 'colRegCategoria', field: 'categoria', dim: 'categoria' }, { col: 'colRegUdm', field: 'udm', dim: 'udm' },
];
const LOAD_COLUMNS = ['colRegCargaArchivo', 'colRegCargaOrigen', 'colRegCargaFechaHora', 'colRegCargaPor', 'colRegCargaPeriodos', 'colRegCargaRenglones', 'colRegCargaNuevos', 'colRegCargaAgregados', 'colRegCargaYaEstaba', 'colRegCargaDistintos', 'colRegCargaErrores', 'colRegCargaEstado'];
const ISSUES_SHOWN = 200;
// la paleta de las clasificaciones de columnas (el color de la banda de cada clasificación y los círculos de la ventana de cargar)
const CLASS_COLORS = ['#3f78ad', '#b23fb8', '#2b8456', '#b57a05', '#4f58c2', '#c4473a'];
const FIRST_ROWS = 100; // los renglones que se dibujan al entrar
const NEXT_ROWS = 200; // los que se agregan al bajar o con «Mostrar más»
const t = (key, params) => Dashboard.t(key, params);
const lang = () => (localStorage.getItem('lang') === 'en' ? 'en' : 'es');
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// un solo formateador por idioma: toLocaleString con opciones arma uno nuevo en cada llamada, y la tabla de datos formatea decenas de miles de celdas
const NUM_FORMATS = {};
const num = (n) => {
    const l = lang() === 'en' ? 'en-US' : 'es-MX';
    return (NUM_FORMATS[l] || (NUM_FORMATS[l] = new Intl.NumberFormat(l, { maximumFractionDigits: 3 }))).format(Number(n || 0));
};
const MONTH_ABBR = { es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], en: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] };
function periodLabel(period) {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(period || '');
    if (!m) return String(period || '');
    const abbr = MONTH_ABBR[lang()][Number(m[2]) - 1];
    return m[3] ? `${m[3]}/${abbr}/${m[1]}` : `${abbr}-${m[1].slice(2)}`;
}
const periodKey = (period) => `p_${String(period).replace(/-/g, '_')}`;
const todayStamp = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const st = { drawn: 0, cf: null, seq: 0, lastLoadId: null, registries: [], key: null, tab: 'data', data: null, loads: null, canTemplate: false, canExcel: false, canAnnul: false, canCreateRegistry: false, text: '', loadsInit: false, loadPick: new Set(), numCols: new Set() };
// El nombre de un registro: los dos de siempre se traducen; los que agregó el cliente llevan el nombre que él les puso.
const regName = (reg) => (reg && (reg.name || (reg.nameKey ? t(reg.nameKey) : ''))) || t('menu.cmRegistrosInformacion');
const currentRegistry = () => st.registries.find((r) => r.key === st.key) || null;
const wrapperOf = (tableId) => document.querySelector(`[data-table-id="${tableId}"]`);
const tableOf = (tableId) => wrapperOf(tableId)?.querySelector('table.data-table');

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await loadRegistries();
        // «＋ Agregar nuevo registro» (?nuevo=1): solo la ventana de alta, sin pedir ni dibujar otro registro detrás; al cancelar se abre el registro que se estaba viendo
        if (new URLSearchParams(location.search).get('nuevo') === '1' && st.canCreateRegistry) {
            const page = document.querySelector('.page-content');
            if (page) page.hidden = true;
            openCreateRegistry(() => location.replace(location.pathname));
            return;
        }
        // cada registro agregado tiene su propia pantalla en el menú (?registry=); sin él, el último que se vio
        const wanted = new URLSearchParams(location.search).get('registry') || sessionStorage.getItem('regCurrent');
        st.key = (st.registries.find((r) => r.key === wanted) || st.registries[0] || {}).key || null;
        if (st.key) { try { sessionStorage.setItem('regCurrent', st.key); } catch { /* sin almacenamiento */ } }
        renderManage();
        await refreshData();
        wireStatic();
        openNewFromMenu();
    } catch (err) {
        console.error('Registros Información: failed to initialize', err);
    }
})();

async function loadRegistries() {
    const res = await fetch(API, { credentials: 'include' });
    if (!res.ok) throw new Error('load failed');
    const body = await res.json();
    st.registries = body.registries || [];
    st.canTemplate = !!body.canTemplate; st.canExcel = !!body.canExcel; st.canAnnul = !!body.canAnnul; st.canCreateRegistry = !!body.canCreateRegistry; st.canObsolete = !!body.canObsolete;
}

// Cambiar nombre y desactivar/activar: solo para los registros que agregó el cliente (los dos de siempre no se tocan) y para quien tiene el botón «Crear registro».
function renderManage() {
    let bar = document.getElementById('reg-manage');
    const reg = currentRegistry();
    if (!reg) { if (bar) bar.remove(); return; }
    const canManage = !!st.canCreateRegistry; // cambiar nombre, convertir y desactivar (solo los agregados), de «Agregar nuevo registro»; «Pasar a obsoletos» (todos), de su propio botón del árbol
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'reg-manage';
        bar.className = 'reg-manage';
        bar.setAttribute('data-help-key', 'regManage');
        const row = document.querySelector('.reg-row');
        if (row) row.before(bar); else document.querySelector('.page-content').prepend(bar);
    }
    bar.textContent = '';
    // el nombre del registro al inicio de la fila, antes de «Cambiar nombre» (Daniel, 2026-11-27), como el título de un análisis; lo ve todo el que abre el registro
    const title = document.createElement('h2'); title.className = 'an-title'; title.textContent = regName(reg); bar.appendChild(title);
    if (reg.status !== 'active') { const off = document.createElement('span'); off.className = 'reg-pill reg-pill-off'; off.textContent = t('main.regStatus_inactive'); bar.appendChild(off); }
    if (reg.obsolete) { const ob = document.createElement('span'); ob.className = 'reg-pill reg-pill-off'; ob.textContent = t('main.regStatus_obsolete'); bar.appendChild(ob); }
    const make = (icon, key, onClick) => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'btn btn-secondary reg-manage-btn';
        btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i> <span>${esc(t(key))}</span>`;
        btn.addEventListener('click', onClick);
        bar.appendChild(btn);
        return btn;
    };
    if (!canManage && !st.canObsolete) return; // sin ningún permiso de administrar registros solo se ve el nombre
    if (canManage && reg.custom) make('bx-edit', 'main.regRename', () => openRenameRegistry(reg));
    if (canManage && reg.custom && reg.kind !== 'tabla' && !reg.lastLoad && !reg.obsolete) make('bx-table', 'main.regToTabla', () => openConvertRegistry(reg)); // solo mientras no tenga cargas
    if (canManage && reg.kind !== 'tabla' && !reg.obsolete && reg.periods && reg.periods.length) make('bx-transfer', 'main.regMigrate', () => openMigrateRegistry(reg)).dataset.helpKey = 'regMigrateBtn'; // pasar a tabla única (Daniel, 2026-11-27)
    if (st.canObsolete) make(reg.obsolete ? 'bx-archive-out' : 'bx-archive-in', reg.obsolete ? 'main.regRestoreObsolete' : 'main.regMakeObsolete', () => toggleObsolete(reg));
    if (canManage && reg.custom) make(reg.status === 'active' ? 'bx-hide' : 'bx-show', reg.status === 'active' ? 'main.regDeactivate' : 'main.regActivate', () => toggleRegistry(reg));
}
// La opción «＋ Agregar nuevo registro» del menú lateral abre esta pantalla con ?nuevo=1: se muestra la ventana de alta (solo con el botón «Crear registro») y se limpia la dirección.
function openNewFromMenu() {
    const params = new URLSearchParams(location.search);
    if (params.get('nuevo') !== '1') return;
    params.delete('nuevo');
    history.replaceState(null, '', params.toString() ? `${location.pathname}?${params}` : location.pathname);
    if (st.canCreateRegistry) openCreateRegistry();
}
function regErrorText(body) {
    const code = body && body.code;
    return ['REG_NAME_REQUIRED', 'REG_NAME_TAKEN', 'REG_KIND', 'REG_FORBIDDEN', 'REG_STATUS', 'REG_BUILTIN', 'REG_HAS_DATA', 'REG_OBSOLETE', 'REG_MIGRATE_KIND', 'REG_NO_DATA', 'REG_MIGRATION_EXISTS', 'REG_MIGRATION_STATE', 'REG_MIGRATION_UNVERIFIED', 'REG_BUSY'].includes(code) ? t(`main.regErr_${code}`) : t('admin.saveError');
}
function openModal(html, helpKey, onReady, afterClose) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    overlay.innerHTML = `<div class="modal-panel exp-panel" role="dialog" aria-modal="true" data-help-key="${helpKey}">${html}</div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); if (afterClose) afterClose(); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    overlay.querySelectorAll('[data-reg-close]').forEach((b) => b.addEventListener('click', close));
    onReady(overlay, close);
}
async function sendRegistry(method, url, body) {
    const res = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('failed'), { body: out });
    return out;
}
// Registro nuevo: nombre, cada cuánto se carga y qué mide. Siempre lleva las mismas columnas de referencia (Unidad, Descripción Unidad, Código, Descripción, Categoría y UDM); al crearlo se abre su pantalla.
function openCreateRegistry(afterClose) {
    openModal(`<h3>${esc(t('main.regNewTitle'))}</h3>
        <label for="reg-n-name">${esc(t('main.regNewName'))}</label><input type="text" id="reg-n-name" maxlength="80" autocomplete="off">
        <p class="admin-error" id="reg-n-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-reg-go>${esc(t('main.regNewCreate'))}</button><button type="button" class="btn btn-secondary" data-reg-close>${esc(t('main.regCancel'))}</button></div>`, 'regNewDialog', (overlay) => {
        overlay.querySelector('#reg-n-name').focus();
        overlay.querySelector('#reg-n-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); overlay.querySelector('[data-reg-go]').click(); } });
        overlay.querySelector('[data-reg-go]').addEventListener('click', async (event) => {
            const btn = event.currentTarget;
            const el = overlay.querySelector('#reg-n-error');
            btn.disabled = true; el.hidden = true;
            try {
                const out = await sendRegistry('POST', API, { name: overlay.querySelector('#reg-n-name').value });
                sessionStorage.setItem('regCurrent', out.registry.key);
                location.href = `CmRegistrosInformacion.html?registry=${encodeURIComponent(out.registry.key)}`; // el menú ya la trae como pantalla nueva
            } catch (e) { btn.disabled = false; el.textContent = regErrorText(e.body); el.hidden = false; }
        });
    }, afterClose);
}
function openRenameRegistry(reg) {
    openModal(`<h3>${esc(t('main.regRename'))}</h3><label for="reg-r-name">${esc(t('main.regNewName'))}</label><input type="text" id="reg-r-name" maxlength="80" value="${esc(reg.name)}" autocomplete="off">
        <p class="admin-error" id="reg-r-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-reg-go>${esc(t('main.regRename'))}</button><button type="button" class="btn btn-secondary" data-reg-close>${esc(t('main.regCancel'))}</button></div>`, 'regRenameDialog', (overlay) => {
        overlay.querySelector('#reg-r-name').focus();
        overlay.querySelector('[data-reg-go]').addEventListener('click', async (event) => {
            const btn = event.currentTarget; btn.disabled = true;
            try {
                await sendRegistry('PATCH', `${API}/${encodeURIComponent(reg.key)}`, { name: overlay.querySelector('#reg-r-name').value });
                location.reload(); // el menú trae el nombre nuevo
            } catch (e) { btn.disabled = false; const el = overlay.querySelector('#reg-r-error'); el.textContent = regErrorText(e.body); el.hidden = false; }
        });
    });
}
// Pasar un registro Mensual o Diaria al tipo único (la tabla libre; Daniel, 2026-11-27, «tú pasa los datos y pégalos como deben de estar»): copiar → comprobar → confirmar. El servidor hace la copia en segundo plano (ver registryMigrate.js);
// aquí se elige el nombre, se ve el avance y, al terminar, la comprobación contra lo anterior. Solo con las cifras iguales se puede confirmar; lo anterior no se toca hasta entonces.
function openMigrateRegistry(reg) {
    let timer = null;
    let lastStatus = '';
    openModal(`<h3>${esc(t('main.regMigrateTitle', { name: regName(reg) }))}</h3><div id="reg-mg-body"></div>`, 'regMigrateDialog', (overlay, close) => {
        const body = overlay.querySelector('#reg-mg-body');
        const base = `${API}/${encodeURIComponent(reg.key)}`;
        const fmtN = (n) => Number(n).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 2 });
        const get = async () => { const res = await fetch(`${base}/migration?lang=${lang()}`, { credentials: 'include' }); if (!res.ok) throw new Error('failed'); return res.json(); };
        const send = async (path, payload) => {
            const res = await fetch(`${base}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) });
            const out = await res.json().catch(() => ({}));
            if (!res.ok) throw Object.assign(new Error('failed'), { body: out });
            return out;
        };
        const showError = (e) => { const el = body.querySelector('#reg-mg-error'); if (!el) return; el.textContent = regErrorText(e && e.body); el.hidden = false; };
        const buttons = (...list) => `<div class="admin-form-actions">${list.join('')}</div>`;
        const btn = (id, key, cls = '') => `<button type="button" class="btn ${cls}" data-mg="${id}">${esc(t(key))}</button>`;
        const stopTimer = () => { clearInterval(timer); timer = null; };
        const startTimer = () => { if (!timer) timer = setInterval(refresh, 1500); };
        const bind = (id, fn) => { const b = body.querySelector(`[data-mg="${id}"]`); if (b) b.addEventListener('click', async () => { b.disabled = true; try { await fn(); } catch (e) { b.disabled = false; showError(e); } }); };
        // el final: el anterior pasó a Obsoletos, cuántos análisis ya leen la tabla nueva y cuántos se quedaron leyendo el anterior
        const doneHtml = (mg) => {
            const rep = (mg && mg.report) || {};
            const moved = rep.applied ? rep.applied.moved : 0;
            const kept = (Array.isArray(rep.analyses) ? rep.analyses.length : 0) - moved;
            return `<p class="reg-mg-ok">${esc(t('main.regMigrateDone', { name: regName(reg) }))}</p>${moved ? `<p class="reg-mg-ok">${esc(t(moved === 1 ? 'main.regMigrateDoneAnalysesOne' : 'main.regMigrateDoneAnalyses', { count: String(moved) }))}</p>` : ''}${kept > 0 ? `<p class="note">${esc(t(kept === 1 ? 'main.regMigrateDoneKeptOne' : 'main.regMigrateDoneKept', { count: String(kept) }))}</p>` : ''}${buttons(btn('open', 'main.regMigrateOpen'))}`;
        };
        const draw = (info) => {
            const mg = info.migration;
            const status = mg ? mg.status : 'none';
            if (status === 'copiando') {
                const p = mg.progress || {};
                const pct = p.total ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
                body.innerHTML = `<p>${esc(p.phase === 'analisis' ? t('main.regMigrateAnalysisChecking') : (p.phase === 'comprobando' ? t('main.regMigrateChecking') : t('main.regMigrateRunning', { done: fmtN(p.done || 0), total: fmtN(p.total || 0) })))}</p><div class="reg-mg-bar"><span style="width:${pct}%"></span></div><p class="note">${esc(t('main.regMigrateWait'))}</p>`;
                startTimer();
                return;
            }
            stopTimer();
            if (status === 'none') {
                body.innerHTML = `<p>${esc(t('main.regMigrateIntro', { name: regName(reg) }))}</p>
                    <label for="reg-mg-name">${esc(t('main.regMigrateName'))}</label><input type="text" id="reg-mg-name" maxlength="80" autocomplete="off" value="${esc(`${regName(reg)} (tabla)`)}">
                    <p class="admin-error" id="reg-mg-error" role="alert" hidden></p>
                    ${buttons(btn('go', 'main.regMigrateGo'), btn('cancel', 'main.regCancel', 'btn-secondary'))}`;
                bind('go', async () => { await send('/migrate?lang=' + lang(), { name: body.querySelector('#reg-mg-name').value }); await refresh(); });
                bind('cancel', async () => close());
            } else if (status === 'copiado') {
                const rep = mg.report || { ok: false, rows: { old: 0, new: 0 }, periods: [], data: [], values: { old: 0, new: 0 } };
                const mark = (ok) => `<span class="${ok ? 'reg-mg-ok' : 'reg-mg-bad'}">${ok ? '✓' : '✗'}</span>`;
                // los análisis que leen este registro: cuáles pasan solos a la tabla nueva (salen idénticos) y cuáles se quedan leyendo el anterior, con el motivo
                const analyses = Array.isArray(rep.analyses) ? rep.analyses : [];
                const anOk = analyses.filter((a) => a.status === 'ok');
                const anSkip = analyses.filter((a) => a.status !== 'ok');
                const analysesHtml = rep.analysesFailed ? `<p class="note">${esc(t('main.regMigrateAnalysesFailed'))}</p>`
                    : (!analyses.length ? `<p class="note">${esc(t('main.regMigrateAnalysesNone'))}</p>`
                        : `<p class="note"><b>${esc(t('main.regMigrateAnalysesTitle'))}</b>${anOk.length ? `: ${mark(true)} ${esc(t('main.regMigrateAnalysesOk', { names: anOk.map((a) => a.name).join(', ') }))}` : ''}</p>${anSkip.length ? `<p class="note">${mark(false)} ${esc(t('main.regMigrateAnalysesSkip'))}: ${anSkip.map((a) => `${esc(a.name)} (${esc(t(`main.regMigrateWhy_${a.reason}`))})`).join(' · ')}</p>` : ''}`);
                body.innerHTML = `<p class="${rep.ok ? 'reg-mg-ok' : 'reg-mg-bad'}">${esc(t(rep.ok ? 'main.regMigrateOk' : 'main.regMigrateBad'))}</p>
                    <p>${esc(t('main.regMigrateRowsLine', { old: fmtN(rep.rows.old), new: fmtN(rep.rows.new) }))} ${mark(rep.rows.ok)}<br>${esc(t('main.regMigrateValuesLine', { old: fmtN(rep.values.old), new: fmtN(rep.values.new) }))}</p>
                    <div class="reg-mg-scroll"><table class="reg-mg-table"><thead><tr><th>${esc(t('main.regMigrateColPeriod'))}</th><th>${esc(t('main.regMigrateColBefore'))}</th><th>${esc(t('main.regMigrateColAfter'))}</th><th>${esc(t('main.regMigrateSumBefore'))}</th><th>${esc(t('main.regMigrateSumAfter'))}</th><th></th></tr></thead><tbody>${rep.periods.map((p) => `<tr><td>${esc(p.label)}</td><td>${fmtN(p.oldCount)}</td><td>${fmtN(p.newCount)}</td><td>${fmtN(p.oldSum)}</td><td>${fmtN(p.newSum)}</td><td>${mark(p.ok)}</td></tr>`).join('')}</tbody></table></div>
                    <p class="note">${esc(t('main.regMigrateDataTitle'))}: ${rep.data.map((d) => `${esc(d.name)} ${fmtN(d.old)} → ${fmtN(d.new)} ${mark(d.ok)}`).join(' · ')}</p>
                    ${analysesHtml}
                    <p class="admin-error" id="reg-mg-error" role="alert" hidden></p>
                    ${buttons(...(rep.ok && st.canObsolete ? [btn('confirm', 'main.regMigrateConfirm')] : []), btn('discard', 'main.regMigrateDiscard', 'btn-secondary'), btn('close', 'main.regClose', 'btn-secondary'))}`;
                bind('confirm', async () => {
                    const out = await send('/migrate/confirm');
                    body.innerHTML = doneHtml(out.migration);
                    bind('open', async () => { sessionStorage.setItem('regCurrent', out.newKey); location.href = `CmRegistrosInformacion.html?registry=${encodeURIComponent(out.newKey)}`; });
                });
                bind('discard', async () => { await send('/migrate/discard'); await refresh(); });
                bind('close', async () => close());
            } else if (status === 'error') {
                body.innerHTML = `<p class="reg-mg-bad">${esc(t('main.regMigrateErr_' + (['INTERRUPTED', 'DISK_FULL', 'NO_DATA'].includes(mg.error) ? mg.error : 'ERROR')))}</p>
                    <p class="admin-error" id="reg-mg-error" role="alert" hidden></p>
                    ${buttons(btn('discard', 'main.regMigrateDiscard'), btn('close', 'main.regClose', 'btn-secondary'))}`;
                bind('discard', async () => { await send('/migrate/discard'); await refresh(); });
                bind('close', async () => close());
            } else if (status === 'confirmado') {
                body.innerHTML = doneHtml(mg);
                bind('open', async () => { sessionStorage.setItem('regCurrent', mg.newKey); location.href = `CmRegistrosInformacion.html?registry=${encodeURIComponent(mg.newKey)}`; });
            }
            lastStatus = status;
        };
        const refresh = async () => { try { draw(await get()); } catch { /* sin conexión: la próxima vuelta lo reintenta */ } };
        refresh();
    }, () => { clearInterval(timer); });
}
// Convertir un registro vacío (mensual o diario) en tabla libre: cualquier Excel, eligiendo el papel de sus columnas en cada carga. Solo se puede mientras no tenga cargas.
function openConvertRegistry(reg) {
    openModal(`<h3>${esc(t('main.regToTablaTitle'))}</h3><p>${esc(t('main.regToTablaText', { name: regName(reg) }))}</p>
        <p class="admin-error" id="reg-c-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-reg-go>${esc(t('main.regToTablaGo'))}</button><button type="button" class="btn btn-secondary" data-reg-close>${esc(t('main.regCancel'))}</button></div>`, 'regToTablaDialog', (overlay) => {
        overlay.querySelector('[data-reg-go]').addEventListener('click', async (event) => {
            const btn = event.currentTarget; btn.disabled = true;
            try {
                await sendRegistry('PATCH', `${API}/${encodeURIComponent(reg.key)}`, { kind: 'tabla' });
                location.reload();
            } catch (e) { btn.disabled = false; const el = overlay.querySelector('#reg-c-error'); el.textContent = regErrorText(e.body); el.hidden = false; }
        });
    });
}
// Pasar a «Obsoletos» (o sacarlo de ahí): sus datos y cargas se conservan, ya no recibe cargas y sale en el apartado Obsoletos del menú.
async function toggleObsolete(reg) {
    try {
        await sendRegistry('PATCH', `${API}/${encodeURIComponent(reg.key)}`, { obsolete: !reg.obsolete });
        location.reload(); // el menú lo cambia de apartado
    } catch (e) { Dashboard.showToast(regErrorText(e.body), 'error'); }
}
async function toggleRegistry(reg) {
    try {
        await sendRegistry('PATCH', `${API}/${encodeURIComponent(reg.key)}`, { status: reg.status === 'active' ? 'inactive' : 'active' });
        location.reload(); // sale del menú (o vuelve a salir)
    } catch (e) { Dashboard.showToast(regErrorText(e.body), 'error'); }
}

// ---- la fecha de la última actualización: en la fila de las pestañas, a la derecha; el detalle (quién y de qué archivo) está en la pestaña Cargas ---------------------------------------
function renderUpdated() {
    const box = document.getElementById('reg-updated');
    if (!box) return;
    box.textContent = '';
    const reg = currentRegistry();
    const load = reg && reg.lastLoad;
    box.hidden = !load;
    if (!load) return;
    const label = document.createElement('b');
    label.textContent = `${t('main.regUpdated')} `;
    const when = document.createElement('span');
    Dashboard.renderTimeStamp(when, load.createdAt);
    box.append(label, when);
}

// ---- las tablas ----------------------------------------------------------------------------------------------------------------------------------
function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function stampCell(col, value) {
    const td = document.createElement('td');
    td.dataset.col = col;
    if (value) { const span = document.createElement('span'); Dashboard.renderTimeStamp(span, value); td.appendChild(span); } else td.textContent = '—';
    return td;
}
function headerCell(col, group, label, labelKey, extraClass, groupTable) {
    const th = document.createElement('th');
    th.dataset.col = col;
    if (group) th.dataset.group = group;
    if (groupTable) th.dataset.groupTable = groupTable; // la clasificación que le puso la persona (banda de arriba, con su color)
    if (labelKey) { th.dataset.i18n = labelKey; th.textContent = t(labelKey); } else th.textContent = label;
    if (extraClass) th.className = extraClass;
    return th;
}
// La fila de títulos se arma al cargar (los meses cambian con los datos) y recién entonces se le entrega al motor de tablas; una tabla que ya se inició no cambia sus columnas.
function buildHeader(tableId, columns) {
    const table = tableOf(tableId);
    if (!table || table.dataset.colInit) return false;
    const row = table.tHead.rows[0] || table.tHead.insertRow();
    row.textContent = '';
    columns.forEach((c) => row.appendChild(headerCell(c.col, c.group, c.label, c.labelKey, c.cls, c.groupTable)));
    return true;
}
function ensureEmpty(tableId, span) {
    const tbody = tableOf(tableId).tBodies[0];
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = span;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = t('main.emptyStateText');
    td.appendChild(inner); tr.appendChild(td); tbody.appendChild(tr);
}
// Un registro de tabla libre trae sus columnas del servidor (las de su Excel, en su orden, cada una con su papel); los demás tienen las de siempre.
const isFlex = (body) => !!(body && Array.isArray(body.columns));
const FLEX_GROUPS = { key: 'main.regGroupKey', data: 'main.regGroupData', value: 'main.regGroupNew', load: 'main.regGroupLoad' };
const flexColumns = (body) => body.columns.map((c) => {
    let groupTable;
    if (c.cls) { groupTable = `regcls:${c.cls.toLowerCase().replace(/\s+/g, '-')}`; if (Dashboard.setColumnClassMeta) Dashboard.setColumnClassMeta(groupTable, c.cls, CLASS_COLORS[c.color] || CLASS_COLORS[0]); }
    return { col: c.key, group: FLEX_GROUPS[c.group] || FLEX_GROUPS.data, groupTable, label: c.label, cls: c.num ? 'col-num' : '' };
});
const tzOffset = () => new Date().getTimezoneOffset(); // minutos que la hora de quien mira va detrás de UTC: las etiquetas de día y hora de las cargas salen en su hora
function dataColumns(periods) {
    return [
        ...DIM_COLUMNS.map((c) => ({ col: c.col, group: 'menu.cmRegistrosInformacion', labelKey: `main.${c.col}` })),
        ...periods.map((p) => ({ col: periodKey(p), group: 'menu.cmRegistrosInformacion', label: periodLabel(p), cls: 'col-num' })),
    ];
}
// ---- el formato de cada columna en pantalla (menú ⋮ del encabezado; ver FlexFormat.js): vale para todas las cargas de esa columna (se empareja por el nombre) y el Excel que se descarga sale igual ----
const fmtKey = (name) => String(name == null ? '' : name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80);
const fmtSaveTimers = new Map();
function saveColumnFormat(col, f) {
    const key = fmtKey(col.name);
    clearTimeout(fmtSaveTimers.get(key));
    fmtSaveTimers.set(key, setTimeout(async () => {
        try {
            const res = await fetch(`${API}/${encodeURIComponent(st.key)}/format/column`, { method: window.FlexFormat.hasFormat(f) ? 'PUT' : 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: col.name, format: f }) });
            if (!res.ok) throw new Error('save failed');
        } catch (err) { Dashboard.showToast(t('main.fmtSaveError'), 'error'); }
    }, 350));
}
function setupFlexFormat(table, body) {
    const FF = window.FlexFormat;
    if (!FF || !table || !table.tHead) return;
    body.columns.forEach((c) => { const th = table.querySelector(`thead th[data-col="${c.key}"]`); if (th) FF.applyHeader(th, c.fmt); });
    if (!st.canCreateRegistry) return;
    body.columns.forEach((c) => {
        if (c.kind === 'carga') return;
        const th = table.querySelector(`thead th[data-col="${c.key}"]`);
        if (!th || th.querySelector('.reg-fm-btn')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'reg-fm-btn';
        btn.textContent = '⋮';
        btn.title = t('main.fmtOpen', { name: c.label });
        btn.setAttribute('aria-label', t('main.fmtOpen', { name: c.label }));
        ['mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach((ev) => btn.addEventListener(ev, (event) => event.stopPropagation())); // tocar el ⋮ no ordena ni mueve la columna
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const current = (st.data && st.data.columns.find((x) => x.key === c.key)) || c;
            FF.openMenu({
                anchor: btn,
                title: t('main.fmtTitle', { name: current.label }),
                f: current.fmt,
                onCollapse: Dashboard.collapseColumn ? () => Dashboard.collapseColumn(DATA_TABLE, c.key) : null, // «Contraer columna»: la tira angosta (Dashboard.js)
                onChange: (f) => {
                    const key = fmtKey(current.name);
                    st.data.columns.forEach((x) => { if (fmtKey(x.name) === key) { if (FF.hasFormat(f)) x.fmt = { ...f }; else delete x.fmt; FF.restyleColumn(table, x, lang()); } });
                    saveColumnFormat(current, f);
                },
            });
        });
        th.appendChild(btn);
    });
}
// ---- el acomodo ORIGINAL de las columnas (Daniel, 2026-11-28, «sí, hazlo así»): uno por registro, con el que se abre para quien no se haya acomodado nada; lo cambia quien puede cambiar el registro. Se guarda con la llave ESTABLE de cada columna
// (en una tabla libre, su sid; en los demás, la misma de siempre) porque la llave de la pantalla de una tabla libre es su posición y cambia cuando llegan columnas nuevas. ----
const layoutKeyMaps = () => {
    const body = st.data;
    if (!body || !isFlex(body)) return { toStable: (k) => k, toScreen: (k) => k };
    const sidOf = new Map(body.columns.map((c) => [c.key, c.sid]));
    const keyOf = new Map(body.columns.map((c) => [c.sid, c.key]));
    return { toStable: (k) => sidOf.get(k) || null, toScreen: (k) => keyOf.get(k) || null };
};
function mapLayout(layout, convert) {
    if (!layout) return null;
    const list = (v) => (Array.isArray(v) ? v.map(convert).filter(Boolean) : []);
    const widths = {};
    Object.entries(layout.widths || {}).forEach(([k, w]) => { const key = convert(k); if (key) widths[key] = w; });
    return { order: list(layout.order), hidden: list(layout.hidden), pinned: list(layout.pinned), widths };
}
async function saveOriginalLayout(layout) {
    const stable = layout ? mapLayout(layout, layoutKeyMaps().toStable) : null;
    const res = await fetch(`${API}/${encodeURIComponent(st.key)}/layout`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layout: stable }) });
    if (!res.ok) throw new Error('layout failed');
    const out = await res.json();
    st.layout = out.layout || null;
}
function drawData() {
    const body = st.data;
    if (!body) return;
    st.layout = body.layout || null;
    const wrapper = wrapperOf(DATA_TABLE);
    const flex = isFlex(body);
    st.numCols = new Set(flex ? body.columns.filter((c) => c.num).map((c) => c.key) : body.periods.map(periodKey)); // las columnas con números (los cálculos de suma, promedio… de la fila de totales)
    const first = buildHeader(DATA_TABLE, flex ? flexColumns(body) : dataColumns(body.periods));
    const table = tableOf(DATA_TABLE);
    const tbody = table.tBodies[0];
    tbody.innerHTML = '';
    st.drawn = 0;
    drawRows(FIRST_ROWS);
    ensureEmpty(DATA_TABLE, flex ? body.columns.length : DIM_COLUMNS.length + body.periods.length);
    // el acomodo de columnas es POR REGISTRO (antes todos los registros compartían el mismo) y trae su acomodo ORIGINAL: va antes de iniciar las columnas, que es cuando se aplica
    if (first) {
        wrapper.dataset.layoutScope = String(st.key || '');
        if (Dashboard.registerOriginalLayout) Dashboard.registerOriginalLayout(DATA_TABLE, { get: () => mapLayout(st.layout, layoutKeyMaps().toScreen), canEdit: () => !!st.canCreateRegistry, save: saveOriginalLayout });
    }
    if (first && Dashboard.initDataTableColumns) Dashboard.initDataTableColumns(wrapper, 0);
    // el tipo de columna (Llave, Dato, Columna nueva) va ARRIBA y la clasificación que puso la persona (nombre y color) debajo, pegada al encabezado (Daniel, 2026-11-28; antes era al revés): es el orden natural de las dos bandas del motor de tablas
    if (first && Dashboard.registerServerFilteredTable) Dashboard.registerServerFilteredTable(DATA_TABLE, { onChange: (spec) => { st.cf = spec; refreshData(); }, getValues: fetchColumnValues });
    if (first && Dashboard.registerPartialTable) Dashboard.registerPartialTable(DATA_TABLE, { isComplete: () => !st.data || st.drawn >= st.data.rows.length, loadAll: drawAllRows });
    // la fila de totales (Daniel, 2026-11-27): el servidor suma y cuenta TODOS los renglones que pasan el texto y el filtro, no solo los dibujados
    if (first && Dashboard.registerTotalsRow) Dashboard.registerTotalsRow(DATA_TABLE, { scope: () => st.key || '', canUse: () => !!(st.data && st.data.canTotals), isNumeric: (key) => st.numCols.has(key), rowsInfo: () => { const n = st.data ? st.data.total : 0; return { count: n, total: n, filtered: !!(st.cf || st.text) }; }, compute: fetchTotals });
    watchScroll(wrapper);
    if (flex) setupFlexFormat(table, body); // el encabezado con el formato de cada columna y su menú ⋮
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(DATA_TABLE);
    if (Dashboard.refreshTotalsRow) Dashboard.refreshTotalsRow(DATA_TABLE);
    wrapper.setAttribute('data-help-key', flex ? 'regTableLibre' : 'regTable');
    if (Dashboard.attachTableDownloadButton) {
        Dashboard.attachTableDownloadButton(DATA_TABLE, { getTitle: () => `${regName(currentRegistry())}_${todayStamp()}`, getNotice: () => (st.data && st.data.truncated ? t('main.regDownloadTruncated', { shown: st.data.rows.length, total: st.data.total }) : ''),
            getFullDownload: (format) => (st.data && (st.data.truncated || isFlex(st.data)) ? `${API}/${encodeURIComponent(st.key)}/export?format=${format}&lang=${lang()}&tz=${tzOffset()}&text=${encodeURIComponent(st.text || '')}${st.cf ? `&cf=${encodeURIComponent(JSON.stringify(st.cf))}` : ''}${visibleColsParam()}${decParam()}&file=${encodeURIComponent(`${regName(currentRegistry())}_${todayStamp()}`)}` : null) });
    }
    updateNote();
    renderButtons();
}
// los decimales que la persona ve («Encabezados y celdas» › Celdas): la descarga completa del servidor baja lo que se ve
function decParam() {
    const look = Dashboard.getDataTableLook && Dashboard.getDataTableLook(DATA_TABLE);
    return look && look.dec !== undefined ? `&dec=${look.dec}` : '';
}
// las columnas que la persona dejó visibles (las ocultas o difuminadas no se bajan), para que la descarga completa del servidor traiga las mismas que la pantalla
function visibleColsParam() {
    const keys = Dashboard.getVisibleColumnKeys ? Dashboard.getVisibleColumnKeys(DATA_TABLE) : null;
    return keys && keys.length ? `&cols=${encodeURIComponent(keys.join(','))}` : '';
}
// Los renglones de la tabla de datos se dibujan por partes: dibujarlos todos de un golpe (hasta 2,000 x 36 columnas) congelaba el navegador varios segundos. Cada parte se arma como UN bloque de HTML.
function rowsHtml(body, from, to) {
    const periodKeys = body.periods.map(periodKey);
    const td = (col, value, cls) => `<td data-col="${col}"${cls ? ` class="${cls}"` : ''}>${value === null || value === undefined || value === '' ? '—' : esc(value)}</td>`;
    const html = [];
    if (isFlex(body)) {
        // tabla libre: cada renglón es una lista de celdas en el orden de las columnas (texto, número o nada)
        for (let i = from; i < to; i += 1) {
            const row = body.rows[i];
            let tr = '<tr>';
            body.columns.forEach((c, k) => { tr += window.FlexFormat ? window.FlexFormat.cellHtml(c, row[k], esc, c.num ? 'col-num' : '', lang()) : td(c.key, row[k], c.num ? 'col-num' : ''); }); // con el formato que la persona le puso a la columna
            html.push(`${tr}</tr>`);
        }
        return html.join('');
    }
    for (let i = from; i < to; i += 1) {
        const row = body.rows[i];
        let tr = `<tr data-record-id="${row.id}">`;
        DIM_COLUMNS.forEach((c) => { tr += td(c.col, row[c.field]); });
        body.periods.forEach((p, k) => { tr += td(periodKeys[k], row.values[p] === undefined ? '' : num(row.values[p]), 'col-num'); });
        html.push(`${tr}</tr>`);
    }
    return html.join('');
}
function drawRows(count) {
    const body = st.data;
    const table = tableOf(DATA_TABLE);
    if (!body || !table) return 0;
    const to = Math.min(body.rows.length, st.drawn + count);
    if (to <= st.drawn) return 0;
    table.tBodies[0].insertAdjacentHTML('beforeend', rowsHtml(body, st.drawn, to));
    const added = to - st.drawn;
    st.drawn = to;
    updateNote();
    return added;
}
// Dibuja todo lo que falta (para ordenar, filtrar por columna o descargar lo que se ve).
function drawAllRows() { drawRows(Infinity); return Promise.resolve(true); }
function watchScroll(wrapper) {
    if (!wrapper || wrapper.dataset.regScroll) return;
    wrapper.dataset.regScroll = '1';
    wrapper.addEventListener('scroll', () => {
        if (st.data && st.drawn < st.data.rows.length && wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 800) drawRows(NEXT_ROWS);
    }, { passive: true });
}
// El aviso de abajo: «Mostrando X de Y» con los botones para dibujar más mientras falten renglones por dibujar; si ya están todos los que llegaron pero el registro tiene más, avisa que se acote con el Filtro.
function updateNote() {
    const body = st.data;
    const wrapper = wrapperOf(DATA_TABLE);
    let note = document.getElementById('reg-truncated');
    const partial = !!body && st.drawn < body.rows.length;
    if (!body || !wrapper || (!partial && !body.truncated)) { if (note) note.remove(); return; }
    if (!note) { note = document.createElement('p'); note.id = 'reg-truncated'; note.className = 'admin-hint reg-more'; note.hidden = st.tab !== 'data'; wrapper.after(note); }
    note.textContent = '';
    const text = document.createElement('span');
    text.textContent = partial ? t('main.regShowing', { shown: num(st.drawn), total: num(body.total) }) : t('main.regTruncated', { shown: num(body.rows.length), total: num(body.total) });
    note.appendChild(text);
    if (partial) {
        [['main.regShowMore', () => drawRows(NEXT_ROWS)], ['main.regShowAll', () => drawAllRows()]].forEach(([key, action]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-secondary reg-more-btn';
            btn.setAttribute('data-help-key', 'regShowMore');
            btn.textContent = t(key);
            btn.addEventListener('click', action);
            note.appendChild(btn);
        });
    }
}
// ---- Cargas de una tabla libre: «Sí considerar / No considerar» (la carga que no se considera se ve sombreada), elegir varias a la vez y eliminar los DATOS de las que ya no se ocupan ----
const isFlexReg = () => !!(currentRegistry() && currentRegistry().kind === 'tabla');
// on = se considera; off = una persona dejó de considerarla (sus datos siguen ahí); failed = se cayó (no tiene datos); deleted = sus datos se eliminaron (la línea queda en el historial)
const loadState = (l) => (l.dataDeleted ? 'deleted' : (l.status === 'vigente' ? 'on' : (l.annulledBy === 'sistema' ? 'failed' : 'off')));
async function postLoadAction(loadId, action, body) {
    const res = await fetch(`${API}/${st.key}/loads/${loadId}/${action}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; throw err; }
    return out;
}
const loadActionError = (err) => {
    const code = err && err.body && err.body.code;
    return ['LOAD_ACTIVE', 'LOAD_DATA_DELETED', 'LOAD_FAILED', 'LOAD_NOT_ACTIVE', 'LOAD_NOT_FOUND', 'REG_BUSY', 'DELETE_ERROR', 'REG_FORBIDDEN'].includes(code) ? t(`main.regLoadErr_${code}`) : t('admin.saveError');
};
async function reloadAfterLoadAction() {
    st.loadPick.clear();
    await loadRegistries();
    await Promise.all([refreshData(), refreshLoads()]);
}
// «Sí considerar»: no pide nada, se puede deshacer con «No considerar»
async function considerLoads(loads) {
    let done = 0;
    try {
        for (const l of loads) { await postLoadAction(l.id, 'reconsider'); done += 1; }
        Dashboard.showToast(t('main.regConsiderDone', { n: num(done) }), 'success');
    } catch (err) { Dashboard.showToast(loadActionError(err), 'error'); }
    await reloadAfterLoadAction();
}
// «No considerar» y «Eliminar datos»: una ventana que explica lo que pasa y lo hace carga por carga
function openLoadActionModal({ loads, kind }) {
    const del = kind === 'delete';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    const rowsTotal = loads.reduce((n, l) => n + Number(l.newRows || 0), 0);
    const valuesTotal = loads.reduce((n, l) => n + Number(l.valuesAdded || 0), 0);
    const title = loads.length === 1 ? t(del ? 'main.regDeleteTitle1' : 'main.regNoConsiderTitle1', { file: loads[0].fileName || '' }) : t(del ? 'main.regDeleteTitleN' : 'main.regNoConsiderTitleN', { n: num(loads.length) });
    const files = loads.length > 1 ? `<ul class="reg-lam-files">${loads.slice(0, 8).map((l) => `<li>${esc(l.fileName || '')}</li>`).join('')}${loads.length > 8 ? `<li>…</li>` : ''}</ul>` : '';
    overlay.innerHTML = `<div class="modal-panel exp-panel" role="dialog" aria-modal="true" aria-labelledby="reg-lam-title" data-help-key="${del ? 'regDeleteData' : 'regNoConsider'}">
        <h3 id="reg-lam-title">${esc(title)}</h3>
        ${files}
        <p class="admin-hint">${esc(t(del ? 'main.regDeleteHint' : 'main.regNoConsiderHint'))}</p>
        ${del ? `<p class="reg-lam-sum">${esc(t('main.regDeleteSummary', { rows: num(rowsTotal), values: num(valuesTotal) }))}</p>` : `<label for="reg-lam-note">${esc(t('main.regAnnulNote'))}</label><textarea id="reg-lam-note" rows="3" maxlength="300"></textarea>`}
        <p class="admin-error" id="reg-lam-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn${del ? ' reg-btn-danger' : ''}" data-reg-lam="ok">${esc(t(del ? 'main.regDeleteConfirm' : 'main.regNoConsider'))}</button><button type="button" class="btn btn-secondary" data-reg-lam="cancel">${esc(t('main.regCancel'))}</button></div></div>`;
    document.body.appendChild(overlay);
    let busy = false;
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape' && !busy) close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay && !busy) close(); });
    overlay.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-reg-lam]');
        if (!btn || busy) return;
        if (btn.dataset.regLam === 'cancel') { close(); return; }
        busy = true;
        const ok = overlay.querySelector('[data-reg-lam="ok"]');
        ok.disabled = true;
        const err = overlay.querySelector('#reg-lam-error');
        const note = del ? '' : String((overlay.querySelector('#reg-lam-note') || {}).value || '');
        let done = 0;
        try {
            for (const l of loads) {
                ok.textContent = t('main.regLoadWorking', { done: num(done + 1), total: num(loads.length) });
                await postLoadAction(l.id, del ? 'delete-data' : 'annul', del ? {} : { note });
                done += 1;
            }
            close();
            Dashboard.showToast(t(del ? 'main.regDeleteDone' : 'main.regNoConsiderDone', { n: num(done) }), 'success');
            await reloadAfterLoadAction();
        } catch (e) {
            busy = false; ok.disabled = false; ok.textContent = t(del ? 'main.regDeleteConfirm' : 'main.regNoConsider');
            err.textContent = loadActionError(e); err.hidden = false;
            if (done) await reloadAfterLoadAction();
        }
    });
}
// la barra de las cargas elegidas (arriba de la tabla de Cargas)
function renderLoadsBulk() {
    const wrapper = wrapperOf(LOADS_TABLE);
    if (!wrapper) return;
    let bar = document.getElementById('reg-loads-bulk');
    const usable = st.loads ? st.loads.loads.filter((l) => ['on', 'off'].includes(loadState(l))) : [];
    if (!isFlexReg() || !st.canAnnul || !usable.length) { if (bar) bar.remove(); return; }
    const chosen = usable.filter((l) => st.loadPick.has(l.id));
    const on = chosen.filter((l) => loadState(l) === 'on');
    const off = chosen.filter((l) => loadState(l) === 'off');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'reg-loads-bulk';
        bar.className = 'reg-loads-bulk';
        bar.setAttribute('data-help-key', 'regLoadsBulk');
        const zoom = wrapper.previousElementSibling;
        (zoom && zoom.classList.contains('data-table-zoom') ? zoom : wrapper).before(bar);
        bar.addEventListener('click', (event) => {
            const b = event.target.closest('[data-bulk]');
            if (!b) return;
            const usableNow = st.loads ? st.loads.loads.filter((l) => ['on', 'off'].includes(loadState(l))) : [];
            const pickedNow = usableNow.filter((l) => st.loadPick.has(l.id));
            const v = b.dataset.bulk;
            if (v === 'all') { usableNow.forEach((l) => st.loadPick.add(l.id)); drawLoads(); }
            else if (v === 'none') { st.loadPick.clear(); drawLoads(); }
            else if (v === 'no') openLoadActionModal({ loads: pickedNow.filter((l) => loadState(l) === 'on'), kind: 'no' });
            else if (v === 'yes') considerLoads(pickedNow.filter((l) => loadState(l) === 'off'));
            else if (v === 'delete') openLoadActionModal({ loads: pickedNow.filter((l) => loadState(l) === 'off'), kind: 'delete' });
        });
    }
    bar.hidden = st.tab !== 'loads';
    const btn = (v, label, n, danger) => `<button type="button" data-bulk="${v}"${n ? '' : ' disabled'}${danger ? ' class="reg-bulk-danger"' : ''}>${esc(label)}${n ? ` (${num(n)})` : ''}</button>`;
    bar.innerHTML = `<span class="reg-loads-bulk-n">${esc(t('main.regLoadsBulkCount', { n: num(chosen.length) }))}</span><button type="button" class="reg-cd-link-btn" data-bulk="all">${esc(t('main.regLoadsBulkAll'))}</button><button type="button" class="reg-cd-link-btn" data-bulk="none">${esc(t('main.regLoadsBulkNone'))}</button>${chosen.length ? `<span class="reg-seg" role="group">${btn('no', t('main.regNoConsider'), on.length)}${btn('yes', t('main.regConsider'), off.length)}${btn('delete', t('main.regDeleteData'), off.length, true)}</span>` : ''}`;
}
function drawLoads() {
    const body = st.loads;
    if (!body) return;
    const wrapper = wrapperOf(LOADS_TABLE);
    const columns = [
        ...LOAD_COLUMNS.map((c) => ({ col: c, group: 'menu.cmRegistrosInformacion', labelKey: `main.${c}` })),
        { col: 'actions', labelKey: 'main.colActions' },
    ];
    const first = buildHeader(LOADS_TABLE, columns);
    const tbody = tableOf(LOADS_TABLE).tBodies[0];
    tbody.innerHTML = '';
    body.loads.forEach((l) => {
        const tr = document.createElement('tr');
        tr.dataset.recordId = l.id;
        // en una tabla libre: «Sí se considera» / «No se considera» (sombreada) / «Falló» / «Datos eliminados»
        const flexReg = isFlexReg();
        const state = flexReg ? loadState(l) : null;
        if (flexReg && state !== 'on') tr.classList.add('reg-load-off');
        const status = document.createElement('td');
        status.dataset.col = 'colRegCargaEstado';
        if (flexReg) status.innerHTML = `<span class="reg-pill reg-pill-${state === 'on' ? 'ok' : 'off'}">${esc(t(`main.regLoadState_${state}`))}</span>${l.annulNote && state === 'off' ? ` <small>${esc(l.annulNote)}</small>` : ''}`;
        else status.innerHTML = `<span class="reg-pill reg-pill-${l.status === 'vigente' ? 'ok' : 'off'}">${esc(t(l.status === 'vigente' ? 'main.regStatus_vigente' : 'main.regStatus_anulada'))}</span>${l.annulNote ? ` <small>${esc(l.annulNote)}</small>` : ''}`;
        const actions = document.createElement('td');
        actions.dataset.col = 'actions';
        actions.className = 'admin-table-actions';
        const iconBtn = (icon, helpKey, label, onClick, extra) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `admin-icon-btn${extra ? ` ${extra}` : ''}`;
            b.setAttribute('data-help-key', helpKey);
            b.setAttribute('aria-label', label);
            b.title = label;
            b.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i>`;
            b.addEventListener('click', onClick);
            return b;
        };
        if (flexReg && st.canAnnul && (state === 'on' || state === 'off')) {
            const pick = document.createElement('input');
            pick.type = 'checkbox';
            pick.className = 'reg-load-pick';
            pick.checked = st.loadPick.has(l.id);
            pick.setAttribute('data-help-key', 'regLoadsBulk');
            pick.setAttribute('aria-label', t('main.regLoadPick', { file: l.fileName || '' }));
            pick.addEventListener('change', () => { if (pick.checked) st.loadPick.add(l.id); else st.loadPick.delete(l.id); renderLoadsBulk(); });
            // la casilla lleva su palabra («Elegir») para que se entienda sin conocerla
            const pickLabel = document.createElement('label');
            pickLabel.className = 'reg-load-pick-l';
            pickLabel.setAttribute('data-help-key', 'regLoadsBulk');
            const pickText = document.createElement('span');
            pickText.textContent = t('main.regLoadPickShort');
            pickLabel.append(pick, pickText);
            actions.appendChild(pickLabel);
        }
        actions.appendChild(iconBtn('bx-history', 'changeHistory', t('main.changeHistoryTitleRecord'), () => Dashboard.openChangeHistory(LOADS_TABLE, l.id)));
        if (flexReg && st.canAnnul) {
            if (state === 'on') actions.appendChild(iconBtn('bx-block', 'regNoConsider', t('main.regNoConsider'), () => openLoadActionModal({ loads: [l], kind: 'no' })));
            if (state === 'off') {
                actions.appendChild(iconBtn('bx-check-circle', 'regConsider', t('main.regConsider'), () => considerLoads([l])));
                actions.appendChild(iconBtn('bx-trash', 'regDeleteData', t('main.regDeleteData'), () => openLoadActionModal({ loads: [l], kind: 'delete' }), 'reg-icon-danger'));
            }
        } else if (st.canAnnul && l.status === 'vigente') {
            actions.appendChild(iconBtn('bx-block', 'regAnnul', t('main.regAnnul'), () => openAnnulModal(l)));
        }
        tr.append(
            cell('colRegCargaArchivo', l.fileName), cell('colRegCargaOrigen', t(`main.regSource_${l.source}`)), stampCell('colRegCargaFechaHora', l.createdAt), cell('colRegCargaPor', l.loadedBy),
            cell('colRegCargaPeriodos', l.newPeriods.map(periodLabel).join(', ')), cell('colRegCargaRenglones', num(l.rowsInFile), 'col-num'), cell('colRegCargaNuevos', num(l.newRows), 'col-num'),
            cell('colRegCargaAgregados', num(l.valuesAdded), 'col-num'), cell('colRegCargaYaEstaba', num(l.untouched), 'col-num'), cell('colRegCargaDistintos', num(l.different), 'col-num'), cell('colRegCargaErrores', num(l.errors), 'col-num'),
            status, actions,
        );
        tbody.appendChild(tr);
    });
    ensureEmpty(LOADS_TABLE, LOAD_COLUMNS.length + 1);
    if (first && st.tab === 'loads' && Dashboard.initDataTableColumns) Dashboard.initDataTableColumns(wrapper, 1);
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(LOADS_TABLE);
    wrapper.setAttribute('data-help-key', 'regLoadsTable');
    if (Dashboard.attachTableDownloadButton) Dashboard.attachTableDownloadButton(LOADS_TABLE, { getTitle: () => `${regName(currentRegistry())}_${t('main.regTabLoads')}_${todayStamp()}` });
    renderLoadsBulk();
}
// Los filtros por columna (st.cf) los resuelve el servidor sobre TODOS los renglones: la tabla solo dibuja los primeros. Cada petición lleva un número: si llega una más nueva, la vieja se descarta.
async function refreshData() {
    if (!st.key) return;
    const seq = ++st.seq;
    const wrapper = wrapperOf(DATA_TABLE);
    wrapper?.classList.add('reg-busy');
    // la primera vez (todavía no hay datos dibujados) la tabla vacía diría «no hay nada»: se dice que se está cargando
    let loadingNote = document.getElementById('reg-loading-note');
    if (!st.data && wrapper && !loadingNote) {
        loadingNote = document.createElement('p');
        loadingNote.id = 'reg-loading-note'; loadingNote.className = 'reg-loading-note'; loadingNote.setAttribute('role', 'status');
        loadingNote.innerHTML = '<i class="bx bx-loader-alt bx-spin" aria-hidden="true"></i> ';
        loadingNote.append(t('main.regLoadingData'));
        wrapper.after(loadingNote); // debajo de la tabla: la barra de iconos y los botones se buscan en el elemento que está ANTES de la tabla
    }
    try {
        const params = new URLSearchParams({ lang: lang(), tz: String(tzOffset()) });
        if (st.text) params.set('text', st.text);
        if (st.cf) params.set('cf', JSON.stringify(st.cf));
        const res = await fetch(`${API}/${st.key}/data?${params}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        if (seq !== st.seq) return; // llegó una búsqueda más nueva
        st.data = body;
        const lastId = body.lastLoad ? body.lastLoad.id : null;
        if (lastId !== st.lastLoadId) { st.lastLoadId = lastId; if (Dashboard.resetServerFilterValues) Dashboard.resetServerFilterValues(DATA_TABLE); } // llegaron datos nuevos: las listas de valores ya no valen
        const reg = currentRegistry();
        if (reg) { reg.periods = st.data.periods; reg.lastLoad = st.data.lastLoad; }
        st.canTemplate = st.data.canTemplate; st.canExcel = st.data.canExcel; st.canAnnul = st.data.canAnnul;
        renderManage();
        renderUpdated();
        drawData();
    } catch (err) {
        console.error('Registros: failed to load data', err);
        Dashboard.showToast(t('main.regLoadError'), 'error');
    } finally {
        if (seq === st.seq) { wrapper?.classList.remove('reg-busy'); const note = document.getElementById('reg-loading-note'); if (note) note.remove(); }
    }
}
// La lista de valores de una columna para su filtro: los de TODO el registro (no los dibujados).
// Los cálculos de la fila de totales (specs = { columna: cálculo }) sobre todo lo que pasa el texto de arriba y el filtro por columna.
async function fetchTotals(specs) {
    const params = new URLSearchParams({ lang: lang(), tz: String(tzOffset()), calcs: JSON.stringify(specs) });
    if (st.text) params.set('text', st.text);
    if (st.cf) params.set('cf', JSON.stringify(st.cf));
    const res = await fetch(`${API}/${encodeURIComponent(st.key)}/totals?${params}`, { credentials: 'include' });
    if (!res.ok) throw new Error('totals failed');
    return res.json();
}
async function fetchColumnValues(col, opts) {
    const typed = opts && opts.q ? `&q=${encodeURIComponent(opts.q)}&mode=${encodeURIComponent(opts.mode || 'contains')}` : ''; // lo escrito en el buscador del filtro: los valores que coinciden de TODO el registro
    const res = await fetch(`${API}/${encodeURIComponent(st.key)}/values?col=${encodeURIComponent(col)}&lang=${lang()}&tz=${tzOffset()}${typed}`, { credentials: 'include' });
    if (!res.ok) throw new Error('values failed');
    return res.json();
}
async function refreshLoads() {
    if (!st.key) return;
    try {
        const res = await fetch(`${API}/${st.key}/loads`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        st.loads = await res.json();
        st.canAnnul = st.loads.canAnnul;
        drawLoads();
    } catch (err) {
        console.error('Registros: failed to load the loads list', err);
        Dashboard.showToast(t('main.regLoadError'), 'error');
    }
}
function showTab(tab) {
    st.tab = tab;
    document.querySelectorAll('[data-reg-tab]').forEach((btn) => { const on = btn.dataset.regTab === tab; btn.classList.toggle('reg-tab-on', on); btn.setAttribute('aria-selected', on ? 'true' : 'false'); });
    const dataWrapper = wrapperOf(DATA_TABLE); const loadsWrapper = wrapperOf(LOADS_TABLE);
    const dataBar = dataWrapper.previousElementSibling; const loadsBar = loadsWrapper.previousElementSibling;
    [dataWrapper, document.getElementById('filter-bar'), document.getElementById('reg-truncated')].forEach((el) => { if (el) el.hidden = tab !== 'data'; });
    if (dataBar && dataBar.classList.contains('data-table-zoom')) dataBar.hidden = tab !== 'data';
    loadsWrapper.hidden = tab !== 'loads';
    const bulkBar = document.getElementById('reg-loads-bulk'); if (bulkBar) bulkBar.hidden = tab !== 'loads';
    if (loadsBar && loadsBar.classList.contains('data-table-zoom')) loadsBar.hidden = tab !== 'loads';
    if (tab === 'loads') refreshLoads().then(() => window.dispatchEvent(new Event('resize')));
    else window.dispatchEvent(new Event('resize'));
}
// «Cargar registro», «Columnas del registro» y «Descargar plantilla» (Daniel, 2026-11-27: «en una sola fila»): van en la misma fila de las pestañas, a la derecha, y se ven en Datos y en Cargas.
// Del botón del árbol; el servidor también lo exige. Se vuelven a armar cada vez (el registro puede haber cambiado de estado).
function renderButtons() {
    const box = document.getElementById('reg-actions');
    if (!box) return;
    box.textContent = '';
    const reg = currentRegistry();
    if (!(st.canTemplate || st.canExcel) || (reg && (reg.status !== 'active' || reg.obsolete))) return; // un obsoleto ya no recibe cargas
    const make = (id, icon, key, helpKey, onClick) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'data-table-new-record-btn';
        btn.id = id;
        btn.setAttribute('data-help-key', helpKey);
        btn.innerHTML = `<i class="bx ${icon}" aria-hidden="true"></i><span>${esc(t(key))}</span>`;
        btn.addEventListener('click', onClick);
        return btn;
    };
    box.appendChild(make('reg-import-btn', 'bx-upload', 'main.regImport', 'regImport', openLoadModal));
    if (!reg || reg.kind !== 'tabla') box.appendChild(make('reg-template-btn', 'bx-download', 'main.regTemplate', 'regTemplate', downloadTemplate)); // un registro libre no tiene plantilla: se carga tu propio Excel
    if (reg && reg.kind === 'tabla' && st.canExcel) box.appendChild(make('reg-columns-btn', 'bx-columns', 'main.regColsBtn', 'regColumnas', openFlexColumnsModal)); // las columnas que ya existen: nombre y clasificación
}
function wireStatic() {
    document.querySelectorAll('[data-reg-tab]').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.regTab)));
    const bar = document.getElementById('filter-bar');
    const apply = () => { st.text = (document.getElementById('filter-search-text')?.value || '').trim(); refreshData(); };
    bar?.addEventListener('data-table:filter-apply', apply);
    bar?.addEventListener('data-table:filter-clear', () => { st.text = ''; refreshData(); });
    showTab('data');
    document.addEventListener('dashboard:language-changed', () => { renderManage(); renderUpdated(); });
}

// Lo pegado de Excel (celdas separadas por tabulador) se vuelve un .xlsx de una hoja: el servidor lo lee igual que un archivo elegido.
function pastedFile(text) {
    const T = window.SkuTemplate;
    const X = window.SimpleXlsx;
    if (!T || !X) return null;
    const rows = T.parseDelimited(text);
    if (!rows.length) return null;
    return new File([X.writeXlsx([{ name: t('main.regPastedName'), rows }])], `${t('main.regPastedName')}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function saveFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function downloadTemplate() {
    try {
        const res = await fetch(`${API}/${st.key}/template?lang=${lang()}`, { credentials: 'include' });
        if (!res.ok) throw new Error('template failed');
        saveFile(await res.blob(), `${lang() === 'en' ? 'Template' : 'Plantilla'}-${st.key}.xlsx`);
    } catch (err) {
        console.error('Registros: la plantilla no se pudo bajar', err);
        Dashboard.showToast(t('main.regTplError'), 'error');
    }
}

// ---- anular una carga -----------------------------------------------------------------------------------------------------------------------------
function openAnnulModal(load) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    overlay.innerHTML = `<div class="modal-panel exp-panel" role="dialog" aria-modal="true" aria-labelledby="reg-a-title" data-help-key="regAnnul">
        <h3 id="reg-a-title">${esc(t('main.regAnnulTitle', { file: load.fileName || '' }))}</h3>
        <p class="admin-hint">${esc(t('main.regAnnulHint'))}</p>
        <label for="reg-a-note">${esc(t('main.regAnnulNote'))}</label><textarea id="reg-a-note" rows="3" maxlength="300"></textarea>
        <p class="admin-error" id="reg-a-error" role="alert" hidden></p>
        <div class="admin-form-actions"><button type="button" class="btn" data-reg-a="ok">${esc(t('main.regAnnul'))}</button><button type="button" class="btn btn-secondary" data-reg-a="cancel">${esc(t('main.regCancel'))}</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-reg-a]');
        if (!btn) return;
        if (btn.dataset.regA === 'cancel') { close(); return; }
        btn.disabled = true;
        try {
            const res = await fetch(`${API}/${st.key}/loads/${load.id}/annul`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: overlay.querySelector('#reg-a-note').value }) });
            if (!res.ok) throw new Error('annul failed');
            close();
            await loadRegistries();
            await Promise.all([refreshData(), refreshLoads()]);
            Dashboard.showToast(t('main.regAnnulled'), 'success');
        } catch (err) {
            btn.disabled = false;
            const el = overlay.querySelector('#reg-a-error'); el.textContent = t('admin.saveError'); el.hidden = false;
        }
    });
}

// ---- ventana «Cargar registro» -----------------------------------------------------------------------------------------------------------------------
// st2.step: 'start' (elegir la forma y el archivo) → 'map' (solo «con mi Excel»: emparejar columnas) → 'day' (solo existencias con plantilla: el día) → 'preview' (la revisión, sin guardar nada) → 'done'.
function problemText(issue) { return t(`main.regProb_${issue.problem}`); }
function errorTextOf(err) {
    const body = (err && err.body) || {};
    if (body.code === 'IMPORT_HEADERS') return t('main.regErr_IMPORT_HEADERS', { missing: (body.missing || []).map((k) => (k === 'value' ? t('main.regValueColumn') : t(`main.regDim_${k}`))).join(', ') });
    if (body.code === 'DISK_FULL' && Number.isFinite(body.freeMb)) return t('main.regErr_DISK_FULL_N', { free: body.freeMb, reusable: body.reusableMb || 0 });
    return ['IMPORT_FILE', 'IMPORT_EMPTY', 'IMPORT_TOO_BIG', 'IMPORT_DAY', 'IMPORT_DAY_FUTURE', 'REG_FORBIDDEN', 'REG_BUSY', 'COST_CENTER_REQUIRED', 'IMPORT_ERROR', 'DISK_FULL', 'FLEX_CONFIG', 'FLEX_DUP_NAME', 'FLEX_NO_KEY', 'IMPORT_STAMP', 'IMPORT_TOO_MANY_COLUMNS'].includes(body.code) ? t(`main.regErr_${body.code}`) : t('admin.saveError');
}
// ---- Registros de TABLA LIBRE: cada carga lleva su propia elección de columnas (no se recuerda de una carga a otra) ------------------------------------------------------------------------------
// «Guardar tal cual» (todas las columnas del Excel, con su orden y nombres) o «Elegir el papel de cada columna»: llave (va hacia abajo), dato del renglón, columna nueva en cada carga (se suma o se toma uno) o no se carga.
// Cada columna se puede renombrar. El día y la hora de la carga se eligen aquí (el archivo no los trae); cada carga es su propia columna aunque tenga el mismo día y hora.
// «Columnas del registro» (Daniel, 2026-11-26, opción B): cambiar el nombre y la clasificación de las columnas que YA existen, una sola vez y para todas las cargas. El nombre solo se cambia en los valores con día y hora;
// en las llaves, los datos y los valores de nombre fijo está fijo. El color es de la clasificación (todas las columnas que la llevan lo comparten). No toca ningún dato.
function openFlexColumnsModal() {
    const reg = currentRegistry();
    if (!reg || reg.kind !== 'tabla') return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    document.body.appendChild(overlay);
    const s = { data: null, draft: new Map(), clsColor: {}, busy: false, error: "", saved: "", changed: false };
    const foldCls = (v) => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
    const url = `${API}/${encodeURIComponent(reg.key)}/columns`;
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); if (s.changed) location.reload(); }; // con algo guardado, la tabla se arma de nuevo con los nombres y colores nuevos
    const onKey = (event) => { if (event.key === 'Escape' && !s.busy) close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay && !s.busy) close(); });
    const eff = (c) => { const d = s.draft.get(c.id); return { name: d ? d.name : c.name, cls: d ? d.cls : (c.cls || '') }; };
    // el color de una clasificación: el que se eligió aquí, el que ya tiene, o el primero libre
    const colorOfClass = (cls) => {
        const f = foldCls(cls);
        if (!f) return null;
        if (s.clsColor[f] !== undefined) return s.clsColor[f];
        const known = (s.data.classes || []).find((x) => foldCls(x.name) === f);
        if (known && Number.isInteger(known.color)) return known.color;
        const used = new Set([...(s.data.classes || []).map((x) => x.color), ...Object.values(s.clsColor)]);
        for (let i = 0; i < CLASS_COLORS.length; i += 1) if (!used.has(i)) return i;
        return 0;
    };
    const isDirty = (c) => {
        const e = eff(c);
        const cls = e.cls.trim();
        if (c.editName && e.name.trim() !== c.name) return true;
        if (cls !== (c.cls || '')) return true;
        return !!cls && colorOfClass(cls) !== c.color;
    };
    const dotsHtml = (c) => {
        const cls = eff(c).cls.trim();
        if (!cls) return '';
        const color = colorOfClass(cls);
        return CLASS_COLORS.map((hex, i) => `<button type="button" class="reg-fx-dot" data-cm="color" data-id="${esc(c.id)}" data-k="${i}" style="background:${hex}" aria-pressed="${color === i ? 'true' : 'false'}" aria-label="${esc(t(`main.flexColor_${i}`))}"></button>`).join('');
    };
    const rowHtml = (c) => {
        const e = eff(c);
        const canEdit = !!s.data.canEdit;
        const nameCell = c.editName && canEdit
            ? `<div class="reg-cm-nm"><input type="text" class="reg-cm-in" data-cm="name" data-id="${esc(c.id)}" maxlength="60" value="${esc(e.name)}" aria-label="${esc(t('main.regColName'))}">${c.nameNoDate && e.name.trim() !== c.nameNoDate ? `<button type="button" class="reg-cm-chip" data-cm="strip" data-id="${esc(c.id)}">${esc(t('main.regColStrip'))}</button>` : ''}</div>`
            : `<div class="reg-cm-nmf"><span class="reg-tb-ro"><span>${esc(c.name)}</span></span>${c.editName ? '' : `<span class="reg-cm-lock" data-help-key="regColumnasFijo"><i class="bx bx-lock-alt" aria-hidden="true"></i> ${esc(t('main.regColFixed'))}</span>`}</div>`;
        const how = `<span class="reg-tb-role">${esc(t(`main.flexRoleS_${c.role}`))}${c.role === 'value' && c.agg ? ` · ${esc(t(`main.flexAgg_${c.agg}`))}` : ''}</span>`;
        const inn = esc(c.loads === 1 ? t('main.regColLoad1') : t('main.regColLoads', { n: num(c.loads) }));
        const clsCell = `<div class="reg-cm-cl"><input type="text" class="reg-cm-in" data-cm="cls" data-id="${esc(c.id)}" list="cm-cls-list" maxlength="40" value="${esc(e.cls)}" placeholder="${esc(t('main.flexClsNone'))}" aria-label="${esc(t('main.regColClass'))}"${canEdit ? '' : ' disabled'}><div class="reg-fx-dots" data-dots="${esc(c.id)}">${dotsHtml(c)}</div></div>`;
        return `<div class="reg-cm-row${isDirty(c) ? ' reg-cm-dirty' : ''}" data-row="${esc(c.id)}"><div class="reg-cm-c-nm">${nameCell}</div><div>${how}</div><div class="reg-cm-in-n">${inn}</div><div>${clsCell}</div><div class="reg-cm-state" data-state="${esc(c.id)}">${isDirty(c) ? esc(t('main.regColChanged')) : ''}</div></div>`;
    };
    const classList = () => {
        const names = new Map();
        ((s.data && s.data.classes) || []).forEach((x) => names.set(foldCls(x.name), x.name));
        s.draft.forEach((d) => { const f = foldCls(d.cls); if (f && !names.has(f)) names.set(f, d.cls.trim()); });
        return `<datalist id="cm-cls-list">${[...names.values()].map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;
    };
    const dirtyCount = () => (s.data ? s.data.columns.filter(isDirty).length : 0);
    const saveLabel = () => { const n = dirtyCount(); return n === 0 ? t('main.regColsSave') : (n === 1 ? t('main.regColsSave1') : t('main.regColsSaveN', { n: num(n) })); };
    // lo que cambia al escribir o elegir sin volver a dibujar la lista (así no se pierde el cursor): la marca «cambió» de cada fila, los puntos de color y el botón Guardar
    const refreshState = () => {
        if (!s.data) return;
        s.data.columns.forEach((c) => {
            const row = overlay.querySelector(`[data-row="${CSS.escape(c.id)}"]`);
            if (!row) return;
            row.classList.toggle('reg-cm-dirty', isDirty(c));
            const st2 = row.querySelector('[data-state]');
            if (st2) st2.textContent = isDirty(c) ? t('main.regColChanged') : '';
            const dots = row.querySelector('[data-dots]');
            if (dots) dots.innerHTML = dotsHtml(c);
        });
        const save = overlay.querySelector('[data-cm="save"]');
        if (save) { save.textContent = saveLabel(); save.disabled = s.busy || dirtyCount() === 0; }
        const discard = overlay.querySelector('[data-cm="discard"]');
        if (discard) discard.disabled = s.busy || dirtyCount() === 0;
    };
    const meta = () => (s.data.loads === 1 ? t('main.regColsMeta1', { rows: num(s.data.rows) }) : t('main.regColsMeta', { loads: num(s.data.loads), rows: num(s.data.rows) }));
    const paint = () => {
        const body = !s.data
            ? `<p>${esc(t('main.regColsLoading'))}</p>`
            : (!s.data.columns.length
                ? `<p>${esc(t('main.regColsEmpty'))}</p>`
                : `<div class="reg-cm-wrap" data-help-key="regColumnasVentana"><div class="reg-cm-head"><div data-help-key="regColumnasNombre">${esc(t('main.regColName'))}</div><div>${esc(t('main.regColHow'))}</div><div>${esc(t('main.regColIn'))}</div><div data-help-key="regColumnasClasificacion">${esc(t('main.regColClass'))}</div><div></div></div>${s.data.columns.map(rowHtml).join('')}</div>${classList()}`);
        overlay.innerHTML = `<div class="modal-panel exp-panel wp-modal wp-imp wp-imp-wide reg-cm" role="dialog" aria-modal="true" aria-labelledby="reg-cm-title" data-help-key="regColumnasVentana"><h3 id="reg-cm-title">${esc(t('main.regColsTitle', { name: regName(reg) }))}${s.data ? ` <small>${esc(meta())}</small>` : ''}</h3>${s.saved ? `<p class="reg-cm-flash" role="status">${esc(s.saved)}</p>` : ''}<p class="admin-error" role="alert"${s.error ? '' : ' hidden'}>${esc(s.error)}</p>${body}<div class="admin-form-actions">${s.data && s.data.canEdit && s.data.columns.length ? `<button type="button" class="btn" data-cm="save">${esc(saveLabel())}</button><button type="button" class="btn btn-secondary" data-cm="discard">${esc(t('main.regColsDiscard'))}</button>` : ''}<button type="button" class="btn btn-secondary" data-cm="close">${esc(t('main.regColsClose'))}</button></div></div>`;
        refreshState();
    };
    const save = async () => {
        const changes = [];
        for (const c of s.data.columns) {
            if (!isDirty(c)) continue;
            const e = eff(c);
            const name = e.name.trim();
            if (c.editName && !name) { s.error = t('main.regColsErr_FLEX_NO_NAME'); s.saved = ''; paint(); return; }
            const cls = e.cls.trim();
            const change = { id: c.id, cls, color: cls ? colorOfClass(cls) : null };
            if (c.editName && name !== c.name) change.name = name;
            changes.push(change);
        }
        if (!changes.length) return;
        s.busy = true; s.error = ''; s.saved = ''; refreshState();
        try {
            const res = await sendRegistry('PUT', url, { changes });
            s.data = res; s.draft.clear(); s.clsColor = {}; s.changed = true;
            s.saved = res.changed === 1 ? t('main.regColsSaved1') : t('main.regColsSaved', { n: num(res.changed) });
        } catch (e) {
            const code = e.body && e.body.code;
            s.error = ['FLEX_DUP_NAME', 'FLEX_NO_NAME', 'FLEX_NAME_LOCKED', 'REG_BUSY'].includes(code) ? t(`main.regColsErr_${code}`) : t('admin.saveError');
        }
        s.busy = false; paint();
    };
    overlay.addEventListener('input', (event) => {
        const el = event.target.closest('[data-cm]');
        if (!el || !s.data) return;
        const id = el.dataset.id;
        const c = s.data.columns.find((x) => x.id === id);
        if (!c) return;
        const cur = eff(c);
        if (el.dataset.cm === 'name') s.draft.set(id, { name: el.value, cls: cur.cls });
        else if (el.dataset.cm === 'cls') s.draft.set(id, { name: cur.name, cls: el.value });
        else return;
        s.error = ''; s.saved = '';
        refreshState();
    });
    // al terminar de escribir una clasificación nueva se le guarda su color (así no cambia sola al seguir escribiendo otras)
    overlay.addEventListener('change', (event) => {
        const el = event.target.closest('[data-cm="cls"]');
        if (!el || !s.data) return;
        const f = foldCls(el.value);
        if (f && s.clsColor[f] === undefined) s.clsColor[f] = colorOfClass(el.value);
        refreshState();
    });
    overlay.addEventListener('click', (event) => {
        const el = event.target.closest('[data-cm]');
        if (!el) return;
        const op = el.dataset.cm;
        if (op === 'close') { if (!s.busy) close(); return; }
        if (s.busy || !s.data) return;
        if (op === 'save') { save(); return; }
        if (op === 'discard') { s.draft.clear(); s.clsColor = {}; s.error = ''; paint(); return; }
        const c = s.data.columns.find((x) => x.id === el.dataset.id);
        if (!c) return;
        if (op === 'strip') { const cur = eff(c); s.draft.set(c.id, { name: c.nameNoDate, cls: cur.cls }); s.error = ''; s.saved = ''; const row = overlay.querySelector(`[data-row="${CSS.escape(c.id)}"]`); if (row) row.outerHTML = rowHtml(c); refreshState(); return; }
        if (op === 'color') { const cls = eff(c).cls.trim(); if (cls) { s.clsColor[foldCls(cls)] = Number(el.dataset.k); s.saved = ''; refreshState(); } }
    });
    paint();
    fetch(`${url}?lang=${lang()}`, { credentials: 'include' }).then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed')))).then((data) => { s.data = data; paint(); }).catch(() => { s.error = t('admin.saveError'); paint(); });
}
function openFlexLoadModal() {
    const reg = currentRegistry();
    if (!reg) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    document.body.appendChild(overlay);
    const now = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const todayText = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
    const s = { step: 'start', file: null, buffer: null, info: null, sheet: null, mode: 'asis', cols: [], day: todayText, time: `${p2(now.getHours())}:${p2(now.getMinutes())}`, preview: null, result: null, busy: false, error: '', inputMode: 'file', pasteText: '', classColors: {}, view: 'all', open: {} };
    // las clasificaciones que ya tiene el registro (con su color): al escribir una igual se toma el mismo color
    const foldCls = (v) => String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
    ((st.data && st.data.classes) || []).forEach((x) => { s.classColors[foldCls(x.name)] = x.color; });
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); if (s.result) location.reload(); }; // con una carga guardada, la tabla se arma de nuevo (un registro libre puede traer columnas nuevas y uno vacío no tenía ninguna)
    const onKey = (event) => { if (event.key === 'Escape' && !s.busy) close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay && !s.busy) close(); });
    const errBox = () => `<p class="admin-error" id="reg-i-error" role="alert"${s.error ? '' : ' hidden'}>${esc(s.error)}</p>`;
    const nextClassColor = () => { const used = new Set(Object.values(s.classColors)); for (let i = 0; i < CLASS_COLORS.length; i += 1) if (!used.has(i)) return i; return Object.keys(s.classColors).length % CLASS_COLORS.length; };
    const ensureClassColor = (c) => { const f = foldCls(c.cls); if (f && s.classColors[f] === undefined) s.classColors[f] = nextClassColor(); };
    const classList = () => {
        const names = new Map();
        ((st.data && st.data.classes) || []).forEach((x) => names.set(foldCls(x.name), x.name));
        s.cols.forEach((c) => { if (c.cls && !names.has(foldCls(c.cls))) names.set(foldCls(c.cls), c.cls); });
        return `<datalist id="fx-cls-list">${[...names.values()].map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;
    };
    const startHtml = () => `<h3 id="reg-i-title">${esc(t('main.flexImpTitle', { name: regName(reg) }))}</h3> ${st.canExcel && st.data && (st.data.columns || []).some((c) => c.kind !== 'carga') ? `<p class="reg-cm-link"><button type="button" class="reg-cd-link-btn" data-reg-i="open-columns" data-help-key="regColumnas">${esc(t('main.regColsLink'))}</button></p>` : ''}
        <div class="tpl-seg" role="group"><button type="button" data-reg-i="mode-file" aria-pressed="${s.inputMode === 'file'}" data-help-key="tplUpload"${s.busy ? ' disabled' : ''}>${esc(t('main.tplModeFile'))}</button><button type="button" data-reg-i="mode-paste" aria-pressed="${s.inputMode === 'paste'}" data-help-key="tplPaste"${s.busy ? ' disabled' : ''}>${esc(t('main.tplModePaste'))}</button></div>
        ${s.inputMode === 'paste' ? `<div class="reg-paste"><textarea id="reg-i-paste" spellcheck="false" placeholder="${esc(t('main.tplPastePlaceholder'))}"${s.busy ? ' disabled' : ''}>${esc(s.pasteText)}</textarea><button type="button" class="btn btn-secondary" data-reg-i="paste-go"${s.busy ? ' disabled' : ''}>${esc(s.busy ? t('main.regReading') : t('main.tplPasteGo'))}</button></div>` : `<label class="wp-imp-drop" id="reg-i-drop" for="reg-i-file" data-help-key="regDrop"><b>${esc(s.busy ? t('main.regReading') : t('main.regDrop'))}</b><span>${esc(t('main.regDropOr'))}</span></label>
        <input type="file" id="reg-i-file" class="wp-imp-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"${s.busy ? ' disabled' : ''}>`}
        ${errBox()}<div class="admin-form-actions"><button type="button" class="btn btn-secondary" data-reg-i="cancel"${s.busy ? ' disabled' : ''}>${esc(t('main.regCancel'))}</button></div>`;
    // ---- la ventana de columnas (desde 2026-11-26): una fila por columna del Excel con UNA decisión (ya existe / nueva adicional / no se carga); ver la tabla más abajo (tableHtml) ----
    const foldName = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const exMap = () => new Map(((s.info && s.info.existing) || []).map((e) => [e.name, e]));
    const hasExisting = () => !!(s.info && s.info.existing && s.info.existing.length);
    const colOf = (i) => s.cols.find((c) => String(c.i) === String(i));
    // Una columna que era Llave en las cargas anteriores y en esta ya no lo es (se pone «No se carga» o pasa a Dato o Valor): renglones distintos pueden juntarse en uno (Daniel, 2026-11-27). Solo se avisa.
    const wasKey = (c) => { if (c.wasKey) return true; const e = c.link ? exMap().get(c.link) : null; return !!(e && e.role === 'key'); };
    const keyLost = (c) => s.mode === 'roles' && wasKey(c) && (c.st === 'skip' || (c.st === 'new' && c.role !== 'key'));
    // lo que de verdad se manda de una columna: lo ya definido si «ya existe», lo que se escribió si es nueva
    const effective = (c) => {
        if (s.mode === 'asis') return { name: c.name, role: 'data', agg: 'sum', stampName: true, cls: c.cls || '', color: c.cls ? s.classColors[foldCls(c.cls)] : null };
        if (c.st === 'skip') return { name: c.text, role: 'skip', agg: 'sum', stampName: true, cls: '', color: null };
        if (c.st === 'exist') {
            const e = exMap().get(c.link);
            if (e) return { name: e.name, role: e.role, agg: e.agg, stampName: e.stampName, cls: e.cls || '', color: Number.isInteger(e.color) ? e.color : null };
        }
        return { name: c.name, role: c.role, agg: c.agg, stampName: c.stampName, cls: c.cls || '', color: c.cls ? s.classColors[foldCls(c.cls)] : null };
    };
    const classBox = (c) => {
        const color = c.cls ? s.classColors[foldCls(c.cls)] : undefined;
        const dots = c.cls ? CLASS_COLORS.map((hex, i) => `<button type="button" class="reg-fx-dot" data-fx-color="${i}" data-fx-for="${c.i}" style="background:${hex}" aria-pressed="${color === i ? 'true' : 'false'}" aria-label="${esc(t(`main.flexColor_${i}`))}"></button>`).join('') : '';
        return `<div class="reg-fx-clsbox"><input type="text" class="reg-fx-cls" list="fx-cls-list" data-fx-cls="${c.i}" maxlength="40" value="${esc(c.cls || '')}" placeholder="${esc(t('main.flexClsNone'))}" aria-label="${esc(t('main.flexColClass'))}">${c.cls ? `<button type="button" class="reg-fx-down" data-fx-down="${c.i}" title="${esc(t('main.flexClsDown'))}" aria-label="${esc(t('main.flexClsDown'))}"><i class="bx bx-down-arrow-alt" aria-hidden="true"></i></button>` : ''}</div><div class="reg-fx-dots">${dots}</div>`;
    };
    // ---- la tabla de columnas (Daniel, 2026-11-26, «La opción A, hazlo!»): UNA TABLA con una fila por columna del Excel, en el orden del archivo y todo a la vista (antes eran tarjetas en grupos cerrados que había que abrir uno por uno) ----
    // Cada fila lleva UNA decisión (ya existe / nueva adicional / no se carga) y, a su lado, el resultado: a cuál columna se une, o los campos de una columna nueva (cómo se carga, cómo se junta, nombre y clasificación). En «tal cual» no hay decisión: solo nombre y clasificación.
    const rowHtml = (c) => {
        const roles = s.mode === 'roles';
        const ex = exMap();
        const segBtn = (st, key) => `<button type="button" data-fx-st="${st}" data-fx-for="${c.i}" aria-pressed="${c.st === st ? 'true' : 'false'}">${esc(t(key))}</button>`;
        const pending = roles && c.st === 'new' && c.sugState === 'pending';
        const isNewCol = roles && c.isNew && c.st === 'new';
        const nameInput = `<input type="text" class="reg-fx-name" data-fx-name="${c.i}" maxlength="60" value="${esc(c.name)}" placeholder="${esc(t('main.flexNamePh'))}" aria-label="${esc(t('main.flexColName'))}">`;
        const classEdit = `<span class="reg-tb-clsw">${classBox(c)}</span>`;
        const lost = roles && keyLost(c);
        const cls = ['reg-tb-row', roles ? `reg-tb-${c.st}` : 'reg-tb-asis', isNewCol ? 'reg-tb-newcol' : '', pending ? 'reg-tb-pending' : '', lost ? 'reg-tb-keylost' : ''].filter(Boolean).join(' ');
        const pick = `<div class="reg-tb-pick"><label class="reg-cd-pick"><input type="checkbox" data-fx-pick="${c.i}"${c.sel ? ' checked' : ''} aria-label="${esc(t('main.flexPick', { name: c.text }))}"></label></div>`;
        const colCell = `<div class="reg-tb-col"><b>${esc(c.text)}</b>${isNewCol ? `<span class="reg-fx-new">${esc(t('main.flexNewCol'))}</span>` : ''}<small>${c.example === undefined || c.example === null || c.example === '' ? '' : esc(c.example)}</small></div>`;
        if (!roles) return `<div class="${cls}">${pick}${colCell}<div class="reg-tb-name">${nameInput}</div><div class="reg-tb-cls">${classEdit}</div></div>`;
        const choice = `<div class="reg-tb-st"><span class="reg-seg reg-tb-seg" role="group" aria-label="${esc(c.text)}">${hasExisting() ? segBtn('exist', 'main.flexStExist') : ''}${segBtn('new', 'main.flexStNew')}${segBtn('skip', 'main.flexStSkip')}</span></div>`;
        // Las cuatro celdas de la derecha (Daniel, 2026-11-26, «La opción 1, hazlo!»): cómo se carga, nombre (o a cuál se une) y clasificación, SIEMPRE a la vista:
        // «ya existe» los muestra solo para leer con lo ya definido; «nueva adicional» los escribe ahí mismo; «no se carga» lleva un guion.
        let how; let nm; let cl;
        if (c.st === 'exist') {
            const opts = [...ex.values()].map((e) => `<option value="${esc(e.name)}"${e.name === c.link ? ' selected' : ''}>${esc(e.name)}</option>`).join('');
            const cur = ex.get(c.link);
            how = cur ? `<span class="reg-tb-role" title="${esc(t(`main.flexRole_${cur.role}`))}">${esc(t(`main.flexRoleS_${cur.role}`))}${cur.role === 'value' && cur.agg ? ` · ${esc(t(`main.flexAgg_${cur.agg}`))}` : ''}</span>` : '<span class="reg-fx-dash">—</span>';
            nm = `<select data-fx-link="${c.i}" aria-label="${esc(t('main.flexLinkTo'))}">${c.link ? '' : `<option value="" selected>${esc(t('main.flexLinkPick'))}</option>`}${opts}<option value="__new">${esc(t('main.flexWriteName'))}</option></select>`;
            const dot = cur && Number.isInteger(cur.color) ? CLASS_COLORS[cur.color] : '';
            cl = cur && cur.cls ? `<span class="reg-tb-ro">${dot ? `<i class="reg-tb-dot" style="background:${dot}"></i>` : ''}<span>${esc(cur.cls)}</span></span>` : `<span class="reg-tb-ro reg-tb-ro-none">${esc(t('main.flexClsNone'))}</span>`;
        } else if (c.st === 'new') {
            const roleSeg = `<span class="reg-seg" role="group">${['key', 'data', 'value'].map((r) => `<button type="button" data-fx-rolebtn="${r}" data-fx-for="${c.i}" title="${esc(t(`main.flexRole_${r}`))}" aria-pressed="${c.role === r ? 'true' : 'false'}">${esc(t(`main.flexRoleS_${r}`))}</button>`).join('')}</span>`;
            const aggSeg = `<span class="reg-seg" role="group" title="${esc(t('main.flexColJoin'))}">${['sum', 'one'].map((a) => `<button type="button" data-fx-aggbtn="${a}" data-fx-for="${c.i}" aria-pressed="${c.agg === a ? 'true' : 'false'}">${esc(t(`main.flexAgg_${a}`))}</button>`).join('')}</span><label class="reg-fx-stamp"><input type="checkbox" data-fx-stamp="${c.i}"${c.stampName ? ' checked' : ''}> <span>${esc(t('main.flexStampName'))}</span></label>`;
            how = `<div class="reg-tb-stack">${roleSeg}${c.role === 'value' ? aggSeg : ''}</div>`;
            nm = nameInput;
            cl = classEdit;
        } else how = nm = cl = '<span class="reg-fx-dash">—</span>';
        const sug = pending ? `<div class="reg-cd-sug"><span>${esc(t('main.flexSugAsk', { name: c.sug }))}</span><button type="button" class="btn btn-secondary" data-fx-sug="yes" data-fx-for="${c.i}">${esc(t('main.flexSugYes'))}</button><button type="button" class="btn btn-secondary" data-fx-sug="no" data-fx-for="${c.i}">${esc(t('main.flexSugNo'))}</button></div>` : '';
        const keyWarn = lost ? `<div class="reg-fx-keywarn" role="note">${esc(t('main.flexKeyLostRow'))}</div>` : '';
        return `<div class="${cls}">${pick}${colCell}${choice}<div class="reg-tb-how">${how}</div><div class="reg-tb-nm">${nm}</div><div class="reg-tb-cl">${cl}</div>${sug}${keyWarn}</div>`;
    };
    const inView = (c) => s.view === 'all' || (s.mode === 'roles' && ((s.view === 'new' && c.st === 'new') || (s.view === 'skip' && c.st === 'skip')));
    const tableHtml = () => {
        const roles = s.mode === 'roles';
        const list = s.cols.filter(inView);
        const head = roles ? ['', t('main.flexTbCol'), t('main.flexTbDo'), t('main.flexTbHow'), t('main.flexTbName'), t('main.flexColClass')] : ['', t('main.flexTbCol'), t('main.flexColName'), t('main.flexColClass')];
        return `<div class="reg-tb reg-tb-m-${roles ? 'roles' : 'asis'}"><div class="reg-tb-head">${head.map((h) => `<span>${esc(h)}</span>`).join('')}</div>${list.map(rowHtml).join('') || `<p class="admin-hint reg-tb-empty">${esc(t('main.emptyStateText'))}</p>`}</div>`;
    };
    const mapHtml = () => {
        const info = s.info;
        const roles = s.mode === 'roles';
        const count = (st) => s.cols.filter((c) => c.st === st).length;
        const pend = s.cols.filter((c) => c.st === 'new' && c.sugState === 'pending').length;
        const pills = roles ? `<div class="reg-cd-sum" aria-live="polite">${hasExisting() ? `<span class="wp-imp-pv wp-imp-pv-ok">${esc(t('main.flexSumExist', { n: num(count('exist')) }))}</span>` : ''}<span class="wp-imp-pv wp-imp-pv-warn">${esc(t('main.flexSumNew', { n: num(count('new') - pend) }))}</span>${pend ? `<span class="wp-imp-pv wp-imp-pv-error">${esc(t('main.flexSumPending', { n: num(pend) }))}</span>` : ''}<span class="wp-imp-pv wp-imp-pv-keep">${esc(t('main.flexSumSkip', { n: num(count('skip')) }))}</span></div>` : '';
        const views = roles && hasExisting() ? `<div class="reg-cd-views" role="group">${[['all', 'main.flexViewAll'], ['new', 'main.flexViewNew'], ['skip', 'main.flexViewSkip']].map(([v, k]) => `<button type="button" data-fx-view="${v}" aria-pressed="${s.view === v ? 'true' : 'false'}">${esc(t(k))}</button>`).join('')}</div>` : '';
        const nSel = s.cols.filter((c) => c.sel).length;
        const bulkBtn = (v, label) => `<button type="button" data-fx-bulk="${v}">${esc(label)}</button>`;
        const bulk = `<div class="reg-cd-bulk"><span class="reg-cd-bulk-n">${esc(t('main.flexBulkCount', { n: num(nSel) }))}</span><button type="button" class="reg-cd-link-btn" data-fx-bulk="all">${esc(t('main.flexBulkAll'))}</button><button type="button" class="reg-cd-link-btn" data-fx-bulk="none">${esc(t('main.flexBulkNone'))}</button>${nSel ? `<span class="reg-seg" role="group" aria-label="${esc(t('main.flexBulkTitle'))}">${roles ? `${bulkBtn('new', t('main.flexStNew'))}${bulkBtn('skip', t('main.flexStSkip'))}${['key', 'data', 'value'].map((r) => bulkBtn(`role:${r}`, t(`main.flexRole_${r}`))).join('')}` : ''}</span><span class="reg-cd-bulk-cls"><input type="text" id="fx-bulk-cls" list="fx-cls-list" maxlength="40" placeholder="${esc(t('main.flexClsNone'))}" aria-label="${esc(t('main.flexColClass'))}">${bulkBtn('cls', t('main.flexBulkApply'))}</span>` : ''}</div>`;
        const lostKeys = roles ? s.cols.filter(keyLost) : [];
        const keyBanner = lostKeys.length ? `<p class="reg-fx-keybanner" role="note"><b>${esc(t('main.flexKeyLostTitle'))}</b> ${esc(t('main.flexKeyLostText', { list: lostKeys.map((c) => `«${c.text}»`).join(', ') }))}</p>` : '';
        return `<h3 id="reg-i-title">${esc(t('main.flexImpTitle', { name: regName(reg) }))}</h3>
            <div class="reg-fx-modes" role="radiogroup" data-help-key="regFlexMode"><label class="reg-fx-mode${roles ? '' : ' reg-fx-mode-on'}"><input type="radio" name="fx-mode" value="asis"${roles ? '' : ' checked'}> <span>${esc(t('main.flexModeAsis'))}</span></label><label class="reg-fx-mode${roles ? ' reg-fx-mode-on' : ''}"><input type="radio" name="fx-mode" value="roles"${roles ? ' checked' : ''}> <span>${esc(t('main.flexModeRoles'))}</span></label></div>
            <p class="admin-hint">${esc(t('main.flexRead', { cols: info.headers.length, rows: num(info.rowsDeclared) }))}</p>
            ${info.sheets.length > 1 ? `<div class="reg-sheet"><label for="reg-i-sheet">${esc(t('main.regSheet'))}</label><select id="reg-i-sheet">${info.sheets.map((sh) => `<option value="${esc(sh.name)}"${sh.name === s.sheet ? ' selected' : ''}>${esc(sh.name)}</option>`).join('')}</select></div>` : ''}
            ${pills}${views}${bulk}${keyBanner}
            <div class="wp-imp-table-wrap reg-cd-wrap" data-help-key="regFlexMap">${tableHtml()}</div>${classList()}
            <div class="reg-day" data-help-key="regFlexWhen"><label for="fx-day">${esc(t('main.flexWhen'))}</label><input type="date" id="fx-day" value="${esc(s.day)}" max="${esc(todayText)}"><input type="time" id="fx-time" value="${esc(s.time)}" aria-label="${esc(t('main.flexWhenTime'))}"></div>
            ${errBox()}<div class="admin-form-actions"><button type="button" class="btn" data-reg-i="review"${s.busy ? ' disabled' : ''}>${esc(t('main.regReview'))}</button><button type="button" class="btn btn-secondary" data-reg-i="again"${s.busy ? ' disabled' : ''}>${esc(t('main.regChooseAnother'))}</button><button type="button" class="btn btn-secondary" data-reg-i="cancel"${s.busy ? ' disabled' : ''}>${esc(t('main.regCancel'))}</button></div>`;
    };
    const pill = (cls, text) => `<span class="wp-imp-pv wp-imp-pv-${cls}">${esc(text)}</span>`;
    const previewHtml = () => {
        const sum = s.preview.summary;
        const issues = s.preview.issues || [];
        const shown = issues.slice(0, ISSUES_SHOWN);
        const nothing = !sum.added;
        const roles = sum.mode === 'roles';
        const pills = [
            nothing ? pill('warn', t('main.regSumNothing')) : '',
            sum.newRows ? pill('ok', t('main.flexSumNewRows', { n: num(sum.newRows) })) : '',
            roles && sum.filledCells ? pill('ok', t('main.flexSumFilled', { cells: num(sum.filledCells), rows: num(sum.filledRows) })) : '',
            roles && sum.valuesAdded ? pill('ok', t('main.regSumAdded', { n: num(sum.valuesAdded) })) : '',
            roles && sum.merged ? pill('keep', t('main.flexSumMerged', { n: num(sum.merged) })) : '',
            sum.untouched ? pill('keep', t('main.regSumUntouched', { n: num(sum.untouched) })) : '',
            sum.different ? pill('warn', t('main.regSumDifferent', { n: num(sum.different) })) : '',
            sum.errors ? pill('error', t(sum.errors === 1 ? 'main.regSumErrorOne' : 'main.regSumError', { n: num(sum.errors) })) : '',
            sum.blank ? pill('keep', t('main.flexSumBlank', { n: num(sum.blank) })) : '',
        ].join('');
        const issueRows = shown.map((i) => `<tr class="wp-imp-row wp-imp-row-${i.kind === 'error' ? 'error' : 'warn'}"><td class="wp-imp-num">${i.line}</td><td>${esc(i.column)}</td><td class="wp-imp-num">${i.file === undefined ? '' : esc(i.file)}</td><td class="wp-imp-num">${i.saved === undefined ? '' : esc(i.saved)}</td><td>${esc(t(`main.flexProb_${i.problem}`))}</td></tr>`).join('');
        // Casi todos los renglones comparten la misma llave (Daniel, 2026-11-27): lo más probable es que la llave no distinga un renglón de otro. Solo se avisa.
        const mergedWarn = roles && sum.merged >= 5 && sum.rowsInFile > 0 && sum.merged / sum.rowsInFile >= 0.5 ? `<p class="reg-fx-mergedwarn" role="alert"><b>${esc(t('main.flexMergedTitle'))}</b> ${esc(t('main.flexMergedText', { merged: num(sum.merged), rows: num(sum.rowsInFile), groups: num(sum.groups || (sum.rowsInFile - sum.merged)), back: t('main.flexBack') }))}</p>` : '';
        return `<h3 id="reg-i-title">${esc(s.file ? s.file.name : t('main.flexImpTitle', { name: regName(reg) }))}</h3>
            <p class="admin-hint">${esc(t('main.regRowsRead', { rows: num(sum.rowsInFile), sheet: sum.sheet || '' }))}</p>
            <div class="wp-imp-sum" data-help-key="regPreview">${pills}</div>${mergedWarn}
            ${shown.length ? `<div class="wp-imp-table-wrap"><table class="wp-imp-table"><thead><tr><th>${esc(t('main.regIssueRow'))}</th><th>${esc(t('main.flexIssueCol'))}</th><th>${esc(t('main.regIssueFile'))}</th><th>${esc(t('main.regIssueSaved'))}</th><th>${esc(t('main.regIssueWhat'))}</th></tr></thead><tbody>${issueRows}</tbody></table></div>
            ${sum.issuesTotal > shown.length ? `<p class="admin-hint">${esc(t('main.regIssuesMore', { shown: shown.length, total: num(sum.issuesTotal) }))}</p>` : ''}` : ''}
            ${errBox()}<div class="admin-form-actions"><button type="button" class="btn" data-reg-i="load"${nothing || s.busy ? ' disabled' : ''}><i class="bx bx-upload" aria-hidden="true"></i> ${esc(nothing ? t('main.regLoadNothing') : t('main.regLoadGo'))}</button>
            <button type="button" class="btn btn-secondary" data-reg-i="back"${s.busy ? ' disabled' : ''}>${esc(t('main.flexBack'))}</button><button type="button" class="btn btn-secondary" data-reg-i="again"${s.busy ? ' disabled' : ''}>${esc(t('main.regChooseAnother'))}</button><button type="button" class="btn btn-secondary" data-reg-i="cancel"${s.busy ? ' disabled' : ''}>${esc(t('main.regCancel'))}</button></div>`;
    };
    const doneHtml = () => {
        const sum = s.result.summary;
        return `<h3 id="reg-i-title">${esc(t('main.regDoneTitle'))}</h3>
            <p>${esc(t('main.flexDoneText', { rows: num(sum.newRows), values: num(sum.mode === 'roles' ? sum.valuesAdded : 0) }))}</p>
            ${sum.filledCells ? `<p>${esc(t('main.flexDoneFilled', { cells: num(sum.filledCells), rows: num(sum.filledRows) }))}</p>` : ''}
            ${sum.different || sum.errors ? `<p class="admin-hint">${esc(t('main.regDoneKept', { n: num(sum.different + sum.errors) }))}</p>` : ''}
            <div class="admin-form-actions"><button type="button" class="btn" data-reg-i="done">${esc(t('main.regDone'))}</button></div>`;
    };
    let paintedStep = null;
    const paint = () => {
        const wide = s.step === 'preview' || s.step === 'map';
        // al volver a dibujar el MISMO paso (por ejemplo al elegir una opción de una columna) la lista de columnas se queda donde iba y el foco en el mismo control: antes regresaba hasta arriba
        const same = paintedStep === s.step;
        const wrapOld = same ? overlay.querySelector('.wp-imp-table-wrap') : null;
        const panelOld = same ? overlay.querySelector('.modal-panel') : null;
        const keep = { wt: wrapOld ? wrapOld.scrollTop : 0, wl: wrapOld ? wrapOld.scrollLeft : 0, pt: panelOld ? panelOld.scrollTop : 0 };
        const active = same && document.activeElement && overlay.contains(document.activeElement) ? document.activeElement : null;
        let focusSel = '';
        if (active) {
            const attrs = [...active.attributes].filter((a) => a.name.startsWith('data-fx-') && a.value !== '');
            if (attrs.length) focusSel = attrs.map((a) => `[${a.name}="${a.value}"]`).join(''); else if (active.id) focusSel = `#${active.id}`;
        }
        overlay.innerHTML = `<div class="modal-panel exp-panel wp-modal wp-imp${wide ? ' wp-imp-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="reg-i-title" aria-label="${esc(t('main.regImport'))}" data-help-key="regFlexImport">${s.step === 'preview' ? previewHtml() : s.step === 'map' ? mapHtml() : s.step === 'done' ? doneHtml() : startHtml()}</div>`;
        if (same) {
            const wrapNew = overlay.querySelector('.wp-imp-table-wrap');
            if (wrapNew) { wrapNew.scrollTop = keep.wt; wrapNew.scrollLeft = keep.wl; }
            const panelNew = overlay.querySelector('.modal-panel');
            if (panelNew) panelNew.scrollTop = keep.pt;
            if (focusSel) { const again = overlay.querySelector(focusSel); if (again && typeof again.focus === 'function') again.focus({ preventScroll: true }); }
        }
        paintedStep = s.step;
    };
    const showError = (text) => { s.error = text; const el = overlay.querySelector('#reg-i-error'); if (el) { el.textContent = text; el.hidden = !text; } };
    const setBusy = (busy) => { s.busy = busy; paint(); if (s.error) showError(s.error); };
    const post = async (path, query, body) => {
        const res = await fetch(`${API}/${st.key}/${path}?${new URLSearchParams(query).toString()}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
        return out;
    };
    const inspect = async (sheet) => {
        const q = {}; if (sheet) q.sheet = sheet;
        s.info = await post('inspect', q, s.buffer);
        s.sheet = s.info.sheet;
        // si el registro ya tuvo cargas, cada título se reconoce solo (por el título que traía en una carga anterior) y toma lo ya definido: «ya existe». Uno que trae otro nombre pero se parece a una columna que ya existe
        // queda «por confirmar» (la persona decide si es esa o una nueva adicional); lo demás es una nueva adicional con la marca «Nueva».
        const prevRoles = s.info.prevMode === 'roles';
        const known = exMap();
        s.cols = s.info.headers.map((h, k) => {
            const p = h.prefill;
            if (p && p.cls && Number.isInteger(p.color) && s.classColors[foldCls(p.cls)] === undefined) s.classColors[foldCls(p.cls)] = p.color;
            const c = { i: h.index, text: h.text, example: s.info.sample[0] ? s.info.sample[0].values[k] : '', st: 'new', link: '', sug: '', sugState: '', isNew: !!s.info.prevMode,
                role: p && prevRoles ? p.role : (prevRoles && h.suggest.role === 'key' ? 'data' : h.suggest.role), agg: p && prevRoles && p.agg ? p.agg : h.suggest.agg, stampName: p && prevRoles ? p.stampName !== false : h.suggest.stampName === true,
                name: (p && p.name) || h.text, cls: (p && p.cls) || '', wasKey: !!(prevRoles && p && p.role === 'key') };
            if (prevRoles && p && p.role === 'skip') { c.st = 'skip'; c.isNew = false; c.role = h.suggest.role; c.name = h.text; }
            else if (prevRoles && p && known.has(p.name)) { c.st = 'exist'; c.link = p.name; c.isNew = false; }
            else if (prevRoles && p) c.isNew = false;
            else if (prevRoles && h.link && known.has(h.link.name)) {
                if (h.link.score >= 1) { c.st = 'exist'; c.link = h.link.name; c.isNew = false; } else { c.sug = h.link.name; c.sugState = 'pending'; }
            }
            return c;
        });
        if (s.info.prevMode && !s.prevApplied) { s.prevApplied = true; s.mode = s.info.prevMode; }
    };
    const stampIso = () => { const d = new Date(`${s.day}T${s.time || '00:00'}`); return Number.isNaN(d.getTime()) ? '' : d.toISOString(); };
    const readWhen = () => { const d = overlay.querySelector('#fx-day'); const tm = overlay.querySelector('#fx-time'); if (d) s.day = d.value; if (tm) s.time = tm.value; };
    // la elección de esta carga: «tal cual» lleva todas las columnas; con papeles, lo ya definido si «ya existe», lo que se escribió si es nueva, y las que no se cargan van marcadas
    const config = () => ({ mode: s.mode, columns: s.cols.map((c) => { const e = effective(c); return { i: c.i, src: c.text, name: e.name, role: e.role, agg: e.agg, stampName: e.stampName, cls: e.cls, color: e.color }; }) });
    const importQuery = (mode) => ({ mode, header: String(s.info.headerRow), sheet: s.sheet || '', file: s.file ? s.file.name : '', cfg: JSON.stringify(config()), stamp: stampIso() });
    // lo que se puede revisar sin ir al servidor: columnas por confirmar, una llave al menos, nombres sin repetir y un día válido
    const problem = () => {
        readWhen();
        if (!stampIso()) return t('main.regErr_IMPORT_STAMP');
        if (s.mode === 'roles') {
            const pend = s.cols.filter((c) => c.st === 'new' && c.sugState === 'pending');
            if (pend.length) return t('main.flexErrPending', { list: pend.map((c) => `«${c.text}» → «${c.sug}»`).join(', ') });
            const noLink = s.cols.find((c) => c.st === 'exist' && !c.link);
            if (noLink) return t('main.flexErrNoLink', { name: noLink.text });
        }
        const noName = s.cols.find((c) => (s.mode === 'asis' || c.st === 'new') && !String(c.name || '').trim());
        if (noName) return t('main.flexErrNoName', { name: noName.text });
        const used = s.cols.filter((c) => s.mode === 'asis' || c.st !== 'skip').map(effective);
        if (s.mode === 'roles' && !used.some((c) => c.role === 'key')) return t('main.regErr_FLEX_NO_KEY');
        const seen = new Set();
        for (const c of used) { const f = foldName(c.name); if (seen.has(f)) return t('main.regErr_FLEX_DUP_NAME'); seen.add(f); }
        return '';
    };
    const review = async () => {
        const bad = problem();
        if (bad) { showError(bad); return; }
        setBusy(true); s.error = '';
        try {
            s.preview = await post('import', importQuery('preview'), s.buffer);
            s.step = 'preview'; s.busy = false; paint();
        } catch (err) { s.error = errorTextOf(err); s.busy = false; paint(); }
    };
    const chooseFile = async (file) => {
        if (!file) return;
        s.error = '';
        if (file.size > 60 * 1024 * 1024) { s.error = t('main.regErr_IMPORT_TOO_BIG'); paint(); return; }
        s.file = file;
        setBusy(true);
        try { s.buffer = await file.arrayBuffer(); } catch { s.busy = false; s.error = t('main.regErr_IMPORT_FILE'); paint(); return; }
        try { await inspect(null); s.step = 'map'; s.busy = false; paint(); } catch (err) { s.error = errorTextOf(err); s.busy = false; s.step = 'start'; s.file = null; s.buffer = null; paint(); }
    };
    const load = async () => {
        setBusy(true); s.error = '';
        try {
            s.result = await post('import', importQuery('commit'), s.buffer);
            s.step = 'done'; s.busy = false; paint();
        } catch (err) { s.error = errorTextOf(err); s.busy = false; paint(); }
    };
    const pasteGo = () => {
        const box = overlay.querySelector('#reg-i-paste');
        if (box) s.pasteText = box.value;
        const file = pastedFile(s.pasteText);
        if (!file) { s.error = t('main.tplNoRows'); paint(); return; }
        chooseFile(file);
    };
    overlay.addEventListener('click', (event) => {
        // el color de una clasificación y «aplicar a las siguientes columnas sin clasificación»
        const dot = event.target.closest('[data-fx-color]');
        if (dot && !s.busy) { const c = s.cols.find((x) => String(x.i) === dot.dataset.fxFor); if (c && c.cls) { readWhen(); s.classColors[foldCls(c.cls)] = Number(dot.dataset.fxColor); paint(); } return; }
        const down = event.target.closest('[data-fx-down]');
        if (down && !s.busy) {
            const at = s.cols.findIndex((x) => String(x.i) === down.dataset.fxDown);
            const from = s.cols[at];
            if (from && from.cls) {
                readWhen();
                for (let k = at + 1; k < s.cols.length; k += 1) { const c = s.cols[k]; if (c.cls || (s.mode === 'roles' && c.role === 'skip')) break; c.cls = from.cls; }
                paint();
            }
            return;
        }
        const col = (i) => s.cols.find((x) => String(x.i) === String(i));
        const pick = event.target.closest('[data-fx-pick]');
        if (pick && !s.busy) {
            const at = s.cols.findIndex((x) => String(x.i) === pick.dataset.fxPick);
            if (at >= 0) {
                if (event.shiftKey && s.lastPick !== undefined) { const lo = Math.min(s.lastPick, at); const hi = Math.max(s.lastPick, at); for (let k = lo; k <= hi; k += 1) if (inView(s.cols[k])) s.cols[k].sel = pick.checked; } else s.cols[at].sel = pick.checked;
                s.lastPick = at; readWhen(); paint();
            }
            return;
        }
        const bulk = event.target.closest('[data-fx-bulk]');
        if (bulk && !s.busy) {
            readWhen();
            const v = bulk.dataset.fxBulk;
            const chosen = s.cols.filter((c) => c.sel);
            if (v === 'all') s.cols.filter(inView).forEach((c) => { c.sel = true; });
            else if (v === 'none') s.cols.forEach((c) => { c.sel = false; });
            else if (v === 'new' || v === 'skip') chosen.forEach((c) => { if (c.sugState === 'pending') c.sugState = 'rejected'; c.st = v; if (v === 'new' && s.info.prevMode) c.isNew = true; });
            else if (v.startsWith('role:')) chosen.forEach((c) => { if (c.sugState === 'pending') c.sugState = 'rejected'; c.st = 'new'; c.role = v.slice(5); if (s.info.prevMode) c.isNew = true; });
            else if (v === 'cls') { const val = String((overlay.querySelector('#fx-bulk-cls') || {}).value || '').replace(/\s+/g, ' ').trim(); chosen.forEach((c) => { if (s.mode === 'asis' || c.st === 'new') { c.cls = val; ensureClassColor(c); } }); }
            s.error = '';
            paint(); return;
        }
        const stBtn = event.target.closest('[data-fx-st]');
        if (stBtn && !s.busy) {
            readWhen();
            const c = col(stBtn.dataset.fxFor); const to = stBtn.dataset.fxSt;
            if (c) {
                if (to === 'exist') { c.st = 'exist'; if (!c.link) c.link = c.sug && exMap().has(c.sug) ? c.sug : ''; if (c.link && c.link === c.sug) c.sugState = 'accepted'; c.isNew = false; }
                else { if (c.sugState === 'pending') c.sugState = 'rejected'; c.st = to; if (to === 'new' && s.info.prevMode) c.isNew = true; }
                s.error = '';
            }
            paint(); return;
        }
        const sugBtn = event.target.closest('[data-fx-sug]');
        if (sugBtn && !s.busy) {
            const c = col(sugBtn.dataset.fxFor);
            if (c) { readWhen(); if (sugBtn.dataset.fxSug === 'yes') { c.st = 'exist'; c.link = c.sug; c.sugState = 'accepted'; c.isNew = false; } else c.sugState = 'rejected'; s.error = ''; paint(); }
            return;
        }
        const roleBtn = event.target.closest('[data-fx-rolebtn]');
        if (roleBtn && !s.busy) { const c = col(roleBtn.dataset.fxFor); if (c) { readWhen(); c.role = roleBtn.dataset.fxRolebtn; paint(); } return; }
        const aggBtn = event.target.closest('[data-fx-aggbtn]');
        if (aggBtn && !s.busy) { const c = col(aggBtn.dataset.fxFor); if (c) { readWhen(); c.agg = aggBtn.dataset.fxAggbtn; paint(); } return; }
        const viewBtn = event.target.closest('[data-fx-view]');
        if (viewBtn && !s.busy) { readWhen(); s.view = viewBtn.dataset.fxView; paint(); return; }
        const btn = event.target.closest('[data-reg-i]');
        if (!btn || s.busy) return;
        const op = btn.dataset.regI;
        if (op === 'cancel') close();
        else if (op === 'open-columns') openFlexColumnsModal();
        else if (op === 'mode-file' || op === 'mode-paste') { s.inputMode = op === 'mode-paste' ? 'paste' : 'file'; s.error = ''; paint(); }
        else if (op === 'paste-go') pasteGo();
        else if (op === 'review') review();
        else if (op === 'back') { s.step = 'map'; s.error = ''; paint(); }
        else if (op === 'load') load();
        else if (op === 'again') { s.step = 'start'; s.file = null; s.buffer = null; s.info = null; s.preview = null; s.error = ''; paint(); }
        else if (op === 'done') close(); // cerrar con una carga guardada recarga la tabla
    });
    overlay.addEventListener('change', async (event) => {
        const el = event.target;
        const col = (attr) => s.cols.find((c) => String(c.i) === el.dataset[attr]);
        if (el.id === 'reg-i-file') chooseFile(el.files && el.files[0]);
        else if (el.name === 'fx-mode') { readWhen(); s.mode = el.value; s.error = ''; paint(); }
        else if (el.id === 'fx-day' || el.id === 'fx-time') readWhen();
        else if (el.id === 'reg-i-sheet') { setBusy(true); try { await inspect(el.value); s.busy = false; paint(); } catch (err) { s.error = errorTextOf(err); s.busy = false; paint(); } }
        else if (el.dataset.fxLink !== undefined) {
            const c = col('fxLink');
            if (c) {
                readWhen();
                if (el.value === '__new') {
                    // «＋ Escribir otro nombre»: la fila pasa a «nueva adicional» con el papel, cómo se junta y la clasificación de la columna a la que estaba unida, y el nombre en blanco para escribirlo
                    const e = exMap().get(c.link);
                    if (c.sugState === 'pending') c.sugState = 'rejected';
                    c.st = 'new'; if (s.info.prevMode) c.isNew = true;
                    if (e) { c.role = e.role; c.agg = e.agg; c.stampName = e.stampName; c.cls = e.cls || ''; if (c.cls && s.classColors[foldCls(c.cls)] === undefined && Number.isInteger(e.color)) s.classColors[foldCls(c.cls)] = e.color; }
                    c.name = ''; s.error = ''; paint();
                    const inp = overlay.querySelector(`[data-fx-name="${c.i}"]`); if (inp) inp.focus();
                } else { c.link = el.value; if (c.link && c.link === c.sug) c.sugState = 'accepted'; s.error = ''; paint(); }
            }
        }
        else if (el.dataset.fxStamp !== undefined) { const c = col('fxStamp'); if (c) c.stampName = el.checked; }
        else if (el.dataset.fxCls !== undefined) { const c = col('fxCls'); if (c) { readWhen(); c.cls = el.value.replace(/\s+/g, ' ').trim(); ensureClassColor(c); paint(); } } // al terminar de escribir: toma el color de la clasificación (el de una que ya existe o el siguiente de la paleta)
    });
    overlay.addEventListener('input', (event) => {
        const el = event.target;
        if (el.id === 'reg-i-paste') s.pasteText = el.value;
        else if (el.dataset && el.dataset.fxName !== undefined) { const c = s.cols.find((x) => String(x.i) === el.dataset.fxName); if (c) c.name = el.value; }
        else if (el.dataset && el.dataset.fxCls !== undefined) { const c = s.cols.find((x) => String(x.i) === el.dataset.fxCls); if (c) c.cls = el.value; }
    });
    overlay.addEventListener('paste', (event) => { if (event.target.id !== 'reg-i-paste') return; setTimeout(() => { s.pasteText = event.target.value; if (s.pasteText.trim() && !s.busy) pasteGo(); }, 50); });
    overlay.addEventListener('dragover', (event) => { const zone = event.target.closest && event.target.closest('#reg-i-drop'); if (zone) { event.preventDefault(); zone.classList.add('wp-imp-drop-over'); } });
    overlay.addEventListener('dragleave', (event) => { const zone = event.target.closest && event.target.closest('#reg-i-drop'); if (zone) zone.classList.remove('wp-imp-drop-over'); });
    overlay.addEventListener('drop', (event) => {
        const zone = event.target.closest && event.target.closest('#reg-i-drop');
        if (!zone) return;
        event.preventDefault();
        zone.classList.remove('wp-imp-drop-over');
        chooseFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
    });
    overlay.addEventListener('toggle', (event) => { const d = event.target; if (d && d.dataset && d.dataset.grp) s.open[d.dataset.grp] = d.open; }, true);
    paint();
}
function openLoadModal() {
    const reg = currentRegistry();
    if (!reg) return;
    if (reg.kind === 'tabla') { openFlexLoadModal(); return; }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    document.body.appendChild(overlay);
    const today = new Date();
    const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const s = { step: 'start', source: st.canTemplate && !st.canExcel ? 'plantilla' : 'excel', file: null, buffer: null, info: null, sheet: null, include: null, picks: null, day: todayText, preview: null, result: null, busy: false, error: '', reload: false, mode: 'file', pasteText: '' };
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape' && !s.busy) close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay && !s.busy) close(); });
    const errBox = () => `<p class="admin-error" id="reg-i-error" role="alert"${s.error ? '' : ' hidden'}>${esc(s.error)}</p>`;
    const dayField = () => `<div class="reg-day"><label for="reg-i-day">${esc(t('main.regDayLabel'))}</label><input type="date" id="reg-i-day" value="${esc(s.day)}" max="${esc(todayText)}"></div>`;
    const wayCard = (id, titleKey, steps, on, enabled) => `<label class="reg-way${on ? ' reg-way-on' : ''}${enabled ? '' : ' reg-way-off'}"><input type="radio" name="reg-way" value="${id}"${on ? ' checked' : ''}${enabled ? '' : ' disabled'}><b>${esc(t(titleKey))}</b><ol>${steps.map((k) => `<li>${esc(t(k))}</li>`).join('')}</ol></label>`;
    const startHtml = () => `<h3 id="reg-i-title">${esc(t('main.regImpTitle', { name: regName(reg) }))}</h3>
        <p class="admin-hint">${esc(t('main.regImpHint'))}</p>
        <div class="reg-ways" data-help-key="regWays">${wayCard('plantilla', 'main.regWayTemplate', ['main.regWayTemplate1', reg.kind === 'month' ? 'main.regWayTemplate2' : 'main.regWayTemplate2Day', 'main.regWayTemplate3'], s.source === 'plantilla', st.canTemplate)}${wayCard('excel', 'main.regWayExcel', ['main.regWayExcel1', 'main.regWayExcel2', 'main.regWayExcel3'], s.source === 'excel', st.canExcel)}</div>
        ${s.source === 'plantilla' ? `<p><button type="button" class="btn btn-secondary" data-reg-i="template"${s.busy ? ' disabled' : ''}><i class="bx bx-download" aria-hidden="true"></i> ${esc(t('main.regTemplate'))}</button></p>` : ''}
        ${reg.kind === 'day' && s.source === 'plantilla' ? dayField() : ''}
        <div class="tpl-seg" role="group"><button type="button" data-reg-i="mode-file" aria-pressed="${s.mode === 'file'}" data-help-key="tplUpload"${s.busy ? ' disabled' : ''}>${esc(t('main.tplModeFile'))}</button><button type="button" data-reg-i="mode-paste" aria-pressed="${s.mode === 'paste'}" data-help-key="tplPaste"${s.busy ? ' disabled' : ''}>${esc(t('main.tplModePaste'))}</button></div>
        ${s.mode === 'paste' ? `<div class="reg-paste"><textarea id="reg-i-paste" spellcheck="false" placeholder="${esc(t('main.tplPastePlaceholder'))}"${s.busy ? ' disabled' : ''}>${esc(s.pasteText)}</textarea><button type="button" class="btn btn-secondary" data-reg-i="paste-go"${s.busy ? ' disabled' : ''}>${esc(s.busy ? t('main.regReading') : t('main.tplPasteGo'))}</button></div>` : `<label class="wp-imp-drop" id="reg-i-drop" for="reg-i-file" data-help-key="regDrop"><b>${esc(s.busy ? t('main.regReading') : t('main.regDrop'))}</b><span>${esc(t('main.regDropOr'))}</span></label>
        <input type="file" id="reg-i-file" class="wp-imp-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"${s.busy ? ' disabled' : ''}>`}
        ${errBox()}<div class="admin-form-actions"><button type="button" class="btn btn-secondary" data-reg-i="cancel"${s.busy ? ' disabled' : ''}>${esc(t('main.regCancel'))}</button></div>`;
    const dimOptions = (selected, includeValue) => `<option value=""${selected === '' ? ' selected' : ''}>${esc(t('main.regNotLoaded'))}</option>${['unidad', 'unidadNombre', 'codigo', 'descripcion', 'categoria', 'udm'].map((d) => `<option value="${d}"${selected === d ? ' selected' : ''}>${esc(t(`main.regDim_${d}`))}</option>`).join('')}${includeValue ? `<option value="value"${selected === 'value' ? ' selected' : ''}>${esc(t('main.regValueColumn'))}</option>` : ''}`;
    const mapHtml = () => {
        const info = s.info;
        const monthCols = new Map((info.mapping.valueCols || []).map((v) => [v.col, v.period]));
        const rows = info.headers.map((h) => {
            if (reg.kind === 'month' && monthCols.has(h.index)) {
                const period = monthCols.get(h.index);
                return `<tr><td>${esc(h.text)}</td><td class="reg-map-ex">${esc(info.sample[0] ? info.sample[0].values[info.headers.indexOf(h)] : '')}</td><td><label class="reg-map-month"><input type="checkbox" data-reg-month="${h.index}"${s.include.has(h.index) ? ' checked' : ''}> ${esc(t('main.regAsMonth', { period: periodLabel(period) }))}</label></td></tr>`;
            }
            return `<tr><td>${esc(h.text)}</td><td class="reg-map-ex">${esc(info.sample[0] ? info.sample[0].values[info.headers.indexOf(h)] : '')}</td><td><select data-reg-pick="${h.index}">${dimOptions(s.picks[h.index] || '', reg.kind === 'day')}</select></td></tr>`;
        }).join('');
        const nMonths = monthCols.size;
        return `<h3 id="reg-i-title">${esc(t('main.regMapTitle'))}</h3>
            <p class="admin-hint">${esc(t(reg.kind === 'month' ? 'main.regMapRead' : 'main.regMapReadDay', { cols: info.headers.length, months: nMonths, rows: num(info.rowsDeclared) }))}</p>
            ${info.sheets.length > 1 ? `<div class="reg-sheet"><label for="reg-i-sheet">${esc(t('main.regSheet'))}</label><select id="reg-i-sheet">${info.sheets.map((sh) => `<option value="${esc(sh.name)}"${sh.name === s.sheet ? ' selected' : ''}>${esc(sh.name)}</option>`).join('')}</select></div>` : ''}
            <div class="wp-imp-table-wrap"><table class="wp-imp-table reg-map-table"><thead><tr><th>${esc(t('main.regMapYourCol'))}</th><th>${esc(t('main.regMapExample'))}</th><th>${esc(t('main.regMapLoadAs'))}</th></tr></thead><tbody>${rows}</tbody></table></div>
            ${reg.kind === 'day' ? dayField() : ''}
            ${errBox()}<div class="admin-form-actions"><button type="button" class="btn" data-reg-i="review"${s.busy ? ' disabled' : ''}>${esc(t('main.regReview'))}</button><button type="button" class="btn btn-secondary" data-reg-i="again"${s.busy ? ' disabled' : ''}>${esc(t('main.regChooseAnother'))}</button><button type="button" class="btn btn-secondary" data-reg-i="cancel"${s.busy ? ' disabled' : ''}>${esc(t('main.regCancel'))}</button></div>`;
    };
    const pill = (cls, text) => `<span class="wp-imp-pv wp-imp-pv-${cls}">${esc(text)}</span>`;
    const previewHtml = () => {
        const sum = s.preview.summary;
        const issues = s.preview.issues;
        const shown = issues.slice(0, ISSUES_SHOWN);
        const nothing = !sum.valuesAdded;
        const pills = [
            sum.valuesAdded ? pill('ok', t('main.regSumAdded', { n: num(sum.valuesAdded) })) : pill('warn', t('main.regSumNothing')),
            sum.newPeriods && sum.newPeriods.length ? pill('ok', t('main.regSumNewPeriods', { periods: sum.newPeriods.map(periodLabel).join(', ') })) : '',
            sum.newRows ? pill('ok', t(sum.newRows === 1 ? 'main.regSumNewRowsOne' : 'main.regSumNewRows', { n: num(sum.newRows) })) : '',
            sum.untouched ? pill('keep', t('main.regSumUntouched', { n: num(sum.untouched) })) : '',
            sum.different ? pill('warn', t('main.regSumDifferent', { n: num(sum.different) })) : '',
            sum.errors ? pill('error', t(sum.errors === 1 ? 'main.regSumErrorOne' : 'main.regSumError', { n: num(sum.errors) })) : '',
            sum.skippedFuture && sum.skippedFuture.length ? pill('warn', t('main.regSumFuture', { periods: sum.skippedFuture.map(periodLabel).join(', ') })) : '',
        ].join('');
        const periodRows = sum.periods.map((p) => `<tr><td>${esc(periodLabel(p.period))}</td><td>${esc(t(p.status === 'new' ? 'main.regPeriodNew' : 'main.regPeriodExisting'))}</td><td class="wp-imp-num">${num(p.added)}</td><td class="wp-imp-num">${num(p.untouched)}</td><td class="wp-imp-num">${num(p.different)}</td></tr>`).join('');
        const issueRows = shown.map((i) => `<tr class="wp-imp-row wp-imp-row-${i.kind === 'error' ? 'error' : 'warn'}"><td class="wp-imp-num">${i.line}</td><td>${esc(i.unidad)}</td><td>${esc(i.codigo)}</td><td>${esc(i.period ? periodLabel(i.period) : '')}</td><td class="wp-imp-num">${i.file === undefined ? '' : esc(typeof i.file === 'number' ? num(i.file) : i.file)}</td><td class="wp-imp-num">${i.saved === undefined ? '' : esc(num(i.saved))}</td><td>${esc(problemText(i))}</td></tr>`).join('');
        return `<h3 id="reg-i-title">${esc(s.file ? s.file.name : t('main.regImpTitle', { name: regName(reg) }))}</h3>
            <p class="admin-hint">${esc(t('main.regRowsRead', { rows: num(sum.rowsInFile), sheet: sum.sheet }))}</p>
            <div class="wp-imp-sum" data-help-key="regPreview">${pills}</div>
            ${periodRows ? `<div class="wp-imp-table-wrap reg-periods"><table class="wp-imp-table"><thead><tr><th>${esc(t('main.regPeriodCol'))}</th><th>${esc(t('main.regPeriodState'))}</th><th>${esc(t('main.regPeriodAdded'))}</th><th>${esc(t('main.regPeriodUntouched'))}</th><th>${esc(t('main.regPeriodDifferent'))}</th></tr></thead><tbody>${periodRows}</tbody></table></div>` : ''}
            ${shown.length ? `<div class="wp-imp-table-wrap"><table class="wp-imp-table"><thead><tr><th>${esc(t('main.regIssueRow'))}</th><th>${esc(t('main.regDim_unidad'))}</th><th>${esc(t('main.regDim_codigo'))}</th><th>${esc(t('main.regIssuePeriod'))}</th><th>${esc(t('main.regIssueFile'))}</th><th>${esc(t('main.regIssueSaved'))}</th><th>${esc(t('main.regIssueWhat'))}</th></tr></thead><tbody>${issueRows}</tbody></table></div>
            ${sum.issuesTotal > shown.length ? `<p class="admin-hint">${esc(t('main.regIssuesMore', { shown: shown.length, total: num(sum.issuesTotal) }))}</p>` : ''}` : ''}
            <p class="admin-hint">${esc(t('main.regOnlyAdds'))}</p>
            ${errBox()}<div class="admin-form-actions"><button type="button" class="btn" data-reg-i="load"${nothing || s.busy ? ' disabled' : ''}><i class="bx bx-upload" aria-hidden="true"></i> ${esc(nothing ? t('main.regLoadNothing') : t('main.regLoadGo'))}</button>
            ${issues.length ? `<button type="button" class="btn btn-secondary" data-reg-i="issues"${s.busy ? ' disabled' : ''}><i class="bx bx-download" aria-hidden="true"></i> ${esc(t('main.regIssuesDownload'))}</button>` : ''}
            <button type="button" class="btn btn-secondary" data-reg-i="again"${s.busy ? ' disabled' : ''}>${esc(t('main.regChooseAnother'))}</button><button type="button" class="btn btn-secondary" data-reg-i="cancel"${s.busy ? ' disabled' : ''}>${esc(t('main.regCancel'))}</button></div>`;
    };
    const doneHtml = () => {
        const sum = s.result.summary;
        return `<h3 id="reg-i-title">${esc(t('main.regDoneTitle'))}</h3>
            <p>${esc(t('main.regDoneText', { n: num(sum.valuesAdded), rows: num(sum.newRows) }))}</p>
            ${sum.newPeriods && sum.newPeriods.length ? `<p class="admin-hint">${esc(t('main.regDoneNewPeriods', { periods: sum.newPeriods.map(periodLabel).join(', ') }))}</p>` : ''}
            ${sum.different || sum.errors ? `<p class="admin-hint">${esc(t('main.regDoneKept', { n: num(sum.different + sum.errors) }))}</p>` : ''}
            <div class="admin-form-actions"><button type="button" class="btn" data-reg-i="done">${esc(t('main.regDone'))}</button></div>`;
    };
    let paintedStep = null;
    const paint = () => {
        const wide = s.step === 'preview' || s.step === 'map';
        // al volver a dibujar el MISMO paso (por ejemplo al elegir una opción de una columna) la lista de columnas se queda donde iba y el foco en el mismo control: antes regresaba hasta arriba
        const same = paintedStep === s.step;
        const wrapOld = same ? overlay.querySelector('.wp-imp-table-wrap') : null;
        const panelOld = same ? overlay.querySelector('.modal-panel') : null;
        const keep = { wt: wrapOld ? wrapOld.scrollTop : 0, wl: wrapOld ? wrapOld.scrollLeft : 0, pt: panelOld ? panelOld.scrollTop : 0 };
        const active = same && document.activeElement && overlay.contains(document.activeElement) ? document.activeElement : null;
        let focusSel = '';
        if (active) {
            const attr = [...active.attributes].find((a) => a.name.startsWith('data-') && a.name !== 'data-help-key' && a.value !== '');
            if (attr) focusSel = `[${attr.name}="${attr.value}"]`; else if (active.id) focusSel = `#${active.id}`;
        }
        overlay.innerHTML = `<div class="modal-panel exp-panel wp-modal wp-imp${wide ? ' wp-imp-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="reg-i-title" aria-label="${esc(t('main.regImport'))}" data-help-key="regImport">${s.step === 'preview' ? previewHtml() : s.step === 'map' ? mapHtml() : s.step === 'done' ? doneHtml() : startHtml()}</div>`;
        if (same) {
            const wrapNew = overlay.querySelector('.wp-imp-table-wrap');
            if (wrapNew) { wrapNew.scrollTop = keep.wt; wrapNew.scrollLeft = keep.wl; }
            const panelNew = overlay.querySelector('.modal-panel');
            if (panelNew) panelNew.scrollTop = keep.pt;
            if (focusSel) { const again = overlay.querySelector(focusSel); if (again && typeof again.focus === 'function') again.focus({ preventScroll: true }); }
        }
        paintedStep = s.step;
    };
    const showError = (text) => { s.error = text; const el = overlay.querySelector('#reg-i-error'); if (el) { el.textContent = text; el.hidden = !text; } };
    const setBusy = (busy) => { s.busy = busy; paint(); if (s.error) showError(s.error); };
    const post = async (path, query, body) => {
        const res = await fetch(`${API}/${st.key}/${path}?${new URLSearchParams(query).toString()}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
        return out;
    };
    const currentMapping = () => {
        const dims = {};
        Object.entries(s.picks).forEach(([col, dim]) => { if (dim && dim !== 'value' && dims[dim] === undefined) dims[dim] = Number(col); });
        const mapping = { dims, valueCols: [], valueCol: null };
        if (reg.kind === 'month') (s.info.mapping.valueCols || []).forEach((v) => { if (s.include.has(v.col)) mapping.valueCols.push(v); });
        else { const at = Object.entries(s.picks).find(([, dim]) => dim === 'value'); if (at) mapping.valueCol = Number(at[0]); }
        return mapping;
    };
    const importQuery = (mode) => {
        const q = { mode, source: s.source, file: s.file ? s.file.name : '' };
        if (s.sheet) q.sheet = s.sheet;
        if (reg.kind === 'day') q.day = s.day;
        if (s.source === 'excel') { q.mapping = JSON.stringify(currentMapping()); q.header = String(s.info.headerRow); }
        return q;
    };
    const inspect = async (sheet) => {
        const q = {}; if (sheet) q.sheet = sheet;
        s.info = await post('inspect', q, s.buffer);
        s.sheet = s.info.sheet;
        s.include = new Set((s.info.mapping.valueCols || []).map((v) => v.col));
        s.picks = {};
        Object.entries(s.info.mapping.dims || {}).forEach(([dim, col]) => { s.picks[col] = dim; });
        if (reg.kind === 'day' && s.info.mapping.valueCol !== null && s.info.mapping.valueCol !== undefined) s.picks[s.info.mapping.valueCol] = 'value';
    };
    const review = async () => {
        if (reg.kind === 'day') { const el = overlay.querySelector('#reg-i-day'); if (el) s.day = el.value; if (!s.day) { showError(t('main.regErr_IMPORT_DAY')); return; } }
        if (s.source === 'excel') {
            const m = currentMapping();
            if (m.dims.unidad === undefined || m.dims.codigo === undefined || (reg.kind === 'month' ? !m.valueCols.length : m.valueCol === null)) {
                showError(t('main.regErr_IMPORT_HEADERS', { missing: [m.dims.unidad === undefined ? t('main.regDim_unidad') : '', m.dims.codigo === undefined ? t('main.regDim_codigo') : '', (reg.kind === 'month' ? !m.valueCols.length : m.valueCol === null) ? t('main.regValueColumn') : ''].filter(Boolean).join(', ') }));
                return;
            }
        }
        setBusy(true); s.error = '';
        try {
            s.preview = await post('import', importQuery('preview'), s.buffer);
            s.step = 'preview'; s.busy = false; paint();
        } catch (err) { s.error = errorTextOf(err); s.busy = false; paint(); }
    };
    const chooseFile = async (file) => {
        if (!file) return;
        s.error = '';
        if (file.size > 60 * 1024 * 1024) { s.error = t('main.regErr_IMPORT_TOO_BIG'); paint(); return; }
        s.file = file;
        setBusy(true);
        try { s.buffer = await file.arrayBuffer(); } catch { s.busy = false; s.error = t('main.regErr_IMPORT_FILE'); paint(); return; }
        try {
            await inspect(null);
            if (s.info.missing && s.info.missing.length && s.source === 'plantilla') { const err = new Error('headers'); err.body = { code: 'IMPORT_HEADERS', missing: s.info.missing }; throw err; }
            if (s.source === 'excel') { s.step = 'map'; s.busy = false; paint(); return; }
            if (reg.kind === 'day') { const el = overlay.querySelector('#reg-i-day'); if (el) s.day = el.value; }
            await review();
        } catch (err) { s.error = errorTextOf(err); s.busy = false; s.step = 'start'; s.file = null; s.buffer = null; paint(); }
    };
    const downloadIssues = async () => {
        const L = lang();
        const heads = L === 'en' ? ['Row', 'Unit', 'Code', 'Period', 'In the file', 'Saved', 'What happens'] : ['Fila', 'Unidad', 'Código', 'Periodo', 'En el archivo', 'Guardado', 'Qué pasa'];
        const rows = s.preview.issues.map((i) => [i.line, i.unidad, i.codigo, i.period ? periodLabel(i.period) : '', i.file === undefined ? '' : i.file, i.saved === undefined ? '' : i.saved, problemText(i)]);
        try {
            const d = new Date();
            const filename = `${t('main.regIssuesFile')}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const res = await fetch('/api/business/export/xlsx', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t('main.regIssuesFile'), filename, columns: heads.map((label) => ({ label })), rows }) });
            if (!res.ok) throw new Error('export failed');
            saveFile(await res.blob(), `${filename}.xlsx`);
        } catch (err) { console.error('Registros: errores y diferencias no se pudieron bajar', err); showError(t('main.regTplError')); }
    };
    const load = async () => {
        setBusy(true); s.error = '';
        try {
            const before = (currentRegistry() || { periods: [] }).periods.join();
            s.result = await post('import', importQuery('commit'), s.buffer);
            await loadRegistries();
            const after = (currentRegistry() || { periods: [] }).periods.join();
            s.reload = before !== after; // un mes (o día) nuevo es una columna nueva: la tabla se arma de nuevo
            s.step = 'done'; s.busy = false; paint();
        } catch (err) { s.error = errorTextOf(err); s.busy = false; paint(); }
    };
    // lo pegado de Excel se vuelve un archivo y sigue el mismo camino que uno elegido
    const pasteGo = () => {
        const box = overlay.querySelector('#reg-i-paste');
        if (box) s.pasteText = box.value;
        const file = pastedFile(s.pasteText);
        if (!file) { s.error = t('main.tplNoRows'); paint(); return; }
        chooseFile(file);
    };
    overlay.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-reg-i]');
        if (!btn || s.busy) return;
        const op = btn.dataset.regI;
        if (op === 'cancel') close();
        else if (op === 'template') downloadTemplate();
        else if (op === 'mode-file' || op === 'mode-paste') { s.mode = op === 'mode-paste' ? 'paste' : 'file'; s.error = ''; paint(); }
        else if (op === 'paste-go') pasteGo();
        else if (op === 'review') review();
        else if (op === 'issues') downloadIssues();
        else if (op === 'load') load();
        else if (op === 'again') { s.step = 'start'; s.file = null; s.buffer = null; s.info = null; s.preview = null; s.error = ''; paint(); }
        else if (op === 'done') { close(); if (s.reload) location.reload(); else { refreshData(); if (st.tab === 'loads') refreshLoads(); else st.loads = null; Dashboard.showToast(t('main.regDoneToast'), 'success'); } }
    });
    overlay.addEventListener('change', async (event) => {
        const el = event.target;
        if (el.id === 'reg-i-file') chooseFile(el.files && el.files[0]);
        else if (el.name === 'reg-way') { s.source = el.value; s.error = ''; paint(); }
        else if (el.id === 'reg-i-day') s.day = el.value;
        else if (el.id === 'reg-i-sheet') { setBusy(true); try { await inspect(el.value); s.busy = false; paint(); } catch (err) { s.error = errorTextOf(err); s.busy = false; paint(); } }
        else if (el.dataset && el.dataset.regPick !== undefined) s.picks[el.dataset.regPick] = el.value;
        else if (el.dataset && el.dataset.regMonth !== undefined) { const col = Number(el.dataset.regMonth); if (el.checked) s.include.add(col); else s.include.delete(col); }
    });
    overlay.addEventListener('input', (event) => { if (event.target.id === 'reg-i-paste') s.pasteText = event.target.value; });
    overlay.addEventListener('paste', (event) => { if (event.target.id !== 'reg-i-paste') return; setTimeout(() => { s.pasteText = event.target.value; if (s.pasteText.trim() && !s.busy) pasteGo(); }, 50); });
    overlay.addEventListener('dragover', (event) => { const zone = event.target.closest && event.target.closest('#reg-i-drop'); if (zone) { event.preventDefault(); zone.classList.add('wp-imp-drop-over'); } });
    overlay.addEventListener('dragleave', (event) => { const zone = event.target.closest && event.target.closest('#reg-i-drop'); if (zone) zone.classList.remove('wp-imp-drop-over'); });
    overlay.addEventListener('drop', (event) => {
        const zone = event.target.closest && event.target.closest('#reg-i-drop');
        if (!zone) return;
        event.preventDefault();
        zone.classList.remove('wp-imp-drop-over');
        chooseFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
    });
    paint();
}
})();
