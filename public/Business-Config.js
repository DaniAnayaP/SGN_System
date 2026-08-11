// ---------------------------------------------------------------------------
// "Configuración del Negocio" — the client's own admin adjusts their logo
// and institutional color palette (self-service version of what GEIPSA sets
// up initially in Admin-SaaS / Clientes Nuevos). Shell comes from
// Dashboard.js; palette math/UI comes from ColorPalette.js.
// ---------------------------------------------------------------------------

const logoInput = document.getElementById('config-logo');
const logoDataField = document.getElementById('config-logo-data');
const logoPreview = document.getElementById('config-logo-preview');
const logoClearBtn = document.getElementById('config-logo-clear');
const paletteContainer = document.getElementById('config-color-palette');
let paletteWidget; // created after Dashboard.initDashboard() so i18n labels are ready — see init() below
const errorBanner = document.getElementById('config-error');
const saveBtn = document.getElementById('config-save');
const saveStatus = document.getElementById('config-save-status');

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

async function loadCurrentBranding() {
    try {
        const res = await fetch('/api/business/branding', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        const branding = data.branding || {};
        setLogoPreview(branding.logoDataUrl || '');
        const palette = branding.colorPalette ? { ...branding.colorPalette, seed: branding.seedColor } : null;
        paletteWidget.setPalette(palette);
    } catch {
        showError(Dashboard.t('admin.loadError'));
    }
}

saveBtn.addEventListener('click', async () => {
    clearError();
    saveStatus.textContent = '';
    const { seed, ...currentPalette } = paletteWidget.getPalette();
    saveBtn.disabled = true;
    try {
        const res = await fetch('/api/business/branding', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                logoDataUrl: logoDataField.value || null,
                seedColor: seed,
                colorPalette: currentPalette,
            }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            showError(body.message || Dashboard.t('admin.saveError'));
            return;
        }
        saveStatus.textContent = Dashboard.t('business.brandingSaved');
    } catch {
        showError(Dashboard.t('admin.saveError'));
    } finally {
        saveBtn.disabled = false;
    }
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'business-config' });
        if (!role) return;
        if (!Dashboard.isClientAdmin) {
            window.location.replace('Inicio-en.html');
            return;
        }
        paletteWidget = window.ColorPalette.create(paletteContainer);
        document.addEventListener('dashboard:language-changed', () => paletteWidget.refreshLabels());
        await loadCurrentBranding();
    } catch (err) {
        console.error('Business (Config) failed to initialize:', err);
    }
})();
