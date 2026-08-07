// ---------------------------------------------------------------------------
// "Contrataciones" — SaaS admin: toggle which SGN modules are enabled for a
// given client. Shell (sidebar, i18n, settings, logout) comes from
// Dashboard.js.
//
// Access note: same as Admin-Clientes.js — the redirect below is UX only,
// real enforcement is requireAdmin on every /api/admin/* route server-side.
// ---------------------------------------------------------------------------

const clientSelect = document.getElementById('contrataciones-client');
const hint = document.getElementById('contrataciones-hint');
const modulesPanel = document.getElementById('modules-panel');
const modulesList = document.getElementById('modules-list');
const saveBtn = document.getElementById('modules-save');
const saveStatus = document.getElementById('modules-save-status');

let currentModules = [];

function renderModules(modules) {
    modulesList.innerHTML = '';
    modules.forEach((mod) => {
        const row = document.createElement('div');
        row.className = 'admin-module-row';

        const name = document.createElement('span');
        name.className = 'admin-module-name';
        name.textContent = Dashboard.t(mod.labelKey);

        const label = document.createElement('label');
        label.className = 'admin-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = mod.enabled;
        input.dataset.moduleKey = mod.key;
        const track = document.createElement('span');
        track.className = 'admin-switch-track';
        label.append(input, track);

        row.append(name, label);
        modulesList.appendChild(row);
    });
}

async function loadClientOptions() {
    try {
        const res = await fetch('/api/admin/clients', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        (data.clients || []).forEach((client) => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.company_name;
            clientSelect.appendChild(option);
        });
    } catch {
        hint.textContent = Dashboard.t('admin.loadError');
        hint.hidden = false;
    }
}

async function loadModulesForClient(clientId) {
    saveStatus.textContent = '';
    try {
        const res = await fetch(`/api/admin/clients/${clientId}/modules`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        currentModules = data.modules || [];
        renderModules(currentModules);
        modulesPanel.hidden = false;
        hint.hidden = true;
    } catch {
        modulesPanel.hidden = true;
        hint.textContent = Dashboard.t('admin.loadError');
        hint.hidden = false;
    }
}

clientSelect.addEventListener('change', () => {
    const clientId = clientSelect.value;
    if (!clientId) {
        modulesPanel.hidden = true;
        hint.textContent = Dashboard.t('admin.noClientSelected');
        hint.hidden = false;
        return;
    }
    loadModulesForClient(clientId);
});

saveBtn.addEventListener('click', async () => {
    const clientId = clientSelect.value;
    if (!clientId) return;
    const states = Array.from(modulesList.querySelectorAll('input[type="checkbox"]')).map((input) => ({
        key: input.dataset.moduleKey,
        enabled: input.checked,
    }));

    saveBtn.disabled = true;
    try {
        const res = await fetch(`/api/admin/clients/${clientId}/modules`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ modules: states }),
        });
        if (!res.ok) throw new Error('save failed');
        const data = await res.json();
        currentModules = data.modules || [];
        saveStatus.textContent = Dashboard.t('admin.modulesSaved');
    } catch {
        saveStatus.textContent = Dashboard.t('admin.saveError');
    } finally {
        saveBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', () => {
    if (currentModules.length) renderModules(currentModules);
    if (modulesPanel.hidden) hint.textContent = Dashboard.t('admin.noClientSelected');
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'contrataciones' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        await loadClientOptions();
    } catch (err) {
        console.error('Admin (Contrataciones) failed to initialize:', err);
    }
})();
