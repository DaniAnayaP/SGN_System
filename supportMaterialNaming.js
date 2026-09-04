// ---------------------------------------------------------------------------
// Storage key for Material Apoyo uploads (Funcionalidad Pantallas / Flujo
// Sistema / Nuestros Procesos) — a document library, not evidence tied to a
// business record, so unlike evidenceNaming.js's deterministic per-record
// key there's nothing to derive a stable key FROM: each upload gets a fresh
// random key. The name shown to the user/downloaded is just title (or the
// original filename if no title was given) — no rigid folio-based format,
// since this is freely-authored material (manuals, diagrams), not
// auto-captured evidence.
// ---------------------------------------------------------------------------
const crypto = require('crypto');

const MIME_EXT = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};
function extFromContentType(contentType) {
    return MIME_EXT[String(contentType || '').toLowerCase()] || 'bin';
}

function buildSupportMaterialStorageKey({ clientId, department, area, category, contentType }) {
    const ext = extFromContentType(contentType);
    return `material-apoyo/${clientId}/${department}/${area}/${category}/${crypto.randomUUID()}.${ext}`;
}

module.exports = { buildSupportMaterialStorageKey, extFromContentType };
