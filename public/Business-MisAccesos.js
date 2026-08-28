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

async function loadMyAccess() {
    errorBanner.hidden = true;
    container.innerHTML = '';
    try {
        const res = await fetch('/api/business/me/grants', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        const tree = window.PermissionCostTree.create(container, { mode: 'clientTricolor', interactive: false });
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
