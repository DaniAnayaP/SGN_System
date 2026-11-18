// ---------------------------------------------------------------------------
// Cadena de Suministro › Punto Venta › Gestión › Transacciones: la pantalla ya existe y se abre con su permiso del árbol, pero todavía está VACÍA (sin tabla ni botones).
// Transacciones (Gestión = lo terminado) recibirá lo que se cargue en Ventas (Operaciones).
// ---------------------------------------------------------------------------
(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
    } catch (err) {
        console.error('Transacciones: failed to initialize', err);
    }
})();
