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

    // --- Paleta emergente de un color ----------------------------------------------
    // Misma paleta que el árbol de permisos (Colores del tema / Estándar /
    // Recientes / Más colores... / Restablecer), con las mismas clases CSS
    // (.perm-tree-color-*, Admin.css), para que las dos pantallas se vean y se
    // usen igual. Las 8 familias son las del árbol (de claro a oscuro; la 4.ª es
    // la "base" de cada una); lo que se guarda es el hex, no un id, así que
    // "Más colores..." puede devolver cualquier color.
    const COLOR_FAMILIES = [
        { id: 'purple', shades: ['#EEEDFE', '#CECBF6', '#AFA9EC', '#7F77DD', '#534AB7', '#3C3489'] },
        { id: 'teal', shades: ['#E1F5EE', '#9FE1CB', '#5DCAA5', '#1D9E75', '#0F6E56', '#085041'] },
        { id: 'coral', shades: ['#FAECE7', '#F5C4B3', '#F0997B', '#D85A30', '#993C1D', '#712B13'] },
        { id: 'pink', shades: ['#FBEAF0', '#F4C0D1', '#ED93B1', '#D4537E', '#993556', '#72243E'] },
        { id: 'blue', shades: ['#E6F1FB', '#B5D4F4', '#85B7EB', '#378ADD', '#185FA5', '#0C447C'] },
        { id: 'green', shades: ['#EAF3DE', '#C0DD97', '#97C459', '#639922', '#3B6D11', '#27500A'] },
        { id: 'amber', shades: ['#FAEEDA', '#FAC775', '#EF9F27', '#BA7517', '#854F0B', '#633806'] },
        { id: 'gray', shades: ['#F1EFE8', '#D3D1C7', '#B4B2A9', '#888780', '#5F5E5A', '#444441'] },
    ];
    // Más recientes primero, sin repetir, máximo 8 -- compartidos por todas las
    // paletas abiertas en la página, igual que en el árbol.
    const recentColors = [];
    let popoverState = null; // { key, close }

    function sameHex(a, b) {
        return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
    }

    function normalizeHex(value) {
        const clean = String(value || '').trim().replace(/^#/, '');
        if (/^[0-9a-f]{3}$/i.test(clean)) return '#' + clean.split('').map((c) => c + c).join('').toLowerCase();
        if (/^[0-9a-f]{6}$/i.test(clean)) return '#' + clean.toLowerCase();
        return null;
    }

    function closePalettePopover() {
        if (popoverState) { popoverState.close(); popoverState = null; }
    }

    // anchors: los botones que la abren (el círculo y Editar); un clic en ellos
    // no la cierra por fuera, así el propio botón la alterna.
    function openPalettePopover({ key, anchors, getCurrent, resetTo, onPick }) {
        closePalettePopover();
        const panel = document.createElement('div');
        panel.className = 'perm-tree-color-popover palette-popover';
        let customOpen = false;

        function pick(hex) {
            const idx = recentColors.findIndex((c) => sameHex(c, hex));
            if (idx !== -1) recentColors.splice(idx, 1);
            recentColors.unshift(hex);
            if (recentColors.length > 8) recentColors.length = 8;
            onPick(hex);
        }

        function render() {
            const current = getCurrent();
            panel.innerHTML = '';
            const addSection = (labelKey) => {
                const label = document.createElement('div');
                label.className = 'perm-tree-color-section-label';
                label.textContent = t(labelKey);
                panel.appendChild(label);
            };
            const addSwatch = (container, hex, small) => {
                const swatch = document.createElement('button');
                swatch.type = 'button';
                swatch.className = small ? 'perm-tree-color-swatch perm-tree-color-swatch-sm' : 'perm-tree-color-swatch';
                swatch.style.backgroundColor = hex;
                swatch.setAttribute('aria-label', hex);
                if (sameHex(current, hex)) {
                    swatch.classList.add('perm-tree-color-swatch-selected');
                    swatch.innerHTML = '<i class="bx bx-check" aria-hidden="true"></i>';
                }
                swatch.addEventListener('click', (event) => {
                    event.stopPropagation();
                    pick(hex);
                    render();
                    place();
                });
                container.appendChild(swatch);
            };

            addSection('admin.masterTreeColorThemeColors');
            const themeGrid = document.createElement('div');
            themeGrid.className = 'perm-tree-color-theme-grid';
            for (let row = 0; row < 6; row += 1) {
                COLOR_FAMILIES.forEach((family) => addSwatch(themeGrid, family.shades[row], true));
            }
            panel.appendChild(themeGrid);

            addSection('admin.masterTreeColorStandard');
            const standardRow = document.createElement('div');
            standardRow.className = 'perm-tree-color-standard-row';
            COLOR_FAMILIES.forEach((family) => addSwatch(standardRow, family.shades[3], false));
            panel.appendChild(standardRow);

            if (recentColors.length) {
                addSection('admin.masterTreeColorRecent');
                const recentRow = document.createElement('div');
                recentRow.className = 'perm-tree-color-standard-row';
                recentColors.forEach((hex) => addSwatch(recentRow, hex, false));
                panel.appendChild(recentRow);
            }

            // Más colores...: el selector del sistema y un campo de hex, a la vista
            // dentro de la propia paleta (un clic directo en el selector, no uno
            // disparado por código, que es lo que algunos navegadores bloquean).
            if (customOpen) {
                const custom = document.createElement('div');
                custom.className = 'palette-popover-custom';
                const native = document.createElement('input');
                native.type = 'color';
                native.value = normalizeHex(current) || '#000000';
                native.setAttribute('aria-label', t('admin.masterTreeMoreColors'));
                const hexField = document.createElement('input');
                hexField.type = 'text';
                hexField.className = 'palette-popover-hex';
                hexField.maxLength = 7;
                hexField.spellcheck = false;
                hexField.value = (normalizeHex(current) || '').toUpperCase();
                hexField.placeholder = '#RRGGBB';
                hexField.setAttribute('aria-label', t('admin.masterTreeColorHex'));
                // Sin volver a dibujar la paleta mientras se arrastra: se cerraría
                // el selector del sistema que está abierto.
                native.addEventListener('input', () => {
                    hexField.value = native.value.toUpperCase();
                    onPick(native.value);
                });
                native.addEventListener('change', () => pick(native.value));
                const applyHex = () => {
                    const hex = normalizeHex(hexField.value);
                    if (!hex) { hexField.value = (normalizeHex(getCurrent()) || '').toUpperCase(); return; }
                    native.value = hex;
                    hexField.value = hex.toUpperCase();
                    if (!sameHex(hex, getCurrent())) pick(hex);
                };
                hexField.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter') { event.preventDefault(); applyHex(); render(); place(); }
                });
                hexField.addEventListener('blur', applyHex);
                custom.append(native, hexField);
                panel.appendChild(custom);
            }

            const footer = document.createElement('div');
            footer.className = 'perm-tree-color-footer';
            const moreBtn = document.createElement('button');
            moreBtn.type = 'button';
            moreBtn.className = 'perm-tree-color-more-btn';
            moreBtn.textContent = t('admin.masterTreeMoreColors');
            moreBtn.setAttribute('aria-expanded', String(customOpen));
            moreBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                customOpen = !customOpen;
                render();
                place();
            });
            // Restablecer: este color vuelve al que se sugiere a partir del color
            // representativo del cliente; apagado si ya es ese.
            const resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.className = 'perm-tree-color-reset-btn';
            resetBtn.innerHTML = '<i class="bx bx-reset" aria-hidden="true"></i>';
            resetBtn.appendChild(document.createTextNode(t('admin.masterTreeColorReset')));
            resetBtn.title = t('admin.paletteResetRole');
            resetBtn.setAttribute('aria-label', resetBtn.title);
            resetBtn.disabled = sameHex(current, resetTo());
            resetBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                onPick(resetTo());
                render();
                place();
            });
            footer.append(moreBtn, resetBtn);
            panel.appendChild(footer);
        }

        // Fija a <body> (la tabla y el modal se desplazan y recortan): debajo del
        // botón, arriba si ahí hay más lugar, y siempre dentro de la ventana.
        const host = anchors[0];
        document.body.appendChild(panel);
        function place() {
            const r = host.getBoundingClientRect();
            const w = panel.offsetWidth;
            const h = panel.offsetHeight;
            const margin = 8;
            const below = window.innerHeight - r.bottom - margin;
            const above = r.top - margin;
            const top = (below >= h || below >= above) ? r.bottom + 4 : r.top - h - 4;
            panel.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - h - margin))}px`;
            panel.style.left = `${Math.max(margin, Math.min(r.left, window.innerWidth - w - margin))}px`;
        }
        render();
        place();

        const onDocClick = (event) => {
            if (panel.contains(event.target) || anchors.some((a) => a.contains(event.target))) return;
            closePalettePopover();
        };
        // Escape cierra solo la paleta, no el diálogo que la contiene (el
        // cierre por Escape del modal está en la fase de burbujeo del document):
        // por eso esta escucha va en la fase de captura y corta el evento.
        const onKey = (event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            closePalettePopover();
        };
        window.addEventListener('resize', place);
        document.addEventListener('scroll', place, true);
        document.addEventListener('click', onDocClick, true);
        document.addEventListener('keydown', onKey, true);
        popoverState = {
            key,
            close() {
                panel.remove();
                window.removeEventListener('resize', place);
                document.removeEventListener('scroll', place, true);
                document.removeEventListener('click', onDocClick, true);
                document.removeEventListener('keydown', onKey, true);
            },
        };
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
        seedInput.setAttribute('aria-label', t('admin.paletteSeedLabel'));
        seedInput.setAttribute('data-help-key', 'paletteSeed');
        seedField.append(seedLabel, seedInput);
        const suggestBtn = document.createElement('button');
        suggestBtn.type = 'button';
        suggestBtn.className = 'btn btn-secondary';
        suggestBtn.textContent = t('admin.paletteSuggest');
        suggestBtn.setAttribute('data-help-key', 'paletteSuggest');
        seedRow.append(seedField, suggestBtn);
        container.appendChild(seedRow);

        const hint = document.createElement('p');
        hint.className = 'admin-hint palette-hint';
        hint.textContent = t('admin.paletteHint');
        container.appendChild(hint);

        const grid = document.createElement('div');
        grid.className = 'palette-table-wrapper';
        container.appendChild(grid);

        // Preview stays hidden until asked for — it used to always render
        // below the (now scrollable, sticky-header) table, competing for
        // attention with the row being edited.
        const previewToggleBtn = document.createElement('button');
        previewToggleBtn.type = 'button';
        previewToggleBtn.className = 'btn btn-secondary palette-preview-toggle';
        previewToggleBtn.textContent = t('admin.paletteShowPreview');
        previewToggleBtn.setAttribute('data-help-key', 'paletteShowPreview');
        container.appendChild(previewToggleBtn);

        const preview = document.createElement('div');
        preview.className = 'palette-preview';
        preview.hidden = true;
        preview.innerHTML = `
            <div class="palette-preview-bar"></div>
            <div class="palette-preview-body">
                <div class="palette-preview-item palette-preview-item-active"></div>
                <div class="palette-preview-item"></div>
                <div class="palette-preview-btn"></div>
            </div>
        `;
        container.appendChild(preview);

        previewToggleBtn.addEventListener('click', () => { preview.hidden = !preview.hidden; });

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
            closePalettePopover();
            grid.innerHTML = '';
            const table = document.createElement('table');
            table.className = 'palette-table';
            const thead = document.createElement('thead');
            const headRow = document.createElement('tr');
            [t('admin.paletteColorColumn'), t('admin.paletteValueColumn'), t('admin.edit')].forEach((text) => {
                const th = document.createElement('th');
                th.textContent = text;
                headRow.appendChild(th);
            });
            thead.appendChild(headRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            ROLE_FIELDS.forEach(({ key, labelKey }) => {
                const tr = document.createElement('tr');

                const tdRole = document.createElement('td');
                tdRole.textContent = t(labelKey);

                // Native color input kept (hidden) only as this row's value
                // holder -- it normalizes the hex and the rest of the widget
                // reads it back. Editing goes through the quick palette
                // popover (openPalettePopover) opened by the swatch / Editar.
                const input = document.createElement('input');
                input.type = 'color';
                input.className = 'palette-color-input';
                input.value = palette[key] || '#000000';

                const tdValue = document.createElement('td');
                const swatch = document.createElement('button');
                swatch.type = 'button';
                swatch.className = 'palette-swatch';
                swatch.setAttribute('aria-label', t('admin.edit'));
                swatch.setAttribute('data-help-key', 'paletteEditColor');
                const hexText = document.createElement('span');
                hexText.className = 'palette-hex';
                tdValue.append(swatch, hexText, input);

                const tdEdit = document.createElement('td');
                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.className = 'admin-icon-btn';
                editBtn.setAttribute('aria-label', t('admin.edit'));
                editBtn.setAttribute('data-help-key', 'paletteEditColor');
                editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
                tdEdit.appendChild(editBtn);

                function syncValueDisplay() {
                    swatch.style.backgroundColor = input.value;
                    hexText.textContent = input.value.toUpperCase();
                }
                syncValueDisplay();

                function applyColor(hex) {
                    input.value = hex;
                    palette = { ...palette, [key]: input.value };
                    syncValueDisplay();
                    renderPreview();
                }
                const openPicker = () => {
                    if (popoverState && popoverState.key === key) { closePalettePopover(); return; }
                    openPalettePopover({
                        key,
                        anchors: [swatch, editBtn],
                        getCurrent: () => input.value,
                        resetTo: () => suggestPalette(seedInput.value)[key],
                        onPick: applyColor,
                    });
                };
                swatch.addEventListener('click', openPicker);
                editBtn.addEventListener('click', openPicker);

                fieldInputs[key] = input;
                tr.append(tdRole, tdValue, tdEdit);
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            grid.appendChild(table);
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
            refreshLabels() {
                seedLabel.textContent = t('admin.paletteSeedLabel');
                suggestBtn.textContent = t('admin.paletteSuggest');
                hint.textContent = t('admin.paletteHint');
                renderGrid();
            },
        };
    }

    window.ColorPalette = { create, suggestPalette, readableTextColor };
})();
