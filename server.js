/**
 * SGN — unified app server.
 *
 * Serves the frontend (public/) and the auth API (/api/*) from the SAME
 * Express app and port, so the whole system lives behind one URL. This is
 * the deployment target for Railway: no CORS setup needed since the
 * frontend and API share an origin, and no need to manage two separate
 * hosting providers.
 *
 * DEMO USER (seeded once into the database on first run — see db.js):
 *   username: admin
 *   password: admin
 * Remove it (see README) before this touches anything real.
 *
 * To adapt for real use:
 *   1. Swap SQLite for Postgres/MySQL if you need multiple app server
 *      instances writing concurrently (SQLite is fine for a single
 *      instance, which is what a typical Railway deployment runs).
 *   2. Delete the seeded admin/admin user, or force a password change on
 *      first login.
 *   3. Set JWT_SECRET via environment variables, never hardcoded.
 *   4. Add per-client (multi-tenant) scoping if this backend will serve
 *      more than one company/client — see the note in db.js.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const { hashPassword, verifyPassword } = require('./password');
const { sendMail } = require('./mailer');
const {
    findUserByUsername,
    usernameOrEmailExists,
    createUser,
    MODULE_CATALOG,
    listClients,
    getClientById,
    getClientBranding,
    getClientProfile,
    createClient,
    updateClient,
    setClientAppEnabled,
    deleteClientCompletely,
    provisionTrainingAccount,
    resetTrainingAccountData,
    updateClientBranding,
    findClientByRfc,
    getModuleCosts,
    setModuleCosts,
    getAnexoChanges,
    getClientModules,
    setClientModules,
    setClientCostCentersLimit,
    getClientAddenda,
    setClientAddenda,
    getClientModuleKeys,
    listCostCenters,
    countCostCenters,
    getCostCenterById,
    getCostCenterAnyLane,
    createCostCenter,
    updateCostCenter,
    SHORT_CODE_LENGTH,
    normalizeShortCode,
    getStateById,
    getLocalityById,
    setGeoShortCode,
    updateCostCenterNickname,
    setCostCenterStatus,
    listCompleteCostCenterIds,
    hasCompleteCostCenter,
    linkClientDataToFirstCostCenter,
    updateGeoEntry,
    listCountries,
    listStates,
    listMunicipalities,
    listLocalities,
    listStreets,
    createCountry,
    createState,
    createMunicipality,
    createLocality,
    createStreet,
    listFieldFillRules,
    listAllFieldFillRules,
    getFieldFillRuleById,
    createFieldFillRule,
    updateFieldFillRule,
    authorizeFieldFillRule,
    deleteFieldFillRule,
    listJobPositions,
    getJobPositionById,
    createJobPosition,
    updateJobPosition,
    deleteJobPosition,
    listHrStatusCatalog,
    getHrStatusCatalogById,
    createHrStatusCatalogEntry,
    updateHrStatusCatalogEntry,
    deleteHrStatusCatalogEntry,
    HR_STATUS_CATALOG_FIELDS,
    getUserOperationalStatus,
    listIntelligentReports,
    getIntelligentReportById,
    createIntelligentReport,
    updateIntelligentReport,
    deleteIntelligentReport,
    authorizeIntelligentReport,
    computeIntelligentReportRows,
    listScheduledReports,
    getScheduledReportById,
    createScheduledReport,
    updateScheduledReport,
    deleteScheduledReport,
    authorizeScheduledReport,
    listFuelRecords,
    getFuelRecordById,
    createFuelRecord,
    updateFuelRecord,
    deleteFuelRecord,
    listFuelLoadingRecords,
    getFuelLoadingRecordById,
    createFuelLoadingRecord,
    FUEL_LOADING_PATCHABLE_FIELDS,
    updateFuelLoadingRecord,
    deleteFuelLoadingRecord,
    listUnitTypes,
    getUnitTypeById,
    createUnitType,
    UNIT_TYPE_PATCHABLE_FIELDS,
    updateUnitType,
    deleteUnitType,
    listFleetUnits,
    getFleetUnitById,
    createFleetUnit,
    FLEET_UNIT_PATCHABLE_FIELDS,
    updateFleetUnit,
    deleteFleetUnit,
    suggestFuelTypeForEcoUnit,
    listSkuItems,
    getSkuItemById,
    createSkuItem,
    SKU_ITEM_PATCHABLE_FIELDS,
    updateSkuItem,
    setSkuItemEditing,
    deleteSkuItem,
    getSkuNumberingInfo,
    buildSkuCode,
    setSkuItemStatus,
    generatePublicToken,
    getSkuItemByPublicToken,
    setSkuItemPublicToken,
    getClientLayout,
    listClientLayouts,
    saveClientLayout,
    ensureLayoutPublicToken,
    regenerateLayoutPublicToken,
    getLayoutByPublicToken,
    startCleaningRecord, finishCleaningRecord, findCleaningByRef, finishCleaningFromApp, listOpenCleaningsOf, getCleaningLast, listCleaningRecords, getCleaningRecord, getCleaningPhoto, deleteCleaningRecord, updateCleaningRecord, CLEANING_PATCHABLE_FIELDS, updateTemperatureRecord, TEMPERATURE_PATCHABLE_FIELDS,
    MANUAL_ORDER_STATUSES, MANUAL_ORDER_PATCHABLE_FIELDS, STORAGE_CAPACITY_PATCHABLE_FIELDS, listStorageCapacity, getStorageCapacityByKey, createStorageCapacity, updateStorageCapacity, deleteStorageCapacity, listSkuCapacityData, listManualOrderItems, listManualItemCenters, listManualItemShips,getManualOrderItem, createManualOrder, findManualOrderByRef, listManualOrderLines, getManualOrderWithLines, getManualOrderLine, updateManualOrderLine, setManualOrderLineStatus, deleteManualOrderLine, INCIDENT_CATEGORIES, INCIDENT_STATUSES, INCIDENT_MAX_PHOTOS, INCIDENT_PATCHABLE_FIELDS, createIncident, findIncidentByRef, addIncidentPhotosByRef, addIncidentPhotos, listIncidents, getIncident, getIncidentPhoto, updateIncident, setIncidentStatus, deleteIncident, countIncidentsByCriterion,
    addTemperatureRecord, findTemperatureByRef, getTemperatureLast, listTemperatureRecords, getTemperatureRecord, getTemperaturePhoto, deleteTemperatureRecord, getQrLocksRaw, saveQrLocks,
    addSafetyCheck, findSafetyCheckByRef, listSafetyChecks, getSafetyCheck, getSafetyPhoto, deleteSafetyCheck, updateSafetyCheck, SAFETY_CHECK_PATCHABLE_FIELDS, getSafetyLast, clientLocalDay,
    ARTICLE_CATEGORY_TYPES,
    listArticleCategories,
    listTransitCatalog,
    getArticleCategoryById,
    listActiveArticleCategoryNames,
    ZONE_CATEGORY_COLUMNS,
    countZoneCodesByCategory,
    countZoneCodesInCategory,
    countCodesByZone,
    listPublicSkuItemsForSearch,
    listCodePlacesForSearch,
    listZoneCodesWithPlaces,
    countSkuItemsByClassification,
    createArticleCategory,
    ARTICLE_CATEGORY_PATCHABLE_FIELDS,
    articleCategoryPatchableFields,
    updateArticleCategory,
    CODE_RELATION_PATCHABLE_FIELDS,
    SKU_DIST_PATCHABLE_FIELDS,
    SKU_DIST_STORAGE_TYPES,
    FIXED_ASSET_PATCHABLE_FIELDS,
    listFixedAssets,
    getFixedAssetById,
    nextFixedAssetCodeNumber,
    createFixedAsset,
    updateFixedAsset,
    countFixedAssetsByType,
    countFixedAssetsByClass,
    getFixedAssetAnyScope,
    listFixedAssetsOfCenterAnyScope,
    listArticleCategoriesAnyScope,
    listRawClientLayouts,
    readRawClientLayout,
    writeRawClientLayout,
    listSkuDistribution,
    listSkuDistributionBySku,
    getSkuDistributionById,
    createSkuDistribution,
    updateSkuDistribution,
    deleteSkuDistribution,
    createSkuDistributionUnderNewBrand,
    countSkuDistributionByBrand,
    countSkuDistributionByShipTo,
    listSkuItemsWithoutDistribution,
    listSkuDistributionBySkus,
    listCodeShipRelations,
    getCodeShipRelationById,
    findCodeShipRelation,
    createCodeShipRelation,
    deleteCodeShipRelation,
    countCodeShipRelationsByPlace,
    countShipItemsByPlace,
    listCodeRelations,
    getCodeRelationById,
    createCodeRelation,
    updateCodeRelation,
    deleteCodeRelation,
    listCodeRelationsBy,
    findCodeRelationInSlot,
    findCodeRelationDuplicate,
    searchSkuItems,
    listSkuItemUpcs,
    listSkuUniqueDescriptions,
    deleteArticleCategory,
    resolveEscalationHolder,
    getCatalogValueRequestById,
    listCatalogValueRequestsForHolder,
    listCatalogValueRequestsBySubmitter,
    listAllCatalogValueRequests,
    listCatalogValueRequestHops,
    createCatalogValueRequest,
    forwardCatalogValueRequest,
    resolveForwardCandidates,
    approveCatalogValueRequest,
    rejectCatalogValueRequest,
    listFreightQuotes,
    getFreightQuoteById,
    listActiveFreightQuoteOptions,
    createFreightQuote,
    FREIGHT_QUOTE_PATCHABLE_FIELDS,
    updateFreightQuote,
    deleteFreightQuote,
    listTransfers,
    getTransferById,
    createTransfer,
    TRANSFER_PATCHABLE_FIELDS,
    updateTransfer,
    deleteTransfer,
    getSystemColumnsForRecord,
    isValidTimeZone,
    SAAS_TIME_ZONE,
    listHrWorkers,
    getHrWorkerById,
    createHrWorker,
    activateHrWorkerUser,
    updateHrWorker,
    parseHrAssignment,
    serializeHrAssignment,
    hrAssignmentOptions,
    resolveHrAssignment,
    describeHrAssignment,
    getTableChanges,
    getAllTableChanges,
    logTableChange,
    getSavedSearchesForClientTable,
    getSavedSearchById,
    createSavedSearch,
    deleteSavedSearch,
    updateSavedSearch,
    getSaasSavedSearchesForTable,
    getSaasSavedSearchById,
    createSaasSavedSearch,
    updateSaasSavedSearch,
    deleteSaasSavedSearch,
    getSavedLayoutsForClientTable,
    getSavedLayoutById,
    createSavedLayout,
    deleteSavedLayout,
    updateSavedLayout,
    getSaasSavedLayoutsForTable,
    getSaasSavedLayoutById,
    createSaasSavedLayout,
    deleteSaasSavedLayout,
    updateSaasSavedLayout,
    getJobPositionIdForUser,
    getColumnGrantLevel,
    canAuthorizeColumn,
    canDeleteColumn,
    getSearchGatedColumns,
    publishDataChangeNotice,
    publishButtonActionNotice,
    publishIconUpdateNotice,
    hasTableIconGrant,
    hasColumnGrant,
    publishAccessChangeNotice,
    userIdsOfJobPosition,
    canCreateColumn,
    createPendingChange,
    getPendingChangeById,
    hasPendingChangeForField,
    listPendingChangesForClient,
    getPendingColumnsByRecord,
    resolvePendingChange,
    getLastChangedBy,
    listPendingChangesRequestedBy,
    markPendingChangesSeenForRequester,
    createAccessDeniedAlert,
    isClientLayoutLevel,
    clientLayoutAccess,
    resolveClientLayoutAuthorizer,
    getUserEffectiveGrantsRaw,
    listClientColorTargets,
    getJobPositionByIdAnyClient,
    hasRecentScreenAccessDeniedAlert,
    publishSaasAccessDeniedNotice,
    listAccessDeniedAlertsForUser,
    listAllAccessDeniedAlerts,
    markAccessDeniedAlertsSeen,
    resolveDirectSupervisorUserId,
    getOrgChartPositions,
    setJobPositionReportsTo,
    wouldCreateReportsToCycle,
    getAltSupervisorIds,
    setJobPositionAltSupervisors,
    COST_CENTER_FIELDS,
    JOB_POSITION_FIELDS,
    FUEL_PATCHABLE_FIELDS,
    HR_WORKER_PATCHABLE_FIELDS,
    listPlans,
    getPlanById,
    getPlanByName,
    createPlan,
    updatePlan,
    lockPlan,
    activatePlan,
    deletePlan,
    listSaasApps,
    getSaasAppById,
    createSaasApp,
    updateSaasApp,
    deleteSaasApp,
    addSaasAppScreen,
    deleteSaasAppScreen,
    getWebScreenFieldsCatalog,
    setSaasAppScreenFields,
    listBusinessSectors,
    createBusinessSector,
    updateBusinessSector,
    setBusinessSectorStatus,
    getBusinessSectorById,
    listBusinessSectorTypes,
    createBusinessSectorType,
    updateBusinessSectorType,
    getBusinessSectorChanges,
    getAllBusinessSectorChanges,
    logBusinessSectorChange,
    BUSINESS_SECTOR_PATCHABLE_FIELDS,
    getSectorGrants,
    setSectorGrants,
    getMasterPermissionStatuses,
    resolveMasterNodeStatus,
    buildMasterStatusOverrideMap,
    setMasterPermissionStatuses,
    getUserVisibleStatuses,
    setUserVisibleStatuses,
    ALL_ESTATUS_VALUES,
    getMasterPermissionClassificationOverrides,
    setMasterPermissionClassificationOverride,
    deleteMasterPermissionClassificationOverride,
    getClassificationColors,
    setClassificationColor,
    setClassificationTextColor,
    clearClassificationColor,
    getEffectiveColumnClassifications,
    getMasterPermissionChangeLog,
    getSaasMasterStatuses,
    setSaasMasterStatuses,
    getSaasStatusOverrides,
    getSaasMasterOrder,
    setSaasMasterOrder,
    getSaasClassificationOverrides,
    setSaasClassificationOverride,
    deleteSaasClassificationOverride,
    getSaasClassificationColors,
    setSaasClassificationColor,
    setSaasClassificationTextColor,
    clearSaasClassificationColor,
    createColorRequest,
    getColorRequest,
    listColorRequestsForUser,
    listColorNotificationsForUser,
    markColorRequestsSeen,
    publishColorUpdate,
    publishOrderUpdate,
    listTreeNoticesForUser,
    markTreeNoticesSeen,
    decideColorRequest,
    applySaasColorRequest,
    resolveSaasColorAuthorizer,
    userCanAuthorizeSaasColors,
    userCanAuthorizeColors,
    resolveColorAuthorizer,
    applyColorRequest,
    diffMasterPermissionStatuses,
    getUserNameById,
    resolveClientColorTarget,
    getEffectiveOrdersForViewer,
    getCascadedColumnGroups,
    scanLimitViolations,
    systemReset,
    getSessionsValidAfter,
    setSessionsValidAfter,
    getSessionBlockReason,
    getSessionState,
    isSaasSuperAdminUser,
    listClientsOnPlan,
    renameClientsPlan,
    getClientContractGrants,
    clampNewGrantsToLimits,
    getHrAssignedCenterIds,
    getHrAssignedCenterGrants,
    getOrderTreeForTarget,
    getInheritedClassificationOverridesForTarget,
    applyLevelLayout,
    clearLevelLayout,
    listPendingLevelRequests,
    publishLevelLayoutUpdate,
    userCanAuthorizeLevel,
    resolveLevelAuthorizer,
    getEffectiveClassificationOverridesForTarget,
    getEffectiveClassificationOverridesForViewer,
    setLevelOrders,
    SAAS_COLOR_TARGET_LEVELS,
    resolveSaasColorLevelTarget,
    getSaasTableColumnColors,
    getEffectiveSaasUserFieldClassifications,
    getSaasMasterChangeLog,
    getSaasPersonalOrder,
    setSaasPersonalOrder,
    getMasterPermissionOrder,
    setMasterPermissionOrders,
    setSectorPermissionOrders,
    getEffectiveSectorDepartmentOrder,
    getEffectiveSectorOrdersByPrefix,
    areaOrderKey,
    apartadoOrderKey,
    pantallaOrderKey,
    columnOrderKey,
    PERMISSION_ORDER_ROOT_KEY,
    getClientAppScreens,
    WEB_SCREEN_CATALOG,
    getPlanGrants,
    setPlanGrants,
    syncPlanModulesFromGrants,
    getMasterPermissionCosts,
    setMasterPermissionCosts,
    getMasterCostSettings,
    applyMasterCostCurrencyChange,
    computeAccessCostTotal,
    getSectorCostAdjustDefault,
    setSectorCostAdjustDefault,
    getSectorPermissionCostAdjustments,
    setSectorPermissionCostAdjustments,
    getPlanCostAdjustDefault,
    setPlanCostAdjustDefault,
    getPlanPermissionCostAdjustments,
    setPlanPermissionCostAdjustments,
    getPlanCostAdjustBaseCosts,
    getCascadedPlanCosts,
    getClientPermissionGrants,
    setClientPermissionGrants,
    getClientPermissionChangeLog,
    computeClientAdditionalPermissionsCost,
    isTupleGranted,
    syncClientModulesFromPermissionGrants,
    getPlanChanges,
    getAllPlanChanges,
    getClientChanges,
    getAllClientChanges,
    getSaasTableChanges,
    logSaasTableChange,
    logClientChange,
    logPlanChange,
    listSaasAdmins,
    getSaasUserById,
    setSaasUserActive,
    setSaasUserName,
    setSaasUserUsername,
    isSaasUsernameTaken,
    resetSaasUserPassword,
    getSaasUserChanges,
    getAllSaasUserChanges,
    logSaasUserChange,
    getSaasUserGrants,
    setSaasUserGrants,
    hasSaasGrant,
    activateClient,
    deactivateClientUsers,
    listBusinessUsers,
    getUserById,
    setUserActive,
    getUserProfileById,
    getUserBusinessProfileById,
    getUserEffectiveGrants,
    getUserJobPositionGrants,
    getUserDefaults,
    setUserDefaults,
    getUserUiScale,
    setUserUiScale,
    getJobPositionGrants,
    getJobPositionDepartments,
    setJobPositionGrants,
    getUserGrants,
    setUserGrants,
    getUserGrantChangeLog,
    listClientEvidenceFiles,
    getEvidenceRawValue,
    setEvidenceValue,
    getEvidencePermColKey,
    listSupportMaterials,
    createSupportMaterial,
    getSupportMaterialById,
    deleteSupportMaterial,
    SUPPORT_MATERIAL_CATEGORIES,
} = require('./db');
const { getUploadUrl, getDownloadUrl, putObject, deleteObject, isConfigured: isR2Configured, listKeys: listR2Keys, deleteKeys: deleteR2Keys } = require('./r2');
const { GROUPS_TO_DELETE, GROUPS_TO_KEEP, MAX_BACKUP_AGE_MS, FILE_PREFIXES } = require('./systemReset');
const { buildEvidenceStorageKey, buildEvidenceDisplayName, extFromContentType } = require('./evidenceNaming');
const { buildSupportMaterialStorageKey } = require('./supportMaterialNaming');

// Change-history "Usuario" column shows whoever made the change -- for the
// auto-provisioned client-admin account, req.user.name is still frozen as
// "Admin <razón social completa>" (see activateClient in db.js), never
// meant to be read there any more than in the sidebar/App greeting (already
// fixed to use company_nickname/Apodo Empresa instead). Falls back to
// req.user.name for every other kind of account, whose own real name is
// exactly what should show.
function changedByLabel(req) {
    if (req.user.isClientAdmin && req.user.clientId) {
        const client = getClientById(req.user.clientId);
        if (client?.company_nickname) return client.company_nickname;
    }
    return req.user.name;
}

// Las pantallas que no están en la lista de las APPs (WEB_SCREEN_CATALOG) también necesitan su nombre en los avisos y en el historial de cambios.
const EXTRA_SCREEN_LABEL_KEYS = { limpieza: 'menu.opCentroDistLimpieza', temperaturas: 'menu.opCentroDistTemperaturas', seguridad: 'menu.opCentroDistSeguridad', 'pedido-manual': 'menu.opCentroDistPedidoManual', 'capacidad-almacenamiento': 'menu.opCentroDistCapacidadAlmacenamiento', incidentes: 'menu.opCentroDistIncidentes', 'udm-distribucion': 'menu.opCentroDistUdmDistribucion', 'relacion-envio': 'menu.opCentroDistRelacionEnvio', 'alta-activos': 'menu.opCentroDistAltaActivos' };
const screenLabelKeyOf = (tableKey) => (WEB_SCREEN_CATALOG.find((s) => s.key === tableKey) || {}).labelKey || EXTRA_SCREEN_LABEL_KEYS[tableKey] || tableKey;

const app = express();

// Railway (like Heroku/most PaaS) puts the app behind a reverse proxy, which
// sets X-Forwarded-For on every request. Without this, Express doesn't trust
// that header, so express-rate-limit can't tell real client IPs apart —
// every request behind the proxy looks like it's coming from the same
// address, which both breaks per-IP rate limiting and logs a validation
// error on every single request. `1` trusts exactly one hop (Railway's own
// proxy), not arbitrary client-supplied headers.
app.set('trust proxy', 1);

// Compresión de las respuestas (gzip o brotli, lo que acepte el navegador): sin ella el script principal (Dashboard.js, ~720 KB), los textos (~250 KB) y las listas de las tablas (~1 MB
// con 1,200 filas) viajaban completos en cada pantalla. Solo comprime lo que vale la pena (texto, JSON, JS, CSS, SVG); imágenes, PDFs y Excel ya vienen comprimidos y pasan igual.
app.use(compression());

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
const IS_PROD = process.env.NODE_ENV === 'production';
// Sesión deslizante: el token y la cookie duran 8 h SIN usar el sistema; cada petición con sesión válida que llega cuando el token ya tiene más de 10 min lo renueva (otras 8 h),
// pero nunca pasa de 24 h desde que se inició sesión (la marca ses del token guarda ese primer momento). Así quien trabaja todo el día no se queda a medias, y una pantalla olvidada
// abierta no deja la sesión viva más de un día. Lo que no pasa por requireAuth (páginas estáticas, la hoja de inicio de sesión) no renueva nada.
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SESSION_RENEW_AFTER_SECONDS = 10 * 60;
const SESSION_MAX_SECONDS = 24 * 60 * 60;
const PUBLIC_DIR = path.join(__dirname, 'public');

if (IS_PROD && JWT_SECRET === 'CHANGE_ME_IN_PRODUCTION') {
    console.warn('[WARNING] JWT_SECRET is not set. Set it as an environment variable before real use.');
}

// The native Android app (mobile-app/) bundles its own copy of the App*
// HTML/JS/CSS locally inside the .apk instead of loading it from this
// server (see mobile-app/capacitor.config.json) -- every request it makes
// here is therefore cross-origin from the WebView's own local origin,
// unlike the desktop site and the installed PWA, which are both served BY
// this backend and stay same-origin as before. Scoped to that one known
// origin (with credentials) rather than a wildcard, since this also needs
// to allow the session cookie through.
const NATIVE_APP_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && NATIVE_APP_ORIGINS.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
        if (req.method === 'OPTIONS') {
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
            // X-CSRF-Token added 2026-09-28 (security review, finding #04) --
            // without it here, the native app's own preflight for every
            // mutating request would fail closed the moment requireCsrf
            // below started requiring that header, breaking every save from
            // the phone.
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
            return res.sendStatus(204);
        }
    }
    next();
});

// helmet's default CSP is strict and will block the boxicons CDN + inline
// scripts this frontend currently uses. Loosen just enough for that;
// tighten further once you stop relying on inline <script> blocks.
// crossOriginResourcePolicy defaults to 'same-origin', which would also
// block the native app's cross-origin fetches above at the response stage
// even with the CORS headers in place.
// connect-src defaults to 'self' only -- without R2's own origin listed
// here, the browser blocks every evidence upload/download fetch to R2
// before the request ever leaves the machine (no network attempt at all,
// not even a failed one -- this is CSP, not the bucket's own CORS policy,
// which is a separate, also-required setting made directly in R2).
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            'script-src': ["'self'", "'unsafe-inline'"],
            'style-src': ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://fonts.googleapis.com'],
            'font-src': ["'self'", 'https://unpkg.com', 'https://fonts.gstatic.com', 'data:'],
            'connect-src': ["'self'", 'https://*.r2.cloudflarestorage.com'],
        },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
// Default express.json() caps requests at 100kb — too small for a base64
// logo image or contract PDF (see MAX_LOGO_DATA_URL_LENGTH/
// MAX_CONTRACT_DATA_URL_LENGTH below). A client save can carry both at once,
// and base64 adds ~33% overhead on top of the ~5MB contract cap — 10mb
// leaves real headroom. validateClientBody still enforces the actual caps;
// this just raises the hard ceiling above them.
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// --- CSRF protection (double-submit cookie) ---------------------------------
// Security review, 2026-09-28 (finding #04): sgn_session is SameSite=None in
// production (required for the native app's cross-origin WebView requests),
// which on its own leaves nothing stopping a malicious page from riding an
// authenticated user's session cross-site -- CORS/body-parser only blocked it
// incidentally, not by design.
//
// The usual double-submit fix (client reads the cookie's own value back via
// document.cookie and echoes it in a header) doesn't work here: the native
// app's pages live at the capacitor://localhost origin, but sgn_csrf below is
// set by sgnsystem-production.up.railway.app's own Set-Cookie response to a
// cross-origin fetch -- that cookie lands in the WebView's cookie jar under
// THAT domain, invisible to document.cookie reads made from a
// capacitor://localhost page. So instead: the token is handed to the client
// ONCE, in the login response BODY (see /api/auth/login and the new
// /api/auth/csrf-token below), and the client keeps it in localStorage and
// echoes it back as a header on every mutating request from then on (see
// Dashboard.js and AppConfig.js's own fetch patches) -- it never needs to
// read the cookie back to know its own value. The cookie itself can stay
// httpOnly, since nothing legitimate needs to read it via JS anymore; the
// double-submit property still holds, because only a same-origin (or
// genuinely-authenticated native app) page ever received that value at all.
const CSRF_COOKIE = 'sgn_csrf';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
function issueCsrfCookie(res) {
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'none' : 'lax',
        maxAge: 8 * 60 * 60 * 1000,
    });
    return token;
}
// Only enforced once a session cookie exists -- login/register have nothing
// to forge yet, and a caller with no sgn_session cookie at all (e.g. a
// Bearer-token client, if one is ever added) isn't exposed to CSRF in the
// first place, since forging a header the browser doesn't attach on its own
// is exactly what CSRF can't do.
// CRITICAL FIX, 2026-09-28 (found during local testing right after
// shipping): gating on "does an sgn_session cookie exist" instead of "is the
// caller actually authenticated" was a real self-lockout bug. A cookie can
// be PRESENT but expired/invalid (the normal state 8h after any login, or
// simply a leftover from before this feature existed) -- requireAuth would
// reject it with 401 later, but requireCsrf ran FIRST and, seeing a cookie
// at all, demanded a token nobody logging back in could possibly have yet
// (the only way to get one is to log in successfully, or call
// /api/auth/csrf-token, which itself requires requireAuth to already pass --
// a true deadlock, not just a rough edge). Fix: explicitly exempt the 3 auth
// bootstrap routes by path, the same way login/register were already exempt
// in spirit (no session to forge yet) -- never gate the routes whose entire
// job is to establish or tear down that session in the first place.
const CSRF_EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/register', '/api/auth/logout']);
function requireCsrf(req, res, next) {
    if (CSRF_SAFE_METHODS.has(req.method)) return next();
    if (CSRF_EXEMPT_PATHS.has(req.path)) return next();
    if (req.path.startsWith('/api/public/')) return next(); // vista pública (QR): sin sesión no hay nada que falsificar
    if (!req.cookies?.sgn_session) return next();
    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.headers[CSRF_HEADER];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return res.status(403).json({ message: 'Missing or invalid CSRF token.', code: 'CSRF' });
    }
    next();
}
app.use(requireCsrf);

// --- Static frontend ---------------------------------------------------------
// Only files inside public/ (the desktop site) and mobile-app/www (see just
// below) are ever served to the browser. server.js, db.js, password.js,
// .env, and the database file all live outside both and are never
// web-accessible.
//
// maxAge is intentionally short (1 minute), not the usual long-lived
// "immutable" static-asset cache: none of these filenames are content-hashed
// (Dashboard.js is always Dashboard.js), so a long maxAge would mean a
// deployed fix doesn't show up in an already-open browser tab until it
// expires, no revalidation possible in between. A short maxAge still avoids
// re-fetching everything on every rapid page-to-page navigation within a
// session (the common case), while etag (on by default) handles proper
// revalidation once it expires. Raise this once the UI stabilizes and/or
// filenames get a cache-busting hash.
// Login.html registers this at the root scope, so it controls every
// desktop page on the site, not just the App shell it was originally built
// for -- and its own fetch handler caches same-origin JS/CSS cache-first
// (see sw.js's own comment). Confirmed live (2026-09-15) on
// Admin-ArbolMaestroSaaS.html: a plain reload right after a real deploy
// still served the PREVIOUS deploy's JS from that cache, because
// sw.js on disk hardcodes CACHE_VERSION as a literal that's identical
// across every deploy (mobile-app/'s own CI build sidesteps this by
// sed-stamping a per-build value into ITS bundled copy before packaging --
// see .github/workflows/build-apk.yml -- but nothing did the equivalent for
// the web-served copy, since there's no separate "build" step for the
// site itself). Serving sw.js through this route instead of
// express.static below stamps a value that's unique per RUNNING PROCESS
// (this restarts on every deploy) into the exact same spot, so
// activate()'s own cache-cleanup finally has something to actually delete
// after a deploy, matching what the App has had since that day.
const SW_CACHE_VERSION = `sgn-app-shell-web-${process.env.RAILWAY_DEPLOYMENT_ID || process.env.RAILWAY_GIT_COMMIT_SHA || Date.now()}`;
let swFileCache = null;
app.get('/sw.js', (req, res) => {
    if (!swFileCache) {
        swFileCache = fs.readFileSync(path.join(PUBLIC_DIR, 'sw.js'), 'utf8')
            .replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${SW_CACHE_VERSION}';`);
    }
    // Explicit no-cache -- the client's own registration now also passes
    // { updateViaCache: 'none' } so the browser never relies on its normal
    // HTTP cache to decide whether sw.js changed, but this is a second,
    // independent backstop against any intermediate proxy (Railway's own,
    // or anything else in front of this) caching the response regardless of
    // what the client asked for.
    res.set('Cache-Control', 'no-cache');
    res.type('application/javascript').send(swFileCache);
});

app.use(express.static(PUBLIC_DIR, { maxAge: '1m' }));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'Login.html')));

// The native Android app normally loads mobile-app/www/* bundled locally
// inside the .apk (see the NATIVE_APP_ORIGINS comment above), never from
// here -- this mount exists purely so GEIPSA staff can preview/QA the App's
// own screens (e.g. AppAdminInicio.html) in a plain desktop browser without
// building an APK. Every relative asset/i18n/data fetch those pages make
// resolves fine under this prefix (browsers resolve relative URLs against
// the current document, not the server root), and every /api/... call they
// make is root-relative already, so it hits the real API regardless of
// prefix and shares whatever sgn_session cookie the browser already has
// from logging in at / -- no separate login needed here. Same short
// maxAge as public/, same reasoning. Same stale-cache-version fix as
// /sw.js above, for the same reason -- this browser-tested copy is a real
// fetch over HTTP too, not the native app's own bundled-and-CI-stamped one.
let mobileSwFileCache = null;
app.get('/mobile/sw.js', (req, res) => {
    if (!mobileSwFileCache) {
        mobileSwFileCache = fs.readFileSync(path.join(__dirname, 'mobile-app', 'www', 'sw.js'), 'utf8')
            .replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = '${SW_CACHE_VERSION}';`);
    }
    // Same no-cache backstop as /sw.js above.
    res.set('Cache-Control', 'no-cache');
    res.type('application/javascript').send(mobileSwFileCache);
});
app.use('/mobile', express.static(path.join(__dirname, 'mobile-app', 'www'), { maxAge: '1m' }));

// --- Rate limiting on auth routes -------------------------------------------
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,                  // 10 attempts per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Try again later.' },
});

// Security review, 2026-09-28 (finding #05): loginLimiter above only throttles
// by IP -- an attacker spreading attempts across many IPs isn't slowed down
// at all. This adds a second, independent counter keyed by the USERNAME being
// attacked, so the same account can't be brute-forced regardless of how many
// IPs the attempts come from. In-memory, same single-process assumption
// express-rate-limit's own default store already makes here; resets on
// deploy/restart, which is fine for a throttle, not meant as a permanent ban.
const loginFailuresByUsername = new Map(); // lowercased username -> { count, resetAt }
const LOGIN_USERNAME_MAX_ATTEMPTS = 10;
const LOGIN_USERNAME_WINDOW_MS = 15 * 60 * 1000;
function isUsernameLocked(username) {
    const entry = loginFailuresByUsername.get(username.toLowerCase());
    if (!entry) return false;
    if (Date.now() > entry.resetAt) { loginFailuresByUsername.delete(username.toLowerCase()); return false; }
    return entry.count >= LOGIN_USERNAME_MAX_ATTEMPTS;
}
function recordLoginFailure(username) {
    const key = username.toLowerCase();
    const entry = loginFailuresByUsername.get(key);
    if (!entry || Date.now() > entry.resetAt) {
        loginFailuresByUsername.set(key, { count: 1, resetAt: Date.now() + LOGIN_USERNAME_WINDOW_MS });
    } else {
        entry.count += 1;
    }
}
function clearLoginFailures(username) {
    loginFailuresByUsername.delete(username.toLowerCase());
}

// Same finding #05: /api/auth/register had no rate limit at all -- scrypt is
// deliberately CPU-heavy, so unlimited account creation is a mild CPU-DoS
// vector. Registration is rare for a real user, so this can be much tighter
// than the login limiter.
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,                   // 5 new accounts per IP per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many accounts created from this address. Try again later.' },
});

// Renueva la sesión de cookie con la actividad (ver SESSION_TTL_SECONDS arriba): token nuevo con las mismas reclamaciones, la cookie de sesión y la del token CSRF (el mismo valor,
// para que el navegador no pierda una antes que la otra) con la vida nueva. Un token de Bearer (sin cookie) no se renueva.
function maybeRenewSession(req, res, payload) {
    if (!req.cookies?.sgn_session || !payload.iat) return;
    const now = Math.floor(Date.now() / 1000);
    const startedAt = payload.ses || payload.iat;
    if (now - payload.iat < SESSION_RENEW_AFTER_SECONDS || now - startedAt >= SESSION_MAX_SECONDS) return;
    const ttl = Math.min(SESSION_TTL_SECONDS, SESSION_MAX_SECONDS - (now - startedAt));
    const { iat, exp, ...claims } = payload;
    const options = { httpOnly: true, secure: IS_PROD, sameSite: IS_PROD ? 'none' : 'lax', maxAge: ttl * 1000 };
    res.cookie('sgn_session', jwt.sign({ ...claims, ses: startedAt }, JWT_SECRET, { expiresIn: ttl }), options);
    const csrf = req.cookies?.[CSRF_COOKIE];
    if (csrf) res.cookie(CSRF_COOKIE, csrf, options);
}

// --- Auth middleware (protects any route that follows it) ------------------
function requireAuth(req, res, next) {
    const token = req.cookies?.sgn_session || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'Not authenticated.' });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        // Después de un Reinicio del Sistema, las sesiones anteriores ya no valen (ver system_state en db.js).
        if (payload.iat && payload.iat < getSessionsValidAfter()) return res.status(401).json({ message: 'Invalid or expired session.' });
        // Una cuenta desactivada, borrada o dada de baja pierde la sesión en la siguiente petición, no hasta que venza el token (8 h); y sus privilegios
        // (administrador principal, administrador del cliente, rol) son los de AHORA, no los que tenía al iniciar sesión.
        const session = getSessionState(payload.sub);
        if (session.reason) return res.status(401).json({ message: 'Invalid or expired session.', code: 'ACCOUNT_BLOCKED' });
        req.user = { ...payload, ...session.fresh };
        maybeRenewSession(req, res, payload);
        next();
    } catch {
        return res.status(401).json({ message: 'Invalid or expired session.' });
    }
}

// --- Admin-only guard (SaaS control panel: clients, module entitlements) ---
// Must run after requireAuth so req.user is populated. The role lives in the
// JWT issued at login, so a promotion to admin only takes effect on the
// user's next login (token is valid for up to 8h).
function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required.' });
    }
    next();
}

// --- Client-admin guard (Administración del Negocio: users, roles, access) --
// Only the one auto-provisioned "Admin+ABBR" user for a client (see
// activateClient in db.js) can manage that client's own users/profiles/
// grants — regular staff accounts created by that admin cannot. Every
// /api/business/* route below also scopes its queries to req.user.clientId,
// so one client can never see or touch another's data.
function requireClientAdmin(req, res, next) {
    if (!req.user?.clientId || !req.user?.isClientAdmin) {
        return res.status(403).json({ message: 'Client admin access required.' });
    }
    next();
}

// Toda operación va ligada a un centro de costos: sin al menos uno COMPLETO (ver hasCompleteCostCenter en db.js) no se guarda nada en las pantallas de operación. Las cuentas sin cliente
// (GEIPSA) pasan: esas rutas ya les contestan que no hay cliente.
function requireCostCenter(req, res, next) {
    if (!req.user?.clientId || hasCompleteCostCenter(req.user.clientId, req.user.isTestAccount)) return next();
    res.status(409).json({
        code: 'COST_CENTER_REQUIRED',
        message: 'Primero crea un centro de costos completo en Nuestros Centros Costos: toda operación va ligada a uno.',
    });
}
// De los catálogos de categorías, solo Almacenes cuelga de un centro de costos.
function requireCostCenterForWarehouses(req, res, next) {
    return req.params.categoryType === 'almacenes' ? requireCostCenter(req, res, next) : next();
}
// Cuando el cliente ya tiene su PRIMER centro completo, lo que había capturado sin sitio se liga a él.
function linkOrphansToFirstCostCenter(req) {
    try {
        const ids = listCompleteCostCenterIds(req.user.clientId, req.user.isTestAccount);
        if (ids.length !== 1) return;
        const linked = linkClientDataToFirstCostCenter(req.user.clientId, req.user.isTestAccount, ids[0]);
        if (linked.warehouses || linked.relations || linked.layouts) console.log(`[cost-centers] Cliente ${req.user.clientId}: lo capturado sin sitio quedó ligado a su primer centro de costos (${ids[0]}):`, linked);
    } catch (err) {
        console.error('[cost-centers] No se pudo ligar lo capturado al primer centro de costos:', err);
    }
}

// Un permiso fino del equipo SaaS para una ruta de escritura: el administrador principal (admin_saas) o quien tenga alguna de las hojas dadas de la
// pantalla (itemId) en su árbol de Equipo SaaS. Responde 403 y devuelve true si no. Antes estas rutas solo pedían ser "admin": cualquier cuenta del equipo,
// aunque no tuviera accesos, podía usarlas.
function denySaasLeaf(req, res, itemId, subItemIds, message) {
    const grants = getSaasUserGrants(req.user.sub);
    const list = Array.isArray(subItemIds) ? subItemIds : [subItemIds];
    if (list.some((sub) => hasSaasGrant(grants, itemId, sub, req.user.isSaasSuperAdmin))) return false;
    res.status(403).json({ message: message || 'No tienes permiso para hacer esto.' });
    return true;
}

// Lectura de datos del lado SaaS: el administrador principal, o quien tenga algún acceso de las pantallas dadas (itemIds de su árbol de Equipo SaaS);
// 'any' = cualquiera con al menos un acceso del equipo; [] = solo el administrador principal. Una lista que usan varias pantallas se abre a todas ellas.
// Antes estas rutas solo pedían ser "admin": una cuenta sin accesos podía leer clientes, planes, giros y cuentas del equipo.
function denySaasScreen(req, res, itemIds) {
    if (req.user.isSaasSuperAdmin) return false;
    const grants = getSaasUserGrants(req.user.sub);
    const allowed = itemIds === 'any' ? grants.length > 0 : grants.some((g) => itemIds.includes(g.itemId));
    if (allowed) return false;
    res.status(403).json({ message: 'No tienes permiso para ver esto.' });
    return true;
}

// Una cuenta del equipo que no es el administrador principal no puede darle a otra (ni a sí misma) más de lo que ella tiene: ningún nivel da más de lo que
// le deja el de arriba. grantsAfter son los accesos que se piden; statuses, los Estatus que se piden (si aplica).
function denySaasTeamEscalation(req, res, targetId, { grantsBefore = [], grantsAfter = [], statuses = null } = {}) {
    if (req.user.isSaasSuperAdmin) return false;
    if (Number(targetId) === Number(req.user.sub)) {
        res.status(403).json({ message: 'No puedes cambiar tus propios accesos.' });
        return true;
    }
    const keyOf = (g) => `${g.itemId}::${g.subItemId || ''}`;
    const mine = new Set(getSaasUserGrants(req.user.sub).map(keyOf));
    const had = new Set(grantsBefore.map(keyOf));
    if (grantsAfter.some((g) => !had.has(keyOf(g)) && !mine.has(keyOf(g)))) {
        res.status(403).json({ message: 'No puedes dar un acceso que tú no tienes.' });
        return true;
    }
    if (statuses) {
        const myStatuses = new Set(getUserVisibleStatuses(req.user.sub));
        if (statuses.some((s) => !myStatuses.has(s))) {
            res.status(403).json({ message: 'No puedes dar un Estatus que tú no ves.' });
            return true;
        }
    }
    return false;
}
// Solo el administrador principal cambia la cuenta de otro administrador principal (si no, bastaría restablecerle la contraseña para entrar como él).
function denySuperAdminTarget(req, res, targetId) {
    if (req.user.isSaasSuperAdmin || !isSaasSuperAdminUser(targetId)) return false;
    res.status(403).json({ message: 'Solo el administrador principal puede cambiar esa cuenta.' });
    return true;
}

// --- POST /api/auth/login ----------------------------------------------------
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    if (isUsernameLocked(username)) {
        return res.status(429).json({ message: 'Too many login attempts for this account. Try again later.' });
    }

    const user = findUserByUsername(username);
    // Always run the hash comparison even if the user is missing, using a
    // dummy hash of the same shape, so response time doesn't leak whether
    // the username exists ("timing attack").
    const dummyHash = '00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';
    const passwordMatches = await verifyPassword(password, user?.password_hash || dummyHash);

    if (!user || !passwordMatches) {
        recordLoginFailure(username);
        return res.status(401).json({ message: 'Invalid username or password.' });
    }
    clearLoginFailures(username);
    // Credentials matched, so revealing "inactive" here doesn't leak whether
    // an unknown username exists — the deactivation only ever fires for a
    // client whose status left 'activo' (see activateClient/deactivateClientUsers).
    if (!user.active) {
        return res.status(403).json({ message: 'This account is inactive.' });
    }
    // Estatus Operativo, derived from this user's Estatus RH (see
    // computeOperationalStatus in db.js) — a "suspended" or "inactive" RH
    // status (vacaciones, incapacidad, rescisión de contrato...) blocks
    // login entirely, even though users.active itself may still be 1.
    const operationalStatus = getUserOperationalStatus(user.id);
    if (operationalStatus === 'inactive') {
        return res.status(403).json({ message: 'This account cannot access the system due to a contract termination.', operationalStatus });
    }
    if (operationalStatus === 'suspended') {
        return res.status(403).json({ message: 'This account is temporarily suspended.', operationalStatus });
    }

    const token = jwt.sign(
        {
            sub: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role,
            clientId: user.client_id,
            isClientAdmin: !!user.is_client_admin,
            isTestAccount: !!user.is_test_account,
            isSaasSuperAdmin: !!user.is_saas_super_admin,
            ses: Math.floor(Date.now() / 1000), // cuándo se inició la sesión (tope de 24 h de la sesión deslizante)
        },
        JWT_SECRET,
        { expiresIn: SESSION_TTL_SECONDS }
    );

    res.cookie('sgn_session', token, {
        httpOnly: true,
        secure: IS_PROD,
        // 'none' in production: the native Android app (mobile-app/) bundles
        // its HTML/JS locally instead of loading it from this server, so its
        // requests here are cross-origin (see the CORS block below) and a
        // browser only ever attaches a cookie to a cross-origin request when
        // it's SameSite=None -- 'lax' silently dropped it, which is what
        // made the app look logged out / stuck. Requires secure:true, which
        // IS_PROD already guarantees whenever this branch is taken; dev
        // (plain http, not IS_PROD) is untouched.
        sameSite: IS_PROD ? 'none' : 'lax',
        maxAge: SESSION_TTL_SECONDS * 1000,
    });
    const csrfToken = issueCsrfCookie(res);

    res.json({
        user: { id: user.id, username: user.username, name: user.name, email: user.email },
        csrfToken,
    });
});

// Lets an already-logged-in session (sgn_session cookie still valid) obtain
// a CSRF token without logging in again -- covers sessions that were issued
// before this feature existed, plus any login path other than POST
// /api/auth/login itself. The client's own fetch patch (Dashboard.js /
// AppConfig.js) calls this once, automatically, the first time it hits a 403
// CSRF response with no token cached yet, and retries.
app.get('/api/auth/csrf-token', requireAuth, (req, res) => {
    res.json({ csrfToken: issueCsrfCookie(res) });
});

// --- POST /api/auth/register --------------------------------------------------
app.post('/api/auth/register', registerLimiter, async (req, res) => {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password || password.length < 8) {
        return res.status(400).json({ message: 'All fields are required; password must be at least 8 characters.' });
    }
    if (usernameOrEmailExists(username, email)) {
        return res.status(409).json({ message: 'Username or email already taken.' });
    }

    createUser({ username, email, passwordHash: await hashPassword(password), name: username });

    res.status(201).json({ message: 'Account created.' });
});

// --- POST /api/auth/logout ----------------------------------------------------
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('sgn_session');
    res.clearCookie(CSRF_COOKIE);
    res.json({ message: 'Logged out.' });
});

// --- Example protected route --------------------------------------------------
app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
});

// Top-bar "Datos de Usuario" / "Datos Personales" panel — always the
// caller's own profile (req.user.sub comes from their verified session
// token), read fresh from the DB rather than the JWT so edits made
// elsewhere show up without waiting for the token to expire.
app.get('/api/me/profile', requireAuth, (req, res) => {
    const profile = getUserProfileById(req.user.sub);
    if (!profile) return res.status(404).json({ message: 'User not found.' });
    res.json({ profile });
});

// Top-bar "Datos de Usuario del Negocio" panel — same "always the caller's
// own, read fresh" reasoning as /api/me/profile above.
app.get('/api/me/business-profile', requireAuth, (req, res) => {
    const profile = getUserBusinessProfileById(req.user.sub);
    if (!profile) return res.status(404).json({ message: 'User not found.' });
    // Las columnas que el árbol conoce en cada tabla: la tabla solo revisa los permisos de Opciones de Búsqueda de esas (ver hasColumnSearchGrant en Dashboard.js).
    profile.searchGatedColumns = getSearchGatedColumns();
    res.json({ profile });
});

// Default Departamento/Área/Centro de Costos, applied by Dashboard.js right
// after a fresh login (see applyLoginDefaults there) — set from
// "Configuración de Botones" > Botón Departamento/Área/C. Costos.
app.get('/api/me/defaults', requireAuth, (req, res) => {
    res.json({ defaults: getUserDefaults(req.user.sub) });
});

app.put('/api/me/defaults', requireAuth, (req, res) => {
    const { department, area, costCenters } = req.body || {};
    if (department !== undefined && department !== null && typeof department !== 'string') {
        return res.status(400).json({ message: 'department must be a string or null.' });
    }
    if (area !== undefined && area !== null && typeof area !== 'string') {
        return res.status(400).json({ message: 'area must be a string or null.' });
    }
    if (costCenters !== undefined && costCenters !== null && costCenters !== 'all' && !Array.isArray(costCenters)) {
        return res.status(400).json({ message: "costCenters must be 'all', null, or an array." });
    }
    res.json({ defaults: setUserDefaults(req.user.sub, { department, area, costCenters }) });
});

// System-wide UI scale ("aumentar/disminuir el tamaño de todo el sistema",
// top-bar control) — per account like the defaults above, not localStorage,
// so it never leaks between different users on a shared browser/computer.
const UI_SCALE_MIN = 1;
const UI_SCALE_MAX = 8;

app.get('/api/me/ui-scale', requireAuth, (req, res) => {
    res.json({ scale: getUserUiScale(req.user.sub) });
});

app.put('/api/me/ui-scale', requireAuth, (req, res) => {
    const { scale } = req.body || {};
    if (!Number.isInteger(scale) || scale < UI_SCALE_MIN || scale > UI_SCALE_MAX) {
        return res.status(400).json({ message: `scale must be an integer between ${UI_SCALE_MIN} and ${UI_SCALE_MAX}.` });
    }
    res.json({ scale: setUserUiScale(req.user.sub, scale) });
});

// --- SaaS admin: clients + per-client module entitlements ("Contrataciones") -
// Every route below requires an authenticated admin (requireAuth first so
// req.user exists, then requireAdmin checks the role in that token).
const CLIENT_STATUSES = ['activo', 'inactivo', 'prospecto'];
const MAX_LOGO_DATA_URL_LENGTH = 500 * 1024; // ~350KB image once base64-decoded
const MAX_CONTRACT_DATA_URL_LENGTH = 7 * 1024 * 1024; // ~5MB PDF once base64-decoded
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PALETTE_KEYS = ['bg', 'surface', 'border', 'textPrimary', 'textSecondary', 'accent', 'accentText', 'tooltipBg', 'tooltipText'];

function validateLogo(logoDataUrl) {
    if (!logoDataUrl) return null;
    if (typeof logoDataUrl !== 'string' || !logoDataUrl.startsWith('data:image/')) {
        return 'logoDataUrl must be an image data URL.';
    }
    if (logoDataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
        return 'Logo image is too large (max ~350KB).';
    }
    return null;
}

// Contrato: stored the same way as the logo (a data: URL in the same row),
// just a bigger size cap (real PDFs, not small branding images) and a
// different accepted MIME.
function validateContractFile(contractFileDataUrl) {
    if (!contractFileDataUrl) return null;
    if (typeof contractFileDataUrl !== 'string' || !contractFileDataUrl.startsWith('data:application/pdf')) {
        return 'contractFileDataUrl must be a PDF data URL.';
    }
    if (contractFileDataUrl.length > MAX_CONTRACT_DATA_URL_LENGTH) {
        return 'Contract file is too large (max ~5MB).';
    }
    return null;
}

// Segundo documento de contrato (editable, Word) junto al PDF firmado —
// mismo tope de tamaño, MIME de .doc o .docx.
const CONTRACT_WORD_MIME_PREFIXES = [
    'data:application/msword',
    'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
function validateContractWordFile(contractWordDataUrl) {
    if (!contractWordDataUrl) return null;
    if (typeof contractWordDataUrl !== 'string' || !CONTRACT_WORD_MIME_PREFIXES.some((p) => contractWordDataUrl.startsWith(p))) {
        return 'contractWordDataUrl must be a Word document data URL.';
    }
    if (contractWordDataUrl.length > MAX_CONTRACT_DATA_URL_LENGTH) {
        return 'Contract Word file is too large (max ~5MB).';
    }
    return null;
}

// RFC es opcional (un prospecto sin RFC aún es válido), pero si SÍ se
// escribe algo debe medir exactamente 13 caracteres — el mensaje es el que
// el usuario pidió mostrar tal cual.
function validateRfc(rfc) {
    if (!rfc) return null;
    if (typeof rfc !== 'string' || rfc.trim().length !== 13) {
        return 'La cantidad de caracteres no corresponden a un RFC';
    }
    return null;
}

function validateCompanyAbbreviation(companyAbbreviation) {
    if (!companyAbbreviation) return null;
    if (typeof companyAbbreviation !== 'string' || companyAbbreviation.length > 6) {
        return 'companyAbbreviation must be at most 6 characters.';
    }
    return null;
}

function validateOptionalDate(value, fieldName) {
    if (!value) return null;
    if (typeof value !== 'string' || !DATE_RE.test(value)) {
        return `${fieldName} must be a date in YYYY-MM-DD format.`;
    }
    return null;
}

function validateOptionalMoney(value, fieldName) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
        return `${fieldName} must be a number >= 0.`;
    }
    return null;
}

function validateSeedColor(seedColor) {
    if (seedColor && !HEX_COLOR_RE.test(seedColor)) {
        return 'seedColor must be a hex color like #1a73e8.';
    }
    return null;
}

function validateColorPalette(colorPalette) {
    if (colorPalette == null) return null;
    if (typeof colorPalette !== 'object' || Array.isArray(colorPalette)) {
        return 'colorPalette must be an object.';
    }
    for (const [key, value] of Object.entries(colorPalette)) {
        if (!PALETTE_KEYS.includes(key)) return `colorPalette has an unknown key: ${key}.`;
        if (!HEX_COLOR_RE.test(value)) return `colorPalette.${key} must be a hex color like #1a73e8.`;
    }
    return null;
}

function validateClientBody(body) {
    const {
        companyName, contactName, email, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette,
        billingEmail, contractStartDate, contractRegisteredDate, contractEndDate, contractFileDataUrl, contractWordDataUrl,
        rfc, companyAbbreviation, monthlyPayment, initialPayment, timeZone,
    } = body || {};
    if (!companyName || !contactName || !email) {
        return 'companyName, contactName and email are required.';
    }
    if (timeZone !== undefined && timeZone !== null && timeZone !== '' && !isValidTimeZone(timeZone)) {
        return 'timeZone must be a valid time zone name like America/Mexico_City.';
    }
    if (status && !CLIENT_STATUSES.includes(status)) {
        return `status must be one of: ${CLIENT_STATUSES.join(', ')}.`;
    }
    if (primaryColor && !HEX_COLOR_RE.test(primaryColor)) {
        return 'primaryColor must be a hex color like #1a73e8.';
    }
    if (secondaryColor && !HEX_COLOR_RE.test(secondaryColor)) {
        return 'secondaryColor must be a hex color like #1a73e8.';
    }
    if (billingEmail && !/^\S+@\S+\.\S+$/.test(billingEmail)) {
        return 'billingEmail must be a valid email address.';
    }
    return validateLogo(logoDataUrl) || validateSeedColor(seedColor) || validateColorPalette(colorPalette)
        || validateContractFile(contractFileDataUrl)
        || validateContractWordFile(contractWordDataUrl)
        || validateRfc(rfc)
        || validateCompanyAbbreviation(companyAbbreviation)
        || validateOptionalDate(contractStartDate, 'contractStartDate')
        || validateOptionalDate(contractRegisteredDate, 'contractRegisteredDate')
        || validateOptionalDate(contractEndDate, 'contractEndDate')
        || validateOptionalMoney(monthlyPayment, 'monthlyPayment')
        || validateOptionalMoney(initialPayment, 'initialPayment');
}

app.get('/api/admin/modules', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients'])) return;
    res.json({ modules: MODULE_CATALOG });
});

// Costo Contratado/Pago por Adicionales ya no se guardan a mano — se
// calculan en vivo contra el plan asignado + los adicionales vendidos a
// ESTE cliente (client_permission_grants), cada vez que se pide la lista.
// Un cliente sin plan (o con un plan que ya no existe) da todo en 0, nunca
// truena.
app.get('/api/admin/clients', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients','saas-material-apoyo','saas-backups'])) return;
    const clients = listClients().map((client) => {
        const plan = client.plan ? getPlanByName(client.plan) : null;
        const planAccessPermissionsCost = plan ? computeAccessCostTotal(plan.id) : 0;
        const planCostCentersLimit = plan ? plan.costCentersLimit : 0;
        const planCostPerCostCenter = plan ? plan.costPerCostCenter : 0;
        const planCurrency = plan ? plan.currency : 'MXN';
        const additionalCostCentersPayment = (client.extra_cost_centers || 0) * planCostPerCostCenter;
        const additionalPermissionsPayment = plan ? computeClientAdditionalPermissionsCost(client.id) : 0;
        return {
            ...client,
            costCentersUsed: countCostCenters(client.id),
            planAccessPermissionsCost,
            planCostCentersLimit,
            planCostPerCostCenter,
            planCurrency,
            contractedCostComputed: planAccessPermissionsCost + (planCostCentersLimit * planCostPerCostCenter),
            additionalCostCentersPayment,
            additionalPermissionsPayment,
            additionalsPaymentTotal: additionalCostCentersPayment + additionalPermissionsPayment,
            ...getSystemColumnsForRecord({
                companyName: client.company_name, area: '', modulo: 'Administración del Negocio', pantalla: 'Nuestros Clientes',
                centroCostos: '', createdAt: client.created_at, timeZone: SAAS_TIME_ZONE,
            }),
        };
    });
    res.json({ clients });
});

function adminCredentialsEmailBody(client, username, password) {
    return `Se creó tu cuenta de administrador en SGN para ${client.company_name}.\n\n`
        + `Usuario: ${username}\nContraseña: ${password}\n\n`
        + 'Guarda esta contraseña en un lugar seguro — no se puede recuperar después de este correo.';
}

// Runs after every create/update: 'activo' provisions (or reactivates) the
// client's admin user and their whole team; anything else locks all of them
// out. Returns { username, password, emailSent, emailTo } only the one time
// a NEW admin user is created — that's the only chance to hand the password
// to anyone, since it's never stored anywhere in recoverable form. Also
// tries emailing it to the client's own registered contact address
// (client.email) right away; emailSent tells the frontend whether to lead
// with "ya se envió" or fall back to showing the password prominently.
async function applyClientLifecycle(client) {
    if (client.status === 'activo') {
        const { user, generatedPassword } = await activateClient(client.id);
        const training = await provisionTrainingAccount(client.id);
        let generatedAdmin = null;
        if (generatedPassword) {
            const emailSent = await sendMail({
                to: client.email,
                subject: `Acceso a SGN — ${client.company_name}`,
                text: adminCredentialsEmailBody(client, user.username, generatedPassword),
            });
            generatedAdmin = { clientId: client.id, username: user.username, password: generatedPassword, emailSent, emailTo: client.email };
        }
        const generatedTrainingAccount = training.generatedPassword
            ? { username: training.user.username, password: training.generatedPassword }
            : null;
        return { generatedAdmin, generatedTrainingAccount };
    }
    deactivateClientUsers(client.id);
    return { generatedAdmin: null, generatedTrainingAccount: null };
}

// "Reiniciar Capacitación" -- manual, GEIPSA-triggered (confirmed with the
// user, 2026-09-30: training data was never going to expire on its own, no
// automatic cadence). Wipes this client's training account's own practice
// records back to empty; the account's login itself is untouched, so nobody
// needs a new username/password after this.
app.post('/api/admin/clients/:id/reset-training', requireAuth, requireAdmin, (req, res) => {
    if (denySaasLeaf(req, res, 'saas-clients', ['tabla::ta5','tabla::ta2'], 'No tienes permiso para reiniciar la cuenta de capacitación.')) return;
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    if (!client.training_user_id) return res.status(400).json({ message: 'This client has no training account yet.' });
    try {
        resetTrainingAccountData(req.params.id);
        logClientChange({ clientId: client.id, recordLabel: client.company_name, action: 'update', fieldKey: 'admin.resetTrainingTitle', changedBy: changedByLabel(req) });
        res.json({ ok: true });
    } catch {
        res.status(500).json({ message: 'Reset failed.' });
    }
});

// A plan's módulos + centros de costo limit (set in Planes y Paquetes) get
// stamped onto the client's own real access every time a client is saved
// with that plan selected — a full replace across MODULE_CATALOG (not just
// enabling the plan's modules), so switching plans also turns off whatever
// the previous plan had on. Then extra_modules/extra_cost_centers (still
// stored via getClientAddenda/setClientAddenda — extraCostCenters is edited
// from the main client PATCH now, extraModules only ever changes via
// syncClientModulesFromPermissionGrants, see the permission-grants routes
// below) are merged in on top, so re-stamping a plan never wipes those out,
// and they never have to be re-entered just because the client's base plan
// was edited or reassigned. No-op on the plan side if the client has none
// selected, or the name doesn't match a real plan (free-text edge case).
function applyEffectiveEntitlements(clientId) {
    const client = getClientById(clientId);
    if (!client) return;
    const plan = client.plan ? getPlanByName(client.plan) : null;
    const baseModules = plan ? plan.modules : [];
    const baseCostCenters = plan ? plan.costCentersLimit : 0;
    const addenda = getClientAddenda(clientId);
    const moduleStates = MODULE_CATALOG.map((m) => ({
        key: m.key,
        enabled: baseModules.includes(m.key) || addenda.extraModules.includes(m.key),
    }));
    setClientModules(clientId, moduleStates);
    setClientCostCentersLimit(clientId, baseCostCenters + addenda.extraCostCenters);
}

// Una vez al arrancar: un cliente con adicionales guardados antes de que un adicional abriera su departamento con uno solo asignado no tenía el
// departamento abierto. Solo agrega (nunca quita) y no hace nada si ya está todo abierto, así que repetirlo en cada arranque no cambia nada.
try {
    listClients().forEach((c) => { if (syncClientModulesFromPermissionGrants(c.id)) applyEffectiveEntitlements(c.id); });
} catch (err) {
    console.error('[accesos] no se pudieron abrir los departamentos de los adicionales guardados:', err.message);
}

// Extracts every field createClient/updateClient know how to persist, in one
// place, so the create and update routes below (and any future one) can't
// drift out of sync with each other on which fields get passed through.
function extractClientFields(body) {
    const {
        companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette,
        mission, vision, coreValues, history,
        rfc, companyNickname, companyAbbreviation, ownerName, billingEmail, razonSocial,
        contractStartDate, contractRegisteredDate, contractEndDate, contractFileDataUrl, contractFileName,
        contractWordDataUrl, contractWordFileName,
        monthlyPayment, initialPayment, sectorNegocio, isTest, equipmentRecommendations, timeZone,
    } = body;
    return {
        companyName, contactName, email, phone, plan, status, logoDataUrl, primaryColor, secondaryColor, seedColor, colorPalette,
        mission, vision, coreValues, history,
        rfc, companyNickname, companyAbbreviation, ownerName, billingEmail, razonSocial,
        contractStartDate, contractRegisteredDate, contractEndDate, contractFileDataUrl, contractFileName,
        contractWordDataUrl, contractWordFileName,
        // contracted_cost ya no viene de la UI (ver validateClientBody) —
        // updateClient hace COALESCE(@contractedCost, contracted_cost), así
        // que mandar null aquí congela el valor histórico en vez de
        // ponerlo en 0 en cada guardado futuro.
        contractedCost: null, monthlyPayment, initialPayment, sectorNegocio, isTest, equipmentRecommendations, timeZone,
    };
}

// A client's Sector de Negocio is the client's own real-world business
// sector, picked from the Nuestras Sectores de Negocio catalog — same
// source Nuestras APPs' own Sector field already uses. It's independent of
// whether an App happens to exist for that sector yet (getClientAppScreens
// simply returns nothing until GEIPSA builds one); blank is always fine.
function validateSectorNegocio(sectorNegocio) {
    if (!sectorNegocio) return null;
    if (!listBusinessSectors().some((s) => s.name === sectorNegocio)) {
        return 'El Sector de Negocio elegido no existe en el catálogo.';
    }
    return null;
}

// Un plan solo se puede asignar a un cliente si existe, está Activo (no en Revisión ni inactivo) y es del giro del cliente (el giro del plan debe
// ser el mismo que el Sector de Negocio del cliente, si el cliente ya tiene uno). Lo mismo al reactivar un cliente con plan. Solo valida lo que
// CAMBIA en este guardado: un cliente viejo con un plan fuera de regla puede seguir guardando otros campos. Devuelve el mensaje o null.
function validateClientPlanAssignment(body, existing) {
    const asText = (v) => String(v || '');
    const planName = body.plan !== undefined ? asText(body.plan) : asText(existing && existing.plan);
    if (!planName) return null;
    const planChanged = body.plan !== undefined && asText(body.plan) !== asText(existing && existing.plan);
    const sectorName = body.sectorNegocio !== undefined ? asText(body.sectorNegocio) : asText(existing && existing.sector_negocio);
    const sectorChanged = body.sectorNegocio !== undefined && asText(body.sectorNegocio) !== asText(existing && existing.sector_negocio);
    const reactivated = body.status === 'activo' && (!existing || existing.status !== 'activo');
    if (!planChanged && !sectorChanged && !reactivated) return null;
    const plan = getPlanByName(planName);
    if (!plan) return 'El plan elegido no existe.';
    if (plan.status !== 'active' && (planChanged || reactivated)) {
        return 'El plan elegido todavía no está activo. Actívalo primero en Nuestros Planes.';
    }
    if (sectorName && plan.businessSectorId) {
        const planSector = getBusinessSectorById(plan.businessSectorId);
        if (planSector && planSector.name !== sectorName) {
            return `El plan «${plan.name}» es del giro «${planSector.name}» y el cliente es del giro «${sectorName}»: no se puede asignar.`;
        }
    }
    return null;
}

// Historial de cambios de Nuestros Clientes (tabla client_changes): qué campo
// del registro cambió, de qué a qué y quién. field_key es la clave de i18n del
// nombre de la columna, así el diálogo lo muestra en el idioma de quien lo abre.
const CLIENT_TRACKED_FIELDS = {
    company_name: 'admin.companyName', rfc: 'admin.rfc', razon_social: 'admin.razonSocial',
    company_nickname: 'admin.companyNickname', company_abbreviation: 'admin.companyAbbreviation',
    owner_name: 'admin.ownerName', contact_name: 'admin.contactName', email: 'admin.email', phone: 'admin.phone',
    billing_email: 'admin.billingEmail', contract_start_date: 'admin.contractStartDate',
    contract_registered_date: 'admin.contractRegisteredDate', contract_end_date: 'admin.contractEndDate',
    contract_file_name: 'admin.contractFile', contract_word_file_name: 'admin.contractWordFile',
    plan: 'admin.plan', sector_negocio: 'menu.appSector', equipment_recommendations: 'admin.equipmentRecommendations',
    initial_payment: 'admin.initialPayment', monthly_payment: 'admin.monthlyPayment', status: 'admin.status',
    app_enabled: 'admin.clientAppEnabled', time_zone: 'admin.timeZone',
};
function logClientFieldChanges(req, before, after) {
    const label = after.company_name || before.company_name || '';
    Object.entries(CLIENT_TRACKED_FIELDS).forEach(([column, fieldKey]) => {
        const show = (v) => (column === 'app_enabled' ? (v ? 'Sí' : 'No') : (v ?? ''));
        const oldValue = show(before[column]);
        const newValue = show(after[column]);
        if (String(oldValue) === String(newValue)) return;
        logClientChange({ clientId: after.id, recordLabel: label, action: 'update', fieldKey, oldValue, newValue, changedBy: changedByLabel(req) });
    });
}

// Historial de la tabla completa (icono de la barra) -- declarada antes de las
// rutas con :id para que "changes" no se lea como un id.
app.get('/api/admin/clients/changes', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients'])) return;
    res.json({ changes: getAllClientChanges() });
});

app.get('/api/admin/clients/:id/changes', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients'])) return;
    res.json({ changes: getClientChanges(req.params.id) });
});

app.post('/api/admin/clients', requireAuth, requireAdmin, async (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-clients', 'tabla::a0', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para crear clientes.' });
    }
    const error = validateClientBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const sectorError = validateSectorNegocio(req.body.sectorNegocio);
    if (sectorError) return res.status(400).json({ message: sectorError });
    const planError = validateClientPlanAssignment(req.body, null);
    if (planError) return res.status(400).json({ message: planError });
    const rfc = (req.body.rfc || '').trim();
    if (rfc && findClientByRfc(rfc)) {
        return res.status(409).json({ message: 'A client with that RFC already exists.' });
    }
    const client = createClient(extractClientFields(req.body));
    logClientChange({ clientId: client.id, recordLabel: client.company_name, action: 'create', changedBy: changedByLabel(req) });
    applyEffectiveEntitlements(client.id);
    const { generatedAdmin, generatedTrainingAccount } = await applyClientLifecycle(client);
    res.status(201).json({ client: getClientById(client.id), generatedAdmin, generatedTrainingAccount });
});

app.patch('/api/admin/clients/:id', requireAuth, requireAdmin, async (req, res) => {
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    // Editar and Activar/Desactivar are independent Equipo SaaS leaves — an
    // admin holding only one of them can still save this same form as long
    // as what they're actually changing matches what they hold: any
    // non-status field needs Editar, an actual status flip additionally (or
    // solely) needs Activar. Both apply when a save touches both at once.
    const grants = getSaasUserGrants(req.user.sub);
    const changesStatus = req.body?.status !== undefined && req.body.status !== existing.status;
    const changesOtherFields = Object.keys(req.body || {}).some((k) => k !== 'status');
    if (changesOtherFields && !hasSaasGrant(grants, 'saas-clients', 'tabla::ta2', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para editar clientes.' });
    }
    if (changesStatus && !hasSaasGrant(grants, 'saas-clients', 'tabla::ta3', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para activar/desactivar clientes.' });
    }
    const error = validateClientBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const sectorError = validateSectorNegocio(req.body.sectorNegocio);
    if (sectorError) return res.status(400).json({ message: sectorError });
    const planError = validateClientPlanAssignment(req.body, existing);
    if (planError) return res.status(400).json({ message: planError });
    const rfc = (req.body.rfc || '').trim();
    if (rfc && findClientByRfc(rfc, existing.id)) {
        return res.status(409).json({ message: 'A client with that RFC already exists.' });
    }
    // extraCostCenters used to live only in the Anexos modal (now removed —
    // see the permission-grants routes below); it's just a plain field on
    // the main client save now. extraModules is preserved as-is since there
    // is no remaining UI to edit it directly (it's only ever touched by
    // syncClientModulesFromPermissionGrants).
    const { extraCostCenters } = req.body || {};
    if (extraCostCenters !== undefined && (!Number.isInteger(extraCostCenters) || extraCostCenters < 0)) {
        return res.status(400).json({ message: 'extraCostCenters must be a non-negative integer.' });
    }
    // updateClient no tolera un status ausente (la columna es NOT NULL): un guardado parcial tumbaba el servidor entero. Sin status, se queda el que tiene.
    const clientFields = extractClientFields(req.body);
    if (clientFields.status === undefined) clientFields.status = existing.status;
    const client = updateClient(req.params.id, clientFields);
    logClientFieldChanges(req, existing, client);
    if (extraCostCenters !== undefined) {
        setClientAddenda(req.params.id, { extraCostCenters, extraModules: getClientAddenda(req.params.id).extraModules });
    }
    applyEffectiveEntitlements(client.id);
    const { generatedAdmin, generatedTrainingAccount } = await applyClientLifecycle(client);
    res.json({ client: getClientById(client.id), generatedAdmin, generatedTrainingAccount });
});

// "Reenviar correo" on the one-time generated-admin panel -- the password
// is never stored anywhere recoverable (see applyClientLifecycle's own
// comment), so this only ever resends the SAME username/password the
// browser already has in memory from that original response; it can't
// look one up server-side. Stops being usable the moment that panel is
// dismissed or the page reloads, same "shown once" lifetime as the
// password itself.
app.post('/api/admin/clients/:id/resend-admin-email', requireAuth, requireAdmin, async (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-clients', 'tabla::ta3', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para activar/desactivar clientes.' });
    }
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ message: 'username and password are required.' });
    const emailSent = await sendMail({
        to: client.email,
        subject: `Acceso a SGN — ${client.company_name}`,
        text: adminCredentialsEmailBody(client, username, password),
    });
    res.json({ emailSent, emailTo: client.email });
});

// Independent on/off switch for whether this client can use the mobile App
// at all (separate from Editar — the Acciones icon in Nuestros Clientes),
// same 'saas-clients'/'editar' grant as the rest of the record.
app.patch('/api/admin/clients/:id/app-enabled', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-clients', 'tabla::ta2', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para editar clientes.' });
    }
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    const client = setClientAppEnabled(req.params.id, !!req.body?.enabled);
    logClientFieldChanges(req, existing, client);
    res.json({ client });
});

// A real client can only ever be Edited or Activado/Desactivado (see PATCH
// above, status field) — once it's on file it stays on file, same reasoning
// as ever (no one should casually delete a paying customer's whole account).
// This ONE route breaks that rule on purpose, for a TEST client only: type-
// the-company-name confirm client-side (Admin-SaaS.js) plus its own narrow
// 'reset' Equipo SaaS grant (separate from 'editar'/'activar' — nobody gets
// this just by having the other two), so it's not something a normal
// Activar/Editar grant accidentally opens up.
app.post('/api/admin/clients/:id/reset', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-clients', 'tabla::ta5', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para reiniciar clientes.' });
    }
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    if (req.body?.companyName !== existing.company_name) {
        return res.status(400).json({ message: 'El nombre de la empresa no coincide.' });
    }
    logClientChange({ clientId: existing.id, recordLabel: existing.company_name, action: 'delete', changedBy: changedByLabel(req) });
    deleteClientCompletely(req.params.id);
    res.status(204).end();
});

app.get('/api/admin/clients/:id/modules', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients'])) return;
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    res.json({ modules: getClientModules(req.params.id), costCentersLimit: existing.cost_centers_limit });
});

// Read-only, for the "Accesos del Administrador" and Contrataciones-adjacent
// tree in Admin-SaaS — GEIPSA has no clientId of its own, so it needs a
// client-scoped route (unlike /api/business/cost-centers, which relies on
// the caller's own session clientId).
app.get('/api/admin/clients/:id/cost-centers', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients'])) return;
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    res.json({ costCenters: listCostCenters(req.params.id) });
});

app.put('/api/admin/clients/:id/modules', requireAuth, requireAdmin, (req, res) => {
    if (denySaasLeaf(req, res, 'saas-clients', ['tabla::ta2'], 'No tienes permiso para editar clientes.')) return;
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    const { modules, costCentersLimit } = req.body || {};
    if (!Array.isArray(modules)) {
        return res.status(400).json({ message: 'modules must be an array of { key, enabled }.' });
    }
    if (costCentersLimit !== undefined && (!Number.isInteger(costCentersLimit) || costCentersLimit < 0)) {
        return res.status(400).json({ message: 'costCentersLimit must be a non-negative integer.' });
    }
    const updatedModules = setClientModules(req.params.id, modules);
    const updatedLimit = costCentersLimit !== undefined
        ? setClientCostCentersLimit(req.params.id, costCentersLimit)
        : existing.cost_centers_limit;
    res.json({ modules: updatedModules, costCentersLimit: updatedLimit });
});

// Read-only support views: lets GEIPSA see a client's own team (Business-
// Usuarios list, minus the auto-provisioned admin) and one user's actual
// access (their Puesto's default grants + extra grants + the effective
// union of both) without needing that client's own login — useful for
// diagnosing "I granted everything but the buttons still don't show" style
// reports.
app.get('/api/admin/clients/:id/business-users', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients'])) return;
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    res.json({ users: listBusinessUsers(req.params.id) });
});

app.get('/api/admin/clients/:id/business-users/:userId/access', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients'])) return;
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const user = getUserById(req.params.userId, req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({
        jobPositionGrants: getUserJobPositionGrants(req.params.userId),
        extraGrants: getUserGrants(req.params.userId),
        effectiveGrants: getUserEffectiveGrants(req.params.userId),
    });
});

// Accesos del Administrador: the auto-provisioned client admin sees every
// módulo/apartado/pantalla the client has contracted by default (no grants
// needed) — this only exists for GEIPSA to explicitly RESTRICT that default
// down to a specific set, same grant shape as a normal user's extra grants
// (reuses user_grants via getUserGrants/setUserGrants), just reachable only
// from here. An empty grants array here means "no override" — Dashboard.js
// treats that as full access to whatever's contracted, not "nothing".
app.get('/api/admin/clients/:id/admin-access', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients'])) return;
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    if (!client.admin_user_id) return res.status(404).json({ message: 'This client has no admin user yet.' });
    res.json({ grants: getUserGrants(client.admin_user_id) });
});

app.put('/api/admin/clients/:id/admin-access', requireAuth, requireAdmin, (req, res) => {
    if (denySaasLeaf(req, res, 'saas-clients', ['tabla::ta0','tabla::ta2'], 'No tienes permiso para cambiar el acceso del administrador.')) return;
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    if (!client.admin_user_id) return res.status(404).json({ message: 'This client has no admin user yet.' });
    const { grants } = req.body || {};
    const error = validateGrants(grants);
    if (error) return res.status(400).json({ message: error });
    const adminGrantsBefore = getUserGrants(client.admin_user_id);
    if (rejectUncontractedNewGrants(res, client.id, adminGrantsBefore, grants)) return;
    const limited = clampNewGrantsToLimits({ clientId: client.id, visibleStatuses: getUserVisibleStatuses(client.admin_user_id), before: adminGrantsBefore, after: grants });
    res.json({ grants: setUserGrants(client.admin_user_id, limited.allowed), dropped: summarizeDroppedGrants(limited.dropped) });
});

// Permisos Contratados / + Adicionales: árbol completo (hasta Columna) de
// lo vendido a ESTE cliente por encima de lo que su plan ya incluye — ver
// client_permission_grants en db.js. GET también regresa los grants del
// plan del cliente para que el árbol pinte verde (plan) / amarillo
// (adicional) / rojo (no contratado) del lado del navegador.
app.get('/api/admin/clients/:id/permission-grants', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients'])) return;
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const plan = client.plan ? getPlanByName(client.plan) : null;
    res.json({
        grants: getClientPermissionGrants(req.params.id),
        planGrants: plan ? getPlanGrants(plan.id) : [],
        planId: plan ? plan.id : null,
        // Lo que existe en el giro del plan (null si no hay plan o giro): lo usa "Accesos del Administrador" para mostrar, bloqueado,
        // lo del giro que el cliente no contrató.
        giroGrants: plan && plan.businessSectorId ? getSectorGrants(plan.businessSectorId) : null,
    });
});

// Solo acepta tuplas que el plan del cliente TODAVÍA no cubre — rechazado
// del lado servidor (no solo escondido en el árbol), para que un
// "+adicional" nunca pueda duplicar (y cobrar dos veces) algo que el plan
// ya incluye. Al guardar, abre (client_modules) el departamento/botón que
// tenga algún adicional asignado, como ya hacen los planes — nunca al revés
// (ver syncClientModulesFromPermissionGrants en db.js). Lo que ve el
// administrador del cliente DENTRO del departamento lo decide lo asignado
// (plan + adicionales), no el departamento completo.
app.put('/api/admin/clients/:id/permission-grants', requireAuth, requireAdmin, (req, res) => {
    if (denySaasLeaf(req, res, 'saas-clients', ['tabla::ta1','modal-permisos::a1'], 'No tienes permiso para dar permisos adicionales.')) return;
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const { grants } = req.body || {};
    const error = validateGrants(grants);
    if (error) return res.status(400).json({ message: error });
    const plan = client.plan ? getPlanByName(client.plan) : null;
    const planGrants = plan ? getPlanGrants(plan.id) : [];
    for (const g of grants) {
        if (isTupleGranted(planGrants, g.sectionId, g.itemId, g.submenuId)) {
            return res.status(400).json({ message: 'Ese permiso ya está incluido en el plan del cliente.' });
        }
    }
    // Lo que no está habilitado para servicio en el Árbol Maestro no se puede asignar al cliente (lo nuevo; lo que ya estaba guardado se queda). El árbol ya lo muestra con aviso; esto es por si llega de otro lado.
    const serviceKey = (g) => `${g.sectionId}::${g.itemId || ''}::${g.submenuId || ''}`;
    const alreadySaved = new Set(getClientPermissionGrants(req.params.id).map(serviceKey));
    const serviceOverrides = buildMasterStatusOverrideMap(getMasterPermissionStatuses().filter((r) => r.status !== 'habilitado'));
    for (const g of grants) {
        if (alreadySaved.has(serviceKey(g))) continue;
        const status = resolveMasterNodeStatus(g.sectionId, g.itemId, String(g.submenuId || '').replace(/#app$/, '') || null, serviceOverrides);
        if (status !== 'habilitado') {
            return res.status(400).json({ code: 'service-not-enabled', status, sectionId: g.sectionId, itemId: g.itemId || null, submenuId: g.submenuId || null, message: `Este acceso no está habilitado para servicio (Estatus: ${status}) y no se puede asignar al cliente hasta que el Árbol Maestro lo habilite.` });
        }
    }
    const saved = setClientPermissionGrants(req.params.id, grants, changedByLabel(req));
    if (syncClientModulesFromPermissionGrants(req.params.id)) {
        applyEffectiveEntitlements(req.params.id);
    }
    res.json({ grants: saved, additionalPermissionsPayment: computeClientAdditionalPermissionsCost(req.params.id) });
});

// Per-node "Cambios" for the tree above -- see client_permission_change_log's
// own DDL comment. Scoped to this same client (the tuple {clientId, nodeKey}
// is what setClientPermissionGrants logged against), so one client can never
// see another's grant history even by guessing a nodeKey.
app.get('/api/admin/client-permission-change-log', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients'])) return;
    const { clientId, nodeKey } = req.query || {};
    if (!clientId || !nodeKey) return res.status(400).json({ message: 'clientId and nodeKey are required.' });
    res.json({ entries: getClientPermissionChangeLog(clientId, nodeKey) });
});

// Cambios de Anexos: read-only history for the modal that shows who
// requested each anexo change and when — kept for the record of anexos
// granted the old (flat, whole-module) way; the new permission-grants
// route above doesn't write to this log (see its own comment).
app.get('/api/admin/clients/:id/anexo-changes', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients'])) return;
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    res.json({ changes: getAnexoChanges(req.params.id) });
});

// --- SaaS admin: Nuestros Respaldos (any client's evidence files) ----------
// GEIPSA-side counterpart of /api/business/base-datos-respaldos -- same
// listClientEvidenceFiles, just by :id instead of the caller's own
// clientId, and gated by the saas-backups grant (Equipo SaaS) instead of
// the per-client permission tree. Ver and Descargar are separate leaves on
// purpose (see Admin-EquipoSaaS.js's SAAS_PERMISSION_CATALOG) -- some staff
// should be able to see WHAT exists without being able to open the actual
// photos.
app.get('/api/admin/clients/:id/backups', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-backups', null, req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para ver Nuestros Respaldos.' });
    }
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    res.json({ files: listClientEvidenceFiles(req.params.id) });
});

app.get('/api/admin/clients/:id/backups/download-url', requireAuth, requireAdmin, async (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-backups', 'tabla::a1', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para descargar evidencias.' });
    }
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const { tableKey, recordId, fieldKey } = req.query;
    const evidence = getEvidenceRawValue(req.params.id, tableKey, Number(recordId), fieldKey);
    if (!evidence) return res.status(404).json({ message: 'Evidence not found.' });
    // Nuestros Respaldos es una lista de solo lectura; lo único que pasa en ella es
    // que alguien descargue un archivo, y eso es lo que queda en su historial.
    logSaasChange(req, 'admin-nuestros-respaldos', `${tableKey}:${recordId}:${fieldKey}`,
        `${client.company_name} — ${tableKey}/${fieldKey} #${recordId}`, 'admin.historyBackupDownloaded', '', '');
    if (!evidence.migrated) return res.json({ url: evidence.value });
    try {
        const companyNickname = client.company_nickname || client.company_name || '';
        const ext = evidence.value.split('.').pop() || 'jpg';
        const displayName = buildEvidenceDisplayName({
            companyNickname, tableKey, fieldKey, recordDate: evidence.recordDate,
            folio: evidence.recordNumber, ext,
        });
        const url = await getDownloadUrl(evidence.value, displayName);
        res.json({ url });
    } catch (err) {
        console.error('admin backups download-url failed:', err.message);
        res.status(503).json({ message: 'El almacenamiento de archivos no está configurado todavía.' });
    }
});

// --- SaaS admin: Material Apoyo (any client's document library) -----------
// GEIPSA-side counterpart of /api/business/material-apoyo -- same
// listSupportMaterials, just by :id instead of the caller's own clientId,
// gated by the saas-material-apoyo grant (Equipo SaaS) instead of the
// per-client permission tree. Ver alone is enough to see AND download here
// (matches the client-side gate); Subir is the separate leaf that unlocks
// uploading/replacing/deleting.
app.get('/api/admin/clients/:id/material-apoyo', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-material-apoyo', null, req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para ver Material Apoyo.' });
    }
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    if (!validMaterialApoyoScope(req.query)) return res.status(400).json({ message: 'department, area y category (válida) son requeridos.' });
    const { department, area, category } = req.query;
    res.json({ files: listSupportMaterials(req.params.id, department, area, category) });
});

app.get('/api/admin/clients/:id/material-apoyo/download-url', requireAuth, requireAdmin, async (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-material-apoyo', null, req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para ver Material Apoyo.' });
    }
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const material = getSupportMaterialById(Number(req.query.id), req.params.id);
    if (!material) return res.status(404).json({ message: 'Material not found.' });
    try {
        const url = await getDownloadUrl(material.storage_key, material.title || material.original_filename);
        res.json({ url });
    } catch (err) {
        console.error('admin material-apoyo download-url failed:', err.message);
        res.status(503).json({ message: 'El almacenamiento de archivos no está configurado todavía.' });
    }
});

app.post('/api/admin/clients/:id/material-apoyo/upload-url', requireAuth, requireAdmin, async (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-material-apoyo', 'tabla::a1', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para subir Material Apoyo.' });
    }
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const { department, area, category, contentType } = req.body || {};
    if (!validMaterialApoyoScope({ department, area, category })) return res.status(400).json({ message: 'department, area y category (válida) son requeridos.' });
    try {
        const key = buildSupportMaterialStorageKey({ clientId: req.params.id, department, area, category, contentType });
        const uploadUrl = await getUploadUrl(key, contentType);
        res.json({ uploadUrl, key });
    } catch (err) {
        console.error('admin material-apoyo upload-url failed:', err.message);
        res.status(503).json({ message: 'El almacenamiento de archivos no está configurado todavía.' });
    }
});

app.post('/api/admin/clients/:id/material-apoyo', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-material-apoyo', 'tabla::a1', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para subir Material Apoyo.' });
    }
    const client = getClientById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found.' });
    const { department, area, departmentLabel, areaLabel, category, key, title, originalFilename, contentType, fileSize } = req.body || {};
    if (!validMaterialApoyoScope({ department, area, category })) return res.status(400).json({ message: 'department, area y category (válida) son requeridos.' });
    if (!key || !originalFilename) return res.status(400).json({ message: 'key y originalFilename son requeridos.' });
    const material = createSupportMaterial({
        clientId: req.params.id, department, area,
        departmentLabel: departmentLabel || department, areaLabel: areaLabel || area,
        category, title, originalFilename, storageKey: key, contentType, fileSize,
        uploadedByName: req.user.name, uploadedBySource: 'geipsa',
    });
    logSaasChange(req, 'admin-material-apoyo', material.id, `${client.company_name} — ${title || originalFilename}`, '', '', '', 'create');
    res.status(201).json({ material });
});

app.delete('/api/admin/clients/:id/material-apoyo/:materialId', requireAuth, requireAdmin, async (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-material-apoyo', 'tabla::a1', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para eliminar Material Apoyo.' });
    }
    const material = getSupportMaterialById(Number(req.params.materialId), req.params.id);
    if (!material) return res.status(404).json({ message: 'Material not found.' });
    logSaasChange(req, 'admin-material-apoyo', material.id,
        `${getClientById(req.params.id)?.company_name || ''} — ${material.title || material.original_filename}`, '', '', '', 'delete');
    deleteSupportMaterial(material.id, req.params.id);
    try { await deleteObject(material.storage_key); } catch (err) { console.error('admin material-apoyo R2 delete failed (ignored):', err.message); }
    res.json({ ok: true });
});

// --- SaaS admin: costo por módulo (Costos de Módulos) ------------------------
// Used to compute "Pago por Anexos" per client (see getAnexosPaymentTotal) —
// completely separate from Planes y Paquetes, which only decides which
// módulos a plan includes, not what any of them cost.
app.get('/api/admin/module-costs', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, [])) return;
    const costByKey = new Map(getModuleCosts().map((c) => [c.module_key, c.cost]));
    res.json({ costs: MODULE_CATALOG.map((m) => ({ ...m, cost: costByKey.get(m.key) || 0 })) });
});

app.put('/api/admin/module-costs', requireAuth, requireAdmin, (req, res) => {
    if (!req.user.isSaasSuperAdmin) return res.status(403).json({ message: 'Solo el administrador principal puede cambiar los costos de módulos.' });
    const { costs } = req.body || {};
    if (!Array.isArray(costs)) return res.status(400).json({ message: 'costs must be an array.' });
    const validKeys = new Set(MODULE_CATALOG.map((m) => m.key));
    for (const { key, cost } of costs) {
        if (!validKeys.has(key)) return res.status(400).json({ message: `Unknown module key: ${key}.` });
        if (typeof cost !== 'number' || Number.isNaN(cost) || cost < 0) {
            return res.status(400).json({ message: `cost for ${key} must be a number >= 0.` });
        }
    }
    setModuleCosts(costs);
    const costByKey = new Map(getModuleCosts().map((c) => [c.module_key, c.cost]));
    res.json({ costs: MODULE_CATALOG.map((m) => ({ ...m, cost: costByKey.get(m.key) || 0 })) });
});

// --- SaaS admin: plans / packages (Planes y Paquetes) ------------------------
// GEIPSA's own catalog of plan types, shown as options on the "Plan /
// paquete" field in Clientes Nuevos. Not tied to module entitlements —
// clients.plan just stores the chosen name as free text (see db.js).
function validatePlanBody(body) {
    const { name, modules, costCentersLimit, createdAt } = body || {};
    if (!name || !name.trim()) return 'name is required.';
    if (modules !== undefined && !Array.isArray(modules)) return 'modules must be an array.';
    if (costCentersLimit !== undefined && (!Number.isInteger(costCentersLimit) || costCentersLimit < 0)) {
        return 'costCentersLimit must be a non-negative integer.';
    }
    if (createdAt !== undefined && createdAt !== null && (typeof createdAt !== 'string' || !DATE_RE.test(createdAt))) {
        return 'createdAt must be a date in YYYY-MM-DD format.';
    }
    return null;
}

// Same filtering setClientModules does — silently drop anything that isn't
// a real module key, rather than storing garbage a client could never have.
function sanitizePlanModules(modules) {
    const validKeys = new Set(MODULE_CATALOG.map((m) => m.key));
    return Array.isArray(modules) ? modules.filter((key) => validKeys.has(key)) : [];
}

// Once a plan's access tree is saved, it's meant to be final ("al generar
// un plan es para siempre" — a plan's DEFINITION shouldn't shift under
// clients already assigned to it). While the project is still being built,
// that lock is relaxed so plans can keep being iterated on — flip this to
// false before launch, and every plan saved with a full access tree from
// then on locks for real. Never read from an env var on purpose: this is a
// one-time, deliberate release switch, not a per-environment setting.
// FLIPPED to false on 2026-10-06 (launch prep, Daniel approved): a plan can be edited freely only while it is in Revisión; once Activado
// (locked) its definition no longer changes. Flip back to true only for a deliberate round of development, never in production.
const DEV_MODE_ALLOW_LOCKED_PLAN_EDITS = false;

app.get('/api/admin/plans', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-plans','saas-clients'])) return;
    const plans = listPlans().map((plan) => ({ ...plan, accessPermissionsCost: computeAccessCostTotal(plan.id) }));
    res.json({ plans, devModeOverride: DEV_MODE_ALLOW_LOCKED_PLAN_EDITS });
});

app.post('/api/admin/plans', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-plans', 'tabla::a0', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para crear planes.' });
    }
    const error = validatePlanBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { name, description, modules, costCentersLimit, businessSectorId } = req.body;
    try {
        const plan = createPlan({
            name: name.trim(), description,
            modules: sanitizePlanModules(modules), costCentersLimit: costCentersLimit || 0,
            createdBy: `${req.user.username} - ${req.user.name}`, businessSectorId: businessSectorId || null,
        });
        logPlanChange({ planId: plan.id, action: 'create', changedBy: changedByLabel(req) });
        res.status(201).json({ plan });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A plan with that name already exists.' });
        }
        throw err;
    }
});

app.patch('/api/admin/plans/:id', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    const { status, endDate, currency, costPerCostCenter, createdAt, createdBy } = req.body || {};
    // The FIRST Revisión -> Activo transition only ever happens through the
    // gated POST .../activate below (requires the 'activate' SaaS grant) —
    // this plain PATCH can never do that one. Once a plan has been through
    // that gate at least once (existing.locked), its definition is already
    // frozen, so freely toggling active <-> inactive afterward needs no
    // further authorization — it's just a visibility flag at that point.
    if (status === 'active' && !existing.locked) {
        return res.status(400).json({ message: 'Usa el botón Activar para pasar un plan a Activo.' });
    }
    // This one route serves 2 different buckets on Nuestros Planes, each
    // its own Equipo SaaS leaf: plan fields/endDate (Editar), status
    // (Activar/Desactivar toggle once already locked; the one-time
    // Revisión->Activo transition stays gated by 'activate' via POST
    // .../activate above, not here). currency/costPerCostCenter moved here
    // too (cost cascade, 2026-09-30) now that Costo Accesos-Permisos/
    // Admin-CostosModulos.js is gone -- same 'saas-plans'/'editar' grant as
    // the plan-fields bucket, since there's no separate screen for them
    // anymore. A save can touch more than one bucket at once, so each is
    // checked independently against whatever it actually changes.
    const grants = getSaasUserGrants(req.user.sub);
    const bodyKeys = Object.keys(req.body || {});
    const changesStatus = status !== undefined && status !== existing.status;
    const changesPricing = bodyKeys.some((k) => k === 'currency' || k === 'costPerCostCenter');
    const changesPlanFields = bodyKeys.some((k) => k !== 'status' && k !== 'currency' && k !== 'costPerCostCenter');
    if (changesPlanFields && !hasSaasGrant(grants, 'saas-plans', 'tabla::ta2', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para editar planes.' });
    }
    if (changesStatus && !hasSaasGrant(grants, 'saas-plans', 'tabla::ta3', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para activar/desactivar planes.' });
    }
    if (changesPricing && !hasSaasGrant(grants, 'saas-plans', 'tabla::ta2', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para editar planes.' });
    }
    if (currency !== undefined && !['MXN', 'USD'].includes(currency)) {
        return res.status(400).json({ message: 'currency must be MXN or USD.' });
    }
    if (costPerCostCenter !== undefined && (typeof costPerCostCenter !== 'number' || Number.isNaN(costPerCostCenter) || costPerCostCenter < 0)) {
        return res.status(400).json({ message: 'costPerCostCenter must be a number >= 0.' });
    }
    // Lifecycle-only patch (status/endDate) and pricing (currency/
    // costPerCostCenter) — always allowed, even locked. Pricing is a
    // separate, ongoing commercial concern from the frozen access-tree
    // definition (see Costo Accesos-Permisos) — never gated by `locked`.
    const isDefinitionChange = ['name', 'description', 'modules', 'costCentersLimit', 'createdAt', 'createdBy', 'businessSectorId']
        .some((k) => Object.prototype.hasOwnProperty.call(req.body || {}, k));
    if (isDefinitionChange && existing.locked && !DEV_MODE_ALLOW_LOCKED_PLAN_EDITS) {
        return res.status(409).json({ message: 'Este plan ya fue guardado y no puede modificarse.' });
    }
    if (isDefinitionChange) {
        const error = validatePlanBody({ ...existing, ...req.body });
        if (error) return res.status(400).json({ message: error });
    }
    const { name, description, modules, costCentersLimit, businessSectorId } = req.body;
    try {
        const plan = updatePlan(req.params.id, {
            name: name != null ? name.trim() : undefined,
            description,
            modules: modules != null ? sanitizePlanModules(modules) : undefined,
            costCentersLimit,
            status,
            endDate,
            currency,
            costPerCostCenter,
            createdAt,
            createdBy: createdBy != null ? createdBy.trim() : undefined,
            businessSectorId,
        });
        logPlanChange({ planId: plan.id, action: 'update', changedBy: changedByLabel(req) });
        // Los clientes que tienen este plan lo siguen por NOMBRE: si cambió de nombre, se renombra en ellos; y si cambió su definición (módulos, límite de
        // centros de costo), se vuelve a estampar en cada cliente lo que tienen contratado.
        if (plan.name !== existing.name) renameClientsPlan(existing.name, plan.name);
        if (isDefinitionChange) listClientsOnPlan(plan.name).forEach((c) => applyEffectiveEntitlements(c.id));
        if (currency !== undefined && currency !== existing.currency) {
            logPlanChange({ planId: plan.id, action: 'update', fieldKey: 'admin.planCurrency', oldValue: existing.currency, newValue: currency, changedBy: changedByLabel(req) });
        }
        if (costPerCostCenter !== undefined && costPerCostCenter !== existing.costPerCostCenter) {
            logPlanChange({ planId: plan.id, action: 'update', fieldKey: 'admin.costPerCostCenter', oldValue: String(existing.costPerCostCenter), newValue: String(costPerCostCenter), changedBy: changedByLabel(req) });
        }
        res.json({ plan: { ...plan, accessPermissionsCost: computeAccessCostTotal(plan.id) } });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A plan with that name already exists.' });
        }
        throw err;
    }
});

// The one-time Revisión -> Activo gate (Tarea 4): only an admin holding
// the 'activate' grant under 'saas-plans' (or an unrestricted admin — see
// hasSaasGrant) can flip this. Locks the plan's definition + access tree
// for good in the same step (activatePlan in db.js) — matches "al generar
// un plan es para siempre".
app.post('/api/admin/plans/:id/activate', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    if (existing.status !== 'revision') {
        return res.status(409).json({ message: 'Solo un plan en Revisión puede activarse.' });
    }
    const grants = getSaasUserGrants(req.user.sub);
    if (!hasSaasGrant(grants, 'saas-plans', 'tabla::ta3', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para autorizar planes.' });
    }
    const plan = activatePlan(req.params.id);
    logPlanChange({
        planId: plan.id, action: 'update', fieldKey: 'admin.planStatus',
        oldValue: 'revision', newValue: 'active', changedBy: changedByLabel(req),
    });
    res.json({ plan });
});

app.delete('/api/admin/plans/:id', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-plans', 'tabla::ta2', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para editar planes.' });
    }
    // Un plan con clientes no se borra: sus clientes se quedarían apuntando a un plan que ya no existe (sin contrato).
    const clientsOnPlan = listClientsOnPlan(existing.name);
    if (clientsOnPlan.length) {
        return res.status(409).json({ message: `Este plan está asignado a ${clientsOnPlan.length} cliente(s) y no se puede eliminar.` });
    }
    deletePlan(req.params.id);
    res.status(204).end();
});

// --- Plan access tree ("Mis Planes" — árbol de accesos por plan) -----------
// Same {sectionId, itemId, submenuId} grant shape PermissionTree.js already
// saves for a client's profiles, mounted here against a plan instead. The
// first save locks the plan (see DEV_MODE_ALLOW_LOCKED_PLAN_EDITS above).
app.get('/api/admin/plans/:id/grants', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-plans','saas-clients'])) return;
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    // sectorGrants: this plan's OWN Sector's CURRENT defaults (live, not a
    // frozen copy) -- purely so the tree can tag each row "(Default)" when
    // it still matches what the Sector currently grants; the plan's actual
    // saved grants (above) are the only thing that ever gets sent back on
    // save, so editing the Sector later never silently changes this plan.
    const sectorGrants = existing.businessSectorId ? getSectorGrants(existing.businessSectorId) : [];
    res.json({ grants: getPlanGrants(req.params.id), sectorGrants, locked: existing.locked });
});

// Editable freely while the plan is in Revisión (any number of saves) —
// locked for good the moment it's Activo (see POST .../activate above,
// which is the ONLY thing that ever locks a plan now; saving the tree by
// itself no longer locks anything, unlike the earlier version of this
// route).
app.put('/api/admin/plans/:id/grants', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-plans', 'tabla::ta2', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para editar planes.' });
    }
    if (existing.locked && !DEV_MODE_ALLOW_LOCKED_PLAN_EDITS) {
        return res.status(409).json({ message: 'Este plan ya está activo y no puede modificarse.' });
    }
    const { grants } = req.body || {};
    const error = validateGrants(grants);
    if (error) return res.status(400).json({ message: error });
    // Lo que no está habilitado para servicio en el Árbol Maestro no se puede incluir en un plan (lo nuevo; lo que el plan ya traía se queda). El árbol ya lo muestra con candado y aviso; esto es por si llega de otro lado.
    {
        const serviceKey = (g) => `${g.sectionId}::${g.itemId || ''}::${g.submenuId || ''}`;
        const alreadySaved = new Set(getPlanGrants(req.params.id).map(serviceKey));
        const serviceOverrides = buildMasterStatusOverrideMap(getMasterPermissionStatuses().filter((r) => r.status !== 'habilitado'));
        for (const g of grants) {
            if (alreadySaved.has(serviceKey(g))) continue;
            const status = resolveMasterNodeStatus(g.sectionId, g.itemId, String(g.submenuId || '').replace(/#app$/, '') || null, serviceOverrides);
            if (status !== 'habilitado') {
                return res.status(400).json({ code: 'service-not-enabled', status, sectionId: g.sectionId, itemId: g.itemId || null, submenuId: g.submenuId || null, message: `Este acceso no está habilitado para servicio (Estatus: ${status}) y no se puede incluir en el plan hasta que el Árbol Maestro lo habilite.` });
            }
        }
    }
    const saved = setPlanGrants(req.params.id, grants);
    // The old manual module checklist on "Editar plan" is gone — a
    // department/button now turns on for real the moment ANY permission
    // under it is granted here, so a plan never ends up feature-complete in
    // its access tree but invisible everywhere modules gate real behavior.
    syncPlanModulesFromGrants(req.params.id);
    logPlanChange({
        planId: req.params.id, action: 'update', fieldKey: 'admin.activeTree',
        oldValue: '', newValue: `${saved.length}`, changedBy: changedByLabel(req),
    });
    res.json({ grants: saved });
});

// --- Cost cascade: Árbol Maestro -> Giro -> Plan ---------------------------
// Replaces Costo Accesos-Permisos' flat per-node price sheet (see db.js's
// own DEPRECATED comment on plan_permission_costs). Never lock-gated (same
// as the old screen) — pricing stays editable even once a plan is
// Activo/bloqueado, unlike name/description/modules/costCentersLimit/the
// grant tree itself.
function validateCostAdjustDefault(body) {
    if (!body || typeof body !== 'object') return 'default is required.';
    const { type, valueWeb, valueApp } = body;
    if (type !== 'percent' && type !== 'flat') return "type must be 'percent' or 'flat'.";
    if (typeof valueWeb !== 'number' || Number.isNaN(valueWeb)) return 'valueWeb must be a number.';
    if (typeof valueApp !== 'number' || Number.isNaN(valueApp)) return 'valueApp must be a number.';
    // A discount is negative on purpose -- only a floor, not a >=0 check
    // like the old validatePlanPermissionCosts (a flat price can never be
    // negative; a percent ADJUSTMENT routinely is).
    if (type === 'percent' && (valueWeb < -100 || valueApp < -100)) return 'a percent discount cannot exceed -100.';
    return null;
}
function validateCostAdjustOverrides(overrides) {
    if (!Array.isArray(overrides)) return 'overrides must be an array.';
    for (const o of overrides) {
        if (!o || typeof o.sectionId !== 'string' || !o.sectionId) return 'each override needs a sectionId.';
        const error = validateCostAdjustDefault(o);
        if (error) return error;
    }
    return null;
}

app.get('/api/admin/business-sectors/:id/cost-adjust', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-business-sectors','saas-plans'])) return;
    const existing = getBusinessSectorById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Business sector not found.' });
    res.json({
        default: getSectorCostAdjustDefault(req.params.id),
        overrides: getSectorPermissionCostAdjustments(req.params.id),
        masterCosts: getMasterPermissionCosts(),
        currency: getMasterCostSettings().currency,
    });
});

app.put('/api/admin/business-sectors/:id/cost-adjust', requireAuth, requireAdmin, (req, res) => {
    const existing = getBusinessSectorById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Business sector not found.' });
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-business-sectors', 'tabla::ta3', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para editar giros.' });
    }
    const { default: defaultAdjust, overrides } = req.body || {};
    const defaultError = validateCostAdjustDefault(defaultAdjust);
    if (defaultError) return res.status(400).json({ message: defaultError });
    const overridesError = validateCostAdjustOverrides(overrides);
    if (overridesError) return res.status(400).json({ message: overridesError });
    const savedDefault = setSectorCostAdjustDefault(req.params.id, defaultAdjust);
    const savedOverrides = setSectorPermissionCostAdjustments(req.params.id, overrides);
    logBusinessSectorChange({
        businessSectorId: req.params.id, action: 'update', fieldKey: 'admin.sectorCostAdjust',
        oldValue: '', newValue: `${savedOverrides.length}`, changedBy: changedByLabel(req),
    });
    res.json({ default: savedDefault, overrides: savedOverrides });
});

app.get('/api/admin/plans/:id/cost-adjust', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-plans'])) return;
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    res.json({
        default: getPlanCostAdjustDefault(req.params.id),
        overrides: getPlanPermissionCostAdjustments(req.params.id),
        baseCosts: getPlanCostAdjustBaseCosts(req.params.id),
        currency: getMasterCostSettings().currency,
    });
});

app.put('/api/admin/plans/:id/cost-adjust', requireAuth, requireAdmin, (req, res) => {
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-plans', 'tabla::ta2', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para editar planes.' });
    }
    const { default: defaultAdjust, overrides } = req.body || {};
    const defaultError = validateCostAdjustDefault(defaultAdjust);
    if (defaultError) return res.status(400).json({ message: defaultError });
    const overridesError = validateCostAdjustOverrides(overrides);
    if (overridesError) return res.status(400).json({ message: overridesError });
    const savedDefault = setPlanCostAdjustDefault(req.params.id, defaultAdjust);
    const savedOverrides = setPlanPermissionCostAdjustments(req.params.id, overrides);
    logPlanChange({
        planId: req.params.id, action: 'update', fieldKey: 'admin.accessPermissionsCost',
        oldValue: '', newValue: `${savedOverrides.length}`, changedBy: changedByLabel(req),
    });
    res.json({ default: savedDefault, overrides: savedOverrides, plan: { ...existing, accessPermissionsCost: computeAccessCostTotal(req.params.id) } });
});

// Nuestros Planes' read-only shield-icon modal (PermissionCostTree.js's
// grantReadonlyCost mode) -- same {sectionId,itemId,submenuId,cost} shape
// plan_permission_costs always returned, just computed live from the
// cascade now.
app.get('/api/admin/plans/:id/cascaded-costs', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-plans','saas-clients'])) return;
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    res.json({ costs: getCascadedPlanCosts(req.params.id), currency: getMasterCostSettings().currency });
});

// Historial de la tabla completa (icono de la barra de Nuestros Planes).
app.get('/api/admin/plans/changes', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-plans'])) return;
    res.json({ changes: getAllPlanChanges() });
});

app.get('/api/admin/plans/:id/changes', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-plans','saas-clients'])) return;
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    res.json({ changes: getPlanChanges(req.params.id) });
});

// --- Árbol Maestro's own suggested/base cost (see master_permission_cost --
// in db.js) -- GEIPSA-global, independent of any one Plan. Web and App are
// two numbers per row here (not the #app-suffix trick plan_permission_costs
// uses), since this table never needed to double as a grant key.
const MASTER_COST_CURRENCIES = ['MXN', 'USD', 'EUR'];
function validateMasterPermissionCosts(costs) {
    if (!Array.isArray(costs)) return 'costs must be an array.';
    for (const c of costs) {
        if (!c || typeof c.sectionId !== 'string' || !c.sectionId) return 'each cost row needs a sectionId.';
        if (c.web !== undefined && (typeof c.web !== 'number' || Number.isNaN(c.web) || c.web < 0)) return 'web cost must be a number >= 0.';
        if (c.app !== undefined && (typeof c.app !== 'number' || Number.isNaN(c.app) || c.app < 0)) return 'app cost must be a number >= 0.';
    }
    return null;
}

app.get('/api/admin/master-permission-costs', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-master-permissions-tree','saas-business-sectors','saas-plans','saas-clients'])) return;
    res.json({ costs: getMasterPermissionCosts(), ...getMasterCostSettings() });
});

app.put('/api/admin/master-permission-costs', requireAuth, requireAdmin, (req, res) => {
    if (denyMasterPermissionsTreeControl(req, res, 'save', 'costs')) return;
    const { costs } = req.body || {};
    const error = validateMasterPermissionCosts(costs);
    if (error) return res.status(400).json({ message: error });
    const saved = setMasterPermissionCosts(costs);
    res.json({ costs: saved, ...getMasterCostSettings() });
});

// Currency switch -- confirmed via a dialog on Admin-ArbolMaestro.js before
// this ever gets called: converts every already-saved cost using
// exchangeRate ("1 <the non-MXN side> = exchangeRate MXN", same convention
// the dialog itself shows), and remembers it to suggest next time. Only
// MXN<->foreign is supported for now (never foreign<->foreign directly) --
// the conversion math only has one exchange rate to work with per call, so
// a USD->EUR switch would need routing through MXN first, not implemented
// here yet.
app.put('/api/admin/master-permission-costs/currency', requireAuth, requireAdmin, (req, res) => {
    if (denyMasterPermissionsTreeControl(req, res, 'currency')) return;
    const { currency, exchangeRate } = req.body || {};
    if (!MASTER_COST_CURRENCIES.includes(currency)) {
        return res.status(400).json({ message: `currency must be one of ${MASTER_COST_CURRENCIES.join(', ')}.` });
    }
    if (typeof exchangeRate !== 'number' || Number.isNaN(exchangeRate) || exchangeRate <= 0) {
        return res.status(400).json({ message: 'exchangeRate must be a number > 0.' });
    }
    const { currency: fromCurrency } = getMasterCostSettings();
    if (fromCurrency !== 'MXN' && currency !== 'MXN' && fromCurrency !== currency) {
        return res.status(400).json({ message: 'Switching directly between two non-MXN currencies is not supported yet -- switch back to MXN first.' });
    }
    const result = applyMasterCostCurrencyChange(currency, exchangeRate, changedByLabel(req));
    res.json({ costs: result.costs, ...result.settings });
});

// --- Nuestras APPs -----------------------------------------------------------
// The catalog of end-user app "kinds" (one per business vertical), each
// filled in over time with its own operational screens — see the
// saas_apps/saas_app_screens comment in db.js. Same 'saas-apps' grant
// shape (Ver/Editar/Crear) as saas-clients/saas-plans above, checked
// against Equipo SaaS's SAAS_PERMISSION_CATALOG.
const SAAS_APP_STATUSES = ['active', 'inactive', 'development'];

// Historial de cambios de las tablas de SaaS sin tabla propia (saas_table_changes):
// Nuestras Apps, Nuestros Respaldos y Material de Apoyo. Con ?recordId=, solo esa fila.
const SAAS_TABLE_CHANGES_KEYS = ['nuestras-apps', 'admin-nuestros-respaldos', 'admin-material-apoyo'];
function logSaasChange(req, tableKey, recordId, recordLabel, fieldKey, oldValue, newValue, action = 'update') {
    logSaasTableChange({ tableKey, recordId, recordLabel, action, fieldKey, oldValue, newValue, changedBy: changedByLabel(req) });
}
app.get('/api/admin/saas-table-changes/:tableKey', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, 'any')) return;
    if (!SAAS_TABLE_CHANGES_KEYS.includes(req.params.tableKey)) return res.status(404).json({ message: 'Unknown table.' });
    res.json({ changes: getSaasTableChanges(req.params.tableKey, req.query.recordId) });
});

app.get('/api/admin/saas-apps', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-apps'])) return;
    res.json({ apps: listSaasApps() });
});

// The fixed catalog of Web screens/tables an App screen can map to — same
// keys as db.js's TABLE_GRANT_PATHS, see the "add screen" modal.
app.get('/api/admin/web-screens-catalog', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-apps'])) return;
    res.json({ screens: WEB_SCREEN_CATALOG });
});

app.get('/api/admin/saas-apps/:id', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-apps'])) return;
    const app_ = getSaasAppById(req.params.id);
    if (!app_) return res.status(404).json({ message: 'App not found.' });
    res.json({ app: app_ });
});

app.post('/api/admin/saas-apps', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-apps', 'catalogo::a0', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para crear apps.' });
    }
    const { name, icon, colorFrom, colorTo, sector, status } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'El nombre es requerido.' });
    if (status !== undefined && !SAAS_APP_STATUSES.includes(status)) {
        return res.status(400).json({ message: 'Estatus inválido.' });
    }
    try {
        const app_ = createSaasApp({
            name: name.trim(), icon, colorFrom, colorTo,
            sector: (sector || '').trim(), status, createdBy: req.user.name,
        });
        logSaasChange(req, 'nuestras-apps', app_.id, app_.name, '', '', '', 'create');
        res.status(201).json({ app: app_ });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'Ya existe una app con ese nombre o ese sector.' });
        }
        throw err;
    }
});

app.patch('/api/admin/saas-apps/:id', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-apps', 'catalogo::a1', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para editar apps.' });
    }
    const existing = getSaasAppById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'App not found.' });
    const { name, icon, colorFrom, colorTo, sector, status } = req.body || {};
    if (status !== undefined && !SAAS_APP_STATUSES.includes(status)) {
        return res.status(400).json({ message: 'Estatus inválido.' });
    }
    try {
        const app_ = updateSaasApp(req.params.id, {
            name, icon, colorFrom, colorTo,
            sector: sector !== undefined ? sector.trim() : undefined, status,
        });
        [
            ['name', 'admin.appName'], ['sector', 'menu.appSector'], ['status', 'admin.planStatus'], ['icon', 'admin.historyAppIcon'],
        ].forEach(([field, fieldKey]) => {
            if (String(existing[field] ?? '') !== String(app_[field] ?? '')) {
                logSaasChange(req, 'nuestras-apps', app_.id, app_.name, fieldKey, existing[field], app_[field]);
            }
        });
        if (`${existing.colorFrom}/${existing.colorTo}` !== `${app_.colorFrom}/${app_.colorTo}`) {
            logSaasChange(req, 'nuestras-apps', app_.id, app_.name, 'admin.historyAppColors', `${existing.colorFrom} / ${existing.colorTo}`, `${app_.colorFrom} / ${app_.colorTo}`);
        }
        res.json({ app: app_ });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'Ya existe una app con ese nombre o ese sector.' });
        }
        throw err;
    }
});

app.delete('/api/admin/saas-apps/:id', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-apps', 'catalogo::a1', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para eliminar apps.' });
    }
    const existing = getSaasAppById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'App not found.' });
    logSaasChange(req, 'nuestras-apps', existing.id, existing.name, '', '', '', 'delete');
    deleteSaasApp(req.params.id);
    res.status(204).end();
});

app.post('/api/admin/saas-apps/:id/screens', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-apps', 'catalogo::a1', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para editar apps.' });
    }
    const existing = getSaasAppById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'App not found.' });
    const { name, screenType, webScreenKey } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'El nombre de la pantalla es requerido.' });
    // Every App screen fills a real Web table — see WEB_SCREEN_CATALOG in
    // db.js. This is what lets the permission tree lock an App screen until
    // its Web sibling already has at least one grant.
    if (!WEB_SCREEN_CATALOG.some((s) => s.key === webScreenKey)) {
        return res.status(400).json({ message: 'Selecciona a qué pantalla Web corresponde.' });
    }
    const appWithScreen = addSaasAppScreen(req.params.id, { name: name.trim(), screenType, webScreenKey });
    logSaasChange(req, 'nuestras-apps', existing.id, existing.name, 'admin.historyAppScreenAdded', '', name.trim());
    res.status(201).json({ app: appWithScreen });
});

app.delete('/api/admin/saas-apps/:id/screens/:screenId', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-apps', 'catalogo::a1', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para editar apps.' });
    }
    const existing = getSaasAppById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'App not found.' });
    const removedScreen = existing.screens.find((s) => String(s.id) === req.params.screenId);
    const appWithoutScreen = deleteSaasAppScreen(req.params.id, req.params.screenId);
    if (removedScreen) logSaasChange(req, 'nuestras-apps', existing.id, existing.name, 'admin.historyAppScreenRemoved', removedScreen.name, '');
    res.json({ app: appWithoutScreen });
});

// Read-only lookup behind an App screen's own field checklist — the full
// column/icon catalog its underlying Web screen offers (see
// getWebScreenFieldsCatalog in db.js), independent of which of those this
// App has actually curated yet (that's GET .../screens/:screenId/fields
// below).
app.get('/api/admin/web-screens-catalog/:webScreenKey/fields', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-apps'])) return;
    res.json(getWebScreenFieldsCatalog(req.params.webScreenKey));
});

app.put('/api/admin/saas-apps/:id/screens/:screenId/fields', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-apps', 'catalogo::a1', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes permiso para editar apps.' });
    }
    const existing = getSaasAppById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'App not found.' });
    const screen = existing.screens.find((s) => String(s.id) === req.params.screenId);
    if (!screen) return res.status(404).json({ message: 'Screen not found.' });
    const { fieldKeys } = req.body || {};
    if (!Array.isArray(fieldKeys) || fieldKeys.some((k) => typeof k !== 'string' || !k)) {
        return res.status(400).json({ message: 'fieldKeys must be an array of strings.' });
    }
    const fieldsBefore = (screen.fields || []).map((f) => (typeof f === 'object' ? (f.fieldKey ?? f.key ?? JSON.stringify(f)) : f));
    const savedFields = setSaasAppScreenFields(req.params.screenId, fieldKeys);
    const fieldsAfter = (savedFields || []).map((f) => (typeof f === 'object' ? (f.fieldKey ?? f.key ?? JSON.stringify(f)) : f));
    if ([...fieldsBefore].sort().join('|') !== [...fieldsAfter].sort().join('|')) {
        logSaasChange(req, 'nuestras-apps', existing.id, existing.name, 'admin.historyAppScreenFields', `${screen.name}: ${fieldsBefore.length}`, `${screen.name}: ${fieldsAfter.length}`);
    }
    res.json({ fieldKeys: savedFields });
});

// --- Nuestros Sectores de Negocio (catalog Nuestras APPs' Sector field ------
// picks from — see business_sectors in db.js) ---------------------------------
app.get('/api/admin/business-sectors', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-business-sectors','saas-apps','saas-plans','saas-clients'])) return;
    res.json({ sectors: listBusinessSectors() });
});

app.post('/api/admin/business-sectors', requireAuth, requireAdmin, (req, res) => {
    if (denySaasLeaf(req, res, 'saas-business-sectors', ['tabla::a0'], 'No tienes permiso para crear giros.')) return;
    const { name, icon, typeId, description } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'El nombre es requerido.' });
    try {
        const sector = createBusinessSector({ name: name.trim(), icon, typeId, description, createdBy: req.user.name });
        logBusinessSectorChange({ businessSectorId: sector.id, action: 'create', changedBy: changedByLabel(req) });
        res.status(201).json({ sector });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'Ya existe ese sector de negocio.' });
        }
        throw err;
    }
});

// Full edit -- name/icon/type/description. No approval workflow (same
// reasoning as plans' own PATCH): every account that can even reach this
// screen is already role='admin', so there's no one to escalate a pending
// change to. One 'update' row logged, plus one detailed row per field that
// actually changed (mirrors the plan currency/costPerCostCenter pattern),
// so Registro de Cambios reads as a real diff, not just "something changed".
app.patch('/api/admin/business-sectors/:id', requireAuth, requireAdmin, (req, res) => {
    if (denySaasLeaf(req, res, 'saas-business-sectors', ['tabla::ta3'], 'No tienes permiso para editar giros.')) return;
    const existing = getBusinessSectorById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Sector not found.' });
    const { name, icon, typeId, description } = req.body || {};
    if (name !== undefined && !name.trim()) return res.status(400).json({ message: 'El nombre es requerido.' });
    try {
        const patch = {};
        if (name !== undefined) patch.name = name.trim();
        if (icon !== undefined) patch.icon = icon;
        if (typeId !== undefined) patch.typeId = typeId;
        if (description !== undefined) patch.description = description;
        const sector = updateBusinessSector(req.params.id, patch);
        // One row per field that actually changed -- no extra generic
        // "update" row on top (unlike plans' own PATCH), since every
        // patchable field here already gets a real before/after value.
        Object.entries(BUSINESS_SECTOR_PATCHABLE_FIELDS).forEach(([key, { fieldKey }]) => {
            if (patch[key] === undefined || patch[key] === existing[key]) return;
            logBusinessSectorChange({
                businessSectorId: sector.id, action: 'update', fieldKey,
                oldValue: existing[key], newValue: patch[key], changedBy: changedByLabel(req),
            });
        });
        res.json({ sector });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'Ya existe ese sector de negocio.' });
        }
        throw err;
    }
});

// Historial de la tabla completa (icono de la barra de Giros de Negocio).
app.get('/api/admin/business-sectors/changes', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-business-sectors'])) return;
    res.json({ changes: getAllBusinessSectorChanges() });
});

app.get('/api/admin/business-sectors/:id/changes', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-business-sectors','saas-plans','saas-clients'])) return;
    const existing = getBusinessSectorById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Sector not found.' });
    res.json({ changes: getBusinessSectorChanges(req.params.id) });
});

// Tipo Giro -- flat admin-created catalog (see business_sector_types in
// db.js's own comment for why this isn't the client-scoped
// article_categories/catalog-request mechanism used elsewhere).
app.get('/api/admin/business-sector-types', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-business-sectors'])) return;
    res.json({ types: listBusinessSectorTypes() });
});
// One of BusinessSectorIcons.js's own 14 rubro ids (data/business-sector-
// icons.json's categoryIds), or empty/absent for "sin rubro" -- shape-only
// check (matches this file's usual validation depth for admin-only lookup
// data), not a hardcoded copy of the 14 ids themselves so the two never
// need to be kept in sync by hand.
function isValidIconCategory(value) {
    return value === undefined || value === null || value === '' || /^[a-z]{2,40}$/.test(value);
}

app.post('/api/admin/business-sector-types', requireAuth, requireAdmin, (req, res) => {
    if (denySaasLeaf(req, res, 'saas-business-sectors', ['modal-tipo-giro::a0'], 'No tienes permiso para crear o editar tipos de giro.')) return;
    const { name, iconCategory } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'El nombre es requerido.' });
    if (!isValidIconCategory(iconCategory)) return res.status(400).json({ message: 'iconCategory inválido.' });
    try {
        const type = createBusinessSectorType({ name: name.trim(), iconCategory: iconCategory || null, createdBy: req.user.name });
        res.status(201).json({ type });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'Ya existe ese tipo de giro.' });
        }
        throw err;
    }
});
app.patch('/api/admin/business-sector-types/:id', requireAuth, requireAdmin, (req, res) => {
    if (denySaasLeaf(req, res, 'saas-business-sectors', ['modal-tipo-giro::a0'], 'No tienes permiso para crear o editar tipos de giro.')) return;
    const { name, iconCategory } = req.body || {};
    if (name !== undefined && !name.trim()) return res.status(400).json({ message: 'El nombre es requerido.' });
    if (!isValidIconCategory(iconCategory)) return res.status(400).json({ message: 'iconCategory inválido.' });
    try {
        const type = updateBusinessSectorType(req.params.id, {
            name: name !== undefined ? name.trim() : undefined,
            iconCategory: iconCategory !== undefined ? (iconCategory || null) : undefined,
        });
        if (!type) return res.status(404).json({ message: 'Tipo de giro no encontrado.' });
        res.json({ type });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'Ya existe ese tipo de giro.' });
        }
        throw err;
    }
});

// No DELETE route -- Planes and Nuestras APPs already reference a sector by
// id, same "Activar/Desactivar only" rule as clients/cost centers.
app.patch('/api/admin/business-sectors/:id/status', requireAuth, requireAdmin, (req, res) => {
    if (denySaasLeaf(req, res, 'saas-business-sectors', ['tabla::ta5'], 'No tienes permiso para activar o desactivar giros.')) return;
    const existing = getBusinessSectorById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Sector not found.' });
    const { status } = req.body || {};
    if (status !== 'active' && status !== 'inactive') return res.status(400).json({ message: 'status must be active or inactive.' });
    const sector = setBusinessSectorStatus(req.params.id, status);
    logBusinessSectorChange({
        businessSectorId: sector.id, action: 'update', fieldKey: 'admin.businessSectorStatus',
        oldValue: existing.status, newValue: status, changedBy: changedByLabel(req),
    });
    res.json({ sector });
});

// What this Sector grants by default -- a new Plan aimed at this Sector
// copies this ONCE at creation time (see createPlan in db.js), then the two
// evolve independently.
app.get('/api/admin/business-sectors/:id/grants', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-business-sectors','saas-plans','saas-clients'])) return;
    const existing = getBusinessSectorById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Sector not found.' });
    res.json({ grants: getSectorGrants(req.params.id) });
});

app.put('/api/admin/business-sectors/:id/grants', requireAuth, requireAdmin, (req, res) => {
    if (denySaasLeaf(req, res, 'saas-business-sectors', ['tabla::ta0'], 'No tienes permiso para cambiar los accesos globales del giro.')) return;
    const existing = getBusinessSectorById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Sector not found.' });
    const { grants } = req.body || {};
    const error = validateGrants(grants);
    if (error) return res.status(400).json({ message: error });
    res.json({ grants: setSectorGrants(req.params.id, grants) });
});

// Departamento/Área display order (see master_permission_order/
// sector_permission_order in db.js) -- '__root__' is Departamento, and
// areaOrderKey(sectionId) is one department's own Área list. Deeper levels
// (Apartado, Pantalla, Columna) will reuse the same table with their own
// parent_key prefix once built.
function isValidOrderArray(arr) {
    return Array.isArray(arr) && arr.every((id) => typeof id === 'string' && id);
}
// { sectionId: [id, ...], ... } -- one Área order per department.
function isValidOrderMap(obj) {
    return !!obj && typeof obj === 'object' && !Array.isArray(obj)
        && Object.values(obj).every((arr) => isValidOrderArray(arr));
}
// Every parent_key under `prefix` currently saved on Árbol Maestro (only
// the ones that have ever been touched -- the rest keep menu.json's own
// order, same fallback departmentOrder itself already relies on). Keyed by
// the parentKey's own suffix (e.g. a sectionId for 'area::', a
// "sectionId::areaId" for 'apartado::').
function buildMasterOrdersByPrefix(prefix) {
    const result = {};
    getMasterPermissionOrder()
        .filter((r) => r.parentKey.startsWith(prefix))
        .forEach((r) => { result[r.parentKey.slice(prefix.length)] = r.orderedKeys; });
    return result;
}

// Departamento/Área display order for this Sector (see
// sector_permission_order / getEffectiveSectorOrder(sByPrefix) in db.js).
// Both the Árbol Maestro's CURRENT order (read-only reference columns on
// this screen -- reordering Master happens on Admin-ArbolMaestro.js, not
// here) and this sector's own effective order (its own saved order if it
// has ever diverged for that department, else live-falls-back to Master's,
// per the cascade the user described -- never a frozen one-time copy)
// come back together so the screen can render both columns in one request.
// Extended to all 5 levels (same as master-permission-order below) for
// "Reorden Personalizado" -- confirmed with the user: a réplica of Accesos
// Globales, filtered to what's granted, with reorder enabled at every
// depth Árbol Maestro itself reorders at, not just Departamento/Área.
// "Orden y clasificación" de un nivel (hoy Giro y Plan). Quien tiene "Personalizar orden y clasificación" propone cambios; si además tiene "Autorizar orden y
// clasificación" o es administrador principal, se aplican al momento y se avisa hacia abajo; si no, quedan como SOLICITUD (scope 'level') que le llega a quien
// tenga Autorizar (a su campana, subiendo por los jefes). Lo que se cambia solo baja (a los niveles de abajo de ese giro/plan) y restablecer siempre vuelve a
// heredar lo del nivel de arriba (el Giro para un plan que tiene giro; si no, el Maestro). Un nivel nuevo se agrega aquí con su pantalla y sus dos hojas.
const LAYOUT_LEVELS = {
    giro: {
        screenId: 'saas-business-sectors', personalizeLeaf: 'tabla::ta1', authorizeLeaf: 'tabla::ta6',
        get: (id) => getBusinessSectorById(id), notFound: 'Sector not found.',
        label: (e) => `Giro «${e.name}»`,
        noPermission: 'No tienes permiso para personalizar el orden y la clasificación del giro.',
        above: () => ({ kind: 'master', name: '' }),
    },
    plan: {
        screenId: 'saas-plans', personalizeLeaf: 'tabla::ta5', authorizeLeaf: 'tabla::ta6',
        get: (id) => getPlanById(id), notFound: 'Plan not found.',
        label: (e) => `Plan «${e.name}»`,
        noPermission: 'No tienes permiso para personalizar el orden y la clasificación del plan.',
        above: (e) => {
            const sector = e.businessSectorId ? getBusinessSectorById(e.businessSectorId) : null;
            return sector ? { kind: 'giro', name: sector.name } : { kind: 'master', name: '' };
        },
    },
    cliente: {
        screenId: 'saas-clients', personalizeLeaf: 'tabla::ta6', authorizeLeaf: 'tabla::ta7',
        get: (id) => getClientById(id), notFound: 'Client not found.',
        label: (e) => `Cliente «${e.company_name}»`,
        noPermission: 'No tienes permiso para personalizar el orden y la clasificación del cliente.',
        // Lo de este nivel se guarda con el id del propio cliente (así se borra junto con sus datos al reiniciar).
        rowClientId: (e) => e.id,
        // El nivel de arriba del cliente: su plan; sin plan, su giro; sin giro, el Maestro.
        above: (e) => {
            const plan = e.plan ? getPlanByName(e.plan) : null;
            if (plan) return { kind: 'plan', name: plan.name };
            const sector = e.sector_negocio ? listBusinessSectors().find((s) => s.name === e.sector_negocio) : null;
            return sector ? { kind: 'giro', name: sector.name } : { kind: 'master', name: '' };
        },
    },
    // Administrador del cliente: la ruta lleva el id del CLIENTE; el nivel guarda lo suyo con el id del usuario administrador y el id del cliente.
    admin: {
        screenId: 'saas-clients', personalizeLeaf: 'tabla::ta8', authorizeLeaf: 'tabla::ta9',
        get: (id) => getClientById(id), notFound: 'Client not found.',
        label: (e) => `Administrador de «${e.company_name}»`,
        noPermission: 'No tienes permiso para personalizar el orden y la clasificación del administrador.',
        entityId: (e) => e.admin_user_id,
        rowClientId: (e) => e.id,
        unavailable: (e) => (e.admin_user_id ? null : 'Este cliente aún no tiene un usuario administrador.'),
        // Lo de arriba del administrador es su cliente.
        above: (e) => ({ kind: 'cliente', name: e.company_name }),
    },
    // Perfil (Puesto de Trabajo) y Usuario (persona): niveles de la EMPRESA. Quien cambia y quien autoriza lo dice el árbol de permisos de la empresa y el organigrama
    // (ver clientLayoutAccess en db.js); el objetivo viaja como { id, entityId, name, clientId }.
    perfil: {
        clientSide: true,
        getTarget: (req) => {
            const t = resolveClientColorTarget(req.user.clientId, 'perfil', req.params.id, req.user.isTestAccount);
            return t ? { id: t.entityId, entityId: t.entityId, name: t.name, clientId: req.user.clientId } : null;
        },
        notFound: 'Job position not found.',
        label: (e) => `Perfil «${e.name}»`,
        noPermission: 'No tienes permiso para personalizar el orden y la clasificación de este perfil.',
        entityId: (e) => e.entityId,
        rowClientId: (e) => e.clientId,
        // Lo de arriba del perfil es el administrador del cliente.
        above: () => ({ kind: 'admin', name: '' }),
        grants: (e) => getJobPositionGrants(e.entityId),
    },
    usuario: {
        clientSide: true,
        getTarget: (req) => {
            const t = resolveClientColorTarget(req.user.clientId, 'usuario', req.params.id, req.user.isTestAccount);
            return t ? { id: t.entityId, entityId: t.entityId, name: t.name, clientId: req.user.clientId } : null;
        },
        notFound: 'User not found.',
        label: (e) => `Persona «${e.name}»`,
        noPermission: 'No tienes permiso para personalizar el orden y la clasificación de esta persona.',
        entityId: (e) => e.entityId,
        rowClientId: (e) => e.clientId,
        // Lo de arriba de la persona es su perfil (su puesto); sin puesto, el administrador del cliente.
        above: (e) => {
            const positionId = getJobPositionIdForUser(e.entityId);
            const position = positionId ? db_getJobPositionName(positionId) : null;
            return position ? { kind: 'perfil', name: position } : { kind: 'admin', name: '' };
        },
        grants: (e) => getUserEffectiveGrantsRaw(e.entityId),
    },
};
function db_getJobPositionName(positionId) {
    const row = getJobPositionByIdAnyClient(positionId);
    return row ? row.name : null;
}
function layoutLevelAccess(level, req, entity) {
    const cfg = LAYOUT_LEVELS[level];
    if (cfg.clientSide) return clientLayoutAccess(level, entity.entityId, { id: req.user.sub, isClientAdmin: !!req.user.isClientAdmin });
    const grants = getSaasUserGrants(req.user.sub);
    const has = (sub) => hasSaasGrant(grants, cfg.screenId, sub, req.user.isSaasSuperAdmin);
    return { canPersonalize: has(cfg.personalizeLeaf), canAuthorize: has(cfg.authorizeLeaf) };
}
// Lo que lee la pantalla: el orden del Maestro y del nivel (como siempre), de dónde viene cada lista, las clasificaciones del nivel (y lo que heredaría sin
// cambios propios), las solicitudes pendientes y lo que esta persona puede hacer.
function buildLevelLayoutState(level, entity, req) {
    const cfg = LAYOUT_LEVELS[level];
    const id = String(entity.id);
    // El id con el que se guarda este nivel (el administrador usa el del usuario) y el cliente al que pertenece (para armar su cadena hacia arriba).
    const levelId = Number(cfg.entityId ? cfg.entityId(entity) : entity.id);
    const chainClientId = cfg.rowClientId ? cfg.rowClientId(entity) : null;
    const masterRow = getMasterPermissionOrder().find((r) => r.parentKey === PERMISSION_ORDER_ROOT_KEY);
    const tree = getOrderTreeForTarget(level, levelId, chainClientId);
    // El Giro conserva sus lectores de siempre (su orden ya completa lo que falta); los demás niveles leen lo resuelto por la cadena de herencia.
    const own = level === 'giro'
        ? {
            customOrder: getEffectiveSectorDepartmentOrder(id),
            customAreaOrders: getEffectiveSectorOrdersByPrefix(id, 'area::'),
            customApartadoOrders: getEffectiveSectorOrdersByPrefix(id, 'apartado::'),
            customPantallaOrders: getEffectiveSectorOrdersByPrefix(id, 'pantalla::'),
            customColumnOrders: getEffectiveSectorOrdersByPrefix(id, 'columna::'),
        }
        : {
            customOrder: tree.departmentOrder,
            customAreaOrders: tree.areaOrders,
            customApartadoOrders: tree.apartadoOrders,
            customPantallaOrders: tree.pantallaOrders,
            customColumnOrders: tree.columnOrders,
        };
    return {
        masterOrder: masterRow ? masterRow.orderedKeys : [],
        masterAreaOrders: buildMasterOrdersByPrefix('area::'),
        masterApartadoOrders: buildMasterOrdersByPrefix('apartado::'),
        masterPantallaOrders: buildMasterOrdersByPrefix('pantalla::'),
        masterColumnOrders: buildMasterOrdersByPrefix('columna::'),
        ...own,
        sources: tree.sources,
        classifications: getEffectiveClassificationOverridesForTarget(level, levelId, chainClientId),
        inheritedClassifications: getInheritedClassificationOverridesForTarget(level, levelId, chainClientId),
        pending: listPendingLevelRequests(level, levelId).map((r) => ({
            id: r.id, action: r.action, label: r.label || '', requestedByName: r.requestedByName, assignedToName: r.assignedToName, createdAt: r.createdAt,
        })),
        above: cfg.above(entity),
        ...(cfg.grants ? { grants: cfg.grants(entity) } : {}),
        ...layoutLevelAccess(level, req, entity),
    };
}
app.get('/api/admin/business-sectors/:id/department-order', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-business-sectors'])) return;
    const existing = getBusinessSectorById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Sector not found.' });
    res.json(buildLevelLayoutState('giro', existing, req));
});
app.get('/api/admin/plans/:id/layout-order', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-plans'])) return;
    const existing = getPlanById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Plan not found.' });
    res.json(buildLevelLayoutState('plan', existing, req));
});
app.get('/api/admin/clients/:id/admin-layout-order', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients'])) return;
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    const unavailable = LAYOUT_LEVELS.admin.unavailable(existing);
    if (unavailable) return res.status(409).json({ message: unavailable });
    res.json(buildLevelLayoutState('admin', existing, req));
});
app.get('/api/admin/clients/:id/layout-order', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-clients'])) return;
    const existing = getClientById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Client not found.' });
    res.json(buildLevelLayoutState('cliente', existing, req));
});

const cleanNames = (list) => (Array.isArray(list) ? list : []).filter((s) => typeof s === 'string').map((s) => s.trim().slice(0, 160)).filter(Boolean).slice(0, 12);
function putLevelLayout(level, req, res) {
    const cfg = LAYOUT_LEVELS[level];
    let existing;
    if (cfg.clientSide) {
        // Niveles de la empresa: el administrador del cliente, o quien tenga Personalizar y el objetivo esté debajo de él en el organigrama.
        if (!req.user.clientId) return res.status(403).json({ message: cfg.noPermission });
        existing = cfg.getTarget(req);
        if (!existing) return res.status(404).json({ message: cfg.notFound });
        if (!layoutLevelAccess(level, req, existing).canPersonalize) return res.status(403).json({ message: cfg.noPermission });
    } else {
        if (denySaasLeaf(req, res, cfg.screenId, [cfg.personalizeLeaf], cfg.noPermission)) return;
        existing = cfg.get(req.params.id);
        if (!existing) return res.status(404).json({ message: cfg.notFound });
        const unavailable = cfg.unavailable ? cfg.unavailable(existing) : null;
        if (unavailable) return res.status(409).json({ message: unavailable });
    }
    const entityId = Number(cfg.entityId ? cfg.entityId(existing) : req.params.id);
    const { customOrder, customAreaOrders, customApartadoOrders, customPantallaOrders, customColumnOrders, classChanges, clearClasses, clearLists, resetAll, changes } = req.body || {};
    // Solo las listas que de verdad se movieron (la pantalla ya no manda todas): customOrder puede faltar.
    if (customOrder !== undefined && !isValidOrderArray(customOrder)) {
        return res.status(400).json({ message: 'customOrder must be an array of section ids.' });
    }
    if (customAreaOrders !== undefined && !isValidOrderMap(customAreaOrders)) {
        return res.status(400).json({ message: 'customAreaOrders must be a map of sectionId to an array of area ids.' });
    }
    if (customApartadoOrders !== undefined && !isValidOrderMap(customApartadoOrders)) {
        return res.status(400).json({ message: 'customApartadoOrders must be a map of "sectionId::areaId" to an array of apartado ids.' });
    }
    if (customPantallaOrders !== undefined && !isValidOrderMap(customPantallaOrders)) {
        return res.status(400).json({ message: 'customPantallaOrders must be a map of "sectionId::areaId::apartadoId" to an array of pantalla ids.' });
    }
    if (customColumnOrders !== undefined && !isValidOrderMap(customColumnOrders)) {
        return res.status(400).json({ message: 'customColumnOrders must be a map of "sectionId::areaId::apartadoId::pantallaId::classId" to an array of column ids.' });
    }
    const rows = [];
    if (customOrder !== undefined) rows.push({ parentKey: PERMISSION_ORDER_ROOT_KEY, orderedKeys: customOrder });
    Object.entries(customAreaOrders || {}).forEach(([sectionId, orderedKeys]) => {
        rows.push({ parentKey: areaOrderKey(sectionId), orderedKeys });
    });
    Object.entries(customApartadoOrders || {}).forEach(([compoundKey, orderedKeys]) => {
        const [sectionId, areaId] = compoundKey.split('::');
        rows.push({ parentKey: apartadoOrderKey(sectionId, areaId), orderedKeys });
    });
    Object.entries(customPantallaOrders || {}).forEach(([compoundKey, orderedKeys]) => {
        const [sectionId, areaId, apartadoId] = compoundKey.split('::');
        rows.push({ parentKey: pantallaOrderKey(sectionId, areaId, apartadoId), orderedKeys });
    });
    Object.entries(customColumnOrders || {}).forEach(([compoundKey, orderedKeys]) => {
        const [sectionId, areaId, apartadoId, pantallaId, classId] = compoundKey.split('::');
        rows.push({ parentKey: columnOrderKey(sectionId, areaId, apartadoId, pantallaId, classId), orderedKeys });
    });
    const classes = (Array.isArray(classChanges) ? classChanges : [])
        .filter((c) => c && typeof c.nodeKey === 'string' && c.nodeKey && typeof c.classificationId === 'string')
        .map((c) => ({ nodeKey: c.nodeKey, classificationId: c.classificationId, classificationLabel: typeof c.classificationLabel === 'string' ? c.classificationLabel.slice(0, 120) : null }));
    const payload = {
        lists: rows,
        clearLists: (Array.isArray(clearLists) ? clearLists : []).filter((k) => typeof k === 'string'),
        classes,
        clearClasses: (Array.isArray(clearClasses) ? clearClasses : []).filter((k) => typeof k === 'string'),
    };
    const names = cleanNames(changes);
    const everything = resetAll === true;
    const nothing = !rows.length && !payload.clearLists.length && !payload.classes.length && !payload.clearClasses.length;
    if (!everything && nothing) return res.json({ ...buildLevelLayoutState(level, existing, req), unchanged: true });
    const changedKeys = [...rows.map((r) => r.parentKey), ...payload.clearLists];
    const classNodeKeys = [...payload.classes.map((c) => c.nodeKey), ...payload.clearClasses];
    const access = layoutLevelAccess(level, req, existing);
    const label = changedByLabel(req);
    // En la empresa los avisos dicen el NOMBRE de quien lo cambió (las personas se conocen); en los niveles de GEIPSA, "Equipo SaaS".
    const personName = req.user.name || req.user.username;
    const levelName = cfg.label(existing);
    const rowClientId = cfg.rowClientId ? cfg.rowClientId(existing) : null;
    if (access.canAuthorize) {
        const result = everything ? clearLevelLayout(level, entityId) : applyLevelLayout(level, entityId, payload, label, rowClientId);
        const touched = (result.listsSaved || 0) + (result.listsCleared || 0) + (result.classesSaved || 0) + (result.classesCleared || 0);
        if (touched > 0) {
            try {
                const lists = names.length ? names : [everything ? `Orden y clasificación de ${levelName}: restablecido` : `Orden y clasificación de ${levelName}`];
                publishLevelLayoutUpdate({
                    level, entityId, lists, changedKeys, classNodeKeys, actorUserId: req.user.sub,
                    actorLabel: cfg.clientSide ? personName : label, requestedByLabel: cfg.clientSide ? personName : '',
                });
            } catch (err) {
                console.error(`No se pudo avisar del orden y clasificación (${level}):`, err);
            }
        }
        return res.json({ ...buildLevelLayoutState(level, existing, req), applied: true });
    }
    // Sin Autorizar: queda como solicitud para quien pueda autorizarla.
    const assignedTo = cfg.clientSide ? resolveClientLayoutAuthorizer(level, req.user.sub, req.user.clientId) : resolveLevelAuthorizer(level, req.user.sub);
    const summary = everything
        ? `${levelName}: restablecer todo el orden y la clasificación`
        : `${levelName}: ${names.join(' · ') || 'orden y clasificación'}`;
    const requestId = createColorRequest({
        scope: 'level', colorId: everything ? `all:${level}:${entityId}` : `layout:${level}:${entityId}`, action: everything ? 'clear-all' : 'set-layout',
        value: everything ? null : JSON.stringify({ ...payload, names, changedKeys, classNodeKeys }), level, entityId, clientId: rowClientId,
        requestedByUserId: req.user.sub, requestedByLabel: cfg.clientSide ? personName : label, assignedToUserId: assignedTo, label: summary,
    });
    res.status(202).json({ ...buildLevelLayoutState(level, existing, req), requested: true, requestId, assignedTo: { id: assignedTo, name: getUserNameById(assignedTo) } });
}
app.put('/api/admin/business-sectors/:id/department-order', requireAuth, requireAdmin, (req, res) => putLevelLayout('giro', req, res));
app.put('/api/admin/plans/:id/layout-order', requireAuth, requireAdmin, (req, res) => putLevelLayout('plan', req, res));
app.put('/api/admin/clients/:id/layout-order', requireAuth, requireAdmin, (req, res) => putLevelLayout('cliente', req, res));
app.put('/api/admin/clients/:id/admin-layout-order', requireAuth, requireAdmin, (req, res) => putLevelLayout('admin', req, res));

// Autorizar o rechazar una solicitud de orden y clasificación de un nivel (llega a la campana de quien tiene "Autorizar" de ese nivel).
function decideLevelRequest(req, res, approve) {
    const request = getColorRequest(Number(req.params.id));
    if (!request || request.scope !== 'level') return res.status(404).json({ message: 'Solicitud no encontrada.' });
    if (request.status !== 'pending') return res.status(409).json({ message: 'Esta solicitud ya se resolvió.' });
    const companyLevel = isClientLayoutLevel(request.level);
    if (companyLevel) {
        // Niveles de la empresa: solo de la misma empresa; la decide a quien se le asignó (o el administrador del cliente).
        if (!req.user.clientId || request.clientId !== req.user.clientId) return res.status(404).json({ message: 'Solicitud no encontrada.' });
        if (!req.user.isClientAdmin && !(userCanAuthorizeLevel(request.level, req.user.sub) && request.assignedToId === req.user.sub)) {
            return res.status(403).json({ message: 'No tienes permiso para autorizar esta solicitud.' });
        }
    } else {
        if (req.user.clientId) return res.status(404).json({ message: 'Solicitud no encontrada.' });
        if (!req.user.isSaasSuperAdmin && !userCanAuthorizeLevel(request.level, req.user.sub)) {
            return res.status(403).json({ message: 'No tienes permiso para autorizar el orden y la clasificación de este nivel.' });
        }
        if (!req.user.isSaasSuperAdmin && request.assignedToId !== req.user.sub) {
            return res.status(403).json({ message: 'Esta solicitud le toca decidirla a otra persona.' });
        }
    }
    const label = changedByLabel(req);
    const personName = req.user.name || req.user.username;
    if (approve) {
        applyColorRequest(request, `${label} (solicitado por ${request.requestedByName})`);
        try {
            let extra = {};
            try { extra = request.value ? JSON.parse(request.value) : {}; } catch { extra = {}; }
            const lists = cleanNames(extra.names);
            publishLevelLayoutUpdate({
                level: request.level, entityId: request.entityId,
                lists: lists.length ? lists : [request.label || 'Orden y clasificación'],
                changedKeys: Array.isArray(extra.changedKeys) ? extra.changedKeys : [], classNodeKeys: Array.isArray(extra.classNodeKeys) ? extra.classNodeKeys : [],
                actorUserId: req.user.sub, actorLabel: companyLevel ? request.requestedByName || personName : label,
                requestedByLabel: companyLevel ? request.requestedByName : '', authorizedByLabel: companyLevel ? personName : '',
            });
        } catch (err) {
            console.error('No se pudo avisar del orden y clasificación autorizado:', err);
        }
    }
    res.json({ request: decideColorRequest(request.id, approve ? 'approved' : 'rejected', { userId: req.user.sub, label }) });
}
app.post('/api/admin/level-color-requests/:id/approve', requireAuth, requireAdmin, (req, res) => decideLevelRequest(req, res, true));
app.post('/api/admin/level-color-requests/:id/reject', requireAuth, requireAdmin, (req, res) => decideLevelRequest(req, res, false));

// --- Perfil y Usuario: lado de la empresa (la pantalla Roles y la pantalla Usuarios) --------------------------------------------------------------
// Estado, guardar y solicitar: el administrador del cliente, o quien tenga Personalizar y el perfil/persona esté debajo de él en el organigrama.
function companyLayoutLevel(req, res) {
    const level = String(req.params.level || '');
    if (!isClientLayoutLevel(level) || !req.user.clientId) {
        res.status(404).json({ message: 'Not found.' });
        return null;
    }
    return level;
}
app.get('/api/business/level-layout/:level/:id', requireAuth, (req, res) => {
    const level = companyLayoutLevel(req, res);
    if (!level) return;
    const cfg = LAYOUT_LEVELS[level];
    const target = cfg.getTarget(req);
    if (!target) return res.status(404).json({ message: cfg.notFound });
    const state = buildLevelLayoutState(level, target, req);
    if (!state.canPersonalize) return res.status(403).json({ message: cfg.noPermission });
    res.json(state);
});
app.put('/api/business/level-layout/:level/:id', requireAuth, (req, res) => {
    const level = companyLayoutLevel(req, res);
    if (!level) return;
    putLevelLayout(level, req, res);
});
app.post('/api/business/level-color-requests/:id/approve', requireAuth, (req, res) => decideLevelRequest(req, res, true));
app.post('/api/business/level-color-requests/:id/reject', requireAuth, (req, res) => decideLevelRequest(req, res, false));
// Los Estatus del Árbol Maestro (solo lectura, cualquier persona de una empresa): es lo que la réplica del árbol necesita para marcar qué está bloqueado arriba.
app.get('/api/business/master-permission-status', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ statuses: getMasterPermissionStatuses() });
});
// Las personas a las que esta cuenta puede cambiarles el orden y la clasificación: el administrador del cliente, todas; los demás, solo las que están debajo de ellos
// en el organigrama. Lo usa la pantalla Usuarios cuando quien la abre no es administrador (su lista completa es solo del administrador).
app.get('/api/business/layout-targets/usuario', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const actor = { id: req.user.sub, isClientAdmin: !!req.user.isClientAdmin };
    const rows = listClientColorTargets(req.user.clientId, req.user.isTestAccount).users
        .filter((u) => clientLayoutAccess('usuario', u.entityId, actor).canPersonalize)
        .map((u) => {
            const positionId = getJobPositionIdForUser(u.entityId);
            return { id: u.entityId, name: u.name, positionName: positionId ? db_getJobPositionName(positionId) : '' };
        });
    res.json({ users: rows });
});

// --- Árbol de Permisos Maestro (GEIPSA-wide node readiness -- does a ---------
// feature exist / is it ready to sell -- independent of any one Sector,
// Plan or client; see master_permission_status in db.js). Global, so
// unlike the Sector routes above there's no :id -- exactly one tree.
const MASTER_PERMISSION_STATUS_VALUES = ['habilitado', 'inhabilitado', 'construccion', 'mejoras'];
app.get('/api/admin/master-permission-status', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-master-permissions-tree','saas-business-sectors','saas-plans','saas-clients'])) return;
    res.json({ statuses: getMasterPermissionStatuses() });
});

app.put('/api/admin/master-permission-status', requireAuth, requireAdmin, (req, res) => {
    const { statuses } = req.body || {};
    if (!Array.isArray(statuses)) return res.status(400).json({ message: 'statuses must be an array.' });
    for (const s of statuses) {
        if (!s || typeof s.sectionId !== 'string' || !s.sectionId) {
            return res.status(400).json({ message: 'each status needs a sectionId.' });
        }
        if (!MASTER_PERMISSION_STATUS_VALUES.includes(s.status)) {
            return res.status(400).json({ message: `status must be one of ${MASTER_PERMISSION_STATUS_VALUES.join(', ')}.` });
        }
    }
    const diff = diffMasterPermissionStatuses(statuses);
    const needed = ['save'];
    if (diff.status) needed.push('status');
    if (diff.platform) needed.push('platform');
    if (denyMasterPermissionsTreeControl(req, res, ...needed)) return;
    res.json({ statuses: setMasterPermissionStatuses(statuses, changedByLabel(req)) });
});

// Purely visual reclassification of one column/acción row -- see
// master_permission_classification_overrides' own DDL comment in db.js for
// why nodeKey (PermissionTree.js's own keyOf() output) is never
// interpreted here, just stored/looked-up verbatim as an opaque string.
// One row at a time (unlike master-permission-status's whole-table
// replace above) -- a picker on a single row calls this, not a bulk save.
app.get('/api/admin/master-permission-classifications', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, 'any')) return;
    res.json({ overrides: getMasterPermissionClassificationOverrides() });
});
app.put('/api/admin/master-permission-classifications', requireAuth, requireAdmin, (req, res) => {
    const { nodeKey, classificationId, classificationLabel } = req.body || {};
    if (typeof nodeKey !== 'string' || !nodeKey) {
        return res.status(400).json({ message: 'nodeKey is required.' });
    }
    if (denyMasterPermissionsTreeControl(req, res, 'classify')) return;
    // An empty/null classificationId means "put this column back under its
    // own real structural classification" -- just remove the exception row.
    if (!classificationId) {
        deleteMasterPermissionClassificationOverride(nodeKey, changedByLabel(req));
        return res.json({ override: null });
    }
    if (typeof classificationId !== 'string') {
        return res.status(400).json({ message: 'classificationId must be a string.' });
    }
    if (classificationLabel !== undefined && classificationLabel !== null && typeof classificationLabel !== 'string') {
        return res.status(400).json({ message: 'classificationLabel must be a string.' });
    }
    res.json({ override: setMasterPermissionClassificationOverride(nodeKey, classificationId, classificationLabel, changedByLabel(req)) });
});

// One color per classification (real or custom), shared by every column
// reclassified into it -- see master_permission_classification_colors' own
// DDL comment in db.js. Same one-row-at-a-time shape as the overrides
// route above.
app.get('/api/admin/master-permission-classification-colors', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, 'any')) return;
    res.json({ colors: getClassificationColors() });
});
// Read-only twin of the route above, for the same global colors, reachable
// by any authenticated business user (client admin or regular staff) --
// PermissionCostTree.js's clientTricolor mode (Nuestros Clientes'/Business-
// Usuarios'/Business-MisAccesos' own trees) needs to DISPLAY a classification
// group's already-set color, same as the master tree does, but those screens
// never run as role:'admin' so the /api/admin/* route above 403s them. Never
// exposes write access -- only GEIPSA's own Árbol Maestro can set colors.
app.get('/api/business/master-permission-classification-colors', requireAuth, (req, res) => {
    res.json({ colors: getClassificationColors() });
});
app.put('/api/admin/master-permission-classification-colors', requireAuth, requireAdmin, (req, res) => {
    const { classificationId, color, textColor } = req.body || {};
    if (typeof classificationId !== 'string' || !classificationId) {
        return res.status(400).json({ message: 'classificationId is required.' });
    }
    if (denyMasterPermissionsTreeControl(req, res, 'colors')) return;
    // El color de una COLUMNA solo se aplica si quien lo pide puede autorizarlo; si no, queda como solicitud
    // (202) para quien le toque (ver requestColorChange). El de una clasificación completa se aplica directo.
    if (isColumnColorId(classificationId) && !canApplyColorsDirectly('master', req)) {
        const isText = textColor !== undefined;
        const value = isText ? textColor : color;
        if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
            return res.status(400).json({ message: `${isText ? 'textColor' : 'color'} must be a hex color like #7f77dd.` });
        }
        return requestColorChange('master', req, res, classificationId, isText ? 'set-text' : 'set', value);
    }
    // textColor recolors only the classification badge's TEXT (see the "A"
    // picker button in PermissionTree.js), independent of the dot/
    // background `color` below -- mutually exclusive per request, same one-
    // field-at-a-time shape the rest of this route already had.
    if (textColor !== undefined) {
        if (typeof textColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(textColor)) {
            return res.status(400).json({ message: 'textColor must be a hex color like #7f77dd.' });
        }
        const changed = colorWouldChange(getClassificationColors(), classificationId, true, textColor);
        const saved = setClassificationTextColor(classificationId, textColor, changedByLabel(req));
        if (changed) noticeColorChange('master', req, classificationId, 'set-text', textColor);
        return res.json({ textColor: saved });
    }
    // Free-form now (see Más Colores in PermissionTree.js) -- any real hex
    // color is valid, not just the 8 quick-swatch presets.
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
        return res.status(400).json({ message: 'color must be a hex color like #7f77dd.' });
    }
    const changed = colorWouldChange(getClassificationColors(), classificationId, false, color);
    const saved = setClassificationColor(classificationId, color, changedByLabel(req));
    if (changed) noticeColorChange('master', req, classificationId, 'set', color);
    res.json({ color: saved });
});
// "Restablecer" -- clears ONE of a classification's (or a column's own
// "col-own:"/"col-nested:") two colors back to "nothing chosen"; kind is
// 'dot' (fill) or 'text'. Never an error when there was nothing saved:
// `cleared` just says whether anything actually changed.
app.delete('/api/admin/master-permission-classification-colors', requireAuth, requireAdmin, (req, res) => {
    const classificationId = typeof req.query.classificationId === 'string' ? req.query.classificationId : '';
    const kind = req.query.kind;
    if (!classificationId) return res.status(400).json({ message: 'classificationId is required.' });
    if (kind !== 'dot' && kind !== 'text') return res.status(400).json({ message: "kind must be 'dot' or 'text'." });
    if (denyMasterPermissionsTreeControl(req, res, 'colors')) return;
    if (isColumnColorId(classificationId) && !canApplyColorsDirectly('master', req)) {
        return requestColorChange('master', req, res, classificationId, kind === 'text' ? 'clear-text' : 'clear-dot', null);
    }
    const cleared = clearClassificationColor(classificationId, kind, changedByLabel(req));
    if (cleared) noticeColorChange('master', req, classificationId, kind === 'text' ? 'clear-text' : 'clear-dot', null);
    res.json({ cleared });
});

// Read-only, any logged-in user (not admin-only like the routes above) --
// this is what lets a real data table's own column legend/band colors
// follow whatever an admin set in Árbol de Permisos Maestro, instead of
// that reclassification staying purely cosmetic to the permission tree.
// tableKey is the same key Dashboard.js's own TABLE_GRANT_PATHS uses.
// Lo mismo para las tablas reales de SaaS (Nuestros Clientes, Equipo SaaS...): los colores de columna
// (Encabezado/Filas) ya autorizados en el Árbol Maestro SaaS, por data-col.
app.get('/api/admin/saas-table-column-colors', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, 'any')) return;
    const tableKey = typeof req.query.tableKey === 'string' ? req.query.tableKey : '';
    if (!tableKey) return res.status(400).json({ message: 'tableKey is required.' });
    res.json({ columns: getSaasTableColumnColors(tableKey) });
});
// El orden de Departamentos, Áreas, Apartados y Pantallas que le toca a esta persona: el del Árbol Maestro y, bajando, el de
// su Giro, Plan, Cliente, Administrador, Perfil y Usuario (gana el más cercano a ella). Misma forma que
// GET /api/admin/master-permission-order; una lista que nadie tocó no aparece (sigue el orden de menu.json).
app.get('/api/business/permission-order', requireAuth, (req, res) => {
    // Con ?level=&entityId= (perfil o persona de su empresa): el orden de ese nivel, para los árboles de permisos que edita el
    // administrador del cliente (Roles, Usuarios). Sin ellos, el de quien pregunta.
    if (req.query.level) {
        if (!req.user.clientId || !req.user.isClientAdmin) return res.status(403).json({ message: 'Client admin access required.' });
        const target = resolveClientColorTarget(req.user.clientId, String(req.query.level), req.query.entityId, req.user.isTestAccount);
        if (!target) return res.status(404).json({ message: 'Not found.' });
        const { sources, ...orders } = getOrderTreeForTarget(target.level, target.entityId, req.user.clientId);
        return res.json(orders);
    }
    const viewer = req.user.clientId ? { userId: req.user.sub, clientId: req.user.clientId } : null;
    res.json(getEffectiveOrdersForViewer(viewer));
});
// Las clasificaciones de columna de un nivel de la empresa (?level=perfil|usuario&entityId=, administrador del cliente) o, sin
// parámetros, las de quien pregunta, para los árboles de permisos (Roles, Usuarios, Mis Accesos).
app.get('/api/business/permission-classifications', requireAuth, (req, res) => {
    if (req.query.level) {
        if (!req.user.clientId || !req.user.isClientAdmin) return res.status(403).json({ message: 'Client admin access required.' });
        const target = resolveClientColorTarget(req.user.clientId, String(req.query.level), req.query.entityId, req.user.isTestAccount);
        if (!target) return res.status(404).json({ message: 'Not found.' });
        return res.json({ overrides: getEffectiveClassificationOverridesForTarget(target.level, target.entityId, req.user.clientId) });
    }
    res.json({ overrides: getEffectiveClassificationOverridesForViewer(req.user.clientId ? { userId: req.user.sub, clientId: req.user.clientId } : null) });
});
app.get('/api/business/table-classifications', requireAuth, (req, res) => {
    const tableKey = typeof req.query.tableKey === 'string' ? req.query.tableKey : '';
    if (!tableKey) return res.status(400).json({ message: 'tableKey is required.' });
    // Una persona de un cliente ve el color de cada columna ya resuelto hacia abajo (giro, plan, cliente,
    // administrador, perfil, usuario); una cuenta SaaS ve el del Maestro.
    const viewer = req.user.clientId ? { userId: req.user.sub, clientId: req.user.clientId } : null;
    // columnGroups: el orden de columnas que le toca a esta persona (solo los grupos que difieren de menu.json); la tabla real lo usa
    // como orden inicial mientras la persona no haya guardado su propio acomodo.
    res.json({ columns: getEffectiveColumnClassifications(tableKey, viewer), columnGroups: getCascadedColumnGroups(tableKey, viewer) });
});

// Lo mismo del lado SaaS, para los árboles de permisos de Giro, Plan, Cliente y del Administrador de un cliente (?clientId=).
function resolveSaasTreeTarget(req) {
    const level = String(req.query.level || '');
    if (SAAS_COLOR_TARGET_LEVELS.includes(level)) return { target: resolveSaasColorLevelTarget(level, req.query.entityId), clientId: null };
    if (level === 'admin') {
        const clientId = Number(req.query.clientId);
        return { target: Number.isInteger(clientId) && clientId > 0 ? resolveClientColorTarget(clientId, 'admin', null) : null, clientId };
    }
    return { target: null, clientId: null };
}
app.get('/api/admin/permission-order', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-business-sectors','saas-plans','saas-clients'])) return;
    const { target, clientId } = resolveSaasTreeTarget(req);
    if (!target) return res.status(404).json({ message: 'Not found.' });
    const { sources, ...orders } = getOrderTreeForTarget(target.level, target.entityId, clientId);
    res.json(orders);
});
// Las clasificaciones de columna de ese nivel (Maestro y lo de cada nivel de arriba), para los árboles que las muestran.
app.get('/api/admin/permission-classifications', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-business-sectors','saas-plans','saas-clients'])) return;
    const { target, clientId } = resolveSaasTreeTarget(req);
    if (!target) return res.status(404).json({ message: 'Not found.' });
    res.json({ overrides: getEffectiveClassificationOverridesForTarget(target.level, target.entityId, clientId) });
});

// Árbol de Permisos Maestro's own "Cambios" column (see
// master_permission_change_log's DDL comment in db.js) -- admin-only, same
// as every other master-tree write route, since this is reading THEIR own
// edit history. classificationId is optional: pass it only when nodeKey is
// a classification's own group row, so the merged result also includes
// that classification's color changes.
app.get('/api/admin/master-permission-change-log', requireAuth, requireAdmin, (req, res) => {
    const nodeKey = typeof req.query.nodeKey === 'string' ? req.query.nodeKey : '';
    if (!nodeKey) return res.status(400).json({ message: 'nodeKey is required.' });
    const classificationId = typeof req.query.classificationId === 'string' && req.query.classificationId ? req.query.classificationId : null;
    if (denyMasterPermissionsTreeControl(req, res, 'history')) return;
    res.json({ entries: getMasterPermissionChangeLog(nodeKey, classificationId) });
});

// Auditoría de Límites (solo lectura): por cliente, cuántos permisos efectivos de sus usuarios incumplirían "ningún nivel da más de lo que
// le deja el de arriba" (módulo no contratado, Estatus no visible, fuera del contrato del plan). Modo solo registro: no bloquea nada.
// Solo admin_saas o quien tenga el acceso "Ver la auditoría" (saas-limits-audit, controles::a0).
app.get('/api/admin/limits-audit', requireAuth, requireAdmin, (req, res) => {
    if (!hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-limits-audit', 'controles::a0', req.user.isSaasSuperAdmin)) {
        return res.status(403).json({ message: 'No tienes acceso a la Auditoría de Límites.' });
    }
    res.json({ clients: scanLimitViolations() });
});

// Reinicio del Sistema: borra todos los registros de uso (clientes, usuarios de clientes, capturas, historiales) y deja la configuración, para
// empezar de cero la creación de clientes. Solo el administrador principal (admin_saas). Tres seguros para borrar: un respaldo de la última
// hora, la frase escrita y la variable ALLOW_SYSTEM_RESET=true (se pone en Railway solo mientras se usa). El respaldo, la vista previa y la
// descarga no borran nada. Ver systemReset.js.
const SYSTEM_RESET_PHRASE = 'BORRAR TODOS LOS REGISTROS';
let systemResetRunning = false;

function requireSystemResetAccess(req, res, next) {
    if (!req.user?.isSaasSuperAdmin) return res.status(403).json({ message: 'Solo el administrador principal puede reiniciar el sistema.' });
    next();
}

// Cuántos archivos de clientes hay en R2 (evidencias y material de apoyo); sin R2 configurado (local), cero.
async function countClientFiles() {
    if (!isR2Configured()) return { configured: false, count: 0, error: null };
    try {
        let count = 0;
        for (const prefix of FILE_PREFIXES) count += (await listR2Keys(prefix)).length;
        return { configured: true, count, error: null };
    } catch (err) {
        return { configured: true, count: 0, error: err.message };
    }
}

// Qué ve el servidor de la variable ALLOW_SYSTEM_RESET, para que la pantalla diga qué corregir en Railway cuando no la reconoce: 'ok', 'absent' (no
// existe con ese nombre), 'format' (el valor es true pero con mayúsculas, comillas o espacios) o 'wrong-value'. Solo devuelve NOMBRES de variables
// parecidas (p. ej. una con "=true" pegado en el nombre), nunca valores.
function systemResetVariableState() {
    const raw = process.env.ALLOW_SYSTEM_RESET;
    const similar = Object.keys(process.env).filter((name) => name !== 'ALLOW_SYSTEM_RESET' && /ALLOW|RESET/i.test(name)).slice(0, 5);
    if (raw === 'true') return { state: 'ok', similar };
    if (raw === undefined) return { state: 'absent', similar };
    const loose = String(raw).trim().replace(/^["']|["']$/g, '').toLowerCase() === 'true';
    return { state: loose ? 'format' : 'wrong-value', similar };
}

app.get('/api/admin/system-reset/status', requireAuth, requireAdmin, requireSystemResetAccess, async (req, res) => {
    const lastBackup = systemReset.lastBackup();
    res.json({
        enabled: process.env.ALLOW_SYSTEM_RESET === 'true',
        variable: systemResetVariableState(),
        phrase: SYSTEM_RESET_PHRASE,
        preview: systemReset.preview(),
        groups: { delete: GROUPS_TO_DELETE, keep: GROUPS_TO_KEEP },
        lastBackup,
        backupFresh: systemReset.backupIsFresh(lastBackup),
        backupMaxAgeMinutes: MAX_BACKUP_AGE_MS / 60000,
        files: await countClientFiles(),
    });
});

app.post('/api/admin/system-reset/backup', requireAuth, requireAdmin, requireSystemResetAccess, (req, res) => {
    try {
        res.json({ backup: systemReset.createBackup() });
    } catch (err) {
        console.error('[system-reset] backup failed:', err.message);
        res.status(500).json({ message: 'No se pudo crear el respaldo.' });
    }
});

app.get('/api/admin/system-reset/backups/:id/download', requireAuth, requireAdmin, requireSystemResetAccess, (req, res) => {
    const file = systemReset.backupFilePath(req.params.id);
    if (!file) return res.status(404).json({ message: 'Respaldo no encontrado.' });
    res.download(file, `${req.params.id}.sqlite`);
});

app.post('/api/admin/system-reset/run', requireAuth, requireAdmin, requireSystemResetAccess, async (req, res) => {
    if (process.env.ALLOW_SYSTEM_RESET !== 'true') {
        return res.status(403).json({ message: 'El reinicio está desactivado: falta la variable ALLOW_SYSTEM_RESET=true.', code: 'reset-disabled' });
    }
    if (req.body?.phrase !== SYSTEM_RESET_PHRASE) {
        return res.status(400).json({ message: 'La frase de confirmación no coincide.', code: 'phrase-mismatch' });
    }
    if (systemResetRunning) return res.status(409).json({ message: 'Ya hay un reinicio en curso.', code: 'in-progress' });
    systemResetRunning = true;
    try {
        const result = systemReset.run();
        // Cierra todas las sesiones anteriores (también la de quien lo pidió): los usuarios borrados ya no existen.
        setSessionsValidAfter(Math.ceil(Date.now() / 1000));
        console.warn(`[system-reset] registros borrados por ${req.user.username}: ${result.totalRows} filas (respaldo ${result.backup.file})`);
        const files = { deleted: 0, error: null };
        if (isR2Configured()) {
            try {
                const keys = [];
                for (const prefix of FILE_PREFIXES) keys.push(...await listR2Keys(prefix));
                files.deleted = await deleteR2Keys(keys);
            } catch (err) {
                files.error = err.message;
                console.error('[system-reset] no se pudieron borrar los archivos de R2:', err.message);
            }
        }
        res.json({ ok: true, totalRows: result.totalRows, deleted: result.deleted, backup: result.backup.file, files });
    } catch (err) {
        if (err.code === 'backup-required' || err.code === 'unclassified-tables') return res.status(409).json({ message: err.message, code: err.code });
        console.error('[system-reset] failed:', err);
        res.status(500).json({ message: 'No se pudo completar el reinicio; no se borró nada.' });
    } finally {
        systemResetRunning = false;
    }
});

// Árbol Maestro SaaS -- same shape as master-permission-status above, but
// for GEIPSA's own internal screens (see saas_master_status's own comment
// in db.js for why this is a separate table/route rather than reusing
// master_permission_status). Never touches that other table.
app.get('/api/admin/saas-master-status', requireAuth, requireAdmin, (req, res) => {
    res.json({ statuses: getSaasMasterStatuses() });
});

// Los controles de esta pantalla son accesos del catálogo (saas-master-tree > controles > a0..a7, ver
// public/SaasAdminCatalog.js y canUse en Admin-ArbolMaestroSaaS.js): leer el árbol lo puede todo admin
// (lo necesita cada pantalla para su barra lateral), pero cambiarlo pide el acceso de ese control.
const SAAS_MASTER_TREE_CONTROLS = {
    save: { sub: 'controles::a0', message: 'No tienes permiso para guardar el Árbol Maestro SaaS.' },
    status: { sub: 'controles::a1', message: 'No tienes permiso para cambiar estatus en el Árbol Maestro SaaS.' },
    platform: { sub: 'controles::a2', message: 'No tienes permiso para cambiar Web y App en el Árbol Maestro SaaS.' },
    classify: { sub: 'controles::a3', message: 'No tienes permiso para cambiar clasificaciones en el Árbol Maestro SaaS.' },
    colors: { sub: 'controles::a4', message: 'No tienes permiso para personalizar colores en el Árbol Maestro SaaS.' },
    reorder: { sub: 'controles::a5', message: 'No tienes permiso para reordenar el Árbol Maestro SaaS.' },
    history: { sub: 'controles::a7', message: 'No tienes permiso para ver los cambios del Árbol Maestro SaaS.' },
    authorize: { sub: 'controles::a8', message: 'No tienes permiso para autorizar colores en el Árbol Maestro SaaS.' },
};
// true si respondió 403 (la ruta debe terminar ahí).
function denySaasMasterTreeControl(req, res, ...controls) {
    const grants = getSaasUserGrants(req.user.sub);
    for (const control of controls) {
        const { sub, message } = SAAS_MASTER_TREE_CONTROLS[control];
        if (!hasSaasGrant(grants, 'saas-master-tree', sub, req.user.isSaasSuperAdmin)) {
            res.status(403).json({ message });
            return true;
        }
    }
    return false;
}
// Árbol de Permisos Maestro (el de clientes): lo mismo, controles::a0..a12 de 'saas-master-permissions-tree' en
// public/SaasAdminCatalog.js (las pestañas, Navegar y Autorizar solo viven en pantalla / en la solicitud).
const MASTER_PERMISSIONS_TREE_CONTROLS = {
    save: { sub: 'controles::a2', message: 'No tienes permiso para guardar el Árbol de Permisos Maestro.' },
    currency: { sub: 'controles::a3', message: 'No tienes permiso para cambiar la moneda del Árbol de Permisos Maestro.' },
    status: { sub: 'controles::a4', message: 'No tienes permiso para cambiar estatus en el Árbol de Permisos Maestro.' },
    platform: { sub: 'controles::a5', message: 'No tienes permiso para cambiar Web y App en el Árbol de Permisos Maestro.' },
    costs: { sub: 'controles::a6', message: 'No tienes permiso para cambiar costos en el Árbol de Permisos Maestro.' },
    classify: { sub: 'controles::a7', message: 'No tienes permiso para cambiar clasificaciones en el Árbol de Permisos Maestro.' },
    colors: { sub: 'controles::a8', message: 'No tienes permiso para personalizar colores en el Árbol de Permisos Maestro.' },
    reorder: { sub: 'controles::a9', message: 'No tienes permiso para reordenar el Árbol de Permisos Maestro.' },
    history: { sub: 'controles::a11', message: 'No tienes permiso para ver los cambios del Árbol de Permisos Maestro.' },
    authorize: { sub: 'controles::a12', message: 'No tienes permiso para autorizar colores en el Árbol de Permisos Maestro.' },
};
function denyMasterPermissionsTreeControl(req, res, ...controls) {
    const grants = getSaasUserGrants(req.user.sub);
    for (const control of controls) {
        const { sub, message } = MASTER_PERMISSIONS_TREE_CONTROLS[control];
        if (!hasSaasGrant(grants, 'saas-master-permissions-tree', sub, req.user.isSaasSuperAdmin)) {
            res.status(403).json({ message });
            return true;
        }
    }
    return false;
}
// Para cualquier árbol ('saas' o 'master'): ¿esta cuenta aplica los colores de columna directo (super admin o
// con "Autorizar colores") o deja una solicitud?
function canApplyColorsDirectly(scope, req) {
    if (req.user.isSaasSuperAdmin) return true;
    const isMaster = scope === 'master';
    return hasSaasGrant(
        getSaasUserGrants(req.user.sub),
        isMaster ? 'saas-master-permissions-tree' : 'saas-master-tree',
        (isMaster ? MASTER_PERMISSIONS_TREE_CONTROLS : SAAS_MASTER_TREE_CONTROLS).authorize.sub,
        false,
    );
}
// El nombre de la columna que la pantalla del árbol manda al pedir un cambio ("Nuestros Clientes › Tabla principal › RFC"), para la campana de Notificaciones.
function colorRequestLabel(req) {
    const raw = (req.body && req.body.label) ?? req.query?.label;
    return typeof raw === 'string' ? raw.trim().slice(0, 200) : '';
}
// Avisa a los que tienen acceso a ese árbol que un color se actualizó (y le confirma a quien lo hizo a quién le llegó); nunca debe romper el guardado.
function noticeColorChange(scope, req, colorId, action, value) {
    try {
        publishColorUpdate({ scope, colorId, action, value, label: colorRequestLabel(req), actorUserId: req.user.sub, actorLabel: changedByLabel(req) });
    } catch (err) {
        console.error('No se pudo avisar del color actualizado:', err);
    }
}
// Un reorden guardado en un árbol: aviso para todos los que tienen acceso a él y confirmación para quien lo hizo. La pantalla manda los nombres de las listas que movió.
function noticeOrderChange(scope, req, changedKeys = null) {
    try {
        publishOrderUpdate({ scope, lists: req.body && req.body.changes, changedKeys, actorUserId: req.user.sub, actorLabel: changedByLabel(req) });
    } catch (err) {
        console.error('No se pudo avisar del reorden:', err);
    }
}
// Una solicitud autorizada: el aviso va a todos los del árbol menos a quien la pidió (ya recibe su "Autorizada"); la confirmación es de quien la autorizó.
function noticeApprovedColor(request, req, authorizedByLabel) {
    try {
        publishColorUpdate({
            scope: request.scope, colorId: request.colorId, action: request.action, value: request.value, label: request.label,
            actorUserId: req.user.sub, actorLabel: authorizedByLabel, requestedByUserId: request.requestedById, requestedByLabel: request.requestedByName, authorizedByLabel,
        });
    } catch (err) {
        console.error('No se pudo avisar del color autorizado:', err);
    }
}
// ¿Cambia de verdad el color guardado? (guardar el mismo color otra vez no avisa a nadie)
function colorWouldChange(rows, classificationId, isText, next) {
    const row = (rows || []).find((c) => c.classificationId === classificationId);
    const prev = row ? (isText ? row.textColor : row.color) : null;
    return !prev || String(prev).toLowerCase() !== String(next).toLowerCase();
}
function requestColorChange(scope, req, res, colorId, action, value) {
    const assignedTo = resolveColorAuthorizer(scope, req.user.sub);
    const requestId = createColorRequest({
        scope, colorId, action, value, label: colorRequestLabel(req),
        requestedByUserId: req.user.sub, requestedByLabel: changedByLabel(req), assignedToUserId: assignedTo,
    });
    res.status(202).json({ requested: true, requestId, assignedTo: { id: assignedTo, name: getUserNameById(assignedTo) } });
}
// Rutas de solicitudes de color de un árbol: cada quien ve las suyas y las pendientes que le tocan decidir
// (un super admin ve todas las pendientes); decide quien tenga "Autorizar colores" y a quien le llegó.
function registerColorRequestRoutes(scope, basePath, denyFn) {
    app.get(basePath, requireAuth, requireAdmin, (req, res) => {
        const userId = req.user.sub;
        const canAuthorize = !!req.user.isSaasSuperAdmin || userCanAuthorizeColors(scope, userId);
        const requests = listColorRequestsForUser(scope, { userId, isSuperAdmin: !!req.user.isSaasSuperAdmin })
            .map((r) => ({ ...r, canDecide: canAuthorize && r.status === 'pending' && (!!req.user.isSaasSuperAdmin || r.assignedToId === userId) }));
        res.json({ requests, canAuthorize, toDecide: requests.filter((r) => r.canDecide).length });
    });
    const decide = (approve) => (req, res) => {
        if (denyFn(req, res, 'authorize')) return;
        const request = getColorRequest(Number(req.params.id));
        if (!request || request.scope !== scope) return res.status(404).json({ message: 'Solicitud no encontrada.' });
        if (request.status !== 'pending') return res.status(409).json({ message: 'Esta solicitud ya se resolvió.' });
        if (!req.user.isSaasSuperAdmin && request.assignedToId !== req.user.sub) {
            return res.status(403).json({ message: 'Esta solicitud le toca decidirla a otra persona.' });
        }
        const label = changedByLabel(req);
        if (approve) {
            applyColorRequest(request, `${label} (solicitado por ${request.requestedByName})`);
            noticeApprovedColor(request, req, label);
        }
        res.json({ request: decideColorRequest(request.id, approve ? 'approved' : 'rejected', { userId: req.user.sub, label }) });
    };
    app.post(`${basePath}/:id/approve`, requireAuth, requireAdmin, decide(true));
    app.post(`${basePath}/:id/reject`, requireAuth, requireAdmin, decide(false));
}
registerColorRequestRoutes('master', '/api/admin/master-color-requests', denyMasterPermissionsTreeControl);

// Qué cambió entre lo guardado y lo que llega (mismos valores por defecto que setSaasMasterStatuses).
function diffSaasMasterStatuses(before, after) {
    const norm = (r) => ({
        status: (r && r.status) || 'habilitado',
        web: r ? r.webEnabled !== false : true,
        app: r ? r.appEnabled === true : false,
    });
    const b = new Map(before.map((r) => [r.itemId, r]));
    const a = new Map(after.filter((r) => r && r.itemId).map((r) => [r.itemId, r]));
    const diff = { status: false, platform: false };
    for (const id of new Set([...b.keys(), ...a.keys()])) {
        const x = norm(b.get(id));
        const y = norm(a.get(id));
        if (x.status !== y.status) diff.status = true;
        if (x.web !== y.web || x.app !== y.app) diff.platform = true;
    }
    return diff;
}

app.put('/api/admin/saas-master-status', requireAuth, requireAdmin, (req, res) => {
    const { statuses } = req.body || {};
    if (!Array.isArray(statuses)) return res.status(400).json({ message: 'statuses must be an array.' });
    for (const s of statuses) {
        if (!s || typeof s.itemId !== 'string' || !s.itemId) {
            return res.status(400).json({ message: 'each status needs a non-empty string itemId.' });
        }
        if (!MASTER_PERMISSION_STATUS_VALUES.includes(s.status)) {
            return res.status(400).json({ message: `status must be one of ${MASTER_PERMISSION_STATUS_VALUES.join(', ')}.` });
        }
    }
    const diff = diffSaasMasterStatuses(getSaasMasterStatuses(), statuses);
    const needed = ['save'];
    if (diff.status) needed.push('status');
    if (diff.platform) needed.push('platform');
    if (denySaasMasterTreeControl(req, res, ...needed)) return;
    res.json({ statuses: setSaasMasterStatuses(statuses, changedByLabel(req)) });
});

app.get('/api/admin/saas-master-order', requireAuth, requireAdmin, (req, res) => {
    res.json({ order: getSaasMasterOrder() });
});

// order is an opaque {groups, screensByGroup} blob (see
// Admin-ArbolMaestroSaaS.js) -- this route doesn't need to understand its
// shape, same as every other admin-only order/preferences blob in this file.
app.put('/api/admin/saas-master-order', requireAuth, requireAdmin, (req, res) => {
    const { order } = req.body || {};
    if (!order || typeof order !== 'object' || Array.isArray(order)) {
        return res.status(400).json({ message: 'order must be an object.' });
    }
    if (denySaasMasterTreeControl(req, res, 'save', 'reorder')) return;
    const before = JSON.stringify(getSaasMasterOrder());
    const saved = setSaasMasterOrder(order, changedByLabel(req));
    // La pantalla manda qué listas movió (req.body.changes); solo si de verdad cambió el orden se avisa a los del árbol.
    if (JSON.stringify(saved) !== before) noticeOrderChange('saas', req);
    res.json({ order: saved });
});

// Árbol Maestro SaaS's own Clasificación + color + Cambios routes -- same
// shape as their master-permission-* equivalents above, but against the
// completely separate saas_classification_*/saas_master_change_log tables
// (see those tables' own DDL comments in db.js for why this screen never
// shares state with the real Árbol de Permisos Maestro).
app.get('/api/admin/saas-classification-overrides', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-master-tree'])) return;
    res.json({ overrides: getSaasClassificationOverrides() });
});
app.put('/api/admin/saas-classification-overrides', requireAuth, requireAdmin, (req, res) => {
    const { nodeKey, classificationId, classificationLabel } = req.body || {};
    if (typeof nodeKey !== 'string' || !nodeKey) {
        return res.status(400).json({ message: 'nodeKey is required.' });
    }
    if (denySaasMasterTreeControl(req, res, 'classify')) return;
    if (!classificationId) {
        deleteSaasClassificationOverride(nodeKey, changedByLabel(req));
        return res.json({ override: null });
    }
    if (typeof classificationId !== 'string') {
        return res.status(400).json({ message: 'classificationId must be a string.' });
    }
    if (classificationLabel !== undefined && classificationLabel !== null && typeof classificationLabel !== 'string') {
        return res.status(400).json({ message: 'classificationLabel must be a string.' });
    }
    res.json({ override: setSaasClassificationOverride(nodeKey, classificationId, classificationLabel, changedByLabel(req)) });
});

app.get('/api/admin/saas-classification-colors', requireAuth, requireAdmin, (req, res) => {
    res.json({ colors: getSaasClassificationColors() });
});
// El color de una COLUMNA (Encabezado/Filas) se aplica a las tablas reales solo cuando lo autoriza quien
// tiene "Autorizar colores" (o un super admin): quien solo puede personalizar deja una solicitud (202)
// que le llega a su jefe directo, subiendo hasta quien pueda autorizar (ver resolveSaasColorAuthorizer
// en db.js). El color de una clasificación completa se sigue aplicando directo.
const isColumnColorId = (id) => /^col-(own|nested):/.test(id);
function canApplySaasColorsDirectly(req) {
    return !!req.user.isSaasSuperAdmin
        || hasSaasGrant(getSaasUserGrants(req.user.sub), 'saas-master-tree', SAAS_MASTER_TREE_CONTROLS.authorize.sub, false);
}
function requestSaasColorChange(req, res, colorId, action, value) {
    const assignedTo = resolveSaasColorAuthorizer(req.user.sub);
    const requestId = createColorRequest({
        scope: 'saas', colorId, action, value, label: colorRequestLabel(req),
        requestedByUserId: req.user.sub, requestedByLabel: changedByLabel(req), assignedToUserId: assignedTo,
    });
    res.status(202).json({ requested: true, requestId, assignedTo: { id: assignedTo, name: getUserNameById(assignedTo) } });
}
app.put('/api/admin/saas-classification-colors', requireAuth, requireAdmin, (req, res) => {
    const { classificationId, color, textColor } = req.body || {};
    if (typeof classificationId !== 'string' || !classificationId) {
        return res.status(400).json({ message: 'classificationId is required.' });
    }
    if (denySaasMasterTreeControl(req, res, 'colors')) return;
    const isText = textColor !== undefined;
    const value = isText ? textColor : color;
    if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
        return res.status(400).json({ message: `${isText ? 'textColor' : 'color'} must be a hex color like #7f77dd.` });
    }
    if (isColumnColorId(classificationId) && !canApplySaasColorsDirectly(req)) {
        return requestSaasColorChange(req, res, classificationId, isText ? 'set-text' : 'set', value);
    }
    const changed = colorWouldChange(getSaasClassificationColors(), classificationId, isText, value);
    if (isText) {
        const saved = setSaasClassificationTextColor(classificationId, value, changedByLabel(req));
        if (changed) noticeColorChange('saas', req, classificationId, 'set-text', value);
        return res.json({ textColor: saved });
    }
    const saved = setSaasClassificationColor(classificationId, value, changedByLabel(req));
    if (changed) noticeColorChange('saas', req, classificationId, 'set', value);
    res.json({ color: saved });
});
// "Restablecer" -- same as master-permission-classification-colors' DELETE
// above, against this screen's own table/log.
app.delete('/api/admin/saas-classification-colors', requireAuth, requireAdmin, (req, res) => {
    const classificationId = typeof req.query.classificationId === 'string' ? req.query.classificationId : '';
    const kind = req.query.kind;
    if (!classificationId) return res.status(400).json({ message: 'classificationId is required.' });
    if (kind !== 'dot' && kind !== 'text') return res.status(400).json({ message: "kind must be 'dot' or 'text'." });
    if (denySaasMasterTreeControl(req, res, 'colors')) return;
    if (isColumnColorId(classificationId) && !canApplySaasColorsDirectly(req)) {
        return requestSaasColorChange(req, res, classificationId, kind === 'text' ? 'clear-text' : 'clear-dot', null);
    }
    const cleared = clearSaasClassificationColor(classificationId, kind, changedByLabel(req));
    if (cleared) noticeColorChange('saas', req, classificationId, kind === 'text' ? 'clear-text' : 'clear-dot', null);
    res.json({ cleared });
});

// Solicitudes de color de columna del Árbol Maestro SaaS: cada quien ve las suyas y las pendientes que le
// tocan decidir (un super admin ve todas las pendientes); decide quien tenga "Autorizar colores" y a
// quien le llegó (o un super admin).
app.get('/api/admin/saas-color-requests', requireAuth, requireAdmin, (req, res) => {
    const userId = req.user.sub;
    const canAuthorize = !!req.user.isSaasSuperAdmin || userCanAuthorizeSaasColors(userId);
    const requests = listColorRequestsForUser('saas', { userId, isSuperAdmin: !!req.user.isSaasSuperAdmin })
        .map((r) => ({ ...r, canDecide: canAuthorize && r.status === 'pending' && (!!req.user.isSaasSuperAdmin || r.assignedToId === userId) }));
    res.json({ requests, canAuthorize, toDecide: requests.filter((r) => r.canDecide).length });
});
function decideSaasColorRequest(req, res, approve) {
    if (denySaasMasterTreeControl(req, res, 'authorize')) return;
    const request = getColorRequest(Number(req.params.id));
    if (!request || request.scope !== 'saas') return res.status(404).json({ message: 'Solicitud no encontrada.' });
    if (request.status !== 'pending') return res.status(409).json({ message: 'Esta solicitud ya se resolvió.' });
    if (!req.user.isSaasSuperAdmin && request.assignedToId !== req.user.sub) {
        return res.status(403).json({ message: 'Esta solicitud le toca decidirla a otra persona.' });
    }
    const label = changedByLabel(req);
    if (approve) {
        applySaasColorRequest(request, `${label} (solicitado por ${request.requestedByName})`);
        noticeApprovedColor(request, req, label);
    }
    res.json({ request: decideColorRequest(request.id, approve ? 'approved' : 'rejected', { userId: req.user.sub, label }) });
}
app.post('/api/admin/saas-color-requests/:id/approve', requireAuth, requireAdmin, (req, res) => decideSaasColorRequest(req, res, true));
app.post('/api/admin/saas-color-requests/:id/reject', requireAuth, requireAdmin, (req, res) => decideSaasColorRequest(req, res, false));

// Read-only -- feeds the classification-color stripe on Equipo SaaS's own
// Historial de cambios (Admin-EquipoSaaS.js's openSaasUserChanges). Mirrors
// /api/business/table-classifications' shape, keyed by field_key instead of
// column id since that's what a saas_user_changes row already carries.
app.get('/api/admin/saas-user-field-classifications', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-team'])) return;
    res.json({ fields: getEffectiveSaasUserFieldClassifications() });
});

app.get('/api/admin/saas-master-change-log', requireAuth, requireAdmin, (req, res) => {
    const nodeKey = typeof req.query.nodeKey === 'string' ? req.query.nodeKey : '';
    if (!nodeKey) return res.status(400).json({ message: 'nodeKey is required.' });
    const classificationId = typeof req.query.classificationId === 'string' && req.query.classificationId ? req.query.classificationId : null;
    if (denySaasMasterTreeControl(req, res, 'history')) return;
    res.json({ entries: getSaasMasterChangeLog(nodeKey, classificationId) });
});

// Self-service, not admin-only in the "manage everyone" sense -- any Panel
// Admin account reorders only their OWN view of a category's tile grid
// (Servicio a Cliente / Configuración SaaS), never anyone else's. Falls
// back to saas_master_order when this account hasn't personally reordered
// this category yet -- confirmed with the user this must show up on the
// real screen they operate the App from (renderCategorySection in
// AppAdminInicio.js), same cascade relationship Master has to a Sector's
// own reorder.
const SAAS_PERSONAL_ORDER_CATEGORIES = ['customerService', 'saasConfig'];
app.get('/api/me/saas-personal-order/:categoryId', requireAuth, requireAdmin, (req, res) => {
    const { categoryId } = req.params;
    if (!SAAS_PERSONAL_ORDER_CATEGORIES.includes(categoryId)) {
        return res.status(400).json({ message: `categoryId must be one of ${SAAS_PERSONAL_ORDER_CATEGORIES.join(', ')}.` });
    }
    const personalOrder = getSaasPersonalOrder(req.user.sub, categoryId);
    const master = getSaasMasterOrder();
    const masterOrder = (master?.screensByGroup && master.screensByGroup[categoryId]) || null;
    res.json({ personalOrder, masterOrder });
});
app.put('/api/me/saas-personal-order/:categoryId', requireAuth, requireAdmin, (req, res) => {
    const { categoryId } = req.params;
    if (!SAAS_PERSONAL_ORDER_CATEGORIES.includes(categoryId)) {
        return res.status(400).json({ message: `categoryId must be one of ${SAAS_PERSONAL_ORDER_CATEGORIES.join(', ')}.` });
    }
    const { orderedItems } = req.body || {};
    if (!isValidOrderArray(orderedItems)) {
        return res.status(400).json({ message: 'orderedItems must be an array of item ids.' });
    }
    res.json({ personalOrder: setSaasPersonalOrder(req.user.sub, categoryId, orderedItems) });
});

app.get('/api/admin/master-permission-order', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-master-permissions-tree'])) return;
    const row = getMasterPermissionOrder().find((r) => r.parentKey === PERMISSION_ORDER_ROOT_KEY);
    res.json({
        departmentOrder: row ? row.orderedKeys : [],
        areaOrders: buildMasterOrdersByPrefix('area::'),
        apartadoOrders: buildMasterOrdersByPrefix('apartado::'),
        pantallaOrders: buildMasterOrdersByPrefix('pantalla::'),
        columnOrders: buildMasterOrdersByPrefix('columna::'),
    });
});

app.put('/api/admin/master-permission-order', requireAuth, requireAdmin, (req, res) => {
    if (denyMasterPermissionsTreeControl(req, res, 'save', 'reorder')) return;
    const { departmentOrder, areaOrders, apartadoOrders, pantallaOrders, columnOrders } = req.body || {};
    if (!isValidOrderArray(departmentOrder)) {
        return res.status(400).json({ message: 'departmentOrder must be an array of section ids.' });
    }
    if (areaOrders !== undefined && !isValidOrderMap(areaOrders)) {
        return res.status(400).json({ message: 'areaOrders must be a map of sectionId to an array of area ids.' });
    }
    if (apartadoOrders !== undefined && !isValidOrderMap(apartadoOrders)) {
        return res.status(400).json({ message: 'apartadoOrders must be a map of "sectionId::areaId" to an array of apartado ids.' });
    }
    if (pantallaOrders !== undefined && !isValidOrderMap(pantallaOrders)) {
        return res.status(400).json({ message: 'pantallaOrders must be a map of "sectionId::areaId::apartadoId" to an array of pantalla ids.' });
    }
    if (columnOrders !== undefined && !isValidOrderMap(columnOrders)) {
        return res.status(400).json({ message: 'columnOrders must be a map of "sectionId::areaId::apartadoId::pantallaId::classId" to an array of column ids.' });
    }
    const rows = [{ parentKey: PERMISSION_ORDER_ROOT_KEY, orderedKeys: departmentOrder }];
    Object.entries(areaOrders || {}).forEach(([sectionId, orderedKeys]) => {
        rows.push({ parentKey: areaOrderKey(sectionId), orderedKeys });
    });
    Object.entries(apartadoOrders || {}).forEach(([compoundKey, orderedKeys]) => {
        const [sectionId, areaId] = compoundKey.split('::');
        rows.push({ parentKey: apartadoOrderKey(sectionId, areaId), orderedKeys });
    });
    Object.entries(pantallaOrders || {}).forEach(([compoundKey, orderedKeys]) => {
        const [sectionId, areaId, apartadoId] = compoundKey.split('::');
        rows.push({ parentKey: pantallaOrderKey(sectionId, areaId, apartadoId), orderedKeys });
    });
    Object.entries(columnOrders || {}).forEach(([compoundKey, orderedKeys]) => {
        const [sectionId, areaId, apartadoId, pantallaId, classId] = compoundKey.split('::');
        rows.push({ parentKey: columnOrderKey(sectionId, areaId, apartadoId, pantallaId, classId), orderedKeys });
    });
    const orderRows = () => new Map(getMasterPermissionOrder().map((r) => [r.parentKey, JSON.stringify(r.orderedKeys)]));
    const orderBefore = orderRows();
    setMasterPermissionOrders(rows, changedByLabel(req));
    // Las listas cuyo orden cambió de verdad: de ellas depende a qué personas de los clientes les toca el aviso (las de esas áreas y pantallas).
    const changedKeys = [...orderRows()].filter(([key, value]) => orderBefore.get(key) !== value).map(([key]) => key);
    if (changedKeys.length) noticeOrderChange('master', req, changedKeys);
    const row = getMasterPermissionOrder().find((r) => r.parentKey === PERMISSION_ORDER_ROOT_KEY);
    res.json({
        departmentOrder: row ? row.orderedKeys : [],
        areaOrders: buildMasterOrdersByPrefix('area::'),
        apartadoOrders: buildMasterOrdersByPrefix('apartado::'),
        pantallaOrders: buildMasterOrdersByPrefix('pantalla::'),
        columnOrders: buildMasterOrdersByPrefix('columna::'),
    });
});

// --- Equipo SaaS (GEIPSA's own staff — role='admin' accounts) ---------------
// Before this, the only way to have a role='admin' account was the seeded
// admin/admin user — no endpoint ever created another one. This is the
// first: any existing admin can create more (requireAdmin, not a narrower
// "can manage staff" grant — that would need a grant to bootstrap itself
// out of, a chicken-and-egg problem this small a team doesn't need solved).
app.get('/api/admin/saas-users', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, 'any')) return;
    res.json({ users: listSaasAdmins() });
});

app.post('/api/admin/saas-users', requireAuth, requireAdmin, async (req, res) => {
    if (denySaasLeaf(req, res, 'saas-team', ['tabla::a0'], 'No tienes permiso para crear cuentas del equipo.')) return;
    const { username, email, password, name } = req.body || {};
    if (!username || !email || !name || !password || password.length < 8) {
        return res.status(400).json({ message: 'username, email, name and a password of at least 8 characters are required.' });
    }
    if (usernameOrEmailExists(username, email)) {
        return res.status(409).json({ message: 'Username or email already taken.' });
    }
    const user = createUser({ username, email, passwordHash: await hashPassword(password), name, role: 'admin' });
    logSaasUserChange({ userId: user.id, recordLabel: user.username, action: 'create', changedBy: changedByLabel(req) });
    res.status(201).json({
        user: { id: user.id, username: user.username, email: user.email, name: user.name, active: user.active, created_at: user.created_at },
    });
});

// Confirmed live, 2026-09-28: "ningún usuario se puede eliminar, solo se
// pueden colocar en estatus diferente" -- same rule already established for
// client business users, replacing the delete route this used to be.
// Can't deactivate your own session's account (locks you out with no other
// way back in from here) -- getSaasUserById's own role='admin' scoping is
// what stops this route from ever reaching a client user's row, no matter
// what id is sent.
app.patch('/api/admin/saas-users/:id', requireAuth, requireAdmin, (req, res) => {
    if (denySaasLeaf(req, res, 'saas-team', ['tabla::a0','tabla::ta0'], 'No tienes permiso para cambiar cuentas del equipo.')) return;
    if (denySuperAdminTarget(req, res, req.params.id)) return;
    const targetId = Number(req.params.id);
    const { active, name, username } = req.body || {};
    if (active === undefined && name === undefined && username === undefined) return res.status(400).json({ message: 'Nothing to update.' });
    if (active !== undefined) {
        if (typeof active !== 'boolean') return res.status(400).json({ message: 'active must be a boolean.' });
        if (!active && targetId === req.user.sub) return res.status(400).json({ message: "You can't deactivate your own account." });
        const updated = setSaasUserActive(targetId, active, changedByLabel(req));
        if (!updated) return res.status(404).json({ message: 'SaaS account not found.' });
    }
    if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'name must be a non-empty string.' });
        const updated = setSaasUserName(targetId, name.trim(), changedByLabel(req));
        if (!updated) return res.status(404).json({ message: 'SaaS account not found.' });
    }
    // username -- confirmed live, 2026-09-28: renaming the seeded admin
    // account to admin_saas. Same UNIQUE constraint as creation/registration,
    // checked here first instead of letting the UPDATE throw.
    if (username !== undefined) {
        if (typeof username !== 'string' || !username.trim()) return res.status(400).json({ message: 'username must be a non-empty string.' });
        const trimmed = username.trim();
        if (isSaasUsernameTaken(trimmed, targetId)) return res.status(409).json({ message: 'Username already taken.' });
        const updated = setSaasUserUsername(targetId, trimmed, changedByLabel(req));
        if (!updated) return res.status(404).json({ message: 'SaaS account not found.' });
    }
    res.json({ user: getSaasUserById(targetId) });
});

// Same "nobody has (or remembers) this account's password" reset as a
// client's own Reestablecer Contraseña, just for a SaaS/GEIPSA account --
// returns the new password ONCE, the same way provisionTrainingAccount's
// own generatedPassword does, since it's never stored recoverably.
app.post('/api/admin/saas-users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
    if (denySaasLeaf(req, res, 'saas-team', ['tabla::a0','tabla::ta0'], 'No tienes permiso para restablecer contraseñas del equipo.')) return;
    if (denySuperAdminTarget(req, res, req.params.id)) return;
    const target = getSaasUserById(req.params.id);
    if (!target) return res.status(404).json({ message: 'SaaS account not found.' });
    const { password } = await resetSaasUserPassword(req.params.id, changedByLabel(req));
    res.json({ password });
});

// "Control de Cambios" -- generic (whole Equipo SaaS) and per-row, same
// pair every other admin screen already has (confirmed live, 2026-09-28:
// "debe tener los mismos [campos] que todos los demás registros de
// cambios") -- see saas_user_changes' own DDL comment in db.js for why this
// is its own table instead of reusing data_table_changes (that one's
// client_id-scoped and its own route 404s for admin accounts).
app.get('/api/admin/saas-users/changes', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-team'])) return;
    res.json({ changes: getAllSaasUserChanges() });
});
app.get('/api/admin/saas-users/:id/changes', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-team'])) return;
    // ?nodeKey= : solo los cambios de una fila del árbol de accesos (y lo que cuelga de ella).
    res.json({ changes: getSaasUserChanges(req.params.id, req.query.nodeKey) });
});

function validateSaasGrants(grants) {
    if (!Array.isArray(grants)) return 'grants must be an array.';
    for (const g of grants) {
        if (!g || typeof g.itemId !== 'string' || !g.itemId) return 'Each grant needs a non-empty itemId.';
    }
    return null;
}

app.get('/api/admin/saas-users/:id/grants', requireAuth, requireAdmin, (req, res) => {
    if (denySaasScreen(req, res, ['saas-team'])) return;
    // visibleStatuses rides along here too -- the "¿Qué Estatus puede ver?"
    // chips live in this same edit-access modal (confirmed live,
    // 2026-09-27: "Sí, ahí mismo en el modal"), so both load in one trip.
    res.json({ grants: getSaasUserGrants(req.params.id), visibleStatuses: getUserVisibleStatuses(req.params.id) });
});

app.put('/api/admin/saas-users/:id/grants', requireAuth, requireAdmin, (req, res) => {
    if (denySaasLeaf(req, res, 'saas-team', ['tabla::ta0'], 'No tienes permiso para cambiar los accesos de una cuenta.')) return;
    const { grants } = req.body || {};
    const error = validateSaasGrants(grants);
    if (error) return res.status(400).json({ message: error });
    if (denySuperAdminTarget(req, res, req.params.id)) return;
    const target = getSaasUserById(req.params.id);
    const before = getSaasUserGrants(req.params.id);
    if (denySaasTeamEscalation(req, res, req.params.id, { grantsBefore: before, grantsAfter: grants })) return;
    const after = setSaasUserGrants(req.params.id, grants);
    // Un registro por cada fila del árbol que se dio o se quitó (con su node_key), para
    // que el icono de Cambios de cada fila diga quién la tocó y cuándo.
    const grantNodeKey = (g) => (g.subItemId ? `${g.itemId}::${g.subItemId}` : g.itemId);
    const beforeKeys = new Set(before.map(grantNodeKey));
    const afterKeys = new Set(after.map(grantNodeKey));
    const logGrantChange = (nodeKey, nowGranted) => logSaasUserChange({
        userId: req.params.id, recordLabel: target?.username, action: 'update', fieldKey: 'business.saasUserGrant', nodeKey,
        oldValue: String(!nowGranted), newValue: String(nowGranted), changedBy: changedByLabel(req),
    });
    afterKeys.forEach((key) => { if (!beforeKeys.has(key)) logGrantChange(key, true); });
    beforeKeys.forEach((key) => { if (!afterKeys.has(key)) logGrantChange(key, false); });
    res.json({ grants: after });
});

// Which of habilitado/inhabilitado/construccion/mejoras this GEIPSA/SaaS
// staff account is allowed to see anything under (see visible_statuses'
// own migration comment in db.js) — every real staff account starts at
// just habilitado; Pruebas_SGN and any other account an admin widens
// see the rest too. Same shape as the client-side route below.
app.put('/api/admin/saas-users/:id/visible-statuses', requireAuth, requireAdmin, (req, res) => {
    if (denySaasLeaf(req, res, 'saas-team', ['tabla::ta0'], 'No tienes permiso para cambiar los Estatus de una cuenta.')) return;
    const { statuses } = req.body || {};
    if (!Array.isArray(statuses) || statuses.some((s) => !ALL_ESTATUS_VALUES.includes(s))) {
        return res.status(400).json({ message: `statuses must be an array of: ${ALL_ESTATUS_VALUES.join(', ')}.` });
    }
    if (denySuperAdminTarget(req, res, req.params.id)) return;
    if (denySaasTeamEscalation(req, res, req.params.id, { statuses })) return;
    const target = getSaasUserById(req.params.id);
    const before = getUserVisibleStatuses(req.params.id);
    const after = setUserVisibleStatuses(req.params.id, statuses);
    if (before.join(',') !== after.join(',')) {
        logSaasUserChange({
            userId: req.params.id, recordLabel: target?.username, action: 'update', fieldKey: 'admin.visibleStatusesLabel',
            oldValue: before.join(', '), newValue: after.join(', '), changedBy: changedByLabel(req),
        });
    }
    res.json({ visibleStatuses: after });
});

// The current admin's own SaaS grants — used by Dashboard.js to filter the
// sidebar/block direct URLs, and by Nuestros Planes to decide whether to
// even show the Activar button. Not client-scoped (this is a role='admin'
// account, never has a clientId). visibleStatuses/saasStatusOverrides let
// Dashboard.js resolve the Estatus gate the same way business-profile does
// for the client-facing sidebar (see getUserBusinessProfileById in db.js).
app.get('/api/me/saas-grants', requireAuth, requireAdmin, (req, res) => {
    res.json({
        grants: getSaasUserGrants(req.user.sub),
        visibleStatuses: getUserVisibleStatuses(req.user.sub),
        saasStatusOverrides: getSaasStatusOverrides(),
    });
});

// --- Business admin: users, profiles, and permission grants ------------------
// "Administración del Negocio" — the client company's own admin tooling for
// managing its users, reusable permission profiles ("perfiles"), and each
// profile/user's access to modules ("módulos"), sections within them
// ("apartados"), and individual pages ("pantallas") — the same three levels
// as public/data/menu.json (section > item > submenu entry).
//
// Access: requireAuth + requireClientAdmin — only the one auto-provisioned
// admin for a client can reach these, and every query below is additionally
// scoped to req.user.clientId so clients can never see each other's data.
// Regla de límites 1 (módulo no contratado): un permiso NUEVO no puede ser de un departamento que la empresa no contrató. Solo revisa los
// permisos que se agregan; los que ya estaban guardados se quedan como están (la Auditoría de Límites los cuenta). 'main' (General) no es
// un departamento contratable. Responde 400 con el departamento y devuelve true si rechazó; el aviso en pantalla lo arma el cliente con labelKey.
function rejectUncontractedNewGrants(res, clientId, grantsBefore, grantsAfter) {
    const keyOf = (g) => `${g.sectionId}::${g.itemId || ''}::${g.submenuId || ''}`;
    const had = new Set(grantsBefore.map(keyOf));
    const contracted = new Set(getClientModuleKeys(clientId));
    const bad = grantsAfter.find((g) => g.sectionId !== 'main' && !contracted.has(g.sectionId) && !had.has(keyOf(g)));
    if (!bad) return false;
    const mod = MODULE_CATALOG.find((m) => m.key === bad.sectionId);
    res.status(400).json({
        message: `El departamento (${bad.sectionId}) no está contratado por esta empresa.`,
        code: 'module-not-contracted',
        sectionId: bad.sectionId,
        labelKey: mod ? mod.labelKey : null,
    });
    return true;
}

// Resumen de lo que las reglas de límites 2 y 3 quitaron de un guardado (ver clampNewGrantsToLimits en db.js); null si no se quitó nada.
function summarizeDroppedGrants(dropped) {
    if (!dropped.length) return null;
    return {
        count: dropped.length,
        status: dropped.filter((d) => d.kinds.includes('status')).length,
        contract: dropped.filter((d) => d.kinds.includes('contract')).length,
        assignment: dropped.filter((d) => d.kinds.includes('assignment')).length,
    };
}

function validateGrants(grants) {
    if (!Array.isArray(grants)) return 'grants must be an array.';
    for (const g of grants) {
        if (!g || typeof g.sectionId !== 'string' || !g.sectionId) {
            return 'each grant needs a sectionId.';
        }
    }
    return null;
}

// Any authenticated user AT a client needs this to filter their OWN
// sidebar/top-bar correctly (department picker, the 7 top-bar buttons) —
// not just that client's admin. Read-only, scoped to the caller's own
// clientId, same reasoning as /api/business/branding below.
app.get('/api/business/contracted-modules', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ moduleKeys: getClientModuleKeys(req.user.clientId) });
});

// Branding (company name, logo, institutional colors) — any authenticated
// user AT a client can see their own company's branding, not just that
// client's admin (everyone on the team sees the same sidebar identity).
// GEIPSA/SGN staff (no clientId) get a 404: there's no client to brand for.
// Backs the "Aplicación Móvil" tab in the permission tree (Otorgar Accesos /
// Nuestros Perfiles) and, later, the mobile home screen — any authenticated
// business user can read it (same visibility as branding/client-data above),
// it's just "what App does my company have" info, nothing sensitive.
app.get('/api/business/app-screens', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json(getClientAppScreens(req.user.clientId));
});

app.get('/api/business/branding', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const branding = getClientBranding(req.user.clientId);
    if (!branding) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ branding });
});

// Self-service: only the client's own admin can change their branding
// (logo + institutional palette), and only for their own client_id — never
// company_name/status/plan, which stay GEIPSA-controlled (see Admin-SaaS).
app.put('/api/business/branding', requireAuth, requireClientAdmin, (req, res) => {
    const { logoDataUrl, seedColor, colorPalette } = req.body || {};
    const error = validateLogo(logoDataUrl) || validateSeedColor(seedColor) || validateColorPalette(colorPalette);
    if (error) return res.status(400).json({ message: error });
    const branding = updateClientBranding(req.user.clientId, { logoDataUrl, seedColor, colorPalette });
    res.json({ branding });
});

// Datos de Cliente (misión, visión, valores, historia) — read-only here on
// purpose: GEIPSA sets these from Clientes Nuevos (Admin-SaaS), the client's
// own team can only view them. Same visibility as branding: any
// authenticated user at the client, not just their admin.
app.get('/api/business/client-data', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const profile = getClientProfile(req.user.clientId);
    if (!profile) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ profile });
});

app.get('/api/business/users', requireAuth, requireClientAdmin, (req, res) => {
    res.json({ users: listBusinessUsers(req.user.clientId) });
});

// No POST here — users are never created directly on this screen. Each one
// is auto-provisioned the moment its person is registered in Mi Recurso
// Humano (see createHrWorker in db.js); this screen only enables/disables
// the account and assigns its profiles/permissions below.
// Historial de cambios de las pantallas de administración del negocio (Usuarios,
// Roles, Estructura Organizacional, Reglas de Orden de Llenado): una fila de
// data_table_changes por cambio, igual que las demás pantallas del cliente.
// fieldKey es la clave de i18n del nombre del campo; sin valores, el diálogo
// muestra solo ese nombre ("Rol reestablecido").
function logBusinessChange(req, tableKey, recordId, recordLabel, fieldKey, oldValue, newValue) {
    logTableChange({
        clientId: req.user.clientId, tableKey, recordId, recordLabel, action: 'update',
        fieldKey, oldValue, newValue, changedBy: changedByLabel(req),
    });
}
// Huella de una lista de permisos, sin importar el orden, para saber si cambió.
const grantsSignature = (grants) => (grants || []).map((g) => JSON.stringify(g)).sort().join('|');

app.patch('/api/business/users/:id', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.is_client_admin) return res.status(403).json({ message: "This user's access is managed from GEIPSA, not here." });
    const { active } = req.body || {};
    if (typeof active !== 'boolean') {
        return res.status(400).json({ message: 'active must be a boolean.' });
    }
    setUserActive(req.params.id, active);
    if (!!user.active !== active) {
        logBusinessChange(req, 'usuarios', user.id, user.name || user.username, 'business.accesosOperationalStatusCol', user.active ? 'Activo' : 'Inactivo', active ? 'Activo' : 'Inactivo');
    }
    res.json({ user: { ...user, active: active ? 1 : 0 } });
});

// The auto-provisioned client admin (is_client_admin) is managed from the
// GEIPSA side only (Admin-SaaS > "Accesos del Administrador" — see
// /api/admin/clients/:id/admin-access below), never from this client's own
// Administración del Negocio — hence the 403s below on every route in this
// file that would otherwise let a client touch that one user's
// profiles/grants.
// Self-service version of the route below -- any authenticated business
// user can check their OWN active permissions ("Servicio Contratado" ->
// "Mis Accesos y Permisos"), no admin grant required, since it's their own
// data. Same Puesto + extra shape "Permisos Activados" already uses.
app.get('/api/business/me/grants', requireAuth, (req, res) => {
    // El administrador del cliente no tiene permisos propios guardados: ve todo lo que su empresa contrató. Su árbol se pinta con el
    // contrato (verde = incluido en el plan, amarillo = adicional contratado) y lo que existe en su giro y no contrató queda bloqueado.
    // `giroGrants` (null si no hay plan, entonces no se filtra) deja el árbol solo con lo que existe en su giro.
    const client = req.user.clientId ? getClientById(req.user.clientId) : null;
    const plan = client && client.plan ? getPlanByName(client.plan) : null;
    if (req.user.isClientAdmin && req.user.clientId) {
        return res.json({
            isClientAdmin: true,
            jobPositionGrants: plan ? getPlanGrants(plan.id) : [],
            grants: getClientPermissionGrants(req.user.clientId),
            giroGrants: plan && plan.businessSectorId ? getSectorGrants(plan.businessSectorId) : null,
        });
    }
    // Un usuario (con su perfil) ve todo lo que su empresa tiene contratado: lo que le habilitaron sale normal y lo demás, bloqueado.
    // `contractGrants` (plan + adicionales; null si no hay plan, entonces no se filtra) deja el árbol solo con lo contratado.
    res.json({
        grants: getUserGrants(req.user.sub),
        jobPositionGrants: getUserJobPositionGrants(req.user.sub),
        contractGrants: getClientContractGrants(req.user.clientId),
    });
});

// Lo contratado por la empresa del administrador (plan + adicionales; null sin plan): los editores de Perfil y Usuario lo usan para mostrar con
// candado lo que no se puede dar (las mismas reglas que clampNewGrantsToLimits aplica al guardar).
app.get('/api/business/contract-grants', requireAuth, requireClientAdmin, (req, res) => {
    res.json({ contractGrants: getClientContractGrants(req.user.clientId) });
});

// "Cambios" por nodo del árbol contratado del administrador (Mis Accesos): el historial del contrato de SU cliente, nunca el de otro.
app.get('/api/business/me/contract-change-log', requireAuth, requireClientAdmin, (req, res) => {
    const { nodeKey } = req.query || {};
    if (!nodeKey) return res.status(400).json({ message: 'nodeKey is required.' });
    res.json({ entries: getClientPermissionChangeLog(req.user.clientId, nodeKey) });
});

// Per-node "Cambios" for Business-MisAccesos.js's own read-only tricolor
// tree -- scoped implicitly to req.user.sub (never a userId query param),
// since this route is "my own history", reachable by any authenticated
// business user, not just a client admin.
app.get('/api/business/me/grant-change-log', requireAuth, (req, res) => {
    const { nodeKey } = req.query || {};
    if (!nodeKey) return res.status(400).json({ message: 'nodeKey is required.' });
    res.json({ entries: getUserGrantChangeLog(req.user.sub, nodeKey) });
});

// Lo que da su Puesto y, como dados, los centros de costos de su «Asignación a laborar» (lo asignado los habilita aunque el Puesto no los traiga): así el árbol los muestra en verde.
function jobPositionGrantsWithAssignment(userId) {
    const position = getUserJobPositionGrants(userId);
    const have = new Set(position.filter((g) => g.itemId === 'cc-list').map((g) => g.submenuId));
    return [...position, ...getHrAssignedCenterGrants(userId).filter((g) => !have.has(g.submenuId))];
}

app.get('/api/business/users/:id/grants', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.is_client_admin) return res.status(403).json({ message: "This user's access is managed from GEIPSA, not here." });
    // grants = "Permisos Adicionales", the extra layer this screen's own
    // edit modal manages; jobPositionGrants = everything this user already
    // gets by default from their own Puesto de Trabajo (see Roles) --
    // surfaced here too so "Permisos Activados" (read-only) can show the
    // full effective picture (Puesto + adicionales) without a second round
    // trip. visibleStatuses is the "¿Qué Estatus puede ver?" chips this
    // same modal now also edits (confirmed live, 2026-09-27: "Sí, ahí
    // mismo en el modal").
    res.json({
        grants: getUserGrants(req.params.id),
        jobPositionGrants: jobPositionGrantsWithAssignment(req.params.id),
        visibleStatuses: getUserVisibleStatuses(req.params.id),
        // Los Estatus que esta cuenta (la del administrador) puede dar: un nivel no da más de lo que ve el de arriba.
        assignableStatuses: getUserVisibleStatuses(req.user.sub),
        // Lo contratado por la empresa: "Permisos Activados" deja en el árbol solo eso (lo no contratado no se muestra).
        contractGrants: getClientContractGrants(req.user.clientId),
        // Los centros de costos de su «Asignación a laborar» (Mi Recurso Humano): el árbol bloquea, con su motivo, los que no están. null = esa persona no tiene asignación (sin límite).
        assignedCostCenterIds: getHrAssignedCenterIds(req.params.id),
    });
});

app.put('/api/business/users/:id/grants', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.is_client_admin) return res.status(403).json({ message: "This user's access is managed from GEIPSA, not here." });
    const { grants } = req.body || {};
    const error = validateGrants(grants);
    if (error) return res.status(400).json({ message: error });
    const grantsBefore = getUserGrants(req.params.id);
    if (rejectUncontractedNewGrants(res, req.user.clientId, grantsBefore, grants)) return;
    const limited = clampNewGrantsToLimits({ clientId: req.user.clientId, visibleStatuses: getUserVisibleStatuses(req.user.sub), before: grantsBefore, after: grants, allowedCenterIds: getHrAssignedCenterIds(req.params.id) });
    const savedGrants = setUserGrants(req.params.id, limited.allowed, changedByLabel(req));
    if (grantsSignature(grantsBefore) !== grantsSignature(savedGrants)) {
        logBusinessChange(req, 'usuarios', user.id, user.name || user.username, 'business.historyExtraGrants', grantsBefore.length, savedGrants.length);
        notifyAccessChange({ req, affectedUsers: [{ id: user.id, name: user.name || user.username }], scopeKind: 'usuario', before: grantsBefore, after: savedGrants });
    }
    res.json({ grants: savedGrants, dropped: summarizeDroppedGrants(limited.dropped) });
});

// Per-node "Cambios" for the tree above -- same reasoning as the client
// permission-grants one just above, scoped by userId instead of clientId.
// getUserById already scopes the lookup to req.user.clientId, so a client
// admin can never pull another client's user's grant history even by
// guessing a userId.
app.get('/api/business/user-grant-change-log', requireAuth, requireClientAdmin, (req, res) => {
    const { userId, nodeKey } = req.query || {};
    if (!userId || !nodeKey) return res.status(400).json({ message: 'userId and nodeKey are required.' });
    const user = getUserById(userId, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ entries: getUserGrantChangeLog(userId, nodeKey) });
});

// Which of habilitado/inhabilitado/construccion/mejoras this business user
// is allowed to see anything under (see visible_statuses' own migration
// comment in db.js) -- every real user starts at just habilitado; only the
// client's own Usuario de Pruebas (Cuenta de Capacitación,
// provisionTrainingAccount) sees the rest by default. Same
// is_client_admin exclusion as the grants route above -- that account's
// own access (Usuario de Pruebas included) is managed from GEIPSA.
app.put('/api/business/users/:id/visible-statuses', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.is_client_admin) return res.status(403).json({ message: "This user's access is managed from GEIPSA, not here." });
    const { statuses } = req.body || {};
    if (!Array.isArray(statuses) || statuses.some((s) => !ALL_ESTATUS_VALUES.includes(s))) {
        return res.status(400).json({ message: `statuses must be an array of: ${ALL_ESTATUS_VALUES.join(', ')}.` });
    }
    // El administrador solo puede dar los Estatus que su propia cuenta ve (ningún nivel da más de lo que le deja el de arriba).
    const assignable = getUserVisibleStatuses(req.user.sub);
    if (statuses.some((s) => !assignable.includes(s))) {
        return res.status(403).json({ message: 'No puedes dar a un usuario un Estatus que tu propia cuenta no puede ver.' });
    }
    const statusesBefore = getUserVisibleStatuses(req.params.id);
    const savedStatuses = setUserVisibleStatuses(req.params.id, statuses);
    if ([...statusesBefore].sort().join(',') !== [...savedStatuses].sort().join(',')) {
        logBusinessChange(req, 'usuarios', user.id, user.name || user.username, 'business.historyVisibleStatuses', statusesBefore.join(', '), savedStatuses.join(', '));
    }
    res.json({ visibleStatuses: savedStatuses });
});

// "Reestablecer Rol" -- wipes this user's Permisos Adicionales entirely, so
// their effective access goes back to exactly what their Puesto de Trabajo
// grants (getUserJobPositionGrants), nothing more. There's no separate
// "removed from role" state to restore here: user_grants is purely
// additive (see setUserGrants above), so clearing it is already the full
// reset.
app.post('/api/business/users/:id/reset-role', requireAuth, requireClientAdmin, (req, res) => {
    const user = getUserById(req.params.id, req.user.clientId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.is_client_admin) return res.status(403).json({ message: "This user's access is managed from GEIPSA, not here." });
    logBusinessChange(req, 'usuarios', user.id, user.name || user.username, 'business.historyResetRole', '', '');
    const grantsBeforeReset = getUserGrants(req.params.id);
    const grantsAfterReset = setUserGrants(req.params.id, []);
    if (grantsBeforeReset.length) {
        notifyAccessChange({ req, affectedUsers: [{ id: user.id, name: user.name || user.username }], scopeKind: 'usuario', before: grantsBeforeReset, after: grantsAfterReset });
    }
    res.json({ grants: grantsAfterReset });
});

// Bulk version of the above -- every user at this client (listBusinessUsers
// already excludes the client admin) gets their Permisos Adicionales
// cleared in one pass, so the whole client's access matches its Roles
// configuration exactly.
app.post('/api/business/users/reset-all-roles', requireAuth, requireClientAdmin, (req, res) => {
    const affected = listBusinessUsers(req.user.clientId);
    affected.forEach((u) => {
        setUserGrants(u.id, []);
        logBusinessChange(req, 'usuarios', u.id, u.name || u.username, 'business.historyResetRole', '', '');
    });
    res.json({ count: affected.length });
});

// Roles: what a Puesto de Trabajo grants by default to anyone hired into it
// (see job_position_grants, hr_workers.job_position_id) -- replaces the old
// freely-named Perfiles entirely; the catalog itself (create/rename/
// deactivate a Puesto) is still managed from Business-PuestosTrabajo.html /
// GET-POST-PATCH-DELETE /api/business/job-positions above.
app.get('/api/business/job-positions/:id/grants', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getJobPositionById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Job position not found.' });
    res.json({ grants: getJobPositionGrants(req.params.id) });
});

app.put('/api/business/job-positions/:id/grants', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getJobPositionById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Job position not found.' });
    const { grants } = req.body || {};
    const error = validateGrants(grants);
    if (error) return res.status(400).json({ message: error });
    const roleGrantsBefore = getJobPositionGrants(req.params.id);
    if (rejectUncontractedNewGrants(res, req.user.clientId, roleGrantsBefore, grants)) return;
    const limited = clampNewGrantsToLimits({ clientId: req.user.clientId, visibleStatuses: getUserVisibleStatuses(req.user.sub), before: roleGrantsBefore, after: grants });
    const savedRoleGrants = setJobPositionGrants(req.params.id, limited.allowed);
    if (grantsSignature(roleGrantsBefore) !== grantsSignature(savedRoleGrants)) {
        logBusinessChange(req, 'business-roles', existing.id, existing.name, 'business.historyRoleGrants', roleGrantsBefore.length, savedRoleGrants.length);
        // A quienes ocupan el puesto les llega el aviso como personas afectadas.
        const holders = Array.from(userIdsOfJobPosition(existing.id)).map((id) => {
            const u = getUserById(id, req.user.clientId);
            return u ? { id: u.id, name: u.name || u.username } : null;
        }).filter(Boolean);
        notifyAccessChange({ req, affectedUsers: holders, scopeKind: 'perfil', scopeName: existing.name, before: roleGrantsBefore, after: savedRoleGrants });
    }
    res.json({ grants: savedRoleGrants, dropped: summarizeDroppedGrants(limited.dropped) });
});

// Nuestra Estructura Organizacional's own "bosquejo" edge -- which OTHER
// Puesto this one reports to (see the reports_to_job_position_id migration
// in db.js). Kept as its own route rather than folded into the generic
// PATCH /job-positions above: this is an admin-only structural edit, not a
// Control-Interno column subject to Ver/Operar/Editar/Autorizar.
app.put('/api/business/job-positions/:id/reports-to', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getJobPositionById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Job position not found.' });
    const { reportsToJobPositionId } = req.body || {};
    if (reportsToJobPositionId != null) {
        if (Number(reportsToJobPositionId) === existing.id) {
            return res.status(400).json({ message: 'A job position cannot report to itself.' });
        }
        const candidate = getJobPositionById(reportsToJobPositionId, req.user.clientId);
        if (!candidate) {
            return res.status(400).json({ message: 'reportsToJobPositionId does not belong to this client.' });
        }
        if (wouldCreateReportsToCycle(req.user.clientId, existing.id, candidate.id)) {
            return res.status(400).json({
                message: `Esto crearía un ciclo: "${existing.name}" ya está debajo de "${candidate.name}" en la cadena de mando.`,
            });
        }
    }
    const reportsToName = (id) => (id ? (getJobPositionById(id, req.user.clientId)?.name || '') : '');
    const reportsToBefore = reportsToName(existing.reports_to_job_position_id);
    const jobPosition = setJobPositionReportsTo(req.params.id, req.user.clientId, reportsToJobPositionId || null);
    const reportsToAfter = reportsToName(jobPosition.reports_to_job_position_id);
    if (reportsToBefore !== reportsToAfter) {
        logBusinessChange(req, 'org-chart-positions', existing.id, existing.name, 'business.historyReportsTo', reportsToBefore, reportsToAfter);
    }
    res.json({ jobPosition: mapJobPosition(jobPosition, getClientById(req.user.clientId)?.company_name) });
});

// Jefes Alternos -- confirmed with the user: unlike Reporta A, this never
// draws the tree, so no cycle guard, just "belongs to this client" and
// "not itself" on each id in the list (a self-alternate would be a no-op
// authority claim, and Number-cast dedupe avoids saving the same id twice).
app.put('/api/business/job-positions/:id/alt-supervisors', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getJobPositionById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Job position not found.' });
    const { altSupervisorIds } = req.body || {};
    if (!Array.isArray(altSupervisorIds)) return res.status(400).json({ message: 'altSupervisorIds must be an array.' });
    const uniqueIds = Array.from(new Set(altSupervisorIds.map(Number)));
    for (const altId of uniqueIds) {
        if (altId === existing.id) return res.status(400).json({ message: 'A job position cannot be its own alternate supervisor.' });
        if (!getJobPositionById(altId, req.user.clientId)) return res.status(400).json({ message: 'altSupervisorIds must belong to this client.' });
    }
    const altNames = (ids) => ids.map((id) => getJobPositionById(id, req.user.clientId)?.name || '').filter(Boolean).sort().join(', ');
    const altBefore = altNames(getAltSupervisorIds(existing.id).map((row) => (typeof row === 'object' ? row.id : row)));
    const savedAltIds = setJobPositionAltSupervisors(existing.id, uniqueIds);
    const altAfter = altNames(savedAltIds.map((row) => (typeof row === 'object' ? row.id : row)));
    if (altBefore !== altAfter) {
        logBusinessChange(req, 'org-chart-positions', existing.id, existing.name, 'business.historyAltSupervisors', altBefore, altAfter);
    }
    res.json({ altSupervisorIds: savedAltIds });
});

// Read-only chart data: every active Puesto plus whichever real hr_workers
// are hired into it right now (see getOrgChartPositions) -- any
// authenticated user at the client can view it (same "everyone sees the
// company chart" idea as Datos del Negocio), only PUT reports-to above is
// admin-gated.
app.get('/api/business/org-chart', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ positions: getOrgChartPositions(req.user.clientId) });
});

// --- Column-level permission enforcement (Solo Ver / Ver y Operar / -------
// --- Editar + Autorizar approval workflow) ----------------------------------
// The FIRST real server-side grant check in this app (menu/section grants
// are otherwise only enforced client-side by hiding UI — see PermissionTree.js).
// Per-field, NOT all-or-nothing: every field in `patch` is evaluated on its
// own against its own column-level grant, so one locked field in a PATCH
// never blocks the others in the same request. For each field that actually
// changed (comparing RAW values — see below):
//   - the client's own admin: always applied immediately, no exceptions.
//   - empty -> filled: applied only with 'ver-y-operar' or 'editar' on that
//     column, otherwise rejected (no approval flow for a first-time fill —
//     only touching an already-saved value needs a second person's OK).
//   - filled -> different, level 'editar': NOT applied now — diverted into
//     a pending_changes row (see Parte C) for whoever holds Autorizar on
//     that column to approve/reject; the field is dropped from what
//     actually gets written to the record right now.
//   - filled -> different, any other level ('solo-ver'/'ver-y-operar'/none):
//     rejected outright, same as an empty-fill without permission.
//   - a field with an ALREADY-pending change for the same record+column is
//     rejected too (not queued again) — avoids 2 competing pending rows for
//     one field.
//
// The diff always runs on the RAW existing/patch values — `sanitizers[key]`
// only transforms what gets written to the change-history log (used by
// fuel-records' ticketEvidence, so the base64 photo never hits the audit
// table) — never the value used to decide whether something actually
// changed, and never what's stored in pending_changes (which needs the raw
// value to actually reconstruct the field once approved).
// options.baseline (Fase 3, offline-queue conflicts): { [key]: valueThisFieldHadWhenTheOfflineEditWasCaptured }.
// A field with a baseline entry that no longer matches `existing[column]`
// means somebody else changed it for real in between -- Carlos edited
// Tipo Combustible offline, reconnects, and it turns out someone already
// changed it while he had no signal. That field is pulled OUT of the normal
// applied/pending/rejected flow entirely and reported back as a conflict
// instead, UNLESS its key is also in options.overrideConflicts (the
// client's follow-up request after the user confirmed "sí, aplícalo de
// todos modos" on that specific conflict) -- then it's treated as a normal
// edit of an existing value, except a resulting "pending" always escalates
// to one specific person (see below) instead of the whole Autorizar pool.
// Notificar: avisa a quien tenga el permiso de esa columna que alguien llenó (primera vez) o cambió el dato. Nunca rompe el guardado: si el aviso falla, solo se anota.
function notifyDataChange({ clientId, tableKey, recordLabel, fieldKey, oldValue, newValue, actorUserId, actorLabel, sanitize, authorizedBy = '', skipUserIds = null }) {
    try {
        const colKey = String(fieldKey).split('.').pop();
        const screenKey = screenLabelKeyOf(tableKey);
        publishDataChangeNotice({
            clientId, tableKey, screenKey, colKey, recordLabel, action: oldValue ? 'change' : 'fill',
            // Un llenado parte de vacío: el 0 que traen por defecto los campos numéricos no es un valor de antes.
            oldValue: !oldValue ? '' : (sanitize ? sanitize(oldValue) : oldValue), newValue: sanitize ? sanitize(newValue) : newValue,
            actorUserId, actorLabel, authorizedBy, skipUserIds,
        });
    } catch (err) {
        console.error('[notificar] no se pudo avisar de un cambio de datos:', err.message);
    }
}
// Notificar en botones e íconos (ver publishButtonActionNotice / publishIconUpdateNotice en db.js). Nunca rompen la acción: si el aviso falla, solo se anota.
function notifyButtonAction(req, tableKey, action, recordLabel) {
    try {
        const screenKey = screenLabelKeyOf(tableKey);
        publishButtonActionNotice({ clientId: req.user.clientId, tableKey, screenKey, action, recordLabel, actorUserId: req.user.sub, actorLabel: changedByLabel(req) });
    } catch (err) {
        console.error('[notificar] no se pudo avisar de un botón:', err.message);
    }
}
function notifyIconUpdate(req, { tableKey, iconId, action, name, scope }) {
    if (scope !== 'global') return;
    try {
        const screenKey = screenLabelKeyOf(tableKey);
        publishIconUpdateNotice({ clientId: req.user.clientId, tableKey, screenKey, iconId, action, name, actorUserId: req.user.sub, actorLabel: changedByLabel(req) });
    } catch (err) {
        console.error('[notificar] no se pudo avisar de un ícono:', err.message);
    }
}
// Avisos de cambios de accesos: un solo aviso por Guardar, con el detalle adentro (ver publishAccessChangeNotice en db.js). Nunca rompe el guardado.
function notifyAccessChange({ req, affectedUsers, scopeKind, scopeName = '', before, after }) {
    try {
        publishAccessChangeNotice({
            clientId: req.user.clientId, actorUserId: req.user.sub, actorLabel: changedByLabel(req), affectedUsers, scopeKind, scopeName, before, after,
        });
    } catch (err) {
        console.error('[avisos] no se pudo avisar de un cambio de accesos:', err.message);
    }
}
function checkAndLogFieldChanges(req, existing, patch, fieldsMap, tableKey, recordLabel, sanitizers = {}, options = {}) {
    const { baseline = null, overrideConflicts = [] } = options;
    const applied = [];
    const pending = [];
    const rejected = [];
    const conflicts = [];
    let grants = null;
    for (const [key, { column, fieldKey }] of Object.entries(fieldsMap)) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
        const oldValue = existing[column];
        const newValue = patch[key];
        if (String(oldValue ?? '') === String(newValue ?? '')) continue;

        const isOverride = overrideConflicts.includes(key);
        if (baseline && Object.prototype.hasOwnProperty.call(baseline, key) && !isOverride
            && String(oldValue ?? '') !== String(baseline[key] ?? '')) {
            conflicts.push({
                key, fieldKey, currentValue: oldValue, offlineValue: newValue,
                changedBy: getLastChangedBy(existing.client_id, tableKey, existing.id, fieldKey),
            });
            continue;
        }

        if (req.user.isClientAdmin) {
            applied.push({ key, fieldKey, oldValue, newValue });
            continue;
        }

        grants = grants || getUserEffectiveGrants(req.user.sub);
        const colKey = fieldKey.split('.').pop();
        const level = getColumnGrantLevel(grants, tableKey, colKey);

        if (!oldValue) {
            if (level === 'ver-y-operar' || level === 'editar') {
                applied.push({ key, fieldKey, oldValue, newValue });
            } else {
                rejected.push(fieldKey);
            }
            continue;
        }

        if (level === 'editar' && !hasPendingChangeForField(existing.client_id, tableKey, existing.id, key)) {
            // A conflict override always escalates to one named person
            // (the acting user's Jefe Directo, or themselves when they
            // already hold Autorizar) rather than the general Autorizar
            // pool for this column -- see resolveDirectSupervisorUserId.
            const escalatedToUserId = isOverride
                ? (canAuthorizeColumn(grants, tableKey, colKey) ? req.user.sub : resolveDirectSupervisorUserId(req.user.sub))
                : null;
            pending.push({ key, fieldKey, oldValue, newValue, escalatedToUserId });
        } else {
            rejected.push(fieldKey);
        }
    }

    const appliedPatch = {};
    applied.forEach(({ key, newValue }) => { appliedPatch[key] = newValue; });
    applied.forEach((c) => {
        const sanitize = sanitizers[c.key];
        logTableChange({
            clientId: existing.client_id, tableKey, recordId: existing.id, recordLabel, action: 'update',
            fieldKey: c.fieldKey,
            oldValue: sanitize ? sanitize(c.oldValue) : c.oldValue,
            newValue: sanitize ? sanitize(c.newValue) : c.newValue,
            changedBy: changedByLabel(req),
        });
        notifyDataChange({
            clientId: existing.client_id, tableKey, recordLabel, fieldKey: c.fieldKey, oldValue: c.oldValue, newValue: c.newValue,
            actorUserId: req.user.sub, actorLabel: changedByLabel(req), sanitize,
        });
    });
    pending.forEach((c) => createPendingChange({
        clientId: existing.client_id, tableKey, recordId: existing.id, recordLabel,
        fieldKey: c.fieldKey, columnKey: c.key, oldValue: c.oldValue, newValue: c.newValue,
        requestedBy: req.user.name, requestedByUserId: req.user.sub, escalatedToUserId: c.escalatedToUserId,
    }));
    // Notificaciones' "Alertas" tab: same moment the acting user themselves
    // sees the "Usted no está habilitado..." toast, their Jefe Directo (see
    // resolveDirectSupervisorUserId) gets an informational alert -- one per
    // rejected field, never requiring authorization, just visibility.
    if (rejected.length) {
        const screenKey = screenLabelKeyOf(tableKey);
        const actingUser = getUserById(req.user.sub, req.user.clientId);
        const actingUserLabel = `${req.user.username} - ${actingUser?.nickname || req.user.name}`;
        const recipientUserId = resolveDirectSupervisorUserId(req.user.sub);
        rejected.forEach((fieldKey) => {
            createAccessDeniedAlert({ clientId: existing.client_id, actingUserLabel, fieldKey, screenKey, recipientUserId });
        });
    }

    return {
        appliedPatch, pendingFields: pending.map((c) => c.fieldKey), rejectedFields: rejected,
        conflictFields: conflicts,
    };
}

// --- Centros de Costo (cost centers, scoped to one client) -------------------
// Capped by clients.cost_centers_limit, which GEIPSA sets from Contrataciones
// (Admin-SaaS) — see setClientCostCentersLimit. Managing the catalog (create/
// edit/delete) stays admin-only, same as the rest of "Administración del
// Negocio" — but any authenticated user at the client can READ the list,
// since every client user needs it for the sidebar's Centro de Costo picker.
function validateCostCenterBody(body) {
    const { countryId, stateId, municipalityId, localityId, streetId, sucursal, name } = body || {};
    if (!countryId || !stateId || !municipalityId || !localityId || !streetId || !sucursal || !name) {
        return 'countryId, stateId, municipalityId, localityId, streetId, sucursal and name are required.';
    }
    // Localizador del grupo: el código del sitio son 5 letras y el Estado y la Localidad elegidos ya deben tener su código corto (4 y 3 letras).
    if (!normalizeShortCode(body.siteCode, SHORT_CODE_LENGTH.site)) return 'siteCode must be 5 letters (A-Z).';
    const state = getStateById(Number(stateId));
    const locality = getLocalityById(Number(localityId));
    if (!state || !state.code) return 'The state needs its 4-letter code first.';
    if (!locality || !locality.code) return 'The locality needs its 3-letter code first.';
    return null;
}

// Control Interno for Servicio Contratado's own table -- same recipe as
// FUEL_RECORD_*_LABEL/mapFuelRecord above, this table's 3 fixed labels.
// Centro Costos here is self-referential -- a cost center record's own
// "which cost center" is itself, same as GEIPSA's own admin catalogs (see
// db.js's Nuestros Planes/Sectores) stamp their own SGN cost center rather
// than leaving it blank.
const COST_CENTER_AREA_LABEL = '';
const COST_CENTER_MODULE_LABEL = 'Administración del Negocio';
const COST_CENTER_SCREEN_LABEL = 'Servicio Contratado';

function mapCostCenter(row, companyName) {
    if (!row) return row;
    return {
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        responsible: row.responsible,
        status: row.status,
        accountNumber: row.account_number,
        recordCode: row.record_code,
        countryId: row.country_id,
        stateId: row.state_id,
        municipalityId: row.municipality_id,
        localityId: row.locality_id,
        streetId: row.street_id,
        sucursal: row.sucursal,
        nickname: row.nickname,
        siteCode: row.site_code || '',
        ...getSystemColumnsForRecord({
            companyName,
            area: COST_CENTER_AREA_LABEL,
            modulo: COST_CENTER_MODULE_LABEL,
            pantalla: COST_CENTER_SCREEN_LABEL,
            centroCostos: row.name || '',
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/cost-centers', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const client = getClientById(req.user.clientId);
    res.json({
        costCenters: listCostCenters(req.user.clientId, req.user.isTestAccount).map((cc) => mapCostCenter(cc, client.company_name)),
        limit: client.cost_centers_limit,
        siteReady: hasCompleteCostCenter(req.user.clientId, req.user.isTestAccount),
    });
});

app.post('/api/business/cost-centers', requireAuth, requireClientAdmin, (req, res) => {
    const error = validateCostCenterBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const client = getClientById(req.user.clientId);
    if (countCostCenters(req.user.clientId, req.user.isTestAccount) >= client.cost_centers_limit) {
        return res.status(409).json({ message: 'Cost center limit reached for this client.' });
    }
    const { countryId, stateId, municipalityId, localityId, streetId, sucursal, name, description, responsible } = req.body;
    const siteCode = normalizeShortCode(req.body.siteCode, SHORT_CODE_LENGTH.site);
    try {
        const costCenter = createCostCenter({
            clientId: req.user.clientId, countryId, stateId, municipalityId, localityId, streetId, sucursal, name, description, responsible, siteCode,
            isTestData: req.user.isTestAccount,
        });
        logTableChange({
            clientId: req.user.clientId, tableKey: 'centros-costo', recordId: costCenter.id,
            recordLabel: costCenter.code, action: 'create', changedBy: changedByLabel(req),
        });
        notifyButtonAction(req, 'centros-costo', 'create', costCenter.code);
        linkOrphansToFirstCostCenter(req);
        res.status(201).json({ costCenter: mapCostCenter(costCenter, client.company_name) });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: /site_code/.test(err.message) ? 'That site code is already used by another cost center.' : 'A cost center with that code already exists.' });
        }
        throw err;
    }
});

app.patch('/api/business/cost-centers/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getCostCenterById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Cost center not found.' });
    const error = validateCostCenterBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { countryId, stateId, municipalityId, localityId, streetId, sucursal, name, description, responsible } = req.body;
    const siteCode = normalizeShortCode(req.body.siteCode, SHORT_CODE_LENGTH.site);
    try {
        const costCenter = updateCostCenter(req.params.id, req.user.clientId, {
            countryId, stateId, municipalityId, localityId, streetId, sucursal, name, description, responsible, siteCode,
        }, req.user.isTestAccount);
        // requireClientAdmin-gated route: req.user.isClientAdmin is always
        // true here, so every field always lands in appliedPatch and
        // pending/rejected are always empty — this call only exists for its
        // logTableChange side effect. Logged AFTER updateCostCenter (using
        // its own computed code/sucursal) since código is no longer part of
        // the submitted body — it's derived from the geo ids.
        checkAndLogFieldChanges(req, existing, {
            code: costCenter.code, name: costCenter.name, description: costCenter.description,
            responsible: costCenter.responsible, sucursal: costCenter.sucursal, siteCode: costCenter.site_code || '',
        }, COST_CENTER_FIELDS, 'centros-costo', existing.code);
        linkOrphansToFirstCostCenter(req);
        res.json({ costCenter: mapCostCenter(costCenter, getClientById(req.user.clientId).company_name) });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: /site_code/.test(err.message) ? 'That site code is already used by another cost center.' : 'A cost center with that code already exists.' });
        }
        throw err;
    }
});

// No DELETE route -- a cost center's account_number/record_code are a
// permanent accounting sequence (same reasoning as clients themselves, see
// db.js's own migration comment), so only Activar/Desactivar from here on.
app.patch('/api/business/cost-centers/:id/status', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getCostCenterById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Cost center not found.' });
    const { status } = req.body || {};
    if (status !== 'active' && status !== 'inactive') return res.status(400).json({ message: 'status must be active or inactive.' });
    const costCenter = setCostCenterStatus(req.params.id, req.user.clientId, status, req.user.isTestAccount);
    logTableChange({
        clientId: req.user.clientId, tableKey: 'centros-costo', recordId: costCenter.id,
        recordLabel: costCenter.code, action: 'update', changedBy: changedByLabel(req),
    });
    linkOrphansToFirstCostCenter(req);
    res.json({ costCenter: mapCostCenter(costCenter, getClientById(req.user.clientId).company_name) });
});

// Apodo -- a free-text label the client can rename anytime, independent of
// código/record_code (both stay permanent/derived from the geo picks, see
// buildCostCenterCodeBase). Its own tiny route, same "quien menos, más
// rápido" reasoning as .../status just above, so renaming doesn't need the
// whole geo cascade resubmitted.
app.patch('/api/business/cost-centers/:id/nickname', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getCostCenterById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Cost center not found.' });
    const nickname = (req.body?.nickname || '').trim();
    const costCenter = updateCostCenterNickname(req.params.id, req.user.clientId, nickname, req.user.isTestAccount);
    logTableChange({
        clientId: req.user.clientId, tableKey: 'centros-costo', recordId: costCenter.id,
        recordLabel: costCenter.code, action: 'update', fieldKey: 'business.ccNickname', changedBy: changedByLabel(req),
    });
    res.json({ costCenter: mapCostCenter(costCenter, getClientById(req.user.clientId).company_name) });
});

// --- Geo catalog (País/Estado/Localidad/Calle behind a Centro de Costos'
// código) -- shared across every client on the SaaS, see db.js's own comment
// on the geo_* tables. Reads are open to any authenticated user (harmless,
// and future screens may want them); adding a new entry is gated the same
// as creating/editing a Centro de Costos itself, since that's the only
// place these "+" buttons live today.
app.get('/api/business/geo/countries', requireAuth, (req, res) => {
    res.json({ items: listCountries() });
});
app.get('/api/business/geo/states', requireAuth, (req, res) => {
    const countryId = Number(req.query.countryId) || 0;
    if (!countryId) return res.status(400).json({ message: 'countryId is required.' });
    res.json({ items: listStates(countryId) });
});
app.get('/api/business/geo/municipalities', requireAuth, (req, res) => {
    const stateId = Number(req.query.stateId) || 0;
    if (!stateId) return res.status(400).json({ message: 'stateId is required.' });
    res.json({ items: listMunicipalities(stateId) });
});
app.get('/api/business/geo/localities', requireAuth, (req, res) => {
    const stateId = Number(req.query.stateId) || 0;
    if (!stateId) return res.status(400).json({ message: 'stateId is required.' });
    res.json({ items: listLocalities(stateId) });
});
app.get('/api/business/geo/streets', requireAuth, (req, res) => {
    const localityId = Number(req.query.localityId) || 0;
    if (!localityId) return res.status(400).json({ message: 'localityId is required.' });
    res.json({ items: listStreets(localityId) });
});
app.post('/api/business/geo/countries', requireAuth, requireClientAdmin, (req, res) => {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'name is required.' });
    res.status(201).json({ item: createCountry(name) });
});
// Códigos cortos del localizador (Estado 4 letras, Localidad 3): al agregar uno nuevo el código es obligatorio; uno que ya existe sin código lo recibe aquí mismo. Mientras ningún centro de costos use un
// Estado o una Localidad (de ningún cliente: el catálogo es de todos), su nombre y su código se pueden corregir; en cuanto uno lo usa queda fijo, porque los localizadores ya lo llevan escrito.
const GEO_ERRORS = {
    invalid: [400, 'GEO_CODE_INVALID', 'The code has the wrong length or letters.'],
    locked: [409, 'GEO_CODE_LOCKED', 'That entry already has a code and it cannot change.'],
    duplicate: [409, 'GEO_CODE_DUPLICATE', 'Another entry in the same place already uses that code.'],
    notfound: [404, 'GEO_NOT_FOUND', 'Not found.'],
    inuse: [409, 'GEO_IN_USE', 'A cost center already uses it, so it cannot change.'],
    nameduplicate: [409, 'GEO_NAME_DUPLICATE', 'Another entry in the same place already has that name.'],
    name: [400, 'GEO_NAME_REQUIRED', 'The name cannot be empty.'],
};
function sendGeoError(res, error) {
    const [status, code, message] = GEO_ERRORS[error] || [400, 'GEO_ERROR', 'Could not save.'];
    return res.status(status).json({ code, message });
}
function createGeoRoute(kind, parentField, createFn, length) {
    return (req, res) => {
        const parentId = Number(req.body?.[parentField]) || 0;
        const name = (req.body?.name || '').trim();
        if (!parentId || !name) return res.status(400).json({ message: `${parentField} and name are required.` });
        const code = normalizeShortCode(req.body?.code, length);
        if (!code) return sendGeoError(res, 'invalid');
        let item;
        try {
            item = createFn(parentId, name, code);
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return sendGeoError(res, 'duplicate');
            throw err;
        }
        if (!item.code) {
            const set = setGeoShortCode(kind, item.id, code);
            if (set.error) return sendGeoError(res, set.error);
            item = set.item;
        }
        res.status(201).json({ item });
    };
}
function setGeoCodeRoute(kind) {
    return (req, res) => {
        const set = setGeoShortCode(kind, Number(req.params.id) || 0, req.body?.code);
        if (set.error) return sendGeoError(res, set.error);
        res.json({ item: set.item });
    };
}
function patchGeoEntryRoute(kind) {
    return (req, res) => {
        const body = req.body || {};
        const result = updateGeoEntry(kind, Number(req.params.id) || 0, { name: body.name, code: body.code });
        if (result.error) return sendGeoError(res, result.error);
        res.json({ item: result.item });
    };
}
app.post('/api/business/geo/states', requireAuth, requireClientAdmin, createGeoRoute('state', 'countryId', createState, SHORT_CODE_LENGTH.state));
app.patch('/api/business/geo/states/:id/code', requireAuth, requireClientAdmin, setGeoCodeRoute('state'));
app.patch('/api/business/geo/states/:id', requireAuth, requireClientAdmin, patchGeoEntryRoute('state'));
app.post('/api/business/geo/municipalities', requireAuth, requireClientAdmin, (req, res) => {
    const stateId = Number(req.body?.stateId) || 0;
    const name = (req.body?.name || '').trim();
    if (!stateId || !name) return res.status(400).json({ message: 'stateId and name are required.' });
    res.status(201).json({ item: createMunicipality(stateId, name) });
});
app.post('/api/business/geo/localities', requireAuth, requireClientAdmin, createGeoRoute('locality', 'stateId', createLocality, SHORT_CODE_LENGTH.locality));
app.patch('/api/business/geo/localities/:id/code', requireAuth, requireClientAdmin, setGeoCodeRoute('locality'));
app.patch('/api/business/geo/localities/:id', requireAuth, requireClientAdmin, patchGeoEntryRoute('locality'));
app.post('/api/business/geo/streets', requireAuth, requireClientAdmin, (req, res) => {
    const localityId = Number(req.body?.localityId) || 0;
    const name = (req.body?.name || '').trim();
    if (!localityId || !name) return res.status(400).json({ message: 'localityId and name are required.' });
    res.status(201).json({ item: createStreet(localityId, name) });
});

// --- Reglas de Orden de Llenado (field_fill_rules, scoped to one client) ---
// Reads are open to any authenticated user at the client -- every table
// viewer needs the rules to know which cells are locked, and someone with
// ONLY the Autorizar grant (not a client admin) still needs to see pending
// ones on the Gestión concentrator screen. A rule has no effect on any
// table until authorized (see mapFieldFillRule's authorized flag) -- only
// a client admin can create/edit/delete (a configuration decision, same
// gating as everything else under "Administración del Negocio"), and
// authorizing needs the specific colFieldRuleAuthorization grant.
// Fixed per menu.json's own placement (main/btn-configuracion/
// btn-gestion-reglas-orden) — same recipe as FUEL_RECORD_*_LABEL above.
const FIELD_FILL_RULE_MODULE_LABEL = 'Configuración';
const FIELD_FILL_RULE_AREA_LABEL = '';
const FIELD_FILL_RULE_SCREEN_LABEL = 'Reglas de Orden de Llenado';

function mapFieldFillRule(row, companyName) {
    if (!row) return row;
    return {
        id: row.id,
        tableKey: row.table_key,
        gateCol: row.gate_col,
        gateLabel: row.gate_label,
        dependentCol: row.dependent_col,
        dependentLabel: row.dependent_label,
        createdBy: row.created_by,
        createdAt: row.created_at,
        authorizedBy: row.authorized_by,
        authorizedAt: row.authorized_at,
        authorized: !!row.authorized_at,
        ...getSystemColumnsForRecord({
            companyName,
            area: FIELD_FILL_RULE_AREA_LABEL,
            modulo: FIELD_FILL_RULE_MODULE_LABEL,
            pantalla: FIELD_FILL_RULE_SCREEN_LABEL,
            centroCostos: '',
            createdAt: row.created_at,
        }),
    };
}
function validateFieldFillRuleBody(body) {
    const tableKey = (body?.tableKey || '').trim();
    const gateCol = (body?.gateCol || '').trim();
    const dependentCol = (body?.dependentCol || '').trim();
    if (!tableKey || !gateCol || !dependentCol) return 'tableKey, gateCol and dependentCol are required.';
    if (gateCol === dependentCol) return 'gateCol and dependentCol must be different columns.';
    return null;
}
app.get('/api/business/field-fill-rules', requireAuth, (req, res) => {
    const tableKey = (req.query.tableKey || '').trim();
    if (!tableKey) return res.status(400).json({ message: 'tableKey is required.' });
    if (!req.user.clientId) return res.json({ rules: [] });
    const companyName = getClientById(req.user.clientId)?.company_name;
    res.json({ rules: listFieldFillRules(req.user.clientId, tableKey).map((r) => mapFieldFillRule(r, companyName)) });
});
app.get('/api/business/field-fill-rules/all', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.json({ rules: [] });
    const companyName = getClientById(req.user.clientId)?.company_name;
    res.json({ rules: listAllFieldFillRules(req.user.clientId).map((r) => mapFieldFillRule(r, companyName)) });
});
// Crear y editar reglas: el administrador del cliente o quien tenga el icono de Reglas de Orden de Llenado de esa pantalla en su arbol (hoja <pantalla>/iconFieldRules).
function canManageFieldRules(req, tableKey) {
    if (!req.user?.clientId) return false;
    if (req.user.isClientAdmin) return true;
    return hasTableIconGrant(getUserEffectiveGrants(req.user.sub), tableKey, 'iconFieldRules');
}
app.post('/api/business/field-fill-rules', requireAuth, (req, res) => {
    const error = validateFieldFillRuleBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { tableKey, gateCol, gateLabel, dependentCol, dependentLabel } = req.body;
    if (!canManageFieldRules(req, tableKey)) return res.status(403).json({ message: 'No tienes permiso para crear reglas aquí.' });
    const rule = createFieldFillRule({
        clientId: req.user.clientId, tableKey, gateCol, gateLabel, dependentCol, dependentLabel, createdBy: req.user.name,
    });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'reglas-orden-llenado', recordId: rule.id,
        recordLabel: `${rule.gate_label} → ${rule.dependent_label}`, action: 'create', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'reglas-orden-llenado', 'create', `${rule.gate_label} → ${rule.dependent_label}`);
    notifyIconUpdate(req, { tableKey, iconId: 'iconFieldRules', action: 'created', name: `${rule.gate_label} → ${rule.dependent_label}`, scope: 'global' });
    res.status(201).json({ rule: mapFieldFillRule(rule, getClientById(req.user.clientId)?.company_name) });
});
app.patch('/api/business/field-fill-rules/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(403).json({ message: 'Client access required.' });
    const existing = getFieldFillRuleById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Rule not found.' });
    if (!canManageFieldRules(req, existing.table_key)) return res.status(403).json({ message: 'No tienes permiso para editar reglas aquí.' });
    const error = validateFieldFillRuleBody({ tableKey: existing.table_key, ...req.body });
    if (error) return res.status(400).json({ message: error });
    const { gateCol, gateLabel, dependentCol, dependentLabel } = req.body;
    try {
        const rule = updateFieldFillRule(req.params.id, req.user.clientId, { gateCol, gateLabel, dependentCol, dependentLabel });
        logBusinessChange(req, 'reglas-orden-llenado', rule.id, `${rule.gate_label} → ${rule.dependent_label}`, 'main.historyFillRule',
            `${existing.gate_label} → ${existing.dependent_label}`, `${rule.gate_label} → ${rule.dependent_label}`);
        notifyIconUpdate(req, { tableKey: existing.table_key, iconId: 'iconFieldRules', action: 'updated', name: `${rule.gate_label} → ${rule.dependent_label}`, scope: 'global' });
        res.json({ rule: mapFieldFillRule(rule, getClientById(req.user.clientId)?.company_name) });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'That dependent field already has a different rule.' });
        }
        throw err;
    }
});
app.post('/api/business/field-fill-rules/:id/authorize', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getFieldFillRuleById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Rule not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canAuthorizeColumn(grants, 'reglas-orden-llenado', 'colFieldRuleAuthorization')) {
            return res.status(403).json({ message: 'No tienes permiso para autorizar reglas.' });
        }
    }
    const rule = authorizeFieldFillRule(req.params.id, req.user.clientId, req.user.name);
    logBusinessChange(req, 'reglas-orden-llenado', rule.id, `${rule.gate_label} → ${rule.dependent_label}`, 'main.historyRuleAuthorized', '', '');
    res.json({ rule: mapFieldFillRule(rule, getClientById(req.user.clientId)?.company_name) });
});
app.delete('/api/business/field-fill-rules/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canDeleteColumn(grants, 'reglas-orden-llenado', 'colFieldRuleAuthorization')) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar reglas.' });
        }
    }
    const ruleToDelete = getFieldFillRuleById(req.params.id, req.user.clientId);
    deleteFieldFillRule(req.params.id, req.user.clientId);
    if (ruleToDelete) {
        logTableChange({
            clientId: req.user.clientId, tableKey: 'reglas-orden-llenado', recordId: ruleToDelete.id,
            recordLabel: `${ruleToDelete.gate_label} → ${ruleToDelete.dependent_label}`, action: 'delete', changedBy: changedByLabel(req),
        });
        notifyButtonAction(req, 'reglas-orden-llenado', 'delete', `${ruleToDelete.gate_label} → ${ruleToDelete.dependent_label}`);
        notifyIconUpdate(req, { tableKey: ruleToDelete.table_key, iconId: 'iconFieldRules', action: 'deleted', name: `${ruleToDelete.gate_label} → ${ruleToDelete.dependent_label}`, scope: 'global' });
    }
    res.status(204).end();
});

// --- Puestos de Trabajo (job positions, scoped to one client) ---------------
// Managing the catalog stays admin-only, same as Centros de Costo above —
// but any authenticated user at the client can READ it, since Mi Recurso
// Humano's Puesto field needs the (active-only) list for its own dropdown.
const JOB_POSITION_STATUSES = ['active', 'inactive'];
// requireName: false for PATCH — Centros de Costo Habilitados is edited
// from its own table-column modal now (see Business-PuestosTrabajo.js),
// sending a patch body with ONLY costCenterScope, so name can't be
// required there the way it is for a full create/edit-modal save.
function validateJobPositionBody(body, { requireName = true } = {}) {
    const { name, status, costCenterScope } = body || {};
    if (requireName && (!name || !name.trim())) return 'name is required.';
    if (!requireName && name !== undefined && !name.trim()) return 'name is required.';
    if (status !== undefined && !JOB_POSITION_STATUSES.includes(status)) {
        return `status must be one of: ${JOB_POSITION_STATUSES.join(', ')}.`;
    }
    if (costCenterScope !== undefined && costCenterScope !== 'all'
        && (!Array.isArray(costCenterScope) || !costCenterScope.length)) {
        return 'costCenterScope must be "all" or a non-empty array of cost center ids.';
    }
    return null;
}

// Control Interno for both Puestos de Trabajo's own catalog table and
// Roles' read-only mirror of the same list -- neither had it before.
const JOB_POSITION_AREA_LABEL = '';
const JOB_POSITION_MODULE_LABEL = 'Administración del Negocio';
const JOB_POSITION_SCREEN_LABEL = 'Roles';

function mapJobPosition(row, companyName) {
    if (!row) return row;
    return {
        ...row,
        // departments: which Departamentos this Puesto's own tree touches
        // (see getJobPositionDepartments) -- included here, not just the
        // admin-only grants-detail route, so Mi Recurso Humano's "Nuevo
        // Registro" can show a live preview of "Departamento Asignado" for
        // whoever picks a Puesto, without needing requireClientAdmin just
        // to see it.
        departments: getJobPositionDepartments(row.id),
        ...getSystemColumnsForRecord({
            companyName,
            area: JOB_POSITION_AREA_LABEL,
            modulo: JOB_POSITION_MODULE_LABEL,
            pantalla: JOB_POSITION_SCREEN_LABEL,
            // No single cost center to self-reference the way Cost Centers'
            // own record does -- cost_center_scope is a list of allowed
            // ones for whoever gets hired into this Puesto, not this
            // record's own identity -- so this stays honestly blank.
            centroCostos: '',
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/job-positions', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const client = getClientById(req.user.clientId);
    const actor = { id: req.user.sub, isClientAdmin: !!req.user.isClientAdmin };
    const jobPositions = listJobPositions(req.user.clientId, req.user.isTestAccount)
        // layoutCanPersonalize: ¿esta cuenta puede cambiar el orden y la clasificación de este perfil? (el administrador, todos; los demás, los de abajo en el organigrama)
        .map((jp) => ({ ...mapJobPosition(jp, client?.company_name), layoutCanPersonalize: clientLayoutAccess('perfil', jp.id, actor).canPersonalize }));
    res.json({ jobPositions });
});

app.post('/api/business/job-positions', requireAuth, requireClientAdmin, (req, res) => {
    const error = validateJobPositionBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { name, abbreviation, costCenterScope, status } = req.body;
    if (Array.isArray(costCenterScope) && costCenterScope.some((id) => !getCostCenterById(id, req.user.clientId, req.user.isTestAccount))) {
        return res.status(400).json({ message: 'costCenterScope contains a cost center that does not belong to this client.' });
    }
    try {
        const jobPosition = createJobPosition({
            clientId: req.user.clientId, name: name.trim(), abbreviation: (abbreviation || '').trim(),
            costCenterScope: Array.isArray(costCenterScope) ? JSON.stringify(costCenterScope) : 'all',
            status, isTestData: req.user.isTestAccount,
        });
        logTableChange({
            clientId: req.user.clientId, tableKey: 'puestos-trabajo', recordId: jobPosition.id,
            recordLabel: jobPosition.name, action: 'create', changedBy: changedByLabel(req),
        });
        notifyButtonAction(req, 'puestos-trabajo', 'create', jobPosition.name);
        res.status(201).json({ jobPosition: mapJobPosition(jobPosition, getClientById(req.user.clientId)?.company_name) });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A job position with that name already exists.' });
        }
        throw err;
    }
});

app.patch('/api/business/job-positions/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getJobPositionById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Job position not found.' });
    const error = validateJobPositionBody(req.body, { requireName: false });
    if (error) return res.status(400).json({ message: error });
    const { name, abbreviation, costCenterScope, status } = req.body;
    if (Array.isArray(costCenterScope) && costCenterScope.some((id) => !getCostCenterById(id, req.user.clientId, req.user.isTestAccount))) {
        return res.status(400).json({ message: 'costCenterScope contains a cost center that does not belong to this client.' });
    }
    const patch = {
        name: name !== undefined ? name.trim() : existing.name,
        abbreviation: abbreviation !== undefined ? abbreviation.trim() : existing.abbreviation,
        costCenterScope: costCenterScope !== undefined
            ? (costCenterScope === 'all' ? 'all' : JSON.stringify(costCenterScope))
            : existing.cost_center_scope,
        status: status ?? existing.status,
    };
    // requireClientAdmin-gated: same reasoning as Centros de Costo's own
    // PATCH above — always fully applied, this call only exists for its
    // logTableChange side effect.
    checkAndLogFieldChanges(req, existing, patch, JOB_POSITION_FIELDS, 'puestos-trabajo', existing.name);
    try {
        const jobPosition = updateJobPosition(req.params.id, req.user.clientId, patch, req.user.isTestAccount);
        res.json({ jobPosition: mapJobPosition(jobPosition, getClientById(req.user.clientId)?.company_name) });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'A job position with that name already exists.' });
        }
        throw err;
    }
});

app.delete('/api/business/job-positions/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getJobPositionById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Job position not found.' });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'puestos-trabajo', recordId: existing.id,
        recordLabel: existing.name, action: 'delete', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'puestos-trabajo', 'delete', existing.name);
    deleteJobPosition(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Estatus RH catalog (Administración de Personal > Catálogos) -----------
// Same read-for-everyone/write-for-admins split as job positions: Mi
// Recurso Humano's own Estatus dropdown (any authenticated client user)
// needs the (active-only, filtered client-side same as Puesto's dropdown)
// list to render at all.
const HR_STATUS_EFFECTS = ['active', 'suspended', 'inactive'];
const HR_STATUS_CATALOG_STATUSES = ['active', 'inactive'];
function validateHrStatusCatalogBody(body, { requireName = true } = {}) {
    const { name, operationalEffect, status } = body || {};
    if (requireName && (!name || !name.trim())) return 'name is required.';
    if (!requireName && name !== undefined && !name.trim()) return 'name is required.';
    if (operationalEffect !== undefined && !HR_STATUS_EFFECTS.includes(operationalEffect)) {
        return `operationalEffect must be one of: ${HR_STATUS_EFFECTS.join(', ')}.`;
    }
    if (status !== undefined && !HR_STATUS_CATALOG_STATUSES.includes(status)) {
        return `status must be one of: ${HR_STATUS_CATALOG_STATUSES.join(', ')}.`;
    }
    return null;
}

app.get('/api/business/hr-status-catalog', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ hrStatuses: listHrStatusCatalog(req.user.clientId, req.user.isTestAccount) });
});

app.post('/api/business/hr-status-catalog', requireAuth, requireClientAdmin, (req, res) => {
    const error = validateHrStatusCatalogBody(req.body);
    if (error) return res.status(400).json({ message: error });
    const { name, operationalEffect, status } = req.body;
    try {
        const hrStatus = createHrStatusCatalogEntry({
            clientId: req.user.clientId, name: name.trim(), operationalEffect, status,
            isTestData: req.user.isTestAccount,
        });
        logTableChange({
            clientId: req.user.clientId, tableKey: 'estatus-rh', recordId: hrStatus.id,
            recordLabel: hrStatus.name, action: 'create', changedBy: changedByLabel(req),
        });
        notifyButtonAction(req, 'estatus-rh', 'create', hrStatus.name);
        res.status(201).json({ hrStatus });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'An HR status with that name already exists.' });
        }
        throw err;
    }
});

app.patch('/api/business/hr-status-catalog/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getHrStatusCatalogById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'HR status not found.' });
    const error = validateHrStatusCatalogBody(req.body, { requireName: false });
    if (error) return res.status(400).json({ message: error });
    const { name, operationalEffect, status } = req.body;
    const patch = {
        name: name !== undefined ? name.trim() : existing.name,
        operationalEffect: operationalEffect ?? existing.operational_effect,
        status: status ?? existing.status,
    };
    checkAndLogFieldChanges(req, existing, patch, HR_STATUS_CATALOG_FIELDS, 'estatus-rh', existing.name);
    try {
        const hrStatus = updateHrStatusCatalogEntry(req.params.id, req.user.clientId, patch, req.user.isTestAccount);
        res.json({ hrStatus });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ message: 'An HR status with that name already exists.' });
        }
        throw err;
    }
});

app.delete('/api/business/hr-status-catalog/:id', requireAuth, requireClientAdmin, (req, res) => {
    const existing = getHrStatusCatalogById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'HR status not found.' });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'estatus-rh', recordId: existing.id,
        recordLabel: existing.name, action: 'delete', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'estatus-rh', 'delete', existing.name);
    deleteHrStatusCatalogEntry(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Transacciones Inteligentes de Negocio (Negocio Inteligente) -----------
// A report is a name + an ordered list of columns (base, pulled straight
// from Base de Datos Global, or calculated, a formula over other columns
// already in the same report) -- see intelligent_report_columns in db.js for
// the exact shapes. This only stores/lists/edits the definition; running a
// report to see real computed data is a future piece, not built yet.
function validateReportColumns(columns) {
    if (!Array.isArray(columns)) return 'columns must be an array.';
    const ids = new Set(columns.map((_, i) => i));
    for (const col of columns) {
        if (!col || typeof col.label !== 'string' || !col.label.trim()) return 'Every column needs a label.';
        if (col.type === 'base') continue;
        if (col.type !== 'calculated') return 'Each column must be type "base" or "calculated".';
        const formula = col.formula;
        if (!formula || !Array.isArray(formula.operands) || !Array.isArray(formula.operators)) {
            return 'A calculated column needs a formula.';
        }
        if (formula.operands.length < 2 || formula.operands.length !== formula.operators.length + 1) {
            return 'A calculated column needs at least 2 operands, one fewer operator than operands.';
        }
        for (const op of formula.operands) {
            if (op.kind === 'constant') {
                if (typeof op.value !== 'number' || Number.isNaN(op.value)) return 'A constant operand needs a number.';
            } else if (op.kind === 'column') {
                if (!ids.has(op.reportColumnId)) return 'A column operand must reference another column in this same report.';
            } else {
                return 'Each operand must be a column or a constant.';
            }
        }
    }
    return null;
}

const INTELLIGENT_REPORT_MODULE_LABEL = 'Configuración';
const INTELLIGENT_REPORT_AREA_LABEL = 'Negocio Inteligente';
const INTELLIGENT_REPORT_SCREEN_LABEL = 'Transacciones Inteligentes de Negocio';

function mapIntelligentReport(row, companyName) {
    if (!row) return row;
    return {
        ...row,
        ...getSystemColumnsForRecord({
            companyName,
            area: INTELLIGENT_REPORT_AREA_LABEL,
            modulo: INTELLIGENT_REPORT_MODULE_LABEL,
            pantalla: INTELLIGENT_REPORT_SCREEN_LABEL,
            centroCostos: '',
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/intelligent-reports', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const companyName = getClientById(req.user.clientId)?.company_name;
    const reports = listIntelligentReports(req.user.clientId).map((r) => mapIntelligentReport(r, companyName));
    res.json({ reports });
});

app.get('/api/business/intelligent-reports/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const report = getIntelligentReportById(req.params.id, req.user.clientId);
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    res.json({ report: mapIntelligentReport(report, getClientById(req.user.clientId)?.company_name) });
});

// Real computed data for a saved report -- same underlying records
// base-datos-global already assembles (mapFuelRecord already carries the 13
// Control Interno columns), run through computeIntelligentReportRows. A
// future screen's own map*Record output gets concatenated into `records`
// here the same way it will in base-datos-global once it exists.
app.get('/api/business/intelligent-reports/:id/results', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const report = getIntelligentReportById(req.params.id, req.user.clientId);
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    const client = getClientById(req.user.clientId);
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'registro-combustible');
    const records = listFuelRecords(req.user.clientId, req.user.isTestAccount).map((r) => mapFuelRecord(r, pendingByRecord, client?.company_name));
    const rows = computeIntelligentReportRows(report, records);
    res.json({ report: { name: report.name, columns: report.columns }, rows });
});

// Filename for Content-Disposition -- strips CR/LF and quotes (header
// injection) regardless of source, then offers both a plain ASCII fallback
// and the real UTF-8 name (RFC 5987) so accented report names (any user-
// given text ends up here) still show up correctly in browsers that honor
// filename*, instead of forcing every download into ASCII.
function buildContentDisposition(filename) {
    const clean = String(filename).replace(/[\r\n"]/g, ' ').trim() || 'archivo';
    const asciiSafe = clean.replace(/[^\x20-\x7E]/g, '_');
    return `attachment; filename="${asciiSafe}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

// Exports whatever a .data-table's CURRENT view looks like (Dashboard.js:
// getVisibleTableSnapshot already narrows this down to visible columns, in
// their current order, and only rows passing every active filter) -- these
// 2 routes don't touch the database at all, they just format whatever the
// already-authenticated caller is already looking at, so requireAuth alone
// (no client-scoping needed) is the right gate, same reasoning as any other
// purely-formatting endpoint.
const EXPORT_MAX_ROWS = 20000;
const EXPORT_MAX_COLUMNS = 200;

// Los datos que van arriba de la tabla exportada (opcional): hasta 30 pares [etiqueta, valor].
function exportHeaderPairs(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 30).filter((p) => Array.isArray(p)).map((p) => [String(p[0] ?? '').slice(0, 120), String(p[1] ?? '').slice(0, 400)]);
}
function validateExportPayload(req, res) {
    const { columns, rows } = req.body || {};
    if (!Array.isArray(columns) || !columns.length || !Array.isArray(rows)) {
        res.status(400).json({ message: 'columns and rows are required.' });
        return null;
    }
    if (rows.length > EXPORT_MAX_ROWS || columns.length > EXPORT_MAX_COLUMNS) {
        res.status(400).json({ message: 'Too many rows or columns to export.' });
        return null;
    }
    return { columns, rows };
}

// ---- El formato de la compañía en lo que se descarga (igual que las tarjetas de los QR): su logo (o sus iniciales), el tipo de documento en letras chicas, el Sitio (lo fuerte, con el color del cliente) y el nombre de la empresa (lo débil).
// Los tonos salen de la misma escala del color del cliente que usa QrBrandHeader.js (el 7.º para el sitio y la marca, el 9.º para el tipo); sin color propio se usa el morado del Pedido Manual. Del logo solo entran PNG y JPEG
// (lo que saben dibujar PDF y Excel); con otro formato (SVG, WebP, GIF) o sin logo sale la marca con las iniciales de la empresa, como en la página del QR. ----
const BRAND_LIGHTNESS = [97, 92, 84, 74, 63, 52, 42, 33, 24, 15];
function brandHexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255; const g = parseInt(hex.slice(3, 5), 16) / 255; const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2; const d = max - min;
    if (!d) return [0, 0, l * 100];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h;
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s * 100, l * 100];
}
function brandHslToHex(h, s, l) {
    const sat = s / 100; const lig = l / 100;
    const c = (1 - Math.abs(2 * lig - 1)) * sat; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = lig - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
}
function brandScale(seed) {
    const [h, s0] = brandHexToHsl(seed);
    const sat = s0 < 8 ? 0 : Math.max(30, Math.min(65, s0));
    return BRAND_LIGHTNESS.map((l) => brandHslToHex(h, sat, l));
}
// Ancho y alto de un PNG o un JPEG (null si no se pueden leer): hacen falta para dibujar el logo sin deformarlo.
function brandImageSize(buf, ext) {
    try {
        if (ext === 'png') return buf.length > 24 && buf.toString('latin1', 1, 4) === 'PNG' ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null;
        let i = 2;
        while (i + 9 < buf.length) {
            if (buf[i] !== 0xFF) return null;
            const marker = buf[i + 1];
            if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
            i += 2 + buf.readUInt16BE(i + 2);
        }
    } catch { /* imagen dañada */ }
    return null;
}
// El encabezado de la compañía de un archivo: { kind, siteName, companyName, initials, docTitle, scale, logo } (o null si la empresa no existe).
function exportBrandFor(clientId, { kind, siteName, docTitle }) {
    const client = getClientById(clientId);
    if (!client) return null;
    const seed = typeof client.seed_color === 'string' ? client.seed_color.trim() : '';
    let logo = null;
    const m = clientLogoDataUrl(clientId).match(/^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/);
    if (m) {
        const ext = m[1] === 'png' ? 'png' : 'jpeg';
        const buffer = Buffer.from(m[2], 'base64');
        const size = brandImageSize(buffer, ext);
        if (size && size.w > 0 && size.h > 0) logo = { buffer, ext, w: size.w, h: size.h };
    }
    const company = String(client.company_name || '').replace(/\s+/g, ' ').trim();
    return { kind: String(kind || '').replace(/\s+/g, ' ').trim().slice(0, 40), siteName: String(siteName || '').replace(/\s+/g, ' ').trim().slice(0, 80), companyName: company, initials: company.slice(0, 2).toUpperCase() || '··', docTitle: String(docTitle || '').replace(/\s+/g, ' ').trim().slice(0, 80), scale: brandScale(/^#[0-9a-fA-F]{6}$/.test(seed) ? seed : '#7d3f8f'), logo };
}
// Lo mismo a partir de lo que manda la App (con sesión): { kind, docTitle, costCenterId }; el sitio sale del Layout de ese centro de costos de SU empresa.
function exportBrandFromRequest(req) {
    const b = req.body && req.body.brand;
    if (!b || typeof b !== 'object' || !req.user || !req.user.clientId) return null;
    const costCenterId = Number(b.costCenterId);
    let siteName = '';
    if (Number.isInteger(costCenterId) && costCenterId > 0) {
        const layoutRow = getClientLayout(req.user.clientId, { costCenterId });
        siteName = layoutRow && layoutRow.layout ? layoutRow.layout.siteName || '' : '';
    }
    return exportBrandFor(req.user.clientId, { kind: b.kind, siteName, docTitle: b.docTitle });
}
// Excel: arriba, la marca (logo o iniciales a la izquierda; tipo, sitio y empresa a su lado), una línea del color y el título del documento.
function addXlsxBrand(workbook, sheet, brand, colCount) {
    const hex = (i) => `FF${brand.scale[i].slice(1).toUpperCase()}`;
    [16, 24, 16].forEach((height) => { const r = sheet.addRow([]); r.height = height; });
    sheet.getCell(1, 2).value = brand.kind.toUpperCase();
    sheet.getCell(1, 2).font = { size: 9, bold: true, color: { argb: hex(9) } };
    if (brand.siteName) {
        sheet.getCell(2, 2).value = brand.siteName;
        sheet.getCell(2, 2).font = { size: 16, bold: true, color: { argb: hex(7) } };
        sheet.getCell(3, 2).value = brand.companyName.toUpperCase();
        sheet.getCell(3, 2).font = { size: 9, bold: true, color: { argb: 'FF6B6B7B' } };
    } else {
        sheet.getCell(2, 2).value = brand.companyName;
        sheet.getCell(2, 2).font = { size: 13, bold: true };
    }
    if (brand.logo) {
        const id = workbook.addImage({ buffer: brand.logo.buffer, extension: brand.logo.ext });
        const k = Math.min(96 / brand.logo.w, 50 / brand.logo.h);
        sheet.addImage(id, { tl: { col: 0.04, row: 0.1 }, ext: { width: Math.round(brand.logo.w * k), height: Math.round(brand.logo.h * k) } });
    } else {
        sheet.mergeCells(1, 1, 3, 1);
        const mark = sheet.getCell(1, 1);
        mark.value = brand.initials;
        mark.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
        mark.alignment = { horizontal: 'center', vertical: 'middle' };
        mark.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hex(7) } };
    }
    for (let c = 1; c <= colCount; c += 1) sheet.getCell(3, c).border = { bottom: { style: 'medium', color: { argb: hex(3) } } };
    sheet.addRow([]);
    if (brand.docTitle) { const t = sheet.addRow([brand.docTitle]); t.getCell(1).font = { size: 13, bold: true }; t.height = 20; sheet.addRow([]); }
}
// PDF: arriba, la marca (logo o iniciales a la izquierda; tipo, sitio y empresa a su lado), una línea del color y el título del documento.
function drawPdfBrand(doc, brand) {
    const left = doc.page.margins.left;
    const top = doc.page.margins.top;
    const pageW = doc.page.width - left - doc.page.margins.right;
    const S = brand.scale;
    let blockW = 36;
    let blockH = 36;
    if (brand.logo) {
        const k = Math.min(110 / brand.logo.w, 32 / brand.logo.h);
        const dw = brand.logo.w * k;
        const dh = brand.logo.h * k;
        blockW = dw + 8;
        blockH = dh + 8;
        doc.roundedRect(left, top, blockW, blockH, 5).lineWidth(0.7).stroke('#E4D2E9');
        try { doc.image(brand.logo.buffer, left + 4, top + 4, { width: dw, height: dh }); } catch (err) { /* un logo que no se pueda dibujar deja solo el marco */ }
    } else {
        doc.roundedRect(left, top, 36, 36, 8).fill(S[7]);
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(13).text(brand.initials, left, top + 12, { width: 36, align: 'center', lineBreak: false });
    }
    const tx = left + blockW + 10;
    const tw = pageW - blockW - 10;
    doc.fillColor(S[9]).font('Helvetica-Bold').fontSize(7.5).text(brand.kind.toUpperCase(), tx, top + 1, { width: tw, characterSpacing: 1.4, lineBreak: false });
    if (brand.siteName) {
        doc.fillColor(S[7]).font('Helvetica-Bold').fontSize(15).text(brand.siteName, tx, top + 11, { width: tw, lineBreak: false, ellipsis: true });
        doc.fillColor('#6B6B7B').font('Helvetica-Bold').fontSize(7.5).text(brand.companyName.toUpperCase(), tx, top + 29, { width: tw, characterSpacing: 0.3, lineBreak: false, ellipsis: true });
    } else {
        doc.fillColor('#2A1B30').font('Helvetica-Bold').fontSize(12).text(brand.companyName, tx, top + 13, { width: tw, lineBreak: false, ellipsis: true });
    }
    const bottom = top + Math.max(blockH, 40) + 8;
    doc.moveTo(left, bottom).lineWidth(1).lineTo(left + pageW, bottom).stroke(S[3]);
    doc.fillColor('#000000');
    doc.x = left;
    doc.y = bottom + 12;
    if (brand.docTitle) {
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#2A1B30').text(brand.docTitle, left, doc.y, { width: pageW });
        doc.moveDown(0.5);
        doc.fillColor('#000000');
        doc.x = left;
    }
}

// Escribe un Excel (título, datos de arriba opcionales, columnas y renglones) como respuesta; lo usan la ruta de exportar de siempre y el QR del Pedido Manual. brand (opcional): el formato de la compañía arriba.
async function sendXlsxExport(res, { title, fileBase, header, columns, rows, brand }) {
    const workbook = new ExcelJS.Workbook();
    // Excel sheet names: max 31 chars, can't contain \ / * ? : [ ]
    const sheet = workbook.addWorksheet(title.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Reporte');
    const cellText = (cell) => (cell == null ? '' : String(cell));
    if (!header.length) {
        sheet.columns = columns.map((col) => {
            const label = String(col?.label ?? '');
            return { header: label, width: Math.max(12, label.length + 4) };
        });
        rows.forEach((row) => {
            sheet.addRow(Array.isArray(row) ? row.map(cellText) : []);
        });
        sheet.getRow(1).font = { bold: true };
    } else {
        if (brand) addXlsxBrand(workbook, sheet, brand, columns.length);
        header.forEach(([label, value]) => { const r = sheet.addRow([label, value]); r.getCell(1).font = { bold: true }; });
        sheet.addRow([]);
        const head = sheet.addRow(columns.map((col) => String(col?.label ?? '')));
        head.font = { bold: true };
        head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brand ? `FF${brand.scale[1].slice(1).toUpperCase()}` : 'FFEDE7F2' } }; });
        rows.forEach((row) => { sheet.addRow(Array.isArray(row) ? row.map(cellText) : []); });
        columns.forEach((col, i) => {
            const widest = rows.reduce((m, row) => Math.max(m, cellText(Array.isArray(row) ? row[i] : '').length), String(col?.label ?? '').length);
            sheet.getColumn(i + 1).width = Math.min(60, Math.max(12, widest + 3));
        });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', buildContentDisposition(`${fileBase}.xlsx`));
    await workbook.xlsx.write(res);
    res.end();
}
app.post('/api/business/export/xlsx', requireAuth, async (req, res) => {
    const payload = validateExportPayload(req, res);
    if (!payload) return;
    const { columns, rows } = payload;
    const title = String(req.body.title || 'Reporte').trim() || 'Reporte';
    const fileBase = String(req.body.filename || title).trim() || title;
    const header = exportHeaderPairs(req.body.header); // datos que van ARRIBA de la tabla (por ejemplo, los del pedido): [[etiqueta, valor], ...]
    await sendXlsxExport(res, { title, fileBase, header, columns, rows, brand: exportBrandFromRequest(req) });
});

// pdfkit has no built-in table widget -- draws a simple even-width grid by
// hand, breaking to a new page (and re-measuring from the top margin) once
// a row would run past the bottom margin. Long cell text is clipped with
// an ellipsis rather than wrapped, so every row stays the same height and
// the grid lines stay simple to draw.
function drawPdfTable(doc, columns, rows) {
    const startX = doc.page.margins.left;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = pageWidth / columns.length;
    const rowHeight = 20;
    let y = doc.y;

    function drawRow(values, isHeader) {
        if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            y = doc.page.margins.top;
        }
        let x = startX;
        doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
        values.forEach((val) => {
            doc.rect(x, y, colWidth, rowHeight).stroke('#CCCCCC');
            doc.fillColor('#000000').text(String(val ?? ''), x + 3, y + 5, {
                width: colWidth - 6, height: rowHeight - 6, ellipsis: true, lineBreak: false,
            });
            x += colWidth;
        });
        y += rowHeight;
    }

    drawRow(columns.map((c) => c.label), true);
    rows.forEach((row) => drawRow(row, false));
}

// Tabla para listas de texto largo (por ejemplo, los artículos de un pedido): las columnas se reparten por pesos (widths) y el texto se parte en renglones; el encabezado se repite en cada hoja.
function drawPdfTableWrapped(doc, columns, rows, weights, headFill) {
    const startX = doc.page.margins.left;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const w = columns.map((_, i) => Math.max(0.2, Number(weights && weights[i]) || 1));
    const total = w.reduce((a, b) => a + b, 0);
    const widths = w.map((x) => (x / total) * pageWidth);
    const pad = 3;
    const labels = columns.map((c) => String(c?.label ?? ''));
    let y = doc.y;
    function drawRow(values, isHeader) {
        doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
        const cells = values.map((val) => String(val ?? ''));
        const h = Math.max(...cells.map((txt, i) => doc.heightOfString(txt, { width: widths[i] - pad * 2 })), 8) + pad * 2;
        if (y + h > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            y = doc.page.margins.top;
            if (!isHeader) drawRow(labels, true);
            doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
        }
        let x = startX;
        cells.forEach((txt, i) => {
            if (isHeader) doc.rect(x, y, widths[i], h).fillAndStroke(headFill || '#EDE7F2', '#CCCCCC'); else doc.rect(x, y, widths[i], h).stroke('#CCCCCC');
            doc.fillColor('#000000').text(txt, x + pad, y + pad, { width: widths[i] - pad * 2 });
            x += widths[i];
        });
        y += h;
    }
    drawRow(labels, true);
    rows.forEach((row) => drawRow(Array.isArray(row) ? row : [], false));
    doc.y = y;
}

// Escribe un PDF (título, datos de arriba opcionales y una tabla) como respuesta; lo usan la ruta de exportar de siempre y el QR del Pedido Manual.
function sendPdfExport(res, { title, fileBase, header, columns, rows, wrap, widths, brand }) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', buildContentDisposition(`${fileBase}.pdf`));
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: columns.length > 5 ? 'landscape' : 'portrait' });
    doc.pipe(res);
    if (brand) drawPdfBrand(doc, brand);
    else {
        doc.font('Helvetica-Bold').fontSize(14).text(title, { align: 'center' });
        doc.moveDown(0.6);
    }
    if (header.length) {
        header.forEach(([label, value]) => {
            doc.font('Helvetica-Bold').fontSize(9).text(`${label}: `, { continued: true }).font('Helvetica').text(value);
        });
        doc.moveDown(0.8);
    }
    if (wrap) drawPdfTableWrapped(doc, columns, rows, Array.isArray(widths) ? widths : null, brand ? brand.scale[1] : undefined);
    else drawPdfTable(doc, columns, rows);
    doc.end();
}
app.post('/api/business/export/pdf', requireAuth, (req, res) => {
    const payload = validateExportPayload(req, res);
    if (!payload) return;
    const { columns, rows } = payload;
    const title = String(req.body.title || 'Reporte').trim() || 'Reporte';
    const fileBase = String(req.body.filename || title).trim() || title;
    const header = exportHeaderPairs(req.body.header);
    sendPdfExport(res, { title, fileBase, header, columns, rows, wrap: !!req.body.wrap, widths: Array.isArray(req.body.widths) ? req.body.widths : null, brand: exportBrandFromRequest(req) });
});

app.post('/api/business/intelligent-reports', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        const level = getColumnGrantLevel(grants, 'transacciones-inteligentes', 'colReportAuthorization');
        if (level !== 'ver-y-operar' && level !== 'editar') {
            return res.status(403).json({ message: 'No tienes permiso para crear reportes.' });
        }
    }
    const { name, columns } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ message: 'name is required.' });
    const columnsError = validateReportColumns(columns || []);
    if (columnsError) return res.status(400).json({ message: columnsError });
    const report = createIntelligentReport({
        clientId: req.user.clientId, name: name.trim(), createdBy: req.user.name, columns,
    });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'transacciones-inteligentes', recordId: report.id,
        recordLabel: report.name, action: 'create', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'transacciones-inteligentes', 'create', report.name);
    res.status(201).json({ report: mapIntelligentReport(report, getClientById(req.user.clientId)?.company_name) });
});

app.patch('/api/business/intelligent-reports/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getIntelligentReportById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Report not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (getColumnGrantLevel(grants, 'transacciones-inteligentes', 'colReportAuthorization') !== 'editar') {
            return res.status(403).json({ message: 'No tienes permiso para editar reportes.' });
        }
    }
    const { name, columns } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ message: 'name is required.' });
    const columnsError = validateReportColumns(columns || []);
    if (columnsError) return res.status(400).json({ message: columnsError });
    const report = updateIntelligentReport(req.params.id, req.user.clientId, { name: name.trim(), columns });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'transacciones-inteligentes', recordId: report.id,
        recordLabel: report.name, action: 'update', changedBy: changedByLabel(req),
    });
    res.json({ report: mapIntelligentReport(report, getClientById(req.user.clientId)?.company_name) });
});

app.delete('/api/business/intelligent-reports/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getIntelligentReportById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Report not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canDeleteColumn(grants, 'transacciones-inteligentes', 'colReportAuthorization')) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar reportes.' });
        }
    }
    logTableChange({
        clientId: req.user.clientId, tableKey: 'transacciones-inteligentes', recordId: existing.id,
        recordLabel: existing.name, action: 'delete', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'transacciones-inteligentes', 'delete', existing.name);
    deleteIntelligentReport(req.params.id, req.user.clientId);
    res.status(204).end();
});

app.post('/api/business/intelligent-reports/:id/authorize', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getIntelligentReportById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Report not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canAuthorizeColumn(grants, 'transacciones-inteligentes', 'colReportAuthorization')) {
            return res.status(403).json({ message: 'No tienes permiso para autorizar reportes.' });
        }
    }
    const report = authorizeIntelligentReport(req.params.id, req.user.clientId, req.user.name);
    logTableChange({
        clientId: req.user.clientId, tableKey: 'transacciones-inteligentes', recordId: report.id,
        recordLabel: report.name, action: 'update', changedBy: changedByLabel(req),
    });
    res.json({ report: mapIntelligentReport(report, getClientById(req.user.clientId)?.company_name) });
});

// --- Reportes Programados (Configuración > Negocio Inteligente) ------------
// No mailer/WhatsApp/internal-chat delivery integration exists yet -- this
// only records the schedule definition for whenever that job gets built
// (same "define, don't execute" scope Transacciones Inteligentes itself
// started with).
const SCHEDULED_REPORT_DELIVERY_METHODS = ['email', 'whatsapp', 'internal_chat'];

function validateScheduledReportPayload(req, res) {
    const { reportId, name, endDate, deliveryMethod, recipients } = req.body || {};
    if (!name?.trim()) { res.status(400).json({ message: 'name is required.' }); return null; }
    if (!reportId) { res.status(400).json({ message: 'reportId is required.' }); return null; }
    if (!SCHEDULED_REPORT_DELIVERY_METHODS.includes(deliveryMethod)) {
        res.status(400).json({ message: 'deliveryMethod must be email, whatsapp, or internal_chat.' });
        return null;
    }
    if (!recipients?.trim()) { res.status(400).json({ message: 'recipients is required.' }); return null; }
    const report = getIntelligentReportById(reportId, req.user.clientId);
    if (!report) { res.status(400).json({ message: 'reportId does not match an existing report.' }); return null; }
    return { reportId, name: name.trim(), endDate: endDate?.trim() || null, deliveryMethod, recipients: recipients.trim() };
}

// Fixed per menu.json's own placement (main/btn-configuracion/
// btn-negocio-inteligente/nit-reportes-programados) — same recipe as
// FUEL_RECORD_*_LABEL above.
const SCHEDULED_REPORT_MODULE_LABEL = 'Configuración';
const SCHEDULED_REPORT_AREA_LABEL = 'Negocio Inteligente';
const SCHEDULED_REPORT_SCREEN_LABEL = 'Reportes Programados';

function mapScheduledReport(row, companyName) {
    if (!row) return row;
    return {
        ...row,
        ...getSystemColumnsForRecord({
            companyName,
            area: SCHEDULED_REPORT_AREA_LABEL,
            modulo: SCHEDULED_REPORT_MODULE_LABEL,
            pantalla: SCHEDULED_REPORT_SCREEN_LABEL,
            centroCostos: '',
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/scheduled-reports', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const companyName = getClientById(req.user.clientId)?.company_name;
    const scheduledReports = listScheduledReports(req.user.clientId).map((r) => mapScheduledReport(r, companyName));
    res.json({ scheduledReports });
});

app.post('/api/business/scheduled-reports', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        const level = getColumnGrantLevel(grants, 'reportes-programados', 'colScheduledAuthorizedBy');
        if (level !== 'ver-y-operar' && level !== 'editar') {
            return res.status(403).json({ message: 'No tienes permiso para crear envíos programados.' });
        }
    }
    const payload = validateScheduledReportPayload(req, res);
    if (!payload) return;
    const scheduledReport = createScheduledReport({ clientId: req.user.clientId, createdBy: req.user.name, ...payload });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'reportes-programados', recordId: scheduledReport.id,
        recordLabel: scheduledReport.name, action: 'create', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'reportes-programados', 'create', scheduledReport.name);
    res.status(201).json({ scheduledReport: mapScheduledReport(scheduledReport, getClientById(req.user.clientId)?.company_name) });
});

app.patch('/api/business/scheduled-reports/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getScheduledReportById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Scheduled report not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (getColumnGrantLevel(grants, 'reportes-programados', 'colScheduledAuthorizedBy') !== 'editar') {
            return res.status(403).json({ message: 'No tienes permiso para editar envíos programados.' });
        }
    }
    const payload = validateScheduledReportPayload(req, res);
    if (!payload) return;
    const scheduledReport = updateScheduledReport(req.params.id, req.user.clientId, payload);
    logTableChange({
        clientId: req.user.clientId, tableKey: 'reportes-programados', recordId: scheduledReport.id,
        recordLabel: scheduledReport.name, action: 'update', changedBy: changedByLabel(req),
    });
    res.json({ scheduledReport: mapScheduledReport(scheduledReport, getClientById(req.user.clientId)?.company_name) });
});

app.delete('/api/business/scheduled-reports/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getScheduledReportById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Scheduled report not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canDeleteColumn(grants, 'reportes-programados', 'colScheduledAuthorizedBy')) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar envíos programados.' });
        }
    }
    deleteScheduledReport(req.params.id, req.user.clientId);
    logTableChange({
        clientId: req.user.clientId, tableKey: 'reportes-programados', recordId: existing.id,
        recordLabel: existing.name, action: 'delete', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'reportes-programados', 'delete', existing.name);
    res.status(204).end();
});

app.post('/api/business/scheduled-reports/:id/authorize', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getScheduledReportById(req.params.id, req.user.clientId);
    if (!existing) return res.status(404).json({ message: 'Scheduled report not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canAuthorizeColumn(grants, 'reportes-programados', 'colScheduledAuthorizedBy')) {
            return res.status(403).json({ message: 'No tienes permiso para autorizar envíos programados.' });
        }
    }
    const scheduledReport = authorizeScheduledReport(req.params.id, req.user.clientId, req.user.name);
    logTableChange({
        clientId: req.user.clientId, tableKey: 'reportes-programados', recordId: scheduledReport.id,
        recordLabel: scheduledReport.name, action: 'update', changedBy: changedByLabel(req),
    });
    res.json({ scheduledReport: mapScheduledReport(scheduledReport, getClientById(req.user.clientId)?.company_name) });
});

// --- Registro Combustible (Operaciones > Transporte Volumen) ----------------
// Any authenticated staff member at a client can read/create/edit these —
// unlike cost centers, this is day-to-day operational data entry, not
// account administration, so it's not gated by requireClientAdmin. Page-level
// access is already enforced by the sidebar/menu grant system on the client
// (Dashboard.initDashboard); these routes only require the caller to belong
// to a client at all.
// Control Interno's Área/Módulo/Pantalla are fixed for this one screen
// (matches its own position in menu.json: sc-area-transport-1 /
// supply-chain / cat-operaciones-transporte-vol-combustible) -- a future
// table repeats this same recipe with its own 3 fixed labels.
const FUEL_RECORD_AREA_LABEL = 'Transporte Volumen';
const FUEL_RECORD_MODULE_LABEL = 'Cadena de Suministro';
const FUEL_RECORD_SCREEN_LABEL = 'Registro Combustible';

function mapFuelRecord(row, pendingByRecord, companyName) {
    if (!row) return row;
    return {
        id: row.id,
        dbId: row.db_id,
        recordNumber: row.record_number,
        date: row.record_date,
        ecoUnit: row.eco_unit,
        plates: row.plates,
        driver: row.driver,
        coordinator: row.coordinator,
        ticketEvidence: row.ticket_evidence,
        tripKmBefore: row.trip_km_before,
        tripKmBeforeEvidence: row.trip_km_before_evidence,
        tripKmAfter: row.trip_km_after,
        tripKmAfterEvidence: row.trip_km_after_evidence,
        fuelType: row.fuel_type,
        liters: row.liters,
        subtotal: row.subtotal,
        vat: row.vat,
        reason: row.reason,
        transferService: row.transfer_service,
        internalMovement: row.internal_movement,
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({
            companyName,
            area: FUEL_RECORD_AREA_LABEL,
            modulo: FUEL_RECORD_MODULE_LABEL,
            pantalla: FUEL_RECORD_SCREEN_LABEL,
            centroCostos: row.centro_costos,
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/fuel-records', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'registro-combustible');
    const client = getClientById(req.user.clientId);
    res.json({ records: listFuelRecords(req.user.clientId, req.user.isTestAccount).map((r) => mapFuelRecord(r, pendingByRecord, client?.company_name)) });
});

app.post('/api/business/fuel-records', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!req.user.isClientAdmin && !canCreateColumn(getUserEffectiveGrants(req.user.sub), 'registro-combustible', 'colFuelCreateAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para crear registros aquí.' });
    }
    const { date, ecoUnit, driver, coordinator, centroCostos } = req.body || {};
    if (!date || !ecoUnit?.trim() || !driver?.trim() || !coordinator?.trim()) {
        return res.status(400).json({ message: 'date, ecoUnit, driver and coordinator are required.' });
    }
    // Centro Costos is a Control Interno column -- it must be filled in
    // from creation, same as the fields above, not left to be silently
    // blank (the client only ever sends a value when exactly one cost
    // center is active in the top-bar picker; see
    // Dashboard.selectedCostCenterLabel's own comment for why).
    if (!centroCostos?.trim()) {
        return res.status(400).json({ message: 'centroCostos is required.' });
    }
    const record = createFuelRecord({
        clientId: req.user.clientId,
        date,
        ecoUnit: ecoUnit.trim(),
        driver: driver.trim(),
        coordinator: coordinator.trim(),
        centroCostos: (centroCostos || '').trim(),
        isTestData: req.user.isTestAccount,
    });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'registro-combustible', recordId: record.id,
        recordLabel: record.eco_unit, action: 'create', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'registro-combustible', 'create', record.eco_unit);
    const client = getClientById(req.user.clientId);
    res.status(201).json({ record: mapFuelRecord(record, null, client?.company_name) });
});

app.patch('/api/business/fuel-records/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getFuelRecordById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Fuel record not found.' });
    const patch = req.body || {};
    // The lock/diff check runs on the raw patch (never sanitized — see
    // checkAndLogFieldChanges' own note); only what gets WRITTEN to the
    // change-history log is sanitized, so the raw base64 ticket photo never
    // lands in the audit table. No longer all-or-nothing: appliedPatch may
    // be a subset of `patch` — anything diverted to pendingFields or
    // rejectedFields is simply excluded from what actually gets written.
    const { appliedPatch, pendingFields, rejectedFields } = checkAndLogFieldChanges(req, existing, patch, FUEL_PATCHABLE_FIELDS, 'registro-combustible', existing.eco_unit, {
        ticketEvidence: (v) => (v ? '[imagen]' : ''),
        tripKmBeforeEvidence: (v) => (v ? '[imagen]' : ''),
        tripKmAfterEvidence: (v) => (v ? '[imagen]' : ''),
    });
    const record = updateFuelRecord(req.params.id, req.user.clientId, appliedPatch, req.user.isTestAccount);
    const client = getClientById(req.user.clientId);
    res.json({ record: mapFuelRecord(record, null, client?.company_name), pendingFields, rejectedFields });
});

app.delete('/api/business/fuel-records/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getFuelRecordById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Fuel record not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canDeleteColumn(grants, 'registro-combustible', 'colFuelDeleteAuth')) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar registros.' });
        }
    }
    logTableChange({
        clientId: req.user.clientId, tableKey: 'registro-combustible', recordId: existing.id,
        recordLabel: existing.eco_unit, action: 'delete', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'registro-combustible', 'delete', existing.eco_unit);
    deleteFuelRecord(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Carga Combustible (Operaciones > Transporte Volumen, sibling of ------
// Registro Combustible) — same shape/permission model as fuel-records above,
// just its own table/fields (see FUEL_LOADING_PATCHABLE_FIELDS in db.js).
const FUEL_LOADING_AREA_LABEL = 'Transporte Volumen';
const FUEL_LOADING_MODULE_LABEL = 'Cadena de Suministro';
const FUEL_LOADING_SCREEN_LABEL = 'Carga Combustible';

function mapFuelLoadingRecord(row, pendingByRecord, companyName) {
    if (!row) return row;
    return {
        id: row.id,
        dbId: row.db_id,
        recordNumber: row.record_number,
        date: row.record_date,
        loadSite: row.load_site,
        operator: row.operator,
        coordinator: row.coordinator,
        ecoUnit: row.eco_unit,
        fuelType: row.fuel_type,
        tripBefore: row.trip_before,
        tripBeforeEvidence: row.trip_before_evidence,
        tripAfter: row.trip_after,
        tripAfterEvidence: row.trip_after_evidence,
        totalCost: row.total_cost,
        totalCostEvidence: row.total_cost_evidence,
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({
            companyName,
            area: FUEL_LOADING_AREA_LABEL,
            modulo: FUEL_LOADING_MODULE_LABEL,
            pantalla: FUEL_LOADING_SCREEN_LABEL,
            centroCostos: row.centro_costos,
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/fuel-loading-records', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'carga-combustible');
    const client = getClientById(req.user.clientId);
    res.json({ records: listFuelLoadingRecords(req.user.clientId, req.user.isTestAccount).map((r) => mapFuelLoadingRecord(r, pendingByRecord, client?.company_name)) });
});

// Creates a blank record immediately — no fields required up front (see
// createFuelLoadingRecord's own note). Every field, including the
// identifying ones, is filled in afterward one at a time via PATCH.
app.post('/api/business/fuel-loading-records', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!req.user.isClientAdmin && !canCreateColumn(getUserEffectiveGrants(req.user.sub), 'carga-combustible', 'colCargaCreateAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para crear registros aquí.' });
    }
    const record = createFuelLoadingRecord({ clientId: req.user.clientId, isTestData: req.user.isTestAccount });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'carga-combustible', recordId: record.id,
        recordLabel: record.db_id, action: 'create', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'carga-combustible', 'create', record.db_id);
    const client = getClientById(req.user.clientId);
    res.status(201).json({ record: mapFuelLoadingRecord(record, null, client?.company_name) });
});

app.patch('/api/business/fuel-loading-records/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getFuelLoadingRecordById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Fuel loading record not found.' });
    const { baseline, overrideConflicts, ...patch } = req.body || {};
    const { appliedPatch, pendingFields, rejectedFields, conflictFields } = checkAndLogFieldChanges(req, existing, patch, FUEL_LOADING_PATCHABLE_FIELDS, 'carga-combustible', existing.eco_unit || existing.db_id, {
        tripBeforeEvidence: (v) => (v ? '[imagen]' : ''),
        tripAfterEvidence: (v) => (v ? '[imagen]' : ''),
        totalCostEvidence: (v) => (v ? '[imagen]' : ''),
    }, { baseline, overrideConflicts });
    const record = updateFuelLoadingRecord(req.params.id, req.user.clientId, appliedPatch, req.user.isTestAccount);
    const client = getClientById(req.user.clientId);
    res.json({ record: mapFuelLoadingRecord(record, null, client?.company_name), pendingFields, rejectedFields, conflictFields });
});

app.delete('/api/business/fuel-loading-records/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getFuelLoadingRecordById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Fuel loading record not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canDeleteColumn(grants, 'carga-combustible', 'colCargaDeleteAuth')) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar registros.' });
        }
    }
    logTableChange({
        clientId: req.user.clientId, tableKey: 'carga-combustible', recordId: existing.id,
        recordLabel: existing.eco_unit || existing.db_id, action: 'delete', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'carga-combustible', 'delete', existing.eco_unit || existing.db_id);
    deleteFuelLoadingRecord(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Tipos de Unidad (Catálogos > Transporte Volumen) -----------------------
// Simple reference catalog -- what the automakers already classify (Tracto
// Camión, Camioneta, Sedán...), each with its own Tipo Combustible. Same
// blank-create-then-PATCH-per-field flow as Carga Combustible, on both
// platforms (see createUnitType's own note in db.js) -- no modal to keep in
// sync with what the server actually reads.
const UNIT_TYPE_AREA_LABEL = 'Transporte Volumen';
const UNIT_TYPE_MODULE_LABEL = 'Cadena de Suministro';
const UNIT_TYPE_SCREEN_LABEL = 'Tipos de Unidad';

function mapUnitTypeRecord(row, pendingByRecord, companyName) {
    if (!row) return row;
    return {
        id: row.id,
        code: row.code,
        name: row.name,
        fuelType: row.fuel_type,
        status: row.status,
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({
            companyName,
            area: UNIT_TYPE_AREA_LABEL,
            modulo: UNIT_TYPE_MODULE_LABEL,
            pantalla: UNIT_TYPE_SCREEN_LABEL,
            centroCostos: '',
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/unit-types', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'tipos-unidad');
    const client = getClientById(req.user.clientId);
    res.json({ unitTypes: listUnitTypes(req.user.clientId, req.user.isTestAccount).map((r) => mapUnitTypeRecord(r, pendingByRecord, client?.company_name)) });
});

app.post('/api/business/unit-types', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!req.user.isClientAdmin && !canCreateColumn(getUserEffectiveGrants(req.user.sub), 'tipos-unidad', 'colUnitTypeCreateAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para crear registros aquí.' });
    }
    const unitType = createUnitType({ clientId: req.user.clientId, isTestData: req.user.isTestAccount });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'tipos-unidad', recordId: unitType.id,
        recordLabel: unitType.code, action: 'create', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'tipos-unidad', 'create', unitType.code);
    const client = getClientById(req.user.clientId);
    res.status(201).json({ unitType: mapUnitTypeRecord(unitType, null, client?.company_name) });
});

app.patch('/api/business/unit-types/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getUnitTypeById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Unit type not found.' });
    const { baseline, overrideConflicts, ...patch } = req.body || {};
    const { appliedPatch, pendingFields, rejectedFields, conflictFields } = checkAndLogFieldChanges(req, existing, patch, UNIT_TYPE_PATCHABLE_FIELDS, 'tipos-unidad', existing.code, {}, { baseline, overrideConflicts });
    const unitType = updateUnitType(req.params.id, req.user.clientId, appliedPatch, req.user.isTestAccount);
    const client = getClientById(req.user.clientId);
    res.json({ unitType: mapUnitTypeRecord(unitType, null, client?.company_name), pendingFields, rejectedFields, conflictFields });
});

app.delete('/api/business/unit-types/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getUnitTypeById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Unit type not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canDeleteColumn(grants, 'tipos-unidad', 'colUnitTypeDeleteAuth')) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar tipos de unidad.' });
        }
    }
    logTableChange({
        clientId: req.user.clientId, tableKey: 'tipos-unidad', recordId: existing.id,
        recordLabel: existing.code, action: 'delete', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'tipos-unidad', 'delete', existing.code);
    deleteUnitType(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Nuestras Unidades (Operaciones > Transporte Volumen) -------------------
// The client's real fleet -- one row per physical vehicle, keyed by its own
// Económico (eco_id, unique per client -- confirmed product decision,
// enforced here at the application layer since a blank record can't carry a
// DB-level UNIQUE, see fleet_units' own schema comment). Carga Combustible
// reads this by eco_id to SUGGEST Tipo Combustible -- open/never blocking,
// per the same product decision: an unmatched Económico is fine, it just
// gets no suggestion.
const FLEET_UNIT_AREA_LABEL = 'Transporte Volumen';
const FLEET_UNIT_MODULE_LABEL = 'Cadena de Suministro';
const FLEET_UNIT_SCREEN_LABEL = 'Nuestras Unidades';

function mapFleetUnitRecord(row, pendingByRecord, companyName) {
    if (!row) return row;
    const unitType = row.unit_type_id ? getUnitTypeById(row.unit_type_id, row.client_id, !!row.is_test_data) : null;
    return {
        id: row.id,
        ecoId: row.eco_id,
        unitTypeId: row.unit_type_id || null,
        unitTypeName: unitType?.name || '',
        fuelType: unitType?.fuel_type || '',
        plates: row.plates,
        brandModel: row.brand_model,
        year: row.year,
        status: row.status,
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({
            companyName,
            area: FLEET_UNIT_AREA_LABEL,
            modulo: FLEET_UNIT_MODULE_LABEL,
            pantalla: FLEET_UNIT_SCREEN_LABEL,
            centroCostos: '',
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/fleet-units', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'nuestras-unidades');
    const client = getClientById(req.user.clientId);
    res.json({ fleetUnits: listFleetUnits(req.user.clientId, req.user.isTestAccount).map((r) => mapFleetUnitRecord(r, pendingByRecord, client?.company_name)) });
});

app.post('/api/business/fleet-units', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!req.user.isClientAdmin && !canCreateColumn(getUserEffectiveGrants(req.user.sub), 'nuestras-unidades', 'colFleetCreateAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para crear registros aquí.' });
    }
    const fleetUnit = createFleetUnit({ clientId: req.user.clientId, isTestData: req.user.isTestAccount });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'nuestras-unidades', recordId: fleetUnit.id,
        recordLabel: `#${fleetUnit.id}`, action: 'create', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'nuestras-unidades', 'create', `#${fleetUnit.id}`);
    const client = getClientById(req.user.clientId);
    res.status(201).json({ fleetUnit: mapFleetUnitRecord(fleetUnit, null, client?.company_name) });
});

app.patch('/api/business/fleet-units/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getFleetUnitById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Fleet unit not found.' });
    const { baseline, overrideConflicts, ...patch } = req.body || {};
    if (typeof patch.ecoId === 'string' && patch.ecoId.trim() && patch.ecoId.trim() !== existing.eco_id) {
        const dupe = getFleetUnitByEcoId(req.user.clientId, patch.ecoId, req.user.isTestAccount);
        if (dupe && dupe.id !== existing.id) {
            return res.status(400).json({ message: 'That Económico is already registered to another unit.' });
        }
    }
    const { appliedPatch, pendingFields, rejectedFields, conflictFields } = checkAndLogFieldChanges(req, existing, patch, FLEET_UNIT_PATCHABLE_FIELDS, 'nuestras-unidades', existing.eco_id || `#${existing.id}`, {}, { baseline, overrideConflicts });
    const fleetUnit = updateFleetUnit(req.params.id, req.user.clientId, appliedPatch, req.user.isTestAccount);
    const client = getClientById(req.user.clientId);
    res.json({ fleetUnit: mapFleetUnitRecord(fleetUnit, null, client?.company_name), pendingFields, rejectedFields, conflictFields });
});

app.delete('/api/business/fleet-units/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getFleetUnitById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Fleet unit not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canDeleteColumn(grants, 'nuestras-unidades', 'colFleetDeleteAuth')) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar unidades.' });
        }
    }
    logTableChange({
        clientId: req.user.clientId, tableKey: 'nuestras-unidades', recordId: existing.id,
        recordLabel: existing.eco_id || `#${existing.id}`, action: 'delete', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'nuestras-unidades', 'delete', existing.eco_id || `#${existing.id}`);
    deleteFleetUnit(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Alta Nuestros Artículos (Sku) (Operaciones > Cadena de Suministro > ---
// --- C. Distribución) -- Operación only: data only capturable with the ----
// physical product in hand. Categorías/Estatus (Catálogos), Punto de
// Reorden (Gestión) and Activar/Inactivar (Administración) are deliberately
// NOT here -- confirmed with the client. SKU shown to the user is just
// record_number zero-padded (see sku_items' own DDL comment in db.js) --
// never its own column, so it can't drift from the counter that makes it.
const SKU_ITEM_AREA_LABEL = 'C. Distribución';
const SKU_ITEM_MODULE_LABEL = 'Cadena de Suministro';
const SKU_ITEM_SCREEN_LABEL = 'Alta Nuestros Artículos';

// --- Clasificación de un código --------------------------------------------------------------------------------------------------
// Las clasificaciones que ofrece una Categoría Inventario (el código guarda el NOMBRE de su categoría): las que esa categoría tiene en Nuestras Categorías Inventario, del catálogo.
function inventoryClassificationsFor(clientId, isTest, categoryName) {
    if (!categoryName) return [];
    const category = listArticleCategories(clientId, 'inventario', isTest).find((r) => r.name === categoryName);
    if (!category) return [];
    const all = new Map(listArticleCategories(clientId, 'clasificaciones', isTest).map((r) => [r.id, r]));
    return parseClassificationIds(category.classification_ids).map((id) => all.get(id)).filter(Boolean);
}
// Mientras se arma una lista de códigos (GET /sku-items, que es síncrono) se recuerda el nombre de cada clasificación: con miles de códigos eran miles de consultas iguales.
let classificationNameMemo = null;
const classificationNameOf = (clientId, isTest, id) => {
    if (id == null || id === '') return '';
    const memoKey = classificationNameMemo ? `${clientId}|${isTest ? 1 : 0}|${id}` : null;
    if (memoKey && classificationNameMemo.has(memoKey)) return classificationNameMemo.get(memoKey);
    const row = getArticleCategoryById(Number(id), clientId, isTest);
    const name = row && row.category_type === 'clasificaciones' ? (row.name || '') : '';
    if (memoKey) classificationNameMemo.set(memoKey, name);
    return name;
};
// Revisa classificationId en el PATCH de un código: vacío = sin clasificación; si no, debe ser una de las de su Categoría Inventario (la que trae el mismo PATCH o la que ya tiene).
function prepareSkuClassificationPatch(req, existing, patch) {
    if (!Object.prototype.hasOwnProperty.call(patch, 'classificationId')) return { patch };
    const { clientId, isTestAccount } = req.user;
    const bad = (message) => ({ error: { status: 400, message } });
    const raw = patch.classificationId;
    if (raw === '' || raw == null) return { patch: { ...patch, classificationId: null } };
    const id = Number(raw);
    if (!Number.isInteger(id)) return bad('Elige una clasificación de la lista.');
    const category = Object.prototype.hasOwnProperty.call(patch, 'categoryInventario') ? patch.categoryInventario : existing.category_inventario;
    if (!category) return bad('Primero elige la Categoría Inventario del código.');
    const row = inventoryClassificationsFor(clientId, isTestAccount, category).find((r) => r.id === id);
    if (!row) return bad(`Esa clasificación no es de la categoría "${category}".`);
    if (row.status !== 'active' && existing.classification_id !== id) return bad(`La clasificación "${row.name}" está inactiva. Elige una activa.`);
    return { patch: { ...patch, classificationId: id } };
}

// Presentaciones de distribución del código (tabla sku_distribution_units; ver public/PackCalc.js): el material principal y sus empaques en cadena.
const PackCalc = require('./public/PackCalc.js');
const PACK_ORDINALS = ['Material principal', 'Empaque primario', 'Empaque secundario', 'Empaque terciario', 'Empaque cuaternario', 'Empaque quinto', 'Empaque sexto', 'Empaque séptimo', 'Empaque octavo', 'Empaque noveno', 'Empaque décimo'];
const packLevelLabel = (level, lv) => `${PACK_ORDINALS[level] || `Empaque ${level}`}${lv && lv.brand ? ` · ${lv.brand}` : ''}${lv && lv.name ? ` · ${lv.name}` : ''}`;
// De los renglones de un código (de menor a mayor nivel) arma lo que lee PackCalc.levelsOf: { main: { shape, lay, name, weightG }, levels: [{ name, shape, l, w, h, pieces, lay, weightG }] }.
// pieces = la equivalencia en unidades principales (cuántas tabletas trae): contiene × la equivalencia del nivel anterior; las medidas y el peso NO se calculan, cada nivel trae los suyos.
// Los tipos de almacenamiento de una presentación: NULL (sin elegir) = el de siempre según su nivel; '' = ninguno a propósito.
function skuDistTypesOf(row) {
    if (!row) return [];
    if (row.kind === 'marca') return []; // el renglón de una marca solo agrupa: no se acomoda
    if (row.storage_types === null || row.storage_types === undefined) return [row.level === 0 ? 'principal' : 'empaque'];
    return SKU_DIST_STORAGE_TYPES.filter((k) => String(row.storage_types).split(',').includes(k));
}
// El nombre de una presentación: su unidad, cuántas trae y de qué unidad (la de la presentación de la que sale): «Caja con 20 Tbta», «Caja con 20 Caja». El material principal se llama como su unidad.
const skuDistName = (row, parent) => {
    if (row.level === 0) return row.sku_uom || '';
    if (row.kind === 'marca') return row.brand_name || '';
    const unit = parent ? ((parent.level === 0 || parent.kind === 'marca') ? (row.sku_uom || '') : (parent.uom || '')) : '';
    return `${row.uom || ''}${row.contains ? ` con ${row.contains}${unit ? ` ${unit}` : ''}` : ''}`.trim();
};
// Los renglones de UN código en el orden del árbol (cada presentación antes de las que salen de ella; hermanas en el orden en que se capturaron) con lo que se calcula por el camino: «equivale a» (cuántas unidades
// principales trae: lo que contiene × lo que equivale la que la contiene), el nombre, el camino desde el principal y lo que hace falta para dibujar el árbol en una columna (lines: por cada nivel de arriba, ¿sigue su
// línea vertical?; last: ¿es la última hermana?).
function skuDistTree(rows) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const kids = new Map();
    rows.forEach((r) => { if (r.parent_id && byId.has(r.parent_id)) { if (!kids.has(r.parent_id)) kids.set(r.parent_id, []); kids.get(r.parent_id).push(r); } });
    kids.forEach((list) => list.sort((a, z) => a.id - z.id));
    const out = [];
    const nameOf = new Map();
    const seen = new Set();
    // plevel = la profundidad entre las PRESENTACIONES (0 el principal y las marcas, 1 las que salen de ellos…): con ella se rotula «Empaque primario»; la marca no cuenta como nivel.
    // brand = la marca de la rama ({ id, classification, name, brandId }) o null si la presentación no es de una marca.
    const walk = (row, parent, parentEq, parentPath, lines, last, parentPlevel, parentBrand) => {
        if (seen.has(row.id)) return;
        seen.add(row.id);
        const isBrand = row.kind === 'marca';
        const equivalent = row.level === 0 || isBrand ? (row.level === 0 ? 1 : parentEq) : parentEq * Math.max(1, Number(row.contains) || 1);
        const name = skuDistName(row, parent);
        nameOf.set(row.id, name);
        const plevel = row.level === 0 || isBrand ? 0 : parentPlevel + 1;
        const brand = isBrand ? { id: row.id, classification: row.classification || '', name: row.brand_name || '', brandId: row.brand_id || null } : parentBrand;
        const path = [...parentPath, name || PACK_ORDINALS[plevel] || ''];
        const list = kids.get(row.id) || [];
        out.push({ row, parent, parentName: parent ? (nameOf.get(parent.id) || '') : '', equivalent, name, path, lines, last, childCount: list.length, plevel, brand, isBrand });
        const childLines = row.level === 0 ? [] : [...lines, !last];
        list.forEach((child, i) => walk(child, row, equivalent, path, childLines, i === list.length - 1, plevel, brand));
    };
    rows.filter((r) => !r.parent_id || !byId.has(r.parent_id)).sort((a, z) => a.level - z.level || a.id - z.id).forEach((r) => walk(r, null, 1, [], [], true, 0, null));
    return out;
}
// Lo que lee PackCalc.levelsOf: { main, levels } con una entrada por presentación (en el orden del árbol); cada una trae su id (con él se elige «Se acomoda»), su profundidad y las piezas (unidades principales) que equivale.
function packagingFromDistribution(rows) {
    if (!rows || !rows.length) return null;
    const first = rows[0];
    const nodes = skuDistTree(rows);
    const r0 = (nodes.find((n) => n.row.level === 0) || {}).row;
    const main = { shape: r0 && r0.shape === 'cilindrica' ? 'cilindrica' : 'rectangular', lay: !!(r0 && r0.can_lay), types: skuDistTypesOf(r0), name: first.sku_uom || '', weightG: Math.round((Number(first.sku_weight) || 0) * 1000 * 10000) / 10000 };
    const levels = nodes.filter((n) => n.row.level >= 1 && !n.isBrand).map(({ row: r, name, equivalent, plevel, brand }) => ({
        id: r.id, parentId: r.parent_id || null, depth: plevel, brand: brand ? brand.name : '', classification: brand ? brand.classification : '', name, shape: r.shape === 'cilindrica' ? 'cilindrica' : 'rectangular', l: r.length, w: r.shape === 'cilindrica' ? r.length : r.width, h: r.height, pieces: equivalent,
        lay: !!r.can_lay, weightG: r.weight_g, uom: r.uom || '', contains: r.contains, types: skuDistTypesOf(r),
    }));
    return { main, levels };
}
// Todos los códigos del cliente con sus presentaciones: Map(id del código -> packagingFromDistribution).
function packagingMapFor(clientId, isTestAccount) {
    const bySku = new Map();
    listSkuDistribution(clientId, isTestAccount).forEach((r) => { if (!bySku.has(r.sku_item_id)) bySku.set(r.sku_item_id, []); bySku.get(r.sku_item_id).push(r); });
    return new Map([...bySku.entries()].map(([id, list]) => [id, packagingFromDistribution(list)]));
}

function mapSkuItemRecord(row, pendingByRecord, companyName) {
    if (!row) return row;
    return {
        id: row.id,
        registroUnico: row.db_id,
        sku: padSku(row.record_number, row.sku_code),
        clientCode: row.client_code || '',
        status: row.status === 'inactive' ? 'inactive' : 'active',
        upc: row.upc,
        uniqueDescription: row.unique_description,
        knownDescription: row.known_description,
        customDescription: row.custom_description,
        mainUom: row.main_uom,
        articleType: row.article_type,
        height: row.height,
        length: row.length,
        width: row.width,
        articleWeight: row.article_weight,
        packageWeight: row.package_weight,
        storageType: row.storage_type,
        unitsPerLayer: row.units_per_layer,
        layersPerPallet: row.layers_per_pallet,
        maxStack: row.max_stack,
        evidenceFront: row.evidence_front,
        evidenceBack: row.evidence_back,
        evidenceLeft: row.evidence_left,
        evidenceRight: row.evidence_right,
        evidenceTop: row.evidence_top,
        evidenceBottom: row.evidence_bottom,
        categoryInventario: row.category_inventario,
        categoryCompra: row.category_compra,
        categoryAlmacenamiento: row.category_almacenamiento,
        categoryRotacion: row.category_rotacion,
        categoryManejo: row.category_manejo,
        categoryRiesgo: row.category_riesgo,
        categoryVidautil: row.category_vidautil,
        categoryTipoCodigo: row.category_tipocodigo,
        classificationId: row.classification_id == null ? null : row.classification_id,
        classificationName: classificationNameOf(row.client_id, !!row.is_test_data, row.classification_id),
        publicToken: row.public_token,
        // ¿Ya tiene sus 24 datos? Si sí, ya no se ve en Alta Nuestros Artículos y pasa a Catálogos > Códigos (solo lectura). editing = lo mandaron a Operaciones > Edición Código.
        complete: isSkuItemComplete(row),
        editing: !!row.editing,
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({
            companyName,
            area: SKU_ITEM_AREA_LABEL,
            modulo: SKU_ITEM_MODULE_LABEL,
            pantalla: SKU_ITEM_SCREEN_LABEL,
            centroCostos: '',
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/sku-items', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'nuestros-articulos');
    const client = getClientById(req.user.clientId);
    // scope=pending: los que aún les falta algún dato (Alta Nuestros Artículos); scope=complete: los que ya tienen los 24 (Catálogos > Códigos, solo lectura); scope=editing: los que
    // se mandaron a corregir (Operaciones > Edición Código). Sin scope salen todos (la App, por ahora).
    const scope = ['pending', 'complete', 'editing'].includes(req.query.scope) ? req.query.scope : 'all';
    const inScope = (r) => {
        if (scope === 'all') return true;
        if (scope === 'editing') return !!r.editing;
        return !r.editing && isSkuItemComplete(r) === (scope === 'complete');
    };
    const rows = listSkuItems(req.user.clientId, req.user.isTestAccount).filter(inScope);
    classificationNameMemo = new Map();
    try {
        res.json({ skuItems: rows.map((r) => mapSkuItemRecord(r, pendingByRecord, client?.company_name)) });
    } finally {
        classificationNameMemo = null;
    }
});

app.post('/api/business/sku-items', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!req.user.isClientAdmin && !canCreateColumn(getUserEffectiveGrants(req.user.sub), 'nuestros-articulos', 'colArticuloCreateAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para crear registros aquí.' });
    }
    const skuItem = createSkuItem({ clientId: req.user.clientId, isTestData: req.user.isTestAccount });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'nuestros-articulos', recordId: skuItem.id,
        recordLabel: `#${skuItem.id}`, action: 'create', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'nuestros-articulos', 'create', `#${skuItem.id}`);
    const client = getClientById(req.user.clientId);
    res.status(201).json({ skuItem: mapSkuItemRecord(skuItem, null, client?.company_name) });
});

// Código QR / Ficha pública -- issued the instant an artículo's own 24
// fields (SKU_ITEM_PATCHABLE_FIELDS' full set: 11 own + 6 evidence + 7
// categoría) are ALL filled, never by an explicit "generate" action. Number
// fields treat 0 as unfilled, matching the App's own isFieldFilled -- an
// artículo can't be "complete" with a 0cm dimension it never actually got.
function isSkuFieldFilled(value) {
    return value !== null && value !== undefined && value !== '' && value !== 0;
}
function isSkuItemComplete(row) {
    // los campos opcionales (la Clasificación) no cuentan: un código sin clasificación sigue pudiendo quedar completo
    return Object.values(SKU_ITEM_PATCHABLE_FIELDS).filter((f) => !f.optional).every(({ column }) => isSkuFieldFilled(row[column]));
}
function maybeIssueSkuPublicToken(skuItem, clientId, forTestAccount) {
    if (!skuItem || skuItem.public_token || !isSkuItemComplete(skuItem)) return skuItem;
    setSkuItemPublicToken(skuItem.id, clientId, generatePublicToken());
    return getSkuItemById(skuItem.id, clientId, forTestAccount);
}

// Los UPC que ya existen (con su SKU) para que la ventana de carga por plantilla marque los repetidos antes de cargar.
app.get('/api/business/sku-items/upcs', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.set('Cache-Control', 'no-store');
    res.json({ upcs: listSkuItemUpcs(req.user.clientId, req.user.isTestAccount).map((r) => [r.upc, padSku(r.record_number, r.sku_code)]) });
});

// Carga por plantilla: da de alta muchos artículos a la vez, y con "update" también actualiza los que ya existen (Excel o filas pegadas, ya revisadas en pantalla). El servidor vuelve a revisar CADA fila con
// la misma regla (SkuTemplate.planRow, public/SkuTemplate.js): las buenas se cargan y las malas regresan con su motivo, nada se carga a medias dentro de una fila. Lleva los 11 datos del artículo, sus 7
// categorías y la clasificación; las 6 fotos se toman con el producto en la mano, así que el artículo queda sin código QR hasta tenerlas. Un código ya completo no se toca (se corrige en Edición Código).
// Sin "columns" se cargan todas las columnas que traiga la fila; con ella, solo las elegidas (el SKU y el UPC siempre son llaves). Una celda vacía nunca borra lo que el código ya tiene.
const SkuTemplate = require('./public/SkuTemplate.js');
const SearchSyntax = require('./public/SearchSyntax.js');
// La Descripción Única de un código nunca se repite entre los códigos de la empresa (sin importar mayúsculas, acentos ni espacios de más). Devuelve el SKU (con ceros) que ya la tiene, o null. Vacía no cuenta.
function skuUniqueDescriptionOwner(clientId, isTest, text, exceptId = 0) {
    const key = SkuTemplate.descKey(text);
    if (!key) return null;
    const hit = listSkuUniqueDescriptions(clientId, isTest).find((r) => r.id !== exceptId && SkuTemplate.descKey(r.unique_description) === key);
    return hit ? padSku(hit.record_number, hit.sku_code) : null;
}
app.get('/api/business/sku-items/description-taken', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.set('Cache-Control', 'no-store');
    res.json({ sku: skuUniqueDescriptionOwner(req.user.clientId, req.user.isTestAccount, String(req.query.text || ''), Number(req.query.except) || 0) });
});
// Un código para la carga por plantilla: { id, sku, upc, complete, v: { campo: valor actual } } (solo los datos que ya tiene; la clasificación va con su nombre).
function skuTemplateItem(row, classificationNames) {
    const v = {};
    SkuTemplate.ALL_COLUMNS.filter((c) => c.kind !== 'sku' && c.kind !== 'classification').forEach((c) => {
        const value = row[SKU_ITEM_PATCHABLE_FIELDS[c.key].column];
        if (isSkuFieldFilled(value)) v[c.key] = value;
    });
    if (row.classification_id != null && classificationNames.has(row.classification_id)) v.classificationId = classificationNames.get(row.classification_id);
    return { id: row.id, sku: padSku(row.record_number, row.sku_code), num: row.record_number, upc: row.upc, complete: isSkuItemComplete(row), v };
}
// Las clasificaciones que se pueden poner: todas las activas del catálogo y, de cada categoría Inventario, las suyas.
function skuTemplateClassifications(clientId, isTest) {
    const all = listArticleCategories(clientId, 'clasificaciones', isTest);
    const byId = new Map(all.map((r) => [r.id, r]));
    const byCategory = {};
    listArticleCategories(clientId, 'inventario', isTest).forEach((cat) => {
        byCategory[cat.name] = parseClassificationIds(cat.classification_ids).map((id) => byId.get(id)).filter((r) => r && r.status === 'active').map((r) => r.name);
    });
    return { all: all.filter((r) => r.status === 'active').map((r) => r.name), byCategory, names: new Map(all.map((r) => [r.id, r.name])) };
}
// Lo que necesita la ventana para revisar cada fila sin preguntar al servidor: los códigos que ya existen (con sus datos actuales) y las clasificaciones.
app.get('/api/business/sku-items/template-context', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const cls = skuTemplateClassifications(clientId, isTestAccount);
    res.set('Cache-Control', 'no-store');
    res.json({
        items: listSkuItems(clientId, isTestAccount).map((r) => skuTemplateItem(r, cls.names)),
        classifications: { all: cls.all, byCategory: cls.byCategory },
    });
});
app.post('/api/business/sku-items/import', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const grants = req.user.isClientAdmin ? null : getUserEffectiveGrants(req.user.sub);
    if (grants && !canCreateColumn(grants, 'nuestros-articulos', 'colArticuloTemplateAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para cargar artículos por plantilla.' });
    }
    const input = req.body && req.body.rows;
    if (!Array.isArray(input) || !input.length) return res.status(400).json({ message: 'No hay filas para cargar.' });
    if (input.length > SkuTemplate.MAX_ROWS) return res.status(400).json({ message: `El máximo es ${SkuTemplate.MAX_ROWS} filas por petición. Manda el archivo en tandas más chicas.` });
    const rows = input.map((r, i) => ({ n: Number.isInteger(r && r.n) ? r.n : i + 2, v: r && typeof r.v === 'object' && r.v ? r.v : {} }));
    const allowUpdate = !!(req.body && req.body.update === true);
    const selected = Array.isArray(req.body && req.body.columns) ? new Set(req.body.columns.filter((k) => SkuTemplate.BY_KEY_ALL[k])) : null;
    const cls = skuTemplateClassifications(clientId, isTestAccount);
    const items = listSkuItems(clientId, isTestAccount).map((r) => skuTemplateItem(r, cls.names));
    const bySku = new Map(items.flatMap((i) => [[i.num, i], [i.sku, i]])); // por el número (6 dígitos) o por el SKU completo
    const byUpc = new Map(items.filter((i) => i.upc).map((i) => [i.upc, i]));
    const byDesc = new Map(items.filter((i) => i.v.uniqueDescription).map((i) => [SkuTemplate.descKey(i.v.uniqueDescription), i]));
    const accepted = new Map();
    const categories = {};
    SkuTemplate.ALL_COLUMNS.filter((c) => c.kind === 'category').forEach((c) => { categories[c.type] = listActiveArticleCategoryNames(clientId, c.type, isTestAccount); });
    const ctx = {
        allowUpdate, selected, udm: listActiveArticleCategoryNames(clientId, 'udm', isTestAccount), categories, classifications: { all: cls.all, byCategory: cls.byCategory },
        itemBySku: (n) => bySku.get(n) || null, itemByUpc: (upc) => byUpc.get(upc) || null, itemByDescription: (k) => byDesc.get(k) || null,
        priorRowWithKey: (key, row) => { const n = accepted.get(key); return n && n !== row.n ? n : 0; },
    };
    // Cada dato que se escribe necesita su propia hoja, igual que en la tabla: llenar uno vacío pide Ver y Operar (o Modificar); cambiar uno que ya tenía pide Modificar y, como en la tabla, queda
    // como cambio por autorizar (lo aplica directo el administrador del cliente).
    const needLevel = (key) => (grants ? getColumnGrantLevel(grants, 'nuestros-articulos', SkuTemplate.BY_KEY_ALL[key].col) : 'editar');
    const labelOf = (key) => SkuTemplate.BY_KEY_ALL[key].es;
    const permissionError = (plan) => {
        if (!grants) return null;
        const writes = plan.action === 'create' ? Object.keys(plan.patch).map((key) => ({ key, kind: 'fill' })) : plan.changes;
        for (const w of writes) {
            const level = needLevel(w.key);
            const can = w.kind === 'change' ? level === 'editar' : (level === 'ver-y-operar' || level === 'editar');
            if (!can) return { field: w.key, code: 'noPermission', params: { label: labelOf(w.key), change: w.kind === 'change' }, message: w.kind === 'change' ? `No tienes permiso para cambiar «${labelOf(w.key)}» porque ese código ya tenía dato.` : `No tienes permiso para llenar «${labelOf(w.key)}».` };
        }
        return null;
    };
    const created = [];
    const updated = [];
    const unchanged = [];
    const completeSkipped = [];
    const failed = [];
    const accept = (plan, n) => { accepted.set(plan.key, n); if (plan.upcKey) accepted.set(plan.upcKey, n); if (plan.descKey) accepted.set(plan.descKey, n); };
    const changedBy = changedByLabel(req);
    const classIdOf = (name, category) => { const found = inventoryClassificationsFor(clientId, isTestAccount, category).find((r) => r.name === name); return found ? found.id : null; };
    const className = (id) => classificationNameOf(clientId, isTestAccount, id);
    rows.forEach((row, index) => {
        const plan = SkuTemplate.planRow(row, ctx);
        if (plan.error) { failed.push({ index, n: row.n, field: plan.error.field, code: plan.error.code, params: plan.error.params, message: SkuTemplate.message(plan.error) }); return; }
        if (plan.action === 'complete') { accept(plan, row.n); completeSkipped.push({ index, n: row.n, sku: plan.item.sku }); return; }
        if (plan.action === 'same') { accept(plan, row.n); unchanged.push({ index, n: row.n, sku: plan.item.sku }); return; }
        const denied = permissionError(plan);
        if (denied) { failed.push({ index, n: row.n, field: denied.field, code: denied.code, params: denied.params, message: denied.message }); return; }
        try {
            if (plan.action === 'create') {
                const patch = { ...plan.patch };
                if (patch.classificationId !== undefined) patch.classificationId = classIdOf(patch.classificationId, patch.categoryInventario);
                const prepared = prepareSkuClassificationPatch(req, { category_inventario: '', classification_id: null }, patch);
                if (prepared.error) { failed.push({ index, n: row.n, field: 'classificationId', code: 'serverError', params: {}, message: prepared.error.message }); return; }
                // con la carga por plantilla el SKU es el que trae la fila (el número de código del cliente); sin «update» (la App) el sistema asigna el siguiente
                let item = createSkuItem({ clientId, isTestData: isTestAccount, recordNumber: 0 }); // el SKU lo asigna el sistema (siguiente consecutivo)
                item = updateSkuItem(item.id, clientId, prepared.patch, isTestAccount);
                logTableChange({ clientId, tableKey: 'nuestros-articulos', recordId: item.id, recordLabel: `#${item.id}`, action: 'create', changedBy });
                Object.entries(prepared.patch).forEach(([key, value]) => logTableChange({
                    clientId, tableKey: 'nuestros-articulos', recordId: item.id, recordLabel: `#${item.id}`, action: 'update',
                    fieldKey: SKU_ITEM_PATCHABLE_FIELDS[key].fieldKey, oldValue: '', newValue: key === 'classificationId' ? className(value) : String(value), changedBy,
                }));
                logTableChange({ clientId, tableKey: 'nuestros-articulos', recordId: item.id, recordLabel: `#${item.id}`, action: 'update', fieldKey: 'main.articuloOrigenAlta', oldValue: '', newValue: 'Carga por plantilla', changedBy });
                accept(plan, row.n);
                const made = { id: item.id, sku: padSku(item.record_number, item.sku_code), num: item.record_number, upc: plan.patch.upc || '', complete: false, v: {} };
                bySku.set(item.record_number, made);
                bySku.set(made.sku, made);
                if (plan.patch.upc) byUpc.set(plan.patch.upc, made);
                if (plan.descKey) byDesc.set(plan.descKey.slice(5), made);
                created.push({ index, n: row.n, id: item.id, sku: made.sku });
                return;
            }
            // update: lo mismo que cambiar las celdas a mano en la tabla (permisos por columna, historial, avisos, clasificación que ya no le toca, QR de la ficha)
            const existing = getSkuItemById(plan.item.id, clientId, isTestAccount);
            if (!existing) { failed.push({ index, n: row.n, field: 'sku', code: 'skuUnknown', params: { sku: plan.item.sku }, message: SkuTemplate.message({ code: 'skuUnknown', params: { sku: plan.item.sku } }) }); return; }
            const patch = { ...plan.patch };
            if (patch.classificationId !== undefined) patch.classificationId = classIdOf(patch.classificationId, patch.categoryInventario || existing.category_inventario);
            const prepared = prepareSkuClassificationPatch(req, existing, patch);
            if (prepared.error) { failed.push({ index, n: row.n, field: 'classificationId', code: 'serverError', params: {}, message: prepared.error.message }); return; }
            const sanitizers = { classificationId: (v) => classificationNameOf(clientId, isTestAccount, v) };
            const result = checkAndLogFieldChanges(req, existing, prepared.patch, SKU_ITEM_PATCHABLE_FIELDS, 'nuestros-articulos', `#${existing.id}`, sanitizers);
            let item = updateSkuItem(existing.id, clientId, result.appliedPatch, isTestAccount);
            if (item.classification_id != null && !inventoryClassificationsFor(clientId, isTestAccount, item.category_inventario).some((r) => r.id === item.classification_id)) {
                const oldName = className(item.classification_id);
                item = updateSkuItem(existing.id, clientId, { classificationId: null }, isTestAccount);
                logTableChange({ clientId, tableKey: 'nuestros-articulos', recordId: item.id, recordLabel: `#${item.id}`, action: 'update', fieldKey: 'main.colArticuloClasificacion', oldValue: oldName, newValue: '', changedBy });
            }
            maybeIssueSkuPublicToken(item, clientId, isTestAccount);
            logTableChange({ clientId, tableKey: 'nuestros-articulos', recordId: existing.id, recordLabel: `#${existing.id}`, action: 'update', fieldKey: 'main.articuloOrigenAlta', oldValue: '', newValue: 'Actualización por plantilla', changedBy });
            if (Object.prototype.hasOwnProperty.call(result.appliedPatch, 'uniqueDescription')) {
                if (plan.item.v.uniqueDescription) byDesc.delete(SkuTemplate.descKey(plan.item.v.uniqueDescription));
                if (result.appliedPatch.uniqueDescription) byDesc.set(SkuTemplate.descKey(result.appliedPatch.uniqueDescription), { id: existing.id, sku: plan.item.sku });
            }
            accept(plan, row.n);
            updated.push({ index, n: row.n, id: existing.id, sku: plan.item.sku, applied: Object.keys(result.appliedPatch).length, pending: result.pendingFields.length, rejected: result.rejectedFields.length });
        } catch (error) {
            if (error && error.code === 'SKU_EXISTS') { failed.push({ index, n: row.n, field: 'sku', code: 'skuExists', params: { sku: String(plan.sku).padStart(6, '0') }, message: SkuTemplate.message({ code: 'skuExists', params: { sku: String(plan.sku).padStart(6, '0') } }) }); return; }
            console.error('Carga por plantilla: no se pudo guardar una fila', error);
            failed.push({ index, n: row.n, field: '', code: 'serverError', params: {}, message: 'No se pudo guardar esta fila. Inténtalo de nuevo.' });
        }
    });
    if (created.length || updated.length) notifyButtonAction(req, 'nuestros-articulos', 'import', `${created.length} nuevos${created.length ? ` (${created[0].sku} – ${created[created.length - 1].sku})` : ''}, ${updated.length} actualizados`);
    res.json({ created, updated, unchanged, complete: completeSkipped, failed });
});

// Editar un código ya completo: pasa de Catálogos > Códigos (solo lectura) a Operaciones > Edición Código, donde se corrige con las mismas reglas de siempre (permisos por columna,
// historial). Al terminar la edición (con los 24 datos llenos) regresa a Códigos. Se pide la hoja de la pantalla Edición Código del árbol; el administrador del cliente no depende de hojas.
const EDICION_CODIGO_SCREEN = { sectionId: 'supply-chain', itemId: 'sc-area-distribution-center', submenuId: 'cat-operaciones/cat-operaciones-centro-dist-edicion-codigo' };
function canUseEdicionCodigo(req) {
    return !!req.user.isClientAdmin || isTupleGranted(getUserEffectiveGrants(req.user.sub), EDICION_CODIGO_SCREEN.sectionId, EDICION_CODIGO_SCREEN.itemId, EDICION_CODIGO_SCREEN.submenuId);
}
function logSkuScreenMove(req, skuItem, from, to) {
    logTableChange({
        clientId: req.user.clientId, tableKey: 'nuestros-articulos', recordId: skuItem.id, recordLabel: `#${skuItem.id}`, action: 'update',
        fieldKey: 'main.skuUbicacionPantalla', oldValue: from, newValue: to, changedBy: changedByLabel(req),
    });
}
app.post('/api/business/sku-items/:id/edit', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!canUseEdicionCodigo(req)) return res.status(403).json({ message: 'No tienes permiso para mandar códigos a Edición Código.' });
    const existing = getSkuItemById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Sku item not found.' });
    if (existing.editing) return res.status(409).json({ message: 'Este código ya está en Edición Código.' });
    if (!isSkuItemComplete(existing)) return res.status(409).json({ message: 'Este código todavía no está completo: se termina de llenar en Alta Nuestros Artículos.' });
    const skuItem = setSkuItemEditing(existing.id, req.user.clientId, true, req.user.isTestAccount);
    logSkuScreenMove(req, skuItem, 'Códigos', 'Edición Código');
    const client = getClientById(req.user.clientId);
    res.json({ skuItem: mapSkuItemRecord(skuItem, null, client?.company_name) });
});
app.post('/api/business/sku-items/:id/finish-edit', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!canUseEdicionCodigo(req)) return res.status(403).json({ message: 'No tienes permiso para terminar la edición de códigos.' });
    const existing = getSkuItemById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Sku item not found.' });
    if (!existing.editing) return res.status(409).json({ message: 'Este código no está en Edición Código.' });
    if (!isSkuItemComplete(existing)) return res.status(409).json({ message: 'Al código le faltan datos: llénalos para terminar la edición.', code: 'incomplete' });
    const skuItem = setSkuItemEditing(existing.id, req.user.clientId, false, req.user.isTestAccount);
    logSkuScreenMove(req, skuItem, 'Edición Código', 'Códigos');
    const client = getClientById(req.user.clientId);
    res.json({ skuItem: mapSkuItemRecord(skuItem, null, client?.company_name) });
});

// Estiba y tipo de almacenamiento del código: enteros de 0 a 100000 (0 = sin capturar) y una de las 5 claves de la lista ('' = sin elegir).
const SKU_STORAGE_TYPES = ['original', 'almacenamiento', 'compra', 'empaque', 'pallet'];
function validateSkuStackingPatch(patch) {
    for (const [key, label] of [['unitsPerLayer', 'Cantidad por cama (TI)'], ['layersPerPallet', 'Camas por pallet (HI)'], ['maxStack', 'Máxima estiba']]) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
        if (!Number.isInteger(patch[key]) || patch[key] < 0 || patch[key] > 100000) return `${label}: escribe un número entero, sin decimales, de 0 a 100000.`;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'storageType') && patch.storageType !== '' && !SKU_STORAGE_TYPES.includes(patch.storageType)) return 'Tipo de almacenamiento: elige una opción de la lista.';
    return '';
}

app.patch('/api/business/sku-items/:id', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getSkuItemById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Sku item not found.' });
    const { baseline, overrideConflicts, ...rawPatch } = req.body || {};
    const stackingError = validateSkuStackingPatch(rawPatch);
    if (stackingError) return res.status(400).json({ message: stackingError });
    // La Descripción Única nunca se repite: se rechaza antes de guardar nada (el código del mensaje lo traduce la pantalla).
    if (Object.prototype.hasOwnProperty.call(rawPatch, 'uniqueDescription')) {
        const owner = skuUniqueDescriptionOwner(req.user.clientId, req.user.isTestAccount, rawPatch.uniqueDescription, existing.id);
        if (owner) return res.status(400).json({ message: `Esa Descripción Única ya la tiene el código ${owner}. No se puede repetir.`, code: 'DESC_UNIQUE', sku: owner });
    }
    const prepared = prepareSkuClassificationPatch(req, existing, rawPatch);
    if (prepared.error) return res.status(prepared.error.status).json({ message: prepared.error.message });
    const { clientId: skuClientId, isTestAccount: skuIsTest } = req.user;
    const sanitizers = { classificationId: (v) => classificationNameOf(skuClientId, skuIsTest, v) };
    const { appliedPatch, pendingFields, rejectedFields, conflictFields } = checkAndLogFieldChanges(req, existing, prepared.patch, SKU_ITEM_PATCHABLE_FIELDS, 'nuestros-articulos', `#${existing.id}`, sanitizers, { baseline, overrideConflicts });
    let skuItem = updateSkuItem(req.params.id, req.user.clientId, appliedPatch, req.user.isTestAccount);
    // Si cambió la Categoría Inventario y la clasificación que tenía ya no es de esa categoría, se quita sola (y queda en el historial).
    if (skuItem.classification_id != null && !inventoryClassificationsFor(skuClientId, skuIsTest, skuItem.category_inventario).some((r) => r.id === skuItem.classification_id)) {
        const oldName = classificationNameOf(skuClientId, skuIsTest, skuItem.classification_id);
        skuItem = updateSkuItem(req.params.id, req.user.clientId, { classificationId: null }, req.user.isTestAccount);
        logTableChange({
            clientId: skuClientId, tableKey: 'nuestros-articulos', recordId: skuItem.id, recordLabel: `#${skuItem.id}`, action: 'update',
            fieldKey: 'main.colArticuloClasificacion', oldValue: oldName, newValue: '', changedBy: changedByLabel(req),
        });
    }
    skuItem = maybeIssueSkuPublicToken(skuItem, req.user.clientId, req.user.isTestAccount);
    const client = getClientById(req.user.clientId);
    res.json({ skuItem: mapSkuItemRecord(skuItem, null, client?.company_name), pendingFields, rejectedFields, conflictFields });
});

// Los códigos NUNCA se eliminan: se DESACTIVAN (y se vuelven a activar). Un código es la rama de conexión de todo (relaciones, ubicaciones, presentaciones, QR, pedidos): si se borrara, se borrarían los registros que cuelgan de él.
// Uno inactivo se queda con todo lo suyo y su Descripción Única sigue reservada, pero deja de ofrecerse para relaciones, pedidos y selectores nuevos. Pide la hoja «Autorización para Desactivar» (colArticuloDeleteAuth) de la pantalla;
// el administrador del cliente no depende de hojas. Cada cambio queda en el historial del código.
const SKU_STATUS_MAX = 500;
const SKU_STATUS_LABELS = { active: 'Activo', inactive: 'Inactivo' };
const canChangeSkuStatus = (req) => !!req.user.isClientAdmin || canDeleteColumn(getUserEffectiveGrants(req.user.sub), 'nuestros-articulos', 'colArticuloDeleteAuth');
const skuStatusOf = (v) => (v === 'inactive' ? 'inactive' : (v === 'active' ? 'active' : ''));
// Cambia el estatus de UN código y lo deja en el historial; false si ya estaba así. El aviso lo manda quien llama (uno por cambio o uno solo por todo un lote).
function applySkuStatus(req, existing, status) {
    const before = existing.status === 'inactive' ? 'inactive' : 'active';
    if (before === status) return false;
    const { clientId, isTestAccount } = req.user;
    setSkuItemStatus(existing.id, clientId, status, isTestAccount);
    logTableChange({ clientId, tableKey: 'nuestros-articulos', recordId: existing.id, recordLabel: `#${existing.id}`, action: 'update', fieldKey: 'main.colArticuloEstatus', oldValue: SKU_STATUS_LABELS[before], newValue: SKU_STATUS_LABELS[status], changedBy: changedByLabel(req) });
    return true;
}
app.post('/api/business/sku-items/:id/status', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!canChangeSkuStatus(req)) return res.status(403).json({ message: 'No tienes permiso para desactivar códigos.' });
    const status = skuStatusOf(req.body && req.body.status);
    if (!status) return res.status(400).json({ message: 'El estatus es Activo o Inactivo.', code: 'STATUS' });
    const existing = getSkuItemById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Sku item not found.' });
    const changed = applySkuStatus(req, existing, status);
    if (changed) {
        notifyDataChange({ clientId: req.user.clientId, tableKey: 'nuestros-articulos', recordLabel: `#${existing.id}`, fieldKey: 'main.colArticuloEstatus', oldValue: SKU_STATUS_LABELS[status === 'inactive' ? 'active' : 'inactive'], newValue: SKU_STATUS_LABELS[status], actorUserId: req.user.sub, actorLabel: changedByLabel(req) });
    }
    const client = getClientById(req.user.clientId);
    res.set('Cache-Control', 'no-store');
    res.json({ skuItem: mapSkuItemRecord(getSkuItemById(existing.id, req.user.clientId, req.user.isTestAccount), null, client?.company_name), changed });
});
// Varios a la vez (Alta: «Seleccionar» lo filtrado y «Desactivar seleccionados»): las mismas reglas; devuelve los ids que sí cambiaron (los que ya estaban así no cuentan) y manda UN solo aviso. Hasta 500 por petición.
app.post('/api/business/sku-items/bulk-status', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!canChangeSkuStatus(req)) return res.status(403).json({ message: 'No tienes permiso para desactivar códigos.' });
    const status = skuStatusOf(req.body && req.body.status);
    if (!status) return res.status(400).json({ message: 'El estatus es Activo o Inactivo.', code: 'STATUS' });
    const raw = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
    const ids = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (!ids.length) return res.status(400).json({ message: 'No hay códigos que cambiar.', code: 'EMPTY' });
    if (ids.length > SKU_STATUS_MAX) return res.status(400).json({ message: `Hasta ${SKU_STATUS_MAX} códigos por vez.`, code: 'TOOMANY' });
    const { clientId, isTestAccount } = req.user;
    const changed = [];
    ids.forEach((id) => {
        const existing = getSkuItemById(id, clientId, isTestAccount);
        if (existing && applySkuStatus(req, existing, status)) changed.push(existing.id);
    });
    if (changed.length) {
        notifyDataChange({ clientId, tableKey: 'nuestros-articulos', recordLabel: `${changed.length} códigos`, fieldKey: 'main.colArticuloEstatus', oldValue: SKU_STATUS_LABELS[status === 'inactive' ? 'active' : 'inactive'], newValue: SKU_STATUS_LABELS[status], actorUserId: req.user.sub, actorLabel: changedByLabel(req) });
    }
    res.set('Cache-Control', 'no-store');
    res.json({ changed });
});

// --- Ficha pública (no login) -----------------------------------------------
// What a "Código QR" scan opens (see Ficha.html/.js) -- deliberately NOT
// behind requireAuth, and deliberately the ONLY route that looks a sku_item
// up by anything other than id+client_id: getSkuItemByPublicToken never
// takes a clientId, by design, since the visitor has no session to scope
// one from. Only customer-facing fields are returned -- no Control Interno,
// no Categorías Artículo (internal classification, not a selling point).
app.get('/api/public/ficha/:token', (req, res) => {
    const skuItem = getSkuItemByPublicToken(req.params.token);
    if (!skuItem) return res.status(404).json({ message: 'Ficha not found.' });
    const client = getClientById(skuItem.client_id);
    const locks = qrLocksOf('ficha', skuItem.client_id, 0);
    const photoFields = [
        ['front', skuItem.evidence_front], ['back', skuItem.evidence_back],
        ['left', skuItem.evidence_left], ['right', skuItem.evidence_right],
        ['top', skuItem.evidence_top], ['bottom', skuItem.evidence_bottom],
    ].filter(([, key]) => key && locks.photos);
    Promise.all(photoFields.map(([label, key]) => getDownloadUrl(key, `${label}.jpg`).then((url) => ({ label, url }))))
        .then((photos) => {
            res.json({
                companyName: client?.company_name || '', ...publicBrand(skuItem.client_id),
                uniqueDescription: skuItem.unique_description,
                knownDescription: skuItem.known_description,
                customDescription: skuItem.custom_description,
                mainUom: skuItem.main_uom,
                articleType: skuItem.article_type,
                ...(locks.measures ? { height: skuItem.height, length: skuItem.length, width: skuItem.width, articleWeight: skuItem.article_weight, packageWeight: skuItem.package_weight } : {}),
                // Dónde está (de Relación Código): un renglón por lugar, con la ruta completa; la ubicación exacta (anaquel, nivel y espacio) solo si ya se sabe.
                locations: !locks.where ? [] : (() => {
                    const ctx = codeRelationContextFor(skuItem.client_id, !!skuItem.is_test_data);
                    return listCodeRelations(skuItem.client_id, !!skuItem.is_test_data).filter((r) => r.sku_item_id === skuItem.id).map((r) => mapCodeRelation(r, null, '', ctx)).map((loc) => ({
                        route: [loc.centroCostos, loc.warehouseName, loc.subWarehouseName, loc.zoneName, loc.footprintCode, loc.spaceCode, loc.level ? `Nivel ${loc.level}` : '', loc.slot ? `Espacio ${loc.slot}` : '', loc.position && loc.positionCount > 1 ? `Posición ${loc.position}` : ''].filter(Boolean),
                        locator: loc.locator, virtual: loc.subKind === 'virtual', located: loc.status === 'located',
                    }));
                })(),
                photos, locks,
            });
        })
        .catch((err) => {
            console.error('Ficha pública: failed to build photo URLs', err);
            res.status(500).json({ message: 'Failed to load ficha.' });
        });
});

// --- Layout de la nave (Operaciones > C. Distribución) ------------------------
// UN Layout por cliente. Los permisos salen de las columnas de la pantalla en el árbol (menu.json, colLayout*): cada sección se puede VER con el acceso a la
// pantalla; llenarla por primera vez pide "Ver y Operar" o "Modificar" en su columna, y cambiar lo que ya tiene pide "Modificar" (igual que cualquier
// columna, ver canEditField en Dashboard.js). Crear el Layout pide además el botón Crear desde cero o Cargar plano.
const LayoutCalc = require('./public/LayoutCalc.js');
// El Localizador completo de 7 piezas de cada relación se arma con las mismas reglas que lee la plantilla (public/RelTemplate.js).
const RelTemplate = require('./public/RelTemplate.js');
const QRCode = require('qrcode');
const LAYOUT_TABLE_KEY = 'layout';
const LAYOUT_SECTION_LABELS = { contorno: 'Contorno de la nave', paredes: 'Paredes', obstaculos: 'Obstáculos', puertas: 'Puertas', luz: 'Energía Eléctrica', sensores: 'Sensores', seguridad: 'Seguridad', techos: 'Techos', transito: 'Tránsito', objetos: 'Objetos', zonas: 'Zonas', pisos: 'Pisos', rampas: 'Rampas', espacios: 'Huella', activos: 'Activos', posiciones: 'Espacios', niveles: 'Niveles', ubicaciones: 'Posiciones' };
const LAYOUT_PLAN_IMAGE_MAX_BYTES = 2.5 * 1024 * 1024;

function layoutPermissions(req) {
    const admin = !!req.user.isClientAdmin;
    const grants = admin ? [] : getUserEffectiveGrants(req.user.sub);
    const level = (col) => (admin ? 'editar' : getColumnGrantLevel(grants, LAYOUT_TABLE_KEY, col));
    const sections = {};
    // Un paso del que la cuenta no tiene NINGÚN permiso en el árbol sale como 'none' (la pantalla no lo muestra); con solo Ver, 'solo-ver'.
    Object.entries(LayoutCalc.SECTIONS).forEach(([key, col]) => { sections[key] = admin || hasColumnGrant(grants, LAYOUT_TABLE_KEY, col) ? level(col) : 'none'; });
    const canButton = (col) => admin || canCreateColumn(grants, LAYOUT_TABLE_KEY, col);
    // El QR (ver y descargar la hoja) pide "Ver y Operar" en la columna Códigos QR; cambiarlo a propósito pide "Modificar".
    const qrLevel = level('colLayoutQr');
    return {
        sections, canCreateFromScratch: canButton('colLayoutCrearDesdeCero'), canLoadPlan: canButton('colLayoutCargarPlano'),
        canUseQr: qrLevel === 'ver-y-operar' || qrLevel === 'editar', canRegenerateQr: qrLevel === 'editar',
        // Eliminar una zona o un espacio YA guardado pide el permiso Eliminar de su columna en el árbol (antes solo se podían desactivar).
        canDeleteZones: admin || canDeleteColumn(grants, LAYOUT_TABLE_KEY, 'colLayoutZonas'),
        canDeleteSpaces: admin || canDeleteColumn(grants, LAYOUT_TABLE_KEY, 'colLayoutEspacios'),
        // Cambiar el color, las rayas o el borde de una zona pide además el icono Formato de zona (hoja <pantalla>/iconLayoutFormatoZona del árbol).
        canFormatZones: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutFormatoZona'),
        // Lo mismo para el color, las rayas y el borde de una huella-espacio: el icono Formato de huella (hoja <pantalla>/iconLayoutFormatoHuella del árbol).
        canFormatSpaces: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutFormatoHuella'),
        // Y el color propio de un activo: el icono Formato de activo (hoja <pantalla>/iconLayoutFormatoActivo del árbol).
        canFormatAssets: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutFormatoActivo'),
        // Y el color, la trama y el borde de un piso: el icono Formato de piso (hoja <pantalla>/iconLayoutFormatoPiso del árbol).
        canFormatFloors: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutFormatoPiso'),
        // Y el color, la trama y el borde de cada número de espacio (todos los E001, todos los E002…): el icono Formato de espacio (hoja <pantalla>/iconLayoutFormatoEspacio del árbol).
        canFormatBays: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutFormatoEspacio'),
        // Ver u ocultar las medidas del croquis es solo de pantalla, pero también es un icono con su propia hoja en el árbol (iconLayoutMedidas).
        canToggleMeasures: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutMedidas'),
        // Ver u ocultar los m² de cada zona en el croquis (y en la hoja que se descarga) es otro icono con su hoja (iconLayoutArea); los filtros de las tablas del panel, otro (iconLayoutFiltros).
        canToggleArea: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutArea'),
        canFilterTables: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutFiltros'),
        // Ver u ocultar los nombres de las zonas (en el croquis y en la hoja que se descarga) es otro icono con su hoja (iconLayoutNombres).
        canToggleNames: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutNombres'),
        // Ver u ocultar el espacio que necesita cada puerta al abrir (el giro de la batiente y el recorrido de la corrediza) es otro icono con su hoja (iconLayoutApertura).
        canToggleOpening: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutApertura'),
        // Ver u ocultar los niveles de piso de las zonas (rayas, rampa y el nivel de cada zona) es otro icono con su hoja (iconLayoutNiveles).
        canToggleLevels: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutNiveles'),
        // Acercar y alejar el croquis (botones, rueda, dos dedos) es otro icono con su hoja (iconLayoutZoom).
        canZoom: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutZoom'),
        // Ver el Layout en 3D (y volver al 2D) es otro icono con su hoja (iconLayoutVista3D).
        canView3D: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutVista3D'),
        // Mostrar u ocultar las capas del 3D (paredes, puertas, luz, columnas, zonas y activos) son iconos de un mismo grupo, con su hoja (iconLayout3dCapas).
        canToggle3dLayers: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayout3dCapas'),
        // Buscar una zona o una huella (la barra de Visualizaciones que enfoca el croquis, el 3D, las tablas y el resumen) usa el icono Buscar (hoja <pantalla>/iconLayoutBuscar).
        canFind: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutBuscar'),
        // El Layout abre en «Ver» (solo ver y filtrar); pasar a «Editar» (los pasos con sus tablas, agregar, quitar y guardar) pide el icono Editar el Layout (hoja <pantalla>/iconLayoutEditar del árbol). Sin él sale con candado.
        canEditMode: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutEditar'),
        // Renumerar los códigos de los activos (en cada zona y tipo, consecutivos desde 001) usa el icono Renumerar (hoja <pantalla>/iconLayoutRenumerar).
        canRenumber: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutRenumerar'),
        // Los candados de los QR (lo que ve y puede hacer quien escanea sin sesión) se cambian con el icono Candados de los QR (hoja <pantalla>/iconLayoutCandadosQr).
        canLockQr: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutCandadosQr'),
        // "QR y descarga" por Zona (la hoja con las categorías de los códigos que hay en la zona) se usa con el icono Imprimir por zona (hoja <pantalla>/iconLayoutImprimirZona).
        canPrintZone: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutImprimirZona'),
        // Girar el croquis (en pantalla y en la hoja que se descarga) usa el icono Girar (hoja <pantalla>/iconLayoutGirar del árbol).
        canRotate: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutGirar'),
        // Las categorías de las zonas se capturan con el icono Categorías de la zona y su tarjeta con QR se baja con el icono Tarjeta de categorías (hojas <pantalla>/iconLayoutCategorias e iconLayoutTarjeta).
        canEditCategories: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutCategorias'),
        canUseCard: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutTarjeta'),
        // Imprimir los QR de limpieza (uno por activo) usa el icono QR de limpieza (hoja <pantalla>/iconLayoutQrLimpieza).
        canUseCleaningQr: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutQrLimpieza'),
        // Imprimir los QR de temperaturas (uno por refrigerador, los activos de tipo Frío) usa el icono QR de temperaturas (hoja <pantalla>/iconLayoutQrTemperaturas).
        canUseTemperatureQr: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutQrTemperaturas'),
        canUseSensorQr: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutQrSensores'),
        // Imprimir los QR de seguridad (uno por elemento: extintor, hidrante, puerta de emergencia…) usa el icono QR de seguridad (hoja <pantalla>/iconLayoutQrSeguridad).
        canUseSafetyQr: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutQrSeguridad'),
        // Ver las piezas que caben en cada posición (el empaque que se acomoda, de Relación Código) en el croquis y el 3D, y apagarlas, usa el icono Piezas (hoja <pantalla>/iconLayoutPiezas).
        canTogglePieces: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutPiezas'),
        // Ver el techo en el 3D (la losa que se apoya sobre la altura de pared de cada esquina) usa el icono Techo (hoja <pantalla>/iconLayoutTecho).
        canToggleRoof: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutTecho'),
        // Ver en el paso Localizadores qué código tiene cada localizador, con su unidad y su capacidad máxima, usa el icono Códigos en Localizadores (hoja <pantalla>/iconLayoutCodigosLocalizador);
        // relacionar un código con un localizador completo (o cambiarlo) desde el Layout, el icono Relacionar código (hoja <pantalla>/iconLayoutRelacionarCodigo).
        canSeeLocatorCodes: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutCodigosLocalizador'),
        canRelateCode: admin || hasTableIconGrant(grants, LAYOUT_TABLE_KEY, 'iconLayoutRelacionarCodigo'),
    };
}

// Lo ÚNICO que sale por la vista pública del QR (sin sesión): paredes, zonas activas, espacios activos con su código, puertas, conexiones de luz y los KPIs. Nunca las
// columnas ni el plano de fondo. La hoja que se descarga se arma con este mismo contenido, para que traiga lo mismo que se ve al escanear.
// El logo del cliente (si lo tiene y no es enorme) para el reporte y la tarjeta que se imprimen; solo viaja en rutas con sesión, nunca en la vista pública.
// El color y el logo del cliente para las tarjetas de QR que se imprimen (las mismas que las del Layout); solo viajan en rutas con sesión.
function qrBranding(clientId) {
    const client = getClientById(clientId);
    const seed = client && typeof client.seed_color === 'string' ? client.seed_color.trim() : '';
    return { companyColor: /^#[0-9a-fA-F]{6}$/.test(seed) ? seed.toLowerCase() : '', logoDataUrl: clientLogoDataUrl(clientId) };
}
// Lo que las páginas públicas de los QR de operación (Limpieza, Temperaturas, Sensor, Seguridad) necesitan para su encabezado: si el cliente tiene logo (la imagen sale por /api/public/layout/<código>/logo, el mismo del Layout) y su color.
function publicBrand(clientId) {
    const client = getClientById(clientId);
    const seed = client && typeof client.seed_color === 'string' ? client.seed_color.trim() : '';
    return { hasLogo: !!clientLogoDataUrl(clientId), companyColor: /^#[0-9a-fA-F]{6}$/.test(seed) ? seed.toLowerCase() : '' };
}
function clientLogoDataUrl(clientId) {
    const client = getClientById(clientId);
    const logo = client && client.logo_data_url;
    // Los logos que acepta Nuestros Clientes (cualquier data:image/ de hasta ~500 KB) también salen en el reporte y la tarjeta, SVG incluido; solo se descarta lo que no sea una dirección de datos
    // sencilla (sin comillas, espacios ni signos < >) porque se escribe dentro de un SVG.
    return typeof logo === 'string' && /^data:image\/(png|jpe?g|webp|gif|svg\+xml)(;[A-Za-z0-9=._-]+)*,[^\s"'<>]+$/.test(logo) && logo.length <= 600000 ? logo : '';
}

function buildPublicLayoutPayload(clientId, row) {
    const l = row.layout;
    const client = getClientById(clientId);
    const pub = {
        heightM: l.heightM,
        vertices: l.vertices,
        doors: (l.doors || []).map((d) => ({ name: d.name, type: d.type, ...(d.wallId ? { wallId: d.wallId } : { wall: d.wall }), dist: d.dist, width: d.width, height: d.height, ...(d.open ? { open: d.open } : {}), ...(d.dir ? { dir: d.dir } : {}), ...(d.hinge ? { hinge: d.hinge } : {}) })),
        // Los pisos (plataformas y fosos) y las rampas se dibujan con su nivel en el croquis y el 3D; sin sus formatos de edición más que el color y la trama.
        floors: (l.floors || []).filter((f) => f.active !== false).map((f) => ({ id: f.id, name: f.name, code: f.code, x: f.x, y: f.y, l: f.l, w: f.w, ...(f.lvl ? { lvl: f.lvl } : {}), ...(f.lvl2 !== undefined ? { lvl2: f.lvl2, rise: f.rise } : {}), ...(f.fmt ? { fmt: f.fmt } : {}) })),
        ramps: (l.ramps || []).filter((r) => r.active !== false).map((r) => ({ id: r.id, name: r.name, code: r.code, x: r.x, y: r.y, l: r.l, w: r.w, ...(r.from ? { from: r.from } : {}), ...(r.to ? { to: r.to } : {}), ...(r.lvl !== undefined ? { lvl: r.lvl } : {}), ...(r.lvl2 !== undefined ? { lvl2: r.lvl2, rise: r.rise } : {}), ...(r.fmt ? { fmt: r.fmt } : {}) })),
        zones: (l.zones || []).filter((z) => z.active !== false).map((z) => ({ id: z.id, name: z.name, type: z.type, x: z.x, y: z.y, l: z.l, w: z.w, ...(Array.isArray(z.pts) ? { pts: z.pts } : {}), ...(z.fmt ? { fmt: z.fmt } : {}), ...(Array.isArray(z.categories) && z.categories.length ? { categories: z.categories } : {}) })),
        // La huella (el lugar en el piso, con su color si lo tiene) se dibuja debajo y el activo, con su propio color, encima.
        footprints: (l.footprints || []).filter((f) => f.active !== false).map((f) => ({ id: f.id, code: f.code, x: f.x, y: f.y, l: f.l, d: f.d, h: f.h, ...(f.fmt ? { fmt: f.fmt } : {}) })),
        spaces: (l.spaces || []).filter((s) => s.active !== false).map((s) => ({ id: s.id, type: s.type, code: s.code, zoneId: s.zoneId, footprintId: s.footprintId, x: s.x, y: s.y, l: s.l, d: s.d, h: s.h, levels: s.levels, ...(s.slots > 1 ? { slots: s.slots } : {}), ...(Array.isArray(s.faces) && s.faces.length ? { faces: s.faces } : {}), ...(s.front ? { front: s.front } : {}), ...(Array.isArray(s.lvls) && s.lvls.length ? { lvls: s.lvls } : {}), ...(Array.isArray(s.bays) && s.bays.some((b) => b.h !== undefined || b.l !== undefined || b.w !== undefined || b.faces !== undefined) ? { bays: s.bays.filter((b) => b.h !== undefined || b.l !== undefined || b.w !== undefined || b.faces !== undefined).map((b) => ({ n: b.n, c: b.c, ...(Array.isArray(b.faces) && b.faces.length ? { faces: b.faces } : {}), ...(b.h !== undefined ? { h: b.h } : {}), ...(b.l !== undefined ? { l: b.l } : {}), ...(b.w !== undefined ? { w: b.w } : {}) })) } : {}), ...(s.fmt ? { fmt: s.fmt } : {}) })),
        // Las posiciones de los espacios de cada activo (su lugar y medidas) para dibujarlas en la hoja y en la página pública; el candado «positions» del QR las quita de la página pública.
        positions: (() => { const live = new Set((l.spaces || []).filter((s) => s.active !== false).map((s) => s.id)); return (l.positions || []).filter((p) => live.has(p.spaceId)).map((p) => ({ s: p.spaceId, n: p.n, c: p.c, num: p.num, x: p.x, y: p.y, l: p.l, w: p.w, h: p.h, ...(Array.isArray(p.faces) && p.faces.length ? { faces: p.faces } : {}) })); })(),
        // Las conexiones de luz salen en la página pública (con su propia capa, apagada al entrar) porque Daniel pidió esos botones ahí; las columnas y el plano de fondo no.
        // Las paredes (obstáculos del contorno) van en la página pública porque son parte de la nave; columnas, desniveles y el plano de fondo no.
        obstacles: (l.obstacles || []).filter((o) => o.kind === 'wall').map((o) => ({ id: o.id, name: o.name, kind: o.kind, mode: o.mode, wall: o.wall, dist: o.dist, x: o.x, y: o.y, l: o.l, w: o.w, ...(o.h > 0 ? { h: o.h } : {}), ...(o.h2 > 0 ? { h2: o.h2 } : {}), ...(o.hb > 0 ? { hb: o.hb } : {}), ...(o.hb2 > 0 ? { hb2: o.hb2 } : {}) })),
        power: (l.power || []).map((e) => ({ type: e.type, ...(e.wallId ? { wallId: e.wallId } : { wall: e.wall }), dist: e.dist, height: e.height })),
        // Los pasillos (Tránsito) se dibujan en la página pública y cuentan en los m² de pasillos; quién transita y las medidas no salen.
        transit: (l.transit || []).map((p) => ({ id: p.id, code: p.code, name: p.name, type: p.type, x: p.x, y: p.y, l: p.l, w: p.w })),
        // Los elementos de Seguridad (extintores, hidrantes, puertas de emergencia…) se dibujan en la página pública con su propia capa; sin zona, sin fechas ni nada más.
        safety: (l.safety || []).map((e) => ({ id: e.id, code: e.code, name: e.name, type: e.type, x: e.x, y: e.y, ...(e.type === 'route' ? { x2: e.x2, y2: e.y2 } : { elev: e.elev, l: e.l, w: e.w, h: e.h, ...(e.hang > 0 ? { hang: e.hang } : {}), ...(e.aim ? { aim: e.aim } : {}), ...(e.fov ? { fov: e.fov } : {}), ...(e.range ? { range: e.range } : {}) }) })),
    };
    // Color representativo del cliente (el que se elige al darlo de alta): la hoja y la vista pública se pintan con él. Sin color válido va vacío y todo se ve como siempre.
    const seed = client && typeof client.seed_color === 'string' ? client.seed_color.trim() : '';
    // siteName = el Sitio (título de la página, p. ej. CEDIS CHIHUAHUA); zoneCodes = cuántos códigos hay en cada zona (solo la cuenta, nunca la lista).
    return { companyName: (client && client.company_name) || '', siteName: l.siteName || '', zoneCodes: countCodesByZone(clientId), hasLogo: !!clientLogoDataUrl(clientId), companyColor: /^#[0-9a-fA-F]{6}$/.test(seed) ? seed.toLowerCase() : '', version: row.version, updatedAt: row.updatedAt, layout: pub, kpis: LayoutCalc.computeKpis({ ...pub, obstacles: l.obstacles || [], transit: l.transit || [] }) };
}

function layoutSummary(layout, section) {
    if (!layout) return '';
    if (section === 'contorno') {
        const range = LayoutCalc.heightRange(layout.vertices || []);
        const height = range.min === range.max ? `${range.min}` : `${range.min} a ${range.max}`;
        return `${(layout.vertices || []).length} esquinas, altura ${height} m`;
    }
    if (section === 'obstaculos') return `${(layout.obstacles || []).filter((o) => o.kind !== 'wall').length} obstáculos`;
    if (section === 'paredes') return `${(layout.obstacles || []).filter((o) => o.kind === 'wall').length} paredes`;
    if (section === 'puertas') return `${(layout.doors || []).length} puertas`;
    if (section === 'luz') return `${(layout.power || []).length} conexiones de luz`;
    if (section === 'sensores') return `${(layout.sensors || []).length} sensores`;
    if (section === 'transito') return `${(layout.transit || []).length} pasillos`;
    if (section === 'objetos') return `${(layout.objects || []).length} objetos`;
    if (section === 'seguridad') return `${(layout.safety || []).length} elementos de seguridad`;
    if (section === 'techos') return `${(layout.roofs || []).length} techos y ${(layout.ceiling || []).length} elementos colgados del techo`;
    if (section === 'zonas') return `${(layout.zones || []).length} zonas`;
    if (section === 'pisos') return `${(layout.floors || []).length} pisos`;
    if (section === 'rampas') return `${(layout.ramps || []).length} rampas`;
    if (section === 'activos') return `${(layout.spaces || []).length} activos, ${(layout.spaces || []).filter((s) => s.assetClassId || s.assetId).length} con clasificación o tipo, ${(layout.spaces || []).filter((s) => s.fmt).length} con formato propio`;
    if (section === 'posiciones') return `${(layout.spaces || []).reduce((n, s) => n + (s.bays || []).length, 0)} huecos con datos propios`;
    if (section === 'niveles') return `${(layout.spaces || []).reduce((n, s) => n + (s.lvls || []).length, 0)} niveles con datos propios`;
    if (section === 'ubicaciones') return `${(layout.positions || []).length} posiciones`;
    // el formato propio de las huellas (color, rayas, borde) cuenta como parte de Huella-Espacio: sin esto un cambio de color dejaba el mismo texto en el historial
    const painted = (layout.footprints || []).filter((f) => f.fmt).length;
    return `${(layout.footprints || []).length} huellas${painted ? `, ${painted} con formato propio` : ''}`;
}

// El Layout es de UN centro de costos (el que se eligió en el selector de arriba): costCenterId viene en la dirección o en el cuerpo. Sin él (una pantalla de antes) se usa el primer Layout del cliente.
function layoutCenter(req) {
    const raw = req.query?.costCenterId ?? req.body?.costCenterId;
    if (raw === undefined || raw === null || raw === '') return { id: undefined, costCenter: null };
    const id = Number(raw);
    const costCenter = Number.isInteger(id) && id > 0 ? getCostCenterById(id, req.user.clientId, req.user.isTestAccount) : null;
    if (!costCenter) return { error: { status: 404, body: { message: 'Ese centro de costos no existe.' } } };
    return { id, costCenter };
}
// El Layout guardado de ese centro; si no hay (o el centro no existe) ya contesta el error y devuelve null.
function layoutRowForRequest(req, res) {
    const center = layoutCenter(req);
    if (center.error) { res.status(center.error.status).json(center.error.body); return null; }
    const row = getClientLayout(req.user.clientId, { costCenterId: center.id });
    if (!row) { res.status(404).json({ message: 'Todavía no hay un Layout guardado.' }); return null; }
    return row;
}
app.get('/api/business/layout', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    const row = getClientLayout(req.user.clientId, { costCenterId: center.id });
    const costCenter = center.costCenter || (row && row.costCenterId ? getCostCenterById(row.costCenterId, req.user.clientId, req.user.isTestAccount) : null);
    res.json({
        layout: row ? row.layout : null, version: row ? row.version : 0, updatedAt: row ? row.updatedAt : '', updatedBy: row ? row.updatedBy : '',
        hasPlanImage: row ? row.hasPlanImage : false, permissions: layoutPermissions(req), costCenterId: row ? row.costCenterId : (center.id || null),
        // Los activos del registro (Alta Activos) de este centro: los que el paso Activos puede colocar y los que ya están colocados.
        fixedAssets: layoutFixedAssetsFor(req, row, row ? row.costCenterId : center.id),
        costCenter: costCenter ? { id: costCenter.id, code: costCenter.code, name: costCenter.name } : null,
        // Las revisiones por QR de los elementos de Seguridad (la última de cada uno y el día de la última que salió bien): con eso la pantalla calcula el estado y la próxima revisión que se recorre sola.
        safetyLast: row && (row.layout.safety || []).length ? getSafetyLast(req.user.clientId, row.costCenterId || 0) : {},
    });
});

// Las piezas que caben en cada posición del Layout de un centro de costos: una por cada relación de Relación Código que ya tiene lugar completo y «Se acomoda» elegido, con las celdas de UNA capa
// (cm, desde la esquina del fondo-izquierda de la posición) para dibujarlas en el croquis y el 3D. Es solo de lectura; pide la hoja Piezas del Layout (iconLayoutPiezas).
app.get('/api/business/layout/pieces', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const perms = layoutPermissions(req);
    if (!perms.canTogglePieces) return res.status(403).json({ message: 'No tienes permiso para ver las piezas en el Layout.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    const ctx = codeRelationContext(req);
    const layout = ctx.layoutFor(center.id);
    const pieces = [];
    listCodeRelations(req.user.clientId, req.user.isTestAccount).forEach((r) => {
        if (r.pack_unit_id == null || !r.space_id || !r.level || !r.slot) return;
        if (center.id && r.cost_center_id !== center.id) return;
        const nums = layout.positions.get(`${r.space_id}|${r.level}|${r.slot}`) || [];
        const posNum = r.position || (nums.length === 1 ? nums[0].num : 0);
        const pack = codeRelationPack(r, layout, true, ctx);
        if (!pack.packCount || !pack.packBox) return;
        pieces.push({
            id: r.id, sku: padSku(r.sku_number, r.sku_code), spaceId: r.space_id, n: r.level, c: r.slot, p: posNum,
            level: pack.packLevel, label: pack.packLabel, shape: pack.packShape, count: pack.packCount, layers: pack.packLayers, perLayer: pack.packPerLayer, pieces: pack.packPieces, capacity: pack.packCapacity,
            leftH: pack.packLeftH, leftD: pack.packLeftD, box: pack.packBox, circle: pack.packCircle, layerHeight: pack.packLayerHeight, cells: pack.packCells,
        });
    });
    res.set('Cache-Control', 'no-store');
    res.json({ pieces });
});

// Lo que cada localizador completo tiene relacionado en Relación Código: el código, la unidad que se almacena y su capacidad máxima. Pide la hoja Códigos en Localizadores (iconLayoutCodigosLocalizador).
function locatorCodeInfo(rel) {
    return {
        relationId: rel.id, skuItemId: rel.skuItemId, sku: rel.sku, description: rel.description, spaceId: rel.spaceId, level: rel.level, slot: rel.slot, position: rel.position || 1,
        locator: rel.locator, packLevel: rel.packLevel, packUnitId: rel.packUnitId, packName: rel.packName || '', packShape: rel.packShape || '', packCount: rel.packCount, packCapacity: rel.packCapacity,
        mainUom: (rel.skuPackaging && rel.skuPackaging.main && rel.skuPackaging.main.name) || '',
    };
}
app.get('/api/business/layout/locator-codes', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const perms = layoutPermissions(req);
    if (!perms.canSeeLocatorCodes) return res.status(403).json({ message: 'No tienes permiso para ver los códigos de los localizadores.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    const ctx = codeRelationContext(req);
    const locators = [];
    listCodeRelations(req.user.clientId, req.user.isTestAccount).forEach((r) => {
        if (!r.space_id || !r.level || !r.slot) return;
        if (center.id && r.cost_center_id !== center.id) return;
        const rel = mapCodeRelation(r, null, '', ctx);
        if (rel.status !== 'located' || !rel.locator) return;
        locators.push(locatorCodeInfo(rel));
    });
    res.set('Cache-Control', 'no-store');
    res.json({ locators });
});
// El sub almacén físico (activo) cuya zona (y anaquel, si solo se le asignaron unos) es el de este localizador: de ahí salen el almacén y el centro de costos de la relación.
function subWarehouseForLocator(ctx, centerId, space) {
    const matches = [...ctx.warehouses.values()].filter((w) => {
        if (w.category_type !== 'sub-almacenes' || w.kind !== 'physical' || w.status !== 'active') return false;
        const wh = ctx.warehouses.get(w.parent_id);
        if (!wh || wh.parent_id !== centerId) return false;
        return parseWarehouseLocations(w.locations).some((e) => e.zoneId === space.zoneId && (!e.spaceIds.length || e.spaceIds.includes(space.id)));
    });
    return matches;
}
// Relacionar un código con un localizador COMPLETO desde el Layout (o cambiar el código o la unidad que ya tiene): la misma relación de Relación Código, con las mismas revisiones (lugar libre, código y unidad válidos).
// Pide la hoja Relacionar código del Layout (iconLayoutRelacionarCodigo); esa hoja es la autorización de este botón.
app.post('/api/business/layout/locator-code', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const perms = layoutPermissions(req);
    if (!perms.canRelateCode) return res.status(403).json({ message: 'No tienes permiso para relacionar códigos desde el Layout.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    if (!center.id) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    const body = req.body || {};
    const int = (v) => (Number.isInteger(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : null);
    const skuItemId = int(body.skuItemId); const level = int(body.level); const slot = int(body.slot); const position = int(body.position); const packUnitId = int(body.packUnitId);
    const spaceId = typeof body.spaceId === 'string' ? body.spaceId : '';
    if (!skuItemId || !spaceId || !(level >= 1) || !(slot >= 1) || !(position >= 1)) return res.status(400).json({ message: 'Faltan el código o el localizador.' });
    if (packUnitId === null || packUnitId < 0) return res.status(400).json({ message: 'Elige qué unidad de medida se almacena en este lugar.' });
    const ctx = codeRelationContext(req);
    const layout = ctx.layoutFor(center.id);
    // el localizador tiene que estar COMPLETO y guardado: zona, huella, activo, nivel, espacio y posición
    const space = layout.spaceById.get(spaceId);
    const posList = space ? (layout.positions.get(`${spaceId}|${level}|${slot}`) || []) : [];
    const zone = space && space.zoneId ? layout.zoneById.get(space.zoneId) : null;
    const footprint = space ? layout.footprintById.get(space.footprintId) : null;
    if (!space || !zone || !footprint || level > (space.levels || 1) || slot > LayoutCalc.levelSlots(space, level) || !posList.some((p) => p.num === position)) {
        return res.status(409).json({ code: 'INCOMPLETE', message: 'Este localizador todavía no está completo o no está guardado: completa y guarda el Layout primero.' });
    }
    const subs = subWarehouseForLocator(ctx, center.id, space);
    if (!subs.length) return res.status(409).json({ code: 'NO_SUB', message: 'La zona de este localizador no está asignada a ningún sub almacén físico activo. Asígnala en Catálogos > Nuestros Sub Almacenes.' });
    if (subs.length > 1) return res.status(409).json({ code: 'MANY_SUB', message: 'La zona de este localizador está en más de un sub almacén físico activo. Deja uno solo en Catálogos > Nuestros Sub Almacenes.' });
    const sub = subs[0];
    const existingAtPlace = listCodeRelations(clientId, isTestAccount).find((r) => r.space_id === spaceId && r.level === level && r.slot === slot && (r.position || (posList.length === 1 ? posList[0].num : 0)) === position);
    const relationId = int(body.relationId);
    const existing = relationId ? getCodeRelationById(relationId, clientId, isTestAccount) : null;
    if (relationId && (!existing || !existingAtPlace || existing.id !== existingAtPlace.id)) return res.status(404).json({ message: 'La relación de este localizador ya no existe. Vuelve a abrir el Layout.' });
    if (!relationId && existingAtPlace) return res.status(409).json({ message: `Este localizador ya tiene el código ${padSku(existingAtPlace.sku_number, existingAtPlace.sku_code)}. Usa «Cambiar».` });
    const state = {
        skuItemId, costCenterId: center.id, warehouseId: sub.parent_id, subWarehouseId: sub.id, zoneId: space.zoneId, spaceId, level, slot, position,
        classification: existing ? (existing.classification || 'activo') : 'activo', packUnitId,
    };
    const check = validateCodeRelationState(req, state, existing ? existing.id : 0, existing, ctx);
    if (check.error) return res.status(check.error.status).json({ message: check.error.message });
    const san = codeRelationSanitizers(ctx, req);
    let row;
    if (existing) {
        const patch = {};
        ['skuItemId', 'packUnitId'].forEach((key) => { const col = CODE_RELATION_PATCHABLE_FIELDS[key].column; if (String(existing[col] ?? '') !== String(state[key] ?? '')) patch[key] = state[key]; });
        // si el sub almacén o el almacén ya no son los mismos, también se corrigen (la zona manda)
        ['warehouseId', 'subWarehouseId'].forEach((key) => { const col = CODE_RELATION_PATCHABLE_FIELDS[key].column; if (String(existing[col] ?? '') !== String(state[key] ?? '')) patch[key] = state[key]; });
        if (Object.keys(patch).length) {
            Object.entries(patch).forEach(([key, v]) => {
                const col = CODE_RELATION_PATCHABLE_FIELDS[key].column;
                logTableChange({ clientId, tableKey: CODE_RELATION_TABLE_KEY, recordId: existing.id, recordLabel: `#${existing.id}`, action: 'update', fieldKey: CODE_RELATION_PATCHABLE_FIELDS[key].fieldKey, oldValue: san[key](existing[col]), newValue: san[key](v), changedBy: changedByLabel(req) });
            });
            row = updateCodeRelation(existing.id, clientId, patch, isTestAccount);
        } else row = existing;
    } else {
        row = createCodeRelation({ clientId, isTestData: isTestAccount, values: state });
        logTableChange({ clientId, tableKey: CODE_RELATION_TABLE_KEY, recordId: row.id, recordLabel: `#${row.id}`, action: 'create', changedBy: changedByLabel(req) });
        Object.entries(CODE_RELATION_PATCHABLE_FIELDS).forEach(([key, { fieldKey }]) => {
            if (state[key] === null || state[key] === '') return;
            logTableChange({ clientId, tableKey: CODE_RELATION_TABLE_KEY, recordId: row.id, recordLabel: `#${row.id}`, action: 'update', fieldKey, oldValue: '', newValue: san[key](state[key]), changedBy: changedByLabel(req) });
        });
        notifyButtonAction(req, CODE_RELATION_TABLE_KEY, 'create', `#${row.id}`);
    }
    const client = getClientById(clientId);
    const ctx2 = codeRelationContext(req);
    const rel = mapCodeRelation(getCodeRelationById(row.id, clientId, isTestAccount), null, client?.company_name, ctx2);
    res.status(existing ? 200 : 201).json({ locator: locatorCodeInfo(rel) });
});

app.get('/api/business/layout/plan-image', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    const row = getClientLayout(req.user.clientId, { withPlanImage: true, costCenterId: center.id });
    if (!row || !row.planImage) return res.status(404).json({ message: 'Plan not found.' });
    res.json({ image: row.planImage });
});

// Un localizador que ya tiene código (Relación Código) NO se puede eliminar: quitar o desactivar su posición, bajar los niveles o los espacios del activo, desactivar el activo o borrar su huella lo dejaría sin lugar.
// Se compara lo guardado con lo que llega (por identificadores, así que mover o renombrar no cuenta). Devuelve [{ locator, sku }] de los que se perderían; un lugar que ya no existía antes no cuenta.
function locatorsWithCodeRemoved(clientId, isTestAccount, centerId, prevLayout, nextLayout) {
    const rels = listCodeRelations(clientId, isTestAccount).filter((r) => r.cost_center_id === centerId && r.space_id && r.level && r.slot);
    if (!rels.length || !prevLayout) return [];
    const prev = layoutIndexOf({ layout: prevLayout });
    const nxt = layoutIndexOf({ layout: nextLayout });
    const out = [];
    for (const r of rels) {
        const key = `${r.space_id}|${r.level}|${r.slot}`;
        const before = prev.positions.get(key) || [];
        const posNum = r.position || (before.length === 1 ? before[0].num : 0);
        if (!posNum || !prev.spaceById.has(r.space_id) || !before.some((p) => p.num === posNum)) continue;
        const after = nxt.positions.get(key) || [];
        if (nxt.spaceById.has(r.space_id) && after.some((p) => p.num === posNum)) continue;
        const space = prev.spaceById.get(r.space_id);
        const zone = prev.zoneById.get(space.zoneId);
        const footprint = prev.footprintById.get(space.footprintId);
        const locator = zone && footprint ? RelTemplate.formatLocator({ zoneCode: zone.code, zoneName: zone.name, footprintCode: footprint.code, spaceType: space.type, spaceCode: space.code, level: r.level, slot: r.slot, position: posNum }) : '';
        out.push({ locator: locator || `${space.code} N${r.level} E${r.slot} P${posNum}`, sku: padSku(r.sku_number, r.sku_code) });
    }
    return out;
}

app.put('/api/business/layout', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const body = req.body || {};
    const checked = LayoutCalc.sanitizeLayout(body.layout);
    if (!checked.ok) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: checked.errors });
    let next = checked.layout;

    let planImage;
    if (body.planImage !== undefined) {
        planImage = typeof body.planImage === 'string' ? body.planImage : '';
        if (planImage && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(planImage)) return res.status(400).json({ message: 'El plano no es una imagen válida.' });
        if (planImage.length > LAYOUT_PLAN_IMAGE_MAX_BYTES * 1.4) return res.status(413).json({ message: 'El plano es demasiado grande.' });
    }
    if (planImage && !(next.plan && next.plan.widthM > 0)) return res.status(400).json({ message: 'Falta el ancho real del plano.' });

    // El Layout es del centro de costos elegido (el de la pantalla); ese centro tiene que estar completo y activo. Sin centro (una pantalla de antes) se usa el del Layout que ya había o el primero completo.
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    const completeCenters = listCompleteCostCenterIds(req.user.clientId, !!req.user.isTestAccount);
    let targetCenterId = center.id;
    if (targetCenterId === undefined) {
        const any = getClientLayout(req.user.clientId);
        targetCenterId = any ? (any.costCenterId || 0) : (completeCenters[0] || 0);
    }
    if (!completeCenters.includes(targetCenterId)) {
        return res.status(409).json({ code: 'COST_CENTER_REQUIRED', message: 'Ese centro de costos todavía no está completo: termina de llenarlo en Nuestros Centros Costos.' });
    }
    const existing = getClientLayout(req.user.clientId, { costCenterId: targetCenterId });
    // Los activos vienen de Alta Activos: cada uno toma de su renglón el código, el nombre, el tipo, la clasificación y las medidas (lo que mande la pantalla no manda), y uno nuevo solo se coloca, no se crea aquí.
    {
        const hyd = applyFixedAssetsToLayout(body.layout, { clientId: req.user.clientId, centerId: targetCenterId, previous: existing ? existing.layout : null });
        if (hyd.error) return res.status(400).json({ message: hyd.error.message, errors: [hyd.error.message], section: hyd.error.section });
        if (hyd.touched) {
            const again = LayoutCalc.sanitizeLayout(hyd.layout);
            if (!again.ok) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: again.errors });
            next = again.layout;
        }
        const knownSpaces = new Set(((existing && existing.layout.spaces) || []).map((s) => s.id));
        const knownSensors = new Set(((existing && existing.layout.sensors) || []).map((s) => s.id));
        if ((next.sensors || []).some((s) => !s.assetRef && !knownSensors.has(s.id))) return res.status(400).json({ message: 'Los sensores se dan de alta en Alta Activos y aquí solo se colocan: usa «+ Colocar sensor de Alta Activos».', errors: ['Los sensores se dan de alta en Alta Activos y aquí solo se colocan.'], section: 'sensores' });
        if ((next.spaces || []).some((s) => !s.assetRef && !knownSpaces.has(s.id))) return res.status(400).json({ message: 'Los activos se dan de alta en Alta Activos y aquí solo se colocan: usa «+ Colocar activo».', errors: ['Los activos se dan de alta en Alta Activos y aquí solo se colocan.'], section: 'activos' });
    }
    // Los códigos de las zonas (Z001…), de las huellas (H001… por zona) y de los activos (A001… por zona y tipo) los pone el sistema: lo que ya existía conserva el suyo y lo nuevo recibe el siguiente.
    next = LayoutCalc.lockCodes(next, existing ? existing.layout : null);
    // El nombre del sitio ya no se escribe en la pantalla: si llega vacío se conserva el que ya tenía el Layout (así no cuenta como un cambio del Contorno).
    if (!next.siteName && existing && existing.layout && existing.layout.siteName) next.siteName = existing.layout.siteName;
    const expectedVersion = Number(body.baseVersion) || 0;
    if ((existing ? existing.version : 0) !== expectedVersion) {
        return res.status(409).json({ message: 'El Layout cambió mientras lo editabas. Vuelve a abrirlo.', currentVersion: existing ? existing.version : 0 });
    }

    // Un localizador con código no se elimina (ver locatorsWithCodeRemoved): se rechaza el guardado diciendo cuáles y qué código los ocupa.
    if (existing) {
        const removed = locatorsWithCodeRemoved(req.user.clientId, !!req.user.isTestAccount, targetCenterId, existing.layout, next);
        if (removed.length) {
            const list = removed.slice(0, 3).map((x) => `${x.locator} (código ${x.sku})`).join(', ');
            const more = removed.length > 3 ? ` y ${removed.length - 3} más` : '';
            return res.status(409).json({ code: 'LOCATOR_WITH_CODE', message: `${removed.length === 1 ? 'Este localizador ya tiene código y no se puede eliminar' : 'Estos localizadores ya tienen código y no se pueden eliminar'}: ${list}${more}. Quita primero el código en Relación Código.`, locators: removed });
        }
    }

    // Lo que transita sale del catálogo de la empresa: los pasillos y los objetos solo pueden usar renglones que existen (y activos, salvo que ya los tuvieran). Las claves de antes (people, forklift…) que mande una pantalla vieja pasan a los
    // ids del catálogo, y cada objeto toma del catálogo su dibujo y sus medidas.
    const transitCatalog = listTransitCatalog(req.user.clientId);
    {
        const known = new Map(transitCatalog.map((c) => [c.id, c]));
        const prevWho = new Set(((existing && existing.layout.transit) || []).flatMap((p) => (p.who || []).filter((w) => typeof w === 'number')));
        const prevEquip = new Set(((existing && existing.layout.objects) || []).map((o) => Number(o.equipId)).filter(Boolean));
        const check = (id, previous, where) => {
            const c = known.get(id);
            if (!c) return `${where}: lo que transita ya no existe en el catálogo «Lo que transita». Vuelve a elegirlo.`;
            if (c.status !== 'active' && !previous.has(id)) return `${where}: «${c.name}» está inactivo en el catálogo «Lo que transita». Elige uno activo.`;
            return '';
        };
        for (const p of next.transit || []) {
            for (const w of p.who || []) {
                if (typeof w !== 'number') continue;
                const bad = check(w, prevWho, `Pasillo ${p.code || p.name || ''}`.trim());
                if (bad) return res.status(400).json({ message: bad, section: 'transito' });
            }
        }
        for (const o of next.objects || []) {
            if (!o.equipId) continue;
            const bad = check(Number(o.equipId), prevEquip, `Objeto ${o.name || ''}`.trim());
            if (bad) return res.status(400).json({ message: bad, section: 'objetos' });
        }
    }
    {
        const synced = LayoutCalc.applyTransitCatalog({ ...next, transitCatalog });
        next = { ...next, transit: synced.transit, objects: synced.objects };
    }
    // Una huella siempre va dentro de una zona y debe caber completa: lo nuevo o lo que cambió (la huella o su zona) y no cumple no se guarda; lo que ya estaba así y no se tocó se deja pasar (solo se marca en pantalla).
    {
        const fresh = LayoutCalc.newFootprintViolations(next, existing ? existing.layout : null);
        if (fresh.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: fresh.map((v) => v.message), section: 'espacios' });
    }
    // Los activos de una huella van uno junto al otro y ninguno se sale de ella, es más alto que ella ni se encima con otro: lo nuevo o lo que cambió y no cumple no se guarda; lo que ya estaba así y no se tocó se deja pasar.
    {
        const freshSpaces = LayoutCalc.newSpaceViolations(next, existing ? existing.layout : null);
        if (freshSpaces.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: freshSpaces.map((v) => v.message), section: ['levels', 'facesLevel'].includes(freshSpaces[0].kind) ? 'niveles' : (['bayl', 'bayw', 'bayh', 'baysum', 'bayout', 'bayoverlap', 'facesBay'].includes(freshSpaces[0].kind) ? 'posiciones' : 'activos') });
    }
    // Posiciones: cada una va dentro de su espacio, no pasa de su alto, no se encima con otra y usa solo caras de consumo de su espacio. Lo nuevo o lo que cambió y no cumple no se guarda; lo que ya estaba así y no se tocó se deja pasar.
    {
        const freshPositions = LayoutCalc.newPositionViolations(next, existing ? existing.layout : null);
        if (freshPositions.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: freshPositions.map((v) => v.message), section: 'ubicaciones' });
    }
    // Tránsito: un pasillo va dentro de una zona, lo que transita por él tiene que caber y nada (huella, columna, pared, desnivel) puede ir adentro. Lo nuevo o lo que cambió y no cumple no se guarda; lo que ya estaba así y no se tocó se deja pasar.
    {
        const freshTransit = LayoutCalc.newTransitViolations({ ...next, transitCatalog }, existing ? existing.layout : null);
        if (freshTransit.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: freshTransit.map((v) => v.message), section: 'transito' });
    }
    // Seguridad: cada elemento (y los dos extremos de la ruta) va dentro del contorno de la nave. Lo nuevo o lo que cambió y no cumple no se guarda; lo que ya estaba así y no se tocó se deja pasar.
    {
        const freshSafety = LayoutCalc.newSafetyViolations(next, existing ? existing.layout : null);
        if (freshSafety.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: freshSafety.map((v) => v.message), section: 'seguridad' });
        const freshCeiling = LayoutCalc.newCeilingViolations(next, existing ? existing.layout : null);
        if (freshCeiling.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: freshCeiling.map((v) => v.message), section: 'techos' });
        // Techos (cubiertas): cada techo cubre algo, un área va dentro del contorno y la parte alta no es más baja que la baja. Lo nuevo o lo que cambió y no cumple no se guarda.
        const freshRoofs = LayoutCalc.newRoofViolations(next, existing ? existing.layout : null);
        if (freshRoofs.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: freshRoofs.map((v) => v.message), section: 'techos' });
    }
    // Obstáculos con altura propia: no pueden pasar del techo (altura del piso + alto). Lo nuevo o lo que cambió y no cumple no se guarda; lo que ya estaba así y no se tocó se deja pasar.
    {
        const freshObstacles = LayoutCalc.newObstacleViolations(next, existing ? existing.layout : null);
        if (freshObstacles.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: freshObstacles.map((v) => v.message), section: 'obstaculos' });
    }
    // Columnas y paredes libres: nada sale del contorno de la nave. Lo nuevo o lo que cambió y no cumple no se guarda; lo que ya estaba afuera y no se tocó se deja pasar.
    {
        const freshInside = LayoutCalc.newObstacleInsideViolations(next, existing ? existing.layout : null);
        if (freshInside.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: freshInside.map((v) => v.message), section: freshInside[0].section });
    }
    // Objetos (personas, montacargas, cajas): nada sale del contorno de la nave. Lo nuevo o lo que cambió y no cumple no se guarda; lo que ya estaba afuera y no se tocó se deja pasar.
    {
        const freshObjects = LayoutCalc.newObjectInsideViolations(next, existing ? existing.layout : null);
        if (freshObjects.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: freshObjects.map((v) => v.message), section: 'objetos' });
    }
    // Pisos y rampas: nada sale del contorno de la nave. Lo nuevo o lo que cambió y no cumple no se guarda; lo que ya estaba afuera y no se tocó se deja pasar.
    {
        const freshFloors = LayoutCalc.newFloorViolations(next, existing ? existing.layout : null);
        if (freshFloors.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: freshFloors.map((v) => v.message), section: freshFloors[0].section });
    }
    // Zonas: nada sale del contorno de la nave. Lo nuevo o lo que cambió y no cumple no se guarda; lo que ya estaba afuera y no se tocó se deja pasar.
    {
        const freshZones = LayoutCalc.newZoneViolations(next, existing ? existing.layout : null);
        if (freshZones.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: freshZones.map((v) => v.message), section: 'zonas' });
    }
    // Zonas que no se enciman: cada metro de la nave es de una sola zona. Lo nuevo o lo que cambió y no cumple no se guarda; lo que ya estaba encimado y no se tocó se deja pasar.
    {
        const freshOverlap = LayoutCalc.newZoneOverlapViolations(next, existing ? existing.layout : null);
        if (freshOverlap.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: freshOverlap.map((v) => v.message), section: 'zonas' });
    }
    // Puertas, conexiones de luz y sensores: cada uno va sobre una pared, queda dentro de ella (la puerta, de principio a fin) y no es más alto que ella. Lo nuevo o lo que cambió (el renglón o su pared) y no cumple no se guarda; lo que
    // ya estaba así y no se tocó se deja pasar.
    {
        const freshWallItems = LayoutCalc.newWallItemViolations(next, existing ? existing.layout : null);
        if (freshWallItems.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: freshWallItems.map((v) => v.message), section: freshWallItems[0].section });
    }
    // Cada espacio con clasificación o tipo de activo debe apuntar a uno de los catálogos del cliente (activo, o el mismo que ya tenía guardado).
    {
        const catalogs = [['assetClassId', 'activos-clasificacion', 'la clasificación', 'a', 'la'], ['assetId', 'activos-fijos', 'el tipo de activo', 'o', 'lo']];
        const prev = new Map(((existing && existing.layout.spaces) || []).map((s) => [s.id, s]));
        for (const [field, type, label, end, pronoun] of catalogs) {
            const rows = new Map(listArticleCategories(req.user.clientId, type, req.user.isTestAccount).map((r) => [r.id, r]));
            for (const s of next.spaces || []) {
                if (!s[field] || s.assetRef) continue; // un activo de Alta Activos ya trae su tipo y su clasificación del registro (ahí se validaron)
                const row = rows.get(s[field]);
                if (!row) return res.status(400).json({ message: `El espacio ${s.code || ''}: ${label} que elegiste ya no existe. Vuelve a elegir${pronoun}.`, section: 'activos' });
                const before = prev.get(s.id);
                if (row.status !== 'active' && !(before && before[field] === s[field])) return res.status(400).json({ message: `El espacio ${s.code || ''}: ${label} «${row.name}» está inactiv${end}. Elige un${end} activ${end}.`, section: 'activos' });
            }
        }
    }
    const perms = layoutPermissions(req);
    // Los códigos guardados no se mueven solos: renumerarlos lo pide una persona con el icono Renumerar (se manda renumberCodes al guardar).
    if (body.renumberCodes === true) {
        if (!perms.canRenumber) return res.status(403).json({ message: 'No tienes permiso para renumerar los códigos de los activos.' });
        next = LayoutCalc.renumberSpaceCodes(next);
    }
    const creating = !existing;
    if (creating) {
        const allowed = next.mode === 'plan' ? perms.canLoadPlan : perms.canCreateFromScratch;
        if (!allowed) return res.status(403).json({ message: 'No tienes permiso para crear el Layout.' });
    } else if (planImage !== undefined && !perms.canLoadPlan) {
        return res.status(403).json({ message: 'No tienes permiso para cargar un plano.' });
    }
    // Al eliminar una zona sus espacios quedan sin zona: ese efecto no cuenta como modificar los espacios (quien puede eliminar la zona no necesita editar los anaqueles).
    const removedZoneIds = existing ? (existing.layout.zones || []).filter((z) => !(next.zones || []).some((n) => n.id === z.id)).map((z) => z.id) : [];
    const compareBase = existing && removedZoneIds.length
        ? { ...existing.layout, footprints: (existing.layout.footprints || []).map((f) => (removedZoneIds.includes(f.zoneId) ? { ...f, zoneId: '' } : f)) }
        : (existing ? existing.layout : null);
    const changed = [];
    for (const section of Object.keys(LayoutCalc.SECTIONS)) {
        const before = JSON.stringify(LayoutCalc.sectionData(compareBase, section) ?? null);
        const after = JSON.stringify(LayoutCalc.sectionData(next, section) ?? null);
        if (before === after) continue;
        const level = perms.sections[section];
        const hadData = existing ? LayoutCalc.sectionHasData(existing.layout, section) : false;
        const allowed = level === 'editar' || (level === 'ver-y-operar' && !hadData);
        if (!allowed) return res.status(403).json({ message: `No tienes permiso para modificar: ${LAYOUT_SECTION_LABELS[section]}.`, section });
        changed.push(section);
    }
    // Quitar una zona o un espacio ya guardado (no solo desactivarlo) pide además el permiso Eliminar de su columna.
    if (existing) {
        const removedCount = (key) => (existing.layout[key] || []).filter((row) => !(next[key] || []).some((n) => n.id === row.id)).length;
        if (removedCount('zones') && !perms.canDeleteZones) return res.status(403).json({ message: 'No tienes permiso para eliminar zonas.', section: 'zonas' });
        if ((removedCount('footprints') || removedCount('spaces')) && !perms.canDeleteSpaces) return res.status(403).json({ message: 'No tienes permiso para eliminar espacios.', section: 'espacios' });
    }
    // El formato de las zonas (color, rayas, borde) solo lo cambia quien tiene el icono Formato de zona.
    // Las categorías de las zonas solo las cambia quien tiene el icono Categorías de la zona.
    if (!perms.canEditCategories) {
        const beforeCats = new Map(((existing && existing.layout.zones) || []).map((z) => [z.id, JSON.stringify(z.categories || null)]));
        if ((next.zones || []).some((z) => JSON.stringify(z.categories || null) !== (beforeCats.has(z.id) ? beforeCats.get(z.id) : 'null'))) {
            return res.status(403).json({ message: 'No tienes permiso para cambiar las categorías de las zonas.', section: 'zonas' });
        }
    }
    if (!perms.canFormatZones) {
        const before = new Map(((existing && existing.layout.zones) || []).map((z) => [z.id, JSON.stringify(z.fmt || null)]));
        if ((next.zones || []).some((z) => JSON.stringify(z.fmt || null) !== (before.has(z.id) ? before.get(z.id) : 'null'))) {
            return res.status(403).json({ message: 'No tienes permiso para cambiar el formato de las zonas.', section: 'zonas' });
        }
    }
    // El formato de las huellas (color, rayas, borde) solo lo cambia quien tiene el icono Formato de huella.
    if (!perms.canFormatSpaces) {
        const beforeSpaces = new Map(((existing && existing.layout.footprints) || []).map((f) => [f.id, JSON.stringify(f.fmt || null)]));
        if ((next.footprints || []).some((f) => JSON.stringify(f.fmt || null) !== (beforeSpaces.has(f.id) ? beforeSpaces.get(f.id) : 'null'))) {
            return res.status(403).json({ message: 'No tienes permiso para cambiar el formato de las huellas.', section: 'espacios' });
        }
    }
    // El color propio del activo solo lo cambia quien tiene el icono Formato de activo.
    if (!perms.canFormatAssets) {
        const beforeAssets = new Map(((existing && existing.layout.spaces) || []).map((s) => [s.id, JSON.stringify(s.fmt || null)]));
        if ((next.spaces || []).some((s) => JSON.stringify(s.fmt || null) !== (beforeAssets.has(s.id) ? beforeAssets.get(s.id) : 'null'))) {
            return res.status(403).json({ message: 'No tienes permiso para cambiar el formato de los activos.', section: 'activos' });
        }
    }
    // El formato de los pisos (color, trama y borde) solo lo cambia quien tiene el icono Formato de piso.
    if (!perms.canFormatFloors) {
        const beforeFloors = new Map(((existing && existing.layout.floors) || []).map((f) => [f.id, JSON.stringify(f.fmt || null)]));
        if ((next.floors || []).some((f) => JSON.stringify(f.fmt || null) !== (beforeFloors.has(f.id) ? beforeFloors.get(f.id) : 'null'))) {
            return res.status(403).json({ message: 'No tienes permiso para cambiar el formato de los pisos.', section: 'pisos' });
        }
    }
    // El formato de los espacios (color, trama y borde de cada número de espacio) solo lo cambia quien tiene el icono Formato de espacio.
    if (!perms.canFormatBays) {
        if (JSON.stringify(next.bayFmt || null) !== JSON.stringify((existing && existing.layout.bayFmt) || null)) {
            return res.status(403).json({ message: 'No tienes permiso para cambiar el formato de los espacios.', section: 'posiciones' });
        }
    }
    // Lo que va adentro de algo no puede llevar el color de lo que lo contiene (huella vs su zona, activo vs su huella): lo nuevo o lo que cambió y choca no se guarda; lo que ya estaba así se deja pasar.
    {
        const clashes = LayoutCalc.newColorClashes(next, existing ? existing.layout : null);
        if (clashes.length) return res.status(400).json({ message: 'El Layout tiene datos no válidos.', errors: clashes.map((c) => c.message), section: clashes[0].kind === 'asset' ? 'activos' : 'espacios' });
    }
    if (!changed.length && planImage === undefined && existing) return res.json({ version: existing.version, changed: [] });
    // Sin nombre de sitio, el del Layout es el nombre del centro de costos (sale arriba del nombre de la empresa en la hoja y las tarjetas). Se pone ya revisados los permisos: lo deriva el sistema, no la persona.
    if (!next.siteName && targetCenterId) {
        const cc = getCostCenterAnyLane(targetCenterId, req.user.clientId);
        const ccName = cc && String(cc.name || '').trim().slice(0, LayoutCalc.LIMITS.text);
        if (ccName) next.siteName = ccName;
    }

    const result = saveClientLayout({ clientId: req.user.clientId, layout: next, planImage, expectedVersion, updatedBy: changedByLabel(req), costCenterId: targetCenterId });
    if (result.conflict) return res.status(409).json({ message: 'El Layout cambió mientras lo editabas. Vuelve a abrirlo.', currentVersion: result.currentVersion });

    const actor = { actorUserId: req.user.sub, actorLabel: changedByLabel(req) };
    changed.forEach((section) => {
        const before = existing ? layoutSummary(existing.layout, section) : '';
        const after = layoutSummary(next, section);
        logTableChange({
            clientId: req.user.clientId, tableKey: LAYOUT_TABLE_KEY, recordId: targetCenterId || 1, recordLabel: 'Layout',
            action: creating ? 'create' : 'update', fieldKey: LayoutCalc.SECTIONS[section], oldValue: before, newValue: after, changedBy: changedByLabel(req),
        });
        notifyDataChange({ clientId: req.user.clientId, tableKey: LAYOUT_TABLE_KEY, recordLabel: 'Layout', fieldKey: LayoutCalc.SECTIONS[section], oldValue: before, newValue: after, ...actor });
    });
    if (creating && next.mode !== 'plan') notifyButtonAction(req, LAYOUT_TABLE_KEY, 'create', 'Layout');
    res.status(creating ? 201 : 200).json({ version: result.version, changed });
});

// QR del Layout. Datos para la hoja que se descarga: la dirección fija, los módulos del QR y lo público del Layout guardado.
app.get('/api/business/layout/qr', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const perms = layoutPermissions(req);
    if (!perms.canUseQr) return res.status(403).json({ message: 'No tienes permiso para usar el QR del Layout.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    const token = ensureLayoutPublicToken(req.user.clientId, row.costCenterId || 0);
    const url = `${req.protocol}://${req.get('host')}/q/${token}`;
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const rows = [];
    for (let r = 0; r < size; r++) rows.push(Array.from({ length: size }, (_, c) => (qr.modules.get(r, c) ? '1' : '0')).join(''));
    res.set('Cache-Control', 'no-store');
    // extras: lo que el reporte con sesión puede dibujar y la vista pública nunca lleva (columnas y conexiones de luz), según las capas activas del croquis.
    res.json({ url, qrRows: rows, canRegenerate: perms.canRegenerateQr, logoDataUrl: clientLogoDataUrl(req.user.clientId), siteName: row.layout.siteName || '', extras: { obstacles: row.layout.obstacles || [], power: row.layout.power || [] }, ...buildPublicLayoutPayload(req.user.clientId, row) });
});

// Las categorías de cada zona con su QR, para la tarjeta que se imprime. Cada QR lleva la dirección fija del Layout más la zona y la categoría (el QR no cambia nunca; ahí aparecerán los
// códigos de esa categoría cuando se agreguen). Se arma con lo último guardado y pide el icono Tarjeta de categorías.
app.get('/api/business/layout/categories-qr', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!layoutPermissions(req).canUseCard) return res.status(403).json({ message: 'No tienes permiso para usar la tarjeta de categorías.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    const token = ensureLayoutPublicToken(req.user.clientId, row.costCenterId || 0);
    const base = `${req.protocol}://${req.get('host')}/q/${token}`;
    const zones = (row.layout.zones || []).filter((z) => z.active !== false && Array.isArray(z.categories) && z.categories.length).map((z) => ({
        id: z.id, name: z.name,
        categories: z.categories.map((c) => {
            const url = `${base}?z=${encodeURIComponent(z.id)}&c=${encodeURIComponent(c.id)}`;
            const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
            const size = qr.modules.size;
            const rows = [];
            for (let r = 0; r < size; r++) rows.push(Array.from({ length: size }, (_, k) => (qr.modules.get(r, k) ? '1' : '0')).join(''));
            return { id: c.id, name: c.name, desc: c.desc, icon: c.icon, color: c.color, url, qrRows: rows };
        }),
    }));
    const client = getClientById(req.user.clientId);
    const seed = client && typeof client.seed_color === 'string' ? client.seed_color.trim() : '';
    res.set('Cache-Control', 'no-store');
    // El logo del cliente (si lo tiene y no es enorme) va en el encabezado de la tarjeta.
    const logo = clientLogoDataUrl(req.user.clientId);
    res.json({ companyName: (client && client.company_name) || '', siteName: row.layout.siteName || '', companyColor: /^#[0-9a-fA-F]{6}$/.test(seed) ? seed.toLowerCase() : '', logoDataUrl: logo, version: row.version, updatedAt: row.updatedAt, zones });
});

// Hoja por Zona: las categorías (de UNA de las 7, la que se elija) de los códigos que Relación Código tiene en una zona, con cuántos códigos hay de cada una y su QR.
// REGLA DE LOS QR IMPRESOS: no cambian nunca. Cada QR lleva la dirección fija del Layout + el id de la zona + la categoría del CATÁLOGO por su número (nunca su nombre ni una
// cantidad), así la hoja impresa sigue sirviendo aunque se renombre la categoría o cambien los códigos; lo que se ve al escanear se lee en ese momento
// (GET /api/public/layout/:token/category). Una categoría que ya no está en el catálogo (el código conserva su texto) lleva el texto en la clave: "tipo.n:<texto>".
const ZONE_CATEGORY_KEY_RE = /^([a-z]+)\.(\d{1,9}|n:.{1,200})$/;
function layoutQrRows(url) {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const rows = [];
    for (let r = 0; r < size; r++) rows.push(Array.from({ length: size }, (_, k) => (qr.modules.get(r, k) ? '1' : '0')).join(''));
    return rows;
}
app.get('/api/business/layout/zone-categories', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!layoutPermissions(req).canPrintZone) return res.status(403).json({ message: 'No tienes permiso para imprimir por zona.' });
    const type = String(req.query.type || 'inventario');
    if (!ZONE_CATEGORY_COLUMNS[type]) return res.status(400).json({ message: 'Esa categoría no existe.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    const zone = (row.layout.zones || []).find((z) => z.id === String(req.query.zone || '') && z.active !== false);
    if (!zone) return res.status(404).json({ message: 'Esa zona no está en el Layout guardado.' });
    const isTest = !!req.user.isTestAccount;
    const byName = new Map();
    listArticleCategories(req.user.clientId, type, isTest).forEach((c) => { if (!byName.has(c.name) || c.status === 'active') byName.set(c.name, c); });
    const base = `${req.protocol}://${req.get('host')}/q/${ensureLayoutPublicToken(req.user.clientId, row.costCenterId || 0)}`;
    let without = 0;
    let total = 0;
    const categories = [];
    countZoneCodesByCategory(req.user.clientId, isTest, zone.id, type).forEach(({ name, codes }) => {
        total += codes;
        if (!name) { without += codes; return; }
        const entry = byName.get(name);
        const key = entry ? `${type}.${entry.id}` : `${type}.n:${name}`;
        const url = `${base}?z=${encodeURIComponent(zone.id)}&k=${encodeURIComponent(key)}`;
        categories.push({ key, name, codes, seed: entry ? entry.record_number : 0, url, qrRows: layoutQrRows(url) });
    });
    categories.sort((a, b) => b.codes - a.codes || a.name.localeCompare(b.name, 'es'));
    const client = getClientById(req.user.clientId);
    const seedColor = client && typeof client.seed_color === 'string' ? client.seed_color.trim() : '';
    res.set('Cache-Control', 'no-store');
    res.json({
        zone: { id: zone.id, name: zone.name }, type, categories, without, total,
        companyName: (client && client.company_name) || '', siteName: row.layout.siteName || '', companyColor: /^#[0-9a-fA-F]{6}$/.test(seedColor) ? seedColor.toLowerCase() : '', logoDataUrl: clientLogoDataUrl(req.user.clientId),
        version: row.version, updatedAt: row.updatedAt,
    });
});

// Hoja de clasificaciones: las clasificaciones de UNA categoría de Inventario (las que se relacionan en Nuestras Categorías Inventarios), cada una con su QR a la página de esa clasificación en una zona.
// No depende de los códigos: el QR lleva la dirección fija del Layout + el id de la zona + la categoría y la clasificación del CATÁLOGO por su número (REGLA DE LOS QR IMPRESOS: no cambian nunca),
// y lo que se ve al escanear se lee en ese momento (GET /api/public/layout/:token/classification). Sin `category` devuelve solo la lista de categorías que ya tienen clasificaciones.
app.get('/api/business/layout/zone-classifications', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!layoutPermissions(req).canPrintZone) return res.status(403).json({ message: 'No tienes permiso para imprimir por zona.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    const zone = (row.layout.zones || []).find((z) => z.id === String(req.query.zone || '') && z.active !== false);
    if (!zone) return res.status(404).json({ message: 'Esa zona no está en el Layout guardado.' });
    const isTest = !!req.user.isTestAccount;
    const catalog = new Map(listArticleCategories(req.user.clientId, 'clasificaciones', isTest).map((r) => [r.id, r]));
    const withItems = listArticleCategories(req.user.clientId, 'inventario', isTest)
        .map((c) => ({ c, items: parseClassificationIds(c.classification_ids).map((id) => catalog.get(id)).filter(Boolean) }))
        .filter((x) => x.items.length);
    res.set('Cache-Control', 'no-store');
    if (!req.query.category) return res.json({ categories: withItems.map(({ c, items }) => ({ id: c.id, name: c.name, count: items.length })) });
    const found = withItems.find((x) => String(x.c.id) === String(req.query.category));
    if (!found) return res.status(404).json({ message: 'Esa categoría no tiene clasificaciones.' });
    const base = `${req.protocol}://${req.get('host')}/q/${ensureLayoutPublicToken(req.user.clientId, row.costCenterId || 0)}`;
    const items = found.items.map((r) => {
        const url = `${base}?z=${encodeURIComponent(zone.id)}&k=${encodeURIComponent(`inventario.${found.c.id}`)}&l=${r.id}`;
        return { id: r.id, name: r.name, desc: r.description || '', seed: r.record_number, url, qrRows: layoutQrRows(url) };
    });
    const client = getClientById(req.user.clientId);
    const seedColor = client && typeof client.seed_color === 'string' ? client.seed_color.trim() : '';
    res.json({
        zone: { id: zone.id, name: zone.name }, category: { id: found.c.id, name: found.c.name }, items,
        companyName: (client && client.company_name) || '', siteName: row.layout.siteName || '', companyColor: /^#[0-9a-fA-F]{6}$/.test(seedColor) ? seedColor.toLowerCase() : '', logoDataUrl: clientLogoDataUrl(req.user.clientId),
        version: row.version, updatedAt: row.updatedAt,
    });
});

// Cambiar el QR a propósito (por ejemplo si lo fotografiaron fuera de la empresa): el anterior deja de funcionar y hay que volver a imprimir.
app.post('/api/business/layout/qr/regenerate', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!layoutPermissions(req).canRegenerateQr) return res.status(403).json({ message: 'No tienes permiso para cambiar el QR del Layout.' });
    if (!req.body || req.body.confirm !== true) return res.status(400).json({ message: 'Falta confirmar el cambio del QR.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    if (!regenerateLayoutPublicToken(req.user.clientId, row.costCenterId || 0)) return res.status(404).json({ message: 'Todavía no hay un Layout guardado.' });
    logTableChange({
        clientId: req.user.clientId, tableKey: LAYOUT_TABLE_KEY, recordId: row.costCenterId || 1, recordLabel: 'Layout', action: 'update',
        fieldKey: 'colLayoutQr', oldValue: 'QR anterior', newValue: 'QR nuevo', changedBy: changedByLabel(req),
    });
    notifyDataChange({ clientId: req.user.clientId, tableKey: LAYOUT_TABLE_KEY, recordLabel: 'Layout', fieldKey: 'colLayoutQr', oldValue: 'QR anterior', newValue: 'QR nuevo', actorUserId: req.user.sub, actorLabel: changedByLabel(req) });
    res.json({ ok: true });
});

// --- Vista pública del Layout (sin sesión) -----------------------------------
// Lo que abre el QR del Layout. Como la ficha pública de un artículo, NO pasa por requireAuth y lo único que se busca es el código aleatorio (128 bits, no se
// puede adivinar). Siempre trae la versión guardada más reciente (no-store). Un tope por IP frena a quien pruebe códigos.
const publicLayoutLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests.' } });
app.get('/q/:token', publicLayoutLimiter, (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
    res.sendFile(path.join(PUBLIC_DIR, 'LayoutPublico.html'));
});
// El logo del cliente para la vista pública del Layout: es la imagen tal cual (no va metida en el JSON, que se pide siempre sin caché). Se guarda 5 minutos en el navegador.
app.get('/api/public/layout/:token/logo', publicLayoutLimiter, (req, res) => {
    const row = getLayoutByPublicToken(req.params.token);
    if (!row) return res.status(404).end();
    sendClientLogo(res, row.clientId);
});
// El mismo logo para la Ficha pública de un artículo (su código es el del artículo, no el de un Layout).
app.get('/api/public/ficha/:token/logo', publicLayoutLimiter, (req, res) => {
    const skuItem = getSkuItemByPublicToken(req.params.token);
    if (!skuItem) return res.status(404).end();
    sendClientLogo(res, skuItem.client_id);
});
function sendClientLogo(res, clientId) {
    const match = clientLogoDataUrl(clientId).match(/^data:(image\/(?:png|jpe?g|webp|gif|svg\+xml))((?:;[A-Za-z0-9=._-]+)*),(.+)$/);
    if (!match) return res.status(404).end();
    let body;
    try { body = /;base64$/i.test(match[2]) ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3])); } catch { return res.status(404).end(); }
    // Un SVG sirve como imagen dentro de la página, pero si alguien abre esta dirección sola no debe poder ejecutar nada: sandbox y sin sniffing.
    res.set({ 'Content-Type': match[1], 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
    res.send(body);
}
// Lo que muestra el QR de una categoría de la hoja por Zona (?z=<zona>&k=<tipo.número>): el nombre ACTUAL de la categoría y cuántos códigos hay hoy en esa zona. Solo eso:
// ni la lista de códigos ni fotos (esa vista sería otra pieza). Nunca cambia la dirección; sí lo que responde.
app.get('/api/public/layout/:token/category', publicLayoutLimiter, (req, res) => {
    const row = getLayoutByPublicToken(req.params.token);
    if (!row) return res.status(404).json({ message: 'Layout not found.' });
    const zone = (row.layout.zones || []).find((z) => z.id === String(req.query.z || '') && z.active !== false);
    const match = ZONE_CATEGORY_KEY_RE.exec(String(req.query.k || ''));
    if (!zone || !match || !ZONE_CATEGORY_COLUMNS[match[1]]) return res.status(404).json({ message: 'Category not found.' });
    let name;
    let seed = 0;
    if (match[2].startsWith('n:')) {
        name = match[2].slice(2);
    } else {
        const entry = getArticleCategoryById(Number(match[2]), row.clientId, false);
        if (!entry || entry.category_type !== match[1]) return res.status(404).json({ message: 'Category not found.' });
        name = entry.name;
        seed = entry.record_number;
    }
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    // cuántos códigos hay hoy en esa zona solo se manda con el candado de conteos abierto
    const counted = qrLocksOf('layout', row.clientId, row.costCenterId || 0).counts ? { codes: countZoneCodesInCategory(row.clientId, false, zone.id, match[1], name) } : {};
    res.json({ zoneName: zone.name, type: match[1], name, seed, ...counted });
});
app.get('/api/public/layout/:token', publicLayoutLimiter, (req, res) => {
    const row = getLayoutByPublicToken(req.params.token);
    if (!row) return res.status(404).json({ message: 'Layout not found.' });
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.json(lockedLayoutPayload(buildPublicLayoutPayload(row.clientId, row), qrLocksOf('layout', row.clientId, row.costCenterId || 0)));
});

// --- Limpieza (Operaciones > C. Distribución) ----------------------------------------------------------------------------------------------------
// Cada ACTIVO del Layout tiene su QR (la dirección fija /l/<código del Layout>/<id del activo>: nunca cambia). Quien lo escanea NO necesita sesión: escribe su nombre, toma la foto de «antes» con la cámara en vivo (empieza
// el tiempo, que cuenta el SERVIDOR) y al terminar toma la de «después». Solo puede ver las últimas limpiezas de ESE activo (solo lectura). La base de registros (con usuario) es Operaciones > Limpieza.
const CLEANING_TABLE_KEY = 'limpieza';
const CLEANING_SCREEN_LABEL = 'Limpieza';
const CLEANING_PHOTO_MAX_BYTES = 450 * 1024;
const CLEANING_SPACE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const publicCleaningLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests.' } });
const sqlUtcIso = (s) => (s ? `${String(s).replace(' ', 'T')}Z` : null);
// El activo (activo) de un Layout por su código público: con su huella, su zona y su localizador (Z006.H003.A003).
function cleaningTarget(token, spaceId) {
    if (!CLEANING_SPACE_ID_RE.test(String(spaceId || ''))) return null;
    const row = getLayoutByPublicToken(token);
    if (!row) return null;
    const layout = row.layout;
    const space = (layout.spaces || []).find((s) => s.id === spaceId && s.active !== false);
    if (!space) return null;
    const footprint = (layout.footprints || []).find((f) => f.id === space.footprintId) || null;
    const zone = (layout.zones || []).find((z) => z.id === space.zoneId) || null;
    const locator = zone && footprint ? [zone.code, footprint.code, space.code].join('.') : '';
    return { row, space, footprint, zone, locator };
}
// La foto llega como data URL (jpeg, png o webp) ya reducida en el teléfono: se revisa el tipo, que los primeros bytes sean de una imagen de verdad y que no pase de ~450 KB.
function parseCleaningPhoto(raw) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(typeof raw === 'string' ? raw : '');
    if (!m) return null;
    const data = Buffer.from(m[2], 'base64');
    if (!data.length || data.length > CLEANING_PHOTO_MAX_BYTES) return null;
    const ok = (m[1] === 'image/jpeg' && data[0] === 0xff && data[1] === 0xd8) || (m[1] === 'image/png' && data[0] === 0x89 && data[1] === 0x50) || (m[1] === 'image/webp' && data.subarray(0, 4).toString() === 'RIFF');
    return ok ? { mime: m[1], data } : null;
}
// La miniatura que manda el teléfono junto a la foto (unos 160 px): opcional y chica (hasta ~40 KB); si no es una imagen de verdad se ignora (no se rechaza la foto).
function parseThumb(raw) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(typeof raw === 'string' ? raw : '');
    if (!m) return null;
    const data = Buffer.from(m[2], 'base64');
    if (!data.length || data.length > 40 * 1024) return null;
    const ok = (m[1] === 'image/jpeg' && data[0] === 0xff && data[1] === 0xd8) || (m[1] === 'image/png' && data[0] === 0x89 && data[1] === 0x50) || (m[1] === 'image/webp' && data.subarray(0, 4).toString() === 'RIFF');
    return ok ? { mime: m[1], data } : null;
}
// Con ?thumb=1 se manda la miniatura de esa foto (si la tiene); si no, la foto completa.
const cleaningPhotoFor = (id, req) => (req.query.thumb === '1' && getCleaningPhoto(id, `${req.params.kind}_thumb`)) || getCleaningPhoto(id, req.params.kind);
// Candados de los QR públicos: lo que ve y puede hacer quien escanea SIN sesión. Hay una configuración por TIPO de QR y por centro de costos (se cambia en Layout > QR y descarga, con el icono Candados de los QR).
// Cada tipo de QR declara aquí sus candados y su valor de fábrica (todo abierto: así nada cambia hasta que alguien cierra un candado). Para un QR nuevo se agrega su tipo aquí y se hace cumplir en sus rutas
// públicas con qrLocksOf: los candados se aplican EN EL SERVIDOR (no solo se esconden en la página).
//   records = ver los registros anteriores · photos = ver sus fotos · names = ver el nombre de quien los hizo · limit = cuántos registros se ven · register = poder registrar con ese QR · range = ver el rango y las alertas.
const QR_LOCK_TYPES = {
    cleaning: { records: true, photos: true, names: true, limit: 20, register: true },
    temperature: { records: true, photos: true, names: true, limit: 20, register: true, range: true },
    // El QR del Layout, el de una Zona y el de una Categoría abren la MISMA página, así que comparten un solo juego de candados (si cada uno tuviera los suyos bastaría cambiar el final de la dirección para saltárselos).
    //   codes = buscar códigos (SKU, descripción, categoría) · classifications = ver las clasificaciones y sus artículos · photos = ver las fotos de los artículos · where = ver dónde está cada código
    //   metrics = ver los datos métricos (m², volumen) · doors = ver puertas y conexiones de luz · counts = ver cuántos códigos hay por zona y por clasificación · positions = ver los niveles, espacios y posiciones de cada activo.
    layout: { codes: true, classifications: true, photos: true, where: true, metrics: true, doors: true, counts: true, positions: true },
    // La Ficha de un código (Ficha.html) es de la EMPRESA, no de un centro de costos: su juego de candados vale para todos los centros (se guarda con centro 0).
    //   photos = ver las fotos del artículo · measures = ver medidas y pesos · where = ver dónde está (ruta y Localizador). El nombre de la empresa, la descripción, la unidad y el tipo de artículo siempre se ven.
    ficha: { photos: true, measures: true, where: true },
    // El QR de un SENSOR del Layout (/s/…): como el de Limpieza, sin rango ni alertas (los sensores no llevan rango).
    sensor: { records: true, photos: true, names: true, limit: 20, register: true },
    // El QR de un ELEMENTO DE SEGURIDAD (/g/…): ver las revisiones anteriores, sus fotos, quién las hizo y sus notas, poder registrar una revisión, y ver las fechas del elemento (caducidad, próxima revisión y su estado).
    safety: { records: true, photos: true, names: true, notes: true, limit: 20, register: true, dates: true },
    // El QR de PEDIDO MANUAL (/pm/…): register = poder enviar un pedido con ese QR · signin = pedir inicio de sesión para enviarlo (el nombre sale de la cuenta en vez de escribirse). De fábrica abierto: sin sesión y con nombre escrito.
    manual_order: { register: true, signin: false },
    // El QR de INCIDENTES (/inc/…): register = poder reportar con ese QR · signin = pedir inicio de sesión para reportar (el nombre sale de la cuenta en vez de escribirse). De fábrica abierto.
    incident: { register: true, signin: false },
};
const QR_LOCK_LIMITS = [3, 10, 20];
function qrLocksOf(type, clientId, costCenterId) {
    const defaults = QR_LOCK_TYPES[type];
    if (!defaults) return {};
    const raw = getQrLocksRaw(clientId, costCenterId || 0, type);
    const out = { ...defaults };
    Object.keys(defaults).forEach((key) => {
        if (key === 'limit') { if (QR_LOCK_LIMITS.includes(raw.limit)) out.limit = raw.limit; } else if (typeof raw[key] === 'boolean') out[key] = raw[key];
    });
    return out;
}
// Lo que llega al guardar: solo los candados del tipo, con su tipo de valor; null si algo no es válido.
function sanitizeQrLocks(type, body) {
    const defaults = QR_LOCK_TYPES[type];
    if (!defaults || !body || typeof body !== 'object') return null;
    const out = {};
    for (const key of Object.keys(defaults)) {
        const v = body[key];
        if (key === 'limit') { if (!QR_LOCK_LIMITS.includes(v)) return null; out.limit = v; } else { if (typeof v !== 'boolean') return null; out[key] = v; }
    }
    return out;
}
// La página pública del Layout con sus candados: sin puertas ni luz (doors), sin las cifras métricas (metrics) ni cuántos códigos hay por zona (counts) cuando están cerrados. El tipo de cada zona se queda
// (la lista de Distribución lo usa). Los candados viajan en la respuesta para que la página sepa qué botones no dibujar. La vista con usuario (QR y descarga) NO pasa por aquí: ve todo.
function lockedLayoutPayload(payload, locks) {
    const out = { ...payload, locks };
    if (!locks.doors) out.layout = { ...payload.layout, doors: [], power: [] };
    if (!locks.positions) out.layout = { ...(out.layout || payload.layout), positions: [] };
    if (!locks.metrics) out.kpis = { zones: ((payload.kpis && payload.kpis.zones) || []).map((z) => ({ id: z.id, name: z.name, type: z.type })) };
    if (!locks.counts) out.zoneCodes = {};
    return out;
}
const layoutLockedReply = (res) => res.status(403).json({ message: 'Este QR no muestra esta parte.', code: 'LOCKED' });
// Un registro tal como lo ve quien escanea, con los candados: sin nombre (names) ni fotos (photos) cuando están cerrados.
function lockedCleaningRecord(r, locks) {
    const out = publicCleaningRecord(r);
    if (!locks.names) out.name = '';
    if (!locks.photos) { out.hasBefore = false; out.hasAfter = false; }
    return out;
}
const publicCleaningRecord = (r) => ({ id: r.id, name: r.person_name, startedAt: sqlUtcIso(r.started_at), finishedAt: sqlUtcIso(r.finished_at), seconds: r.seconds, hasBefore: !!r.has_before, hasAfter: !!r.has_after });
app.get('/l/:token/:spaceId', publicLayoutLimiter, (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(self)' });
    res.sendFile(path.join(PUBLIC_DIR, 'LimpiezaPublica.html'));
});
app.get('/api/public/cleaning/:token/:spaceId', publicLayoutLimiter, (req, res) => {
    const target = cleaningTarget(req.params.token, req.params.spaceId);
    if (!target) return res.status(404).json({ message: 'Not found.' });
    const { row, space, footprint, zone, locator } = target;
    const client = getClientById(row.clientId);
    const locks = qrLocksOf('cleaning', row.clientId, row.costCenterId || 0);
    const records = locks.records ? listCleaningRecords(row.clientId, { costCenterId: row.costCenterId || 0, spaceId: space.id, limit: locks.limit }) : [];
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.json({
        companyName: (client && client.company_name) || '', siteName: row.layout.siteName || '', ...publicBrand(row.clientId),
        space: { id: space.id, code: space.code, type: space.type, locator, zoneName: zone ? zone.name : '', footprintCode: footprint ? footprint.code : '' },
        records: records.map((r) => lockedCleaningRecord(r, locks)), locks, now: new Date().toISOString(),
    });
});
app.post('/api/public/cleaning/:token/:spaceId/start', publicCleaningLimiter, (req, res) => {
    const target = cleaningTarget(req.params.token, req.params.spaceId);
    if (!target) return res.status(404).json({ message: 'Not found.' });
    const personName = String((req.body && req.body.name) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!qrLocksOf('cleaning', target.row.clientId, target.row.costCenterId || 0).register) return res.status(403).json({ message: 'Este QR solo sirve para consultar.', code: 'LOCKED' });
    if (!personName) return res.status(400).json({ message: 'Falta el nombre de quien limpia.', code: 'NAME' });
    const photo = parseCleaningPhoto(req.body && req.body.photo);
    if (!photo) return res.status(400).json({ message: 'La foto no es válida o es demasiado grande.', code: 'PHOTO' });
    const { row, space, footprint, zone, locator } = target;
    const started = startCleaningRecord({ clientId: row.clientId, costCenterId: row.costCenterId || 0, spaceId: space.id, spaceCode: space.code, spaceType: space.type, zoneName: zone ? zone.name : '', footprintCode: footprint ? footprint.code : '', locator, personName, photo, thumb: parseThumb(req.body && req.body.thumb) });
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ id: started.id, key: started.key, startedAt: sqlUtcIso(started.startedAt), now: new Date().toISOString() });
});
app.post('/api/public/cleaning/:token/:spaceId/finish', publicCleaningLimiter, (req, res) => {
    const target = cleaningTarget(req.params.token, req.params.spaceId);
    if (!target) return res.status(404).json({ message: 'Not found.' });
    const id = Number(req.body && req.body.id);
    const key = String((req.body && req.body.key) || '');
    const photo = parseCleaningPhoto(req.body && req.body.photo);
    if (!Number.isInteger(id) || id < 1 || !/^[0-9a-f]{32}$/.test(key)) return res.status(400).json({ message: 'Datos no válidos.' });
    if (!photo) return res.status(400).json({ message: 'La foto no es válida o es demasiado grande.', code: 'PHOTO' });
    const done = finishCleaningRecord({ clientId: target.row.clientId, costCenterId: target.row.costCenterId || 0, spaceId: target.space.id, id, key, photo, thumb: parseThumb(req.body && req.body.thumb) });
    if (done.error === 'notfound' || done.error === 'key') return res.status(404).json({ message: 'Not found.' });
    if (done.error === 'done') return res.status(409).json({ message: 'Esa limpieza ya se terminó.', code: 'DONE' });
    res.set('Cache-Control', 'no-store');
    res.json(publicCleaningRecord(done.record));
});
app.get('/api/public/cleaning/:token/:spaceId/photo/:id/:kind', publicLayoutLimiter, (req, res) => {
    const target = cleaningTarget(req.params.token, req.params.spaceId);
    const id = Number(req.params.id);
    if (!target || !Number.isInteger(id) || !['before', 'after'].includes(req.params.kind)) return res.status(404).end();
    const rec = getCleaningRecord(id, target.row.clientId);
    if (!rec || rec.space_id !== target.space.id || rec.cost_center_id !== (target.row.costCenterId || 0)) return res.status(404).end();
    if (!qrLocksOf(req.path.includes('/public/cleaning/') ? 'cleaning' : 'temperature', target.row.clientId, target.row.costCenterId || 0).photos) return res.status(404).end();
    const photo = cleaningPhotoFor(id, req);
    if (!photo) return res.status(404).end();
    res.set({ 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' });
    res.send(photo.data);
});
// La base de registros (Operaciones > Limpieza, con usuario): TODAS las limpiezas de todos los activos y centros de costos del cliente, con las columnas de Control Interno por fila.
// Una limpieza tal como la ve la base de registros (lista y corrección usan lo mismo). editedAt / editedBy: la última corrección (vacío si nunca se corrigió).
function cleaningRowOf(r, centers, client) {
    const cc = centers.get(r.cost_center_id);
    return {
        id: r.id, cc: r.cost_center_id, centroCostos: cc ? cc.name : '', company: client ? client.company_name : '',
        zoneName: r.zone_name, footprintCode: r.footprint_code, spaceCode: r.space_code, spaceType: r.space_type, locator: r.locator,
        name: r.person_name, startedAt: sqlUtcIso(r.started_at), finishedAt: sqlUtcIso(r.finished_at), seconds: r.seconds, hasBefore: !!r.has_before, hasAfter: !!r.has_after, source: r.source,
        spaceId: r.space_id, receivedAt: sqlUtcIso(r.received_at), finishReceivedAt: sqlUtcIso(r.finish_received_at),
        editedAt: sqlUtcIso(r.edited_at), editedBy: r.edited_by || '',
        system: getSystemColumnsForRecord({ companyName: client ? client.company_name : '', area: CODE_RELATION_AREA_LABEL, modulo: CODE_RELATION_MODULE_LABEL, pantalla: CLEANING_SCREEN_LABEL, centroCostos: cc ? cc.name : '', createdAt: r.started_at }),
    };
}
// Qué columnas puede corregir quien ve la pantalla: el administrador del cliente todas; los demás, las que tengan en el nivel Modificar (editar) del árbol. columns = [[llave del campo, columna del árbol]].
function editableColumnsOf(req, tableKey, columns) {
    if (req.user.isClientAdmin) return Object.fromEntries(columns.map(([key]) => [key, true]));
    const grants = getUserEffectiveGrants(req.user.sub);
    return Object.fromEntries(columns.map(([key, colKey]) => [key, getColumnGrantLevel(grants, tableKey, colKey) === 'editar']));
}
// Revisa lo que llega para corregir un registro y lo deja listo (solo los campos permitidos, ya limpios); si algo no es válido devuelve { error, code } y no se toca nada.
// existing: el registro tal como está (un dato que no trae, p. ej. la humedad de una lectura de antes, no se puede agregar al corregir).
function prepareRecordEdit(body, existing, allowed) {
    const src = body && typeof body === 'object' ? body : {};
    const has = (key) => allowed.includes(key) && Object.prototype.hasOwnProperty.call(src, key);
    const patch = {};
    if (has('name')) {
        const name = String(src.name === null || src.name === undefined ? '' : src.name).replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!name) return { error: 'Falta el nombre de quien lo hizo.', code: 'NAME' };
        patch.name = name;
    }
    if (has('temperature')) {
        if (existing.temperature === null || existing.temperature === undefined) return { error: 'Esta lectura no lleva temperatura.', code: 'NOTEMP' };
        if (typeof src.temperature !== 'number' || !Number.isFinite(src.temperature) || src.temperature < TEMPERATURE_MIN || src.temperature > TEMPERATURE_MAX) return { error: 'La temperatura no es válida.', code: 'TEMP' };
        patch.temperature = Math.round(src.temperature * 10) / 10;
    }
    if (has('humidity')) {
        if (existing.humidity === null || existing.humidity === undefined) return { error: 'Esta lectura no lleva humedad.', code: 'NOHUM' };
        if (typeof src.humidity !== 'number' || !Number.isFinite(src.humidity) || src.humidity < 0 || src.humidity > 100) return { error: 'La humedad no es válida.', code: 'HUM' };
        patch.humidity = Math.round(src.humidity * 10) / 10;
    }
    if (!Object.keys(patch).length) return { error: 'No hay nada que corregir.', code: 'EMPTY' };
    return { patch };
}
// Para comparar con lo nuevo, los números del registro van como texto: así un 0 °C de verdad cuenta como dato que ya estaba (y se corrige por la vía de autorización) y no como un campo vacío.
const recordForDiff = (rec) => ({ ...rec, temperature: rec.temperature === null || rec.temperature === undefined ? rec.temperature : String(rec.temperature), humidity: rec.humidity === null || rec.humidity === undefined ? rec.humidity : String(rec.humidity) });
app.get('/api/business/cleanings', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const client = getClientById(clientId);
    const centers = new Map(listCostCenters(clientId, isTestAccount).map((c) => [c.id, c]));
    const lite = req.query.lite === '1'; // la App: solo las 300 más recientes (más las que esta cuenta tiene en curso) y sin las columnas de Control Interno
    const LIMIT = lite ? 300 : 5000;
    let rows = listCleaningRecords(clientId, { limit: LIMIT });
    if (lite) { const have = new Set(rows.map((r) => r.id)); rows = rows.concat(listOpenCleaningsOf(clientId, req.user.sub).filter((r) => !have.has(r.id))); }
    res.set('Cache-Control', 'no-store');
    res.json({
        truncated: rows.length >= LIMIT, max: LIMIT, canDelete: !!req.user.isClientAdmin || canDeleteColumn(getUserEffectiveGrants(req.user.sub), CLEANING_TABLE_KEY, 'colLimDeleteAuth'),
        editable: editableColumnsOf(req, CLEANING_TABLE_KEY, [['name', 'colLimQuien']]),
        cleanings: rows.map((r) => {
            const o = cleaningRowOf(r, centers, client);
            if (!lite) return o;
            delete o.system;
            o.mine = r.reporter_user_id === req.user.sub;
            o.clientRef = o.mine ? (r.client_ref || '') : '';
            return o;
        }),
    });
});
// Corregir quién hizo una limpieza: pasa por la misma tubería de cambios de toda la plataforma (checkAndLogFieldChanges): el administrador del cliente lo aplica directo; quien tiene Modificar en esa columna lo manda a
// autorizar; los demás reciben el aviso de que no están habilitados. Queda en el historial de cambios (con el valor de antes) y el registro se marca como corregido.
app.patch('/api/business/cleanings/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const id = Number(req.params.id);
    const rec = Number.isInteger(id) ? getCleaningRecord(id, req.user.clientId) : null;
    if (!rec) return res.status(404).json({ message: 'Ese registro no existe.' });
    const prepared = prepareRecordEdit(req.body, rec, ['name']);
    if (prepared.error) return res.status(400).json({ message: prepared.error, code: prepared.code });
    const { appliedPatch, pendingFields, rejectedFields } = checkAndLogFieldChanges(req, recordForDiff(rec), prepared.patch, CLEANING_PATCHABLE_FIELDS, CLEANING_TABLE_KEY, `Limpieza ${rec.space_code} · LIM-${rec.id}`);
    const updated = updateCleaningRecord(id, req.user.clientId, appliedPatch, { editedBy: changedByLabel(req) });
    const centers = new Map(listCostCenters(req.user.clientId, req.user.isTestAccount).map((c) => [c.id, c]));
    res.json({ cleaning: cleaningRowOf(updated, centers, getClientById(req.user.clientId)), pendingFields, rejectedFields });
});
// La App (con sesión): las OPCIONES para limpiar (los activos activos del Layout de cada centro de costos y la última limpieza de cada uno: el celular los guarda para trabajar sin señal), empezar una limpieza (nombre, foto de
// antes) y terminarla (foto de después). El inicio lleva la clave que le pone el celular (clientRef): el fin la referencia por esa clave aunque el inicio todavía no se haya enviado, así que los dos van en la cola sin señal y se
// aplican en orden. Si se hicieron sin señal el celular manda la hora (clientAt: solo vale si es de más de 30 segundos antes y hasta 7 días antes de ahora) y la del servidor queda aparte como hora recibida.
// minAgeMs: cuánto más vieja que «ahora» tiene que ser para contar como hecha sin señal (Limpieza mide una DURACIÓN, así que solo deja pasar lo que tarda en subir una foto: 30 s).
function appClientTime(raw, minAgeMs = 120000) {
    const t = typeof raw === 'string' ? Date.parse(raw) : NaN;
    return Number.isFinite(t) && t >= Date.now() - 7 * 86400000 && t < Date.now() - minAgeMs ? new Date(t).toISOString().slice(0, 19).replace('T', ' ') : null;
}
const cleaningLocatorOf = (layout, space) => {
    const footprint = (layout.footprints || []).find((f) => f.id === space.footprintId) || null;
    const zone = (layout.zones || []).find((z) => z.id === space.zoneId) || null;
    return { footprint, zone, locator: zone && footprint ? [zone.code, footprint.code, space.code].join('.') : '' };
};
app.get('/api/business/limpieza/options', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const centerIds = new Set(listCostCenters(clientId, !!isTestAccount).map((c) => c.id));
    const spacesByCenter = {};
    const lastByCenter = {};
    listClientLayouts(clientId).forEach((row) => {
        const cc = row.costCenterId || 0;
        if (!cc || !centerIds.has(cc)) return;
        spacesByCenter[cc] = (row.layout.spaces || []).filter((s) => s && s.active !== false && s.code && CLEANING_SPACE_ID_RE.test(String(s.id || ''))).map((s) => {
            const { footprint, zone, locator } = cleaningLocatorOf(row.layout, s);
            return { id: s.id, code: s.code, type: s.type || 'rack', locator, zoneName: zone ? zone.name : '', footprintCode: footprint ? footprint.code : '' };
        });
        lastByCenter[cc] = Object.fromEntries(Object.entries(getCleaningLast(clientId, cc)).map(([spaceId, v]) => [spaceId, { at: sqlUtcIso(v.at), finished: v.finished }]));
    });
    res.set('Cache-Control', 'no-store');
    res.json({ spacesByCenter, lastByCenter, at: new Date().toISOString() });
});
app.post('/api/business/limpieza/start', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    if (!center.id) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const clientRef = typeof body.clientRef === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.clientRef) ? body.clientRef : null;
    res.set('Cache-Control', 'no-store');
    const centers = new Map(listCostCenters(req.user.clientId, !!req.user.isTestAccount).map((c) => [c.id, c]));
    const client = getClientById(req.user.clientId);
    // la misma limpieza reenviada: se contesta la que ya existe
    const already = findCleaningByRef(req.user.clientId, req.user.sub, clientRef);
    if (already) return res.json({ record: cleaningRowOf(already, centers, client), duplicate: true });
    const typed = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const personName = typed || String(changedByLabel(req) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!personName) return res.status(400).json({ message: 'Falta el nombre de quien limpia.', code: 'NAME' });
    const layoutRow = getClientLayout(req.user.clientId, { costCenterId: center.id });
    const space = layoutRow && CLEANING_SPACE_ID_RE.test(String(body.spaceId || '')) ? (layoutRow.layout.spaces || []).find((s) => s.id === body.spaceId && s.active !== false) : null;
    if (!space) return res.status(400).json({ message: 'Ese activo ya no existe: elige otro.', code: 'SPACE' });
    const photo = parseCleaningPhoto(body.photo);
    if (!photo) return res.status(400).json({ message: 'La foto no es válida o es demasiado grande.', code: 'PHOTO' });
    const { footprint, zone, locator } = cleaningLocatorOf(layoutRow.layout, space);
    const startedAt = appClientTime(body.clientAt, 30000);
    const started = startCleaningRecord({
        clientId: req.user.clientId, costCenterId: center.id, spaceId: space.id, spaceCode: space.code, spaceType: space.type, zoneName: zone ? zone.name : '', footprintCode: footprint ? footprint.code : '', locator,
        personName, photo, thumb: parseThumb(body.thumb), source: 'app', userId: req.user.sub, clientRef, startedAt,
    });
    res.status(201).json({ record: cleaningRowOf(getCleaningRecord(started.id, req.user.clientId), centers, client), offline: !!startedAt });
});
app.post('/api/business/limpieza/finish', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const clientRef = typeof body.clientRef === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.clientRef) ? body.clientRef : null;
    const id = Number(body.id);
    if (!clientRef && !Number.isInteger(id)) return res.status(400).json({ message: 'Datos no válidos.', code: 'REF' });
    const photo = parseCleaningPhoto(body.photo);
    if (!photo) return res.status(400).json({ message: 'La foto no es válida o es demasiado grande.', code: 'PHOTO' });
    const finishedAt = appClientTime(body.clientAt, 30000);
    const done = finishCleaningFromApp({ clientId: req.user.clientId, userId: req.user.sub, id: Number.isInteger(id) ? id : undefined, clientRef, photo, thumb: parseThumb(body.thumb), finishedAt });
    res.set('Cache-Control', 'no-store');
    if (done.error === 'notfound') return res.status(404).json({ message: 'Esa limpieza no existe o no es tuya.', code: 'NOTFOUND' });
    const centers = new Map(listCostCenters(req.user.clientId, !!req.user.isTestAccount).map((c) => [c.id, c]));
    res.json({ record: cleaningRowOf(done.record, centers, getClientById(req.user.clientId)), ...(done.duplicate ? { duplicate: true } : { offline: !!finishedAt }) });
});
app.get('/api/business/cleanings/:id/photo/:kind', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).end();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !['before', 'after'].includes(req.params.kind) || !getCleaningRecord(id, req.user.clientId)) return res.status(404).end();
    const photo = cleaningPhotoFor(id, req);
    if (!photo) return res.status(404).end();
    res.set({ 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    res.send(photo.data);
});
// Eliminar una limpieza pide el permiso Eliminar de su columna en el árbol (el administrador del cliente no depende de hojas); queda el aviso del cambio.
app.delete('/api/business/cleanings/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const id = Number(req.params.id);
    const rec = Number.isInteger(id) ? getCleaningRecord(id, req.user.clientId) : null;
    if (!rec) return res.status(404).json({ message: 'Ese registro no existe.' });
    if (!req.user.isClientAdmin && !canDeleteColumn(getUserEffectiveGrants(req.user.sub), CLEANING_TABLE_KEY, 'colLimDeleteAuth')) return res.status(403).json({ message: 'No tienes permiso para eliminar registros de limpieza.' });
    deleteCleaningRecord(id, req.user.clientId);
    try { notifyDataChange({ clientId: req.user.clientId, tableKey: CLEANING_TABLE_KEY, recordLabel: `Limpieza ${rec.space_code}`, fieldKey: 'colLimDeleteAuth', oldValue: `${rec.person_name} (${rec.started_at} UTC)`, newValue: 'Eliminado', actorUserId: req.user.sub, actorLabel: changedByLabel(req) }); } catch (err) { console.error('cleaning delete notice failed', err); }
    res.json({ ok: true });
});
// --- Pedido Manual (Operaciones > C. Distribución) ---------------------------------------------------------------------------------------------------
// Cada centro de costos tiene su QR: la dirección fija /pm/<código aleatorio del Layout del centro> (el mismo código de los demás QR del centro). Quien lo escanea busca el artículo (código, descripción, unidad de medida o categoría),
// pone la cantidad y envía; todo llega a la pantalla Pedido Manual con quién lo pidió y la hora (la pone el SERVIDOR, en UTC). Sin sesión, quien escanea escribe su nombre; con el candado «Pedir inicio de sesión» cerrado,
// solo envía quien tiene sesión de esa empresa y su nombre sale de la cuenta. Los candados se hacen cumplir aquí, en el servidor.
const MANUAL_ORDER_TABLE_KEY = 'pedido-manual';
const MANUAL_ORDER_SCREEN_LABEL = 'Pedido Manual';
const MANUAL_ORDER_MAX_LINES = 40;
const MANUAL_ORDER_MAX_DAYS = 14; // para cuándo: desde mañana y hasta 14 días (o «lo antes posible»)
const MANUAL_ORDER_SEARCH_FIELDS = ['code', 'desc', 'uom', 'cat'];
const MANUAL_ORDER_STATUS_LABELS = { pending: 'Pendiente', supplied: 'Surtido' };
const publicManualOrderLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests.' } });
const publicManualSearchLimiter = rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests.' } }); // más alto: se pide al ir escribiendo
const manualFolio = (orderId) => `PM-${String(orderId).padStart(4, '0')}`;
// La sesión, si la hay (las rutas públicas no la piden): la misma revisión de requireAuth, pero sin contestar error.
function optionalSessionUser(req) {
    const token = req.cookies?.sgn_session || (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return null;
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.iat && payload.iat < getSessionsValidAfter()) return null;
        const session = getSessionState(payload.sub);
        if (session.reason) return null;
        return { ...payload, ...session.fresh };
    } catch { return null; }
}
// Las presentaciones en que se puede pedir cada código (Presentaciones de Distribución): Map(id del código -> [{ id, name, pieces }]). Salen todas las presentaciones del código (el material principal NO va aquí: es la
// «unidad suelta», que siempre se puede pedir) menos las marcas, que solo agrupan y se ven en el nombre de las suyas («Caja con 20 Sobres · Genérico»). pieces = cuántas unidades principales trae UNA de la presentación.
// Sin filtrar por «Envíos a»: todas las del código. Un código sin presentaciones no aparece y se pide como siempre.
function manualPacksFor(clientId, isTest) {
    const bySku = new Map();
    listSkuDistribution(clientId, isTest).forEach((r) => { if (!bySku.has(r.sku_item_id)) bySku.set(r.sku_item_id, []); bySku.get(r.sku_item_id).push(r); });
    const out = new Map();
    bySku.forEach((rows, skuId) => {
        const packs = skuDistTree(rows).filter((n) => !n.isBrand && n.row.level >= 1 && n.name)
            .map((n) => ({ id: n.row.id, name: `${n.name}${n.brand && n.brand.name ? ` · ${n.brand.name}` : ''}`, pieces: n.equivalent }))
            .sort((a, z) => a.pieces - z.pieces || a.name.localeCompare(z.name)); // de la más chica a la más grande
        if (packs.length) out.set(skuId, packs);
    });
    return out;
}
const manualItemsCache = new Map(); // clientId:prueba -> { at, items }: unos segundos, para no leer todos los artículos en cada letra
// costCenterId > 0: solo los códigos relacionados con ese centro (Relación Código).
function manualItemsFor(clientId, isTest, costCenterId = 0, placeId = 0) {
    const key = `${clientId}:${isTest ? 1 : 0}:${costCenterId || 0}:${placeId || 0}`;
    const hit = manualItemsCache.get(key);
    if (hit && Date.now() - hit.at < 20000) return hit.items;
    const packsOf = manualPacksFor(clientId, isTest);
    const items = listManualOrderItems(clientId, isTest, costCenterId || 0, placeId || 0).map((r) => {
        const sku = padSku(r.record_number, r.sku_code);
        const cats = [r.category_inventario, r.category_compra, r.category_almacenamiento, r.category_rotacion, r.category_manejo, r.category_riesgo, r.category_vidautil].map((c) => String(c || '').trim()).filter(Boolean);
        return {
            id: r.id, code: r.upc || sku, description: r.custom_description || r.known_description || r.unique_description || '', unique: r.unique_description || '', uom: r.main_uom || '', categories: [...new Set(cats)].join(' · '), packs: packsOf.get(r.id) || [],
            by: { code: [r.upc, r.client_code, sku, String(r.record_number), padSku(r.record_number)].map(foldText), desc: [r.unique_description, r.known_description, r.custom_description].map(foldText), uom: [r.main_uom].map(foldText), cat: cats.map(foldText) },
        };
    });
    manualItemsCache.set(key, { at: Date.now(), items });
    if (manualItemsCache.size > 200) manualItemsCache.delete(manualItemsCache.keys().next().value);
    return items;
}
const manualAddDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Los renglones de un pedido a partir de lo que llega (artículos, cantidades y para cuándo): cada artículo debe existir en la empresa, las cantidades van de 0 a 999999 y los repetidos (mismo artículo y misma fecha) se suman.
// needBy = AAAA-MM-DD, desde mañana y hasta 14 días en la zona horaria del cliente; vacío (o «asap») = lo antes posible. Un artículo para dos fechas son dos renglones. { lines } o { error }.
// refDate (opcional): el momento en que la persona armó el pedido (la App que mandó sin señal lo trae); «mañana» y los 14 días se cuentan desde ESE día y no desde el día en que el pedido llega al servidor.
function manualLinesFrom(rawItems, clientId, isTest, costCenterId = 0, placeId = 0, refDate = undefined) {
    const raw = Array.isArray(rawItems) ? rawItems : [];
    if (!raw.length) return { error: { message: 'El pedido no trae artículos.', code: 'ITEMS' } };
    if (raw.length > MANUAL_ORDER_MAX_LINES) return { error: { message: `Un pedido lleva hasta ${MANUAL_ORDER_MAX_LINES} artículos.`, code: 'TOOMANY' } };
    const today = clientLocalDay(clientId, refDate);
    const minDay = manualAddDays(today, 1);
    const maxDay = manualAddDays(today, MANUAL_ORDER_MAX_DAYS);
    const wanted = new Map();
    const packOfItem = new Map(); // una presentación por artículo (vale para todos sus días): la del primer renglón de ese artículo
    for (const it of raw) {
        const id = Number(it && it.id);
        const quantity = Number(it && it.quantity);
        if (!Number.isInteger(id) || id < 1 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 999999) return { error: { message: 'Una cantidad no es válida.', code: 'QTY' } };
        if (!packOfItem.has(id)) { const pid = Math.round(Number(it && it.packId)); packOfItem.set(id, Number.isInteger(pid) && pid > 0 ? pid : 0); }
        let needBy = '';
        const rawBy = it && it.needBy;
        if (rawBy !== undefined && rawBy !== null && rawBy !== '' && rawBy !== 'asap') {
            needBy = String(rawBy);
            const real = /^\d{4}-\d{2}-\d{2}$/.test(needBy) && !Number.isNaN(Date.parse(`${needBy}T00:00:00Z`)) && new Date(`${needBy}T00:00:00Z`).toISOString().slice(0, 10) === needBy;
            if (!real || needBy < minDay || needBy > maxDay) return { error: { message: `La fecha no es válida: elige desde mañana y hasta ${MANUAL_ORDER_MAX_DAYS} días.`, code: 'DATE' } };
        }
        const key = `${id}|${needBy}`;
        const prev = wanted.get(key);
        wanted.set(key, { id, needBy, quantity: Math.round((((prev && prev.quantity) || 0) + quantity) * 1000) / 1000 });
    }
    const view = new Map(manualItemsFor(clientId, isTest, costCenterId, placeId).map((it) => [it.id, it]));
    const lines = [];
    for (const { id, needBy, quantity } of wanted.values()) {
        const it = view.get(id);
        if (!it) {
            // existe en la empresa pero ya no está relacionado con este centro de costos (o, en un pedido externo, ya no está habilitado para ese lugar)
            if ((costCenterId || placeId) && manualItemsFor(clientId, isTest).some((x) => x.id === id)) return { error: { message: placeId ? 'Un artículo no está habilitado para enviarse a ese lugar.' : 'Un artículo no está relacionado con este centro de costos.', code: 'RELATED' } };
            return { error: { message: 'Un artículo ya no existe.', code: 'ITEM' } };
        }
        // La presentación en que se pide (la cantidad es de ella): una de las del código o la unidad suelta (0). Un código sin presentaciones se pide como siempre (sin nombre de presentación).
        const packId = packOfItem.get(id) || 0;
        const pack = packId ? (it.packs || []).find((p) => p.id === packId) : null;
        if (packId && !pack) return { error: { message: 'Una presentación ya no existe o no es de ese artículo.', code: 'PACK' } };
        lines.push({ skuItemId: it.id, code: it.code, description: it.description, uom: it.uom, categories: it.categories, quantity, needBy, packId: pack ? pack.id : 0, packName: pack ? pack.name : ((it.packs || []).length ? it.uom : ''), packPieces: pack ? pack.pieces : 1 });
    }
    return { lines };
}
// El QR no tiene cuenta: el centro de costos y los artículos que ve son de UN carril (datos reales o de prueba), el del centro de costos del QR (su is_test_data); sin centro, el de la empresa.
function manualOrderTarget(req, res) {
    const row = getLayoutByPublicToken(req.params.token);
    if (!row) { res.status(404).json({ message: 'Not found.' }); return null; }
    const client = getClientById(row.clientId);
    const center = row.costCenterId ? getCostCenterAnyLane(row.costCenterId, row.clientId) : null;
    return { row, client, center, isTest: center ? !!center.is_test_data : !!(client && client.is_test) };
}
app.get('/pm/:token', publicLayoutLimiter, (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
    res.sendFile(path.join(PUBLIC_DIR, 'PedidoManualPublica.html'));
});
// «Lugar que solicita»: con lugares de envío activos en el catálogo, los códigos que se pueden pedir son los habilitados para ese lugar en Relación Código Envío (en el centro del QR) y hay que elegir el lugar para verlos; sin
// lugares, la lista de siempre (Relación Código con el centro). required = hay lugares; placeId = el lugar pedido si es uno de ellos (0 si no).
function manualPlaceScope(row, isTest, rawPlaceId) {
    const places = listArticleCategories(row.clientId, 'lugares-envio', isTest).filter((r) => r.status === 'active' && r.name);
    if (!places.length) return { required: false, placeId: 0, places };
    const wanted = Number(rawPlaceId);
    const place = places.find((p) => p.id === wanted) || null;
    return { required: true, placeId: place ? place.id : 0, places };
}
app.get('/api/public/pedido-manual/:token', publicLayoutLimiter, (req, res) => {
    const target = manualOrderTarget(req, res);
    if (!target) return;
    const { row, client, center, isTest } = target;
    const locks = qrLocksOf('manual_order', row.clientId, row.costCenterId || 0);
    const user = optionalSessionUser(req);
    const signedIn = !!user && Number(user.clientId) === Number(row.clientId);
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.json({
        companyName: (client && client.company_name) || '', siteName: row.layout.siteName || '', ...publicBrand(row.clientId),
        costCenter: center ? { id: center.id, name: center.name, code: center.code || '' } : null,
        locks, signedIn, userName: signedIn ? changedByLabel({ user }) : '', now: new Date().toISOString(),
        // para cuándo: el día de hoy en la zona del cliente y hasta cuántos días adelante se puede pedir (desde mañana)
        today: clientLocalDay(row.clientId), maxDays: MANUAL_ORDER_MAX_DAYS,
        // «Lugar que solicita»: los lugares de envío activos del catálogo (si no hay ninguno, el QR no lo pide)
        // y cuántos códigos tiene habilitados cada uno (si es 0, no hay nada que pedir para ese lugar)
        places: (() => { const counts = countShipItemsByPlace(row.clientId, isTest, row.costCenterId || 0); return listArticleCategories(row.clientId, 'lugares-envio', isTest).filter((r) => r.status === 'active' && r.name).map((r) => ({ id: r.id, name: r.name, count: counts.get(r.id) || 0 })); })(),
        relatedCount: manualItemsFor(row.clientId, isTest, row.costCenterId || 0).length,
    });
});
// Buscar artículos mientras se escribe: por código, descripción, unidad de medida o categoría (las siete listas); el mismo motor de búsqueda de todo el sistema (coma, $ y @).
app.get('/api/public/pedido-manual/:token/search', publicManualSearchLimiter, (req, res) => {
    const target = manualOrderTarget(req, res);
    if (!target) return;
    const { row, isTest } = target;
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    if (!qrLocksOf('manual_order', row.clientId, row.costCenterId || 0).register) return res.status(403).json({ message: 'Este QR solo sirve para consultar.', code: 'LOCKED' });
    const mode = PUBLIC_SEARCH_MODES.includes(req.query.mode) ? req.query.mode : 'contains';
    const query = publicSearchQuery(req.query.q);
    const asked = String(req.query.fields || '').split(',').map((f) => f.trim()).filter((f) => MANUAL_ORDER_SEARCH_FIELDS.includes(f));
    const fields = asked.length ? asked : MANUAL_ORDER_SEARCH_FIELDS;
    const scope = manualPlaceScope(row, isTest, req.query.placeId);
    if (scope.required && !scope.placeId) return res.json({ total: 0, items: [], needPlace: true });
    if (!SearchSyntax.ready(mode, query)) return res.json({ total: 0, items: [] });
    const matches = publicSearchMatcher(mode, query);
    const found = manualItemsFor(row.clientId, isTest, row.costCenterId || 0, scope.placeId).filter((it) => matches(fields.flatMap((k) => it.by[k])));
    res.json({ total: found.length, items: found.slice(0, 20).map(({ id, code, description, uom, categories, packs }) => ({ id, code, description, uom, categories, packs })) });
});
// La tabla por día del QR muestra DE INICIO toda la lista de códigos relacionados con el centro (con su descripción única) y los filtros de sus encabezados la acotan: por páginas (offset y límite de hasta 200), con el mismo motor de búsqueda
// (Contiene, Inicia con, Igual que, signos y «Buscar en»); sin buscar, o con una búsqueda todavía muy corta, trae todos.
app.get('/api/public/pedido-manual/:token/list', publicManualSearchLimiter, (req, res) => {
    const target = manualOrderTarget(req, res);
    if (!target) return;
    const { row, isTest } = target;
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    if (!qrLocksOf('manual_order', row.clientId, row.costCenterId || 0).register) return res.status(403).json({ message: 'Este QR solo sirve para consultar.', code: 'LOCKED' });
    const mode = PUBLIC_SEARCH_MODES.includes(req.query.mode) ? req.query.mode : 'contains';
    const query = publicSearchQuery(req.query.q);
    const asked = String(req.query.fields || '').split(',').map((f) => f.trim()).filter((f) => MANUAL_ORDER_SEARCH_FIELDS.includes(f));
    const fields = asked.length ? asked : MANUAL_ORDER_SEARCH_FIELDS;
    const scope = manualPlaceScope(row, isTest, req.query.placeId);
    if (scope.required && !scope.placeId) return res.json({ total: 0, offset: 0, items: [], needPlace: true });
    let found = manualItemsFor(row.clientId, isTest, row.costCenterId || 0, scope.placeId);
    if (query && SearchSyntax.ready(mode, query)) {
        const matches = publicSearchMatcher(mode, query);
        found = found.filter((it) => matches(fields.flatMap((k) => it.by[k])));
    }
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    res.json({ total: found.length, offset, items: found.slice(offset, offset + limit).map(({ id, code, description, unique, uom, categories, packs }) => ({ id, code, description: unique || description, uom, categories, packs })) });
});
app.post('/api/public/pedido-manual/:token/send', publicManualOrderLimiter, (req, res) => {
    const target = manualOrderTarget(req, res);
    if (!target) return;
    const { row, isTest } = target;
    const locks = qrLocksOf('manual_order', row.clientId, row.costCenterId || 0);
    if (!locks.register) return res.status(403).json({ message: 'Este QR solo sirve para consultar.', code: 'LOCKED' });
    const user = optionalSessionUser(req);
    const signedIn = !!user && Number(user.clientId) === Number(row.clientId);
    if (locks.signin && !signedIn) return res.status(401).json({ message: 'Este QR pide iniciar sesión.', code: 'LOGIN' });
    // Siempre se pide el nombre de quien pide (con sesión la página lo trae escrito con el de la cuenta, y se puede cambiar: quien manda no siempre es quien pide); la cuenta que envía queda registrada aparte.
    const typed = String((req.body && req.body.name) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const name = typed || (signedIn ? String(changedByLabel({ user }) || '').replace(/\s+/g, ' ').trim().slice(0, 60) : '');
    if (!name) return res.status(400).json({ message: 'Falta el nombre de quien pide.', code: 'NAME' });
    // Lugar que solicita: si el catálogo Lugares de Envío tiene lugares activos, el pedido tiene que traer uno de ellos
    const activePlaces = listArticleCategories(row.clientId, 'lugares-envio', isTest).filter((r) => r.status === 'active' && r.name);
    let place = null;
    if (activePlaces.length) {
        place = activePlaces.find((p) => p.id === Number(req.body && req.body.placeId)) || null;
        if (!place) return res.status(400).json({ message: 'Falta el lugar que solicita.', code: 'PLACE' });
    }
    const built = manualLinesFrom(req.body && req.body.items, row.clientId, isTest, row.costCenterId || 0, place ? place.id : 0);
    if (built.error) return res.status(400).json(built.error);
    const lines = built.lines;
    const out = createManualOrder({ clientId: row.clientId, costCenterId: row.costCenterId || 0, requesterName: name, requesterUserId: signedIn ? user.sub : null, source: signedIn ? 'user' : 'qr', lines, placeId: place ? place.id : 0, placeName: place ? place.name : '' });
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ folio: manualFolio(out.id), createdAt: sqlUtcIso(out.createdAt), lines: out.lines, name, place: place ? place.name : '', now: new Date().toISOString() });
});
// «Consultar un pedido» del QR: se escribe el número (PM-0005, pm-5 o solo 5) y sale qué se pidió y en qué va (Pendiente, Parcial o Surtido, y el de cada artículo). Solo lectura. Solo salen los pedidos del MISMO centro de
// costos del QR (los números son seguidos y de todo el sistema: otro centro nunca se ve) y el límite es más bajo que el de la búsqueda para que no se pueda recorrer número por número. Con el candado «Pedir inicio de sesión»
// cerrado también se pide la sesión; con «registrar» apagado (QR solo para consultar) sí se puede consultar, que es justo para lo que sirve ese QR.
const publicManualLookupLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests.', code: 'RATE' } });
app.get('/api/public/pedido-manual/:token/order', publicManualLookupLimiter, (req, res) => {
    const target = manualOrderTarget(req, res);
    if (!target) return;
    const { row } = target;
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    const locks = qrLocksOf('manual_order', row.clientId, row.costCenterId || 0);
    const user = optionalSessionUser(req);
    const signedIn = !!user && Number(user.clientId) === Number(row.clientId);
    if (locks.signin && !signedIn) return res.status(401).json({ message: 'Este QR pide iniciar sesión.', code: 'LOGIN' });
    const match = /^(?:PM[\s-]*)?0*(\d{1,9})$/i.exec(String(req.query.n || '').trim());
    const orderId = match ? Number(match[1]) : 0;
    if (!orderId) return res.status(400).json({ message: 'Escribe el número del pedido, por ejemplo PM-0005.', code: 'NUMBER' });
    const found = getManualOrderWithLines(row.clientId, orderId, row.costCenterId || 0);
    if (!found) return res.status(404).json({ message: 'No existe ese pedido en este centro de costos.', code: 'NOTFOUND', folio: manualFolio(orderId) });
    const { order, lines } = found;
    const supplied = lines.filter((l) => l.status === 'supplied').length;
    res.json({
        folio: manualFolio(order.id), createdAt: sqlUtcIso(order.created_at), name: order.requester_name || '', place: order.place_name || '',
        status: !lines.length || supplied === 0 ? 'pending' : (supplied === lines.length ? 'supplied' : 'partial'), supplied,
        lines: lines.map((l) => ({ lineNo: l.line_no, code: l.code, description: l.description, uom: l.uom, quantity: l.quantity, needBy: l.need_by || '', packName: l.pack_name || '', packPieces: l.pack_pieces > 0 ? l.pack_pieces : 1, status: l.status === 'supplied' ? 'supplied' : 'pending' })),
        now: new Date().toISOString(),
    });
});

// «Cerrar pedido…» del QR: la LISTA del pedido armado (o ya enviado, con su número) en PDF o Excel. Lo que sale en el archivo (código, descripción única, unidad, empresa, sitio, centro) se toma SIEMPRE del servidor a partir
// de los artículos pedidos (id): del celular solo llegan el formato, el idioma, el nombre de quien pide, el lugar, el número de pedido (PM-0005), una hora ya escrita, y los artículos con su cantidad y su fecha. No guarda nada.
const MANUAL_EXPORT_TEXT = {
    es: { locale: 'es-MX', title: 'Pedido Manual', draft: 'Borrador', order: 'Pedido', company: 'Empresa', site: 'Sitio', center: 'Centro de costos', by: 'Pidió', place: 'Lugar que solicita', at: 'Fecha y hora', summary: 'Resumen', item1: '1 artículo', items: '{n} artículos', line1: '1 renglón', lines: '{n} renglones', code: 'Código', description: 'Descripción', uom: 'UdM', needBy: 'Para cuándo', quantity: 'Cantidad', asap: 'Urgente', pack: 'Presentación', equiv: 'Equivale a', filePrefix: 'Pedido', fileDraft: 'borrador' },
    en: { locale: 'en-US', title: 'Manual Order', draft: 'Draft', order: 'Order', company: 'Company', site: 'Site', center: 'Cost center', by: 'Ordered by', place: 'Requesting place', at: 'Date and time', summary: 'Summary', item1: '1 item', items: '{n} items', line1: '1 line', lines: '{n} lines', code: 'Code', description: 'Description', uom: 'UoM', needBy: 'Needed by', quantity: 'Quantity', asap: 'Urgent', pack: 'Presentation', equiv: 'Equivalent to', filePrefix: 'Order', fileDraft: 'draft' },
};
app.post('/api/public/pedido-manual/:token/export', publicManualOrderLimiter, async (req, res) => {
    const target = manualOrderTarget(req, res);
    if (!target) return;
    const { row, client, center, isTest } = target;
    if (!qrLocksOf('manual_order', row.clientId, row.costCenterId || 0).register) return res.status(403).json({ message: 'Este QR solo sirve para consultar.', code: 'LOCKED' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const format = body.format === 'pdf' ? 'pdf' : (body.format === 'xlsx' ? 'xlsx' : '');
    if (!format) return res.status(400).json({ message: 'El formato debe ser pdf o xlsx.', code: 'FORMAT' });
    const L = MANUAL_EXPORT_TEXT[body.lang === 'en' ? 'en' : 'es'];
    const oneLine = (v, max) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
    const scope = manualPlaceScope(row, isTest, body.placeId);
    const place = scope.placeId ? scope.places.find((p) => p.id === scope.placeId) : null;
    const view = new Map(manualItemsFor(row.clientId, isTest, row.costCenterId || 0, scope.placeId).map((it) => [it.id, it]));
    const lines = [];
    for (const raw of (Array.isArray(body.items) ? body.items : []).slice(0, 400)) {
        const it = view.get(Number(raw && raw.id));
        const quantity = Number(raw && raw.quantity);
        if (!it || !Number.isFinite(quantity) || quantity <= 0 || quantity > 999999) continue;
        const rawBy = raw && raw.needBy ? String(raw.needBy) : '';
        const needBy = /^\d{4}-\d{2}-\d{2}$/.test(rawBy) && !Number.isNaN(Date.parse(`${rawBy}T00:00:00Z`)) ? rawBy : '';
        // la presentación sale del servidor (nombre y piezas), no de lo que mande el celular; una que ya no existe se trata como unidad suelta
        const packId = Math.round(Number(raw && raw.packId)) || 0;
        const pack = packId ? (it.packs || []).find((p) => p.id === packId) || null : null;
        lines.push({ it, needBy, quantity: Math.round(quantity * 1000) / 1000, pack });
    }
    if (!lines.length) return res.status(400).json({ message: 'El pedido no trae artículos.', code: 'ITEMS' });
    const folio = /^PM-\d{4,}$/.test(String(body.folio || '')) ? String(body.folio) : '';
    const dayText = (iso) => (iso ? new Intl.DateTimeFormat(L.locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`)) : L.asap);
    const itemsCount = new Set(lines.map((l) => l.it.id)).size;
    // El formato de la compañía (logo o iniciales, «Pedido Manual», sitio y empresa) va arriba, como en el QR: ya no se repiten el número, la empresa ni el sitio entre los datos.
    const brand = exportBrandFor(row.clientId, { kind: L.title, siteName: row.layout.siteName || '', docTitle: `${L.order} ${folio || L.draft}` });
    const header = [
        ...(brand ? [] : [[L.order, folio || L.draft], [L.company, (client && client.company_name) || ''], [L.site, row.layout.siteName || '']]), [L.center, center ? `${center.code ? `${center.code} · ` : ''}${center.name}` : ''],
        [L.by, oneLine(body.name, 60)], [L.place, place ? place.name : ''], [L.at, oneLine(body.when, 40)],
        [L.summary, `${itemsCount === 1 ? L.item1 : L.items.replace('{n}', itemsCount)} · ${lines.length === 1 ? L.line1 : L.lines.replace('{n}', lines.length)}`],
    ].filter(([, v]) => v);
    // Presentación y lo que equivale: solo se agregan si algún artículo del pedido tiene presentaciones (si ninguno, el archivo queda como siempre). La cantidad es de la presentación; «Equivale a» = cantidad × piezas de UNA presentación,
    // en la unidad principal del código. Un artículo sin presentaciones lleva «—» en Presentación y su misma cantidad.
    const withPacks = lines.some(({ it }) => (it.packs || []).length);
    const columns = [L.code, L.description, L.uom, L.needBy, ...(withPacks ? [L.pack] : []), L.quantity, ...(withPacks ? [L.equiv] : [])].map((label) => ({ label }));
    const rows = lines.map(({ it, needBy, quantity, pack }) => {
        const hasPacks = (it.packs || []).length > 0;
        const eq = quantity * (pack ? pack.pieces : 1);
        return [it.code, it.unique || it.description, it.uom, dayText(needBy), ...(withPacks ? [pack ? pack.name : (hasPacks ? it.uom : '—')] : []), String(quantity), ...(withPacks ? [`${Math.round(eq * 1000) / 1000}${it.uom ? ` ${it.uom}` : ''}`] : [])];
    });
    const fileBase = `${L.filePrefix}-${folio || L.fileDraft}_${clientLocalDay(row.clientId)}`;
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    try {
        const title = `${L.title} · ${folio || L.draft}`;
        if (format === 'xlsx') await sendXlsxExport(res, { title: `${L.filePrefix} ${folio || L.fileDraft}`, fileBase, header, columns, rows, brand });
        else sendPdfExport(res, { title, fileBase, header, columns, rows, wrap: true, widths: withPacks ? [1.2, 3, 0.6, 1.5, 1.8, 0.8, 1.3] : [1.3, 3.6, 0.7, 1.7, 0.9], brand });
    } catch (err) {
        console.error('Pedido Manual: no se pudo armar el archivo del pedido', err);
        if (!res.headersSent) res.status(500).json({ message: 'No se pudo preparar el archivo.' });
    }
});

// La pantalla (con usuario): TODOS los pedidos de la empresa, un renglón por artículo, con las columnas de Control Interno por fila.
function manualOrderRowOf(r, centers, client) {
    const cc = centers.get(r.cost_center_id);
    return {
        id: r.id, orderId: r.order_id, folio: manualFolio(r.order_id), lineNo: r.line_no, cc: r.cost_center_id, centroCostos: cc ? cc.name : '', company: client ? client.company_name : '',
        name: r.requester_name, placeId: r.place_id || 0, placeName: r.place_name || '', code: r.code, description: r.description, uom: r.uom, categories: r.categories, quantity: r.quantity, needBy: r.need_by || '', packId: r.pack_id || 0, packName: r.pack_name || '', packPieces: r.pack_pieces > 0 ? r.pack_pieces : 1,
        status: r.status, statusAt: sqlUtcIso(r.status_at), statusBy: r.status_by || '', requestedAt: sqlUtcIso(r.order_created_at), receivedAt: sqlUtcIso(r.order_received_at), source: r.source,
        editedAt: sqlUtcIso(r.edited_at), editedBy: r.edited_by || '',
        system: getSystemColumnsForRecord({ companyName: client ? client.company_name : '', area: CODE_RELATION_AREA_LABEL, modulo: CODE_RELATION_MODULE_LABEL, pantalla: MANUAL_ORDER_SCREEN_LABEL, centroCostos: cc ? cc.name : '', createdAt: r.order_created_at }),
    };
}
// Un botón de la pantalla (QR, candado, estatus) pide Ver y Operar en su columna del árbol; el administrador del cliente no depende de hojas.
const manualCan = (req, colKey) => !!req.user.isClientAdmin || canCreateColumn(getUserEffectiveGrants(req.user.sub), MANUAL_ORDER_TABLE_KEY, colKey);
const manualEditable = (req) => editableColumnsOf(req, MANUAL_ORDER_TABLE_KEY, [['name', 'colPmSolicitante'], ['quantity', 'colPmCantidad']]);
function prepareManualEdit(body, allowed) {
    const src = body && typeof body === 'object' ? body : {};
    const has = (key) => allowed.includes(key) && Object.prototype.hasOwnProperty.call(src, key);
    const patch = {};
    if (has('name')) {
        const name = String(src.name === null || src.name === undefined ? '' : src.name).replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!name) return { error: 'Falta el nombre de quien pidió.', code: 'NAME' };
        patch.name = name;
    }
    if (has('quantity')) {
        if (typeof src.quantity !== 'number' || !Number.isFinite(src.quantity) || src.quantity <= 0 || src.quantity > 999999) return { error: 'La cantidad no es válida.', code: 'QTY' };
        patch.quantity = Math.round(src.quantity * 1000) / 1000;
    }
    if (!Object.keys(patch).length) return { error: 'No hay nada que corregir.', code: 'EMPTY' };
    return { patch };
}
app.get('/api/business/pedido-manual', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const client = getClientById(clientId);
    const centers = new Map(listCostCenters(clientId, isTestAccount).map((c) => [c.id, c]));
    const lite = req.query.lite === '1'; // la App: solo los renglones más recientes y sin las columnas de Control Interno
    const LIMIT = lite ? 400 : 5000;
    const rows = listManualOrderLines(clientId, { limit: LIMIT });
    res.set('Cache-Control', 'no-store');
    res.json({
        truncated: rows.length >= LIMIT, max: LIMIT,
        canDelete: !!req.user.isClientAdmin || canDeleteColumn(getUserEffectiveGrants(req.user.sub), MANUAL_ORDER_TABLE_KEY, 'colPmDeleteAuth'),
        canQr: manualCan(req, 'colPmQr'), canLock: manualCan(req, 'colPmQrLock'), canStatus: manualCan(req, 'colPmEstatus'), canDownload: manualCan(req, 'colPmDescargar'),
        editable: manualEditable(req),
        orders: rows.map((r) => { const o = manualOrderRowOf(r, centers, client); if (lite) delete o.system; return o; }),
    });
});
// Corregir quién pidió o la cantidad: pasa por la misma tubería de cambios de toda la plataforma (checkAndLogFieldChanges), igual que Limpieza.
app.patch('/api/business/pedido-manual/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const id = Number(req.params.id);
    const rec = Number.isInteger(id) ? getManualOrderLine(id, req.user.clientId) : null;
    if (!rec) return res.status(404).json({ message: 'Ese registro no existe.' });
    const prepared = prepareManualEdit(req.body, ['name', 'quantity']);
    if (prepared.error) return res.status(400).json({ message: prepared.error, code: prepared.code });
    const { appliedPatch, pendingFields, rejectedFields } = checkAndLogFieldChanges(req, rec, prepared.patch, MANUAL_ORDER_PATCHABLE_FIELDS, MANUAL_ORDER_TABLE_KEY, `Pedido ${manualFolio(rec.order_id)} · ${rec.code}`);
    const updated = updateManualOrderLine(id, req.user.clientId, appliedPatch, { editedBy: changedByLabel(req) });
    const centers = new Map(listCostCenters(req.user.clientId, req.user.isTestAccount).map((c) => [c.id, c]));
    res.json({ order: manualOrderRowOf(updated, centers, getClientById(req.user.clientId)), pendingFields, rejectedFields });
});
// Cambiar el estatus de un renglón (Pendiente / Surtido): es una operación del día, no una corrección; pide Ver y Operar en la columna Estatus y queda en el historial de cambios.
app.post('/api/business/pedido-manual/:id/status', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const id = Number(req.params.id);
    const rec = Number.isInteger(id) ? getManualOrderLine(id, req.user.clientId) : null;
    if (!rec) return res.status(404).json({ message: 'Ese registro no existe.' });
    if (!manualCan(req, 'colPmEstatus')) return res.status(403).json({ message: 'No tienes permiso para cambiar el estatus.' });
    const status = String((req.body && req.body.status) || '');
    if (!MANUAL_ORDER_STATUSES.includes(status)) return res.status(400).json({ message: 'El estatus no es válido.', code: 'STATUS' });
    const centers = new Map(listCostCenters(req.user.clientId, req.user.isTestAccount).map((c) => [c.id, c]));
    if (status === rec.status) return res.json({ order: manualOrderRowOf(rec, centers, getClientById(req.user.clientId)) });
    const updated = setManualOrderLineStatus(id, req.user.clientId, status, changedByLabel(req));
    try {
        logTableChange({ clientId: req.user.clientId, tableKey: MANUAL_ORDER_TABLE_KEY, recordId: rec.id, recordLabel: `Pedido ${manualFolio(rec.order_id)} · ${rec.code}`, action: 'update', fieldKey: 'main.colPmEstatus', oldValue: MANUAL_ORDER_STATUS_LABELS[rec.status] || rec.status, newValue: MANUAL_ORDER_STATUS_LABELS[status], changedBy: changedByLabel(req) });
    } catch (err) { console.error('manual order status log failed', err); }
    res.json({ order: manualOrderRowOf(updated, centers, getClientById(req.user.clientId)) });
});
app.delete('/api/business/pedido-manual/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const id = Number(req.params.id);
    const rec = Number.isInteger(id) ? getManualOrderLine(id, req.user.clientId) : null;
    if (!rec) return res.status(404).json({ message: 'Ese registro no existe.' });
    if (!req.user.isClientAdmin && !canDeleteColumn(getUserEffectiveGrants(req.user.sub), MANUAL_ORDER_TABLE_KEY, 'colPmDeleteAuth')) return res.status(403).json({ message: 'No tienes permiso para eliminar registros de Pedido Manual.' });
    deleteManualOrderLine(id, req.user.clientId);
    try { notifyDataChange({ clientId: req.user.clientId, tableKey: MANUAL_ORDER_TABLE_KEY, recordLabel: `Pedido ${manualFolio(rec.order_id)}`, fieldKey: 'colPmDeleteAuth', oldValue: `${rec.code} × ${rec.quantity} (${rec.requester_name})`, newValue: 'Eliminado', actorUserId: req.user.sub, actorLabel: changedByLabel(req) }); } catch (err) { console.error('manual order delete notice failed', err); }
    res.json({ ok: true });
});
// La App: el catálogo de artículos (para buscar aun sin señal, el celular lo guarda) y crear un pedido con sesión. El nombre sale de la cuenta (source 'app'); si el pedido se mandó sin señal y llega después, la App manda la
// hora del celular al enviarlo (clientAt: solo vale si es de más de 2 minutos antes y hasta 7 días antes de ahora) y esa queda como hora del pedido; la del servidor se guarda aparte como hora recibida.
app.get('/api/business/pedido-manual/items', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const centersOf = new Map();
    listManualItemCenters(req.user.clientId, !!req.user.isTestAccount).forEach((r) => { if (!centersOf.has(r.sku_item_id)) centersOf.set(r.sku_item_id, []); centersOf.get(r.sku_item_id).push(r.cost_center_id); });
    // «Lugar que solicita»: si el catálogo Lugares de Envío tiene lugares activos, la App pide el lugar y cada código trae a qué lugares se puede enviar desde cada centro: ship = [[centro, lugar], …] (Relación Código Envío)
    const places = listArticleCategories(req.user.clientId, 'lugares-envio', !!req.user.isTestAccount).filter((r) => r.status === 'active' && r.name).map((r) => ({ id: r.id, name: r.name }));
    const activePlaceIds = new Set(places.map((p) => p.id));
    const shipOf = new Map();
    if (places.length) listManualItemShips(req.user.clientId, !!req.user.isTestAccount).forEach((r) => { if (!activePlaceIds.has(r.place_id)) return; if (!shipOf.has(r.sku_item_id)) shipOf.set(r.sku_item_id, []); shipOf.get(r.sku_item_id).push([r.cost_center_id, r.place_id]); });
    const items = manualItemsFor(req.user.clientId, !!req.user.isTestAccount).map(({ id, code, description, unique, uom, categories, packs }) => ({ id, code, description, unique, uom, categories, packs, centers: centersOf.get(id) || [], ...(places.length ? { ship: shipOf.get(id) || [] } : {}) }));
    res.set('Cache-Control', 'no-store');
    // today / maxDays: «para cuándo» (desde mañana, hasta 14 días) se cuenta con el día de la empresa; la App lo guarda para ofrecer las fechas también sin señal
    res.json({ items, places, today: clientLocalDay(req.user.clientId), maxDays: MANUAL_ORDER_MAX_DAYS, at: new Date().toISOString() });
});
app.post('/api/business/pedido-manual/orders', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    if (!center.id) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    // Lugar que solicita: igual que en el QR, con lugares de envío activos en el catálogo el pedido tiene que traer uno y sus códigos son los habilitados para ese lugar desde este centro (Relación Código Envío)
    const activePlaces = listArticleCategories(req.user.clientId, 'lugares-envio', !!req.user.isTestAccount).filter((r) => r.status === 'active' && r.name);
    let place = null;
    if (activePlaces.length) {
        place = activePlaces.find((p) => p.id === Number(req.body && req.body.placeId)) || null;
        if (!place) return res.status(400).json({ message: 'Falta el lugar que solicita.', code: 'PLACE' });
    }
    const clientRef = req.body && typeof req.body.clientRef === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(req.body.clientRef) ? req.body.clientRef : null;
    res.set('Cache-Control', 'no-store');
    // el mismo pedido reenviado (la respuesta se perdió y la App lo volvió a mandar): se contesta el que ya existe
    const already = findManualOrderByRef(req.user.clientId, req.user.sub, clientRef);
    if (already) return res.json({ folio: manualFolio(already.id), orderId: already.id, createdAt: sqlUtcIso(already.createdAt), lines: already.lines, offline: !!already.receivedAt, duplicate: true });
    // Hora del pedido: la del celular al enviarlo solo si llegó tarde (más de 2 minutos antes de ahora, hasta 7 días); un pedido que llega al instante queda con la hora del servidor.
    let createdAt = null;
    const clientAt = req.body && typeof req.body.clientAt === 'string' ? Date.parse(req.body.clientAt) : NaN;
    if (Number.isFinite(clientAt) && clientAt >= Date.now() - 7 * 86400000 && clientAt < Date.now() - 120000) createdAt = new Date(clientAt).toISOString().slice(0, 19).replace('T', ' ');
    // «Para cuándo» se cuenta desde el día en que se armó el pedido (el del celular si se mandó sin señal), no desde el día en que llega: un pedido hecho ayer sin señal para «mañana» sigue siendo válido al reconectar.
    const built = manualLinesFrom(req.body && req.body.items, req.user.clientId, !!req.user.isTestAccount, center.id, place ? place.id : 0, createdAt ? new Date(clientAt) : undefined);
    if (built.error) return res.status(400).json(built.error);
    // El nombre de quien pide lo escribe la persona (la App lo trae escrito con el de la cuenta y se puede cambiar); si no llega, el de la cuenta.
    const typed = String((req.body && req.body.requesterName) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const requesterName = typed || String(changedByLabel(req) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const out = createManualOrder({ clientId: req.user.clientId, costCenterId: center.id, requesterName, requesterUserId: req.user.sub, source: 'app', lines: built.lines, createdAt, clientRef, placeId: place ? place.id : 0, placeName: place ? place.name : '' });
    res.status(201).json({ folio: manualFolio(out.id), orderId: out.id, createdAt: sqlUtcIso(out.createdAt), lines: out.lines, offline: !!createdAt, place: place ? place.name : '' });
});
// El QR del centro de costos que se eligió: la dirección fija (/pm/…) y la cuadrícula del QR para dibujarlo; sale del Layout de ese centro (si todavía no hay uno guardado, no hay QR).
app.get('/api/business/pedido-manual/qr', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!manualCan(req, 'colPmQr')) return res.status(403).json({ message: 'No tienes permiso para usar el QR de Pedido Manual.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    if (!center.id) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    const token = ensureLayoutPublicToken(req.user.clientId, center.id);
    if (!token) return res.status(404).json({ message: 'Todavía no hay un Layout guardado en ese centro de costos: el QR sale de ahí.', code: 'NOLAYOUT' });
    const layoutRow = getClientLayout(req.user.clientId, { costCenterId: center.id });
    const url = `${req.protocol}://${req.get('host')}/pm/${token}`;
    const client = getClientById(req.user.clientId);
    res.set('Cache-Control', 'no-store');
    res.json({
        url, qrRows: layoutQrRows(url), costCenter: { id: center.costCenter.id, name: center.costCenter.name, code: center.costCenter.code || '' }, siteName: (layoutRow && layoutRow.layout.siteName) || '',
        companyName: (client && client.company_name) || '', ...qrBranding(req.user.clientId), locks: qrLocksOf('manual_order', req.user.clientId, center.id), canLock: manualCan(req, 'colPmQrLock'),
    });
});
app.put('/api/business/pedido-manual/qr-locks', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!manualCan(req, 'colPmQrLock')) return res.status(403).json({ message: 'No tienes permiso para cambiar los candados del QR.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    if (!center.id) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    const locks = sanitizeQrLocks('manual_order', req.body && req.body.locks);
    if (!locks) return res.status(400).json({ message: 'Los candados no son válidos.' });
    saveQrLocks(req.user.clientId, center.id, 'manual_order', locks, req.user.sub);
    res.json({ locks: qrLocksOf('manual_order', req.user.clientId, center.id) });
});

// --- Incidentes (Operaciones > C. Distribución) ------------------------------------------------------------------------------------------------------
// Cada centro de costos tiene su QR: la dirección fija /inc/<código aleatorio del Layout del centro> (el mismo código de los demás QR del centro). Quien lo escanea escribe su nombre, elige la ZONA del Layout donde pasó, la
// categoría y el criterio (catálogo «Criterios de Incidentes»), cuenta la situación con sus palabras y sube sus evidencias (fotos, mínimo una): todo llega a la pantalla Incidentes con la hora (la pone el SERVIDOR, en UTC).
// Sin sesión, quien escanea escribe su nombre; con el candado «Pedir inicio de sesión» cerrado, solo reporta quien tiene sesión de esa empresa. Los candados se hacen cumplir aquí, en el servidor.
// Las evidencias no caben siempre en una sola petición: el reporte nace con las primeras y el servidor entrega una clave de un solo reporte (addKey) con la que el teléfono sube las demás.
const INCIDENT_TABLE_KEY = 'incidentes';
const INCIDENT_SCREEN_LABEL = 'Incidentes';
const INCIDENT_STATUS_LABELS = { open: 'Abierto', in_progress: 'En atención', closed: 'Cerrado' };
const INCIDENT_BATCH_MAX = 10; // fotos por petición
const INCIDENT_DESC_MAX = 2000;
const publicIncidentLimiter = rateLimit({ windowMs: 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests.' } });
const publicIncidentPhotosLimiter = rateLimit({ windowMs: 60 * 1000, max: 90, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests.' } });
const incidentFolio = (id) => `INC-${String(id).padStart(4, '0')}`;
// Los criterios que se pueden elegir al reportar: los activos del catálogo que ya tienen nombre y una categoría válida, por categoría (Mayor, Menor, Recomendación) y por nombre.
function incidentCriteriaFor(clientId, isTest) {
    const order = (k) => INCIDENT_CATEGORIES.indexOf(k);
    return listArticleCategories(clientId, 'incidentes-criterios', isTest)
        .filter((r) => r.status === 'active' && String(r.name || '').trim() && INCIDENT_CATEGORIES.includes(r.kind))
        .map((r) => ({ id: r.id, name: String(r.name).trim(), kind: r.kind }))
        .sort((a, b) => order(a.kind) - order(b.kind) || a.name.localeCompare(b.name, 'es'));
}
// Las zonas activas del Layout del centro (donde pudo pasar el incidente).
const incidentZonesOf = (row) => ((row.layout && row.layout.zones) || []).filter((z) => z.active !== false).map((z) => ({ id: z.id, code: z.code || '', name: z.name || '' }));
// Las fotos que llegan (hasta INCIDENT_BATCH_MAX por petición): cada una es una imagen de verdad de hasta ~450 KB y trae su miniatura (opcional). { photos } o { error }.
function parseIncidentPhotos(raw) {
    const list = Array.isArray(raw) ? raw : [];
    if (list.length > INCIDENT_BATCH_MAX) return { error: { message: 'Son demasiadas fotos en un solo envío.', code: 'BATCH' } };
    const photos = [];
    for (const item of list) {
        const photo = parseCleaningPhoto(item && item.photo);
        if (!photo) return { error: { message: 'Una de las fotos no es válida o pesa demasiado.', code: 'PHOTO' } };
        photos.push({ ...photo, thumb: parseThumb(item && item.thumb), key: item && typeof item.key === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(item.key) ? item.key : null });
    }
    return { photos };
}
app.get('/inc/:token', publicLayoutLimiter, (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' });
    res.sendFile(path.join(PUBLIC_DIR, 'IncidentesPublica.html'));
});
app.get('/api/public/incidentes/:token', publicLayoutLimiter, (req, res) => {
    const target = manualOrderTarget(req, res);
    if (!target) return;
    const { row, client, center, isTest } = target;
    const locks = qrLocksOf('incident', row.clientId, row.costCenterId || 0);
    const user = optionalSessionUser(req);
    const signedIn = !!user && Number(user.clientId) === Number(row.clientId);
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.json({
        companyName: (client && client.company_name) || '', siteName: row.layout.siteName || '', ...publicBrand(row.clientId),
        costCenter: center ? { id: center.id, name: center.name, code: center.code || '' } : null,
        locks, signedIn, userName: signedIn ? changedByLabel({ user }) : '', now: new Date().toISOString(),
        zones: incidentZonesOf(row), criteria: incidentCriteriaFor(row.clientId, isTest), batch: INCIDENT_BATCH_MAX, maxChars: INCIDENT_DESC_MAX,
    });
});
app.post('/api/public/incidentes/:token/send', publicIncidentLimiter, (req, res) => {
    const target = manualOrderTarget(req, res);
    if (!target) return;
    const { row, isTest } = target;
    const locks = qrLocksOf('incident', row.clientId, row.costCenterId || 0);
    if (!locks.register) return res.status(403).json({ message: 'Este QR solo sirve para consultar.', code: 'LOCKED' });
    const user = optionalSessionUser(req);
    const signedIn = !!user && Number(user.clientId) === Number(row.clientId);
    if (locks.signin && !signedIn) return res.status(401).json({ message: 'Este QR pide iniciar sesión.', code: 'LOGIN' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    // Siempre se pide el nombre de quien reporta (con sesión viene escrito el de la cuenta y se puede cambiar); la cuenta que envía queda registrada aparte.
    const typed = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const name = typed || (signedIn ? String(changedByLabel({ user }) || '').replace(/\s+/g, ' ').trim().slice(0, 60) : '');
    if (!name) return res.status(400).json({ message: 'Falta el nombre de quien reporta.', code: 'NAME' });
    const zones = incidentZonesOf(row);
    const zone = zones.find((z) => z.id === String(body.zoneId || '')) || null;
    const placeDetail = String(body.placeDetail || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (zones.length && !zone) return res.status(400).json({ message: 'Falta elegir la zona donde pasó.', code: 'ZONE' });
    if (!zones.length && !placeDetail) return res.status(400).json({ message: 'Falta decir dónde pasó.', code: 'PLACE' });
    const criterion = incidentCriteriaFor(row.clientId, isTest).find((c) => c.id === Number(body.criterionId));
    if (!criterion) return res.status(400).json({ message: 'Falta elegir el criterio.', code: 'CRITERION' });
    const description = String(body.description || '').replace(/[ \t]+/g, ' ').trim().slice(0, INCIDENT_DESC_MAX);
    if (!description) return res.status(400).json({ message: 'Falta contar la situación.', code: 'DESC' });
    const parsed = parseIncidentPhotos(body.photos);
    if (parsed.error) return res.status(400).json(parsed.error);
    if (!parsed.photos.length) return res.status(400).json({ message: 'Falta al menos una evidencia.', code: 'PHOTO' });
    const addKey = crypto.randomBytes(16).toString('hex');
    const out = createIncident({ clientId: row.clientId, costCenterId: row.costCenterId || 0, reporterName: name, reporterUserId: signedIn ? user.sub : null, source: signedIn ? 'user' : 'qr', zone, placeDetail, criterion, description, photos: parsed.photos, addKey });
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ id: out.id, folio: incidentFolio(out.id), createdAt: sqlUtcIso(out.created_at), addKey, photos: out.photo_count, name, category: out.category, criterion: out.criterion_name, zone: zone ? `${zone.code ? `${zone.code} · ` : ''}${zone.name}` : '', now: new Date().toISOString() });
});
// Las evidencias que no cupieron en la primera petición: con la clave de ese reporte (nadie más la tiene).
app.post('/api/public/incidentes/:token/:id/photos', publicIncidentPhotosLimiter, (req, res) => {
    const target = manualOrderTarget(req, res);
    if (!target) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(404).json({ message: 'Not found.' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const parsed = parseIncidentPhotos(body.photos);
    if (parsed.error) return res.status(400).json(parsed.error);
    if (!parsed.photos.length) return res.status(400).json({ message: 'No hay fotos.', code: 'PHOTO' });
    const total = addIncidentPhotos(id, target.row.clientId, typeof body.addKey === 'string' ? body.addKey : '', parsed.photos);
    res.set('Cache-Control', 'no-store');
    if (total === null) return res.status(403).json({ message: 'La clave de este reporte no es válida.', code: 'KEY' });
    if (total === -1) return res.status(400).json({ message: `Un reporte lleva hasta ${INCIDENT_MAX_PHOTOS} evidencias.`, code: 'MAXPHOTOS' });
    res.json({ photos: total });
});

// La pantalla (con usuario): TODOS los reportes de la empresa, uno por renglón, con las columnas de Control Interno por fila.
function incidentRowOf(r, centers, client) {
    const cc = centers.get(r.cost_center_id);
    return {
        id: r.id, folio: incidentFolio(r.id), cc: r.cost_center_id, centroCostos: cc ? cc.name : '', company: client ? client.company_name : '',
        name: r.reporter_name, zoneCode: r.zone_code, zoneName: r.zone_name, placeDetail: r.place_detail, category: r.category, criterion: r.criterion_name, description: r.description,
        status: r.status, statusAt: sqlUtcIso(r.status_at), statusBy: r.status_by || '', reportedAt: sqlUtcIso(r.created_at), source: r.source,
        photoCount: r.photo_count || 0, photoIds: r.photo_ids || [], receivedAt: sqlUtcIso(r.received_at), editedAt: sqlUtcIso(r.edited_at), editedBy: r.edited_by || '',
        system: getSystemColumnsForRecord({ companyName: client ? client.company_name : '', area: CODE_RELATION_AREA_LABEL, modulo: CODE_RELATION_MODULE_LABEL, pantalla: INCIDENT_SCREEN_LABEL, centroCostos: cc ? cc.name : '', createdAt: r.created_at }),
    };
}
// Un botón de la pantalla (QR, candado, estatus) pide Ver y Operar en su columna del árbol; el administrador del cliente no depende de hojas.
const incidentCan = (req, colKey) => !!req.user.isClientAdmin || canCreateColumn(getUserEffectiveGrants(req.user.sub), INCIDENT_TABLE_KEY, colKey);
// Las evidencias (fotos) las ve quien tiene alguna hoja de la columna Evidencias en el árbol.
const incidentCanSeePhotos = (req) => !!req.user.isClientAdmin || hasColumnGrant(getUserEffectiveGrants(req.user.sub), INCIDENT_TABLE_KEY, 'colIncEvidencias');
const incidentEditable = (req) => editableColumnsOf(req, INCIDENT_TABLE_KEY, [['name', 'colIncQuien'], ['placeDetail', 'colIncDetalle'], ['description', 'colIncDescripcion']]);
function prepareIncidentEdit(body, allowed) {
    const src = body && typeof body === 'object' ? body : {};
    const has = (key) => allowed.includes(key) && Object.prototype.hasOwnProperty.call(src, key);
    const patch = {};
    if (has('name')) {
        const name = String(src.name === null || src.name === undefined ? '' : src.name).replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!name) return { error: 'Falta el nombre de quien reporta.', code: 'NAME' };
        patch.name = name;
    }
    if (has('placeDetail')) patch.placeDetail = String(src.placeDetail === null || src.placeDetail === undefined ? '' : src.placeDetail).replace(/\s+/g, ' ').trim().slice(0, 200);
    if (has('description')) {
        const text = String(src.description === null || src.description === undefined ? '' : src.description).replace(/[ \t]+/g, ' ').trim().slice(0, INCIDENT_DESC_MAX);
        if (!text) return { error: 'Falta contar la situación.', code: 'DESC' };
        patch.description = text;
    }
    if (!Object.keys(patch).length) return { error: 'No hay nada que corregir.', code: 'EMPTY' };
    return { patch };
}
app.get('/api/business/incidentes', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const client = getClientById(clientId);
    const centers = new Map(listCostCenters(clientId, isTestAccount).map((c) => [c.id, c]));
    const lite = req.query.lite === '1'; // la App: solo los reportes más recientes y sin las columnas de Control Interno
    const LIMIT = lite ? 300 : 5000;
    const rows = listIncidents(clientId, { limit: LIMIT });
    res.set('Cache-Control', 'no-store');
    res.json({
        truncated: rows.length >= LIMIT, max: LIMIT,
        canDelete: !!req.user.isClientAdmin || canDeleteColumn(getUserEffectiveGrants(req.user.sub), INCIDENT_TABLE_KEY, 'colIncDeleteAuth'),
        canQr: incidentCan(req, 'colIncQr'), canLock: incidentCan(req, 'colIncQrLock'), canStatus: incidentCan(req, 'colIncEstatus'), canPhotos: incidentCanSeePhotos(req),
        editable: incidentEditable(req),
        incidents: rows.map((r) => { const o = incidentRowOf(r, centers, client); if (lite) delete o.system; if (!incidentCanSeePhotos(req)) o.photoIds = []; return o; }),
    });
});
// Corregir quién reporta, el detalle del lugar o la situación: pasa por la misma tubería de cambios de toda la plataforma (checkAndLogFieldChanges).
app.patch('/api/business/incidentes/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const id = Number(req.params.id);
    const rec = Number.isInteger(id) ? getIncident(id, req.user.clientId) : null;
    if (!rec) return res.status(404).json({ message: 'Ese registro no existe.' });
    const prepared = prepareIncidentEdit(req.body, ['name', 'placeDetail', 'description']);
    if (prepared.error) return res.status(400).json({ message: prepared.error, code: prepared.code });
    const { appliedPatch, pendingFields, rejectedFields } = checkAndLogFieldChanges(req, rec, prepared.patch, INCIDENT_PATCHABLE_FIELDS, INCIDENT_TABLE_KEY, `Incidente ${incidentFolio(rec.id)}`);
    const updated = updateIncident(id, req.user.clientId, appliedPatch, { editedBy: changedByLabel(req) });
    const centers = new Map(listCostCenters(req.user.clientId, req.user.isTestAccount).map((c) => [c.id, c]));
    const out = incidentRowOf(updated, centers, getClientById(req.user.clientId));
    if (!incidentCanSeePhotos(req)) out.photoIds = [];
    res.json({ incident: out, pendingFields, rejectedFields });
});
// Cambiar el estatus (Abierto / En atención / Cerrado): es una operación del día, no una corrección; pide Ver y Operar en la columna Estatus y queda en el historial de cambios.
app.post('/api/business/incidentes/:id/status', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const id = Number(req.params.id);
    const rec = Number.isInteger(id) ? getIncident(id, req.user.clientId) : null;
    if (!rec) return res.status(404).json({ message: 'Ese registro no existe.' });
    if (!incidentCan(req, 'colIncEstatus')) return res.status(403).json({ message: 'No tienes permiso para cambiar el estatus.' });
    const status = String((req.body && req.body.status) || '');
    if (!INCIDENT_STATUSES.includes(status)) return res.status(400).json({ message: 'El estatus no es válido.', code: 'STATUS' });
    const centers = new Map(listCostCenters(req.user.clientId, req.user.isTestAccount).map((c) => [c.id, c]));
    const client = getClientById(req.user.clientId);
    const wrap = (r) => { const o = incidentRowOf(r, centers, client); if (!incidentCanSeePhotos(req)) o.photoIds = []; return o; };
    if (status === rec.status) return res.json({ incident: wrap(rec) });
    const updated = setIncidentStatus(id, req.user.clientId, status, changedByLabel(req));
    try {
        logTableChange({ clientId: req.user.clientId, tableKey: INCIDENT_TABLE_KEY, recordId: rec.id, recordLabel: `Incidente ${incidentFolio(rec.id)}`, action: 'update', fieldKey: 'main.colIncEstatus', oldValue: INCIDENT_STATUS_LABELS[rec.status] || rec.status, newValue: INCIDENT_STATUS_LABELS[status], changedBy: changedByLabel(req) });
    } catch (err) { console.error('incident status log failed', err); }
    res.json({ incident: wrap(updated) });
});
app.delete('/api/business/incidentes/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const id = Number(req.params.id);
    const rec = Number.isInteger(id) ? getIncident(id, req.user.clientId) : null;
    if (!rec) return res.status(404).json({ message: 'Ese registro no existe.' });
    if (!req.user.isClientAdmin && !canDeleteColumn(getUserEffectiveGrants(req.user.sub), INCIDENT_TABLE_KEY, 'colIncDeleteAuth')) return res.status(403).json({ message: 'No tienes permiso para eliminar reportes de Incidentes.' });
    deleteIncident(id, req.user.clientId);
    try { notifyDataChange({ clientId: req.user.clientId, tableKey: INCIDENT_TABLE_KEY, recordLabel: `Incidente ${incidentFolio(rec.id)}`, fieldKey: 'colIncDeleteAuth', oldValue: `${rec.criterion_name} (${rec.reporter_name})`, newValue: 'Eliminado', actorUserId: req.user.sub, actorLabel: changedByLabel(req) }); } catch (err) { console.error('incident delete notice failed', err); }
    res.json({ ok: true });
});
// Una evidencia de un reporte (la foto completa, o con ?thumb=1 su miniatura): solo con sesión y con la columna Evidencias en el árbol.
app.get('/api/business/incidentes/:id/photo/:photoId', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).end();
    if (!incidentCanSeePhotos(req)) return res.status(403).end();
    const id = Number(req.params.id);
    const photoId = Number(req.params.photoId);
    if (!Number.isInteger(id) || !Number.isInteger(photoId) || !getIncident(id, req.user.clientId)) return res.status(404).end();
    const photo = getIncidentPhoto(id, photoId, req.query.thumb === '1');
    if (!photo) return res.status(404).end();
    res.set({ 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    res.send(photo.data);
});
// El QR del centro de costos que se eligió: la dirección fija (/inc/…) y la cuadrícula del QR para dibujarlo; sale del Layout de ese centro (si todavía no hay uno guardado, no hay QR).
app.get('/api/business/incidentes/qr', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!incidentCan(req, 'colIncQr')) return res.status(403).json({ message: 'No tienes permiso para usar el QR de Incidentes.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    if (!center.id) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    const token = ensureLayoutPublicToken(req.user.clientId, center.id);
    if (!token) return res.status(404).json({ message: 'Todavía no hay un Layout guardado en ese centro de costos: el QR sale de ahí.', code: 'NOLAYOUT' });
    const layoutRow = getClientLayout(req.user.clientId, { costCenterId: center.id });
    const url = `${req.protocol}://${req.get('host')}/inc/${token}`;
    const client = getClientById(req.user.clientId);
    res.set('Cache-Control', 'no-store');
    res.json({
        url, qrRows: layoutQrRows(url), costCenter: { id: center.costCenter.id, name: center.costCenter.name, code: center.costCenter.code || '' }, siteName: (layoutRow && layoutRow.layout.siteName) || '',
        companyName: (client && client.company_name) || '', ...qrBranding(req.user.clientId), locks: qrLocksOf('incident', req.user.clientId, center.id), canLock: incidentCan(req, 'colIncQrLock'),
    });
});
app.put('/api/business/incidentes/qr-locks', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!incidentCan(req, 'colIncQrLock')) return res.status(403).json({ message: 'No tienes permiso para cambiar los candados del QR.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    if (!center.id) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    const locks = sanitizeQrLocks('incident', req.body && req.body.locks);
    if (!locks) return res.status(400).json({ message: 'Los candados no son válidos.' });
    saveQrLocks(req.user.clientId, center.id, 'incident', locks, req.user.sub);
    res.json({ locks: qrLocksOf('incident', req.user.clientId, center.id) });
});

// La App (con sesión): las OPCIONES para armar un reporte (los criterios y las zonas del Layout de cada centro de costos: el celular las guarda para trabajar sin señal) y crear el reporte. El reporte nace con la primera tanda de
// evidencias y lleva la clave que le pone el celular (clientRef): si el celular lo reenvía (se cortó la señal justo al responder) el servidor contesta el que ya existe; las demás evidencias llegan después a esa clave.
// Si el reporte se mandó sin señal, el celular manda la hora a la que lo hizo (clientAt: solo vale si es de más de 2 minutos antes y hasta 7 días antes de ahora) y la del servidor queda aparte como hora recibida.
app.get('/api/business/incidentes/options', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const centerIds = new Set(listCostCenters(clientId, !!isTestAccount).map((c) => c.id));
    const zonesByCenter = {};
    listClientLayouts(clientId).forEach((row) => { const cc = row.costCenterId || 0; if (cc && centerIds.has(cc)) zonesByCenter[cc] = incidentZonesOf(row); });
    res.set('Cache-Control', 'no-store');
    res.json({ criteria: incidentCriteriaFor(clientId, !!isTestAccount), zonesByCenter, batch: INCIDENT_BATCH_MAX, maxChars: INCIDENT_DESC_MAX, at: new Date().toISOString() });
});
app.post('/api/business/incidentes/reports', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    if (!center.id) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const clientRef = typeof body.clientRef === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.clientRef) ? body.clientRef : null;
    res.set('Cache-Control', 'no-store');
    // el mismo reporte reenviado: se contesta el que ya existe
    const already = findIncidentByRef(req.user.clientId, req.user.sub, clientRef);
    if (already) return res.json({ id: already.id, folio: incidentFolio(already.id), createdAt: sqlUtcIso(already.created_at), photos: already.photo_count, offline: !!already.received_at, duplicate: true });
    const typed = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const name = typed || String(changedByLabel(req) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!name) return res.status(400).json({ message: 'Falta el nombre de quien reporta.', code: 'NAME' });
    const layoutRow = getClientLayout(req.user.clientId, { costCenterId: center.id });
    const zones = layoutRow ? incidentZonesOf(layoutRow) : [];
    const zone = zones.find((z) => z.id === String(body.zoneId || '')) || null;
    const placeDetail = String(body.placeDetail || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (zones.length && !zone) return res.status(400).json({ message: 'Falta elegir la zona donde pasó.', code: 'ZONE' });
    if (!zones.length && !placeDetail) return res.status(400).json({ message: 'Falta decir dónde pasó.', code: 'PLACE' });
    const criterion = incidentCriteriaFor(req.user.clientId, !!req.user.isTestAccount).find((c) => c.id === Number(body.criterionId));
    if (!criterion) return res.status(400).json({ message: 'Ese criterio ya no existe: elige otro.', code: 'CRITERION' });
    const description = String(body.description || '').replace(/[ \t]+/g, ' ').trim().slice(0, INCIDENT_DESC_MAX);
    if (!description) return res.status(400).json({ message: 'Falta contar la situación.', code: 'DESC' });
    const parsed = parseIncidentPhotos(body.photos);
    if (parsed.error) return res.status(400).json(parsed.error);
    if (!parsed.photos.length) return res.status(400).json({ message: 'Falta al menos una evidencia.', code: 'PHOTO' });
    let createdAt = null;
    const clientAt = typeof body.clientAt === 'string' ? Date.parse(body.clientAt) : NaN;
    if (Number.isFinite(clientAt) && clientAt >= Date.now() - 7 * 86400000 && clientAt < Date.now() - 120000) createdAt = new Date(clientAt).toISOString().slice(0, 19).replace('T', ' ');
    const out = createIncident({ clientId: req.user.clientId, costCenterId: center.id, reporterName: name, reporterUserId: req.user.sub, source: 'app', zone, placeDetail, criterion, description, photos: parsed.photos, addKey: '', createdAt, clientRef });
    res.status(201).json({ id: out.id, folio: incidentFolio(out.id), createdAt: sqlUtcIso(out.created_at), photos: out.photo_count, offline: !!createdAt });
});
// Las evidencias que no cupieron en la primera petición, a la clave del reporte de esta cuenta.
app.post('/api/business/incidentes/reports/:clientRef/photos', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const ref = String(req.params.clientRef || '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(ref)) return res.status(404).json({ message: 'Ese reporte no existe.', code: 'NOREPORT' });
    const parsed = parseIncidentPhotos(req.body && req.body.photos);
    if (parsed.error) return res.status(400).json(parsed.error);
    if (!parsed.photos.length) return res.status(400).json({ message: 'No hay fotos.', code: 'PHOTO' });
    const total = addIncidentPhotosByRef(req.user.clientId, req.user.sub, ref, parsed.photos);
    res.set('Cache-Control', 'no-store');
    if (total === null) return res.status(404).json({ message: 'Ese reporte no existe.', code: 'NOREPORT' });
    if (total === -1) return res.status(400).json({ message: `Un reporte lleva hasta ${INCIDENT_MAX_PHOTOS} evidencias.`, code: 'MAXPHOTOS' });
    res.json({ photos: total });
});

// Hoja de QR de limpieza: un QR por activo (de una zona o de todas) con su dirección fija; la hoja se imprime desde el Layout.
// La lista de los activos con QR de limpieza de un Layout (con la dirección fija de cada uno); la usan la hoja de QR del Layout y Operaciones > QR's > Limpieza.
function cleaningQrList(req, row) {
    const token = ensureLayoutPublicToken(req.user.clientId, row.costCenterId || 0);
    const base = `${req.protocol}://${req.get('host')}/l/${token}`;
    const layout = row.layout;
    const zoneId = String(req.query.zone || '');
    const zones = (layout.zones || []).filter((z) => z.active !== false);
    const spaces = (layout.spaces || []).filter((s) => s.active !== false && (!zoneId || s.zoneId === zoneId)).slice(0, 600).map((s) => {
        const fp = (layout.footprints || []).find((f) => f.id === s.footprintId);
        const zone = zones.find((z) => z.id === s.zoneId);
        const url = `${base}/${s.id}`;
        return { id: s.id, code: s.code, type: s.type, zoneId: s.zoneId || '', zoneName: zone ? zone.name : '', locator: zone && fp ? [zone.code, fp.code, s.code].join('.') : '', url, path: `/l/${token}/${s.id}`, qrRows: layoutQrRows(url) };
    });
    const client = getClientById(req.user.clientId);
    return { companyName: (client && client.company_name) || '', siteName: layout.siteName || '', ...qrBranding(req.user.clientId), zones: zones.map((z) => ({ id: z.id, name: z.name })), spaces };
}
app.get('/api/business/layout/cleaning-qr', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!layoutPermissions(req).canUseCleaningQr) return res.status(403).json({ message: 'No tienes permiso para usar los QR de limpieza.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    res.set('Cache-Control', 'no-store');
    res.json(cleaningQrList(req, row));
});
// Operaciones > QR's: cada app con QR se puede hacer desde la computadora (se abre la misma pantalla que abre el QR). Cada entrada pide la hoja de su pantalla en el árbol; el administrador del cliente no depende de hojas.
const QR_APP_SCREENS = { limpieza: 'cat-operaciones/cat-operaciones-centro-dist-qr-limpieza', temperaturas: 'cat-operaciones/cat-operaciones-centro-dist-qr-temperaturas', pedidoManual: 'cat-operaciones/cat-operaciones-centro-dist-qr-pedido-manual', seguridad: 'cat-operaciones/cat-operaciones-centro-dist-qr-seguridad', incidentes: 'cat-operaciones/cat-operaciones-centro-dist-qr-incidentes', dondeEsta: 'cat-operaciones/cat-operaciones-centro-dist-qr-donde-esta', ficha: 'cat-operaciones/cat-operaciones-centro-dist-qr-ficha' };
function canUseQrApp(req, key) {
    return !!req.user.isClientAdmin || isTupleGranted(getUserEffectiveGrants(req.user.sub), 'supply-chain', 'sc-area-distribution-center', QR_APP_SCREENS[key]);
}
app.get('/api/business/qr-apps/limpieza', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!canUseQrApp(req, 'limpieza')) return res.status(403).json({ message: 'No tienes permiso para esta pantalla.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    const list = cleaningQrList(req, row);
    res.set('Cache-Control', 'no-store');
    res.json({ siteName: list.siteName, zones: list.zones, spaces: list.spaces.map(({ qrRows, url, ...rest }) => rest) });
});
// QR's > Temperaturas: los refrigeradores (activos de tipo Frío, /t/…) y los sensores (/s/…) del Layout, cada uno con la dirección fija de su QR; las dos pantallas públicas registran en la tabla de Temperaturas.
app.get('/api/business/qr-apps/temperaturas', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!canUseQrApp(req, 'temperaturas')) return res.status(403).json({ message: 'No tienes permiso para esta pantalla.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    const token = ensureLayoutPublicToken(req.user.clientId, row.costCenterId || 0);
    const layout = row.layout;
    const zones = (layout.zones || []).filter((z) => z.active !== false);
    const zoneOf = (id) => zones.find((z) => z.id === id);
    const fridges = (layout.spaces || []).filter((s) => s.active !== false && s.type === 'cold').map((s) => {
        const fp = (layout.footprints || []).find((f) => f.id === s.footprintId);
        const zone = zoneOf(s.zoneId);
        return { key: `fridge:${s.id}`, kind: 'fridge', id: s.id, code: s.code, type: 'cold', zoneId: s.zoneId || '', zoneName: zone ? zone.name : '', locator: zone && fp ? [zone.code, fp.code, s.code].join('.') : '', path: `/t/${token}/${s.id}` };
    });
    const sensors = (layout.sensors || []).map((s) => {
        const zone = zoneOf(s.zoneId);
        return { key: `sensor:${s.id}`, kind: 'sensor', id: s.id, code: s.code, type: s.type, zoneId: s.zoneId || '', zoneName: zone ? zone.name : '', locator: [zone && zone.code, s.code].filter(Boolean).join('.'), path: `/s/${token}/${s.id}` };
    });
    res.set('Cache-Control', 'no-store');
    res.json({ siteName: layout.siteName || '', zones: zones.map((z) => ({ id: z.id, name: z.name })), spaces: [...fridges, ...sensors].slice(0, 600) });
});
// QR's > Pedido manual: el QR de Pedido Manual es UNO por centro de costos (/pm/…, la misma dirección de la pantalla Pedido Manual), así que la lista es de un solo renglón: el centro que se eligió arriba. «Abrir» muestra la misma
// página que abre el QR (buscar el artículo, la cantidad, el nombre y enviar) en una ventana; lo que se envía llega a Operaciones > Pedido Manual igual que desde el celular.
app.get('/api/business/qr-apps/pedido-manual', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!canUseQrApp(req, 'pedidoManual')) return res.status(403).json({ message: 'No tienes permiso para esta pantalla.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    if (!row.costCenterId) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    const token = ensureLayoutPublicToken(req.user.clientId, row.costCenterId);
    const center = getCostCenterAnyLane(row.costCenterId, req.user.clientId);
    res.set('Cache-Control', 'no-store');
    res.json({ siteName: row.layout.siteName || '', zones: [], spaces: [{ key: `pm:${row.costCenterId}`, id: `pm:${row.costCenterId}`, kind: 'center', code: center ? center.name : '', siteName: row.layout.siteName || '', zoneId: '', zoneName: '', locator: '', path: `/pm/${token}` }] });
});
// QR's > Seguridad: los elementos de seguridad del Layout (extintores, hidrantes, puertas de emergencia, botiquines…), cada uno con la dirección fija de su QR (/g/…): quien lo hace desde la computadora marca si está bien o con falla,
// deja una nota y toma la foto con la cámara de la computadora, y queda en Operaciones > Seguridad igual que desde el celular.
app.get('/api/business/qr-apps/seguridad', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!canUseQrApp(req, 'seguridad')) return res.status(403).json({ message: 'No tienes permiso para esta pantalla.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    const token = ensureLayoutPublicToken(req.user.clientId, row.costCenterId || 0);
    const layout = row.layout;
    const zones = (layout.zones || []).filter((z) => z.active !== false);
    const spaces = (layout.safety || []).slice(0, 600).map((e) => {
        const zone = zones.find((z) => z.id === e.zoneId);
        return { key: e.id, id: e.id, code: e.code, type: e.type, name: e.name || '', zoneId: e.zoneId || '', zoneName: zone ? zone.name : '', locator: [zone && zone.code, e.code].filter(Boolean).join('.'), path: `/g/${token}/${e.id}` };
    });
    res.set('Cache-Control', 'no-store');
    res.json({ siteName: layout.siteName || '', zones: zones.map((z) => ({ id: z.id, name: z.name })), spaces });
});
// QR's > Incidentes: el QR de Incidentes es UNO por centro de costos (/inc/…, la misma dirección de la pantalla Incidentes), así que la lista es de un solo renglón: el centro que se eligió arriba. «Abrir» muestra la misma página que
// abre el QR (nombre, zona donde pasó, categoría y criterio, la situación y las evidencias) en una ventana; lo que se reporte llega a Operaciones > Incidentes igual que desde el celular.
app.get('/api/business/qr-apps/incidentes', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!canUseQrApp(req, 'incidentes')) return res.status(403).json({ message: 'No tienes permiso para esta pantalla.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    if (!row.costCenterId) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    const token = ensureLayoutPublicToken(req.user.clientId, row.costCenterId);
    const center = getCostCenterAnyLane(row.costCenterId, req.user.clientId);
    res.set('Cache-Control', 'no-store');
    res.json({ siteName: row.layout.siteName || '', zones: [], spaces: [{ key: `inc:${row.costCenterId}`, id: `inc:${row.costCenterId}`, kind: 'center', code: center ? center.name : '', siteName: row.layout.siteName || '', zoneId: '', zoneName: '', locator: '', path: `/inc/${token}` }] });
});
// QR's > Dónde está: el QR del Layout (/q/…, el mismo de la hoja del Layout) es UNO por centro de costos, así que la lista es de un solo renglón: el centro que se eligió arriba. «Abrir» muestra la misma página pública que abre el QR
// (el croquis del sitio con su buscador: se busca un código y dice dónde está) en una ventana; es solo para consultar.
app.get('/api/business/qr-apps/donde-esta', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!canUseQrApp(req, 'dondeEsta')) return res.status(403).json({ message: 'No tienes permiso para esta pantalla.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    if (!row.costCenterId) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    const token = ensureLayoutPublicToken(req.user.clientId, row.costCenterId);
    const center = getCostCenterAnyLane(row.costCenterId, req.user.clientId);
    res.set('Cache-Control', 'no-store');
    res.json({ siteName: row.layout.siteName || '', zones: [], spaces: [{ key: `q:${row.costCenterId}`, id: `q:${row.costCenterId}`, kind: 'center', code: center ? center.name : '', siteName: row.layout.siteName || '', zoneId: '', zoneName: '', locator: '', path: `/q/${token}` }] });
});
// QR's > Ficha del código: la ficha pública (Ficha.html?token=…) es UNA POR CÓDIGO (solo los códigos ya completos en Alta Artículos traen su QR), así que aquí va una lista de códigos con buscador (SKU, UPC o descripción; el mismo
// motor de búsqueda de todo el sistema) y «Abrir» muestra la misma ficha que abre el QR del código. No depende de un centro de costos. Se mandan los primeros 100 que cumplan; con más, se afina la búsqueda.
const QR_FICHA_LIMIT = 100;
app.get('/api/business/qr-apps/ficha', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!canUseQrApp(req, 'ficha')) return res.status(403).json({ message: 'No tienes permiso para esta pantalla.' });
    const mode = PUBLIC_SEARCH_MODES.includes(req.query.mode) ? req.query.mode : 'contains';
    const query = publicSearchQuery(req.query.q);
    let list = listSkuItems(req.user.clientId, !!req.user.isTestAccount).filter((r) => r.public_token);
    if (query) {
        if (!SearchSyntax.ready(mode, query)) list = [];
        else {
            const matches = publicSearchMatcher(mode, query);
            list = list.filter((r) => matches([padSku(r.record_number, r.sku_code), padSku(r.record_number), r.client_code, r.upc, r.unique_description, r.known_description, r.custom_description]));
        }
    }
    res.set('Cache-Control', 'no-store');
    res.json({
        siteName: '', zones: [], total: list.length,
        spaces: list.slice(0, QR_FICHA_LIMIT).map((r) => ({ key: String(r.id), id: String(r.id), code: padSku(r.record_number, r.sku_code), name: r.custom_description || r.known_description || r.unique_description || '', upc: r.upc || '', zoneId: '', zoneName: '', locator: '', path: `/Ficha.html?token=${encodeURIComponent(r.public_token)}` })),
    });
});

// --- Temperaturas (Operaciones > C. Distribución) ------------------------------------------------------------------------------------------------
// Cada REFRIGERADOR (activo de tipo Frío) del Layout tiene su QR de temperaturas (la dirección fija /t/<código del Layout>/<id del activo>: nunca cambia). Quien lo escanea NO necesita sesión: escribe su nombre,
// la temperatura que marca y toma la foto de la lectura con la cámara en vivo; la hora la pone el SERVIDOR. Solo puede ver las últimas lecturas de ESE refrigerador (solo lectura). La base de registros (con
// usuario) es Operaciones > Temperaturas.
const TEMPERATURE_TABLE_KEY = 'temperaturas';
const TEMPERATURE_SCREEN_LABEL = 'Temperaturas';
const TEMPERATURE_MIN = -100;
const TEMPERATURE_MAX = 100;
// El refrigerador por su código público: solo cuentan los activos de tipo Frío; con su huella, su zona y su localizador (Z006.H003.F001).
function temperatureTarget(token, spaceId) {
    const target = cleaningTarget(token, spaceId);
    return target && target.space.type === 'cold' ? target : null;
}
// Alerta de una lectura: cada medida se juzga con el rango que traía el refrigerador al momento de la lectura: 'low' (por debajo del mínimo), 'high' (por encima del máximo), 'ok', o null si esa medida no tenía rango.
function temperatureStatus(r) {
    const judge = (v, lo, hi) => {
        if (v === null || v === undefined || (lo == null && hi == null)) return null;
        if (lo != null && v < lo) return 'low';
        if (hi != null && v > hi) return 'high';
        return 'ok';
    };
    return { temp: judge(r.temperature, r.temp_min, r.temp_max), hum: judge(r.humidity, r.hum_min, r.hum_max) };
}
const temperatureLimits = (r) => ({ tempMin: r.temp_min, tempMax: r.temp_max, humMin: r.hum_min, humMax: r.hum_max });
// El rango que hoy tiene el refrigerador en el Layout (solo los que tienen valor).
const spaceLimits = (s) => { const o = {}; ['tempMin', 'tempMax', 'humMin', 'humMax'].forEach((k) => { if (s[k] !== undefined && s[k] !== null) o[k] = s[k]; }); return o; };
// Un registro de temperatura tal como lo ve quien escanea, con los candados: sin rango ni alerta (range), sin nombre (names) ni foto (photos) cuando están cerrados. own = el registro que esa persona acaba de
// guardar (es suyo: conserva su nombre y su foto; el candado del rango sí se respeta).
function lockedTemperatureRecord(r, locks, own = false) {
    const out = publicTemperatureRecord(r);
    if (!locks.range) { out.limits = {}; out.status = { temp: null, hum: null }; }
    if (!own && !locks.names) out.name = '';
    if (!own && !locks.photos) out.hasPhoto = false;
    return out;
}
const publicTemperatureRecord = (r) => ({ id: r.id, name: r.person_name, temperature: r.temperature, humidity: r.humidity, limits: temperatureLimits(r), status: temperatureStatus(r), checkedAt: sqlUtcIso(r.checked_at), hasPhoto: !!r.has_photo });
app.get('/t/:token/:spaceId', publicLayoutLimiter, (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(self)' });
    res.sendFile(path.join(PUBLIC_DIR, 'TemperaturaPublica.html'));
});
app.get('/api/public/temperature/:token/:spaceId', publicLayoutLimiter, (req, res) => {
    const target = temperatureTarget(req.params.token, req.params.spaceId);
    if (!target) return res.status(404).json({ message: 'Not found.' });
    const { row, space, footprint, zone, locator } = target;
    const client = getClientById(row.clientId);
    const locks = qrLocksOf('temperature', row.clientId, row.costCenterId || 0);
    const records = locks.records ? listTemperatureRecords(row.clientId, { costCenterId: row.costCenterId || 0, spaceId: space.id, limit: locks.limit }) : [];
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.json({
        companyName: (client && client.company_name) || '', siteName: row.layout.siteName || '', ...publicBrand(row.clientId),
        space: { id: space.id, code: space.code, type: space.type, locator, zoneName: zone ? zone.name : '', footprintCode: footprint ? footprint.code : '', limits: locks.range ? spaceLimits(space) : {} },
        records: records.map((r) => lockedTemperatureRecord(r, locks)), locks, now: new Date().toISOString(),
    });
});
app.post('/api/public/temperature/:token/:spaceId/reading', publicCleaningLimiter, (req, res) => {
    const target = temperatureTarget(req.params.token, req.params.spaceId);
    if (!target) return res.status(404).json({ message: 'Not found.' });
    const personName = String((req.body && req.body.name) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!qrLocksOf('temperature', target.row.clientId, target.row.costCenterId || 0).register) return res.status(403).json({ message: 'Este QR solo sirve para consultar.', code: 'LOCKED' });
    if (!personName) return res.status(400).json({ message: 'Falta el nombre de quien revisa.', code: 'NAME' });
    const raw = req.body && req.body.temperature;
    const temperature = typeof raw === 'number' ? raw : Number.NaN;
    if (!Number.isFinite(temperature) || temperature < TEMPERATURE_MIN || temperature > TEMPERATURE_MAX) return res.status(400).json({ message: 'La temperatura no es válida.', code: 'TEMP' });
    // La humedad (%) la pide la página del QR junto con la temperatura; aquí es opcional (una página vieja que no la mande sigue sirviendo), pero si llega debe ser un número de 0 a 100.
    const rawHum = req.body && req.body.humidity;
    let humidity = null;
    if (rawHum !== undefined && rawHum !== null) {
        if (typeof rawHum !== 'number' || !Number.isFinite(rawHum) || rawHum < 0 || rawHum > 100) return res.status(400).json({ message: 'La humedad no es válida.', code: 'HUM' });
        humidity = Math.round(rawHum * 10) / 10;
    }
    const photo = parseCleaningPhoto(req.body && req.body.photo);
    if (!photo) return res.status(400).json({ message: 'La foto no es válida o es demasiado grande.', code: 'PHOTO' });
    const { row, space, footprint, zone, locator } = target;
    const saved = addTemperatureRecord({ clientId: row.clientId, costCenterId: row.costCenterId || 0, spaceId: space.id, spaceCode: space.code, spaceType: space.type, zoneName: zone ? zone.name : '', footprintCode: footprint ? footprint.code : '', locator, personName, temperature: Math.round(temperature * 10) / 10, humidity, limits: spaceLimits(space), photo, thumb: parseThumb(req.body && req.body.thumb) });
    res.set('Cache-Control', 'no-store');
    res.status(201).json(lockedTemperatureRecord(saved, qrLocksOf('temperature', row.clientId, row.costCenterId || 0), true));
});
app.get('/api/public/temperature/:token/:spaceId/photo/:id', publicLayoutLimiter, (req, res) => {
    const target = temperatureTarget(req.params.token, req.params.spaceId);
    const id = Number(req.params.id);
    if (!target || !Number.isInteger(id)) return res.status(404).end();
    const rec = getTemperatureRecord(id, target.row.clientId);
    if (!rec || rec.space_id !== target.space.id || rec.cost_center_id !== (target.row.costCenterId || 0)) return res.status(404).end();
    if (!qrLocksOf(req.path.includes('/public/cleaning/') ? 'cleaning' : 'temperature', target.row.clientId, target.row.costCenterId || 0).photos) return res.status(404).end();
    const photo = getTemperaturePhoto(id, req.query.thumb === '1');
    if (!photo) return res.status(404).end();
    res.set({ 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' });
    res.send(photo.data);
});
// La base de registros (Operaciones > Temperaturas, con usuario): TODAS las lecturas de todos los refrigeradores y centros de costos del cliente, con las columnas de Control Interno por fila.
// Una lectura tal como la ve la base de registros (lista y corrección usan lo mismo). status se calcula al momento con el rango que traía el refrigerador, así que al corregir la temperatura el estado se recalcula solo.
function temperatureRowOf(r, centers, client) {
    const cc = centers.get(r.cost_center_id);
    return {
        id: r.id, cc: r.cost_center_id, centroCostos: cc ? cc.name : '', company: client ? client.company_name : '',
        zoneName: r.zone_name, footprintCode: r.footprint_code, spaceCode: r.space_code, spaceType: r.space_type, sensorCode: r.sensor_code, sensorType: r.sensor_type, locator: r.locator,
        name: r.person_name, temperature: r.temperature, humidity: r.humidity, limits: temperatureLimits(r), status: temperatureStatus(r), checkedAt: sqlUtcIso(r.checked_at), hasPhoto: !!r.has_photo, source: r.source,
        spaceId: r.space_id, sensorId: r.sensor_id, receivedAt: sqlUtcIso(r.received_at),
        editedAt: sqlUtcIso(r.edited_at), editedBy: r.edited_by || '',
        system: getSystemColumnsForRecord({ companyName: client ? client.company_name : '', area: CODE_RELATION_AREA_LABEL, modulo: CODE_RELATION_MODULE_LABEL, pantalla: TEMPERATURE_SCREEN_LABEL, centroCostos: cc ? cc.name : '', createdAt: r.checked_at }),
    };
}
app.get('/api/business/temperatures', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const client = getClientById(clientId);
    const centers = new Map(listCostCenters(clientId, isTestAccount).map((c) => [c.id, c]));
    const lite = req.query.lite === '1'; // la App: solo las 300 más recientes y sin las columnas de Control Interno
    const LIMIT = lite ? 300 : 5000;
    const rows = listTemperatureRecords(clientId, { limit: LIMIT });
    res.set('Cache-Control', 'no-store');
    res.json({
        truncated: rows.length >= LIMIT, max: LIMIT, canDelete: !!req.user.isClientAdmin || canDeleteColumn(getUserEffectiveGrants(req.user.sub), TEMPERATURE_TABLE_KEY, 'colTmpDeleteAuth'),
        editable: editableColumnsOf(req, TEMPERATURE_TABLE_KEY, [['name', 'colTmpQuien'], ['temperature', 'colTmpTemperatura'], ['humidity', 'colTmpHumedad']]),
        temperatures: rows.map((r) => {
            const o = temperatureRowOf(r, centers, client);
            if (!lite) return o;
            delete o.system;
            o.mine = r.reporter_user_id === req.user.sub;
            o.clientRef = o.mine ? (r.client_ref || '') : '';
            return o;
        }),
    });
});
// Corregir una lectura (quién la revisó, la temperatura y la humedad; nunca la hora, la foto ni el lugar): misma tubería de cambios que Limpieza (ver arriba). Al corregir la temperatura o la humedad, el estado
// (En rango / Fuera de rango) se recalcula con el rango que traía el refrigerador.
app.patch('/api/business/temperatures/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const id = Number(req.params.id);
    const rec = Number.isInteger(id) ? getTemperatureRecord(id, req.user.clientId) : null;
    if (!rec) return res.status(404).json({ message: 'Ese registro no existe.' });
    const prepared = prepareRecordEdit(req.body, rec, ['name', 'temperature', 'humidity']);
    if (prepared.error) return res.status(400).json({ message: prepared.error, code: prepared.code });
    const { appliedPatch, pendingFields, rejectedFields } = checkAndLogFieldChanges(req, recordForDiff(rec), prepared.patch, TEMPERATURE_PATCHABLE_FIELDS, TEMPERATURE_TABLE_KEY, `Temperatura ${rec.space_code || rec.sensor_code} · TMP-${rec.id}`);
    const updated = updateTemperatureRecord(id, req.user.clientId, appliedPatch, { editedBy: changedByLabel(req) });
    const centers = new Map(listCostCenters(req.user.clientId, req.user.isTestAccount).map((c) => [c.id, c]));
    res.json({ temperature: temperatureRowOf(updated, centers, getClientById(req.user.clientId)), pendingFields, rejectedFields });
});
// La App (con sesión): las OPCIONES para tomar una lectura (los refrigeradores —activos de tipo Frío— y los sensores del Layout de cada centro de costos, con su rango y su última lectura: el celular las guarda para trabajar
// sin señal) y registrar la lectura (nombre, temperatura y/o humedad según el equipo, foto). La lectura lleva la clave que le pone el celular (clientRef): si el celular la reenvía el servidor contesta la que ya existe. Si se hizo
// sin señal el celular manda la hora (clientAt: solo vale si es de más de 30 segundos antes y hasta 7 días antes de ahora) y la del servidor queda aparte como hora recibida. Cada equipo se identifica con su tipo y su id: kind
// 'fridge' (refrigerador) o 'sensor'.
app.get('/api/business/temperaturas/options', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const centerIds = new Set(listCostCenters(clientId, !!isTestAccount).map((c) => c.id));
    const pointsByCenter = {};
    const lastByCenter = {};
    listClientLayouts(clientId).forEach((row) => {
        const cc = row.costCenterId || 0;
        if (!cc || !centerIds.has(cc)) return;
        const points = [];
        (row.layout.spaces || []).filter((s) => s && s.active !== false && s.type === 'cold' && s.code && CLEANING_SPACE_ID_RE.test(String(s.id || ''))).forEach((s) => {
            const { footprint, zone, locator } = cleaningLocatorOf(row.layout, s);
            points.push({ kind: 'fridge', id: s.id, code: s.code, type: 'cold', locator, zoneName: zone ? zone.name : '', footprintCode: footprint ? footprint.code : '', limits: spaceLimits(s) });
        });
        (row.layout.sensors || []).filter((s) => s && s.code && SENSOR_ID_RE.test(String(s.id || ''))).forEach((s) => {
            const zone = (row.layout.zones || []).find((z) => z.id === s.zoneId) || null;
            points.push({ kind: 'sensor', id: s.id, code: s.code, type: s.type || 'both', locator: [zone && zone.code, s.code].filter(Boolean).join('.'), zoneName: zone ? zone.name : '', footprintCode: '', limits: {} });
        });
        pointsByCenter[cc] = points;
        const last = {};
        getTemperatureLast(clientId, cc).forEach((r) => {
            last[r.sensor_id ? `s:${r.sensor_id}` : `f:${r.space_id}`] = { at: sqlUtcIso(r.checked_at), temperature: r.temperature, humidity: r.humidity, status: temperatureStatus(r) };
        });
        lastByCenter[cc] = last;
    });
    res.set('Cache-Control', 'no-store');
    res.json({ pointsByCenter, lastByCenter, at: new Date().toISOString() });
});
app.post('/api/business/temperaturas/readings', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    if (!center.id) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const clientRef = typeof body.clientRef === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.clientRef) ? body.clientRef : null;
    res.set('Cache-Control', 'no-store');
    const centers = new Map(listCostCenters(req.user.clientId, !!req.user.isTestAccount).map((c) => [c.id, c]));
    const client = getClientById(req.user.clientId);
    // la misma lectura reenviada: se contesta la que ya existe
    const already = findTemperatureByRef(req.user.clientId, req.user.sub, clientRef);
    if (already) return res.json({ record: temperatureRowOf(already, centers, client), duplicate: true });
    const typed = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const personName = typed || String(changedByLabel(req) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!personName) return res.status(400).json({ message: 'Falta el nombre de quien revisa.', code: 'NAME' });
    const layoutRow = getClientLayout(req.user.clientId, { costCenterId: center.id });
    const isSensor = body.kind === 'sensor';
    const pointId = String(body.pointId || '');
    const space = !isSensor && layoutRow && CLEANING_SPACE_ID_RE.test(pointId) ? (layoutRow.layout.spaces || []).find((s) => s.id === pointId && s.active !== false && s.type === 'cold') : null;
    const sensor = isSensor && layoutRow && SENSOR_ID_RE.test(pointId) ? (layoutRow.layout.sensors || []).find((s) => s.id === pointId) : null;
    if (!space && !sensor) return res.status(400).json({ message: 'Ese equipo ya no existe: elige otro.', code: 'POINT' });
    // lo que pide el equipo: un refrigerador, temperatura (y humedad, que puede faltar); un sensor, temperatura, humedad o las dos según su tipo (lo que su tipo no lleva se ignora)
    let temperature = null;
    if (space || sensor.type !== 'hum') {
        const raw = body.temperature;
        if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < TEMPERATURE_MIN || raw > TEMPERATURE_MAX) return res.status(400).json({ message: 'La temperatura no es válida.', code: 'TEMP' });
        temperature = Math.round(raw * 10) / 10;
    }
    let humidity = null;
    if (space ? (body.humidity !== undefined && body.humidity !== null) : sensor.type !== 'temp') {
        const rawHum = body.humidity;
        if (typeof rawHum !== 'number' || !Number.isFinite(rawHum) || rawHum < 0 || rawHum > 100) return res.status(400).json({ message: 'La humedad no es válida.', code: 'HUM' });
        humidity = Math.round(rawHum * 10) / 10;
    }
    const photo = parseCleaningPhoto(body.photo);
    if (!photo) return res.status(400).json({ message: 'La foto no es válida o es demasiado grande.', code: 'PHOTO' });
    const checkedAt = appClientTime(body.clientAt, 30000);
    let saved;
    if (space) {
        const { footprint, zone, locator } = cleaningLocatorOf(layoutRow.layout, space);
        saved = addTemperatureRecord({
            clientId: req.user.clientId, costCenterId: center.id, spaceId: space.id, spaceCode: space.code, spaceType: space.type, zoneName: zone ? zone.name : '', footprintCode: footprint ? footprint.code : '', locator, personName, temperature, humidity,
            limits: spaceLimits(space), photo, thumb: parseThumb(body.thumb), source: 'app', userId: req.user.sub, clientRef, checkedAt,
        });
    } else {
        const zone = (layoutRow.layout.zones || []).find((z) => z.id === sensor.zoneId) || null;
        saved = addTemperatureRecord({
            clientId: req.user.clientId, costCenterId: center.id, spaceId: '', spaceCode: '', spaceType: '', zoneName: zone ? zone.name : '', footprintCode: '', locator: [zone && zone.code, sensor.code].filter(Boolean).join('.'), personName, temperature, humidity, limits: {},
            photo, thumb: parseThumb(body.thumb), source: 'app', sensorId: sensor.id, sensorCode: sensor.code, sensorType: sensor.type, userId: req.user.sub, clientRef, checkedAt,
        });
    }
    res.status(201).json({ record: temperatureRowOf(saved, centers, client), offline: !!checkedAt });
});
app.get('/api/business/temperatures/:id/photo', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).end();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !getTemperatureRecord(id, req.user.clientId)) return res.status(404).end();
    const photo = getTemperaturePhoto(id, req.query.thumb === '1');
    if (!photo) return res.status(404).end();
    res.set({ 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    res.send(photo.data);
});
// Eliminar una lectura pide el permiso Eliminar de su columna en el árbol (el administrador del cliente no depende de hojas); queda el aviso del cambio.
app.delete('/api/business/temperatures/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const id = Number(req.params.id);
    const rec = Number.isInteger(id) ? getTemperatureRecord(id, req.user.clientId) : null;
    if (!rec) return res.status(404).json({ message: 'Ese registro no existe.' });
    if (!req.user.isClientAdmin && !canDeleteColumn(getUserEffectiveGrants(req.user.sub), TEMPERATURE_TABLE_KEY, 'colTmpDeleteAuth')) return res.status(403).json({ message: 'No tienes permiso para eliminar registros de temperaturas.' });
    deleteTemperatureRecord(id, req.user.clientId);
    try { notifyDataChange({ clientId: req.user.clientId, tableKey: TEMPERATURE_TABLE_KEY, recordLabel: `Temperatura ${rec.space_code || rec.sensor_code}`, fieldKey: 'colTmpDeleteAuth', oldValue: `${rec.temperature === null ? `${rec.humidity} %` : `${rec.temperature} °C`} ${rec.person_name} (${rec.checked_at} UTC)`, newValue: 'Eliminado', actorUserId: req.user.sub, actorLabel: changedByLabel(req) }); } catch (err) { console.error('temperature delete notice failed', err); }
    res.json({ ok: true });
});
// Hoja de QR de temperaturas: un QR por refrigerador (de una zona o de todas) con su dirección fija; la hoja se imprime desde el Layout.
app.get('/api/business/layout/temperature-qr', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!layoutPermissions(req).canUseTemperatureQr) return res.status(403).json({ message: 'No tienes permiso para usar los QR de temperaturas.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    const token = ensureLayoutPublicToken(req.user.clientId, row.costCenterId || 0);
    const base = `${req.protocol}://${req.get('host')}/t/${token}`;
    const layout = row.layout;
    const zoneId = String(req.query.zone || '');
    const zones = (layout.zones || []).filter((z) => z.active !== false);
    const spaces = (layout.spaces || []).filter((s) => s.active !== false && s.type === 'cold' && (!zoneId || s.zoneId === zoneId)).slice(0, 600).map((s) => {
        const fp = (layout.footprints || []).find((f) => f.id === s.footprintId);
        const zone = zones.find((z) => z.id === s.zoneId);
        const url = `${base}/${s.id}`;
        return { id: s.id, code: s.code, type: s.type, zoneId: s.zoneId || '', zoneName: zone ? zone.name : '', locator: zone && fp ? [zone.code, fp.code, s.code].join('.') : '', url, qrRows: layoutQrRows(url) };
    });
    const client = getClientById(req.user.clientId);
    res.set('Cache-Control', 'no-store');
    res.json({ companyName: (client && client.company_name) || '', siteName: layout.siteName || '', ...qrBranding(req.user.clientId), zones: zones.map((z) => ({ id: z.id, name: z.name })), spaces });
});

// --- Sensores (Layout > paso Sensores) ------------------------------------------------------------------------------------------------------------
// Cada SENSOR de temperatura y/o humedad del Layout tiene su QR (la dirección fija /s/<código del Layout>/<id del sensor>: nunca cambia). Quien lo escanea NO necesita sesión: escribe su nombre, lo que marca el sensor
// (temperatura, humedad o las dos, según su tipo) y toma la foto de la lectura con la cámara en vivo; la hora la pone el SERVIDOR. Las lecturas se guardan en la misma tabla de Temperaturas (con el id del sensor) y
// alimentan el mapa de calor. Solo puede ver las últimas lecturas de ESE sensor (solo lectura).
const SENSOR_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
function sensorTarget(token, sensorId) {
    if (!SENSOR_ID_RE.test(String(sensorId || ''))) return null;
    const row = getLayoutByPublicToken(token);
    if (!row) return null;
    const sensor = (row.layout.sensors || []).find((s) => s.id === sensorId);
    if (!sensor) return null;
    const zone = (row.layout.zones || []).find((z) => z.id === sensor.zoneId) || null;
    return { row, sensor, zone, locator: [zone && zone.code, sensor.code].filter(Boolean).join('.') };
}
const publicSensorRecord = (r) => ({ id: r.id, name: r.person_name, temperature: r.temperature, humidity: r.humidity, limits: {}, status: { temp: null, hum: null }, checkedAt: sqlUtcIso(r.checked_at), hasPhoto: !!r.has_photo });
// Un registro como lo ve quien escanea, con los candados: sin nombre (names) ni foto (photos) cuando están cerrados (own = la lectura que esa persona acaba de guardar: conserva las dos).
function lockedSensorRecord(r, locks, own = false) {
    const out = publicSensorRecord(r);
    if (!own && !locks.names) out.name = '';
    if (!own && !locks.photos) out.hasPhoto = false;
    return out;
}
app.get('/s/:token/:sensorId', publicLayoutLimiter, (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(self)' });
    res.sendFile(path.join(PUBLIC_DIR, 'TemperaturaPublica.html'));
});
app.get('/api/public/sensor/:token/:sensorId', publicLayoutLimiter, (req, res) => {
    const target = sensorTarget(req.params.token, req.params.sensorId);
    if (!target) return res.status(404).json({ message: 'Not found.' });
    const { row, sensor, zone, locator } = target;
    const client = getClientById(row.clientId);
    const locks = qrLocksOf('sensor', row.clientId, row.costCenterId || 0);
    const records = locks.records ? listTemperatureRecords(row.clientId, { costCenterId: row.costCenterId || 0, sensorId: sensor.id, limit: locks.limit }) : [];
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.json({
        companyName: (client && client.company_name) || '', siteName: row.layout.siteName || '', ...publicBrand(row.clientId),
        space: { id: sensor.id, code: sensor.code, type: sensor.type, locator, zoneName: zone ? zone.name : '', footprintCode: '', limits: {} },
        records: records.map((r) => lockedSensorRecord(r, locks)), locks, now: new Date().toISOString(),
    });
});
app.post('/api/public/sensor/:token/:sensorId/reading', publicCleaningLimiter, (req, res) => {
    const target = sensorTarget(req.params.token, req.params.sensorId);
    if (!target) return res.status(404).json({ message: 'Not found.' });
    const { row, sensor, zone, locator } = target;
    const locks = qrLocksOf('sensor', row.clientId, row.costCenterId || 0);
    if (!locks.register) return res.status(403).json({ message: 'Este QR solo sirve para consultar.', code: 'LOCKED' });
    const personName = String((req.body && req.body.name) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!personName) return res.status(400).json({ message: 'Falta el nombre de quien revisa.', code: 'NAME' });
    // lo que pide el sensor según su tipo: temperatura (°C), humedad (%) o las dos; lo que su tipo no lleva se ignora
    let temperature = null;
    if (sensor.type !== 'hum') {
        const raw = req.body && req.body.temperature;
        if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < TEMPERATURE_MIN || raw > TEMPERATURE_MAX) return res.status(400).json({ message: 'La temperatura no es válida.', code: 'TEMP' });
        temperature = Math.round(raw * 10) / 10;
    }
    let humidity = null;
    if (sensor.type !== 'temp') {
        const rawHum = req.body && req.body.humidity;
        if (typeof rawHum !== 'number' || !Number.isFinite(rawHum) || rawHum < 0 || rawHum > 100) return res.status(400).json({ message: 'La humedad no es válida.', code: 'HUM' });
        humidity = Math.round(rawHum * 10) / 10;
    }
    const photo = parseCleaningPhoto(req.body && req.body.photo);
    if (!photo) return res.status(400).json({ message: 'La foto no es válida o es demasiado grande.', code: 'PHOTO' });
    const saved = addTemperatureRecord({
        clientId: row.clientId, costCenterId: row.costCenterId || 0, spaceId: '', spaceCode: '', spaceType: '', zoneName: zone ? zone.name : '', footprintCode: '', locator, personName, temperature, humidity, limits: {},
        photo, thumb: parseThumb(req.body && req.body.thumb), source: 'qr-sensor', sensorId: sensor.id, sensorCode: sensor.code, sensorType: sensor.type,
    });
    res.set('Cache-Control', 'no-store');
    res.status(201).json(lockedSensorRecord(saved, locks, true));
});
app.get('/api/public/sensor/:token/:sensorId/photo/:id', publicLayoutLimiter, (req, res) => {
    const target = sensorTarget(req.params.token, req.params.sensorId);
    const id = Number(req.params.id);
    if (!target || !Number.isInteger(id)) return res.status(404).end();
    const rec = getTemperatureRecord(id, target.row.clientId);
    if (!rec || rec.sensor_id !== target.sensor.id || rec.cost_center_id !== (target.row.costCenterId || 0)) return res.status(404).end();
    if (!qrLocksOf('sensor', target.row.clientId, target.row.costCenterId || 0).photos) return res.status(404).end();
    const photo = getTemperaturePhoto(id, req.query.thumb === '1');
    if (!photo) return res.status(404).end();
    res.set({ 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' });
    res.send(photo.data);
});
// Hoja de QR de sensores: un QR por sensor (de una zona o de todas) con su dirección fija; la hoja se imprime desde el Layout. Se manda en «spaces» para que sirva el mismo armado de tarjetas de Limpieza y Temperaturas.
app.get('/api/business/layout/sensor-qr', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!layoutPermissions(req).canUseSensorQr) return res.status(403).json({ message: 'No tienes permiso para usar los QR de sensores.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    const token = ensureLayoutPublicToken(req.user.clientId, row.costCenterId || 0);
    const base = `${req.protocol}://${req.get('host')}/s/${token}`;
    const layout = row.layout;
    const zoneId = String(req.query.zone || '');
    const zones = (layout.zones || []).filter((z) => z.active !== false);
    const spaces = (layout.sensors || []).filter((s) => !zoneId || s.zoneId === zoneId).slice(0, 600).map((s) => {
        const zone = zones.find((z) => z.id === s.zoneId);
        const url = `${base}/${s.id}`;
        return { id: s.id, code: s.code, type: s.type, zoneId: s.zoneId || '', zoneName: zone ? zone.name : '', locator: [zone && zone.code, s.code].filter(Boolean).join('.'), url, qrRows: layoutQrRows(url) };
    });
    const client = getClientById(req.user.clientId);
    res.set('Cache-Control', 'no-store');
    res.json({ companyName: (client && client.company_name) || '', siteName: layout.siteName || '', ...qrBranding(req.user.clientId), zones: zones.map((z) => ({ id: z.id, name: z.name })), spaces });
});

// --- Seguridad: revisiones por QR (Operaciones > C. Distribución) -------------------------------------------------------------------------------
// Cada ELEMENTO de Seguridad del Layout (extintor, hidrante, puerta de emergencia, botiquín…) tiene su QR de inspección (la dirección fija /g/<código del Layout>/<id del elemento>: nunca cambia). Quien lo escanea NO necesita
// sesión: escribe su nombre, marca si el elemento está BIEN o CON FALLA, puede dejar una nota y toma la foto con la cámara en vivo; la hora la pone el SERVIDOR. Una revisión BIEN recorre sola la «próxima revisión» del elemento
// (la fecha de la revisión más los días de «Revisar cada»); una CON FALLA lo deja marcado con falla hasta que otra salga bien. El Layout NO se toca desde aquí: el estado se calcula con las fechas del Layout y las revisiones.
// Solo se puede ver las últimas revisiones de ESE elemento (solo lectura). La base de registros (con usuario) es Operaciones > Seguridad.
const SAFETY_TABLE_KEY = 'seguridad';
const SAFETY_SCREEN_LABEL = 'Seguridad';
const SAFETY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SAFETY_NOTE_MAX = 300;
function safetyTarget(token, elementId) {
    if (!SAFETY_ID_RE.test(String(elementId || ''))) return null;
    const row = getLayoutByPublicToken(token);
    if (!row) return null;
    const element = (row.layout.safety || []).find((e) => e.id === elementId);
    if (!element) return null;
    const zone = (row.layout.zones || []).find((z) => z.id === element.zoneId) || null;
    return { row, element, zone, locator: [zone && zone.code, element.code].filter(Boolean).join('.') };
}
const publicSafetyRecord = (r) => ({ id: r.id, name: r.person_name, result: r.result, note: r.note, checkedAt: sqlUtcIso(r.checked_at), day: r.check_day, hasPhoto: !!r.has_photo });
// Una revisión como la ve quien escanea, con los candados: sin nombre (names), nota (notes) ni foto (photos) cuando están cerrados (own = la que esa persona acaba de guardar: conserva las tres).
function lockedSafetyRecord(r, locks, own = false) {
    const out = publicSafetyRecord(r);
    if (!own && !locks.names) out.name = '';
    if (!own && !locks.notes) out.note = '';
    if (!own && !locks.photos) out.hasPhoto = false;
    return out;
}
// Las fechas del elemento tal como las ve quien escanea (solo con el candado «dates»): caducidad, revisar cada, la próxima revisión que vale (la que se recorre sola) y el estado, con el día de hoy en la zona del cliente.
function safetyDatesFor(row, element) {
    const last = getSafetyLast(row.clientId, row.costCenterId || 0)[element.id] || null;
    const st = LayoutCalc.safetyStatus(element, clientLocalDay(row.clientId), row.layout.safetyWarnDays, last);
    return { expires: element.expires || '', every: element.every || null, next: LayoutCalc.safetyNextOf(element, last), state: st.state, days: st.days, date: st.date, which: st.which, lastDay: last ? last.day : '', lastResult: last ? last.result : '' };
}
app.get('/g/:token/:elementId', publicLayoutLimiter, (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(self)' });
    res.sendFile(path.join(PUBLIC_DIR, 'SeguridadPublica.html'));
});
app.get('/api/public/safety/:token/:elementId', publicLayoutLimiter, (req, res) => {
    const target = safetyTarget(req.params.token, req.params.elementId);
    if (!target) return res.status(404).json({ message: 'Not found.' });
    const { row, element, zone, locator } = target;
    const client = getClientById(row.clientId);
    const locks = qrLocksOf('safety', row.clientId, row.costCenterId || 0);
    const records = locks.records ? listSafetyChecks(row.clientId, { costCenterId: row.costCenterId || 0, elementId: element.id, limit: locks.limit }) : [];
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.json({
        companyName: (client && client.company_name) || '', siteName: row.layout.siteName || '', ...publicBrand(row.clientId),
        element: { id: element.id, code: element.code, type: element.type, ...(element.type === 'hydrant' ? { model: LayoutCalc.hydrantModelOf(element) } : {}), name: element.name || '', locator, zoneName: zone ? zone.name : '' },
        dates: locks.dates ? safetyDatesFor(row, element) : null,
        records: records.map((r) => lockedSafetyRecord(r, locks)), locks, now: new Date().toISOString(),
    });
});
app.post('/api/public/safety/:token/:elementId/check', publicCleaningLimiter, (req, res) => {
    const target = safetyTarget(req.params.token, req.params.elementId);
    if (!target) return res.status(404).json({ message: 'Not found.' });
    const { row, element, zone, locator } = target;
    const locks = qrLocksOf('safety', row.clientId, row.costCenterId || 0);
    if (!locks.register) return res.status(403).json({ message: 'Este QR solo sirve para consultar.', code: 'LOCKED' });
    const personName = String((req.body && req.body.name) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!personName) return res.status(400).json({ message: 'Falta el nombre de quien revisa.', code: 'NAME' });
    const result = req.body && req.body.result;
    if (result !== 'ok' && result !== 'fail') return res.status(400).json({ message: 'Falta marcar si el elemento está bien o con falla.', code: 'RESULT' });
    const rawNote = req.body && req.body.note;
    if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') return res.status(400).json({ message: 'La nota no es válida.', code: 'NOTE' });
    const note = String(rawNote || '').replace(/\s+/g, ' ').trim().slice(0, SAFETY_NOTE_MAX);
    const photo = parseCleaningPhoto(req.body && req.body.photo);
    if (!photo) return res.status(400).json({ message: 'La foto no es válida o es demasiado grande.', code: 'PHOTO' });
    const saved = addSafetyCheck({
        clientId: row.clientId, costCenterId: row.costCenterId || 0, elementId: element.id, elementCode: element.code, elementType: element.type, elementName: element.name || '',
        zoneName: zone ? zone.name : '', locator, personName, result, note, photo, thumb: parseThumb(req.body && req.body.thumb),
    });
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ record: lockedSafetyRecord(saved, locks, true), dates: locks.dates ? safetyDatesFor(row, element) : null });
});
app.get('/api/public/safety/:token/:elementId/photo/:id', publicLayoutLimiter, (req, res) => {
    const target = safetyTarget(req.params.token, req.params.elementId);
    const id = Number(req.params.id);
    if (!target || !Number.isInteger(id)) return res.status(404).end();
    const rec = getSafetyCheck(id, target.row.clientId);
    if (!rec || rec.element_id !== target.element.id || rec.cost_center_id !== (target.row.costCenterId || 0)) return res.status(404).end();
    if (!qrLocksOf('safety', target.row.clientId, target.row.costCenterId || 0).photos) return res.status(404).end();
    const photo = getSafetyPhoto(id, req.query.thumb === '1');
    if (!photo) return res.status(404).end();
    res.set({ 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' });
    res.send(photo.data);
});
// La base de registros (Operaciones > Seguridad, con usuario): TODAS las revisiones de todos los elementos y centros de costos del cliente, con las columnas de Control Interno por fila.
function safetyCheckRowOf(r, centers, client) {
    const cc = centers.get(r.cost_center_id);
    return {
        id: r.id, cc: r.cost_center_id, centroCostos: cc ? cc.name : '', company: client ? client.company_name : '',
        zoneName: r.zone_name, elementId: r.element_id, elementCode: r.element_code, elementType: r.element_type, elementName: r.element_name, locator: r.locator,
        name: r.person_name, result: r.result, note: r.note, checkedAt: sqlUtcIso(r.checked_at), day: r.check_day, hasPhoto: !!r.has_photo, source: r.source, receivedAt: sqlUtcIso(r.received_at),
        editedAt: sqlUtcIso(r.edited_at), editedBy: r.edited_by || '',
        system: getSystemColumnsForRecord({ companyName: client ? client.company_name : '', area: CODE_RELATION_AREA_LABEL, modulo: CODE_RELATION_MODULE_LABEL, pantalla: SAFETY_SCREEN_LABEL, centroCostos: cc ? cc.name : '', createdAt: r.checked_at }),
    };
}
app.get('/api/business/safety-checks', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const client = getClientById(clientId);
    const centers = new Map(listCostCenters(clientId, isTestAccount).map((c) => [c.id, c]));
    const lite = req.query.lite === '1'; // la App: solo las revisiones más recientes y sin las columnas de Control Interno
    const LIMIT = lite ? 300 : 5000;
    const rows = listSafetyChecks(clientId, { limit: LIMIT });
    // el modelo de cada hidrante sale del Layout vigente de su centro de costos (no se guarda en cada revisión): si cambia de modelo, todas sus revisiones lo muestran
    const hydrantModels = new Map();
    listClientLayouts(clientId).forEach((lr) => {
        const m = new Map();
        ((lr.layout && lr.layout.safety) || []).forEach((e) => { if (e.type === 'hydrant') m.set(e.id, LayoutCalc.hydrantModelOf(e)); });
        hydrantModels.set(lr.costCenterId || 0, m);
    });
    res.set('Cache-Control', 'no-store');
    res.json({
        truncated: rows.length >= LIMIT, max: LIMIT, canDelete: !!req.user.isClientAdmin || canDeleteColumn(getUserEffectiveGrants(req.user.sub), SAFETY_TABLE_KEY, 'colSgDeleteAuth'),
        editable: editableColumnsOf(req, SAFETY_TABLE_KEY, [['name', 'colSgQuien']]),
        checks: rows.map((r) => {
            const o = safetyCheckRowOf(r, centers, client);
            const model = r.element_type === 'hydrant' ? (hydrantModels.get(r.cost_center_id) || new Map()).get(r.element_id) : null;
            if (model) o.elementModel = model;
            if (lite) delete o.system;
            return o;
        }),
    });
});
// La App (con sesión): las OPCIONES para hacer una revisión (los elementos de Seguridad del Layout de cada centro de costos y la última revisión de cada uno: el celular los guarda para trabajar sin señal) y crear la revisión.
// La revisión lleva la clave que le pone el celular (clientRef): si el celular la reenvía (se cortó la señal justo al responder) el servidor contesta la que ya existe. Si se hizo sin señal, el celular manda la hora a la que la hizo
// (clientAt: solo vale si es de más de 2 minutos antes y hasta 7 días antes de ahora) y la del servidor queda aparte como hora recibida.
function safetyElementsOf(row) {
    const zones = new Map((row.layout.zones || []).map((z) => [z.id, z]));
    return (row.layout.safety || []).map((e) => {
        const zone = zones.get(e.zoneId) || null;
        return { id: e.id, code: e.code, type: e.type, ...(e.type === 'hydrant' ? { model: LayoutCalc.hydrantModelOf(e) } : {}), name: e.name || '', zoneId: e.zoneId || '', zoneName: zone ? zone.name : '', locator: [zone && zone.code, e.code].filter(Boolean).join('.') };
    });
}
app.get('/api/business/seguridad/options', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const centerIds = new Set(listCostCenters(clientId, !!isTestAccount).map((c) => c.id));
    const elementsByCenter = {};
    const lastByCenter = {};
    listClientLayouts(clientId).forEach((row) => {
        const cc = row.costCenterId || 0;
        if (!cc || !centerIds.has(cc)) return;
        elementsByCenter[cc] = safetyElementsOf(row);
        lastByCenter[cc] = getSafetyLast(clientId, cc);
    });
    res.set('Cache-Control', 'no-store');
    res.json({ elementsByCenter, lastByCenter, noteMax: SAFETY_NOTE_MAX, at: new Date().toISOString() });
});
app.post('/api/business/seguridad/checks', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    if (!center.id) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const clientRef = typeof body.clientRef === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.clientRef) ? body.clientRef : null;
    res.set('Cache-Control', 'no-store');
    const centers = new Map(listCostCenters(req.user.clientId, !!req.user.isTestAccount).map((c) => [c.id, c]));
    // la misma revisión reenviada: se contesta la que ya existe
    const already = findSafetyCheckByRef(req.user.clientId, req.user.sub, clientRef);
    if (already) return res.json({ record: safetyCheckRowOf(already, centers, getClientById(req.user.clientId)), duplicate: true });
    const typed = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const personName = typed || String(changedByLabel(req) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!personName) return res.status(400).json({ message: 'Falta el nombre de quien revisa.', code: 'NAME' });
    const layoutRow = getClientLayout(req.user.clientId, { costCenterId: center.id });
    const element = layoutRow && SAFETY_ID_RE.test(String(body.elementId || '')) ? (layoutRow.layout.safety || []).find((e) => e.id === body.elementId) : null;
    if (!element) return res.status(400).json({ message: 'Ese elemento ya no existe: elige otro.', code: 'ELEMENT' });
    const result = body.result;
    if (result !== 'ok' && result !== 'fail') return res.status(400).json({ message: 'Falta marcar si el elemento está bien o con falla.', code: 'RESULT' });
    const rawNote = body.note;
    if (rawNote !== undefined && rawNote !== null && typeof rawNote !== 'string') return res.status(400).json({ message: 'La nota no es válida.', code: 'NOTE' });
    const note = String(rawNote || '').replace(/\s+/g, ' ').trim().slice(0, SAFETY_NOTE_MAX);
    const photo = parseCleaningPhoto(body.photo);
    if (!photo) return res.status(400).json({ message: 'La foto no es válida o es demasiado grande.', code: 'PHOTO' });
    let createdAt = null;
    const clientAt = typeof body.clientAt === 'string' ? Date.parse(body.clientAt) : NaN;
    if (Number.isFinite(clientAt) && clientAt >= Date.now() - 7 * 86400000 && clientAt < Date.now() - 120000) createdAt = new Date(clientAt).toISOString().slice(0, 19).replace('T', ' ');
    const zone = (layoutRow.layout.zones || []).find((z) => z.id === element.zoneId) || null;
    const saved = addSafetyCheck({
        clientId: req.user.clientId, costCenterId: center.id, elementId: element.id, elementCode: element.code, elementType: element.type, elementName: element.name || '',
        zoneName: zone ? zone.name : '', locator: [zone && zone.code, element.code].filter(Boolean).join('.'), personName, result, note, photo, thumb: parseThumb(body.thumb),
        source: 'app', userId: req.user.sub, clientRef, createdAt,
    });
    res.status(201).json({ record: safetyCheckRowOf(saved, centers, getClientById(req.user.clientId)), offline: !!createdAt });
});
// Corregir quién hizo una revisión: misma tubería de cambios que Limpieza y Temperaturas (checkAndLogFieldChanges). El resultado, la hora, la nota, la foto y el lugar no se corrigen: son la prueba de lo que pasó.
app.patch('/api/business/safety-checks/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const id = Number(req.params.id);
    const rec = Number.isInteger(id) ? getSafetyCheck(id, req.user.clientId) : null;
    if (!rec) return res.status(404).json({ message: 'Ese registro no existe.' });
    const prepared = prepareRecordEdit(req.body, rec, ['name']);
    if (prepared.error) return res.status(400).json({ message: prepared.error, code: prepared.code });
    const { appliedPatch, pendingFields, rejectedFields } = checkAndLogFieldChanges(req, recordForDiff(rec), prepared.patch, SAFETY_CHECK_PATCHABLE_FIELDS, SAFETY_TABLE_KEY, `Seguridad ${rec.element_code} · SEG-${rec.id}`);
    const updated = updateSafetyCheck(id, req.user.clientId, appliedPatch, { editedBy: changedByLabel(req) });
    const centers = new Map(listCostCenters(req.user.clientId, req.user.isTestAccount).map((c) => [c.id, c]));
    res.json({ check: safetyCheckRowOf(updated, centers, getClientById(req.user.clientId)), pendingFields, rejectedFields });
});
app.get('/api/business/safety-checks/:id/photo', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).end();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !getSafetyCheck(id, req.user.clientId)) return res.status(404).end();
    const photo = getSafetyPhoto(id, req.query.thumb === '1');
    if (!photo) return res.status(404).end();
    res.set({ 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    res.send(photo.data);
});
// Eliminar una revisión pide el permiso Eliminar de su columna en el árbol (el administrador del cliente no depende de hojas); queda el aviso del cambio. Al borrarla, el estado del elemento vuelve a calcularse con las que quedan.
app.delete('/api/business/safety-checks/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const id = Number(req.params.id);
    const rec = Number.isInteger(id) ? getSafetyCheck(id, req.user.clientId) : null;
    if (!rec) return res.status(404).json({ message: 'Ese registro no existe.' });
    if (!req.user.isClientAdmin && !canDeleteColumn(getUserEffectiveGrants(req.user.sub), SAFETY_TABLE_KEY, 'colSgDeleteAuth')) return res.status(403).json({ message: 'No tienes permiso para eliminar registros de seguridad.' });
    deleteSafetyCheck(id, req.user.clientId);
    try { notifyDataChange({ clientId: req.user.clientId, tableKey: SAFETY_TABLE_KEY, recordLabel: `Seguridad ${rec.element_code}`, fieldKey: 'colSgDeleteAuth', oldValue: `${rec.result === 'fail' ? 'Con falla' : 'Bien'} ${rec.person_name} (${rec.checked_at} UTC)`, newValue: 'Eliminado', actorUserId: req.user.sub, actorLabel: changedByLabel(req) }); } catch (err) { console.error('safety delete notice failed', err); }
    res.json({ ok: true });
});
// Solo las últimas revisiones de cada elemento de Seguridad: la pantalla del Layout las vuelve a pedir de vez en cuando para no quedarse con datos viejos mientras está abierta (las revisiones llegan por el QR, sin sesión).
app.get('/api/business/layout/safety-last', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    res.set('Cache-Control', 'no-store');
    res.json({ safetyLast: (row.layout.safety || []).length ? getSafetyLast(req.user.clientId, row.costCenterId || 0) : {} });
});
// Hoja de QR de seguridad: un QR por elemento (de una zona o de todas) con su dirección fija; la hoja se imprime desde el Layout. Se manda en «spaces» para que sirva el mismo armado de tarjetas de las demás hojas.
app.get('/api/business/layout/safety-qr', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!layoutPermissions(req).canUseSafetyQr) return res.status(403).json({ message: 'No tienes permiso para usar los QR de seguridad.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    const token = ensureLayoutPublicToken(req.user.clientId, row.costCenterId || 0);
    const base = `${req.protocol}://${req.get('host')}/g/${token}`;
    const layout = row.layout;
    const zoneId = String(req.query.zone || '');
    const zones = (layout.zones || []).filter((z) => z.active !== false);
    const spaces = (layout.safety || []).filter((e) => !zoneId || e.zoneId === zoneId).slice(0, 600).map((e) => {
        const zone = zones.find((z) => z.id === e.zoneId);
        const url = `${base}/${e.id}`;
        return { id: e.id, code: e.code, type: e.type, name: e.name || '', zoneId: e.zoneId || '', zoneName: zone ? zone.name : '', locator: [zone && zone.code, e.code].filter(Boolean).join('.'), url, qrRows: layoutQrRows(url) };
    });
    const client = getClientById(req.user.clientId);
    res.set('Cache-Control', 'no-store');
    res.json({ companyName: (client && client.company_name) || '', siteName: layout.siteName || '', ...qrBranding(req.user.clientId), zones: zones.map((z) => ({ id: z.id, name: z.name })), spaces });
});

// --- Mapa de calor (Admin) --------------------------------------------------------------------------------------------------------------------------
// La pantalla Admin > Mapa de calor dibuja el Layout de UN centro de costos con cada zona pintada según lo que marcaron sus sensores a la hora elegida. El servidor manda el Layout (lo que hace falta para dibujarlo: contorno, zonas
// y los sensores con su zona) y las lecturas de sensores de un rango de tiempo (hasta 48 h; las horas van en UTC); la hora local, el promedio por zona y los colores los saca la pantalla.
const CLIMATE_MAP_MAX_MS = 48 * 3600 * 1000;
const CLIMATE_MAP_ROW_LIMIT = 5000;
app.get('/api/business/climate-map', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const row = layoutRowForRequest(req, res);
    if (!row) return;
    const from = new Date(String(req.query.from || ''));
    const to = new Date(String(req.query.to || ''));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to - from > CLIMATE_MAP_MAX_MS) return res.status(400).json({ message: 'El rango de tiempo no es válido.' });
    const sqlTime = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
    const admin = !!req.user.isClientAdmin;
    const grants = admin ? [] : getUserEffectiveGrants(req.user.sub);
    const pub = buildPublicLayoutPayload(req.user.clientId, row);
    const rows = listTemperatureRecords(req.user.clientId, { costCenterId: row.costCenterId || 0, sensorOnly: true, since: sqlTime(from), until: sqlTime(to), limit: CLIMATE_MAP_ROW_LIMIT });
    const center = layoutCenter(req).costCenter;
    res.set('Cache-Control', 'no-store');
    res.json({
        companyName: pub.companyName, siteName: pub.siteName, companyColor: pub.companyColor, costCenter: center ? { id: center.id, name: center.name } : null,
        layout: {
            vertices: pub.layout.vertices, zones: pub.layout.zones.map((z) => ({ id: z.id, name: z.name, type: z.type, x: z.x, y: z.y, l: z.l, w: z.w, ...(Array.isArray(z.pts) ? { pts: z.pts } : {}) })),
            sensors: (row.layout.sensors || []).map((s) => ({ id: s.id, code: s.code, type: s.type, ...(s.wallId ? { wallId: s.wallId } : { wall: s.wall }), dist: s.dist, height: s.height, zoneId: s.zoneId || '', measures: LayoutCalc.sensorZoneIds(s) })),
            // las paredes (donde va cada sensor): solo lo que hace falta para ubicarlas
            obstacles: (row.layout.obstacles || []).filter((o) => o.kind === 'wall').map((o) => ({ id: o.id, name: o.name, kind: o.kind, mode: o.mode, wall: o.wall, dist: o.dist, x: o.x, y: o.y, l: o.l, w: o.w, ...(o.h > 0 ? { h: o.h } : {}), ...(o.h2 > 0 ? { h2: o.h2 } : {}) })),
        },
        readings: rows.map((r) => ({ sensorId: r.sensor_id, sensorCode: r.sensor_code, type: r.sensor_type, temperature: r.temperature, humidity: r.humidity, at: sqlUtcIso(r.checked_at), name: r.person_name })),
        truncated: rows.length >= CLIMATE_MAP_ROW_LIMIT,
        permissions: {
            canMetric: admin || hasTableIconGrant(grants, 'mapa-calor', 'iconMapaCalorMetrica'),
            canPlay: admin || hasTableIconGrant(grants, 'mapa-calor', 'iconMapaCalorReproducir'),
            canCalc: admin || hasTableIconGrant(grants, 'mapa-calor', 'iconMapaCalorCalcular'),
            canValue: admin || hasTableIconGrant(grants, 'mapa-calor', 'iconMapaCalorValor'),
        },
    });
});

// Candados de los QR (con usuario): ver y cambiar los de un tipo de QR en el centro de costos elegido. Se guarda el conjunto completo del tipo.
app.get('/api/business/layout/qr-locks', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!layoutPermissions(req).canLockQr) return res.status(403).json({ message: 'No tienes permiso para ver los candados de los QR.' });
    const type = String(req.query.type || '');
    if (!QR_LOCK_TYPES[type]) return res.status(400).json({ message: 'Ese tipo de QR no existe.' });
    // la Ficha es de la empresa: no lleva centro de costos
    const center = type === 'ficha' ? { id: 0 } : layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    res.set('Cache-Control', 'no-store');
    res.json({ type, locks: qrLocksOf(type, req.user.clientId, center.id || 0), limits: QR_LOCK_LIMITS });
});
app.put('/api/business/layout/qr-locks', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!layoutPermissions(req).canLockQr) return res.status(403).json({ message: 'No tienes permiso para cambiar los candados de los QR.' });
    const type = String((req.body && req.body.type) || '');
    if (!QR_LOCK_TYPES[type]) return res.status(400).json({ message: 'Ese tipo de QR no existe.' });
    const locks = sanitizeQrLocks(type, req.body && req.body.locks);
    if (!locks) return res.status(400).json({ message: 'Los candados no son válidos.' });
    const center = type === 'ficha' ? { id: 0 } : layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    saveQrLocks(req.user.clientId, center.id || 0, type, locks, req.user.sub);
    res.json({ type, locks: qrLocksOf(type, req.user.clientId, center.id || 0) });
});

// Buscador de la página pública (la lupa): zonas, categorías de las zonas y códigos, mientras se escribe. Sin sesión, con el mismo código aleatorio del QR y un tope por IP (más alto que el de
// las demás rutas públicas porque se pide al ir escribiendo). Los códigos son solo los que ya tienen ficha pública (los completos), con su ficha y el lugar donde están según Relación Código;
// nunca costos ni datos internos. fields = en qué se busca, separados por coma: zone, furniture (mobiliario: clasificación y tipo del activo de cada Huella-Espacio), place (ubicación: el código del espacio),
// sku, desc, cat; sin fields (o vacío) se busca en todos; z = limitar a una zona; mode = startsWith | contains | equals (los mismos tres del "Tipo de Filtro" de las tablas). type (all | zone | cat | code) sigue
// funcionando para las páginas que todavía lo mandan.
const publicSearchLimiter = rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests.' } });
const foldText = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const publicSearchCache = new Map(); // clientId -> { at, codes, places }: se guarda unos segundos para no leer todos los códigos en cada letra
function publicSearchData(clientId) {
    const hit = publicSearchCache.get(clientId);
    if (hit && Date.now() - hit.at < 20000) return hit;
    const codes = listPublicSkuItemsForSearch(clientId).map((r) => ({
        r,
        sku: padSku(r.record_number, r.sku_code),
        name: r.custom_description || r.known_description || r.unique_description || '',
        // cada campo se revisa por separado, como la celda de una columna (el código con y sin ceros a la izquierda); by = los campos de cada opción del buscador (SKU, Descripción, Categoría)
        by: {
            sku: [padSku(r.record_number, r.sku_code), padSku(r.record_number), String(r.record_number), r.client_code, r.upc].map(foldText),
            desc: [r.unique_description, r.known_description, r.custom_description].map(foldText),
            cat: [r.category_inventario].map(foldText),
        },
    }));
    const places = new Map();
    listCodePlacesForSearch(clientId).forEach((p) => { if (!places.has(p.sku_item_id)) places.set(p.sku_item_id, []); places.get(p.sku_item_id).push(p); });
    const data = { at: Date.now(), codes, places };
    publicSearchCache.set(clientId, data);
    if (publicSearchCache.size > 200) publicSearchCache.delete(publicSearchCache.keys().next().value);
    return data;
}
const PUBLIC_SEARCH_LIMIT = 10;
const PUBLIC_SEARCH_FIELDS = ['zone', 'furniture', 'place', 'sku', 'desc', 'cat'];
const PUBLIC_SEARCH_LEGACY_TYPES = { zone: ['zone'], cat: ['cat'], code: ['sku', 'desc', 'cat'] };
// Igual que el "Tipo de Filtro" de las tablas: Inicia con, Contiene o Igual que, con la misma sintaxis (coma = cualquiera de las búsquedas, $ = otra palabra antes, @ = otra palabra después). El motor es
// uno solo para todo el sistema (public/SearchSyntax.js): la pantalla y el servidor leen igual lo escrito. Mayúsculas, acentos y espacios junto a la coma o al signo no cuentan.
const PUBLIC_SEARCH_MODES = ['startsWith', 'contains', 'equals'];
// Lo escrito en la URL: hasta 80 letras y 6 búsquedas separadas por coma.
const publicSearchQuery = (raw) => String(raw || '').slice(0, 80).split(',').slice(0, 6).join(',');
const publicSearchMatcher = (mode, query) => {
    const test = SearchSyntax.compile(mode, query);
    return (fields) => fields.some((f) => !!f && test(f));
};
app.get('/api/public/layout/:token/search', publicSearchLimiter, (req, res) => {
    const row = getLayoutByPublicToken(req.params.token);
    if (!row) return res.status(404).json({ message: 'Layout not found.' });
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    const mode = PUBLIC_SEARCH_MODES.includes(req.query.mode) ? req.query.mode : 'contains';
    const query = publicSearchQuery(req.query.q);
    const locks = qrLocksOf('layout', row.clientId, row.costCenterId || 0);
    const asked = String(req.query.fields || '').split(',').map((s) => s.trim()).filter((f) => PUBLIC_SEARCH_FIELDS.includes(f));
    const fields = new Set(asked.length ? asked : (PUBLIC_SEARCH_LEGACY_TYPES[req.query.type] || PUBLIC_SEARCH_FIELDS));
    const zones = (row.layout.zones || []).filter((z) => z.active !== false);
    const zoneFilter = zones.some((z) => z.id === String(req.query.z || '')) ? String(req.query.z) : '';
    const out = { zones: [], categories: [], codes: [], furniture: [], places: [], totals: { zones: 0, categories: 0, codes: 0, furniture: 0, places: 0 } };
    // Contiene pide al menos 2 letras o números (con 1 saldría casi todo); Inicia con e Igual que sí sirven con 1 (una zona "A", un anaquel "B").
    if (!SearchSyntax.ready(mode, query)) return res.json(out);
    const matches = publicSearchMatcher(mode, query);
    const inScope = (id) => !zoneFilter || id === zoneFilter;
    if (fields.has('zone')) {
        const found = zones.filter((z) => inScope(z.id) && matches([foldText(z.name)]));
        out.totals.zones = found.length;
        out.zones = found.slice(0, PUBLIC_SEARCH_LIMIT).map((z) => ({ id: z.id, name: z.name, categories: (z.categories || []).length }));
    }
    if (fields.has('cat')) {
        const found = [];
        zones.filter((z) => inScope(z.id)).forEach((z) => (z.categories || []).forEach((c) => {
            if (matches([foldText(c.name), foldText(c.desc)])) found.push({ zoneId: z.id, zoneName: z.name, id: c.id, name: c.name, desc: c.desc || '', color: c.color, icon: c.icon });
        }));
        out.totals.categories = found.length;
        out.categories = found.slice(0, PUBLIC_SEARCH_LIMIT);
    }
    // con «buscar códigos» cerrado el buscador solo encuentra zonas, categorías de la zona, mobiliario y ubicaciones: ningún código
    const codeKeys = locks.codes ? ['sku', 'desc', 'cat'].filter((k) => fields.has(k)) : [];
    if (codeKeys.length) {
        const data = publicSearchData(row.clientId);
        const zoneById = new Map(zones.map((z) => [z.id, z]));
        const spaceById = new Map((row.layout.spaces || []).filter((s) => s.active !== false).map((s) => [s.id, s]));
        const found = data.codes.filter((c) => matches(codeKeys.flatMap((k) => c.by[k])) && (!zoneFilter || (data.places.get(c.r.id) || []).some((p) => p.zone_id === zoneFilter)));
        out.totals.codes = found.length;
        out.codes = found.slice(0, PUBLIC_SEARCH_LIMIT).map((c) => {
            const placed = (data.places.get(c.r.id) || []).filter((p) => zoneById.has(p.zone_id));
            const where = placed.slice(0, 2).map((p) => [zoneById.get(p.zone_id).name, (spaceById.get(p.space_id) || {}).code, p.level ? `Nivel ${p.level}` : ''].filter(Boolean).join(' › ')).join(' · ');
            return {
                sku: c.sku, name: c.name, category: c.r.category_inventario || '', token: c.r.public_token, where: locks.where ? where : '',
                zoneId: locks.where && placed.length ? placed[0].zone_id : '', spaceIds: locks.where ? [...new Set(placed.map((p) => p.space_id).filter((id) => spaceById.has(id)))] : [],
            };
        });
    }
    // Mobiliario (la clasificación y el tipo del activo que cada Huella-Espacio tiene en el paso Activos del Layout) y Ubicación (el código del espacio). Solo nombres: nada interno.
    if (fields.has('furniture') || fields.has('place')) {
        const zoneName = new Map(zones.map((z) => [z.id, z.name]));
        const cls = new Map(listArticleCategories(row.clientId, 'activos-clasificacion', false).map((r) => [r.id, r.name]));
        const types = new Map(listArticleCategories(row.clientId, 'activos-fijos', false).map((r) => [r.id, r.name]));
        const spaces = (row.layout.spaces || []).filter((s) => s.active !== false && inScope(s.zoneId || '')).map((s) => ({
            id: s.id, code: s.code || '', name: s.name || '', kind: s.type || '', zoneId: zoneName.has(s.zoneId) ? s.zoneId : '', zone: zoneName.get(s.zoneId) || '',
            cls: cls.get(s.assetClassId) || '', type: types.get(s.assetId) || '',
        }));
        if (fields.has('furniture')) {
            const found = spaces.filter((s) => (s.cls || s.type) && matches([foldText(s.cls), foldText(s.type)]));
            out.totals.furniture = found.length;
            out.furniture = found.slice(0, PUBLIC_SEARCH_LIMIT);
        }
        if (fields.has('place')) {
            const found = spaces.filter((s) => s.code && matches([foldText(s.code), foldText(s.name)]));
            out.totals.places = found.length;
            out.places = found.slice(0, PUBLIC_SEARCH_LIMIT);
        }
    }
    res.json(out);
});

// --- Página pública de una clasificación (?z=<zona>&k=inventario.<id>&l=<id de la clasificación | sin>) ---------------------------------------------------------------------
// Las clasificaciones que tiene una categoría Inventario del catálogo (relación hecha en Nuestras Categorías Inventario) y, de cada una, los códigos de esa zona que Relación Código ya ubicó.
// SIN CLASIFICAR no se guarda: se arma al vuelo con los códigos de la categoría que todavía no traen clasificación, así que se vacía sola conforme se clasifican. Nunca costos ni datos internos.
function publicClassificationContext(row, query) {
    const zone = (row.layout.zones || []).find((z) => z.id === String(query.z || '') && z.active !== false);
    const match = /^inventario\.(\d{1,9})$/.exec(String(query.k || ''));
    if (!zone || !match) return null;
    const category = getArticleCategoryById(Number(match[1]), row.clientId, false);
    if (!category || category.category_type !== 'inventario') return null;
    const all = new Map(listArticleCategories(row.clientId, 'clasificaciones', false).map((r) => [r.id, r]));
    const catalog = parseClassificationIds(category.classification_ids).map((id) => all.get(id)).filter(Boolean);
    if (!catalog.length) return { zone, category, items: [], groups: new Map() };
    const validIds = new Set(catalog.map((c) => c.id));
    const byCode = new Map();
    listZoneCodesWithPlaces(row.clientId, zone.id, category.name).forEach((r) => {
        let code = byCode.get(r.id);
        if (!code) { code = { ...r, places: [] }; byCode.set(r.id, code); }
        code.places.push({ spaceId: r.space_id || '', level: r.level, slot: r.slot });
    });
    const groups = new Map([...catalog.map((c) => [String(c.id), []]), ['sin', []]]);
    byCode.forEach((code) => groups.get(code.classification_id && validIds.has(code.classification_id) ? String(code.classification_id) : 'sin').push(code));
    const items = [
        ...catalog.map((c) => ({ key: String(c.id), name: c.name, description: c.description || '', seed: c.record_number, virtual: false, count: groups.get(String(c.id)).length })),
        { key: 'sin', name: '', description: '', seed: 0, virtual: true, count: groups.get('sin').length },
    ];
    return { zone, category, items, groups };
}
app.get('/api/public/layout/:token/classifications', publicLayoutLimiter, (req, res) => {
    const row = getLayoutByPublicToken(req.params.token);
    if (!row) return res.status(404).json({ message: 'Layout not found.' });
    const locks = qrLocksOf('layout', row.clientId, row.costCenterId || 0);
    if (!locks.classifications) return layoutLockedReply(res);
    const ctx = publicClassificationContext(row, req.query);
    if (!ctx) return res.status(404).json({ message: 'Category not found.' });
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.json({ zoneName: ctx.zone.name, categoryName: ctx.category.name, categorySeed: ctx.category.record_number, items: ctx.items.map((i) => (locks.counts ? i : { ...i, count: undefined })) });
});
const CLASSIFICATION_PAGE_LIMIT = 30;
const naturalCompare = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });
app.get('/api/public/layout/:token/classification', publicSearchLimiter, async (req, res) => {
    try {
        const row = getLayoutByPublicToken(req.params.token);
        if (!row) return res.status(404).json({ message: 'Layout not found.' });
        const locks = qrLocksOf('layout', row.clientId, row.costCenterId || 0);
        if (!locks.classifications) return layoutLockedReply(res);
        const ctx = publicClassificationContext(row, req.query);
        const key = String(req.query.l || '');
        const meta = ctx && ctx.items.find((i) => i.key === key);
        if (!ctx || !meta) return res.status(404).json({ message: 'Classification not found.' });
        res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
        const spaceById = new Map((row.layout.spaces || []).filter((s) => s.active !== false).map((s) => [s.id, s]));
        // cada código con sus lugares ordenados: primero los que tienen anaquel (por anaquel, nivel y espacio) y al final los que aún no
        const codes = (ctx.groups.get(key) || []).map((code) => {
            const places = code.places.map((p) => { const sp = spaceById.get(p.spaceId); return { space: sp ? sp.code : '', spaceId: sp ? sp.id : '', level: Number(p.level) || 0, slot: Number(p.slot) || 0 }; })
                .sort((a, b) => (a.space ? 0 : 1) - (b.space ? 0 : 1) || naturalCompare(a.space, b.space) || a.level - b.level || a.slot - b.slot);
            const sku = padSku(code.record_number, code.sku_code);
            return {
                code, places, sku, name: code.custom_description || code.known_description || code.unique_description || '',
                fields: [sku, padSku(code.record_number), String(code.record_number), code.client_code, code.upc, code.unique_description, code.known_description, code.custom_description, ...(locks.where ? [...places.map((p) => p.space), ...places.filter((p) => p.level).map((p) => `nivel ${p.level}`)] : [])].map(foldText),
            };
        });
        const mode = PUBLIC_SEARCH_MODES.includes(req.query.mode) ? req.query.mode : 'contains';
        const query = publicSearchQuery(req.query.q);
        const filtering = SearchSyntax.ready(mode, query);
        const matches = publicSearchMatcher(mode, query);
        const found = (filtering ? codes.filter((c) => matches(c.fields)) : codes).sort((a, b) => {
            if (!locks.where) return a.code.record_number - b.code.record_number;
            const pa = a.places[0]; const pb = b.places[0];
            return ((pa && pa.space ? 0 : 1) - (pb && pb.space ? 0 : 1)) || naturalCompare(pa ? pa.space : '', pb ? pb.space : '') || (pa ? pa.level : 0) - (pb ? pb.level : 0) || (pa ? pa.slot : 0) - (pb ? pb.slot : 0) || a.code.record_number - b.code.record_number;
        });
        const offset = Math.max(0, Math.min(Number(req.query.offset) || 0, found.length));
        const limit = Math.max(1, Math.min(Number(req.query.limit) || CLASSIFICATION_PAGE_LIMIT, 60));
        const page = found.slice(offset, offset + limit);
        const photoOf = async (code) => {
            if (!locks.photos || !code.evidence_front || !isR2Configured()) return '';
            try { return await getDownloadUrl(code.evidence_front); } catch (err) { console.error('Clasificación pública: foto', err.message); return ''; }
        };
        const items = await Promise.all(page.map(async (c) => ({
            sku: c.sku, name: c.name, token: c.code.public_token || '', photo: await photoOf(c.code),
            loc: locks.where && c.places[0] && c.places[0].space ? { space: c.places[0].space, level: c.places[0].level, slot: c.places[0].slot, more: c.places.length - 1 } : null,
        })));
        res.json({
            zoneName: row.layout.zones.find((z) => z.id === ctx.zone.id).name, zoneId: ctx.zone.id, categoryName: ctx.category.name, categoryKey: `inventario.${ctx.category.id}`,
            classification: { key: meta.key, name: meta.name, description: meta.description, seed: meta.seed, virtual: meta.virtual, count: locks.counts ? meta.count : undefined },
            siblings: ctx.items.map((i) => ({ key: i.key, name: i.name, seed: i.seed, virtual: i.virtual, count: locks.counts ? i.count : undefined })),
            total: found.length, offset, items,
            // los anaqueles donde están los códigos que se están viendo (con la búsqueda aplicada): el croquis los rellena
            spaceIds: locks.where ? [...new Set(found.flatMap((c) => c.places.map((p) => p.spaceId).filter(Boolean)))] : [],
        });
    } catch (err) {
        console.error('Clasificación pública: no se pudo armar', err);
        res.status(500).json({ message: 'Failed to load classification.' });
    }
});

// --- Nuestras Categorías <Tipo> (Catálogos > Cadena de Suministro > C. -----
// --- Distribución) -- 7 near-identical catalogs sharing one generic route --
// set, :categoryType validated against ARTICLE_CATEGORY_TYPES (db.js) on
// every request. Each type maps to its own tableKey for permission grants
// (see TABLE_GRANT_PATHS), so a role granted "Nuestras Categorías Rotación"
// doesn't thereby see/edit any of the other 6.
const ARTICLE_CATEGORY_AREA_LABEL = 'C. Distribución';
const ARTICLE_CATEGORY_MODULE_LABEL = 'Cadena de Suministro';

function articleCategoryTypeConfig(categoryType) {
    return ARTICLE_CATEGORY_TYPES[categoryType] || null;
}

// --- Almacenes y Sub almacenes (Catálogos > C. Distribución) -----------------
// Mismo catálogo genérico de arriba (código, nombre, descripción, estatus) con campos propios:
//  almacenes     -> parentId = centro de costos (Servicio Contratado)
//  sub-almacenes -> parentId = almacén; kind = physical | virtual; locations = zonas (completas) y anaqueles del Layout que le pertenecen (solo si es físico).
// Una zona o un anaquel solo puede pertenecer a UN sub almacén físico activo; el Layout es la fuente de las zonas y anaqueles.
const WAREHOUSE_TYPES = new Set(['almacenes', 'sub-almacenes']);
const SUB_WAREHOUSE_KIND_LABELS = { physical: 'Físico', virtual: 'Virtual' };

// Zonas y anaqueles activos de UN Layout (row = lo que regresa getClientLayout / listClientLayouts).
function layoutIndexOf(row) {
    const zones = ((row && row.layout.zones) || []).filter((z) => z.active !== false);
    const spaces = ((row && row.layout.spaces) || []).filter((s) => s.active !== false);
    const footprints = ((row && row.layout.footprints) || []).filter((f) => f.active !== false);
    // positions: las posiciones de cada espacio («activo|nivel|espacio» -> [{ id, num… }] por número), con las de fábrica incluidas
    return { zones, spaces, footprints, positions: row ? LayoutCalc.positionIndex(row.layout) : new Map(), zoneById: new Map(zones.map((z) => [z.id, z])), spaceById: new Map(spaces.map((s) => [s.id, s])), footprintById: new Map(footprints.map((f) => [f.id, f])) };
}
// El Layout es de un centro de costos: costCenterId sin indicar = el primer Layout del cliente (las pantallas que todavía no eligen centro).
function warehouseLayoutIndex(clientId, costCenterId) {
    return layoutIndexOf(getClientLayout(clientId, { costCenterId }));
}
// El centro de costos de un sub almacén es el de su almacén (parent_id del sub = almacén; parent_id del almacén = centro). null = el almacén todavía no tiene centro.
function costCenterOfWarehouse(clientId, isTest, warehouseId) {
    const wh = warehouseId ? getArticleCategoryById(warehouseId, clientId, isTest) : null;
    return wh && wh.category_type === 'almacenes' ? (wh.parent_id || null) : null;
}

// locations se guarda como texto JSON canónico: [{"z":"<zona>"}] = zona completa, [{"z":"<zona>","s":["<anaquel>",...]}] = solo esos anaqueles.
function parseWarehouseLocations(text) {
    let list;
    try { list = JSON.parse(text || '[]'); } catch { return []; }
    if (!Array.isArray(list)) return [];
    return list.filter((e) => e && typeof e.z === 'string').map((e) => ({ zoneId: e.z, spaceIds: Array.isArray(e.s) ? e.s.filter((x) => typeof x === 'string') : [] }));
}

// Recibe [{ zoneId, spaceIds: [] }] ([] = zona completa), lo valida contra el Layout del centro (idx) y lo deja en orden del Layout.
function canonicalWarehouseLocations(idx, input) {
    if (input === '' || input == null) return { value: '', entries: [] };
    if (!Array.isArray(input)) return { error: 'Las ubicaciones no tienen el formato correcto.' };
    const byZone = new Map();
    for (const raw of input) {
        const zoneId = raw && typeof raw.zoneId === 'string' ? raw.zoneId : '';
        if (!idx.zoneById.has(zoneId)) return { error: 'Una de las zonas ya no existe en el Layout. Vuelve a elegirla.' };
        const ids = Array.isArray(raw.spaceIds) ? raw.spaceIds : [];
        const cur = byZone.get(zoneId) || { spaceIds: new Set(), whole: false };
        if (!ids.length) cur.whole = true;
        for (const sid of ids) {
            const space = idx.spaceById.get(sid);
            if (!space || space.zoneId !== zoneId) return { error: 'Uno de los anaqueles ya no está en esa zona del Layout. Vuelve a elegirlo.' };
            cur.spaceIds.add(sid);
        }
        byZone.set(zoneId, cur);
    }
    const entries = [];
    idx.zones.forEach((z) => {
        const cur = byZone.get(z.id);
        if (!cur) return;
        entries.push({ zoneId: z.id, spaceIds: cur.whole ? [] : idx.spaces.filter((s) => cur.spaceIds.has(s.id)).map((s) => s.id) });
    });
    const value = entries.length ? JSON.stringify(entries.map((e) => (e.spaceIds.length ? { z: e.zoneId, s: e.spaceIds } : { z: e.zoneId }))) : '';
    return { value, entries };
}

function describeWarehouseLocations(idx, text) {
    return parseWarehouseLocations(text).map((e) => {
        const zone = idx.zoneById.get(e.zoneId);
        if (!zone) return '';
        if (!e.spaceIds.length) return `${zone.name} (toda)`;
        const codes = e.spaceIds.map((sid) => (idx.spaceById.get(sid) || {}).code).filter(Boolean);
        return codes.length ? `${zone.name}: ${codes.join(', ')}` : '';
    }).filter(Boolean).join(' · ');
}

// Si otro sub almacén físico y activo del MISMO centro de costos ya tiene la zona (o alguno de los anaqueles pedidos) devuelve el mensaje; si no, ''.
function findWarehouseLocationConflict(clientId, isTest, selfId, entries, idx, center) {
    const centerOfWarehouse = new Map(listArticleCategories(clientId, 'almacenes', isTest).map((w) => [w.id, w.parent_id || null]));
    for (const other of listArticleCategories(clientId, 'sub-almacenes', isTest)) {
        if (other.id === selfId || other.status !== 'active' || other.kind !== 'physical') continue;
        if ((centerOfWarehouse.get(other.parent_id) || null) !== (center || null)) continue;
        const label = other.name || `SUB-${String(other.record_number).padStart(3, '0')}`;
        for (const oe of parseWarehouseLocations(other.locations)) {
            for (const e of entries) {
                if (e.zoneId !== oe.zoneId) continue;
                const zoneName = (idx.zoneById.get(e.zoneId) || {}).name || '';
                if (!e.spaceIds.length || !oe.spaceIds.length) {
                    return `La zona "${zoneName}" ya está asignada al sub almacén "${label}" (completa o con alguno de sus anaqueles). Una zona o un anaquel solo puede pertenecer a un sub almacén.`;
                }
                const shared = e.spaceIds.find((sid) => oe.spaceIds.includes(sid));
                if (shared) return `El anaquel "${(idx.spaceById.get(shared) || {}).code || ''}" ya está asignado al sub almacén "${label}". Un anaquel solo puede pertenecer a un sub almacén.`;
            }
        }
    }
    return '';
}

function warehouseContext(req, categoryType) {
    if (!WAREHOUSE_TYPES.has(categoryType)) return null;
    const { clientId, isTestAccount } = req.user;
    return {
        costCenters: new Map(listCostCenters(clientId, isTestAccount).map((c) => [c.id, c.name])),
        warehouses: new Map(listArticleCategories(clientId, 'almacenes', isTestAccount).map((r) => [r.id, r.name])),
    };
}

// Revisa y deja listo el PATCH de un almacén o sub almacén (los demás catálogos pasan igual). Devuelve { error: { status, message } } o { patch, sanitizers }.
function prepareWarehousePatch(req, categoryType, existing, patch) {
    const sanitizers = {};
    if (!WAREHOUSE_TYPES.has(categoryType)) return { patch, sanitizers };
    const { clientId, isTestAccount } = req.user;
    const out = { ...patch };
    const has = (key) => Object.prototype.hasOwnProperty.call(out, key);
    const bad = (message) => ({ error: { status: 400, message } });
    if (has('parentId')) {
        if (out.parentId === '' || out.parentId == null) out.parentId = null;
        else {
            const id = Number(out.parentId);
            if (!Number.isInteger(id)) return bad('Elige una opción de la lista.');
            if (categoryType === 'almacenes') {
                if (!getCostCenterById(id, clientId, isTestAccount)) return bad('Ese centro de costos no existe.');
                if (id !== existing.parent_id && !listCompleteCostCenterIds(clientId, isTestAccount).includes(id)) return bad('Ese centro de costos está incompleto o inactivo. Complétalo primero en Nuestros Centros Costos.');
            } else {
                const wh = getArticleCategoryById(id, clientId, isTestAccount);
                if (!wh || wh.category_type !== 'almacenes') return bad('Ese almacén no existe.');
                if (wh.status !== 'active' && wh.id !== existing.parent_id) return bad('Ese almacén está inactivo. Elige uno activo.');
            }
            out.parentId = id;
        }
        // Un almacén que ya tiene sub almacenes o códigos relacionados no se pasa a otro centro de costos: su Layout y sus ubicaciones son los del centro de antes.
        if (categoryType === 'almacenes' && existing.parent_id && out.parentId !== existing.parent_id) {
            const hasSubs = listArticleCategories(clientId, 'sub-almacenes', isTestAccount).some((r) => r.parent_id === existing.id);
            if (hasSubs || listCodeRelationsBy(clientId, isTestAccount, 'warehouse_id', existing.id).length) {
                return { error: { status: 409, message: 'Este almacén ya tiene sub almacenes o códigos relacionados, así que no se puede pasar a otro centro de costos. Márcalo Inactivo y crea otro en el centro nuevo.' } };
            }
        }
    }
    // Las zonas y los anaqueles de un sub almacén salen del Layout del centro de costos de su almacén.
    const center = categoryType === 'sub-almacenes' ? costCenterOfWarehouse(clientId, isTestAccount, has('parentId') ? out.parentId : existing.parent_id) : null;
    const idx = categoryType === 'sub-almacenes' ? warehouseLayoutIndex(clientId, center) : null;
    if (categoryType === 'sub-almacenes') {
        if (has('kind') && !['', 'physical', 'virtual'].includes(out.kind)) return bad('El tipo debe ser Físico o Virtual.');
        // Pasarlo a un almacén de otro centro: sus zonas y anaqueles eran del Layout del centro anterior.
        if (has('parentId') && existing.parent_id && center !== costCenterOfWarehouse(clientId, isTestAccount, existing.parent_id)) {
            const after = has('locations') ? (Array.isArray(out.locations) ? out.locations : []) : parseWarehouseLocations(existing.locations);
            if (after.length) return { error: { status: 409, message: 'Este sub almacén tiene zonas o anaqueles del Layout de otro centro de costos. Quítalos primero y luego cámbialo de almacén.' } };
            if (listCodeRelationsBy(clientId, isTestAccount, 'sub_warehouse_id', existing.id).length) return { error: { status: 409, message: 'Ya hay códigos relacionados en Relación Código. Quítalos primero o crea otro sub almacén en el almacén del otro centro.' } };
        }
        if (has('locations')) {
            const canon = canonicalWarehouseLocations(idx, out.locations);
            if (canon.error) return bad(canon.error);
            out.locations = canon.value;
        }
        const kind = has('kind') ? out.kind : existing.kind;
        const locations = has('locations') ? out.locations : existing.locations;
        if (has('locations') && out.locations && kind !== 'physical') return bad('Un sub almacén virtual (o sin tipo) no lleva ubicación física. Primero elige Físico.');
        if (kind === 'physical' && locations && (has('locations') || has('kind'))) {
            const conflict = findWarehouseLocationConflict(clientId, isTestAccount, existing.id, parseWarehouseLocations(locations), idx, center);
            if (conflict) return { error: { status: 409, message: conflict } };
        }
        // Si ya hay códigos ubicados en una zona o anaquel de este sub almacén, no se le puede quitar (ni pasarlo a Virtual) sin quitar primero esos códigos.
        if (has('locations') || has('kind')) {
            const used = listCodeRelationsBy(clientId, isTestAccount, 'sub_warehouse_id', existing.id).filter((r) => r.zone_id);
            if (used.length) {
                const entries = kind === 'physical' ? parseWarehouseLocations(locations) : [];
                const outside = used.find((r) => { const e = entries.find((x) => x.zoneId === r.zone_id); return !e || (e.spaceIds.length && !e.spaceIds.includes(r.space_id)); });
                if (outside) return { error: { status: 409, message: 'Hay códigos ubicados en esas zonas o anaqueles (Relación Código). Quítalos primero.' } };
            }
        }
    }
    const nameOf = (v) => {
        if (v == null || v === '') return '';
        const id = Number(v);
        const row = categoryType === 'almacenes' ? getCostCenterById(id, clientId, isTestAccount) : getArticleCategoryById(id, clientId, isTestAccount);
        return (row && row.name) || String(v);
    };
    sanitizers.parentId = nameOf;
    sanitizers.kind = (v) => SUB_WAREHOUSE_KIND_LABELS[v] || '';
    if (idx) sanitizers.locations = (v) => describeWarehouseLocations(idx, v);
    return { patch: out, sanitizers };
}

// --- Clasificaciones de cada categoría de Inventario ---------------------------------------------------------------------------
// classification_ids se guarda como texto JSON canónico ([id, id, ...] en el orden del catálogo; '' = ninguna). Cada id es una fila de Nuestras Clasificaciones del mismo cliente.
function parseClassificationIds(text) {
    let list;
    try { list = JSON.parse(text || '[]'); } catch { return []; }
    return Array.isArray(list) ? list.map(Number).filter((n) => Number.isInteger(n)) : [];
}

// Contexto que necesitan los registros del catálogo para mostrar nombres: almacenes / sub almacenes (centros de costos, almacenes) o Inventario (nombres de sus clasificaciones).
function categoryContext(req, categoryType) {
    const warehouse = warehouseContext(req, categoryType);
    if (warehouse || categoryType !== 'inventario') return warehouse;
    const { clientId, isTestAccount } = req.user;
    return { classifications: new Map(listArticleCategories(clientId, 'clasificaciones', isTestAccount).map((r) => [r.id, { name: r.name, status: r.status }])) };
}

// Revisa el PATCH de las clasificaciones de una categoría de Inventario: ids que existen en el catálogo (las inactivas solo si ya estaban puestas), sin repetir y en el orden del catálogo.
function prepareClassificationPatch(req, categoryType, existing, patch) {
    if (categoryType !== 'inventario' || !Object.prototype.hasOwnProperty.call(patch, 'classificationIds')) return { patch, sanitizers: {} };
    const { clientId, isTestAccount } = req.user;
    const bad = (message) => ({ error: { status: 400, message } });
    const input = patch.classificationIds;
    let ids = [];
    if (input !== '' && input != null) {
        if (!Array.isArray(input) || !input.every((n) => Number.isInteger(Number(n)))) return bad('Las clasificaciones no tienen el formato correcto.');
        ids = [...new Set(input.map(Number))];
    }
    const all = listArticleCategories(clientId, 'clasificaciones', isTestAccount);
    const byId = new Map(all.map((r) => [r.id, r]));
    const current = new Set(parseClassificationIds(existing.classification_ids));
    for (const id of ids) {
        const row = byId.get(id);
        if (!row) return bad('Una de las clasificaciones ya no existe. Vuelve a elegirla.');
        if (row.status !== 'active' && !current.has(id)) return bad(`La clasificación "${row.name || `CLA-${String(row.record_number).padStart(3, '0')}`}" está inactiva. Elige una activa.`);
    }
    // Una clasificación que ya tienen códigos de esta categoría no se le puede quitar: esos códigos quedarían con una clasificación que su categoría no ofrece.
    if (existing.name) {
        for (const id of current) {
            if (ids.includes(id)) continue;
            const n = countSkuItemsByClassification(clientId, isTestAccount, id, existing.name);
            if (n) return { error: { status: 409, message: `Hay ${n === 1 ? 'un código' : `${n} códigos`} de "${existing.name}" con la clasificación "${(byId.get(id) || {}).name || ''}". Cámbialos primero en Alta o Edición Código.` } };
        }
    }
    const ordered = all.filter((r) => ids.includes(r.id)).map((r) => r.id);
    const nameOf = (value) => parseClassificationIds(value).map((id) => (byId.get(id) || {}).name).filter(Boolean).join(', ');
    return { patch: { ...patch, classificationIds: ordered.length ? JSON.stringify(ordered) : '' }, sanitizers: { classificationIds: nameOf } };
}

// Clasificación de Activos: su campo propio es la métrica (kind): 'm2' = cuenta en los m² de mobiliario, 'm3' = mide los m³ de almacenamiento.
const ASSET_CLASS_METRIC_LABELS = { m2: 'm² (activo para operar)', m3: 'm³ (activo para almacenar)' };
// Tipo de activo: su campo propio es la LETRA del Localizador (kind = el tipo de espacio del Layout que le toca; vacío = sin letra todavía).
const ASSET_TYPE_LETTER_LABELS = { rack: 'A · Anaquel', rackpal: 'R · Rack', cabinet: 'G · Gabeta', pallet: 'T · Tarima en piso', cold: 'F · Frío', cart: 'M · Rack móvil', sensor: 'Sensor' }; // «Sensor» se coloca en el paso Sensores del Layout (sobre una pared), no sobre una huella
function prepareFixedAssetPatch(categoryType, patch, req = null, existing = null) {
    const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);
    if ((categoryType !== 'activos-clasificacion' && categoryType !== 'activos-fijos') || (!has('kind') && !(categoryType === 'activos-fijos' && has('letter')))) return { patch, sanitizers: {} };
    if (categoryType === 'activos-fijos') {
        const out = { patch: { ...patch }, sanitizers: {} };
        // «Se dibuja como»: el tipo de espacio del Layout que le toca (kind). Vacío = sin dibujo propio (su activo conserva el que ya tenía).
        if (has('kind')) {
            if (patch.kind !== '' && !ASSET_TYPE_LETTER_LABELS[patch.kind]) return { error: { status: 400, message: 'El dibujo debe ser Anaquel, Rack, Gabeta, Tarima en piso, Frío, Rack móvil o Sensor (o quedar vacío).' } };
            out.sanitizers.kind = (v) => ASSET_TYPE_LETTER_LABELS[v] || '';
        }
        // «Letra del código»: con ella empieza el código de los activos de este tipo en Alta Activos (R001, L001…). Una letra de la A a la Z, distinta en cada tipo de la empresa; ya con activos no se cambia (sus códigos la llevan).
        if (has('letter')) {
            const letter = String(patch.letter == null ? '' : patch.letter).trim().toUpperCase();
            if (letter && !/^[A-Z]{1,2}$/.test(letter)) return { error: { status: 400, message: 'El código del tipo lleva una o dos letras de la A a la Z (por ejemplo R o RK), o queda vacío.' } };
            // Z, H, N, E y P son las piezas del Localizador (zona, huella, nivel, espacio y posición): un código de activo de una sola de esas letras se confundiría con ellas. Con dos letras (ES, HT, PR…) sí se puede.
            if (/^[ZHNEP]$/.test(letter)) return { error: { status: 400, message: `La letra ${letter} la usa el Localizador (Z zona, H huella, N nivel, E espacio, P posición): elige otra o usa dos letras (por ejemplo ${letter}K).` } };
            if (req && existing) {
                if (letter) {
                    const other = listArticleCategories(req.user.clientId, 'activos-fijos', req.user.isTestAccount).find((r) => r.id !== existing.id && String(r.letter || '').toUpperCase() === letter);
                    if (other) return { error: { status: 409, message: `La letra ${letter} ya la usa «${other.name || other.letter}». Cada tipo de activo lleva letras distintas.` } };
                }
                if (letter !== String(existing.letter || '').toUpperCase()) {
                    const used = countFixedAssetsByType(req.user.clientId, existing.id);
                    if (used) return { error: { status: 409, message: `Ya hay ${used === 1 ? 'un activo' : `${used} activos`} de este tipo en Alta Activos y sus códigos llevan la letra ${String(existing.letter || '').toUpperCase() || '—'}: no se puede cambiar.` } };
                }
            }
            out.patch.letter = letter;
            out.sanitizers.letter = (v) => String(v == null ? '' : v).toUpperCase();
        }
        return out;
    }
    if (!['', 'm2', 'm3'].includes(patch.kind)) return { error: { status: 400, message: 'La métrica debe ser m² o m³.' } };
    return { patch, sanitizers: { kind: (v) => ASSET_CLASS_METRIC_LABELS[v] || '' } };
}

// Lo que transita: su tipo (persona, montacargas, carrito, plataforma u otro) y sus medidas en metros (ancho, largo y alto).
const TRANSIT_EQUIPMENT_KINDS = ['person', 'forklift', 'cart', 'platform', 'other'];
const TRANSIT_EQUIPMENT_KIND_LABELS = { person: 'Persona', forklift: 'Montacargas', cart: 'Carrito', platform: 'Plataforma', other: 'Otro' };
function prepareTransitEquipmentPatch(categoryType, patch) {
    if (categoryType !== 'transito-equipos') return { patch, sanitizers: {} };
    const out = { ...patch };
    if (Object.prototype.hasOwnProperty.call(out, 'kind') && !['', ...TRANSIT_EQUIPMENT_KINDS].includes(out.kind)) {
        return { error: { status: 400, message: 'El tipo debe ser Persona, Montacargas, Carrito, Plataforma u Otro.' } };
    }
    for (const key of ['widthM', 'lengthM', 'heightM']) {
        if (!Object.prototype.hasOwnProperty.call(out, key)) continue;
        if (out[key] === '' || out[key] === null) { out[key] = 0; continue; }
        const n = Number(out[key]);
        if (!Number.isFinite(n) || n < 0 || n > 50) return { error: { status: 400, message: 'La medida debe ser un número entre 0 y 50 metros.' } };
        out[key] = Math.round(n * 1000) / 1000;
    }
    return { patch: out, sanitizers: { kind: (v) => TRANSIT_EQUIPMENT_KIND_LABELS[v] || '' } };
}
// Criterios de Incidentes: cada criterio pertenece a UNA categoría de incidente (kind): No conformidad Mayor, No conformidad Menor o Recomendación.
const INCIDENT_CATEGORY_LABELS = { mayor: 'No conformidad Mayor', menor: 'No conformidad Menor', recomendacion: 'Recomendación' };
function prepareIncidentCriterionPatch(categoryType, patch) {
    if (categoryType !== 'incidentes-criterios' || !Object.prototype.hasOwnProperty.call(patch, 'kind')) return { patch, sanitizers: {} };
    if (!['', ...INCIDENT_CATEGORIES].includes(patch.kind)) return { error: { status: 400, message: 'La categoría debe ser No conformidad Mayor, No conformidad Menor o Recomendación.' } };
    return { patch, sanitizers: { kind: (v) => INCIDENT_CATEGORY_LABELS[v] || '' } };
}
function mapArticleCategoryRecord(row, pendingByRecord, companyName, ctx = null) {
    if (!row) return row;
    const config = articleCategoryTypeConfig(row.category_type);
    return {
        id: row.id,
        registroUnico: row.db_id,
        code: `${config?.prefix || 'CAT'}-${String(row.record_number).padStart(3, '0')}`,
        name: row.name,
        description: row.description,
        status: row.status,
        ...(ctx && row.category_type === 'almacenes' ? { parentId: row.parent_id, parentName: ctx.costCenters.get(row.parent_id) || '' } : {}),
        ...(ctx && row.category_type === 'sub-almacenes' ? {
            parentId: row.parent_id, parentName: ctx.warehouses.get(row.parent_id) || '',
            kind: row.kind, locations: row.kind === 'physical' ? parseWarehouseLocations(row.locations) : [],
        } : {}),
        ...(row.category_type === 'activos-clasificacion' || row.category_type === 'activos-fijos' ? { kind: row.kind } : {}),
        ...(row.category_type === 'activos-fijos' ? { letter: row.letter || '' } : {}),
        ...(row.category_type === 'incidentes-criterios' ? { kind: row.kind } : {}),
        ...(row.category_type === 'transito-equipos' ? { kind: row.kind, widthM: row.width_m || 0, lengthM: row.length_m || 0, heightM: row.height_m || 0 } : {}),
        ...(ctx && row.category_type === 'inventario' ? (() => {
            const ids = parseClassificationIds(row.classification_ids);
            return { classificationIds: ids, classifications: ids.map((id) => ({ id, ...(ctx.classifications.get(id) || {}) })).filter((c) => c.name !== undefined) };
        })() : {}),
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({
            companyName,
            area: config?.area || ARTICLE_CATEGORY_AREA_LABEL,
            modulo: ARTICLE_CATEGORY_MODULE_LABEL,
            pantalla: config?.pantalla || 'Nuestras Categorías',
            centroCostos: '',
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/article-categories/:categoryType', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const config = articleCategoryTypeConfig(req.params.categoryType);
    if (!config) return res.status(404).json({ message: 'Unknown category type.' });
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, config.tableKey);
    const client = getClientById(req.user.clientId);
    res.json({
        categories: listArticleCategories(req.user.clientId, req.params.categoryType, req.user.isTestAccount)
            .map((r) => mapArticleCategoryRecord(r, pendingByRecord, client?.company_name, categoryContext(req, req.params.categoryType))),
    });
});

app.post('/api/business/article-categories/:categoryType', requireAuth, requireCostCenterForWarehouses, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const config = articleCategoryTypeConfig(req.params.categoryType);
    if (!config) return res.status(404).json({ message: 'Unknown category type.' });
    // Las clasificaciones de activos son tres y fijas (Activo para operar, para almacenar y para administrar): no se agregan más.
    // (una cuenta de prueba solo ve lo que ella misma crea: para que pueda armar sus dos clasificaciones sí puede agregarlas)
    if (req.params.categoryType === 'activos-clasificacion' && !req.user.isTestAccount) return res.status(403).json({ message: 'Las clasificaciones de activos son fijas: Activo para operar, Activo para almacenar y Activo para administrar.' });
    if (!req.user.isClientAdmin && !canCreateColumn(getUserEffectiveGrants(req.user.sub), config.tableKey, 'colCatCreateAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para crear registros aquí.' });
    }
    const category = createArticleCategory({ clientId: req.user.clientId, categoryType: req.params.categoryType, isTestData: req.user.isTestAccount });
    logTableChange({
        clientId: req.user.clientId, tableKey: config.tableKey, recordId: category.id,
        recordLabel: `#${category.id}`, action: 'create', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, config.tableKey, 'create', `#${category.id}`);
    const client = getClientById(req.user.clientId);
    res.status(201).json({ category: mapArticleCategoryRecord(category, null, client?.company_name, categoryContext(req, req.params.categoryType)) });
});

app.patch('/api/business/article-categories/:categoryType/:id', requireAuth, requireCostCenterForWarehouses, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const config = articleCategoryTypeConfig(req.params.categoryType);
    if (!config) return res.status(404).json({ message: 'Unknown category type.' });
    const existing = getArticleCategoryById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing || existing.category_type !== req.params.categoryType) return res.status(404).json({ message: 'Category not found.' });
    const { baseline, overrideConflicts, ...rawPatch } = req.body || {};
    const preparedWarehouse = prepareWarehousePatch(req, req.params.categoryType, existing, rawPatch);
    if (preparedWarehouse.error) return res.status(preparedWarehouse.error.status).json({ message: preparedWarehouse.error.message });
    const preparedClassification = prepareClassificationPatch(req, req.params.categoryType, existing, preparedWarehouse.patch);
    if (preparedClassification.error) return res.status(preparedClassification.error.status).json({ message: preparedClassification.error.message });
    const preparedFixedAsset = prepareFixedAssetPatch(req.params.categoryType, preparedClassification.patch, req, existing);
    if (preparedFixedAsset.error) return res.status(preparedFixedAsset.error.status).json({ message: preparedFixedAsset.error.message });
    const preparedTransit = prepareTransitEquipmentPatch(req.params.categoryType, preparedFixedAsset.patch);
    if (preparedTransit.error) return res.status(preparedTransit.error.status).json({ message: preparedTransit.error.message });
    const preparedIncident = prepareIncidentCriterionPatch(req.params.categoryType, preparedTransit.patch);
    if (preparedIncident.error) return res.status(preparedIncident.error.status).json({ message: preparedIncident.error.message });
    const prepared = { patch: preparedIncident.patch, sanitizers: { ...preparedWarehouse.sanitizers, ...preparedClassification.sanitizers, ...preparedFixedAsset.sanitizers, ...preparedTransit.sanitizers, ...preparedIncident.sanitizers } };
    const { appliedPatch, pendingFields, rejectedFields, conflictFields } = checkAndLogFieldChanges(req, existing, prepared.patch, articleCategoryPatchableFields(req.params.categoryType), config.tableKey, `#${existing.id}`, prepared.sanitizers, { baseline, overrideConflicts });
    const category = updateArticleCategory(req.params.id, req.user.clientId, appliedPatch, req.user.isTestAccount);
    const client = getClientById(req.user.clientId);
    res.json({ category: mapArticleCategoryRecord(category, null, client?.company_name, categoryContext(req, req.params.categoryType)), pendingFields, rejectedFields, conflictFields });
});

app.delete('/api/business/article-categories/:categoryType/:id', requireAuth, requireCostCenterForWarehouses, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const config = articleCategoryTypeConfig(req.params.categoryType);
    if (!config) return res.status(404).json({ message: 'Unknown category type.' });
    const existing = getArticleCategoryById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing || existing.category_type !== req.params.categoryType) return res.status(404).json({ message: 'Category not found.' });
    if (req.params.categoryType === 'activos-clasificacion' && !req.user.isTestAccount) return res.status(403).json({ message: 'Las clasificaciones de activos son fijas: no se eliminan (solo se pueden dejar Inactivas).' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canDeleteColumn(grants, config.tableKey, 'colCatDeleteAuth')) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar categorías.' });
        }
    }
    // Un tipo de activo o una clasificación que algún activo de Alta Activos ya usa no se borra (se deja Inactivo): esos activos perderían su tipo.
    if (req.params.categoryType === 'activos-clasificacion' || req.params.categoryType === 'activos-fijos') {
        const usedAssets = req.params.categoryType === 'activos-fijos' ? countFixedAssetsByType(req.user.clientId, existing.id) : countFixedAssetsByClass(req.user.clientId, existing.id);
        if (usedAssets) return res.status(409).json({ message: `Hay ${usedAssets === 1 ? 'un activo' : `${usedAssets} activos`} en Alta Activos con ${req.params.categoryType === 'activos-fijos' ? 'este tipo' : 'esta clasificación'}. Márcalo como Inactivo en vez de eliminarlo.` });
    }
    // Una clasificación o un tipo de activo que algún espacio del Layout ya usa no se borra (se deja Inactivo): esos espacios perderían su activo.
    if (req.params.categoryType === 'activos-clasificacion' || req.params.categoryType === 'activos-fijos') {
        const field = req.params.categoryType === 'activos-clasificacion' ? 'assetClassId' : 'assetId';
        const used = listClientLayouts(req.user.clientId).flatMap((l) => l.layout.spaces || []).filter((s) => s[field] === existing.id);
        if (used.length) {
            const codes = used.slice(0, 3).map((s) => s.code).filter(Boolean).join(', ');
            return res.status(409).json({ message: `Hay ${used.length === 1 ? 'un espacio' : `${used.length} espacios`} del Layout con este activo${codes ? ` (${codes}${used.length > 3 ? '…' : ''})` : ''}. Cámbialos primero en Layout > Activos o márcalo como Inactivo.` });
        }
    }
    // Un renglón de «Lo que transita» que algún pasillo u objeto de un Layout ya usa no se borra (se deja Inactivo): esos pasillos y objetos perderían sus medidas.
    if (req.params.categoryType === 'transito-equipos') {
        const used = listClientLayouts(req.user.clientId).filter((l) => (l.layout.transit || []).some((p) => (p.who || []).includes(existing.id)) || (l.layout.objects || []).some((o) => Number(o.equipId) === existing.id));
        if (used.length) return res.status(409).json({ message: 'Hay pasillos u objetos de un Layout que usan este renglón. Cámbialos primero en Layout > Tránsito u Objetos, o márcalo como Inactivo.' });
    }
    // Un criterio que algún reporte de Incidentes ya usó no se borra (se deja Inactivo): esos reportes perderían el criterio con el que se clasificaron.
    if (req.params.categoryType === 'incidentes-criterios') {
        const used = countIncidentsByCriterion(req.user.clientId, existing.id);
        if (used) return res.status(409).json({ message: `Hay ${used === 1 ? 'un reporte' : `${used} reportes`} de Incidentes con este criterio. Márcalo como Inactivo en vez de eliminarlo.` });
    }
    // Una marca que alguna presentación de Presentaciones de Distribución ya usa no se borra (se deja Inactiva): esas presentaciones perderían su marca.
    if (req.params.categoryType === 'marcas') {
        const used = countSkuDistributionByBrand(req.user.clientId, existing.id);
        if (used) return res.status(409).json({ message: `Hay ${used === 1 ? 'un código' : `${used} códigos`} con esta marca en Presentaciones de Distribución. Quita la marca de ahí primero o márcala como Inactiva.` });
    }
    // Un lugar de envío al que alguna presentación envía no se borra (se deja Inactivo): esas presentaciones perderían el lugar.
    if (req.params.categoryType === 'lugares-envio') {
        const used = countSkuDistributionByShipTo(req.user.clientId, existing.id);
        if (used) return res.status(409).json({ message: `Hay ${used === 1 ? 'una presentación' : `${used} presentaciones`} que se envían a este lugar en Presentaciones de Distribución. Quítalo de ahí primero o márcalo como Inactivo.` });
        const related = countCodeShipRelationsByPlace(req.user.clientId, existing.id);
        if (related) return res.status(409).json({ message: `Hay ${related === 1 ? 'una relación' : `${related} relaciones`} de códigos con este lugar en Relación Código Envío. Quítalas de ahí primero o márcalo como Inactivo.` });
    }
    // Un almacén con sub almacenes no se borra (se deja Inactivo): los sub almacenes quedarían sin almacén.
    if (req.params.categoryType === 'almacenes'
        && listArticleCategories(req.user.clientId, 'sub-almacenes', req.user.isTestAccount).some((r) => r.parent_id === existing.id)) {
        return res.status(409).json({ message: 'Este almacén tiene sub almacenes. Quítalos primero o márcalo como Inactivo.' });
    }
    // Una clasificación que alguna categoría de Inventario ya tiene no se borra (se deja Inactiva): esas categorías la perderían.
    if (req.params.categoryType === 'clasificaciones') {
        const users = listArticleCategories(req.user.clientId, 'inventario', req.user.isTestAccount).filter((r) => parseClassificationIds(r.classification_ids).includes(existing.id));
        const codes = countSkuItemsByClassification(req.user.clientId, req.user.isTestAccount, existing.id);
        if (codes) return res.status(409).json({ message: `Hay ${codes === 1 ? 'un código' : `${codes} códigos`} con esta clasificación. Cámbialos primero o márcala como Inactiva.` });
        if (users.length) return res.status(409).json({ message: `Esta clasificación está asignada a ${users.length === 1 ? 'una categoría' : `${users.length} categorías`} de Inventario (${users.slice(0, 3).map((r) => r.name || `INV-${String(r.record_number).padStart(3, '0')}`).join(', ')}). Quítala de ahí primero o márcala como Inactiva.` });
    }
    if (WAREHOUSE_TYPES.has(req.params.categoryType)
        && listCodeRelationsBy(req.user.clientId, req.user.isTestAccount, req.params.categoryType === 'almacenes' ? 'warehouse_id' : 'sub_warehouse_id', existing.id).length) {
        return res.status(409).json({ message: 'Ya hay códigos relacionados en Relación Código. Quítalos primero o márcalo como Inactivo.' });
    }
    logTableChange({
        clientId: req.user.clientId, tableKey: config.tableKey, recordId: existing.id,
        recordLabel: `#${existing.id}`, action: 'delete', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, config.tableKey, 'delete', `#${existing.id}`);
    deleteArticleCategory(req.params.id, req.user.clientId);
    res.status(204).end();
});

// Alta Nuestros Artículos' own 7 "Categoría X" selects fetch every catalog's
// ACTIVE names in one request instead of 7 separate ones -- see
// listActiveArticleCategoryNames (db.js) for why Inactivo values are
// excluded here without affecting an artículo that already has one.
app.get('/api/business/article-categories-active', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const options = {};
    Object.keys(ARTICLE_CATEGORY_TYPES).forEach((categoryType) => {
        options[categoryType] = listActiveArticleCategoryNames(req.user.clientId, categoryType, req.user.isTestAccount);
    });
    // Para el campo Clasificación del código: por cada Categoría Inventario (su nombre, que es lo que guarda el código), las clasificaciones activas que tiene.
    const classificationsByInventory = {};
    listArticleCategories(req.user.clientId, 'inventario', req.user.isTestAccount).forEach((cat) => {
        if (!cat.name) return;
        classificationsByInventory[cat.name] = inventoryClassificationsFor(req.user.clientId, req.user.isTestAccount, cat.name)
            .filter((c) => c.status === 'active').map((c) => ({ id: c.id, name: c.name }));
    });
    res.json({ options, classificationsByInventory });
});

// Lo que necesitan las pantallas Almacenes y Sub almacenes para sus listas: los centros de costos completos, los almacenes y, por cada centro, las zonas / anaqueles de SU Layout (zonesByCenter).
app.get('/api/business/warehouse-options', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const complete = new Set(listCompleteCostCenterIds(clientId, isTestAccount));
    const zonesByCenter = {};
    listClientLayouts(clientId).forEach((row) => {
        const idx = layoutIndexOf(row);
        zonesByCenter[row.costCenterId || 0] = idx.zones.map((z) => ({ id: z.id, name: z.name, spaces: idx.spaces.filter((s) => s.zoneId === z.id).map((s) => ({ id: s.id, code: s.code, type: s.type })) }));
    });
    res.set('Cache-Control', 'no-store');
    res.json({
        costCenters: listCostCenters(clientId, isTestAccount).filter((c) => complete.has(c.id)).map((c) => ({ id: c.id, code: c.code, name: c.name })),
        warehouses: listArticleCategories(clientId, 'almacenes', isTestAccount).map((r) => ({ id: r.id, name: r.name, status: r.status, parentId: r.parent_id })),
        zonesByCenter,
    });
});

// --- Relación Código (Operaciones > Cadena de Suministro > C. Distribución) -------------------
// Dónde vive un código: una fila por LUGAR (un mismo código puede tener varios). centro de costos > almacén (obligatorios) > sub almacén > zona > anaquel > nivel > espacio.
// Zona, anaquel, nivel y espacio solo existen si el sub almacén es Físico y la zona (o el anaquel) está asignada a él en Nuestros Sub Almacenes; el Layout da los anaqueles, sus
// niveles y sus espacios por nivel. Un espacio solo puede tener UN código. Cada dato lleva su propia hoja en el árbol (Ver y Operar para llenarlo, Modificar para cambiarlo).
const CODE_RELATION_TABLE_KEY = 'relacion-codigo';
const CODE_RELATION_AREA_LABEL = 'C. Distribución';
const CODE_RELATION_MODULE_LABEL = 'Cadena de Suministro';
const CODE_RELATION_SCREEN_LABEL = 'Relación Código';
const CODE_RELATION_COLS = {
    skuItemId: 'colRelSku', costCenterId: 'colRelCentroCostos', warehouseId: 'colRelAlmacen', subWarehouseId: 'colRelSubAlmacen',
    zoneId: 'colRelZona', spaceId: 'colRelEstante', level: 'colRelNivel', slot: 'colRelEspacio', position: 'colRelProfundidad', classification: 'colRelClasificacion', packUnitId: 'colRelSeAcomoda', // la posición cuelga de la hoja que era «Profundidad» (ahora «Posición»)
};
// Clasificación del producto en ese lugar. Se guarda la clave; sin decir nada es Producto Activo.
const CODE_RELATION_CLASSES = { activo: 'Producto Activo', cuarentena: 'Producto Cuarentena', aclaracion: 'Producto Aclaración', consigna: 'Producto en Consigna' };
// row y depth ya no se guardan: se siguen aceptando de las copias viejas de la App y de los archivos de antes, y se convierten en la posición (convertLegacyCell).
const CODE_RELATION_INT_KEYS = ['skuItemId', 'costCenterId', 'warehouseId', 'subWarehouseId', 'level', 'slot', 'position', 'row', 'depth', 'packUnitId'];
function convertLegacyCell(state, ctx, values) {
    if (state.row == null && state.depth == null) { delete state.row; delete state.depth; if (values) { delete values.row; delete values.depth; } return; }
    const layout = ctx.layoutFor(state.costCenterId);
    const space = state.spaceId ? layout.spaceById.get(state.spaceId) : null;
    if (state.position == null && space && state.level && state.slot) state.position = LayoutCalc.legacyPositionNum(space, state.level, state.slot, state.row, state.depth);
    delete state.row; delete state.depth;
    if (values) { delete values.row; delete values.depth; if (state.position != null) values.position = state.position; }
}
const CODE_RELATION_TEXT_KEYS = ['zoneId', 'spaceId', 'classification'];
// El SKU que se muestra: el código automático de 12 caracteres (CMCSCD000001) de sku_items.sku_code; sin él (filas sin código) cae al número de 6 dígitos de siempre.
const padSku = (n, code) => code || String(n || 0).padStart(6, '0');

function codeRelationContext(req) {
    return codeRelationContextFor(req.user.clientId, req.user.isTestAccount);
}
function codeRelationContextFor(clientId, isTestAccount) {
    const warehouses = new Map();
    ['almacenes', 'sub-almacenes'].forEach((t) => listArticleCategories(clientId, t, isTestAccount).forEach((r) => warehouses.set(r.id, r)));
    const costCenters = new Map(listCostCenters(clientId, isTestAccount).map((c) => [c.id, c]));
    // El Layout es de un centro de costos: cada relación usa las zonas y los anaqueles del Layout de SU centro (cost_center_id).
    const layouts = new Map();
    const layoutFor = (centerId) => {
        const key = centerId || 0;
        if (!layouts.has(key)) layouts.set(key, warehouseLayoutIndex(clientId, key));
        return layouts.get(key);
    };
    // Para los nombres del historial, donde solo llega el id de la zona o del anaquel: se busca en los Layouts de todos los centros (los ids no se repiten).
    const anyLayout = (find) => {
        for (const id of [...costCenters.keys(), 0]) { const hit = find(layoutFor(id)); if (hit) return hit; }
        return null;
    };
    let complete = null;
    const isCompleteCenter = (id) => { if (!complete) complete = new Set(listCompleteCostCenterIds(clientId, isTestAccount)); return complete.has(id); };
    // las presentaciones de distribución de cada código (Presentaciones de Distribución), leídas una sola vez
    let packMap = null;
    const packagingOf = (skuItemId) => { if (!packMap) packMap = packagingMapFor(clientId, isTestAccount); return packMap.get(skuItemId) || null; };
    return { costCenters, warehouses, layoutFor, anyLayout, isCompleteCenter, packagingOf };
}

// La posición (largo × fondo × alto, en cm) donde está una relación: la del Layout, con el alto que tiene su espacio.
function codeRelationPositionBox(layout, spaceId, level, slot, positionNum) {
    const space = spaceId ? layout.spaceById.get(spaceId) : null;
    if (!space || !level || !slot) return null;
    const list = layout.positions.get(`${spaceId}|${level}|${slot}`) || [];
    const p = list.find((x) => x.num === positionNum) || (list.length === 1 ? list[0] : null);
    if (!p || !(p.l > 0) || !(p.w > 0)) return null;
    const bm = LayoutCalc.bayMeasures(space, level, slot);
    const h = p.h > 0 ? Math.min(p.h, bm.h) : bm.h;
    return { l: Math.round(p.l * 1000) / 10, w: Math.round(p.w * 1000) / 10, h: Math.round(h * 1000) / 10 };
}
// Qué se acomoda en el lugar de la relación y cuántas piezas caben (PackCalc.fit). withCells = las celdas de UNA capa, para dibujarlas en el Layout.
function codeRelationPack(row, layout, withCells, ctx) {
    // packUnitId = QUÉ presentación se acomoda (el id de la presentación; 0 = el material principal); packLevel = su profundidad en el árbol (0 principal, 1 sale del principal…), para el rótulo y los colores.
    const out = { packUnitId: row.pack_unit_id == null ? null : row.pack_unit_id, packLevel: null, packLabel: '', packShape: '', packCount: null, packLayers: null, packPerLayer: null, packCapacity: null, packPieces: null, packLeftH: null, packLeftD: null, packBox: null };
    if (row.pack_unit_id == null) return out;
    const levels = PackCalc.levelsOf({ length: row.sku_length, width: row.sku_width, height: row.sku_height, packaging: ctx.packagingOf(row.sku_item_id) });
    const lv = levels.find((x) => x.id === row.pack_unit_id);
    if (!lv) return out;
    out.packLevel = lv.level;
    out.packLabel = packLevelLabel(lv.level, lv);
    out.packName = [lv.brand, lv.name].filter(Boolean).join(' · ');
    out.packShape = lv.shape;
    out.packPieces = lv.pieces;
    const nums = row.space_id && row.level && row.slot ? (layout.positions.get(`${row.space_id}|${row.level}|${row.slot}`) || []) : [];
    const box = codeRelationPositionBox(layout, row.space_id, row.level, row.slot, row.position || (nums.length === 1 ? nums[0].num : 0));
    if (!box) return out;
    const f = PackCalc.fit(box, lv);
    Object.assign(out, { packCount: f.count, packLayers: f.layers, packPerLayer: f.perLayer, packCapacity: f.capacity, packLeftH: f.leftH, packLeftD: f.leftD, packBox: box });
    if (withCells) Object.assign(out, { packCells: f.cells, packCircle: !!f.circle, packLayerHeight: f.layerHeight || 0 });
    return out;
}

function mapCodeRelation(row, pendingByRecord, companyName, ctx) {
    if (!row) return row;
    const cc = ctx.costCenters.get(row.cost_center_id);
    const wh = ctx.warehouses.get(row.warehouse_id);
    const sub = ctx.warehouses.get(row.sub_warehouse_id);
    const layout = ctx.layoutFor(row.cost_center_id);
    const space = layout.spaceById.get(row.space_id);
    // La zona de una relación con activo es la de ESE activo hoy (la zona de una huella sale de dónde está en el croquis); la que se guardó solo se usa mientras no hay activo.
    const zone = space && space.zoneId ? layout.zoneById.get(space.zoneId) : layout.zoneById.get(row.zone_id);
    const footprint = space ? layout.footprintById.get(space.footprintId) : null;
    // Ubicado = un sub almacén virtual (no tiene dónde más) o el camino físico completo hasta el espacio (anaquel, nivel y espacio) y, si ese espacio tiene más de una posición, cuál posición; lo demás queda A medias.
    const nums = space && row.level && row.slot ? (layout.positions.get(`${row.space_id}|${row.level}|${row.slot}`) || []) : [];
    const posOk = row.position ? nums.some((p) => p.num === row.position) : nums.length === 1;
    const located = !!row.sub_warehouse_id && ((sub && sub.kind === 'virtual') || (row.space_id && row.level && row.slot && posOk));
    const posNum = row.position || (nums.length === 1 ? nums[0].num : 0);
    return {
        id: row.id,
        registroUnico: row.db_id,
        skuItemId: row.sku_item_id,
        sku: padSku(row.sku_number, row.sku_code),
        upc: row.sku_upc || '',
        description: row.sku_description || row.sku_known || '',
        costCenterId: row.cost_center_id, centroCostos: cc ? cc.name : '',
        warehouseId: row.warehouse_id, warehouseName: wh ? wh.name : '',
        subWarehouseId: row.sub_warehouse_id, subWarehouseName: sub ? sub.name : '', subKind: sub ? sub.kind : '',
        zoneId: zone ? zone.id : row.zone_id, zoneName: zone ? zone.name : '',
        spaceId: row.space_id, spaceCode: space ? space.code : '',
        footprintId: footprint ? footprint.id : '', footprintCode: footprint ? footprint.code : '',
        // El Localizador completo (las 6 piezas) solo existe cuando el lugar está completo.
        locator: located && space && footprint && zone ? RelTemplate.formatLocator({ zoneName: zone.name, zoneCode: zone.code, footprintCode: footprint.code, spaceType: space.type, spaceCode: space.code, level: row.level, slot: row.slot, position: posNum || 1 }) : '',
        level: row.level, slot: row.slot, position: row.position || null, positionCount: nums.length,
        classification: row.classification || 'activo', classificationName: CODE_RELATION_CLASSES[row.classification || 'activo'] || '',
        ...codeRelationPack(row, layout, false, ctx),
        skuLength: row.sku_length || 0, skuWidth: row.sku_width || 0, skuHeight: row.sku_height || 0, skuPackaging: ctx.packagingOf(row.sku_item_id),
        status: located ? 'located' : 'partial',
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({
            companyName, area: CODE_RELATION_AREA_LABEL, modulo: CODE_RELATION_MODULE_LABEL, pantalla: CODE_RELATION_SCREEN_LABEL,
            centroCostos: cc ? cc.name : '', createdAt: row.created_at,
        }),
    };
}

// Lo que se escribe en el historial: nombres, no números.
function codeRelationSanitizers(ctx, req) {
    const { clientId, isTestAccount } = req.user;
    return {
        skuItemId: (v) => { const s = v ? getSkuItemById(v, clientId, isTestAccount) : null; return s ? padSku(s.record_number, s.sku_code) : (v == null ? '' : String(v)); },
        costCenterId: (v) => { const c = ctx.costCenters.get(Number(v)); return c ? c.name : (v == null ? '' : String(v)); },
        warehouseId: (v) => { const w = ctx.warehouses.get(Number(v)); return w ? w.name : (v == null ? '' : String(v)); },
        subWarehouseId: (v) => { const w = ctx.warehouses.get(Number(v)); return w ? w.name : (v == null ? '' : String(v)); },
        zoneId: (v) => { const z = ctx.anyLayout((l) => l.zoneById.get(v)); return z ? z.name : (v || ''); },
        spaceId: (v) => { const s = ctx.anyLayout((l) => l.spaceById.get(v)); return s ? s.code : (v || ''); },
        level: (v) => (v == null ? '' : String(v)),
        slot: (v) => (v == null ? '' : String(v)),
        position: (v) => (v == null ? '' : String(v)),
        classification: (v) => CODE_RELATION_CLASSES[v] || (v == null ? '' : String(v)),
        // lo que se acomoda: el rótulo de la presentación (su profundidad y cómo se llama), no su número
        packUnitId: (v) => {
            if (v == null) return '';
            if (Number(v) === 0) return PACK_ORDINALS[0];
            const d = getSkuDistributionById(Number(v), clientId, isTestAccount);
            const node = d ? skuDistTree(listSkuDistributionBySku(clientId, isTestAccount, d.sku_item_id)).find((n) => n.row.id === d.id) : null;
            return node ? packLevelLabel(node.plevel, { brand: node.brand ? node.brand.name : '', name: node.name }) : String(v);
        },
    };
}

function normalizeCodeRelationInput(body) {
    const values = {};
    for (const key of CODE_RELATION_INT_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
        const raw = body[key];
        if (raw === '' || raw == null) { values[key] = null; continue; }
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) return { error: 'Uno de los datos no es un número válido.' };
        values[key] = n;
    }
    for (const key of CODE_RELATION_TEXT_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
        const raw = body[key];
        if (raw == null || raw === '') { values[key] = ''; continue; }
        if (typeof raw !== 'string' || raw.length > 60) return { error: 'Uno de los datos no es válido.' };
        values[key] = raw;
    }
    return { values };
}

// Revisa la relación completa tal como quedaría (lo guardado + lo que cambia). existing = fila actual (o null); con ella un almacén o sub almacén que ya quedó Inactivo se respeta si no se cambia.
function validateCodeRelationState(req, state, selfId, existing, ctx) {
    const { clientId, isTestAccount } = req.user;
    const bad = (message, status = 400) => ({ error: { status, message } });
    const skuRow = state.skuItemId ? getSkuItemById(state.skuItemId, clientId, isTestAccount) : null;
    if (!skuRow) return bad('Elige un código de Alta Artículos.');
    // «Se acomoda»: la presentación elegida tiene que ser de este código y traer sus medidas (Alta Artículos / Presentaciones de Distribución).
    if (state.packUnitId != null) {
        const lv = PackCalc.levelsOf({ length: skuRow.length, width: skuRow.width, height: skuRow.height, packaging: ctx.packagingOf(skuRow.id) }).find((x) => x.id === state.packUnitId);
        if (!lv || !(lv.l > 0 && lv.w > 0 && lv.h > 0)) return bad('Ese empaque no está capturado en Alta Artículos o le faltan las medidas. Captúralo primero en el código.');
        // solo se ofrecen (y se aceptan) las presentaciones con algún tipo de almacenamiento habilitado en Presentaciones de Distribución; una relación que ya la tenía y no la cambia se respeta
        if (!PackCalc.enabled(lv) && !(existing && existing.pack_unit_id === state.packUnitId && existing.sku_item_id === state.skuItemId)) return bad('Esa presentación no tiene ningún tipo de almacenamiento habilitado. Habilítalo primero en Presentaciones de Distribución.');
    }
    if (!CODE_RELATION_CLASSES[state.classification || 'activo']) return bad('La clasificación no es una de las del catálogo (Producto Activo, Cuarentena, Aclaración o en Consigna).');
    if (!state.costCenterId || !ctx.costCenters.has(state.costCenterId)) return bad('Elige un centro de costos.');
    if (!(existing && existing.cost_center_id === state.costCenterId) && !ctx.isCompleteCenter(state.costCenterId)) return bad('Ese centro de costos está incompleto o inactivo. Complétalo primero en Nuestros Centros Costos.');
    const layout = ctx.layoutFor(state.costCenterId);
    // La zona del lugar es la del activo hoy (la de su huella, que sale de dónde está en el croquis): una relación guardada con otra zona se corrige sola.
    if (state.spaceId) { const placed = layout.spaceById.get(state.spaceId); if (placed && placed.zoneId) state.zoneId = placed.zoneId; }
    const wh = state.warehouseId ? ctx.warehouses.get(state.warehouseId) : null;
    if (!wh || wh.category_type !== 'almacenes') return bad('Elige un almacén.');
    if (wh.parent_id !== state.costCenterId) return bad('Ese almacén no pertenece a ese centro de costos.');
    if (wh.status !== 'active' && !(existing && existing.warehouse_id === wh.id)) return bad('Ese almacén está inactivo. Elige uno activo.');
    const hasSub = !!state.subWarehouseId;
    const hasZone = !!state.zoneId;
    const hasSpace = !!state.spaceId;
    const hasLevel = state.level != null;
    const hasSlot = state.slot != null;
    const hasPos = state.position != null;
    if (!hasSub && (hasZone || hasSpace || hasLevel || hasSlot || hasPos)) return bad('Falta el sub almacén.');
    let sub = null;
    if (hasSub) {
        sub = ctx.warehouses.get(state.subWarehouseId);
        if (!sub || sub.category_type !== 'sub-almacenes') return bad('Ese sub almacén no existe.');
        if (sub.parent_id !== state.warehouseId) return bad('Ese sub almacén no pertenece a ese almacén.');
        if (sub.status !== 'active' && !(existing && existing.sub_warehouse_id === sub.id)) return bad('Ese sub almacén está inactivo. Elige uno activo.');
    }
    if (!hasZone && (hasSpace || hasLevel || hasSlot || hasPos)) return bad('Falta la zona.');
    if (hasZone) {
        if (!sub || sub.kind !== 'physical') return bad('Este sub almacén no es físico: no lleva zona, anaquel, nivel, espacio ni posición.');
        const entry = parseWarehouseLocations(sub.locations).find((e) => e.zoneId === state.zoneId);
        if (!entry || !layout.zoneById.has(state.zoneId)) return bad('Esa zona no está asignada a ese sub almacén.');
        if (hasSpace) {
            const space = layout.spaceById.get(state.spaceId);
            if (!space || space.zoneId !== state.zoneId) return bad('Ese anaquel no está en esa zona.');
            if (entry.spaceIds.length && !entry.spaceIds.includes(state.spaceId)) return bad('Ese anaquel no está asignado a ese sub almacén.');
            if (hasLevel) {
                if (state.level < 1 || state.level > (space.levels || 1)) return bad('Ese nivel no existe en ese anaquel.');
                if (hasSlot && (state.slot < 1 || state.slot > LayoutCalc.levelSlots(space, state.level))) return bad('Ese espacio no existe en ese nivel.');
                if (hasPos && !hasSlot) return bad('Falta el espacio.');
                if (hasPos) {
                    // dentro del espacio (nivel × espacio) están sus posiciones (Layout > Posiciones)
                    const nums = layout.positions.get(`${space.id}|${state.level}|${state.slot}`) || [];
                    if (!nums.some((p) => p.num === state.position)) return bad('Esa posición no existe en ese espacio.');
                }
            } else if (hasSlot || hasPos) return bad('Falta el nivel.');
        } else if (hasLevel || hasSlot || hasPos) return bad('Falta el anaquel.');
    }
    if (hasSpace && hasLevel && hasSlot) {
        const occupant = findCodeRelationInSlot(clientId, isTestAccount, state.spaceId, state.level, state.slot, selfId || 0, state.position);
        if (occupant) return bad(`Esa posición ya la ocupa el código ${padSku(occupant.sku_number, occupant.sku_code)}. Elige otra posición.`, 409);
    }
    if (findCodeRelationDuplicate(clientId, isTestAccount, state, selfId || 0)) return bad('Este código ya tiene esa misma ubicación.', 409);
    return { ok: true };
}

// Qué pasaría con un dato que cambia: se aplica de inmediato, queda pendiente de autorización o se rechaza (mismo criterio que checkAndLogFieldChanges).
function codeRelationPatchOutcome(grants, existing, key) {
    const colKey = CODE_RELATION_COLS[key];
    const level = getColumnGrantLevel(grants, CODE_RELATION_TABLE_KEY, colKey);
    const oldValue = existing[CODE_RELATION_PATCHABLE_FIELDS[key].column];
    if (!oldValue) return level === 'ver-y-operar' || level === 'editar' ? 'apply' : 'reject';
    return level === 'editar' ? 'pending' : 'reject';
}

app.get('/api/business/code-relations', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, CODE_RELATION_TABLE_KEY);
    const client = getClientById(req.user.clientId);
    const ctx = codeRelationContext(req);
    res.json({ relations: listCodeRelations(req.user.clientId, req.user.isTestAccount).map((r) => mapCodeRelation(r, pendingByRecord, client?.company_name, ctx)) });
});

// Todo lo que necesita la ventana "Nueva relación": centros de costos completos, almacenes, sub almacenes (con sus ubicaciones), las zonas y anaqueles del Layout de cada centro (zonesByCenter) y los espacios que ya están ocupados.
// "zones" (las del primer Layout) se sigue mandando solo para las copias viejas de la App que todavía no conocen zonesByCenter.
// --- Localizadores (Catálogos > Cadena de Suministro > C. Distribución) ---------------------------------------------------
// La lista de SOLO LECTURA de todos los localizadores que el Layout de cada centro de costos va creando, completos o a medias (una fila por zona, huella, activo y posición completa). Un localizador se modifica únicamente
// desde el Layout: aquí no hay Editar ni Nuevo. Almacén y sub almacén salen de lo que cada sub almacén físico tiene asignado (zona completa o anaqueles). Las columnas de Control Interno son las del centro (se mandan una sola
// vez por centro, no en cada fila, porque las filas pueden ser decenas de miles).
const LOCATOR_SCREEN_LABEL = 'Localizadores';
const LOCATOR_ROWS_MAX = 60000;
app.get('/api/business/locators', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId } = req.user;
    const client = getClientById(clientId);
    const ctx = codeRelationContext(req);
    const subs = [...ctx.warehouses.values()].filter((r) => r.category_type === 'sub-almacenes' && r.kind === 'physical' && r.status === 'active');
    const centers = {};
    const locators = [];
    let truncated = false;
    for (const layoutRow of listClientLayouts(clientId)) {
        const cc = ctx.costCenters.get(layoutRow.costCenterId);
        if (!cc) continue;
        const homes = subs
            .map((s) => ({ wh: ctx.warehouses.get(s.parent_id), sub: s, entries: parseWarehouseLocations(s.locations) }))
            .filter((h) => h.wh && h.wh.parent_id === cc.id);
        const built = LayoutCalc.locatorRows(layoutRow.layout, { max: LOCATOR_ROWS_MAX - locators.length });
        if (built.truncated) truncated = true;
        centers[cc.id] = {
            name: cc.name, company: client ? client.company_name : '',
            system: getSystemColumnsForRecord({ companyName: client ? client.company_name : '', area: CODE_RELATION_AREA_LABEL, modulo: CODE_RELATION_MODULE_LABEL, pantalla: LOCATOR_SCREEN_LABEL, centroCostos: cc.name, createdAt: layoutRow.updatedAt }),
        };
        for (const r of built.rows) {
            const at = homes.filter((h) => r.zoneId && h.entries.some((e) => e.zoneId === r.zoneId && (!r.spaceId || !e.spaceIds.length || e.spaceIds.includes(r.spaceId))));
            locators.push({
                cc: cc.id, scope: r.scope, complete: r.complete, locator: r.locator,
                zoneCode: r.zoneCode, zoneName: r.zoneName, footprintId: r.footprintId || '', footprintCode: r.footprintCode || '', footprintName: r.footprintName || '',
                spaceCode: r.spaceCode || '', spaceType: r.spaceType || '', level: r.level || 0, slot: r.slot || 0, position: r.position || 0,
                warehouse: [...new Set(at.map((h) => h.wh.name))].join(', '), subWarehouse: [...new Set(at.map((h) => h.sub.name))].join(', '),
            });
        }
    }
    res.set('Cache-Control', 'no-store');
    res.json({ centers, locators, truncated, max: LOCATOR_ROWS_MAX });
});

app.get('/api/business/code-relations/options', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const ctx = codeRelationContext(req);
    const sub = [...ctx.warehouses.values()].filter((r) => r.category_type === 'sub-almacenes');
    const almacenes = [...ctx.warehouses.values()].filter((r) => r.category_type === 'almacenes');
    const layouts = listClientLayouts(clientId);
    const zonesOf = (row) => {
        const idx = layoutIndexOf(row);
        return idx.zones.map((z) => ({
            id: z.id, name: z.name, code: z.code,
            footprints: idx.footprints.filter((f) => f.zoneId === z.id).map((f) => ({ id: f.id, code: f.code })),
            spaces: idx.spaces.filter((s) => s.zoneId === z.id).map((s) => ({ id: s.id, code: s.code, type: s.type, footprintId: s.footprintId, levels: s.levels || 1, slots: LayoutCalc.maxSlots(s), slotsByLevel: LayoutCalc.slotsByLevelOf(s), bays: s.bays || [],
                // las posiciones de cada espacio: [{ n, c, nums: [1, 2…] }] (las copias viejas de la App siguen leyendo bays)
                positions: [...idx.positions.entries()].filter(([key]) => key.startsWith(`${s.id}|`)).map(([key, list]) => { const [, n, c] = key.split('|'); const bm = LayoutCalc.bayMeasures(s, Number(n), Number(c)); return { n: Number(n), c: Number(c), nums: list.map((p) => p.num), bl: bm.l, bw: bm.w, bh: bm.h, boxes: list.map((p) => ({ num: p.num, x: p.x, y: p.y, l: p.l, w: p.w, h: p.h })) }; }) })),
        }));
    };
    const zonesByCenter = {};
    layouts.forEach((row) => { zonesByCenter[row.costCenterId || 0] = zonesOf(row); });
    res.set('Cache-Control', 'no-store');
    res.json({
        costCenters: [...ctx.costCenters.values()].filter((c) => ctx.isCompleteCenter(c.id)).map((c) => ({ id: c.id, code: c.code, name: c.name })),
        warehouses: almacenes.map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id, status: r.status })),
        subWarehouses: sub.map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id, status: r.status, kind: r.kind, locations: r.kind === 'physical' ? parseWarehouseLocations(r.locations) : [] })),
        zonesByCenter,
        zones: layouts.length ? zonesOf(layouts[0]) : [],
        occupied: listCodeRelations(clientId, isTestAccount).filter((r) => r.space_id && r.level && r.slot).map((r) => ({ id: r.id, spaceId: r.space_id, level: r.level, slot: r.slot, position: r.position || 1, sku: padSku(r.sku_number, r.sku_code) })),
    });
});

// Buscador del campo Código: por SKU (con o sin ceros), UPC o descripción.
app.get('/api/business/code-relations/skus', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const term = String(req.query.q || '').slice(0, 80);
    // all=1 (la App): hasta 5000 códigos, ligeros, para buscar y escanear sin señal.
    const limit = req.query.all === '1' ? 5000 : 20;
    res.set('Cache-Control', 'no-store');
    const packMap = packagingMapFor(req.user.clientId, req.user.isTestAccount);
    // Con el tipo de filtro de las tablas (Inicia con / Igual que) o con signos ($ antes, @ después, coma) se busca con el motor de todo el sistema (SearchSyntax) en el SKU, el UPC y las descripciones; Contiene sin signos sigue
    // como siempre (basta una parte de lo escrito).
    const mode = PUBLIC_SEARCH_MODES.includes(req.query.mode) ? req.query.mode : 'contains';
    const query = publicSearchQuery(term);
    let found;
    if (req.query.all !== '1' && (mode !== 'contains' || /[$@,]/.test(query))) {
        if (!SearchSyntax.ready(mode, query)) found = [];
        else {
            const matches = publicSearchMatcher(mode, query);
            found = searchSkuItems(req.user.clientId, '', req.user.isTestAccount, 100000)
                .filter((s) => matches([padSku(s.record_number, s.sku_code), padSku(s.record_number), s.client_code, s.upc, s.unique_description, s.known_description, s.custom_description]))
                .slice(0, limit);
        }
    } else {
        found = searchSkuItems(req.user.clientId, req.query.all === '1' ? '' : term, req.user.isTestAccount, limit);
    }
    res.json({
        skus: found.map((s) => ({
            id: s.id, sku: padSku(s.record_number, s.sku_code), num: s.record_number, upc: s.upc || '', description: s.unique_description || s.known_description || s.custom_description || '', unique: s.unique_description || '', uom: s.main_uom || '',
            length: s.length || 0, width: s.width || 0, height: s.height || 0, packaging: packMap.get(s.id) || null,
        })),
    });
});

app.post('/api/business/code-relations', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const grants = req.user.isClientAdmin ? null : getUserEffectiveGrants(req.user.sub);
    if (grants && !canCreateColumn(grants, CODE_RELATION_TABLE_KEY, 'colRelCreateAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para crear registros aquí.' });
    }
    const norm = normalizeCodeRelationInput(req.body || {});
    if (norm.error) return res.status(400).json({ message: norm.error });
    const state = { skuItemId: null, costCenterId: null, warehouseId: null, subWarehouseId: null, zoneId: '', spaceId: '', level: null, slot: null, position: null, classification: 'activo', ...norm.values };
    const ctx = codeRelationContext(req);
    convertLegacyCell(state, ctx, null);
    // Llenar un dato vacío pide su propia hoja (Ver y Operar o Modificar), igual que al llenar una celda de otra tabla.
    if (grants) {
        const missing = Object.entries(CODE_RELATION_COLS)
            .filter(([key, colKey]) => state[key] !== null && state[key] !== '' && !(key === 'classification' && state[key] === 'activo') && !['ver-y-operar', 'editar'].includes(getColumnGrantLevel(grants, CODE_RELATION_TABLE_KEY, colKey)))
            .map(([key]) => CODE_RELATION_PATCHABLE_FIELDS[key].fieldKey);
        if (missing.length) return res.status(403).json({ message: 'No tienes permiso para llenar uno de los datos de esta relación.', fields: missing });
    }
    const check = validateCodeRelationState(req, state, 0, null, ctx);
    if (check.error) return res.status(check.error.status).json({ message: check.error.message });
    const row = createCodeRelation({ clientId, isTestData: isTestAccount, values: state });
    logTableChange({ clientId, tableKey: CODE_RELATION_TABLE_KEY, recordId: row.id, recordLabel: `#${row.id}`, action: 'create', changedBy: changedByLabel(req) });
    const sanitizers = codeRelationSanitizers(ctx, req);
    Object.entries(CODE_RELATION_PATCHABLE_FIELDS).forEach(([key, { fieldKey }]) => {
        if (state[key] === null || state[key] === '') return;
        logTableChange({ clientId, tableKey: CODE_RELATION_TABLE_KEY, recordId: row.id, recordLabel: `#${row.id}`, action: 'update', fieldKey, oldValue: '', newValue: sanitizers[key](state[key]), changedBy: changedByLabel(req) });
    });
    notifyButtonAction(req, CODE_RELATION_TABLE_KEY, 'create', `#${row.id}`);
    const client = getClientById(clientId);
    res.status(201).json({ relation: mapCodeRelation(row, null, client?.company_name, ctx) });
});

// Cargar por plantilla (Web): cada fila ya trae los ids de su lugar (la ventana convirtió los nombres) y aquí pasa por la MISMA revisión que una relación hecha a mano (permisos por dato,
// validateCodeRelationState: cascada, Layout del centro, espacio libre, sin repetir). Lo que no pasa no se carga y regresa con su motivo; lo demás se da de alta. Hasta CODE_RELATION_IMPORT_MAX por petición.
const CODE_RELATION_IMPORT_MAX = 500;
app.post('/api/business/code-relations/import', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const grants = req.user.isClientAdmin ? null : getUserEffectiveGrants(req.user.sub);
    if (grants && !canCreateColumn(grants, CODE_RELATION_TABLE_KEY, 'colRelTemplateAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para cargar relaciones por plantilla.' });
    }
    const input = req.body && req.body.rows;
    if (!Array.isArray(input) || !input.length) return res.status(400).json({ message: 'No hay filas para cargar.' });
    if (input.length > CODE_RELATION_IMPORT_MAX) return res.status(400).json({ message: `El máximo es ${CODE_RELATION_IMPORT_MAX} filas por petición. Manda el archivo en tandas más chicas.` });
    const ctx = codeRelationContext(req);
    const sanitizers = codeRelationSanitizers(ctx, req);
    const changedBy = changedByLabel(req);
    const created = [];
    const updated = [];
    const failed = [];
    input.forEach((raw, index) => {
        const n = Number.isInteger(raw && raw.n) ? raw.n : index + 2;
        const fail = (message) => failed.push({ index, n, message });
        // Una fila con relationId COMPLETA la relación «A medias» de ese código (le pone zona, estante, nivel y espacio): se revisa como un cambio hecho a mano en la tabla (permisos y historial incluidos).
        if (raw && raw.relationId != null && raw.reclass) {
            // Solo cambia la clasificación de una relación que ya tiene ese mismo lugar (como cambiar la celda en la tabla: permisos por dato, historial y, si hace falta, autorización).
            const existing = getCodeRelationById(raw.relationId, clientId, isTestAccount);
            if (!existing) { fail('Esa relación ya no existe.'); return; }
            const wanted = raw.values && raw.values.classification;
            if (!CODE_RELATION_CLASSES[wanted]) { fail('La clasificación no es una de las del catálogo.'); return; }
            if (grants && codeRelationPatchOutcome(grants, existing, 'classification') !== 'apply') { fail('No tienes permiso para cambiar la clasificación de esta relación.'); return; }
            try {
                const result = checkAndLogFieldChanges(req, existing, { classification: wanted }, CODE_RELATION_PATCHABLE_FIELDS, CODE_RELATION_TABLE_KEY, `#${existing.id}`, sanitizers, {});
                updateCodeRelation(existing.id, clientId, result.appliedPatch, isTestAccount);
                updated.push({ index, n, id: existing.id, reclassified: true });
            } catch (error) {
                console.error('Relación Código: no se pudo reclasificar una fila de la plantilla', error);
                fail('No se pudo guardar esta fila. Inténtalo de nuevo.');
            }
            return;
        }
        if (raw && raw.relationId != null) {
            const existing = getCodeRelationById(raw.relationId, clientId, isTestAccount);
            if (!existing) { fail('Esa relación ya no existe.'); return; }
            if (existing.zone_id || existing.space_id || existing.level || existing.slot || existing.position) { fail('Esa relación ya tiene lugar: no se completa otra vez.'); return; }
            // la clasificación solo viaja si la fila la trae (sin decirla, la relación conserva la que tenía)
            const placeKeys = ['zoneId', 'spaceId', 'level', 'slot', 'position', 'row', 'depth'].concat(raw.values && raw.values.classification ? ['classification'] : []);
            const placeNorm = normalizeCodeRelationInput(Object.fromEntries(placeKeys.map((k) => [k, raw.values ? raw.values[k] : null])));
            if (placeNorm.error) { fail(placeNorm.error); return; }
            const place = placeNorm.values;
            const state = {
                skuItemId: existing.sku_item_id, costCenterId: existing.cost_center_id, warehouseId: existing.warehouse_id, subWarehouseId: existing.sub_warehouse_id,
                zoneId: existing.zone_id, spaceId: existing.space_id, level: existing.level, slot: existing.slot, position: existing.position, classification: existing.classification || 'activo', packUnitId: existing.pack_unit_id ?? null, ...place,
            };
            convertLegacyCell(state, ctx, place);
            const check = validateCodeRelationState(req, state, existing.id, existing, ctx);
            if (check.error) { fail(check.error.message); return; }
            const changedKeys = Object.keys(place).filter((key) => String(existing[CODE_RELATION_PATCHABLE_FIELDS[key].column] ?? '') !== String(place[key] ?? ''));
            if (grants && changedKeys.some((key) => codeRelationPatchOutcome(grants, existing, key) !== 'apply')) { fail('No tienes permiso para llenar uno de los datos de esta relación.'); return; }
            try {
                const result = checkAndLogFieldChanges(req, existing, place, CODE_RELATION_PATCHABLE_FIELDS, CODE_RELATION_TABLE_KEY, `#${existing.id}`, sanitizers, {});
                updateCodeRelation(existing.id, clientId, result.appliedPatch, isTestAccount);
                updated.push({ index, n, id: existing.id });
            } catch (error) {
                console.error('Relación Código: no se pudo completar una fila de la plantilla', error);
                fail('No se pudo guardar esta fila. Inténtalo de nuevo.');
            }
            return;
        }
        const norm = normalizeCodeRelationInput(raw && typeof raw.values === 'object' && raw.values ? raw.values : {});
        if (norm.error) { fail(norm.error); return; }
        const state = { skuItemId: null, costCenterId: null, warehouseId: null, subWarehouseId: null, zoneId: '', spaceId: '', level: null, slot: null, position: null, classification: 'activo', ...norm.values };
        convertLegacyCell(state, ctx, null);
        if (grants) {
            const denied = Object.entries(CODE_RELATION_COLS).find(([key, colKey]) => state[key] !== null && state[key] !== '' && !(key === 'classification' && state[key] === 'activo') && !['ver-y-operar', 'editar'].includes(getColumnGrantLevel(grants, CODE_RELATION_TABLE_KEY, colKey)));
            if (denied) { fail('No tienes permiso para llenar uno de los datos de esta relación.'); return; }
        }
        const check = validateCodeRelationState(req, state, 0, null, ctx);
        if (check.error) { fail(check.error.message); return; }
        try {
            const row = createCodeRelation({ clientId, isTestData: isTestAccount, values: state });
            logTableChange({ clientId, tableKey: CODE_RELATION_TABLE_KEY, recordId: row.id, recordLabel: `#${row.id}`, action: 'create', changedBy });
            Object.entries(CODE_RELATION_PATCHABLE_FIELDS).forEach(([key, { fieldKey }]) => {
                if (state[key] === null || state[key] === '') return;
                logTableChange({ clientId, tableKey: CODE_RELATION_TABLE_KEY, recordId: row.id, recordLabel: `#${row.id}`, action: 'update', fieldKey, oldValue: '', newValue: sanitizers[key](state[key]), changedBy });
            });
            created.push({ index, n, id: row.id });
        } catch (error) {
            console.error('Relación Código: no se pudo guardar una fila de la plantilla', error);
            fail('No se pudo guardar esta fila. Inténtalo de nuevo.');
        }
    });
    if (created.length || updated.length) notifyButtonAction(req, CODE_RELATION_TABLE_KEY, 'import', `${created.length} nuevas, ${updated.length} completadas o reclasificadas`);
    res.json({ created, updated, failed });
});

app.patch('/api/business/code-relations/:id', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const existing = getCodeRelationById(req.params.id, clientId, isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Relation not found.' });
    const { baseline, overrideConflicts, ...raw } = req.body || {};
    const norm = normalizeCodeRelationInput(raw);
    if (norm.error) return res.status(400).json({ message: norm.error });
    const ctx = codeRelationContext(req);
    const state = {
        skuItemId: existing.sku_item_id, costCenterId: existing.cost_center_id, warehouseId: existing.warehouse_id, subWarehouseId: existing.sub_warehouse_id,
        zoneId: existing.zone_id, spaceId: existing.space_id, level: existing.level, slot: existing.slot, position: existing.position, classification: existing.classification || 'activo', packUnitId: existing.pack_unit_id ?? null, ...norm.values,
    };
    convertLegacyCell(state, ctx, norm.values);
    const check = validateCodeRelationState(req, state, existing.id, existing, ctx);
    if (check.error) return res.status(check.error.status).json({ message: check.error.message });
    // Cuando cambian varios datos a la vez (la ubicación depende de ella misma) no se permite que unos se apliquen y otros queden pendientes o rechazados.
    const changedKeys = Object.keys(norm.values).filter((key) => String(existing[CODE_RELATION_PATCHABLE_FIELDS[key].column] ?? '') !== String(norm.values[key] ?? ''));
    if (!req.user.isClientAdmin && changedKeys.length > 1) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (changedKeys.some((key) => codeRelationPatchOutcome(grants, existing, key) !== 'apply')) {
            return res.status(403).json({ message: 'Para cambiar varios datos a la vez necesitas poder llenarlos o cambiarlos todos sin autorización. Cámbialos de uno en uno.' });
        }
    }
    const { appliedPatch, pendingFields, rejectedFields, conflictFields } = checkAndLogFieldChanges(req, existing, norm.values, CODE_RELATION_PATCHABLE_FIELDS, CODE_RELATION_TABLE_KEY, `#${existing.id}`, codeRelationSanitizers(ctx, req), { baseline, overrideConflicts });
    const row = updateCodeRelation(existing.id, clientId, appliedPatch, isTestAccount);
    const client = getClientById(clientId);
    res.json({ relation: mapCodeRelation(row, null, client?.company_name, ctx), pendingFields, rejectedFields, conflictFields });
});

app.delete('/api/business/code-relations/:id', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getCodeRelationById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Relation not found.' });
    if (!req.user.isClientAdmin && !canDeleteColumn(getUserEffectiveGrants(req.user.sub), CODE_RELATION_TABLE_KEY, 'colRelDeleteAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para eliminar registros aquí.' });
    }
    logTableChange({ clientId: req.user.clientId, tableKey: CODE_RELATION_TABLE_KEY, recordId: existing.id, recordLabel: `#${existing.id}`, action: 'delete', changedBy: changedByLabel(req) });
    notifyButtonAction(req, CODE_RELATION_TABLE_KEY, 'delete', `#${existing.id}`);
    deleteCodeRelation(existing.id, req.user.clientId);
    res.status(204).end();
});
// Eliminar VARIAS relaciones (ubicaciones) de una vez (Relación Código: «Seleccionar» lo filtrado y «Eliminar»): las mismas reglas que eliminar una (hoja «Autorización para Eliminar» de la pantalla), cada una con su historial y UN solo aviso.
// Solo se elimina la relación (la ubicación del código): el código se queda y se elimina aparte en Alta Nuestros Artículos. Hasta 500 por petición: la pantalla las manda por tandas.
const CODE_REL_BULK_DELETE_MAX = 500;
app.post('/api/business/code-relations/bulk-delete', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!req.user.isClientAdmin && !canDeleteColumn(getUserEffectiveGrants(req.user.sub), CODE_RELATION_TABLE_KEY, 'colRelDeleteAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para eliminar registros aquí.' });
    }
    const raw = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
    const ids = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (!ids.length) return res.status(400).json({ message: 'No hay relaciones que eliminar.', code: 'EMPTY' });
    if (ids.length > CODE_REL_BULK_DELETE_MAX) return res.status(400).json({ message: `Hasta ${CODE_REL_BULK_DELETE_MAX} relaciones por vez.`, code: 'TOOMANY' });
    const { clientId, isTestAccount } = req.user;
    const deleted = [];
    ids.forEach((id) => {
        const existing = getCodeRelationById(id, clientId, isTestAccount);
        if (!existing) return; // ya no existe (otra persona la eliminó): no cuenta
        logTableChange({ clientId, tableKey: CODE_RELATION_TABLE_KEY, recordId: existing.id, recordLabel: `#${existing.id}`, action: 'delete', changedBy: changedByLabel(req) });
        deleteCodeRelation(existing.id, clientId);
        deleted.push(existing.id);
    });
    if (deleted.length) notifyButtonAction(req, CODE_RELATION_TABLE_KEY, 'delete', `${deleted.length} relaciones`);
    res.set('Cache-Control', 'no-store');
    res.json({ deleted });
});

// --- Presentaciones de Distribución (Operaciones, C. Distribución) ---------------------------------------------------------------------------------
// Las presentaciones en que se distribuye cada código, en ÁRBOL: la raíz (nivel 0) es el material principal (sus medidas y su peso son los de Alta Artículos; aquí solo su forma y si se puede acostar) y cada presentación
// dice de cuál sale (parent_id): de una misma pueden salir varias (la caja con 20 y la caja con 30 de la misma tableta; la caja con 20 va en cajas de 20 cajas y en cajas de 50 cajas). Cada una trae su unidad del catálogo
// Nuestras Unidad Medida, cuántas de la que la contiene lleva y SUS PROPIAS medidas (cm) y peso (g). «Equivale a» (en unidades principales) sale de multiplicar lo que contiene cada presentación por el camino hasta el principal;
// las medidas y el peso nunca se calculan. De aquí leen Relación Código («Se acomoda», por el id de la presentación) y el Layout (piezas que caben).
const UDM_DIST_TABLE_KEY = 'udm-distribucion';
const UDM_DIST_COLS = { classification: 'colUdmDClasificacion', brandId: 'colUdmDMarca', uom: 'colUdmDUnidad', contains: 'colUdmDContiene', shape: 'colUdmDForma', length: 'colUdmDLargo', width: 'colUdmDAncho', height: 'colUdmDAlto', weightG: 'colUdmDPeso', canLay: 'colUdmDAcostar', storageTypes: 'colUdmDTipo', shipTo: 'colUdmDEnvios', unitsPerLayer: 'colUdmDCantidadCama', layersPerPallet: 'colUdmDCamasPallet', maxStack: 'colUdmDMaxEstiba' };
const UDM_DIST_INT_KEYS = ['unitsPerLayer', 'layersPerPallet', 'maxStack'];
const UDM_DIST_MAIN_KEYS = ['shape', 'canLay', 'storageTypes', 'shipTo', ...UDM_DIST_INT_KEYS]; // lo que se captura también en el material principal
const UDM_DIST_MAX_DEPTH = 10; // hasta 10 niveles de profundidad (sin contar el material principal)
const UDM_DIST_MAX_CHILDREN = 10; // hasta 10 presentaciones que salen de una misma presentación
const UDM_DIST_MAX_PER_SKU = 100; // tope de seguridad por código
const UDM_DIST_SEARCH_LIMIT = 30; // cuántos códigos trae la búsqueda de Operaciones
const round4 = (v) => Math.round(v * 10000) / 10000;
function mapSkuDistribution(row, pendingByRecord, companyName, node, pantalla) {
    const principal = row.level === 0;
    const isBrand = row.kind === 'marca';
    const cyl = row.shape === 'cilindrica';
    const length = principal ? (row.sku_length || 0) : row.length;
    return {
        id: row.id,
        registroUnico: row.db_id,
        skuItemId: row.sku_item_id,
        sku: padSku(row.sku_number, row.sku_code),
        upc: row.sku_upc || '',
        description: row.sku_description || row.sku_known || row.sku_custom || '', // la columna se llama «Descripción única»: sale la descripción única del código (no la personalizada)
        level: row.level,
        levelLabel: isBrand ? 'Marca' : (PACK_ORDINALS[node.plevel] || `Empaque ${node.plevel}`),
        uom: principal ? (row.sku_uom || '') : row.uom,
        contains: principal ? null : row.contains,
        equivalent: node.equivalent,
        // el árbol: de cuál sale, cómo se llama, su camino desde el principal y lo que hace falta para dibujarlo en una columna
        parentId: row.parent_id || null, parentName: node.parentName, name: node.name, path: node.path, depth: row.level, treeLines: node.lines, treeLast: node.last, childCount: node.childCount,
        // la marca: un renglón sin medidas ni peso que agrupa (isBrand); sus presentaciones heredan su clasificación y su marca. packLevel = el nivel entre las presentaciones (para «Empaque primario»…)
        kind: isBrand ? 'marca' : 'presentacion', isBrand, packLevel: node.plevel, classification: node.brand ? node.brand.classification : '', brandId: node.brand ? node.brand.brandId : null, brand: node.brand ? node.brand.name : '',
        shape: cyl ? 'cilindrica' : 'rectangular',
        length,
        width: cyl ? length : (principal ? (row.sku_width || 0) : row.width),
        height: principal ? (row.sku_height || 0) : row.height,
        weightG: principal ? round4((Number(row.sku_weight) || 0) * 1000) : row.weight_g,
        canLay: !!row.can_lay,
        storageTypes: skuDistTypesOf(row),
        shipTo: String(row.ship_to || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0), // los lugares de envío (catálogo Lugares de Envío) a los que se envía esta presentación
        unitsPerLayer: row.units_per_layer || 0,
        layersPerPallet: row.layers_per_pallet || 0,
        maxStack: row.max_stack || 0,
        fromArticle: principal, // sus medidas y su peso se capturan en Alta Artículos
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({ companyName, area: 'C. Distribución', modulo: 'Cadena de Suministro', pantalla: pantalla || 'Presentaciones de Distribución', centroCostos: '', createdAt: row.created_at }),
    };
}
// Un código que todavía no tiene presentaciones se lista igual, con su material principal (unidad, medidas y peso de Alta Artículos) y lo demás de partida: es un renglón SIN GUARDAR (id negativo, virtual = true); al
// capturarlo se crea el renglón del material principal de verdad (la primera presentación de un código es siempre su material principal).
function skuDistPlaceholderRow(s) {
    return {
        id: -s.id, db_id: '', record_number: 0, sku_item_id: s.id, parent_id: null, level: 0, kind: 'presentacion', classification: '', brand_id: null, uom: '', contains: null, shape: 'rectangular', length: 0, width: 0, height: 0, weight_g: 0, can_lay: 0,
        storage_types: null, ship_to: null, units_per_layer: 0, layers_per_pallet: 0, max_stack: 0, created_at: s.created_at, sku_number: s.record_number, sku_code: s.sku_code, sku_upc: s.upc, sku_description: s.unique_description, sku_known: s.known_description,
        sku_custom: s.custom_description, sku_uom: s.main_uom, sku_length: s.length, sku_width: s.width, sku_height: s.height, sku_weight: s.article_weight, brand_name: null,
    };
}
// Los renglones (de uno o de varios códigos) en el orden del árbol de cada código, con su «Equivale a» y lo que hace falta para dibujar la ramificación.
function mapSkuDistributionRows(rows, pendingByRecord, companyName, pantalla) {
    const bySku = new Map();
    rows.forEach((r) => { if (!bySku.has(r.sku_item_id)) bySku.set(r.sku_item_id, []); bySku.get(r.sku_item_id).push(r); });
    const out = [];
    bySku.forEach((list) => skuDistTree(list).forEach((node) => out.push(mapSkuDistribution(node.row, pendingByRecord, companyName, node, pantalla))));
    return out;
}
// Lo que llega en el cuerpo, ya con sus tipos; null en lo que no vino.
function normalizeSkuDistInput(body) {
    const out = {};
    const num = (v) => (v === '' || v == null ? null : Number(v));
    if (Object.prototype.hasOwnProperty.call(body, 'skuItemId')) { const n = Number(body.skuItemId); if (!Number.isInteger(n) || n < 1) return { error: 'Elige un código de Alta Artículos.' }; out.skuItemId = n; }
    if (Object.prototype.hasOwnProperty.call(body, 'parentId')) { const n = body.parentId === '' || body.parentId == null ? null : Number(body.parentId); if (n !== null && !(Number.isInteger(n) && n > 0)) return { error: 'Elige de cuál presentación sale.' }; out.parentId = n; }
    if (Object.prototype.hasOwnProperty.call(body, 'classification')) { const c = String(body.classification || ''); if (c && !['patente', 'generico'].includes(c)) return { error: 'La clasificación es Patente o Genérico.' }; out.classification = c; }
    if (Object.prototype.hasOwnProperty.call(body, 'brandId')) { const n = body.brandId === '' || body.brandId == null ? null : Number(body.brandId); if (n !== null && !(Number.isInteger(n) && n > 0)) return { error: 'Elige la marca del catálogo.' }; out.brandId = n; }
    if (Object.prototype.hasOwnProperty.call(body, 'uom')) { if (body.uom != null && (typeof body.uom !== 'string' || body.uom.length > 60)) return { error: 'La unidad de medida no es válida.' }; out.uom = (body.uom || '').trim(); }
    if (Object.prototype.hasOwnProperty.call(body, 'shape')) out.shape = body.shape;
    if (Object.prototype.hasOwnProperty.call(body, 'canLay')) out.canLay = !!body.canLay;
    // Tipo de almacenamiento: una, varias o todas las opciones de la lista (o ninguna); se guarda en el orden de la lista
    if (Object.prototype.hasOwnProperty.call(body, 'storageTypes')) {
        const picked = (Array.isArray(body.storageTypes) ? body.storageTypes : String(body.storageTypes || '').split(',')).map((k) => String(k).trim()).filter(Boolean);
        if (!picked.every((k) => SKU_DIST_STORAGE_TYPES.includes(k))) return { error: 'Tipo de almacenamiento: elige opciones de la lista.' };
        out.storageTypes = SKU_DIST_STORAGE_TYPES.filter((k) => picked.includes(k)).join(',');
    }
    // Envíos a: los lugares del catálogo Lugares de Envío (ids), de menor a mayor y sin repetir; vacío = a ninguno (que existan y estén activos se revisa en validateSkuDistState)
    if (Object.prototype.hasOwnProperty.call(body, 'shipTo')) {
        const picked = (Array.isArray(body.shipTo) ? body.shipTo : String(body.shipTo || '').split(',')).map((k) => String(k).trim()).filter(Boolean).map(Number);
        if (!picked.every((n) => Number.isInteger(n) && n > 0)) return { error: 'Envíos a: elige lugares de la lista.' };
        out.shipTo = [...new Set(picked)].sort((a, z) => a - z).join(',');
    }
    // Datos de estiba: enteros de 0 a 1,000,000 (vacío o 0 = sin capturar)
    for (const key of UDM_DIST_INT_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
        const raw = body[key];
        const n = raw === '' || raw == null ? 0 : Number(raw);
        if (!Number.isInteger(n) || n < 0 || n > 1000000) return { error: 'Cantidad por cama, camas por pallet y máxima estiba: escribe un número entero (0 = sin capturar).' };
        out[key] = n;
    }
    for (const key of ['contains', 'length', 'width', 'height', 'weightG']) {
        if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
        const n = num(body[key]);
        if (n !== null && !Number.isFinite(n)) return { error: 'Uno de los datos no es un número válido.' };
        out[key] = n;
    }
    return { values: out };
}
// Revisa la presentación tal como quedaría. state = { level, uom, contains, shape, length, width, height, weightG }; existing = el renglón actual (para respetar una unidad que ya quedó inactiva).
function validateSkuDistState(req, state, existing) {
    const bad = (message, status = 400) => ({ error: { status, message } });
    if (!['rectangular', 'cilindrica'].includes(state.shape)) return bad('Elige la forma (rectangular o cilíndrica).');
    // Envíos a: cada lugar tiene que estar en el catálogo Lugares de Envío y activo (uno que ya traía la presentación y quedó inactivo se respeta)
    if (state.shipTo) {
        const kept = new Set(String((existing && existing.ship_to) || '').split(','));
        const active = new Set(listArticleCategories(req.user.clientId, 'lugares-envio', req.user.isTestAccount).filter((r) => r.status === 'active').map((r) => String(r.id)));
        if (!String(state.shipTo).split(',').every((k) => active.has(k) || kept.has(k))) return bad('Envíos a: uno de los lugares no está en el catálogo Lugares de Envío (o está inactivo). Elige de la lista.');
    }
    if (state.level === 0) return { ok: true }; // el principal solo lleva forma y se-puede-acostar; lo demás sale de Alta Artículos
    if (!state.uom) return bad('Elige la unidad de medida del catálogo.');
    const active = listActiveArticleCategoryNames(req.user.clientId, 'udm', req.user.isTestAccount);
    if (!active.includes(state.uom) && !(existing && existing.uom === state.uom)) return bad('Esa unidad de medida no está en el catálogo Nuestras Unidad Medida (o está inactiva). Elige una de la lista.');
    if (!Number.isInteger(state.contains) || state.contains < 1 || state.contains > 1000000) return bad('Cuántas de la presentación anterior contiene: escribe un número entero mayor a 0.');
    const dims = state.shape === 'cilindrica' ? [state.length, state.height] : [state.length, state.width, state.height];
    if (!dims.every((v) => Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) <= 100000)) return bad(`Escribe ${state.shape === 'cilindrica' ? 'el diámetro y el alto' : 'largo, ancho y alto'} en cm, mayores a 0.`);
    if (!(Number(state.weightG) > 0) || Number(state.weightG) > 1000000000) return bad('Escribe el peso en gramos, mayor a 0.');
    return { ok: true };
}
const skuDistLabel = (row) => `#${row.id}`;
function skuDistSanitizers(req) {
    const places = new Map(req ? listArticleCategories(req.user.clientId, 'lugares-envio', req.user.isTestAccount).map((r) => [String(r.id), r.name]) : []);
    const typeNames = { principal: 'Por UDM producto principal', original: 'Por UDM original', almacenamiento: 'Por UDM de almacenamiento', compra: 'Por UDM de compra', empaque: 'Por UDM de empaque', pallet: 'Por UDM de pallets' };
    return { canLay: (v) => (v ? 'Sí' : 'No'), shape: (v) => (v === 'cilindrica' ? 'Cilíndrica' : 'Rectangular'), storageTypes: (v) => (v === null || v === undefined || v === '' ? 'Ninguno' : String(v).split(',').map((k) => typeNames[k] || k).join(', ')), shipTo: (v) => (v === null || v === undefined || v === '' ? 'Ninguno' : String(v).split(',').map((k) => places.get(k) || `#${k}`).join(', ')) };
}

app.get('/api/business/sku-distribution', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const client = getClientById(clientId);
    const pendingByRecord = getPendingColumnsByRecord(clientId, UDM_DIST_TABLE_KEY);
    res.set('Cache-Control', 'no-store');
    // skuItemId: solo las presentaciones de ese código (la ventana «Ver presentaciones de distribución» de Alta Artículos)
    const onlySku = Number(req.query.skuItemId);
    const wantsSku = Number.isInteger(onlySku) && onlySku > 0;
    // q: la búsqueda de Operaciones (por descripción o código, con el motor de búsqueda de todo el sistema): trae las presentaciones de los códigos que coinciden (hasta UDM_DIST_SEARCH_LIMIT) y, de los que todavía no tienen
    // ninguna, su material principal sin guardar para poder capturarlo. Sin q y sin skuItemId: el catálogo, TODOS los códigos de Alta con su ramificación (los que no tienen presentaciones, con su material principal sin guardar).
    const searching = !wantsSku && req.query.q !== undefined;
    let source;
    let truncated = false;
    if (wantsSku) source = listSkuDistributionBySku(clientId, isTestAccount, onlySku);
    else if (searching) {
        source = [];
        const mode = PUBLIC_SEARCH_MODES.includes(req.query.mode) ? req.query.mode : 'contains';
        const query = publicSearchQuery(req.query.q);
        if (SearchSyntax.ready(mode, query)) {
            const matches = publicSearchMatcher(mode, query);
            const found = searchSkuItems(clientId, '', isTestAccount, 100000).filter((s) => matches([padSku(s.record_number, s.sku_code), padSku(s.record_number), s.client_code, s.upc, s.unique_description, s.known_description, s.custom_description]));
            truncated = found.length > UDM_DIST_SEARCH_LIMIT;
            const ids = found.slice(0, UDM_DIST_SEARCH_LIMIT).map((s) => s.id);
            source = listSkuDistributionBySkus(clientId, isTestAccount, ids);
            const have = new Set(source.map((r) => r.sku_item_id));
            const want = new Set(ids.filter((id) => !have.has(id)));
            if (want.size) source = source.concat(listSkuItemsWithoutDistribution(clientId, isTestAccount).filter((s) => want.has(s.id)).map(skuDistPlaceholderRow)).sort((a, z) => a.sku_number - z.sku_number);
        }
    } else {
        source = listSkuDistribution(clientId, isTestAccount);
        const bare = listSkuItemsWithoutDistribution(clientId, isTestAccount).map(skuDistPlaceholderRow);
        if (bare.length) source = source.concat(bare).sort((a, z) => a.sku_number - z.sku_number);
    }
    const pantalla = req.query.catalog === '1' ? 'Presentaciones Distribución' : undefined; // el catálogo se rotula con su propio nombre en la columna Pantalla de Control Interno
    res.json({
        searched: searching, truncated, maxCodes: UDM_DIST_SEARCH_LIMIT,
        rows: mapSkuDistributionRows(source, pendingByRecord, client?.company_name, pantalla).map((r) => (r.id < 0 ? { ...r, virtual: true, registroUnico: '' } : r)),
        uoms: listActiveArticleCategoryNames(clientId, 'udm', isTestAccount),
        // las marcas activas del catálogo Nuestras Marcas (para elegir la de una presentación)
        brands: listArticleCategories(clientId, 'marcas', isTestAccount).filter((r) => r.status === 'active' && r.name).map((r) => ({ id: r.id, name: r.name })),
        // los lugares de envío del catálogo (todos, para poder nombrar uno que ya quedó inactivo; los activos son los que se pueden elegir)
        places: listArticleCategories(clientId, 'lugares-envio', isTestAccount).filter((r) => r.name).map((r) => ({ id: r.id, name: r.name, active: r.status === 'active' })),
        maxDepth: UDM_DIST_MAX_DEPTH,
        maxChildren: UDM_DIST_MAX_CHILDREN,
    });
});

app.post('/api/business/sku-distribution', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const grants = req.user.isClientAdmin ? null : getUserEffectiveGrants(req.user.sub);
    if (grants && !canCreateColumn(grants, UDM_DIST_TABLE_KEY, 'colUdmDCreateAuth')) return res.status(403).json({ message: 'No tienes permiso para crear registros aquí.' });
    const norm = normalizeSkuDistInput(req.body || {});
    if (norm.error) return res.status(400).json({ message: norm.error });
    const sku = norm.values.skuItemId ? getSkuItemById(norm.values.skuItemId, clientId, isTestAccount) : null;
    if (!sku) return res.status(400).json({ message: 'Elige un código de Alta Artículos.' });
    const rows = listSkuDistributionBySku(clientId, isTestAccount, sku.id);
    if (rows.length >= UDM_DIST_MAX_PER_SKU) return res.status(400).json({ message: `Un código admite hasta ${UDM_DIST_MAX_PER_SKU} presentaciones.` });
    // el primer renglón de un código es siempre el material principal; las demás salen de una que ya existe (por defecto, del material principal) o, si traen clasificación y marca, de esa marca
    const treeNodes = skuDistTree(rows);
    const plevelOf = (row) => ((treeNodes.find((n) => n.row.id === row.id) || {}).plevel || 0);
    const wantsBrand = !!norm.values.classification;
    if (wantsBrand !== (norm.values.brandId != null)) return res.status(400).json({ message: 'Elige la clasificación y la marca juntas (o ninguna de las dos).' });
    if (!rows.length && wantsBrand) return res.status(400).json({ message: 'La primera presentación de un código es su material principal: ahí no va marca.' });
    let parent = null;
    let level = 0;
    let plevel = 0; // profundidad entre las presentaciones (la marca no cuenta como nivel)
    let newBrand = null; // { classification, brandId, name }: la marca todavía no está en este código, se crea junto con la presentación
    if (rows.length) {
        const main = rows.find((r) => r.level === 0);
        const brandNodes = rows.filter((r) => r.kind === 'marca');
        if (wantsBrand) {
            const { classification, brandId } = norm.values;
            const brandNode = brandNodes.find((r) => r.brand_id === brandId) || null;
            if (brandNode) {
                if (brandNode.classification !== classification) return res.status(400).json({ message: `${brandNode.brand_name} ya está en este código como ${brandNode.classification === 'patente' ? 'Patente' : 'Genérico'}.` });
                parent = norm.values.parentId ? rows.find((r) => r.id === norm.values.parentId) : brandNode;
                const inBrand = (r) => { for (let cur = r, guard = 0; cur && guard < 50; guard += 1) { if (cur.id === brandNode.id) return true; cur = cur.parent_id ? rows.find((x) => x.id === cur.parent_id) : null; } return false; };
                if (!parent || !inBrand(parent)) return res.status(400).json({ message: `Elige una presentación de la marca ${brandNode.brand_name} (o que salga directo de la marca).` });
                level = parent.level + 1;
                plevel = plevelOf(parent) + 1;
            } else {
                const cat = getArticleCategoryById(brandId, clientId, isTestAccount);
                if (!cat || cat.category_type !== 'marcas') return res.status(400).json({ message: 'La marca no está en el catálogo Nuestras Marcas.' });
                if (cat.status !== 'active') return res.status(400).json({ message: 'Esa marca está inactiva. Elige una activa.' });
                if (rows.some((r) => r.kind !== 'marca' && r.parent_id === main.id)) return res.status(400).json({ message: 'Este código ya tiene presentaciones sin marca: quítalas para usar marcas.' });
                if (classification === 'patente') {
                    const pat = brandNodes.find((r) => r.classification === 'patente');
                    if (pat) return res.status(400).json({ message: `Este código ya tiene una patente (${pat.brand_name}). De una patente solo puede haber una marca.` });
                }
                if (brandNodes.length >= UDM_DIST_MAX_CHILDREN) return res.status(400).json({ message: `Un código admite hasta ${UDM_DIST_MAX_CHILDREN} marcas.` });
                if (norm.values.parentId) return res.status(400).json({ message: 'La marca es nueva en este código: la presentación sale directo de ella.' });
                newBrand = { classification, brandId, name: cat.name };
                level = main.level + 2; // principal > marca > presentación
                plevel = 1;
            }
        } else {
            parent = norm.values.parentId ? rows.find((r) => r.id === norm.values.parentId) : main;
            if (!parent) return res.status(400).json({ message: 'Elige de cuál presentación de este código sale la nueva.' });
            if (parent.level === 0 && brandNodes.length) return res.status(400).json({ message: 'Este código usa marcas: elige la clasificación y la marca de la presentación.' });
            level = parent.level + 1;
            plevel = plevelOf(parent) + 1;
        }
        if (plevel > UDM_DIST_MAX_DEPTH) return res.status(400).json({ message: `Una presentación admite hasta ${UDM_DIST_MAX_DEPTH} niveles.` });
        if (parent && rows.filter((r) => r.parent_id === parent.id).length >= UDM_DIST_MAX_CHILDREN) return res.status(400).json({ message: `De una misma presentación pueden salir hasta ${UDM_DIST_MAX_CHILDREN}.` });
    }
    const state = { uom: '', contains: null, shape: 'rectangular', length: 0, width: 0, height: 0, weightG: 0, canLay: false, ...norm.values, level, parentId: parent ? parent.id : null };
    const brandFields = { classification: norm.values.classification, brandId: norm.values.brandId };
    delete state.classification; // son del renglón de la marca, no de la presentación
    delete state.brandId;
    if (level === 0) Object.assign(state, { uom: '', contains: null, length: 0, width: 0, height: 0, weightG: 0 });
    if (state.shape === 'cilindrica') state.width = state.length;
    if (grants) {
        const missing = Object.entries(UDM_DIST_COLS)
            .filter(([key]) => (level === 0 ? UDM_DIST_MAIN_KEYS.includes(key) : true))
            .filter(([key]) => { const v = key in brandFields ? brandFields[key] : state[key]; return !(v === null || v === '' || v === undefined || v === false || (key === 'shape' && v === 'rectangular') || (key === 'weightG' && !v) || (UDM_DIST_INT_KEYS.includes(key) && !v)); })
            .filter(([, colKey]) => !['ver-y-operar', 'editar'].includes(getColumnGrantLevel(grants, UDM_DIST_TABLE_KEY, colKey)))
            .map(([key]) => SKU_DIST_PATCHABLE_FIELDS[key].fieldKey);
        if (missing.length) return res.status(403).json({ message: 'No tienes permiso para llenar uno de los datos de esta presentación.', fields: missing });
    }
    const check = validateSkuDistState(req, state, null);
    if (check.error) return res.status(check.error.status).json({ message: check.error.message });
    let row;
    if (newBrand) {
        // la marca nueva y su primera presentación se crean juntas (o ninguna)
        const made = createSkuDistributionUnderNewBrand({ clientId, isTestData: isTestAccount, brand: { skuItemId: sku.id, parentId: rows.find((r) => r.level === 0).id, level: 1, classification: newBrand.classification, brandId: newBrand.brandId }, values: { skuItemId: sku.id, ...state } });
        row = made.row;
        logTableChange({ clientId, tableKey: UDM_DIST_TABLE_KEY, recordId: made.brandRow.id, recordLabel: skuDistLabel(made.brandRow), action: 'create', changedBy: changedByLabel(req) });
        logTableChange({ clientId, tableKey: UDM_DIST_TABLE_KEY, recordId: made.brandRow.id, recordLabel: skuDistLabel(made.brandRow), action: 'update', fieldKey: SKU_DIST_PATCHABLE_FIELDS.classification.fieldKey, oldValue: '', newValue: newBrand.classification === 'patente' ? 'Patente' : 'Genérico', changedBy: changedByLabel(req) });
        logTableChange({ clientId, tableKey: UDM_DIST_TABLE_KEY, recordId: made.brandRow.id, recordLabel: skuDistLabel(made.brandRow), action: 'update', fieldKey: SKU_DIST_PATCHABLE_FIELDS.brandId.fieldKey, oldValue: '', newValue: newBrand.name, changedBy: changedByLabel(req) });
    } else row = createSkuDistribution({ clientId, isTestData: isTestAccount, values: { skuItemId: sku.id, ...state } });
    logTableChange({ clientId, tableKey: UDM_DIST_TABLE_KEY, recordId: row.id, recordLabel: skuDistLabel(row), action: 'create', changedBy: changedByLabel(req) });
    const san = skuDistSanitizers(req);
    Object.entries(SKU_DIST_PATCHABLE_FIELDS).forEach(([key, { fieldKey }]) => {
        const v = state[key];
        if (v === null || v === '' || v === undefined || v === false || (key === 'shape' && v === 'rectangular') || (key === 'weightG' && !v) || (UDM_DIST_INT_KEYS.includes(key) && !v) || (level === 0 && !UDM_DIST_MAIN_KEYS.includes(key))) return;
        logTableChange({ clientId, tableKey: UDM_DIST_TABLE_KEY, recordId: row.id, recordLabel: skuDistLabel(row), action: 'update', fieldKey, oldValue: '', newValue: san[key] ? san[key](v) : String(v), changedBy: changedByLabel(req) });
    });
    notifyButtonAction(req, UDM_DIST_TABLE_KEY, 'create', `${padSku(row.sku_number, row.sku_code)} · ${PACK_ORDINALS[row.level] || ''}`);
    const client = getClientById(clientId);
    const mapped = mapSkuDistributionRows(listSkuDistributionBySku(clientId, isTestAccount, sku.id), null, client?.company_name).find((r) => r.id === row.id);
    res.status(201).json({ row: mapped });
});

app.patch('/api/business/sku-distribution/:id', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const existing = getSkuDistributionById(req.params.id, clientId, isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Presentation not found.' });
    if (existing.kind === 'marca') return res.status(400).json({ message: 'La marca no se cambia: quita sus presentaciones y la marca, y vuelve a capturarla.' });
    const { baseline, overrideConflicts, ...raw } = req.body || {};
    delete raw.skuItemId; // el código de una presentación no cambia
    delete raw.parentId; // de cuál sale tampoco: se quita y se vuelve a capturar
    delete raw.classification; // ni su clasificación ni su marca (son las de la marca de la que sale)
    delete raw.brandId;
    const norm = normalizeSkuDistInput(raw);
    if (norm.error) return res.status(400).json({ message: norm.error });
    const principal = existing.level === 0;
    if (principal && Object.keys(norm.values).some((k) => !UDM_DIST_MAIN_KEYS.includes(k))) return res.status(400).json({ message: 'Las medidas y el peso del material principal se capturan en Alta Artículos. Aquí solo su forma y si se puede acostar.' });
    const patch = { ...norm.values };
    const state = { level: existing.level, uom: existing.uom, contains: existing.contains, shape: existing.shape, length: existing.length, width: existing.width, height: existing.height, weightG: existing.weight_g, canLay: !!existing.can_lay, ...patch };
    if (state.shape === 'cilindrica') { state.width = state.length; if ('length' in patch || 'shape' in patch) patch.width = state.length; }
    const check = validateSkuDistState(req, state, existing);
    if (check.error) return res.status(check.error.status).json({ message: check.error.message });
    const { appliedPatch, pendingFields, rejectedFields, conflictFields } = checkAndLogFieldChanges(req, existing, patch, SKU_DIST_PATCHABLE_FIELDS, UDM_DIST_TABLE_KEY, skuDistLabel(existing), skuDistSanitizers(req), { baseline, overrideConflicts });
    updateSkuDistribution(existing.id, clientId, appliedPatch, isTestAccount);
    const client = getClientById(clientId);
    const mapped = mapSkuDistributionRows(listSkuDistributionBySku(clientId, isTestAccount, existing.sku_item_id), null, client?.company_name).find((r) => r.id === existing.id);
    res.json({ row: mapped, pendingFields, rejectedFields, conflictFields });
});

app.delete('/api/business/sku-distribution/:id', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const existing = getSkuDistributionById(req.params.id, clientId, isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Presentation not found.' });
    if (!req.user.isClientAdmin && !canDeleteColumn(getUserEffectiveGrants(req.user.sub), UDM_DIST_TABLE_KEY, 'colUdmDDeleteAuth')) return res.status(403).json({ message: 'No tienes permiso para eliminar registros aquí.' });
    // si salen otras de esta, no se quita: primero se quitan las que dependen de ella
    const rows = listSkuDistributionBySku(clientId, isTestAccount, existing.sku_item_id);
    const kids = rows.filter((r) => r.parent_id === existing.id);
    if (kids.length) return res.status(409).json({ message: `Primero quita las ${kids.length} presentación(es) que salen de esta: dependen de ella.`, code: 'DEPENDS' });
    const usedId = existing.level === 0 ? 0 : existing.id; // en Relación Código el material principal es el 0
    const used = listCodeRelationsBy(clientId, isTestAccount, 'sku_item_id', existing.sku_item_id).filter((r) => r.pack_unit_id === usedId).length;
    if (used) return res.status(409).json({ message: `${used} lugar(es) de Relación Código almacenan esta unidad. Cámbialos primero.`, code: 'IN_USE' });
    logTableChange({ clientId, tableKey: UDM_DIST_TABLE_KEY, recordId: existing.id, recordLabel: skuDistLabel(existing), action: 'delete', changedBy: changedByLabel(req) });
    notifyButtonAction(req, UDM_DIST_TABLE_KEY, 'delete', `${padSku(existing.sku_number, existing.sku_code)} · ${PACK_ORDINALS[existing.level] || ''}`);
    deleteSkuDistribution(existing.id, clientId);
    res.status(204).end();
});

// --- Relación Código Envío (Operaciones, C. Distribución) ------------------------------------------------------------------------------------------------
// Qué código se habilita para enviar a qué LUGAR DE ENVÍO (catálogo Lugares de Envío), por centro de costos: un renglón = un código enviado a un lugar. Se captura una por una (un código a varios lugares a la vez) o por
// plantilla (Excel o filas pegadas: la pantalla revisa cada fila y aquí se vuelve a revisar). Es la relación de los pedidos manuales EXTERNOS; la Relación Código de siempre es la de los códigos internos.
const SHIP_REL_TABLE_KEY = 'relacion-envio';
const SHIP_REL_SCREEN_LABEL = 'Relación Código Envío';
const SHIP_REL_IMPORT_MAX = 500;
const SHIP_REL_MAX_PLACES = 200;
const shipCanDelete = (req) => !!req.user.isClientAdmin || canDeleteColumn(getUserEffectiveGrants(req.user.sub), SHIP_REL_TABLE_KEY, 'colEnvDeleteAuth');
const shipCan = (req, colKey) => !!req.user.isClientAdmin || canCreateColumn(getUserEffectiveGrants(req.user.sub), SHIP_REL_TABLE_KEY, colKey);
function shipContext(req) {
    const { clientId, isTestAccount } = req.user;
    return {
        centers: new Map(listCostCenters(clientId, isTestAccount).map((c) => [c.id, c])),
        places: new Map(listArticleCategories(clientId, 'lugares-envio', isTestAccount).map((r) => [r.id, r])),
    };
}
function mapShipRelation(r, companyName, ctx) {
    const cc = ctx.centers.get(r.cost_center_id);
    return {
        id: r.id, registroUnico: r.db_id, skuItemId: r.sku_item_id, sku: padSku(r.sku_number, r.sku_code), upc: r.sku_upc || '',
        description: r.sku_unique || '', costCenterId: r.cost_center_id, centroCostos: cc ? cc.name : '', // «Descripción única»: solo esa (sin las otras descripciones del código)
        placeId: r.place_id, place: r.place_name || '', placeActive: r.place_status === 'active',
        ...getSystemColumnsForRecord({ companyName, area: CODE_RELATION_AREA_LABEL, modulo: CODE_RELATION_MODULE_LABEL, pantalla: SHIP_REL_SCREEN_LABEL, centroCostos: cc ? cc.name : '', createdAt: r.created_at }),
    };
}
// Revisa y guarda UNA relación (lo usan la captura a mano y la plantilla). Devuelve { row } o { error, code }.
function tryCreateShipRelation(req, ctx, { skuItemId, placeId, costCenterId }) {
    const { clientId, isTestAccount } = req.user;
    const sku = Number.isInteger(skuItemId) && skuItemId > 0 ? getSkuItemById(skuItemId, clientId, isTestAccount) : null;
    if (!sku) return { error: 'Elige un código de Alta Artículos.', code: 'SKU' };
    const place = ctx.places.get(placeId);
    if (!place || place.status !== 'active' || !place.name) return { error: 'Elige un lugar de envío activo del catálogo Lugares de Envío.', code: 'PLACE' };
    const center = ctx.centers.get(costCenterId);
    if (!center) return { error: 'Elige el centro de costos.', code: 'CENTER' };
    if (findCodeShipRelation(clientId, isTestAccount, center.id, sku.id, place.id)) return { error: 'Ese código ya está relacionado con ese lugar en este centro de costos.', code: 'EXISTS' };
    const row = createCodeShipRelation({ clientId, isTestData: isTestAccount, costCenterId: center.id, skuItemId: sku.id, placeId: place.id, createdBy: changedByLabel(req) });
    logTableChange({ clientId, tableKey: SHIP_REL_TABLE_KEY, recordId: row.id, recordLabel: `${padSku(sku.record_number, sku.sku_code)} → ${place.name}`, action: 'create', changedBy: changedByLabel(req) });
    return { row };
}
const intOf = (v) => { const n = Number(v); return Number.isInteger(n) ? n : 0; };
app.get('/api/business/code-ship-relations', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const client = getClientById(clientId);
    const ctx = shipContext(req);
    res.set('Cache-Control', 'no-store');
    res.json({
        relations: listCodeShipRelations(clientId, isTestAccount).map((r) => mapShipRelation(r, client?.company_name, ctx)),
        // Todos los códigos que hay en Alta Artículos (por ahora todo el catálogo de códigos), solo con su descripción única: la pantalla muestra un renglón por cada código que todavía no tiene lugares.
        codes: searchSkuItems(clientId, '', isTestAccount, 100000).map((s) => ({ id: s.id, sku: padSku(s.record_number, s.sku_code), upc: s.upc || '', description: s.unique_description || '' })),
        places: [...ctx.places.values()].filter((p) => p.name).map((p) => ({ id: p.id, name: p.name, active: p.status === 'active' })),
        costCenters: [...ctx.centers.values()].map((c) => ({ id: c.id, name: c.name, code: c.code || '' })),
        canCreate: shipCan(req, 'colEnvCreateAuth'), canDelete: shipCanDelete(req), canTemplate: shipCan(req, 'colEnvTemplateAuth'),
    });
});
app.post('/api/business/code-ship-relations', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!shipCan(req, 'colEnvCreateAuth')) return res.status(403).json({ message: 'No tienes permiso para crear registros aquí.' });
    const body = req.body || {};
    const placeIds = [...new Set((Array.isArray(body.placeIds) ? body.placeIds : []).map(intOf).filter((n) => n > 0))];
    if (!placeIds.length) return res.status(400).json({ message: 'Elige al menos un lugar de envío.', code: 'PLACE' });
    if (placeIds.length > SHIP_REL_MAX_PLACES) return res.status(400).json({ message: `Elige hasta ${SHIP_REL_MAX_PLACES} lugares a la vez.`, code: 'PLACE' });
    const ctx = shipContext(req);
    const created = [];
    let existing = 0;
    let firstError = null;
    placeIds.forEach((placeId) => {
        const out = tryCreateShipRelation(req, ctx, { skuItemId: intOf(body.skuItemId), placeId, costCenterId: intOf(body.costCenterId) });
        if (out.row) created.push(out.row);
        else if (out.code === 'EXISTS') existing += 1;
        else if (!firstError) firstError = out;
    });
    if (!created.length && firstError) return res.status(400).json({ message: firstError.error, code: firstError.code });
    if (created.length) notifyButtonAction(req, SHIP_REL_TABLE_KEY, 'create', `${created[0].sku_number ? padSku(created[0].sku_number, created[0].sku_code) : ''} → ${created.map((r) => r.place_name).join(', ')}`);
    const client = getClientById(req.user.clientId);
    res.status(created.length ? 201 : 200).json({ created: created.map((r) => mapShipRelation(r, client?.company_name, ctx)), existing });
});
// La plantilla: la pantalla ya convirtió los nombres en ids y revisó cada fila; aquí se revisa otra vez (nada se da por bueno) y se guardan las que pasan.
app.post('/api/business/code-ship-relations/import', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!shipCan(req, 'colEnvTemplateAuth')) return res.status(403).json({ message: 'No tienes permiso para cargar por plantilla.' });
    const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
    if (!rows.length || rows.length > SHIP_REL_IMPORT_MAX) return res.status(400).json({ message: `Manda de 1 a ${SHIP_REL_IMPORT_MAX} filas por vez.` });
    const ctx = shipContext(req);
    const created = [];
    const failed = [];
    rows.forEach((row, index) => {
        const out = tryCreateShipRelation(req, ctx, { skuItemId: intOf(row && row.skuItemId), placeId: intOf(row && row.placeId), costCenterId: intOf(row && row.costCenterId) });
        if (out.row) created.push(out.row.id);
        else failed.push({ index, message: out.error, code: out.code });
    });
    if (created.length) notifyButtonAction(req, SHIP_REL_TABLE_KEY, 'create', `Plantilla: ${created.length}`);
    res.json({ created, failed });
});
app.delete('/api/business/code-ship-relations/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const existing = getCodeShipRelationById(intOf(req.params.id), clientId, isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Relation not found.' });
    if (!shipCanDelete(req)) return res.status(403).json({ message: 'No tienes permiso para eliminar registros aquí.' });
    logTableChange({ clientId, tableKey: SHIP_REL_TABLE_KEY, recordId: existing.id, recordLabel: `${padSku(existing.sku_number, existing.sku_code)} → ${existing.place_name || ''}`, action: 'delete', changedBy: changedByLabel(req) });
    notifyButtonAction(req, SHIP_REL_TABLE_KEY, 'delete', `${padSku(existing.sku_number, existing.sku_code)} → ${existing.place_name || ''}`);
    deleteCodeShipRelation(existing.id, clientId);
    res.status(204).end();
});

// --- Alta Activos (Operaciones, C. Distribución) ---------------------------------------------------------------------------------------------------------
// El registro de todo lo que está dentro de un sitio (centro de costos) y se tiene para usar. Un renglón = un activo. El código es automático: la letra de su Tipo de activo (catálogo Activos Fijos) + un consecutivo por
// centro de costos y letra. Nunca se elimina: se desactiva. Medidas en cm, peso en kg y volumen en m³ (el volumen se calcula solo según la forma; en la irregular lo escribe quien da de alta).
const FIXED_ASSET_TABLE_KEY = 'alta-activos';
const FIXED_ASSET_AREA_LABEL = 'C. Distribución';
const FIXED_ASSET_MODULE_LABEL = 'Cadena de Suministro';
const FIXED_ASSET_SCREEN_LABEL = 'Alta Activos';
const FIXED_ASSET_SHAPES = ['rectangular', 'cilindrica', 'irregular'];
const FIXED_ASSET_SHAPE_LABELS = { rectangular: 'Rectangular', cilindrica: 'Cilíndrica', irregular: 'Irregular' };
const FIXED_ASSET_STATUS_LABELS = { active: 'Activo', inactive: 'Inactivo' };
const FIXED_ASSET_PHOTO_KEYS = ['evidenceFront', 'evidenceBack', 'evidenceLeft', 'evidenceRight', 'evidenceTop', 'evidenceBottom'];
const FIXED_ASSET_TEXT_KEYS = { purchaseName: 160, customName: 160, model: 120, serialNumber: 120 };
const FIXED_ASSET_NUM_LIMITS = { height: [100000, 2], length: [100000, 2], depth: [100000, 2], weight: [10000000, 3], volume: [1000000, 4] }; // [máximo, decimales]
const fixedAssetCodeOf = (row) => `${row.code_letter || ''}${String(row.code_number || 0).padStart(3, '0')}`;
const fixedAssetCan = (req, colKey) => !!req.user.isClientAdmin || canCreateColumn(getUserEffectiveGrants(req.user.sub), FIXED_ASSET_TABLE_KEY, colKey);
const fixedAssetCanDelete = (req) => !!req.user.isClientAdmin || canDeleteColumn(getUserEffectiveGrants(req.user.sub), FIXED_ASSET_TABLE_KEY, 'colActDeleteAuth');
// Volumen en m³: rectangular = alto × largo × profundidad; cilíndrica = π × (largo ÷ 2)² × alto (el largo es el diámetro); irregular = el que escribió quien lo dio de alta.
function fixedAssetVolume(shape, height, length, depth, manual) {
    const h = Number(height) || 0;
    const l = Number(length) || 0;
    if (shape === 'irregular') return Math.round((Number(manual) || 0) * 10000) / 10000;
    const cm3 = shape === 'cilindrica' ? Math.PI * (l / 2) * (l / 2) * h : h * l * (Number(depth) || 0);
    return Math.round((cm3 / 1e6) * 10000) / 10000;
}
function fixedAssetContext(req) {
    const { clientId, isTestAccount } = req.user;
    return {
        centers: new Map(listCostCenters(clientId, isTestAccount).map((c) => [c.id, c])),
        types: new Map(listArticleCategories(clientId, 'activos-fijos', isTestAccount).map((r) => [r.id, r])),
        classes: new Map(listArticleCategories(clientId, 'activos-clasificacion', isTestAccount).map((r) => [r.id, r])),
    };
}
function mapFixedAsset(row, ctx, companyName, pendingByRecord, placements) {
    const cc = ctx.centers.get(row.cost_center_id);
    const type = ctx.types.get(row.type_id);
    const cls = ctx.classes.get(row.class_id);
    return {
        id: row.id, registroUnico: row.db_id, code: fixedAssetCodeOf(row), status: row.status,
        costCenterId: row.cost_center_id, typeId: row.type_id, typeName: type ? type.name : '', typeKind: type ? type.kind || '' : '',
        classId: row.class_id, className: cls ? cls.name : '',
        purchaseName: row.purchase_name, customName: row.custom_name, model: row.model, serialNumber: row.serial_number,
        shape: row.shape, height: row.height_cm, length: row.length_cm, depth: row.depth_cm, weight: row.weight_kg, volume: row.volume_m3,
        evidenceFront: row.evidence_front, evidenceBack: row.evidence_back, evidenceLeft: row.evidence_left, evidenceRight: row.evidence_right, evidenceTop: row.evidence_top, evidenceBottom: row.evidence_bottom,
        showInLayout: !!row.show_in_layout,
        // dónde está dibujado (zona › huella) en el Layout de su centro; '' = no está colocado. En las respuestas de un solo renglón no se manda (la pantalla conserva el que tenía).
        ...(placements ? { placement: placements.get(row.id) || '' } : {}),
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({ companyName, area: FIXED_ASSET_AREA_LABEL, modulo: FIXED_ASSET_MODULE_LABEL, pantalla: FIXED_ASSET_SCREEN_LABEL, centroCostos: cc ? cc.name : '', createdAt: row.created_at }),
    };
}
// Revisa lo que llega (alta o cambio) y lo deja listo para guardar: texto recortado, números con su máximo, la forma, la clasificación del catálogo, el volumen calculado. `existing` = el renglón de antes (null en un alta).
// Devuelve { values } (solo lo que llegó, más lo que se calcula) o { error: { status, message, code } }.
function normalizeFixedAssetValues(input, ctx, existing) {
    const bad = (message, code) => ({ error: { status: 400, message, code } });
    const values = {};
    for (const [key, max] of Object.entries(FIXED_ASSET_TEXT_KEYS)) {
        if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
        values[key] = String(input[key] == null ? '' : input[key]).trim().slice(0, max);
    }
    if (Object.prototype.hasOwnProperty.call(input, 'shape')) {
        if (!FIXED_ASSET_SHAPES.includes(input.shape)) return bad('La forma debe ser Rectangular, Cilíndrica o Irregular.', 'SHAPE');
        values.shape = input.shape;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'classId')) {
        if (input.classId === null || input.classId === '' || input.classId === 0) values.classId = null;
        else {
            const id = intOf(input.classId);
            const cls = ctx.classes.get(id);
            if (!cls || (cls.status !== 'active' && !(existing && existing.class_id === id))) return bad('Elige una clasificación activa del catálogo Clasificaciones de Activos.', 'CLASS');
            values.classId = id;
        }
    }
    for (const [key, [limit, decimals]] of Object.entries(FIXED_ASSET_NUM_LIMITS)) {
        if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
        const raw = input[key];
        const n = raw === '' || raw == null ? 0 : Number(raw);
        if (!Number.isFinite(n) || n < 0 || n > limit) return bad(`La medida debe ser un número entre 0 y ${limit}.`, 'NUM');
        values[key] = Math.round(n * 10 ** decimals) / 10 ** decimals;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'showInLayout')) values.showInLayout = input.showInLayout === true || input.showInLayout === 1 || input.showInLayout === '1' || input.showInLayout === 'true' ? 1 : 0;
    for (const key of FIXED_ASSET_PHOTO_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
        const v = String(input[key] == null ? '' : input[key]).trim();
        if (v.startsWith('data:') || v.length > 500) return bad('La foto no es válida: se sube desde su botón.', 'PHOTO');
        values[key] = v;
    }
    // lo derivado: con la forma cilíndrica la profundidad es el largo, y el volumen sale de las medidas (salvo en la irregular, donde se escribe)
    const base = { shape: 'rectangular', height: 0, length: 0, depth: 0, volume: 0 };
    if (existing) { base.shape = existing.shape; base.height = existing.height_cm; base.length = existing.length_cm; base.depth = existing.depth_cm; base.volume = existing.volume_m3; }
    const state = { ...base, ...values };
    if (state.shape === 'cilindrica') { state.depth = state.length; if ('length' in values || 'shape' in values) values.depth = state.length; }
    const touched = ['shape', 'height', 'length', 'depth', 'volume'].some((k) => k in values);
    if (touched) values.volume = fixedAssetVolume(state.shape, state.height, state.length, state.depth, state.volume);
    return { values };
}
function fixedAssetSanitizers(ctx) {
    return {
        typeId: (v) => { const t = ctx.types.get(Number(v)); return t ? t.name : ''; },
        classId: (v) => { const c = ctx.classes.get(Number(v)); return c ? c.name : ''; },
        shape: (v) => FIXED_ASSET_SHAPE_LABELS[v] || String(v == null ? '' : v),
        showInLayout: (v) => (Number(v) ? 'Sí' : 'No'),
        ...Object.fromEntries(FIXED_ASSET_PHOTO_KEYS.map((k) => [k, (v) => (v ? '[imagen]' : '')])),
    };
}
// --- Activos del Layout que vienen de Alta Activos -------------------------------------------------------------------------------------------------------
// Un activo del Layout (layout.spaces[].assetRef) es un renglón de Alta Activos: su código, su nombre, su tipo, su clasificación y sus medidas los manda el registro (LayoutCalc.applyAssetToSpace). En el Layout solo se colocan (en qué
// huella van, sus niveles…). Al guardar el Layout el servidor vuelve a poner lo del registro (lo que mande la pantalla no manda) y al cambiar el registro se actualiza el Layout guardado (syncFixedAssetIntoLayout).
function layoutAssetInfo(row) {
    return { id: row.id, code: fixedAssetCodeOf(row), customName: row.custom_name, purchaseName: row.purchase_name, typeId: row.type_id || 0, classId: row.class_id || 0, length: row.length_cm, depth: row.depth_cm, height: row.height_cm };
}
function layoutAssetCatalogs(clientId) {
    return {
        types: new Map(listArticleCategoriesAnyScope(clientId, 'activos-fijos').map((r) => [r.id, r])),
        classes: new Map(listArticleCategoriesAnyScope(clientId, 'activos-clasificacion').map((r) => [r.id, r])),
    };
}
function layoutAssetOpts(row, cat) {
    const type = cat.types.get(row.type_id);
    const cls = cat.classes.get(row.class_id);
    return { typeKind: type ? type.kind || '' : '', metric: cls ? cls.kind || '' : '' };
}
// El Layout que llega a guardarse: cada activo o sensor con assetRef toma del registro lo suyo. Valida que exista, que sea de este centro de costos, que no esté dos veces, que un activo de huella no sea un Sensor (esos van en el
// paso Sensores) ni al revés, y que uno recién colocado esté activo, aparezca en el Layout y (si va en una huella) tenga medidas.
function applyFixedAssetsToLayout(layoutIn, { clientId, centerId, previous }) {
    const spaces = Array.isArray(layoutIn && layoutIn.spaces) ? layoutIn.spaces : [];
    const sensors = Array.isArray(layoutIn && layoutIn.sensors) ? layoutIn.sensors : [];
    if (!spaces.some((s) => s && s.assetRef) && !sensors.some((s) => s && s.assetRef)) return { layout: layoutIn, touched: false };
    const cat = layoutAssetCatalogs(clientId);
    const before = new Set([...((previous && previous.spaces) || []), ...((previous && previous.sensors) || [])].map((s) => Number(s.assetRef)).filter(Boolean));
    const seen = new Set();
    const take = (item, asSensor) => {
        const ref = Math.round(Number(item && item.assetRef));
        if (!(ref > 0)) return { item };
        const fail = (message) => ({ error: { message, section: asSensor ? 'sensores' : 'activos' } });
        const row = getFixedAssetAnyScope(ref, clientId);
        if (!row) return fail('Un activo del Layout ya no existe en Alta Activos. Quítalo de la lista.');
        const code = fixedAssetCodeOf(row);
        const opts = layoutAssetOpts(row, cat);
        if (row.cost_center_id !== centerId) return fail(`El activo ${code} es de otro centro de costos.`);
        if (seen.has(ref)) return fail(`El activo ${code} está colocado dos veces: cada activo va una sola vez en el Layout.`);
        seen.add(ref);
        if (asSensor && opts.typeKind !== 'sensor') return fail(`El activo ${code} no es un sensor: se coloca en el paso Activos.`);
        if (!asSensor && opts.typeKind === 'sensor') return fail(`El activo ${code} es un sensor: se coloca en el paso Sensores.`);
        if (!before.has(ref)) {
            if (row.status !== 'active') return fail(`El activo ${code} está desactivado en Alta Activos: actívalo para colocarlo.`);
            if (!row.show_in_layout) return fail(`El activo ${code} no aparece en el Layout (Alta Activos > Aparece en el Layout).`);
            if (!asSensor && !(row.length_cm > 0 && row.depth_cm > 0 && row.height_cm > 0)) return fail(`El activo ${code} no tiene largo, profundidad y alto en Alta Activos: captúralos para poder dibujarlo.`);
        }
        return { item: asSensor ? { ...item, assetRef: ref, code } : LayoutCalc.applyAssetToSpace(item, layoutAssetInfo(row), opts) };
    };
    const outSpaces = [];
    for (const s of spaces) { const r = take(s, false); if (r.error) return r; outSpaces.push(r.item); }
    const outSensors = [];
    for (const s of sensors) { const r = take(s, true); if (r.error) return r; outSensors.push(r.item); }
    return { layout: { ...layoutIn, spaces: outSpaces, ...(Array.isArray(layoutIn.sensors) ? { sensors: outSensors } : {}) }, touched: true };
}
// Cambió algo del renglón (nombre, medidas, clasificación…): el Layout guardado de su centro lo recibe sin cambiar su versión (un sensor solo recibe el código).
function syncFixedAssetIntoLayout(clientId, row) {
    if (!row) return;
    const raw = readRawClientLayout(clientId, row.cost_center_id);
    const inSpaces = raw && Array.isArray(raw.spaces) && raw.spaces.some((s) => s && s.assetRef === row.id);
    const inSensors = raw && Array.isArray(raw.sensors) && raw.sensors.some((s) => s && s.assetRef === row.id);
    if (!inSpaces && !inSensors) return;
    const cat = layoutAssetCatalogs(clientId);
    if (inSpaces) raw.spaces = raw.spaces.map((s) => (s && s.assetRef === row.id ? LayoutCalc.applyAssetToSpace(s, layoutAssetInfo(row), layoutAssetOpts(row, cat)) : s));
    if (inSensors) raw.sensors = raw.sensors.map((s) => (s && s.assetRef === row.id ? { ...s, code: fixedAssetCodeOf(row) } : s));
    writeRawClientLayout(clientId, row.cost_center_id, raw);
}
// ¿Está este activo dibujado en el Layout de su centro? (en una huella, o un sensor sobre una pared) Devuelve dónde: { zone, footprint } (de un sensor, footprint es el código de su pared).
function fixedAssetPlacementOf(clientId, row) {
    const raw = readRawClientLayout(clientId, row.cost_center_id);
    if (!raw) return null;
    const zones = new Map((raw.zones || []).map((z) => [z.id, z]));
    const space = Array.isArray(raw.spaces) ? raw.spaces.find((s) => s && s.assetRef === row.id) : null;
    if (space) {
        const fp = (raw.footprints || []).find((f) => f.id === space.footprintId);
        const zone = fp ? zones.get(fp.zoneId) : null;
        return { zone: zone ? (zone.name || zone.code || '') : '', footprint: fp ? fp.code || '' : '' };
    }
    const sensor = Array.isArray(raw.sensors) ? raw.sensors.find((s) => s && s.assetRef === row.id) : null;
    if (sensor) {
        const zone = zones.get(sensor.zoneId);
        const wall = (raw.obstacles || []).find((o) => o.id === sensor.wallId);
        return { zone: zone ? (zone.name || zone.code || '') : '', footprint: wall ? (wall.code || wall.name || '') : '' };
    }
    return null;
}
const placementText = (p) => (p ? [p.zone, p.footprint].filter(Boolean).join(' › ') || '—' : '');
// Dónde está cada activo del cliente (id → texto «Zona › huella» o «Zona › pared»), de los Layouts guardados.
function fixedAssetPlacementsMap(clientId) {
    const map = new Map();
    listRawClientLayouts(clientId).forEach(({ layout }) => {
        const zones = new Map((layout.zones || []).map((z) => [z.id, z]));
        const fps = new Map((layout.footprints || []).map((f) => [f.id, f]));
        (layout.spaces || []).forEach((s) => {
            if (!s || !s.assetRef) return;
            const fp = fps.get(s.footprintId);
            const zone = fp ? zones.get(fp.zoneId) : null;
            map.set(s.assetRef, placementText({ zone: zone ? (zone.name || zone.code || '') : '', footprint: fp ? fp.code || '' : '' }));
        });
        (layout.sensors || []).forEach((s) => {
            if (!s || !s.assetRef) return;
            const zone = zones.get(s.zoneId);
            const wall = (layout.obstacles || []).find((o) => o.id === s.wallId);
            map.set(s.assetRef, placementText({ zone: zone ? (zone.name || zone.code || '') : '', footprint: wall ? (wall.code || wall.name || '') : '' }));
        });
    });
    return map;
}
// Los activos del centro de costos que el Layout ofrece para colocar (y los ya colocados), con lo que hace falta para dibujarlos. Medidas en cm.
function layoutFixedAssetsFor(req, layoutRow, centerId) {
    if (!centerId) return [];
    const { clientId, isTestAccount } = req.user;
    const cat = layoutAssetCatalogs(clientId);
    const refs = new Set(((layoutRow && layoutRow.layout.spaces) || []).map((s) => s.assetRef).filter(Boolean));
    return listFixedAssetsOfCenterAnyScope(clientId, centerId).filter((a) => !!a.is_test_data === !!isTestAccount || refs.has(a.id)).map((a) => {
        const type = cat.types.get(a.type_id);
        const cls = cat.classes.get(a.class_id);
        return {
            id: a.id, code: fixedAssetCodeOf(a), name: a.custom_name || a.purchase_name, purchaseName: a.purchase_name, customName: a.custom_name, model: a.model, serialNumber: a.serial_number,
            typeId: a.type_id || 0, typeName: type ? type.name : '', typeKind: type ? type.kind || '' : '', classId: a.class_id || 0, className: cls ? cls.name : '', metric: cls ? cls.kind || '' : '',
            shape: a.shape, length: a.length_cm, depth: a.depth_cm, height: a.height_cm, status: a.status, showInLayout: !!a.show_in_layout,
        };
    });
}
app.get('/api/business/fixed-assets', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const client = getClientById(clientId);
    const ctx = fixedAssetContext(req);
    const pendingByRecord = getPendingColumnsByRecord(clientId, FIXED_ASSET_TABLE_KEY);
    res.set('Cache-Control', 'no-store');
    res.json({
        assets: listFixedAssets(clientId, isTestAccount).map((r) => mapFixedAsset(r, ctx, client?.company_name, pendingByRecord, fixedAssetPlacementsMap(clientId))),
        types: [...ctx.types.values()].filter((t) => t.name).map((t) => ({ id: t.id, name: t.name, letter: t.letter || '', kind: t.kind || '', active: t.status === 'active' })),
        classes: [...ctx.classes.values()].filter((c) => c.name).map((c) => ({ id: c.id, name: c.name, metric: c.kind || '', active: c.status === 'active' })),
        costCenters: [...ctx.centers.values()].map((c) => ({ id: c.id, name: c.name, code: c.code || '' })),
        canCreate: fixedAssetCan(req, 'colActCreateAuth'), canDelete: fixedAssetCanDelete(req),
    });
});
app.post('/api/business/fixed-assets', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!fixedAssetCan(req, 'colActCreateAuth')) return res.status(403).json({ message: 'No tienes permiso para crear registros aquí.' });
    const { clientId, isTestAccount } = req.user;
    const ctx = fixedAssetContext(req);
    const body = req.body || {};
    const center = ctx.centers.get(intOf(body.costCenterId));
    if (!center) return res.status(400).json({ message: 'Elige el centro de costos.', code: 'CENTER' });
    const type = ctx.types.get(intOf(body.typeId));
    if (!type || type.status !== 'active' || !type.name) return res.status(400).json({ message: 'Elige un tipo de activo activo del catálogo Activos Fijos.', code: 'TYPE' });
    if (!type.letter) return res.status(400).json({ message: `El tipo «${type.name}» todavía no tiene letra para el código. Elígela en Catálogos > Activos Fijos.`, code: 'LETTER' });
    const norm = normalizeFixedAssetValues(body, ctx, null);
    if (norm.error) return res.status(norm.error.status).json({ message: norm.error.message, code: norm.error.code });
    if (!norm.values.purchaseName) return res.status(400).json({ message: 'Escribe el nombre de compra del activo.', code: 'NAME' });
    if (!('shape' in norm.values)) norm.values.shape = 'rectangular';
    if (!('showInLayout' in norm.values)) norm.values.showInLayout = type.kind ? 1 : 0; // lo que se dibuja en el Layout (rack, anaquel, gabeta…) sale propuesto con «Sí»; lo demás con «No»
    // lo que se llena al crear cuenta como llenar el dato: quien no tiene «Ver y operar» o «Modificar» en esa columna no lo puede mandar
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        const denied = Object.keys(norm.values).filter((key) => key !== 'volume' && key !== 'depth' && Object.prototype.hasOwnProperty.call(body, key)).find((key) => {
            const def = FIXED_ASSET_PATCHABLE_FIELDS[key];
            return def && !['ver-y-operar', 'editar'].includes(getColumnGrantLevel(grants, FIXED_ASSET_TABLE_KEY, def.fieldKey.split('.').pop()));
        });
        if (denied) return res.status(403).json({ message: 'No tienes permiso para llenar uno de los datos del activo.' });
    }
    const row = createFixedAsset({ clientId, isTestData: isTestAccount, costCenterId: center.id, typeId: type.id, letter: String(type.letter).toUpperCase(), values: norm.values, createdBy: changedByLabel(req) });
    const code = fixedAssetCodeOf(row);
    logTableChange({ clientId, tableKey: FIXED_ASSET_TABLE_KEY, recordId: row.id, recordLabel: code, action: 'create', changedBy: changedByLabel(req) });
    const sanitizers = fixedAssetSanitizers(ctx);
    const initial = { typeId: row.type_id, ...norm.values };
    Object.entries(FIXED_ASSET_PATCHABLE_FIELDS).forEach(([key, { fieldKey }]) => {
        const v = initial[key];
        if (v === undefined || v === null || v === '' || (typeof v === 'number' && v === 0 && key !== 'showInLayout')) return;
        logTableChange({ clientId, tableKey: FIXED_ASSET_TABLE_KEY, recordId: row.id, recordLabel: code, action: 'update', fieldKey, oldValue: '', newValue: sanitizers[key] ? sanitizers[key](v) : v, changedBy: changedByLabel(req) });
    });
    notifyButtonAction(req, FIXED_ASSET_TABLE_KEY, 'create', `${code} · ${row.purchase_name}`);
    const client = getClientById(clientId);
    res.status(201).json({ asset: mapFixedAsset(row, ctx, client?.company_name, null) });
});
app.patch('/api/business/fixed-assets/:id', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const existing = getFixedAssetById(intOf(req.params.id), clientId, isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Asset not found.' });
    const { baseline, overrideConflicts, ...raw } = req.body || {};
    if (Object.prototype.hasOwnProperty.call(raw, 'typeId')) return res.status(400).json({ message: 'El tipo de un activo no se cambia: su código lleva la letra del tipo. Da de alta otro activo.', code: 'TYPE_LOCKED' });
    const ctx = fixedAssetContext(req);
    const norm = normalizeFixedAssetValues(raw, ctx, existing);
    if (norm.error) return res.status(norm.error.status).json({ message: norm.error.message, code: norm.error.code });
    if ('purchaseName' in norm.values && !norm.values.purchaseName) return res.status(400).json({ message: 'El nombre de compra no puede quedar vacío.', code: 'NAME' });
    // un activo dibujado en el Layout no deja de aparecer en él mientras lo esté (primero se quita del Layout)
    if (norm.values.showInLayout === 0 && existing.show_in_layout) {
        const placed = fixedAssetPlacementOf(clientId, existing);
        if (placed) return res.status(409).json({ message: `El activo ${fixedAssetCodeOf(existing)} está dibujado en el Layout (${placementText(placed)}). Quítalo del Layout primero.`, code: 'PLACED' });
    }
    if ('volume' in raw && (raw.shape || existing.shape) !== 'irregular') return res.status(400).json({ message: 'El volumen se calcula solo con las medidas. Solo en la forma Irregular se escribe.', code: 'VOLUME_CALC' });
    if ('depth' in raw && (raw.shape || existing.shape) === 'cilindrica') return res.status(400).json({ message: 'En una forma cilíndrica la profundidad es igual al largo (el diámetro).', code: 'DEPTH_CALC' });
    // lo que solo se calcula (la profundidad de una cilíndrica, el volumen de una forma que lo calcula) no se pide como permiso aparte: viaja con la medida que lo causa
    const code = fixedAssetCodeOf(existing);
    const direct = {};
    Object.keys(norm.values).forEach((key) => { if (Object.prototype.hasOwnProperty.call(raw, key)) direct[key] = norm.values[key]; });
    const { appliedPatch, pendingFields, rejectedFields, conflictFields } = checkAndLogFieldChanges(req, existing, direct, FIXED_ASSET_PATCHABLE_FIELDS, FIXED_ASSET_TABLE_KEY, code, fixedAssetSanitizers(ctx), { baseline, overrideConflicts });
    if (['shape', 'height', 'length', 'depth', 'volume'].some((key) => key in appliedPatch)) {
        const recomputed = normalizeFixedAssetValues(appliedPatch, ctx, existing).values || {};
        ['depth', 'volume'].forEach((key) => { if (!(key in appliedPatch) && key in recomputed) appliedPatch[key] = recomputed[key]; });
    }
    const row = updateFixedAsset(existing.id, clientId, appliedPatch, isTestAccount);
    syncFixedAssetIntoLayout(clientId, row); // el Layout guardado recibe el nombre, las medidas, la clasificación… nuevos
    const client = getClientById(clientId);
    res.json({ asset: mapFixedAsset(row, ctx, client?.company_name, null), pendingFields, rejectedFields, conflictFields });
});
// Desactivar (o volver a activar): los activos nunca se eliminan. Pide la hoja «Autorización para Desactivar».
app.post('/api/business/fixed-assets/:id/status', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const existing = getFixedAssetById(intOf(req.params.id), clientId, isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Asset not found.' });
    if (!fixedAssetCanDelete(req)) return res.status(403).json({ message: 'No tienes permiso para desactivar activos.' });
    const status = req.body && req.body.status === 'inactive' ? 'inactive' : 'active';
    if (status === 'inactive' && existing.status === 'active') {
        const placed = fixedAssetPlacementOf(clientId, existing);
        if (placed) return res.status(409).json({ message: `El activo ${fixedAssetCodeOf(existing)} está dibujado en el Layout (${placementText(placed)}). Quítalo del Layout primero.`, code: 'PLACED' });
    }
    if (status === existing.status) return res.json({ asset: mapFixedAsset(existing, fixedAssetContext(req), getClientById(clientId)?.company_name, null) });
    const code = fixedAssetCodeOf(existing);
    logTableChange({ clientId, tableKey: FIXED_ASSET_TABLE_KEY, recordId: existing.id, recordLabel: code, action: 'update', fieldKey: 'main.colActEstatus', oldValue: FIXED_ASSET_STATUS_LABELS[existing.status], newValue: FIXED_ASSET_STATUS_LABELS[status], changedBy: changedByLabel(req) });
    notifyDataChange({ clientId, tableKey: FIXED_ASSET_TABLE_KEY, recordLabel: code, fieldKey: 'main.colActEstatus', oldValue: FIXED_ASSET_STATUS_LABELS[existing.status], newValue: FIXED_ASSET_STATUS_LABELS[status], actorUserId: req.user.sub, actorLabel: changedByLabel(req) });
    const row = updateFixedAsset(existing.id, clientId, { status }, isTestAccount);
    res.json({ asset: mapFixedAsset(row, fixedAssetContext(req), getClientById(clientId)?.company_name, null) });
});

// --- Capacidad Almacenamiento (Operaciones, C. Distribución) ---------------------------------------------------------------------------------------------
// Una fila por LUGAR de almacenamiento del Layout de cada centro de costos (un hueco: activo × nivel × columna; ver LayoutCalc.storageLocations), con el código que se le asignó aquí y la capacidad que sale de las medidas del
// lugar y de los datos del código (LayoutCalc.capacityOf). Todavía no hay cantidades en existencia: eso vendrá con «existencias y transacciones». Las columnas de Control Interno son las del centro (se mandan una vez por centro).
const STORAGE_CAP_TABLE_KEY = 'capacidad-almacenamiento';
const STORAGE_CAP_MAX_ROWS = 20000;
const skuLabelOf = (r) => `${padSku(r.record_number, r.sku_code)} · ${r.custom_description || r.known_description || r.unique_description || ''}`.replace(/ · $/, '');
function storageCapContext(req) {
    const { clientId, isTestAccount } = req.user;
    const classes = listArticleCategories(clientId, 'activos-clasificacion', isTestAccount);
    const types = listArticleCategories(clientId, 'activos-fijos', isTestAccount);
    return {
        clientId, isTest: !!isTestAccount, centers: new Map(listCostCenters(clientId, isTestAccount).map((c) => [c.id, c])),
        classKinds: new Map(classes.map((r) => [r.id, r.kind])), className: new Map(classes.map((r) => [r.id, r.name])), typeName: new Map(types.map((r) => [r.id, r.name])),
    };
}
// Lo que cada quien puede hacer con la columna Código: llenar un lugar vacío pide Ver y Operar (o Modificar); cambiar o quitar uno ya asignado pide Modificar (con autorización cuando toca).
function storageCapRights(req) {
    if (req.user.isClientAdmin) return { canFill: true, canChange: true };
    const level = getColumnGrantLevel(getUserEffectiveGrants(req.user.sub), STORAGE_CAP_TABLE_KEY, 'colCapCodigo');
    return { canFill: level === 'ver-y-operar' || level === 'editar', canChange: level === 'editar' };
}
// De dónde salen la base de la tarima y los datos de estiba de un código para Capacidad Almacenamiento: de su presentación con tipo «pallet» (con varias, la de más arriba que ya trae algún dato de estiba, con SUS medidas);
// si no tiene una, de lo que el código traía antes (Alta Artículos). storageType (uno solo) se conserva para las Apps que ya están instaladas; storageTypes trae todos los de la presentación.
function skuCapacityEffective(sku, presRows) {
    const pallets = (presRows || []).filter((r) => skuDistTypesOf(r).includes('pallet')).sort((a, z) => z.level - a.level);
    const chosen = pallets.find((r) => r.units_per_layer > 0 || r.layers_per_pallet > 0 || r.max_stack > 0);
    if (!chosen) return { ...sku, storageTypes: sku.storage_type ? [sku.storage_type] : [] };
    const cyl = chosen.level > 0 && chosen.shape === 'cilindrica';
    return {
        ...sku, storage_type: 'pallet', storageTypes: skuDistTypesOf(chosen),
        length: chosen.level === 0 ? sku.length : chosen.length, width: chosen.level === 0 ? sku.width : (cyl ? chosen.length : chosen.width),
        units_per_layer: chosen.units_per_layer, layers_per_pallet: chosen.layers_per_pallet, max_stack: chosen.max_stack,
    };
}
function capacityPresentationsMap(clientId, isTest) {
    const bySku = new Map();
    listSkuDistribution(clientId, isTest).forEach((r) => { if (!bySku.has(r.sku_item_id)) bySku.set(r.sku_item_id, []); bySku.get(r.sku_item_id).push(r); });
    return bySku;
}
function storageCapRows(ctx, { costCenterId, key, max = STORAGE_CAP_MAX_ROWS } = {}) {
    const client = getClientById(ctx.clientId);
    const assigned = new Map(listStorageCapacity(ctx.clientId, ctx.isTest).map((r) => [`${r.cost_center_id}|${r.location_key}`, r]));
    const presBySku = capacityPresentationsMap(ctx.clientId, ctx.isTest);
    const skus = new Map(listSkuCapacityData(ctx.clientId, ctx.isTest, [...assigned.values()].map((r) => r.sku_item_id).filter(Boolean)).map((r) => [r.id, skuCapacityEffective(r, presBySku.get(r.id))]));
    const centers = {};
    const rows = [];
    let truncated = false;
    for (const layoutRow of listClientLayouts(ctx.clientId)) {
        const cc = ctx.centers.get(layoutRow.costCenterId);
        if (!cc || (costCenterId && cc.id !== costCenterId)) continue;
        const built = LayoutCalc.storageLocations(layoutRow.layout, { classKinds: ctx.classKinds, max: max - rows.length });
        if (built.truncated) truncated = true;
        centers[cc.id] = {
            name: cc.name, company: client ? client.company_name : '',
            system: getSystemColumnsForRecord({ companyName: client ? client.company_name : '', area: CODE_RELATION_AREA_LABEL, modulo: CODE_RELATION_MODULE_LABEL, pantalla: 'Capacidad Almacenamiento', centroCostos: cc.name, createdAt: layoutRow.updatedAt }),
        };
        for (const loc of built.rows) {
            if (key && loc.key !== key) continue;
            const rec = assigned.get(`${cc.id}|${loc.key}`);
            const sku = rec && rec.sku_item_id ? skus.get(rec.sku_item_id) : null;
            const code = sku ? { id: sku.id, sku: padSku(sku.record_number, sku.sku_code), upc: sku.upc || '', description: sku.custom_description || sku.known_description || sku.unique_description || '', uom: sku.main_uom || '', storageType: sku.storage_type || '', storageTypes: sku.storageTypes || [], length: sku.length || 0, width: sku.width || 0, height: sku.height || 0, ti: sku.units_per_layer || 0, hi: sku.layers_per_pallet || 0, stack: sku.max_stack || 0 } : null;
            rows.push({
                cc: cc.id, id: rec ? rec.id : null, key: loc.key, locator: loc.locator, zoneName: loc.zoneName, spaceCode: loc.spaceCode, level: loc.multi ? loc.level : 0, slot: loc.multi ? loc.slot : 0,
                className: ctx.className.get(loc.assetClassId) || '', typeName: ctx.typeName.get(loc.assetId) || '', l: loc.l, w: loc.w, h: loc.h, m2: loc.m2,
                code, calc: code ? LayoutCalc.capacityOf(loc, { length: code.length, width: code.width, unitsPerLayer: code.ti, layersPerPallet: code.hi, maxStack: code.stack }) : null, assignedBy: rec && rec.updated_by ? rec.updated_by : '', assignedAt: rec && rec.updated_at ? sqlUtcIso(rec.updated_at) : null,
            });
        }
    }
    return { centers, rows, truncated };
}
app.get('/api/business/storage-capacity', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    // costCenterId: solo los lugares de ese centro (la App pide el que se eligió arriba, no todos)
    const only = Number(req.query.costCenterId);
    const built = storageCapRows(storageCapContext(req), { costCenterId: Number.isInteger(only) && only > 0 ? only : undefined });
    res.set('Cache-Control', 'no-store');
    res.json({ ...built, max: STORAGE_CAP_MAX_ROWS, ...storageCapRights(req) });
});
// Los códigos que se pueden asignar, con lo que hace falta para calcular su capacidad: la App los guarda en el celular para elegir y calcular sin señal.
app.get('/api/business/storage-capacity/codes', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const ids = searchSkuItems(clientId, '', isTestAccount, 5000).map((r) => r.id);
    const presBySku = capacityPresentationsMap(clientId, isTestAccount);
    const codes = listSkuCapacityData(clientId, isTestAccount, ids).map((raw) => skuCapacityEffective(raw, presBySku.get(raw.id))).map((r) => ({
        id: r.id, storageTypes: r.storageTypes || [], sku: padSku(r.record_number, r.sku_code), upc: r.upc || '', description: r.custom_description || r.known_description || r.unique_description || '', uom: r.main_uom || '',
        storageType: r.storage_type || '', length: r.length || 0, width: r.width || 0, height: r.height || 0, ti: r.units_per_layer || 0, hi: r.layers_per_pallet || 0, stack: r.max_stack || 0,
    }));
    res.set('Cache-Control', 'no-store');
    res.json({ codes, at: new Date().toISOString() });
});
// Asignar (o cambiar, o quitar con null) el código de un lugar. Pasa por la misma tubería de cambios de toda la plataforma (checkAndLogFieldChanges): se aplica, queda pendiente de autorización o se rechaza según el permiso.
// Con baseline (lo que la persona veía al guardar sin señal) un código que otra persona ya cambió entre tanto sale como choque (conflictFields) y no se pisa sin preguntar.
function assignStorageCapacity(req, res, centerId, key) {
    const { clientId, isTestAccount } = req.user;
    const raw = req.body ? req.body.skuItemId : undefined;
    const skuItemId = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    if (skuItemId !== null && (!Number.isInteger(skuItemId) || !getSkuItemById(skuItemId, clientId, isTestAccount))) return res.status(400).json({ message: 'Elige un código de Alta Artículos.', code: 'SKU' });
    const ctx = storageCapContext(req);
    const found = storageCapRows(ctx, { costCenterId: centerId, key });
    if (!found.rows.length) return res.status(404).json({ message: 'Ese lugar ya no existe en el Layout o ya no guarda inventario.', code: 'LOCATION' });
    let rec = getStorageCapacityByKey(clientId, centerId, key, isTestAccount);
    let created = false;
    if (!rec) {
        if (skuItemId === null) return res.json({ row: found.rows[0], pendingFields: [], rejectedFields: [], conflictFields: [] });
        rec = createStorageCapacity({ clientId, costCenterId: centerId, locationKey: key, isTest: isTestAccount });
        created = true;
    }
    const sanitize = (v) => { if (!v) return ''; const it = getSkuItemById(Number(v), clientId, isTestAccount); return it ? skuLabelOf(it) : String(v); };
    const options = { baseline: req.body && req.body.baseline && typeof req.body.baseline === 'object' ? req.body.baseline : null, overrideConflicts: Array.isArray(req.body && req.body.overrideConflicts) ? req.body.overrideConflicts : [] };
    const { appliedPatch, pendingFields, rejectedFields, conflictFields } = checkAndLogFieldChanges(req, rec, { skuItemId }, STORAGE_CAPACITY_PATCHABLE_FIELDS, STORAGE_CAP_TABLE_KEY, found.rows[0].locator, { skuItemId: sanitize }, options);
    const updated = updateStorageCapacity(rec.id, clientId, appliedPatch, { updatedBy: changedByLabel(req) });
    // un lugar que se acababa de abrir y no quedó con código (sin permiso o a autorización) no deja renglón vacío
    if (created && !(updated && updated.sku_item_id) && !pendingFields.length) deleteStorageCapacity(rec.id, clientId);
    const after = storageCapRows(ctx, { costCenterId: centerId, key });
    res.json({ row: after.rows[0], pendingFields, rejectedFields, conflictFields });
}
app.patch('/api/business/storage-capacity', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const center = layoutCenter(req);
    if (center.error) return res.status(center.error.status).json(center.error.body);
    if (!center.id) return res.status(400).json({ message: 'Elige un centro de costos.', code: 'CENTER' });
    return assignStorageCapacity(req, res, center.id, String((req.body && req.body.locationKey) || ''));
});
// La misma operación con el lugar en la dirección (la App: su cola sin señal manda de nuevo solo lo cambiado, sin el centro ni el lugar en el cuerpo).
app.patch('/api/business/storage-capacity/:cc/:key', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const cc = Number(req.params.cc);
    const center = Number.isInteger(cc) && cc > 0 ? getCostCenterById(cc, req.user.clientId, req.user.isTestAccount) : null;
    if (!center) return res.status(404).json({ message: 'Ese centro de costos no existe.' });
    return assignStorageCapacity(req, res, center.id, String(req.params.key || ''));
});

// Verificador Código (SKU): la ficha de un artículo (sin fotos ni Control Interno) y DÓNDE ESTÁ, que sale de Relación Código (un renglón por cada lugar). Con sesión.
app.get('/api/business/verificador/:id', requireAuth, requireCostCenter, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { clientId, isTestAccount } = req.user;
    const item = getSkuItemById(req.params.id, clientId, isTestAccount);
    if (!item) return res.status(404).json({ message: 'Sku item not found.' });
    const client = getClientById(clientId);
    const full = mapSkuItemRecord(item, null, client?.company_name);
    const article = {};
    ['id', 'sku', 'upc', 'uniqueDescription', 'knownDescription', 'customDescription', 'mainUom', 'articleType', 'height', 'length', 'width', 'articleWeight', 'packageWeight',
        'categoryInventario', 'categoryCompra', 'categoryAlmacenamiento', 'categoryRotacion', 'categoryManejo', 'categoryRiesgo', 'categoryVidautil', 'categoryTipoCodigo'].forEach((key) => { article[key] = full[key]; });
    const ctx = codeRelationContext(req);
    const locations = listCodeRelations(clientId, isTestAccount).filter((r) => r.sku_item_id === item.id).map((r) => mapCodeRelation(r, null, client?.company_name, ctx));
    res.set('Cache-Control', 'no-store');
    res.json({ article, locations });
});

// --- "+ Solicitar nuevo X" -- catalog-value requests, generic across every
// ARTICLE_CATEGORY_TYPES catalog (Tipos Cliente today, any future one
// tomorrow). See catalog_value_requests' own DDL comment in db.js for the
// full shape/rationale.
function mapCatalogValueRequestRecord(row) {
    if (!row) return row;
    const config = articleCategoryTypeConfig(row.category_type);
    return {
        id: row.id,
        categoryType: row.category_type,
        categoryLabel: config?.pantalla || row.category_type,
        requestedName: row.requested_name,
        note: row.note,
        requestedByLabel: row.requested_by_label,
        currentHolderUserId: row.current_holder_user_id,
        status: row.status,
        sourceTableKey: row.source_table_key,
        sourceRecordId: row.source_record_id,
        sourceFieldKey: row.source_field_key,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
    };
}

function catalogValueRequestCanAuthorize(req, categoryType) {
    if (req.user.isClientAdmin) return true;
    const config = articleCategoryTypeConfig(categoryType);
    if (!config) return false;
    const grants = getUserEffectiveGrants(req.user.sub);
    return canAuthorizeColumn(grants, config.tableKey, 'colCatName');
}

// Applies the newly-approved value back onto whichever record/field asked
// for it in the first place -- one entry per screen that's wired a
// "+ Solicitar nuevo" button, added here as each one gets built (same small,
// explicit per-table registry shape as PENDING_CHANGE_APPLIERS above).
const CATALOG_REQUEST_SOURCE_APPLIERS = {
    'nuestros-traslados': (recordId, clientId, fieldKey, value, forTestAccount) => updateTransfer(recordId, clientId, { [fieldKey]: value }, forTestAccount),
};

app.post('/api/business/catalog-requests', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { categoryType, requestedName, note, sourceTableKey, sourceRecordId, sourceFieldKey } = req.body || {};
    const config = articleCategoryTypeConfig(categoryType);
    if (!config) return res.status(400).json({ message: 'Catálogo desconocido.' });
    if (!requestedName || !requestedName.trim()) return res.status(400).json({ message: 'El nombre es requerido.' });
    const request = createCatalogValueRequest({
        clientId: req.user.clientId, categoryType, requestedName: requestedName.trim(), note,
        requestedByUserId: req.user.sub, requestedByLabel: changedByLabel(req),
        sourceTableKey, sourceRecordId, sourceFieldKey, isTestData: req.user.isTestAccount,
    });
    res.status(201).json({ request: mapCatalogValueRequestRecord(request) });
});

// Everything currently sitting with me, whether I can Autorizar it or only
// Reenviar it -- the UI decides which buttons to show per row using its own
// canAuthorize flag (computed per request, since two requests here can be
// for different catálogos with different Autorizar grants).
app.get('/api/business/catalog-requests/to-act', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const requests = listCatalogValueRequestsForHolder(req.user.clientId, req.user.sub);
    res.json({
        requests: requests.map((r) => ({ ...mapCatalogValueRequestRecord(r), canAuthorize: catalogValueRequestCanAuthorize(req, r.category_type) })),
    });
});

app.get('/api/business/catalog-requests/mine', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const statuses = req.query.status === 'resolved' ? ['approved', 'rejected'] : ['pending'];
    const requests = listCatalogValueRequestsBySubmitter(req.user.clientId, req.user.sub, statuses);
    res.json({ requests: requests.map(mapCatalogValueRequestRecord) });
});

app.get('/api/business/catalog-requests/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const request = getCatalogValueRequestById(req.params.id, req.user.clientId);
    if (!request) return res.status(404).json({ message: 'Request not found.' });
    res.json({
        request: { ...mapCatalogValueRequestRecord(request), canAuthorize: catalogValueRequestCanAuthorize(req, request.category_type) },
        hops: listCatalogValueRequestHops(request.id),
    });
});

// Who "Reenviar" could offer the current holder -- their jefe directo,
// homólogos and jefes alternos (see resolveForwardCandidates in db.js).
// An empty answer just means the client shows a plain Reenviar button with
// no picker (the POST below then falls back to the client admin on its
// own), same as every list here being non-empty means the client shows the
// picker instead.
app.get('/api/business/catalog-requests/:id/forward-options', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const request = getCatalogValueRequestById(req.params.id, req.user.clientId);
    if (!request) return res.status(404).json({ message: 'Request not found.' });
    if (!req.user.isClientAdmin && Number(request.current_holder_user_id) !== Number(req.user.sub)) {
        return res.status(403).json({ message: 'Esta solicitud no está contigo.' });
    }
    res.json(resolveForwardCandidates(req.user.clientId, req.user.sub));
});

app.post('/api/business/catalog-requests/:id/forward', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const request = getCatalogValueRequestById(req.params.id, req.user.clientId);
    if (!request) return res.status(404).json({ message: 'Request not found.' });
    if (request.status !== 'pending') return res.status(409).json({ message: 'Esta solicitud ya fue resuelta.' });
    if (!req.user.isClientAdmin && Number(request.current_holder_user_id) !== Number(req.user.sub)) {
        return res.status(403).json({ message: 'Esta solicitud no está contigo.' });
    }
    const candidates = resolveForwardCandidates(req.user.clientId, req.user.sub);
    const allowed = [candidates.jefeDirecto, ...candidates.homologos, ...candidates.alternos].filter(Boolean);
    const { targetUserId } = req.body || {};
    let toUserId = null;
    if (targetUserId != null) {
        if (!allowed.some((c) => Number(c.userId) === Number(targetUserId))) {
            return res.status(400).json({ message: 'Elige a quién reenviarla de la lista.' });
        }
        toUserId = Number(targetUserId);
    } else if (!allowed.length) {
        // Nothing to choose from -- same "always reachable" admin fallback
        // resolveEscalationHolder itself relies on, so a request can never
        // get permanently stuck.
        const adminUserId = getClientById(req.user.clientId)?.admin_user_id || null;
        if (!adminUserId || Number(adminUserId) === Number(req.user.sub)) {
            return res.status(409).json({ message: 'No hay a quién reenviarla -- ya eres el nivel más alto.' });
        }
        toUserId = adminUserId;
    } else {
        return res.status(400).json({ message: 'Elige a quién reenviarla.' });
    }
    const updated = forwardCatalogValueRequest(req.params.id, req.user.clientId, changedByLabel(req), toUserId);
    res.json({ request: mapCatalogValueRequestRecord(updated) });
});

app.post('/api/business/catalog-requests/:id/approve', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const request = getCatalogValueRequestById(req.params.id, req.user.clientId);
    if (!request) return res.status(404).json({ message: 'Request not found.' });
    if (request.status !== 'pending') return res.status(409).json({ message: 'Esta solicitud ya fue resuelta.' });
    if (!req.user.isClientAdmin && Number(request.current_holder_user_id) !== Number(req.user.sub)) {
        return res.status(403).json({ message: 'Esta solicitud no está contigo.' });
    }
    if (!catalogValueRequestCanAuthorize(req, request.category_type)) {
        return res.status(403).json({ message: 'No tienes permiso para autorizar este catálogo.' });
    }
    const { description } = req.body || {};
    const { request: resolved, category } = approveCatalogValueRequest(req.params.id, req.user.clientId, req.user.sub, changedByLabel(req), { description });
    if (request.source_table_key && request.source_record_id && request.source_field_key) {
        const applier = CATALOG_REQUEST_SOURCE_APPLIERS[request.source_table_key];
        if (applier) applier(request.source_record_id, req.user.clientId, request.source_field_key, category.name, req.user.isTestAccount);
    }
    logTableChange({
        clientId: req.user.clientId, tableKey: articleCategoryTypeConfig(request.category_type).tableKey, recordId: category.id,
        recordLabel: `#${category.id}`, action: 'create', changedBy: changedByLabel(req),
        requestedBy: request.requested_by_label, authorizedBy: changedByLabel(req),
    });
    notifyButtonAction(req, articleCategoryTypeConfig(request.category_type).tableKey, 'create', `#${category.id}`);
    res.json({ request: mapCatalogValueRequestRecord(resolved), category });
});

app.post('/api/business/catalog-requests/:id/reject', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const request = getCatalogValueRequestById(req.params.id, req.user.clientId);
    if (!request) return res.status(404).json({ message: 'Request not found.' });
    if (request.status !== 'pending') return res.status(409).json({ message: 'Esta solicitud ya fue resuelta.' });
    if (!req.user.isClientAdmin && Number(request.current_holder_user_id) !== Number(req.user.sub)) {
        return res.status(403).json({ message: 'Esta solicitud no está contigo.' });
    }
    if (!catalogValueRequestCanAuthorize(req, request.category_type)) {
        return res.status(403).json({ message: 'No tienes permiso para rechazar este catálogo.' });
    }
    const updated = rejectCatalogValueRequest(req.params.id, req.user.clientId, changedByLabel(req));
    res.json({ request: mapCatalogValueRequestRecord(updated) });
});

// Base de Datos de Solicitudes' own data source -- read-only archive of
// every request (any status) plus every access-denied alert, same
// "everything, unscoped by recipient" role Nuestros Cambios plays for field
// edits. Gate is menu.json's own permissionOnly leaf (bd-solicitudes), same
// convention Nuestros Cambios itself already uses -- not a grant check here.
app.get('/api/business/catalog-requests-log', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({
        requests: listAllCatalogValueRequests(req.user.clientId, req.user.isTestAccount).map((r) => ({
            ...mapCatalogValueRequestRecord(r),
            hops: listCatalogValueRequestHops(r.id),
        })),
        alertas: listAllAccessDeniedAlerts(req.user.clientId),
    });
});

// --- Nuestras Cotizaciones (Operaciones > Cadena de Suministro > Transporte
// --- Volumen) -- a reusable freight rate (see freight_quotes' own comment
// in db.js), not a one-off quote document.
const FREIGHT_QUOTE_AREA_LABEL = 'Transporte Volumen';
const FREIGHT_QUOTE_MODULE_LABEL = 'Cadena de Suministro';
const FREIGHT_QUOTE_SCREEN_LABEL = 'Nuestras Cotizaciones';

function mapFreightQuoteRecord(row, pendingByRecord, companyName) {
    if (!row) return row;
    return {
        id: row.id,
        registroUnico: row.db_id,
        folio: `COT-${String(row.record_number).padStart(4, '0')}`,
        routeName: row.route_name,
        unitTypeName: row.unit_type_name,
        costPerKm: row.cost_per_km,
        distanceKm: row.distance_km,
        totalCost: row.cost_per_km * row.distance_km,
        validityDate: row.validity_date,
        customerName: row.customer_name,
        status: row.status,
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({
            companyName,
            area: FREIGHT_QUOTE_AREA_LABEL,
            modulo: FREIGHT_QUOTE_MODULE_LABEL,
            pantalla: FREIGHT_QUOTE_SCREEN_LABEL,
            centroCostos: '',
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/freight-quotes', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'nuestras-cotizaciones');
    const client = getClientById(req.user.clientId);
    res.json({ freightQuotes: listFreightQuotes(req.user.clientId, req.user.isTestAccount).map((r) => mapFreightQuoteRecord(r, pendingByRecord, client?.company_name)) });
});

// Nuestros Traslados' own "Cotización" select -- only Activa rates, each
// shown as "Folio — Ruta ($Costo Total)" (see listActiveFreightQuoteOptions
// in db.js).
app.get('/api/business/freight-quotes-active', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ options: listActiveFreightQuoteOptions(req.user.clientId, req.user.isTestAccount) });
});

app.post('/api/business/freight-quotes', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!req.user.isClientAdmin && !canCreateColumn(getUserEffectiveGrants(req.user.sub), 'nuestras-cotizaciones', 'colCotCreateAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para crear registros aquí.' });
    }
    const freightQuote = createFreightQuote({ clientId: req.user.clientId, isTestData: req.user.isTestAccount });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'nuestras-cotizaciones', recordId: freightQuote.id,
        recordLabel: `#${freightQuote.id}`, action: 'create', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'nuestras-cotizaciones', 'create', `#${freightQuote.id}`);
    const client = getClientById(req.user.clientId);
    res.status(201).json({ freightQuote: mapFreightQuoteRecord(freightQuote, null, client?.company_name) });
});

app.patch('/api/business/freight-quotes/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getFreightQuoteById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Freight quote not found.' });
    const { baseline, overrideConflicts, ...patch } = req.body || {};
    const { appliedPatch, pendingFields, rejectedFields, conflictFields } = checkAndLogFieldChanges(req, existing, patch, FREIGHT_QUOTE_PATCHABLE_FIELDS, 'nuestras-cotizaciones', `#${existing.id}`, {}, { baseline, overrideConflicts });
    const freightQuote = updateFreightQuote(req.params.id, req.user.clientId, appliedPatch, req.user.isTestAccount);
    const client = getClientById(req.user.clientId);
    res.json({ freightQuote: mapFreightQuoteRecord(freightQuote, null, client?.company_name), pendingFields, rejectedFields, conflictFields });
});

app.delete('/api/business/freight-quotes/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getFreightQuoteById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Freight quote not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canDeleteColumn(grants, 'nuestras-cotizaciones', 'colCotDeleteAuth')) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar cotizaciones.' });
        }
    }
    logTableChange({
        clientId: req.user.clientId, tableKey: 'nuestras-cotizaciones', recordId: existing.id,
        recordLabel: `#${existing.id}`, action: 'delete', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'nuestras-cotizaciones', 'delete', `#${existing.id}`);
    deleteFreightQuote(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Nuestros Traslados (Operaciones > Cadena de Suministro > Transporte --
// --- Volumen) -- see transfers' own DDL comment in db.js for scope notes.
const TRANSFER_AREA_LABEL = 'Transporte Volumen';
const TRANSFER_MODULE_LABEL = 'Cadena de Suministro';
const TRANSFER_SCREEN_LABEL = 'Nuestros Traslados';

function mapTransferRecord(row, pendingByRecord, companyName) {
    if (!row) return row;
    return {
        id: row.id,
        registroUnico: row.db_id,
        requestDate: row.request_date,
        requestedBy: row.requested_by,
        clientType: row.client_type,
        requestContact: row.request_contact,
        neededDate: row.needed_date,
        neededTime: row.needed_time,
        serviceClient: row.service_client,
        serviceType: row.service_type,
        requestedUnitType: row.requested_unit_type,
        quoteFolio: row.quote_folio,
        serviceRequirements: row.service_requirements,
        securityRequirements: row.security_requirements,
        billingRequirements: row.billing_requirements,
        originClient: row.origin_client,
        originContact: row.origin_contact,
        originSite: row.origin_site,
        originUrl: row.origin_url,
        originNickname: row.origin_nickname,
        destClient: row.dest_client,
        destContact: row.dest_contact,
        destSite: row.dest_site,
        destUrl: row.dest_url,
        destNickname: row.dest_nickname,
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({
            companyName,
            area: TRANSFER_AREA_LABEL,
            modulo: TRANSFER_MODULE_LABEL,
            pantalla: TRANSFER_SCREEN_LABEL,
            centroCostos: '',
            createdAt: row.created_at,
        }),
    };
}

app.get('/api/business/transfers', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'nuestros-traslados');
    const client = getClientById(req.user.clientId);
    res.json({ transfers: listTransfers(req.user.clientId, req.user.isTestAccount).map((r) => mapTransferRecord(r, pendingByRecord, client?.company_name)) });
});

app.post('/api/business/transfers', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!req.user.isClientAdmin && !canCreateColumn(getUserEffectiveGrants(req.user.sub), 'nuestros-traslados', 'colTrasladoCreateAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para crear registros aquí.' });
    }
    const transfer = createTransfer({ clientId: req.user.clientId, isTestData: req.user.isTestAccount });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'nuestros-traslados', recordId: transfer.id,
        recordLabel: `#${transfer.id}`, action: 'create', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'nuestros-traslados', 'create', `#${transfer.id}`);
    const client = getClientById(req.user.clientId);
    res.status(201).json({ transfer: mapTransferRecord(transfer, null, client?.company_name) });
});

app.patch('/api/business/transfers/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getTransferById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Transfer not found.' });
    const { baseline, overrideConflicts, ...patch } = req.body || {};
    const { appliedPatch, pendingFields, rejectedFields, conflictFields } = checkAndLogFieldChanges(req, existing, patch, TRANSFER_PATCHABLE_FIELDS, 'nuestros-traslados', `#${existing.id}`, {}, { baseline, overrideConflicts });
    const transfer = updateTransfer(req.params.id, req.user.clientId, appliedPatch, req.user.isTestAccount);
    const client = getClientById(req.user.clientId);
    res.json({ transfer: mapTransferRecord(transfer, null, client?.company_name), pendingFields, rejectedFields, conflictFields });
});

app.delete('/api/business/transfers/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getTransferById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Transfer not found.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canDeleteColumn(grants, 'nuestros-traslados', 'colTrasladoDeleteAuth')) {
            return res.status(403).json({ message: 'No tienes permiso para eliminar traslados.' });
        }
    }
    logTableChange({
        clientId: req.user.clientId, tableKey: 'nuestros-traslados', recordId: existing.id,
        recordLabel: `#${existing.id}`, action: 'delete', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'nuestros-traslados', 'delete', `#${existing.id}`);
    deleteTransfer(req.params.id, req.user.clientId);
    res.status(204).end();
});

// --- Base de Datos Global (Configuración > Base de Datos) -------------------
// Read-only union of every record from every pantalla that has Control
// Interno columns wired -- today just Registro Combustible. Reuses
// mapFuelRecord as-is (already carries the 13 Control Interno columns, see
// the Registro Combustible pilot above) rather than inventing a separate
// mapping shape; the day another pantalla gets Control Interno, its own
// map*Record output gets concatenated into `records` here the same way.
app.get('/api/business/base-datos-global', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const client = getClientById(req.user.clientId);
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'registro-combustible');
    const records = listFuelRecords(req.user.clientId, req.user.isTestAccount).map((r) => ({
        ...mapFuelRecord(r, pendingByRecord, client?.company_name),
        sourceTable: 'registro-combustible',
    }));
    res.json({ records });
});

// --- Nuestros Respaldos (Base de Datos > Nuestros Respaldos) ----------------
// Client-scoped file browser over every evidence photo/document in the
// system — see evidenceNaming.js/r2.js for the storage design. The list
// itself is open to any authenticated user at the client (same convention
// every other screen in this app already uses, e.g. Reglas de Orden's own
// list route -- the sidebar's own grant-based filtering is what actually
// decides who navigates here at all); the real gate lives on the download
// route below, since THAT'S the sensitive action.
app.get('/api/business/base-datos-respaldos', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    res.json({ files: listClientEvidenceFiles(req.user.clientId) });
});

// getColumnGrantLevel's own floor is 'solo-ver' even with zero grants (see
// its comment in db.js) -- only 'ver-y-operar'/'editar' actually require an
// explicit grant, so those two (not 'solo-ver') are what gates the download,
// same pattern already used to gate Crear on Transacciones Inteligentes.
function canDownloadBackups(req) {
    if (req.user.isClientAdmin) return true;
    const grants = getUserEffectiveGrants(req.user.sub);
    const level = getColumnGrantLevel(grants, 'respaldos', 'colBackupsAccess');
    return level === 'ver-y-operar' || level === 'editar';
}

// Handles both a migrated file (returns a short-lived signed R2 URL) and a
// not-yet-migrated one (returns a data: URL built fresh from the still-raw
// base64 column) with the exact same response shape, so the client never
// needs to know or care which case it's in -- see listClientEvidenceFiles'
// own "migrated" flag comment for why both can coexist.
app.get('/api/business/evidence-download-url', requireAuth, async (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!canDownloadBackups(req)) return res.status(403).json({ message: 'No tienes permiso para descargar evidencias.' });
    const { tableKey, recordId, fieldKey } = req.query;
    const evidence = getEvidenceRawValue(req.user.clientId, tableKey, Number(recordId), fieldKey);
    if (!evidence) return res.status(404).json({ message: 'Evidence not found.' });
    if (!evidence.migrated) return res.json({ url: evidence.value });
    try {
        const client = getClientById(req.user.clientId);
        const companyNickname = client?.company_nickname || client?.company_name || '';
        const ext = evidence.value.split('.').pop() || 'jpg';
        const displayName = buildEvidenceDisplayName({
            companyNickname, tableKey, fieldKey, recordDate: evidence.recordDate,
            folio: evidence.recordNumber, ext,
        });
        const url = await getDownloadUrl(evidence.value, displayName);
        res.json({ url });
    } catch (err) {
        console.error('evidence-download-url failed:', err.message);
        res.status(503).json({ message: 'El almacenamiento de archivos no está configurado todavía.' });
    }
});

// Issues a presigned PUT URL for a NEW evidence upload -- the browser PUTs
// the file bytes directly to R2 (never through this server), then PATCHes
// the record with the returned `key` the same way it already PATCHes any
// other field (see OpTransVolCombustible.js's attachEvidenceControl).
app.post('/api/business/evidence-upload-url', requireAuth, async (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { tableKey, recordId, fieldKey, contentType } = req.body || {};
    const permColKey = getEvidencePermColKey(tableKey, fieldKey);
    if (!permColKey) return res.status(400).json({ message: 'Unknown evidence field.' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        const level = getColumnGrantLevel(grants, tableKey, permColKey);
        if (level !== 'ver-y-operar' && level !== 'editar') {
            return res.status(403).json({ message: 'No tienes permiso para subir esta evidencia.' });
        }
    }
    try {
        const ext = extFromContentType(contentType);
        const key = buildEvidenceStorageKey({ clientId: req.user.clientId, tableKey, recordId, fieldKey, ext });
        const uploadUrl = await getUploadUrl(key, contentType);
        res.json({ uploadUrl, key });
    } catch (err) {
        console.error('evidence-upload-url failed:', err.message);
        res.status(503).json({ message: 'El almacenamiento de archivos no está configurado todavía.' });
    }
});

// La misma subida de una foto, pero POR EL SERVIDOR: el navegador manda el archivo aquí y el servidor lo guarda en el MISMO almacenamiento (R2) con la MISMA llave que habría usado la subida directa. Sirve cuando el navegador no
// logra mandarlo directo a R2 (la política CORS del bucket, la red de la empresa…): el servidor escribe en R2 por su cuenta y no depende de nada de eso. Mismos permisos que la subida directa. Si R2 también rechaza al
// servidor, la respuesta trae el código exacto que dio R2 (AccessDenied, NoSuchBucket…) para saber qué corregir; la foto NO se guarda en otro lugar.
const EVIDENCE_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/gif']);
app.post('/api/business/evidence-upload', requireAuth, express.raw({ type: (req) => /^image\//i.test(String(req.headers['content-type'] || '')), limit: '8mb' }), async (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const tableKey = String(req.query.tableKey || '');
    const fieldKey = String(req.query.fieldKey || '');
    const recordId = Number(req.query.recordId);
    const permColKey = getEvidencePermColKey(tableKey, fieldKey);
    if (!permColKey) return res.status(400).json({ message: 'Unknown evidence field.' });
    if (!Number.isInteger(recordId) || recordId < 1) return res.status(400).json({ message: 'Ese registro no es válido.', code: 'RECORD' });
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        const level = getColumnGrantLevel(grants, tableKey, permColKey);
        if (level !== 'ver-y-operar' && level !== 'editar') {
            return res.status(403).json({ message: 'No tienes permiso para subir esta evidencia.' });
        }
    }
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!EVIDENCE_IMAGE_TYPES.has(contentType) || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ message: 'La foto no es válida.', code: 'FILE' });
    try {
        const key = buildEvidenceStorageKey({ clientId: req.user.clientId, tableKey, recordId, fieldKey, ext: extFromContentType(contentType) });
        await putObject(key, req.body, contentType);
        res.json({ key });
    } catch (err) {
        const r2Error = String((err && (err.name || err.Code)) || 'Error').slice(0, 60);
        console.error('evidence-upload failed:', r2Error, err && err.message, err && err.$metadata ? err.$metadata.httpStatusCode : '');
        res.status(502).json({ message: `El almacenamiento de archivos (R2) no recibió la foto: ${r2Error}.`, code: 'R2', r2Error });
    }
});

// --- Material Apoyo (Funcionalidad Pantallas / Flujo Sistema / Nuestros ---
// --- Procesos) — document library per client, scoped by Departamento/    --
// --- Área/categoría, reusing R2 the same way evidence above does. This
// pantalla lives once per Departamento×Área (areaCategories template), not
// at one fixed spot like every table in TABLE_GRANT_PATHS -- see db.js's
// pathOverride comment on getColumnGrantLevel for why a per-request path is
// built here instead of a static entry there.
const MATERIAL_APOYO_COL_KEYS = {
    'funcionalidad-pantallas': 'colMaterialApoyoFuncionalidad',
    'flujo-sistema': 'colMaterialApoyoFlujo',
    'nuestros-procesos': 'colMaterialApoyoProcesos',
};
const MATERIAL_APOYO_SUBMENU_SLUGS = {
    'funcionalidad-pantallas': 'cat-material-apoyo-funcionalidad',
    'flujo-sistema': 'cat-material-apoyo-flujo',
    'nuestros-procesos': 'cat-material-apoyo-procesos',
};
function materialApoyoPathOverride(department, area, category) {
    return { sectionId: department, itemId: area, submenuPrefix: `cat-material-apoyo/${MATERIAL_APOYO_SUBMENU_SLUGS[category]}` };
}
// Ver y Operar/Editar unlocks subir/eliminar; Solo Ver (the always-true
// floor) is enough to see the list and download -- unlike Nuestros
// Respaldos, this material is meant to be read broadly by anyone with the
// pantalla, not gated like sensitive trip evidence.
function canOperateMaterialApoyo(req, department, area, category) {
    if (req.user.isClientAdmin) return true;
    const grants = getUserEffectiveGrants(req.user.sub);
    const level = getColumnGrantLevel(grants, 'material-apoyo', MATERIAL_APOYO_COL_KEYS[category], materialApoyoPathOverride(department, area, category));
    return level === 'ver-y-operar' || level === 'editar';
}
function validMaterialApoyoScope({ department, area, category }) {
    return !!department && !!area && SUPPORT_MATERIAL_CATEGORIES.includes(category);
}

app.get('/api/business/material-apoyo', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!validMaterialApoyoScope(req.query)) return res.status(400).json({ message: 'department, area y category (válida) son requeridos.' });
    const { department, area, category } = req.query;
    res.json({ files: listSupportMaterials(req.user.clientId, department, area, category) });
});

app.post('/api/business/material-apoyo/upload-url', requireAuth, async (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { department, area, category, contentType } = req.body || {};
    if (!validMaterialApoyoScope({ department, area, category })) return res.status(400).json({ message: 'department, area y category (válida) son requeridos.' });
    if (!canOperateMaterialApoyo(req, department, area, category)) {
        return res.status(403).json({ message: 'No tienes permiso para subir material de apoyo aquí.' });
    }
    try {
        const key = buildSupportMaterialStorageKey({ clientId: req.user.clientId, department, area, category, contentType });
        const uploadUrl = await getUploadUrl(key, contentType);
        res.json({ uploadUrl, key });
    } catch (err) {
        console.error('material-apoyo upload-url failed:', err.message);
        res.status(503).json({ message: 'El almacenamiento de archivos no está configurado todavía.' });
    }
});

app.post('/api/business/material-apoyo', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { department, area, departmentLabel, areaLabel, category, key, title, originalFilename, contentType, fileSize } = req.body || {};
    if (!validMaterialApoyoScope({ department, area, category })) return res.status(400).json({ message: 'department, area y category (válida) son requeridos.' });
    if (!key || !originalFilename) return res.status(400).json({ message: 'key y originalFilename son requeridos.' });
    if (!canOperateMaterialApoyo(req, department, area, category)) {
        return res.status(403).json({ message: 'No tienes permiso para subir material de apoyo aquí.' });
    }
    const material = createSupportMaterial({
        clientId: req.user.clientId, department, area,
        departmentLabel: departmentLabel || department, areaLabel: areaLabel || area,
        category, title, originalFilename, storageKey: key, contentType, fileSize,
        uploadedByName: req.user.name, uploadedBySource: 'client',
    });
    res.status(201).json({ material });
});

app.get('/api/business/material-apoyo/download-url', requireAuth, async (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const material = getSupportMaterialById(Number(req.query.id), req.user.clientId);
    if (!material) return res.status(404).json({ message: 'Material not found.' });
    try {
        const url = await getDownloadUrl(material.storage_key, material.title || material.original_filename);
        res.json({ url });
    } catch (err) {
        console.error('material-apoyo download-url failed:', err.message);
        res.status(503).json({ message: 'El almacenamiento de archivos no está configurado todavía.' });
    }
});

app.delete('/api/business/material-apoyo/:id', requireAuth, async (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const material = getSupportMaterialById(Number(req.params.id), req.user.clientId);
    if (!material) return res.status(404).json({ message: 'Material not found.' });
    if (!canOperateMaterialApoyo(req, material.department, material.area, material.category)) {
        return res.status(403).json({ message: 'No tienes permiso para eliminar material de apoyo aquí.' });
    }
    deleteSupportMaterial(material.id, req.user.clientId);
    try { await deleteObject(material.storage_key); } catch (err) { console.error('material-apoyo R2 delete failed (ignored):', err.message); }
    res.json({ ok: true });
});

// --- Mi Recurso Humano (Operaciones > Recursos Humanos > Administración de --
// --- Personal) — same access model as fuel records above. ------------------
// Fixed per menu.json's own placement of this screen (human-resources /
// hr-area-personnel-admin / Mi Recurso Humano) — same recipe as
// FUEL_RECORD_*_LABEL above, see TABLE_GRANT_PATHS['mi-recurso-humano'] in
// db.js for where these 3 come from.
const HR_WORKER_MODULE_LABEL = 'Recursos Humanos';
const HR_WORKER_AREA_LABEL = 'Administración de Personal';
const HR_WORKER_SCREEN_LABEL = 'Mi Recurso Humano';

function mapHrWorker(row, pendingByRecord, companyName) {
    if (!row) return row;
    const costCenter = row.cost_center_id ? getCostCenterById(row.cost_center_id, row.client_id, !!row.is_test_data) : null;
    return {
        id: row.id,
        dbId: row.db_id,
        recordNumber: row.record_number,
        recordCode: row.record_code,
        givenNames: row.given_names,
        surnames: row.surnames,
        fullName: row.full_name,
        position: row.position,
        startDate: row.start_date,
        // Live reflection of whatever this worker's Puesto currently grants
        // in Roles -- never the stored/manually-picked value anymore (see
        // getJobPositionDepartments), so it can't drift from the real tree.
        departments: getJobPositionDepartments(row.job_position_id),
        // Asignación a laborar: null (sin asignar), 'all' o un arreglo (departamentos y sitios: sus claves; centros: sus ids).
        assignedDepartments: parseHrAssignment(row.assigned_departments),
        assignedAreas: parseHrAssignment(row.assigned_areas),
        assignedSites: parseHrAssignment(row.assigned_sites),
        assignedCostCenters: parseHrAssignment(row.assigned_cost_centers),
        costCenterId: row.cost_center_id,
        area: row.area,
        email: row.email,
        personalEmail: row.personal_email,
        phone: row.phone,
        hrStatusId: row.hr_status_id,
        hrStatusName: row.hrStatusName,
        hrStatusEffect: row.hrStatusEffect,
        username: row.username,
        // NULL (no linked account, shouldn't happen for anything created
        // after this feature shipped) reads as false, same as inactive.
        userActive: !!row.userActive,
        pendingFields: pendingByRecord?.get(row.id) || [],
        ...getSystemColumnsForRecord({
            companyName,
            area: HR_WORKER_AREA_LABEL,
            modulo: HR_WORKER_MODULE_LABEL,
            pantalla: HR_WORKER_SCREEN_LABEL,
            centroCostos: costCenter?.name || '',
            createdAt: row.created_at,
        }),
    };
}

// Lo que se puede elegir en «Asignación a laborar»: los departamentos contratados, los sitios y los centros de costos del cliente (cada centro con su sitio).
app.get('/api/business/hr-assignment-options', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const options = hrAssignmentOptions(req.user.clientId, req.user.isTestAccount);
    const selectable = new Set(options.centers.map((cc) => cc.id));
    res.json({
        departments: options.departments,
        // Las áreas de cada departamento contratado ({ id, labelKey, labelParams? }); en lo asignado cada una va como «departamento/área».
        areas: options.areas,
        sites: options.sites.map((code) => ({ code, sucursal: (options.centers.find((cc) => cc.site_code === code) || {}).sucursal || '' })),
        costCenters: options.centers.map((cc) => ({ id: cc.id, code: cc.code, name: cc.name, siteCode: cc.site_code })),
        // Los centros que no se pueden asignar y por qué (la pantalla los muestra bloqueados): inactivo, o activo pero sin Código del sitio.
        lockedCostCenters: listCostCenters(req.user.clientId, req.user.isTestAccount).filter((cc) => !selectable.has(cc.id)).map((cc) => ({ id: cc.id, code: cc.code, name: cc.name, reason: cc.status !== 'active' ? 'inactive' : 'noSite' })),
    });
});

app.get('/api/business/hr-workers', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pendingByRecord = getPendingColumnsByRecord(req.user.clientId, 'mi-recurso-humano');
    const client = getClientById(req.user.clientId);
    res.json({ workers: listHrWorkers(req.user.clientId, req.user.isTestAccount).map((w) => mapHrWorker(w, pendingByRecord, client?.company_name)) });
});

app.post('/api/business/hr-workers', requireAuth, async (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    if (!req.user.isClientAdmin && !canCreateColumn(getUserEffectiveGrants(req.user.sub), 'mi-recurso-humano', 'colHrWorkerCreateAuth')) {
        return res.status(403).json({ message: 'No tienes permiso para crear registros aquí.' });
    }
    const { givenNames, surnames, position, jobPositionId, startDate, costCenterId, email, personalEmail } = req.body || {};
    if (!givenNames?.trim() || !surnames?.trim() || !position?.trim() || !jobPositionId || !startDate || !email?.trim()) {
        return res.status(400).json({ message: 'givenNames, surnames, position, jobPositionId, startDate, and email are required.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        return res.status(400).json({ message: 'email must be a valid email address.' });
    }
    if (personalEmail?.trim() && !/^\S+@\S+\.\S+$/.test(personalEmail.trim())) {
        return res.status(400).json({ message: 'personalEmail must be a valid email address.' });
    }
    if (usernameOrEmailExists(null, email.trim())) {
        return res.status(409).json({ message: 'That email is already in use by another account.' });
    }
    if (!getJobPositionById(jobPositionId, req.user.clientId, req.user.isTestAccount)) {
        return res.status(400).json({ message: 'jobPositionId does not belong to this client.' });
    }
    if (costCenterId != null && !getCostCenterById(costCenterId, req.user.clientId, req.user.isTestAccount)) {
        return res.status(400).json({ message: 'costCenterId does not belong to this client.' });
    }
    // Arranque de «Asignación a laborar»: el centro de costos que la da de alta, con su sitio y los departamentos de su Puesto que el cliente tiene contratados (si el Puesto no trae departamentos, todos los contratados). Si la cadena no cuadra se queda sin asignar.
    let assignment = null;
    if (costCenterId) {
        const options = hrAssignmentOptions(req.user.clientId, req.user.isTestAccount);
        const positionDepartments = getJobPositionDepartments(jobPositionId).filter((key) => options.departments.includes(key));
        const center = getCostCenterById(costCenterId, req.user.clientId, req.user.isTestAccount);
        if (center && center.site_code) {
            const resolved = resolveHrAssignment({
                clientId: req.user.clientId, forTestAccount: req.user.isTestAccount, current: { departments: null, sites: null, costCenters: null },
                patch: { departments: positionDepartments.length ? positionDepartments : 'all', sites: [center.site_code], costCenters: [center.id] },
            });
            if (resolved.ok) assignment = resolved.value;
        }
    }
    const worker = await createHrWorker({
        clientId: req.user.clientId,
        assignment,
        givenNames: givenNames.trim(),
        surnames: surnames.trim(),
        position: position.trim(),
        jobPositionId,
        startDate,
        costCenterId: costCenterId || null,
        email: email.trim(),
        personalEmail: (personalEmail || '').trim(),
        isTestData: req.user.isTestAccount,
    });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'mi-recurso-humano', recordId: worker.id,
        recordLabel: worker.full_name, action: 'create', changedBy: changedByLabel(req),
    });
    notifyButtonAction(req, 'mi-recurso-humano', 'create', worker.full_name);
    res.status(201).json({ worker: mapHrWorker(worker, null, getClientById(req.user.clientId)?.company_name) });
});

app.patch('/api/business/hr-workers/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const existing = getHrWorkerById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Worker not found.' });
    const patch = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(patch, 'costCenterId') && patch.costCenterId != null
        && !getCostCenterById(patch.costCenterId, req.user.clientId, req.user.isTestAccount)) {
        return res.status(400).json({ message: 'costCenterId does not belong to this client.' });
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'hrStatusId')
        && !getHrStatusCatalogById(patch.hrStatusId, req.user.clientId, req.user.isTestAccount)) {
        return res.status(400).json({ message: 'hrStatusId does not belong to this client.' });
    }
    // Asignación a laborar: la cadena (departamentos -> sitios -> centros de costos, de lo contratado) se revisa con lo que ya tenía la persona y se guarda como texto fijo para compararlo y para el historial.
    const assignmentKeys = { assignedDepartments: 'departments', assignedAreas: 'areas', assignedSites: 'sites', assignedCostCenters: 'costCenters' };
    if (Object.keys(assignmentKeys).some((key) => Object.prototype.hasOwnProperty.call(patch, key))) {
        const resolved = resolveHrAssignment({
            clientId: req.user.clientId, forTestAccount: req.user.isTestAccount,
            current: { departments: parseHrAssignment(existing.assigned_departments), areas: parseHrAssignment(existing.assigned_areas), sites: parseHrAssignment(existing.assigned_sites), costCenters: parseHrAssignment(existing.assigned_cost_centers) },
            patch: Object.fromEntries(Object.entries(assignmentKeys).filter(([key]) => Object.prototype.hasOwnProperty.call(patch, key)).map(([key, name]) => [name, patch[key]])),
        });
        if (!resolved.ok) return res.status(400).json({ message: resolved.message });
        Object.entries(assignmentKeys).forEach(([key, name]) => {
            if (Object.prototype.hasOwnProperty.call(patch, key)) patch[key] = serializeHrAssignment(resolved.value[name]);
        });
    }
    const assignmentLog = {
        assignedDepartments: (raw) => describeHrAssignment('departments', raw, req.user.clientId, req.user.isTestAccount),
        assignedAreas: (raw) => describeHrAssignment('areas', raw, req.user.clientId, req.user.isTestAccount),
        assignedSites: (raw) => describeHrAssignment('sites', raw, req.user.clientId, req.user.isTestAccount),
        assignedCostCenters: (raw) => describeHrAssignment('costCenters', raw, req.user.clientId, req.user.isTestAccount),
    };
    const { appliedPatch, pendingFields, rejectedFields } = checkAndLogFieldChanges(req, existing, patch, HR_WORKER_PATCHABLE_FIELDS, 'mi-recurso-humano', existing.full_name, assignmentLog);
    const worker = updateHrWorker(req.params.id, req.user.clientId, appliedPatch, req.user.isTestAccount);
    res.json({ worker: mapHrWorker(worker, null, getClientById(req.user.clientId)?.company_name), pendingFields, rejectedFields });
});

// Issues this worker's login for the first time (or resets it later, e.g.
// a forgotten password) — the ONLY place a real password for their
// auto-created account (see createHrWorker) ever gets generated, shown
// once in the response, same one-time-credentials convention as
// activating a client (see applyClientLifecycle).
// requireClientAdmin (not just requireAuth): issuing a real, usable
// password for someone else's account is an administrative action, not a
// data edit subject to the per-column grant/pending-approval workflow --
// confirmed live, 2026-09-28, as part of the security review's medium
// findings (this route and resend-credentials-email below had no gate
// beyond "same client" at all, meaning any logged-in employee could mint
// login credentials for any coworker at their own client).
app.post('/api/business/hr-workers/:id/activate-user', requireAuth, requireClientAdmin, async (req, res) => {
    const existing = getHrWorkerById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Worker not found.' });
    const generated = await activateHrWorkerUser(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!generated) return res.status(409).json({ message: 'This worker has no linked account.' });
    const emailSent = await sendMail({
        to: existing.personal_email,
        subject: `Acceso a SGN — ${existing.full_name}`,
        text: `Se activó tu cuenta en SGN.\n\nUsuario: ${generated.username}\nContraseña: ${generated.password}\n\n`
            + 'Guarda esta contraseña en un lugar seguro — no se puede recuperar después de este correo.',
    });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'mi-recurso-humano', recordId: existing.id,
        recordLabel: existing.full_name, action: 'update', fieldKey: 'main.colHrUserActivated',
        oldValue: '—', newValue: generated.username, changedBy: changedByLabel(req),
    });
    res.json({
        worker: mapHrWorker(getHrWorkerById(req.params.id, req.user.clientId, req.user.isTestAccount), null, getClientById(req.user.clientId)?.company_name),
        generated: { ...generated, emailSent, emailTo: existing.personal_email },
    });
});

// "Reenviar correo" on the one-time hr-credentials-modal -- USED TO trust
// whatever username/password the client posted (the admin's own browser
// re-sending what it had cached from the activate-user response), since the
// plaintext password is never persisted server-side, only its hash, so
// there was nothing to look up again. Confirmed live, 2026-09-28 (security
// review, finding #03): that's a real gap -- it let the caller email
// arbitrary "credential" text to a coworker's personal address. Fixed the
// only honest way possible given the plaintext truly isn't recoverable:
// this now calls activateHrWorkerUser again, same as the route above, so
// "reenviar" really means "reissue a fresh, server-generated password and
// send THAT" -- the old one stops working the moment this is clicked,
// exactly like clicking Activar again would. req.body is no longer read at
// all here.
app.post('/api/business/hr-workers/:id/resend-credentials-email', requireAuth, requireClientAdmin, async (req, res) => {
    const existing = getHrWorkerById(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!existing) return res.status(404).json({ message: 'Worker not found.' });
    const generated = await activateHrWorkerUser(req.params.id, req.user.clientId, req.user.isTestAccount);
    if (!generated) return res.status(409).json({ message: 'This worker has no linked account.' });
    const emailSent = await sendMail({
        to: existing.personal_email,
        subject: `Acceso a SGN — ${existing.full_name}`,
        text: `Se activó tu cuenta en SGN.\n\nUsuario: ${generated.username}\nContraseña: ${generated.password}\n\n`
            + 'Guarda esta contraseña en un lugar seguro — no se puede recuperar después de este correo.',
    });
    logTableChange({
        clientId: req.user.clientId, tableKey: 'mi-recurso-humano', recordId: existing.id,
        recordLabel: existing.full_name, action: 'update', fieldKey: 'main.colHrUserActivated',
        oldValue: '—', newValue: generated.username, changedBy: changedByLabel(req),
    });
    res.json({ generated: { ...generated, emailSent, emailTo: existing.personal_email } });
});

// No DELETE route -- a worker leaving is a Rescisión de Contrato Estatus
// (see Business-EstatusRH.html), same "Activar/Desactivar only" rule as
// clients/cost centers/sectors.

// --- Historial de cambios (control de cambios icon, generic across every ---
// --- .data-table — see openChangeHistory in Dashboard.js) -------------------
// tableKey is whatever data-table-id the caller is looking at; tables with
// no business backend yet (or GEIPSA-admin-only ones, which have no
// req.user.clientId) simply degrade to a 404/empty list, same as
// contracted-modules/branding above.
app.get('/api/business/table-changes/:tableKey', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const recordId = req.query.recordId ? Number(req.query.recordId) : undefined;
    res.json({ changes: getTableChanges(req.user.clientId, req.params.tableKey, recordId) });
});

// --- Búsqueda Guardada / Acomodo Guardado -------------------------------
// Shared audience matching for BOTH "saved view" features (saved_searches
// and saved_layouts, db.js) -- identical visibility rules, so one pair of
// functions serves both instead of two copies. A 'global' row matches a
// user if ANY of its 3 criteria matches (OR across criteria), each with
// its own exceptUserIds (Puestos/Centros de Costo only -- Usuarios has
// none, excluding a user from a literal user list is just not picking
// them). Cost-center access comes from the user's own real grants (the
// same 'cc-<id>' leaves Dashboard.js's hasCostCenterPermission checks
// client-side), not job_positions.cost_center_scope -- grants are the
// already-resolved source of truth everywhere else in this app. No
// "sites" criterion yet -- see db.js's schema comment on saved_searches.
function matchesSavedViewAudience(audience, { userId, jobPositionId, costCenterIds }) {
    if (!audience) return false;
    if ((audience.userIds || []).includes(userId)) return true;
    if (jobPositionId && (audience.jobPositions || []).some((jp) => jp.id === jobPositionId && !(jp.exceptUserIds || []).includes(userId))) return true;
    if ((audience.costCenters || []).some((cc) => costCenterIds.includes(cc.id) && !(cc.exceptUserIds || []).includes(userId))) return true;
    return false;
}

function validateSavedViewAudience(audience) {
    if (!audience || typeof audience !== 'object') return false;
    const isIdArray = (v) => Array.isArray(v) && v.every((x) => Number.isInteger(x));
    const isExceptGroup = (arr) => Array.isArray(arr) && arr.every((e) => e && Number.isInteger(e.id) && (e.exceptUserIds === undefined || isIdArray(e.exceptUserIds)));
    if (audience.userIds !== undefined && !isIdArray(audience.userIds)) return false;
    if (audience.jobPositions !== undefined && !isExceptGroup(audience.jobPositions)) return false;
    if (audience.costCenters !== undefined && !isExceptGroup(audience.costCenters)) return false;
    return true;
}

// Un guardado (búsqueda o acomodo) no se repite: dos con el mismo nombre en lo
// que una misma persona ve junta ("Prueba" y "Prueba") no se pueden distinguir,
// y un doble clic o un navegador con una versión vieja los creaba idénticos.
// Mismo nombre (sin importar mayúsculas ni espacios) dentro de lo propio de quien
// lo guarda -- sus personales y los globales de la tabla; un global, contra los
// globales:
//   - si además trae EXACTAMENTE lo mismo, el POST no crea otro: devuelve el que ya
//     existe (así un doble clic termina igual que uno solo);
//   - si trae algo distinto, 409 y que elija otro nombre.
function normalizeSavedName(name) {
    return String(name || '').trim().toLowerCase();
}

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function findSavedNameClash(rows, { scope, ownerUserId, name, ignoreId }) {
    const wanted = normalizeSavedName(name);
    return (rows || []).find((r) => r.id !== ignoreId
        && normalizeSavedName(r.name) === wanted
        && (scope === 'global' ? r.scope === 'global' : (r.scope === 'global' || r.ownerUserId === ownerUserId)));
}

const savedNameTakenMessage = (noun) => `Ya existe ${noun} con ese nombre. Elige otro nombre.`;

// Shared by every saved-view GET route (saved-searches, saved-layouts) --
// the context matchesSavedViewAudience needs to decide if a 'global' row
// applies to this particular user.
function resolveUserAudienceContext(userId) {
    const jobPositionId = getJobPositionIdForUser(userId);
    const grants = getUserEffectiveGrants(userId);
    const costCenterIds = grants
        .filter((g) => g.sectionId === 'main' && g.itemId === 'cc-list' && g.submenuId?.startsWith('cc-'))
        .map((g) => Number(g.submenuId.slice(3)))
        .filter((id) => Number.isFinite(id));
    return { jobPositionId, costCenterIds };
}

app.get('/api/business/saved-searches/:tableKey', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const userId = req.user.sub;
    const { jobPositionId, costCenterIds } = resolveUserAudienceContext(userId);
    const all = getSavedSearchesForClientTable(req.user.clientId, req.params.tableKey);
    const visible = all.filter((row) => {
        if (row.scope === 'personal') return row.ownerUserId === userId;
        return !!req.user.isClientAdmin || matchesSavedViewAudience(row.audience, { userId, jobPositionId, costCenterIds });
    });
    res.json({ searches: visible });
});

app.post('/api/business/saved-searches', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { tableKey, name, filter, scope, audience } = req.body || {};
    if (!tableKey || typeof tableKey !== 'string') return res.status(400).json({ message: 'Missing tableKey.' });
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Missing name.' });
    if (!filter || typeof filter !== 'object') return res.status(400).json({ message: 'Missing filter.' });
    const finalScope = scope === 'global' ? 'global' : 'personal';
    if (finalScope === 'global') {
        if (!req.user.isClientAdmin) return res.status(403).json({ message: 'Solo un administrador puede crear una búsqueda guardada global.' });
        const hasAnyTarget = (audience?.userIds?.length || audience?.jobPositions?.length || audience?.costCenters?.length);
        if (!validateSavedViewAudience(audience) || !hasAnyTarget) {
            return res.status(400).json({ message: 'Elige al menos un usuario, puesto o centro de costo.' });
        }
    }
    const clash = findSavedNameClash(getSavedSearchesForClientTable(req.user.clientId, tableKey),
        { scope: finalScope, ownerUserId: req.user.sub, name });
    if (clash) {
        if (stableStringify(clash.filter) === stableStringify(filter)) return res.status(200).json({ search: clash });
        return res.status(409).json({ message: savedNameTakenMessage('una búsqueda guardada') });
    }
    const row = createSavedSearch({
        clientId: req.user.clientId, tableKey, name: name.trim(), filter,
        scope: finalScope, ownerUserId: req.user.sub, createdByUserId: req.user.sub,
        audience: finalScope === 'global' ? audience : undefined,
    });
    notifyIconUpdate(req, { tableKey, iconId: 'iconSavedSearch', action: 'created', name: row.name || name, scope: finalScope });
    res.status(201).json({ search: row });
});

// Editar = nombre + filtros; alcance y audiencia no cambian. Mismo permiso que
// borrar: el dueño de una personal, o un admin del cliente.
app.put('/api/business/saved-searches/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const row = getSavedSearchById(Number(req.params.id));
    if (!row || row.clientId !== req.user.clientId) return res.status(404).json({ message: 'Not found.' });
    const isOwner = row.scope === 'personal' && row.ownerUserId === req.user.sub;
    if (!isOwner && !req.user.isClientAdmin) return res.status(403).json({ message: 'No tienes permiso para editar esta búsqueda guardada.' });
    const { name, filter } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Missing name.' });
    if (!filter || typeof filter !== 'object') return res.status(400).json({ message: 'Missing filter.' });
    if (findSavedNameClash(getSavedSearchesForClientTable(row.clientId, row.tableKey),
        { scope: row.scope, ownerUserId: row.ownerUserId, name, ignoreId: row.id })) {
        return res.status(409).json({ message: savedNameTakenMessage('una búsqueda guardada') });
    }
    const updatedSearch = updateSavedSearch(row.id, { name: name.trim(), filter });
    notifyIconUpdate(req, { tableKey: row.tableKey, iconId: 'iconSavedSearch', action: 'updated', name: name.trim(), scope: row.scope });
    res.json({ search: updatedSearch });
});

app.delete('/api/business/saved-searches/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const row = getSavedSearchById(Number(req.params.id));
    if (!row || row.clientId !== req.user.clientId) return res.status(404).json({ message: 'Not found.' });
    const isOwner = row.scope === 'personal' && row.ownerUserId === req.user.sub;
    if (!isOwner && !req.user.isClientAdmin) return res.status(403).json({ message: 'No tienes permiso para eliminar esta búsqueda guardada.' });
    deleteSavedSearch(row.id);
    notifyIconUpdate(req, { tableKey: row.tableKey, iconId: 'iconSavedSearch', action: 'deleted', name: row.name, scope: row.scope });
    res.json({ ok: true });
});

// Búsqueda Guardada's SaaS-side sibling -- same /api/admin/ + requireAuth/
// requireAdmin shape as saas-saved-layouts below, no clientId anywhere (see
// saas_saved_searches' schema comment in db.js). "global" here means Equipo
// SaaS members listed in audience.userIds, gated on isSaasSuperAdmin.
app.get('/api/admin/saas-saved-searches/:tableKey', requireAuth, requireAdmin, (req, res) => {
    const userId = req.user.sub;
    const all = getSaasSavedSearchesForTable(req.params.tableKey);
    const visible = all.filter((row) => {
        if (row.scope === 'personal') return row.ownerUserId === userId;
        return !!req.user.isSaasSuperAdmin || (row.audience?.userIds || []).includes(userId);
    });
    res.json({ searches: visible });
});

app.post('/api/admin/saas-saved-searches', requireAuth, requireAdmin, (req, res) => {
    const { tableKey, name, filter, scope, audience } = req.body || {};
    if (!tableKey || typeof tableKey !== 'string') return res.status(400).json({ message: 'Missing tableKey.' });
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Missing name.' });
    if (!filter || typeof filter !== 'object') return res.status(400).json({ message: 'Missing filter.' });
    const finalScope = scope === 'global' ? 'global' : 'personal';
    if (finalScope === 'global') {
        if (!req.user.isSaasSuperAdmin) return res.status(403).json({ message: 'Solo el super admin SaaS puede crear una búsqueda guardada global.' });
        if (!audience?.userIds?.length) return res.status(400).json({ message: 'Elige al menos un integrante de Equipo SaaS.' });
    }
    const clash = findSavedNameClash(getSaasSavedSearchesForTable(tableKey),
        { scope: finalScope, ownerUserId: req.user.sub, name });
    if (clash) {
        if (stableStringify(clash.filter) === stableStringify(filter)) return res.status(200).json({ search: clash });
        return res.status(409).json({ message: savedNameTakenMessage('una búsqueda guardada') });
    }
    const row = createSaasSavedSearch({
        tableKey, name: name.trim(), filter,
        scope: finalScope, ownerUserId: req.user.sub, createdByUserId: req.user.sub,
        audience: finalScope === 'global' ? { userIds: audience.userIds } : undefined,
    });
    res.status(201).json({ search: row });
});

app.put('/api/admin/saas-saved-searches/:id', requireAuth, requireAdmin, (req, res) => {
    const row = getSaasSavedSearchById(Number(req.params.id));
    if (!row) return res.status(404).json({ message: 'Not found.' });
    const isOwner = row.scope === 'personal' && row.ownerUserId === req.user.sub;
    if (!isOwner && !req.user.isSaasSuperAdmin) return res.status(403).json({ message: 'No tienes permiso para editar esta búsqueda guardada.' });
    const { name, filter } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Missing name.' });
    if (!filter || typeof filter !== 'object') return res.status(400).json({ message: 'Missing filter.' });
    if (findSavedNameClash(getSaasSavedSearchesForTable(row.tableKey),
        { scope: row.scope, ownerUserId: row.ownerUserId, name, ignoreId: row.id })) {
        return res.status(409).json({ message: savedNameTakenMessage('una búsqueda guardada') });
    }
    res.json({ search: updateSaasSavedSearch(row.id, { name: name.trim(), filter }) });
});

app.delete('/api/admin/saas-saved-searches/:id', requireAuth, requireAdmin, (req, res) => {
    const row = getSaasSavedSearchById(Number(req.params.id));
    if (!row) return res.status(404).json({ message: 'Not found.' });
    const isOwner = row.scope === 'personal' && row.ownerUserId === req.user.sub;
    if (!isOwner && !req.user.isSaasSuperAdmin) return res.status(403).json({ message: 'No tienes permiso para eliminar esta búsqueda guardada.' });
    deleteSaasSavedSearch(row.id);
    res.json({ ok: true });
});

// --- Acomodo Guardado ----------------------------------------------------
// Búsqueda Guardada's sibling -- same visibility rules (matchesSavedViewAudience/
// validateSavedViewAudience above), same admin-only gate on scope:'global'.
// The client resolves "which one is MY default" from this same list (its
// own personal isDefault row first, else the first matching global
// isDefault row) -- no separate /default endpoint needed.
function validateSavedLayoutPayload(layout) {
    if (!layout || typeof layout !== 'object') return false;
    const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');
    if (!isStringArray(layout.order) || !isStringArray(layout.hidden) || !isStringArray(layout.pinned)) return false;
    // Hasta 4 columnas fijas, igual que en la pantalla (DATA_TABLE_PIN_MAX en Dashboard.js).
    if (layout.pinned.length > 4) return false;
    if (layout.widths !== undefined && (typeof layout.widths !== 'object' || layout.widths === null)) return false;
    return true;
}

app.get('/api/business/saved-layouts/:tableKey', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const userId = req.user.sub;
    const { jobPositionId, costCenterIds } = resolveUserAudienceContext(userId);
    const all = getSavedLayoutsForClientTable(req.user.clientId, req.params.tableKey);
    const visible = all.filter((row) => {
        if (row.scope === 'personal') return row.ownerUserId === userId;
        return !!req.user.isClientAdmin || matchesSavedViewAudience(row.audience, { userId, jobPositionId, costCenterIds });
    });
    res.json({ layouts: visible });
});

app.post('/api/business/saved-layouts', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const { tableKey, name, layout, scope, isDefault, audience } = req.body || {};
    if (!tableKey || typeof tableKey !== 'string') return res.status(400).json({ message: 'Missing tableKey.' });
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Missing name.' });
    if (!validateSavedLayoutPayload(layout)) return res.status(400).json({ message: 'Invalid layout.' });
    const finalScope = scope === 'global' ? 'global' : 'personal';
    if (finalScope === 'global') {
        if (!req.user.isClientAdmin) return res.status(403).json({ message: 'Solo un administrador puede crear un acomodo guardado global.' });
        const hasAnyTarget = (audience?.userIds?.length || audience?.jobPositions?.length || audience?.costCenters?.length);
        if (!validateSavedViewAudience(audience) || !hasAnyTarget) {
            return res.status(400).json({ message: 'Elige al menos un usuario, puesto o centro de costo.' });
        }
    }
    const clash = findSavedNameClash(getSavedLayoutsForClientTable(req.user.clientId, tableKey),
        { scope: finalScope, ownerUserId: req.user.sub, name });
    if (clash) {
        if (stableStringify(clash.layout) === stableStringify(layout)) return res.status(200).json({ layout: clash });
        return res.status(409).json({ message: savedNameTakenMessage('un acomodo guardado') });
    }
    const row = createSavedLayout({
        clientId: req.user.clientId, tableKey, name: name.trim(), layout, isDefault: !!isDefault,
        scope: finalScope, ownerUserId: req.user.sub, createdByUserId: req.user.sub,
        audience: finalScope === 'global' ? audience : undefined,
    });
    notifyIconUpdate(req, { tableKey, iconId: 'iconSavedLayout', action: 'created', name: row.name || name, scope: finalScope });
    res.status(201).json({ layout: row });
});

// Editar = nombre + columnas; alcance, audiencia y default no cambian. Mismo
// permiso que borrar: el dueño de uno personal, o un admin del cliente.
app.put('/api/business/saved-layouts/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const row = getSavedLayoutById(Number(req.params.id));
    if (!row || row.clientId !== req.user.clientId) return res.status(404).json({ message: 'Not found.' });
    const isOwner = row.scope === 'personal' && row.ownerUserId === req.user.sub;
    if (!isOwner && !req.user.isClientAdmin) return res.status(403).json({ message: 'No tienes permiso para editar este acomodo guardado.' });
    const { name, layout } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Missing name.' });
    if (!validateSavedLayoutPayload(layout)) return res.status(400).json({ message: 'Invalid layout.' });
    if (findSavedNameClash(getSavedLayoutsForClientTable(row.clientId, row.tableKey),
        { scope: row.scope, ownerUserId: row.ownerUserId, name, ignoreId: row.id })) {
        return res.status(409).json({ message: savedNameTakenMessage('un acomodo guardado') });
    }
    const updatedLayout = updateSavedLayout(row.id, { name: name.trim(), layout });
    notifyIconUpdate(req, { tableKey: row.tableKey, iconId: 'iconSavedLayout', action: 'updated', name: name.trim(), scope: row.scope });
    res.json({ layout: updatedLayout });
});

app.delete('/api/business/saved-layouts/:id', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const row = getSavedLayoutById(Number(req.params.id));
    if (!row || row.clientId !== req.user.clientId) return res.status(404).json({ message: 'Not found.' });
    const isOwner = row.scope === 'personal' && row.ownerUserId === req.user.sub;
    if (!isOwner && !req.user.isClientAdmin) return res.status(403).json({ message: 'No tienes permiso para eliminar este acomodo guardado.' });
    deleteSavedLayout(row.id);
    notifyIconUpdate(req, { tableKey: row.tableKey, iconId: 'iconSavedLayout', action: 'deleted', name: row.name, scope: row.scope });
    res.json({ ok: true });
});

// Acomodo Guardado's SaaS-side sibling -- same validateSavedLayoutPayload
// (already generic/stateless, reused as-is), /api/admin/ namespace +
// requireAuth/requireAdmin like every other SaaS-admin route, no clientId
// anywhere (see saas_saved_layouts' own schema comment in db.js). "global"
// here is scoped to Equipo SaaS members (audience.userIds only -- no
// puestos/centros de costo on this side), gated on isSaasSuperAdmin
// instead of isClientAdmin.
app.get('/api/admin/saas-saved-layouts/:tableKey', requireAuth, requireAdmin, (req, res) => {
    const userId = req.user.sub;
    const all = getSaasSavedLayoutsForTable(req.params.tableKey);
    const visible = all.filter((row) => {
        if (row.scope === 'personal') return row.ownerUserId === userId;
        return !!req.user.isSaasSuperAdmin || (row.audience?.userIds || []).includes(userId);
    });
    res.json({ layouts: visible });
});

app.post('/api/admin/saas-saved-layouts', requireAuth, requireAdmin, (req, res) => {
    const { tableKey, name, layout, scope, isDefault, audience } = req.body || {};
    if (!tableKey || typeof tableKey !== 'string') return res.status(400).json({ message: 'Missing tableKey.' });
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Missing name.' });
    if (!validateSavedLayoutPayload(layout)) return res.status(400).json({ message: 'Invalid layout.' });
    const finalScope = scope === 'global' ? 'global' : 'personal';
    if (finalScope === 'global') {
        if (!req.user.isSaasSuperAdmin) return res.status(403).json({ message: 'Solo el super admin SaaS puede crear un acomodo guardado global.' });
        if (!audience?.userIds?.length) return res.status(400).json({ message: 'Elige al menos un integrante de Equipo SaaS.' });
    }
    const clash = findSavedNameClash(getSaasSavedLayoutsForTable(tableKey),
        { scope: finalScope, ownerUserId: req.user.sub, name });
    if (clash) {
        if (stableStringify(clash.layout) === stableStringify(layout)) return res.status(200).json({ layout: clash });
        return res.status(409).json({ message: savedNameTakenMessage('un acomodo guardado') });
    }
    const row = createSaasSavedLayout({
        tableKey, name: name.trim(), layout, isDefault: !!isDefault,
        scope: finalScope, ownerUserId: req.user.sub, createdByUserId: req.user.sub,
        audience: finalScope === 'global' ? { userIds: audience.userIds } : undefined,
    });
    res.status(201).json({ layout: row });
});

app.put('/api/admin/saas-saved-layouts/:id', requireAuth, requireAdmin, (req, res) => {
    const row = getSaasSavedLayoutById(Number(req.params.id));
    if (!row) return res.status(404).json({ message: 'Not found.' });
    const isOwner = row.scope === 'personal' && row.ownerUserId === req.user.sub;
    if (!isOwner && !req.user.isSaasSuperAdmin) return res.status(403).json({ message: 'No tienes permiso para editar este acomodo guardado.' });
    const { name, layout } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Missing name.' });
    if (!validateSavedLayoutPayload(layout)) return res.status(400).json({ message: 'Invalid layout.' });
    if (findSavedNameClash(getSaasSavedLayoutsForTable(row.tableKey),
        { scope: row.scope, ownerUserId: row.ownerUserId, name, ignoreId: row.id })) {
        return res.status(409).json({ message: savedNameTakenMessage('un acomodo guardado') });
    }
    res.json({ layout: updateSaasSavedLayout(row.id, { name: name.trim(), layout }) });
});

app.delete('/api/admin/saas-saved-layouts/:id', requireAuth, requireAdmin, (req, res) => {
    const row = getSaasSavedLayoutById(Number(req.params.id));
    if (!row) return res.status(404).json({ message: 'Not found.' });
    const isOwner = row.scope === 'personal' && row.ownerUserId === req.user.sub;
    if (!isOwner && !req.user.isSaasSuperAdmin) return res.status(403).json({ message: 'No tienes permiso para eliminar este acomodo guardado.' });
    deleteSaasSavedLayout(row.id);
    res.json({ ok: true });
});

// --- Base de Datos de Nuestros Cambios ---------------------------------------
// Every row any pantalla has ever logged via logTableChange, across every
// table at once -- same list open at requireAuth as every other screen
// under Base de Datos (see base-datos-respaldos' own comment: the real
// gate is menu.json's own tree-based visibility filter, not a second check
// here). WEB_SCREEN_CATALOG resolves table_key -> a real pantalla name for
// display, same catalog Apps mirroring already uses, so a future table
// only needs adding there to show up here too.
app.get('/api/business/table-changes', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const changes = getAllTableChanges(req.user.clientId).map((c) => ({
        ...c,
        screenLabelKey: screenLabelKeyOf(c.table_key),
    }));
    res.json({ changes });
});

// --- Pending changes (Autorizar approval workflow) --------------------------
// Applies an approved pending_changes row back onto its real record — one
// entry per patchable table, mirroring FUEL_PATCHABLE_FIELDS/
// HR_WORKER_PATCHABLE_FIELDS' partial-SET update* functions (cost centers
// isn't listed: its PATCH route is requireClientAdmin-only and the admin
// bypass means a pending row can never be created for it in the first
// place). Sanitizers here mirror each PATCH route's own — approving a
// pending change must sanitize the audit-log write exactly like a direct
// edit does, or the raw value (e.g. a ticketEvidence base64 photo) would
// leak into data_table_changes at approval time even though the direct-edit
// path already protects against that.
const PENDING_CHANGE_APPLIERS = {
    'registro-combustible': (recordId, clientId, patch) => updateFuelRecord(recordId, clientId, patch),
    'mi-recurso-humano': (recordId, clientId, patch) => updateHrWorker(recordId, clientId, patch),
    // Fase 3 (choques de la cola offline) escalates a conflict override to
    // pending_changes same as any other "editar" on an existing value --
    // these 3 were missing here entirely, which would have 500'd the
    // approve route the moment anyone tried to authorize one.
    'carga-combustible': (recordId, clientId, patch) => updateFuelLoadingRecord(recordId, clientId, patch),
    'tipos-unidad': (recordId, clientId, patch) => updateUnitType(recordId, clientId, patch),
    'nuestras-unidades': (recordId, clientId, patch) => updateFleetUnit(recordId, clientId, patch),
    // Corregir un registro de Limpieza / Temperaturas: quien autoriza el cambio aplica el valor y el registro queda marcado como corregido por quien lo pidió.
    'limpieza': (recordId, clientId, patch, extra) => updateCleaningRecord(recordId, clientId, patch, extra),
    // Corregir un renglón de Pedido Manual (quién lo pidió o la cantidad) cuando lo autoriza otra persona.
    'pedido-manual': (recordId, clientId, patch, extra) => updateManualOrderLine(recordId, clientId, patch, extra),
    // Cambiar el código ya asignado a un lugar de Capacidad Almacenamiento cuando lo autoriza otra persona.
    'capacidad-almacenamiento': (recordId, clientId, patch, extra) => updateStorageCapacity(recordId, clientId, patch, extra),
    // Corregir un reporte de Incidentes (quién reporta, el detalle del lugar o la situación) cuando lo autoriza otra persona.
    'incidentes': (recordId, clientId, patch, extra) => updateIncident(recordId, clientId, patch, extra),
    'temperaturas': (recordId, clientId, patch, extra) => updateTemperatureRecord(recordId, clientId, patch, extra),
    'seguridad': (recordId, clientId, patch, extra) => updateSafetyCheck(recordId, clientId, patch, extra),
    // Cambiar un dato de una presentación de Presentaciones de Distribución cuando lo autoriza otra persona.
    'udm-distribucion': (recordId, clientId, patch) => updateSkuDistribution(recordId, clientId, patch),
    // Cambiar un dato de un activo de Alta Activos cuando lo autoriza otra persona (la profundidad de una cilíndrica y el volumen se recalculan con la medida).
    'alta-activos': (recordId, clientId, patch) => {
        const existing = getFixedAssetById(recordId, clientId, false) || getFixedAssetById(recordId, clientId, true);
        if (!existing) return null;
        const norm = normalizeFixedAssetValues(patch, { classes: new Map(listArticleCategories(clientId, 'activos-clasificacion', !!existing.is_test_data).map((r) => [r.id, r])) }, existing);
        const updated = updateFixedAsset(recordId, clientId, norm.values || {}, !!existing.is_test_data);
        syncFixedAssetIntoLayout(clientId, updated);
        return updated;
    },
};
const PENDING_CHANGE_SANITIZERS = {
    'registro-combustible': {
        ticketEvidence: (v) => (v ? '[imagen]' : ''),
        tripKmBeforeEvidence: (v) => (v ? '[imagen]' : ''),
        tripKmAfterEvidence: (v) => (v ? '[imagen]' : ''),
    },
    'carga-combustible': {
        tripBeforeEvidence: (v) => (v ? '[imagen]' : ''),
        tripAfterEvidence: (v) => (v ? '[imagen]' : ''),
        totalCostEvidence: (v) => (v ? '[imagen]' : ''),
    },
    'alta-activos': Object.fromEntries(['evidenceFront', 'evidenceBack', 'evidenceLeft', 'evidenceRight', 'evidenceTop', 'evidenceBottom'].map((k) => [k, (v) => (v ? '[imagen]' : '')])),
};

app.get('/api/business/pending-changes', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const all = listPendingChangesForClient(req.user.clientId);
    if (req.user.isClientAdmin) return res.json({ changes: all });
    const grants = getUserEffectiveGrants(req.user.sub);
    res.json({ changes: all.filter((c) => canAuthorizeColumn(grants, c.table_key, c.field_key.split('.').pop())) });
});

app.post('/api/business/pending-changes/:id/approve', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pc = getPendingChangeById(req.params.id);
    if (!pc || pc.client_id !== req.user.clientId) return res.status(404).json({ message: 'Pending change not found.' });
    if (pc.status !== 'pending') return res.status(409).json({ message: 'This change was already resolved.' });
    const colKey = pc.field_key.split('.').pop();
    if (!req.user.isClientAdmin && pc.escalated_to_user_id !== req.user.sub) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canAuthorizeColumn(grants, pc.table_key, colKey)) {
            return res.status(403).json({ message: 'No tienes permiso para autorizar esta columna.' });
        }
    }
    const apply = PENDING_CHANGE_APPLIERS[pc.table_key];
    if (!apply) return res.status(500).json({ message: `No hay forma de aplicar cambios de la tabla "${pc.table_key}".` });
    apply(pc.record_id, pc.client_id, { [pc.column_key]: pc.new_value }, { editedBy: pc.requested_by });
    const sanitize = PENDING_CHANGE_SANITIZERS[pc.table_key]?.[pc.column_key];
    logTableChange({
        clientId: pc.client_id, tableKey: pc.table_key, recordId: pc.record_id, recordLabel: pc.record_label, action: 'update',
        fieldKey: pc.field_key,
        oldValue: sanitize ? sanitize(pc.old_value) : pc.old_value,
        newValue: sanitize ? sanitize(pc.new_value) : pc.new_value,
        changedBy: pc.requested_by, requestedBy: pc.requested_by, authorizedBy: req.user.name,
    });
    // Notificar cambio: el dato se aplicó de verdad en este momento. Quien lo pidió y quien lo autorizó ya lo saben.
    notifyDataChange({
        clientId: pc.client_id, tableKey: pc.table_key, recordLabel: pc.record_label, fieldKey: pc.field_key, oldValue: pc.old_value, newValue: pc.new_value,
        actorUserId: pc.requested_by_user_id, actorLabel: pc.requested_by, sanitize, authorizedBy: req.user.name, skipUserIds: [pc.requested_by_user_id, req.user.sub],
    });
    resolvePendingChange(pc.id, { status: 'approved', resolvedBy: req.user.name, resolvedByUserId: req.user.sub });
    res.json({ ok: true });
});

app.post('/api/business/pending-changes/:id/reject', requireAuth, (req, res) => {
    if (!req.user.clientId) return res.status(404).json({ message: 'No client for this account.' });
    const pc = getPendingChangeById(req.params.id);
    if (!pc || pc.client_id !== req.user.clientId) return res.status(404).json({ message: 'Pending change not found.' });
    if (pc.status !== 'pending') return res.status(409).json({ message: 'This change was already resolved.' });
    if (!req.user.isClientAdmin && pc.escalated_to_user_id !== req.user.sub) {
        const grants = getUserEffectiveGrants(req.user.sub);
        if (!canAuthorizeColumn(grants, pc.table_key, pc.field_key.split('.').pop())) {
            return res.status(403).json({ message: 'No tienes permiso para rechazar esta columna.' });
        }
    }
    resolvePendingChange(pc.id, { status: 'rejected', resolvedBy: req.user.name, resolvedByUserId: req.user.sub });
    res.json({ ok: true });
});

// --- Notificaciones: Alertas / Avisos / Solicitudes / Autorizar -------------
// One combined payload for the bell dropdown's 4 tabs. Autorizar mirrors
// GET /pending-changes above exactly (things others asked for that I can
// approve); Solicitudes/Avisos are the same table from the OTHER side
// (things I myself asked for — still pending, or already resolved and not
// yet opened); Alertas is access_denied_alerts (see checkAndLogFieldChanges).
// Opening a tab (the 2 mark-seen routes below) is what clears its
// contribution to the bell's badge count, not fetching this list.
app.get('/api/business/notifications', requireAuth, (req, res) => {
    if (!req.user.clientId) {
        // Cuenta del equipo SaaS: su campana trae las solicitudes de color de los dos árboles SaaS (Árbol Maestro SaaS y Árbol de Permisos Maestro) --
        // por autorizar (las que le tocan), las que ella pidió y las ya resueltas. Lo demás de la campana es de los clientes.
        if (req.user.role !== 'admin') return res.status(404).json({ message: 'No client for this account.' });
        const colors = listColorNotificationsForUser({ userId: req.user.sub, isSuperAdmin: !!req.user.isSaasSuperAdmin });
        const asNotification = (r) => ({ ...r, kind: 'color-request', seen_at: r.seenAt });
        // Avisos de cambios en los árboles ("Color actualizado", "Orden actualizado", "Aviso enviado"): mezclados con los de las solicitudes, el más nuevo primero.
        const notices = listTreeNoticesForUser(req.user.sub).map((n) => ({ ...n, seen_at: n.seenAt }));
        const avisos = [...colors.avisos.map(asNotification), ...notices].sort((a, b) => String(b.createdAt || b.decidedAt || '').localeCompare(String(a.createdAt || a.decidedAt || '')));
        return res.json({
            alertas: [],
            avisos,
            solicitudes: colors.solicitudes.map(asNotification),
            autorizar: colors.autorizar.map(asNotification),
        });
    }
    const allPending = listPendingChangesForClient(req.user.clientId);
    let autorizar = allPending;
    if (!req.user.isClientAdmin) {
        const grants = getUserEffectiveGrants(req.user.sub);
        // A Fase 3 conflict-override escalation targets ONE named person
        // (see checkAndLogFieldChanges's escalatedToUserId) regardless of
        // whether they generally hold Autorizar on that column -- included
        // here even when canAuthorizeColumn would otherwise say no.
        autorizar = allPending.filter((c) => (
            c.escalated_to_user_id === req.user.sub || canAuthorizeColumn(grants, c.table_key, c.field_key.split('.').pop())
        ));
    }
    // Catalog-value requests (see catalog_value_requests' own comment in
    // db.js) slot into these SAME 4 buckets from the requester's/holder's own
    // side, tagged kind: 'catalog-request' so the bell dropdown renders them
    // with their own row (Autorizar/Rechazar/Reenviar) instead of the plain
    // field-change one. A request "para actuar" always lands in Autorizar
    // even when I can only Reenviar it (canAuthorize decides which buttons
    // that row gets), so nothing needing action ever hides from this tab.
    const catalogToAct = listCatalogValueRequestsForHolder(req.user.clientId, req.user.sub)
        .map((r) => ({ ...mapCatalogValueRequestRecord(r), kind: 'catalog-request', canAuthorize: catalogValueRequestCanAuthorize(req, r.category_type) }));
    const catalogMineResolved = listCatalogValueRequestsBySubmitter(req.user.clientId, req.user.sub, ['approved', 'rejected'])
        .map((r) => ({ ...mapCatalogValueRequestRecord(r), kind: 'catalog-request' }));
    const catalogMinePending = listCatalogValueRequestsBySubmitter(req.user.clientId, req.user.sub, ['pending'])
        .map((r) => ({ ...mapCatalogValueRequestRecord(r), kind: 'catalog-request' }));
    // Solicitudes de orden y clasificación de Perfil y Usuario (las que me tocan decidir, las que yo pedí y las ya resueltas), en las mismas 3 pestañas.
    const layoutRequests = listColorNotificationsForUser({ userId: req.user.sub, isSuperAdmin: false });
    const asLayoutNotification = (r) => ({ ...r, kind: 'color-request', seen_at: r.seenAt });
    res.json({
        alertas: listAccessDeniedAlertsForUser(req.user.clientId, req.user.sub),
        // Los avisos de "Color actualizado" / "Orden actualizado" del Árbol de Permisos Maestro (a quien se le modificó) van aquí también.
        avisos: [...listPendingChangesRequestedBy(req.user.clientId, req.user.sub, ['approved', 'rejected']), ...catalogMineResolved, ...layoutRequests.avisos.map(asLayoutNotification), ...listTreeNoticesForUser(req.user.sub).map((n) => ({ ...n, seen_at: n.seenAt }))],
        solicitudes: [...listPendingChangesRequestedBy(req.user.clientId, req.user.sub, ['pending']), ...catalogMinePending, ...layoutRequests.solicitudes.map(asLayoutNotification)],
        autorizar: [...autorizar, ...catalogToAct, ...layoutRequests.autorizar.map(asLayoutNotification)],
    });
});

// Alguien abrió una pantalla a la que su cuenta no tiene acceso (la pantalla le mostró "No tienes acceso a esta pantalla"): se le avisa a su jefe directo y, si ese puesto
// no tiene a nadie, al siguiente hacia arriba (cuentas de un cliente: pestaña Alertas; cuentas del equipo SaaS: pestaña Avisos). Solo informa, nunca pide autorización.
app.post('/api/me/screen-access-denied', requireAuth, (req, res) => {
    const raw = req.body && req.body.screenKey;
    if (typeof raw !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(raw)) return res.status(400).json({ message: 'screenKey is required.' });
    if (req.user.clientId) {
        const actingUser = getUserById(req.user.sub, req.user.clientId);
        const actingUserLabel = `${req.user.username} - ${actingUser?.nickname || req.user.name}`;
        if (!hasRecentScreenAccessDeniedAlert(req.user.clientId, actingUserLabel, raw)) {
            createAccessDeniedAlert({
                clientId: req.user.clientId, actingUserLabel, fieldKey: '__screen__', screenKey: raw, recipientUserId: resolveDirectSupervisorUserId(req.user.sub),
            });
        }
    } else if (req.user.role === 'admin') {
        publishSaasAccessDeniedNotice({ actorUserId: req.user.sub, actorLabel: changedByLabel(req), screenKey: raw });
    }
    res.json({ ok: true });
});

app.post('/api/business/notifications/alertas/mark-seen', requireAuth, (req, res) => {
    if (!req.user.clientId) {
        // La campana SaaS no tiene alertas de acceso negado: nada que marcar.
        if (req.user.role === 'admin') return res.json({ ok: true });
        return res.status(404).json({ message: 'No client for this account.' });
    }
    markAccessDeniedAlertsSeen(req.user.clientId, req.user.sub);
    res.json({ ok: true });
});

app.post('/api/business/notifications/avisos/mark-seen', requireAuth, (req, res) => {
    if (!req.user.clientId) {
        if (req.user.role !== 'admin') return res.status(404).json({ message: 'No client for this account.' });
        markColorRequestsSeen(req.user.sub);
        markTreeNoticesSeen(req.user.sub);
        return res.json({ ok: true });
    }
    markPendingChangesSeenForRequester(req.user.clientId, req.user.sub);
    markColorRequestsSeen(req.user.sub);
    markTreeNoticesSeen(req.user.sub);
    res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SGN app listening on port ${PORT}`));
