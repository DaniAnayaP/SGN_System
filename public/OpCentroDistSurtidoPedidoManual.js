// ---------------------------------------------------------------------------
// Surtido Pedido Manual (Operaciones > QR's, C. Distribución): por ahora solo la pantalla, vacía. Daniel dirá después cómo funciona (2026-11-12); aquí solo se arma la página con su lugar en el menú y su ruta.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
    } catch (err) {
        console.error('Surtido Pedido Manual failed to initialize:', err);
    }
})();
