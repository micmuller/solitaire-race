'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

let mapping;
let effects;
let lobby;
let protocolClient;
let seed;
let version;
test.before(async () => {
  mapping = await import('../web/intent-mapping.mjs');
  effects = await import('../web/effects.mjs');
  lobby = await import('../web/lobby.mjs');
  protocolClient = await import('../web/protocol-client.mjs');
  seed = await import('../web/seed.mjs');
  version = await import('../web/version.mjs');
});

const cards = [
  { cardId: 'd0:S:9', faceDown: false },
  { cardId: 'd0:H:8', faceDown: false },
  { cardId: 'd0:C:7', faceDown: false }
];

test('waste selection maps only the accessible top card', () => {
  assert.deepEqual(mapping.wasteSelection('p1', cards), {
    source: { zone: 'waste', owner: 'p1' },
    count: 1,
    cardIds: ['d0:C:7']
  });
  assert.equal(mapping.wasteSelection('p1', []), null);
});

test('tableau selection maps the selected suffix without evaluating rules', () => {
  assert.deepEqual(mapping.tableauSelection('p2', 4, 1, cards), {
    source: { zone: 'tableau', owner: 'p2', index: 4 },
    count: 2,
    cardIds: ['d0:H:8', 'd0:C:7']
  });
});

test('drag source maps to the same waste and tableau selections', () => {
  assert.deepEqual(mapping.dragSelection('p1', { zone: 'waste', cards }), {
    source: { zone: 'waste', owner: 'p1' },
    count: 1,
    cardIds: ['d0:C:7']
  });
  assert.deepEqual(mapping.dragSelection('p1', { zone: 'tableau', index: 3, cardIndex: 1, cards }), {
    source: { zone: 'tableau', owner: 'p1', index: 3 },
    count: 2,
    cardIds: ['d0:H:8', 'd0:C:7']
  });
});

test('drag source rejects face-down tableau cards', () => {
  const blocked = [{ cardId: 'd0:S:9', faceDown: true }, ...cards.slice(1)];
  assert.equal(mapping.dragSelection('p1', { zone: 'tableau', index: 0, cardIndex: 0, cards: blocked }), null);
});

test('selected source maps to structured tableau and foundation intents', () => {
  const selection = mapping.tableauSelection('p1', 2, 1, cards);
  assert.deepEqual(mapping.tableauIntent(selection, 'p1', 5), {
    kind: 'tableauMove',
    payload: {
      source: { zone: 'tableau', owner: 'p1', index: 2 },
      target: { zone: 'tableau', owner: 'p1', index: 5 },
      count: 2
    }
  });
  assert.deepEqual(mapping.foundationIntent(selection, 7), {
    kind: 'foundationMove',
    payload: {
      source: { zone: 'tableau', owner: 'p1', index: 2 },
      target: { zone: 'foundation', owner: 'global', index: 7 }
    }
  });
});

test('auto foundation intent chooses the currently legal suit lane', () => {
  const selection = mapping.wasteSelection('p1', [
    { cardId: 'd0:H:02', suit: 'H', rank: 2, faceDown: false }
  ]);
  const foundations = [
    { suit: 'C', cards: [] },
    { suit: 'C', cards: [] },
    { suit: 'D', cards: [] },
    { suit: 'D', cards: [] },
    { suit: 'H', cards: [{ cardId: 'd0:H:01', suit: 'H', rank: 1, faceDown: false }] },
    { suit: 'H', cards: [] },
    { suit: 'S', cards: [] },
    { suit: 'S', cards: [] }
  ];
  assert.equal(mapping.legalFoundationIndexForCard(foundations, { suit: 'H', rank: 2, faceDown: false }), 4);
  assert.deepEqual(mapping.autoFoundationIntent(selection, foundations, { suit: 'H', rank: 2, faceDown: false }), {
    kind: 'foundationMove',
    payload: {
      source: { zone: 'waste', owner: 'p1' },
      target: { zone: 'foundation', owner: 'global', index: 4 }
    }
  });
  assert.equal(mapping.autoFoundationIntent(selection, foundations, { suit: 'H', rank: 3, faceDown: false }), null);
});

test('drop target maps to the existing move intents', () => {
  const selection = mapping.tableauSelection('p1', 2, 1, cards);
  assert.deepEqual(mapping.dropIntent(selection, 'p1', { zone: 'tableau', index: 6 }), {
    kind: 'tableauMove',
    payload: {
      source: { zone: 'tableau', owner: 'p1', index: 2 },
      target: { zone: 'tableau', owner: 'p1', index: 6 },
      count: 2
    }
  });
  assert.deepEqual(mapping.dropIntent(selection, 'p1', { zone: 'foundation', index: 4 }), {
    kind: 'foundationMove',
    payload: {
      source: { zone: 'tableau', owner: 'p1', index: 2 },
      target: { zone: 'foundation', owner: 'global', index: 4 }
    }
  });
  assert.equal(mapping.dropIntent(selection, 'p1', { zone: 'stock', index: 0 }), null);
});

test('authoritative responses map to non-optimistic effect cues', () => {
  assert.equal(effects.cueForIntentResult('draw', { kind: 'ack' }), 'draw');
  assert.equal(effects.cueForIntentResult('recycle', { kind: 'ack' }), 'draw');
  assert.equal(effects.cueForIntentResult('tableauMove', { kind: 'ack' }), 'move');
  assert.equal(effects.cueForIntentResult('flip', { kind: 'ack' }), 'move');
  assert.equal(effects.cueForIntentResult('foundationMove', { kind: 'ack' }), 'foundation');
  assert.equal(effects.cueForIntentResult('tableauMove', { kind: 'reject', code: 'RULE_VIOLATION' }), 'invalid');
  assert.equal(effects.cueForIntentResult('draw', { kind: 'snapshot', reason: 'OUT_OF_SYNC' }), 'sync');
  assert.equal(effects.cueForIntentResult('draw', { kind: 'snapshot', reason: 'INITIAL_CONNECT' }), null);
});

test('browser protocol client emits restart response before restart state', () => {
  const client = new protocolClient.ProtocolClient({
    baseUrl: 'http://example.test',
    matchId: 'm-restart',
    clientId: 'p2'
  });
  const events = [];
  client.current = { rev: 2, stateHash: 'old-hash', state: { seed: 'OLD', status: 'finished' } };
  client.subscribe((event) => {
    if (event.type === 'response') events.push(`${event.type}:${event.response.reason || event.response.kind}`);
    if (event.type === 'state') events.push(`${event.type}:${event.current.state.seed}`);
  });
  client.handle({
    kind: 'snapshot',
    matchId: 'm-restart',
    protocolVersion: protocolClient.PROTOCOL_VERSION,
    reason: 'RESTART',
    rev: 0,
    stateHash: 'new-hash',
    state: { seed: 'NEW', mode: 'split', status: 'active' }
  });
  assert.deepEqual(events, ['response:RESTART', 'state:NEW']);
  assert.equal(client.nextSeq, 0);
  assert.equal(client.current.rev, 0);
});

test('lobby urls encode host and invite identities', () => {
  assert.deepEqual(lobby.readLaunchParams('?matchId=m-123&role=p2'), { matchId: 'm-123', role: 'p2' });
  assert.deepEqual(lobby.readLaunchParams('?matchId=m-123&role=observer'), { matchId: 'm-123', role: 'observer' });
  assert.deepEqual(lobby.readLaunchParams('?match=m-123&role=P1'), { matchId: 'm-123', role: 'p1' });
  assert.equal(lobby.readLaunchParams('?matchId=m-123&role=p3'), null);
  assert.equal(lobby.matchUrl({
    origin: 'https://example.test',
    pathname: '/vnext/web/',
    matchId: 'm-123',
    role: 'observer'
  }), 'https://example.test/vnext/web/?matchId=m-123&role=observer');
  assert.equal(lobby.matchUrl({
    origin: 'https://example.test',
    pathname: '/vnext/web/',
    matchId: 'm-123',
    role: 'p1'
  }), 'https://example.test/vnext/web/?matchId=m-123&role=p1');
  assert.equal(lobby.inviteUrl({
    origin: 'https://example.test',
    pathname: '/vnext/web/',
    matchId: 'm-123'
  }), 'https://example.test/vnext/web/?matchId=m-123&role=p2');
});

test('web client version is exposed for the header menu', () => {
  assert.equal(version.WEB_CLIENT_VERSION, '1.0.5');
  assert.deepEqual(version.labelsFromConfig({
    serverVersion: '1.1.0-alpha.16',
    protocolVersion: '2.5.2'
  }), {
    serverVersion: '1.1.0-alpha.16',
    protocolVersion: '2.5.2',
    webClientVersion: '1.0.5'
  });
  assert.equal(version.labelsFromConfig({ appVersion: '1.1.0-alpha.16' }).serverVersion, '1.1.0-alpha.16');
});

test('version menu toggles open and closed from the badge state', () => {
  const menu = { hidden: true };
  const badge = {
    value: null,
    setAttribute(name, value) {
      assert.equal(name, 'aria-expanded');
      this.value = value;
    }
  };

  version.toggleVersionMenu(menu, badge);
  assert.equal(menu.hidden, false);
  assert.equal(badge.value, 'true');

  version.toggleVersionMenu(menu, badge);
  assert.equal(menu.hidden, true);
  assert.equal(badge.value, 'false');
});

test('random seed generator creates stable readable seed format', () => {
  assert.equal(seed.generateRandomSeed(1722500000000, () => 0.5), 'HN-LZB00Y68-ZIK0ZK');
  assert.match(seed.generateRandomSeed(), /^HN-[0-9A-Z]+-[0-9A-Z]{6,}$/);
});
