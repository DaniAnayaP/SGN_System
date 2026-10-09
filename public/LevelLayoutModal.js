// ---------------------------------------------------------------------------
// "Orden y clasificación" de un nivel (Giro, Plan, ...): un modal con una réplica del árbol de ese nivel (grantMode:'giro' de PermissionTree.js, filtrada a lo que
// ese nivel ya tiene asignado y con el arrastre para reordenar) donde también se cambia la clasificación de cada columna. Lo que se cambia solo baja a los niveles
// de abajo; "Restablecer orden original" quita todo lo propio y vuelve a heredar del nivel de arriba.
//   - Con "Autorizar" el cambio se aplica al momento (200) y se avisa hacia abajo; sin él, guardar es "Enviar solicitud" (202) y le llega a quien autoriza.
//   - Solo se manda lo que se movió desde que se abrió el modal (no copias de listas que nadie tocó) y las clasificaciones cambiadas o vueltas a heredar.
// Cada pantalla de nivel solo dice cómo se llaman sus rutas y sus textos (ver create()); el modal se arma aquí para no repetirlo en cada pantalla.
// ---------------------------------------------------------------------------
(function () {
    'use strict';

    function node(tag, attrs, ...children) {
        const el = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([key, value]) => {
            if (value === undefined || value === null) return;
            if (key === 'text') el.textContent = value;
            else if (key === 'hidden') el.hidden = !!value;
            else el.setAttribute(key, value);
        });
        children.forEach((child) => { if (child) el.appendChild(child); });
        return el;
    }

    // config = {
    //   idPrefix: 'plan-layout'   -- prefijo de los ids del modal (único por pantalla)
    //   stateUrl(entity)          -- GET (estado) y PUT (guardar) del nivel
    //   grantsUrl(entity)         -- GET de lo que ese nivel tiene asignado ({ grants })
    //   grantsOf(json)            -- opcional: saca la lista de permisos de esa respuesta (por defecto json.grants); el Cliente junta lo de su plan y sus adicionales
    //   subtitle(entity)          -- opcional: el nombre de lo que se está editando, se muestra junto al título
    //   hintKey, resetBodyKey, resetBodyRequestKey -- textos propios del nivel (reciben { above } = nombre del nivel de arriba)
    //   titleKey                  -- opcional (por defecto "Orden y clasificación")
    // }
    function create(config) {
        const prefix = config.idPrefix;
        const t = (key, params) => window.Dashboard.t(key, params);
        const dom = {};
        let tree = null;
        let entity = null;
        let state = null;
        // El orden tal como estaba al abrir: lo que se manda es SOLO lo que se movió contra esto.
        let baseline = null;
        // Clasificaciones cambiadas / vueltas a heredar en esta sesión (se mandan al guardar, no al momento).
        const classChanges = new Map();
        const classClears = new Set();

        function ensureDom() {
            if (dom.modal) return;
            dom.title = node('h3', { id: `${prefix}-modal-title`, text: t(config.titleKey || 'admin.layoutTitle') });
            dom.hint = node('p', { class: 'admin-hint' });
            dom.pending = node('p', { class: 'admin-hint', id: `${prefix}-pending`, role: 'status', hidden: true });
            dom.container = node('div', { id: `${prefix}-container`, class: 'perm-tree perm-tree-scroll-x' });
            dom.error = node('div', { id: `${prefix}-error`, class: 'admin-error', role: 'alert', hidden: true });
            dom.save = node('button', { type: 'button', class: 'btn', id: `${prefix}-save` });
            dom.close = node('button', { type: 'button', class: 'btn btn-secondary', id: `${prefix}-close` });
            dom.reset = node('button', { type: 'button', class: 'btn btn-secondary', id: `${prefix}-reset`, 'data-help-key': 'layoutResetAll' });
            const actions = node('div', { class: 'admin-form-actions', style: 'margin-top: 1.25rem;' }, dom.save, dom.close, dom.reset);
            const panel = node('div', { class: 'modal-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${prefix}-modal-title`, style: 'max-width: 48rem;' },
                dom.title, dom.hint, dom.pending, dom.container, dom.error, actions);
            dom.modal = node('div', { class: 'modal-overlay', id: `${prefix}-modal`, hidden: true }, panel);

            dom.resetTitle = node('h3', { id: `${prefix}-reset-title` });
            dom.resetBody = node('p', { class: 'admin-hint', id: `${prefix}-reset-body` });
            dom.resetConfirm = node('button', { type: 'button', class: 'btn', id: `${prefix}-reset-confirm` });
            dom.resetCancel = node('button', { type: 'button', class: 'btn btn-secondary', id: `${prefix}-reset-cancel` });
            const resetActions = node('div', { class: 'admin-form-actions', style: 'margin-top: 1rem;' }, dom.resetConfirm, dom.resetCancel);
            const resetPanel = node('div', { class: 'modal-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${prefix}-reset-title`, style: 'max-width: 30rem;' },
                dom.resetTitle, dom.resetBody, resetActions);
            dom.resetModal = node('div', { class: 'modal-overlay', id: `${prefix}-reset-modal`, hidden: true }, resetPanel);

            document.body.append(dom.modal, dom.resetModal);
            dom.close.addEventListener('click', close);
            dom.modal.addEventListener('click', (event) => { if (event.target === dom.modal) close(); });
            dom.save.addEventListener('click', onSave);
            dom.reset.addEventListener('click', onResetClick);
            dom.resetCancel.addEventListener('click', () => { dom.resetModal.hidden = true; });
            dom.resetModal.addEventListener('click', (event) => { if (event.target === dom.resetModal) dom.resetModal.hidden = true; });
            dom.resetConfirm.addEventListener('click', onResetConfirm);
        }

        // Los textos se ponen al abrir (no al crear) para que sigan el idioma que esté activo.
        function renderTexts() {
            const name = entity && config.subtitle ? config.subtitle(entity) : '';
            dom.title.textContent = t(config.titleKey || 'admin.layoutTitle') + (name ? ` — ${name}` : '');
            dom.hint.textContent = t(config.hintKey, { above: aboveName(), aboveFrom: aboveName(true) });
            dom.save.textContent = t('admin.save');
            dom.close.textContent = t('admin.cancel');
            dom.reset.textContent = t('admin.layoutResetAll');
            dom.resetTitle.textContent = t('admin.layoutResetTitle');
            dom.resetConfirm.textContent = t('admin.layoutResetConfirm');
            dom.resetCancel.textContent = t('admin.cancel');
        }

        // El nombre del nivel de arriba al que vuelve "restablecer": el giro del plan o, si no tiene, el Maestro.
        // fromForm: con "de" delante ("viene del Maestro"), porque en español "de el" se contrae.
        function aboveName(fromForm) {
            const above = (state && state.above) || { kind: 'master', name: '' };
            const suffix = fromForm ? 'From' : '';
            if (above.kind === 'plan' && above.name) return t(`admin.layoutAbovePlan${suffix}`, { name: above.name });
            if (above.kind === 'cliente' && above.name) return t(`admin.layoutAboveCliente${suffix}`, { name: above.name });
            return above.kind === 'giro' && above.name ? t(`admin.layoutAboveGiro${suffix}`, { name: above.name }) : t(`admin.layoutAboveMaster${suffix}`);
        }

        function snapshot(current) {
            return {
                customOrder: current.getDepartmentOrder(),
                customAreaOrders: current.getAreaOrders(),
                customApartadoOrders: current.getApartadoOrders(),
                customPantallaOrders: current.getPantallaOrders(),
                customColumnOrders: current.getColumnOrders(),
            };
        }
        const differs = (a, b) => JSON.stringify(a || []) !== JSON.stringify(b || []);

        // Lo que cambió desde que se abrió el modal: solo las listas que se movieron (con su nombre, igual que la confirmación del Árbol de Permisos Maestro) y las
        // clasificaciones cambiadas o vueltas a heredar.
        function collectChanges() {
            const now = snapshot(tree);
            const body = {};
            const names = [];
            if (differs(now.customOrder, baseline.customOrder)) {
                body.customOrder = now.customOrder;
                names.push(t('admin.masterTreeOrderLabel'));
            }
            const mapDiff = (field, labelOf) => {
                Object.keys(now[field] || {}).forEach((key) => {
                    if (!differs(now[field][key], (baseline[field] || {})[key])) {
                        (body[field] = body[field] || {})[key] = now[field][key];
                        names.push(labelOf(key));
                    }
                });
            };
            mapDiff('customAreaOrders', (sectionId) => t('admin.masterTreeAreaOrderLabel', { department: tree.getStatusLabel(sectionId, null, null) || sectionId }));
            mapDiff('customApartadoOrders', (compoundKey) => {
                const [sectionId, areaId] = compoundKey.split('::');
                return t('admin.masterTreeApartadoOrderLabel', { area: tree.getStatusLabel(sectionId, areaId, null) || areaId });
            });
            mapDiff('customPantallaOrders', (compoundKey) => {
                const [sectionId, areaId, apartadoId] = compoundKey.split('::');
                return t('admin.masterTreePantallaOrderLabel', { apartado: tree.getStatusLabel(sectionId, areaId, apartadoId) || apartadoId });
            });
            mapDiff('customColumnOrders', (compoundKey) => {
                const [sectionId, areaId, apartadoId, pantallaId, classId] = compoundKey.split('::');
                return t('admin.masterTreeColumnOrderLabel', { classification: tree.getStatusLabel(sectionId, areaId, `${apartadoId}/${pantallaId}/${classId}`) || classId });
            });
            const classLabel = (nodeKey) => {
                const [sectionId, itemId, ...rest] = nodeKey.split('::');
                return t('admin.layoutClassNames', { name: tree.getStatusLabel(sectionId, itemId, rest.join('::')) || rest.join('::') });
            };
            const changed = [...classChanges.values()];
            const cleared = [...classClears];
            changed.forEach((c) => names.push(classLabel(c.nodeKey)));
            cleared.forEach((nodeKey) => names.push(classLabel(nodeKey)));
            if (changed.length) body.classChanges = changed;
            if (cleared.length) body.clearClasses = cleared;
            body.changes = names;
            return { body, count: names.length };
        }

        // Lo que esta persona puede hacer: sin Personalizar no cambia nada; sin Autorizar, guardar es "Enviar solicitud".
        function renderAccess() {
            const current = state || {};
            dom.save.disabled = !current.canPersonalize;
            dom.reset.disabled = !current.canPersonalize;
            dom.save.textContent = current.canAuthorize ? t('admin.save') : t('admin.layoutRequestSend');
            const pending = (current.pending || []).length;
            dom.pending.hidden = !pending;
            dom.pending.textContent = pending ? t('admin.layoutPendingBanner', { n: pending }) : '';
        }

        async function open(target) {
            ensureDom();
            entity = target;
            state = null;
            tree = null;
            baseline = null;
            renderTexts();
            dom.error.hidden = true;
            dom.container.innerHTML = '';
            dom.pending.hidden = true;
            dom.modal.hidden = false;
            classChanges.clear();
            classClears.clear();
            try {
                const [grantsRes, statusRes, costsRes, orderRes] = await Promise.all([
                    fetch(config.grantsUrl(target), { credentials: 'include' }),
                    fetch('/api/admin/master-permission-status', { credentials: 'include' }),
                    fetch('/api/admin/master-permission-costs', { credentials: 'include' }),
                    fetch(config.stateUrl(target), { credentials: 'include' }),
                ]);
                if (!grantsRes.ok || !statusRes.ok || !costsRes.ok || !orderRes.ok) throw new Error('load failed');
                const grantsData = await grantsRes.json();
                const statusData = await statusRes.json();
                const costsData = await costsRes.json();
                const orderData = await orderRes.json();
                state = orderData;
                renderTexts();
                const inherited = new Map((orderData.inheritedClassifications || []).map((o) => [o.nodeKey, o]));
                tree = window.PermissionTree.create(dom.container, {
                    grantMode: 'giro',
                    grantOrderMode: true,
                    masterGate: statusData.statuses || [],
                    masterCosts: costsData.costs || [],
                    costCurrency: costsData.currency || 'MXN',
                    departmentOrder: orderData.customOrder || [],
                    areaOrder: orderData.customAreaOrders || {},
                    apartadoOrder: orderData.customApartadoOrders || {},
                    pantallaOrder: orderData.customPantallaOrders || {},
                    columnOrder: orderData.customColumnOrders || {},
                    // La clasificación de una columna se puede cambiar aquí; queda pendiente y viaja junto con el orden al guardar.
                    classificationEditor: {
                        canEdit: !!orderData.canPersonalize,
                        onChange(nodeKey, classificationId, classificationLabel) {
                            classChanges.set(nodeKey, { nodeKey, classificationId, classificationLabel });
                            classClears.delete(nodeKey);
                        },
                        // El ↺: quita lo propio y vuelve a lo que viene de arriba (devuelve eso para que el árbol lo pinte).
                        onReset(nodeKey) {
                            classChanges.delete(nodeKey);
                            const above = inherited.get(nodeKey) || null;
                            if (state && (state.classifications || []).some((o) => o.nodeKey === nodeKey && o.from === 'own')) classClears.add(nodeKey);
                            return above;
                        },
                    },
                });
                await tree.init((config.grantsOf ? config.grantsOf(grantsData) : grantsData.grants) || [], [], orderData.classifications || []);
                baseline = snapshot(tree);
                renderAccess();
            } catch {
                dom.error.textContent = t('admin.loadError');
                dom.error.hidden = false;
            }
        }

        function close() {
            if (!dom.modal) return;
            dom.modal.hidden = true;
            dom.resetModal.hidden = true;
            tree = null;
            entity = null;
            state = null;
            baseline = null;
        }

        // Manda el cambio (o el restablecer todo). 200 = ya se aplicó; 202 = quedó como solicitud para quien autoriza.
        async function submit(body) {
            const res = await fetch(config.stateUrl(entity), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body),
            });
            if (!res.ok && res.status !== 202) throw new Error('save failed');
            const data = await res.json().catch(() => ({}));
            if (res.status === 202) window.Dashboard.showToast(t('admin.layoutRequestSent', { name: (data.assignedTo && data.assignedTo.name) || '' }), 'info');
            else if (data.unchanged) window.Dashboard.showToast(t('admin.layoutNoChanges'), 'info');
            else window.Dashboard.showToast(t('admin.layoutSaved'), 'success');
            return data;
        }

        async function onSave() {
            if (!entity || !tree) return;
            const { body, count } = collectChanges();
            if (!count) {
                window.Dashboard.showToast(t('admin.layoutNoChanges'), 'info');
                return;
            }
            dom.save.disabled = true;
            try {
                await submit(body);
                close();
                if (typeof config.onSaved === 'function') config.onSaved();
            } catch {
                window.Dashboard.showToast(t('admin.saveError'), 'error');
            } finally {
                dom.save.disabled = false;
            }
        }

        // "Restablecer orden original": vuelve a heredar TODO lo del nivel de arriba. Pide confirmación y, si no puede autorizar, se manda como solicitud.
        function onResetClick() {
            if (!entity || !state) return;
            dom.resetBody.textContent = t(state.canAuthorize ? config.resetBodyKey : config.resetBodyRequestKey, { above: aboveName() });
            dom.resetModal.hidden = false;
        }

        async function onResetConfirm() {
            if (!entity) return;
            dom.resetConfirm.disabled = true;
            try {
                await submit({ resetAll: true, changes: [t('admin.layoutResetAll').replace(/^↺\s*/, '')] });
                dom.resetModal.hidden = true;
                close();
                if (typeof config.onSaved === 'function') config.onSaved();
            } catch {
                window.Dashboard.showToast(t('admin.saveError'), 'error');
            } finally {
                dom.resetConfirm.disabled = false;
            }
        }

        return { open, close };
    }

    window.LevelLayoutModal = { create };
})();
