// ---------------------------------------------------------------------------
// "Costos de Módulos" — GEIPSA-only catalog of what each button/module costs,
// separate from Planes y Paquetes (which only decides which módulos a plan
// includes, never what they cost). Used to compute "Pago por Anexos" per
// client in Nuestros Clientes (Admin-SaaS.js/getAnexosPaymentTotal). Shell
// (sidebar, i18n, settings, logout) comes from Dashboard.js.
//
// Access note: the sidebar only shows this page's link to admins, and the
// redirect below covers anyone who lands here directly without the role —
// but the actual enforcement is server-side (requireAdmin on every
// /api/admin/* route in server.js). This redirect is UX only.
// ---------------------------------------------------------------------------

const listEl = document.getElementById('module-costs-list');
const errorBanner = document.getElementById('module-costs-error');
const saveBtn = document.getElementById('module-costs-save');
const saveStatus = document.getElementById('module-costs-save-status');

let costs = [];

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
}

function renderCosts() {
    listEl.innerHTML = '';
    costs.forEach((mod) => {
        const row = document.createElement('div');
        row.className = 'admin-module-row';
        const name = document.createElement('span');
        name.className = 'admin-module-name';
        name.textContent = Dashboard.t(mod.labelKey);
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = '0.01';
        input.value = mod.cost || 0;
        input.dataset.moduleKey = mod.key;
        input.style.maxWidth = '8rem';
        row.append(name, input);
        listEl.appendChild(row);
    });
}

async function loadCosts() {
    try {
        const res = await fetch('/api/admin/module-costs', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        costs = data.costs || [];
        renderCosts();
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

saveBtn.addEventListener('click', async () => {
    saveStatus.textContent = '';
    errorBanner.hidden = true;
    const states = Array.from(listEl.querySelectorAll('input[type="number"]')).map((input) => ({
        key: input.dataset.moduleKey,
        cost: Math.max(0, Number(input.value) || 0),
    }));
    saveBtn.disabled = true;
    try {
        const res = await fetch('/api/admin/module-costs', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ costs: states }),
        });
        if (!res.ok) throw new Error('save failed');
        const data = await res.json();
        costs = data.costs || [];
        renderCosts();
        saveStatus.textContent = Dashboard.t('admin.moduleCostsSaved');
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        saveBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', () => {
    if (costs.length) renderCosts();
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-costos-modulos' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        await loadCosts();
    } catch (err) {
        console.error('Admin (Costos de Módulos) failed to initialize:', err);
    }
})();
