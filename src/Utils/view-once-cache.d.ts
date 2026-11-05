export interface AutoCacheViewOnceOptions {
    cacheDir?: string;
    logger?: any;
    onCached?: (info: {
        id: string;
        jid: string;
        filePath: string;
        type: string;
    }) => void;
}
export function getViewOnceContent(message: any): Record<string, any> | null;
export function autoCacheViewOnceMedia(sock: any, options?: AutoCacheViewOnceOptions): () => void;
