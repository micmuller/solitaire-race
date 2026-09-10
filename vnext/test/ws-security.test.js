'use strict';
const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const { Receiver, WebSocketServer } = require('ws');

// Bounded parser regression, not a memory-exhaustion load test. The options
// match the defaults used by createVNextServer({ noServer: true }).
function receiver() {
  const server = new WebSocketServer({ noServer: true });
  const { maxFragments, maxBufferedChunks } = server.options;
  assert.ok(maxFragments > 0 && maxFragments <= 16384);
  assert.ok(maxBufferedChunks > 0);
  return { stream: new Receiver({ isServer: true, maxFragments, maxBufferedChunks }), maxFragments };
}
function emptyFrame(opcode, fin = false) {
  return Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80, 0, 0, 0, 0]);
}

test('ws rejects excessive empty fragments with production defaults', async () => {
  const { stream, maxFragments } = receiver();
  const failed = once(stream, 'error');
  const frames = [emptyFrame(1)];
  for (let i = 0; i < maxFragments; i++) frames.push(emptyFrame(0));
  stream.write(Buffer.concat(frames));
  const [error] = await failed;
  assert.equal(error.code, 'WS_ERR_TOO_MANY_BUFFERED_PARTS');
  assert.match(error.message, /fragments/i);
  stream.destroy();
});

test('ws resets fragment budget between completed messages', () => {
  const { stream, maxFragments } = receiver();
  let messages = 0;
  stream.on('message', () => messages++);
  stream.on('error', error => assert.fail(error));
  // Total frame count exceeds the budget, each individual message does not.
  for (let i = 0; i <= maxFragments; i++) {
    stream.write(Buffer.concat([emptyFrame(1), emptyFrame(0, true)]));
  }
  assert.equal(messages, maxFragments + 1);
  stream.destroy();
});
