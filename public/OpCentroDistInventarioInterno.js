// ---------------------------------------------------------------------------
// Inventario Interno (Operaciones > Verificador, C. Distribución). Pieza 1: la pantalla ya está en el menú y en el árbol de accesos; los artículos con destino "Uso interno", la búsqueda y el escaneo llegan en las piezas siguientes.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: 'cat-operaciones-centro-dist-inventario-interno' });
    } catch (err) {
        console.error('Internal Inventory failed to initialize:', err);
    }
})();
