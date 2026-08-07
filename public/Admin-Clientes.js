// ---------------------------------------------------------------------------
// "Clientes Nuevos" — SaaS admin: create/edit/delete client companies.
// Shell (sidebar, i18n, settings, logout) comes from Dashboard.js.
//
// Access note: the sidebar only shows this page's link to admins, and the
// redirect below covers anyone who lands here directly without the role —
// but the actual enforcement is server-side (requireAdmin on every
// /api/admin/* route in server.js). This redirect is UX only.
// ---------------------------------------------------------------------------

const form = document.getElementById('client-form');
const idField = document.getElementById('client-id');
const companyField = document.getElementById('client-company');
const contactField = document.getElementById('client-contact');
const emailField = document.getElementById('client-email');
const phoneField = document.getElementById('client-phone');
const planField = document.getElementById('client-plan');
const statusField = document.getElementById('client-status');
const errorBanner = document.getElementById('client-form-error');
const submitBtn = document.getElementById('client-form-submit');
const cancelBtn = document.getElementById('client-form-cancel');
const tableBody = document.getElementById('clients-table-body');
const emptyMsg = document.getElementById('clients-empty');

let clients = [];

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
}
function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
}

function statusLabel(status) {
    const key = 'admin.status' + status.charAt(0).toUpperCase() + status.slice(1);
    return Dashboard.t(key);
}

function resetForm() {
    form.reset();
    idField.value = '';
    submitBtn.textContent = Dashboard.t('admin.addClient');
    cancelBtn.hidden = true;
    clearError();
}

function renderClients() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = clients.length > 0;
    clients.forEach((client) => {
        const tr = document.createElement('tr');

        const tdCompany = document.createElement('td');
        tdCompany.textContent = client.company_name;
        const tdContact = document.createElement('td');
        tdContact.textContent = client.contact_name;
        const tdEmail = document.createElement('td');
        tdEmail.textContent = client.email;
        const tdPlan = document.createElement('td');
        tdPlan.textContent = client.plan || '—';
        const tdStatus = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `admin-badge admin-badge-${client.status}`;
        statusBadge.textContent = statusLabel(client.status);
        tdStatus.appendChild(statusBadge);

        const tdActions = document.createElement('td');
        tdActions.className = 'admin-table-actions';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => startEdit(client));
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => removeClient(client));
        tdActions.append(editBtn, deleteBtn);

        tr.append(tdCompany, tdContact, tdEmail, tdPlan, tdStatus, tdActions);
        tableBody.appendChild(tr);
    });
}

function startEdit(client) {
    idField.value = client.id;
    companyField.value = client.company_name;
    contactField.value = client.contact_name;
    emailField.value = client.email;
    phoneField.value = client.phone || '';
    planField.value = client.plan || '';
    statusField.value = client.status;
    submitBtn.textContent = Dashboard.t('admin.save');
    cancelBtn.hidden = false;
    clearError();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function removeClient(client) {
    if (!confirm(Dashboard.t('admin.confirmDelete'))) return;
    try {
        const res = await fetch(`/api/admin/clients/${client.id}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        if (!res.ok) throw new Error('delete failed');
        clients = clients.filter((c) => c.id !== client.id);
        renderClients();
    } catch {
        alert(Dashboard.t('admin.saveError'));
    }
}

async function loadClients() {
    try {
        const res = await fetch('/api/admin/clients', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        clients = data.clients || [];
        renderClients();
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const companyName = companyField.value.trim();
    const contactName = contactField.value.trim();
    const email = emailField.value.trim();
    if (!companyName || !contactName || !email) {
        showError(Dashboard.t('admin.requiredFields'));
        return;
    }

    const payload = {
        companyName,
        contactName,
        email,
        phone: phoneField.value.trim(),
        plan: planField.value.trim(),
        status: statusField.value,
    };

    const editingId = idField.value;
    const url = editingId ? `/api/admin/clients/${editingId}` : '/api/admin/clients';
    const method = editingId ? 'PATCH' : 'POST';

    submitBtn.disabled = true;
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(body.message || Dashboard.t('admin.saveError'));
            return;
        }
        const { client } = await res.json();
        if (editingId) {
            clients = clients.map((c) => (c.id === client.id ? client : c));
        } else {
            clients = [client, ...clients];
        }
        renderClients();
        resetForm();
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

cancelBtn.addEventListener('click', resetForm);

document.addEventListener('dashboard:language-changed', () => {
    if (!idField.value) submitBtn.textContent = Dashboard.t('admin.addClient');
    renderClients();
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'clients' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        await loadClients();
    } catch (err) {
        console.error('Admin (Clientes) failed to initialize:', err);
    }
})();
