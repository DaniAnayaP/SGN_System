// ---------------------------------------------------------------------------
// "+ Agregar Cliente Nuevo" — dedicated add-only form for registering a new
// SGN client. Viewing/editing/deleting existing clients, Contrataciones, and
// Anexos all live on Clientes Registrados (Admin-SaaS.js) instead — this
// page only ever POSTs. Shell (sidebar, i18n, settings, logout) comes from
// Dashboard.js.
//
// Access note: the sidebar only shows this page's link to admins, and the
// redirect below covers anyone who lands here directly without the role —
// but the actual enforcement is server-side (requireAdmin on every
// /api/admin/* route in server.js). This redirect is UX only.
// ---------------------------------------------------------------------------

const form = document.getElementById('client-form');
const companyField = document.getElementById('client-company');
const contactField = document.getElementById('client-contact');
const emailField = document.getElementById('client-email');
const phoneField = document.getElementById('client-phone');
const planField = document.getElementById('client-plan');
const statusField = document.getElementById('client-status');
const missionField = document.getElementById('client-mission');
const visionField = document.getElementById('client-vision');
const valuesField = document.getElementById('client-values');
const historyField = document.getElementById('client-history');
const logoInput = document.getElementById('client-logo');
const logoDataField = document.getElementById('client-logo-data');
const logoPreview = document.getElementById('client-logo-preview');
const logoClearBtn = document.getElementById('client-logo-clear');
const rfcField = document.getElementById('client-rfc');
const nicknameField = document.getElementById('client-nickname');
const abbreviationField = document.getElementById('client-abbreviation');
const ownerField = document.getElementById('client-owner');
const billingEmailField = document.getElementById('client-billing-email');
const contractStartField = document.getElementById('client-contract-start');
const contractRegisteredField = document.getElementById('client-contract-registered');
const contractEndField = document.getElementById('client-contract-end');
const contractedCostField = document.getElementById('client-contracted-cost');
const monthlyPaymentField = document.getElementById('client-monthly-payment');
const contractInput = document.getElementById('client-contract');
const contractDataField = document.getElementById('client-contract-data');
const contractFilenameField = document.getElementById('client-contract-filename');
const contractNameLabel = document.getElementById('client-contract-name');
const contractClearBtn = document.getElementById('client-contract-clear');
const paletteContainer = document.getElementById('client-color-palette');
let paletteWidget; // created after Dashboard.initDashboard() so i18n labels are ready — see init() below
const errorBanner = document.getElementById('client-form-error');
const submitBtn = document.getElementById('client-form-submit');

let plans = [];

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
}
function clearError() {
    errorBanner.hidden = true;
    errorBanner.textContent = '';
}

function setLogoPreview(dataUrl) {
    logoDataField.value = dataUrl || '';
    if (dataUrl) {
        logoPreview.src = dataUrl;
        logoPreview.hidden = false;
        logoClearBtn.hidden = false;
    } else {
        logoPreview.hidden = true;
        logoClearBtn.hidden = true;
    }
}

logoInput.addEventListener('change', () => {
    const file = logoInput.files?.[0];
    if (!file) return;
    if (file.size > 350 * 1024) {
        showError(Dashboard.t('admin.saveError'));
        logoInput.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(Dashboard.svgifyLogo(reader.result));
    reader.readAsDataURL(file);
});

logoClearBtn.addEventListener('click', () => {
    logoInput.value = '';
    setLogoPreview('');
});

// Contrato: same data-URL-in-the-record pattern as the logo above, just a
// bigger size cap (real PDFs) and no image preview — a filename label
// instead (see admin.contractFile in Admin-ClienteNuevo.html).
function setContractPreview(dataUrl, filename) {
    contractDataField.value = dataUrl || '';
    contractFilenameField.value = filename || '';
    if (dataUrl) {
        contractNameLabel.textContent = filename || '';
        contractNameLabel.hidden = false;
        contractClearBtn.hidden = false;
    } else {
        contractNameLabel.hidden = true;
        contractClearBtn.hidden = true;
    }
}

contractInput.addEventListener('change', () => {
    const file = contractInput.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        showError(Dashboard.t('admin.saveError'));
        contractInput.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = () => setContractPreview(reader.result, file.name);
    reader.readAsDataURL(file);
});

contractClearBtn.addEventListener('click', () => {
    contractInput.value = '';
    setContractPreview('', '');
});

function resetForm() {
    form.reset();
    setLogoPreview('');
    setContractPreview('', '');
    paletteWidget.setPalette(null);
    clearError();
}

// --- Plan / paquete: options come from the Planes y Paquetes catalog --------
function populatePlanSelect() {
    planField.querySelectorAll('option:not([value=""])').forEach((opt) => opt.remove());
    plans.forEach((plan) => {
        const option = document.createElement('option');
        option.value = plan.name;
        option.textContent = plan.name;
        planField.appendChild(option);
    });
}

async function loadPlans() {
    try {
        const res = await fetch('/api/admin/plans', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        plans = data.plans || [];
        populatePlanSelect();
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

    const { seed, ...currentPalette } = paletteWidget.getPalette();
    const payload = {
        companyName,
        contactName,
        email,
        phone: phoneField.value.trim(),
        plan: planField.value.trim(),
        status: statusField.value,
        logoDataUrl: logoDataField.value || null,
        seedColor: seed,
        colorPalette: currentPalette,
        mission: missionField.value.trim(),
        vision: visionField.value.trim(),
        coreValues: valuesField.value.trim(),
        history: historyField.value.trim(),
        rfc: rfcField.value.trim(),
        companyNickname: nicknameField.value.trim(),
        companyAbbreviation: abbreviationField.value.trim(),
        ownerName: ownerField.value.trim(),
        billingEmail: billingEmailField.value.trim(),
        contractStartDate: contractStartField.value || null,
        contractRegisteredDate: contractRegisteredField.value || null,
        contractEndDate: contractEndField.value || null,
        contractFileDataUrl: contractDataField.value || null,
        contractFileName: contractFilenameField.value || null,
        contractedCost: contractedCostField.value ? Number(contractedCostField.value) : 0,
        monthlyPayment: monthlyPaymentField.value ? Number(monthlyPaymentField.value) : 0,
    };

    submitBtn.disabled = true;
    try {
        const res = await fetch('/api/admin/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(body.message || Dashboard.t('admin.saveError'));
            return;
        }
        const { generatedAdmin } = await res.json();
        resetForm();
        if (generatedAdmin) showGeneratedAdmin(generatedAdmin);
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        submitBtn.disabled = false;
    }
});

// --- One-time generated admin credentials (shown when a client is activated) -
const generatedAdminBox = document.getElementById('generated-admin-box');
const generatedAdminUsername = document.getElementById('generated-admin-username');
const generatedAdminPassword = document.getElementById('generated-admin-password');
const generatedAdminDismiss = document.getElementById('generated-admin-dismiss');

function showGeneratedAdmin({ username, password }) {
    generatedAdminUsername.textContent = username;
    generatedAdminPassword.textContent = password;
    generatedAdminBox.hidden = false;
    generatedAdminBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

generatedAdminDismiss.addEventListener('click', () => {
    generatedAdminBox.hidden = true;
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-cliente-nuevo' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        paletteWidget = window.ColorPalette.create(paletteContainer);
        document.addEventListener('dashboard:language-changed', () => paletteWidget.refreshLabels());
        await loadPlans();
    } catch (err) {
        console.error('Admin (Cliente Nuevo) failed to initialize:', err);
    }
})();
