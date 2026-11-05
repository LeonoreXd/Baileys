'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.SenderMessageKey = void 0;
const Crypto_1 = require('../../Utils/crypto');
class SenderMessageKey {
    constructor(iteration, seed) {
        const derived = Buffer.from(Crypto_1.hkdf(seed, 96, { salt: Buffer.alloc(32), info: 'WhisperGroup' }));
        const keys = new Uint8Array(32);
        keys.set(new Uint8Array(derived.slice(16, 32)));
        keys.set(new Uint8Array(derived.slice(32, 48)), 16);
        this.iv = Buffer.from(derived.slice(0, 16));
        this.cipherKey = Buffer.from(keys.buffer);
        this.iteration = iteration;
        this.seed = seed;
    }
    getIteration() {
        return this.iteration;
    }
    getIv() {
        return this.iv;
    }
    getCipherKey() {
        return this.cipherKey;
    }
    getSeed() {
        return this.seed;
    }
}
exports.SenderMessageKey = SenderMessageKey;
