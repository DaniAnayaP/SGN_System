// ---------------------------------------------------------------------------
// "Datos de Cliente" — Administración del Negocio: read-only view of the
// client's core identity (misión, visión, valores, historia). These are set
// by GEIPSA from Clientes Nuevos (Admin-SaaS), not editable here — this page
// only exists so that identity/core purpose isn't lost once Comercial and
// Marketing modules connect to it later. Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

const missionEl = document.getElementById('cd-mission');
const visionEl = document.getElementById('cd-vision');
const valuesEl = document.getElementById('cd-values');
const historyEl = document.getElementById('cd-history');

function renderField(el, value) {
    el.textContent = value && value.trim() ? value : Dashboard.t('business.clientDataNotSet');
}

let profile = null;

function renderProfile() {
    if (!profile) return;
    renderField(missionEl, profile.mission);
    renderField(visionEl, profile.vision);
    renderField(valuesEl, profile.coreValues);
    renderField(historyEl, profile.history);
}

async function loadClientData() {
    try {
        const res = await fetch('/api/business/client-data', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        profile = data.profile;
        renderProfile();
    } catch {
        renderField(missionEl, '');
        renderField(visionEl, '');
        renderField(valuesEl, '');
        renderField(historyEl, '');
    }
}

document.addEventListener('dashboard:language-changed', renderProfile);

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'business-datos-cliente' });
        if (!role) return;
        await loadClientData();
    } catch (err) {
        console.error('Business (Datos de Cliente) failed to initialize:', err);
    }
})();
