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
    let criteriaCatalog = []; // Catálogos > Qué se mide
    let avisoCatalog = []; // Catálogos > Qué se avisa
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
        await Promise.all([reloadCatalog('activos-criterios'), reloadCatalog('activos-avisos')]);
    }
    // Los dos catálogos que el modelo solo elige (se piden otra vez al crear uno nuevo desde la lista).
    async function reloadCatalog(type) {
        let rows = [];
        try {
            const res = await fetch(`/api/business/article-categories/${type}`, { credentials: 'include' });
            if (res.ok) rows = ((await res.json()).categories || []).slice().sort((a, z) => a.id - z.id);
        } catch (err) { console.error('Modelos de activos: failed to load catalog', type, err); }
        if (type === 'activos-criterios') criteriaCatalog = rows; else avisoCatalog = rows;
        return rows;
    }
    function pickerCell(model, kind) {
        const isCrit = kind === 'criteria';
        return AssetCriteria.catalogPickerCell({
            model, kind, colId: isCrit ? 'colActModCriterios' : 'colActModAvisos', apiKey: isCrit ? 'criteriaIds' : 'avisoIds', catalog: isCrit ? criteriaCatalog : avisoCatalog,
            tableKey: TABLE, canCreate: true, helpKey: isCrit ? 'assetModelCriteria' : 'assetModelAvisos', isPending,
            onSave: (ids) => commit(model, { [isCrit ? 'criteriaIds' : 'avisoIds']: ids }),
            reload: () => reloadCatalog(isCrit ? 'activos-criterios' : 'activos-avisos'),
        });
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
    // Fotos del modelo (2026-11-13): «Desde las fotos del modelo» sirve para CUALQUIER tipo (cada modelo se dibuja como es) y se elige sola al subir la primera foto; para elegirla a mano hace falta al menos una foto.
    const photosOf = (model) => model.photos || {};
    const photoCount = (model) => Object.keys(photosOf(model)).length;
    const photoThumbUrl = (model, face) => (photosOf(model)[face] ? window.AssetLooks.photoUrl(model.id, face, photosOf(model)[face].ver) : '');
    function lookCell(model) {
        const td = document.createElement('td');
        td.dataset.col = 'colActModApariencia';
        td.setAttribute('data-help-key', 'assetModelLook');
        const kind = (types.find((r) => r.id === model.parentId) || {}).kind || '';
        const looks = window.AssetLooks ? window.AssetLooks.looksFor(kind) : [];
        const hasPhotos = !!model.id && photoCount(model) > 0;
        const effective = window.AssetLooks ? window.AssetLooks.effective(kind, model.look) : '';
        const wrap = document.createElement('span');
        wrap.className = 'asset-look-pick';
        // con fotos, la vista previa es la foto de frente (o la primera que tenga) del propio modelo
        const previewFace = hasPhotos && model.look === 'photos' ? ['front', 'top', 'back', 'left', 'right', 'bottom'].find((f) => photosOf(model)[f]) : '';
        if (previewFace) {
            const img = document.createElement('img');
            img.className = 'asset-look-thumb asset-look-thumb-photo';
            img.alt = '';
            img.src = photoThumbUrl(model, previewFace);
            wrap.appendChild(img);
        } else if (window.AssetLooks && effective) wrap.insertAdjacentHTML('beforeend', window.AssetLooks.thumb(effective));
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
        // «Desde las fotos del modelo»: siempre en la lista; sin fotos sale apagada (se sube una foto y se elige sola)
        const photosOpt = document.createElement('option');
        photosOpt.value = 'photos';
        photosOpt.textContent = t('main.assetLook_photos');
        photosOpt.disabled = !hasPhotos;
        if (!hasPhotos) photosOpt.title = t('main.assetLookNoPhotos');
        select.appendChild(photosOpt);
        select.value = looks.includes(model.look) || (model.look === 'photos' && hasPhotos) ? model.look : '';
        select.disabled = isPending(model, 'look') || !Dashboard.canEditField(TABLE, 'colActModApariencia', model.id ? model.look || '' : '');
        if (select.disabled) select.title = t(isPending(model, 'look') ? 'main.changePending' : 'main.fieldLocked');
        select.addEventListener('change', () => commit(model, { look: select.value }));
        wrap.appendChild(select);
        td.appendChild(wrap);
        return td;
    }
    // La columna «Fotos»: las miniaturas de las 6 caras, cuántas tienen foto y el botón de la cámara que abre la ventana donde se suben, se cambian y se quitan.
    const FACES = ['front', 'back', 'left', 'right', 'top', 'bottom'];
    function photosCell(model) {
        const td = document.createElement('td');
        td.dataset.col = 'colActModFotos';
        td.setAttribute('data-help-key', 'assetModelPhotos');
        const strip = document.createElement('div');
        strip.className = 'mp-strip';
        const n = model.id ? photoCount(model) : 0;
        FACES.forEach((face) => {
            const mini = document.createElement('span');
            mini.className = 'mp-mini';
            if (photosOf(model)[face]) {
                const img = document.createElement('img');
                img.alt = t(`main.modelPhotoFace_${face}`);
                img.title = t(`main.modelPhotoFace_${face}`);
                img.loading = 'lazy';
                img.src = photoThumbUrl(model, face);
                mini.appendChild(img);
            } else mini.classList.add('mp-mini-empty');
            strip.appendChild(mini);
        });
        const count = document.createElement('span');
        count.className = `mp-count${n >= 6 ? ' mp-count-ok' : (n > 0 ? ' mp-count-part' : '')}`;
        count.textContent = fillText('main.modelPhotoCount', { n });
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'admin-icon-btn';
        btn.setAttribute('data-help-key', 'assetModelPhotos');
        btn.setAttribute('aria-label', t('main.modelPhotosOpenBtn'));
        btn.title = model.id ? t('main.modelPhotosOpenBtn') : t('main.modelPhotosNeedsSave');
        btn.disabled = !model.id;
        btn.innerHTML = '<i class="bx bx-camera" aria-hidden="true"></i>';
        btn.addEventListener('click', () => openPhotosDialog(model.id));
        td.append(strip, count, btn);
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
    // «Vigencia de calibración» (2026-11-13): cada cuántos meses se vuelve a calibrar este modelo; con ella Operaciones > Calibraciones propone el vencimiento de cada certificado. Solo la llevan los modelos de un Tipo con «Lleva calibración» = Sí.
    function calibrationMonthsCell(model) {
        const type = types.find((r) => r.id === model.parentId);
        if (!type || !type.needsCalibration) return readonlyCell('colActModVigenciaCal', '', '', t('main.calTypeNoCal'), 'assetModelCalibration');
        return inlineCell({ ...model, calibrationMonths: model.calibrationMonths > 0 ? model.calibrationMonths : '' }, 'colActModVigenciaCal', 'calibrationMonths', {
            inputType: 'number', unit: t('main.calMonthsUnit'), helpKey: 'assetModelCalibration', toValue: (v) => Math.max(0, parseInt(v, 10) || 0),
        });
    }

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
            photosCell(model),
            calibrationMonthsCell(model),
            pickerCell(model, 'criteria'),
            pickerCell(model, 'avisos'),
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

    // --- fotos del modelo --------------------------------------------------------------------------------------------------------------------------------------
    // La ventana «Fotos del modelo»: seis cuadros (uno por cara, mirando el equipo de frente) con el fondo de cuadritos para ver si la foto es transparente, y la caja ya armada que gira. El navegador recorta los bordes transparentes y
    // reduce la foto (lado más largo: 640 px) antes de mandarla; el servidor la guarda en la base y el Layout la usa en el 3D y en el croquis.
    const PHOTO_MAX_SIDE = 640;
    const PHOTO_READ_SIDE = 1600; // una foto muy grande se baja a esto antes de revisar sus píxeles
    const canvasBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    // Fondo blanco de una foto de catálogo (2026-11-13, Daniel: «se ve raro el contorno blanco al frente»): si el borde de la foto es blanco y sin transparencia, el blanco que toca el borde se vuelve transparente (se recorre desde
    // los bordes hacia adentro, así los blancos de adentro —el vidrio, un reflejo— se conservan) y la foto se recorta a lo que quedó, para que el equipo llene su cara. Una foto que ya trae transparencia, o cuyo fondo no es blanco, no se toca.
    // (La misma regla está en CatCentroDistActivosModelos.js para las fotos que se suben; aquí cubre las que ya estaban subidas.) src = imagen o canvas; devuelve un canvas nuevo, o null si no hay nada que quitar.
    function cutoutWhiteBackground(src, maxSide) {
        const sw = src.naturalWidth || src.width;
        const sh = src.naturalHeight || src.height;
        if (!(sw > 0 && sh > 0)) return null;
        const k = Math.min(1, (maxSide || 768) / Math.max(sw, sh));
        const w = Math.max(1, Math.round(sw * k));
        const h = Math.max(1, Math.round(sh * k));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(src, 0, 0, w, h);
        let id;
        try { id = g.getImageData(0, 0, w, h); } catch (e) { return null; }
        const d = id.data;
        const near = (i) => d[i + 3] > 240 && d[i] >= 242 && d[i + 1] >= 242 && d[i + 2] >= 242 && Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) <= 14;
        const edge = [];
        for (let x = 0; x < w; x++) { edge.push(x, (h - 1) * w + x); }
        for (let y = 1; y < h - 1; y++) { edge.push(y * w, y * w + w - 1); }
        let whiteEdge = 0;
        for (const p of edge) {
            if (d[p * 4 + 3] < 250) return null; // ya trae transparencia: es un recorte
            if (near(p * 4)) whiteEdge += 1;
        }
        if (whiteEdge / edge.length < 0.85) return null; // el fondo no es blanco
        const gone = new Uint8Array(w * h);
        const queue = new Int32Array(w * h);
        let head = 0; let tail = 0;
        for (const p of edge) if (near(p * 4) && !gone[p]) { gone[p] = 1; queue[tail++] = p; }
        while (head < tail) {
            const p = queue[head++];
            const x = p % w; const y = (p - x) / w;
            const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
            for (const q of next) if (q >= 0 && !gone[q] && near(q * 4)) { gone[q] = 1; queue[tail++] = q; }
        }
        if (tail < w * h * 0.005 || tail > w * h * 0.985) return null; // casi nada que quitar, o casi todo (no es una foto de equipo)
        // un borde suave: el pixel claro que toca lo quitado se vuelve medio transparente (sin halo blanco)
        const fade = [];
        for (let p = 0; p < w * h; p++) {
            if (gone[p]) continue;
            const x = p % w; const y = (p - x) / w;
            const touches = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (y > 0 && gone[p - w]) || (y < h - 1 && gone[p + w]);
            if (!touches) continue;
            const m = Math.min(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]);
            if (m > 200) fade.push(p, Math.round(255 * Math.max(0, Math.min(1, (244 - m) / 44))));
        }
        let minX = w; let minY = h; let maxX = -1; let maxY = -1;
        for (let p = 0; p < w * h; p++) {
            if (gone[p]) { d[p * 4 + 3] = 0; continue; }
            const x = p % w; const y = (p - x) / w;
            if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        for (let i = 0; i < fade.length; i += 2) d[fade[i] * 4 + 3] = Math.min(d[fade[i] * 4 + 3], fade[i + 1]);
        if (maxX < minX || maxY < minY) return null;
        g.putImageData(id, 0, 0);
        const bw = maxX - minX + 1; const bh = maxY - minY + 1;
        const out = document.createElement('canvas');
        out.width = bw; out.height = bh;
        out.getContext('2d').drawImage(c, minX, minY, bw, bh, 0, 0, bw, bh);
        return out;
    }
    async function prepareModelPhoto(file) {
        if (!file || !/^image\/(png|webp|jpe?g)$/i.test(file.type || '')) throw Object.assign(new Error('type'), { code: 'type' });
        const bmp = await createImageBitmap(file);
        const k0 = Math.min(1, PHOTO_READ_SIDE / Math.max(bmp.width, bmp.height));
        let w0 = Math.max(1, Math.round(bmp.width * k0));
        let h0 = Math.max(1, Math.round(bmp.height * k0));
        let c0 = document.createElement('canvas');
        c0.width = w0; c0.height = h0;
        let g0 = c0.getContext('2d', { willReadFrequently: true });
        g0.drawImage(bmp, 0, 0, w0, h0);
        if (bmp.close) bmp.close();
        // fondo blanco de catálogo: se quita antes de recortar (la foto sale sin el contorno blanco y el equipo llena su cara)
        let cleaned = false;
        try {
            const cut = cutoutWhiteBackground(c0, PHOTO_READ_SIDE);
            if (cut) { c0 = cut; w0 = cut.width; h0 = cut.height; g0 = c0.getContext('2d', { willReadFrequently: true }); cleaned = true; }
        } catch (err) { /* sin limpieza: la foto sube como vino */ }
        let box = { x: 0, y: 0, w: w0, h: h0 };
        let hasAlpha = false;
        if (cleaned || !/jpe?g/i.test(file.type)) {
            const px = g0.getImageData(0, 0, w0, h0).data;
            let minX = w0; let minY = h0; let maxX = -1; let maxY = -1;
            for (let y = 0; y < h0; y++) {
                for (let x = 0; x < w0; x++) {
                    const a = px[(y * w0 + x) * 4 + 3];
                    if (a < 250) hasAlpha = true;
                    if (a > 12) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
                }
            }
            if (hasAlpha && maxX >= minX && maxY >= minY) box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }; // los bordes transparentes se recortan: el equipo llena su cara
        }
        const k = Math.min(1, PHOTO_MAX_SIDE / Math.max(box.w, box.h));
        const w = Math.max(1, Math.round(box.w * k));
        const h = Math.max(1, Math.round(box.h * k));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(c0, box.x, box.y, box.w, box.h, 0, 0, w, h);
        let blob = await canvasBlob(c, 'image/webp', 0.92);
        if (!blob || blob.type !== 'image/webp') blob = await canvasBlob(c, 'image/png');
        if (!blob) throw Object.assign(new Error('encode'), { code: 'type' });
        return { blob, width: w, height: h, hasAlpha };
    }
    // La caja del modelo (CSS 3D) con sus fotos: el frente al frente; derecha e izquierda se cuentan mirando el equipo de frente.
    function previewCube(model) {
        const L = Number(model.length) > 0 ? Number(model.length) : 10;
        const H = Number(model.height) > 0 ? Number(model.height) : 10;
        const D = Number(model.shape === 'cilindrica' ? model.length : model.depth) > 0 ? Number(model.shape === 'cilindrica' ? model.length : model.depth) : Math.min(L, H) * 0.3;
        const k = 150 / Math.max(L, H, D);
        const stage = document.createElement('div');
        stage.className = 'mp-stage';
        const cube = document.createElement('div');
        cube.className = 'mp-cube';
        cube.style.setProperty('--w', `${(L * k).toFixed(1)}px`);
        cube.style.setProperty('--h', `${(H * k).toFixed(1)}px`);
        cube.style.setProperty('--d', `${Math.max(D * k, 6).toFixed(1)}px`);
        FACES.forEach((face) => {
            const f = document.createElement('div');
            f.className = `mp-face mp-face-${face}`;
            if (photosOf(model)[face]) f.style.backgroundImage = `url("${photoThumbUrl(model, face)}")`;
            cube.appendChild(f);
        });
        stage.appendChild(cube);
        return stage;
    }
    function openPhotosDialog(modelId) {
        const current = () => models.find((m) => m.id === modelId);
        if (!current()) return;
        const canEditPhotos = Dashboard.canEditField(TABLE, 'colActModFotos', '');
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        const panel = document.createElement('div');
        panel.className = 'modal-panel mp-win';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        const onKey = (event) => { if (event.key === 'Escape') close(); };
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
        document.addEventListener('keydown', onKey);
        overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
        let busy = false;
        const refreshFrom = (category) => {
            const at = models.findIndex((m) => m.id === modelId);
            if (at >= 0 && category) models[at] = category;
            draw();
            if (typeof refreshTable === 'function') refreshTable(); else render();
        };
        async function upload(face, file) {
            if (busy) return;
            busy = true;
            try {
                const prepared = await prepareModelPhoto(file);
                const res = await fetch(`/api/business/asset-models/${modelId}/photos/${face}?w=${prepared.width}&h=${prepared.height}&alpha=${prepared.hasAlpha ? 1 : 0}`, {
                    method: 'PUT', headers: { 'Content-Type': prepared.blob.type }, credentials: 'include', body: prepared.blob,
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) { Dashboard.showToast(body.message || t('admin.saveError'), res.status === 403 ? 'warning' : 'error'); return; }
                Dashboard.showToast(fillText('main.modelPhotoUploaded', { cara: t(`main.modelPhotoFace_${face}`) }), 'success');
                if (body.autoLook) Dashboard.showToast(t('main.modelPhotoAutoLook'), 'info');
                if (!prepared.hasAlpha) Dashboard.showToast(fillText('main.modelPhotoBackground', { cara: t(`main.modelPhotoFace_${face}`) }), 'warning');
                refreshFrom(body.category);
            } catch (err) {
                Dashboard.showToast(t(err && err.code === 'type' ? 'main.modelPhotoBadFile' : 'admin.saveError'), 'error');
            } finally { busy = false; }
        }
        async function remove(face) {
            if (busy) return;
            if (!(await Dashboard.confirm(fillText('main.modelPhotoRemoveConfirm', { cara: t(`main.modelPhotoFace_${face}`) }), { accept: t('main.modelPhotoRemoveAccept') }))) return;
            busy = true;
            try {
                const res = await fetch(`/api/business/asset-models/${modelId}/photos/${face}`, { method: 'DELETE', credentials: 'include' });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) { Dashboard.showToast(body.message || t('admin.saveError'), res.status === 403 ? 'warning' : 'error'); return; }
                Dashboard.showToast(fillText('main.modelPhotoRemoved', { cara: t(`main.modelPhotoFace_${face}`) }), 'success');
                refreshFrom(body.category);
            } catch (err) {
                Dashboard.showToast(t('admin.saveError'), 'error');
            } finally { busy = false; }
        }
        function draw() {
            const model = current();
            if (!model) { close(); return; }
            panel.innerHTML = '';
            const head = document.createElement('header');
            head.className = 'mp-head';
            const titles = document.createElement('div');
            const h3 = document.createElement('h3');
            h3.setAttribute('data-help-key', 'assetModelPhotos');
            h3.textContent = fillText('main.modelPhotosTitle', { modelo: [model.name, model.modelNumber].filter(Boolean).join(' · ') || `#${model.id}` });
            const hint = document.createElement('p');
            hint.className = 'mp-hint';
            hint.textContent = t('main.modelPhotosHint');
            titles.append(h3, hint);
            head.appendChild(titles);
            const slots = document.createElement('div');
            slots.className = 'mp-slots';
            FACES.forEach((face) => {
                const info = photosOf(model)[face];
                const slot = document.createElement('div');
                slot.className = 'mp-slot';
                slot.setAttribute('data-help-key', 'assetModelPhotoSlot');
                const lab = document.createElement('div');
                lab.className = 'mp-lab';
                const name = document.createElement('span');
                name.textContent = t(`main.modelPhotoFace_${face}`);
                const state = document.createElement('span');
                state.className = info ? 'mp-ok' : 'mp-no';
                state.textContent = info ? '✓' : t('main.modelPhotoMissing');
                lab.append(name, state);
                const thumb = document.createElement('div');
                thumb.className = `mp-thumb${info ? '' : ' mp-thumb-empty'}`;
                if (info) {
                    const img = document.createElement('img');
                    img.alt = t(`main.modelPhotoFace_${face}`);
                    img.src = photoThumbUrl(model, face);
                    thumb.appendChild(img);
                } else thumb.textContent = t('main.modelPhotoEmpty');
                const acts = document.createElement('div');
                acts.className = 'mp-acts';
                if (canEditPhotos) {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/png,image/webp,image/jpeg';
                    input.hidden = true;
                    input.id = `mp-file-${face}`;
                    input.addEventListener('change', () => { if (input.files && input.files[0]) upload(face, input.files[0]); input.value = ''; });
                    const pick = document.createElement('button');
                    pick.type = 'button';
                    pick.className = info ? 'btn btn-secondary' : 'btn';
                    pick.textContent = t(info ? 'main.modelPhotoChange' : 'main.modelPhotoUpload');
                    pick.addEventListener('click', () => input.click());
                    acts.append(input, pick);
                    if (info) {
                        const del = document.createElement('button');
                        del.type = 'button';
                        del.className = 'btn btn-secondary mp-del';
                        del.textContent = t('main.modelPhotoRemove');
                        del.addEventListener('click', () => remove(face));
                        acts.appendChild(del);
                    }
                }
                slot.append(lab, thumb, acts);
                slots.appendChild(slot);
            });
            const notes = document.createElement('div');
            notes.className = 'mp-notes';
            const n = photoCount(model);
            if (!canEditPhotos) {
                const ro = document.createElement('p');
                ro.className = 'mp-note';
                ro.textContent = t('main.modelPhotosReadOnly');
                notes.appendChild(ro);
            }
            if (n > 0 && n < 6) {
                const miss = document.createElement('p');
                miss.className = 'mp-note mp-note-warn';
                miss.textContent = fillText('main.modelPhotosMissingNote', { n: 6 - n });
                notes.appendChild(miss);
            }
            if (FACES.some((f) => photosOf(model)[f] && !photosOf(model)[f].alpha)) {
                const bg = document.createElement('p');
                bg.className = 'mp-note mp-note-warn';
                bg.textContent = t('main.modelPhotosBackgroundNote');
                notes.appendChild(bg);
            }
            const prev = document.createElement('div');
            prev.className = 'mp-preview';
            const prevText = document.createElement('div');
            const prevTitle = document.createElement('b');
            prevTitle.textContent = t('main.modelPhotosPreview');
            const prevSize = document.createElement('small');
            prevSize.textContent = Number(model.length) > 0 && Number(model.height) > 0 ? fillText('main.modelPhotosPreviewSize', { l: model.length, h: model.height, d: model.shape === 'cilindrica' ? model.length : model.depth }) : t('main.modelPhotosPreviewNoSize');
            prevText.append(prevTitle, prevSize);
            prev.append(prevText, previewCube(model));
            const foot = document.createElement('footer');
            foot.className = 'mp-foot';
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'btn btn-secondary';
            closeBtn.textContent = t('main.modelPhotosClose');
            closeBtn.addEventListener('click', close);
            foot.appendChild(closeBtn);
            panel.append(head, slots, notes, prev, foot);
        }
        draw();
    }

    // --- el panel ----------------------------------------------------------------------------------------------------------------------------------------------
    const COLUMNS = [
        ['colActModNombreCompra', 'main.colActModNombreCompra'], ['colActModNombrePersonalizado', 'main.colActModNombrePersonalizado'], ['colActModModelo', 'main.colActModModelo'], ['colActModForma', 'main.colActModForma'],
        ['colActModAlto', 'main.colActModAlto'], ['colActModLargo', 'main.colActModLargo'], ['colActModProfundidad', 'main.colActModProfundidad'], ['colActModPeso', 'main.colActModPeso'],
        ['colActModVolumen', 'main.colActModVolumen'], ['colActModApariencia', 'main.colActModApariencia'], ['colActModFotos', 'main.colActModFotos'], ['colActModVigenciaCal', 'main.colActModVigenciaCal'], ['colActModCriterios', 'main.colActModCriterios'], ['colActModAvisos', 'main.colActModAvisos'], ['colCatStatus', 'main.colCatStatus'], ['colActModUso', 'main.colActModUso'], ['actions', 'main.colActions'],
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
                draft = { id: null, parentId: type.id, name: '', customName: '', modelNumber: '', shape: 'rectangular', height: 0, length: 0, depth: 0, weight: 0, volume: 0, look: '', calibrationMonths: 0, status: 'active', usedBy: 0, complete: false, pendingFields: [] };
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
