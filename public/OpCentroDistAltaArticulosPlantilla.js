// ---------------------------------------------------------------------------
// Alta Nuestros Artículos: "Cargar por plantilla". Muchos artículos a la vez: se baja una plantilla de Excel, se llena y se sube (o se pegan las filas copiadas de Excel). Antes de
// cargar la ventana revisa CADA fila con las reglas de public/SkuTemplate.js (las mismas que vuelve a aplicar el servidor): cada dato con error sale en rojo con su motivo y se
// corrige ahí mismo; una fila se puede quitar; las que no se corrigen no se cargan y bajan en un Excel con su motivo. Los artículos cargados no llevan fotos, así que quedan
// sin código QR hasta tenerlas (el QR se genera solo cuando el artículo tiene sus 24 datos). Solo Web.
// OpCentroDistAltaArticulos.js llama a window.SkuTemplateUi.mount(...) al armar su botón "+ Nuevo Artículo".
// ---------------------------------------------------------------------------
(function () {
    const TABLE_KEY = 'nuestros-articulos';
    const API = '/api/business/sku-items';
    const TPL_COL = 'colArticuloTemplateAuth';
    const T = window.SkuTemplate;
    const X = window.SimpleXlsx;
    const COLS = T.COLUMNS;
    const CAT_COLS = COLS.filter((c) => c.kind === 'category');

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
    let ctx = null;          // { udm, categories, existing: Map(upc -> sku) }
    let rows = [];           // [{ n, v, out, err, fixed, show }]
    let usedKeys = new Set();
    let mode = 'file';
    let busy = false;
    let result = null;

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
        if (c.key === 'upc') return [t('main.tplInstUpc'), '7501003126410'];
        if (c.kind === 'udm') return [t('main.tplInstUdm', { list: options(ctx.udm) }), (ctx.udm || [])[0] || ''];
        if (c.kind === 'type') return [t('main.tplInstType'), 'Artículo Terminado'];
        if (c.kind === 'number') return [t(c.unit === 'kg' ? 'main.tplInstNumberKg' : 'main.tplInstNumberCm'), { height: '4', length: '11', width: '6', articleWeight: '0.045', packageWeight: '0.060' }[c.key]];
        if (c.kind === 'category') return [t('main.tplInstCategory', { list: options((ctx.categories || {})[c.type]) }), ((ctx.categories || {})[c.type] || [])[0] || ''];
        return [t('main.tplInstText'), { uniqueDescription: 'Paracetamol 500 mg tabletas, caja con 20', knownDescription: 'Tempra', customDescription: 'Paracetamol 500 caja' }[c.key] || ''];
    }
    function downloadTemplate() {
        const bytes = X.writeXlsx([
            { name: t('main.tplSheetTemplate'), rows: [COLS.map(header)], widths: COLS.map((c) => Math.max(14, header(c).length + 4)), headerRow: true, textColumns: [0] },
            {
                name: t('main.tplSheetHelp'),
                rows: [[t('main.tplInstColumn'), t('main.tplInstRequired'), t('main.tplInstWhat'), t('main.tplInstExample')], ...COLS.map((c) => { const [what, example] = instruction(c); return [header(c), c.required ? t('main.tplYes') : t('main.tplNo'), what, example]; })],
                widths: [30, 14, 90, 36], headerRow: true,
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
                <section class="tpl-blk" id="tpl-review" hidden>
                    <h4><span class="tpl-n">3</span>${esc(t('main.tplStep3'))}</h4>
                    <div class="tpl-bar">
                        <div class="tpl-counts" aria-live="polite"><span class="tpl-cnt" id="tpl-c-total"></span><span class="tpl-cnt tpl-cnt-ok" id="tpl-c-ok"></span><span class="tpl-cnt tpl-cnt-bad" id="tpl-c-bad"></span><span class="tpl-cnt tpl-cnt-gone" id="tpl-c-gone" hidden></span></div>
                        <div class="tpl-bar-right"><button type="button" class="btn btn-secondary tpl-small" id="tpl-next" data-help-key="tplNext"><i class="bx bx-down-arrow-alt" aria-hidden="true"></i> ${esc(t('main.tplNextError'))}</button>
                        <div class="tpl-seg" role="group"><button type="button" id="tpl-f-all" aria-pressed="true">${esc(t('main.tplAll'))}</button><button type="button" id="tpl-f-bad" aria-pressed="false">${esc(t('main.tplOnlyErrors'))}</button></div></div>
                    </div>
                    <div class="tpl-scroll" data-help-key="tplReview"><table class="tpl-table"><thead><tr><th>${esc(t('main.tplColRow'))}</th><th>${esc(t('main.tplColState'))}</th>${head}<th>${esc(t('main.tplColWhat'))}</th><th></th></tr></thead><tbody id="tpl-body"></tbody></table></div>
                    <datalist id="tpl-dl-udm"></datalist><datalist id="tpl-dl-type"><option value="Artículo Terminado"></option><option value="Materia Prima"></option></datalist>
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
            const rm = event.target.closest('[data-rm]');
            if (rm) { const r = rows[Number(rm.dataset.rm)]; r.out = !r.out; refresh(); }
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
        result = null;
        setMode('file');
        $('tpl-info').textContent = '';
        $('tpl-info').classList.remove('tpl-error');
        $('tpl-file-name').textContent = '';
        $('tpl-paste').value = '';
        $('tpl-review').hidden = true;
        $('tpl-flow').hidden = false;
        $('tpl-result').hidden = true;
        $('tpl-cancel').textContent = t('main.whClose');
        updateCounts();
        modalEl.hidden = false;
        try {
            const [cats, upcs] = await Promise.all([
                fetch('/api/business/article-categories-active', { credentials: 'include' }).then((r) => r.json()),
                fetch(`${API}/upcs`, { credentials: 'include' }).then((r) => r.json()),
            ]);
            const options = (cats && cats.options) || {};
            ctx = { udm: options.udm || [], categories: Object.fromEntries(CAT_COLS.map((c) => [c.type, options[c.type] || []])), existing: new Map((upcs.upcs || []).map(([upc, sku]) => [upc, sku])) };
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
        const res = T.rowsFromMatrix(matrix);
        if (res.error === 'empty') { setInfo(t('main.tplNoRows'), true); return; }
        if (res.error === 'columns') { setInfo(t('main.tplNoColumns'), true); return; }
        if (res.rows.length > T.MAX_ROWS) { setInfo(t('main.tplTooMany', { n: res.rows.length, max: T.MAX_ROWS }), true); return; }
        if (!res.rows.length) { setInfo(t('main.tplNoRows'), true); return; }
        rows = res.rows.map((r) => ({ n: r.n, v: r.v, out: false, err: null, fixed: false, show: true }));
        usedKeys = new Set(res.usedKeys);
        const ignored = (res.ignored || []).length ? ` · ${t('main.tplIgnored', { list: res.ignored.slice(0, 6).join(', ') })}` : '';
        setInfo(`${t('main.tplFileInfo', { rows: rows.length, cols: usedKeys.size })}${ignored}`, false);
        buildTable();
        setFilterButtons(false);
        refresh();
        $('tpl-review').hidden = false;
    }

    // ---- tabla de revisión -------------------------------------------------------------------------------------------------------------
    function cellInput(c, r, i) {
        const list = c.kind === 'udm' ? ' list="tpl-dl-udm"' : (c.kind === 'type' ? ' list="tpl-dl-type"' : (c.kind === 'category' ? ` list="tpl-dl-${c.type}"` : ''));
        return `<td class="tpl-c-${c.kind || 'plain'}${c.kind === 'category' ? ' tpl-cat' : ''}" data-k="${c.key}"><input type="text" data-i="${i}" data-k="${c.key}" value="${esc(r.v[c.key])}" aria-label="${esc(header(c))} ${r.n}"${list}></td>`;
    }
    function buildTable() {
        $('tpl-body').innerHTML = rows.map((r, i) => `<tr data-i="${i}"><td>${r.n}</td><td><span class="tpl-tag"></span></td>${COLS.map((c) => cellInput(c, r, i)).join('')}<td class="tpl-what"></td><td><button type="button" class="btn btn-secondary tpl-small" data-rm="${i}"></button></td></tr>`).join('');
        // las columnas de categoría solo salen si el archivo las trae
        modalEl.querySelectorAll('.tpl-cat').forEach((el) => { el.hidden = !usedKeys.has(el.dataset.k); });
        rows.forEach((r, i) => { r.tr = $('tpl-body').children[i]; });
    }
    function validateAll() {
        const accepted = new Map();
        const local = {
            udm: ctx.udm, categories: ctx.categories,
            existingUpc: (upc) => ctx.existing.get(upc) || '',
            priorRowWithUpc: (upc, row) => { const n = accepted.get(upc); return n && n !== row.n ? n : 0; },
        };
        rows.forEach((r) => {
            r.err = r.out ? null : T.validateRow(r, local);
            if (!r.out && !r.err) accepted.set(String(r.v.upc).trim(), r.n);
        });
    }
    function paintRow(r) {
        const tr = r.tr;
        const tag = tr.querySelector('.tpl-tag');
        const what = tr.querySelector('.tpl-what');
        const btn = tr.querySelector('[data-rm]');
        tr.classList.toggle('tpl-gone', r.out);
        tr.querySelectorAll('input').forEach((input) => {
            input.classList.toggle('tpl-bad', !!(r.err && r.err.field === input.dataset.k));
            input.disabled = r.out;
        });
        if (r.out) { tag.className = 'tpl-tag tpl-tag-grey'; tag.textContent = t('main.tplStateRemoved'); what.className = 'tpl-what tpl-what-grey'; what.textContent = t('main.tplRemovedHint'); btn.textContent = t('main.tplRestoreRow'); }
        else if (r.err) {
            const dup = r.err.code === 'upcExists' || r.err.code === 'upcDuplicateFile';
            tag.className = 'tpl-tag tpl-tag-bad';
            tag.textContent = t(dup ? 'main.tplStateRepeated' : 'main.tplStateInvalid');
            what.className = 'tpl-what tpl-what-bad';
            what.textContent = errText(r.err);
            btn.textContent = t('main.tplRemoveRow');
        } else {
            tag.className = 'tpl-tag tpl-tag-ok';
            tag.textContent = t('main.tplStateReady');
            what.className = 'tpl-what tpl-what-ok';
            what.textContent = t(r.fixed ? 'main.tplFixedWillLoad' : 'main.tplWillLoad');
            btn.textContent = t('main.tplRemoveRow');
        }
        tr.hidden = filterBad && !r.show;
    }
    let filterBad = false;
    function paintAll() { rows.forEach(paintRow); }
    function counts() {
        let ok = 0; let bad = 0; let gone = 0;
        rows.forEach((r) => { if (r.out) gone += 1; else if (r.err) bad += 1; else ok += 1; });
        return { ok, bad, gone };
    }
    function updateCounts() {
        const c = counts();
        $('tpl-c-total').textContent = t('main.tplRows', { n: rows.length });
        $('tpl-c-ok').innerHTML = `<b>${c.ok}</b> ${esc(t('main.tplReady'))}`;
        $('tpl-c-bad').innerHTML = `<b>${c.bad}</b> ${esc(t('main.tplWithError'))}`;
        $('tpl-c-bad').hidden = c.bad === 0;
        $('tpl-c-gone').innerHTML = `<b>${c.gone}</b> ${esc(t('main.tplRemoved'))}`;
        $('tpl-c-gone').hidden = c.gone === 0;
        $('tpl-next').disabled = c.bad === 0;
        const go = $('tpl-go');
        go.textContent = busy ? t('main.tplLoading') : t(c.ok === 1 ? 'main.tplLoadOne' : 'main.tplLoadN', { n: c.ok });
        go.disabled = busy || c.ok === 0 || !!result;
        go.hidden = !!result && result.done;
        const skipped = c.bad + c.gone;
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
        r.tr.hidden = false;
        const input = r.tr.querySelector(`input[data-k="${r.err.field}"]`);
        if (input) { input.scrollIntoView({ block: 'nearest', inline: 'center' }); input.focus(); input.select(); }
    }

    // ---- cargar ---------------------------------------------------------------------------------------------------------------------------
    async function onGo() {
        if (result && result.done) return;
        const good = rows.filter((r) => !r.out && !r.err);
        if (!good.length || busy) return;
        busy = true;
        updateCounts();
        try {
            const res = await fetch(`${API}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ rows: good.map((r) => ({ n: r.n, v: r.v })) }) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                Dashboard.showToast(json.message || t('main.tplLoadError'), res.status === 403 ? 'warning' : 'error');
                busy = false;
                updateCounts();
                return;
            }
            // lo que el servidor no aceptó (por ejemplo un UPC que alguien más dio de alta mientras se revisaba) se suma a lo que no se cargó
            const serverFailed = new Map((json.failed || []).map((f) => [good[f.index].n, f]));
            result = { done: true, created: json.created || [], notLoaded: [] };
            rows.forEach((r) => {
                if (r.out) result.notLoaded.push({ r, reason: t('main.tplRemovedHint') });
                else if (r.err) result.notLoaded.push({ r, reason: errText(r.err) });
                else if (serverFailed.has(r.n)) result.notLoaded.push({ r, reason: serverFailed.get(r.n).message });
            });
            busy = false;
            showResult();
            if (onLoaded) await onLoaded();
        } catch (err) {
            console.error('Plantilla: no se pudo cargar', err);
            Dashboard.showToast(t('main.tplLoadError'), 'error');
            busy = false;
            updateCounts();
        }
    }
    function showResult() {
        const created = result.created;
        const skipped = result.notLoaded.length;
        $('tpl-flow').hidden = true;
        const box = $('tpl-result');
        const range = created.length ? t('main.tplResultRange', { from: created[0].sku, to: created[created.length - 1].sku }) : '';
        box.innerHTML = `<div class="tpl-result-main"><span class="tpl-ok-badge"><i class="bx bx-check" aria-hidden="true"></i></span><div><b>${esc(t(created.length === 1 ? 'main.tplResultOne' : 'main.tplResultN', { n: created.length }))}</b><span>${esc(range)}${esc(skipped ? t(skipped === 1 ? 'main.tplResultSkippedOne' : 'main.tplResultSkipped', { n: skipped }) : t('main.tplResultAll'))}</span></div></div>
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
            widths: [8, ...COLS.map((c) => Math.max(14, header(c).length + 4)), 70], headerRow: true, textColumns: [1],
        }]);
        saveBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${t('main.tplErrorsFileName')}.xlsx`);
    }

    window.SkuTemplateUi = { mount };
}());
