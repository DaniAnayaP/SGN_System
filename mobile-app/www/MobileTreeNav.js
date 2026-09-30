// ---------------------------------------------------------------------------
// MobileTreeNav -- a phone-first, drill-down navigator for the permission
// trees this app already renders (Árbol de Permisos Maestro, Árbol Maestro
// SaaS, Giro's own "Accesos Globales" réplica), confirmed live, 2026-09-27:
// "que sea así tipo banco, súper intuitivo... con la mínima cantidad de
// clics pero sí súper personalizado".
//
// Deliberately NOT a second copy of the tree's own business logic (rollups,
// effective classification resolution, Control Interno handling, order,
// cost cascade, grantMode's semáforo) -- that logic already lives in
// PermissionTree.js/Admin-ArbolMaestroSaaS.js, is heavily tuned, and stays
// exactly as-is. Instead, this reads and drives the SAME tree those files
// already render into a hidden container (see mount()'s `engineRoot` param):
// every row it shows comes from scraping that real, already-rendered DOM
// (row.dataset.nodeKey, set by statusRow/buildControls, is the one
// additive hook this needed), and every edit (Clasificación, Estatus,
// Web/App, aplicar a anidados, $ Web/$ App, Navegar, Cambios, Guardar) is
// applied by setting the REAL control's value and dispatching the SAME
// 'change'/'click' event a real tap on the desktop tree would fire --
// never a second write path. A node the hidden engine hasn't expanded yet
// (its children aren't in the DOM at all until its own toggle is clicked)
// gets expanded on demand, right before this reads its children.
//
// mount(hostEl, engineRoot, opts) -- hostEl is the visible phone-style
// container this draws into; engineRoot is the real tree's own root element
// (kept in the document, just visually off-screen -- see
// .mtn-hidden-engine in Admin.css); opts:
//   title            -- shown as the small "hello" line above the H1.
//   pinsKey           -- localStorage key for this tree's own pinned
//                        shortcuts (each tree gets its own, so pins never
//                        cross between Árbol Maestro/SaaS/Giro).
//   onSave            -- called when the sheet's own Guardar button is
//                        tapped (the real page already has its own Guardar
//                        button with its own confirm-diff flow; this just
//                        proxies to it, same as every other control here).
// Returns { refresh() } -- refresh() re-renders the CURRENT screen from
// whatever the hidden engine now shows (call after anything outside this
// module changes it, e.g. a language switch).
// ---------------------------------------------------------------------------
(function () {
    function mount(hostEl, engineRoot, opts) {
        opts = opts || {};
        const pinsKey = opts.pinsKey || 'mobileTreeNavPins';
        const t = (window.Dashboard && window.Dashboard.t) || window.t || ((k) => k);

        // --- reading the real, already-rendered tree ---------------------
        function allRows() { return [].slice.call(engineRoot.querySelectorAll('.perm-tree-row[data-node-key]')); }
        function rowByKey(key) { return allRows().find((r) => r.dataset.nodeKey === key) || null; }
        function depthOf(row) { const m = row.className.match(/perm-tree-depth-(\d+)/); return m ? +m[1] : -1; }
        function labelOf(row) { const l = row.querySelector('.perm-tree-mstatus-label'); return l ? l.textContent.trim() : ''; }
        function toggleBtnOf(row) { return row.querySelector('button.perm-tree-toggle'); }
        // A container row (anything with real children -- Departamento,
        // Área, Apartado, Pantalla with a submenu, Tabla, a classification
        // group heading) always gets a REAL toggle button; a true leaf
        // (nothing further under it, whether or not its own Clasificación
        // happens to be reassignable) gets the spacer instead -- see
        // statusRow's own toggle-vs-spacer branch. More reliable than
        // checking for the reassignment <select> itself, since some real
        // leaves (e.g. "Idioma" under Configuración) only ever show a
        // read-only classification badge, never a select.
        function isLeafRow(row) { return !row.querySelector('button.perm-tree-toggle'); }
        function countOf(row) { const b = row.querySelector('.perm-tree-mstatus-count-badge'); return b ? b.textContent.trim() : '1'; }
        // Structural (non-leaf) rows carry a `.perm-tree-mstatus-rollup`
        // pair -- web icon then app icon, in that fixed order (see
        // buildRollupIcon/rollupEl.append in PermissionTree.js) -- each
        // already carrying its own full/partial/empty class. A leaf row has
        // no rollup at all; its own state is just whether its real
        // Web/App checkbox is checked (grantMode's gate-icon leaves are a
        // separate, not-yet-built sheet variant -- see the module header).
        function rollupStateOf(row, platform) {
            const wrap = row.querySelector('.perm-tree-mstatus-rollup');
            if (wrap) {
                const el = wrap.children[platform === 'web' ? 0 : 1];
                if (!el) return 'empty';
                if (el.classList.contains('perm-tree-mstatus-rollup-full')) return 'full';
                if (el.classList.contains('perm-tree-mstatus-rollup-partial')) return 'partial';
                return 'empty';
            }
            const cb = row.querySelector(`.perm-tree-mstatus-badge-${platform} input[type=checkbox]`);
            return cb && cb.checked ? 'full' : 'empty';
        }
        function childrenOf(row) {
            const key = row.dataset.nodeKey;
            const d = depthOf(row);
            const all = allRows();
            const idx = all.indexOf(row);
            const out = [];
            for (let i = idx + 1; i < all.length; i++) {
                const dd = depthOf(all[i]);
                if (dd <= d) break;
                if (dd === d + 1) out.push(all[i]);
            }
            // A handful of rows (e.g. "Iconos de Navegación"'s own buttons,
            // rendered after Inicio/Panel/Tablero rather than right after
            // their own header -- see PermissionTree.js's own comment on
            // the matching data-parent-key stamp) aren't DOM-contiguous
            // with their real parent, so the depth-based scan above can't
            // find them; pick up anything explicitly marked for this node
            // that the scan missed.
            if (key) {
                all.forEach((r) => {
                    if (r.dataset.parentKey === key && !out.includes(r)) out.push(r);
                });
            }
            return out;
        }
        // Expands the row in the HIDDEN engine (a real toggle click, same
        // as a desktop user would do) if it isn't already, so its children
        // actually exist in the DOM to read. Synchronous -- every engine's
        // own toggle handler rebuilds its tree in the same tick.
        function ensureExpanded(row) {
            const btn = toggleBtnOf(row);
            if (btn && btn.getAttribute('aria-expanded') !== 'true') btn.click();
        }
        function fireChange(el) { el.dispatchEvent(new Event('change', { bubbles: true })); }
        // A row this level's engine marked draggable (Árbol Maestro/Giro's
        // own Reorden Personalizado, see statusRow's own dragCtx comment in
        // PermissionTree.js/Admin-ArbolMaestroSaaS.js) -- checked per row,
        // not just once for the whole list, since a mixed level (e.g.
        // Inicio/Panel/Tablero ahead of the real, draggable áreas) can have
        // some non-draggable rows leading a mostly-draggable group.
        function isDraggableRow(row) { return row.classList.contains('perm-tree-row-draggable'); }
        // Replays the exact dragstart -> drop sequence a real desktop drag
        // would fire (see PermissionTree.js/Admin-ArbolMaestroSaaS.js's own
        // statusRow: draggedNode is a closure variable set from dragstart,
        // dataTransfer itself is never actually read back out, only used
        // for the browser's own effectAllowed/dropEffect bookkeeping) --
        // "drive the real control" for a gesture native HTML5 D&D has no
        // real touch support for in this WebView (same reasoning
        // AppAdminInicio.js's own enableTileReorder already documents for
        // the home-screen tile grid). fromRow ends up positioned wherever
        // toRow currently sits (reorderInPlace's own "insert before target"
        // rule) -- a real drop is enough, dragover is fired too only so any
        // visual class toggling the same listener does stays consistent.
        function fireDropReorder(fromRow, toRow) {
            let dt;
            try { dt = new DataTransfer(); } catch { dt = null; }
            const opts = dt ? { bubbles: true, cancelable: true, dataTransfer: dt } : { bubbles: true, cancelable: true };
            fromRow.dispatchEvent(new DragEvent('dragstart', opts));
            toRow.dispatchEvent(new DragEvent('dragover', opts));
            toRow.dispatchEvent(new DragEvent('drop', opts));
            fromRow.dispatchEvent(new DragEvent('dragend', opts));
        }

        // --- pins (per-device shortcuts, see the module comment) ---------
        function loadPins() {
            try { return JSON.parse(localStorage.getItem(pinsKey) || '[]'); } catch { return []; }
        }
        function savePins(list) {
            try { localStorage.setItem(pinsKey, JSON.stringify(list.slice(0, 8))); } catch { /* storage blocked -- pins just won't persist */ }
        }
        function isPinned(key) { return loadPins().some((p) => p.key === key); }
        function togglePin(key, label, path) {
            const list = loadPins();
            const idx = list.findIndex((p) => p.key === key);
            if (idx !== -1) list.splice(idx, 1);
            else list.unshift({ key, label, path });
            savePins(list);
        }

        // --- navigation state ---------------------------------------------
        // stack: [{key,label}], root screen when empty. currentKey === null
        // means "show the root/depth-0 rows".
        let stack = [];
        let currentKey = null;
        // Reorder mode -- see buildList's own toolbar and enableCardReorder
        // below. Reset on every navigation (goRoot/goInto/goToCrumb) since a
        // different level is a different sibling group entirely -- carrying
        // "reordering" across that would apply to the wrong rows.
        let reorderMode = false;

        function goRoot() { stack = []; currentKey = null; reorderMode = false; render(); }
        function goInto(row) {
            const key = row.dataset.nodeKey;
            ensureExpanded(row);
            stack.push({ key, label: labelOf(row) });
            currentKey = key;
            reorderMode = false;
            render();
        }
        function goToCrumb(index) {
            // index -1 = root
            stack = stack.slice(0, index + 1);
            currentKey = stack.length ? stack[stack.length - 1].key : null;
            reorderMode = false;
            render();
        }
        // Replays a saved pin's own path (an array of {key,label} exactly
        // like `stack`) by expanding each ancestor in order in the hidden
        // engine, landing on the SAME node (leaf or container) it was
        // pinned from -- no search index needed, this is just "do the same
        // clicks again".
        function openPath(path) {
            stack = [];
            for (const step of path) {
                const row = rowByKey(step.key);
                if (!row) break; // stale pin (menu.json changed) -- stop wherever we still can
                ensureExpanded(row);
                stack.push({ key: step.key, label: labelOf(row) });
            }
            currentKey = stack.length ? stack[stack.length - 1].key : null;
            render();
        }

        // --- building the visible screen -----------------------------------
        const root = document.createElement('div');
        root.className = 'mtn-root';
        hostEl.innerHTML = '';
        hostEl.appendChild(root);

        function iconChevron() {
            return '<svg class="mtn-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
        }
        function iconBack() {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';
        }
        function iconStar(filled) {
            return `<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/></svg>`;
        }

        function buildCrumbBar() {
            const bar = document.createElement('div');
            bar.className = 'mtn-crumbbar';
            const home = document.createElement('button');
            home.type = 'button';
            home.className = 'mtn-crumb' + (stack.length === 0 ? ' mtn-crumb-now' : '');
            home.textContent = opts.rootLabel || 'Inicio';
            home.addEventListener('click', goRoot);
            bar.appendChild(home);
            stack.forEach((step, i) => {
                const sep = document.createElement('span');
                sep.className = 'mtn-crumb-sep';
                sep.textContent = '›';
                bar.appendChild(sep);
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'mtn-crumb' + (i === stack.length - 1 ? ' mtn-crumb-now' : '');
                b.textContent = step.label;
                b.addEventListener('click', () => goToCrumb(i));
                bar.appendChild(b);
            });
            return bar;
        }

        function buildPinsBar() {
            const pins = loadPins();
            if (!pins.length) return null;
            const bar = document.createElement('div');
            bar.className = 'mtn-pinbar';
            pins.forEach((p) => {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'mtn-pin';
                card.innerHTML = `<span class="mtn-pin-star">${iconStar(true)}</span><span>${p.label}</span>`;
                card.addEventListener('click', () => openPath(p.path));
                bar.appendChild(card);
            });
            return bar;
        }

        function buildList(node) {
            const wrap = document.createElement('div');
            wrap.className = 'mtn-pane';
            const top = document.createElement('div');
            top.className = 'mtn-top';
            if (!node) {
                const hello = document.createElement('p');
                hello.className = 'mtn-hello';
                hello.textContent = opts.title || '';
                top.appendChild(hello);
                const h2 = document.createElement('h2');
                h2.className = 'mtn-title';
                h2.textContent = opts.rootLabel || '';
                top.appendChild(h2);
                wrap.appendChild(top);
                const pinsBar = buildPinsBar();
                if (pinsBar) wrap.appendChild(pinsBar);
            } else {
                const back = document.createElement('div');
                back.className = 'mtn-back';
                const backBtn = document.createElement('button');
                backBtn.type = 'button';
                backBtn.innerHTML = `${iconBack()}<span>${labelOf(node)}</span>`;
                backBtn.addEventListener('click', () => goToCrumb(stack.length - 2));
                back.appendChild(backBtn);
                wrap.appendChild(back);
                const stat = document.createElement('div');
                stat.className = 'mtn-stat';
                const b = document.createElement('b');
                b.textContent = `${countOf(node)} ${t('admin.masterTreeColCount') || ''}`.trim();
                stat.appendChild(b);
                wrap.appendChild(stat);
            }
            const kids = node ? childrenOf(node) : allRows().filter((r) => depthOf(r) === 0);
            // Reorder toggle -- only when this level's engine actually wired
            // drag-to-reorder onto at least one of these rows (Árbol
            // Maestro's own Departamento/Área/Apartado depths, Giro's
            // Reorden Personalizado at every depth) -- a level with none
            // gets no toolbar at all, same as today.
            const anyReorderable = kids.some(isDraggableRow);
            if (anyReorderable) {
                const toolbar = document.createElement('div');
                toolbar.className = 'mtn-reorder-toolbar';
                const toggleBtn = document.createElement('button');
                toggleBtn.type = 'button';
                toggleBtn.className = 'mtn-reorder-toggle' + (reorderMode ? ' mtn-reorder-toggle-on' : '');
                toggleBtn.textContent = reorderMode
                    ? (t('admin.masterTreeNavReorderDone') || 'Listo')
                    : (t('admin.masterTreeNavReorderStart') || 'Reordenar');
                toggleBtn.addEventListener('click', () => { reorderMode = !reorderMode; render(); });
                toolbar.appendChild(toggleBtn);
                wrap.appendChild(toolbar);
                if (reorderMode) {
                    const hint = document.createElement('p');
                    hint.className = 'mtn-reorder-hint';
                    hint.textContent = t('admin.masterTreeNavReorderHint') || '';
                    wrap.appendChild(hint);
                }
            } else if (reorderMode) {
                reorderMode = false; // stale state from a different level -- see goInto/goToCrumb/goRoot's own reset
            }
            const list = document.createElement('div');
            list.className = 'mtn-list';
            if (!kids.length) {
                const empty = document.createElement('p');
                empty.className = 'mtn-empty';
                empty.textContent = t('admin.masterTreeNavEmpty');
                list.appendChild(empty);
            }
            kids.forEach((row) => {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'mtn-card';
                const web = rollupStateOf(row, 'web');
                const app = rollupStateOf(row, 'app');
                card.innerHTML = `
                    <span class="mtn-ico mtn-ico-navy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16"/></svg></span>
                    <span class="mtn-body"><span class="mtn-name"></span><span class="mtn-meta"></span></span>
                    <span class="mtn-dots"><span class="mtn-dot mtn-dot-${web}" title="Web"></span><span class="mtn-dot mtn-dot-${app}" title="App"></span></span>
                    ${iconChevron()}
                `;
                card.querySelector('.mtn-name').textContent = labelOf(row);
                card.querySelector('.mtn-meta').textContent = `${countOf(row)} ${t('admin.masterTreeNavItems')}`.trim();
                // No accidental navigation while reordering -- same rule
                // AppAdminInicio.js's own enableTileReorder already follows
                // for the home-screen tile grid. A real `disabled` button
                // stops dispatching pointer events to its OWN children too
                // (the drag handle prepended below would never see its own
                // pointerdown), so this is a plain reorderMode check inside
                // the handler instead of the disabled attribute.
                card.addEventListener('click', () => { if (!reorderMode) goInto(row); });
                if (reorderMode) {
                    if (isDraggableRow(row)) {
                        card.classList.add('mtn-card-reorderable');
                        card.dataset.nodeKey = row.dataset.nodeKey;
                        const handle = document.createElement('span');
                        handle.className = 'mtn-drag-handle';
                        handle.setAttribute('aria-hidden', 'true');
                        handle.innerHTML = '<i class="bx bx-dots-vertical-rounded"></i><i class="bx bx-dots-vertical-rounded"></i>';
                        card.prepend(handle);
                    } else {
                        card.classList.add('mtn-card-locked');
                    }
                }
                list.appendChild(card);
            });
            wrap.appendChild(list);
            if (reorderMode) enableCardReorder(list);
            return wrap;
        }
        // Pointer-events drag (not HTML5 dragstart/dragover -- no real touch
        // support for it in this WebView, same finding AppAdminInicio.js's
        // own enableTileReorder already documents) over the CURRENT list's
        // own reorderable cards. Reorders the DOM live as the dragged card
        // crosses a neighbor's midpoint, then on release replays the real
        // engine's own drag-drop sequence once (fireDropReorder) between the
        // moved row and whichever real row ended up its new neighbor --
        // that single real "drop" is what actually mutates sectionsData and
        // re-renders the hidden engine; this module's own render() (called
        // right after) just re-scrapes the result, same as any other edit.
        function enableCardReorder(list) {
            let dragEl = null;
            let startY = 0;
            function onPointerMove(e) {
                if (!dragEl) return;
                e.preventDefault();
                dragEl.style.transform = `translateY(${e.clientY - startY}px)`;
                const under = document.elementFromPoint(dragEl.getBoundingClientRect().left + 20, e.clientY)?.closest('.mtn-card-reorderable');
                if (under && under !== dragEl && under.parentElement === list) {
                    const rect = under.getBoundingClientRect();
                    const before = e.clientY < rect.top + rect.height / 2;
                    list.insertBefore(dragEl, before ? under : under.nextSibling);
                }
            }
            function onPointerUp() {
                if (!dragEl) return;
                const movedCard = dragEl;
                movedCard.classList.remove('mtn-card-dragging');
                movedCard.style.transform = '';
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', onPointerUp);
                dragEl = null;
                // Whichever real card now sits right after the moved one is
                // the real engine's own "insert before this" target
                // (reorderInPlace's exact semantic); if the moved card ended
                // up last, there's no such neighbor and nothing changed.
                const neighbor = movedCard.nextElementSibling;
                if (neighbor && neighbor.classList.contains('mtn-card-reorderable') && neighbor.dataset.nodeKey !== movedCard.dataset.nodeKey) {
                    const fromRow = rowByKey(movedCard.dataset.nodeKey);
                    const toRow = rowByKey(neighbor.dataset.nodeKey);
                    if (fromRow && toRow) fireDropReorder(fromRow, toRow);
                }
                render();
            }
            [].slice.call(list.querySelectorAll('.mtn-card-reorderable')).forEach((card) => {
                const handle = card.querySelector('.mtn-drag-handle');
                if (!handle) return;
                handle.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    dragEl = card;
                    startY = e.clientY;
                    card.classList.add('mtn-card-dragging');
                    document.addEventListener('pointermove', onPointerMove);
                    document.addEventListener('pointerup', onPointerUp);
                });
            });
        }

        // --- the detail sheet, for a leaf (columna/acción) row --------------
        function buildChipsFromSelect(select, onPick) {
            const wrap = document.createElement('div');
            wrap.className = 'mtn-chips';
            [...select.options].forEach((opt) => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'mtn-chip' + (opt.value === select.value ? ' mtn-chip-sel' : '');
                chip.textContent = opt.textContent;
                chip.disabled = select.disabled;
                chip.addEventListener('click', () => {
                    select.value = opt.value;
                    fireChange(select);
                    onPick();
                });
                wrap.appendChild(chip);
            });
            return wrap;
        }
        // Giro's own réplica (grantMode:'giro') swaps the real Web/App
        // checkbox for a read-only-gated semáforo button
        // (.perm-tree-gate-icon-<state>, built by buildGateIcon) -- a plain
        // grant/revoke toggle with 3 extra non-boolean states (blocked by
        // Árbol Maestro, needs Web first, partially granted below), so it
        // gets its own chip instead of the boolean mtn-toggle switch. A tap
        // just relays to the real button's own click handler, which already
        // knows how to cascade the grant, show a toast on blocked/needsWeb,
        // and re-render -- same "drive the real control" rule as everywhere
        // else here.
        const GATE_STATE_LABEL_KEYS = {
            granted: 'admin.giroGateLegendGranted',
            partial: 'admin.giroGateLegendPartial',
            available: 'admin.giroGateLegendAvailable',
            needsWeb: 'admin.giroGateLegendNeedsWeb',
            blocked: 'admin.giroGateLegendBlocked',
        };
        function buildGateRow(labelText, gateBtn) {
            const row = document.createElement('div');
            row.className = 'mtn-row2';
            const lbl = document.createElement('p');
            lbl.className = 'mtn-lbl';
            lbl.textContent = labelText;
            row.appendChild(lbl);
            const stateMatch = gateBtn.className.match(/perm-tree-gate-icon-(\S+)/);
            const state = stateMatch ? stateMatch[1] : 'available';
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = `mtn-gate-chip mtn-gate-chip-${state}`;
            chip.textContent = t(GATE_STATE_LABEL_KEYS[state] || GATE_STATE_LABEL_KEYS.available);
            chip.disabled = gateBtn.disabled;
            chip.addEventListener('click', () => { gateBtn.click(); render(); });
            row.appendChild(chip);
            return row;
        }
        function buildToggleRow(labelText, hintText, checkbox, onFlip) {
            const row = document.createElement('div');
            row.className = 'mtn-row2';
            const left = document.createElement('div');
            const lbl = document.createElement('p');
            lbl.className = 'mtn-lbl';
            lbl.textContent = labelText;
            left.appendChild(lbl);
            if (hintText) {
                const hint = document.createElement('p');
                hint.className = 'mtn-hint';
                hint.textContent = hintText;
                left.appendChild(hint);
            }
            row.appendChild(left);
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'mtn-toggle' + (checkbox.checked ? ' mtn-toggle-on' : '');
            toggle.innerHTML = '<i></i>';
            toggle.disabled = checkbox.disabled;
            toggle.addEventListener('click', () => {
                checkbox.checked = !checkbox.checked;
                fireChange(checkbox);
                onFlip();
            });
            row.appendChild(toggle);
            return row;
        }

        function buildSheet(row) {
            const key = row.dataset.nodeKey;
            const wrap = document.createElement('div');
            wrap.className = 'mtn-pane';
            wrap.appendChild(buildBackRow(row));

            const sheet = document.createElement('div');
            sheet.className = 'mtn-sheet';
            const head = document.createElement('div');
            head.className = 'mtn-sheet-head';
            const eyebrow = document.createElement('span');
            eyebrow.className = 'mtn-sheet-eyebrow';
            eyebrow.textContent = t('admin.masterTreeNavColumnEyebrow');
            head.appendChild(eyebrow);
            const title = document.createElement('p');
            title.className = 'mtn-sheet-title';
            title.textContent = labelOf(row);
            head.appendChild(title);
            const pinBtn = document.createElement('button');
            pinBtn.type = 'button';
            pinBtn.className = 'mtn-pin-toggle' + (isPinned(key) ? ' mtn-pin-toggle-on' : '');
            pinBtn.innerHTML = iconStar(isPinned(key));
            pinBtn.title = t('main.bookmarks') || 'Fijar';
            pinBtn.addEventListener('click', () => { togglePin(key, labelOf(row), stack); render(); });
            head.appendChild(pinBtn);
            sheet.appendChild(head);

            // Clasificación
            const classCell = row.querySelector('.perm-tree-mstatus-class-cell');
            const classSelect = classCell && classCell.querySelector('select.perm-tree-mstatus-class-select');
            const classBadge = classCell && classCell.querySelector('.perm-tree-mstatus-class-badge');
            const secClass = document.createElement('div');
            secClass.className = 'mtn-sec';
            const secClassLbl = document.createElement('p');
            secClassLbl.className = 'mtn-sec-label';
            secClassLbl.textContent = t('admin.masterTreeColClassification') || 'Clasificación';
            secClass.appendChild(secClassLbl);
            if (classSelect) {
                secClass.appendChild(buildChipsFromSelect(classSelect, () => render()));
            } else if (classBadge) {
                const pill = document.createElement('span');
                pill.className = 'mtn-classpill';
                pill.style.color = classBadge.style.color;
                pill.style.background = classBadge.style.backgroundColor;
                pill.textContent = classBadge.textContent;
                secClass.appendChild(pill);
            }
            sheet.appendChild(secClass);

            // Estatus
            const statusSelect = row.querySelector('select.perm-tree-mstatus-select');
            if (statusSelect) {
                const secStatus = document.createElement('div');
                secStatus.className = 'mtn-sec';
                const lbl = document.createElement('p');
                lbl.className = 'mtn-sec-label';
                lbl.textContent = t('admin.masterTreeColStatus') || 'Estatus';
                secStatus.appendChild(lbl);
                secStatus.appendChild(buildChipsFromSelect(statusSelect, () => render()));
                sheet.appendChild(secStatus);
            }

            // Web / App / aplicar a anidados / $ Web / $ App
            const secPlat = document.createElement('div');
            secPlat.className = 'mtn-sec';
            const platLbl = document.createElement('p');
            platLbl.className = 'mtn-sec-label';
            platLbl.textContent = t('admin.masterTreeColPlatforms') || 'Plataformas';
            secPlat.appendChild(platLbl);
            const webCheckbox = row.querySelector('.perm-tree-mstatus-badge-web input[type=checkbox]');
            const appCheckbox = row.querySelector('.perm-tree-mstatus-badge-app input[type=checkbox]');
            const gateIcons = [...row.querySelectorAll('.perm-tree-mstatus-platforms-cell .perm-tree-gate-icon')];
            if (webCheckbox) secPlat.appendChild(buildToggleRow(t('admin.masterTreePlatformWeb'), null, webCheckbox, () => render()));
            else if (gateIcons[0]) secPlat.appendChild(buildGateRow(t('admin.masterTreePlatformWeb'), gateIcons[0]));
            if (appCheckbox) secPlat.appendChild(buildToggleRow(t('admin.masterTreePlatformApp'), null, appCheckbox, () => render()));
            else if (gateIcons[1]) secPlat.appendChild(buildGateRow(t('admin.masterTreePlatformApp'), gateIcons[1]));
            const nestBtn = row.querySelector('.perm-tree-mstatus-status-nest-cell button.perm-tree-mstatus-nest-btn');
            if (nestBtn && !nestBtn.disabled) {
                const applyRow = document.createElement('div');
                applyRow.className = 'mtn-row2';
                const lbl = document.createElement('p');
                lbl.className = 'mtn-lbl';
                lbl.textContent = t('admin.masterTreeApplyNestedStatus') || 'Aplicar a los niveles de esta columna';
                applyRow.appendChild(lbl);
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'mtn-mini-btn';
                btn.textContent = t('admin.masterTreeNavApply');
                btn.addEventListener('click', () => { nestBtn.click(); render(); });
                applyRow.appendChild(btn);
                secPlat.appendChild(applyRow);
            }
            sheet.appendChild(secPlat);

            const costCell = [...row.querySelectorAll('.perm-tree-mstatus-cost-cell input.perm-tree-cost-input')];
            if (costCell.length === 2) {
                const secCost = document.createElement('div');
                secCost.className = 'mtn-sec';
                const lbl = document.createElement('p');
                lbl.className = 'mtn-sec-label';
                lbl.textContent = '$ Web / $ App';
                secCost.appendChild(lbl);
                const costRow = document.createElement('div');
                costRow.className = 'mtn-costrow';
                costCell.forEach((input) => {
                    const field = document.createElement('label');
                    field.className = 'mtn-cost-field';
                    const proxy = document.createElement('input');
                    proxy.type = 'number';
                    proxy.min = '0';
                    proxy.step = '0.01';
                    proxy.value = input.value;
                    proxy.disabled = input.disabled;
                    proxy.addEventListener('change', () => { input.value = proxy.value; fireChange(input); proxy.value = input.value; });
                    field.appendChild(proxy);
                    costRow.appendChild(field);
                });
                secCost.appendChild(costRow);
                sheet.appendChild(secCost);
            }

            const actions = document.createElement('div');
            actions.className = 'mtn-actionsrow';
            const navBtn = row.querySelector('.perm-tree-mstatus-navigate-cell button');
            const histBtn = row.querySelector('.perm-tree-mstatus-history-cell button');
            if (histBtn) {
                const a = document.createElement('button');
                a.type = 'button';
                a.className = 'mtn-abtn';
                a.textContent = t('admin.masterTreeColHistory');
                a.addEventListener('click', () => histBtn.click());
                actions.appendChild(a);
            }
            if (navBtn) {
                const a = document.createElement('button');
                a.type = 'button';
                a.className = 'mtn-abtn';
                a.textContent = t('admin.masterTreeColNavigate');
                a.addEventListener('click', () => navBtn.click());
                actions.appendChild(a);
            }
            if (opts.onSave) {
                const a = document.createElement('button');
                a.type = 'button';
                a.className = 'mtn-abtn mtn-abtn-primary';
                a.textContent = t('admin.save') || 'Guardar';
                a.addEventListener('click', opts.onSave);
                actions.appendChild(a);
            }
            sheet.appendChild(actions);
            wrap.appendChild(sheet);
            return wrap;
        }
        function buildBackRow(node) {
            const wrap = document.createElement('div');
            wrap.className = 'mtn-back';
            const backBtn = document.createElement('button');
            backBtn.type = 'button';
            backBtn.innerHTML = `${iconBack()}<span>${stack.length > 1 ? stack[stack.length - 2].label : (opts.rootLabel || '')}</span>`;
            backBtn.addEventListener('click', () => goToCrumb(stack.length - 2));
            wrap.appendChild(backBtn);
            return wrap;
        }

        function render() {
            root.innerHTML = '';
            root.appendChild(buildCrumbBar());
            const node = currentKey ? rowByKey(currentKey) : null;
            if (node && isLeafRow(node)) root.appendChild(buildSheet(node));
            else root.appendChild(buildList(node));
        }

        render();
        return { refresh: render };
    }

    window.MobileTreeNav = { mount };
})();
