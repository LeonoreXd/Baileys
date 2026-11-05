export interface SessionPoolOptions {
    makeSocket: (sessionId: string) => Promise<any> | any;
    logger?: any;
    maxBackoffMs?: number;
    onSessionUpdate?: (sessionId: string, sock: any) => void;
    onLoggedOut?: (sessionId: string) => void;
}
export interface SessionPool {
    add: (sessionId: string) => Promise<void>;
    remove: (sessionId: string) => void;
    get: (sessionId: string) => any;
    list: () => string[];
}
export function createSessionPool(options: SessionPoolOptions): SessionPool;
