// ---------------------------------------------------------------------------
// Verificador Código (SKU) (Operaciones, C. Distribución). Pieza 1: la pantalla ya está en el menú y en el árbol de accesos; la búsqueda por código, el escaneo y la ficha llegan en las piezas siguientes. Reúne lo que antes eran Inventario Venta e Interno: lo que distingue un artículo es su campo Destino.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: 'cat-operaciones-centro-dist-verificador-sku' });
    } catch (err) {
        console.error('Code Verifier (SKU) failed to initialize:', err);
    }
})();
