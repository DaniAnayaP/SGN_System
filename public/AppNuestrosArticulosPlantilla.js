// ---------------------------------------------------------------------------
// Alta Nuestros Artículos (App): "Cargar por plantilla". Es la versión de celular de OpCentroDistAltaArticulosPlantilla.js (Web), con las mismas reglas (public/SkuTemplate.js) y el mismo
// servidor (POST /api/business/sku-items/import, que vuelve a revisar todo). En el celular las filas se ven como tarjetas: la que tiene un error muestra el motivo y UN campo para
// corregirlo ahí mismo; se puede quitar una fila; lo que no se corrige no se carga y se puede copiar con su motivo. El archivo (.xlsx o .csv) se elige del celular o se pegan las filas
// copiadas de Excel. Sin señal: los catálogos y los UPC existentes salen de la última copia guardada y la carga entra a la cola (AppOfflineSync.js); si el servidor deja filas fuera al
// reconectar, quedan en el aviso "No se aplicó" de la pantalla. AppNuestrosArticulos.js lo llama con window.AppSkuTemplate.
// ---------------------------------------------------------------------------
(function () {
    const T = window.SkuTemplate;
    const X = window.SimpleXlsx;
    const COLS = T.COLUMNS;
    const CAT_COLS = COLS.filter((c) => c.kind === 'category');
    const CTX_CACHE = 'sgn_app_tpl_ctx';
    const TPL_PREFIX = 'cat-operaciones/cat-operaciones-centro-dist-alta-articulos';

    let env = null;             // { bodyEl, titleEl, t, showToast } de la pantalla que lo abre
    let ctx = null;             // { udm, categories, existing: Map(upc -> sku) }
    let rows = [];              // [{ n, v, out, err, fixed }]
    let usedKeys = new Set();
    let mode = 'file';
    let filterBad = false;
    let result = null;          // { created: [...], notLoaded: [{ r, reason }], queued }
    let busy = false;
    let info = { text: '', error: false };

    const t = (key, params) => env.t(key, params);
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const lang = () => (localStorage.getItem('lang') === 'es' ? 'es' : 'en');
    const header = (c) => (lang() === 'es' ? c.es : c.en);
    const errText = (err) => t(`main.tplErr_${err.code === 'number' ? `number_${err.params.unit}` : err.code}`, { ...err.params, label: lang() === 'en' ? err.params.labelEn : err.params.label });

    // ¿Esta persona tiene la hoja "Cargar por plantilla" del árbol? (el administrador del cliente siempre)
    async function canUse(user) {
        if (user && user.isClientAdmin) return true;
        try {
            const res = await fetch(apiUrl('/api/me/business-profile'), { credentials: 'include' });
            if (!res.ok) return false;
            const { profile } = await res.json();
            return (profile.effectiveGrants || []).some((g) => g.submenuId && g.submenuId.startsWith(`${TPL_PREFIX}/class-botones/colArticuloTemplateAuth/`));
        } catch {
            return false;
        }
    }

    // ---- catálogos y UPC existentes: con señal se bajan; sin señal sale la última copia ----------------------------------------------------
    async function loadCtx() {
        try {
            const [cats, upcs] = await Promise.all([
                fetch(apiUrl('/api/business/article-categories-active'), { credentials: 'include' }).then((r) => { if (!r.ok) throw new Error('x'); return r.json(); }),
                fetch(apiUrl('/api/business/sku-items/upcs'), { credentials: 'include' }).then((r) => { if (!r.ok) throw new Error('x'); return r.json(); }),
            ]);
            const options = (cats && cats.options) || {};
            const raw = { udm: options.udm || [], categories: Object.fromEntries(CAT_COLS.map((c) => [c.type, options[c.type] || []])), upcs: upcs.upcs || [] };
            try { localStorage.setItem(CTX_CACHE, JSON.stringify(raw)); } catch { /* sin espacio */ }
            return build(raw);
        } catch {
            try { const cached = JSON.parse(localStorage.getItem(CTX_CACHE) || 'null'); return cached ? build(cached) : null; } catch { return null; }
        }
    }
    const build = (raw) => ({ udm: raw.udm, categories: raw.categories, existing: new Map(raw.upcs.map(([upc, sku]) => [upc, sku])) });

    // ---- plantilla ---------------------------------------------------------------------------------------------------------------------------
    function templateFile() {
        const options = (list) => (list || []).slice(0, 12).join(', ') || '—';
        const inst = (c) => {
            if (c.key === 'upc') return [t('main.tplInstUpc'), '7501003126410'];
            if (c.kind === 'udm') return [t('main.tplInstUdm', { list: options(ctx && ctx.udm) }), ((ctx && ctx.udm) || [])[0] || ''];
            if (c.kind === 'type') return [t('main.tplInstType'), 'Artículo Terminado'];
            if (c.kind === 'number') return [t(c.unit === 'kg' ? 'main.tplInstNumberKg' : 'main.tplInstNumberCm'), { height: '4', length: '11', width: '6', articleWeight: '0.045', packageWeight: '0.060' }[c.key]];
            if (c.kind === 'category') return [t('main.tplInstCategory', { list: options(ctx && ctx.categories[c.type]) }), ((ctx && ctx.categories[c.type]) || [])[0] || ''];
            return [t('main.tplInstText'), { uniqueDescription: 'Paracetamol 500 mg tabletas, caja con 20', knownDescription: 'Tempra', customDescription: 'Paracetamol 500 caja' }[c.key] || ''];
        };
        const bytes = X.writeXlsx([
            { name: t('main.tplSheetTemplate'), rows: [COLS.map(header)], widths: COLS.map((c) => Math.max(14, header(c).length + 4)), headerRow: true, textColumns: [0] },
            { name: t('main.tplSheetHelp'), rows: [[t('main.tplInstColumn'), t('main.tplInstRequired'), t('main.tplInstWhat'), t('main.tplInstExample')], ...COLS.map((c) => { const [what, example] = inst(c); return [header(c), c.required ? t('main.tplYes') : t('main.tplNo'), what, example]; })], widths: [30, 14, 90, 36], headerRow: true },
        ]);
        return new File([bytes], `${t('main.tplFileName')}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }
    // En el celular se comparte (WhatsApp, correo, Drive...); si el sistema no puede compartir archivos se intenta bajarla directo.
    async function shareTemplate() {
        const file = templateFile();
        try {
            if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: t('main.tplTitle') }); return; }
        } catch (err) {
            if (err && err.name === 'AbortError') return;
        }
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        env.showToast(t('home.tplappDownloadHint'));
    }

    // ---- leer lo que se eligió o se pegó ----------------------------------------------------------------------------------------------------
    async function handleFile(file) {
        if (file.size > 5 * 1024 * 1024) { setInfo(t('main.tplReadError'), true); return; }
        const name = file.name.toLowerCase();
        try {
            let matrix;
            if (name.endsWith('.xlsx')) matrix = await X.readXlsx(await file.arrayBuffer());
            else if (/\.(csv|tsv|txt)$/.test(name)) matrix = T.parseDelimited(await file.text());
            else { setInfo(t('main.tplReadError'), true); return; }
            loadMatrix(matrix, file.name);
        } catch (err) {
            console.error('Plantilla (App): no se pudo leer el archivo', err);
            setInfo(t(err && err.message === 'no-decompression' ? 'main.tplNoXlsxSupport' : 'main.tplReadError'), true);
        }
    }
    function loadMatrix(matrix) {
        const res = T.rowsFromMatrix(matrix);
        if (res.error === 'empty' || (!res.error && !res.rows.length)) { setInfo(t('main.tplNoRows'), true); return; }
        if (res.error === 'columns') { setInfo(t('main.tplNoColumns'), true); return; }
        if (res.rows.length > T.MAX_ROWS) { setInfo(t('main.tplTooMany', { n: res.rows.length, max: T.MAX_ROWS }), true); return; }
        rows = res.rows.map((r) => ({ n: r.n, v: r.v, out: false, err: null, fixed: false }));
        usedKeys = new Set(res.usedKeys);
        filterBad = false;
        result = null;
        const ignored = (res.ignored || []).length ? ` · ${t('main.tplIgnored', { list: res.ignored.slice(0, 6).join(', ') })}` : '';
        info = { text: `${t('main.tplFileInfo', { rows: rows.length, cols: usedKeys.size })}${ignored}`, error: false };
        validateAll();
        draw();
    }
    function setInfo(text, error) { info = { text, error }; draw(); }

    // ---- revisión ------------------------------------------------------------------------------------------------------------------------------
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
    function counts() {
        let ok = 0; let bad = 0; let gone = 0;
        rows.forEach((r) => { if (r.out) gone += 1; else if (r.err) bad += 1; else ok += 1; });
        return { ok, bad, gone };
    }

    // ---- dibujo -----------------------------------------------------------------------------------------------------------------------------------
    function fixInput(r, i) {
        const c = T.BY_KEY[r.err.field];
        const list = c.kind === 'udm' ? 'tplapp-dl-udm' : (c.kind === 'type' ? 'tplapp-dl-type' : (c.kind === 'category' ? `tplapp-dl-${c.type}` : ''));
        return `<div class="relapp-field"><label for="tplapp-fix-${i}">${esc(header(c))}</label><input id="tplapp-fix-${i}" class="relapp-input tplapp-fix" data-i="${i}" data-k="${c.key}" type="text" value="${esc(r.v[c.key])}"${list ? ` list="${list}"` : ''}${c.kind === 'number' ? ' inputmode="decimal"' : (c.key === 'upc' ? ' inputmode="numeric"' : '')}></div>`;
    }
    function cardHtml(r, i) {
        const stateKey = r.out ? 'main.tplStateRemoved' : (r.err ? (r.err.code === 'upcExists' || r.err.code === 'upcDuplicateFile' ? 'main.tplStateRepeated' : 'main.tplStateInvalid') : 'main.tplStateReady');
        const cls = r.out ? 'gone' : (r.err ? 'bad' : 'ok');
        const desc = r.v.uniqueDescription || r.v.knownDescription || r.v.customDescription || '';
        return `<div class="tplapp-card ${cls}">
            <div class="tplapp-card-head"><b>${esc(t('main.tplColRow'))} ${r.n} · ${esc(r.v.upc || '—')}</b><span class="relapp-tag ${cls === 'ok' ? 'ok' : 'partial'}">${esc(t(stateKey))}</span></div>
            ${desc ? `<p class="tplapp-desc">${esc(desc)}</p>` : ''}
            ${r.err && !r.out ? `<p class="tplapp-why">${esc(errText(r.err))}</p>${fixInput(r, i)}` : ''}
            ${!r.err && !r.out && r.fixed ? `<p class="tplapp-fixed">${esc(t('main.tplFixedWillLoad'))}</p>` : ''}
            ${r.out ? `<p class="relapp-muted">${esc(t('main.tplRemovedHint'))}</p>` : ''}
            <button type="button" class="home-carga-secondary-btn tplapp-rm" data-rm="${i}">${esc(t(r.out ? 'main.tplRestoreRow' : 'main.tplRemoveRow'))}</button>
        </div>`;
    }
    function draw() {
        if (!env) return;
        const { bodyEl, titleEl } = env;
        titleEl.textContent = t('main.tplTitle');
        const c = counts();
        if (result) { drawResult(); return; }
        const listOf = (arr) => `<datalist id="tplapp-dl-udm">${(ctx.udm || []).map((n) => `<option value="${esc(n)}">`).join('')}</datalist><datalist id="tplapp-dl-type"><option value="Artículo Terminado"><option value="Materia Prima"></datalist>${arr.map((cc) => `<datalist id="tplapp-dl-${cc.type}">${(ctx.categories[cc.type] || []).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`).join('')}`;
        const shown = rows.map((r, i) => ({ r, i })).filter(({ r }) => !filterBad || r.err);
        bodyEl.innerHTML = `
            <button type="button" class="home-carga-secondary-btn" id="tplapp-share" data-help-key="tplDownload"><i class="bx bx-share-alt" aria-hidden="true"></i><span>${esc(t('home.tplappShare'))}</span></button>
            <div class="tplapp-seg" role="group"><button type="button" id="tplapp-mode-file" aria-pressed="${mode === 'file'}" data-help-key="tplUpload">${esc(t('main.tplModeFile'))}</button><button type="button" id="tplapp-mode-paste" aria-pressed="${mode === 'paste'}" data-help-key="tplPaste">${esc(t('main.tplModePaste'))}</button></div>
            ${mode === 'file'
        ? `<button type="button" class="home-carga-new-btn" id="tplapp-pick"><i class="bx bx-file" aria-hidden="true"></i><span>${esc(t('main.tplChooseFile'))}</span></button><input type="file" id="tplapp-file" accept=".xlsx,.csv,.tsv,.txt" hidden>`
        : `<textarea id="tplapp-paste" class="relapp-input tplapp-paste" spellcheck="false" placeholder="${esc(t('main.tplPastePlaceholder'))}"></textarea><button type="button" class="home-carga-new-btn" id="tplapp-paste-go"><i class="bx bx-check-double" aria-hidden="true"></i><span>${esc(t('main.tplPasteGo'))}</span></button>`}
            ${info.text ? `<p class="${info.error ? 'tplapp-error' : 'relapp-muted'}">${esc(info.text)}</p>` : ''}
            ${rows.length ? `<div class="tplapp-counts"><span>${esc(t('main.tplRows', { n: rows.length }))}</span><span class="ok"><b>${c.ok}</b> ${esc(t('main.tplReady'))}</span>${c.bad ? `<span class="bad"><b>${c.bad}</b> ${esc(t('main.tplWithError'))}</span>` : ''}${c.gone ? `<span><b>${c.gone}</b> ${esc(t('main.tplRemoved'))}</span>` : ''}</div>
            <div class="tplapp-seg" role="group"><button type="button" id="tplapp-f-all" aria-pressed="${!filterBad}">${esc(t('main.tplAll'))}</button><button type="button" id="tplapp-f-bad" aria-pressed="${filterBad}">${esc(t('main.tplOnlyErrors'))}</button></div>
            <div class="tplapp-cards" data-help-key="tplReview">${shown.map(({ r, i }) => cardHtml(r, i)).join('') || `<p class="home-carga-empty-note">${esc(t('main.tplAllReady'))}</p>`}</div>
            <button type="button" class="home-carga-new-btn tplapp-go" id="tplapp-go" data-help-key="tplLoad"${c.ok === 0 || busy ? ' disabled' : ''}><i class="bx bx-upload" aria-hidden="true"></i><span>${esc(busy ? t('main.tplLoading') : t(c.ok === 1 ? 'main.tplLoadOne' : 'main.tplLoadN', { n: c.ok }))}</span></button>
            ${listOf(CAT_COLS)}` : ''}`;
        bind();
    }
    function bind() {
        const q = (id) => document.getElementById(id);
        q('tplapp-share').addEventListener('click', shareTemplate);
        q('tplapp-mode-file').addEventListener('click', () => { mode = 'file'; draw(); });
        q('tplapp-mode-paste').addEventListener('click', () => { mode = 'paste'; draw(); });
        if (q('tplapp-pick')) {
            q('tplapp-pick').addEventListener('click', () => q('tplapp-file').click());
            q('tplapp-file').addEventListener('change', async (event) => { const file = event.target.files && event.target.files[0]; event.target.value = ''; if (file) await handleFile(file); });
        }
        if (q('tplapp-paste-go')) q('tplapp-paste-go').addEventListener('click', () => loadMatrix(T.parseDelimited(q('tplapp-paste').value)));
        if (q('tplapp-f-all')) {
            q('tplapp-f-all').addEventListener('click', () => { filterBad = false; draw(); });
            q('tplapp-f-bad').addEventListener('click', () => { filterBad = true; draw(); });
            q('tplapp-go').addEventListener('click', send);
        }
        // al terminar de escribir el dato corregido (o salir del campo) se revisa todo otra vez
        document.querySelectorAll('.tplapp-fix').forEach((el) => el.addEventListener('change', () => {
            const r = rows[Number(el.dataset.i)];
            const had = !!r.err;
            r.v[el.dataset.k] = el.value;
            validateAll();
            if (had && !r.err) r.fixed = true;
            draw();
        }));
        document.querySelectorAll('[data-rm]').forEach((el) => el.addEventListener('click', () => { const r = rows[Number(el.dataset.rm)]; r.out = !r.out; validateAll(); draw(); }));
    }

    // ---- cargar ---------------------------------------------------------------------------------------------------------------------------------
    async function send() {
        const good = rows.filter((r) => !r.out && !r.err);
        if (!good.length || busy) return;
        busy = true;
        draw();
        try {
            const description = `${t('main.tplTitle')} · ${good.length}`;
            const res = await window.SgnOfflineSync.offlineAwareFetch('/api/business/sku-items/import',
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ rows: good.map((r) => ({ n: r.n, v: r.v })) }) },
                description, `nuestros-articulos:import:${Date.now()}`, null, { rejectable: true, reportFailed: true });
            busy = false;
            if (res.queued) {
                env.showToast(t('home.tplappQueued'));
                result = { created: [], queued: good.length, notLoaded: rows.filter((r) => r.out || r.err).map((r) => ({ r, reason: r.out ? t('main.tplRemovedHint') : errText(r.err) })) };
                draw();
                return;
            }
            if (!res.ok) { env.showToast(res.body.message || t('main.tplLoadError')); draw(); return; }
            const serverFailed = new Map((res.body.failed || []).map((f) => [good[f.index].n, f]));
            result = { created: res.body.created || [], queued: 0, notLoaded: [] };
            rows.forEach((r) => {
                if (r.out) result.notLoaded.push({ r, reason: t('main.tplRemovedHint') });
                else if (r.err) result.notLoaded.push({ r, reason: errText(r.err) });
                else if (serverFailed.has(r.n)) result.notLoaded.push({ r, reason: serverFailed.get(r.n).message });
            });
            draw();
            if (env.onLoaded) await env.onLoaded();
        } catch (err) {
            console.error('Plantilla (App): no se pudo cargar', err);
            busy = false;
            env.showToast(t('main.tplLoadError'));
            draw();
        }
    }
    function drawResult() {
        const { bodyEl } = env;
        const created = result.created;
        const skipped = result.notLoaded.length;
        const range = created.length ? t('main.tplResultRange', { from: created[0].sku, to: created[created.length - 1].sku }) : '';
        bodyEl.innerHTML = `<div class="tplapp-result">
            <div class="tplapp-result-main"><span class="tplapp-ok"><i class="bx ${result.queued ? 'bx-cloud-upload' : 'bx-check'}" aria-hidden="true"></i></span>
                <div><b>${esc(result.queued ? t('home.tplappQueued') : t(created.length === 1 ? 'main.tplResultOne' : 'main.tplResultN', { n: created.length }))}</b>
                <span>${esc(result.queued ? '' : range)}${esc(skipped ? t(skipped === 1 ? 'main.tplResultSkippedOne' : 'main.tplResultSkipped', { n: skipped }) : (result.queued ? '' : t('main.tplResultAll')))}</span></div></div>
            ${skipped ? `<div class="tplapp-cards">${result.notLoaded.map(({ r, reason }) => `<div class="tplapp-card bad"><div class="tplapp-card-head"><b>${esc(t('main.tplColRow'))} ${r.n} · ${esc(r.v.upc || '—')}</b></div><p class="tplapp-why">${esc(reason)}</p></div>`).join('')}</div>
            <button type="button" class="home-carga-secondary-btn" id="tplapp-copy"><i class="bx bx-copy" aria-hidden="true"></i><span>${esc(t('home.tplappCopyRows'))}</span></button>` : ''}
            <button type="button" class="home-carga-new-btn" id="tplapp-again"><i class="bx bx-refresh" aria-hidden="true"></i><span>${esc(t('main.tplLoadAnother'))}</span></button></div>`;
        const copy = document.getElementById('tplapp-copy');
        if (copy) copy.addEventListener('click', copyNotLoaded);
        document.getElementById('tplapp-again').addEventListener('click', () => { rows = []; result = null; info = { text: '', error: false }; draw(); });
    }
    // Las filas que no se cargaron, con su motivo, como texto con tabuladores: se pega directo en Excel.
    async function copyNotLoaded() {
        const lines = [[t('main.tplColRow'), ...COLS.map(header), t('main.tplColReason')].join('\t'), ...result.notLoaded.map(({ r, reason }) => [r.n, ...COLS.map((c) => r.v[c.key] || ''), reason].join('\t'))];
        const text = lines.join('\n');
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const box = document.createElement('textarea');
            box.value = text;
            document.body.appendChild(box);
            box.select();
            try { document.execCommand('copy'); } catch { /* sin portapapeles */ }
            box.remove();
        }
        env.showToast(t('home.tplappCopied'));
    }

    // AppNuestrosArticulos.js llama aquí cada vez que dibuja la vista "template".
    async function render(e) {
        env = e;
        document.getElementById('carga-progress-track').hidden = true;
        document.getElementById('carga-progress-label').hidden = true;
        if (!ctx) ctx = await loadCtx();
        if (!ctx) { env.titleEl.textContent = t('main.tplTitle'); env.bodyEl.innerHTML = `<p class="home-carga-empty-note">${esc(t('home.tplappNeedCatalogs'))}</p>`; return; }
        draw();
    }
    function reset() { ctx = null; rows = []; result = null; info = { text: '', error: false }; filterBad = false; mode = 'file'; busy = false; }

    window.AppSkuTemplate = { canUse, render, reset };
}());
