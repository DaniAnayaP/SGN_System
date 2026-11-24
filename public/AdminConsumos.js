// ---------------------------------------------------------------------------
// Cadena de Suministro › Centro de Distribución › Admin › Consumos: la pantalla ya existe y se abre con su permiso del árbol, pero todavía está VACÍA (sin tabla ni botones).
// Aquí irán los registros de consumos por unidad, artículo y mes (el Excel «Consumos»: Relac Org-Art, Org, Unidad, Código, Descripción, Categoría, UDM y un renglón de meses con su Total); qué lleva y cómo se carga se define después.
// ---------------------------------------------------------------------------
(async function init() {
    try {
        await Dashboard.initDashboard({ activePage: document.body.dataset.activePage });
    } catch (err) {
        console.error('Consumos: failed to initialize', err);
    }
})();
