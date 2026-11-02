// ---------------------------------------------------------------------------
// Alta Nuestros Artículos: "Cargar por plantilla". Muchos artículos a la vez: se baja una plantilla de Excel (todas las columnas de llenado), se llena y se sube (o se pegan las filas
// copiadas de Excel). Al subirla se ELIGEN las columnas que se cargan (una columna sin marcar no se carga ni cambia nada) y cada fila se reconoce por su SKU (el registro único de cada
// código) o, si no lo trae, por su UPC: si el código ya existe se ACTUALIZA la misma línea (lo vacío nunca borra; un código ya completo no se toca, se corrige en Edición Código) y si no
// existe se da de alta, aunque traiga solo el UPC (lo demás se llena después). Antes de cargar la ventana revisa CADA fila con la regla de public/SkuTemplate.js (planRow, la misma que vuelve
// a aplicar el servidor): cada dato con error sale en rojo con su motivo y se corrige ahí mismo; una fila se puede quitar; las que no se cargan bajan en un Excel con su motivo. Los artículos
// nuevos no llevan fotos, así que quedan sin código QR hasta tenerlas (el QR se genera solo cuando el artículo tiene sus 24 datos). Solo Web.
// OpCentroDistAltaArticulos.js llama a window.SkuTemplateUi.mount(...) al armar su botón "+ Nuevo Artículo".
// ---------------------------------------------------------------------------
(function () {
    const TABLE_KEY = 'nuestros-articulos';
    const API = '/api/business/sku-items';
    const TPL_COL = 'colArticuloTemplateAuth';
    const T = window.SkuTemplate;
    const X = window.SimpleXlsx;
    const COLS = T.ALL_COLUMNS;
    const CAT_COLS = COLS.filter((c) => c.kind === 'category');
    const KEY_KEYS = ['sku', 'upc'];

    const t = (key, params) => {
        let text = Dashboard.t(key);
        Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
        return text;
    };
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const $ = (id) => document.getElementById(id);
    const en = () => Dashboard.lang === 'en';
    const header = (c) => (en() ? c.en : c.es);
    // el número tiene su texto según la unidad (centímetros o kilos)
    const errText = (err) => t(`main.tplErr_${err.code === 'number' ? `number_${err.params.unit}` : err.code}`, { ...err.params, label: en() ? err.params.labelEn : err.params.label });

    let modalEl = null;
    let onLoaded = null;
    let ctx = null;          // { udm, categories, classifications, bySku: Map(número -> código), byUpc: Map(upc -> código) }
    let rows = [];           // [{ n, v, out, err, plan, fixed, show }]
    let usedKeys = new Set(); // columnas que trae el archivo
    let selected = new Set(); // columnas que se cargan (las que trae el archivo y se dejaron marcadas)
    let mode = 'file';
    let busy = false;
    let result = null;
    // Sin límite de filas por archivo: la tabla de revisión dibuja de a PAGE filas (las que tienen error siempre se dibujan) y la carga viaja al servidor en tandas de BATCH (su límite por petición).
    const PAGE = 300;
    const BATCH = T.MAX_ROWS;
    let shown = PAGE;
    let progress = null; // { done, total } mientras se carga

    // ---- botón en la barra de la tabla -------------------------------------------------------------------------------------------------
    function mount(toolbar, newButton, done) {
        if (!Dashboard.canEditField(TABLE_KEY, TPL_COL, '')) return; // sin la hoja del árbol no sale
        if (toolbar.querySelector('.data-table-template-btn')) return;
        onLoaded = done;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'data-table-template-btn';
        btn.setAttribute('data-help-key', 'tplButton');
        btn.innerHTML = `<i class="bx bx-upload" aria-hidden="true"></i><span data-i18n="main.tplButton">${esc(t('main.tplButton'))}</span>`;
        btn.addEventListener('click', open);
        newButton.style.marginRight = '0.5rem';
        newButton.after(btn);
    }

    // ---- plantilla para bajar ---------------------------------------------------------------------------------------------------------
    function instruction(c) {
        const options = (list) => (list || []).slice(0, 12).join(', ') || '—';
        if (c.key === 'sku') return [t('main.tplInstSku'), '000123'];
        if (c.key === 'upc') return [t('main.tplInstUpc'), '7501003126410'];
        if (c.kind === 'udm') return [t('main.tplInstUdm', { list: options(ctx && ctx.udm) }), ((ctx && ctx.udm) || [])[0] || ''];
        if (c.kind === 'type') return [t('main.tplInstType'), 'Artículo Terminado'];
        if (c.kind === 'storagetype') return [t('main.tplInstStorage'), 'Por UDM de pallets'];
        if (c.integer) return [t('main.tplInstInteger'), { unitsPerLayer: '30', layersPerPallet: '1', maxStack: '6' }[c.key]];
        if (c.kind === 'number') return [t(c.unit === 'kg' ? 'main.tplInstNumberKg' : 'main.tplInstNumberCm'), { height: '4', length: '11', width: '6', articleWeight: '0.045', packageWeight: '0.060' }[c.key]];
        if (c.kind === 'category') return [t('main.tplInstCategory', { list: options(((ctx && ctx.categories) || {})[c.type]) }), (((ctx && ctx.categories) || {})[c.type] || [])[0] || ''];
        if (c.kind === 'classification') return [t('main.tplInstClass', { list: options(ctx && ctx.classifications && ctx.classifications.all) }), ((ctx && ctx.classifications && ctx.classifications.all) || [])[0] || ''];
        return [t('main.tplInstText'), { uniqueDescription: 'Paracetamol 500 mg tabletas, caja con 20', knownDescription: 'Tempra', customDescription: 'Paracetamol 500 caja' }[c.key] || ''];
    }
    function downloadTemplate() {
        const required = (c) => (c.key === 'upc' ? t('main.tplYesNew') : t('main.tplNo'));
        const bytes = X.writeXlsx([
            { name: t('main.tplSheetTemplate'), rows: [COLS.map(header)], widths: COLS.map((c) => Math.max(14, header(c).length + 4)), headerRow: true, textColumns: [0, 1] },
            {
                name: t('main.tplSheetHelp'),
                rows: [
                    [t('main.tplInstColumn'), t('main.tplInstRequired'), t('main.tplInstWhat'), t('main.tplInstExample')],
                    ...COLS.map((c) => { const [what, example] = instruction(c); return [header(c), required(c), what, example]; }),
                    ['', '', '', ''],
                    [t('main.tplInstRulesTitle'), '', t('main.tplInstRule1'), ''],
                    ['', '', t('main.tplInstRule2'), ''],
                    ['', '', t('main.tplInstRule3'), ''],
                ],
                widths: [30, 18, 90, 36], headerRow: true,
            },
        ]);
        saveBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${t('main.tplFileName')}.xlsx`);
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
        const head = COLS.map((c) => `<th class="tpl-c-${c.kind || 'plain'}${c.kind === 'category' ? ' tpl-cat' : ''}" data-k="${c.key}">${esc(header(c))}</th>`).join('');
        modalEl.innerHTML = `<div class="modal-panel tpl-dialog" role="dialog" aria-modal="true" aria-labelledby="tpl-title">
            <h3 id="tpl-title">${esc(t('main.tplTitle'))}</h3>
            <div id="tpl-flow">
                <section class="tpl-blk">
                    <h4><span class="tpl-n">1</span>${esc(t('main.tplStep1'))}</h4>
                    <div><button type="button" class="btn btn-secondary" id="tpl-download" data-help-key="tplDownload"><i class="bx bx-download" aria-hidden="true"></i> ${esc(t('main.tplDownload'))}</button></div>
                </section>
                <section class="tpl-blk">
                    <h4><span class="tpl-n">2</span>${esc(t('main.tplStep2'))}</h4>
                    <div class="tpl-seg" role="group"><button type="button" id="tpl-mode-file" aria-pressed="true" data-help-key="tplUpload">${esc(t('main.tplModeFile'))}</button><button type="button" id="tpl-mode-paste" aria-pressed="false" data-help-key="tplPaste">${esc(t('main.tplModePaste'))}</button></div>
                    <div id="tpl-file-box" class="tpl-drop"><span id="tpl-file-name" class="tpl-muted"></span><button type="button" class="btn btn-secondary" id="tpl-pick">${esc(t('main.tplChooseFile'))}</button><input type="file" id="tpl-file" accept=".xlsx,.csv,.tsv,.txt" hidden></div>
                    <div id="tpl-paste-box" hidden><textarea id="tpl-paste" spellcheck="false" placeholder="${esc(t('main.tplPastePlaceholder'))}"></textarea><div><button type="button" class="btn btn-secondary" id="tpl-paste-go">${esc(t('main.tplPasteGo'))}</button></div></div>
                    <div id="tpl-info" class="tpl-muted" aria-live="polite"></div>
                </section>
                <section class="tpl-blk" id="tpl-cols" hidden data-help-key="tplColumns">
                    <h4><span class="tpl-n">3</span>${esc(t('main.tplStepCols'))}</h4>
                    <div class="tpl-sub">${esc(t('main.tplColsFile'))}</div>
                    <div class="tpl-pcs" id="tpl-cols-file"></div>
                    <div class="tpl-sub">${esc(t('main.tplColsMissing'))}</div>
                    <div class="tpl-pcs" id="tpl-cols-missing"></div>
                    <div class="tpl-sub">${esc(t('main.tplKeyLabel'))}</div>
                    <div class="tpl-keybox"><span class="tpl-tag tpl-tag-info">${esc(t('main.tplKeyFirst'))}</span><span class="tpl-tag tpl-tag-grey">${esc(t('main.tplKeySecond'))}</span><span class="tpl-muted">${esc(t('main.tplKeyNote'))}</span></div>
                </section>
                <section class="tpl-blk" id="tpl-review" hidden>
                    <h4><span class="tpl-n">4</span>${esc(t('main.tplStep3'))}</h4>
                    <div class="tpl-bar">
                        <div class="tpl-counts" aria-live="polite"><span class="tpl-cnt" id="tpl-c-total"></span><span class="tpl-cnt tpl-cnt-ok" id="tpl-c-new" hidden></span><span class="tpl-cnt tpl-cnt-info" id="tpl-c-upd" hidden></span><span class="tpl-cnt tpl-cnt-gone" id="tpl-c-same" hidden></span><span class="tpl-cnt tpl-cnt-warn" id="tpl-c-done" hidden></span><span class="tpl-cnt tpl-cnt-bad" id="tpl-c-bad"></span><span class="tpl-cnt tpl-cnt-gone" id="tpl-c-gone" hidden></span></div>
                        <div class="tpl-bar-right"><button type="button" class="btn btn-secondary tpl-small" id="tpl-next" data-help-key="tplNext"><i class="bx bx-down-arrow-alt" aria-hidden="true"></i> ${esc(t('main.tplNextError'))}</button>
                        <div class="tpl-seg" role="group"><button type="button" id="tpl-f-all" aria-pressed="true">${esc(t('main.tplAll'))}</button><button type="button" id="tpl-f-bad" aria-pressed="false">${esc(t('main.tplOnlyErrors'))}</button></div></div>
                    </div>
                    <div class="tpl-scroll" data-help-key="tplReview"><table class="tpl-table"><thead><tr><th>${esc(t('main.tplColRow'))}</th><th>${esc(t('main.tplColState'))}</th>${head}<th>${esc(t('main.tplColWhat'))}</th><th></th></tr></thead><tbody id="tpl-body"></tbody></table></div>
                    <div class="tpl-more" id="tpl-more" hidden><span class="tpl-muted" id="tpl-more-text"></span><button type="button" class="btn btn-secondary tpl-small" id="tpl-more-btn"></button></div>
                    <datalist id="tpl-dl-udm"></datalist><datalist id="tpl-dl-class"></datalist><datalist id="tpl-dl-type"><option value="Artículo Terminado"></option><option value="Materia Prima"></option></datalist><datalist id="tpl-dl-storage">${Object.values(window.SkuTemplate.STORAGE_LABELS).map((l) => `<option value="${l}"></option>`).join('')}</datalist>
                    ${CAT_COLS.map((c) => `<datalist id="tpl-dl-${c.type}"></datalist>`).join('')}
                </section>
            </div>
            <div id="tpl-result" class="tpl-result" hidden></div>
            <div class="tpl-foot"><span class="tpl-muted" id="tpl-msg"></span><button type="button" class="btn btn-secondary" id="tpl-cancel">${esc(t('main.whClose'))}</button><button type="button" class="btn" id="tpl-go" data-help-key="tplLoad" disabled></button></div>
        </div>`;
        document.body.appendChild(modalEl);

        modalEl.addEventListener('click', (event) => {
            if (event.target === modalEl || event.target.closest('#tpl-cancel')) { close(); return; }
            if (event.target.closest('#tpl-download')) { downloadTemplate(); return; }
            if (event.target.closest('#tpl-mode-file')) { setMode('file'); return; }
            if (event.target.closest('#tpl-mode-paste')) { setMode('paste'); return; }
            if (event.target.closest('#tpl-pick')) { $('tpl-file').click(); return; }
            if (event.target.closest('#tpl-paste-go')) { loadMatrix(T.parseDelimited($('tpl-paste').value), null); return; }
            if (event.target.closest('#tpl-f-all')) { setFilter(false); return; }
            if (event.target.closest('#tpl-f-bad')) { setFilter(true); return; }
            if (event.target.closest('#tpl-next')) { goToNextError(); return; }
            if (event.target.closest('#tpl-go')) { onGo(); return; }
            if (event.target.closest('#tpl-more-btn')) { shown += PAGE; buildTable(); refresh(); return; }
            const rm = event.target.closest('[data-rm]');
            if (rm) { const r = rows[Number(rm.dataset.rm)]; r.out = !r.out; refresh(); }
        });
        // una columna marcada o desmarcada cambia lo que se carga: la tabla y las cuentas se rehacen al momento
        modalEl.addEventListener('change', (event) => {
            const pick = event.target.closest('[data-pick]');
            if (!pick) return;
            if (pick.checked) selected.add(pick.dataset.pick); else selected.delete(pick.dataset.pick);
            applyColumns();
            refresh();
        });
        $('tpl-file').addEventListener('change', async (event) => {
            const file = event.target.files && event.target.files[0];
            event.target.value = '';
            if (file) await handleFile(file);
        });
        $('tpl-paste').addEventListener('paste', () => setTimeout(() => { if ($('tpl-paste').value.trim()) loadMatrix(T.parseDelimited($('tpl-paste').value), null); }, 50));
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
        usedKeys = new Set();
        selected = new Set();
        result = null;
        setMode('file');
        $('tpl-info').textContent = '';
        $('tpl-info').classList.remove('tpl-error');
        $('tpl-file-name').textContent = '';
        $('tpl-paste').value = '';
        $('tpl-cols').hidden = true;
        $('tpl-review').hidden = true;
        $('tpl-flow').hidden = false;
        $('tpl-result').hidden = true;
        $('tpl-cancel').textContent = t('main.whClose');
        updateCounts();
        modalEl.hidden = false;
        try {
            const [cats, context] = await Promise.all([
                fetch('/api/business/article-categories-active', { credentials: 'include' }).then((r) => r.json()),
                fetch(`${API}/template-context`, { credentials: 'include' }).then((r) => { if (!r.ok) throw new Error('template-context'); return r.json(); }),
            ]);
            const options = (cats && cats.options) || {};
            const items = context.items || [];
            ctx = {
                udm: options.udm || [], categories: Object.fromEntries(CAT_COLS.map((c) => [c.type, options[c.type] || []])),
                classifications: context.classifications || { all: [], byCategory: {} },
                bySku: new Map(items.map((i) => [Number(i.sku), i])), byUpc: new Map(items.filter((i) => i.upc).map((i) => [i.upc, i])),
            };
            fillDatalists();
        } catch (err) {
            console.error('Plantilla: no se pudieron cargar los catálogos', err);
            Dashboard.showToast(t('main.tplLoadError'), 'error');
            close();
        }
    }
    function close() {
        if (busy) return;
        if (modalEl) modalEl.hidden = true;
    }
    function fillDatalists() {
        const fill = (id, list) => { $(id).innerHTML = (list || []).map((n) => `<option value="${esc(n)}"></option>`).join(''); };
        fill('tpl-dl-udm', ctx.udm);
        fill('tpl-dl-class', ctx.classifications.all);
        CAT_COLS.forEach((c) => fill(`tpl-dl-${c.type}`, ctx.categories[c.type]));
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
            loadMatrix(matrix, file);
        } catch (err) {
            console.error('Plantilla: no se pudo leer el archivo', err);
            setInfo(t(err && err.message === 'no-decompression' ? 'main.tplNoXlsxSupport' : 'main.tplReadError'), true);
        }
    }
    function loadMatrix(matrix, file) {
        if (!ctx) return;
        const res = T.rowsFromMatrix(matrix, { full: true });
        if (res.error === 'empty') { setInfo(t('main.tplNoRows'), true); return; }
        if (res.error === 'columns') { setInfo(t('main.tplNoColumns'), true); return; }
        if (!res.rows.length) { setInfo(t('main.tplNoRows'), true); return; }
        rows = res.rows.map((r) => ({ n: r.n, v: r.v, out: false, err: null, plan: null, fixed: false, show: true }));
        usedKeys = new Set(res.usedKeys);
        // al empezar se cargan todas las columnas que trae el archivo (el SKU y el UPC son las llaves, no se desmarcan)
        selected = new Set(res.usedKeys.filter((k) => !KEY_KEYS.includes(k)));
        const ignored = (res.ignored || []).length ? ` · ${t('main.tplIgnored', { list: res.ignored.slice(0, 6).join(', ') })}` : '';
        setInfo(`${t('main.tplFileInfo', { rows: rows.length, cols: usedKeys.size })}${ignored}`, false);
        shown = PAGE;
        validateAll();
        buildPicker();
        buildTable();
        setFilterButtons(false);
        refresh();
        $('tpl-cols').hidden = false;
        $('tpl-review').hidden = false;
    }

    // ---- columnas que se cargan ----------------------------------------------------------------------------------------------------------
    function buildPicker() {
        $('tpl-cols-file').innerHTML = COLS.filter((c) => usedKeys.has(c.key)).map((c) => (KEY_KEYS.includes(c.key)
            ? `<span class="tpl-pc tpl-pc-key"><input type="checkbox" checked disabled aria-label="${esc(header(c))}"><span>${esc(header(c))}</span><small>${esc(t('main.tplKeyTag'))}</small></span>`
            : `<label class="tpl-pc"><input type="checkbox" data-pick="${c.key}"${selected.has(c.key) ? ' checked' : ''}><span>${esc(header(c))}</span></label>`)).join('');
        $('tpl-cols-missing').innerHTML = COLS.filter((c) => !usedKeys.has(c.key)).map((c) => `<span class="tpl-pc tpl-pc-na"><span>${esc(header(c))}</span></span>`).join('');
    }
    const colShown = (key) => usedKeys.has(key) && (KEY_KEYS.includes(key) || selected.has(key));
    // la tabla solo muestra las columnas que trae el archivo y siguen marcadas
    function applyColumns() {
        modalEl.querySelectorAll('#tpl-review th[data-k], #tpl-review td[data-k]').forEach((el) => { el.hidden = !colShown(el.dataset.k); });
    }

    // ---- tabla de revisión -------------------------------------------------------------------------------------------------------------
    function cellInput(c, r, i) {
        const list = c.kind === 'udm' ? ' list="tpl-dl-udm"' : (c.kind === 'type' ? ' list="tpl-dl-type"' : (c.kind === 'storagetype' ? ' list="tpl-dl-storage"' : (c.kind === 'category' ? ` list="tpl-dl-${c.type}"` : (c.kind === 'classification' ? ' list="tpl-dl-class"' : ''))));
        return `<td class="tpl-c-${c.kind || 'plain'}${c.kind === 'category' ? ' tpl-cat' : ''}" data-k="${c.key}"><input type="text" data-i="${i}" data-k="${c.key}" value="${esc(r.v[c.key])}" aria-label="${esc(header(c))} ${r.n}"${list}></td>`;
    }
    function buildTable() {
        const draw = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => i < shown || r.err);
        $('tpl-body').innerHTML = draw.map(({ r, i }) => `<tr data-i="${i}"><td>${r.n}</td><td><span class="tpl-tag"></span></td>${COLS.map((c) => cellInput(c, r, i)).join('')}<td class="tpl-what"></td><td><button type="button" class="btn btn-secondary tpl-small" data-rm="${i}"></button></td></tr>`).join('');
        rows.forEach((r) => { r.tr = null; });
        draw.forEach(({ r }, k) => { r.tr = $('tpl-body').children[k]; });
        applyColumns();
        updateMore();
    }
    // «Mostrando X de N filas» y el botón para ver más (solo si hay filas sin dibujar)
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
        const local = {
            allowUpdate: true, selected, udm: ctx.udm, categories: ctx.categories, classifications: ctx.classifications,
            itemBySku: (n) => ctx.bySku.get(n) || null, itemByUpc: (upc) => ctx.byUpc.get(upc) || null,
            priorRowWithKey: (key, row) => { const n = accepted.get(key); return n && n !== row.n ? n : 0; },
        };
        rows.forEach((r) => {
            if (r.out) { r.plan = null; r.err = null; return; }
            r.plan = T.planRow(r, local);
            r.err = r.plan.error || null;
            if (!r.err) accepted.set(r.plan.key, r.n);
        });
    }
    // el dato con error en una columna que no se ve (por ejemplo el UPC cuando el archivo solo trae SKU) se corrige en la llave que sí se ve
    const errField = (r) => (r.err && r.err.field === 'upc' && !usedKeys.has('upc') ? 'sku' : (r.err ? r.err.field : ''));
    const show = (key, value) => (key === 'articleType' ? (T.TYPE_LABELS[value] || value) : (value === '' || value == null ? '—' : value));
    function updateText(plan) {
        const label = (key) => header(T.BY_KEY_ALL[key]);
        const changed = plan.changes.filter((c) => c.kind === 'change').map((c) => `${label(c.key)} (${show(c.key, c.from)} → ${show(c.key, c.to)})`);
        const filled = plan.changes.filter((c) => c.kind === 'fill').map((c) => label(c.key));
        const parts = [];
        if (changed.length) parts.push(t('main.tplUpdChange', { list: changed.join(', ') }));
        if (filled.length) parts.push(t('main.tplUpdFill', { list: filled.join(', ') }));
        if (plan.clears.length) parts.push(t('main.tplUpdClear'));
        return t('main.tplWillUpdate', { sku: plan.item.sku, parts: parts.join('; ') });
    }
    function paintRow(r) {
        const tr = r.tr;
        const tag = tr.querySelector('.tpl-tag');
        const what = tr.querySelector('.tpl-what');
        const btn = tr.querySelector('[data-rm]');
        const bad = errField(r);
        const plan = r.plan;
        tr.classList.toggle('tpl-gone', r.out || (plan && (plan.action === 'same' || plan.action === 'complete')));
        // los datos que cambian se marcan en azul y los que se llenan en verde
        const mark = {};
        if (plan && plan.action === 'update') plan.changes.forEach((c) => { mark[c.key] = c.kind; });
        tr.querySelectorAll('input').forEach((input) => {
            input.classList.toggle('tpl-bad', !!(r.err && bad === input.dataset.k));
            input.classList.toggle('tpl-chg', mark[input.dataset.k] === 'change');
            input.classList.toggle('tpl-fill', mark[input.dataset.k] === 'fill');
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
            const dup = r.err.code === 'upcExists' || r.err.code === 'upcDuplicateFile';
            set('tpl-tag-bad', t(dup ? 'main.tplStateRepeated' : 'main.tplStateInvalid'), 'tpl-what-bad', errText(r.err), remove);
        } else if (plan.action === 'create') {
            const n = Object.keys(plan.patch).length;
            set('tpl-tag-ok', t('main.tplStateNew'), 'tpl-what-ok', n === 1 ? t('main.tplWillCreateOnly') : t('main.tplWillCreate', { n }), remove);
        } else if (plan.action === 'update') set('tpl-tag-info', t('main.tplStateUpdate'), 'tpl-what-info', updateText(plan), remove);
        else if (plan.action === 'same') set('tpl-tag-grey', t('main.tplStateSame'), 'tpl-what-grey', t('main.tplSameMsg'), remove);
        else set('tpl-tag-warn', t('main.tplStateComplete'), 'tpl-what-warn', t('main.tplCompleteMsg', { sku: plan.item.sku }), remove);
        tr.hidden = filterBad && !r.show;
    }
    let filterBad = false;
    function paintAll() { rows.forEach((r) => { if (r.tr) paintRow(r); }); }
    function counts() {
        const c = { create: 0, upd: 0, same: 0, done: 0, bad: 0, gone: 0 };
        rows.forEach((r) => {
            if (r.out) c.gone += 1;
            else if (r.err) c.bad += 1;
            else if (r.plan.action === 'create') c.create += 1;
            else if (r.plan.action === 'update') c.upd += 1;
            else if (r.plan.action === 'same') c.same += 1;
            else c.done += 1;
        });
        c.ok = c.create + c.upd;
        return c;
    }
    function updateCounts() {
        const c = counts();
        const put = (id, n, key) => { const el = $(id); el.innerHTML = `<b>${n}</b> ${esc(t(key))}`; el.hidden = n === 0; };
        $('tpl-c-total').textContent = t('main.tplRows', { n: rows.length });
        put('tpl-c-new', c.create, 'main.tplCountNew');
        put('tpl-c-upd', c.upd, 'main.tplCountUpdate');
        put('tpl-c-same', c.same, 'main.tplCountSame');
        put('tpl-c-done', c.done, 'main.tplCountComplete');
        $('tpl-c-bad').innerHTML = `<b>${c.bad}</b> ${esc(t('main.tplWithError'))}`;
        $('tpl-c-bad').hidden = c.bad === 0;
        put('tpl-c-gone', c.gone, 'main.tplRemoved');
        $('tpl-next').disabled = c.bad === 0;
        const go = $('tpl-go');
        go.textContent = busy ? (progress ? t('main.tplLoadingProgress', { done: progress.done, total: progress.total }) : t('main.tplLoading')) : t(c.ok === 1 ? 'main.tplLoadOne' : 'main.tplLoadN', { n: c.ok });
        go.disabled = busy || c.ok === 0 || !!result;
        go.hidden = !!result && result.done;
        const skipped = rows.length - c.ok;
        $('tpl-msg').textContent = !rows.length || result ? '' : (skipped === 0 ? t('main.tplAllReady') : t('main.tplFooter', { ok: c.ok, total: rows.length }));
    }
    function refresh() { validateAll(); paintAll(); updateCounts(); }
    function setFilterButtons(bad) {
        filterBad = bad;
        $('tpl-f-all').setAttribute('aria-pressed', String(!bad));
        $('tpl-f-bad').setAttribute('aria-pressed', String(bad));
    }
    function setFilter(bad) {
        setFilterButtons(bad);
        rows.forEach((r) => { r.show = !bad || !!r.err; });
        paintAll();
    }
    function goToNextError() {
        const r = rows.find((x) => x.err && !x.out);
        if (!r) return;
        if (!r.tr) { buildTable(); paintAll(); }
        r.tr.hidden = false;
        const input = r.tr.querySelector(`input[data-k="${errField(r)}"]`);
        if (input) { input.scrollIntoView({ block: 'nearest', inline: 'center' }); input.focus(); input.select(); }
    }

    // ---- cargar ---------------------------------------------------------------------------------------------------------------------------
    // Por qué una fila no se cargó (para el Excel de las que no se cargaron)
    function reasonNotLoaded(r) {
        if (r.out) return t('main.tplRemovedHint');
        if (r.err) return errText(r.err);
        if (r.plan && r.plan.action === 'same') return t('main.tplSameMsg');
        if (r.plan && r.plan.action === 'complete') return t('main.tplCompleteMsg', { sku: r.plan.item.sku });
        return '';
    }
    async function onGo() {
        if (result && result.done) return;
        const good = rows.filter((r) => !r.out && !r.err && r.plan && (r.plan.action === 'create' || r.plan.action === 'update'));
        if (!good.length || busy) return;
        busy = true;
        progress = { done: 0, total: good.length };
        updateCounts();
        const created = [];
        const updated = [];
        const serverFailed = new Map(); // lo que el servidor no aceptó (por ejemplo un UPC que alguien más dio de alta mientras se revisaba, o un permiso que falta)
        let interrupted = '';
        const stop = (message, status) => { Dashboard.showToast(message, status === 403 ? 'warning' : 'error'); busy = false; progress = null; updateCounts(); };
        // las filas se mandan en tandas (el servidor recibe hasta BATCH por petición): el archivo puede traer las que sean
        for (let from = 0; from < good.length; from += BATCH) {
            const chunk = good.slice(from, from + BATCH);
            try {
                const res = await fetch(`${API}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ update: true, columns: [...selected], rows: chunk.map((r) => ({ n: r.n, v: r.v })) }) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    if (from === 0) { stop(json.message || t('main.tplLoadError'), res.status); return; }
                    interrupted = json.message || t('main.tplLoadError');
                    break;
                }
                created.push(...(json.created || []));
                updated.push(...(json.updated || []));
                (json.failed || []).forEach((f) => serverFailed.set(chunk[f.index].n, f));
                progress.done = from + chunk.length;
                updateCounts();
            } catch (err) {
                console.error('Plantilla: no se pudo cargar', err);
                if (from === 0) { stop(t('main.tplLoadError')); return; }
                interrupted = t('main.tplLoadError');
                break;
            }
        }
        // si la carga se cortó a la mitad, las filas que ya no se mandaron salen en el Excel de las que no se cargaron, con su motivo
        const unsent = new Set(good.slice(progress.done).map((r) => r.n));
        result = { done: true, created, updated, notLoaded: [] };
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
        const { created, updated } = result;
        const skipped = result.notLoaded.length;
        $('tpl-flow').hidden = true;
        const box = $('tpl-result');
        let title;
        if (created.length && updated.length) title = t('main.tplResultBoth', { c: created.length, u: updated.length });
        else if (updated.length) title = t(updated.length === 1 ? 'main.tplResultUpdOne' : 'main.tplResultUpdN', { n: updated.length });
        else title = t(created.length === 1 ? 'main.tplResultOne' : 'main.tplResultN', { n: created.length });
        const bits = [];
        if (created.length) bits.push(t('main.tplResultRange', { from: created[0].sku, to: created[created.length - 1].sku }));
        if (updated.length) bits.push(t('main.tplResultUpdated', { list: updated.slice(0, 6).map((u) => u.sku).join(', ') + (updated.length > 6 ? ` +${updated.length - 6}` : '') }));
        const pending = updated.reduce((acc, u) => acc + (u.pending || 0), 0);
        const tail = (pending ? t('main.tplResultPending', { n: pending }) : '') + (skipped ? t(skipped === 1 ? 'main.tplResultSkippedOne' : 'main.tplResultSkipped', { n: skipped }) : t('main.tplResultAll'));
        box.innerHTML = `<div class="tpl-result-main"><span class="tpl-ok-badge"><i class="bx bx-check" aria-hidden="true"></i></span><div><b>${esc(title)}</b><span>${esc(bits.join(' · '))}${esc(tail)}</span></div></div>
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
            widths: [8, ...COLS.map((c) => Math.max(14, header(c).length + 4)), 70], headerRow: true, textColumns: [1, 2],
        }]);
        saveBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${t('main.tplErrorsFileName')}.xlsx`);
    }

    window.SkuTemplateUi = { mount };
}());
