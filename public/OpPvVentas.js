// ---------------------------------------------------------------------------
// Cadena de Suministro › Punto Venta › Operaciones › Ventas: la pantalla ya existe y se abre con su permiso del árbol, pero todavía está VACÍA (sin tabla ni botones).
// Ventas se llenará por carga de plantilla y más adelante se ligará a la pantalla Transacciones (Gestión).
// ---------------------------------------------------------------------------
(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
    } catch (err) {
        console.error('Ventas: failed to initialize', err);
    }
})();
