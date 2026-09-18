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
    const registry = new Map([['first', first]]);
    const player = Object.assign(Object.create(PlayerConnection.prototype), {
        playerId: 'viewer',
        subscribedStreamer: null,
        server: { streamerRegistry: { find: (id: string) => registry.get(id), getFirstStreamerId: () => 'first' } },
        streamerIdChangeListener: jest.fn(),
        streamerDisconnectedListener: jest.fn()
    }) as PlayerConnection;
    const commands = player as unknown as {
        subscribe(id: string): void;
        sendToStreamer(message: BaseMessage): void;
    };
    return { commands, first };
}

test('explicit subscription after an early layer preference preserves the negotiation', () => {
    const { commands, first } = fixture();
    commands.sendToStreamer({ type: 'layerPreference', spatialLayer: 0, temporalLayer: 0 } as BaseMessage);
    commands.subscribe('first');
    expect(first.protocol.sendMessage.mock.calls.map(([message]) => message.type)).toEqual([
        'playerConnected', 'layerPreference'
    ]);
});
