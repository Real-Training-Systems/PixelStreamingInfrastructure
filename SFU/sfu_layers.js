// Unreal sends simulcast largest-first: the first rid is 1920x1080, and the
// player calls that spatial layer 0 ("High"). mediasoup only steps down toward
// a lower index, and it requires the first encoding to be the smallest picture.
// Reverse the video section before the producer is created, then translate the
// player's layer index into that order.

function mediasoupSpatialLayer(epicLayer, layerCount) {
    if (!Number.isInteger(epicLayer) || !Number.isInteger(layerCount) || layerCount < 2) {
        return epicLayer;
    }
    if (epicLayer < 0 || epicLayer >= layerCount) {
        return epicLayer;
    }
    return layerCount - 1 - epicLayer;
}

function reverseSendList(list) {
    const separator = list.includes(';') ? ';' : ',';
    return list.split(separator).reverse().join(separator);
}

function reverseSimulcastLine(line) {
    return line.replace(/send (\S+)/, (_, list) => `send ${reverseSendList(list)}`);
}

function videoSection(lines) {
    const start = lines.findIndex((line) => line.startsWith('m=video'));
    if (start < 0) return null;
    let end = lines.findIndex((line, index) => index > start && line.startsWith('m='));
    if (end < 0) end = lines.length;
    return { start, end };
}

function fidBlocks(section) {
    const blocks = [];
    let index = 0;
    while (index < section.length) {
        if (!section[index].startsWith('a=ssrc-group:FID')) {
            index += 1;
            continue;
        }
        const start = index;
        index += 1;
        while (index < section.length && section[index].startsWith('a=ssrc:')) {
            index += 1;
        }
        blocks.push({ start, end: index, lines: section.slice(start, index) });
    }
    return blocks;
}

function blocksAreContiguous(blocks) {
    for (let index = 1; index < blocks.length; index += 1) {
        if (blocks[index].start !== blocks[index - 1].end) return false;
    }
    return true;
}

function reverseVideoSimulcast(sdp) {
    const unchanged = { sdp, reversed: false, layerCount: 1 };
    if (!sdp || !sdp.includes('a=rid:')) return unchanged;

    const newline = sdp.includes('\r\n') ? '\r\n' : '\n';
    const lines = sdp.split(/\r?\n/);
    const trailingNewline = sdp.endsWith('\n');
    const sectionRange = videoSection(lines);
    if (!sectionRange) return unchanged;

    const section = lines.slice(sectionRange.start, sectionRange.end);
    const ridIndexes = [];
    section.forEach((line, index) => {
        if (/^a=rid:\S+ send\b/.test(line)) ridIndexes.push(index);
    });
    if (ridIndexes.length < 2) return unchanged;

    // Unreal's simulcast offer lists a=rid lines and no a=ssrc-group:FID blocks.
    // Reverse those rids on their own. When FID groups are present they have to
    // move with the rids, and a mismatched set is left unchanged.
    const blocks = fidBlocks(section);
    if (blocks.length > 0 && (blocks.length !== ridIndexes.length || !blocksAreContiguous(blocks))) {
        return unchanged;
    }

    const reversedRids = ridIndexes.map((index) => section[index]).reverse();
    reversedRids.forEach((line, index) => {
        section[ridIndexes[index]] = line;
    });

    const simulcastIndex = section.findIndex((line) => line.startsWith('a=simulcast:'));
    if (simulcastIndex >= 0) {
        section[simulcastIndex] = reverseSimulcastLine(section[simulcastIndex]);
    }

    if (blocks.length > 0) {
        const spanStart = blocks[0].start;
        const spanEnd = blocks[blocks.length - 1].end;
        const reversedBlocks = blocks.slice().reverse().flatMap((block) => block.lines);
        section.splice(spanStart, spanEnd - spanStart, ...reversedBlocks);
    }

    const next = lines.slice(0, sectionRange.start).concat(section, lines.slice(sectionRange.end));
    let rewritten = next.join(newline);
    if (trailingNewline && !rewritten.endsWith(newline)) rewritten += newline;
    return { sdp: rewritten, reversed: true, layerCount: ridIndexes.length };
}

module.exports = {
    mediasoupSpatialLayer,
    reverseVideoSimulcast
};
