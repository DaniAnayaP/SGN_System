// ---------------------------------------------------------------------------
// Los TRES logos de una compañía, uno por estilo del sistema (pedido de Daniel, 2026-11-19): Claro (fondo blanco), Oscuro (fondo oscuro) e Institucional (sobre el color de la compañía). Así el sistema sabe cuál mostrar
// cuando alguien cambia de estilo (Dashboard.applyClientBranding). Lo comparten la pantalla donde SGN da de alta o edita al cliente (Admin-SaaS) y «Configuración del Negocio» (el administrador del cliente). El Claro es el de
// siempre (logoDataUrl) y sirve de respaldo: si falta el Oscuro o el Institucional se usa ese, así los clientes que ya tenían un solo logo siguen viéndose igual. Se carga después de Dashboard.js.
// Uso: const logos = BrandLogos.mount(contenedor, { idPrefix, onError }); logos.setValues({...}); logos.getValues() → { logoDataUrl, logoDarkDataUrl, logoInstitutionalDataUrl }.
// ---------------------------------------------------------------------------
(function () {
'use strict';
const MAX_BYTES = 350 * 1024; // el mismo tope del logo de siempre
const ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp';
// name = el nombre corto del estilo (el mismo del menú Estilo); label = el nombre largo, para quien usa lector de pantalla
const VARIANTS = [
    { key: 'light', field: 'logoDataUrl', name: 'main.styleLight', label: 'admin.logoLight' },
    { key: 'dark', field: 'logoDarkDataUrl', name: 'main.styleDark', label: 'admin.logoDark' },
    { key: 'institutional', field: 'logoInstitutionalDataUrl', name: 'main.styleInstitutional', label: 'admin.logoInstitutional' },
];
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function mount(container, options) {
    const prefix = (options && options.idPrefix) || 'brand-logo';
    const onError = (options && options.onError) || (() => {});
    const values = { light: '', dark: '', institutional: '' };
    container.classList.add('brand-logos');

    function draw() {
        container.innerHTML = `<div class="brand-logos-title">${esc(Dashboard.t('admin.logo'))}</div><div class="brand-logos-row">${VARIANTS.map((v) => `<div class="brand-logo-card" data-variant="${v.key}">
            <span class="brand-logo-stage brand-logo-stage-${v.key}"><img class="brand-logo-preview" alt="" ${values[v.key] ? `src="${esc(values[v.key])}"` : 'hidden'}></span>
            <div class="brand-logo-side">
                <span class="brand-logo-name">${esc(Dashboard.t(v.name))}</span>
                <span class="brand-logo-btns">
                    <label class="btn btn-secondary brand-logo-pick" for="${prefix}-${v.key}" data-help-key="brandLogoUpload">${esc(Dashboard.t('admin.logoChoose'))}</label>
                    <input id="${prefix}-${v.key}" class="sr-only" type="file" accept="${ACCEPT}" aria-label="${esc(Dashboard.t(v.label))}">
                    <button type="button" class="admin-icon-btn brand-logo-x" data-brand-logo-clear="${v.key}" aria-label="${esc(Dashboard.t('admin.removeLogo'))}" title="${esc(Dashboard.t('admin.removeLogo'))}" data-help-key="brandLogoRemove"${values[v.key] ? '' : ' hidden'}><i class="bx bx-x" aria-hidden="true"></i></button>
                </span>
            </div>
        </div>`).join('')}</div>`;
    }
    container.addEventListener('change', (event) => {
        const input = event.target;
        const card = input.closest && input.closest('[data-variant]');
        if (!card || input.type !== 'file') return;
        const key = card.dataset.variant;
        const file = input.files && input.files[0];
        if (!file) return;
        if (file.size > MAX_BYTES) { onError(Dashboard.t('admin.saveError')); input.value = ''; return; }
        const reader = new FileReader();
        // el logo se guarda como el de siempre: una imagen cuadrada se recorta en círculo (svgifyLogo); un SVG se queda tal cual
        reader.onload = () => { values[key] = Dashboard.svgifyLogo(reader.result); draw(); };
        reader.readAsDataURL(file);
    });
    container.addEventListener('click', (event) => {
        const btn = event.target.closest && event.target.closest('[data-brand-logo-clear]');
        if (!btn) return;
        values[btn.dataset.brandLogoClear] = '';
        draw();
    });
    // al cambiar de idioma se vuelven a escribir los textos (los logos elegidos se conservan)
    document.addEventListener('dashboard:language-changed', draw);
    draw();
    return {
        setValues(data) { VARIANTS.forEach((v) => { values[v.key] = (data && data[v.field]) || ''; }); draw(); },
        getValues() { return Object.fromEntries(VARIANTS.map((v) => [v.field, values[v.key] || null])); },
        clear() { VARIANTS.forEach((v) => { values[v.key] = ''; }); draw(); },
    };
}

window.BrandLogos = { mount, VARIANTS };
})();
