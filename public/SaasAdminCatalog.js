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

const CONTROL_INTERNO_LABEL = 'Columnas de Control Interno';

function tablaApartado(id, columnas, acciones) {
    return { id, label: 'Tabla principal', columnas, controlInterno: true, acciones };
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
                        '+ Nuevo Cliente', 'Acceso Administrador', '+ Permisos Adicionales', 'Editar',
                        'Activar/Desactivar', 'Toggle APP', 'Reiniciar cliente de prueba',
                    ]),
                    { id: 'modal-permisos', label: 'Modal: Permisos Contratados / Adicionales', acciones: ['Ver árbol', 'Editar árbol'] },
                    { id: 'modal-anexos', label: 'Modal: Cambios de Anexos', columnas: ['Módulo', 'Acción', 'Solicitado por', 'Fecha solicitud', 'Fecha cambio', 'Duración contratada'] },
                    { id: 'modal-color', label: 'Modal: Color Institucional', acciones: ['Editar color'] },
                    { id: 'modal-admin-access', label: 'Modal: Acceso Administrador (solo lectura)', acciones: ['Ver'] },
                ],
            },
            {
                itemId: 'saas-plans', labelKey: 'menu.plansRegistered', href: 'Admin-Planes.html',
                apartados: [
                    tablaApartado('tabla', [
                        'Nombre del plan', 'Descripción', 'Giro de negocio', 'Fecha de creación', 'Creado por',
                        'Límite centros de costo', 'Costo accesos/permisos', 'Total por centro de costo', 'Fecha fin', 'Status', 'Bloqueado',
                    ], [
                        '+ Nuevo Plan', 'Árbol de acceso', 'Registro de Cambios', 'Editar', 'Activar', 'Eliminar',
                    ]),
                    { id: 'modal-arbol-plan', label: 'Modal: Árbol de Plan (accesos + costo)', acciones: ['Ver árbol', 'Editar árbol', 'Igualar visibilidad APP', 'Agregar visibilidad APP faltante'] },
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
                        ['+ Crear Giro', 'Accesos Globales', 'Reorden Personalizado', 'Vista Previa', 'Editar', 'Registro de Cambios', 'Activar/Desactivar']),
                    { id: 'modal-tipo-giro', label: 'Modal: Tipo de Giro', acciones: ['Crear/editar tipo'] },
                    { id: 'modal-permisos-asignados', label: 'Modal: Permisos Asignados (solo lectura)', acciones: ['Ver resumen'] },
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
                    { id: 'tabla', label: 'Tabla principal', columnas: ['Username', 'Nombre', 'Email', 'Fecha de creación'], acciones: ['+ Nuevo Admin SaaS', 'Acceso de esta cuenta'] },
                    { id: 'modal-acceso', label: 'Modal: Acceso de la cuenta (árbol por cuenta)', acciones: ['Ver/Editar/Crear/Activar/Reset por pantalla'] },
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

window.SAAS_ADMIN_CONTROL_INTERNO_LABEL = CONTROL_INTERNO_LABEL;
