const assert = require('node:assert/strict');
const test = require('node:test');
const { mediasoupSpatialLayer, reverseVideoSimulcast } = require('./sfu_layers');

const OFFER = [
    'v=0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'a=ssrc:999 cname:audio',
    'm=video 9 UDP/TLS/RTP/SAVPF 96',
    'a=mid:1',
    'a=rid:h send',
    'a=rid:m send',
    'a=rid:q send',
    'a=simulcast:send h;m;q',
    'a=ssrc-group:FID 111 112',
    'a=ssrc:111 cname:video',
    'a=ssrc:112 cname:video',
    'a=ssrc-group:FID 221 222',
    'a=ssrc:221 cname:video',
    'a=ssrc:222 cname:video',
    'a=ssrc-group:FID 331 332',
    'a=ssrc:331 cname:video',
    'a=ssrc:332 cname:video',
    ''
].join('\r\n');

test('High maps to the last mediasoup layer and Low maps to the first', () => {
    assert.equal(mediasoupSpatialLayer(0, 3), 2);
    assert.equal(mediasoupSpatialLayer(1, 3), 1);
    assert.equal(mediasoupSpatialLayer(2, 3), 0);
    assert.equal(mediasoupSpatialLayer(0, 1), 0);
});

test('a largest-first simulcast offer becomes smallest-first', () => {
    const result = reverseVideoSimulcast(OFFER);
    assert.equal(result.reversed, true);
    assert.equal(result.layerCount, 3);
    const video = result.sdp.split('m=video')[1];
    assert.ok(video.indexOf('a=rid:q send') < video.indexOf('a=rid:m send'));
    assert.ok(video.indexOf('a=rid:m send') < video.indexOf('a=rid:h send'));
    assert.match(video, /a=simulcast:send q;m;h/);
    assert.ok(video.indexOf('a=ssrc:331 ') < video.indexOf('a=ssrc:221 '));
    assert.ok(video.indexOf('a=ssrc:221 ') < video.indexOf('a=ssrc:111 '));
    assert.match(result.sdp, /m=audio[\s\S]*a=ssrc:999 cname:audio/);
});

test('an Unreal offer with rids and no SSRC groups is reversed', () => {
    const sdp = [
        'm=video 9 UDP/TLS/RTP/SAVPF 127',
        'a=rid:simulcast0 send',
        'a=rid:simulcast1 send',
        'a=rid:simulcast2 send',
        'a=simulcast:send simulcast0;simulcast1;simulcast2',
        'm=audio 9 UDP/TLS/RTP/SAVPF 96',
        ''
    ].join('\r\n');
    const result = reverseVideoSimulcast(sdp);
    assert.equal(result.reversed, true);
    assert.equal(result.layerCount, 3);
    const video = result.sdp.split('m=audio')[0];
    assert.match(video, /a=simulcast:send simulcast2;simulcast1;simulcast0/);
    assert.ok(video.indexOf('a=rid:simulcast2 send') < video.indexOf('a=rid:simulcast0 send'));
});

test('a single-layer offer is left unchanged', () => {
    const sdp = 'm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rid:h send\r\n';
    const result = reverseVideoSimulcast(sdp);
    assert.equal(result.reversed, false);
    assert.equal(result.sdp, sdp);
});
