// ---------------------------------------------------------------------------
// "Árbol de Permisos Maestro" — the GEIPSA-wide readiness status of every
// node in the ENTIRE system (every Departamento/Área/Apartado/Pantalla/
// Columna that could ever exist), independent of any one Giro de Negocio,
// Plan or client (see master_permission_status in db.js). Unlike Nuestros
// Sectores de Negocio / Nuestros Planes, there's exactly ONE of these trees
// -- no table of records, no per-row modal -- so the page body is just the
// tree itself, rendered directly, plus a single Save button. Shell
// (sidebar, i18n, settings, logout) comes from Dashboard.js.
// ---------------------------------------------------------------------------

const masterTreeContainer = document.getElementById('master-tree-container');
const masterTreeError = document.getElementById('master-tree-error');
const masterTreeSaveBtn = document.getElementById('master-tree-save');

let masterTree = null;

async function loadMasterTree() {
    masterTreeError.hidden = true;
    masterTreeContainer.innerHTML = '';
    try {
        const res = await fetch('/api/admin/master-permission-status', { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        masterTree = window.PermissionTree.create(masterTreeContainer, { statusMode: true });
        await masterTree.init(data.statuses || []);
    } catch {
        masterTreeError.textContent = Dashboard.t('admin.loadError');
        masterTreeError.hidden = false;
    }
}

masterTreeSaveBtn.addEventListener('click', async () => {
    if (!masterTree) return;
    masterTreeSaveBtn.disabled = true;
    try {
        const res = await fetch('/api/admin/master-permission-status', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ statuses: masterTree.getStatuses() }),
        });
        if (!res.ok) throw new Error('save failed');
        Dashboard.showToast(Dashboard.t('main.changeSaved'), 'success');
    } catch {
        Dashboard.showToast(Dashboard.t('admin.saveError'), 'error');
    } finally {
        masterTreeSaveBtn.disabled = false;
    }
});

(async function init() {
    try {
        const role = await Dashboard.initDashboard({ activePage: 'admin-master-permissions' });
        if (!role) return;
        if (role !== 'admin') {
            window.location.replace('Inicio-en.html');
            return;
        }
        await loadMasterTree();
    } catch (err) {
        console.error('Admin (Árbol de Permisos Maestro) failed to initialize:', err);
    }
})();
