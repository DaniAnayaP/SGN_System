// ---------------------------------------------------------------------------
// Modelos de activos — Catálogos > Cadena de Suministro > C. Distribución > Activos Fijos.
// Cada TIPO de activo (Rack, Sensor, Teléfono…) trae su lista de MODELOS: el nombre de compra, el nombre personalizado, el modelo, la forma, las medidas y el peso que antes se escribían activo por activo en
// Alta Activos. En Alta Activos solo se elige el modelo del tipo y se escribe el número de serie.
//   - Se abren debajo de la tabla de Tipos (botón «Ver modelos» del renglón), con los renglones del tipo elegido. Un modelo es un registro del catálogo (article_categories, tipo 'activos-modelos'; el servidor
//     lo liga a su tipo con parent_id) y se guarda con las mismas rutas de los demás catálogos.
//   - Un modelo está COMPLETO con nombre de compra, modelo, forma, medidas y peso; uno incompleto o inactivo no se ofrece en Alta Activos.
//   - Con activos usándolo, su forma, sus medidas y su peso se cierran (el croquis ya dibujó con ellas); los nombres sí se pueden cambiar y se actualizan en todos sus activos.
//   - Un modelo nunca se elimina: se deja Inactivo.
// Lo carga CatCentroDistCategoriaArticulo.js (la tabla de Tipos): AssetModels.load() antes de dibujar los renglones, AssetModels.countFor() para el botón y AssetModels.render() al terminar.
// ---------------------------------------------------------------------------
const AssetModels = (() => {
    const API = '/api/business/article-categories/activos-modelos';
    const TABLE = 'activos-modelos';
    const SHAPES = ['rectangular', 'cilindrica', 'irregular'];
    let models = [];
    let types = [];
    let selectedId = null;
    let draft = null; // un renglón nuevo que todavía no existe en el servidor: nace con el primer dato que se escribe
    let panel = null;

    const t = (key) => Dashboard.t(key);
    const fillText = (key, params) => Object.entries(params || {}).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), t(key));
    const isPending = (record, key) => (record.pendingFields || []).includes(key);

    async function load() {
        try {
            const res = await fetch(API, { credentials: 'include' });
            if (!res.ok) throw new Error('load failed');
            const body = await res.json();
            models = (body.categories || []).slice().sort((a, z) => a.id - z.id);
        } catch (err) {
            console.error('Modelos de activos: failed to load', err);
            models = [];
        }
    }
    const countFor = (typeId) => models.filter((m) => m.parentId === typeId && m.name).length;
    const isOpen = (typeId) => selectedId === typeId;

    function open(typeRecord) {
        if (!typeRecord || !typeRecord.id) return;
        selectedId = selectedId === typeRecord.id ? null : typeRecord.id; // el mismo botón abre y cierra
        draft = null;
        if (typeof refreshTable === 'function') refreshTable(); // el botón y el renglón del tipo se vuelven a dibujar
        else render();
        if (selectedId && panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function close() {
        selectedId = null;
        draft = null;
        if (typeof refreshTable === 'function') refreshTable(); else render();
    }
    async function reload() {
        await load();
        if (typeof refreshTable === 'function') await refreshTable(); else render();
    }

    // --- celdas ------------------------------------------------------------------------------------------------------------------------------------------------
    function textCell(colId, text, helpKey) {
        const td = document.createElement('td');
        td.dataset.col = colId;
        td.textContent = text === 0 || text ? String(text) : '—';
        if (helpKey) td.setAttribute('data-help-key', helpKey);
        return td;
    }
    function inlineCell(model, colId, key, { inputType = 'text', unit = '', helpKey, toValue, formatDisplay } = {}) {
        const td = document.createElement('td');
        td.dataset.col = colId;
        if (helpKey) td.setAttribute('data-help-key', helpKey);
        Dashboard.attachInlineEdit(td, {
            value: model[key] === 0 || model[key] ? String(model[key]) : '',
            inputType, unit, formatDisplay, step: inputType === 'number' ? '0.01' : undefined,
            tableKey: TABLE, colKey: colId, pending: isPending(model, key),
            onCommit: (val) => commit(model, { [key]: toValue ? toValue(val) : val.trim() }),
        });
        return td;
    }
    // Una celda que solo se lee: lo que se calcula (volumen, profundidad de una cilíndrica) o lo que se cerró porque ya hay activos con el modelo.
    function readonlyCell(colId, value, unit, title, helpKey) {
        const td = textCell(colId, '', helpKey);
        const has = Number(value) > 0;
        if (has) {
            td.textContent = '';
            const span = document.createElement('span');
            span.className = 'editable-cell-value';
            if (unit) span.dataset.unit = unit;
            span.textContent = String(value);
            td.appendChild(span);
        } else td.textContent = '—';
        td.classList.add('editable-cell-disabled');
        td.title = title;
        return td;
    }
    function shapeCell(model, closedTitle) {
        const td = document.createElement('td');
        td.dataset.col = 'colActModForma';
        td.setAttribute('data-help-key', 'assetModelShape');
        const select = document.createElement('select');
        select.className = 'editable-cell-select asset-select';
        SHAPES.forEach((shape) => {
            const opt = document.createElement('option');
            opt.value = shape;
            opt.textContent = t(`main.assetShape_${shape}`);
            select.appendChild(opt);
        });
        select.value = model.shape || 'rectangular';
        select.disabled = !!closedTitle || isPending(model, 'shape') || !Dashboard.canEditField(TABLE, 'colActModForma', model.id ? model.shape : '');
        if (select.disabled) select.title = closedTitle || t(isPending(model, 'shape') ? 'main.changePending' : 'main.fieldLocked');
        select.addEventListener('change', () => commit(model, { shape: select.value }));
        td.appendChild(select);
        return td;
    }
    // «Apariencia en el Layout» (2026-11-13): cómo se dibujan en el Layout las piezas de este modelo. Vacío = «La del Tipo» (lo de siempre); si no, una de las apariencias del dibujo de su Tipo, con su vista previa. De momento solo los
    // sensores tienen apariencias: en los demás tipos la celda queda en «La del Tipo» y cerrada.
    function lookCell(model) {
        const td = document.createElement('td');
        td.dataset.col = 'colActModApariencia';
        td.setAttribute('data-help-key', 'assetModelLook');
        const kind = (types.find((r) => r.id === model.parentId) || {}).kind || '';
        const looks = window.AssetLooks ? window.AssetLooks.looksFor(kind) : [];
        const effective = window.AssetLooks ? window.AssetLooks.effective(kind, model.look) : '';
        const wrap = document.createElement('span');
        wrap.className = 'asset-look-pick';
        if (window.AssetLooks && effective) wrap.insertAdjacentHTML('beforeend', window.AssetLooks.thumb(effective));
        const select = document.createElement('select');
        select.className = 'editable-cell-select asset-select';
        const typeLabel = looks.length ? fillText('main.assetLookType', { look: t(`main.assetLook_${window.AssetLooks.effective(kind, '')}`) }) : t('main.assetLookTypeOnly');
        const none = document.createElement('option');
        none.value = '';
        none.textContent = typeLabel;
        select.appendChild(none);
        looks.forEach((id) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = t(`main.assetLook_${id}`);
            select.appendChild(opt);
        });
        select.value = looks.includes(model.look) ? model.look : '';
        select.disabled = !looks.length || isPending(model, 'look') || !Dashboard.canEditField(TABLE, 'colActModApariencia', model.id ? model.look || '' : '');
        if (select.disabled) select.title = !looks.length ? t('main.assetLookNoneYet') : t(isPending(model, 'look') ? 'main.changePending' : 'main.fieldLocked');
        select.addEventListener('change', () => commit(model, { look: select.value }));
        wrap.appendChild(select);
        td.appendChild(wrap);
        return td;
    }
    function statusCell(model) {
        const td = document.createElement('td');
        td.dataset.col = 'colCatStatus';
        td.setAttribute('data-help-key', 'assetModelStatus');
        const select = document.createElement('select');
        select.className = 'editable-cell-select asset-select';
        select.innerHTML = `<option value="active">${t('admin.statusActivo')}</option><option value="inactive">${t('admin.statusInactivo')}</option>`;
        select.value = model.status === 'inactive' ? 'inactive' : 'active';
        select.disabled = isPending(model, 'status') || !Dashboard.canEditField(TABLE, 'colCatStatus', model.id ? model.status || '' : '');
        if (select.disabled) select.title = t(isPending(model, 'status') ? 'main.changePending' : 'main.fieldLocked');
        select.addEventListener('change', () => commit(model, { status: select.value }));
        td.appendChild(select);
        if (model.id && !model.complete) {
            const tag = document.createElement('span');
            tag.className = 'asset-model-tag';
            tag.textContent = t('main.assetModelIncomplete');
            tag.title = t('main.assetModelIncompleteTip');
            td.appendChild(tag);
        }
        return td;
    }
    function actionsCell(model) {
        const td = document.createElement('td');
        td.dataset.col = 'actions';
        td.className = 'admin-table-actions';
        if (model.id) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'admin-icon-btn';
            btn.setAttribute('data-help-key', 'changeHistory');
            btn.setAttribute('aria-label', t('main.changeHistoryTitleRecord'));
            btn.title = t('main.changeHistoryTitleRecord');
            btn.innerHTML = '<i class="bx bx-history" aria-hidden="true"></i>';
            btn.addEventListener('click', () => Dashboard.openChangeHistory(TABLE, model.id));
            td.appendChild(btn);
        }
        return td;
    }
    const num = (val) => parseFloat(val) || 0;

    function buildRow(model) {
        const used = model.usedBy || 0;
        const closedTitle = used ? fillText('main.assetModelClosedTip', { n: used }) : '';
        const cyl = model.shape === 'cilindrica';
        const irregular = model.shape === 'irregular';
        const measure = (colId, key, unit) => (closedTitle
            ? readonlyCell(colId, model[key], unit, closedTitle, 'assetModelSize')
            : inlineCell(model, colId, key, { inputType: 'number', unit, helpKey: 'assetModelSize', toValue: num }));
        const tr = document.createElement('tr');
        tr.dataset.recordId = model.id != null ? String(model.id) : '';
        tr.append(
            inlineCell(model, 'colActModNombreCompra', 'name', { helpKey: 'assetModelName' }),
            inlineCell(model, 'colActModNombrePersonalizado', 'customName', { helpKey: 'assetModelCustom' }),
            inlineCell(model, 'colActModModelo', 'modelNumber', { helpKey: 'assetModelNumber' }),
            shapeCell(model, closedTitle),
            measure('colActModAlto', 'height', 'cm'),
            measure('colActModLargo', 'length', 'cm'),
            cyl ? readonlyCell('colActModProfundidad', model.length, 'cm', t('main.assetDepthCyl'), 'assetModelSize') : measure('colActModProfundidad', 'depth', 'cm'),
            closedTitle ? readonlyCell('colActModPeso', model.weight, 'kg', closedTitle, 'assetModelWeight') : inlineCell(model, 'colActModPeso', 'weight', { inputType: 'number', unit: 'kg', helpKey: 'assetModelWeight', toValue: num }),
            irregular && !closedTitle
                ? inlineCell(model, 'colActModVolumen', 'volume', { inputType: 'number', unit: 'm³', helpKey: 'assetModelVolume', toValue: num, formatDisplay: (v) => Number(v).toFixed(3) })
                : readonlyCell('colActModVolumen', Number(model.volume) > 0 ? Number(model.volume).toFixed(3) : '', 'm³', closedTitle || t('main.assetVolumeCalc'), 'assetModelVolume'),
            lookCell(model),
            statusCell(model),
            textCell('colActModUso', used, 'assetModelUse'),
            actionsCell(model),
        );
        tr.classList.toggle('data-table-row-editable', !!tr.querySelector('td.editable-cell'));
        return tr;
    }

    // --- guardar -----------------------------------------------------------------------------------------------------------------------------------------------
    async function commit(model, patch) {
        try {
            if (!model.id) {
                const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ typeId: model.parentId }) });
                const created = await res.json().catch(() => ({}));
                if (!res.ok) { Dashboard.showToast(created.message || t('admin.saveError'), res.status === 403 ? 'warning' : 'error'); return; }
                model.id = created.category.id;
                draft = null;
            }
            const res = await fetch(`${API}/${model.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(patch) });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                Dashboard.showToast(body.message || t('admin.saveError'), res.status === 403 ? 'warning' : 'error');
            } else if (body.rejectedFields?.length) {
                Dashboard.showToast(`${t('main.fieldLocked')}: ${body.rejectedFields.map((fk) => t(fk)).join(', ')}`, 'warning');
            } else if (body.pendingFields?.length) {
                Dashboard.showToast(`${t('main.changePending')}: ${body.pendingFields.map((fk) => t(fk)).join(', ')}`, 'info');
            } else if ((model.usedBy || 0) > 0 && ('name' in patch || 'customName' in patch || 'modelNumber' in patch)) {
                Dashboard.showToast(fillText('main.assetModelNamesUpdated', { n: model.usedBy }), 'success');
            }
            await reload();
        } catch (err) {
            console.error('Modelos de activos: failed to save', err);
            Dashboard.showToast(t('admin.saveError'), 'error');
            await reload();
        }
    }

    // --- el panel ----------------------------------------------------------------------------------------------------------------------------------------------
    const COLUMNS = [
        ['colActModNombreCompra', 'main.colActModNombreCompra'], ['colActModNombrePersonalizado', 'main.colActModNombrePersonalizado'], ['colActModModelo', 'main.colActModModelo'], ['colActModForma', 'main.colActModForma'],
        ['colActModAlto', 'main.colActModAlto'], ['colActModLargo', 'main.colActModLargo'], ['colActModProfundidad', 'main.colActModProfundidad'], ['colActModPeso', 'main.colActModPeso'],
        ['colActModVolumen', 'main.colActModVolumen'], ['colActModApariencia', 'main.colActModApariencia'], ['colCatStatus', 'main.colCatStatus'], ['colActModUso', 'main.colActModUso'], ['actions', 'main.colActions'],
    ];
    function ensurePanel() {
        if (panel && panel.isConnected) return panel;
        const wrapper = document.querySelector('[data-table-id="activos-fijos"]');
        if (!wrapper) return null;
        panel = document.createElement('section');
        panel.className = 'asset-models';
        panel.id = 'asset-models-panel';
        panel.hidden = true;
        wrapper.insertAdjacentElement('afterend', panel);
        return panel;
    }
    // typeRecords = los Tipos que acaba de dibujar la tabla de arriba (sus nombres y estatus al día).
    function render(typeRecords) {
        if (typeRecords) types = typeRecords;
        const host = ensurePanel();
        if (!host) return;
        const type = types.find((r) => r.id === selectedId);
        if (!selectedId || !type) { host.hidden = true; host.innerHTML = ''; return; }
        host.hidden = false;
        host.innerHTML = '';
        const typeActive = type.status !== 'inactive';
        const head = document.createElement('div');
        head.className = 'asset-models-head';
        const title = document.createElement('h3');
        title.setAttribute('data-help-key', 'assetModelsPanel');
        title.textContent = fillText('main.assetModelsTitle', { tipo: type.name || type.code || '' });
        if (type.letter) {
            const chip = document.createElement('span');
            chip.className = 'asset-models-letter';
            chip.textContent = type.letter;
            title.append(' ', chip);
        }
        const actions = document.createElement('div');
        actions.className = 'asset-models-actions';
        if (typeActive) {
            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'data-table-new-record-btn';
            add.setAttribute('data-help-key', 'assetModelsAdd');
            add.innerHTML = `<i class="bx bx-plus" aria-hidden="true"></i><span>${t('main.assetModelsAdd').replace(/^\+\s*/, '')}</span>`;
            add.addEventListener('click', () => {
                if (draft) return;
                draft = { id: null, parentId: type.id, name: '', customName: '', modelNumber: '', shape: 'rectangular', height: 0, length: 0, depth: 0, weight: 0, volume: 0, look: '', status: 'active', usedBy: 0, complete: false, pendingFields: [] };
                render();
                const firstCell = host.querySelector('tbody tr:last-child td.editable-cell');
                if (firstCell) firstCell.click();
            });
            actions.appendChild(add);
        } else {
            const note = document.createElement('span');
            note.className = 'asset-model-tag';
            note.textContent = t('main.assetModelsTypeInactive');
            actions.appendChild(note);
        }
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn btn-secondary';
        closeBtn.textContent = t('main.assetModelsClose');
        closeBtn.addEventListener('click', close);
        actions.appendChild(closeBtn);
        head.append(title, actions);
        const scroll = document.createElement('div');
        scroll.className = 'asset-models-scroll';
        const table = document.createElement('table');
        table.className = 'data-table asset-models-table';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        COLUMNS.forEach(([colId, key]) => {
            const th = document.createElement('th');
            th.dataset.col = colId;
            th.textContent = t(key);
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        const tbody = document.createElement('tbody');
        const rows = models.filter((m) => m.parentId === type.id).concat(draft && draft.parentId === type.id ? [draft] : []);
        if (!rows.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.className = 'data-table-empty-cell';
            td.colSpan = COLUMNS.length;
            const inner = document.createElement('div');
            inner.className = 'data-table-empty-inner';
            inner.textContent = t('main.assetModelsEmpty');
            td.appendChild(inner);
            tr.appendChild(td);
            tbody.appendChild(tr);
        } else rows.forEach((m) => tbody.appendChild(buildRow(m)));
        table.append(thead, tbody);
        scroll.appendChild(table);
        host.append(head, scroll);
    }

    return { load, countFor, isOpen, open, close, render };
})();
window.AssetModels = AssetModels;
