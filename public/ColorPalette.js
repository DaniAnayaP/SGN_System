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
    let seedCounter = 0; // ids únicos del botón del color representativo (puede haber más de un widget en la página)

    function sameHex(a, b) {
        return !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
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

            const footer = document.createElement('div');
            footer.className = 'perm-tree-color-footer';
            // Más colores...: la ventana completa de ColorDialog.js (Estándar y
            // Personalizado), la misma que usa el árbol para el color de una columna.
            // La paleta se cierra al abrirla; al Aceptar el color se aplica y queda en
            // "recientes" igual que uno de los cuadros. Cancelar no cambia nada.
            const moreBtn = document.createElement('button');
            moreBtn.type = 'button';
            moreBtn.className = 'perm-tree-color-more-btn';
            moreBtn.textContent = t('admin.masterTreeMoreColors');
            moreBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                const startHex = getCurrent();
                closePalettePopover();
                if (!window.ColorDialog) return;
                window.ColorDialog.open({ title: t('admin.colorDialogTitle'), currentHex: startHex, onAccept: (hex) => pick(hex) });
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
        // Igual que los colores de la tabla de abajo: un círculo con su código y el lápiz
        // abren la paleta del árbol. El input de color queda oculto: solo guarda el valor
        // (y normaliza el hex) que lee el resto del widget.
        const seedInput = document.createElement('input');
        seedInput.type = 'color';
        seedInput.className = 'palette-color-input';
        seedInput.tabIndex = -1;
        seedInput.setAttribute('aria-hidden', 'true');
        seedInput.value = seedValue;
        const seedValueRow = document.createElement('div');
        seedValueRow.className = 'palette-seed-value';
        const seedSwatch = document.createElement('button');
        seedSwatch.type = 'button';
        seedSwatch.className = 'palette-swatch';
        seedSwatch.id = `palette-seed-btn-${seedCounter += 1}`;
        seedSwatch.setAttribute('aria-label', t('admin.paletteSeedLabel'));
        seedSwatch.setAttribute('data-help-key', 'paletteSeed');
        seedLabel.htmlFor = seedSwatch.id;
        const seedHexText = document.createElement('span');
        seedHexText.className = 'palette-hex';
        const seedEditBtn = document.createElement('button');
        seedEditBtn.type = 'button';
        seedEditBtn.className = 'admin-icon-btn';
        seedEditBtn.setAttribute('aria-label', t('admin.edit'));
        seedEditBtn.setAttribute('data-help-key', 'paletteEditColor');
        seedEditBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        seedValueRow.append(seedSwatch, seedHexText, seedEditBtn, seedInput);
        seedField.append(seedLabel, seedValueRow);
        function syncSeedDisplay() {
            seedSwatch.style.backgroundColor = seedInput.value;
            seedHexText.textContent = seedInput.value.toUpperCase();
        }
        syncSeedDisplay();
        const openSeedPicker = () => {
            if (popoverState && popoverState.key === 'seed') { closePalettePopover(); return; }
            openPalettePopover({
                key: 'seed',
                anchors: [seedSwatch, seedEditBtn],
                getCurrent: () => seedInput.value,
                // Restablecer: el azul con el que arranca el sistema.
                resetTo: () => DEFAULT_PALETTE.seed,
                onPick: (hex) => { seedInput.value = hex; syncSeedDisplay(); },
            });
        };
        seedSwatch.addEventListener('click', openSeedPicker);
        seedEditBtn.addEventListener('click', openSeedPicker);
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

        // Vista previa: dos pantallas reales (Inicio y una tabla) pintadas con la paleta que
        // se está editando, más la lista de "dónde se usa cada color". Oculta hasta pedirla.
        // Pasar el mouse (o el foco) por un color de la tabla de arriba o de la lista marca en
        // la pantalla dónde se usa. Las zonas que NO salen de la paleta (columnas de Control
        // Interno, insignia de estatus) se marcan como "No cambia con la paleta".
        const preview = document.createElement('div');
        preview.className = 'palette-pv';
        preview.hidden = true;
        container.appendChild(preview);

        previewToggleBtn.addEventListener('click', () => { preview.hidden = !preview.hidden; });

        const fieldInputs = {};
        let previewTab = 'home';

        const ICON = (name) => `<i class="bx ${name}" aria-hidden="true"></i>`;
        function previewScreenMarkup() {
            const tableRows = [
                ['29/oct/2026', '#1042', 'ECO-14', 'Beto Contador', '120'],
                ['29/oct/2026', '#1043', 'ECO-21', 'Ana Contadora', '85'],
                ['28/oct/2026', '#1041', 'ECO-07', 'Adela Administradora', '140'],
                ['28/oct/2026', '#1040', 'ECO-14', 'Beto Contador', '96'],
            ].map(([date, reg, unit, driver, liters]) => `
                <tr>
                    <td class="pvx-sys" data-r="fixed">Distribuidora Ejemplo</td><td class="pvx-sys" data-r="fixed">${date}</td><td class="pvx-sys" data-r="fixed">${reg}</td>
                    <td>${unit}</td><td>${driver}</td><td>${liters}</td>
                    <td><span class="pvx-status" data-r="fixed">${t('admin.palettePvStatusActive')}</span></td>
                </tr>`).join('');
            return `
            <div class="pvx-screen" data-tab="home">
                <aside class="pvx-sb" data-r="surface">
                    <div class="pvx-brand" data-r="accent accentText"><i></i><span>Distribuidora Ejemplo</span></div>
                    <div class="pvx-hr" data-r="border"></div>
                    <div class="pvx-srch" data-r="border textSecondary">${ICON('bx-search')}${t('sidebar.searchPlaceholder')}</div>
                    <nav class="pvx-menu">
                        <div class="pvx-mi pvx-act pvx-v-home" data-r="accent accentText">${ICON('bx-home-alt-2')}${t('menu.home')}</div>
                        <div class="pvx-mi pvx-v-table" data-r="textSecondary">${ICON('bx-home-alt-2')}${t('menu.home')}</div>
                        <div class="pvx-mi" data-r="textSecondary">${ICON('bx-grid-alt')}${t('menu.panel')}<span class="pvx-tip" data-r="tooltipBg tooltipText">${t('menu.panel')}</span></div>
                        <div class="pvx-mi" data-r="textSecondary">${ICON('bx-bar-chart-alt-2')}${t('menu.dashboard')}</div>
                    </nav>
                    <div class="pvx-foot" data-r="border">
                        <div class="pvx-ucard"><span class="pvx-av" data-r="accent textSecondary">DA</span><div><div class="pvx-un" data-r="textPrimary">Daniel Anaya</div><div class="pvx-ur" data-r="textSecondary">${t('main.userCardRoleClientAdmin')}</div></div></div>
                        <div class="pvx-mi" data-r="textSecondary">${ICON('bx-log-out-circle')}${t('sidebar.logout')}</div>
                    </div>
                </aside>
                <div class="pvx-mn" data-r="bg">
                    <div class="pvx-tb" data-r="surface border">
                        <span class="pvx-welcome pvx-v-home" data-r="textPrimary">${t('main.welcome')}</span>
                        <span class="pvx-welcome pvx-v-table" data-r="textPrimary">${t('menu.opTransVolCombustible')}</span>
                        <span class="pvx-sp"></span>
                        <span class="pvx-ico" data-r="textSecondary"><span>${ICON('bx-help-circle')}</span><span>${ICON('bx-chevron-up')}</span></span>
                    </div>
                    <div class="pvx-bc" data-r="bg border">
                        <span class="pvx-bc-list">
                            <b class="pvx-v-home" data-r="textPrimary">${t('menu.home')}</b>
                            <span class="pvx-v-table" data-r="textSecondary">${t('menu.home')} ›</span>
                            <b class="pvx-v-table" data-r="textPrimary">${t('menu.opTransVolCombustible')}</b>
                        </span>
                        <span class="pvx-ico" data-r="textSecondary"><span>${ICON('bx-map')}</span><span>${ICON('bx-chevron-up')}</span></span>
                    </div>
                    <div class="pvx-blank pvx-v-home"></div>
                    <div class="pvx-pane pvx-v-table">
                        <div class="pvx-tool">
                            <span class="pvx-newbtn" data-r="surface border textPrimary">+ ${t('main.newRecord')}</span>
                            <span class="pvx-sp"></span>
                            ${['bx-zoom-out', 'bx-zoom-in', 'bx-pin', 'bx-show', 'bx-history', 'bx-filter-alt'].map((i) => `<span class="pvx-rb" data-r="surface border textSecondary">${ICON(i)}</span>`).join('')}
                        </div>
                        <div class="pvx-tw" data-r="surface border">
                            <table class="pvx-dt">
                                <thead>
                                    <tr class="pvx-band"><th colspan="3" data-r="fixed">${t('menu.classControlInterno')}</th><th colspan="4" class="pvx-gb" data-r="bg textSecondary">${t('admin.palettePvGroupData')}</th></tr>
                                    <tr class="pvx-hd" data-r="bg textSecondary"><th>${t('main.colSysEmpresa')}</th><th>${t('admin.palettePvColDate')}</th><th>${t('admin.palettePvColRecord')}</th><th>${t('admin.palettePvColUnit')}</th><th>${t('main.colFuelDriver')}</th><th>${t('admin.palettePvColLiters')}</th><th>${t('admin.palettePvColStatus')}</th></tr>
                                </thead>
                                <tbody data-r="textPrimary">${tableRows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
        }
        const PV_ROLE_USE = {
            bg: 'Bg', surface: 'Surface', border: 'Border', textPrimary: 'TextPrimary', textSecondary: 'TextSecondary',
            accent: 'Accent', tooltipBg: 'TooltipBg', tooltipText: 'TooltipText',
        };

        function highlightRole(roleKey, on) {
            preview.querySelectorAll(`[data-r~="${roleKey}"]`).forEach((el) => el.classList.toggle('pvx-hl', on));
            preview.querySelectorAll('.pvx-role').forEach((li) => li.classList.toggle('pvx-role-on', on && li.dataset.role === roleKey));
        }

        function renderLegend() {
            const list = preview.querySelector('.pvx-roles');
            if (!list) return;
            const tabSuffix = previewTab === 'table' ? 'Table' : 'Home';
            list.innerHTML = '';
            const entries = ROLE_FIELDS.map(({ key, labelKey }) => ({ key, name: t(labelKey), use: t(`admin.palettePvUse${PV_ROLE_USE[key]}${tabSuffix}`), color: palette[key] }));
            if (previewTab === 'table') entries.push({ key: 'fixed', name: t('admin.palettePvFixed'), use: t('admin.palettePvUseFixedTable'), color: null });
            entries.forEach((entry) => {
                const li = document.createElement('li');
                li.className = `pvx-role${entry.color ? '' : ' pvx-role-fixed'}`;
                li.tabIndex = 0;
                li.dataset.role = entry.key;
                const dot = document.createElement('i');
                dot.className = `pvx-dot${entry.color ? '' : ' pvx-dot-fixed'}`;
                if (entry.color) dot.style.backgroundColor = entry.color;
                const head = document.createElement('b');
                head.textContent = entry.name;
                if (entry.color) {
                    const code = document.createElement('code');
                    code.textContent = entry.color.toUpperCase();
                    head.appendChild(code);
                }
                const use = document.createElement('span');
                use.textContent = entry.use;
                li.append(dot, head, use);
                li.addEventListener('mouseenter', () => highlightRole(entry.key, true));
                li.addEventListener('mouseleave', () => highlightRole(entry.key, false));
                li.addEventListener('focus', () => highlightRole(entry.key, true));
                li.addEventListener('blur', () => highlightRole(entry.key, false));
                list.appendChild(li);
            });
        }

        function setPreviewTab(tab) {
            previewTab = tab;
            preview.querySelectorAll('.pvx-hl').forEach((el) => el.classList.remove('pvx-hl'));
            const screen = preview.querySelector('.pvx-screen');
            if (screen) screen.dataset.tab = tab;
            preview.querySelectorAll('[data-pvx-tab]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.pvxTab === tab)));
            const title = preview.querySelector('.pvx-title');
            if (title) title.textContent = t(tab === 'table' ? 'admin.palettePvTitleTable' : 'admin.palettePvTitleHome');
            const hint = preview.querySelector('.pvx-hint');
            if (hint) hint.textContent = t(tab === 'table' ? 'admin.palettePvHintTable' : 'admin.palettePvHintHome');
            renderLegend();
        }

        function buildPreview() {
            preview.innerHTML = `
                <div class="pvx-tabs" role="group" aria-label="${t('admin.palettePvTabsLabel')}" data-help-key="palettePreviewTabs">
                    <button type="button" data-pvx-tab="home" aria-pressed="true">${t('menu.home')}</button>
                    <button type="button" data-pvx-tab="table" aria-pressed="false">${t('admin.palettePvTabTable')}</button>
                </div>
                <div class="pvx-stage">
                    <div class="pvx-screen-wrap">
                        <div class="pvx-label pvx-title"></div>
                        ${previewScreenMarkup()}
                        <p class="pvx-hint"></p>
                    </div>
                    <div class="pvx-legend" data-help-key="palettePreviewLegend">
                        <div class="pvx-label">${t('admin.palettePvLegend')}</div>
                        <ul class="pvx-roles"></ul>
                    </div>
                </div>`;
            preview.querySelectorAll('[data-pvx-tab]').forEach((btn) => btn.addEventListener('click', () => setPreviewTab(btn.dataset.pvxTab)));
            setPreviewTab(previewTab);
        }

        function renderPreview() {
            const screen = preview.querySelector('.pvx-screen');
            if (!screen) return;
            const vars = {
                '--p-bg': palette.bg, '--p-surface': palette.surface, '--p-border': palette.border,
                '--p-tp': palette.textPrimary, '--p-ts': palette.textSecondary,
                '--p-accent': palette.accent, '--p-accent-text': palette.accentText,
                '--p-tt-bg': palette.tooltipBg, '--p-tt-text': palette.tooltipText,
            };
            Object.entries(vars).forEach(([name, value]) => screen.style.setProperty(name, value));
            renderLegend();
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
                    // El texto que va sobre el acento (blanco o negro) se vuelve a calcular solo.
                    if (key === 'accent') palette.accentText = readableTextColor(input.value);
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
                // Pasar el mouse (o el foco) por el color marca en la vista previa dónde se usa.
                tr.addEventListener('mouseenter', () => highlightRole(key, true));
                tr.addEventListener('mouseleave', () => highlightRole(key, false));
                tr.addEventListener('focusin', () => highlightRole(key, true));
                tr.addEventListener('focusout', () => highlightRole(key, false));
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

        buildPreview();
        renderGrid();

        return {
            getPalette() {
                return { ...palette, seed: seedInput.value };
            },
            setPalette(newPalette) {
                palette = { ...DEFAULT_PALETTE, ...(newPalette || {}) };
                seedInput.value = palette.seed || seedInput.value;
                syncSeedDisplay();
                renderGrid();
            },
            refreshLabels() {
                seedLabel.textContent = t('admin.paletteSeedLabel');
                seedSwatch.setAttribute('aria-label', t('admin.paletteSeedLabel'));
                seedEditBtn.setAttribute('aria-label', t('admin.edit'));
                suggestBtn.textContent = t('admin.paletteSuggest');
                hint.textContent = t('admin.paletteHint');
                buildPreview();
                renderGrid();
            },
        };
    }

    window.ColorPalette = { create, suggestPalette, readableTextColor };
})();
