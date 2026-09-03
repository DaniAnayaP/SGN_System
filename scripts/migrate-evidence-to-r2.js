// ---------------------------------------------------------------------------
// One-time migration: every evidence column that still holds a raw base64
// `data:` URL gets uploaded to R2 and the column rewritten to the short
// storage key instead. Safe to re-run any number of times -- a column that
// already holds a key (not a `data:` URL) is left untouched, so a partial
// or interrupted run just picks up where it left off.
//
// Usage:
//   node scripts/migrate-evidence-to-r2.js --dry-run   (counts + sizes only, uploads nothing)
//   node scripts/migrate-evidence-to-r2.js              (uploads for real)
//
// Requires R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY /
// R2_BUCKET_NAME set in the environment (see r2.js) -- run this from the
// same environment (Railway) where those are set, against the same
// database the running server uses.
// ---------------------------------------------------------------------------

const { db, EVIDENCE_FIELD_SOURCES, setEvidenceValue } = require('../db');
const { buildEvidenceStorageKey, extFromDataUrl } = require('../evidenceNaming');
const { putObject } = require('../r2');

const DRY_RUN = process.argv.includes('--dry-run');

function mimeFromDataUrl(dataUrl) {
    const match = /^data:([^;,]+)[;,]/.exec(String(dataUrl || ''));
    return match ? match[1] : 'application/octet-stream';
}

async function migrateField(tableKey, table, column, fieldKey) {
    const rows = db.prepare(
        `SELECT id, client_id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`
    ).all();

    let count = 0;
    let bytes = 0;
    for (const row of rows) {
        if (!String(row.value).startsWith('data:')) continue;
        count += 1;
        const base64 = String(row.value).split(',')[1] || '';
        bytes += Math.floor((base64.length * 3) / 4);

        if (DRY_RUN) continue;

        const ext = extFromDataUrl(row.value);
        const contentType = mimeFromDataUrl(row.value);
        const key = buildEvidenceStorageKey({ clientId: row.client_id, tableKey, recordId: row.id, fieldKey, ext });
        const buffer = Buffer.from(base64, 'base64');
        await putObject(key, buffer, contentType);
        setEvidenceValue(row.client_id, tableKey, row.id, fieldKey, key);
        console.log(`  uploaded ${table}.${column} id=${row.id} -> ${key} (${buffer.length} bytes)`);
    }
    return { count, bytes };
}

async function main() {
    console.log(DRY_RUN ? 'Dry run -- counting only, nothing will be uploaded.\n' : 'Migrating evidence files to R2...\n');

    let totalCount = 0;
    let totalBytes = 0;
    for (const { tableKey, table, fields } of EVIDENCE_FIELD_SOURCES) {
        for (const { column, fieldKey } of fields) {
            const { count, bytes } = await migrateField(tableKey, table, column, fieldKey);
            if (count > 0) {
                console.log(`${table}.${column}: ${count} file(s), ~${(bytes / 1024 / 1024).toFixed(2)} MB`);
            }
            totalCount += count;
            totalBytes += bytes;
        }
    }

    console.log(`\nTotal: ${totalCount} file(s), ~${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
    if (DRY_RUN) console.log('Dry run complete -- nothing was uploaded or changed. Run without --dry-run to migrate for real.');
    else console.log('Migration complete.');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
