// ---------------------------------------------------------------------------
// Verificador Código (SKU) (Operaciones, C. Distribución): se busca o se escanea un código (SKU, UPC o descripción; un lector de código de barras escribe en el campo igual que el
// teclado) y se ve qué artículo es (su ficha con medidas, pesos y las 7 categorías) y DÓNDE ESTÁ, que sale de Relación Código: un renglón por cada lugar con la ruta completa
// (centro de costos > almacén > sub almacén > zona > estante > nivel > espacio). Con sesión; lo de costos y otras áreas todavía no está definido y no aparece.
// Envuelto en una función: Dashboard.js ya declara globales como t.
// ---------------------------------------------------------------------------
(function () {
    const t = (key, params) => {
        let text = Dashboard.t(key);
        Object.entries(params || {}).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
        return text;
    };
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const $ = (id) => document.getElementById(id);
    const API = '/api/business';
    let searchTimer = null;
    let searchToken = 0;
    let currentId = null;   // el artículo abierto (se vuelve a abrir al cambiar los centros de costos marcados arriba)

    (async function init() {
        try {
            const role = await Dashboard.initDashboard({ activePage: 'cat-operaciones-centro-dist-verificador-sku' });
            if (!role) return;
            render();
        } catch (err) {
            console.error('Code Verifier (SKU) failed to initialize:', err);
        }
    })();

    function render() {
        const page = document.querySelector('.page-content');
        page.innerHTML = `<div class="vf" data-help-key="verificadorSkuEmpty">
            <div class="vf-search">
                <i class="bx bx-scan" aria-hidden="true"></i>
                <input type="search" id="vf-q" autocomplete="off" autofocus placeholder="${esc(t('main.vfPlaceholder'))}" aria-label="${esc(t('main.vfPlaceholder'))}">
            </div>
            <div class="vf-results" id="vf-results" hidden></div>
            <div class="vf-detail" id="vf-detail"></div>
        </div>`;
        const input = $('vf-q');
        input.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(search, 250); });
        // un lector de código de barras termina con Enter: si hay un solo resultado se abre solo
        input.addEventListener('keydown', async (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            clearTimeout(searchTimer);
            const found = await search();
            if (found && found.length === 1) openArticle(found[0].id);
        });
        $('vf-results').addEventListener('click', (event) => {
            const btn = event.target.closest('[data-id]');
            if (btn) openArticle(Number(btn.dataset.id));
        });
        $('vf-detail').innerHTML = `<div class="empty-state"><i class="bx bx-scan" aria-hidden="true"></i><p>${esc(t('main.verificadorSkuEmptyState'))}</p></div>`;
    }

    async function search() {
        const q = $('vf-q').value.trim();
        const box = $('vf-results');
        const token = ++searchToken;
        if (!q) { box.hidden = true; return []; }
        try {
            const res = await fetch(`${API}/code-relations/skus?q=${encodeURIComponent(q)}`, { credentials: 'include' });
            if (!res.ok) throw new Error('search failed');
            const { skus } = await res.json();
            if (token !== searchToken) return skus;
            box.innerHTML = skus.length
                ? skus.map((s) => `<button type="button" class="vf-result" data-id="${s.id}"><b>${esc(s.sku)}</b> ${esc(s.description)} <span class="vf-muted">${esc(s.upc)}</span></button>`).join('')
                : `<span class="vf-muted">${esc(t('main.vfNoResults'))}</span>`;
            box.hidden = false;
            return skus;
        } catch (err) {
            console.error('Verificador: la búsqueda falló', err);
            return [];
        }
    }

    function fieldRow(labelKey, value, suffix) {
        const has = value !== null && value !== undefined && value !== '' && value !== 0;
        return `<div class="vf-field"><span>${esc(t(labelKey))}</span><b>${has ? esc(value) + (suffix ? ` ${suffix}` : '') : '—'}</b></div>`;
    }
    const TYPE_KEYS = { 'articulo-terminado': 'main.articleTypeFinished', 'materia-prima': 'main.articleTypeRawMaterial' };

    function locationHtml(loc) {
        const steps = [loc.centroCostos, loc.warehouseName, loc.subWarehouseName, loc.zoneName, loc.spaceCode, loc.level ? t('main.relLevelN', { n: loc.level }) : '', loc.slot ? t('main.relSlotN', { n: loc.slot }) : '', loc.row && loc.bayRows > 1 ? t('main.relRowN', { n: loc.row }) : '', loc.depth && loc.bayDepth > 1 ? t('main.relDepthN', { n: loc.depth }) : ''];
        const labels = [t('main.colRelCentroCostos'), t('main.colRelAlmacen'), t('main.colRelSubAlmacen'), t('main.colRelZona'), t('main.colRelEstante'), t('main.colRelNivel'), t('main.colRelEspacio'), t('main.colRelFila'), t('main.colRelProfundidad')];
        const path = steps.map((value, i) => `${i ? '<span class="rel-arrow">›</span>' : ''}<span class="rel-step${value ? ' rel-step-on' : ''}">${esc(value || labels[i])}</span>`).join('');
        const classKey = ['activo', 'cuarentena', 'aclaracion', 'consigna'].includes(loc.classification) ? loc.classification : 'activo';
        const classTag = `<span class="rel-tag rel-class-${classKey}">${esc(t(`main.relClass_${classKey}`))}</span>`;
        const kind = loc.subKind === 'virtual' ? `<span class="rel-tag rel-tag-partial">${esc(t('main.whVirtual'))}</span>` : '';
        const tag = `<span class="rel-tag ${loc.status === 'located' ? 'rel-tag-ok' : 'rel-tag-partial'}">${esc(t(loc.status === 'located' ? 'main.relStatusLocated' : 'main.relStatusPartial'))}</span>`;
        return `<div class="vf-loc"><div class="rel-path">${path}</div><div class="vf-loc-tags">${kind}${classTag}${tag}</div></div>`;
    }

    // "Dónde está" sigue al selector de centros de costos de arriba: solo los lugares de los centros marcados (uno sin centro se ve siempre). Lo que queda fuera se avisa, sin enseñarlo.
    function whereHtml(locations) {
        const selected = Dashboard.getSelectedCostCenterIds();
        const shown = locations.filter((l) => !selected || !l.costCenterId || selected.includes(l.costCenterId));
        const hidden = locations.length - shown.length;
        if (!shown.length) return `<p class="vf-muted">${esc(hidden ? t('main.vfNoneInSelected', { n: hidden }) : t('main.vfNoLocation'))}</p>`;
        return shown.map(locationHtml).join('') + (hidden ? `<p class="vf-muted">${esc(t('main.vfAlsoElsewhere', { n: hidden }))}</p>` : '');
    }
    document.addEventListener('sgn:cost-centers-changed', () => { if (currentId) openArticle(currentId); });

    async function openArticle(id) {
        currentId = id;
        $('vf-results').hidden = true;
        const detail = $('vf-detail');
        try {
            const res = await fetch(`${API}/verificador/${id}`, { credentials: 'include' });
            if (!res.ok) throw new Error('load failed');
            const { article: a, locations } = await res.json();
            $('vf-q').value = `${a.sku} · ${a.uniqueDescription || a.knownDescription || a.upc}`;
            const cats = [['main.colArticuloCategoriaInventario', a.categoryInventario], ['main.colArticuloCategoriaCompra', a.categoryCompra], ['main.colArticuloCategoriaAlmacenamiento', a.categoryAlmacenamiento],
                ['main.colArticuloCategoriaRotacion', a.categoryRotacion], ['main.colArticuloCategoriaManejo', a.categoryManejo], ['main.colArticuloCategoriaRiesgo', a.categoryRiesgo], ['main.colArticuloCategoriaVidautil', a.categoryVidautil], ['main.colArticuloCategoriaTipoCodigo', a.categoryTipoCodigo]];
            detail.innerHTML = `<section class="vf-card" data-help-key="verificadorFicha">
                    <h2>${esc(a.sku)} · ${esc(a.uniqueDescription || a.knownDescription || a.customDescription || a.upc)}</h2>
                    <div class="vf-grid">
                        ${fieldRow('main.colArticuloUpc', a.upc)}${fieldRow('main.colArticuloDescConocida', a.knownDescription)}${fieldRow('main.colArticuloDescPersonalizada', a.customDescription)}
                        ${fieldRow('main.colArticuloUdm', a.mainUom)}${fieldRow('main.colArticuloTipo', TYPE_KEYS[a.articleType] ? t(TYPE_KEYS[a.articleType]) : a.articleType)}
                        ${fieldRow('main.colArticuloAlto', a.height, 'cm')}${fieldRow('main.colArticuloLargo', a.length, 'cm')}${fieldRow('main.colArticuloAncho', a.width, 'cm')}
                        ${fieldRow('main.colArticuloPesoArticulo', a.articleWeight, 'kg')}${fieldRow('main.colArticuloPesoEmpaque', a.packageWeight, 'kg')}
                    </div>
                    <div class="vf-grid vf-cats">${cats.map(([key, value]) => fieldRow(key, value)).join('')}</div>
                </section>
                <section class="vf-card" data-help-key="verificadorUbicacion">
                    <h2>${esc(t('main.vfWhere'))}</h2>
                    ${whereHtml(locations)}
                </section>`;
        } catch (err) {
            console.error('Verificador: no se pudo abrir el artículo', err);
            detail.innerHTML = `<p class="vf-muted">${esc(t('main.vfLoadError'))}</p>`;
        }
    }
}());
