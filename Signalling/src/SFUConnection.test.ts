import { SFUConnection } from './SFUConnection';
import { Messages } from '@epicgames-ps/lib-pixelstreamingcommon-ue5.7';

function fixture(subscribed: boolean) {
    const disconnect = jest.fn();
    const connection = Object.assign(Object.create(SFUConnection.prototype), {
        streamerId: 'SFU', subscribers: new Set(['viewer'])
    }) as SFUConnection;
    const player = { subscribedStreamer: subscribed ? connection : {}, protocol: { disconnect } };
    Object.assign(connection, { server: { playerRegistry: { get: () => player } } });
    const request = (connection as unknown as { onDisconnectPlayerRequest(message: Messages.disconnectPlayer): void })
        .onDisconnectPlayerRequest.bind(connection);
    return { connection, request, disconnect };
}

test('SFU failure explicitly disconnects its affected subscriber', () => {
    const { request, disconnect } = fixture(true);
    request({ type: 'disconnectPlayer', playerId: 'viewer', reason: 'SFU negotiation failed' });
    expect(disconnect).toHaveBeenCalledWith(1011, 'SFU negotiation failed');
});

test('SFU cannot disconnect a player that has switched to another streamer', () => {
    const { request, disconnect } = fixture(false);
    request({ type: 'disconnectPlayer', playerId: 'viewer', reason: 'stale failure' });
    expect(disconnect).not.toHaveBeenCalled();
});

test('SFU cannot disconnect an unrelated player', () => {
    const { connection, request, disconnect } = fixture(true);
    connection.subscribers.clear();
    request({ type: 'disconnectPlayer', playerId: 'viewer', reason: 'unrelated' });
    expect(disconnect).not.toHaveBeenCalled();
});
