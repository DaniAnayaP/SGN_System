// ---------------------------------------------------------------------------
// "Usuarios" — Administración del Negocio: create users and assign one or
// more profiles (perfiles) to each. Shell (sidebar, i18n, settings, logout)
// comes from Dashboard.js.
// ---------------------------------------------------------------------------

const form = document.getElementById('user-form');
const usernameField = document.getElementById('user-username');
const nameField = document.getElementById('user-name');
const emailField = document.getElementById('user-email');
const passwordField = document.getElementById('user-password');
const errorBanner = document.getElementById('user-form-error');
const submitBtn = document.getElementById('user-form-submit');
const tableBody = document.getElementById('users-table-body');
const emptyMsg = document.getElementById('users-empty');

const assignSelect = document.getElementById('assign-user-select');
const assignHint = document.getElementById('assign-hint');
const assignPanel = document.getElementById('assign-panel');
const assignList = document.getElementById('assign-profiles-list');
const assignSaveBtn = document.getElementById('assign-save');
const assignSaveStatus = document.getElementById('assign-save-status');

let users = [];
let profiles = [];

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
}
function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
}

async function renderUsersTable() {
    tableBody.innerHTML = '';
    emptyMsg.hidden = users.length > 0;
    for (const user of users) {
        const tr = document.createElement('tr');
        const tdUsername = document.createElement('td');
        tdUsername.textContent = user.username;
        const tdName = document.createElement('td');
        tdName.textContent = user.name;
        const tdEmail = document.createElement('td');
        tdEmail.textContent = user.email;
        const tdProfiles = document.createElement('td');
        tdProfiles.textContent = '…';
        const tdCreated = document.createElement('td');
        tdCreated.textContent = (user.created_at || '').slice(0, 10);
        tr.append(tdUsername, tdName, tdEmail, tdProfiles, tdCreated);
        tableBody.appendChild(tr);

        fetch(`/api/business/users/${user.id}/profiles`, { credentials: 'include' })
            .then((r) => (r.ok ? r.json() : { profiles: [] }))
            .then((data) => {
                const names = (data.profiles || []).map((p) => p.name);
                tdProfiles.textContent = names.length ? names.join(', ') : '—';
            })
            .catch(() => {
                tdProfiles.textContent = '—';
            });
    }
}

function populateAssignSelect() {
    const previousValue = assignSelect.value;
    assignSelect.querySelectorAll('option:not([value=""])').forEach((opt) => opt.remove());
    users.forEach((user) => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.name} (${user.username})`;
        assignSelect.appendChild(option);
    });
    if (users.some((u) => String(u.id) === previousValue)) {
        assignSelect.value = previousValue;
    }
}

async function loadUsers() {
    try {
        const res = await fetch('/api/business/users', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        users = data.users || [];
        await renderUsersTable();
        populateAssignSelect();
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

async function loadProfiles() {
    try {
        const res = await fetch('/api/business/profiles', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        profiles = data.profiles || [];
    } catch {
        profiles = [];
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    const username = usernameField.value.trim();
    const name = nameField.value.trim();
    const email = emailField.value.trim();
    const password = passwordField.value;
    if (!username || !name || !email || password.length < 8) {
        showError(Dashboard.t('admin.requiredFields'));
        return;
    }

    submitBtn.disabled = true;
    try {
        const res = await fetch('/api/business/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, name, email, password }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(body.message || Dashboard.t('admin.saveError'));
            return;
        }
        const { user } = await res.json();
        users = [user, ...users];
        await renderUsersTable();
        populateAssignSelect();
        form.reset();
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

function renderAssignList(assignedIds) {
    assignList.innerHTML = '';
    if (!profiles.length) {
        const p = document.createElement('p');
        p.className = 'admin-hint';
        p.textContent = Dashboard.t('business.noProfilesYet');
        assignList.appendChild(p);
        return;
    }
    profiles.forEach((profile) => {
        const row = document.createElement('div');
        row.className = 'admin-module-row';
        const name = document.createElement('span');
        name.className = 'admin-module-name';
        name.textContent = profile.name;
        const label = document.createElement('label');
        label.className = 'admin-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = assignedIds.includes(profile.id);
        input.dataset.profileId = profile.id;
        const track = document.createElement('span');
        track.className = 'admin-switch-track';
        label.append(input, track);
        row.append(name, label);
        assignList.appendChild(row);
    });
}

async function loadAssignmentsForUser(userId) {
    assignSaveStatus.textContent = '';
    try {
        const res = await fetch(`/api/business/users/${userId}/profiles`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        const assignedIds = (data.profiles || []).map((p) => p.id);
        renderAssignList(assignedIds);
        assignPanel.hidden = false;
        assignHint.hidden = true;
    } catch {
        assignPanel.hidden = true;
        assignHint.textContent = Dashboard.t('admin.loadError');
        assignHint.hidden = false;
    }
}

assignSelect.addEventListener('change', () => {
    const userId = assignSelect.value;
    if (!userId) {
        assignPanel.hidden = true;
        assignHint.textContent = Dashboard.t('business.noUserSelected');
        assignHint.hidden = false;
        return;
    }
    loadAssignmentsForUser(userId);
});

assignSaveBtn.addEventListener('click', async () => {
    const userId = assignSelect.value;
    if (!userId) return;
    const profileIds = Array.from(assignList.querySelectorAll('input[type="checkbox"]:checked'))
        .map((input) => Number(input.dataset.profileId));

    assignSaveBtn.disabled = true;
    try {
        const res = await fetch(`/api/business/users/${userId}/profiles`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ profileIds }),
        });
        if (!res.ok) throw new Error('save failed');
        assignSaveStatus.textContent = Dashboard.t('business.profilesSaved');
        renderUsersTable();
    } catch {
        assignSaveStatus.textContent = Dashboard.t('admin.saveError');
    } finally {
        assignSaveBtn.disabled = false;
    }
});

document.addEventListener('dashboard:language-changed', () => {
    renderUsersTable();
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'business-users' });
        if (!role) return;
        await Promise.all([loadUsers(), loadProfiles()]);
    } catch (err) {
        console.error('Business (Usuarios) failed to initialize:', err);
    }
})();
