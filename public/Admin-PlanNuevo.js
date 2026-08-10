// ---------------------------------------------------------------------------
// "+ Agregar Plan Nuevo" — dedicated add-only form for registering a new
// plan/package type. Viewing/editing/deleting existing plans lives on
// Planes Registrados (Admin-Planes.js) instead — this page only ever POSTs.
// Shell (sidebar, i18n, settings, logout) comes from Dashboard.js.
//
// Access note: the sidebar only shows this page's link to admins, and the
// redirect below covers anyone who lands here directly without the role —
// but the actual enforcement is server-side (requireAdmin on every
// /api/admin/* route in server.js). This redirect is UX only.
// ---------------------------------------------------------------------------

const form = document.getElementById('plan-form');
const nameField = document.getElementById('plan-name');
const descriptionField = document.getElementById('plan-description');
const costCentersLimitField = document.getElementById('plan-cost-centers-limit');
const modulesList = document.getElementById('plan-modules-list');
const errorBanner = document.getElementById('plan-form-error');
const submitBtn = document.getElementById('plan-form-submit');

let moduleCatalog = []; // { key, labelKey } — same catalog Contrataciones/Planes Registrados use

function renderModuleToggles(checkedKeys) {
    modulesList.innerHTML = '';
    moduleCatalog.forEach((mod) => {
        const row = document.createElement('div');
        row.className = 'admin-module-row';

        const name = document.createElement('span');
        name.className = 'admin-module-name';
        name.textContent = Dashboard.t(mod.labelKey);

        const label = document.createElement('label');
        label.className = 'admin-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checkedKeys.includes(mod.key);
        input.dataset.moduleKey = mod.key;
        const track = document.createElement('span');
        track.className = 'admin-switch-track';
        label.append(input, track);

        row.append(name, label);
        modulesList.appendChild(row);
    });
}

function getCheckedModuleKeys() {
    return Array.from(modulesList.querySelectorAll('input[type="checkbox"]:checked')).map((i) => i.dataset.moduleKey);
}

async function loadModuleCatalog() {
    const res = await fetch('/api/admin/modules', { credentials: 'include' });
    if (!res.ok) throw new Error('load failed');
    const data = await res.json();
    moduleCatalog = data.modules || [];
    renderModuleToggles([]);
}

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
}
function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
}

function resetForm() {
    form.reset();
    costCentersLimitField.value = 0;
    renderModuleToggles([]);
    clearError();
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const name = nameField.value.trim();
    if (!name) {
        showError(Dashboard.t('admin.requiredFields'));
        return;
    }
    const description = descriptionField.value.trim();
    const modules = getCheckedModuleKeys();
    const costCentersLimit = Math.max(0, parseInt(costCentersLimitField.value, 10) || 0);

    submitBtn.disabled = true;
    try {
        const res = await fetch('/api/admin/plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, description, modules, costCentersLimit }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            if (body.message === 'A plan with that name already exists.') {
                showError(Dashboard.t('admin.planNameExists'));
            } else {
                showError(body.message || Dashboard.t('admin.saveError'));
            }
            return;
        }
        resetForm();
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', () => {
    renderModuleToggles(getCheckedModuleKeys());
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-plan-nuevo' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        await loadModuleCatalog();
    } catch (err) {
        console.error('Admin (Plan Nuevo) failed to initialize:', err);
    }
})();
