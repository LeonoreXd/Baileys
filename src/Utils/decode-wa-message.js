'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.decryptMessageNode =
    exports.extractAddressingContext =
        exports.SERVER_ERROR_CODES =
            exports.NACK_REASONS =
                exports.DECRYPTION_RETRY_CONFIG =
                    exports.MISSING_KEYS_ERROR_TEXT =
                        exports.NO_MESSAGE_FOUND_ERROR_TEXT =
                            exports.getDecryptionJid =
                                void 0;
exports.decodeMessageNode = decodeMessageNode;
const boom_1 = require('@hapi/boom');
const index_js_1 = require('../../WAProto/index.js');
const WAProto_1 = require('../../WAProto/index.js');
const WABinary_1 = require('../WABinary');
const generics_1 = require('./generics');
const meta_ai_msmsg_1 = require('./meta-ai-msmsg');
const messages_1 = require('./messages');
const MAX_SECRETS_PER_CHAT = 20;
const botMessageSecrets = new Map();
const botRecentSecretsByChat = new Map();
const pushRecentChatSecret = (chatJid, id, secretBuf) => {
    if (!chatJid || !secretBuf)
        return;
    const existing = botRecentSecretsByChat.get(chatJid) || [];
    const filtered = existing.filter(item => item.id !== id && !item.secret.equals(secretBuf));
    filtered.unshift({ id, secret: secretBuf });
    if (filtered.length > MAX_SECRETS_PER_CHAT) {
        filtered.length = MAX_SECRETS_PER_CHAT;
    }
    botRecentSecretsByChat.set(chatJid, filtered);
};
const setBotMessageSecret = (id, secret, chatJid) => {
    if (!id || !secret)
        return;
    let buf;
    if (Buffer.isBuffer(secret)) {
        buf = secret;
    }
    else if (secret instanceof Uint8Array) {
        buf = Buffer.from(secret.buffer, secret.byteOffset, secret.byteLength);
    }
    else if (typeof secret === 'string') {
        buf = Buffer.from(secret, 'base64');
    }
    else {
        return;
    }
    botMessageSecrets.set(id, buf);
    if (chatJid) {
        pushRecentChatSecret(chatJid, id, buf);
    }
};
exports.setBotMessageSecret = setBotMessageSecret;
const getDecryptionJid = async (sender, repository) => {
    if ((0, WABinary_1.isLidUser)(sender) ||
        (0, WABinary_1.isHostedLidUser)(sender) ||
        (0, WABinary_1.isInteropUser)(sender)) {
        return sender;
    }
    const mapped = await repository.lidMapping.getLIDForPN(sender);
    return mapped || sender;
};
exports.getDecryptionJid = getDecryptionJid;
const storeMappingFromEnvelope = async (stanza, sender, repository, decryptionJid, logger) => {
    const { senderAlt } = (0, exports.extractAddressingContext)(stanza);
    if (senderAlt &&
        (0, WABinary_1.isLidUser)(senderAlt) &&
        (0, WABinary_1.isPnUser)(sender) &&
        decryptionJid === sender) {
        try {
            await repository.lidMapping.storeLIDPNMappings([{ lid: senderAlt, pn: sender }]);
            await repository.migrateSession(sender, senderAlt);
            logger.debug({ sender, senderAlt }, 'Stored LID mapping from envelope');
        }
        catch (error) {
            logger.warn({ sender, senderAlt, error }, 'Failed to store LID mapping');
        }
    }
};
exports.NO_MESSAGE_FOUND_ERROR_TEXT = 'Message absent from node';
exports.MISSING_KEYS_ERROR_TEXT = 'Key used already or never filled';
exports.SERVER_ERROR_CODES = {
    MissingTcToken: '463',
    SmaxInvalid: '479'
};
exports.DECRYPTION_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 100,
    sessionRecordErrors: ['No session record', 'SessionError: No session record']
};
exports.NACK_REASONS = {
    ParsingError: 487,
    UnrecognizedStanza: 488,
    UnrecognizedStanzaClass: 489,
    UnrecognizedStanzaType: 490,
    InvalidProtobuf: 491,
    InvalidHostedCompanionStanza: 493,
    MissingMessageSecret: 495,
    SignalErrorOldCounter: 496,
    MessageDeletedOnPeer: 499,
    UnhandledError: 500,
    UnsupportedAdminRevoke: 550,
    UnsupportedLIDGroup: 551,
    DBOperationFailed: 552
};
const extractAddressingContext = stanza => {
    let senderAlt;
    let recipientAlt;
    const sender = stanza.attrs.participant || stanza.attrs.from;
    const addressingMode = stanza.attrs.addressing_mode || (sender?.endsWith('lid') ? 'lid' : 'pn');
    if (addressingMode === 'lid') {
        senderAlt = stanza.attrs.participant_pn || stanza.attrs.sender_pn || stanza.attrs.peer_recipient_pn;
        recipientAlt = stanza.attrs.recipient_pn;
    }
    else {
        senderAlt = stanza.attrs.participant_lid || stanza.attrs.sender_lid || stanza.attrs.peer_recipient_lid;
        recipientAlt = stanza.attrs.recipient_lid;
    }
    return {
        addressingMode,
        senderAlt,
        recipientAlt
    };
};
exports.extractAddressingContext = extractAddressingContext;
function decodeMessageNode(stanza, meId, meLid) {
    let msgType;
    let chatId;
    let author;
    let fromMe = false;
    const msgId = stanza.attrs.id;
    const from = stanza.attrs.from;
    const participant = stanza.attrs.participant;
    const recipient = stanza.attrs.recipient;
    const addressingContext = (0, exports.extractAddressingContext)(stanza);
    const isMe = jid => (0, WABinary_1.areJidsSameUser)(jid, meId);
    const isMeLid = jid => (0, WABinary_1.areJidsSameUser)(jid, meLid);
    if ((0, WABinary_1.isPnUser)(from) ||
        (0, WABinary_1.isLidUser)(from) ||
        (0, WABinary_1.isHostedLidUser)(from) ||
        (0, WABinary_1.isHostedPnUser)(from)) {
        if (recipient) {
            if (!isMe(from) && !isMeLid(from)) {
                throw new boom_1.Boom('receipient present, but msg not from me', { data: stanza });
            }
            if (isMe(from) || isMeLid(from)) {
                fromMe = true;
            }
            chatId = recipient;
        }
        else {
            chatId = from;
        }
        msgType = 'chat';
        author = from;
    }
    else if ((0, WABinary_1.isJidGroup)(from)) {
        if (!participant) {
            throw new boom_1.Boom('No participant in group message');
        }
        if (isMe(participant) || isMeLid(participant)) {
            fromMe = true;
        }
        msgType = 'group';
        author = participant;
        chatId = from;
    }
    else if ((0, WABinary_1.isJidBroadcast)(from)) {
        if (!participant) {
            throw new boom_1.Boom('No participant in group message');
        }
        const isParticipantMe = isMe(participant);
        if ((0, WABinary_1.isJidStatusBroadcast)(from)) {
            msgType = isParticipantMe ? 'direct_peer_status' : 'other_status';
        }
        else {
            msgType = isParticipantMe ? 'peer_broadcast' : 'other_broadcast';
        }
        fromMe = isParticipantMe;
        chatId = from;
        author = participant;
    }
    else if ((0, WABinary_1.isJidMetaAI)(from)) {
        msgType = 'chat';
        chatId = from;
        author = from;
        fromMe = false;
    }
    else if ((0, WABinary_1.isJidNewsletter)(from)) {
        msgType = 'newsletter';
        chatId = from;
        author = from;
        fromMe = (0, WABinary_1.isJidNewsletter)(from)
            ? !!stanza.attrs?.is_sender
            : (0, WABinary_1.isLidUser)(from)
                ? (0, WABinary_1.areJidsSameUser)(from, meLid)
                : (0, WABinary_1.areJidsSameUser)(from, meId);
    }
    else if ((0, WABinary_1.isInteropUser)(from)) {
        msgType = 'chat';
        chatId = from;
        author = from;
        fromMe = false;
    }
    else {
        throw new boom_1.Boom('Unknown message type', { data: stanza });
    }
    const pushname = stanza?.attrs?.notify ?? stanza?.attrs?.display_name;
    const key = {
        remoteJid: chatId,
        remoteJidAlt: !(0, WABinary_1.isJidGroup)(chatId) ? addressingContext.senderAlt : undefined,
        remoteJidUsername: !(0, WABinary_1.isJidGroup)(chatId)
            ? stanza.attrs.peer_recipient_username || stanza.attrs.recipient_username
            : undefined,
        fromMe,
        id: msgId,
        participant,
        participantAlt: (0, WABinary_1.isJidGroup)(chatId) ? addressingContext.senderAlt : undefined,
        participantUsername: stanza.attrs.participant ? stanza.attrs.participant_username : undefined,
        addressingMode: addressingContext.addressingMode,
        ...(msgType === 'newsletter' && stanza.attrs.server_id ? { server_id: stanza.attrs.server_id } : {})
    };
    const fullMessage = {
        key,
        category: stanza.attrs.category,
        messageTimestamp: +stanza.attrs.t,
        pushName: pushname,
        broadcast: (0, WABinary_1.isJidBroadcast)(from),
        newsletter: (0, WABinary_1.isJidNewsletter)(from),
        StanzaAttrs: stanza.attrs,
        Owner: 'xazbails'
    };
    if (key.fromMe) {
        fullMessage.status = index_js_1.proto.WebMessageInfo.Status.SERVER_ACK;
    }
    if (msgType === 'newsletter') {
        fullMessage.newsletter_server_id = +stanza.attrs?.server_id;
    }
    if (!key.fromMe) {
        fullMessage.platform = messages_1.getDevice(key.id);
    }
    return {
        fullMessage,
        author,
        sender: msgType === 'chat' ? author : chatId
    };
}
const decryptMessageNode = (stanza, meId, meLid, repository, logger) => {
    const { fullMessage, author, sender } = decodeMessageNode(stanza, meId, meLid);
    let metaTargetId = null;
    let botEditTargetId = null;
    let botType = null;
    let metaTargetSenderJid = null;
    return {
        fullMessage,
        category: stanza.attrs.category,
        author,
        async decrypt() {
            let decryptables = 0;
            if (Array.isArray(stanza.content)) {
                let hasMsmsg = false;
                for (const { attrs } of stanza.content) {
                    if ((attrs === null || attrs === void 0 ? void 0 : attrs.type) === 'msmsg') {
                        hasMsmsg = true;
                        break;
                    }
                }
                if (hasMsmsg) {
                    for (const { tag, attrs } of stanza.content) {
                        if (tag === 'meta' && attrs?.target_id) {
                            metaTargetId = attrs.target_id;
                        }
                        if (tag === 'meta' && attrs?.target_sender_jid) {
                            metaTargetSenderJid = attrs.target_sender_jid;
                        }
                        if (tag === 'bot' && attrs && 'edit_target_id' in attrs) {
                            botEditTargetId = attrs.edit_target_id;
                        }
                        if (tag === 'bot' && (attrs === null || attrs === void 0 ? void 0 : attrs.edit)) {
                            botType = attrs.edit;
                        }
                    }
                }
                for (const { tag, attrs, content } of stanza.content) {
                    if (tag === 'verified_name' && content instanceof Uint8Array) {
                        const cert = index_js_1.proto.VerifiedNameCertificate.decode(content);
                        const details = index_js_1.proto.VerifiedNameCertificate.Details.decode(cert.details);
                        fullMessage.verifiedBizName = details.verifiedName;
                    }
                    if (tag === 'unavailable' && attrs.type === 'view_once') {
                        fullMessage.key.isViewOnce = true;
                    }
                    if (attrs.count && tag === 'enc') {
                        fullMessage.retryCount = Number(attrs.count);
                    }
                    if (tag !== 'enc' && tag !== 'plaintext') {
                        continue;
                    }
                    if (!(content instanceof Uint8Array)) {
                        continue;
                    }
                    decryptables += 1;
                    let msgBuffer;
                    const decryptionJid = await (0, exports.getDecryptionJid)(author, repository);
                    if (tag !== 'plaintext') {
                        await storeMappingFromEnvelope(stanza, author, repository, decryptionJid, logger);
                    }
                    try {
                        const e2eType = tag === 'plaintext' ? 'plaintext' : attrs.type;
                        switch (e2eType) {
                            case 'skmsg':
                                msgBuffer = await repository.decryptGroupMessage({
                                    group: sender,
                                    authorJid: author,
                                    msg: content
                                });
                                break;
                            case 'pkmsg':
                            case 'msg':
                                msgBuffer = await repository.decryptMessage({
                                    jid: decryptionJid,
                                    type: e2eType,
                                    ciphertext: content
                                });
                                break;
                            case 'msmsg':
                                if (botType !== null && !['full', 'last'].includes(botType))
                                    break;
                                const secretIdCandidates = [botEditTargetId, metaTargetId, fullMessage.key?.id].filter(Boolean);
                                const secretCandidates = [];
                                const seenSecrets = new Set();
                                for (const idCandidate of secretIdCandidates) {
                                    const byId = botMessageSecrets.get(idCandidate);
                                    if (!byId)
                                        continue;
                                    const fp = byId.toString('hex');
                                    if (!seenSecrets.has(fp)) {
                                        seenSecrets.add(fp);
                                        secretCandidates.push({ source: `id:${idCandidate}`, secret: byId });
                                    }
                                }
                                const chatRecent = botRecentSecretsByChat.get(sender) || [];
                                for (const item of chatRecent) {
                                    const fp = item.secret.toString('hex');
                                    if (!seenSecrets.has(fp)) {
                                        seenSecrets.add(fp);
                                        secretCandidates.push({ source: `chat:${item.id}`, secret: item.secret });
                                    }
                                    if (secretCandidates.length >= 6)
                                        break;
                                }
                                if (!secretCandidates.length) {
                                    logger.warn({ metaTargetId, botType, secretIdCandidates }, 'msmsg: no candidate messageSecret found, skipping');
                                    break;
                                }
                                {
                                    const msMsg = WAProto_1.proto.MessageSecretMessage.decode(content);
                                    const helperKey = {
                                        participant: author,
                                        meId: metaTargetSenderJid || `${meLid.split(`:`)[0]}@lid`,
                                        meLid,
                                        conversationJid: sender,
                                        senderJid: metaTargetSenderJid,
                                        botType,
                                        botEditTargetId,
                                        metaTargetId,
                                        stanzaId: stanza.attrs?.id,
                                        targetId: botEditTargetId || metaTargetId || stanza.attrs?.id,
                                        targetIdCandidates: secretIdCandidates
                                    };
                                    let decryptErr;
                                    const candidateAttemptSummaries = [];
                                    for (const candidate of secretCandidates) {
                                        try {
                                            msgBuffer = await (0, meta_ai_msmsg_1.decryptMsmsgBotMessage)(candidate.secret, helperKey, msMsg);
                                            logger.debug({ source: candidate.source }, 'msmsg: decrypted with candidate secret');
                                            break;
                                        }
                                        catch (e) {
                                            decryptErr = e;
                                            if (Array.isArray(e?.attemptedStrategies) && e.attemptedStrategies.length) {
                                                candidateAttemptSummaries.push({
                                                    secretSource: candidate.source,
                                                    attemptedStrategies: e.attemptedStrategies
                                                });
                                            }
                                        }
                                    }
                                    if (!msgBuffer && candidateAttemptSummaries.length) {
                                        logger.warn({
                                            secretCandidateSources: secretCandidates.map(candidate => candidate.source),
                                            attemptsBySecret: candidateAttemptSummaries
                                        }, 'msmsg: helper decryption failed for all candidate secrets');
                                    }
                                    if (!msgBuffer && decryptErr) {
                                        throw decryptErr;
                                    }
                                }
                                break;
                            case 'plaintext':
                                msgBuffer = content;
                                break;
                            default:
                                throw new Error(`Unknown e2e type: ${e2eType}`);
                        }
                        if (!msgBuffer) {
                            continue;
                        }
                        let msgToDecode;
                        if (e2eType === 'msmsg') {
                            msgToDecode = null;
                        }
                        else {
                            msgToDecode = e2eType !== 'plaintext' ? (0, generics_1.unpadRandomMax16)(msgBuffer) : msgBuffer;
                        }
                        let msg = e2eType === 'msmsg'
                            ? (0, meta_ai_msmsg_1.decodeDecryptedMsmsgMessage)(msgBuffer)
                            : index_js_1.proto.Message.decode(msgToDecode);
                        if (false) {
                        }
                        const outerMessageContextInfo = msg.messageContextInfo;
                        msg = msg.deviceSentMessage?.message || msg;
                        if (outerMessageContextInfo && !msg.messageContextInfo) {
                            msg.messageContextInfo = outerMessageContextInfo;
                        }
                        if (msg.senderKeyDistributionMessage) {
                            try {
                                await repository.processSenderKeyDistributionMessage({
                                    authorJid: author,
                                    item: msg.senderKeyDistributionMessage
                                });
                            }
                            catch (err) {
                                logger.error({ key: fullMessage.key, err }, 'failed to process sender key distribution message');
                            }
                        }
                        if (fullMessage.message) {
                            Object.assign(fullMessage.message, msg);
                        }
                        else {
                            fullMessage.message = msg;
                        }
                        {
                            const rich = fullMessage.message?.richResponseMessage;
                            if (rich && !rich.text) {
                                const decoded = decodeRichResponseMessage(rich);
                                if (decoded)
                                    rich.text = decoded;
                            }
                            const editedRich = fullMessage.message?.protocolMessage?.editedMessage?.richResponseMessage;
                            if (editedRich && !editedRich.text) {
                                const decoded = decodeRichResponseMessage(editedRich);
                                if (decoded)
                                    editedRich.text = decoded;
                            }
                        }
                        {
                            const secret = msg.messageContextInfo?.messageSecret;
                            if (secret) {
                                const secretBuf = Buffer.isBuffer(secret)
                                    ? secret
                                    : Buffer.from(secret.buffer, secret.byteOffset, secret.byteLength);
                                setBotMessageSecret(fullMessage.key.id, secretBuf, fullMessage.key.remoteJid);
                            }
                        }
                    }
                    catch (err) {
                        const errorContext = {
                            key: fullMessage.key,
                            err,
                            messageType: tag === 'plaintext' ? 'plaintext' : attrs.type,
                            sender,
                            author,
                            isSessionRecordError: isSessionRecordError(err)
                        };
                        logger.error(errorContext, 'failed to decrypt message');
                        fullMessage.messageStubType = index_js_1.proto.WebMessageInfo.StubType.CIPHERTEXT;
                        fullMessage.messageStubParameters = [err.message.toString()];
                    }
                }
            }
            if (!decryptables && !fullMessage.key?.isViewOnce) {
                fullMessage.messageStubType = index_js_1.proto.WebMessageInfo.StubType.CIPHERTEXT;
                fullMessage.messageStubParameters = [exports.NO_MESSAGE_FOUND_ERROR_TEXT];
            }
        }
    };
};
exports.decryptMessageNode = decryptMessageNode;
function decodeRichResponseMessage(richMsg) {
    try {
        if (!richMsg)
            return '';
        if (Array.isArray(richMsg.submessages) && richMsg.submessages.length > 0) {
            const sub = richMsg.submessages
                .map(s => s.messageText)
                .filter(Boolean)
                .join('\n');
            if (sub)
                return sub;
        }
        const data = richMsg.unifiedResponse?.data;
        if (!data)
            return '';
        const json = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
        const texts = [];
        for (const section of json.sections || []) {
            const prim = section?.view_model?.primitive;
            if (prim?.text)
                texts.push(prim.text);
            if (prim?.header)
                texts.push(prim.header);
            for (const sub of section?.view_model?.items || []) {
                if (sub?.primitive?.text)
                    texts.push(sub.primitive.text);
            }
        }
        return texts.join('\n');
    }
    catch (e) {
        return '';
    }
}
function isSessionRecordError(error) {
    const errorMessage = error?.message || error?.toString() || '';
    return exports.DECRYPTION_RETRY_CONFIG.sessionRecordErrors.some(errorPattern => errorMessage.includes(errorPattern));
}
