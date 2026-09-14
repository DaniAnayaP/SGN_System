// ---------------------------------------------------------------------------
// Icon picker for "Nuestros Sectores de Negocio" (Giro de Negocio) and its
// "Tipo de Giro" catalog. Backed by data/business-sector-icons.json — the
// full real Boxicons regular+solid set (1,479 icons, already the font this
// app loads everywhere) plus a hand-curated mapping of ~170 of them onto 14
// business categories, so picking a Tipo de Giro (e.g. "Restaurante") can
// jump the grid straight to the icons that actually fit it. Shared verbatim
// between public/ and mobile-app/www/ (see the "Web/App file parity" rule).
// ---------------------------------------------------------------------------

(function (global) {
    let dataPromise = null;
    function loadData() {
        if (!dataPromise) {
            dataPromise = fetch('data/business-sector-icons.json').then((res) => {
                if (!res.ok) throw new Error('failed to load business-sector-icons.json');
                return res.json();
            });
        }
        return dataPromise;
    }

    function categoryLabel(id, t) {
        return t(`admin.sectorIconCat.${id}`);
    }

    // "bxs-coffee-alt" -> "Coffee alt" -- a plain-language label under each
    // icon (see the "se ve amontonado" feedback: recognizing 1,479 icons by
    // shape alone doesn't scale, a name does).
    function iconLabel(name) {
        const words = name.replace(/^bxs?-/, '').replace(/-/g, ' ');
        return words.charAt(0).toUpperCase() + words.slice(1);
    }

    // Exposed so a "Tipo de Giro" form can offer the same 14 categories in
    // its own dropdown without waiting on a picker instance to exist yet.
    function getCategories(t) {
        return loadData().then((data) => data.categoryIds.map((id) => ({ id, label: categoryLabel(id, t) })));
    }

    function create(container, { selected = null, onSelect = null, category = null, t = (k) => k } = {}) {
        let data = null;
        let activeCategory = category;
        let query = '';
        let currentValue = selected;

        const shell = document.createElement('div');
        shell.className = 'sector-icon-picker';
        shell.innerHTML = `
            <div class="sector-icon-picker-search">
                <i class="bx bx-search" aria-hidden="true"></i>
                <input type="text" class="sector-icon-picker-search-input" placeholder="${t('admin.sectorIconSearchPlaceholder')}">
            </div>
            <div class="sector-icon-picker-chips"></div>
            <div class="sector-icon-picker-count"></div>
            <div class="sector-icon-picker-grid"></div>
        `;
        container.innerHTML = '';
        container.appendChild(shell);

        const searchInput = shell.querySelector('.sector-icon-picker-search-input');
        const chipsEl = shell.querySelector('.sector-icon-picker-chips');
        const countEl = shell.querySelector('.sector-icon-picker-count');
        const gridEl = shell.querySelector('.sector-icon-picker-grid');

        function renderChips() {
            chipsEl.innerHTML = '';
            const allChip = document.createElement('button');
            allChip.type = 'button';
            allChip.className = 'sector-icon-picker-chip' + (activeCategory ? '' : ' active');
            allChip.textContent = t('admin.sectorIconAllCategories');
            allChip.addEventListener('click', () => { activeCategory = null; render(); });
            chipsEl.appendChild(allChip);

            data.categoryIds.forEach((catId) => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'sector-icon-picker-chip' + (activeCategory === catId ? ' active' : '');
                chip.textContent = categoryLabel(catId, t);
                chip.addEventListener('click', () => {
                    activeCategory = activeCategory === catId ? null : catId;
                    render();
                });
                chipsEl.appendChild(chip);
            });
        }

        function visibleIcons() {
            const q = query.trim().toLowerCase();
            // A search always looks across the full library, not just the
            // active rubro -- someone typing "tooth" wants that icon even
            // while "Transporte" is still selected from a moment ago, not
            // an empty grid because dental isn't part of that rubro.
            if (q) return data.all.filter((name) => name.toLowerCase().includes(q));
            return activeCategory ? (data.curated[activeCategory] || []) : data.all;
        }

        function selectIcon(name) {
            currentValue = name;
            if (onSelect) onSelect(name);
            renderGrid();
        }

        function renderGrid() {
            const icons = visibleIcons();
            gridEl.innerHTML = '';
            if (!icons.length) {
                const empty = document.createElement('p');
                empty.className = 'sector-icon-picker-empty';
                empty.textContent = t('admin.sectorIconNoResults');
                gridEl.appendChild(empty);
            } else {
                icons.forEach((name) => {
                    const label = iconLabel(name);
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'icon-picker-option' + (name === currentValue ? ' active' : '');
                    btn.setAttribute('role', 'radio');
                    btn.setAttribute('aria-checked', String(name === currentValue));
                    btn.title = label;
                    btn.innerHTML = `<i class="bx ${name}" aria-hidden="true"></i><span>${label}</span>`;
                    btn.addEventListener('click', () => selectIcon(name));
                    gridEl.appendChild(btn);
                });
            }
            let scopeLabel;
            if (query.trim()) scopeLabel = `"${query.trim()}"`;
            else scopeLabel = activeCategory ? categoryLabel(activeCategory, t) : t('admin.sectorIconAllCategories');
            countEl.textContent = t('admin.sectorIconCount', { count: String(icons.length), total: String(data.all.length), scope: scopeLabel });
        }

        function render() {
            renderChips();
            renderGrid();
        }

        searchInput.addEventListener('input', () => {
            query = searchInput.value;
            renderGrid();
        });

        const ready = loadData().then((loaded) => {
            data = loaded;
            if (currentValue == null) currentValue = data.all[0];
            render();
        });

        return {
            ready,
            getValue: () => currentValue,
            setValue(name) {
                currentValue = name;
                if (data) renderGrid();
            },
            // Called when the Tipo de Giro select changes elsewhere in the
            // form — jumps the grid to that type's own category, same as
            // clicking its chip, without touching the current selection.
            setCategory(catId) {
                activeCategory = catId || null;
                query = '';
                searchInput.value = '';
                if (data) render();
            },
        };
    }

    global.BusinessSectorIcons = { create, getCategories };
})(window);
