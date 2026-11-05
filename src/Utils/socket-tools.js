'use strict';

/**
 * Creates an opt-in outbound message queue around an existing Baileys socket.
 * It does not retry failed sends automatically because a timeout can happen
 * after WhatsApp has already accepted a message, and retrying could duplicate it.
 */
const createSendQueue = (sock, options = {}) => {
    if (!sock || typeof sock.sendMessage !== 'function') {
        throw new TypeError('createSendQueue requires a socket with sendMessage()');
    }

    const concurrency = Math.max(1, Math.floor(Number(options.concurrency) || 1));
    const intervalMs = Math.max(0, Math.floor(Number(options.intervalMs) || 0));
    const maxPending = Math.max(1, Math.floor(Number(options.maxPending) || 100));
    const queue = [];
    const idleWaiters = [];
    let active = 0;
    let closed = false;
    let lastStartedAt = 0;
    let timer = null;

    const settleIdle = () => {
        if (active === 0 && queue.length === 0) {
            while (idleWaiters.length) idleWaiters.shift()();
        }
    };

    const drain = () => {
        if (closed || timer) return;

        while (active < concurrency && queue.length > 0) {
            const waitMs = Math.max(0, intervalMs - (Date.now() - lastStartedAt));
            if (waitMs > 0) {
                timer = setTimeout(() => {
                    timer = null;
                    drain();
                }, waitMs);
                timer.unref?.();
                return;
            }

            const task = queue.shift();
            active += 1;
            lastStartedAt = Date.now();

            Promise.resolve()
                .then(() => sock.sendMessage(task.jid, task.content, task.sendOptions))
                .then(task.resolve, task.reject)
                .finally(() => {
                    active -= 1;
                    drain();
                    settleIdle();
                });
        }

        settleIdle();
    };

    return {
        sendMessage(jid, content, sendOptions) {
            if (closed) {
                return Promise.reject(new Error('Send queue is closed'));
            }
            if (active + queue.length >= maxPending) {
                return Promise.reject(new Error(`Send queue limit reached (${maxPending})`));
            }

            return new Promise((resolve, reject) => {
                queue.push({ jid, content, sendOptions, resolve, reject });
                drain();
            });
        },

        onIdle() {
            if (active === 0 && queue.length === 0) return Promise.resolve();
            return new Promise(resolve => idleWaiters.push(resolve));
        },

        close(reason = new Error('Send queue closed')) {
            if (closed) return 0;
            closed = true;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            const cancelled = queue.length;
            while (queue.length) {
                queue.shift().reject(reason);
            }
            settleIdle();
            return cancelled;
        },

        get pending() {
            return active + queue.length;
        },

        get size() {
            return queue.length;
        },

        get isClosed() {
            return closed;
        }
    };
};

/**
 * Opt-in reconnect supervisor. Pass a callback that creates a fresh socket
 * using the same persisted auth state. Logged-out sessions are not retried by
 * default. stop() cancels future reconnect attempts but does not close the
 * currently active socket.
 */
const createReconnectManager = (connect, options = {}) => {
    if (typeof connect !== 'function') {
        throw new TypeError('createReconnectManager requires a connect() function');
    }

    const minDelayMs = Math.max(100, Number(options.minDelayMs) || 1000);
    const maxDelayMs = Math.max(minDelayMs, Number(options.maxDelayMs) || 30000);
    const factor = Math.max(1, Number(options.factor) || 2);
    const jitter = Math.min(1, Math.max(0, Number(options.jitter) || 0.2));
    const loggedOutStatusCode = options.loggedOutStatusCode ?? 401;
    const shouldReconnect = typeof options.shouldReconnect === 'function'
        ? options.shouldReconnect
        : ({ statusCode }) => statusCode !== loggedOutStatusCode;

    let socket = null;
    let attempts = 0;
    let stopped = false;
    let retryTimer = null;
    let connectingPromise = null;
    let updateListener = null;

    const reportError = error => {
        try {
            options.onError?.(error);
        } catch {
            // User-provided error callbacks must not break reconnect management.
        }
    };

    const detach = () => {
        if (socket?.ev?.off && updateListener) {
            socket.ev.off('connection.update', updateListener);
        }
        updateListener = null;
    };

    const scheduleReconnect = update => {
        if (stopped || retryTimer) return;

        const statusCode =
            update?.lastDisconnect?.error?.output?.statusCode ??
            update?.error?.output?.statusCode ??
            update?.statusCode;

        const details = { ...update, statusCode, attempt: attempts + 1 };
        let allowed = false;
        try {
            allowed = Boolean(shouldReconnect(details));
        } catch (error) {
            reportError(error);
            return;
        }
        if (!allowed) {
            options.onGiveUp?.(details);
            return;
        }

        const baseDelay = Math.min(maxDelayMs, minDelayMs * Math.pow(factor, attempts));
        const delayMs = Math.min(
            maxDelayMs,
            Math.round(baseDelay + (Math.random() * baseDelay * jitter))
        );
        attempts += 1;
        options.onRetry?.({ ...details, delayMs });

        retryTimer = setTimeout(() => {
            retryTimer = null;
            start().catch(reportError);
        }, delayMs);
        retryTimer.unref?.();
    };

    const start = () => {
        if (stopped) return Promise.reject(new Error('Reconnect manager is stopped'));
        if (connectingPromise) return connectingPromise;
        if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
        }

        connectingPromise = Promise.resolve()
            .then(() => connect())
            .then(nextSocket => {
                if (!nextSocket?.ev?.on) {
                    throw new TypeError('connect() must return a Baileys socket with ev.on()');
                }
                detach();
                socket = nextSocket;
                updateListener = update => {
                    if (update?.connection === 'open') {
                        attempts = 0;
                    } else if (update?.connection === 'close') {
                        scheduleReconnect(update);
                    }
                };
                socket.ev.on('connection.update', updateListener);
                return socket;
            })
            .catch(error => {
                reportError(error);
                scheduleReconnect({ error });
                throw error;
            })
            .finally(() => {
                connectingPromise = null;
            });

        return connectingPromise;
    };

    const stop = () => {
        stopped = true;
        if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
        }
        detach();
    };

    return {
        start,
        stop,
        get socket() {
            return socket;
        },
        get attempts() {
            return attempts;
        },
        get stopped() {
            return stopped;
        }
    };
};

module.exports = {
    createSendQueue,
    createReconnectManager
};
