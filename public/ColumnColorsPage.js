// ---------------------------------------------------------------------------
// Pantalla de colores de columna, compartida por "Colores de Columnas" (cliente: Administrador, Perfil, Persona)
// y "Colores por Nivel" (SaaS: Giro, Plan, Cliente). Mismo árbol de siempre (Departamento > Área > Apartado >
// Pantalla > Columna), con el selector de color del Árbol Maestro.
//
// El color solo baja: Maestro > Giro > Plan > Cliente > Administrador > Perfil > Usuario. Lo que se cambia aquí solo
// le llega a lo que está debajo; cada columna dice si su color es Propio de lo que estás editando, Pendiente de
// autorizar, o Hereda de un nivel de arriba. Quien tiene "Personalizar colores" pero no "Autorizar colores" deja una
// solicitud que sube por sus jefes hasta quien pueda autorizarla.
//
// window.ColumnColorsPage.start({ activePage, api: { catalog, state }, requestsApi, filterScreen(screen),
// openHistory(), requiredRole }) -- el HTML de cada pantalla trae los mismos ids "col-colors-*".
// ---------------------------------------------------------------------------

window.ColumnColorsPage = { start(config) {
const treeEl = document.getElementById('col-colors-tree');
const emptyEl = document.getElementById('col-colors-empty');
const errorEl = document.getElementById('col-colors-error');
const levelSelect = document.getElementById('col-colors-level');
const entitySelect = document.getElementById('col-colors-entity');
const requestsBtn = document.getElementById('col-colors-requests-btn');
const requestsBadge = document.getElementById('col-colors-requests-badge');
const requestsModal = document.getElementById('col-colors-requests-modal');
const requestsListEl = document.getElementById('col-colors-requests-list');
const historyBtn = document.getElementById('col-colors-history-btn');

const t = (key, params) => Dashboard.t(key, params);

// Mismo orden que menu.json: General primero, luego los departamentos.
const SECTION_ORDER = ['main', 'steering-committee', 'general-management', 'management-control', 'supply-chain', 'purchasing',
    'commercial', 'marketing', 'human-resources', 'accounting', 'finance', 'certifications'];
// 8 familias (claro a oscuro), las mismas del selector del Árbol Maestro.
const COLOR_FAMILIES = [
    ['#EEEDFE', '#CECBF6', '#AFA9EC', '#7F77DD', '#534AB7', '#3C3489'],
    ['#E1F5EE', '#9FE1CB', '#5DCAA5', '#1D9E75', '#0F6E56', '#085041'],
    ['#FAECE7', '#F5C4B3', '#F0997B', '#D85A30', '#993C1D', '#712B13'],
    ['#FBEAF0', '#F4C0D1', '#ED93B1', '#D4537E', '#993556', '#72243E'],
    ['#E6F1FB', '#B5D4F4', '#85B7EB', '#378ADD', '#185FA5', '#0C447C'],
    ['#EAF3DE', '#C0DD97', '#97C459', '#639922', '#3B6D11', '#27500A'],
    ['#FAEEDA', '#FAC775', '#EF9F27', '#BA7517', '#854F0B', '#633806'],
    ['#F1EFE8', '#D3D1C7', '#B4B2A9', '#888780', '#5F5E5A', '#444441'],
];

let screens = [];
let state = { canPersonalize: false, canAuthorize: false, isAdmin: false, levels: [], target: null, colors: {} };
const expanded = new Set();
const recent = { dot: [], text: [] };
let closePicker = null;

function toast(message, type) { Dashboard.showToast(message, type); }

async function request(url, options = {}) {
    const res = await fetch(url, { credentials: 'include', ...options });
    let body = {};
    try { body = await res.json(); } catch { /* sin cuerpo */ }
    return { res, body };
}

// ------------------------------------------------------------------ carga
async function loadCatalog() {
    const { res, body } = await request(config.api.catalog);
    if (!res.ok) throw new Error('catalog failed');
    // Solo las pantallas que esta pantalla deja personalizar (el cliente, las que su cuenta puede ver).
    screens = (body.screens || []).filter((s) => !config.filterScreen || config.filterScreen(s));
}
async function loadState(level, entityId) {
    const params = new URLSearchParams();
    if (level) params.set('level', level);
    if (entityId) params.set('entityId', String(entityId));
    const { res, body } = await request(`${config.api.state}${params.toString() ? `?${params}` : ''}`);
    if (!res.ok) throw new Error('state failed');
    state = body;
}

// ------------------------------------------------------------------ a quién se le cambia el color
function availableLevels() {
    return state.levels.map((l) => l.level);
}
function entitiesFor(level) {
    const found = state.levels.find((l) => l.level === level);
    return found ? found.entities : [];
}
function renderTargetSelectors() {
    const levels = availableLevels();
    levelSelect.innerHTML = '';
    levels.forEach((level) => {
        const option = document.createElement('option');
        option.value = level;
        option.textContent = t(`business.columnColorsLevel_${level}`);
        levelSelect.appendChild(option);
    });
    const target = state.target;
    levelSelect.value = target ? target.level : '';
    levelSelect.disabled = levels.length <= 1;
    entitySelect.innerHTML = '';
    const list = target ? entitiesFor(target.level) : [];
    list.forEach((entity) => {
        const option = document.createElement('option');
        option.value = String(entity.entityId);
        option.textContent = entity.name;
        entitySelect.appendChild(option);
    });
    entitySelect.hidden = !target || target.level === 'admin';
    entitySelect.disabled = list.length <= 1;
    if (target && target.level !== 'admin') entitySelect.value = String(target.entityId);
}
async function switchTarget(level, entityId) {
    try {
        await loadState(level, entityId);
        renderTargetSelectors();
        render();
    } catch {
        toast(t('admin.loadError'), 'error');
    }
}
levelSelect.addEventListener('change', () => {
    const level = levelSelect.value;
    const first = entitiesFor(level)[0];
    switchTarget(level, first ? first.entityId : null);
});
entitySelect.addEventListener('change', () => switchTarget(levelSelect.value, Number(entitySelect.value)));

// ------------------------------------------------------------------ estado de color de cada celda
// Pendiente (espera autorización) > Propio (lo eligió esto que se edita) > Hereda de un nivel de arriba > Del producto.
function describeEntry(entry) {
    if (!entry) return { kind: 'none' };
    if (entry.pendingBg !== undefined || entry.pendingText !== undefined) return { kind: 'pending' };
    if (entry.bgFrom === 'own' || entry.textFrom === 'own') return { kind: 'own' };
    const from = entry.bgFrom || entry.textFrom;
    if (!from) return { kind: 'none' };
    return from === 'master' ? { kind: 'master' } : { kind: 'inherited', level: from };
}
function stateLabel(info) {
    switch (info.kind) {
        case 'pending': return t('business.columnColorsStatePending');
        case 'own': return t('business.columnColorsStateOwn');
        case 'master': return t('business.columnColorsStateMaster');
        case 'inherited': return t('business.columnColorsStateInherited', { level: t(`business.columnColorsLevel_${info.level}`) });
        default: return t('business.columnColorsNoColor');
    }
}

// ------------------------------------------------------------------ árbol
function buildTrie() {
    const root = { children: new Map(), screens: [] };
    screens.forEach((screen) => {
        let node = root;
        let key = '';
        screen.crumbs.forEach((crumb) => {
            key = `${key}/${crumb.id}`;
            if (!node.children.has(crumb.id)) node.children.set(crumb.id, { key, id: crumb.id, labelKey: crumb.labelKey, children: new Map(), screens: [] });
            node = node.children.get(crumb.id);
        });
        node.screens.push(screen);
    });
    return root;
}
function toggleButton(key, isOpen) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'perm-tree-toggle';
    btn.setAttribute('aria-expanded', String(isOpen));
    btn.setAttribute('data-help-key', 'columnColorsToggle');
    btn.innerHTML = '<i class="bx bx-chevron-down" aria-hidden="true"></i>';
    return btn;
}
function groupRow(key, label, depth, extraClass) {
    const row = document.createElement('div');
    row.className = `col-colors-row ${extraClass}`;
    row.style.paddingLeft = `${0.4 + depth * 1.2}rem`;
    const isOpen = expanded.has(key);
    row.appendChild(toggleButton(key, isOpen));
    const text = document.createElement('span');
    text.className = 'col-colors-label';
    text.textContent = label;
    row.appendChild(text);
    // Toda la fila abre y cierra el grupo, no solo la flecha.
    row.classList.add('col-colors-clickable');
    row.addEventListener('click', () => {
        if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
        render();
    });
    return { row, isOpen };
}
function renderNode(node, depth, parent) {
    const { row, isOpen } = groupRow(node.key, t(node.labelKey), depth, depth === 0 ? 'col-colors-dept' : 'col-colors-group');
    parent.appendChild(row);
    if (!isOpen) return;
    [...node.children.values()].forEach((child) => renderNode(child, depth + 1, parent));
    node.screens.forEach((screen) => renderScreen(screen, depth + 1, parent));
}
function renderScreen(screen, depth, parent) {
    const key = `screen:${screen.tableKey}`;
    const { row, isOpen } = groupRow(key, t(screen.screenLabelKey), depth, 'col-colors-screen');
    parent.appendChild(row);
    if (!isOpen) return;
    screen.columns.forEach((column) => parent.appendChild(columnRow(column, depth + 1)));
}
function sampleChip(entry) {
    const chip = document.createElement('span');
    chip.className = 'col-colors-chip';
    chip.textContent = t('business.columnColorsSample');
    const bg = entry && (entry.pendingBg !== undefined && entry.pendingBg ? entry.pendingBg : entry.bg);
    const text = entry && (entry.pendingText !== undefined && entry.pendingText ? entry.pendingText : entry.text);
    if (bg) chip.style.backgroundColor = bg;
    if (text) chip.style.color = text;
    return chip;
}
function cell(column, part) {
    const colorId = `col-${part}:${column.nodeKey}`;
    const entry = state.colors[colorId];
    const info = describeEntry(entry);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `col-colors-cell col-colors-cell-${info.kind}`;
    btn.dataset.colorId = colorId;
    btn.setAttribute('data-help-key', 'columnColorsCell');
    btn.disabled = !state.canPersonalize;
    const partLabel = document.createElement('span');
    partLabel.className = 'col-colors-part';
    partLabel.textContent = t(part === 'own' ? 'admin.masterTreeColumnColorOwnGroup' : 'admin.masterTreeColumnColorNestedGroup');
    const pill = document.createElement('span');
    pill.className = `col-colors-state col-colors-state-${info.kind}`;
    pill.setAttribute('data-help-key', 'columnColorsState');
    pill.textContent = stateLabel(info);
    pill.title = pill.textContent;
    btn.append(partLabel, sampleChip(entry), pill);
    btn.addEventListener('click', () => openPicker(btn, colorId, 'dot'));
    return btn;
}
function columnRow(column, depth) {
    const row = document.createElement('div');
    row.className = 'col-colors-row col-colors-column';
    row.style.paddingLeft = `${0.4 + depth * 1.2}rem`;
    const spacer = document.createElement('span');
    spacer.className = 'perm-tree-toggle-spacer';
    const label = document.createElement('span');
    label.className = 'col-colors-label';
    label.textContent = t(column.labelKey);
    row.append(spacer, label);
    if (column.classLabelKey) {
        const tag = document.createElement('span');
        tag.className = 'col-colors-class-tag';
        tag.textContent = t(column.classLabelKey);
        row.appendChild(tag);
    }
    const cells = document.createElement('div');
    cells.className = 'col-colors-cells';
    cells.append(cell(column, 'own'), cell(column, 'nested'));
    row.appendChild(cells);
    return row;
}
function render() {
    treeEl.innerHTML = '';
    emptyEl.hidden = !!(state.target && screens.length);
    if (!state.target || !screens.length) return;
    const root = buildTrie();
    [...root.children.values()]
        .sort((a, b) => SECTION_ORDER.indexOf(a.id) - SECTION_ORDER.indexOf(b.id))
        .forEach((node) => renderNode(node, 0, treeEl));
}

// ------------------------------------------------------------------ selector de color
function brightness(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    if (Number.isNaN(n)) return 128;
    return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
}
function closeColorPanel() {
    if (closePicker) { closePicker(); closePicker = null; }
}
function currentValue(entry, kind) {
    return entry ? (kind === 'text' ? entry.text : entry.bg) || '' : '';
}
function ownsValue(entry, kind) {
    return !!entry && (kind === 'text' ? entry.textFrom === 'own' : entry.bgFrom === 'own');
}
function openPicker(anchor, colorId, kind) {
    closeColorPanel();
    const panel = document.createElement('div');
    panel.className = 'perm-tree-color-popover';
    const entry = state.colors[colorId];
    const current = currentValue(entry, kind);

    const kindRow = document.createElement('div');
    kindRow.className = 'perm-tree-color-kind-row';
    [['dot', currentValue(entry, 'dot') || '#9A9EB2', '<i class="bx bx-palette" aria-hidden="true"></i>', 'admin.masterTreeColumnColorFill'],
        ['text', currentValue(entry, 'text') || '#3F435D', 'A', 'admin.masterTreeColumnColorText']].forEach(([value, hex, glyph, labelKey]) => {
        const col = document.createElement('div');
        col.className = 'perm-tree-color-kind-col';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `perm-tree-color-kind-btn${kind === value ? ' perm-tree-color-kind-btn-active' : ''}`;
        btn.setAttribute('data-help-key', 'columnColorsKind');
        btn.style.borderColor = `color-mix(in srgb, ${hex} 35%, var(--color-text-secondary))`;
        if (value === 'dot') {
            btn.style.backgroundColor = hex;
            btn.style.color = brightness(hex) > 140 ? '#3a3f52' : '#ffffff';
        } else {
            btn.style.color = hex;
            btn.style.backgroundColor = brightness(hex) > 170 ? '#3a3f52' : '#f3f4f8';
        }
        btn.innerHTML = glyph;
        btn.addEventListener('click', (event) => { event.stopPropagation(); openPicker(anchorFor(colorId) || anchor, colorId, value); });
        const cap = document.createElement('span');
        cap.className = 'perm-tree-color-kind-cap';
        cap.textContent = t(labelKey);
        col.append(btn, cap);
        kindRow.appendChild(col);
    });
    panel.appendChild(kindRow);

    const section = (labelKey) => {
        const label = document.createElement('div');
        label.className = 'perm-tree-color-section-label';
        label.textContent = t(labelKey);
        panel.appendChild(label);
    };
    const swatch = (container, hex, small) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = small ? 'perm-tree-color-swatch perm-tree-color-swatch-sm' : 'perm-tree-color-swatch';
        btn.style.backgroundColor = hex;
        btn.setAttribute('aria-label', hex);
        btn.setAttribute('data-help-key', 'columnColorsSwatch');
        if (current && current.toLowerCase() === hex.toLowerCase()) {
            btn.classList.add('perm-tree-color-swatch-selected');
            btn.innerHTML = '<i class="bx bx-check" aria-hidden="true"></i>';
        }
        btn.addEventListener('click', (event) => { event.stopPropagation(); applyColor(colorId, kind, hex); });
        container.appendChild(btn);
    };
    section('admin.masterTreeColorThemeColors');
    const grid = document.createElement('div');
    grid.className = 'perm-tree-color-theme-grid';
    for (let row = 0; row < 6; row += 1) COLOR_FAMILIES.forEach((family) => swatch(grid, family[row], true));
    panel.appendChild(grid);
    section('admin.masterTreeColorStandard');
    const standard = document.createElement('div');
    standard.className = 'perm-tree-color-standard-row';
    COLOR_FAMILIES.forEach((family) => swatch(standard, family[3], false));
    panel.appendChild(standard);
    const recentList = recent[kind];
    if (recentList.length) {
        section('admin.masterTreeColorRecent');
        const recentRow = document.createElement('div');
        recentRow.className = 'perm-tree-color-standard-row';
        recentList.forEach((hex) => swatch(recentRow, hex, false));
        panel.appendChild(recentRow);
    }

    const footer = document.createElement('div');
    footer.className = 'perm-tree-color-footer';
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.hidden = true;
    picker.value = /^#[0-9a-f]{6}$/i.test(current) ? current : '#3a4bc9';
    picker.addEventListener('change', () => applyColor(colorId, kind, picker.value));
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'perm-tree-color-more-btn';
    more.setAttribute('data-help-key', 'columnColorsMore');
    more.textContent = t('admin.masterTreeMoreColors');
    more.addEventListener('click', (event) => { event.stopPropagation(); picker.click(); });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'perm-tree-color-reset-btn';
    reset.innerHTML = '<i class="bx bx-reset" aria-hidden="true"></i>';
    reset.appendChild(document.createTextNode(t('admin.masterTreeColorReset')));
    reset.title = t('admin.masterTreeColorResetHint');
    reset.setAttribute('aria-label', reset.title);
    reset.setAttribute('data-help-key', 'masterTreeColorReset');
    reset.disabled = !ownsValue(entry, kind);
    reset.addEventListener('click', (event) => { event.stopPropagation(); resetColor(colorId, kind); });
    footer.append(more, reset, picker);
    panel.appendChild(footer);

    document.body.appendChild(panel);
    function place() {
        const r = anchor.getBoundingClientRect();
        const w = panel.offsetWidth;
        const h = panel.offsetHeight;
        const margin = 8;
        const below = window.innerHeight - r.bottom - margin;
        const above = r.top - margin;
        const top = (below >= h || below >= above) ? r.bottom + 4 : r.top - h - 4;
        panel.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - h - margin))}px`;
        panel.style.left = `${Math.max(margin, Math.min(r.right - w, window.innerWidth - w - margin))}px`;
    }
    place();
    const onDocClick = (event) => { if (!panel.contains(event.target) && !anchor.contains(event.target)) closeColorPanel(); };
    const onKey = (event) => { if (event.key === 'Escape') closeColorPanel(); };
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
    closePicker = () => {
        panel.remove();
        window.removeEventListener('resize', place);
        document.removeEventListener('scroll', place, true);
        document.removeEventListener('click', onDocClick, true);
        document.removeEventListener('keydown', onKey);
    };
}
function anchorFor(colorId) {
    return treeEl.querySelector(`[data-color-id="${CSS.escape(colorId)}"]`);
}

// ------------------------------------------------------------------ guardar
function afterChange(colorId, kind, data, status) {
    if (data.colors) state.colors = data.colors;
    if (status === 202) {
        toast(t('admin.colorRequestSent', { name: (data.assignedTo && data.assignedTo.name) || '' }), 'info');
        loadRequests();
    }
    render();
    const fresh = anchorFor(colorId);
    if (fresh) openPicker(fresh, colorId, kind); else closeColorPanel();
}
async function applyColor(colorId, kind, hex) {
    const body = { level: state.target.level, entityId: state.target.entityId, colorId, kind, value: hex };
    const { res, body: data } = await request(config.api.state, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) { toast(data.message || t('admin.saveError'), 'error'); return; }
    const list = recent[kind];
    const existing = list.indexOf(hex);
    if (existing !== -1) list.splice(existing, 1);
    list.unshift(hex);
    if (list.length > 8) list.length = 8;
    afterChange(colorId, kind, data, res.status);
}
async function resetColor(colorId, kind) {
    const params = new URLSearchParams({ level: state.target.level, entityId: String(state.target.entityId), colorId, kind });
    const { res, body: data } = await request(`${config.api.state}?${params}`, { method: 'DELETE' });
    if (!res.ok) { toast(data.message || t('admin.saveError'), 'error'); return; }
    afterChange(colorId, kind, data, res.status);
}

// ------------------------------------------------------------------ solicitudes de color
let requests = [];
async function loadRequests() {
    try {
        const { res, body } = await request(config.requestsApi);
        if (!res.ok) throw new Error('load failed');
        requests = body.requests || [];
        const waiting = body.canAuthorize ? (body.toDecide || 0) : requests.filter((r) => r.status === 'pending').length;
        requestsBadge.textContent = String(waiting);
        requestsBadge.hidden = waiting === 0;
        requestsBtn.hidden = !(body.canPersonalize || body.canAuthorize || requests.length);
        if (!requestsModal.hidden) renderRequests();
    } catch {
        requestsBtn.hidden = true;
    }
}
function requestChange(item) {
    const wrap = document.createElement('span');
    if (item.action === 'set' || item.action === 'set-text') {
        const sw = document.createElement('span');
        sw.className = 'color-request-swatch';
        sw.style.backgroundColor = item.value;
        wrap.appendChild(sw);
        wrap.append(t(item.action === 'set' ? 'admin.colorRequestChangeFill' : 'admin.colorRequestChangeText', { hex: item.value }));
    } else {
        wrap.append(t(item.action === 'clear-dot' ? 'admin.colorRequestChangeClearFill' : 'admin.colorRequestChangeClearText'));
    }
    return wrap;
}
async function decideRequest(item, approve) {
    try {
        const { res } = await request(`${config.requestsApi}/${item.id}/${approve ? 'approve' : 'reject'}`, { method: 'POST' });
        if (!res.ok) throw new Error('decide failed');
        toast(t(approve ? 'admin.colorRequestApproved' : 'admin.colorRequestRejectedMsg'), 'success');
        // Lo autorizado ya quedó guardado: se vuelve a leer lo que se ve para quien se está editando.
        if (approve && state.target) await loadState(state.target.level, state.target.entityId).then(render).catch(() => {});
    } catch {
        toast(t('admin.colorRequestError'), 'error');
    }
    await loadRequests();
}
function renderRequests() {
    requestsListEl.innerHTML = '';
    if (!requests.length) {
        const empty = document.createElement('p');
        empty.className = 'admin-hint';
        empty.textContent = t('admin.colorRequestsEmpty');
        requestsListEl.appendChild(empty);
        return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'admin-table-wrap';
    const table = document.createElement('table');
    table.className = 'admin-table';
    const head = document.createElement('tr');
    [t('admin.colorRequestColStatus'), t('admin.colorRequestColColumn'), t('business.columnColorsReqColTarget'), t('admin.colorRequestColChange'),
        t('admin.colorRequestColBy'), t('admin.colorRequestColTo'), t('admin.colorRequestColDate'), t('admin.colorRequestColActions')].forEach((text) => {
        const th = document.createElement('th');
        th.textContent = text;
        head.appendChild(th);
    });
    const thead = document.createElement('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    requests.forEach((item) => {
        const tr = document.createElement('tr');
        const addCell = (content) => {
            const td = document.createElement('td');
            if (content instanceof Node) td.appendChild(content); else td.textContent = content;
            tr.appendChild(td);
        };
        const status = document.createElement('span');
        status.className = `color-request-status color-request-status-${item.status}`;
        status.textContent = t(`admin.colorRequestStatus_${item.status}`);
        addCell(status);
        const columnName = item.columnLabelKey ? t(item.columnLabelKey) : item.colorId;
        const screenName = item.screenLabelKey ? `${t(item.screenLabelKey)} › ` : '';
        const part = item.part ? ` · ${t(item.part === 'own' ? 'admin.colorRequestPartOwn' : 'admin.colorRequestPartNested')}` : '';
        addCell(`${screenName}${columnName}${part}`);
        addCell(item.target && item.target.level
            ? t('business.columnColorsTargetLine', { level: t(`business.columnColorsLevel_${item.target.level}`), name: item.target.name })
            : '');
        addCell(requestChange(item));
        addCell(item.requestedByName || '');
        addCell(item.assignedToName || '');
        addCell(item.createdAt ? new Date(item.createdAt.replace(' ', 'T') + 'Z').toLocaleString() : '');
        const actions = document.createElement('div');
        actions.className = 'color-request-actions';
        if (item.canDecide) {
            [[true, 'admin.colorRequestApprove', 'masterTreeColorApprove'], [false, 'admin.colorRequestReject', 'masterTreeColorReject']].forEach(([approve, labelKey, helpKey]) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = approve ? 'btn' : 'btn btn-secondary';
                btn.textContent = t(labelKey);
                btn.setAttribute('data-help-key', helpKey);
                btn.addEventListener('click', () => decideRequest(item, approve));
                actions.appendChild(btn);
            });
        }
        addCell(actions);
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    requestsListEl.appendChild(wrap);
}
requestsBtn.addEventListener('click', async () => {
    await loadRequests();
    renderRequests();
    requestsModal.hidden = false;
});
function closeRequests() { requestsModal.hidden = true; }
document.getElementById('col-colors-requests-close').addEventListener('click', closeRequests);
requestsModal.addEventListener('click', (event) => { if (event.target === requestsModal) closeRequests(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !requestsModal.hidden) closeRequests(); });
historyBtn.addEventListener('click', () => config.openHistory());
document.addEventListener('dashboard:language-changed', () => {
    closeColorPanel();
    renderTargetSelectors();
    render();
    if (!requestsModal.hidden) renderRequests();
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: config.activePage });
        if (!role) return;
        if (config.requiredRole && role !== config.requiredRole) {
            window.location.replace('Inicio-en.html');
            return;
        }
        errorEl.hidden = true;
        await Promise.all([loadCatalog(), loadState()]);
        renderTargetSelectors();
        render();
        loadRequests();
    } catch (err) {
        console.error('Column colors page failed to initialize:', err);
        errorEl.textContent = t('admin.loadError');
        errorEl.hidden = false;
    }
})();
} };
