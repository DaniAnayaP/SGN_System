// ---------------------------------------------------------------------------
// Dashboard (home) page. All shell logic (sidebar, i18n, settings, logout,
// auth guard) lives in Dashboard.js, loaded before this file.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: 'home' });
    } catch (err) {
        console.error('Dashboard failed to initialize:', err);
    }
})();
