// ---------------------------------------------------------------------------
// "Colores por Nivel" (SaaS): el equipo SaaS elige el color (Encabezado / Filas, fondo y letra) de las columnas de las
// tablas de los clientes por Giro, por Plan o por Cliente. Toda la pantalla vive en ColumnColorsPage.js (compartida con
// la del cliente); aquí solo se dice a qué rutas llama. Gated by the saas-column-colors grants (Equipo SaaS).
// Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------
window.ColumnColorsPage.start({
    activePage: 'admin-column-colors',
    requiredRole: 'admin',
    api: { catalog: '/api/admin/column-colors/catalog', state: '/api/admin/column-colors' },
    requestsApi: '/api/admin/column-color-level-requests',
    openHistory: () => Dashboard.openChangeHistoryWithRows(Dashboard.t('main.changeHistory'), Dashboard.saasTableChangesLoader('colores-niveles')),
});
