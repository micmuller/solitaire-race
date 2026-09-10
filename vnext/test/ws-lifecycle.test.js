'use strict';
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { WebSocket, WebSocketServer } = require('ws');
const { PROTOCOL_VERSION } = require('../core');

function event(emitter, name, predicate = () => true, ms = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Timeout: ${name}`)); }, ms);
    const listener = (...args) => { if (predicate(...args)) { cleanup(); resolve(args); } };
    function cleanup() { clearTimeout(timer); emitter.off(name, listener); }
    emitter.on(name, listener);
  });
}

for (const failure of ['fragments', 'invalid-utf8', 'transport-close']) {
  test(`real server isolates ${failure} and preserves other peers`, { timeout: 15000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'highnoon-ws-lifecycle-'));
    const sockets = [];
    let output = '';
    const child = fork(path.join(__dirname, '../test-support/ws-lifecycle-child.cjs'), [], {
      env: { ...process.env, VNEXT_TEST_DATABASE: path.join(directory, 'profiles.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const exit = once(child, 'exit');
    t.after(async () => {
      for (const socket of sockets) socket.terminate();
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      const forced = setTimeout(() => child.kill('SIGKILL'), 1500);
      await exit;
      clearTimeout(forced);
      fs.rmSync(directory, { recursive: true, force: true });
    });
    const [ready] = await event(child, 'message', m => m.type === 'ready');
    const base = `http://127.0.0.1:${ready.port}`;
    async function match(seed) {
      const response = await fetch(`${base}/vnext/matches`, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seed, mode: 'split' }) });
      assert.equal(response.status, 201);
      return (await response.json()).matchId;
    }
    async function connect(matchId, clientId, reconnect = false) {
      const socket = new WebSocket(`${base.replace('http:', 'ws:')}/vnext?matchId=${matchId}&clientId=${clientId}${reconnect ? '&reconnect=1' : ''}`);
      sockets.push(socket);
      socket.on('error', () => {}); // Client errors are expected; child has no global exception handler.
      const [data] = await event(socket, 'message');
      assert.equal(JSON.parse(data).kind, 'snapshot');
      return socket;
    }
    async function draw(socket, matchId, role, seq, rev) {
      const ack = event(socket, 'message', data => JSON.parse(data).kind === 'ack');
      socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, matchId,
        clientId: role, seq, baseRev: rev, kind: 'draw', payload: { source: { zone: 'stock', owner: role }, target: { zone: 'waste', owner: role } } }));
      const [data] = await ack;
      assert.equal(JSON.parse(data).rev, rev + 1);
    }
    const attacked = await match('LIFECYCLE-ATTACKED');
    const separate = await match('LIFECYCLE-UNRELATED');
    const bad = await connect(attacked, 'p1');
    const sameRoom = await connect(attacked, 'p2');
    const otherRoom = await connect(separate, 'p1');
    const closed = event(bad, 'close');
    const cleanup = event(child, 'message', m => m.type === 'peerClosed' && m.matchId === attacked && m.clientId === 'p1');
    // Capture this promise immediately; RED process may exit without peerClosed.
    cleanup.catch(() => {});
    if (failure === 'fragments') {
      const limit = new WebSocketServer({ noServer: true }).options.maxFragments;
      assert.equal(limit, 16384);
      for (let i = 0; i <= limit; i++) bad.send('', { fin: false });
    } else if (failure === 'invalid-utf8') bad.send(Buffer.from([0xff]), { binary: false });
    else bad.terminate();
    const [code] = await closed;
    if (failure !== 'transport-close') assert.equal(code, failure === 'fragments' ? 1008 : 1007);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(child.exitCode, null, `Server exited: ${child.exitCode}\n${output.slice(-2200)}`);
    assert.equal(child.signalCode, null);
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const [cleaned] = await cleanup;
    assert.equal(cleaned.messageListeners, 0, 'closed peer must release application message listener');
    await draw(otherRoom, separate, 'p1', 0, 0);
    await draw(sameRoom, attacked, 'p2', 0, 0);
    // No reconnect flag: proves errored peer released the seat.
    const fresh = await connect(attacked, 'p1');
    await draw(fresh, attacked, 'p1', 0, 1);
    // Old close must not unregister the replacement peer.
    const replacedClose = event(fresh, 'close');
    const replacement = await connect(attacked, 'p1', true);
    await replacedClose;
    await draw(replacement, attacked, 'p1', 1, 2);
    assert.equal((await fetch(`${base}/health`)).status, 200);
  });
}
