// ---------------------------------------------------------------------------
// "Mis Accesos y Permisos" (Servicio Contratado) — a self-service, read-only
// view of what the CURRENTLY LOGGED-IN business user can actually see today:
// grants from their own Puesto de Trabajo (green) + Permisos Adicionales
// (yellow) + neither (red/locked). Same PermissionCostTree "clientTricolor"
// tree Usuarios' own "Permisos Activados" modal already uses for looking up
// ANOTHER user (admin-only there) — this page is the same tree pointed at
// GET /api/business/me/grants instead, open to any authenticated user since
// it's their own data. Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------

const container = document.getElementById('my-access-container');
const errorBanner = document.getElementById('my-access-error');

// Para el administrador, el subtítulo y la leyenda hablan del contrato (no de un perfil). Se cambia la clave de traducción, así el
// texto también sigue al cambiar de idioma.
const ADMIN_TEXT_KEYS = {
    'business.myAccessSubtitle': 'business.myAccessAdminSubtitle',
    'business.accesosLegendProfile': 'business.accesosLegendPlan',
    'business.accesosLegendExtra': 'business.accesosLegendAdditional',
    'business.accesosLegendNone': 'business.accesosLegendNotContracted',
};
function useAdminTexts() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        const adminKey = ADMIN_TEXT_KEYS[el.dataset.i18n];
        if (!adminKey) return;
        el.dataset.i18n = adminKey;
        el.textContent = Dashboard.t(adminKey);
    });
}

async function loadMyAccess() {
    errorBanner.hidden = true;
    container.innerHTML = '';
    try {
        const res = await fetch('/api/business/me/grants', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        const order = await fetch('/api/business/permission-order', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const classOverrides = await fetch('/api/business/permission-classifications', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((d) => (d && d.overrides) || null).catch(() => null);
        // El administrador del cliente ve todo su contrato (verde = en el plan, amarillo = adicional) y, bloqueado, lo que existe en su
        // giro y no contrató. Un usuario normal ve lo de su perfil y sus extras, como siempre.
        const isAdmin = !!data.isClientAdmin;
        if (isAdmin) useAdminTexts();
        const tree = window.PermissionCostTree.create(container, {
            order, classOverrides, mode: 'clientTricolor', interactive: false,
            historyEndpoint: isAdmin ? '/api/business/me/contract-change-log' : '/api/business/me/grant-change-log',
            giroGrants: isAdmin ? data.giroGrants : null,
        });
        await tree.init(data.jobPositionGrants || [], [], data.grants || []);
    } catch {
        errorBanner.textContent = Dashboard.t('admin.loadError');
        errorBanner.hidden = false;
    }
}

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'ab-my-access' });
        if (!role) return;
        await loadMyAccess();
    } catch (err) {
        console.error('Mis Accesos y Permisos failed to initialize:', err);
    }
})();
