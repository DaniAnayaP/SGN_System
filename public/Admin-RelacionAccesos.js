// ---------------------------------------------------------------------------
// «Relación de Accesos» (Configuración SaaS, pieza 5 de Códigos desde TI): primero se elige el acceso que se va a configurar (una pantalla, una columna, un botón o un icono) y, sobre TODO el árbol de accesos, se marca (1) su MÍNIMO
// INDISPENSABLE para operarlo (se habilitará solo y bloqueado desde el Giro, y baja a Plan y cliente) y (2) los accesos que TOCA (solo se recomiendan, no entran solos). Lo que no se marca es opcional (personalizar). Marcar un contenedor
// (pantalla, apartado, grupo...) vale para toda su rama. Esta pantalla solo guarda las marcas (tabla access_relations); lo que hacen en Giro/Plan/Cliente es un paso aparte. Rutas: GET/PUT /api/admin/access-relations.
// ---------------------------------------------------------------------------
(function () {
    const t = (key, params) => Dashboard.t(key, params);
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const CONFIGURABLE = ['pantalla', 'column', 'button', 'icon']; // lo que se puede elegir como «el acceso que se configura»
    const TYPE_KEY = { pantalla: 'admin.relAccTypePantalla', column: 'admin.relAccTypeColumn', button: 'admin.relAccTypeButton', icon: 'admin.relAccTypeIcon', group: 'admin.relAccTypeGroup', apartado: 'admin.relAccTypeApartado', area: 'admin.relAccTypeArea', department: 'admin.relAccTypeDepartment' };
    const RESULT_LIMIT = 60;

    let nodes = []; // [{ k, p, ty, l, lp }] el catálogo completo, en el orden del árbol
    const byKey = new Map();
    const children = new Map(); // llave -> llaves de sus hijos
    let roots = [];
    let saved = new Map(); // acceso -> { minimum: Set, touches: Set } lo guardado
    let canEdit = false;
    let current = ''; // el acceso que se configura
    let draft = { minimum: new Set(), touches: new Set() }; // lo que se está marcando
    const open = new Set(); // contenedores abiertos en el árbol
    let treeQuery = '';
    let listQuery = '';
    const labelCache = new Map();

    // ---- nombres -----------------------------------------------------------------------------------------------------------------------
    const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const lastSegment = (key) => { const parts = key.split('::'); const tail = parts[2] || parts[1] || parts[0]; return tail.split('/').pop() || key; };
    function labelOf(key) {
        if (labelCache.has(key)) return labelCache.get(key);
        const n = byKey.get(key);
        let text = lastSegment(key);
        if (n) {
            if (n.ty === 'department') {
                if (key.startsWith('main::')) text = t('menu.mainSection');
                else { const d = typeof DEPARTMENTS !== 'undefined' ? DEPARTMENTS.find((x) => x.key === key.split('::')[0]) : null; text = d ? t(d.labelKey) : key.split('::')[0]; }
            } else if (n.l) {
                const s = t(n.l, n.lp || undefined);
                if (s && s !== n.l) text = s;
            }
        }
        labelCache.set(key, text);
        return text;
    }
    function ancestorsOf(key) {
        const out = [];
        let p = (byKey.get(key) || {}).p;
        while (p) { out.unshift(p); p = (byKey.get(p) || {}).p; }
        return out;
    }
    const pathOf = (key, from = 0) => ancestorsOf(key).concat(key).slice(from).map(labelOf).join(' › ');
    const shortPath = (key) => { const all = ancestorsOf(key).concat(key); return all.slice(-3).map(labelOf).join(' › '); };
    const typeLabel = (n) => t(TYPE_KEY[n.ty] || 'admin.relAccTypePantalla');
    function plural(n, one, many) { return t(n === 1 ? one : many, { n }); }
    const chipsText = (rel) => {
        const min = rel ? rel.minimum.size : 0; const tou = rel ? rel.touches.size : 0;
        if (!min && !tou) return t('admin.relAccNoRel');
        return [min ? plural(min, 'admin.relAccMin1', 'admin.relAccMinN') : '', tou ? plural(tou, 'admin.relAccTou1', 'admin.relAccTouN') : ''].filter(Boolean).join(' · ');
    };

    // ---- carga -------------------------------------------------------------------------------------------------------------------------
    function showError(message) { const el = $('ra-error'); el.textContent = message || ''; el.hidden = !message; }
    function indexCatalog(list) {
        nodes = list;
        byKey.clear(); children.clear(); labelCache.clear();
        nodes.forEach((n) => { byKey.set(n.k, n); if (!children.has(n.p)) children.set(n.p, []); children.get(n.p).push(n.k); });
        roots = children.get('') || [];
    }
    function indexRelations(list) {
        saved = new Map();
        (list || []).forEach((r) => {
            if (!saved.has(r.access)) saved.set(r.access, { minimum: new Set(), touches: new Set() });
            saved.get(r.access)[r.kind === 'minimum' ? 'minimum' : 'touches'].add(r.related);
        });
    }
    async function load() {
        try {
            const res = await fetch('/api/admin/access-relations', { credentials: 'include' });
            if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.message || 'load failed'); }
            const body = await res.json();
            canEdit = !!body.canEdit;
            indexCatalog(body.nodes || []);
            indexRelations(body.relations || []);
            showError('');
            renderList();
            if (current) selectAccess(current);
        } catch (err) {
            console.error('Relación de Accesos: failed to load', err);
            showError(err.message && err.message !== 'load failed' ? err.message : t('admin.relAccLoadError'));
        }
    }

    // ---- la lista de la izquierda: lo ya configurado o los resultados de la búsqueda --------------------------------------------
    function accessItemHtml(key) {
        const n = byKey.get(key);
        const rel = saved.get(key);
        return `<li><button type="button" class="ra-item${key === current ? ' active' : ''}" data-key="${esc(key)}">
            <span class="ra-item-name">${esc(labelOf(key))}</span><span class="ra-type">${esc(typeLabel(n))}</span>
            <span class="ra-item-path">${esc(pathOf(key, 0).split(' › ').slice(0, -1).join(' › '))}</span>
            <span class="ra-item-state${rel ? ' set' : ''}">${esc(chipsText(rel))}</span></button></li>`;
    }
    function renderList() {
        const list = $('ra-list');
        const count = $('ra-count');
        const q = fold(listQuery.trim());
        if (q.length >= 2) {
            const hits = [];
            for (const n of nodes) {
                if (!CONFIGURABLE.includes(n.ty)) continue;
                if (fold(labelOf(n.k)).includes(q) || fold(pathOf(n.k)).includes(q)) { hits.push(n.k); if (hits.length > RESULT_LIMIT) break; }
            }
            const shown = hits.slice(0, RESULT_LIMIT);
            count.textContent = hits.length ? (hits.length > RESULT_LIMIT ? t('admin.relAccResultsMore', { n: RESULT_LIMIT }) : '') : t('admin.relAccNoResults');
            list.innerHTML = shown.map(accessItemHtml).join('');
            return;
        }
        const configured = [...saved.keys()].filter((k) => byKey.has(k) && (saved.get(k).minimum.size || saved.get(k).touches.size)).sort((a, b) => pathOf(a).localeCompare(pathOf(b)));
        count.textContent = configured.length ? t('admin.relAccConfigured', { n: configured.length }) : t('admin.relAccNoneConfigured');
        list.innerHTML = configured.map(accessItemHtml).join('');
    }

    // ---- el acceso elegido -------------------------------------------------------------------------------------------------------------
    function cloneRel(rel) { return { minimum: new Set(rel ? rel.minimum : []), touches: new Set(rel ? rel.touches : []) }; }
    function selectAccess(key) {
        if (!byKey.has(key)) return;
        current = key;
        draft = cloneRel(saved.get(key));
        treeQuery = '';
        $('ra-tree-search').value = '';
        // se abre el camino al acceso y a todo lo que ya tiene marcado, para ver las marcas sin buscarlas
        open.clear();
        [key, ...draft.minimum, ...draft.touches].forEach((k) => ancestorsOf(k).forEach((a) => open.add(a)));
        $('ra-empty').hidden = true;
        $('ra-config').hidden = false;
        $('ra-title').textContent = labelOf(key);
        $('ra-path').textContent = `${pathOf(key).split(' › ').slice(0, -1).join(' › ')} · ${typeLabel(byKey.get(key))}`;
        renderTree();
        renderChain();
        renderActions();
        renderList();
        const row = $('ra-tree-body').querySelector('tr.ra-self');
        if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    }

    // ---- el árbol completo con las dos columnas de marcas ------------------------------------------------------------------------------
    // Una marca en un contenedor vale para toda su rama: sus descendientes salen marcados y bloqueados («Incluido por …»).
    function coveredBy(key, kind) {
        const set = kind === 'minimum' ? draft.minimum : draft.touches;
        for (const a of ancestorsOf(key)) if (set.has(a)) return a;
        return '';
    }
    function visibleKeys() {
        const out = [];
        const q = fold(treeQuery.trim());
        if (q.length >= 2) {
            const keep = new Set();
            nodes.forEach((n) => { if (fold(labelOf(n.k)).includes(q)) { keep.add(n.k); ancestorsOf(n.k).forEach((a) => keep.add(a)); } });
            const walk = (key) => { if (!keep.has(key)) return; out.push(key); (children.get(key) || []).forEach(walk); };
            roots.forEach(walk);
            return out;
        }
        const walk = (key) => { out.push(key); if (open.has(key)) (children.get(key) || []).forEach(walk); };
        roots.forEach(walk);
        return out;
    }
    function checkboxHtml(key, kind, state) {
        const label = t(kind === 'minimum' ? 'admin.relAccColMin' : 'admin.relAccColTouch');
        const covered = state.covered;
        const checked = state.own || covered;
        const disabled = !canEdit || state.self || covered;
        const title = covered ? t('admin.relAccIncludedBy', { name: labelOf(covered) }) : (state.self ? t('admin.relAccSelf') : label);
        return `<td class="ra-col-mark"><input type="checkbox" class="ra-chk" data-kind="${kind}" data-key="${esc(key)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''} title="${esc(title)}" aria-label="${esc(`${label}: ${labelOf(key)}`)}"></td>`;
    }
    function renderTree() {
        const body = $('ra-tree-body');
        const searching = fold(treeQuery.trim()).length >= 2;
        const keys = visibleKeys();
        body.innerHTML = keys.map((key) => {
            const n = byKey.get(key);
            const depth = ancestorsOf(key).length;
            const kids = (children.get(key) || []).length;
            const self = key === current;
            const min = { own: draft.minimum.has(key), covered: coveredBy(key, 'minimum'), self };
            const tou = { own: draft.touches.has(key), covered: coveredBy(key, 'touches'), self };
            const cls = ['ra-row', self ? 'ra-self' : '', min.own || min.covered ? 'ra-row-min' : '', tou.own || tou.covered ? 'ra-row-touch' : '', kids ? 'ra-branch' : ''].filter(Boolean).join(' ');
            const caret = kids ? `<button type="button" class="ra-caret" data-key="${esc(key)}" aria-expanded="${open.has(key) || searching ? 'true' : 'false'}"><i class="bx ${open.has(key) || searching ? 'bx-chevron-down' : 'bx-chevron-right'}" aria-hidden="true"></i></button>` : '<span class="ra-caret-gap"></span>';
            return `<tr class="${cls}" data-key="${esc(key)}"><td class="ra-name" style="padding-left:${0.5 + depth * 1.1}rem">${caret}<span class="ra-label-text">${esc(labelOf(key))}</span><span class="ra-type">${esc(typeLabel(n))}</span></td>${checkboxHtml(key, 'minimum', min)}${checkboxHtml(key, 'touches', tou)}</tr>`;
        }).join('');
    }
    function toggleMark(key, kind) {
        const mine = kind === 'minimum' ? draft.minimum : draft.touches;
        const other = kind === 'minimum' ? draft.touches : draft.minimum;
        if (mine.has(key)) { mine.delete(key); return; }
        mine.add(key);
        other.delete(key); // un acceso no puede ser a la vez mínimo y recomendado
        // lo de adentro de lo que se acaba de marcar ya queda incluido: se quita lo suelto (en las dos columnas)
        const strip = (set) => { [...set].forEach((k) => { if (k !== key && ancestorsOf(k).includes(key)) set.delete(k); }); };
        strip(mine);
        strip(other);
    }

    // ---- la cadena: lo mínimo de un acceso puede tener su propio mínimo ---------------------------------------------------------------
    function renderChain() {
        const box = $('ra-chain');
        const lines = [];
        const seen = new Set([current]);
        const rec = (key, depth) => {
            const mins = key === current ? [...draft.minimum] : [...((saved.get(key) || {}).minimum || [])];
            mins.forEach((m) => {
                const cycle = seen.has(m);
                lines.push({ depth, key: m, cycle });
                if (!cycle && depth < 6) { seen.add(m); rec(m, depth + 1); }
            });
        };
        rec(current, 0);
        const head = `<h4>${esc(t('admin.relAccChainTitle'))}</h4>`;
        if (!lines.length) { box.innerHTML = `${head}<p class="admin-hint">${esc(t('admin.relAccChainNone'))}</p>`; return; }
        box.innerHTML = `${head}<ul class="ra-chain-list"><li class="ra-chain-root">${esc(labelOf(current))}</li>${lines.map((l) => `<li style="margin-left:${(l.depth + 1) * 1.1}rem"><span class="ra-needs">${esc(t('admin.relAccNeeds'))} →</span> ${esc(shortPath(l.key))}${l.cycle ? ` <em>${esc(t('admin.relAccChainAgain'))}</em>` : ''}</li>`).join('')}</ul>`;
    }

    // ---- guardar -----------------------------------------------------------------------------------------------------------------------
    const same = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));
    function isDirty() {
        const base = saved.get(current) || { minimum: new Set(), touches: new Set() };
        return !same(draft.minimum, base.minimum) || !same(draft.touches, base.touches);
    }
    function renderActions() {
        const dirty = isDirty();
        $('ra-summary').textContent = `${plural(draft.minimum.size, 'admin.relAccMin1', 'admin.relAccMinN')} · ${plural(draft.touches.size, 'admin.relAccTou1', 'admin.relAccTouN')}${dirty ? ` · ${t('admin.relAccUnsaved')}` : ''}`;
        $('ra-save').hidden = !canEdit;
        $('ra-save').disabled = !dirty;
        $('ra-discard').hidden = !canEdit;
        $('ra-discard').disabled = !dirty;
    }
    async function save() {
        if (!canEdit || !current || !isDirty()) return;
        const keys = new Set([current, ...draft.minimum, ...draft.touches, ...((saved.get(current) || { minimum: [] }).minimum), ...((saved.get(current) || { touches: [] }).touches)]);
        const labels = {};
        keys.forEach((k) => { labels[k] = shortPath(k); });
        $('ra-save').disabled = true;
        try {
            const res = await fetch('/api/admin/access-relations', {
                method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access: current, minimum: [...draft.minimum], touches: [...draft.touches], labels }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) { showError(body.message || t('admin.relAccSaveError')); Dashboard.showToast(body.message || t('admin.relAccSaveError'), 'warning'); return; }
            showError('');
            if (draft.minimum.size || draft.touches.size) saved.set(current, cloneRel(draft)); else saved.delete(current);
            Dashboard.showToast(t('admin.relAccSaved'), 'success');
            renderList();
            renderChain();
        } catch (err) {
            console.error('Relación de Accesos: failed to save', err);
            showError(t('admin.relAccSaveError'));
        } finally {
            renderActions();
        }
    }

    // ---- eventos -----------------------------------------------------------------------------------------------------------------------
    $('ra-search').addEventListener('input', (event) => { listQuery = event.target.value; renderList(); });
    $('ra-list').addEventListener('click', (event) => {
        const btn = event.target.closest('.ra-item');
        if (btn) selectAccess(btn.dataset.key);
    });
    $('ra-tree-search').addEventListener('input', (event) => { treeQuery = event.target.value; renderTree(); });
    $('ra-tree-body').addEventListener('click', (event) => {
        const caret = event.target.closest('.ra-caret');
        if (caret) {
            const key = caret.dataset.key;
            if (open.has(key)) open.delete(key); else open.add(key);
            renderTree();
        }
    });
    $('ra-tree-body').addEventListener('change', (event) => {
        const chk = event.target.closest('.ra-chk');
        if (!chk || !canEdit) return;
        toggleMark(chk.dataset.key, chk.dataset.kind);
        renderTree();
        renderChain();
        renderActions();
    });
    $('ra-save').addEventListener('click', save);
    $('ra-discard').addEventListener('click', () => { draft = cloneRel(saved.get(current)); renderTree(); renderChain(); renderActions(); });
    document.addEventListener('dashboard:language-changed', () => { labelCache.clear(); renderList(); if (current) selectAccess(current); });

    // Historial de cambios: todos los cambios de relaciones (esta pantalla no es una tabla de datos, no tiene la barra de iconos de las tablas).
    $('ra-history').addEventListener('click', () => Dashboard.openChangeHistoryWithRows(t('main.changeHistoryTitle'), Dashboard.saasTableChangesLoader('relacion-accesos')));

    (async function init() {
        try {
            const role = await Dashboard.initDashboard({ activePage: 'admin-relacion-accesos' });
            if (!role) return;
            await load();
        } catch (err) {
            console.error('Relación de Accesos failed to initialize:', err);
        }
    })();
})();
