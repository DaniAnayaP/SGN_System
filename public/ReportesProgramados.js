// ---------------------------------------------------------------------------
// Reportes Programados — define/edit/delete a recurring "send this saved
// report to these recipients" schedule. No mailer/WhatsApp/internal-chat
// integration exists yet (see the disabled Chat Interno option below) --
// this only records the definition for whenever that sending job gets built,
// same "define, don't execute" scope Transacciones Inteligentes de Negocio
// itself started with.
// ---------------------------------------------------------------------------

let scheduledReports = [];
let availableReports = [];
let editingScheduledId = null;
let selectedDeliveryMethod = null;

const modal = document.getElementById('scheduled-modal');
const nameInput = document.getElementById('scheduled-name-input');
const reportSelect = document.getElementById('scheduled-report-select');
const endDateInput = document.getElementById('scheduled-end-date-input');
const recipientsInput = document.getElementById('scheduled-recipients-input');
const deliveryOptionsEl = document.getElementById('scheduled-delivery-options');
const modalError = document.getElementById('scheduled-modal-error');

function formatDate(isoLike) {
    if (!isoLike) return '—';
    const [datePart] = isoLike.split(' ');
    const [year, month, day] = (datePart || '').split('-');
    if (!year || !month || !day) return isoLike;
    return `${day}/${month}/${year}`;
}

function deliveryMethodLabel(method) {
    if (method === 'email') return Dashboard.t('main.scheduledDeliveryEmail');
    if (method === 'whatsapp') return Dashboard.t('main.scheduledDeliveryWhatsapp');
    if (method === 'internal_chat') return Dashboard.t('main.scheduledDeliveryChat');
    return method;
}

function setSelectedDelivery(method) {
    selectedDeliveryMethod = method;
    deliveryOptionsEl.querySelectorAll('.scheduled-delivery-option').forEach((btn) => {
        btn.classList.toggle('scheduled-delivery-option-active', btn.dataset.delivery === method);
    });
}

deliveryOptionsEl.querySelectorAll('.scheduled-delivery-option:not(:disabled)').forEach((btn) => {
    btn.addEventListener('click', () => setSelectedDelivery(btn.dataset.delivery));
});

function populateReportSelect() {
    reportSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = Dashboard.t('main.scheduledPickReportPlaceholder');
    reportSelect.appendChild(placeholder);
    availableReports.forEach((report) => {
        const option = document.createElement('option');
        option.value = String(report.id);
        option.textContent = report.name;
        reportSelect.appendChild(option);
    });
}

function openScheduledModal(scheduled) {
    editingScheduledId = scheduled?.id || null;
    document.getElementById('scheduled-modal-title').textContent = Dashboard.t(
        scheduled ? 'main.scheduledModalTitleEdit' : 'main.scheduledModalTitle'
    );
    nameInput.value = scheduled?.name || '';
    reportSelect.value = scheduled ? String(scheduled.report_id) : '';
    endDateInput.value = (scheduled?.end_date || '').split(' ')[0] || '';
    recipientsInput.value = scheduled?.recipients || '';
    setSelectedDelivery(scheduled?.delivery_method || 'email');
    modalError.hidden = true;
    modal.hidden = false;
    nameInput.focus();
}

function closeScheduledModal() {
    modal.hidden = true;
}

document.getElementById('scheduled-new-btn').addEventListener('click', () => openScheduledModal(null));
document.getElementById('scheduled-cancel-btn').addEventListener('click', closeScheduledModal);
modal.addEventListener('click', (event) => { if (event.target === modal) closeScheduledModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeScheduledModal(); });

document.getElementById('scheduled-save-btn').addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) {
        modalError.textContent = Dashboard.t('main.scheduledNameRequired');
        modalError.hidden = false;
        return;
    }
    if (!reportSelect.value) {
        modalError.textContent = Dashboard.t('main.scheduledPickReportRequired');
        modalError.hidden = false;
        return;
    }
    const recipients = recipientsInput.value.trim();
    if (!recipients) {
        modalError.textContent = Dashboard.t('main.scheduledRecipientsRequired');
        modalError.hidden = false;
        return;
    }
    modalError.hidden = true;
    const body = {
        name,
        reportId: Number(reportSelect.value),
        endDate: endDateInput.value || null,
        deliveryMethod: selectedDeliveryMethod,
        recipients,
    };
    try {
        const url = editingScheduledId ? `/api/business/scheduled-reports/${editingScheduledId}` : '/api/business/scheduled-reports';
        const res = await fetch(url, {
            method: editingScheduledId ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('save failed');
        const wasEditing = !!editingScheduledId;
        closeScheduledModal();
        await loadScheduledReports();
        Dashboard.showToast(Dashboard.t(wasEditing ? 'main.changeSaved' : 'main.recordSaved'), 'success');
    } catch {
        modalError.textContent = Dashboard.t('admin.saveError');
        modalError.hidden = false;
    }
});

function renderScheduledReports() {
    const tbody = document.getElementById('scheduled-table-body');
    const emptyEl = document.getElementById('scheduled-empty');
    tbody.innerHTML = '';
    emptyEl.hidden = scheduledReports.length > 0;
    scheduledReports.forEach((scheduled) => {
        const tr = document.createElement('tr');
        const cells = [
            ['scheduledName', scheduled.name],
            ['scheduledCreatedBy', scheduled.created_by || '—'],
            ['scheduledAuthorizedBy', scheduled.authorized_by || '—'],
            ['scheduledCreatedAt', formatDate(scheduled.created_at)],
            ['scheduledEndDate', formatDate(scheduled.end_date)],
            ['scheduledDeliveryMethod', deliveryMethodLabel(scheduled.delivery_method)],
            ['scheduledRecipients', scheduled.recipients],
        ];
        cells.forEach(([col, text]) => {
            const td = document.createElement('td');
            td.dataset.col = col;
            td.textContent = text;
            tr.appendChild(td);
        });

        const tdActions = document.createElement('td');
        tdActions.dataset.col = 'actions';
        tdActions.className = 'admin-table-actions';

        if (!scheduled.authorized_by) {
            const authorizeBtn = document.createElement('button');
            authorizeBtn.type = 'button';
            authorizeBtn.className = 'admin-icon-btn';
            authorizeBtn.setAttribute('aria-label', Dashboard.t('main.scheduledAuthorize'));
            authorizeBtn.title = Dashboard.t('main.scheduledAuthorize');
            authorizeBtn.innerHTML = '<i class="bx bx-check-shield" aria-hidden="true"></i>';
            authorizeBtn.addEventListener('click', () => authorizeScheduled(scheduled));
            tdActions.appendChild(authorizeBtn);
        }
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'admin-icon-btn';
        editBtn.setAttribute('aria-label', Dashboard.t('admin.edit'));
        editBtn.innerHTML = '<i class="bx bx-edit" aria-hidden="true"></i>';
        editBtn.addEventListener('click', () => openScheduledModal(scheduled));
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-icon-btn admin-icon-btn-danger';
        deleteBtn.setAttribute('aria-label', Dashboard.t('admin.delete'));
        deleteBtn.innerHTML = '<i class="bx bx-trash" aria-hidden="true"></i>';
        deleteBtn.addEventListener('click', () => deleteScheduled(scheduled));
        tdActions.append(editBtn, deleteBtn);

        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });
}

async function authorizeScheduled(scheduled) {
    try {
        const res = await fetch(`/api/business/scheduled-reports/${scheduled.id}/authorize`, { method: 'POST', credentials: 'include' });
        if (!res.ok) {
            if (res.status === 403) { Dashboard.showToast(Dashboard.t('main.fieldLocked'), 'warning'); return; }
            throw new Error('authorize failed');
        }
        await loadScheduledReports();
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

async function deleteScheduled(scheduled) {
    if (!(await Dashboard.confirm(Dashboard.t('main.scheduledDeleteConfirm')))) return;
    try {
        const res = await fetch(`/api/business/scheduled-reports/${scheduled.id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('delete failed');
        scheduledReports = scheduledReports.filter((s) => s.id !== scheduled.id);
        renderScheduledReports();
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    }
}

async function loadScheduledReports() {
    try {
        const res = await fetch('/api/business/scheduled-reports', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        scheduledReports = data.scheduledReports || [];
        renderScheduledReports();
    } catch (err) {
        console.error('Reportes Programados: failed to load scheduled reports', err);
    }
}

async function loadAvailableReports() {
    try {
        const res = await fetch('/api/business/intelligent-reports', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        availableReports = data.reports || [];
        populateReportSelect();
    } catch (err) {
        console.error('Reportes Programados: failed to load available reports', err);
    }
}

(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: 'btn-negocio-inteligente' });
        await Promise.all([loadAvailableReports(), loadScheduledReports()]);
    } catch (err) {
        console.error('Reportes Programados failed to initialize:', err);
    }
})();
