// ---------------------------------------------------------------------------
// Institutional color palette: generates a full, readable theme from one
// seed color (the client's "most representative" brand color), then lets
// the admin fine-tune every individual role by hand. Used by both
// Admin-SaaS.html (GEIPSA setting it up for a client) and
// Business-Config.html (the client's own admin adjusting it later).
//
// The palette covers exactly the same roles as the built-in light/dark
// themes (see :root / body.dark-mode in Inicio-en.css), so "Institucional"
// can override the whole theme, not just an accent color:
//   bg, surface, border, textPrimary, textSecondary, accent,
//   tooltipBg, tooltipText  (+ accentText, derived, for text drawn on accent)
// ---------------------------------------------------------------------------

(function () {
    // --- Color math -----------------------------------------------------------
    function hexToRgb(hex) {
        const clean = hex.replace('#', '');
        const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
        const n = parseInt(full, 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s;
        const l = (max + min) / 2;
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                default: h = (r - g) / d + 4;
            }
            h /= 6;
        }
        return { h: h * 360, s: s * 100, l: l * 100 };
    }

    function hslToRgb(h, s, l) {
        h /= 360; s /= 100; l /= 100;
        if (s === 0) {
            const v = l * 255;
            return { r: v, g: v, b: v };
        }
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return {
            r: hue2rgb(p, q, h + 1 / 3) * 255,
            g: hue2rgb(p, q, h) * 255,
            b: hue2rgb(p, q, h - 1 / 3) * 255,
        };
    }

    function hexToHsl(hex) {
        const { r, g, b } = hexToRgb(hex);
        return rgbToHsl(r, g, b);
    }

    function hslToHex(h, s, l) {
        const { r, g, b } = hslToRgb(h, s, l);
        return rgbToHex(r, g, b);
    }

    // WCAG-ish relative luminance, used to pick readable black/white text.
    function readableTextColor(bgHex) {
        const { r, g, b } = hexToRgb(bgHex);
        const [rs, gs, bs] = [r, g, b].map((c) => {
            c /= 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        const luminance = 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        return luminance > 0.5 ? '#000000' : '#FFFFFF';
    }

    function suggestPalette(seedHex) {
        const { h, s } = hexToHsl(seedHex);
        const sat = Math.min(s, 55);
        const tooltipBg = hslToHex(h, Math.min(sat + 10, 60), 18);
        return {
            seed: seedHex,
            bg: hslToHex(h, Math.min(sat, 25), 95),
            surface: '#FFFFFF',
            border: hslToHex(h, Math.min(sat, 35), 84),
            textPrimary: hslToHex(h, Math.min(sat, 30), 16),
            textSecondary: hslToHex(h, Math.min(sat, 22), 40),
            accent: seedHex,
            accentText: readableTextColor(seedHex),
            tooltipBg,
            tooltipText: readableTextColor(tooltipBg),
        };
    }

    const ROLE_FIELDS = [
        { key: 'bg', labelKey: 'admin.paletteBg' },
        { key: 'surface', labelKey: 'admin.paletteSurface' },
        { key: 'border', labelKey: 'admin.paletteBorder' },
        { key: 'textPrimary', labelKey: 'admin.paletteTextPrimary' },
        { key: 'textSecondary', labelKey: 'admin.paletteTextSecondary' },
        { key: 'accent', labelKey: 'admin.paletteAccent' },
        { key: 'tooltipBg', labelKey: 'admin.paletteTooltipBg' },
        { key: 'tooltipText', labelKey: 'admin.paletteTooltipText' },
    ];

    const DEFAULT_PALETTE = suggestPalette('#1a73e8');

    function t(key) {
        return window.Dashboard ? window.Dashboard.t(key) : key;
    }

    // --- UI widget --------------------------------------------------------------
    function create(container, { initial } = {}) {
        let palette = { ...DEFAULT_PALETTE, ...(initial || {}) };
        const seedValue = palette.seed || '#1a73e8';

        container.innerHTML = '';
        container.classList.add('color-palette-widget');

        const seedRow = document.createElement('div');
        seedRow.className = 'palette-seed-row';
        const seedField = document.createElement('div');
        seedField.className = 'admin-field';
        const seedLabel = document.createElement('label');
        seedLabel.textContent = t('admin.paletteSeedLabel');
        const seedInput = document.createElement('input');
        seedInput.type = 'color';
        seedInput.value = seedValue;
        seedField.append(seedLabel, seedInput);
        const suggestBtn = document.createElement('button');
        suggestBtn.type = 'button';
        suggestBtn.className = 'btn btn-secondary';
        suggestBtn.textContent = t('admin.paletteSuggest');
        seedRow.append(seedField, suggestBtn);
        container.appendChild(seedRow);

        const hint = document.createElement('p');
        hint.className = 'admin-hint palette-hint';
        hint.textContent = t('admin.paletteHint');
        container.appendChild(hint);

        const grid = document.createElement('div');
        grid.className = 'palette-grid';
        container.appendChild(grid);

        const preview = document.createElement('div');
        preview.className = 'palette-preview';
        preview.innerHTML = `
            <div class="palette-preview-bar"></div>
            <div class="palette-preview-body">
                <div class="palette-preview-item palette-preview-item-active"></div>
                <div class="palette-preview-item"></div>
                <div class="palette-preview-btn"></div>
            </div>
        `;
        container.appendChild(preview);

        const fieldInputs = {};

        function renderPreview() {
            const bar = preview.querySelector('.palette-preview-bar');
            const body = preview.querySelector('.palette-preview-body');
            const activeItem = preview.querySelector('.palette-preview-item-active');
            const plainItem = preview.querySelector('.palette-preview-item:not(.palette-preview-item-active)');
            const btn = preview.querySelector('.palette-preview-btn');
            bar.style.background = palette.accent;
            bar.style.color = palette.accentText;
            body.style.background = palette.bg;
            activeItem.style.background = palette.accent;
            activeItem.style.color = palette.accentText;
            plainItem.style.color = palette.textSecondary;
            plainItem.style.background = palette.surface;
            plainItem.style.borderColor = palette.border;
            btn.style.background = palette.accent;
            btn.style.color = palette.accentText;
        }

        function renderGrid() {
            grid.innerHTML = '';
            ROLE_FIELDS.forEach(({ key, labelKey }) => {
                const field = document.createElement('div');
                field.className = 'admin-field palette-field';
                const label = document.createElement('label');
                label.textContent = t(labelKey);
                const input = document.createElement('input');
                input.type = 'color';
                input.value = palette[key] || '#000000';
                input.addEventListener('input', () => {
                    palette = { ...palette, [key]: input.value };
                    renderPreview();
                });
                fieldInputs[key] = input;
                field.append(label, input);
                grid.appendChild(field);
            });
            renderPreview();
        }

        suggestBtn.addEventListener('click', () => {
            palette = suggestPalette(seedInput.value);
            renderGrid();
        });

        renderGrid();

        return {
            getPalette() {
                return { ...palette, seed: seedInput.value };
            },
            setPalette(newPalette) {
                palette = { ...DEFAULT_PALETTE, ...(newPalette || {}) };
                seedInput.value = palette.seed || seedInput.value;
                renderGrid();
            },
        };
    }

    window.ColorPalette = { create, suggestPalette, readableTextColor };
})();
