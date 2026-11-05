'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.autoCacheViewOnceMedia = void 0;
const path = require('path');
const fs = require('fs');
const Messages_1 = require('./messages');
const MessagesMedia_1 = require('./messages-media');
const VIEW_ONCE_WRAPPER_KEYS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
const VIEW_ONCE_INNER_KEYS = ['imageMessage', 'videoMessage', 'audioMessage'];
const getViewOnceContent = message => {
    if (!message)
        return null;
    const content = (0, Messages_1.extractMessageContent)(message);
    if (!content)
        return null;
    for (const wrapperKey of VIEW_ONCE_WRAPPER_KEYS) {
        const wrapper = content[wrapperKey];
        if (wrapper?.message) {
            const inner = (0, Messages_1.extractMessageContent)(wrapper.message);
            if (inner)
                return inner;
        }
    }
    for (const key of VIEW_ONCE_INNER_KEYS) {
        if (content[key]?.viewOnce) {
            return { [key]: content[key] };
        }
    }
    return null;
};
const autoCacheViewOnceMedia = (sock, options = {}) => {
    const cacheDir = options.cacheDir || './viewonce-cache';
    const logger = options.logger || sock.logger;
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    const handler = async ({ messages, type }) => {
        if (type !== 'notify' && type !== 'append')
            return;
        for (const msg of messages) {
            try {
                const viewOnceContent = getViewOnceContent(msg.message);
                if (!viewOnceContent)
                    continue;
                const mediaType = Object.keys(viewOnceContent)[0];
                const buffer = await (0, Messages_1.downloadMediaMessage)(msg, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
                const extension = (0, MessagesMedia_1.extensionForMediaMessage)(viewOnceContent) || 'bin';
                const fileName = `${msg.key.id}.${extension}`;
                const filePath = path.join(cacheDir, fileName);
                fs.writeFileSync(filePath, buffer);
                logger?.debug?.({ id: msg.key.id, filePath, mediaType }, 'cached view-once media');
                options.onCached?.({ id: msg.key.id, jid: msg.key.remoteJid, filePath, type: mediaType });
            }
            catch (error) {
                logger?.warn?.({ error, id: msg.key?.id }, 'failed to cache view-once media');
            }
        }
    };
    sock.ev.on('messages.upsert', handler);
    return () => sock.ev.off('messages.upsert', handler);
};
exports.autoCacheViewOnceMedia = autoCacheViewOnceMedia;
exports.getViewOnceContent = getViewOnceContent;
