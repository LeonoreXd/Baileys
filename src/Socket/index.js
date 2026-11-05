'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const Defaults_1 = require('../Defaults');
const communities_1 = require('./communities');
const { makeInteropSocket } = require('./interop');
const { makePrivacySocket } = require('./privacy');
const { makeRegistrationSocket } = require('./registration');
const { makeManagedAccountSocket } = require('./managed-account');
const { makeGraphQLSocket } = require('./graphql');
const { wrapSocket: _wrapSocket } = require('../antiban');
const { attachTextRouter } = require('./text-router');
const makeWASocket = config => {
    const userExplicitSyncFlag = typeof config?.syncFullHistory === 'boolean';
    const initialFullSyncDone = !!config?.auth?.creds?.initialFullSyncDone;
    const effectiveSyncFullHistory = userExplicitSyncFlag ? config.syncFullHistory : !initialFullSyncDone;
    const newConfig = {
        ...Defaults_1.DEFAULT_CONNECTION_CONFIG,
        ...config,
        syncFullHistory: effectiveSyncFullHistory
    };
    newConfig.logger?.debug?.({ initialFullSyncDone, effectiveSyncFullHistory, userExplicitSyncFlag }, 'computed syncFullHistory policy');
    const baseSock = (0, communities_1.makeCommunitiesSocket)(newConfig);
    const interopSock = makeInteropSocket(baseSock);
    const privacySock = makePrivacySocket(interopSock);
    const registrationSock = makeRegistrationSocket(privacySock);
    const managedSock = makeManagedAccountSocket(registrationSock);
    const sock = makeGraphQLSocket(managedSock);
    const finalSock = _wrapSocket && config?.antiban !== false ? _wrapSocket(sock, config?.antiban || 'aggressive') : sock;
    return attachTextRouter(finalSock);
};
exports.default = makeWASocket;
