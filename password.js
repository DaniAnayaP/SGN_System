/**
 * Password hashing utilities using Node's built-in crypto.scrypt.
 * No external/native dependency needed for this part.
 */

const crypto = require('crypto');

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    if (!stored || !stored.includes(':')) return false;
    const [salt, hash] = stored.split(':');
    const candidateHash = crypto.scryptSync(password, salt, 64);
    const storedHash = Buffer.from(hash, 'hex');
    // timingSafeEqual requires equal-length buffers, and also guards against
    // a malformed/missing hash reaching it.
    if (candidateHash.length !== storedHash.length) return false;
    return crypto.timingSafeEqual(candidateHash, storedHash);
}

module.exports = { hashPassword, verifyPassword };
