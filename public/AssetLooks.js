// ---------------------------------------------------------------------------
// Apariencia de los activos en el Layout (2026-11-13, Daniel: «que se elija conforme el modelo cómo se verá en el layout»).
// Cada MODELO (Catálogos > Activos Fijos > Modelos) puede elegir su apariencia entre las de su Tipo; vacío = «La del Tipo» (lo que se dibujaba hasta hoy). Aquí viven la lista de apariencias por «Se dibuja como» (kind) del Tipo
// y sus vistas previas (SVG chico). De momento solo los sensores; gabinetes, anaqueles y racks siguen uno por uno. El servidor revisa lo mismo (ASSET_LOOKS en server.js).
//   AssetLooks.looksFor(kind)        las apariencias de ese tipo de dibujo ([] si todavía no tiene)
//   AssetLooks.effective(kind, look) la que de verdad se dibuja (la del modelo o, vacía, la del Tipo)
//   AssetLooks.thumb(look)           la vista previa en SVG (cuadrada, viewBox 0 0 100 100)
// ---------------------------------------------------------------------------
const AssetLooks = (() => {
    const BY_KIND = { sensor: ['sensor-wall', 'sensor-probe', 'sensor-disc'] };
    const DEFAULT_OF = { sensor: 'sensor-disc' }; // lo que dibuja «La del Tipo»
    const EDGE = '#9AA2B8';
    const BODY = '#F4F5F8';
    const SCREEN = '#16302A';
    const GREEN = '#7BE3A6';
    const TEAL = '#2B8CA3';
    const FLOOR = '#DDE1EC';
    const THUMBS = {
        'sensor-wall': `<rect x="20" y="12" width="60" height="76" rx="8" fill="${BODY}" stroke="${EDGE}" stroke-width="2.5"/><rect x="27" y="20" width="46" height="34" rx="3" fill="${SCREEN}"/>
            <text x="50" y="40" text-anchor="middle" font-size="13" font-weight="700" fill="${GREEN}" font-family="Poppins,sans-serif">24.5°C</text><text x="50" y="50" text-anchor="middle" font-size="7.5" fill="${GREEN}" font-family="Poppins,sans-serif">45 %HR</text>
            <circle cx="38" cy="68" r="3.4" fill="${EDGE}"/><circle cx="50" cy="68" r="3.4" fill="${EDGE}"/><circle cx="62" cy="68" r="3.4" fill="${EDGE}"/><rect x="32" y="77" width="36" height="4" rx="2" fill="${EDGE}" opacity=".6"/>`,
        'sensor-probe': `<rect x="24" y="14" width="52" height="44" rx="7" fill="${BODY}" stroke="${EDGE}" stroke-width="2.5"/><rect x="31" y="21" width="38" height="20" rx="3" fill="${SCREEN}"/>
            <text x="50" y="35" text-anchor="middle" font-size="10" font-weight="700" fill="${GREEN}" font-family="Poppins,sans-serif">4.2°C</text>
            <path d="M50 58 C50 72 62 76 62 90" fill="none" stroke="${EDGE}" stroke-width="3" stroke-linecap="round"/><rect x="58" y="86" width="9" height="9" rx="2" fill="${TEAL}"/>`,
        'sensor-disc': `<circle cx="50" cy="50" r="30" fill="${TEAL}" stroke="${EDGE}" stroke-width="3"/><circle cx="50" cy="50" r="18" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2"/>`,
    };
    const looksFor = (kind) => BY_KIND[kind] || [];
    const effective = (kind, look) => (look && looksFor(kind).includes(look) ? look : (DEFAULT_OF[kind] || ''));
    const thumb = (look) => `<svg class="asset-look-thumb" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect width="100" height="100" rx="14" fill="${FLOOR}"/>${THUMBS[look] || ''}</svg>`;
    return { looksFor, effective, thumb };
})();
window.AssetLooks = AssetLooks;
