// ---------------------------------------------------------------------------
// Selector de activos para la vista 3D del Layout (editor y página pública del QR): una lista con buscador y casillas para elegir CUÁLES activos (anaqueles, anaqueles con tarimas, gabinetes y tarimas)
// se ven en el 3D. Se ordena por zona; la casilla de la zona marca o desmarca todos los suyos, y «Todos» y «Ninguno» actúan sobre lo que muestra la lista (con el buscador vacío, sobre todos). El buscador
// usa el mismo motor que todos los filtros del sistema (SearchSyntax.js: coma = otra búsqueda, $ antes, @ después). Se guarda lo que se OCULTÓ, así un activo nuevo aparece visible.
// Uso: const picker = LayoutAssetPicker.create(contenedor, { texts, typeLabel, hidden, onChange }); picker.setData({ spaces, zones }); picker.toggle(); picker.getHidden().
// Los colores salen de las variables de cada pantalla (la del editor y la de la página pública), con valores de respaldo.
// ---------------------------------------------------------------------------
(function (root) {
    'use strict';

    let styled = false;
    function injectStyle() {
        if (styled) return;
        styled = true;
        const el = document.createElement('style');
        el.textContent = `
.lap-host[hidden]{ display:none; }
.lap{ display:flex; flex-direction:column; max-height:100%; background:var(--color-surface, #fff); color:var(--color-text-primary, var(--brand-ink, #1f2430)); border:1px solid var(--color-border, var(--brand-line, #d5d8e2)); border-radius:10px; box-shadow:0 8px 22px rgba(20,22,31,.2); font-size:.78rem; line-height:1.35; overflow:hidden; }
.lap-head{ display:flex; flex-wrap:wrap; align-items:center; gap:.4rem; padding:.5rem .7rem; border-bottom:1px solid var(--color-border, var(--brand-line, #d5d8e2)); }
.lap-count{ flex:1 1 9rem; font-weight:700; font-size:.82rem; }
.lap-btn{ font:inherit; font-size:.72rem; padding:.2rem .65rem; border-radius:999px; border:1px solid var(--color-border, var(--brand-line, #d5d8e2)); background:transparent; color:inherit; cursor:pointer; }
.lap-btn:focus-visible, .lap-search input:focus-visible, .lap input[type=checkbox]:focus-visible{ outline:2px solid var(--brand, #6b3e98); outline-offset:2px; }
.lap-search{ padding:.4rem .7rem; border-bottom:1px solid var(--color-border, var(--brand-line, #d5d8e2)); }
.lap-search input{ width:100%; box-sizing:border-box; font:inherit; font-size:.78rem; padding:.3rem .6rem; border:1px solid var(--color-border, var(--brand-line, #d5d8e2)); border-radius:8px; background:var(--color-bg, #fff); color:inherit; }
.lap-list{ overflow:auto; padding:0 .4rem .5rem; min-height:3rem; }
.lap-zone{ position:sticky; top:0; z-index:1; display:flex; align-items:center; gap:.4rem; padding:.45rem .3rem .25rem; font-weight:700; font-size:.78rem; background:var(--color-surface, #fff); border-bottom:1px solid var(--color-border, var(--brand-line, #d5d8e2)); }
.lap-zone small{ margin-left:auto; padding:0 .45rem; border:1px solid var(--color-border, var(--brand-line, #d5d8e2)); border-radius:999px; font-weight:600; font-size:.68rem; opacity:.85; }
.lap-items{ display:grid; grid-template-columns:repeat(auto-fill, minmax(9.5rem, 1fr)); gap:.05rem .5rem; padding:.2rem .3rem .35rem 1.1rem; }
.lap-item{ display:flex; align-items:center; min-width:0; padding:.1rem 0; }
.lap-item label, .lap-zone label{ display:flex; align-items:center; gap:.4rem; cursor:pointer; flex:1; min-width:0; }
.lap input[type=checkbox]{ flex:none; width:.95rem; height:.95rem; margin:0; }
.lap-item b{ font-size:.78rem; }
.lap-item small{ font-size:.7rem; opacity:.7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.lap-empty{ padding:12px 6px; opacity:.7; }`;
        document.head.appendChild(el);
    }
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fill = (text, vars) => Object.keys(vars).reduce((acc, k) => acc.split(`{${k}}`).join(vars[k]), String(text || ''));

    function create(host, options) {
        injectStyle();
        const texts = options.texts || {};
        const typeLabel = options.typeLabel || ((t) => t);
        const hidden = new Set(options.hidden || []);
        let spaces = [];
        let zones = [];
        let query = '';
        host.classList.add('lap-host');
        host.hidden = true;
        host.innerHTML = `<div class="lap" role="dialog" aria-label="${esc(texts.title)}">
            <div class="lap-head"><span class="lap-count" data-lap-count aria-live="polite"></span>
                <button type="button" class="lap-btn" data-lap-all>${esc(texts.all)}</button>
                <button type="button" class="lap-btn" data-lap-none>${esc(texts.none)}</button>
                <button type="button" class="lap-btn" data-lap-close>${esc(texts.close)}</button></div>
            <div class="lap-search"><input type="search" data-lap-search placeholder="${esc(texts.search)}" aria-label="${esc(texts.search)}" autocomplete="off"></div>
            <div class="lap-list" data-lap-list></div></div>`;
        const countEl = host.querySelector('[data-lap-count]');
        const listEl = host.querySelector('[data-lap-list]');
        const searchEl = host.querySelector('[data-lap-search]');

        const zoneName = (id) => { const z = zones.find((x) => x.id === id); return z ? z.name : ''; };
        // los activos que pasan el buscador (código, nombre, tipo o zona)
        function shown() {
            const test = root.SearchSyntax ? root.SearchSyntax.compile('contains', query) : (() => true);
            return spaces.filter((s) => [s.code, s.name, typeLabel(s.type), zoneName(s.zoneId)].some((f) => !!f && test(String(f))));
        }
        function notify() { if (options.onChange) options.onChange(new Set(hidden)); }
        function render() {
            const list = shown();
            const visibleTotal = spaces.filter((s) => !hidden.has(s.id)).length;
            countEl.textContent = fill(texts.count, { n: visibleTotal, t: spaces.length });
            if (!list.length) { listEl.innerHTML = `<div class="lap-empty">${esc(texts.noResults)}</div>`; return; }
            const groups = [];
            const byZone = new Map();
            list.forEach((s) => { const key = s.zoneId && zones.some((z) => z.id === s.zoneId) ? s.zoneId : ''; if (!byZone.has(key)) byZone.set(key, []); byZone.get(key).push(s); });
            zones.forEach((z) => { if (byZone.has(z.id)) groups.push([z.id, z.name, byZone.get(z.id)]); });
            if (byZone.has('')) groups.push(['', texts.noZone, byZone.get('')]);
            listEl.innerHTML = groups.map(([zid, name, items]) => {
                const on = items.filter((s) => !hidden.has(s.id)).length;
                const rows = items.map((s) => `<div class="lap-item"><label><input type="checkbox" data-lap-id="${esc(s.id)}"${hidden.has(s.id) ? '' : ' checked'}><b>${esc(s.code)}</b><small>${esc(typeLabel(s.type))}${s.name ? ` · ${esc(s.name)}` : ''}</small></label></div>`).join('');
                return `<div class="lap-zone"><label><input type="checkbox" data-lap-zone="${esc(zid)}" data-lap-state="${on === items.length ? 'all' : on ? 'some' : 'none'}"${on === items.length ? ' checked' : ''}><span>${esc(name)}</span><small>${on} / ${items.length}</small></label></div><div class="lap-items">${rows}</div>`;
            }).join('');
            listEl.querySelectorAll('[data-lap-state="some"]').forEach((box) => { box.indeterminate = true; });
        }
        function setMany(items, visible) { items.forEach((s) => { if (visible) hidden.delete(s.id); else hidden.add(s.id); }); render(); notify(); }

        host.addEventListener('click', (event) => {
            if (event.target.closest('[data-lap-all]')) setMany(shown(), true);
            else if (event.target.closest('[data-lap-none]')) setMany(shown(), false);
            else if (event.target.closest('[data-lap-close]')) api.hide();
        });
        host.addEventListener('change', (event) => {
            const one = event.target.closest('[data-lap-id]');
            if (one) { setMany(spaces.filter((s) => s.id === one.getAttribute('data-lap-id')), one.checked); return; }
            const zoneBox = event.target.closest('[data-lap-zone]');
            if (zoneBox) {
                const zid = zoneBox.getAttribute('data-lap-zone');
                const inZone = shown().filter((s) => (zones.some((z) => z.id === s.zoneId) ? s.zoneId : '') === zid);
                setMany(inZone, zoneBox.checked);
            }
        });
        searchEl.addEventListener('input', () => { query = searchEl.value; render(); });
        host.addEventListener('keydown', (event) => { if (event.key === 'Escape') { api.hide(); if (options.onClose) options.onClose(); } });

        const api = {
            // spaces: [{ id, code, name?, type, zoneId }]; zones: [{ id, name }]. Lo oculto que ya no existe se olvida.
            setData(data) {
                spaces = (data.spaces || []).filter((s) => s && s.id);
                zones = data.zones || [];
                const ids = new Set(spaces.map((s) => s.id));
                [...hidden].forEach((id) => { if (!ids.has(id)) hidden.delete(id); });
                render();
            },
            show() { host.hidden = false; searchEl.focus(); if (options.onToggle) options.onToggle(true); },
            hide() { host.hidden = true; if (options.onToggle) options.onToggle(false); },
            toggle() { if (host.hidden) api.show(); else api.hide(); },
            isOpen() { return !host.hidden; },
            getHidden() { return new Set(hidden); },
            total() { return spaces.length; },
        };
        return api;
    }

    root.LayoutAssetPicker = { create };
})(typeof window !== 'undefined' ? window : globalThis);
