'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.imageToWebpSticker = exports.videoToWebpSticker = exports.addExifToWebp = void 0;
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const addExifToWebp = async (webpBuffer, { packName = '', packPublisher = '', categories = [] } = {}) => {
    const json = {
        'sticker-pack-id': crypto.randomBytes(16).toString('hex'),
        'sticker-pack-name': packName,
        'sticker-pack-publisher': packPublisher,
        emojis: categories.length ? categories : ['😀']
    };
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf-8');
    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16,
        0x00, 0x00, 0x00
    ]);
    exifAttr.writeUIntLE(jsonBuffer.length, 14, 4);
    const exifPayload = Buffer.concat([exifAttr, jsonBuffer]);
    const pad = buf => (buf.length % 2 === 1 ? Buffer.concat([buf, Buffer.from([0x00])]) : buf);
    const makeChunk = (tag, data) => {
        const sizeField = Buffer.alloc(4);
        sizeField.writeUInt32LE(data.length, 0);
        return Buffer.concat([Buffer.from(tag, 'ascii'), sizeField, pad(data)]);
    };
    const exifChunk = makeChunk('EXIF', exifPayload);
    if (webpBuffer.slice(0, 4).toString('ascii') !== 'RIFF' || webpBuffer.slice(8, 12).toString('ascii') !== 'WEBP') {
        throw new Error('addExifToWebp expects a valid WebP buffer');
    }
    let offset = 12;
    let vp8xChunk = null;
    let vp8xOffset = -1;
    const otherChunks = [];
    while (offset < webpBuffer.length) {
        const tag = webpBuffer.slice(offset, offset + 4).toString('ascii');
        const size = webpBuffer.readUInt32LE(offset + 4);
        const dataStart = offset + 8;
        const dataEnd = dataStart + size;
        const chunkTotal = 8 + size + (size % 2);
        if (tag === 'VP8X') {
            vp8xChunk = webpBuffer.slice(offset, offset + chunkTotal);
            vp8xOffset = offset;
        }
        else if (tag !== 'EXIF') {
            otherChunks.push(webpBuffer.slice(offset, offset + chunkTotal));
        }
        offset += chunkTotal;
    }
    let flags;
    let canvasWidth;
    let canvasHeight;
    if (vp8xChunk) {
        flags = vp8xChunk.readUInt8(8);
        canvasWidth = vp8xChunk.readUIntLE(12, 3) + 1;
        canvasHeight = vp8xChunk.readUIntLE(15, 3) + 1;
    }
    else {
        flags = 0;
        let sharp;
        try {
            sharp = require('sharp');
        }
        catch (error) {
            throw new Error('addExifToWebp needs the optional "sharp" dependency to read image dimensions');
        }
        const meta = await sharp(webpBuffer).metadata();
        canvasWidth = meta.width;
        canvasHeight = meta.height;
    }
    flags |= 0x08;
    const vp8xData = Buffer.alloc(10);
    vp8xData.writeUInt8(flags, 0);
    vp8xData.writeUIntLE(canvasWidth - 1, 4, 3);
    vp8xData.writeUIntLE(canvasHeight - 1, 7, 3);
    const newVp8xChunk = makeChunk('VP8X', vp8xData);
    const body = Buffer.concat([newVp8xChunk, ...otherChunks, exifChunk]);
    const fileSize = Buffer.alloc(4);
    fileSize.writeUInt32LE(4 + body.length, 0);
    return Buffer.concat([Buffer.from('RIFF', 'ascii'), fileSize, Buffer.from('WEBP', 'ascii'), body]);
};
exports.addExifToWebp = addExifToWebp;
const imageToWebpSticker = async (imageBuffer, options = {}) => {
    let sharp;
    try {
        sharp = require('sharp');
    }
    catch (error) {
        throw new Error('imageToWebpSticker requires the optional "sharp" dependency to be installed');
    }
    const webp = await sharp(imageBuffer)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: options.quality ?? 80 })
        .toBuffer();
    return addExifToWebp(webp, options);
};
exports.imageToWebpSticker = imageToWebpSticker;
const videoToWebpSticker = async (videoBuffer, options = {}) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xazbails-sticker-'));
    const inputPath = path.join(tmpDir, 'input.mp4');
    const outputPath = path.join(tmpDir, 'output.webp');
    fs.writeFileSync(inputPath, videoBuffer);
    const fps = options.fps ?? 10;
    const seconds = options.seconds ?? 5;
    const cmd = `ffmpeg -y -i ${inputPath} -t ${seconds} -vf ` +
        `"fps=${fps},scale=512:512:force_original_aspect_ratio=decrease,` +
        `pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,split[a][b];` +
        `[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse" ` +
        `-loop 0 -preset default -an -vsync 0 ${outputPath}`;
    try {
        await new Promise((resolve, reject) => {
            exec(cmd, err => (err ? reject(err) : resolve()));
        });
        const webp = fs.readFileSync(outputPath);
        return await addExifToWebp(webp, options);
    }
    finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
};
exports.videoToWebpSticker = videoToWebpSticker;
