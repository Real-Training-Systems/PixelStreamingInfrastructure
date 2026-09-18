const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function transport() {
    return { closed: false, on() {}, close() { this.closed = true; },
        async consume() { return { observer: { on() {} }, close() {}, kind: 'video' }; } };
}

function fixture(createTransport = async () => transport()) {
    const sent = [];
    const endpoints = [];
    const context = {
        console: { log() {}, error() {} },
        require(name) {
            if (name === './config') return { mediasoup: { webRtcTransport: {} } };
            if (name === 'ws') return { OPEN: 1 };
            if (name === '@epicgames-ps/mediasoup-sdp-bridge') return {
                createSdpEndpoint() {
                    const endpoint = { addConsumer() {}, createOffer() { return 'offer'; }, async processAnswer() {} };
                    endpoints.push(endpoint);
                    return endpoint;
                }
            };
            return {};
        }
    };
    vm.createContext(context);
    // Exercise the real handlers without starting a worker or opening sockets.
    const source = fs.readFileSync(path.join(__dirname, 'sfu_server.js'), 'utf8').replace(/main\(\);\s*$/, '');
    vm.runInContext(source + `\nthis.api = { onPeerConnected, onPeerDisconnected, onPeerAnswer, peers,
        initialize(source, router, socket) { streamer = source; mediasoupRouter = router; signalServer = socket; } };`, context);
    context.api.initialize({ producers: [{ id: 'video' }], dataEnabled: false },
        { createWebRtcTransport: createTransport, rtpCapabilities: {} },
        { readyState: 1, send(message) { sent.push(JSON.parse(message)); } });
    return { api: context.api, sent, endpoints };
}

test('an extra answer disconnects only the affected viewer', async () => {
    const { api, sent } = fixture();
    await api.onPeerConnected('affected');
    await api.onPeerConnected('survivor');
    await api.onPeerAnswer('affected', 'first');
    const affected = api.peers.get('affected');
    await api.onPeerAnswer('affected', 'second');
    assert.equal(affected.transport.closed, true);
    assert.equal(api.peers.has('affected'), false);
    assert.equal(api.peers.has('survivor'), true);
    assert.equal(sent.filter(m => m.type === 'disconnectPlayer').length, 1);
});

test('a disconnected pending transport cannot replace a new peer', async () => {
    const pending = deferred();
    let calls = 0;
    const { api, sent } = fixture(() => ++calls === 1 ? pending.promise : Promise.resolve(transport()));
    const obsolete = api.onPeerConnected('viewer');
    api.onPeerDisconnected('viewer');
    await api.onPeerConnected('viewer');
    const replacement = api.peers.get('viewer');
    const late = transport();
    pending.resolve(late);
    await obsolete;
    assert.equal(late.closed, true);
    assert.equal(api.peers.get('viewer'), replacement);
    assert.equal(sent.filter(m => m.type === 'offer').length, 1);
});

test('repeated connection notifications do not start parallel negotiations', async () => {
    const pending = deferred();
    let calls = 0;
    const { api, sent } = fixture(() => { calls++; return pending.promise; });
    const first = api.onPeerConnected('viewer');
    await api.onPeerConnected('viewer');
    pending.resolve(transport());
    await first;
    assert.equal(calls, 1);
    assert.equal(sent.filter(m => m.type === 'offer').length, 1);
});

test('late answer failure cannot disconnect a replacement peer', async () => {
    const { api, endpoints, sent } = fixture();
    await api.onPeerConnected('viewer');
    const pending = deferred();
    endpoints[0].processAnswer = () => pending.promise;
    const answer = api.onPeerAnswer('viewer', 'answer');
    api.onPeerDisconnected('viewer');
    await api.onPeerConnected('viewer');
    const replacement = api.peers.get('viewer');
    pending.reject(new Error('transport closed during answer'));
    await answer;
    assert.equal(api.peers.get('viewer'), replacement);
    assert.equal(sent.filter(m => m.type === 'disconnectPlayer').length, 0);
});
