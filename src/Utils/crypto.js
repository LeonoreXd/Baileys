'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.signedKeyPair = exports.Curve = exports.generateSignalPubKey = exports.hkdf = exports.md5 = void 0;
exports.aesEncryptGCM = aesEncryptGCM;
exports.aesDecryptGCM = aesDecryptGCM;
exports.aesEncryptCTR = aesEncryptCTR;
exports.aesDecryptCTR = aesDecryptCTR;
exports.aesDecrypt = aesDecrypt;
exports.aesDecryptWithIV = aesDecryptWithIV;
exports.aesEncrypt = aesEncrypt;
exports.aesEncrypWithIV = aesEncrypWithIV;
exports.hmacSign = hmacSign;
exports.sha256 = sha256;
exports.derivePairingCodeKey = derivePairingCodeKey;
const { subtle } = globalThis.crypto;
const Defaults_1 = require('../Defaults');
const nodeCrypto = require('crypto');
const md5 = buffer => nodeCrypto.createHash('md5').update(buffer).digest();
Object.defineProperty(exports, 'md5', { enumerable: true, get: () => md5 });
const hkdfExtractJS = (salt, ikm) => nodeCrypto.createHmac('sha256', salt).update(ikm).digest();
const hkdfExpandJS = (prk, length, info) => {
    const hashLen = 32;
    const n = Math.ceil(length / hashLen);
    let t = Buffer.alloc(0);
    let okm = Buffer.alloc(0);
    for (let i = 1; i <= n; i++) {
        t = nodeCrypto
            .createHmac('sha256', prk)
            .update(Buffer.concat([t, info, Buffer.from([i])]))
            .digest();
        okm = Buffer.concat([okm, t]);
    }
    return okm.subarray(0, length);
};
const hkdf = (ikm, length, options = {}) => {
    const ikmBuf = Buffer.isBuffer(ikm) ? ikm : Buffer.from(ikm);
    const saltBuf = options.salt
        ? Buffer.isBuffer(options.salt)
            ? options.salt
            : Buffer.from(options.salt)
        : Buffer.alloc(32);
    const infoBuf = options.info
        ? Buffer.isBuffer(options.info)
            ? options.info
            : Buffer.from(options.info)
        : Buffer.alloc(0);
    const prk = hkdfExtractJS(saltBuf, ikmBuf);
    return hkdfExpandJS(prk, length, infoBuf);
};
Object.defineProperty(exports, 'hkdf', { enumerable: true, get: () => hkdf });
const generateSignalPubKey = pubKey => pubKey.length === 33 ? pubKey : Buffer.concat([Defaults_1.KEY_BUNDLE_TYPE, pubKey]);
exports.generateSignalPubKey = generateSignalPubKey;
const curve25519JS = require('./curve25519-js');
exports.Curve = {
    generateKeyPair: () => curve25519JS.generateKeyPairJS(),
    sharedKey: (privateKey, publicKey) => curve25519JS.sharedKeyJS(privateKey, publicKey),
    sign: (privateKey, buf) => curve25519JS.signJS(privateKey, buf),
    verify: (pubKey, message, signature) => curve25519JS.verifyJS(pubKey, message, signature)
};
const signedKeyPair = (identityKeyPair, keyId) => {
    const preKey = exports.Curve.generateKeyPair();
    const pubKey = generateSignalPubKey(preKey.public);
    const signature = exports.Curve.sign(identityKeyPair.private, pubKey);
    return { keyPair: preKey, signature, keyId };
};
exports.signedKeyPair = signedKeyPair;
function aesEncryptGCM(plaintext, key, iv, additionalData) {
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
    if (additionalData)
        cipher.setAAD(additionalData);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([encrypted, cipher.getAuthTag()]);
}
function aesDecryptGCM(ciphertext, key, iv, additionalData) {
    const authTag = ciphertext.subarray(ciphertext.length - 16);
    const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv);
    if (additionalData)
        decipher.setAAD(additionalData);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
function aesEncryptCTR(plaintext, key, iv) {
    const cipher = nodeCrypto.createCipheriv('aes-256-ctr', key, iv);
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}
function aesDecryptCTR(ciphertext, key, iv) {
    const decipher = nodeCrypto.createDecipheriv('aes-256-ctr', key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
function aesDecrypt(buffer, key) {
    return aesDecryptWithIV(buffer, key, Buffer.alloc(16));
}
function aesEncrypt(buffer, key) {
    return aesEncrypWithIV(buffer, key, Buffer.alloc(16));
}
function aesDecryptWithIV(buffer, key, IV) {
    const decipher = nodeCrypto.createDecipheriv('aes-256-cbc', key, IV);
    return Buffer.concat([decipher.update(buffer), decipher.final()]);
}
function aesEncrypWithIV(buffer, key, IV) {
    const cipher = nodeCrypto.createCipheriv('aes-256-cbc', key, IV);
    return Buffer.concat([cipher.update(buffer), cipher.final()]);
}
function hmacSign(buffer, key, variant = 'sha256') {
    return nodeCrypto.createHmac(variant, key).update(buffer).digest();
}
function sha256(buffer) {
    return nodeCrypto.createHash('sha256').update(buffer).digest();
}
async function derivePairingCodeKey(pairingCode, salt) {
    const encoder = new TextEncoder();
    const pairingCodeBuffer = encoder.encode(pairingCode);
    const saltBuffer = new Uint8Array(salt instanceof Uint8Array ? salt : new Uint8Array(salt));
    const keyMaterial = await subtle.importKey('raw', pairingCodeBuffer, { name: 'PBKDF2' }, false, ['deriveBits']);
    const derivedBits = await subtle.deriveBits({ name: 'PBKDF2', salt: saltBuffer, iterations: 2 << 16, hash: 'SHA-256' }, keyMaterial, 256);
    return Buffer.from(derivedBits);
}
