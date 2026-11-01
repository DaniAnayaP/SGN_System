// ---------------------------------------------------------------------------
// Layout de la nave (Operaciones, C. Distribución). Pieza 1: la pantalla ya está en el menú y en el árbol de accesos; el croquis y la captura de contorno, puertas, conexiones de luz, zonas y espacios llegan en las piezas siguientes.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: 'cat-operaciones-centro-dist-layout' });
    } catch (err) {
        console.error('Layout failed to initialize:', err);
    }
})();
