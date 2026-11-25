// ---------------------------------------------------------------------------
// Cadena de Suministro › Centro de Distribución › Cargas Manuales › Ventas Manuales: los tickets cargados por plantilla (Daniel, 2026-11-24, «Sí a las propuestas»). La lista trae un renglón por ticket (folio) con su subtotal, IVA y total (los calcula el sistema: precios con IVA incluido);
// «Cargar ventas» abre la ventana de carga (bajar la plantilla de Excel, elegir el archivo o pegar las celdas, revisar —lista / se salta / error, con su razón— y cargar solo los tickets completos y correctos) y «Descargar plantilla» baja el Excel.
// Los dos botones son del botón «Cargar ventas» del árbol (colVenImportAuth). Ver o imprimir el ticket con su QR, la factura y la opinión llegan en las piezas siguientes.
// ---------------------------------------------------------------------------
(function () {
const TABLE_KEY = 'ventas';
const API = '/api/business/pos-sales';
const TICKETS_SHOWN = 200; // la revisión dibuja los primeros tickets y todos los de después se piden con «Mostrar más»
const t = (key, params) => Dashboard.t(key, params);
const lang = () => (localStorage.getItem('lang') === 'en' ? 'en' : 'es');
const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n) => Number(n || 0).toLocaleString(lang() === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 3 });

let sales = [];
let canImport = false;
let canTicket = false;
let lastLoad = null; // la franja de «última carga» (todas las pantallas de Cargas Manuales la traen)
let loaded = false;

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
        if (!role) return;
        await refreshTable();
    } catch (err) {
        console.error('Ventas Manuales: failed to initialize', err);
    }
})();

function cell(col, value, extraClass) {
    const td = document.createElement('td');
    td.dataset.col = col;
    td.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    if (extraClass) td.className = extraClass;
    return td;
}
function getTbody() {
    return document.querySelector(`[data-table-id="${TABLE_KEY}"] table.data-table`).tBodies[0];
}
function ensureEmptyState() {
    const tbody = getTbody();
    if (tbody.querySelectorAll('tr').length) return;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'data-table-empty-cell';
    td.colSpan = document.querySelectorAll('table.data-table thead th').length;
    const inner = document.createElement('div');
    inner.className = 'data-table-empty-inner';
    inner.textContent = Dashboard.t('main.emptyStateText');
    td.appendChild(inner);
    tr.appendChild(td);
    tbody.appendChild(tr);
}
function buildRow(sale) {
    const tr = document.createElement('tr');
    tr.dataset.recordId = sale.id;
    const when = document.createElement('td');
    when.dataset.col = 'colVenFechaHora';
    Dashboard.renderTimeStamp(when, sale.soldAt);
    const actions = document.createElement('td');
    actions.dataset.col = 'actions';
    actions.className = 'admin-table-actions';
    const history = document.createElement('button');
    history.type = 'button';
    history.className = 'admin-icon-btn';
    history.setAttribute('data-help-key', 'changeHistory');
    history.setAttribute('aria-label', Dashboard.t('main.changeHistoryTitleRecord'));
    history.title = Dashboard.t('main.changeHistoryTitleRecord');
    history.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
    history.addEventListener('click', () => Dashboard.openChangeHistory(TABLE_KEY, sale.id));
    actions.appendChild(history);
    // «Ver ticket» (ver e imprimir el ticket con su QR): solo con su botón del árbol (el servidor también lo exige)
    if (canTicket) {
        const view = document.createElement('button');
        view.type = 'button';
        view.className = 'admin-icon-btn';
        view.setAttribute('data-help-key', 'venTicketView');
        view.setAttribute('aria-label', t('main.venTicketView'));
        view.title = t('main.venTicketView');
        view.innerHTML = '<i class="bx bx-receipt" aria-hidden="true"></i>';
        view.addEventListener('click', () => openTicket(sale));
        actions.appendChild(view);
    }
    const num = (col, value) => cell(col, money(value), 'col-num');
    tr.append(
        cell('colVenFolio', sale.folio), when, cell('colVenCentro', sale.centerCode),
        cell('colVenSitio', sale.siteName ? `${sale.siteCode} · ${sale.siteName}` : sale.siteCode), cell('colVenAtendio', sale.servedBy), cell('colVenMesaCaja', sale.place),
        cell('colVenArticulos', qty(sale.items), 'col-num'), num('colVenSubtotal', sale.subtotal), num('colVenIva', sale.tax), num('colVenTotal', sale.total), cell('colVenPago', sale.payment),
        actions,
    );
    return tr;
}
const searchText = () => (document.getElementById('filter-search-text')?.value || '').trim().toLowerCase();
function visibleSales() {
    const text = searchText();
    if (!text) return sales;
    return sales.filter((s) => SearchSyntax.matches('contains', text, [s.folio, s.centerCode, s.centerName, s.siteCode, s.siteName, s.servedBy, s.place, s.payment].filter(Boolean).join(' ').toLowerCase()));
}
function redraw() {
    const tbody = getTbody();
    tbody.innerHTML = '';
    const list = visibleSales();
    list.forEach((sale) => tbody.appendChild(buildRow(sale)));
    if (!list.length) ensureEmptyState();
    if (Dashboard.reapplyColumnFilters) Dashboard.reapplyColumnFilters(TABLE_KEY);
}
// Los dos botones (junto a las herramientas de la tabla): solo con el botón «Cargar ventas» del árbol; el servidor también lo exige.
function renderButtons() {
    const toolbar = document.querySelector(`[data-table-id="${TABLE_KEY}"]`)?.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('data-table-zoom') || !canImport) return;
    if (toolbar.querySelector('#ven-import-btn')) return;
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
    toolbar.classList.add('ven-toolbar');
    toolbar.prepend(make('ven-template-btn', 'bx-download', 'main.venTemplate', 'venTemplate', downloadTemplate));
    toolbar.prepend(make('ven-import-btn', 'bx-upload', 'main.venImport', 'venImport', openImportModal));
}
async function refreshTable() {
    try {
        const res = await fetch(API, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const body = await res.json();
        sales = body.sales || [];
        canImport = !!body.canImport;
        canTicket = !!body.canTicket;
        lastLoad = body.lastLoad || null;
        loaded = true;
        renderButtons();
        renderStamp();
        redraw();
        const tableWrapper = document.querySelector(`[data-table-id="${TABLE_KEY}"]`);
        if (tableWrapper) tableWrapper.setAttribute('data-help-key', 'venTable');
        let note = document.getElementById('ven-truncated');
        if (body.truncated) {
            if (!note) { note = document.createElement('p'); note.id = 'ven-truncated'; note.className = 'admin-hint'; tableWrapper.after(note); }
            note.textContent = t('main.venTruncated', { shown: sales.length, total: body.total });
        } else if (note) note.remove();
    } catch (err) {
        console.error('Ventas: failed to load records', err);
        Dashboard.showToast(t('main.venLoadError'), 'error');
    }
}

// La franja de arriba: los datos de estas pantallas son los de la última plantilla que se subió, así que dice cuándo fue, quién la cargó, de qué archivo y hasta qué día llegan los datos (la venta más reciente cargada).
function renderStamp() {
    let bar = document.getElementById('cm-stamp');
    if (!bar) {
        const content = document.querySelector('.page-content');
        if (!content) return;
        bar = document.createElement('div');
        bar.id = 'cm-stamp';
        bar.className = 'cm-stamp';
        bar.setAttribute('data-help-key', 'cmStamp');
        content.prepend(bar);
    }
    bar.textContent = '';
    if (!lastLoad) {
        const none = document.createElement('span');
        none.textContent = t('main.cmStampNone');
        bar.appendChild(none);
        return;
    }
    const part = (node) => { const span = document.createElement('span'); span.className = 'cm-stamp-part'; span.append(...(Array.isArray(node) ? node : [node])); bar.appendChild(span); return span; };
    const strong = (text) => { const b = document.createElement('b'); b.textContent = text; return b; };
    const when = document.createElement('span');
    Dashboard.renderTimeStamp(when, lastLoad.at);
    part([strong(`${t('main.cmStampLast')} `), when]);
    if (lastLoad.by) part([document.createTextNode(`${t('main.cmStampBy')} `), strong(lastLoad.by)]);
    if (lastLoad.file) part([document.createTextNode(`${t('main.cmStampFile')} `), strong(lastLoad.file)]);
    const until = lastLoad.dataUntil ? Dashboard.parseUtcStamp(lastLoad.dataUntil) : null;
    if (until) {
        const pill = part(document.createTextNode(t('main.cmStampUntil', { date: Dashboard.formatLocalStamp(until).split(' ')[0] })));
        pill.classList.add('cm-stamp-pill');
    }
}

function saveFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function downloadTemplate() {
    try {
        const res = await fetch(`${API}/template?lang=${lang()}`, { credentials: 'include' });
        if (!res.ok) throw new Error('template failed');
        saveFile(await res.blob(), `${lang() === 'en' ? 'Sales-template' : 'Plantilla-ventas'}.xlsx`);
    } catch (err) {
        console.error('Ventas: la plantilla no se pudo bajar', err);
        Dashboard.showToast(t('main.venTplError'), 'error');
    }
}

// ---- ventana «Ver ticket»: el ticket con su QR y el botón de imprimir ------------------------------------------------------------------------------
async function openTicket(sale) {
    let ticket;
    try {
        const res = await fetch(`${API}/${sale.id}/ticket`, { credentials: 'include' });
        if (!res.ok) throw new Error('ticket failed');
        ticket = (await res.json()).ticket;
    } catch (err) {
        console.error('Ventas: el ticket no se pudo abrir', err);
        Dashboard.showToast(t('main.venTicketError'), 'error');
        return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    overlay.innerHTML = `<div class="modal-panel exp-panel wp-modal tk-modal" role="dialog" aria-modal="true" aria-labelledby="ven-t-title" aria-label="${esc(t('main.venTicketTitle', { folio: ticket.folio }))}">
        <h3 id="ven-t-title">${esc(t('main.venTicketTitle', { folio: ticket.folio }))}</h3>
        <div class="tk-stage" data-help-key="venTicketQr">${PosTicket.html(ticket)}</div>
        <div class="admin-form-actions"><button type="button" class="btn" data-ven-t="print" data-help-key="venTicketPrint"><i class="bx bx-printer" aria-hidden="true"></i> ${esc(t('main.venTicketPrint'))}</button><button type="button" class="btn btn-secondary" data-ven-t="close">${esc(t('main.venTicketClose'))}</button></div></div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-ven-t]');
        if (!btn) return;
        if (btn.dataset.venT === 'close') close(); else PosTicket.print(ticket);
    });
    const printBtn = overlay.querySelector('[data-ven-t="print"]');
    if (printBtn) printBtn.focus();
}

// ---- ventana «Cargar ventas» ------------------------------------------------------------------------------------------------------------------------
// st.step: 'start' (bajar la plantilla, elegir el archivo o pegar celdas) → 'preview' (la revisión, sin guardar nada) → cargar. El mismo archivo (o las mismas celdas) se manda otra vez con mode=commit, y el servidor lo revisa de nuevo.
function messageText(m) {
    const params = { ...(m.params || {}) };
    if (params.field) params.field = t(`main.venField_${params.field}`);
    if (params.date) { const when = Dashboard.parseUtcStamp(params.date); if (when) params.date = Dashboard.formatLocalStamp(when); }
    if (m.code === 'CENTER_NOT_FOUND' && params.suggest) return t('main.venMsg_CENTER_NOT_FOUND_SUGGEST', params);
    return t(`main.venMsg_${m.code}`, params);
}
function errorTextOf(err) {
    const body = (err && err.body) || {};
    if (body.code === 'IMPORT_HEADERS') {
        const names = (body.missing || []).map((k) => t(`main.venCol_${k}`)).join(', ');
        return t('main.venErr_IMPORT_HEADERS', { missing: names });
    }
    return ['IMPORT_FILE', 'IMPORT_EMPTY', 'IMPORT_TOO_BIG', 'POS_FORBIDDEN', 'COST_CENTER_REQUIRED'].includes(body.code) ? t(`main.venErr_${body.code}`) : t('admin.saveError');
}
function openImportModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exp-overlay';
    document.body.appendChild(overlay);
    const st = { step: 'start', file: null, buffer: null, pasted: null, preview: null, busy: false, error: '', shown: TICKETS_SHOWN };
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (event) => { if (event.key === 'Escape' && !st.busy) close(); };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', (event) => { if (event.target === overlay && !st.busy) close(); });
    const errBox = () => `<p class="admin-error" id="ven-i-error" role="alert"${st.error ? '' : ' hidden'}>${esc(st.error)}</p>`;
    const startHtml = () => `<h3 id="ven-i-title">${esc(t('main.venImpTitle'))}</h3>
        <div class="wp-imp-step"><span class="wp-imp-n" aria-hidden="true">1</span><div><h4>${esc(t('main.venStep1'))}</h4><button type="button" class="btn btn-secondary" data-ven-i="template"${st.busy ? ' disabled' : ''}><i class="bx bx-download" aria-hidden="true"></i> ${esc(t('main.venTemplate'))}</button></div></div>
        <div class="wp-imp-step"><span class="wp-imp-n" aria-hidden="true">2</span><div><h4>${esc(t('main.venStep2'))}</h4>
            <label class="wp-imp-drop" id="ven-i-drop" for="ven-i-file" data-help-key="venDrop"><b>${esc(st.busy ? t('main.venReading') : t('main.venDrop'))}</b><span>${esc(t('main.venDropOr'))}</span></label>
            <input type="file" id="ven-i-file" class="wp-imp-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"${st.busy ? ' disabled' : ''}>
            <div class="vta-paste" data-help-key="venPaste"><label for="ven-i-paste">${esc(t('main.venPaste'))}</label><textarea id="ven-i-paste" rows="4" spellcheck="false" placeholder="${esc(t('main.venPastePlaceholder'))}"${st.busy ? ' disabled' : ''}></textarea>
            <button type="button" class="btn btn-secondary" data-ven-i="paste"${st.busy ? ' disabled' : ''}>${esc(t('main.venPasteCheck'))}</button></div></div></div>
        ${errBox()}<div class="admin-form-actions"><button type="button" class="btn btn-secondary" data-ven-i="cancel"${st.busy ? ' disabled' : ''}>${esc(t('main.venCancel'))}</button></div>`;
    const pill = (status) => {
        const cls = { ready: 'ok', skip: 'warn', error: 'error', blocked: 'error' }[status];
        return `<span class="wp-imp-pv wp-imp-pv-${cls}">${esc(t({ ready: 'main.venPillReady', skip: 'main.venPillSkip', error: 'main.venPillError', blocked: 'main.venPillBlocked' }[status]))}</span>`;
    };
    const previewHtml = () => {
        const pv = st.preview;
        const sum = pv.summary;
        const shownTickets = pv.tickets.slice(0, st.shown);
        const ticketHtml = (tk) => {
            const lines = tk.rows.length === 1 ? t('main.venLinesOne') : t('main.venLinesMany', { n: tk.rows.length });
            const head = `<tr class="vta-ticket-row vta-ticket-${tk.status}"><td colspan="8">${esc(t('main.venTicketLine', { folio: tk.folio, center: tk.centerCode || t('main.venTicketNoCenter'), lines, total: tk.status === 'error' ? '—' : `$${money(tk.total)}` }))}</td></tr>`;
            const rows = tk.rows.map((r) => `<tr class="wp-imp-row wp-imp-row-${r.status === 'blocked' ? 'error' : r.status === 'ready' ? 'ok' : r.status}"><td class="wp-imp-num">${r.line}</td><td>${esc(tk.folio)}</td><td>${esc(r.soldAt)}</td><td>${esc(r.center)}</td><td>${esc(r.concept)}</td><td class="wp-imp-num">${esc(r.quantity)}</td><td class="wp-imp-num">${esc(r.price)}</td><td>${pill(r.status)}${r.messages.length && r.status !== 'ready' ? ` <small class="vta-why">${esc(r.messages.map(messageText).join(' '))}</small>` : ''}</td></tr>`).join('');
            return head + rows;
        };
        const loadable = sum.ready;
        const hasProblems = sum.errors > 0;
        const sumText = [
            `<span class="wp-imp-pv wp-imp-pv-ok">${esc(t(sum.ready === 1 ? 'main.venSumReadyOne' : 'main.venSumReady', { n: sum.ready }))}</span>`,
            sum.skipped ? `<span class="wp-imp-pv wp-imp-pv-warn">${esc(t(sum.skipped === 1 ? 'main.venSumSkipOne' : 'main.venSumSkip', { n: sum.skipped }))}</span>` : '',
            sum.errors ? `<span class="wp-imp-pv wp-imp-pv-error">${esc(t(sum.errors === 1 ? 'main.venSumErrorOne' : 'main.venSumError', { n: sum.errors }))}</span>` : '',
        ].join('');
        return `<h3 id="ven-i-title">${esc(st.file ? st.file.name : t('main.venImpTitle'))}</h3><p class="admin-hint">${esc(t('main.venRowsRead', { rows: sum.rows, tickets: sum.tickets }))}</p>
            <div class="wp-imp-sum" data-help-key="venPreview">${sumText}</div>
            <div class="wp-imp-table-wrap"><table class="wp-imp-table"><thead><tr><th>${esc(t('main.venColRow'))}</th><th>${esc(t('main.venColFolio'))}</th><th>${esc(t('main.venColWhen'))}</th><th>${esc(t('main.venColCenter'))}</th><th>${esc(t('main.venColConcept'))}</th><th>${esc(t('main.venColQty'))}</th><th>${esc(t('main.venColPrice'))}</th><th>${esc(t('main.venColCheck'))}</th></tr></thead><tbody>${shownTickets.map(ticketHtml).join('')}</tbody></table></div>
            ${pv.tickets.length > shownTickets.length ? `<p class="admin-hint"><button type="button" class="btn btn-secondary" data-ven-i="more">${esc(t('main.venShowMore', { n: Math.min(TICKETS_SHOWN, pv.tickets.length - shownTickets.length) }))}</button></p>` : ''}
            ${errBox()}<div class="admin-form-actions"><button type="button" class="btn" data-ven-i="load"${loadable && !st.busy ? '' : ' disabled'}><i class="bx bx-upload" aria-hidden="true"></i> ${esc(t(loadable === 1 ? 'main.venLoadOne' : 'main.venLoad', { n: loadable }))}</button>
            ${hasProblems ? `<button type="button" class="btn btn-secondary" data-ven-i="errors"${st.busy ? ' disabled' : ''}><i class="bx bx-download" aria-hidden="true"></i> ${esc(t('main.venErrorsDownload'))}</button>` : ''}
            <button type="button" class="btn btn-secondary" data-ven-i="again"${st.busy ? ' disabled' : ''}>${esc(t('main.venChooseAnother'))}</button><button type="button" class="btn btn-secondary" data-ven-i="cancel"${st.busy ? ' disabled' : ''}>${esc(t('main.venCancel'))}</button></div>`;
    };
    const paint = () => {
        overlay.innerHTML = `<div class="modal-panel exp-panel wp-modal wp-imp${st.step === 'preview' ? ' wp-imp-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="ven-i-title" aria-label="${esc(t('main.venImpTitle'))}" data-help-key="venImport">${st.step === 'preview' ? previewHtml() : startHtml()}</div>`;
    };
    const showError = (text) => { st.error = text; const el = overlay.querySelector('#ven-i-error'); if (el) { el.textContent = text; el.hidden = !text; } };
    const setBusy = (busy) => { st.busy = busy; paint(); if (st.error) showError(st.error); };
    const send = async (mode) => {
        const name = encodeURIComponent(st.file ? st.file.name : '');
        const url = `${API}/import?mode=${mode}&file=${name}`;
        const init = st.pasted
            ? { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: st.pasted }) }
            : { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body: st.buffer };
        const res = await fetch(url, init);
        const out = await res.json().catch(() => ({}));
        if (!res.ok) { const err = new Error(out.message || 'failed'); err.body = out; err.status = res.status; throw err; }
        return out;
    };
    const check = async () => {
        setBusy(true);
        st.error = '';
        try {
            st.preview = await send('preview');
            st.step = 'preview';
            st.shown = TICKETS_SHOWN;
            st.busy = false;
            paint();
        } catch (err) {
            st.error = errorTextOf(err);
            st.busy = false;
            st.file = st.pasted ? null : st.file;
            paint();
        }
    };
    const chooseFile = async (file) => {
        if (!file) return;
        st.error = '';
        if (file.size > 5 * 1024 * 1024) { st.error = t('main.venErr_IMPORT_TOO_BIG'); paint(); return; }
        st.file = file;
        st.pasted = null;
        st.busy = true;
        paint();
        try { st.buffer = await file.arrayBuffer(); } catch { st.busy = false; st.error = t('main.venErr_IMPORT_FILE'); paint(); return; }
        await check();
    };
    const checkPasted = async () => {
        const text = (overlay.querySelector('#ven-i-paste')?.value || '').replace(/\r/g, '');
        const rows = text.split('\n').filter((line) => line.trim() !== '').map((line) => line.split('\t'));
        if (!rows.length) { showError(t('main.venErr_IMPORT_EMPTY')); return; }
        st.file = null; st.buffer = null; st.pasted = rows;
        await check();
    };
    const downloadErrors = async () => {
        const L = lang();
        const heads = ['folio', 'soldAt', 'center', 'servedBy', 'place', 'concept', 'quantity', 'price', 'taxRate', 'payment', 'received'].map((k) => ({ key: k, label: L === 'en' ? ({ folio: 'Receipt no.', soldAt: 'Date and time', center: 'Cost center', servedBy: 'Served by', place: 'Table or register', concept: 'Item', quantity: 'Quantity', price: 'Unit price', taxRate: 'VAT %', payment: 'Payment method', received: 'Received' }[k]) : ({ folio: 'Folio', soldAt: 'Fecha y hora', center: 'Centro de costos', servedBy: 'Atendió', place: 'Mesa o caja', concept: 'Concepto', quantity: 'Cantidad', price: 'Precio unitario', taxRate: 'IVA %', payment: 'Forma de pago', received: 'Recibido' }[k]) }));
        const rows = [];
        st.preview.tickets.filter((tk) => tk.status === 'error').forEach((tk) => tk.rows.forEach((r) => rows.push([...heads.map((h) => (r.raw && r.raw[h.key]) || ''), r.messages.map(messageText).join(' ')])));
        try {
            const d = new Date();
            const filename = `${t('main.venErrorsFile')}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const res = await fetch('/api/business/export/xlsx', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t('main.venErrorsFile'), filename, columns: [...heads.map((h) => ({ label: h.label })), { label: t('main.venErrCol') }], rows }) });
            if (!res.ok) throw new Error('export failed');
            saveFile(await res.blob(), `${filename}.xlsx`);
        } catch (err) { console.error('Ventas: las filas con problema no se pudieron bajar', err); showError(t('main.venTplError')); }
    };
    const load = async () => {
        setBusy(true);
        st.error = '';
        try {
            const out = await send('commit');
            await refreshTable();
            close();
            Dashboard.showToast(out.created ? t(out.created === 1 ? 'main.venDoneOne' : 'main.venDone', { n: out.created }) : t('main.venDoneNone'), out.created ? 'success' : 'info');
        } catch (err) {
            st.error = errorTextOf(err);
            st.busy = false;
            paint();
        }
    };
    overlay.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-ven-i]');
        if (!btn || st.busy) return;
        const op = btn.dataset.venI;
        if (op === 'cancel') close();
        else if (op === 'template') downloadTemplate();
        else if (op === 'paste') checkPasted();
        else if (op === 'again') { st.step = 'start'; st.preview = null; st.file = null; st.buffer = null; st.pasted = null; st.error = ''; paint(); }
        else if (op === 'more') { st.shown += TICKETS_SHOWN; paint(); }
        else if (op === 'errors') downloadErrors();
        else if (op === 'load') load();
    });
    overlay.addEventListener('change', (event) => { if (event.target.id === 'ven-i-file') chooseFile(event.target.files && event.target.files[0]); });
    overlay.addEventListener('dragover', (event) => { const zone = event.target.closest && event.target.closest('#ven-i-drop'); if (zone) { event.preventDefault(); zone.classList.add('wp-imp-drop-over'); } });
    overlay.addEventListener('dragleave', (event) => { const zone = event.target.closest && event.target.closest('#ven-i-drop'); if (zone) zone.classList.remove('wp-imp-drop-over'); });
    overlay.addEventListener('drop', (event) => {
        const zone = event.target.closest && event.target.closest('#ven-i-drop');
        if (!zone) return;
        event.preventDefault();
        zone.classList.remove('wp-imp-drop-over');
        chooseFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
    });
    paint();
}

document.getElementById('filter-bar')?.addEventListener('data-table:filter-apply', redraw);
document.getElementById('filter-bar')?.addEventListener('data-table:filter-clear', redraw);
document.addEventListener('dashboard:language-changed', () => {
    if (!loaded) return;
    renderStamp();
    redraw();
});
})();
