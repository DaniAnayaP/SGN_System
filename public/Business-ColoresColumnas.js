// ---------------------------------------------------------------------------
// "Colores de Columnas" (Administración del Negocio): el administrador, un perfil o una persona eligen el color de
// las columnas de las tablas de su empresa. Toda la pantalla vive en ColumnColorsPage.js (compartida con la de SaaS);
// aquí solo se dice a qué rutas llama y qué pantallas deja personalizar. Shell comes from Dashboard.js.
// ---------------------------------------------------------------------------
window.ColumnColorsPage.start({
    activePage: 'ab-column-colors',
    api: { catalog: '/api/business/column-colors/catalog', state: '/api/business/column-colors', orders: '/api/business/column-orders' },
    requestsApi: '/api/business/column-color-requests',
    // Solo las pantallas a las que esta cuenta tiene acceso (mismo criterio del menú lateral).
    filterScreen: (screen) => Dashboard.hasScreenGrant(screen.path.sectionId, screen.path.itemId, screen.path.submenuPrefix),
    openHistory: () => Dashboard.openChangeHistory('colores-columnas'),
});
