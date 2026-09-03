// ---------------------------------------------------------------------------
// Offline-first save queue for the App -- Fase 1 (guardado local + cola
// básica, sin detección de choques todavía -- ver Fase 3). Loaded by every
// App*.html page. When a PATCH/POST genuinely can't reach the server (a
// real network failure -- Carlos in the back of the warehouse with zero
// signal, NOT a 4xx/5xx the server actually returned), the request is
// saved to this device's own IndexedDB instead of being lost, and replayed
// in the same order once connectivity comes back -- automatically (the
// browser's 'online' event) and on a 30s fallback timer, since 'online'
// isn't reliable on every mobile browser.
//
// A queued request is optimistic: the caller applies the change to its own
// local view immediately (same as if the server had already confirmed it)
// and shows it as "en tu celular" -- see AppCargaCombustible.js's own
// patchRecord for the reference integration. Every other App screen still
// needs the same treatment; this file only provides the shared engine.
// ---------------------------------------------------------------------------

const OFFLINE_DB_NAME = 'sgn-offline-queue';
const OFFLINE_STORE_NAME = 'requests';

function openOfflineDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(OFFLINE_DB_NAME, 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(OFFLINE_STORE_NAME)) {
                db.createObjectStore(OFFLINE_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// The native Android app (mobile-app/) opens this HTML/JS from a bundled
// local origin, not from the real server -- a bare relative '/api/...' URL
// resolves against THAT local origin instead (see AppConfig.js's own header
// comment). Every call site below passes a plain relative path, same as
// every other App*.js file's own offlineAwareFetch calls -- this wraps it
// once, here, so the fix covers all of them instead of needing the same
// window.apiUrl() call repeated at every existing (and future) call site.
// Idempotent: safe to call again on a URL some already-queued item stored
// before this fix existed (or one that's already absolute for any reason).
function resolveApiUrl(url) {
    if (!url || /^https?:\/\//i.test(url)) return url;
    return window.apiUrl ? window.apiUrl(url) : url;
}

// `evidence`, when present, marks this entry as a two-phase evidence upload
// (compress -> presigned URL -> PUT to R2 -> PATCH the key) instead of a
// plain single fetch -- see queueOfflineEvidence and flushOfflineQueue below.
function queueOfflineRequest({ url, method, body, description, recordKey, baseline, evidence }) {
    return openOfflineDb().then((db) => new Promise((resolve, reject) => {
        const store = db.transaction(OFFLINE_STORE_NAME, 'readwrite').objectStore(OFFLINE_STORE_NAME);
        const entry = {
            url: url ? resolveApiUrl(url) : null, method: method || null, body: body || null,
            description, recordKey: recordKey || null, baseline: baseline || null,
            evidence: evidence || null, queuedAt: new Date().toISOString(),
        };
        const addReq = store.add(entry);
        addReq.onsuccess = () => resolve({ ...entry, id: addReq.result });
        addReq.onerror = () => reject(addReq.error);
    }));
}

// Downscales to at most `maxDim` on the longest side and re-encodes as JPEG
// at `quality` -- a phone photo straight from the camera is routinely 3-5
// MB; this is what actually solves the storage problem (GEIPSA alone
// captures up to 110 evidence photos per trip), on top of moving off base64
// entirely. Duplicated from Dashboard.js's own compressImageToBlob rather
// than shared: the App bundles its own separate, smaller set of files (see
// mobile-app/sync-web-assets.js) and never loads Dashboard.js at all.
async function compressImageToBlob(file, maxDim = 1280, quality = 0.7) {
    if (!file.type || !file.type.startsWith('image/')) return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob || file;
}

// Asks the server for a presigned PUT URL (server checks the caller can
// actually edit this field, same canEditField-equivalent gate as every
// other PATCH), then PUTs directly to R2 -- the file bytes never pass
// through this Node server. Returns the short storage key to PATCH onto the
// record. Throws on ANY failure (no network, 403 not authorized, 503 R2 not
// configured yet) -- the caller decides whether that means "queue it for
// later" (see queueOfflineEvidence) or "show a real error".
async function uploadEvidenceNow({ tableKey, recordId, fieldKey }, blob, contentType) {
    const res = await fetch(resolveApiUrl('/api/business/evidence-upload-url'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableKey, recordId, fieldKey, contentType }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.message || 'evidence-upload-url failed');
        err.status = res.status;
        throw err;
    }
    const { uploadUrl, key } = await res.json();
    const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: blob });
    if (!putRes.ok) throw new Error('R2 upload failed');
    return key;
}

// The offline-fallback counterpart of uploadEvidenceNow above: stores the
// already-compressed Blob itself in IndexedDB (structured clone handles
// Blob natively, no base64 round-trip needed) instead of the request body,
// so a signal-dead capture in the field still ends up in R2 once the queue
// flushes -- never persisted as base64 in SQLite, online or offline.
function queueOfflineEvidence({ tableKey, recordId, fieldKey, blob, contentType, patchUrl, description, recordKey }) {
    return queueOfflineRequest({
        description, recordKey,
        evidence: { tableKey, recordId, fieldKey, blob, contentType, patchUrl: resolveApiUrl(patchUrl) },
    });
}

function listOfflineQueue() {
    return openOfflineDb().then((db) => new Promise((resolve, reject) => {
        const req = db.transaction(OFFLINE_STORE_NAME, 'readonly').objectStore(OFFLINE_STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }));
}

function removeOfflineRequest(id) {
    return openOfflineDb().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(OFFLINE_STORE_NAME, 'readwrite');
        tx.objectStore(OFFLINE_STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}

// How many queued entries exist for this specific record right now -- lets
// a screen show "2 cambios pendientes" on a given row without pulling the
// whole queue apart itself.
function countOfflineQueueForRecord(recordKey) {
    return listOfflineQueue().then((items) => items.filter((i) => i.recordKey === recordKey).length);
}

// Wraps one PATCH/POST attempt. Tries the real network call first; only
// queues it when the request never reached the server at all (fetch()
// throwing -- offline, DNS failure, timeout). A real response from the
// server, even a 4xx/5xx, is returned as-is and NEVER queued -- that's a
// genuine rejection (e.g. "Usted no está habilitado..."), not a
// connectivity problem, and queueing it would just hide the real error
// until it fails again on replay.
async function offlineAwareFetch(url, options, description, recordKey, baseline) {
    const resolvedUrl = resolveApiUrl(url);
    try {
        const res = await fetch(resolvedUrl, options);
        return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})), queued: false };
    } catch {
        await queueOfflineRequest({ url: resolvedUrl, method: options.method || 'GET', body: options.body || null, description, recordKey, baseline });
        document.dispatchEvent(new CustomEvent('sgn:offline-queue-changed'));
        return { ok: true, status: 0, body: {}, queued: true };
    }
}

// t()/confirm() come from whichever App screen loaded this file (every
// App*.js declares its own top-level function t(...), which attaches to
// window same as any other top-level function) -- this file never knows
// which screen is running, so it falls back to a plain literal if neither
// exists yet (shouldn't happen in practice: flushOfflineQueue only ever
// actually runs after the screen's own script has finished loading).
function offlineT(key, params) {
    return window.t ? window.t(key, params) : key;
}

// A conflict means someone else genuinely changed this field for real
// while this device had nothing but a local, unconfirmed edit sitting in
// the queue -- ask before silently clobbering their change. Native
// confirm() is a deliberate Fase 3 v1 simplification (a proper in-app
// dialog is a fast follow-up, not a blocker for the underlying mechanism).
function confirmOfflineOverride(conflict) {
    return window.confirm(offlineT('home.offlineConflictConfirm', {
        changedBy: conflict.changedBy || '—',
        field: offlineT(conflict.fieldKey),
    }));
}

let flushInFlight = false;
async function flushOfflineQueue() {
    if (!navigator.onLine || flushInFlight) return;
    flushInFlight = true;
    try {
        const items = await listOfflineQueue();
        for (const item of items) {
            try {
                if (item.evidence) {
                    // Two-phase: upload the already-compressed blob to R2
                    // first, then PATCH the record with the key it gets
                    // back. Re-running the upload on a retry (the PATCH
                    // below failed last time but the upload itself already
                    // succeeded) just overwrites the same deterministic R2
                    // key with identical bytes -- harmless, not a duplicate.
                    const { tableKey, recordId, fieldKey, blob, contentType, patchUrl } = item.evidence;
                    const key = await uploadEvidenceNow({ tableKey, recordId, fieldKey }, blob, contentType);
                    const patchRes = await fetch(resolveApiUrl(patchUrl), {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ [fieldKey]: key }),
                    });
                    if (!patchRes.ok) break; // real rejection or still flaky -- keep queue order, retry next time
                    await removeOfflineRequest(item.id);
                    continue;
                }
                const bodyObj = item.body ? JSON.parse(item.body) : {};
                if (item.baseline) bodyObj.baseline = item.baseline;
                const res = await fetch(resolveApiUrl(item.url), {
                    method: item.method,
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(bodyObj),
                });
                const resBody = await res.json().catch(() => ({}));
                if (!res.ok) {
                    // A real rejection surfaced only now that we could
                    // reach the server -- stop here (keep queue order),
                    // rather than silently dropping it; whoever reopens
                    // the record will see the server's real state.
                    break;
                }
                if (resBody.conflictFields?.length) {
                    const overrideKeys = resBody.conflictFields.filter(confirmOfflineOverride).map((c) => c.key);
                    // Fields the user declined to override are simply
                    // dropped -- the newer value on the server wins for
                    // those, which is what "no, don't apply it" means.
                    if (overrideKeys.length) {
                        // Resend just the conflicted fields the user confirmed,
                        // no baseline this time -- checkAndLogFieldChanges
                        // treats an overrideConflicts key as a normal edit of
                        // an existing value from here on (see server.js). If
                        // THIS request itself can't reach the server (signal
                        // dropped again mid-flush), leave the original item
                        // queued so the whole thing retries next time rather
                        // than silently losing the override the user just
                        // confirmed.
                        const overridePatch = {};
                        overrideKeys.forEach((k) => { overridePatch[k] = bodyObj[k]; });
                        const overrideRes = await fetch(resolveApiUrl(item.url), {
                            method: item.method,
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ ...overridePatch, overrideConflicts: overrideKeys }),
                        });
                        if (!overrideRes.ok) break;
                    }
                }
                await removeOfflineRequest(item.id);
            } catch {
                break; // still offline/flaky -- retry on the next trigger
            }
        }
    } finally {
        flushInFlight = false;
        document.dispatchEvent(new CustomEvent('sgn:offline-queue-changed'));
    }
}

window.addEventListener('online', flushOfflineQueue);
document.addEventListener('DOMContentLoaded', flushOfflineQueue);
setInterval(flushOfflineQueue, 30000);

window.SgnOfflineSync = {
    offlineAwareFetch,
    listOfflineQueue,
    countOfflineQueueForRecord,
    flushOfflineQueue,
    compressImageToBlob,
    uploadEvidenceNow,
    queueOfflineEvidence,
};
