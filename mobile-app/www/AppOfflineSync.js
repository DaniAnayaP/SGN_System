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

function queueOfflineRequest({ url, method, body, description, recordKey, baseline }) {
    return openOfflineDb().then((db) => new Promise((resolve, reject) => {
        const store = db.transaction(OFFLINE_STORE_NAME, 'readwrite').objectStore(OFFLINE_STORE_NAME);
        const entry = { url, method, body, description, recordKey: recordKey || null, baseline: baseline || null, queuedAt: new Date().toISOString() };
        const addReq = store.add(entry);
        addReq.onsuccess = () => resolve({ ...entry, id: addReq.result });
        addReq.onerror = () => reject(addReq.error);
    }));
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
    try {
        const res = await fetch(url, options);
        return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})), queued: false };
    } catch {
        await queueOfflineRequest({ url, method: options.method || 'GET', body: options.body || null, description, recordKey, baseline });
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
                const bodyObj = item.body ? JSON.parse(item.body) : {};
                if (item.baseline) bodyObj.baseline = item.baseline;
                const res = await fetch(item.url, {
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
                        const overrideRes = await fetch(item.url, {
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
};
