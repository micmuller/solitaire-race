#!/usr/bin/env node
'use strict';

const { createVNextServer } = require('./index');
const { acquireDatabaseLock } = require('./databaseLock');
const path = require('node:path');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const port = Number(option('--port', process.env.PORT || 3011));
const host = option('--host', process.env.HOST || '0.0.0.0');
const publicUrl = option('--public-url', process.env.PUBLIC_URL || '');
const profileDatabasePath = option(
  '--profile-database',
  process.env.VNEXT_PROFILE_DATABASE || path.join(__dirname, '..', 'data', 'highnoon.sqlite')
);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('Invalid --port value');
  process.exit(1);
}

let releaseDatabaseLock;
try {
  releaseDatabaseLock = acquireDatabaseLock(profileDatabasePath, 'vNext server');
} catch (error) {
  console.error(`[vNext] startup failed: ${error.message}`);
  process.exit(1);
}
process.on('exit', () => releaseDatabaseLock?.());

const app = createVNextServer({ publicUrl, profileDatabasePath });
app.start({ port, host }).catch((error) => {
  releaseDatabaseLock?.();
  console.error('[vNext] startup failed', error);
  process.exit(1);
});

let shutdownPromise;
async function shutdown(signal) {
  if (shutdownPromise) return shutdownPromise;
  console.log(`[vNext] received ${signal}, shutting down`);
  shutdownPromise = (async () => {
    await app.close();
    releaseDatabaseLock?.();
    process.exit(0);
  })();
  return shutdownPromise;
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
