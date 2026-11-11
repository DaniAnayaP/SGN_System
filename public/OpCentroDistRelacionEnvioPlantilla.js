// ---------------------------------------------------------------------------
// Relación Código Envío: "Cargar por plantilla". Muchas relaciones a la vez: se baja una plantilla de Excel (Código SKU, Lugar de envío y Centro de Costos, con una hoja de Opciones con los lugares y centros que
// existen), se llena y se sube (o se pegan las filas copiadas de Excel). Una fila = un código enviado a un lugar (un código que se envía a varios lugares lleva varias filas). Antes de cargar la ventana revisa CADA fila con
// la regla de public/EnvTemplate.js: cada dato con error sale en rojo con su motivo y se corrige ahí mismo; una fila se puede quitar; las que no se cargan bajan en un Excel con su motivo. El servidor vuelve a revisar
// cada fila como si fuera una relación hecha a mano. Con un solo centro de costos marcado arriba, las filas sin centro se cargan en él. Es la misma ventana que usan Alta Artículos y Relación Código.
// OpCentroDistRelacionEnvio.js llama a window.EnvTemplateUi.mount(...) al armar su botón "+ Nueva relación de envío".
// ---------------------------------------------------------------------------
(function () {
    const TABLE_KEY = 'relacion-envio';
    const API = '/api/business/code-ship-relations';
    const TPL_COL = 'colEnvTemplateAuth';
    const E = window.EnvTemplate;
    const X = window.SimpleXlsx;
    const T = window.SkuTemplate; // solo para leer el texto pegado (parseDelimited)
    const COLS = E.COLUMNS;

    const t = (key, params) => {
        let text = Dashboard.t(key);
        Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
        return text;
    };
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const $ = (id) => document.getElementById(id);
    const en = () => Dashboard.lang === 'en';
    const header = (c) => (en() ? c.en : c.es);
    const errText = (err) => t(`main.envTplErr_${err.code}`, err.params);

    let modalEl = null;
    let onLoaded = null;
    let ctx = null;          // lo que se necesita para revisar: códigos, lugares, centros y las relaciones que ya existen
    let rows = [];           // [{ n, v, out, err, plan, fixed, tr }]
    let mode = 'file';
    let busy = false;
    let result = null;
    let filterBad = false;
    // Sin límite de filas por archivo: la tabla de revisión dibuja de a PAGE filas (las que tienen error siempre se dibujan) y la carga viaja al servidor en tandas de BATCH.
    const PAGE = 300;
    const BATCH = E.MAX_ROWS;
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
        btn.setAttribute('data-help-key', 'envTplButton');
        btn.innerHTML = `<i class="bx bx-upload" aria-hidden="true"></i><span>${esc(t('main.tplButton'))}</span>`;
        btn.addEventListener('click', open);
        if (newButton) { newButton.style.marginRight = '0.5rem'; newButton.after(btn); } else toolbar.prepend(btn);
    }

    // ---- plantilla para bajar ---------------------------------------------------------------------------------------------------------
    const EXAMPLE = { sku: '195201', place: 'Hospital Central', center: 'CMCCCDC' };
    function optionsSheet() {
        const out = [[t('main.colEnvLugar'), t('main.tplColState'), '', t('main.colEnvCentroCostos'), t('main.envCode')]];
        const places = ctx.places.filter((p) => p.active);
        const centers = ctx.centers;
        const n = Math.max(places.length, centers.length);
        for (let i = 0; i < n; i += 1) out.push([places[i] ? places[i].name : '', places[i] ? t('main.envTplActivo') : '', '', centers[i] ? centers[i].name : '', centers[i] ? (centers[i].code || '') : '']);
        return out;
    }
    function downloadTemplate() {
        const bytes = X.writeXlsx([
            { name: t('main.tplSheetTemplate'), rows: [COLS.map(header), COLS.map((c) => EXAMPLE[c.key] || '')], widths: COLS.map((c) => Math.max(18, header(c).length + 4)), headerRow: true, textColumns: COLS.map((c, i) => i) },
            {
                name: t('main.tplSheetHelp'),
                rows: [
                    [t('main.tplInstColumn'), t('main.tplInstRequired'), t('main.tplInstWhat'), t('main.tplInstExample')],
                    ...COLS.map((c) => [header(c), c.required ? t('main.tplYes') : t('main.tplNo'), t(`main.envTplInst_${c.key}`), EXAMPLE[c.key]]),
                    ['', '', '', ''],
                    [t('main.relTplRulesTitle'), '', t('main.envTplRule1'), ''],
                    ['', '', t('main.envTplRule2'), ''],
                    ['', '', t('main.envTplRule3'), ''],
                ],
                widths: [24, 16, 100, 26], headerRow: true,
            },
            { name: t('main.relTplSheetOptions'), rows: optionsSheet(), widths: [34, 14, 4, 32, 18], headerRow: true },
        ]);
        saveBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${t('main.envTplFileName')}.xlsx`);
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
            <h3 id="tpl-title">${esc(t('main.envTplTitle'))}</h3>
            <div id="tpl-flow">
                <section class="tpl-blk">
                    <h4><span class="tpl-n">1</span>${esc(t('main.tplStep1'))}</h4>
                    <div><button type="button" class="btn btn-secondary" id="tpl-download" data-help-key="envTplDownload"><i class="bx bx-download" aria-hidden="true"></i> ${esc(t('main.tplDownload'))}</button></div>
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
                        <div class="tpl-counts" aria-live="polite"><span class="tpl-cnt" id="tpl-c-total"></span><span class="tpl-cnt tpl-cnt-ok" id="tpl-c-new" hidden></span><span class="tpl-cnt tpl-cnt-gone" id="tpl-c-same" hidden></span><span class="tpl-cnt tpl-cnt-bad" id="tpl-c-bad"></span><span class="tpl-cnt tpl-cnt-gone" id="tpl-c-gone" hidden></span></div>
                        <div class="tpl-bar-right"><button type="button" class="btn btn-secondary tpl-small" id="tpl-next" data-help-key="tplNext"><i class="bx bx-down-arrow-alt" aria-hidden="true"></i> ${esc(t('main.tplNextError'))}</button>
                        <div class="tpl-seg" role="group"><button type="button" id="tpl-f-all" aria-pressed="true">${esc(t('main.tplAll'))}</button><button type="button" id="tpl-f-bad" aria-pressed="false">${esc(t('main.tplOnlyErrors'))}</button></div></div>
                    </div>
                    <div class="tpl-scroll" data-help-key="envTplReview"><table class="tpl-table"><thead><tr><th>${esc(t('main.tplColRow'))}</th><th>${esc(t('main.tplColState'))}</th>${head}<th>${esc(t('main.tplColWhat'))}</th><th></th></tr></thead><tbody id="tpl-body"></tbody></table></div>
                    <div class="tpl-more" id="tpl-more" hidden><span class="tpl-muted" id="tpl-more-text"></span><button type="button" class="btn btn-secondary tpl-small" id="tpl-more-btn"></button></div>
                </section>
            </div>
            <div id="tpl-result" class="tpl-result" hidden></div>
            <div class="tpl-foot"><span class="tpl-muted" id="tpl-msg"></span><button type="button" class="btn btn-secondary" id="tpl-cancel">${esc(t('main.whClose'))}</button><button type="button" class="btn" id="tpl-go" data-help-key="envTplLoad" disabled></button></div>
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
            const [list, skus] = await Promise.all([get(API), get('/api/business/code-relations/skus?all=1')]);
            const items = skus.skus || [];
            const bySku = new Map(items.flatMap((i) => [[Number(i.num), i], [String(i.sku).toUpperCase(), i]])); // por su número de 6 dígitos o por su SKU completo
            const byUpc = new Map(items.filter((i) => i.upc).map((i) => [i.upc, i]));
            const places = list.places || [];
            const byPlace = new Map(places.map((p) => [E.norm(p.name), p]));
            const existing = new Set((list.relations || []).map((r) => `${r.costCenterId}|${r.skuItemId}|${r.placeId}`));
            ctx = { places, byPlace, centers: list.costCenters || [], bySku, byUpc, existing };
            if (!places.some((p) => p.active)) setInfo(t('main.envTplNoPlaces'), true);
            const selected = Dashboard.getSelectedCostCenterIds();
            const one = selected && selected.length === 1 ? ctx.centers.find((c) => c.id === selected[0]) : (ctx.centers.length === 1 ? ctx.centers[0] : null);
            $('tpl-center').textContent = one ? t('main.envTplCenterOne', { center: one.name }) : t('main.envTplCenterMany');
        } catch (err) {
            console.error('Plantilla de Relación Código Envío: no se pudieron cargar los catálogos', err);
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
            console.error('Plantilla de Relación Código Envío: no se pudo leer el archivo', err);
            setInfo(t(err && err.message === 'no-decompression' ? 'main.tplNoXlsxSupport' : 'main.tplReadError'), true);
        }
    }
    function loadMatrix(matrix) {
        if (!ctx) return;
        const res = E.rowsFromMatrix(matrix);
        const ignored = (res.ignored || []).length ? ` · ${t('main.tplIgnored', { list: res.ignored.slice(0, 6).join(', ') })}` : '';
        if (res.error === 'empty') { setInfo(t('main.tplNoRows'), true); return; }
        if (res.error === 'columns') { setInfo(t('main.tplNoColumns'), true); return; }
        if (res.error === 'sku' || res.error === 'place') { setInfo(t('main.envTplNeedColumns') + ignored, true); $('tpl-review').hidden = true; return; }
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
        const local = {
            centers: ctx.centers, selectedIds: Dashboard.getSelectedCostCenterIds(),
            itemBySku: (n) => ctx.bySku.get(n) || null, itemByUpc: (upc) => ctx.byUpc.get(upc) || null,
            placeByName: (name) => ctx.byPlace.get(name) || null,
            existingRelation: (key) => (ctx.existing.has(key) ? key : null),
            priorRowWithKey: (key, row) => { const n = accepted.get(key); return n && n !== row.n ? n : 0; },
        };
        rows.forEach((r) => {
            if (r.out) { r.plan = null; r.err = null; return; }
            r.plan = E.planRow(r, local);
            r.err = r.plan.error || null;
            if (!r.err && r.plan.action === 'create') accepted.set(r.plan.key, r.n);
        });
    }
    const whereText = (plan) => `${plan.item ? `${String(plan.item.sku || '').padStart(6, '0')} · ${plan.item.description || ''}`.replace(/ · $/, '') : ''} → ${plan.place.name} (${plan.center.name})`;
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
        else if (r.err) set('tpl-tag-bad', t(r.err.code === 'duplicateInFile' ? 'main.tplStateRepeated' : 'main.tplStateInvalid'), 'tpl-what-bad', errText(r.err), remove);
        else if (plan.action === 'same') set('tpl-tag-grey', t('main.envTplStateExists'), 'tpl-what-grey', t('main.envTplExistsMsg'), remove);
        else set('tpl-tag-ok', t('main.envTplStateNew'), 'tpl-what-ok', t('main.envTplWillCreate', { what: whereText(plan) }), remove);
        tr.hidden = filterBad && !r.err;
    }
    function paintAll() { rows.forEach((r) => { if (r.tr) paintRow(r); }); }
    function counts() {
        const c = { create: 0, same: 0, bad: 0, gone: 0 };
        rows.forEach((r) => {
            if (r.out) c.gone += 1;
            else if (r.err) c.bad += 1;
            else if (r.plan.action === 'create') c.create += 1;
            else c.same += 1;
        });
        return c;
    }
    function updateCounts() {
        const c = counts();
        const put = (id, n, key) => { const el = $(id); el.innerHTML = `<b>${n}</b> ${esc(t(key))}`; el.hidden = n === 0; };
        $('tpl-c-total').textContent = t('main.tplRows', { n: rows.length });
        put('tpl-c-new', c.create, 'main.envTplCountNew');
        put('tpl-c-same', c.same, 'main.envTplCountExists');
        $('tpl-c-bad').innerHTML = `<b>${c.bad}</b> ${esc(t('main.tplWithError'))}`;
        $('tpl-c-bad').hidden = c.bad === 0;
        put('tpl-c-gone', c.gone, 'main.tplRemoved');
        $('tpl-next').disabled = c.bad === 0;
        const ok = c.create;
        const go = $('tpl-go');
        go.textContent = busy ? (progress ? t('main.tplLoadingProgress', { done: progress.done, total: progress.total }) : t('main.tplLoading')) : t(ok === 1 ? 'main.envTplLoadOne' : 'main.envTplLoadN', { n: ok });
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
        if (r.plan && r.plan.action === 'same') return t('main.envTplExistsMsg');
        return '';
    }
    async function onGo() {
        if (result && result.done) return;
        const good = rows.filter((r) => !r.out && !r.err && r.plan && r.plan.action === 'create');
        if (!good.length || busy) return;
        busy = true;
        progress = { done: 0, total: good.length };
        updateCounts();
        const created = [];
        const serverFailed = new Map(); // lo que el servidor no aceptó (alguien más la creó mientras se revisaba, un permiso que falta…)
        let interrupted = '';
        const stop = (message, status) => { Dashboard.showToast(message, status === 403 ? 'warning' : 'error'); busy = false; progress = null; updateCounts(); };
        for (let from = 0; from < good.length; from += BATCH) {
            const chunk = good.slice(from, from + BATCH);
            try {
                const res = await fetch(`${API}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ rows: chunk.map((r) => ({ n: r.n, ...r.plan.values })) }) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    if (from === 0) { stop(json.message || t('main.tplLoadError'), res.status); return; }
                    interrupted = json.message || t('main.tplLoadError');
                    break;
                }
                created.push(...(json.created || []));
                (json.failed || []).forEach((f) => serverFailed.set(chunk[f.index].n, f));
                progress.done = from + chunk.length;
                updateCounts();
            } catch (err) {
                console.error('Plantilla de Relación Código Envío: no se pudo cargar', err);
                if (from === 0) { stop(t('main.tplLoadError')); return; }
                interrupted = t('main.tplLoadError');
                break;
            }
        }
        const unsent = new Set(good.slice(progress.done).map((r) => r.n));
        result = { done: true, created, notLoaded: [] };
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
        const loaded = result.created.length;
        const skipped = result.notLoaded.length;
        $('tpl-flow').hidden = true;
        const box = $('tpl-result');
        const title = t(loaded === 1 ? 'main.envTplResultOne' : 'main.envTplResultN', { n: loaded });
        const tail = (skipped ? t(skipped === 1 ? 'main.tplResultSkippedOne' : 'main.tplResultSkipped', { n: skipped }) : t('main.tplResultAll')).replace(/^\s*·\s*/, '');
        box.innerHTML = `<div class="tpl-result-main"><span class="tpl-ok-badge"><i class="bx bx-check" aria-hidden="true"></i></span><div><b>${esc(title)}</b><span>${esc(tail)}</span></div></div>
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
            widths: [8, ...COLS.map((c) => Math.max(18, header(c).length + 4)), 70], headerRow: true, textColumns: COLS.map((c, i) => i + 1),
        }]);
        saveBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${t('main.tplErrorsFileName')}.xlsx`);
    }

    window.EnvTemplateUi = { mount };
}());
