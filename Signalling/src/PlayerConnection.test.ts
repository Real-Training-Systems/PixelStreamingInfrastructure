import { EventEmitter } from 'events';
import { PlayerConnection } from './PlayerConnection';
import { BaseMessage } from '@epicgames-ps/lib-pixelstreamingcommon-ue5.7';

function fixture() {
    const makeStreamer = (streamerId: string) => Object.assign(new EventEmitter(), {
        streamerId,
        maxSubscribers: 0,
        subscribers: new Set<string>(),
        protocol: { sendMessage: jest.fn() },
        getReadableIdentifier: () => streamerId
    });
    const first = makeStreamer('first');
    const second = makeStreamer('second');
    const registry = new Map([['first', first], ['second', second]]);
    const player = Object.assign(Object.create(PlayerConnection.prototype), {
        playerId: 'viewer',
        subscribedStreamer: null,
        server: { streamerRegistry: { find: (id: string) => registry.get(id), getFirstStreamerId: () => 'first' } },
        streamerIdChangeListener: jest.fn(),
        streamerDisconnectedListener: jest.fn()
    }) as PlayerConnection;
    const commands = player as unknown as {
        subscribe(id: string): void;
        unsubscribe(): void;
        sendToStreamer(message: BaseMessage): void;
    };
    return { player, commands, first, second };
}

test('explicit subscription after an early layer preference preserves the negotiation', () => {
    const { commands, first } = fixture();
    commands.sendToStreamer({ type: 'layerPreference', spatialLayer: 0, temporalLayer: 0 } as BaseMessage);
    commands.subscribe('first');
    expect(first.protocol.sendMessage.mock.calls.map(([message]) => message.type)).toEqual([
        'playerConnected', 'layerPreference'
    ]);
    expect(first.listenerCount('disconnect')).toBe(1);
});

test('switching streamer still disconnects the old peer and connects the new one', () => {
    const { player, commands, first, second } = fixture();
    commands.subscribe('first');
    commands.subscribe('second');
    expect(first.protocol.sendMessage.mock.calls.map(([message]) => message.type)).toEqual([
        'playerConnected', 'playerDisconnected'
    ]);
    expect(second.protocol.sendMessage.mock.calls.map(([message]) => message.type)).toEqual(['playerConnected']);
    expect(player.subscribedStreamer).toBe(second);
    expect(first.subscribers.size).toBe(0);
});

test('explicit unsubscribe followed by subscribe starts a fresh negotiation', () => {
    const { commands, first } = fixture();
    commands.subscribe('first');
    commands.unsubscribe();
    commands.subscribe('first');
    expect(first.protocol.sendMessage.mock.calls.map(([message]) => message.type)).toEqual([
        'playerConnected', 'playerDisconnected', 'playerConnected'
    ]);
});
