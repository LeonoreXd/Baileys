export interface StickerMetaOptions {
    packName?: string;
    packPublisher?: string;
    categories?: string[];
}
export function addExifToWebp(webpBuffer: Buffer, options?: StickerMetaOptions): Promise<Buffer>;
export function imageToWebpSticker(imageBuffer: Buffer, options?: StickerMetaOptions & {
    quality?: number;
}): Promise<Buffer>;
export function videoToWebpSticker(videoBuffer: Buffer, options?: StickerMetaOptions & {
    fps?: number;
    seconds?: number;
}): Promise<Buffer>;
