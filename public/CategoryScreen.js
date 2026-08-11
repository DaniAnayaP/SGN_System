// ---------------------------------------------------------------------------
// Shared controller for the category placeholder screens (Cat 1/2, Ope 1/2,
// Adm 1/2, Gest 1/2, Report 1/2, M. Apoyo 1/2) — all shell logic (sidebar,
// i18n, settings, logout, auth guard, filter bar) lives in Dashboard.js,
// loaded before this file. Each page just needs its own activePage id, read
// from <body data-active-page="...">.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        const activePage = document.body.dataset.activePage || 'category-screen';
        await Dashboard.initDashboard({ activePage });
    } catch (err) {
        console.error('Category screen failed to initialize:', err);
    }
})();
