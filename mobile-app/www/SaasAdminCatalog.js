// ---------------------------------------------------------------------------
// Catálogo de profundidad completa para las 9 pantallas de administración
// SaaS (Servicio a Cliente + Configuración SaaS) -- el equivalente de
// menu.json para el lado SaaS, usado por Admin-ArbolMaestroSaaS.js para
// renderizar el árbol con la misma estructura visual que el Árbol de
// Permisos Maestro (PermissionTree.js statusMode): Grupo -> Pantalla ->
// Apartado/Tabla/Modal -> Columna/Acción.
//
// itemId de cada Pantalla reutiliza el mismo namespace plano que ya usan
// SAAS_PERMISSION_CATALOG (Admin-EquipoSaaS.js) y saasItemId (Dashboard.js)
// -- 'saas-clients', 'saas-plans', etc. -- para que el día que el árbol de
// permisos POR CUENTA de Equipo SaaS también profundice, ambos compartan
// el mismo id de pantalla. 'saas-master-permissions-tree' y
// 'saas-business-sectors' son ids nuevos -- esas 2 pantallas todavía no
// tenían gate individual en ningún lado.
//
// ids de columnas/acciones se generan en tiempo de render a partir de la
// posición (ver buildLeafId en Admin-ArbolMaestroSaaS.js) -- no hace falta
// escribir un id único a mano por cada una de las ~150 hojas de este
// catálogo, solo que el ORDEN de este arreglo no cambie una vez guardado
// en producción (cambiar el orden movería el estatus guardado a la hoja
// equivocada).
// ---------------------------------------------------------------------------

// tableActions -- unlike `acciones` (real screen-level buttons, e.g. "+
// Nuevo Cliente", which combine into the screen's own single "Botones"
// row), these are the generic PER-ROW action icons every real Tabla shows
// in its own unnamed trailing actions column (e.g. Editar/Activar-
// Desactivar) -- confirmed live, 2026-09-24, against the real per-row icon
// strip on Admin-SaaS.html: "cómo activaré cada ícono al usuario?" -- an
// admin needs to enable/disable each one individually, not as one bundled
// Botones group. Rendered as ordinary leaves (kind: 'table-action') that
// default into the "Acciones" classification instead of "Por Definir",
// same 2-level Ver-y-Operar/Autorizar grant as any other acción.
function tablaApartado(id, columnas, acciones, tableActions) {
    return { id, label: 'Tabla principal', columnas, controlInterno: true, acciones, tableActions };
}

window.SAAS_ADMIN_CATALOG = [
    {
        groupId: 'customerService', labelKey: 'menu.customerService',
        screens: [
            {
                itemId: 'saas-clients', labelKey: 'menu.clientesRegistrados', href: 'Admin-SaaS.html',
                apartados: [
                    tablaApartado('tabla', [
                        'No. Único de Fecha', '# Registro Único (Contable)', 'RFC', 'Razón Social', 'Nombre comercial',
                        'Abreviación de empresa', 'Logo', 'Color institucional', 'Propietario', 'Nombre de contacto',
                        'Email de facturación', 'Inicio de contrato', 'Contrato (PDF)', 'Contrato (Word)', 'Plan/paquete',
                        'Giro de negocio', 'Recomendaciones de equipo', 'Costo contratado $', 'Pago inicial', 'Pago mensual',
                        'Centros de costo', 'Centros de costo contratados', 'Cambios de anexos', 'Fecha registro de contrato',
                        'Fin de contrato', 'Plazo de contrato', 'Permisos contratados', 'Pago por adicionales', 'Username', 'Status',
                    ], [
                        '+ Nuevo Cliente',
                    ], [
                        'Acceso Administrador', '+ Permisos Adicionales', 'Editar',
                        'Activar/Desactivar', 'Toggle APP', 'Reiniciar cliente de prueba',
                    ]),
                    { id: 'modal-permisos', label: 'Modal: Permisos Contratados / Adicionales', acciones: ['Ver árbol', 'Editar árbol'], nestUnder: { host: 'tabla', column: 'Permisos contratados' } },
                    { id: 'modal-anexos', label: 'Modal: Cambios de Anexos', columnas: ['Módulo', 'Acción', 'Solicitado por', 'Fecha solicitud', 'Fecha cambio', 'Duración contratada'], nestUnder: { host: 'tabla', column: 'Cambios de anexos' } },
                    { id: 'modal-color', label: 'Modal: Color Institucional', acciones: ['Editar color'], nestUnder: { host: 'tabla', column: 'Color institucional' } },
                    { id: 'modal-admin-access', label: 'Modal: Acceso Administrador (solo lectura)', acciones: ['Ver'], nestUnder: { host: 'tabla', column: 'Acceso Administrador' } },
                ],
            },
            {
                itemId: 'saas-plans', labelKey: 'menu.plansRegistered', href: 'Admin-Planes.html',
                apartados: [
                    tablaApartado('tabla', [
                        'Nombre del plan', 'Descripción', 'Giro de negocio', 'Fecha de creación', 'Creado por',
                        'Límite centros de costo', 'Costo accesos/permisos', 'Total por centro de costo', 'Fecha fin', 'Status', 'Bloqueado',
                    ], [
                        '+ Nuevo Plan',
                    ], [
                        'Árbol de acceso', 'Registro de Cambios', 'Editar', 'Activar', 'Eliminar',
                    ]),
                    { id: 'modal-arbol-plan', label: 'Modal: Árbol de Plan (accesos + costo)', acciones: ['Ver árbol', 'Editar árbol', 'Igualar visibilidad APP', 'Agregar visibilidad APP faltante'], nestUnder: { host: 'tabla', column: 'Árbol de acceso' } },
                ],
            },
            {
                itemId: 'saas-apps', labelKey: 'menu.ourApps', href: 'Admin-NuestrasApps.html',
                apartados: [
                    tablaApartado('catalogo', ['Nombre de App', 'Giro de negocio', 'Pantalla asignada', 'Status', 'Fecha de creación', 'Creado por'],
                        ['+ Crear Nueva App', 'Editar']),
                    { id: 'detalle', label: 'Vista Detalle', acciones: ['Editar (header)', 'Eliminar App', '+ Agregar pantalla operativa', 'Eliminar pantalla', 'Guardar checklist de campos'] },
                ],
            },
            {
                itemId: 'saas-master-permissions-tree', labelKey: 'menu.masterPermissionsTree', href: 'Admin-ArbolMaestro.html',
                apartados: [
                    { id: 'controles', label: 'Controles de la pantalla', acciones: ['Pestaña Árbol', 'Pestaña Resumen', 'Guardar', 'Cambiar moneda'] },
                ],
            },
            {
                itemId: 'saas-business-sectors', labelKey: 'menu.businessSectors', href: 'Admin-BusinessSectors.html',
                apartados: [
                    tablaApartado('tabla', ['Icono', 'Nombre del giro', 'Tipo de giro', 'Descripción', 'Permisos asignados', 'Status', 'Creado por', 'Fecha de creación'],
                        ['+ Crear Giro'],
                        ['Accesos Globales', 'Reorden Personalizado', 'Vista Previa', 'Editar', 'Registro de Cambios', 'Activar/Desactivar']),
                    { id: 'modal-tipo-giro', label: 'Modal: Tipo de Giro', acciones: ['Crear/editar tipo'], nestUnder: { host: 'tabla', classification: 'saas-class-acciones' } },
                    { id: 'modal-permisos-asignados', label: 'Modal: Permisos Asignados (solo lectura)', acciones: ['Ver resumen'], nestUnder: { host: 'tabla', column: 'Permisos asignados' } },
                ],
            },
        ],
    },
    {
        groupId: 'saasConfig', labelKey: 'menu.saasConfig',
        screens: [
            {
                itemId: 'saas-module-costs', labelKey: 'menu.moduleCosts', href: 'Admin-CostosModulos.html',
                apartados: [
                    { id: 'tabla', label: 'Tabla principal', columnas: ['Nombre del plan', 'Fecha de creación', 'Costo accesos/permisos', 'Costo por centro de costo', 'Status'], acciones: ['Filtrar', 'Editar costo', 'Registro de Cambios'] },
                    { id: 'modal-arbol-costo', label: 'Modal: Árbol de Costo (por plan)', acciones: ['Editar $ Web', 'Editar $ App'] },
                ],
            },
            {
                itemId: 'saas-team', labelKey: 'menu.saasTeam', href: 'Admin-EquipoSaaS.html',
                apartados: [
                    { id: 'tabla', label: 'Tabla principal', columnas: ['Username', 'Nombre', 'Email', 'Fecha de creación'], acciones: ['+ Nuevo Admin SaaS'], tableActions: ['Acceso de esta cuenta'] },
                    // Modal: Acceso de la cuenta -- un árbol propio (ver
                    // SAAS_PERMISSION_CATALOG en Admin-EquipoSaaS.js), una
                    // pantalla por Apartado en vez de una sola fila con el
                    // texto embarrado -- confirmado con el usuario que cada
                    // acción debe ir en su propia fila, no agrupada. Los 6
                    // anidan bajo el ícono real "Acceso de esta cuenta"
                    // (ahora su propia fila en Acciones) en vez de flotar
                    // sueltos bajo la clasificación en general.
                    { id: 'modal-acceso-clientes', label: 'Modal: Acceso de cuenta → Nuestros Clientes', acciones: ['Ver', 'Editar', 'Crear', 'Activar/Desactivar', 'Reset'], nestUnder: { host: 'tabla', column: 'Acceso de esta cuenta' } },
                    { id: 'modal-acceso-planes', label: 'Modal: Acceso de cuenta → Nuestros Planes', acciones: ['Ver', 'Editar', 'Crear', 'Activar/Desactivar'], nestUnder: { host: 'tabla', column: 'Acceso de esta cuenta' } },
                    { id: 'modal-acceso-costos', label: 'Modal: Acceso de cuenta → Costos de Módulos', acciones: ['Ver', 'Editar'], nestUnder: { host: 'tabla', column: 'Acceso de esta cuenta' } },
                    { id: 'modal-acceso-apps', label: 'Modal: Acceso de cuenta → Nuestras Apps', acciones: ['Ver', 'Editar', 'Crear'], nestUnder: { host: 'tabla', column: 'Acceso de esta cuenta' } },
                    { id: 'modal-acceso-respaldos', label: 'Modal: Acceso de cuenta → Nuestros Respaldos', acciones: ['Ver', 'Descargar'], nestUnder: { host: 'tabla', column: 'Acceso de esta cuenta' } },
                    { id: 'modal-acceso-apoyo', label: 'Modal: Acceso de cuenta → Material de Apoyo', acciones: ['Ver', 'Subir'], nestUnder: { host: 'tabla', column: 'Acceso de esta cuenta' } },
                ],
            },
            {
                itemId: 'saas-backups', labelKey: 'menu.ourBackups', href: 'Admin-NuestrosRespaldos.html',
                apartados: [
                    tablaApartado('tabla', ['Nombre de archivo', 'Pantalla', 'Tipo de evidencia', 'Fecha de registro'], ['Seleccionar cliente', 'Descargar']),
                ],
            },
            {
                itemId: 'saas-material-apoyo', labelKey: 'menu.ourSupportMaterial', href: 'Admin-MaterialApoyo.html',
                apartados: [
                    tablaApartado('tabla', ['Título', 'Nombre de archivo', 'Subido por', 'Fecha de subida'], ['Filtros en cascada (Cliente/Depto/Área/Categoría)', '+ Subir archivo', 'Descargar', 'Eliminar']),
                ],
            },
        ],
    },
];
