// ---------------------------------------------------------------------------
// Shared naming for every evidence file (photo/document) that moves through
// object storage — see the "Nuestros Respaldos" plan. Two names, two jobs:
//
//   - Storage key: internal, stable, never shown to a person. Built once at
//     upload time and never recomputed, so migrating old base64 rows or
//     changing the display format later never requires renaming anything
//     already sitting in the bucket.
//   - Display name: rebuilt on every read from the record's own current
//     data (company nickname, screen, field, date, folio) — never stored,
//     so the format can change at any time with zero migration.
//
// Used by server.js (upload/download routes) and db.js (listClientEvidenceFiles)
// only — the browser never needs its own copy, since every screen that shows
// an evidence file gets the already-built display name straight from the API.
// ---------------------------------------------------------------------------

// Filesystem/URL-safe: strips accents, then anything that isn't a letter or
// digit. Deliberately aggressive (no spaces, hyphens, or underscores kept
// from the source text) so every OS and every browser's "Save As" dialog
// treats the result the same way, and so the underscore stays reserved as
// OUR OWN separator between the name's 5 segments below.
function normalizeForFilename(text) {
    const stripped = String(text || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '');
    return stripped || 'SinDato';
}

// One label per screen/field this file could come from — kept here (not
// re-derived from labelKey strings) so the display name stays stable even
// if an i18n label's wording changes later.
const SCREEN_LABELS = {
    'registro-combustible': 'RegistroCombustible',
    'carga-combustible': 'CargaCombustible',
    'nuestros-articulos': 'AltaNuestrosArticulos',
};
const FIELD_LABELS = {
    ticketEvidence: 'TicketEvidencia',
    tripKmBeforeEvidence: 'TripAntesEvidencia',
    tripKmAfterEvidence: 'TripDespuesEvidencia',
    tripBeforeEvidence: 'TripAntesEvidencia',
    tripAfterEvidence: 'TripDespuesEvidencia',
    totalCostEvidence: 'CostoTotalEvidencia',
    evidenceFront: 'Enfrente',
    evidenceBack: 'Atras',
    evidenceLeft: 'Izquierda',
    evidenceRight: 'Derecha',
    evidenceTop: 'Arriba',
    evidenceBottom: 'Abajo',
};

// evidence/{clientId}/{tableKey}/{recordId}-{fieldKey}.{ext} -- deterministic
// from IDs alone, so re-running the migration script twice on the same row
// overwrites the same object instead of leaving orphaned duplicates behind.
function buildEvidenceStorageKey({ clientId, tableKey, recordId, fieldKey, ext }) {
    return `evidence/${clientId}/${tableKey}/${recordId}-${fieldKey}.${ext || 'bin'}`;
}

// {ApodoEmpresa}_{Pantalla}_{TipoEvidencia}_{FechaRegistro}_{Folio}.{ext}
function buildEvidenceDisplayName({ companyNickname, tableKey, fieldKey, recordDate, folio, ext }) {
    const parts = [
        normalizeForFilename(companyNickname),
        SCREEN_LABELS[tableKey] || normalizeForFilename(tableKey),
        FIELD_LABELS[fieldKey] || normalizeForFilename(fieldKey),
        (recordDate || '').slice(0, 10) || 'sin-fecha',
        normalizeForFilename(folio),
    ];
    return `${parts.join('_')}.${ext || 'jpg'}`;
}

// Detects the real extension from a data: URL's own MIME type (migration
// path) -- never assumed, since a ticket photo could be a PNG screenshot
// just as easily as a JPEG camera shot.
const MIME_EXT = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif',
    'application/pdf': 'pdf',
};
function extFromDataUrl(dataUrl) {
    const match = /^data:([^;,]+)[;,]/.exec(String(dataUrl || ''));
    return (match && MIME_EXT[match[1].toLowerCase()]) || 'jpg';
}
function extFromContentType(contentType) {
    return MIME_EXT[String(contentType || '').toLowerCase()] || 'jpg';
}

module.exports = {
    normalizeForFilename,
    buildEvidenceStorageKey,
    buildEvidenceDisplayName,
    extFromDataUrl,
    extFromContentType,
    SCREEN_LABELS,
    FIELD_LABELS,
};
