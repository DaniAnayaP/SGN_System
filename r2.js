// ---------------------------------------------------------------------------
// Cloudflare R2 client — S3-compatible, so the same @aws-sdk/client-s3 talks
// to it directly, just pointed at R2's own endpoint instead of AWS's. The
// bucket stays private; nothing here ever exposes a public URL, only
// short-lived signed ones (see getUploadUrl/getDownloadUrl below), so moving
// to real S3 later (or back) is a config change, never a code change.
//
// Requires 4 env vars the user sets in Railway (see the plan's "Paso 0"):
// R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.
// Deliberately lazy (client built on first real use, not at require time) so
// the rest of the server still boots and every unrelated route still works
// even before those variables are set — only evidence upload/download fail,
// with a clear error, until Paso 0 is done.
// ---------------------------------------------------------------------------
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const SIGNED_URL_TTL_SECONDS = 300;

let client = null;
function getClient() {
    if (client) return client;
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
        throw new Error('R2 is not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.');
    }
    client = new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
        // Recent SDK versions add an x-amz-checksum-* param to every
        // presigned URL by default -- R2 doesn't handle that flow and
        // fails the browser's CORS preflight with a 503 before the PUT
        // ever runs. Not needed here anyway (R2 does its own integrity
        // check on write); this is the documented fix.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        // Same issue, other direction: GetObjectCommand's presigned URL
        // gets its own default checksum param (x-amz-checksum-mode=ENABLED)
        // that R2 also 503s on -- caught live testing Material Apoyo's
        // download button (the exact request failed with a real signed
        // R2 GET returning 503). Nuestros Respaldos' download shares this
        // same client, so it was silently broken too until this fix.
        responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return client;
}

function bucketName() {
    const name = process.env.R2_BUCKET_NAME;
    if (!name) throw new Error('R2 is not configured — set R2_BUCKET_NAME.');
    return name;
}

// Browser PUTs the file body directly to the URL this returns — the file
// bytes never pass through this Node server at all.
async function getUploadUrl(key, contentType) {
    const command = new PutObjectCommand({ Bucket: bucketName(), Key: key, ContentType: contentType });
    return getSignedUrl(getClient(), command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}

// responseContentDisposition lets a caller force the browser's "Save As"
// filename to the human display name (see evidenceNaming.js) even though
// the object's own key in the bucket is the plain, stable technical one.
async function getDownloadUrl(key, downloadFilename) {
    const command = new GetObjectCommand({
        Bucket: bucketName(),
        Key: key,
        ...(downloadFilename ? { ResponseContentDisposition: `attachment; filename="${downloadFilename}"` } : {}),
    });
    return getSignedUrl(getClient(), command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}

// Server-side upload, used only by the one-time migration script (Fase 3) —
// everything going forward uploads directly from the browser via
// getUploadUrl above, never through this function.
async function putObject(key, body, contentType) {
    const command = new PutObjectCommand({ Bucket: bucketName(), Key: key, Body: body, ContentType: contentType });
    await getClient().send(command);
}

// Used by Material Apoyo's Eliminar action — best-effort by design (the
// caller deletes the DB row regardless of whether the R2 object was still
// there to remove).
async function deleteObject(key) {
    const command = new DeleteObjectCommand({ Bucket: bucketName(), Key: key });
    await getClient().send(command);
}

// ¿Están puestas las 4 variables de R2? Para saber si hay archivos que contar o borrar, sin lanzar el error de getClient().
function isConfigured() {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
    return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);
}

// Todas las llaves que empiezan con `prefix` (pagina de 1000 en 1000). Lo usa el Reinicio del Sistema para contar y borrar los archivos
// de los clientes.
async function listKeys(prefix) {
    const keys = [];
    let token;
    do {
        const out = await getClient().send(new ListObjectsV2Command({ Bucket: bucketName(), Prefix: prefix, ContinuationToken: token }));
        (out.Contents || []).forEach((o) => keys.push(o.Key));
        token = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (token);
    return keys;
}

// Borra las llaves dadas (hasta 1000 por llamada). Devuelve cuántas se pidió borrar; si R2 rechaza alguna, lanza el error con el detalle.
async function deleteKeys(keys) {
    let requested = 0;
    for (let i = 0; i < keys.length; i += 1000) {
        const chunk = keys.slice(i, i + 1000);
        const out = await getClient().send(new DeleteObjectsCommand({ Bucket: bucketName(), Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
        if (out.Errors && out.Errors.length) throw new Error(`R2 no pudo borrar ${out.Errors.length} archivos: ${out.Errors[0].Message}`);
        requested += chunk.length;
    }
    return requested;
}

module.exports = { getUploadUrl, getDownloadUrl, putObject, deleteObject, isConfigured, listKeys, deleteKeys };
