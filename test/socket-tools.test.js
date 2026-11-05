'use strict';

const { EventEmitter } = require('events');
const { createSendQueue, createReconnectManager } = require('../src/Utils/socket-tools');

describe('createSendQueue', () => {
    test('sends queued messages in order and exposes idle state', async () => {
        const calls = [];
        const sock = {
            sendMessage: async (jid, content) => {
                calls.push([jid, content.text]);
                return { key: { id: String(calls.length) } };
            }
        };
        const queue = createSendQueue(sock, { concurrency: 1 });
        const first = queue.sendMessage('a', { text: 'one' });
        const second = queue.sendMessage('b', { text: 'two' });

        await Promise.all([first, second]);
        await queue.onIdle();

        expect(calls).toEqual([['a', 'one'], ['b', 'two']]);
        expect(queue.pending).toBe(0);
        queue.close();
    });

    test('rejects new tasks after close', async () => {
        const queue = createSendQueue({ sendMessage: async () => true });
        queue.close();
        await expect(queue.sendMessage('a', { text: 'x' })).rejects.toThrow('closed');
    });
});

describe('createReconnectManager', () => {
    test('creates a socket and schedules reconnect after a close event', async () => {
        const sockets = [];
        const connect = jest.fn(async () => {
            const ev = new EventEmitter();
            const sock = { ev };
            sockets.push(sock);
            return sock;
        });
        const manager = createReconnectManager(connect, {
            minDelayMs: 100,
            maxDelayMs: 100,
            jitter: 0
        });

        const first = await manager.start();
        first.ev.emit('connection.update', { connection: 'open' });
        first.ev.emit('connection.update', {
            connection: 'close',
            lastDisconnect: { error: { output: { statusCode: 408 } } }
        });

        await new Promise(resolve => setTimeout(resolve, 140));
        expect(connect).toHaveBeenCalledTimes(2);
        expect(manager.socket).toBe(sockets[1]);
        manager.stop();
    });

    test('does not retry logged-out sessions by default', async () => {
        const ev = new EventEmitter();
        const connect = jest.fn(async () => ({ ev }));
        const manager = createReconnectManager(connect, {
            minDelayMs: 100,
            jitter: 0
        });

        const sock = await manager.start();
        sock.ev.emit('connection.update', {
            connection: 'close',
            lastDisconnect: { error: { output: { statusCode: 401 } } }
        });
        await new Promise(resolve => setTimeout(resolve, 140));

        expect(connect).toHaveBeenCalledTimes(1);
        manager.stop();
    });
});
