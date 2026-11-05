// Encabezado de las páginas públicas de los QR de operación (Limpieza, Temperaturas, Sensor, Seguridad): el mismo del Layout público, arriba de todo.
// Logo del cliente (o sus iniciales si no tiene), el tipo de página en letras chicas, el Sitio (lo fuerte, con el color del cliente) y el nombre de la empresa (lo débil).
// Usa los colores de la página (--ink, --muted, --line, --accent; o los de la Ficha: --text-primary, --text-muted, --border, --accent-1) y, si el cliente tiene color, una escala de ese color con la misma regla que LayoutMapSvg.theme (mismos tonos:
// el 7.º para el sitio y la marca, el 9.º para el tipo); en modo oscuro los tonos claros para que se lea.
(function () {
    'use strict';
    const LIGHTNESS = [97, 92, 84, 74, 63, 52, 42, 33, 24, 15];
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function hexToHsl(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255; const g = parseInt(hex.slice(3, 5), 16) / 255; const b = parseInt(hex.slice(5, 7), 16) / 255;
        const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2; const d = max - min;
        if (!d) return [0, 0, l * 100];
        const s = d / (1 - Math.abs(2 * l - 1));
        let h;
        if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
        return [(h * 60 + 360) % 360, s * 100, l * 100];
    }
    function hslToHex(h, s, l) {
        const sat = s / 100; const lig = l / 100;
        const c = (1 - Math.abs(2 * lig - 1)) * sat; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = lig - c / 2;
        const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
        const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
        return `#${to(r)}${to(g)}${to(b)}`;
    }
    // La escala de 10 tonos del color del cliente (del más claro al más oscuro); vacía si no hay un color válido.
    function scaleOf(seed) {
        if (!/^#[0-9a-fA-F]{6}$/.test(seed || '')) return [];
        const [h, s0] = hexToHsl(seed);
        const sat = s0 < 8 ? 0 : Math.max(30, Math.min(65, s0));
        return LIGHTNESS.map((l) => hslToHex(h, sat, l));
    }

    const CSS = `
.qb{ --qb-line:var(--line, var(--border, #e0e3f0)); --qb-accent:var(--accent, var(--accent-1, #6C7CF0)); --qb-muted:var(--muted, var(--text-muted, #8890ac)); --qb-text:var(--ink, var(--text-primary, #1c1f30));
    --qb-site:var(--qb-site-l, var(--qb-accent)); --qb-ink:var(--qb-ink-l, var(--qb-muted));
    display:flex; align-items:center; gap:10px; padding:2px 2px 12px; border-bottom:1px solid var(--qb-line); }
.qb-mark{ width:34px; height:34px; border-radius:9px; background:var(--qb-mark, var(--qb-accent)); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; font-size:13px; flex:none; }
.qb-logo{ height:36px; max-width:120px; object-fit:contain; flex:none; background:#fff; border:1px solid var(--qb-line); border-radius:9px; padding:3px; }
.qb-names{ display:grid; gap:1px; min-width:0; }
.qb-kind{ font-size:10px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--qb-ink); line-height:1.2; }
.qb-site{ font-size:16px; font-weight:800; color:var(--qb-site); line-height:1.2; overflow-wrap:anywhere; }
.qb-company{ font-size:10.5px; font-weight:600; letter-spacing:.03em; text-transform:uppercase; color:var(--qb-muted); line-height:1.25; overflow-wrap:anywhere; }
.qb-company.strong{ font-size:13px; font-weight:700; letter-spacing:0; text-transform:none; color:var(--qb-text); }
@media (prefers-color-scheme: dark){ .qb:not(.qb-light){ --qb-site:var(--qb-site-d, var(--qb-accent)); --qb-ink:var(--qb-ink-d, var(--qb-muted)); } }
`;

    // mount(elemento, { kind, siteName, companyName, hasLogo, companyColor, logoUrl, light }): dibuja el encabezado dentro del elemento. logoUrl = de dónde sale la imagen del logo; light = la página no tiene modo oscuro (la Ficha).
    function mount(el, opts) {
        if (!el) return;
        if (!document.getElementById('qb-style')) {
            const style = document.createElement('style');
            style.id = 'qb-style';
            style.textContent = CSS;
            document.head.appendChild(style);
        }
        const o = opts || {};
        const company = String(o.companyName || '').trim();
        const initials = company.slice(0, 2).toUpperCase() || '··';
        const mark = `<span class="qb-mark">${esc(initials)}</span>`;
        const logo = o.hasLogo && o.logoUrl ? `<img class="qb-logo" src="${esc(o.logoUrl)}" alt="">` : '';
        const names = o.siteName
            ? `<span class="qb-kind">${esc(o.kind)}</span><span class="qb-site">${esc(o.siteName)}</span><span class="qb-company">${esc(company)}</span>`
            : `<span class="qb-kind">${esc(o.kind)}</span><span class="qb-company strong">${esc(company)}</span>`;
        el.innerHTML = `<div class="qb">${logo || mark}<div class="qb-names">${names}</div></div>`;
        const box = el.firstElementChild;
        if (o.light) box.classList.add('qb-light');
        const scale = scaleOf(o.companyColor);
        if (scale.length) {
            box.style.setProperty('--qb-mark', scale[7]);
            box.style.setProperty('--qb-site-l', scale[7]);
            box.style.setProperty('--qb-ink-l', scale[9]);
            box.style.setProperty('--qb-site-d', scale[3]);
            box.style.setProperty('--qb-ink-d', scale[2]);
        }
        // un logo que no cargue se cambia por las iniciales
        const img = box.querySelector('.qb-logo');
        if (img) img.addEventListener('error', () => { img.outerHTML = mark; });
    }
    window.QrBrandHeader = { mount };
})();
