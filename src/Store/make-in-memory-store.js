'use strict';
var __importDefault = (this && this.__importDefault) ||
    function (mod) {
        return mod && mod.__esModule ? mod : { default: mod };
    };
Object.defineProperty(exports, '__esModule', { value: true });
const WAProto_1 = require('../../WAProto');
const Defaults_1 = require('../Defaults');
const LabelAssociation_1 = require('../Types/LabelAssociation');
const Utils_1 = require('../Utils');
const WABinary_1 = require('../WABinary');
const Store_1 = require('./make-ordered-dictionary');
const object_repository_1 = require('./object-repository');
const waChatKey = pin => ({
    key: c => (pin ? (c.pinned ? '1' : '0') : '') +
        (c.archived ? '0' : '1') +
        (c.conversationTimestamp ? c.conversationTimestamp.toString(16).padStart(8, '0') : '') +
        c.id,
    compare: (k1, k2) => k2.localeCompare(k1)
});
const waMessageID = m => m.key.id || '';
const waLabelAssociationKey = {
    key: la => la.type === LabelAssociation_1.LabelAssociationType.Chat
        ? la.chatId + la.labelId
        : la.chatId + la.messageId + la.labelId,
    compare: (k1, k2) => k2.localeCompare(k1)
};
const makeMessagesDictionary = () => Store_1.makeOrderedDictionary(waMessageID);
const ENCRYPTED_STORE_MARKER = 'xazbails-store-v1';
const deriveStoreKey = secret => {
    const { createHash } = require('crypto');
    return createHash('sha256').update(String(secret)).digest();
};
const encryptStoreJSON = (jsonStr, secret) => {
    const { createCipheriv, randomBytes } = require('crypto');
    const key = deriveStoreKey(secret);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf-8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return JSON.stringify({
        marker: ENCRYPTED_STORE_MARKER,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        data: encrypted.toString('base64')
    });
};
const decryptStoreJSON = (fileStr, secret) => {
    const parsed = JSON.parse(fileStr);
    if (parsed.marker !== ENCRYPTED_STORE_MARKER) {
        return fileStr;
    }
    const { createDecipheriv } = require('crypto');
    const key = deriveStoreKey(secret);
    const iv = Buffer.from(parsed.iv, 'base64');
    const authTag = Buffer.from(parsed.authTag, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]);
    return decrypted.toString('utf-8');
};
const makeInMemoryStore = config => {
    const socket = config.socket;
    const chatKey = config.chatKey || waChatKey(true);
    const labelAssociationKey = config.labelAssociationKey || waLabelAssociationKey;
    const logger = config.logger ||
        Defaults_1.DEFAULT_CONNECTION_CONFIG.logger.child({
            stream: 'in-mem-store'
        });
    const KeyedDB = require('@adiwajshing/keyed-db').default;
    const chats = new KeyedDB(chatKey, c => c.id);
    const messages = {};
    const contacts = {};
    const groupMetadata = {};
    const presences = {};
    const state = { connection: 'close' };
    const labels = new object_repository_1.ObjectRepository();
    const labelAssociations = new KeyedDB(labelAssociationKey, labelAssociationKey.key);
    const maxMessagesPerChat = config.maxMessagesPerChat;
    const trimMessagesIfNeeded = jid => {
        if (!maxMessagesPerChat)
            return;
        const list = messages[jid];
        if (!list || list.array.length <= maxMessagesPerChat)
            return;
        while (list.array.length > maxMessagesPerChat) {
            let oldest = list.array[0];
            for (const m of list.array) {
                if ((m.messageTimestamp || 0) < (oldest.messageTimestamp || 0))
                    oldest = m;
            }
            list.remove(oldest);
        }
    };
    const assertMessageList = jid => {
        if (!messages[jid]) {
            messages[jid] = makeMessagesDictionary();
        }
        return messages[jid];
    };
    const contactsUpsert = newContacts => {
        const oldContacts = new Set(Object.keys(contacts));
        for (const contact of newContacts) {
            oldContacts.delete(contact.id);
            contacts[contact.id] = Object.assign(contacts[contact.id] || {}, contact);
        }
        return oldContacts;
    };
    const labelsUpsert = newLabels => {
        for (const label of newLabels) {
            labels.upsertById(label.id, label);
        }
    };
    const bind = ev => {
        ev.on('connection.update', update => {
            Object.assign(state, update);
        });
        ev.on('messaging-history.set', ({ chats: newChats, contacts: newContacts, messages: newMessages, isLatest, syncType }) => {
            if (syncType === WAProto_1.proto.HistorySync.HistorySyncType.ON_DEMAND) {
                return;
            }
            if (isLatest) {
                chats.clear();
                for (const id in messages) {
                    delete messages[id];
                }
            }
            const chatsAdded = chats.insertIfAbsent(...newChats).length;
            logger.debug({ chatsAdded }, 'synced chats');
            const oldContacts = contactsUpsert(newContacts);
            if (isLatest) {
                for (const jid of oldContacts) {
                    delete contacts[jid];
                }
            }
            logger.debug({ deletedContacts: isLatest ? oldContacts.size : 0, newContacts }, 'synced contacts');
            for (const msg of newMessages) {
                const jid = msg.key.remoteJid;
                const list = assertMessageList(jid);
                list.upsert(msg, 'prepend');
                trimMessagesIfNeeded(jid);
            }
            logger.debug({ messages: newMessages.length }, 'synced messages');
        });
        ev.on('contacts.upsert', contacts => {
            contactsUpsert(contacts);
        });
        ev.on('contacts.update', async (updates) => {
            for (const update of updates) {
                let contact;
                if (contacts[update.id]) {
                    contact = contacts[update.id];
                }
                else {
                    const contactHashes = await Promise.all(Object.keys(contacts).map(async (contactId) => {
                        const { user } = WABinary_1.jidDecode(contactId);
                        return [
                            contactId,
                            (await Utils_1.md5(Buffer.from(user + 'WA_ADD_NOTIF', 'utf8'))).toString('base64').slice(0, 3)
                        ];
                    }));
                    contact = contacts[contactHashes.find(([, b]) => b === update.id?.[0]) || ''];
                }
                if (contact) {
                    if (update.imgUrl === 'changed') {
                        contact.imgUrl = socket ? await socket.profilePictureUrl(contact.id) : undefined;
                    }
                    else if (update.imgUrl === 'removed') {
                        delete contact.imgUrl;
                    }
                }
                else {
                    return logger.debug({ update }, 'got update for non-existant contact');
                }
                Object.assign(contacts[contact.id], contact);
            }
        });
        ev.on('chats.upsert', newChats => {
            chats.upsert(...newChats);
        });
        ev.on('chats.update', updates => {
            for (let update of updates) {
                const result = chats.update(update.id, chat => {
                    if (update.unreadCount > 0) {
                        update = { ...update };
                        update.unreadCount = (chat.unreadCount || 0) + update.unreadCount;
                    }
                    Object.assign(chat, update);
                });
                if (!result) {
                    logger.debug({ update }, 'got update for non-existant chat');
                }
            }
        });
        ev.on('labels.edit', label => {
            if (label.deleted) {
                return labels.deleteById(label.id);
            }
            if (labels.count() < 20) {
                return labels.upsertById(label.id, label);
            }
            logger.error('Labels count exceed');
        });
        ev.on('labels.association', ({ type, association }) => {
            switch (type) {
                case 'add':
                    labelAssociations.upsert(association);
                    break;
                case 'remove':
                    labelAssociations.delete(association);
                    break;
                default:
                    logger.error({ type }, 'unknown label association operation type');
            }
        });
        ev.on('presence.update', ({ id, presences: update }) => {
            presences[id] = presences[id] || {};
            Object.assign(presences[id], update);
        });
        ev.on('chats.delete', deletions => {
            for (const item of deletions) {
                if (chats.get(item)) {
                    chats.deleteById(item);
                }
            }
        });
        ev.on('messages.upsert', ({ messages: newMessages, type }) => {
            switch (type) {
                case 'append':
                case 'notify':
                    for (const msg of newMessages) {
                        const jid = WABinary_1.jidNormalizedUser(msg.key.remoteJid);
                        const list = assertMessageList(jid);
                        list.upsert(msg, 'append');
                        trimMessagesIfNeeded(jid);
                        if (type === 'notify' && !chats.get(jid)) {
                            ev.emit('chats.upsert', [
                                {
                                    id: jid,
                                    conversationTimestamp: Utils_1.toNumber(msg.messageTimestamp),
                                    unreadCount: 1
                                }
                            ]);
                        }
                    }
                    break;
            }
        });
        ev.on('messages.update', updates => {
            for (const { update, key } of updates) {
                const list = assertMessageList(WABinary_1.jidNormalizedUser(key.remoteJid));
                if (update?.status) {
                    const listStatus = list.get(key.id)?.status;
                    if (listStatus && update?.status <= listStatus) {
                        logger.debug({ update, storedStatus: listStatus }, 'status stored newer then update');
                        delete update.status;
                        logger.debug({ update }, 'new update object');
                    }
                }
                const result = list.updateAssign(key.id, update);
                if (!result) {
                    logger.debug({ update }, 'got update for non-existent message');
                }
            }
        });
        ev.on('messages.delete', item => {
            if ('all' in item) {
                const list = messages[item.jid];
                list?.clear();
            }
            else {
                const jid = item.keys[0].remoteJid;
                const list = messages[jid];
                if (list) {
                    const idSet = new Set(item.keys.map(k => k.id));
                    list.filter(m => !idSet.has(m.key.id));
                }
            }
        });
        ev.on('groups.update', updates => {
            for (const update of updates) {
                const id = update.id;
                if (groupMetadata[id]) {
                    Object.assign(groupMetadata[id], update);
                }
                else {
                    logger.debug({ update }, 'got update for non-existant group metadata');
                }
            }
        });
        ev.on('group-participants.update', ({ id, participants, action }) => {
            const metadata = groupMetadata[id];
            if (metadata) {
                switch (action) {
                    case 'add':
                        metadata.participants.push(...participants.map(id => ({
                            id,
                            isAdmin: false,
                            isSuperAdmin: false
                        })));
                        break;
                    case 'demote':
                    case 'promote':
                        for (const participant of metadata.participants) {
                            if (participants.includes(participant.id)) {
                                participant.isAdmin = action === 'promote';
                            }
                        }
                        break;
                    case 'remove':
                        metadata.participants = metadata.participants.filter(p => !participants.includes(p.id));
                        break;
                }
            }
        });
        ev.on('message-receipt.update', updates => {
            for (const { key, receipt } of updates) {
                const obj = messages[key.remoteJid];
                const msg = obj?.get(key.id);
                if (msg) {
                    Utils_1.updateMessageWithReceipt(msg, receipt);
                }
            }
        });
        ev.on('messages.reaction', reactions => {
            for (const { key, reaction } of reactions) {
                const obj = messages[key.remoteJid];
                const msg = obj?.get(key.id);
                if (msg) {
                    Utils_1.updateMessageWithReaction(msg, reaction);
                }
            }
        });
        ev.on('settings.update', ({ setting, value }) => {
            state.settings = state.settings || {};
            state.settings[setting] = value;
        });
        ev.on('labels.reorder', ({ labelIds }) => {
            let order = 0;
            for (const id of labelIds) {
                const label = labels.findById(id);
                if (label) {
                    labels.upsertById(id, { ...label, order: order++ });
                }
                order++;
            }
        });
        ev.on('call.scheduled', ({ messageKey, scheduledCall, chatId }) => {
            state.scheduledCalls = state.scheduledCalls || {};
            state.scheduledCalls[messageKey.id] = { key: messageKey, scheduledCall, chatId };
        });
        ev.on('call.schedule-cancelled', ({ messageKey, editedCallKey }) => {
            if (state.scheduledCalls?.[editedCallKey?.id]) {
                delete state.scheduledCalls[editedCallKey.id];
            }
        });
        ev.on('payment.split', ({ messageKey, splitPayment }) => {
            const list = assertMessageList(WABinary_1.jidNormalizedUser(messageKey.remoteJid));
            const msg = list?.get(messageKey.id);
            if (msg) {
                msg.splitPayment = splitPayment;
            }
        });
        ev.on('message.comment', ({ commentKey, comment, targetKey }) => {
            const list = assertMessageList(WABinary_1.jidNormalizedUser(targetKey.remoteJid));
            const msg = list?.get(targetKey.id);
            if (msg) {
                msg.commentCount = (msg.commentCount || 0) + 1;
            }
        });
        ev.on('poll.add-option', ({ pollKey, addedOption }) => {
            const list = assertMessageList(WABinary_1.jidNormalizedUser(pollKey.remoteJid));
            const msg = list?.get(pollKey.id);
            if (msg?.message) {
                const poll = msg.message.pollCreationMessage ||
                    msg.message.pollCreationMessageV3 ||
                    msg.message.pollCreationMessageV5 ||
                    msg.message.pollCreationMessageV6;
                if (poll && addedOption) {
                    poll.options = [...(poll.options || []), addedOption];
                }
            }
        });
        ev.on('chats.lock', ({ id, locked }) => {
            const result = chats.update(id, chat => {
                chat.locked = locked;
            });
            if (!result)
                logger.debug({ id }, 'got chats.lock for non-existent chat');
        });
        ev.on('messaging-history.status', ({ syncType, status }) => {
            state.historySyncStatus = state.historySyncStatus || {};
            state.historySyncStatus[syncType] = status;
        });
    };
    const toJSON = () => ({
        chats,
        contacts,
        messages,
        labels,
        labelAssociations,
        groupMetadata,
        presences,
        state
    });
    const fromJSON = json => {
        chats.upsert(...json.chats);
        labelAssociations.upsert(...(json.labelAssociations || []));
        contactsUpsert(Object.values(json.contacts));
        labelsUpsert(Object.values(json.labels || {}));
        for (const jid in json.messages) {
            const list = assertMessageList(jid);
            for (const msg of json.messages[jid]) {
                list.upsert(WAProto_1.proto.WebMessageInfo.fromObject(msg), 'append');
            }
            trimMessagesIfNeeded(jid);
        }
        if (json.groupMetadata) {
            Object.assign(groupMetadata, json.groupMetadata);
        }
        if (json.presences) {
            Object.assign(presences, json.presences);
        }
        if (json.state) {
            Object.assign(state, json.state);
        }
    };
    return {
        chats,
        contacts,
        messages,
        groupMetadata,
        state,
        presences,
        labels,
        labelAssociations,
        bind,
        loadMessages: async (jid, count, cursor) => {
            const list = assertMessageList(jid);
            const mode = !cursor || 'before' in cursor ? 'before' : 'after';
            const cursorKey = !!cursor ? ('before' in cursor ? cursor.before : cursor.after) : undefined;
            const cursorValue = cursorKey ? list.get(cursorKey.id) : undefined;
            let messages;
            if (list && mode === 'before' && (!cursorKey || cursorValue)) {
                if (cursorValue) {
                    const msgIdx = list.array.findIndex(m => m.key.id === cursorKey?.id);
                    messages = list.array.slice(0, msgIdx);
                }
                else {
                    messages = list.array;
                }
                const diff = count - messages.length;
                if (diff < 0) {
                    messages = messages.slice(-count);
                }
            }
            else {
                messages = [];
            }
            return messages;
        },
        getLabels: () => {
            return labels;
        },
        getChatLabels: chatId => {
            return labelAssociations.filter(la => la.chatId === chatId).all();
        },
        getMessageLabels: messageId => {
            const associations = labelAssociations.filter(la => la.messageId === messageId).all();
            return associations.map(({ labelId }) => labelId);
        },
        loadMessage: async (jid, id) => messages[jid]?.get(id),
        mostRecentMessage: async (jid) => {
            const message = messages[jid]?.array.slice(-1)[0];
            return message;
        },
        fetchImageUrl: async (jid, suki) => {
            const contact = contacts[jid];
            if (!contact) {
                return suki?.profilePictureUrl(jid);
            }
            if (typeof contact.imgUrl === 'undefined') {
                contact.imgUrl = await suki?.profilePictureUrl(jid);
            }
            return contact.imgUrl;
        },
        fetchGroupMetadata: async (jid, suki) => {
            if (!groupMetadata[jid]) {
                const metadata = await suki?.groupMetadata(jid);
                if (metadata) {
                    groupMetadata[jid] = metadata;
                }
            }
            return groupMetadata[jid];
        },
        fetchMessageReceipts: async ({ remoteJid, id }) => {
            const list = messages[remoteJid];
            const msg = list?.get(id);
            return msg?.userReceipt;
        },
        toJSON,
        fromJSON,
        writeToFile: path => {
            const { writeFileSync } = require('fs');
            const jsonStr = JSON.stringify(toJSON());
            writeFileSync(path, config.encryptionKey ? encryptStoreJSON(jsonStr, config.encryptionKey) : jsonStr);
        },
        readFromFile: path => {
            const { readFileSync, existsSync } = require('fs');
            if (existsSync(path)) {
                logger.debug({ path }, 'reading from file');
                const fileStr = readFileSync(path, { encoding: 'utf-8' });
                const jsonStr = config.encryptionKey ? decryptStoreJSON(fileStr, config.encryptionKey) : fileStr;
                const json = JSON.parse(jsonStr);
                fromJSON(json);
            }
        },
        startAutoSave: (path, intervalMs = 30000) => {
            const timer = setInterval(() => {
                try {
                    const { writeFileSync } = require('fs');
                    const jsonStr = JSON.stringify(toJSON());
                    writeFileSync(path, config.encryptionKey ? encryptStoreJSON(jsonStr, config.encryptionKey) : jsonStr);
                }
                catch (error) {
                    logger.warn({ error, path }, 'failed to auto-save store');
                }
            }, intervalMs);
            if (timer.unref)
                timer.unref();
            if (socket && typeof socket.registerSocketEndHandler === 'function') {
                socket.registerSocketEndHandler(async () => {
                    try {
                        const { writeFileSync } = require('fs');
                        const jsonStr = JSON.stringify(toJSON());
                        writeFileSync(path, config.encryptionKey ? encryptStoreJSON(jsonStr, config.encryptionKey) : jsonStr);
                        logger.debug({ path }, 'final store flush on socket end');
                    }
                    catch (error) {
                        logger.warn({ error, path }, 'failed to flush store on socket end');
                    }
                });
            }
            return () => clearInterval(timer);
        }
    };
};
exports.waChatKey = waChatKey;
exports.waMessageID = waMessageID;
exports.waLabelAssociationKey = waLabelAssociationKey;
exports.makeInMemoryStore = makeInMemoryStore;
