'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.LT_HASH_ANTI_TAMPERING = void 0;
const crypto_1 = require('./crypto');
const LTHASH_INFO = 'WhatsApp Patch Integrity';
const LTHASH_SIZE = 128;
const expand = element => (0, crypto_1.hkdf)(element, LTHASH_SIZE, { info: LTHASH_INFO });
const applyDelta = (result, element, sign) => {
    const expanded = expand(element);
    for (let i = 0; i < LTHASH_SIZE; i += 2) {
        const lane = result.readUInt16LE(i);
        const delta = expanded.readUInt16LE(i);
        result.writeUInt16LE((lane + sign * delta) & 0xffff, i);
    }
};
exports.LT_HASH_ANTI_TAMPERING = {
    subtractThenAdd: (base, subtract = [], add = []) => {
        const result = Buffer.from(base);
        for (const element of subtract)
            applyDelta(result, element, -1);
        for (const element of add)
            applyDelta(result, element, 1);
        return result;
    }
};
