// ---------------------------------------------------------------------------
// Inventario Venta (Operaciones > Verificador, C. Distribución). Pieza 1: la pantalla ya está en el menú y en el árbol de accesos; los artículos con destino "Se vende", la búsqueda y el escaneo llegan en las piezas siguientes.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: 'cat-operaciones-centro-dist-inventario-venta' });
    } catch (err) {
        console.error('Sales Inventory failed to initialize:', err);
    }
})();
