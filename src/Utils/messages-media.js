'use strict';
var __createBinding = (this && this.__createBinding) ||
    (Object.create
        ? function (o, m, k, k2) {
            if (k2 === undefined)
                k2 = k;
            var desc = Object.getOwnPropertyDescriptor(m, k);
            if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                desc = {
                    enumerable: true,
                    get: function () {
                        return m[k];
                    }
                };
            }
            Object.defineProperty(o, k2, desc);
        }
        : function (o, m, k, k2) {
            if (k2 === undefined)
                k2 = k;
            o[k2] = m[k];
        });
var __setModuleDefault = (this && this.__setModuleDefault) ||
    (Object.create
        ? function (o, v) {
            Object.defineProperty(o, 'default', { enumerable: true, value: v });
        }
        : function (o, v) {
            o['default'] = v;
        });
var __importStar = (this && this.__importStar) ||
    (function () {
        var ownKeys = function (o) {
            ownKeys =
                Object.getOwnPropertyNames ||
                    function (o) {
                        var ar = [];
                        for (var k in o)
                            if (Object.prototype.hasOwnProperty.call(o, k))
                                ar[ar.length] = k;
                        return ar;
                    };
            return ownKeys(o);
        };
        return function (mod) {
            if (mod && mod.__esModule)
                return mod;
            var result = {};
            if (mod != null)
                for (var k = ownKeys(mod), i = 0; i < k.length; i++)
                    if (k[i] !== 'default')
                        __createBinding(result, mod, k[i]);
            __setModuleDefault(result, mod);
            return result;
        };
    })();
Object.defineProperty(exports, '__esModule', { value: true });
exports.getStatusCodeForMediaRetry =
    exports.decryptMediaRetryData =
        exports.decodeMediaRetryNode =
            exports.encryptMediaRetryRequest =
                exports.getWAUploadToServer =
                    exports.uploadWithNodeHttp =
                        exports.downloadEncryptedContent =
                            exports.downloadContentFromMessage =
                                exports.getUrlFromDirectPath =
                                    exports.encryptedStream =
                                        exports.getHttpStream =
                                            exports.getStream =
                                                exports.toBuffer =
                                                    exports.toReadable =
                                                        exports.mediaMessageSHA256B64 =
                                                            exports.generateProfilePicture =
                                                                exports.encodeBase64EncodedStringForUpload =
                                                                    exports.extractImageThumb =
                                                                        exports.getRawMediaUploadData =
                                                                            exports.hkdfInfoKey =
                                                                                void 0;
exports.getMediaKeys = getMediaKeys;
exports.getAudioDuration = getAudioDuration;
exports.getAudioWaveform = getAudioWaveform;
exports.generateThumbnail = generateThumbnail;
exports.extensionForMediaMessage = extensionForMediaMessage;
const boom_1 = require('@hapi/boom');
const child_process_1 = require('child_process');
const Crypto = __importStar(require('crypto'));
const events_1 = require('events');
const fs_1 = require('fs');
const os_1 = require('os');
const path_1 = require('path');
const stream_1 = require('stream');
const url_1 = require('url');
const index_js_1 = require('../../WAProto/index.js');
const Defaults_1 = require('../Defaults');
const WABinary_1 = require('../WABinary');
const crypto_1 = require('./crypto');
const generics_1 = require('./generics');
const getTmpFilesDirectory = () => (0, os_1.tmpdir)();
const getImageProcessingLibrary = async () => {
    const [jimp, sharp] = await Promise.all([
        Promise.resolve()
            .then(() => __importStar(require('jimp')))
            .catch(() => { }),
        Promise.resolve()
            .then(() => __importStar(require('sharp')))
            .catch(() => { })
    ]);
    if (sharp) {
        return { sharp };
    }
    if (jimp) {
        return { jimp };
    }
    throw new boom_1.Boom('No image processing library available');
};
const hkdfInfoKey = type => {
    const hkdfInfo = Defaults_1.MEDIA_HKDF_KEY_MAPPING[type];
    return `WhatsApp ${hkdfInfo} Keys`;
};
exports.hkdfInfoKey = hkdfInfoKey;
const getRawMediaUploadData = async (media, mediaType, logger) => {
    const { stream } = await (0, exports.getStream)(media);
    logger?.debug('got stream for raw upload');
    const hasher = Crypto.createHash('sha256');
    const filePath = (0, path_1.join)((0, os_1.tmpdir)(), mediaType + (0, generics_1.generateMessageIDV2)());
    const fileWriteStream = (0, fs_1.createWriteStream)(filePath);
    let fileLength = 0;
    try {
        for await (const data of stream) {
            fileLength += data.length;
            hasher.update(data);
            if (!fileWriteStream.write(data)) {
                await (0, events_1.once)(fileWriteStream, 'drain');
            }
        }
        fileWriteStream.end();
        await (0, events_1.once)(fileWriteStream, 'finish');
        stream.destroy();
        const fileSha256 = hasher.digest();
        logger?.debug('hashed data for raw upload');
        return {
            filePath: filePath,
            fileSha256,
            fileLength
        };
    }
    catch (error) {
        fileWriteStream.destroy();
        stream.destroy();
        try {
            await fs_1.promises.unlink(filePath);
        }
        catch {
        }
        throw error;
    }
};
exports.getRawMediaUploadData = getRawMediaUploadData;
async function getMediaKeys(buffer, mediaType) {
    if (!buffer) {
        throw new boom_1.Boom('Cannot derive from empty media key');
    }
    if (typeof buffer === 'string') {
        buffer = Buffer.from(buffer.replace('data:;base64,', ''), 'base64');
    }
    const expandedMediaKey = (0, crypto_1.hkdf)(buffer, 112, { info: (0, exports.hkdfInfoKey)(mediaType) });
    return {
        iv: expandedMediaKey.slice(0, 16),
        cipherKey: expandedMediaKey.slice(16, 48),
        macKey: expandedMediaKey.slice(48, 80)
    };
}
const extractVideoThumb = async (path, destPath, time, size) => new Promise((resolve, reject) => {
    const cmd = `ffmpeg -ss ${time} -i ${path} -y -vf scale=${size.width}:-1 -vframes 1 -f image2 ${destPath}`;
    (0, child_process_1.exec)(cmd, err => {
        if (err) {
            reject(err);
        }
        else {
            resolve();
        }
    });
});
const extractImageThumb = async (bufferOrFilePath, width = 32) => {
    if (bufferOrFilePath instanceof stream_1.Readable) {
        bufferOrFilePath = await (0, exports.toBuffer)(bufferOrFilePath);
    }
    const lib = await getImageProcessingLibrary();
    if ('sharp' in lib && typeof lib.sharp?.default === 'function') {
        const img = lib.sharp.default(bufferOrFilePath);
        const dimensions = await img.metadata();
        const buffer = await img.resize(width).jpeg({ quality: 50 }).toBuffer();
        return {
            buffer,
            original: {
                width: dimensions.width,
                height: dimensions.height
            }
        };
    }
    else if ('jimp' in lib && typeof lib.jimp?.Jimp === 'object') {
        const jimp = await lib.jimp.Jimp.read(bufferOrFilePath);
        const dimensions = {
            width: jimp.width,
            height: jimp.height
        };
        const buffer = await jimp
            .resize({ w: width, mode: lib.jimp.ResizeStrategy.BILINEAR })
            .getBuffer('image/jpeg', { quality: 50 });
        return {
            buffer,
            original: dimensions
        };
    }
    else {
        throw new boom_1.Boom('No image processing library available');
    }
};
exports.extractImageThumb = extractImageThumb;
const encodeBase64EncodedStringForUpload = b64 => encodeURIComponent(b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/\=+$/, ''));
exports.encodeBase64EncodedStringForUpload = encodeBase64EncodedStringForUpload;
const generateProfilePicture = async (mediaUpload, dimensions) => {
    let buffer;
    const { width: w = 640, height: h = 640 } = dimensions || {};
    if (Buffer.isBuffer(mediaUpload)) {
        buffer = mediaUpload;
    }
    else {
        const { stream } = await (0, exports.getStream)(mediaUpload);
        buffer = await (0, exports.toBuffer)(stream);
    }
    const lib = await getImageProcessingLibrary();
    let img;
    if ('sharp' in lib && typeof lib.sharp?.default === 'function') {
        img = lib.sharp
            .default(buffer)
            .resize(w, h)
            .jpeg({
            quality: 50
        })
            .toBuffer();
    }
    else if ('jimp' in lib && typeof lib.jimp?.Jimp === 'function') {
        const jimp = await lib.jimp.Jimp.read(buffer);
        const min = Math.min(jimp.width, jimp.height);
        const cropped = jimp.crop({ x: 0, y: 0, w: min, h: min });
        img = cropped.resize({ w, h, mode: lib.jimp.ResizeStrategy.BILINEAR }).getBuffer('image/jpeg', { quality: 50 });
    }
    else {
        throw new boom_1.Boom('No image processing library available');
    }
    return {
        img: await img
    };
};
exports.generateProfilePicture = generateProfilePicture;
const mediaMessageSHA256B64 = message => {
    const media = Object.values(message)[0];
    return media?.fileSha256 && Buffer.from(media.fileSha256).toString('base64');
};
exports.mediaMessageSHA256B64 = mediaMessageSHA256B64;
async function getAudioDuration(buffer) {
    const musicMetadata = await Promise.resolve().then(() => __importStar(require('music-metadata')));
    let metadata;
    const options = {
        duration: true
    };
    if (Buffer.isBuffer(buffer)) {
        metadata = await musicMetadata.parseBuffer(buffer, undefined, options);
    }
    else if (typeof buffer === 'string') {
        metadata = await musicMetadata.parseFile(buffer, options);
    }
    else {
        metadata = await musicMetadata.parseStream(buffer, undefined, options);
    }
    return metadata.format.duration;
}
async function getAudioWaveform(buffer, logger) {
    try {
        const { default: decoder } = await Promise.resolve().then(() => __importStar(require('audio-decode')));
        let audioData;
        if (Buffer.isBuffer(buffer)) {
            audioData = buffer;
        }
        else if (typeof buffer === 'string') {
            const rStream = (0, fs_1.createReadStream)(buffer);
            audioData = await (0, exports.toBuffer)(rStream);
        }
        else {
            audioData = await (0, exports.toBuffer)(buffer);
        }
        const audioBuffer = await decoder(audioData);
        const rawData = audioBuffer.getChannelData(0);
        const samples = 64;
        const blockSize = Math.floor(rawData.length / samples);
        const filteredData = [];
        for (let i = 0; i < samples; i++) {
            const blockStart = blockSize * i;
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
                sum = sum + Math.abs(rawData[blockStart + j]);
            }
            filteredData.push(sum / blockSize);
        }
        const multiplier = Math.pow(Math.max(...filteredData), -1);
        const normalizedData = filteredData.map(n => n * multiplier);
        const waveform = new Uint8Array(normalizedData.map(n => Math.floor(100 * n)));
        return waveform;
    }
    catch (e) {
        logger?.debug('Failed to generate waveform: ' + e);
    }
}
const toReadable = buffer => {
    const readable = new stream_1.Readable({ read: () => { } });
    readable.push(buffer);
    readable.push(null);
    return readable;
};
exports.toReadable = toReadable;
const toBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    stream.destroy();
    return Buffer.concat(chunks);
};
exports.toBuffer = toBuffer;
const getStream = async (item, opts) => {
    if (Buffer.isBuffer(item)) {
        return { stream: (0, exports.toReadable)(item), type: 'buffer' };
    }
    if ('stream' in item) {
        return { stream: item.stream, type: 'readable' };
    }
    const urlStr = item.url.toString();
    if (urlStr.startsWith('data:')) {
        const buffer = Buffer.from(urlStr.split(',')[1], 'base64');
        return { stream: (0, exports.toReadable)(buffer), type: 'buffer' };
    }
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://')) {
        return { stream: await (0, exports.getHttpStream)(item.url, opts), type: 'remote' };
    }
    return { stream: (0, fs_1.createReadStream)(item.url), type: 'file' };
};
exports.getStream = getStream;
async function generateThumbnail(file, mediaType, options) {
    let thumbnail;
    let originalImageDimensions;
    if (mediaType === 'image') {
        const { buffer, original } = await (0, exports.extractImageThumb)(file);
        thumbnail = buffer.toString('base64');
        if (original.width && original.height) {
            originalImageDimensions = {
                width: original.width,
                height: original.height
            };
        }
    }
    else if (mediaType === 'video') {
        const imgFilename = (0, path_1.join)(getTmpFilesDirectory(), (0, generics_1.generateMessageIDV2)() + '.jpg');
        try {
            await extractVideoThumb(file, imgFilename, '00:00:00', { width: 32, height: 32 });
            const buff = await fs_1.promises.readFile(imgFilename);
            thumbnail = buff.toString('base64');
            await fs_1.promises.unlink(imgFilename);
        }
        catch (err) {
            options.logger?.debug('could not generate video thumb: ' + err);
        }
    }
    return {
        thumbnail,
        originalImageDimensions
    };
}
const getHttpStream = async (url, options = {}) => {
    const response = await fetch(url.toString(), {
        dispatcher: options.dispatcher,
        method: 'GET',
        headers: options.headers
    });
    if (!response.ok) {
        throw new boom_1.Boom(`Failed to fetch stream from ${url}`, { statusCode: response.status, data: { url } });
    }
    return response.body instanceof stream_1.Readable ? response.body : stream_1.Readable.fromWeb(response.body);
};
exports.getHttpStream = getHttpStream;
const encryptedStream = async (media, mediaType, { logger, saveOriginalFileIfRequired, opts } = {}) => {
    const { stream, type } = await (0, exports.getStream)(media, opts);
    logger?.debug('fetched media stream');
    const mediaKey = Crypto.randomBytes(32);
    const { cipherKey, iv, macKey } = await getMediaKeys(mediaKey, mediaType);
    const encFilePath = (0, path_1.join)(getTmpFilesDirectory(), mediaType + (0, generics_1.generateMessageIDV2)() + '-enc');
    const encFileWriteStream = (0, fs_1.createWriteStream)(encFilePath);
    let originalFileStream;
    let originalFilePath;
    if (saveOriginalFileIfRequired) {
        originalFilePath = (0, path_1.join)(getTmpFilesDirectory(), mediaType + (0, generics_1.generateMessageIDV2)() + '-original');
        originalFileStream = (0, fs_1.createWriteStream)(originalFilePath);
    }
    let fileLength = 0;
    const aes = Crypto.createCipheriv('aes-256-cbc', cipherKey, iv);
    const hmac = Crypto.createHmac('sha256', macKey).update(iv);
    const sha256Plain = Crypto.createHash('sha256');
    const sha256Enc = Crypto.createHash('sha256');
    const onChunk = async (buff) => {
        sha256Enc.update(buff);
        hmac.update(buff);
        if (!encFileWriteStream.write(buff)) {
            await (0, events_1.once)(encFileWriteStream, 'drain');
        }
    };
    try {
        for await (const data of stream) {
            fileLength += data.length;
            if (type === 'remote' && opts?.maxContentLength && fileLength + data.length > opts.maxContentLength) {
                throw new boom_1.Boom(`content length exceeded when encrypting "${type}"`, {
                    data: { media, type }
                });
            }
            if (originalFileStream) {
                if (!originalFileStream.write(data)) {
                    await (0, events_1.once)(originalFileStream, 'drain');
                }
            }
            sha256Plain.update(data);
            await onChunk(aes.update(data));
        }
        await onChunk(aes.final());
        const mac = hmac.digest().slice(0, 10);
        sha256Enc.update(mac);
        const fileSha256 = sha256Plain.digest();
        const fileEncSha256 = sha256Enc.digest();
        encFileWriteStream.write(mac);
        const encFinishPromise = (0, events_1.once)(encFileWriteStream, 'finish');
        const originalFinishPromise = originalFileStream
            ? (0, events_1.once)(originalFileStream, 'finish')
            : Promise.resolve();
        encFileWriteStream.end();
        originalFileStream?.end?.();
        stream.destroy();
        await encFinishPromise;
        await originalFinishPromise;
        logger?.debug('encrypted data successfully');
        return {
            mediaKey,
            originalFilePath,
            encFilePath,
            mac,
            fileEncSha256,
            fileSha256,
            fileLength
        };
    }
    catch (error) {
        encFileWriteStream.destroy();
        originalFileStream?.destroy?.();
        aes.destroy();
        hmac.destroy();
        sha256Plain.destroy();
        sha256Enc.destroy();
        stream.destroy();
        try {
            await fs_1.promises.unlink(encFilePath);
            if (originalFilePath) {
                await fs_1.promises.unlink(originalFilePath);
            }
        }
        catch (err) {
            logger?.error({ err }, 'failed deleting tmp files');
        }
        throw error;
    }
};
exports.encryptedStream = encryptedStream;
const DEF_HOST = 'mmg.whatsapp.net';
const AES_CHUNK_SIZE = 16;
const toSmallestChunkSize = num => {
    return Math.floor(num / AES_CHUNK_SIZE) * AES_CHUNK_SIZE;
};
const getUrlFromDirectPath = directPath => `https://${DEF_HOST}${directPath}`;
exports.getUrlFromDirectPath = getUrlFromDirectPath;
const downloadContentFromMessage = async ({ mediaKey, directPath, url }, type, opts = {}) => {
    const isValidMediaUrl = url?.startsWith('https://mmg.whatsapp.net/');
    const downloadUrl = isValidMediaUrl ? url : (0, exports.getUrlFromDirectPath)(directPath);
    if (!downloadUrl) {
        throw new boom_1.Boom('No valid media URL or directPath present in message', { statusCode: 400 });
    }
    const keys = await getMediaKeys(mediaKey, type);
    return (0, exports.downloadEncryptedContent)(downloadUrl, keys, opts);
};
exports.downloadContentFromMessage = downloadContentFromMessage;
const downloadEncryptedContent = async (downloadUrl, { cipherKey, iv }, { startByte, endByte, options } = {}) => {
    let bytesFetched = 0;
    let startChunk = 0;
    let firstBlockIsIV = false;
    if (startByte) {
        const chunk = toSmallestChunkSize(startByte || 0);
        if (chunk) {
            startChunk = chunk - AES_CHUNK_SIZE;
            bytesFetched = chunk;
            firstBlockIsIV = true;
        }
    }
    const endChunk = endByte ? toSmallestChunkSize(endByte || 0) + AES_CHUNK_SIZE : undefined;
    const headersInit = options?.headers ? options.headers : undefined;
    const headers = {
        ...(headersInit ? (Array.isArray(headersInit) ? Object.fromEntries(headersInit) : headersInit) : {}),
        Origin: Defaults_1.DEFAULT_ORIGIN
    };
    if (startChunk || endChunk) {
        headers.Range = `bytes=${startChunk}-`;
        if (endChunk) {
            headers.Range += endChunk;
        }
    }
    const fetched = await (0, exports.getHttpStream)(downloadUrl, {
        ...(options || {}),
        headers
    });
    let remainingBytes = Buffer.from([]);
    let aes;
    const pushBytes = (bytes, push) => {
        if (startByte || endByte) {
            const start = bytesFetched >= startByte ? undefined : Math.max(startByte - bytesFetched, 0);
            const end = bytesFetched + bytes.length < endByte ? undefined : Math.max(endByte - bytesFetched, 0);
            push(bytes.slice(start, end));
            bytesFetched += bytes.length;
        }
        else {
            push(bytes);
        }
    };
    const output = new stream_1.Transform({
        transform(chunk, _, callback) {
            let data = Buffer.concat([remainingBytes, chunk]);
            const decryptLength = toSmallestChunkSize(data.length);
            remainingBytes = data.slice(decryptLength);
            data = data.slice(0, decryptLength);
            if (!aes) {
                let ivValue = iv;
                if (firstBlockIsIV) {
                    ivValue = data.slice(0, AES_CHUNK_SIZE);
                    data = data.slice(AES_CHUNK_SIZE);
                }
                aes = Crypto.createDecipheriv('aes-256-cbc', cipherKey, ivValue);
                if (endByte) {
                    aes.setAutoPadding(false);
                }
            }
            try {
                pushBytes(aes.update(data), b => this.push(b));
                callback();
            }
            catch (error) {
                callback(error);
            }
        },
        final(callback) {
            try {
                pushBytes(aes.final(), b => this.push(b));
                callback();
            }
            catch (error) {
                callback(error);
            }
        }
    });
    return fetched.pipe(output, { end: true });
};
exports.downloadEncryptedContent = downloadEncryptedContent;
function extensionForMediaMessage(message) {
    const getExtension = mimetype => mimetype.split(';')[0]?.split('/')[1];
    const type = Object.keys(message)[0];
    let extension;
    if (type === 'locationMessage' || type === 'liveLocationMessage' || type === 'productMessage') {
        extension = '.jpeg';
    }
    else {
        const messageContent = message[type];
        extension = getExtension(messageContent.mimetype);
    }
    return extension;
}
const isNodeRuntime = () => {
    return (typeof process !== 'undefined' &&
        process.versions?.node !== null &&
        typeof process.versions.bun === 'undefined' &&
        typeof globalThis.Deno === 'undefined');
};
const uploadWithNodeHttp = async ({ url, filePath, headers, timeoutMs, agent }, redirectCount = 0) => {
    if (redirectCount > 5) {
        throw new Error('Too many redirects');
    }
    const parsedUrl = new url_1.URL(url);
    const httpModule = parsedUrl.protocol === 'https:'
        ? await Promise.resolve().then(() => __importStar(require('https')))
        : await Promise.resolve().then(() => __importStar(require('http')));
    const fileStats = await fs_1.promises.stat(filePath);
    const fileSize = fileStats.size;
    return new Promise((resolve, reject) => {
        const req = httpModule.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                ...headers,
                'Content-Length': fileSize
            },
            agent,
            timeout: timeoutMs
        }, res => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                const newUrl = new url_1.URL(res.headers.location, url).toString();
                resolve((0, exports.uploadWithNodeHttp)({
                    url: newUrl,
                    filePath,
                    headers,
                    timeoutMs,
                    agent
                }, redirectCount + 1));
                return;
            }
            let body = '';
            res.on('data', chunk => (body += chunk));
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (parsed && typeof parsed === 'object') {
                        Object.defineProperty(parsed, '__statusCode', { value: res.statusCode, enumerable: false });
                    }
                    resolve(parsed);
                }
                catch {
                    resolve({ __statusCode: res.statusCode });
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Upload timeout'));
        });
        const stream = (0, fs_1.createReadStream)(filePath);
        stream.pipe(req);
        stream.on('error', err => {
            req.destroy();
            reject(err);
        });
    });
};
exports.uploadWithNodeHttp = uploadWithNodeHttp;
const uploadWithFetch = async ({ url, filePath, headers, timeoutMs, agent }) => {
    const nodeStream = (0, fs_1.createReadStream)(filePath);
    const webStream = stream_1.Readable.toWeb(nodeStream);
    const response = await fetch(url, {
        dispatcher: agent,
        method: 'POST',
        body: webStream,
        headers,
        duplex: 'half',
        signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
    });
    try {
        const parsed = await response.json();
        if (parsed && typeof parsed === 'object') {
            Object.defineProperty(parsed, '__statusCode', { value: response.status, enumerable: false });
        }
        return parsed;
    }
    catch {
        return { __statusCode: response.status };
    }
};
const uploadMedia = async (params, logger) => {
    if (isNodeRuntime()) {
        logger?.debug('Using Node.js https module for upload (avoids undici buffering bug)');
        return (0, exports.uploadWithNodeHttp)(params);
    }
    else {
        logger?.debug('Using web-standard Fetch API for upload');
        return uploadWithFetch(params);
    }
};
const getWAUploadToServer = ({ customUploadHosts, fetchAgent, logger, options }, refreshMediaConn) => {
    return async (filePath, { mediaType, fileEncSha256B64, timeoutMs }) => {
        let uploadInfo = await refreshMediaConn(false);
        let urls;
        const hosts = [...customUploadHosts, ...uploadInfo.hosts];
        fileEncSha256B64 = (0, exports.encodeBase64EncodedStringForUpload)(fileEncSha256B64);
        const customHeaders = (() => {
            const hdrs = options?.headers;
            if (!hdrs)
                return {};
            return Array.isArray(hdrs) ? Object.fromEntries(hdrs) : hdrs;
        })();
        const headers = {
            ...customHeaders,
            'Content-Type': 'application/octet-stream',
            Origin: Defaults_1.DEFAULT_ORIGIN
        };
        for (const { hostname } of hosts) {
            logger.debug(`uploading to "${hostname}"`);
            const auth = encodeURIComponent(uploadInfo.auth);
            const url = `https://${hostname}${Defaults_1.MEDIA_PATH_MAP[mediaType]}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}`;
            let result;
            const maxRateLimitRetries = 3;
            for (let attempt = 0; attempt <= maxRateLimitRetries; attempt++) {
                try {
                    result = await uploadMedia({
                        url,
                        filePath,
                        headers,
                        timeoutMs,
                        agent: fetchAgent
                    }, logger);
                    const isRateLimited = result?.__statusCode === 429 || result?.__statusCode === 503;
                    if (isRateLimited && attempt < maxRateLimitRetries) {
                        const backoffMs = Math.min(500 * 2 ** attempt, 8000) + Math.floor(Math.random() * 250);
                        logger.warn({ hostname, attempt, backoffMs, statusCode: result.__statusCode }, 'media upload rate-limited, backing off before retry');
                        await new Promise(resolve => setTimeout(resolve, backoffMs));
                        continue;
                    }
                    if (result?.url || result?.direct_path) {
                        urls = {
                            mediaUrl: result.url,
                            directPath: result.direct_path,
                            meta_hmac: result.meta_hmac,
                            fbid: result.fbid,
                            ts: result.ts
                        };
                    }
                    else {
                        uploadInfo = await refreshMediaConn(true);
                        throw new Error(`upload failed, reason: ${JSON.stringify(result)}`);
                    }
                    break;
                }
                catch (error) {
                    const isLast = hostname === hosts[uploadInfo.hosts.length - 1]?.hostname;
                    logger.warn({ trace: error?.stack, uploadResult: result }, `Error in uploading to ${hostname} ${isLast ? '' : ', retrying...'}`);
                    break;
                }
            }
            if (urls)
                break;
        }
        if (!urls) {
            throw new boom_1.Boom('Media upload failed on all hosts', { statusCode: 500 });
        }
        return urls;
    };
};
exports.getWAUploadToServer = getWAUploadToServer;
const getMediaRetryKey = mediaKey => {
    return (0, crypto_1.hkdf)(mediaKey, 32, { info: 'WhatsApp Media Retry Notification' });
};
const encryptMediaRetryRequest = (key, mediaKey, meId) => {
    const recp = { stanzaId: key.id };
    const recpBuffer = index_js_1.proto.ServerErrorReceipt.encode(recp).finish();
    const iv = Crypto.randomBytes(12);
    const retryKey = getMediaRetryKey(mediaKey);
    const ciphertext = (0, crypto_1.aesEncryptGCM)(recpBuffer, retryKey, iv, Buffer.from(key.id));
    const req = {
        tag: 'receipt',
        attrs: {
            id: key.id,
            to: (0, WABinary_1.jidNormalizedUser)(meId),
            type: 'server-error'
        },
        content: [
            {
                tag: 'encrypt',
                attrs: {},
                content: [
                    { tag: 'enc_p', attrs: {}, content: ciphertext },
                    { tag: 'enc_iv', attrs: {}, content: iv }
                ]
            },
            {
                tag: 'rmr',
                attrs: {
                    jid: key.remoteJid,
                    from_me: (!!key.fromMe).toString(),
                    participant: key.participant || undefined
                }
            }
        ]
    };
    return req;
};
exports.encryptMediaRetryRequest = encryptMediaRetryRequest;
const decodeMediaRetryNode = node => {
    const rmrNode = (0, WABinary_1.getBinaryNodeChild)(node, 'rmr');
    const event = {
        key: {
            id: node.attrs.id,
            remoteJid: rmrNode.attrs.jid,
            fromMe: rmrNode.attrs.from_me === 'true',
            participant: rmrNode.attrs.participant
        }
    };
    const errorNode = (0, WABinary_1.getBinaryNodeChild)(node, 'error');
    if (errorNode) {
        const errorCode = +errorNode.attrs.code;
        event.error = new boom_1.Boom(`Failed to re-upload media (${errorCode})`, {
            data: errorNode.attrs,
            statusCode: (0, exports.getStatusCodeForMediaRetry)(errorCode)
        });
    }
    else {
        const encryptedInfoNode = (0, WABinary_1.getBinaryNodeChild)(node, 'encrypt');
        const ciphertext = (0, WABinary_1.getBinaryNodeChildBuffer)(encryptedInfoNode, 'enc_p');
        const iv = (0, WABinary_1.getBinaryNodeChildBuffer)(encryptedInfoNode, 'enc_iv');
        if (ciphertext && iv) {
            event.media = { ciphertext, iv };
        }
        else {
            event.error = new boom_1.Boom('Failed to re-upload media (missing ciphertext)', { statusCode: 404 });
        }
    }
    return event;
};
exports.decodeMediaRetryNode = decodeMediaRetryNode;
const decryptMediaRetryData = ({ ciphertext, iv }, mediaKey, msgId) => {
    const retryKey = getMediaRetryKey(mediaKey);
    const plaintext = (0, crypto_1.aesDecryptGCM)(ciphertext, retryKey, iv, Buffer.from(msgId));
    return index_js_1.proto.MediaRetryNotification.decode(plaintext);
};
exports.decryptMediaRetryData = decryptMediaRetryData;
const getStatusCodeForMediaRetry = code => MEDIA_RETRY_STATUS_MAP[code];
exports.getStatusCodeForMediaRetry = getStatusCodeForMediaRetry;
const MEDIA_RETRY_STATUS_MAP = {
    [index_js_1.proto.MediaRetryNotification.ResultType.SUCCESS]: 200,
    [index_js_1.proto.MediaRetryNotification.ResultType.DECRYPTION_ERROR]: 412,
    [index_js_1.proto.MediaRetryNotification.ResultType.NOT_FOUND]: 404,
    [index_js_1.proto.MediaRetryNotification.ResultType.GENERAL_ERROR]: 418
};
