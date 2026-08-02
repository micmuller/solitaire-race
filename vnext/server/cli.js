#!/usr/bin/env node
'use strict';

const { createVNextServer } = require('./index');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const port = Number(option('--port', process.env.PORT || 3011));
const host = option('--host', process.env.HOST || '0.0.0.0');
const publicUrl = option('--public-url', process.env.PUBLIC_URL || '');
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('Invalid --port value');
  process.exit(1);
}

const app = createVNextServer({ publicUrl });
app.start({ port, host }).catch((error) => {
  console.error('[vNext] startup failed', error);
  process.exit(1);
});

async function shutdown(signal) {
  console.log(`[vNext] received ${signal}, shutting down`);
  await app.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
