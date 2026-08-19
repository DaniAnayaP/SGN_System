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
const errorBanner = document.getElementById('plan-form-error');
const submitBtn = document.getElementById('plan-form-submit');
const cancelBtn = document.getElementById('plan-form-cancel');

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

    submitBtn.disabled = true;
    try {
        const res = await fetch('/api/admin/plans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, description }),
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

// "Cancelar" — no inline create flow to reset here (this whole page IS the
// create flow), so it just goes back to Nuestros Planes, same destination
// as after a successful save would make sense to end up at.
cancelBtn.addEventListener('click', () => {
    window.location.href = 'Admin-Planes.html';
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-plan-nuevo' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
    } catch (err) {
        console.error('Admin (Plan Nuevo) failed to initialize:', err);
    }
})();
