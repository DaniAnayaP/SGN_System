// ---------------------------------------------------------------------------
// Relación Código: "Cargar por plantilla". Muchas relaciones a la vez: se baja una plantilla de Excel (Código SKU, Centro de Costos, Almacén, Sub almacén, Zona, Estante, Nivel y Espacio, con una hoja
// de Opciones con los nombres que existen), se llena y se sube (o se pegan las filas copiadas de Excel). Una fila = un lugar de un código (un código en varios lugares lleva varias filas).
// Una fila crea una relación nueva o COMPLETA la relación «A medias» que el código ya tiene (la que quedó con centro, almacén y sub almacén pero sin lugar), así que cargar primero los códigos
// y después sus lugares no deja filas repetidas. El Localizador (siempre con las 7 piezas: Z006.H005.A005.N003.C001.F001.P001 = zona 6, huella 5, activo A5, nivel 3, columna 1, fila 1, profundidad 1) reúne todo el lugar en una celda.
// Antes de cargar la ventana revisa CADA fila con la regla de public/RelTemplate.js: cada dato con error sale en rojo con su motivo y se corrige ahí mismo; una fila se puede quitar; las que no se
// cargan bajan en un Excel con su motivo. El servidor vuelve a revisar cada fila como si fuera una relación hecha a mano. Con un solo centro de costos marcado arriba, las filas sin centro se cargan en él.
// OpCentroDistRelacionCodigo.js llama a window.RelTemplateUi.mount(...) al armar su botón "+ Nueva Relación".
// ---------------------------------------------------------------------------
(function () {
    const TABLE_KEY = 'relacion-codigo';
    const API = '/api/business/code-relations';
    const TPL_COL = 'colRelTemplateAuth';
    const R = window.RelTemplate;
    const X = window.SimpleXlsx;
    const T = window.SkuTemplate; // solo para leer el texto pegado (parseDelimited)
    const COLS = R.COLUMNS;

    const t = (key, params) => {
        let text = Dashboard.t(key);
        Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
        return text;
    };
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const $ = (id) => document.getElementById(id);
    const en = () => Dashboard.lang === 'en';
    const header = (c) => (en() ? c.en : c.es);
    const errText = (err) => t(`main.relTplErr_${err.code}`, err.params);

    let modalEl = null;
    let onLoaded = null;
    let ctx = null;          // lo que se necesita para revisar: catálogos, Layouts por centro, lo ocupado y lo que ya existe
    let rows = [];           // [{ n, v, out, err, plan, fixed, tr }]
    let mode = 'file';
    let busy = false;
    let result = null;
    let filterBad = false;
    // Sin límite de filas por archivo: la tabla de revisión dibuja de a PAGE filas (las que tienen error siempre se dibujan) y la carga viaja al servidor en tandas de BATCH.
    const PAGE = 300;
    const BATCH = R.MAX_ROWS;
    let shown = PAGE;
    let progress = null;

    // ---- botón en la barra de la tabla -------------------------------------------------------------------------------------------------
    function mount(toolbar, newButton, done) {
        if (!Dashboard.canEditField(TABLE_KEY, TPL_COL, '')) return; // sin la hoja del árbol no sale
        if (toolbar.querySelector('.data-table-template-btn')) return;
        onLoaded = done;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'data-table-template-btn';
        btn.setAttribute('data-help-key', 'relTplButton');
        btn.innerHTML = `<i class="bx bx-upload" aria-hidden="true"></i><span data-i18n="main.tplButton">${esc(t('main.tplButton'))}</span>`;
        btn.addEventListener('click', open);
        if (newButton) { newButton.style.marginRight = '0.5rem'; newButton.after(btn); } else toolbar.prepend(btn);
    }

    // ---- plantilla para bajar ---------------------------------------------------------------------------------------------------------
    const EXAMPLE = { sku: '195201', locator: 'Z001.H001.A001.N002.C003.F001.P001', center: 'CMCCCDC', warehouse: 'Almacén General', sub: 'Medicamentos', zone: 'Zona 1', footprint: 'R-01', rack: 'R-01', level: '2', slot: '3', row: '1', depth: '1', classification: 'Producto Activo' };
    // la fila de ejemplo de la plantilla usa el Localizador (las columnas Zona a Espacio son la otra forma de decir lo mismo y no se llenan junto con él)
    const EXAMPLE_ROW = { sku: '195201', locator: 'Z001.H001.A001.N002.C003.F001.P001', classification: 'Producto Activo', center: 'CMCCCDC', warehouse: 'Almacén General', sub: 'Medicamentos' };
    const LETTER = { rack: 'A', rackpal: 'R', cabinet: 'G', pallet: 'T' }; // el mismo mapa de RelTemplate.ASSET_TYPES al revés: tipo de espacio del Layout -> letra del Localizador
    const pad3 = (n) => String(n).padStart(3, '0');
    const zoneNo = (name) => { const m = String(name || '').match(/(\d+)\s*$/); return m ? Number(m[1]) : null; };
    const spaceNo = (code) => { const m = String(code || '').match(/(\d+)\s*$/); return m ? Number(m[1]) : null; };
    function optionsSheet() {
        const rowsOut = [[t('main.colRelCentroCostos'), t('main.colRelAlmacen'), t('main.colRelSubAlmacen'), t('main.colRelZona'), t('main.colRelHuella'), t('main.colRelEstante'), t('main.relTplLevels'), t('main.relTplSlots'), t('main.relTplLocatorShort')]];
        ctx.options.warehouses.filter((w) => w.status === 'active').forEach((w) => {
            const center = ctx.options.costCenters.find((c) => c.id === w.parentId);
            if (!center) return;
            const subs = ctx.options.subWarehouses.filter((s) => s.parentId === w.id && s.status === 'active');
            if (!subs.length) rowsOut.push([center.name, w.name, '', '', '', '', '', '', '']);
            subs.forEach((s) => {
                if (s.kind !== 'physical') { rowsOut.push([center.name, w.name, s.name, '', '', '', '', '', '']); return; }
                const zones = (ctx.options.zonesByCenter[center.id] || []).filter((z) => (s.locations || []).some((e) => e.zoneId === z.id));
                if (!zones.length) rowsOut.push([center.name, w.name, s.name, '', '', '', '', '', '']);
                zones.forEach((z) => {
                    const entry = s.locations.find((e) => e.zoneId === z.id);
                    const racks = z.spaces.filter((sp) => !entry.spaceIds.length || entry.spaceIds.includes(sp.id));
                    if (!racks.length) rowsOut.push([center.name, w.name, s.name, z.name, '', '', '', '', '']);
                    // por cada activo: su huella y las tres primeras piezas del Localizador (zona, huella y activo); el nivel, la columna, la fila y la profundidad se completan en el Excel
                    racks.forEach((sp) => {
                        const fp = (z.footprints || []).find((f) => f.id === sp.footprintId);
                        const base = zoneNo(z.code || z.name) && fp && spaceNo(fp.code) && LETTER[sp.type] && spaceNo(sp.code) ? `Z${pad3(zoneNo(z.code || z.name))}.H${pad3(spaceNo(fp.code))}.${LETTER[sp.type]}${pad3(spaceNo(sp.code))}` : '';
                        rowsOut.push([center.name, w.name, s.name, z.name, fp ? fp.code : '', sp.code, sp.levels || 1, sp.slots || 1, base]);
                    });
                });
            });
        });
        return rowsOut;
    }
    function downloadTemplate() {
        const bytes = X.writeXlsx([
            { name: t('main.tplSheetTemplate'), rows: [COLS.map(header), COLS.map((c) => EXAMPLE_ROW[c.key] || '')], widths: COLS.map((c) => Math.max(16, header(c).length + 4)), headerRow: true, textColumns: COLS.map((c, i) => i) },
            {
                name: t('main.tplSheetHelp'),
                rows: [
                    [t('main.tplInstColumn'), t('main.tplInstRequired'), t('main.tplInstWhat'), t('main.tplInstExample')],
                    ...COLS.map((c) => [header(c), c.required ? t('main.tplYes') : t('main.tplNo'), t(`main.relTplInst_${c.key}`), EXAMPLE[c.key]]),
                    ['', '', '', ''],
                    [t('main.relTplRulesTitle'), '', t('main.relTplRule1'), ''],
                    ['', '', t('main.relTplRule2'), ''],
                    ['', '', t('main.relTplRule3'), ''],
                    ['', '', t('main.relTplRule4'), ''],
                ],
                widths: [24, 16, 100, 26], headerRow: true,
            },
            { name: t('main.relTplSheetOptions'), rows: optionsSheet(), widths: [32, 28, 28, 22, 14, 14, 10, 18, 26], headerRow: true },
        ]);
        saveBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${t('main.relTplFileName')}.xlsx`);
    }
    function saveBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // ---- ventana ---------------------------------------------------------------------------------------------------------------------
    function ensureModal() {
        if (modalEl) return;
        modalEl = document.createElement('div');
        modalEl.className = 'modal-overlay';
        modalEl.id = 'tpl-modal';
        modalEl.hidden = true;
        const head = COLS.map((c) => `<th data-k="${c.key}">${esc(header(c))}</th>`).join('');
        modalEl.innerHTML = `<div class="modal-panel tpl-dialog" role="dialog" aria-modal="true" aria-labelledby="tpl-title">
            <h3 id="tpl-title">${esc(t('main.relTplTitle'))}</h3>
            <div id="tpl-flow">
                <section class="tpl-blk">
                    <h4><span class="tpl-n">1</span>${esc(t('main.tplStep1'))}</h4>
                    <div><button type="button" class="btn btn-secondary" id="tpl-download" data-help-key="relTplDownload"><i class="bx bx-download" aria-hidden="true"></i> ${esc(t('main.tplDownload'))}</button></div>
                </section>
                <section class="tpl-blk">
                    <h4><span class="tpl-n">2</span>${esc(t('main.tplStep2'))}</h4>
                    <div class="tpl-seg" role="group"><button type="button" id="tpl-mode-file" aria-pressed="true" data-help-key="tplUpload">${esc(t('main.tplModeFile'))}</button><button type="button" id="tpl-mode-paste" aria-pressed="false" data-help-key="tplPaste">${esc(t('main.tplModePaste'))}</button></div>
                    <div id="tpl-file-box" class="tpl-drop"><span id="tpl-file-name" class="tpl-muted"></span><button type="button" class="btn btn-secondary" id="tpl-pick">${esc(t('main.tplChooseFile'))}</button><input type="file" id="tpl-file" accept=".xlsx,.csv,.tsv,.txt" hidden></div>
                    <div id="tpl-paste-box" hidden><textarea id="tpl-paste" spellcheck="false" placeholder="${esc(t('main.tplPastePlaceholder'))}"></textarea><div><button type="button" class="btn btn-secondary" id="tpl-paste-go">${esc(t('main.tplPasteGo'))}</button></div></div>
                    <div id="tpl-center" class="tpl-muted"></div>
                    <div id="tpl-info" class="tpl-muted" aria-live="polite"></div>
                </section>
                <section class="tpl-blk" id="tpl-review" hidden>
                    <h4><span class="tpl-n">3</span>${esc(t('main.tplStep3'))}</h4>
                    <div class="tpl-bar">
                        <div class="tpl-counts" aria-live="polite"><span class="tpl-cnt" id="tpl-c-total"></span><span class="tpl-cnt tpl-cnt-ok" id="tpl-c-new" hidden></span><span class="tpl-cnt tpl-cnt-info" id="tpl-c-upd" hidden></span><span class="tpl-cnt tpl-cnt-info" id="tpl-c-rec" hidden></span><span class="tpl-cnt tpl-cnt-gone" id="tpl-c-same" hidden></span><span class="tpl-cnt tpl-cnt-bad" id="tpl-c-bad"></span><span class="tpl-cnt tpl-cnt-gone" id="tpl-c-gone" hidden></span></div>
                        <div class="tpl-bar-right"><button type="button" class="btn btn-secondary tpl-small" id="tpl-next" data-help-key="tplNext"><i class="bx bx-down-arrow-alt" aria-hidden="true"></i> ${esc(t('main.tplNextError'))}</button>
                        <div class="tpl-seg" role="group"><button type="button" id="tpl-f-all" aria-pressed="true">${esc(t('main.tplAll'))}</button><button type="button" id="tpl-f-bad" aria-pressed="false">${esc(t('main.tplOnlyErrors'))}</button></div></div>
                    </div>
                    <div class="tpl-scroll" data-help-key="relTplReview"><table class="tpl-table"><thead><tr><th>${esc(t('main.tplColRow'))}</th><th>${esc(t('main.tplColState'))}</th>${head}<th>${esc(t('main.tplColWhat'))}</th><th></th></tr></thead><tbody id="tpl-body"></tbody></table></div>
                    <div class="tpl-more" id="tpl-more" hidden><span class="tpl-muted" id="tpl-more-text"></span><button type="button" class="btn btn-secondary tpl-small" id="tpl-more-btn"></button></div>
                </section>
            </div>
            <div id="tpl-result" class="tpl-result" hidden></div>
            <div class="tpl-foot"><span class="tpl-muted" id="tpl-msg"></span><button type="button" class="btn btn-secondary" id="tpl-cancel">${esc(t('main.whClose'))}</button><button type="button" class="btn" id="tpl-go" data-help-key="relTplLoad" disabled></button></div>
        </div>`;
        document.body.appendChild(modalEl);

        modalEl.addEventListener('click', (event) => {
            if (event.target === modalEl || event.target.closest('#tpl-cancel')) { close(); return; }
            if (event.target.closest('#tpl-download')) { downloadTemplate(); return; }
            if (event.target.closest('#tpl-mode-file')) { setMode('file'); return; }
            if (event.target.closest('#tpl-mode-paste')) { setMode('paste'); return; }
            if (event.target.closest('#tpl-pick')) { $('tpl-file').click(); return; }
            if (event.target.closest('#tpl-paste-go')) { loadMatrix(T.parseDelimited($('tpl-paste').value)); return; }
            if (event.target.closest('#tpl-f-all')) { setFilter(false); return; }
            if (event.target.closest('#tpl-f-bad')) { setFilter(true); return; }
            if (event.target.closest('#tpl-next')) { goToNextError(); return; }
            if (event.target.closest('#tpl-go')) { onGo(); return; }
            if (event.target.closest('#tpl-more-btn')) { shown += PAGE; buildTable(); refresh(); return; }
            const rm = event.target.closest('[data-rm]');
            if (rm) { const r = rows[Number(rm.dataset.rm)]; r.out = !r.out; refresh(); }
        });
        $('tpl-file').addEventListener('change', async (event) => {
            const file = event.target.files && event.target.files[0];
            event.target.value = '';
            if (file) await handleFile(file);
        });
        $('tpl-paste').addEventListener('paste', () => setTimeout(() => { if ($('tpl-paste').value.trim()) loadMatrix(T.parseDelimited($('tpl-paste').value)); }, 50));
        $('tpl-body').addEventListener('input', (event) => {
            const el = event.target;
            if (!el.dataset.k) return;
            const r = rows[Number(el.dataset.i)];
            r.v[el.dataset.k] = el.value;
            const had = !!r.err;
            validateAll();
            if (had && !r.err) r.fixed = true;
            paintAll();
            updateCounts();
        });
    }
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modalEl && !modalEl.hidden && !busy) close(); });

    async function open() {
        ensureModal();
        ctx = null;
        rows = [];
        result = null;
        setMode('file');
        setInfo('', false);
        $('tpl-center').textContent = '';
        $('tpl-file-name').textContent = '';
        $('tpl-paste').value = '';
        $('tpl-review').hidden = true;
        $('tpl-flow').hidden = false;
        $('tpl-result').hidden = true;
        $('tpl-cancel').textContent = t('main.whClose');
        updateCounts();
        modalEl.hidden = false;
        try {
            const get = (url) => fetch(url, { credentials: 'include' }).then((r) => { if (!r.ok) throw new Error(url); return r.json(); });
            const [options, skus, list] = await Promise.all([get(`${API}/options`), get(`${API}/skus?all=1`), get(API)]);
            const items = skus.skus || [];
            const bySku = new Map(items.map((i) => [Number(i.sku), i]));
            const byUpc = new Map(items.filter((i) => i.upc).map((i) => [i.upc, i]));
            const placeKey = (r) => [r.skuItemId, r.costCenterId, r.warehouseId, r.subWarehouseId || 0, r.zoneId || '', r.spaceId || '', r.level || 0, r.slot || 0, r.row || 0, r.depth || 0].join('|');
            const existing = new Map((list.relations || []).map((r) => [placeKey(r), { id: r.id, classification: r.classification || 'activo' }]));
            const occupied = new Map((options.occupied || []).map((o) => [`${o.spaceId}|${o.level}|${o.slot}|${o.row || 1}|${o.depth || 1}`, o.sku]));
            const byItem = new Map();
            (list.relations || []).forEach((r) => { if (!byItem.has(r.skuItemId)) byItem.set(r.skuItemId, []); byItem.get(r.skuItemId).push(r); });
            ctx = { options, bySku, byUpc, existing, occupied, byItem };
            const hasWarehouse = (options.warehouses || []).some((w) => w.status === 'active');
            if (!hasWarehouse) setInfo(t('main.relTplNoWarehouses'), true);
            const selected = Dashboard.getSelectedCostCenterIds();
            const one = selected && selected.length === 1 ? (options.costCenters || []).find((c) => c.id === selected[0]) : ((options.costCenters || []).length === 1 ? options.costCenters[0] : null);
            $('tpl-center').textContent = one ? t('main.relTplCenterOne', { center: one.name }) : t('main.relTplCenterMany');
        } catch (err) {
            console.error('Plantilla de Relación Código: no se pudieron cargar los catálogos', err);
            Dashboard.showToast(t('main.tplLoadError'), 'error');
            close();
        }
    }
    function close() {
        if (busy) return;
        if (modalEl) modalEl.hidden = true;
    }
    function setMode(next) {
        mode = next;
        $('tpl-mode-file').setAttribute('aria-pressed', String(next === 'file'));
        $('tpl-mode-paste').setAttribute('aria-pressed', String(next === 'paste'));
        $('tpl-file-box').hidden = next !== 'file';
        $('tpl-paste-box').hidden = next !== 'paste';
    }
    function setInfo(text, isError) {
        $('tpl-info').textContent = text;
        $('tpl-info').classList.toggle('tpl-error', !!isError);
    }

    // ---- leer el archivo o lo pegado ---------------------------------------------------------------------------------------------------
    async function handleFile(file) {
        if (file.size > 5 * 1024 * 1024) { setInfo(t('main.tplReadError'), true); return; }
        const name = file.name.toLowerCase();
        try {
            let matrix;
            if (name.endsWith('.xlsx')) matrix = await X.readXlsx(await file.arrayBuffer());
            else if (/\.(csv|tsv|txt)$/.test(name)) matrix = T.parseDelimited(await file.text());
            else { setInfo(t('main.tplReadError'), true); return; }
            $('tpl-file-name').textContent = file.name;
            loadMatrix(matrix);
        } catch (err) {
            console.error('Plantilla de Relación Código: no se pudo leer el archivo', err);
            setInfo(t(err && err.message === 'no-decompression' ? 'main.tplNoXlsxSupport' : 'main.tplReadError'), true);
        }
    }
    function loadMatrix(matrix) {
        if (!ctx) return;
        const res = R.rowsFromMatrix(matrix);
        const ignored = (res.ignored || []).length ? ` · ${t('main.tplIgnored', { list: res.ignored.slice(0, 6).join(', ') })}` : '';
        if (res.error === 'empty') { setInfo(t('main.tplNoRows'), true); return; }
        if (res.error === 'columns') { setInfo(t('main.tplNoColumns'), true); return; }
        if (res.error === 'sku' || res.error === 'warehouse') { setInfo(t('main.relTplNeedColumns') + ignored, true); $('tpl-review').hidden = true; return; }
        if (!res.rows.length) { setInfo(t('main.tplNoRows'), true); return; }
        rows = res.rows.map((r) => ({ n: r.n, v: r.v, out: false, err: null, plan: null, fixed: false, tr: null }));
        setInfo(`${t('main.tplFileInfo', { rows: rows.length, cols: res.usedKeys.length })}${ignored}`, false);
        shown = PAGE;
        validateAll();
        buildTable();
        setFilterButtons(false);
        refresh();
        $('tpl-review').hidden = false;
    }

    // ---- tabla de revisión -------------------------------------------------------------------------------------------------------------
    function buildTable() {
        const draw = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => i < shown || r.err);
        $('tpl-body').innerHTML = draw.map(({ r, i }) => `<tr data-i="${i}"><td>${r.n}</td><td><span class="tpl-tag"></span></td>${COLS.map((c) => `<td data-k="${c.key}"><input type="text" data-i="${i}" data-k="${c.key}" value="${esc(r.v[c.key])}" aria-label="${esc(header(c))} ${r.n}"></td>`).join('')}<td class="tpl-what"></td><td><button type="button" class="btn btn-secondary tpl-small" data-rm="${i}"></button></td></tr>`).join('');
        rows.forEach((r) => { r.tr = null; });
        draw.forEach(({ r }, k) => { r.tr = $('tpl-body').children[k]; });
        updateMore();
    }
    function updateMore() {
        const drawn = rows.filter((r) => r.tr).length;
        const left = rows.length - drawn;
        $('tpl-more').hidden = left <= 0;
        if (left > 0) {
            $('tpl-more-text').textContent = t('main.tplShowing', { shown: drawn, total: rows.length });
            $('tpl-more-btn').textContent = t('main.tplShowMore', { n: Math.min(PAGE, left) });
        }
    }
    function validateAll() {
        const accepted = new Map();
        const selected = Dashboard.getSelectedCostCenterIds();
        const local = {
            centers: ctx.options.costCenters || [], selectedIds: selected,
            warehouses: ctx.options.warehouses || [], subWarehouses: ctx.options.subWarehouses || [], zonesByCenter: ctx.options.zonesByCenter || {},
            itemBySku: (n) => ctx.bySku.get(n) || null, itemByUpc: (upc) => ctx.byUpc.get(upc) || null,
            occupiedBy: (spaceId, level, slot, row, depth) => ctx.occupied.get(`${spaceId}|${level}|${slot}|${row || 1}|${depth || 1}`) || '',
            existingRelation: (key) => ctx.existing.get(key) || null,
            relationsOf: (itemId) => ctx.byItem.get(itemId) || [],
            priorRowWithKey: (key, row) => { const n = accepted.get(key); return n && n !== row.n ? n : 0; },
        };
        rows.forEach((r) => {
            if (r.out) { r.plan = null; r.err = null; return; }
            r.plan = R.planRow(r, local);
            r.err = r.plan.error || null;
            if (!r.err && (r.plan.action === 'create' || r.plan.action === 'complete' || r.plan.action === 'reclass')) { accepted.set(r.plan.keys.place, r.n); if (r.plan.keys.slot) accepted.set(r.plan.keys.slot, r.n); if (r.plan.keys.claim) accepted.set(r.plan.keys.claim, r.n); }
        });
    }
    const routeText = (plan) => [...plan.route, plan.values.level ? t('main.relLevelN', { n: plan.values.level }) : '', plan.values.slot ? t('main.relSlotN', { n: plan.values.slot }) : '', plan.values.row ? t('main.relRowN', { n: plan.values.row }) : '', plan.values.depth ? t('main.relDepthN', { n: plan.values.depth }) : ''].filter(Boolean).join(' › ');
    function paintRow(r) {
        const tr = r.tr;
        const tag = tr.querySelector('.tpl-tag');
        const what = tr.querySelector('.tpl-what');
        const btn = tr.querySelector('[data-rm]');
        const plan = r.plan;
        tr.classList.toggle('tpl-gone', r.out || (plan && plan.action === 'same'));
        tr.querySelectorAll('input').forEach((input) => {
            input.classList.toggle('tpl-bad', !!(r.err && r.err.field === input.dataset.k));
            input.disabled = r.out;
        });
        const set = (tagClass, tagText, whatClass, whatText, btnText) => {
            tag.className = `tpl-tag ${tagClass}`; tag.textContent = tagText;
            what.className = `tpl-what ${whatClass}`; what.textContent = whatText;
            btn.textContent = btnText;
        };
        const remove = t('main.tplRemoveRow');
        if (r.out) set('tpl-tag-grey', t('main.tplStateRemoved'), 'tpl-what-grey', t('main.tplRemovedHint'), t('main.tplRestoreRow'));
        else if (r.err) {
            const dup = r.err.code === 'occupied' || r.err.code === 'occupiedInFile' || r.err.code === 'duplicateInFile';
            set('tpl-tag-bad', t(dup ? 'main.tplStateRepeated' : 'main.tplStateInvalid'), 'tpl-what-bad', errText(r.err), remove);
        } else if (plan.action === 'same') set('tpl-tag-grey', t('main.relTplStateExists'), 'tpl-what-grey', t('main.relTplExistsMsg'), remove);
        else if (plan.action === 'reclass') set('tpl-tag-info', t('main.relTplStateReclass'), 'tpl-what-info', t('main.relTplWillReclass', { from: t(`main.relClass_${plan.from}`), to: t(`main.relClass_${plan.to}`), route: routeText(plan) }), remove);
        else if (plan.action === 'complete') set('tpl-tag-info', t('main.relTplStateComplete'), 'tpl-what-info', t('main.relTplWillComplete', { route: routeText(plan) }), remove);
        else set('tpl-tag-ok', t('main.relTplStateNew'), 'tpl-what-ok', t(plan.located ? 'main.relTplWillLocated' : 'main.relTplWillPartial', { route: routeText(plan) }), remove);
        tr.hidden = filterBad && !r.err;
    }
    function paintAll() { rows.forEach((r) => { if (r.tr) paintRow(r); }); }
    function counts() {
        const c = { create: 0, complete: 0, reclass: 0, same: 0, bad: 0, gone: 0 };
        rows.forEach((r) => {
            if (r.out) c.gone += 1;
            else if (r.err) c.bad += 1;
            else if (r.plan.action === 'create') c.create += 1;
            else if (r.plan.action === 'complete') c.complete += 1;
            else if (r.plan.action === 'reclass') c.reclass += 1;
            else c.same += 1;
        });
        return c;
    }
    function updateCounts() {
        const c = counts();
        const put = (id, n, key) => { const el = $(id); el.innerHTML = `<b>${n}</b> ${esc(t(key))}`; el.hidden = n === 0; };
        $('tpl-c-total').textContent = t('main.tplRows', { n: rows.length });
        put('tpl-c-new', c.create, 'main.relTplCountNew');
        put('tpl-c-upd', c.complete, 'main.relTplCountComplete');
        put('tpl-c-rec', c.reclass, 'main.relTplCountReclass');
        const ok = c.create + c.complete + c.reclass;
        put('tpl-c-same', c.same, 'main.relTplCountExists');
        $('tpl-c-bad').innerHTML = `<b>${c.bad}</b> ${esc(t('main.tplWithError'))}`;
        $('tpl-c-bad').hidden = c.bad === 0;
        put('tpl-c-gone', c.gone, 'main.tplRemoved');
        $('tpl-next').disabled = c.bad === 0;
        const go = $('tpl-go');
        go.textContent = busy ? (progress ? t('main.tplLoadingProgress', { done: progress.done, total: progress.total }) : t('main.tplLoading')) : t(ok === 1 ? 'main.relTplLoadOne' : 'main.relTplLoadN', { n: ok });
        go.disabled = busy || ok === 0 || !!result;
        go.hidden = !!result && result.done;
        const skipped = rows.length - ok;
        $('tpl-msg').textContent = !rows.length || result ? '' : (skipped === 0 ? t('main.tplAllReady') : t('main.tplFooter', { ok, total: rows.length }));
    }
    function refresh() { validateAll(); paintAll(); updateCounts(); }
    function setFilterButtons(bad) {
        filterBad = bad;
        $('tpl-f-all').setAttribute('aria-pressed', String(!bad));
        $('tpl-f-bad').setAttribute('aria-pressed', String(bad));
    }
    function setFilter(bad) { setFilterButtons(bad); paintAll(); }
    function goToNextError() {
        const r = rows.find((x) => x.err && !x.out);
        if (!r) return;
        if (!r.tr) { buildTable(); paintAll(); }
        r.tr.hidden = false;
        const input = r.tr.querySelector(`input[data-k="${r.err.field}"]`);
        if (input) { input.scrollIntoView({ block: 'nearest', inline: 'center' }); input.focus(); input.select(); }
    }

    // ---- cargar ---------------------------------------------------------------------------------------------------------------------------
    function reasonNotLoaded(r) {
        if (r.out) return t('main.tplRemovedHint');
        if (r.err) return errText(r.err);
        if (r.plan && r.plan.action === 'same') return t('main.relTplExistsMsg');
        return '';
    }
    async function onGo() {
        if (result && result.done) return;
        const good = rows.filter((r) => !r.out && !r.err && r.plan && (r.plan.action === 'create' || r.plan.action === 'complete' || r.plan.action === 'reclass'));
        if (!good.length || busy) return;
        busy = true;
        progress = { done: 0, total: good.length };
        updateCounts();
        const created = [];
        const completed = [];
        const serverFailed = new Map(); // lo que el servidor no aceptó (alguien más ocupó el espacio mientras se revisaba, un permiso que falta…)
        let interrupted = '';
        const stop = (message, status) => { Dashboard.showToast(message, status === 403 ? 'warning' : 'error'); busy = false; progress = null; updateCounts(); };
        for (let from = 0; from < good.length; from += BATCH) {
            const chunk = good.slice(from, from + BATCH);
            try {
                const res = await fetch(`${API}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ rows: chunk.map((r) => ({ n: r.n, values: r.plan.values, ...(r.plan.action === 'complete' ? { relationId: r.plan.relationId } : {}), ...(r.plan.action === 'reclass' ? { relationId: r.plan.relationId, reclass: true, values: { classification: r.plan.to } } : {}) })) }) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    if (from === 0) { stop(json.message || t('main.tplLoadError'), res.status); return; }
                    interrupted = json.message || t('main.tplLoadError');
                    break;
                }
                created.push(...(json.created || []));
                completed.push(...(json.updated || []));
                (json.failed || []).forEach((f) => serverFailed.set(chunk[f.index].n, f));
                progress.done = from + chunk.length;
                updateCounts();
            } catch (err) {
                console.error('Plantilla de Relación Código: no se pudo cargar', err);
                if (from === 0) { stop(t('main.tplLoadError')); return; }
                interrupted = t('main.tplLoadError');
                break;
            }
        }
        const unsent = new Set(good.slice(progress.done).map((r) => r.n));
        result = { done: true, created, completed, notLoaded: [] };
        rows.forEach((r) => {
            if (serverFailed.has(r.n)) result.notLoaded.push({ r, reason: serverFailed.get(r.n).message });
            else if (unsent.has(r.n)) result.notLoaded.push({ r, reason: t('main.tplInterrupted') });
            else { const reason = reasonNotLoaded(r); if (reason) result.notLoaded.push({ r, reason }); }
        });
        busy = false;
        progress = null;
        if (interrupted) Dashboard.showToast(interrupted, 'error');
        showResult();
        if (onLoaded) await onLoaded();
    }
    function showResult() {
        const { created, completed } = result;
        const skipped = result.notLoaded.length;
        const loaded = created.length + completed.length;
        $('tpl-flow').hidden = true;
        const box = $('tpl-result');
        const title = t(loaded === 1 ? 'main.relTplResultOne' : 'main.relTplResultN', { n: loaded });
        const detail = completed.length ? t('main.relTplResultDetail', { c: created.length, u: completed.length }) : '';
        const tail = (skipped ? t(skipped === 1 ? 'main.tplResultSkippedOne' : 'main.tplResultSkipped', { n: skipped }) : t('main.tplResultAll')).replace(/^\s*·\s*/, '');
        box.innerHTML = `<div class="tpl-result-main"><span class="tpl-ok-badge"><i class="bx bx-check" aria-hidden="true"></i></span><div><b>${esc(title)}</b><span>${esc(detail + tail)}</span></div></div>
            <div class="tpl-result-actions">${skipped ? `<button type="button" class="btn btn-secondary" id="tpl-dl-errors"><i class="bx bx-download" aria-hidden="true"></i> ${esc(t(skipped === 1 ? 'main.tplDownloadErrorsOne' : 'main.tplDownloadErrors', { n: skipped }))}</button>` : ''}<button type="button" class="btn btn-secondary" id="tpl-again">${esc(t('main.tplLoadAnother'))}</button></div>`;
        box.hidden = false;
        $('tpl-cancel').textContent = t('main.whClose');
        updateCounts();
        const dl = $('tpl-dl-errors');
        if (dl) dl.addEventListener('click', downloadNotLoaded);
        $('tpl-again').addEventListener('click', () => { result = null; open(); });
    }
    function downloadNotLoaded() {
        const bytes = X.writeXlsx([{
            name: t('main.tplSheetNotLoaded'),
            rows: [[t('main.tplColRow'), ...COLS.map(header), t('main.tplColReason')], ...result.notLoaded.map(({ r, reason }) => [r.n, ...COLS.map((c) => r.v[c.key] || ''), reason])],
            widths: [8, ...COLS.map((c) => Math.max(14, header(c).length + 4)), 70], headerRow: true, textColumns: COLS.map((c, i) => i + 1),
        }]);
        saveBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${t('main.tplErrorsFileName')}.xlsx`);
    }

    window.RelTemplateUi = { mount };
}());
