'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ProfileStore, boundedOffset, tokenHash } = require('../server/profileStore');
const { createVNextServer } = require('../server');

const silentLogger = { log() {}, error() {} };

function temporaryDatabase(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'highnoon-profile-'));
  const databasePath = path.join(directory, 'profiles.sqlite');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return databasePath;
}

test('ProfileStore persists hashed sessions and authorizes nickname updates', (t) => {
  const databasePath = temporaryDatabase(t);
  let sequence = 0;
  const options = {
    databasePath,
    clock: () => '2026-09-06T12:00:00.000Z',
    idFactory: () => `id-${++sequence}`,
    tokenFactory: () => 'hs_test-token-with-enough-entropy-for-tests'
  };
  const first = new ProfileStore(options);
  assert.equal(first.database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 2);
  const opened = first.openSession({ nickname: '  Alice   HighNoon ' });
  assert.equal(opened.created, true);
  assert.equal(opened.player.nickname, 'Alice HighNoon');
  assert.equal(opened.player.sessionId, 'ps-id-2');
  const storedSession = first.database.prepare('SELECT token_hash FROM player_sessions').get();
  assert.equal(storedSession.token_hash, tokenHash(opened.sessionToken));
  assert.notEqual(storedSession.token_hash, opened.sessionToken);
  first.close();

  const reopened = new ProfileStore(options);
  const resumed = reopened.openSession({ sessionToken: opened.sessionToken, nickname: 'Ignored Rename' });
  assert.equal(resumed.created, false);
  assert.equal(resumed.player.playerId, opened.player.playerId);
  assert.equal(resumed.player.nickname, 'Alice HighNoon');
  assert.equal(reopened.updateNickname(opened.sessionToken, 'Alice Reloaded').nickname, 'Alice Reloaded');
  assert.throws(
    () => reopened.updateNickname('hs_invalid-token-value', 'Mallory'),
    (error) => error.statusCode === 401
  );
  reopened.close();
});

test('ProfileStore records authoritative results exactly once and ranks the leaderboard', (t) => {
  const store = new ProfileStore({ databasePath: temporaryDatabase(t) });
  t.after(() => store.close());
  const alice = store.openSession({ nickname: 'Alice' });
  const bob = store.openSession({ nickname: 'Bob' });
  const result = {
    resultId: 'mr-round-1',
    matchId: 'm-profile-test',
    seed: 'PROFILE-SEED',
    mode: 'shared',
    matchKind: 'human-vs-bot',
    endedReason: 'inactivity',
    winner: 'p1',
    endedAt: '2026-09-06T13:00:00.000Z',
    players: {
      p1: { playerId: alice.player.playerId, nickname: 'Alice', score: 42 },
      p2: { playerId: bob.player.playerId, nickname: 'Bob', score: 31 }
    }
  };
  assert.equal(store.recordMatch(result), true);
  assert.equal(store.recordMatch(result), false);
  assert.throws(
    () => store.recordMatch({ ...result, winner: 'p2' }),
    (error) => error.code === 'RESULT_ID_CONFLICT'
  );

  assert.deepEqual(store.playerById(alice.player.playerId).stats, {
    gamesPlayed: 1,
    gamesWon: 1,
    totalScore: 42,
    bestScore: 42,
    lastGameAt: result.endedAt
  });
  assert.equal(store.playerById(bob.player.playerId).stats.gamesWon, 0);
  assert.deepEqual(store.leaderboard(10).map((entry) => entry.nickname), ['Alice', 'Bob']);
  assert.deepEqual(store.leaderboard(1, 1).map((entry) => entry.nickname), ['Bob']);
  assert.equal(store.leaderboardCount(), 2);
  assert.equal(store.matchHistoryCount(alice.sessionToken), 1);
  assert.equal(boundedOffset('-1'), 0);
  assert.equal(boundedOffset('12'), 12);
  assert.deepEqual(store.matchHistory(alice.sessionToken, 10), [{
    resultId: result.resultId,
    matchId: result.matchId,
    seed: result.seed,
    mode: result.mode,
    matchKind: result.matchKind,
    endedReason: result.endedReason,
    winner: result.winner,
    seat: 'p1',
    score: 42,
    won: true,
    endedAt: result.endedAt
  }]);
});

test('profile HTTP API protects private reads and persists lobby results across restart', async (t) => {
  const databasePath = temporaryDatabase(t);
  const app = createVNextServer({ logger: silentLogger, profileDatabasePath: databasePath });
  const address = await app.start({ port: 0 });
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const profileSessionResponse = await fetch(`${baseUrl}/vnext/profiles/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'API Player' })
  });
  assert.equal(profileSessionResponse.status, 201);
  const profileSession = await profileSessionResponse.json();
  assert.match(profileSession.sessionToken, /^hs_/);
  const renamedResponse = await fetch(`${baseUrl}/vnext/profiles/me`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${profileSession.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ nickname: 'API Player Renamed' })
  });
  assert.equal(renamedResponse.status, 200);
  assert.equal((await renamedResponse.json()).player.nickname, 'API Player Renamed');

  const host = await fetch(`${baseUrl}/vnext/lobby/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'Persistent Host' })
  }).then((response) => response.json());
  const guest = await fetch(`${baseUrl}/vnext/lobby/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'Persistent Guest' })
  }).then((response) => response.json());
  assert.match(host.sessionToken, /^hs_/);
  assert.match(guest.sessionToken, /^hs_/);
  assert.doesNotMatch(JSON.stringify(host.player), /hs_/);
  assert.doesNotMatch(JSON.stringify(guest.player), /hs_/);
  const created = await fetch(`${baseUrl}/vnext/lobby/games`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${host.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Persistent Match',
      seed: 'PERSISTENT-SEED',
      mode: 'split'
    })
  }).then((response) => response.json());
  await fetch(`${baseUrl}/vnext/lobby/games/${created.game.gameId}/join`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${guest.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({})
  });
  const hostRename = await fetch(`${baseUrl}/vnext/profiles/me`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${host.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ nickname: 'Persistent Host Renamed' })
  });
  assert.equal(hostRename.status, 200);
  const gamesAfterRename = await fetch(`${baseUrl}/vnext/lobby/games`).then((response) => response.json());
  assert.equal(gamesAfterRename.games[0].players.p1.nickname, 'Persistent Host Renamed');
  assert.doesNotMatch(JSON.stringify(gamesAfterRename), /hs_/);
  app.lobby.markMatchFinished(created.matchId, {
    players: { p1: { score: 21 }, p2: { score: 13 } },
    winner: 'p1',
    endedReason: 'resign'
  });

  const unauthorized = await fetch(`${baseUrl}/vnext/profiles/me`);
  assert.equal(unauthorized.status, 401);
  const history = await fetch(`${baseUrl}/vnext/profiles/me/matches?limit=1&offset=0`, {
    headers: { authorization: `Bearer ${host.sessionToken}` }
  }).then((response) => response.json());
  assert.equal(history.matches.length, 1);
  assert.equal(history.matches[0].endedReason, 'resign');
  assert.deepEqual(history.page, { limit: 1, offset: 0, returned: 1, total: 1, hasMore: false });
  const leaderboard = await fetch(`${baseUrl}/vnext/leaderboard?limit=1&offset=1`).then((response) => response.json());
  assert.deepEqual(leaderboard.page, { limit: 1, offset: 1, returned: 1, total: 2, hasMore: false });
  assert.deepEqual(leaderboard.players.map((entry) => entry.nickname), ['Persistent Guest']);
  const fullLeaderboard = await fetch(`${baseUrl}/vnext/leaderboard`).then((response) => response.json());
  assert.deepEqual(fullLeaderboard.players.map((entry) => entry.nickname), ['Persistent Host Renamed', 'Persistent Guest']);
  await app.close();

  const restarted = createVNextServer({ logger: silentLogger, profileDatabasePath: databasePath });
  const restartedAddress = await restarted.start({ port: 0 });
  t.after(() => restarted.close());
  const profileResponse = await fetch(`http://127.0.0.1:${restartedAddress.port}/vnext/profiles/me`, {
    headers: { authorization: `Bearer ${host.sessionToken}` }
  });
  assert.equal(profileResponse.status, 200);
  const profile = await profileResponse.json();
  assert.equal(profile.player.playerId, host.player.playerId);
  assert.equal(profile.player.stats.gamesPlayed, 1);
  assert.equal(profile.player.stats.gamesWon, 1);
});
