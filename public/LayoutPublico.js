// ---------------------------------------------------------------------------
// Vista pública del Layout: lo que abre el QR del Layout, SIN iniciar sesión. Igual que la ficha pública de un artículo (Ficha.html), no usa
// Dashboard.js: es para quien escanea el QR pegado en la nave. Lee GET /api/public/layout/:token, que solo entrega lo público (paredes, zonas,
// anaqueles/gabetas/tarimas con su código, puertas, conexiones de luz y los KPIs; nunca las columnas) y siempre la versión guardada más reciente.
// El QR nunca cambia: lo que cambia es lo que este token devuelve cada vez que alguien guarda el Layout.
// ---------------------------------------------------------------------------
(function () {
    const LANG = (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
    const TEXT = {
        es: {
            title: 'Layout', version: 'Versión', updated: 'Actualizado', zones: 'Distribución', notFound: 'Este Layout no está disponible.',
            error: 'No se pudo cargar el Layout. Intenta de nuevo.', footer: 'Layout generado por SGN',
            kpiTotal: 'Superficie total', kpiOffices: 'Oficinas', kpiAisles: 'Pasillos', kpiDocks: 'Andenes', kpiStorage: 'Zonas de almacenamiento', kpiDead: 'Espacios muertos', kpiVolume: 'Volumen de la nave',
            spaces: 'espacios', noZone: 'Sin zona asignada', zoneWord: 'Zona', noCodes: 'Todavía no hay códigos en esta categoría. Aquí aparecerán con sus fotos y su ubicación.',
            zoomIn: 'Acercar', zoomOut: 'Alejar', zoomReset: 'Ver todo el croquis', codesOne: '1 código en esta zona', codesMany: '{n} códigos en esta zona',
            metrics: 'Datos métricos', metricsHint: '{n} m² de superficie total y más', positions: 'Posiciones', positionsHint: '{n} activos con sus niveles, espacios y posiciones', posNote: 'Vista desde arriba de cada nivel: cada caja es una posición (P001…) dentro de su espacio (E001…). Es un esquema: el fondo puede verse exagerado.', pickAsset: 'Elige un activo', posClose: 'Quitar las posiciones del croquis', posFaceNote: 'Línea verde punteada con flecha: por dónde se consume (la cara de consumo).', byZone: 'Por zona', colZone: 'Zona', colType: 'Tipo de zona', colArea: 'Superficie', colVolume: 'Volumen', sum: 'Suma',
            restRow: 'Sin zona (espacio muerto)', transitRow: 'Pasillos fuera de toda zona', overlapRow: 'Zonas encimadas o fuera de la nave', zonesHint: '{z} zonas · {c} códigos', zonesHintNoCodes: '{z} zonas',
            codeWordOne: 'código', codeWordMany: 'códigos', noZonesInMetric: 'Ninguna zona suma en esta cifra.',
            home: 'Ir al Layout principal', here: 'Dónde estás', categories: 'Categorías', noCats: 'Esta zona todavía no tiene categorías.',
            rotate: 'Girar el croquis', measures: 'Medidas', areaBtn: 'm² de las zonas', layers: 'Capas del croquis', mapToggle: 'Croquis',
                        opts2d: 'Opciones del croquis plano', opts3d: 'Opciones del 3D', groupLayers: 'Capas', groupTools: 'Herramientas', group3dView: 'Vista', showLabel: 'Mostrar:', viewMode: 'Cómo ver el croquis',
            rotateShort: 'Girar', labels3d: 'Rótulos', pickShort: 'Elegir activos', layerAssets: 'Activos',
            view2d: 'Ver el croquis en 2D', view3d: 'Ver el Layout en 3D', v3General: 'Vista general', v3Plan: 'Planta', v3Front: 'Frente', layerWalls: 'Paredes', loading3d: 'Cargando la vista 3D…',
            error3d: 'No se pudo abrir la vista 3D en este navegador.', level1: '1 nivel', levelsN: '{n} niveles',
            pickAssets: 'Elegir qué activos ver', apTitle: 'Activos visibles', apCount: '{n} de {t} activos visibles', apAll: 'Todos', apNone: 'Ninguno', apSearch: 'Buscar por código, tipo o zona', apNoResults: 'Ningún activo coincide.', apClose: 'Cerrar',
            search: 'Buscar', searchAll: 'Buscar en todo el Layout', searchIn: 'Buscar en {z}', searchClear: 'Borrar', searchTypes: 'Buscar en', searchFieldsAll: 'Todos', searchSelected: '{n} elegidos', searchField: { zone: 'Zona', furniture: 'Mobiliario', place: 'Ubicación', sku: 'SKU', desc: 'Descripción', cat: 'Categoría' },
            searchClose: 'Cerrar', groupMap: 'Croquis', namesBtn: 'Nombres de las zonas', spaceType: { rack: 'Anaquel', rackpal: 'Rack', cabinet: 'Gabeta', pallet: 'Tarima en piso', cold: 'Frío' },
            searchMode: 'Tipo de Filtro', searchModes: { startsWith: 'Inicia con', contains: 'Contiene', equals: 'Igual que' },
            searchSigns: 'Signos de búsqueda', searchSign: { before: 'Antes', after: 'Después', comma: 'Otra búsqueda' }, searchSignOff: 'No aplica con este tipo de filtro',
            searchSignHelp: { before: 'Otra palabra ANTES · rack$cajón', after: 'Otra palabra DESPUÉS · rack@cajón', comma: 'Sirve cualquiera de las dos · rack, estante' },
            searchScopeLabel: 'Buscando en:', searchScopeZone: '{z} (tocar para ampliar)', searchScopeAll: 'Todo el Layout (tocar para limitar a {z})', searchHint: 'Escribe una zona, un mobiliario, una ubicación, un SKU o una descripción. Con comas se busca cualquiera de las palabras.', searchHintNoCodes: 'Escribe una zona, un mobiliario o una ubicación. Con comas se busca cualquiera de las palabras.',
            searchNone: 'No hay resultados para "{q}".', searchNoneZone: 'No hay resultados para "{q}" en {z}.', searchWiden: 'Buscar en todo el Layout', searchBusy: 'Buscando…', searchError: 'No se pudo buscar. Intenta de nuevo.',
            searchGroup: { zone: 'Zonas', furniture: 'Mobiliario', place: 'Ubicación', cat: 'Categorías', code: 'Códigos' }, searchOne: '1 resultado', searchMany: '{n} resultados', searchMore: 'Mostrando {n} de {t}. Escribe más para afinar.', searchCats: '{n} categorías', searchCat1: '1 categoría',
            classifications: 'Clasificaciones', noClassification: 'SIN CLASIFICAR', noClassificationDesc: 'Códigos que todavía no tienen clasificación',
            articlesOne: '1 artículo, ordenados por ubicación', articlesMany: '{n} artículos, ordenados por ubicación', viewGrid: 'Cuadrícula', viewList: 'Lista', viewLabel: 'Vista',
            clsMore: 'Ver más', clsShowing: 'Mostrando {n} de {t}', clsNoLoc: 'Sin ubicación', clsLevel: 'Nivel {n}', clsCode: 'Código {n}',
            clsError: 'No se pudo cargar la clasificación. Intenta de nuevo.', clsGone: 'Esta clasificación ya no está disponible.', clsLocked: 'Este QR no muestra las clasificaciones.', clsEmpty: 'Todavía no hay artículos en esta clasificación en esta zona.',
            layer: { contorno: 'Contorno', puertas: 'Puertas', luz: 'Conexiones de luz', zonas: 'Zonas', niveles: 'Niveles', transito: 'Tránsito', seguridad: 'Seguridad', espacios: 'Huella' },
            zone: { dry: 'Seco', cold: 'Refrigerado', chemical: 'Químicos', finished: 'Producto terminado', dock: 'Andén', office: 'Oficina', aisle: 'Pasillo principal', aisle2: 'Pasillo entre anaqueles' },
        },
        en: {
            title: 'Layout', version: 'Version', updated: 'Updated', zones: 'Distribution', notFound: 'This Layout is not available.',
            error: 'The Layout could not be loaded. Try again.', footer: 'Layout generated by SGN',
            kpiTotal: 'Total area', kpiOffices: 'Offices', kpiAisles: 'Aisles', kpiDocks: 'Docks', kpiStorage: 'Storage zones', kpiDead: 'Dead space', kpiVolume: 'Warehouse volume',
            spaces: 'spaces', noZone: 'No zone assigned', zoneWord: 'Zone', noCodes: 'There are no codes in this category yet. They will appear here with their photos and location.',
            zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomReset: 'Show the whole map', codesOne: '1 code in this zone', codesMany: '{n} codes in this zone',
            metrics: 'Metric data', metricsHint: '{n} m² of total area and more', positions: 'Positions', positionsHint: '{n} assets with their levels, spaces and positions', posNote: 'Each level seen from above: each box is a position (P001…) inside its space (E001…). It is a diagram: the depth may look exaggerated.', pickAsset: 'Pick an asset', posClose: 'Remove the positions from the map', posFaceNote: 'Dashed green line with an arrow: the side it is taken from (the consumption face).', byZone: 'By zone', colZone: 'Zone', colType: 'Zone type', colArea: 'Area', colVolume: 'Volume', sum: 'Total',
            restRow: 'No zone (dead space)', transitRow: 'Aisles outside any zone', overlapRow: 'Overlapping or outside the building', zonesHint: '{z} zones · {c} codes', zonesHintNoCodes: '{z} zones',
            codeWordOne: 'code', codeWordMany: 'codes', noZonesInMetric: 'No zone adds up to this figure.',
            home: 'Go to the main Layout', here: 'Where you are', categories: 'Categories', noCats: 'This zone has no categories yet.',
            rotate: 'Rotate the sketch', measures: 'Measures', areaBtn: 'Zone m²', layers: 'Sketch layers', mapToggle: 'Sketch',
                        opts2d: 'Flat sketch options', opts3d: '3D options', groupLayers: 'Layers', groupTools: 'Tools', group3dView: 'View', showLabel: 'Show:', viewMode: 'How to view the sketch',
            rotateShort: 'Rotate', labels3d: 'Labels', pickShort: 'Choose assets', layerAssets: 'Assets',
            view2d: 'View the sketch in 2D', view3d: 'View the Layout in 3D', v3General: 'Overview', v3Plan: 'Top view', v3Front: 'Front view', layerWalls: 'Walls', loading3d: 'Loading the 3D view…',
            error3d: 'The 3D view could not be opened in this browser.', level1: '1 level', levelsN: '{n} levels',
            pickAssets: 'Choose which assets to show', apTitle: 'Visible assets', apCount: '{n} of {t} assets visible', apAll: 'All', apNone: 'None', apSearch: 'Search by code, type or zone', apNoResults: 'No asset matches.', apClose: 'Close',
            search: 'Search', searchAll: 'Search the whole Layout', searchIn: 'Search in {z}', searchClear: 'Clear', searchTypes: 'Search in', searchFieldsAll: 'All', searchSelected: '{n} selected', searchField: { zone: 'Zone', furniture: 'Furniture', place: 'Location', sku: 'SKU', desc: 'Description', cat: 'Category' },
            searchClose: 'Close', groupMap: 'Sketch', namesBtn: 'Zone names', spaceType: { rack: 'Rack (shelf)', rackpal: 'Pallet rack', cabinet: 'Cabinet', pallet: 'Floor pallet', cold: 'Cold' },
            searchMode: 'Filter type', searchModes: { startsWith: 'Starts with', contains: 'Contains', equals: 'Equal to' },
            searchSigns: 'Search signs', searchSign: { before: 'Before', after: 'After', comma: 'Another search' }, searchSignOff: 'Not available with this filter type',
            searchSignHelp: { before: 'Another word BEFORE · rack$drawer', after: 'Another word AFTER · rack@drawer', comma: 'Either one matches · rack, shelf' },
            searchScopeLabel: 'Searching in:', searchScopeZone: '{z} (tap to widen)', searchScopeAll: 'Whole Layout (tap to limit to {z})', searchHint: 'Type a zone, a furniture item, a location, a SKU or a description. With commas, any of the words matches.', searchHintNoCodes: 'Type a zone, a furniture item or a location. With commas, any of the words matches.',
            searchNone: 'No results for "{q}".', searchNoneZone: 'No results for "{q}" in {z}.', searchWiden: 'Search the whole Layout', searchBusy: 'Searching…', searchError: 'The search failed. Try again.',
            searchGroup: { zone: 'Zones', furniture: 'Furniture', place: 'Location', cat: 'Categories', code: 'Codes' }, searchOne: '1 result', searchMany: '{n} results', searchMore: 'Showing {n} of {t}. Type more to narrow it down.', searchCats: '{n} categories', searchCat1: '1 category',
            classifications: 'Classifications', noClassification: 'UNCLASSIFIED', noClassificationDesc: 'Codes that do not have a classification yet',
            articlesOne: '1 item, sorted by location', articlesMany: '{n} items, sorted by location', viewGrid: 'Grid', viewList: 'List', viewLabel: 'View',
            clsMore: 'Show more', clsShowing: 'Showing {n} of {t}', clsNoLoc: 'No location', clsLevel: 'Level {n}', clsCode: 'Code {n}',
            clsError: 'The classification could not be loaded. Try again.', clsGone: 'This classification is no longer available.', clsLocked: 'This QR does not show the classifications.', clsEmpty: 'There are no items in this classification in this zone yet.',
            layer: { contorno: 'Outline', puertas: 'Doors', luz: 'Power connections', zonas: 'Zones', niveles: 'Levels', transito: 'Transit', seguridad: 'Safety', espacios: 'Footprint-Space' },
            zone: { dry: 'Dry', cold: 'Refrigerated', chemical: 'Chemicals', finished: 'Finished goods', dock: 'Dock', office: 'Office', aisle: 'Main aisle', aisle2: 'Aisle between racks' },
        },
    }[LANG];
    document.documentElement.lang = LANG;
    document.title = TEXT.title;

    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmt = (n) => (Number.isFinite(n) ? n : 0).toLocaleString(LANG === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: 2 });
    // La base de datos guarda la hora en UTC ("2026-10-31 16:42:00"): aquí se muestra en la hora de quien escanea, con el UTC a la vista.
    function stamp(raw) {
        const date = new Date(`${String(raw).replace(' ', 'T')}Z`);
        if (Number.isNaN(date.getTime())) return '';
        const local = date.toLocaleString(LANG === 'en' ? 'en-US' : 'es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `${local} (UTC ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')})`;
    }

    function renderState(message) {
        document.getElementById('wrap').innerHTML = `<div class="state">${esc(message)}</div>`;
    }

    // Dónde está quien escanea: ?z=<zona> es la página de esa zona; ?z=&c= (a mano) o ?z=&k= (del catálogo) es una categoría de esa zona. Sin ?z es el Layout general.
    function scanContext(data) {
        const params = new URLSearchParams(window.location.search);
        const zone = (data.layout.zones || []).find((z) => z.id === params.get('z')) || null;
        return { zone, c: zone ? params.get('c') : null, k: zone ? params.get('k') : null, l: zone ? params.get('l') : null };
    }
    // El recorrido de arriba: cada nivel se toca para subir (Distribución = el Layout general con la lista de zonas abierta).
    const zoneHref = (zone) => `${window.location.pathname}?z=${encodeURIComponent(zone.id)}`;
    function crumbsHtml(parts) {
        return `<nav class="crumbs" aria-label="${esc(TEXT.here)}">${parts.map(([label, href], i) => `${href ? `<a href="${esc(href)}">${esc(label)}</a>` : `<b>${esc(label)}</b>`}${i < parts.length - 1 ? '<span aria-hidden="true">›</span>' : ''}`).join('')}</nav>`;
    }
    const upCrumbs = (zone, last) => [[TEXT.zones, `${window.location.pathname}#distribucion`], ...(last ? [[zone.name, zoneHref(zone)], [last]] : [[zone.name]])];

    // El QR de una categoría trae ?z=<zona>&c=<categoría>: arriba se muestra esa categoría (sus códigos llegan después).
    function categoryBanner(data) {
        const params = new URLSearchParams(window.location.search);
        const zone = (data.layout.zones || []).find((z) => z.id === params.get('z'));
        const cat = zone && (zone.categories || []).find((c) => c.id === params.get('c'));
        if (!cat) return '';
        return `<div class="catbanner" style="border-left-color:${esc(cat.color)}"><span class="catmark" style="background:${esc(cat.color)}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${window.LayoutMapSvg.categoryGlyph(cat.icon, '#FFFFFF', 2)}</svg></span><div><div class="cattitle">${esc(cat.name)}</div><div class="catsub">${esc(TEXT.zoneWord)} ${esc(zone.name)}${cat.desc ? ` · ${esc(cat.desc)}` : ''}</div><p class="catnote">${esc(TEXT.noCodes)}</p></div></div>`;
    }

    // /q/<token>: el token es el último tramo de la dirección.
    const publicToken = () => decodeURIComponent(window.location.pathname.split('/').filter(Boolean).pop() || '');

    // El QR de la hoja por Zona trae ?z=<zona>&k=<tipo.número de la categoría>: el servidor responde en ese momento el nombre actual de la categoría y cuántos códigos hay hoy
    // en esa zona (la dirección del QR nunca cambia; esto sí). Si la categoría ya no existe, no se muestra nada.
    async function loadZoneCategoryBanner() {
        const params = new URLSearchParams(window.location.search);
        const slot = document.getElementById('catslot');
        if (!slot || !params.get('z') || !params.get('k') || params.get('l')) return;
        try {
            const res = await fetch(`/api/public/layout/${encodeURIComponent(publicToken())}/category?z=${encodeURIComponent(params.get('z'))}&k=${encodeURIComponent(params.get('k'))}`, { cache: 'no-store' });
            if (!res.ok) return;
            const cat = await res.json();
            const look = window.LayoutCalc.categoryLook(cat.seed);
            const count = cat.codes === undefined ? '' : cat.codes === 1 ? TEXT.codesOne : TEXT.codesMany.replace('{n}', fmt(cat.codes));
            const zoneObj = view.data && (view.data.layout.zones || []).find((z) => z.id === params.get('z'));
            if (zoneObj) {
                // el croquis sombrea la zona de esa categoría con su color
                setBaseFocus({ zones: { [zoneObj.id]: look.color } });
                if (searchState.open) applySearchFocus(); else redrawMap(view.data);
            }
            slot.innerHTML = `${zoneObj ? crumbsHtml(upCrumbs(zoneObj, cat.name)) : ''}<div class="catbanner" style="border-left-color:${esc(look.color)}"><span class="catmark" style="background:${esc(look.color)}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${window.LayoutMapSvg.categoryGlyph(look.icon, '#FFFFFF', 2)}</svg></span><div><div class="cattitle">${esc(cat.name)}</div><div class="catsub">${esc(cat.zoneName)}${count ? ` · ${esc(count)}` : ''}</div>${cat.codes === undefined || cat.codes ? '' : `<p class="catnote">${esc(TEXT.noCodes)}</p>`}</div></div>`;
        } catch (err) {
            console.error('Layout público: no se pudo leer la categoría', err);
        }
    }

    // Zoom del croquis: botones (acercar, alejar, ver todo), dos dedos o Ctrl + rueda, doble toque/clic, y arrastrar para moverse cuando está acercado. Se cambia el viewBox
    // del SVG (no un transform) para que el dibujo y sus letras se vean nítidos al acercar.
    const ZOOM_ICONS = {
        in: '<path d="M12 5v14M5 12h14"/>',
        out: '<path d="M5 12h14"/>',
        reset: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    };
    function mapToolsHtml() {
        const btn = (key, label, hidden) => `<button type="button" data-zoom="${key}" aria-label="${esc(label)}" title="${esc(label)}"${hidden ? ' hidden' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ZOOM_ICONS[key]}</svg></button>`;
        return `<div class="map-tools">${btn('in', TEXT.zoomIn)}${btn('out', TEXT.zoomOut)}${btn('reset', TEXT.zoomReset, true)}</div>`;
    }
    let mapMoved = false; // el croquis se acaba de arrastrar: ese toque no cuenta como elegir un activo
    function enableMapZoom() {
        const box = document.querySelector('#wrap .map');
        const svg = box && box.querySelector('svg');
        if (!svg || !svg.viewBox || !svg.viewBox.baseVal) return;
        const W = svg.viewBox.baseVal.width;
        const H = svg.viewBox.baseVal.height;
        const MAX = 8;
        let s = 1;
        let x = 0;
        let y = 0;
        const pts = new Map();
        let pinch = null;
        const resetBtn = box.querySelector('[data-zoom="reset"]');
        mapMoved = false;
        function apply() {
            const w = W / s;
            const h = H / s;
            x = Math.min(Math.max(x, 0), W - w);
            y = Math.min(Math.max(y, 0), H - h);
            svg.setAttribute('viewBox', `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
            const zoomed = s > 1.001;
            box.classList.toggle('zoomed', zoomed);
            resetBtn.hidden = !zoomed;
            // Acercado, un dedo mueve el croquis; sin acercar, un dedo sigue moviendo la página.
            svg.style.touchAction = zoomed ? 'none' : 'pan-y';
        }
        // El punto de pantalla (cx, cy) se queda quieto mientras cambia el aumento.
        function zoomTo(next, cx, cy) {
            const rect = svg.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const fx = (cx - rect.left) / rect.width;
            const fy = (cy - rect.top) / rect.height;
            const px = x + fx * (W / s);
            const py = y + fy * (H / s);
            s = Math.min(Math.max(next, 1), MAX);
            x = px - fx * (W / s);
            y = py - fy * (H / s);
            apply();
        }
        const center = () => { const r = svg.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
        box.querySelector('[data-zoom="in"]').addEventListener('click', () => zoomTo(s * 1.6, ...center()));
        box.querySelector('[data-zoom="out"]').addEventListener('click', () => zoomTo(s / 1.6, ...center()));
        resetBtn.addEventListener('click', () => { s = 1; x = 0; y = 0; apply(); });
        box.addEventListener('wheel', (event) => {
            if (!event.ctrlKey && !event.metaKey) return; // sin Ctrl la rueda sigue moviendo la página
            event.preventDefault();
            zoomTo(s * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event.clientX, event.clientY);
        }, { passive: false });
        svg.addEventListener('dblclick', (event) => zoomTo(s > 1.001 ? 1 : 2.5, event.clientX, event.clientY));
        svg.addEventListener('pointerdown', (event) => {
            pts.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pts.size === 2) {
                const [a, b] = [...pts.values()];
                pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s };
            }
            if (svg.setPointerCapture) { try { svg.setPointerCapture(event.pointerId); } catch (err) { /* el puntero ya no existe */ } }
        });
        svg.addEventListener('pointermove', (event) => {
            const prev = pts.get(event.pointerId);
            if (!prev) return;
            const cur = { x: event.clientX, y: event.clientY };
            pts.set(event.pointerId, cur);
            if (pts.size === 2 && pinch) {
                const [a, b] = [...pts.values()];
                zoomTo(pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
            } else if (pts.size === 1 && s > 1.001) {
                mapMoved = true;
                const rect = svg.getBoundingClientRect();
                x -= ((cur.x - prev.x) * (W / s)) / rect.width;
                y -= ((cur.y - prev.y) * (H / s)) / rect.height;
                apply();
            }
        });
        const release = (event) => { pts.delete(event.pointerId); if (pts.size < 2) pinch = null; };
        svg.addEventListener('pointerup', release);
        svg.addEventListener('pointercancel', release);
        // con un activo elegido (posiciones) el croquis arranca acercado a él
        const pb = svg.querySelector('[data-posbox]');
        if (pb) {
            const [bx, by, bw, bh] = pb.getAttribute('data-posbox').split(',').map(Number);
            if (bw > 0 && bh > 0) {
                s = Math.min(Math.max(Math.min(W / (bw * 1.7), H / (bh * 1.7)), 1.5), MAX);
                x = bx + bw / 2 - W / s / 2;
                y = by + bh / 2 - H / s / 2;
            }
        }
        apply();
    }

    const ICONS = {
        ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
        layers: '<path d="M12 3l9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/>',
        home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
        rotate: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
        area: '<rect x="4" y="4" width="16" height="16" rx="2"/><text x="12" y="15.2" font-size="8" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">m²</text>',
        search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
        map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
        chart: '<path d="M5 20v-9M12 20V4M19 20v-6"/>',
        pill: '<path d="M8.5 15.5l7-7a3.5 3.5 0 0 0-5-5l-7 7a3.5 3.5 0 0 0 5 5z"/><path d="M9 9l6 6"/>',
        help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7"/><path d="M12 17h.01"/>',
        grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
        list: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
        code: '<path d="M4 6v12M8 6v12M12 6v12M16 6v12M20 6v12"/>',
        names: '<text x="12" y="16" font-size="11" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">Aa</text>',
        sliders: '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.2"/><circle cx="9.5" cy="17" r="2.2"/>',
        cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        minus: '<path d="M5 12h14"/>',
        list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.4 1.4L7 5M3.5 12l1.4 1.4L7 11M3.5 18l1.4 1.4L7 17"/>',
    };

    // Botones del croquis (los mismos del Layout con sesión): girar, ver/ocultar medidas, ver/ocultar los m² de cada zona y las capas que se dibujan. Cada quien los mueve para verlo
    // como le conviene; al escanear de nuevo todo vuelve a como se guardó. Contorno siempre se ve; las conexiones de luz salen apagadas hasta que se prende su capa.
    const LAYER_KEYS = ['contorno', 'puertas', 'luz', 'zonas', 'niveles', 'transito', 'seguridad', 'espacios'];
    // Con «puertas y luz» cerrado esas dos capas no se ofrecen (el servidor ya no manda sus datos).
    // La capa Tránsito (los pasillos) solo se ofrece si el Layout trae pasillos.
    // La capa Seguridad (extintores, hidrantes, puertas de emergencia…) tampoco se ofrece si el Layout no trae elementos de seguridad.
    const layerShown = (key) => !(locked('doors') && (key === 'puertas' || key === 'luz')) && !(key === 'niveles' && !((((view.data || {}).layout) || {}).floors || []).length && !((((view.data || {}).layout) || {}).ramps || []).length) && !(key === 'transito' && !((((view.data || {}).layout) || {}).transit || []).length) && !(key === 'seguridad' && !((((view.data || {}).layout) || {}).safety || []).length);
    const mapView = { layers: ['contorno', 'puertas', 'zonas', 'niveles', 'transito', 'seguridad', 'espacios'], measures: true, area: true, names: true, rotation: 0, mode3d: false, walls: true, posFocus: null };
    // Lo que se está buscando en el croquis ({ zones: { id: color } }): la zona de la categoría que se escaneó sale sombreada y el resto tenue.
    // value = lo que se dibuja ahora (el croquis base o el de la búsqueda); base = lo que corresponde a la página sin buscar; key = lo ya dibujado, para no redibujar sin necesidad.
    const viewFocus = { value: null, base: null, key: 'null' };
    function setBaseFocus(focus) { viewFocus.base = focus; viewFocus.value = focus; }
    // Qué bloques de la página se ven: el croquis (con sus capas y los iconos de girar, medidas y m², que solo sirven para él), Datos métricos y Distribución. Cada icono prende o apaga el suyo;
    // como los demás botones, al escanear de nuevo todo aparece otra vez.
    const pageView = { map: true, metrics: true, zones: true };
    function applyPageView() {
        const wrap = document.getElementById('wrap');
        wrap.classList.toggle('nomap', !pageView.map);
        wrap.classList.toggle('nometrics', !pageView.metrics);
        wrap.classList.toggle('nozones', !pageView.zones);
        wrap.classList.toggle('mode3d', mapView.mode3d);
        document.querySelectorAll('[data-page-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(pageView[b.dataset.pageToggle])));
    }
    // Arriba: la búsqueda chica con el selector 2D | 3D al lado; los bloques de la página que se muestran (Croquis, Datos métricos, Distribución); y debajo un cuadro con las opciones SOLO del modo elegido, con su nombre
    // escrito (Capas y Herramientas en 2D; Vista, Capas y Herramientas en 3D). Cada quien los mueve para verlo como le conviene; al escanear de nuevo todo vuelve a como se guardó. Contorno siempre se ve; las conexiones de luz
    // salen apagadas hasta que se prende su capa.
    function mapPanelHtml() {
        const toolIcon = (name, extra) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}${extra || ''}</svg>`;
        const slash = '<path class="slash" d="M4 20L20 4"/>';
        const pill = (attrs, label, on, fixed) => `<button type="button" class="lpill" ${attrs} aria-pressed="${on}"${fixed ? ' aria-disabled="true"' : ''}>${esc(label)}</button>`;
        const tool = (attrs, glyph, label, pressed, withSlash, title) => `<button type="button" class="mtool" ${attrs}${pressed === undefined ? '' : ` aria-pressed="${pressed}"`} aria-label="${esc(title || label)}" title="${esc(title || label)}"><span class="ic">${toolIcon(glyph, withSlash ? slash : '')}</span><span>${esc(label)}</span></button>`;
        if (!mapView.mode3d) {
            const layerPills = LAYER_KEYS.filter(layerShown).map((key) => pill(`data-map-layer="${key}"`, TEXT.layer[key], mapView.layers.includes(key), key === 'contorno')).join('');
            return `<div class="mptitle"><i>2D</i>${esc(TEXT.opts2d)}</div>
                <div class="mgl">${esc(TEXT.groupLayers)}</div><div class="mpills" role="group" aria-label="${esc(TEXT.layers)}">${layerPills}</div>
                <div class="mgl">${esc(TEXT.groupTools)}</div><div class="mtools">${tool('data-map-rot', 'rotate', TEXT.rotateShort, undefined, false, TEXT.rotate)}${locked('metrics') ? '' : tool('data-map-meas', 'ruler', TEXT.measures, mapView.measures, true) + tool('data-map-area', 'area', TEXT.areaBtn, mapView.area, true)}${tool('data-map-names', 'names', TEXT.namesBtn.split(' ')[0], mapView.names, true, TEXT.namesBtn)}</div>`;
        }
        const views = [['general', TEXT.v3General], ['planta', TEXT.v3Plan], ['frente', TEXT.v3Front]].map(([key, label], i) => `<button type="button" class="lpill" data-m3d-view="${key}" aria-pressed="${i === 0}">${esc(label)}</button>`).join('');
        const layer3 = (key, label) => pill(`data-map-layer="${key}"`, label, mapView.layers.includes(key));
        const layerPills = [pill('data-map-walls', TEXT.layerWalls, mapView.walls), ...(locked('doors') ? [] : [layer3('puertas', TEXT.layer.puertas), layer3('luz', TEXT.layer.luz)]), layer3('zonas', TEXT.layer.zonas), ...(layerShown('transito') ? [layer3('transito', TEXT.layer.transito)] : []), ...(layerShown('seguridad') ? [layer3('seguridad', TEXT.layer.seguridad)] : []), layer3('espacios', TEXT.layerAssets)].join('');
        return `<div class="mptitle"><i>3D</i>${esc(TEXT.opts3d)}</div>
            <div class="mgl">${esc(TEXT.group3dView)}</div><div class="mpills">${views}</div>
            <div class="mgl">${esc(TEXT.groupLayers)}</div><div class="mpills" role="group" aria-label="${esc(TEXT.layers)}">${layerPills}</div>
            <div class="mgl">${esc(TEXT.groupTools)}</div><div class="mtools">${tool('data-m3d-pick aria-expanded="false"', 'list', TEXT.pickShort, undefined, false, TEXT.pickAssets)}${tool('data-map-names', 'names', TEXT.labels3d, mapView.names, true)}${tool('data-m3d-zoom="in"', 'plus', TEXT.zoomIn)}${tool('data-m3d-zoom="out"', 'minus', TEXT.zoomOut)}</div>
            <div class="m3d-picker" id="m3d-picker" hidden></div>`;
    }
    function renderMapPanel() {
        const panel = document.getElementById('map-panel');
        if (panel) panel.innerHTML = mapPanelHtml();
    }
    function mapToolbarHtml() {
        const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
        // Datos métricos y Distribución solo están en el Layout general; en una zona o categoría solo se ofrece el del croquis.
        const general = !searchPageZone();
        const blocks = [['map', TEXT.mapToggle]].concat(general ? (locked('metrics') ? [] : [['metrics', TEXT.metrics]]).concat(listedZones(view.data).length ? [['zones', TEXT.zones]] : []) : []);
        const chips = blocks.map(([key, label]) => `<button type="button" class="cchip" data-page-toggle="${key}" aria-pressed="${pageView[key]}">${esc(label)}</button>`).join('');
        const scope = general ? TEXT.searchAll : fill(TEXT.searchIn, { z: searchPageZone().name });
        // La barra Buscar abre y cierra el buscador (con el buscador abierto dice «Cerrar»).
        return `<div class="toprow">
            <button type="button" class="sbar" data-map-search aria-expanded="false" aria-controls="search-panel" aria-label="${esc(scope)}" title="${esc(scope)}">${icon('search')}<span class="t">${esc(scope)}</span><span class="go off">${esc(TEXT.search)}</span><span class="go on">${esc(TEXT.searchClose)}</span></button>
            <div class="seg" role="group" aria-label="${esc(TEXT.viewMode)}"><button type="button" data-map-mode="2d" aria-pressed="${!mapView.mode3d}" title="${esc(TEXT.view2d)}">2D</button><button type="button" data-map-mode="3d" aria-pressed="${mapView.mode3d}" title="${esc(TEXT.view3d)}">3D</button></div>
        </div>
        <div class="showrow"><span>${esc(TEXT.showLabel)}</span>${chips}</div>
        <div class="mpanel" id="map-panel">${mapPanelHtml()}</div>${searchPanelHtml()}`;
    }
    // Posiciones sobre el croquis: al tocar un activo se marca y se dibuja encima de él el nivel elegido (la barra de abajo cambia de nivel o lo quita); las posiciones solo se dibujan con el candado «positions» abierto.
    const positionsOn = () => !!(view.data && !locked('positions') && ((view.data.layout || {}).positions || []).length);
    function posPickInner(data) {
        const f = mapView.posFocus;
        const sp = f && ((data.layout || {}).spaces || []).find((s) => s.id === f.id);
        if (!sp) return '';
        const chips = Array.from({ length: Math.max(1, Math.floor(sp.levels || 1)) }, (_, i) => `<button type="button" class="cchip" data-pos-level="${i + 1}" aria-pressed="${f.n === i + 1}">N${String(i + 1).padStart(3, '0')}</button>`).join('');
        return `<b>${esc(sp.code || '')}</b><span class="lv">${chips}</span><button type="button" class="pclose" data-pos-clear aria-label="${esc(TEXT.posClose)}" title="${esc(TEXT.posClose)}">✕</button><small class="fnote">${esc(TEXT.posFaceNote)}</small>`;
    }
    function renderPosPick(data) {
        const box = document.getElementById('pos-pick');
        if (!box) return;
        box.hidden = !(positionsOn() && mapView.posFocus);
        box.innerHTML = posPickInner(data);
    }
    function mapInnerHtml(data) {
        if (mapView.mode3d) return map3dHtml();
        const theme = window.LayoutMapSvg.theme(data.companyColor);
        viewFocus.key = JSON.stringify(viewFocus.value);
        return `${window.LayoutMapSvg.mapSvg(data.layout, { theme, layers: [...mapView.layers, 'paredes'], measures: mapView.measures, area: mapView.area, names: mapView.names, rotation: mapView.rotation, focus: viewFocus.value, posFocus: positionsOn() ? mapView.posFocus : null })}${mapToolsHtml()}`;
    }
    // Barra de botones + croquis + el lugar donde salen los resultados del buscador (la lupa); igual en el Layout general, en una zona y en una categoría.
    const mapBlockHtml = (data) => `${mapToolbarHtml()}<div class="map">${mapInnerHtml(data)}</div><div id="pos-pick" class="pospick"${positionsOn() && mapView.posFocus ? '' : ' hidden'}>${posPickInner(data)}</div><div id="sres" class="sres" aria-live="polite"></div>`;
    // El croquis se vuelve a dibujar con los botones; el contenedor es nuevo para que el zoom empiece limpio y no se acumulen sus escuchas. Con el 3D ya abierto no se reconstruye: solo se ajustan sus capas.
    function redrawMap(data) {
        if (mapView.mode3d && scene3d) { sync3d(); return; }
        replaceMap(data);
    }
    function replaceMap(data) {
        const old = document.querySelector('#wrap .map');
        if (!old) return;
        const next = document.createElement('div');
        next.className = 'map';
        next.innerHTML = mapInnerHtml(data);
        old.replaceWith(next);
        afterMapMount(data);
    }

    // ---- Vista 3D (los iconos Ver 2D y Ver 3D de la barra): ocupa el lugar del croquis, se arma con lo mismo que el croquis (LayoutScene3D.js) y respeta sus capas. three.js (unos 600 KB) se carga solo
    // la primera vez que alguien pide el 3D. Mientras se ve el 3D, la búsqueda sigue funcionando pero no sombrea el dibujo.
    let scene3d = null;
    let picker3d = null; // el selector de activos del 3D (LayoutAssetPicker.js); lo que se ocultó se recuerda mientras no se recargue la página
    const m3dHidden = new Set();
    const lazyScripts = {};
    function loadScriptOnce(src) {
        if (!lazyScripts[src]) {
            lazyScripts[src] = new Promise((resolve, reject) => {
                const el = document.createElement('script');
                el.src = src;
                el.onload = resolve;
                el.onerror = () => { delete lazyScripts[src]; reject(new Error(src)); };
                document.head.appendChild(el);
            });
        }
        return lazyScripts[src];
    }
    function map3dHtml() {
        return `<div class="m3d-stage" id="m3d-stage"><div class="m3d-msg" id="m3d-msg"></div></div><div class="m3d-info" id="m3d-info" hidden></div>`;
    }
    function layers3d() {
        return { contour: mapView.walls, walls: mapView.walls, doors: mapView.layers.includes('puertas'), power: mapView.layers.includes('luz'), zones: mapView.layers.includes('zonas'), transit: mapView.layers.includes('transito'), safety: mapView.layers.includes('seguridad'), assets: mapView.layers.includes('espacios'), columns: true };
    }
    function sync3d() {
        if (!scene3d) return;
        const layers = layers3d();
        Object.keys(layers).forEach((name) => scene3d.setLayer(name, layers[name]));
        scene3d.setLabels(mapView.names);
        const pick = document.querySelector('[data-m3d-pick]');
        if (pick) pick.disabled = !layers.assets;
        if (picker3d && !layers.assets && picker3d.isOpen()) picker3d.hide();
    }
    function destroy3d() {
        if (scene3d) { scene3d.destroy(); scene3d = null; }
        picker3d = null;
    }
    function show3dInfo(sel) {
        const box = document.getElementById('m3d-info');
        if (!box) return;
        if (!sel || !view.data) { box.hidden = true; return; }
        const layout = view.data.layout;
        if (sel.kind === 'space') {
            const s = sel.space;
            const zone = (layout.zones || []).find((z) => z.id === s.zoneId);
            const levels = (s.levels || 1) === 1 ? TEXT.level1 : fill(TEXT.levelsN, { n: s.levels });
            box.innerHTML = `<b>${esc(s.code)}</b> · ${esc(TEXT.spaceType[s.type] || s.type)}${zone ? ` · ${esc(zone.name)}` : ''} · ${fmt(s.l)} × ${fmt(s.d)} × ${fmt(s.h)} m · ${esc(levels)}`;
        } else {
            const z = sel.zone;
            box.innerHTML = `<b>${esc(z.name)}</b> · ${esc(z.type ? (TEXT.zone[z.type] || z.type) : TEXT.noZone)} · ${fmt(window.LayoutCalc.zoneArea(z))} m²`;
        }
        box.hidden = false;
    }
    async function mount3d(data) {
        const stage = document.getElementById('m3d-stage');
        if (!stage) return;
        const msg = document.getElementById('m3d-msg');
        msg.textContent = TEXT.loading3d;
        msg.hidden = false;
        try {
            await loadScriptOnce('/vendor/three/three.min.js');
            await loadScriptOnce('/LayoutScene3D.js');
            await loadScriptOnce('/LayoutAssetPicker.js');
            if (document.getElementById('m3d-stage') !== stage || !mapView.mode3d) return; // mientras cargaba se cambió de pantalla o se volvió al 2D
            destroy3d();
            scene3d = window.LayoutScene3D.create(stage, { labels: mapView.names, layers: layers3d(), onSelect: show3dInfo });
            msg.hidden = true;
            picker3d = window.LayoutAssetPicker.create(document.getElementById('m3d-picker'), {
                texts: { title: TEXT.apTitle, count: TEXT.apCount, all: TEXT.apAll, none: TEXT.apNone, close: TEXT.apClose, search: TEXT.apSearch, noResults: TEXT.apNoResults, noZone: TEXT.noZone },
                typeLabel: (type) => TEXT.spaceType[type] || type,
                hidden: [...m3dHidden],
                onChange: (hidden) => {
                    m3dHidden.clear();
                    hidden.forEach((id) => m3dHidden.add(id));
                    scene3d.setHiddenAssets(hidden);
                    const btn = document.querySelector('[data-m3d-pick]');
                    if (btn) btn.classList.toggle('filtered', hidden.size > 0);
                },
                onToggle: (open) => { const btn = document.querySelector('[data-m3d-pick]'); if (btn) btn.setAttribute('aria-expanded', String(open)); },
            });
            { const pickBtn = document.querySelector('[data-m3d-pick]'); if (pickBtn) pickBtn.classList.toggle('filtered', m3dHidden.size > 0); }
            picker3d.setData({ spaces: data.layout.spaces || [], zones: (data.layout.zones || []).map((z) => ({ id: z.id, name: z.name })) });
            scene3d.setHiddenAssets(picker3d.getHidden(), false);
            scene3d.update(data.layout, { labels: mapView.names, layers: layers3d() });
            sync3d();
        } catch (err) {
            console.error('Layout público: la vista 3D no se pudo abrir', err);
            msg.textContent = TEXT.error3d;
        }
    }
    function afterMapMount(data) {
        if (mapView.mode3d) mount3d(data); else enableMapZoom();
    }

    // ---- Buscador (la lupa) ----------------------------------------------------------------------------------------------------------------------------------------------------
    // Al tocar la lupa se abre el buscador; conforme se escribe se piden a /api/public/layout/:token/search las zonas, categorías y códigos que coinciden y el croquis se sombrea con
    // ellos (las zonas con su color, los anaqueles donde está cada código en rojo). Dentro de una zona busca solo ahí, con un toque para ampliar a todo el Layout. Al cerrarlo todo vuelve.
    // Los campos donde se busca (la lista del menú «Buscar en»): vacío = Todos.
    const SEARCH_FIELDS = ['zone', 'furniture', 'place', 'sku', 'desc', 'cat'];
    // Un candado cerrado de este QR (los manda el servidor en view.data.locks): lo que el servidor ya no entrega, la página tampoco lo dibuja.
    const locked = (key) => !!(view.data && view.data.locks && view.data.locks[key] === false);
    // Con «buscar códigos» cerrado no se ofrecen SKU ni Descripción.
    const searchFieldKeys = () => SEARCH_FIELDS.filter((k) => !(locked('codes') && (k === 'sku' || k === 'desc')));
    const SEARCH_RED = '#C0392B';
    // mode = el "Tipo de Filtro" de las tablas: Inicia con, Contiene (el de siempre) o Igual que.
    const SEARCH_MODES = ['startsWith', 'contains', 'equals'];
    const searchState = { open: false, q: '', fields: [], mode: 'contains', scope: false, timer: null, ctl: null, seq: 0, busy: false, error: false, results: null };
    const foldText = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const fill = (text, vars) => Object.keys(vars).reduce((acc, k) => acc.split(`{${k}}`).join(vars[k]), text);
    // Lo escrito se lee con el mismo motor que las tablas y el servidor (SearchSyntax.js): varias búsquedas separadas por coma (sirve CUALQUIERA), y en cada una $ = otra palabra ANTES de la buscada
    // y @ = otra palabra DESPUÉS ("rack$número@cajón"). Hasta 80 letras y 6 búsquedas, igual que acepta el servidor.
    const searchTerms = (raw) => String(raw == null ? '' : raw).slice(0, 80).split(',').slice(0, 6).join(',');
    // Contiene pide al menos 2 letras o números; Inicia con e Igual que sirven con 1 (lo mismo que valida el servidor).
    const searchReady = (query) => window.SearchSyntax.ready(searchState.mode, query);
    // Marca lo que cumple, como en las tablas: cada aparición de la palabra buscada (Contiene) o solo el arranque (Inicia con); las palabras de $ y @ se marcan más claro; con Igual que no se marca.
    function highlight(text, query, mode = searchState.mode) {
        const t = String(text == null ? '' : text);
        if (!query || mode === 'equals') return esc(t);
        let out = '';
        let at = 0;
        window.SearchSyntax.ranges(mode, query, t).forEach((r) => {
            out += `${esc(t.slice(at, r.start))}<mark${r.role === 'main' ? '' : ' class="aux"'}>${esc(t.slice(r.start, r.end))}</mark>`;
            at = r.end;
        });
        return out + esc(t.slice(at));
    }
    // Los signos de la búsqueda (SearchSyntax.js) para quien no los tiene a la mano en el teclado: $ = otra palabra antes, @ = otra palabra después, coma = otra búsqueda. Con Inicia con no hay nada «antes» del
    // arranque y con Igual que solo cuenta la coma, así que esos signos se apagan.
    const SIGN_KEYS = { '$': 'before', '@': 'after', ',': 'comma' };
    const signOff = (sign, mode) => (sign === '$' && mode !== 'contains') || (sign === '@' && mode === 'equals');
    // Escribe el signo donde está el cursor de la caja (la coma lleva su espacio) y deja el cursor justo después, con el teclado abierto.
    function insertSign(inputId, sign, onChange) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const start = input.selectionStart == null ? input.value.length : input.selectionStart;
        const end = input.selectionEnd == null ? start : input.selectionEnd;
        const text = sign === ',' ? ', ' : sign;
        input.value = input.value.slice(0, start) + text + input.value.slice(end);
        input.focus();
        try { input.setSelectionRange(start + text.length, start + text.length); } catch (err) { /* algunos teclados no dejan mover el cursor */ }
        onChange(input.value);
    }
    const searchEl = (id) => document.getElementById(id);
    // La zona donde se está parado (página de una zona o de una categoría) y si la búsqueda está limitada a ella.
    const searchPageZone = () => (view.data ? scanContext(view.data).zone : null);
    const searchScopeZone = () => (searchState.scope ? searchPageZone() : null);
    const zoneBrandColor = () => { const th = window.LayoutMapSvg.theme(view.data.companyColor); return th.custom ? th.chrome.badge : '#6C7CF0'; };

    function searchPanelHtml() {
        const zone = searchPageZone();
        // El mismo menú de filtros de las tablas: el tipo de filtro con su icono (Inicia con, Contiene, Igual que), la caja de búsqueda y la lista con «Todos» (aquí, los campos donde se busca), plegada en una línea.
        const modes = SEARCH_MODES.map((k) => `<button type="button" class="mopt" role="menuitemradio" data-search-mode="${k}" aria-pressed="${searchState.mode === k}">${esc(TEXT.searchModes[k])}</button>`).join('');
        const signs = Object.keys(SIGN_KEYS).map((s) => `<button type="button" class="mopt sg" role="menuitem" data-search-sign="${s}"${signOff(s, searchState.mode) ? ` disabled title="${esc(TEXT.searchSignOff)}"` : ''}><b aria-hidden="true">${s}</b><span>${esc(TEXT.searchSign[SIGN_KEYS[s]])}<small>${esc(TEXT.searchSignHelp[SIGN_KEYS[s]])}</small></span></button>`).join('');
        return `<div class="spanel" id="search-panel" hidden><div class="fmenu">
            <div class="mcur" id="search-mode-cur">${esc(TEXT.searchModes[searchState.mode])}</div>
            <div class="srow"><button type="button" class="fmode" data-search-modebtn aria-haspopup="menu" aria-label="${esc(TEXT.searchMode)}" title="${esc(TEXT.searchMode)}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.sliders}</svg></button>
            <button type="button" class="fmode fsign" data-search-signbtn aria-haspopup="menu" aria-label="${esc(TEXT.searchSigns)}" title="${esc(TEXT.searchSigns)}"><span aria-hidden="true">$@</span></button>
            <div class="sbox" id="search-box"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.search}</svg><input id="search-q" type="search" inputmode="search" enterkeyhint="search" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(TEXT.searchAll)}" aria-label="${esc(TEXT.search)}"><button type="button" class="sx" data-search-clear aria-label="${esc(TEXT.searchClear)}" title="${esc(TEXT.searchClear)}" hidden>×</button></div>
            <div class="mpop" id="search-mode-pop" role="menu" aria-label="${esc(TEXT.searchMode)}" hidden>${modes}</div>
            <div class="mpop sign" id="search-sign-pop" role="menu" aria-label="${esc(TEXT.searchSigns)}" hidden>${signs}</div></div>
            <button type="button" class="sumrow" data-search-fields-toggle aria-expanded="false" aria-controls="search-fields"><span class="lbl">${esc(TEXT.searchTypes)}</span><b id="search-fields-sum">${esc(searchFieldsSummary())}</b><i aria-hidden="true"></i></button>
            <div class="flist" id="search-fields" role="group" aria-label="${esc(TEXT.searchTypes)}" hidden>${fieldsListHtml()}</div>
            ${zone ? `<div class="sscope"><span>${esc(TEXT.searchScopeLabel)}</span><button type="button" id="search-scope" data-search-scope></button></div>` : ''}
        </div></div>`;
    }
    // «Buscar en»: una línea de resumen (Todos, Zona, «Zona, Mobiliario» o «3 elegidos») y la lista con «Todos» y una casilla por campo. Marcar un campo desmarca «Todos» solo; si quedan todos los campos marcados
    // o ninguno, vuelve a «Todos». Se busca en cualquiera de los campos marcados.
    function searchFieldsSummary() {
        const f = searchState.fields;
        if (!f.length) return TEXT.searchFieldsAll;
        return f.length <= 2 ? f.map((k) => TEXT.searchField[k]).join(', ') : fill(TEXT.searchSelected, { n: f.length });
    }
    function fieldsListHtml() {
        const f = searchState.fields;
        const opt = (key, label, checked, mixed) => `<label class="copt${key === 'all' ? ' all' : ''}${mixed ? ' mixed' : ''}"><input type="checkbox" data-search-field="${key}"${checked ? ' checked' : ''}><span class="box"></span><span>${esc(label)}</span></label>`;
        return opt('all', TEXT.searchFieldsAll, !f.length, !!f.length) + searchFieldKeys().map((k) => opt(k, TEXT.searchField[k], f.includes(k), false)).join('');
    }
    function drawSearchFields() {
        const list = searchEl('search-fields');
        if (list) list.innerHTML = fieldsListHtml();
        const sum = searchEl('search-fields-sum');
        if (sum) sum.textContent = searchFieldsSummary();
    }
    function setSearchField(key, checked) {
        if (key === 'all') searchState.fields = [];
        else {
            const set = new Set(searchState.fields);
            if (checked) set.add(key); else set.delete(key);
            searchState.fields = searchFieldKeys().filter((k) => set.has(k));
            if (searchState.fields.length === searchFieldKeys().length) searchState.fields = [];
        }
        drawSearchFields();
        runSearch();
    }
    // El tipo de filtro que se muestra arriba del menú y el menú que lo cambia.
    function drawSearchMode() {
        const cur = searchEl('search-mode-cur');
        if (cur) cur.textContent = TEXT.searchModes[searchState.mode];
        document.querySelectorAll('[data-search-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.searchMode === searchState.mode)));
        const pop = searchEl('search-mode-pop');
        if (pop) pop.hidden = true;
        document.querySelectorAll('[data-search-sign]').forEach((b) => {
            const off = signOff(b.dataset.searchSign, searchState.mode);
            b.disabled = off;
            if (off) b.title = TEXT.searchSignOff; else b.removeAttribute('title');
        });
        const signPop = searchEl('search-sign-pop');
        if (signPop) signPop.hidden = true;
    }
    function closeFieldsList() {
        const list = searchEl('search-fields');
        if (list) list.hidden = true;
        const toggle = document.querySelector('[data-search-fields-toggle]');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }
    // El texto de la caja y del botón de alcance sigue a lo que se está buscando.
    function drawSearchScope() {
        const zone = searchPageZone();
        const input = searchEl('search-q');
        const scoped = searchScopeZone();
        if (input) input.placeholder = scoped ? fill(TEXT.searchIn, { z: scoped.name }) : TEXT.searchAll;
        const btn = searchEl('search-scope');
        if (btn && zone) btn.textContent = scoped ? fill(TEXT.searchScopeZone, { z: zone.name }) : fill(TEXT.searchScopeAll, { z: zone.name });
    }
    // Qué se sombrea en el croquis según los resultados: zonas (color de la marca), categorías (su color, encima), la zona de cada código y los anaqueles donde está (rojo).
    function searchFocusFrom(res) {
        if (!res) return null;
        const zones = {};
        const spaces = {};
        const brand = zoneBrandColor();
        (res.zones || []).forEach((z) => { zones[z.id] = brand; });
        (res.categories || []).forEach((c) => { zones[c.zoneId] = c.color || brand; });
        (res.codes || []).forEach((c) => {
            if (c.zoneId && !zones[c.zoneId]) zones[c.zoneId] = brand;
            (c.spaceIds || []).forEach((id) => { spaces[id] = SEARCH_RED; });
        });
        // el mobiliario y las ubicaciones encontrados: el espacio en rojo y su zona con el color de la marca
        [...(res.furniture || []), ...(res.places || [])].forEach((s) => {
            if (s.zoneId && !zones[s.zoneId]) zones[s.zoneId] = brand;
            spaces[s.id] = SEARCH_RED;
        });
        return Object.keys(zones).length || Object.keys(spaces).length ? { zones, spaces } : null;
    }
    // Solo se vuelve a dibujar el croquis cuando lo sombreado cambió (cada redibujo reinicia el zoom).
    function applySearchFocus() {
        if (!view.data) return;
        const next = searchState.open ? (searchFocusFrom(searchState.results) || viewFocus.base) : viewFocus.base;
        if (JSON.stringify(next) === viewFocus.key) return;
        viewFocus.value = next;
        redrawMap(view.data);
    }
    function resultRow(href, color, glyphSvg, title, sub, q) {
        return `<a class="res" href="${esc(href)}"><span class="m" style="background:${esc(color)}"><svg viewBox="0 0 24 24" aria-hidden="true">${glyphSvg}</svg></span><span class="t"><b>${highlight(title, q)}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="go" aria-hidden="true">›</span></a>`;
    }
    function renderSearchResults() {
        const box = searchEl('sres');
        if (!box) return;
        if (!searchState.open) { box.innerHTML = ''; return; }
        const raw = searchState.q.trim();
        const q = searchTerms(raw);
        if (!searchReady(q)) { box.innerHTML = `<p class="shint">${esc(locked('codes') ? TEXT.searchHintNoCodes : TEXT.searchHint)}</p>`; return; }
        if (searchState.error) { box.innerHTML = `<p class="sempty">${esc(TEXT.searchError)}</p>`; return; }
        const res = searchState.results;
        if (!res) { box.innerHTML = searchState.busy ? `<p class="shint">${esc(TEXT.searchBusy)}</p>` : ''; return; }
        const scoped = searchScopeZone();
        const zoneBase = (z) => `${window.location.pathname}?z=${encodeURIComponent(z)}`;
        const groups = [];
        if (res.zones.length) groups.push(['zone', res.totals.zones, res.zones.map((z) => resultRow(zoneBase(z.id), zoneBrandColor(), ICONS.layers, z.name, esc(z.categories === 1 ? TEXT.searchCat1 : fill(TEXT.searchCats, { n: fmt(z.categories) })), q)).join('')]);
        const spaceRow = (s, title, sub) => resultRow(s.zoneId ? zoneBase(s.zoneId) : window.location.pathname, SEARCH_RED, ICONS.grid, title, sub, q);
        const spaceWhere = (s) => esc(s.zone || TEXT.noZone);
        if ((res.furniture || []).length) groups.push(['furniture', res.totals.furniture, res.furniture.map((s) => spaceRow(s, `${s.type || s.cls} · ${s.code}`, `${s.cls && s.type ? `${highlight(s.cls, q)} · ` : ''}${spaceWhere(s)}`)).join('')]);
        if ((res.places || []).length) groups.push(['place', res.totals.places, res.places.map((s) => spaceRow(s, s.code, `${[TEXT.spaceType[s.kind], s.type].filter(Boolean).map(esc).join(' · ')}${s.type || TEXT.spaceType[s.kind] ? ' · ' : ''}${spaceWhere(s)}`)).join('')]);
        if (res.categories.length) groups.push(['cat', res.totals.categories, res.categories.map((c) => resultRow(`${zoneBase(c.zoneId)}&c=${encodeURIComponent(c.id)}`, c.color, window.LayoutMapSvg.categoryGlyph(c.icon, '#FFFFFF', 2), c.name, `${esc(c.zoneName)}${c.desc ? ` · ${highlight(c.desc, q)}` : ''}`, q)).join('')]);
        if (res.codes.length) groups.push(['code', res.totals.codes, res.codes.map((c) => resultRow(`/Ficha.html?token=${encodeURIComponent(c.token)}`, SEARCH_RED, `<g fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round">${ICONS.code}</g>`, `${c.sku} · ${c.name}`, [c.where ? `<b class="where">${esc(c.where)}</b>` : '', c.category ? esc(c.category) : ''].filter(Boolean).join(' · '), q)).join('')]);
        if (!groups.length) {
            box.innerHTML = `<p class="sempty">${esc(scoped ? fill(TEXT.searchNoneZone, { q: raw, z: scoped.name }) : fill(TEXT.searchNone, { q: raw }))}${scoped ? ` <button type="button" class="slink" data-search-widen>${esc(TEXT.searchWiden)}</button>` : ''}</p>`;
            return;
        }
        box.innerHTML = groups.map(([kind, total, rows]) => {
            const shown = (res[{ zone: 'zones', cat: 'categories', code: 'codes', furniture: 'furniture', place: 'places' }[kind]] || []).length;
            return `<div class="sgrp"><span>${esc(TEXT.searchGroup[kind])}</span><small>${esc(total === 1 ? TEXT.searchOne : fill(TEXT.searchMany, { n: fmt(total) }))}</small></div>${rows}${total > shown ? `<p class="smore">${esc(fill(TEXT.searchMore, { n: fmt(shown), t: fmt(total) }))}</p>` : ''}`;
        }).join('');
    }
    async function runSearch() {
        window.clearTimeout(searchState.timer);
        if (searchState.ctl) searchState.ctl.abort();
        const my = ++searchState.seq;
        const raw = searchState.q.trim();
        if (!searchReady(searchTerms(raw))) {
            searchState.results = null; searchState.busy = false; searchState.error = false;
            renderSearchResults(); applySearchFocus();
            return;
        }
        searchState.busy = true;
        const ctl = new AbortController();
        searchState.ctl = ctl;
        const zone = searchScopeZone();
        const url = `/api/public/layout/${encodeURIComponent(publicToken())}/search?q=${encodeURIComponent(raw)}${searchState.fields.length ? `&fields=${searchState.fields.join(',')}` : ''}&mode=${searchState.mode}${zone ? `&z=${encodeURIComponent(zone.id)}` : ''}`;
        try {
            const res = await fetch(url, { cache: 'no-store', signal: ctl.signal });
            if (!res.ok) throw new Error('layout search failed');
            const body = await res.json();
            if (my !== searchState.seq) return;
            searchState.results = body; searchState.error = false;
        } catch (err) {
            if (my !== searchState.seq || (err && err.name === 'AbortError')) return;
            console.error('Layout público: no se pudo buscar', err);
            searchState.results = null; searchState.error = true;
        }
        searchState.busy = false;
        renderSearchResults(); applySearchFocus();
    }
    function queueSearch() {
        window.clearTimeout(searchState.timer);
        const clear = document.querySelector('[data-search-clear]');
        if (clear) clear.hidden = !searchState.q;
        // se muestra de inmediato lo de la caja vacía o muy corta; lo demás espera un momento a que termine de teclear
        if (!searchReady(searchTerms(searchState.q))) { runSearch(); return; }
        searchState.timer = window.setTimeout(runSearch, 250);
    }
    // Lo que queda al cambiar de pantalla o cerrar: sin búsqueda, sin petición pendiente y con el croquis como estaba.
    function resetSearch() {
        window.clearTimeout(searchState.timer);
        if (searchState.ctl) searchState.ctl.abort();
        searchState.seq += 1;
        Object.assign(searchState, { open: false, q: '', fields: [], mode: 'contains', scope: false, busy: false, error: false, results: null });
        document.getElementById('wrap').classList.remove('searching');
    }
    function setSearchOpen(open) {
        if (!view.data) return;
        if (!open) {
            resetSearch();
            const panel = searchEl('search-panel');
            if (panel) panel.hidden = true;
            const btn = document.querySelector('[data-map-search]');
            if (btn) btn.setAttribute('aria-expanded', 'false');
            const input = searchEl('search-q');
            if (input) input.value = '';
            drawSearchMode();
            drawSearchFields();
            closeFieldsList();
            const clear = document.querySelector('[data-search-clear]');
            if (clear) clear.hidden = true;
            renderSearchResults();
            applySearchFocus();
            return;
        }
        searchState.open = true;
        searchState.scope = !!searchPageZone();
        document.getElementById('wrap').classList.add('searching');
        searchEl('search-panel').hidden = false;
        document.querySelector('[data-map-search]').setAttribute('aria-expanded', 'true');
        drawSearchScope();
        renderSearchResults();
        searchEl('search-q').focus();
    }
    const iconSvg =(name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
    const brandBar = (data) => {
        const initials = (data.companyName || '').trim().slice(0, 2).toUpperCase() || '··';
        const mark = data.hasLogo ? `<img class="brand-logo" src="/api/public/layout/${encodeURIComponent(publicToken())}/logo" alt="">` : `<span class="brand-mark">${esc(initials)}</span>`;
        // Fuera del Layout general (una zona, una categoría…) el icono de casa regresa al Layout general desde cualquier nivel.
        const home = scanContext(data).zone ? `<a class="hbtn" href="${esc(window.location.pathname)}" aria-label="${esc(TEXT.home)}" title="${esc(TEXT.home)}">${iconSvg('home')}</a>` : '';
        // El encabezado lleva, de arriba abajo: «Layout», el Sitio (lo fuerte, igual que en el reporte y la tarjeta), el nombre de la empresa (lo débil) y la versión con su fecha; así la página no gasta otro bloque
        // de título abajo de la línea morada. Sin Sitio guardado salen «Layout», la empresa y la versión.
        const meta = `<span class="brand-meta">${versionLine(data)}</span>`;
        const kind = `<span class="brand-kind">${esc(TEXT.title)}</span>`;
        if (data.siteName) return `<div class="brand">${mark}<div class="brand-names">${kind}<span class="brand-site">${esc(data.siteName)}</span><span class="brand-name weak">${esc(data.companyName)}</span>${meta}</div>${home}</div>`;
        return `<div class="brand">${mark}<div class="brand-names">${kind}<span class="brand-name">${esc(data.companyName)}</span>${meta}</div>${home}</div>`;
    };
    // El título de la página es el Sitio (p. ej. CEDIS CHIHUAHUA); sin Sitio guardado queda "Layout".
    const pageTitle = (data) => data.siteName || TEXT.title;
    const versionLine = (data) => `${esc(TEXT.version)} ${data.version} · ${esc(TEXT.updated)} ${esc(stamp(data.updatedAt))}`;
    // Con color de cliente, la marca, los títulos, las tarjetas y los marcos van en su escala; sin color la página se ve como siempre.
    function applyBrand(theme) {
        const wrap = document.getElementById('wrap');
        ['--brand', '--brand-ink', '--brand-soft', '--brand-line'].forEach((name) => wrap.style.removeProperty(name));
        if (theme.custom) {
            wrap.style.setProperty('--brand', theme.chrome.badge);
            wrap.style.setProperty('--brand-ink', theme.chrome.ink);
            wrap.style.setProperty('--brand-soft', theme.chrome.cardBg);
            wrap.style.setProperty('--brand-line', theme.chrome.cardBorder);
        }
    }

    // Todas las zonas del croquis (las mismas que se ven dibujadas), en orden natural (Zona 2 antes que Zona 10); cada una con su tipo y los códigos que ya guarda.
    function listedZones(data) {
        return (data.layout.zones || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), LANG, { numeric: true }));
    }
    function zonesSectionHtml(data) {
        const list = listedZones(data);
        if (!list.length) return '';
        const codes = data.zoneCodes || {};
        const total = list.reduce((acc, z) => acc + (codes[z.id] || 0), 0);
        // Tipo de zona de cada una (Seco, Pasillo principal…), el mismo que sale en Datos métricos y en la página de la zona.
        const kindOf = (z) => { const info = (data.kpis.zones || []).find((k) => k.id === z.id); return info && info.type ? (TEXT.zone[info.type] || info.type) : TEXT.noZone; };
        const head = `<div class="zhead" aria-hidden="true"><span>${esc(TEXT.colZone)}</span><span>${esc(TEXT.colType)}</span><span></span><span></span></div>`;
        const rows = head + list.map((z) => `<a class="zrow" href="${esc(zoneHref(z))}"><b>${esc(z.name)}</b><span class="zk">${esc(kindOf(z))}</span><span class="zc">${locked('counts') ? '' : `<i>${fmt(codes[z.id] || 0)}</i> ${esc(codes[z.id] === 1 ? TEXT.codeWordOne : TEXT.codeWordMany)}`}</span><span class="go" aria-hidden="true">›</span></a>`).join('');
        return `<div class="pg-zones"><button type="button" class="mbtn" data-zones-toggle aria-expanded="false" aria-controls="zones-list">${iconSvg('layers')}<span class="t"><b>${esc(TEXT.zones)}</b><small>${esc((locked('counts') ? TEXT.zonesHintNoCodes : TEXT.zonesHint).replace('{z}', fmt(list.length)).replace('{c}', fmt(total)))}</small></span><span class="go" aria-hidden="true">›</span></button>
            <div id="zones-list" class="zlist" hidden>${rows}</div></div>`;
    }

    // La página de una zona (?z=<zona>): su nombre, su tipo y sus metros, y las categorías que guarda; cada una abre su propia página.
    function zonePageHtml(data, zone, color) {
        const info = (data.kpis.zones || []).find((z) => z.id === zone.id);
        const cats = Array.isArray(zone.categories) ? zone.categories : [];
        const kind = info && info.type ? (TEXT.zone[info.type] || info.type) : TEXT.noZone;
        const rows = cats.map((c) => `<a class="crow" href="${esc(`${zoneHref(zone)}&c=${encodeURIComponent(c.id)}`)}"><span class="cmark sm" style="background:${esc(c.color)}"><svg viewBox="0 0 24 24" aria-hidden="true">${window.LayoutMapSvg.categoryGlyph(c.icon, '#FFFFFF', 2)}</svg></span><span class="ctx"><b>${esc(c.name)}</b>${c.desc ? `<small>${esc(c.desc)}</small>` : ''}</span><span class="go" aria-hidden="true">›</span></a>`).join('');
        return `${crumbsHtml(upCrumbs(zone))}
            <div class="catbanner" style="border-left-color:${esc(color)}"><span class="catmark" style="background:${esc(color)}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.layers}</g></svg></span><div><div class="cattitle">${esc(zone.name)}</div><div class="catsub">${esc(kind)}${info && info.area != null ? ` · ${esc(fmt(info.area))} m²` : ''}</div></div></div>
            ${mapBlockHtml(data)}
            <div class="zextra"><h2>${esc(TEXT.categories)}</h2>${rows || `<p class="emptynote">${esc(TEXT.noCats)}</p>`}</div>`;
    }

    // ---- Clasificaciones ------------------------------------------------------------------------------------------------------------------------------------------------------
    // Una categoría Inventario del catálogo (?z=&k=inventario.<id>) lista sus clasificaciones con cuántos artículos tiene cada una en esa zona; al tocar una se abre su página (?z=&k=&l=<id | sin>):
    // título con su descripción, cuántos artículos y en qué orden, las demás clasificaciones para saltar de una a otra, el croquis con la zona y los anaqueles donde están, la búsqueda de la lista y
    // Cuadrícula | Lista. SIN CLASIFICAR (l=sin) se arma sola con los códigos que todavía no traen clasificación. Las direcciones solo llevan ids, así que el QR impreso nunca cambia.
    const CLS_NEUTRAL = '#6F7794';
    const clsLook = (item) => (item.virtual ? { color: CLS_NEUTRAL, icon: 'help' } : window.LayoutCalc.categoryLook(item.seed));
    const clsName = (item) => (item.virtual ? TEXT.noClassification : item.name);
    const clsGlyph = (look) => (look.icon === 'help' ? `<g fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.help}</g>` : window.LayoutMapSvg.categoryGlyph(look.icon, '#FFFFFF', 2));
    const clsHref = (zoneId, categoryKey, key) => `${window.location.pathname}?z=${encodeURIComponent(zoneId)}&k=${encodeURIComponent(categoryKey)}&l=${encodeURIComponent(key)}`;
    const clsState = { view: 'list', q: '', mode: 'contains', data: null, items: [], total: 0, timer: null, ctl: null, seq: 0, error: false, gone: false, built: false };
    function resetClassification() {
        window.clearTimeout(clsState.timer);
        if (clsState.ctl) clsState.ctl.abort();
        clsState.seq += 1;
        Object.assign(clsState, { view: 'list', q: '', mode: 'contains', data: null, items: [], total: 0, error: false, gone: false, built: false });
    }
    async function loadClassificationList() {
        const params = new URLSearchParams(window.location.search);
        const slot = document.getElementById('clsslot');
        const k = params.get('k') || '';
        if (!slot || !params.get('z') || !/^inventario\.\d+$/.test(k) || params.get('l') || locked('classifications')) return;
        try {
            const res = await fetch(`/api/public/layout/${encodeURIComponent(publicToken())}/classifications?z=${encodeURIComponent(params.get('z'))}&k=${encodeURIComponent(k)}`, { cache: 'no-store' });
            if (!res.ok) return;
            const body = await res.json();
            if (!body.items.length) return;
            const rows = body.items.map((item) => `<a class="cl-opt" href="${esc(clsHref(params.get('z'), k, item.key))}"><span class="cl-dot" style="background:${esc(clsLook(item).color)}"></span><span class="cl-nm">${esc(clsName(item))}</span><span class="cl-ct">${item.count === undefined ? '' : fmt(item.count)}</span><span class="go" aria-hidden="true">›</span></a>`).join('');
            slot.innerHTML = `<h2>${esc(TEXT.classifications)}</h2>${rows}`;
        } catch (err) {
            console.error('Layout público: no se pudieron leer las clasificaciones', err);
        }
    }
    function clsHeaderHtml(d) {
        const zone = (view.data.layout.zones || []).find((z) => z.id === d.zoneId);
        const item = d.classification;
        const look = clsLook(item);
        const desc = item.virtual ? TEXT.noClassificationDesc : item.description;
        const count = item.count === undefined ? '' : item.count === 1 ? TEXT.articlesOne : fill(TEXT.articlesMany, { n: fmt(item.count) });
        const categoryHref = `${window.location.pathname}?z=${encodeURIComponent(d.zoneId)}&k=${encodeURIComponent(d.categoryKey)}`;
        const crumbs = crumbsHtml([[TEXT.zones, `${window.location.pathname}#distribucion`], [zone ? zone.name : d.zoneName, zone ? zoneHref(zone) : ''], [d.categoryName, categoryHref], [clsName(item)]]);
        const banner = `<div class="catbanner" style="border-left-color:${esc(look.color)}"><span class="catmark" style="background:${esc(look.color)}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${clsGlyph(look)}</svg></span><div><div class="cattitle">${esc(clsName(item))}</div>${desc ? `<div class="catsub">${esc(desc)}</div>` : ''}${count ? `<p class="catnote">${esc(count)}</p>` : ''}</div></div>`;
        const chips = `<div class="cl-chips" role="group" aria-label="${esc(TEXT.classifications)}">${d.siblings.map((s) => `<a class="cl-chip${s.key === item.key ? ' on' : ''}" href="${esc(clsHref(d.zoneId, d.categoryKey, s.key))}"${s.key === item.key ? ' aria-current="true"' : ''}>${esc(clsName(s))}${s.count === undefined ? '' : ` <i>${fmt(s.count)}</i>`}</a>`).join('')}</div>`;
        return crumbs + banner + chips;
    }
    function clsBodyHtml(d) {
        const modes = SEARCH_MODES.map((m) => `<button type="button" class="lpill" data-cls-mode="${m}" aria-pressed="${clsState.mode === m}">${esc(TEXT.searchModes[m])}</button>`).join('');
        const signs = Object.keys(SIGN_KEYS).map((s) => `<button type="button" class="lpill" data-cls-sign="${s}" title="${esc(TEXT.searchSignHelp[SIGN_KEYS[s]])}"${signOff(s, clsState.mode) ? ' disabled' : ''}>${s} ${esc(TEXT.searchSign[SIGN_KEYS[s]])}</button>`).join('');
        const seg = (key, label, glyph) => `<button type="button" data-cls-view="${key}" aria-pressed="${clsState.view === key}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[glyph]}</svg>${esc(label)}</button>`;
        return `<div class="cl-search"><div class="sbox"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.search}</svg><input id="cls-q" type="search" inputmode="search" enterkeyhint="search" maxlength="80" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(fill(TEXT.searchIn, { z: clsName(d.classification) }))}" aria-label="${esc(fill(TEXT.searchIn, { z: clsName(d.classification) }))}"><button type="button" class="sx" data-cls-clear aria-label="${esc(TEXT.searchClear)}" title="${esc(TEXT.searchClear)}" hidden>×</button></div>
            <div class="schips" id="cls-modes" role="group" aria-label="${esc(TEXT.searchMode)}" hidden>${modes}<span class="sep" aria-hidden="true"></span>${signs}</div></div>
            <div class="cl-seg" role="group" aria-label="${esc(TEXT.viewLabel)}">${seg('grid', TEXT.viewGrid, 'grid')}${seg('list', TEXT.viewList, 'list')}</div>
            <div id="cls-results"></div>`;
    }
    function clsItemHtml(item, color, terms) {
        const where = item.loc ? [item.loc.space, item.loc.level ? fill(TEXT.clsLevel, { n: item.loc.level }) : ''].filter(Boolean).join(' · ') + (item.loc.more > 0 ? ` +${item.loc.more}` : '') : TEXT.clsNoLoc;
        const loc = locked('where') ? '' : `<span class="cl-loc${item.loc ? '' : ' none'}">${esc(where)}</span>`;
        const tag = item.token ? 'a' : 'div';
        const href = item.token ? ` href="/Ficha.html?token=${encodeURIComponent(item.token)}"` : '';
        const name = highlight(item.name, terms, clsState.mode);
        const code = esc(fill(TEXT.clsCode, { n: item.sku }));
        if (clsState.view === 'grid') {
            return `<${tag} class="cl-card"${href}><span class="cl-photo" style="--c:${esc(color)}">${item.photo ? `<img src="${esc(item.photo)}" alt="" loading="lazy">` : `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.pill}</svg>`}</span><b>${name}</b><small>${code}</small>${loc}</${tag}>`;
        }
        return `<${tag} class="cl-row"${href}><span class="cl-tile" style="background:${esc(color)}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.pill}</svg></span><span class="cl-rt"><b>${name}</b><small>${code}</small></span>${loc}</${tag}>`;
    }
    function renderClsResults() {
        const box = document.getElementById('cls-results');
        if (!box || !clsState.data) return;
        if (clsState.error) { box.innerHTML = `<p class="sempty">${esc(TEXT.clsError)}</p>`; return; }
        const raw = clsState.q.trim();
        if (!clsState.items.length) { box.innerHTML = `<p class="sempty">${esc(raw ? fill(TEXT.searchNone, { q: raw }) : TEXT.clsEmpty)}</p>`; return; }
        const color = clsLook(clsState.data.classification).color;
        const terms = searchTerms(raw);
        const rows = clsState.items.map((item) => clsItemHtml(item, color, terms)).join('');
        const more = clsState.items.length < clsState.total ? `<button type="button" class="cl-more" data-cls-more><span>${esc(TEXT.clsMore)}</span><small>${esc(fill(TEXT.clsShowing, { n: fmt(clsState.items.length), t: fmt(clsState.total) }))}</small></button>` : '';
        box.innerHTML = `<div class="${clsState.view === 'grid' ? 'cl-grid' : 'cl-list'}">${rows}</div>${more}`;
    }
    // El croquis sombrea la zona y rellena los anaqueles donde están los artículos que se están viendo (con la búsqueda aplicada), con el color de la clasificación.
    function clsApplyFocus() {
        const d = clsState.data;
        if (!d || !view.data) return;
        const color = clsLook(d.classification).color;
        const spaces = {};
        d.spaceIds.forEach((id) => { spaces[id] = color; });
        setBaseFocus({ zones: { [d.zoneId]: color }, spaces });
        if (searchState.open) applySearchFocus();
        else if (JSON.stringify(viewFocus.base) !== viewFocus.key) redrawMap(view.data);
    }
    async function fetchClassification(append) {
        const params = new URLSearchParams(window.location.search);
        window.clearTimeout(clsState.timer);
        if (clsState.ctl) clsState.ctl.abort();
        const my = ++clsState.seq;
        const ctl = new AbortController();
        clsState.ctl = ctl;
        const q = clsState.q.trim();
        const url = `/api/public/layout/${encodeURIComponent(publicToken())}/classification?z=${encodeURIComponent(params.get('z'))}&k=${encodeURIComponent(params.get('k'))}&l=${encodeURIComponent(params.get('l'))}&mode=${clsState.mode}&offset=${append ? clsState.items.length : 0}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
        try {
            const res = await fetch(url, { cache: 'no-store', signal: ctl.signal });
            if (res.status === 404 || res.status === 403) { clsState.gone = res.status === 403 ? 'locked' : true; throw new Error('classification gone'); }
            if (!res.ok) throw new Error('classification failed');
            const body = await res.json();
            if (my !== clsState.seq) return;
            clsState.data = body;
            clsState.items = append ? clsState.items.concat(body.items) : body.items;
            clsState.total = body.total;
            clsState.error = false;
        } catch (err) {
            if (my !== clsState.seq || (err && err.name === 'AbortError')) return;
            console.error('Layout público: no se pudo leer la clasificación', err);
            clsState.error = true;
        }
        const slot = document.getElementById('catslot');
        const body = document.getElementById('clsbody');
        if (!slot || !body) return;
        if (clsState.gone) { slot.innerHTML = `<p class="sempty">${esc(clsState.gone === 'locked' ? TEXT.clsLocked : TEXT.clsGone)}</p>`; return; }
        if (!clsState.built && clsState.data) {
            slot.innerHTML = clsHeaderHtml(clsState.data);
            body.innerHTML = clsBodyHtml(clsState.data);
            clsState.built = true;
        } else if (!clsState.built) {
            body.innerHTML = `<p class="sempty">${esc(TEXT.clsError)}</p>`;
            return;
        }
        renderClsResults();
        clsApplyFocus();
    }
    function queueClsSearch() {
        window.clearTimeout(clsState.timer);
        const input = document.getElementById('cls-q');
        const has = !!(input && input.value);
        const clear = document.querySelector('[data-cls-clear]');
        if (clear) clear.hidden = !has;
        const modes = document.getElementById('cls-modes');
        if (modes) modes.hidden = !has;
        clsState.timer = window.setTimeout(() => fetchClassification(false), 250);
    }

    function render(data) {
        destroy3d();
        const theme = window.LayoutMapSvg.theme(data.companyColor);
        const ctx = scanContext(data);
        document.title = pageTitle(data);
        const cat = ctx.zone && ctx.c ? (ctx.zone.categories || []).find((c) => c.id === ctx.c) : null;
        const zonePage = !!ctx.zone && !ctx.c && !ctx.k;
        // lo que se escaneó se sombrea en el croquis con su color (la zona; los anaqueles se suman cuando se sepa en cuáles está)
        const zoneColor = theme.custom ? theme.chrome.badge : '#6C7CF0';
        resetSearch();
        resetClassification();
        // la página de una clasificación: ?z=&k=&l=; mientras llegan sus datos el croquis solo muestra la zona
        const classPage = !!ctx.zone && !!ctx.k && !!ctx.l;
        setBaseFocus(zonePage ? { zones: { [ctx.zone.id]: zoneColor } } : (classPage ? { zones: { [ctx.zone.id]: CLS_NEUTRAL } } : (cat ? { zones: { [ctx.zone.id]: cat.color } } : null)));
        let body;
        if (zonePage) {
            body = zonePageHtml(data, ctx.zone, zoneColor);
        } else if (classPage) {
            body = `<div id="catslot"></div>${mapBlockHtml(data)}<div id="clsbody" class="zextra"></div>`;
        } else if (ctx.zone) {
            // una categoría de esa zona: su recorrido, su banner y el croquis; el Layout general queda a un toque (icono de casa y "Distribución")
            body = `${cat ? crumbsHtml(upCrumbs(ctx.zone, cat.name)) : ''}${categoryBanner(data)}<div id="catslot"></div>
                ${mapBlockHtml(data)}<div id="clsslot" class="zextra"></div>`;
        } else {
            body = `${categoryBanner(data)}<div id="catslot"></div>
                ${mapBlockHtml(data)}
                <div class="zextra">${positionedSpaces(data).length && !locked('positions') ? `<a class="mbtn pg-positions" href="#posiciones">${iconSvg('layers')}<span class="t"><b>${esc(TEXT.positions)}</b><small>${esc(TEXT.positionsHint.replace('{n}', positionedSpaces(data).length))}</small></span><span class="go" aria-hidden="true">›</span></a>` : ''}${locked('metrics') ? '' : `<a class="mbtn pg-metrics" href="#datos-metricos">${iconSvg('ruler')}<span class="t"><b>${esc(TEXT.metrics)}</b><small>${esc(TEXT.metricsHint.replace('{n}', fmt(data.kpis.total)))}</small></span><span class="go" aria-hidden="true">›</span></a>`}
                ${zonesSectionHtml(data)}</div>`;
        }
        // venir de "Distribución" en el recorrido debe mostrar su lista aunque se haya ocultado ese bloque
        if (!ctx.zone && window.location.hash === '#distribucion') pageView.zones = true;
        document.getElementById('wrap').innerHTML = `${brandBar(data)}${body}<div class="footer">${esc(TEXT.footer)}</div>`;
        applyPageView();
        afterMapMount(data);
        loadZoneCategoryBanner();
        loadClassificationList();
        if (classPage) fetchClassification(false);
        applyBrand(theme);
        // "Distribución" en el recorrido regresa al Layout general con la lista de zonas ya abierta
        if (!ctx.zone && window.location.hash === '#distribucion') {
            const toggle = document.querySelector('[data-zones-toggle]');
            if (toggle) { toggle.setAttribute('aria-expanded', 'true'); document.getElementById('zones-list').hidden = false; toggle.scrollIntoView({ block: 'start' }); }
        }
    }

    // Datos métricos: las cifras de siempre; al tocar una, abajo salen solo las zonas que la forman (LayoutCalc.metricRows), con sus metros y la suma.
    const METRIC_LABELS = { total: 'kpiTotal', offices: 'kpiOffices', aisles: 'kpiAisles', docks: 'kpiDocks', storage: 'kpiStorage', dead: 'kpiDead', volume: 'kpiVolume' };
    function metricDetailHtml(data, key) {
        const m = window.LayoutCalc.metricRows(data.kpis, key);
        const rows = m.rows.map((r) => {
            const name = r.kind === 'rest' ? TEXT.restRow : r.kind === 'transit' ? TEXT.transitRow : r.kind === 'overlap' ? TEXT.overlapRow : r.name;
            const type = r.kind === 'zone' ? (r.type ? (TEXT.zone[r.type] || r.type) : TEXT.noZone) : '—';
            return `<tr><td>${esc(name)}</td><td>${esc(type)}</td><td class="num">${fmt(r.value)} ${m.unit}</td></tr>`;
        }).join('') || `<tr><td colspan="3" class="emptyrow">${esc(TEXT.noZonesInMetric)}</td></tr>`;
        return `<h2>${esc(TEXT.byZone)} · ${esc(TEXT[METRIC_LABELS[key]])}</h2>
            <div class="tablebox"><table><thead><tr><th>${esc(TEXT.colZone)}</th><th>${esc(TEXT.colType)}</th><th class="num">${esc(key === 'volume' ? TEXT.colVolume : TEXT.colArea)}</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">${esc(TEXT.sum)}</td><td class="num">${fmt(m.sum)} ${m.unit}</td></tr></tfoot></table></div>`;
    }
    function renderMetrics(data, key) {
        destroy3d();
        const theme = window.LayoutMapSvg.theme(data.companyColor);
        const k = data.kpis;
        resetSearch();
        document.title = `${TEXT.metrics} · ${pageTitle(data)}`;
        const cards = window.LayoutCalc.METRIC_KEYS.map((metric) => `<button type="button" class="kpi" data-metric="${metric}" aria-pressed="${metric === key}"><b>${fmt(k[metric])} ${metric === 'volume' ? 'm³' : 'm²'}</b><span>${esc(TEXT[METRIC_LABELS[metric]])}</span></button>`).join('');
        document.getElementById('wrap').innerHTML = `
            ${brandBar(data)}
            <a class="back" href="#"><span aria-hidden="true">‹</span> ${esc(pageTitle(data))}</a>
            <div class="info"><h1>${esc(TEXT.metrics)}</h1></div>
            <div class="kpis">${cards}</div>
            <div id="metric-detail">${metricDetailHtml(data, key)}</div>
            <div class="footer">${esc(TEXT.footer)}</div>`;
        applyBrand(theme);
    }

    // Posiciones: la subpágina «#posiciones» (y «#posiciones/<activo>»): los activos que tienen posiciones y, del que se elija, sus niveles vistos desde arriba con sus espacios y posiciones (LayoutMapSvg.assetLevelsDoc).
    // El candado «positions» del QR la quita (el servidor ya no manda las posiciones).
    const positionedSpaces = (data) => {
        const lay = data.layout || {};
        const has = new Set((lay.positions || []).map((p) => p.s));
        return (lay.spaces || []).filter((s) => has.has(s.id));
    };
    function positionsDetailHtml(data, sp) {
        const lay = data.layout || {};
        const fp = (lay.footprints || []).find((f) => f.id === sp.footprintId);
        const zone = (lay.zones || []).find((z) => z.id === sp.zoneId);
        const levels = (sp.levels || 1) === 1 ? TEXT.level1 : fill(TEXT.levelsN, { n: sp.levels });
        const theme = window.LayoutMapSvg.theme(data.companyColor);
        return `<div class="info"><h2>${esc(sp.code || '')}</h2><p>${esc([zone && zone.name, fp && fp.code, levels].filter(Boolean).join(' · '))}</p></div>
            <div class="tablebox">${window.LayoutMapSvg.assetLevelsDoc(lay, sp, { theme, width: 720 })}</div><p class="posnote">${esc(TEXT.posNote)} ${esc(TEXT.posFaceNote)}</p>`;
    }
    function renderPositions(data, spaceId) {
        destroy3d();
        const theme = window.LayoutMapSvg.theme(data.companyColor);
        resetSearch();
        const spaces = positionedSpaces(data);
        const sp = spaces.find((s) => s.id === spaceId) || spaces[0];
        document.title = `${TEXT.positions} · ${pageTitle(data)}`;
        const chips = spaces.map((s) => `<button type="button" class="cchip" data-pos-space="${esc(s.id)}" aria-pressed="${sp && s.id === sp.id}">${esc(s.code || '')}</button>`).join('');
        document.getElementById('wrap').innerHTML = `
            ${brandBar(data)}
            <a class="back" href="#"><span aria-hidden="true">‹</span> ${esc(pageTitle(data))}</a>
            <div class="info"><h1>${esc(TEXT.positions)}</h1></div>
            <div class="showrow"><span>${esc(TEXT.pickAsset)}:</span>${chips}</div>
            <div id="pos-detail">${sp ? positionsDetailHtml(data, sp) : ''}</div>
            <div class="footer">${esc(TEXT.footer)}</div>`;
        applyBrand(theme);
    }

    const view = { data: null };
    // Las dos pantallas viven en la misma dirección del QR (que nunca cambia): "#datos-metricos" abre las cifras y "#datos-metricos/<cifra>" una cifra tocada.
    function route() {
        const data = view.data;
        if (!data) return;
        const m = /^#datos-metricos(?:\/([a-z]+))?$/.exec(locked('metrics') ? '' : window.location.hash);
        const pm = /^#posiciones(?:\/([A-Za-z0-9_-]+))?$/.exec(locked('positions') || !positionedSpaces(data).length ? '' : window.location.hash);
        if (m) renderMetrics(data, window.LayoutCalc.METRIC_KEYS.includes(m[1]) ? m[1] : 'total');
        else if (pm) renderPositions(data, pm[1]);
        else render(data);
        if (window.location.hash !== '#distribucion') window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', route);
    document.getElementById('wrap').addEventListener('click', (event) => {
        // Posiciones en el croquis: tocar un activo (sin haber arrastrado), cambiar de nivel o quitar
        const tapSp = view.data && positionsOn() && !mapView.mode3d ? event.target.closest('#wrap .map [data-sid]') : null;
        if (tapSp && !mapMoved) {
            const id = tapSp.getAttribute('data-sid');
            const same = mapView.posFocus && mapView.posFocus.id === id;
            mapView.posFocus = same ? null : { id, n: 1 };
            renderPosPick(view.data);
            replaceMap(view.data);
            return;
        }
        const lvBtn = event.target.closest('[data-pos-level]');
        if (lvBtn && view.data && mapView.posFocus) {
            mapView.posFocus = { id: mapView.posFocus.id, n: Number(lvBtn.dataset.posLevel) };
            renderPosPick(view.data);
            replaceMap(view.data);
            return;
        }
        if (event.target.closest('[data-pos-clear]') && view.data) {
            mapView.posFocus = null;
            renderPosPick(view.data);
            replaceMap(view.data);
            return;
        }
        const posChip = event.target.closest('[data-pos-space]');
        if (posChip && view.data) {
            const sp = positionedSpaces(view.data).find((s) => s.id === posChip.dataset.posSpace);
            if (!sp) return;
            document.querySelectorAll('#wrap [data-pos-space]').forEach((b) => b.setAttribute('aria-pressed', String(b === posChip)));
            document.getElementById('pos-detail').innerHTML = positionsDetailHtml(view.data, sp);
            window.history.replaceState(null, '', `#posiciones/${sp.id}`);
            return;
        }
        const metric = event.target.closest('[data-metric]');
        if (metric && view.data) {
            const key = metric.dataset.metric;
            document.querySelectorAll('#wrap [data-metric]').forEach((b) => b.setAttribute('aria-pressed', String(b === metric)));
            document.getElementById('metric-detail').innerHTML = metricDetailHtml(view.data, key);
            window.history.replaceState(null, '', `#datos-metricos/${key}`);
            return;
        }
        // la lupa y lo que lleva adentro: tipo de resultado, alcance (esta zona o todo el Layout) y borrar
        if (view.data) {
            if (event.target.closest('[data-map-search]')) { setSearchOpen(!searchState.open); return; }
            // el menú del tipo de filtro se cierra al tocar fuera de él
            const modePop = searchEl('search-mode-pop');
            if (modePop && !modePop.hidden && !event.target.closest('[data-search-modebtn]') && !event.target.closest('#search-mode-pop')) modePop.hidden = true;
            const signPop = searchEl('search-sign-pop');
            if (signPop && !signPop.hidden && !event.target.closest('[data-search-signbtn]') && !event.target.closest('#search-sign-pop')) signPop.hidden = true;
            if (event.target.closest('[data-search-modebtn]')) { modePop.hidden = !modePop.hidden; if (signPop) signPop.hidden = true; return; }
            if (event.target.closest('[data-search-signbtn]')) { signPop.hidden = !signPop.hidden; modePop.hidden = true; return; }
            const sign = event.target.closest('[data-search-sign]');
            if (sign) {
                if (!sign.disabled) insertSign('search-q', sign.dataset.searchSign, (value) => { searchState.q = value; queueSearch(); });
                signPop.hidden = true;
                return;
            }
            const fieldsToggle = event.target.closest('[data-search-fields-toggle]');
            if (fieldsToggle) {
                const list = searchEl('search-fields');
                list.hidden = !list.hidden;
                fieldsToggle.setAttribute('aria-expanded', String(!list.hidden));
                return;
            }
            const mode = event.target.closest('[data-search-mode]');
            if (mode) {
                searchState.mode = mode.dataset.searchMode;
                drawSearchMode();
                runSearch();
                return;
            }
            if (event.target.closest('[data-search-scope]') || event.target.closest('[data-search-widen]')) {
                searchState.scope = event.target.closest('[data-search-widen]') ? false : !searchState.scope;
                drawSearchScope();
                runSearch();
                return;
            }
            if (event.target.closest('[data-search-clear]')) {
                const input = searchEl('search-q');
                input.value = '';
                searchState.q = '';
                queueSearch();
                input.focus();
                return;
            }
        }
        // la página de una clasificación: Cuadrícula | Lista, tipo de filtro de la búsqueda de la lista, borrar y "Ver más"
        const clsView = event.target.closest('[data-cls-view]');
        if (clsView) {
            clsState.view = clsView.dataset.clsView;
            document.querySelectorAll('[data-cls-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === clsView)));
            renderClsResults();
            return;
        }
        const clsMode = event.target.closest('[data-cls-mode]');
        if (clsMode) {
            clsState.mode = clsMode.dataset.clsMode;
            document.querySelectorAll('[data-cls-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b === clsMode)));
            document.querySelectorAll('[data-cls-sign]').forEach((b) => { b.disabled = signOff(b.dataset.clsSign, clsState.mode); });
            fetchClassification(false);
            return;
        }
        const clsSign = event.target.closest('[data-cls-sign]');
        if (clsSign) {
            insertSign('cls-q', clsSign.dataset.clsSign, (value) => { clsState.q = value; queueClsSearch(); });
            return;
        }
        if (event.target.closest('[data-cls-clear]')) {
            const input = document.getElementById('cls-q');
            input.value = '';
            clsState.q = '';
            queueClsSearch();
            input.focus();
            return;
        }
        if (event.target.closest('[data-cls-more]')) { fetchClassification(true); return; }
        // los iconos que prenden o apagan el croquis, Datos métricos y Distribución
        const pageToggle = event.target.closest('[data-page-toggle]');
        if (pageToggle) {
            const key = pageToggle.dataset.pageToggle;
            pageView[key] = !pageView[key];
            applyPageView();
            return;
        }
        // Ver 2D / Ver 3D, la pastilla de las paredes y los botones propios del 3D (vistas y zoom)
        const modeBtn = event.target.closest('[data-map-mode]');
        if (modeBtn && view.data) {
            const on = modeBtn.dataset.mapMode === '3d';
            if (on !== mapView.mode3d) {
                mapView.mode3d = on;
                destroy3d();
                applyPageView();
                renderMapPanel();
                document.querySelectorAll('[data-map-mode]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.mapMode === '3d') === on)));
                replaceMap(view.data);
            }
            return;
        }
        const wallsPill = event.target.closest('[data-map-walls]');
        if (wallsPill) { mapView.walls = !mapView.walls; wallsPill.setAttribute('aria-pressed', String(mapView.walls)); sync3d(); return; }
        const view3dBtn = event.target.closest('[data-m3d-view]');
        if (view3dBtn) {
            if (scene3d) scene3d.setView(view3dBtn.dataset.m3dView);
            document.querySelectorAll('[data-m3d-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === view3dBtn)));
            return;
        }
        const pick3dBtn = event.target.closest('[data-m3d-pick]');
        if (pick3dBtn) { if (picker3d) picker3d.toggle(); return; }
        const zoom3dBtn = event.target.closest('[data-m3d-zoom]');
        if (zoom3dBtn) { if (scene3d) scene3d.zoom(zoom3dBtn.dataset.m3dZoom === 'in' ? 1.3 : 1 / 1.3); return; }
        // botones del croquis: girar, medidas, m² de las zonas y capas
        const rot = event.target.closest('[data-map-rot]');
        const meas = event.target.closest('[data-map-meas]');
        const area = event.target.closest('[data-map-area]');
        const names = event.target.closest('[data-map-names]');
        const layer = event.target.closest('[data-map-layer]');
        if ((rot || meas || area || names || layer) && view.data) {
            if (rot) mapView.rotation = (mapView.rotation + 1) % 4;
            else if (meas) { mapView.measures = !mapView.measures; meas.setAttribute('aria-pressed', String(mapView.measures)); }
            else if (area) { mapView.area = !mapView.area; area.setAttribute('aria-pressed', String(mapView.area)); }
            else if (names) { mapView.names = !mapView.names; names.setAttribute('aria-pressed', String(mapView.names)); }
            else {
                const key = layer.dataset.mapLayer;
                const on = mapView.layers.includes(key);
                // Contorno siempre se ve y siempre queda al menos una capa prendida
                if (key === 'contorno' || (on && mapView.layers.length <= 1)) return;
                mapView.layers = LAYER_KEYS.filter((k) => (k === key ? !on : mapView.layers.includes(k)));
                layer.setAttribute('aria-pressed', String(!on));
            }
            redrawMap(view.data);
            return;
        }
        const toggle = event.target.closest('[data-zones-toggle]');
        if (toggle) {
            const open = toggle.getAttribute('aria-expanded') !== 'true';
            toggle.setAttribute('aria-expanded', String(open));
            document.getElementById('zones-list').hidden = !open;
        }
    });

    document.getElementById('wrap').addEventListener('change', (event) => {
        const field = event.target.closest && event.target.closest('[data-search-field]');
        if (field) setSearchField(field.dataset.searchField, field.checked);
    });
    document.getElementById('wrap').addEventListener('mousedown', (event) => {
        if (event.target.closest('[data-search-signbtn], [data-search-sign], [data-cls-sign]')) event.preventDefault();
    });
    document.getElementById('wrap').addEventListener('input', (event) => {
        if (event.target.id === 'cls-q') { clsState.q = event.target.value; queueClsSearch(); return; }
        if (event.target.id !== 'search-q') return;
        searchState.q = event.target.value;
        queueSearch();
    });
    document.getElementById('wrap').addEventListener('keydown', (event) => {
        if (event.target.id === 'cls-q' && event.key === 'Enter') { event.preventDefault(); fetchClassification(false); return; }
        if (event.target.id !== 'search-q') return;
        if (event.key === 'Escape') {
            setSearchOpen(false);
            const btn = document.querySelector('[data-map-search]');
            if (btn) btn.focus();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            runSearch();
        }
    });

    (async function init() {
        // /q/<token>: el token es el último tramo de la dirección.
        const token = decodeURIComponent(window.location.pathname.split('/').filter(Boolean).pop() || '');
        if (!/^[0-9a-f]{32}$/.test(token)) { renderState(TEXT.notFound); return; }
        try {
            const res = await fetch(`/api/public/layout/${encodeURIComponent(token)}`, { cache: 'no-store' });
            if (res.status === 404) { renderState(TEXT.notFound); return; }
            if (!res.ok) throw new Error('layout public failed');
            view.data = await res.json();
            // sin datos métricos no se dibujan las medidas ni los m² de las zonas del croquis
            if (locked('metrics')) { mapView.measures = false; mapView.area = false; }
            route();
        } catch (err) {
            console.error('Layout público: no se pudo cargar', err);
            renderState(TEXT.error);
        }
    }());
}());
