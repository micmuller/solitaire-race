'use strict';

const { ProtocolClient } = require('../client/protocolClient');
const { BotActor, speedDelay } = require('./runner');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createManagedBot({ baseUrl, matchId, clientId = 'p2', speed = 'normal', maxActions = 1000, logger = console }) {
  const client = new ProtocolClient({ baseUrl, matchId, clientId });
  const actor = new BotActor({ client });
  const startedAt = new Date().toISOString();
  const report = { matchId, clientId, speed, maxActions, startedAt, status: 'starting', actionCount: 0 };
  let stopped = false;

  async function run() {
    try {
      await client.connect();
      report.status = 'running';
      for (let actionCount = 0; actionCount < maxActions && !stopped && !actor.noCandidate; actionCount += 1) {
        const delay = speedDelay(speed, actionCount, clientId);
        if (delay > 0) await sleep(delay);
        if (stopped) break;
        const result = await actor.step();
        report.actionCount = actionCount + 1;
        report.lastResult = result.status;
        report.finalRev = client.current?.rev;
        report.finalStateHash = client.current?.stateHash;
      }
      report.status = stopped ? 'stopped' : actor.noCandidate ? 'no-candidate' : 'max-actions';
    } catch (error) {
      report.status = 'failed';
      report.error = error.message;
      logger.error?.(`[bot] managed bot failed matchId=${matchId} clientId=${clientId}: ${error.message}`);
    } finally {
      client.close();
      report.finishedAt = new Date().toISOString();
      report.bot = actor.report();
    }
  }

  const done = run();
  return {
    clientId,
    done,
    report,
    stop() {
      stopped = true;
      client.close();
    }
  };
}

module.exports = { createManagedBot };
