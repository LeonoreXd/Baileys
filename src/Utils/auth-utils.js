'use strict';
var __importDefault = (this && this.__importDefault) ||
    function (mod) {
        return mod && mod.__esModule ? mod : { default: mod };
    };
Object.defineProperty(exports, '__esModule', { value: true });
exports.initAuthCreds = exports.addTransactionCapability = void 0;
exports.makeCacheableSignalKeyStore = makeCacheableSignalKeyStore;
const node_cache_1 = __importDefault(require('@cacheable/node-cache'));
const async_hooks_1 = require('async_hooks');
const async_mutex_1 = require('async-mutex');
const crypto_1 = require('crypto');
const p_queue_1 = __importDefault(require('p-queue'));
const Defaults_1 = require('../Defaults');
const crypto_2 = require('./crypto');
const generics_1 = require('./generics');
const pre_key_manager_1 = require('./pre-key-manager');
function makeCacheableSignalKeyStore(store, logger, _cache) {
    const cache = _cache ||
        new node_cache_1.default({
            stdTTL: Defaults_1.DEFAULT_CACHE_TTLS.SIGNAL_STORE,
            useClones: false,
            deleteOnExpire: true
        });
    const cacheMutex = new async_mutex_1.Mutex();
    function getUniqueId(type, id) {
        return `${type}.${id}`;
    }
    return {
        async get(type, ids) {
            return cacheMutex.runExclusive(async () => {
                const data = {};
                const idsToFetch = [];
                for (const id of ids) {
                    const item = await cache.get(getUniqueId(type, id));
                    if (typeof item !== 'undefined') {
                        data[id] = item;
                    }
                    else {
                        idsToFetch.push(id);
                    }
                }
                if (idsToFetch.length) {
                    logger?.trace({ items: idsToFetch.length }, 'loading from store');
                    const fetched = await store.get(type, idsToFetch);
                    for (const id of idsToFetch) {
                        const item = fetched[id];
                        if (item) {
                            data[id] = item;
                            await cache.set(getUniqueId(type, id), item);
                        }
                    }
                }
                return data;
            });
        },
        async set(data) {
            return cacheMutex.runExclusive(async () => {
                let keys = 0;
                for (const type in data) {
                    for (const id in data[type]) {
                        await cache.set(getUniqueId(type, id), data[type][id]);
                        keys += 1;
                    }
                }
                logger?.trace({ keys }, 'updated cache');
                await store.set(data);
            });
        },
        async clear() {
            await cache.flushAll();
            await store.clear?.();
        }
    };
}
const addTransactionCapability = (state, logger, { maxCommitRetries, delayBetweenTriesMs }) => {
    const txStorage = new async_hooks_1.AsyncLocalStorage();
    const keyQueues = new Map();
    const txMutexes = new Map();
    const txMutexRefCounts = new Map();
    const preKeyManager = new pre_key_manager_1.PreKeyManager(state, logger);
    function getQueue(key) {
        if (!keyQueues.has(key)) {
            keyQueues.set(key, new p_queue_1.default({ concurrency: 1 }));
        }
        return keyQueues.get(key);
    }
    function getTxMutex(key) {
        if (!txMutexes.has(key)) {
            txMutexes.set(key, new async_mutex_1.Mutex());
            txMutexRefCounts.set(key, 0);
        }
        return txMutexes.get(key);
    }
    function acquireTxMutexRef(key) {
        const count = txMutexRefCounts.get(key) ?? 0;
        txMutexRefCounts.set(key, count + 1);
    }
    function releaseTxMutexRef(key) {
        const count = (txMutexRefCounts.get(key) ?? 1) - 1;
        txMutexRefCounts.set(key, count);
        if (count <= 0) {
            const mutex = txMutexes.get(key);
            if (mutex && !mutex.isLocked()) {
                txMutexes.delete(key);
                txMutexRefCounts.delete(key);
            }
        }
    }
    function isInTransaction() {
        return !!txStorage.getStore();
    }
    async function commitWithRetry(mutations) {
        if (Object.keys(mutations).length === 0) {
            logger.trace('no mutations in transaction');
            return;
        }
        logger.trace('committing transaction');
        for (let attempt = 0; attempt < maxCommitRetries; attempt++) {
            try {
                await state.set(mutations);
                logger.trace({ mutationCount: Object.keys(mutations).length }, 'committed transaction');
                return;
            }
            catch (error) {
                const retriesLeft = maxCommitRetries - attempt - 1;
                logger.warn(`failed to commit mutations, retries left=${retriesLeft}`);
                if (retriesLeft === 0) {
                    throw error;
                }
                await (0, generics_1.delay)(delayBetweenTriesMs);
            }
        }
    }
    return {
        get: async (type, ids) => {
            const ctx = txStorage.getStore();
            if (!ctx) {
                return state.get(type, ids);
            }
            const cached = ctx.cache[type] || {};
            const missing = ids.filter(id => !(id in cached));
            if (missing.length > 0) {
                ctx.dbQueries++;
                logger.trace({ type, count: missing.length }, 'fetching missing keys in transaction');
                const fetched = await getTxMutex(type).runExclusive(() => state.get(type, missing));
                ctx.cache[type] = ctx.cache[type] || {};
                Object.assign(ctx.cache[type], fetched);
            }
            const result = {};
            for (const id of ids) {
                const value = ctx.cache[type]?.[id];
                if (value !== undefined && value !== null) {
                    result[id] = value;
                }
            }
            return result;
        },
        set: async (data) => {
            const ctx = txStorage.getStore();
            if (!ctx) {
                const types = Object.keys(data);
                for (const type_ of types) {
                    const type = type_;
                    if (type === 'pre-key') {
                        await preKeyManager.validateDeletions(data, type);
                    }
                }
                await Promise.all(types.map(type => getQueue(type).add(async () => {
                    const typeData = { [type]: data[type] };
                    await state.set(typeData);
                })));
                return;
            }
            logger.trace({ types: Object.keys(data) }, 'caching in transaction');
            for (const key_ in data) {
                const key = key_;
                ctx.cache[key] = ctx.cache[key] || {};
                ctx.mutations[key] = ctx.mutations[key] || {};
                if (key === 'pre-key') {
                    await preKeyManager.processOperations(data, key, ctx.cache, ctx.mutations, true);
                }
                else {
                    Object.assign(ctx.cache[key], data[key]);
                    Object.assign(ctx.mutations[key], data[key]);
                }
            }
        },
        isInTransaction,
        transaction: async (work, key) => {
            const existing = txStorage.getStore();
            if (existing) {
                logger.trace('reusing existing transaction context');
                return work();
            }
            const mutex = getTxMutex(key);
            acquireTxMutexRef(key);
            try {
                return await mutex.runExclusive(async () => {
                    const ctx = {
                        cache: {},
                        mutations: {},
                        dbQueries: 0
                    };
                    logger.trace('entering transaction');
                    try {
                        const result = await txStorage.run(ctx, work);
                        await commitWithRetry(ctx.mutations);
                        logger.trace({ dbQueries: ctx.dbQueries }, 'transaction completed');
                        return result;
                    }
                    catch (error) {
                        logger.error({ error }, 'transaction failed, rolling back');
                        throw error;
                    }
                });
            }
            finally {
                releaseTxMutexRef(key);
            }
        }
    };
};
exports.addTransactionCapability = addTransactionCapability;
const initAuthCreds = () => {
    const identityKey = crypto_2.Curve.generateKeyPair();
    return {
        noiseKey: crypto_2.Curve.generateKeyPair(),
        pairingEphemeralKeyPair: crypto_2.Curve.generateKeyPair(),
        signedIdentityKey: identityKey,
        signedPreKey: (0, crypto_2.signedKeyPair)(identityKey, 1),
        registrationId: (0, generics_1.generateRegistrationId)(),
        advSecretKey: (0, crypto_1.randomBytes)(32).toString('base64'),
        processedHistoryMessages: [],
        initialFullSyncDone: false,
        nextPreKeyId: 1,
        firstUnuploadedPreKeyId: 1,
        accountSyncCounter: 0,
        accountSettings: {
            unarchiveChats: false
        },
        deviceId: Buffer.from((0, crypto_1.randomUUID)().replace(/-/g, ''), 'hex').toString('base64url'),
        phoneId: (0, crypto_1.randomUUID)(),
        identityId: (0, crypto_1.randomBytes)(20),
        backupToken: (0, crypto_1.randomBytes)(20),
        registration: {},
        registered: false,
        pairingCode: undefined,
        lastPropHash: undefined,
        routingInfo: undefined,
        additionalData: undefined
    };
};
exports.initAuthCreds = initAuthCreds;
