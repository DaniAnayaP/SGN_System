// ---------------------------------------------------------------------------
// Ubicación en cascada País > Estado > Municipio > Localidad > Calle: cada nivel depende del anterior y cada uno tiene su «+» para crecer, al momento, el catálogo
// (compartido por todos los clientes, ver geo_countries/geo_states/geo_localities/geo_streets en db.js). Estado y Localidad llevan además su código corto del localizador
// (4 y 3 letras). Antes vivía dentro de Nuestros Centros Costos; ahora la ubicación es del SITIO (Sitios Contratados) y el centro de costos solo elige su sitio.
// Uso: const cascade = GeoCascade.create('sit') con los elementos «sit-country», «sit-country-add-toggle», «sit-state-code-row»… en la página.
// ---------------------------------------------------------------------------
(function () {
// Municipio y Localidad son hermanos: los dos cuelgan del Estado, y cambiar uno no borra lo ya elegido en el otro.
const LEVEL_ORDER = ['country', 'state', 'municipality', 'locality', 'street'];
const LEVEL_LABEL_KEY = { country: 'business.ccCountry', state: 'business.ccState', municipality: 'business.ccMunicipality', locality: 'business.ccLocality', street: 'business.ccStreet' };

// Los códigos cortos son solo letras A–Z sin acentos y en mayúsculas.
function cleanShortCode(value, length) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, length);
}
function bindShortCodeInput(input, length) {
    if (!input) return;
    input.addEventListener('input', () => {
        const clean = cleanShortCode(input.value, length);
        if (input.value !== clean) input.value = clean;
    });
}

function create(prefix, options = {}) {
    const el = (suffix) => document.getElementById(`${prefix}-${suffix}`);
    const t = (key, params) => Dashboard.t(key, params);
    const onChange = options.onChange || (() => {});

    const levels = {
        country: {
            select: el('country'), addToggle: el('country-add-toggle'), addRow: el('country-add-row'), addInput: el('country-add-input'), addConfirm: el('country-add-confirm'), items: [], parent: null,
            listUrl: () => '/api/business/geo/countries',
            createUrl: () => '/api/business/geo/countries',
            createBody: (name) => ({ name }),
            titleKey: 'business.ccAddNewCountry',
        },
        state: {
            select: el('state'), addToggle: el('state-add-toggle'), addRow: el('state-add-row'), addInput: el('state-add-input'), addConfirm: el('state-add-confirm'), items: [], parent: 'country',
            listUrl: (parentId) => `/api/business/geo/states?countryId=${parentId}`,
            createUrl: () => '/api/business/geo/states',
            createBody: (name, parentId, code) => ({ countryId: parentId, name, code }),
            titleKey: 'business.ccAddNewState',
            // código corto del localizador: 4 letras (se pone al agregar o, si falta, aquí abajo; ya puesto no se cambia)
            codeLength: 4, addCode: el('state-add-code'), codeRow: el('state-code-row'),
            codeInput: el('state-code'), codeSave: el('state-code-save'), codeUrl: (id) => `/api/business/geo/states/${id}/code`,
            nameInput: el('state-name'), patchUrl: (id) => `/api/business/geo/states/${id}`,
        },
        municipality: {
            select: el('municipality'), addToggle: el('municipality-add-toggle'), addRow: el('municipality-add-row'), addInput: el('municipality-add-input'), addConfirm: el('municipality-add-confirm'), items: [], parent: 'state',
            listUrl: (parentId) => `/api/business/geo/municipalities?stateId=${parentId}`,
            createUrl: () => '/api/business/geo/municipalities',
            createBody: (name, parentId) => ({ stateId: parentId, name }),
            titleKey: 'business.ccAddNewMunicipality',
        },
        locality: {
            select: el('locality'), addToggle: el('locality-add-toggle'), addRow: el('locality-add-row'), addInput: el('locality-add-input'), addConfirm: el('locality-add-confirm'), items: [], parent: 'state',
            listUrl: (parentId) => `/api/business/geo/localities?stateId=${parentId}`,
            createUrl: () => '/api/business/geo/localities',
            createBody: (name, parentId, code) => ({ stateId: parentId, name, code }),
            titleKey: 'business.ccAddNewLocality',
            codeLength: 3, addCode: el('locality-add-code'), codeRow: el('locality-code-row'),
            codeInput: el('locality-code'), codeSave: el('locality-code-save'), codeUrl: (id) => `/api/business/geo/localities/${id}/code`,
            nameInput: el('locality-name'), patchUrl: (id) => `/api/business/geo/localities/${id}`,
        },
        street: {
            select: el('street'), addToggle: el('street-add-toggle'), addRow: el('street-add-row'), addInput: el('street-add-input'), addConfirm: el('street-add-confirm'), items: [], parent: 'locality',
            listUrl: (parentId) => `/api/business/geo/streets?localityId=${parentId}`,
            createUrl: () => '/api/business/geo/streets',
            createBody: (name, parentId) => ({ localityId: parentId, name }),
            titleKey: 'business.ccAddNewStreet',
        },
    };

    // Lo que dicen los errores del servidor (traen un código, no un texto en español).
    function geoErrorText(levelKey, err) {
        const level = levels[levelKey];
        const keys = {
            GEO_CODE_DUPLICATE: levelKey === 'state' ? 'business.ccGeoDupState' : 'business.ccGeoDupLocality',
            GEO_CODE_INVALID: `business.ccGeoCodeInvalid${level.codeLength}`,
            GEO_IN_USE: 'business.ccGeoInUse',
            GEO_NAME_DUPLICATE: 'business.ccGeoNameDup',
            GEO_NAME_REQUIRED: 'business.ccTypeNameFirst',
        };
        return t(keys[err && err.geoCode] || 'admin.saveError');
    }
    // La fila de corrección del nivel (Estado, Localidad) según lo elegido: mientras ningún sitio ni centro de costos use ese Estado o Localidad se pueden corregir su nombre y su código; cuando ya lo usa uno queda fijo
    // (solo se puede poner el código si le faltaba); sin elegir nada se esconde.
    function refreshCodeRow(levelKey) {
        const level = levels[levelKey];
        if (!level.codeRow) return;
        const item = level.items.find((i) => String(i.id) === String(level.select.value));
        level.codeRow.hidden = !item;
        if (!item) return;
        const editable = !item.in_use;
        level.nameInput.value = item.name;
        level.nameInput.hidden = !editable;
        level.codeInput.value = item.code || '';
        level.codeInput.disabled = !editable && !!item.code;
        level.codeSave.hidden = !editable && !!item.code;
    }
    function levelOptionText(level, item) {
        return level.codeLength && item.code ? `${item.name} · ${item.code}` : item.name;
    }
    function populateSelect(selectEl, items, level) {
        selectEl.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = items.length ? t('business.ccSelectPlaceholder') : t('business.ccNoOptionsYet');
        selectEl.appendChild(placeholder);
        items.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = level ? levelOptionText(level, item) : item.name;
            selectEl.appendChild(opt);
        });
    }

    // parentId === null: el requisito del nivel todavía no se elige (solo importa para estado, municipio, localidad y calle); país no tiene padre, así que siempre carga su lista completa.
    async function loadLevel(levelKey, parentId) {
        const level = levels[levelKey];
        if (level.parent && !parentId) {
            level.items = [];
            populateSelect(level.select, [], level);
            level.select.querySelector('option').textContent = t('business.ccSelectParentFirst');
            refreshCodeRow(levelKey);
            level.select.disabled = true;
            level.addToggle.disabled = true;
            level.addRow.hidden = true;
            return;
        }
        try {
            const res = await fetch(level.listUrl(parentId), { credentials: 'include' });
            level.items = res.ok ? (await res.json()).items || [] : [];
        } catch {
            level.items = [];
        }
        populateSelect(level.select, level.items, level);
        level.select.disabled = false;
        level.addToggle.disabled = false;
        refreshCodeRow(levelKey);
    }

    LEVEL_ORDER.forEach((levelKey, idx) => {
        const level = levels[levelKey];
        level.select.addEventListener('change', async () => {
            // Recarga solo los niveles que DESCIENDEN de este (según el .parent de cada uno), no «todo lo que sigue en pantalla»:
            // cambiar el Municipio no debe borrar la Localidad ni la Calle ya elegidas, porque ninguna depende del Municipio.
            const affected = new Set([levelKey]);
            for (let i = idx + 1; i < LEVEL_ORDER.length; i++) {
                const childKey = LEVEL_ORDER[i];
                const child = levels[childKey];
                if (!child.parent || !affected.has(child.parent)) continue;
                await loadLevel(childKey, levels[child.parent].select.value || null);
                affected.add(childKey);
            }
            refreshCodeRow(levelKey);
            onChange();
        });
        bindShortCodeInput(level.addCode, level.codeLength);
        // Corregir (o poner) el nombre y el código de lo ya elegido. El catálogo es de todos los clientes: solo se puede mientras ningún sitio ni centro de costos lo use; si ya lo usa uno, solo se puede poner el código que le faltaba.
        bindShortCodeInput(level.codeInput, level.codeLength);
        if (level.codeSave) {
            level.codeSave.addEventListener('click', async () => {
                const item = level.items.find((i) => String(i.id) === String(level.select.value));
                const code = cleanShortCode(level.codeInput.value, level.codeLength);
                if (!item) return;
                if (code.length !== level.codeLength) {
                    Dashboard.showToast(t(`business.ccGeoCodeInvalid${level.codeLength}`), 'error');
                    return;
                }
                const editable = !item.in_use;
                const name = editable ? level.nameInput.value.trim() : item.name;
                if (!name) {
                    Dashboard.showToast(t('business.ccTypeNameFirst'), 'error');
                    level.nameInput.focus();
                    return;
                }
                level.codeSave.disabled = true;
                try {
                    const res = await fetch(editable ? level.patchUrl(item.id) : level.codeUrl(item.id), {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(editable ? { name, code } : { code }),
                    });
                    const body = await res.json().catch(() => ({}));
                    if (!res.ok) { const failure = new Error(body.message || 'save failed'); failure.geoCode = body.code; throw failure; }
                    item.name = body.item.name;
                    item.code = body.item.code;
                    const keep = level.select.value;
                    populateSelect(level.select, level.items, level);
                    level.select.value = keep;
                    refreshCodeRow(levelKey);
                    onChange();
                    Dashboard.showToast(t('main.changeSaved'), 'success');
                } catch (err) {
                    Dashboard.showToast(geoErrorText(levelKey, err), 'error');
                } finally {
                    level.codeSave.disabled = false;
                }
            });
        }
        level.addToggle.addEventListener('click', () => {
            level.addRow.hidden = !level.addRow.hidden;
            if (!level.addRow.hidden) level.addInput.focus();
        });
        level.addConfirm.addEventListener('click', async () => {
            const name = level.addInput.value.trim();
            if (!name) {
                Dashboard.showToast(t('business.ccTypeNameFirst'), 'error');
                level.addInput.focus();
                return;
            }
            const code = level.codeLength ? cleanShortCode(level.addCode.value, level.codeLength) : '';
            if (level.codeLength && code.length !== level.codeLength) {
                Dashboard.showToast(t(`business.ccGeoCodeInvalid${level.codeLength}`), 'error');
                level.addCode.focus();
                return;
            }
            const parentId = level.parent ? levels[level.parent].select.value : null;
            level.addConfirm.disabled = true;
            try {
                const res = await fetch(level.createUrl(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(level.createBody(name, parentId, code)),
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) { const failure = new Error(body.message || 'create failed'); failure.geoCode = body.code; throw failure; }
                const { item } = body;
                await loadLevel(levelKey, parentId);
                level.select.value = item.id;
                level.addInput.value = '';
                if (level.addCode) level.addCode.value = '';
                level.addRow.hidden = true;
                level.select.dispatchEvent(new Event('change'));
            } catch (err) {
                Dashboard.showToast(err.geoCode ? geoErrorText(levelKey, err) : t('admin.saveError'), 'error');
            } finally {
                level.addConfirm.disabled = false;
            }
        });
    });

    function resetAddRows() {
        LEVEL_ORDER.forEach((key) => {
            const level = levels[key];
            level.addRow.hidden = true;
            level.addInput.value = '';
            if (level.addCode) level.addCode.value = '';
        });
    }
    // Carga todos los niveles; con una ubicación ({ countryId, stateId, municipalityId, localityId, streetId }) deja elegido lo que ya tenía el sitio.
    async function load(selection) {
        const sel = selection || {};
        resetAddRows();
        await loadLevel('country', null);
        levels.country.select.value = sel.countryId || '';
        await loadLevel('state', sel.countryId || null);
        levels.state.select.value = sel.stateId || '';
        await loadLevel('municipality', sel.stateId || null);
        levels.municipality.select.value = sel.municipalityId || '';
        await loadLevel('locality', sel.stateId || null);
        levels.locality.select.value = sel.localityId || '';
        await loadLevel('street', sel.localityId || null);
        levels.street.select.value = sel.streetId || '';
        LEVEL_ORDER.forEach(refreshCodeRow);
    }
    function values() {
        return {
            countryId: Number(levels.country.select.value) || null,
            stateId: Number(levels.state.select.value) || null,
            municipalityId: Number(levels.municipality.select.value) || null,
            localityId: Number(levels.locality.select.value) || null,
            streetId: Number(levels.street.select.value) || null,
        };
    }
    // Dice QUÉ falta (con los nombres de los campos, más los que la pantalla agregue en extraMissing). Si lo que falta se escribió en su renglón de «Nuevo…» pero no se pulsó Agregar, se avisa eso. '' = todo elegido.
    function missingText(extraMissing = []) {
        const v = values();
        const ids = { country: v.countryId, state: v.stateId, municipality: v.municipalityId, locality: v.localityId, street: v.streetId };
        const missingLevels = LEVEL_ORDER.filter((key) => !ids[key]);
        const typedNotAdded = missingLevels.find((key) => levels[key].addInput.value.trim());
        if (typedNotAdded) {
            levels[typedNotAdded].addConfirm.focus();
            return t('business.ccPressAdd', { field: t(LEVEL_LABEL_KEY[typedNotAdded]) });
        }
        const fields = missingLevels.map((key) => t(LEVEL_LABEL_KEY[key])).concat(extraMissing);
        return fields.length ? t('business.ccMissingFields', { fields: fields.join(', ') }) : '';
    }
    // Para armar el localizador hacen falta los códigos cortos del Estado y la Localidad elegidos.
    function hasGeoCodes() {
        const v = values();
        const pickedState = levels.state.items.find((i) => i.id === v.stateId);
        const pickedLocality = levels.locality.items.find((i) => i.id === v.localityId);
        return !!(pickedState && pickedState.code && pickedLocality && pickedLocality.code);
    }
    function applyTitles() {
        LEVEL_ORDER.forEach((key) => { levels[key].addToggle.title = t(levels[key].titleKey); });
    }
    function refreshLanguage() {
        applyTitles();
        LEVEL_ORDER.forEach((key) => {
            const level = levels[key];
            if (!level.select.disabled) {
                const placeholder = level.select.querySelector('option[value=""]');
                if (placeholder) placeholder.textContent = level.items.length ? t('business.ccSelectPlaceholder') : t('business.ccNoOptionsYet');
            }
        });
    }
    applyTitles();
    return { levels, load, values, missingText, hasGeoCodes, applyTitles, refreshLanguage };
}

window.GeoCascade = { create, cleanShortCode, bindShortCodeInput };
})();
