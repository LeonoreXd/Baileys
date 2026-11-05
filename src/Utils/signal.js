'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.getNextPreKeysNode =
    exports.getNextPreKeys =
        exports.extractDeviceJids =
            exports.parseAndInjectE2ESessions =
                exports.extractE2ESessionFromRetryReceipt =
                    exports.xmppPreKey =
                        exports.xmppSignedPreKey =
                            exports.generateOrGetPreKeys =
                                exports.getPreKeys =
                                    exports.createSignalIdentity =
                                        void 0;
const Defaults_1 = require('../Defaults');
const WABinary_1 = require('../WABinary');
const crypto_1 = require('./crypto');
const generics_1 = require('./generics');
function chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}
const createSignalIdentity = (wid, accountSignatureKey) => {
    return {
        identifier: { name: wid, deviceId: 0 },
        identifierKey: (0, crypto_1.generateSignalPubKey)(accountSignatureKey)
    };
};
exports.createSignalIdentity = createSignalIdentity;
const getPreKeys = async ({ get }, min, limit) => {
    const idList = [];
    for (let id = min; id < limit; id++) {
        idList.push(id.toString());
    }
    return get('pre-key', idList);
};
exports.getPreKeys = getPreKeys;
const generateOrGetPreKeys = (creds, range) => {
    const avaliable = creds.nextPreKeyId - creds.firstUnuploadedPreKeyId;
    const remaining = range - avaliable;
    const lastPreKeyId = creds.nextPreKeyId + remaining - 1;
    const newPreKeys = {};
    if (remaining > 0) {
        for (let i = creds.nextPreKeyId; i <= lastPreKeyId; i++) {
            newPreKeys[i] = crypto_1.Curve.generateKeyPair();
        }
    }
    return {
        newPreKeys,
        lastPreKeyId,
        preKeysRange: [creds.firstUnuploadedPreKeyId, range]
    };
};
exports.generateOrGetPreKeys = generateOrGetPreKeys;
const xmppSignedPreKey = key => ({
    tag: 'skey',
    attrs: {},
    content: [
        { tag: 'id', attrs: {}, content: (0, generics_1.encodeBigEndian)(key.keyId, 3) },
        { tag: 'value', attrs: {}, content: key.keyPair.public },
        { tag: 'signature', attrs: {}, content: key.signature }
    ]
});
exports.xmppSignedPreKey = xmppSignedPreKey;
const xmppPreKey = (pair, id) => ({
    tag: 'key',
    attrs: {},
    content: [
        { tag: 'id', attrs: {}, content: (0, generics_1.encodeBigEndian)(id, 3) },
        { tag: 'value', attrs: {}, content: pair.public }
    ]
});
exports.xmppPreKey = xmppPreKey;
const isValidUInt = n => typeof n === 'number' && Number.isInteger(n);
const extractE2ESessionFromRetryReceipt = receipt => {
    const keysNode = (0, WABinary_1.getBinaryNodeChild)(receipt, 'keys');
    if (!keysNode)
        return null;
    const typeBuf = (0, WABinary_1.getBinaryNodeChildBuffer)(keysNode, 'type');
    if (!typeBuf || typeBuf.length !== 1 || typeBuf[0] !== Defaults_1.KEY_BUNDLE_TYPE[0])
        return null;
    const identity = (0, WABinary_1.getBinaryNodeChildBuffer)(keysNode, 'identity');
    const skey = (0, WABinary_1.getBinaryNodeChild)(keysNode, 'skey');
    if (!identity || identity.length !== 32 || !skey)
        return null;
    const registrationId = (0, WABinary_1.getBinaryNodeChildUInt)(receipt, 'registration', 4);
    if (!isValidUInt(registrationId))
        return null;
    const signedPubKey = (0, WABinary_1.getBinaryNodeChildBuffer)(skey, 'value');
    const signedSig = (0, WABinary_1.getBinaryNodeChildBuffer)(skey, 'signature');
    const signedKeyId = (0, WABinary_1.getBinaryNodeChildUInt)(skey, 'id', 3);
    if (!signedPubKey || signedPubKey.length !== 32 || !signedSig || !isValidUInt(signedKeyId)) {
        return null;
    }
    const preKeyNode = (0, WABinary_1.getBinaryNodeChild)(keysNode, 'key');
    let preKey;
    if (preKeyNode) {
        const preKeyPub = (0, WABinary_1.getBinaryNodeChildBuffer)(preKeyNode, 'value');
        const preKeyId = (0, WABinary_1.getBinaryNodeChildUInt)(preKeyNode, 'id', 3);
        if (!preKeyPub || preKeyPub.length !== 32 || !isValidUInt(preKeyId)) {
            return null;
        }
        preKey = { keyId: preKeyId, publicKey: (0, crypto_1.generateSignalPubKey)(preKeyPub) };
    }
    return {
        registrationId,
        identityKey: (0, crypto_1.generateSignalPubKey)(identity),
        signedPreKey: {
            keyId: signedKeyId,
            publicKey: (0, crypto_1.generateSignalPubKey)(signedPubKey),
            signature: signedSig
        },
        preKey
    };
};
exports.extractE2ESessionFromRetryReceipt = extractE2ESessionFromRetryReceipt;
const parseAndInjectE2ESessions = async (node, repository) => {
    const extractKey = key => key
        ? {
            keyId: (0, WABinary_1.getBinaryNodeChildUInt)(key, 'id', 3),
            publicKey: (0, crypto_1.generateSignalPubKey)((0, WABinary_1.getBinaryNodeChildBuffer)(key, 'value')),
            signature: (0, WABinary_1.getBinaryNodeChildBuffer)(key, 'signature')
        }
        : undefined;
    const nodes = (0, WABinary_1.getBinaryNodeChildren)((0, WABinary_1.getBinaryNodeChild)(node, 'list'), 'user');
    for (const node of nodes) {
        ;
        (0, WABinary_1.assertNodeErrorFree)(node);
    }
    const chunkSize = 100;
    const chunks = chunk(nodes, chunkSize);
    for (const nodesChunk of chunks) {
        for (const node of nodesChunk) {
            const signedKey = (0, WABinary_1.getBinaryNodeChild)(node, 'skey');
            const key = (0, WABinary_1.getBinaryNodeChild)(node, 'key');
            const identity = (0, WABinary_1.getBinaryNodeChildBuffer)(node, 'identity');
            const jid = node.attrs.jid;
            const registrationId = (0, WABinary_1.getBinaryNodeChildUInt)(node, 'registration', 4);
            await repository.injectE2ESession({
                jid,
                session: {
                    registrationId: registrationId,
                    identityKey: (0, crypto_1.generateSignalPubKey)(identity),
                    signedPreKey: extractKey(signedKey),
                    preKey: extractKey(key)
                }
            });
        }
    }
};
exports.parseAndInjectE2ESessions = parseAndInjectE2ESessions;
const extractDeviceJids = (result, myJid, myLid, excludeZeroDevices) => {
    const { user: myUser, device: myDevice } = (0, WABinary_1.jidDecode)(myJid);
    const extracted = [];
    for (const userResult of result) {
        const { devices, id } = userResult;
        const decoded = (0, WABinary_1.jidDecode)(id), { user, server } = decoded;
        let { domainType } = decoded;
        const deviceList = devices?.deviceList;
        if (!Array.isArray(deviceList))
            continue;
        for (const { id: device, keyIndex, isHosted } of deviceList) {
            if ((!excludeZeroDevices || device !== 0) &&
                ((myUser !== user && myLid !== user) || myDevice !== device) &&
                (device === 0 || !!keyIndex)) {
                if (isHosted) {
                    domainType =
                        domainType === WABinary_1.WAJIDDomains.LID
                            ? WABinary_1.WAJIDDomains.HOSTED_LID
                            : WABinary_1.WAJIDDomains.HOSTED;
                }
                extracted.push({
                    user,
                    device,
                    domainType,
                    server: (0, WABinary_1.getServerFromDomainType)(server, domainType)
                });
            }
        }
    }
    return extracted;
};
exports.extractDeviceJids = extractDeviceJids;
const getNextPreKeys = async ({ creds, keys }, count) => {
    const { newPreKeys, lastPreKeyId, preKeysRange } = (0, exports.generateOrGetPreKeys)(creds, count);
    const update = {
        nextPreKeyId: Math.max(lastPreKeyId + 1, creds.nextPreKeyId),
        firstUnuploadedPreKeyId: Math.max(creds.firstUnuploadedPreKeyId, lastPreKeyId + 1)
    };
    await keys.set({ 'pre-key': newPreKeys });
    const preKeys = await (0, exports.getPreKeys)(keys, preKeysRange[0], preKeysRange[0] + preKeysRange[1]);
    return { update, preKeys };
};
exports.getNextPreKeys = getNextPreKeys;
const getNextPreKeysNode = async (state, count) => {
    const { creds } = state;
    const { update, preKeys } = await (0, exports.getNextPreKeys)(state, count);
    const node = {
        tag: 'iq',
        attrs: {
            xmlns: 'encrypt',
            type: 'set',
            to: WABinary_1.S_WHATSAPP_NET
        },
        content: [
            { tag: 'registration', attrs: {}, content: (0, generics_1.encodeBigEndian)(creds.registrationId) },
            { tag: 'type', attrs: {}, content: Defaults_1.KEY_BUNDLE_TYPE },
            { tag: 'identity', attrs: {}, content: creds.signedIdentityKey.public },
            { tag: 'list', attrs: {}, content: Object.keys(preKeys).map(k => (0, exports.xmppPreKey)(preKeys[+k], +k)) },
            (0, exports.xmppSignedPreKey)(creds.signedPreKey)
        ]
    };
    return { update, node };
};
exports.getNextPreKeysNode = getNextPreKeysNode;
