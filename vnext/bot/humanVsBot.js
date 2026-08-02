#!/usr/bin/env node
'use strict';

const { runHumanVsBot } = require('./runner');
const { formatBotReport } = require('./format');

function readArgs(argv) {
  const options = {
    baseUrl: 'http://127.0.0.1:3011',
    seed: 'BOT-HUMAN-001',
    mode: 'split',
    clientId: 'p2',
    speed: 'normal',
    maxActions: 200
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base-url') options.baseUrl = argv[++index];
    else if (arg === '--match-id') options.matchId = argv[++index];
    else if (arg === '--seed') options.seed = argv[++index];
    else if (arg === '--mode') options.mode = argv[++index];
    else if (arg === '--client-id') options.clientId = argv[++index];
    else if (arg === '--speed') options.speed = argv[++index];
    else if (arg === '--max-actions') options.maxActions = Number(argv[++index]);
    else if (arg === '--json') options.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const options = readArgs(process.argv.slice(2));
runHumanVsBot(options).then((report) => {
  console.log(options.json ? JSON.stringify(report, null, 2) : formatBotReport(report));
}).catch((error) => {
  const hint = /409/.test(error.message)
    ? ' Tipp: Diese Spielerrolle ist vermutlich schon verbunden. Fuer Web-Spiele den Button "Match mit Bot" verwenden.'
    : '';
  console.error(`[bot] FAIL: ${error.message}${hint}`);
  process.exit(1);
});
