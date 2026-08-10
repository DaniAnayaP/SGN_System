/**
 * Password hashing utilities using Node's built-in crypto.scrypt.
 * No external/native dependency needed for this part.
 *
 * Async, not scryptSync: scrypt is deliberately CPU-heavy (that's what makes
 * it a good password hash), and the sync version blocks Node's single
 * event loop for its entire duration — every OTHER request (including a
 * different user's unrelated page load) stalls behind it. Under any real
 * concurrent login traffic this serializes logins one at a time and makes
 * the whole app briefly unresponsive on each one. The async version still
 * uses the same CPU time, but yields the event loop while doing it.
 */

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, 64)).toString('hex');
    return `${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
    if (!stored || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const candidateHash = await scrypt(password, salt, 64);
    const storedHash = Buffer.from(hash, 'hex');
    // timingSafeEqual requires equal-length buffers, and also guards against
    // a malformed/missing hash reaching it.
    if (candidateHash.length !== storedHash.length) return false;
    return crypto.timingSafeEqual(candidateHash, storedHash);
}

// Sync on purpose, unlike hashPassword above — CommonJS has no top-level
// await, and this exists only for db.js's one-time demo-user seed, which
// runs during module load (before the server starts listening, so there's
// no concurrent request traffic yet to block). Never call this from a route
// handler or anything else that runs after the server is accepting requests.
function hashPasswordSync(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

module.exports = { hashPassword, verifyPassword, hashPasswordSync };
