#!/usr/bin/env node
'use strict';

const { runBotVsBot } = require('./runner');

function readArgs(argv) {
  const options = {
    baseUrl: 'http://127.0.0.1:3011',
    seed: 'BOT-VS-BOT-001',
    mode: 'split',
    speed: 'fast',
    maxActions: 200
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base-url') options.baseUrl = argv[++index];
    else if (arg === '--seed') options.seed = argv[++index];
    else if (arg === '--mode') options.mode = argv[++index];
    else if (arg === '--speed') options.speed = argv[++index];
    else if (arg === '--max-actions') options.maxActions = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

runBotVsBot(readArgs(process.argv.slice(2))).then((report) => {
  console.log(JSON.stringify(report, null, 2));
}).catch((error) => {
  console.error(`[bot] FAIL: ${error.message}`);
  process.exit(1);
});
