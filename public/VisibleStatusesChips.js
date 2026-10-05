// ---------------------------------------------------------------------------
// The "¿Qué Estatus puede ver?" chip row -- one small, reused control for
// the per-user Estatus visibility gate (see visible_statuses' own migration
// comment in db.js): Habilitado/Inhabilitado/En construcción/En mejoras,
// same 4 colors PermissionTree.js's own Estatus badges already use. Shared
// verbatim by Business-Usuarios.js's own "Permisos Adicionales" modal and
// Admin-EquipoSaaS.js's own "Access for this SaaS account" modal --
// confirmed live, 2026-09-27: "Sí, ahí mismo en el modal" (same modal
// that's already open to edit a user's access, not a screen of its own).
// ---------------------------------------------------------------------------
(function () {
    const STATUSES = [
        { value: 'habilitado', labelKey: 'admin.masterTreeStatusHabilitado', cls: 'ok' },
        { value: 'inhabilitado', labelKey: 'admin.masterTreeStatusInhabilitado', cls: 'off' },
        { value: 'construccion', labelKey: 'admin.masterTreeStatusConstruccion', cls: 'build' },
        { value: 'mejoras', labelKey: 'admin.masterTreeStatusMejoras', cls: 'improve' },
    ];

    // Renders into `container` (cleared first) and calls onChange(statuses)
    // with the full current selection every time a chip is toggled --
    // never fewer than one status stays selected (an admin can still leave
    // a user seeing just 'habilitado', but never nothing at all, matching
    // setUserVisibleStatuses' own server-side fallback).
    // options.hint === false omite el párrafo explicativo (el diálogo que lo explica en Modo ayuda);
    // options.helpKey marca el bloque con esa entrada help.<key> de Modo ayuda.
    function render(container, current, onChange, options = {}) {
        const t = (window.Dashboard && window.Dashboard.t) || ((k) => k);
        const selected = new Set(current && current.length ? current : ['habilitado']);
        container.innerHTML = '';

        const field = document.createElement('div');
        field.className = 'visible-statuses-field';
        if (options.helpKey) {
            field.setAttribute('data-help-key', options.helpKey);
            field.setAttribute('role', 'group');
            field.setAttribute('aria-label', t('admin.visibleStatusesLabel'));
        }

        const label = document.createElement('p');
        label.className = 'visible-statuses-label';
        label.textContent = t('admin.visibleStatusesLabel');
        field.appendChild(label);

        if (options.hint !== false) {
            const hint = document.createElement('p');
            hint.className = 'admin-hint';
            hint.style.padding = '0 0 0.5rem';
            hint.textContent = t('admin.visibleStatusesHint');
            field.appendChild(hint);
        }

        const row = document.createElement('div');
        row.className = 'visible-statuses-row';
        STATUSES.forEach((status) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = `visible-status-chip visible-status-chip-${status.cls}`;
            chip.classList.toggle('active', selected.has(status.value));
            chip.setAttribute('aria-pressed', String(selected.has(status.value)));
            chip.innerHTML = `<span class="visible-status-dot" aria-hidden="true"></span><span></span>`;
            chip.querySelector('span:last-child').textContent = t(status.labelKey);
            chip.addEventListener('click', () => {
                if (selected.has(status.value)) {
                    if (selected.size === 1) return; // always at least one -- see this function's own comment
                    selected.delete(status.value);
                } else {
                    selected.add(status.value);
                }
                chip.classList.toggle('active', selected.has(status.value));
                chip.setAttribute('aria-pressed', String(selected.has(status.value)));
                onChange(Array.from(selected));
            });
            row.appendChild(chip);
        });
        field.appendChild(row);
        container.appendChild(field);
    }

    window.VisibleStatusesChips = { render, STATUSES };
})();
