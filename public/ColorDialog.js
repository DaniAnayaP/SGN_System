// ---------------------------------------------------------------------------
// "Más colores..." -- la ventana completa para elegir un color (Estándar: un
// panal de hexágonos; Personalizado: cuadro de saturación/brillo, tira de
// matiz y campos RGB/Hex; "Nuevo" y "Actual" lado a lado). Antes vivía dentro
// de PermissionTree.js y solo la usaba el color de las clasificaciones del
// árbol; ahora la comparten el árbol y el selector de colores del cliente
// (ColorPalette.js), así que los dos se ven y se usan igual.
//
// Uso: ColorDialog.open({ title, currentHex, onAccept(hex) })
//   - Nada se guarda hasta pulsar Aceptar; Cancelar, Escape o un clic en el
//     fondo descartan lo que se haya probado.
//   - Reutiliza las clases .perm-tree-color-* de Admin.css (mismo aspecto).
// ---------------------------------------------------------------------------
(function () {
    function t(key, params) {
        return window.Dashboard ? window.Dashboard.t(key, params) : key;
    }

    function hsvToHex(h, s, v) {
        const c = v * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = v - c;
        let r = 0; let g = 0; let b = 0;
        if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
        else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
        const toHex = (n) => Math.max(0, Math.min(255, Math.round((n + m) * 255))).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
    function hexToRgb(hex) {
        return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
    }
    // Inverso de hsvToHex: así Personalizado abre con el cuadro, su marcador y la
    // tira de matiz ya en los valores del color actual, no siempre en el mismo azul.
    function hexToHsv(hex) {
        const { r: r255, g: g255, b: b255 } = hexToRgb(hex);
        const r = r255 / 255; const g = g255 / 255; const b = b255 / 255;
        const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
        let h = 0;
        if (d !== 0) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = ((b - r) / d) + 2;
            else h = ((r - g) / d) + 4;
            h *= 60;
            if (h < 0) h += 360;
        }
        return { h, s: max === 0 ? 0 : d / max, v: max };
    }
    function normalizeHex(value) {
        const clean = String(value || '').trim().replace(/^#/, '');
        if (/^[0-9a-f]{3}$/i.test(clean)) return `#${clean.split('').map((c) => c + c).join('').toLowerCase()}`;
        if (/^[0-9a-f]{6}$/i.test(clean)) return `#${clean.toLowerCase()}`;
        return null;
    }

    let dialogEl = null;
    let dialogState = null; // { pickedHex, onAccept }

    function ensureDialog() {
        if (dialogEl) return;
        dialogEl = document.createElement('div');
        dialogEl.className = 'modal-overlay';
        dialogEl.hidden = true;
        dialogEl.innerHTML = `
            <div class="modal-panel perm-tree-color-dialog" role="dialog" aria-modal="true" aria-labelledby="perm-tree-color-dialog-title">
                <h3 id="perm-tree-color-dialog-title"></h3>
                <div class="perm-tree-color-tabs">
                    <button type="button" class="perm-tree-color-tab perm-tree-color-tab-active" data-tab="std">${t('admin.masterTreeColorTabStandard')}</button>
                    <button type="button" class="perm-tree-color-tab" data-tab="custom">${t('admin.masterTreeColorTabCustom')}</button>
                </div>
                <div class="perm-tree-color-tab-panel" data-panel="std">
                    <div class="perm-tree-color-mosaic" data-role="mosaic"></div>
                    <div class="perm-tree-color-gray-row" data-role="gray-row"></div>
                </div>
                <div class="perm-tree-color-tab-panel" data-panel="custom" hidden>
                    <div class="perm-tree-color-sv-row">
                        <div class="perm-tree-color-sv-wrap">
                            <canvas data-role="sv-canvas" width="220" height="150" class="perm-tree-color-sv-canvas"></canvas>
                            <div class="perm-tree-color-sv-marker" data-role="sv-marker"></div>
                        </div>
                        <div class="perm-tree-color-hue-wrap">
                            <div class="perm-tree-color-hue-strip" data-role="hue-strip"></div>
                            <div class="perm-tree-color-hue-arrow" data-role="hue-arrow"></div>
                        </div>
                    </div>
                    <div class="perm-tree-color-model-row">
                        <label>${t('admin.masterTreeColorModel')}</label>
                        <select disabled><option>RGB</option></select>
                    </div>
                    <div class="perm-tree-color-rgb-grid">
                        <label>${t('admin.masterTreeColorRed')}</label>
                        <input type="number" min="0" max="255" data-role="rgb-r" class="perm-tree-color-rgb-input">
                        <label>${t('admin.masterTreeColorGreen')}</label>
                        <input type="number" min="0" max="255" data-role="rgb-g" class="perm-tree-color-rgb-input">
                        <label>${t('admin.masterTreeColorBlue')}</label>
                        <input type="number" min="0" max="255" data-role="rgb-b" class="perm-tree-color-rgb-input">
                        <label>${t('admin.masterTreeColorHex')}</label>
                        <input type="text" data-role="hex-input" class="perm-tree-color-hex-input">
                    </div>
                </div>
                <div class="perm-tree-color-dialog-footer">
                    <div style="display:flex; gap:0.7rem;">
                        <div class="perm-tree-color-preview-col">
                            <div class="perm-tree-color-preview-label">${t('admin.masterTreeColorNew')}</div>
                            <div class="perm-tree-color-preview-swatch" data-role="preview-main"></div>
                        </div>
                        <div class="perm-tree-color-preview-col">
                            <div class="perm-tree-color-preview-label">${t('admin.masterTreeColorCurrent')}</div>
                            <div class="perm-tree-color-preview-swatch" data-role="preview-current"></div>
                        </div>
                    </div>
                    <div class="admin-form-actions">
                        <button type="button" class="btn btn-secondary" data-role="cancel">${t('admin.cancel')}</button>
                        <button type="button" class="btn" data-role="accept">${t('admin.confirmAccept')}</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(dialogEl);
        const panel = dialogEl.querySelector('.perm-tree-color-dialog');
        const tabs = Array.from(dialogEl.querySelectorAll('.perm-tree-color-tab'));
        const panels = Array.from(dialogEl.querySelectorAll('.perm-tree-color-tab-panel'));
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                tabs.forEach((t2) => t2.classList.toggle('perm-tree-color-tab-active', t2 === tab));
                panels.forEach((p) => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
                if (tab.dataset.tab === 'custom') drawSvCanvas();
            });
        });
        const close = () => { dialogEl.hidden = true; dialogState = null; };
        dialogEl.querySelector('[data-role="cancel"]').addEventListener('click', close);
        dialogEl.addEventListener('click', (event) => { if (event.target === dialogEl) close(); });
        // En fase de captura y cortando el evento: si esta ventana se abrió encima de
        // otra (el cliente nuevo, el árbol), Escape cierra solo ésta y no la de abajo.
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || dialogEl.hidden) return;
            event.stopPropagation();
            close();
        }, true);
        dialogEl.querySelector('[data-role="accept"]').addEventListener('click', () => {
            if (!dialogState) return;
            const { pickedHex, onAccept } = dialogState;
            close();
            if (typeof onAccept === 'function') onAccept(pickedHex);
        });

        // Estándar: un panal de hexágonos, matiz por el ángulo alrededor del centro y
        // saturación por la distancia a él (mismo arreglo que "Colores estándar" de Windows).
        const mosaic = panel.querySelector('[data-role="mosaic"]');
        const previewMain = panel.querySelector('[data-role="preview-main"]');
        const previewCurrent = panel.querySelector('[data-role="preview-current"]');
        const hexClip = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
        const setPicked = (hex) => {
            if (dialogState) dialogState.pickedHex = hex;
            previewMain.style.backgroundColor = hex;
        };
        const rowCounts = [9, 10, 11, 12, 13, 12, 11, 10, 9];
        const centerRow = 4;
        rowCounts.forEach((count, rowIdx) => {
            const row = document.createElement('div');
            row.className = 'perm-tree-color-mosaic-row-cells';
            for (let i = 0; i < count; i += 1) {
                const dx = i - count / 2; const dy = rowIdx - centerRow;
                const dist = Math.sqrt((dx * dx * 0.85) + (dy * dy)) / 6.8;
                const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
                const hex = hsvToHex(angle, Math.min(1, dist), 1 - Math.min(0.55, dist * 0.25));
                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'perm-tree-color-hex-cell';
                cell.style.backgroundColor = hex;
                cell.style.clipPath = hexClip;
                cell.setAttribute('aria-label', hex);
                cell.addEventListener('click', () => setPicked(hex));
                row.appendChild(cell);
            }
            mosaic.appendChild(row);
        });
        const grayRow = panel.querySelector('[data-role="gray-row"]');
        for (let g = 0; g < 9; g += 1) {
            const v = Math.round(255 - (g * (255 / 8)));
            const hex = hsvToHex(0, 0, v / 255);
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'perm-tree-color-hex-cell perm-tree-color-hex-cell-sm';
            cell.style.backgroundColor = hex;
            cell.style.clipPath = hexClip;
            cell.setAttribute('aria-label', hex);
            cell.addEventListener('click', () => setPicked(hex));
            grayRow.appendChild(cell);
        }

        // Personalizado: cuadro de saturación (x) / brillo (y) para el matiz elegido y el
        // matiz en la tira de al lado; los dos se arrastran (mousedown y mousemove, no un
        // solo clic) y cada uno marca con claridad qué punto está elegido. Los campos
        // Rojo/Verde/Azul y Hex son otra forma, igual de viva, de llegar al mismo color.
        const canvas = panel.querySelector('[data-role="sv-canvas"]');
        const ctx = canvas.getContext('2d');
        const svMarker = panel.querySelector('[data-role="sv-marker"]');
        const hueStrip = panel.querySelector('[data-role="hue-strip"]');
        const hueArrow = panel.querySelector('[data-role="hue-arrow"]');
        const hexInput = panel.querySelector('[data-role="hex-input"]');
        const rgbR = panel.querySelector('[data-role="rgb-r"]');
        const rgbG = panel.querySelector('[data-role="rgb-g"]');
        const rgbB = panel.querySelector('[data-role="rgb-b"]');
        let hue = 252;
        let sat = 1;
        let val = 1;
        function drawSvCanvas() {
            const w = canvas.width; const h = canvas.height;
            const satGrad = ctx.createLinearGradient(0, 0, w, 0);
            satGrad.addColorStop(0, '#fff');
            satGrad.addColorStop(1, hsvToHex(hue, 1, 1));
            ctx.fillStyle = satGrad;
            ctx.fillRect(0, 0, w, h);
            const valGrad = ctx.createLinearGradient(0, 0, 0, h);
            valGrad.addColorStop(0, 'rgba(0,0,0,0)');
            valGrad.addColorStop(1, '#000');
            ctx.fillStyle = valGrad;
            ctx.fillRect(0, 0, w, h);
        }
        // Única fuente de "el color acaba de cambiar": actualiza todo lo demás (marcador,
        // flecha del matiz, hex, RGB y la vista de "Nuevo"), sin importar qué control se usó.
        function applyHsv(h, s, v, skip) {
            hue = h; sat = s; val = v;
            const hex = hsvToHex(h, s, v);
            if (skip !== 'marker') { svMarker.style.left = `${s * 100}%`; svMarker.style.top = `${(1 - v) * 100}%`; }
            if (skip !== 'hue') { hueArrow.style.top = `${(h / 360) * 100}%`; drawSvCanvas(); }
            if (skip !== 'hex') hexInput.value = hex;
            if (skip !== 'rgb') { const rgb = hexToRgb(hex); rgbR.value = rgb.r; rgbG.value = rgb.g; rgbB.value = rgb.b; }
            setPicked(hex);
        }
        function dragHandler(el, onMove) {
            let dragging = false;
            const move = (event) => { if (dragging) onMove(event); };
            el.addEventListener('mousedown', (event) => { dragging = true; onMove(event); });
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', () => { dragging = false; });
        }
        dragHandler(canvas, (event) => {
            const rect = canvas.getBoundingClientRect();
            const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
            const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
            applyHsv(hue, x, 1 - y, 'hue');
        });
        dragHandler(hueStrip, (event) => {
            const rect = hueStrip.getBoundingClientRect();
            const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
            applyHsv(y * 360, sat, val, null);
        });
        hexInput.addEventListener('input', () => {
            if (!/^#[0-9a-fA-F]{6}$/.test(hexInput.value)) return;
            const hsv = hexToHsv(hexInput.value);
            applyHsv(hsv.h, hsv.s, hsv.v, 'hex');
        });
        [rgbR, rgbG, rgbB].forEach((input) => {
            input.addEventListener('input', () => {
                const clamp = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
                const hex = `#${[clamp(rgbR.value), clamp(rgbG.value), clamp(rgbB.value)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
                const hsv = hexToHsv(hex);
                applyHsv(hsv.h, hsv.s, hsv.v, 'rgb');
            });
        });
        dialogEl.__setInitialHex = (hex) => {
            previewMain.style.backgroundColor = hex;
            previewCurrent.style.backgroundColor = hex;
            const hsv = hexToHsv(hex);
            applyHsv(hsv.h, hsv.s, hsv.v, null);
        };
    }

    // "Actual" no cambia mientras la ventana está abierta; "Nuevo" sí (cada clic lo
    // actualiza). Solo Aceptar llama a onAccept: Cancelar/Escape/fondo descartan la prueba.
    function open({ title, currentHex, onAccept } = {}) {
        ensureDialog();
        const hex = normalizeHex(currentHex) || '#000000';
        dialogState = { pickedHex: hex, onAccept };
        dialogEl.querySelector('#perm-tree-color-dialog-title').textContent = title || t('admin.colorDialogTitle');
        dialogEl.__setInitialHex(hex);
        dialogEl.querySelector('[data-tab="std"]').click();
        // Siempre al final del body: si hay otra ventana abierta debajo (cliente nuevo,
        // árbol), ésta queda encima.
        document.body.appendChild(dialogEl);
        dialogEl.hidden = false;
    }

    window.ColorDialog = { open };
})();
