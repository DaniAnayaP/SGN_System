// Criterios, límites y avisos de los activos (2026-11-13): lo que comparten Catálogos > Activos Fijos (el modelo elige qué se mide y qué se avisa), Alta Activos y Gestión > Activos (una columna por criterio, con N/A
// donde el modelo no lo mide, y las columnas Alertas y Avisos con su detalle). Los textos de las alertas vienen del servidor como código + parámetros y aquí se escriben en el idioma de quien las ve (Dashboard.assetAlertText).
(function () {
    const t = (key, params) => Dashboard.t(key, params);
    const el = (tag, cls, text) => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    };
    const locale = () => (document.documentElement.lang === 'en' ? 'en-US' : 'es-MX');
    // Las horas se guardan en UTC y se ven en la hora de quien mira.
    function fmtWhen(iso) {
        const d = new Date(iso);
        if (!iso || Number.isNaN(d.getTime())) return '';
        return d.toLocaleString(locale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    function fmtSpan(fromIso, toIso) {
        const ms = Math.max(0, new Date(toIso).getTime() - new Date(fromIso).getTime());
        const min = Math.round(ms / 60000);
        if (min < 60) return `${Math.max(1, min)} min`;
        const h = Math.round(min / 6) / 10;
        if (h < 48) return `${h} h`;
        return `${Math.round(h / 24)} d`;
    }
    function openDialog(title, subtitle) {
        const overlay = el('div', 'modal-overlay');
        const panel = el('div', 'modal-panel sku-edit-win asset-crit-win');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.appendChild(el('h3', '', title));
        if (subtitle) panel.appendChild(el('p', 'sku-edit-who', subtitle));
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        const onKey = (event) => { if (event.key === 'Escape') close(); };
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
        document.addEventListener('keydown', onKey);
        overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
        return { panel, close };
    }
    function button(label, { primary = false, onClick } = {}) {
        const b = el('button', primary ? 'btn' : 'btn btn-secondary', label);
        b.type = 'button';
        if (onClick) b.addEventListener('click', onClick);
        return b;
    }
    const assetTitle = (record) => [record.code, record.customName || record.purchaseName].filter(Boolean).join(' · ');

    // --- el límite de un activo en un criterio (una columna por criterio) -------------------------------------------------------------------------------
    function openLimitEditor({ record, criterion, onSave }) {
        const dlg = openDialog(criterion.name, assetTitle(record));
        const cur = (record.limitValues && record.limitValues[criterion.id]) || {};
        const form = el('div', 'asset-limit-form');
        const inputs = {};
        const addField = (key, labelKey, value) => {
            const wrap = el('label', 'asset-limit-field');
            wrap.appendChild(el('span', '', t(labelKey)));
            const input = document.createElement('input');
            input.type = 'number';
            input.step = 'any';
            input.value = value === null || value === undefined ? '' : String(value);
            wrap.appendChild(input);
            if (criterion.unit) wrap.appendChild(el('small', '', criterion.unit));
            form.appendChild(wrap);
            inputs[key] = input;
        };
        if (criterion.kind === 'range' || criterion.kind === 'min') addField('min', 'main.assetLimitMin', cur.min);
        if (criterion.kind === 'range' || criterion.kind === 'max') addField('max', 'main.assetLimitMax', cur.max);
        if (criterion.kind === 'every') addField('max', 'main.assetLimitHours', cur.max);
        dlg.panel.appendChild(form);
        const num = (input) => (input && input.value.trim() !== '' ? Number(input.value) : null);
        const actions = el('div', 'admin-form-actions');
        const save = async (clear) => {
            let value = null;
            if (!clear) {
                if (criterion.kind === 'range') value = { min: num(inputs.min), max: num(inputs.max) };
                else if (criterion.kind === 'min') value = num(inputs.min);
                else value = num(inputs.max);
                if (value && typeof value === 'object' && value.min === null && value.max === null) value = null;
            }
            dlg.close();
            await onSave({ [criterion.id]: value });
        };
        const hasValue = cur.min !== undefined && cur.min !== null || cur.max !== undefined && cur.max !== null;
        actions.append(button(t('main.assetEditarCancelar'), { onClick: dlg.close }));
        if (hasValue) actions.append(button(t('main.assetLimitClear'), { onClick: () => save(true) }));
        const ok = button(t('main.assetLimitSave'), { primary: true, onClick: () => save(false) });
        actions.append(ok);
        dlg.panel.appendChild(actions);
        (Object.values(inputs)[0] || ok).focus();
    }
    // La celda de un criterio: N/A si el modelo del activo no lo mide, «Sin límite» si lo mide y falta escribirlo, o el límite. Se edita al tocarla (Alta Activos), salvo en Gestión (solo lectura).
    function limitCell(record, criterion, { tableKey, readOnly, onSave }) {
        const td = document.createElement('td');
        td.dataset.col = criterion.colId;
        td.setAttribute('data-help-key', 'assetCritCell');
        td.classList.add('asset-crit-cell');
        const measured = (record.measures || []).includes(criterion.id);
        if (!measured) {
            td.appendChild(el('span', 'asset-na', t('main.assetNA')));
            td.title = t('main.assetNATip', { name: criterion.name });
            return td;
        }
        const text = (record.limits && record.limits[criterion.id]) || '';
        td.appendChild(text ? el('span', '', text) : el('span', 'asset-nolimit', t('main.assetNoLimit')));
        const key = `crit:${criterion.id}`;
        if (record.editing && Array.isArray(record.editingFields)) {
            if (!record.editingFields.includes(key)) { td.classList.add('sku-cell-locked'); return td; }
            td.classList.add('sku-cell-marked');
            if ((record.pendingChoices || []).includes(key)) td.classList.add('sku-cell-pending');
        }
        const pending = (record.pendingFields || []).includes(`crit${criterion.id}`);
        if (!readOnly && Dashboard.canEditField(tableKey, criterion.colId, text, pending)) {
            td.classList.add('editable-cell');
            td.title = t('main.assetCritEdit', { name: criterion.name });
            td.onclick = () => openLimitEditor({ record, criterion, onSave });
        } else if (!readOnly) td.classList.add('editable-cell-locked');
        return td;
    }
    // Los criterios que se pueden marcar en «Editar» de Gestión: los que mide el modelo del activo.
    const editableCriteria = (record, criteria) => (criteria || []).filter((c) => (record.measures || []).includes(c.id));

    // --- Alertas y Avisos de Gestión > Activos (solo lectura, con detalle al tocarlas) -----------------------------------------------------------------
    function alertChip(alert, { withDetail = true } = {}) {
        const text = Dashboard.assetAlertText(alert);
        const chip = el('span', `asset-sev asset-sev-${alert.severity === 'high' ? 'high' : 'mid'}`);
        chip.appendChild(el('b', '', text.label));
        if (withDetail && text.detail) chip.appendChild(el('small', '', text.detail));
        return chip;
    }
    function alertsCell(record, { onOpen }) {
        const td = document.createElement('td');
        td.dataset.col = 'colActAlertas';
        td.setAttribute('data-help-key', 'assetAlertsCol');
        td.classList.add('asset-alerts-cell');
        const empty = !(record.measures || []).length && !(record.noticeIds || []).length && !(record.alerts || []).length;
        if (empty) { td.appendChild(el('span', 'asset-na', t('main.assetNA'))); return td; }
        const alerts = record.alerts || [];
        if (!alerts.length) td.appendChild(el('span', 'asset-sev asset-sev-ok', t('main.assetNoAlerts')));
        else {
            const stack = el('div', 'asset-sev-stack');
            alerts.forEach((a) => stack.appendChild(alertChip(a)));
            td.appendChild(stack);
        }
        td.classList.add('asset-clickable');
        td.title = t('main.assetAlertsOpen');
        td.onclick = () => onOpen(record);
        return td;
    }
    function activityCell(record, { onOpen }) {
        const td = document.createElement('td');
        td.dataset.col = 'colActAvisos';
        td.setAttribute('data-help-key', 'assetActivityCol');
        td.classList.add('asset-activity-cell');
        if (!(record.noticeIds || []).length) { td.appendChild(el('span', 'asset-na', t('main.assetNA'))); return td; }
        const a = record.activity;
        if (!a) td.appendChild(el('span', 'asset-nolimit', t('main.assetNoActivity')));
        else {
            const text = Dashboard.assetActivityText(a);
            const box = el('div', 'asset-act');
            box.appendChild(el('b', '', text.label));
            box.appendChild(el('small', '', [fmtWhen(a.at), a.by].filter(Boolean).join(' · ')));
            td.appendChild(box);
        }
        td.classList.add('asset-clickable');
        td.title = t('main.assetActivityOpen');
        td.onclick = () => onOpen(record);
        return td;
    }
    async function openAlertsDialog(record, { onChanged } = {}) {
        const dlg = openDialog(t('main.assetAlertsTitle', { code: record.code }), assetTitle(record));
        const body = el('div', 'asset-crit-body');
        dlg.panel.appendChild(body);
        const actions = el('div', 'admin-form-actions');
        actions.append(button(t('main.assetClose'), { primary: true, onClick: dlg.close }));
        dlg.panel.appendChild(actions);
        const draw = async () => {
            body.textContent = '';
            let data;
            try {
                const res = await fetch(`/api/business/asset-alerts?assetId=${record.id}`, { credentials: 'include' });
                if (!res.ok) throw new Error('load');
                data = await res.json();
            } catch {
                body.appendChild(el('p', 'asset-crit-empty', t('admin.loadError')));
                return;
            }
            body.appendChild(el('h4', '', t('main.assetAlertsActive')));
            if (!data.active.length) body.appendChild(el('p', 'asset-crit-empty', t('main.assetAlertsNoneActive')));
            data.active.forEach((a) => {
                const row = el('div', 'asset-crit-row');
                const main = el('div', 'asset-crit-main');
                main.appendChild(alertChip(a));
                const sub = [t('main.assetAlertSince', { date: fmtWhen(a.startedAt) })];
                if (a.ackAt) sub.push(t('main.assetAlertAckBy', { who: a.ackBy, date: fmtWhen(a.ackAt) }));
                main.appendChild(el('small', '', sub.join(' · ')));
                row.appendChild(main);
                if (!a.ackAt && data.canAck) {
                    row.appendChild(button(t('main.assetAlertAck'), {
                        onClick: async () => {
                            const res = await fetch(`/api/business/asset-alerts/${a.id}/ack`, { method: 'POST', credentials: 'include' });
                            if (!res.ok) { const b = await res.json().catch(() => ({})); Dashboard.showToast(b.message || t('admin.saveError'), 'warning'); return; }
                            await draw();
                            if (onChanged) onChanged();
                        },
                    }));
                }
                body.appendChild(row);
            });
            body.appendChild(el('h4', '', t('main.assetAlertsHistory')));
            if (!data.history.length) body.appendChild(el('p', 'asset-crit-empty', t('main.assetAlertsNoHistory')));
            data.history.forEach((a) => {
                const row = el('div', 'asset-crit-row');
                const main = el('div', 'asset-crit-main');
                main.appendChild(alertChip(a));
                main.appendChild(el('small', '', `${fmtWhen(a.startedAt)} → ${fmtWhen(a.endedAt)} · ${t('main.assetAlertLasted', { time: fmtSpan(a.startedAt, a.endedAt) })}`));
                row.appendChild(main);
                body.appendChild(row);
            });
            body.appendChild(el('p', 'asset-crit-hint', t('main.assetAlertsHint')));
        };
        await draw();
    }
    async function openActivityDialog(record) {
        const dlg = openDialog(t('main.assetActivityTitle', { code: record.code }), assetTitle(record));
        const body = el('div', 'asset-crit-body');
        dlg.panel.appendChild(body);
        const actions = el('div', 'admin-form-actions');
        actions.append(button(t('main.assetClose'), { primary: true, onClick: dlg.close }));
        dlg.panel.appendChild(actions);
        try {
            const res = await fetch(`/api/business/asset-activity?assetId=${record.id}`, { credentials: 'include' });
            if (!res.ok) throw new Error('load');
            const data = await res.json();
            if (!data.items.length) body.appendChild(el('p', 'asset-crit-empty', t('main.assetActivityNone')));
            data.items.forEach((a) => {
                const text = Dashboard.assetActivityText(a);
                const row = el('div', 'asset-crit-row');
                const main = el('div', 'asset-crit-main');
                main.appendChild(el('b', '', [text.label, text.detail].filter(Boolean).join(' · ')));
                main.appendChild(el('small', '', [fmtWhen(a.at), a.by].filter(Boolean).join(' · ')));
                row.appendChild(main);
                body.appendChild(row);
            });
            body.appendChild(el('p', 'asset-crit-hint', t('main.assetActivityHint')));
        } catch {
            body.appendChild(el('p', 'asset-crit-empty', t('admin.loadError')));
        }
    }

    // --- el modelo elige qué se mide y qué se avisa (Catálogos > Activos Fijos > Modelos) --------------------------------------------------------------
    const CRIT_KINDS = ['range', 'max', 'min', 'every'];
    const API = '/api/business/article-categories';
    const usable = (kind, row) => !!row.name && (kind === 'criteria' ? CRIT_KINDS.includes(row.kind) : true) && row.status === 'active';
    function openCatalogPicker({ model, kind, catalog, canCreate, onSave, reload }) {
        const dlg = openDialog(t(kind === 'criteria' ? 'main.assetModelPickCriteria' : 'main.assetModelPickAvisos', { name: model.name || model.customName || '' }), '');
        const picked = new Set(kind === 'criteria' ? model.criteriaIds || [] : model.avisoIds || []);
        const list = el('div', 'asset-crit-body');
        dlg.panel.appendChild(list);
        let rows = catalog.slice();
        const draw = () => {
            list.textContent = '';
            const offered = rows.filter((r) => usable(kind, r) || picked.has(r.id));
            offered.forEach((r) => {
                const label = el('label', 'sku-edit-opt');
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.checked = picked.has(r.id);
                box.addEventListener('change', () => { if (box.checked) picked.add(r.id); else picked.delete(r.id); });
                label.append(box, el('span', '', r.name));
                if (r.status !== 'active') label.appendChild(el('small', 'asset-crit-hint', ` ${t('main.assetCritInactive')}`));
                list.appendChild(label);
            });
            const soon = rows.filter((r) => r.builtinKey === 'leaveZone');
            soon.forEach((r) => list.appendChild(el('p', 'asset-crit-hint', `${r.name} · ${t('main.assetCritSoon')}`)));
            if (!offered.length) list.appendChild(el('p', 'asset-crit-empty', t('main.assetModelPickEmpty')));
        };
        draw();
        const create = el('div', 'asset-crit-create');
        const newBtn = button(t('main.assetModelNew'), {
            onClick: () => {
                create.textContent = '';
                const name = document.createElement('input');
                name.type = 'text';
                name.placeholder = t('main.assetModelNewName');
                name.maxLength = 80;
                const extras = [];
                let kindSel = null;
                let unit = null;
                if (kind === 'criteria') {
                    kindSel = document.createElement('select');
                    CRIT_KINDS.forEach((k) => { const o = document.createElement('option'); o.value = k; o.textContent = t(`main.critKind_${k}`); kindSel.appendChild(o); });
                    unit = document.createElement('input');
                    unit.type = 'text';
                    unit.placeholder = t('main.assetModelNewUnit');
                    unit.maxLength = 12;
                    extras.push(kindSel, unit);
                }
                const go = button(t('main.assetModelNewCreate'), {
                    primary: true,
                    onClick: async () => {
                        const type = kind === 'criteria' ? 'activos-criterios' : 'activos-avisos';
                        const send = async (method, url, body) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
                        try {
                            let res = await send('POST', `${API}/${type}`, {});
                            let data = await res.json().catch(() => ({}));
                            if (!res.ok) { Dashboard.showToast(data.message || t('admin.saveError'), res.status === 403 ? 'warning' : 'error'); return; }
                            const id = data.category.id;
                            const patch = { name: name.value.trim(), status: 'active', ...(kind === 'criteria' ? { kind: kindSel.value, unit: unit.value.trim() } : {}) };
                            res = await send('PATCH', `${API}/${type}/${id}`, patch);
                            data = await res.json().catch(() => ({}));
                            if (!res.ok) { Dashboard.showToast(data.message || t('admin.saveError'), res.status === 403 ? 'warning' : 'error'); return; }
                            rows = await reload();
                            picked.add(id);
                            create.textContent = '';
                            draw();
                        } catch (err) {
                            console.error('AssetCriteria: failed to create', err);
                            Dashboard.showToast(t('admin.saveError'), 'error');
                        }
                    },
                });
                create.append(name, ...extras, go);
                name.focus();
            },
        });
        newBtn.disabled = !canCreate;
        if (!canCreate) newBtn.title = t('main.fieldLocked');
        dlg.panel.append(newBtn, create);
        const actions = el('div', 'admin-form-actions');
        actions.append(button(t('main.assetEditarCancelar'), { onClick: dlg.close }));
        actions.append(button(t('main.assetLimitSave'), { primary: true, onClick: async () => { dlg.close(); await onSave([...picked]); } }));
        dlg.panel.appendChild(actions);
    }
    // La celda del modelo (chips con los nombres elegidos); al tocarla abre la lista.
    function catalogPickerCell({ model, colId, apiKey, kind, catalog, tableKey, canCreate, helpKey, isPending, onSave, reload }) {
        const td = document.createElement('td');
        td.dataset.col = colId;
        td.setAttribute('data-help-key', helpKey);
        const ids = kind === 'criteria' ? model.criteriaIds || [] : model.avisoIds || [];
        const byId = new Map(catalog.map((r) => [r.id, r]));
        const chips = el('div', 'asset-chip-list');
        ids.forEach((id) => { const r = byId.get(id); if (r) chips.appendChild(el('span', `asset-chip${r.status === 'active' ? '' : ' asset-chip-off'}`, r.name)); });
        if (!ids.length) chips.appendChild(el('span', 'asset-na', '—'));
        td.appendChild(chips);
        const pending = isPending(model, apiKey);
        if (!pending && Dashboard.canEditField(tableKey, colId, ids.length ? 'x' : '')) {
            td.classList.add('editable-cell');
            td.title = t('main.assetModelPickOpen');
            td.onclick = () => openCatalogPicker({ model, kind, catalog, canCreate, onSave, reload });
        } else td.classList.add('editable-cell-locked');
        return td;
    }
    window.AssetCriteria = { limitCell, editableCriteria, alertsCell, activityCell, openAlertsDialog, openActivityDialog, catalogPickerCell, fmtWhen };
}());
